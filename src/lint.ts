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

import type { RRoom, RDoor, RWindow, RFurniture } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import {
  resolvePlan,
  rectOf,
  pointOnRoomEdge,
  doorConnections,
  largestPerimeterGap,
  DEFAULT_TOL,
  type AnalyzeOptions,
  type BBox,
} from "./analyze.js";
import { doorSwing, sectorIntersectsRect, swingsCollide, type DoorSwing } from "./geometry.js";

/** A room label that reads as a bedroom (sleeping space). */
const BEDROOM_RE = /\bbed\b|bedroom/i;
/** A room label that reads as a wet room (bathroom / WC / shower). */
const WET_RE = /\bbath\b|bathroom|\bwc\b|toilet|ensuite|en-suite|shower|washroom/i;
/** A room label that reads as a kitchen. */
const KITCHEN_RE = /kitchen|kitchenette/i;
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
}

export const DEFAULT_RULESET: LintRuleset = {
  minRoomAreaM2: 4,
  minDoorWidthMm: 700,
  tolMm: DEFAULT_TOL,
  maxUnenclosedMm: 300,
  swingClearanceMm: 0,
};

export interface LintOptions extends AnalyzeOptions {
  /** Override any subset of {@link DEFAULT_RULESET}. */
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
  const rules: LintRuleset = { ...DEFAULT_RULESET, ...opts.ruleset };
  const { ir } = resolvePlan(source, opts);
  if (!ir) return [];

  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  const doors = ir.elements.filter((e): e is RDoor => e.kind === "door");
  const windows = ir.elements.filter((e): e is RWindow => e.kind === "window");
  const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
  const roomRects = new Map<string, BBox>(rooms.map((r) => [r.id, rectOf(r)]));

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

    // No door on its perimeter, so it can't be entered.
    if (!doors.some((d) => onEdge(d.at))) {
      out.push({ severity: "warning", code: "W_ROOM_DISCONNECTED", ...at(r.span),
        message: `Room "${labelOf(r)}" has no door — it can't be entered.`,
        hints: ["Add a `door` on one of its walls."] });
    }

    // A bedroom needs natural light / egress.
    if (BEDROOM_RE.test(labelOf(r)) && !windows.some((win) => onEdge(win.at))) {
      out.push({ severity: "warning", code: "W_BEDROOM_NO_WINDOW", ...at(r.span),
        message: `Bedroom "${labelOf(r)}" has no window.`,
        hints: ["Add a `window` on an exterior wall of this room."] });
    }

    // A wet room not fully walled in (a partition that stops short leaves it open).
    if (WET_RE.test(labelOf(r))) {
      const gap = largestPerimeterGap(rect, ir.walls, rules.tolMm);
      if (gap > rules.maxUnenclosedMm) {
        out.push({ severity: "warning", code: "W_ROOM_NOT_ENCLOSED", ...at(r.span),
          message: `Bathroom "${labelOf(r)}" is not fully enclosed (~${Math.round(gap)} mm of its perimeter has no wall).`,
          hints: ["Extend the partition so the room is walled on all sides — a door or window in the wall is fine."] });
      }
    }

    // A wet room or kitchen with no fixtures reads as an empty box.
    const isWet = WET_RE.test(labelOf(r));
    const isKitchen = KITCHEN_RE.test(labelOf(r));
    if (isWet || isKitchen) {
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
    for (const d of doors) {
      const conn = doorConnections(d, roomRects, rules.tolMm);
      if (conn.length === 2) addEdge(conn[0], conn[1]);
    }
    const isBedroom = (id: string): boolean => {
      const r = rooms.find((x) => x.id === id);
      return r ? BEDROOM_RE.test(labelOf(r)) : false;
    };
    const bfs = (excludeBedrooms: boolean): Set<string> => {
      const seen = new Set<string>();
      if (!adj.has("exterior")) return seen;
      seen.add("exterior");
      const queue = ["exterior"];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of adj.get(cur) ?? []) {
          if (seen.has(nb) || (excludeBedrooms && isBedroom(nb))) continue;
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
        if (WET_RE.test(labelOf(r)) && reachAll.has(r.id) && !reachNoBed.has(r.id)) {
          out.push({ severity: "warning", code: "W_BATH_VIA_BEDROOM", ...at(r.span),
            message: `Bathroom "${labelOf(r)}" is reachable only through a bedroom.`,
            hints: ["Connect it to a hall or living space — or, if it is an en-suite, add a second bathroom off circulation."] });
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
        message: `Door is ${d.width} mm wide (under the ${rules.minDoorWidthMm} mm minimum clear width).`,
        hints: [`Widen it to at least ${rules.minDoorWidthMm} mm.`] });
    }
  }

  // The building has rooms and an outer shell but no way in.
  const hasExteriorWall = ir.walls.some((wl) => wl.category === "exterior");
  const hasExteriorDoor = doors.some((d) => d.host?.category === "exterior");
  if (rooms.length > 0 && hasExteriorWall && !hasExteriorDoor) {
    out.push({ severity: "warning", code: "W_NO_ENTRANCE",
      message: "The plan has no exterior door — there is no way into the building.",
      hints: ["Add a `door` on an `exterior` wall."] });
  }

  return out;
}
