"""Turn a floor-plan label mask into a rooms-only ArchLang Plan JSON (experimental).

A label mask is a PNG whose pixel values are class ids (a palette or greyscale image; a model's
segmentation output saved losslessly). A classes file names them:

    {"background": [0], "wall": [1],
     "rooms": {"2": "Living", "3": "Bedroom", "4": "Bath"}}

Every connected region (4-connected) of a room class becomes one room. The labels are snapped to
the plan grid (each grid cell takes its most frequent label), then each region is grown into the
wall cells around it by half the wall thickness, first along rows and then along columns, so
neighbouring rooms meet on the wall's centre line and the outer rooms reach the exterior wall's
centre line: that is where ArchLang's `walls from rooms` puts the walls it derives. The grown
regions are cut into rectangles, because `walls from rooms` derives walls only between them; a region
that is not one rectangle becomes several rooms joined by `open between` clauses, so it still
reads as one space. The output is Plan JSON with `rooms` and `walls_from_rooms` only: no doors,
windows, openings or furniture are recovered.

Run with an isolated interpreter (`python -I`). Dependencies: numpy, scipy, Pillow.

    python -I mask_to_plan.py mask.png classes.json --mm-per-px 10 -o plan.json \
        [--grid 50] [--exterior 200] [--partition 100] [--min-area-m2 0.5] [--areas areas.json]

`--areas` also writes, per region, the mask's own floor area (its room pixels before any growth,
times the pixel area) and the ids of the rooms it became, for checking the result against
`describe` (`check_areas.mjs`).
"""

from __future__ import annotations

import argparse
import json
import re
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def load_mask(path: str) -> np.ndarray:
    img = Image.open(path)
    if img.mode not in ("P", "L", "I", "I;16"):
        sys.exit(f"{path}: a label mask must be a palette or greyscale PNG (got mode {img.mode})")
    return np.asarray(img).astype(np.int32)


def slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s if s and not s[0].isdigit() else f"r_{s}"


def grow(cells: np.ndarray, reach: int, band: int) -> np.ndarray:
    """Grow the regions (cells > 0) across the walls (cells == -1), first along rows, then along
    columns from what the rows gave, so a corner is filled square. Only a run of wall cells at
    most `band` long is crossed (a longer run lies along a wall, not across it): with a region on
    both sides it is split at its middle (a tie goes to the lower side), with one on one side
    only (the exterior wall) that region takes the `reach` cells next to it."""
    out = cells.copy()
    for axis in (1, 0):
        lines = out if axis == 1 else out.T
        result = lines.copy()
        for li, line in enumerate(lines):
            n = len(line)
            k = 0
            while k < n:
                if line[k] != -1:
                    k += 1
                    continue
                k0 = k
                while k < n and line[k] == -1:
                    k += 1
                if k - k0 > band:
                    continue
                lo = line[k0 - 1] if k0 > 0 and line[k0 - 1] > 0 else 0
                hi = line[k] if k < n and line[k] > 0 else 0
                if lo and hi:
                    mid = k0 + (k - k0 + 1) // 2
                    result[li, k0:mid] = lo
                    result[li, mid:k] = hi
                elif lo:
                    result[li, k0 : min(k, k0 + reach)] = lo
                elif hi:
                    result[li, max(k0, k - reach) : k] = hi
        out = result if axis == 1 else result.T
    out[out < 0] = 0
    return out


