/**
 * `archlang3d build | check | manifest | schema | doctor` (card A4; archlang-3d plan §7). Flags are
 * parsed from `manifest.ts`'s table, so a flag works exactly when the manifest lists it. Exit codes
 * as the core's (ADR 0015, plan §7.3): 0 ok · 1 IO, internal or environment · 2 the plan is refused
 * (`E3D_*`), a check failed (`E3D_VERIFY_FAILED`) or, under `build --strict`, the build has a
 * warning (`E3D_STRICT`); nothing is written then · 3 bad usage. With `--json` the result goes
 * to stdout and messages to stderr. No output echoes an absolute path the user did not type, and
 * none carries a time (plan §8.5 L7).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@chanmeng666/archlang";
import { adaptPlan } from "../adapter/adapt.js";
import { type CheckResult, checkGlb, checkScene, checkShells } from "../check/verify.js";
import { writeGlb } from "../glb/write.js";
import { buildMesh } from "../mesh/build.js";
import type { Mesh3D } from "../mesh/types.js";
import { makeNodeWorld } from "../node.js";
import { SWIFTSHADER_ARGS } from "../replay/video.js";
import { ARCHLANG_3D_VERSION } from "../scene3d/build.js";
import type { Scene3D } from "../scene3d/types.js";
import { buildManifest, COMMANDS } from "./manifest.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export class Usage extends Error {}

type Parsed = { positional: string[]; flags: Map<string, string | true> };

/** argv after the verb, parsed against the command's manifest flags (`--flag` is the key). */
export function parseFlags(cmd: string, argv: readonly string[]): Parsed {
  const spec = COMMANDS.find((c) => c.name === cmd);
  if (!spec) throw new Usage(`unknown command "${cmd}"`);
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("-") && a !== "-") {
      const f = spec.flags.find((x) => x.flag === a || x.alias === a);
      if (!f) throw new Usage(`${cmd}: unknown flag "${a}"`);
      if (f.arg) {
        const v = argv[++i];
        if (v === undefined) throw new Usage(`${cmd}: ${f.flag} takes ${f.arg}`);
        flags.set(f.flag, v);
      } else flags.set(f.flag, true);
    } else positional.push(a);
  }
  return { positional, flags };
}

const say = (s: string): void => {
  process.stderr.write(`${s}\n`);
};
const emit = (v: unknown): void => {
  process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
};
const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");

/** A package's directory, found the way Node finds it: `node_modules/<name>` from here upward. */
export function packageDir(name: string, from: string = HERE): string | undefined {
  for (let d = from; ; ) {
    const p = join(d, "node_modules", name);
    if (existsSync(join(p, "package.json"))) return p;
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
}

/** The installed core's version, read from its package.json (`unknown` if not found). */
export function coreVersion(): string {
  const d = packageDir("@chanmeng666/archlang");
  if (!d) return "unknown";
  return (JSON.parse(readFileSync(join(d, "package.json"), "utf8")) as { version: string }).version;
}

function curveTol(p: Parsed): number | undefined {
  const v = p.flags.get("--curve-tol");
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Usage("--curve-tol takes a positive number of mm");
  return n;
}

function onePlan(cmd: string, p: Parsed): string {
  if (p.positional.length === 0) throw new Usage(`${cmd}: no input given`);
  if (p.positional.length > 1) throw new Usage(`${cmd}: unexpected argument "${p.positional[1]}"`);
  return p.positional[0] as string;
}

const readInput = (input: string): Buffer => readFileSync(input === "-" ? 0 : input);

type Built =
  | { ok: true; scene: Scene3D; mesh: Mesh3D; warnings: Array<{ code: string; level: number; message: string }> }
  | { ok: false; code: 2; refusal: unknown; message: string };

function buildFrom(input: string, source: string, tol: number | undefined): Built {
  const world = makeNodeWorld(input === "-" ? process.cwd() : dirname(resolve(input)));
  const r = adaptPlan(source, {
    world,
    coreVersion: coreVersion(),
    ...(tol !== undefined ? { curveTolMm: tol } : {}),
  });
  if (!r.ok) return { ok: false, code: 2, refusal: r.refusal, message: `${r.refusal.code}: ${r.refusal.message}` };
  return {
    ok: true,
    scene: r.scene,
    mesh: buildMesh(r.scene),
    warnings: r.warnings.map((w) => ({ code: w.code, level: w.level, message: w.message })),
  };
}

const summary = (checks: CheckResult[]) => ({
  passed: checks.filter((c) => c.ok).length,
  failed: checks.filter((c) => !c.ok).length,
  checks: checks.map((c) => c.id),
  results: checks,
});

/** Per storey: elevation, storey height and the element counts (distinct ids per kind). */
function sceneFacts(scene: Scene3D, mesh: Mesh3D) {
  const levels = scene.levels.map((lv) => {
    const ids = (kind: string) =>
      new Set(mesh.nodes.filter((n) => n.level === lv.level && n.kind === kind).map((n) => n.id)).size;
    return {
      level: lv.level,
      elevation_mm: lv.elevation / 1000,
      storey_height_mm: lv.storeyHeight / 1000,
      counts: {
        wall: ids("wall"),
        floor: ids("floor"),
        door: ids("door"),
        window: ids("window"),
        furniture: ids("furniture"),
        column: ids("column"),
        stair: 0,
      },
    };
  });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const n of mesh.nodes) {
    for (const s of n.shells) {
      for (let i = 0; i < s.positions.length; i++) {
        const k = i % 3;
        const v = (s.positions[i] as number) / 1000;
        if (v < (min[k] as number)) min[k] = v;
        if (v > (max[k] as number)) max[k] = v;
      }
    }
  }
  return { levels, bbox_mm: { min, max } };
}

