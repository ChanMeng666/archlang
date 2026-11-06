import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { describe, describeLevel, takeoffCsv } from "../../src/index.js";
import { RESIZED_PLAN, SIMPLE_PLAN, setEditorSource, shareHash, waitForPlan } from "./fixtures.js";

/**
 * The takeoff (the Facts tab's second section), on the assembled page: its code arrives on the Facts tab's first open and no sooner, it shows
 * the core's `quantities` block, the waste box is the author's and starts blank, it follows a
 * recompile and the storey switcher, and its CSV is the bytes `takeoffCsv` writes. Every figure asserted
 * is read from the core here, never retyped.
 *
 * The tab is edit mode's: `open` loads the plan with `&edit`, and the first case reaches it from
 * view mode through Source, then the Facts tab.
 *
 * UNTAGGED (no `@prod`): it types, downloads and reads the clipboard.
 */

const facts = (src: string, wastePct?: number) =>
  describe(src, { facts: ["quantities"], ...(wastePct !== undefined ? { wastePct } : {}) });

const open = async (page: Page, src: string): Promise<void> => {
  await page.goto(`/${await shareHash(src)}&edit`);
  await waitForPlan(page);
  await page.locator("#tab-facts").click();
  await expect(page.locator("#takeoffOutput table").first()).toBeVisible();
};

const body = (page: Page) => page.locator("#takeoffOutput");

test.describe("Takeoff (the Facts tab)", () => {
  test("its code loads on the first open, and only once", async ({ page }) => {
    const chunks: string[] = [];
    page.on("response", (r) => {
      if (/\/assets\/takeoff-panel-[^/]+\.js$/.test(r.url())) chunks.push(r.url());
    });
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator("#takeoff")).toBeEmpty();
    expect(chunks).toEqual([]);

    // From view mode: Source opens the editor (no header menu opens a tab, ruling PG-D3), and the Facts tab
    // holds the takeoff as its second section. Opening the editor alone does not load it.
    await page.locator("#sourceToggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    await expect(page.locator(".cm-content")).toBeVisible();
    expect(chunks).toEqual([]);
    await page.locator("#tab-facts").click();
    await expect(page.locator("#factsView")).toHaveClass(/active/);
    await expect(page.locator("#factsView #takeoff")).toBeVisible();
    await expect(body(page)).toContainText("Walls by category");
    expect(chunks).toHaveLength(1);

    await page.locator("#tab-preview").click();
    await page.locator("#tab-facts").click();
    await expect(body(page)).toContainText("Walls by category");
    expect(chunks).toHaveLength(1);
  });

  test("shows the core's figures, each under its convention, and no claim", async ({ page }) => {
    await open(page, SIMPLE_PLAN);
    const q = facts(SIMPLE_PLAN).quantities!;
    const wall = q.walls[0]!;
    const room = q.rooms[0]!;
    for (const head of ["Centreline length (mm)", "Face length (mm)", "Perimeter, net (mm)", "Net area (m²)"])
      await expect(body(page)).toContainText(head);
    for (const figure of [
      wall.length_centreline_mm,
      wall.length_face_mm!,
      room.perimeter_centreline_mm,
      room.perimeter_net_mm!,
      room.area_net_m2!,
    ])
      await expect(body(page)).toContainText(String(figure));
    await expect(body(page)).toContainText("Main");
    await expect(page.locator("#takeoff")).toContainText("Check them against the drawings");
    await expect(page.locator("#takeoff")).not.toContainText(/accurate|guarantee/i);
  });

  test("the waste box starts blank, adds only what is typed, and refuses what describe would", async ({ page }) => {
    await open(page, SIMPLE_PLAN);
    const box = page.locator("#takeoffWaste");
    await expect(box).toHaveValue("");
    await expect(body(page)).not.toContainText("with waste");

    await box.fill("10");
    await expect(body(page)).toContainText("Floor area with waste (m²)");
    await expect(body(page)).toContainText(String(facts(SIMPLE_PLAN, 10).quantities!.floor_area_with_waste_m2));

    await box.fill("500");
    await expect(page.locator("#takeoffWasteNote")).toContainText("A percentage from 0 to 100");
    await expect(body(page)).not.toContainText("with waste");

    await box.fill("");
    await expect(page.locator("#takeoffWasteNote")).toContainText("Blank adds none");
    await expect(body(page)).not.toContainText("with waste");

    await box.fill("10");
    await page.reload();
    await waitForPlan(page);
    await page.locator("#tab-facts").click();
    await expect(page.locator("#takeoffWaste")).toHaveValue("");
  });

  test("follows a recompile, and says so when the plan has errors", async ({ page }) => {
    await open(page, SIMPLE_PLAN);
    await setEditorSource(page, RESIZED_PLAN);
    const wall = facts(RESIZED_PLAN).quantities!.walls[0]!;
    await expect(body(page)).toContainText(String(wall.length_centreline_mm));

    await setEditorSource(page, `plan "E2E" {\n  units mm\n  romo at (0,0) size 4000x3000\n}`);
    await expect(body(page)).toContainText("Fix the errors");
    await setEditorSource(page, SIMPLE_PLAN);
    await expect(body(page)).toContainText("Main");
  });

  test("follows the storey switcher, and the CSV holds every storey", async ({ page }, testInfo) => {
    const src = readFileSync(new URL("../../examples/hillside-villa.arch", import.meta.url), "utf8");
    await open(page, src);
    const whole = facts(src);
    const levels = whole.levels!;
    expect(levels.length).toBeGreaterThan(1);
    const [lower, upper] = [levels[0]!, levels[1]!];
    const labelsOf = (level: number) => describeLevel(whole, level).rooms.map((r) => String(r.label ?? r.id));
    const onlyUpper = labelsOf(upper.level).find((l) => !labelsOf(lower.level).includes(l))!;
    await expect(page.locator("#takeoffStorey")).toContainText(`Level ${lower.level}`);
    await expect(body(page)).not.toContainText(onlyUpper);

    await page.locator("#storeys button").nth(1).click();
    await expect(page.locator("#takeoffStorey")).toContainText(`Level ${upper.level}`);
    await expect(body(page)).toContainText(onlyUpper);

    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#takeoffDownload").click()]);
    expect(download.suggestedFilename()).toMatch(/-takeoff\.csv$/);
    const path = testInfo.outputPath("takeoff.csv");
    await download.saveAs(path);
    expect(readFileSync(path, "utf8")).toBe(takeoffCsv(whole));
  });

  test("Copy CSV writes the core's bytes, with the waste the author typed", async ({ page }) => {
    await open(page, SIMPLE_PLAN);
    await page.locator("#takeoffWaste").fill("10");
    await expect(body(page)).toContainText("with waste");
    await page.locator("#takeoffCopy").click();
    // Windows' clipboard hands text back with CRLF line ends, whatever was written.
    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"))
      .toBe(takeoffCsv(facts(SIMPLE_PLAN, 10)));
  });
});
