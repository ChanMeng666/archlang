import { expect, type Download, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { describe, describeLevel, lint } from "../../src/index.js";
import { downloadFromShare, pickPlan, setEditorSource, waitForPlan, watchForProblems } from "./fixtures.js";

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
 * The switcher has ONE home (ruling PG-D3): on the stage, top-left, under the Plan | 3D switch,
 * in both modes and over every tab, so a storey can be changed while reading Facts or Checks —
 * the tabs whose contents it selects. One of the cases below switches from the Facts tab and
 * never returns to Plan; the 3D half of "it drives both views" is in preview3d.spec.ts.
 *
 * UNTAGGED (no `@prod`). Two reasons: the nightly production subset is deliberately
 * load-and-look, and this spec drives a download, which is not something to fire at the
 * live host on a schedule. It never types into the editor — every plan here arrives
 * through the example <select>, which is a whole-document load — so nothing about it is
 * editor-timing-sensitive.
 *
 * The switcher works in view mode too (it is part of the drawing's view path); the cases that
 * read Describe or Lint, or type into the editor, open the page in edit mode (`/#edit`), and the
 * download opens the Share menu first.
 */

const TOWNHOUSE = readFileSync(new URL("../../examples/townhouse.arch", import.meta.url), "utf8");

/**
 * The facts line for one storey of examples/townhouse.arch, from the core's own `describeLevel()`
 * (the function behind `arch describe --level N`): its source lines, rooms and net area, and the
 * storey it is. Written out here, not through the app's `factsLine`, so the page is checked
 * against describe() rather than against itself.
 */
function townhouseFacts(level: number): string {
  const t = describeLevel(describe(TOWNHOUSE), level).totals;
  const lines = TOWNHOUSE.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(TOWNHOUSE) ? 1 : 0);
  expect(t.net_floor_area_m2, "every townhouse storey has a net area").toBeDefined();
  return `${lines} lines of ArchLang → ${t.rooms} rooms · ${t.net_floor_area_m2} m² (net) · level ${level}`;
}

/** The storey buttons, in strip order. */
const levelButtons = (page: Page) => page.locator("#storeys button");

/** Load a bundled example by its gallery label and wait for the plan to land. */
async function pickExample(page: Page, label: string): Promise<void> {
  await pickPlan(page, label);
  await waitForPlan(page);
}

/** The serialized drawing currently in the preview stage. */
const stageSvg = (page: Page): Promise<string> => page.locator(".pz-stage svg").innerHTML();

/** Download `format` from Share → Export and return the resulting browser download. */
const downloadAs = (page: Page, format: string): Promise<Download> => downloadFromShare(page, format);

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

    // Level 1 of examples/townhouse.arch: the facts line names the storey it measures.
    const facts = page.locator("#facts");
    await expect(facts).toHaveText(townhouseFacts(1));
    const groundSvg = await stageSvg(page);

    await l3.click();

    await expect(l3).toHaveAttribute("aria-pressed", "true");
    await expect(l1).toHaveAttribute("aria-pressed", "false");
    await expect(l3).toHaveClass(/active/);

    // The drawing is a different storey, not the same one re-rendered.
    await expect.poll(() => stageSvg(page)).not.toBe(groundSvg);

    // …and the facts came with it: level 3's, exactly what `arch describe --level 3`
    // reports, because it is the same `describeLevel()` producing both.
    await expect(facts).toHaveText(townhouseFacts(3));

    expect(problems.consoleErrors, "console errors while switching storeys").toEqual([]);
    expect(problems.pageErrors, "uncaught page errors while switching storeys").toEqual([]);
  });

  test("it has one home: top-left on the stage, under the Plan | 3D switch, in both modes", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickExample(page, "Townhouse (3 levels)");
    await expect(page.locator('[role="group"][aria-label="Storey"]')).toHaveCount(1);
    const at = async () => {
      const [g, sw, stage] = await Promise.all([
        page.locator("#storeys").boundingBox(),
        page.locator(".stage-switch").boundingBox(),
        page.locator(".pane:has(#storeys)").boundingBox(),
      ]);
      return { g: g!, sw, stage: stage! };
    };
    // View mode: just under the switch, left-aligned with it, never in the (absent) tab row.
    const view = await at();
    expect(view.sw, "the switch is on screen in view mode").not.toBeNull();
    expect(view.g.y).toBeGreaterThanOrEqual(view.sw!.y + view.sw!.height);
    expect(view.g.y - (view.sw!.y + view.sw!.height)).toBeLessThan(16);
    expect(Math.abs(view.g.x - view.sw!.x)).toBeLessThan(2);
    await expect(page.locator(".out-tabs #storeys")).toHaveCount(0);
    // Edit mode: the same element in the stage's top-left corner (the tabs replace the switch),
    // on every tab.
    await page.locator("#sourceToggle").click();
    await expect(page.locator(".cm-content")).toBeVisible();
    for (const tab of ["#tab-preview", "#tab-facts", "#tab-checks"]) {
      await page.locator(tab).click();
      await expect(page.locator("#storeys")).toBeVisible();
      const edit = await at();
      expect(edit.g.x - edit.stage.x, `left edge on ${tab}`).toBeLessThan(24);
      const tabs = (await page.locator(".out-tabs").boundingBox())!;
      expect(edit.g.y, `under the tab row on ${tab}`).toBeGreaterThanOrEqual(tabs.y + tabs.height);
      expect(edit.g.y - (tabs.y + tabs.height), `at the stage's top on ${tab}`).toBeLessThan(24);
    }
  });

  test("Describe and Lint report the selected storey, not page 1", async ({ page }) => {
    await page.goto("/#edit");
    await waitForPlan(page);
    await pickExample(page, "Townhouse (3 levels)");

    await page.locator("#tab-facts").click();
    // Level 1 holds the hall and the entrance; level 3 does not.
    await expect(page.locator("#describe")).toContainText("Hall");

    // Switched FROM the Facts tab, without going back to Plan: the control floats over every
    // tab, so the facts can be re-aimed while you are reading them.
    await levelButtons(page).nth(2).click();
    await expect(page.locator("#describe")).not.toContainText("Hall");
    // Still on Facts, and still exactly one panel showing — the switcher is not a tab.
    await expect(page.locator("#factsView")).toHaveClass(/active/);
    await expect(page.locator(".tabview.active")).toHaveCount(1);

    // Lint (the Checks tab) narrows too — and SAYS it is narrowed, so a quiet panel can never be
    // read as a clean building. The building's verdict itself never moved: the status
    // dot and its warning count come from the unfiltered diagnostics.
    await page.locator("#tab-checks").click();
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
    await page.goto("/#edit");
    await waitForPlan(page);
    await pickExample(page, "Studio (1BR)");

    // Hidden ENTIRELY, because there is no storey to choose. `compile()` does not even emit a
    // `pages` key for this plan.
    await expect(page.locator("#storeys")).toBeHidden();
    // The tablist contains only tabs, so a screen reader is told there are four
    // (Plan, 3D, Facts, Checks).
    expect(await page.locator('[role="tablist"] > *').count()).toBe(4);
    await expect(page.locator('[role="tablist"] > [role="tab"]')).toHaveCount(4);
    await expect(levelButtons(page)).toHaveCount(0);

    // And the panels are the whole-plan read: no narrowing marker anywhere, and the
    // full whole-building tick, which is only sayable when nothing is hidden.
    await page.locator("#tab-checks").click();
    await expect(page.locator("#lintOutput .lint-narrowed")).toHaveCount(0);
    await expect(page.locator("#lintOutput .ok")).toContainText("every room is reachable");
  });

  /**
   * The Lint tab's clean verdict — "every room is reachable, bedrooms have windows, the
   * building has an entrance" — is a claim about the BUILDING. Narrowed to one storey
   * with warnings hidden on another, saying it would be a whole-building claim drawn
   * from partial data, which is the exact failure this workstream exists to prevent.
   *
   * `examples/hillside-villa.arch` as it was before fix/examples-sound made it warning-free:
   * its four old 700 mm upper-floor doors put back, so the two storeys have all of their lint
   * warnings on level 2. The counts are DERIVED from the
   * compiler's own lint() (filtered the way playground/src/main.ts feeds renderLint:
   * a row with no level shows everywhere), never retyped, so a lint-rule change
   * cannot strand this spec on a stale number.
   */
  test("a quiet storey never claims the BUILDING is sound", async ({ page }) => {
    const src = [
      ["d_linen  on w_linen_s at 1100 width 800", "d_linen  on w_linen_s at 1100 width 700"],
      ["d_en2_corr on en2.wall at 5300 width 800", "d_en2_corr on en2.wall at 5300 width 700"],
      ["d_enm      on en_m.wall at 7500 width 800", "d_enm      on en_m.wall at 7500 width 700"],
      ["d_enb2     pocket on en_b2.wall at 7500 width 800", "d_enb2     pocket on en_b2.wall at 7500 width 700"],
    ].reduce(
      (s, [now, before]) => {
        if (s.split(now).length !== 2) throw new Error(`"${now}" is not found exactly once`);
        return s.replace(now, before);
      },
      readFileSync(new URL("../../examples/hillside-villa.arch", import.meta.url), "utf8"),
    );
    await page.goto("/#edit");
    await waitForPlan(page);
    await setEditorSource(page, src);
    await expect(levelButtons(page)).toHaveCount(2);

    const villa = lint(src);
    const onLevel = (n: number) => villa.filter((d) => d.level === undefined || d.level === n).length;
    const hiddenFromLevel1 = villa.length - onLevel(1);
    // The fixture's premise: level 1 is quiet and level 2 owns every warning.
    expect(onLevel(1)).toBe(0);
    expect(hiddenFromLevel1).toBeGreaterThan(1);

    const out = page.locator("#lintOutput");
    await page.locator("#tab-checks").click();

    // Level 1 raises nothing of its own — and the other storey's warnings are out of sight.
    await expect(out.locator(".lint-narrowed")).toContainText(
      `Showing level 1 — ${hiddenFromLevel1} more warnings on the other storeys`,
    );
    await expect(out.locator(".empty")).toContainText("Nothing to report on this storey");
    await expect(out.locator(".lintrow")).toHaveCount(0);
    // The claim that must NOT be made from a partial set.
    await expect(out.locator(".ok")).toHaveCount(0);

    // Level 2 owns them all, so nothing is hidden and every row is shown.
    await levelButtons(page).nth(1).click();
    await expect(out.locator(".lintrow")).toHaveCount(onLevel(2));
    await expect(out.locator(".lint-narrowed")).toHaveText("Showing level 2.");
  });

  /**
   * The other half of the split: narrowed, but with NOTHING hidden. Every storey of
   * `examples/two-storey.arch` is clean, so the whole-building tick is true of the
   * whole building and is the right thing to print.
   */
  test("a narrowed panel with nothing hidden still gives the full verdict", async ({ page }) => {
    await page.goto("/#edit");
    await waitForPlan(page);
    await pickExample(page, "Two-storey (2 levels)");
    await page.locator("#tab-checks").click();

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
