import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { BROKEN_PLAN, embedHash, gotoEdit, setEditorSource, shareHash, waitFor3d, waitForPlan } from "./fixtures.js";

/** Townhouse, the three-storey example: the widest storey chip (L1 L2 L3) on the stage. */
const TOWNHOUSE = readFileSync(new URL("../../examples/townhouse.arch", import.meta.url), "utf8").replace(
  /\r\n?/g,
  "\n",
);

type Box = { x: number; y: number; width: number; height: number };
/** Whether two boxes share any area (touching edges do not count). */
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/**
 * The layout: every part of the workspace is REACHABLE, at desktop size and on a phone.
 *
 * The diagnostics drawer is the case that broke on desktop: its rows are flex items of a
 * scrolling column, and with `overflow: hidden` a row's automatic minimum height is 0 —
 * so a long diagnostic (hillside-villa's W_DRAWING_OVERFLOW) was squeezed to the drawer's
 * height and clipped, leaving the drawer nothing to scroll. The phone layout is the
 * other: three panes and a wrapping header (then, an intro band too) stacked into 812px left each a
 * sliver, so below 900px the workspace shows one view at a time (Code / Plan / 3D / Facts / Checks).
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

/**
 * The page's heading is the header's brand, one row with the header's controls, and nothing sits
 * between the header and the workspace (ruling PG-D6: the intro band is gone).
 */
async function expectOneRowHeaderNoBand(page: Page): Promise<void> {
  const { h1, header, main } = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    return { h1: r("header > h1"), header: r("header"), main: r("main") };
  });
  expect(h1.top, "the H1 is in the header").toBeGreaterThanOrEqual(header.top);
  expect(h1.bottom).toBeLessThanOrEqual(header.bottom);
  expect(header.height, "one row tall").toBeLessThanOrEqual(48);
  await expect(page.locator(".intro")).toHaveCount(0);
  // In edit mode the workspace starts right under the header.
  expect(Math.abs(main.top - header.bottom), "no band between the header and the workspace").toBeLessThanOrEqual(1);
}

