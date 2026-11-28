# Programmes

Multi-session plans. Each folder is self-contained: a `README.md` with the decisions and the order of
work, evidence, and (where the programme is running) a `handoff.md` that is the resume point. A plan
small enough for one page is a single file here.

**One queue (RM-D15):** scheduling and the resume point for all development are only in `product-roadmap/` (its `v3.md` § 3 and `handoff.md`); the other plans keep their decisions, evidence and cards, and the table says whether each is open, shelved or closed. Closed programme research lives in the private sibling repository `archlang-lab`.

| Entry | What | Status |
|---|---|---|
| `product-roadmap/` | The product roadmap, its cards, rulings and the one queue for all development | open: the queue, resume at `handoff.md` |
| `plan-soundness/` | Professional rules and taste for AI-written plans | shelved: its cards are a pool taken by first-contact evidence |
| `checker-reach/` | Check plans from any tool: import, revision guard, public check suite, share links | open: its cards are taken in the `product-roadmap/` stages |
| `preview-and-remodel/` | The 3D preview, the G cards and the remodel waves | shelved: waves 4 and 6 wait for the N10 read |
| `drawing-set/` | The scheme-stage drawing set: sections, elevations, analysis diagrams, a sheet pack | shelved: waits behind its gate D3 |
| `math-foundations/` | How the math works today and what to build on it: clear width, height intervals, section groundwork | open: nothing started, its cards are taken in the `product-roadmap/` stages |
| `label-crowding/` | Dense sheets that stay legible: north arrow, dims, leaders, text overprint | open: its cards are taken in the `product-roadmap/` stages |
| `ai-first-language/` | What ArchLang can borrow from other languages and the LLM-codegen literature | open as a research record: its cards are `product-roadmap/` track 10 |
| `modularity-and-flywheel.md` | Package splits, arc-wall defects, jurisdiction data and a content-free diagnostics flywheel | open: MX1 and MX2 not started, MX3 waits on its condition; other residue is in `docs/backlog.md` |
| `arc2-room-arcs.md` | Arc edges in `room polygon`: the room-ring seam and the ARC2 card | closed: ARC2 shipped, residue ARC2b is in `docs/backlog.md` |
| `geo-seo/` | GEO/SEO wave 3: authority, agent discovery, internal links, the monthly panel | open as an operating cadence, not a development queue |
| `ci-throughput.md` | Options to shorten the PR cycle | closed: A–D and G live, E and F declined |
| `ci-throughput-research.md` | Research follow-up to `ci-throughput.md`: survey, measurements, roadmap | decided: its open TR cards (to TR15) are in `product-roadmap/cards.md` track 9 |
| `public-surfaces/` | The playground, docs home and README rework so a visitor tries it in a minute | closed: done |
| `engineering-health/` | Guards for every "change one, break another" class and pure-move splits | closed: only the open list in `closing-audit.md` remains |
| `archlang-3d/` | A pointer to the archived 3D programme | archived: the 3D plan and ADR drafts live in the lab |

The backlog (`docs/backlog.md`) points here for programme work; `docs/adr/` holds the decisions that
outlive a programme.

## Archived

Moved verbatim to the private sibling repository `archlang-lab` (clone it next to this one); nothing here reads them. The rulings and card ids of the programmes that moved whole are listed in [`archived-rulings.md`](archived-rulings.md).

| What | Now at | Why it left |
|---|---|---|
| Closed backlog entries (118) | `archlang-lab/backlog-archive.md` | `docs/backlog.md` keeps open work only; `scripts/backlog-archive.mjs` does the move; a closed id that a tracked file still cites keeps a one-line tombstone |
| The 3D programme plan (`development-plan.md`) | `archlang-lab/plans/archlang-3d/development-plan.md` | 287 KB, superseded by the delivered package and `preview-and-remodel/` |
| ADR 0030 draft | `archlang-lab/plans/archlang-3d/adr-draft-0030-3d-as-downstream-package.md` | superseded by the accepted `docs/adr/0030` |
| ADR 0031 draft | `archlang-lab/plans/archlang-3d/adr-draft-0031-core-exports-for-downstream-3d.md` | superseded by the accepted `docs/adr/0031` |
| `visual-assets/` (richer 3D furniture, the `rendered` theme, new families) | `archlang-lab/plans/visual-assets/` | closed: done, VA.1, VA.2, VA.4 and VA.5 are carried by `product-roadmap/` track 8, VA.3 is the owner's decision |
| `playground-minimal/` (one entry per function, a Plan \| 3D switch) | `archlang-lab/plans/playground-minimal/` | closed: done |
| `playground-mobile-perf/` (a playground that fits a phone) | `archlang-lab/plans/playground-mobile-perf/` | closed: done except MP7, which is deferred |
| `engineering-health/cards.md`, `public-surfaces/{cards,handoff}.md` | the same names under `archlang-lab/plans/` | cards and resume points of closed programmes |
| `archlang-3d/amendment-v0.7.md` (the M1 recut) | `archlang-lab/plans/archlang-3d/amendment-v0.7.md` | superseded by the delivered package |
| `product-roadmap/`: `evidence.md`, `handoff.md` §1.1–§1.2c, §11, §12 and §2's 2026-11-15 lane table, the `done` cards, `README.md` §3 (schedule v2) | `archlang-lab/plans/product-roadmap/` (`evidence.md`, `handoff-history.md`, `cards-done.md`, `schedule-v2.md`) | history; a done card a tracked file cites keeps a one-line tombstone in `cards.md` |
