/**
 * PDF export backend — a **true vector** serializer of the {@link Scene}.
 *
 * Walks the Scene's positioned primitives into pdfkit drawing ops, so strokes
 * are real vector paths and text is selectable (no SVG rasterization round-trip).
 * `pdfkit` is an OPTIONAL dependency, lazy-`import()`ed so the zero-dep core never
 * hard-requires it; a clear error is thrown if it is absent. Async + Node-oriented
 * — NOT part of `compile()`. Build a Scene with `toScene(ir)` or `compile().scene`.
 *
 * Coordinates: ArchLang is mm, top-left origin, +y down — pdfkit's user space is
 * the same orientation, so we map the viewBox by translating by its top-left and
 * treat 1mm as 1pt (as the previous SVG-based exporter did with `assumePt`).
 *
 * Page chrome (north arrow, scale bar, title block) is drawn with PDF-native
 * helpers to keep parity with the SVG output. This duplicates the chrome geometry
 * (also in `backends/svg.ts`) — a deliberate, bounded cost until chrome itself
 * moves into the Scene in a later phase. Hatch patterns are SVG-specific, so
 * poché regions fill with the solid poché base colour in PDF.
 */

import type { NorthDir, Point } from "../ast.js";
import type { Paint, Scene, SceneNode } from "../scene.js";
import { RENDER_PASSES } from "../scene.js";
import type { Theme } from "../theme.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Resolve a Paint fill to a concrete PDF colour, or null for no fill. */
function fillColor(paint: Paint, theme: Theme): string | null {
  const f = paint.fill;
  if (!f || f === "none") return null;
  // SVG hatch pattern refs have no PDF equivalent → fill with the poché base.
  if (f.startsWith("url(")) return theme.pocheBase;
  return f;
}

function regionPath(loops: Point[][]): string {
  return loops.map((loop) => "M " + loop.map((p) => `${p.x} ${p.y}`).join(" L ") + " Z").join(" ");
}

/** Apply fill/stroke/width/dash to the path currently built on `doc`. */
function applyPaint(doc: any, paint: Paint, theme: Theme): void {
  const fill = fillColor(paint, theme);
  const stroke = paint.stroke && paint.stroke !== "none" ? paint.stroke : null;
  if (paint.width !== undefined) doc.lineWidth(paint.width);
  doc.lineJoin(paint.linejoin ?? "miter");
  doc.lineCap(paint.linecap === "square" ? "square" : "butt");
  if (paint.dash) doc.dash(paint.dash[0], { space: paint.dash[1] });
  else doc.undash();
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
  else doc.stroke();
}

/** Draw text honouring the primitive's anchor/baseline/rotation (selectable). */
function drawText(doc: any, at: Point, value: string, size: number, anchor: string, rotate: number | undefined, color: string): void {
  doc.undash();
  doc.fontSize(size).fillColor(color);
  const w = doc.widthOfString(value);
  let x = at.x;
  if (anchor === "middle") x -= w / 2;
  else if (anchor === "end") x -= w;
  // pdfkit places the text box top at y; nudge up to centre on the baseline point.
  const y = at.y - size * 0.5;
  if (rotate !== undefined) {
    doc.save();
    doc.rotate(rotate, { origin: [at.x, at.y] });
    doc.text(value, x, y, { lineBreak: false });
    doc.restore();
  } else {
    doc.text(value, x, y, { lineBreak: false });
  }
}

function drawNode(doc: any, node: SceneNode, theme: Theme): void {
  const { prim, paint } = node;
  switch (prim.t) {
    case "polygon":
      doc.polygon(...prim.pts.map((p) => [p.x, p.y]));
      applyPaint(doc, paint, theme);
      break;
    case "line":
      doc.moveTo(prim.a.x, prim.a.y).lineTo(prim.b.x, prim.b.y);
      applyPaint(doc, paint, theme);
      break;
    case "region":
      doc.path(regionPath(prim.loops));
      applyPaint(doc, paint, theme);
      break;
    case "arc":
      doc.path(`M ${prim.start.x} ${prim.start.y} A ${prim.r} ${prim.r} 0 0 ${prim.sweep} ${prim.end.x} ${prim.end.y}`);
      applyPaint(doc, paint, theme);
      break;
    case "text":
      drawText(doc, prim.at, prim.value, prim.size, prim.anchor, prim.rotate, fillColor(paint, theme) ?? "#000000");
      break;
  }
}

