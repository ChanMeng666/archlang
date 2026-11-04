/**
 * `openPlan3dToArch`: an OpenPlan3D plan (github.com/laanlabs/openPlan3D, MIT) as ArchLang source,
 * so `fmt`, `lint`, `validate` and `compile` apply to it, plus a report of everything that was not
 * carried over. The CLI's `arch import --from openplan3d` is this function and a file read.
 *
 * Two inputs, told apart as OpenPlan3D tells them (`isRoomPlanJson`): the web project JSON
 * (centimetres) and the prepared RoomPlan interchange JSON (metres). Both are read into one model
 * (`openplan3d-model.ts`), rooms are found as OpenPlan3D finds them (`openplan3d-rooms.ts`), and the
 * model is written out here.
 *
 * Units: every length becomes millimetres, ×10 from centimetres and ×1000 from metres (an
 * interchange file goes through OpenPlan3D's own metres-to-centimetres step first), then rounded to
 * the nearest 0.001 mm with halves away from zero. Nothing else is rounded or snapped.
 *
 * Pure, synchronous and deterministic: no I/O, clock, randomness or trigonometry; numbers print
 * through `src/num-format.ts`. Range: every input coordinate and length (wall ends, curve points,
 * thicknesses, opening widths and heights, a stair's, column's or piece's centre with its extent,
 * section centres, floor elevations) is held to `MODEL_RANGE_MM` before anything is built, and
 * every number written into the source is checked again as it is printed; either gives
 * `E_OUT_OF_RANGE` and no source. Compile's own number-domain check stays the backstop for what
 * it derives from them. The work is charged to the evaluation step meter and stops with
 * `E_IMPORT_LIMIT` past it, as does a file of more than `MAX_IMPORT_LEVELS` storeys. A file
 * OpenPlan3D's own validators refuse gives `E_IMPORT_FORMAT` diagnostics with their path and
 * reason. Nothing is dropped without a report entry: every dropped entity and every dropped field
 * is in the report, and each gives a `W_IMPORT_DROPPED` warning, except fields whose loss changes
 * nothing on a plan (project and capture metadata, editor settings, format markers, a room's
 * stored area: {@link QUIET_REASONS}), which are listed in the report without a warning. It never
 * throws on its input.
 */

import type { Diagnostic } from "../diagnostics.js";
import { chargeSteps, withStepMeter } from "../expr.js";
import { format } from "../format.js";
import { KEYWORDS } from "../grammar/tokens.js";
import { MODEL_RANGE_MM, fmtSource } from "../num-format.js";
import { OPENPLAN3D_CATALOG_SIZES, OPENPLAN3D_TO_FAMILY } from "./openplan3d-catalog.js";
import {
  type DroppedEntity,
  type DroppedField,
  type KindCount,
  Ledger,
  type OFloor,
  type OModel,
  type OpenPlan3dFormat,
  type Pt,
  detectFormat,
  readHandoff,
  readWebProject,
  quarterOfDegrees,
  own,
  sectionName,
} from "./openplan3d-model.js";
import { detectFloorRooms, matchRecords, matchSections, wallSpans } from "./openplan3d-rooms.js";

export type { OpenPlan3dFormat } from "./openplan3d-model.js";
export type { DroppedEntity as OpenPlan3dDropped, DroppedField as OpenPlan3dDroppedField } from "./openplan3d-model.js";
export type { KindCount as OpenPlan3dCount } from "./openplan3d-model.js";

export interface OpenPlan3dImportOptions {
  /** Read the input as this format instead of detecting it. */
  format?: OpenPlan3dFormat;
  /**
   * The plan's title for an interchange file, which carries none of its own (OpenPlan3D names
   * such an import after its file). A web project's own `name` always wins.
   */
  name?: string;
}

/** One element id that had to change to be an ArchLang id. */
export interface OpenPlan3dIdChange {
  kind: string;
  from: string;
  to: string;
  /** The storey it is on, for a plan with more than one. */
  level?: number;
}

export interface OpenPlan3dImportReport {
  format: OpenPlan3dFormat;
  /** The unit the file is written in. */
  units: "cm" | "m";
  /** The storeys written, lowest first. */
  levels: { level: number; name: string; height_mm?: number }[];
  /** Per input kind: how many were read, written out, and dropped (`in = mapped + dropped`). */
  counts: Record<string, KindCount>;
  /** Rooms found as closed wall loops, and how many of them carry a name. */
  rooms: { detected: number; named: number };
  /** Every input entity not written out, and why. */
  dropped: DroppedEntity[];
  /** Every input field whose value is not in the output, counted, and why. */
  fields: DroppedField[];
  /** What OpenPlan3D would do on import that this conversion does not. */
  notes: string[];
  /** Ids rewritten to be ArchLang identifiers. */
  ids: OpenPlan3dIdChange[];
}

