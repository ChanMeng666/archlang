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

import type { RRoom, RDoor, RWindow } from "./ir.js";
import type { Diagnostic } from "./diagnostics.js";
import { resolvePlan, rectOf, pointOnRoomEdge, DEFAULT_TOL, type AnalyzeOptions, type BBox } from "./analyze.js";

/** Tunable thresholds for the lint rules. All distances in mm, areas in m². */
export interface LintRuleset {
  /** Rooms smaller than this (m²) warn as implausibly small. Default 4. */
  minRoomAreaM2: number;
  /** Doors narrower than this (mm) warn as sub-passable. Default 700. */
  minDoorWidthMm: number;
  /** Edge-touch tolerance for "is this opening on that room?" (mm). Default 200. */
  tolMm: number;
}

export const DEFAULT_RULESET: LintRuleset = {
  minRoomAreaM2: 4,
  minDoorWidthMm: 700,
  tolMm: DEFAULT_TOL,
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
    if (/\bbed\b|bedroom/i.test(labelOf(r)) && !windows.some((win) => onEdge(win.at))) {
      out.push({ severity: "warning", code: "W_BEDROOM_NO_WINDOW", ...at(r.span),
        message: `Bedroom "${labelOf(r)}" has no window.`,
        hints: ["Add a `window` on an exterior wall of this room."] });
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
