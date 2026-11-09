# Engineering health: guards, structure and agent navigation (2026-11-09)

The repo is developed, maintained and extended by Claude agents. This programme makes the repo
cheaper and safer for them to change: every class of "change one thing, break another" the audits
found gets a mechanical guard; the modules agents edit most are split along the lines their authors
already drew, by pure moves that keep every output byte; the documents an agent reads first shrink
and are generated where they can be. Nothing here adds language syntax or moves `compile()` output.

Seven read-only audits of `main@b59d088d` are the evidence (architecture, tests, CI, AI
navigation, performance, security, workspaces). They live in the private archive
`claude-kept/2026-11-09-archlang-health-audit/` (`01-architecture.md` … `07-workspaces.md`), and
each card below cites the finding it answers (`A-F1` = architecture F1, `T-F4` = tests F4, `C-` CI,
`N-` navigation, `P-` performance, `S-` security, `W-` workspaces). Re-measure before building on a
number quoted here.

## 1. What the audits found (one line each)

- **Architecture.** "New element = one module" is not true: the last element pair touched 22 `src/`
  files and 9 per-kind switches drop a new kind silently. `error-catalog.ts` is the #1 churn file and
  types every code twice. `ir.ts` is five modules in one. Two runtime import cycles. Four copies of
  the share codec, one constant name with two values.
- **Tests.** Coverage is 95.8 % lines; the CLI's apparent 0–57 % is a subprocess artifact that also
  costs 21 % of suite time. No guard compares the public `.d.ts`, MCP tool schemas, Plan JSON schema
  or error-code set against the last release. Shard 3 carries 19 % of the suite by hash luck; one
  test takes 235 s. One wall-clock assertion. 108 unseeded property checks.
- **CI.** Supply chain is strong (every action SHA-pinned, OIDC publish with provenance). The release
  workflow never checks tag = version, tag on `main`, or CI green. Deploy is not gated on CI. The
  nightly red of 2026-11-05…08 notified nobody. `check:3d` and CodeQL are not required checks.
  `mcp-worker` is first built after merge, in deploy.
- **Navigation.** Every file/symbol pointer in the agent docs resolves. The recipes are stale
  (`/regen` lists 8 of 14 generators, `/new-element` names a function that does not exist, the
  `alg-*` agents are bound to a dead branch), several docs tell agents to run commands the hook
  blocks, the module map covers 57 % of modules, the backlog is 219 KB with 45 closed entries the
  header says were archived, and the executor read-first chain is 96 KB.
- **Performance.** Bench is noise (same code, +9…+53 % between runs) and its baseline is a year's
  worth of PRs stale; `lint()` builds a second full Scene; no deterministic work-count golden exists;
  `error-catalog.ts` is 19 % of the browser compiler bundle; `tsc` is not incremental (46 s of a 49 s
  build is DTS).