export interface OpenPlan3dImportResult {
  /** True when `source` was produced (warnings allowed). */
  ok: boolean;
  /** The `.arch` source; absent when any error diagnostic was raised. */
  source?: string;
  /** `E_IMPORT_FORMAT`, `E_OUT_OF_RANGE`, `E_IMPORT_LIMIT`, `W_IMPORT_DROPPED`. No spans: the input is JSON. */
  diagnostics: Diagnostic[];
  /** Absent when the file could not be read at all. */
  report?: OpenPlan3dImportReport;
}

/** Convert a parsed OpenPlan3D document (web project or prepared RoomPlan interchange). */
export function openPlan3dToArch(json: unknown, options: OpenPlan3dImportOptions = {}): OpenPlan3dImportResult {
  const run = withStepMeter(0, () => convert(json, options));
  if ("signal" in run) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "E_IMPORT_LIMIT",
          message:
            "The OpenPlan3D file needs more work to convert than any plan does (its floors hold too many walls or elements to compare); nothing was written",
          hints: ["Split the plan into smaller files, a floor or a wing each, and import them one by one."],
        },
      ],
    };
  }
  // The source is handed back in canonical form, so `arch fmt` on it changes nothing.
  const r = run.value;
  return r.source === undefined ? r : { ...r, source: format(r.source) };
}

// ---------------------------------------------------------------------------------------------

/** Centimetres to millimetres on the 0.001 mm lattice, halves away from zero. */
function mmOf(cm: number): number {
  const um = cm * 10_000;
  const r = um < 0 ? -Math.round(-um) : Math.round(um);
  return r / 1000;
}
const inRange = (mm: number): boolean => Number.isFinite(mm) && Math.abs(mm) <= MODEL_RANGE_MM;
/**
 * The numbers written past the modelling range in the conversion running now (set by `convert`).
 * The input values are checked first (`rangeErrors`); this catches a position derived from them
 * (a corner from a centre and a size, a distance along a wall) as it is printed.
 */
let writtenOutOfRange: number[] | null = null;
const num = (mm: number): string => {
  if (!inRange(mm) && writtenOutOfRange !== null && writtenOutOfRange.length < 10) writtenOutOfRange.push(mm);
  return fmtSource(Object.is(mm, -0) ? 0 : mm);
};
const pt = (p: Pt): string => `(${num(p.x)},${num(p.y)})`;
/** The largest height a clause may name (`E_HEIGHT_RANGE` past it), mm. */
const MAX_HEIGHT_MM = 100_000;

/** An ArchLang string literal: `{`, `}`, `"` and `\` stay literal. */
function str(s: string): string {
  let out = '"';
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "{") out += "\\{";
    else if (ch === "}") out += "\\}";
    else if (ch === "\n" || ch === "\r") out += " ";
    else out += ch;
  }
  return `${out}"`;
}
/** Text safe on one comment line. */
const commentText = (s: string): string => s.replace(/[\r\n]+/g, " ");

const RESERVED = new Set<string>(Object.values(KEYWORDS).flat() as string[]);
const MAX_ID = 64;

/** Gives each element an ArchLang id derived from its OpenPlan3D id, unique within a storey. */
class Ids {
  private readonly taken = new Set<string>();
  constructor(
    private readonly changes: OpenPlan3dIdChange[],
    private readonly level: number | undefined,
  ) {}
  take(kind: string, prefix: string, from: string): string {
    chargeSteps(1);
    let s = from.replace(/[^A-Za-z0-9_]/g, "_");
    if (s.length > MAX_ID) s = s.slice(0, MAX_ID);
    if (s === "" || !/^[A-Za-z_]/.test(s) || RESERVED.has(s)) s = `${prefix}_${s}`.replace(/_$/, "");
    let id = s;
    for (let k = 2; this.taken.has(id); k++) id = `${s}_${k}`;
    this.taken.add(id);
    if (id !== from)
      this.changes.push({ kind, from, to: id, ...(this.level !== undefined ? { level: this.level } : {}) });
    return id;
  }
}

/** ArchLang `uses` for an OpenPlan3D room type (`details.roomType`, an interchange section label). */
const USE_OF: Readonly<Record<string, string>> = {
  livingRoom: "living",
  bedroom: "bedroom",
  kitchen: "kitchen",
  bathroom: "bath",
  diningRoom: "dining",
  laundryRoom: "utility",
  office: "office",
  hallway: "hall",
  garage: "garage",
  closet: "storage",
  pantry: "storage",
  entryway: "entry",
};

