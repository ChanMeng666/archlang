/** Every apt install in ci.yml and nightly.yml runs inside an `apt-debs` restore/save pair, and the warm-up workflow installs each set the way its jobs do. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

const ACTION_PATH = ".github/actions/apt-debs/action.yml";
const ACTION = `./${ACTION_PATH.replace(/\/action\.yml$/, "")}`;
const WARM_PATH = ".github/workflows/apt-cache-warm.yml";
const CI_PATH = ".github/workflows/ci.yml";
const NIGHTLY_PATH = ".github/workflows/nightly.yml";
const GATED = [CI_PATH, NIGHTLY_PATH];
/** A GitHub expression, `${{ body }}`, built so no source string holds a template-like `${`. */
const expr = (body: string) => ["$", `{{ ${body} }}`].join("");
/** The version input every restore passes: the job's resolved Playwright version. */
const PW_VERSION = expr("steps.pw.outputs.version");
/** The only `if:` a ci.yml apt-debs step may carry: the job's FULL_CI step guard. */
const FULL_CI_GUARD = "env.FULL_CI == 'true'";

type Step = { fields: Map<string, string>; with: Map<string, string>; env: Map<string, string>; run: string };
type Job = { id: string; steps: Step[] };

/** A workflow's jobs and their steps, read as text: `- ` at six spaces starts a step. */
function jobs(path: string): Job[] {
  const yml = read(path);
  const out: Job[] = [];
  let job: Job | undefined;
  let step: Step | undefined;
  let block: "run" | "with" | "env" | undefined;
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
      step = { fields: new Map(), with: new Map(), env: new Map(), run: "" };
      job.steps.push(step);
    }
    if (/^ {0,5}\S/.test(line)) step = undefined;
    if (!step) continue;
    if (field?.[1] !== undefined && field[2] !== undefined) {
      step.fields.set(field[1], field[2]);
      block = field[1] === "run" || field[1] === "with" || field[1] === "env" ? field[1] : undefined;
      if (block === "run" && !/^[|>]-?$/.test(field[2])) step.run = field[2];
      continue;
    }
    if (block === "run" && /^ {10}/.test(line)) step.run += `${step.run ? "\n" : ""}${line.trim()}`;
    const w = /^ {10}([A-Za-z_-]+): (.*)$/.exec(line);
    if (block === "with" && w?.[1] && w[2] !== undefined) step.with.set(w[1], w[2]);
    if (block === "env" && w?.[1] && w[2] !== undefined) step.env.set(w[1], w[2]);
  }
  return out;
}

/** An apt install, however it is spelled: Playwright's deps installers, apt-get, apt, aptitude or dpkg, sudo or not. */
const APT = /\binstall-deps\b|--with-deps\b|\bapt-get\b|\baptitude\b|\bapt\s|\bdpkg\s+(?:-i|--install)\b/;
const isApt = (s: Step) => APT.test(s.run);
const mode = (s: Step) => (s.fields.get("uses") === ACTION ? s.with.get("mode") : undefined);

/** A job's apt-debs set, its Playwright package and its install commands with the browsers cached. */
type Use = { where: string; set: string; pkg: string; deps: string[]; commands: string | undefined };

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
    const save = job.steps[s] as Step;
    expect(restore.with.get("version"), where).toBe(PW_VERSION);
    expect(save.with.get("set"), `${where}: the save names the restore's set`).toBe(restore.with.get("set"));
    // The pair runs whenever the installs can: under ci.yml's step guard, unguarded elsewhere.
    const guard = path === CI_PATH ? FULL_CI_GUARD : undefined;
    expect(restore.fields.get("if"), `${where}: the restore's if`).toBe(guard);
    expect(save.fields.get("if"), `${where}: the save's if`).toBe(guard);
    const pw = job.steps.find((x) => x.fields.get("id") === "pw");
    const pkg = /require\('([^']+)\/package\.json'\)\.version/.exec(pw?.run ?? "")?.[1];
    expect(pkg, `${where}: the pw step resolves a package`).toBeDefined();
    const runs = job.steps.slice(r + 1, s).map((x) => x.run);
    const deps = runs.filter((x) => !x.includes("--with-deps"));
    // The browser-cache miss path installs the same system packages as the hit path.
    for (const x of runs.filter((y) => y.includes("--with-deps")))
      expect(deps, `${where}: ${x}`).toContain(x.replace("install --with-deps", "install-deps"));
    out.push({
      where,
      set: restore.with.get("set") ?? "",
      pkg: pkg as string,
      deps,
      commands: restore.with.get("commands"),
    });
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

