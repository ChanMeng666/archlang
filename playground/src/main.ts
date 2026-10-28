import {
  applyFixes,
  compile,
  describe,
  describeLevel,
  lint,
  rankFixes,
  suggestTopology,
  THEMES,
  LINT_PROFILE_NAMES,
  type CompileOptions,
  type Diagnostic,
  type DescribeOptions,
  type LintOptions,
  type RoomSummary,
} from "archlang";
import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { createEditor } from "./editor-setup.js";
import { createPreview } from "./preview.js";
import { type LevelPage, selectPage } from "./levels.js";
import { mountLevelSwitcher } from "./level-switcher.js";
import { type ActionsHandle, mountActions } from "./actions.js";
import { renderFacts } from "./facts-strip.js";
import { renderDescribe } from "./describe-panel.js";
import { renderLint } from "./lint-panel.js";
import { renderDiagnostics } from "./diagnostics-panel.js";
import { isNarrow, mountMobileViews } from "./mobile-views.js";
import { renderIntent, STARTER_INTENT } from "./intent-panel.js";
import { renderSuggest } from "./suggest-panel.js";
import { srcFromHash, updateHash } from "./share.js";
import { createSharedNotice, shouldShowSharedNotice } from "./shared-notice.js";
import { KEYS, readStr, writeStr } from "./storage.js";
import { DEFAULT_EXAMPLE, EXAMPLE_GROUPS, EXAMPLES } from "./examples.js";
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

const preview = document.getElementById("preview")!;
const describeEl = document.getElementById("describe")!;
const lintEl = document.getElementById("lint")!;
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
const lintProfileSelect = document.getElementById("lintProfile") as HTMLSelectElement;
const lintCaptionEl = document.getElementById("lintCaption")!;
const lintOutput = document.getElementById("lintOutput")!;
const copyLinkBtn = document.getElementById("copyLink")!;
const copyLlmBtn = document.getElementById("copyLlm");
const savedBtn = document.getElementById("saved") as HTMLButtonElement;
const formatBtn = document.getElementById("formatSrc") as HTMLButtonElement | null;
const embedBtn = document.getElementById("embed");
const repairBtn = document.getElementById("repair");
const repairPanel = document.getElementById("repairPanel");
const finishPanel = document.getElementById("finishPanel");
const suggestBtn = document.getElementById("suggest");
const suggestPanel = document.getElementById("suggestPanel");
const intentEl = document.getElementById("intent")!;
const intentSrc = document.getElementById("intentSrc") as HTMLTextAreaElement;
const intentRunBtn = document.getElementById("intentRun")!;
const intentOutput = document.getElementById("intentOutput")!;
const factsEl = document.getElementById("facts")!;
const downloadBtn = document.getElementById("download")!;
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

// ---- output tabs (Preview · Describe · Lint · Intent · 3D preview) ----
const preview3dEl = document.getElementById("preview3d")!;
const tabs = [...document.querySelectorAll<HTMLElement>(".tab")];
const views: Record<string, HTMLElement> = {
  preview,
  describe: describeEl,
  lint: lintEl,
  intent: intentEl,
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

// One <optgroup> per example group — two dozen flat options is a wall, and the
// grouping is the same one the docs' example tour uses.
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

// ---- lint-profile selector (advisory rule sets) ----
// One-line description of what each profile tightens, shown under the selector. The first
// option, value "", is the default ruleset (no profile), as `lint()` and the CLI run it.
const LINT_PROFILE_CAPTIONS: Record<string, string> = {
  "": "Default — doors ≥ 700 mm, habitable rooms ≥ 4 m²; home-only checks skip a café, shop or office.",
  "residential-basic": "The default's thresholds, asserting a dwelling: every plan is judged as a home.",
  "accessibility-advisory": "Stricter — doors ≥ 850 mm, rooms ≥ 5 m², 150 mm door-swing clearance.",
};
{
  const o = document.createElement("option");
  o.value = "";
  o.textContent = "default";
  lintProfileSelect.appendChild(o);
}
for (const name of LINT_PROFILE_NAMES) {
  const o = document.createElement("option");
  o.value = name;
  o.textContent = name;
  lintProfileSelect.appendChild(o);
}
function syncLintCaption() {
  lintCaptionEl.textContent = LINT_PROFILE_CAPTIONS[lintProfileSelect.value] ?? "";
}
syncLintCaption();

// The shareable-permalink codec (`#z=` compressed / legacy `#src=`) lives in
// `share.js` so the embed page reuses the exact same scheme.

let lastSvg = "";
let lastScene: ReturnType<typeof compile>["scene"] | null = null;
let lastRooms: RoomSummary[] = [];
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
/** Diagnostics in panel display order — `data-i` on a row indexes into this. */
let lastDiagRows: Diagnostic[] = [];
/** Same, for the Lint tab's rows (some lint rules carry their own applicable fix). */
let lastLintRows: Diagnostic[] = [];

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

// The editor view is created during init() once the (async) initial source is
// resolved; everything below reaches it through `view`.
let view: EditorView | undefined;
function currentSource() {
  return view ? view.state.doc.toString() : "";
}
function loadSource(src: string, refit = true) {
  if (!view) return;
  // A wholesale document replacement is a new plan as far as the storey switcher is
  // concerned — its level numbers may mean nothing here. Back to the lowest storey.
  selectedLevel = null;
  // Its own undo step: one Ctrl+Z reverts exactly this replacement (Format, Repair,
  // Finish, an applied fix), never merged with the typing just before or after it.
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: src },
    annotations: isolateHistory.of("full"),
  });
  render(src, refit);
}

