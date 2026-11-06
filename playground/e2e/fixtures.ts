/**
 * Shared fixtures + page helpers for the playground E2E specs.
 *
 * NOTE for vitest: nothing under `playground/e2e/` is a unit test. The root
 * vitest `include` is `playground/test/ ** /*.test.ts`, which matches neither this
 * file nor the `*.spec.ts` siblings — the two suites never collide.
 */
import { type Download, expect, type Page } from "@playwright/test";
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

/**
 * Wait until the preview stage holds a rendered plan and the app is up.
 *
 * The playground serves its default drawing in the HTML (gen-static), so a visible SVG alone
 * no longer means the compiler has run: `html[data-booting]` is removed by main.ts once the
 * first compile is drawn, the header actions are mounted and, in edit mode, the editor is
 * open. embed.html never carries the attribute, so this is the old wait there.
 */
export async function waitForPlan(page: Page): Promise<void> {
  await expect(page.locator(".pz-stage svg")).toBeVisible();
  await expect(page.locator("html[data-booting]")).toHaveCount(0, { timeout: 15_000 });
}

/**
 * `waitForPlan` for a visit that opens on the 3D preview (`&3d`, card X5), where the drawing is
 * not on screen: the app is up (`html[data-booting]` gone, as above), the 3D preview is the view
 * shown, and it has settled on what it shows, a drawn canvas or the package's refusal. The
 * drawing is in the stage all the same, only hidden behind the 3D preview.
 */
export async function waitFor3d(page: Page): Promise<void> {
  await expect(page.locator("html[data-booting]")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".pz-stage svg")).toHaveCount(1);
  await expect(page.locator("#preview3d")).toHaveClass(/\bactive\b/);
  await expect(page.locator("#preview3d :is(canvas, .p3d-message):visible").first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Open the playground in EDIT mode (the editor beside the drawing): `hash` (a `#z=…` share
 * hash, or none) with the `&edit` flag, the way `arch link` and the docs' code panes link.
 * Waits for the plan and the editor.
 */
export async function gotoEdit(page: Page, hash = ""): Promise<void> {
  await page.goto(`/${hash ? `${hash}&edit` : "#edit"}`);
  await waitForPlan(page);
  await expect(page.locator(".cm-content")).toBeVisible();
}

/** Switch a page already open in view mode to edit mode with the header's Source button. */
export async function enterEdit(page: Page): Promise<void> {
  const source = page.locator("#sourceToggle");
  if ((await source.getAttribute("aria-pressed")) !== "true") await source.click();
  await expect(source).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-content")).toBeVisible();
}

/** Open a header menu (a no-op when it is open), and wait for its panel. */
async function openMenu(page: Page, id: "share" | "more"): Promise<void> {
  const menu = page.locator(`#${id}`);
  if ((await menu.getAttribute("open")) === null) await menu.locator("summary").click();
  await expect(menu.locator(".tools-panel")).toBeVisible();
}

/**
 * Open the header's ⋯ menu, More (ruling PG-D5): the render theme and a11y, Format, Finish and
 * Saved, and the related sites. Choosing a button closes it again, so call this before each.
 */
export const openMore = (page: Page): Promise<void> => openMenu(page, "more");

/**
 * Open the header's Share menu (ruling PG-D5): the two links and Embed, and Export (Copy SVG,
 * Copy PNG, Download SVG · PNG · PDF · DXF · TXT · GLB). Choosing a button closes it again.
 */
export const openShare = (page: Page): Promise<void> => openMenu(page, "share");

/** The Make-your-own sheet, opened (its body drawn) and on screen. */
export async function openMakeOwn(page: Page): Promise<void> {
  await page.locator("#makeOwn").click();
  await expect(page.locator("#makeOwnDialog")).toBeVisible();
  await expect(page.locator("#makeOwnDialog .mo-ask")).toBeVisible();
}

/** Download `format` (`svg`, `png`, `pdf`, `dxf`, `txt`, `glb`) from Share → Export. */
export async function downloadFromShare(page: Page, format: string): Promise<Download> {
  await openShare(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(`#share [data-download="${format}"]`).click(),
  ]);
  return download;
}

/** The header's plan gallery (ruling PG-D2): its `<details>`, its trigger and its cards. */
export const gallery = (page: Page) => page.locator("#gallery");
export const galleryTrigger = (page: Page) => page.locator("#planPicker");
/** The card for the plan labelled `label` (an example's or a sample's), open or not. */
export const planCard = (page: Page, label: string) =>
  page.locator("#gallery .gal-card").and(page.locator(`[data-label="${label}"]`));
/** The card the gallery marks as the plan on screen (none for a plan that is no example). */
export const currentPlanCard = (page: Page) => page.locator('#gallery .gal-card[aria-current="true"]');

