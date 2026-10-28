/**
 * **Sheet tables** — the ROOM SCHEDULE and the derived LEGEND, and beside them the DOOR &
 * WINDOW SCHEDULE (`schedule openings`, rows from `opening-schedule.ts`) and the authored
 * NOTES (`notes "…"`), each drawn only when the plan writes it.
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
import type { BandWall } from "./geometry/band.js";
import type { HatchSpec } from "./hatches.js";
import { groundSwatchFrame, hatchesUsed, patternId } from "./hatches.js";
import type { ROutdoor, RFurniture, RRoom } from "./ir.js";
import { groundMaterialsUsed } from "./elements/outdoor.js";
import { weightWidth } from "./scene.js";
import type { RenderSizes, SceneNode } from "./scene.js";
import type { Theme } from "./theme.js";
import { FIXTURE_CATEGORIES, fixtureGlyph, hasFixtureGlyph } from "./elements/fixtures-glyphs.js";
import { fmt2 } from "./num-format.js";
import { roomAreaMm2 } from "./analyze.js";
import { memoRoomNetAreaMm2, storeyNetAreaBands } from "./analyze/net-area-memo.js";
import { openingCount, type OpeningRow } from "./opening-schedule.js";
import { textWidth } from "./text-metrics.js";

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
   * Net internal area in m², rounded to 2dp — byte-identical to `describe().rooms[].net_area_m2`,
   * and absent exactly when that is (the drawn cell then reads `-`).
   */
  net_area_m2?: number;
  /**
   * Dotted path of the **innermost** `zone` the room was declared in, when the
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
  /** Sum of this group's rounded NET areas, rounded the same way; absent when any row's is. */
  net_subtotal_m2?: number;
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
   * Sum of the rows' rounded NET areas, re-rounded — `describe().totals.net_floor_area_m2`.
   * Absent when any row's net area is, never a sum over a subset.
   */
  net_total_m2?: number;
  /**
   * Zone groups, when the plan declares zones AND at least one room sits in one. Empty
   * otherwise — which is what keeps an unzoned plan's table (and its bytes) unchanged.
   */
  groups: ScheduleGroup[];
}

/**
 * Derive the room schedule from the resolved rooms. Pure tallying: area is the room's own
 * area in m² and the net area that shape less what the bands of `walls` (the storey's walls)
 * cover, the same two expressions `describe()` uses, so the table and the semantic summary
 * are one set of numbers.
 *
 * **Without zones** the rows are the rooms in **source order** — unchanged, byte for byte.
 *
 * **With zones** (`zones` given and some room declared inside one) the rows are grouped:
 * one block per innermost zone in the plan's zone-declaration order, then a trailing block
 * of un-zoned rooms. `no` is then the row's position in the TABLE (which is what the
 * number labels), not in the source. A zone that owns no room directly gets no block — a
 * heading with nothing under it would be a lie about the drawing.
 */
export function roomSchedule(
  rooms: readonly RRoom[],
  zones?: readonly ZoneRef[],
  // Optional because this is public API that predates net area. Without the walls nothing
  // is known about what stands on the floor, so no row carries `net_area_m2` and there is
  // no net total — omitted, never assumed equal to `area_m2`. Every caller in this
  // repository passes the storey's walls.
  walls?: readonly BandWall[],
): RoomSchedule {
  const grouped = groupRoomsByZone(rooms, zones);
  const ordered = grouped ? grouped.flatMap((g) => g.rooms) : rooms;
  const width = Math.max(2, String(ordered.length).length);
  const bands = walls ? storeyNetAreaBands(walls) : null;
  const rows: ScheduleRow[] = ordered.map((r, i) => {
    const net = bands ? memoRoomNetAreaMm2(r, bands) : undefined;
    return {
      no: String(i + 1).padStart(width, "0"),
      id: r.id,
      name: r.label ?? r.id,
      area_m2: r2(roomAreaMm2(r) / 1_000_000),
      ...(net !== undefined ? { net_area_m2: r2(net / 1_000_000) } : {}),
      ...(r._zone !== undefined ? { zone: r._zone } : {}),
    };
  });
  const total_m2 = r2(rows.reduce((s, r) => s + r.area_m2, 0));
  const net = netSum(rows);
  if (!grouped) return { rows, total_m2, ...net.total, groups: [] };

  const groups: ScheduleGroup[] = [];
  let at = 0;
  for (const g of grouped) {
    const slice = rows.slice(at, at + g.rooms.length);
    groups.push({
      ...(g.path !== undefined ? { path: g.path } : {}),
      name: g.name,
      count: slice.length,
      subtotal_m2: r2(slice.reduce((s, r) => s + r.area_m2, 0)),
      ...(netSum(slice).sum !== undefined ? { net_subtotal_m2: netSum(slice).sum } : {}),
    });
    at += g.rooms.length;
  }
  return { rows, total_m2, ...net.total, groups };
}

