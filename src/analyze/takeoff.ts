/**
 * The long form of a takeoff: every figure of `describe --facts quantities`, one row each, and the
 * CSV `arch takeoff --format csv` and the Playground's Takeoff tab both write from it. Pure, so the
 * two cannot disagree.
 */

import type { SceneSummary } from "../describe.js";
import { fmt2 } from "../num-format.js";
import type { QuantityFacts } from "./quantities.js";

/** One figure of a takeoff: the long form both formats are written from. */
interface TakeoffRow {
  level: number | undefined;
  section: "walls" | "rooms" | "floor" | "doors" | "windows";
  item: string;
  width_mm?: number;
  field: string;
  value: number | string;
}

/** Every figure of one storey's block, in the block's own order and with its own field names. */
function takeoffRows(q: QuantityFacts, level: number | undefined): TakeoffRow[] {
  const rows: TakeoffRow[] = [];
  const add = (section: TakeoffRow["section"], item: string, obj: object, skip: readonly string[], width?: number) => {
    for (const [field, value] of Object.entries(obj)) {
      if (skip.includes(field) || (typeof value !== "number" && typeof value !== "string")) continue;
      rows.push({ level, section, item, ...(width !== undefined ? { width_mm: width } : {}), field, value });
    }
  };
  for (const w of q.walls) add("walls", w.category, w, ["category"]);
  if (q.faces_omitted) add("walls", "*", { faces_omitted: q.faces_omitted }, []);
  for (const r of q.rooms) add("rooms", r.id, r, ["id"]);
  const { floor_area_net_m2, waste_pct, floor_area_with_waste_m2 } = q;
  add("floor", "storey", { floor_area_net_m2, waste_pct, floor_area_with_waste_m2 }, []);
  for (const d of q.doors) add("doors", d.kind, { count: d.count }, [], d.width_mm);
  for (const w of q.windows) add("windows", "window", { count: w.count }, [], w.width_mm);
  return rows;
}

/** A figure as text, through the one number formatter; an absent figure is an empty cell. */
export const cell = (v: number | string | undefined): string =>
  v === undefined ? "" : typeof v === "number" ? fmt2(v) : v;

/** RFC 4180: quote a field holding a comma, a quote or a line break. */
const csvField = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The storeys of a summary read with the `quantities` fact, lowest first; one with no `level`. */
export function takeoffStoreys(
  s: Pick<SceneSummary, "quantities" | "levels">,
): Array<{ level: number | undefined; name: string | undefined; q: QuantityFacts }> {
  // A multi-storey plan is taken off storey by storey; the top-level block repeats the lowest.
  return s.levels
    ? s.levels.map((l) => ({ level: l.level, name: l.name, q: l.quantities! }))
    : [{ level: undefined, name: undefined, q: s.quantities! }];
}

/** The whole plan as `arch takeoff --format csv` writes it, from a summary read with `quantities`. */
export function takeoffCsv(s: Pick<SceneSummary, "quantities" | "levels">): string {
  const rows = takeoffStoreys(s).flatMap((st) => takeoffRows(st.q, st.level));
  const lines = ["level,section,item,width_mm,field,value"];
  for (const r of rows)
    lines.push(
      [cell(r.level), r.section, r.item, cell(r.width_mm), r.field, cell(r.value)].map((s) => csvField(s)).join(","),
    );
  return `${lines.join("\n")}\n`;
}
