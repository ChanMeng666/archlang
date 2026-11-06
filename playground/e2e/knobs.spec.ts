import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { srcFromHash } from "../src/share.js";
import { AUTOSAVE_KEY, expectPlanNamed, gotoEdit, setEditorSource, shareHash, waitForPlan } from "./fixtures.js";

/**
 * Knobs (card P4): a slider per top-level numeric `let` of the plan on screen, in the drawing's
 * lower-left corner. Moving one rewrites that one literal, recompiles, and keeps the result like an
 * edit (the drawing, the facts line, the `#z=` hash); a value that does not compile snaps back and
 * leaves the last good drawing. Untagged (no `@prod`): a deploy lag on the live site is no bug.
 */

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");
const panel = (page: Page) => page.locator("details.knobs");
const knob = (page: Page, name: string) => page.locator(`details.knobs input[type="range"][data-knob="${name}"]`);
const viewBoxWidth = (page: Page) =>
  page.locator(".pz-stage svg").evaluate((svg) => Number(svg.getAttribute("viewBox")?.split(/\s+/)[2]));
/** The page's `#z=` hash, decoded by the playground's own codec. */
const hashSource = async (page: Page) => srcFromHash(await page.evaluate(() => location.hash));

test.describe("knobs", () => {
  test("absent for a plan without top-level number lets (the default plan)", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(panel(page)).toBeHidden();
  });

  test("parametric gets a slider per plain-number let, each with its label", async ({ page }) => {
    await page.goto(`/${await shareHash(example("parametric"))}`);
    await waitForPlan(page);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator("summary")).toHaveText("Knobs (6)");
    // A native range input, named by its label (the `let`'s trailing comment).
    await expect(page.getByRole("slider", { name: /unit width/ })).toHaveAttribute("data-knob", "W");
    await expect(knob(page, "COUNT")).toHaveAttribute("step", "1");
    // `aream2(w, h)` and `names = [...]` are no knobs.
    await expect(panel(page).locator('input[type="range"]')).toHaveCount(6);
  });

  test("the knobs example: moving a knob changes the drawing, the facts line and the hash", async ({ page }) => {
    const src = example("knob-flat");
    await page.goto(`/${await shareHash(src)}`);
    await waitForPlan(page);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).locator("summary")).toHaveText("Knobs (3)");
    const width = await viewBoxWidth(page);
    const facts = await page.locator("#facts").innerText();

    await knob(page, "LIVING").fill("6000");
    await expect(panel(page).locator("output").first()).toHaveText("6000 mm");
    // A wider living room: a wider drawing and a bigger plan.
    await expect.poll(() => viewBoxWidth(page)).toBeGreaterThan(width);
    await expect(page.locator("#facts")).not.toHaveText(facts);
    // Only the literal moved, and the hash carries the new source, as an edit does.
    const want = src.replace("let LIVING = 4500", "let LIVING = 6000");
    await expect.poll(() => hashSource(page)).toBe(want);
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY)).toBe(want);
  });

  test("a moved knob makes the plan an edited one in the gallery, and a reload agrees", async ({ page }) => {
    const src = example("knob-flat");
    await page.goto(`/${await shareHash(src)}`);
    await waitForPlan(page);
    // Opened word for word, it is the example.
    await expectPlanNamed(page, "Resizable Flat (knobs)");
    await expect(page.locator("#planName")).toHaveText("Resizable Flat");
    await knob(page, "DEPTH").fill("6000");
    await expectPlanNamed(page, { neutral: "Edited plan" });
    // The hash holds the moved plan: a reload opens it as a shared plan, still no example.
    await expect.poll(() => hashSource(page)).toBe(src.replace("let DEPTH = 5400", "let DEPTH = 6000"));
    await page.reload();
    await waitForPlan(page);
    await expectPlanNamed(page, { neutral: "Shared plan" });
    await expect(knob(page, "DEPTH")).toHaveValue("6000");
  });

  test("the keyboard steps a knob by one grid step", async ({ page }) => {
    const src = example("knob-flat");
    await page.goto(`/${await shareHash(src)}`);
    await waitForPlan(page);
    await knob(page, "DEPTH").focus();
    await page.keyboard.press("ArrowRight");
    await expect(knob(page, "DEPTH")).toHaveValue("5450");
    await expect.poll(() => hashSource(page)).toBe(src.replace("let DEPTH = 5400", "let DEPTH = 5450"));
  });

  test("a value that does not compile snaps back and keeps the last good drawing", async ({ page }) => {
    // parametric indexes `names[i]` for i < COUNT, and names has three entries: COUNT = 4 fails.
    const src = example("parametric");
    await page.goto(`/${await shareHash(src)}`);
    await waitForPlan(page);
    const drawing = await page.locator(".pz-stage svg").innerHTML();
    await knob(page, "COUNT").fill("4");
    await expect(knob(page, "COUNT")).toHaveValue("3");
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    expect(await page.locator(".pz-stage svg").innerHTML()).toBe(drawing);
    await expect(page.locator("#status")).not.toHaveClass(/err/);
    // The source never took the bad value.
    expect(await hashSource(page)).not.toContain("let COUNT = 4");
  });

  test("in edit mode the editor takes the new number, as one undo step", async ({ page }) => {
    const src = example("knob-flat");
    await gotoEdit(page, await shareHash(src));
    await knob(page, "BEDROOM").fill("4000");
    await expect(page.locator(".cm-content")).toContainText("let BEDROOM = 4000");
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.locator(".cm-content")).toContainText("let BEDROOM = 3300");
  });

  test("while the editor's source does not compile the knobs are disabled, and come back when it does", async ({
    page,
  }) => {
    const src = example("knob-flat");
    await gotoEdit(page, await shareHash(src));
    await expect(knob(page, "LIVING")).toBeEnabled();
    await expect(panel(page).locator(".knobs-note")).toBeHidden();
    // An unfinished expression: the drawing stays, the knobs cannot write over the edit.
    const broken = src.replace("let LIVING = 4500", "let LIVING = 4500 +");
    await setEditorSource(page, broken);
    await expect(knob(page, "LIVING")).toBeDisabled();
    await expect(panel(page).locator(".knobs-note")).toHaveText("Fix the source to use knobs");
    await expect(page.locator(".cm-content")).toContainText("let LIVING = 4500 +");
    await setEditorSource(page, src);
    await expect(knob(page, "LIVING")).toBeEnabled();
    await expect(panel(page).locator(".knobs-note")).toBeHidden();
    await knob(page, "LIVING").fill("5000");
    await expect(page.locator(".cm-content")).toContainText("let LIVING = 5000");
  });

  test("a phone gets the knobs as a sheet across the bottom of the drawing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${await shareHash(example("knob-flat"))}`);
    await waitForPlan(page);
    const p = panel(page);
    await expect(p).toBeVisible();
    // Folded to its heading until opened.
    await expect(p).not.toHaveAttribute("open", "");
    await p.locator("summary").click();
    await expect(knob(page, "LIVING")).toBeVisible();
    const vp = (await page.locator(".pz-viewport").boundingBox())!;
    const sheet = (await p.boundingBox())!;
    expect(Math.round(sheet.width)).toBe(Math.round(vp.width));
    expect(Math.round(sheet.y + sheet.height)).toBe(Math.round(vp.y + vp.height));
  });
});