/** The rounded sum of the rows' net areas, or none when any row's is omitted. */
function netSum(rows: readonly ScheduleRow[]): { sum?: number; total: { net_total_m2?: number } } {
  if (!rows.every((r) => r.net_area_m2 !== undefined)) return { total: {} };
  const sum = r2(rows.reduce((s, r) => s + (r.net_area_m2 ?? 0), 0));
  return { sum, total: { net_total_m2: sum } };
}

/** The zone facts the schedule needs — structurally `RZone` from the IR, restated here so
 *  this module keeps depending only on data it actually reads. */
interface ZoneRef {
  path: string;
  label?: string;
  /** A `place`d instance's implicit namespace, not an author-written `zone` block. */
  instance?: boolean;
}

/**
 * The zone a room is GROUPED under: the innermost one its author actually declared.
 *
 * A `place`d instance is a zone (that is how `describe --zone c4` addresses its contents),
 * but it is not a heading anybody wants in a table. Six placed consult rooms produced six
 * one-row groups with six subtotals, and `examples/clinic.arch` shipped a `legend` instead
 * of a `schedule` because of it. So an instance segment is TRANSPARENT here: walk out
 * through them to the nearest written `zone`, and return undefined when there is none —
 * which drops the instance's rooms into the un-zoned tail, where a reader expects rooms
 * nobody grouped.
 *
 * Only the TABLE is affected. `describe().zones` still reports every instance zone with its
 * rolled-up rooms and areas, and `--zone` still filters by them.
 */
function groupingZone(zone: string | undefined, declared: ReadonlyMap<string, ZoneRef>): string | undefined {
  let path = zone;
  while (path !== undefined) {
    if (declared.get(path)?.instance !== true) return path;
    const cut = path.lastIndexOf(".");
    path = cut < 0 ? undefined : path.slice(0, cut);
  }
  return undefined;
}

/**
 * Partition the rooms by their innermost AUTHOR-DECLARED zone (see {@link groupingZone}),
 * in the plan's zone-declaration order, with un-zoned rooms in a final block. Returns null
 * when there is nothing to group (no zones declared, no room inside one, or every zone a
 * `place` instance) — the signal that keeps the ungrouped table byte-identical. Rooms stay
 * in source order within their block.
 */
function groupRoomsByZone(
  rooms: readonly RRoom[],
  zones: readonly ZoneRef[] | undefined,
): { path?: string; name: string; rooms: RRoom[] }[] | null {
  if (!zones || zones.length === 0) return null;
  const declared = new Map(zones.map((z) => [z.path, z]));
  const groupOf = new Map(rooms.map((r) => [r, groupingZone(r._zone, declared)]));
  if (![...groupOf.values()].some((g) => g !== undefined)) return null;
  const out: { path?: string; name: string; rooms: RRoom[] }[] = [];
  for (const z of zones) {
    if (z.instance === true) continue; // never its own heading — its rooms sit in an ancestor
    const members = rooms.filter((r) => groupOf.get(r) === z.path);
    if (members.length > 0) out.push({ path: z.path, name: z.label ?? z.path, rooms: members });
  }
  // A room whose declared zone is not in `zones` cannot exist (the ledger is filled by the
  // very expansion that stamps membership), so the remainder is exactly the rooms no
  // written `zone` encloses — un-zoned, or inside nothing but instances.
  const loose = rooms.filter((r) => groupOf.get(r) === undefined);
  if (loose.length > 0) out.push({ name: "(no zone)", rooms: loose });
  return out;
}

// ---- legend data -------------------------------------------------------------

/** One LEGEND line: a drawn swatch plus what it means. */
export interface LegendEntry {
  /** `material` draws the wall hatch pattern; `fixture` draws the fixture plan symbol;
   *  `demolished` draws a dashed wall outline (a `status demolish` wall, as the plan draws it). */
  kind: "material" | "fixture" | "demolished";
  /** Stable identity (the hatch pattern id, the fixture category, or `demolish`). */
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
 *
 * That last rule is why the filter is `hasFixtureGlyph` and not membership of
 * `FIXTURE_CATEGORIES`. The two used to be the same set — every catalogued category drew a
 * symbol — and they no longer are: a category can be catalogued (a footprint, a wall
 * requirement, lint semantics) with its symbol not written yet. Keying the legend off
 * membership would print a row with an empty swatch beside a piece the drawing renders as a
 * labelled box, which is exactly the "needs no legend row" case this rule already excluded.
 *
 * 3. **Demolition** — one `demolished` row after the materials when the storey draws a
 *    `status demolish` wall (`demolished`), and none otherwise, so a plan that writes no status
 *    keeps its legend. `hatches` are then the STANDING walls' (a demolished wall draws no
 *    poché). A `status new` wall draws as any wall, so it adds no row: a row whose swatch
 *    the drawing cannot tell from an existing wall's would claim a distinction it does not make.
 */
