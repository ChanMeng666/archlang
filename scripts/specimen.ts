/**
 * The specimen tool (backlog D.8, product-roadmap card RM8.5): every fixture family's 2D symbol as
 * the compiler draws it, for judging a redraw and for the catalogue in `docs/furniture.md`.
 *
 *   npx tsx scripts/specimen.ts sheets --out <dir>
 *       one PNG per scale and theme, `sheet-<theme>-1-<50|100>.png`: every family on a `paper`
 *       plan at `scale 1:50` and `1:100`, under the default theme and each named theme (`THEMES`),
 *       cropped to the piece and drawn at its true printed size (`PX_PER_SHEET_MM`), with its name
 *   npx tsx scripts/specimen.ts compare --before <checkout> [--after <checkout>] --out <file.png>
 *                                       [--scale 50|100] [--theme <name>]
 *       the before/after sheet: each family drawn by both checkouts' `compile()` (their
 *       `src/index.ts`, so neither needs a build), side by side, in one PNG; `--after` defaults to
 *       this checkout. The family list and the plans are this checkout's.
 *   npx tsx scripts/specimen.ts catalogue [--out <dir>]
 *       the catalogue images (default `docs-site/public/catalogue/`): per family, `<family>.png`,
 *       its 2D symbol (default theme, 1:50) and BESIDE it, in the same image, its 3D thumbnail from
 *       `packages/archlang-3d/scripts/family-thumbs.ts` (PS-D11: 3D always paired with its plan).
 *       Both halves come from one `.arch` source.
 *
 * Every image is generated: no pixel is drawn or fixed by hand. The output is a pure function of
 * the checkout (resvg is pinned and draws with the bundled font only; the 3D frame is the replay's
 * pure function of `t`, its pixels re-encoded by `pngjs`), so two runs on one checkout write the
 * same bytes. The tool is deliberately NOT in `check:drift` (D.8): the catalogue needs Chromium,
 * and the drift gate must not.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { CANONICAL_FIXTURES } from "../src/elements/fixtures-glyphs.js";
import { defaultFootprint } from "../src/fixtures-catalog.js";
import { compile, renderPngFromSvg } from "../src/index.js";
import { THEMES } from "../src/theme.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CATALOGUE_DIR = join(ROOT, "docs-site", "public", "catalogue");

/** The scales the sheets are drawn at (`scale 1:<n>`). */
export const SCALES: readonly number[] = [50, 100];
/** `default` (no `theme` line), then every named theme, read from the table rather than retyped. */
export const SPECIMEN_THEMES: readonly string[] = ["default", ...Object.keys(THEMES)];

/**
 * A specimen size (along × depth, mm) for each family the catalogue gives no footprint (`size` is
 * required there, `docs/furniture.md`). Presentation only: a typical size to draw the symbol at,
 * never a language fact; a family with a catalogued footprint is drawn at that footprint. A family
 * with neither fails the run, so a new family cannot go undrawn.
 */
export const SPECIMEN_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  sofa: [2100, 900],
  armchair: [850, 850],
  coffee_table: [1100, 600],
  table: [1200, 800],
  dining_table: [1800, 1700],
  chair: [450, 500],
  stool: [400, 400],
  bench: [1500, 400],
  desk: [1400, 700],
  office_chair: [600, 600],
  oven: [600, 600],
  island: [2000, 1000],
  plant: [500, 500],
  car: [1800, 4600],
  rug: [2000, 1400],
  piano: [1500, 1800],
  sun_lounger: [700, 1900],
  tree: [3000, 3000],
  conifer: [1500, 1500],
  shrub: [900, 900],
  outdoor_table: [1800, 1800],
  outdoor_chair: [600, 600],
  umbrella: [2500, 2500],
  bicycle: [600, 1800],
  motorcycle: [800, 2100],
  hot_tub: [2100, 2100],
  swing: [3000, 1800],
  trampoline: [3000, 3000],
  pergola: [3000, 3000],
  sandpit: [1500, 1500],
  fire_pit: [900, 900],
  clothesline: [2400, 600],
  bean_bag: [900, 900],
  palm: [2000, 2000],
  boulder: [1000, 800],
  workstation: [1600, 1600],
};

