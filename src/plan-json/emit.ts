/**
 * Canonical `.arch` emission from validated Plan JSON, and the two entry points built on it,
 * `planJsonToArch` and `planFromJson` (validate, emit, run the real parser) (moved verbatim from
 * `src/plan-json.ts`, which re-exports every name it exported).
 *
 * Invariant: numbers print at full precision with no exponent (`plainDigits`), so a resolved
 * number round-trips. It charges nothing to the step meter; it only parses.
 */

import type { PlanNode, UseKind } from "../ast.js";
import type { Diagnostic } from "../diagnostics.js";
import { TITLE_FIELDS } from "../grammar/tokens.js";
import { parse } from "../parser.js";
import { roomUses } from "../analyze.js";
import { DEFAULT_MATERIAL } from "../hatches.js";
import { roomTypeForUses, usesForRoomType } from "./room-types.js";
import type {
  WallPointJson,
  InstanceMark,
  RoomJson,
  OpeningJson,
  FurnitureJson,
  PlanBodyJson,
  PlanJson,
} from "./types.js";
import { Validator, validatePlanJson } from "./from-json.js";
import { num, q } from "./source-tokens.js";

const idAttr = (id: string | undefined): string => (id ? `id=${id} ` : "");

/** Emit canonical `.arch` source for a validated {@link PlanJson}. */
function emitArch(p: PlanJson): string {
  const L: string[] = [];
  L.push(`plan ${q(p.plan ?? "")} {`);
  L.push(`  units mm`);
  if (typeof p.grid === "number" && p.grid > 0) L.push(`  grid ${num(p.grid)}`);
  // The sheet, and then the scale unless the sheet fitted it: writing a fitted scale back would
  // turn an auto-fitted plan into an authored one.
  if (p.paper) L.push(`  paper ${p.paper.size} ${p.paper.orientation ?? "landscape"}`);
  if (typeof p.scale === "string" && /^\d+:\d+$/.test(p.scale) && !p.paper?.scale_auto) L.push(`  scale ${p.scale}`);
  if (p.north !== undefined && !(p.north === "up")) {
    L.push(`  north ${typeof p.north === "string" ? p.north : num(p.north.deg)}`);
  }
  // The round-trip half of `site`: without this line a plan that went through Plan JSON
  // would come back with no orientation and every derived fact changed with it.
  if (p.site) {
    L.push(`  site { street ${p.site.street} hemisphere ${p.site.hemisphere ?? "north"} }`);
  }
  // The round-trip half of `dims auto`. Without this line the chains vanish and the
  // drawing extent shrinks around them — a silently smaller sheet, no diagnostic.
  if (p.dims_auto !== undefined) L.push(`  dims auto ${p.dims_auto}`);
  // The round-trip half of the vertical datum. Without this line every wall in the
  // re-emitted source silently inherits the 3000 default, and a 2400 storey comes back as
  // a 3000 one with no diagnostic — the `dims auto` failure above, one layer down.
  if (p.storey_height !== undefined) L.push(`  height ${num(p.storey_height)}`);

  emitRows(p, L);
  // PS3.9: each component as its resolved body, then each instance as its `place`, after the
  // root rows, so the round-trip law holds for a plan whose `place`s follow its root statements.
  if (p.components && p.instances) {
    for (const c of p.components) {
      L.push(`  component ${c.name}() {`);
      const body: string[] = [];
      emitRows(c.body, body);
      for (const line of body) L.push(`  ${line}`);
      L.push(`  }`);
    }
    for (const i of p.instances) {
      const frame = `${i.rotate ? ` rotate ${i.rotate}` : ""}${i.mirror ? ` mirror ${i.mirror}` : ""}`;
      L.push(`  place ${i.component}() as ${i.name} at (${num(i.at.x)},${num(i.at.y)})${frame}`);
    }
  }

  if (p.title) {
    L.push(`  title {`);
    for (const word of TITLE_FIELDS) {
      const v = p.title[word];
      if (v !== undefined) L.push(`    ${word} ${q(v)}`);
    }
    L.push(`  }`);
  }

  L.push(`}`);
  L.push("");
  return L.join("\n");
}

