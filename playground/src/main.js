import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { compile, describe, lint, toDxf, THEMES, LINT_PROFILE_NAMES } from "archlang";
import { archLanguage, archLinter } from "./arch-language.js";
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
const brandLines = document.querySelector("header .brand-lines");
if (brandLines) mountFlowingLines(brandLines, { lineCount: 6 });

const preview = document.getElementById("preview");
const describeEl = document.getElementById("describe");
const lintEl = document.getElementById("lint");
const errorsEl = document.getElementById("errors");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const select = document.getElementById("examples");
const formatSelect = document.getElementById("format");
const themeSelect = document.getElementById("theme");
const lintProfileSelect = document.getElementById("lintProfile");
const lintCaptionEl = document.getElementById("lintCaption");
const lintOutput = document.getElementById("lintOutput");
const copyLinkBtn = document.getElementById("copyLink");

// ---- output tabs (Preview · Describe · Lint) ----
const tabs = [...document.querySelectorAll(".tab")];
const views = { preview, describe: describeEl, lint: lintEl };
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
const LINT_PROFILE_CAPTIONS = {
  "residential-basic": "Default — doors ≥ 700 mm, habitable rooms ≥ 4 m².",
  "accessibility-advisory":
    "Stricter — doors ≥ 850 mm, rooms ≥ 5 m², 150 mm door-swing clearance.",
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

// ---- shareable permalink (B5) ----
// Source is round-tripped through `#src=<base64url>` so a plan can be shared by URL
// with no backend. Caveat: browsers cap URL length (~practically tens of KB), so a
// very large plan may overflow the address bar / fail to copy — fine for snippets.
function encodeSrc(src) {
  return btoa(unescape(encodeURIComponent(src)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function decodeSrc(b64) {
  try {
    const s = b64.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return null;
  }
}
function srcFromHash() {
  const m = location.hash.match(/[#&]src=([^&]*)/);
  return m ? decodeSrc(m[1]) : null;
}
function updateHash(src) {
  // replaceState — keep one entry, don't spam browser history on every keystroke.
  // NB: `history` is shadowed by CodeMirror's `history` import above, so reach for
  // the global explicitly via `window.history`.
  window.history.replaceState(null, "", `#src=${encodeSrc(src)}`);
}

let lastSvg = "";
let lastScene = null;

/** Update the Describe (semantic facts) and Lint (soundness) tabs for `source`. */
function updateAnalysis(source, ok) {
  // Describe — the semantic summary a text-only agent would read. We lead with a
  // compact access-graph diagram (B4) and tuck the raw JSON into a <details>.
  const summary = describe(source, { noCache: true });
  const { diagnostics: _d, ...facts } = summary;
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
  const lintDiags = ok ? lint(source, { profile: lintProfileSelect.value, noCache: true }) : [];
  if (!ok) {
    lintOutput.innerHTML = `<p class="empty">Fix the errors to run the soundness check.</p>`;
  } else if (lintDiags.length === 0) {
    lintOutput.innerHTML = `<p class="ok">✓ No soundness warnings — every room is reachable, bedrooms have windows, the building has an entrance.</p>`;
  } else {
    lintOutput.innerHTML = lintDiags
      .map((d) => `<div class="lintrow"><code>${d.code}</code> ${escapeHtml(d.message)}${d.hints?.length ? `<span class="hint">${escapeHtml(d.hints[0])}</span>` : ""}</div>`)
      .join("");
  }
}

/**
 * Compact access-graph visual from `describe().access`: rooms laid out in flex
 * columns by `depthFromEntrance` (exterior/entrance on the left), unreachable rooms
 * flagged at the end. Zero-dep — pure DOM/CSS, no graph library.
 */
function renderAccessGraph(facts) {
  const access = facts.access;
  if (!access) return `<p class="ag-note">No access graph available for this plan.</p>`;
  if (!access.hasEntrance) {
    return `<p class="ag-note">No exterior entrance — add a <code>door</code> on an exterior wall to model reachability.</p>`;
  }
  const labelOf = new Map((facts.rooms ?? []).map((r) => [r.id, r.label ?? r.id]));
  const card = (r) => {
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
    ...new Set(
      access.rooms.filter((r) => r.reachable && r.depthFromEntrance != null).map((r) => r.depthFromEntrance),
    ),
  ].sort((a, b) => a - b);
  for (const d of depths) {
    const rooms = access.rooms.filter((r) => r.reachable && r.depthFromEntrance === d);
    cols.push(`<div class="ag-col"><div class="ag-col-h">Depth ${d}</div>${rooms.map(card).join("")}</div>`);
  }

  // Trailing column for anything the entrance can't reach.
  const unreachable = access.rooms.filter((r) => r.reachable === false);
  if (unreachable.length) {
    cols.push(`<div class="ag-col"><div class="ag-col-h ag-col-h-bad">Unreachable</div>${unreachable.map(card).join("")}</div>`);
  }
  return `<div class="ag">${cols.join(`<div class="ag-arrow">→</div>`)}</div>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function render(source) {
  // Theme: empty value = the source's own `theme` directive (pass nothing); a named
  // key overrides it (compile's `theme` option wins over an in-source directive).
  const themeKey = themeSelect.value;
  const opts = themeKey ? { noCache: true, theme: THEMES[themeKey] } : { noCache: true };
  const { svg, errors, warnings, scene } = compile(source, opts);
  const ok = errors.length === 0;
  updateAnalysis(source, ok);
  if (!ok) {
    statusEl.classList.add("err");
    statusText.textContent = `${errors.length} error${errors.length > 1 ? "s" : ""}`;
    errorsEl.classList.add("show");
    errorsEl.style.color = "";
    errorsEl.textContent = errors
      .map((e) => `line ${e.line ?? "?"}${e.col ? ":" + e.col : ""}  ${e.message}`)
      .join("\n");
    return; // keep last good preview
  }
  statusEl.classList.remove("err");
  statusText.textContent = warnings.length ? `${warnings.length} warning(s)` : "ready";
  errorsEl.classList.toggle("show", warnings.length > 0);
  errorsEl.style.color = warnings.length ? "#8a6d00" : "";
  errorsEl.textContent = warnings.map((w) => `warning${w.line ? " line " + w.line : ""}: ${w.message}`).join("\n");
  preview.innerHTML = svg;
  lastSvg = svg;
  lastScene = scene ?? null;
}

let debounce;
const onDocChanged = (source) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    render(source);
    updateHash(source); // keep the permalink in sync with the editor
  }, 250);
};

// Prefer a shared `#src=` permalink over the default example on first load (B5).
const sharedSrc = srcFromHash();
const initialDoc = sharedSrc ?? EXAMPLES["Studio (1BR)"];
// Reflect the actually-loaded example in the picker (the editor starts on the Studio
// unless a permalink overrides it, in which case the source is custom — leave the
// picker on its first option as a neutral default).
if (!sharedSrc) select.value = "Studio (1BR)";

const view = new EditorView({
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
  parent: document.getElementById("editor"),
});

const currentSource = () => view.state.doc.toString();

select.addEventListener("change", () => {
  const doc = EXAMPLES[select.value];
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
  render(doc);
});

// Theme switch (B2) — re-render the preview only; describe/lint are theme-agnostic.
themeSelect.addEventListener("change", () => render(currentSource()));

// Lint-profile switch (B3) — update the caption and re-run the soundness check.
lintProfileSelect.addEventListener("change", () => {
  syncLintCaption();
  render(currentSource());
});

// Copy permalink (B5) — the hash already carries the source; copy the full URL.
copyLinkBtn.addEventListener("click", async () => {
  updateHash(currentSource()); // ensure the URL reflects the latest edit
  try {
    await navigator.clipboard.writeText(location.href);
    const prev = statusText.textContent;
    statusText.textContent = "Copied";
    setTimeout(() => {
      statusText.textContent = prev;
    }, 1200);
  } catch {
    statusText.textContent = "Copy failed";
  }
});

// ---- multi-format download (SVG vector · DXF vector · PNG/PDF raster) ----

/** Trigger a browser download of `blob` as `floorplan.<ext>`. */
function saveBlob(blob, ext) {
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
function svgToCanvas(svg) {
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
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

async function downloadCurrent(format) {
  if (!lastSvg) return;
  try {
    if (format === "svg") {
      saveBlob(new Blob([lastSvg], { type: "image/svg+xml" }), "svg");
    } else if (format === "dxf") {
      if (!lastScene) return;
      saveBlob(new Blob([toDxf(lastScene)], { type: "application/dxf" }), "dxf");
    } else if (format === "png") {
      const canvas = await svgToCanvas(lastSvg);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      saveBlob(blob, "png");
    } else if (format === "pdf") {
      // Vector PDF needs Node-only pdfkit; in-browser we embed a high-res raster
      // via jsPDF (lazy-loaded so it never bloats the initial bundle).
      const canvas = await svgToCanvas(lastSvg);
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
    errorsEl.textContent = `${format.toUpperCase()} export failed: ${err?.message ?? err}`;
  }
}

document.getElementById("download").addEventListener("click", () => {
  void downloadCurrent(formatSelect ? formatSelect.value : "svg");
});

// Initial render.
render(view.state.doc.toString());
