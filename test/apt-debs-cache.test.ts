/** Every apt install in ci.yml and nightly.yml runs inside an `apt-debs` restore/save pair, and the warm-up workflow installs each set the way its jobs do. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const ACTION_PATH = ".github/actions/apt-debs/action.yml";
const ACTION = `./${ACTION_PATH.replace(/\/action\.yml$/, "")}`;
const WARM_PATH = ".github/workflows/apt-cache-warm.yml";
const GATED = [".github/workflows/ci.yml", ".github/workflows/nightly.yml"];
/** The version input every restore passes: the job's resolved Playwright version. */
const PW_VERSION = ["$", "{{ steps.pw.outputs.version }}"].join("");

type Step = { fields: Map<string, string>; with: Map<string, string>; run: string };
type Job = { id: string; steps: Step[] };

/** A workflow's jobs and their steps, read as text: `- ` at six spaces starts a step. */
function jobs(path: string): Job[] {
  const yml = read(path);
  const out: Job[] = [];
  let job: Job | undefined;
  let step: Step | undefined;
  let block: "run" | "with" | undefined;
  for (const line of yml.slice(yml.indexOf("\njobs:\n") + 1).split("\n")) {
    const id = /^ {2}([A-Za-z0-9_-]+):$/.exec(line);
    if (id?.[1]) {
      job = { id: id[1], steps: [] };
      out.push(job);
      step = undefined;
      continue;
    }
    if (!job) continue;
    const start = /^ {6}- ([a-z-]+): ?(.*)$/.exec(line);
    const field = start ?? /^ {8}([a-z-]+): ?(.*)$/.exec(line);
    if (start) {
      step = { fields: new Map(), with: new Map(), run: "" };
      job.steps.push(step);
    }
    if (/^ {0,5}\S/.test(line)) step = undefined;
    if (!step) continue;
    if (field?.[1] !== undefined && field[2] !== undefined) {
      step.fields.set(field[1], field[2]);
      block = field[1] === "run" ? "run" : field[1] === "with" ? "with" : undefined;
      if (block === "run" && !/^[|>]-?$/.test(field[2])) step.run = field[2];
      continue;
    }
    if (block === "run" && /^ {10}/.test(line)) step.run += `${step.run ? "\n" : ""}${line.trim()}`;
    const w = /^ {10}([a-z-]+): (.*)$/.exec(line);
    if (block === "with" && w?.[1] && w[2] !== undefined) step.with.set(w[1], w[2]);
  }
  return out;
}

const APT = /\binstall-deps\b|--with-deps\b|\bapt-get\b/;
const isApt = (s: Step) => APT.test(s.run);
const mode = (s: Step) => (s.fields.get("uses") === ACTION ? s.with.get("mode") : undefined);

/** A job's apt-debs set, its Playwright package and its install commands with the browsers cached. */
type Use = { where: string; set: string; pkg: string; deps: string[] };

function uses(path: string): Use[] {
  const out: Use[] = [];
  for (const job of jobs(path)) {
    const where = `${path} ${job.id}`;
    const restores = job.steps.flatMap((s, i) => (mode(s) === "restore" ? [i] : []));
    const saves = job.steps.flatMap((s, i) => (mode(s) === "save" ? [i] : []));
    const apt = job.steps.flatMap((s, i) => (isApt(s) ? [i] : []));
    if (apt.length === 0 && restores.length === 0 && saves.length === 0) continue;
    expect(restores, `${where}: one apt-debs restore`).toHaveLength(1);
    expect(saves, `${where}: one apt-debs save`).toHaveLength(1);
    const [r, s] = [restores[0] as number, saves[0] as number];
    for (const i of apt) expect(r < i && i < s, `${where}: step ${i} installs outside restore..save`).toBe(true);
    // Nothing between the pair but the installs: a test step inside would run before the save.
    for (let i = r + 1; i < s; i++) expect(isApt(job.steps[i] as Step), `${where}: step ${i} is no install`).toBe(true);
    const restore = job.steps[r] as Step;
    expect(restore.with.get("version"), where).toBe(PW_VERSION);
    const pw = job.steps.find((x) => x.fields.get("id") === "pw");
    const pkg = /require\('([^']+)\/package\.json'\)\.version/.exec(pw?.run ?? "")?.[1];
    expect(pkg, `${where}: the pw step resolves a package`).toBeDefined();
    const runs = job.steps.slice(r + 1, s).map((x) => x.run);
    const deps = runs.filter((x) => !x.includes("--with-deps"));
    // The browser-cache miss path installs the same system packages as the hit path.
    for (const x of runs.filter((y) => y.includes("--with-deps")))
      expect(deps, `${where}: ${x}`).toContain(x.replace("install --with-deps", "install-deps"));
    out.push({ where, set: restore.with.get("set") ?? "", pkg: pkg as string, deps });
  }
  return out;
}

