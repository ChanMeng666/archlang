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
    // The facts strip is describe()'s totals, so a non-zero room count proves the
    // analysis layer ran in the browser too, not just the renderer.
    await expect(page.locator("#facts .fact").first()).toContainText("Rooms");
    expect(await page.locator("#facts .fact").count()).toBeGreaterThanOrEqual(5);
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
    // Fitted to the stage by CSS alone: on screen, and inside the stage.
    const [box, stage] = await Promise.all([svg.boundingBox(), page.locator(".pz-viewport").boundingBox()]);
    expect(box && stage).toBeTruthy();
    expect(box!.width).toBeGreaterThan(stage!.width * 0.4);
    expect(box!.x).toBeGreaterThanOrEqual(stage!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(stage!.x + stage!.width + 1);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".intro .lede").first()).toContainText("compiles in your browser");
    // The picker names the plan on screen, also with no script.
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
  });
});
