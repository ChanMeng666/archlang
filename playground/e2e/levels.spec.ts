import { expect, type Download, type Page, test } from "@playwright/test";
import { waitForPlan, watchForProblems } from "./fixtures.js";

/**
 * The STOREY SWITCHER — the control that picks which level of a multi-storey plan the
 * playground is showing.
 *
 * What is proved here can only be proved against the assembled page: that the drawing
 * actually swaps, that the facts strip under it swaps WITH it (it used to be able to
 * show one storey's numbers beside another storey's drawing — the whole reason the core
 * grew `describeLevel`), that a download of level 3 is NAMED for level 3 the way
 * `arch compile` names it, and that a single-storey plan grows no control at all.
 *
 * The switcher lives in the output pane's TAB STRIP, not the preview toolbar, so a
 * storey can be changed while reading Describe or Lint — the tabs whose contents it
 * selects. One of the cases below switches from the Describe tab and never returns to
 * Preview, which is the whole reason it moved.
 *
 * UNTAGGED (no `@prod`). Two reasons: the nightly production subset is deliberately
 * load-and-look, and this spec drives a download, which is not something to fire at the
 * live host on a schedule. It never types into the editor — every plan here arrives
 * through the example <select>, which is a whole-document load — so nothing about it is
 * editor-timing-sensitive.
 */

/** The storey buttons, in strip order. */
const levelButtons = (page: Page) => page.locator("#storeys button");

/** Load a bundled example by its menu label and wait for the plan to land. */
async function pickExample(page: Page, label: string): Promise<void> {
  await page.locator("#examples").selectOption(label);
  await waitForPlan(page);
}

/** The serialized drawing currently in the preview stage. */
const stageSvg = (page: Page): Promise<string> => page.locator(".pz-stage svg").innerHTML();

/** Click `#download` for `format` and return the resulting browser download. */
async function downloadAs(page: Page, format: string): Promise<Download> {
  await page.locator("#format").selectOption(format);
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
  return download;
}

