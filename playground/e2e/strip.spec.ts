import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gotoEdit, SIMPLE_PLAN, setEditorSource, shareHash, waitForPlan } from "./fixtures.js";

/**
 * The plan strip (card P2): a thumbnail link per example under the drawing, in view mode. Its links
 * and thumbnails are in the served page (scripts/gen-static.mjs), in the picker's order, so it works
 * with no script; with script a click opens the plan here, and the strip and the picker always name
 * the same plan. Untagged (no `@prod`): the nightly run against the live site would fail on a deploy
 * lag that is not a bug.
 */

const items = (page: Page) => page.locator("#strip a.strip-item");
const current = (page: Page) => page.locator('#strip a.strip-item[aria-current="true"]');
/**
 * The examples the picker offers, in order (gen-static writes both from `EXAMPLE_ROWS`): its grouped
 * options, not the neutral entry `markPlan` shows for a plan that is no example, and not the
 * playground-only samples' group (`data-sample`, samples.ts), which the strip does not list.
 */
const pickerLabels = (page: Page) =>
  page
    .locator("#examples optgroup:not([data-sample]) > option")
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
const box = async (page: Page) => {
  const b = (await page.locator(".pz-viewport").boundingBox())!;
  return [b.x, b.y, b.width, b.height].map(Math.round);
};

