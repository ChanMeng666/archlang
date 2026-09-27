/**
 * Text printers for the LEAF (non-block) statement kinds — the element statements
 * and the `set …` settings line. This is the one place `format.ts`'s pretty-printer,
 * an element's own `resolve()` (a lint fix's replacement text) and Plan JSON's
 * decompiler are meant to converge on, so a rewritten door/window/dim/… statement
 * can never drift from what `arch fmt` would have printed for it.
 *
 * Dependency-light ON PURPOSE: no `./parser.js`, and nothing that imports it either
 * (not `./format.js`). An element module (`src/elements/*.ts`) sits downstream of
 * the parser through the registry (`parser → registry → defs → <element> →
 * fix-producers`), so importing the parser here — even transitively through
 * `format.ts` — would close that into a cycle the moment a fix producer imports
 * this module.
 */

import type {
  ExprPoint,
  FurnitureNode,
  FurniturePlace,
  OpeningAttach,
  RoomRel,
  Statement,
  StripRoomChild,
} from "./ast.js";
import type { Expr } from "./expr.js";
import { concat, type Doc, group, hardline, indent, join, line } from "./doc.js";
/** Deterministic number → string (trim to 3 dp, non-finite → "0"). */
import { fmt3 as numStr } from "./num-format.js";
// Expression re-emission lives in one place (shared with the fix producers) so
// the formatter and `arch fix` render an expression byte-identically.
import { exprToSource as exprStr } from "./expr-source.js";

/**
 * Every {@link Statement} kind {@link statementText} prints — everything except
 * the five BLOCK kinds (`for`/`if`/`while`/`level`/`zone`, whose body weaves
 * nested comments through `format.ts`'s own `blockDoc`) and `error` (re-emitted
 * verbatim from the source span it failed to parse, which this module never sees).
 */
export type LeafStatement = Exclude<Statement, { kind: "for" | "while" | "if" | "level" | "zone" | "error" }>;

// ---- shared leaf helpers (single-line; precedence-correct parenthesisation) ----

/** Also used by `format.ts`'s `site { … boundary … }` — one canonical point printer. */
export const ptStr = (p: ExprPoint): string => `(${exprStr(p.x)}, ${exprStr(p.y)})`;

function sizeStr(size: { w: Expr; h: Expr }): string {
  // A `WxH` literal when both are plain numbers; `<expr> x <expr>` otherwise.
  if (size.w.t === "num" && size.h.t === "num") return `${numStr(size.w.value)}x${numStr(size.h.value)}`;
  return `${exprStr(size.w)} x ${exprStr(size.h)}`;
}

/** A fixture's wall-anchored clause: `against wall <id> [segment n] [offset d] [side l|r]`. */
function againstStr(ag: NonNullable<FurnitureNode["against"]>): string {
  let out = `against wall ${ag.wall}`;
  if (ag.segment !== undefined) out += ` segment ${exprStr(ag.segment)}`;
  if (ag.offset !== undefined) out += ` offset ${exprStr(ag.offset)}`;
  if (ag.side) out += ` side ${ag.side}`;
  return out;
}

/** An attached opening's position: `40%` | `1200` (mm) | `bay * i + 600` | `center`.
 *  The value is an expression, so it round-trips through `exprToSource` like every
 *  other numeric slot — a literal renders exactly the digits it always did. */
function attachPosStr(pos: OpeningAttach["pos"]): string {
  if (pos.kind === "center") return "center";
  const v = pos.value ? exprStr(pos.value) : numStr(0);
  return pos.kind === "percent" ? `${v}%` : v;
}

/** An opening's leading position: `on <wall> at <pos>` (attached) or `at (x,y)`. */
function openingLead(s: { at?: ExprPoint; attach?: OpeningAttach }): string {
  return s.attach ? `on ${s.attach.wall} at ${attachPosStr(s.attach.pos)}` : `at ${ptStr(s.at!)}`;
}

/** A fixture's room-relative placement clause: `in <room> centered|anchor …`.
 *  `flush` prints before `inset` — the one order the grammar accepts, since it
 *  re-bases what `inset` is measured from. */
function placeStr(place: FurniturePlace, room: string): string {
  const flush = place.flush ? " flush" : "";
  if (place.mode === "centered") return `in ${room} centered${flush}`;
  const inset = place.inset !== undefined ? ` inset ${exprStr(place.inset)}` : "";
  return `in ${room} anchor ${place.anchor}${flush}${inset}`;
}

/** One strip room child: `room [id=] size <main>[x<cross>] [label …] [uses …]`. */
function stripRoomStr(r: StripRoomChild): string {
  const id = r.id ? `id=${r.id} ` : "";
  let size: string;
  if (r.cross !== undefined) {
    size =
      r.main.t === "num" && r.cross.t === "num"
        ? `${numStr(r.main.value)}x${numStr(r.cross.value)}`
        : `${exprStr(r.main)} x ${exprStr(r.cross)}`;
  } else {
    size = exprStr(r.main);
  }
  const label = r.label ? ` label ${exprStr(r.label)}` : "";
  const uses = r.uses?.length ? ` uses ${r.uses.join(" ")}` : "";
  return `room ${id}size ${size}${label}${uses}`;
}

