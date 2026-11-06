/**
 * `gen:3d-assets` (public-surfaces card X4, `docs/plans/public-surfaces/3d.md`): the 3D preview's
 * assets for the public surfaces, generated from real `.arch` files by this package, never made by
 * hand. For each plan it writes into `docs-site/public/3d/` (or `--out`):
 *
 *   <name>.poster.webp   1600×900, the settled iso end frame (`__seek(1)`), light theme, the canvas
 *                        alone (no page, caption or strip), ≤ 200 KB
 *   <name>.poster.png    the same frame, lossless: the fallback, and the reference the freshness
 *                        check compares a re-render with
 *   <name>.replay.mp4    1280×720, 10 s, H.264 yuv420p +faststart, ≤ 1.5 MB (`PLANS[].video`)
 *   <name>.glb           closed doors, every check passed (glTF-Validator 0 errors, 0 warnings), ≤ 1 MB
 *
 * and `manifest.json`: per plan the source path and SHA-256 (and of every file it imports), the
 * core and package versions, the poster's frame hash (`window.__frameHash`, the key-frame
 * baseline's hashing), the environment that rendered it, the GLB's SHA-256 and every file's bytes.
 *
 *   npm run gen:3d-assets                          every default plan
 *   npm run gen:3d-assets -- --only studio,knob-flat   just these (the rest of the manifest kept)
 *   npm run gen:3d-assets -- --out <dir> --plan <name>=<path.arch> [--plan …] [--no-video]
 *   npm run gen:3d-assets -- --check [--out <dir>] [--no-render]
 *
 * `--plan` replaces the default list with plans from anywhere (another repository); their paths are
 * recorded relative to the working directory, marked `external`, never absolute. `--check` is the
 * freshness check (`checkAssets`, also `e2e/assets.e2e.ts` under `check:3d`): it compares the
 * sources and the package version with the manifest, the files with their recorded bytes and
 * budgets, rebuilds each GLB, and re-renders each poster frame (hash, then pixel tolerance against
 * the PNG); it never compares an image's or a video's encoded bytes (encoders differ; Q21).
 *
 * Heavy: Chromium (playwright-core's, on SwiftShader) and ffmpeg (`archlang3d doctor`). Outside the
 * drift gate, which must not need a browser.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, type World } from "@chanmeng666/archlang";
import { adaptPlan } from "../src/adapter/adapt.js";
import { checkGlb, checkScene, checkShells } from "../src/check/verify.js";
import { coreVersion } from "../src/cli/commands.js";
import { writeGlb } from "../src/glb/write.js";
import { buildMesh } from "../src/mesh/build.js";
import type { Mesh3D } from "../src/mesh/types.js";
import { makeNodeWorld } from "../src/node.js";
import { replayHtml } from "../src/replay/html.js";
import { stateAt, timeline } from "../src/replay/timeline.js";
import { renderReplay, renderStill } from "../src/replay/video.js";
import { ARCHLANG_3D_VERSION } from "../src/scene3d/build.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(PKG, "..", "..");
export const DEFAULT_OUT = join(REPO, "docs-site", "public", "3d");

/**
 * The plans (card X4): a studio, a furnished flat, a laneway house, the knob flat, a two-storey
 * house with a straight stair and a turning stair. `video`: whether the plan also gets an MP4. All
 * do while the MP4s stay under about 6 MB together (each is 0.5–0.8 MB at crf 24); past that, only
 * two or three hero plans keep one (card X4), and the rest keep their posters and GLBs.
 */
export const PLANS: ReadonlyArray<{ name: string; path: string; video: boolean }> = [
  { name: "studio", path: "examples/studio.arch", video: true },
  { name: "furnished-flat", path: "examples/furnished-flat.arch", video: true },
  { name: "laneway-house", path: "examples/laneway-house.arch", video: true },
  { name: "knob-flat", path: "examples/knob-flat.arch", video: true },
  { name: "two-storey", path: "examples/two-storey.arch", video: true },
  { name: "turning-stair", path: "examples/turning-stair.arch", video: true },
];