/** Open the plan gallery (a no-op when it is open). */
export async function openGallery(page: Page): Promise<void> {
  if ((await gallery(page).getAttribute("open")) === null) await galleryTrigger(page).click();
  await expect(page.locator("#galleryPanel")).toBeVisible();
}

/**
 * Choose the plan labelled `label` the way a visitor does: open the header's gallery and click
 * its card, which opens the plan in place and closes the gallery. Does not wait for the plan to
 * be drawn; callers that need it wait as they did after a pick.
 */
export async function pickPlan(page: Page, label: string): Promise<void> {
  await openGallery(page);
  await planCard(page, label).click();
  await expect(page.locator("#galleryPanel")).toBeHidden();
  await expect(currentPlanCard(page)).toHaveAttribute("data-label", label);
}

/**
 * Assert the plan the gallery names: `label` is an example's or a sample's label (its card is
 * marked current), or, for a plan that is no example, `{ neutral }` is the text on the trigger
 * ("Edited plan", "Shared plan", "Saved draft") and no card is marked.
 */
export async function expectPlanNamed(page: Page, want: string | { neutral: string }): Promise<void> {
  if (typeof want === "string") {
    await expect(currentPlanCard(page)).toHaveAttribute("data-label", want);
  } else {
    await expect(currentPlanCard(page)).toHaveCount(0);
    await expect(page.locator("#planName")).toHaveText(want.neutral);
  }
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

/**
 * Choose one of the two links in the Share menu (ADR 0034): `full` is the `#z=` link
 * (`#copyLink`, no server), `short` the stored `/s/<id>` link (`#copyShortLink`).
 */
export async function chooseLink(page: Page, which: "full" | "short"): Promise<void> {
  await openShare(page);
  await page.locator(which === "full" ? "#copyLink" : "#copyShortLink").click();
}

/** The page-side globals `watchStatus` installs. */
interface StatusLogWindow extends Window {
  __archlangStatusLog?: string[];
  __archlangStatusObserver?: MutationObserver;
}

/** A cursor over everything the app has painted into `#statusText` since installation. */
export interface StatusWatch {
  /**
   * Wait until the app has painted `message` into `#statusText` at some point
   * AFTER the previous `expectFlash` (or after `watchStatus`, for the first call),
   * then advance past it.
   */
  expectFlash(message: string): Promise<void>;
}

/**
 * Record every value the app paints into `#statusText`, so a TRANSIENT message can
 * be asserted without racing it.
 *
 * WHY THIS EXISTS. `flash()` (main.ts) shows a message and restores the resting
 * status 1200 ms later — and a message shown by an action that also rewrites the
 * document lives far less than that: the rewrite restarts the 250 ms `onDocChanged`
 * debounce, whose `render()` paints "ready"/"N warnings" straight over the flash.
 * So `await expect(page.locator("#statusText")).toHaveText("Formatted")` was
 * polling for a value with a ~250 ms lifetime, and under full-suite parallel load
 * a poll can step right over it. That is the 2026-08-12 flake in
 * `actions.spec.ts` — timing-sensitive by construction, and not fixable by a longer
 * timeout, which only widens the window it is already inside.
 *
 * A MutationObserver installed BEFORE the action cannot miss the paint no matter
 * how briefly it survives, and the log only grows — so polling it is monotonic and
 * has no window at all. The witness is the app's own status transition (causal),
 * not the autosave landing near it (incidental).
 *
 * Install after `page.goto` and before the action under test; the observer does not
 * survive a navigation.
 */
export async function watchStatus(page: Page): Promise<StatusWatch> {
  await page.evaluate(() => {
    const w = window as StatusLogWindow;
    w.__archlangStatusObserver?.disconnect();
    const el = document.getElementById("statusText");
    if (!el) throw new Error("#statusText not found — has the header markup changed?");
    const log: string[] = [el.textContent ?? ""];
    const observer = new MutationObserver(() => log.push(el.textContent ?? ""));
    // `textContent = msg` replaces the child text node (childList); the other two
    // cover an in-place edit of that node, whichever way the app writes it.
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    w.__archlangStatusLog = log;
    w.__archlangStatusObserver = observer;
  });

  const painted = (): Promise<string[]> => page.evaluate(() => (window as StatusLogWindow).__archlangStatusLog ?? []);

  // Entry 0 is the resting text at install time, not something the action painted —
  // start past it so an assertion can never be satisfied by the status quo.
  let cursor = 1;

  return {
    async expectFlash(message: string): Promise<void> {
      await expect
        .poll(async () => (await painted()).slice(cursor), {
          timeout: 10_000,
          message: `#statusText never showed "${message}"; painted since the last assertion:`,
        })
        .toContain(message);
      // Advance, so a repeat of the same message later in the test needs its OWN
      // paint rather than matching this one again.
      cursor = (await painted()).indexOf(message, cursor) + 1;
    },
  };
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
