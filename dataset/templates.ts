/**
 * Procedural `.arch` plan generator for the dataset.
 *
 * A template family produces a {@link PlanModel} — a structured, fully-literal plan
 * (no `let`/`for`/scripting, because `repair()` declines scripted sources) — from a
 * seeded RNG. {@link emit} serializes it to `.arch` text. Every base plan the generator
 * hands out is asserted **strict-clean** ({@link isStrictClean}): zero compile errors,
 * zero compile warnings, AND zero `lint` warnings — the exact bar `arch validate --strict`
 * sets. A candidate that misses the bar is rejected by the caller (never silently kept).
 *
 * The layouts are modelled on the shape of `eval/faults/*.arch` and the shipped goldens
 * (a single exterior wall loop, rooms, doors on walls, windows, a movable furniture
 * piece), but the labels/dimensions/geometry are independent — nothing here is copied
 * from the private holdout corpus.
 *
 * Imports only the pure core surface (`../src/index.js`). No I/O, no clock, no
 * entropy-seeded randomness.
 */

import { compile, lint } from "../src/index.js";
import { CANARY_COMMENT } from "./canary.js";
import { type Rng, pick, randstep } from "./rng.js";

// ---------------------------------------------------------------------------
// The structured plan model (the intermediate a fault injector perturbs).
// ---------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

export interface WallModel {
  id: string;
  kind: "exterior" | "partition";
  thickness: number;
  points: Pt[];
  /** Close the polyline back to the first point (exterior loops). */
  close: boolean;
}

export interface RoomModel {
  id: string;
  at: Pt;
  size: Size;
  label: string;
  uses: string[];
}

export type OpeningKind = "door" | "window" | "opening";

export interface OpeningModel {
  kind: OpeningKind;
  id: string;
  at: Pt;
  width: number;
  /** Host wall reference: `"exterior"` (category) or a partition wall id. */
  wall: string;
  hinge?: "left" | "right";
  swing?: "in" | "out";
  /** `swing into <roomId>` — opens the leaf toward a named room (unambiguous, so a
   *  door on a wall between two spaces sweeps its own room, not the circulation). */
  swingInto?: string;
}

export interface FurnitureModel {
  id: string;
  category: string;
  at: Pt;
  size: Size;
  label?: string;
  /** True for the single piece a repair-fault is injected onto. */
  movable?: boolean;
}

export interface PlanModel {
  family: string;
  name: string;
  grid: number;
  walls: WallModel[];
  rooms: RoomModel[];
  openings: OpeningModel[];
  furniture: FurnitureModel[];
}

/** The template families the generator can draw from. */
export const FAMILIES = ["studio", "hall-flat", "corridor"] as const;
export type Family = (typeof FAMILIES)[number];

// ---------------------------------------------------------------------------
// Emission — PlanModel -> .arch source (fully literal, canary-commented).
// ---------------------------------------------------------------------------

const pt = (p: Pt): string => `(${p.x},${p.y})`;

function emitWall(w: WallModel): string {
  const pts = w.points.map(pt).join(" ");
  const body = w.close ? `${pts} close` : pts;
  return `  wall id=${w.id} ${w.kind} thickness ${w.thickness} { ${body} }`;
}

function emitRoom(r: RoomModel): string {
  const uses = r.uses.length ? ` uses ${r.uses.join(" ")}` : "";
  return `  room id=${r.id} at ${pt(r.at)} size ${r.size.w}x${r.size.h} label "${r.label}"${uses}`;
}

function emitOpening(o: OpeningModel): string {
  let tail = "";
  if (o.kind === "door") {
    if (o.hinge) tail += ` hinge ${o.hinge}`;
    if (o.swingInto) tail += ` swing into ${o.swingInto}`;
    else if (o.swing) tail += ` swing ${o.swing}`;
  }
  return `  ${o.kind} id=${o.id} at ${pt(o.at)} width ${o.width} wall ${o.wall}${tail}`;
}

function emitFurniture(f: FurnitureModel): string {
  const label = f.label ? ` label "${f.label}"` : "";
  return `  furniture ${f.category} at ${pt(f.at)} size ${f.size.w}x${f.size.h}${label}`;
}

/**
 * Serialize a {@link PlanModel} to `.arch` source. The first line is always the
 * {@link CANARY_COMMENT} so a source-only scrape still carries the canary; it is a plan
 * comment and does not affect compilation.
 */
