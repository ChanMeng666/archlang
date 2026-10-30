import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
// The package's own software-WebGL flags (its replay tests render with the same ones); the one
// browser-free module of the package, so the specs' typecheck never pulls its Node entry.
import { SWIFTSHADER_ARGS } from "../../packages/archlang-3d/src/replay/swiftshader.js";
import { BROKEN_PLAN, SIMPLE_PLAN, setEditorSource, shareHash, waitForPlan } from "./fixtures.js";

/**
 * The "3D preview" tab (card A5): the separate archlang-3d package's replay of the editor's plan,
 * loaded on the tab's first open. Its frames are a function of the replay time (`seek(t)`), so two
 * seeks of one `t` give one frame hash; a plan the package refuses shows the refusal, never a
 * crash; and the chunks the page loads at startup carry no 3D code and grow by nothing 3D-sized.
 *
 * WebGL in headless Chromium: the package's own pinned software renderer (SwiftShader).
 */
test.use({ launchOptions: { args: SWIFTSHADER_ARGS } });

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const LABEL = "Preview — from the separate archlang-3d package. ArchLang itself draws plans.";

interface Handle {
  seek: (t: number) => void;
  frameHash: () => Promise<string>;
  ready: Promise<void>;
}
type W = Window & { __preview3d?: Handle };

async function hashAt(page: Page, t: number): Promise<string> {
  return page.evaluate(async (x) => {
    const h = (window as W).__preview3d as Handle;
    h.seek(x);
    return h.frameHash();
  }, t);
}

test.describe("3D preview tab", () => {
  test("loads on first open only, labels itself, and its frames are a function of t", async ({ page }) => {
    const chunks: string[] = [];
    page.on("request", (r) => {
      if (/\/assets\/preview3d-[^/]+\.js$/.test(r.url())) chunks.push(r.url());
    });
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    expect(chunks, "the 3D chunk is not fetched before the tab opens").toEqual([]);

    await page.locator("#tab-preview3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".tabview.active")).toHaveCount(1);
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    const canvas = page.locator("#preview3d canvas");
    await expect(canvas).toBeVisible();
    expect(chunks.length, "the 3D chunk loads on the first open").toBe(1);

    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    // Stop the play-through so only the seeks below draw.
    await page.locator('#preview3d input[type="range"]').evaluate((el: HTMLInputElement) => {
      el.value = "0.5";
      el.dispatchEvent(new Event("input"));
    });

    const a = await hashAt(page, 0.6);
    const end = await hashAt(page, 1);
    const b = await hashAt(page, 0.6);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b, "two seeks of one t give one frame").toBe(a);
    // The facts strip (card G4) is DOM over the canvas: at the end it names both area conventions.
    await expect(page.locator("#preview3d .p3d-strip")).toContainText(/floor area [\d.]+ m² \(net\)/);
    await expect(page.locator("#preview3d .p3d-strip")).toContainText("(to wall centre lines)");
    expect(end, "a different t is a different frame").not.toBe(a);
    // The canvas drew something: not one flat colour.
    const colours = await page.evaluate(() => {
      const c = document.querySelector("#preview3d canvas") as HTMLCanvasElement;
      const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length && seen.size < 50; i += 4 * 97)
        seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      return seen.size;
    });
    expect(colours).toBeGreaterThan(3);

    // Away and back: the chunk is not fetched again.
    await page.locator("#tab-describe").click();
    await page.locator("#tab-preview3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    expect(chunks.length, "the 3D chunk is fetched once").toBe(1);
  });

  test("a plan the package refuses shows the refusal, not a crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/${await shareHash(BROKEN_PLAN)}`);
    await expect(page.locator("#editor .cm-content")).toBeVisible();
    await page.locator("#tab-preview3d").click();
    const message = page.locator("#preview3d .p3d-message");
    await expect(message).toBeVisible();
    await expect(message).toContainText("No 3D preview: The plan does not resolve");
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    await expect(page.locator("#preview3d canvas")).toBeHidden();
    expect(errors).toEqual([]);
  });
});

/** Open the 3D tab and wait until a replay is mounted and its drawing is ready. */
async function open3d(page: Page): Promise<void> {
  await page.locator("#tab-preview3d").click();
  await page.waitForFunction(() => (window as W).__preview3d !== undefined);
  await page.evaluate(async () => {
    await (window as W).__preview3d?.ready;
  });
}

