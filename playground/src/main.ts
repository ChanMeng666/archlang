/**
 * The playground's startup module: the view path. It shows the drawing (the one built into the
 * page first, then the compiled one), pans and zooms it, reports its facts, switches storeys and
 * plans (the plan gallery in the header) and runs the header. Everything heavier is its own chunk, loaded when it is needed:
 *
 * - the compiler (`archlang`, the `compiler` chunk) and the example sources: on a visit that opens
 *   on the plan built into the page, on first use (a plan picked, the gallery, Share or ⋯ opened,
 *   3D, Source, Checks, Paths, Make your own), which compiles; or, imported only (nothing compiled
 *   or drawn), when the browser is idle, never under Save-Data or 2g (card MP5, ruling MP-D4): that
 *   page already holds the drawing, its facts line, its status and its rooms' facts. A visit that
 *   opens another plan (a `#z=`/`#src=` link, a draft of another plan, a saved theme), `&edit` or
 *   `&3d` compiles at once, as before;
 * - the compile job (compile-worker.ts, card MP6): with the compiler; every render's compile,
 *   describe and lint then run in a Web Worker started from it, so typing never freezes the page
 *   (on the page instead where a worker cannot run; a knob being dragged compiles on the page);
 * - the header actions (actions.ts): once the compiler is in;
 * - the editor and its panels (edit-mode.ts: CodeMirror, completion, diagnostics, Describe,
 *   Lint, Intent): on the first entry into edit mode;
 * - the takeoff (the Facts tab), the 3D preview, Checks, jsPDF: on first use, as before.
 *
 * Modes: `view` (the default) gives the drawing the page; `edit` (the Source button, or `&edit`
 * in the hash) is the editor beside it. index.html's head script sets `html[data-mode]` before
 * the first paint; this module keeps it, the Source button and the hash flag in step.
 *
 * Views (ruling PG-D3: one entry point each): the stage shows the drawing or the 3D preview. View
 * mode has no tab row; the stage's Plan | 3D switch is its one view control. Edit mode has one row
 * of four tabs, Plan · 3D · Facts · Checks, which replace the switch there, so each mode has exactly
 * one Plan/3D control. Both drive the same tabs underneath, as `&3d` in the hash does (card X5),
 * and `&3d` stays in the hash while the 3D preview is on screen. The storey switcher has one home,
 * on the stage under the switch, in both modes. The status is a notice on the stage and a dot on
 * Source, shown only while the plan is compiling or broken (or for a moment after an action).
 */
import type { Diagnostic, PlanNode, RoomSummary, SceneSummary } from "archlang";
import type { ActionsHandle } from "./actions.js";
import type { CompileClient, CompileRequest, CompileResult } from "./compile-worker.js";
import type { ChecksPanel } from "./checks-panel.js";
import type { EditMode } from "./edit-mode.js";
import { createPreview } from "./preview.js";
import { type LevelPage, selectPage } from "./levels.js";
import { mountLevelSwitcher } from "./level-switcher.js";
import { renderFacts } from "./facts-strip.js";
import { mountKnobsPanel } from "./knobs-panel.js";
import { isNarrow, mountMobileViews, VIEW_TAB } from "./mobile-views.js";
import { has3dFlag, hasEditFlag, set3dFlag, setEditFlag, srcFromHash, updateHash } from "./share.js";
import { createSharedNotice, shouldShowSharedNotice } from "./shared-notice.js";
import { mountGallery } from "./gallery.js";
import { mountNudge } from "./nudge.js";
import { mountShell } from "./shell.js";
import { fillGlbNote } from "./glb-note.js";
import { KEYS, readStr, writeStr } from "./storage.js";
// Self-hosted brand fonts (no CDN) — shared with the docs site.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/400-italic.css";
import "./styles/tokens.css";
import "./styles/chrome.css";
import "./styles/editor.css";
import "./styles/panels.css";

type Core = typeof import("./compiler.js");
/** The example sources, and the playground-only samples (samples.ts) the gallery offers after them. */
type Examples = typeof import("./examples.js") & { samples: typeof import("./samples.js") };

// Requested on first need (`up`) or by the idle import, never by this module's top level: the
// drawing is already on screen. A failed load is forgotten, so the next use asks again.
let coreP: Promise<Core> | undefined;
let examplesP: Promise<Examples> | undefined;
const loadCore = (): Promise<Core> =>
  (coreP ??= import("./compiler.js").catch((err: unknown) => {
    coreP = undefined;
    throw err;
  }));
const loadExamples = (): Promise<Examples> =>
  (examplesP ??= Promise.all([import("./examples.js"), import("./samples.js")]).then(
    ([examples, samples]) => ({ ...examples, samples }),
    (err: unknown) => {
      examplesP = undefined;
      throw err;
    },
  ));
/** The compiler, once loaded. Nothing compiles before it. */
let core: Core | undefined;
/**
 * The compile job and the worker that runs it (compile-worker.ts, card MP6): loaded with the
 * compiler, so a render's compile, describe and lint run off the page. A failed load is forgotten.
 */
type Jobs = typeof import("./compile-worker.js");
let jobsP: Promise<Jobs> | undefined;
const loadJobs = (): Promise<Jobs> =>
  (jobsP ??= import("./compile-worker.js").catch((err: unknown) => {
    jobsP = undefined;
    throw err;
  }));
let jobs: Jobs | undefined;
let compiler: CompileClient | undefined;

const root = document.documentElement;
const preview = document.getElementById("preview")!;
const errorsEl = document.getElementById("errors")!;
const statusEl = document.getElementById("status")!;
const statusText = document.getElementById("statusText")!;
const statusLive = document.getElementById("statusLive")!;
const themeSelect = document.getElementById("theme") as HTMLSelectElement;
const accessibleToggle = document.getElementById("accessible") as HTMLInputElement | null;
const finishPanel = document.getElementById("finishPanel");
const factsEl = document.getElementById("facts")!;
const factsRow = document.getElementById("factsRow")!;
const pzViewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const pzStage = document.querySelector<HTMLElement>(".pz-stage")!;
const pzToolbar = document.querySelector<HTMLElement>(".pz-toolbar")!;
const storeysEl = document.getElementById("storeys");
const sourceBtn = document.getElementById("sourceToggle")!;
const statusDismiss = document.getElementById("statusDismiss") as HTMLButtonElement;
// On a phone the switcher is edit mode's one view control (card PG5b ①): Plan, 3D, Facts and
// Checks open their tab (Checks under the diagnostics); Code is the editor, over whatever tab.
const mobileViews = mountMobileViews(
  document.querySelector("main")!,
  document.getElementById("mviews")!,
  document.getElementById("mviewCount")!,
  (view) => {
    if (view !== "code" && activeTab() !== VIEW_TAB[view]) openTab(VIEW_TAB[view]);
  },
);

