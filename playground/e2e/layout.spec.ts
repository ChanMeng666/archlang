import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { embedHash, shareHash, waitForPlan } from "./fixtures.js";

/**
 * The layout: every part of the workspace is REACHABLE, at desktop size and on a phone.
 *
 * The diagnostics drawer is the case that broke on desktop: its rows are flex items of a
 * scrolling column, and with `overflow: hidden` a row's automatic minimum height is 0 —
 * so a long diagnostic (hillside-villa's W_DRAWING_OVERFLOW) was squeezed to the drawer's
 * height and clipped, leaving the drawer nothing to scroll. The phone layout is the
 * other: three panes, a wrapping header and the intro stacked into 812px left each a
 * sliver, so below 900px the workspace shows one of Code / Plan / Problems at a time.
 */

/** A plan whose one warning is long enough to overflow the drawer once expanded. */
/**
 * A plan whose first diagnostic is a long whole-drawing one: the flagship villa (warning-free
 * since fix/examples-sound) with a 20 m drive its A1 sheet cannot hold (`W_DRAWING_OVERFLOW`)
 * and its four old 700 mm doors back (`W_PATH_TOO_NARROW` rows to scroll past).
 */
/** Each [now, before] found exactly once, so a stale fixture fails loudly instead of silently. */
const rewrite = (src: string, pairs: [string, string][]): string =>
  pairs.reduce((s, [now, before]) => {
    if (s.split(now).length !== 2) throw new Error(`"${now}" is not found exactly once`);
    return s.replace(now, before);
  }, src);
const HILLSIDE = rewrite(readFileSync(new URL("../../examples/hillside-villa.arch", import.meta.url), "utf8"), [
  ["driveway at (-5500,-3000) size 5500x3000", "driveway at (-5500,-20000) size 5500x20000"],
  ...[
    ["d_linen  on w_linen_s at 1100 width 800", "d_linen  on w_linen_s at 1100 width 700"],
    ["d_en2_corr on en2.wall at 5300 width 800", "d_en2_corr on en2.wall at 5300 width 700"],
    ["d_enm      on en_m.wall at 7500 width 800", "d_enm      on en_m.wall at 7500 width 700"],
    ["d_enb2     pocket on en_b2.wall at 7500 width 800", "d_enb2     pocket on en_b2.wall at 7500 width 700"],
  ],
] as [string, string][]);

/** Every diagnostic row shows its whole content: none is squeezed and clipped. */
async function expectNoClippedRow(page: Page): Promise<void> {
  const clipped = await page
    .locator("#errors .diagrow")
    .evaluateAll((rows) => rows.filter((r) => r.scrollHeight > r.clientHeight + 1).length);
  expect(clipped, "diagnostic rows clipped inside the drawer").toBe(0);
}

/**
 * Scroll the drawer to its end and assert the last row's last line then sits inside the
 * drawer's box — reached by scrolling the drawer, not lost below it.
 */
async function expectLastLineReachable(errors: Locator): Promise<void> {
  await errors.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const last = errors.locator(".diagrow").last();
  const [box, row] = await Promise.all([errors.boundingBox(), last.boundingBox()]);
  expect(box && row, "drawer and its last row both laid out").toBeTruthy();
  const rowBottom = row!.y + row!.height;
  expect(rowBottom, "the last line ends inside the drawer").toBeLessThanOrEqual(box!.y + box!.height + 1);
  expect(rowBottom, "the last line is on screen, not above the drawer").toBeGreaterThan(box!.y);
  await expect(last).toBeInViewport();
}

