import { expect, type Page, test } from "@playwright/test";
import type * as Core from "../../dist/index.js";
import { decodePlanHash } from "../../src/cli/share-codec.mjs";
import { makeShareWorker } from "../worker/app.js";
import type { Env, ShareMeta } from "../worker/types.js";
import {
  ARC_RADIUS_ERROR_PLAN,
  BROKEN_PLAN,
  chooseLink,
  enterEdit,
  gotoEdit,
  openShare,
  SIMPLE_PLAN,
  setEditorSource,
  waitForPlan,
  watchStatus,
} from "./fixtures.js";

/**
 * Short links (ADR 0034), end to end: Copy short link → open `/s/<id>` → the editor holds the
 * plan byte for byte.
 *
 * `vite preview` serves the static build and runs no Worker, so the Worker's routes are answered
 * here by the Worker's OWN handler (`worker/app.ts`, over the built core and an in-memory KV),
 * through Playwright's request routing: the page's real `fetch` and its real navigation to
 * `/s/<id>` reach the real handler code. What this cannot see (the asset layer's routing, KV
 * itself) is `scripts/smoke.mjs --site playground`'s, against the deployed site.
 *
 * The plans are typed in edit mode (`gotoEdit`); the links sit in the Share menu. A
 * short link opens in view mode (it names a plain `#z=` link), so the editor is opened to read it.
 */

/** Route `/api/share…` and `/s/…` to the Worker's handler over a fresh store; returns the store. */
async function serveShortLinks(page: Page): Promise<Map<string, { value: string; metadata: ShareMeta | null }>> {
  const store = new Map<string, { value: string; metadata: ShareMeta | null }>();
  const env: Env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    SHARE: {
      getWithMetadata: async <M>(key: string) => ({
        value: store.get(key)?.value ?? null,
        metadata: (store.get(key)?.metadata ?? null) as M | null,
      }),
      put: async (key, value, options) => {
        store.set(key, { value, metadata: (options?.metadata ?? null) as ShareMeta | null });
      },
    },
  };
  // Lazy: the nightly `@prod` job builds nothing, and Playwright loads every spec before `--grep`.
  const core = (await import(new URL("../../dist/index.js", import.meta.url).href)) as typeof Core;
  const worker = makeShareWorker(core);
  await page.route(
    (url) => url.pathname === "/api/share" || url.pathname.startsWith("/api/share/") || url.pathname.startsWith("/s/"),
    async (route) => {
      const req = route.request();
      const body = req.postDataBuffer();
      const res = await worker.fetch(
        new Request(req.url(), {
          method: req.method(),
          headers: req.headers(),
          body: body ? new Uint8Array(body) : null,
        }),
        env,
      );
      await route.fulfill({
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body: Buffer.from(await res.arrayBuffer()),
      });
    },
  );
  return store;
}