// ---- output tabs (edit mode: Plan · 3D · Facts · Checks; view mode drives Plan and 3D) ----
const preview3dEl = document.getElementById("preview3d")!;
const takeoffEl = document.getElementById("takeoff")!;
const factsView = document.getElementById("factsView")!;
const checksHost = document.getElementById("checksHost")!;
const tabs = [...document.querySelectorAll<HTMLElement>(".tab")];
const views: Record<string, HTMLElement> = {
  preview,
  preview3d: preview3dEl,
  facts: factsView,
  checks: document.getElementById("checksView")!,
};
/** The tab on screen: `preview`, `preview3d`, `facts` or `checks`. */
function activeTab(): string | undefined {
  return tabs.find((t) => t.classList.contains("active"))?.dataset.tab;
}
/** Open a tab by its name, as a press on it does (its own listeners included). */
function openTab(name: string) {
  document.getElementById(`tab-${name}`)?.click();
}
/**
 * View mode's Plan ↔ 3D switch fades the view coming on screen in from the stage's paper ground,
 * about 180 ms, opacity only (card PG5b; `.pg-fade-in` in panels.css): both views stand on that one
 * ground, so the change reads as a crossfade, and no box moves. It is a class on the incoming view,
 * so nothing waits for it: the 3D preview's first-open playback starts as it would, and the focus
 * stays where it was. Under reduced motion there is no class and the change is instant. Edit mode's
 * tabs, and the page's first paint, never fade: a `&3d` link opens the 3D preview as this module
 * runs (`firstPaint`, cleared at its end), and that is no switch.
 */
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let firstPaint = true;
const fadeViews = [preview, preview3dEl];
function fadeIn(el: HTMLElement | undefined, from: string | undefined) {
  // Every switch first clears a fade still running: a view hidden mid-fade cancels its animation,
  // and its class must not outlive it.
  for (const v of fadeViews) v.classList.remove("pg-fade-in");
  if (!el || root.dataset.mode === "edit" || reducedMotion.matches || firstPaint) return;
  if (from !== "preview" && from !== "preview3d") return;
  void el.offsetWidth; // restart the animation on a quick switch back
  el.classList.add("pg-fade-in");
}
for (const el of fadeViews) {
  // Its own animation's end only: a child's (the 3D hint's) bubbles here too. A cancelled one (the
  // view hidden mid-fade) ends it as well.
  for (const type of ["animationend", "animationcancel"] as const)
    el.addEventListener(type, (e) => {
      if (e.target === el) el.classList.remove("pg-fade-in");
    });
}
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const from = activeTab();
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    }
    for (const [name, el] of Object.entries(views)) el.classList.toggle("active", name === tab.dataset.tab);
    fadeIn(from !== tab.dataset.tab ? views[tab.dataset.tab ?? ""] : undefined, from);
    // The stage's foot (facts and lede, PG-D6) is the drawing's and the 3D preview's; edit mode's
    // Facts and Checks tabs say the facts themselves.
    factsRow.hidden = tab.dataset.tab !== "preview" && tab.dataset.tab !== "preview3d";
    // Leaving the 3D tab stops its playback (opening it is handled below).
    if (tab.dataset.tab !== "preview3d") void preview3d?.then((p) => p?.hide());
    // The switcher's underline follows what the tab now on screen shows (see `shownLevel`).
    // Over the 3D preview it also offers "All" (its combined view, card PG5b).
    levelSwitch.set(lastPages, shownLevel(), in3d());
    // Into or out of the 3D preview's combined view: the facts line says what is on screen now.
    if (lastPages && selectedLevel === null && (from === "preview3d") !== in3d()) updateAnalysis();
    // The phone's switcher presses the view that shows this tab (a `&3d` link, leaving edit mode).
    mobileViews.follow(tab.dataset.tab);
    stageSwitched();
  });
}

// ---- Plan | 3D (public-surfaces card X5): view mode's switch on the stage, over the Plan and 3D tabs ----
const stageSwitchRow = document.getElementById("stageSwitchRow")!;
const viewPlanBtn = document.getElementById("viewPlan") as HTMLButtonElement;
const view3dBtn = document.getElementById("view3d") as HTMLButtonElement;
/** Whether the 3D preview is on screen (its tab is the active one, in either mode). */
const in3d = () => preview3dEl.classList.contains("active");
viewPlanBtn.addEventListener("click", () => {
  if (in3d()) openTab("preview");
});
view3dBtn.addEventListener("click", () => {
  if (!in3d()) openTab("preview3d");
});
stageSwitchRow.hidden = false;

/**
 * After any tab change: the switch says which view is on screen, the hash carries `&3d` while the 3D
 * preview is (so a reload and a copied link open on it), and the knobs sit over that view: the 3D
 * preview's canvas once its chunk is in, else the drawing. The room card and the hover tip are the
 * drawing's own and leave with it.
 */
function stageSwitched() {
  const on = in3d();
  viewPlanBtn.setAttribute("aria-pressed", String(!on));
  view3dBtn.setAttribute("aria-pressed", String(on));
  const hash = set3dFlag(location.hash, on);
  if (hash !== location.hash) window.history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  if (!on) {
    if (knobsPanel.el.parentElement !== pzViewport) pzViewport.appendChild(knobsPanel.el);
    return;
  }
  void preview3d?.then((p) => {
    if (p && in3d() && knobsPanel.el.parentElement !== p.overlay) p.overlay.appendChild(knobsPanel.el);
  });
}

/**
 * The gallery's groups: the examples' (in the served page, written by gen-static; built here only
 * on the dev server, where it has not run), then the samples' (`data-sample`: playground-only,
 * buttons rather than links, since no static page exists for them).
 */
function fillGallery({ EXAMPLE_GROUPS, samples }: Examples): void {
  gallery.ensureExamples(EXAMPLE_GROUPS);
  gallery.addSamples(
    samples.SAMPLE_GROUP,
    samples.SAMPLES.map((s) => s.label),
  );
}

/**
 * Name the plan on screen in the gallery: its trigger and the card it marks current. The example
 * labelled `label`, or, for a plan that is no example word for word (a shared link, a saved
 * draft, an edit), no card, and `neutral` on the trigger.
 */
function markPlan(label: string | null, neutral = "Edited plan") {
  gallery.setCurrent(label, neutral);
}

/** After a change to the source: still an example word for word, or now a plan of the reader's own. */
function syncPlanMark(source: string): Promise<void> {
  return loadExamples().then(({ exampleLabelFor, samples }) => {
    if (currentSource() !== source) return; // a later change syncs again
    markPlan(exampleLabelFor(source) ?? samples.sampleLabelFor(source) ?? null);
  });
}

// The shareable-permalink codec (`#z=` compressed / legacy `#src=`) lives in
// `share.js` so the embed page reuses the exact same scheme.

/** The plan's source. The editor's document mirrors it once edit mode has loaded. */
let doc = "";
let lastSvg = "";
/**
 * The request of the last good render and the storey it drew: a DXF or TXT download compiles the
 * Scene of that drawing on demand (`sceneFor`), the one output no render sends from the worker.
 */
let lastGood: { req: CompileRequest; level: number | null } | null = null;
let lastRooms: RoomSummary[] = [];
/** describe() of the storey on screen, at the last good compile (the room facts card reads it). */
let lastSummary: SceneSummary | null = null;
/**
 * The storey on screen for a multi-storey plan, or `null` for "the lowest one" — which
 * is also what a single-storey plan always has, since `compile().pages` does not exist
 * for it and nothing here ever runs.
 *
 * Deliberately NOT persisted (it is not in `storage.ts`): a saved storey number means
 * nothing once the source has changed, and restoring level 3 onto a plan that now has
 * two floors is a worse first frame than simply starting at the bottom. It resets to
 * `null` whenever the DOCUMENT is replaced — an example picked, a format/repair/fix
 * applied, a snapshot restored — but survives ordinary typing, so editing the top floor
 * does not throw you back to the ground one on every keystroke.
 */
let selectedLevel: number | null = null;
/**
 * The storey last picked, kept when "All" (the 3D preview's combined view) clears the selection,
 * so the drawing, which is always one storey, stays on it (card PG5b). Reset with `selectedLevel`
 * when the document is replaced.
 */
