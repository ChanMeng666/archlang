/**
 * The fabric `diffPlans` compares and `describe()` never reports: each wall and each opening's
 * host, read from the same resolve as the summary (moved verbatim from `src/describe.ts`).
 *
 * Invariant: none of it reaches `describe()`'s output; one pass over walls and one over
 * openings. It charges nothing to the step meter.
 */

import { wallPhraseOf } from "../wall-ref.js";
import type { RDoor, RWindow, ROpening, RWall as RWallFact } from "../ir.js";
import type { Point } from "../ast.js";
import type { resolvePlan } from "../analyze.js";

/**
 * @internal One wall as `diffPlans` compares it, read from the same resolve as the summary
 * (the lowest storey, like `describe()`'s top-level arrays). Not public API and never part of
 * `describe()`'s output. `key` pairs it with the other side: its resolved id, with `@<n>` on
 * the n-th wall sharing an id. `name` is what a person reads: `wall "<authored id>"`, or the
 * room relation of a derived wall (`wallPhraseOf`), never its internal name.
 */
export interface DiffWallFact {
  key: string;
  name: string;
  /** The wall's id when it is an authored statement; absent on a derived wall. */
  id?: string;
  category: string;
  thickness: number;
  closed: boolean;
  points: Point[];
  /** Per segment index: the arc's radius and signed sweep, absent for a straight run. */
  arcs: Array<{ r: number; sweep: number } | undefined>;
  /** The rooms the wall stands by, by relation: a derived partition's or a pairwise wall's
   *  pair, an `around` list, or `"rooms"` for a derived ring (it follows the room union). */
  follows?: string[] | "rooms";
}

/** @internal An opening's host as `diffPlans` compares it. */
export interface DiffHostFact {
  /** The {@link DiffWallFact.key} of the wall it stands in, or null when it stands in none. */
  wall: string | null;
  /** The host part of a relational placement as written (`between a and b`, `on r.top`). */
  relation?: string;
  /** How a person names the opening when its id cannot be typed (a derived `open between`). */
  name?: string;
}

/** @internal The fabric `describe()` does not report, carried beside it for `diffPlans`. */
export interface DiffFabric {
  walls: DiffWallFact[];
  hosts: Map<string, DiffHostFact>;
}

function sameSegment(w: RWallFact, a: Point, b: Point): boolean {
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

/** Linear in walls + openings: one pass each, walls grouped by id once (an opening scans only
 *  the walls sharing its host's id, as `wallOf` picks among them). */
export function diffFabricOf(ir: ReturnType<typeof resolvePlan>["ir"]): DiffFabric {
  const walls: DiffWallFact[] = [];
  const hosts = new Map<string, DiffHostFact>();
  if (!ir) return { walls, hosts };
  const byId = new Map<string, Array<{ w: RWallFact; key: string }>>();
  for (const w of ir.walls) {
    const group = byId.get(w.id) ?? [];
    if (group.length === 0) byId.set(w.id, group);
    const key = group.length === 0 ? w.id : `${w.id}@${group.length + 1}`;
    group.push({ w, key });
    // A run an authored wall split off a derived wall is `<name>~<k>`: same relation, run k.
    const run = w._derived ? /~(\d+)$/.exec(w.id) : null;
    const rel = w._relation;
    const follows: DiffWallFact["follows"] = w._derived
      ? w._derived.between
        ? [...w._derived.between]
        : "rooms"
      : rel && "between" in rel
        ? [...rel.between]
        : rel && "around" in rel
          ? [...rel.around]
          : undefined;
    walls.push({
      key,
      name: `${wallPhraseOf(w)}${run ? ` (run ${run[1]})` : ""}`,
      ...(w._derived ? {} : { id: w.id }),
      category: w.category,
      thickness: w.thickness,
      closed: w.closed,
      points: w.points.map((p) => ({ x: p.x, y: p.y })),
      arcs: (w.arcs ?? []).map((a) => (a ? { r: a.r, sweep: a.sweep } : undefined)),
      ...(follows !== undefined ? { follows } : {}),
    });
  }
  for (const e of ir.elements) {
    if (e.kind !== "door" && e.kind !== "window" && e.kind !== "opening") continue;
    const o = e as RDoor | RWindow | ROpening;
    let wall: string | null = null;
    if (o.host) {
      const group = byId.get(o.host.wallId) ?? [];
      const hit =
        group.length <= 1 ? group[0] : (group.find((g) => sameSegment(g.w, o.host!.a, o.host!.b)) ?? group[0]);
      wall = hit ? hit.key : o.host.wallId;
    }
    const r = o._relation;
    const relation = r ? (r.between ? `between ${r.between[0]} and ${r.between[1]}` : `on ${r.edge}`) : undefined;
    // An `open between` opening derived with no `id=` has an id no one can type (`A|B:open`).
    const d = o.kind === "opening" ? (o as ROpening)._derived : undefined;
    const name = d && !d.idAuthored ? `opening between ${d.between[0]} and ${d.between[1]}` : undefined;
    hosts.set(o.id, { wall, ...(relation !== undefined ? { relation } : {}), ...(name !== undefined ? { name } : {}) });
  }
  return { walls, hosts };
}