export const POSTER = { width: 1600, height: 900, t: 1, theme: "light" as const };
export const VIDEO = { width: 1280, height: 720, seconds: 10, fps: 30, crfs: [24, 27, 30, 33, 36] };
/** The replay length the poster's HTML carries (it draws `t = 1`, so it changes no pixel). */
const POSTER_SECONDS = VIDEO.seconds;
export const BUDGET = { webp: 200_000, mp4: 1_500_000, glb: 1_000_000 };
const WEBP_QUALITIES = [0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5];
/** The poster's tolerance (`checkAssets`): a pixel differs beyond 24 in a channel; at most 0.5 % may. */
export const TOLERANCE = { threshold: 24, fraction: 0.005 };

export interface Environment {
  platform: string;
  arch: string;
  chromium: string;
}

export interface AssetEntry {
  name: string;
  source: { path: string; sha256: string; external?: true; imports?: Array<{ path: string; sha256: string }> };
  archlang: string;
  archlang3d: string;
  environment: Environment;
  poster: { width: number; height: number; t: number; theme: "light"; frameSha256: string; webpQuality: number };
  video?: { width: number; height: number; seconds: number; fps: number; crf: number };
  glb?: { sha256: string; doors: "closed"; validator: { errors: number; warnings: number } };
  /** Every file written for this plan, by name, with its bytes. */
  files: Array<{ path: string; bytes: number }>;
  /** What was not written, and why (a GLB over budget). */
  skipped?: string[];
}

export interface AssetManifest {
  about: string;
  assets: AssetEntry[];
}

const ABOUT =
  "Generated by `npm run gen:3d-assets` (packages/archlang-3d/scripts/gen-3d-assets.ts); never hand-edit. Freshness: `npm run gen:3d-assets -- --check`, and packages/archlang-3d/e2e/assets.e2e.ts under check:3d.";

const sha256 = (b: Uint8Array | string): string => createHash("sha256").update(b).digest("hex");
const posix = (p: string): string => p.split(sep).join("/");
const say = (s: string): void => {
  process.stderr.write(`${s}\n`);
};

/**
 * The caller's directory: `npm run` (and `npm -w`) runs a script in its package's directory and
 * keeps the one it was typed in as `INIT_CWD`, so `--out` and `--plan` paths read from there.
 */
const CALLER = process.env.INIT_CWD ?? process.cwd();

/** Where a source is recorded: repository-relative inside this repository, else caller-relative and external. */
export function sourcePath(abs: string): { path: string; external?: true } {
  const inRepo = relative(REPO, abs);
  if (!inRepo.startsWith("..") && !isAbsolute(inRepo)) return { path: posix(inRepo) };
  const fromCwd = relative(CALLER, abs);
  // Never an absolute path (another drive): the file's name is all that is said then.
  return { path: posix(isAbsolute(fromCwd) ? (abs.split(/[\\/]/).pop() ?? abs) : fromCwd), external: true };
}

/** A plan read and built: its source, the files it imported, the Mesh3D and the core's drawing. */
export function preparePlan(abs: string) {
  const source = readFileSync(abs, "utf8");
  const base = makeNodeWorld(dirname(abs));
  const imports = new Map<string, string>();
  const world: World = {
    read: (p) => {
      const c = base.read(p);
      if (c !== null) imports.set(p, sha256(c));
      return c;
    },
  };
  const r = adaptPlan(source, { world, coreVersion: coreVersion() });
  if (!r.ok) throw new Error(`${abs}: ${r.refusal.code}: ${r.refusal.message}`);
  const mesh = buildMesh(r.scene, { doors: "closed" });
  const compiled = compile(source, { world });
  return {
    source,
    title: r.scene.meta.name,
    mesh,
    scene: r.scene,
    svg: compiled.svg,
    imports: [...imports].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, h]) => ({ path, sha256: h })),
  };
}

/** The poster's page: no facts (so no strip), light theme, the replay's own camera. */
export function posterHtml(mesh: Mesh3D, title: string, svg: string): Promise<string> {
  return replayHtml(mesh, {
    title,
    svg,
    width: POSTER.width,
    height: POSTER.height,
    seconds: POSTER_SECONDS,
    theme: POSTER.theme,
  });
}

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    ff.once("error", (e) => reject(new Error(`ffmpeg could not start (${e.message})`)));
    ff.once("close", (code) => (code === 0 ? resolveRun() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
  });
}

