#!/usr/bin/env node
/**
 * A small, deterministic mutation-testing harness for the paper.
 *
 * WHAT IT MEASURES
 *   For each mutant in `mutants.json` (an enumerated, hand-authored list of exact
 *   source edits to `src/lint/measure.ts` and `src/frame.ts`):
 *     1. apply the edit to the real source file,
 *     2. run that module's DEDICATED vitest file(s) — the "primary" suite,
 *     3. if the primary suite still passes, re-run the mutant against a fixed
 *        "secondary" set (the whole-plan suites that reach the module through
 *        `src/ir.ts` / the lint rules),
 *     4. restore the file byte-for-byte.
 *   A mutant is KILLED by a suite when that suite exits non-zero.
 *
 * WHY IT IS NOT STRYKER
 *   Stryker is not configured in this repo and adding it would change the
 *   dependency surface of a zero-runtime-dependency package. This harness trades
 *   automatic operator generation for an auditable, version-controlled mutant list:
 *   every mutation is readable in `mutants.json`, and every `find` string must match
 *   the source EXACTLY ONCE (asserted before anything is written), so the experiment
 *   is reproducible and cannot silently mutate the wrong line.
 *
 * SAFETY — READ `SAFETY.md` IN THIS DIRECTORY BEFORE RUNNING
 *   **This script deliberately writes wrong source into `src/` and relies on putting it
 *   back.** While it runs, `src/frame.ts` or `src/lint/measure.ts` is a planted fault, and
 *   anyone else reading the tree in that window — a teammate, a build, an editor — sees a
 *   compiler that is wrong on purpose.
 *
 *   The restore runs in a `finally`, on any throw, on an unhandled rejection, and on
 *   SIGINT/SIGTERM. None of that survives a kill the process cannot observe (`taskkill /F`,
 *   an outer runner's timeout), which is not hypothetical: a timeout killed a run mid-flight
 *   and left a mutated `rotationMatrix` in the tree. So the durable guard is on DISK, not in
 *   a handler — `.run-in-progress.json` is written BEFORE the run does anything at all
 *   (before the baseline suites, not before the first mutation) and removed only once the
 *   tree is verified back at HEAD:
 *
 *     - a run that finds that file REFUSES to start (a second run would otherwise snapshot
 *       the corruption as its "pristine" baseline and faithfully restore it at the end);
 *     - `--recover` puts the files back from HEAD and clears the mark — and REFUSES while a
 *       live run holds it, because un-mutating a running experiment is the single most
 *       destructive thing this script could do;
 *     - `--check` distinguishes the two situations that look identical on disk, and says
 *       which, with three exit codes:
 *         0  clean, or a live run that has not mutated anything yet — nothing to do
 *         1  a mutation was LEFT BEHIND and no run is executing — recover
 *         2  a run is LIVE — do NOT restore, you would corrupt a measurement
 *
 *   THREE defects in this file's own safety story, all found by someone acting on it:
 *     1. the header advertised `--check` while no such flag existed;
 *     2. the post-run check wrote `treeCleanAfterRun: false` into a JSON file, printed a
 *        warning and exited 0 — a cleanliness gate that could not fail;
 *     3. the marker was written before the first MUTATION rather than before the RUN, so
 *        during the ~30-60 s of baseline suites a run was live with no marker, while
 *        `SAFETY.md` said no marker means no run. A reader following that document in that
 *        window would have "recovered" a live measurement.
 *   All three are the paper's own subject, in the instrument built to measure it. Kept
 *   written down rather than quietly fixed, because that is the point.
 *
 *   Nothing outside `src/frame.ts`, `src/lint/measure.ts` and this directory is written.
 *
 * USAGE
 *   node paper/experiments/mutation/run.mjs            # full run (primary + secondary)
 *   node paper/experiments/mutation/run.mjs --verify   # only check every `find` is unique
 *   node paper/experiments/mutation/run.mjs --check    # 0 clean · 1 left behind · 2 run live
 *   node paper/experiments/mutation/run.mjs --recover  # put the files back (refuses if live)
 *   node paper/experiments/mutation/run.mjs --only frame-12,measure-03
 *   node paper/experiments/mutation/run.mjs --no-secondary
 *
 * OUTPUT
 *   paper/experiments/mutation/results.json
 */

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SPEC = JSON.parse(readFileSync(join(HERE, "mutants.json"), "utf8"));
const STARTED = new Date().toISOString();

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flagValue = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const only = flagValue("--only")
  ?.split(",")
  .map((s) => s.trim());
