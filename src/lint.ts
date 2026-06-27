/**
 * `lint(source)` — architectural soundness rules, as diagnostics.
 *
 * The compiler tells you a plan is *valid* (it parses and resolves). Lint tells you
 * it is *sound* — that an agent-drawn plan is actually habitable: every room can be
 * entered, bedrooms have a window, rooms aren't implausibly tiny, doors are wide
 * enough to pass, and the building has an entrance. These are exactly the mistakes a
 * model makes when it invents coordinates, and they ship as the same errors-as-data
 * the rest of ArchLang uses (a `W_*` code + byte span + a catalog `fix`), so an agent
 * self-corrects from them with no extra plumbing.
 *
 * Pure and deterministic. Rules are plain arithmetic over the resolved IR (shared
 * geometry in {@link import("./analyze.js")}); the ruleset is data, so regional
 * building-code packs can extend it later.
 */

import type { RRoom, RDoor, RWindow, ROpening, RFurniture } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  resolvePlan,
  rectOf,
  pointOnRoomEdge,
  doorConnections,
  largestPerimeterGap,
  isBedroom,
  isWetRoom,
  isKitchen,
  isAgainstWall,
  DEFAULT_TOL,
  type AnalyzeOptions,
  type BBox,
} from "./analyze.js";
import { doorSwing, sectorIntersectsRect, swingsCollide, type DoorSwing } from "./geometry.js";
import { requiresWall } from "./fixtures-catalog.js";

/** Furniture categories that count as a plumbing fixture for a wet room. */
const WET_FIX = new Set(["wc", "toilet", "basin", "sink", "shower", "bath", "bathtub", "tub"]);
/** Furniture categories that count as a fixture/appliance for a kitchen. */
const KITCHEN_FIX = new Set(["sink", "kitchen_sink", "stove", "hob", "cooktop", "oven", "counter", "worktop", "fridge", "refrigerator"]);

/** Tunable thresholds for the lint rules. All distances in mm, areas in m². */
export interface LintRuleset {
  /** Rooms smaller than this (m²) warn as implausibly small. Default 4. */
  minRoomAreaM2: number;
  /** Doors narrower than this (mm) warn as sub-passable. Default 700 (≥800 recommended). */
  minDoorWidthMm: number;
  /** Edge-touch tolerance for "is this opening on that room?" (mm). Default 200. */
  tolMm: number;
  /**
   * A wet room (bath/WC) whose perimeter has an unwalled run longer than this (mm)
   * warns as not enclosed. Default 300 — long enough to ignore a normal door/window
   * opening (those are not gaps anyway), short enough to catch a missing partition.
   */
  maxUnenclosedMm: number;
  /** Extra clearance (mm) added when testing door-swing collisions. Default 0. */
  swingClearanceMm: number;
  /**
   * How close (mm) a wall-requiring fixture's edge must be to a wall centerline to
   * count as "against the wall". Default 300 — comfortably more than a wall's
   * half-thickness (a fixture backs onto the wall *face*) plus a small setback.
   */
  fixtureWallTolMm: number;
}

export const DEFAULT_RULESET: LintRuleset = {
  minRoomAreaM2: 4,
  minDoorWidthMm: 700,
  tolMm: DEFAULT_TOL,
  maxUnenclosedMm: 300,
  swingClearanceMm: 0,
  fixtureWallTolMm: 300,
};

/**
 * Named, **advisory** lint profiles — partial ruleset overrides over
 * {@link DEFAULT_RULESET}. Deliberately NOT named after a standard (`ada`, `iso`):
 * a profile is an advisory soundness check, never a compliance guarantee, and
 * ArchLang does not model everything a code requires (clear opening width, approach
 * clearances, hardware). Every override is a documented, traceable threshold.
 */
