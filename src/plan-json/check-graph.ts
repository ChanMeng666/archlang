/**
 * `checkGraph` (T3b) — compare an intended adjacency dict to a compiled plan's interior-door
 * connectivity (moved verbatim from `src/plan-json.ts`, which re-exports every name it exported).
 *
 * Invariant: it builds the interior-door graph the way `describe()` builds `input_graph`
 * (`buildDoorAccessGraph`, then `buildInputGraph`). It charges nothing to the step meter itself;
 * the resolve it calls does.
 */

import type { RRoom, RDoor, ROpening, ResolvedPlan } from "../ir.js";
import { resolvePlan, roomUses, buildDoorAccessGraph, DEFAULT_TOL, type AnalyzeOptions } from "../analyze.js";
import { roomToward, verticalConnections } from "../vertical.js";
import { openRunsOf } from "../analyze.js";
import { roomTypeForUses } from "./room-types.js";
import { buildInputGraph } from "./to-json.js";

/** The result of comparing an intended adjacency graph against a compiled plan. */
export interface GraphCheck {
  /** True when every intended room resolves and the intended and actual interior
   *  adjacency graphs match exactly (no missing and no extra connections). */
  ok: boolean;
  /** Intended room names that did not resolve to any room in the plan. */
  missing_rooms: string[];
  /** Intended connections absent from the plan (as resolved room-id pairs). */
  missing_connections: [string, string][];
  /** Connections present in the plan but not requested (as resolved room-id pairs). */
  extra_connections: [string, string][];
}

/**
 * Compare an intended room-adjacency dict (`{ room: [neighbours…] }`) against the
 * interior-door connectivity of the compiled `source`.
 *
 * Room-name matching (first match wins, rooms scanned in source order): exact **id**,
 * else case-insensitive **label**, else case-insensitive **room_type**. Comparisons
 * are undirected; output pairs use the plan's resolved room ids and are ordered by
 * room source order, so results are deterministic. On a fatal compile error every
 * intended room is reported missing.
 *
 * **Multi-storey** (`level <n> { … }`): the graph is the WHOLE BUILDING's, not
 * page 1's — storeys are scanned in ascending level order and their rooms pooled in that
 * order (a room id that repeats on two storeys resolves to the LOWER storey's room, which
 * is also the rank used for output ordering). Nodes stay rooms: a `stair`/`elevator`/
 * `escalator` drawn with the same id on two storeys contributes ONE extra undirected edge
 * per adjacent pair of its storeys, **between the rooms whose rectangles contain its
 * footprint centre on each of them**. A run whose footprint centre falls in no room on one
 * of the two storeys contributes no edge there, and a run that appears on only one storey
 * contributes nothing at all (that is `W_STAIR_UNMATCHED`).
 */
export function checkGraph(source: string, intent: Record<string, string[]>, opts: AnalyzeOptions = {}): GraphCheck {
  const intentKeys = Object.keys(intent);
  const { ir, levels } = resolvePlan(source, opts);
  if (!ir) {
    return { ok: false, missing_rooms: [...intentKeys], missing_connections: [], extra_connections: [] };
  }
  // Single-storey: the plan IS the building. Multi-storey: pool every storey's rooms in
  // ascending level order, so an intended edge may span floors.
  const plans: ResolvedPlan[] = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  const rooms: RRoom[] = [];
  const seenRoomIds = new Set<string>();
  for (const p of plans) {
    for (const r of p.elements) {
      if (r.kind !== "room" || seenRoomIds.has(r.id)) continue;
      seenRoomIds.add(r.id);
      rooms.push(r);
    }
  }
  const rank = new Map<string, number>(rooms.map((r, i) => [r.id, i]));

  // Resolve an intent name → a plan room id (or null).
  const resolveName = (name: string): string | null => {
    const lower = name.toLowerCase();
    for (const r of rooms) if (r.id === name) return r.id;
    for (const r of rooms) if (r.label !== undefined && r.label.toLowerCase() === lower) return r.id;
    for (const r of rooms) if (roomTypeForUses(roomUses(r)).toLowerCase() === lower) return r.id;
    return null;
  };

  const missingRooms: string[] = [];
  const seenMissing = new Set<string>();
  const noteMissing = (name: string): void => {
    if (!seenMissing.has(name)) {
      seenMissing.add(name);
      missingRooms.push(name);
    }
  };

  // Intended undirected edges, as resolved id pairs (canonical order by source rank).
  const pairKey = (a: string, b: string): string => {
    const [x, y] = (rank.get(a) ?? 0) <= (rank.get(b) ?? 0) ? [a, b] : [b, a];
    return `${x}\u0000${y}`;
  };
  const intended = new Map<string, [string, string]>();
  for (const key of intentKeys) {
    const from = resolveName(key);
    if (from === null) noteMissing(key);
    for (const nb of intent[key] ?? []) {
      const to = resolveName(nb);
      if (to === null) {
        noteMissing(nb);
        continue;
      }
      if (from === null || from === to) continue;
      const [x, y] = (rank.get(from) ?? 0) <= (rank.get(to) ?? 0) ? [from, to] : [to, from];
      intended.set(pairKey(from, to), [x, y]);
    }
  }

  // Actual interior adjacency, as the same undirected id pairs — per storey, then the
  // cross-storey edges each vertical shaft contributes.
  const actual = new Map<string, [string, string]>();
  const addActual = (a: string, b: string): void => {
    if (a === b || !rank.has(a) || !rank.has(b)) return;
    const [x, y] = (rank.get(a) ?? 0) <= (rank.get(b) ?? 0) ? [a, b] : [b, a];
    actual.set(pairKey(a, b), [x, y]);
  };
  for (const p of plans) {
    const pr = p.elements.filter((e): e is RRoom => e.kind === "room");
    const pd = p.elements.filter((e): e is RDoor => e.kind === "door");
    const po = p.elements.filter((e): e is ROpening => e.kind === "opening");
    const graph = buildInputGraph(
      pr,
      pd,
      po,
      DEFAULT_TOL,
      buildDoorAccessGraph(pr, pd, DEFAULT_TOL, undefined, po, openRunsOf(p, DEFAULT_TOL)),
    );
    for (const a of Object.keys(graph)) for (const b of graph[a] ?? []) addActual(a, b);
  }
  if (levels.length > 0) {
    for (const c of verticalConnections(levels.map((l) => ({ level: l.level, ir: l.ir })))) {
      // One edge per ADJACENT pair of the shaft's storeys: a lift serving 1/2/3 links
      // 1–2 and 2–3, never 1–3 (you pass through the intervening floor's room).
      for (let i = 1; i < c.stops.length; i++) {
        const a = roomToward(c.stops[i - 1]!, "above");
        const b = roomToward(c.stops[i]!, "below");
        if (a !== null && b !== null) addActual(a, b);
      }
    }
  }

  const byRank = (p: [string, string], qy: [string, string]): number =>
    (rank.get(p[0]) ?? 0) - (rank.get(qy[0]) ?? 0) || (rank.get(p[1]) ?? 0) - (rank.get(qy[1]) ?? 0);

  const missing: [string, string][] = [];
  for (const [k, pair] of intended) if (!actual.has(k)) missing.push(pair);
  const extra: [string, string][] = [];
  for (const [k, pair] of actual) if (!intended.has(k)) extra.push(pair);
  missing.sort(byRank);
  extra.sort(byRank);

  return {
    ok: missingRooms.length === 0 && missing.length === 0 && extra.length === 0,
    missing_rooms: missingRooms,
    missing_connections: missing,
    extra_connections: extra,
  };
}
