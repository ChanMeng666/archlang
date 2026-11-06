/**
 * `gen:3d-assets` (public-surfaces card X4, `docs/plans/public-surfaces/3d.md`): the 3D preview's
 * assets for the public surfaces, generated from real `.arch` files by this package, never made by
 * hand. For each plan it writes into `docs-site/public/3d/` (or `--out`):
 *
 *   <name>.poster.webp   1600×900, the settled iso end frame (`__seek(1)`), light theme, the canvas
 *                        alone (no page, caption or strip), ≤ 200 KB
 *   <name>.poster.png    the same frame, lossless: the fallback, and the reference the freshness
 *                        check compares a re-render with
 *   <name>.poster-full.* the assembled end frame too, when the poster shows one storey (`PLANS`)
 *   <name>.replay.mp4    1280×720, 10 s, H.264 yuv420p +faststart, ≤ 1.5 MB (only when `PLANS[].video`)
 *   <name>.glb           closed doors, every check passed (glTF-Validator 0 errors, 0 warnings), ≤ 1 MB
 *   <name>.plan.png      the plan beside it: the core's own drawing of the poster's storey, rasterised
 *                        by the core's PNG path (`renderPng`, resvg with the bundled font: what
 *                        `arch preview` writes) at `PNG_PREVIEW_WIDTH` px wide, on the drawing's own
 *                        white ground; a plan that declares `paper` comes with its sheet, since the
 *                        core has no plan-only output (`plan.sheet`)
 *
 * and `manifest.json`: per plan the source path and SHA-256 (and of every file it imports), each
 * poster's frame hash (`window.__frameHash`, the key-frame baseline's hashing) and the environment
 * that rendered it, the GLB's SHA-256 and its content hash, the plan PNG's SHA-256 and its pixels'
 * hash, and every file's bytes with the core and package versions that wrote it.
 *
 *   npm run gen:3d-assets                          every default plan
 *   npm run gen:3d-assets -- --only studio,knob-flat   just these (the rest of the manifest kept)
 *   npm run gen:3d-assets -- --out <dir> --plan <name>=<path.arch> [--plan …] [--no-video]
 *   npm run gen:3d-assets -- --videos              re-encode every MP4 as well
 *   npm run gen:3d-assets -- --check [--out <dir>] [--no-render]
 *
 * Assets change only when what they show changes (review of PR #519, M2). A poster is rewritten when
 * its re-rendered frame hash differs from the recorded one, a GLB when its content hash does (the
 * GLB written with a fixed `asset.generator`, so a version bump alone moves nothing), a plan PNG when
 * its pixels' hash does (decoded RGBA, so an encoder's bytes are not content), and an MP4 is
 * re-encoded only when its plan's source or imports changed or `--videos` is passed. A file kept
 * keeps the versions that wrote it; a file the plan no longer has (`--no-video`, a poster view
 * dropped) is deleted.
 *
 * `--plan` replaces the default list with plans from anywhere (another repository); their paths are
 * recorded relative to the working directory, marked `external`, never absolute. `--check` is the
 * freshness check (`checkAssets`, also `e2e/assets.e2e.ts` under `check:3d`): it compares the
 * sources with the manifest, the files with their recorded bytes and budgets, rebuilds each GLB's
 * content hash, re-renders each poster frame (hash, then pixel tolerance against the PNG),
 * re-rasterises each plan PNG to its recorded pixels' hash (exact everywhere: resvg is pinned and
 * draws with the bundled font only, as `test/visual.test.ts`'s goldens rely on), and fails on a file
 * in the directory that no entry lists; it never compares an image's or a video's encoded
 * bytes (encoders differ; Q21). Versions other than this tree's are notes, never failures.
 *
 * Heavy: Chromium (playwright-core's, on SwiftShader) and ffmpeg (`archlang3d doctor`). Outside the
 * drift gate, which must not need a browser.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, PNG_PREVIEW_WIDTH, renderPng, type World } from "@chanmeng666/archlang";
import { PNG } from "pngjs";
import { adaptPlan } from "../src/adapter/adapt.js";
import { checkGlb, checkScene, checkShells } from "../src/check/verify.js";
import { coreVersion } from "../src/cli/commands.js";
import { writeGlb } from "../src/glb/write.js";
import { buildMesh } from "../src/mesh/build.js";
import type { Mesh3D } from "../src/mesh/types.js";
import { makeNodeWorld } from "../src/node.js";
import { replayHtml } from "../src/replay/html.js";
import { type ReplayView, stateAt, storeysOf, timeline, viewLabel, viewMesh } from "../src/replay/timeline.js";
import { renderReplay, renderStill } from "../src/replay/video.js";
import { ARCHLANG_3D_VERSION } from "../src/scene3d/build.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(PKG, "..", "..");
export const DEFAULT_OUT = join(REPO, "docs-site", "public", "3d");

/**
 * The plans (card X4): a studio, a furnished flat, a laneway house, the knob flat, a two-storey
 * house with a straight stair and a turning stair; then (card X4b) the rest of the docs home
 * gallery's plans (`docs-site/.vitepress/theme/HomeGallery.vue`). `video`: whether the plan also
 * gets an MP4. X4's six do, about 3.5 MB together (each 0.4–0.8 MB at crf 24); the gallery's plans
 * keep a poster, a GLB and a plan PNG only (card X4: past about 6 MB of MP4, only the hero plans
 * keep one).
 *
 * `poster`: the replay view the poster shows, `"all"` (the storeys assembled) unless named. A
 * storeyed plan whose stair is the point shows storey 1 on its own (`viewMesh(mesh, 1)`, the CLI's
 * `--storey 1`: the upper storeys absent, so the stair is in sight) and also gets the assembled end
 * frame as `<name>.poster-full.*`. The MP4 always replays the storeys combined.
 */
