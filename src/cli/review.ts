/**
 * `arch preview --review` (plan-soundness PS5.4): the review sheet. One picture a reviewer
 * (or an agent's vision) reads in a single look: the plan as `preview` draws it, the access
 * graph laid over it, every element a warning names ringed and numbered, a legend that keys
 * each number to its code and message, and a strip of close-ups of every flagged opening and
 * furniture piece at one fixed scale. Agents look at pictures well when told where to look.
 *
 * A separate code path that CONSUMES `compile()` and `lint()` and feeds neither: the plan
 * drawing is the default `compile()` SVG embedded unchanged, the geometry comes from a second,
 * annotated compile and the resolved plan, and nothing here reaches `describe()`, `lint()` or
 * the default `preview`. It lives in the CLI layer and is pure apart from that (no I/O, no time,
 * no randomness), so the same source always yields the same SVG bytes.
 */

import { compile, describe, describeLevel, lint } from "../index.js";
import type { Diagnostic, Scene, SceneNode, World } from "../index.js";
import { EXTERIOR_NODE, resolvePlan } from "../analyze.js";
import { roomLabelAnchor } from "../elements/room.js";
import type { Point } from "../ast.js";
import type { RDoor, ROpening, RRoom, RWall, RWindow, ResolvedElement } from "../ir.js";
import { distToPolygonEdge, pointInPolygon } from "../geometry/polygon.js";
import { fmt2 } from "../num-format.js";
import { textWidth } from "../text-metrics.js";
import { xmlText } from "../text-safe.js";

/** The sheet's own coordinate width; the root `width` scales it to the requested pixels. */
export const REVIEW_SHEET_UNITS = 1600;
/** Close-ups are drawn at this many sheet units per plan millimetre (1 m = 250 units). */
export const REVIEW_CROP_SCALE = 0.25;
/** A close-up shows at least this much plan around its element, in mm, on each axis. */
export const REVIEW_CROP_MIN_MM = 2400;
/** …and at least this much margin around the element's own extent. */
const CROP_MARGIN_MM = 600;

const PAD = 24;
const TITLE_H = 44;
const LEGEND_FONT = 14;
const LEGEND_LINE = 20;
const TILE_TITLE_H = 26;
const GAP = 24;

const RING = "#d6261c";
const GRAPH = "#1d4ed8";
const ENTRANCE = "#15803d";
const INK = "#1f2933";
const MUTED = "#6b7280";
const PAPER = "#ffffff";

/** The element a mark rings, as `--json` reports it (ids are data here, never in the legend). */
export interface ReviewElement {
  id: string;
  kind: string;
}

/** A box in plan millimetres (origin top-left, +y down, as the drawing). */
export interface ReviewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One numbered warning on the sheet. */
export interface ReviewMark {
  n: number;
  code: string;
  message: string;
  /** Which pass raised it: a `compile()` warning or a default-ruleset `lint()` one. */
  channel: "compile" | "lint";
  /** The element its span resolves to; `null` when it names none drawn on this storey. */
  element: ReviewElement | null;
  /** The ring's extent in plan mm; absent when the mark is legend-only. */
  ring?: ReviewBox;
}

/** One close-up of a flagged opening or furniture piece. */
export interface ReviewCrop {
  /** The marks on this element, ascending: the tile's title. */
  n: number[];
  element: ReviewElement;
  /** The plan window the tile shows, in plan mm. */
  box: ReviewBox;
}

export interface ReviewSheet {
  svg: string;
  marks: ReviewMark[];
  crops: ReviewCrop[];
  /** The storey drawn (multi-storey plans only). */
  level?: number;
}

export interface ReviewOptions {
  world?: World;
  /** The storey to draw; default the lowest (as `preview`). */
  level?: number;
  /** The root `width` in pixels; default {@link REVIEW_SHEET_UNITS}. */
  width?: number;
}

/** What {@link buildReviewSheet} returns when it cannot draw a sheet. */
export type ReviewFailure = { kind: "errors"; diagnostics: Diagnostic[] } | { kind: "badLevel"; levels: number[] };

