/**
 * The drawing budget: before `toScene()` runs, the primitives a plan will draw are estimated
 * over EVERY storey (a multi-storey compile holds all its pages at once), and a plan past
 * {@link MAX_DRAW_UNITS} is one `E_DRAWING_LIMIT` instead of a drawing that exhausts memory.
 *
 * The estimate is a tight UPPER bound, kind by kind. Each element contributes its kind's
 * `ElementDef.drawCost` (an upper bound on what its `render()` emits: a room 3, a door 5, a
 * run its treads, a fixture its own glyph, counted) plus one unit per point its `bounds()`
 * reports (the vertices a polygon or a wall path carries, which the primitive count alone
 * does not see). Each storey adds what the plan-wide passes draw: the `dims auto` chains
 * (counted by the same `synthDims` the drawing calls), the `axes` bubbles, the lot line and
 * the margin tables. A kind with no `drawCost` (a plugin's) is estimated at
 * {@link DEFAULT_DRAW_COST}. `test/drawing-budget.test.ts` holds the estimate at or above what
 * is drawn for every kind, every fixture category and every corpus plan, and at most four
 * times it over the corpus, so it can neither undercount nor drift loose.
 *
 * Only `compile()` draws, so only `compile()` checks it (`src/pipeline.ts`); `describe()` and
 * `lint()` draw nothing and are unaffected.
 */

import type { Diagnostic, Span } from "./diagnostics.js";
import {
  drawnView,
  type RFurniture,
  type ROutdoor,
  type RRoom,
  type ResolvedElement,
  type ResolvedPlan,
} from "./ir.js";
import type { Registry } from "./registry.js";
import { autoDimCount } from "./scene-build.js";
import {
  legendEntries,
  MAX_NOTE_LINES,
  NOTE_LINE_CHARS,
  noteLineCount,
  notesRowCount,
  roomSchedule,
} from "./sheet-tables.js";
import { openingCount, TAG_PRIMITIVES } from "./opening-schedule.js";
import { siteBoundaryNodes } from "./site.js";
import { netAreaWorkUnits } from "./analyze/net-area.js";
import { hatchesUsed } from "./hatches.js";
import { groundMaterialsUsed } from "./elements/outdoor.js";
import { DEFAULT_THEME } from "./theme.js";
import { renderSizes } from "./sheet.js";
import { fmt3 } from "./num-format.js";

/**
 * The estimate of an element whose kind declares no `drawCost` (a plugin's): at least what
 * any fixed-size glyph draws. The largest built-in one is a cabinet run, 67 primitives (64
 * divisions); `test/drawing-budget.test.ts` holds every fixture category within it.
 */
export const DEFAULT_DRAW_COST = 72;

/**
 * The most units a plan may be estimated at, over every storey.
 *
 * Derived from memory, not from a count. For each kind the heap a unit costs was measured
 * (Node 24, `compile()`, heap still held after a GC with the result alive, and heap before that
 * GC as the transient high-water mark) on the shapes densest per unit, each scaled to about
 * 300,000 units and run under a 512 MB heap cap:
 *
 * | shape at ~300,000 units                        | held   | before GC | SVG     |
 * | ---------------------------------------------- | ------ | --------- | ------- |
 * | 74,865 windows (15 storeys of 4,991 on a wall)  | 186 MB | 306 MB    | 37 MB   |
 * | 27,600 beds (6 storeys)                         | 176 MB | 222 MB    | 35 MB   |
 * | 4,225 cabinet runs of 64 divisions              | 134 MB | 330 MB    | 38 MB   |
 * | 262 fences of 19 long segments                  | 129 MB | 301 MB    | 31 MB   |
 * | 49,910 doors (10 storeys)                       | 112 MB | 200 MB    | 22 MB   |
 * | 37,440 dimensions (8 storeys)                   |  94 MB | 128 MB    | 23 MB   |
 * | 135 escalators at the tread cap                 |  86 MB | 255 MB    | 28 MB   |
 * | 42,840 rooms (9 storeys)                        |  44 MB | 104 MB    |  9 MB   |
 *
 * Every one completed under the 512 MB cap. The densest is 0.62 KB held per unit (windows) and
 * 1.1 KB before collection (cabinets), so 300,000 units hold under 0.2 GB and peak under
 * about 0.35 GB: the worst case stays under 0.5 GB with room for the drawing's own chrome.
 * A real building is far inside it: the 24-storey tower of 200 flats a floor with a wall and a
 * door each is 108,120 units (29,352 primitives drawn), the corpus's largest plan a few
 * thousand.
 */
export const MAX_DRAW_UNITS = 300_000;

/** One element's drawing estimate: its kind's `drawCost` plus one unit per `bounds()` point. */
export function drawUnits(el: ResolvedElement, registry: Registry): number {
  const def = registry.byKind.get(el.kind);
  if (!def) return DEFAULT_DRAW_COST;
  return (def.drawCost ? def.drawCost(el) : DEFAULT_DRAW_COST) + def.bounds(el).length;
}

/** The primitives each `axes` position draws (`axesNodes`: the line, the bubble, the letter). */
const AXIS_PRIMITIVES = 3;

