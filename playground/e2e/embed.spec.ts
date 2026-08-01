import { expect, test } from "@playwright/test";
import { BROKEN_PLAN, SIMPLE_PLAN, embedHash, waitForPlan, watchForProblems } from "./fixtures.js";

/**
 * The chrome-less embed page — the thing third-party blogs `<iframe>` in.
 *
 * It has no editor to fall back on and no chrome to explain itself, so its
 * failure modes are the interesting part: a broken plan must draw the
 * self-describing error CARD, an undecodable link must still draw SOMETHING, and
 * a live edit must never blank a plan that already rendered.
 *
 * TAG `@prod` — PER TEST, deliberately NOT on the describe.
 * `.github/workflows/nightly.yml` re-runs the tagged subset against the LIVE
 * https://playground.archlang.uk (`E2E_BASE_URL` + `--grep @prod`), so only the
 * pure LOAD-AND-LOOK cases carry the tag: navigate to a `#z=` URL, assert what
 * was drawn. The typing cases below (`editable=1`, the transient-error latch),
 * the theme swap and the zoom toolbar stay UNTAGGED — not because they are unsafe
 * against production, but because the nightly subset is meant to be small and
 * boringly deterministic. Anything that downloads, touches the clipboard, or
 * depends on persisted state must never be tagged.
 */
test.describe("embed page", () => {
  test("renders a plan from a #z= link", { tag: "@prod" }, async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator(".pz-stage svg")).toContainText("Main");
    await expect(page.locator("#embedErr")).toBeHidden();
    // Chrome-less: no header, no tabs, no editor unless asked for.
    await expect(page.locator("header")).toHaveCount(0);
    await expect(page.locator(".embed-editor")).toBeHidden();
  });

  test("loads every asset — no 404s, no console errors", { tag: "@prod" }, async ({ page }) => {
    // The page source references `/brand/*.svg` and `/src/embed.ts` with ROOT-
    // ABSOLUTE paths while vite's `base` is "./". This asserts that the BUILT
    // page's paths actually resolve under `vite preview` — see the verdict note
    // at the bottom of this file.
    const problems = watchForProblems(page);
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN)}`, { waitUntil: "networkidle" });
    await waitForPlan(page);

    expect(problems.badResponses, "4xx/5xx responses on the embed page").toEqual([]);
    expect(problems.failedRequests, "failed requests on the embed page").toEqual([]);
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console.error output").toEqual([]);
    // The brand mark and favicon are the two assets whose paths were in doubt.
    await expect(page.locator(".embed-brand img")).toBeVisible();
  });

  test("editable=1 shows the editor and live-recompiles", async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN, "editable=1")}`);
    await waitForPlan(page);

    const textarea = page.locator("#embedSrc");
    await expect(page.locator(".embed-editor")).toBeVisible();
    await expect(textarea).toHaveValue(SIMPLE_PLAN);

    const before = await page.locator(".pz-stage svg").getAttribute("viewBox");
    await textarea.fill(SIMPLE_PLAN.replace(/6000/g, "9000"));
    await expect.poll(() => page.locator(".pz-stage svg").getAttribute("viewBox")).not.toBe(before);
  });

  test("a transient error while typing keeps the last good preview", async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN, "editable=1")}`);
    await waitForPlan(page);
    const good = await page.locator(".pz-stage svg").getAttribute("viewBox");

    await page.locator("#embedSrc").fill(BROKEN_PLAN);
    // The error strip appears…
    await expect(page.locator("#embedErr")).toBeVisible();
    await expect(page.locator("#embedErr")).toContainText(/error/i);
    // …but the plan that already rendered stays on screen (the last-good latch).
    expect(await page.locator(".pz-stage svg").getAttribute("viewBox")).toBe(good);
  });

  test("a plan that is broken on FIRST load draws the self-describing error card", { tag: "@prod" }, async ({
    page,
  }) => {
    await page.goto(`/embed.html${await embedHash(BROKEN_PLAN)}`);
    // No good render to keep, so `onError: "svg"` renders the card instead of a blank box.
    await expect(page.locator("#embedErr")).toBeVisible();
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    await expect(page.locator(".pz-stage svg")).toContainText(/error/i);
  });

  test("theme=<key> restyles the drawing", async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    const plain = await page.locator(".pz-stage svg").innerHTML();

    // CAREFUL: a `goto` that changes only the FRAGMENT is a same-document
    // navigation — the module never re-runs and the new `theme=` would be read
    // by nobody. The embed reads its params once, at module scope, so the second
    // URL needs a real document load. (Getting this wrong makes the app look
    // broken when it isn't; it cost a bug hunt.)
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN, "theme=blueprint")}`);
    await page.reload();
    await waitForPlan(page);
    expect(await page.locator(".pz-stage svg").innerHTML()).not.toBe(plain);
    // The blueprint ground, concretely — not just "something changed".
    expect(await page.locator(".pz-stage svg").innerHTML()).toContain("#0e4a82");
  });

  test("an unknown theme key is ignored rather than fatal", async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN, "theme=not-a-theme")}`);
    await waitForPlan(page);
    await expect(page.locator("#embedErr")).toBeHidden();
  });

  test("an undecodable #z= payload falls back to the built-in demo plan", { tag: "@prod" }, async ({ page }) => {
    // ACTUAL behaviour, pinned: `srcFromHash` returns null and `init()` falls back
    // to its own one-room default, which compiles — so `#embedErr` stays HIDDEN.
    // The error strip reports COMPILE failures, not link failures. A stale or
    // truncated link therefore shows a plan, never a blank iframe.
    await page.goto("/embed.html#z=!!!not-a-valid-payload!!!");
    await waitForPlan(page);
    await expect(page.locator("#embedErr")).toBeHidden();
    await expect(page.locator(".pz-stage svg")).toContainText("Room");
  });

  test("params work after the codec token in either order", async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN, "theme=mono", "editable=1")}`);
    await waitForPlan(page);
    await expect(page.locator(".embed-editor")).toBeVisible();
  });

  test("the zoom toolbar drives the stage transform", async ({ page }) => {
    await page.goto(`/embed.html${await embedHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    const stage = page.locator(".pz-stage");
    const fitted = await stage.evaluate((el) => el.style.transform);
    await page.locator("button[data-pz='in']").click();
    await expect.poll(() => stage.evaluate((el) => el.style.transform)).not.toBe(fitted);
    await page.locator("button[data-pz='fit']").click();
    await expect.poll(() => stage.evaluate((el) => el.style.transform)).toBe(fitted);
  });
});

/**
 * VERDICT on the root-absolute paths in `embed.html` / `index.html`: FALSE ALARM.
 *
 * The SOURCE says `href="/brand/archlang-icon-plum.svg"` and
 * `src="/src/embed.ts"`, but vite's HTML transform rewrites BOTH against
 * `base: "./"` at build time. The emitted `playground/dist/embed.html` carries
 * `./brand/archlang-icon-plum.svg` and `./assets/embed-<hash>.js`, and both pages
 * are emitted flat at the dist root alongside `brand/`, so the relative paths
 * resolve. The "no 404s" test above is the standing guard: if a future config
 * change (a different `base`, a nested output dir, an asset moved out of
 * `public/`) breaks that rewrite, this spec fails instead of the deploy.
 */
