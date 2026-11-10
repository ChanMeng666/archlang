# Closing audit (2026-11-10)

The seven audits of 2026-11-09 (`claude-kept/2026-11-09-archlang-health-audit/`, `main@b59d088d`) were re-measured
against `main@58efd8bf` after 75 programme PRs, one read-only agent per audit, nothing run locally beyond
grep, AST scripts, the archive's probes and the nightly's artifacts (run 42603828253). The seven delta reports are
archived beside the originals (`closing-2026-11-10/delta-0N.md`, with the artifacts of runs 42603828253 and 42719118317;
the latter, on the post-programme main, measured lines 97.82 %, branches 93.91 %, and the same two `fuzz-deep` failures). This page keeps the numbers an agent needs and
the residue, which `cards.md` § Wave 4 turns into cards.

## 1. Findings, by status

| Audit | closed | improved | open (by design in brackets) | Headline numbers 11-09 → 11-10 |
|---|---|---|---|---|
| 01 architecture (F1–F13) | 7 | 6 | 0 | runtime import cycles 2 → 0; `ir.ts` 4,691 → 1,723 lines (+6 files in `src/ir/`); error catalog 1 file / codes typed twice → 15 family files / typed once; write-back copies 5 → 1; `#z=` decoders 4 → 1 (`archlang/share`); per-kind switches that drop a kind silently 9 → 0 |
| 02 tests (F1–F10) | 7 | 3 | 1 | lines 95.8 % → 97.79 %, branches 93.85 %; `src/cli/*` 0–57 % → 76–100 %; files spawning the CLI 40 → 2; nightly suite 3,169 s → 1,856 s; longest file 235 s → 216 s (`finish.test.ts`); shards 3 (hash) → 5 (duration-balanced) |
| 03 CI (F1–F17) | 10 | 4 | 3 (F7 by design) | release guard, deploy gated on CI, red-night label + comment, 10 required checks incl. `check:3d` and both CodeQL legs, `strict: true`; CodeQL open alerts 0 |
| 04 navigation (F1–F10) | 7 | 2 | 1 | module map 57 % → 380 of 381 modules (generated); backticked pointers unresolved 0 of 1,564; executor read-first chain 96 KB → 80.7 KB; backlog 219 KB → 142 KB with 0 closed entries inside |
| 05 performance (F1–F10) | 2 | 4 | 3 | bench baseline gone (merge commit vs first parent, flags > 50 % moves); `lint()` builds one Scene (`scene-memo.ts`); work-count table 40 rows; `sideEffects: false`, incremental tsc |
| 06 security (F1–F8) | 3 | 2 | 2 | 64 KiB of bad bytes 4.8–8.7 s → 29–49 ms; `import` outside the root refused (`E_IMPORT_OUTSIDE_ROOT`); `#z=` inflate capped at 1 MiB in the playground; CodeQL 0 open |
| 07 workspaces | 5 | 4 | 3 | 3D boundary, deep imports and the docs-site MCP tool table pinned; `mcp-worker` built on PR; release pins moved by hand 13 → 2 |

Open by finding: 02-F10 (Node 18/20/Windows on every main push, no `lcov`); 03-F6 (14 runner installs, 4 builds, no
shared dist), 03-F14 (workflow-level `id-token` in release/openvsx); 04 `AGENTS.md` cap (4,992 of 5,000 bytes, no
test) and "Where to look" omissions; 05-F4 (catalog rides in every browser bundle: 4.4 % of `src` bytes),
05-F7/F8 (count-bounded caches); 06-F3 (`finish` on 1,500 rooms 4.6 s against the Worker's 5 s CPU cap, no per-tool
cap), 06-F6 (short links: no TTL), 06-F7 (`@hono/node-server` moderate); 07-F6 (manual release steps), 07-F10
(both e2e jobs rebuild the core), 07 font-cjk (0 tests, no CI job).

## 2. New findings (what the programme introduced or missed)