/** A row the source states itself: not a flattened instance row, which its `place` re-creates. */
const own = (r: InstanceMark): boolean => r.instance === undefined;

/** The root's (or a component body's) rows as `.arch` statements, one line each. */
function emitRows(p: PlanBodyJson, L: string[]): void {
  for (const w of (p.walls ?? []).filter(own)) {
    const parts = [
      `  wall`,
      `${idAttr(w.id)}${w.category ?? "partition"}`.trim(),
      `thickness ${num(w.thickness ?? 100)}`,
    ];
    if (w.material && w.material !== DEFAULT_MATERIAL) {
      parts.push(`material ${w.material}`);
      if (typeof w.material_scale === "number") parts.push(`scale ${num(w.material_scale)}`);
      if (typeof w.material_angle === "number") parts.push(`angle ${num(w.material_angle)}`);
    }
    // Last before the body, the grammar's own order.
    if (typeof w.height === "number") parts.push(`height ${num(w.height)}`);
    // Then `status` (B3a), the grammar's own order.
    if (typeof w.status === "string") parts.push(`status ${w.status}`);
    const pts = (w.points ?? []).map(wallPoint).join(" ");
    parts.push(`{ ${pts}${w.closed ? " close" : ""} }`);
    L.push(parts.join(" "));
  }
  // The round-trip half of `walls_from_rooms`: the statement, never the walls it derives.
  if (p.walls_from_rooms) {
    const s = p.walls_from_rooms;
    const body = [
      ...(s.except && s.except.length > 0 ? [`except ${s.except.join(" ")}`] : []),
      ...(s.open ?? []).map(
        (c) =>
          `open ${c.id !== undefined ? `id=${c.id} ` : ""}between ${c.between[0]} and ${c.between[1]}${
            c.width !== undefined ? ` width ${num(c.width)}` : ""
          }`,
      ),
      ...(s.between ?? []).map((c) => `between ${c.between[0]} and ${c.between[1]} thickness ${num(c.thickness)}`),
    ];
    const ex = body.length > 0 ? ` { ${body.join(" ")} }` : "";
    const status = typeof s.status === "string" ? ` status ${s.status}` : "";
    L.push(`  walls from rooms exterior ${num(s.exterior)} partition ${num(s.partition)}${status}${ex}`);
  }

  for (const r of (p.rooms ?? []).filter(own)) {
    // A polygon room round-trips through its RING, never its bounding box — emitting
    // `at`+`size` for it would quietly turn an L-shaped gallery back into a rectangle.
    const shape =
      r.polygon && r.polygon.length >= 3
        ? `polygon ${r.polygon.map((pt) => `(${num(pt.x)},${num(pt.y)})`).join(" ")}`
        : `at (${num(r.x)},${num(r.y)}) size ${num(r.width)}x${num(r.height)}`;
    let line = `  room ${idAttr(r.id)}${shape}`;
    if (r.label !== undefined) line += ` label ${q(r.label)}`;
    const uses = usesForRoom(r);
    if (uses.length > 0) line += ` uses ${uses.join(" ")}`;
    L.push(line);
  }

  for (const o of (p.openings ?? []).filter(own)) L.push(emitOpening(o));

  for (const f of (p.furniture ?? []).filter(own)) L.push(emitFurniture(f));

  for (const c of (p.columns ?? []).filter(own))
    L.push(`  column ${idAttr(c.id)}at (${num(c.x)},${num(c.y)}) size ${num(c.width)}x${num(c.height)}`);

  for (const d of (p.dims ?? []).filter(own)) {
    let line = `  dim (${num(d.from.x)},${num(d.from.y)})->(${num(d.to.x)},${num(d.to.y)})`;
    if (typeof d.offset === "number") line += ` offset ${num(d.offset)}`;
    if (d.text !== undefined) line += ` text ${q(d.text)}`;
    L.push(line);
  }
}

