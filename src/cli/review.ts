/**
 * `arch preview --review` (plan-soundness PS5.4): the review sheet. One picture a reviewer
 * (or an agent's vision) reads in a single look: the plan as `preview` draws it, the access
 * graph laid over it, every element a warning names ringed and numbered, a legend that keys
 * each number to its code and message, and a strip of close-ups of the flagged openings and
 * furniture pieces at one fixed scale. Agents look at pictures well when told where to look.
 *
 * A separate code path that CONSUMES `compile()`, `describe()` and `lint()` and feeds none of
 * them: the plan drawing is the default `compile()` SVG embedded unchanged, the geometry comes
 * from a second, annotated compile and the resolved plan, and nothing here reaches the default
 * `preview`. It lives in the CLI layer and is pure apart from that (no I/O, no time, no
 * randomness), so the same source always yields the same SVG bytes.
 *
 * One mark per diagnostic, never merged: two warnings from one statement (a `for` body, a
 * component placed twice) are two marks. A diagnostic keys to an element only by its span, so
 * when several elements share the span and nothing in the diagnostic says which one it means,
 * the sheet rings none of them and says so in the legend (exact attribution waits on
 * diagnostics carrying an element id, card PS4.6).
 */

import { compile, describe, describeLevel, diagnosticToJson, lint } from "../index.js";
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
/** At most this many close-ups are drawn, the first in mark order; `--json` lists the rest. */
export const REVIEW_MAX_CROPS = 24;
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

/** A ringed element, as `--json` reports it (ids are data here, never in the legend). */
export interface ReviewRinged {
  id: string;
  kind: string;
  /** The ring's extent in plan mm (the drawn ring's outer edge). */
  box: ReviewBox;
}

/** A box in plan millimetres (origin top-left, +y down, as the drawing). */
export interface ReviewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Why a mark rings nothing; the legend prints `text`. */
export interface ReviewUnringed {
  reason: "whole-plan" | "imported" | "no-element" | "repeated" | "not-drawn";
  /** With `repeated`: how many elements share the statement. */
  copies?: number;
}

/** One numbered warning on the sheet: exactly one per diagnostic. */
export interface ReviewMark {
  n: number;
  code: string;
  message: string;
  /** Which pass raised it: a `compile()` warning or a default-ruleset `lint()` one. */
  channel: "compile" | "lint";
  span?: [number, number];
  line?: number;
  col?: number;
  file?: string;
  /** What it rings: usually one element, two for a room overlap; empty when legend-only. */
  ringed: ReviewRinged[];
  /** Present when `ringed` is empty, or (a room overlap) when a named room could not be ringed. */
  unringed?: ReviewUnringed;
}

/** One close-up of a flagged opening or furniture piece. */
export interface ReviewCrop {
  /** The marks on this element, ascending: the tile's title. */
  n: number[];
  element: { id: string; kind: string };
  /** The plan window the tile shows, in plan mm. */
  box: ReviewBox;
}

