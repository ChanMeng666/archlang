/**
 * The free camera in the single-file replay HTML (card CR4; `npm run check:3d`): the page's own
 * toolbar and three.js's OrbitControls on the canvas, in Playwright's Chromium on SwiftShader. A drag
 * and a preset move the frame; Iso and Reset return the end frame's exact hash; `__seek` still draws
 * the replay's own frame. The playground's tab is checked the same way in
 * `playground/e2e/preview3d.spec.ts`.
 */
import type {} from "../src/replay/viewer.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh } from "../src/index.js";
import { replayHtml } from "../src/node.js";
import { SWIFTSHADER_ARGS } from "../src/replay/swiftshader.js";
import { EXAMPLES_LIST, WORLD } from "../test/corpus.js";

async function htmlOf(name: string, autoplay = false): Promise<string> {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(`${name}: ${r.refusal.code}`);
  const html = await replayHtml(buildMesh(r.scene), {
    title: name,
    svg: compile(src, { world: WORLD }).svg,
    width: 480,
    height: 270,
  });
  if (autoplay) return html;
  // Every frame is chosen here: the page must not play on its own.
  return html.replace(
    '<script type="application/json"',
    '<script>window.__replayAutoplay=false</script>\n<script type="application/json"',
  );
}

describe("the replay HTML's free camera (card CR4)", () => {
  it("a drag and the presets move the view; Iso and Reset return the end frame exactly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-orbit-"));
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
    try {
      const file = join(dir, "replay.html");
      writeFileSync(file, await htmlOf("two-storey.arch"));
      const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(pathToFileURL(file).href);
      await page.evaluate(() => window.__ready);
      const end = await page.evaluate(async () => {
        window.__seek(1);
        return window.__frameHash();
      });
      const now = () => page.evaluate(() => window.__frameHash());
      const button = (name: string | RegExp) => page.getByRole("button", { name });

      // A plain click takes nothing.
      await page.locator("#archlang-replay").click();
      expect(await now(), "a click is not a drag").toBe(end);

      await button(/^Top view/).click();
      const top = await now();
      expect(top).not.toBe(end);
      await button("Iso view: the replay's end view").click();
      expect(await now(), "Iso is the end camera").toBe(end);

      const box = await page.locator("#archlang-replay").boundingBox();
      if (!box) throw new Error("no canvas");
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 120, y + 30, { steps: 6 });
      await page.mouse.up();
      expect(await now(), "a drag turns the view").not.toBe(end);
      await button(/^Reset the view/).click();
      expect(await now(), "Reset is the replay's own end frame").toBe(end);

      // Two storeys: the toolbar can hide the upper one, and show it again.
      await page.locator('[data-storeys="1"]').click();
      expect(await now()).not.toBe(end);
      await page.locator('[data-storeys="2"]').click();
      expect(await now()).toBe(end);

      // `__seek` still means the replay's own frame, whoever held the camera.
      await button("View from north: level, from the plan's top edge").click();
      expect(await now()).not.toBe(end);
      const seeked = await page.evaluate(async () => {
        window.__seek(1);
        return window.__frameHash();
      });
      expect(seeked).toBe(end);
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a preset pressed while the replay plays pauses it and holds (red-team round 1)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-orbit-"));
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ args: SWIFTSHADER_ARGS });
    try {
      const file = join(dir, "replay.html");
      writeFileSync(file, await htmlOf("laneway-house.arch", true));
      const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(file).href);
      await page.evaluate(() => window.__ready);
      const scrub = page.locator("#archlang-replay-t");
      await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 20_000 }).toBeGreaterThan(0.05);
      const top = page.getByRole("button", { name: /^Top view/ });
      await top.click();
      const parked = Number(await scrub.inputValue());
      expect(parked).toBeLessThan(1);
      const now = () => page.evaluate(() => window.__frameHash());
      const held = await now();
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(200);
        expect(await now(), `frame ${i}`).toBe(held);
      }
      expect(Number(await scrub.inputValue()), "the playback paused").toBe(parked);
      expect(await top.getAttribute("aria-pressed")).toBe("true");
      await top.click();
      expect(await now(), "a fresh press after the pause").toBe(held);
    } finally {
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