/** Move the editor caret to a byte offset and reveal it (click-to-source). */
function jumpToOffset(offset: number) {
  if (!view) return;
  const pos = Math.max(0, Math.min(offset, view.state.doc.length));
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  view.focus();
}

const previewCtl = createPreview({
  viewport: pzViewport,
  stage: pzStage,
  toolbar: pzToolbar,
  getRooms: () => lastRooms,
  getCleanSvg: cleanSvg,
  jumpToOffset,
  flash,
  onPathsChange: () => render(currentSource()),
});

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

/** Update the Describe (semantic facts) and Lint (soundness) tabs for `source`. */
function updateAnalysis(source: string, ok: boolean) {
  const whole = describe(source, { noCache: true } as DescribeOptions & { noCache?: boolean });
  // The panels report the storey on screen. `describeLevel` is the CORE's narrowing —
  // the same function behind `arch describe --level N` — so the playground and the CLI
  // cannot disagree about what one floor's facts are. A single-storey plan never gets
  // here with a level, and `activeLevel === null` leaves the summary untouched.
  const summary = activeLevel === null ? whole : describeLevel(whole, activeLevel);
  const { diagnostics: _d, ...facts } = summary;
  lastRooms = ok ? (summary.rooms ?? []) : [];
  renderFacts(factsEl, summary, ok);
  renderDescribe(describeEl, facts, ok);

  // Lint — architectural soundness warnings (habitability rules), under the chosen
  // advisory profile. Run over the WHOLE plan, always: `ok`, the status text and the
  // repair/suggest offers below are verdicts, and a display filter must never move a
  // verdict (the law `arch describe --level` obeys).
  const lintDiags = ok
    ? lint(source, { profile: lintProfileSelect.value, noCache: true } as LintOptions & { noCache?: boolean })
    : [];
  // `repair` only corrects furniture-placement faults — offer it exactly when one
  // is present (ADR 0006: an explicit, reviewable transform, never auto-applied).
  const repairable = lintDiags.some((d) => /FURNITURE|FIXTURE|DOORWAY|SWING/.test(d.code ?? ""));
  if (repairBtn) repairBtn.hidden = !repairable;
  if (!repairable && repairPanel) repairPanel.hidden = true;

  // `suggest` covers the two faults repair deliberately won't touch — adding a door or a
  // window is a design choice, so it proposes statements instead of applying them.
  const suggestable = lintDiags.some((d) => d.code === "W_ROOM_UNREACHABLE" || d.code === "W_BEDROOM_NO_WINDOW");
  if (suggestBtn) suggestBtn.hidden = !suggestable;
  if (!suggestable && suggestPanel) suggestPanel.hidden = true;

  // …but the ROWS follow the storey on screen, so the panel is about the drawing beside
  // it. A diagnostic carries the level that raised it; one with no level is a whole-plan
  // problem and shows on every storey. `renderLint` says out loud that it is narrowed,
  // so a quiet panel can never be misread as a clean building.
  const shown =
    activeLevel === null ? lintDiags : lintDiags.filter((d) => d.level === undefined || d.level === activeLevel);
  lastLintRows = renderLint(lintOutput, shown, ok, activeLevel, lintDiags.length);
}

