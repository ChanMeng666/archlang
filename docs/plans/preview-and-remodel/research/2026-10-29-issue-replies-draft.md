# Draft comments for roadmap issues #343–#347 (G2; owner approves before anything is posted)

State as of 1.46.0 (2026-10-29). Links assume G1 has landed; adjust anchors then. No "users asked"
in the plural: the community log shows one user or none per item. No 3D word beyond "a separate
package". Tone per the growth repository's `voice.md`: show the work, no cheerleading.

## #343 Export adapters (DXF, JSON, glTF) and a converter interface

Status as of 1.46.0: DXF export exists (`arch compile plan.arch -f dxf`: AIA layers, hatches; no
BLOCK/INSERT or DIMENSION entities yet, tracked as backlog U.13). Plan JSON exists both ways
(`-f json`, `--from-json`) and is the stable machine format; its schema is `schemas/plan.schema.json`.
A glTF/GLB writer exists in a separate, unpublished package and is not part of this issue until that
package is published. What remains here: a documented converter seam (read Plan JSON, write X) with
one worked example, and DXF blocks. Proposed re-title: "Converter recipes on Plan JSON; DXF blocks".

## #344 Experimental import from images, PDF floor plans and segmentation masks

Status: nothing in the core reads rasters, by design (the compiler is pure and dependency-free).
The path we will document and tool (card G3): a rooms-only Plan JSON (room polygons plus a
derived-walls statement) compiles today; a small tool outside the package turns a label mask plus a
millimetres-per-pixel scale into that JSON. PDFs are rasterised by the user first. Openings and
furniture are not recovered. One user who trains a segmentation model asked for this; if that is you,
a sample mask and its class names would let us test the recipe on real data.

## #345 Multi-storey alignment (shared grid, stair and shaft checks)

Status: `keep stacked` pins a footprint across storeys; `W_STAIR_UNMATCHED` reports a stair with no
matching flight on the next storey; `W_SHAFT_FOOTPRINT_MISMATCH` reports a shaft whose footprints
differ between storeys; `examples/two-storey.arch` shows all three. What remains: an addressable
shared structural grid (backlog P2-4) and a load-bearing stacking check, which needs a structural
attribute on walls that does not exist yet. Proposed re-title: "Shared structural grid and
load-bearing stacking".

## #346 More validation checks and quantity takeoff / area schedule

Status: `arch takeoff --format csv|md` and `describe --facts quantities` (1.44.0) give wall lengths
by category and status (centreline and face, named as such), room perimeters, net and centreline
areas, door and window counts, and an optional `--waste <pct>` the author passes. The lint catalogue
has 25+ rules for door swings, clearances, reachability, windowless rooms and overlaps; `arch
validate --stage` runs them by authoring stage; `arch preview --review` draws every warning on a
review sheet. What remains: a wall-closure check if the existing tiling and enclosure rules miss a
case (we are measuring that first), and a takeoff panel in the playground. Proposed re-title:
"Wall-closure check and a playground takeoff panel".

## #347 Door swings and furniture as first-class elements, with a standard size library

Status: shipped before this issue was opened. Doors carry `swing into <room>` / `swing inward|outward`
and hinge side; the fixture catalogue has 83 families and 129 named entries with real sizes
(`docs/furniture.md`), placed by relation (`against wall … offset`, `facing`, `clear front|sides`);
about fifteen lint rules read them (swing obstructed, furniture over a window, WC side clearance,
bed clearance). Closing as shipped; if a specific family or size is missing, a new issue naming it is
the fastest route.

## Reply to the Halo Forge user (G6, owner's channel)

We would like to add a recipe for your format. Is "DCjson" a public specification (a link or a sample
file would do)? Our stable machine format is Plan JSON; a converter from it is a small script if the
target is documented.
