/**
 * The MCP App viewer for `compile` results (spec: MCP Apps 2026-01-26, `@modelcontextprotocol/ext-apps`).
 *
 * The host pushes the call's arguments (`ui/notifications/tool-input`) and its result
 * (`ui/notifications/tool-result`). An SVG result is drawn with pan and zoom; the plan's lint
 * findings are fetched with the server's own `lint` tool when the host lets an app call tools, and
 * otherwise the result's compile diagnostics are listed. Anything that is not an SVG drawing (a
 * `txt`/`json` result, a refusal, an error) is shown as the text the model also received: the
 * result's `content` stays the text fallback the spec requires for every host.
 */
import { App } from "@modelcontextprotocol/ext-apps";
import { sanitizeSvg } from "./svg-sanitize.js";

interface DiagnosticJson {
  code?: string;
  severity: string;
  message: string;
  line?: number;
  col?: number;
}

interface CompilePayload {
  ok?: boolean;
  format?: string;
  output?: unknown;
  error?: string;
  diagnostics?: DiagnosticJson[];
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = $("status");
const stage = $("stage");
const canvas = $("canvas");
const findings = $("findings");
const findingsTitle = $("findings-title");
const findingsList = $("findings-list");
const fallback = $("fallback");

let lastSource: string | undefined;

// ---------------------------------------------------------------------------
// pan and zoom
// ---------------------------------------------------------------------------

const view = { scale: 1, x: 0, y: 0 };
const apply = () => {
  canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
};
// Drawings are in millimetres (a 10 m plan is 10,000 units), so the floor is far below 1.
const clamp = (v: number) => Math.min(40, Math.max(0.0005, v));

function zoomAt(px: number, py: number, factor: number): void {
  const next = clamp(view.scale * factor);
  view.x = px - (px - view.x) * (next / view.scale);
  view.y = py - (py - view.y) * (next / view.scale);
  view.scale = next;
  apply();
}

function fit(): void {
  const svg = canvas.querySelector("svg");
  if (!svg) return;
  const w = svg.width.baseVal.value || svg.getBoundingClientRect().width / view.scale || 1;
  const h = svg.height.baseVal.value || svg.getBoundingClientRect().height / view.scale || 1;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  view.scale = clamp(Math.min(sw / w, sh / h) * 0.95);
  view.x = (sw - w * view.scale) / 2;
  view.y = (sh - h * view.scale) / 2;
  apply();
}

stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  },
  { passive: false },
);
let drag: { id: number; x: number; y: number } | undefined;
stage.addEventListener("pointerdown", (e) => {
  if ((e.target as HTMLElement).closest("button")) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  view.x += e.clientX - drag.x;
  view.y += e.clientY - drag.y;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  apply();
});
const endDrag = () => {
  drag = undefined;
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
const centre = () => [stage.clientWidth / 2, stage.clientHeight / 2] as const;
$("zoom-in").addEventListener("click", () => zoomAt(...centre(), 1.25));
$("zoom-out").addEventListener("click", () => zoomAt(...centre(), 0.8));
$("fit").addEventListener("click", fit);
stage.tabIndex = 0;
stage.addEventListener("keydown", (e) => {
  if (e.key === "+" || e.key === "=") zoomAt(...centre(), 1.25);
  else if (e.key === "-") zoomAt(...centre(), 0.8);
  else if (e.key === "0") fit();
});

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/** The compiler's SVG as a sanitised element (`svg-sanitize.ts`), sized by its `viewBox`. */
function svgElement(text: string): SVGSVGElement | undefined {
  const root = sanitizeSvg(text);
  if (!root) return undefined;
  // The compiler sizes its drawings by `viewBox` alone; give the element that size in user units
  // so fit() scales a known box (an unsized <svg> lays out at the browser's 300×150 default).
  const vb = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite)) {
    if (!root.hasAttribute("width")) root.setAttribute("width", String(vb[2]));
    if (!root.hasAttribute("height")) root.setAttribute("height", String(vb[3]));
  }
  return root;
}

function listDiagnostics(title: string, ds: DiagnosticJson[]): void {
  findingsTitle.textContent = title;
  findingsList.replaceChildren();
  if (ds.length === 0) {
    const li = document.createElement("li");
    li.textContent = "None.";
    findingsList.append(li);
  }
  for (const d of ds) {
    const li = document.createElement("li");
    li.className = d.severity;
    const code = document.createElement("span");
    code.className = "code";
    code.textContent = d.code ?? d.severity;
    const where = d.line !== undefined ? ` (line ${d.line}, col ${d.col ?? 1})` : "";
    li.append(code, document.createTextNode(` ${d.message}${where}`));
    findingsList.append(li);
  }
  findings.hidden = false;
}

function showText(text: string, note: string): void {
  stage.hidden = true;
  fallback.textContent = text;
  fallback.hidden = false;
  status.textContent = note;
}

async function showLint(app: App, compileDiagnostics: DiagnosticJson[]): Promise<void> {
  const canCall = app.getHostCapabilities()?.serverTools !== undefined;
  if (lastSource === undefined || !canCall) {
    listDiagnostics("Compile diagnostics", compileDiagnostics);
    return;
  }
  try {
    const r = await app.callServerTool({ name: "lint", arguments: { source: lastSource } });
    const text = (r.content ?? []).find((c) => c.type === "text") as { text?: string } | undefined;
    const lint = JSON.parse(text?.text ?? "{}") as { diagnostics?: DiagnosticJson[] };
    listDiagnostics("Lint findings", [...compileDiagnostics, ...(lint.diagnostics ?? [])]);
  } catch {
    listDiagnostics("Compile diagnostics (lint unavailable)", compileDiagnostics);
  }
}

async function render(app: App, result: { content?: Array<{ type: string; text?: string }> }): Promise<void> {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  let payload: CompilePayload;
  try {
    payload = JSON.parse(text) as CompilePayload;
  } catch {
    showText(text, "The result is not a compile result; shown as text.");
    return;
  }
  const svg = typeof payload.output === "string" && payload.output.trimStart().startsWith("<svg") ? payload.output : "";
  const el = svg ? svgElement(svg) : undefined;
  if (!payload.ok || !el) {
    showText(
      typeof payload.output === "string" ? payload.output : JSON.stringify(payload, null, 2),
      payload.ok
        ? `Compiled to ${payload.format ?? "text"}; shown as text.`
        : (payload.error ?? "The plan did not compile."),
    );
    listDiagnostics("Compile diagnostics", payload.diagnostics ?? []);
    return;
  }
  fallback.hidden = true;
  canvas.replaceChildren(el);
  stage.hidden = false;
  status.textContent = "Drag to pan, scroll or +/− to zoom, Fit to reset.";
  fit();
  await showLint(app, payload.diagnostics ?? []);
}

// ---------------------------------------------------------------------------
// the MCP App handshake
// ---------------------------------------------------------------------------

const app = new App({ name: "archlang-viewer", version: __VIEWER_VERSION__ });
app.ontoolinput = (params) => {
  const source = (params.arguments as { source?: unknown } | undefined)?.source;
  lastSource = typeof source === "string" ? source : undefined;
};
app.ontoolresult = (result) => {
  void render(app, result as { content?: Array<{ type: string; text?: string }> });
};
app.connect().catch(() => {
  status.textContent = "This page is an MCP App: it shows a compile result inside a host that supports MCP Apps.";
});
