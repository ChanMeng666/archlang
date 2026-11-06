/**
 * The playground's startup module: the view path. It shows the drawing (the one built into the
 * page first, then the compiled one), pans and zooms it, reports its facts, switches storeys and
 * plans (the plan gallery in the header) and runs the header. Everything heavier is its own chunk, loaded when it is needed:
 *
 * - the compiler (`archlang`, the `compiler` chunk, preloaded by index.html but not
 *   render-blocking) and the example sources: fetched as soon as this module runs;
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
import type { CompileOptions, DescribeOptions, RoomSummary, SceneSummary } from "archlang";
import type { ActionsHandle } from "./actions.js";
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

// Both start now, in parallel, after this module has run: the drawing is already on screen.
const coreP: Promise<Core> = import("./compiler.js");
const examplesP: Promise<Examples> = Promise.all([import("./examples.js"), import("./samples.js")]).then(
  ([examples, samples]) => ({ ...examples, samples }),
);
/** The compiler, once loaded. Nothing compiles before it. */
let core: Core | undefined;

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
 * tabs, and the page's first paint, never fade: a `&3d` link opens the 3D preview while the page
 * still boots (`data-booting`), and that is no switch.
 */
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const fadeViews = [preview, preview3dEl];
function fadeIn(el: HTMLElement | undefined, from: string | undefined) {
  // Every switch first clears a fade still running: a view hidden mid-fade cancels its animation,
  // and its class must not outlive it.
  for (const v of fadeViews) v.classList.remove("pg-fade-in");
  if (!el || root.dataset.mode === "edit" || reducedMotion.matches || "booting" in root.dataset) return;
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
    if (lastPages && selectedLevel === null && (from === "preview3d") !== in3d())
      updateAnalysis(currentSource(), lastOk);
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
  return examplesP.then(({ exampleLabelFor, samples }) => {
    if (currentSource() !== source) return; // a later change syncs again
    markPlan(exampleLabelFor(source) ?? samples.sampleLabelFor(source) ?? null);
  });
}

// The shareable-permalink codec (`#z=` compressed / legacy `#src=`) lives in
// `share.js` so the embed page reuses the exact same scheme.

/** The plan's source. The editor's document mirrors it once edit mode has loaded. */
let doc = "";
let lastSvg = "";
let lastScene: ReturnType<Core["compile"]>["scene"] | null = null;
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
/** The last compile drew the plan without errors (the facts line is redrawn on a view change). */
let lastOk = false;
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
  render(src, refit);
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
  // The editor opens on the plan boot chose, never on the empty document before it.
  editP ??= Promise.all([import("./edit-mode.js"), coreP, docReady]).then(
    ([m]) => {
      edit = m.mountEditMode({
        doc: currentSource(),
        onDocChanged,
        loadSource,
        rerender: () => render(currentSource()),
        flash,
        mobileViews,
      });
      if (rerender) render(currentSource());
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
  if (statusEl.classList.contains("err")) render(currentSource());
}

const shell = mountShell({
  isEditing: () => editing,
  editorMounted: () => edit !== undefined,
  enterEdit,
  leaveEdit,
  whenReady: () => ready,
  getSource: () => currentSource(),
  wireChatLinks: (links) => void ready.then(() => actions?.addChatLinks(links)),
  prepareChat: () => void ready.then(() => actions?.prepareChat()),
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
  onPathsChange: () => render(currentSource()),
});
// The drawing built into the page pans and zooms at once, before the compiler is in — unless
// this visit opens another plan (the head script's `pg-other`), which hides it until compiled.
if (!root.classList.contains("pg-other")) previewCtl.adopt();

// The plan's knobs (knobs-panel.ts): a slider per top-level numeric `let`, over the drawing. A
// value is tried through `render`, which keeps the last good drawing when it does not compile.
const knobsPanel = mountKnobsPanel({
  viewport: pzViewport,
  getSource: () => currentSource(),
  // A knob being dragged redraws the plan, but Checks waits for it to be let go (`keepKnob`).
  tryRender: (source) => render(source, false, true),
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
  if (reviewWanted() || in3d()) render(source);
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
    render(currentSource());
  },
});

