import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import {
  compile,
  describe,
  lint,
  format,
  repair,
  ERROR_CATALOG,
  offsetToLineCol,
  toDxf,
  THEMES,
  LINT_PROFILE_NAMES,
  type CompileOptions,
  type DescribeOptions,
  type LintOptions,
  type Diagnostic,
  type SceneSummary,
  type RoomSummary,
} from "archlang";

/** A room node in describe()'s access graph (the type is not exported directly). */
type AccessRoomNode = SceneSummary["access"]["rooms"][number];
import { archLanguage, archLinter } from "./arch-language.js";
import { archCompletion } from "./arch-completion.js";
import { createPanZoom } from "./pan-zoom.js";
import { mountSnapshots } from "./snapshots.js";
import { mountInteract } from "./interact.js";
import { srcFromHash, updateHash, encodeSrc } from "./share.js";
import { showSvgInStage } from "./viewer.js";
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
const pzViewport = document.querySelector<HTMLElement>(".pz-viewport")!;
const pzStage = document.querySelector<HTMLElement>(".pz-stage")!;
const pzToolbar = document.querySelector<HTMLElement>(".pz-toolbar")!;

// Pan/zoom controller for the preview (created once; survives every re-render).
const pz = createPanZoom(pzViewport, pzStage);

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

/** Update the Describe (semantic facts) and Lint (soundness) tabs for `source`. */
function updateAnalysis(source: string, ok: boolean) {
  // Describe — the semantic summary a text-only agent would read. We lead with a
  // compact access-graph diagram (B4) and tuck the raw JSON into a <details>.
  const summary = describe(source, { noCache: true } as DescribeOptions & { noCache?: boolean });
  const { diagnostics: _d, ...facts } = summary;
  lastRooms = ok ? (summary.rooms ?? []) : [];
  renderFacts(summary, ok);
  if (ok) {
    describeEl.innerHTML =
      `<div class="ag-wrap">${renderAccessGraph(facts)}</div>` +
      `<details class="describe-json"><summary>Raw describe JSON</summary>` +
      `<pre>${escapeHtml(JSON.stringify(facts, null, 2))}</pre></details>`;
  } else {
    describeEl.innerHTML = `<p class="empty">Fix the errors to see the plan's semantic summary.</p>`;
  }

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
  if (!ok) {
    lintOutput.innerHTML = `<p class="empty">Fix the errors to run the soundness check.</p>`;
  } else if (lintDiags.length === 0) {
    lintOutput.innerHTML = `<p class="ok">✓ No soundness warnings — every room is reachable, bedrooms have windows, the building has an entrance.</p>`;
  } else {
    lintOutput.innerHTML = lintDiags
      .map(
        (d) =>
          `<div class="lintrow"><code>${d.code}</code> ${escapeHtml(d.message)}${d.hints?.length ? `<span class="hint">${escapeHtml(d.hints[0])}</span>` : ""}</div>`,
      )
      .join("");
  }
}

/**
 * Compact access-graph visual from `describe().access`: rooms laid out in flex
 * columns by `depthFromEntrance` (exterior/entrance on the left), unreachable rooms
 * flagged at the end. Zero-dep — pure DOM/CSS, no graph library.
 */
