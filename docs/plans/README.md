# Programmes

Multi-session plans. Each folder is self-contained: a `README.md` with the decisions and the order of
work, evidence, and (where the programme is running) a `handoff.md` that is the resume point. A plan
small enough for one page is a single file here.

**One queue:** scheduling and the resume point for all development are only in `product-roadmap/` (its `README.md` § 3 and `handoff.md`); the other plans keep their decisions, evidence and cards, and the table says whether each is open, shelved or closed. Closed programme research lives in the private sibling repository `archlang-lab`.

| Entry | What | Status |
|---|---|---|
| `product-roadmap/` | The product roadmap, its cards, rulings and the one queue for all development | open: the queue, resume at `handoff.md` |
| `plan-soundness/` | Professional rules and taste for AI-written plans | shelved: its cards are a pool taken by first-contact evidence |
| `checker-reach/` | Check plans from any tool: import, revision guard, public check suite, share links | open: its cards are taken in the `product-roadmap/` stages |
| `preview-and-remodel/` | The 3D preview, the G cards and the remodel waves | shelved: waves 4 and 6 wait for the N10 read |
| `drawing-set/` | The scheme-stage drawing set: sections, elevations, analysis diagrams, a sheet pack | shelved: waits behind its gate D3 |
| `math-foundations/` | How the math works today and what to build on it: clear width, height intervals, section groundwork | shelved: its cards are taken in the `product-roadmap/` stages |
| `label-crowding/` | Dense sheets that stay legible: north arrow, dims, leaders, text overprint | open: its cards are taken in the `product-roadmap/` stages |
| `ai-first-language/` | What ArchLang can borrow from other languages and the LLM-codegen literature | open as a research record: its cards are `product-roadmap/` track 10 |
| `modularity-and-flywheel.md` | Package splits, arc-wall defects, jurisdiction data and a content-free diagnostics flywheel | open: residue cards are in `docs/backlog.md` |
| `arc2-room-arcs.md` | Arc edges in `room polygon`: the room-ring seam and the ARC2 card | open: the seam and card record for ARC2 |
| `geo-seo/` | GEO/SEO wave 3: authority, agent discovery, internal links, the monthly panel | open as an operating cadence, not a development queue |
| `ci-throughput.md` | Options to shorten the PR cycle | closed: A–D and G live, E and F declined |
| `ci-throughput-research.md` | Research follow-up to `ci-throughput.md`: survey, measurements, roadmap | closed: decided, cards TP1–TP6 and TR1–TR11 |
| `public-surfaces/` | The playground, docs home and README rework so a visitor tries it in a minute | closed: done |
| `visual-assets/` | Richer 3D furniture, the `rendered` 2D theme, new families | closed: done, residue is carried by `product-roadmap/` track 8 |
| `playground-minimal/` | A minimal playground: one entry per function, a Plan \| 3D switch | closed: done |
| `playground-mobile-perf/` | A playground that fits a phone and stops wasting CPU, battery and bytes | closed: done except MP7, which is deferred |
| `engineering-health/` | Guards for every "change one, break another" class and pure-move splits | closed: only the open list in `closing-audit.md` remains |
| `archlang-3d/` | The M1 recut (`amendment-v0.7.md`) | archived: the 3D plan and ADR drafts live in the lab |

The backlog (`docs/backlog.md`) points here for programme work; `docs/adr/` holds the decisions that
outlive a programme.

## Archived

Moved verbatim to the private sibling repository `archlang-lab` (clone it next to this one); nothing here reads them.

| What | Now at | Why it left |
|---|---|---|
| Closed backlog entries (45, 2026-11-09) | `archlang-lab/backlog-archive.md` | `docs/backlog.md` keeps open work only; `scripts/backlog-archive.mjs` does the move; a closed id that a tracked file still cites keeps a one-line tombstone |
| The 3D programme plan (`development-plan.md`) | `archlang-lab/plans/archlang-3d/development-plan.md` | 287 KB, superseded by the delivered package and `preview-and-remodel/` |
| ADR 0030 draft | `archlang-lab/plans/archlang-3d/adr-draft-0030-3d-as-downstream-package.md` | superseded by the accepted `docs/adr/0030` |
| ADR 0031 draft | `archlang-lab/plans/archlang-3d/adr-draft-0031-core-exports-for-downstream-3d.md` | superseded by the accepted `docs/adr/0031` |
