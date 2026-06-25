/**
 * SVG backend — a pure serializer of the {@link Scene}.
 *
 * Each `ScenePrim` maps to one SVG element; attributes are emitted in a fixed
 * canonical order so the output is byte-identical to the original string-based
 * renderer (the golden-snapshot regression guard). Page chrome (background,
 * hatch `<pattern>` defs, north arrow, scale bar, title block) lives here — it is
 * SVG-specific framing, not element geometry. Deterministic: all numbers route
 * through {@link fmt}; all interpolated text is escaped via {@link xml}.
 */

import type { NorthDir, Point, TitleNode } from "../ast.js";
import type { CompileOptions } from "../types.js";
import type { LineType, LineWeight, Paint, RenderSizes, Scene, SceneNode } from "../scene.js";
import { RENDER_PASSES } from "../scene.js";
import type { Bounds } from "../geometry.js";
import type { Material } from "../hatches.js";
import { hatchPattern } from "../hatches.js";
import type { Theme } from "../theme.js";

/** Round to 2 decimals and strip trailing zeros — keeps output stable & compact. */
function fmt(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}
const pt = (p: Point): string => `${fmt(p.x)},${fmt(p.y)}`;

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const NICE_LENGTHS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
function niceBarLength(target: number): number {
  let best = NICE_LENGTHS[0];
  for (const v of NICE_LENGTHS) if (v <= target) best = v;
  return best;
}

/**
 * Named line-weight ramp → concrete stroke width in mm, scaled from the drawing.
 * `heavy` matches the wall stroke; the rest step down. The whole hierarchy keys
 * off the same sizes (which already include the theme `lineWeight` multiplier),
 * so weights stay proportional at any drawing size.
 */
function weightWidth(w: LineWeight, sizes: RenderSizes): number {
  switch (w) {
    case "heavy": return sizes.wallStroke;
    case "medium": return sizes.wallStroke * 0.6;
    case "thin": return sizes.thin;
    case "extraThin": return sizes.thin * 0.55;
  }
}

/** Named line type → dash pattern in mm (undefined = solid). */
function dashPattern(t: LineType, sizes: RenderSizes): number[] | undefined {
  const u = sizes.thin;
  switch (t) {
    case "continuous": return undefined;
    case "dashed": return [u * 6, u * 4];
    case "center": return [u * 12, u * 3, u * 3, u * 3];
    case "hidden": return [u * 3, u * 3];
  }
}

/** Effective stroke width: from the named weight if set, else the raw paint width. */
function effWidth(node: SceneNode, sizes: RenderSizes): number {
  return node.lineWeight ? weightWidth(node.lineWeight, sizes) : node.paint.width ?? 0;
}

/** Effective dash array: from the named line type if set, else the raw paint dash. */
function effDash(node: SceneNode, sizes: RenderSizes): number[] | undefined {
  if (node.lineType && node.lineType !== "continuous") return dashPattern(node.lineType, sizes);
  return node.paint.dash;
}

const dashAttr = (dash: number[] | undefined): string =>
  dash ? ` stroke-dasharray="${dash.map(fmt).join(" ")}"` : "";

/** Stroke attributes shared by `polygon`/`line` (omitted entirely when no stroke). */
function strokeAttrs(paint: Paint, width: number, dash: number[] | undefined): string {
  if (!paint.stroke) return "";
  let s = ` stroke="${paint.stroke}" stroke-width="${fmt(width)}"`;
  if (paint.linecap) s += ` stroke-linecap="${paint.linecap}"`;
  s += dashAttr(dash);
  return s;
}

/** Paint attributes for a `<path>` (region/arc), in the canonical attribute order. */
function pathPaint(paint: Paint, width: number, dash: number[] | undefined): string {
  let s = ` fill="${paint.fill ?? "none"}"`;
  if (paint.fillRule) s += ` fill-rule="${paint.fillRule}"`;
  if (paint.stroke) s += ` stroke="${paint.stroke}" stroke-width="${fmt(width)}"`;
  if (paint.linejoin) s += ` stroke-linejoin="${paint.linejoin}"`;
  s += dashAttr(dash);
  return s;
}