/** Reasons that are report-only: metadata whose loss changes nothing on a plan. */
const QUIET_REASONS = new Set([
  "project metadata",
  "an editor setting",
  "format marker",
  "capture metadata",
  "Apple capture metadata, ignored by OpenPlan3D too",
  "ArchLang computes the area from the outline",
]);

const DOOR_WORD: Readonly<Record<string, string>> = {
  single: "",
  double: "double ",
  french: "double ",
  sliding: "sliding ",
  pocket: "pocket ",
  bifold: "bifold ",
  garage: "garage ",
};
const WINDOW_WORD: Readonly<Record<string, string>> = {
  standard: "",
  bay: "",
  fixed: "fixed ",
  casement: "casement ",
  sliding: "sliding ",
};

function convert(json: unknown, options: OpenPlan3dImportOptions): OpenPlan3dImportResult {
  writtenOutOfRange = [];
  try {
    const r = convertBody(json, options);
    const bad = writtenOutOfRange;
    if (r.source === undefined || bad.length === 0) return r;
    return {
      ok: false,
      diagnostics: bad.map((mm) => ({
        severity: "error" as const,
        code: "E_OUT_OF_RANGE",
        message: `A position derived from the file comes to ${String(mm)} mm, past the modelling range of ±${MODEL_RANGE_MM} mm; nothing was written`,
      })),
    };
  } finally {
    writtenOutOfRange = null;
  }
}

