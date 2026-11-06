import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  openTools,
  SIMPLE_PLAN,
  setEditorSource,
  shareHash,
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
 * The tab opens in either mode (it is the one output tab view mode keeps). A case that opens
 * Describe or Lint, or types into the editor, loads its plan with `&edit` (edit mode); the rest
 * stay in view mode, the default a visitor meets.
 */
test.use({ launchOptions: { args: SWIFTSHADER_ARGS } });

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
// The PS-D12 line and the limits line (public-surfaces card X1), as the package exports them.
const LABEL =
  "Same source, plan and 3D preview. The 3D preview is extruded from the same .arch file by the separate archlang-3d package, and checked against the plan.";
const LIMITS =
  "3D preview: walls, openings, floors, stairs and furniture in flat colours; no pitched roofs yet, and no sections, elevations or BIM.";

interface Handle {
  seek: (t: number) => void;
  frameHash: () => Promise<string>;
  ready: Promise<void>;
}
type W = Window & { __preview3d?: Handle };

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

    await page.locator("#tab-preview3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await expect(page.locator("#tab-preview3d")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".tabview.active")).toHaveCount(1);
    await expect(page.locator("#preview3d")).toContainText(LABEL);
    await expect(page.locator("#preview3d .p3d-limits")).toHaveText(LIMITS);
    await expect(page.locator("#preview3d .p3d-label a")).toHaveAttribute(
      "href",
      "https://www.npmjs.com/package/@chanmeng666/archlang-3d",
    );
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
    // The facts strip (card G4) is DOM over the canvas: at the end it names both area conventions.
    await expect(page.locator("#preview3d .p3d-strip")).toContainText(/floor area [\d.]+ m² \(net\)/);
    await expect(page.locator("#preview3d .p3d-strip")).toContainText("(to wall centre lines)");
    expect(end, "a different t is a different frame").not.toBe(a);
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
    await page.locator("#tab-preview").click();
    await page.locator("#tab-preview3d").click();
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    expect(chunks.length, "the 3D chunk is fetched once").toBe(1);
  });

  test("opens on the end frame, unplayed; Replay plays the replay from the start (card X1)", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await page.locator("#tab-preview3d").click();
    await page.waitForFunction(() => (window as W).__preview3d !== undefined);
    await page.evaluate(async () => {
      await (window as W).__preview3d?.ready;
    });
    const scrub = page.locator('#preview3d [data-role="scrub"]');
    // The settled iso view at once: t = 1, and it stays there (nothing plays on its own).
    await expect(scrub).toHaveValue("1");
    const opened = await current(page);
    await page.waitForTimeout(400);
    await expect(scrub).toHaveValue("1");
    expect(await current(page), "no playback on open").toBe(opened);
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

  test("the Tools menu opens it in view mode, labelled as the 3D decision record says", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "view");
    await openTools(page);
    // The product word (preview-and-remodel D5): "3D preview", in the menu as on the tab.
    await page.getByRole("button", { name: "3D preview", exact: true }).click();
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

/** Open the 3D tab and wait until a replay is mounted and its drawing is ready. */
async function open3d(page: Page): Promise<void> {
  await page.locator("#tab-preview3d").click();
  await page.waitForFunction(() => (window as W).__preview3d !== undefined);
  await page.evaluate(async () => {
    await (window as W).__preview3d?.ready;
  });
}

test.describe("3D preview tab follows the editor", () => {
  test("the storey switcher drives it: no selection is all storeys, L2 is storey 2 alone", async ({ page }) => {
    await page.goto("/#edit");
    await waitForPlan(page);
    await page.locator("#examples").selectOption("Townhouse (3 levels)");
    await waitForPlan(page);
    await open3d(page);
    const tab = page.locator("#preview3d");
    const canvas = page.locator("#preview3d canvas");
    await expect(tab).toHaveAttribute("data-view", "all");
    await expect(canvas).toHaveAttribute("aria-label", /\(all storeys\)/);
    // No storey picked: the 3D tab shows them all, so the switcher underlines none; every other
    // tab shows the lowest storey and underlines L1, as before.
    const pressed = page.locator('#storeys button[aria-pressed="true"]');
    await expect(pressed).toHaveCount(0);
    await page.locator("#tab-describe").click();
    await expect(pressed).toHaveText("L1");
    await page.locator("#tab-preview3d").click();
    await expect(pressed).toHaveCount(0);
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
    await page.locator("#tab-describe").click();
    await page.locator("#tab-preview3d").click();
    await expect(tab).toHaveAttribute("data-view", "L2");
  });

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
    await page.locator("#tab-lint").click();
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
    await button("Iso view: the replay's end view").click();
    expect(await current(page), "Iso is the end camera, pixel for pixel").toBe(end);
    await expect(button("Iso view: the replay's end view")).toHaveAttribute("aria-pressed", "true");

    await drag(page, -120, -30);
    await expect(button("Iso view: the replay's end view"), "a drag leaves the preset").toHaveAttribute(
      "aria-pressed",
      "false",
    );
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
    await button("Iso view: the replay's end view").click();
    const box = await page.locator("#preview3d canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    expect(await current(page), "the wheel zooms").not.toBe(end);
    const seen = new Set([end]);
    for (const name of [/^Top view/, /^View from north/, /^View from east/, /^View from south/, /^View from west/]) {
      await button(name).click();
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

  test("hiding the upper storeys shows the floor below; All brings the end frame back", async ({ page }) => {
    await page.goto("/");
    await waitForPlan(page);
    await page.locator("#examples").selectOption("Townhouse (3 levels)");
    await waitForPlan(page);
    await open3d(page);
    await expect(page.locator("#preview3d")).toHaveAttribute("data-view", "all");
    await expect(page.locator('#preview3d [data-role="scrub"]')).toHaveValue("1");
    const end = await hashAt(page, 1);
    const storeys = page.locator("#preview3d [data-storeys]");
    await expect(storeys).toHaveCount(3);
    await expect(page.locator('#preview3d [data-storeys="3"]')).toHaveAttribute("aria-pressed", "true");

    await page.locator('#preview3d [data-storeys="1"]').click();
    await expect(page.locator('#preview3d [data-storeys="1"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.shown)).toBe(1);
    const ground = await current(page);
    expect(ground, "the storeys above the ground floor are hidden").not.toBe(end);
    await page.locator('#preview3d [data-storeys="2"]').click();
    const two = await current(page);
    expect(new Set([end, ground, two]).size).toBe(3);
    await page.locator('#preview3d [data-storeys="3"]').click();
    expect(await current(page), "every storey shown again is the end frame").toBe(end);
  });

  test("an edit keeps the view the user chose", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&edit`);
    await waitForPlan(page);
    await open3d(page);
    await page
      .locator("#preview3d")
      .getByRole("button", { name: /^Top view/ })
      .click();
    await page.evaluate(() => {
      (window as Viewed & { __before?: unknown }).__before = (window as Viewed).__preview3d;
    });
    await setEditorSource(page, SIMPLE_PLAN.replace("6000x4000", "6000x4100"));
    await page.waitForFunction(
      () => (window as Viewed & { __before?: unknown }).__before !== (window as Viewed).__preview3d,
    );
    expect(await page.evaluate(() => (window as Viewed).__preview3d?.view?.camera)).toBe("top");
    const top = page.locator("#preview3d").getByRole("button", { name: /^Top view/ });
    await expect(top, "the toolbar shows the restored view").toHaveAttribute("aria-pressed", "true");
    // The tab redraws the edited plan from the kept view once its drawing is ready (`drawAt`, queued
    // on `ready` before this wait): that frame is the edited plan's own Top view.
    await page.evaluate(async () => {
      await (window as Viewed).__preview3d?.ready;
    });
    const kept = await current(page);
    await top.click();
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
    const top = page.locator("#preview3d").getByRole("button", { name: /^Top view/ });
    await top.click();
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
    await expect(top).toHaveAttribute("aria-pressed", "true");
    // A fresh press, now that the playback is paused, draws the same frame.
    await top.click();
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
 * 3D preview, which drives the Preview and 3D preview tabs (so Tools → 3D preview flips it), the
 * `&3d` deep link, the hash flag a copied full link keeps, the plan strip and the knobs in 3D, and
 * Download GLB. Reduced motion, so the end frame is drawn at once and nothing plays on its own.
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
    await expect(page.locator("#strip a.strip-item[aria-current='true']")).toHaveCount(1);
  });

  test("`&3d&edit` opens the editor beside the 3D preview", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d&edit`);
    await waitFor3d(page);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "edit");
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await mounted(page);
    expect(await hash(page)).toMatch(/^#z=[A-Za-z0-9_-]+&3d&edit$/);
  });

  test("another plan from the strip or the picker, in 3D, is rebuilt at its end frame", async ({ page }) => {
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
    const item = page.locator("#strip a.strip-item").first();
    const label = await item.getAttribute("data-label");
    await item.click();
    await expect(page.locator("#examples")).toHaveValue(label ?? "");
    await mounted(page, true);
    await expect(canvas).not.toHaveAttribute("aria-label", before ?? "");
    await atEndFrame(page);
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    expect(await hash(page)).toMatch(/&3d$/);

    await markOld(page);
    const other = await page.locator("#strip a.strip-item").nth(1).getAttribute("data-label");
    await page.locator("#examples").selectOption(other ?? "");
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

  test("Tools → 3D preview flips the switch, and the tabs and the switch agree", async ({ page }) => {
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}`);
    await waitForPlan(page);
    await openTools(page);
    await page.getByRole("button", { name: "3D preview", exact: true }).click();
    await expect(threeBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#preview3d")).toHaveClass(/active/);
    await page.locator("#tab-preview").click();
    await expect(planBtn(page)).toHaveAttribute("aria-pressed", "true");
    await expect(threeBtn(page)).toHaveAttribute("aria-pressed", "false");
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

  test("Download GLB writes the whole plan as a GLB in the page, in a chunk of its own, and says it is unvalidated", async ({
    page,
  }) => {
    const glbChunks: string[] = [];
    page.on("request", (r) => {
      if (/\/assets\/glb-export-[^/]+\.js$/.test(r.url())) glbChunks.push(r.url());
    });
    await page.goto(`/${await shareHash(SIMPLE_PLAN)}&3d`);
    await waitFor3d(page);
    await mounted(page);
    const note = page.locator("#preview3d .p3d-glb-note");
    await expect(note).toContainText("not validated here");
    await expect(note.locator("code")).toHaveText("npx -y @chanmeng666/archlang-3d build plan.arch -o plan.glb");
    const button = page.locator("#preview3d").getByRole("button", { name: "Download GLB" });
    await expect(button).toHaveAttribute("aria-describedby", "p3d-glb-note");
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

  test("a plan the 3D package refuses: the message, no GLB and no knobs in 3D; the switch still works", async ({
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
    await expect(page.locator("#preview3d").getByRole("button", { name: "Download GLB" })).toBeHidden();
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

    test("the 3D view fits its pane: nothing scrolls or clips, the GLB note and limits line included", async ({
      page,
    }) => {
      const src = readFileSync(new URL("../../examples/knob-flat.arch", import.meta.url), "utf8").replace(
        /\r\n?/g,
        "\n",
      );
      await page.goto(`/${await shareHash(src)}&3d`);
      await waitFor3d(page);
      await page.waitForFunction(() => (window as W).__preview3d !== undefined);
      await expect(page.locator("#preview3d .p3d-glb-note")).toBeVisible();
      const fit = await page.locator("#preview3d").evaluate((host) => {
        const box = host.getBoundingClientRect();
        const bottom = (s: string) => host.querySelector(s)?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY;
        return {
          scroll: host.scrollHeight - host.clientHeight,
          note: bottom(".p3d-glb-note") <= box.bottom,
          limits: bottom(".p3d-limits") <= box.bottom,
          sideways: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(fit.scroll, "the 3D view does not scroll inside its pane").toBeLessThanOrEqual(0);
      expect(fit.note, "the GLB note is inside the pane").toBe(true);
      expect(fit.limits, "the limits line is inside the pane").toBe(true);
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
    // The switch's band keeps it clear of the caption under it.
    const chip = await page.locator(".stage-switch").boundingBox();
    const caption = await page.locator("#preview3d .p3d-label").boundingBox();
    expect((chip?.y ?? 0) + (chip?.height ?? 0)).toBeLessThanOrEqual(caption?.y ?? 0);
    await expect(page.locator("#preview3d .p3d-glb")).toBeVisible();
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
 * Two size gates, both on SUMS of gzip sizes, never per chunk (a per-chunk ±1 % fired on ordinary
 * core growth, a re-bless hazard that teaches re-blessing; a sum is indifferent to the bundler
 * renaming or re-splitting chunks):
 *
 * - `viewBudget` (60,000 B, PS-D5): the view path — every startup chunk but the compiler — is a
 *   hard ceiling, not a growth allowance.
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
      growthBudget: number;
      gzip: Record<string, number>;
      compilerGzip: Record<string, number>;
    };
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    const scripts = [...html.matchAll(/<script type="module"[^>]*\bsrc="\.\/(assets\/[^"]+\.js)"/g)].map(
      (m) => m[1] as string,
    );
    const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]*\bhref="\.\/(assets\/[^"]+\.js)"/g)].map(
      (m) => m[1] as string,
    );
    const startup = [...new Set([...scripts, ...preloads])];
    expect(scripts.length, "index.html loads a module script").toBeGreaterThan(0);

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
    expect(startup, "the GLB writer is not loaded or preloaded at startup").not.toContain(glb);
    expect(readFileSync(join(DIST, lazy3d), "utf8"), "the 3D chunk carries no GLB writer").not.toContain(
      "glTF-Transform",
    );
    expect(startup, "the 3D chunk is not loaded or preloaded at startup").not.toContain(lazy3d);
    expect(startup, "the editor's chunk is not loaded or preloaded at startup").not.toContain(editor);
    // The compiler: preloaded with the page, never the script the first paint waits on.
    expect(preloads, "the compiler is preloaded").toContain(compiler);
    expect(scripts, "the compiler is not the page's module script").not.toContain(compiler);

    const markers: [string, string][] = [
      ...["WebGLRenderer", "PerspectiveCamera", LABEL].map((m): [string, string] => [m, lazy3d]),
      ...["cm-content", "cm-gutters"].map((m): [string, string] => [m, editor]),
      ["glTF-Transform", glb],
    ];
    for (const [m, chunk] of markers) {
      expect(readFileSync(join(DIST, chunk), "utf8"), `the marker "${m}" is in ${chunk}`).toContain(m);
    }

    let view = 0;
    let total = 0;
    for (const file of startup) {
      const bytes = readFileSync(join(DIST, file));
      const size = gzipSync(bytes).length;
      total += size;
      if (file !== compiler) view += size;
      const text = bytes.toString("utf8");
      for (const [m] of markers) expect(text, `${file} carries 3D or editor code ("${m}")`).not.toContain(m);
    }
    expect(view, `the view path is ${view} B gzip (budget ${baseline.viewBudget} B)`).toBeLessThanOrEqual(
      baseline.viewBudget,
    );
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const base = sum(baseline.gzip) + sum(baseline.compilerGzip);
    expect(
      total - base,
      `startup chunks ${total} B gzip vs the baseline's ${base} B (budget +${baseline.growthBudget} B)`,
    ).toBeLessThanOrEqual(baseline.growthBudget);
  });
});
