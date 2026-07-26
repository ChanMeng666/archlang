/**
 * **Sheet tables** — the ROOM SCHEDULE and the derived LEGEND.
 *
 * A professional floor-plan sheet is not just the drawing: it carries tabular blocks in
 * the margin that let a reader audit the plan without measuring it. GB/T 50104 sheets
 * pair the plan with a room schedule (房间明细表 — number, name, area) and a legend of the
 * hatches and symbols actually used. Both are **opt-in plan settings** (`schedule rooms`,
 * `legend`); a plan that sets neither renders byte-identically to before.
 *
 * Two halves, split the same way {@link import("./axes.js")} splits positions from labels:
 *
 * - **The rows are DERIVED, closed-form, from what the plan already contains** — never
 *   authored, never guessed (ADR 0005: facts, no invisible architect). Schedule rows are
 *   the rooms in source order; legend rows are exactly the hatch specs the walls use and
 *   exactly the fixture categories the furniture draws a symbol for. Nothing appears in a
 *   table that is not in the drawing, and nothing in the drawing is silently left out.
 * - **The opt-in is authored.** The compiler never decides a sheet wants a schedule.
 *
 * Everything is emitted as ordinary Scene primitives on the `annotations` pass, so all
 * four backends (SVG, PNG, PDF, DXF) draw the tables from the one implementation here
 * rather than each re-deriving the geometry the way the title block still is. The ASCII
 * backend reads only the fabric layers, so `-f txt` stays chrome-free.
 *
 * Pure and deterministic: sizes all step off {@link RenderSizes}, so a future
 * paper/scale-driven `sizes` flows through unchanged, and numbers route through
 * {@link fmt2}. Text is drawn in ASCII + `m²` only — the PNG backend rasterizes with a
 * bundled Roboto that carries no CJK, the same portability constraint that keeps the axis
 * bubbles off `①`/`Ⓐ`.
 */

import type { Point } from "./ast.js";
import type { Bounds } from "./geometry.js";
import type { HatchSpec } from "./hatches.js";
import { patternId } from "./hatches.js";
import type { RFurniture, RRoom } from "./ir.js";
import type { RenderSizes, SceneNode } from "./scene.js";
import type { Theme } from "./theme.js";
import { FIXTURE_CATEGORIES, fixtureGlyph } from "./elements/fixtures-glyphs.js";
import { fmt2 } from "./num-format.js";
import { roomAreaMm2 } from "./analyze.js";

/** Round to 2 decimals, deterministically — the same rounding `describe()` applies. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

// ---- schedule data -----------------------------------------------------------

/** One ROOM SCHEDULE line: the drawn number, the room it names, and its area. */
export interface ScheduleRow {
  /**
   * The schedule number as drawn — 1-based source position, zero-padded to a uniform
   * width across the whole table (`01 … 09`, `001 … 100`), so the column reads as a
   * column. Level-prefixed numbers (`1-01`) belong with the levels feature; when it
   * lands, prefix here rather than renumbering.
   */
  no: string;
  /** The room's resolved id (the handle every other `describe()` fact keys off). */
  id: string;
  /** The printed name: the room's `label`, falling back to its id when unlabelled. */
  name: string;
  /** Floor area in m², rounded to 2dp — byte-identical to `describe().rooms[].area_m2`. */
  area_m2: number;
  /**
   * Dotted path of the **innermost** `zone` the room was declared in (v1.22), when the
   * plan declares zones. Absent for an unzoned room and for every plan that declares no
   * zone at all, so an existing schedule is unchanged.
   */
  zone?: string;
}

/**
 * One group of a zone-grouped ROOM SCHEDULE: a run of consecutive {@link ScheduleRow}s
 * that share an innermost zone, plus the subtotal row that closes it.
 *
 * Groups **partition** the rooms — every room is in exactly one, keyed on its innermost
 * zone — so the subtotals add up to the table's TOTAL. (`describe().zones` is the other
 * view: a rollup where a nested zone's rooms count toward its ancestors too.)
 */
