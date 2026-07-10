/**
 * `arch fmt` — a deterministic, comment-preserving source formatter.
 *
 * `format(source)` parses to the AST (which now carries comment trivia and a
 * `bodyStart` offset, see T5.1), lowers each statement / expression to the Doc
 * IR ({@link import("./doc.js")}), weaves the captured comments back in by source
 * position, and prints at an 80-column target. It is pure text→text and never
 * throws: on a parse error it returns the source unchanged, so it can never
 * corrupt broken input. Re-running it is a fixpoint (`format(format(x)) ===
 * format(x)`).
 */

import type {
  ComponentDef,
  ExprPoint,
  FurnitureNode,
  FurniturePlace,
  ImportNode,
  OpeningAttach,
  PlanNode,
  RoomRel,
  Statement,
  StripRoomChild,
  TitleNode,
} from "./ast.js";
import type { Comment } from "./lexer.js";
import type { Expr } from "./expr.js";
import { parse } from "./parser.js";
import { isNumericThemeKey } from "./theme.js";
import { concat, type Doc, group, hardline, indent, join, line, printDoc } from "./doc.js";

const PRINT_WIDTH = 80;

/** Format ArchLang source. Returns the source unchanged if it does not parse. */
export function format(source: string): string {
  const { plan, diagnostics } = parse(source);
  // Never reformat broken input — a parse error could mean we'd drop or mangle
  // something. Return it verbatim (idempotent: a clean file re-formats to itself).
  if (!plan || diagnostics.some((d) => d.severity === "error")) return source;
  return formatPlan(plan, source);
}

// ---- expressions → text (single-line; precedence-correct parenthesisation) ----

/** Deterministic number → string (trim to 3 dp, non-finite → "0"). */
import { fmt3 as numStr } from "./num-format.js";
// Expression re-emission lives in one place (shared with the fix producers) so
// the formatter and `arch fix` render an expression byte-identically.
import { exprToSource as exprStr } from "./expr-source.js";

const ptStr = (p: ExprPoint): string => `(${exprStr(p.x)}, ${exprStr(p.y)})`;

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

/** An attached opening's position: `40%` | `1200` (mm) | `center`. */
function attachPosStr(pos: OpeningAttach["pos"]): string {
  if (pos.kind === "center") return "center";
  if (pos.kind === "percent") return `${numStr(pos.value ?? 0)}%`;
  return numStr(pos.value ?? 0);
}

/** An opening's leading position: `on <wall> at <pos>` (attached) or `at (x,y)`. */
function openingLead(s: { at?: ExprPoint; attach?: OpeningAttach }): string {
  return s.attach ? `on ${s.attach.wall} at ${attachPosStr(s.attach.pos)}` : `at ${ptStr(s.at!)}`;
}