/** A wall vertex as source: a point, or the `arc` clause of the edge arriving at it. */
function wallPoint(pt: WallPointJson): string {
  const at = `(${num(pt.x)},${num(pt.y)})`;
  if (!pt.arc) return at;
  return `arc ${at} radius ${num(pt.arc.radius)}${pt.arc.dir ? ` ${pt.arc.dir}` : ""}${pt.arc.major ? " major" : ""}`;
}

/**
 * The `uses` tags to emit for a room: explicit `uses` win; else none when the label
 * already reads as the `room_type`; else derive from `room_type`.
 *
 * {@link planToJson} writes `uses` only when the source authored it, so a room whose use
 * came from its label ("Hall" → `hall`) arrives with a `room_type` alone. Several uses share
 * one `room_type` (hall/circulation/entry → `Entrance`, wc/bath → `Bathroom`), so turning it
 * into its primary use would rewrite `label "Hall"` as `uses entry`: another room for
 * `describe()` and every rule that reads uses. When the label (or, as {@link roomUses} reads,
 * the id) already maps to this `room_type`, the regenerated source writes no `uses` and the
 * label says it again, exactly as the source did. A label that reads as nothing, or as a
 * different `room_type`, still takes `room_type`'s use: `room_type` is the authority there.
 */
function usesForRoom(r: RoomJson): UseKind[] {
  if (r.uses && r.uses.length > 0) return r.uses;
  if (!r.room_type) return [];
  const fromLabel = roomUses({ id: r.id ?? "", ...(r.label !== undefined ? { label: r.label } : {}) });
  if (fromLabel.size > 0 && roomTypeForUses(fromLabel) === r.room_type) return [];
  return usesForRoomType(r.room_type);
}

function emitOpening(o: OpeningJson): string {
  const kw = o.kind;
  let line = `  ${kw} ${idAttr(o.id)}`;
  // The KIND word leads, after any `id=` — `door pocket on w1 at 40% width 900`.
  if (o.kind === "door" && o.door_kind) line += `${o.door_kind} `;
  if (o.kind === "window" && o.window_kind) line += `${o.window_kind} `;
  const rel = o.relation;
  if (rel) {
    line += rel.between ? `between ${rel.between[0]} and ${rel.between[1]}` : `on ${rel.edge}`;
    if (rel.at !== undefined) line += ` at ${rel.at}`;
  } else if (o.on) line += `on ${o.on.wall} at ${o.on.at}`;
  else line += `at (${num(o.x ?? 0)},${num(o.y ?? 0)})`;
  line += ` width ${num(o.width)}`;
  if (!o.on && !rel && o.wall) line += ` wall ${o.wall}`;
  if (o.kind === "door") {
    if (o.hinge) line += ` hinge ${o.hinge}`;
    if (o.swing_building) line += ` swing ${o.swing_building}`;
    else if (o.swing) line += ` swing ${o.swing}`;
    if (o.slide) line += ` slide ${o.slide}`;
    if (o.open !== undefined) line += ` open ${num(o.open)}`;
  }
  // The validator above holds a window's `hinge` to a kind that takes it.
  if (o.kind === "window" && o.hinge) line += ` hinge ${o.hinge}`;
  // The vertical clauses trail every other one, in `sill` then `head` order — the
  // grammar's, so the emitted line re-parses. `sill` is a window's alone; the validator
  // above refuses it anywhere else, so this needs no second check.
  if (o.kind === "window" && o.sill !== undefined) line += ` sill ${num(o.sill)}`;
  if (o.head !== undefined) line += ` head ${num(o.head)}`;
  return line;
}