const runSecondary = !has("--no-secondary");

/** Files under mutation, with their pristine bytes. */
const FILES = [...new Set(SPEC.mutants.map((m) => m.file))];
const pristine = new Map(FILES.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));

/**
 * The marker answers ONE question: **is a run executing right now?** — not "is the tree
 * mutated". Conflating those two is what made the first version of this file dangerous.
 *
 * It was originally written just before the first mutation, on the reasoning that the
 * mutated window is the risky one. But the baseline suites run first and take ~30-60 s, so
 * a run could be live with no marker on disk, while `SAFETY.md` told the reader that no
 * marker means "no run is executing — safe to recover". A reader who followed that
 * document during the baseline window would have concluded a live measurement was a
 * leftover. It is now written BEFORE the baselines — before anything the run does at all —
 * and carries a `phase` so a reader can tell a baseline from a mutation window.
 *
 * It is also the one part of the safety story that survives a kill the process cannot trap
 * (`taskkill /F`, an outer runner's timeout, power loss): the in-memory restore is gone in
 * that case, but this file is still on disk, so the next invocation refuses to start and
 * `--check` can say "left behind — recover" instead of "no run, all clear".
 *
 * Written through `fsync`, because the whole point is to be readable by another process
 * after this one dies abruptly, and a buffered write is exactly what a hard kill discards.
 */
const SENTINEL = join(HERE, ".run-in-progress.json");

