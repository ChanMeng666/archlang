import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import * as core from "../../dist/index.js";
import type { buildReviewSheet as BuildReviewSheet } from "../../src/cli/review.js";
import { CHECKS_SAMPLE, SAMPLE_GROUP, sampleSource } from "../src/samples.js";
import {
  downloadFromShare,
  expectPlanNamed,
  gotoEdit,
  openShare,
  shareHash,
  waitForPlan,
  watchStatus,
} from "./fixtures.js";

/**
 * Checks (card P6): the drawing toolbar's layer toggle (PG-D3) draws the review rings `arch preview
 * --review` draws, from the same function (`buildReviewSheet`, built as `dist/cli/review.js`), and
 * lists one finding per compile or lint warning, with its fix hint. Every expectation below is
 * computed here by that function and by the core, never typed in. Untagged (no `@prod`): a deploy
 * lag on the live site is no bug.
 */

/** A deliberate, fixable plan: a 600 mm entrance door (two findings) and a store with no door. */
const CHECKS_PLAN = `plan "Checks" {
  units mm
  grid 100
  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall interior thickness 100 { (4000,0) (4000,4000) }
  room id=main at (0,0) size 4000x4000 label "Living" uses living
  room id=store at (4000,0) size 2000x4000 label "Store" uses storage
  door at (2000,4000) width 600 wall exterior hinge left swing in
  window at (0,2000) width 1500 wall exterior
}`;
/** Its fixed twin: the door widened, and a door into the store. */
const CHECKS_FIXED = CHECKS_PLAN.replace("width 600", "width 900").replace(
  "  window at",
  "  door at (4000,2000) width 900 wall interior hinge left swing in\n  window at",
);

const review = async (): Promise<typeof BuildReviewSheet> =>
  (
    (await import(new URL("../../dist/cli/review.js", import.meta.url).href)) as {
      buildReviewSheet: typeof BuildReviewSheet;
    }
  ).buildReviewSheet;

const checksBtn = (page: Page) => page.locator("#checks");
const items = (page: Page) => page.locator(".checks-list button[data-n]");
const overlay = (page: Page) => page.locator(".pz-stage svg g.pg-checks");

/** One group of the review sheet, as markup. */
function sheetGroup(svg: string, id: string): string {
  const open = `<g id="${id}">`;
  const from = svg.indexOf(open) + open.length;
  return svg.slice(from, svg.indexOf("</g>", from));
}