function emitFurniture(f: FurnitureJson): string {
  let line = `  furniture ${idAttr(f.id)}${f.category}`;
  let placedIn = false;
  // `against wall`'s `size` is WALL-relative (along × depth) while `width`/`height`
  // carry the plan-axis footprint, so a piece the resolver turned a quarter has them
  // swapped; `rotate` is that quarter-turn, and un-turning by it recovers the pair the
  // author wrote. A payload with no `rotate` — every hand-written one — is unswapped,
  // so this reads exactly as it always did.
  let sizeW = f.width;
  let sizeH = f.height;
  if ((f.against_wall || f.against_edge) && (f.rotate === 90 || f.rotate === 270)) {
    sizeW = f.height;
    sizeH = f.width;
  }
  if (f.against_edge) {
    // The edge names the room, so no trailing `in` (ADR 0029 §2).
    line += ` against ${f.against_edge}`;
    if (typeof f.offset === "number") line += ` offset ${num(f.offset)}`;
    placedIn = true;
  } else if (f.against_wall) {
    line += ` against wall ${f.against_wall}`;
    if (typeof f.segment_select === "string") line += ` segment ${f.segment_select}`;
    else if (typeof f.segment === "number") line += ` segment ${num(f.segment)}`;
    if (typeof f.offset === "number") line += ` offset ${num(f.offset)}`;
    if (f.side) line += ` side ${f.side}`;
  } else if (f.centered && f.room) {
    line += ` in ${f.room} centered`;
    placedIn = true;
  } else if (f.anchor && f.room) {
    // `flush` before `inset` — it re-bases it (room centerline → wall face), and the
    // parser refuses the other order outright.
    line += ` in ${f.room} anchor ${f.anchor}`;
    if (f.flush) line += " flush";
    if (typeof f.inset === "number") line += ` inset ${num(f.inset)}`;
    placedIn = true;
  } else {
    line += ` at (${num(f.x ?? 0)},${num(f.y ?? 0)})`;
  }
  if (typeof sizeW === "number" && typeof sizeH === "number") line += ` size ${num(sizeW)}x${num(sizeH)}`;
  if (f.label !== undefined) line += ` label ${q(f.label)}`;
  if (typeof f.facing === "string") line += ` facing ${f.facing}`;
  else if (typeof f.rotate === "number" && !f.against_wall && !f.against_edge) line += ` rotate ${num(f.rotate)}`;
  if (f.mirror === true) line += " mirror";
  if (typeof f.clear_front === "number") line += ` clear front ${num(f.clear_front)}`;
  if (typeof f.clear_sides === "number") line += ` clear sides ${num(f.clear_sides)}`;
  // The trailing `in <room>` is what an `against wall` piece with no explicit `side`
  // infers its wall FACE from, so it has to survive — it used to be suppressed here,
  // which was invisible only because nothing ever emitted `against_wall` alongside it.
  if (!placedIn && f.room) line += ` in ${f.room}`;
  return line;
}

/**
 * Validate `json` and emit the canonical `.arch` source it represents (no throw).
 * On a shape/kind error, `source` is absent and `diagnostics` names the JSON path.
 * Exposed so tools can offer a JSON → `.arch` conversion.
 */
export function planJsonToArch(json: unknown): { source?: string; diagnostics: Diagnostic[] } {
  const val = new Validator();
  const model = validatePlanJson(json, val);
  if (!model || val.hasError()) return { diagnostics: val.capped() };
  return { source: emitArch(model), diagnostics: val.diags };
}

/**
 * Build a {@link PlanNode} from a JSON plan (the RPLAN/DStruct2Design shape). Never
 * throws: shape problems are returned as catalogued `E_JSON_SCHEMA` / `E_JSON_KIND`
 * diagnostics whose message names the offending JSON path. Internally it emits
 * canonical `.arch` text and runs the real parser (reusing every parse-time check),
 * and also returns that `source` for callers that want to compile it.
 *
 * Not supported (documented): scripting (`let`/`for`/`if`/`component`) and `import`, but for a
 * placed component that derives its walls (`components`/`instances`); and a
 * `mirror: true` door, dimension or dotted-id piece, which only a `place` frame can state (`E_JSON_MIRROR`).
 */
export function planFromJson(json: unknown): { ast?: PlanNode; source?: string; diagnostics: Diagnostic[] } {
  const { source, diagnostics } = planJsonToArch(json);
  if (source === undefined) return { diagnostics };
  const { plan, diagnostics: parseDiags } = parse(source);
  return { ast: plan, source, diagnostics: [...diagnostics, ...parseDiags] };
}
