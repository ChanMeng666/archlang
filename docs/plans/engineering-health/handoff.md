# Resume point

**Where (2026-11-10, late night; PROGRAMME CLOSED):** waves 0–3 DONE and re-measured: `closing-audit.md` (7 audits, 41 findings closed,
25 improved, 13 open, 11 new; reports archived at `claude-kept/2026-11-09-archlang-health-audit/closing-2026-11-10/`).
Wave 4 (the residue) DONE: EH2.11, EH2.12, EH1.20, EH2.13, EH1.21, EH1.23, EH3.8, EH3.9, EH3.10, EH0.10, EH1.22, EH1.24, EH2.14 and EH2.3c landed (PRs #662–#674); the programme is closed. The nightly's `fuzz-deep` red (two counterexamples) is fixed by #664; the next nightly proves it. Dependabot #206–#208 closed under README § 4 (EH0.10).

**Landed 2026-11-10 (36 PRs):** EH1.9 (#634) · EH2.2 (#631) · EH2.3 (#635) · EH2.4 (#637) · EH2.5 (#638) · EH3.1 (#639)
· EH3.2 (#642) · EH3.3 (#644) · EH3.4 (#645) · EH3.5 (#646) · EH3.6 (#647) · EH1.18 (#648) · EH2.6 (#649) · EH2.7 (#650)
· hotfix #651 · EH2.8 (#652) · EH1.19 (#653) · EH2.3b (#656) · EH2.10 (#656) · EH3.7 (#658) · EH2.11 (#663) · EH2.12
(#662) · EH1.20 (#664) · EH2.13 (#665) · EH1.21 (#666) · EH1.23 (#667) · EH3.8 (#668) · EH3.10 (#669) · EH3.9 (#670) · EH0.10 + EH1.22 (#671) · EH1.24 (#672) · EH2.14 (#673) · EH2.3c (#674) · records #641, #650, #657, #660 and this one. 2026-11-09's 34 PRs are listed in the previous handoff
(git history of this file).

**In flight:** nothing. Since EH3.7 main's required checks are strict: a PR behind main shows `BEHIND`;
`gh pr update-branch`, wait for CI on the new head, re-pin (`commands.md` § Merging a PR).
Lessons of 2026-11-10: (1) CodeQL is required and fails on `String.replace` escaper chains and argv-built RegExps —
five PRs lost a round; the gotcha and `test/no-replace-chain-escapers.test.ts` now guard it. (2) A 400-file PR shifts
every pre-existing CodeQL alert into its diff: triage main first (22 test-only alerts dismissed as 'used in tests').
(3) Generated artifacts couple PRs: once `test/INDEX.md` and the module map exist, every merge invalidates every
open PR's copy; merge serially (one re-merge each); EH3.7's strict checks now enforce it. (4) A reviewer must never
`git checkout` in the primary; it detached it once today. (5) `fmt`'s exit 0 on an unparseable plan is a pinned
contract (MCP hash parity) — read the contract table before deciding an exit code. (6) The PR-scale fuzz (400 runs)
passes while `FC_SCALE=10` fails: a property's seed is fixed, so only the nightly reaches run 494+; when the nightly
is red, download `fuzz-deep-report.json` and reproduce the counterexample with a tsx probe before carding.

**Owner queue:** none (standing approval; releases, paid eval and the npmjs account stay owner-only). Tomorrow's
read: the nightly dispatched 2026-11-10 (run 42719118317): `fuzz-deep` (expected red until EH1.20) and the first `mutants` report.

**Next cards:** none. The programme is closed; `closing-audit.md` § 1's open list is the only residue, and it is
carded only when a signal in README § 5 asks for it.

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