export interface PlanSpec {
  name: string;
  path: string;
  video: boolean;
  poster?: ReplayView;
}
export const PLANS: readonly PlanSpec[] = [
  { name: "studio", path: "examples/studio.arch", video: true },
  { name: "furnished-flat", path: "examples/furnished-flat.arch", video: true },
  { name: "laneway-house", path: "examples/laneway-house.arch", video: true },
  { name: "knob-flat", path: "examples/knob-flat.arch", video: true },
  { name: "two-storey", path: "examples/two-storey.arch", video: true, poster: 1 },
  { name: "turning-stair", path: "examples/turning-stair.arch", video: true, poster: 1 },
  { name: "bungalow", path: "examples/bungalow.arch", video: false },
  { name: "courtyard-house", path: "examples/courtyard-house.arch", video: false },
  // The gallery shows its ground floor; storey 1 alone puts the stair and the rooms in sight.
  { name: "hillside-villa", path: "examples/hillside-villa.arch", video: false, poster: 1 },
  { name: "corner-cafe", path: "examples/corner-cafe.arch", video: false },
  { name: "library", path: "examples/library.arch", video: false },
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

export interface PosterEntry {
  /** The files' stem after the plan's name: `<name>.<file>.webp` and `.png`. */
  file: "poster" | "poster-full";
  /** The replay view drawn (`viewLabel`): `all`, or `storey:<n>` on its own. */
  view: string;
  width: number;
  height: number;
  t: number;
  theme: "light";
  frameSha256: string;
  webpQuality: number;
  /** Where it was rendered: the check holds a re-render here to the exact hash. */
  environment: Environment;
}

/** A file written for a plan: its bytes, and the core and package versions that wrote it. */
export interface FileEntry {
  path: string;
  bytes: number;
  archlang: string;
  archlang3d: string;
}

export interface AssetEntry {
  name: string;
  source: { path: string; sha256: string; external?: true; imports?: Array<{ path: string; sha256: string }> };
  /** `poster` (the view `PLANS` names), then, when that is one storey, `poster-full` (all of them). */
  posters: PosterEntry[];
  video?: { width: number; height: number; seconds: number; fps: number; crf: number };
  /**
   * `sha256`: the file's; `contentSha256`: the same Mesh3D written with {@link CONTENT_GENERATOR},
   * which a version bump leaves alone.
   */
  glb?: { sha256: string; contentSha256: string; doors: "closed"; validator: { errors: number; warnings: number } };
  /** `<name>.plan.png`: the core's drawing of {@link PlanPng.level} (or the plan's one drawing). */
  plan?: PlanPng;
  /** Every file written for this plan, by name. */
  files: FileEntry[];
  /** What was not written, and why (a GLB over budget). */
  skipped?: string[];
}

/**
 * The plan PNG: `sha256` the file's, `pixelsSha256` its decoded pixels' ({@link pixelsHash}), the
 * content an encoder cannot move. `level`: the storey drawn (the poster's), absent for a plan without
 * storeys. `sheet`: the plan declares `paper`, so the drawing carries its sheet (border, title
 * block); the core has no plan-only output to leave it off.
 */
export interface PlanPng {
  width: number;
  height: number;
  level?: number;
  sheet: boolean;
  sha256: string;
  pixelsSha256: string;
}

/** A manifest entry as an earlier generator wrote it: the versions and environment per plan. */
type PreviousEntry = Omit<AssetEntry, "posters" | "files" | "glb"> & {
  archlang?: string;
  archlang3d?: string;
  environment?: Environment;
  posters?: Array<Omit<PosterEntry, "environment"> & { environment?: Environment }>;
  files: Array<{ path: string; bytes: number; archlang?: string; archlang3d?: string }>;
  glb?: Omit<NonNullable<AssetEntry["glb"]>, "contentSha256"> & { contentSha256?: string };
};

/** The GLB's `asset.generator` for its content hash: fixed (as `test/pins.ts`'s), so a version bump moves nothing. */
export const CONTENT_GENERATOR = "archlang-3d";

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
  const storeys = storeysOf(mesh);
  return {
    source,
    title: r.scene.meta.name,
    mesh,
    scene: r.scene,
    svg: compiled.svg,
    /** The core's drawing a view replays over, as `archlang3d view --storey` picks it. */
    svgOf: (view: ReplayView): string =>
      view === "all"
        ? compiled.svg
        : (compiled.pages?.find((pg) => pg.level === storeys[view - 1])?.svg ?? compiled.svg),
    /**
     * The core's Scene of the storey `view` names (`svgOf`'s page), and that storey's level; `"all"`
     * is the plan's first drawing (`compile().scene`, the lowest storey: what `arch preview` draws).
     */
    sceneOf: (view: ReplayView): { scene: NonNullable<typeof compiled.scene>; level?: number } => {
      const page = view === "all" ? compiled.pages?.[0] : compiled.pages?.find((pg) => pg.level === storeys[view - 1]);
      const scene = page?.scene ?? compiled.scene;
      if (!scene) throw new Error(`${abs}: the core drew nothing (${compiled.errors.length} errors)`);
      return { scene, ...(page ? { level: page.level } : {}) };
    },
    /** The plan declares `paper`: its drawing carries the sheet. */
    sheet: compiled.ast?.paper !== undefined,
    imports: [...imports].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, h]) => ({ path, sha256: h })),
  };
}