/**
 * Apply the best-ranked machine-applicable fix on `rows[index]` — the same
 * `rankFixes` → `applyFixes` path `arch fix` takes, so the button and the CLI make the
 * identical edit. Shared by the diagnostics panel and the Lint tab.
 */
function applyFixAt(rows: Diagnostic[], index: number): void {
  const fixes = rows[index]?.fixes;
  const best = fixes?.length ? rankFixes(fixes)[0] : undefined;
  if (!best) return;
  const report = applyFixes(currentSource(), [best]);
  if (report.applied.length === 0) {
    flash(report.skipped[0]?.reason ?? "Fix no longer applies");
    return;
  }
  loadSource(report.output, false);
  flash(best.title);
}

/**
 * The storey the switcher underlines: the one on screen. Every tab shows `activeLevel` (the lowest
 * storey when none is picked) except the 3D preview, which shows all storeys combined until one is
 * picked, so there, with no pick, no storey is underlined.
 */
function shownLevel(): number | null {
  return selectedLevel === null && preview3dEl.classList.contains("active") ? null : activeLevel;
}

function render(source: string, refit = false) {
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
  const { svg, errors, diagnostics, scene, pages } = compile(source, opts);
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
  lastDiagRows = renderDiagnostics(errorsEl, diagnostics ?? [], source);
  mobileViews.setProblemCount(lastDiagRows.length);
  // Keep an already-run intent verdict live as the source changes (but don't run it
  // unprompted — an untouched Intent tab stays empty until you ask).
  if (intentOutput.innerHTML) renderIntent(intentOutput, source, intentSrc.value);
  if (!ok) {
    const n = errors.length;
    statusEl.classList.add("err");
    statusText.textContent = `${n} error${n > 1 ? "s" : ""}`;
    return; // keep last good preview
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
  const source = currentSource();
  void preview3d.then((p) => p?.show(source, selectedLevel, drawnFor(source)));
});

let debounce: ReturnType<typeof setTimeout>;
/** Set once the header actions mount; told of every document change. */
let actions: ActionsHandle | undefined;
const onDocChanged = (source: string) => {
  // The Finish log describes the document it ran on; any later change (an edit, an
  // undo, a new example) makes it stale. Finish re-shows it after its own edit.
  if (finishPanel) finishPanel.hidden = true;
  actions?.sourceChanged();
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    render(source);
    writeStr(KEYS.source, source); // autosave the working draft (restored on reload)
    void updateHash(source); // keep the permalink in sync (compression is async)
  }, 250);
};

/** Surface an export failure in the status + errors UI. */
function onExportError(format: string, err: unknown) {
  statusEl.classList.add("err");
  statusText.textContent = `${format.toUpperCase()} export failed`;
  errorsEl.classList.add("show");
  errorsEl.textContent = `${format.toUpperCase()} export failed: ${(err as { message?: string })?.message ?? err}`;
}

