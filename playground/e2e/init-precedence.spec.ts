import { expect, test } from "@playwright/test";
import { AUTOSAVE_KEY, SIMPLE_PLAN, shareHash, waitForPlan } from "./fixtures.js";

/**
 * First-load source precedence: shared URL hash → autosaved draft → default example.
 *
 * Three inputs contend for the editor's opening document, and getting the order
 * wrong is silent and awful — a shared link that shows the recipient THEIR draft,
 * or an autosave that clobbers what someone sent you. The hash is minted here by
 * importing the app's own `share.ts` codec, so the link under test is byte-for-byte
 * the one the Copy-link button writes.
 */
const AUTOSAVED_PLAN = SIMPLE_PLAN.replace('label "Main"', 'label "Autosaved"');
const SHARED_PLAN = SIMPLE_PLAN.replace('label "Main"', 'label "Shared"');

test.describe("first-load source precedence", () => {
  test("a #z= hash wins on a clean visit", async ({ page }) => {
    await page.goto(`/${await shareHash(SHARED_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator(".cm-content")).toContainText('label "Shared"');
    await expect(page.locator(".pz-stage svg")).toContainText("Shared");
  });

  test("an autosaved draft loads when there is no hash", async ({ page }) => {
    await page.addInitScript(([key, src]) => localStorage.setItem(key!, src!), [AUTOSAVE_KEY, AUTOSAVED_PLAN] as const);
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator(".cm-content")).toContainText('label "Autosaved"');
  });

  test("the hash BEATS the autosaved draft", async ({ page }) => {
    // The whole point of the precedence: a link someone sent you must never be
    // silently replaced by your own leftover draft.
    await page.addInitScript(([key, src]) => localStorage.setItem(key!, src!), [AUTOSAVE_KEY, AUTOSAVED_PLAN] as const);
    await page.goto(`/${await shareHash(SHARED_PLAN)}`);
    await waitForPlan(page);
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
    await page.goto("/#z=!!!not-a-valid-payload!!!");
    await waitForPlan(page);
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
    await expect(page.locator(".cm-content")).not.toBeEmpty();
  });

  test("editing autosaves the draft so a reload restores it", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(AUTOSAVED_PLAN);
    // The autosave is on the same debounce as the recompile.
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY)).toContain('label "Autosaved"');

    // A reload with a hash present would take the hash branch, so clear it first —
    // this asserts the autosave branch specifically.
    await page.evaluate(() => window.history.replaceState(null, "", window.location.pathname));
    await page.reload();
    await waitForPlan(page);
    await expect(page.locator(".cm-content")).toContainText('label "Autosaved"');
  });
});
