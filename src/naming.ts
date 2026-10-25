/**
 * How a lint, taste or resolver MESSAGE names a room that has no label (plan-soundness PS2.22,
 * PS2.29), and where a thing stands on the storey.
 *
 * The iron law: a `message` never quotes an element id (`docs/agents/iron-laws.md`); ids live in the
 * `hint`. A labelled room is named by its label, as it always was. A room with no label has only its
 * id, which a reader of the message may never see, so it is named by what the plan knows about it:
 *
 *  1. its use word, when it has a use and no other room has that use: "the kitchen";
 *  2. otherwise where it stands on the storey: "the bedroom on the left of the plan", "the room in
 *     the top left of the plan" (a room with no use is always placed);
 *  3. when use and place still tie with another room, its size first: "the 3.2 × 2.4 m bedroom in
 *     the top left of the plan" (a polygon or circle by area: "the 20 m² room …");
 *  4. when even that ties, its place in reading order: "… (2 of 2)";
 *  5. the storey, on a multi-storey plan: "on level 2".
 *
 * A labelled room with the same use counts as another room of that use, so "the kitchen" is never
 * ambiguous beside a labelled `Kitchen`. Never an invented label, never the id.
 *
 * Place words are read against the storey's OUTLINE (the extent of every room's floor), in page
 * terms (the top of the sheet is the top), so no `north` is needed. A room's position is its label
 * point (a point inside its floor: `polygonLabelPoint`), never a bounding-box corner; an axis along
 * which the storey is not at least one and a half rooms long says nothing (the middle), so two equal
 * rooms side by side are "on the left" and "on the right", never "top left" and "bottom right".
 *
 * This module is neutral: `lint()` (`ctx.nameOf`), `taste()` (`namesOf`) and the resolver's
 * `W_ROOM_OVERLAP` all import it, so the three cannot word one room three ways. A labelled room
 * costs nothing: the labelled messages are byte-identical to what they were.
 */

import type { Point } from "./ast.js";
import { polygonArea, polygonLabelPoint } from "./geometry/polygon.js";
import { fmt2 } from "./num-format.js";

/** The words a use is spoken as. Keyed by `UseKind` (and typed as a string for taste). */
const USE_NOUN: Readonly<Record<string, string>> = {
  living: "living room",
  kitchen: "kitchen",
  dining: "dining room",
  bedroom: "bedroom",
  bath: "bathroom",
  wc: "WC",
  hall: "hall",
  circulation: "corridor",
  storage: "store",
  utility: "utility room",
  office: "office",
  entry: "entry",
  garage: "garage",
};

/** An axis-aligned extent. */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What the builder needs to know of one room. `uses` is the room's classification (declared, or
 *  read from its label or id: `roomUses`), in the order its words should be spoken. */
export interface NameableRoom {
  id: string;
  label?: string;
  uses: readonly string[];
  /** A point inside the room's floor: the label point. */
  point: Point;
  /** The extent of the room's floor (for the storey's outline and nothing else). */
  bounds: Bounds;
  /** The room's own size in words: "3.2 × 2.4 m", or "20 m²" for a floor that is not a rectangle. */
  size: string;
}

/** The fields {@link nameableOf} reads off a resolved room. */
export interface RoomShape {
  id: string;
  label?: string;
  uses?: readonly string[];
  at: Point;
  size: { w: number; h: number };
  poly?: readonly Point[];
  circle?: { c: Point; r: number };
}

/** The label point of a floor ring, a circle's centre, or a rectangle's centre. */
export function labelPointOf(r: {
  at: Point;
  size: { w: number; h: number };
  poly?: readonly Point[];
  circle?: { c: Point };
}): Point {
  if (r.circle) return r.circle.c;
  if (r.poly && r.poly.length >= 3) return polygonLabelPoint(r.poly);
  return { x: r.at.x + r.size.w / 2, y: r.at.y + r.size.h / 2 };
}