test.describe("diagnostics drawer (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // The drawer is the editor pane's, so these open in edit mode.
  test("scrolls within its box under the one-row header, and its last line can be reached", async ({ page }) => {
    await gotoEdit(page, await shareHash(HILLSIDE));
    await expectOneRowHeaderNoBand(page);
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

  test("stays scrollable with many diagnostics", async ({ page }) => {
    // Eight rooms stacked on one spot: a W_ROOM_OVERLAP per pair, 28 rows.
    const rooms = Array.from({ length: 8 }, (_, i) => `  room id=r${i} at (0,0) size 3000x3000 label "R${i}"\n`);
    const many = `plan "E2E" {\n  units mm\n  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n${rooms.join("")}}`;
    await gotoEdit(page, await shareHash(many));
    await expectOneRowHeaderNoBand(page);
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

  test("view mode: the drawing fills the screen, and Source is the second screen", async ({ page }) => {
    await page.goto(`/${await shareHash(HILLSIDE)}`);
    await waitForPlan(page);
    expect(await horizontalOverflow(page), "horizontal overflow at 375px").toBeLessThanOrEqual(0);
    // No Code · Plan · 3D · Facts · Checks switcher in view mode: the drawing alone, full width.
    await expect(page.locator("#mviews")).toBeHidden();
    await expect(page.locator("#editor")).toBeHidden();
    await page.locator("main").scrollIntoViewIfNeeded();
    await expect(page.locator(".pz-stage svg")).toBeInViewport();
    const viewport = (await page.locator(".pz-viewport").boundingBox())!;
    expect(viewport.width, "the drawing is full width").toBeGreaterThanOrEqual(375 - 1);
    // Make your own is on screen with it.
    await expect(page.locator("#makeOwn")).toBeVisible();

    // Source: the code, full width, the drawing one tap away.
    await page.locator("#sourceToggle").tap();
    await expect(page.locator(".mview[data-mview=code]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-content")).toBeInViewport();
    await expect(page.locator(".pz-viewport")).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.locator(".mview[data-mview=plan]").tap();
    await expect(page.locator(".pz-stage svg")).toBeInViewport();
  });

  // In edit mode (`&edit`), as before the view-mode default.
  test("never scrolls sideways, and the editor, the plan and the checks are each reachable", async ({ page }) => {
    await page.goto(`/${await shareHash(HILLSIDE)}&edit`);
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

    // Checks: the diagnostics list, counted on its button, scrollable to its last line, over
    // the Checks tab's content (ruling PG-D3), with no tab row at all (card PG5b ①).
    await expect(page.locator("#mviewCount")).toHaveText("1");
    await page.locator(".mview[data-mview=checks]").tap();
    const errors = page.locator("#errors");
    await expect(errors.locator(".diagrow").first()).toBeInViewport();
    await expect(page.locator("#tab-checks")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#checksView")).toBeVisible();
    await expect(page.locator("#lintOutput")).toBeVisible();
    await expect(page.locator(".out-tabs")).toBeHidden();
    await errors.locator(".diag-head code").first().tap();
    await expectNoClippedRow(page);
    await expectLastLineReachable(errors);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // Its line:col goes to the source.
    await errors.locator(".diag-loc").first().tap();
    await expect(page.locator(".mview[data-mview=code]")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-content")).toBeInViewport();
  });

  // Card PG5b ⑦: every visible control at least 44 × 44 px, wide as well as tall — the header's
  // buttons and its <summary> triggers (the gallery, Share, ⋯) and the items of the open Share and ⋯
  // menus, the stage's switch, storeys, toolbar and knobs heading, the drawing's findings list, the
  // status's dismiss button, the phone's view switcher, and every control of edit mode's Plan, 3D,
  // Facts and Checks views — on a three-storey plan with knobs. Inline text links and the a11y
  // checkbox (its label is the target) are not measured; neither is the Intent text box.
  test("controls are touch-sized: 44 × 44 at least", async ({ page }) => {
    const CONTROLS = [
      "header button, header select, header summary, .mview, .stage-switch button, .lv-btn, .pz-toolbar button",
      "#preview3d button, .knobs-head, #statusDismiss, .checks button",
      ".tools-panel button, .tools-panel select, .tools-panel .tb-check, .tools-panel a",
      ":is(#factsView, #checksView) :is(button, select, summary, input:not([type=checkbox]))",
      "#errors button",
    ].join(", ");
    const tooSmall = () =>
      page.locator(CONTROLS).evaluateAll((els) =>
        els
          .filter((e) => e.getClientRects().length > 0)
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.height < 44 - 0.5 || r.width < 44 - 0.5;
          })
          .map((e) => {
            const r = e.getBoundingClientRect();
            return `${e.id || e.textContent?.trim() || e.className} ${Math.round(r.width)}×${Math.round(r.height)}`;
          }),
      );
    await page.goto(`/${await shareHash(TOWNHOUSE)}`);
    await waitForPlan(page);
    await expect(page.locator("header summary")).toHaveCount(3);
    await expect(page.locator(".lv-btn")).toHaveCount(3);
    await expect(page.locator(".pz-viewport .knobs-head")).toBeVisible();
    expect(await tooSmall(), "view mode, the drawing").toEqual([]);
    // The drawing's findings list (the Checks layer on).
    await page.locator("#checks").tap();
    await expect(page.locator(".checks button").first()).toBeVisible();
    expect(await tooSmall(), "view mode, the findings list").toEqual([]);
    await page.locator("#checks").tap();
    // Each header menu open: its items.
    for (const id of ["#share", "#more"]) {
      await page.locator(`${id} > summary`).tap();
      await expect(page.locator(`${id} .tools-panel`)).toBeVisible();
      expect(await tooSmall(), `view mode, ${id} open`).toEqual([]);
      await page.locator(`${id} > summary`).tap();
      await expect(page.locator(`${id} .tools-panel`)).toBeHidden();
    }
    await page.locator("#view3d").tap();
    await expect(page.locator("#preview3d canvas")).toBeVisible();
    expect(await tooSmall(), "view mode, the 3D preview").toEqual([]);

    // A broken plan: the status notice and its dismiss button.
    await page.goto("about:blank");
    await page.goto(`/${await shareHash(BROKEN_PLAN)}`);
    await expect(page.locator("html[data-booting]")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("#statusDismiss")).toBeVisible();
    expect(await tooSmall(), "view mode, the status").toEqual([]);

    // Edit mode: every view, with a diagnostic so the Checks view has its rows and Apply fix.
    await page.goto("about:blank");
    await page.goto(`/${await shareHash(HILLSIDE)}&edit`);
    await waitForPlan(page);
    await expect(page.locator(".mview")).toHaveCount(5);
    for (const view of ["plan", "3d", "facts", "checks"]) {
      await page.locator(`.mview[data-mview="${view}"]`).tap();
      if (view === "facts") await expect(page.locator("#takeoffCopy")).toBeVisible();
      if (view === "checks") await expect(page.locator("#errors .diagrow").first()).toBeVisible();
      if (view === "3d") await expect(page.locator("#preview3d canvas")).toBeVisible();
      expect(await tooSmall(), `edit mode, ${view}`).toEqual([]);
    }
  });

  // Card PG5b: the knobs sheet opened on a phone covers the stage's foot; the toolbar rides above it
  // and stays usable.
  test("the stage toolbar stays clear of the open knobs sheet at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${await shareHash(TOWNHOUSE)}`);
    await waitForPlan(page);
    const knobs = page.locator(".pz-viewport > .knobs");
    await page.locator(".pz-viewport .knobs-head").tap();
    await expect(knobs).toHaveAttribute("open", "");
    await expect(page.locator(".pz-viewport .knob").first()).toBeVisible();
    const [sheet, bar] = [(await knobs.boundingBox())!, (await page.locator(".pz-toolbar").boundingBox())!];
    expect(overlaps(sheet, bar), "the toolbar is clear of the open sheet").toBe(false);
    // Usable: what is under each button's centre is that button (the page scrolls past the header
    // on a phone, so bring the toolbar on screen first).
    await page.locator(".pz-toolbar").scrollIntoViewIfNeeded();
    const covered = await page.locator(".pz-toolbar > button").evaluateAll((bs) =>
      bs
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== b;
        })
        .map((b) => b.textContent),
    );
    expect(covered, "toolbar buttons covered").toEqual([]);
    const zoom = page.locator('.pz-toolbar [data-pz="in"]');
    await zoom.tap();
    await expect(knobs).toHaveAttribute("open", "");
  });

  test("a clean plan says so in the Checks view", async ({ page }) => {
    await page.goto("/#edit");
    await waitForPlan(page);
    await page.locator(".mview[data-mview=checks]").tap();
    await expect(page.locator(".problems-empty")).toBeVisible();
    await expect(page.locator("#mviewCount")).toBeEmpty();
    // …and the Checks view shows the Checks tab's content: the review findings and Lint's clean verdict.
    await expect(page.locator("#checksView .checks-head")).toHaveText("Checks (default checks): nothing to ring");
    await expect(page.locator("#lintOutput .ok")).toBeVisible();
    // Back on Plan: the drawing, not the Checks tab.
    await page.locator(".mview[data-mview=plan]").tap();
    await expect(page.locator("#tab-preview")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".pz-stage svg")).toBeVisible();
  });

  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`never scrolls sideways at ${width}x${height}, in any view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(`/${await shareHash(HILLSIDE)}&edit`);
      await waitForPlan(page);
      for (const view of ["plan", "3d", "facts", "code", "checks"]) {
        await page.locator(`.mview[data-mview="${view}"]`).tap();
        expect(await horizontalOverflow(page), `overflow in ${view} at ${width}px`).toBeLessThanOrEqual(0);
      }
      // The phone's one view control (card PG5b ①): the five views, each inside the switcher's
      // content box (its side gutters kept), and it does not scroll sideways. (At 360 px the tab
      // row it replaces once ran 6 px into the right gutter; that row is not drawn here at all.)
      // The storey switcher (a two-storey plan) is on the stage, inside it.
      await page.locator(".mview[data-mview=plan]").tap();
      await expect(page.locator(".out-tabs")).toBeHidden();
      await expect(page.locator(".mview")).toHaveText(["Code", "Plan", "3D", "Facts", /^Checks/]);
      const strip = await page.locator("#mviews").evaluate((h) => {
        const box = h.getBoundingClientRect();
        const cs = getComputedStyle(h);
        const left = box.left + Number.parseFloat(cs.paddingLeft);
        const right = box.right - Number.parseFloat(cs.paddingRight);
        return {
          scroll: h.scrollWidth - h.clientWidth,
          out: [...h.querySelectorAll<HTMLElement>(".mview")]
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.left < left - 0.5 || r.right > right + 0.5;
            })
            .map((b) => b.textContent),
        };
      });
      expect(strip.scroll, `the view switcher scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
      expect(strip.out, `views outside the switcher at ${width}px`).toEqual([]);
      await expect(page.locator("#storeys")).toBeVisible();
      const [g, stage] = await Promise.all([
        page.locator("#storeys").boundingBox(),
        page.locator(".pz-viewport").boundingBox(),
      ]);
      expect(g!.x, `storeys inside the stage at ${width}px`).toBeGreaterThanOrEqual(stage!.x);
      expect(g!.x + g!.width, `storeys inside the stage at ${width}px`).toBeLessThanOrEqual(stage!.x + stage!.width);
    });
  }

  // Card PG5b ③: on a three-storey plan the storey chip shares no pixel with the stage's toolbar
  // (whole boxes, not only their left and right edges), nor with the Plan | 3D switch, in view mode
  // and in edit mode, over the drawing and over the 3D preview.
  for (const [width, height] of [
    [360, 780],
    [390, 844],
  ] as const) {
    test(`the storey chip overlaps no stage control at ${width}x${height}, in either mode`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const mode of ["view", "edit"] as const) {
        await page.goto("about:blank");
        await page.goto(`/${await shareHash(TOWNHOUSE)}${mode === "edit" ? "&edit" : ""}`);
        await waitForPlan(page);
        if (mode === "edit") await page.locator(".mview[data-mview=plan]").tap();
        await expect(page.locator("#storeys .lv-btn")).toHaveCount(3);
        const visibleBox = async (sel: string) => {
          const l = page.locator(sel);
          return (await l.isVisible()) ? l.boundingBox() : null;
        };
        const check = async (where: string, others: string[]) => {
          const chip = (await page.locator("#storeys").boundingBox())!;
          expect(chip, `the storey chip is on screen (${where})`).toBeTruthy();
          for (const sel of others) {
            const box = await visibleBox(sel);
            if (box) expect(overlaps(chip, box), `${sel} overlaps the storeys (${where}, ${width}px)`).toBe(false);
          }
        };
        await expect(page.locator(".pz-toolbar")).toBeVisible();
        await check(`${mode} mode, drawing`, [".pz-toolbar", ".stage-switch", ".pz-viewport > .knobs"]);
        // Every toolbar control on one row, and the whole toolbar inside the stage.
        const tools = await page
          .locator(".pz-toolbar > button")
          .evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().top));
        expect(new Set(tools.map(Math.round)).size, "the toolbar is one row").toBe(1);
        const [bar, stage] = [
          (await page.locator(".pz-toolbar").boundingBox())!,
          (await page.locator(".pz-viewport").boundingBox())!,
        ];
        expect(bar.x).toBeGreaterThanOrEqual(stage.x);
        expect(bar.x + bar.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
        expect(bar.y + bar.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
        // The 3D preview: the storeys over its canvas, clear of its own top-right group.
        if (mode === "edit") await page.locator('.mview[data-mview="3d"]').tap();
        else await page.locator("#view3d").tap();
        await expect(page.locator("#preview3d .p3d-top")).toBeVisible();
        // Over the 3D preview the chip is at its widest: All, L1, L2, L3.
        await expect(page.locator("#storeys .lv-btn")).toHaveText(["All", "L1", "L2", "L3"]);
        await check(`${mode} mode, 3D`, ["#preview3d .p3d-top", ".stage-switch", "#preview3d .p3d-stage > .knobs"]);
      }
    });
  }

  // Card PG5b ②: the status's live region is drawn in every layout, so an error typed in the
  // phone's Code view (where the stage, and its notice, are not drawn) is still announced.
  test("the status's live region is never display:none, and speaks in the phone's Code view", async ({ page }) => {
    await page.goto("/#edit");
    await waitForPlan(page);
    await page.locator(".mview[data-mview=code]").tap();
    await expect(page.locator(".pz-viewport")).toBeHidden();
    const live = page.locator("#statusLive");
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    const rendered = () =>
      live.evaluate((el) => {
        for (let n: Element | null = el; n; n = n.parentElement)
          if (getComputedStyle(n).display === "none") return `display:none at ${n.tagName}#${n.id}`;
        return el.getClientRects().length > 0 ? "rendered" : "no box";
      });
    expect(await rendered()).toBe("rendered");
    await setEditorSource(page, BROKEN_PLAN);
    await expect(live).toHaveText(/^\d+ errors?$/);
    expect(await rendered(), "still drawn while it speaks").toBe("rendered");
    // It mirrors the stage's notice word for word.
    await expect(page.locator("#statusText")).toHaveText((await live.textContent()) ?? "");
  });

  // Card PG5b ①: at phone width each function has one control. Edit mode: the switcher's five
  // views and no tab row, so one Plan, one 3D, one way into Checks (the stage's Checks LAYER is
  // the rings, another function); view mode: the stage's Plan | 3D switch alone.
  test("exactly one visible Plan and one 3D control per mode at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const visible = (sel: string) =>
      page
        .locator(sel)
        .evaluateAll((els) =>
          els.filter((e) => (e as HTMLElement).getClientRects().length > 0).map((e) => e.textContent?.trim() ?? ""),
        );
    await page.goto("/");
    await waitForPlan(page);
    expect((await visible("button")).filter((t) => t === "Plan" || t === "3D")).toEqual(["Plan", "3D"]);
    await expect(page.locator(".stage-switch")).toBeVisible();
    await page.goto("about:blank");
    await page.goto("/#edit");
    await waitForPlan(page);
    await expect(page.locator(".tab:visible")).toHaveCount(0);
    await expect(page.locator(".stage-switch")).toBeHidden();
    expect((await visible("button")).filter((t) => t === "Plan" || t === "3D")).toEqual(["Plan", "3D"]);
    expect(await visible(".mview")).toEqual(["Code", "Plan", "3D", "Facts", "Checks"]);
    expect(await visible('[role="tab"], .mview'), "one control per view").toEqual([
      "Code",
      "Plan",
      "3D",
      "Facts",
      "Checks",
    ]);
    // Each view opens its tab, and the switcher follows a tab opened another way.
    for (const [view, tab] of [
      ["3d", "preview3d"],
      ["facts", "facts"],
      ["checks", "checks"],
      ["plan", "preview"],
    ] as const) {
      await page.locator(`.mview[data-mview="${view}"]`).tap();
      await expect(page.locator(`#tab-${tab}`)).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(`.mview[data-mview="${view}"]`)).toHaveAttribute("aria-pressed", "true");
    }
  });

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