test.describe("storey switcher", () => {
  test("switching to level 3 moves the drawing AND the facts under it", async ({ page }) => {
    const problems = watchForProblems(page);
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Townhouse (3 levels)");

    // One button per `level` block, lowest first, and the lowest is the one pressed —
    // `compile().pages` is ascending and the switcher starts at the bottom.
    await expect(levelButtons(page)).toHaveCount(3);
    await expect(levelButtons(page)).toHaveText(["L1", "L2", "L3"]);
    const l1 = levelButtons(page).nth(0);
    const l3 = levelButtons(page).nth(2);
    await expect(l1).toHaveAttribute("aria-pressed", "true");
    await expect(l3).toHaveAttribute("aria-pressed", "false");
    // The storey NAME the source gave is carried, so the button is not just a number.
    await expect(l1).toHaveAttribute("aria-label", 'level 1 "Ground floor"');
    await expect(l3).toHaveAttribute("aria-label", 'level 3 "Second floor"');

    // Level 1 of examples/townhouse.arch: 4 rooms, 4 doors, 2 windows, and the only
    // storey with an exterior door.
    const facts = page.locator("#facts");
    await expect(facts).toContainText("Doors 4");
    await expect(facts).toContainText("Windows 2");
    await expect(facts).toContainText("Entrance yes");
    const groundSvg = await stageSvg(page);

    await l3.click();

    await expect(l3).toHaveAttribute("aria-pressed", "true");
    await expect(l1).toHaveAttribute("aria-pressed", "false");
    await expect(l3).toHaveClass(/active/);

    // The drawing is a different storey, not the same one re-rendered.
    await expect.poll(() => stageSvg(page)).not.toBe(groundSvg);

    // …and the numbers came with it. Level 3: 3 doors, 3 windows, and no way in from
    // outside — which is exactly what `arch describe --level 3` reports, because it is
    // the same `describeLevel()` producing both.
    await expect(facts).toContainText("Doors 3");
    await expect(facts).toContainText("Windows 3");
    await expect(facts).toContainText("Entrance none");

    expect(problems.consoleErrors, "console errors while switching storeys").toEqual([]);
    expect(problems.pageErrors, "uncaught page errors while switching storeys").toEqual([]);
  });

  test("Describe and Lint report the selected storey, not page 1", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Townhouse (3 levels)");

    await page.locator("#tab-describe").click();
    // Level 1 holds the hall and the entrance; level 3 does not.
    await expect(page.locator("#describe")).toContainText("Hall");

    // Switched FROM the Describe tab, without going back to Preview: the control is in
    // the tab strip, so the facts can be re-aimed while you are reading them.
    await levelButtons(page).nth(2).click();
    await expect(page.locator("#describe")).not.toContainText("Hall");
    // Still on Describe, and still exactly one panel showing — the switcher is not a tab.
    await expect(page.locator("#describe")).toHaveClass(/active/);
    await expect(page.locator(".tabview.active")).toHaveCount(1);

    // The Lint tab narrows too — and SAYS it is narrowed, so a quiet panel can never be
    // read as a clean building. The building's verdict itself never moved: the status
    // dot and its warning count come from the unfiltered diagnostics.
    await page.locator("#tab-lint").click();
    await expect(page.locator("#lintOutput .lint-narrowed")).toContainText("Showing level 3");
  });

  test("the SVG download is named for the storey on screen", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Townhouse (3 levels)");

    // Level 1 is the default and the name is the plain one — nothing about the
    // existing download changed for a reader who never touches the switcher.
    expect((await downloadAs(page, "svg")).suggestedFilename()).toBe("floorplan.L1.svg");

    await levelButtons(page).nth(2).click();
    // `<stem>.L<n>.<ext>` — the same scheme `arch compile -o floorplan.svg` writes.
    expect((await downloadAs(page, "svg")).suggestedFilename()).toBe("floorplan.L3.svg");
  });

  test("a single-storey plan grows no control at all", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Studio (1BR)");

    // Hidden ENTIRELY — the group and the rule in front of it — because there is no
    // storey to choose. `compile()` does not even emit a `pages` key for this plan.
    await expect(page.locator("#storeys")).toBeHidden();
    await expect(page.locator("#storeysSep")).toBeHidden();
    // The tablist still contains only tabs, so a screen reader is told there are four.
    expect(await page.locator('[role="tablist"] > *').count()).toBe(4);
    await expect(levelButtons(page)).toHaveCount(0);

    // And the panels are the whole-plan read: no narrowing marker anywhere, and the
    // full whole-building tick, which is only sayable when nothing is hidden.
    await page.locator("#tab-lint").click();
    await expect(page.locator("#lintOutput .lint-narrowed")).toHaveCount(0);
    await expect(page.locator("#lintOutput .ok")).toContainText("every room is reachable");
  });

  /**
   * The Lint tab's clean verdict — "every room is reachable, bedrooms have windows, the
   * building has an entrance" — is a claim about the BUILDING. Narrowed to one storey
   * with warnings hidden on another, saying it would be a whole-building claim drawn
   * from partial data, which is the exact failure this workstream exists to prevent.
   *
   * `examples/hillside-villa.arch` is the fixture the repo already ships for it: two
   * storeys, three deliberate lint warnings, ALL of them on level 2.
   */
  test("a quiet storey never claims the BUILDING is sound", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Hillside Villa");
    await expect(levelButtons(page)).toHaveCount(2);

    const out = page.locator("#lintOutput");
    await page.locator("#tab-lint").click();

    // Level 1 raises nothing of its own — and three warnings are out of sight.
    await expect(out.locator(".lint-narrowed")).toContainText("Showing level 1 — 3 more warnings on the other storeys");
    await expect(out.locator(".empty")).toContainText("Nothing to report on this storey");
    await expect(out.locator(".lintrow")).toHaveCount(0);
    // The claim that must NOT be made from a partial set.
    await expect(out.locator(".ok")).toHaveCount(0);

    // Level 2 owns all three, so nothing is hidden and every row is shown.
    await levelButtons(page).nth(1).click();
    await expect(out.locator(".lintrow")).toHaveCount(3);
    await expect(out.locator(".lint-narrowed")).toHaveText("Showing level 2.");
  });

  /**
   * The other half of the split: narrowed, but with NOTHING hidden. Every storey of
   * `examples/two-storey.arch` is clean, so the whole-building tick is true of the
   * whole building and is the right thing to print.
   */
  test("a narrowed panel with nothing hidden still gives the full verdict", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Two-storey (2 levels)");
    await page.locator("#tab-lint").click();

    const out = page.locator("#lintOutput");
    // No "— N more warnings" clause, because there are none anywhere.
    await expect(out.locator(".lint-narrowed")).toHaveText("Showing level 1.");
    await expect(out.locator(".ok")).toContainText("every room is reachable");
    await expect(out.locator(".empty")).toHaveCount(0);
  });

  test("the selection resets to the lowest storey when another example is loaded", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Townhouse (3 levels)");
    await levelButtons(page).nth(2).click();
    await expect(levelButtons(page).nth(2)).toHaveAttribute("aria-pressed", "true");

    // A different building's "level 2" is a different floor; carrying the number over
    // would land the reader somewhere they never asked for.
    await pickExample(page, "Two-storey (2 levels)");
    await expect(levelButtons(page)).toHaveCount(2);
    await expect(levelButtons(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  });
});
