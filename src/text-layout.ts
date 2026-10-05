/**
 * Line breaking for a drawn name, and where each line of a multi-line text is drawn.
 *
 * Two consumers, one module. The label pass (`src/label-placement.ts`) decides WHETHER a
 * room's name wraps and into WHICH lines; every backend (SVG, PDF, DXF — and the PNG, which
 * rasterises the SVG) asks {@link textLines} where each line goes. A backend never computes
 * a line's position itself, so the four outputs cannot disagree about it.
 *
 * Widths are the one shared estimate, {@link textWidth}: every line of a name is drawn at the
 * same font size, so comparing widths is comparing lengths, and the breaker works in
 * character counts.
 */

import type { Point } from "./ast.js";
import type { ScenePrim } from "./scene.js";
import { EM_PER_CHAR, textWidth } from "./text-metrics.js";

/** Line pitch of a wrapped name, in multiples of its font size (a conventional 1.2 leading). */
export const LABEL_LINE_PITCH = 1.2;

/** One unit a name may be broken between: `[start, end)` into the name. */
interface Unit {
  start: number;
  end: number;
}

/** A word with no letter and no digit — the `/` of `Living / Kitchen`. */
const SEPARATOR = /^[^\p{L}\p{N}]+$/u;

/**
 * The pieces of `name` a line break may fall between: its space-delimited words, with a
 * word that is only punctuation (`/`, `&`, `+`, a dash) GLUED to the word before it — or,
 * when it leads the name, to the word after it. So a break happens only at a space, never
 * inside a word, and a separator always stays on the line of a word it separates:
 * `Living / Kitchen` breaks as `Living /` · `Kitchen`, never leaving `/` alone or starting
 * a line with it. Only U+0020 is a break opportunity; any other character (a tab, a
 * non-breaking space, a newline) is part of the word it sits in.
 */
export function breakUnits(name: string): Unit[] {
  const words: Unit[] = [];
  let i = 0;
  while (i < name.length) {
    while (i < name.length && name[i] === " ") i++;
    if (i >= name.length) break;
    const start = i;
    while (i < name.length && name[i] !== " ") i++;
    words.push({ start, end: i });
  }
  const units: Unit[] = [];
  let lead: number | undefined;
  for (const w of words) {
    const sep = SEPARATOR.test(name.slice(w.start, w.end));
    const last = units[units.length - 1];
    if (sep && last) last.end = w.end;
    else if (sep) lead ??= w.start;
    else {
      units.push({ start: lead ?? w.start, end: w.end });
      lead = undefined;
    }
  }
  // A name made only of separators has no word to glue them to: one unit, unbreakable.
  if (units.length === 0 && lead !== undefined) units.push({ start: lead, end: words[words.length - 1]!.end });
  return units;
}

/**
 * Break before unit `k` while the line starting at unit `s` stays within `max` characters,
 * keeping at least `reserve` units for the lines still to come. Greedy, so the earlier lines
 * are the fuller ones.
 */
function lineEnd(units: readonly Unit[], s: number, max: number, reserve: number): number {
  let k = s + 1;
  while (k < units.length - reserve && units[k]!.end - units[s]!.start <= max) k++;
  return k;
}

/** How many lines the greedy fill at `max` characters needs (a unit longer than `max` takes a line alone). */
function greedyCount(units: readonly Unit[], max: number): number {
  let n = 0;
  for (let s = 0; s < units.length; s = lineEnd(units, s, max, 0)) n++;
  return n;
}

/**
 * The fewest lines `name` can be broken into with no line wider than `maxWidth` at font
 * `size` — or the unit count, when some single word is wider than `maxWidth` on its own
 * (then no break helps, and the caller's fit test says so).
 */
export function fewestLines(name: string, size: number, maxWidth: number): number {
  // The longest line length whose width is within `maxWidth`, found with the very product
  // `textWidth` computes — never a division — so it cannot disagree with the fit test by an ulp.
  let lo = 0;
  let hi = name.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (mid * size * EM_PER_CHAR <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return greedyCount(breakUnits(name), lo);
}

/**
 * `name` broken into exactly `n` lines, as balanced as possible: the longest line is as
 * short as any `n`-line break allows, and among breaks that tie on that the earlier lines
 * are the fuller ones (`Accessible` · `WC`). Each line is the name's own text between two
 * breaks, so a double space inside a line is kept. `null` when `name` has fewer than `n`
 * units to break between. O(u log L) in the unit count and the name's length.
 */
export function balancedLines(name: string, n: number): string[] | null {
  const units = breakUnits(name);
  if (n < 1 || units.length < n) return null;
  let longest = 0;
  for (const u of units) longest = Math.max(longest, u.end - u.start);
  // The smallest line length at which `n` lines suffice — feasibility is monotone in it.
  let lo = longest;
  let hi = units[units.length - 1]!.end - units[0]!.start;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (greedyCount(units, mid) <= n) hi = mid;
    else lo = mid + 1;
  }
  const lines: string[] = [];
  let s = 0;
  for (let line = 0; line < n; line++) {
    const e = line === n - 1 ? units.length : lineEnd(units, s, lo, n - line - 1);
    lines.push(name.slice(units[s]!.start, units[e - 1]!.end));
    s = e;
  }
  return lines;
}

/** One drawn line of a text primitive: its string and the point it is anchored at. */
export interface TextLine {
  value: string;
  at: Point;
}

/**
 * The lines a text primitive draws, each with its own anchor. A one-line text is itself;
 * a wrapped one (`block`) draws its lines `pitch` apart, centred on `at` — so `at` is the
 * middle of the block, exactly where the one-line text would have been centred.
 */
export function textLines(prim: Extract<ScenePrim, { t: "text" }>): TextLine[] {
  const block = prim.block;
  if (!block) return [{ value: prim.value, at: prim.at }];
  const mid = (block.lines.length - 1) / 2;
  return block.lines.map((value, i) => ({ value, at: { x: prim.at.x, y: prim.at.y + (i - mid) * block.pitch } }));
}

/** Unrotated extent of a text primitive: its widest line by its stacked height. */
export function textExtent(prim: Extract<ScenePrim, { t: "text" }>): { w: number; h: number } {
  const block = prim.block;
  if (!block) return { w: textWidth(prim.value, prim.size), h: prim.size };
  let w = 0;
  for (const line of block.lines) w = Math.max(w, textWidth(line, prim.size));
  return { w, h: prim.size + (block.lines.length - 1) * block.pitch };
}