export function emit(plan: PlanModel): string {
  const lines: string[] = [
    CANARY_COMMENT,
    `plan "${plan.name}" {`,
    "  units mm",
    `  grid ${plan.grid}`,
    "  north up",
    "",
    ...plan.walls.map(emitWall),
    "",
    ...plan.rooms.map(emitRoom),
    "",
    ...plan.openings.map(emitOpening),
  ];
  if (plan.furniture.length) {
    lines.push("", ...plan.furniture.map(emitFurniture));
  }
  lines.push("}", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Strict-clean check (mirrors `arch validate --strict`: 0 errors, 0 warnings).
// ---------------------------------------------------------------------------

/** All codes a source raises (compile diagnostics + lint warnings), deduplicated. */
export function allCodes(source: string): string[] {
  const codes = new Set<string>();
  for (const d of compile(source).diagnostics) if (d.code) codes.add(d.code);
  for (const d of lint(source)) if (d.code) codes.add(d.code);
  return [...codes];
}

/**
 * True when `source` is strict-clean: it compiles with no errors AND no warnings, and
 * `lint` finds nothing. This is exactly what `cmdValidate` + `--strict` require (a
 * warning fails `report` under `--strict`), so an accepted base plan would pass
 * `arch validate --strict`.
 */
export function isStrictClean(source: string): boolean {
  const { diagnostics } = compile(source);
  if (diagnostics.length > 0) return false; // any error OR warning fails strict
  return lint(source).length === 0;
}

// ---------------------------------------------------------------------------
// Label / naming pools (hand-written; independent of the holdout corpus).
// ---------------------------------------------------------------------------

const STUDIO_NAMES = ["Compact Studio", "City Studio", "Garden Studio", "Loft Studio", "Corner Studio"];
const STUDIO_LABELS = ["Studio", "Studio Room", "Main Room", "Living Space", "Open Studio"];

const FLAT_NAMES = ["Hall Flat", "Courtyard Flat", "Riverside Flat", "Terraced Flat", "Parkside Flat"];
const LIVING_LABELS = ["Living Room", "Lounge", "Sitting Room", "Living Area", "Day Room"];
const BEDROOM_LABELS = ["Bedroom", "Main Bedroom", "Double Bedroom", "Guest Bedroom", "Rear Bedroom"];
const STUDY_LABELS = ["Study", "Home Office", "Work Room", "Studio Office", "Snug"];
const HALL_LABELS = ["Hall", "Inner Hall", "Landing", "Vestibule", "Hallway"];

const CORRIDOR_NAMES = ["Consulting Wing", "Clinic Row", "Studio Row", "Treatment Suite", "Practice Wing"];
// Every row label ends in "Room" so the `consulting-room` concept (which matches the
// "room" token) resolves regardless of which label is drawn.
const ROOM_ROW_LABELS = ["Consulting Room", "Treatment Room", "Exam Room", "Practice Room", "Therapy Room"];
const CORRIDOR_LABELS = ["Corridor", "Shared Corridor", "Access Corridor", "Central Corridor"];

/** Free-standing furniture categories — none require a wall (so no W_FIXTURE_FLOATING)
 *  and none are kitchen/wet fixtures (so no clearance rule fires). */
const FURNITURE = ["sofa", "table", "desk", "bookshelf", "wardrobe", "cabinet", "bench", "chest"];

/** A display label matching the drawn category (so a `chest` is never labelled "Sofa"). */
const furnitureLabel = (category: string): string => category.charAt(0).toUpperCase() + category.slice(1);

// ---------------------------------------------------------------------------
// Family generators. Each returns a strict-clean-BY-CONSTRUCTION plan; the caller
// still verifies with isStrictClean and rejects on a miss (belt and braces).
// ---------------------------------------------------------------------------

/** A single-room studio: exterior loop, a front door, a window, one movable piece. */
function genStudio(rng: Rng): PlanModel {
  const grid = 50;
  const w = randstep(rng, 4500, 6500, 500);
  const h = randstep(rng, 4500, 6500, 500);
  const doorW = randstep(rng, 900, 1000, 50);
  const doorX = randstep(rng, 1500, w - 1500, 50);
  const winW = randstep(rng, 1000, 1600, 100);
  const winX = randstep(rng, 1200, w - 1600, 100);

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
  ];
  const rooms: RoomModel[] = [
    { id: "r_main", at: { x: 0, y: 0 }, size: { w, h }, label: pick(rng, STUDIO_LABELS), uses: ["living"] },
  ];
  const openings: OpeningModel[] = [
    { kind: "door", id: "d_main", at: { x: doorX, y: h }, width: doorW, wall: "exterior", hinge: "left", swing: "in" },
    { kind: "window", id: "win_1", at: { x: winX, y: 0 }, width: winW, wall: "exterior" },
  ];
  // Movable piece backed into the top-left corner — far from the south door and its swing.
  const fw = randstep(rng, 1400, 1800, 100);
  const cat = pick(rng, FURNITURE);
  const furniture: FurnitureModel[] = [
    {
      id: "f_move",
      category: cat,
      at: { x: 300, y: 300 },
      size: { w: fw, h: 700 },
      label: furnitureLabel(cat),
      movable: true,
    },
  ];
  return { family: "studio", name: pick(rng, STUDIO_NAMES), grid, walls, rooms, openings, furniture };
}

/** Living + bedroom + study around a small hall, with a cased opening + interior doors. */
function genHallFlat(rng: Rng): PlanModel {
  const grid = 50;
  const lw = randstep(rng, 3500, 4500, 500); // living column width
  const rw = randstep(rng, 4500, 5500, 500); // right column width
  const w = lw + rw;
  const bedH = randstep(rng, 3000, 3500, 500); // bedroom height (top-right)
  const hallH = randstep(rng, 1400, 1600, 100); // hall band height
  const studyH = randstep(rng, 1800, 2400, 200); // study height (bottom-right)
  const h = bedH + hallH + studyH;
  const hallY = bedH;
  const studyY = bedH + hallH;

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
      id: "w_spine",
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: lw, y: 0 },
        { x: lw, y: h },
      ],
    },
    {
      id: "w_bed",
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: lw, y: hallY },
        { x: w, y: hallY },
      ],
    },
    {
      id: "w_study",
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: lw, y: studyY },
        { x: w, y: studyY },
      ],
    },
  ];
  const rooms: RoomModel[] = [
    { id: "r_live", at: { x: 0, y: 0 }, size: { w: lw, h }, label: pick(rng, LIVING_LABELS), uses: ["living"] },
    { id: "r_bed", at: { x: lw, y: 0 }, size: { w: rw, h: bedH }, label: pick(rng, BEDROOM_LABELS), uses: ["bedroom"] },
    { id: "r_hall", at: { x: lw, y: hallY }, size: { w: rw, h: hallH }, label: pick(rng, HALL_LABELS), uses: ["hall"] },
    {
      id: "r_study",
      at: { x: lw, y: studyY },
      size: { w: rw, h: studyH },
      label: pick(rng, STUDY_LABELS),
      uses: ["office"],
    },
  ];
  const bedDoorX = lw + Math.round(rw / 2 / 50) * 50; // centred on the bedroom partition
  const studyDoorX = lw + Math.round(rw / 2 / 50) * 50;
  // Every door swings INTO its own room, so the leaf never sweeps the narrow hall
  // (two arcs meeting in a 1.4–1.6 m hall is what would trip W_SWING_OBSTRUCTED).
  const openings: OpeningModel[] = [
    {
      kind: "door",
      id: "d_main",
      at: { x: randstep(rng, 1200, lw - 1200, 50), y: h },
      width: 1000,
      wall: "exterior",
      hinge: "left",
      swingInto: "r_live",
    },
    {
      kind: "opening",
      id: "o_live",
      at: { x: lw, y: hallY + Math.round(hallH / 2 / 50) * 50 },
      width: 900,
      wall: "w_spine",
    },
    {
      kind: "door",
      id: "d_bed",
      at: { x: bedDoorX, y: hallY },
      width: 900,
      wall: "w_bed",
      hinge: "left",
      swingInto: "r_bed",
    },
    {
      kind: "door",
      id: "d_study",
      at: { x: studyDoorX, y: studyY },
      width: 900,
      wall: "w_study",
      hinge: "left",
      swingInto: "r_study",
    },
    {
      kind: "window",
      id: "win_bed",
      at: { x: lw + Math.round(rw / 2 / 100) * 100, y: 0 },
      width: 1200,
      wall: "exterior",
    },
    {
      kind: "window",
      id: "win_live",
      at: { x: 0, y: randstep(rng, 1500, h - 2000, 100) },
      width: 1400,
      wall: "exterior",
    },
  ];
  // Movable piece in the living room's top-left corner — clear of the south entrance swing.
  const flatCat = pick(rng, FURNITURE);
  const furniture: FurnitureModel[] = [
    {
      id: "f_move",
      category: flatCat,
      at: { x: 300, y: 300 },
      size: { w: Math.min(1800, lw - 800), h: 700 },
      label: furnitureLabel(flatCat),
      movable: true,
    },
  ];
  return { family: "hall-flat", name: pick(rng, FLAT_NAMES), grid, walls, rooms, openings, furniture };
}

