# Benchmark

`npm run bench` (runs `tsx bench/run.ts`).

It compiles deterministically-generated plans (`bench/gen.ts`, no `Math.random`/
`Date`, so source and SVG are byte-identical run to run), breaks the cost down by
stage (parse / resolve / toScene / renderSvg), times the analysis entry points
(lint / describe), and runs two **skewed** plans to isolate geometry hotspots.

## Methodology (fixed 2026-07)

The pipeline stages memoize (lex by content hash, parse by source hash, resolve
by AST identity), and the original harness timed repeated calls against the
**same** source/AST — so the parse and resolve rows measured cache lookups
(~0.08 ms), not work. Each timed closure now clears the stage caches it would
otherwise hit; `lint`/`describe` deliberately run against warm parse/resolve
caches so their rows isolate the analysis work itself. The generated BALANCED
plan also carried 100 furniture parse errors (a stale `id=` slot), which made
its lint/describe rows measure an early bail-out; the generator is fixed.
Baselines from before this fix are **not comparable**.

## Current stage picture (~1000 elements, median ms, one dev machine)

| Plan | compile | parse | resolve | toScene | renderSvg | lint | describe |
|------|--------:|------:|--------:|--------:|----------:|-----:|---------:|
| BALANCED | 25.5 | 6.7 | 5.0 | 7.2 | 2.5 | 7.0 | 5.8 |
| ROOM_HEAVY | 14.5 | 7.2 | 3.0 | 0.8 | 2.6 | 2.3 | **28.7** |
| OPENING_HEAVY | 42.4 | 6.5 | 9.3 | **19.5** | 2.5 | 3.8 | 0.5 |

The two standout hotspots: `toScene` on opening-heavy plans (the wall
boolean-union in `src/geometry/union.ts`) and `describe` on room-heavy plans
(pairwise room adjacency).

## Earlier findings (historical)

Profiling the two `resolve` hotspots with skewed plans:

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

## Spatial grid index (T3.7)

The fused scan was still `O(openings × wallSegments)`, and room overlap `O(R²)`.
Both are now backed by a uniform-grid bucket index (`src/geometry/grid-index.ts`):

- **Room overlap** buckets each room's box and tests only rooms sharing a cell.
  Two rooms overlap ⟹ their boxes intersect ⟹ they share a cell, so the same
  overlaps are found; warnings are sorted into `(a,b)` order so the diagnostics
  stay byte-identical to the former double loop.
- **Host lookup** (`WallGrid`, `src/geometry.ts`) buckets wall segments and, for
  each opening, queries an expanding box. A box of half-size `r` is guaranteed to
  contain every segment within distance `r`, so the box grows until it provably
  holds both the nearest segment (`r ≥ bestDist`) and the on-wall tolerance band
  (`r ≥ maxTol`); a final pass scans the gathered segments in global index order
  with the same first-wins `dist < best` rule.

This is **provably byte-identical** to the brute-force scan — pinned by
`test/geometry-hostinfo.test.ts` (`WallGrid` ≡ `hostInfoForWalls`, 600 random
inputs incl. far points + refs) and `test/grid-index.test.ts` (grid room-overlap
≡ the O(n²) loop, 300 random room sets), plus the golden snapshots.

Measured effect (median `resolve`, ~1000-element skewed plans): `ROOM_HEAVY`
~4 ms → ~2 ms; `OPENING_HEAVY` ~15 ms → ~8.5 ms. The remaining `OPENING_HEAVY`
cost is now dominated by `render` (opening cuts), not hosting.
