import { expect, type Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { describe } from "../../src/index.js";
import {
  BROKEN_PLAN,
  gotoEdit,
  openMore,
  openShare,
  SIMPLE_PLAN,
  setEditorSource,
  shareHash,
  waitForPlan,
} from "./fixtures.js";

/** The plan a first visit opens (`DEFAULT_EXAMPLE`), as the app bundles it. */
const LANEWAY = readFileSync(new URL("../../examples/laneway-house.arch", import.meta.url), "utf8");

/** The screen point of plan point (x, y) mm in the drawing on screen (its own CTM). */
const screenPoint = (page: Page, x: number, y: number): Promise<[number, number]> =>
  page.locator(".pz-stage svg").evaluate(
    (svg, [x, y]) => {
      const s = svg as SVGSVGElement;
      const p = s.createSVGPoint();
      p.x = x!;
      p.y = y!;
      const q = p.matrixTransform(s.getScreenCTM()!);
      return [q.x, q.y] as [number, number];
    },
    [x, y],
  );

/** The visible elements among `selector`, by their trimmed text. */
const visibleTexts = (page: Page, selector: string): Promise<string[]> =>
  page
    .locator(selector)
    .evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).getClientRects().length > 0).map((e) => e.textContent?.trim() ?? ""),
    );

/**
 * One entry point per function (ruling PG-D3): view mode has no tab row and no status row, the
 * stage's Plan | 3D switch being its one view control; edit mode has one row of four tabs, which
 * replace the switch there; neither header menu opens a tab; the status shows only when there is something to
 * say.
 */
