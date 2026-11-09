# Resume point

**Where (2026-11-09, late):** wave 0 done except EH0.8; wave 1 almost done.

**Landed:** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599; `scripts/compat-check.mjs` + `test/release-compat.test.ts`,
four surfaces vs the published core and shim, literal unions as append-only sets in both roles) · EH1.2 (#598) ·
EH1.3 (#589) · EH1.4 (#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.10 (#593) · EH1.11 (#597) · EH1.13
(#594, #595) · EH1.14 (#605; `test/agent-docs-gate.test.ts`, the renamed agents `executor-senior`,
`executor-mechanical`, `redteam`, `verifier`) · EH1.15 (#607; every Plan JSON field validated before emission,
validator capped, four defects fixed).

**In review:** EH1.12 (#601, `import` rooted: cwd or `--import-root` plus the plan's directory, `.arch` only,
1 MiB, token-free `E_IMPORT_PARSE`; review done, Linux CI fixes landed) · EH1.16 (#608; sanitiser fix: CDATA no
longer throws, comments/PIs dropped). **In progress:** EH1.7 (counts not clocks, FC_SCALE, nightly fuzz-deep;
HIGH tier: `vitest.config.ts` + `nightly.yml`) · EH2.9 (glyph dispatch by family).

**Owner queue:** #606 (one AGENTS.md line: `/release-check` → "follow `.claude/commands/release-check.md`");
EH1.7's PR when it opens. Confirmed today: the first `workflow_run` deploy fired after `main`'s CI (#585 works);
main requires ten checks. To read tomorrow: the nightly's `ci-red` behaviour (#584) and the fuzz-deep job if
EH1.7 lands.

**Next cards:** EH1.8 (`runCli`) then EH1.9; EH0.8 (flaky reporter); then wave 2 (EH2.1 error catalogue first:
it is the churn hotspot and the browser-bundle lever; EH2.2 `src/ir/`; EH2.4–EH2.8). Residue cards to file:
root `packages/archlang-3d/src/node.ts`'s `makeNodeWorld` (EH1.16d); pin the old zod/MCP SDK in the compat cache
after a major bump; `OpeningJson.kind` type still hand-written (tied by a type assertion).

**Process notes from this day:** executors must NOT edit `cards.md` (adjacent card headings conflict
on every merge; the coordinator records status in a records PR); every pure-move PR repoints the
source-text guards; a medium PR gets one fresh-context review and one fix round, a second round only
for a new mechanism (the #594 fast path); CI reds found during a round are folded into it.

**How to continue:** take the first `todo` card of the lowest open wave in `cards.md`, honour
`depends`, dispatch one executor into a worktree from `main` with the card text plus the finding's
section from the audit report (`claude-kept/2026-11-09-archlang-health-audit/`), at most two
executors at once (EH-D1). Merge by tier (`scripts/risk-tier.mjs`): low on green CI pinned to the
full SHA; medium after one fresh-context review against `REVIEW.md`; high after the owner's words
(EH-D6). Record each landing here and move the card's status.