export interface ScheduleGroup {
  /** The zone path this group is, or absent for the trailing un-zoned rooms. */
  path?: string;
  /** The printed heading: the zone's label, else its path (else "(no zone)"). */
  name: string;
  /** How many consecutive rows belong to it (they start where the previous group ended). */
  count: number;
  /** Sum of this group's rounded areas, rounded the same way {@link RoomSchedule.total_m2} is. */
  subtotal_m2: number;
}

/** The whole ROOM SCHEDULE as data: its rows plus the total that closes it. */
export interface RoomSchedule {
  rows: ScheduleRow[];
  /**
   * Sum of the rows' (already-rounded) areas, re-rounded — computed exactly the way
   * `describe().totals.floor_area_m2` is, so the drawn TOTAL and the JSON total can
   * never disagree by a rounding step.
   */
  total_m2: number;
  /**
   * Zone groups, when the plan declares zones AND at least one room sits in one. Empty
   * otherwise — which is what keeps an unzoned plan's table (and its bytes) unchanged.
   */
  groups: ScheduleGroup[];
}

/**
 * Derive the room schedule from the resolved rooms. Pure tallying: area is the room
 * rectangle in m², the same expression `describe()` uses, so the table and the semantic
 * summary are one number.
 *
 * **Without zones** the rows are the rooms in **source order** — unchanged, byte for byte.
 *
 * **With zones** (`zones` given and some room declared inside one) the rows are grouped:
 * one block per innermost zone in the plan's zone-declaration order, then a trailing block
 * of un-zoned rooms. `no` is then the row's position in the TABLE (which is what the
 * number labels), not in the source. A zone that owns no room directly gets no block — a
 * heading with nothing under it would be a lie about the drawing.
 */
export function roomSchedule(rooms: readonly RRoom[], zones?: readonly ZoneRef[]): RoomSchedule {
  const grouped = groupRoomsByZone(rooms, zones);
  const ordered = grouped ? grouped.flatMap((g) => g.rooms) : rooms;
  const width = Math.max(2, String(ordered.length).length);
  const rows: ScheduleRow[] = ordered.map((r, i) => ({
    no: String(i + 1).padStart(width, "0"),
    id: r.id,
    name: r.label ?? r.id,
    area_m2: r2(roomAreaMm2(r) / 1_000_000),
    ...(r._zone !== undefined ? { zone: r._zone } : {}),
  }));
  const total_m2 = r2(rows.reduce((s, r) => s + r.area_m2, 0));
  if (!grouped) return { rows, total_m2, groups: [] };

  const groups: ScheduleGroup[] = [];
  let at = 0;
  for (const g of grouped) {
    const slice = rows.slice(at, at + g.rooms.length);
    groups.push({
      ...(g.path !== undefined ? { path: g.path } : {}),
      name: g.name,
      count: slice.length,
      subtotal_m2: r2(slice.reduce((s, r) => s + r.area_m2, 0)),
    });
    at += g.rooms.length;
  }
  return { rows, total_m2, groups };
}

/** The zone facts the schedule needs — structurally `RZone` from the IR, restated here so
 *  this module keeps depending only on data it actually reads. */
interface ZoneRef {
  path: string;
  label?: string;
}

/**
 * Partition the rooms by their INNERMOST declared zone, in the plan's zone-declaration
 * order, with un-zoned rooms in a final block. Returns null when there is nothing to
 * group (no zones declared, or no room inside one) — the signal that keeps the ungrouped
 * table byte-identical. Rooms stay in source order within their block.
 */
function groupRoomsByZone(
  rooms: readonly RRoom[],
  zones: readonly ZoneRef[] | undefined,
): { path?: string; name: string; rooms: RRoom[] }[] | null {
  if (!zones || zones.length === 0) return null;
  if (!rooms.some((r) => r._zone !== undefined)) return null;
  const out: { path?: string; name: string; rooms: RRoom[] }[] = [];
  for (const z of zones) {
    const members = rooms.filter((r) => r._zone === z.path);
    if (members.length > 0) out.push({ path: z.path, name: z.label ?? z.path, rooms: members });
  }
  // A room whose declared zone is not in `zones` cannot exist (the ledger is filled by the
  // very expansion that stamps membership), so the remainder is exactly the un-zoned rooms.
  const loose = rooms.filter((r) => r._zone === undefined);
  if (loose.length > 0) out.push({ name: "(no zone)", rooms: loose });
  return out;
}