/** A view from its manifest label (`viewLabel`'s inverse). */
export function viewOf(label: string): ReplayView {
  if (label === "all") return "all";
  const m = /^storey:([1-9]\d*)$/.exec(label);
  if (!m) throw new Error(`unknown view "${label}"`);
  return Number(m[1]);
}

/** The poster's page for `view`: no facts (so no strip), light theme, the replay's own camera. */
export function posterHtml(p: ReturnType<typeof preparePlan>, view: ReplayView): Promise<string> {
  return replayHtml(viewMesh(p.mesh, view), {
    title: p.title,
    svg: p.svgOf(view),
    width: POSTER.width,
    height: POSTER.height,
    seconds: POSTER_SECONDS,
    theme: POSTER.theme,
  });
}

/** A PNG's content: its decoded RGBA pixels and their size, so an encoder's choices do not count. */
export function pixelsHash(png: Uint8Array): string {
  const img = PNG.sync.read(Buffer.from(png));
  return createHash("sha256").update(`${img.width}x${img.height}\n`).update(img.data).digest("hex");
}

/**
 * The plan PNG for `view`: the core's PNG path at `PNG_PREVIEW_WIDTH` px wide, scale 1 (`arch
 * preview`'s defaults). A render-time warning (a glyph no bundled face draws, a CJK face absent)
 * would make the picture depend on what is installed, so it fails the run.
 */
