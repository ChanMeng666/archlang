/**
 * OpenPlan3D's two file formats read into one model, in OpenPlan3D's own units (centimetres, plan
 * x right, y down), with every default OpenPlan3D applies filled in and every value the importer
 * does not carry over written into a {@link Ledger}.
 *
 * Source of truth: github.com/laanlabs/openPlan3D (MIT) at commit
 * 98f9cb467e4045c6abc5d9880ada1f03dff50c68 — the web project validator `readProject`
 * (`src/lib/utils/projectValidation.ts`), the interchange validator `validateRoomPlan`
 * (`roomplanValidation.ts`) and its importer `importRoomPlan` / `importRoomPlanFloors`
 * (`roomplanImport.ts`). The checks and the defaults are theirs, in their order; a file either
 * validator refuses is refused here with the same path and reason, as an `E_IMPORT_FORMAT`
 * diagnostic, never a throw. Not ported: the checks of fields this importer drops whole
 * (`details`, `customModels`, `projectPackage`, `interchange`), and date parsing.
 *
 * Pure: no I/O, no clock, no randomness, no trigonometry; every read is charged to the step
 * meter (`src/expr.ts`) before the work it pays for.
 */

/*!
 * Portions of this file are adapted from OpenPlan3D (https://github.com/laanlabs/openPlan3D),
 * commit 98f9cb467e4045c6abc5d9880ada1f03dff50c68, which carries this licence:
 *
 * MIT License
 *
 * Copyright (c) 2026 theLodgeStudio
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import type { Diagnostic } from "../diagnostics.js";
import { chargeSteps } from "../expr.js";
import { MAX_IMPORT_LEVELS } from "./limits.js";
import { roomPlanCatalogId } from "./openplan3d-catalog.js";

export { MAX_IMPORT_LEVELS };

export interface Pt {
  x: number;
  y: number;
}

export interface OWall {
  id: string;
  path: string;
  start: Pt;
  end: Pt;
  thickness: number;
  startHeight: number;
  endHeight: number;
  curvePoint?: Pt;
}

export type DoorType = "single" | "double" | "sliding" | "french" | "pocket" | "bifold" | "opening" | "garage";
export type WindowType = "standard" | "fixed" | "casement" | "sliding" | "bay";

export interface ODoor {
  /** The list it came from, for the report: `doors`, or an interchange file's `openings`. */
  kind: "doors" | "openings";
  id: string;
  path: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  type: DoorType;
  swingDirection: "left" | "right";
  flipSide: boolean;
}

export interface OWindow {
  id: string;
  path: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  sillHeight: number;
  type: WindowType;
}

/** A saved `rooms[]` record: metadata keyed by the set of walls that bound it. */
export interface ORoomRecord {
  id: string;
  path: string;
  name: string;
  walls: string[];
  /** `roomType`: indoor | outdoor | garage | utility (free text in the file). */
  category?: string;
  /** `details.roomType`: livingRoom, bedroom, … */
  use?: string;
  floorOpening: boolean;
}

/** An interchange `sections[]` entry: a room label at a point. */
export interface OSection {
  path: string;
  center: Pt;
  label: string;
  displayName?: string;
}

export interface OStair {
  id: string;
  path: string;
  position: Pt;
  rotation: number;
  width: number;
  depth: number;
  riserCount: number;
  direction: "up" | "down";
  stairType: string;
}

export interface OColumn {
  id: string;
  path: string;
  position: Pt;
  rotation: number;
  shape: "round" | "square";
  diameter: number;
}

export interface OFurniture {
  /** The list it came from, for the report: web `furniture` or interchange `objects`. */
  kind: "furniture" | "objects";
  id: string;
  path: string;
  /** The catalogue id, or null for an interchange object no catalogue id matches. */
  catalogId: string | null;
  /** What the file called it, for the report (`category` key or `sourceCategory`). */
  category: string;
  position: Pt;
  /** Degrees, clockwise on the page, or null when it is not given as a whole quarter turn. */
  quarter: number | null;
  width?: number;
  depth?: number;
  scaleX: number;
  scaleY: number;
}

export interface OFloor {
  id: string;
  path: string;
  name: string;
  level: number;
  elevation: number;
  walls: OWall[];
  doors: ODoor[];
  windows: OWindow[];
  rooms: ORoomRecord[];
  sections: OSection[];
  stairs: OStair[];
  columns: OColumn[];
  furniture: OFurniture[];
}

export type OpenPlan3dFormat = "web" | "handoff";

export interface OModel {
  format: OpenPlan3dFormat;
  name: string;
  floors: OFloor[];
}

/** One input entity that is not in the output, and why. */
export interface DroppedEntity {
  kind: string;
  id: string;
  path: string;
  reason: string;
}

/** One input field whose value is not in the output (counted over every record that has it). */
export interface DroppedField {
  field: string;
  count: number;
  reason: string;
}

export interface KindCount {
  in: number;
  mapped: number;
  dropped: number;
}

/**
 * Everything the import did not carry over. Every input entity is counted `in` once and then
 * either `mapped` or `dropped` (with a {@link DroppedEntity}); every field of a carried entity
 * that the output does not hold is a {@link DroppedField}. Nothing leaves without an entry.
 */
export class Ledger {
  readonly counts = new Map<string, KindCount>();
  readonly dropped: DroppedEntity[] = [];
  private readonly fieldRows = new Map<string, DroppedField>();
  /** Editor post-processing this import does not reproduce (said once each). */
  readonly notes: string[] = [];

  seen(kind: string, n = 1): void {
    const c = this.count(kind);
    c.in += n;
  }
  mapped(kind: string): void {
    this.count(kind).mapped++;
  }
  drop(kind: string, id: string, path: string, reason: string): void {
    chargeSteps(1);
    this.count(kind).dropped++;
    this.dropped.push({ kind, id, path, reason });
  }
  field(field: string, reason: string): void {
    const key = `${field}\u0000${reason}`;
    const row = this.fieldRows.get(key);
    if (row) row.count++;
    else {
      chargeSteps(1);
      this.fieldRows.set(key, { field, count: 1, reason });
    }
  }
  fields(): DroppedField[] {
    return [...this.fieldRows.values()].sort((a, b) =>
      a.field < b.field ? -1 : a.field > b.field ? 1 : a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0,
    );
  }
  private count(kind: string): KindCount {
    let c = this.counts.get(kind);
    if (!c) {
      c = { in: 0, mapped: 0, dropped: 0 };
      this.counts.set(kind, c);
    }
    return c;
  }
}