let lastPicked: number | null = null;
/** The level whose facts the panels are currently reporting (`null` = whole plan). */
let activeLevel: number | null = null;
/** The storey pages of the last good compile (the switcher's buttons). */
let lastPages: readonly LevelPage[] | undefined;

/** The current preview SVG with the editor-only `data-span` annotations removed —
 *  used for every export so a downloaded/copied file never carries them. */
const cleanSvg = () => lastSvg.replace(/ data-span="\d+:\d+"/g, "");

// ---- the status (ruling PG-D3) ----
// `#status` is a notice on the stage and `#statusText` its text. It is shown only while the plan is
// compiling (once that has taken long enough to notice: `BUSY_AFTER_MS`), while it is broken (until
// dismissed), and for a moment after an action (`flash`). The live region is `#statusLive`, a
// visually hidden mirror that is a child of <body>, so it is never inside a `display: none` box: the
// stage's pane is not drawn in the phone's Code view, and the errors typed there are still heard
// (card PG5b ②). The Source button wears a dot in the same two states: Source is where the
// diagnostics are.
/** Write the status text: the notice's, and its live mirror's (only on a change, so it speaks once). */
function sayStatus(text: string | null) {
  statusText.textContent = text;
  if (statusLive.textContent !== (text ?? "")) statusLive.textContent = text;
}
type StatusState = "ok" | "busy" | "err";
let statusState: StatusState = "ok";
/** The notice of the current state was dismissed (until the state changes). */
let statusDismissed = false;
/** A first compile this long in coming says so; a quicker one never flashes a notice. */
const BUSY_AFTER_MS = 400;

/** Set the resting status: its state and its text (a flash on screen keeps it until it ends). */
function setStatus(state: StatusState, text: string) {
  if (state !== statusState) statusDismissed = false;
  statusState = state;
  statusEl.classList.toggle("err", state === "err");
  statusEl.classList.toggle("busy", state === "busy");
  if (flashTimer !== undefined) flashResting = text;
  else sayStatus(text);
  paintStatus();
}
/** Show the notice exactly when there is something to say, and the Source button's dot with it. */
function paintStatus() {
  const shown = flashTimer !== undefined || (statusState !== "ok" && !statusDismissed);
  statusEl.classList.toggle("show", shown);
  statusDismiss.hidden = !shown;
  if (statusState === "ok") delete sourceBtn.dataset.status;
  else sourceBtn.dataset.status = statusState;
}
statusDismiss.addEventListener("click", () => {
  if (flashTimer !== undefined) {
    clearTimeout(flashTimer);
    flashTimer = undefined;
    sayStatus(flashResting);
  }
  statusDismissed = true;
  paintStatus();
});

/** Briefly show a message in the status text, then restore it. */
// A transient status message that restores the resting status after 1200 ms.
// Two subtleties, both of which were real bugs:
//   1. The restore timer MUST be cancelled when a second flash lands inside the
//      window. Without that, the first flash's timer fires mid-second-flash and
//      wipes it — so pressing two buttons in quick succession showed the second
//      message for a fraction of its intended life.
//   2. `prev` is only captured when no flash is already pending. Capturing it on
//      every call meant a second flash recorded the FIRST FLASH'S TEXT as the
//      resting status and restored to that, leaving a stale message on screen.
let flashTimer: ReturnType<typeof setTimeout> | undefined;
let flashResting: string | null = null;
function flash(msg: string) {
  if (flashTimer !== undefined) clearTimeout(flashTimer);
  else flashResting = statusText.textContent;
  sayStatus(msg);
  flashTimer = setTimeout(() => {
    flashTimer = undefined;
    sayStatus(flashResting);
    paintStatus();
  }, 1200);
  paintStatus();
}

// ---- modes ----
/** The editor and its panels, once edit mode has loaded. */
let edit: EditMode | undefined;
let editP: Promise<EditMode | undefined> | undefined;
let editing = root.dataset.mode === "edit" || hasEditFlag(location.hash);

function currentSource() {
  return edit ? edit.getDoc() : doc;
}
function loadSource(src: string, refit = true) {
  // A wholesale document replacement is a new plan as far as the storey switcher is
  // concerned — its level numbers may mean nothing here. Back to the lowest storey.
  selectedLevel = null;
  lastPicked = null;
  // In edit mode the editor takes it as one undo step, and its change listener calls
  // `onDocChanged`; with no editor, this does.
  if (edit) edit.replaceDoc(src);
  else onDocChanged(src);
  void render(src, refit);
}

/** Move the editor caret to a byte offset and reveal it (click-to-source; edit mode only). */
function jumpToOffset(offset: number) {
  edit?.jumpToOffset(offset);
}

/** Set the mode: the page layout (`html[data-mode]`), the Source toggle and the hash flag. */
function setMode(on: boolean) {
  editing = on;
  root.dataset.mode = on ? "edit" : "view";
  shell.setMode(on);
  placeChecks();
  const hash = setEditFlag(location.hash, on);
  if (hash !== location.hash) window.history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
}

/** Settles once boot has chosen the plan this visit opens (`doc`). */
let docChosen!: () => void;
const docReady = new Promise<void>((resolve) => {
  docChosen = resolve;
});

/** Load (once) and mount the editor on the current source. */
function ensureEditor(rerender = true): Promise<EditMode | undefined> {
  // The editor opens on the plan boot chose, never on the empty document before it. Opening it
  // is a use: the app comes up (`up`) if it is not already.
  void up();
  editP ??= Promise.all([import("./edit-mode.js"), loadCore(), docReady]).then(
    ([m]) => {
      edit = m.mountEditMode({
        doc: currentSource(),
        onDocChanged,
        loadSource,
        rerender: () => void render(currentSource()),
        flash,
        mobileViews,
        gutterFor,
      });
      if (rerender) void render(currentSource());
      return edit;
    },
    (err: unknown) => {
      editP = undefined; // a failed chunk load is retried on the next entry
      flash(`The editor did not load: ${(err as { message?: string })?.message ?? err}`);
      return undefined;
    },
  );
  return editP;
}

function enterEdit(): Promise<EditMode | undefined> {
  if (!editing) setMode(true);
  // On a phone, Source is the code screen (the drawing is the other one).
  if (isNarrow()) mobileViews.show("code");
  return ensureEditor();
}

function leaveEdit() {
  setMode(false);
  // Facts and Checks are edit mode's tabs: leave on the drawing (or on the 3D preview, if on screen).
  mobileViews.show(activeTab() === "preview3d" ? "3d" : "plan");
  // A broken plan's status names where its errors are, which differs by mode.
  if (statusEl.classList.contains("err")) void render(currentSource());
}

const shell = mountShell({
  isEditing: () => editing,
  editorMounted: () => edit !== undefined,
  enterEdit,
  leaveEdit,
  whenReady: () => up(),
  getSource: () => currentSource(),
  wireChatLinks: (links) => void up().then(() => actions?.addChatLinks(links)),
  prepareChat: () => void up().then(() => actions?.prepareChat()),
  copyForLlm: () => void actions?.copyForLlm(),
});
// Share → Export → GLB's note, from the one home of its words.
fillGlbNote(document.getElementById("glbNote")!);
shell.setMode(editing);
// The one quiet pointer at Make your own (nudge.ts), after the third plan switch or the first knob
// let go; it stands down once the sheet has been opened.
const nudge = mountNudge(() => void shell.openMakeOwn());
shell.onMakeOwnOpen(() => nudge.sheetOpened());