/** One step of the composite action, from its `- name:` line to the next step's. */
function actionStep(name: string): string {
  const yml = read(ACTION_PATH);
  const at = yml.indexOf(`\n    - name: ${name}\n`);
  expect(at, `${ACTION_PATH}: a step named "${name}"`).toBeGreaterThan(-1);
  const next = yml.indexOf("\n    - name: ", at + 1);
  return yml.slice(at + 1, next === -1 ? undefined : next + 1);
}

/** The full-length SHAs a file pins actions/cache (or its restore/save halves) at. */
const cachePins = (text: string) =>
  [...text.matchAll(/uses: actions\/cache(?:\/(?:restore|save))?@([0-9a-f]{40}) /g)].map((m) => m[1]);

describe("the apt-debs cache", () => {
  // Read inside each case, so a broken pair fails a case rather than the file's collection.
  const all = () => GATED.flatMap(uses);

  it("wraps every apt install of ci.yml and nightly.yml, the jobs that use it included", () => {
    const ids = all().map((u) => u.where);
    for (const job of ["e2e-playground-chromium", "e2e-playground-engines", "check-3d-pass", "e2e-docs-shard"])
      expect(ids).toContain(`${CI_PATH} ${job}`);
    for (const job of ["e2e-prod", "cross-engine"]) expect(ids).toContain(`${NIGHTLY_PATH} ${job}`);
  });

  it("counts any spelling of an apt install as one", () => {
    const step = (run: string): Step => ({ fields: new Map(), with: new Map(), env: new Map(), run });
    for (const run of [
      "sudo apt install -y ffmpeg",
      "apt-get install ffmpeg",
      "sudo -E apt-get -qq update",
      "sudo aptitude install ffmpeg",
      "sudo dpkg -i ./x.deb",
      "npx playwright install-deps chromium",
      "npx playwright install --with-deps chromium",
    ])
      expect(isApt(step(run)), run).toBe(true);
    for (const run of ["npm run build", "echo apt-debs", "npx playwright install chromium"])
      expect(isApt(step(run)), run).toBe(false);
  });

  it("gives one set one package list: every job of a set installs and keys exactly what its warm-up row installs", () => {
    const rows = warmRows();
    const used = all();
    expect([...rows.keys()].sort()).toEqual([...new Set(used.map((u) => u.set))].sort());
    for (const u of used) {
      const row = rows.get(u.set);
      expect(row?.pkg, u.where).toBe(u.pkg);
      expect(row?.install, u.where).toBe(asWarm(u.deps));
      // The key hashes the commands the job runs, so a changed command never reads an old entry as its own.
      expect(u.commands, `${u.where}: the restore's commands`).toBe(asWarm(u.deps));
    }
  });

  it("the warm-up keys on the version the jobs resolve and saves what its one install step installed", () => {
    const warm = jobs(WARM_PATH);
    expect(warm.map((j) => j.id)).toEqual(["warm"]);
    const steps = (warm[0] as Job).steps;
    const r = steps.findIndex((s) => mode(s) === "restore");
    const s = steps.findIndex((x) => mode(x) === "save");
    const p = steps.findIndex((x) => x.fields.get("id") === "pw");
    expect(steps.filter((x) => mode(x) !== undefined).map(mode)).toEqual(["restore", "save"]);
    expect(p > -1 && p < r && r < s, "pw, then restore, then save").toBe(true);
    // Exactly the matrix row's install between the pair.
    const between = steps.slice(r + 1, s);
    expect(between, "one step between restore and save").toHaveLength(1);
    const install = between[0] as Step;
    expect(install.env.get("INSTALL")).toBe(expr("matrix.install"));
    expect(install.run).toBe('bash -c "$INSTALL"');
    for (const x of [steps[r], install, steps[s]] as Step[])
      expect(x.fields.get("if"), "no if on the warm-up's pair").toBeUndefined();
    const restore = steps[r] as Step;
    expect(restore.with.get("set")).toBe(expr("matrix.set"));
    expect(restore.with.get("version")).toBe(PW_VERSION);
    expect(restore.with.get("commands")).toBe(expr("matrix.install"));
    expect((steps[s] as Step).with.get("set")).toBe(expr("matrix.set"));
    expect(steps[p]?.run).toContain("require(process.env.PKG + '/package.json').version");
  });

  it("the warm-up is no PR check: main, a schedule and a dispatch only, read-only, with a timeout", () => {
    const yml = read(WARM_PATH);
    const on = yml.slice(yml.indexOf("\non:\n"), yml.indexOf("\npermissions:\n"));
    expect([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1])).toEqual(["schedule", "workflow_dispatch", "push"]);
    expect(on).toContain("    branches: [main]");
    expect(yml).toContain("\npermissions:\n  contents: read\n");
    // A job-level block would widen the workflow's read-only token.
    expect(yml.slice(yml.indexOf("\njobs:\n"))).not.toMatch(/^ +permissions:/m);
    expect(yml).toMatch(/\n {4}timeout-minutes: \d+\n/);
  });

  it("pins actions/cache once: the action's restore and save and nightly.yml's caches are at ci.yml's SHA", () => {
    const ci = new Set(cachePins(read(CI_PATH)));
    expect(ci.size).toBe(1);
    const action = cachePins(read(ACTION_PATH));
    expect(action).toHaveLength(2);
    expect(new Set(action)).toEqual(ci);
    const nightly = cachePins(read(NIGHTLY_PATH));
    expect(nightly.length).toBeGreaterThan(0);
    expect(new Set(nightly)).toEqual(ci);
  });

  it("the action restores the newest entry of its key by prefix and saves only a new suffixed one", () => {
    const key = actionStep("Keep apt's downloads, and build the key");
    expect(key).toContain(`hash=$(printf '%s' "$COMMANDS" | sha256sum | cut -c1-12)`);
    expect(key).toContain(`commands_prefix="\${set_prefix}\${hash}-"`);
    expect(key).toContain(`base=\${commands_prefix}\${ImageVersion:-unknown}-\${VERSION}`);

    const restore = actionStep("Restore the cached debs");
    expect(restore).toContain("        path: ~/apt-debs\n");
    expect(restore).toContain(`        key: ${expr("steps.key.outputs.base")}_run\n`);
    expect(restore).toContain(
      [
        "        restore-keys: |",
        `          ${expr("steps.key.outputs.base")}_run`,
        `          ${expr("steps.key.outputs.commands-prefix")}`,
        `          ${expr("steps.key.outputs.set-prefix")}`,
      ].join("\n"),
    );

    // No skip on an exact hit: an incomplete entry under this key must be superseded, never kept.
    expect(read(ACTION_PATH)).not.toContain("cache-hit");
    const collect = actionStep("Collect the debs apt used");
    // The three ways not to save: no restore, nothing installed from the archive, nothing added.
    expect(collect.match(/save=false/g)).toHaveLength(3);
    const same = collect.indexOf('cmp -s "$RUNNER_TEMP/apt-keep" "$RUNNER_TEMP/apt-debs-restored"');
    expect(same).toBeGreaterThan(-1);
    expect(same).toBeLessThan(collect.indexOf("save=true"));
    expect(collect).toContain(`key=\${APT_DEBS_KEY}_run\${GITHUB_RUN_ID}-\${GITHUB_RUN_ATTEMPT}`);

    const save = actionStep("Save the debs");
    expect(save).toContain("      if: inputs.mode == 'save' && steps.collect.outputs.save == 'true'\n");
    expect(save).toContain("        path: ~/apt-debs\n");
    expect(save).toContain(`        key: ${expr("steps.collect.outputs.key")}\n`);
  });
});