function convertBody(json: unknown, options: OpenPlan3dImportOptions): OpenPlan3dImportResult {
  const format = options.format ?? detectFormat(json);
  const ledger = new Ledger();
  const read = format === "web" ? readWebProject(json, ledger) : readHandoff(json, ledger, options.name);
  if (read.model === null) return { ok: false, diagnostics: read.diagnostics };
  const model = read.model;
  const diagnostics: Diagnostic[] = [];
  const range = rangeErrors(model);
  if (range.length > 0) return { ok: false, diagnostics: range };

  const ids: OpenPlan3dIdChange[] = [];
  const levels: OpenPlan3dImportReport["levels"] = [];
  const components: string[] = [];
  const bodies: string[] = [];
  let detected = 0;
  let named = 0;

  // Storeys lowest first, as ArchLang requires; a level that repeats cannot be a second storey.
  const floors = [...model.floors].sort((a, b) => a.level - b.level);
  const usedLevels = new Set<number>();
  const kept: OFloor[] = [];
  for (const f of floors) {
    if (format === "web") ledger.seen("floors");
    if (usedLevels.has(f.level)) {
      ledger.drop(
        "floors",
        f.id,
        f.path,
        `level ${f.level} is already another floor's, and ArchLang storeys need distinct levels`,
      );
      dropFloorContents(f, ledger);
      continue;
    }
    usedLevels.add(f.level);
    if (format === "web") ledger.mapped("floors");
    kept.push(f);
  }
  const multi = kept.length > 1;
  if (kept.length > 0 && kept[0]!.elevation !== 0)
    ledger.field(
      "floors[].elevation",
      "ArchLang measures storeys from the lowest one: its height above the ground is not kept",
    );

  let flips = 0;
  kept.forEach((floor, i) => {
    const out: string[] = [];
    const idc = new Ids(ids, multi ? floor.level : undefined);
    const above = kept[i + 1];
    let height: number | undefined;
    if (above) {
      const h = mmOf(above.elevation - floor.elevation);
      if (h > 0 && h <= MAX_HEIGHT_MM) height = h;
      else
        ledger.notes.push(
          `floor "${floor.name}": the next floor's elevation leaves no storey height ArchLang can hold (${num(h)} mm), so the default is used`,
        );
    }
    levels.push({ level: floor.level, name: floor.name, ...(height !== undefined ? { height_mm: height } : {}) });
    const r = emitFloor(floor, format, ledger, idc, out, () => `stair_flip_${++flips}`, components);
    detected += r.detected;
    named += r.named;
    if (multi) {
      const head = `  level ${floor.level} ${str(floor.name)}${height !== undefined ? ` height ${num(height)}` : ""} {`;
      bodies.push(head, ...out.map((l) => `    ${l}`), "  }");
    } else {
      if (floor.name) bodies.push(`  # ${commentText(`floor "${floor.name}"`)}`);
      bodies.push(...out.map((l) => `  ${l}`));
    }
  });

  // Warnings: one per dropped kind and reason, one per dropped field and reason, one per note.
  const groups = new Map<string, DroppedEntity[]>();
  for (const d of ledger.dropped) {
    const k = `${d.kind}\u0000${d.reason}`;
    const g = groups.get(k);
    if (g) g.push(d);
    else groups.set(k, [d]);
  }
  for (const g of groups.values()) {
    const first = g[0]!;
    const named = g.filter((d) => d.id !== "").map((d) => d.id);
    const list =
      named.length > 0
        ? ` (${named.slice(0, 5).join(", ")}${named.length > 5 ? `, … ${named.length - 5} more` : ""})`
        : "";
    diagnostics.push({
      severity: "warning",
      code: "W_IMPORT_DROPPED",
      message: `${g.length} ${first.kind} not imported${list}: ${first.reason}`,
    });
  }
  const fields = ledger.fields();
  for (const f of fields) {
    if (QUIET_REASONS.has(f.reason)) continue;
    diagnostics.push({
      severity: "warning",
      code: "W_IMPORT_DROPPED",
      message: `\`${f.field}\` not imported on ${f.count} record${f.count === 1 ? "" : "s"}: ${f.reason}`,
    });
  }
  for (const n of ledger.notes)
    diagnostics.push({ severity: "warning", code: "W_IMPORT_DROPPED", message: `Not reproduced: ${n}` });

  const units = format === "web" ? "cm" : "m";
  const kindWord = format === "web" ? "web project JSON" : "prepared RoomPlan interchange JSON";
  const lines = [
    `# Imported from an OpenPlan3D ${kindWord} (${units === "cm" ? "centimetres" : "metres"}) by \`archlang import --from openplan3d\`.`,
    "# Lengths are millimetres, rounded to 0.001 mm. What was not carried over is in the import report.",
    `plan ${str(model.name)} {`,
    "  units mm",
    ...components,
    ...bodies,
    "}",
    "",
  ];
  chargeSteps(lines.length);
  const counts: Record<string, KindCount> = {};
  for (const [k, c] of [...ledger.counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
    counts[k] = { ...c };
  return {
    ok: true,
    source: lines.join("\n"),
    diagnostics,
    report: {
      format,
      units,
      levels,
      counts,
      rooms: { detected, named },
      dropped: ledger.dropped,
      fields,
      notes: ledger.notes,
      ids,
    },
  };
}

/** Every coordinate and length of the model, held to the modelling range before anything else. */
function rangeErrors(model: OModel): Diagnostic[] {
  const out: Diagnostic[] = [];
  const check = (path: string, values: number[]): void => {
    chargeSteps(1);
    const bad = values.find((v) => !inRange(mmOf(v)));
    if (bad === undefined || out.length >= 100) return;
    out.push({
      severity: "error",
      code: "E_OUT_OF_RANGE",
      message: `${path} has a value of ${String(bad)} in the file's units, which is ${String(mmOf(bad))} mm: past the modelling range of ±${MODEL_RANGE_MM} mm`,
    });
  };
  for (const f of model.floors) {
    check(`${f.path}.elevation`, [f.elevation]);
    for (const w of f.walls)
      check(w.path, [
        w.start.x,
        w.start.y,
        w.end.x,
        w.end.y,
        w.thickness,
        ...(w.curvePoint ? [w.curvePoint.x, w.curvePoint.y] : []),
      ]);
    for (const d of f.doors) check(d.path, [d.width, d.height]);
    for (const w of f.windows) check(w.path, [w.width, w.height, w.sillHeight, w.sillHeight + w.height]);
    for (const s of f.stairs)
      check(s.path, [
        s.position.x - s.width - s.depth,
        s.position.x + s.width + s.depth,
        s.position.y - s.width - s.depth,
        s.position.y + s.width + s.depth,
      ]);
    for (const c of f.columns)
      check(c.path, [
        c.position.x - c.diameter,
        c.position.x + c.diameter,
        c.position.y - c.diameter,
        c.position.y + c.diameter,
      ]);
    for (const p of f.furniture) {
      const w = (p.width ?? 0) * Math.abs(p.scaleX);
      const d = (p.depth ?? 0) * Math.abs(p.scaleY);
      check(p.path, [p.position.x - w - d, p.position.x + w + d, p.position.y - w - d, p.position.y + w + d]);
    }
    for (const s of f.sections) check(s.path, [s.center.x, s.center.y]);
  }
  return out;
}

/** A floor that is not written: everything on it is dropped with it. */
function dropFloorContents(f: OFloor, ledger: Ledger): void {
  const why = "its floor was not imported";
  for (const w of f.walls) {
    ledger.seen("walls");
    ledger.drop("walls", w.id, w.path, why);
  }
  for (const d of f.doors) {
    ledger.seen(d.kind);
    ledger.drop(d.kind, d.id, d.path, why);
  }
  for (const w of f.windows) {
    ledger.seen("windows");
    ledger.drop("windows", w.id, w.path, why);
  }
  for (const r of f.rooms) {
    ledger.seen("rooms");
    ledger.drop("rooms", r.id, r.path, why);
  }
  for (const s of f.sections) {
    ledger.seen("sections");
    ledger.drop("sections", "", s.path, why);
  }
  for (const s of f.stairs) {
    ledger.seen("stairs");
    ledger.drop("stairs", s.id, s.path, why);
  }
  for (const c of f.columns) {
    ledger.seen("columns");
    ledger.drop("columns", c.id, c.path, why);
  }
  for (const p of f.furniture) {
    ledger.seen(p.kind);
    ledger.drop(p.kind, p.id, p.path, why);
  }
}

interface EmittedWall {
  id: string;
  /** The points written, mm. */
  points: Pt[];
  /** Run length to each point, mm. */
  runs: number[];
  /** Facets per OpenPlan3D span (1 straight, 16 curved). */
  curved: boolean;
}

const mmPt = (p: Pt): Pt => ({ x: mmOf(p.x), y: mmOf(p.y) });
const dist = (a: Pt, b: Pt): number => Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
const round3 = (mm: number): number => {
  const um = mm * 1000;
  return (um < 0 ? -Math.round(-um) : Math.round(um)) / 1000;
};

/**
 * The run distance (mm) of an opening's centre: OpenPlan3D's `position` is a fraction of a
 * straight wall's length, or of a curved wall's facet index then facet length (`distanceAt`).
 */
function runAt(w: EmittedWall, position: number): number {
  const total = w.runs[w.runs.length - 1]!;
  if (!w.curved) return round3(position * total);
  const n = w.points.length - 1;
  const scaled = Math.max(0, Math.min(1, position)) * n;
  const i = Math.min(n - 1, Math.floor(scaled));
  return round3(w.runs[i]! + (scaled - i) * (w.runs[i + 1]! - w.runs[i]!));
}

/** A ring with no repeated consecutive vertex (rounding can merge two). */
function dedupeRing(ring: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  while (out.length > 1 && out[0]!.x === out[out.length - 1]!.x && out[0]!.y === out[out.length - 1]!.y) out.pop();
  return out;
}

/** The axis-aligned rectangle a ring is, once exactly collinear vertices are dropped, or null. */
function rectOf(ring: Pt[]): { x: number; y: number; w: number; h: number } | null {
  const pts = ring.filter((p, i) => {
    const a = ring[(i - 1 + ring.length) % ring.length]!;
    const b = ring[(i + 1) % ring.length]!;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
  if (pts.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % 4]!;
    if (a.x !== b.x && a.y !== b.y) return null;
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function emitFloor(
  floor: OFloor,
  format: OpenPlan3dFormat,
  ledger: Ledger,
  idc: Ids,
  out: string[],
  flipName: () => string,
  components: string[],
): { detected: number; named: number } {
  const list = (p: string) => (format === "web" ? `floors[].${p}` : p);
  const found = detectFloorRooms(floor.walls);

  // ---- walls -------------------------------------------------------------------------------
  const walls = new Map<string, EmittedWall>();
  for (const w of floor.walls) {
    ledger.seen("walls");
    const spans = wallSpans(w);
    const points = [mmPt(spans[0]!.start), ...spans.map((s) => mmPt(s.end))];
    const runs = [0];
    for (let i = 1; i < points.length; i++) runs.push(runs[i - 1]! + dist(points[i - 1]!, points[i]!));
    if (runs[runs.length - 1]! < 0.001 || dedupeRing(points).length < 2) {
      ledger.drop("walls", w.id, w.path, "the wall is 0 long");
      continue;
    }
    const id = idc.take("walls", "w", w.id);
    const category = found.exterior.has(w.id) ? "exterior" : "partition";
    const high = Math.max(w.startHeight, w.endHeight);
    if (w.startHeight !== w.endHeight)
      ledger.field(
        list("walls[].startHeight/endHeight"),
        "a sloped wall: ArchLang walls have one height, so the higher end is kept",
      );
    if (w.curvePoint)
      ledger.field(list("walls[].curvePoint"), "a curved wall is drawn as OpenPlan3D's own 16 straight facets");
    const h = mmOf(high);
    let heightClause = "";
    if (h > 0 && h <= MAX_HEIGHT_MM) heightClause = ` height ${num(h)}`;
    else ledger.field(list("walls[].height"), "a wall height of 0, or above 100 m, is not one ArchLang can hold");
    out.push(
      `wall id=${id} ${category} thickness ${num(mmOf(w.thickness))}${heightClause} { ${points.map(pt).join(" ")} }`,
    );
    walls.set(w.id, { id, points, runs, curved: w.curvePoint !== undefined });
    ledger.mapped("walls");
  }

  // ---- rooms -------------------------------------------------------------------------------
  const { byRoom, cancelled } =
    format === "web" ? matchRecords(found, floor.rooms) : { byRoom: [], cancelled: new Set() };
  const sectionMatch = format === "handoff" ? matchSections(found, floor.sections) : [];
  const sectionOf = new Map<number, number>();
  sectionMatch.forEach((ri, si) => {
    if (ri >= 0 && !sectionOf.has(ri)) sectionOf.set(ri, si);
  });
  const shown = new Set<unknown>();
  let named = 0;
  const roomIds: string[] = [];
  found.rooms.forEach((room, ri) => {
    chargeSteps(room.polygon.length);
    const ring = dedupeRing(room.polygon.map(mmPt));
    let label = "";
    let use: string | undefined;
    let floorOpening = false;
    let fromId = `room_${ri + 1}`;
    const rec = byRoom[ri];
    if (rec) {
      shown.add(rec);
      label = rec.name;
      fromId = rec.id;
      floorOpening = rec.floorOpening;
      if (rec.use !== undefined) {
        if (own(USE_OF, rec.use) !== undefined) use = own(USE_OF, rec.use);
        else ledger.field(list("rooms[].details.roomType"), `the room type "${rec.use}" has no ArchLang use`);
      }
      if (rec.category === "garage" || rec.category === "utility") use ??= rec.category;
      else if (rec.category === "outdoor")
        ledger.field(list("rooms[].roomType"), "an outdoor room is imported as an indoor room");
    }
    const si = sectionOf.get(ri);
    if (si !== undefined) {
      const s = floor.sections[si]!;
      shown.add(s);
      label = s.displayName ?? sectionName(s.label);
      if (own(USE_OF, s.label) !== undefined) use = own(USE_OF, s.label);
    }
    const rect = rectOf(ring);
    if (floorOpening) {
      if (rect) {
        const id = idc.take("rooms", "void", fromId);
        out.push(`void id=${id} at (${num(rect.x)},${num(rect.y)}) size ${num(rect.w)}x${num(rect.h)}`);
        roomIds.push(id);
        return;
      }
      ledger.field(
        list("rooms[].floorOpening"),
        "a floor opening that is not a rectangle is imported as a room (ArchLang voids are rectangles)",
      );
    }
    const id = idc.take("rooms", "room", fromId);
    roomIds.push(id);
    const shape = rect
      ? `at (${num(rect.x)},${num(rect.y)}) size ${num(rect.w)}x${num(rect.h)}`
      : `polygon ${ring.map(pt).join(" ")}`;
    if (label !== "") named++;
    out.push(`room id=${id} ${shape}${label !== "" ? ` label ${str(label)}` : ""}${use ? ` uses ${use}` : ""}`);
  });
  found.nested.forEach((inner, oi) => {
    if (inner.length === 0) return;
    ledger.notes.push(
      `room ${roomIds[oi]} on floor "${floor.name}" surrounds ${inner.map((i) => roomIds[i]).join(", ")}: OpenPlan3D subtracts it, an ArchLang polygon has no hole, so the two overlap`,
    );
  });
  for (const rec of floor.rooms) {
    ledger.seen("rooms");
    if (shown.has(rec)) ledger.mapped("rooms");
    else if (cancelled.has(rec))
      ledger.drop("rooms", rec.id, rec.path, "another record names the same walls, so OpenPlan3D shows neither");
    else ledger.drop("rooms", rec.id, rec.path, "its walls enclose no closed loop, so OpenPlan3D shows no room for it");
  }
  floor.sections.forEach((s) => {
    ledger.seen("sections");
    if (shown.has(s)) ledger.mapped("sections");
    else
      ledger.drop(
        "sections",
        s.displayName ?? s.label,
        s.path,
        "no detected room is left for it to name (OpenPlan3D keeps it as a room with no walls)",
      );
  });

  // ---- doors, openings, windows ------------------------------------------------------------
  for (const d of floor.doors) {
    ledger.seen(d.kind);
    const host = walls.get(d.wallId);
    if (!host) {
      ledger.drop(d.kind, d.id, d.path, "its wall was not imported");
      continue;
    }
    const at = runAt(host, d.position);
    const width = mmOf(d.width);
    const head = mmOf(d.height);
    const headClause = head > 0 && head <= MAX_HEIGHT_MM ? ` head ${num(head)}` : "";
    if (headClause === "")
      ledger.field(list(`${d.kind}[].height`), "a door height above 100 m is not one ArchLang can hold");
    if (d.type === "opening") {
      const id = idc.take(d.kind, "o", d.id);
      out.push(`opening id=${id} on ${host.id} at ${num(at)} width ${num(width)}${headClause}`);
      ledger.mapped(d.kind);
      continue;
    }
    const id = idc.take(d.kind, "d", d.id);
    let clauses = "";
    // OpenPlan3D `doorSymbol` / `drawDoorOnWall`: `swingDirection: left` hangs the leaf on the
    // jamb nearer the wall's end, `right` on the one nearer its start; `flipSide: false` swings
    // it to the normal (-dy, dx) of the wall's direction, which is ArchLang's `swing in`.
    if (d.type === "single") {
      clauses = ` hinge near ${d.swingDirection === "left" ? "end" : "start"} swing ${d.flipSide ? "out" : "in"}`;
    } else if (d.type === "double" || d.type === "french") {
      // Both leaves sweep (-dy, dx) when `left` with `flipSide: false`; each of `right` and
      // `flipSide: true` turns them to the other face.
      const toNormal = (d.swingDirection === "left") !== d.flipSide;
      clauses = ` swing ${toNormal ? "in" : "out"}`;
      if (d.type === "french")
        ledger.field(
          list("doors[].type"),
          "a French door is drawn as a double door (ArchLang has no glazed hinged kind)",
        );
    } else if (d.type === "pocket") {
      // The pocket runs past the hinge jamb: past the end jamb for `left`.
      clauses = ` slide ${d.swingDirection === "left" ? "right" : "left"}`;
    } else if (d.type === "bifold") {
      // The panels fold to the (-dy, dx) side for `left` (`doorSymbol`, 30° off the wall).
      clauses = ` swing ${d.swingDirection === "left" ? "in" : "out"}`;
    } else if (d.type === "garage" && d.flipSide) {
      ledger.field(
        list("doors[].flipSide"),
        "ArchLang puts a garage door's overhead track on the side with floor itself",
      );
    }
    out.push(
      `door id=${id} ${own(DOOR_WORD, d.type) ?? ""}on ${host.id} at ${num(at)} width ${num(width)}${clauses}${headClause}`,
    );
    ledger.mapped(d.kind);
  }
  for (const w of floor.windows) {
    ledger.seen("windows");
    const host = walls.get(w.wallId);
    if (!host) {
      ledger.drop("windows", w.id, w.path, "its wall was not imported");
      continue;
    }
    const id = idc.take("windows", "win", w.id);
    if (w.type === "bay")
      ledger.field(list("windows[].type"), "a bay window is drawn as a plain window (ArchLang has no bay)");
    const sill = mmOf(w.sillHeight);
    const head = mmOf(w.sillHeight + w.height);
    let heights = "";
    if (head <= MAX_HEIGHT_MM && sill < head) heights = ` sill ${num(sill)} head ${num(head)}`;
    else ledger.field(list("windows[].sillHeight/height"), "a window head above 100 m is not one ArchLang can hold");
    out.push(
      `window id=${id} ${own(WINDOW_WORD, w.type) ?? ""}on ${host.id} at ${num(runAt(host, w.position))} width ${num(mmOf(w.width))}${heights}`,
    );
    ledger.mapped("windows");
  }

  // ---- stairs ------------------------------------------------------------------------------
  for (const s of floor.stairs) {
    ledger.seen("stairs");
    const q = quarterOfDegrees(s.rotation);
    if (s.stairType !== "straight") {
      ledger.drop("stairs", s.id, s.path, `its type is ${s.stairType}, and only straight flights are imported`);
      continue;
    }
    if (q === null) {
      ledger.drop(
        "stairs",
        s.id,
        s.path,
        "turned by a fraction of a quarter turn; ArchLang stairs run along the page's axes",
      );
      continue;
    }
    const w = mmOf(s.width);
    const d = mmOf(s.depth);
    const across = q === 90 || q === 270;
    const W = across ? d : w;
    const H = across ? w : d;
    // ArchLang runs a flight along its footprint's long axis (a square one runs down the page).
    if (across ? !(d > w) : !(d >= w)) {
      ledger.drop(
        "stairs",
        s.id,
        s.path,
        "it climbs along its shorter side, and an ArchLang flight runs along the longer one",
      );
      continue;
    }
    const x = round3(mmOf(s.position.x) - W / 2);
    const y = round3(mmOf(s.position.y) - H / 2);
    const id = idc.take("stairs", "stair", s.id);
    ledger.field(list("stairs[].riserCount"), "ArchLang chooses the risers from the storey height and the run");
    // OpenPlan3D draws a straight flight's foot at its local +y end in every direction (the arrow
    // climbs to −y for `up` and descends to +y for `down`); turned by `rotation` clockwise, the
    // foot is south at 0°, west at 90°, north at 180°, east at 270°. ArchLang's foot is at the
    // larger coordinate (south, east): 90° and 180° are its mirror image, placed from a component.
    if (q === 0 || q === 270) {
      out.push(`stair id=${id} at (${num(x)},${num(y)}) size ${num(W)}x${num(H)} dir ${s.direction}`);
    } else {
      const comp = flipName();
      components.push(
        `  component ${comp}() {`,
        `    stair id=s at (0,0) size ${num(W)}x${num(H)} dir ${s.direction}`,
        "  }",
      );
      out.push(
        q === 180
          ? `place ${comp}() as ${id} at (${num(x)},${num(round3(y + H))}) mirror y`
          : `place ${comp}() as ${id} at (${num(round3(x + W))},${num(y)}) mirror x`,
      );
    }
    ledger.mapped("stairs");
  }

  // ---- columns -----------------------------------------------------------------------------
  for (const c of floor.columns) {
    ledger.seen("columns");
    if (c.shape === "round") {
      ledger.drop("columns", c.id, c.path, "a round column (ArchLang columns are rectangles)");
      continue;
    }
    if (quarterOfDegrees(c.rotation) === null) {
      ledger.drop("columns", c.id, c.path, "turned off the page's axes (ArchLang columns are axis-aligned)");
      continue;
    }
    const side = mmOf(c.diameter);
    const id = idc.take("columns", "col", c.id);
    out.push(
      `column id=${id} at (${num(round3(mmOf(c.position.x) - side / 2))},${num(round3(mmOf(c.position.y) - side / 2))}) size ${num(side)}x${num(side)}`,
    );
    ledger.mapped("columns");
  }

  // ---- furniture ---------------------------------------------------------------------------
  for (const p of floor.furniture) {
    ledger.seen(p.kind);
    if (p.catalogId === null) {
      ledger.drop(p.kind, p.id, p.path, `the category "${p.category}" is no OpenPlan3D catalogue item`);
      continue;
    }
    const family = own(OPENPLAN3D_TO_FAMILY, p.catalogId);
    if (family === undefined) {
      ledger.drop(p.kind, p.id, p.path, `"${p.category}" has no ArchLang fixture family`);
      continue;
    }
    if (p.quarter === null) {
      ledger.drop(
        p.kind,
        p.id,
        p.path,
        "turned by a fraction of a quarter turn; ArchLang turns furniture by quarter turns",
      );
      continue;
    }
    const size = own(OPENPLAN3D_CATALOG_SIZES, p.catalogId)!;
    const w = mmOf((p.width ?? size[0]) * Math.abs(p.scaleX));
    const d = mmOf((p.depth ?? size[1]) * Math.abs(p.scaleY));
    if (!(w > 0 && d > 0)) {
      ledger.drop(p.kind, p.id, p.path, "a scale of 0 leaves it no footprint");
      continue;
    }
    // A mirror along the depth (negative scale.y) is a half turn and a left-right mirror.
    let rot = p.quarter;
    let mirror = p.scaleX < 0;
    if (p.scaleY < 0) {
      rot = (rot + 180) % 360;
      mirror = !mirror;
    }
    const across = rot === 90 || rot === 270;
    const W = across ? d : w;
    const H = across ? w : d;
    const id = idc.take(p.kind, "f", p.id);
    out.push(
      `furniture id=${id} ${family} at (${num(round3(mmOf(p.position.x) - W / 2))},${num(round3(mmOf(p.position.y) - H / 2))}) size ${num(W)}x${num(H)}${rot !== 0 ? ` rotate ${rot}` : ""}${mirror ? " mirror" : ""}`,
    );
    ledger.mapped(p.kind);
  }
  return { detected: roomIds.length, named };
}
