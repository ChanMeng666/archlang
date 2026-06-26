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
  ImportNode,
  PlanNode,
  Statement,
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

/** Deterministic number → string (mirrors render.ts `fmt`: trim to 3 dp). */
function numStr(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

const BIN_PREC: Record<string, number> = {
  "||": 1, "&&": 2,
  "==": 3, "!=": 3,
  "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 6, "-": 6,
  "*": 7, "/": 7, "%": 7,
};
const RANGE_PREC = 5;

/** Binding strength of an expression (atoms/calls bind tightest). */
function precOf(e: Expr): number {
  if (e.t === "bin") return BIN_PREC[e.op];
  if (e.t === "range") return RANGE_PREC;
  return 99;
}

/** Render a child, wrapping in parens when its precedence is below `min`. */
function child(e: Expr, min: number): string {
  const s = exprStr(e);
  return precOf(e) < min ? `(${s})` : s;
}

/** Escape a literal string segment back to ArchLang source form. */
function escapeStr(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

/** A string template `"…{expr}…"` rebuilt from its parts. */
function strStr(parts: (string | Expr)[]): string {
  let out = '"';
  for (const p of parts) out += typeof p === "string" ? escapeStr(p) : `{${exprStr(p)}}`;
  return out + '"';
}

function exprStr(e: Expr): string {
  switch (e.t) {
    case "num": return numStr(e.value);
    case "bool": return e.value ? "true" : "false";
    case "ref": return e.name;
    case "str": return strStr(e.parts);
    case "arr": return `[${e.items.map(exprStr).join(", ")}]`;
    case "unary": return `${e.op}${child(e.e, 99)}`;
    case "bin": return `${child(e.l, BIN_PREC[e.op])} ${e.op} ${child(e.r, BIN_PREC[e.op] + 1)}`;
    case "range": return `${child(e.lo, RANGE_PREC)}..${child(e.hi, RANGE_PREC + 1)}`;
    case "index": return `${child(e.base, 99)}[${exprStr(e.idx)}]`;
    case "call": return `${e.callee}(${e.args.map(exprStr).join(", ")})`;
    case "fnlit": return `(${e.params.join(", ")}) = ${exprStr(e.body)}`;
    case "if": return `if ${exprStr(e.cond)} { ${exprStr(e.then)} } else { ${exprStr(e.else)} }`;
  }
}

const ptStr = (p: ExprPoint): string => `(${exprStr(p.x)}, ${exprStr(p.y)})`;

function sizeStr(size: { w: Expr; h: Expr }): string {
  // A `WxH` literal when both are plain numbers; `<expr> x <expr>` otherwise.
  if (size.w.t === "num" && size.h.t === "num") return `${numStr(size.w.value)}x${numStr(size.h.value)}`;
  return `${exprStr(size.w)} x ${exprStr(size.h)}`;
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
      return `room ${id}at ${ptStr(s.at)} size ${sizeStr(s.size)}${s.label ? ` label ${exprStr(s.label)}` : ""}`;
    case "door":
      return `door ${id}at ${ptStr(s.at)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}${s.hinge ? ` hinge ${s.hinge}` : ""}${s.swing ? ` swing ${s.swing}` : ""}`;
    case "window":
      return `window ${id}at ${ptStr(s.at)} width ${exprStr(s.width)}${s.wall ? ` wall ${s.wall}` : ""}`;
    case "furniture":
      return `furniture ${id}${s.category} at ${ptStr(s.at)} size ${sizeStr(s.size)}${s.label ? ` label ${exprStr(s.label)}` : ""}`;
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
  const lines = entries.map(([k, v]) =>
    `${k}: ${isNumericThemeKey(k as never) ? numStr(v as number) : JSON.stringify(v)}`,
  );
  return concat([`theme${base} {`, indent(concat([hardline, join(hardline, lines)])), hardline, "}"]);
}

function styleDoc(kind: string, st: Record<string, unknown>): Doc {
  const lines = Object.entries(st).map(([k, v]) =>
    `${k}: ${isNumericThemeKey(k as never) ? numStr(v as number) : JSON.stringify(v)}`,
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

const sameLine = (a: number, b: number, src: string): boolean => !src.slice(Math.min(a, b), Math.max(a, b)).includes("\n");
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
      if (slots[i].end <= c.span.start) prev = i;
      else break;
    }
    if (prev >= 0 && sameLine(slots[prev].end, c.span.start, source)) add(trailing, prev, c);
    else {
      const next = slots.findIndex((s) => s.start > c.span.start);
      if (next >= 0) add(leading, next, c);
      else footer.push(c);
    }
  }

  const lines: Doc[] = [];
  slots.forEach((s, i) => {
    const lead = leading.get(i) ?? [];
    const leadStart = lead.length ? lead[0].span.start : s.start;
    if (i > 0 && gapHasBlank(slots[i - 1].end, leadStart, source)) lines.push("");
    for (const c of lead) lines.push(c.text);
    const tr = trailing.get(i) ?? [];
    lines.push(tr.length ? concat([s.doc, "  ", tr.map((t) => t.text).join("  ")]) : s.doc);
  });
  if (footer.length) {
    if (slots.length && gapHasBlank(slots[slots.length - 1].end, footer[0].span.start, source)) lines.push("");
    for (const c of footer) lines.push(c.text);
  }
  return lines;
}

// ---- plan assembly ----

function northStr(n: PlanNode["north"]): string {
  return typeof n === "object" ? numStr(n.deg) : n;
}

function formatPlan(plan: PlanNode, source: string): string {
  const comments = plan.comments ?? [];

  // Header settings, in canonical order (no spans → emitted at the top).
  const settings: Doc[] = ["units mm"];
  if (plan.grid !== 0) settings.push(`grid ${numStr(plan.grid)}`);
  if (plan.scale) settings.push(`scale ${plan.scale}`);
  settings.push(`north ${northStr(plan.north)}`);

  // Theme + per-element styles (hoisted under the settings).
  const sections: Doc[] = [];
  const theme = themeDoc(plan);
  if (theme) sections.push(theme);
  for (const [kind, st] of Object.entries(plan.styles ?? {})) sections.push(styleDoc(kind, st as Record<string, unknown>));

  // Everything that carries a span — imports, components, body, title — emitted
  // in true source order, with comments and blank lines woven in.
  const slots: Slot[] = [];
  for (const imp of plan.imports) slots.push({ start: imp.span!.start, end: imp.span!.end, block: false, doc: importDoc(imp) });
  for (const def of plan.components.values()) slots.push({ start: def.span!.start, end: def.span!.end, block: true, doc: componentDoc(def, comments, source) });
  for (const s of plan.body) slots.push({ start: s.span!.start, end: s.span!.end, block: BLOCK_KINDS.has(s.kind), doc: statementDoc(s, comments, source) });
  if (plan.title?.span) slots.push({ start: plan.title.span.start, end: plan.title.span.end, block: true, doc: titleDoc(plan.title) });
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
