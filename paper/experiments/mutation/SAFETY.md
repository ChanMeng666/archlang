# SAFETY — read this before running the mutation harness

`run.mjs` **deliberately writes wrong source into `src/`** and depends on putting it back. While a
run is in progress, `src/frame.ts` or `src/lint/measure.ts` may be a planted fault. Anyone else
reading the repository in that window — a teammate, a build, an editor's language server, a subagent
— sees a compiler that is wrong on purpose.

## The one thing to do

**Ask the tool, do not infer from the file system:**

```
node paper/experiments/mutation/run.mjs --check
```

| exit | meaning | what to do |
|---|---|---|
| **0** | tree is at `HEAD`, or a run is live and has not mutated anything yet | nothing |
| **1** | a mutation was **left behind** and no run is executing | `--recover` |
| **2** | a run is **LIVE** | **do not touch `src/`.** Wait, or Ctrl+C it |

```
node paper/experiments/mutation/run.mjs --recover   # restore from HEAD; REFUSES while a run is live
```

`--recover` restores from `HEAD`, which is always correct: a run refuses to start unless those files
already match `HEAD`, so there is never a legitimate local edit for it to discard.

## Why "just look for the marker file" is the wrong instruction

**An earlier version of this document told you to check whether
`paper/experiments/mutation/.run-in-progress.json` exists, and to read its absence as "no run is
executing — safe to recover". That instruction was wrong and nearly caused the corruption it was
written to prevent.**

The marker was written just before the first *mutation*. But a run executes the baseline suites
first, which take 30–60 seconds — so there was a real window in which a run was live and no marker
existed. A reader who followed this document during that window would have concluded that a live
measurement was a leftover, and "recovered" it. That is exactly what happened: the marker was checked
first, per these instructions, found absent, and only going to the OS process table instead of
trusting the document prevented a second corrupted run.

Fixed by making the marker answer the question it is actually asked. **It answers "is a run
executing?", not "is the tree mutated?"** — those are different questions, and conflating them is
what made the guard dangerous. It is now written *before the run does anything at all*, through
`fsync`, and carries a `phase` (`baseline` / `mutating`) so a reader can tell which window they are
in. `--check` reads it, verifies the pid is actually alive, and reports the two situations that look
identical on disk as the two different situations they are.

**Still: `--check` is the instruction, not `ls`.** If you are about to act on the presence or absence
of a file, run the command instead.

## The hazard, in three real incidents

1. **A 10-minute outer timeout killed a run at mutant 20 of 56.** Node never saw a signal it could
   trap, so the in-memory restore never ran, and `src/frame.ts` was left with `rotationMatrix`'s 90°
   case returning the wrong matrix. Nothing announced it.
2. **A teammate found a mutated `isIdentity` and restored it — from underneath a measurement that was
   legitimately in flight.** They had no way to distinguish a planted mutation from a corrupted tree.
   The run's numbers were void.
3. **The marker written to close hazard 2 was itself absent during the baseline window** (above).

All three are the same underlying problem: **a mutated source file is indistinguishable from an
ordinary uncommitted edit**, and every layer of "solution" so far restated the problem one level up.

## What protects you, and what does not

| Failure | Covered by | Notes |
|---|---|---|
| normal completion | `finally` → `restoreAll()` + un-mark | always ran |
| a throw inside `main` | `finally`, plus `main().catch` | always ran |
| an unhandled rejection | `process.on("unhandledRejection")` | added after incident 1 |
| an uncaught exception | `process.on("uncaughtException")` | added after incident 1 |
| a red baseline | `bailOut()` | restores and un-marks |
| Ctrl+C | `SIGINT` handler | restores, exits 130 |
| `SIGTERM` | `SIGTERM` handler | restores, exits 130 |
| **`taskkill /F`, an outer timeout, power loss** | **nothing in-process can** | the `fsync`'d marker survives on disk; the next run refuses, `--check` reports "left behind", `--recover` fixes it |

The last row is the point. **A handler cannot save you from a kill the process never observes**, so
the durable guard has to be a file, not a `try`. The marker is written before the run starts and
removed only once the tree has been *verified* back at `HEAD` — so a run that ends dirty stays
marked, and the next invocation refuses rather than adopting the corruption as its baseline. A stale
marker whose pid is dead and whose tree is already clean is cleared automatically, so it cannot
permanently disarm the harness.

## Four defects this file exists because of

All four are the paper's own subject, occurring in the instrument built to measure it. Recorded here
rather than quietly fixed, because that is the point.

1. **The header documented a `--check` flag that did not exist.** The `SAFETY` block described it;
   `main()` handled `--verify`, `--only` and `--no-secondary`, and nothing else. A safety mechanism
   described in prose that nothing executes.
2. **The post-run cleanliness check could not fail.** It wrote `treeCleanAfterRun: false` into
   `results.json`, printed a `WARNING:`, and **exited 0**. Fixed: it compares against `HEAD`
   specifically (a staged mutation is still a mutation), prints the diff, and sets a non-zero exit.
3. **The marker was written before the first mutation rather than before the run**, leaving the
   baseline window live-but-unmarked while this document said absence meant safety.
4. **The proof that the marker worked was vacuous.** It checked only that the marker was *absent
   after* a run — which prints the same "cleared" either way, whether the marker had been created and
   removed or never created at all. The marker was never once observed to *exist*. Precisely the
   shape of gate this experiment exists to study, in the check written to validate it.

## The guard, proven in both branches

Not asserted — executed. Both branches were run against the real script:

```
BRANCH A — a live run
  start a run; marker appears immediately, phase "baseline"
  --check   → "A RUN IS LIVE — pid N, phase baseline … DO NOT restore"       exit 2
  --recover → "REFUSING TO RECOVER: a run is LIVE"                           exit 2
  run completes normally, marker cleared, tree clean                         exit 0

BRANCH B — a hard-killed run  (taskkill /F /T, the kill no handler can trap)
  kill while phase is "mutating" and src/frame.ts carries the mutation
  tree is left DIRTY and the fsync'd marker SURVIVES the kill
  --check   → "MUTATION LEFT BEHIND — marker names dead pid N" + the diff    exit 1
  new run   → "REFUSING TO RUN: a previous run did not finish"               exit 1
  --recover → "restored from HEAD: src/frame.ts" → "tree clean"              exit 0
  --check   → "tree clean"                                                   exit 0

STALE MARKER — dead pid, clean tree
  --check   → "stale marker from a dead run … clearing it"                   exit 0
  a run can start again (it does not stay permanently disarmed)
```

## Ground rules

- **Never run this concurrently with anything that reads `src/`** — a build, a test run, another
  agent's work. The harness runs vitest itself; a second suite started against a mutated tree will
  report failures that are real, meaningless, and extremely convincing.
- **Never leave a run unattended behind an outer timeout.** A full 56-mutant run is ~5 minutes here,
  but a wrapper that kills before it finishes will leave the tree dirty every time.
- **Any run a third party wrote into is void.** Not "probably fine" — void. A mutation score measured
  while somebody was concurrently un-mutating the subject is not a measurement. One run has already
  been discarded on exactly these grounds.
- **A mutation score is only ever a statement about the suites you pointed at.** `mutants.json`'s
  `suites` map is hand-maintained: a mutant can read as "survived" purely because the file that would
  have killed it is not in that module's list. `frame-24` survived exactly that way while
  `test/curves.test.ts` killed it on every full run.
