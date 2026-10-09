/**
 * The agent gallery page (`/gallery`), checked on the BUILT site.
 *
 * The page is generated from `docs/gallery/` by sync-docs.mjs: one pre-rendered sheet per
 * storey as a lazy `<img>`, the brief, and the source in a closed `<details>`. Nothing on it
 * compiles in the reader's browser, which is what keeps eleven sheets cheap on a phone, so
 * that is asserted here along with the routes the page points at.
 *
 * Not tagged `@prod`: the nightly run drives the deployed site, and this page exists there
 * only once the branch that adds it has been deployed.
 */
import { expect, test } from "@playwright/test";
import { readRepoFile } from "./fixtures.js";

const ENTRIES = JSON.parse(readRepoFile("docs/gallery/gallery.json")) as Array<{ id: string; model: string }>;

test.describe("the agent gallery", () => {
  test("shows every stored plan with its brief, its model and a drawing that loads", async ({ page, request }) => {
    await page.goto("/gallery");
    const plans = page.locator(".agent-plan");
    await expect(plans).toHaveCount(ENTRIES.length);
    for (const [i, entry] of ENTRIES.entries()) {
      const plan = plans.nth(i);
      await expect(plan.locator(".agent-plan-brief")).toHaveText(
        readRepoFile(`docs/gallery/${entry.id}.brief.txt`).trim(),
      );
      await expect(plan.locator(".agent-plan-by")).toContainText(entry.model);
      const srcs = await plan.locator("img").evaluateAll((imgs) => imgs.map((img) => img.getAttribute("src") ?? ""));
      expect(srcs.length, `${entry.id} shows no drawing`).toBeGreaterThan(0);
      for (const src of srcs) {
        const res = await request.get(src);
        expect(res.status(), src).toBe(200);
        expect((await res.text()).trimStart().startsWith("<svg"), src).toBe(true);
      }
    }
  });

  test("compiles nothing in the browser, and keeps the source one click away", async ({ page, request }) => {
    await page.goto("/gallery");
    await expect(page.locator(".archlive")).toHaveCount(0);
    await expect(page.locator(".agent-plan img:not([loading='lazy'])")).toHaveCount(0);
    const first = ENTRIES[0]!;
    const source = readRepoFile(`docs/gallery/${first.id}.arch`).replace(/\r\n/g, "\n");
    const details = page.locator(".agent-plan-source").first();
    await expect(details.locator("pre")).toBeHidden();
    await details.locator("summary").click();
    await expect(details.locator("pre")).toBeVisible();
    expect(await details.locator("pre").textContent()).toBe(source.trimEnd());
    // The raw file the page links to is the stored file, byte for byte.
    const raw = await request.get(`/gallery/${first.id}.arch`);
    expect(raw.status()).toBe(200);
    expect((await raw.text()).replace(/\r\n/g, "\n")).toBe(source);
  });

  test("does not scroll sideways at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/gallery");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
