# CLAUDE.md

## Two instruction files, and the one rule that keeps them apart

Claude Code hardcodes discovery of **both** `CLAUDE.md` and `AGENTS.md`, loads each once, and puts
both in context. So it makes no difference to a session which of the two a fact lives in — what
matters is that it lives in **exactly one of them**.

- **[AGENTS.md](AGENTS.md) is the MAP, and it has to stand alone.** Every project *fact* belongs
  there: shipped state and live versions, iron laws, commands, architecture, gotchas, repo layout.
  It is what a non-Claude agent and a human contributor read, and what `README.md`, `llms.txt`,
  `docs/testing.md`, several ADRs and `test/docs-table-pipes.test.ts` all point at.
- **This file is the OPERATING BRIEF and asserts no fact of its own.** It carries the two things
  AGENTS.md deliberately does not: a *ranked* list of the rules that actually get broken here, each
  naming where AGENTS.md states it in full, and the procedure for **proving** a change is right.
- **The rule: a new project fact goes in AGENTS.md.** If you catch yourself writing the same rule in
  both files, delete the copy here and leave a pointer. Two always-loaded files paying for the same
  sentence twice is how they drift apart — and it is why this file was deduplicated on 2026-09-07.

@AGENTS.md

That import is belt-and-braces. Claude Code 2.x discovers `AGENTS.md` natively as a project doc, so
the line changes nothing today and does not double-load it; it is kept only so this file still pulls
the map in if that ever stops being true.

## Orientation

ArchLang is a small declarative language that compiles `.arch` floor-plan source to professional
**SVG** (also DXF/PDF/PNG) — pure TypeScript, **zero runtime dependencies**, isomorphic (Node and
the browser), and a published, deployed monorepo rather than a WIP. `npm run build` · `npm test`
(vitest) · `npm run cli -- compile examples/studio.arch -o out.svg`; a single root `npm install`
bootstraps every workspace. For the exact shipped state and versions defer to AGENTS.md → "Project
status" and `CHANGELOG.md`, never to memory — and probe the live artifacts rather than trusting
either.

Before touching the brand or either public site, read `brand/README.md` and
[ADR 0014](docs/adr/0014-one-light-world.md) first. Two things are settled there and cost a build
each when forgotten: the logo master is **byte-sacred** (every variant is a fill-swap, never a
re-trace), and **both sites are LIGHT — there is no dark mode and no dark surface on either.**

## The rules most often broken here — checklist (each stated in full in AGENTS.md)

These are the ones this repo has actually shipped violations of. The pointer after each names the
AGENTS.md section that states it in full, with its evidence and its grep.

1. **`compile()` is pure, synchronous, deterministic.** No I/O, no `Date.now()`, no `Math.random()`
   in `src/`; Node APIs and real time only in `src/cli.ts` + `src/cli/`, everything else through the
   `World` seam; route number formatting through `fmt()`; never mutate the shared parse-stage
   `PlanNode` — clone first. → § "Architecture & Conventions", plus the determinism and
   parse-stage-memo entries in § "Gotchas & Anti-patterns".
2. **Don't hand-edit generated files.** Edit the source and run the matching `npm run gen:*`; CI
   fails on drift. → § "Gotchas & Anti-patterns" (the list of artifacts and their sources).
3. **A generator's TEMPLATE can go stale even when `check:drift` is green** — the gate proves
   reproducibility, not correctness. Derive from the source of truth, never retype it.
   → § "Standing decisions & iron laws".
4. **A derived POSITION comes from the shape, never from its bounding box or centroid.** A defect
   CLASS, not a bug: six shipped silently and `arch lint` reported none of them.
   → § "Standing decisions & iron laws".
5. **Every new language form ships with a byte-identity law, pinned by test** — proved with a
   SHA-256 sweep over the whole agent-facing surface (SVG **and** `describe()` **and** `lint()`),
   never by eyeballing, and a moved golden is a finding to explain before it is a diff to bless.
   → § "Standing decisions & iron laws".
6. **Heights draw nothing; the axonometric view measures nothing.** The v1.35 datum is reported only
   when the source authored one (a single whole-plan flag), and `describe()`/`lint()` never learn
   `--view` exists. → the `datum.ts` and `src/view/` entries in the module map inside § "Standing
   decisions & iron laws", and `docs/axonometric.md`.
7. **A drawn fixture symbol ignores its `label`, and fixture categories are DATA, not keywords** —
   one `FIXTURE_FAMILIES` row plus one `CATALOG` entry, never a new element and never a `switch`
   arm; the three catalog flags mean different things. → § "Gotchas & Anti-patterns".
8. **Errors are returned, never thrown** for user-source problems — a `Diagnostic` carrying a byte
   `span` and a catalogued `E_*`/`W_*` code. → § "Architecture & Conventions".
9. **Adding an element = one module** in `src/elements/`, registered in `defs.ts`; dispatch goes
   through the registry, not a switch. → § "Architecture & Conventions".
10. **A clean auto-merge is not evidence** when one branch MOVED a function another MODIFIED — diff
    the moved body against the newer version and run both branches' fixtures together.
    → § "Gotchas & Anti-patterns" (parallel worktrees).

