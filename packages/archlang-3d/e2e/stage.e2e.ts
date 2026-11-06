/**
 * What a host's 3D stage asks of the mounted replay (playground card PG1, `npm run check:3d`): a
 * canvas that follows its box (`handle.resize`) and a turntable (`view.spin`). Both are additive:
 * a host that never calls them draws exactly the frames it drew before (the key-frame baseline,
 * `keyframes.e2e.ts`, and the free camera, `free-camera.e2e.ts`, hold that path).
 *
 * The laws: after `resize(w, h)` the frame at t is the frame a fresh mount at w×h draws at t, the
 * presets re-framed too (Iso is still the end frame); `spin` takes the view once (`onTake`), turns
 * it, and Reset gives the end frame back exactly.
 */
import type {} from "./fixtures/stage-entry.js";
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

const ENTRY = fileURLToPath(new URL("./fixtures/stage-entry.ts", import.meta.url));

function payloadOf(name: string, width: number, height: number): ReplayPayload {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`${name}: ${r.refusal.code}`);
  return replayPayload(buildMesh(r.scene), { title: name, svg: compile(src, { world: WORLD }).svg, width, height });
}

describe("the replay on a host's stage (card PG1)", () => {
  it("resize draws what a fresh mount at that size draws; spin turns the view and Reset undoes it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-stage-"));
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
    try {
      const file = join(dir, "stage.html");
      const script = await bundleViewer(ENTRY);
      writeFileSync(file, `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas><script>${script}</script>`);
      const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(pathToFileURL(file).href);

      const small = payloadOf("two-storey.arch", 480, 270);
      const tall = payloadOf("two-storey.arch", 360, 480);
      const at = (t: number) =>
        page.evaluate(async (x) => {
          window.__handle?.seek(x);
          return window.__handle?.frameHash();
        }, t);
      const now = () => page.evaluate(() => window.__handle?.frameHash());

      // A fresh mount at the tall size: the frames the resized one must match.
      await page.evaluate((p) => window.__mount(p), tall);
      const freshEnd = await at(1);
      const freshMid = await at(0.4);
      await page.evaluate(() => window.__handle?.view?.preset("north"));
      const freshNorth = await now();

      // The small mount, drawn, then resized to the tall size.
      await page.evaluate((p) => window.__mount(p), small);
      const smallEnd = await at(1);
      expect(smallEnd).not.toBe(freshEnd);
      await page.evaluate(() => window.__handle?.resize(360, 480));
      expect(
        await page.evaluate(() => [
          (document.getElementById("c") as HTMLCanvasElement).width,
          (document.getElementById("c") as HTMLCanvasElement).height,
        ]),
      ).toEqual([360, 480]);
      expect(await now(), "resize redraws the last frame at the new size").toBe(freshEnd);
      expect(await at(0.4)).toBe(freshMid);
      await page.evaluate(() => window.__handle?.view?.preset("north"));
      expect(await now(), "the presets are re-framed").toBe(freshNorth);
      // A preset draws the replay time last drawn (0.4 above: the storeys half risen), so back to
      // t = 1 first: Iso at the end is the end frame.
      expect(await at(1)).toBe(freshEnd);
      await page.evaluate(() => window.__handle?.view?.preset("iso"));
      expect(await now(), "Iso is still the end frame").toBe(freshEnd);
      // The same size again draws nothing new.
      await page.evaluate(() => window.__handle?.resize(360, 480));
      expect(await now()).toBe(freshEnd);

      // spin: the first step takes the view (once), each step turns it; Reset is the end frame.
      await page.evaluate(() => window.__handle?.view?.reset());
      expect(await at(1)).toBe(freshEnd);
      const takes = await page.evaluate(() => window.__takes);
      await page.evaluate(() => window.__handle?.view?.spin(0));
      expect(await now(), "spin(0) moves nothing").toBe(freshEnd);
      expect(await page.evaluate(() => window.__handle?.view?.camera)).toBe("replay");
      await page.evaluate(() => window.__handle?.view?.spin(12));
      const one = await now();
      expect(one, "a step turns the view").not.toBe(freshEnd);
      expect(await page.evaluate(() => window.__handle?.view?.camera)).toBe("free");
      await page.evaluate(() => window.__handle?.view?.spin(12));
      expect(await now(), "and the next turns it further").not.toBe(one);
      expect(await page.evaluate(() => window.__takes), "the view is taken once").toBe(takes + 1);
      await page.evaluate(() => window.__handle?.view?.reset());
      expect(await now(), "Reset gives the end frame back").toBe(freshEnd);
      // A resize while the view is held keeps it held.
      await page.evaluate(() => window.__handle?.view?.spin(30));
      await page.evaluate(() => window.__handle?.resize(480, 270));
      expect(await page.evaluate(() => window.__handle?.view?.camera)).toBe("free");
      expect(await at(1), "back at the small size, the replay's end frame is the small mount's").toBe(smallEnd);
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
