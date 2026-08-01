import { expect, test } from "@playwright/test";
import { SIMPLE_PLAN, setEditorSource, shareHash, waitForPlan } from "./fixtures.js";

/**
 * The output tabs, the persisted view preferences, and the two preview
 * interactions that tie the drawing back to the source.
 */
test.describe("output tabs", () => {
  test("each tab shows its own panel and hides the others", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);

    for (const [tab, view] of [
      ["#tab-describe", "#describe"],
      ["#tab-lint", "#lint"],
      ["#tab-intent", "#intent"],
      ["#tab-preview", "#preview"],
    ] as const) {
      await page.locator(tab).click();
      await expect(page.locator(view)).toHaveClass(/active/);
      await expect(page.locator(tab)).toHaveAttribute("aria-selected", "true");
      // Exactly one panel is active at a time.
      await expect(page.locator(".tabview.active")).toHaveCount(1);
    }
  });

  test("Describe shows the semantic facts the CLI's `describe --json` returns", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await page.locator("#tab-describe").click();
    await expect(page.locator("#describe")).toContainText("Main");
    await expect(page.locator("#describe")).not.toBeEmpty();
  });

  test("Lint reports the clean-plan verdict, not an empty panel", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await page.locator("#tab-lint").click();
    await expect(page.locator("#lintOutput .ok, #lintOutput .lintrow").first()).toBeVisible();
    await expect(page.locator("#lintCaption")).not.toBeEmpty();
  });

  test("Suggest offers advisory door/window statements for an unreachable room", async ({ page }) => {
    // A room with no door: `suggest` is exactly the affordance for this fault.
    const unreachable = `plan "E2E" {
  units mm
  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Bedroom"
}`;
    await page.goto(`/${await shareHash(unreachable)}`);
    await waitForPlan(page);
    await page.locator("#tab-lint").click();

    const suggest = page.locator("#suggest");
    await expect(suggest).toBeVisible();
    await suggest.click();
    await expect(page.locator("#suggestPanel")).toBeVisible();
    // Advisory, never applied: it proposes statements you choose to insert.
    await expect(page.locator("#suggestPanel")).not.toBeEmpty();
  });

  test("Intent checks the plan against a brief the panel pre-fills", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#tab-intent").click();
    await expect(page.locator("#intentSrc")).not.toBeEmpty();
    // Opening the tab runs the check once, so it is never an empty panel.
    await expect(page.locator("#intentOutput")).not.toBeEmpty();

    await page.locator("#intentRun").click();
    await expect(page.locator("#intentOutput")).not.toBeEmpty();
  });
});

test.describe("persisted view preferences", () => {
  test("the render theme survives a reload", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();

    await page.locator("#theme").selectOption("blueprint");
    // A render theme restyles the produced SVG, so the drawing must actually change.
    await expect.poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before).toBe(true);

    await page.reload();
    await waitForPlan(page);
    await expect(page.locator("#theme")).toHaveValue("blueprint");
  });

  test("the lint profile survives a reload, with its caption", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#tab-lint").click(); // the selector lives inside the Lint panel

    await page.locator("#lintProfile").selectOption("accessibility-advisory");
    await expect(page.locator("#lintCaption")).toContainText("850");

    await page.reload();
    await waitForPlan(page);
    await page.locator("#tab-lint").click();
    await expect(page.locator("#lintProfile")).toHaveValue("accessibility-advisory");
    await expect(page.locator("#lintCaption")).toContainText("850");
  });

  test("the a11y toggle re-compiles but is DELIBERATELY not persisted", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();

    await page.locator("#accessible").check();
    // Opt-in `<title>`/`<desc>`/`role="img"` metadata (ADR 0007) really lands…
    await expect.poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before).toBe(true);
    await expect(page.locator(".pz-stage svg")).toHaveAttribute("role", "img");

    // …but unlike theme/lintProfile it is a per-session view switch with no
    // storage key. Pinned as ACTUAL behaviour, not as an endorsement: if it is
    // ever given a `KEYS.*` entry, this is the test that must change with it.
    await page.reload();
    await waitForPlan(page);
    await expect(page.locator("#accessible")).not.toBeChecked();
    await expect(page.locator(".pz-stage svg")).not.toHaveAttribute("role", "img");
  });

  test("the pane split ratio survives a reload", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.evaluate(() => localStorage.setItem("archlang.pg.split", "0.35"));
    await page.reload();
    await waitForPlan(page);
    await expect(page.locator("main")).toHaveCSS("grid-template-columns", /.+/);
    await expect(page.locator(".divider")).toHaveCSS("left", /.+/);
  });
});