/**
 * Card PG4 on a phone (390×844): the header never scrolls sideways (the brand shrinks to the mark
 * and its stamp, the h1 keeping its whole text), its four controls share one row, and the stage
 * toolbar, with no copy buttons on it any more, is one row too. Share opens inside the screen.
 */
test.describe("phone header and stage toolbar (card PG4)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /** The boxes' tops: one row when every box starts above the first one's bottom edge. */
  const oneRow = (boxes: { top: number; bottom: number }[]) => boxes.every((b) => b.top < boxes[0]!.bottom - 1);

  test("the header does not scroll sideways, and its controls and the stage toolbar are one row each", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForPlan(page);
    const m = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      const header = document.querySelector("header")!;
      const controls = ["#sourceToggle", "#share", "#more", "#makeOwn"].map((s) => box(document.querySelector(s)!));
      const tools = [...document.querySelectorAll(".pz-toolbar > *")]
        .filter((e) => e.getClientRects().length > 0)
        .map(box);
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        header: header.scrollWidth - header.clientWidth,
        controls,
        tools,
        h1: box(document.querySelector("header > h1")!),
      };
    });
    expect(m.page, "no sideways scroll at 390px").toBeLessThanOrEqual(0);
    expect(m.header, "the header does not overflow").toBeLessThanOrEqual(0);
    expect(oneRow(m.controls), "Source, Share, ⋯ and Make your own on one row").toBe(true);
    for (const c of m.controls) expect(c.right, "inside the screen").toBeLessThanOrEqual(390);
    expect(m.tools.length, "− + ⤢ ⛶ | Checks Paths").toBe(7);
    expect(oneRow(m.tools), "the stage toolbar is one row").toBe(true);
    expect(m.h1.right).toBeLessThanOrEqual(390);
    // The h1 keeps its whole text; only its drawing shrinks.
    await expect(page.locator("h1")).toHaveAccessibleName("ArchLang Playground");
    await expect(page.locator("h1 .badge")).toBeVisible();

    // Share opens inside the screen, its panel no wider than it.
    await page.locator("#share > summary").tap();
    const panel = (await page.locator("#share .tools-panel").boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});

