/**
 * The playground's startup module: the view path. It shows the drawing (the one built into the
 * page first, then the compiled one), pans and zooms it, reports its facts, switches storeys and
 * plans (the picker and the thumbnail strip) and runs the header. Everything heavier is its own chunk, loaded when it is needed:
 *
 * - the compiler (`archlang`, the `compiler` chunk, preloaded by index.html but not
 *   render-blocking) and the example sources: fetched as soon as this module runs;
 * - the header actions (actions.ts): once the compiler is in;
 * - the editor and its panels (edit-mode.ts: CodeMirror, completion, diagnostics, Describe,
 *   Lint, Intent): on the first entry into edit mode;
 * - the Takeoff and 3D preview tabs, jsPDF: on first use, as before.
 *
 * Modes: `view` (the default) gives the drawing the page; `edit` (the Source button, or `&edit`
 * in the hash) is the editor beside it. index.html's head script sets `html[data-mode]` before
 * the first paint; this module keeps it, the Source button and the hash flag in step.
 */
import type { CompileOptions, DescribeOptions, RoomSummary, SceneSummary } from "archlang";
import type { ActionsHandle } from "./actions.js";
import type { EditMode } from "./edit-mode.js";
import { createPreview } from "./preview.js";
import { type LevelPage, selectPage } from "./levels.js";
import { mountLevelSwitcher } from "./level-switcher.js";
import { renderFacts } from "./facts-strip.js";
import { mountKnobsPanel } from "./knobs-panel.js";
import { isNarrow, mountMobileViews } from "./mobile-views.js";
import { hasEditFlag, setEditFlag, srcFromHash, updateHash } from "./share.js";
import { createSharedNotice, shouldShowSharedNotice } from "./shared-notice.js";
import { mountShell } from "./shell.js";
import { mountStrip } from "./strip.js";
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
type Examples = typeof import("./examples.js");

// Both start now, in parallel, after this module has run: the drawing is already on screen.
const coreP: Promise<Core> = import("./compiler.js");
const examplesP: Promise<Examples> = import("./examples.js");
/** The compiler, once loaded. Nothing compiles before it. */
let core: Core | undefined;

const root = document.documentElement;
const preview = document.getElementById("preview")!;
const errorsEl = document.getElementById("errors")!;
const statusEl = document.getElementById("status")!;
const statusText = document.getElementById("statusText")!;
const select = document.getElementById("examples") as HTMLSelectElement;
// `#format` is the download-format <select>; the reformat-source button is `#formatSrc`
// (they collided on a single `format` id until the header rework — the button had never
// been reachable via getElementById because the <select> won the duplicate id).
const formatSelect = document.getElementById("format") as HTMLSelectElement | null;
const themeSelect = document.getElementById("theme") as HTMLSelectElement;
const accessibleToggle = document.getElementById("accessible") as HTMLInputElement | null;
const finishPanel = document.getElementById("finishPanel");
const factsEl = document.getElementById("facts")!;
const pzViewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const pzStage = document.querySelector<HTMLElement>(".pz-stage")!;
const pzToolbar = document.querySelector<HTMLElement>(".pz-toolbar")!;
const storeysEl = document.getElementById("storeys");
const storeysSepEl = document.getElementById("storeysSep");
const mobileViews = mountMobileViews(
  document.querySelector("main")!,
  document.getElementById("mviews")!,
  document.getElementById("mviewCount")!,
);

// ---- output tabs (Preview · Describe · Lint · Intent · Takeoff · 3D preview) ----
const preview3dEl = document.getElementById("preview3d")!;
const takeoffEl = document.getElementById("takeoff")!;
const tabs = [...document.querySelectorAll<HTMLElement>(".tab")];
const views: Record<string, HTMLElement> = {
  preview,
  describe: document.getElementById("describe")!,
  lint: document.getElementById("lint")!,
  intent: document.getElementById("intent")!,
  takeoff: takeoffEl,
  preview3d: preview3dEl,
};
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    }
    for (const [name, el] of Object.entries(views)) el.classList.toggle("active", name === tab.dataset.tab);
    // Leaving the 3D tab stops its playback (opening it is handled below).
    if (tab.dataset.tab !== "preview3d") void preview3d?.then((p) => p?.hide());
    // The switcher's underline follows what the tab now on screen shows (see `shownLevel`).
    levelSwitch.set(lastPages, shownLevel());
  });
}

