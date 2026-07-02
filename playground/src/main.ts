import {
  compile,
  describe,
  lint,
  THEMES,
  LINT_PROFILE_NAMES,
  type CompileOptions,
  type DescribeOptions,
  type LintOptions,
  type RoomSummary,
} from "archlang";
import type { EditorView } from "@codemirror/view";
import { createEditor } from "./editor-setup.js";
import { createPreview } from "./preview.js";
import { mountActions } from "./actions.js";
import { renderFacts } from "./facts-strip.js";
import { renderDescribe } from "./describe-panel.js";
import { renderLint } from "./lint-panel.js";
import { renderDiagnostics } from "./diagnostics-panel.js";
import { srcFromHash, updateHash } from "./share.js";
import { KEYS, readStr, writeStr } from "./storage.js";
import { EXAMPLES } from "./examples.js";
import { mountFlowingLines } from "./flowing-lines.js";
// Self-hosted brand fonts (no CDN) — shared with the docs site.
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "./style.css";

// Subtle ArchCanvas-signature flowing lines behind the brand nav (reduced-motion
// safe — the helper renders a single static frame when motion is reduced).
const brandLines = document.querySelector<HTMLCanvasElement>("header .brand-lines");
if (brandLines) mountFlowingLines(brandLines, { lineCount: 6 });

const preview = document.getElementById("preview")!;
const describeEl = document.getElementById("describe")!;
const lintEl = document.getElementById("lint")!;
const errorsEl = document.getElementById("errors")!;
const statusEl = document.getElementById("status")!;
const statusText = document.getElementById("statusText")!;
const select = document.getElementById("examples") as HTMLSelectElement;
// NB: `#format` is shared by a <select> and a <button> in the HTML; getElementById
// returns the first match (the <select>), so both handles below point at it — the
// long-standing runtime behavior, preserved here rather than changed in a mechanical
// migration.
const formatSelect = document.getElementById("format") as HTMLSelectElement | null;
const themeSelect = document.getElementById("theme") as HTMLSelectElement;
const lintProfileSelect = document.getElementById("lintProfile") as HTMLSelectElement;
const lintCaptionEl = document.getElementById("lintCaption")!;
const lintOutput = document.getElementById("lintOutput")!;
const copyLinkBtn = document.getElementById("copyLink")!;
const savedBtn = document.getElementById("saved") as HTMLButtonElement;
const formatBtn = document.getElementById("format") as HTMLButtonElement | null;
const embedBtn = document.getElementById("embed");
const repairBtn = document.getElementById("repair");
const repairPanel = document.getElementById("repairPanel");
const factsEl = document.getElementById("facts")!;
const downloadBtn = document.getElementById("download")!;
const pzViewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const pzStage = document.querySelector<HTMLElement>(".pz-stage")!;
const pzToolbar = document.querySelector<HTMLElement>(".pz-toolbar")!;

// ---- output tabs (Preview · Describe · Lint) ----
const tabs = [...document.querySelectorAll<HTMLElement>(".tab")];
const views: Record<string, HTMLElement> = { preview, describe: describeEl, lint: lintEl };
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const t of tabs) t.classList.toggle("active", t === tab);
    for (const [name, el] of Object.entries(views)) el.classList.toggle("active", name === tab.dataset.tab);
  });
}

for (const name of Object.keys(EXAMPLES)) {
  const o = document.createElement("option");
  o.value = name;
  o.textContent = name;
  select.appendChild(o);
}

// ---- lint-profile selector (advisory rule sets) ----
// One-line description of what each profile tightens, shown under the selector.
const LINT_PROFILE_CAPTIONS: Record<string, string> = {
  "residential-basic": "Default — doors ≥ 700 mm, habitable rooms ≥ 4 m².",
  "accessibility-advisory": "Stricter — doors ≥ 850 mm, rooms ≥ 5 m², 150 mm door-swing clearance.",
};
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

/** The current preview SVG with the editor-only `data-span` annotations removed —
 *  used for every export so a downloaded/copied file never carries them. */
const cleanSvg = () => lastSvg.replace(/ data-span="\d+:\d+"/g, "");

/** Briefly show a message in the status text, then restore it. */
function flash(msg: string) {
  const prev = statusText.textContent;
  statusText.textContent = msg;
  setTimeout(() => {
    statusText.textContent = prev;
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
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: src } });
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
});

