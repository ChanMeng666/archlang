import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
// The package's own software-WebGL flags (its replay tests render with the same ones); the one
// browser-free module of the package, so the specs' typecheck never pulls its Node entry.
import { SWIFTSHADER_ARGS } from "../../packages/archlang-3d/src/replay/swiftshader.js";
import { srcFromHash } from "../src/share.js";
import {
  BROKEN_PLAN,
  chooseLink,
  openMore,
  openShare,
  pickPlan,
  setEditorSource,
  shareHash,
  SIMPLE_PLAN,
  waitFor3d,
  waitForPlan,
} from "./fixtures.js";

/**
 * The "3D preview" tab (card A5): the separate archlang-3d package's replay of the editor's plan,
 * loaded on the tab's first open. Its frames are a function of the replay time (`seek(t)`), so two
 * seeks of one `t` give one frame hash; a plan the package refuses shows the refusal, never a
 * crash; and the chunks the page loads at startup carry no 3D code and grow by nothing 3D-sized.
 *
 * WebGL in headless Chromium: the package's own pinned software renderer (SwiftShader).
 */
/*
 * It opens in either mode: from the stage's Plan | 3D switch in view mode, from the 3D tab in edit
 * mode (ruling PG-D3: one control per mode; `open3d` uses whichever). A case that opens Facts or
 * Checks, or types into the editor, loads its plan with `&edit` (edit mode); the rest
 * stay in view mode, the default a visitor meets.
 */
test.use({ launchOptions: { args: SWIFTSHADER_ARGS } });

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
// The PS-D12 line and the limits line (public-surfaces card X1), as the package exports them.
const LABEL =
  "Same source, plan and 3D preview. The 3D preview is extruded from the same .arch file by the separate archlang-3d package, and checked against the plan: every 3D element comes from the plan's elements, and every solid is closed.";
const LIMITS =
  "3D preview: walls, openings, floors, stairs and furniture in flat colours; no pitched roofs yet, and no sections, elevations or BIM.";

interface Handle {
  seek: (t: number) => void;
  frameHash: () => Promise<string>;
  ready: Promise<void>;
}
type W = Window & { __preview3d?: Handle };
/** `W` with the free camera's view, for the storey counts. */
type WithView = Window & { __preview3d?: Handle & { view?: { storeys: number; shown: number } } };

async function hashAt(page: Page, t: number): Promise<string> {
  return page.evaluate(async (x) => {
    const h = (window as W).__preview3d as Handle;
    h.seek(x);
    return h.frameHash();
  }, t);
}

