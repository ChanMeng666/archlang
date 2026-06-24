/** Renders a validated PlanNode to a professional SVG floor plan. Deterministic. */

import type { PlanNode, Point } from "./ast.js";
import type { CompileOptions } from "./types.js";
import {
  add,
  hostSegment,
  length,
  mul,
  normal,
  planBounds,
  rectCorners,
  segmentRectangle,
  sub,
  unit,
  wallSegments,
} from "./geometry.js";

const THEME = {
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

export function render(plan: PlanNode, opts: CompileOptions = {}): string {
  const b = planBounds(plan);
  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;
  const refDim = Math.max(drawW, drawH, 1);

  const wallStroke = refDim * 0.0028;
  const thin = refDim * 0.0016;
  const roomFont = refDim * 0.03;
  const areaFont = refDim * 0.022;
  const dimFont = refDim * 0.02;
  const furnFont = refDim * 0.017;
  const margin = refDim * 0.17;
  const hatchGap = refDim * 0.013;

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

  // Defs: poché hatch pattern
  out.push(
    `<defs><pattern id="poche" patternUnits="userSpaceOnUse" width="${fmt(hatchGap)}" height="${fmt(hatchGap)}" patternTransform="rotate(45)">` +
      `<rect width="${fmt(hatchGap)}" height="${fmt(hatchGap)}" fill="${THEME.pocheBase}"/>` +
      `<line x1="0" y1="0" x2="0" y2="${fmt(hatchGap)}" stroke="${THEME.pocheHatch}" stroke-width="${fmt(thin * 0.7)}"/>` +
      `</pattern></defs>`,
  );

  // Background
  out.push(`<rect x="${fmt(vbX)}" y="${fmt(vbY)}" width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${THEME.bg}"/>`);

  // 1. Room floor fills
  for (const r of plan.rooms) {
    const c = rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
    out.push(`<polygon points="${c.map(pt).join(" ")}" fill="${THEME.roomFill}"/>`);
  }

  // 2. Furniture
  for (const f of plan.furniture) {
    const c = rectCorners(f.at.x, f.at.y, f.size.w, f.size.h);
    out.push(
      `<polygon points="${c.map(pt).join(" ")}" fill="${THEME.furnitureFill}" stroke="${THEME.furnitureStroke}" stroke-width="${fmt(thin)}"/>`,
    );
    if (f.label) {
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      out.push(
        `<text x="${fmt(cx)}" y="${fmt(cy)}" font-size="${fmt(furnFont)}" fill="${THEME.furnitureLabel}" text-anchor="middle" dominant-baseline="central">${xml(f.label)}</text>`,
      );
    }
  }

  // 3. Walls — poché fill (extended rect) + crisp faces (non-extended)
  const segs = wallSegments(plan);
  for (const s of segs) {
    const poly = segmentRectangle(s.a, s.b, s.thickness);
    out.push(`<polygon points="${poly.map(pt).join(" ")}" fill="url(#poche)"/>`);
  }
  for (const s of segs) {
    const d = unit(sub(s.b, s.a));
    const n = normal(d);
    const h = s.thickness / 2;
    const fa1 = add(s.a, mul(n, h));
    const fb1 = add(s.b, mul(n, h));
    const fa2 = add(s.a, mul(n, -h));
    const fb2 = add(s.b, mul(n, -h));
    out.push(
      `<line x1="${fmt(fa1.x)}" y1="${fmt(fa1.y)}" x2="${fmt(fb1.x)}" y2="${fmt(fb1.y)}" stroke="${THEME.wallStroke}" stroke-width="${fmt(wallStroke)}" stroke-linecap="square"/>`,
    );
    out.push(
      `<line x1="${fmt(fa2.x)}" y1="${fmt(fa2.y)}" x2="${fmt(fb2.x)}" y2="${fmt(fb2.y)}" stroke="${THEME.wallStroke}" stroke-width="${fmt(wallStroke)}" stroke-linecap="square"/>`,
    );
  }

  // 4. Openings (doors + windows): erase wall, then draw symbol
  for (const dr of plan.doors) {
    const seg = hostSegment(plan, dr.at, dr.wall);
    if (!seg) continue;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2 + wallStroke;
    const hw = dr.width / 2;
    // erase
    const cover = [
      add(add(dr.at, mul(d, -hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, -h)),
      add(add(dr.at, mul(d, -hw)), mul(n, -h)),
    ];
    out.push(`<polygon points="${cover.map(pt).join(" ")}" fill="${THEME.opening}"/>`);
    // door symbol
    const hinge = dr.hinge === "left" ? add(dr.at, mul(d, -hw)) : add(dr.at, mul(d, hw));
    const farJamb = dr.hinge === "left" ? add(dr.at, mul(d, hw)) : add(dr.at, mul(d, -hw));
    const leafDir = dr.swing === "in" ? n : mul(n, -1);
    const leafEnd = add(hinge, mul(leafDir, dr.width));
    const cross = (leafEnd.x - hinge.x) * (farJamb.y - hinge.y) - (leafEnd.y - hinge.y) * (farJamb.x - hinge.x);
    const sweep = cross < 0 ? 1 : 0;
    out.push(
      `<line x1="${fmt(hinge.x)}" y1="${fmt(hinge.y)}" x2="${fmt(leafEnd.x)}" y2="${fmt(leafEnd.y)}" stroke="${THEME.doorLeaf}" stroke-width="${fmt(thin * 1.3)}"/>`,
    );
    out.push(
      `<path d="M ${pt(leafEnd)} A ${fmt(dr.width)} ${fmt(dr.width)} 0 0 ${sweep} ${pt(farJamb)}" fill="none" stroke="${THEME.doorLeaf}" stroke-width="${fmt(thin)}" stroke-dasharray="${fmt(thin * 4)} ${fmt(thin * 3)}"/>`,
    );
  }
  for (const wn of plan.windows) {
    const seg = hostSegment(plan, wn.at, wn.wall);
    if (!seg) continue;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2;
    const he = h + wallStroke;
    const hw = wn.width / 2;
    const cover = [
      add(add(wn.at, mul(d, -hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, -he)),
      add(add(wn.at, mul(d, -hw)), mul(n, -he)),
    ];
    out.push(`<polygon points="${cover.map(pt).join(" ")}" fill="${THEME.opening}"/>`);
    const jA = add(wn.at, mul(d, -hw));
    const jB = add(wn.at, mul(d, hw));
    for (const off of [h, -h]) {
      const a = add(jA, mul(n, off));
      const bb = add(jB, mul(n, off));
      out.push(
        `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(bb.x)}" y2="${fmt(bb.y)}" stroke="${THEME.wallStroke}" stroke-width="${fmt(thin)}"/>`,
      );
    }
    out.push(
      `<line x1="${fmt(jA.x)}" y1="${fmt(jA.y)}" x2="${fmt(jB.x)}" y2="${fmt(jB.y)}" stroke="${THEME.windowPane}" stroke-width="${fmt(thin)}"/>`,
    );
  }

  // 5. Room labels + area (on top)
  for (const r of plan.rooms) {
    const cx = r.at.x + r.size.w / 2;
    const cy = r.at.y + r.size.h / 2;
    const areaM2 = ((r.size.w / 1000) * (r.size.h / 1000)).toFixed(1);
    if (r.label) {
      out.push(
        `<text x="${fmt(cx)}" y="${fmt(cy - roomFont * 0.2)}" font-size="${fmt(roomFont)}" fill="${THEME.roomLabel}" text-anchor="middle" dominant-baseline="central" font-weight="600">${xml(r.label)}</text>`,
      );
    }
    out.push(
      `<text x="${fmt(cx)}" y="${fmt(cy + (r.label ? roomFont * 0.9 : 0))}" font-size="${fmt(areaFont)}" fill="${THEME.areaLabel}" text-anchor="middle" dominant-baseline="central">${areaM2} m²</text>`,
    );
  }

  // 6. Dimensions
  for (const dm of plan.dims) {
    const dir = unit(sub(dm.to, dm.from));
    const n = normal(dir);
    const off = mul(n, dm.offset);
    const p1 = add(dm.from, off);
    const p2 = add(dm.to, off);
    const tick = refDim * 0.012;
    // extension lines
    out.push(
      `<line x1="${fmt(dm.from.x)}" y1="${fmt(dm.from.y)}" x2="${fmt(p1.x)}" y2="${fmt(p1.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin * 0.7)}"/>`,
    );
    out.push(
      `<line x1="${fmt(dm.to.x)}" y1="${fmt(dm.to.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin * 0.7)}"/>`,
    );
    // dimension line
    out.push(
      `<line x1="${fmt(p1.x)}" y1="${fmt(p1.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin)}"/>`,
    );
    // ticks (45°)
    for (const p of [p1, p2]) {
      const t1 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), tick));
      const t2 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), -tick));
      out.push(
        `<line x1="${fmt(t1.x)}" y1="${fmt(t1.y)}" x2="${fmt(t2.x)}" y2="${fmt(t2.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin)}"/>`,
      );
    }
    // text
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const tp = add(mid, mul(n, dimFont * 0.7));
    let angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const label = dm.text ?? String(Math.round(length(sub(dm.to, dm.from))));
    out.push(
      `<text x="${fmt(tp.x)}" y="${fmt(tp.y)}" font-size="${fmt(dimFont)}" fill="${THEME.dim}" text-anchor="middle" dominant-baseline="central" transform="rotate(${fmt(angle)} ${fmt(tp.x)} ${fmt(tp.y)})">${xml(label)}</text>`,
    );
  }

  // 7. North arrow (top-right band)
  out.push(northArrow(plan, b, margin, refDim));

  // 8. Scale bar (bottom-left band)
  out.push(scaleBar(b, margin, refDim, thin));

  // 9. Title block (bottom-right band)
  const tb = titleBlock(plan, b, margin, refDim, thin);
  if (tb) out.push(tb);

  out.push("</svg>");
  return out.join("\n");
}

function northArrow(plan: PlanNode, b: ReturnType<typeof planBounds>, margin: number, refDim: number): string {
  const r = refDim * 0.045;
  const cx = b.maxX - r;
  const cy = b.minY - margin * 0.55;
  let deg: number;
  switch (plan.north) {
    case "up": deg = 0; break;
    case "down": deg = 180; break;
    case "left": deg = 270; break;
    case "right": deg = 90; break;
    default: deg = typeof plan.north === "object" ? plan.north.deg : 0;
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

function scaleBar(b: ReturnType<typeof planBounds>, margin: number, refDim: number, thin: number): string {
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

function titleBlock(
  plan: PlanNode,
  b: ReturnType<typeof planBounds>,
  margin: number,
  refDim: number,
  thin: number,
): string | null {
  const t = plan.title;
  if (!t && !plan.scale) return null;
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
  if (plan.scale) lines.push({ k: "SCALE", v: plan.scale });

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