/** The 3D preview's combined view is on screen: all storeys, none picked (the facts say so). */
const showingAll = () => in3d() && selectedLevel === null && (lastPages?.length ?? 0) > 1;

/** Update the facts strip (and, in edit mode, the Facts and Checks tabs) for `source`. */
function updateAnalysis(source: string, ok: boolean) {
  if (!core) return;
  const whole = core.describe(source, { noCache: true } as DescribeOptions & { noCache?: boolean });
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
  edit?.updatePanels(source, ok, summary, activeLevel);
}

/**
 * The storey the switcher underlines: the one on screen. Every tab shows `activeLevel` (the storey
 * last picked, else the lowest) except the 3D preview, which shows all storeys combined while none
 * is picked, so there, with no pick, "All" is pressed (`null`).
 */
function shownLevel(): number | null {
  return selectedLevel === null && preview3dEl.classList.contains("active") ? null : activeLevel;
}

/** Compile and show `source`; whether it compiled without errors (else the last good drawing stays). */
function render(source: string, refit = false, knobMoving = false): boolean {
  if (!core) return false; // nothing compiles before the compiler is in; boot renders once it is
  const { compile, THEMES } = core;
  // Theme: empty value = the source's own `theme` directive (pass nothing); a named
  // key overrides it (compile's `theme` option wins over an in-source directive).
  const themeKey = themeSelect.value;
  // annotate: stamp data-span on primitives so a click in the preview can jump to
  // source (interact.js). Exports strip it (cleanSvg) so downloads stay clean.
  // accessible: emit SVG <title>/<desc>/role from `accTitle`/`accDescr` (or, absent
  // those, describe()'s caption). Opt-in — the default output stays byte-identical
  // (ADR 0007), which is exactly why it needs a toggle to be visible at all.
  const accessible = accessibleToggle?.checked === true;
  const opts: CompileOptions = themeKey
    ? { noCache: true, annotate: true, accessible, theme: THEMES[themeKey] }
    : { noCache: true, annotate: true, accessible };
  const { svg, errors, diagnostics, scene, pages, ast } = compile(source, opts);
  const ok = errors.length === 0;
  // The 3D preview draws the core's light drawing: this compile is that drawing unless a theme
  // overrides it, so it is handed over and the tab does not compile the source a second time.
  lastDrawn = themeKey ? undefined : { source, drawn: { svg, pages, errors } };
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
  lastOk = ok;
  if (ok) {
    activeLevel = page?.level ?? null;
    lastPages = pages;
    levelSwitch.set(pages, shownLevel(), in3d());
  }
  updateAnalysis(source, ok);
  // Like the 3D preview, the takeoff follows the editor and the storey only while its tab is open.
  if (takeoff && factsView.classList.contains("active")) void takeoff.then((p) => p?.update(source, activeLevel));
  // The diagnostics drawer, its phone count and a live Intent verdict are edit mode's.
  edit?.afterCompile(source, diagnostics ?? []);
  clearTimeout(busyTimer);
  if (!ok) {
    const n = errors.length;
    // In view mode the diagnostics are out of sight: say where they are.
    setStatus("err", `${n} error${n > 1 ? "s" : ""}${editing ? "" : " — open Source to see them"}`);
    knobsPanel.refresh(); // a document that does not compile has no knobs to move
    return false; // keep last good preview
  }
  // A plan that compiles is fine: the notice goes, and the live region keeps the verdict.
  const warns = (diagnostics ?? []).filter((d) => d.severity === "warning");
  setStatus("ok", warns.length ? `${warns.length} warning${warns.length > 1 ? "s" : ""}` : "ready");
  // The export SVG (lastSvg) is always overlay-free; the "Paths" toggle re-compiles
  // with the circulation overlay for the on-screen preview only, so downloads/copies
  // never carry it (matching how annotate is stripped for export).
  const pageSvg = page ? page.svg : svg;
  let displaySvg = pageSvg;
  if (previewCtl.pathsEnabled()) {
    const overlaid = compile(source, { ...opts, overlays: ["circulation"] });
    // Pick the SAME storey out of the overlay compile — reading `.svg` would silently
    // draw page 1's circulation over whatever storey is selected.
    displaySvg = selectPage(overlaid.pages, activeLevel)?.svg ?? overlaid.svg;
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
  lastScene = (page ? page.scene : scene) ?? null;
  knobsPanel.sync(source, ast);
  return true;
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
  void Promise.all([loadChecks(), ready]).then(() => {
    placeChecks();
    render(currentSource());
  });
});
// Edit mode's Checks tab lists the findings whether or not the rings are drawn.
document.getElementById("tab-checks")?.addEventListener("click", () => {
  if (!editing) return;
  void Promise.all([loadChecks(), ready]).then(() => {
    if (reviewWanted()) render(currentSource());
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
  // Opened before the first compile, it shows the plan the page boots on.
  void ready.then(() => {
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
  void ready.then(() => {
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
  debounce = setTimeout(() => {
    render(source);
    writeStr(KEYS.source, source); // autosave the working draft (restored on reload)
    void updateHash(source, () => editing, in3d); // keep the permalink in sync (compression is async)
    void syncPlanMark(source); // the gallery: still that example, or an edited plan
  }, 250);
}

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
  void ready.then(async () => {
    const { EXAMPLES, samples } = await examplesP;
    const source = EXAMPLES[label] ?? samples.sampleSource(label);
    if (source === undefined) return;
    markPlan(label);
    loadSource(source, true);
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
  render(currentSource());
});

// a11y metadata switch — re-compile so the <title>/<desc> land in the preview SVG
// (and therefore in every SVG export, which reads from the same bytes).
accessibleToggle?.addEventListener("change", () => render(currentSource()));

async function boot() {
  // First-load source precedence: shared URL hash → autosaved draft → default example.
  const sharedSrc = await srcFromHash();
  const savedSrc = sharedSrc ? null : readStr(KEYS.source);
  const examples = await examplesP;
  const { DEFAULT_EXAMPLE, EXAMPLES } = examples;
  fillGallery(examples);
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
  // preview shows the same plan, its names included, so it is attributed too (card X5).
  if (
    shouldShowSharedNotice(sharedSrc, [...Object.values(EXAMPLES), ...examples.samples.SAMPLES.map((s) => s.source)])
  ) {
    stageSwitchRow.before(createSharedNotice());
  }

  // Restore persisted UI prefs (advisory — never block on storage).
  const savedTheme = readStr(KEYS.theme);
  if (savedTheme !== null && [...themeSelect.options].some((o) => o.value === savedTheme)) {
    themeSelect.value = savedTheme;
  }

  doc = initialDoc;
  docChosen();
  core = await coreP;
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
    getScene: () => lastScene,
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
  for (const btn of document.querySelectorAll<HTMLButtonElement>(":is(#share, #more) button[disabled]"))
    btn.disabled = false;

  // Initial render — fit the plan to the viewport, then re-fit once layout settles.
  render(initialDoc, true);
  requestAnimationFrame(() => previewCtl.fit());
  // The e2e specs' "the app is up" signal (fixtures.ts `waitForPlan`).
  delete root.dataset.booting;
}

// Bootstrap (async — resolves the shared/saved source, then loads the compiler). A first compile
// slow enough to notice says so (the notice and Source's dot); a quick one shows nothing.
// A boot that fails (the compiler's or the examples' chunk did not load) says so instead of
// "Compiling…" for ever: the busy timer is stopped and the status is an error. `ready` still
// settles, so nothing waiting on it is left with an unhandled rejection; without `core`, `render`
// does nothing.
const busyTimer = setTimeout(() => setStatus("busy", "Compiling…"), BUSY_AFTER_MS);
const ready = boot().catch((err: unknown) => {
  clearTimeout(busyTimer);
  setStatus("err", "Couldn't load the compiler — reload to retry");
  // The boot is over, failed: nothing waiting for `data-booting` to go is left waiting for ever,
  // and `data-boot-failed` says how it ended (card PG5b ⑥).
  delete root.dataset.booting;
  root.dataset.bootFailed = "";
  console.warn("The playground did not boot:", err);
});
// `&3d` (or `#3d` alone) opens on the 3D preview (card X5): its chunk starts loading now, beside
// the compiler, and it shows the plan the visit opens once that is compiled, at its end frame.
if (has3dFlag(location.hash)) openTab("preview3d");