test.describe("diagnostics drawer (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("scrolls within its box with the intro open, and its last line can be reached", async ({ page }) => {
    await page.goto(`/${await shareHash(HILLSIDE)}`);
    await waitForPlan(page);
    await expect(page.locator("details.intro__disclosure")).toHaveAttribute("open", "");
    const errors = page.locator("#errors");
    await expect(errors.locator(".diagrow code").first()).toHaveText("W_DRAWING_OVERFLOW");
    await expectNoClippedRow(page);

    // Expand the row: its cause + example are far taller than the drawer.
    await errors.locator(".diag-head").first().click();
    await expect(errors.locator(".diagrow").first()).toHaveClass(/open/);
    await expectNoClippedRow(page);
    const { overflowY, scroll, client } = await errors.evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    expect(overflowY).toBe("auto");
    expect(scroll, "the expanded drawer has more to show than its box").toBeGreaterThan(client);
    // The drawer stays inside the page: it is the drawer that scrolls, not the page.
    const box = (await errors.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(900 + 1);
    await expectLastLineReachable(errors);
  });

  test("stays scrollable with the intro closed and with many diagnostics", async ({ page }) => {
    // Eight rooms stacked on one spot: a W_ROOM_OVERLAP per pair, 28 rows.
    const rooms = Array.from({ length: 8 }, (_, i) => `  room id=r${i} at (0,0) size 3000x3000 label "R${i}"\n`);
    const many = `plan "E2E" {\n  units mm\n  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n${rooms.join("")}}`;
    await page.goto(`/${await shareHash(many)}`);
    await page.locator(".intro__summary").click();
    await expect(page.locator("details.intro__disclosure")).not.toHaveAttribute("open", "");
    const errors = page.locator("#errors");
    await expect(errors.locator(".diagrow").first()).toBeVisible();
    await expect(errors.locator(".diagrow")).toHaveCount(28);
    await expectNoClippedRow(page);
    expect(await errors.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expectLastLineReachable(errors);
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  const horizontalOverflow = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  test("never scrolls sideways, and the editor, the plan and the problems are each reachable", async ({ page }) => {
    await page.goto(`/${await shareHash(HILLSIDE)}`);
    await waitForPlan(page);
    expect(await horizontalOverflow(page), "horizontal overflow at 375px").toBeLessThanOrEqual(0);

    const views = page.locator("#mviews");
    await views.scrollIntoViewIfNeeded();
    await expect(views).toBeVisible();

    // Plan is the first view: the drawing, full width.
    await expect(page.locator(".mview[data-mview=plan]")).toHaveAttribute("aria-pressed", "true");
    await page.locator("main").scrollIntoViewIfNeeded();
    await expect(page.locator(".pz-stage svg")).toBeInViewport();
    await expect(page.locator("#editor")).toBeHidden();

    // Code: the editor, and it takes typing.
    await page.locator(".mview[data-mview=code]").tap();
    await expect(page.locator(".cm-content")).toBeInViewport();
    await expect(page.locator(".pz-viewport")).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Problems: the diagnostics list, counted on its button, scrollable to its last line.
    await expect(page.locator("#mviewCount")).toHaveText("1");
    await page.locator(".mview[data-mview=problems]").tap();
    const errors = page.locator("#errors");
    await expect(errors.locator(".diagrow").first()).toBeInViewport();
    await errors.locator(".diag-head code").first().tap();
    await expectNoClippedRow(page);
    await expectLastLineReachable(errors);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Its line:col goes to the source.
    await errors.locator(".diag-loc").first().tap();
    await expect(page.locator(".mview[data-mview=code]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-content")).toBeInViewport();
  });

  test("controls are touch-sized", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const small = await page.locator("header button, header select, .mview, .pz-toolbar button").evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length > 0)
        .filter((e) => e.getBoundingClientRect().height < 40)
        .map((e) => e.id || e.textContent?.trim() || e.className),
    );
    expect(small, "controls under 40px tall").toEqual([]);
  });

  test("a clean plan says so in the Problems view", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator(".mview[data-mview=problems]").tap();
    await expect(page.locator(".problems-empty")).toBeVisible();
    await expect(page.locator("#mviewCount")).toBeEmpty();
  });

  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`never scrolls sideways at ${width}x${height}, in any view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/${await shareHash(HILLSIDE)}`);
      await waitForPlan(page);
      for (const view of ["plan", "code", "problems"]) {
        await page.locator(`.mview[data-mview=${view}]`).tap();
        expect(await horizontalOverflow(page), `overflow in ${view} at ${width}px`).toBeLessThanOrEqual(0);
      }
      // The output pane's strip: five tabs and the storey switcher (a two-storey plan), each
      // inside the strip's content box (its side gutters kept), and the strip does not scroll
      // sideways. At 360 px the five tabs once ran 6 px into the right gutter.
      await page.locator(".mview[data-mview=plan]").tap();
      await expect(page.locator("#storeys")).toBeVisible();
      const strip = await page.locator(".pane h2:has(.tabs)").evaluate((h) => {
        const box = h.getBoundingClientRect();
        const cs = getComputedStyle(h);
        const left = box.left + Number.parseFloat(cs.paddingLeft);
        const right = box.right - Number.parseFloat(cs.paddingRight);
        return {
          scroll: h.scrollWidth - h.clientWidth,
          out: [...h.querySelectorAll<HTMLElement>(".tab, .lv-btn")]
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.left < left - 0.5 || r.right > right + 0.5;
            })
            .map((b) => b.textContent),
        };
      });
      expect(strip.scroll, `the tab strip scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
      expect(strip.out, `tabs outside the strip at ${width}px`).toEqual([]);
    });
  }

  test("the embed page fits a phone, read-only and editable", async ({ page }) => {
    for (const params of [[], ["editable=1"]]) {
      // A hash-only change does not reload the page; the embed reads its params once.
      await page.goto("about:blank");
      await page.goto(`/embed.html${await embedHash(HILLSIDE, ...params)}`);
      await waitForPlan(page);
      await expect(page.locator(".pz-stage svg")).toBeInViewport();
      expect(await horizontalOverflow(page), `embed overflow (${params.join("") || "read-only"})`).toBeLessThanOrEqual(
        0,
      );
      if (params.length) await expect(page.locator("#embedSrc")).toBeInViewport();
    }
  });
});