/** A fixture's room-relative placement clause: `in <room> centered|anchor …`. */
function placeStr(place: FurniturePlace, room: string): string {
  if (place.mode === "centered") return `in ${room} centered`;
  return `in ${room} anchor ${place.anchor}${place.inset !== undefined ? ` inset ${exprStr(place.inset)}` : ""}`;
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

/** A room's relational placement clause: `DIR ref [align E] [gap n]`. */
function relStr(rel: RoomRel): string {
  let out = `${rel.dir} ${rel.ref}`;
  if (rel.align) out += ` align ${rel.align}`;
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

// ---- statements → Doc ----

const BLOCK_KINDS = new Set(["for", "if", "while"]);

/** Build the `{ … }` Doc for a block body, weaving in its inner comments. */
function blockDoc(stmts: Statement[], span: { start: number; end: number }, comments: Comment[], source: string): Doc {
  const inner = comments.filter((c) => c.span.start > span.start && c.span.start < span.end);
  const slots = stmts.map((s) => ({
    start: s.span!.start,
    end: s.span!.end,
    block: BLOCK_KINDS.has(s.kind),
    doc: statementDoc(s, comments, source),
  }));
  const lines = weaveSlots(slots, inner, source);
  if (lines.length === 0) return "{ }";
  return concat(["{", indent(concat([hardline, join(hardline, lines)])), hardline, "}"]);
}

function statementDoc(s: Statement, comments: Comment[], source: string): Doc {
  const id = "id" in s && s.id ? `id=${s.id} ` : "";
  switch (s.kind) {
    case "wall": {
      let head = `wall ${s.id ? `id=${s.id} ` : ""}${s.category} thickness ${exprStr(s.thickness)}`;
      if (s.material !== undefined) {
        head += ` material ${s.material}`;
        if (s.materialScale !== undefined) head += ` scale ${exprStr(s.materialScale)}`;
        if (s.materialAngle !== undefined) head += ` angle ${exprStr(s.materialAngle)}`;
      }
      const pts: Doc[] = s.points.map(ptStr);
      if (s.closed) pts.push("close");
      // Flat: `{ (0,0) (1,1) close }`; broken: one point per indented line.
      const body = group(concat(["{", indent(concat([line, join(line, pts)])), line, "}"]));
      return concat([head, " ", body]);
    }
    case "room":
      return `room ${id}${s.at ? `at ${ptStr(s.at)}` : relStr(s.rel!)} size ${sizeStr(s.size)}${s.label ? ` label ${exprStr(s.label)}` : ""}${s.uses?.length ? ` uses ${s.uses.join(" ")}` : ""}`;
    case "door": {
      const hinge = s.hinge ? ` hinge ${s.hinge}` : s.hingeNear ? ` hinge near ${s.hingeNear}` : "";
      const swing = s.swing ? ` swing ${s.swing}` : s.swingInto ? ` swing into ${s.swingInto}` : "";
      return `door ${id}${openingLead(s)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}${hinge}${swing}`;
    }
    case "window":
      return `window ${id}${openingLead(s)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}`;
    case "opening":
      return `opening ${id}${openingLead(s)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}`;
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
    case "dim":
      return `dim ${ptStr(s.from)}->${ptStr(s.to)} offset ${exprStr(s.offset)}${s.text ? ` text ${exprStr(s.text)}` : ""}`;
    case "column":
      return `column ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)}`;
    case "let":
      return s.value.t === "fnlit"
        ? `let ${s.name}(${s.value.params.join(", ")}) = ${exprStr(s.value.body)}`
        : `let ${s.name} = ${exprStr(s.value)}`;
    case "assign":
      return `${s.name} = ${exprStr(s.value)}`;
    case "instance":
      return `${s.name}(${s.args.map(exprStr).join(", ")})`;
    case "set":
      return `set ${s.target}(${s.over.map((o) => `${o.key}: ${setValStr(o.value)}`).join(", ")})`;
    case "for":
      return concat([`for ${s.varName} in ${exprStr(s.iter)} `, blockDoc(s.body, s.span!, comments, source)]);
    case "while":
      return concat([`while ${exprStr(s.cond)} `, blockDoc(s.body, s.span!, comments, source)]);
    case "if": {
      const parts: Doc[] = [`if ${exprStr(s.cond)} `, blockDoc(s.then, s.span!, comments, source)];
      if (s.else) parts.push(" else ", blockDoc(s.else, s.span!, comments, source));
      return concat(parts);
    }
    case "error":
      // Re-emit the broken region verbatim — formatting must never corrupt it.
      return s.span ? source.slice(s.span.start, s.span.end) : "";
  }
}

// ---- plan-level constructs ----

function importDoc(imp: ImportNode): Doc {
  const items = imp.star ? "*" : imp.items.map((it) => (it.alias ? `${it.name} as ${it.alias}` : it.name)).join(", ");
  return `import ${JSON.stringify(imp.spec)}: ${items}`;
}

function componentDoc(def: ComponentDef, comments: Comment[], source: string): Doc {
  return concat([`component ${def.name}(${def.params.join(", ")}) `, blockDoc(def.body, def.span!, comments, source)]);
}

function titleDoc(title: TitleNode): Doc {
  const fields: Doc[] = [];
  if (title.project !== undefined) fields.push(`project ${JSON.stringify(title.project)}`);
  if (title.drawnBy !== undefined) fields.push(`drawn_by ${JSON.stringify(title.drawnBy)}`);
  if (title.date !== undefined) fields.push(`date ${JSON.stringify(title.date)}`);
  if (fields.length === 0) return "title { }";
  return concat(["title {", indent(concat([hardline, join(hardline, fields)])), hardline, "}"]);
}

function themeDoc(plan: PlanNode): Doc | undefined {
  if (plan.themeFrom !== undefined) return `theme from ${JSON.stringify(plan.themeFrom)}`;
  const entries = Object.entries(plan.theme ?? {});
  const base = plan.themeBase ? ` ${plan.themeBase}` : "";
  if (entries.length === 0) return base ? `theme${base}` : undefined;
  const lines = entries.map(
    ([k, v]) => `${k}: ${isNumericThemeKey(k as never) ? numStr(v as number) : JSON.stringify(v)}`,
  );
  return concat([`theme${base} {`, indent(concat([hardline, join(hardline, lines)])), hardline, "}"]);
}

function styleDoc(kind: string, st: Record<string, unknown>): Doc {
  const lines = Object.entries(st).map(
    ([k, v]) => `${k}: ${isNumericThemeKey(k as never) ? numStr(v as number) : JSON.stringify(v)}`,
  );
  return concat([`style ${kind} {`, indent(concat([hardline, join(hardline, lines)])), hardline, "}"]);
}

// ---- comment weaving ----

interface Slot {
  start: number;
  end: number;
  block: boolean;
  doc: Doc;
}

const sameLine = (a: number, b: number, src: string): boolean =>
  !src.slice(Math.min(a, b), Math.max(a, b)).includes("\n");
// A blank line in the gap — tolerant of CRLF (`\r\n\r\n`) as well as LF.
const gapHasBlank = (a: number, b: number, src: string): boolean => b > a && /\r?\n[ \t]*\r?\n/.test(src.slice(a, b));

/**
 * Interleave `comments` with `slots` (in source order), returning the body's
 * lines as Docs (with `""` entries for blank lines). A comment on the same line
 * as the slot before it is a trailing comment; otherwise it leads the next slot.
 * Comments inside a nested block slot are left to that block's own recursion.
 */
function weaveSlots(slots: Slot[], comments: Comment[], source: string): Doc[] {
  const leading = new Map<number, Comment[]>();
  const trailing = new Map<number, Comment[]>();
  const footer: Comment[] = [];
  const add = (m: Map<number, Comment[]>, i: number, c: Comment): void => {
    (m.get(i) ?? m.set(i, []).get(i)!).push(c);
  };

  for (const c of comments) {
    if (slots.some((s) => s.block && c.span.start > s.start && c.span.start < s.end)) continue; // handled by recursion
    let prev = -1;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i]!.end <= c.span.start) prev = i;
      else break;
    }
    if (prev >= 0 && sameLine(slots[prev]!.end, c.span.start, source)) add(trailing, prev, c);
    else {
      const next = slots.findIndex((s) => s.start > c.span.start);
      if (next >= 0) add(leading, next, c);
      else footer.push(c);
    }
  }

  const lines: Doc[] = [];
  slots.forEach((s, i) => {
    const lead = leading.get(i) ?? [];
    const leadStart = lead.length ? lead[0]!.span.start : s.start;
    if (i > 0 && gapHasBlank(slots[i - 1]!.end, leadStart, source)) lines.push("");
    for (const c of lead) lines.push(c.text);
    const tr = trailing.get(i) ?? [];
    lines.push(tr.length ? concat([s.doc, "  ", tr.map((t) => t.text).join("  ")]) : s.doc);
  });
  if (footer.length) {
    if (slots.length && gapHasBlank(slots[slots.length - 1]!.end, footer[0]!.span.start, source)) lines.push("");
    for (const c of footer) lines.push(c.text);
  }
  return lines;
}