export async function planPng(
  p: ReturnType<typeof preparePlan>,
  view: ReplayView,
): Promise<{ png: Uint8Array; plan: PlanPng }> {
  const { scene, level } = p.sceneOf(view);
  const warned: string[] = [];
  const png = await renderPng(scene, {
    width: PNG_PREVIEW_WIDTH,
    scale: 1,
    onDiagnostic: (d) => {
      warned.push(`${d.code}: ${d.message}`);
    },
  });
  if (warned.length > 0) throw new Error(`the plan PNG warned: ${warned.join("; ")}`);
  const img = PNG.sync.read(Buffer.from(png));
  return {
    png,
    plan: {
      width: img.width,
      height: img.height,
      ...(level !== undefined ? { level } : {}),
      sheet: p.sheet,
      sha256: sha256(png),
      pixelsSha256: pixelsHash(png),
    },
  };
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

/**
 * Generate one plan's assets into `out`; returns its manifest entry and the files it wrote. With
 * `prev` (the plan's entry already in the manifest), a file whose content is unchanged is kept, not
 * rewritten (the module's header says when).
 */
export async function generateOne(
  name: string,
  abs: string,
  out: string,
  opts: { video: boolean; poster?: ReplayView; videos?: boolean },
  prev?: PreviousEntry,
): Promise<{ entry: AssetEntry; written: string[] }> {
  const p = preparePlan(abs);
  const now = { archlang: coreVersion(), archlang3d: ARCHLANG_3D_VERSION };
  const files: FileEntry[] = [];
  const written: string[] = [];
  const skipped: string[] = [];
  const put = (file: string, bytes: Uint8Array): void => {
    writeFileSync(join(out, file), bytes);
    files.push({ path: file, bytes: bytes.byteLength, ...now });
    written.push(file);
  };
  // A file of the previous entry still on disk at its recorded bytes, with the versions that wrote it.
  const kept = (file: string): FileEntry | undefined => {
    const f = prev?.files.find((x) => x.path === file);
    const at = join(out, file);
    if (!f || !existsSync(at) || statSync(at).size !== f.bytes) return undefined;
    return {
      path: file,
      bytes: f.bytes,
      archlang: f.archlang ?? prev?.archlang ?? "unknown",
      archlang3d: f.archlang3d ?? prev?.archlang3d ?? "unknown",
    };
  };
  const sourceSame =
    prev !== undefined &&
    prev.source.sha256 === sha256(p.source) &&
    JSON.stringify(prev.source.imports ?? []) === JSON.stringify(p.imports);

  const main = opts.poster ?? "all";
  const views: Array<[PosterEntry["file"], ReplayView]> = [["poster", main]];
  if (main !== "all") views.push(["poster-full", "all"]);
  const posters: PosterEntry[] = [];
  for (const [file, view] of views) {
    // The poster must carry no text: the core's drawing (the only layer with glyphs) is gone at t.
    if (stateAt(timeline(viewMesh(p.mesh, view)), POSTER.t).svg !== 0)
      throw new Error(`${name} (${viewLabel(view)}): the drawing still shows at t = ${POSTER.t}`);
    const still = await renderStill({
      html: await posterHtml(p, view),
      width: POSTER.width,
      height: POSTER.height,
      t: POSTER.t,
      webp: { maxBytes: BUDGET.webp, qualities: WEBP_QUALITIES },
    });
    if (!still.webp || still.webp.bytes.byteLength > BUDGET.webp)
      throw new Error(`${name}: the WebP ${file} is over ${BUDGET.webp} bytes at every quality tried`);
    const label = viewLabel(view);
    // The same frame as recorded, its two files in place: kept as they are.
    const was = prev?.posters?.find(
      (x) =>
        x.file === file &&
        x.view === label &&
        x.width === POSTER.width &&
        x.height === POSTER.height &&
        x.t === POSTER.t &&
        x.theme === POSTER.theme,
    );
    const keptWebp = kept(`${name}.${file}.webp`);
    const keptPng = kept(`${name}.${file}.png`);
    const environment = was?.environment ?? prev?.environment;
    if (was && was.frameSha256 === still.sha256 && keptWebp && keptPng && environment) {
      files.push(keptWebp, keptPng);
      posters.push({ ...was, environment });
      continue;
    }
    put(`${name}.${file}.webp`, still.webp.bytes);
    put(`${name}.${file}.png`, still.png);
    posters.push({
      file,
      view: label,
      ...POSTER,
      frameSha256: still.sha256,
      webpQuality: still.webp.quality,
      environment: { platform: process.platform, arch: process.arch, chromium: still.browser },
    });
  }

  let video: AssetEntry["video"];
  if (opts.video) {
    const file = `${name}.replay.mp4`;
    const was = prev?.video;
    const keptMp4 = kept(file);
    const sameShape =
      was?.width === VIDEO.width &&
      was.height === VIDEO.height &&
      was.seconds === VIDEO.seconds &&
      was.fps === VIDEO.fps;
    if (!opts.videos && sourceSame && sameShape && was && keptMp4) {
      files.push(keptMp4);
      video = was;
    } else {
      const crf = await writeVideo(p.mesh, p.title, p.svg, join(out, file));
      files.push({ path: file, bytes: statSync(join(out, file)).size, ...now });
      written.push(file);
      video = { width: VIDEO.width, height: VIDEO.height, seconds: VIDEO.seconds, fps: VIDEO.fps, crf };
    }
  }

  let glb: AssetEntry["glb"];
  const bytes = await writeGlb(p.mesh);
  const contentSha256 = sha256(await writeGlb(p.mesh, { generator: CONTENT_GENERATOR }));
  const checks = [checkScene(p.scene), checkShells(p.mesh), ...(await checkGlb(bytes, p.mesh))];
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) throw new Error(`${name}: GLB check failed: ${failed.map((c) => c.id).join(", ")}`);
  const v = checks.find((c) => c.id === "V-GLTF-01")?.facts as { errors: number; warnings: number } | undefined;
  const validator = { errors: v?.errors ?? -1, warnings: v?.warnings ?? -1 };
  if (bytes.byteLength > BUDGET.glb) skipped.push(`${name}.glb: ${bytes.byteLength} bytes, over ${BUDGET.glb}`);
  else {
    const was = prev?.glb;
    const keptGlb = kept(`${name}.glb`);
    // An entry from before the content hash: the file's own hash, at this version, decides.
    const same = was && (was.contentSha256 ? was.contentSha256 === contentSha256 : was.sha256 === sha256(bytes));
    if (was && same && keptGlb) {
      files.push(keptGlb);
      glb = { sha256: was.sha256, contentSha256, doors: "closed", validator };
    } else {
      put(`${name}.glb`, bytes);
      glb = { sha256: sha256(bytes), contentSha256, doors: "closed", validator };
    }
  }

  // The plan beside the poster: the poster's storey, drawn by the core.
  const drawn = await planPng(p, main);
  const planFile = `${name}.plan.png`;
  const keptPlan = kept(planFile);
  const wasPlan = prev?.plan;
  let plan: PlanPng;
  if (
    wasPlan &&
    keptPlan &&
    wasPlan.pixelsSha256 === drawn.plan.pixelsSha256 &&
    wasPlan.level === drawn.plan.level &&
    sha256(readFileSync(join(out, planFile))) === wasPlan.sha256
  ) {
    files.push(keptPlan);
    plan = { ...drawn.plan, sha256: wasPlan.sha256 };
  } else {
    put(planFile, drawn.png);
    plan = drawn.plan;
  }

  const entry: AssetEntry = {
    name,
    source: {
      ...sourcePath(abs),
      sha256: sha256(p.source),
      ...(p.imports.length > 0 ? { imports: p.imports } : {}),
    },
    posters,
    ...(video ? { video } : {}),
    ...(glb ? { glb } : {}),
    plan,
    files,
    ...(skipped.length > 0 ? { skipped } : {}),
  };
  return { entry, written };
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
 * The freshness check (card X4). Per entry: the source (and its imports) hash as recorded; every
 * file is there at its recorded bytes and within budget; the GLB is the recorded file and its
 * Mesh3D rebuilds to the recorded content hash; and, with `render`, each poster frame re-rendered
 * hashes as recorded (required when the environment is the recording one) or is within `TOLERANCE`
 * of the committed PNG; the plan PNG is the recorded file and re-rasterises (here, always: resvg, no
 * browser) to the recorded pixels' hash. With the default directory, each entry also has what its
 * `PLANS` row asks for: the posters, a replay MP4 exactly when `video`, and a plan PNG. A file
 * written by another core or package version is a note: what it shows is what decides (the GLB's
 * content, the poster's frame, the plan PNG's pixels), so a version bump fails nothing. External
 * sources (another repository) are noted and not checked. With the default directory, every
 * default plan must have an entry; in any directory, every file but `manifest.json` must be listed
 * by an entry (an orphan is a stale asset nothing vouches for).
 */
export async function checkAssets(dir: string, opts: { render: boolean }): Promise<CheckReport[]> {
  const m = readManifest(dir);
  if (!m) return [{ name: "manifest.json", ok: false, problems: [`no manifest.json in ${dir}`], notes: [] }];
  const reports: CheckReport[] = [];
  const top: string[] = [];
  if (resolve(dir) === resolve(DEFAULT_OUT)) {
    const missing = PLANS.filter((p) => !m.assets.some((a) => a.name === p.name)).map((p) => p.name);
    if (missing.length > 0) top.push(`no entry for ${missing.join(", ")}`);
  }
  const listed = new Set(m.assets.flatMap((a) => a.files.map((f) => f.path)));
  const orphans = readdirSync(dir)
    .filter((f) => f !== "manifest.json" && !listed.has(f))
    .sort();
  if (orphans.length > 0) top.push(`not in the manifest (orphans): ${orphans.join(", ")}`);
  if (top.length > 0) reports.push({ name: "manifest.json", ok: false, problems: top, notes: [] });
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
    const older = (key: "archlang" | "archlang3d", now: string, what: string): void => {
      const by = new Map<string, string[]>();
      for (const f of a.files) if (f[key] !== now) by.set(f[key], [...(by.get(f[key]) ?? []), f.path]);
      for (const [v, paths] of by) notes.push(`${paths.join(", ")} written with ${what} ${v}; this tree is ${now}`);
    };
    older("archlang3d", ARCHLANG_3D_VERSION, "archlang-3d");
    older("archlang", coreVersion(), "archlang");
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
      const file = join(dir, `${a.name}.glb`);
      if (existsSync(file) && sha256(readFileSync(file)) !== a.glb.sha256)
        problems.push(`${a.name}.glb is not the file the manifest records`);
      const content = sha256(await writeGlb(p.mesh, { generator: CONTENT_GENERATOR }));
      if (content !== a.glb.contentSha256)
        problems.push(`${a.name}.glb's content rebuilds to ${content.slice(0, 12)}…, not the recorded one`);
    }
    const spec = resolve(dir) === resolve(DEFAULT_OUT) ? PLANS.find((s) => s.name === a.name) : undefined;
    if (spec) {
      const main = spec.poster ?? "all";
      const want = [viewLabel(main), ...(main !== "all" ? ["all"] : [])];
      const have = a.posters.map((x) => x.view);
      if (JSON.stringify(have) !== JSON.stringify(want))
        problems.push(`posters show ${have.join(", ")}; the plan list asks for ${want.join(", ")}`);
      // `video: false` (poster, GLB and plan PNG only): no replay recorded and no MP4 listed.
      const mp4 = a.files.some((f) => f.path.endsWith(".mp4"));
      if (spec.video && (!a.video || !mp4)) problems.push("the plan list asks for a replay MP4; there is none");
      if (!spec.video && (a.video || mp4))
        problems.push("the plan list asks for no replay MP4 (video: false); one is listed");
      if (!a.plan) problems.push(`no plan PNG (${a.name}.plan.png)`);
    }
    if (a.plan) {
      const file = join(dir, `${a.name}.plan.png`);
      if (!a.files.some((f) => f.path === `${a.name}.plan.png`)) problems.push(`${a.name}.plan.png is not listed`);
      else if (existsSync(file) && sha256(readFileSync(file)) !== a.plan.sha256)
        problems.push(`${a.name}.plan.png is not the file the manifest records`);
      const main = spec?.poster ?? (a.posters[0] ? viewOf(a.posters[0].view) : "all");
      const drawn = await planPng(p, main);
      if (drawn.plan.level !== a.plan.level)
        problems.push(
          `${a.name}.plan.png draws level ${a.plan.level ?? "-"}; the poster's storey is ${drawn.plan.level ?? "-"}`,
        );
      if (drawn.plan.pixelsSha256 !== a.plan.pixelsSha256)
        problems.push(
          `${a.name}.plan.png re-rasterises to pixels ${drawn.plan.pixelsSha256.slice(0, 12)}…, not the recorded ${a.plan.pixelsSha256.slice(0, 12)}… (regenerate)`,
        );
    }
    for (const poster of a.posters) {
      const png = join(dir, `${a.name}.${poster.file}.png`);
      if (!opts.render || !existsSync(png)) continue;
      const still = await renderStill({
        html: await posterHtml(p, viewOf(poster.view)),
        width: poster.width,
        height: poster.height,
        t: poster.t,
        reference: new Uint8Array(readFileSync(png)),
        threshold: TOLERANCE.threshold,
      });
      const d = still.diff;
      const fraction = d ? d.differing / d.total : 1;
      const here: Environment = { platform: process.platform, arch: process.arch, chromium: still.browser };
      const same = JSON.stringify(here) === JSON.stringify(poster.environment);
      if (still.sha256 !== poster.frameSha256) {
        const where = `${here.platform}/${here.arch}/Chromium ${here.chromium}`;
        const msg = `${poster.file} (${poster.view}) frame hash ${still.sha256.slice(0, 12)}… (recorded ${poster.frameSha256.slice(0, 12)}…, ${where}); ${d?.differing ?? "?"} of ${d?.total ?? "?"} pixels beyond ${TOLERANCE.threshold}, largest gap ${d?.maxDelta ?? "?"}`;
        if (same) problems.push(`${msg}: this is the recording environment, so the frame moved (regenerate)`);
        else if (!d?.sizeMatches || fraction > TOLERANCE.fraction) problems.push(`${msg}: beyond tolerance`);
        else notes.push(`${msg}: within tolerance`);
      } else if (d?.maxDelta !== 0) {
        // The frame is the recorded one, so the committed PNG must be exactly it.
        problems.push(`the frame hashes as recorded but ${a.name}.${poster.file}.png is not that frame`);
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
    videos: false,
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
    else if (a === "--videos") o.videos = true;
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
  const list: Array<{ name: string; abs: string; video: boolean; poster?: ReplayView }> =
    o.plans.length > 0
      ? o.plans.map((p) => ({ name: p.name, abs: resolve(CALLER, p.path), video: o.video }))
      : PLANS.filter((p) => !o.only || o.only.includes(p.name)).map((p) => ({
          name: p.name,
          abs: join(REPO, p.path),
          video: p.video && o.video,
          ...(p.poster !== undefined ? { poster: p.poster } : {}),
        }));
  if (o.only && list.length !== o.only.length)
    throw new Error(`--only names a plan not in the list: ${o.only.join(",")}`);
  mkdirSync(o.out, { recursive: true });
  const before = (readManifest(o.out)?.assets ?? []) as unknown as PreviousEntry[];
  const fresh = new Map<string, AssetEntry>();
  for (const p of list) {
    say(`gen:3d-assets: ${p.name} …`);
    const prev = before.find((e) => e.name === p.name);
    const { entry: e, written } = await generateOne(
      p.name,
      p.abs,
      o.out,
      { video: p.video, videos: o.videos, ...(p.poster !== undefined ? { poster: p.poster } : {}) },
      prev,
    );
    fresh.set(p.name, e);
    // A file the plan had and no longer has (`--no-video` or `video: false`, a poster view dropped,
    // a GLB over budget).
    for (const f of prev?.files ?? []) {
      if (e.files.some((x) => x.path === f.path)) continue;
      rmSync(join(o.out, f.path), { force: true });
      say(`gen:3d-assets: ${p.name}: removed ${f.path}`);
    }
    const kept = e.files.filter((f) => !written.includes(f.path)).map((f) => f.path);
    say(
      `gen:3d-assets: ${p.name}: wrote ${written.map((f) => `${f} ${e.files.find((x) => x.path === f)?.bytes}`).join(", ") || "nothing"}`,
    );
    if (kept.length > 0) say(`gen:3d-assets: ${p.name}: kept (unchanged) ${kept.join(", ")}`);
    for (const s of e.skipped ?? []) say(`gen:3d-assets: skipped ${s}`);
  }
  // Kept entries for plans not regenerated; the default list's order, then any others by name.
  const order = (o.plans.length > 0 ? o.plans : PLANS).map((p) => p.name);
  const others = (before as unknown as AssetEntry[]).filter((e) => !fresh.has(e.name));
  const merged = [...others, ...fresh.values()].sort((a, b) => {
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