function renderAccessGraph(facts: Omit<SceneSummary, "diagnostics">) {
  const access = facts.access;
  if (!access) return `<p class="ag-note">No access graph available for this plan.</p>`;
  if (!access.hasEntrance) {
    return `<p class="ag-note">No exterior entrance — add a <code>door</code> on an exterior wall to model reachability.</p>`;
  }
  const labelOf = new Map((facts.rooms ?? []).map((r) => [r.id, r.label ?? r.id]));
  const card = (r: AccessRoomNode) => {
    const label = String(labelOf.get(r.id) ?? r.id);
    const un = r.reachable === false;
    const bn = r.bottleneckClearWidth != null ? `↔ ${r.bottleneckClearWidth} mm` : "↔ —";
    const meta = un ? "unreachable" : `depth ${r.depthFromEntrance} · ${bn}`;
    return `<div class="ag-card${un ? " ag-unreachable" : ""}"><div class="ag-card-label">${escapeHtml(label)}</div><div class="ag-card-meta">${escapeHtml(meta)}</div></div>`;
  };

  // Entrance column lists the modeled entrance doors.
  const doors = access.entrances.length
    ? access.entrances.map((id) => `<div class="ag-door">⮕ ${escapeHtml(id)}</div>`).join("")
    : `<div class="ag-door">entrance</div>`;
  const cols = [`<div class="ag-col"><div class="ag-col-h">Exterior / entrance</div>${doors}</div>`];

  // One column per reachable depth, in order.
  const depths = [
    ...new Set(access.rooms.filter((r) => r.reachable && r.depthFromEntrance != null).map((r) => r.depthFromEntrance!)),
  ].sort((a, b) => a - b);
  for (const d of depths) {
    const rooms = access.rooms.filter((r) => r.reachable && r.depthFromEntrance === d);
    cols.push(`<div class="ag-col"><div class="ag-col-h">Depth ${d}</div>${rooms.map(card).join("")}</div>`);
  }

  // Trailing column for anything the entrance can't reach.
  const unreachable = access.rooms.filter((r) => r.reachable === false);
  if (unreachable.length) {
    cols.push(
      `<div class="ag-col"><div class="ag-col-h ag-col-h-bad">Unreachable</div>${unreachable.map(card).join("")}</div>`,
    );
  }
  return `<div class="ag">${cols.join(`<div class="ag-arrow">→</div>`)}</div>`;
}

const HTML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ENTITIES[c] ?? c);
}

/** Always-visible plan facts under the preview — a quick read of the describe()
 *  totals (rooms / doors / windows / floor area) and whether the plan has an
 *  exterior entrance. Differentiator: floor-plan facts a diagram tool can't show. */
function renderFacts(summary: SceneSummary, ok: boolean) {
  const t = summary?.totals;
  if (!ok || !t) {
    factsEl.innerHTML = `<span class="fact">— fix the errors to see plan facts —</span>`;
    return;
  }
  const entrance = summary.access?.hasEntrance;
  factsEl.innerHTML =
    `<span class="fact">Rooms <b>${t.rooms}</b></span>` +
    `<span class="fact">Doors <b>${t.doors}</b></span>` +
    `<span class="fact">Windows <b>${t.windows}</b></span>` +
    `<span class="fact">Floor area <b>${t.floor_area_m2} m²</b></span>` +
    `<span class="fact ${entrance ? "fact-ok" : "fact-bad"}">Entrance <b>${entrance ? "yes" : "none"}</b></span>`;
}

/** Inject the SVG into the pan/zoom stage and size it from its viewBox. `refit`
 *  re-centres the view (first load / example switch); otherwise the user's current
 *  pan/zoom is preserved across the keystroke re-render. Shared logic in viewer.js. */
function showSvg(svg: string, refit: boolean) {
  showSvgInStage(pzStage, pz, svg, refit);
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
  renderDiagnostics(diagnostics ?? [], source);
  if (!ok) {
    const n = errors.length;
    statusEl.classList.add("err");
    statusText.textContent = `${n} error${n > 1 ? "s" : ""}`;
    return; // keep last good preview
  }
  statusEl.classList.remove("err");
  const warns = (diagnostics ?? []).filter((d) => d.severity === "warning");
  statusText.textContent = warns.length ? `${warns.length} warning${warns.length > 1 ? "s" : ""}` : "ready";
  showSvg(svg, refit);
  lastSvg = svg;
  lastScene = scene ?? null;
}

/**
 * Render the compiler diagnostics into the `#errors` panel as clickable rows:
 * clicking a row jumps the editor caret to the diagnostic's source span, and a
 * disclosure reveals the error-catalog entry (cause / fix / example) — the same
 * self-correcting context `arch explain <CODE>` gives an agent. Errors first,
 * then warnings; the panel hides when the plan is clean.
 */