async function cmdBuild(p: Parsed): Promise<number> {
  const input = onePlan("build", p);
  const format = (p.flags.get("--format") as string | undefined) ?? "glb";
  if (format !== "glb" && format !== "scene3d") throw new Usage("--format takes glb or scene3d");
  const json = p.flags.has("--json");
  const strict = p.flags.has("--strict");
  const tol = curveTol(p);
  let out = p.flags.get("--out") as string | undefined;
  if (out === undefined) {
    if (input === "-") throw new Usage("build: reading stdin needs -o <file|->");
    out = input.replace(/\.arch$/i, "") + (format === "glb" ? ".glb" : ".scene3d.json");
  }
  if (out === "-" && json) throw new Usage("build: -o - and --json both write stdout; pick one");

  let source: string;
  try {
    source = readInput(input).toString("utf8");
  } catch (e) {
    say(`archlang3d: cannot read ${input}: ${(e as Error).message}`);
    return 1;
  }
  const b = buildFrom(input, source, tol);
  if (!b.ok) {
    if (json) emit({ ok: false, refusal: b.refusal });
    say(`archlang3d: ${b.message}`);
    return 2;
  }
  const checks: CheckResult[] = [checkScene(b.scene)];
  let bytes: Uint8Array;
  if (format === "glb") {
    checks.push(checkShells(b.mesh));
    bytes = await writeGlb(b.mesh);
    checks.push(...(await checkGlb(bytes, b.mesh)));
  } else {
    bytes = new TextEncoder().encode(`${JSON.stringify(b.scene, null, 2)}\n`);
  }
  const failed = checks.filter((c) => !c.ok);
  const tool = { name: "archlang3d", version: ARCHLANG_3D_VERSION, archlang: coreVersion() };
  const diagnostics = b.warnings.map((w) => ({
    code: w.code,
    severity: "warning",
    level: w.level,
    message: w.message,
  }));
  if (failed.length > 0) {
    // Nothing is written from a model that failed a check (plan §8.1).
    if (json) emit({ ok: false, code: "E3D_VERIFY_FAILED", tool, diagnostics, verify: summary(checks) });
    for (const c of failed) say(`archlang3d: E3D_VERIFY_FAILED ${c.id}: ${c.failures.join("; ")}`);
    return 2;
  }
  if (strict && diagnostics.length > 0) {
    // --strict: a warning refuses the build like a failed check; nothing is written.
    if (json) emit({ ok: false, code: "E3D_STRICT", tool, diagnostics, verify: summary(checks) });
    for (const d of diagnostics) say(`archlang3d: E3D_STRICT ${d.code}: ${d.message}`);
    return 2;
  }
  try {
    if (out === "-") process.stdout.write(bytes);
    else writeFileSync(out, bytes);
  } catch (e) {
    say(`archlang3d: cannot write ${out}: ${(e as Error).message}`);
    return 1;
  }
  const report = {
    ok: true,
    tool,
    input: { path: input, levels: b.scene.levels.length },
    outputs: [{ path: out, format, bytes: bytes.byteLength, sha256: sha256(bytes) }],
    scene: sceneFacts(b.scene, b.mesh),
    assumptions: b.mesh.assumptions,
    diagnostics,
    verify: { ...summary(checks), warnings: diagnostics.length },
  };
  if (json) emit(report);
  else if (out !== "-") say(`archlang3d: wrote ${out} (${bytes.byteLength} bytes, ${checks.length} checks passed)`);
  for (const d of diagnostics) say(`archlang3d: ${d.code}: ${d.message}`);
  return 0;
}

