import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { BROKEN_PLAN, enterEdit, pickPlan, shareHash, waitForPlan, watchForProblems } from "./fixtures.js";

/** The canonical line (PS-D1), the page's lede (ruling PG-D6), read from doors.json, never retyped. */
const CANONICAL_LINE: string = JSON.parse(
  readFileSync(new URL("../../site-shared/doors.json", import.meta.url), "utf8"),
).canonicalLine;

/**
 * Ruling PG-D6: exactly one H1, the header's brand, "ArchLang Playground" as real, visible text; no
 * intro band; the lede is the canonical line, word for word, small and visible at the right of the
 * stage's foot (the facts row), not in the facts themselves.
 */
async function expectHeadingAndLede(page: Page, styled = true): Promise<void> {
  const h1 = page.locator("h1");
  await expect(h1).toHaveCount(1);
  await expect(page.locator("header > h1.tb-brand")).toHaveCount(1);
  await expect(h1).toHaveText(/^\s*ArchLang\s+Playground\s*$/);
  await expect(h1).toHaveAccessibleName("ArchLang Playground");
  await expect(h1).toBeVisible();
  await expect(page.locator(".intro, section.intro")).toHaveCount(0);
  const lede = page.locator(".lede");
  await expect(lede).toHaveCount(1);
  await expect(page.locator(".facts-row > p.lede")).toHaveCount(1);
  await expect(page.locator("#facts .lede")).toHaveCount(0);
  await expect(lede).toHaveText(CANONICAL_LINE);
  // Visible, not hidden text: a lede that is display:none is a cloaking pattern, not content.
  await expect(lede).toBeVisible();
  // Small, muted text (once the page's styles are in: the pre-hydration read may beat them).
  if (styled)
    await expect
      .poll(() => lede.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), { message: "small text" })
      .toBeLessThan(13);
}

/**
 * The cold-start contract: an untouched visit shows the default example's drawing before any
 * JavaScript, then compiles it in the browser, with a clean console and no missing assets.
 *
 * This is the spec that would have caught a broken asset path, a bundler
 * externalisation mistake, or a module-scope throw — none of which the unit
 * suite or `vite build` can see, because both succeed on a page that then dies
 * in the browser.
 *
 * TAG `@prod` — WHOLE FILE. `.github/workflows/nightly.yml` re-runs the tagged
 * subset against the LIVE https://playground.archlang.uk (`E2E_BASE_URL` +
 * `--grep @prod`), so a tag here is a promise about production, not just about a
 * preview server. Every case below keeps it: they navigate, read the DOM and
 * assert — nothing downloads, writes to the clipboard, or depends on state
 * surviving a reload. (`pickPlan` on the plan gallery and the Source button
 * mutate only this throwaway browser context.) Do NOT tag a case that downloads a file,
 * reads or writes the clipboard, or asserts on localStorage persistence.
 */