/** Convert a {@link Scene} to a vector PDF (Uint8Array). Requires optional `pdfkit`. */
export async function toPdf(scene: Scene): Promise<Uint8Array> {
  let PDFDocument: any;
  try {
    PDFDocument = (await import(/* webpackIgnore: true */ /* @vite-ignore */ "pdfkit" as string)).default;
  } catch {
    throw new Error(
      "PDF export needs the optional dependency 'pdfkit'. Install it: npm install pdfkit",
    );
  }

  const { theme, sizes, bounds: b } = scene;
  const margin = sizes.margin;
  const vbX = b.minX - margin;
  const vbY = b.minY - margin;
  const W = scene.width;
  const H = scene.height;

  const doc = new PDFDocument({ size: [W, H], margin: 0 });
  const chunks: Uint8Array[] = [];
  const done = new Promise<void>((resolve, reject) => {
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => resolve());
    doc.on("error", (e: Error) => reject(e));
  });

  // Map scene space → page space (top-left of the viewBox to the page origin).
  doc.save();
  doc.translate(-vbX, -vbY);

  // Background fills the whole padded page.
  doc.rect(vbX, vbY, W, H).fill(theme.bg);

  // Element/wall primitives, bucketed by layer (deterministic draw order).
  for (const pass of RENDER_PASSES) {
    for (const node of scene.nodes) if (node.layer === pass) drawNode(doc, node, theme);
  }

  drawChrome(doc, scene);

  doc.restore();
  doc.end();
  await done;
  return concat(chunks);
}

/** North arrow + scale bar + title block — PDF parity with the SVG chrome. */
function drawChrome(doc: any, scene: Scene): void {
  const { theme, sizes, bounds: b } = scene;
  const refDim = sizes.refDim;
  const margin = sizes.margin;
  const thin = sizes.thin;

  // North arrow (triangle rotated by bearing; "N" stays upright).
  {
    const r = refDim * 0.045;
    const cx = b.maxX - r;
    const cy = b.minY - margin * 0.55;
    const deg = northDegrees(scene.north);
    const fs = refDim * 0.026;
    doc.save();
    doc.rotate(deg, { origin: [cx, cy] });
    doc
      .polygon([cx, cy - r], [cx - r * 0.5, cy + r * 0.6], [cx, cy + r * 0.25], [cx + r * 0.5, cy + r * 0.6])
      .fill(theme.annotation);
    doc.restore();
    const rad = (deg * Math.PI) / 180;
    const lx = cx + Math.sin(rad) * (r + fs * 0.8);
    const ly = cy - Math.cos(rad) * (r + fs * 0.8);
    drawText(doc, { x: lx, y: ly }, "N", fs, "middle", undefined, theme.annotation);
  }

  // Scale bar (two-segment alternating bar + end labels).
  {
    const barLen = niceBarLength(refDim * 0.3);
    const x0 = b.minX;
    const y0 = b.maxY + margin * 0.55;
    const hgt = refDim * 0.014;
    const fs = refDim * 0.02;
    const half = barLen / 2;
    doc.rect(x0, y0, half, hgt).fill(theme.annotation);
    doc.lineWidth(thin).undash();
    doc.rect(x0 + half, y0, half, hgt).stroke(theme.annotation);
    drawText(doc, { x: x0, y: y0 + hgt + fs }, "0", fs, "start", undefined, theme.annotation);
    drawText(doc, { x: x0 + barLen, y: y0 + hgt + fs }, `${barLen / 1000} m`, fs, "middle", undefined, theme.annotation);
  }

  // Title block (framed metadata rows).
  const t = scene.title;
  if (t || scene.scale) {
    const boxW = refDim * 0.34;
    const boxH = margin * 0.82;
    const x0 = b.maxX - boxW;
    const y0 = b.maxY + margin * 0.15;
    const fs = refDim * 0.019;
    const pad = boxW * 0.05;
    const lines: { k: string; v: string }[] = [];
    if (t?.project) lines.push({ k: "PROJECT", v: t.project });
    if (t?.drawnBy) lines.push({ k: "DRAWN BY", v: t.drawnBy });
    if (t?.date) lines.push({ k: "DATE", v: t.date });
    if (scene.scale) lines.push({ k: "SCALE", v: scene.scale });
    doc.lineWidth(thin).undash();
    doc.rect(x0, y0, boxW, boxH).stroke(theme.annotation);
    const rowH = boxH / Math.max(lines.length, 1);
    lines.forEach((ln, i) => {
      const ly = y0 + rowH * (i + 0.5);
      drawText(doc, { x: x0 + pad, y: ly }, ln.k, fs * 0.8, "start", undefined, theme.annotationMuted);
      drawText(doc, { x: x0 + boxW - pad, y: ly }, ln.v, fs, "end", undefined, theme.annotation);
      if (i > 0) {
        doc.lineWidth(thin * 0.5).moveTo(x0, y0 + rowH * i).lineTo(x0 + boxW, y0 + rowH * i).stroke(theme.annotation);
      }
    });
  }
}

function northDegrees(north: NorthDir): number {
  switch (north) {
    case "up": return 0;
    case "down": return 180;
    case "left": return 270;
    case "right": return 90;
    default: return typeof north === "object" ? north.deg : 0;
  }
}

const NICE_LENGTHS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
function niceBarLength(target: number): number {
  let best = NICE_LENGTHS[0];
  for (const v of NICE_LENGTHS) if (v <= target) best = v;
  return best;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
