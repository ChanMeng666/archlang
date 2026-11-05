import { expect, test } from "@playwright/test";
import { AUTOSAVE_KEY, enterEdit, gotoEdit, SIMPLE_PLAN, shareHash, waitForPlan } from "./fixtures.js";

/**
 * First-load source precedence: shared URL hash → autosaved draft → default example; and the
 * mode: view by default, edit with `&edit` in the hash.
 *
 * Three inputs contend for the opening document, and getting the order
 * wrong is silent and awful — a shared link that shows the recipient THEIR draft,
 * or an autosave that clobbers what someone sent you. The hash is minted here by
 * importing the app's own `share.ts` codec, so the link under test is byte-for-byte
 * the one the Copy-link button writes. The precedence cases open in edit mode (`&edit`, as
 * `arch link` mints) so the editor's own text is the witness.
 */
const AUTOSAVED_PLAN = SIMPLE_PLAN.replace('label "Main"', 'label "Autosaved"');
const SHARED_PLAN = SIMPLE_PLAN.replace('label "Main"', 'label "Shared"');

test.describe("first-load source precedence", () => {
  test("a #z= hash wins on a clean visit", async ({ page }) => {
    await gotoEdit(page, await shareHash(SHARED_PLAN));
    await expect(page.locator(".cm-content")).toContainText('label "Shared"');
    await expect(page.locator(".pz-stage svg")).toContainText("Shared");
  });

  test("an autosaved draft loads when there is no hash", async ({ page }) => {
    await page.addInitScript(([key, src]) => localStorage.setItem(key!, src!), [AUTOSAVE_KEY, AUTOSAVED_PLAN] as const);
    await gotoEdit(page);
    await expect(page.locator(".cm-content")).toContainText('label "Autosaved"');
  });

  test("the hash BEATS the autosaved draft", async ({ page }) => {
    // The whole point of the precedence: a link someone sent you must never be
    // silently replaced by your own leftover draft.
    await page.addInitScript(([key, src]) => localStorage.setItem(key!, src!), [AUTOSAVE_KEY, AUTOSAVED_PLAN] as const);
    await gotoEdit(page, await shareHash(SHARED_PLAN));
    await expect(page.locator(".cm-content")).toContainText('label "Shared"');
    await expect(page.locator(".cm-content")).not.toContainText('label "Autosaved"');
  });

  test("a clean visit falls through to the default example", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    // The <select> is set to the default only on the fall-through path, so it is
    // the honest witness that neither a hash nor an autosave was used.
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
  });

  test("an undecodable #z= payload falls back rather than showing an empty editor", async ({ page }) => {
    await page.goto("/#z=!!!not-a-valid-payload!!!&edit");
    await waitForPlan(page);
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
    await expect(page.locator(".cm-content")).not.toBeEmpty();
  });

  test("editing autosaves the draft so a reload restores it", async ({ page }) => {
    await gotoEdit(page);
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(AUTOSAVED_PLAN);
    // The autosave is on the same debounce as the recompile.
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY)).toContain('label "Autosaved"');

    // A reload with a plan in the hash would take the hash branch, so drop the plan and keep
    // only the mode — this asserts the autosave branch specifically.
    await page.evaluate(() => window.history.replaceState(null, "", `${window.location.pathname}#edit`));
    await page.reload();
    await waitForPlan(page);
    await expect(page.locator(".cm-content")).toContainText('label "Autosaved"');
  });
});

test.describe("mode", () => {
  test("a plain visit opens in view mode: the drawing, and no editor loaded", async ({ page }) => {
    const editChunks: string[] = [];
    page.on("request", (r) => {
      if (/\/assets\/edit-mode-[^/]+\.js$/.test(r.url())) editChunks.push(r.url());
    });
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator("#sourceToggle")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#editor")).toBeHidden();
    await expect(page.locator(".cm-content")).toHaveCount(0);
    expect(editChunks, "the editor's chunk is not fetched in view mode").toEqual([]);
  });

  test("a shared #z= link opens its plan in view mode", async ({ page }) => {
    await page.goto(`/${await shareHash(SHARED_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator(".pz-stage svg")).toContainText("Shared");
    await expect(page.locator(".cm-content")).toHaveCount(0);
  });

  test("#z=…&edit opens the same plan in edit mode", async ({ page }) => {
    const hash = await shareHash(SHARED_PLAN);
    await page.goto(`/${hash}&edit`);
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    await expect(page.locator("#sourceToggle")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-content")).toContainText('label "Shared"');
    await expect(page.locator(".pz-stage svg")).toContainText("Shared");
    // The token is read as it is, and the flag stays in the address bar.
    expect(await page.evaluate(() => location.hash)).toBe(`${hash}&edit`);
  });

  test("Source toggles the flag in the hash and keeps the plan token", async ({ page }) => {
    const hash = await shareHash(SHARED_PLAN);
    await page.goto(`/${hash}`);
    await waitForPlan(page);
    await enterEdit(page);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`${hash}&edit`);
    await expect(page.locator(".cm-content")).toContainText('label "Shared"');

    await page.locator("#sourceToggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
    await expect(page.locator("#editor")).toBeHidden();

    // A hash-less visit gets `#edit` alone, and loses it again.
    await page.goto("about:blank");
    await page.goto("/");
    await waitForPlan(page);
    await enterEdit(page);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#edit");
    await page.locator("#sourceToggle").click();
    await expect.poll(() => page.evaluate(() => location.href.endsWith("/"))).toBe(true);
  });
});