const fmt = fmt2;
const num = (n: number): number => Number(fmt2(n));
const box = (b: ReviewBox): ReviewBox => ({ x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) });

/** The ring geometry of one element. */
type Ring =
  | { t: "outline"; pts: Point[]; closed: boolean; widthMm: number; anchor: Point; ext: ReviewBox }
  | { t: "circle"; c: Point; r: number; anchor: Point; ext: ReviewBox }
  | { t: "rect"; ext: ReviewBox; anchor: Point };

/** Every point a scene primitive draws through (arcs and circles by their extreme points). */
function primPoints(n: SceneNode): Point[] {
  const p = n.prim;
  switch (p.t) {
    case "polygon":
      return p.pts;
    case "line":
      return [p.a, p.b];
    case "region":
      return p.loops.flat();
    case "path":
      return p.loops.flatMap((l) => [l.start, ...l.edges.map((e) => e.to)]);
    case "arc":
    case "circle":
      return [
        { x: p.center.x - p.r, y: p.center.y - p.r },
        { x: p.center.x + p.r, y: p.center.y + p.r },
      ];
    case "hatch":
      return p.region.flat();
    case "text":
      return [];
  }
}

function extentOf(pts: readonly Point[]): ReviewBox | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const grow = (b: ReviewBox, d: number): ReviewBox => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });

/** A room's floor ring, from its shape: the polygon, the circle, else its rectangle. */
function roomRing(r: RRoom): Point[] {
  if (r.poly) return r.poly;
  return [
    { x: r.at.x, y: r.at.y },
    { x: r.at.x + r.size.w, y: r.at.y },
    { x: r.at.x + r.size.w, y: r.at.y + r.size.h },
    { x: r.at.x, y: r.at.y + r.size.h },
  ];
}

/**
 * The element a diagnostic names: the one whose statement contains its span, the narrowest
 * (the rule `impact` keys diagnostics by). Several elements share one span when a component
 * is placed more than once; then the one whose id a hint quotes wins, else the first.
 */
function elementOf(d: Diagnostic, elements: readonly ResolvedElement[]): ResolvedElement | undefined {
  const s = d.span;
  if (!s || d.file !== undefined) return undefined;
  let best: ResolvedElement[] = [];
  let bestLen = Infinity;
  for (const e of elements) {
    const es = e.span;
    if (!es || e._file !== undefined || es.start > s.start || es.end < s.end) continue;
    const len = es.end - es.start;
    if (len < bestLen) {
      best = [e];
      bestLen = len;
    } else if (len === bestLen) best.push(e);
  }
  if (best.length <= 1) return best[0];
  const hints = (d.hints ?? []).join("\n");
  const named = best.find((e) => hints.includes(`"${e.id}"`));
  if (named) return named;
  // A hint that quotes a door or opening (the bottleneck of a walk, say) places the
  // diagnostic: the tied room whose floor that connector stands on (nearest its outline) wins.
  const at = elements.find(
    (e): e is RDoor | ROpening | RWindow =>
      (e.kind === "door" || e.kind === "opening" || e.kind === "window") && hints.includes(`"${e.id}"`),
  )?.at;
  if (at) {
    let near: RRoom | undefined;
    let nearD = Infinity;
    for (const e of best) {
      if (e.kind !== "room") continue;
      const ring = roomRing(e as RRoom);
      const dist = pointInPolygon(at.x, at.y, ring) ? 0 : distToPolygonEdge(at, ring);
      if (dist < nearD) {
        near = e as RRoom;
        nearD = dist;
      }
    }
    if (near) return near;
  }
  return best[0];
}

/**
 * Ring geometry for an element, from its shape (rooms, walls, openings) or its drawn nodes.
 * `roomFont` lifts a room's tag clear of its drawn name (the tag sits above the label point). */