export function legendEntries(
  hatches: readonly HatchSpec[],
  furniture: readonly RFurniture[],
  demolished = false,
): LegendEntry[] {
  const out: LegendEntry[] = [];
  for (const h of hatches) {
    out.push({ kind: "material", key: patternId(h.material, h.scale, h.angle), name: hatchName(h), hatch: h });
  }
  if (demolished) out.push({ kind: "demolished", key: "demolish", name: "demolished" });
  const present = new Set(furniture.map((f) => f.category));
  for (const cat of FIXTURE_CATEGORIES) {
    if (present.has(cat) && hasFixtureGlyph(cat)) out.push({ kind: "fixture", key: cat, name: cat, category: cat });
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
  net_total_m2?: number;
  /** Zone groups, in row order; empty for an unzoned plan (which draws the flat table). */
  groups: ScheduleGroup[];
}

export interface LegendTableBox extends TableBox {
  entries: LegendEntry[];
  /** Width of the swatch column; the swatch itself is inset within it. */
  swatchW: number;
}

/** The DOOR & WINDOW SCHEDULE (`schedule openings`): one row per tagged opening. */
export interface OpeningTableBox extends TableBox {
  cols: TableColumn[];
  rows: OpeningRow[];
}

/** The NOTES table (`notes "…"`): a number column and the note text, one drawn line per row. */
export interface NotesTableBox extends TableBox {
  /** Width of the number column (`1.`, `2.`, …). */
  noW: number;
  /** One entry per drawn line: the number on a note's first line (empty on a continuation
   *  line of a note written with `\n`), then the text. */
  lines: { no: string; text: string }[];
}

/** The laid-out sheet tables, plus the box they occupy (what the margins must contain). */
export interface SheetTables {
  schedule: ScheduleTableBox | null;
  /** Present only when the plan wrote `schedule openings`, so an existing layout's object
   *  (and the bytes drawn from it) is unchanged. */
  openings?: OpeningTableBox;
  legend: LegendTableBox | null;
  /** Present only when the plan wrote `notes`. */
  notes?: NotesTableBox;
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
  /** The DOOR & WINDOW SCHEDULE rows when the plan set `schedule openings`. */
  openings?: readonly OpeningRow[] | null;
  /** The plan's `notes`, when it wrote any. */
  notes?: readonly string[] | null;
}

/** Table metrics as fractions of the drawing's reference dimension (see `RenderSizes`). */
const ROW_H = 0.034;
/** Body font — the title block's, so the two blocks read as one sheet. */
const FONT = 0.019;
const COL_NO = 0.055;
const COL_NAME = 0.2;
/**
 * The two value columns are sized to their headings (0.8× the font): `AREA (CENTRELINE, m²)`
 * is 21 characters, `NET AREA (m²)` 13. The labels are the owner's (agent-reach decision 2):
 * one column says it runs to wall centrelines, the other that it is the floor inside them.
 */
const COL_AREA = 0.22;
const COL_NET = 0.14;
/**
 * The AREA column's width when the table's cell padding was fixed (it was 0.105 before the
 * centreline heading widened it). The padding stays 2% of NO. + NAME + this width, so
 * widening a value column never moves the NO. and NAME cells.
 */
const PAD_AREA_W = 0.105;
/** Index of the ROOM SCHEDULE's first value column (AREA); NET AREA follows it. */
const AREA_COL = 2;
const LEGEND_SWATCH = 0.05;
const LEGEND_NAME = 0.22;
/** DOOR & WINDOW SCHEDULE columns, every one a FIXED width: authored text (a room's name)
 *  is clipped to its column, never allowed to widen the table — or the page. */
const COL_TAG = 0.055;
const COL_ROOMS = 0.3;
const COL_WIDTH = 0.07;
const COL_TYPE = 0.08;
const COL_HAND = 0.06;
/** NOTES: the number column and the text column, both FIXED; a note wraps to the column. */
const NOTES_NO = 0.035;
const NOTES_TEXT = 0.7;

/**
 * How many characters fit a column `colFrac` of the reference dimension wide, at the table
 * font, leaving one font of padding — by the one shared width estimate (`textWidth` is
 * `characters × font × EM_PER_CHAR`). Both fractions scale with the sheet, so the answer is
 * the same at every paper, scale and theme: it is a fact of the text, which is what lets the
 * resolver's sheet fit and the drawing budget count wrapped NOTES lines with no drawing.
 */
const charsIn = (colFrac: number): number => Math.max(1, Math.floor((colFrac - FONT) / textWidth("x", FONT)));

/** Characters per NOTES line, and per ROOM(S) cell. */
export const NOTE_LINE_CHARS = charsIn(NOTES_TEXT);
const ROOMS_CELL_CHARS = charsIn(COL_ROOMS);

/**
 * The most wrapped NOTES lines a sheet may carry — about one A0 sheet's height of table.
 * Past it the plan is refused with `E_DRAWING_LIMIT` (`draw-budget.ts`), never drawn: a
 * NOTES table is bounded in width by its column and in height by this, so every coordinate
 * it draws stays a bounded multiple of the drawing's reference dimension.
 */
export const MAX_NOTE_LINES = 200;

/** A combining mark: it belongs to the letter before it. The common blocks — Combining
 *  Diacritical Marks and their Extended and Supplement blocks, those for symbols, half marks. */
const isMark = (c: number): boolean =>
  (c >= 0x0300 && c <= 0x036f) ||
  (c >= 0x1ab0 && c <= 0x1aff) ||
  (c >= 0x1dc0 && c <= 0x1dff) ||
  (c >= 0x20d0 && c <= 0x20ff) ||
  (c >= 0xfe20 && c <= 0xfe2f);
const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** How far back from the width a cut may look for a better place: a few units, never more. */
const CUT_LOOKBACK = 4;

/**
 * Where to cut `s` near `i` (strictly after `from`). Preferred: the last place in the few units
 * at or before `i` ({@link CUT_LOOKBACK}) where the next piece does not start with a combining
 * mark and no surrogate PAIR is split. Failing that — a long run of marks, say — the cut is made
 * at `i` anyway (a mark split from its letter is better than an unbounded line), except that a
 * real surrogate pair is never split: it moves one unit back, or forward when it cannot go back.
 * A run of LONE low surrogates is no pair, so it is cut like any other text. The result is
 * always in `(from, i + 1]`, so a cut always advances and a piece is never longer than the width
 * (bar the one-unit width that cannot hold a pair).
 */
const cutAt = (s: string, i: number, from = 0): number => {
  if (i <= from || i >= s.length) return i;
  const splitsPair = (c: number): boolean => isLow(s.charCodeAt(c)) && isHigh(s.charCodeAt(c - 1));
  for (let c = i; c > from && c >= i - CUT_LOOKBACK; c--) if (!isMark(s.charCodeAt(c)) && !splitsPair(c)) return c;
  if (!splitsPair(i)) return i;
  return i - 1 > from ? i - 1 : i + 1;
};

/** `s` cut to `max` characters, the cut marked with `...` (ASCII, like every table cell). */
const clip = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, cutAt(s, Math.max(0, max - 3)))}...`;

/**
 * Walk a note's wrapped lines WITHOUT building them: `line(ranges)` is called once per drawn
 * line with the `[start, end)` ranges of its words in `note` (absent, nothing is collected),
 * and the walk stops as soon as `limit` lines have been counted. A `\n` always breaks; otherwise
 * lines break at spaces (U+0020), runs of spaces collapse, and a word longer than a whole line is
 * cut into line-length pieces ({@link cutAt}: never splitting a surrogate pair, a mark kept with
 * its letter when that costs a few units at most). Returns the count, so a note past the cap
 * costs the cap, not its length; it is the count of lines {@link wrapNote} returns.
 */
function scanNote(note: string, width: number, limit: number, line?: (ranges: [number, number][]) => void): number {
  let count = 0;
  let words: [number, number][] = [];
  let len = 0;
  const flush = (): boolean => {
    count++;
    line?.(words);
    words = [];
    len = 0;
    return count >= limit;
  };
  let p = 0;
  while (p <= note.length) {
    const nl = note.indexOf("\n", p);
    const end = nl < 0 ? note.length : nl;
    const before = count;
    let i = p;
    while (i < end) {
      if (note.charCodeAt(i) === 0x20) {
        i++;
        continue;
      }
      let we = note.indexOf(" ", i);
      if (we < 0 || we > end) we = end;
      let ws = i;
      i = we;
      while (we - ws > width) {
        if (len > 0 && flush()) return count;
        const cut = cutAt(note, ws + width, ws);
        words = [[ws, cut]];
        len = cut - ws;
        if (flush()) return count;
        ws = cut;
      }
      if (we === ws) continue;
      if (len === 0) {
        words = [[ws, we]];
        len = we - ws;
      } else if (len + 1 + (we - ws) <= width) {
        words.push([ws, we]);
        len += 1 + (we - ws);
      } else {
        if (flush()) return count;
        words = [[ws, we]];
        len = we - ws;
      }
    }
    // Close the paragraph's open line — or draw it empty when it drew nothing at all (an empty
    // note, a blank line between two `\n`). A paragraph whose last word was cut exactly at the
    // width has no open line, and no phantom empty one.
    if ((len > 0 || count === before) && flush()) return count;
    if (nl < 0) break;
    p = nl + 1;
  }
  return count;
}

/** One note word-wrapped to {@link NOTE_LINE_CHARS} (see {@link scanNote}). */
export function wrapNote(note: string, width = NOTE_LINE_CHARS): string[] {
  const out: string[] = [];
  scanNote(note, width, Number.POSITIVE_INFINITY, (ranges) =>
    out.push(ranges.map(([a, b]) => note.slice(a, b)).join(" ")),
  );
  return out;
}
/** Gap between the two tables when both are drawn. */
const TABLE_GAP = 0.03;

/**
 * How many ROWS each table draws — the schedule's caption, its column headings, one per
 * room and the TOTAL that closes it (plus a heading and a subtotal per zone group); the
 * legend's caption and one per entry.
 *
 * These are the two numbers {@link layoutSheetTables} multiplies by the row height to get
 * a table's drawn height, and the two the **sheet fit rule** must reserve — see
 * {@link tableRowsHeight} and `usablePlanMm` in `src/sheet.ts`. They live here, once,
 * because the fit rule reserving a different number of rows than the layout draws is
 * exactly the bug: a page can otherwise be issued taller than the paper it declares while
 * `sheet.fits` says `true`.
 */
export const scheduleRowCount = (s: RoomSchedule): number => 3 + s.rows.length + 2 * s.groups.length;
export const legendRowCount = (entries: number): number => 1 + entries;
/** The DOOR & WINDOW SCHEDULE: caption, column headings, one row per tagged opening. */
export const openingRowCount = (openings: number): number => 2 + openings;
/** The NOTES table's drawn lines, per note, as {@link wrapNote} wraps them. */
const noteLines = (notes: readonly string[]): string[][] => notes.map((s) => wrapNote(s));
/**
 * How many wrapped lines the NOTES draw — what {@link MAX_NOTE_LINES} bounds — counted
 * without building a line, and only up to `limit` (one past the cap by default): a note past
 * the cap costs the cap to count, not its length.
 */
export function noteLineCount(notes: readonly string[], limit = MAX_NOTE_LINES + 1): number {
  let n = 0;
  for (const s of notes) {
    n += scanNote(s, NOTE_LINE_CHARS, limit - n);
    if (n >= limit) return n;
  }
  return n;
}
/** The NOTES table: caption plus one row per wrapped line (counted up to one past the cap). */
export const notesRowCount = (notes: readonly string[]): number => 1 + noteLineCount(notes);

/**
 * How deep the table ROW is, for the tables a plan actually opted into: the tallest of
 * them, or `0` when it opted into none (which is what keeps an opted-out plan's margins,
 * and therefore its bytes, unchanged). `extraRows` is the taller of the DOOR & WINDOW
 * SCHEDULE and NOTES tables (`0` when neither is drawn).
 */
export function tableBandRows(
  schedule: RoomSchedule | null,
  legend: readonly LegendEntry[] | null,
  extraRows = 0,
): number {
  return Math.max(schedule ? scheduleRowCount(schedule) : 0, legend ? legendRowCount(legend.length) : 0, extraRows);
}

/** That row count as a height, in the same units as `refDim`. */
export const tableRowsHeight = (refDim: number, rows: number): number => refDim * ROW_H * rows;

/**
 * The margin-table row count a resolved plan will draw, derived from the IR alone.
 *
 * `toScene()` builds the tables it draws from exactly these four inputs; the **sheet fit
 * rule runs in `resolve()`, before any Scene exists**, and needs the same answer. Deriving
 * it once here is what keeps the two from disagreeing — the disagreement being the bug this
 * function was written for, a page taller than its declared paper with `sheet.fits === true`.
 */
export function planTableRows(input: {
  schedule?: "rooms" | undefined;
  legend?: boolean | undefined;
  rooms: readonly RRoom[];
  zones?: readonly ZoneRef[] | undefined;
  walls: readonly (BandWall & { material: string; hatchScale: number; hatchAngle: number; status?: string })[];
  furniture: readonly RFurniture[];
  /**
   * The ground surfaces, whose materials add legend rows exactly as a wall's do.
   *
   * Optional and defaulting to none, because that is what keeps every caller that passes
   * none — and every plan with no `outdoor` — reserving the identical number of rows. It is NOT
   * optional in effect: the fit rule reserving fewer rows than the layout draws is the
   * precise bug this whole function exists to prevent (a page issued taller than its
   * declared paper while `sheet.fits` says `true`), and a lawn adds a row.
   */
  outdoor?: readonly ROutdoor[];
  /**
   * `schedule openings`, and the storey's elements it tabulates (only doors and windows are
   * counted). Optional for the same reason `outdoor` is, and as binding: the table is a row
   * of the band, so the fit rule must reserve it.
   */
  openingSchedule?: boolean | undefined;
  elements?: readonly { kind: string }[];
  /** The plan's `notes`, which draw a table in the same band. */
  notes?: readonly string[] | undefined;
}): number {
  // The storey as drawn (B3b): a `status demolish` wall draws no poché, and adds the legend's
  // `demolished` row — exactly the inputs `toScene` builds the legend from.
  const standing = input.walls.filter((w) => w.status !== "demolish");
  const schedule = input.schedule === "rooms" ? roomSchedule(input.rooms, input.zones, standing) : null;
  const legend = input.legend
    ? legendEntries(
        hatchesUsed(standing, groundMaterialsUsed(input.outdoor ?? [])),
        input.furniture,
        standing.length < input.walls.length,
      )
    : null;
  const openings = input.openingSchedule ? openingRowCount(openingCount(input.elements ?? [])) : 0;
  const notes = input.notes && input.notes.length > 0 ? notesRowCount(input.notes) : 0;
  return tableBandRows(schedule, legend, Math.max(openings, notes));
}

/**
 * Lay the tables out side by side in a row starting at `top`: the schedule at the sheet's
 * left edge, the legend to its right. Returns null when neither is requested, which is
 * what keeps an opted-out plan's margins (and therefore its bytes) unchanged.
 */
export function layoutSheetTables(input: SheetTablesInput): SheetTables | null {
  const { bounds: b, refDim, top } = input;
  const sched = input.schedule ?? null;
  const legendRows = input.legend ?? null;
  const openingData = input.openings ?? null;
  const notesData = input.notes && input.notes.length > 0 ? input.notes : null;
  if (!sched && !legendRows && !openingData && !notesData) return null;

  const rowH = refDim * ROW_H;
  const fs = refDim * FONT;
  let x = b.minX;
  let bottom = top;

  let schedule: ScheduleTableBox | null = null;
  if (sched) {
    const cols: TableColumn[] = [
      { heading: "NO.", w: refDim * COL_NO, align: "middle" },
      { heading: "NAME", w: refDim * COL_NAME, align: "start" },
      { heading: "AREA (CENTRELINE, m²)", w: refDim * COL_AREA, align: "end" },
      { heading: "NET AREA (m²)", w: refDim * COL_NET, align: "end" },
    ];
    const w = cols.reduce((s, c) => s + c.w, 0);
    // Rows: caption + column headings + one per room + the TOTAL that closes the table.
    // Each zone group adds two more: its heading and its subtotal (none when unzoned, so
    // the height — and therefore the whole sheet's layout — is unchanged). Counted by
    // `scheduleRowCount`, which the sheet fit rule reserves with.
    const h = tableRowsHeight(refDim, scheduleRowCount(sched));
    schedule = {
      x0: x,
      y0: top,
      w,
      h,
      rowH,
      fs,
      // The padding the three-column table had (2% of NO. + NAME + the old AREA width), in
      // the same float order, so the NO. and NAME cells keep their place (see PAD_AREA_W).
      pad: [refDim * COL_NO, refDim * COL_NAME, refDim * PAD_AREA_W].reduce((s, c) => s + c, 0) * 0.02,
      caption: "ROOM SCHEDULE",
      cols,
      rows: sched.rows,
      total_m2: sched.total_m2,
      ...(sched.net_total_m2 !== undefined ? { net_total_m2: sched.net_total_m2 } : {}),
      groups: sched.groups,
    };
    x += w + refDim * TABLE_GAP;
    bottom = Math.max(bottom, top + h);
  }

  // The DOOR & WINDOW SCHEDULE sits between the room schedule and the legend: the two
  // schedules read together. Absent → `x` is untouched, so the legend lands where it always did.
  let openings: OpeningTableBox | undefined;
  if (openingData) {
    const cols: TableColumn[] = [
      { heading: "TAG", w: refDim * COL_TAG, align: "middle" },
      { heading: "ROOM(S)", w: refDim * COL_ROOMS, align: "start" },
      { heading: "WIDTH", w: refDim * COL_WIDTH, align: "end" },
      { heading: "TYPE", w: refDim * COL_TYPE, align: "start" },
      { heading: "HAND", w: refDim * COL_HAND, align: "start" },
    ];
    const w = cols.reduce((s, c) => s + c.w, 0);
    const h = tableRowsHeight(refDim, openingRowCount(openingData.length));
    openings = {
      x0: x,
      y0: top,
      w,
      h,
      rowH,
      fs,
      pad: w * 0.02,
      caption: "DOOR & WINDOW SCHEDULE",
      cols,
      rows: openingData.map((r) => ({ ...r, rooms: clip(r.rooms, ROOMS_CELL_CHARS) })),
    };
    x += w + refDim * TABLE_GAP;
    bottom = Math.max(bottom, top + h);
  }

  let legend: LegendTableBox | null = null;
  if (legendRows) {
    const swatchW = refDim * LEGEND_SWATCH;
    const w = swatchW + refDim * LEGEND_NAME;
    const h = tableRowsHeight(refDim, legendRowCount(legendRows.length));
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

  // NOTES close the row on the right, in a FIXED-width column: each note is word-wrapped to
  // it (`wrapNote`), so authored text adds rows — which the sheet fit and the drawing budget
  // count — and never width. The drawn lines are the notes in source order, numbered.
  let notes: NotesTableBox | undefined;
  if (notesData) {
    // The schedules leave a gap after themselves; the legend does not, so add one after it.
    if (legend) x += refDim * TABLE_GAP;
    const lines = noteLines(notesData).flatMap((parts, i) =>
      parts.map((text, k) => ({ no: k === 0 ? `${i + 1}.` : "", text })),
    );
    const noW = refDim * NOTES_NO;
    const w = noW + refDim * NOTES_TEXT;
    const h = tableRowsHeight(refDim, 1 + lines.length);
    notes = { x0: x, y0: top, w, h, rowH, fs, pad: w * 0.02, caption: "NOTES", noW, lines };
    x += w;
    bottom = Math.max(bottom, top + h);
  }

  return {
    schedule,
    ...(openings ? { openings } : {}),
    legend,
    ...(notes ? { notes } : {}),
    left: b.minX,
    top,
    bottom,
    right: x,
  };
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
    ...(t.openings ? { openings: move(t.openings) } : {}),
    legend: t.legend ? move(t.legend) : null,
    ...(t.notes ? { notes: move(t.notes) } : {}),
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
        paint: { stroke: ink, width: weightWidth(hairline ? "extraThin" : "thin", sizes) },
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
 * uses at 1dp). {@link fmt2} stays the formatter for every *geometric* number here. An
 * omitted net area (see `analyze/net-area.ts`) draws `-`, the table's ASCII "no value"
 * (the DOOR & WINDOW SCHEDULE's HAND column uses the same mark).
 */
const areaCell = (m2: number | undefined): string => (m2 === undefined ? "-" : m2.toFixed(2));

/**
 * Left edge of the schedule's column `i`: `x0` plus the widths up to and including `i`, less
 * column `i`'s own — the float order the table used for its one AREA column when that was the
 * last, kept so the TOTAL and SUBTOTAL cells sit exactly on their column's data cells.
 */
const colLeft = (t: ScheduleTableBox, i: number): number =>
  t.x0 + t.cols.slice(0, i + 1).reduce((s, c) => s + c.w, 0) - t.cols[i]!.w;

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
  // between the two so neither merged cell is cut in half — except the rules bounding the
  // AREA and NET AREA columns, which carry the totals' values and so run to the frame.
  const totalTop = y0 + h - rowH;
  let cx = x0;
  t.cols.forEach((c, i) => {
    d.text({ x: anchorX(cx, c.w, pad, c.align), y: rowMid(1) }, c.heading, fs * 0.8, c.align, {
      weight: BOLD,
      muted: true,
    });
    if (i > 0) d.rule({ x: cx, y: y0 + rowH }, { x: cx, y: i >= AREA_COL ? y0 + h : totalTop }, true);
    cx += c.w;
  });
  d.rule({ x: x0, y: y0 + rowH * 2 }, { x: x0 + w, y: y0 + rowH * 2 });

  t.rows.forEach((r, i) => {
    const y = rowMid(2 + i);
    const cells = [r.no, r.name, areaCell(r.area_m2), areaCell(r.net_area_m2)];
    let x = x0;
    t.cols.forEach((c, ci) => {
      d.text({ x: anchorX(x, c.w, pad, c.align), y }, cells[ci]!, fs, c.align);
      x += c.w;
    });
    if (i > 0) d.rule({ x: x0, y: y0 + rowH * (2 + i) }, { x: x0 + w, y: y0 + rowH * (2 + i) }, true);
  });

  // TOTAL closes the table: the label spans the NO. + NAME columns, the values sit under
  // AREA and NET AREA. The same numbers as `describe().totals.floor_area_m2` and
  // `.net_floor_area_m2`.
  d.rule({ x: x0, y: totalTop }, { x: x0 + w, y: totalTop });
  d.text({ x: x0 + pad, y: totalTop + rowH / 2 }, "TOTAL", fs, "start", { weight: BOLD });
  const totals = [t.total_m2, t.net_total_m2];
  totals.forEach((m2, k) => {
    const col = t.cols[AREA_COL + k]!;
    d.text(
      { x: anchorX(colLeft(t, AREA_COL + k), col.w, pad, col.align), y: totalTop + rowH / 2 },
      areaCell(m2),
      fs,
      col.align,
      { weight: BOLD },
    );
  });
}

/**
 * The ZONE-GROUPED ROOM SCHEDULE: the same table, with each zone's rooms under a
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

  const areaCol = t.cols[AREA_COL]!;
  const areaX = anchorX(colLeft(t, AREA_COL), areaCol.w, pad, areaCol.align);
  const netCol = t.cols[AREA_COL + 1]!;
  const netX = anchorX(colLeft(t, AREA_COL + 1), netCol.w, pad, netCol.align);

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
      const cells = [r.no, r.name, areaCell(r.area_m2), areaCell(r.net_area_m2)];
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
    d.text({ x: netX, y: rowMid(row) }, areaCell(g.net_subtotal_m2), fs, netCol.align, { weight: BOLD, muted: true });
    row++;
  }

  // TOTAL closes the table — the same numbers as `describe().totals.floor_area_m2` and
  // `.net_floor_area_m2`, and the sums of the subtotals above them.
  const totalTop = y0 + h - rowH;
  d.rule({ x: x0, y: totalTop }, { x: x0 + w, y: totalTop });
  d.text({ x: x0 + pad, y: totalTop + rowH / 2 }, "TOTAL", fs, "start", { weight: BOLD });
  d.text({ x: areaX, y: totalTop + rowH / 2 }, areaCell(t.total_m2), fs, areaCol.align, { weight: BOLD });
  d.text({ x: netX, y: totalTop + rowH / 2 }, areaCell(t.net_total_m2), fs, netCol.align, { weight: BOLD });
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
      // A GROUND pattern's tile is bigger than the swatch, so the swatch re-frames it to show
      // the pattern's own marks (`groundSwatchFrame`); a wall material keeps the drawing's
      // anchoring, byte for byte.
      const frame = groundSwatchFrame(hp, sizes.hatchGap, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
      out.push({
        layer: "annotations",
        prim: {
          t: "hatch",
          region: [loop],
          material: hp.material,
          scale: hp.scale,
          angle: hp.angle,
          ...(frame ? { origin: frame.origin, zoom: frame.zoom } : {}),
        },
        paint: { fill: `url(#${patternId(hp.material, hp.scale, hp.angle)})`, fillRule: "nonzero" },
      });
      d.frame(box.x, box.y, box.w, box.h);
    } else if (e.kind === "fixture" && e.category) {
      // The real plan symbol, drawn into the swatch box and re-tagged onto the annotation
      // pass — so the legend can never drift from what the drawing actually paints.
      const glyph = fixtureGlyph(e.category, box, theme, sizes);
      if (glyph) out.push(...glyph.map((n) => ({ ...n, layer: "annotations" as const })));
      else d.frame(box.x, box.y, box.w, box.h);
    } else if (e.kind === "demolished") {
      // A wall drawn as the plan draws a demolished one: its outline in the wall pen, dashed,
      // with no poché (`toScene`'s second `lowerWallSet` call).
      out.push({
        layer: "annotations",
        prim: { t: "polygon", pts: loop },
        paint: { fill: "none", stroke: theme.wallStroke, width: sizes.wallStroke },
        lineType: "dashed",
      });
    }
    d.text({ x: x0 + swatchW + pad, y: top + rowH * 0.5 }, e.name, fs, "start");
  });
}