/** A room's relational placement clause: `DIR ref [align E] [gap n]`.
 *  An out-of-set alignment word (`alignBad`, the `E_ROOM_ALIGN` case) is re-emitted
 *  VERBATIM: `arch fmt` reformats source, it does not silently delete the token whose
 *  wrongness is the whole subject of the diagnostic the author still has to read. */
function relStr(rel: RoomRel): string {
  let out = `${rel.dir} ${rel.ref}`;
  if (rel.align) out += ` align ${rel.align}`;
  else if (rel.alignBad) out += ` align ${rel.alignBad.word}`;
  if (rel.gap !== undefined) out += ` gap ${exprStr(rel.gap)}`;
  return out;
}

/** A `set` override value: a bare keyword when it is a single-identifier string. */
function setValStr(e: Expr): string {
  if (e.t === "str" && e.parts.length === 1 && typeof e.parts[0] === "string" && /^[A-Za-z_]\w*$/.test(e.parts[0])) {
    return e.parts[0];
  }
  return exprStr(e);
}

/**
 * The trailing vertical clauses of an opening statement, in the grammar's own
 * order: `sill` then `head`, both after every other clause.
 *
 * They MUST be printed. `fmt` returning a window with its sill dropped would be the one
 * operation a user may assume is safe silently changing what the source says.
 */
function heightsStr(s: { sill?: Expr; head?: Expr }): string {
  return `${s.sill !== undefined ? ` sill ${exprStr(s.sill)}` : ""}${s.head !== undefined ? ` head ${exprStr(s.head)}` : ""}`;
}

/**
 * Print one non-block statement, canonically. `format.ts` embeds the result directly
 * into its wider Doc tree (so a `wall`'s point list still wraps at the pretty-printer's
 * column width); a caller that needs a stand-alone replacement string — a lint fix, a
 * decompiler — gets one for free, because every OTHER leaf kind's Doc here is already
 * flat (no `group`/`line`): only `wall` and `strip` ever contain a break point.
 */