test.describe("preview interactions", () => {
  test("clicking a drawn element jumps the editor caret to its source", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);

    // Put the caret on line 1 so any jump is observable. (`highlightActiveLine`
    // is in the extension set, so `.cm-activeLine` tracks the caret's line.)
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+Home");
    await expect(page.locator(".cm-activeLine")).toContainText('plan "E2E"');

    // `annotate: true` stamps data-span on every drawn primitive; click one.
    const annotated = page.locator(".pz-stage svg [data-span]").first();
    await expect(annotated).toHaveAttribute("data-span", /^\d+:\d+$/);
    await annotated.click({ force: true });

    await expect(page.locator(".cm-content")).toBeFocused();
    // The caret moved off line 1 to the statement that drew the thing clicked.
    await expect(page.locator(".cm-activeLine")).not.toContainText('plan "E2E"');
  });

  test("hovering a room shows a tooltip with its label and area", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);

    const tip = page.locator(".room-tip");
    await expect(tip).toBeHidden();

    // The single room fills the plan, so its centre is the viewport centre.
    const box = (await page.locator(".pz-viewport").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await expect(tip).toBeVisible();
    await expect(tip).toContainText("Main");
    await expect(tip).toContainText("m²");
    await expect(tip).toContainText("mm");

    // Leaving the preview hides it again.
    await page.mouse.move(box.x + box.width / 2, box.y - 40);
    await expect(tip).toBeHidden();
  });

  test("the zoom controls change the stage transform", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const stage = page.locator(".pz-stage");
    const fitted = await stage.evaluate((el) => el.style.transform);

    await page.locator("button[data-pz='in']").click();
    await expect.poll(() => stage.evaluate((el) => el.style.transform)).not.toBe(fitted);

    await page.locator("button[data-pz='fit']").click();
    await expect.poll(() => stage.evaluate((el) => el.style.transform)).toBe(fitted);
  });
});

test.describe("saved snapshots", () => {
  test("saves the current source under a name and restores it later", async ({ page }) => {
    // `window.prompt` names the snapshot.
    page.on("dialog", (d) => void d.accept("E2E snapshot"));

    await page.goto("/");
    await waitForPlan(page);
    await setEditorSource(page, SIMPLE_PLAN);

    const pop = page.locator(".snap-pop");
    await page.locator("#saved").click();
    await expect(pop).toBeVisible();
    await expect(pop.locator(".snap-empty")).toBeVisible();

    await pop.locator(".snap-save").click();
    await expect(pop.locator(".snap-row")).toHaveCount(1);
    await expect(pop.locator(".snap-name")).toHaveText("E2E snapshot");

    // Edit away from the saved plan, then restore it.
    await page.keyboard.press("Escape");
    await setEditorSource(page, SIMPLE_PLAN.replace('label "Main"', 'label "Elsewhere"'));
    await expect(page.locator(".cm-content")).toContainText("Elsewhere");

    await page.locator("#saved").click();
    await pop.locator(".snap-restore").first().click();
    await expect(page.locator(".cm-content")).toContainText('label "Main"');
    await expect(page.locator(".cm-content")).not.toContainText("Elsewhere");
    await expect(pop).toBeHidden(); // restoring closes the popover
  });
});