const previewCtl = createPreview({
  viewport: pzViewport,
  stage: pzStage,
  toolbar: pzToolbar,
  getRooms: () => lastRooms,
  getSummary: () => lastSummary,
  isEditing: () => editing && edit !== undefined,
  jumpToOffset,
  onPathsChange: () => redraw(),
});
/** What `#planData` holds (scripts/gen-static.mjs, card MP5), beside the built-in drawing. */
interface BuiltInPlan {
  source: string;
  summary: SceneSummary;
  /** The warnings its compile reports: the status the live render would rest on. */
  warnings: number;
}
/**
 * The plan built into the page: its source, describe() and warning count. Null on the dev server,
 * where gen-static has not run (the element then holds its slot, no plan).
 */
const planData: BuiltInPlan | null = (() => {
  try {
    const data = JSON.parse(document.getElementById("planData")?.textContent ?? "") as Partial<BuiltInPlan>;
    return typeof data.source === "string" && data.summary && typeof data.warnings === "number"
      ? (data as BuiltInPlan)
      : null;
  } catch {
    return null;
  }
})();
// A returning visitor whose autosaved draft is the built-in plan word for word, with no `#z=`/
// `#src=` plan and no saved theme, opens on exactly the built-in drawing: the head script could not
// tell (it runs before the plan's data is parsed), so its `pg-other` is taken back here. The a11y
// switch and Paths are never restored (`autocomplete="off"`, no storage key), nor is a storey.
if (
  root.classList.contains("pg-other") &&
  planData &&
  !/[#&](?:z|src)=/.test(location.hash) &&
  !readStr(KEYS.theme) &&
  readStr(KEYS.source) === planData.source
)
  root.classList.remove("pg-other");
// The drawing built into the page pans and zooms at once, before the compiler is in — unless
// this visit opens another plan (the head script's `pg-other`), which hides it until compiled.
const adoptedBuiltIn = !root.classList.contains("pg-other") && previewCtl.adopt();

// The plan's knobs (knobs-panel.ts): a slider per top-level numeric `let`, over the drawing. A
// value is tried through `render`, which keeps the last good drawing when it does not compile.
const knobsPanel = mountKnobsPanel({
  viewport: pzViewport,
  getSource: () => currentSource(),
  // A knob being dragged redraws the plan, but Checks waits for it to be let go (`keepKnob`). The
  // panel needs the verdict at once (a value that does not compile snaps back), so a knob's
  // compile runs on the page (`renderNow`), as before card MP6.
  tryRender: (source) => renderNow(source, true),
  commit: keepKnob,
  flash,
});

/**
 * Keep a source a knob made, which has just compiled. With no editor it is the document at once,
 * and once the slider is let go (`final`) the draft, the hash and the plan's name follow, as they
 * do for an edit; the drawing has followed all along. With the editor open the editor is the
 * document, and it takes the new text on release, as one undo step; its change listener then
 * saves the draft, moves the hash and renames the plan.
 */
function keepKnob(source: string, final: boolean) {
  if (final) nudge.knobReleased();
  if (edit) {
    if (final) edit.setDoc(source);
    return;
  }
  doc = source;
  if (finishPanel) finishPanel.hidden = true;
  actions?.sourceChanged();
  if (!final) return;
  // Let go: Checks and the 3D preview catch up with the plan the knob left (the drag drew it
  // without the rings, and left the 3D preview where it was).
  if (reviewWanted() || in3d()) void render(source);
  writeStr(KEYS.source, source);
  void updateHash(source, () => editing, in3d);
  void syncPlanMark(source); // no longer the example word for word: "Edited plan"
}

// The storey switcher sits on the STAGE, under the Plan | 3D switch, in both modes and over every
// tab (ruling PG-D3), so it is visible and operable whatever is on screen — the storey it picks
// drives every view. ONE control for one piece of state: a second copy would be two things to keep
// in sync. The 3D preview leaves out the package's own "Storeys shown" cut-away, so over the 3D
// preview the switcher also offers "All" (card PG5b): the combined view of every storey, which is
// no storey picked. The drawing is one storey's sheet, with no combined state, so it has no "All";
// it stays on the storey last picked (`lastPicked`), else the lowest.
const levelSwitch = mountLevelSwitcher({
  el: storeysEl,
  onChange: (level) => {
    if (level === "all") {
      if (selectedLevel === null) return;
      selectedLevel = null;
    } else {
      if (level === selectedLevel) return;
      selectedLevel = level;
      lastPicked = level;
    }
    // Keep the current pan/zoom: the storeys of one building share a page box, so
    // re-fitting would jump the drawing for no reason.
    redraw();
  },
});

/** The 3D preview's combined view is on screen: all storeys, none picked (the facts say so). */
const showingAll = () => in3d() && selectedLevel === null && (lastPages?.length ?? 0) > 1;

/**
 * What the last render's compile said about its source: `describe()` of the whole plan and, in edit
 * mode, `lint()` (both run with the compile, in the worker). A view change that only re-narrows the
 * facts (into or out of the 3D preview's combined view) reads it again instead of describing anew.
 */
let analysis: { source: string; ok: boolean; whole: SceneSummary; lint: Diagnostic[] | null } | undefined;

/** Update the facts strip (and, in edit mode, the Facts and Checks tabs) for the last render. */
function updateAnalysis() {
  if (!core || !analysis) return;
  const { source, ok, whole, lint } = analysis;
  // The panels report the storey on screen. `describeLevel` is the CORE's narrowing —
  // the same function behind `arch describe --level N` — so the playground and the CLI
  // cannot disagree about what one floor's facts are. A single-storey plan never gets
  // here with a level, and `activeLevel === null` leaves the summary untouched.
  const summary = activeLevel === null ? whole : core.describeLevel(whole, activeLevel);
  lastRooms = ok ? (summary.rooms ?? []) : [];
  lastSummary = ok ? summary : null;
  // Under the 3D preview's combined view the facts line is every storey's, added up: describe()'s
  // own totals are the lowest storey's, so the line would otherwise say "level 1" under a building.
  renderFacts(factsEl, summary, ok, source, activeLevel, showingAll() ? whole.levels : undefined);
  // Describe (the Facts tab) and Lint (the Checks tab) are edit mode's (edit-mode.ts): a visit that
  // never opens the editor never runs `lint()`.
  edit?.updatePanels(source, ok, summary, activeLevel, lint);
}

/**
 * The storey the switcher underlines: the one on screen. Every tab shows `activeLevel` (the storey
 * last picked, else the lowest) except the 3D preview, which shows all storeys combined while none
 * is picked, so there, with no pick, "All" is pressed (`null`).
 */
function shownLevel(): number | null {
  return selectedLevel === null && preview3dEl.classList.contains("active") ? null : activeLevel;
}

/** The resting status of a plan that compiles: its warnings counted, else "ready". */
const okStatus = (warnings: number): string => (warnings ? `${warnings} warning${warnings > 1 ? "s" : ""}` : "ready");

/** The sequence number of the newest render request (compile-worker.ts drops older replies). */
let renderSeq = 0;
/** A render asked for a re-fit (a new plan) that a newer request superseded: the newer one fits. */
let refitPending = false;
/** Settled once the drawing is of that render's request or a newer one: its verdict. */
const renderWaiters: { seq: number; resolve: (ok: boolean) => void }[] = [];
/** The request in the worker, so a render of exactly the same request rides on it (`render`). */
let inFlight: { key: string; done: Promise<boolean> } | undefined;
/** Plans picked whose render has not been asked for yet (the app was still coming up). */
let picking = 0;
/**
 * `html[data-rendering]` while a render is on its way (a compile in the worker, or a plan picked
 * that has yet to compile): what is on screen is not yet the plan asked for. The e2e specs'
 * `waitForPlan` waits for it to go, as a render on the page was over before anything else ran.
 */
function paintRendering() {
  if (renderWaiters.length > 0 || picking > 0) root.dataset.rendering = "";
  else delete root.dataset.rendering;
}

/**
 * The editor's lint gutter (arch-language.js `archLinter`) asks for a document's diagnostics; they
 * come with that document's render (`CompileResult.gutter`), so the gutter compiles nothing on the
 * page. A request for a document no render will draw any more (it has changed since) gets none:
 * CodeMirror drops a lint result for a document that has changed anyway.
 */
let lastGutter: { source: string; diags: readonly Diagnostic[] } | undefined;
let gutterWaits: { text: string; resolve: (d: readonly Diagnostic[]) => void }[] = [];
function gutterFor(text: string): Promise<readonly Diagnostic[]> {
  if (lastGutter?.source === text) return Promise.resolve(lastGutter.diags);
  return new Promise((resolve) => gutterWaits.push({ text, resolve }));
}
function gutterReady(source: string, diags: readonly Diagnostic[]) {
  lastGutter = { source, diags };
  const current = currentSource();
  const waiting = gutterWaits;
  gutterWaits = [];
  for (const w of waiting) {
    if (w.text === source) w.resolve(diags);
    else if (w.text !== current)
      w.resolve([]); // stale: the editor has moved on
    else gutterWaits.push(w);
  }
}

/** A render request for `source` with the settings on screen now. */
function renderRequest(source: string): CompileRequest {
  // Lint is edit mode's: a visit that never opens the editor never runs `lint()`.
  const profile = edit ? ((document.getElementById("lintProfile") as HTMLSelectElement | null)?.value ?? "") : null;
  return {
    seq: ++renderSeq,
    source,
    theme: themeSelect.value,
    accessible: accessibleToggle?.checked === true,
    paths: previewCtl.pathsEnabled(),
    lintProfile: profile,
  };
}

/**
 * Compile and show `source` (card MP6: in the worker, so the page never waits on the compiler);
 * settles with whether it compiled without errors (else the last good drawing stays), once the
 * drawing is of this request or a newer one. A reply to an older request than the newest is
 * dropped, so the last edit always wins and an older drawing never flashes over a newer one.
 */
function render(source: string, refit = false): Promise<boolean> {
  if (!core || !jobs || !compiler) return Promise.resolve(false); // boot renders once it is in
  // The same request as the one in the worker (the debounced render a plan switch also schedules):
  // its result is this one's, so it is not compiled twice. Everything the drawing depends on is
  // in the key, so the two are the same render.
  if (refit) refitPending = true; // whichever result lands next is the new plan's, and fits it
  const key = JSON.stringify([source, renderState()]);
  if (inFlight?.key === key) return inFlight.done;
  const req = renderRequest(source);
  const done = new Promise<boolean>((resolve) => {
    renderWaiters.push({ seq: req.seq, resolve });
  });
  paintRendering();
  const mine = { key, done };
  inFlight = mine;
  void compiler.run(req).then(
    (result) => {
      if (inFlight === mine) inFlight = undefined;
      if (result && req.seq === renderSeq) show(req, result, false);
    },
    (err: unknown) => {
      if (inFlight === mine) inFlight = undefined;
      renderFailed(req, err);
    },
  );
  return done;
}

/**
 * A render whose job threw (on the page, the worker having failed): every render waiting on it
 * is over, not compiled, so nothing (a boot, `data-rendering`) waits for ever; the last good
 * drawing stays, and the status says what happened.
 */
function renderFailed(req: CompileRequest, err: unknown) {
  while (renderWaiters.length > 0 && renderWaiters[0]!.seq <= req.seq) renderWaiters.shift()!.resolve(false);
  paintRendering();
  clearTimeout(busyTimer); // a boot's "Compiling…" is over too
  if (req.seq === renderSeq) setStatus("err", "The compiler failed on this plan — try again or reload");
  console.warn("A render did not compile:", err);
}

/** What else a render's drawing and panels depend on besides its request (`render`'s key). */
function renderState(): unknown[] {
  return [
    themeSelect.value,
    accessibleToggle?.checked === true,
    previewCtl.pathsEnabled(),
    edit ? ((document.getElementById("lintProfile") as HTMLSelectElement | null)?.value ?? "") : null,
    selectedLevel,
    lastPicked,
    editing,
    activeTab(),
    checksOn,
    checks !== undefined,
  ];
}

/**
 * Compile and show `source` on the page, now; whether it compiled without errors. For a knob
 * being dragged (`knobMoving`), whose panel needs the verdict at once.
 */
function renderNow(source: string, knobMoving = false): boolean {
  if (!core || !jobs || !compiler) return false;
  const req = renderRequest(source);
  inFlight = undefined;
  return show(req, compiler.runNow(req), knobMoving);
}

/** Show a render's result (from `render` or `renderNow`); whether it compiled without errors. */
function show(req: CompileRequest, result: CompileResult, knobMoving: boolean): boolean {
  const { source } = req;
  const refit = refitPending;
  refitPending = false;
  // Every render waiting on this request or an older one is over: the drawing is at least theirs.
  const ok = result.errors.length === 0;
  // In the order they were made, so what each does next happens in that order too.
  while (renderWaiters.length > 0 && renderWaiters[0]!.seq <= req.seq) renderWaiters.shift()!.resolve(ok);
  paintRendering();
  root.dataset.compiler = compiler?.where() ?? "page";
  if (result.gutter) gutterReady(source, result.gutter);
  const { svg, errors, diagnostics, pages } = result;
  // The 3D preview draws the core's light drawing: this compile is that drawing unless a theme
  // overrides it, so it is handed over and the tab does not compile the source a second time.
  lastDrawn = req.theme ? undefined : { source, drawn: { svg, pages, errors } };
  // The 3D preview follows the editor only while its tab is open (and once loaded).
  // The storey it shows is the switcher's explicit selection (none = the combined view). A new
  // plan (a document replaced, `refit`: the gallery, a snapshot) opens on its end frame,
  // as the tab does (card X5); an edit goes on from where the view was. A knob being dragged
  // waits: the 3D preview is rebuilt once it is let go (`keepKnob`).
  if (preview3d && in3d() && !knobMoving)
    void preview3d.then((p) =>
      refit ? p?.show(source, selectedLevel, drawnFor(source)) : p?.update(source, selectedLevel, drawnFor(source)),
    );
  // `pages` exists ONLY for a plan with `level` blocks; a single-storey plan has no such
  // key, `selectPage` returns undefined for it, and everything below takes the exact
  // path it always took — the drawing, the exports and the panels are all unmoved.
  //
  // It is also absent while the source does not compile, so the switcher is rebuilt only
  // on a GOOD compile — same doctrine as the preview below, which keeps the last good
  // drawing. Otherwise a half-typed statement would blink the storey buttons away and
  // back under a drawing that never changed.
  // The drawing is one storey: the one picked, else (under "All") the one last picked, else the lowest.
  const page = ok ? selectPage(pages, selectedLevel ?? lastPicked) : undefined;
  if (ok) {
    activeLevel = page?.level ?? null;
    lastPages = pages;
    levelSwitch.set(pages, shownLevel(), in3d());
  }
  analysis = { source, ok, whole: result.whole, lint: result.lint };
  updateAnalysis();
  // Like the 3D preview, the takeoff follows the editor and the storey only while its tab is open.
  if (takeoff && factsView.classList.contains("active")) void takeoff.then((p) => p?.update(source, activeLevel));
  // The diagnostics drawer, its phone count and a live Intent verdict are edit mode's.
  edit?.afterCompile(source, diagnostics);
  clearTimeout(busyTimer);
  if (!ok) {
    const n = errors.length;
    // In view mode the diagnostics are out of sight: say where they are.
    setStatus("err", `${n} error${n > 1 ? "s" : ""}${editing ? "" : " — open Source to see them"}`);
    knobsPanel.refresh(); // a document that does not compile has no knobs to move
    return false; // keep last good preview
  }
  // A plan that compiles is fine: the notice goes, and the live region keeps the verdict.
  setStatus("ok", okStatus(diagnostics.filter((d) => d.severity === "warning").length));
  // The export SVG (lastSvg) is always overlay-free; the "Paths" toggle's drawing is a second
  // compile with the circulation overlay (made with this one) for the on-screen preview only, so
  // downloads/copies never carry it (matching how annotate is stripped for export).
  const pageSvg = page ? page.svg : svg;
  let displaySvg = pageSvg;
  if (result.paths) {
    // Pick the SAME storey out of the overlay compile — reading `.svg` would silently
    // draw page 1's circulation over whatever storey is selected.
    displaySvg = selectPage(result.paths.pages, activeLevel)?.svg ?? result.paths.svg;
  }
  // Checks: the review rings over the drawing on screen, and their list (over the drawing in view
  // mode; in edit mode the Checks tab, which lists them whether or not they are drawn). Like the
  // Paths overlay the rings are never in `lastSvg`, which every export reads, so a download is the
  // same with Checks on or off. A knob mid-drag draws without them: the review runs once, when the
  // knob is let go.
  if (checks && reviewWanted()) {
    if (knobMoving) checks.pending();
    else {
      const ringed = checks.overlay(displaySvg, source, activeLevel);
      if (checksOn) displaySvg = ringed;
    }
  }
  previewCtl.show(displaySvg, refit);
  if (checksOn) checks?.shown();
  lastSvg = pageSvg;
  lastGood = { req, level: activeLevel };
  // The knobs read the parse's top-level statements and grid, which is all `knobPlan` carries.
  knobsPanel.sync(source, result.knobPlan as PlanNode | undefined);
  return true;
}

/**
 * Redraw the plan on screen for a changed view setting (the theme, a11y, Paths, a storey). Before
 * the app is up that is a use like any other: it brings the app up, whose first render draws the
 * settings as they are by then.
 */
function redraw() {
  if (isUp) void render(currentSource());
  else void up();
}

// ---- Checks (card P6): the review rings `arch preview --review` draws, over the drawing ----
// A layer of the drawing (ruling PG-D3): a pressed-state toggle on the stage's toolbar, beside Paths,
// which leaves with the drawing when the 3D preview is on screen (the rings are 2D only). Off on
// every visit (not persisted). Its findings list floats over the drawing in view mode while the
// rings are on; in edit mode it is the first section of the Checks tab. The panel and the review
// code load on the first switch-on, or on the Checks tab's first open in edit mode.
const checksBtn = document.getElementById("checks") as HTMLButtonElement;
let checksOn = false;
let checks: ChecksPanel | undefined;
let checksP: Promise<ChecksPanel | undefined> | undefined;
/** Whether the review runs: the rings are on, or edit mode's Checks tab (which lists it) is open. */
function reviewWanted(): boolean {
  return checksOn || (editing && activeTab() === "checks");
}
/** The findings list: in edit mode the Checks tab's, always shown there; else over the drawing. */
function placeChecks() {
  if (!checks) return;
  checks.dock(editing ? checksHost : null);
  checks.setVisible(editing || checksOn);
}
function loadChecks(): Promise<ChecksPanel | undefined> {
  checksP ??= import("./checks-panel.js").then(
    (m) => {
      checks = m.mountChecks({
        viewport: pzViewport,
        stage: pzStage,
        isEditing: () => editing && edit !== undefined,
        jumpToOffset,
        lintProfile: () => {
          // The Lint selector once edit mode has filled it, else the profile it will restore.
          const sel = document.getElementById("lintProfile") as HTMLSelectElement | null;
          return sel && sel.options.length > 0 ? sel.value : (readStr(KEYS.lintProfile) ?? "");
        },
        openSample: switchPlan,
      });
      placeChecks();
      return checks;
    },
    (err: unknown) => {
      checksP = undefined; // a failed chunk load is retried on the next press
      // Nothing is drawn, so the button does not say Checks is on.
      checksOn = false;
      checksBtn.setAttribute("aria-pressed", "false");
      checksBtn.classList.remove("active");
      flash(`Checks did not load: ${(err as { message?: string })?.message ?? err}`);
      return undefined;
    },
  );
  return checksP;
}
checksBtn.addEventListener("click", () => {
  checksOn = !checksOn;
  checksBtn.setAttribute("aria-pressed", String(checksOn));
  // Pressed, it wears the toolbar's active dress, as Paths does.
  checksBtn.classList.toggle("active", checksOn);
  placeChecks();
  void Promise.all([loadChecks(), up()]).then(() => {
    placeChecks();
    void render(currentSource());
  });
});
// Edit mode's Checks tab lists the findings whether or not the rings are drawn.
document.getElementById("tab-checks")?.addEventListener("click", () => {
  if (!editing) return;
  void Promise.all([loadChecks(), up()]).then(() => {
    if (reviewWanted()) void render(currentSource());
  });
});

// ---- 3D preview (card A5): three.js and archlang-3d load on the tab's first open, like jsPDF ----
let preview3d: Promise<import("./preview3d.js").Preview3d | undefined> | undefined;
/** The editor's last compile, kept for the 3D tab (`undefined` under a theme override). */
let lastDrawn: { source: string; drawn: import("./preview3d.js").Drawn } | undefined;
const drawnFor = (source: string) => (lastDrawn?.source === source ? lastDrawn.drawn : undefined);
document.getElementById("tab-preview3d")?.addEventListener("click", () => {
  preview3d ??= import("./preview3d.js").then(
    (m) => m.mountPreview3d(preview3dEl),
    (err: unknown) => {
      preview3d = undefined; // a failed chunk load is retried on the next open
      preview3dEl.textContent = `The 3D preview did not load: ${(err as { message?: string })?.message ?? err}`;
      return undefined;
    },
  );
  const shown = preview3d;
  stageSwitched(); // the knobs move over the canvas once the chunk is in
  // Opened before the first compile, it shows the plan the page boots on (and opening it is a use).
  void up().then(() => {
    const source = currentSource();
    void shown.then((p) => p?.show(source, selectedLevel, drawnFor(source)));
  });
});

// ---- Takeoff: the core's quantities, the Facts tab's second section; its code loads on the
// tab's first open ----
let takeoff: Promise<import("./takeoff-panel.js").TakeoffPanel | undefined> | undefined;
document.getElementById("tab-facts")?.addEventListener("click", () => {
  takeoff ??= import("./takeoff-panel.js").then(
    (m) => m.mountTakeoff(takeoffEl, { flash }),
    (err: unknown) => {
      takeoff = undefined; // a failed chunk load is retried on the next open
      takeoffEl.textContent = `The takeoff did not load: ${(err as { message?: string })?.message ?? err}`;
      return undefined;
    },
  );
  const opened = takeoff;
  void up().then(() => {
    const source = currentSource();
    void opened.then((p) => p?.update(source, activeLevel));
  });
});

let debounce: ReturnType<typeof setTimeout>;
/** Set once the header actions mount; told of every document change. */
let actions: ActionsHandle | undefined;
function onDocChanged(source: string) {
  doc = source;
  // The Finish log describes the document it ran on; any later change (an edit, an
  // undo, a new example) makes it stale. Finish re-shows it after its own edit.
  if (finishPanel) finishPanel.hidden = true;
  actions?.sourceChanged();
  clearTimeout(debounce);
  // Any change (an edit, a plan picked: `loadSource`) makes an earlier change's save stale at
  // once, not when its own debounce fires: a render in the worker for an edit must not save that
  // edit over a plan picked meanwhile.
  const mine = ++docRenders;
  debounce = setTimeout(() => {
    // Once the drawing is of this source (the worker's compile is in), and only for the newest
    // change: the draft, the hash and the plan's name follow what is on screen.
    void render(source).then(() => {
      if (mine !== docRenders) return; // a later change saves its own
      if (analysis?.source !== source) return; // another plan is on screen: it saves itself
      writeStr(KEYS.source, source); // autosave the working draft (restored on reload)
      void updateHash(source, () => editing, in3d); // keep the permalink in sync (compression is async)
      void syncPlanMark(source); // the gallery: still that example, or an edited plan
    });
  }, 250);
}
/** Counts document changes (`onDocChanged`): only the newest one's render saves. */
let docRenders = 0;

/**
 * Surface an export failure: the reason in the status notice on the stage, where the visitor is in
 * either mode (the diagnostics drawer, `#errors`, is edit mode's and hidden in view mode), and in
 * the drawer too.
 */
function onExportError(format: string, err: unknown) {
  const text = `${format.toUpperCase()} export failed: ${(err as { message?: string })?.message ?? err}`;
  setStatus("err", text);
  errorsEl.classList.add("show");
  errorsEl.textContent = text;
}

/** The status before `working` took it, put back when the work is over. */
let beforeWork: { state: StatusState; text: string } | undefined;
/** Say on the stage that something is under way (an export), or (`null`) that it is over. */
function working(msg: string | null) {
  if (msg !== null) {
    beforeWork ??= {
      state: statusState,
      text: flashTimer !== undefined ? (flashResting ?? "") : (statusText.textContent ?? ""),
    };
    setStatus("busy", msg);
    return;
  }
  const back = beforeWork;
  beforeWork = undefined;
  if (back && statusState === "busy") setStatus(back.state, back.text);
}

/**
 * Open the example labelled `label` (a gallery card's). The gallery says so at once;
 * an example picked before the app is up is loaded once it is.
 */
function pickExample(label: string) {
  markPlan(label);
  // The plan is on its way from now (`data-rendering`), though it compiles once the app is up.
  picking++;
  paintRendering();
  void up()
    .then(async () => {
      const { EXAMPLES, samples } = await loadExamples();
      const source = EXAMPLES[label] ?? samples.sampleSource(label);
      if (source === undefined) return;
      markPlan(label);
      loadSource(source, true);
    })
    .finally(() => {
      picking--;
      paintRendering();
    });
}
/** A plan picked by the visitor (a gallery card, the Checks sample pointer), which counts towards the nudge. */
function switchPlan(label: string) {
  pickExample(label);
  nudge.planSwitched();
}
// The gallery's cards and thumbnails are in the served page (gen-static.mjs): nothing here waits
// for the example sources to mark or move through them.
const gallery = mountGallery(document.getElementById("gallery") as HTMLDetailsElement, switchPlan);

// Theme switch (B2) — re-render the preview only; describe/lint are theme-agnostic.
themeSelect.addEventListener("change", () => {
  writeStr(KEYS.theme, themeSelect.value);
  redraw();
});

// a11y metadata switch — re-compile so the <title>/<desc> land in the preview SVG
// (and therefore in every SVG export, which reads from the same bytes).
accessibleToggle?.addEventListener("change", () => redraw());

/** What boot chose before any chunk loads: the plan this visit opens, as far as it can tell. */
interface Choice {
  sharedSrc: string | null;
  savedSrc: string | null;
  /** The plan built into the page (`#planData`), when this visit opens on it as drawn; else null. */
  built: BuiltInPlan | null;
}

/** First-load source precedence: shared URL hash → autosaved draft → the default example. */
async function choose(): Promise<Choice> {
  const sharedSrc = await srcFromHash();
  const savedSrc = sharedSrc ? null : readStr(KEYS.source);
  // Restore persisted UI prefs (advisory — never block on storage). A saved theme makes the head
  // script's `pg-other`, so the built-in drawing (in the default theme) is not this visit's.
  const savedTheme = readStr(KEYS.theme);
  if (savedTheme !== null && [...themeSelect.options].some((o) => o.value === savedTheme)) {
    themeSelect.value = savedTheme;
  }
  // The built-in drawing is this visit's when it was adopted (no `pg-other`), no link or other
  // draft opens instead, and nothing the browser restored (a form control) draws it differently.
  const built =
    adoptedBuiltIn &&
    planData &&
    !sharedSrc &&
    (savedSrc === null || savedSrc === planData.source) &&
    themeSelect.value === "" &&
    accessibleToggle?.checked !== true
      ? planData
      : null;
  if (built) {
    // Everything the live page would show for it is in the page: the drawing (adopted above), the
    // facts line, the status, and the rooms' facts the hover tip and the room card read. No
    // compile needed until a use asks for one.
    doc = built.source;
    lastSummary = built.summary;
    lastRooms = built.summary.rooms ?? [];
    setStatus("ok", okStatus(built.warnings));
    docChosen();
  }
  return { sharedSrc, savedSrc, built };
}

/** The app is up: the compiler in, the header actions mounted, the plan rendered by it. */
let isUp = false;
let readyP: Promise<void> | undefined;
// A first compile slow enough to notice says so (the notice and Source's dot); a quick one shows
// nothing. Armed only by a use (or a visit that must compile at once), never by an idle load: the
// drawing is already on screen then, and nothing is waiting.
let busyTimer: ReturnType<typeof setTimeout> | undefined;
const chosen = choose();

/**
 * Bring the app up, once: load the compiler and the example sources, mount the header actions and
 * render the plan. Every use that needs the compiler calls it, and nothing else does (the idle
 * import compiles nothing). A boot that fails (the compiler's or the examples' chunk did not load)
 * says so instead of "Compiling…" for ever: the busy timer is stopped and the status is an error.
 * The promise still settles, so nothing waiting on it is left with an unhandled rejection; without
 * `core`, `render` does nothing. The failure is not kept: the next use tries again.
 */
function up(): Promise<void> {
  if (isUp) return readyP ?? Promise.resolve();
  if (readyP === undefined) {
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => setStatus("busy", "Compiling…"), BUSY_AFTER_MS);
    readyP = chosen.then(start).catch((err: unknown) => {
      readyP = undefined; // the next use retries
      clearTimeout(busyTimer);
      setStatus("err", "Couldn't load the compiler — try again or reload");
      // This boot is over, failed: nothing waiting for `data-booting` to go is left waiting for
      // ever, and `data-boot-failed` says how it ended (card PG5b ⑥) until a retry succeeds.
      delete root.dataset.booting;
      root.dataset.bootFailed = "";
      console.warn("The playground did not boot:", err);
    });
  }
  return readyP;
}