// ---- legend data -------------------------------------------------------------

/** One LEGEND line: a drawn swatch plus what it means. */
export interface LegendEntry {
  /** `material` draws the wall hatch pattern; `fixture` draws the fixture plan symbol. */
  kind: "material" | "fixture";
  /** Stable identity (the hatch pattern id, or the fixture category). */
  key: string;
  /** The printed name. */
  name: string;
  /** The hatch to fill the swatch with (`material` entries only). */
  hatch?: HatchSpec;
  /** The fixture category whose glyph fills the swatch (`fixture` entries only). */
  category?: string;
}

/** A hatch spec's printed name: the material, qualified only when it is not the default
 *  scale/angle (so two specs of one material never collapse to the same label). */
function hatchName(h: HatchSpec): string {
  let s = h.material;
  if (h.scale !== 1) s += ` x${fmt2(h.scale)}`;
  if (h.angle !== 0) s += ` @${fmt2(h.angle)}°`;
  return s;
}

/**
 * Derive the legend from what the drawing actually contains:
 *
 * 1. **Materials** — one row per distinct hatch spec in use, in the Scene's own stable
 *    (key-sorted) `hatches` order, so the swatch can reuse the very `<pattern>` the walls
 *    are filled with. A plan with one poché gets one row.
 * 2. **Fixtures** — one row per distinct furniture category present that
 *    {@link fixtureGlyph} draws a dedicated symbol for, in {@link FIXTURE_CATEGORIES}
 *    (catalog) order — NOT source order, so the legend reads as a stable reference list
 *    while the schedule reads as the plan. A category with no symbol draws a plain
 *    labelled rectangle in the plan, which needs no legend row, so it gets none; a plan
 *    with no fixtures at all yields no fixture rows.
 */
export function legendEntries(hatches: readonly HatchSpec[], furniture: readonly RFurniture[]): LegendEntry[] {
  const out: LegendEntry[] = [];
  for (const h of hatches) {
    out.push({ kind: "material", key: patternId(h.material, h.scale, h.angle), name: hatchName(h), hatch: h });
  }
  const present = new Set(furniture.map((f) => f.category));
  for (const cat of FIXTURE_CATEGORIES) {
    if (present.has(cat)) out.push({ kind: "fixture", key: cat, name: cat, category: cat });
  }
  return out;
}

// ---- layout ------------------------------------------------------------------

/** One schedule column: its heading, width in mm, and how its cells are aligned. */
export interface TableColumn {
  heading: string;
  w: number;
  align: "start" | "middle" | "end";
}

/** Geometry shared by both tables (a framed, ruled box of uniform rows). */
export interface TableBox {
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Uniform row height (the caption, headings, every data row and the total row). */
  rowH: number;
  /** Body text size; headings render at 0.8× (matching the title block). */
  fs: number;
  /** Horizontal cell padding. */
  pad: number;
  /** The all-caps caption drawn in the merged first row. */
  caption: string;
}

export interface ScheduleTableBox extends TableBox {
  cols: TableColumn[];
  rows: ScheduleRow[];
  total_m2: number;
  /** Zone groups, in row order; empty for an unzoned plan (which draws the flat table). */
  groups: ScheduleGroup[];
}

export interface LegendTableBox extends TableBox {
  entries: LegendEntry[];
  /** Width of the swatch column; the swatch itself is inset within it. */
  swatchW: number;
}

/** The laid-out sheet tables, plus the box they occupy (what the margins must contain). */
export interface SheetTables {
  schedule: ScheduleTableBox | null;
  legend: LegendTableBox | null;
  /** Left-most x any table starts at (both share it — they sit in one row). */
  left: number;
  /** Top y of the row (both tables share it). */
  top: number;
  /** Bottom-most y any table reaches. */
  bottom: number;
  /** Right-most x any table reaches. */
  right: number;
}

export interface SheetTablesInput {
  bounds: Bounds;
  refDim: number;
  /** Top of the table row — below the scale bar / title block band. */
  top: number;
  schedule?: RoomSchedule | null;
  legend?: readonly LegendEntry[] | null;
}