test.describe("3D preview tab follows the editor", () => {
  test("the storey switcher drives it: no selection is all storeys, L2 is storey 2 alone", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#examples").selectOption("Townhouse (3 levels)");
    await waitForPlan(page);
    await open3d(page);
    const tab = page.locator("#preview3d");
    const canvas = page.locator("#preview3d canvas");
    await expect(tab).toHaveAttribute("data-view", "all");
    await expect(canvas).toHaveAttribute("aria-label", /\(all storeys\)/);
    // No storey picked: the 3D tab shows them all, so the switcher underlines none; every other
    // tab shows the lowest storey and underlines L1, as before.
    const pressed = page.locator('#storeys button[aria-pressed="true"]');
    await expect(pressed).toHaveCount(0);
    await page.locator("#tab-describe").click();
    await expect(pressed).toHaveText("L1");
    await page.locator("#tab-preview3d").click();
    await expect(pressed).toHaveCount(0);
    await expect(tab).toHaveAttribute("data-view", "all");
    const all = await hashAt(page, 1);

    await page.locator("#storeys button", { hasText: "L2" }).click();
    await expect(tab).toHaveAttribute("data-view", "L2");
    await expect(pressed).toHaveText("L2");
    await expect(canvas).toHaveAttribute("aria-label", /\(storey L2\)/);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    expect(await hashAt(page, 1), "storey 2 alone is not the combined view").not.toBe(all);

    // Another tab and back: the storey holds, and the tab redraws.
    await page.locator("#tab-describe").click();
    await page.locator("#tab-preview3d").click();
    await expect(tab).toHaveAttribute("data-view", "L2");
  });

  test("an edit while playing goes on from the current t, not back to the start", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    const scrub = page.locator('#preview3d input[type="range"]');
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.15);
    await page.evaluate(() => {
      (window as W & { __before?: unknown }).__before = (window as W).__preview3d;
    });
    const before = Number(await scrub.inputValue());
    await setEditorSource(page, SIMPLE_PLAN.replace("6000x4000", "6000x4100"));
    await page.waitForFunction(() => (window as W & { __before?: unknown }).__before !== (window as W).__preview3d);
    expect(Number(await scrub.inputValue())).toBeGreaterThanOrEqual(before);
  });

  test("leaving the tab stops playback; coming back resumes it", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    const scrub = page.locator('#preview3d input[type="range"]');
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.05);
    await page.locator("#tab-lint").click();
    const parked = Number(await scrub.inputValue());
    await page.waitForTimeout(600);
    expect(Number(await scrub.inputValue()), "no frames while hidden").toBe(parked);
    await page.locator("#tab-preview3d").click();
    await expect.poll(async () => Number(await scrub.inputValue())).toBeGreaterThan(parked);
  });

  test("a plan that resolves but the core will not draw shows the core's message", async ({ page }) => {
    // Resolves cleanly, then `compile()` refuses it at the drawing budget (E_DRAWING_LIMIT).
    const tooBig = `plan "Budget" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Hall"
  for i in 0..200 { escalator at (0, i * 2000) size 300000x1200 dir up }
}`;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/${await shareHash(tooBig)}`);
    await expect(page.locator("#editor .cm-content")).toBeVisible();
    await page.locator("#tab-preview3d").click();
    const message = page.locator("#preview3d .p3d-message");
    await expect(message).toContainText("No 3D preview: The drawing is estimated at");
    await expect(message).not.toContainText("viewBox");
    expect(errors).toEqual([]);
  });
});

/**
 * What card A5 cares about at startup, gated directly: the 3D code is not in the chunks the page
 * loads before the tab opens (the chunk itself is lazy: the first test above sees it fetched once,
 * on the first open), and those chunks did not grow by anything 3D-sized.
 *
 * The size gate is a budget on the SUM of the startup chunks' gzip sizes, not a per-chunk ±1 %:
 * that fired on ordinary core growth (A5's own PR moved `index` +0.14 %), a re-bless hazard that
 * teaches re-blessing. The budget, `growthBudget` in the baseline, is 20,000 B: the 3D chunk is
 * ~150,500 B gzip (three.js and the package, measured at A8), so a leak of even an eighth of it
 * trips the gate, while ordinary core growth (hundreds of bytes per feature) takes dozens of PRs to
 * reach it, and reaching it is a deliberate re-baseline with its reason in the commit. Summing makes
 * the gate indifferent to the bundler renaming or re-splitting the startup chunks, so the old
 * key-set equality is dropped. Code leaks smaller than the budget are the markers' job: three.js's
 * renderer and camera class names and the package's label, each first checked to be in the 3D
 * chunk, so a minifier that drops one fails here instead of passing vacuously.
 */
test.describe("startup chunks", () => {
  test.skip(!!process.env.E2E_BASE_URL, "reads the local build");

  test("the startup chunks carry no 3D code and stay within the growth budget", () => {
    const baseline = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "startup-chunks.baseline.json"), "utf8"),
    ) as {
      growthBudget: number;
      gzip: Record<string, number>;
    };
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    const startup = [
      ...html.matchAll(/<script type="module"[^>]*\bsrc="\.\/(assets\/[^"]+\.js)"/g),
      ...html.matchAll(/<link rel="modulepreload"[^>]*\bhref="\.\/(assets\/[^"]+\.js)"/g),
    ].map((m) => m[1] as string);
    expect(startup.length, "index.html loads a module script").toBeGreaterThan(0);

    const lazy = readdirSync(join(DIST, "assets")).filter((f) => /^preview3d-[\w-]+\.js$/.test(f));
    expect(lazy, "one 3D chunk").toHaveLength(1);
    expect(startup, "the 3D chunk is not loaded or preloaded at startup").not.toContain(`assets/${lazy[0]}`);
    const lazyText = readFileSync(join(DIST, "assets", lazy[0] as string), "utf8");
    const markers = ["WebGLRenderer", "PerspectiveCamera", LABEL];
    for (const m of markers) expect(lazyText, `the marker "${m}" is in the 3D chunk`).toContain(m);

    let total = 0;
    for (const file of startup) {
      const bytes = readFileSync(join(DIST, file));
      total += gzipSync(bytes).length;
      const text = bytes.toString("utf8");
      for (const m of markers) expect(text, `${file} carries 3D code ("${m}")`).not.toContain(m);
    }
    const base = Object.values(baseline.gzip).reduce((a, b) => a + b, 0);
    expect(
      total - base,
      `startup chunks ${total} B gzip vs the baseline's ${base} B (budget +${baseline.growthBudget} B)`,
    ).toBeLessThanOrEqual(baseline.growthBudget);
  });
});