function markRun(phase, selectedIds) {
  const body = `${JSON.stringify({ pid: process.pid, started: STARTED, phase, files: FILES, mutants: selectedIds }, null, 2)}\n`;
  const fd = openSync(SENTINEL, "w");
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
const clearInProgress = () => existsSync(SENTINEL) && rmSync(SENTINEL);
const readMarker = () => {
  try {
    return JSON.parse(readFileSync(SENTINEL, "utf8"));
  } catch {
    return null;
  }
};

/**
 * Is that pid still running? `signal 0` performs the permission/existence check without
 * delivering anything, and `EPERM` means the process exists but belongs to someone else.
 *
 * Caveat worth knowing rather than hiding: an operating system may reuse a pid, so a very
 * old marker could name a live unrelated process. `started` is in the file so a human can
 * sanity-check the age; nothing here should be trusted over looking at the process table.
 */
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

function restoreAll() {
  for (const [f, text] of pristine) writeFileSync(join(ROOT, f), text);
}

/**
 * Restore + un-mark, then leave. Registered for every exit path the process can observe:
 * a signal, an uncaught throw, and a rejected promise nobody awaited. `restoreAll` is
 * idempotent, so running it twice on the way out costs nothing.
 */
function bailOut(reason, code) {
  restoreAll();
  clearInProgress();
  console.error(`\n${reason} — restored ${FILES.join(", ")} from the in-memory pristine copy.`);
  process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => bailOut(`received ${sig}`, 130));
process.on("uncaughtException", (e) => bailOut(`uncaught exception: ${e?.stack ?? e}`, 1));
process.on("unhandledRejection", (e) => bailOut(`unhandled rejection: ${e?.stack ?? e}`, 1));

/**
 * Which of the mutated files differ from HEAD, compared against HEAD SPECIFICALLY rather
 * than "does git see a modification" — a staged mutation is still a mutation, and
 * `git status --porcelain` reports the same string for a staged and an unstaged one while
 * `diff HEAD` is the question actually being asked: *is the source on disk the committed
 * source?*
 */
function driftedFromHead() {
  const r = spawnSync("git", ["diff", "--name-only", "HEAD", "--", ...FILES], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git diff failed: ${(r.stderr || "").trim()}`);
  return (r.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const RECOVER_CMD = "node paper/experiments/mutation/run.mjs --recover";

/**
 * The post-condition, as a boolean: are the files under mutation the committed ones? Used
 * by the run itself. `--check` is the user-facing wrapper below, which adds the part that
 * matters to a human — WHY the tree is mutated.
 */
function checkClean(context) {
  const drifted = driftedFromHead();
  if (drifted.length === 0) {
    console.log(`tree clean: ${FILES.join(", ")} match HEAD`);
    return true;
  }
  console.error(
    `\nMUTATION LEFT IN THE TREE${context ? ` (${context})` : ""} — these files do NOT match HEAD:\n` +
      drifted.map((f) => `  ${f}`).join("\n") +
      `\n\n${spawnSync("git", ["diff", "HEAD", "--", ...drifted], { cwd: ROOT, encoding: "utf8" }).stdout}` +
      `\nRECOVER WITH:  ${RECOVER_CMD}\n`,
  );
  return false;
}

/**
 * `--check`: THREE states, three exit codes, because "the tree is mutated" is not one
 * situation but two with opposite correct responses.
 *
 *   0 — clean, or a live run that has not mutated anything yet. Nothing to do.
 *   1 — a mutation was LEFT BEHIND and no run is executing. Recover.
 *   2 — a run is LIVE. **Do not restore anything**; you would corrupt a measurement.
 *
 * The previous version said the same thing in both of the last two cases, which is what
 * made it unsafe to act on: a reader who did what it told them would have un-mutated a
 * running experiment. That is not a hypothetical — it happened, twice, to this file.
 */
function checkState() {
  const marker = readMarker();
  const drifted = driftedFromHead();
  const live = marker && isAlive(marker.pid);

  if (live) {
    console.log(
      `A RUN IS LIVE — pid ${marker.pid}, started ${marker.started}, phase "${marker.phase}".\n` +
        (drifted.length
          ? `  ${drifted.join(", ")} currently carries a PLANTED MUTATION. This is expected.\n`
          : `  Nothing is mutated at this instant (the baseline suites run before any mutation).\n`) +
        `  DO NOT restore, checkout or edit those files — you would corrupt the measurement.\n` +
        `  Wait for it, or stop it with Ctrl+C (which restores). A forced kill does not.`,
    );
    return 2;
  }

  if (marker && drifted.length === 0) {
    // A hard-killed run whose restore happened to have completed, or a run killed during a
    // baseline. Clearing it matters: a stale marker that nothing removes would make every
    // future run refuse to start, which turns the guard into a denial of service.
    console.log(
      `stale marker from a dead run (pid ${marker.pid}, started ${marker.started}) — the tree is already clean; clearing it`,
    );
    clearInProgress();
    return 0;
  }

  if (drifted.length === 0) {
    console.log(`tree clean: ${FILES.join(", ")} match HEAD`);
    return 0;
  }

  console.error(
    `\nMUTATION LEFT BEHIND — no run is executing${marker ? ` (marker names dead pid ${marker.pid}, started ${marker.started})` : " and there is no marker"}.\n` +
      drifted.map((f) => `  ${f}`).join("\n") +
      `\n\n${spawnSync("git", ["diff", "HEAD", "--", ...drifted], { cwd: ROOT, encoding: "utf8" }).stdout}` +
      `\nRECOVER WITH:  ${RECOVER_CMD}\n`,
  );
  return 1;
}

/** Put the mutated files back to their committed contents and clear the in-progress mark. */
function recover() {
  const marker = readMarker();
  if (marker && isAlive(marker.pid)) {
    // The single most destructive thing this script could do: un-mutate a live experiment.
    // `--recover` exists for the aftermath of a dead run, and must refuse otherwise.
    console.error(
      `REFUSING TO RECOVER: a run is LIVE (pid ${marker.pid}, started ${marker.started}, phase "${marker.phase}").\n` +
        `Restoring now would corrupt its measurement. Wait for it, or stop it with Ctrl+C.`,
    );
    return 2;
  }
  if (marker)
    console.log(`found an interrupted run: pid ${marker.pid}, started ${marker.started}, phase "${marker.phase}"`);
  const before = driftedFromHead();
  if (before.length === 0) {
    console.log("nothing to recover: the files under mutation already match HEAD");
  } else {
    const r = spawnSync("git", ["checkout", "HEAD", "--", ...before], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) {
      console.error(`git checkout failed: ${(r.stderr || "").trim()}`);
      return 1;
    }
    console.log(`restored from HEAD: ${before.join(", ")}`);
  }
  clearInProgress();
  return checkClean("after --recover") ? 0 : 1;
}

/** Every `find` must occur EXACTLY once in its file. */
function verify() {
  const problems = [];
  const ids = new Set();
  for (const m of SPEC.mutants) {
    if (ids.has(m.id)) problems.push(`${m.id}: duplicate id`);
    ids.add(m.id);
    const src = pristine.get(m.file);
    if (src === undefined) problems.push(`${m.id}: unknown file ${m.file}`);
    else {
      const n = src.split(m.find).length - 1;
      if (n !== 1) problems.push(`${m.id}: \`find\` occurs ${n}x in ${m.file} (must be exactly 1)`);
      if (m.find === m.replace) problems.push(`${m.id}: find === replace`);
    }
  }
  return problems;
}