test.describe("3D preview tab", () => {
  test("loads on first open only, labels itself, and its frames are a function of t", async ({ page }) => {
    const chunks: string[] = [];
    page.on("request", (r) => {
      if (/\/assets\/preview3d-[^/]+\.js$/.test(r.url())) chunks.push(r.url());
    });
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    expect(chunks, "the 3D chunk is not fetched before the tab opens").toEqual([]);

    await page.locator("#view3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".tabview.active")).toHaveCount(1);
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    await expect(page.locator("#preview3d .p3d-limits")).toHaveText(LIMITS);
    await expect(page.locator("#preview3d .p3d-label a")).toHaveAttribute("href", "https://archlang.uk/3d");
    await expect(page.locator("#preview3d .p3d-label a")).toHaveText("What it shows");
    const canvas = page.locator("#preview3d canvas");
    await expect(canvas).toBeVisible();
    expect(chunks.length, "the 3D chunk loads on the first open").toBe(1);

    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    // Stop the play-through so only the seeks below draw.
    await page.locator('#preview3d [data-role="scrub"]').evaluate((el: HTMLInputElement) => {
      el.value = "0.5";
      el.dispatchEvent(new Event("input"));
    });

    const a = await hashAt(page, 0.6);
    const end = await hashAt(page, 1);
    const b = await hashAt(page, 0.6);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b, "two seeks of one t give one frame").toBe(a);
    expect(end, "a different t is a different frame").not.toBe(a);
    // No facts laid over the canvas (PG-D4): the page's own facts line says them. (The package's
    // replay HTML keeps its strip: `packages/archlang-3d/e2e/replay.e2e.ts`.)
    await expect(page.locator("#preview3d .p3d-strip")).toHaveCount(0);
    await expect(page.locator("#facts")).toContainText(/[\d.]+ m² \(net\)/);
    // The canvas drew something: not one flat colour.
    const colours = await page.evaluate(() => {
      const c = document.querySelector("#preview3d canvas") as HTMLCanvasElement;
      const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length && seen.size < 50; i += 4 * 97)
        seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
      return seen.size;
    });
    expect(colours).toBeGreaterThan(3);

    // Away and back: the chunk is not fetched again.
    await page.locator("#viewPlan").click();
    await page.locator("#view3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    expect(chunks.length, "the 3D chunk is fetched once").toBe(1);
  });

  test("the session's first open plays once, then turns until the first touch; later opens are the end frame (PG-D4)", async ({
    page,
  }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    const camera = () => page.evaluate(() => (window as Viewed).__preview3d?.view?.camera);
    // The replay plays from the start on its own, about 6 s, to the end.
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeLessThan(0.9);
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 20_000 }).toBe(1);
    // Then the turntable: the view is taken from the replay and keeps turning.
    await expect.poll(camera, { timeout: 10_000 }).toBe("free");
    const a = await current(page);
    await expect.poll(() => current(page), { timeout: 10_000 }).not.toBe(a);
    // The first touch (a press on the canvas, no drag) stops it for good.
    await page.locator("#preview3d canvas").click();
    const held = await current(page);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(150);
      expect(await current(page), `still, frame ${i}`).toBe(held);
    }
    // Away and back, in the same page: the view the touch left, nothing playing or turning.
    await page.locator("#viewPlan").click();
    await page.locator("#view3d").click();
    await page.waitForTimeout(400);
    expect(await current(page), "still where the touch left it").toBe(held);

    // A later open in the same session: a reload keeps the tab's session, and the hash's `&3d`
    // (the 3D view was on) opens the page straight on the 3D preview: the end frame, unplayed.
    expect(await page.evaluate(() => location.hash)).toMatch(/&3d$/);
    await page.reload();
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    // The settled iso view at once: t = 1, and it stays there (nothing plays on its own).
    await expect(scrub).toHaveValue("1");
    const opened = await current(page);
    await page.waitForTimeout(400);
    await expect(scrub).toHaveValue("1");
    expect(await current(page), "no playback or turntable on a later open").toBe(opened);
    expect(await camera()).toBe("replay");
    expect(await hashAt(page, 1), "the frame it opens on is the end frame").toBe(opened);
    // Replay plays from the start.
    await page
      .locator("#preview3d")
      .getByRole("button", { name: /^Replay/ })
      .click();
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeLessThan(0.9);
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.05);
  });

  test("a plan the package refuses shows the refusal, not a crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/${await shareHash(BROKEN_PLAN)}&edit`);
    await expect(page.locator("#editor .cm-content")).toBeVisible();
    await page.locator("#tab-preview3d").click();
    const message = page.locator("#preview3d .p3d-message");
    await expect(message).toBeVisible();
    await expect(message).toContainText("No 3D preview: The plan does not resolve");
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    await expect(page.locator("#preview3d canvas")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("view mode opens it from the stage's switch alone, labelled as the 3D decision record says", async ({
    page,
  }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    // One entry point (ruling PG-D3): no menu item and no visible tab opens it.
    for (const open of [openMore, openShare]) {
      await open(page);
      await expect(page.locator(":is(#more, #share)").getByRole("button", { name: /3D/ })).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    await expect(page.locator("#tab-preview3d")).toBeHidden();
    // The product word (preview-and-remodel D5): "3D preview", in the switch's description.
    await expect(page.locator("#view3d")).toHaveAttribute("title", /3D preview/);
    await page.locator("#view3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    // Still view mode: the 3D preview needs no editor.
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator(".cm-content")).toHaveCount(0);
  });
});

/**
 * Press Replay and wait until the playback has left the end frame the tab opens on (card X1): the
 * playback cases below start here.
 */
async function replay(page: Page): Promise<void> {
  const scrub = page.locator('#preview3d [data-role="scrub"]');
  await page
    .locator("#preview3d")
    .getByRole("button", { name: /^Replay/ })
    .click();
  await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeLessThan(0.5);
}

/**
 * Open the 3D preview through the one control the mode has (ruling PG-D3): the stage's switch in
 * view mode, the 3D tab in edit mode. Then wait until a replay is mounted and its drawing is ready.
 */
async function open3d(page: Page): Promise<void> {
  const editing = (await page.locator("html").getAttribute("data-mode")) === "edit";
  await page.locator(editing ? "#tab-preview3d" : "#view3d").click();
  await page.waitForFunction(() => (window as W).__preview3d !== undefined);
  await page.evaluate(async () => {
    await (window as W).__preview3d?.ready;
  });
}

test.describe("3D preview tab follows the editor", () => {
  test("the storey switcher drives it: no selection is all storeys, L2 is storey 2 alone", async ({ page }) => {
    await page.goto("/#edit");
    await waitForPlan(page);
    await pickPlan(page, "Townhouse (3 levels)");
    await waitForPlan(page);
    await open3d(page);
    const tab = page.locator("#preview3d");
    const canvas = page.locator("#preview3d canvas");
    await expect(tab).toHaveAttribute("data-view", "all");
    await expect(canvas).toHaveAttribute("aria-label", /\(all storeys\)/);
    // No storey picked: the 3D tab shows them all, so the switcher presses "All" (card PG5b), its
    // first button there, and no storey; every other tab shows the lowest storey, underlines L1 and
    // has no "All".
    const pressed = page.locator('#storeys button[aria-pressed="true"]');
    await expect(pressed).toHaveText(["All"]);
    await page.locator("#tab-facts").click();
    await expect(pressed).toHaveText("L1");
    await expect(page.locator('#storeys button[data-level="all"]')).toHaveCount(0);
    await page.locator("#tab-preview3d").click();
    await expect(pressed).toHaveText(["All"]);
    await expect(tab).toHaveAttribute("data-view", "all");
    const all = await hashAt(page, 1);

    await page.locator("#storeys button", { hasText: "L2" }).click();
    await expect(tab).toHaveAttribute("data-view", "L2");
    await expect(pressed).toHaveText("L2");
    await expect(canvas).toHaveAttribute("aria-label", /\(storey L2\)/);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    expect(await hashAt(page, 1), "storey 2 alone is not the combined view").not.toBe(all);

    // Another tab and back: the storey holds, and the tab redraws.
    await page.locator("#tab-facts").click();
    await page.locator("#tab-preview3d").click();
    await expect(tab).toHaveAttribute("data-view", "L2");
  });

  test("in view mode the one storey switcher, under Plan | 3D, drives both views", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickPlan(page, "Townhouse (3 levels)");
    await waitForPlan(page);
    const storeys = page.locator("#storeys");
    // One switcher, wherever the stage is: the same element over the drawing and over the 3D view.
    await expect(page.locator('[role="group"][aria-label="Storey"]')).toHaveCount(1);
    const onPlan = (await storeys.boundingBox())!;
    const plan = await page.locator(".pz-stage svg").innerHTML();
    await open3d(page);
    await expect(storeys).toBeVisible();
    const on3d = (await storeys.boundingBox())!;
    expect(on3d.x).toBe(onPlan.x);
    expect(on3d.y).toBe(onPlan.y);
    const sw = (await page.locator(".stage-switch").boundingBox())!;
    expect(on3d.y, "just under the switch").toBeGreaterThanOrEqual(sw.y + sw.height);
    // L2 from the 3D view: storey 2 alone there…
    await storeys.getByRole("button", { name: /^level 2/ }).click();
    await expect(page.locator("#preview3d")).toHaveAttribute("data-view", "L2");
    // …and the drawing followed it: back on Plan, storey 2 is pressed and drawn.
    await page.locator("#viewPlan").click();
    await expect(storeys.locator('button[aria-pressed="true"]')).toHaveText("L2");
    await expect.poll(() => page.locator(".pz-stage svg").innerHTML()).not.toBe(plan);
    await expect(page.locator("#facts")).toContainText("level 2");
    // L3 from the drawing: the 3D view follows when it comes back.
    await storeys.getByRole("button", { name: /^level 3/ }).click();
    await open3d(page);
    await expect(page.locator("#preview3d")).toHaveAttribute("data-view", "L3");
  });

  // Card PG5b: with the package's cut-away gone, the page's switcher brings the whole building back.
  // Over the 3D preview it has "All" first, pressed while no storey is picked; L2 then All is the
  // combined view again, frame for frame; the facts line says it is every storey's; the drawing,
  // one storey's sheet, has no "All" and comes back on the storey last picked.
  for (const mode of ["view", "edit"] as const) {
    test.describe(`All, ${mode} mode (card PG5b)`, () => {
      test.use({ reducedMotion: "reduce" });
      test(`All brings the combined building back after L2, in ${mode} mode`, async ({ page }) => {
        await page.goto(mode === "edit" ? "/#edit" : "/");
        await waitForPlan(page);
        await pickPlan(page, "Townhouse (3 levels)");
        await waitForPlan(page);
        const storeys = page.locator("#storeys");
        const all = storeys.locator('button[data-level="all"]');
        const pressed = storeys.locator('button[aria-pressed="true"]');
        const facts = page.locator("#facts");
        // The drawing: L1 L2 L3, no "All" (the drawing has no combined state), the facts L1's.
        await expect(storeys.locator("button")).toHaveText(["L1", "L2", "L3"]);
        await expect(facts).toContainText("· level 1");

        await open3d(page);
        const tab = page.locator("#preview3d");
        await expect(tab).toHaveAttribute("data-view", "all");
        await expect(storeys.locator("button")).toHaveText(["All", "L1", "L2", "L3"]);
        await expect(all).toHaveAttribute("aria-pressed", "true");
        await expect(all).toHaveAccessibleName("All storeys");
        await expect(pressed).toHaveCount(1);
        // No storey picked, all storeys shown: the facts are the building's, not level 1's.
        await expect(facts).toContainText("· all 3 storeys");
        await expect(facts).not.toContainText("level 1");
        const combinedFacts = await facts.textContent();
        await page.evaluate(async () => {
          await (window as W).__preview3d?.ready;
        });
        const combined = await hashAt(page, 1);
        expect(await page.evaluate(() => (window as WithView).__preview3d?.view?.storeys)).toBe(3);

        await storeys.getByRole("button", { name: /^level 2/ }).click();
        await expect(tab).toHaveAttribute("data-view", "L2");
        await expect(pressed).toHaveText(["L2"]);
        await expect(facts).toContainText("· level 2");
        await page.evaluate(async () => {
          await (window as W).__preview3d?.ready;
        });
        expect(await hashAt(page, 1), "storey 2 alone").not.toBe(combined);

        await all.click();
        await expect(tab).toHaveAttribute("data-view", "all");
        await expect(all).toHaveAttribute("aria-pressed", "true");
        await expect(pressed).toHaveCount(1);
        await expect(facts).toHaveText(combinedFacts ?? "");
        await page.evaluate(async () => {
          await (window as W).__preview3d?.ready;
        });
        expect(
          await page.evaluate(() => (window as WithView).__preview3d?.view?.storeys),
          "every storey in the view",
        ).toBe(3);
        expect(await hashAt(page, 1), "the combined view, frame for frame").toBe(combined);

        // Back on the drawing: no "All", and the storey last picked (L2), its facts.
        if (mode === "edit") await page.locator("#tab-preview").click();
        else await page.locator("#viewPlan").click();
        await expect(storeys.locator("button")).toHaveText(["L1", "L2", "L3"]);
        await expect(pressed).toHaveText(["L2"]);
        await expect(facts).toContainText("· level 2");
      });
    });
  }

  test("an edit while playing goes on from the current t, not back to the start", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&edit`);
    await waitForPlan(page);
    await open3d(page);
    await replay(page);
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.15);
    await page.evaluate(() => {
      (window as W & { __before?: unknown }).__before = (window as W).__preview3d;
    });
    const before = Number(await scrub.inputValue());
    await setEditorSource(page, SIMPLE_PLAN.replace("6000x4000", "6000x4100"));
    await page.waitForFunction(() => (window as W & { __before?: unknown }).__before !== (window as W).__preview3d);
    expect(Number(await scrub.inputValue())).toBeGreaterThanOrEqual(before);
  });

  test("leaving the tab stops playback; coming back resumes it", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&edit`);
    await waitForPlan(page);
    await open3d(page);
    await replay(page);
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.05);
    await page.locator("#tab-checks").click();
    const parked = Number(await scrub.inputValue());
    await page.waitForTimeout(600);
    expect(Number(await scrub.inputValue()), "no frames while hidden").toBe(parked);
    await page.locator("#tab-preview3d").click();
    await expect.poll(async () => Number(await scrub.inputValue())).toBeGreaterThan(parked);
  });

  test("a plan that resolves but the core will not draw shows the core's message", async ({ page }) => {
    // Resolves cleanly, then `compile()` refuses it at the drawing budget (E_DRAWING_LIMIT).
    const tooBig = `plan "Budget" {
  units mm
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=a at (0,0) size 6000x4000 label "Hall"
  for i in 0..200 { escalator at (0, i * 2000) size 300000x1200 dir up }
}`;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/${await shareHash(tooBig)}&edit`);
    await expect(page.locator("#editor .cm-content")).toBeVisible();
    await page.locator("#tab-preview3d").click();
    const message = page.locator("#preview3d .p3d-message");
    await expect(message).toContainText("No 3D preview: The drawing is estimated at");
    await expect(message).not.toContainText("viewBox");
    expect(errors).toEqual([]);
  });
});

type Viewed = Window & {
  __preview3d?: Handle & { view?: { camera: string; shown: number; storeys: number } };
};

/** The hash of the frame on the canvas now (no seek: whatever the last draw left). */
const current = (page: Page): Promise<string> =>
  page.evaluate(() => ((window as Viewed).__preview3d as Handle).frameHash());

/**
 * Press a preset: they sit in the `View ▾` popover (the package's compact toolbar, card PG1), so
 * open it first when it is shut. A preset shuts it again.
 */
async function preset(page: Page, name: string | RegExp): Promise<void> {
  const pop = page.locator("#preview3d .archlang-views-presets");
  if (await pop.isHidden()) {
    await page
      .locator("#preview3d")
      .getByRole("button", { name: /^View presets/ })
      .click();
  }
  await page.locator("#preview3d").getByRole("button", { name }).click();
  await expect(pop, "a preset shuts the popover").toBeHidden();
}

/** A preset's button, found whether its popover is open or shut (for `aria-pressed`). */
const presetBtn = (page: Page, name: string) => page.locator(`#preview3d [data-preset="${name}"]`);

/** Drag across the middle of the 3D canvas with the left button. */
async function drag(page: Page, dx: number, dy: number): Promise<void> {
  const box = await page.locator("#preview3d canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/**
 * The free camera (card CR4, CR-D2): the view turns, zooms and pans after (or during) the replay;
 * the presets and Reset are pure functions of the scene, so Iso and Reset give back the end frame's
 * very hash. Reduced motion: the tab shows the end at once and the orbit has no damping, so every
 * move lands on the frame before the next assertion.
 */
test.describe("3D preview tab: the free camera", () => {
  test.use({ reducedMotion: "reduce" });

  test("a drag, a key and the wheel turn the view; Iso and Reset return the end frame exactly", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    await expect(page.locator('#preview3d [data-role="scrub"]')).toHaveValue("1");
    const end = await hashAt(page, 1);
    const button = (name: string | RegExp) => page.locator("#preview3d").getByRole("button", { name });
    const camera = () => page.evaluate(() => (window as Viewed).__preview3d?.view?.camera);

    // A plain click (no movement) takes nothing: the frame and the holder stay (red-team round 1).
    await page.locator("#preview3d canvas").click();
    expect(await camera(), "a click is not a drag").toBe("replay");
    expect(await current(page)).toBe(end);

    await drag(page, 160, 40);
    const dragged = await current(page);
    expect(dragged, "a drag turns the view").not.toBe(end);
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.camera)).toBe("free");
    await preset(page, "Iso view: the replay's end view");
    expect(await current(page), "Iso is the end camera, pixel for pixel").toBe(end);
    await expect(presetBtn(page, "iso")).toHaveAttribute("aria-pressed", "true");

    await drag(page, -120, -30);
    await expect(presetBtn(page, "iso"), "a drag leaves the preset").toHaveAttribute("aria-pressed", "false");
    expect(await current(page)).not.toBe(end);
    await button(/^Reset the view/).click();
    expect(await current(page), "Reset is the replay's own end frame").toBe(end);

    // The keyboard, on the focused canvas: an arrow turns, − zooms out.
    await page.locator("#preview3d canvas").focus();
    await page.keyboard.press("ArrowLeft");
    const turned = await current(page);
    expect(turned, "an arrow key turns the view").not.toBe(end);
    await page.keyboard.press("Minus");
    expect(await current(page), "− zooms").not.toBe(turned);

    // The wheel zooms; the presets are views of their own.
    await preset(page, "Iso view: the replay's end view");
    const box = await page.locator("#preview3d canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    expect(await current(page), "the wheel zooms").not.toBe(end);
    const seen = new Set([end]);
    for (const name of [/^Top view/, /^View from north/, /^View from east/, /^View from south/, /^View from west/]) {
      await preset(page, name);
      seen.add(await current(page));
    }
    expect(seen.size, "five presets, five frames, none the end frame").toBe(6);

    // `__seek` keeps its meaning: the replay's own frame at t.
    expect(await hashAt(page, 1)).toBe(end);
  });

  test("Replay under reduced motion stays on the end frame (card X1)", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect(scrub).toHaveValue("1");
    const end = await current(page);
    await page
      .locator("#preview3d")
      .getByRole("button", { name: /^Replay/ })
      .click();
    await page.waitForTimeout(400);
    await expect(scrub).toHaveValue("1");
    expect(await current(page), "no motion: the end frame").toBe(end);
  });

  // Card PG5b ④: one storey control in the 3D view, the page's switcher. The package toolbar's own
  // "Storeys shown" cut-away is left out (`storeys: false`); the view's cut-away itself is unchanged,
  // so it is driven here through the view, as the replay HTML's buttons drive it.
  test("one storey control: no Storeys shown buttons; the view still hides the upper storeys", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await pickPlan(page, "Townhouse (3 levels)");
    await waitForPlan(page);
    await open3d(page);
    await expect(page.locator("#preview3d")).toHaveAttribute("data-view", "all");
    await expect(page.locator('#preview3d [data-role="scrub"]')).toHaveValue("1");
    const end = await hashAt(page, 1);
    await expect(page.locator("#preview3d [data-storeys]")).toHaveCount(0);
    await expect(page.locator("#preview3d").getByRole("group", { name: "Storeys shown" })).toHaveCount(0);
    // The page's switcher is the one storey control on screen.
    await expect(page.locator("#storeys")).toBeVisible();
    await expect(page.locator('[role="group"][aria-label="Storey"]')).toHaveCount(1);
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.storeys)).toBe(3);

    const show = (k: number) =>
      page.evaluate(
        (n) =>
          (
            window as unknown as { __preview3d?: { view?: { showStoreys(k: number): void } } }
          ).__preview3d?.view?.showStoreys(n),
        k,
      );
    await show(1);
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.shown)).toBe(1);
    const ground = await current(page);
    expect(ground, "the storeys above the ground floor are hidden").not.toBe(end);
    await show(2);
    const two = await current(page);
    expect(new Set([end, ground, two]).size).toBe(3);
    await show(3);
    expect(await current(page), "every storey shown again is the end frame").toBe(end);
  });

  test("an edit keeps the view the user chose", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&edit`);
    await waitForPlan(page);
    await open3d(page);
    await preset(page, /^Top view/);
    await page.evaluate(() => {
      (window as Viewed & { __before?: unknown }).__before = (window as Viewed).__preview3d;
    });
    await setEditorSource(page, SIMPLE_PLAN.replace("6000x4000", "6000x4100"));
    await page.waitForFunction(
      () => (window as Viewed & { __before?: unknown }).__before !== (window as Viewed).__preview3d,
    );
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.camera)).toBe("top");
    await expect(presetBtn(page, "top"), "the toolbar shows the restored view").toHaveAttribute("aria-pressed", "true");
    // The tab redraws the edited plan from the kept view once its drawing is ready (`drawAt`, queued
    // on `ready` before this wait): that frame is the edited plan's own Top view.
    await page.evaluate(async () => {
      await (window as Viewed).__preview3d?.ready;
    });
    const kept = await current(page);
    await preset(page, /^Top view/);
    expect(await current(page), "the kept view is a fresh Top of the edited plan").toBe(kept);
    // And not merely the plan's end frame.
    expect(kept).not.toBe(await hashAt(page, 1));
  });
});

/**
 * A preset takes the view as a drag does (red-team round 1): pressed while the replay plays, it pauses
 * the playback and holds, instead of lasting one frame. Autoplay on, no reduced motion.
 */
test.describe("3D preview tab: a preset during playback", () => {
  test("pauses the playback and holds the preset", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    await replay(page);
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.05);
    // Opening `View ▾` takes nothing: the playback goes on until the preset is pressed.
    await preset(page, /^Top view/);
    const parked = Number(await scrub.inputValue());
    expect(parked, "still playing when pressed").toBeLessThan(1);
    const held = await current(page);
    // Several animation frames later: the same frame, the same t, the same holder.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(150);
      expect(await current(page), `frame ${i}`).toBe(held);
    }
    expect(Number(await scrub.inputValue()), "the playback paused").toBe(parked);
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.camera)).toBe("top");
    await expect(presetBtn(page, "top")).toHaveAttribute("aria-pressed", "true");
    // A fresh press, now that the playback is paused, draws the same frame.
    await preset(page, /^Top view/);
    expect(await current(page)).toBe(held);
  });
});

test.describe("3D preview tab: grabbing the view", () => {
  test("pauses the playback", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await open3d(page);
    await replay(page);
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect.poll(async () => Number(await scrub.inputValue()), { timeout: 10_000 }).toBeGreaterThan(0.05);
    const box = await page.locator("#preview3d canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    // The first movement takes the view (a press alone does not).
    await page.mouse.move(x + 60, y + 10, { steps: 4 });
    const parked = Number(await scrub.inputValue());
    expect(parked, "still playing when grabbed").toBeLessThan(1);
    await page.waitForTimeout(600);
    expect(Number(await scrub.inputValue()), "no replay frames while the view is held").toBe(parked);
    await page.mouse.up();
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.camera)).toBe("free");
  });
});

/**
 * Plan | 3D (public-surfaces card X5): view mode's switch on the stage between the drawing and the
 * 3D preview, which drives the Plan and 3D tabs (edit mode's control, which replaces it there), the
 * `&3d` deep link, the hash flag a copied full link keeps, the plan gallery and the knobs in 3D, and
 * the GLB (Share's since card PG4). Reduced motion, so the end frame is drawn at once and nothing plays on its own.
 */
test.describe("Plan | 3D on the stage (card X5)", () => {
  test.use({ reducedMotion: "reduce" });

  const planBtn = (page: Page) => page.locator("#viewPlan");
  const threeBtn = (page: Page) => page.locator("#view3d");
  const hash = (page: Page) => page.evaluate(() => location.hash);
  /** Wait until a replay is mounted (a new one, when `fresh` marked the old) and drawn. */
  async function mounted(page: Page, fresh = false): Promise<void> {
    if (fresh) await page.waitForFunction(() => !(window as Marked).__preview3d?.__old);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
  }
  /** Mark the mounted replay, so `mounted(page, true)` waits for the next one. */
  const markOld = (page: Page) =>
    page.evaluate(() => {
      const h = (window as Marked).__preview3d;
      if (h) h.__old = true;
    });
  /** The replay is on its end frame: t = 1 on the scrubber, and the canvas is that frame. */
  async function atEndFrame(page: Page): Promise<void> {
    await expect(page.locator('#preview3d [data-role="scrub"]')).toHaveValue("1");
    const shown = await current(page);
    expect(await hashAt(page, 1), "the frame on screen is the end frame").toBe(shown);
  }

  test("the switch flips the stage, keeps its focus, and the hash says which view is on", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator(".stage-switch")).toBeVisible();
    await expect(page.locator(".stage-switch")).toHaveAttribute("role", "group");
    await expect(planBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(threeBtn(page)).toHaveAttribute("aria-pressed", "false");
    // On the stage, not in the header: the header keeps its controls (PS-D3).
    await expect(page.locator("header .stage-switch")).toHaveCount(0);
    const stage = await page.locator("#preview").boundingBox();
    const chip = await page.locator(".stage-switch").boundingBox();
    expect(chip && stage && chip.y >= stage.y && chip.x >= stage.x, "over the stage's top-left corner").toBe(true);

    await threeBtn(page).click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    await expect(threeBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(planBtn(page)).toHaveAttribute("aria-pressed", "false");
    await mounted(page);
    await atEndFrame(page);
    // The drawing's own overlays leave with it: the hover tip and the room card are the plan's.
    await expect(page.locator(".pz-viewport")).toBeHidden();
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    expect(await hash(page)).toMatch(/^#z=[A-Za-z0-9_-]+&3d$/);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");

    await planBtn(page).click();
    await expect(page.locator("#preview")).toHaveClass(/active/);
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    expect(await hash(page)).toMatch(/^#z=[A-Za-z0-9_-]+$/);

    // The keyboard: both are buttons in the tab order; the one pressed keeps the focus, whichever
    // view comes up under it.
    await threeBtn(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(threeBtn(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(planBtn(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#preview")).toHaveClass(/active/);
    await expect(planBtn(page)).toBeFocused();
  });

  test("`&3d` opens view mode on the 3D preview, at the end frame", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(threeBtn(page)).toHaveAttribute("aria-pressed", "true");
    await mounted(page);
    await atEndFrame(page);
    await expect(page.locator("#preview3d canvas")).toHaveAttribute("aria-label", /^E2E/);
    expect(await hash(page)).toMatch(/^#z=[A-Za-z0-9_-]+&3d$/);
  });

  test("`#3d` alone opens the plan a hash-less visit opens, on the 3D preview", async ({ page }) => {
    await page.goto("/#3d");
    await waitFor3d(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await mounted(page);
    await atEndFrame(page);
    await expect(page.locator("#gallery .gal-card[aria-current='true']")).toHaveCount(1);
  });

  test("`&3d&edit` opens the editor beside the 3D preview", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d&edit`);
    await waitFor3d(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await mounted(page);
    expect(await hash(page)).toMatch(/^#z=[A-Za-z0-9_-]+&3d&edit$/);
  });

  test("another plan from the gallery, in 3D, is rebuilt at its end frame, twice", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await mounted(page);
    // Leave the end frame, so an end frame after the switch is the rebuild's.
    await page.locator('#preview3d [data-role="scrub"]').evaluate((el: HTMLInputElement) => {
      el.value = "0.3";
      el.dispatchEvent(new Event("input"));
    });
    const canvas = page.locator("#preview3d canvas");
    const before = await canvas.getAttribute("aria-label");
    await markOld(page);
    const label = await page.locator("#gallery a.gal-card").first().getAttribute("data-label");
    await pickPlan(page, label ?? "");
    await mounted(page, true);
    await expect(canvas).not.toHaveAttribute("aria-label", before ?? "");
    await atEndFrame(page);
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    expect(await hash(page)).toMatch(/&3d$/);

    await markOld(page);
    const other = await page.locator("#gallery a.gal-card").nth(1).getAttribute("data-label");
    await pickPlan(page, other ?? "");
    await mounted(page, true);
    await atEndFrame(page);
  });

  test("the knobs sit over the 3D preview, and letting one go rebuilds it", async ({ page }) => {
    const src = readFileSync(new URL("../../examples/knob-flat.arch", import.meta.url), "utf8").replace(/\r\n?/g, "\n");
    await page.goto(`/${await shareHash(src)}&3d`);
    await waitFor3d(page);
    await mounted(page);
    const knobs = page.locator("#preview3d details.knobs");
    await expect(knobs).toBeVisible();
    await expect(knobs.locator("summary")).toHaveText("Knobs (3)");
    await markOld(page);
    await knobs.locator('input[type="range"][data-knob="LIVING"]').fill("6000");
    await mounted(page, true);
    await atEndFrame(page);
    await expect
      .poll(async () => srcFromHash(await hash(page)))
      .toBe(src.replace("let LIVING = 4500", "let LIVING = 6000"));
    expect(await hash(page)).toMatch(/&3d$/);
    // Back on the drawing, the knobs come with it.
    await planBtn(page).click();
    await expect(page.locator(".pz-viewport details.knobs")).toBeVisible();
  });

  test("each mode has one Plan/3D control, the switch or the tabs, and the two agree", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    // View mode: the switch, and no tab on screen.
    await expect(page.locator(".stage-switch")).toBeVisible();
    await expect(page.locator(".tab:visible")).toHaveCount(0);
    await threeBtn(page).click();
    await mounted(page);
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    // Edit mode: the tabs replace the switch; they open on the view the switch left, `&3d` kept.
    await page.locator("#sourceToggle").click();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect(page.locator(".stage-switch")).toBeHidden();
    await expect(page.locator("#tab-preview3d")).toBeVisible();
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    expect(await hash(page)).toMatch(/&3d&edit$/);
    await page.locator("#tab-preview").click();
    await expect(page.locator("#tab-preview")).toBeFocused();
    expect(await hash(page)).toMatch(/^#z=[A-Za-z0-9_-]+&edit$/);
    // Back in view mode, the switch says what the tabs chose.
    await page.locator("#sourceToggle").click();
    await expect(page.locator(".stage-switch")).toBeVisible();
    await expect(planBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(threeBtn(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("the Checks toggle is the drawing's: it leaves with it for the 3D view (rings are 2D)", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    const checks = page.locator(".pz-toolbar #checks");
    await expect(checks).toBeVisible();
    await threeBtn(page).click();
    await mounted(page);
    await expect(checks).toBeHidden();
    await expect(page.locator("#preview3d #checks, #preview3d [data-layer='checks']")).toHaveCount(0);
    await planBtn(page).click();
    await expect(checks).toBeVisible();
  });

  test("a full link copied from the 3D preview keeps `&3d`; from the drawing it does not", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await chooseLink(page, "full");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/#z=[A-Za-z0-9_-]+$/);

    await threeBtn(page).click();
    await mounted(page);
    await chooseLink(page, "full");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/#z=[A-Za-z0-9_-]+&3d$/);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(await srcFromHash(new URL(copied).hash)).toBe(SIMPLE_PLAN);

    // In edit mode too: the edit flag is dropped, the 3D flag kept.
    await page.locator("#sourceToggle").click();
    await expect(page.locator(".cm-content")).toBeVisible();
    await expect.poll(() => hash(page)).toMatch(/&3d&edit$/);
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await chooseLink(page, "full");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/#z=[A-Za-z0-9_-]+&3d$/);
  });

  test("the GLB is Share's (card PG4): written in the page, in a chunk of its own, and said to be unvalidated", async ({
    page,
  }) => {
    const glbChunks: string[] = [];
    page.on("request", (r) => {
      if (/\/assets\/glb-export-[^/]+\.js$/.test(r.url())) glbChunks.push(r.url());
    });
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await mounted(page);
    // Not in the 3D view's floating group any more (ruling PG-D5): one home for every export.
    await expect(page.locator("#preview3d").getByRole("button", { name: /GLB/ })).toHaveCount(0);
    await expect(page.locator("#preview3d .p3d-top")).not.toContainText("GLB");
    await openShare(page);
    const note = page.locator("#share #glbNote");
    await expect(note).toBeVisible();
    await expect(note).toContainText("not validated here");
    await expect(note.locator("code")).toHaveText("npx -y @chanmeng666/archlang-3d build plan.arch -o plan.glb");
    const button = page.locator("#share").getByRole("button", { name: "Download GLB" });
    await expect(button).toHaveAttribute("aria-describedby", "glbNote");
    await expect(button).toHaveAccessibleDescription(
      "The whole plan as a GLB, written in your browser and not validated here. npx -y @chanmeng666/archlang-3d build plan.arch -o plan.glb writes the same file and checks it with the Khronos glTF validator.",
    );
    expect(glbChunks, "the GLB writer is not fetched before the click").toEqual([]);

    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("floorplan.glb");
    const path = await download.path();
    const bytes = readFileSync(path);
    // A GLB: the magic, glTF 2, its declared length, then the JSON chunk.
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    expect(bytes.subarray(16, 20).toString("latin1")).toBe("JSON");
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as {
      asset: { generator: string; version: string };
      nodes: Array<{ name: string }>;
    };
    expect(gltf.asset.version).toBe("2.0");
    // The package's own writer: its fixed generator, the storey group and the room's floor.
    expect(gltf.asset.generator).toMatch(/^archlang-3d \d+\.\d+\.\d+$/);
    const names = gltf.nodes.map((n) => n.name);
    expect(names).toContain("level:L1");
    expect(names.some((n) => n.startsWith("floor:"))).toBe(true);
    expect(glbChunks.length, "the GLB writer loads on the first click").toBe(1);

    // A second click writes the same bytes, from the chunk already in.
    await openShare(page);
    const [again] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(readFileSync(await again.path()).equals(bytes), "same plan, same GLB").toBe(true);
    expect(glbChunks.length).toBe(1);
  });

  test("a shared plan opened on the 3D preview is attributed there too; a bundled example is not", async ({ page }) => {
    // SIMPLE_PLAN is no bundled example: its words came from whoever made the link.
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await mounted(page);
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    const notice = page.locator(".shared-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("written by whoever shared it, not by ArchLang");
    // Above the switch, so the switch never covers it, and the same one in either view.
    const box = await notice.boundingBox();
    const chip = await page.locator(".stage-switch").boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(chip?.y ?? 0);
    await planBtn(page).click();
    await expect(notice).toBeVisible();
    await expect(page.locator(".shared-notice")).toHaveCount(1);

    const bundled = readFileSync(new URL("../../examples/one-room.arch", import.meta.url), "utf8");
    await page.goto(`/${await shareHash(bundled)}&3d`);
    await page.reload();
    await waitFor3d(page);
    await mounted(page);
    await expect(page.locator("#preview3d canvas")).toHaveAttribute("aria-label", /One Room/);
    await expect(page.locator(".shared-notice")).toHaveCount(0);
  });

  test("a plan the 3D package refuses: the message, no GLB button and no knobs in 3D; the switch still works", async ({
    page,
  }) => {
    // Compiles (a knob and a room), but has no walls to raise: E3D_NO_WALLS.
    const noWalls = `plan "No walls" {
  units mm
  let W = 3000   # room width
  room id=r at (0,0) size W x 3000 label "Yard"
}`;
    await page.goto(`/${await shareHash(noWalls)}&3d`);
    await waitFor3d(page);
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    const message = page.locator("#preview3d .p3d-message");
    await expect(message).toBeVisible();
    await expect(message).toContainText("No 3D preview: The plan has no walls");
    await expect(page.locator("#preview3d").getByRole("button", { name: /GLB/ })).toHaveCount(0);
    await expect(page.locator("#preview3d canvas")).toBeHidden();
    await expect(page.locator("details.knobs")).toBeHidden();
    // The caption and the limits line stay; the switch takes the visitor back to the drawing.
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    await planBtn(page).click();
    await expect(page.locator(".pz-stage svg")).toBeVisible();
    await expect(page.locator(".pz-viewport details.knobs")).toBeVisible();
    expect(await hash(page)).not.toMatch(/&3d/);
    await threeBtn(page).click();
    await expect(message).toBeVisible();
  });
});

for (const [width, height, mobile] of [
  [1280, 720, false],
  [390, 740, true],
] as const) {
  test.describe(`Plan | 3D at ${width}x${height} (card X5)`, () => {
    test.use({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce" });

    test("the canvas fills its pane, every control floats inside it, and the ⓘ card fits too", async ({ page }) => {
      const src = readFileSync(new URL("../../examples/knob-flat.arch", import.meta.url), "utf8").replace(
        /\r\n?/g,
        "\n",
      );
      await page.goto(`/${await shareHash(src)}&3d`);
      await waitFor3d(page);
      await page.waitForFunction(() => (window as W).__preview3d !== undefined);
      await page.locator("#preview3d .p3d-info-btn").click();
      await expect(page.locator("#preview3d .p3d-info")).toBeVisible();
      const fit = await page.locator("#preview3d").evaluate((host) => {
        const box = host.getBoundingClientRect();
        const canvas = host.querySelector("canvas") as HTMLCanvasElement;
        const c = canvas.getBoundingClientRect();
        const inside = (s: string) => {
          const r = host.querySelector(s)?.getBoundingClientRect();
          return (
            !!r &&
            r.left >= box.left - 0.5 &&
            r.right <= box.right + 0.5 &&
            r.top >= box.top - 0.5 &&
            r.bottom <= box.bottom + 0.5
          );
        };
        return {
          scroll: host.scrollHeight - host.clientHeight,
          filled: Math.abs(c.width - box.width) <= 1 && Math.abs(c.height - box.height) <= 1,
          buffer: [
            canvas.width,
            canvas.height,
            Math.round(c.width * devicePixelRatio),
            Math.round(c.height * devicePixelRatio),
          ],
          floats: [".p3d-top", ".p3d-foot", ".p3d-scrub", ".p3d-info", ".p3d-limits"].filter((s) => !inside(s)),
          sideways: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(fit.scroll, "the 3D view does not scroll inside its pane").toBeLessThanOrEqual(0);
      expect(fit.filled, "the canvas is the pane's own size").toBe(true);
      const [bw, bh, cw, ch] = fit.buffer as [number, number, number, number];
      expect(
        Math.abs(bw - cw) <= 1 && Math.abs(bh - ch) <= 1,
        `the drawing buffer follows the box: ${fit.buffer}`,
      ).toBe(true);
      expect(fit.floats, "every control and the ⓘ card inside the pane").toEqual([]);
      expect(fit.sideways, "no sideways scroll").toBeLessThanOrEqual(0);
    });
  });
}

test.describe("Plan | 3D on a phone (card X5)", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

  test("the switch is on the stage at touch size, and nothing scrolls sideways in either view", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await expect(page.locator(".stage-switch")).toBeVisible();
    const box = await page.locator("#view3d").boundingBox();
    expect(box?.height ?? 0, "a touch-sized target").toBeGreaterThanOrEqual(38);
    expect(await overflow(), "no sideways scroll on the drawing").toBeLessThanOrEqual(0);

    await page.locator("#view3d").tap();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await expect(page.locator("#preview3d canvas")).toBeVisible();
    expect(await overflow(), "no sideways scroll on the 3D preview").toBeLessThanOrEqual(0);
    const canvas = await page.locator("#preview3d canvas").boundingBox();
    expect((canvas?.x ?? -1) >= 0 && (canvas?.x ?? 0) + (canvas?.width ?? 0) <= 375, "the canvas fits").toBe(true);
    // Everything floats over the canvas, and the switch overlaps none of it: the top-right group
    // starts right of it, the caption's lead sits at the foot.
    const chip = await page.locator(".stage-switch").boundingBox();
    const top = await page.locator("#preview3d .p3d-top").boundingBox();
    const lead = await page.locator("#preview3d .p3d-lead").boundingBox();
    if (!chip || !top || !lead || !canvas) throw new Error("missing a box");
    expect(top.x, "the top-right group clears the switch").toBeGreaterThanOrEqual(chip.x + chip.width);
    expect(lead.y, "the caption's lead is below the switch").toBeGreaterThan(chip.y + chip.height);
    expect(lead.y + lead.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    await expect(page.locator("#preview3d").getByRole("button", { name: /^Reset the view/ })).toBeVisible();
    await expect(page.locator("#preview3d").getByRole("button", { name: /^Replay/ })).toBeVisible();
    // The GLB is Share's (card PG4): none in the 3D view's group.
    await expect(page.locator("#preview3d").getByRole("button", { name: /GLB/ })).toHaveCount(0);
  });
});

/**
 * The 3D stage (playground-minimal card PG1, ruling PG-D4): the canvas is the stage, the controls
 * float over it, and it says it can be turned. Measured where the owner measured it: 1422×676, view
 * mode, `#3d` (the canvas was 402×226, 9% of the viewport).
 */
test.describe("the 3D stage (card PG1)", () => {
  test.use({ viewport: { width: 1422, height: 676 }, reducedMotion: "reduce" });

  test("the canvas covers at least 60% of a 1422×676 viewport in view mode", async ({ page }) => {
    await page.goto("/#3d");
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    const box = await page.locator("#preview3d canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    const share = (box.width * box.height) / (1422 * 676);
    expect(share, `the canvas is ${Math.round(box.width)}×${Math.round(box.height)}`).toBeGreaterThanOrEqual(0.6);
    // Not a fixed 16:9: it takes the pane's own shape.
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeGreaterThan(0.05);
  });

  test("reduced motion: no autoplay and no turntable on the first open, only the end frame", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect(scrub).toHaveValue("1");
    const opened = await current(page);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(250);
      expect(await current(page), `the same frame, ${i}`).toBe(opened);
    }
    await expect(scrub).toHaveValue("1");
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.camera), "nothing took the view").toBe(
      "replay",
    );
    expect(await hashAt(page, 1)).toBe(opened);
  });

  test("the coach mark is shown once, and goes on the first touch", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    const coach = page.locator("#preview3d .p3d-coach");
    await expect(coach).toBeVisible();
    await expect(coach).toHaveText("Drag to turn · scroll to zoom · right-drag to pan");
    await expect(coach.locator("svg")).toHaveCount(1);
    await expect(coach).toHaveAttribute("aria-hidden", "true");
    // The full hint stays the canvas's description, visually hidden.
    const hint = page.locator("#p3d-hint");
    await expect(page.locator("#preview3d canvas")).toHaveAttribute("aria-describedby", "p3d-hint");
    await expect(hint).toContainText("arrow keys turn");
    expect((await hint.boundingBox())?.height ?? 0, "the hint is not a layout row").toBeLessThanOrEqual(1);
    // The coach mark never takes the pointer: a press on the canvas under it reaches the canvas.
    await page.locator("#preview3d canvas").click();
    await expect(coach).toBeHidden();

    // Shown once: a later visit, or another plan, does not show it again.
    await page.reload();
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await expect(page.locator("#preview3d canvas")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(coach).toBeHidden();
  });

  test("the coach mark fades on its own after five seconds", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    const coach = page.locator("#preview3d .p3d-coach");
    await expect(coach).toBeVisible();
    await expect(coach).toBeHidden({ timeout: 8_000 });
  });

  test("the page works with no storage: the coach mark, the view and the controls", async ({ page }) => {
    await page.addInitScript(() => {
      for (const area of ["localStorage", "sessionStorage"] as const) {
        Object.defineProperty(window, area, {
          get() {
            throw new Error("storage blocked");
          },
        });
      }
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await expect(page.locator("#preview3d .p3d-coach")).toBeVisible();
    await expect(page.locator('#preview3d [data-role="scrub"]')).toHaveValue("1");
    expect(errors.filter((m) => /storage|p3d|preview3d/i.test(m))).toEqual([]);
  });

  test("the ⓘ card holds the full caption, the limits line and the link; the lead stays on screen", async ({
    page,
  }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    const lead = page.locator("#preview3d .p3d-lead");
    await expect(lead).toBeVisible();
    // The lead in bold, as PG-D4 has it.
    await expect(lead.locator("strong")).toHaveText("Same source, plan and 3D preview.");
    const card = page.locator("#preview3d .p3d-info");
    const info = page.locator("#preview3d").getByRole("button", { name: /^About the 3D preview/ });
    await expect(card).toBeHidden();
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await info.click();
    await expect(card).toBeVisible();
    await expect(info).toHaveAttribute("aria-expanded", "true");
    await expect(card).toContainText(LABEL);
    await expect(card.locator(".p3d-limits")).toHaveText(LIMITS);
    await expect(card.locator("a")).toHaveText("What it shows");
    await expect(card.locator("a")).toHaveAttribute("href", "https://archlang.uk/3d");
    // The caption and the limits line, nothing else: the GLB note lives beside Share → GLB (card PG4).
    expect(await card.evaluate((c) => [...c.children].map((e) => e.className))).toEqual(["p3d-label", "p3d-limits"]);
    await expect(card).not.toContainText("GLB");
    // The keyboard: Tab from ⓘ goes into the card, to its link; Tab out of the card shuts it.
    await expect(info).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(card.locator("a")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(card, "the focus left the card").toBeHidden();
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await info.click();
    await expect(card).toBeVisible();
    // Escape shuts it and gives the focus back; a press elsewhere shuts it too.
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(info).toBeFocused();
    await info.click();
    await expect(card).toBeVisible();
    await page.locator("#preview3d canvas").click({ position: { x: 300, y: 200 } });
    await expect(card).toBeHidden();
    // No row under the canvas: the caption and the controls all lie over it.
    const canvas = await page.locator("#preview3d canvas").boundingBox();
    const host = await page.locator("#preview3d").boundingBox();
    expect(canvas?.height).toBeCloseTo(host?.height ?? 0, 0);
  });

  test("the canvas says it can be grabbed: grab, and grabbing while pressed", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    const canvas = page.locator("#preview3d canvas");
    const cursor = () => canvas.evaluate((c) => getComputedStyle(c).cursor);
    expect(await cursor()).toBe("grab");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await cursor()).toBe("grabbing");
    await page.mouse.up();
    expect(await cursor()).toBe("grab");
  });

  test("the controls float over the canvas, dim at rest and whole on hover or focus", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    const top = page.locator("#preview3d .p3d-top");
    const opacity = () => top.evaluate((el) => Number(getComputedStyle(el).opacity));
    await page.mouse.move(2, 2); // the pointer off the stage (over the header)
    await expect.poll(opacity).toBeLessThan(1);
    // The keyboard brings it back: never invisible to focus.
    await page
      .locator("#preview3d")
      .getByRole("button", { name: /^Reset the view/ })
      .focus();
    await expect.poll(opacity).toBe(1);
    expect(await opacity()).toBeGreaterThan(0);
    // The scrubber is the thin line along the canvas's foot, and keeps its name.
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    await expect(scrub).toHaveAttribute("aria-label", "Replay position");
    const s = await scrub.boundingBox();
    const c = await page.locator("#preview3d canvas").boundingBox();
    if (!s || !c) throw new Error("missing a box");
    expect(s.height).toBeLessThanOrEqual(16);
    expect(Math.abs(s.y + s.height - (c.y + c.height))).toBeLessThanOrEqual(1);
    expect(Math.abs(s.width - c.width)).toBeLessThanOrEqual(1);
    // `View ▾` holds the six presets, by the names and `data-preset` they always had.
    await page
      .locator("#preview3d")
      .getByRole("button", { name: /^View presets/ })
      .click();
    const presets = page.locator("#preview3d .archlang-views-presets [data-preset]");
    await expect(presets).toHaveCount(6);
    expect(await presets.evaluateAll((bs) => bs.map((b) => b.getAttribute("data-preset")))).toEqual([
      "iso",
      "top",
      "north",
      "east",
      "south",
      "west",
    ]);
    // A group, not a menu: no aria-haspopup, and aria-expanded follows it.
    const toggle = page.locator("#preview3d").getByRole("button", { name: /^View presets/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(await toggle.getAttribute("aria-haspopup")).toBeNull();
    // Leaving the 3D view shuts it (`hide`); it is shut when the view comes back. The switch is
    // clicked from script, so no press outside the popover is what shut it.
    await page.evaluate(() => document.getElementById("viewPlan")?.click());
    await expect(page.locator("#preview")).toHaveClass(/active/);
    await page.evaluate(() => document.getElementById("view3d")?.click());
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(page.locator("#preview3d .archlang-views-presets")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("a lost WebGL context says so, and its restore draws the view again (card MP2, ruling MP-D3)", async ({
    page,
  }) => {
    type Lost = Window & { __preview3dGl?: HTMLCanvasElement; __ext?: WEBGL_lose_context | null };
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    const lost = page.locator("#preview3d .p3d-lost");
    await expect(lost).toBeHidden();
    const end = await current(page);
    // The extension's own forced loss, on the WebGL canvas the replay draws into.
    const lose = () =>
      page.evaluate(() => {
        const w = window as Lost & Marked;
        const gl = w.__preview3dGl?.getContext("webgl2") as WebGL2RenderingContext | null;
        w.__ext = gl?.getExtension("WEBGL_lose_context");
        if (!w.__ext) throw new Error("no WEBGL_lose_context on the replay's canvas");
        (w.__preview3d as Handle & { __old?: boolean }).__old = true;
        w.__ext.loseContext();
      });
    // Paint the visible canvas one flat colour: only a new frame takes it off.
    const paintOver = () =>
      page.evaluate(() => {
        const c = document.querySelector("#preview3d canvas") as HTMLCanvasElement;
        const g = c.getContext("2d") as CanvasRenderingContext2D;
        g.fillStyle = "#f0f";
        g.fillRect(0, 0, c.width, c.height);
      });

    await lose();
    await expect(lost).toBeVisible();
    // A mouse here (the touch words are the touch-screen spec's): it says what to do, and is a button.
    await expect(lost).toHaveText("3D view paused. Click to draw it again.");
    await expect(lost).toHaveRole("button");
    await paintOver();
    const flat = await current(page);
    expect(flat, "the canvas was painted over").not.toBe(end);
    await page.evaluate(() => (window as Lost).__ext?.restoreContext());
    await expect(lost).toBeHidden();
    await page.waitForFunction(() => (window as Marked).__preview3d?.__old !== true);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    await expect.poll(() => current(page), { message: "the restore drew a new frame" }).not.toBe(flat);
    expect(await current(page), "the frame it was on: the end frame").toBe(end);

    // Lost again, and the browser does not give it back: a press of the message draws it again.
    await lose();
    await expect(lost).toBeVisible();
    await paintOver();
    await lost.click();
    await expect(lost).toBeHidden();
    await page.waitForFunction(() => (window as Marked).__preview3d?.__old !== true);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    await expect.poll(() => current(page), { message: "the press drew a new frame" }).toBe(end);
  });
});

/**
 * Ruling MP-D2 on the 3D stage: a touch screen has no hover and no wheel or right button. The coach
 * mark says the finger's words (what three.js's `OrbitControls` does with one and two fingers), the
 * floating controls rest whole, and the scrubber, still a thin line at the foot, takes a 44 px press.
 */
test.describe("the 3D stage on a touch screen (card MP2)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

  test("touch words, controls whole without hover, a 44 px scrubber with its handle", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    expect(await page.evaluate(() => matchMedia("(hover: none)").matches), "no hover here").toBe(true);
    const coach = page.locator("#preview3d .p3d-coach");
    await expect(coach).toBeVisible();
    await expect(coach).toHaveText("Drag to turn · pinch to zoom · two-finger drag to pan");
    await expect(coach).not.toContainText(/scroll|right-drag/);

    // Whole at rest: nothing floats dimmed waiting for a hover that never comes.
    for (const s of [".p3d-top", ".p3d-foot", ".p3d-scrub"]) {
      const o = await page.locator(`#preview3d ${s}`).evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(o, `${s} rests at full opacity`).toBe(1);
    }

    const scrub = page.locator('#preview3d [data-role="scrub"]');
    const s = await scrub.boundingBox();
    const c = await page.locator("#preview3d canvas").boundingBox();
    if (!s || !c) throw new Error("missing a box");
    expect(s.height, "a touch-sized press").toBeGreaterThanOrEqual(44);
    expect(Math.abs(s.width - c.width)).toBeLessThanOrEqual(1);
    expect(s.y + s.height, "inside the canvas").toBeLessThanOrEqual(c.y + c.height + 0.5);
    // The handle shows without hover: a rule that applies here (no `:hover` in it) draws the thumb at
    // 12 px, not the 3 px dot of a mouse's rest. (Computed style does not reach a range's thumb.)
    const thumbs = await page.evaluate(() => {
      const found: string[] = [];
      const walk = (rules: CSSRuleList, applies: boolean) => {
        for (const r of rules) {
          if (r instanceof CSSMediaRule) walk(r.cssRules, applies && matchMedia(r.conditionText).matches);
          else if (
            applies &&
            r instanceof CSSStyleRule &&
            /^\.p3d-scrub::-webkit-slider-thumb$/.test(r.selectorText) &&
            r.style.width
          )
            found.push(r.style.width);
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules, true);
      return found;
    });
    expect(thumbs.at(-1), `the last thumb width that applies without hover: ${thumbs}`).toBe("12px");
    // The line it draws stays thin and at the foot: the 44 px is padding over it.
    const pad = await scrub.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.boxSizing, Number.parseFloat(cs.paddingTop)];
    });
    expect(pad).toEqual(["border-box", 32]);
    // A tap on the scrubber still seeks.
    await scrub.tap({ position: { x: Math.round(s.width * 0.25), y: Math.round(s.height - 6) } });
    await expect.poll(async () => Number(await scrub.inputValue())).toBeLessThan(0.5);
  });
});