/** A size in words: "3.2 × 2.4 m" for a rectangle, "20 m²" for any other floor. */
export function sizeWords(rect: { w: number; h: number } | null, areaMm2: number): string {
  return rect ? `${fmt2(rect.w / 1000)} × ${fmt2(rect.h / 1000)} m` : `${fmt2(Math.round(areaMm2 / 10_000) / 100)} m²`;
}

/** A resolved room as the builder reads it. `uses` is the caller's classification of the room. */
export function nameableOf(r: RoomShape, uses: readonly string[]): NameableRoom {
  let bounds: Bounds;
  let size: string;
  if (r.circle) {
    bounds = {
      x0: r.circle.c.x - r.circle.r,
      y0: r.circle.c.y - r.circle.r,
      x1: r.circle.c.x + r.circle.r,
      y1: r.circle.c.y + r.circle.r,
    };
    size = sizeWords(null, Math.PI * r.circle.r * r.circle.r);
  } else if (r.poly && r.poly.length >= 3) {
    bounds = {
      x0: Math.min(...r.poly.map((p) => p.x)),
      y0: Math.min(...r.poly.map((p) => p.y)),
      x1: Math.max(...r.poly.map((p) => p.x)),
      y1: Math.max(...r.poly.map((p) => p.y)),
    };
    size = sizeWords(null, Math.abs(polygonArea(r.poly)));
  } else {
    bounds = { x0: r.at.x, y0: r.at.y, x1: r.at.x + r.size.w, y1: r.at.y + r.size.h };
    size = sizeWords(r.size, r.size.w * r.size.h);
  }
  return { id: r.id, ...(r.label !== undefined ? { label: r.label } : {}), uses, point: labelPointOf(r), bounds, size };
}

/** 0 low third, 1 middle, 2 high third of `v` within [lo, hi] (a zero range is the middle). */
function third(v: number, lo: number, hi: number): 0 | 1 | 2 {
  if (hi <= lo) return 1;
  const t = (v - lo) * 3;
  const span = hi - lo;
  return t < span ? 0 : t < 2 * span ? 1 : 2;
}

/** `[row][col]`: the part of the plan, as a phrase that follows a noun. */
const PLACE: readonly (readonly string[])[] = [
  ["in the top left of the plan", "at the top of the plan", "in the top right of the plan"],
  ["on the left of the plan", "in the middle of the plan", "on the right of the plan"],
  ["in the bottom left of the plan", "at the bottom of the plan", "in the bottom right of the plan"],
];

/** A storey's naming: built once per storey from every room of it, labelled or not. */
export interface Naming {
  /**
   * The phrase for `r` (unlabelled or not: the caller decides when a label is used). `noun` names
   * the use the message is about (a room that is both `living` and `bedroom` is "the bedroom" to a
   * bedroom rule). `byUse = false` names the room by place alone, for a message about how its use
   * was READ from its label or id (it must not call a room "the garage" while saying it only might
   * be one).
   */
  phrase(r: NameableRoom, opts?: { noun?: string; byUse?: boolean }): string;
  /** Where a point stands on this storey: "in the top left of the plan". */
  placeAt(p: Point): string;
}

/** Builds the {@link Naming} of one storey. `level` is the storey to name, set only on a
 *  multi-storey plan (a plan of one `level` block has nothing to tell apart). */
