import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { compile, toDxf } from "archlang";
import { archLanguage, archLinter } from "./arch-language.js";
import { EXAMPLES } from "./examples.js";
import "./style.css";

const preview = document.getElementById("preview");
const errorsEl = document.getElementById("errors");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const select = document.getElementById("examples");
const formatSelect = document.getElementById("format");

for (const name of Object.keys(EXAMPLES)) {
  const o = document.createElement("option");
  o.value = name;
  o.textContent = name;
  select.appendChild(o);
}

let lastSvg = "";
let lastScene = null;

function render(source) {
  const { svg, errors, warnings, scene } = compile(source, { noCache: true });
  if (errors.length) {
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
  debounce = setTimeout(() => render(source), 250);
};

const view = new EditorView({
  state: EditorState.create({
    doc: EXAMPLES["Studio (1BR)"],
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

select.addEventListener("change", () => {
  const doc = EXAMPLES[select.value];
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
  render(doc);
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