export interface ReviewSheet {
  svg: string;
  marks: ReviewMark[];
  crops: ReviewCrop[];
  /** Marks whose element would have had a close-up past {@link REVIEW_MAX_CROPS}, ascending. */
  cropsOmitted: number[];
  /** `compile()`'s own diagnostics (all storeys), which plain `preview` reports. */
  diagnostics: Diagnostic[];
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

/** The ring geometry of one element; `ext` is the drawn ring's outer box. */
type Ring =
  | { t: "outline"; pts: Point[]; closed: boolean; widthMm: number; ext: ReviewBox }
  | { t: "circle"; c: Point; r: number; ext: ReviewBox }
  | { t: "rect"; ext: ReviewBox };

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

const overlaps = (a: ReviewBox, b: ReviewBox): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A room's floor ring, from its shape: the polygon, else its rectangle. */
function roomRing(r: RRoom): Point[] {
  if (r.poly) return r.poly;
  return [
    { x: r.at.x, y: r.at.y },
    { x: r.at.x + r.size.w, y: r.at.y },
    { x: r.at.x + r.size.w, y: r.at.y + r.size.h },
    { x: r.at.x, y: r.at.y + r.size.h },
  ];
}

/** What a diagnostic's span resolves to on this storey. */
type Attribution = { element: ResolvedElement } | { unringed: ReviewUnringed };

/**
 * The element a diagnostic names: the one whose statement contains its span, the narrowest
 * (the rule `impact` keys diagnostics by), in the file the span is measured in. Several
 * elements share one span when a statement is repeated (a `for` body, a component placed more
 * than once); then the one whose id a hint quotes wins, else the tied room nearest a door or
 * opening a hint quotes. Otherwise the diagnostic does not say which copy it means, and it is
 * attributed to none of them.
 */
function attribute(d: Diagnostic, elements: readonly ResolvedElement[]): Attribution {
  const s = d.span;
  if (!s) return { unringed: { reason: "whole-plan" } };
  let best: ResolvedElement[] = [];
  let bestLen = Infinity;
  for (const e of elements) {
    const es = e.span;
    if (!es || e._file !== d.file || es.start > s.start || es.end < s.end) continue;
    const len = es.end - es.start;
    if (len < bestLen) {
      best = [e];
      bestLen = len;
    } else if (len === bestLen) best.push(e);
  }
  if (best.length === 0) return { unringed: { reason: d.file !== undefined ? "imported" : "no-element" } };
  if (best.length === 1) return { element: best[0]! };
  const hints = (d.hints ?? []).join("\n");
  const named = best.filter((e) => hints.includes(`"${e.id}"`));
  if (named.length === 1) return { element: named[0]! };
  // A hint that quotes a door or opening (the bottleneck of a walk, say) places the
  // diagnostic: the one tied room whose floor that connector stands on (nearest its outline).
  const quoted = elements.filter(
    (e): e is RDoor | ROpening | RWindow =>
      (e.kind === "door" || e.kind === "opening" || e.kind === "window") && hints.includes(`"${e.id}"`),
  );
  if (quoted.length === 1 && best.every((e) => e.kind === "room")) {
    const at = quoted[0]!.at;
    let near: RRoom | undefined;
    let nearD = Infinity;
    let tie = false;
    for (const e of best) {
      const ring = roomRing(e as RRoom);
      const dist = pointInPolygon(at.x, at.y, ring) ? 0 : distToPolygonEdge(at, ring);
      if (dist < nearD) {
        near = e as RRoom;
        nearD = dist;
        tie = false;
      } else if (dist === nearD) tie = true;
    }
    if (near && !tie) return { element: near };
  }
  return { unringed: { reason: "repeated", copies: best.length } };
}

/** Ring geometry for an element, from its shape (rooms, walls, openings) or its drawn nodes. */
function ringOf(e: ResolvedElement, drawn: ReadonlyMap<string, Point[]>, padMm: number): Ring | null {
  if (e.kind === "room") {
    const r = e as RRoom;
    const pts = r.circle
      ? Array.from({ length: 48 }, (_, i) => {
          const a = (i / 48) * 2 * Math.PI;
          return { x: r.circle!.c.x + r.circle!.r * Math.cos(a), y: r.circle!.c.y + r.circle!.r * Math.sin(a) };
        })
      : roomRing(r);
    const widthMm = padMm * 0.6;
    return { t: "outline", pts, closed: true, widthMm, ext: grow(extentOf(pts)!, widthMm / 2) };
  }
  if (e.kind === "wall") {
    const w = e as RWall;
    const ext = extentOf(w.points);
    if (!ext) return null;
    // The band is the wall's thickness plus a pad each side; the box is the band's outer edge.
    return {
      t: "outline",
      pts: w.points,
      closed: w.closed,
      widthMm: w.thickness + 2 * padMm,
      ext: grow(ext, w.thickness / 2 + padMm),
    };
  }
  if (e.kind === "door" || e.kind === "window" || e.kind === "opening") {
    const o = e as RDoor | ROpening;
    const r = o.width / 2 + padMm;
    return { t: "circle", c: o.at, r, ext: grow({ x: o.at.x, y: o.at.y, w: 0, h: 0 }, r) };
  }
  const pts = drawn.get(e.id);
  const ext = pts ? extentOf(pts) : null;
  if (!ext) return null;
  return { t: "rect", ext: grow(ext, padMm) };
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

/** Size of a tag (one badge + code line per mark) at scale `k`, in plan mm. */
function tagSize(marks: readonly ReviewMark[], k: number): { w: number; h: number } {
  const r = 11 / k;
  const font = 12 / k;
  const text = Math.max(...marks.map((m) => textWidth(m.code.replace(/^W_/, ""), font)));
  return { w: 2 * r + r * 0.35 + text + 4 / k, h: marks.length * 2.3 * r };
}

/** The tag: one badge per mark, then the code (without `W_`) on a paper backing, from top-left `at`. */
function tagSvg(at: Point, marks: readonly ReviewMark[], k: number): string {
  const r = 11 / k;
  const font = 12 / k;
  const out: string[] = [];
  marks.forEach((m, i) => {
    const c = { x: at.x + r, y: at.y + r + i * 2.3 * r };
    const code = m.code.replace(/^W_/, "");
    const tx = c.x + r * 1.35;
    const tw = textWidth(code, font);
    out.push(
      `<rect x="${fmt(tx - 2 / k)}" y="${fmt(c.y - font * 0.7)}" width="${fmt(tw + 4 / k)}" height="${fmt(font * 1.4)}" fill="${PAPER}" fill-opacity="0.9"/>`,
      badge(c, r, String(m.n)),
      `<text x="${fmt(tx)}" y="${fmt(c.y)}" font-size="${fmt(font)}" font-weight="700" fill="${RING}" dominant-baseline="central">${xmlText(code)}</text>`,
    );
  });
  return out.join("");
}

/** The legend's note for a mark that rings nothing (or not everything it names). */
function unringedText(u: ReviewUnringed, partial: boolean): string {
  switch (u.reason) {
    case "whole-plan":
      return "(the whole plan; nothing to ring)";
    case "imported":
      return "(in an imported file; not placed on this storey)";
    case "no-element":
      return "(names no drawn element)";
    case "not-drawn":
      return partial ? "(the other room is not named by a unique label; not ringed)" : "(not drawn on this storey)";
    case "repeated":
      return `(in a repeated statement, ${u.copies} copies; the warning does not say which${partial ? ", so that room is not ringed" : ""})`;
  }
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
  const rooms = elements.filter((e): e is RRoom => e.kind === "room");

  // The warnings: compile's and the default ruleset's, this storey's, ONE MARK EACH, in
  // source order of the span (none last), then code, then the order they were raised in.
  const onStorey = (d: Diagnostic): boolean => level === undefined || d.level === undefined || d.level === level;
  const raw: Array<{ d: Diagnostic; channel: ReviewMark["channel"] }> = [];
  for (const d of plain.diagnostics) if (d.severity === "warning" && onStorey(d)) raw.push({ d, channel: "compile" });
  for (const d of lint(source, world ? { world } : {}))
    if (d.severity === "warning" && onStorey(d)) raw.push({ d, channel: "lint" });
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
  const ringFor = (e: ResolvedElement, mark: ReviewMark): boolean => {
    const held = rings.get(e.id);
    if (held) {
      if (!held.marks.includes(mark)) held.marks.push(mark);
      mark.ringed.push({ id: e.id, kind: e.kind, box: box(held.ring.ext) });
      return true;
    }
    const ring = ringOf(e, drawn, padMm);
    if (!ring) return false;
    rings.set(e.id, { ring, element: e, marks: [mark] });
    mark.ringed.push({ id: e.id, kind: e.kind, box: box(ring.ext) });
    return true;
  };
  order.forEach(({ d, channel }, i) => {
    const j = diagnosticToJson(source, d);
    const mark: ReviewMark = {
      n: i + 1,
      code: d.code ?? "",
      message: d.message,
      channel,
      ...(j.span ? { span: j.span } : {}),
      ...(j.line !== undefined ? { line: j.line, col: j.col } : {}),
      ...(d.file !== undefined ? { file: d.file } : {}),
      ringed: [],
    };
    marks.push(mark);
    const a = attribute(d, elements);
    if ("element" in a) {
      if (!ringFor(a.element, mark)) mark.unringed = { reason: "not-drawn" };
    } else mark.unringed = a.unringed;
    // A room overlap names TWO rooms and its span holds one: ring the other too when its
    // label names exactly one room on this storey; otherwise say it is not ringed.
    if (d.code === "W_ROOM_OVERLAP") {
      const m = /^Rooms "(.*)" and "(.*)" overlap$/.exec(d.message);
      const held = "element" in a ? a.element.id : undefined;
      for (const name of m ? [m[1]!, m[2]!] : []) {
        const named = rooms.filter((r) => r.label === name);
        if (named.length === 1) {
          if (named[0]!.id !== held) ringFor(named[0]!, mark);
        } else if (!named.some((r) => r.id === held) && mark.unringed === undefined)
          mark.unringed = named.length > 1 ? { reason: "repeated", copies: named.length } : { reason: "not-drawn" };
      }
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
  // nodes at their label points (small hollow rings with a paper halo, so the name stays
  // legible), one edge per connector drawn through the connector itself.
  const doors = elements.filter((e): e is RDoor => e.kind === "door");
  const openings = elements.filter((e): e is ROpening => e.kind === "opening");
  const summary = describe(source, world ? { world } : {});
  const access = (level !== undefined ? describeLevel(summary, level) : summary).access;
  const nodeAt = new Map<string, Point>(rooms.map((r) => [r.id, roomLabelAnchor(r)]));
  const connAt = new Map<string, Point>([...doors, ...openings].map((c) => [c.id, c.at]));
  const reachable = new Map(access.rooms.map((r) => [r.id, r.reachable]));
  const graph: string[] = [];
  const captions: string[] = [];
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
  const main = access.mainEntrance;
  for (const id of access.entrances) {
    const at = connAt.get(id);
    if (!at) continue;
    const s = 9 / k;
    // Which entrance is the main one, or that the choice is a tie (`describe().access.mainEntrance`).
    const caption =
      main === undefined
        ? "ENTRANCE"
        : main.door === id
          ? "MAIN ENTRANCE"
          : main.basis === "tie" && main.candidates.includes(id)
            ? "ENTRANCE (main: a tie)"
            : "ENTRANCE";
    graph.push(
      `<polygon points="${fmt(at.x)},${fmt(at.y - s)} ${fmt(at.x + s)},${fmt(at.y)} ${fmt(at.x)},${fmt(at.y + s)} ${fmt(at.x - s)},${fmt(at.y)}" fill="${ENTRANCE}"/>`,
    );
    captions.push(
      `<text x="${fmt(at.x + s * 1.3)}" y="${fmt(at.y + s * 1.9)}" font-size="${fmt(11 / k)}" font-weight="700" fill="${ENTRANCE}" stroke="${PAPER}" stroke-width="${fmt(3 / k)}" paint-order="stroke">${caption}</text>`,
    );
  }
  for (const r of rooms) {
    const p = nodeAt.get(r.id)!;
    const ok = reachable.get(r.id) !== false;
    const dash = ok ? "" : ` stroke-dasharray="${fmt(3 / k)} ${fmt(2 / k)}"`;
    graph.push(
      `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(5 / k)}" fill="none" stroke="${PAPER}" stroke-width="${fmt(5 / k)}"/>`,
      `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(5 / k)}" fill="none" stroke="${ok ? GRAPH : MUTED}" stroke-width="${fmt(2 / k)}"${dash}/>`,
    );
  }

  // Rings, then their tags: each tag at the first outward corner of its ring box (NE, NW,
  // SE, SW) that misses every ring and every tag placed so far, else NE.
  const ringMarks: string[] = [];
  const tagMarks: string[] = [];
  const ringBoxes = [...rings.values()].map((r) => r.ring.ext);
  const placed: ReviewBox[] = [];
  for (const { ring, marks: ms } of rings.values()) {
    ringMarks.push(ringSvg(ring, k));
    const { w, h } = tagSize(ms, k);
    const e = ring.ext;
    const corners: ReviewBox[] = [
      { x: e.x + e.w, y: e.y - h, w, h },
      { x: e.x - w, y: e.y - h, w, h },
      { x: e.x + e.w, y: e.y + e.h, w, h },
      { x: e.x - w, y: e.y + e.h, w, h },
    ];
    const free = corners.find((c) => !ringBoxes.some((b) => overlaps(c, b)) && !placed.some((b) => overlaps(c, b)));
    const at = free ?? corners[0]!;
    placed.push(at);
    tagMarks.push(tagSvg(at, ms, k));
  }

  // Close-ups: one tile per flagged opening or furniture piece, in mark order, at one scale,
  // at most REVIEW_MAX_CROPS of them.
  const cropped = [...rings.values()].filter((r) => CROPPED.has(r.element.kind));
  const drawnCrops = cropped.slice(0, REVIEW_MAX_CROPS);
  const cropsOmitted = [...new Set(cropped.slice(REVIEW_MAX_CROPS).flatMap((r) => r.marks.map((m) => m.n)))]
    .filter((n) => !drawnCrops.some((c) => c.marks.some((m) => m.n === n)))
    .sort((a, b) => a - b);

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
    `<circle cx="${PAD + 11}" cy="${ky}" r="5" fill="none" stroke="${GRAPH}" stroke-width="2"/>`,
    `<circle cx="${PAD + 29}" cy="${ky}" r="5" fill="none" stroke="${MUTED}" stroke-width="2" stroke-dasharray="3 2"/>`,
    `<rect x="${PAD + 43}" y="${ky - 4}" width="8" height="8" fill="${GRAPH}"/>`,
    `<polygon points="${PAD + 67},${ky - 8} ${PAD + 75},${ky} ${PAD + 67},${ky + 8} ${PAD + 59},${ky}" fill="${ENTRANCE}"/>`,
    `<text x="${PAD + 86}" y="${ky}" font-size="${LEGEND_FONT}" fill="${MUTED}" dominant-baseline="central">access graph (describe().access): a room reached from an entrance on this storey; one not reached; a door or opening; an entrance. Red: a ringed element and its numbered warnings.</text>`,
  );
  y += LEGEND_LINE + 8;
  const textX = PAD + 34;
  const textW = innerW - 34;
  for (const m of marks) {
    legend.push(badge({ x: PAD + 11, y: y + 9 }, 11, String(m.n)));
    // A warning that names nothing drawn on this storey (or cannot say which copy) is
    // listed with the reason, never ringed on a guess.
    const where = m.unringed
      ? `<tspan dx="8" font-weight="400" fill="${MUTED}">${xmlText(unringedText(m.unringed, m.ringed.length > 0))}</tspan>`
      : "";
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

  const crops: ReviewCrop[] = [];
  const tiles: string[] = [];
  if (drawnCrops.length > 0) {
    y += GAP - 6;
    const more = cropped.length - drawnCrops.length;
    tiles.push(
      `<text x="${PAD}" y="${fmt(y)}" font-size="16" font-weight="700" fill="${INK}" dominant-baseline="hanging">Close-ups (1 m = ${fmt(REVIEW_CROP_SCALE * 1000)} units, every tile)${more > 0 ? `<tspan dx="8" font-weight="400" fill="${MUTED}">+${more} close-up${more === 1 ? "" : "s"} not drawn (the first ${REVIEW_MAX_CROPS} in mark order are)</tspan>` : ""}</text>`,
    );
    y += 28;
    const maxMm = innerW / REVIEW_CROP_SCALE;
    let x = PAD;
    let rowH = 0;
    for (const { ring, element, marks: ms } of drawnCrops) {
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
    `<g id="rv-captions">${captions.join("")}</g>`,
    `<g id="rv-tags">${tagMarks.join("")}</g>`,
    `</svg>`,
    `<rect x="${fmt(panelX)}" y="${fmt(panelY)}" width="${fmt(panelW)}" height="${fmt(panelH)}" fill="none" stroke="${MUTED}" stroke-width="1"/>`,
    `<g id="rv-legend">${legend.join("")}</g>`,
    `<g id="rv-close-ups">${tiles.join("")}</g>`,
    `</svg>`,
  );
  return {
    svg: out.join("\n"),
    marks,
    crops,
    cropsOmitted,
    diagnostics: plain.diagnostics,
    ...(level !== undefined ? { level } : {}),
  };
}