/** Table metrics as fractions of the drawing's reference dimension (see `RenderSizes`). */
const ROW_H = 0.034;
/** Body font — the title block's, so the two blocks read as one sheet. */
const FONT = 0.019;
const COL_NO = 0.055;
const COL_NAME = 0.2;
const COL_AREA = 0.105;
const LEGEND_SWATCH = 0.05;
const LEGEND_NAME = 0.22;
/** Gap between the two tables when both are drawn. */
const TABLE_GAP = 0.03;

/**
 * Lay the tables out side by side in a row starting at `top`: the schedule at the sheet's
 * left edge, the legend to its right. Returns null when neither is requested, which is
 * what keeps an opted-out plan's margins (and therefore its bytes) unchanged.
 */
export function layoutSheetTables(input: SheetTablesInput): SheetTables | null {
  const { bounds: b, refDim, top } = input;
  const sched = input.schedule ?? null;
  const legendRows = input.legend ?? null;
  if (!sched && !legendRows) return null;

  const rowH = refDim * ROW_H;
  const fs = refDim * FONT;
  let x = b.minX;
  let bottom = top;

  let schedule: ScheduleTableBox | null = null;
  if (sched) {
    const cols: TableColumn[] = [
      { heading: "NO.", w: refDim * COL_NO, align: "middle" },
      { heading: "NAME", w: refDim * COL_NAME, align: "start" },
      { heading: "AREA (m²)", w: refDim * COL_AREA, align: "end" },
    ];
    const w = cols.reduce((s, c) => s + c.w, 0);
    // Rows: caption + column headings + one per room + the TOTAL that closes the table.
    // Each zone group adds two more: its heading and its subtotal (none when unzoned, so
    // the height — and therefore the whole sheet's layout — is unchanged).
    const h = rowH * (3 + sched.rows.length + 2 * sched.groups.length);
    schedule = {
      x0: x,
      y0: top,
      w,
      h,
      rowH,
      fs,
      pad: w * 0.02,
      caption: "ROOM SCHEDULE",
      cols,
      rows: sched.rows,
      total_m2: sched.total_m2,
      groups: sched.groups,
    };
    x += w + refDim * TABLE_GAP;
    bottom = Math.max(bottom, top + h);
  }

  let legend: LegendTableBox | null = null;
  if (legendRows) {
    const swatchW = refDim * LEGEND_SWATCH;
    const w = swatchW + refDim * LEGEND_NAME;
    const h = rowH * (1 + legendRows.length);
    legend = {
      x0: x,
      y0: top,
      w,
      h,
      rowH,
      fs,
      pad: w * 0.02,
      caption: "LEGEND",
      entries: [...legendRows],
      swatchW,
    };
    x += w;
    bottom = Math.max(bottom, top + h);
  }

  return { schedule, legend, left: b.minX, top, bottom, right: x };
}

/**
 * Translate the whole laid-out row by `(dx, dy)`, rigidly. The paper layer uses this to
 * re-anchor the tables onto a sheet's margin once the bottom band moves to the sheet's
 * corners (`anchorChromeToSheet`) — a pure move, so every rule and glyph stays in
 * register with its box and no metric is recomputed.
 */
export function translateSheetTables(t: SheetTables, dx: number, dy: number): SheetTables {
  const move = <T extends { x0: number; y0: number }>(box: T): T => ({ ...box, x0: box.x0 + dx, y0: box.y0 + dy });
  return {
    schedule: t.schedule ? move(t.schedule) : null,
    legend: t.legend ? move(t.legend) : null,
    left: t.left + dx,
    top: t.top + dy,
    bottom: t.bottom + dy,
    right: t.right + dx,
  };
}

// ---- lowering to Scene nodes -------------------------------------------------

/** A table cell's text anchor x within `[x0, x0+w]` for the given alignment. */
function anchorX(x0: number, w: number, pad: number, align: TableColumn["align"]): number {
  if (align === "start") return x0 + pad;
  if (align === "end") return x0 + w - pad;
  return x0 + w / 2;
}