async function start({ sharedSrc, savedSrc, built }: Choice): Promise<void> {
  const corePending = loadCore();
  const jobsPending = loadJobs();
  const examples = await loadExamples();
  const { DEFAULT_EXAMPLE, EXAMPLES } = examples;
  fillGallery(examples);
  if (built) {
    // The page's own plan, which the gallery already names; unless a plan was picked meanwhile
    // (`pickExample` names it again once this is up).
    markPlan(DEFAULT_EXAMPLE);
  } else {
    const initialDoc = sharedSrc ?? savedSrc ?? EXAMPLES[DEFAULT_EXAMPLE];
    // The gallery names the plan this visit opens: the default, or the example a link
    // or a draft is word for word, or neither (a plan of someone's own is no example).
    if (!sharedSrc && !savedSrc) markPlan(DEFAULT_EXAMPLE);
    else
      markPlan(
        examples.exampleLabelFor(initialDoc) ?? examples.samples.sampleLabelFor(initialDoc) ?? null,
        sharedSrc ? "Shared plan" : "Saved draft",
      );

    // A `#z=` payload that is not one of the bundled examples is third-party text on
    // our page — say so, once, at the top of the stage. Silent for a stock-example
    // permalink and for a hash-less visit. See shared-notice.ts for why it is not
    // remembered. Above the Plan | 3D switch, not inside the drawing's panel: the 3D
    // preview shows the same plan, its names included, so it is attributed too (card X5). A boot
    // that is a retry (the first one failed after this point) finds it there already.
    if (
      !document.querySelector(".shared-notice") &&
      shouldShowSharedNotice(sharedSrc, [...Object.values(EXAMPLES), ...examples.samples.SAMPLES.map((s) => s.source)])
    ) {
      stageSwitchRow.before(createSharedNotice());
    }
    doc = initialDoc;
    docChosen();
  }

  core = await corePending;
  jobs = await jobsPending;
  // Renders compile in the worker from here on; on a browser where it cannot run, on the page.
  compiler ??= jobs.createCompileClient();
  // A task of its own for what follows: the compiler's module has just run in this one, so the
  // first render does not add to that long task (a tap in between is handled between the two).
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (editing) await ensureEditor(false);

  // Header actions: format, finish, repair, embed, copy link, snapshots, download, and the
  // pane divider. Their code reads the compiler, so it loads with it; until it is mounted
  // their buttons are disabled in index.html.
  const { mountActions } = await import("./actions.js");
  actions = mountActions({
    getSource: currentSource,
    loadSource,
    flash,
    getCleanSvg: cleanSvg,
    // The Scene of the drawing on screen, compiled on the page on demand (a DXF or TXT download):
    // the one compile output a render does not send from the worker.
    getScene: () => (lastGood && jobs ? jobs.sceneFor(lastGood.req, lastGood.level) : null),
    getLevel: () => activeLevel,
    onExportError,
    working,
    isEditing: () => editing,
    is3d: in3d,
    showChecksTab: () => openTab("checks"),
    getThemeOverride: () => themeSelect.value,
    els: {
      formatBtn: document.getElementById("formatSrc") as HTMLButtonElement | null,
      finishBtn: document.getElementById("finishSrc") as HTMLButtonElement | null,
      finishPanel,
      // The chat links are the Make-your-own sheet's, handed over when it is first drawn (shell.ts).
      chatLinks: [],
      repairBtn: document.getElementById("repair"),
      repairPanel: document.getElementById("repairPanel"),
      embedBtn: document.getElementById("embed"),
      // The links, Embed and the exports sit in the Share menu: choosing one closes it.
      shareMenu: document.getElementById("share") as HTMLDetailsElement | null,
      copyShortLinkBtn: document.getElementById("copyShortLink"),
      copyLinkBtn: document.getElementById("copyLink")!,
      savedBtn: document.getElementById("saved") as HTMLButtonElement,
      copySvgBtn: document.getElementById("copySvg"),
      copyPngBtn: document.getElementById("copyPng"),
      downloadBtns: [...document.querySelectorAll<HTMLElement>("#share [data-download]")],
    },
  });
  // Up from here: a setting changed while the first render is in the worker (`redraw`) renders
  // again with it, instead of waiting on a render made before it changed.
  isUp = true;
  if (built && !editing) {
    // The plan on screen is the built-in one, drawn as this render draws it (gen-static's
    // `LIVE_RENDER`): no re-fit, so a drawing the visitor has panned or zoomed stays where it is.
    // (Edit mode re-fits as it always has: the editor beside it is new.)
    await render(currentSource());
  } else {
    // Initial render — fit the plan to the viewport, then re-fit once layout settles.
    await render(currentSource(), true);
    requestAnimationFrame(() => previewCtl.fit());
  }
  // The exports and links read the drawing this render made (it lands from the worker), so they
  // come on with it.
  for (const btn of document.querySelectorAll<HTMLButtonElement>(":is(#share, #more) button[disabled]"))
    btn.disabled = false;
  // The e2e specs' "the app is up" signal (fixtures.ts `waitForPlan`).
  delete root.dataset.booting;
  delete root.dataset.bootFailed;
}

