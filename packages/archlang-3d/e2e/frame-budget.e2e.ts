/**
 * The contact shadows' cost (product-roadmap card RM8.8; design `visual-language.md` §1.3), measured
 * as visual-assets card V9 measured the shadow map it turned down (+55% a frame): Chromium on
 * SwiftShader, 1600 × 900, one sample a pixel. Two pages in one browser, their payloads differing
 * only in `shadows: false` (A) or not (B); after 10 frames each to warm up, A and B take turns for 60
 * frames each, every frame moving between the end and 1 ms of replay before it, so each one is
 * really drawn, and each read back (`frameHash`) so the GPU has finished. The mount (mount, then the
 * end frame) is timed 15 times each.
 *
 * It PRINTS each plan's medians and the B/A ratios (the budget: at most 1.30 on the worst plan, frame
 * and mount alike) and asserts only that it measured: a timing assertion would flake on a loaded
 * runner. The numbers are copied into the PR from `3D package (check:3d)`'s log, never taken locally.
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

function payloadOf(name: string): ReplayPayload {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`${name}: ${r.refusal.code}`);
  return replayPayload(buildMesh(r.scene), { title: name, svg: compile(src, { world: WORLD }).svg, ...SIZE });
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

describe("contact shadows' frame-time budget (card RM8.8)", () => {
  it("measures each plan's frame and mount, with the shadows and without, and prints the ratios", async () => {
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
      // One replay is 15 s: 1 ms before the end, in replay time.
      const before = 1 - 1 / 15000;
      for (const name of PLANS) {
        const b = payloadOf(name);
        const a: ReplayPayload = { ...b, shadows: false };
        const mountA: number[] = [];
        const mountB: number[] = [];
        for (let i = 0; i < MOUNTS; i++) {
          mountA.push(await pageA.evaluate((p) => window.__mountTimed(p), a));
          mountB.push(await pageB.evaluate((p) => window.__mountTimed(p), b));
        }
        const frame = (page: typeof pageA, i: number) =>
          page.evaluate((t) => window.__frameTimed(t), i % 2 === 0 ? before : 1);
        for (let i = 0; i < WARM; i++) {
          await frame(pageA, i);
          await frame(pageB, i);
        }
        const frameA: number[] = [];
        const frameB: number[] = [];
        for (let i = 0; i < FRAMES; i++) {
          frameA.push(await frame(pageA, i));
          frameB.push(await frame(pageB, i));
        }
        for (const xs of [mountA, mountB, frameA, frameB])
          expect(
            xs.every((x) => Number.isFinite(x) && x >= 0),
            name,
          ).toBe(true);
        expect([frameA.length, frameB.length, mountA.length, mountB.length], name).toEqual([
          FRAMES,
          FRAMES,
          MOUNTS,
          MOUNTS,
        ]);
        const [fa, fb, ma, mb] = [median(frameA), median(frameB), median(mountA), median(mountB)];
        report.push(
          `${name}: frame ${fa.toFixed(2)} ms without, ${fb.toFixed(2)} ms with, ratio ${(fb / fa).toFixed(3)}; ` +
            `mount ${ma.toFixed(2)} ms without, ${mb.toFixed(2)} ms with, ratio ${(mb / ma).toFixed(3)}`,
        );
      }
      console.log(
        `contact-shadow budget (SwiftShader ${SIZE.width}x${SIZE.height}, ${browser.version()}, medians of ${FRAMES} frames and ${MOUNTS} mounts):\n${report.join("\n")}`,
      );
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 900_000);
});
