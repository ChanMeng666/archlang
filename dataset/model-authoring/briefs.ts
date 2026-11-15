/**
 * The model-authoring config's procedural briefs.
 *
 * One family, `spine`: a single-storey flat whose rooms line both sides of a straight central
 * corridor (a double-loaded corridor), entered at the corridor's west end. Every room is named,
 * sized and placed by the brief, so the brief's text varies with the plan and its intent can bind
 * each room's size (`roomDimensions`). The family is deliberately NOT one of the three published
 * families (`dataset/templates.ts`): those have a small parameter space that the published splits
 * already exhaust structurally (`dataset/dedup.ts`'s fingerprint), and their nine brief templates
 * yield only 95 distinct brief texts over the published 400 authoring rows.
 *
 * As in `dataset/briefs.ts`, the brief, the reference plan and the intent descend from one ground
 * truth (a {@link PlanModel}), so they cannot drift: the reference plan must be strict-clean and
 * satisfy the intent, or the candidate is rejected. The reference plan is a satisfiability witness
 * only; no row publishes it (a model writes the row's plan).
 *
 * Imports only the pure core surface (`../../src/index.js`) and the dataset's own modules.
 * No I/O, no clock, no entropy randomness: every value flows from the seeded RNG.
 */

import type { Intent } from "../../src/index.js";
import { type Rng, pick, randint, randstep } from "../rng.js";
import type { OpeningModel, PlanModel, RoomModel, WallModel } from "../templates.js";

/** One room the brief names, in brief order (west to east, north side then south side). */
export interface BriefRoom {
  id: string;
  label: string;
  /** The intent concept this room satisfies. */
  concept: "bedroom" | "study" | "living-room" | "dining";
  /** The `uses` tag the reference plan gives it. */
  use: "bedroom" | "office" | "living" | "dining";
  side: "north" | "south";
  widthMm: number;
  depthMm: number;
}

/** The structured parameters a brief was written from (published as `brief_params`). */
export interface BriefParams {
  family: "spine";
  /** Which phrasing template was used (0-based). */
  template: number;
  plan_width_mm: number;
  plan_depth_mm: number;
  corridor_width_mm: number;
  corridor_label: string;
  rooms: {
    label: string;
    concept: string;
    side: "north" | "south";
    width_mm: number;
    depth_mm: number;
  }[];
  /** The rounded total floor area (m²) the brief states. */
  stated_total_m2: number;
}

export interface SpineBrief {
  brief: string;
  intent: Intent;
  params: BriefParams;
  /** The reference plan: the satisfiability witness (never published). */
  plan: PlanModel;
}

const NAMES = ["Spine Flat", "Gallery Flat", "Through Flat", "Linear Flat", "Lane Flat", "Mews Flat"];
const CORRIDOR_LABELS = ["Corridor", "Central Corridor", "Passage", "Gallery Corridor"];

/** A length in mm as metres in a brief: `3400` -> `3.4 m`, `3000` -> `3.0 m`. */
const metres = (mm: number): string => `${(mm / 1000).toFixed(1)} m`;

/** Room kinds a brief can name. `bedroom` repeats (numbered); the others appear at most once. */
type Kind = "bedroom" | "study" | "living" | "dining";

const KIND_INFO: Record<Kind, { concept: BriefRoom["concept"]; use: BriefRoom["use"]; label: string }> = {
  bedroom: { concept: "bedroom", use: "bedroom", label: "Bedroom" },
  study: { concept: "study", use: "office", label: "Study" },
  living: { concept: "living-room", use: "living", label: "Living Room" },
  dining: { concept: "dining", use: "dining", label: "Dining Room" },
};

/** Draw `n` room widths (mm) on a 100 mm step that sum to `total`, each in [lo, hi]. Each draw
 *  is narrowed so the remainder stays splittable; null only when `total` itself cannot be split
 *  (the caller rejects the candidate and counts it). All of `total`, `lo`, `hi` are multiples
 *  of 100. */
function splitWidths(rng: Rng, n: number, total: number, lo: number, hi: number): number[] | null {
  if (total < n * lo || total > n * hi) return null;
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < n - 1; i++) {
    const rest = n - 1 - i;
    const a = Math.max(lo, left - rest * hi);
    const b = Math.min(hi, left - rest * lo);
    const w = randstep(rng, a, b, 100);
    out.push(w);
    left -= w;
  }
  out.push(left);
  return out;
}

/** The kinds for `count` rooms: at most one living, dining and study; bedrooms fill the rest,
 *  and there is always at least one bedroom. Order is shuffled by the RNG. */
function drawKinds(rng: Rng, count: number): Kind[] {
  const optional: Kind[] = ["living", "dining", "study"];
  const kinds: Kind[] = ["bedroom"];
  for (const k of optional) if (kinds.length < count && rng() < 0.7) kinds.push(k);
  while (kinds.length < count) kinds.push("bedroom");
  // Fisher-Yates over the seeded RNG.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = kinds[i] as Kind;
    kinds[i] = kinds[j] as Kind;
    kinds[j] = t;
  }
  return kinds;
}