/**
 * Card MP3 (ruling MP-D3): the 3D view draws only when someone can see it. Every frame the replay
 * or the turntable draws is a copy of the WebGL canvas into the visible one, so counting those
 * copies counts frames, whatever draws them. The turntable itself stays (PG-D4): the first test of
 * the "3D preview tab" block sees it turn on a stage nobody covers.
 */
test.describe("3D draws only when someone can see it (card MP3)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Count the frames copied into the stage's canvas. */
  const countFrames = (page: Page) =>
    page.addInitScript(() => {
      const w = window as Window & { __frames?: number };
      w.__frames = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        if (this.canvas.classList.contains("p3d-canvas") && a[0] instanceof HTMLCanvasElement) w.__frames! += 1;
        return (draw as (...b: unknown[]) => void).apply(this, a);
      } as typeof draw;
    });
  /** The frames drawn in the next `ms`. */
  const framesIn = (page: Page, ms: number) =>
    page.evaluate(async (wait) => {
      const w = window as Window & { __frames?: number };
      const from = w.__frames ?? 0;
      await new Promise((r) => setTimeout(r, wait));
      return (w.__frames ?? 0) - from;
    }, ms);

  test("no frames under the gallery, Make your own or off screen; they go on once it is seen", async ({ page }) => {
    await countFrames(page);
    // The session's first open: the replay plays, then the turntable turns.
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await expect.poll(() => framesIn(page, 500), { message: "it plays on an uncovered stage" }).toBeGreaterThan(0);

    // The gallery over the stage: not one frame.
    await page.locator("#gallery > summary").click();
    await expect(page.locator("#gallery")).toHaveAttribute("open", "");
    await page.waitForTimeout(200);
    expect(await framesIn(page, 1000), "no frames with the gallery open").toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#gallery")).not.toHaveAttribute("open", "");
    // Under the software WebGL these specs run on (SwiftShader), Chromium stops producing frames for
    // every rAF loop on the page (a bare probe loop too) for a while after the gallery shuts, until
    // the next input: headless and headed alike, and on main before this card too. With a real GPU
    // (headed) the frames go on at once with no input (measured for card MP3), so this is the
    // renderer, not the pause. A pointer moving over the stage (not a press: the turntable stays) is
    // that input.
    const box = await page.locator("#preview3d canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    expect(await framesIn(page, 1000), "frames again once the gallery is shut").toBeGreaterThan(0);

    // The Make your own dialog over it: not one frame; shut, they go on within a second.
    await page.locator("#makeOwn").click();
    await expect(page.locator("#makeOwnDialog")).toBeVisible();
    await page.waitForTimeout(200);
    expect(await framesIn(page, 1000), "no frames under Make your own").toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#makeOwnDialog")).toBeHidden();
    expect(await framesIn(page, 1000), "frames again once the dialog is shut").toBeGreaterThan(0);

    // Share → Embed: a full-screen sheet over the page (not a <dialog>): not one frame under it.
    await page.locator("#share > summary").click();
    await expect(page.locator("#embed")).toBeEnabled();
    await page.locator("#embed").click();
    await expect(page.locator(".embed-dialog")).toBeVisible();
    await expect(page.locator("#share")).not.toHaveAttribute("open", "");
    await page.waitForTimeout(200);
    expect(await framesIn(page, 1000), "no frames under the Embed sheet").toBe(0);
    await page.locator(".embed-dialog .embed-close").click();
    await expect(page.locator(".embed-dialog")).toHaveCount(0);
    expect(await framesIn(page, 1000), "frames again once the Embed sheet is shut").toBeGreaterThan(0);

    // Off screen: the canvas pushed 80 % out of its stage (which clips it), under half visible.
    await page.addStyleTag({ content: "#preview3d canvas { translate: 0 80%; }" });
    await page.waitForTimeout(300);
    expect(await framesIn(page, 1000), "no frames with the canvas mostly off screen").toBe(0);
    await page.addStyleTag({ content: "#preview3d canvas { translate: none; }" });
    await page.waitForTimeout(300);
    expect(await framesIn(page, 1000), "frames again once it is back").toBeGreaterThan(0);
  });

  test("the desktop's drawing buffer is unchanged: CSS size × the pixel ratio, up to 2", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 900, height: 600 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    const [buffer, css] = await page
      .locator("#preview3d canvas")
      .evaluate((c: HTMLCanvasElement) => [c.width, c.clientWidth]);
    expect(buffer, `buffer ${buffer} for ${css} CSS px`).toBe(Math.round(css! * 2));
    await context.close();
  });
});