/** One <optgroup> per example group — the grouping the docs' example tour uses. */
function fillPicker({ EXAMPLE_GROUPS }: Examples): void {
  const keep = select.value;
  // The neutral entry (`markPlan`) survives the rebuild, and stays chosen if it was.
  const neutral = select.querySelector<HTMLOptionElement>("option[data-neutral]");
  select.replaceChildren(...(neutral ? [neutral] : []));
  for (const { group, items } of EXAMPLE_GROUPS) {
    const g = document.createElement("optgroup");
    g.label = group;
    for (const { label } of items) {
      const o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      g.appendChild(o);
    }
    select.appendChild(g);
  }
  if (keep) select.value = keep;
  else if (neutral) neutral.selected = true;
}

/**
 * Name the plan on screen in the picker and the strip together, so the two always agree: the
 * example labelled `label`, or, for a plan that is no example word for word (a shared link, a
 * saved draft, an edit), no plan in the strip and `neutral` in the picker. The neutral entry is
 * shown but never offered: it is hidden from the list and disabled.
 */
function markPlan(label: string | null, neutral = "Edited plan") {
  if (label !== null) select.value = label;
  else {
    let o = select.querySelector<HTMLOptionElement>("option[data-neutral]");
    if (!o) {
      o = document.createElement("option");
      o.value = "";
      o.dataset.neutral = "";
      o.disabled = true;
      o.hidden = true;
      select.prepend(o);
    }
    o.textContent = neutral;
    o.selected = true;
  }
  strip.setCurrent(label);
}

