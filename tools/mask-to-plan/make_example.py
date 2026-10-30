"""Draw the worked example's label mask (`example/mask.png`) from a known layout.

The layout is written on wall centre lines, in millimetres, the way an `.arch` plan is; the mask
is what a segmentation model would output for it at 10 mm per pixel: each room's floor (its
rectangle less half the wall on every walled side) in the room's class, the walls in class 1,
the outside in class 0. An L-shaped living room is two rectangles of one class with no wall
between them. Deterministic: run it twice and the PNG is byte-identical.

    python -I make_example.py example/mask.png
"""

from __future__ import annotations

import sys

import numpy as np
from PIL import Image

MM_PER_PX = 10
MARGIN_MM = 500
EXTERIOR_MM = 200
PARTITION_MM = 100

# class id -> (label, rectangles on centre lines: x0, y0, x1, y1 in mm). A class with several
# rectangles that touch is ONE room; rectangles that do not touch are separate rooms of a class.
LAYOUT = {
    2: ("Living", [(0, 0, 6000, 4000), (0, 4000, 3000, 7000)]),
    3: ("Kitchen", [(6000, 0, 9000, 4000)]),
    4: ("Hall", [(3000, 4000, 4500, 7000)]),
    5: ("Bedroom", [(4500, 4000, 7000, 7000), (7000, 5500, 9000, 7000)]),
    6: ("Bath", [(7000, 4000, 9000, 5500)]),
}
# Which rectangles of a class form one room (indices into its list); the others stand alone.
ONE_ROOM = {2: [0, 1]}


def main(out: str) -> None:
    w_mm = 9000 + 2 * MARGIN_MM
    h_mm = 7000 + 2 * MARGIN_MM
    w, h = w_mm // MM_PER_PX, h_mm // MM_PER_PX
    # Pixel centres in plan millimetres.
    xs = (np.arange(w) + 0.5) * MM_PER_PX - MARGIN_MM
    ys = (np.arange(h) + 0.5) * MM_PER_PX - MARGIN_MM
    X, Y = np.meshgrid(xs, ys)

    # Which rectangle each pixel centre lies in (its "space"), on centre lines.
    space = np.zeros((h, w), dtype=np.int32)
    rects: list[tuple[int, tuple[int, int, int, int], int]] = []  # (class, rect, space id)
    for cid, (_, rs) in LAYOUT.items():
        group = ONE_ROOM.get(cid, [])
        for i, r in enumerate(rs):
            sid = len(rects) + 1 if i not in group or i == group[0] else next(s for c, _, s in rects if c == cid)
            rects.append((cid, r, sid))
    for _, (x0, y0, x1, y1), sid in rects:
        space[(X >= x0) & (X < x1) & (Y >= y0) & (Y < y1)] = sid

    def sid_at(x: float, y: float) -> int:
        i, j = int((x + MARGIN_MM) // MM_PER_PX), int((y + MARGIN_MM) // MM_PER_PX)
        return int(space[j, i]) if 0 <= i < w and 0 <= j < h else 0

    mask = np.zeros((h, w), dtype=np.uint8)
    building = space > 0
    # Walls: every pixel within half the exterior wall of the building's outline, outside included.
    outside = ~building
    from scipy import ndimage

    d_out = ndimage.distance_transform_edt(outside) * MM_PER_PX
    mask[outside & (d_out <= EXTERIOR_MM / 2)] = 1
    for cid, (x0, y0, x1, y1), sid in rects:
        inside = (X >= x0) & (X < x1) & (Y >= y0) & (Y < y1)
        floor = inside.copy()
        # Each side: no wall towards the same space, a partition towards another, else exterior.
        for side, dist in (
            ("left", X - x0),
            ("right", x1 - X),
            ("top", Y - y0),
            ("bottom", y1 - Y),
        ):
            # The neighbour across this side, sampled along the side at each pixel's row/column.
            if side in ("left", "right"):
                xn = x0 - 1 if side == "left" else x1 + 1
                nb = np.array([sid_at(xn, y) for y in ys])[:, None]
            else:
                yn = y0 - 1 if side == "top" else y1 + 1
                nb = np.array([sid_at(x, yn) for x in xs])[None, :]
            half = np.where(nb == sid, 0, np.where(nb == 0, EXTERIOR_MM / 2, PARTITION_MM / 2))
            floor &= dist >= half
        mask[floor] = cid
        mask[inside & ~floor] = 1
    Image.fromarray(mask, mode="L").save(out, optimize=True)
    print(f"{w}x{h} px at {MM_PER_PX} mm/px -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1])