test.describe("boot", { tag: "@prod" }, () => {
  test("renders the default example into the stage", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const svg = page.locator(".pz-stage svg");
    await expect(svg).toBeVisible();
    // A real compiled plan, not an empty shell: it carries a viewBox and drawn geometry.
    await expect(svg).toHaveAttribute("viewBox", /^[\d.\-\s]+$/);
    expect(await svg.locator("path, rect, line, polyline, polygon").count()).toBeGreaterThan(0);
    // …and it is the compiler's, not the one built into the page: the live compile annotates
    // every primitive for click-to-source.
    expect(await svg.locator("[data-span]").count()).toBeGreaterThan(0);
  });

  test("boots with no console errors and no failed or 4xx requests", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForPlan(page);

    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console.error output").toEqual([]);
    expect(problems.badResponses, "4xx/5xx responses").toEqual([]);
    expect(problems.failedRequests, "failed requests").toEqual([]);
  });

  test("shows no status when the plan is fine, and real plan facts", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    // Never an error state on the shipped default, and nothing on screen says so (ruling PG-D3):
    // no notice on the stage, no dot on Source; the live region keeps "ready" (or a warnings count).
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    await expect(page.locator("#status")).not.toHaveClass(/\bshow\b/);
    await expect(page.locator("#statusText")).toHaveText(/^(ready|\d+ warnings?)$/);
    const box = (await page.locator("#status").boundingBox())!;
    expect(box.width * box.height, "the status is visually hidden").toBeLessThanOrEqual(1);
    await expect(page.locator("#sourceToggle")).not.toHaveAttribute("data-status");
    // The facts line is describe()'s totals, so a non-zero room count and an area with its
    // convention prove the analysis layer ran in the browser too, not just the renderer.
    await expect(page.locator("#facts")).toHaveText(
      /^\d+ lines of ArchLang → [1-9]\d* rooms? · \d+(\.\d+)? m² \((net|centreline)\)$/,
    );
  });

  test("a broken plan shows a status on the stage and a dot on Source", async ({ page }) => {
    // Pure navigation: the plan rides in the hash, which no server sees.
    await page.goto(`/${await shareHash(BROKEN_PLAN)}`);
    await expect(page.locator("html[data-booting]")).toHaveCount(0);
    await expect(page.locator("#status")).toHaveClass(/\berr\b/);
    await expect(page.locator("#status")).toBeVisible();
    await expect(page.locator("#statusText")).toHaveText(/^\d+ errors? — open Source to see them$/);
    await expect(page.locator("#sourceToggle")).toHaveAttribute("data-status", "err");
  });

  test("serves one H1 in the header and the lede in the facts line before any JavaScript runs", async ({ page }) => {
    // `waitUntil: "commit"` returns as soon as the response's first bytes are committed —
    // before the module script has loaded, let alone executed. Anything asserted here is
    // therefore in the SERVED HTML, which is all a search or answer crawler ever sees
    // (no AI crawler executes JavaScript). Asserting it after hydration would prove
    // nothing: the app could be painting the prose itself and every crawler would still
    // read an empty body.
    await page.goto("/", { waitUntil: "commit" });
    await expectHeadingAndLede(page, false);
  });

  test("the H1 and the lede are the same after the app is up, and the intro band is gone", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expectHeadingAndLede(page);
    // The lede sits at the right of the facts line, beside the facts, on one row at this width.
    const [facts, lede] = await Promise.all([
      page.locator("#facts").boundingBox(),
      page.locator(".facts-row .lede").boundingBox(),
    ]);
    if (!facts || !lede) throw new Error("missing a box");
    expect(lede.x, "the lede is right of the facts").toBeGreaterThanOrEqual(facts.x + facts.width);
    expect(Math.abs(lede.y + lede.height / 2 - (facts.y + facts.height / 2)), "on the facts' row").toBeLessThan(8);
  });
  test("the facts and the lede are the stage's foot under the 3D preview too, not the drawing's alone", async ({
    page,
  }) => {
    await page.goto("/#3d");
    await expect(page.locator("html[data-booting]")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
    await expect(page.locator(".pz-viewport")).toBeHidden();
    await expectHeadingAndLede(page);
    await expect(page.locator("#facts")).toBeVisible();
    // Under the 3D view, outside both views: the switch flips the view above it, not the foot.
    const [stage, foot] = await Promise.all([
      page.locator("#preview3d").boundingBox(),
      page.locator("#factsRow").boundingBox(),
    ]);
    if (!stage || !foot) throw new Error("missing a box");
    expect(foot.y, "the foot is under the 3D view").toBeGreaterThanOrEqual(stage.y + stage.height - 1);
    await expect(page.locator("#preview3d #factsRow, #preview #factsRow")).toHaveCount(0);
    // Edit mode's Facts tab says the facts itself: the foot steps aside there, and comes back on Plan.
    await enterEdit(page);
    await page.locator("#tab-facts").click();
    await expect(page.locator("#factsRow")).toBeHidden();
    await page.locator("#tab-preview").click();
    await expect(page.locator(".facts-row .lede")).toBeVisible();
  });

  test("populates the plan gallery and the lint-profile selector", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    expect(await page.locator("#gallery .gal-card").count()).toBeGreaterThan(1);
    // The lint profiles belong to the Checks tab, which is edit mode's.
    await enterEdit(page);
    await expect.poll(() => page.locator("#lintProfile option").count()).toBeGreaterThan(0);
  });

  test("switching examples loads a different plan", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();
    await pickPlan(page, "Two-bed flat");
    await expect
      .poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before, { timeout: 5000 })
      .toBe(true);
  });
});

test.describe("boot without JavaScript", { tag: "@prod" }, () => {
  test.use({ javaScriptEnabled: false });

  test("the page still shows the default drawing, the H1 in the header and the lede in the facts line", async ({
    page,
  }) => {
    // The drawing is written into index.html at build time (scripts/gen-static.mjs), so a
    // crawler, a reader with JavaScript off and the first paint all get it.
    await page.goto("/");
    const svg = page.locator(".pz-stage svg[data-prerendered]");
    await expect(svg).toHaveCount(1);
    await expect(svg).toBeVisible();
    await expect(svg).toHaveAttribute("viewBox", /^[\d.\-\s]+$/);
    await expect(svg).toHaveAttribute("role", "img");
    expect(await svg.locator("path, rect, line, polyline, polygon").count()).toBeGreaterThan(0);
    // The default example's own drawing: its title block names it.
    await expect(svg).toContainText("Laneway House");
    // Fitted to the stage by CSS alone, the way pan-zoom.ts's fit() fits it once the app runs:
    // centred, and filling the stage's LIMITING side to FIT_PAD (94 %). A width floor was the
    // wrong measure: this plan is about as tall as it is wide, so in a 1280 px-wide stage its
    // height decides, and its width follows the stage's height (469 px at 1280x720 with the
    // noscript note showing; the JS fit gives 513 px on the taller JS stage — the same rule).
    const [box, stage] = await Promise.all([svg.boundingBox(), page.locator(".pz-viewport").boundingBox()]);
    expect(box && stage).toBeTruthy();
    const fill = Math.max(box!.width / stage!.width, box!.height / stage!.height);
    expect(fill, "fills the stage's limiting side to 94 %").toBeGreaterThan(0.93);
    expect(fill).toBeLessThan(0.95);
    expect(Math.abs(box!.x + box!.width / 2 - (stage!.x + stage!.width / 2)), "centred across").toBeLessThan(2);
    expect(Math.abs(box!.y + box!.height / 2 - (stage!.y + stage!.height / 2)), "centred down").toBeLessThan(2);
    // …in a stage that is most of the page, as in view mode with JavaScript (PS-D5: >= 70 %).
    const view = page.viewportSize()!;
    expect((stage!.width * stage!.height) / (view.width * view.height), "the stage's share").toBeGreaterThanOrEqual(
      0.7,
    );
    await expectHeadingAndLede(page);
    // The gallery's trigger names the plan on screen, also with no script.
    await expect(page.locator("#planName")).toHaveText("Laneway House");
    await expect(page.locator('#gallery .gal-card[aria-current="true"]')).toHaveAttribute(
      "data-label",
      "Laneway House",
    );
  });
});
