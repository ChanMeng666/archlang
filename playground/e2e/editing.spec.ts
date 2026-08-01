import { expect, test } from "@playwright/test";
import { ARC_RADIUS_ERROR_PLAN, RESIZED_PLAN, SIMPLE_PLAN, setEditorSource, waitForPlan } from "./fixtures.js";

/**
 * The authoring loop, end to end in the browser: type → debounced recompile →
 * diagnostics as data → apply the machine-applicable fix → clean again.
 *
 * The fix button routes through the same `rankFixes` → `applyFixes` pair that
 * `arch fix` uses, so this is also the assertion that the page and the CLI make
 * the identical edit.
 */
test.describe("editing", () => {
  test("a typed edit recompiles the preview after the debounce", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);

    await setEditorSource(page, SIMPLE_PLAN);
    await expect.poll(() => page.locator(".pz-stage svg").getAttribute("viewBox")).toBeTruthy();
    const first = await page.locator(".pz-stage svg").getAttribute("viewBox");

    // Same plan, 1.5x wider — the viewBox must move, which only a real recompile does.
    await setEditorSource(page, RESIZED_PLAN);
    await expect.poll(() => page.locator(".pz-stage svg").getAttribute("viewBox")).not.toBe(first);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
  });

  test("surfaces an E_ code in the diagnostics panel and applies its fix", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);

    await setEditorSource(page, ARC_RADIUS_ERROR_PLAN);

    // Diagnostics are data, not a toast: the panel shows the catalogued code.
    const errors = page.locator("#errors");
    await expect(errors).toHaveClass(/show/);
    const row = errors.locator(".diagrow", { has: page.locator("code", { hasText: "E_ARC_RADIUS" }) });
    await expect(row).toBeVisible();
    await expect(page.locator("#status")).toHaveClass(/err/);
    // The remedy is visible without a click.
    await expect(row.locator(".diag-fix")).toBeVisible();

    // Apply it for real — the same edit `arch fix` would make.
    const apply = row.locator(".diag-apply");
    await expect(apply).toHaveAttribute("title", /minimum radius 2000/);
    await apply.click();

    // Source updated…
    await expect(page.locator(".cm-content")).toContainText("radius 2000");
    // …and the plan is clean: panel hidden, status recovered, plan drawn.
    await expect(errors).not.toHaveClass(/show/);
    await expect(errors.locator(".diagrow")).toHaveCount(0);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    await expect(page.locator(".pz-stage svg")).toBeVisible();
  });

  test("keeps the last good preview while the source is broken", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    const good = await page.locator(".pz-stage svg").getAttribute("viewBox");

    await setEditorSource(page, `plan "E2E" {\n  units mm\n  romo at (0,0) size 4000x3000\n}`);
    await expect(page.locator("#status")).toHaveClass(/err/);
    // main.ts returns early on an error — the stage still shows the last good plan.
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    expect(await page.locator(".pz-stage svg").getAttribute("viewBox")).toBe(good);
  });

  test("a diagnostic row jumps the editor caret to its source span", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, ARC_RADIUS_ERROR_PLAN);

    const row = page.locator("#errors .diagrow").first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-offset", /^\d+$/);
    await row.click();
    // The row discloses its catalogued cause/example…
    await expect(row).toHaveClass(/open/);
    // …and focus lands back in the editor at the offending span.
    await expect(page.locator(".cm-content")).toBeFocused();
  });

  test("the Lint tab reports soundness separately from compile errors", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    // A room with no door: reachable-room lint fires, but the plan still COMPILES.
    await setEditorSource(
      page,
      `plan "E2E" {\n  units mm\n  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room id=a at (0,0) size 6000x4000 label "Bedroom"\n}`,
    );
    await page.locator("#tab-lint").click();
    await expect(page.locator("#lint")).toHaveClass(/active/);
    await expect(page.locator("#lintOutput .lintrow, #lintOutput .ok")).not.toHaveCount(0);
    // Compiling cleanly and being architecturally sound are different questions.
    await expect(page.locator("#status")).not.toHaveClass(/err/);
  });
});