/** One family's specimen: its plan source and the model rectangle to crop the drawing to. */
export interface Specimen {
  family: string;
  source: string;
  /** `[x, y, w, h]` in model millimetres: the wall's outer face plus a small margin. */
  crop: readonly [number, number, number, number];
}

const WALL = 100;

/** The specimen size of `family`: its catalogued footprint, else {@link SPECIMEN_SIZE}. */
export function specimenSize(family: string): readonly [number, number] {
  const fp = defaultFootprint(family);
  if (fp) return [fp.along, fp.depth];
  const s = SPECIMEN_SIZE[family];
  if (!s) throw new Error(`specimen: ${family} has no catalogued footprint and no SPECIMEN_SIZE row`);
  return s;
}

/**
 * The specimen plan of `family`: the piece at its specimen size, a margin of a fifth of its long side
 * (150–600 mm) inside a thin, low wall (the 3D package raises nothing without one; a height draws
 * nothing in 2D). No room, so no name or area is drawn over the symbol. A `paper` sheet makes
 * `scale` real; the title block and north arrow are hidden, and they stand outside the crop anyway.
 */
export function specimen(family: string, scale = 50, theme = "default"): Specimen {
  const [a, d] = specimenSize(family);
  const m = Math.min(600, Math.max(150, Math.round(Math.max(a, d) / 5 / 50) * 50));
  const W = a + 2 * m;
  const H = d + 2 * m;
  const lines = [
    `plan "${family}" {`,
    "  units mm",
    "  paper A3 landscape",
    `  scale 1:${scale}`,
    "  title hidden",
    "  north up hidden",
    ...(theme === "default" ? [] : [`  theme ${theme}`]),
    `  wall id=w exterior thickness ${WALL} height 150 { (0,0) (${W},0) (${W},${H}) (0,${H}) close }`,
    `  furniture ${family} at (${m},${m}) size ${a}x${d}`,
    "}",
    "",
  ];
  // Half the margin round the piece, well inside the wall's inner face (`WALL / 2` < 75): the wall
  // frames the 3D thumbnail, the 2D crop shows the piece alone.
  return { family, source: lines.join("\n"), crop: [m / 2, m / 2, a + m, d + m] };
}

type Compile = (src: string) => { svg: string; errors: readonly { code: string; message: string }[] };

/** A checkout's `compile()`, from its source (`src/index.ts`): the core has no runtime dependency. */
async function compileOf(checkout: string | undefined): Promise<Compile> {
  if (!checkout) return compile as unknown as Compile;
  const mod = (await import(pathToFileURL(join(resolve(checkout), "src", "index.ts")).href)) as { compile: Compile };
  return mod.compile;
}

/** The drawing cropped to `crop`, at `w` × `h` px: the root element's size and viewBox replaced. */
function cropSvg(svg: string, crop: Specimen["crop"], w: number, h: number): string {
  const end = svg.indexOf(">");
  const head = svg
    .slice(0, end)
    .replace(/ width="[^"]*"/, ` width="${w}"`)
    .replace(/ height="[^"]*"/, ` height="${h}"`)
    .replace(/ viewBox="[^"]*"/, ` viewBox="${crop.join(" ")}"`);
  return head + svg.slice(end);
}

/** A family drawn by `fn` and rasterised by resvg: the PNG's decoded image. */
async function draw(fn: Compile, s: Specimen, w: number, h: number): Promise<PNG> {
  const r = fn(s.source);
  if (r.errors.length > 0) throw new Error(`specimen ${s.family}: ${r.errors.map((e) => e.code).join(", ")}`);
  return PNG.sync.read(Buffer.from(await renderPngFromSvg(cropSvg(r.svg, s.crop, w, h))));
}