function renderDiagnostics(diagnostics: Diagnostic[], source: string) {
  const rows = diagnostics
    .filter((d) => d.severity === "error" || d.severity === "warning")
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  if (rows.length === 0) {
    errorsEl.classList.remove("show");
    errorsEl.innerHTML = "";
    return;
  }
  errorsEl.classList.add("show");
  errorsEl.innerHTML = rows
    .map((d, i) => {
      const offset = d.span ? d.span.start : null;
      const loc = offset != null ? offsetToLineCol(source, offset) : null;
      const locText = loc ? `${loc.line}:${loc.col}` : "";
      const cat = d.code ? (ERROR_CATALOG[d.code] ?? null) : null;
      // Prefer the diagnostic's own fix, else the catalog's; show cause + example.
      const fix = (d as { fix?: string }).fix ?? cat?.fix ?? d.hints?.[0] ?? "";
      const detail = cat
        ? `<div class="diag-detail">` +
          (cat.cause ? `<p><b>Cause</b> ${escapeHtml(cat.cause)}</p>` : "") +
          (fix ? `<p><b>Fix</b> ${escapeHtml(fix)}</p>` : "") +
          (cat.example ? `<pre>${escapeHtml(cat.example)}</pre>` : "") +
          `</div>`
        : fix
          ? `<div class="diag-detail"><p><b>Fix</b> ${escapeHtml(fix)}</p></div>`
          : "";
      return (
        `<div class="diagrow diag-${d.severity}" data-i="${i}"${offset != null ? ` data-offset="${offset}"` : ""}>` +
        `<div class="diag-head">` +
        `<code>${escapeHtml(d.code ?? d.severity)}</code>` +
        `<span class="diag-msg">${escapeHtml(d.message)}</span>` +
        (locText ? `<span class="diag-loc">${locText}</span>` : "") +
        (detail ? `<span class="diag-toggle" aria-hidden="true">▸</span>` : "") +
        `</div>${detail}</div>`
      );
    })
    .join("");
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

/** Briefly show a message in the status text, then restore it. */
function flash(msg: string) {
  const prev = statusText.textContent;
  statusText.textContent = msg;
  setTimeout(() => {
    statusText.textContent = prev;
  }, 1200);
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

  view = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        highlightActiveLine(),
        lintGutter(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        archLanguage(),
        archCompletion(),
        archLinter(),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.55" },
          ".cm-content": { padding: "10px 0" },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onDocChanged(u.state.doc.toString());
        }),
      ],
    }),
    parent: document.getElementById("editor")!,
  });

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

  // Copy permalink (B5) — the hash carries the source; copy the full URL.
  copyLinkBtn.addEventListener("click", async () => {
    await updateHash(currentSource()); // ensure the URL reflects the latest edit
    try {
      await navigator.clipboard.writeText(location.href);
      flash("Link copied");
    } catch {
      flash("Copy failed");
    }
  });

  // Saved snapshots (history) — named stashes in localStorage.
  mountSnapshots({ button: savedBtn, getSource: currentSource, setSource: (src) => loadSource(src, true) });

  // Floating preview toolbar — pan/zoom + copy.
  pzToolbar.addEventListener("click", (e) => {
    const action = (e.target as Element | null)?.closest<HTMLElement>("button")?.dataset.pz;
    if (action === "in") pz.zoomIn();
    else if (action === "out") pz.zoomOut();
    else if (action === "fit") pz.fit();
    else if (action === "full") toggleFullscreen();
    else if (action === "copysvg") void copySvg();
    else if (action === "copypng") void copyPng();
  });

  // Preview interactions: hover a room for facts (C2), click any element to jump
  // the editor caret to its source (C3, via the annotate data-span attributes).
  mountInteract({
    viewport: pzViewport,
    stage: pzStage,
    getRooms: () => lastRooms,
    jumpToOffset,
  });

  mountDivider();

  // Format (idempotent, comment-preserving) — rewrite the source in place.
  formatBtn?.addEventListener("click", () => {
    const src = currentSource();
    const out = format(src);
    if (out === src) {
      flash("Already formatted");
      return;
    }
    loadSource(out, false);
    flash("Formatted");
  });

  // Repair furniture (ADR 0006) — run the deterministic corrector, show the change
  // log, and let the user apply the new source. Never auto-applied.
  repairBtn?.addEventListener("click", () => showRepair());

  // Embed — build an <iframe> snippet pointing at the chrome-less embed page.
  embedBtn?.addEventListener("click", () => void showEmbed());

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
  requestAnimationFrame(() => pz.fit());
}

/** Run `repair` on the current source and render its change log into the Lint tab,
 *  with an "Apply fixes" action that swaps the corrected source into the editor. */
