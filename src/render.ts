/** Renders a resolved plan (IR) to a professional SVG floor plan. Deterministic. */

import type { Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import type { ResolvedPlan, RWall } from "./ir.js";
import type { RenderCtx, RenderOp, RenderSizes } from "./registry.js";
import { RENDER_PASSES } from "./registry.js";
import { registry } from "./elements/index.js";
import type { Bounds } from "./geometry.js";
import { emptyBounds, extendBounds, segmentRectangle, segmentsOfWall } from "./geometry.js";
import type { Rect } from "./geometry/union.js";
import { rectUnionOutline } from "./geometry/union.js";
import type { Material } from "./hatches.js";
import { hatchPattern, patternId } from "./hatches.js";

const THEME: Record<string, string> = {
  bg: "#ffffff",
  pocheBase: "#e9e4db",
  pocheHatch: "#b9b1a4",
  wallStroke: "#1b1b1b",
  roomFill: "#fbfaf7",
  roomLabel: "#222222",
  areaLabel: "#7a7a7a",
  furnitureStroke: "#a8a29a",
  furnitureFill: "#f4f2ee",
  furnitureLabel: "#9a948c",
  opening: "#ffffff",
  doorLeaf: "#555555",
  windowPane: "#3a6ea5",
  dim: "#0E5484",
  annotation: "#333333",
  annotationMuted: "#888888",
  column: "#4a4a4a",
};

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

/** Drawing bounds: each element contributes points via its registry `bounds`. */
function planBounds(ir: ResolvedPlan): Bounds {
  const b = emptyBounds();
  for (const el of ir.elements) {
    const def = registry.get(el.kind);
    if (!def) continue;
    for (const p of def.bounds(el)) extendBounds(b, p.x, p.y);
  }
  if (!isFinite(b.minX)) {
    // Nothing to draw; provide a default frame.
    return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  }
  return b;
}

/** Is every segment of every wall axis-aligned (horizontal or vertical)? */
function allOrthogonal(walls: RWall[]): boolean {
  return walls.every((w) => segmentsOfWall(w).every((s) => s.a.x === s.b.x || s.a.y === s.b.y));
}

function loopsToPath(loops: { x: number; y: number }[][]): string {
  return loops.map((loop) => "M " + loop.map(pt).join(" L ") + " Z").join(" ");
}

/** Distinct wall materials present, in a stable (sorted) order. */
function materialsUsed(walls: RWall[]): string[] {
  return [...new Set(walls.map((w) => w.material))].sort();
}

/**
 * Wall fill + outline, grouped by material so each material's poché unions
 * independently and fills with its own hatch. For fully-orthogonal walls the
 * segment rectangles are unioned into clean boundary loops (no internal seams);
 * angled walls fall back to the per-segment renderer.
 */
function renderWalls(walls: RWall[], ctx: RenderCtx): RenderOp[] {
  if (walls.length === 0) return [];
  const ops: RenderOp[] = [];
  for (const mat of materialsUsed(walls)) {
    const group = walls.filter((w) => w.material === mat);
    if (!allOrthogonal(group)) {
      const def = registry.get("wall")!;
      ops.push(...group.flatMap((w) => def.render(w, ctx)));
      continue;
    }
    const rects: Rect[] = [];
    for (const w of group) {
      for (const s of segmentsOfWall(w)) {
        const corners = segmentRectangle(s.a, s.b, s.thickness);
        const xsv = corners.map((c) => c.x);
        const ysv = corners.map((c) => c.y);
        rects.push({ x0: Math.min(...xsv), y0: Math.min(...ysv), x1: Math.max(...xsv), y1: Math.max(...ysv) });
      }
    }
    const loops = rectUnionOutline(rects);
    if (loops.length === 0) continue;
    const d = loopsToPath(loops);
    ops.push({ pass: "wallFill", svg: `<path d="${d}" fill="url(#${patternId(mat)})" fill-rule="nonzero"/>` });
    ops.push({
      pass: "wallFace",
      svg: `<path d="${d}" fill="none" stroke="${ctx.theme.wallStroke}" stroke-width="${ctx.fmt(ctx.sizes.wallStroke)}" stroke-linejoin="miter"/>`,
    });
  }
  return ops;
}

export function render(ir: ResolvedPlan, opts: CompileOptions = {}): string {
  const b = planBounds(ir);
  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;
  const refDim = Math.max(drawW, drawH, 1);

  const sizes: RenderSizes = {
    refDim,
    wallStroke: refDim * 0.0028,
    thin: refDim * 0.0016,
    roomFont: refDim * 0.03,
    areaFont: refDim * 0.022,
    dimFont: refDim * 0.02,
    furnFont: refDim * 0.017,
    margin: refDim * 0.17,
    hatchGap: refDim * 0.013,
  };
  const { thin, margin, hatchGap } = sizes;

  const vbX = b.minX - margin;
  const vbY = b.minY - margin;
  const vbW = drawW + margin * 2;
  const vbH = drawH + margin * 2;

  const out: string[] = [];
  const svgAttrs = opts.width
    ? `width="${fmt(opts.width)}" height="${fmt((opts.width * vbH) / vbW)}"`
    : "";
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ${svgAttrs} viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}" font-family="Helvetica, Arial, sans-serif">`,
  );

  // Defs: a hatch <pattern> for each wall material in use (default → "poche").
  const hatchCtx = { fmt, gap: hatchGap, thin, base: THEME.pocheBase, line: THEME.pocheHatch };
  const patterns = materialsUsed(ir.walls)
    .map((m) => hatchPattern(m as Material, hatchCtx))
    .join("");
  out.push(`<defs>${patterns}</defs>`);

  // Background
  out.push(`<rect x="${fmt(vbX)}" y="${fmt(vbY)}" width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${THEME.bg}"/>`);

  // Elements: collect ops once (preserving source order), then emit pass by pass.
  // Walls are rendered centrally (see renderWalls) so their outlines can be
  // unioned across segments — everything else goes through the registry.
  const ctx: RenderCtx = { fmt, pt, xml, theme: THEME, sizes, bounds: b };
  const ops = ir.elements.flatMap((el) => {
    if (el.kind === "wall") return [];
    const def = registry.get(el.kind);
    return def ? def.render(el, ctx) : [];
  });
  ops.push(...renderWalls(ir.walls, ctx));
  for (const pass of RENDER_PASSES) {
    for (const op of ops) if (op.pass === pass) out.push(op.svg);
  }

  // Plan-level annotations (after element passes): north, scale bar, title block.
  out.push(northArrow(ir, b, margin, refDim));
  out.push(scaleBar(b, margin, refDim, thin));
  const tb = titleBlock(ir, b, margin, refDim, thin);
  if (tb) out.push(tb);

  out.push("</svg>");
  return out.join("\n");
}

function northArrow(ir: ResolvedPlan, b: Bounds, margin: number, refDim: number): string {
  const r = refDim * 0.045;
  const cx = b.maxX - r;
  const cy = b.minY - margin * 0.55;
  let deg: number;
  switch (ir.north) {
    case "up": deg = 0; break;
    case "down": deg = 180; break;
    case "left": deg = 270; break;
    case "right": deg = 90; break;
    default: deg = typeof ir.north === "object" ? ir.north.deg : 0;
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

function scaleBar(b: Bounds, margin: number, refDim: number, thin: number): string {
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

function titleBlock(ir: ResolvedPlan, b: Bounds, margin: number, refDim: number, thin: number): string | null {
  const t = ir.title;
  if (!t && !ir.scale) return null;
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
  if (ir.scale) lines.push({ k: "SCALE", v: ir.scale });

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