/**
 * Card MP1 (ruling MP-D1): the phone page is ONE screen. The drawing and the 3D canvas take every
 * touch for pan and orbit, so a page that scrolled under them could not be scrolled back: the
 * header, the stage toolbar and the facts row with the lede must all be in the window on first
 * paint, in view mode and in edit mode (each of the phone's views), and the page itself must not
 * scroll. The header is at most two rows (≤ 100 px), one row on a phone on its side (≤ 60 px).
 */
test.describe("the phone page is one screen (card MP1)", () => {
  for (const [width, height] of [
    [320, 568],
    [360, 780],
    [390, 844],
    [844, 390],
  ] as const) {
    test.describe(`at ${width}x${height}`, () => {
      test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

      const measure = (page: Page) =>
        page.evaluate(() => {
          const bottom = (s: string) => {
            const el = document.querySelector(s);
            return el && el.getClientRects().length > 0 ? el.getBoundingClientRect().bottom : null;
          };
          return {
            inner: window.innerHeight,
            scroll: document.scrollingElement!.scrollHeight,
            header: document.querySelector("header")!.getBoundingClientRect().height,
            toolbar: bottom(".pz-toolbar"),
            facts: bottom("#factsRow"),
            lede: bottom("#lede"),
          };
        });

      for (const mode of ["view", "edit"] as const) {
        test(`${mode} mode: the toolbar and the facts row are on the first screen, and the page does not scroll`, async ({
          page,
        }) => {
          await page.goto(mode === "edit" ? "/#edit" : "/");
          await waitForPlan(page);
          if (mode === "edit")
            await expect(page.locator('.mview[data-mview="plan"]')).toHaveAttribute("aria-pressed", "true");
          const m = await measure(page);
          const headerMax = height < 500 ? 60 : 100;
          expect(m.header, `header height (${height < 500 ? "one row" : "two rows at most"})`).toBeLessThanOrEqual(
            headerMax,
          );
          expect(m.toolbar, "the stage toolbar is drawn").not.toBeNull();
          expect(m.toolbar!, "the stage toolbar's bottom is inside the window").toBeLessThanOrEqual(m.inner);
          expect(m.facts, "the facts row is drawn").not.toBeNull();
          expect(m.facts!, "the facts row's bottom is inside the window").toBeLessThanOrEqual(m.inner);
          expect(m.lede, "the lede is drawn").not.toBeNull();
          expect(m.lede!, "the lede's bottom is inside the window").toBeLessThanOrEqual(m.inner);
          expect(m.scroll, "the page itself does not scroll").toBeLessThanOrEqual(m.inner + 1);
          await expect(page.locator("#makeOwn")).toBeInViewport();
          if (mode === "edit") {
            // Every view of the phone's switcher: still one screen, the switcher on it.
            for (const view of ["code", "3d", "facts", "checks", "plan"]) {
              await page.locator(`.mview[data-mview="${view}"]`).tap();
              await expect(page.locator(`.mview[data-mview="${view}"]`)).toHaveAttribute("aria-pressed", "true");
              const v = await measure(page);
              expect(v.scroll, `the page does not scroll in the ${view} view`).toBeLessThanOrEqual(v.inner + 1);
              await expect(page.locator("#mviews")).toBeInViewport({ ratio: 1 });
            }
          } else {
            // The 3D preview, the stage's other view: the facts row stays on screen under it.
            await page.locator("#view3d").tap();
            await expect(page.locator("#preview3d canvas")).toBeVisible();
            const v = await measure(page);
            expect(v.facts!, "the facts row under the 3D preview is inside the window").toBeLessThanOrEqual(v.inner);
            expect(v.scroll, "the page does not scroll over the 3D preview").toBeLessThanOrEqual(v.inner + 1);
          }
        });
      }
    });
  }

  // Ruling MP-D2: text a phone shows is 12 px at least, and a field is 16 px at least (under 16 px
  // iOS zooms the page when it takes focus). SVG text is the drawing's, scaled with it: not counted.
  // On the narrowest phone too, and with each header menu and the Make your own dialog open.
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ] as const)
    test.describe(`text and fields at ${width}x${height}`, () => {
      test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

      const tooSmall = (page: Page) =>
        page.evaluate(() => {
          const shown = (el: Element) => {
            if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === "hidden") return false;
            const r = el.getBoundingClientRect();
            return (
              r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
            );
          };
          const text = [...document.body.querySelectorAll("*")]
            .filter((el) => !el.closest("svg, .vh"))
            .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
            .filter(shown)
            .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) < 12)
            .map(
              (el) =>
                `${el.tagName.toLowerCase()}.${el.className || el.id} ${getComputedStyle(el).fontSize} "${el.textContent!.trim().slice(0, 24)}"`,
            );
          const fields = [
            ...document.querySelectorAll(
              'input:not([type="checkbox"], [type="radio"], [type="range"], [type="hidden"]), select, textarea, .cm-content',
            ),
          ]
            .filter((el) => el.getClientRects().length > 0)
            .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) < 16)
            .map((el) => `${el.id || el.className} ${getComputedStyle(el).fontSize}`);
          return { text, fields };
        });

      test("no visible text under 12 px and no field under 16 px, in view mode and in every edit view", async ({
        page,
      }) => {
        await page.goto(`/${await shareHash(TOWNHOUSE)}`);
        await waitForPlan(page);
        expect(await tooSmall(page), "view mode, the drawing").toEqual({ text: [], fields: [] });
        await page.locator("#view3d").tap();
        await expect(page.locator("#preview3d canvas")).toBeVisible();
        expect(await tooSmall(page), "view mode, the 3D preview").toEqual({ text: [], fields: [] });
        await page.locator("#viewPlan").tap();

        // Each header menu open (the gallery, Share, ⋯), then the Make your own dialog.
        for (const id of ["#gallery", "#share", "#more"]) {
          await page.locator(`${id} > summary`).tap();
          await expect(page.locator(id)).toHaveAttribute("open", "");
          if (id === "#gallery") await expect(page.locator("#galleryPanel .gal-card").first()).toBeVisible();
          expect(await tooSmall(page), `view mode, ${id} open`).toEqual({ text: [], fields: [] });
          await page.locator(`${id} > summary`).tap();
          await expect(page.locator(id)).not.toHaveAttribute("open", "");
        }
        await page.locator("#makeOwn").tap();
        await expect(page.locator("#makeOwnDialog")).toBeVisible();
        expect(await tooSmall(page), "view mode, Make your own open").toEqual({ text: [], fields: [] });
        await page.keyboard.press("Escape");
        await expect(page.locator("#makeOwnDialog")).toBeHidden();

        await page.goto("about:blank");
        await page.goto(`/${await shareHash(HILLSIDE)}&edit`);
        await waitForPlan(page);
        for (const view of ["plan", "code", "facts", "checks"]) {
          await page.locator(`.mview[data-mview="${view}"]`).tap();
          if (view === "facts") await expect(page.locator("#takeoffCopy")).toBeVisible();
          if (view === "checks") await expect(page.locator("#errors .diagrow").first()).toBeVisible();
          if (view === "code") await expect(page.locator(".cm-content")).toBeVisible();
          expect(await tooSmall(page), `edit mode, ${view}`).toEqual({ text: [], fields: [] });
        }
        // The Checks view's own fields, scrolled to: the lint profile and the intent brief.
        for (const sel of ["#lintProfile", "#intentSrc"]) {
          await page.locator(sel).scrollIntoViewIfNeeded();
          expect(await tooSmall(page), `edit mode, checks, ${sel} in view`).toEqual({ text: [], fields: [] });
        }
      });
    });
});