/**
 * The DOOR & WINDOW SCHEDULE's primitives: frame, caption, column headings, then one row per
 * tagged opening. Column rules run from the headings to the frame (no merged row below them).
 * At most `13 + 6 × rows` primitives — the drawing budget's count.
 */
function openingTableNodes(t: OpeningTableBox, theme: Theme, sizes: RenderSizes, out: SceneNode[]): void {
  const d = drawer(theme, sizes, out);
  const { x0, y0, w, h, rowH, fs, pad } = t;
  d.frame(x0, y0, w, h);
  const rowMid = (i: number): number => y0 + rowH * (i + 0.5);
  d.text({ x: x0 + pad, y: rowMid(0) }, t.caption, fs, "start", { weight: BOLD });
  d.rule({ x: x0, y: y0 + rowH }, { x: x0 + w, y: y0 + rowH });
  let cx = x0;
  t.cols.forEach((c, i) => {
    d.text({ x: anchorX(cx, c.w, pad, c.align), y: rowMid(1) }, c.heading, fs * 0.8, c.align, {
      weight: BOLD,
      muted: true,
    });
    if (i > 0) d.rule({ x: cx, y: y0 + rowH }, { x: cx, y: y0 + h }, true);
    cx += c.w;
  });
  d.rule({ x: x0, y: y0 + rowH * 2 }, { x: x0 + w, y: y0 + rowH * 2 });
  t.rows.forEach((r, i) => {
    const cells = [r.tag, r.rooms, r.width, r.type, r.hand];
    let x = x0;
    t.cols.forEach((c, ci) => {
      d.text({ x: anchorX(x, c.w, pad, c.align), y: rowMid(2 + i) }, cells[ci]!, fs, c.align);
      x += c.w;
    });
    if (i > 0) d.rule({ x: x0, y: y0 + rowH * (2 + i) }, { x: x0 + w, y: y0 + rowH * (2 + i) }, true);
  });
}