/**
 * The idle import (ruling MP-D4): once the page has loaded and the browser has time to spare, fetch
 * and run the compiler's and the example sources' modules, so the first use finds them in, and add
 * the gallery's samples group (data from the examples chunk), and nothing more: no compile, no
 * describe, no render, the built-in drawing stays the element it is.
 * The first use compiles (`up`). Never under Save-Data or on a 2g connection, where a visit pays
 * only for what it uses. No deadline is passed to `requestIdleCallback`, so the browser is never
 * forced into it; one without it (Safari) waits `IDLE_FALLBACK_MS` after `load`. A failed import
 * says nothing (the drawing is all there): the loaders forget it, and a use tries again.
 *
 * Once the modules are in, the page is up as far as the e2e specs' `waitForPlan` can see
 * (`data-booting` goes): every control works, the uses that need a compile making one.
 */
const IDLE_FALLBACK_MS = 3000;
function importWhenIdle() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  if (connection?.saveData === true || /^(?:slow-)?2g$/.test(connection?.effectiveType ?? "")) return;
  const warm = () =>
    void Promise.all([loadCore(), loadExamples(), loadJobs()]).then(
      ([, examples]) => {
        // The gallery's samples group is data, not a compile: it joins the gallery now, as at boot.
        fillGallery(examples);
        delete root.dataset.booting;
      },
      (err: unknown) => console.warn("The compiler did not load in the background (a use retries):", err),
    );
  const go = () => {
    if ("requestIdleCallback" in window) requestIdleCallback(warm);
    else setTimeout(warm, IDLE_FALLBACK_MS);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

// Opening the gallery, Share or ⋯ is a use: the samples, the actions and the theme need the app.
for (const id of ["gallery", "share", "more"])
  document.getElementById(id)?.addEventListener("toggle", (e) => {
    if ((e.currentTarget as HTMLDetailsElement).open) void up();
  });

// A visit on the built-in plan compiles on its first use (the idle import only warms the modules);
// any other visit, `&edit` (the editor opens at once) and `&3d` (below) compile at once, as before.
void chosen.then(({ built }) => {
  if (built && !editing && !has3dFlag(location.hash)) importWhenIdle();
  else void up();
});
// `&3d` (or `#3d` alone) opens on the 3D preview (card X5): its chunk starts loading now, beside
// the compiler, and it shows the plan the visit opens once that is compiled, at its end frame.
if (has3dFlag(location.hash)) openTab("preview3d");
firstPaint = false;
