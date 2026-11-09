# Resume point

**Where (2026-11-09, night):** wave 0 prepared (owner queue below), wave 1 two-thirds landed.
Rulings EH-D1…D9 taken by delegation (`README.md` § 6; EH-D8 amended by #597: severity follows the
list, budget-class codes survive the cap), owner may overturn.

**Landed:** EH0.1 (#581) · EH1.2 (#598, squash: `KIND_FACETS`, five exhaustive switches, the
new-element checklist) · EH1.3 (#589) · EH1.4 (#590; `LintContext.lintRules`; `no-value-cycles`) ·
EH1.5 (#591; 41 seam rows) · EH1.6 tranche 1 (#592) · EH1.10 (#593; three pinned defects → EH1.15) ·
EH1.11 (#597; line-start table, cap 500, `E_/W_DIAGNOSTIC_LIMIT`, `LIMIT_CODES`) · EH1.13 PR 1 (#594;
inflate cap, `sanitizeSvg` ×3 under a lockstep pin, `isPlainSvg` fast path).

**In review:** EH1.1 (#599; variance rules per role; literal unions compared as sets in both roles
by the coordinator's ruling). **In progress:** EH1.12 (`import` rooted), EH1.15 (`planFromJson`
hardening, waits on nothing now that #597 is in).

**Owner queue (high tier, all CI-green; each PR body carries the diff and its finding):** #586 EH0.7
(five balanced shards, 4.2–5.6 min each) · #583 EH0.3 (release guard + verify job) · #584 EH0.2
(`ci-red` label, a comment per red run) · #585 EH0.4 (deploy waits for CI) · #587 EH0.6 (mcp-worker
built on PRs) · #588 EH0.9 (`--ignore-scripts`, step-scoped Cloudflare env, CodeQL `actions`,
Dependabot cooldown) · #595 EH1.13 PR 2 (playground CSP, report-only) · EH0.5 (required checks
`3D package (check:3d)` + CodeQL `Analyze`, a repository setting). One sentence from the owner merges
the set; several of these need a `git merge origin/main` first (CHANGELOG and cards moved).

**Next cards:** EH1.14 (agent docs, stale recipes), EH1.16 (review residue), EH1.8 (`runCli`) then
EH1.9, EH1.7 after #586 lands (it edits `vitest.config.ts`); then wave 2 (EH2.1 error catalogue
first: it is the churn hotspot and the browser-bundle lever).

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