/** Generate the spine reference plan and its named rooms, or null on a missed draw. */
function genSpine(rng: Rng): { plan: PlanModel; rooms: BriefRoom[]; corridorMm: number; corridorLabel: string } | null {
  const nNorth = randint(rng, 2, 3);
  const depthN = randstep(rng, 3000, 4500, 100);
  const depthS = randstep(rng, 3000, 4500, 100);
  const corr = randstep(rng, 1400, 2000, 100);
  const north: number[] = [];
  for (let i = 0; i < nNorth; i++) north.push(randstep(rng, 2800, 4200, 100));
  const w = north.reduce((s, x) => s + x, 0);
  // The south row takes 2 or 3 rooms, whichever counts can split the north row's width.
  const feasible = [2, 3].filter((n) => w >= n * 2800 && w <= n * 4200);
  if (feasible.length === 0) return null;
  const nSouth = pick(rng, feasible);
  const south = splitWidths(rng, nSouth, w, 2800, 4200);
  if (!south) return null;
  const h = depthN + corr + depthS;
  const corrY = depthN;
  const southY = depthN + corr;

  const kinds = drawKinds(rng, nNorth + nSouth);
  const bedrooms = kinds.filter((k) => k === "bedroom").length;
  let bedNo = 0;
  const rooms: BriefRoom[] = [];
  let x = 0;
  const sides: { side: "north" | "south"; widths: number[]; depth: number }[] = [
    { side: "north", widths: north, depth: depthN },
    { side: "south", widths: south, depth: depthS },
  ];
  let ki = 0;
  for (const s of sides) {
    x = 0;
    for (const wd of s.widths) {
      const kind = kinds[ki++] as Kind;
      const info = KIND_INFO[kind];
      const label = kind === "bedroom" ? (bedrooms > 1 ? `${info.label} ${++bedNo}` : info.label) : info.label;
      rooms.push({
        id: `r${rooms.length + 1}`,
        label,
        concept: info.concept,
        use: info.use,
        side: s.side,
        widthMm: wd,
        depthMm: s.depth,
      });
      x += wd;
    }
  }
  const corridorLabel = pick(rng, CORRIDOR_LABELS);

  const walls: WallModel[] = [
    {
      id: "w_ext",
      kind: "exterior",
      thickness: 200,
      close: true,
      points: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
    },
    {
      id: "w_cn",
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: 0, y: corrY },
        { x: w, y: corrY },
      ],
    },
    {
      id: "w_cs",
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: 0, y: southY },
        { x: w, y: southY },
      ],
    },
  ];
  const planRooms: RoomModel[] = [];
  const openings: OpeningModel[] = [];
  let i = 0;
  for (const s of sides) {
    x = 0;
    for (let j = 0; j < s.widths.length; j++) {
      const wd = s.widths[j] as number;
      const r = rooms[i++] as BriefRoom;
      const top = s.side === "north" ? 0 : southY;
      if (j > 0) {
        walls.push({
          id: `w_${s.side}${j}`,
          kind: "partition",
          thickness: 100,
          close: false,
          points: [
            { x, y: top },
            { x, y: top + s.depth },
          ],
        });
      }
      planRooms.push({ id: r.id, at: { x, y: top }, size: { w: wd, h: s.depth }, label: r.label, uses: [r.use] });
      openings.push({
        kind: "door",
        id: `d_${r.id}`,
        at: { x: x + Math.round(wd / 2 / 50) * 50, y: s.side === "north" ? corrY : southY },
        width: 900,
        wall: s.side === "north" ? "w_cn" : "w_cs",
        hinge: "left",
        swingInto: r.id,
      });
      openings.push({
        kind: "window",
        id: `win_${r.id}`,
        at: { x: x + Math.round(wd / 2 / 100) * 100, y: s.side === "north" ? 0 : h },
        width: 1200,
        wall: "exterior",
      });
      x += wd;
    }
  }
  planRooms.push({ id: "r_corr", at: { x: 0, y: corrY }, size: { w, h: corr }, label: corridorLabel, uses: ["hall"] });
  openings.push({
    kind: "door",
    id: "d_main",
    at: { x: 0, y: corrY + Math.round(corr / 2 / 50) * 50 },
    width: 900,
    wall: "exterior",
    hinge: "left",
    swingInto: "r_corr",
  });
  const plan: PlanModel = {
    family: "spine",
    name: pick(rng, NAMES),
    grid: 50,
    walls,
    rooms: planRooms,
    openings,
    furniture: [],
  };
  return { plan, rooms, corridorMm: corr, corridorLabel };
}

/** A room as the brief names it: `"Bedroom 1" (3.4 m × 4.1 m)`. */
const roomPhrase = (r: BriefRoom): string => `"${r.label}" (${metres(r.widthMm)} × ${metres(r.depthMm)})`;

/** Join phrases as English: `a, b and c`. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The phrasing templates. Each returns the brief text and the verbatim phrases its intent
 *  quotes as `source` (the schema's citation rule). */