test.describe("short links", () => {
  test.skip(!!process.env.E2E_BASE_URL, "drives the Worker's handler through local routing");

  test("Copy short link → open /s/<id> → the editor holds the plan byte for byte", async ({ page }) => {
    const store = await serveShortLinks(page);
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);

    // The note sits next to the choice it describes.
    await openShare(page);
    await expect(page.locator("#shareNote")).toHaveText(
      "A short link stores this plan on archlang.uk's server; the full link does not.",
    );
    await chooseLink(page, "short");
    await status.expectFlash("Short link copied");
    const short = await page.evaluate(() => navigator.clipboard.readText());
    const origin = new URL(page.url()).origin;
    expect(short).toMatch(new RegExp(`^${origin.replace(/[.]/g, "\\.")}/s/[0-9A-Za-z]{8}$`));
    expect(store.size).toBe(1);

    // A fresh visit: no autosave or URL state of the first page gets in first.
    await page.evaluate(() => localStorage.clear());
    await page.goto(new URL(short).pathname);
    await page.waitForURL((u) => u.pathname === "/" && u.hash.startsWith("#z="));
    await waitForPlan(page);
    // A shared plan opens in view mode; Source shows its text.
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await enterEdit(page);
    await expect(page.locator(".cm-content")).toContainText('plan "E2E" {');

    // Read the editor's whole document back through the full link, then decode it.
    const back = await watchStatus(page);
    await chooseLink(page, "full");
    await back.expectFlash("Link copied");
    const full = await page.evaluate(() => navigator.clipboard.readText());
    expect(decodePlanHash(new URL(full).hash.slice("#z=".length))).toBe(SIMPLE_PLAN);
  });

  test("the same plan shared twice gets the same short link", async ({ page }) => {
    const store = await serveShortLinks(page);
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const links: string[] = [];
    for (let i = 0; i < 2; i++) {
      const status = await watchStatus(page);
      await chooseLink(page, "short");
      await status.expectFlash("Short link copied");
      links.push(await page.evaluate(() => navigator.clipboard.readText()));
    }
    expect(links[1]).toBe(links[0]);
    expect(store.size).toBe(1);
  });

  test("with no server to ask, Copy short link copies the full link and says so", async ({ page }) => {
    // `vite preview` answers no /api/share; nothing is routed here.
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);
    await chooseLink(page, "short");
    await status.expectFlash("Short link unavailable: full link copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // The page's URL less the edit-mode flag: a shared link opens the drawing first.
    expect(copied).toBe(await page.evaluate(() => window.location.href.replace(/&edit$/, "")));
    expect(decodePlanHash(new URL(copied).hash.slice("#z=".length))).toBe(SIMPLE_PLAN);
  });

  // Ruling RM-D87 (card FW5): the offer under the diagnostics drawer sends nothing until its dialog
  // is confirmed; then it makes a short link as Copy short link does. Page events (RM-D86) are off
  // in an automated browser (`navigator.webdriver`), so this page is told it is not one, and the
  // one `contribute` event is checked too where the engine lets that be said.
  test("Send this plan to improve ArchLang: nothing until confirmed, then a short link", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
      } catch {
        /* the engine keeps it: the event is not checked below */
      }
    });
    const store = await serveShortLinks(page);
    const events: Array<{ e?: string; id?: string; codes?: string[] }> = [];
    const shares: string[] = [];
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/share") shares.push(r.method());
    });
    await page.route("**/api/event", async (route) => {
      events.push(JSON.parse(route.request().postData() ?? "null"));
      await route.fulfill({ status: 204 });
    });
    await gotoEdit(page);
    await setEditorSource(page, ARC_RADIUS_ERROR_PLAN);
    const offer = page.locator("#errors .contrib-open");
    await expect(offer).toHaveText("Send this plan to improve ArchLang");

    // Cancel sends nothing.
    await offer.click();
    const dialog = page.locator("dialog.contrib-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("full plan text");
    await expect(dialog).toContainText("anyone with the link can open the plan");
    await expect(dialog).toContainText("never published");
    await expect(dialog).toContainText("E_ARC_RADIUS");
    await dialog.locator(".contrib-cancel").click();
    await expect(dialog).toHaveCount(0);
    expect(shares).toEqual([]);
    expect(store.size).toBe(0);

    // Confirmed: one POST /api/share, the link shown in the dialog.
    await offer.click();
    await page.locator("dialog.contrib-dialog .contrib-send").click();
    const link = page.locator("dialog.contrib-dialog .contrib-link");
    await expect(link).toHaveValue(/\/s\/[0-9A-Za-z]{8}$/);
    expect(shares).toEqual(["POST"]);
    expect(store.size).toBe(1);
    const id = new URL(await link.inputValue()).pathname.slice("/s/".length);
    if (await page.evaluate(() => navigator.webdriver === false)) {
      await expect
        .poll(() => events.filter((e) => e.e === "contribute"))
        .toEqual([{ e: "contribute", id, codes: ["E_ARC_RADIUS"] }]);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.contrib-dialog")).toHaveCount(0);
  });

  test("a plan that does not parse is offered no contribution (the store would refuse it)", async ({ page }) => {
    await gotoEdit(page);
    await setEditorSource(page, BROKEN_PLAN);
    await expect(page.locator("#errors .diagrow").first()).toBeVisible();
    await expect(page.locator("#errors .contrib-open")).toHaveCount(0);
  });

  test("embed.html#s=<id> draws the stored plan; an unknown id says so", async ({ page }) => {
    await serveShortLinks(page);
    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);
    const status = await watchStatus(page);
    await chooseLink(page, "short");
    await status.expectFlash("Short link copied");
    const id = new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname.slice("/s/".length);

    await page.goto(`/embed.html#s=${id}`);
    await waitForPlan(page);
    await expect(page.locator(".pz-stage svg")).toContainText("Main");
    await expect(page.locator("#embedErr")).toBeHidden();

    // Leave the page first: only the fragment differs, which would not reload it.
    await page.goto("about:blank");
    await page.goto("/embed.html#s=zzzzzzzz");
    await expect(page.locator("#embedErr")).toHaveText("This short link names no stored plan.");
    await expect(page.locator(".pz-stage svg")).toHaveCount(0);
  });
});