function ringOf(e: ResolvedElement, drawn: ReadonlyMap<string, Point[]>, padMm: number, roomFont: number): Ring | null {
  if (e.kind === "room") {
    const r = e as RRoom;
    const pts = r.circle
      ? Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * 2 * Math.PI;
          return { x: r.circle!.c.x + r.circle!.r * Math.cos(a), y: r.circle!.c.y + r.circle!.r * Math.sin(a) };
        })
      : roomRing(r);
    const label = roomLabelAnchor(r);
    const lifted = { x: label.x, y: label.y - roomFont * 1.8 };
    return { t: "outline", pts, closed: true, widthMm: padMm * 0.6, anchor: lifted, ext: extentOf(pts)! };
  }
  if (e.kind === "wall") {
    const w = e as RWall;
    const ext = extentOf(w.points);
    if (!ext) return null;
    return {
      t: "outline",
      pts: w.points,
      closed: w.closed,
      widthMm: w.thickness + padMm,
      anchor: w.points[0]!,
      ext: grow(ext, w.thickness / 2),
    };
  }
  if (e.kind === "door" || e.kind === "window" || e.kind === "opening") {
    const o = e as RDoor | ROpening;
    const r = o.width / 2 + padMm;
    return {
      t: "circle",
      c: o.at,
      r,
      anchor: { x: o.at.x + r * 0.71, y: o.at.y - r * 0.71 },
      ext: grow({ x: o.at.x, y: o.at.y, w: 0, h: 0 }, r),
    };
  }
  const pts = drawn.get(e.id);
  const ext = pts ? extentOf(pts) : null;
  if (!ext) return null;
  const g = grow(ext, padMm);
  return { t: "rect", ext: g, anchor: { x: g.x + g.w, y: g.y } };
}

/** Kinds whose marks get a close-up: the openings and the furniture pieces. */
const CROPPED = new Set(["door", "window", "opening", "furniture"]);

/** Wrap `text` into lines no wider than `maxW` at `size`, breaking at spaces. */
function wrap(text: string, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur === "" ? w : `${cur} ${w}`;
    if (cur !== "" && textWidth(next, size) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur !== "") lines.push(cur);
  return lines.length > 0 ? lines : [""];
}

/** The SVG root's attributes and its inner markup, so the drawing can be embedded unchanged. */
function splitSvg(svg: string): { viewBox: [number, number, number, number]; font: string; inner: string } {
  const open = svg.indexOf(">");
  const root = svg.slice(0, open);
  const vb = /viewBox="([^"]+)"/.exec(root)![1]!.split(/\s+/).map(Number) as [number, number, number, number];
  const font = /font-family="([^"]*)"/.exec(root)?.[1] ?? "";
  const close = svg.lastIndexOf("</svg>");
  return { viewBox: vb, font, inner: svg.slice(open + 1, close) };
}

/** A numbered badge: a filled disc with the number, centred on `c`, radius `r` (same units). */
function badge(c: Point, r: number, label: string): string {
  return (
    `<circle cx="${fmt(c.x)}" cy="${fmt(c.y)}" r="${fmt(r)}" fill="${RING}"/>` +
    `<text x="${fmt(c.x)}" y="${fmt(c.y)}" font-size="${fmt(r * 1.25)}" font-weight="700" fill="${PAPER}" text-anchor="middle" dominant-baseline="central">${xmlText(label)}</text>`
  );
}

/** The ring itself, in plan mm, with strokes sized so they read `px` units wide at scale `k`. */
function ringSvg(ring: Ring, k: number): string {
  const sw = fmt(3 / k);
  if (ring.t === "circle")
    return `<circle cx="${fmt(ring.c.x)}" cy="${fmt(ring.c.y)}" r="${fmt(ring.r)}" fill="none" stroke="${RING}" stroke-width="${sw}"/>`;
  if (ring.t === "rect") {
    const b = ring.ext;
    return `<rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(b.w)}" height="${fmt(b.h)}" rx="${fmt(6 / k)}" fill="none" stroke="${RING}" stroke-width="${sw}"/>`;
  }
  const d = ring.pts.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join("") + (ring.closed ? "Z" : "");
  // A room or wall: its own outline, drawn as a broad translucent band over a thin line.
  return (
    `<path d="${d}" fill="none" stroke="${RING}" stroke-opacity="0.28" stroke-width="${fmt(Math.max(ring.widthMm, 10 / k))}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${RING}" stroke-width="${sw}" stroke-dasharray="${fmt(10 / k)} ${fmt(6 / k)}"/>`
  );
}

