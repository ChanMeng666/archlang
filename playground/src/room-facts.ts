/**
 * The words the drawing's facts are said in: the facts line under it, the hover tooltip and the
 * room's facts card. Pure (no DOM): every figure is describe()'s, read off the summary, never
 * measured here and never typed. An area says which area it is and a size says what it measures:
 *
 * - an area is the room's NET internal area (`net_area_m2`, ADR 0027) when describe() computed one,
 *   else its centreline area (`area_m2`, to the middle of every wall), each labelled so;
 * - a size is the room's shape on wall centrelines: a rectangle's width × depth, a circle's
 *   diameter, and for any other shape the extent of its ring with a tilde, since an L or a
 *   trapezoid has no single width.
 */
import type { RoomSummary, SceneSummary } from "archlang";

/** The subset of a describe() room the tooltip and the card read. */
export type FactsRoom = Pick<
  RoomSummary,
  "id" | "label" | "uses" | "area_m2" | "net_area_m2" | "bbox" | "floor_polygon" | "floor_circle" | "adjacent"
>;

/** The room's name: its label, else its id. */
export const roomName = (r: Pick<RoomSummary, "id" | "label">): string => r.label || r.id;

/** An area with its convention: net when describe() has it, else centreline. */
export function areaText(net: number | undefined, centreline: number): string {
  return net !== undefined ? `${net} m² (net)` : `${centreline} m² (centreline)`;
}

/** Whether `ring` is exactly the axis-aligned rectangle `box` (any start, either direction). */
function isBox(ring: readonly { x: number; y: number }[], box: RoomSummary["bbox"]): boolean {
  if (ring.length !== 4) return false;
  const xs = new Set([box.x, box.x + box.w]);
  const ys = new Set([box.y, box.y + box.h]);
  const corners = new Set(ring.map((p) => `${p.x},${p.y}`));
  if (corners.size !== 4 || !ring.every((p) => xs.has(p.x) && ys.has(p.y))) return false;
  // Consecutive corners share an x or a y: a rectangle's edges, not its diagonals.
  return ring.every((p, i) => {
    const q = ring[(i + 1) % 4]!;
    return p.x === q.x || p.y === q.y;
  });
}

/** The room's size on wall centrelines, with what it measures. */
export function sizeText(r: Pick<RoomSummary, "bbox" | "floor_polygon" | "floor_circle">): string {
  const mm = (n: number) => String(Math.round(n));
  if (r.floor_circle) return `⌀ ${mm(2 * r.floor_circle.r)} mm (centreline)`;
  const b = r.bbox;
  if (isBox(r.floor_polygon, b)) return `${mm(b.w)} × ${mm(b.h)} mm (centreline)`;
  return `~${mm(b.w)} × ${mm(b.h)} mm (extent)`;
}

/** The hover tooltip: name · area · size. */
export function roomTip(r: FactsRoom): string {
  return `${roomName(r)} · ${areaText(r.net_area_m2, r.area_m2)} · ${sizeText(r)}`;
}

/** The source's line count: its newline-terminated lines, plus a last one with no newline. */
export function sourceLines(source: string): number {
  if (source === "") return 0;
  const n = source.split(/\r\n|\r|\n/).length;
  return /[\r\n]$/.test(source) ? n - 1 : n;
}

/**
 * The facts line: "57 lines of ArchLang → 3 rooms · 45.05 m² (net)", from describe()'s totals of
 * the summary on screen. On a plan with storeys that summary is one storey's (`describeLevel`),
 * and the line names it.
 */
export function factsLine(source: string, summary: Pick<SceneSummary, "totals">, level: number | null): string {
  const t = summary.totals;
  const lines = sourceLines(source);
  const where = level === null ? "" : ` · level ${level}`;
  return (
    `${lines} line${lines === 1 ? "" : "s"} of ArchLang → ${t.rooms} room${t.rooms === 1 ? "" : "s"} · ` +
    `${areaText(t.net_floor_area_m2, t.floor_area_m2)}${where}`
  );
}

/**
 * The facts line for every storey at once (the 3D preview's combined view, card PG5b): describe()'s
 * per-storey totals (`levels[].totals`) added up, and said to be all of them — "… → 12 rooms ·
 * 141.2 m² (net) · all 3 storeys". describe()'s own top-level totals are the lowest storey's, so
 * they cannot say this. Net when every storey has a net area, else centreline; to 0.01 m², as
 * describe() rounds.
 */
export function factsLineAll(source: string, levels: readonly Pick<SceneSummary, "totals">[]): string {
  const lines = sourceLines(source);
  const rooms = levels.reduce((n, l) => n + l.totals.rooms, 0);
  const sum = (f: (l: Pick<SceneSummary, "totals">) => number) =>
    Math.round(levels.reduce((n, l) => n + f(l), 0) * 100) / 100;
  const allNet = levels.every((l) => l.totals.net_floor_area_m2 !== undefined);
  const area = areaText(
    allNet ? sum((l) => l.totals.net_floor_area_m2!) : undefined,
    sum((l) => l.totals.floor_area_m2),
  );
  return (
    `${lines} line${lines === 1 ? "" : "s"} of ArchLang → ${rooms} room${rooms === 1 ? "" : "s"} · ` +
    `${area} · all ${levels.length} storeys`
  );
}

/** What the room's facts card shows. */
export interface RoomCardFacts {
  name: string;
  area: string;
  /** The centreline area, when the headline area is the net one. */
  centreline?: string;
  size: string;
  /** Its uses, declared or inferred ("living, kitchen"), or "not stated". */
  use: string;
  /** The rooms whose edges touch it, by name. */
  neighbours: string[];
  doors: number;
  windows: number;
  /** Its cased openings (leaf-less), describe()'s `openings`. */
  openings: number;
}

/** The card for `room`, its neighbours and openings read from the same summary. */
export function roomCardFacts(
  room: FactsRoom,
  summary: Pick<SceneSummary, "rooms" | "doors" | "windows" | "openings">,
): RoomCardFacts {
  const names = new Map(summary.rooms.map((r) => [r.id, roomName(r)]));
  return {
    name: roomName(room),
    area: areaText(room.net_area_m2, room.area_m2),
    ...(room.net_area_m2 !== undefined ? { centreline: `${room.area_m2} m² (centreline)` } : {}),
    size: sizeText(room),
    use: room.uses.length > 0 ? room.uses.join(", ") : "not stated",
    neighbours: room.adjacent.map((id) => names.get(id) ?? id),
    doors: summary.doors.filter((d) => d.between.includes(room.id)).length,
    windows: summary.windows.filter((w) => w.room === room.id).length,
    openings: summary.openings.filter((o) => o.between.includes(room.id)).length,
  };
}

/** A room's openings in plain words, only the kinds it has: "2 doors · 1 window · 6 openings", or "none". */
export function openingsText(f: Pick<RoomCardFacts, "doors" | "windows" | "openings">): string {
  const parts = [
    [f.doors, "door"],
    [f.windows, "window"],
    [f.openings, "opening"],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, one]) => `${n} ${one}${n === 1 ? "" : "s"}`);
  return said.length > 0 ? said.join(" · ") : "none";
}