/** Update the Describe (semantic facts) and Lint (soundness) tabs for `source`. */
function updateAnalysis(source: string, ok: boolean) {
  const summary = describe(source, { noCache: true } as DescribeOptions & { noCache?: boolean });
  const { diagnostics: _d, ...facts } = summary;
  lastRooms = ok ? (summary.rooms ?? []) : [];
  renderFacts(factsEl, summary, ok);
  renderDescribe(describeEl, facts, ok);

  // Lint — architectural soundness warnings (habitability rules), under the chosen
  // advisory profile.
  const lintDiags = ok
    ? lint(source, { profile: lintProfileSelect.value, noCache: true } as LintOptions & { noCache?: boolean })
    : [];
  // `repair` only corrects furniture-placement faults — offer it exactly when one
  // is present (ADR 0006: an explicit, reviewable transform, never auto-applied).
  const repairable = lintDiags.some((d) => /FURNITURE|FIXTURE|DOORWAY|SWING/.test(d.code ?? ""));
  if (repairBtn) repairBtn.hidden = !repairable;
  if (!repairable && repairPanel) repairPanel.hidden = true;
  renderLint(lintOutput, lintDiags, ok);
}

function render(source: string, refit = false) {
  // Theme: empty value = the source's own `theme` directive (pass nothing); a named
  // key overrides it (compile's `theme` option wins over an in-source directive).
  const themeKey = themeSelect.value;
  // annotate: stamp data-span on primitives so a click in the preview can jump to
  // source (interact.js). Exports strip it (cleanSvg) so downloads stay clean.
  const opts: CompileOptions = themeKey
    ? { noCache: true, annotate: true, theme: THEMES[themeKey] }
    : { noCache: true, annotate: true };
  const { svg, errors, diagnostics, scene } = compile(source, opts);
  const ok = errors.length === 0;
  updateAnalysis(source, ok);
  renderDiagnostics(errorsEl, diagnostics ?? [], source);
  if (!ok) {
    const n = errors.length;
    statusEl.classList.add("err");
    statusText.textContent = `${n} error${n > 1 ? "s" : ""}`;
    return; // keep last good preview
  }
  statusEl.classList.remove("err");
  const warns = (diagnostics ?? []).filter((d) => d.severity === "warning");
  statusText.textContent = warns.length ? `${warns.length} warning${warns.length > 1 ? "s" : ""}` : "ready";
  previewCtl.show(svg, refit);
  lastSvg = svg;
  lastScene = scene ?? null;
}

let debounce: ReturnType<typeof setTimeout>;
const onDocChanged = (source: string) => {
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
  const initialDoc = sharedSrc ?? savedSrc ?? EXAMPLES["Studio (1BR)"];
  if (!sharedSrc && !savedSrc) select.value = "Studio (1BR)";

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

  // Lint-profile switch (B3) — update the caption and re-run the soundness check.
  lintProfileSelect.addEventListener("change", () => {
    writeStr(KEYS.lintProfile, lintProfileSelect.value);
    syncLintCaption();
    render(currentSource());
  });

  // Header/panel action buttons: format, repair, embed, copy link, snapshots,
  // download, and the pane divider.
  mountActions({
    getSource: currentSource,
    loadSource,
    flash,
    getCleanSvg: cleanSvg,
    getScene: () => lastScene,
    onExportError,
    els: {
      formatBtn,
      repairBtn,
      repairPanel,
      embedBtn,
      copyLinkBtn,
      savedBtn,
      downloadBtn,
      formatSelect,
    },
  });

  // Diagnostics drill-down — click a row to jump to its source span and reveal the
  // catalogued cause/fix/example.
  errorsEl.addEventListener("click", (e) => {
    const row = (e.target as Element | null)?.closest<HTMLElement>(".diagrow");
    if (!row) return;
    row.classList.toggle("open");
    const off = row.dataset.offset;
    if (off != null) jumpToOffset(Number(off));
  });

  // Initial render — fit the plan to the viewport, then re-fit once layout settles.
  render(initialDoc, true);
  requestAnimationFrame(() => previewCtl.fit());
}

// Bootstrap (async — resolves the shared/saved source, then builds the editor).
void init();