async function init() {
  // First-load source precedence: shared URL hash → autosaved draft → default example.
  const sharedSrc = await srcFromHash();
  const savedSrc = sharedSrc ? null : readStr(KEYS.source);
  const initialDoc = sharedSrc ?? savedSrc ?? EXAMPLES[DEFAULT_EXAMPLE];
  if (!sharedSrc && !savedSrc) select.value = DEFAULT_EXAMPLE;

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
  const savedProfile = readStr(KEYS.lintProfile);
  if (savedProfile && [...lintProfileSelect.options].some((o) => o.value === savedProfile)) {
    lintProfileSelect.value = savedProfile;
    syncLintCaption();
  }

  view = createEditor({ parent: document.getElementById("editor")!, doc: initialDoc, onDocChanged });

  select.addEventListener("change", () => loadSource(EXAMPLES[select.value], true));

  // Theme switch (B2) — re-render the preview only; describe/lint are theme-agnostic.
  themeSelect.addEventListener("change", () => {
    writeStr(KEYS.theme, themeSelect.value);
    render(currentSource());
  });

  // a11y metadata switch — re-compile so the <title>/<desc> land in the preview SVG
  // (and therefore in every SVG export, which reads from the same bytes).
  accessibleToggle?.addEventListener("change", () => render(currentSource()));

  // Lint-profile switch (B3) — update the caption and re-run the soundness check.
  lintProfileSelect.addEventListener("change", () => {
    writeStr(KEYS.lintProfile, lintProfileSelect.value);
    syncLintCaption();
    render(currentSource());
  });

  // Header/panel action buttons: format, repair, embed, copy link, snapshots,
  // download, and the pane divider.
  actions = mountActions({
    getSource: currentSource,
    loadSource,
    flash,
    getCleanSvg: cleanSvg,
    getScene: () => lastScene,
    getLevel: () => activeLevel,
    onExportError,
    showLintTab: () => document.getElementById("tab-lint")?.click(),
    getThemeOverride: () => themeSelect.value,
    els: {
      formatBtn,
      finishBtn: document.getElementById("finishSrc") as HTMLButtonElement | null,
      finishPanel,
      chatMenu: document.getElementById("chatMenu") as HTMLDetailsElement | null,
      chatLinks: [...document.querySelectorAll<HTMLAnchorElement>("a[data-chat-host]")],
      repairBtn,
      repairPanel,
      embedBtn,
      copyLinkBtn,
      copyLlmBtn,
      savedBtn,
      downloadBtn,
      formatSelect,
    },
  });

  // A lint rule can carry its own machine-applicable fix (W_ALIAS_MATCH → add the `uses`
  // the label only implied). Make it actionable here too, not just readable.
  lintOutput.addEventListener("click", (e) => {
    const apply = (e.target as Element | null)?.closest<HTMLElement>(".diag-apply");
    if (apply) applyFixAt(lastLintRows, Number(apply.dataset.i));
  });

  // ---- Suggest (advisory topology) ----
  // Never edits the plan: it lists candidate `door`/`window` statements and lets you
  // insert one (ADR 0005 — facts and options, not an invisible architect).
  suggestBtn?.addEventListener("click", () => {
    if (!suggestPanel) return;
    renderSuggest(suggestPanel, suggestTopology(currentSource()));
  });
  suggestPanel?.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>(".sug-insert");
    const stmt = btn?.dataset.stmt;
    if (!stmt || !view) return;
    // Insert just inside the plan's closing brace — the statement is plan-level.
    const src = currentSource();
    const close = src.lastIndexOf("}");
    if (close < 0) return;
    loadSource(`${src.slice(0, close)}  ${stmt}\n${src.slice(close)}`, false);
    flash("Statement inserted");
  });

  // ---- Intent (the brief as a contract) ----
  intentSrc.value = STARTER_INTENT;
  const runIntent = () => renderIntent(intentOutput, currentSource(), intentSrc.value);
  intentRunBtn.addEventListener("click", runIntent);
  // Check once when the tab is first opened, so it is never an empty panel.
  document.getElementById("tab-intent")?.addEventListener("click", () => {
    if (!intentOutput.innerHTML) runIntent();
  });

  // Diagnostics drill-down — click a row to jump to its source span and reveal the
  // catalogued cause/fix/example. "Apply fix" runs the diagnostic's machine-applicable
  // fix through the same `applyFixes` the `arch fix` CLI uses, so the playground and the
  // command line make the identical edit.
  errorsEl.addEventListener("click", (e) => {
    const target = e.target as Element | null;

    const apply = target?.closest<HTMLElement>(".diag-apply");
    if (apply) {
      e.stopPropagation(); // don't also toggle/jump the row underneath
      applyFixAt(lastDiagRows, Number(apply.dataset.i));
      return;
    }

    const row = target?.closest<HTMLElement>(".diagrow");
    if (!row) return;
    row.classList.toggle("open");
    const off = row.dataset.offset;
    // On a phone the Problems view hides the editor: the line:col is the one place that
    // means "take me there", so it switches to Code; the rest of the row only expands.
    if (isNarrow() && target?.closest(".diag-loc")) mobileViews.show("code");
    if (off != null) jumpToOffset(Number(off));
  });

  // Initial render — fit the plan to the viewport, then re-fit once layout settles.
  render(initialDoc, true);
  requestAnimationFrame(() => previewCtl.fit());
}

// Bootstrap (async — resolves the shared/saved source, then builds the editor).
void init();