/** After a change to the source: still an example word for word, or now a plan of the reader's own. */
function syncPlanMark(source: string): Promise<void> {
  return examplesP.then(({ exampleLabelFor }) => {
    if (currentSource() !== source) return; // a later change syncs again
    markPlan(exampleLabelFor(source) ?? null);
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
/** The level whose facts the panels are currently reporting (`null` = whole plan). */
let activeLevel: number | null = null;
/** The storey pages of the last good compile (the switcher's buttons). */
let lastPages: readonly LevelPage[] | undefined;

/** The current preview SVG with the editor-only `data-span` annotations removed —
 *  used for every export so a downloaded/copied file never carries them. */
const cleanSvg = () => lastSvg.replace(/ data-span="\d+:\d+"/g, "");

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
  statusText.textContent = msg;
  flashTimer = setTimeout(() => {
    flashTimer = undefined;
    statusText.textContent = flashResting;
  }, 1200);
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
  mobileViews.show("plan");
  // Describe, Lint, Intent and Takeoff are edit mode's tabs: leave on the drawing.
  const active = tabs.find((t) => t.classList.contains("active"))?.dataset.tab;
  if (active !== "preview" && active !== "preview3d") document.getElementById("tab-preview")?.click();
  // A broken plan's status names where its errors are, which differs by mode.
  if (statusEl.classList.contains("err")) render(currentSource());
}

const shell = mountShell({
  isEditing: () => editing,
  editorMounted: () => edit !== undefined,
  enterEdit,
  leaveEdit,
  whenReady: () => ready,
});
shell.setMode(editing);

const previewCtl = createPreview({
  viewport: pzViewport,
  stage: pzStage,
  toolbar: pzToolbar,
  getRooms: () => lastRooms,
  getSummary: () => lastSummary,
  isEditing: () => editing && edit !== undefined,
  getCleanSvg: cleanSvg,
  jumpToOffset,
  flash,
  onPathsChange: () => render(currentSource()),
});
// The drawing built into the page pans and zooms at once, before the compiler is in — unless
// this visit opens another plan (the head script's `pg-other`), which hides it until compiled.
if (!root.classList.contains("pg-other")) previewCtl.adopt();

// The plan's knobs (knobs-panel.ts): a slider per top-level numeric `let`, over the drawing. A
// value is tried through `render`, which keeps the last good drawing when it does not compile.
const knobsPanel = mountKnobsPanel({
  viewport: pzViewport,
  tryRender: (source) => render(source),
  commit: keepKnob,
  flash,
});

/**
 * Keep a source a knob made, which has just compiled. With no editor it is the document now: the
 * draft and the hash follow at once, as for an edit. With the editor open the editor is the
 * document, and it takes the new text once the slider is let go, as one undo step; its change
 * listener then saves the draft and moves the hash.
 */
function keepKnob(source: string, final: boolean) {
  if (edit) {
    if (final) edit.setDoc(source);
    return;
  }
  doc = source;
  if (finishPanel) finishPanel.hidden = true;
  actions?.sourceChanged();
  writeStr(KEYS.source, source);
  void updateHash(source, editing);
}

// The storey switcher sits in the OUTPUT PANE'S TAB STRIP, not the preview toolbar, so
// it is visible and operable from all four tabs — the storey it picks drives every one
// of them. ONE control for one piece of state: a second copy inside the preview would be
// two things to keep in sync.
const levelSwitch = mountLevelSwitcher({
  el: storeysEl,
  sepEl: storeysSepEl,
  onChange: (level) => {
    if (level === selectedLevel) return;
    selectedLevel = level;
    // Keep the current pan/zoom: the storeys of one building share a page box, so
    // re-fitting would jump the drawing for no reason.
    render(currentSource());
  },
});

/** Update the facts strip (and, in edit mode, the Describe and Lint tabs) for `source`. */
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
  renderFacts(factsEl, summary, ok, source, activeLevel);
  // The Describe and Lint tabs are edit mode's (edit-mode.ts): a visit that never opens the
  // editor never runs `lint()`.
  edit?.updatePanels(source, ok, summary, activeLevel);
}

/**
 * The storey the switcher underlines: the one on screen. Every tab shows `activeLevel` (the lowest
 * storey when none is picked) except the 3D preview, which shows all storeys combined until one is
 * picked, so there, with no pick, no storey is underlined.
 */
function shownLevel(): number | null {
  return selectedLevel === null && preview3dEl.classList.contains("active") ? null : activeLevel;
}

/** Compile and show `source`; whether it compiled without errors (else the last good drawing stays). */
function render(source: string, refit = false): boolean {
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
  // The storey it shows is the switcher's explicit selection (none = the combined view).
  if (preview3d && preview3dEl.classList.contains("active"))
    void preview3d.then((p) => p?.update(source, selectedLevel, drawnFor(source)));
  // `pages` exists ONLY for a plan with `level` blocks; a single-storey plan has no such
  // key, `selectPage` returns undefined for it, and everything below takes the exact
  // path it always took — the drawing, the exports and the panels are all unmoved.
  //
  // It is also absent while the source does not compile, so the switcher is rebuilt only
  // on a GOOD compile — same doctrine as the preview below, which keeps the last good
  // drawing. Otherwise a half-typed statement would blink the storey buttons away and
  // back under a drawing that never changed.
  const page = ok ? selectPage(pages, selectedLevel) : undefined;
  if (ok) {
    activeLevel = page?.level ?? null;
    lastPages = pages;
    levelSwitch.set(pages, shownLevel());
  }
  updateAnalysis(source, ok);
  // Like the 3D preview, the takeoff follows the editor and the storey only while its tab is open.
  if (takeoff && takeoffEl.classList.contains("active")) void takeoff.then((p) => p?.update(source, activeLevel));
  // The diagnostics drawer, its phone count and a live Intent verdict are edit mode's.
  edit?.afterCompile(source, diagnostics ?? []);
  if (!ok) {
    const n = errors.length;
    statusEl.classList.add("err");
    // In view mode the diagnostics are out of sight: say where they are.
    statusText.textContent = `${n} error${n > 1 ? "s" : ""}${editing ? "" : " — open Source to see them"}`;
    return false; // keep last good preview
  }
  statusEl.classList.remove("err");
  const warns = (diagnostics ?? []).filter((d) => d.severity === "warning");
  statusText.textContent = warns.length ? `${warns.length} warning${warns.length > 1 ? "s" : ""}` : "ready";
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
  previewCtl.show(displaySvg, refit);
  lastSvg = pageSvg;
  lastScene = (page ? page.scene : scene) ?? null;
  knobsPanel.sync(source, ast);
  return true;
}

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
  // Opened before the first compile, it shows the plan the page boots on.
  void ready.then(() => {
    const source = currentSource();
    void shown.then((p) => p?.show(source, selectedLevel, drawnFor(source)));
  });
});