type Template = (a: {
  n: number;
  north: string;
  south: string;
  corridor: string;
  corridorLabel: string;
  total: number;
}) => { text: string; areaPhrase: string; adjPhrase: string };

const TEMPLATES: Template[] = [
  (a) => ({
    text:
      `Draw a single-storey flat of ${a.n} spaces in all, counting a straight central corridor named "${a.corridorLabel}" ` +
      `that is ${a.corridor} wide and entered by a front door at its west end. Along the north side of the corridor, ` +
      `from west to east: ${a.north}. Along the south side, from west to east: ${a.south}. Room sizes are width by ` +
      `depth on wall centrelines. Each room opens off the corridor by its own door and has one window in its outside ` +
      `wall. The floor comes to about ${a.total} square metres.`,
    areaPhrase: `about ${a.total} square metres`,
    adjPhrase: "Each room opens off the corridor by its own door",
  }),
  (a) => ({
    text:
      `I'd like a flat laid out on a double-loaded corridor: one passage called "${a.corridorLabel}", ${a.corridor} ` +
      `across, runs east to west and the entrance is at its western end. North of it sit ${a.north}, listed west to ` +
      `east; south of it sit ${a.south}, also west to east (sizes are width × depth, measured to wall centrelines). ` +
      `That is ${a.n} spaces including the corridor. Every room gets a door onto the corridor and a window to the ` +
      `outside, and the total floor area is close to ${a.total} m².`,
    areaPhrase: `close to ${a.total} m²`,
    adjPhrase: "Every room gets a door onto the corridor",
  }),
  (a) => ({
    text:
      `Set out ${a.n} spaces on one floor. A central corridor, "${a.corridorLabel}", ${a.corridor} wide, crosses the ` +
      `plan from its west entrance door to the east wall. On its north side, west to east, put ${a.north}; on its ` +
      `south side, west to east, put ${a.south}. Sizes are given as width by depth to wall centrelines. Each room ` +
      `is reached from the corridor through a door of its own and is lit by a single window on the outer wall, and ` +
      `the whole comes to roughly ${a.total} square metres.`,
    areaPhrase: `roughly ${a.total} square metres`,
    adjPhrase: "Each room is reached from the corridor through a door of its own",
  }),
];

/** A ±10% band around a stated whole-number area (the `dataset/briefs.ts` convention). */
function band10(n: number, phrase: string): { min: number; max: number; source: string } {
  return { min: Math.round(n * 0.9 * 10) / 10, max: Math.round(n * 1.1 * 10) / 10, source: phrase };
}

/** Exact room sizes bind within this many mm per side (model rounding slack). */
export const SIZE_TOLERANCE_MM = 100;

/** Build one spine brief from a seeded RNG, or null on a missed draw. */
export function spineBrief(rng: Rng): SpineBrief | null {
  const g = genSpine(rng);
  if (!g) return null;
  const { plan, rooms, corridorMm, corridorLabel } = g;
  const total = Math.round(plan.rooms.reduce((s, r) => s + (r.size.w * r.size.h) / 1_000_000, 0));
  const tIndex = Math.floor(rng() * TEMPLATES.length);
  const template = TEMPLATES[tIndex] as Template;
  const north = rooms.filter((r) => r.side === "north");
  const south = rooms.filter((r) => r.side === "south");
  const n = rooms.length + 1;
  const t = template({
    n,
    north: listOf(north.map(roomPhrase)),
    south: listOf(south.map(roomPhrase)),
    corridor: metres(corridorMm),
    corridorLabel,
    total,
  });

  // One roomsInclude entry per concept, in first-appearance order, each room with a window.
  const concepts: string[] = [];
  for (const r of rooms) if (!concepts.includes(r.concept)) concepts.push(r.concept);
  const intent: Intent = {
    rooms: n,
    roomsInclude: [
      ...concepts.map((c) => {
        const k = rooms.filter((r) => r.concept === c).length;
        return { concept: c, count: { min: k }, windows: { min: k } };
      }),
      { concept: "corridor" },
    ],
    totalAreaM2: band10(total, `brief: '${t.areaPhrase}' ±10%`),
    roomDimensions: rooms.map((r) => ({
      room: r.label,
      sizeMm: { w: r.widthMm, h: r.depthMm, tolerance: SIZE_TOLERANCE_MM, source: `brief: '${roomPhrase(r)}'` },
    })),
    adjacency: {
      requiredEdges: { corridor: concepts },
      source: `brief: '${t.adjPhrase}'`,
    },
    reachable: true,
  };
  const params: BriefParams = {
    family: "spine",
    template: tIndex,
    plan_width_mm: plan.walls[0]!.points[1]!.x,
    plan_depth_mm: plan.walls[0]!.points[2]!.y,
    corridor_width_mm: corridorMm,
    corridor_label: corridorLabel,
    rooms: rooms.map((r) => ({
      label: r.label,
      concept: r.concept,
      side: r.side,
      width_mm: r.widthMm,
      depth_mm: r.depthMm,
    })),
    stated_total_m2: total,
  };
  return { brief: t.text, intent, params, plan };
}