test.describe("one view switch (PG-D3)", () => {
  test("view mode has no tablist and no status row; the switch is its one Plan/3D control", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.getByRole("tablist", { name: "Output view" })).toBeHidden();
    await expect(page.locator(".tab:visible")).toHaveCount(0);
    // No status row: nothing says "ready" on screen, and the old dot is gone.
    await expect(page.locator(".dot")).toHaveCount(0);
    await expect(page.locator("#status")).not.toHaveClass(/\bshow\b/);
    const box = (await page.locator("#status").boundingBox())!;
    expect(box.width * box.height, "the status is visually hidden").toBeLessThanOrEqual(1);
    // …but still a live region for assistive tech: `#statusLive`, the notice's mirror under <body>
    // (card PG5b ②; layout.spec checks it is drawn in every layout), and only one.
    await expect(page.locator("#statusLive")).toHaveAttribute("role", "status");
    expect(await page.locator("#statusLive").evaluate((el) => el.parentElement === document.body)).toBe(true);
    await expect(page.locator("#status [role=status], #status [aria-live]")).toHaveCount(0);
    await expect(page.locator("#sourceToggle")).not.toHaveAttribute("data-status");
    // The hidden notice's × is out of the tab order too: hidden, so no keyboard stop on nothing.
    const dismiss = page.locator("#statusDismiss");
    await expect(dismiss).toHaveAttribute("hidden", "");
    await expect(dismiss).toBeHidden();
    await dismiss.evaluate((b) => (b as HTMLElement).focus());
    await expect(dismiss).not.toBeFocused();
    // Exactly one visible Plan control and one visible 3D control: the stage's switch.
    expect(await visibleTexts(page, "button")).toEqual(expect.not.arrayContaining(["Preview", "3D preview"]));
    expect((await visibleTexts(page, "button")).filter((t) => t === "Plan" || t === "3D")).toEqual(["Plan", "3D"]);
    await expect(page.locator(".stage-switch")).toBeVisible();
  });

  test("edit mode has exactly four tabs, Plan · 3D · Facts · Checks, and they replace the switch", async ({ page }) => {
    await gotoEdit(page);
    const tablist = page.getByRole("tablist", { name: "Output view" });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole("tab")).toHaveText(["Plan", "3D", "Facts", "Checks"]);
    // The tablist holds only tabs.
    expect(await tablist.evaluate((t) => t.children.length)).toBe(4);
    // Exactly one visible Plan/3D control in this mode too: the tabs, not the stage's switch.
    await expect(page.locator(".stage-switch")).toBeHidden();
    expect((await visibleTexts(page, "button")).filter((t) => t === "Plan" || t === "3D")).toEqual(["Plan", "3D"]);
    await expect(page.locator("#tab-preview")).toHaveAttribute("aria-selected", "true");
    // Still no status row while the plan is fine.
    await expect(page.locator("#status")).not.toHaveClass(/\bshow\b/);
  });

  test("neither Share nor More opens an output tab: the Panels group is gone", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    for (const [open, id] of [
      [openMore, "#more"],
      [openShare, "#share"],
    ] as const) {
      await open(page);
      await expect(page.locator(`${id} [data-open-tab]`)).toHaveCount(0);
      await expect(page.locator(`${id} .tools-h`, { hasText: "Panels" })).toHaveCount(0);
      for (const name of ["Describe", "Lint", "Intent", "Takeoff", "3D preview"])
        await expect(page.locator(id).getByRole("button", { name, exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  });

  test("⋯ (More) holds exactly the render theme and a11y, Format / Finish / Saved, and the links", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const summary = page.locator("#more > summary");
    await expect(summary).toHaveText("⋯");
    await expect(summary).toHaveAccessibleName("More");
    await openMore(page);
    const panel = page.locator("#more .tools-panel");
    // Three groups, nothing else (ruling PG-D5).
    expect(await panel.evaluate((p) => [...p.children].map((c) => c.querySelector(".tools-h")?.textContent))).toEqual([
      "Edit",
      "View",
      "Links",
    ]);
    expect(await panel.locator("button").evaluateAll((bs) => bs.map((b) => b.id))).toEqual([
      "formatSrc",
      "finishSrc",
      "saved",
    ]);
    expect(await panel.locator("select, input").evaluateAll((es) => es.map((e) => e.id))).toEqual([
      "theme",
      "accessible",
    ]);
    expect(await panel.locator("a").evaluateAll((as) => as.map((a) => a.textContent?.trim()))).toEqual([
      "Agents ↗",
      "Docs ↗",
      "Guide",
      "Language reference",
      "One-page spec",
      expect.stringMatching(/^\d+ example plans$/),
      "npm",
      "GitHub",
      "ArchCanvas ↗",
    ]);
    // No export, link, embed or AI action in it: those are Share's and Make your own's.
    await expect(
      panel.locator("[data-download], #copyLink, #copyShortLink, #embed, #copyLlm, [data-chat-host]"),
    ).toHaveCount(0);
  });

  test("a compiler that fails to load says so, and never stays on Compiling…", async ({ page }) => {
    // The compiler's chunk (`compiler-<hash>.js`, vite.config.js's codeSplitting group) is refused.
    await page.route(/\/assets\/compiler-[^/]+\.js(\?.*)?$/, (route) => route.abort());
    await page.goto("/");
    const status = page.locator("#status");
    await expect(status).toHaveClass(/\berr\b/, { timeout: 15_000 });
    await expect(status).toBeVisible();
    await expect(page.locator("#statusText")).toHaveText("Couldn't load the compiler — reload to retry");
    await expect(page.locator("#sourceToggle")).toHaveAttribute("data-status", "err");
    // Well past the busy threshold: still the error, never "Compiling…" again.
    await page.waitForTimeout(1000);
    await expect(page.locator("#statusText")).not.toHaveText(/Compiling/);
    await expect(status).not.toHaveClass(/\bbusy\b/);
    // The boot is over (card PG5b ⑥): `data-booting` is gone, so nothing waiting on it hangs, and
    // `data-boot-failed` says how it ended. The live region says it too.
    await expect(page.locator("html[data-booting]")).toHaveCount(0);
    await expect(page.locator("html[data-boot-failed]")).toHaveCount(1);
    await expect(page.locator("#statusLive")).toHaveText("Couldn't load the compiler — reload to retry");
  });

  test("a boot that succeeds never says it failed", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await expect(page.locator("html[data-boot-failed]")).toHaveCount(0);
  });

  test("a broken plan shows a status on the stage and a dot on Source; a fix clears both", async ({ page }) => {
    await page.goto(`/${await shareHash(BROKEN_PLAN)}`);
    await expect(page.locator("html[data-booting]")).toHaveCount(0);
    const status = page.locator("#status");
    await expect(status).toHaveClass(/\berr\b/);
    await expect(status).toBeVisible();
    // The message itself is `#statusText`'s; `#status` also holds the dismiss button and whitespace.
    await expect(page.locator("#statusText")).toHaveText(/^\d+ errors? — open Source to see them$/);
    // On the stage, not in the header.
    expect(await status.evaluate((s) => !!s.closest(".pane") && !s.closest("header"))).toBe(true);
    await expect(page.locator("#sourceToggle")).toHaveAttribute("data-status", "err");
    // Dismissible: the notice goes, the dot (where to look) stays.
    await page.getByRole("button", { name: "Dismiss this message" }).click();
    await expect(status).not.toHaveClass(/\bshow\b/);
    await expect(page.locator("#statusText")).toHaveText(/^\d+ errors? — open Source to see them$/);
    await expect(page.locator("#sourceToggle")).toHaveAttribute("data-status", "err");

    // Fixed in the editor: the notice and the dot are gone, and nothing replaces them.
    await page.locator("#sourceToggle").click();
    await expect(page.locator(".cm-content")).toBeVisible();
    await setEditorSource(page, SIMPLE_PLAN);
    await expect(status).not.toHaveClass(/\berr\b/);
    await expect(status).not.toHaveClass(/\bshow\b/);
    await expect(page.locator("#sourceToggle")).not.toHaveAttribute("data-status");
    // Broken again in the editor: it comes back, undismissed.
    await setEditorSource(page, BROKEN_PLAN);
    await expect(status).toHaveClass(/\bshow\b/);
    await expect(status).toBeVisible();
    await expect(page.locator("#statusText")).toHaveText(/^\d+ errors?$/);
  });
});

