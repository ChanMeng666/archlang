/**
 * `family-thumbs` (product-roadmap card RM8.5): one 3D thumbnail per plan, made the way
 * `gen:3d-assets` makes a poster (`preparePlan`: the plan adapted and built with closed doors, then
 * the replay's settled end frame, `t = 1`, light theme, rendered in headless Chromium), only small.
 *
 *   npx tsx scripts/family-thumbs.ts --plans <dir> --out <dir> [--width 240] [--height 180]
 *
 * Every `<name>.arch` in `--plans` (by name) becomes `<name>.png` in `--out`. The PNG is the frame's
 * decoded pixels re-encoded by `pngjs`, so the bytes depend on the pixels alone, not on the
 * browser's encoder. The core's specimen tool (`scripts/specimen.ts` at the repository root) writes
 * the plans, one per fixture family, and sets each thumbnail BESIDE its family's 2D symbol in one
 * image (PS-D11: 3D is never shown without its plan); nothing else should publish these files
 * alone. Heavy (Chromium); outside the drift gate, like `gen:3d-assets`.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { replayHtml } from "../src/replay/html.js";
import { stateAt, timeline } from "../src/replay/timeline.js";
import { renderStill } from "../src/replay/video.js";
import { preparePlan } from "./gen-3d-assets.js";

/** The thumbnail: the poster's frame (`t = 1`, light, 3 × 3 samples a pixel) at a small size. */
export const THUMB = { width: 240, height: 180, t: 1, theme: "light" as const, supersample: 3 };

/** One plan's thumbnail as a PNG of its pixels alone. */
export async function familyThumb(abs: string, width = THUMB.width, height = THUMB.height): Promise<Uint8Array> {
  const p = preparePlan(abs);
  // As the poster: the frame carries no text, so the core's drawing must be gone at `t`.
  if (stateAt(timeline(p.mesh), THUMB.t).svg !== 0)
    throw new Error(`${abs}: the drawing still shows at t = ${THUMB.t}`);
  const html = await replayHtml(p.mesh, { title: p.title, svg: p.svg, width, height, seconds: 10, theme: THUMB.theme });
  const still = await renderStill({ html, width, height, t: THUMB.t, supersample: THUMB.supersample });
  const img = PNG.sync.read(Buffer.from(still.png));
  return new Uint8Array(PNG.sync.write(img, { colorType: 6 }));
}

function args(argv: string[]): { plans: string; out: string; width: number; height: number } {
  const o = { plans: "", out: "", width: THUMB.width, height: THUMB.height };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = (): string => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${a} takes a value`);
      return x;
    };
    if (a === "--plans") o.plans = resolve(v());
    else if (a === "--out") o.out = resolve(v());
    else if (a === "--width") o.width = Number(v());
    else if (a === "--height") o.height = Number(v());
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.plans || !o.out) throw new Error("usage: family-thumbs --plans <dir> --out <dir> [--width n] [--height n]");
  if (!(Number.isInteger(o.width) && o.width > 0 && Number.isInteger(o.height) && o.height > 0))
    throw new Error("--width and --height take positive whole numbers");
  return o;
}

async function main(): Promise<number> {
  const o = args(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const names = readdirSync(o.plans)
    .filter((f) => f.endsWith(".arch"))
    .sort();
  for (const f of names) {
    const png = await familyThumb(join(o.plans, f), o.width, o.height);
    writeFileSync(join(o.out, f.replace(/\.arch$/, ".png")), png);
    process.stderr.write(`family-thumbs: ${f} ${png.byteLength}\n`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`family-thumbs: ${(e as Error).message}\n`);
      process.exit(1);
    },
  );
}