/** The tag beside a ring: one badge per mark, then the codes (without the `W_` prefix). */
function tagSvg(at: Point, marks: readonly ReviewMark[], k: number): string {
  const r = 11 / k;
  const font = 12 / k;
  const out: string[] = [];
  marks.forEach((m, i) => {
    const c = { x: at.x + r, y: at.y - r + i * 2.3 * r };
    out.push(badge(c, r, String(m.n)));
    const code = m.code.replace(/^W_/, "");
    out.push(
      `<text x="${fmt(c.x + r * 1.35)}" y="${fmt(c.y)}" font-size="${fmt(font)}" font-weight="700" fill="${RING}" stroke="${PAPER}" stroke-width="${fmt(3 / k)}" paint-order="stroke" dominant-baseline="central">${xmlText(code)}</text>`,
    );
  });
  return out.join("");
}

/**
 * Build the review sheet for one storey, or say why there is none (compile errors; a
 * `level` the plan does not declare). Deterministic: the same source, level and width give
 * the same SVG bytes.
 */
export function buildReviewSheet(source: string, opts: ReviewOptions = {}): ReviewSheet | ReviewFailure {
  const world = opts.world;
  // The drawing exactly as `preview`/`compile` draws it — embedded, never re-rendered.
  const plain = compile(source, { noCache: true, ...(world ? { world } : {}) });
  if (plain.diagnostics.some((d) => d.severity === "error") || !plain.scene)
    return { kind: "errors", diagnostics: plain.diagnostics };
  const levels = plain.pages?.map((p) => p.level) ?? [];
  let pageIndex = -1;
  if (levels.length > 0) {
    pageIndex = opts.level === undefined ? 0 : levels.indexOf(opts.level);
    if (pageIndex < 0) return { kind: "badLevel", levels };
  } else if (opts.level !== undefined) return { kind: "badLevel", levels };
  const level = pageIndex >= 0 ? levels[pageIndex] : undefined;
  const planSvg = pageIndex >= 0 ? plain.pages![pageIndex]!.svg : plain.svg;
  const levelName = pageIndex >= 0 ? plain.pages![pageIndex]!.name : undefined;

  // Geometry: the annotated scene (what each element drew) and the resolved storey.
  const annotated = compile(source, { noCache: true, annotate: true, ...(world ? { world } : {}) });
  const scene: Scene = pageIndex >= 0 ? annotated.pages![pageIndex]!.scene : annotated.scene!;
  const drawn = new Map<string, Point[]>();
  for (const n of scene.nodes) {
    if (n.elementId === undefined) continue;
    const list = drawn.get(n.elementId);
    const pts = primPoints(n);
    if (list) for (const p of pts) list.push(p);
    else drawn.set(n.elementId, [...pts]);
  }
  const resolved = resolvePlan(source, world ? { world } : {});
  const ir = pageIndex >= 0 ? resolved.levels[pageIndex]!.ir : resolved.ir!;
  const elements = ir.elements;

  // The warnings: compile's and the default ruleset's, this storey's, each once, in source order.
  const onStorey = (d: Diagnostic): boolean => level === undefined || d.level === undefined || d.level === level;
  const seen = new Set<string>();
  const raw: Array<{ d: Diagnostic; channel: ReviewMark["channel"] }> = [];
  const take = (d: Diagnostic, channel: ReviewMark["channel"]): void => {
    if (d.severity !== "warning" || !onStorey(d)) return;
    // The hints are part of the key: two instances of one component raise the same
    // message from one span, and only their hints tell the two elements apart.
    const key = `${d.code ?? ""}\u0000${d.message}\u0000${(d.hints ?? []).join("\u0001")}\u0000${d.span?.start ?? ""}:${d.span?.end ?? ""}\u0000${d.level ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    raw.push({ d, channel });
  };
  for (const d of plain.diagnostics) take(d, "compile");
  for (const d of lint(source, world ? { world } : {})) take(d, "lint");
  const order = raw.map((x, i) => ({ ...x, i }));
  order.sort((a, b) => {
    const sa = a.d.span?.start ?? Number.MAX_SAFE_INTEGER;
    const sb = b.d.span?.start ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    const ca = a.d.code ?? "";
    const cb = b.d.code ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.i - b.i;
  });

  const { viewBox, font, inner } = splitSvg(planSvg);
  const [vbX, vbY, vbW, vbH] = viewBox;
  const padMm = Math.max(vbW, vbH) / 120;

  const marks: ReviewMark[] = [];
  const rings = new Map<string, { ring: Ring; element: ResolvedElement; marks: ReviewMark[] }>();
  order.forEach(({ d, channel }, i) => {
    const e = elementOf(d, elements);
    const ring = e ? ringOf(e, drawn, padMm, scene.sizes.roomFont) : null;
    const mark: ReviewMark = {
      n: i + 1,
      code: d.code ?? "",
      message: d.message,
      channel,
      element: e && ring ? { id: e.id, kind: e.kind } : null,
      ...(e && ring ? { ring: box(ring.ext) } : {}),
    };
    marks.push(mark);
    if (e && ring) {
      const held = rings.get(e.id);
      if (held) held.marks.push(mark);
      else rings.set(e.id, { ring, element: e, marks: [mark] });
    }
  });

  // --- layout, in sheet units -------------------------------------------------------------
  const W = REVIEW_SHEET_UNITS;
  const innerW = W - 2 * PAD;
  let panelW = innerW;
  let panelH = (panelW * vbH) / vbW;
  if (panelH > innerW) {
    panelH = innerW;
    panelW = (panelH * vbW) / vbH;
  }
  const panelX = PAD + (innerW - panelW) / 2;
  const panelY = TITLE_H;
  const k = panelW / vbW;

  const out: string[] = [];
  let y = panelY + panelH + GAP;

  // The access graph exactly as `describe().access` reports it for this storey: rooms as
  // nodes at their label points, one edge per connector drawn through the connector itself.
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");
  const doors = elements.filter((e): e is RDoor => e.kind === "door");
  const openings = elements.filter((e): e is ROpening => e.kind === "opening");
  const summary = describe(source, world ? { world } : {});
  const access = (level !== undefined ? describeLevel(summary, level) : summary).access;
  const nodeAt = new Map<string, Point>(rooms.map((r) => [r.id, roomLabelAnchor(r)]));
  const connAt = new Map<string, Point>([...doors, ...openings].map((c) => [c.id, c.at]));
  const reachable = new Map(access.rooms.map((r) => [r.id, r.reachable]));
  const graph: string[] = [];
  const gw = fmt(2 / k);
  for (const edge of access.edges) {
    const at = connAt.get(edge.doorId);
    if (!at) continue;
    const ends = edge.between.map((id) => (id === EXTERIOR_NODE ? undefined : nodeAt.get(id)));
    const dash = edge.ambiguous ? ` stroke-dasharray="${fmt(6 / k)} ${fmt(5 / k)}"` : "";
    const colour = edge.ambiguous ? MUTED : GRAPH;
    for (const end of ends) {
      if (!end) continue;
      graph.push(
        `<line x1="${fmt(end.x)}" y1="${fmt(end.y)}" x2="${fmt(at.x)}" y2="${fmt(at.y)}" stroke="${colour}" stroke-opacity="0.75" stroke-width="${gw}"${dash}/>`,
      );
    }
    const s = 4 / k;
    graph.push(
      `<rect x="${fmt(at.x - s)}" y="${fmt(at.y - s)}" width="${fmt(2 * s)}" height="${fmt(2 * s)}" fill="${colour}"/>`,
    );
  }
  for (const id of access.entrances) {
    const at = connAt.get(id);
    if (!at) continue;
    const s = 9 / k;
    graph.push(
      `<polygon points="${fmt(at.x)},${fmt(at.y - s)} ${fmt(at.x + s)},${fmt(at.y)} ${fmt(at.x)},${fmt(at.y + s)} ${fmt(at.x - s)},${fmt(at.y)}" fill="${ENTRANCE}"/>`,
      `<text x="${fmt(at.x + s * 1.3)}" y="${fmt(at.y + s * 1.9)}" font-size="${fmt(11 / k)}" font-weight="700" fill="${ENTRANCE}" stroke="${PAPER}" stroke-width="${fmt(3 / k)}" paint-order="stroke">ENTRANCE</text>`,
    );
  }
  for (const r of rooms) {
    const p = nodeAt.get(r.id)!;
    const ok = reachable.get(r.id) !== false;
    graph.push(
      `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(6 / k)}" fill="${ok ? GRAPH : PAPER}" fill-opacity="${ok ? "0.85" : "1"}" stroke="${ok ? PAPER : GRAPH}" stroke-width="${fmt(2 / k)}"/>`,
    );
  }

  // Rings and their tags on the main plan.
  const ringMarks: string[] = [];
  for (const { ring, marks: ms } of rings.values()) ringMarks.push(ringSvg(ring, k), tagSvg(ring.anchor, ms, k));

  // Legend.
  const legend: string[] = [];
  const flagged = marks.length;
  legend.push(
    `<text x="${PAD}" y="${fmt(y)}" font-size="16" font-weight="700" fill="${INK}" dominant-baseline="hanging">${flagged === 0 ? "No warnings: nothing is ringed." : `Flagged (${flagged})`}</text>`,
  );
  y += 28;
  // The key to the graph, once: what the blue marks are.
  const ky = y + 9;
  legend.push(
    `<circle cx="${PAD + 11}" cy="${ky}" r="6" fill="${GRAPH}" fill-opacity="0.85"/>`,
    `<circle cx="${PAD + 31}" cy="${ky}" r="5" fill="${PAPER}" stroke="${GRAPH}" stroke-width="2"/>`,
    `<rect x="${PAD + 45}" y="${ky - 4}" width="8" height="8" fill="${GRAPH}"/>`,
    `<polygon points="${PAD + 69},${ky - 8} ${PAD + 77},${ky} ${PAD + 69},${ky + 8} ${PAD + 61},${ky}" fill="${ENTRANCE}"/>`,
    `<text x="${PAD + 88}" y="${ky}" font-size="${LEGEND_FONT}" fill="${MUTED}" dominant-baseline="central">access graph (describe().access): a room, filled when reachable from an entrance on this storey; a door or opening; an entrance. Red: a ringed element and its numbered warnings.</text>`,
  );
  y += LEGEND_LINE + 8;
  const textX = PAD + 34;
  const textW = innerW - 34;
  for (const m of marks) {
    legend.push(badge({ x: PAD + 11, y: y + 9 }, 11, String(m.n)));
    // A warning that names nothing drawn on this storey is listed, never ringed.
    const where =
      m.element === null ? `<tspan dx="8" font-weight="400" fill="${MUTED}">(not on the drawing)</tspan>` : "";
    legend.push(
      `<text x="${textX}" y="${fmt(y + 9)}" font-size="${LEGEND_FONT}" font-weight="700" fill="${INK}" dominant-baseline="central">${xmlText(m.code)}${where}</text>`,
    );
    y += LEGEND_LINE;
    for (const line of wrap(m.message, LEGEND_FONT, textW)) {
      legend.push(
        `<text x="${textX}" y="${fmt(y + 9)}" font-size="${LEGEND_FONT}" fill="${INK}" dominant-baseline="central">${xmlText(line)}</text>`,
      );
      y += LEGEND_LINE;
    }
    y += 6;
  }

  // Close-ups: one tile per flagged opening or furniture piece, in mark order, at one scale.
  const crops: ReviewCrop[] = [];
  const tiles: string[] = [];
  const cropped = [...rings.values()].filter((r) => CROPPED.has(r.element.kind));
  if (cropped.length > 0) {
    y += GAP - 6;
    tiles.push(
      `<text x="${PAD}" y="${fmt(y)}" font-size="16" font-weight="700" fill="${INK}" dominant-baseline="hanging">Close-ups (1 m = ${fmt(REVIEW_CROP_SCALE * 1000)} units, every tile)</text>`,
    );
    y += 28;
    const maxMm = innerW / REVIEW_CROP_SCALE;
    let x = PAD;
    let rowH = 0;
    for (const { ring, element, marks: ms } of cropped) {
      const e = ring.ext;
      const wMm = Math.min(maxMm, Math.max(REVIEW_CROP_MIN_MM, e.w + 2 * CROP_MARGIN_MM));
      const hMm = Math.min(maxMm, Math.max(REVIEW_CROP_MIN_MM, e.h + 2 * CROP_MARGIN_MM));
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const win: ReviewBox = { x: cx - wMm / 2, y: cy - hMm / 2, w: wMm, h: hMm };
      const tw = wMm * REVIEW_CROP_SCALE;
      const th = hMm * REVIEW_CROP_SCALE;
      if (x > PAD && x + tw > PAD + innerW) {
        x = PAD;
        y += rowH + GAP;
        rowH = 0;
      }
      const ns = ms.map((m) => m.n);
      crops.push({ n: ns, element: { id: element.id, kind: element.kind }, box: box(win) });
      const title = ms.map((m) => `#${m.n} ${m.code}`).join("  ");
      tiles.push(
        `<text x="${fmt(x)}" y="${fmt(y + TILE_TITLE_H / 2)}" font-size="${LEGEND_FONT}" font-weight="700" fill="${RING}" dominant-baseline="central">${xmlText(title)}</text>`,
        `<svg x="${fmt(x)}" y="${fmt(y + TILE_TITLE_H)}" width="${fmt(tw)}" height="${fmt(th)}" viewBox="${fmt(win.x)} ${fmt(win.y)} ${fmt(win.w)} ${fmt(win.h)}">`,
        `<rect x="${fmt(win.x)}" y="${fmt(win.y)}" width="${fmt(win.w)}" height="${fmt(win.h)}" fill="${PAPER}"/>`,
        `<use href="#rv-plan"/>`,
        ringSvg(ring, REVIEW_CROP_SCALE),
        `</svg>`,
        `<rect x="${fmt(x)}" y="${fmt(y + TILE_TITLE_H)}" width="${fmt(tw)}" height="${fmt(th)}" fill="none" stroke="${MUTED}" stroke-width="1"/>`,
      );
      x += tw + GAP;
      rowH = Math.max(rowH, TILE_TITLE_H + th);
    }
    y += rowH;
  }
  const H = y + PAD;

  const name = scene.name;
  const storey = level !== undefined ? ` · level ${level}${levelName ? ` (${levelName})` : ""}` : "";
  const heading = `Review sheet · ${name}${storey} · ${flagged} flagged, ${crops.length} close-up${crops.length === 1 ? "" : "s"}`;
  const widthPx = opts.width !== undefined && opts.width > 0 ? opts.width : W;

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${fmt(widthPx)}" height="${fmt((widthPx * H) / W)}" viewBox="0 0 ${W} ${fmt(H)}" font-family="${font}">`,
    `<rect x="0" y="0" width="${W}" height="${fmt(H)}" fill="${PAPER}"/>`,
    `<text x="${PAD}" y="${TITLE_H / 2}" font-size="18" font-weight="700" fill="${INK}" dominant-baseline="central">${xmlText(heading)}</text>`,
    `<svg x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}">`,
    `<g id="rv-plan" font-family="${font}">`,
    inner,
    `</g>`,
    `<g id="rv-access-graph">${graph.join("")}</g>`,
    `<g id="rv-rings">${ringMarks.join("")}</g>`,
    `</svg>`,
    `<rect x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" fill="none" stroke="${MUTED}" stroke-width="1"/>`,
    `<g id="rv-legend">${legend.join("")}</g>`,
    `<g id="rv-close-ups">${tiles.join("")}</g>`,
    `</svg>`,
  );
  return { svg: out.join("\n"), marks, crops, ...(level !== undefined ? { level } : {}) };
}