test.describe("a touch tablet's drawing buffer, wider than 900 px (card MP3)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce" });

  test("is at most 1.5 × its CSS size on a 2× tablet", async ({ page }) => {
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "a touch screen").toBe(true);
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    const [buffer, css, h, cssH] = await page
      .locator("#preview3d canvas")
      .evaluate((c: HTMLCanvasElement) => [c.width, c.clientWidth, c.height, c.clientHeight]);
    expect(css!, "the desktop stage, wider than a phone's").toBeGreaterThan(900);
    expect(buffer, `buffer ${buffer} for ${css} CSS px`).toBeLessThanOrEqual(1.5 * css! + 1);
    expect(h).toBeLessThanOrEqual(1.5 * cssH! + 1);
    expect(buffer, "still sharper than 1×").toBeGreaterThan(css!);
  });
});

test.describe("a touch screen's drawing buffer (card MP3)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
    reducedMotion: "reduce",
  });

  test("is at most 1.5 × its CSS size on a 3× phone", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    const [buffer, css, h, cssH] = await page
      .locator("#preview3d canvas")
      .evaluate((c: HTMLCanvasElement) => [c.width, c.clientWidth, c.height, c.clientHeight]);
    expect(buffer, `buffer ${buffer} for ${css} CSS px`).toBeLessThanOrEqual(1.5 * css! + 1);
    expect(h).toBeLessThanOrEqual(1.5 * cssH! + 1);
    expect(buffer, "still sharper than 1×").toBeGreaterThan(css!);
  });
});