1. **The nightly is still red: the deep fuzz finds two counterexamples** in `test/plan-json-malformed.test.ts` at
   `FC_SCALE=10` that the 400-run PR scale never reaches. (a) `special-number` on `/furniture/1/width = -1e12`:
   `planFromJson` emits `size -1000000000000x400`, which the parser refuses (`E_PARSE`); the validator accepts a
   negative dimension. (b) Law (e) with `walls/0/id = "a"`: the harness renames the wall but not the door's
   `on.wall`, so the plan carries `E_ATTACH_WALL_REF` and the projector returns no walls; a harness defect, not a
   product one. Both reproduced on 58efd8bf (`closing-2026-11-10/probes/`). → EH1.20.
2. **`test/.durations.json` is stale**: it sums 3,168 s over 512 files; the nightly measured 1,856 s over 544. The
   LPT sequencer balances on the table, so the 5 × 634 s balance is the table's property. → EH2.13.
3. **The work-count table pins lint scale, not the geometry EH2.10 promised**: no joinery split-candidate or
   label-relocation counter; a `splitAll` regression stays green. → EH2.14.
4. **The public `archlang/share` decoder is unbounded by default**: only the playground passes the 1 MiB cap;
   `decodePlanHashWeb` falls back to `Number.POSITIVE_INFINITY`. → EH1.21.
5. **Token-bearing workflows without `--ignore-scripts`**: `publish-openvsx.yml` (`id-token: write`) and the three
   eval workflows (`OPENAI_API_KEY`) still run plain `npm ci`. → EH1.22.
6. **Two guard holes**: `test/core-no-3d.test.ts` cannot see an import after a `//` inside a string literal on the
   same line; `scripts/check-quick.mjs` keeps its workspace list by hand, untied to `package.json` workspaces.
   → EH1.23.
7. **`CONTRIBUTING.md` still prescribes `npm test`, `npm run check` and `check:drift`** as the always-run gate;
   every agent doc says CI runs them and the hook blocks them. → EH3.8.
8. **`AGENTS.md` + `CLAUDE.md` = 4,992 bytes of a 5,000 cap, and no test pins the cap**; `docs/testing.md` grew
   13.7 → 20 KB; two `new-element` recipes exist (`docs/agents/new-element.md`, `.claude/commands/new-element.md`);
   three doc paths are package-relative. → EH3.9.
9. **font-cjk has no test and no CI job**; a wrong font pin is caught only by `release.yml`. → EH3.10.
10. **Dependabot #206–#208** (vitest 5, coverage-v8 5, `@types/node` 26) sat open three weeks; README § 4 rules out
    the vitest major. Closed 2026-11-10 with that reason; `dependabot.yml` ignores the vitest 5 line → EH0.10.
11. Recorded, no card: `src/analyze/nav-grid.ts` is now the largest module (1,952 lines, split out of
    circulation); the type-only import SCC grew 80 → 112 modules (0 value SCCs, guarded); the `ir.ts` split added
    228 lines of imports and headers; six `clamp` definitions remain; the Scene memo (`src/scene-memo.ts`, ≤ 4
    Scenes) is process-global state behind a pure API, cleared by `clearCache()`, unmeasured against the Worker's
    128 MB; the level-plan cache clears wholesale at 129 entries; the playground CSP is Report-Only; the
    `mutants` job's first run (nightly 42719118317, dispatched for this audit) scored 87.5 % over `num-format.ts` + `expr.ts`
    (35 killed, 5 survived, 310 sites sampled 40, 628 s; survivors to triage into `test/mutants.allow.json` or tests); the release `verify` job runs `if: always()`; the
    main-push CI wall (19.5 min) is set by the Node 18/20/Windows legs, PR wall ≈ 9 min.

## 3. Not re-measured (and where CI shows it)

Shard wall-clock and mutation survivors (nightly `test-durations`, `mutants-report`); the playground bundle and the
catalog's share of it (deploy / `playground/e2e/startup-chunks.baseline.json`); the release guard on a real tag
(next `v*`); Worker CPU headroom (`measure-cpu.mjs` against `wrangler dev`); the digest suites and the new guard
tests (every CI run on main).