test.describe("plan strip", () => {
  test("lists every example in the picker's order, the default marked, and counts them in Tools", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const labels = await pickerLabels(page);
    expect(labels.length).toBeGreaterThan(1);
    const strip = await items(page).evaluateAll((as) => as.map((a) => (a as HTMLElement).dataset.label));
    expect(strip).toEqual(labels);
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toHaveAttribute("data-label", "Laneway House");
    // Each link's name is its plan's label, and it goes to that plan's static page.
    await expect(items(page).first()).toHaveAccessibleName("Laneway House");
    await expect(items(page).first()).toHaveAttribute("href", "/examples/laneway-house.html");
    // "All plans", and the Tools menu's count is the number of plans, not a typed figure.
    await expect(page.locator("#strip a.strip-all")).toHaveAttribute("href", "/examples/");
    await expect(page.locator('#tools a[href="/examples/"]')).toHaveText(`${labels.length} example plans`, {
      useInnerText: false,
    });
  });

  test("a strip click opens the plan here, and the picker follows", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();
    await items(page)
      .filter({ has: page.locator('img[alt="Two-bed flat"]') })
      .click();
    await expect(page).toHaveURL(/\/(#.*)?$/); // not the static page
    await expect(page.locator("#examples")).toHaveValue("Two-bed flat");
    await expect(current(page)).toHaveAttribute("data-label", "Two-bed flat");
    await expect
      .poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before, { timeout: 5000 })
      .toBe(true);
  });

  test("a picker change moves the strip's mark", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#examples").selectOption("Museum (A1 sheet)");
    await expect(current(page)).toHaveCount(1);
    await expect(current(page)).toHaveAttribute("data-label", "Museum (A1 sheet)");
    // Scrolled into the strip's own view, not the page's.
    await expect(current(page)).toBeInViewport();
  });

  test("is one tab stop the arrow keys move through, and Enter opens a plan", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const stops = await items(page).evaluateAll((as) => as.filter((a) => (a as HTMLElement).tabIndex === 0).length);
    expect(stops, "one tab stop in the strip").toBe(1);
    await current(page).focus();
    await page.keyboard.press("ArrowRight");
    const second = (await pickerLabels(page))[1]!;
    await expect(page.locator("#strip a.strip-item:focus")).toHaveAttribute("data-label", second);
    await page.keyboard.press("End");
    const last = (await pickerLabels(page)).at(-1)!;
    await expect(page.locator("#strip a.strip-item:focus")).toHaveAttribute("data-label", last);
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.locator("#examples")).toHaveValue(second);
    await expect(current(page)).toHaveAttribute("data-label", second);
  });

  test("every thumbnail resolves, and none of them moves the drawing", async ({ page, request }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await waitForPlan(page);
    const srcs = await page
      .locator("#strip img")
      .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute("src")!));
    expect(srcs.length).toBe((await pickerLabels(page)).length);
    for (const src of srcs) {
      expect(src).toMatch(/^\/examples\/thumbs\/[\w-]+\.svg$/);
      const res = await request.get(src);
      expect(res.status(), src).toBe(200);
      expect(res.headers()["content-type"], src).toContain("image/svg+xml");
    }
    // Lazy, with a declared intrinsic size, in a box whose size is fixed before any arrives.
    for (const attr of ["loading", "width", "height"]) {
      const missing = await page
        .locator("#strip img")
        .evaluateAll((imgs, a) => imgs.filter((i) => !i.getAttribute(a)).length, attr);
      expect(missing, `thumbnails with no ${attr}`).toBe(0);
    }
    const stage = await box(page);
    const stripBox = await page.locator("#strip").boundingBox();
    // Bring every thumbnail in (the strip scrolls sideways) and wait for all of them.
    await page.locator("#stripList").evaluate((l) => {
      l.scrollLeft = l.scrollWidth;
    });
    await expect
      .poll(() =>
        page
          .locator("#strip img")
          .evaluateAll(
            (imgs) =>
              imgs.filter((i) => !(i as HTMLImageElement).complete || !(i as HTMLImageElement).naturalWidth).length,
          ),
      )
      .toBe(0);
    expect(await box(page), "the stage box after every thumbnail loaded").toEqual(stage);
    expect(await page.locator("#strip").boundingBox()).toEqual(stripBox);
  });

  test("swipes inside itself on a phone, with no page-level sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForPlan(page);
    const strip = page.locator("#strip");
    await strip.scrollIntoViewIfNeeded();
    await expect(strip).toBeVisible();
    const { over, scrolls, snap } = await page.evaluate(() => {
      const l = document.getElementById("stripList")!;
      return {
        over: document.documentElement.scrollWidth - window.innerWidth,
        scrolls: l.scrollWidth > l.clientWidth,
        snap: getComputedStyle(l).scrollSnapType,
      };
    });
    expect(over, "horizontal page overflow at 390px").toBeLessThanOrEqual(0);
    expect(scrolls, "the strip scrolls sideways inside itself").toBe(true);
    expect(snap).toContain("x");
    // "All plans" stays on screen beside it, touch-sized.
    const all = page.locator("#strip a.strip-all");
    await expect(all).toBeInViewport();
    expect((await all.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  });

  test("is view mode's: edit mode hides it", async ({ page }) => {
    await gotoEdit(
      page,
      await shareHash(readFileSync(new URL("../../examples/one-room.arch", import.meta.url), "utf8")),
    );
    await expect(page.locator("#strip")).toBeHidden();
    // The plan a link opens is named in the strip AND the picker when it is an example word for word.
    await page.locator("#sourceToggle").click();
    await expect(page.locator("#strip")).toBeVisible();
    await expect(current(page)).toHaveAttribute("data-label", "One room");
    await expect(page.locator("#examples")).toHaveValue("One room");
  });

  test("a shared plan that is no example is named in neither: the picker says so, the strip marks none", async ({
    page,
  }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(current(page)).toHaveCount(0);
    await expect(page.locator("#examples")).toHaveValue("");
    await expect(page.locator("#examples option:checked")).toHaveText("Shared plan");
    // Shown, never offered: the neutral entry is not one of the plans to choose.
    expect(await pickerLabels(page)).not.toContain("");
    // Choosing an example names it in both again.
    await items(page)
      .filter({ has: page.locator('img[alt="One room"]') })
      .click();
    await expect(page.locator("#examples")).toHaveValue("One room");
    await expect(current(page)).toHaveAttribute("data-label", "One room");
  });

  test("an edit that makes the plan no longer the example un-names it in both", async ({ page }) => {
    await gotoEdit(page);
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
    const laneway = readFileSync(new URL("../../examples/laneway-house.arch", import.meta.url), "utf8").replace(
      /\r\n?/g,
      "\n",
    );
    await setEditorSource(page, `${laneway}\n# edited\n`);
    await expect(page.locator("#examples")).toHaveValue("");
    await expect(page.locator("#examples option:checked")).toHaveText("Edited plan");
    await expect(current(page)).toHaveCount(0);
    // Back to the example word for word (an undo would do the same): named in both again.
    await setEditorSource(page, laneway);
    await expect(page.locator("#examples")).toHaveValue("Laneway House");
    await expect(current(page)).toHaveAttribute("data-label", "Laneway House");
  });
});

test.describe("plan strip without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("is links to the static example pages", async ({ page }) => {
    await page.goto("/");
    const links = items(page);
    expect(await links.count()).toBeGreaterThan(1);
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const h of hrefs) expect(h).toMatch(/^\/examples\/[\w-]+\.html$/);
    await expect(current(page)).toHaveAttribute("href", "/examples/laneway-house.html");
    await links.nth(1).click();
    await expect(page).toHaveURL((u) => u.pathname === hrefs[1]);
    await expect(page.locator("h1")).toHaveCount(1);
  });
});