/**
 * The output tabs, the persisted view preferences, and the two preview
 * interactions that tie the drawing back to the source.
 */
test.describe("output tabs", () => {
  test("each tab shows its own panel and hides the others", async ({ page }) => {
    await gotoEdit(page);

    for (const [tab, view] of [
      ["#tab-facts", "#factsView"],
      ["#tab-checks", "#checksView"],
      ["#tab-preview", "#preview"],
    ] as const) {
      await page.locator(tab).click();
      await expect(page.locator(view)).toHaveClass(/active/);
      await expect(page.locator(tab)).toHaveAttribute("aria-selected", "true");
      // Exactly one panel is active at a time.
      await expect(page.locator(".tabview.active")).toHaveCount(1);
    }
  });

  test("Facts is Describe and Takeoff, two sections of one panel", async ({ page }) => {
    await gotoEdit(page, await shareHash(SIMPLE_PLAN));
    await page.locator("#tab-facts").click();
    const facts = page.locator("#factsView");
    await expect(facts.getByRole("heading", { level: 3 })).toHaveText(["Describe", "Takeoff"]);
    await expect(facts.locator("#describe")).toBeVisible();
    await expect(facts.locator("#takeoffOutput table").first()).toBeVisible();
  });

  test("Checks is the review findings, Lint and Intent, sections of one panel", async ({ page }) => {
    await gotoEdit(page, await shareHash(SIMPLE_PLAN));
    await page.locator("#tab-checks").click();
    const checks = page.locator("#checksView");
    await expect(checks.locator(".checks-head")).toHaveText(/^Checks \(default checks\)/);
    await expect(checks.getByRole("heading", { level: 3 })).toHaveText(["Lint", "Intent"]);
    for (const id of ["#lintProfile", "#lintOutput", "#intentSrc", "#intentRun"])
      await expect(checks.locator(id)).toBeVisible();
    // The Finish results region lives in the Lint section (shown once Finish has run).
    await expect(checks.locator("#lint #finishPanel")).toHaveCount(1);
  });

  test("Describe shows the semantic facts the CLI's `describe --json` returns", async ({ page }) => {
    await gotoEdit(page, await shareHash(SIMPLE_PLAN));
    await page.locator("#tab-facts").click();
    await expect(page.locator("#describe")).toContainText("Main");
    await expect(page.locator("#describe")).not.toBeEmpty();
  });

  test("Lint reports the clean-plan verdict, not an empty panel", async ({ page }) => {
    await gotoEdit(page, await shareHash(SIMPLE_PLAN));
    await page.locator("#tab-checks").click();
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
    await gotoEdit(page, await shareHash(unreachable));
    await page.locator("#tab-checks").click();

    const suggest = page.locator("#suggest");
    await expect(suggest).toBeVisible();
    await suggest.click();
    await expect(page.locator("#suggestPanel")).toBeVisible();
    // Advisory, never applied: it proposes statements you choose to insert.
    await expect(page.locator("#suggestPanel")).not.toBeEmpty();
  });

  test("Intent checks the plan against a brief the panel pre-fills", async ({ page }) => {
    await gotoEdit(page);
    await page.locator("#tab-checks").click();
    await expect(page.locator("#intentSrc")).not.toBeEmpty();
    // Opening the Checks tab runs the check once, so the Intent section is never empty.
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

    await openMore(page);
    await page.locator("#theme").selectOption("blueprint");
    // A render theme restyles the produced SVG, so the drawing must actually change.
    await expect.poll(async () => (await page.locator(".pz-stage svg").innerHTML()) !== before).toBe(true);

    await page.reload();
    await waitForPlan(page);
    await expect(page.locator("#theme")).toHaveValue("blueprint");
    // The drawing built into the page is in the default theme, so with a saved theme it is
    // hidden from the first paint (index.html's head script) instead of restyling in place.
    await expect(page.locator("html")).toHaveClass(/pg-other/);
  });

  test("the lint profile survives a reload, with its caption", async ({ page }) => {
    await gotoEdit(page);
    await page.locator("#tab-checks").click(); // the selector lives in the Checks tab's Lint section

    await page.locator("#lintProfile").selectOption("accessibility-advisory");
    await expect(page.locator("#lintCaption")).toContainText("850");

    await page.reload();
    await waitForPlan(page);
    await page.locator("#tab-checks").click();
    await expect(page.locator("#lintProfile")).toHaveValue("accessibility-advisory");
    await expect(page.locator("#lintCaption")).toContainText("850");
  });

  test("the a11y toggle re-compiles but is DELIBERATELY not persisted", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const before = await page.locator(".pz-stage svg").innerHTML();

    await openMore(page);
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
    await gotoEdit(page);
    await page.evaluate(() => localStorage.setItem("archlang.pg.split", "0.35"));
    await page.reload();
    await waitForPlan(page);
    await expect(page.locator("main")).toHaveCSS("grid-template-columns", /.+/);
    await expect(page.locator(".divider")).toHaveCSS("left", /.+/);
  });
});

