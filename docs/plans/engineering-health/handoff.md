# Resume point

**Where (2026-11-09, late night):** wave 0 done except EH0.8; wave 1 done except EH1.8 (#613, in review) and EH1.9;
wave 2 running (EH2.1 and EH2.9 done; EH2.2 running); EH1.17 residue running.

**Landed today (31 PRs):** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599) · EH1.2 (#598) · EH1.3 (#589) · EH1.4
(#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.7 (#610) · EH1.10 (#593) · EH1.11 (#597) · EH1.12 (#601) · EH1.13
(#594, #595) · EH1.14 (#605, #606) · EH1.15 (#607) · EH1.16 (#608) · EH2.1 (#614; 15 family files, every code typed
once, `CatalogCode` + `diag()`) · EH2.9 (#611) · policy #615 (the owner's standing approval for high-tier merges) ·
records #582, #596, #600, #602, #609, #612.

**In flight:** EH1.8 (#613, `runCli` + `CliIo`; review done, round landed, CI pending) · EH1.17 (compat-gate alias
resolution, the 3D CLI's rooted world, glyph guard) · EH2.2 (`src/ir/` by pure moves).

**Owner queue:** none (standing approval; releases, paid eval and the npmjs account stay owner-only). Tomorrow's
reads: the nightly's `ci-red` behaviour (#584) and its new `fuzz-deep` job (#610) and `test-durations` artifact (#586).

**Next cards:** EH1.9 (after #613), EH0.8 (flaky reporter), EH2.3 (describe/plan-json/circulation splits, after
EH2.2), EH2.4–EH2.8; wave 3 from EH3.1 (module map) and EH3.2 (backlog split).

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
