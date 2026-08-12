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
 * poché regions fill with the solid poché base colour in PDF: a `hatch` is the same
 * multi-loop nonzero path a `region` is, so both share one `case` in {@link drawNode}
 * and `fillColor` collapses the `url(#…)` pattern ref to {@link Theme.pocheBase}.
 * That claim was false in every release through v1.26.0 — the switch simply had no
 * `hatch` case and no `default`, the `wallFill` layer is exactly one `hatch`
 * primitive, and so every PDF this project ever exported drew hollow walls. The
 * `default` below is now an exhaustiveness guard so a new `ScenePrim` cannot be
 * dropped the same silent way.
 *
 * **Output is byte-reproducible.** pdfkit defaults `info.CreationDate` to
 * `new Date()` and derives the trailer `/ID` as an MD5 over the whole info dict, so
 * a stock document differs between two renders of the same Scene — which contradicts
 * this project's central determinism guarantee and made PDF the one shipped format
 * without it. A PDF derived entirely from source text carries no information in a
 * wall-clock stamp that the source does not already carry, so {@link toPdf} passes a
 * fixed {@link PDF_EPOCH_MS} instead and both fields become constant. `Producer` and
 * `Creator` are pdfkit's own literal `PDFKit` strings and there is no `ModDate`, so
 * `CreationDate` was the only variable input. Note this is a CONSTANT, not a clock
 * read: `src/` outside the CLI may not read the time (the `World` seam exists for
 * that), which is also why `SOURCE_DATE_EPOCH` is deliberately not honoured here.
 */

import type { NorthDir, Point } from "../ast.js";
import type { Paint, Scene, SceneNode } from "../scene.js";
import { RENDER_PASSES } from "../scene.js";
import type { Theme } from "../theme.js";
import { layoutChrome, type TitleRow } from "../chrome-layout.js";
import { plainText } from "../text-safe.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** PostScript points per millimetre (72 dpi ÷ 25.4 mm/in) — the true-page-size factor. */
const PT_PER_MM = 72 / 25.4;

/**
 * The fixed `Info /CreationDate` every ArchLang PDF carries, in epoch milliseconds —
 * the Unix epoch, written as `(D:19700101000000Z)`.
 *
 * Deliberately a SENTINEL rather than a plausible-looking date. The output is a pure
 * function of the source, so there is no honest creation instant to report; a reader
 * who opens the document properties and sees 1970-01-01 — two decades before the PDF
 * format existed — reads it correctly as "this field is not a timestamp". A date that
 * merely looked real (a release date, say) would be worse than useless: it would be
 * believed. It is also the epoch the reproducible-builds convention converges on.
 */
const PDF_EPOCH_MS = 0;

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
  // PDF's own default mitre limit is 10, SVG's is 4 — so without this an acute wall
  // joint grew a spike in the PDF that the SVG never had.
  if (paint.miterLimit !== undefined) doc.miterLimit(paint.miterLimit);
  doc.lineCap(paint.linecap === "square" ? "square" : "butt");
  if (paint.dash) doc.dash(paint.dash[0], { space: paint.dash[1] });
  else doc.undash();
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
  else doc.stroke();
}