/** The mouse's words where there is a mouse (and the touch words never reach it). */
test.describe("the 3D stage with a mouse (card MP2)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });

  test("the coach mark says scroll and right-drag", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches), "a mouse here").toBe(true);
    await expect(page.locator("#preview3d .p3d-coach")).toHaveText("Drag to turn · scroll to zoom · right-drag to pan");
    const s = await page.locator('#preview3d [data-role="scrub"]').boundingBox();
    expect(s?.height ?? 0, "the mouse's thin scrubber").toBeLessThanOrEqual(16);
  });
});

type Marked = Window & { __preview3d?: Handle & { __old?: boolean } };

/**
 * What card A5 and card P1 care about at startup, gated directly. The chunks the page loads before
 * anything is opened (index.html's module script and its modulepreloads) carry no 3D code and no
 * CodeMirror: the 3D chunk loads on the tab's first open (the first test above sees it fetched
 * once), the editor's chunk on the first entry into edit mode (init-precedence.spec.ts sees it not
 * fetched in view mode). The compiler is the one startup chunk outside the view path: preloaded so
 * it downloads with the page, but a `modulepreload`, never the render's own script.
 *
 * "Startup chunks" are the files index.html names AND everything they import statically, walked
 * through the built files (card PG5a): no lazy heavyweight (three.js, CodeMirror, glTF-Transform,
 * jsPDF and html2canvas, the takeoff panel) is reachable from them, from the `import()`s every
 * visit makes (main.ts: the compiler, the examples and samples, the header actions), from the
 * files embed.html names, nor, but for the editor itself, from the editor's chunk.
 *
 * Four size gates, all on SUMS of gzip sizes, never per chunk (a per-chunk ±1 % fired on ordinary
 * core growth, a re-bless hazard that teaches re-blessing; a sum is indifferent to the bundler
 * renaming or re-splitting chunks):
 *
 * - `viewBudget` (60,000 B, PS-D5 / PG-D7): the view path — what the entry and every preload but the
 *   compiler reach — is a hard ceiling, not a growth allowance.
 * - `compilerPathBudget`: the view path and the compiler with what it reaches, the JS that loads by
 *   the end of the first compile. A hard ceiling too; the baseline file says how it was set.
 * - `embedPathBudget`: what embed.html's script and preloads reach (the embed imports the core
 *   statically). A hard ceiling, set the same way.
 * - `growthBudget` (20,000 B): every startup chunk, compiler included, against the baseline. The 3D
 *   chunk is ~150,500 B gzip (three.js and the package, measured at A8), so a leak of even an eighth
 *   of it trips the gate, while ordinary core growth (hundreds of bytes per feature) takes dozens of
 *   PRs to reach it, and reaching it is a deliberate re-baseline with its reason in the commit.
 *
 * Code leaks smaller than the budgets are the markers' job: three.js's renderer and camera class
 * names and the package's label, CodeMirror's own class names, each first checked to be in its lazy
 * chunk, so a minifier that drops one fails here instead of passing vacuously.
 */
