# Verify your work the way the tool is used

> Moved verbatim from `CLAUDE.md` (2026-09-18) so it loads on demand. Read it before claiming a change is done — it lists, per release surface, what to drive through the CLI and which extra gates a diff earns. The full verification-system map is `docs/testing.md`.

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
`src/` — **`test/` included**: the root `tsconfig.json` lists `test` in `exclude`, so `npm run check`
(`tsc --noEmit`) never typechecks the suite, and only `typecheck:dev` inside `typecheck:all` does.
A test file that does not compile passes the floor gate (it is the only thing that compiles the playground, docs-site, MCP shim and VS Code
extension), **`npm run docs:build`** for any `docs/*.md` edit, and **`npm run e2e:playground` /
`npm run e2e:docs`** (Playwright, against the BUILT sites — build the core first) when you touch
those apps. Prose is gated too: `test/docs-table-pipes.test.ts` scans every tracked `.md` for a bare
`|` inside inline code in a table cell (write `\|`), `test/docs-fences.test.ts` requires every
```` ```arch ```` fence on a published page to compile or carry `static`, and
`test/docs-flags.test.ts` checks that every `arch … --flag` you write in a hand-maintained doc is a
flag that command declares. **The whole verification system — tiers, guards, and the red-run
response for each — is mapped in [docs/testing.md](../testing.md).**
