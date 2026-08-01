/**
 * Shared fixtures + page helpers for the playground E2E specs.
 *
 * NOTE for vitest: nothing under `playground/e2e/` is a unit test. The root
 * vitest `include` is `playground/test/ ** /*.test.ts`, which matches neither this
 * file nor the `*.spec.ts` siblings — the two suites never collide.
 */
import { expect, type Page } from "@playwright/test";
import { encodeSrc } from "../src/share.js";

/** A minimal, lint-clean plan: one room, one door, one window. */
export const SIMPLE_PLAN = `plan "E2E" {
  units mm
  grid 100
  wall exterior thickness 150 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=main at (0,0) size 6000x4000 label "Main"
  door at (3000,4000) width 900 wall exterior hinge left swing in
  window at (0,2000) width 1500 wall exterior
}`;

/** The same plan at a different size — used to prove a re-render actually happened. */
export const RESIZED_PLAN = SIMPLE_PLAN.replace(/6000/g, "9000");

/**
 * A plan whose only fault is `E_ARC_RADIUS`: no circle of radius 100 passes
 * through two points 4000 mm apart. It is the cleanest end-to-end fix subject in
 * the language — an ERROR-severity `E_` code carrying exactly one
 * machine-applicable fix ("use the minimum radius 2000") that fully resolves it.
 */
export const ARC_RADIUS_ERROR_PLAN = `plan "E2E" {
  units mm
  wall exterior thickness 150 { (0,0) arc (4000,0) radius 100 }
}`;

/** Source that cannot parse at all — no fix, no render. */
export const BROKEN_PLAN = `plan "E2E" {\n  units mm\n  romo at (0,0) size 4000x3000\n}`;

/** Build the playground's `#z=` permalink hash for `src` (the real codec). */
export const shareHash = (src: string): Promise<string> => encodeSrc(src);

/** The `#z=` hash plus `&`-joined embed params, e.g. `editable=1`, `theme=mono`. */
export async function embedHash(src: string, ...params: string[]): Promise<string> {
  const hash = await encodeSrc(src);
  return params.length ? `${hash}&${params.join("&")}` : hash;
}

/** Wait until the preview stage holds a rendered plan. */
export async function waitForPlan(page: Page): Promise<void> {
  await expect(page.locator(".pz-stage svg")).toBeVisible();
}

/** The autosave key `onDocChanged` writes — also this helper's settle signal. */
export const AUTOSAVE_KEY = "archlang.pg.source";

/**
 * Replace the whole editor document with `src` AND wait for the app to catch up.
 *
 * `insertText` goes through CodeMirror's own `beforeinput`/`input` path (the same
 * one a paste takes), so the update listener fires exactly as it does for a human
 * — no reaching into the EditorView from the test.
 *
 * The wait is not optional. `onDocChanged` is debounced 250 ms and does three
 * things in one callback: `render()` (which refreshes `lastScene`/`lastSvg` and
 * the status text), then the autosave, then the permalink. Returning before that
 * timer means the next action reads STALE state — a DXF/TXT download serialising
 * the previous plan's scene, or a `flash()` message overwritten by the pending
 * render. Both were real flakes here. The autosave is the exact witness: it is
 * written in the same synchronous block, immediately after the render.
 */
export async function setEditorSource(page: Page, src: string): Promise<void> {
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(src);
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), AUTOSAVE_KEY), { timeout: 10_000 }).toBe(src);
}

/** Collector for console errors + failed/4xx-5xx responses over a page's lifetime. */
export interface PageProblems {
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: string[];
  failedRequests: string[];
}

/** Start recording console/network problems. Attach BEFORE the first navigation. */
export function watchForProblems(page: Page): PageProblems {
  const problems: PageProblems = { consoleErrors: [], pageErrors: [], badResponses: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => problems.pageErrors.push(String(err)));
  page.on("response", (res) => {
    if (res.status() >= 400) problems.badResponses.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => {
    problems.failedRequests.push(`${req.failure()?.errorText ?? "failed"} ${req.url()}`);
  });
  return problems;
}
