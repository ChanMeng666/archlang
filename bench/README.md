# Benchmark

`npm run bench` (runs `tsx bench/run.ts`).

It compiles deterministically-generated plans (`bench/gen.ts`, no `Math.random`/
`Date`, so source and SVG are byte-identical run to run), breaks the cost down by
stage (parse / resolve / render), and runs two **skewed** plans to isolate the two
suspected `resolve` hotspots.

## What the benchmark answered

On a ~1000-element plan, `compile()` takes **~28 ms** (parse ~8, resolve ~6,
render ~4). Profiling the two `resolve` hotspots with skewed plans:

| Plan | Stresses | resolve (median) |
|------|----------|------------------|
| `ROOM_HEAVY` (1000 rooms) | O(R²) room-overlap check | ~4 ms |
| `OPENING_HEAVY` (400 walls × 600 openings) | per-opening host-segment scan | ~15 ms |

- **The O(R²) room-overlap check is *not* a bottleneck** — 1000 rooms (≈500k
  pair iterations) costs ~4 ms. Left as-is (no premature optimization).
- **The per-opening host-segment scan dominated** `resolve`. Each opening
  previously scanned every wall **twice** — once in `isOnWall` (off-wall warning)
  and again in `hostSegment` (hosting) — each call recomputing
  `distPointToSegment` per segment.

## Optimization applied (determinism-safe)

`hostInfoForWalls()` (`src/geometry.ts`) fuses those two scans into **one pass**
that evaluates `distPointToSegment` once per segment and returns both the nearest
segment and the on-wall flag. `resolve` calls it through a one-entry memo so the
back-to-back `isOnWall` + `hostSegment` calls for the same opening share a single
scan.

This is **byte-identical** to the original: the nearest uses the same first-wins
`dist < best` rule; `onWall` is an order-independent OR of the per-wall tolerance
test. Guarded by:

- the golden-SVG snapshot tests (output unchanged), and
- `test/geometry-hostinfo.test.ts` — a fast-check property asserting the fused
  helper equals `hostSegmentForWalls` + `isOnSomeWall` over 500 random inputs.

Measured effect: `resolve` −31% on the balanced plan, −21% on the opening-heavy
plan; full `compile()` of 1000 elements ~28 ms.

## Deliberately deferred: spatial grid/index

The fused scan is still `O(openings × wallSegments)`. A uniform spatial grid would
make it ~`O(openings)`, but a *provably byte-identical* nearest-**segment** index
(with the linear scan's exact lowest-index tie-breaking) is materially more
complex and risks the project's sacred determinism guarantee. Given that absolute
latency is already ~28 ms at 1000 elements — and real floor plans are far smaller —
this is not warranted now. The benchmark stays in the repo so the trade-off can be
revisited if a genuine large-scale workload appears.
