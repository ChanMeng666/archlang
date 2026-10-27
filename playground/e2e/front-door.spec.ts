import { expect, test } from "@playwright/test";
import { waitForPlan } from "./fixtures.js";

/**
 * The playground's front door: what a first visit on a phone, a small laptop or an agent
 * sees. Deliberately untagged (no `@prod`): `/llms.txt` is new, so the nightly run against
 * the live site would fail for a deploy lag that is not a bug.
 */
test.describe("front door", () => {
  for (const width of [390, 800]) {
    test(`the page never scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await waitForPlan(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    });
  }

  test("the plan comes first on a narrow screen and sits beside the editor on a wide one", async ({ page }) => {
    const panes = () =>
      page.evaluate(() => {
        const [editor, plan] = [...document.querySelectorAll("main > .pane")].map((p) => p.getBoundingClientRect());
        return { editor: editor!, plan: plan! };
      });
    // Narrow: one view at a time (Code · Plan · Problems), and the first is the plan.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("#mviews")).toBeVisible();
    await expect(page.locator("main > .pane").nth(1)).toBeVisible();
    await expect(page.locator("main > .pane").first()).toBeHidden();

    // Wide: the switcher is gone and both panes are side by side.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#mviews")).toBeHidden();
    const wide = await panes();
    expect(wide.plan.left, "plan pane right of the editor pane").toBeGreaterThan(wide.editor.left);
  });

  test("the first visit opens a plan with no diagnostics", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
    // #errors is the COMPILE sink; lint renders into #lintOutput (a clean plan shows the ".ok" verdict).
    await expect(page.locator("#errors")).toBeEmpty();
    await expect(page.locator("#lintOutput .lintrow")).toHaveCount(0);
    await expect(page.locator("#lintOutput .ok")).toHaveCount(1);
  });

  for (const width of [1280, 1366]) {
    test(`the toolbar stays on one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await waitForPlan(page);
      // Every visible header item must start above the first cell's bottom edge: a Share
      // control that wraps "⋯" or a cell onto a second row fails here, loudly.
      const wrapped = await page.evaluate(() => {
        const h = document.querySelector("header")!;
        const items = [...h.children].filter(
          (c) => getComputedStyle(c).display !== "none" && !c.classList.contains("spacer"),
        );
        const firstBottom = items[0]!.getBoundingClientRect().bottom;
        return items.filter((c) => c.getBoundingClientRect().top >= firstBottom - 1).map((c) => c.className);
      });
      expect(wrapped, `header items on a second row at ${width}px`).toEqual([]);
    });
  }

  test("a link to the agents page sits beside Copy for LLM", async ({ page }) => {
    await page.goto("/");
    const link = page.locator("#agentsLink");
    await expect(link).toHaveAttribute("href", "https://archlang.uk/agents");
    await expect(link).toHaveAttribute("rel", /noopener/);
    // Same Share cell as Copy for LLM, not somewhere else in the header.
    const sameCell = await page.evaluate(
      () =>
        document.querySelector("#agentsLink")!.closest(".tb-cell") ===
        document.querySelector("#copyLlm")!.closest(".tb-cell"),
    );
    expect(sameCell).toBe(true);
  });

  test("serves /llms.txt pointing at the docs site's llms files", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("https://archlang.uk/llms.txt");
    expect(body).toContain("https://archlang.uk/llms-full.txt");
  });
});