- **Security.** SVG escaping, prototype-pollution resistance, the step meter and the element cap all
  held under probing. Reproduced gaps: diagnostics cost O(source) each so 64 KiB of bad bytes burns
  5–9 s (above the hosted Worker's 5 s CPU cap); the CLI `import` reads any path and echoes the
  foreign file's first token; the playground's `#z=` inflate is uncapped.
- **Workspaces.** The MCP tool list is single-sourced. Not pinned by any test: the 3D boundary, the
  deep imports that bypass the `exports` map, the docs-site MCP tool table. About 8 version pins move
  by hand on every release.

## 2. Principles (on top of AGENTS.md)

1. **A guard before a refactor.** Every structural card runs after the test that would catch its
   regression exists (wave 1 before wave 2).
2. **Pure moves only.** A split moves declarations verbatim into a sibling folder and re-exports
   from the old path. `git diff -M --stat` shows equal moved line counts; CI's digest suites are the
   proof. No identifier changes in a move PR.
3. **Derive, never retype.** A new checklist is a test that reads the registry; a new map is a
   generator with a drift row; a new table in a doc is produced by a script or deleted.
4. **Counts, not time.** Performance gates pin step, draw and query counts per example. Timing is
   informational.
5. **CI is the gate, the laptop runs `check:quick`.** Executors run `check:quick` once; vitest with
   `--maxWorkers=2 --minWorkers=1`; at most two executors at a time (EH-D1).
6. **Risk tier decides review** (`scripts/risk-tier.mjs`): low merges on green CI pinned to the
   reviewed SHA; medium adds one fresh-context review against `REVIEW.md`; high (workflows,
   AGENTS.md, `scripts/check-*`, hooks, repository settings) waits for the owner's words (EH-D6).

## 3. Order of work

Waves run in order; cards inside a wave are independent unless `depends` says otherwise. Each card
is one worktree, one PR. Cards and their acceptance checks: `cards.md`. Resume point: `handoff.md`.

| Wave | Goal | Cards | Window |
|---|---|---|---|
| 0 | The signal is trustworthy: reds notify, releases and deploys are guarded, CI is faster and builds what it ships | EH0.1–EH0.9 | now → 2026-11-14 |
| 1 | Every "change one, break another" class has a mechanical guard; the three reproduced security gaps close | EH1.1–EH1.14 | 2026-11-10 → 11-21 (before the Show HN freeze, ADR/roadmap wave 0) |
| 2 | Structure: pure-move splits of the churn hotspots, the duplicated helpers merged, one Scene per lint | EH2.1–EH2.9 | 2026-11-16 → 12-05 (moves are safe inside the freeze: no user-visible change) |
| 3 | Agent navigation: generated module and test maps, the backlog split, docs by audience, recipes, hooks | EH3.1–EH3.6 | 2026-11-20 → 12-12 |

Wave 1 before the freeze is the point of the programme: the roadmap's wave 0 is "credibility and
contract foundations" and these guards are its engineering half.

## 4. Not doing

- No StrykerJS over the suite (T-F9: every mutant reaches the corpus-wide digests; 53 CPU-min per
  run). A sampled nightly mutant job over two modules is EH3.6, report-only.
- No merge queue (C-F10: the recurring conflicts are textual; a queue adds a full CI run per merge).
- No test subdirectories by stage (T-F7: moves 508 files, breaks every path in `docs/testing.md`;
  a generated index gives the reader more).
- No vitest major upgrade (backlog 3.1's triggers have not fired).
- No `--view` or `while` removal (2.0 items, backlog V.5, 6.7).
- No byte-moving refactor. A card whose digest moves stops and reports.

## 5. Signals that change the order

- A nightly red that nobody saw within 24 h after EH0.2 lands: EH0.2 is wrong, fix it first.
- A moved digest in a wave-2 PR: that card stops; the finding is explained before anything else.
- `check:quick` above 3 min on an executor: EH2.8 (tsc incremental) moves to the front.
- A release between waves: EH0.3's guard must be green on it, or the release waits.

## 6. Rulings (taken by delegation 2026-11-09; the owner can overturn any in one sentence)

| Id | Question | Ruling |
|---|---|---|
| EH-D1 | How many executors at once? | Two, each running `check:quick` once with 2 vitest workers. The 2026-11-03 freeze was one executor plus the main session running heavy commands; audits with no heavy commands ran seven at once without incident. |
| EH-D2 | Required checks on `main` | Add `3D package (check:3d)` and CodeQL `Analyze`. Repository setting: the owner applies it or says "apply" (EH0.5). |
| EH-D3 | `.claude/settings.local.json` turns the repo recipes off | Treat as deliberate (the list turns off every skill). Docs refer to recipes as files to read (`.claude/commands/x.md`), never as `/x`. |
| EH-D4 | Where closed backlog entries go | `archlang-lab/backlog-archive.md`, as the backlog header already states. |
| EH-D5 | Deploy waits for CI (about 13 min) | Yes. A red `main` must not deploy. |
| EH-D6 | High-tier edits in this programme (workflows, AGENTS.md pointers, `GENERATORS` rows, hooks) | Prepared as PRs with the diff in the PR body; merged only after the owner's "merge" for each, or a standing "merge the EH high-tier set once CI is green". |
| EH-D7 | CLI `import` containment (S-F2) | Resolve with `realpath`; allow files under the process's working directory (not only the entry file's directory, so a shared library beside the plan still imports); `--import-root <dir>` widens it; `.arch` only; the parse error of an imported file reports line:col, never the token. |
| EH-D8 | Diagnostic cap (S-F1) | 500 diagnostics per compile, then one limit. Sub-cap output is byte-identical (pinned). Amended at the #597 review: severity follows the list, `E_DIAGNOSTIC_LIMIT` when any diagnostic of the full uncapped list is an error or the parser's dropped-error flag is set, else `W_DIAGNOSTIC_LIMIT` (the plan still renders, lints and describes). |
| EH-D9 | Shard count | Five, duration-balanced, after `net-area`'s oracle moves to its own file. |

## 7. Relation to other plans

- `product-roadmap/` wave 0 (credibility foundations, before the 2026-11-24 freeze): this programme
  is its engineering half; RM7.1's "4.1 joinery 3× performance" waits for EH1.6's counters.
- `ci-throughput.md`: options A–D and G are live; EH0.7 is its "PR legs and shards" row, EH0.4 is
  new. Its § 1 claim that `main` has no protection is stale (C-F9) and EH0.5 corrects it.
- `checker-reach/`, `drawing-set/`: untouched. Their executors benefit from waves 1–3.
- Backlog 3.1 (nightly red): the `e2e-prod` half is EH0.1; the audit/vitest halves stay there.