/**
 * Card MP1 (ruling MP-D2): a touch tablet wider than 900 px keeps the desktop layout, but every
 * visible control is still 44 × 44 px at least — the 44 px rules apply under `(pointer: coarse)`,
 * not only under the phone width. The header's triggers (the gallery, Share, ⋯), the open menus'
 * items, the stage's switch, storeys, toolbar and knobs heading, the findings list, the 3D view's
 * controls and edit mode's output tabs and panels.
 */
test.describe("a touch tablet at 1024x768 (card MP1)", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, reducedMotion: "reduce" });

  test("every visible control is touch-sized", async ({ page }) => {
    const CONTROLS = [
      "header button, header select, header summary, .stage-switch button, .lv-btn, .pz-toolbar button, .tab",
      "#preview3d button, .knobs-head, #statusDismiss, .checks button",
      ".tools-panel button, .tools-panel select, .tools-panel .tb-check, .tools-panel a",
      ":is(#factsView, #checksView) :is(button, select, summary, input:not([type=checkbox]))",
      "#errors button",
    ].join(", ");
    const tooSmall = () =>
      page.locator(CONTROLS).evaluateAll((els) =>
        els
          .filter((e) => e.getClientRects().length > 0)
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.height < 44 - 0.5 || r.width < 44 - 0.5;
          })
          .map((e) => {
            const r = e.getBoundingClientRect();
            return `${e.id || e.textContent?.trim() || e.className} ${Math.round(r.width)}×${Math.round(r.height)}`;
          }),
      );
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "a touch screen").toBe(true);
    await page.goto(`/${await shareHash(TOWNHOUSE)}`);
    await waitForPlan(page);
    await expect(page.locator("header summary")).toHaveCount(3);
    await expect(page.locator(".lv-btn")).toHaveCount(3);
    await expect(page.locator(".pz-viewport .knobs-head")).toBeVisible();
    expect(await tooSmall(), "view mode, the drawing").toEqual([]);
    await page.locator("#checks").tap();
    await expect(page.locator(".checks button").first()).toBeVisible();
    expect(await tooSmall(), "view mode, the findings list").toEqual([]);
    const [list, bar] = [
      (await page.locator(".checks").boundingBox())!,
      (await page.locator(".pz-toolbar").boundingBox())!,
    ];
    expect(overlaps(list, bar), "the findings list clears the taller toolbar").toBe(false);
    await page.locator("#checks").dispatchEvent("click");
    await expect(page.locator(".checks")).toBeHidden();
    for (const id of ["#share", "#more"]) {
      await page.locator(`${id} > summary`).tap();
      await expect(page.locator(`${id} .tools-panel`)).toBeVisible();
      expect(await tooSmall(), `view mode, ${id} open`).toEqual([]);
      await page.locator(`${id} > summary`).tap();
      await expect(page.locator(`${id} .tools-panel`)).toBeHidden();
    }
    await page.locator("#view3d").tap();
    await expect(page.locator("#preview3d canvas")).toBeVisible();
    expect(await tooSmall(), "view mode, the 3D preview").toEqual([]);
    // The 3D view's knobs start under the taller switch and storeys.
    const [chip, knobs] = [
      (await page.locator("#storeys").boundingBox())!,
      (await page.locator("#preview3d .p3d-stage > .knobs").boundingBox())!,
    ];
    expect(overlaps(chip, knobs), "the 3D knobs clear the storeys").toBe(false);

    // Edit mode: the output tabs and each tab's controls, with diagnostics in the drawer.
    await page.goto("about:blank");
    await page.goto(`/${await shareHash(HILLSIDE)}&edit`);
    await waitForPlan(page);
    await expect(page.locator(".tab")).toHaveCount(4);
    for (const tab of ["preview", "preview3d", "facts", "checks"]) {
      await page.locator(`#tab-${tab}`).tap();
      await expect(page.locator(`#tab-${tab}`)).toHaveAttribute("aria-selected", "true");
      if (tab === "facts") await expect(page.locator("#takeoffCopy")).toBeVisible();
      if (tab === "preview3d") await expect(page.locator("#preview3d canvas")).toBeVisible();
      expect(await tooSmall(), `edit mode, ${tab}`).toEqual([]);
    }
  });
});