test.describe("preview interactions", () => {
  test("clicking a drawn element jumps the editor caret to its source", async ({ page }) => {
    await gotoEdit(page, await shareHash(SIMPLE_PLAN));

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

  test("hovering a room shows a tooltip with its name, area and size", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);

    const tip = page.locator(".room-tip");
    await expect(tip).toBeHidden();

    // The single room fills the plan, so its centre is the viewport centre.
    const box = (await page.locator(".pz-viewport").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    // Name · area · W × D: describe()'s net area and the room's centreline rectangle, each
    // saying which measure it is (written out from describe(), not through the app's formatter).
    const room = describe(SIMPLE_PLAN).rooms[0]!;
    expect(room.net_area_m2).toBeDefined();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(`Main · ${room.net_area_m2} m² (net) · 6000 × 4000 mm (centreline)`);

    // Leaving the preview hides it again.
    await page.mouse.move(box.x + box.width / 2, box.y - 40);
    await expect(tip).toBeHidden();
  });

  test("clicking a room opens its facts card, which Escape closes", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const d = describe(LANEWAY);
    const bed = d.rooms.find((r) => r.label === "Bedroom")!;
    // The Bedroom is a rectangle, so the middle of its box is on its floor.
    const inBed = () => screenPoint(page, bed.bbox.x + bed.bbox.w / 2, bed.bbox.y + bed.bbox.h / 2);
    await page.mouse.click(...(await inBed()));

    const card = page.getByRole("dialog", { name: "Bedroom" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`${bed.net_area_m2} m² (net)`);
    await expect(card).toContainText(`${bed.bbox.w} × ${bed.bbox.h} mm (centreline)`);
    await expect(card).toContainText(bed.uses.join(", "));
    for (const id of bed.adjacent) await expect(card).toContainText(d.rooms.find((r) => r.id === id)!.label!);
    const doors = d.doors.filter((x) => x.between.includes(bed.id)).length;
    const windows = d.windows.filter((x) => x.room === bed.id).length;
    await expect(card).toContainText(`${doors} door${doors === 1 ? "" : "s"} · ${windows} window`);
    // View mode: no editor, so no jump; the card has the focus, and Escape closes it.
    await expect(card.getByRole("button", { name: "Jump to source" })).toHaveCount(0);
    await expect(card).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();

    // A click off every room (on the sheet, outside the building) closes it too, and so does its ×.
    await page.mouse.click(...(await inBed()));
    await expect(card).toBeVisible();
    await page.mouse.click(...(await screenPoint(page, -1000, -1000)));
    await expect(card).toBeHidden();
    await page.mouse.click(...(await inBed()));
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toBeHidden();
  });

  test("in edit mode a room's card jumps to the statement that drew it", async ({ page }) => {
    await gotoEdit(page);
    const bed = describe(LANEWAY).rooms.find((r) => r.label === "Bedroom")!;
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+Home");
    await page.mouse.click(...(await screenPoint(page, bed.bbox.x + bed.bbox.w / 2, bed.bbox.y + bed.bbox.h / 2)));
    const card = page.getByRole("dialog", { name: "Bedroom" });
    await expect(card).toBeVisible();
    // The editor keeps the focus the click gave it; the card offers the room's own statement.
    await page.keyboard.press("ControlOrMeta+Home");
    await expect(page.locator(".cm-activeLine")).not.toContainText(`id=${bed.id}`);
    await card.getByRole("button", { name: "Jump to source" }).click();
    await expect(page.locator(".cm-content")).toBeFocused();
    await expect(page.locator(".cm-activeLine")).toContainText(`room id=${bed.id}`);
  });

  test("the facts line is describe()'s totals for Laneway House, with its source's line count", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    const t = describe(LANEWAY).totals;
    const lines = LANEWAY.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(LANEWAY) ? 1 : 0);
    expect(t.net_floor_area_m2).toBeDefined();
    await expect(page.locator("#facts")).toHaveText(
      `${lines} lines of ArchLang → ${t.rooms} rooms · ${t.net_floor_area_m2} m² (net)`,
    );
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

    await gotoEdit(page);
    await setEditorSource(page, SIMPLE_PLAN);

    const pop = page.locator(".snap-pop");
    const tools = page.locator("#more");
    const toolsOpen = () => tools.evaluate((d) => (d as HTMLDetailsElement).open);
    await openMore(page);
    await page.locator("#saved").click();
    await expect(pop).toBeVisible();
    await expect(pop.locator(".snap-empty")).toBeVisible();
    // The popover belongs to More: the menu stays open beside it.
    expect(await toolsOpen()).toBe(true);

    // A click inside the popover is a click inside More: both stay open.
    await pop.locator(".snap-save").click();
    await expect(pop.locator(".snap-row")).toHaveCount(1);
    await expect(pop.locator(".snap-name")).toHaveText("E2E snapshot");
    await expect(pop).toBeVisible();
    expect(await toolsOpen()).toBe(true);

    // Closing More closes the popover with it: never a popover floating over a closed menu.
    await page.locator("#more > summary").click();
    await expect.poll(toolsOpen).toBe(false);
    await expect(pop).toBeHidden();

    // Escape closes both as well.
    await openMore(page);
    await page.locator("#saved").click();
    await expect(pop).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pop).toBeHidden();
    await expect.poll(toolsOpen).toBe(false);

    // Edit away from the saved plan, then restore it.
    await setEditorSource(page, SIMPLE_PLAN.replace('label "Main"', 'label "Elsewhere"'));
    await expect(page.locator(".cm-content")).toContainText("Elsewhere");

    await openMore(page);
    await page.locator("#saved").click();
    await pop.locator(".snap-restore").first().click();
    await expect(page.locator(".cm-content")).toContainText('label "Main"');
    await expect(page.locator(".cm-content")).not.toContainText("Elsewhere");
    await expect(pop).toBeHidden(); // restoring closes the popover
  });
});

