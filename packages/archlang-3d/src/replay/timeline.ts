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
 *              furniture rise after the walls; the roof stays hidden. The end frame is fitted to
 *              the building (`camera.ts`), so it fills the canvas.
 *
 * Views (owner's look notes round 1, D14). A plan of several storeys replays each storey on its
 * own (`viewMesh(mesh, n)`: its nodes only, over its own page of the core's drawing) and the storeys
 * combined (`"all"`, the default). In the combined view phase 1 draws the lowest storey under page
 * 1, and the rise is cut into one slot per storey, lowest first: a storey's slab appears only when
 * the storey below is fully up, furniture included.
 *
 * The combined view keeps the lower floors readable with EXPLODED STOREYS plus CAMERA STOPS, chosen
 * by looking at rendered frames of two-storey and townhouse:
 *   - each storey is lifted `EXPLODE_GAP_MM` (3 m, about one storey) above the one below, and the
 *     end camera looks down at 45° instead of 30°, so the floor below shows through the gap;
 *   - the camera frames the storeys built so far: when storey k is fully up it fills the frame with
 *     storeys 1…k; the next storey's slot opens with a lead-in (`STOP_LEAD`) in which the camera
 *     pulls back and nothing new shows. So the ground floor fills the frame, furniture and all, and
 *     is seen whole from the wider framing before the storey above appears over it.
 * Rendered and rejected: exploded storeys alone (no stops), which left the ground floor small and
 * half covered at its only full view, the end frame; a 2.4 m gap at 42°, which hid more of it; and
 * stops without a lead-in, where the upper slab appeared at once over the close-framed floor and
 * filled the frame before the camera could pull back.
 * Considered, not built: upper storeys fading (translucent walls over a furnished floor; neither
 * storey reads cleanly) and a cutaway (it removes the storey the viewer just watched rise).
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
  /**
   * The node's storey, 0-based from the lowest; present only when the replay has more than one
   * storey (the combined view), where it sets the camera's stops (`stateAt`).
   */
  storey?: number;
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

/** The storeys the replay can show on their own: the visible nodes' levels, ascending. */
export function storeysOf(mesh: Mesh3D): number[] {
  return [...new Set(mesh.nodes.filter((n) => !n.hidden).map((n) => n.level))].sort((a, b) => a - b);
}

/** Which replay: the storeys combined (`"all"`), or storey `n` on its own (1-based, ascending). */
export type ReplayView = "all" | number;

/** The label a view carries in reports: `all` or `storey:<n>`. */
export const viewLabel = (v: ReplayView): string => (v === "all" ? "all" : `storey:${v}`);

/**
 * The mesh a view replays. The combined view is the whole mesh; storey `n` is that storey's nodes
 * alone (every other storey is absent, not hidden). A one-storey plan's two views are the same mesh,
 * so they replay byte for byte the same.
 */
export function viewMesh(mesh: Mesh3D, view: ReplayView): Mesh3D {
  if (view === "all") return mesh;
  const levels = storeysOf(mesh);
  const level = levels[view - 1];
  if (!Number.isInteger(view) || level === undefined)
    throw new RangeError(`storey ${view} is not in the plan (it has ${levels.length})`);
  if (levels.length === 1) return mesh;
  return { ...mesh, nodes: mesh.nodes.filter((n) => n.level === level) };
}

/**
 * The combined view's exploded storeys: how far (mm) each storey is lifted above where it stands, so
 * a gap opens between it and the storey below (see the header). Storey `i` (0-based) is lifted
 * `i × EXPLODE_GAP_MM`; a one-storey mesh lifts nothing.
 */
export const EXPLODE_GAP_MM = 3000;
export function explodeLifts(mesh: Mesh3D): Map<number, number> {
  return new Map(storeysOf(mesh).map((l, i) => [l, i * EXPLODE_GAP_MM] as const));
}

/**
 * The combined view: the share of an upper storey's slot spent on its lead-in, in which the camera
 * pulls back from the finished storey below before anything of the new storey shows.
 */
export const STOP_LEAD = 0.35;

/** `a` at f = 0, `b` at f = 1, exactly. */
const lerp = (a: number, b: number, f: number): number => a * (1 - f) + b * f;

/**
 * The replay's event table: every node, when it appears and when it rises.
 *
 * Phase 1 draws the LOWEST storey only: it is the storey the drawing that fades in shows (page 1 of
 * the core's drawing, or the storey's own page in a storey view), so the footprints and the drawing
 * are the same plan. The rise is then cut into one slot per storey, lowest first: a storey's slab
 * and floors appear as its slot opens, its walls rise (each opening with its host wall), then its
 * fixtures and furniture, and the slot closes when the last of them is up. A storey above therefore
 * starts only once the storey below is fully up. A one-storey mesh has one slot: the whole rise.
 */
export function timeline(mesh: Mesh3D): ReplayEvent[] {
  const order = authoringOrder(mesh);
  const visible = order.filter((n) => !n.hidden);
  const levels = storeysOf(mesh);
  const lowest = levels[0];
  const drawn = visible.filter((n) => n.level === lowest);
  const appearStep = PHASE.drawn / Math.max(1, drawn.length);
  const appearOf = new Map(drawn.map((n, i) => [n.key, i * appearStep] as const));
  const stagger = (list: MeshNode[], from: number, to: number): Map<string, [number, number]> => {
    const span = to - from;
    const each = list.length > 0 ? span / (list.length + 2) : 0;
    return new Map(list.map((n, i) => [n.key, [from + i * each, from + i * each + 3 * each] as [number, number]]));
  };
  // Slot i of N: [start, wallsUp, end]. One storey keeps PHASE's own boundaries exactly.
  const N = Math.max(1, levels.length);
  const share = (PHASE.wallsUp - PHASE.rise) / (PHASE.done - PHASE.rise);
  const slotOf = new Map<number, [number, number, number]>();
  levels.forEach((l, i) => {
    const from = lerp(PHASE.rise, PHASE.done, i / N);
    const b = lerp(PHASE.rise, PHASE.done, (i + 1) / N);
    // A storey above opens with a lead-in, in which nothing of it shows and the camera pulls back
    // from the finished storey below (`stateAt`'s stops).
    const a = i === 0 ? from : lerp(from, b, STOP_LEAD);
    slotOf.set(l, [a, N === 1 ? PHASE.wallsUp : lerp(a, b, share), b]);
  });
  const slot = (level: number): [number, number, number] =>
    slotOf.get(level) ?? [PHASE.rise, PHASE.wallsUp, PHASE.done];
  const wallRise = new Map<string, [number, number]>();
  const thingRise = new Map<string, [number, number]>();
  for (const l of levels) {
    const [a, w, b] = slot(l);
    const here = visible.filter((n) => n.level === l);
    for (const [k, r] of stagger(
      here.filter((n) => n.kind === "wall" || n.kind === "column"),
      a,
      w,
    ))
      wallRise.set(k, r);
    for (const [k, r] of stagger(
      here.filter((n) => n.kind === "furniture"),
      w,
      b,
    ))
      thingRise.set(k, r);
  }
  const hostRise = new Map<string, [number, number]>();
  for (const n of visible) {
    const r = wallRise.get(n.key);
    if (r) hostRise.set(`${n.level}/${n.id}`, r);
  }
  return order.map((n, rank) => {
    const [a, w] = slot(n.level);
    let rise: [number, number];
    if (wallRise.has(n.key)) rise = wallRise.get(n.key) as [number, number];
    else if (thingRise.has(n.key)) rise = thingRise.get(n.key) as [number, number];
    else if (n.kind === "door" || n.kind === "window")
      rise = hostRise.get(`${n.level}/${String(n.extras.host)}`) ?? [a, w];
    else if (isFlat(n)) {
      const at = appearOf.get(n.key) ?? a;
      rise = [at, at];
    } else rise = [a, w];
    // A node of the lowest storey appears in phase 1; any other appears as it starts to rise.
    const appear = n.hidden ? 1 : (appearOf.get(n.key) ?? rise[0]);
    return {
      key: n.key,
      stage: n.stage,
      rank,
      appear,
      riseFrom: rise[0],
      riseTo: rise[1],
      hidden: n.hidden === true,
      ...(N > 1 ? { storey: levels.indexOf(n.level) } : {}),
    };
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
  /** 0…1 along the dolly (to the first camera stop). */
  dolly: number;
  /**
   * The combined view's camera stop, 0…storeys − 1: at k the camera frames storeys 0…k; between
   * stops it moves from one framing to the next. Always 0 for one storey.
   */
  stop: number;
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
  // The camera's stops: storey k is fully up at ends[k], and storey k+1 first shows at starts[k+1].
  // One storey: no stops, and the dolly runs to the end.
  const ends: number[] = [];
  const starts: number[] = [];
  for (const e of events) {
    if (e.storey === undefined || e.hidden) continue;
    ends[e.storey] = Math.max(ends[e.storey] ?? 0, e.riseTo);
    starts[e.storey] = Math.min(starts[e.storey] ?? 1, e.appear);
  }
  const first = ends[0] ?? 1;
  // Between stops the camera pulls back in the lead-in: from storey k fully up to storey k+1's
  // first footprint, so the storey below is seen whole before the one above closes over it.
  let stop = 0;
  for (let k = 1; k < ends.length; k++) {
    const a = ends[k - 1] as number;
    const b = starts[k] as number;
    if (u > a) stop = k - 1 + (b > a ? ease((u - a) / (b - a)) : 1);
  }
  return {
    // The tilt is done by the first stop, so every stop sees the end orbit its camera was fitted for
    // (one storey: `first` is 1 and the tilt keeps PHASE's own timing).
    tilt: ease((u - PHASE.rise) / (Math.min(PHASE.tilted, first) - PHASE.rise)),
    dolly: ease((u - PHASE.rise) / (first - PHASE.rise)),
    stop,
    svg,
    nodes,
  };
}

/**
 * The key frames: when each stage first shows, the drawing, the tilt, then (combined view only)
 * each upper storey's first footprint (`storey:<n>`) and each camera stop (`stop:<n>`, storey n
 * fully up; n is 1-based), and the end.
 */
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
  out.push({ label: "drawing", t: PHASE.svgIn }, { label: "tilted", t: PHASE.tilted });
  // The combined view: each camera stop (storey k fully up) and each upper storey's first footprint.
  const ends: number[] = [];
  const starts: number[] = [];
  for (const e of events) {
    if (e.storey === undefined || e.hidden) continue;
    ends[e.storey] = Math.max(ends[e.storey] ?? 0, e.riseTo);
    starts[e.storey] = Math.min(starts[e.storey] ?? 1, e.appear);
  }
  ends.forEach((t, k) => {
    if (k >= 1) out.push({ label: `storey:${k + 1}`, t: starts[k] as number });
    out.push({ label: `stop:${k + 1}`, t });
  });
  out.push({ label: "end", t: 1 });
  // In time order (a stable sort: one storey's list is already in order, and unchanged).
  return out.sort((a, b) => a.t - b.t);
}