/** Draw text honouring the primitive's anchor/baseline/rotation (selectable). */
function drawText(
  doc: any,
  at: Point,
  rawValue: string,
  size: number,
  anchor: string,
  rotate: number | undefined,
  color: string,
): void {
  // Same rule as the DXF backend: a control character or unpaired surrogate in a
  // label must never reach the container's encoder. Identity on well-formed text.
  const value = plainText(rawValue);
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
    // A hatch IS a region — the same closed loops under the same nonzero fill rule.
    // The only difference is its `paint.fill`, an SVG `url(#pattern)` ref that PDF has
    // no equivalent of, and `fillColor` already collapses that to the solid poché base.
    // So they share one path rather than growing a second copy of `regionPath`.
    case "region":
    case "hatch":
      doc.path(regionPath(prim.t === "region" ? prim.loops : prim.region));
      applyPaint(doc, paint, theme);
      break;
    case "arc":
      doc.path(`M ${prim.start.x} ${prim.start.y} A ${prim.r} ${prim.r} 0 0 ${prim.sweep} ${prim.end.x} ${prim.end.y}`);
      applyPaint(doc, paint, theme);
      break;
    case "circle":
      doc.circle(prim.center.x, prim.center.y, prim.r);
      applyPaint(doc, paint, theme);
      break;
    case "text":
      drawText(doc, prim.at, prim.value, prim.size, prim.anchor, prim.rotate, fillColor(paint, theme) ?? "#000000");
      break;
    default: {
      // Exhaustiveness guard. A `ScenePrim` with no case here used to be dropped in
      // silence — which is exactly how poché went missing from every PDF ever exported.
      // Adding a variant to the union now fails the typecheck at this line instead.
      const unhandled: never = prim;
      throw new Error(`PDF export: unhandled scene primitive ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Convert a {@link Scene} to a vector PDF (Uint8Array). Requires optional `pdfkit`. */
export async function toPdf(scene: Scene): Promise<Uint8Array> {
  let PDFDocument: any;
  try {
    PDFDocument = (await import(/* webpackIgnore: true */ /* @vite-ignore */ "pdfkit" as string)).default;
  } catch {
    throw new Error("PDF export needs the optional dependency 'pdfkit'. Install it: npm install pdfkit");
  }

  const { theme, sizes, bounds: b } = scene;
  // Per-side margins from the shared chrome layout (match scene.width/height).
  // `toScene` already computed the layout; fall back for hand-built Scenes.
  const m = (
    scene.chrome ??
    layoutChrome({
      bounds: b,
      refDim: sizes.refDim,
      baseMargin: sizes.margin,
      nodes: scene.nodes,
      title: scene.title,
      scale: scene.scale,
    })
  ).margin;
  const page = scene.sheet?.page;
  const vbX = page ? page.x : b.minX - m.left;
  const vbY = page ? page.y : b.minY - m.top;
  const W = scene.width;
  const H = scene.height;

  // Page size + the plan→page mapping.
  //
  //  • No sheet (the historical path): 1 mm is treated as 1 pt, so the page is the
  //    drawing's own padded extent. Unchanged.
  //  • With a sheet: the page is the TRUE paper size in PostScript points and user
  //    space is scaled by (pt/mm ÷ denominator), so the drawing prints at exactly its
  //    declared scale — a 1:200 A1 sheet measures 841 × 594 mm in the PDF. Stroke
  //    widths and font sizes ride the CTM, so they land at their sheet-mm values.
  const k = page && scene.sheet ? PT_PER_MM / scene.sheet.denom : 1;
  // `info.CreationDate` is the ONLY variable input pdfkit has (see the header): it
  // defaults to `new Date()` and the trailer `/ID` is an MD5 over the info dict, so
  // pinning it to the sentinel epoch makes the whole file a pure function of the Scene.
  // A fresh Date per call, so the module never shares a mutable object across renders.
  const doc = new PDFDocument({
    size: [W * k, H * k],
    margin: 0,
    info: { CreationDate: new Date(PDF_EPOCH_MS) },
  });
  const chunks: Uint8Array[] = [];
  const done = new Promise<void>((resolve, reject) => {
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => resolve());
    doc.on("error", (e: Error) => reject(e));
  });

  // Map scene space → page space (top-left of the viewBox to the page origin).
  doc.save();
  if (k !== 1) doc.scale(k);
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

  // Scale bar + title block come from the shared chrome layout (placed below the
  // dimension band; the bottom margin already grew to fit — see scene.height).
  const chrome =
    scene.chrome ??
    layoutChrome({
      bounds: b,
      refDim,
      baseMargin: margin,
      nodes: scene.nodes,
      title: scene.title,
      scale: scene.scale,
    });

  // Scale bar (two-segment alternating bar + end labels).
  {
    const { x0, y0, barLen, hgt, fs } = chrome.scaleBar;
    const half = barLen / 2;
    doc.rect(x0, y0, half, hgt).fill(theme.annotation);
    doc.lineWidth(thin).undash();
    doc.rect(x0 + half, y0, half, hgt).stroke(theme.annotation);
    drawText(doc, { x: x0, y: y0 + hgt + fs }, "0", fs, "start", undefined, theme.annotation);
    drawText(
      doc,
      { x: x0 + barLen, y: y0 + hgt + fs },
      `${barLen / 1000} m`,
      fs,
      "middle",
      undefined,
      theme.annotation,
    );
  }

  // Title block (framed metadata rows).
  if (chrome.titleBlock) {
    const { x0, y0, w: boxW, h: boxH, rowH, fs, pad, rows } = chrome.titleBlock;
    doc.lineWidth(thin).undash();
    doc.rect(x0, y0, boxW, boxH).stroke(theme.annotation);
    rows.forEach((ln: TitleRow, i: number) => {
      const ly = y0 + rowH * (i + 0.5);
      drawText(doc, { x: x0 + pad, y: ly }, ln.k, fs * 0.8, "start", undefined, theme.annotationMuted);
      drawText(doc, { x: x0 + boxW - pad, y: ly }, ln.v, fs, "end", undefined, theme.annotation);
      if (i > 0) {
        doc
          .lineWidth(thin * 0.5)
          .moveTo(x0, y0 + rowH * i)
          .lineTo(x0 + boxW, y0 + rowH * i)
          .stroke(theme.annotation);
      }
    });
  }
}

function northDegrees(north: NorthDir): number {
  switch (north) {
    case "up":
      return 0;
    case "down":
      return 180;
    case "left":
      return 270;
    case "right":
      return 90;
    default:
      return typeof north === "object" ? north.deg : 0;
  }
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