test.describe("startup chunks", () => {
  test.skip(!!process.env.E2E_BASE_URL, "reads the local build");

  test("the startup chunks carry no 3D code and no editor, and stay within their budgets", () => {
    const baseline = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "startup-chunks.baseline.json"), "utf8"),
    ) as {
      viewBudget: number;
      compilerPathBudget: number;
      embedPathBudget: number;
      growthBudget: number;
      gzip: Record<string, number>;
      compilerGzip: Record<string, number>;
    };
    // A page's own module script and modulepreloads, as index.html / embed.html name them.
    const pageRoots = (page: string) => {
      const html = readFileSync(join(DIST, page), "utf8");
      const scripts = [...html.matchAll(/<script type="module"[^>]*\bsrc="\.\/(assets\/[^"]+\.js)"/g)].map(
        (m) => m[1] as string,
      );
      const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*\bhref="\.\/(assets\/[^"]+\.js)"/g)].map(
        (m) => m[1] as string,
      );
      expect(scripts.length, `${page} loads a module script`).toBeGreaterThan(0);
      return { scripts, preloads };
    };
    const { scripts, preloads } = pageRoots("index.html");

    const assets = readdirSync(join(DIST, "assets"));
    const one = (re: RegExp, what: string): string => {
      const found = assets.filter((f) => re.test(f));
      expect(found, what).toHaveLength(1);
      return `assets/${found[0]}`;
    };
    const lazy3d = one(/^preview3d-[\w-]+\.js$/, "one 3D chunk");
    const editor = one(/^edit-mode-[\w-]+\.js$/, "one edit-mode chunk");
    const compiler = one(/^compiler-[\w-]+\.js$/, "one compiler chunk");
    // Download GLB's writer (card X5): its own chunk, so glTF-Transform grows neither the startup
    // chunks nor the 3D chunk.
    const glb = one(/^glb-export-[\w-]+\.js$/, "one GLB-writer chunk");
    // Download PDF's jsPDF and the html2canvas it loads (card PG5a): only on the first PDF.
    const jspdf = one(/^jspdf[-.][\w.-]+\.js$/, "one jsPDF chunk");
    const html2canvas = one(/^html2canvas-[\w-]+\.js$/, "one html2canvas chunk");
    const takeoff = one(/^takeoff-panel-[\w-]+\.js$/, "one takeoff chunk");
    expect(readFileSync(join(DIST, lazy3d), "utf8"), "the 3D chunk carries no GLB writer").not.toContain(
      "glTF-Transform",
    );
    // The compiler: preloaded with the page, never the script the first paint waits on.
    expect(preloads, "the compiler is preloaded").toContain(compiler);
    expect(scripts, "the compiler is not the page's module script").not.toContain(compiler);

    // What a startup file costs is everything it imports statically, not the file alone: a
    // module's static imports load and run before it does. The pages name only the roots, so
    // the gate walks the graph from them (card PG5a: the compiler once imported the whole jsPDF
    // chunk, ~129 KB gzip, for the bundler's runtime helpers, and a gate that counted only the
    // files index.html names never saw it). A dynamic `import()` is not followed: that is a lazy
    // chunk, loaded on demand, unless it is one every visit makes (`boot` below).
    // A relative specifier resolves against the importing file, `?query` dropped; one that names
    // no built file fails here, so a change in how the bundler spells imports cannot quietly
    // drop edges from the walk.
    const resolveFrom = (from: string, spec: string): string => {
      const file = posix.normalize(posix.join(posix.dirname(from), spec.replace(/[?#].*$/, "")));
      expect(existsSync(join(DIST, file)), `${from} imports "${spec}", a built file`).toBe(true);
      return file;
    };
    const imports = (file: string, re: RegExp): string[] =>
      [...readFileSync(join(DIST, file), "utf8").matchAll(re)].map((m) => resolveFrom(file, m[1] as string));
    // `import x,{a as b}from"./c.js"`, `import*as x from…`, `import"./c.js"` and the re-exports
    // `export{…}from…` / `export*from…`; never `import("./c.js")`.
    const STATIC =
      /\b(?:import|export)\s*(?:[\w$]+\s*,?\s*)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})?\s*(?:from\s*)?["'](\.{1,2}\/[^"']+)["']/g;
    const DYNAMIC = /\bimport\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]\s*\)/g;
    const staticImports = (file: string) => imports(file, STATIC);
    const reach = (roots: string[]): string[] => {
      const seen = new Set<string>();
      const todo = [...roots];
      while (todo.length) {
        const file = todo.pop() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        todo.push(...staticImports(file));
      }
      return [...seen].sort();
    };
    // The walk itself is checked to see imports: the entry imports its shared chunks, and the
    // compiler at least the bundler's runtime helpers, so a parser miss cannot drop the
    // compiler's imports from both the forbidden-chunk check and the budgets.
    expect(staticImports(scripts[0] as string).length, "the walk reads the entry's static imports").toBeGreaterThan(0);
    expect(reach([compiler]).length, "the walk reads the compiler's static imports").toBeGreaterThan(1);
    const viewPath = reach([...scripts, ...preloads.filter((p) => p !== compiler)]);
    const startup = reach([...scripts, ...preloads]);
    expect(viewPath, "the compiler is not reached by the view path's static imports").not.toContain(compiler);

    // The `import()`s every visit makes once the drawing is up (main.ts): the compiler and the
    // example sources and samples (the gallery) at the top level, the header actions once the
    // compiler is in. Named by source module, each checked to be a dynamic import in main.ts and
    // in the built entry, the chunk read from the built graph. They join the forbidden-chunk
    // check only: the compiler is already in `compilerPathBudget`, and the rest (the example
    // sources, the actions) load after the first compile by design, outside PG-D7's startup.
    const mainTs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts"), "utf8");
    const entryDynamic = imports(scripts[0] as string, DYNAMIC);
    const boot = ["compiler", "examples", "samples", "actions"].map((name) => {
      expect(mainTs, `main.ts imports ./${name}.js at boot`).toContain(`import("./${name}.js")`);
      const found = entryDynamic.filter((f) => new RegExp(`^assets/${name}-[\\w-]+\\.js$`).test(f));
      expect(found, `the built entry imports one ${name} chunk dynamically`).toHaveLength(1);
      return found[0] as string;
    });
    expect(boot, "the boot import of ./compiler.js is the compiler chunk").toContain(compiler);
    const booted = reach([...startup, ...boot]);

    // The embed (embed.html, the iframe other pages show): it imports the core statically
    // (embed.ts), so it walks into the compiler the way index.html's preload does.
    const embed = pageRoots("embed.html");
    const embedPath = reach([...embed.scripts, ...embed.preloads]);
    expect(embedPath, "the embed reaches the compiler").toContain(compiler);

    const lazy: [string, string][] = [
      [lazy3d, "the 3D chunk (three.js)"],
      [editor, "the editor's chunk (CodeMirror)"],
      [glb, "the GLB writer (glTF-Transform)"],
      [jspdf, "jsPDF"],
      [html2canvas, "html2canvas"],
      [takeoff, "the takeoff panel"],
    ];
    for (const [chunk, what] of lazy) {
      expect(startup, `${what} is not loaded, preloaded or statically imported at startup`).not.toContain(chunk);
      expect(booted, `${what} is not statically imported by a boot-time import()`).not.toContain(chunk);
      expect(embedPath, `${what} is not loaded, preloaded or statically imported by the embed`).not.toContain(chunk);
      // Nor by the editor's chunk: entering edit mode loads no 3D, PDF or GLB code with it.
      if (chunk !== editor)
        expect(reach([editor]), `${what} is not statically imported by the editor`).not.toContain(chunk);
    }

    const markers: [string, string][] = [
      ...["WebGLRenderer", "PerspectiveCamera", LABEL].map((m): [string, string] => [m, lazy3d]),
      ...["cm-content", "cm-gutters"].map((m): [string, string] => [m, editor]),
      ["glTF-Transform", glb],
      ["AcroForm", jspdf],
    ];
    for (const [m, chunk] of markers) {
      expect(readFileSync(join(DIST, chunk), "utf8"), `the marker "${m}" is in ${chunk}`).toContain(m);
    }
    for (const file of new Set([...booted, ...embedPath])) {
      const text = readFileSync(join(DIST, file), "utf8");
      for (const [m] of markers) expect(text, `${file} carries 3D, editor or PDF code ("${m}")`).not.toContain(m);
    }

    const gz = (file: string) => gzipSync(readFileSync(join(DIST, file))).length;
    const size = (files: string[]) => files.reduce((a, f) => a + gz(f), 0);
    const view = size(viewPath);
    const total = size(startup);
    const embedTotal = size(embedPath);
    expect(view, `the view path is ${view} B gzip (budget ${baseline.viewBudget} B)`).toBeLessThanOrEqual(
      baseline.viewBudget,
    );
    expect(
      total,
      `the view path and the compiler are ${total} B gzip (budget ${baseline.compilerPathBudget} B): ${startup.join(", ")}`,
    ).toBeLessThanOrEqual(baseline.compilerPathBudget);
    expect(
      embedTotal,
      `the embed path is ${embedTotal} B gzip (budget ${baseline.embedPathBudget} B): ${embedPath.join(", ")}`,
    ).toBeLessThanOrEqual(baseline.embedPathBudget);
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const base = sum(baseline.gzip) + sum(baseline.compilerGzip);
    expect(
      total - base,
      `startup chunks ${total} B gzip vs the baseline's ${base} B (budget +${baseline.growthBudget} B)`,
    ).toBeLessThanOrEqual(baseline.growthBudget);
  });
});