const xml = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** A line of text, rasterised by the same resvg and bundled font as the drawings. */
async function label(text: string, w: number, h = 22): Promise<PNG> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#ffffff"/><text x="${w / 2}" y="${h - 6}" font-size="14" text-anchor="middle" fill="#333333">${xml(text)}</text></svg>`;
  return PNG.sync.read(Buffer.from(await renderPngFromSvg(svg)));
}

/** A white canvas with each part copied in at its offset. */
function compose(width: number, height: number, parts: ReadonlyArray<[PNG, number, number]>): Buffer {
  const out = new PNG({ width, height });
  out.data.fill(255);
  for (const [img, x, y] of parts) PNG.bitblt(img, out, 0, 0, img.width, img.height, x, y);
  return PNG.sync.write(out, { colorType: 6 });
}

/** Printed size: pixels per millimetre of sheet (about 152 dpi). */
export const PX_PER_SHEET_MM = 6;
const GAP = 12;
const COLS = 10;

/**
 * A sheet of every family at `scale` under `theme`, each drawn by every function of `sides` (one:
 * the sheet; two: before | after), cropped and printed at true size in a uniform grid.
 */
async function sheet(sides: readonly Compile[], scale: number, theme: string, heading: string): Promise<Buffer> {
  const specs = CANONICAL_FIXTURES.map((f) => specimen(f, scale, theme));
  const px = (mm: number): number => Math.max(1, Math.round((mm / scale) * PX_PER_SHEET_MM));
  const cw = Math.max(...specs.map((s) => px(s.crop[2])));
  const ch = Math.max(...specs.map((s) => px(s.crop[3])));
  const cellW = sides.length * cw + (sides.length - 1) * 4;
  const cellH = ch + 22 + (sides.length > 1 ? 22 : 0);
  const rows = Math.ceil(specs.length / COLS);
  const width = COLS * cellW + (COLS + 1) * GAP;
  const height = 40 + rows * cellH + (rows + 1) * GAP;
  const parts: Array<[PNG, number, number]> = [[await label(heading, width, 36), 0, 0]];
  for (const [i, s] of specs.entries()) {
    const x0 = GAP + (i % COLS) * (cellW + GAP);
    const y0 = 40 + GAP + Math.floor(i / COLS) * (cellH + GAP);
    const w = px(s.crop[2]);
    const h = px(s.crop[3]);
    for (const [k, fn] of sides.entries()) {
      const img = await draw(fn, s, w, h);
      const x = x0 + k * (cw + 4) + Math.floor((cw - w) / 2);
      parts.push([img, x, y0 + Math.floor((ch - h) / 2)]);
      if (sides.length > 1) parts.push([await label(k === 0 ? "before" : "after", cw), x0 + k * (cw + 4), y0 + ch]);
    }
    parts.push([await label(s.family, cellW), x0, y0 + cellH - 22]);
  }
  return compose(width, height, parts);
}

/** The catalogue image's halves: the 2D symbol and the 3D thumbnail, each this size. */
export const CATALOGUE_HALF = { width: 240, height: 180 };