function showRepair() {
  if (!repairPanel) return;
  const result = repair(currentSource());
  if (!result.changed && result.unresolved.length === 0) {
    repairPanel.hidden = false;
    repairPanel.innerHTML = `<p class="repair-none">Nothing to repair — furniture placement is already sound.</p>`;
    return;
  }
  const changeRows = result.changes
    .map(
      (c) =>
        `<li><code>${escapeHtml(c.id)}</code> <span class="repair-cat">${escapeHtml(c.category)}</span>` +
        `<span class="repair-move">(${c.from.x},${c.from.y}) → (${c.to.x},${c.to.y})</span>` +
        `<span class="repair-reason">${escapeHtml(c.reason)}</span></li>`,
    )
    .join("");
  const unresolvedRows = result.unresolved
    .map((u) => `<li class="repair-un"><code>${escapeHtml(u.id)}</code> ${escapeHtml(u.reason)}</li>`)
    .join("");
  repairPanel.hidden = false;
  repairPanel.innerHTML =
    `<div class="repair-head"><strong>Repair — ${result.changes.length} fix${result.changes.length === 1 ? "" : "es"}` +
    `${result.unresolved.length ? `, ${result.unresolved.length} unresolved` : ""}</strong>` +
    (result.changed ? `<button class="repair-apply" type="button">Apply fixes</button>` : "") +
    `</div>` +
    (changeRows ? `<ul class="repair-list">${changeRows}</ul>` : "") +
    (unresolvedRows
      ? `<p class="repair-un-h">Left for you to resolve (repair never guesses):</p><ul class="repair-list">${unresolvedRows}</ul>`
      : "");
  repairPanel.querySelector(".repair-apply")?.addEventListener("click", () => {
    loadSource(result.source, false);
    repairPanel.hidden = true;
    flash("Repaired");
  });
}

/** Present a copyable iframe (and Markdown) snippet that embeds the current plan
 *  via the chrome-less embed page, using the shared `#z=` share codec. */
async function showEmbed() {
  const hash = await encodeSrc(currentSource());
  const origin = location.origin + location.pathname.replace(/[^/]*$/, "");
  const embedUrl = `${origin}embed.html${hash}`;
  const iframe = `<iframe src="${embedUrl}" width="720" height="480" style="border:1px solid #e3e0d8;border-radius:10px" title="ArchLang floor plan" loading="lazy"></iframe>`;
  const md = `[![ArchLang floor plan](${origin}embed.html${hash})](${embedUrl})`;
  const dialog = document.createElement("div");
  dialog.className = "embed-dialog";
  dialog.innerHTML =
    `<div class="embed-box">` +
    `<div class="embed-head"><strong>Embed this plan</strong><button class="embed-close" type="button" aria-label="Close">×</button></div>` +
    `<label>iframe (HTML)</label><textarea class="embed-code" readonly rows="3">${escapeHtml(iframe)}</textarea>` +
    `<label>Live editable link</label><input class="embed-link" readonly value="${escapeHtml(embedUrl)}&editable=1" />` +
    `<div class="embed-actions"><button class="embed-copy" data-snippet="iframe" type="button">Copy iframe</button>` +
    `<button class="embed-copy" data-snippet="md" type="button">Copy Markdown</button>` +
    `<a class="embed-open" href="${embedUrl}&editable=1" target="_blank" rel="noopener">Open embed ↗</a></div>` +
    `</div>`;
  document.body.appendChild(dialog);
  const close = () => dialog.remove();
  dialog.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (target === dialog || target?.closest(".embed-close")) close();
  });
  for (const btn of dialog.querySelectorAll<HTMLElement>(".embed-copy")) {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.snippet === "md" ? md : iframe);
        flash(btn.dataset.snippet === "md" ? "Markdown copied" : "Embed snippet copied");
        close();
      } catch {
        flash("Copy failed");
      }
    });
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else pzViewport.requestFullscreen?.();
}

async function copySvg() {
  if (!lastSvg) return;
  try {
    await navigator.clipboard.writeText(cleanSvg());
    flash("SVG copied");
  } catch {
    flash("Copy failed");
  }
}

async function copyPng() {
  if (!lastSvg) return;
  try {
    const canvas = await svgToCanvas(cleanSvg());
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob! })]);
    flash("PNG copied");
  } catch {
    flash("Copy failed");
  }
}

