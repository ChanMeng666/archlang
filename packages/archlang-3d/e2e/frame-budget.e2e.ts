/**
 * The contact shadows' cost (product-roadmap card RM8.8; design `visual-language.md` §1.3), measured
 * as visual-assets card V9 measured the shadow map it turned down (+55% a frame): Chromium on
 * SwiftShader, 1600 × 900, one sample a pixel. Two pages in one browser, their payloads differing
 * only in `shadows: false` (A) or not (B). Every sample is taken in ABBA order (A then B, then B then
 * A, …), so a drift in the machine's speed falls on both alike:
 *   - the mount (mount, then the end frame), 15 times each;
 *   - the end: after 10 frames each to warm up, 60 frames each, every frame moving between the end
 *     and 1 ms of replay before it, so each one is really drawn;
 *   - the fade: 60 frames each inside the last quarter of the lowest storey's last wall's rise (review
 *     N5 of PR #737), where every frame also rewrites the bands' alpha;
 * each frame read back (`frameHash`) so the GPU has finished.
 *
 * It PRINTS each plan's medians and the B/A ratios (the budget: at most 1.30 on the worst plan, frame
 * and mount alike) and asserts only that it measured: a timing assertion would flake on a loaded
 * runner. It runs alone, after the other heavy tests (the package's `e2e` script), so no other file's
 * browser shares the runner while it times (review S1). The numbers are copied into the PR from
 * `3D package (check:3d)`'s log, never taken locally. It also asserts that A draws exactly B's frame
 * where no band shows yet (the top-down phase) and a different one at the end.
 */
import type {} from "./fixtures/frame-budget-entry.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { replayPayload } from "../src/node.js";
import type { ReplayPayload } from "../src/replay/payload.js";
import { SWIFTSHADER_ARGS } from "../src/replay/swiftshader.js";
import { bundleViewer } from "../src/replay/viewer-bundle.js";
import { EXAMPLES_LIST, WORLD } from "../test/corpus.js";

const ENTRY = fileURLToPath(new URL("./fixtures/frame-budget-entry.ts", import.meta.url));
const PLANS = ["laneway-house.arch", "courtyard-house.arch", "two-storey.arch"] as const;
const SIZE = { width: 1600, height: 900 };
const WARM = 10;
const FRAMES = 60;
const MOUNTS = 15;
/** One millisecond of a 15 s replay, in replay time. */
const MS = 1 / 15000;

function payloadOf(name: string): ReplayPayload {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`${name}: ${r.refusal.code}`);
  return replayPayload(buildMesh(r.scene), { title: name, svg: compile(src, { world: WORLD }).svg, ...SIZE });
}

/** A replay time inside the bands' fade: the last eighth of the lowest storey's last wall's rise. */
function fadeTime(p: ReplayPayload): number {
  const walls = new Set(p.nodes.filter((n) => n.band !== undefined && n.kind === "wall").map((n) => n.key));
  const last = p.events
    .filter((e) => walls.has(e.key) && (e.storey ?? 0) === 0)
    .reduce((m, e) => (e.riseTo > m.riseTo ? e : m));
  return last.riseTo - (last.riseTo - last.riseFrom) / 8;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

describe("contact shadows' frame-time budget (card RM8.8)", () => {
  it("measures each plan's mount, end frame and fade frame, with the shadows and without, ABBA, and prints the ratios", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-budget-"));
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
    const report: string[] = [];
    try {
      const file = join(dir, "bench.html");
      writeFileSync(
        file,
        `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas><script>${await bundleViewer(ENTRY)}</script>`,
      );
      const open = async () => {
        const page = await browser.newPage({
          viewport: { width: SIZE.width + 40, height: SIZE.height + 40 },
          deviceScaleFactor: 1,
        });
        await page.goto(pathToFileURL(file).href);
        return page;
      };
      const pageA = await open();
      const pageB = await open();
      type Page = typeof pageA;
      /** `n` samples of each page, ABBA: pair i runs A then B when i is even, B then A when odd. */
      const abba = async (n: number, take: (page: Page, i: number) => Promise<number>) => {
        const a: number[] = [];
        const b: number[] = [];
        for (let i = 0; i < n; i++) {
          if (i % 2 === 0) {
            a.push(await take(pageA, i));
            b.push(await take(pageB, i));
          } else {
            b.push(await take(pageB, i));
            a.push(await take(pageA, i));
          }
        }
        return [a, b] as const;
      };
      for (const name of PLANS) {
        const withShadows = payloadOf(name);
        const without: ReplayPayload = { ...withShadows, shadows: false };
        const [mountA, mountB] = await abba(MOUNTS, (page) =>
          page.evaluate((p) => window.__mountTimed(p), page === pageA ? without : withShadows),
        );
        // The switch draws nothing else: the same frame where no band shows yet, another at the end.
        const hashes = async (t: number) =>
          [
            await pageA.evaluate((x) => window.__frameHashAt(x), t),
            await pageB.evaluate((x) => window.__frameHashAt(x), t),
          ] as const;
        const [early, earlyB] = await hashes(0.3);
        expect(early, `${name}: t = 0.3 with and without the shadows`).toBe(earlyB);
        const [endA, endB] = await hashes(1);
        expect(endA, `${name}: the end frame shows the shadows`).not.toBe(endB);
        const frames = async (t: number) => {
          const at = (i: number) => (i % 2 === 0 ? t - MS : t);
          await abba(WARM, (page, i) => page.evaluate((x) => window.__frameTimed(x), at(i)));
          return abba(FRAMES, (page, i) => page.evaluate((x) => window.__frameTimed(x), at(i)));
        };
        const [endFrameA, endFrameB] = await frames(1);
        const [fadeFrameA, fadeFrameB] = await frames(fadeTime(withShadows));
        const all = [mountA, mountB, endFrameA, endFrameB, fadeFrameA, fadeFrameB];
        for (const xs of all)
          expect(
            xs.every((x) => Number.isFinite(x) && x >= 0),
            name,
          ).toBe(true);
        expect(
          all.map((xs) => xs.length),
          name,
        ).toEqual([MOUNTS, MOUNTS, FRAMES, FRAMES, FRAMES, FRAMES]);
        const ratio = (a: readonly number[], b: readonly number[]) =>
          `${median(a).toFixed(2)} ms without, ${median(b).toFixed(2)} ms with, ratio ${(median(b) / median(a)).toFixed(3)}`;
        report.push(
          `${name}: end frame ${ratio(endFrameA, endFrameB)}; fade frame ${ratio(fadeFrameA, fadeFrameB)}; mount ${ratio(mountA, mountB)}`,
        );
      }
      console.log(
        `contact-shadow budget (SwiftShader ${SIZE.width}x${SIZE.height}, ${browser.version()}, ABBA, medians of ${FRAMES} frames and ${MOUNTS} mounts):\n${report.join("\n")}`,
      );
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 900_000);
});
