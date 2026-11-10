/**
 * The Plan JSON validator `planFromJson` runs first: the shape and kind checks that stamp a JSON
 * path on every `E_JSON_*` diagnostic, capped at `MAX_DIAGNOSTICS` (moved verbatim from
 * `src/plan-json.ts`, which re-exports every name it exported).
 *
 * Invariant: user input is never thrown on; every problem is a returned diagnostic. It charges
 * nothing to the step meter (the attach-position probe only parses).
 */

import {
  ARC_DIRS,
  AUTO_DIMS_MODES,
  COMPASS_DIRECTIONS,
  FURNITURE_ANCHORS,
  HEMISPHERES,
  NORTH_DIRS,
  USE_KINDS,
} from "../ast.js";
import { isLexWord } from "../lexer.js";
import { isEdgeName } from "../attach.js";
import { EDGE_WORDS } from "../room-datums.js";
import { capDiagnostics, type Diagnostic, MAX_DIAGNOSTICS } from "../diagnostics.js";
import type { DoorEnumClause, WindowKind } from "../grammar/tokens.js";
import {
  DOOR_ENUMS,
  DOOR_KINDS,
  DOOR_SWING_BUILDING,
  enumList,
  TITLE_FIELDS,
  WALL_STATUSES,
  WINDOW_KIND_HINGED,
  WINDOW_KINDS,
} from "../grammar/tokens.js";
import { parseUnmemoised } from "../parser.js";
import { isDrawableHeight, isPlacedHeight, MAX_HEIGHT } from "../datum.js";
import { SEGMENT_SELECT_RE } from "../segment-select.js";
import { type KindsWith, kindsWith } from "../elements/facets.js";
import { PAPER_ORIENTATIONS, PAPER_SIZES } from "../sheet.js";
import { ROOM_TYPES } from "./room-types.js";
import type { PointJson, PlanJson } from "./types.js";

/**
 * Diagnostic collector that stamps JSON paths onto shape/kind problems. It keeps one past
 * {@link MAX_DIAGNOSTICS} and drops the rest, so 64 KiB of `{"rooms":[{},{},…]}` holds a bounded
 * list rather than one error per field; {@link capDiagnostics} then turns the overflow into the
 * `E_DIAGNOSTIC_LIMIT` marker (EH1.15). Every validation diagnostic is an error.
 */
