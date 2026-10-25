/**
 * How a lint or taste MESSAGE names a room that has no label (plan-soundness PS2.22, PS2.29).
 *
 * The iron law: a `message` never quotes an element id (`docs/agents/iron-laws.md`); ids live in
 * the `hint`. A labelled room is named by its label, as it always was. A room with no label has
 * only its id, which a reader of the message may never see, so it is named by what the plan knows
 * about it, in this order:
 *
 *  1. its use word, when it has a use ("the kitchen", "the bedroom");
 *  2. where it stands on the storey, when that word alone would not tell it from another
 *     unlabelled room, or when it has no use ("the bedroom in the top left of the plan",
 *     "the room at the bottom of the plan");
 *  3. its place in the reading order, when use and place still tie ("… (2 of 2)").
 *
 * A name is never invented: no label is made up, and no id is quoted. The position is the room's
 * label point (a point inside its floor, `polygonLabelPoint`) read against the extent of the
 * storey's label points, in page terms (top is the plan's top edge), so it needs no `north`.
 *
 * One builder serves `lint()` (`ctx.nameOf`) and `taste()` (`namesOf`), so the two cannot word
 * the same room two ways. A room that is labelled costs nothing: the labelled messages are
 * byte-identical to what they were.
 */

import type { Point } from "../ast.js";
import { polygonLabelPoint } from "../geometry/polygon.js";

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

/** What the builder needs to know of one room. `uses` is the room's classification (declared,
 *  or read from its label or id: `roomUses`), in the order its words should be spoken. */
export interface NameableRoom {
  id: string;
  label?: string;
  uses: readonly string[];
  /** A point inside the room's floor: the label point. */
  point: Point;
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

/**
 * The phrase for each UNLABELLED room of one storey, keyed by room id (a labelled room has no
 * entry: its message quotes its label). Pass every room of the storey, labelled or not: the
 * place is read against all of them. `level` is added on a multi-storey plan. `byUse = false` names
 * every room by its place alone, for a message about how the room's use was READ (it must not
 * call a room "the garage" while saying it only might be one).
 */
export function unlabelledRoomPhrases(
  rooms: readonly NameableRoom[],
  level?: number,
  byUse = true,
): Map<string, string> {
  const out = new Map<string, string>();
  if (rooms.every((r) => r.label !== undefined)) return out;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const r of rooms) {
    x0 = Math.min(x0, r.point.x);
    x1 = Math.max(x1, r.point.x);
    y0 = Math.min(y0, r.point.y);
    y1 = Math.max(y1, r.point.y);
  }
  const bare = rooms.filter((r) => r.label === undefined);
  const nounOf = (r: NameableRoom): string => {
    for (const u of byUse ? r.uses : []) {
      const n = USE_NOUN[u];
      if (n !== undefined) return n;
    }
    return "room";
  };
  const placeOf = (r: NameableRoom): string => PLACE[third(r.point.y, y0, y1)]![third(r.point.x, x0, x1)]!;
  const count = new Map<string, number>();
  const tied = new Map<string, number>();
  for (const r of bare) {
    count.set(nounOf(r), (count.get(nounOf(r)) ?? 0) + 1);
    const k = `${nounOf(r)}|${placeOf(r)}`;
    tied.set(k, (tied.get(k) ?? 0) + 1);
  }
  // Reading order (top to bottom, then left to right) breaks a tie of noun and place.
  const order = [...bare].sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
  const seen = new Map<string, number>();
  const where = level !== undefined ? ` on level ${level}` : "";
  for (const r of order) {
    const noun = nounOf(r);
    const k = `${noun}|${placeOf(r)}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    // A single bare room with a use is just "the kitchen"; a use-less one is placed at once.
    let phrase = `the ${noun}`;
    if (count.get(noun)! > 1 || noun === "room") phrase += ` ${placeOf(r)}`;
    if (tied.get(k)! > 1) phrase += ` (${n} of ${tied.get(k)})`;
    out.set(r.id, phrase + where);
  }
  return out;
}

/** A phrase at the start of a sentence: its first letter capitalised, the rest as it is. */
export const capFirst = (s: string): string => (s === "" ? s : s[0]!.toUpperCase() + s.slice(1));

/**
 * Where `p` stands among `points` (the label points of a storey's rooms), as a phrase that
 * follows a noun: "in the top left of the plan", "in the middle of the plan".
 */
export function placeWithin(p: Point, points: readonly Point[]): string {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const q of [p, ...points]) {
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  return PLACE[third(p.y, y0, y1)]![third(p.x, x0, x1)]!;
}

/** The room fields {@link roomOverlapNamer} reads. */
export interface OverlapRoom {
  id: string;
  label?: string;
  uses?: readonly string[];
  at: Point;
  size: { w: number; h: number };
  poly?: readonly Point[];
  circle?: { c: Point };
}

/**
 * The message for two overlapping rooms (`W_ROOM_OVERLAP`, the compile channel), built for one
 * storey's placed rooms: two labelled rooms read `Rooms "A" and "B" overlap`; an unlabelled one is
 * named as {@link unlabelledRoomPhrases} names it. Two rooms that would read alike (the same label
 * on both, as two placed copies of one component have) are told apart by where each stands, and
 * by "first" and "second" where that is the same too. `useOf` reads a room's use from its
 * declaration, label or id (the caller's classifier: this file stays free of the vocabulary).
 */
export function roomOverlapNamer(
  rooms: readonly OverlapRoom[],
  useOf: (r: OverlapRoom) => readonly string[],
): (r1: OverlapRoom, r2: OverlapRoom) => string {
  let phrases: Map<string, string> | undefined;
  let points: Point[] | undefined;
  const name = (r: OverlapRoom): string => {
    if (r.label !== undefined) return `"${r.label}"`;
    phrases ??= unlabelledRoomPhrases(
      rooms.map((x) => ({
        id: x.id,
        ...(x.label !== undefined ? { label: x.label } : {}),
        uses: useOf(x),
        point: labelPointOf(x),
      })),
    );
    return phrases.get(r.id) ?? "an unlabelled room";
  };
  return (r1, r2) => {
    let a = name(r1);
    let b = name(r2);
    if (a === b) {
      points ??= rooms.map((x) => labelPointOf(x));
      const pa = labelPointOf(r1);
      const pb = labelPointOf(r2);
      const ta = placeWithin(pa, points);
      const tb = placeWithin(pb, points);
      a = ta === tb ? `${a} (the first)` : `${a} ${ta}`;
      b = ta === tb ? `${b} (the second)` : `${b} ${tb}`;
    }
    return r1.label !== undefined && r2.label !== undefined
      ? `Rooms ${a} and ${b} overlap`
      : `${capFirst(a)} and ${b} overlap`;
  };
}
