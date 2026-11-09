# Resume point

**Where (2026-11-10, evening):** waves 0–3 DONE (EH2.10 #656 partial by design). Residue cards
EH1.18, EH1.19, EH2.3b, EH2.5b, EH2.8b done today. Open cards: EH2.3c, EH2.11, EH2.12, EH3.7 (merge queue — do this
first next time), then the programme's closing audit.

**Landed today (34 PRs):** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599) · EH1.2 (#598) · EH1.3 (#589) · EH1.4
(#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.7 (#610) · EH1.8 (#613; `runCli` + `CliIo`, 40 spawn copies gone,
five sampled files 82.5 s → 5.7 s) · EH1.10 (#593) · EH1.11 (#597) · EH1.12 (#601) · EH1.13 (#594, #595) · EH1.14 (#605,
#606) · EH1.15 (#607) · EH1.16 (#608) · EH1.17 (#617; the compat gate expands non-exported literal aliases; the 3D
CLI's world is rooted under a lockstep table) · EH2.1 (#614) · EH2.9 (#611) · policy #615 · records #582, #596, #600,
#602, #609, #612, #616.

**In flight:** nothing from the programme; EH3.7 (merge queue) executing. 72 PRs merged since 2026-11-09.
Lessons of 2026-11-10: (1) CodeQL is required and fails on `String.replace` escaper chains and argv-built RegExps —
five PRs lost a round; the gotcha and `test/no-replace-chain-escapers.test.ts` now guard it. (2) A 400-file PR shifts
every pre-existing CodeQL alert into its diff: triage main first (22 test-only alerts dismissed as 'used in tests').
(3) Generated artifacts couple PRs: once `test/INDEX.md` and the module map exist, every merge invalidates every
open PR's copy; merge serially (one re-merge each) and land EH3.7. (4) A reviewer must never `git checkout` in
the primary; it detached it once today. (5) `fmt`'s exit 0 on an unparseable plan is a pinned contract (MCP hash
parity) — read the contract table before deciding an exit code.

**Owner queue:** none (standing approval; releases, paid eval and the npmjs account stay owner-only). Tomorrow's
reads: the nightly's `ci-red` behaviour (#584) and its new `fuzz-deep` job (#610) and `test-durations` artifact (#586).

**Next cards:** EH3.7 (merge queue) first; then EH2.11, EH2.12, EH2.3c; then the closing audit (re-run the seven
audits' measurements against README § Findings and record the deltas).

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