export const LINT_PROFILES: Readonly<Record<string, Partial<LintRuleset>>> = Object.freeze({
  /** The shipped residential baseline (identical to {@link DEFAULT_RULESET}). */
  "residential-basic": {},
  /**
   * Stricter passage + clearances inspired by accessibility guidance (e.g. the ADA's
   * ~815 mm clear door opening and generous turning/approach space). Advisory only.
   */
  "accessibility-advisory": {
    minDoorWidthMm: 850, // a nominal width giving roughly an 815 mm clear opening
    minRoomAreaM2: 5,
    swingClearanceMm: 150,
  },
});

/** The names of the built-in {@link LINT_PROFILES}, for CLI validation. */
export const LINT_PROFILE_NAMES: readonly string[] = Object.keys(LINT_PROFILES);

export interface LintOptions extends AnalyzeOptions {
  /** A named profile from {@link LINT_PROFILES} (applied before `ruleset`). */
  profile?: string;
  /** Override any subset of {@link DEFAULT_RULESET} (wins over `profile`). */
  ruleset?: Partial<LintRuleset>;
}

/** Square metres of a room, rounded to 2 decimals. */
const areaM2 = (r: RRoom): number => Math.round((r.size.w * r.size.h) / 1_000_000 * 100) / 100;

/**
 * Lint ArchLang `source` and return architectural-soundness warnings. Returns `[]`
 * when the plan has fatal errors (resolution failed — there is nothing sound to
 * check; compile/validate surfaces those). Never throws.
 */