async function cmdCheck(p: Parsed): Promise<number> {
  const input = onePlan("check", p);
  const json = p.flags.has("--json");
  let raw: Buffer;
  try {
    raw = readInput(input);
  } catch (e) {
    say(`archlang3d: cannot read ${input}: ${(e as Error).message}`);
    return 1;
  }
  let checks: CheckResult[];
  let diagnostics: Array<{ code: string; severity: string; message: string }> = [];
  // A GLB by its magic, whatever its name.
  if (raw.byteLength >= 4 && raw.readUInt32LE(0) === 0x46546c67) {
    try {
      checks = await checkGlb(new Uint8Array(raw));
    } catch (e) {
      // A GLB the reader cannot open fails the validator's check, not the tool.
      checks = [{ id: "V-GLTF-01", ok: false, failures: [(e as Error).message] }];
    }
  } else {
    const b = buildFrom(input, raw.toString("utf8"), curveTol(p));
    if (!b.ok) {
      if (json) emit({ ok: false, refusal: b.refusal });
      say(`archlang3d: ${b.message}`);
      return 2;
    }
    checks = [checkScene(b.scene), checkShells(b.mesh), ...(await checkGlb(await writeGlb(b.mesh), b.mesh))];
    diagnostics = b.warnings.map((w) => ({ code: w.code, severity: "warning", message: w.message }));
  }
  const ok = checks.every((c) => c.ok);
  if (json) emit({ ok, input: { path: input }, diagnostics, verify: summary(checks) });
  for (const c of checks) {
    say(`archlang3d: ${c.ok ? "pass" : "FAIL"} ${c.id}${c.ok ? "" : ` E3D_VERIFY_FAILED: ${c.failures.join("; ")}`}`);
  }
  return ok ? 0 : 2;
}

function cmdManifest(p: Parsed): number {
  if (p.positional.length > 0) throw new Usage(`manifest: unexpected argument "${p.positional[0]}"`);
  emit(buildManifest());
  return 0;
}

function cmdSchema(p: Parsed): number {
  const name = p.positional[0] ?? "scene3d";
  if (name !== "scene3d" || p.positional.length > 1) throw new Usage(`schema: the only schema is scene3d`);
  process.stdout.write(readFileSync(join(HERE, "../scene3d/scene3d.schema.json"), "utf8"));
  return 0;
}

interface Probe {
  name: string;
  ok: boolean;
  /** Whether `build`/`check` need it (a missing required part exits 1). */
  required: boolean;
  for: string;
  detail: string;
}

async function cmdDoctor(p: Parsed): Promise<number> {
  if (p.positional.length > 0) throw new Usage(`doctor: unexpected argument "${p.positional[0]}"`);
  const json = p.flags.has("--json");
  const probes: Probe[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  probes.push({
    name: "node",
    ok: major >= 20,
    required: true,
    for: "everything (engines: node >= 20)",
    detail: process.versions.node,
  });
  const hasSeam = typeof (core as Partial<typeof core>).resolvePlan === "function";
  probes.push({
    name: "@chanmeng666/archlang",
    ok: hasSeam,
    required: true,
    for: "reading the plan (resolvePlan, ADR 0031)",
    detail: `${coreVersion()}${hasSeam ? "" : " (no resolvePlan export)"}`,
  });
  try {
    const v = (await import("gltf-validator")) as { version: () => string };
    probes.push({ name: "gltf-validator", ok: true, required: true, for: "V-GLTF-01", detail: v.version() });
  } catch (e) {
    probes.push({ name: "gltf-validator", ok: false, required: true, for: "V-GLTF-01", detail: (e as Error).message });
  }
  if (major >= 20) {
    // playwright-core exits the process on import under Node < 20; only here, and only then, is it loaded.
    try {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
      const version = browser.version();
      await browser.close();
      probes.push({
        name: "chromium",
        ok: true,
        required: false,
        for: "view (replay key frames, video)",
        detail: version,
      });
    } catch (e) {
      const first = (e as Error).message.split("\n")[0] ?? "";
      probes.push({
        name: "chromium",
        ok: false,
        required: false,
        for: "view (replay key frames, video)",
        detail: `${first} (install: npx playwright install chromium)`,
      });
    }
  } else {
    probes.push({ name: "chromium", ok: false, required: false, for: "view", detail: "needs Node >= 20" });
  }
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  probes.push({
    name: "ffmpeg",
    ok: ff.status === 0,
    required: false,
    for: "view --video",
    detail: ff.status === 0 ? (ff.stdout.split("\n")[0] ?? "") : "not found on PATH",
  });
  const ok = probes.every((x) => x.ok || !x.required);
  if (json) emit({ ok, tool: { name: "archlang3d", version: ARCHLANG_3D_VERSION }, probes });
  else for (const x of probes) say(`${x.ok ? "ok  " : x.required ? "FAIL" : "miss"} ${x.name}: ${x.detail} (${x.for})`);
  return ok ? 0 : 1;
}

/** The commands this module owns, by verb. */
export const HANDLERS: Readonly<Record<string, (p: Parsed) => number | Promise<number>>> = {
  build: cmdBuild,
  check: cmdCheck,
  manifest: cmdManifest,
  schema: cmdSchema,
  doctor: cmdDoctor,
};
