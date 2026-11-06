import { expect, type Page, test } from "@playwright/test";
import { enterEdit, expectPlanNamed, waitForPlan, watchStatus } from "./fixtures.js";

/**
 * The playground's front door: what a first visit on a phone, a small laptop or an agent
 * sees. It opens in VIEW mode — the drawing is the page, the editor one click away behind
 * Source — with at most five header controls. Deliberately untagged (no `@prod`): `/llms.txt`
 * is new, so the nightly run against the live site would fail for a deploy lag that is not a bug.
 */

/** The header's visible controls, the Share and More menus' contents not counted. */
const headerControls = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("header :is(button, select, summary, a, input)")]
      .filter((e) => !e.closest(".tools-panel, .gal-panel") && e.getClientRects().length > 0)
      .map((e) => e.id || e.textContent?.trim() || e.tagName),
  );

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

  test("at 1280px the drawing takes at least 70 % of the viewport, with no editor beside it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator("#editor")).toBeHidden();
    const box = (await page.locator(".pz-viewport").boundingBox())!;
    expect((box.width * box.height) / (1280 * 800), "the drawing's share of the viewport").toBeGreaterThanOrEqual(0.7);
  });

  test("the plan comes first on a narrow screen, and Source reaches the editor", async ({ page }) => {
    const panes = () =>
      page.evaluate(() => {
        const [editor, plan] = [...document.querySelectorAll("main > .pane")].map((p) => p.getBoundingClientRect());
        return { editor: editor!, plan: plan! };
      });
    // Narrow, view mode: the drawing alone, full width; no Code · Plan · Problems switcher.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("main > .pane").nth(1)).toBeVisible();
    await expect(page.locator("main > .pane").first()).toBeHidden();
    await expect(page.locator("#mviews")).toBeHidden();
    // Source is reachable and opens the code as a second full-width screen.
    const source = page.locator("#sourceToggle");
    await expect(source).toBeVisible();
    await enterEdit(page);
    await expect(page.locator("#mviews")).toBeVisible();
    await expect(page.locator("main > .pane").first()).toBeVisible();
    await expect(page.locator("main > .pane").nth(1)).toBeHidden();
    await expect(page.locator(".cm-content")).toBeInViewport();
    // Make your own stays on screen in both modes.
    await expect(page.locator("#makeOwn")).toBeVisible();

    // Wide, edit mode: the switcher is gone and both panes are side by side.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#mviews")).toBeHidden();
    const wide = await panes();
    expect(wide.plan.left, "plan pane right of the editor pane").toBeGreaterThan(wide.editor.left);
  });

  test("the first visit opens a plan with no diagnostics", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expectPlanNamed(page, "Laneway House");
    // The diagnostics and the Checks tab (Lint) are edit mode's.
    await enterEdit(page);
    // #errors is the COMPILE sink; lint renders into #lintOutput (a clean plan shows the ".ok" verdict).
    await expect(page.locator("#errors")).toBeEmpty();
    await expect(page.locator("#lintOutput .lintrow")).toHaveCount(0);
    await expect(page.locator("#lintOutput .ok")).toHaveCount(1);
  });

  for (const width of [1280, 1366]) {
    test(`the header is one row of at most five controls at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await waitForPlan(page);
      // Every visible header item must start above the first item's bottom edge: a control
      // that wraps onto a second row fails here, loudly.
      const wrapped = await page.evaluate(() => {
        const h = document.querySelector("header")!;
        const items = [...h.children].filter(
          (c) => getComputedStyle(c).display !== "none" && !c.classList.contains("spacer"),
        );
        const firstBottom = items[0]!.getBoundingClientRect().bottom;
        return items.filter((c) => c.getBoundingClientRect().top >= firstBottom - 1).map((c) => c.className);
      });
      expect(wrapped, `header items on a second row at ${width}px`).toEqual([]);
      const controls = await headerControls(page);
      expect(controls.length, `header controls at ${width}px: ${controls.join(", ")}`).toBeLessThanOrEqual(5);
      // Exactly the gallery, Source, Share, ⋯ and Make your own (PG-D6); Checks is the stage's
      // (PG-D3). The gallery is the one plan-choosing control (PG-D2): no <select> in the header.
      expect(controls).toEqual(["planPicker", "sourceToggle", "Share ▾", "⋯", "makeOwn"]);
      await expect(page.locator("header select:visible")).toHaveCount(0);
      await expect(page.locator("#share > summary")).toBeVisible();
      await expect(page.locator("#more > summary")).toHaveAccessibleName("More");
      // The brand is the page's one heading, inside the header.
      await expect(page.locator("header > h1")).toHaveAccessibleName("ArchLang Playground");
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }

  test("Make your own is the redline control, and opens the ways to get a plan", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const button = page.locator("#makeOwn");
    await expect(button).toBeVisible();
    // The one redline-filled control in the header.
    const fill = await button.evaluate((b) => getComputedStyle(b).backgroundColor);
    const redline = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--redline-ink)";
      document.body.append(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(fill).toBe(redline);

    await button.click();
    const dialog = page.getByRole("dialog", { name: "Make your own plan" });
    await expect(dialog).toBeVisible();
    // The agents page, as the header's Agents link was (it replaces it).
    const link = page.locator("#agentsLink");
    await expect(link).toHaveAttribute("href", "https://archlang.uk/agents");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("target", "_blank");
    // "Continue this plan with your AI" (PG-D5): the two chat links and Copy for LLM, which copies
    // the prompt, closes, and says so.
    const ask = dialog.getByRole("region", { name: "Continue this plan with your AI" });
    await expect(ask.getByRole("link", { name: /^Open in (Claude|ChatGPT) ↗$/ })).toHaveCount(2);
    const status = await watchStatus(page);
    await ask.getByRole("button", { name: "Copy for LLM" }).click();
    await expect(dialog).toBeHidden();
    await status.expectFlash("LLM prompt copied");
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("This is an ArchLang floor plan");
    expect(prompt).toContain('plan "Laneway House"');
    // Escape closes it; "Edit this plan here" opens the editor.
    await button.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await button.click();
    await dialog.getByRole("button", { name: "Edit this plan here" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("serves /llms.txt pointing at the docs site's llms files", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("https://archlang.uk/llms.txt");
    expect(body).toContain("https://archlang.uk/llms-full.txt");
  });
});

/**
 * The header's three disclosures (card PG5b ⑧ ⑨): the plan gallery, Share and ⋯ (More). One open
 * at a time, whichever opens; each closes when the focus Tabs out of it; and each is named by its
 * words, its glyphs (▦, ▾, ⋯) hidden from the accessibility tree.
 */
test.describe("the header's menus (card PG5b)", () => {
  const MENUS = ["#gallery", "#share", "#more"] as const;
  const isOpen = (page: Page, id: string) => page.locator(id).evaluate((d) => (d as HTMLDetailsElement).open);
  const focusInside = (page: Page, id: string) =>
    page.evaluate((sel) => document.querySelector(sel)!.contains(document.activeElement), id);

  test("are named by their words, not their glyphs", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("#share > summary")).toHaveAccessibleName("Share");
    await expect(page.locator("#more > summary")).toHaveAccessibleName("More");
    await expect(page.locator("#gallery > summary")).toHaveAccessibleName(/^Plan: \S/);
    await expect(page.locator("#gallery > summary")).not.toHaveAccessibleName(/[▦▾]/);
    // The glyphs are still drawn, and hidden from assistive tech.
    for (const glyph of ["▦", "▾", "⋯"]) {
      const spans = page.locator("header summary span", { hasText: glyph });
      expect(await spans.count(), `${glyph} is drawn`).toBeGreaterThan(0);
      for (const el of await spans.all()) await expect(el).toHaveAttribute("aria-hidden", "true");
    }
  });

  test("opening any one closes the others", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    for (const first of MENUS) {
      for (const next of MENUS) {
        if (next === first) continue;
        await page.locator(`${first} > summary`).click();
        expect(await isOpen(page, first), `${first} opens`).toBe(true);
        await page.locator(`${next} > summary`).click();
        expect(await isOpen(page, next), `${next} opens`).toBe(true);
        for (const other of MENUS)
          if (other !== next) expect(await isOpen(page, other), `${other} closed by opening ${next}`).toBe(false);
        // Shut it again for the next pair.
        await page.keyboard.press("Escape");
        await expect.poll(() => isOpen(page, next)).toBe(false);
      }
    }
  });

  test("Share and ⋯ close when the focus Tabs out, as the gallery does", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    for (const id of MENUS) {
      await page.locator(`${id} > summary`).click();
      expect(await isOpen(page, id)).toBe(true);
      // Tab past the last focusable control inside: out of the menu.
      const stops = await page
        .locator(`${id} :is(a[href], button:not([disabled]), input, select, summary)`)
        .evaluateAll((els) => els.filter((e) => (e as HTMLElement).getClientRects().length > 0).length);
      for (let i = 0; i <= stops && (await focusInside(page, id)); i++) await page.keyboard.press("Tab");
      expect(await focusInside(page, id), `the focus left ${id}`).toBe(false);
      await expect.poll(() => isOpen(page, id), `${id} closes on a Tab out`).toBe(false);
    }
    // Shift+Tab out of the top works too: from Share's trigger back to Source.
    await page.locator("#share > summary").click();
    await page.locator("#share > summary").focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#sourceToggle")).toBeFocused();
    await expect.poll(() => isOpen(page, "#share")).toBe(false);
  });
});
