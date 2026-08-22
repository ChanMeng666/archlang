/**
 * Survivor triage: is a surviving mutant EQUIVALENT, or merely UNTESTED?
 *
 * For each (mutant, probe plan) pair below, this compiles the plan with the pristine
 * source and again with the mutant applied, and compares the rendered SVG byte-for-byte.
 * A differing hash is a WITNESS: the mutant changes observable compiler output on a plan
 * a user could write, so it survived because nothing tests that behaviour — not because
 * it is semantically equivalent.
 *
 * Each compile runs in a FRESH child process (`--probe`), because `compile()` memoizes
 * and the module graph would otherwise be cached across the mutation.
 *
 * USAGE: npx tsx paper/experiments/mutation/witness.mts
 * OUTPUT: paper/experiments/mutation/witness-results.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SPEC = JSON.parse(readFileSync(join(HERE, "mutants.json"), "utf8"));

/** Plans chosen to exercise exactly the behaviour each survivor touches. */
const PROBES: Record<string, string> = {
  // A curved wall inside a MIRRORED instance: `transformArc` must reverse the sweep.
  "frame-24": `plan "probe" {
  component c() {
    wall id=w exterior thickness 200 { (0,0) arc (3000,1000) radius 2500 (3000,4000) close }
  }
  place c() as a at (0,0)
  place c() as b at (8000,0) mirror x
}
`,
  // Same plan: `transformArc`'s `start` angle feeds the drawn arc.
  "frame-25": `plan "probe" {
  component c() {
    wall id=w exterior thickness 200 { (0,0) arc (3000,1000) radius 2500 (3000,4000) close }
  }
  place c() as a at (0,0)
  place c() as b at (8000,0) mirror x
}
`,
  // A quarter-turned instance: `swapsAxes` decides whether w/h swap.
  "frame-17": `plan "probe" {
  component c() {
    room id=r at (0,0) size 4000x2000
    column id=k at (1000,1000) size 400x800
  }
  place c() as a at (0,0) rotate 90
}
`,
  // A mirrored instance: `reflected` drives the door-swing and dim-offset flips.
  "frame-27": `plan "probe" {
  component c() {
    wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000
    door id=d on w at 50% width 900 swing in
    dim (0,0)->(4000,0) offset 300
  }
  place c() as a at (0,0) mirror x
}
`,
  // Fixture clearance: the facing direction `frontGapMm` reads.
  "measure-08": null as unknown as string,
  "measure-19": null as unknown as string,
  "measure-20": null as unknown as string,
};

// The three `measure` survivors are not reachable through rendered SVG (the module only
// shapes lint PROSE), so they are probed through `lint()` message text instead.
const LINT_PROBE = `plan "probe" {
  wall id=w exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r at (0,0) size 5000x4000 uses bathroom
  furniture id=f1 basin at (0,0) size 600x400 rotate 180
  furniture id=f2 shower at (200,500) size 900x900
  door id=d on w at 50% width 900
  furniture id=f3 counter at (2200,300) size 1000x600
}
`;
for (const id of ["measure-08", "measure-19", "measure-20"]) PROBES[id] = LINT_PROBE;

const MODE_LINT = new Set(["measure-08", "measure-19", "measure-20"]);

/** Child mode: compile/lint one plan and print a hash of the observable output. */
if (process.argv.includes("--probe")) {
  const src = readFileSync(process.argv[process.argv.indexOf("--probe") + 1] as string, "utf8");
  const mode = process.argv.includes("--lint") ? "lint" : "svg";
  const { compile, lint } = await import(`file://${join(ROOT, "src/index.ts").replace(/\\/g, "/")}`);
  const r = compile(src, { noCache: true });
  const payload =
    mode === "lint"
      ? JSON.stringify(lint(src).map((d: { code?: string; message: string }) => `${d.code}: ${d.message}`))
      : r.svg;
  process.stdout.write(
    createHash("sha256")
      .update(payload ?? "")
      .digest("hex"),
  );
  process.exit(0);
}

const files = [...new Set(SPEC.mutants.map((m: { file: string }) => m.file))] as string[];
const pristine = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
const restore = () => {
  for (const [f, t] of pristine) writeFileSync(join(ROOT, f), t);
};
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

function probeHash(planFile: string, lintMode: boolean): string {
  const r = spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      fileURLToPath(import.meta.url),
      "--probe",
      planFile,
      ...(lintMode ? ["--lint"] : []),
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
  );
  if (r.status !== 0) throw new Error(`probe failed: ${r.stderr?.slice(-800)}`);
  return r.stdout.trim();
}

const survivors = (process.argv.slice(2).filter((a) => !a.startsWith("--")) ?? []).length
  ? process.argv.slice(2).filter((a) => !a.startsWith("--"))
  : Object.keys(PROBES);

const out: unknown[] = [];
try {
  for (const id of survivors) {
    const m = SPEC.mutants.find((x: { id: string }) => x.id === id);
    if (!m) throw new Error(`unknown mutant ${id}`);
    const planFile = join(HERE, `_probe-${id}.arch`);
    writeFileSync(planFile, PROBES[id] as string);
    const lintMode = MODE_LINT.has(id);

    restore();
    const before = probeHash(planFile, lintMode);
    writeFileSync(join(ROOT, m.file), (pristine.get(m.file) as string).replace(m.find, m.replace));
    const after = probeHash(planFile, lintMode);
    restore();

    const differs = before !== after;
    out.push({ id, note: m.note, mode: lintMode ? "lint messages" : "rendered SVG", before, after, differs });
    console.log(`${id.padEnd(11)} ${differs ? "WITNESS FOUND — output differs" : "no witness on this probe"}`);
  }
} finally {
  restore();
}

writeFileSync(
  join(HERE, "witness-results.json"),
  `${JSON.stringify(
    {
      experiment: "survivor triage — does a surviving mutant change observable output?",
      generatedAt: new Date().toISOString(),
      meaning: {
        differs: "the mutant is NOT equivalent; it survived because the behaviour is untested",
        same: "this probe does not distinguish the mutant (consistent with, but not proof of, equivalence)",
      },
      results: out,
    },
    null,
    2,
  )}\n`,
);
console.log("wrote paper/experiments/mutation/witness-results.json");