/** The catalogue images: per family the 2D symbol (default theme, 1:50) and its 3D thumbnail beside it. */
async function catalogue(out: string): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "archlang-specimen-"));
  const plans = join(tmp, "plans");
  const thumbs = join(tmp, "thumbs");
  mkdirSync(plans);
  const specs = CANONICAL_FIXTURES.map((f) => specimen(f));
  for (const s of specs) writeFileSync(join(plans, `${s.family}.arch`), s.source);
  // The 3D half is the package's (it reads the core through its public exports only), run as its own process.
  const tsx = createRequire(import.meta.url).resolve("tsx/cli");
  const pkg = join(ROOT, "packages", "archlang-3d");
  const { width, height } = CATALOGUE_HALF;
  const r = spawnSync(
    process.execPath,
    [
      tsx,
      "scripts/family-thumbs.ts",
      "--plans",
      plans,
      "--out",
      thumbs,
      "--width",
      `${width}`,
      "--height",
      `${height}`,
    ],
    { cwd: pkg, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (r.status !== 0) throw new Error(`family-thumbs exited ${r.status}`);
  mkdirSync(out, { recursive: true });
  let total = 0;
  try {
    total = await compose2d3d(specs, thumbs, out);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  process.stderr.write(`specimen: ${specs.length} catalogue images, ${total} bytes, in ${out}\n`);
}

/** Each family's catalogue image: the 2D half drawn here, the 3D half read from `thumbs`. */
async function compose2d3d(specs: readonly Specimen[], thumbs: string, out: string): Promise<number> {
  const { width, height } = CATALOGUE_HALF;
  let total = 0;
  for (const s of specs) {
    // The 2D half: the symbol fitted to the half (the crop's aspect kept, centred).
    const k = Math.min(width / s.crop[2], height / s.crop[3]);
    const w = Math.max(1, Math.round(s.crop[2] * k));
    const h = Math.max(1, Math.round(s.crop[3] * k));
    const plan = await draw(compile as unknown as Compile, s, w, h);
    const three = PNG.sync.read(readFileSync(join(thumbs, `${s.family}.png`)));
    const png = compose(2 * width, height, [
      [plan, Math.floor((width - w) / 2), Math.floor((height - h) / 2)],
      [three, width, 0],
    ]);
    writeFileSync(join(out, `${s.family}.png`), png);
    total += png.byteLength;
  }
  return total;
}

function args(argv: string[]): { mode: string; opts: Map<string, string> } {
  const [mode = "", ...rest] = argv;
  const opts = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i] as string;
    const v = rest[i + 1];
    if (!k.startsWith("--") || v === undefined) throw new Error(`expected --<flag> <value>, got ${k}`);
    opts.set(k.slice(2), v);
  }
  return { mode, opts };
}

async function main(): Promise<number> {
  const { mode, opts } = args(process.argv.slice(2));
  if (mode === "sheets") {
    const out = resolve(opts.get("out") ?? "");
    if (!opts.get("out")) throw new Error("sheets takes --out <dir>");
    mkdirSync(out, { recursive: true });
    for (const theme of SPECIMEN_THEMES) {
      for (const scale of SCALES) {
        const file = join(out, `sheet-${theme}-1-${scale}.png`);
        writeFileSync(
          file,
          await sheet([compile as unknown as Compile], scale, theme, `${theme} theme, scale 1:${scale}`),
        );
        process.stderr.write(`specimen: ${file}\n`);
      }
    }
    return 0;
  }
  if (mode === "compare") {
    const before = opts.get("before");
    const out = opts.get("out");
    if (!before || !out) throw new Error("compare takes --before <checkout> --out <file.png>");
    const scale = Number(opts.get("scale") ?? "50");
    const theme = opts.get("theme") ?? "default";
    if (!SCALES.includes(scale)) throw new Error(`--scale is one of ${SCALES.join(", ")}`);
    if (!SPECIMEN_THEMES.includes(theme)) throw new Error(`--theme is one of ${SPECIMEN_THEMES.join(", ")}`);
    const sides = [await compileOf(before), await compileOf(opts.get("after"))];
    const png = await sheet(sides, scale, theme, `before | after: ${theme} theme, scale 1:${scale}`);
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), png);
    process.stderr.write(`specimen: ${resolve(out)}\n`);
    return 0;
  }
  if (mode === "catalogue") {
    await catalogue(resolve(opts.get("out") ?? CATALOGUE_DIR));
    return 0;
  }
  throw new Error(
    "usage: specimen.ts sheets --out <dir> | compare --before <checkout> --out <png> | catalogue [--out <dir>]",
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`specimen: ${(e as Error).message}\n`);
      process.exit(1);
    },
  );
}