def snap(labels: np.ndarray, cell: int) -> np.ndarray:
    """The most frequent label of each `cell` x `cell` block; a tie goes to the smaller label, so
    the result never depends on scan order."""
    h, w = labels.shape
    gh, gw = -(-h // cell), -(-w // cell)
    padded = np.zeros((gh * cell, gw * cell), dtype=labels.dtype)
    padded[:h, :w] = labels
    blocks = padded.reshape(gh, cell, gw, cell)
    values = np.unique(padded)
    counts = np.stack([(blocks == v).sum(axis=(1, 3)) for v in values])
    return values[np.argmax(counts, axis=0)]


def rectangles(cells: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Cut a boolean cell set into rectangles (x0, y0, x1, y1), exclusive ends: maximal runs per
    row, merged downwards while a run of the same span continues. Deterministic."""
    open_runs: dict[tuple[int, int], int] = {}
    out: list[tuple[int, int, int, int]] = []
    h, w = cells.shape
    for y in range(h + 1):
        runs: set[tuple[int, int]] = set()
        if y < h:
            x = 0
            while x < w:
                if cells[y, x]:
                    x0 = x
                    while x < w and cells[y, x]:
                        x += 1
                    runs.add((x0, x))
                else:
                    x += 1
        for span in sorted(open_runs):
            if span not in runs:
                out.append((span[0], open_runs.pop(span), span[1], y))
        for span in sorted(runs):
            open_runs.setdefault(span, y)
    return sorted(out, key=lambda r: (r[1], r[0]))


def touching(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    """Do two rectangles share an edge of positive length?"""
    if a[2] == b[0] or b[2] == a[0]:
        return min(a[3], b[3]) > max(a[1], b[1])
    if a[3] == b[1] or b[3] == a[1]:
        return min(a[2], b[2]) > max(a[0], b[0])
    return False


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("mask")
    ap.add_argument("classes")
    ap.add_argument("--mm-per-px", type=float, required=True)
    ap.add_argument("--grid", type=int, default=50, help="snap grid in mm (a multiple of the pixel size)")
    ap.add_argument("--exterior", type=int, default=200, help="exterior wall thickness in mm")
    ap.add_argument("--partition", type=int, default=100, help="partition thickness in mm")
    ap.add_argument("--min-area-m2", type=float, default=0.5, help="drop room regions smaller than this")
    ap.add_argument("--name", default="Imported plan")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--areas", help="also write each region's mask area and its room ids here")
    a = ap.parse_args()

    cell = a.grid / a.mm_per_px
    if cell < 1 or abs(cell - round(cell)) > 1e-9:
        sys.exit("--grid must be a whole multiple of --mm-per-px")
    cell = int(round(cell))

    mask = load_mask(a.mask)
    with open(a.classes, encoding="utf-8") as f:
        classes = json.load(f)
    room_classes = {int(k): v for k, v in classes["rooms"].items()}
    wall = np.isin(mask, [int(v) for v in classes.get("wall", [])])

    px_m2 = (a.mm_per_px / 1000) ** 2
    regions = np.zeros(mask.shape, dtype=np.int32)
    info: list[dict] = []
    for cid in sorted(room_classes):
        lab, n = ndimage.label(mask == cid)
        for k in range(1, n + 1):
            sel = lab == k
            area = float(sel.sum()) * px_m2
            if area < a.min_area_m2:
                continue
            info.append({"class": cid, "label": room_classes[cid], "mask_area_m2": round(area, 4)})
            regions[sel] = len(info)

    regions[wall & (regions == 0)] = -1
    half = max(a.exterior, a.partition) / 2
    if half % a.grid:
        sys.exit("half of each wall thickness must be a whole number of --grid steps")
    grid = grow(snap(regions, cell), int(half // a.grid), -(-max(a.exterior, a.partition) // a.grid))

    # Translate so the building's top-left grid cell is the origin.
    ys, xs = np.nonzero(grid)
    if len(xs) == 0:
        sys.exit("no room region survived (check the classes file and --min-area-m2)")
    oy, ox = int(ys.min()), int(xs.min())

    used: dict[str, int] = {}
    rooms: list[dict] = []
    opens: list[dict] = []
    areas: list[dict] = []
    for idx, reg in enumerate(info, start=1):
        rects = rectangles(grid == idx)
        if not rects:
            continue
        base = slug(reg["label"])
        used[base] = used.get(base, 0) + 1
        rid = base if used[base] == 1 else f"{base}_{used[base]}"
        ids = [rid] if len(rects) == 1 else [f"{rid}_{chr(97 + i)}" for i in range(len(rects))]
        for i, (x0, y0, x1, y1) in enumerate(rects):
            room = {
                "id": ids[i],
                "x": (x0 - ox) * a.grid,
                "y": (y0 - oy) * a.grid,
                "width": (x1 - x0) * a.grid,
                "height": (y1 - y0) * a.grid,
            }
            # One label per space: on its largest part.
            if i == max(range(len(rects)), key=lambda j: (rects[j][2] - rects[j][0]) * (rects[j][3] - rects[j][1])):
                room["label"] = reg["label"]
            rooms.append(room)
        # Join the parts of one region along a spanning tree of touching pairs.
        joined = {0}
        while len(joined) < len(rects):
            pair = next(
                ((i, j) for i in sorted(joined) for j in range(len(rects)) if j not in joined and touching(rects[i], rects[j])),
                None,
            )
            if pair is None:
                break
            opens.append({"between": [ids[pair[0]], ids[pair[1]]]})
            joined.add(pair[1])
        areas.append({"label": reg["label"], "mask_area_m2": reg["mask_area_m2"], "rooms": ids})

    plan = {
        "version": 1,
        "plan": a.name,
        "units": "mm",
        "rooms": rooms,
        "walls": [],
        "walls_from_rooms": {"exterior": a.exterior, "partition": a.partition, **({"open": opens} if opens else {})},
        "openings": [],
        "furniture": [],
    }
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(plan, f, indent=2)
        f.write("\n")
    if a.areas:
        with open(a.areas, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"mm_per_px": a.mm_per_px, "regions": areas}, f, indent=2)
            f.write("\n")
    print(f"{len(areas)} regions, {len(rooms)} rooms -> {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
