/**
 * SPACE SYNTAX on the access graph — `describe(src, { facts: ["syntax"] })`. Opt-in.
 *
 * Hillier & Hanson, *The Social Logic of Space* (1984), ch. 4: a building's plan is read
 * as its permeability graph — one node per space plus the outside ("the carrier"), one
 * edge per pair of spaces a person can pass between — and a few ratios of that graph's
 * DEPTHS say how integrated or segregated each space is.
 *
 * The graph is the one `describe().access` already resolves (`buildDoorAccessGraph`):
 * nodes are the rooms plus `exterior`, edges are the connectors it counts as joining two
 * spaces (an ambiguous 3+-room connector joins none). It is taken as a SIMPLE graph — two
 * doors between the same pair of spaces are one permeability, not a ring.
 *
 * The SYSTEM is the connected component that holds `exterior`, and `k` is its node count
 * (the carrier included). A room outside it — one no modeled connector reaches from
 * outside — has every metric `null`, never `NaN`. For a room in it:
 *
 *  - `depth` — steps from `exterior`; exactly `access.rooms[].depthFromEntrance`, reused
 *    rather than recomputed;
 *  - `meanDepth` MD = (Σ over the other k − 1 system nodes of the step distance) / (k − 1);
 *  - `ra` (relative asymmetry) RA = 2(MD − 1) / (k − 2), in [0, 1]; `null` when k ≤ 2;
 *  - `integration` = 1 / RA (Hillier & Hanson's integration value, the reciprocal of RA —
 *    NOT the D-value-normalised 1/RRA, whose normaliser needs a logarithm). `null` when RA
 *    is `null`, and when RA is 0 — a space adjacent to every other one, whose reciprocal is
 *    unbounded; `ra: 0` beside it says which;
 *  - `control` = Σ over its neighbours j of 1 / deg(j).
 *
 * Graph-level: `k`, and `cycleRank` = E − V + C, the first Betti number of the whole
 * simple graph (every room and `exterior`; C counts its components) — Hillier's
 * "ringiness": 0 is a tree, each unit more is one independent ring.
 *
 * Step distances are all-pairs MIN_PLUS on the one path engine (`src/algebra/paths.ts`),
 * unit weights — exact integers. Ratios print through `fmt4`. Pure and deterministic.
 */

import { accessDigraph, EXTERIOR_NODE, type AccessGraph } from "../analyze.js";
import { bestPaths } from "../algebra/paths.js";
import { BOOLEAN, MIN_PLUS } from "../algebra/semiring.js";
import { fmt4 } from "../num-format.js";

/** One room's space-syntax metrics; every value `null` when the room is outside the system. */
export interface SyntaxRoom {
  id: string;
  depth: number | null;
  meanDepth: number | null;
  ra: number | null;
  integration: number | null;
  control: number | null;
}

/** `describe().syntax`. */
export interface SyntaxFacts {
  /** Nodes in the system: `exterior` and every room it reaches. */
  k: number;
  /** E − V + C of the whole simple access graph. */
  cycleRank: number;
  rooms: SyntaxRoom[];
}

const r4 = (v: number): number => Number(fmt4(v));

/** The space-syntax facts of one storey's access graph, rooms in `access.rooms` order. */
export function syntaxFacts(access: AccessGraph): SyntaxFacts {
  const roomIds = access.rooms.map((r) => r.id);
  const g = accessDigraph(roomIds, access.edges);
  const nodes = g.nodes;

  // The simple graph: distinct neighbours, in first-edge order.
  const nbrs = new Map<string, string[]>();
  for (const n of nodes) nbrs.set(n, [...new Set(g.out(n).map((e) => e.to))]);
  let twiceE = 0;
  for (const n of nodes) twiceE += nbrs.get(n)!.length;

  // Components, each seeded in node order.
  let components = 0;
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n)) continue;
    components++;
    const reach = bestPaths(g, { s: BOOLEAN, weight: () => true, sources: [[n, true]], rank: () => 0 }).value;
    for (const m of reach.keys()) seen.add(m);
  }

  // The system: `exterior` and the rooms the access graph says it reaches.
  const system = new Set<string>([EXTERIOR_NODE]);
  for (const r of access.rooms) if (r.depthFromEntrance !== null) system.add(r.id);
  const k = system.size;

  const rooms: SyntaxRoom[] = access.rooms.map((r) => {
    if (r.depthFromEntrance === null) {
      return { id: r.id, depth: null, meanDepth: null, ra: null, integration: null, control: null };
    }
    const dist = bestPaths(g, { s: MIN_PLUS, weight: () => 1, sources: [[r.id, 0]], rank: () => 0 }).value;
    let total = 0;
    for (const [n, d] of dist) if (n !== r.id) total += d;
    const md = total / (k - 1);
    const ra = k > 2 ? (2 * (md - 1)) / (k - 2) : null;
    let control = 0;
    for (const j of nbrs.get(r.id)!) control += 1 / nbrs.get(j)!.length;
    return {
      id: r.id,
      depth: r.depthFromEntrance,
      meanDepth: r4(md),
      ra: ra === null ? null : r4(ra),
      integration: ra === null || ra === 0 ? null : r4(1 / ra),
      control: r4(control),
    };
  });

  return { k, cycleRank: twiceE / 2 - nodes.length + components, rooms };
}
