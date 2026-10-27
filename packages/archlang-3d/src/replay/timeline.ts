/**
 * The replay as a pure function of time (card A3; archlang-3d plan §6.5; decision D3). The plan
 * draws itself in its authoring order, then rises:
 *
 *   0.00–0.40  top-down: each node's footprint appears, flat, in stage order
 *              brief (slab) → rooms (floors) → walls (columns, exterior walls, the rest) →
 *              openings (doors, windows) → fixtures (catalogued fixtures, then loose furniture);
 *              source order inside a group;
 *   0.40–0.55  the core's own drawing (its SVG) fades in over the footprints and holds;
 *   0.55–1.00  the drawing fades out as the camera tilts to a 30° elevation with a narrow-lens
 *              dolly; walls rise in the same order, each opening with its host wall; fixtures and
 *              furniture rise after the walls; the roof stays hidden.
 *
 * Nothing here reads a clock or a random source: `stateAt(events, t)` is the whole state, so a
 * frame at `t` is the same frame however it was reached (`__seek`, plan §6.5).
 */
import type { Mesh3D, MeshNode, Stage } from "../mesh/types.js";

export const PHASE = {
  /** Footprints have all appeared. */
  drawn: 0.4,
  /** The core's drawing is fully over the footprints. */
  svgIn: 0.5,
  /** The drawing starts to fade and the camera to tilt. */
  rise: 0.55,
  /** The drawing is gone. */
  svgOut: 0.62,
  /** The camera has finished tilting (the dolly continues). */
  tilted: 0.78,
  /** Every wall has risen; fixtures rise from here. */
  wallsUp: 0.84,
  /** Everything has risen. */
  done: 0.96,
} as const;

/**
 * Catalogued wet-room and kitchen fixtures: they rise before loose furniture (D3). A replay
 * grouping only; the core's catalogue is the authority for what a family is.
 */
export const FIXTURE_FAMILIES: ReadonlySet<string> = new Set([
  "wc",
  "basin",
  "bath",
  "shower",
  "bidet",
  "urinal",
  "kitchen_sink",
  "stove",
  "hob",
  "oven",
  "fridge",
  "counter",
  "dishwasher",
  "washing_machine",
  "dryer",
]);

const STAGES: readonly Stage[] = ["brief", "rooms", "walls", "openings", "fixtures", "drafting"];

/** One node's place in the replay. Times are fractions of the replay, 0…1. */
export interface ReplayEvent {
  key: string;
  stage: Stage;
  /** Position in the authoring order (0-based), the order footprints appear in. */
  rank: number;
  /** When its footprint appears (phase 1). */
  appear: number;
  /** When it starts and finishes rising; equal for a node that is flat from the start. */
  riseFrom: number;
  riseTo: number;
  hidden: boolean;
}

/** The sub-order inside a stage (D3): lower first. */
function groupOf(n: MeshNode): number {
  switch (n.kind) {
    case "slab":
      return 0;
    case "floor":
      return 0;
    case "column":
      return 0;
    case "wall":
      return n.extras.category === "exterior" ? 1 : 2;
    case "roof":
      return 3;
    case "door":
      return 0;
    case "window":
      return n.part === "frame" ? 1 : 2;
    case "opening":
      return 3;
    case "furniture":
      return FIXTURE_FAMILIES.has(String(n.extras.category)) ? 0 : 1;
  }
}

/** Nodes that are flat from the start and never rise (they are what the plan draws on). */
const isFlat = (n: MeshNode): boolean => n.kind === "slab" || n.kind === "floor";