/** Markup re-serialised by the browser's own SVG parser, so two spellings of one tree compare equal. */
const canonical = (page: Page, markup: string) =>
  page.evaluate(
    (m) =>
      new XMLSerializer().serializeToString(
        new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${m}</svg>`, "image/svg+xml")
          .documentElement,
      ),
    markup,
  );

async function download(page: Page, format: string): Promise<Buffer> {
  const d = await downloadFromShare(page, format);
  return (await import("node:fs/promises")).readFile((await d.path())!);
}

async function copySvg(page: Page): Promise<string> {
  const status = await watchStatus(page);
  await openShare(page);
  await page.locator("#copySvg").click();
  await status.expectFlash("SVG copied");
  return page.evaluate(() => navigator.clipboard.readText());
}

async function turnOn(page: Page) {
  await checksBtn(page).click();
  await expect(checksBtn(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".checks")).toBeVisible();
}

test.describe("checks", () => {
  test("off by default, a layer toggle on the drawing's toolbar beside Paths, and not remembered", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(checksBtn(page)).toBeVisible();
    // On the stage's floating toolbar (ruling PG-D3), next to Paths; no longer in the header.
    await expect(page.locator(".pz-toolbar #checks")).toHaveCount(1);
    await expect(page.locator("header #checks")).toHaveCount(0);
    expect(await checksBtn(page).evaluate((b) => (b.nextElementSibling as HTMLElement | null)?.dataset.pz)).toBe(
      "paths",
    );
    await expect(checksBtn(page)).toHaveAttribute("aria-pressed", "false");
    await expect(overlay(page)).toHaveCount(0);
    await turnOn(page);
    // The default plan is clean: nothing to ring, and the rules read are named.
    await expect(page.locator(".checks-head")).toHaveText("Checks (default checks): nothing to ring");
    await page.reload();
    await waitForPlan(page);
    await expect(checksBtn(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".checks")).toHaveCount(0);
  });

  test("a clean plan points at the sample with one thing to fix, which the gallery offers", async ({ page }) => {
    const sheet = (await review())(sampleSource(CHECKS_SAMPLE)!);
    if ("kind" in sheet) throw new Error(sheet.kind);
    expect(sheet.marks).toHaveLength(1);
    await page.goto("/");
    await waitForPlan(page);
    // The gallery lists it under its own group, the last, after the examples; as a button, since
    // it has no static page, so no crawlable link points at it.
    const sampleGroup = page.locator("#gallery .gal-group").last();
    await expect(sampleGroup).toHaveAttribute("data-group", SAMPLE_GROUP);
    await expect(sampleGroup).toHaveAttribute("data-sample", "");
    await expect(sampleGroup.locator(".gal-card")).toHaveCount(1);
    await expect(sampleGroup.locator("button.gal-card")).toHaveAttribute("data-label", CHECKS_SAMPLE);
    await expect(page.locator(`#gallery a.gal-card[data-label="${CHECKS_SAMPLE}"]`)).toHaveCount(0);
    await turnOn(page);
    await page.getByRole("button", { name: `Try “${CHECKS_SAMPLE}” →` }).click();
    await expectPlanNamed(page, CHECKS_SAMPLE);
    // Exactly the one finding the review sheet makes of it, ringed, with its hint.
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).locator("code")).toHaveText(sheet.marks[0]!.code);
    await expect(items(page).locator(".checks-fix")).toHaveText(/^Fix: .*window/);
    const shown = await page.locator(".pz-stage svg g.pg-checks-rings").innerHTML();
    expect(await canonical(page, shown)).toBe(await canonical(page, sheetGroup(sheet.svg, "rv-rings")));
  });

  test("the rings are the review sheet's, one finding per compile or lint warning", async ({ page }) => {
    const buildReviewSheet = await review();
    const sheet = buildReviewSheet(CHECKS_PLAN);
    if ("kind" in sheet) throw new Error(`the fixture has no review sheet: ${sheet.kind}`);
    const warnings = [...(core.compile(CHECKS_PLAN).diagnostics ?? []), ...core.lint(CHECKS_PLAN)].filter(
      (d) => d.severity === "warning",
    );
    // One finding per warning, and the fixture really has some, of both kinds of ring.
    expect(sheet.marks).toHaveLength(warnings.length);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(sheet.marks.map((m) => m.code).sort()).toEqual(warnings.map((d) => d.code).sort());

    await page.goto(`/${await shareHash(CHECKS_PLAN)}`);
    await waitForPlan(page);
    await turnOn(page);
    await expect(items(page)).toHaveCount(sheet.marks.length);
    for (const [i, m] of sheet.marks.entries()) {
      const item = items(page).nth(i);
      await expect(item).toHaveAttribute("data-n", String(m.n));
      await expect(item.locator("code")).toHaveText(m.code);
      await expect(item).toContainText(m.message);
      // The fix hint the diagnostic carries: its first hint, else its code's catalogued fix.
      const d = warnings.find((w) => w.code === m.code && w.message === m.message)!;
      const j = core.diagnosticToJson(CHECKS_PLAN, d);
      const fix = j.hints?.[0] ?? j.fix;
      if (fix) await expect(item.locator(".checks-fix").first()).toHaveText(`Fix: ${fix}`);
    }
    // The rings and their numbered tags on screen are the sheet's own groups, element for element.
    const shown = await page.evaluate(() => ({
      rings: document.querySelector(".pz-stage svg g.pg-checks-rings")!.innerHTML,
      tags: document.querySelector(".pz-stage svg g.pg-checks-tags")!.innerHTML,
    }));
    expect(await canonical(page, shown.rings)).toBe(await canonical(page, sheetGroup(sheet.svg, "rv-rings")));
    expect(await canonical(page, shown.tags)).toBe(await canonical(page, sheetGroup(sheet.svg, "rv-tags")));
    // One tag badge per ringed finding: each finding on the list is numbered on the drawing.
    const ringedMarks = sheet.marks.reduce((k, m) => k + m.ringed.length, 0);
    await expect(page.locator(".pz-stage svg g.pg-checks-tags circle")).toHaveCount(ringedMarks);

    // Its fixed twin clears: no finding, no ring.
    await page.goto("about:blank");
    await page.goto(`/${await shareHash(CHECKS_FIXED)}`);
    await waitForPlan(page);
    await turnOn(page);
    await expect(page.locator(".checks-head")).toHaveText("Checks (default checks): nothing to ring");
    await expect(page.locator(".pz-stage svg g.pg-checks-rings > *")).toHaveCount(0);
  });

  test("toggling Checks changes the drawing on screen, never an export", async ({ page }) => {
    // jsPDF stamps the time and a random file id; the clock is fixed and the id masked.
    await page.clock.setFixedTime(new Date("2026-01-01T00:00:00Z"));
    await page.goto(`/${await shareHash(CHECKS_PLAN)}`);
    await waitForPlan(page);
    const pdfBody = (b: Buffer) => b.toString("latin1").replace(/\/ID \[[^\]]*\]/, "/ID []");
    const before = {
      svg: await copySvg(page),
      dxf: await download(page, "dxf"),
      png: await download(page, "png"),
      pdf: pdfBody(await download(page, "pdf")),
    };
    const displayed = await page.locator(".pz-stage svg").innerHTML();
    await turnOn(page);
    await expect(overlay(page)).toHaveCount(1);
    expect(await page.locator(".pz-stage svg").innerHTML()).not.toBe(displayed);
    expect(await copySvg(page)).toBe(before.svg);
    expect((await download(page, "dxf")).equals(before.dxf), "DXF").toBe(true);
    expect((await download(page, "png")).equals(before.png), "PNG").toBe(true);
    expect(pdfBody(await download(page, "pdf"))).toBe(before.pdf);
    // And off again: the overlay is gone.
    await checksBtn(page).click();
    await expect(checksBtn(page)).toHaveAttribute("aria-pressed", "false");
    await expect(overlay(page)).toHaveCount(0);
    await expect(page.locator(".checks")).toBeHidden();
  });

  test("the list is keyboard reachable; a finding highlights its ring, and in edit mode its statement", async ({
    page,
  }) => {
    const sheet = (await review())(CHECKS_PLAN);
    if ("kind" in sheet) throw new Error(sheet.kind);
    await page.goto(`/${await shareHash(CHECKS_PLAN)}`);
    await waitForPlan(page);
    await turnOn(page);
    // From the toggle, Tab reaches the list.
    await checksBtn(page).focus();
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => !!document.activeElement?.closest(".checks-list"));
    }
    expect(reached, "Tab never reached the Checks list").toBe(true);
    await page.keyboard.press("Enter");
    const chosen = page.locator(".checks-list button[aria-current='true']");
    await expect(chosen).toHaveCount(1);
    const n = Number(await chosen.getAttribute("data-n"));
    const mark = sheet.marks.find((m) => m.n === n)!;
    await expect(page.locator(".pz-stage svg g.pg-checks-hl rect")).toHaveCount(mark.ringed.length);
    // Enter again lets it go.
    await page.keyboard.press("Enter");
    await expect(chosen).toHaveCount(0);
    await expect(page.locator(".pz-stage svg g.pg-checks-hl rect")).toHaveCount(0);

    // In edit mode the list is the Checks tab's first section, listed whether or not the rings are
    // drawn, and a finding puts the caret on its statement.
    await page.goto("about:blank");
    await gotoEdit(page, await shareHash(CHECKS_PLAN));
    await page.locator("#tab-checks").click();
    await expect(page.locator("#checksView .checks")).toBeVisible();
    await expect(page.locator("#checksView .checks-list button[data-n]")).toHaveCount(sheet.marks.length);
    await expect(checksBtn(page)).toHaveAttribute("aria-pressed", "false");
    await expect(overlay(page)).toHaveCount(0);
    const door = sheet.marks.find((m) => m.code === "W_DOOR_CLEARANCE")!;
    await items(page)
      .filter({ has: page.locator("code", { hasText: door.code }) })
      .click();
    const line = CHECKS_PLAN.slice(0, door.span![0]).split("\n").length;
    await expect(page.locator(".cm-activeLine")).toHaveText(CHECKS_PLAN.split("\n")[line - 1]!);
  });

  test("in edit mode the toggle rings the drawing, and its list stays in the Checks tab", async ({ page }) => {
    const sheet = (await review())(CHECKS_PLAN);
    if ("kind" in sheet) throw new Error(sheet.kind);
    await gotoEdit(page, await shareHash(CHECKS_PLAN));
    await checksBtn(page).click();
    await expect(checksBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(overlay(page)).toHaveCount(1);
    // No list floating over the drawing in edit mode: it is the Checks tab's.
    await expect(page.locator(".pz-viewport .checks")).toHaveCount(0);
    await page.locator("#tab-checks").click();
    await expect(page.locator("#checksView .checks-list button[data-n]")).toHaveCount(sheet.marks.length);
    // Back to view mode: the list floats over the drawing again, beside the rings.
    await page.locator("#tab-preview").click();
    await page.locator("#sourceToggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator(".pz-viewport .checks")).toBeVisible();
    await expect(overlay(page)).toHaveCount(1);
  });
});
