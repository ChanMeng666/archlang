# Resume point

**Where (2026-11-10, morning):** waves 0 and 1 DONE; wave 2 DONE except EH2.4 (and the residue cards EH2.3b,
EH2.5b, EH2.8b, EH2.10); wave 3: EH3.2 done, EH3.1 (#639) and EH3.3 (#637, #638) in review, EH3.5 running; EH3.4 and
EH3.6 not started.

**Landed today (34 PRs):** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599) · EH1.2 (#598) · EH1.3 (#589) · EH1.4
(#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.7 (#610) · EH1.8 (#613; `runCli` + `CliIo`, 40 spawn copies gone,
five sampled files 82.5 s → 5.7 s) · EH1.10 (#593) · EH1.11 (#597) · EH1.12 (#601) · EH1.13 (#594, #595) · EH1.14 (#605,
#606) · EH1.15 (#607) · EH1.16 (#608) · EH1.17 (#617; the compat gate expands non-exported literal aliases; the 3D
CLI's world is rooted under a lockstep table) · EH2.1 (#614) · EH2.9 (#611) · policy #615 · records #582, #596, #600,
#602, #609, #612, #616.

**In flight:** EH3.1 (#639; `gen:module-map`, a `:(glob)` pathspec fix landing so top-level modules are listed) · EH3.3
(#637 low + #638 high; rounds landed) · EH3.5 (hooks for the recurring mistakes). Landed since the last note: EH2.3
(#626, #630, #634), EH2.8 (#631, #635). New card: EH2.3b.

**Owner queue:** none (standing approval; releases, paid eval and the npmjs account stay owner-only). Tomorrow's
reads: the nightly's `ci-red` behaviour (#584) and its new `fuzz-deep` job (#610) and `test-durations` artifact (#586).

**Next cards:** EH2.4 (unblocked), EH3.4 (test helpers + generated test index), EH3.6 (nightly sampled mutants), then the
residue cards EH1.18, EH2.3b, EH2.5b, EH2.8b, EH2.10.

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