function regionPath(loops: Point[][]): string {
  return loops.map((loop) => "M " + loop.map(pt).join(" L ") + " Z").join(" ");
}

/** Serialize one scene node to a single SVG element string. */
function serialize(node: SceneNode, sizes: RenderSizes): string {
  const { prim, paint } = node;
  const width = effWidth(node, sizes);
  const dash = effDash(node, sizes);
  switch (prim.t) {
    case "polygon":
      return `<polygon points="${prim.pts.map(pt).join(" ")}" fill="${paint.fill ?? "none"}"${strokeAttrs(paint, width, dash)}/>`;
    case "line":
      return `<line x1="${fmt(prim.a.x)}" y1="${fmt(prim.a.y)}" x2="${fmt(prim.b.x)}" y2="${fmt(prim.b.y)}" stroke="${paint.stroke ?? "none"}" stroke-width="${fmt(width)}"${paint.linecap ? ` stroke-linecap="${paint.linecap}"` : ""}${dashAttr(dash)}/>`;
    case "region":
      return `<path d="${regionPath(prim.loops)}"${pathPaint(paint, width, dash)}/>`;
    case "arc":
      return `<path d="M ${pt(prim.start)} A ${fmt(prim.r)} ${fmt(prim.r)} 0 0 ${prim.sweep} ${pt(prim.end)}"${pathPaint(paint, width, dash)}/>`;
    case "text": {
      const weight = prim.weight !== undefined ? ` font-weight="${prim.weight}"` : "";
      const transform = prim.rotate !== undefined ? ` transform="rotate(${fmt(prim.rotate)} ${fmt(prim.at.x)} ${fmt(prim.at.y)})"` : "";
      return `<text x="${fmt(prim.at.x)}" y="${fmt(prim.at.y)}" font-size="${fmt(prim.size)}" fill="${paint.fill ?? "none"}" text-anchor="${prim.anchor}" dominant-baseline="${prim.baseline}"${weight}${transform}>${xml(prim.value)}</text>`;
    }
  }
}

/** Serialize a {@link Scene} to a complete SVG document. */
export function renderSvg(scene: Scene, opts: CompileOptions = {}): string {
  const THEME = scene.theme;
  const sizes = scene.sizes;
  const b = scene.bounds;
  const refDim = sizes.refDim;
  const { thin, margin, hatchGap } = sizes;

  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;
  const vbX = b.minX - margin;
  const vbY = b.minY - margin;
  const vbW = drawW + margin * 2;
  const vbH = drawH + margin * 2;

  const out: string[] = [];
  const svgAttrs = opts.width
    ? `width="${fmt(opts.width)}" height="${fmt((opts.width * vbH) / vbW)}"`
    : "";
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ${svgAttrs} viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}" font-family="${THEME.font}">`,
  );

  // Defs: a hatch <pattern> for each wall material in use (default → "poche").
  const hatchCtx = { fmt, gap: hatchGap, thin, base: THEME.pocheBase, line: THEME.pocheHatch };
  const patterns = scene.materials.map((m) => hatchPattern(m as Material, hatchCtx)).join("");
  out.push(`<defs>${patterns}</defs>`);

  // Background
  out.push(`<rect x="${fmt(vbX)}" y="${fmt(vbY)}" width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${THEME.bg}"/>`);

  // Element/wall primitives, bucketed by layer (deterministic draw order).
  for (const pass of RENDER_PASSES) {
    for (const node of scene.nodes) if (node.layer === pass) out.push(serialize(node, sizes));
  }

  // Plan-level annotations (after element passes): north, scale bar, title block.
  out.push(northArrow(scene.north, b, margin, refDim, THEME));
  out.push(scaleBar(b, margin, refDim, thin, THEME));
  const tb = titleBlock(scene.title, scene.scale, b, margin, refDim, thin, THEME);
  if (tb) out.push(tb);

  out.push("</svg>");
  return out.join("\n");
}