/**
 * What one storey's plan-wide passes draw, beyond its elements: the `dims auto` chains (each a
 * `dim`, estimated as the `dim` kind is), the axis bubbles, the lot line and the margin
 * tables (`sheet-tables.ts`: a flat schedule is 11 + 4 per room, a grouped one adds 7 per
 * zone; a legend row is a rule, a swatch and a name, a fixture's swatch its glyph; the
 * opening tags and their schedule; the NOTES).
 */
export function storeyPassUnits(plan: ResolvedPlan, registry: Registry): number {
  // The storey as drawn: a `status demolish` wall (B3a) is drawn, so it is charged.
  const ir = drawnView(plan);
  let n = 0;
  const dims = autoDimCount(ir);
  if (dims > 0) {
    const dimDef = registry.byKind.get("dim");
    n += dims * ((dimDef?.drawCost?.({ kind: "dim", id: "" } as ResolvedElement) ?? DEFAULT_DRAW_COST) + 2);
  }
  n += AXIS_PRIMITIVES * (ir.axes?.length ?? 0);
  if (ir.siteBoundary) {
    n += siteBoundaryNodes(ir.siteBoundary, DEFAULT_THEME, renderSizes(ir.sheet, 1000, 1000, 1)).length;
    n += ir.siteBoundary.length;
  }
  const rooms = ir.elements.filter((e): e is RRoom => e.kind === "room");
  if (ir.schedule) {
    // Rows only (no walls passed, so no net area is measured here), then the net-area work
    // the drawn table will do, charged as a count BEFORE any of it runs.
    const s = roomSchedule(rooms, ir.zones);
    n += 16 + 5 * s.rows.length + 9 * s.groups.length;
    n += netAreaWorkUnits(rooms, ir.walls);
  }
  if (ir.legend) {
    const outdoors = ir.elements.filter((e): e is ROutdoor => e.kind === "outdoor");
    const furniture = ir.elements.filter((e): e is RFurniture => e.kind === "furniture");
    // `toScene`'s inputs (B3b): the standing walls' materials, and the `demolished` row.
    const standing = ir.walls.filter((w) => w.status !== "demolish");
    const entries = legendEntries(
      hatchesUsed(standing, groundMaterialsUsed(outdoors)),
      furniture,
      standing.length < ir.walls.length,
    );
    n += 4;
    for (const e of entries) n += e.kind === "fixture" ? 4 + DEFAULT_DRAW_COST : 5;
  }
  if (ir.openingSchedule) {
    // A tag per door/window (`TAG_PRIMITIVES`), and the table: 13 + 6 per row.
    const openings = openingCount(ir.elements);
    n += TAG_PRIMITIVES * openings + 13 + 6 * openings;
  }
  // The NOTES table: frame, caption and rule, then a number and a text per drawn line.
  if (ir.notes) n += 3 + 2 * notesRowCount(ir.notes);
  return n;
}

/**
 * `E_DRAWING_LIMIT` when the storeys, summed in drawing order (ascending storeys; each one's
 * elements in order, then its plan-wide passes), are estimated past {@link MAX_DRAW_UNITS}:
 * at the element whose estimate crosses it (tagged with its storey's level), or at the plan
 * header when a plan-wide pass crosses it. Undefined within the budget.
 */
export function drawBudgetDiagnostic(
  storeys: readonly { ir: ResolvedPlan; level?: number }[],
  registry: Registry,
  headerSpan: Span | undefined,
): Diagnostic | undefined {
  // The NOTES table's own bound, checked first: its width is fixed and each note wraps to it,
  // so authored text grows it only downward — and that is capped here, so a pasted essay is
  // refused rather than drawn as a page metres tall. Plan-level, so one check covers every page.
  const notes = storeys[0]?.ir.notes;
  const noteLines = notes ? noteLineCount(notes) : 0;
  if (noteLines > MAX_NOTE_LINES) {
    return {
      severity: "error",
      message:
        `The \`notes\` wrap to more than ${MAX_NOTE_LINES} lines of ${NOTE_LINE_CHARS} characters, the most a ` +
        "sheet may draw; shorten them, or keep the long text in a separate document and reference it in one note",
      code: "E_DRAWING_LIMIT",
      ...(headerSpan ? { span: headerSpan } : {}),
    };
  }
  let total = 0;
  let over: { el?: ResolvedElement; level?: number } | undefined;
  for (const s of storeys) {
    for (const el of drawnView(s.ir).elements) {
      total += drawUnits(el, registry);
      if (over === undefined && total > MAX_DRAW_UNITS) over = { el, level: s.level };
    }
    total += storeyPassUnits(s.ir, registry);
    if (over === undefined && total > MAX_DRAW_UNITS) over = { level: s.level };
  }
  if (over === undefined) return undefined;
  const { el, level } = over;
  const span = el ? (el as { span?: Span }).span : headerSpan;
  const at = el ? `${el.kind} "${el.id}"` : "the plan-wide annotation (dims, axes, tables)";
  return {
    severity: "error",
    message:
      `The drawing is estimated at ${fmt3(total)} primitives, past the budget of ${MAX_DRAW_UNITS} a plan may draw ` +
      `(crossed at ${at}); a drawing this large would exhaust memory — split it into separate plans, ` +
      "or draw fewer or shorter runs",
    code: "E_DRAWING_LIMIT",
    ...(span ? { span } : {}),
    ...(el?._file ? { file: el._file } : {}),
    ...(level !== undefined ? { level } : {}),
  };
}