export class Validator {
  readonly diags: Diagnostic[] = [];
  push(d: Diagnostic): void {
    if (this.diags.length <= MAX_DIAGNOSTICS) this.diags.push(d);
  }
  err(path: string, msg: string): void {
    this.push({ severity: "error", message: `plan JSON ${path}: ${msg}`, code: "E_JSON_SCHEMA" });
  }
  kindErr(path: string, msg: string): void {
    this.push({ severity: "error", message: `plan JSON ${path}: ${msg}`, code: "E_JSON_KIND" });
  }
  hasError(): boolean {
    return this.diags.some((d) => d.severity === "error");
  }
  /** The list a caller sees: capped (sub-cap, the same array). A JSON payload has no source text,
   *  so the marker's span is the empty one at 0. */
  capped(): Diagnostic[] {
    return capDiagnostics(this.diags, 0);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * A value the emitter prints where the grammar reads ONE word (`ctx.eatIdent()`: an id, a
 * category, a wall, room or edge reference, `material`, `facing`) must lex as exactly that word
 * ({@link isLexWord}, the lexer's own rule, never retyped). Unchecked, `""` printed
 * `furniture  at (…)`, a number printed `id=1000`, and a string with a space, a quote, a brace
 * or a `#` was written into the source as more tokens than one (EH1.15, defect 3). `id` may be
 * `""`, which the emitter writes as no `id=` at all.
 */
const WORD_SHAPE = "one word as an identifier lexes (a letter or _, then letters, digits or _; dotted parts allowed)";
function reqWord(v: unknown, path: string, what: string, val: Validator, emptyOk = false): void {
  if (v === undefined || (emptyOk && v === "")) return;
  if (!(isStr(v) && isLexWord(v))) val.err(path, `expected ${what}: ${WORD_SHAPE}`);
}

/** A position string (`on.at`, `relation.at`) as `parseAttachPos` reads it: probed through the real
 *  parser, and accepted only when the position it reads ends exactly where the string does, so
 *  no clause (`width 1 hinge left`) and no comment rides in behind it. */
const ATTACH_PROBE_HEAD = 'plan "" {\n  opening on w at ';
function isAttachPosText(s: string): boolean {
  if (s === "" || s !== s.trim() || /[\r\n]/.test(s)) return false;
  const { plan, diagnostics } = parseUnmemoised(`${ATTACH_PROBE_HEAD}${s} width 1\n}\n`);
  if (!plan || diagnostics.some((d) => d.severity === "error") || plan.body.length !== 1) return false;
  const st = plan.body[0] as {
    kind?: string;
    attach?: { span?: { end: number } };
  };
  return st.kind === "opening" && st.attach?.span?.end === ATTACH_PROBE_HEAD.length + s.length;
}
const POS_SHAPE =
  'expected a position as written after `at`: "40%", "1200", "center", "<mm> from start|end|<room>.<edge>" or "axis <label>"';

/** An optional number the emitter prints: finite when present (JSON cannot carry NaN, a caller can). */
function optNum(v: unknown, path: string, val: Validator): void {
  if (v !== undefined && !isNum(v)) val.err(path, "expected a number");
}

/**
 * A magnitude the emitter prints (a room's, column's or piece's `size`, a wall's `thickness`, an
 * opening's `width`) must not be negative (EH1.20, defect 1). A negative width printed
 * `size -1000000000000x400`, which the parser cannot read (the lexer's `WxH` literal is unsigned and
 * a unary minus takes no dimension); a negative height, thickness or opening width parsed and was
 * refused later, with a span into generated text. Refused here with its path instead. `-0` passes:
 * it prints `0` (`num`, `source-tokens.ts`), and the compiler refuses a zero size with its own
 * code. A value that is not a number is the caller's `expected a number` error, so this adds
 * nothing for it.
 */
function nonNegative(v: unknown, path: string, val: Validator): void {
  if (isNum(v) && v < 0) val.err(path, "expected a number of 0 or more: a size, width or thickness cannot be negative");
}

/** Validate a `{x,y}` point at `path`; returns it (or null on error). */
function reqPoint(v: unknown, path: string, val: Validator): PointJson | null {
  if (!isObj(v)) {
    val.err(path, "expected an object with numeric x and y");
    return null;
  }
  if (!isNum(v.x)) val.err(`${path}/x`, "expected a number");
  if (!isNum(v.y)) val.err(`${path}/y`, "expected a number");
  return isNum(v.x) && isNum(v.y) ? { x: v.x, y: v.y } : null;
}

/**
 * The `uses` values this format accepts — DERIVED from {@link USE_KINDS}, never retyped.
 *
 * It was a hand-typed twelve-name literal until v1.31, which is the defect class this
 * repository has already shipped four instances of: a fact about the language, copied into
 * something that describes the language, where `check:drift` is structurally blind to it (the
 * gate proves a generator reproduces its own output, never that the output is true). The proof
 * it was live rather than theoretical: adding a thirteenth use kind to `src/ast.ts` left this
 * validator rejecting the new word with `E_JSON_SCHEMA`, so `planToJson` emitted a document
 * its own `planFromJson` refused — a round trip that fails on a plan the compiler accepts.
 * Deriving it is one line and the drift becomes impossible; the same is now true of the
 * `uses` enum inside {@link PLAN_JSON_SCHEMA}.
 */
const USE_SET: ReadonlySet<string> = new Set<string>(USE_KINDS);
const ROOM_TYPE_SET: ReadonlySet<string> = new Set<string>(ROOM_TYPES);
const OPENING_KINDS: ReadonlySet<string> = new Set(kindsWith("opening"));
/**
 * The schema's `openings[].kind` enum: the table's `opening` kinds, typed by the same derivation
 * (the release-compat gate reads the non-exported `KindsWith` alias as its literals, so this
 * compares equal to the literal tuple an earlier release published). `test/element-facets.test.ts`
 * holds this, the `OpeningJson.kind` union and the table equal.
 */
export const OPENING_KIND_ENUM: readonly KindsWith<"opening">[] = [...kindsWith("opening")];

/**
 * Validate `json` against the plan shape (no throw). Returns the value cast to
 * {@link PlanJson} for the emitter, or null when a shape error makes it unusable.
 * Output-only enrichments (`area`, `edges`, …) are ignored.
 */
export function validatePlanJson(json: unknown, val: Validator): PlanJson | null {
  if (!isObj(json)) {
    val.err("", "expected a top-level object");
    return null;
  }
  // Guard against scripting/import keys that this form cannot represent.
  // `components` is the PS3.9 record (validated below); the rest stay `.arch`-only.
  for (const k of ["imports", "let", "for", "if", "component"]) {
    if (k in json)
      val.err(`/${k}`, "scripting and imports are not supported in the JSON form — author them in .arch source");
  }
  if ("version" in json && json.version !== 1) val.err("/version", "only version 1 is supported");
  if ("units" in json && json.units !== "mm") val.err("/units", 'only "mm" is supported');
  if (!isStr(json.plan) && json.plan !== undefined) val.err("/plan", "expected a string");
  // Every head value the emitter prints is held to its type here, so emission never sees a value
  // of the wrong type (EH1.15): a non-finite `grid` printed `grid NaN`, a `north` that was neither
  // a word nor `{ deg }` printed `north undefined`, and a non-string title field threw.
  if (json.grid !== undefined && !isNum(json.grid)) val.err("/grid", "expected a number");
  if (
    json.north !== undefined &&
    !(isStr(json.north) && (NORTH_DIRS as readonly string[]).includes(json.north)) &&
    !(isObj(json.north) && isNum(json.north.deg))
  )
    val.err("/north", `expected ${enumList(NORTH_DIRS)} or { "deg": <number> }`);
  // `north <deg>` reads one number token, which is unsigned: `north -30` was an `E_PARSE` (EH1.20).
  else if (isObj(json.north) && isNum(json.north.deg) && json.north.deg < 0)
    val.err("/north/deg", "expected a bearing of 0 or more degrees: `north` reads an unsigned number (330, not -30)");
  if (json.title !== undefined) {
    if (!isObj(json.title)) val.err("/title", "expected an object");
    else
      for (const word of TITLE_FIELDS) {
        const v = json.title[word];
        if (v !== undefined && !isStr(v)) val.err(`/title/${word}`, "expected a string");
      }
  }

  if (json.site !== undefined) validateSite(json.site, "/site", val);
  if (json.paper !== undefined) validatePaper(json.paper, "/paper", val);

  // Accept-list DERIVED from the parser's own `AUTO_DIMS_MODES`, never retyped — the same
  // law the `uses` enum learned when a thirteenth use kind made `planToJson` emit a
  // document its own `planFromJson` refused.
  if (
    json.dims_auto !== undefined &&
    !(isStr(json.dims_auto) && (AUTO_DIMS_MODES as readonly string[]).includes(json.dims_auto))
  )
    val.err("/dims_auto", `expected one of ${AUTO_DIMS_MODES.join(", ")}`);

  // The vertical datum. Range-checked HERE as well as at resolve, because a
  // payload is a surface a model writes directly and `storey_height: 3` should be refused
  // with a JSON pointer rather than turned into a plan that then refuses itself.
  if (json.storey_height !== undefined && !(isNum(json.storey_height) && isDrawableHeight(json.storey_height)))
    val.err("/storey_height", `expected a number greater than 0 and no more than ${MAX_HEIGHT}`);

  const names = validateInstances(json, val);
  validateRows(json, "", names, val);

  if (val.hasError()) return null;
  return json as unknown as PlanJson;
}

/** A component or instance name, as the lexer reads an identifier (no hyphen), so a bad one is
 *  refused here with its JSON path rather than by the parser. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * `components` and `instances` (PS3.9): each component a name and a body of root-shaped rows,
 * each instance a name, a declared component, an `at` point and the frame `place` accepts.
 * Returns the instance names a flattened row's `instance` may name (empty when there are none).
 */
function validateInstances(json: Record<string, unknown>, val: Validator): ReadonlySet<string> {
  const declared = new Set<string>();
  const names = new Set<string>();
  const { components, instances } = json;
  if ((components === undefined) !== (instances === undefined))
    val.err(components === undefined ? "/instances" : "/components", "`components` and `instances` come together");
  if (components !== undefined && !Array.isArray(components)) val.err("/components", "expected an array");
  if (Array.isArray(components))
    components.forEach((c, i) => {
      const at = `/components/${i}`;
      if (!isObj(c)) {
        val.err(at, "expected an object");
        return;
      }
      if (!(isStr(c.name) && IDENT.test(c.name))) val.err(`${at}/name`, "expected a component name");
      else if (declared.has(c.name)) val.err(`${at}/name`, `component "${c.name}" is declared twice`);
      else declared.add(c.name);
      if (!isObj(c.body)) {
        val.err(`${at}/body`, "expected an object");
        return;
      }
      // The four arrays the schema requires of a body (a root row array may be absent; a
      // body's may not, so the two agree).
      for (const k of ["rooms", "walls", "openings", "furniture"])
        if (c.body[k] === undefined) val.err(`${at}/body/${k}`, "expected an array");
      validateRows(c.body, `${at}/body`, null, val);
      if (c.body.walls_from_rooms !== undefined)
        validateWallsFromRooms(c.body.walls_from_rooms, `${at}/body/walls_from_rooms`, val);
    });
  if (instances !== undefined && !Array.isArray(instances)) val.err("/instances", "expected an array");
  if (Array.isArray(instances))
    instances.forEach((p, i) => {
      const at = `/instances/${i}`;
      if (!isObj(p)) {
        val.err(at, "expected an object");
        return;
      }
      // One level of instances: a dotted name is a nested `place`, which the record cannot hold.
      if (!(isStr(p.name) && IDENT.test(p.name))) val.err(`${at}/name`, "expected an instance name");
      else if (names.has(p.name)) val.err(`${at}/name`, `instance "${p.name}" is placed twice`);
      else names.add(p.name);
      if (!(isStr(p.component) && declared.has(p.component)))
        val.err(`${at}/component`, "expected the name of a component in `components`");
      reqPoint(p.at, `${at}/at`, val);
      if (p.rotate !== undefined && !(p.rotate === 0 || p.rotate === 90 || p.rotate === 180 || p.rotate === 270))
        val.err(`${at}/rotate`, "expected 0, 90, 180 or 270");
      if (p.mirror !== undefined && p.mirror !== "x" && p.mirror !== "y")
        val.err(`${at}/mirror`, 'expected "x" or "y"');
    });
  return names;
}

/**
 * The row arrays of the root (`base` "") or of a component body. A root row that carries
 * `instance` is a flattened instance row: output-only, so it is checked only for naming a
 * declared instance and is otherwise skipped (its `mirror` is the frame's, which the `place`
 * prints). A body row (`instances` null) never carries one.
 */
function validateRows(
  o: Record<string, unknown>,
  base: string,
  instances: ReadonlySet<string> | null,
  val: Validator,
): void {
  const rows = (
    key: "rooms" | "walls" | "openings" | "furniture" | "dims" | "columns",
    check: (r: unknown, path: string, val: Validator) => void,
  ): void => {
    const list = o[key];
    if (list === undefined) return;
    if (!Array.isArray(list)) {
      val.err(`${base}/${key}`, "expected an array");
      return;
    }
    list.forEach((r, i) => {
      const path = `${base}/${key}/${i}`;
      if (isObj(r) && r.instance !== undefined) {
        if (instances === null) val.err(`${path}/instance`, "a component body row belongs to no instance");
        else if (!(isStr(r.instance) && instances.has(r.instance)))
          val.err(`${path}/instance`, "expected the name of an instance in `instances`");
        // The marker skips the row, so it must not land on a row the instance did not make: a
        // root row labelled by mistake would vanish. Every marked row but a dimension (which
        // has no id) carries its instance's namespace. Its other fields are not read: the row
        // is regenerated from the component on the way back, and an edit to it is ignored.
        else if (key !== "dims" && !(isStr(r.id) && r.id.startsWith(`${r.instance}.`)))
          val.err(
            `${path}/instance`,
            `a row marked "instance": "${r.instance}" must have an id in that instance ("${r.instance}.<id>"); this one would be dropped`,
          );
        return;
      }
      check(r, path, val);
    });
  };
  rows("rooms", validateRoom);
  rows("walls", validateWall);
  if (base === "" && o.walls_from_rooms !== undefined)
    validateWallsFromRooms(o.walls_from_rooms, "/walls_from_rooms", val);
  rows("openings", validateOpening);
  rows("furniture", validateFurniture);
  rows("dims", validateDim);
  rows("columns", validateColumn);
}

/** `site` — a required `street` word and an optional `hemisphere`, both from the closed
 *  vocabularies the parser itself checks against (`src/ast.ts`), never a retyped list. */
function validateSite(s: unknown, path: string, val: Validator): void {
  if (!isObj(s)) {
    val.err(path, "expected an object");
    return;
  }
  for (const k of Object.keys(s)) if (k !== "street" && k !== "hemisphere") val.err(`${path}/${k}`, "unknown key");
  if (!(isStr(s.street) && (COMPASS_DIRECTIONS as readonly string[]).includes(s.street)))
    val.err(`${path}/street`, `expected one of ${COMPASS_DIRECTIONS.join(", ")}`);
  if (s.hemisphere !== undefined && !(isStr(s.hemisphere) && (HEMISPHERES as readonly string[]).includes(s.hemisphere)))
    val.err(`${path}/hemisphere`, `expected one of ${HEMISPHERES.join(", ")}`);
}

/** `paper`: a size and an orientation from the parser's own tables, and the auto-fit flag. */
function validatePaper(p: unknown, path: string, val: Validator): void {
  if (!isObj(p)) {
    val.err(path, "expected an object");
    return;
  }
  for (const k of Object.keys(p))
    if (k !== "size" && k !== "orientation" && k !== "scale_auto") val.err(`${path}/${k}`, "unknown key");
  if (!(isStr(p.size) && (PAPER_SIZES as readonly string[]).includes(p.size)))
    val.err(`${path}/size`, `expected ${enumList(PAPER_SIZES)}`);
  if (
    p.orientation !== undefined &&
    !(isStr(p.orientation) && (PAPER_ORIENTATIONS as readonly string[]).includes(p.orientation))
  )
    val.err(`${path}/orientation`, `expected ${enumList(PAPER_ORIENTATIONS)}`);
  if (p.scale_auto !== undefined && typeof p.scale_auto !== "boolean")
    val.err(`${path}/scale_auto`, "expected a boolean");
}

/** A wall point's `arc`: a positive radius and the two optional words of the `.arch` clause. */
function validateWallArc(a: unknown, path: string, first: boolean, val: Validator): void {
  if (first) val.err(path, "the first point of a wall has no edge arriving at it to curve");
  if (!isObj(a)) {
    val.err(path, "expected an object with a numeric radius");
    return;
  }
  for (const k of Object.keys(a))
    if (k !== "radius" && k !== "dir" && k !== "major") val.err(`${path}/${k}`, "unknown key");
  if (!(isNum(a.radius) && a.radius > 0)) val.err(`${path}/radius`, "expected a number greater than 0");
  if (a.dir !== undefined && !(isStr(a.dir) && (ARC_DIRS as readonly string[]).includes(a.dir)))
    val.err(`${path}/dir`, `expected ${enumList(ARC_DIRS)}`);
  if (a.major !== undefined && typeof a.major !== "boolean") val.err(`${path}/major`, "expected a boolean");
}

function validateRoom(r: unknown, path: string, val: Validator): void {
  if (!isObj(r)) {
    val.err(path, "expected an object");
    return;
  }
  // A polygon room carries its ring instead of a rectangle; a rect room still needs all
  // four numbers. Exactly one of the two forms must be usable.
  if (r.polygon !== undefined) {
    if (!Array.isArray(r.polygon)) val.err(`${path}/polygon`, "expected an array of points");
    else {
      if (r.polygon.length < 3) val.err(`${path}/polygon`, "a polygon room needs at least three vertices");
      r.polygon.forEach((pt, i) => void reqPoint(pt, `${path}/polygon/${i}`, val));
    }
  } else {
    for (const key of ["x", "y", "width", "height"]) {
      if (!isNum(r[key])) val.err(`${path}/${key}`, "expected a number");
    }
    for (const key of ["width", "height"]) nonNegative(r[key], `${path}/${key}`, val);
  }
  reqWord(r.id, `${path}/id`, "a room id", val, true);
  if (r.label !== undefined && !isStr(r.label)) val.err(`${path}/label`, "expected a string");
  if (r.room_type !== undefined && !(isStr(r.room_type) && ROOM_TYPE_SET.has(r.room_type)))
    val.err(`${path}/room_type`, `expected one of ${ROOM_TYPES.join(", ")}`);
  if (r.uses !== undefined) {
    if (!Array.isArray(r.uses)) val.err(`${path}/uses`, "expected an array");
    else
      r.uses.forEach((u, i) => {
        if (!(isStr(u) && USE_SET.has(u))) val.err(`${path}/uses/${i}`, "unknown room use");
      });
  }
}

function validateWall(w: unknown, path: string, val: Validator): void {
  if (!isObj(w)) {
    val.err(path, "expected an object");
    return;
  }
  if (!Array.isArray(w.points)) {
    val.err(`${path}/points`, "expected an array of points");
  } else {
    if (w.points.length < 2) val.err(`${path}/points`, "a wall needs at least two points");
    w.points.forEach((p, i) => {
      reqPoint(p, `${path}/points/${i}`, val);
      if (isObj(p) && p.arc !== undefined) validateWallArc(p.arc, `${path}/points/${i}/arc`, i === 0, val);
    });
  }
  if (w.thickness !== undefined && !isNum(w.thickness)) val.err(`${path}/thickness`, "expected a number");
  nonNegative(w.thickness, `${path}/thickness`, val);
  reqWord(w.id, `${path}/id`, "a wall id", val, true);
  reqWord(w.category, `${path}/category`, "a wall category", val);
  reqWord(w.material, `${path}/material`, "a material name", val);
  optNum(w.material_scale, `${path}/material_scale`, val);
  optNum(w.material_angle, `${path}/material_angle`, val);
  // A VERTICAL height, not a plan extent — see `WallJson.height`.
  if (w.height !== undefined && !(isNum(w.height) && isDrawableHeight(w.height)))
    val.err(`${path}/height`, `expected a number greater than 0 and no more than ${MAX_HEIGHT}`);
  validateWallStatus(w.status, `${path}/status`, val);
}

/** A wall's `status` (B3a), when present: one of {@link WALL_STATUSES}. */
function validateWallStatus(v: unknown, path: string, val: Validator): void {
  if (v !== undefined && !(isStr(v) && (WALL_STATUSES as readonly string[]).includes(v)))
    val.err(path, `expected ${enumList(WALL_STATUSES)}`);
}

/** `walls_from_rooms`: two positive thicknesses and an optional list of room ids (identifiers,
 *  since they are written back into source). */
function validateWallsFromRooms(w: unknown, path: string, val: Validator): void {
  if (!isObj(w)) {
    val.err(path, "expected an object");
    return;
  }
  for (const k of ["exterior", "partition"] as const) {
    if (!(isNum(w[k]) && (w[k] as number) > 0)) val.err(`${path}/${k}`, "expected a number greater than 0");
  }
  validateWallStatus(w.status, `${path}/status`, val);
  if (w.except !== undefined) {
    if (!Array.isArray(w.except)) val.err(`${path}/except`, "expected an array of room ids");
    else
      w.except.forEach((x, i) => {
        if (!(isStr(x) && isLexWord(x))) val.err(`${path}/except/${i}`, `expected a room id: ${WORD_SHAPE}`);
      });
  }
  // `isLexWord`, not the hyphen-admitting pattern this was: `a-b` lexes as `a - b`.
  const ident = (x: unknown): boolean => isStr(x) && isLexWord(x);
  const pair = (c: Record<string, unknown>, at: string): void => {
    if (!(Array.isArray(c.between) && c.between.length === 2 && c.between.every(ident)))
      val.err(`${at}/between`, "expected two room ids");
  };
  for (const key of ["open", "between"] as const) {
    const list = w[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      val.err(`${path}/${key}`, "expected an array of clauses");
      continue;
    }
    list.forEach((c, i) => {
      const at = `${path}/${key}/${i}`;
      if (!isObj(c)) {
        val.err(at, "expected an object");
        return;
      }
      pair(c, at);
      if (key === "open") {
        if (c.id !== undefined && !ident(c.id)) val.err(`${at}/id`, "expected an id");
        if (c.width !== undefined && !(isNum(c.width) && (c.width as number) > 0))
          val.err(`${at}/width`, "expected a number greater than 0");
      } else if (!(isNum(c.thickness) && (c.thickness as number) > 0))
        val.err(`${at}/thickness`, "expected a number greater than 0");
    });
  }
}

/**
 * `mirror: true` on a door or a dimension is a reflecting `place` frame's reflection, and a frame
 * is the only thing source can say it with: emitting the element would silently lose it. Refused
 * (`E_JSON_MIRROR`) rather than dropped. A piece of furniture has a `mirror` clause, so it is printed,
 * unless its dotted id says a `place` was flattened (`validateFurniture`).
 */
function refuseMirror(mirror: unknown, path: string, what: string, own: string, val: Validator): void {
  if (mirror !== undefined && typeof mirror !== "boolean") val.err(`${path}/mirror`, "expected a boolean");
  if (mirror === true)
    val.push({
      severity: "error",
      message: `plan JSON ${path}/mirror: ${what} cannot be written as source — \`.arch\` has no ${own} \`mirror\` (only a \`place … mirror x|y\` frame reflects one)`,
      code: "E_JSON_MIRROR",
    });
}

/** An opening's `relation` (ADR 0028 §5): `between` two room ids, or `edge` (`<room>.<edge>`),
 *  never both, with an optional `at` position string. True when it is well formed. */
function validateRelation(r: unknown, path: string, kind: unknown, val: Validator): boolean {
  if (!isObj(r)) {
    val.err(path, "expected an object");
    return false;
  }
  const between = r.between;
  const okBetween = Array.isArray(between) && between.length === 2 && between.every((x) => isStr(x) && isLexWord(x));
  const okEdge =
    isStr(r.edge) &&
    isLexWord(r.edge) &&
    /^[^.\s]+(\.[^.\s]+)*\.(top|bottom|left|right|north|south|east|west)$/.test(r.edge);
  let ok = true;
  if ((between !== undefined) === (r.edge !== undefined)) {
    val.err(path, "needs exactly one of `between` (two room ids) and `edge` (`<room>.<edge>`)");
    ok = false;
  } else if (between !== undefined && !okBetween) {
    val.err(`${path}/between`, "expected two room ids");
    ok = false;
  } else if (r.edge !== undefined && !okEdge) {
    val.err(`${path}/edge`, "expected `<room>.top|bottom|left|right`");
    ok = false;
  }
  if (between !== undefined && kind === "window") {
    val.err(`${path}/between`, "a window stands on one room's edge (`edge`), not `between` two rooms");
    ok = false;
  }
  if (r.at !== undefined && !(isStr(r.at) && isAttachPosText(r.at))) {
    val.err(`${path}/at`, POS_SHAPE);
    ok = false;
  }
  for (const k of Object.keys(r)) {
    if (k !== "between" && k !== "edge" && k !== "at") {
      val.err(`${path}/${k}`, "unknown key");
      ok = false;
    }
  }
  return ok;
}

function validateOpening(o: unknown, path: string, val: Validator): void {
  if (!isObj(o)) {
    val.err(path, "expected an object");
    return;
  }
  if (!(isStr(o.kind) && OPENING_KINDS.has(o.kind)))
    val.kindErr(`${path}/kind`, `expected "door", "window", or "opening"${isStr(o.kind) ? ` (got "${o.kind}")` : ""}`);
  if (!isNum(o.width)) val.err(`${path}/width`, "expected a number");
  nonNegative(o.width, `${path}/width`, val);
  reqWord(o.id, `${path}/id`, "an opening id", val, true);
  reqWord(o.wall, `${path}/wall`, "a wall id or category", val);
  // `on` is printed whenever it is present (`on <wall> at <pos>`), so a present one is checked
  // whole, not only when it is the placement that counts.
  if (o.on !== undefined) {
    if (!isObj(o.on)) val.err(`${path}/on`, "expected an object { wall, at }");
    else {
      if (o.on.wall === undefined) val.err(`${path}/on/wall`, "expected a wall id or category");
      else reqWord(o.on.wall, `${path}/on/wall`, "a wall id or category", val);
      if (!(isStr(o.on.at) && isAttachPosText(o.on.at))) val.err(`${path}/on/at`, POS_SHAPE);
    }
  }
  // `mirror` is a door's alone (only a door carries the IR's `_mirror`), as `sill` is a window's.
  if (o.mirror !== undefined && o.kind !== "door")
    val.err(`${path}/mirror`, "only a door has a `mirror` — a window and a cased opening are never reflected");
  else refuseMirror(o.mirror, path, "a door reflected by a `place` frame", "per-door", val);
  const hasXY = isNum(o.x) && isNum(o.y);
  const hasOn =
    isObj(o.on) && isStr((o.on as Record<string, unknown>).wall) && isStr((o.on as Record<string, unknown>).at);
  const hasRel = o.relation !== undefined && validateRelation(o.relation, `${path}/relation`, o.kind, val);
  if (!hasXY && !hasOn && !hasRel)
    val.err(path, "needs either numeric x and y, an `on` { wall, at } attachment, or a `relation`");
  // Both door value sets come from `DOOR_ENUMS` — the same table the parser, the
  // schema below and both `gen:*` generators read — so a JSON payload can never be
  // accepted (or refused) on a different list from the one `.arch` source is held to.
  for (const clause of Object.keys(DOOR_ENUMS) as DoorEnumClause[]) {
    const v = o[clause];
    if (v !== undefined && !(isStr(v) && (DOOR_ENUMS[clause] as readonly string[]).includes(v)))
      val.err(`${path}/${clause}`, `expected ${enumList(DOOR_ENUMS[clause])}`);
  }
  // `swing_building` is a second spelling of `swing`, held to `DOOR_SWING_BUILDING` as `swing`
  // is to `DOOR_ENUMS`, and a door's alone (it needs a leaf or a panel face to point).
  if (
    o.swing_building !== undefined &&
    !(isStr(o.swing_building) && (DOOR_SWING_BUILDING as readonly string[]).includes(o.swing_building))
  )
    val.err(`${path}/swing_building`, `expected ${enumList(DOOR_SWING_BUILDING)}`);
  if (o.swing_building !== undefined && o.kind !== "door")
    val.err(`${path}/swing_building`, "only a door swings — a window and a cased opening have no leaf");
  // The kind word — `door_kind` here, because `kind` already discriminates
  // door/window/opening. Held to `DOOR_KINDS`, the same table the parser reads.
  if (o.door_kind !== undefined && !(isStr(o.door_kind) && (DOOR_KINDS as readonly string[]).includes(o.door_kind)))
    val.err(`${path}/door_kind`, `expected ${enumList(DOOR_KINDS)}`);
  if (
    o.window_kind !== undefined &&
    !(isStr(o.window_kind) && (WINDOW_KINDS as readonly string[]).includes(o.window_kind))
  )
    val.err(`${path}/window_kind`, `expected ${enumList(WINDOW_KINDS)}`);
  if (o.window_kind !== undefined && o.kind !== "window")
    val.err(`${path}/window_kind`, "only a window has a `window_kind` — a door has a `door_kind`");
  // Refused here, or a side the payload states would fall away with no word: the emitter prints it
  // only beside a kind, and the resolver refuses it on a kind that does not hang on a jamb.
  if (o.kind === "window" && o.hinge !== undefined && !WINDOW_KIND_HINGED[o.window_kind as WindowKind])
    val.err(`${path}/hinge`, "only a `casement` or `tilt_turn` window has a `hinge`: give it that `window_kind`");
  if (o.open !== undefined && !(isNum(o.open) && o.open >= 0 && o.open <= 1))
    val.err(`${path}/open`, "expected a number in [0,1]");
  // The vertical datum. `sill` may be exactly 0 (a floor-length window); `head`
  // may not. The sill-below-head and head-within-wall rules are NOT re-implemented here —
  // they need the host wall, so they stay at resolve where `E_SILL_ABOVE_HEAD` and
  // `E_OPENING_ABOVE_WALL` already own them, and a payload that violates one is refused
  // with a span rather than a pointer.
  if (o.sill !== undefined && !(isNum(o.sill) && isPlacedHeight(o.sill)))
    val.err(`${path}/sill`, `expected a number from 0 to ${MAX_HEIGHT}`);
  if (o.sill !== undefined && o.kind !== "window")
    val.err(`${path}/sill`, "only a window has a sill — a door and a cased opening start at the floor");
  if (o.head !== undefined && !(isNum(o.head) && isDrawableHeight(o.head)))
    val.err(`${path}/head`, `expected a number greater than 0 and no more than ${MAX_HEIGHT}`);
}

function validateFurniture(f: unknown, path: string, val: Validator): void {
  if (!isObj(f)) {
    val.err(path, "expected an object");
    return;
  }
  if (f.category === undefined) val.err(`${path}/category`, "expected a fixture category");
  else reqWord(f.category, `${path}/category`, "a fixture category", val);
  reqWord(f.id, `${path}/id`, "a fixture id", val, true);
  reqWord(f.room, `${path}/room`, "a room id", val);
  reqWord(f.against_wall, `${path}/against_wall`, "a wall id or category", val);
  reqWord(f.facing, `${path}/facing`, "a facing target", val);
  // Printed with `q`, which iterates it: a number threw `TypeError: s is not iterable` (defect 1).
  if (f.label !== undefined && !isStr(f.label)) val.err(`${path}/label`, "expected a string");
  for (const k of ["width", "height", "segment", "offset", "inset"] as const) optNum(f[k], `${path}/${k}`, val);
  for (const k of ["width", "height"] as const) nonNegative(f[k], `${path}/${k}`, val);
  const hasAt = isNum(f.x) && isNum(f.y);
  const hasAgainst = isStr(f.against_wall) || isStr(f.against_edge);
  const hasInPlace = (f.centered === true || isStr(f.anchor)) && isStr(f.room);
  if (!hasAt && !hasAgainst && !hasInPlace)
    val.err(path, "needs a placement: `x`/`y`, `against_wall`, `against_edge`, or (`centered`/`anchor` with `room`)");
  // Printed as `against <edge>`, one word the parser reads only when it is not `wall`.
  if (
    f.against_edge !== undefined &&
    !(isStr(f.against_edge) && isLexWord(f.against_edge) && isEdgeName(f.against_edge))
  )
    val.err(`${path}/against_edge`, `expected a room edge \`<room>.${EDGE_WORDS.join("|")}\``);
  // Re-emitted verbatim after `segment`, so it must be a selector and nothing else.
  if (f.segment_select !== undefined && !(isStr(f.segment_select) && SEGMENT_SELECT_RE.test(f.segment_select)))
    val.err(`${path}/segment_select`, "expected `north|south|east|west` or `containing <room>.<edge>`");
  if (f.segment_select !== undefined && !isStr(f.against_wall))
    val.err(`${path}/segment_select`, "needs `against_wall`");
  for (const k of ["clear_front", "clear_sides"] as const)
    if (f[k] !== undefined && !(isNum(f[k]) && (f[k] as number) > 0))
      val.err(`${path}/${k}`, "expected a positive number");
  if (f.rotate !== undefined && !isNum(f.rotate)) val.err(`${path}/rotate`, "expected a number");
  // Printed as the piece's own `mirror` clause, the bit a reflecting `place` sets. A dotted id is a
  // piece flattened out of a `place`: source cannot declare it, and only that `place` states the
  // reflection, so it is refused here with its door's code rather than reach the parser.
  if (f.mirror !== undefined && typeof f.mirror !== "boolean") val.err(`${path}/mirror`, "expected a boolean");
  if (f.mirror === true && isStr(f.id) && f.id.includes("."))
    val.push({
      severity: "error",
      message: `plan JSON ${path}/mirror: a fixture reflected by a \`place\` frame cannot be written as source — "${f.id}" is an instance's piece, flattened, and only its \`place … mirror x|y\` states the reflection`,
      code: "E_JSON_MIRROR",
    });
  if (f.side !== undefined && f.side !== "left" && f.side !== "right")
    val.err(`${path}/side`, 'expected "left" or "right"');
  // The anchor accept-list is DERIVED from the parser's own `FURNITURE_ANCHORS`, never
  // retyped — the same law `uses` and `dims auto` follow above. It was unchecked here and
  // hand-listed in the schema below, so the two could have disagreed about the language.
  if (f.anchor !== undefined && !(isStr(f.anchor) && (FURNITURE_ANCHORS as readonly string[]).includes(f.anchor)))
    val.err(`${path}/anchor`, `expected ${enumList(FURNITURE_ANCHORS)}`);
  if (f.flush !== undefined && typeof f.flush !== "boolean") val.err(`${path}/flush`, "expected a boolean");
  // `flush` measures from the wall face behind an ANCHORED edge; with no anchor there is
  // no edge, which is the same refusal `.arch` makes (`E_FURN_FLUSH`) — said here rather
  // than emitted into source that would fail later with a span pointing at generated text.
  if (f.flush === true && !isStr(f.anchor))
    val.err(`${path}/flush`, "needs an `anchor` — it measures from an anchored edge");
}

function validateDim(d: unknown, path: string, val: Validator): void {
  if (!isObj(d)) {
    val.err(path, "expected an object");
    return;
  }
  reqPoint(d.from, `${path}/from`, val);
  reqPoint(d.to, `${path}/to`, val);
  if (d.offset !== undefined && !isNum(d.offset)) val.err(`${path}/offset`, "expected a number");
  if (d.text !== undefined && !isStr(d.text)) val.err(`${path}/text`, "expected a string");
  refuseMirror(d.mirror, path, "a dimension reflected by a `place` frame", "per-dimension", val);
}

function validateColumn(c: unknown, path: string, val: Validator): void {
  if (!isObj(c)) {
    val.err(path, "expected an object");
    return;
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!isNum(c[key])) val.err(`${path}/${key}`, "expected a number");
  }
  for (const key of ["width", "height"]) nonNegative(c[key], `${path}/${key}`, val);
  reqWord(c.id, `${path}/id`, "a column id", val, true);
}
