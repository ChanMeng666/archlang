/**
 * How a diagnostic, a hint, a fix or a suggestion names a wall (ADR 0028 §3, "Addressing").
 *
 * An authored wall is named by its id, as every such text always has: `wall "<id>"`. A wall
 * that `walls from rooms` DERIVED has no id an author can type (`exterior`, `A|B`, … are
 * internal), so it is named by its relation instead: `the partition between "A" and "B"`,
 * `the exterior wall derived from the rooms`. A text that would WRITE a wall reference into
 * the source (`on <wall> at …`, an attach fix) must not be produced for a derived wall at
 * all; {@link isDerivedWall} is the test.
 *
 * The wall is found by IDENTITY, never by id alone: a caller that holds the wall passes it
 * ({@link wallPhraseOf}); a caller that holds a hosted segment passes the segment, and the
 * wall is the one with that id AND that exact segment, so two walls sharing an id (an
 * `E_DUP_ID` or `E_WALL_ID_RESERVED` plan) are told apart by geometry.
 */

import type { Point } from "./ast.js";
import type { RWall } from "./ir.js";

/** A wall reference as a hosted segment carries it: its id, and its endpoints when known. */
export interface WallKey {
  wallId: string;
  a?: Point;
  b?: Point;
}

/** The straight segment `a`→`b` (either way round) is one of `w`'s edges. */
function hasSegment(w: RWall, a: Point, b: Point): boolean {
  const n = w.points.length;
  const last = w.closed ? n : n - 1;
  for (let k = 0; k < last; k++) {
    const p = w.points[k]!;
    const q = w.points[(k + 1) % n]!;
    if (
      (p.x === a.x && p.y === a.y && q.x === b.x && q.y === b.y) ||
      (p.x === b.x && p.y === b.y && q.x === a.x && q.y === a.y)
    )
      return true;
  }
  return false;
}

/** The wall a key names: by id, and among walls sharing it, the one with that segment. */
export function wallOf(walls: readonly RWall[], key: WallKey): RWall | undefined {
  const named = walls.filter((w) => w.id === key.wallId);
  if (named.length <= 1 || !key.a || !key.b) return named[0];
  return named.find((w) => hasSegment(w, key.a!, key.b!)) ?? named[0];
}

/** True when the wall a key names was derived by `walls from rooms`. */
export function isDerivedWall(walls: readonly RWall[], key: WallKey): boolean {
  return wallOf(walls, key)?._derived !== undefined;
}

/**
 * ` (edge 2)` on a later run of a pair that shares several (`A|B#2`, ADR 0028 §3), else nothing:
 * the relation alone would give two runs one name. Read only on a partition, so a courtyard ring's
 * `exterior#2` stays as it is, and it holds on a run coexistence split (`A|B#2~2`).
 */
export function edgeOfPair(w: { id: string; _derived?: RWall["_derived"] }): string {
  const k = w._derived?.between ? /#(\d+)(?:~\d+)?$/.exec(w.id) : null;
  return k ? ` (edge ${k[1]})` : "";
}

/**
 * The phrase that names one wall in prose: `wall "<id>"` for an authored wall (byte for byte
 * the text every rule wrote before derived walls existed), its relation for a derived one.
 */
export function wallPhraseOf(w: { id: string; _derived?: RWall["_derived"] }): string {
  const d = w._derived;
  if (d === undefined) return `wall "${w.id}"`;
  if (d.between) return `the partition between "${d.between[0]}" and "${d.between[1]}"${edgeOfPair(w)}`;
  return d.ring === "inner" ? "the courtyard wall derived from the rooms" : "the exterior wall derived from the rooms";
}

/** The phrase that names an `open between` boundary: nothing is built along it, so not a wall. */
export function openBoundaryPhraseOf(w: { id: string; _derived?: RWall["_derived"] }): string {
  const between = w._derived?.between;
  return between ? `the open boundary between "${between[0]}" and "${between[1]}"` : wallPhraseOf(w);
}

/** {@link wallPhraseOf} for the wall a key names, over the walls the plan resolved. */
export function wallRef(walls: readonly RWall[], key: WallKey): string {
  return wallPhraseOf(wallOf(walls, key) ?? { id: key.wallId });
}

/** An opening as {@link openingClauseOf} reads it. */
interface MaybeDerivedOpening {
  kind: string;
  id: string;
  _derived?: unknown;
  _component?: string;
}

/**
 * The clause that derived an opening, when an `open between` clause of `walls from rooms`
 * derived it without an `id=`: `` the `open between A and B` clause `` (as written, and "in
 * component `m`" for a placed one). Such an opening's id
 * (`A|B:open`) cannot be written in source, so a hint names the clause the author edits
 * instead; undefined for every other door, window or opening (name it by its id).
 */
export function openingClauseOf(el: MaybeDerivedOpening | undefined): string | undefined {
  if (el?.kind !== "opening" || el._derived === undefined) return undefined;
  const d = el._derived as { written: [string, string]; idAuthored: boolean };
  if (d.idAuthored) return undefined;
  // Quoted as written, in the frame it is written in: inside a component, its own room ids.
  const where = el._component !== undefined ? ` in component \`${el._component}\`` : "";
  return `the \`open between ${d.written[0]} and ${d.written[1]}\` clause${where}`;
}

/** {@link openingClauseOf} for the connector with this id among the plan's elements. */
export function openingClauseById(elements: readonly MaybeDerivedOpening[], id: string): string | undefined {
  return openingClauseOf(elements.find((e) => e.kind === "opening" && e.id === id));
}
