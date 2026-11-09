# Resume point

**Where (2026-11-10, afternoon):** waves 0–1 DONE; wave 2 DONE bar the residue cards; wave 3: EH3.1, EH3.2,
EH3.3, EH3.5 done, EH3.4 (#645) and EH3.6 (#644) in review. Residue: EH1.18 (#648), EH2.5b (#647) in review;
EH2.3b, EH2.8b running; EH1.19, EH2.10 todo.

**Landed today (34 PRs):** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599) · EH1.2 (#598) · EH1.3 (#589) · EH1.4
(#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.7 (#610) · EH1.8 (#613; `runCli` + `CliIo`, 40 spawn copies gone,
five sampled files 82.5 s → 5.7 s) · EH1.10 (#593) · EH1.11 (#597) · EH1.12 (#601) · EH1.13 (#594, #595) · EH1.14 (#605,
#606) · EH1.15 (#607) · EH1.16 (#608) · EH1.17 (#617; the compat gate expands non-exported literal aliases; the 3D
CLI's world is rooted under a lockstep table) · EH2.1 (#614) · EH2.9 (#611) · policy #615 · records #582, #596, #600,
#602, #609, #612, #616.

**In flight:** #644, #645, #647, #648 (reviewed, fix rounds landed, waiting on CI); EH2.3b and EH2.8b executors.
Lesson of the day: CodeQL is a required check and five PRs each lost a round to `String.replace` escapers or a
RegExp built from argv; the character-map rule is in gotchas. A 400-file PR shifts every pre-existing alert into
the diff: triage on main first (EH1.19).

**Owner queue:** none (standing approval; releases, paid eval and the npmjs account stay owner-only). Tomorrow's
reads: the nightly's `ci-red` behaviour (#584) and its new `fuzz-deep` job (#610) and `test-durations` artifact (#586).

**Next cards:** EH2.10 (lint rule costs, opus), EH1.19, then the programme's closing audit (re-run the seven audits'
measurements against the plan's success criteria and record the deltas in README § Findings).

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
