import { expect, test } from "@playwright/test";
import { enterEdit, waitForPlan, watchForProblems } from "./fixtures.js";

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
 * surviving a reload. (`selectOption` on the examples picker and the Source button
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

  test("reports a ready status and real plan facts", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    // "ready" (or an N-warnings count) — never an error state on the shipped default.
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    // The facts line is describe()'s totals, so a non-zero room count and an area with its
    // convention prove the analysis layer ran in the browser too, not just the renderer.
    await expect(page.locator("#facts")).toHaveText(
      /^\d+ lines of ArchLang → [1-9]\d* rooms? · \d+(\.\d+)? m² \((net|centreline)\)$/,
    );
  });

  test("serves one H1 and the lede before any JavaScript runs", async ({ page }) => {
    // `waitUntil: "commit"` returns as soon as the response's first bytes are committed —
    // before the module script has loaded, let alone executed. Anything asserted here is
    // therefore in the SERVED HTML, which is all a search or answer crawler ever sees
    // (no AI crawler executes JavaScript). Asserting it after hydration would prove
    // nothing: the app could be painting the band itself and every crawler would still
    // read an empty body.
    await page.goto("/", { waitUntil: "commit" });
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("Playground");
    const lede = page.locator(".intro .lede").first();
    await expect(lede).toHaveCount(1);
    await expect(lede).toContainText("compiles in your browser");
    // Visible, not hidden text: the band is a real part of the page, and an SEO band that
    // is display:none is a cloaking pattern rather than content.
    await expect(lede).toBeVisible();
  });

  test("populates the example and lint-profile selectors from the core", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    expect(await page.locator("#examples option").count()).toBeGreaterThan(1);
    // The lint profiles belong to the Lint tab, which is edit mode's.
    await enterEdit(page);
    await expect.poll(() => page.locator("#lintProfile option").count()).toBeGreaterThan(0);
  });

  test("switching examples loads a different plan", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();
    await page.locator("#examples").selectOption("Two-bed flat");
    await expect
      .poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before, { timeout: 5000 })
      .toBe(true);
  });
});

test.describe("boot without JavaScript", { tag: "@prod" }, () => {
  test.use({ javaScriptEnabled: false });

  test("the page still shows the default drawing, the H1 and the lede", async ({ page }) => {
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
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".intro .lede").first()).toContainText("compiles in your browser");
    // The picker names the plan on screen, also with no script.
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
  });
});