export function makeNaming(rooms: readonly NameableRoom[], level?: number): Naming {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let maxW = 0;
  let maxH = 0;
  for (const r of rooms) {
    x0 = Math.min(x0, r.bounds.x0);
    x1 = Math.max(x1, r.bounds.x1);
    y0 = Math.min(y0, r.bounds.y0);
    y1 = Math.max(y1, r.bounds.y1);
    maxW = Math.max(maxW, r.bounds.x1 - r.bounds.x0);
    maxH = Math.max(maxH, r.bounds.y1 - r.bounds.y0);
  }
  // An axis tells nothing unless the storey is at least one and a half rooms long along it.
  const xSays = (x1 - x0) * 2 >= maxW * 3;
  const ySays = (y1 - y0) * 2 >= maxH * 3;
  const placeAt = (p: Point): string => PLACE[ySays ? third(p.y, y0, y1) : 1]![xSays ? third(p.x, x0, x1) : 1]!;

  const index = new Map(rooms.map((r, i) => [r.id, i] as const));
  const nounsOf = (r: NameableRoom, byUse: boolean): string[] =>
    byUse ? r.uses.flatMap((u) => (USE_NOUN[u] !== undefined ? [USE_NOUN[u]!] : [])) : [];
  const memo = new Map<string, string>();
  const where = level !== undefined ? ` on level ${level}` : "";

  // The rooms that answer to each noun, and to each noun at each place, built on first use (once
  // for naming by use, once for naming by place alone), so naming a room costs its own group, not
  // the storey. A room with no use word is in the group "room".
  interface Groups {
    byNoun: Map<string, NameableRoom[]>;
    byNounPlace: Map<string, NameableRoom[]>;
    nouns: Map<string, string[]>;
  }
  const push = (m: Map<string, NameableRoom[]>, k: string, x: NameableRoom): void => {
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  };
  const groupsMemo: [Groups | null, Groups | null] = [null, null];
  const groupsOf = (byUse: boolean): Groups => {
    const slot = byUse ? 0 : 1;
    let g = groupsMemo[slot];
    if (g === null) {
      g = { byNoun: new Map(), byNounPlace: new Map(), nouns: new Map() };
      for (const x of rooms) {
        const ns = nounsOf(x, byUse);
        g.nouns.set(x.id, ns);
        const place = placeAt(x.point);
        for (const n of ns.length > 0 ? [...new Set(ns)] : ["room"]) {
          push(g.byNoun, n, x);
          push(g.byNounPlace, `${n}|${place}`, x);
        }
      }
      groupsMemo[slot] = g;
    }
    return g;
  };

  const phrase: Naming["phrase"] = (r, opts) => {
    const byUse = opts?.byUse !== false;
    const key = `${r.id}|${opts?.noun ?? ""}|${byUse ? 1 : 0}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const g = groupsOf(byUse);
    const ns = nounsOf(r, byUse);
    // The use the message is about, when the room has it; otherwise its own first use.
    const noun = opts?.noun !== undefined && ns.includes(opts.noun) ? opts.noun : (ns[0] ?? "room");
    // The other rooms that would answer to the same words: any room with that use, labelled or
    // not; for "room", the rooms with no use word.
    const peers = (g.byNoun.get(noun) ?? []).filter((x) => x.id !== r.id);
    let out = `the ${noun}`;
    if (peers.length > 0) {
      const mine = placeAt(r.point);
      out += ` ${mine}`;
      const samePlace = (g.byNounPlace.get(`${noun}|${mine}`) ?? []).filter((x) => x.id !== r.id);
      if (samePlace.length > 0) {
        out = `the ${r.size} ${noun} ${mine}`;
        const alike = samePlace.filter((x) => x.size === r.size);
        if (alike.length > 0) {
          const order = [r, ...alike].sort(
            (a, b) => a.point.y - b.point.y || a.point.x - b.point.x || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0),
          );
          out += ` (${order.findIndex((x) => x.id === r.id) + 1} of ${order.length})`;
        }
      }
    }
    out += where;
    memo.set(key, out);
    return out;
  };
  return { phrase, placeAt };
}

/** A straight wall run as the wall namer reads it. */
export interface WallRun {
  a: Point;
  b: Point;
  thickness: number;
  category: string;
}

/**
 * A wall named by what stands on its two faces, for a message that must not quote its id: one
 * probe a little past each face of the run's midpoint (`roomAt` answers with the room there, its
 * id and its phrase, or undefined). A room on each face: "the partition between A and B"; the same room on
 * both (a wall standing inside one room): "the partition in A"; a room on one face: "the exterior
 * wall of A"; none: the kind and where it stands ("the partition in the middle of the plan"). The
 * kind is "partition" for a partition and "<category> wall" for any other category. Shared by the
 * resolver's `keep` messages (ADR 0033); lint words its walls through `lint/element-phrases.ts`.
 */
export function wallRunPhrase(
  s: WallRun,
  roomAt: (p: Point) => { id: string; phrase: string } | undefined,
  placeAt: (p: Point) => string,
): string {
  const kind = s.category === "partition" ? "partition" : `${s.category} wall`;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len = Math.hypot(dx, dy);
  const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  if (len > 0) {
    const off = s.thickness / 2 + 50;
    const a = roomAt({ x: mid.x - (dy / len) * off, y: mid.y + (dx / len) * off });
    const b = roomAt({ x: mid.x + (dy / len) * off, y: mid.y - (dx / len) * off });
    if (a !== undefined && b !== undefined) {
      return a.id === b.id ? `the ${kind} in ${a.phrase}` : `the ${kind} between ${a.phrase} and ${b.phrase}`;
    }
    if (a !== undefined || b !== undefined) return `the ${kind} of ${(a ?? b)!.phrase}`;
  }
  return `the ${kind} ${placeAt(mid)}`;
}

/** A phrase at the start of a sentence: its first letter capitalised, the rest as it is. */
export const capFirst = (s: string): string => (s === "" ? s : s[0]!.toUpperCase() + s.slice(1));

/** The room fields {@link roomOverlapNamer} reads. */
export type OverlapRoom = RoomShape;

/**
 * The message for two overlapping rooms (`W_ROOM_OVERLAP`, the compile channel), built for one
 * storey's placed rooms: two labelled rooms read `Rooms "A" and "B" overlap`; an unlabelled one is
 * named as {@link makeNaming} names it. Two labelled rooms that would read alike (the same label on
 * both, as two placed copies of one component have) are told apart by where each stands, and by
 * "first" and "second" where that is the same too. `useOf` reads a room's use from its declaration,
 * label or id (the caller's classifier: this file stays free of the vocabulary).
 */
export function roomOverlapNamer(
  rooms: readonly OverlapRoom[],
  useOf: (r: OverlapRoom) => readonly string[],
  level?: number,
): (r1: OverlapRoom, r2: OverlapRoom) => string {
  const byId = new Map<string, OverlapRoom>(rooms.map((r) => [r.id, r]));
  let naming: Naming | undefined;
  let nameable: Map<string, NameableRoom> | undefined;
  const of = (r: OverlapRoom): NameableRoom => {
    nameable ??= new Map(rooms.map((x) => [x.id, nameableOf(x, useOf(x))] as const));
    // The storey is said once, at the end of the sentence, not after each room.
    naming ??= makeNaming([...nameable.values()]);
    return nameable.get(r.id) ?? nameableOf(byId.get(r.id) ?? r, useOf(r));
  };
  const name = (r: OverlapRoom): string => (r.label !== undefined ? `"${r.label}"` : naming!.phrase(of(r)));
  return (r1, r2) => {
    of(r1);
    let a = name(r1);
    let b = name(r2);
    if (a === b) {
      const ta = naming!.placeAt(of(r1).point);
      const tb = naming!.placeAt(of(r2).point);
      a = ta === tb ? `${a} (the first)` : `${a} ${ta}`;
      b = ta === tb ? `${b} (the second)` : `${b} ${tb}`;
    }
    return r1.label !== undefined && r2.label !== undefined
      ? `Rooms ${a} and ${b} overlap`
      : `${capFirst(a)} and ${b}${level !== undefined ? ` on level ${level}` : ""} overlap`;
  };
}