/** Draggable split divider over the pane seam (desktop two-column layout). */
function mountDivider() {
  const main = document.querySelector<HTMLElement>("main")!;
  const divider = document.createElement("div");
  divider.className = "divider";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", "Resize panes");
  main.appendChild(divider);

  const applyRatio = (r: number) => {
    main.style.gridTemplateColumns = `${r}fr ${1 - r}fr`;
    divider.style.left = `${r * 100}%`;
  };
  let ratio = parseFloat(readStr(KEYS.split) ?? "");
  if (!(ratio > 0.1 && ratio < 0.9)) ratio = 0.5;
  applyRatio(ratio);

  divider.addEventListener("pointerdown", (e) => {
    if (window.innerWidth <= 760) return; // stacked layout — divider is inert
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    divider.classList.add("dragging");
    const onMove = (ev: PointerEvent) => {
      const rect = main.getBoundingClientRect();
      ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
      applyRatio(ratio);
    };
    const onUp = () => {
      divider.classList.remove("dragging");
      divider.removeEventListener("pointermove", onMove);
      divider.removeEventListener("pointerup", onUp);
      writeStr(KEYS.split, String(ratio));
    };
    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp);
  });

  // Keep the divider aligned to the seam on viewport resize.
  window.addEventListener("resize", () => applyRatio(ratio));
}

// ---- multi-format download (SVG vector · DXF vector · PNG/PDF raster) ----

/** Trigger a browser download of `blob` as `floorplan.<ext>`. */
function saveBlob(blob: Blob, ext: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `floorplan.${ext}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Longest raster edge (px). Bounds output so a large plan can't exceed the
 *  browser's max canvas area (which silently makes `toBlob` return null). */
const MAX_RASTER_EDGE = 4000;

/** Rasterize the current SVG to a canvas, scaled to fit within MAX_RASTER_EDGE. */
function svgToCanvas(svg: string): Promise<HTMLCanvasElement> {
  const m = svg.match(/viewBox="([\d.eE+-]+) ([\d.eE+-]+) ([\d.eE+-]+) ([\d.eE+-]+)"/);
  const vbW = m ? parseFloat(m[3]) : 800;
  const vbH = m ? parseFloat(m[4]) : 600;
  // Fit the longest edge to MAX_RASTER_EDGE (never upscale past 2×).
  const scale = Math.min(2, MAX_RASTER_EDGE / Math.max(vbW, vbH));
  const W = Math.max(1, Math.round(vbW * scale));
  const H = Math.max(1, Math.round(vbH * scale));
  // Give the standalone SVG an intrinsic size so <img> rasterizes predictably.
  const sized = svg.includes(" width=") ? svg : svg.replace("<svg ", `<svg width="${vbW}" height="${vbH}" `);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function downloadCurrent(format: string) {
  if (!lastSvg) return;
  try {
    if (format === "svg") {
      saveBlob(new Blob([cleanSvg()], { type: "image/svg+xml" }), "svg");
    } else if (format === "dxf") {
      if (!lastScene) return;
      saveBlob(new Blob([toDxf(lastScene)], { type: "application/dxf" }), "dxf");
    } else if (format === "png") {
      const canvas = await svgToCanvas(cleanSvg());
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      saveBlob(blob!, "png");
    } else if (format === "pdf") {
      // Vector PDF needs Node-only pdfkit; in-browser we embed a high-res raster
      // via jsPDF (lazy-loaded so it never bloats the initial bundle).
      const canvas = await svgToCanvas(cleanSvg());
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        unit: "pt",
        format: [canvas.width, canvas.height],
        compress: true, // Flate-compress streams — line-art on white shrinks hugely.
      });
      // "FAST" compression on the embedded raster keeps the PDF a sane size
      // (an uncompressed full-res PNG embed runs to tens of MB).
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
      pdf.save("floorplan.pdf");
    }
  } catch (err) {
    statusEl.classList.add("err");
    statusText.textContent = `${format.toUpperCase()} export failed`;
    errorsEl.classList.add("show");
    errorsEl.textContent = `${format.toUpperCase()} export failed: ${(err as { message?: string })?.message ?? err}`;
  }
}

document.getElementById("download")!.addEventListener("click", () => {
  void downloadCurrent(formatSelect ? formatSelect.value : "svg");
});

// Bootstrap (async — resolves the shared/saved source, then builds the editor).
void init();