/** Run vitest over an explicit list of test files. Returns { passed, ms, code }. */
function runTests(files) {
  const t0 = Date.now();
  // Invoke vitest's own entry with the current node — no shell, no .cmd shim, so the
  // harness behaves identically under cmd.exe, PowerShell and Git Bash.
  const r = spawnSync(
    process.execPath,
    [join(ROOT, "node_modules/vitest/vitest.mjs"), "run", ...files, "--reporter=dot", "--no-color"],
    { cwd: ROOT, encoding: "utf8", timeout: 600_000, env: { ...process.env, CI: "1", FORCE_COLOR: "0" } },
  );
  if (r.error) throw new Error(`could not run vitest: ${r.error.message}`);
  return { passed: r.status === 0, code: r.status, ms: Date.now() - t0, stderrTail: (r.stderr || "").slice(-400) };
}

function applyMutant(m) {
  const src = pristine.get(m.file);
  writeFileSync(join(ROOT, m.file), src.replace(m.find, m.replace));
}

async function main() {
  // Both of these run BEFORE anything else, because both are things you reach for when a
  // run has already gone wrong and you need the tree back.
  if (has("--check")) process.exit(checkState());
  if (has("--recover")) process.exit(recover());

  // "Is the source on disk the committed source?" comes FIRST, before the spec is even
  // read. A leftover mutation usually destroys the `find` anchor it was made from, so
  // `verify()` would refuse too — but it refuses with "`find` occurs 0x", which sends the
  // reader to `mutants.json` when the actual problem is a corrupted working tree. The
  // guard has to be the thing that speaks, or its message never gets read.
  //
  // An interrupted run also leaves a mark on disk: the tree may or may not still be
  // mutated, but either way a second run would snapshot whatever is there as its
  // "pristine" baseline and then faithfully restore the corruption at the end.
  if (existsSync(SENTINEL)) {
    const s = JSON.parse(readFileSync(SENTINEL, "utf8"));
    console.error(
      `REFUSING TO RUN: a previous run (pid ${s.pid}, started ${s.started}) did not finish.\n` +
        `Its mutation may still be in the tree, and this run would adopt it as the baseline.\n` +
        `RECOVER WITH:  ${RECOVER_CMD}`,
    );
    process.exit(1);
  }
  const driftedBefore = driftedFromHead();
  if (driftedBefore.length) {
    console.error(
      `REFUSING TO RUN: the files under mutation do not match HEAD:\n` +
        driftedBefore.map((f) => `  ${f}`).join("\n") +
        `\nA mutation score measured against uncommitted source says nothing about the committed one.` +
        `\nIf this is a leftover mutation rather than your own edit:  ${RECOVER_CMD}`,
    );
    process.exit(1);
  }

  const problems = verify();
  if (problems.length) {
    console.error("MUTANT SPEC INVALID:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`verified ${SPEC.mutants.length} mutants: every \`find\` matches its file exactly once`);
  if (has("--verify")) return;

  const selected = SPEC.mutants.filter((m) => !only || only.includes(m.id));

  const results = [];
  const started = STARTED;
  const selectedIds = selected.map((m) => m.id);
  let clean = false;

  // MARK FIRST, before the run does anything at all — not before the first mutation.
  // The marker answers "is a run executing?", and the baseline suites below take ~30-60 s
  // during which a run is very much executing. Marking at the mutation boundary left that
  // window live-but-unmarked, and `SAFETY.md` told readers that no marker means no run:
  // following that document during the baselines would have led someone to "recover" a
  // measurement in flight. Cheap to move, and it removes the whole class.
  markRun("baseline", selectedIds);

  try {
    // Baseline: every suite that will be used must be green on the pristine tree.
    const baseline = {};
    for (const [file, suites] of Object.entries(SPEC.suites)) {
      if (!selected.some((m) => m.file === file)) continue;
      baseline[file] = { primary: runTests(suites.primary) };
      if (runSecondary) baseline[file].secondary = runTests(suites.secondary);
      for (const [tier, res] of Object.entries(baseline[file])) {
        console.log(`baseline ${file} ${tier}: ${res.passed ? "PASS" : "FAIL"} (${res.ms} ms)`);
        if (!res.passed) {
          bailOut("BASELINE IS RED — the measurement would be meaningless. Aborting", 1);
        }
      }
    }

    // Phase change only — the marker already exists, written before the baselines. From
    // here until the `finally`, a mutation may be on disk at any instant, and anyone
    // reading the tree in that window sees source that is deliberately wrong.
    markRun("mutating", selectedIds);

    for (const [i, m] of selected.entries()) {
      const suites = SPEC.suites[m.file];
      applyMutant(m);
      const primary = runTests(suites.primary);
      let secondary = null;
      if (!primary.passed) {
        // killed by its own suite; no need to widen
      } else if (runSecondary) {
        secondary = runTests(suites.secondary);
      }
      restoreAll();
      const verdict = !primary.passed
        ? "killed-primary"
        : secondary && !secondary.passed
          ? "killed-secondary"
          : "survived";
      results.push({
        id: m.id,
        file: m.file,
        kind: m.kind,
        note: m.note,
        primarySuite: suites.primary,
        primaryKilled: !primary.passed,
        secondarySuite: secondary ? suites.secondary : null,
        secondaryKilled: secondary ? !secondary.passed : null,
        verdict,
        ms: primary.ms + (secondary?.ms ?? 0),
      });
      console.log(
        `[${String(i + 1).padStart(2)}/${selected.length}] ${m.id.padEnd(11)} ${verdict.padEnd(16)} ${m.note}`,
      );
    }
  } finally {
    // Restore AND un-mark in the same block, so there is no path that puts the source
    // back without also retiring the marker — and none that retires the marker while the
    // tree is still wrong. A dirty tree KEEPS the marker on purpose: that is what makes
    // the next invocation refuse instead of adopting the corruption as its baseline.
    restoreAll();
    clean = checkClean("after the run");
    if (clean) clearInProgress();
  }
  const killedPrimary = results.filter((r) => r.verdict === "killed-primary").length;
  const killedAny = results.filter((r) => r.verdict !== "survived").length;
  const perFile = {};
  for (const r of results) {
    perFile[r.file] ??= { total: 0, killedPrimary: 0, killedAny: 0, survived: [] };
    const f = perFile[r.file];
    f.total++;
    if (r.verdict === "killed-primary") f.killedPrimary++;
    if (r.verdict !== "survived") f.killedAny++;
    else f.survived.push(r.id);
  }

  const out = {
    experiment: "mutation testing of src/lint/measure.ts and src/frame.ts",
    started,
    finished: new Date().toISOString(),
    node: process.version,
    vitest: JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).devDependencies?.vitest ?? null,
    commit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim(),
    definitions: {
      "killed-primary": "the module's DEDICATED test file(s) fail on the mutant",
      "killed-secondary": "the dedicated file(s) pass but a fixed set of whole-plan suites that reach the module fail",
      survived: "neither tier fails; the mutant is undetected (or semantically equivalent)",
    },
    suites: SPEC.suites,
    totals: {
      mutants: results.length,
      killedByDedicatedSuite: killedPrimary,
      killedByAnySuite: killedAny,
      survived: results.length - killedAny,
      mutationScoreDedicated: results.length ? killedPrimary / results.length : null,
      mutationScoreAny: results.length ? killedAny / results.length : null,
    },
    perFile,
    treeCleanAfterRun: clean,
    results,
  };
  writeFileSync(join(HERE, "results.json"), `${JSON.stringify(out, null, 2)}\n`);

  console.log("");
  console.log(`mutants:                    ${results.length}`);
  console.log(`killed by dedicated suite:  ${killedPrimary}/${results.length}`);
  console.log(`killed by any suite:        ${killedAny}/${results.length}`);
  console.log(`survived:                   ${results.length - killedAny}`);
  for (const [f, s] of Object.entries(perFile)) {
    console.log(
      `  ${f}: dedicated ${s.killedPrimary}/${s.total}, any ${s.killedAny}/${s.total}` +
        (s.survived.length ? ` — survivors: ${s.survived.join(", ")}` : ""),
    );
  }
  console.log("wrote paper/experiments/mutation/results.json");
  if (!clean) {
    // Loud AND non-zero. A run that records its own corruption in a JSON field and exits 0
    // is not a guard: the exit code is the only part of this a caller, a CI step or a
    // teammate reads. The scores above are still valid — every verdict was measured before
    // the tree was left dirty — but nothing else may run until the tree is repaired.
    console.error(`\nTHE WORKING TREE IS STILL MUTATED. Repair it before anything else runs:  ${RECOVER_CMD}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  restoreAll();
  clearInProgress();
  console.error(e?.stack ?? e);
  process.exit(1);
});