/** A row of N identical rooms opening off a single shared corridor. */
function genCorridor(rng: Rng): PlanModel {
  const grid = 50;
  const n = randstep(rng, 3, 4, 1);
  const roomW = randstep(rng, 3000, 3500, 500);
  const w = roomW * n;
  const roomH = randstep(rng, 3500, 4000, 500);
  const corrH = randstep(rng, 1600, 2000, 200);
  const h = roomH + corrH;
  const label = pick(rng, ROOM_ROW_LABELS);

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
    // The corridor/room divider runs the full width.
    {
      id: "w_corr",
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: 0, y: roomH },
        { x: w, y: roomH },
      ],
    },
  ];
  // Partitions between adjacent rooms.
  for (let i = 1; i < n; i++) {
    walls.push({
      id: `w_div${i}`,
      kind: "partition",
      thickness: 100,
      close: false,
      points: [
        { x: i * roomW, y: 0 },
        { x: i * roomW, y: roomH },
      ],
    });
  }
  const rooms: RoomModel[] = [];
  const openings: OpeningModel[] = [];
  for (let i = 0; i < n; i++) {
    rooms.push({
      id: `r_room${i + 1}`,
      at: { x: i * roomW, y: 0 },
      size: { w: roomW, h: roomH },
      label: `${label} ${i + 1}`,
      uses: ["office"],
    });
    const cx = i * roomW + Math.round(roomW / 2 / 50) * 50;
    // Each door swings up into its own room; the entrance swings into the corridor.
    openings.push({
      kind: "door",
      id: `d_room${i + 1}`,
      at: { x: cx, y: roomH },
      width: 900,
      wall: "w_corr",
      hinge: "left",
      swingInto: `r_room${i + 1}`,
    });
    openings.push({
      kind: "window",
      id: `win_room${i + 1}`,
      at: { x: i * roomW + Math.round(roomW / 2 / 100) * 100, y: 0 },
      width: 1200,
      wall: "exterior",
    });
  }
  rooms.push({
    id: "r_corr",
    at: { x: 0, y: roomH },
    size: { w, h: corrH },
    label: pick(rng, CORRIDOR_LABELS),
    uses: ["hall"],
  });
  // Entrance into the corridor on the south wall.
  openings.push({
    kind: "door",
    id: "d_main",
    at: { x: randstep(rng, 1200, w - 1200, 50), y: h },
    width: 1000,
    wall: "exterior",
    hinge: "left",
    swingInto: "r_corr",
  });
  // Movable piece in the first room's far corner (NOT the corridor — furniture on the
  // shared circulation would pinch the entrance walk, W_PATH_TOO_NARROW).
  const corrCat = pick(rng, FURNITURE);
  const furniture: FurnitureModel[] = [
    {
      id: "f_move",
      category: corrCat,
      at: { x: 300, y: 300 },
      size: { w: Math.min(1400, roomW - 800), h: 700 },
      label: furnitureLabel(corrCat),
      movable: true,
    },
  ];
  return { family: "corridor", name: pick(rng, CORRIDOR_NAMES), grid, walls, rooms, openings, furniture };
}

const GENERATORS: Record<Family, (rng: Rng) => PlanModel> = {
  studio: genStudio,
  "hall-flat": genHallFlat,
  corridor: genCorridor,
};

/** Generate a plan of the named family from a seeded RNG. */
export function generatePlan(family: Family, rng: Rng): PlanModel {
  return GENERATORS[family](rng);
}