// ---- plan assembly ----

function northStr(n: PlanNode["north"]): string {
  return typeof n === "object" ? numStr(n.deg) : n;
}

export function formatPlan(plan: PlanNode, source: string): string {
  const comments = plan.comments ?? [];

  // Header settings, in canonical order (no spans → emitted at the top).
  const settings: Doc[] = ["units mm"];
  if (plan.grid !== 0) settings.push(`grid ${numStr(plan.grid)}`);
  if (plan.scale) settings.push(`scale ${plan.scale}`);
  settings.push(`north ${northStr(plan.north)}`);
  if (plan.autoDims) settings.push(`dims auto ${plan.autoDims}`);
  if (plan.accTitle !== undefined) settings.push(`accTitle ${JSON.stringify(plan.accTitle)}`);
  if (plan.accDescr !== undefined) settings.push(`accDescr ${JSON.stringify(plan.accDescr)}`);

  // Theme + per-element styles (hoisted under the settings).
  const sections: Doc[] = [];
  const theme = themeDoc(plan);
  if (theme) sections.push(theme);
  for (const [kind, st] of Object.entries(plan.styles ?? {}))
    sections.push(styleDoc(kind, st as Record<string, unknown>));

  // Everything that carries a span — imports, components, body, title — emitted
  // in true source order, with comments and blank lines woven in.
  const slots: Slot[] = [];
  for (const imp of plan.imports)
    slots.push({ start: imp.span!.start, end: imp.span!.end, block: false, doc: importDoc(imp) });
  for (const def of plan.components.values())
    slots.push({ start: def.span!.start, end: def.span!.end, block: true, doc: componentDoc(def, comments, source) });
  for (const s of plan.body)
    slots.push({
      start: s.span!.start,
      end: s.span!.end,
      block: BLOCK_KINDS.has(s.kind),
      doc: statementDoc(s, comments, source),
    });
  if (plan.title?.span)
    slots.push({ start: plan.title.span.start, end: plan.title.span.end, block: true, doc: titleDoc(plan.title) });
  slots.sort((a, b) => a.start - b.start);

  const bodyStart = plan.bodyStart ?? 0;
  const bodyComments = comments.filter((c) => c.span.start >= bodyStart);
  const itemLines = weaveSlots(slots, bodyComments, source);

  const bodyParts: Doc[] = [...settings];
  for (const sd of sections) {
    bodyParts.push("");
    bodyParts.push(sd);
  }
  if (itemLines.length) {
    bodyParts.push("");
    bodyParts.push(...itemLines);
  }

  // File-header comments (before the opening `{`) sit above `plan`.
  const head: Doc[] = [];
  for (const c of comments.filter((c) => c.span.start < bodyStart)) {
    head.push(c.text);
    head.push(hardline);
  }
  head.push(`plan ${JSON.stringify(plan.name)} {`);
  head.push(indent(concat([hardline, join(hardline, bodyParts)])));
  head.push(hardline, "}", hardline);
  return printDoc(concat(head), PRINT_WIDTH);
}