function northArrow(north: NorthDir, b: Bounds, margin: number, refDim: number, THEME: Theme): string {
  const r = refDim * 0.045;
  const cx = b.maxX - r;
  const cy = b.minY - margin * 0.55;
  let deg: number;
  switch (north) {
    case "up": deg = 0; break;
    case "down": deg = 180; break;
    case "left": deg = 270; break;
    case "right": deg = 90; break;
    default: deg = typeof north === "object" ? north.deg : 0;
  }
  const fs = refDim * 0.026;
  // Triangle points "up" before rotation; only the arrow rotates — the "N"
  // label stays upright at the pointing end so it always reads correctly.
  const tri = `${fmt(cx)},${fmt(cy - r)} ${fmt(cx - r * 0.5)},${fmt(cy + r * 0.6)} ${fmt(cx)},${fmt(cy + r * 0.25)} ${fmt(cx + r * 0.5)},${fmt(cy + r * 0.6)}`;
  const rad = (deg * Math.PI) / 180;
  // North screen vector (rotate the "up" vector (0,-1) clockwise by deg).
  const nx = Math.sin(rad);
  const ny = -Math.cos(rad);
  const lx = cx + nx * (r + fs * 0.8);
  const ly = cy + ny * (r + fs * 0.8);
  return (
    `<g>` +
    `<polygon points="${tri}" fill="${THEME.annotation}" transform="rotate(${fmt(deg)} ${fmt(cx)} ${fmt(cy)})"/>` +
    `<text x="${fmt(lx)}" y="${fmt(ly)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="middle" dominant-baseline="central">N</text>` +
    `</g>`
  );
}

function scaleBar(b: Bounds, margin: number, refDim: number, thin: number, THEME: Theme): string {
  const barLen = niceBarLength(refDim * 0.3);
  const x0 = b.minX;
  const y0 = b.maxY + margin * 0.55;
  const hgt = refDim * 0.014;
  const fs = refDim * 0.02;
  const parts: string[] = [];
  const half = barLen / 2;
  // two-segment alternating bar
  parts.push(`<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(half)}" height="${fmt(hgt)}" fill="${THEME.annotation}"/>`);
  parts.push(
    `<rect x="${fmt(x0 + half)}" y="${fmt(y0)}" width="${fmt(half)}" height="${fmt(hgt)}" fill="none" stroke="${THEME.annotation}" stroke-width="${fmt(thin)}"/>`,
  );
  parts.push(
    `<text x="${fmt(x0)}" y="${fmt(y0 + hgt + fs)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="start" dominant-baseline="central">0</text>`,
  );
  parts.push(
    `<text x="${fmt(x0 + barLen)}" y="${fmt(y0 + hgt + fs)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="middle" dominant-baseline="central">${barLen / 1000} m</text>`,
  );
  return `<g>${parts.join("")}</g>`;
}

function titleBlock(t: TitleNode | undefined, scale: string | undefined, b: Bounds, margin: number, refDim: number, thin: number, THEME: Theme): string | null {
  if (!t && !scale) return null;
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
  if (scale) lines.push({ k: "SCALE", v: scale });

  const parts: string[] = [];
  parts.push(
    `<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(boxW)}" height="${fmt(boxH)}" fill="none" stroke="${THEME.annotation}" stroke-width="${fmt(thin)}"/>`,
  );
  const rowH = boxH / Math.max(lines.length, 1);
  lines.forEach((ln, i) => {
    const ly = y0 + rowH * (i + 0.5);
    parts.push(
      `<text x="${fmt(x0 + pad)}" y="${fmt(ly)}" font-size="${fmt(fs * 0.8)}" fill="${THEME.annotationMuted}" dominant-baseline="central">${xml(ln.k)}</text>`,
    );
    parts.push(
      `<text x="${fmt(x0 + boxW - pad)}" y="${fmt(ly)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="end" dominant-baseline="central">${xml(ln.v)}</text>`,
    );
    if (i > 0)
      parts.push(
        `<line x1="${fmt(x0)}" y1="${fmt(y0 + rowH * i)}" x2="${fmt(x0 + boxW)}" y2="${fmt(y0 + rowH * i)}" stroke="${THEME.annotation}" stroke-width="${fmt(thin * 0.5)}"/>`,
      );
  });
  return `<g>${parts.join("")}</g>`;
}