/** The authoring order of the mesh's nodes: stage, sub-group, storey, source order, key. */
export function authoringOrder(mesh: Mesh3D): MeshNode[] {
  return [...mesh.nodes].sort(
    (a, b) =>
      STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) ||
      groupOf(a) - groupOf(b) ||
      a.level - b.level ||
      a.order - b.order ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/**
 * The replay's event table: every node, when it appears and when it rises.
 *
 * Phase 1 draws the LOWEST storey only: it is the storey the core's drawing shows (page 1), so the
 * footprints and the drawing that fades in over them are the same plan. An upper storey stays out of
 * sight until the rise, then builds storey by storey: its slab and floors appear as its first wall
 * starts up, and its walls rise after the storey below (red-team, PR #330).
 */
export function timeline(mesh: Mesh3D): ReplayEvent[] {
  const order = authoringOrder(mesh);
  const visible = order.filter((n) => !n.hidden);
  const lowest = visible.reduce((m, n) => Math.min(m, n.level), Number.POSITIVE_INFINITY);
  const drawn = visible.filter((n) => n.level === lowest);
  const appearStep = PHASE.drawn / Math.max(1, drawn.length);
  const appearOf = new Map(drawn.map((n, i) => [n.key, i * appearStep] as const));
  // Walls (and what they host) rise first, storey by storey, then fixtures and furniture, each group
  // staggered in order.
  const byLevel = (list: MeshNode[]) => [...list].sort((a, b) => a.level - b.level);
  const walls = byLevel(visible.filter((n) => n.kind === "wall" || n.kind === "column"));
  const things = byLevel(visible.filter((n) => n.kind === "furniture"));
  const stagger = (list: MeshNode[], from: number, to: number): Map<string, [number, number]> => {
    const span = to - from;
    const each = list.length > 0 ? span / (list.length + 2) : 0;
    return new Map(list.map((n, i) => [n.key, [from + i * each, from + i * each + 3 * each] as [number, number]]));
  };
  const wallRise = stagger(walls, PHASE.rise, PHASE.wallsUp);
  const thingRise = stagger(things, PHASE.wallsUp, PHASE.done);
  const hostRise = new Map<string, [number, number]>();
  const levelStart = new Map<number, number>();
  for (const w of walls) {
    const r = wallRise.get(w.key);
    if (!r) continue;
    hostRise.set(`${w.level}/${w.id}`, r);
    if (!levelStart.has(w.level)) levelStart.set(w.level, r[0]);
  }
  return order.map((n, rank) => {
    let rise: [number, number];
    if (wallRise.has(n.key)) rise = wallRise.get(n.key) as [number, number];
    else if (thingRise.has(n.key)) rise = thingRise.get(n.key) as [number, number];
    else if (n.kind === "door" || n.kind === "window")
      rise = hostRise.get(`${n.level}/${String(n.extras.host)}`) ?? [PHASE.rise, PHASE.wallsUp];
    else if (isFlat(n)) {
      const at = appearOf.get(n.key) ?? levelStart.get(n.level) ?? PHASE.rise;
      rise = [at, at];
    } else rise = [PHASE.rise, PHASE.wallsUp];
    // A node of the lowest storey appears in phase 1; any other appears as it starts to rise.
    const appear = n.hidden ? 1 : (appearOf.get(n.key) ?? rise[0]);
    return { key: n.key, stage: n.stage, rank, appear, riseFrom: rise[0], riseTo: rise[1], hidden: n.hidden === true };
  });
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Smoothstep easing, written out (no animation library). */
export const ease = (x: number): number => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export interface NodeState {
  visible: boolean;
  /** Vertical scale, 0…1 (a footprint is drawn at a hair above 0). */
  rise: number;
}

export interface ReplayState {
  /** 0 = straight down, 1 = the final 30° perspective. */
  tilt: number;
  /** 0…1 along the dolly. */
  dolly: number;
  /** Opacity of the core's drawing over the scene. */
  svg: number;
  nodes: Map<string, NodeState>;
}

/** The whole state of the replay at `t` (0…1): a pure function of `t` and the event table. */
export function stateAt(events: readonly ReplayEvent[], t: number): ReplayState {
  const u = clamp01(t);
  const svg =
    u < PHASE.drawn
      ? 0
      : u < PHASE.svgIn
        ? ease((u - PHASE.drawn) / (PHASE.svgIn - PHASE.drawn))
        : u < PHASE.rise
          ? 1
          : 1 - ease((u - PHASE.rise) / (PHASE.svgOut - PHASE.rise));
  const nodes = new Map<string, NodeState>();
  for (const e of events) {
    const visible = !e.hidden && u >= e.appear;
    const rise = e.riseTo <= e.riseFrom ? (u >= e.riseFrom ? 1 : 0) : ease((u - e.riseFrom) / (e.riseTo - e.riseFrom));
    nodes.set(e.key, { visible, rise });
  }
  return {
    tilt: ease((u - PHASE.rise) / (PHASE.tilted - PHASE.rise)),
    dolly: ease((u - PHASE.rise) / (1 - PHASE.rise)),
    svg,
    nodes,
  };
}

/** The times at which a stage first shows, for key frames: one per stage boundary, then the end. */
export function keyFrames(events: readonly ReplayEvent[]): Array<{ label: string; t: number }> {
  const first = (s: Stage): number | undefined =>
    events
      .filter((e) => e.stage === s && !e.hidden)
      .reduce<number | undefined>((m, e) => (m === undefined || e.appear < m ? e.appear : m), undefined);
  const out: Array<{ label: string; t: number }> = [];
  for (const s of STAGES) {
    const t = first(s);
    if (t !== undefined) out.push({ label: `stage:${s}`, t });
  }
  out.push({ label: "drawing", t: PHASE.svgIn }, { label: "tilted", t: PHASE.tilted }, { label: "end", t: 1 });
  return out;
}
