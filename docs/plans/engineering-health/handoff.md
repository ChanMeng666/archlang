# Resume point

**Where (2026-11-09, end of day):** wave 0 done except EH0.8; wave 1 done except EH1.7 (owner queue), EH1.8 (running), EH1.9; wave 2 started (EH2.9 done, EH2.1 running).

**Landed today (23 PRs):** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599) · EH1.2 (#598) · EH1.3 (#589) ·
EH1.4 (#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.10 (#593) · EH1.11 (#597) · EH1.12 (#601) · EH1.13
(#594, #595) · EH1.14 (#605) · EH1.15 (#607) · EH1.16 (#608; also fixed `sanitizeSvg` throwing on CDATA) ·
EH2.9 (#611; 163 alias hashes pinned in `test/tables/glyph-dispatch.json`) · records #582, #596, #600, #602, #609.

**In flight:** EH1.8 (`runCli`, in-process CLI tests) · EH2.1 (error catalogue by family;
PR 2 = fix-table split for the browser bundle, measured).

**Owner queue:** none. On 2026-11-09 the owner merged #606 and #610 in words and granted standing approval for high-tier merges (`docs/agents/iron-laws.md` § Owner policies); the coordinator now judges and merges them after review and green CI. Still owner-only: releases, paid eval, the npmjs account.

**Next cards:** EH1.9 (after EH1.8), EH0.8 (flaky reporter), EH1.17 (residue), then wave 2: EH2.2 `src/ir/`
(after EH2.1 lands: both touch the catalogue's importers), EH2.4–EH2.8; wave 3 from EH3.1.

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