/** Scene-node helpers bound to one table's paint, so both tables draw identically. */
function drawer(theme: Theme, sizes: RenderSizes, out: SceneNode[]) {
  const ink = theme.annotation;
  const muted = theme.annotationMuted;
  return {
    /** The table frame (a closed loop — one DXF polyline, one SVG polygon). */
    frame(x0: number, y0: number, w: number, h: number): void {
      out.push({
        layer: "annotations",
        prim: {
          t: "polygon",
          pts: [
            { x: x0, y: y0 },
            { x: x0 + w, y: y0 },
            { x: x0 + w, y: y0 + h },
            { x: x0, y: y0 + h },
          ],
        },
        paint: { fill: "none", stroke: ink, width: sizes.thin },
        lineWeight: "thin",
      });
    },
    rule(a: Point, b: Point, hairline = false): void {
      out.push({
        layer: "annotations",
        prim: { t: "line", a, b },
        paint: { stroke: ink, width: sizes.thin * (hairline ? 0.5 : 1) },
        lineWeight: hairline ? "extraThin" : "thin",
      });
    },
    text(
      at: Point,
      value: string,
      size: number,
      anchor: "start" | "middle" | "end",
      opts: { weight?: number; muted?: boolean } = {},
    ): void {
      out.push({
        layer: "annotations",
        prim: {
          t: "text",
          at,
          value,
          size,
          anchor,
          baseline: "central",
          ...(opts.weight !== undefined ? { weight: opts.weight } : {}),
        },
        paint: { fill: opts.muted ? muted : ink },
      });
    },
  };
}

/** Weight for a caption / heading / total row (matching the room-name label weight). */
const BOLD = 600;

/**
 * An area cell: always two decimal places, so the column reads as a column
 * (`12.00`, not `12`). Deterministic — the input is the row's already-`r2`-rounded
 * number, so fixing it to the same 2dp cannot drift (the idiom the in-plan area label
 * uses at 1dp). {@link fmt2} stays the formatter for every *geometric* number here.
 */
const areaCell = (m2: number): string => m2.toFixed(2);

/**
 * The ROOM SCHEDULE table's primitives.
 *
 * Two shapes, one number set. With no zone groups this is the flat table, emitted exactly
 * as it always was (the ungrouped path below is untouched, which is what makes an unzoned
 * plan byte-identical); with groups it delegates to {@link groupedScheduleNodes}, whose
 * merged heading rows need column rules segmented per block rather than run full height.
 */
function scheduleNodes(t: ScheduleTableBox, theme: Theme, sizes: RenderSizes, out: SceneNode[]): void {
  if (t.groups.length > 0) {
    groupedScheduleNodes(t, theme, sizes, out);
    return;
  }
  const d = drawer(theme, sizes, out);
  const { x0, y0, w, h, rowH, fs, pad } = t;
  d.frame(x0, y0, w, h);

  // Row 0 caption (merged across all columns), row 1 the column headings.
  const rowMid = (i: number): number => y0 + rowH * (i + 0.5);
  d.text({ x: x0 + pad, y: rowMid(0) }, t.caption, fs, "start", { weight: BOLD });
  d.rule({ x: x0, y: y0 + rowH }, { x: x0 + w, y: y0 + rowH });

  // The TOTAL row is the last one; the merged caption row is the first. Column rules run
  // between the two so neither merged cell is cut in half — except the rule bounding the
  // AREA column, which carries the total's value and so runs to the frame.
  const totalTop = y0 + h - rowH;
  let cx = x0;
  t.cols.forEach((c, i) => {
    d.text({ x: anchorX(cx, c.w, pad, c.align), y: rowMid(1) }, c.heading, fs * 0.8, c.align, {
      weight: BOLD,
      muted: true,
    });
    const last = i === t.cols.length - 1;
    if (i > 0) d.rule({ x: cx, y: y0 + rowH }, { x: cx, y: last ? y0 + h : totalTop }, true);
    cx += c.w;
  });
  d.rule({ x: x0, y: y0 + rowH * 2 }, { x: x0 + w, y: y0 + rowH * 2 });

  t.rows.forEach((r, i) => {
    const y = rowMid(2 + i);
    const cells = [r.no, r.name, areaCell(r.area_m2)];
    let x = x0;
    t.cols.forEach((c, ci) => {
      d.text({ x: anchorX(x, c.w, pad, c.align), y }, cells[ci]!, fs, c.align);
      x += c.w;
    });
    if (i > 0) d.rule({ x: x0, y: y0 + rowH * (2 + i) }, { x: x0 + w, y: y0 + rowH * (2 + i) }, true);
  });

  // TOTAL closes the table: the label spans the NO. + NAME columns, the value sits under
  // AREA. Same number as `describe().totals.floor_area_m2`.
  d.rule({ x: x0, y: totalTop }, { x: x0 + w, y: totalTop });
  const areaCol = t.cols[t.cols.length - 1]!;
  d.text({ x: x0 + pad, y: totalTop + rowH / 2 }, "TOTAL", fs, "start", { weight: BOLD });
  d.text(
    { x: anchorX(x0 + w - areaCol.w, areaCol.w, pad, areaCol.align), y: totalTop + rowH / 2 },
    areaCell(t.total_m2),
    fs,
    areaCol.align,
    { weight: BOLD },
  );
}

