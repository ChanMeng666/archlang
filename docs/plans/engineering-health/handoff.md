# Resume point

**Where (2026-11-09, end):** waves 0 and 1 DONE. Wave 2: EH2.1, EH2.2, EH2.5, EH2.9 done; EH2.6 (#624) and
EH2.7 (#627) in review; EH2.3 running. Wave 3 started: EH3.2 (backlog split) running.

**Landed today (34 PRs):** EH0.1–EH0.7, EH0.9 (#581, #583–#588) · EH1.1 (#599) · EH1.2 (#598) · EH1.3 (#589) · EH1.4
(#590) · EH1.5 (#591) · EH1.6 tranche 1 (#592) · EH1.7 (#610) · EH1.8 (#613; `runCli` + `CliIo`, 40 spawn copies gone,
five sampled files 82.5 s → 5.7 s) · EH1.10 (#593) · EH1.11 (#597) · EH1.12 (#601) · EH1.13 (#594, #595) · EH1.14 (#605,
#606) · EH1.15 (#607) · EH1.16 (#608) · EH1.17 (#617; the compat gate expands non-exported literal aliases; the 3D
CLI's world is rooted under a lockstep table) · EH2.1 (#614) · EH2.9 (#611) · policy #615 · records #582, #596, #600,
#602, #609, #612, #616.

**In flight:** EH2.6 (#624; lint reuses the compile's Scene via `src/scene-memo.ts`, weight-bounded; BALANCED warm lint
152 → 113 ms; round landed) · EH2.7 (#627; `release:pin`, `gen:surface`, the index header's state paragraph; round
running) · EH2.3 (three split PRs: describe, plan-json, circulation) · EH3.2 (backlog split to the lab repo, generated index).
Also landed since the last note: EH0.8 (#620), EH2.5 (#623; `@chanmeng666/archlang/share`). Also landed since the last note: EH1.9 (#619), EH2.2 (#618: `src/ir/` six modules, 137/137
declarations byte-identical, `test/meter-headers.test.ts`).

**Owner queue:** none (standing approval; releases, paid eval and the npmjs account stay owner-only). Tomorrow's
reads: the nightly's `ci-red` behaviour (#584) and its new `fuzz-deep` job (#610) and `test-durations` artifact (#586).

**Next cards:** EH2.3 (describe/plan-json/circulation splits), EH2.4, EH2.7, EH2.8, EH1.18; wave 3 from EH3.1 (module map)
and EH3.2 (backlog split).

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