// ---- Takeoff: the core's quantities, in a panel whose code loads on the tab's first open ----
let takeoff: Promise<import("./takeoff-panel.js").TakeoffPanel | undefined> | undefined;
document.getElementById("tab-takeoff")?.addEventListener("click", () => {
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
    void updateHash(source, editing); // keep the permalink in sync (compression is async)
    void syncPlanMark(source); // the picker and the strip: still that example, or an edited plan
  }, 250);
}

/** Surface an export failure in the status + errors UI. */
function onExportError(format: string, err: unknown) {
  statusEl.classList.add("err");
  statusText.textContent = `${format.toUpperCase()} export failed`;
  errorsEl.classList.add("show");
  errorsEl.textContent = `${format.toUpperCase()} export failed: ${(err as { message?: string })?.message ?? err}`;
}

/**
 * Open the example labelled `label` (the picker's value). The picker and the strip say so at once;
 * an example picked before the app is up is loaded once it is.
 */
function pickExample(label: string) {
  markPlan(label);
  void ready.then(async () => {
    const { EXAMPLES } = await examplesP;
    markPlan(label);
    loadSource(EXAMPLES[label], true);
  });
}
select.addEventListener("change", () => pickExample(select.value));
// The strip's links and thumbnails are in the served page (gen-static.mjs): nothing here waits for
// the example sources to mark or move through them.
const strip = mountStrip(document.getElementById("stripList")!, pickExample);

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
  fillPicker(examples);
  const initialDoc = sharedSrc ?? savedSrc ?? EXAMPLES[DEFAULT_EXAMPLE];
  // The picker and the strip name the plan this visit opens: the default, or the example a link
  // or a draft is word for word, or neither (a plan of someone's own is no example).
  if (!sharedSrc && !savedSrc) markPlan(DEFAULT_EXAMPLE);
  else markPlan(examples.exampleLabelFor(initialDoc) ?? null, sharedSrc ? "Shared plan" : "Saved draft");

  // A `#z=` payload that is not one of the bundled examples is third-party text on
  // our page — say so, once, at the top of the preview. Silent for a stock-example
  // permalink and for a hash-less visit. See shared-notice.ts for why it is not
  // remembered.
  if (shouldShowSharedNotice(sharedSrc, Object.values(EXAMPLES))) {
    preview.prepend(createSharedNotice());
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
    isEditing: () => editing,
    showLintTab: () => document.getElementById("tab-lint")?.click(),
    getThemeOverride: () => themeSelect.value,
    els: {
      formatBtn: document.getElementById("formatSrc") as HTMLButtonElement | null,
      finishBtn: document.getElementById("finishSrc") as HTMLButtonElement | null,
      finishPanel,
      // The Ask AI links and the two share links sit in the Tools menu: choosing one closes it.
      chatMenu: document.getElementById("tools") as HTMLDetailsElement | null,
      chatLinks: [...document.querySelectorAll<HTMLAnchorElement>("a[data-chat-host]")],
      repairBtn: document.getElementById("repair"),
      repairPanel: document.getElementById("repairPanel"),
      embedBtn: document.getElementById("embed"),
      shareMenu: document.getElementById("tools") as HTMLDetailsElement | null,
      copyShortLinkBtn: document.getElementById("copyShortLink"),
      copyLinkBtn: document.getElementById("copyLink")!,
      copyLlmBtn: document.getElementById("copyLlm"),
      savedBtn: document.getElementById("saved") as HTMLButtonElement,
      downloadBtn: document.getElementById("download")!,
      formatSelect,
    },
  });
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#tools button[disabled]")) btn.disabled = false;

  // Initial render — fit the plan to the viewport, then re-fit once layout settles.
  render(initialDoc, true);
  requestAnimationFrame(() => previewCtl.fit());
  // The e2e specs' "the app is up" signal (fixtures.ts `waitForPlan`).
  delete root.dataset.booting;
}

// Bootstrap (async — resolves the shared/saved source, then loads the compiler).
const ready = boot();