/**
 * The ZONE-GROUPED ROOM SCHEDULE (v1.22): the same table, with each zone's rooms under a
 * merged heading row and closed by a SUBTOTAL row, before the TOTAL that closes the table.
 *
 * The subtotals **partition** the rooms (each room sits under its innermost zone exactly
 * once), so they add up to the TOTAL — a reader can audit the wing without re-measuring.
 * Column rules are drawn per data block rather than full height, so no merged cell (the
 * caption, a group heading, a subtotal label) is ever cut in half.
 */
function groupedScheduleNodes(t: ScheduleTableBox, theme: Theme, sizes: RenderSizes, out: SceneNode[]): void {
  const d = drawer(theme, sizes, out);
  const { x0, y0, w, h, rowH, fs, pad } = t;
  d.frame(x0, y0, w, h);

  const rowTop = (i: number): number => y0 + rowH * i;
  const rowMid = (i: number): number => y0 + rowH * (i + 0.5);

  // Rows 0/1: the merged caption and the column headings (identical to the flat table).
  d.text({ x: x0 + pad, y: rowMid(0) }, t.caption, fs, "start", { weight: BOLD });
  d.rule({ x: x0, y: rowTop(1) }, { x: x0 + w, y: rowTop(1) });
  let cx = x0;
  for (const c of t.cols) {
    d.text({ x: anchorX(cx, c.w, pad, c.align), y: rowMid(1) }, c.heading, fs * 0.8, c.align, {
      weight: BOLD,
      muted: true,
    });
    cx += c.w;
  }
  d.rule({ x: x0, y: rowTop(2) }, { x: x0 + w, y: rowTop(2) });

  const areaCol = t.cols[t.cols.length - 1]!;
  const areaX = anchorX(x0 + w - areaCol.w, areaCol.w, pad, areaCol.align);

  // One block per group: heading, its rows, its subtotal.
  let row = 2;
  let firstRow = 0;
  for (const g of t.groups) {
    if (row > 2) d.rule({ x: x0, y: rowTop(row) }, { x: x0 + w, y: rowTop(row) });
    d.text({ x: x0 + pad, y: rowMid(row) }, g.name, fs, "start", { weight: BOLD, muted: true });
    row++;

    const dataTop = rowTop(row);
    for (let i = 0; i < g.count; i++) {
      const r = t.rows[firstRow + i]!;
      if (i > 0) d.rule({ x: x0, y: rowTop(row) }, { x: x0 + w, y: rowTop(row) }, true);
      const cells = [r.no, r.name, areaCell(r.area_m2)];
      let x = x0;
      t.cols.forEach((c, ci) => {
        d.text({ x: anchorX(x, c.w, pad, c.align), y: rowMid(row) }, cells[ci]!, fs, c.align);
        x += c.w;
      });
      row++;
    }
    firstRow += g.count;

    // Column rules span only this block's data rows, so the merged heading/subtotal
    // rows above and below stay whole.
    const dataBottom = rowTop(row);
    let vx = x0;
    t.cols.forEach((c, i) => {
      if (i > 0) d.rule({ x: vx, y: dataTop }, { x: vx, y: dataBottom }, true);
      vx += c.w;
    });

    d.rule({ x: x0, y: dataBottom }, { x: x0 + w, y: dataBottom }, true);
    d.text({ x: x0 + pad, y: rowMid(row) }, "SUBTOTAL", fs, "start", { weight: BOLD, muted: true });
    d.text({ x: areaX, y: rowMid(row) }, areaCell(g.subtotal_m2), fs, areaCol.align, { weight: BOLD, muted: true });
    row++;
  }

  // TOTAL closes the table — the same number as `describe().totals.floor_area_m2`, and
  // the sum of the subtotals above it.
  const totalTop = y0 + h - rowH;
  d.rule({ x: x0, y: totalTop }, { x: x0 + w, y: totalTop });
  d.text({ x: x0 + pad, y: totalTop + rowH / 2 }, "TOTAL", fs, "start", { weight: BOLD });
  d.text({ x: areaX, y: totalTop + rowH / 2 }, areaCell(t.total_m2), fs, areaCol.align, { weight: BOLD });
}