/** The NOTES table's primitives: frame, caption, a rule, then each line's number and text.
 *  At most `3 + 2 × lines`. */
function notesNodes(t: NotesTableBox, theme: Theme, sizes: RenderSizes, out: SceneNode[]): void {
  const d = drawer(theme, sizes, out);
  const { x0, y0, w, h, rowH, fs, pad, noW } = t;
  d.frame(x0, y0, w, h);
  d.text({ x: x0 + pad, y: y0 + rowH * 0.5 }, t.caption, fs, "start", { weight: BOLD });
  d.rule({ x: x0, y: y0 + rowH }, { x: x0 + w, y: y0 + rowH });
  t.lines.forEach((l, i) => {
    const y = y0 + rowH * (1.5 + i);
    if (l.no !== "") d.text({ x: x0 + noW - pad, y }, l.no, fs, "end");
    d.text({ x: x0 + noW, y }, l.text, fs, "start");
  });
}

/**
 * Lower the laid-out tables to Scene primitives on the `annotations` pass (the last pass,
 * so a table always reads on top). Every backend that walks `RENDER_PASSES` gets them for
 * free; nothing is emitted when no table is present. Emitted left to right, as laid out.
 */
export function sheetTableNodes(t: SheetTables, theme: Theme, sizes: RenderSizes): SceneNode[] {
  const out: SceneNode[] = [];
  if (t.schedule) scheduleNodes(t.schedule, theme, sizes, out);
  if (t.openings) openingTableNodes(t.openings, theme, sizes, out);
  if (t.legend) legendNodes(t.legend, theme, sizes, out);
  if (t.notes) notesNodes(t.notes, theme, sizes, out);
  return out;
}