/**
 * View mode's Plan ↔ 3D crossfade (card PG5b): the view coming on screen fades in (`.pg-fade-in`,
 * an opacity animation), and under reduced motion it is instant. Checked by the end state, never
 * the timing: the class came and went, the view is fully opaque, no box moved, the focus stayed on
 * the switch, and the first open's playback still started on its own.
 */
test.describe("Plan ↔ 3D crossfade (card PG5b)", () => {
  /** Record every class the two views wear from now on. */
  const watchFades = (page: Page) =>
    page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __fades: string[] }).__fades = seen;
      for (const id of ["preview", "preview3d"]) {
        const el = document.getElementById(id)!;
        new MutationObserver(() => {
          if (el.classList.contains("pg-fade-in")) seen.push(id);
        }).observe(el, { attributes: true, attributeFilter: ["class"] });
      }
    });
  const fades = (page: Page) => page.evaluate(() => (window as unknown as { __fades: string[] }).__fades);
  const settled = (page: Page, id: string) =>
    page.locator(`#${id}`).evaluate((el) => ({
      opacity: getComputedStyle(el).opacity,
      animations: el.getAnimations().length,
      fading: el.classList.contains("pg-fade-in"),
    }));

  test.describe("normal motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the incoming view fades in and settles fully opaque, the switch keeping the focus", async ({ page }) => {
      await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
      await waitForPlan(page);
      // The first paint never fades: the drawing built into the page is simply there.
      expect(await settled(page, "preview")).toEqual({ opacity: "1", animations: 0, fading: false });
      const stage = (await page.locator(".pz-viewport").boundingBox())!;
      await watchFades(page);
      await page.locator("#view3d").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
      await expect(page.locator("#view3d")).toBeFocused();
      await expect.poll(() => settled(page, "preview3d")).toEqual({ opacity: "1", animations: 0, fading: false });
      expect(await fades(page)).toEqual(["preview3d"]);
      // The first open's playback starts on its own, as it does without the fade.
      const scrub = page.locator('#preview3d [data-role="scrub"]');
      await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeLessThan(0.9);
      // Back to the drawing: it fades in too, into the same box.
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("#viewPlan")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#preview")).toHaveClass(/\bactive\b/);
      await expect(page.locator("#viewPlan")).toBeFocused();
      await expect.poll(() => settled(page, "preview")).toEqual({ opacity: "1", animations: 0, fading: false });
      expect(await fades(page)).toEqual(["preview3d", "preview"]);
      expect(await page.locator(".pz-viewport").boundingBox(), "no layout shift").toEqual(stage);
    });

    test("a `&3d` link's first paint never fades (review follow-up)", async ({ page }) => {
      // Recorded from the very first script on: the 3D view opens while the page still boots.
      await page.addInitScript(() => {
        const seen: string[] = [];
        (window as unknown as { __fades: string[] }).__fades = seen;
        new MutationObserver(() => {
          for (const id of ["preview", "preview3d"])
            if (document.getElementById(id)?.classList.contains("pg-fade-in")) seen.push(id);
        }).observe(document, { attributes: true, attributeFilter: ["class"], subtree: true });
      });
      await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
      await expect(page.locator("html[data-booting]")).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
      expect(await fades(page), "no fade on the first paint").toEqual([]);
      expect(await settled(page, "preview3d")).toEqual({ opacity: "1", animations: 0, fading: false });
    });

    test("a quick Plan → 3D → Plan leaves no fade class behind (review follow-up)", async ({ page }) => {
      await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
      await waitForPlan(page);
      // Both presses inside one task: the 3D view is hidden long before its 180 ms fade ends.
      await page.evaluate(() => {
        document.getElementById("view3d")!.click();
        document.getElementById("viewPlan")!.click();
      });
      await expect(page.locator("#preview")).toHaveClass(/\bactive\b/);
      await expect.poll(() => settled(page, "preview")).toEqual({ opacity: "1", animations: 0, fading: false });
      await expect(page.locator(".pg-fade-in")).toHaveCount(0);
      // …so a later edit-mode tab change fades nothing.
      await page.locator("#sourceToggle").click();
      await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
      await page.locator("#tab-preview3d").click();
      await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
      await expect(page.locator(".pg-fade-in")).toHaveCount(0);
    });

    test("edit mode's tabs never fade", async ({ page }) => {
      await gotoEdit(page);
      await watchFades(page);
      await page.locator("#tab-preview3d").click();
      await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
      await page.locator("#tab-facts").click();
      await page.locator("#tab-preview").click();
      expect(await fades(page)).toEqual([]);
    });
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the switch is instant: no fade class, no animation, either way", async ({ page }) => {
      await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
      await waitForPlan(page);
      await watchFades(page);
      await page.locator("#view3d").click();
      await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
      expect(await settled(page, "preview3d")).toEqual({ opacity: "1", animations: 0, fading: false });
      await page.locator("#viewPlan").click();
      await expect(page.locator("#preview")).toHaveClass(/\bactive\b/);
      expect(await settled(page, "preview")).toEqual({ opacity: "1", animations: 0, fading: false });
      expect(await fades(page)).toEqual([]);
      await expect(page.locator("#viewPlan")).toBeFocused();
    });
  });
});