export function lint(source: string, opts: LintOptions = {}): Diagnostic[] {
  // Ruleset cascade: defaults → named profile → explicit per-call overrides.
  const profileRules = opts.profile ? LINT_PROFILES[opts.profile] ?? {} : {};
  const rules: LintRuleset = { ...DEFAULT_RULESET, ...profileRules, ...opts.ruleset };
  const { ir } = resolvePlan(source, opts);
  if (!ir) return [];

  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const openings = ir.elements.filter((e): e is ROpening => e.kind === "opening");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const roomRects = new Map<string, BBox>(rooms.map((r) => [r.id, rectOf(r)]));
  // Both doors and cased openings connect a room to its neighbours.
  const connectors = [...doors, ...openings];

  const out: Diagnostic[] = [];
  const labelOf = (r: RRoom): string => r.label ?? r.id;
  const at = (span: Diagnostic["span"]): { span?: Diagnostic["span"] } => (span ? { span } : {});

  for (const r of rooms) {
    const rect = roomRects.get(r.id)!;
    const onEdge = (p: { x: number; y: number }): boolean => pointOnRoomEdge(p, rect, rules.tolMm);

    // Implausibly tiny room.
    const a = areaM2(r);
    if (a < rules.minRoomAreaM2) {
      out.push({ severity: "warning", code: "W_ROOM_TOO_SMALL", ...at(r.span),
        message: `Room "${labelOf(r)}" is only ${a} m² (under ${rules.minRoomAreaM2} m²).`,
        hints: ["Increase its `size`, or merge it into an adjacent space."] });
    }

    // No door or opening on its perimeter, so it can't be entered.
    if (!connectors.some((c) => onEdge(c.at))) {
      out.push({ severity: "warning", code: "W_ROOM_DISCONNECTED", ...at(r.span),
        message: `Room "${labelOf(r)}" has no door or opening — it can't be entered.`,
        hints: ["Add a `door` or a cased `opening` on one of its walls."] });
    }

    // A bedroom needs natural light / egress.
    if (isBedroom(r) && !windows.some((win) => onEdge(win.at))) {
      out.push({ severity: "warning", code: "W_BEDROOM_NO_WINDOW", ...at(r.span),
        message: `Bedroom "${labelOf(r)}" has no window.`,
        hints: ["Add a `window` on an exterior wall of this room."] });
    }

    // A wet room not fully walled in (a partition that stops short leaves it open).
    if (isWetRoom(r)) {
      const gap = largestPerimeterGap(rect, ir.walls, rules.tolMm);
      if (gap > rules.maxUnenclosedMm) {
        out.push({ severity: "warning", code: "W_ROOM_NOT_ENCLOSED", ...at(r.span),
          message: `Bathroom "${labelOf(r)}" is not fully enclosed (~${Math.round(gap)} mm of its perimeter has no wall).`,
          hints: ["Extend the partition so the room is walled on all sides — a door or window in the wall is fine."] });
      }
    }

    // A wet room or kitchen with no fixtures reads as an empty box.
    const isWet = isWetRoom(r);
    const isKit = isKitchen(r);
    if (isWet || isKit) {
      const want = isWet ? WET_FIX : KITCHEN_FIX;
      const has = furniture.some((f) => {
        const fr = rectOf(f);
        const cx = fr.x + fr.w / 2;
        const cy = fr.y + fr.h / 2;
        return want.has(f.category) && cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
      });
      if (!has) {
        out.push({ severity: "warning", code: "W_ROOM_NO_FIXTURE", ...at(r.span),
          message: `${isWet ? "Bathroom" : "Kitchen"} "${labelOf(r)}" has no ${isWet ? "fixtures (WC, basin, shower…)" : "fixtures (sink, counter, stove…)"}.`,
          hints: [`Add the expected fixtures — e.g. import \`lib/fixtures.arch\` and place a ${isWet ? "`wc`, `basin`, or `shower`" : "`kitchen_sink` and `counter`"}.`] });
      }
    }
  }

  // Furniture that overlaps another piece — a physical collision (each unordered
  // pair reported once, in source order, against the second piece's span).
  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = rectOf(furniture[i]);
      const b = rectOf(furniture[j]);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1) {
        const nameI = furniture[i].label ?? furniture[i].category;
        const nameJ = furniture[j].label ?? furniture[j].category;
        out.push({ severity: "warning", code: "W_FURNITURE_OVERLAP", ...at(furniture[j].span),
          message: `Furniture "${nameJ}" overlaps "${nameI}".`,
          hints: ["Move or resize one piece so they don't intersect; leave a walkway between them."] });
      }
    }
  }

  // A wall-requiring fixture (WC, basin, sink, counter, stove, fridge…) placed with
  // no wall behind any edge — it floats in the room.
  for (const f of furniture) {
    if (requiresWall(f.category) && !isAgainstWall(rectOf(f), ir.walls, rules.fixtureWallTolMm)) {
      const name = f.label ?? f.category;
      out.push({ severity: "warning", code: "W_FIXTURE_FLOATING", ...at(f.span),
        message: `Fixture "${name}" is not against a wall.`,
        hints: ["Place it so one edge backs onto a wall — plumbing/venting runs in the wall."] });
    }
  }

  // A fixture declared `in <room>` whose centre falls outside that room's rectangle
  // (an unknown room id is the harder E_FURN_ROOM error, handled at resolve).
  for (const f of furniture) {
    if (f.room === undefined) continue;
    const rect = roomRects.get(f.room);
    if (!rect) continue;
    const cx = f.at.x + f.size.w / 2;
    const cy = f.at.y + f.size.h / 2;
    const inside = cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h;
    if (!inside) {
      const name = f.label ?? f.category;
      out.push({ severity: "warning", code: "W_FIXTURE_WRONG_ROOM", ...at(f.span),
        message: `Fixture "${name}" sits outside its declared room "${f.room}".`,
        hints: ["Move it inside that room, or correct the `in <roomId>`."] });
    }
  }

  // A wet room reachable from the entrance only by passing through a bedroom.
  // Build the room-connectivity graph from doors (rooms + the literal "exterior"),
  // then compare reachability with and without bedroom nodes.
  {
    const adj = new Map<string, Set<string>>();
    const addEdge = (x: string, y: string): void => {
      if (!adj.has(x)) adj.set(x, new Set());
      if (!adj.has(y)) adj.set(y, new Set());
      adj.get(x)!.add(y);
      adj.get(y)!.add(x);
    };
    for (const c of connectors) {
      const conn = doorConnections(c, roomRects, rules.tolMm);
      if (conn.length === 2) addEdge(conn[0], conn[1]);
    }
    const isBedroomId = (id: string): boolean => {
      const r = rooms.find((x) => x.id === id);
      return r ? isBedroom(r) : false;
    };
    const bfs = (excludeBedrooms: boolean): Set<string> => {
      const seen = new Set<string>();
      if (!adj.has("exterior")) return seen;
      seen.add("exterior");
      const queue = ["exterior"];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
          if (seen.has(nb) || (excludeBedrooms && isBedroomId(nb))) continue;
          seen.add(nb);
          queue.push(nb);
        }
      }
      return seen;
    };
    if (adj.has("exterior")) {
      const reachAll = bfs(false);
      const reachNoBed = bfs(true);
      for (const r of rooms) {
        if (isWetRoom(r) && reachAll.has(r.id) && !reachNoBed.has(r.id)) {
          out.push({ severity: "warning", code: "W_BATH_VIA_BEDROOM", ...at(r.span),
            message: `Bathroom "${labelOf(r)}" is reachable only through a bedroom.`,
            hints: ["Connect it to a hall or living space — or, if it is an en-suite, add a second bathroom off circulation."] });
        }
        // Has a connector on its perimeter (so not W_ROOM_DISCONNECTED) yet no path
        // back to the entrance — a sealed-off pocket. Only meaningful when an
        // entrance exists (else W_NO_ENTRANCE already covers the whole plan).
        const rect = roomRects.get(r.id)!;
        const hasConnector = connectors.some((c) => pointOnRoomEdge(c.at, rect, rules.tolMm));
        if (hasConnector && !reachAll.has(r.id)) {
          out.push({ severity: "warning", code: "W_ROOM_UNREACHABLE", ...at(r.span),
            message: `Room "${labelOf(r)}" can't be reached from the entrance.`,
            hints: ["Add a door or cased `opening` linking it (directly or through a hall) to a space that reaches the entrance."] });
        }
      }
    }
  }

  // A door whose swing arc is blocked by furniture or another door's swing.
  const swings: Array<{ d: RDoor; s: DoorSwing }> = [];
  for (const d of doors) {
    const s = doorSwing(d);
    if (s) swings.push({ d, s });
  }
  for (let i = 0; i < swings.length; i++) {
    const { d, s } = swings[i];
    let blocked = furniture.some((f) => sectorIntersectsRect(s, rectOf(f), rules.swingClearanceMm));
    if (!blocked) {
      for (let j = i + 1; j < swings.length; j++) {
        if (swingsCollide(s, swings[j].s, rules.swingClearanceMm)) { blocked = true; break; }
      }
    }
    if (blocked) {
      out.push({ severity: "warning", code: "W_SWING_OBSTRUCTED", ...at(d.span),
        message: `Door swing is obstructed — the leaf cannot open fully.`,
        hints: ["Move the door or the obstruction, flip its `hinge`/`swing`, or use a sliding door."] });
    }
  }

  // Door too narrow to pass comfortably.
  for (const d of doors) {
    if (d.width < rules.minDoorWidthMm) {
      out.push({ severity: "warning", code: "W_DOOR_CLEARANCE", ...at(d.span),
        message: `Door is ${d.width} mm wide (under the ${rules.minDoorWidthMm} mm minimum nominal width).`,
        hints: [`Widen it to at least ${rules.minDoorWidthMm} mm.`] });
    }
  }

  // The building has rooms and an outer shell but no way in.
  const hasExteriorWall = ir.walls.some((wl) => wl.category === "exterior");
  const hasExteriorEntry = connectors.some((c) => c.host?.category === "exterior");
  if (rooms.length > 0 && hasExteriorWall && !hasExteriorEntry) {
    out.push({ severity: "warning", code: "W_NO_ENTRANCE",
      message: "The plan has no exterior door or opening — there is no way into the building.",
      hints: ["Add a `door` (or a cased `opening`) on an `exterior` wall."] });
  }

  return out;
}