/** The warm-up's matrix rows: set, package and its install line (a folded `>-` value joined). */
function warmRows(): Map<string, { pkg: string; install: string }> {
  const yml = read(WARM_PATH);
  const rows = new Map<string, { pkg: string; install: string }>();
  let row: { pkg: string; install: string } | undefined;
  let folding = false;
  for (const line of yml.split("\n")) {
    const set = /^ {10}- set: (.*)$/.exec(line);
    if (set?.[1]) {
      row = { pkg: "", install: "" };
      rows.set(set[1], row);
      folding = false;
      continue;
    }
    const kv = /^ {12}(pkg|install): (.*)$/.exec(line);
    if (kv?.[1] && kv[2] !== undefined && row) {
      folding = kv[1] === "install" && kv[2] === ">-";
      if (kv[1] === "pkg") row.pkg = kv[2].replace(/^"(.*)"$/, "$1");
      else if (!folding) row.install = kv[2];
      continue;
    }
    if (folding && row && /^ {14}\S/.test(line)) row.install += `${row.install ? " " : ""}${line.trim()}`;
    else folding = false;
  }
  return rows;
}

/** The install line a warm-up row must hold for a job's commands: an `||` command parenthesised. */
const asWarm = (deps: string[]) => deps.map((c) => (c.includes("||") ? `(${c})` : c)).join(" && ");

describe("the apt-debs cache", () => {
  // Read inside each case, so a broken pair fails a case rather than the file's collection.
  const all = () => GATED.flatMap(uses);

  it("wraps every apt install of ci.yml and nightly.yml, the jobs that use it included", () => {
    const ids = all().map((u) => u.where);
    for (const job of ["e2e-playground-chromium", "e2e-playground-engines", "check-3d-pass", "e2e-docs-shard"])
      expect(ids).toContain(`.github/workflows/ci.yml ${job}`);
    for (const job of ["e2e-prod", "cross-engine"]) expect(ids).toContain(`.github/workflows/nightly.yml ${job}`);
  });

  it("gives one set one package list: every job of a set installs exactly what its warm-up row installs", () => {
    const rows = warmRows();
    const used = all();
    expect([...rows.keys()].sort()).toEqual([...new Set(used.map((u) => u.set))].sort());
    for (const u of used) {
      const row = rows.get(u.set);
      expect(row?.pkg, u.where).toBe(u.pkg);
      expect(row?.install, u.where).toBe(asWarm(u.deps));
    }
  });

  it("the warm-up keys on the version the jobs resolve and saves what it installed", () => {
    const warm = jobs(WARM_PATH);
    expect(warm.map((j) => j.id)).toEqual(["warm"]);
    const steps = (warm[0] as Job).steps;
    const order = steps.map((s) => mode(s) ?? (s.fields.get("id") === "pw" ? "pw" : isApt(s) ? "apt" : "-"));
    expect(order.filter((o) => o !== "-")).toEqual(["pw", "restore", "save"]);
    const pw = steps.find((s) => s.fields.get("id") === "pw");
    expect(pw?.run).toContain("require(process.env.PKG + '/package.json').version");
    expect(steps.find((s) => mode(s) === "restore")?.with.get("version")).toBe(PW_VERSION);
  });

  it("the warm-up is no PR check: main, a schedule and a dispatch only, read-only, with a timeout", () => {
    const yml = read(WARM_PATH);
    const on = yml.slice(yml.indexOf("\non:\n"), yml.indexOf("\npermissions:\n"));
    expect([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1])).toEqual(["schedule", "workflow_dispatch", "push"]);
    expect(on).toContain("    branches: [main]");
    expect(yml).toContain("\npermissions:\n  contents: read\n");
    expect(yml).toMatch(/\n {4}timeout-minutes: \d+\n/);
  });

  it("pins actions/cache once: the action's restore and save are at ci.yml's SHA", () => {
    const pin = (text: string) =>
      [...text.matchAll(/uses: actions\/cache(?:\/(?:restore|save))?@([0-9a-f]{40}) /g)].map((m) => m[1]);
    const ci = new Set(pin(read(".github/workflows/ci.yml")));
    expect(ci.size).toBe(1);
    const action = pin(read(ACTION_PATH));
    expect(action).toHaveLength(2);
    expect(new Set(action)).toEqual(ci);
  });
});
