"""Read ArchLang's DXF with an independent reader, ezdxf, run isolated: `python -I dxf_check.py <manifest.json>`.

`scripts/check-dxf.ts` writes the manifest: for each drawing, the file as written, the same drawing
with no blocks, and what the plan says it holds. A drawing passes when ezdxf loads it with no audit
error, finds one INSERT per door, window and catalogued fixture and one DIMENSION per dimension, keeps
the AIA layer names, and when every block and dimension, exploded by ezdxf, gives back the flat
drawing, entity for entity. Exit 1 names what failed. The reader is a test tool, never a dependency.
"""

import bisect
import json
import math
import sys
from collections import Counter, defaultdict

import ezdxf

# The file prints four decimals, so an exploded entity can differ from the flat one by two units in
# the last place. A thousandth of a millimetre is comfortably above that.
TOLERANCE = 1e-3


def vec(*points):
    out = []
    for p in points:
        out.extend((float(p[0]), float(p[1])))
    return out


def signature(e):
    """An entity as (type, layer, numbers), by what it draws: an arc by its end points, so 0° and 360° agree."""
    kind = e.dxftype()
    if kind == "LINE":
        return kind, vec(e.dxf.start, e.dxf.end), ""
    if kind == "ARC":
        c = e.dxf.center
        return kind, vec(c, e.start_point, e.end_point) + [float(e.dxf.radius)], ""
    if kind == "CIRCLE":
        return kind, vec(e.dxf.center) + [float(e.dxf.radius)], ""
    if kind == "TEXT":
        turn = math.radians(float(e.dxf.get("rotation", 0)))
        at = e.dxf.get("align_point", e.dxf.insert)
        return kind, vec(at) + [float(e.dxf.height), math.cos(turn), math.sin(turn)], e.dxf.text
    if kind == "HATCH":
        pts = []
        for path in e.paths:
            pts.extend(vec(*[v[:2] for v in path.vertices]))
        return kind, pts, e.dxf.pattern_name
    raise ValueError(f"no signature for {kind}")


def flat_entities(path):
    """The drawing as one list of entities: blocks and dimensions exploded by the reader."""
    doc = ezdxf.readfile(path)
    out = []
    for e in doc.modelspace():
        if e.dxftype() in ("INSERT", "DIMENSION"):
            for v in e.virtual_entities():
                # A block's entities keep their own AIA layer, so nothing here may fall back to 0.
                out.append((v.dxf.layer, *signature(v)))
        else:
            out.append((e.dxf.layer, *signature(e)))
    return out


def unmatched(got, want):
    """The entities of `got` with no partner in `want`, matched one to one within the tolerance."""
    pool = defaultdict(list)
    for layer, kind, nums, text in want:
        pool[(layer, kind, len(nums), text)].append(nums)
    for rows in pool.values():
        rows.sort()
    missing = []
    for layer, kind, nums, text in got:
        rows = pool[(layer, kind, len(nums), text)]
        i = bisect.bisect_left(rows, [nums[0] - TOLERANCE]) if nums else 0
        hit = None
        while i < len(rows) and (not nums or rows[i][0] <= nums[0] + TOLERANCE):
            if all(abs(a - b) <= TOLERANCE for a, b in zip(rows[i], nums)):
                hit = i
                break
            i += 1
        if hit is None:
            missing.append((layer, kind, [round(n, 3) for n in nums[:6]], text))
        else:
            del rows[hit]
    return missing


def check(row, fails):
    name = row["name"]
    doc = ezdxf.readfile(row["dxf"])
    audit = doc.audit()
    if audit.errors:
        fails.append(f"{name}: audit errors: {[str(x.message) for x in audit.errors[:3]]}")
    msp = doc.modelspace()
    kinds = Counter(e.dxftype() for e in msp)
    if kinds["INSERT"] != row["inserts"]:
        fails.append(f"{name}: {kinds['INSERT']} INSERT, the plan has {row['inserts']} doors, windows and fixtures")
    if kinds["DIMENSION"] != row["dimensions"]:
        fails.append(f"{name}: {kinds['DIMENSION']} DIMENSION, the plan draws {row['dimensions']}")
    layers = {layer.dxf.name for layer in doc.layers}
    for e in msp.query("INSERT"):
        if e.dxf.name not in doc.blocks:
            fails.append(f"{name}: INSERT of an undefined block {e.dxf.name}")
        if e.dxf.layer not in layers:
            fails.append(f"{name}: INSERT on an undeclared layer {e.dxf.layer}")
        # A block holds no block: exploding one level is exploding it all.
        for v in doc.blocks[e.dxf.name]:
            if v.dxftype() == "INSERT":
                fails.append(f"{name}: block {e.dxf.name} holds an INSERT")
    for e in msp.query("DIMENSION"):
        drawn = [v.dxf.text for v in e.virtual_entities() if v.dxftype() == "TEXT"]
        written = e.dxf.get("text", "")
        if written == "" and len(drawn) == 1:
            # The number the reader measures is the number the drawing prints.
            measure = float(e.get_measurement())
            if abs(measure - float(drawn[0])) > 0.51:
                fails.append(f"{name}: {e.dxf.geometry} measures {measure}, the drawing prints {drawn[0]}")
        elif written.strip() != "" and len(drawn) == 1 and written != drawn[0]:
            # A written figure is the figure the drawing prints, in whatever hand the sheet uses.
            fails.append(f"{name}: {e.dxf.geometry} says {written}, the drawing prints {drawn[0]}")
    got = flat_entities(row["dxf"])
    want = flat_entities(row["flat"])
    if len(got) != len(want):
        fails.append(f"{name}: exploded to {len(got)} entities, the flat drawing has {len(want)}")
    for miss in unmatched(got, want)[:3]:
        fails.append(f"{name}: not in the flat drawing: {miss}")
    return kinds


def main():
    rows = json.load(open(sys.argv[1], encoding="utf-8"))
    fails = []
    totals = Counter()
    for row in rows:
        totals.update(check(row, fails))
    print(f"ezdxf {ezdxf.__version__}: {len(rows)} drawings, {totals['INSERT']} INSERT, {totals['DIMENSION']} DIMENSION")
    for f in fails:
        print(f"FAIL {f}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