/**
 * The replay MP4: every frame rendered once into a lossless master (`crf 0`), then encoded at the
 * first constant rate factor of `VIDEO.crfs` whose file fits the budget.
 */
async function writeVideo(mesh: Mesh3D, title: string, svg: string, out: string): Promise<number> {
  const html = await replayHtml(mesh, {
    title,
    svg,
    width: VIDEO.width,
    height: VIDEO.height,
    seconds: VIDEO.seconds,
    theme: "light",
  });
  const tmp = mkdtempSync(join(tmpdir(), "archlang3d-assets-"));
  try {
    const master = join(tmp, "master.mp4");
    await renderReplay({
      html,
      events: timeline(mesh),
      width: VIDEO.width,
      height: VIDEO.height,
      fps: VIDEO.fps,
      seconds: VIDEO.seconds,
      mp4: master,
      crf: 0,
    });
    for (const crf of VIDEO.crfs) {
      await ffmpeg([
        "-i",
        master,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        String(crf),
        "-movflags",
        "+faststart",
        out,
      ]);
      if (statSync(out).size <= BUDGET.mp4) return crf;
    }
    rmSync(out, { force: true });
    throw new Error(`${out}: over ${BUDGET.mp4} bytes even at crf ${VIDEO.crfs.at(-1)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Generate one plan's assets into `out`; returns its manifest entry. */
export async function generateOne(
  name: string,
  abs: string,
  out: string,
  opts: { video: boolean },
): Promise<AssetEntry> {
  const p = preparePlan(abs);
  const events = timeline(p.mesh);
  // The poster must carry no text: the core's drawing (the only layer with glyphs) is gone at t.
  if (stateAt(events, POSTER.t).svg !== 0) throw new Error(`${name}: the drawing still shows at t = ${POSTER.t}`);
  const files: AssetEntry["files"] = [];
  const skipped: string[] = [];
  const put = (file: string, bytes: Uint8Array): void => {
    writeFileSync(join(out, file), bytes);
    files.push({ path: file, bytes: bytes.byteLength });
  };

  const still = await renderStill({
    html: await posterHtml(p.mesh, p.title, p.svg),
    width: POSTER.width,
    height: POSTER.height,
    t: POSTER.t,
    webp: { maxBytes: BUDGET.webp, qualities: WEBP_QUALITIES },
  });
  if (!still.webp || still.webp.bytes.byteLength > BUDGET.webp)
    throw new Error(`${name}: the WebP poster is over ${BUDGET.webp} bytes at every quality tried`);
  put(`${name}.poster.webp`, still.webp.bytes);
  put(`${name}.poster.png`, still.png);

  let video: AssetEntry["video"];
  if (opts.video) {
    const file = `${name}.replay.mp4`;
    const crf = await writeVideo(p.mesh, p.title, p.svg, join(out, file));
    files.push({ path: file, bytes: statSync(join(out, file)).size });
    video = { width: VIDEO.width, height: VIDEO.height, seconds: VIDEO.seconds, fps: VIDEO.fps, crf };
  }

  let glb: AssetEntry["glb"];
  const bytes = await writeGlb(p.mesh);
  const checks = [checkScene(p.scene), checkShells(p.mesh), ...(await checkGlb(bytes, p.mesh))];
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) throw new Error(`${name}: GLB check failed: ${failed.map((c) => c.id).join(", ")}`);
  const v = checks.find((c) => c.id === "V-GLTF-01")?.facts as { errors: number; warnings: number } | undefined;
  if (bytes.byteLength > BUDGET.glb) skipped.push(`${name}.glb: ${bytes.byteLength} bytes, over ${BUDGET.glb}`);
  else {
    put(`${name}.glb`, bytes);
    glb = {
      sha256: sha256(bytes),
      doors: "closed",
      validator: { errors: v?.errors ?? -1, warnings: v?.warnings ?? -1 },
    };
  }

  return {
    name,
    source: {
      ...sourcePath(abs),
      sha256: sha256(p.source),
      ...(p.imports.length > 0 ? { imports: p.imports } : {}),
    },
    archlang: coreVersion(),
    archlang3d: ARCHLANG_3D_VERSION,
    environment: { platform: process.platform, arch: process.arch, chromium: still.browser },
    poster: { ...POSTER, frameSha256: still.sha256, webpQuality: still.webp.quality },
    ...(video ? { video } : {}),
    ...(glb ? { glb } : {}),
    files,
    ...(skipped.length > 0 ? { skipped } : {}),
  };
}

export function readManifest(dir: string): AssetManifest | undefined {
  const f = join(dir, "manifest.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as AssetManifest) : undefined;
}

export function writeManifest(dir: string, m: AssetManifest): void {
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(m, null, 2)}\n`);
}

export interface CheckReport {
  name: string;
  ok: boolean;
  problems: string[];
  notes: string[];
}

/**
 * The freshness check (card X4). Per entry: the source (and its imports) hash as recorded; the
 * package version is this one; every file is there at its recorded bytes and within budget; the
 * GLB rebuilds to its recorded SHA-256; and, with `render`, the poster frame re-rendered hashes as
 * recorded (required when the environment is the recording one) or is within `TOLERANCE` of the
 * committed PNG. A different core version is a note: the re-render says whether it moved a pixel.
 * External sources (another repository) are noted and not checked. With the default directory,
 * every default plan must have an entry.
 */
export async function checkAssets(dir: string, opts: { render: boolean }): Promise<CheckReport[]> {
  const m = readManifest(dir);
  if (!m) return [{ name: "manifest.json", ok: false, problems: [`no manifest.json in ${dir}`], notes: [] }];
  const reports: CheckReport[] = [];
  if (resolve(dir) === resolve(DEFAULT_OUT)) {
    const missing = PLANS.filter((p) => !m.assets.some((a) => a.name === p.name)).map((p) => p.name);
    if (missing.length > 0)
      reports.push({ name: "manifest.json", ok: false, problems: [`no entry for ${missing.join(", ")}`], notes: [] });
  }
  for (const a of m.assets) {
    const problems: string[] = [];
    const notes: string[] = [];
    const report = (): void => {
      reports.push({ name: a.name, ok: problems.length === 0, problems, notes });
    };
    if (a.source.external) {
      notes.push(`external source ${a.source.path}: not checked from this repository`);
      report();
      continue;
    }
    const abs = join(REPO, a.source.path);
    if (!existsSync(abs)) {
      problems.push(`source ${a.source.path} is gone`);
      report();
      continue;
    }
    const p = preparePlan(abs);
    if (sha256(p.source) !== a.source.sha256) problems.push(`source ${a.source.path} changed since generation`);
    const imports = JSON.stringify(p.imports);
    if (imports !== JSON.stringify(a.source.imports ?? [])) problems.push("the plan's imported files changed");
    if (a.archlang3d !== ARCHLANG_3D_VERSION)
      problems.push(`generated by archlang-3d ${a.archlang3d}; the package is ${ARCHLANG_3D_VERSION}`);
    if (a.archlang !== coreVersion()) notes.push(`generated with archlang ${a.archlang}; the core is ${coreVersion()}`);
    for (const f of a.files) {
      const file = join(dir, f.path);
      if (!existsSync(file)) {
        problems.push(`${f.path} is missing`);
        continue;
      }
      const size = statSync(file).size;
      if (size !== f.bytes) problems.push(`${f.path} is ${size} bytes; the manifest says ${f.bytes}`);
      const budget = f.path.endsWith(".webp")
        ? BUDGET.webp
        : f.path.endsWith(".mp4")
          ? BUDGET.mp4
          : f.path.endsWith(".glb")
            ? BUDGET.glb
            : Infinity;
      if (size > budget) problems.push(`${f.path} is over its ${budget}-byte budget`);
    }
    if (a.glb) {
      const glb = sha256(await writeGlb(p.mesh));
      if (glb !== a.glb.sha256) problems.push(`${a.name}.glb rebuilds to ${glb.slice(0, 12)}…, not the recorded one`);
    }
    const png = join(dir, `${a.name}.poster.png`);
    if (opts.render && existsSync(png)) {
      const still = await renderStill({
        html: await posterHtml(p.mesh, p.title, p.svg),
        width: a.poster.width,
        height: a.poster.height,
        t: a.poster.t,
        reference: new Uint8Array(readFileSync(png)),
        threshold: TOLERANCE.threshold,
      });
      const d = still.diff;
      const fraction = d ? d.differing / d.total : 1;
      const here: Environment = { platform: process.platform, arch: process.arch, chromium: still.browser };
      const same = JSON.stringify(here) === JSON.stringify(a.environment);
      if (still.sha256 !== a.poster.frameSha256) {
        const where = `${here.platform}/${here.arch}/Chromium ${here.chromium}`;
        const msg = `poster frame hash ${still.sha256.slice(0, 12)}… (recorded ${a.poster.frameSha256.slice(0, 12)}…, ${where}); ${d?.differing ?? "?"} of ${d?.total ?? "?"} pixels beyond ${TOLERANCE.threshold}, largest gap ${d?.maxDelta ?? "?"}`;
        if (same) problems.push(`${msg}: this is the recording environment, so the frame moved (regenerate)`);
        else if (!d?.sizeMatches || fraction > TOLERANCE.fraction) problems.push(`${msg}: beyond tolerance`);
        else notes.push(`${msg}: within tolerance`);
      } else if (d?.maxDelta !== 0) {
        // The frame is the recorded one, so the committed PNG must be exactly it.
        problems.push(`the frame hashes as recorded but ${a.name}.poster.png is not that frame`);
      }
    }
    report();
  }
  return reports;
}

function args(argv: readonly string[]) {
  const o = {
    out: DEFAULT_OUT,
    only: undefined as string[] | undefined,
    plans: [] as Array<{ name: string; path: string }>,
    video: true,
    check: false,
    render: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = (): string => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${a} takes a value`);
      return x;
    };
    if (a === "--out") o.out = resolve(CALLER, v());
    else if (a === "--only") o.only = v().split(",");
    else if (a === "--plan") {
      const m = /^([a-z0-9][a-z0-9-]*)=(.+)$/.exec(v());
      if (!m) throw new Error("--plan takes <name>=<path.arch> (name: lower-case letters, digits, hyphens)");
      o.plans.push({ name: m[1] as string, path: m[2] as string });
    } else if (a === "--no-video") o.video = false;
    else if (a === "--check") o.check = true;
    else if (a === "--no-render") o.render = false;
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

async function main(): Promise<number> {
  const o = args(process.argv.slice(2));
  if (o.check) {
    const reports = await checkAssets(o.out, { render: o.render });
    for (const r of reports) {
      say(`${r.ok ? "ok  " : "FAIL"} ${r.name}`);
      for (const p of r.problems) say(`     problem: ${p}`);
      for (const n of r.notes) say(`     note: ${n}`);
    }
    return reports.every((r) => r.ok) ? 0 : 1;
  }
  const list =
    o.plans.length > 0
      ? o.plans.map((p) => ({ name: p.name, abs: resolve(CALLER, p.path), video: o.video }))
      : PLANS.filter((p) => !o.only || o.only.includes(p.name)).map((p) => ({
          name: p.name,
          abs: join(REPO, p.path),
          video: p.video && o.video,
        }));
  if (o.only && list.length !== o.only.length)
    throw new Error(`--only names a plan not in the list: ${o.only.join(",")}`);
  mkdirSync(o.out, { recursive: true });
  const before = readManifest(o.out)?.assets ?? [];
  const fresh = new Map<string, AssetEntry>();
  for (const p of list) {
    say(`gen:3d-assets: ${p.name} …`);
    const e = await generateOne(p.name, p.abs, o.out, { video: p.video });
    fresh.set(p.name, e);
    say(`gen:3d-assets: ${p.name}: ${e.files.map((f) => `${f.path} ${f.bytes}`).join(", ")}`);
    for (const s of e.skipped ?? []) say(`gen:3d-assets: skipped ${s}`);
  }
  // Kept entries for plans not regenerated; the default list's order, then any others by name.
  const order = (o.plans.length > 0 ? o.plans : PLANS).map((p) => p.name);
  const merged = [...before.filter((e) => !fresh.has(e.name)), ...fresh.values()].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || (a.name < b.name ? -1 : 1);
  });
  writeManifest(o.out, { about: ABOUT, assets: merged });
  const total = merged.flatMap((e) => e.files).reduce((s, f) => s + f.bytes, 0);
  say(`gen:3d-assets: wrote ${fresh.size} plan(s); ${merged.length} in the manifest, ${total} bytes of assets`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      say(`gen:3d-assets: ${(e as Error).message}`);
      process.exit(1);
    },
  );
}
