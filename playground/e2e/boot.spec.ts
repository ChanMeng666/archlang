import { expect, test } from "@playwright/test";
import { watchForProblems } from "./fixtures.js";

/**
 * The cold-start contract: an untouched visit compiles the default example and
 * draws it, with a clean console and no missing assets.
 *
 * This is the spec that would have caught a broken asset path, a bundler
 * externalisation mistake, or a module-scope throw — none of which the unit
 * suite or `vite build` can see, because both succeed on a page that then dies
 * in the browser.
 */
test.describe("boot", () => {
  test("renders the default example into the stage", async ({ page }) => {
    await page.goto("/");
    const svg = page.locator(".pz-stage svg");
    await expect(svg).toBeVisible();
    // A real compiled plan, not an empty shell: it carries a viewBox and drawn geometry.
    await expect(svg).toHaveAttribute("viewBox", /^[\d.\-\s]+$/);
    expect(await svg.locator("path, rect, line, polyline, polygon").count()).toBeGreaterThan(0);
  });

  test("boots with no console errors and no failed or 4xx requests", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".pz-stage svg")).toBeVisible();

    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console.error output").toEqual([]);
    expect(problems.badResponses, "4xx/5xx responses").toEqual([]);
    expect(problems.failedRequests, "failed requests").toEqual([]);
  });

  test("reports a ready status and real plan facts", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    // "ready" (or an N-warnings count) — never an error state on the shipped default.
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    // The facts strip is describe()'s totals, so a non-zero room count proves the
    // analysis layer ran in the browser too, not just the renderer.
    await expect(page.locator("#facts .fact").first()).toContainText("Rooms");
    expect(await page.locator("#facts .fact").count()).toBeGreaterThanOrEqual(5);
  });

  test("populates the example and lint-profile selectors from the core", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("#examples option").count()).toBeGreaterThan(1);
    expect(await page.locator("#lintProfile option").count()).toBeGreaterThan(0);
  });

  test("switching examples loads a different plan", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    const before = await page.locator(".pz-stage svg").innerHTML();
    await page.locator("#examples").selectOption("Two-bed flat");
    await expect
      .poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before, { timeout: 5000 })
      .toBe(true);
  });
});