/** At most this many `E_IMPORT_FORMAT` diagnostics are reported for one file. */
export const MAX_FORMAT_ERRORS = 100;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A file of more storeys than {@link MAX_IMPORT_LEVELS} is refused before any is built. */
function tooManyStoreys(n: number): Diagnostic {
  return {
    severity: "error",
    code: "E_IMPORT_LIMIT",
    message: `The OpenPlan3D file has ${n} storeys, more than the ${MAX_IMPORT_LEVELS} one import writes; nothing was written`,
    hints: ["Split the plan into several files, a few storeys each, and import them one by one."],
  };
}

/** OpenPlan3D's `isRoomPlanJson`: which of the two formats a parsed document is. */
export function detectFormat(data: unknown): OpenPlan3dFormat {
  if (!isRecord(data)) return "web";
  if (data.openplanPrepared === true || data.openplanHandoffVersion !== undefined) return "handoff";
  const walls = data.walls;
  if (Array.isArray(walls)) {
    chargeSteps(walls.length);
    if (walls.some((w) => isRecord(w) && w.dimensions !== undefined)) return "handoff";
  }
  return "web";
}

/** Collects `E_IMPORT_FORMAT` diagnostics with OpenPlan3D's own wording. */
class Refusals {
  readonly diagnostics: Diagnostic[] = [];
  constructor(private readonly prefix: string) {}
  fail(path: string, reason: string): false {
    if (this.diagnostics.length < MAX_FORMAT_ERRORS) {
      chargeSteps(1);
      this.diagnostics.push({
        severity: "error",
        code: "E_IMPORT_FORMAT",
        message: `${this.prefix}: ${path} ${reason}.`,
      });
    }
    return false;
  }
  get full(): boolean {
    return this.diagnostics.length >= MAX_FORMAT_ERRORS;
  }
}

/**
 * `table[key]` for a key that came from the input, or undefined. A plain object lookup would
 * answer `constructor`, `toString` or `__proto__` with `Object.prototype`'s members, so every
 * table this importer reads by an input string goes through here (own properties only).
 */
export function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** The keys of `rec` this importer does not read, each recorded with its reason. */
function leftover(
  ledger: Ledger,
  rec: Record<string, unknown>,
  where: string,
  read: readonly string[],
  reasons: Readonly<Record<string, string>>,
): void {
  const keys = Object.keys(rec);
  chargeSteps(keys.length);
  for (const k of keys) {
    if (read.includes(k)) continue;
    ledger.field(`${where}.${k}`, own(reasons, k) ?? "not read by the importer");
  }
}

const NOT_DRAWN_FINISH = "a finish (colour or texture): ArchLang draws no finishes";
const DETAILS = "item details (note, material, price, photos) are not modelled";

const WALL_REASONS: Record<string, string> = {
  color: NOT_DRAWN_FINISH,
  texture: NOT_DRAWN_FINISH,
  interiorColor: NOT_DRAWN_FINISH,
  interiorTexture: NOT_DRAWN_FINISH,
  exteriorColor: NOT_DRAWN_FINISH,
  exteriorTexture: NOT_DRAWN_FINISH,
  details: DETAILS,
};
const OPENING_REASONS: Record<string, string> = { details: DETAILS };
const ROOM_REASONS: Record<string, string> = {
  floorTexture: NOT_DRAWN_FINISH,
  color: NOT_DRAWN_FINISH,
  labelOffset: "ArchLang places a room's label itself",
  area: "ArchLang computes the area from the outline",
};
const FURNITURE_REASONS: Record<string, string> = {
  color: NOT_DRAWN_FINISH,
  material: NOT_DRAWN_FINISH,
  height: "furniture heights are not modelled",
  locked: "an editor setting",
  customModelId: "a project 3D model; the catalogue id is used",
  sourceCategory: "the original category of an unrecognised item",
  details: DETAILS,
};
const COLUMN_REASONS: Record<string, string> = {
  height: "ArchLang columns have no height",
  color: NOT_DRAWN_FINISH,
};
const FLOOR_REASONS: Record<string, string> = {
  slabThickness: "ArchLang draws no floor slab",
};
const PROJECT_REASONS: Record<string, string> = {
  id: "project metadata",
  activeFloorId: "an editor setting",
  createdAt: "project metadata",
  updatedAt: "project metadata",
  description: "project metadata",
  customModels: "project 3D models are not modelled",
  customEntourage: "presentation symbols are not modelled",
  projectPackage: "native app data is not modelled",
  interchange: "sibling planner data is not modelled",
  attachmentNames: "attachments are not modelled",
};

/** The floor arrays the importer drops whole, and why. */
const WHOLE_FLOOR_KINDS: Record<string, string> = {
  guides: "editor guide lines draw nothing on a plan",
  measurements: "measuring-tool lines are not part of the plan",
  annotations: "dimension lines are not imported; `dims auto` draws dimensions",
  textAnnotations: "free text on the plan is not modelled",
  groups: "selection groups carry no geometry",
  entourage: "presentation symbols are not modelled",
};

// ---------------------------------------------------------------------------------------------
// Web project JSON (`readProject`)
// ---------------------------------------------------------------------------------------------