/** The LEGEND table's primitives — each row a real swatch beside its name. */
function legendNodes(t: LegendTableBox, theme: Theme, sizes: RenderSizes, out: SceneNode[]): void {
  const d = drawer(theme, sizes, out);
  const { x0, y0, w, h, rowH, fs, pad, swatchW } = t;
  d.frame(x0, y0, w, h);
  d.text({ x: x0 + pad, y: y0 + rowH * 0.5 }, t.caption, fs, "start", { weight: BOLD });
  d.rule({ x: x0, y: y0 + rowH }, { x: x0 + w, y: y0 + rowH });

  // The swatch box, inset inside the swatch column so adjacent rows never touch.
  const inset = rowH * 0.2;
  t.entries.forEach((e, i) => {
    const top = y0 + rowH * (1 + i);
    if (i > 0) d.rule({ x: x0, y: top }, { x: x0 + w, y: top }, true);
    const box = { x: x0 + pad, y: top + inset, w: swatchW - pad * 2, h: rowH - inset * 2 };
    const loop: Point[] = [
      { x: box.x, y: box.y },
      { x: box.x + box.w, y: box.y },
      { x: box.x + box.w, y: box.y + box.h },
      { x: box.x, y: box.y + box.h },
    ];
    if (e.kind === "material" && e.hatch) {
      // Fill with the very pattern the walls use (the id is already in `scene.hatches`,
      // so the SVG `<defs>` carries it and the DXF gets a real HATCH entity).
      const hp = e.hatch;
      out.push({
        layer: "annotations",
        prim: { t: "hatch", region: [loop], material: hp.material, scale: hp.scale, angle: hp.angle },
        paint: { fill: `url(#${patternId(hp.material, hp.scale, hp.angle)})`, fillRule: "nonzero" },
      });
      d.frame(box.x, box.y, box.w, box.h);
    } else if (e.kind === "fixture" && e.category) {
      // The real plan symbol, drawn into the swatch box and re-tagged onto the annotation
      // pass — so the legend can never drift from what the drawing actually paints.
      const glyph = fixtureGlyph(e.category, box, theme, sizes);
      if (glyph) out.push(...glyph.map((n) => ({ ...n, layer: "annotations" as const })));
      else d.frame(box.x, box.y, box.w, box.h);
    }
    d.text({ x: x0 + swatchW + pad, y: top + rowH * 0.5 }, e.name, fs, "start");
  });
}

/**
 * Lower the laid-out tables to Scene primitives on the `annotations` pass (the last pass,
 * so a table always reads on top). Every backend that walks `RENDER_PASSES` gets them for
 * free; nothing is emitted when neither table is present.
 */
export function sheetTableNodes(t: SheetTables, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const out: SceneNode[] = [];
  if (t.schedule) scheduleNodes(t.schedule, theme, sizes, out);
  if (t.legend) legendNodes(t.legend, theme, sizes, out);
  return out;
}