export function statementText(s: LeafStatement): Doc {
  const id = "id" in s && s.id ? `id=${s.id} ` : "";
  switch (s.kind) {
    case "wall": {
      let head = `wall ${s.id ? `id=${s.id} ` : ""}${s.category} thickness ${exprStr(s.thickness)}`;
      if (s.material !== undefined) {
        head += ` material ${s.material}`;
        if (s.materialScale !== undefined) head += ` scale ${exprStr(s.materialScale)}`;
        if (s.materialAngle !== undefined) head += ` angle ${exprStr(s.materialAngle)}`;
      }
      // The vertical datum, last before the body — the grammar's own order, so
      // `fmt` stays a fixed point. Dropping it would silently return a 2200 parapet as a
      // full-height wall.
      if (s.height !== undefined) head += ` height ${exprStr(s.height)}`;
      // A curved edge re-emits as `arc (x,y) radius R [cw|ccw] [major]` — the canonical
      // clause order, so formatting is idempotent (a `fmt` of a `fmt` is a fixed point).
      const pts: Doc[] = s.points.map((p, i) => {
        const arc = i > 0 ? s.arcs?.[i - 1] : undefined;
        if (!arc) return ptStr(p);
        return `arc ${ptStr(p)} radius ${exprStr(arc.radius)}${arc.dir ? ` ${arc.dir}` : ""}${arc.major ? " major" : ""}`;
      });
      if (s.closed) pts.push("close");
      // Flat: `{ (0,0) (1,1) close }`; broken: one point per indented line.
      const body = group(concat(["{", indent(concat([line, join(line, pts)])), line, "}"]));
      return concat([head, " ", body]);
    }
    case "room": {
      const shape = s.polygon
        ? `polygon ${s.polygon.map(ptStr).join(" ")}`
        : s.circle
          ? `circle at ${ptStr(s.circle.c)} radius ${exprStr(s.circle.r)}`
          : `${s.at ? `at ${ptStr(s.at)}` : relStr(s.rel!)} size ${sizeStr(s.size!)}`;
      const label = s.label ? ` label ${exprStr(s.label)}${s.labelAt ? ` at ${ptStr(s.labelAt)}` : ""}` : "";
      return `room ${id}${shape}${label}${s.uses?.length ? ` uses ${s.uses.join(" ")}` : ""}`;
    }
    case "door": {
      // The KIND word leads the placement (`door id=d pocket on w1 …`) and the
      // sliding-family clauses trail the swing, in the grammar's own order. All three
      // must be printed: dropping one is not a formatting change but a semantic one —
      // an unprinted `pocket` re-formats into a hinged door with a swing arc.
      const doorKind = s.doorKind ? `${s.doorKind} ` : "";
      const hinge = s.hinge ? ` hinge ${s.hinge}` : s.hingeNear ? ` hinge near ${s.hingeNear}` : "";
      const swing = s.swing ? ` swing ${s.swing}` : s.swingInto ? ` swing into ${s.swingInto}` : "";
      const slide = s.slide ? ` slide ${s.slide}` : "";
      const open = s.open !== undefined ? ` open ${exprStr(s.open)}` : "";
      return `door ${id}${doorKind}${openingLead(s)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}${hinge}${swing}${slide}${open}${heightsStr(s)}`;
    }
    case "window":
      return `window ${id}${openingLead(s)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}${heightsStr(s)}`;
    case "opening":
      return `opening ${id}${openingLead(s)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}${heightsStr(s)}`;
    case "furniture": {
      const pos = s.against ? againstStr(s.against) : s.place ? placeStr(s.place, s.room!) : `at ${ptStr(s.at!)}`;
      const roomTail = s.place ? "" : s.room ? ` in ${s.room}` : "";
      return `furniture ${id}${s.category} ${pos}${s.size ? ` size ${sizeStr(s.size)}` : ""}${s.label ? ` label ${exprStr(s.label)}` : ""}${s.rotate ? ` rotate ${exprStr(s.rotate)}` : ""}${roomTail}`;
    }
    case "strip": {
      const horiz = s.dir === "right" || s.dir === "left";
      let head = `strip ${s.dir} at ${ptStr(s.at)} gap ${exprStr(s.gap)}`;
      if (s.cross !== undefined) head += ` ${horiz ? "height" : "width"} ${exprStr(s.cross)}`;
      if (s.rooms.length === 0) return concat([head, " { }"]);
      const roomLines: Doc[] = s.rooms.map(stripRoomStr);
      return concat([head, " {", indent(concat([hardline, join(hardline, roomLines)])), hardline, "}"]);
    }
    case "dim": {
      const text = s.text ? ` text ${exprStr(s.text)}` : "";
      // A curve call-out has no written points to re-emit — only its reference.
      if (s.curve) {
        const seg = s.curve.segment !== undefined ? ` segment ${exprStr(s.curve.segment)}` : "";
        return `dim ${s.curve.what} ${s.curve.ref}${seg} offset ${exprStr(s.offset)}${text}`;
      }
      return `dim ${s.ref ? `${s.ref} ` : ""}${ptStr(s.from)}->${ptStr(s.to)} offset ${exprStr(s.offset)}${text}`;
    }
    case "column":
      return `column ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)}`;
    case "stair":
      return `stair ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)} dir ${s.dir}${s.width !== undefined ? ` width ${exprStr(s.width)}` : ""}`;
    case "elevator":
      return `elevator ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)}`;
    case "escalator":
      return `escalator ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)} dir ${s.dir}`;
    case "roof":
      // Both spellings must round-trip. Printing the `overhang` form's derived ring
      // instead would freeze a plan's outline against later edits to the wall it follows,
      // and dropping the `wall` clause would silently re-point the roof at whichever ring
      // the inference picks.
      return s.polygon
        ? `roof polygon ${s.polygon.map(ptStr).join(" ")}`
        : `roof overhang ${exprStr(s.overhang!)}${s.wall ? ` wall ${s.wall}` : ""}`;
    case "void":
      return `void ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)}`;
    case "outdoor": {
      // Every clause the author wrote must come back, in the grammar's own order. The
      // `rail` clause in particular: dropping it would turn an authored `rail none` into
      // a DERIVED railing on three edges — `fmt` silently returning a different drawing.
      const shape = s.polygon
        ? `polygon ${s.polygon.map(ptStr).join(" ")}`
        : `at ${ptStr(s.at!)} size ${sizeStr(s.size!)}`;
      const label = s.label ? ` label ${exprStr(s.label)}` : "";
      const rail = s.rail?.length ? ` rail ${s.rail.join(" ")}` : "";
      return `outdoor ${id}${s.surface} ${shape}${label}${rail}`;
    }
    case "fence": {
      // The style word leads, and it is printed ALWAYS — including the default. `picket`
      // and an omitted word are semantically identical, so printing it is lossless, and
      // printing it unconditionally keeps `fmt` a fixed point with one less branch.
      const pts = s.points.map(ptStr).join(" ");
      return `fence ${id}${s.style} { ${pts}${s.closed ? " close" : ""} }`;
    }
    case "let":
      return s.value.t === "fnlit"
        ? `let ${s.name}(${s.value.params.join(", ")}) = ${exprStr(s.value.body)}`
        : `let ${s.name} = ${exprStr(s.value)}`;
    case "assign":
      return `${s.name} = ${exprStr(s.value)}`;
    case "instance":
      return `${s.name}(${s.args.map(exprStr).join(", ")})`;
    case "place":
      // `place C(a) as name at (x,y) [rotate n] [mirror x|y]` — the clause order is the
      // grammar's, so a formatted `place` re-parses to the same frame.
      return `place ${s.name}(${s.args.map(exprStr).join(", ")}) as ${s.alias} at ${ptStr(s.at)}${
        s.rotate ? ` rotate ${s.rotate}` : ""
      }${s.mirror ? ` mirror ${s.mirror}` : ""}`;
    case "set":
      return `set ${s.target}(${s.over.map((o) => `${o.key}: ${setValStr(o.value)}`).join(", ")})`;
  }
}