/**
 * Card MP2 (an MP1 follow-up): a touch screen wider than 900 px keeps the desktop's centred stage
 * notice. Only the 44 px targets apply there under `(pointer: coarse)`; the phone's full-width
 * notice would lie across the findings list in the top-right corner.
 */
test.describe("the stage notice on a wide touch screen (card MP2)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true, reducedMotion: "reduce" });

  test("is centred on the stage and clear of the findings list", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "a touch screen").toBe(true);
    await page.goto(`/${await shareHash(TOWNHOUSE)}`);
    await waitForPlan(page);
    await page.locator("#checks").tap();
    await expect(page.locator(".checks button").first()).toBeVisible();
    // A flash: Share → Copy full link says so on the stage for a moment.
    await page.locator("#share > summary").tap();
    await expect(page.locator("#copyLink")).toBeEnabled();
    await page.locator("#copyLink").tap();
    const notice = page.locator(".stage-status.show");
    await expect(notice).toBeVisible();
    const m = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect().toJSON() as Box;
      const n = document.querySelector(".stage-status")!;
      return {
        n: box(".stage-status"),
        checks: box(".checks"),
        host: (n as HTMLElement).offsetParent!.getBoundingClientRect().toJSON() as Box,
      };
    });
    const centre = m.n.x + m.n.width / 2;
    expect(Math.abs(centre - (m.host.x + m.host.width / 2)), "centred on the stage").toBeLessThanOrEqual(1);
    expect(m.n.width, "a notice, not a full-width bar").toBeLessThan(m.host.width - 64);
    expect(overlaps(m.n, m.checks), "clear of the findings list").toBe(false);
  });
});

