import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { SIMPLE_PLAN, embedHash, shareHash, waitForPlan, watchForProblems } from "./fixtures.js";

/**
 * The shared-plan notice, in the assembled page.
 *
 * The unit test proves the decision; only the browser can prove the decision is
 * WIRED — that the element reaches the DOM on a stranger's permalink, stays away on
 * a stock-example one, and that mounting it breaks nothing else on boot.
 *
 * The bundled source is read from `examples/one-room.arch` on disk, which is the
 * same file Vite inlines with `?raw`, so this is the real byte-equality case rather
 * than a plan that merely looks like a preset. If a future change to the example
 * made these diverge, the "no notice" assertion below is what would catch it.
 *
 * UNTAGGED (no `@prod`): the nightly subset stays small and load-and-look, and one
 * case here clicks a control.
 */
const ONE_ROOM = readFileSync(new URL("../../examples/one-room.arch", import.meta.url), "utf8");

/** A plan whose LABELS impersonate browser chrome — the reason the notice exists. */
const CRAFTED_PLAN = SIMPLE_PLAN.replace('label "Main"', 'label "Session expired - sign in"');

const NOTICE = ".shared-notice";
const NOTICE_TEXT = "Its text and labels were written by whoever shared it, not by ArchLang.";
/** The embed carries the SHORT variant; both halves of the claim must survive it. */
const EMBED_NOTICE_TEXT = "written by whoever shared it, not by ArchLang.";

test.describe("shared-plan notice", () => {
  test("a #z= link to a plan nobody bundled is attributed", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(`/${await shareHash(CRAFTED_PLAN)}`);
    await waitForPlan(page);

    const notice = page.locator(NOTICE);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(NOTICE_TEXT);
    // A status region, so a screen reader hears it without the caret leaving the editor.
    await expect(notice).toHaveAttribute("role", "status");
    // The plan itself still rendered — the notice annotates, it does not gate.
    await expect(page.locator(".pz-stage svg")).toContainText("Session expired");

    expect(problems.pageErrors, "page errors").toEqual([]);
    expect(problems.consoleErrors, "console errors").toEqual([]);
  });

  test("the notice dismisses, and stays dismissed for this view only", async ({ page }) => {
    await page.goto(`/${await shareHash(CRAFTED_PLAN)}`);
    await waitForPlan(page);
    await page.locator(`${NOTICE} .shared-notice-dismiss`).click();
    await expect(page.locator(NOTICE)).toHaveCount(0);

    // Nothing is persisted, on purpose: the next shared link is a DIFFERENT
    // stranger's text, and a remembered dismissal would silence exactly the visit
    // the notice exists for.
    await page.reload();
    await waitForPlan(page);
    await expect(page.locator(NOTICE)).toBeVisible();
  });

  test("a permalink to a BUNDLED example is not attributed to a stranger", async ({ page }) => {
    await page.goto(`/${await shareHash(ONE_ROOM)}`);
    await waitForPlan(page);
    // Proves the link really did load that plan, so the absent notice is the
    // predicate's answer and not a hash that silently failed to decode.
    await expect(page.locator(".cm-content")).toContainText("One Room");
    await expect(page.locator(NOTICE)).toHaveCount(0);
  });

  test("a plain visit carries no notice", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator(NOTICE)).toHaveCount(0);
  });

  test("the embed page attributes a shared plan too", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto(`/embed.html${await embedHash(CRAFTED_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator(NOTICE)).toBeVisible();
    await expect(page.locator(NOTICE)).toContainText(EMBED_NOTICE_TEXT);
    // Still chrome-less and still drawing.
    await expect(page.locator(".pz-stage svg")).toContainText("Session expired");
    expect(problems.pageErrors, "page errors").toEqual([]);
    expect(problems.consoleErrors, "console errors").toEqual([]);
  });

  test("a hash-less embed shows its fallback plan with no notice", async ({ page }) => {
    await page.goto("/embed.html");
    await waitForPlan(page);
    await expect(page.locator(NOTICE)).toHaveCount(0);
  });

  test("the embed notice is shortened, never clipped — even in a narrow iframe", async ({ page }) => {
    // The first cut used `text-overflow: ellipsis` to force one line and ate the
    // "not by ArchLang" half at 720px, everything but the opening clause at 380px.
    // A disclaimer that stops before its point is not a disclaimer, so the strip
    // wraps instead — asserted as "the text is not overflowing its own box".
    await page.setViewportSize({ width: 380, height: 420 });
    await page.goto(`/embed.html${await embedHash(CRAFTED_PLAN)}`);
    await waitForPlan(page);
    const text = page.locator(`${NOTICE} .shared-notice-text`);
    await expect(text).toContainText(EMBED_NOTICE_TEXT);
    const clipped = await text.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, "the notice text is clipped horizontally").toBe(false);
    // And the drawing still has the room it is annotating.
    await expect(page.locator(".pz-stage svg")).toBeVisible();
  });

  test("an embed of the plan the embed itself bundles is not attributed", async ({ page }) => {
    // The embed's "bundled" set is the one plan it ships (examples/one-room.arch),
    // not the playground's 27 presets — shipping those into every iframe to silence
    // a notice would cost a quarter of a megabyte of example text.
    await page.goto(`/embed.html${await embedHash(ONE_ROOM)}`);
    await waitForPlan(page);
    await expect(page.locator(".pz-stage svg")).toContainText("Room");
    await expect(page.locator(NOTICE)).toHaveCount(0);
  });
});
