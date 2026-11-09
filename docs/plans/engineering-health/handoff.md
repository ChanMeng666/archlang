# Resume point

**Where (2026-11-09, evening):** wave 0 prepared, wave 1 running. Rulings EH-D1…D9 taken by
delegation (`README.md` § 6), owner may overturn.

**Landed:** EH0.1 (#581) · EH1.3 (#589) · EH1.4 (#590; rules reach `defining.ts` through
`LintContext.lintRules`; `test/no-value-cycles.test.ts` guards) · EH1.5 (#591; 41 seam rows in
`test/workspace-seams.allow.ts`) · EH1.6 tranche 1 (#592; `test/tables/work-counts.json`, ±10 % per
row with floor 8, ±3 % totals).

**In review (medium tier, fresh-context review done, fix round landed, CI pending):** EH1.10 (#593:
malformed-input laws; found defect 1, `planFromJson` throws on a non-string furniture `label`,
pinned as `it.fails`, fix is a follow-up PR AFTER #593 merges so the pin flips) · EH1.13 PR 1 (#594:
inflate cap, three byte-identical `sanitizeSvg` copies under a lockstep test). Running: EH1.11
(diagnostics O(1) + cap 500).

**Owner queue (high tier, all CI-green, each PR body carries the diff and its finding):**
EH0.7 #586 (five duration-balanced shards; measured 4.2–5.6 min each) · EH0.3 #583 (release guard
+ verify job) · EH0.2 #584 (`ci-red` label and a comment on every red run) · EH0.4 #585 (deploy
waits for CI) · EH0.6 #587 (mcp-worker built on PRs) · EH0.9 #588 (`--ignore-scripts`, step-scoped
Cloudflare env, CodeQL `actions`, Dependabot cooldown) · EH1.13 PR 2 #595 (playground CSP,
report-only). Plus EH0.5: required checks `3D package (check:3d)` and CodeQL `Analyze` (repository
setting). A standing "merge the EH high-tier set once CI is green" covers them all.

**Next cards:** EH1.2 (exhaustive kind tables, opus), EH1.1 (release-compat gate as a vitest file
that skips loudly offline and fails under CI, so it needs no ci.yml edit), EH1.12 (`import` rooted),
EH1.8 (`runCli`), EH1.7 (after #586 lands: it edits `vitest.config.ts`), EH1.9 (after EH1.8),
EH1.14 (agent docs), then wave 2.

**How to continue:** take the first `todo` card of the lowest open wave in `cards.md`, honour
`depends`, dispatch one executor into a worktree from `main` with the card text plus the finding's
section from the audit report (`claude-kept/2026-11-09-archlang-health-audit/`), at most two
executors at once (EH-D1). Merge by tier (`scripts/risk-tier.mjs`): low on green CI pinned to the
full SHA; medium after one fresh-context review against `REVIEW.md` (one fix round, then merge);
high after the owner's words (EH-D6). Record each landing here and move the card's status.