## Verify your work the way the tool is used

After a change, prove it through the CLI, not by eyeballing SVG:
`arch compile --json` (renders, errors-as-data) · `arch describe --json` (rooms, areas, adjacency,
door connections) · `arch lint --json` (architectural soundness). For the v1.13 authoring loop also
drive `arch fix --dry-run` (preview the machine-applicable diagnostic fixes), `arch suggest`
(advisory door/window statements as data), `arch validate --graph` (interior-door adjacency vs. an
intended graph), and `arch compile -f txt` (the zero-dep ASCII plan — a text-only look with no
raster binary). For the v1.14–v1.15 additions also drive `arch validate --intent <f>` (gate a plan on
a brief's intent contract, exit 2 on a gating miss) / `arch score --brief <f>` (the continuous
intent-satisfaction meter), and read `arch describe --json`'s `freedom` block (which element positions
are hand-authored vs resolver-derived) before nudging coordinates. For the v1.17 CLI surface, drive
the affordances an agent actually reaches for: `arch <cmd> --help` (manifest-rendered flags + worked
examples — if you are guessing a flag, ask the CLI instead), the narrowing reads `arch describe
--select <keys>` / `--room <ids>` and `arch lint|validate --code <CODE>` / `--severity <sev>`, `arch
context --section <spec|workflow|cli|errors>`, and `arch fix --dry-run` (which now prints the exact
unified diff it would write) / `--backup`. Two invariants to prove, not assume, whenever you touch
that layer: **a display filter must never change an exit code or `ok`** (they come from the unfiltered
diagnostic set), and **an unrecognized flag or verb must exit 3** with a did-you-mean — never be
swallowed as a filename. For the v1.25 surface, drive `arch describe --json --select site` (the five
derived direction names — `street`/`back`/`equator_side`/`sunrise_side`/`sunset_side`; they are a
**drafting heuristic for an aspect, not a daylight measurement**, and there is deliberately no sun
model, latitude or date), the door kinds (`door pocket … slide left`, and note `describe().doors[].kind`
appears only when it is not the default `hinged`), and `arch lint --code W_POCKET_RUN|W_DIM_OVERLAP`
with `arch fix --dry-run` for their machine fixes. For the v1.28–v1.29 surfaces, drive the three
things a reading cannot settle: **`arch describe --json --select voids`** (a `void` is reported with
its extent and its room but is deliberately NOT subtracted from that room's area — a consumer
needing the net figure subtracts, so never "fix" the area); the **roof refusals**, which are the
whole design (`arch lint --code E_ROOF_CURVED` / `arch explain E_ROOF_CURVED` — an `arc` edge is
refused rather than approximated, and `roof polygon` is the answer); and the **underlay walkability
check**, which is the one furniture claim a drawing cannot show — put a `rug` and then a `sofa` on
the same rectangle across a plan's only route and confirm `arch describe --json`'s circulation walks
THROUGH the first and `arch lint` raises `W_ROOM_NO_CLEAR_PATH` on the second. For the v1.35
surfaces, drive the two things a reading gets wrong: **`arch describe --json --select heights`** on a
plan that authors a `height` and on one that does not — the whole block is gated on one whole-plan
flag, so a plan authoring nothing must emit nothing, and elevation ACCUMULATES the storeys below
rather than being `level × storey_height` (write two `level … height` blocks of different heights and
read the third floor); and **`arch compile --view iso`**, which is a picture and not a drawing —
confirm `describe()`/`lint()` are unmoved by it, and that all four refusals exit 3 rather than falling
back to the plan (`--view` with `-f txt`, with `--ascii`, with `--level`, with `--overlay`). Keep the flagship
`examples/studio.arch` **lint-clean and import-free**, and update snapshots/goldens
(`vitest -u`, `UPDATE_GOLDENS=1 vitest run test/visual.test.ts`, `ASCII_UPDATE=1 vitest run
test/ascii.test.ts`) only after reviewing the diff — never to green a red suite.

Beyond the CLI, prove the surfaces the core suite does not compile. `npm run check` +
`npm run check:drift` is the floor; add **`npm run typecheck:all`** when you touch anything outside
`src/`+`test/` (it is the only thing that compiles the playground, docs-site, MCP shim and VS Code
extension), **`npm run docs:build`** for any `docs/*.md` edit, and **`npm run e2e:playground` /
`npm run e2e:docs`** (Playwright, against the BUILT sites — build the core first) when you touch
those apps. Prose is gated too: `test/docs-table-pipes.test.ts` scans every tracked `.md` for a bare
`|` inside inline code in a table cell (write `\|`), `test/docs-fences.test.ts` requires every
```` ```arch ```` fence on a published page to compile or carry `static`, and
`test/docs-flags.test.ts` checks that every `arch … --flag` you write in a hand-maintained doc is a
flag that command declares. **The whole verification system — tiers, guards, and the red-run
response for each — is mapped in [docs/testing.md](docs/testing.md).**

## Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/). Run the lint/test commands
before proposing changes. Commit or push only when asked. When you change build steps, structure or
conventions, **update AGENTS.md** — this file only gains a line when a rule joins the checklist
above, and it never gains a fact.