/** Read a web project document; `null` when OpenPlan3D's validator would refuse it. */
export function readWebProject(
  data: unknown,
  ledger: Ledger,
): { model: OModel; diagnostics: Diagnostic[] } | { model: null; diagnostics: Diagnostic[] } {
  const r = new Refusals("Invalid project");
  const fail = (p: string, why: string) => r.fail(p, why);
  if (!isRecord(data)) {
    fail("document", "must be an object");
    return { model: null, diagnostics: r.diagnostics };
  }
  const text = (v: unknown, p: string, nonempty = false): boolean =>
    typeof v !== "string" || (nonempty && !v.trim())
      ? fail(p, nonempty ? "must be nonempty text" : "must be text")
      : true;
  const number = (v: unknown, p: string, min = -Infinity, max = Infinity): boolean =>
    !finite(v) || v < min || v > max ? fail(p, "must be a finite number in range") : true;
  const positive = (v: unknown, p: string): boolean =>
    number(v, p) && (v as number) > 0 ? true : finite(v) ? fail(p, "must be greater than zero") : false;
  const point = (v: unknown, p: string): boolean => {
    if (!isRecord(v)) return fail(p, "must be an object");
    const a = number(v.x, `${p}.x`);
    const b = number(v.y, `${p}.y`);
    return a && b;
  };
  const optText = (rec: Record<string, unknown>, keys: string[], p: string): boolean => {
    let ok = true;
    for (const k of keys) if (rec[k] !== undefined) ok = text(rec[k], `${p}.${k}`) && ok;
    return ok;
  };
  const optBool = (rec: Record<string, unknown>, keys: string[], p: string): boolean => {
    let ok = true;
    for (const k of keys)
      if (rec[k] !== undefined && typeof rec[k] !== "boolean") ok = fail(`${p}.${k}`, "must be a boolean") && ok;
    return ok;
  };
  const choice = (v: unknown, allowed: readonly string[], p: string): boolean =>
    typeof v === "string" && allowed.includes(v) ? true : fail(p, "has an unsupported value");
  const ids = (v: unknown, p: string): v is string[] => {
    if (!Array.isArray(v)) return fail(p, "must be an array");
    chargeSteps(v.length);
    let ok = true;
    v.forEach((id, i) => {
      ok = text(id, `${p}[${i}]`, true) && ok;
    });
    return ok;
  };

  chargeSteps(1);
  text(data.id, "id", true);
  const name = data.name === undefined ? "Untitled Project" : data.name;
  text(name, "name");
  optText(data, ["description"], "document");
  if (data.attachmentNames !== undefined && !isRecord(data.attachmentNames))
    fail("attachmentNames", "must be an object");
  if (data.interchange !== undefined && !isRecord(data.interchange)) fail("interchange", "must be an object");
  const floorsRaw = data.floors;
  if (!Array.isArray(floorsRaw)) {
    fail("document.floors", "must be an array");
    return { model: null, diagnostics: r.diagnostics };
  }
  if (floorsRaw.length === 0) fail("floors", "must contain at least one floor");
  if (floorsRaw.length > MAX_IMPORT_LEVELS) return { model: null, diagnostics: [tooManyStoreys(floorsRaw.length)] };
  leftover(ledger, data, "project", ["name", "floors"], PROJECT_REASONS);

  const floorIds = new Set<string>();
  const floors: OFloor[] = [];
  for (let fi = 0; fi < floorsRaw.length && !r.full; fi++) {
    const p = `floors[${fi}]`;
    const fl = floorsRaw[fi];
    chargeSteps(1);
    if (!isRecord(fl)) {
      fail(p, "must be an object");
      continue;
    }
    if (text(fl.id, `${p}.id`, true)) {
      if (floorIds.has(fl.id as string)) fail(`${p}.id`, "duplicates another floor");
      floorIds.add(fl.id as string);
    }
    const fname = fl.name === undefined ? (fi === 0 ? "Ground Floor" : `Floor ${fi}`) : fl.name;
    text(fname, `${p}.name`);
    const level = fl.level === undefined ? fi : fl.level;
    if (!Number.isSafeInteger(level)) fail(`${p}.level`, "must be an integer");
    if (fl.elevation !== undefined) number(fl.elevation, `${p}.elevation`);
    if (fl.slabThickness !== undefined) positive(fl.slabThickness, `${p}.slabThickness`);
    const floor: OFloor = {
      id: typeof fl.id === "string" ? fl.id : "",
      path: p,
      name: typeof fname === "string" ? fname : "",
      level: Number.isSafeInteger(level) ? (level as number) : fi,
      elevation: 0,
      walls: [],
      doors: [],
      windows: [],
      rooms: [],
      sections: [],
      stairs: [],
      columns: [],
      furniture: [],
    };
    floor.elevation = finite(fl.elevation) ? fl.elevation : floor.level * 300;
    const seen = new Set<string>();
    /** Each record of `fl[key]` that is an object with a fresh nonempty id. */
    const elements = (
      key: string,
      optional: boolean,
      visit: (item: Record<string, unknown>, ip: string) => void,
    ): void => {
      const list = fl[key];
      if (list === undefined && optional) return;
      if (!Array.isArray(list)) {
        fail(`${p}.${key}`, "must be an array");
        return;
      }
      chargeSteps(list.length);
      for (let i = 0; i < list.length && !r.full; i++) {
        const ip = `${p}.${key}[${i}]`;
        const item = list[i];
        if (!isRecord(item)) {
          fail(ip, "must be an object");
          continue;
        }
        if (!text(item.id, `${ip}.id`, true)) continue;
        if (seen.has(item.id as string)) {
          fail(`${ip}.id`, "duplicates another element on this floor");
          continue;
        }
        seen.add(item.id as string);
        visit(item, ip);
      }
    };
    const positioned = (item: Record<string, unknown>, ip: string): boolean => {
      const a = point(item.position, `${ip}.position`);
      const b = item.rotation === undefined || number(item.rotation, `${ip}.rotation`);
      return a && b;
    };

    elements("walls", false, (w, ip) => {
      let ok = point(w.start, `${ip}.start`);
      ok = point(w.end, `${ip}.end`) && ok;
      ok = positive(w.thickness, `${ip}.thickness`) && ok;
      for (const k of ["startHeight", "endHeight"]) if (w[k] !== undefined) ok = number(w[k], `${ip}.${k}`, 0) && ok;
      const sh = finite(w.startHeight) ? w.startHeight : 280;
      const eh = finite(w.endHeight) ? w.endHeight : 280;
      const height = w.height === undefined ? Math.max(sh, eh) : w.height;
      ok = number(height, `${ip}.height`, 0) && ok;
      if (w.curvePoint !== undefined) ok = point(w.curvePoint, `${ip}.curvePoint`) && ok;
      ok =
        optText(w, ["color", "texture", "interiorColor", "interiorTexture", "exteriorColor", "exteriorTexture"], ip) &&
        ok;
      if (!ok) return;
      const legacy = height as number;
      // `getWallStartHeight` / `getWallEndHeight`: an endpoint height, else the legacy height.
      const startHeight = finite(w.startHeight) && w.startHeight >= 0 ? w.startHeight : legacy;
      const endHeight = finite(w.endHeight) && w.endHeight >= 0 ? w.endHeight : legacy;
      const s = w.start as Pt;
      const e = w.end as Pt;
      const c = w.curvePoint as Pt | undefined;
      floor.walls.push({
        id: w.id as string,
        path: ip,
        start: { x: s.x, y: s.y },
        end: { x: e.x, y: e.y },
        thickness: w.thickness as number,
        startHeight,
        endHeight,
        ...(c ? { curvePoint: { x: c.x, y: c.y } } : {}),
      });
      leftover(
        ledger,
        w,
        "floors[].walls[]",
        ["id", "start", "end", "thickness", "height", "startHeight", "endHeight", "curvePoint"],
        WALL_REASONS,
      );
    });
    const wallIds = new Set(floor.walls.map((w) => w.id));
    // A wall that failed its own checks is still a wall the file names: refer to the raw ids.
    const rawWalls = Array.isArray(fl.walls) ? fl.walls : [];
    for (const w of rawWalls) if (isRecord(w) && typeof w.id === "string") wallIds.add(w.id);

    for (const kind of ["doors", "windows"] as const) {
      elements(kind, true, (o, ip) => {
        let ok = text(o.wallId, `${ip}.wallId`, true);
        if (ok && !wallIds.has(o.wallId as string)) ok = fail(`${ip}.wallId`, "must refer to a wall on the same floor");
        ok = number(o.position, `${ip}.position`, 0, 1) && ok;
        ok = positive(o.width, `${ip}.width`) && ok;
        const height = o.height === undefined ? (kind === "doors" ? 210 : 120) : o.height;
        ok = positive(height, `${ip}.height`) && ok;
        if (kind === "doors") {
          const type = o.type === undefined ? "single" : o.type;
          const swing = o.swingDirection === undefined ? "left" : o.swingDirection;
          ok =
            choice(
              type,
              ["single", "double", "sliding", "french", "pocket", "bifold", "opening", "garage"],
              `${ip}.type`,
            ) && ok;
          ok = choice(swing, ["left", "right"], `${ip}.swingDirection`) && ok;
          ok = optBool(o, ["flipSide"], ip) && ok;
          if (!ok) return;
          floor.doors.push({
            kind: "doors",
            id: o.id as string,
            path: ip,
            wallId: o.wallId as string,
            position: o.position as number,
            width: o.width as number,
            height: height as number,
            type: type as DoorType,
            swingDirection: swing as "left" | "right",
            flipSide: o.flipSide === true,
          });
          leftover(
            ledger,
            o,
            "floors[].doors[]",
            ["id", "wallId", "position", "width", "height", "type", "swingDirection", "flipSide"],
            OPENING_REASONS,
          );
        } else {
          const type = o.type === undefined ? "standard" : o.type;
          const sill = o.sillHeight === undefined ? 90 : o.sillHeight;
          ok = choice(type, ["standard", "fixed", "casement", "sliding", "bay"], `${ip}.type`) && ok;
          ok = number(sill, `${ip}.sillHeight`, 0) && ok;
          if (!ok) return;
          floor.windows.push({
            id: o.id as string,
            path: ip,
            wallId: o.wallId as string,
            position: o.position as number,
            width: o.width as number,
            height: height as number,
            sillHeight: sill as number,
            type: type as WindowType,
          });
          leftover(
            ledger,
            o,
            "floors[].windows[]",
            ["id", "wallId", "position", "width", "height", "type", "sillHeight"],
            OPENING_REASONS,
          );
        }
      });
    }

    elements("furniture", true, (f, ip) => {
      let ok = text(f.catalogId, `${ip}.catalogId`, true);
      ok = positioned(f, ip) && ok;
      const scale = f.scale === undefined ? { x: 1, y: 1, z: 1 } : f.scale;
      if (!isRecord(scale)) ok = fail(`${ip}.scale`, "must be an object") && ok;
      else for (const k of ["x", "y", "z"]) ok = number(scale[k], `${ip}.scale.${k}`) && ok;
      for (const k of ["width", "depth", "height"]) if (f[k] !== undefined) ok = positive(f[k], `${ip}.${k}`) && ok;
      ok = optText(f, ["color", "material", "sourceCategory"], ip) && ok;
      ok = optBool(f, ["locked"], ip) && ok;
      if (!ok) return;
      const sc = scale as Record<string, number>;
      if (sc.z !== 1) ledger.field("floors[].furniture[].scale.z", "furniture heights are not modelled");
      const pos = f.position as Pt;
      floor.furniture.push({
        kind: "furniture",
        id: f.id as string,
        path: ip,
        catalogId: f.catalogId as string,
        category:
          typeof f.sourceCategory === "string"
            ? `${f.catalogId as string} (${f.sourceCategory})`
            : (f.catalogId as string),
        position: { x: pos.x, y: pos.y },
        quarter: quarterOfDegrees(finite(f.rotation) ? f.rotation : 0),
        ...(finite(f.width) ? { width: f.width } : {}),
        ...(finite(f.depth) ? { depth: f.depth } : {}),
        scaleX: sc.x!,
        scaleY: sc.y!,
      });
      leftover(
        ledger,
        f,
        "floors[].furniture[]",
        ["id", "catalogId", "position", "rotation", "scale", "width", "depth"],
        FURNITURE_REASONS,
      );
    });

    elements("stairs", true, (s, ip) => {
      let ok = positioned(s, ip);
      ok = positive(s.width, `${ip}.width`) && ok;
      ok = positive(s.depth, `${ip}.depth`) && ok;
      if (!Number.isSafeInteger(s.riserCount) || (s.riserCount as number) < 1)
        ok = fail(`${ip}.riserCount`, "must be a positive integer") && ok;
      const stairType = s.stairType === undefined ? "straight" : s.stairType;
      const direction = s.direction === undefined ? "up" : s.direction;
      ok = choice(stairType, ["straight", "l-shaped", "u-shaped", "spiral"], `${ip}.stairType`) && ok;
      ok = choice(direction, ["up", "down"], `${ip}.direction`) && ok;
      if (!ok) return;
      const pos = s.position as Pt;
      floor.stairs.push({
        id: s.id as string,
        path: ip,
        position: { x: pos.x, y: pos.y },
        rotation: finite(s.rotation) ? s.rotation : 0,
        width: s.width as number,
        depth: s.depth as number,
        riserCount: s.riserCount as number,
        direction: direction as "up" | "down",
        stairType: stairType as string,
      });
      leftover(
        ledger,
        s,
        "floors[].stairs[]",
        ["id", "position", "rotation", "width", "depth", "riserCount", "direction", "stairType"],
        {},
      );
    });

    elements("columns", true, (c, ip) => {
      let ok = positioned(c, ip);
      ok = positive(c.diameter, `${ip}.diameter`) && ok;
      ok = number(c.height, `${ip}.height`, 0) && ok;
      ok = choice(c.shape, ["round", "square"], `${ip}.shape`) && ok;
      if (c.color !== undefined) ok = text(c.color, `${ip}.color`) && ok;
      if (!ok) return;
      const pos = c.position as Pt;
      floor.columns.push({
        id: c.id as string,
        path: ip,
        position: { x: pos.x, y: pos.y },
        rotation: finite(c.rotation) ? c.rotation : 0,
        shape: c.shape as "round" | "square",
        diameter: c.diameter as number,
      });
      leftover(ledger, c, "floors[].columns[]", ["id", "position", "rotation", "shape", "diameter"], COLUMN_REASONS);
    });

    elements("rooms", true, (rm, ip) => {
      let ok = optBool(rm, ["floorOpening"], ip);
      ok = ids(rm.walls, `${ip}.walls`) && ok;
      ok = optText(rm, ["name", "floorTexture", "color", "roomType"], ip) && ok;
      if (rm.area !== undefined) ok = number(rm.area, `${ip}.area`, 0) && ok;
      if (rm.labelOffset !== undefined) ok = point(rm.labelOffset, `${ip}.labelOffset`) && ok;
      if (rm.details !== undefined && !isRecord(rm.details)) ok = fail(`${ip}.details`, "must be an object") && ok;
      if (!ok) return;
      const det = isRecord(rm.details) ? rm.details : undefined;
      const use = typeof det?.roomType === "string" ? det.roomType : undefined;
      floor.rooms.push({
        id: rm.id as string,
        path: ip,
        name: typeof rm.name === "string" ? rm.name : "",
        walls: [...(rm.walls as string[])],
        ...(typeof rm.roomType === "string" ? { category: rm.roomType } : {}),
        ...(use !== undefined ? { use } : {}),
        floorOpening: rm.floorOpening === true,
      });
      if (det) {
        const keys = Object.keys(det);
        chargeSteps(keys.length);
        for (const k of keys) {
          if (k === "roomType") continue;
          ledger.field(
            `floors[].rooms[].details.${k}`,
            k === "ceilingHeight" ? "a room's ceiling height is metadata, not a wall height" : DETAILS,
          );
        }
      }
      leftover(
        ledger,
        rm,
        "floors[].rooms[]",
        ["id", "name", "walls", "roomType", "details", "floorOpening"],
        ROOM_REASONS,
      );
    });

    elements("guides", true, (g, ip) => {
      choice(g.orientation, ["horizontal", "vertical"], `${ip}.orientation`);
      number(g.position, `${ip}.position`);
    });
    for (const key of ["measurements", "annotations"]) {
      elements(key, true, (m, ip) => {
        for (const k of ["x1", "y1", "x2", "y2"]) number(m[k], `${ip}.${k}`);
        if (key === "annotations") {
          if (m.offset !== undefined) number(m.offset, `${ip}.offset`);
          optText(m, ["label"], ip);
        }
      });
    }
    elements("textAnnotations", true, (t, ip) => {
      number(t.x, `${ip}.x`);
      number(t.y, `${ip}.y`);
      text(t.text, `${ip}.text`);
      if (t.fontSize !== undefined) positive(t.fontSize, `${ip}.fontSize`);
      if (t.rotation !== undefined) number(t.rotation, `${ip}.rotation`);
      if (t.color !== undefined) text(t.color, `${ip}.color`);
    });
    elements("groups", true, (g, ip) => {
      ids(g.elementIds, `${ip}.elementIds`);
    });
    if (fl.entourage !== undefined) {
      elements("entourage", true, (e, ip) => {
        text(e.defId, `${ip}.defId`, true);
        positioned(e, ip);
        positive(e.width, `${ip}.width`);
        if (e.opacity !== undefined) number(e.opacity, `${ip}.opacity`, 0, 1);
        optBool(e, ["locked"], ip);
      });
    }
    if (fl.backgroundImage !== undefined) {
      const bp = `${p}.backgroundImage`;
      const bg = fl.backgroundImage;
      if (!isRecord(bg)) fail(bp, "must be an object");
      else {
        text(bg.dataUrl, `${bp}.dataUrl`, true);
        positioned(bg, bp);
        positive(bg.scale, `${bp}.scale`);
        if (bg.opacity !== undefined) number(bg.opacity, `${bp}.opacity`, 0, 1);
        optBool(bg, ["locked"], bp);
      }
    }

    // Count and drop the arrays this importer does not carry, entity by entity.
    for (const [key, why] of Object.entries(WHOLE_FLOOR_KINDS)) {
      const list = fl[key];
      if (!Array.isArray(list)) continue;
      ledger.seen(key, list.length);
      list.forEach((item, i) => {
        ledger.drop(key, isRecord(item) && typeof item.id === "string" ? item.id : "", `${p}.${key}[${i}]`, why);
      });
    }
    if (fl.backgroundImage !== undefined) {
      ledger.seen("backgroundImage");
      ledger.drop("backgroundImage", "", `${p}.backgroundImage`, "a tracing image is not part of the plan");
    }
    leftover(
      ledger,
      fl,
      "floors[]",
      [
        "id",
        "name",
        "level",
        "elevation",
        "walls",
        "doors",
        "windows",
        "furniture",
        "stairs",
        "columns",
        "rooms",
        "backgroundImage",
        ...Object.keys(WHOLE_FLOOR_KINDS),
      ],
      FLOOR_REASONS,
    );
    floors.push(floor);
  }
  if (data.activeFloorId !== undefined) text(data.activeFloorId, "activeFloorId");
  if (data.customEntourage !== undefined && !Array.isArray(data.customEntourage))
    fail("document.customEntourage", "must be an array");
  for (const key of ["createdAt", "updatedAt"]) {
    const v = data[key];
    if (v !== undefined && typeof v !== "string") fail(key, "must be a date");
  }
  if (r.diagnostics.length > 0) return { model: null, diagnostics: r.diagnostics };
  return { model: { format: "web", name: name as string, floors }, diagnostics: [] };
}