/**
 * Card PG5b ③ on the desktop stage: over the 3D preview a plan's knobs sit in the top-left corner,
 * where the storey chip is too; with a three-storey plan with knobs (Townhouse) the knobs start
 * under the chip, in view mode (under Plan | 3D) and in edit mode.
 */
test.describe("the storey chip and the 3D view's knobs (card PG5b)", () => {
  test.use({ viewport: { width: 1422, height: 676 }, reducedMotion: "reduce" });

  for (const mode of ["view", "edit"] as const) {
    test(`do not overlap in ${mode} mode`, async ({ page }) => {
      await page.goto(`/${await shareHash(TOWNHOUSE)}&3d${mode === "edit" ? "&edit" : ""}`);
      await waitFor3d(page);
      const knobs = page.locator("#preview3d .p3d-stage > .knobs");
      await expect(knobs).toBeVisible();
      await expect(page.locator("#storeys .lv-btn")).toHaveCount(4); // All, L1, L2, L3: the widest chip
      const [chip, k] = [(await page.locator("#storeys").boundingBox())!, (await knobs.boundingBox())!];
      expect(overlaps(chip, k), "the knobs start under the storey chip").toBe(false);
      if (mode === "view") {
        const sw = (await page.locator(".stage-switch").boundingBox())!;
        expect(overlaps(sw, k)).toBe(false);
      }
    });
  }
});