/** `rotation` in degrees as a whole quarter turn (0, 90, 180, 270), within 1e-6°, or null. */
export function quarterOfDegrees(deg: number): number | null {
  const r = ((deg % 360) + 360) % 360;
  for (const q of [0, 90, 180, 270, 360]) if (Math.abs(r - q) <= 1e-6) return q % 360;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Prepared RoomPlan interchange JSON (`validateRoomPlan` + `importRoomPlanFloors`)
// ---------------------------------------------------------------------------------------------

/** `roomplanValidation.ts`: a wall shorter than this (metres) is left out with its openings. */
const COLLAPSED_WALL_LENGTH = 1e-6;

/** `roomplanImport.ts` `centimetres`: metres to centimetres, kept to eight decimals. */
const centimetres = (metres: number): number => Math.round(metres * 100 * 1e8) / 1e8;

const categoryKey = (cat: unknown): string =>
  typeof cat === "string" ? cat : isRecord(cat) ? (Object.keys(cat)[0] ?? "") : "";

const SECTION_NAMES: Readonly<Record<string, string>> = {
  livingRoom: "Living Room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  diningRoom: "Dining Room",
  laundryRoom: "Laundry",
  office: "Office",
  hallway: "Hallway",
  garage: "Garage",
  closet: "Closet",
  pantry: "Pantry",
  entryway: "Entryway",
};

/** `mapSectionLabel`. */
export const sectionName = (label: string): string => own(SECTION_NAMES, label) ?? label;

const HANDOFF_TOP_REASONS: Record<string, string> = {
  openplanPrepared: "format marker",
  openplanHandoffVersion: "format marker",
  version: "Apple capture metadata, ignored by OpenPlan3D too",
  floors: "Apple capture metadata, ignored by OpenPlan3D too",
  story: "Apple capture metadata, ignored by OpenPlan3D too",
  coreModel: "Apple capture metadata, ignored by OpenPlan3D too",
  referenceOriginTransform: "Apple capture metadata, ignored by OpenPlan3D too",
  defaults: "sibling planner data is not modelled",
  planNotes: "sibling planner data is not modelled",
  openkitchen3d: "sibling planner data is not modelled",
  openlandscape3d: "sibling planner data is not modelled",
  opencatio3d: "sibling planner data is not modelled",
};
const HANDOFF_ITEM_REASONS: Record<string, string> = {
  attributes: "sibling planner attributes are not modelled",
  confidence: "capture metadata",
  curve: "capture metadata",
  edges: "capture metadata",
  polygonCorners: "capture metadata",
  completedEdges: "capture metadata",
  parentIdentifier: "the host wall",
  color: NOT_DRAWN_FINISH,
};

/** Read a prepared RoomPlan interchange document; `null` when `validateRoomPlan` would refuse it. */
export function readHandoff(
  data: unknown,
  ledger: Ledger,
  fileName: string | undefined,
): { model: OModel; diagnostics: Diagnostic[] } | { model: null; diagnostics: Diagnostic[] } {
  const r = new Refusals("Invalid RoomPlan file");
  const fail = (p: string, why: string) => r.fail(p, why);
  if (!isRecord(data)) {
    fail("document", "must be an object");
    return { model: null, diagnostics: r.diagnostics };
  }
  if (!Array.isArray(data.walls)) {
    fail("walls", "must be an array");
    return { model: null, diagnostics: r.diagnostics };
  }
  if (data.openplanHandoffVersion !== undefined && data.openplanHandoffVersion !== 1)
    fail("openplanHandoffVersion", "is not supported by this version of the editor");
  const list = (key: string): unknown[] => {
    const v = data[key];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      fail(key, "must be an array");
      return [];
    }
    chargeSteps(v.length);
    return v;
  };
  const LISTS = ["walls", "doors", "windows", "openings", "objects"] as const;
  const idents = new Set<string>();
  const wallStory = new Map<string, number>();
  for (const key of LISTS) {
    const items = list(key);
    for (let i = 0; i < items.length && !r.full; i++) {
      const p = `${key}[${i}]`;
      const item = items[i];
      chargeSteps(1);
      if (!isRecord(item)) {
        fail(p, "must be an object");
        continue;
      }
      if (typeof item.identifier !== "string" || !item.identifier.trim()) {
        fail(p, "needs an identifier");
        continue;
      }
      if (idents.has(item.identifier)) fail(p, "has a duplicate identifier");
      idents.add(item.identifier);
      const size = item.dimensions;
      if (!Array.isArray(size) || size.length < 2 || !size.every(finite)) {
        fail(`${p}.dimensions`, "must list a finite width and height, and optionally depth, in metres");
      } else {
        const s = size as number[];
        if (key === "walls" ? s[0]! < 0 : s[0]! <= 0)
          fail(`${p}.dimensions`, key === "walls" ? "must have a nonnegative length" : "must have a positive width");
        if (s[1]! <= 0) fail(`${p}.dimensions`, "must have a positive height");
        // `size[2] < 0` / `!(size[2] > 0)` as OpenPlan3D writes them: an absent depth passes for
        // an opening (undefined < 0 is false) and fails for an object.
        if (key === "objects" ? !(s[2]! > 0) : s[2]! < 0)
          fail(`${p}.dimensions`, key === "objects" ? "must have a positive depth" : "must have a nonnegative depth");
      }
      const t = item.transform;
      if (
        !Array.isArray(t) ||
        t.length !== 16 ||
        !t.every(finite) ||
        Math.sqrt((t[0] as number) * (t[0] as number) + (t[2] as number) * (t[2] as number)) < 1e-8
      )
        fail(`${p}.transform`, "must be a finite 4×4 transform with a horizontal direction");
      if (item.story !== undefined && !Number.isSafeInteger(item.story)) fail(`${p}.story`, "must be an integer");
      for (const f of ["hingeLeft", "opensInward"])
        if (item[f] !== undefined && typeof item[f] !== "boolean") fail(`${p}.${f}`, "must be a boolean");
      if (item.sillHeight !== undefined && (!finite(item.sillHeight) || item.sillHeight < 0))
        fail(`${p}.sillHeight`, "must be a nonnegative number in metres");
      if (item.style !== undefined) {
        const allowed = key === "doors" ? ["single", "double", "sliding", "patio"] : ["fixed", "sliding"];
        if (typeof item.style !== "string" || !allowed.includes(item.style))
          fail(`${p}.style`, "is not supported for this opening");
      }
      if (key === "walls")
        wallStory.set(item.identifier, Number.isSafeInteger(item.story) ? (item.story as number) : 0);
    }
  }
  for (const key of ["doors", "windows", "openings"] as const) {
    const items = list(key);
    items.forEach((item, i) => {
      if (!isRecord(item)) return;
      const host = typeof item.parentIdentifier === "string" ? wallStory.get(item.parentIdentifier) : undefined;
      const story = Number.isSafeInteger(item.story) ? (item.story as number) : 0;
      if (host === undefined || host !== story)
        fail(`${key}[${i}].parentIdentifier`, "must refer to a wall on the same floor");
    });
  }
  const storyNames = new Map<number, string>();
  list("stories").forEach((s, i) => {
    if (!isRecord(s) || !Number.isSafeInteger(s.index) || typeof s.name !== "string") {
      fail(`stories[${i}]`, "needs an integer index and a name");
      return;
    }
    if (storyNames.has(s.index as number)) fail(`stories[${i}]`, "has a duplicate floor index");
    storyNames.set(s.index as number, s.name);
  });
  list("sections").forEach((s, i) => {
    const p = `sections[${i}]`;
    if (
      !isRecord(s) ||
      !Array.isArray(s.center) ||
      s.center.length !== 3 ||
      !s.center.every(finite) ||
      typeof s.label !== "string"
    ) {
      fail(p, "needs a finite centre and room label");
      return;
    }
    if (s.story !== undefined && !Number.isSafeInteger(s.story)) fail(`${p}.story`, "must be an integer");
    for (const f of ["displayName", "color"])
      if (s[f] !== undefined && typeof s[f] !== "string") fail(`${p}.${f}`, "must be text");
  });
  const opts = data.openplanImportOptions;
  if (
    opts !== undefined &&
    (!isRecord(opts) || typeof opts.straighten !== "boolean" || typeof opts.orthogonal !== "boolean")
  )
    fail("openplanImportOptions", "needs boolean straighten and orthogonal choices");
  if (r.diagnostics.length > 0) return { model: null, diagnostics: r.diagnostics };

  // ---- the file is valid: build each storey as `importRoomPlanFloors` does -------------------
  // Read as OpenPlan3D reads it: by truthiness (`data?.openplanPrepared ? … : …`).
  const prepared = Boolean(data.openplanPrepared);
  // `roomPlanImportOptions`: explicit choices win; a prepared file is not straightened.
  const straighten = isRecord(opts) ? opts.straighten === true || opts.orthogonal === true : !prepared;
  if (straighten) {
    ledger.notes.push(
      isRecord(opts)
        ? "openplanImportOptions asks OpenPlan3D to straighten the walls and merge corners within 15 cm; this import keeps the walls exactly as written"
        : "OpenPlan3D straightens an unprepared RoomPlan capture on import (walls squared within 5°, corners merged within 15 cm); this import keeps the walls exactly as captured",
    );
  }
  for (const [k, why] of Object.entries(HANDOFF_TOP_REASONS))
    if (data[k] !== undefined && k !== "openplanPrepared" && k !== "openplanHandoffVersion") ledger.field(k, why);
  leftover(
    ledger,
    data,
    "document",
    [...LISTS, "sections", "stories", "openplanImportOptions", ...Object.keys(HANDOFF_TOP_REASONS)],
    {},
  );

  const storyOf = (item: Record<string, unknown>): number => (typeof item.story === "number" ? item.story : 0);
  const recs = (key: string): Record<string, unknown>[] =>
    Array.isArray(data[key]) ? (data[key] as Record<string, unknown>[]) : [];
  // One pass puts every item in its storey's bucket (paid for item by item), so building a
  // storey reads only its own items, never every list once per storey.
  const buckets = new Map<number, Map<string, Record<string, unknown>[]>>();
  const bucket = (index: number): Map<string, Record<string, unknown>[]> => {
    let b = buckets.get(index);
    if (!b) {
      chargeSteps(1);
      b = new Map();
      buckets.set(index, b);
    }
    return b;
  };
  for (const key of [...LISTS, "sections"]) {
    const items = recs(key);
    chargeSteps(items.length);
    for (const it of items) {
      const b = bucket(storyOf(it));
      const list = b.get(key);
      if (list) list.push(it);
      else b.set(key, [it]);
    }
  }
  for (const s of recs("stories")) bucket(s.index as number);
  if (buckets.size === 0) bucket(0);
  if (buckets.size > MAX_IMPORT_LEVELS) return { model: null, diagnostics: [tooManyStoreys(buckets.size)] };
  const sorted = [...buckets.keys()].sort((a, b) => a - b);
  const of = (index: number, key: string): Record<string, unknown>[] => buckets.get(index)?.get(key) ?? [];
  const openingIds = new Set(recs("openings").map((o) => o.identifier));
  const sourceWalls = new Map(recs("walls").map((w) => [w.identifier, w] as const));
  // Every listed storey becomes a level (an empty one included), so each is carried.
  const stories = recs("stories").length;
  ledger.seen("stories", stories);
  for (let i = 0; i < stories; i++) ledger.mapped("stories");

  // Path of each item by identity, for the report.
  const pathOf = new Map<unknown, string>();
  for (const key of [...LISTS, "sections"]) {
    const items = recs(key);
    for (let i = 0; i < items.length; i++) pathOf.set(items[i], `${key}[${i}]`);
  }

  const floors: OFloor[] = [];
  for (const index of sorted) {
    chargeSteps(1);
    const floor: OFloor = {
      id: `story-${index}`,
      path: `stories[index=${index}]`,
      name: storyName(index, storyNames),
      level: index,
      elevation: index * 300,
      walls: [],
      doors: [],
      windows: [],
      rooms: [],
      sections: [],
      stairs: [],
      columns: [],
      furniture: [],
    };
    const rpWalls = of(index, "walls");
    const wallById = new Map<string, OWall>();
    for (const rw of rpWalls) {
      chargeSteps(1);
      const id = rw.identifier as string;
      const p = pathOf.get(rw)!;
      const dims = rw.dimensions as number[];
      const t = rw.transform as number[];
      if (dims[0]! < COLLAPSED_WALL_LENGTH) {
        ledger.seen("walls");
        ledger.drop("walls", id, p, "the wall is 0 long, so OpenPlan3D leaves it out with its openings");
        continue;
      }
      const halfWidth = (dims[0]! / 2) * 100;
      const height = centimetres(dims[1]!);
      const cx = t[12]! * 100;
      const cy = t[14]! * 100;
      const norm = Math.sqrt(t[0]! * t[0]! + t[2]! * t[2]!);
      const dx = t[0]! / norm;
      const dz = t[2]! / norm;
      const wall: OWall = {
        id,
        path: p,
        start: { x: cx - dx * halfWidth, y: cy - dz * halfWidth },
        end: { x: cx + dx * halfWidth, y: cy + dz * halfWidth },
        // Apple scans often report zero depth: OpenPlan3D then uses 15 cm.
        thickness: dims[2]! > 0 ? centimetres(dims[2]!) : 15,
        startHeight: height,
        endHeight: height,
      };
      floor.walls.push(wall);
      wallById.set(id, wall);
      handoffLeftover(ledger, rw, "walls[]");
    }
    for (const rd of [...of(index, "doors"), ...of(index, "openings")]) {
      chargeSteps(1);
      const kind = openingIds.has(rd.identifier) ? "openings" : "doors";
      const id = rd.identifier as string;
      const p = pathOf.get(rd)!;
      const wall = wallById.get(rd.parentIdentifier as string);
      if (!wall) {
        ledger.seen(kind);
        ledger.drop(kind, id, p, "its wall is 0 long and was left out");
        continue;
      }
      const dims = rd.dimensions as number[];
      const t = rd.transform as number[];
      const style = rd.style as string | undefined;
      const type: DoorType =
        kind === "openings"
          ? "opening"
          : style === "patio"
            ? "sliding"
            : style !== undefined
              ? (style as DoorType)
              : doorTypeOfCategory(rd.category);
      // Web 'right' puts the hinge at the wall-start jamb; iOS calls that hingeLeft. Omitted, a
      // prepared file means hingeLeft (OpenPlan3D's own default for it), a raw capture does not.
      const hingeLeft = typeof rd.hingeLeft === "boolean" ? rd.hingeLeft : prepared;
      floor.doors.push({
        kind,
        id,
        path: p,
        wallId: wall.id,
        position: projectOntoWall(wall, { x: t[12]! * 100, y: t[14]! * 100 }),
        width: centimetres(dims[0]!),
        height: centimetres(dims[1]!),
        type,
        swingDirection: hingeLeft ? "right" : "left",
        flipSide: !(typeof rd.opensInward === "boolean" ? rd.opensInward : true),
      });
      handoffLeftover(ledger, rd, `${kind}[]`, ["style", "hingeLeft", "opensInward"]);
    }
    for (const rw of of(index, "windows")) {
      chargeSteps(1);
      const id = rw.identifier as string;
      const p = pathOf.get(rw)!;
      const wall = wallById.get(rw.parentIdentifier as string);
      if (!wall) {
        ledger.seen("windows");
        ledger.drop("windows", id, p, "its wall is 0 long and was left out");
        continue;
      }
      const dims = rw.dimensions as number[];
      const t = rw.transform as number[];
      const source = sourceWalls.get(rw.parentIdentifier)!;
      const st = source.transform as number[];
      const sd = source.dimensions as number[];
      const floorY = st[13]! - sd[1]! / 2;
      const sill = typeof rw.sillHeight === "number" ? rw.sillHeight : Math.max(0, t[13]! - dims[1]! / 2 - floorY);
      const style = rw.style as string | undefined;
      floor.windows.push({
        id,
        path: p,
        wallId: wall.id,
        position: projectOntoWall(wall, { x: t[12]! * 100, y: t[14]! * 100 }),
        width: centimetres(dims[0]!),
        height: centimetres(dims[1]!),
        sillHeight: centimetres(sill),
        type: style !== undefined ? (style as WindowType) : windowTypeOfCategory(rw.category),
      });
      handoffLeftover(ledger, rw, "windows[]", ["style", "sillHeight"]);
    }
    for (const ro of of(index, "objects")) {
      chargeSteps(1);
      const id = ro.identifier as string;
      const p = pathOf.get(ro)!;
      const dims = ro.dimensions as number[];
      const t = ro.transform as number[];
      const key = categoryKey(ro.category);
      const width = centimetres(dims[0]!);
      // The heading is the object's local X axis on the ground plane, (t[0], t[2]), as
      // OpenPlan3D reads it (`atan2(t[2], t[0])`); a negative ground-plane determinant mirrors it.
      const reflected = t[0]! * t[10]! - t[2]! * t[8]! < 0;
      floor.furniture.push({
        kind: "objects",
        id,
        path: p,
        catalogId: roomPlanCatalogId(key, width),
        category: key,
        position: { x: t[12]! * 100, y: t[14]! * 100 },
        quarter: quarterOfHeading(t[0]!, t[2]!),
        width,
        depth: centimetres(dims[2]!),
        scaleX: 1,
        scaleY: reflected ? -1 : 1,
      });
      handoffLeftover(ledger, ro, "objects[]", [], "an object's height is not modelled");
    }
    for (const s of of(index, "sections")) {
      chargeSteps(1);
      const c = s.center as number[];
      floor.sections.push({
        path: pathOf.get(s)!,
        center: { x: c[0]! * 100, y: c[2]! * 100 },
        label: s.label as string,
        ...(typeof s.displayName === "string" && s.displayName !== "" ? { displayName: s.displayName } : {}),
      });
      if (s.color !== undefined) ledger.field("sections[].color", NOT_DRAWN_FINISH);
    }
    floors.push(floor);
  }
  // A sibling planner's block names the project; otherwise the file does (as OpenPlan3D names it).
  let name = fileName?.trim() ? fileName : "RoomPlan Import";
  for (const k of ["openkitchen3d", "openlandscape3d", "opencatio3d"]) {
    const block = data[k];
    if (isRecord(block) && typeof block.name === "string" && block.name.trim()) {
      name = block.name;
      break;
    }
  }
  return { model: { format: "handoff", name, floors }, diagnostics: [] };
}

/** The fields of an interchange item that are not carried, beyond the ones every item maps. */
function handoffLeftover(
  ledger: Ledger,
  item: Record<string, unknown>,
  where: string,
  read: readonly string[] = [],
  heightReason?: string,
): void {
  leftover(
    ledger,
    item,
    where,
    ["identifier", "dimensions", "transform", "story", "category", "parentIdentifier", ...read],
    HANDOFF_ITEM_REASONS,
  );
  if (heightReason) ledger.field(`${where}.dimensions[1]`, heightReason);
}

/** `storyName`. */
function storyName(index: number, names: ReadonlyMap<number, string>): string {
  const named = names.get(index);
  if (named) return named;
  if (index === 0) return "Ground Floor";
  if (index < 0) return index === -1 ? "Basement" : `Basement ${-index}`;
  return `Floor ${index}`;
}

/** `mapDoorType`. */
function doorTypeOfCategory(cat: unknown): DoorType {
  const key = categoryKey(cat);
  if (key === "doubleDoor" || key === "french") return "double";
  if (key === "slidingDoor") return "sliding";
  if (key === "foldingDoor") return "bifold";
  return "single";
}

/** `mapWindowType`. */
function windowTypeOfCategory(cat: unknown): WindowType {
  const key = categoryKey(cat);
  if (key === "slidingWindow") return "sliding";
  if (key === "bayWindow") return "bay";
  return "standard";
}

/** `projectOntoWall`: the parameter (0–1, clamped) of the point nearest `pt` on the wall. */
function projectOntoWall(wall: OWall, pt: Pt): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0.5;
  const t = ((pt.x - wall.start.x) * dx + (pt.y - wall.start.y) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * The quarter turn `atan2(dz, dx)` names, in degrees clockwise on the page, when the heading is
 * one (the off-axis component within 1e-9 of the other), else null. No trigonometry.
 */
function quarterOfHeading(dx: number, dz: number): number | null {
  const n = Math.sqrt(dx * dx + dz * dz);
  if (Math.abs(dz) <= 1e-9 * n) return dx > 0 ? 0 : 180;
  if (Math.abs(dx) <= 1e-9 * n) return dz > 0 ? 90 : 270;
  return null;
}
