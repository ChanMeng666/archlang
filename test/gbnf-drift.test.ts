/**
 * Drift + acceptance/rejection gate for the generated GBNF grammar
 * (`grammars/archlang.gbnf`, produced by `scripts/gen-gbnf.ts`).
 *
 * Four things are asserted:
 *   1. DRIFT — regenerating in-memory equals the committed file, byte-for-byte
 *      (so a keyword/enum change in the single source must be regenerated).
 *   2. ACCEPTANCE — every top-level plan file under `examples/` is fully derivable
 *      from `root` (fed character-by-character). This is the hard "never reject a
 *      valid .arch" test, including the v1.13 placement sugar (strip / `on … at %` /
 *      `swing into` / `anchor … inset`).
 *   3. REJECTION — a set of malformed snippets have no valid derivation.
 *   4. PARSER AGREEMENT — a corpus is run through BOTH this grammar and the real
 *      `compile()`, and the two must agree about whether each snippet PARSES. See
 *      "The agreement corpus" below; this is the guard that would have caught the
 *      v1.25 defect where the grammar offered `door on <wall> at <pos> … wall <ref>`,
 *      a form the parser has never accepted.
 *
 * ## Why a bundled recognizer instead of the `gbnf` npm package
 *
 * The task pinned `gbnf@0.1.41` as the runner. On inspection that library is a
 * strict subset of GBNF that cannot validate this grammar: it does not support
 * `{m,n}` bounded repetition (which the whitespace rules require), rejects a
 * newline-continued `|` alternation, has no `.` any-char, and — fatally — cannot
 * parse a character class containing an escaped backslash (`[^"\\]` throws), so it
 * cannot even express a string-literal rule. Rather than ship a broken gate or
 * mangle the grammar to fit the library, this test carries a small, self-contained
 * GBNF recognizer covering exactly the feature subset the grammar uses: string and
 * newline/hex/unicode escapes, character classes (ranges + negation), alternation,
 * grouping, `* + ?` and `{m}` / `{m,}` / `{m,n}` bounds, sequences, and rule
 * references. It is a positions-set CFG matcher (returns every reachable end
 * position, memoized per (node, position)), so — unlike an ordered-choice PEG — it
 * never spuriously rejects a valid string because an earlier alternative committed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { renderGbnf } from "../scripts/gen-gbnf.js";
import { compile } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const GBNF_PATH = resolve(ROOT, "grammars/archlang.gbnf");

// ===========================================================================
// A minimal GBNF recognizer (see the file header for why it exists).
// ===========================================================================

type Expr =
  | { t: "lit"; id: number; s: string }
  | { t: "class"; id: number; neg: boolean; ranges: [number, number][] }
  | { t: "ref"; id: number; name: string }
  | { t: "seq"; id: number; items: Expr[] }
  | { t: "alt"; id: number; opts: Expr[] }
  | { t: "rep"; id: number; e: Expr; min: number; max: number };

/** Parse one GBNF grammar (one rule per line) into a rule map. */
function parseGrammar(src: string): Map<string, Expr> {
  let counter = 0;
  const nextId = () => counter++;
  const rules = new Map<string, Expr>();
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("::=");
    if (eq < 0) throw new Error(`bad rule line: ${line}`);
    const name = line.slice(0, eq).trim();
    const body = line.slice(eq + 3).trim();
    rules.set(name, parseAlt(new Cursor(body), nextId));
  }
  return rules;
}

/** A tiny cursor over a rule body. */
class Cursor {
  i = 0;
  constructor(readonly s: string) {}
  eof(): boolean {
    return this.i >= this.s.length;
  }
  peek(): string {
    return this.s[this.i] ?? "";
  }
  skipSpace(): void {
    while (this.i < this.s.length && (this.s[this.i] === " " || this.s[this.i] === "\t")) this.i++;
  }
}

function parseAlt(c: Cursor, nextId: () => number): Expr {
  const opts = [parseSeq(c, nextId)];
  for (;;) {
    c.skipSpace();
    if (c.peek() === "|") {
      c.i++;
      opts.push(parseSeq(c, nextId));
    } else break;
  }
  return opts.length === 1 ? opts[0]! : { t: "alt", id: nextId(), opts };
}

function parseSeq(c: Cursor, nextId: () => number): Expr {
  const items: Expr[] = [];
  for (;;) {
    c.skipSpace();
    if (c.eof() || c.peek() === "|" || c.peek() === ")") break;
    items.push(parseRep(c, nextId));
  }
  if (items.length === 0) return { t: "seq", id: nextId(), items: [] }; // matches empty
  return items.length === 1 ? items[0]! : { t: "seq", id: nextId(), items };
}

function parseRep(c: Cursor, nextId: () => number): Expr {
  let e = parsePrimary(c, nextId);
  const ch = c.peek();
  if (ch === "*") {
    c.i++;
    e = { t: "rep", id: nextId(), e, min: 0, max: Number.POSITIVE_INFINITY };
  } else if (ch === "+") {
    c.i++;
    e = { t: "rep", id: nextId(), e, min: 1, max: Number.POSITIVE_INFINITY };
  } else if (ch === "?") {
    c.i++;
    e = { t: "rep", id: nextId(), e, min: 0, max: 1 };
  } else if (ch === "{") {
    c.i++;
    let spec = "";
    while (!c.eof() && c.peek() !== "}") spec += this_char(c);
    if (c.peek() !== "}") throw new Error(`unterminated { in body: ${c.s}`);
    c.i++; // }
    const m = /^(\d+)(,(\d*))?$/.exec(spec.trim());
    if (!m) throw new Error(`bad repetition {${spec}}`);
    const min = Number.parseInt(m[1]!, 10);
    const max = m[2] === undefined ? min : m[3] === "" ? Number.POSITIVE_INFINITY : Number.parseInt(m[3]!, 10);
    e = { t: "rep", id: nextId(), e, min, max };
  }
  return e;
}

function this_char(c: Cursor): string {
  const ch = c.s[c.i]!;
  c.i++;
  return ch;
}

function parsePrimary(c: Cursor, nextId: () => number): Expr {
  c.skipSpace();
  const ch = c.peek();
  if (ch === "(") {
    c.i++;
    const inner = parseAlt(c, nextId);
    c.skipSpace();
    if (c.peek() !== ")") throw new Error(`expected ) in body: ${c.s}`);
    c.i++;
    return inner;
  }
  if (ch === '"') return parseString(c, nextId);
  if (ch === "[") return parseClass(c, nextId);
  // rule reference: dashed-lowercase word (also allow digits/underscore just in case)
  let name = "";
  while (!c.eof() && /[a-zA-Z0-9_-]/.test(c.peek())) name += this_char(c);
  if (name === "") throw new Error(`unexpected char '${ch}' in body: ${c.s}`);
  return { t: "ref", id: nextId(), name };
}

/** Read a backslash escape (shared by strings and classes) → the literal char. */
function readEscape(c: Cursor): string {
  // assumes current char is '\\'
  c.i++;
  const e = this_char(c);
  switch (e) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    case "x": {
      const hex = this_char(c) + this_char(c);
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    case "u": {
      const hex = this_char(c) + this_char(c) + this_char(c) + this_char(c);
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    default:
      return e; // \" \\ \[ \] \{ \} etc. → the literal char
  }
}

function parseString(c: Cursor, nextId: () => number): Expr {
  c.i++; // opening "
  let s = "";
  while (!c.eof() && c.peek() !== '"') {
    if (c.peek() === "\\") s += readEscape(c);
    else s += this_char(c);
  }
  if (c.peek() !== '"') throw new Error(`unterminated string in body: ${c.s}`);
  c.i++; // closing "
  return { t: "lit", id: nextId(), s };
}

function parseClass(c: Cursor, nextId: () => number): Expr {
  c.i++; // [
  let neg = false;
  if (c.peek() === "^") {
    neg = true;
    c.i++;
  }
  const ranges: [number, number][] = [];
  while (!c.eof() && c.peek() !== "]") {
    const lo = c.peek() === "\\" ? readEscape(c) : this_char(c);
    if (c.peek() === "-" && c.s[c.i + 1] !== "]" && c.i + 1 < c.s.length) {
      c.i++; // -
      const hi = c.peek() === "\\" ? readEscape(c) : this_char(c);
      ranges.push([lo.charCodeAt(0), hi.charCodeAt(0)]);
    } else {
      ranges.push([lo.charCodeAt(0), lo.charCodeAt(0)]);
    }
  }
  if (c.peek() !== "]") throw new Error(`unterminated class in body: ${c.s}`);
  c.i++; // ]
  return { t: "class", id: nextId(), neg, ranges };
}

/** Does `input` have a full derivation from `root`? Feeds every character. */
function accepts(rules: Map<string, Expr>, input: string): boolean {
  const memo = new Map<number, Map<number, Set<number>>>();
  const inProgress = new Set<string>();

  const matchRule = (name: string, pos: number): Set<number> => {
    const key = `${name}:${pos}`;
    if (inProgress.has(key)) return new Set(); // guards accidental left recursion
    const expr = rules.get(name);
    if (!expr) throw new Error(`undefined rule '${name}'`);
    inProgress.add(key);
    const r = match(expr, pos);
    inProgress.delete(key);
    return r;
  };

  const match = (e: Expr, pos: number): Set<number> => {
    let byPos = memo.get(e.id);
    if (!byPos) {
      byPos = new Map();
      memo.set(e.id, byPos);
    }
    const cached = byPos.get(pos);
    if (cached) return cached;
    const out = compute(e, pos);
    byPos.set(pos, out);
    return out;
  };

  const compute = (e: Expr, pos: number): Set<number> => {
    switch (e.t) {
      case "lit":
        return input.startsWith(e.s, pos) ? new Set([pos + e.s.length]) : new Set();
      case "class": {
        if (pos >= input.length) return new Set();
        const code = input.charCodeAt(pos);
        const hit = e.ranges.some(([lo, hi]) => code >= lo && code <= hi);
        return (e.neg ? !hit : hit) ? new Set([pos + 1]) : new Set();
      }
      case "ref":
        return matchRule(e.name, pos);
      case "seq": {
        let cur = new Set([pos]);
        for (const item of e.items) {
          const next = new Set<number>();
          for (const p of cur) for (const q of match(item, p)) next.add(q);
          if (next.size === 0) return next;
          cur = next;
        }
        return cur;
      }
      case "alt": {
        const out = new Set<number>();
        for (const o of e.opts) for (const q of match(o, pos)) out.add(q);
        return out;
      }
      case "rep": {
        const out = new Set<number>();
        if (e.min === 0) out.add(pos);
        let frontier = new Set([pos]);
        const seen = new Set([pos]);
        for (let count = 1; count <= e.max && count <= input.length + 1; count++) {
          const next = new Set<number>();
          for (const p of frontier) for (const q of match(e.e, p)) next.add(q);
          if (next.size === 0) break;
          if (count >= e.min) for (const q of next) out.add(q);
          let novel = false;
          for (const q of next)
            if (!seen.has(q)) {
              seen.add(q);
              novel = true;
            }
          frontier = next;
          if (!novel) {
            // Fixpoint (nullable element): higher counts add nothing new. If we
            // have not yet reached `min`, those positions are still reachable.
            if (e.min > count) for (const q of frontier) out.add(q);
            break;
          }
        }
        return out;
      }
    }
  };

  return matchRule("root", 0).has(input.length);
}

// ===========================================================================
// Tests
// ===========================================================================

// ===========================================================================
// The agreement corpus
// ===========================================================================
//
// The grammar exists to make invalid output impossible for a constrained decoder,
// so the property that matters is not "it looks right" but "it and the parser
// agree". Nothing checked that until v1.25, and the gap shipped: `check:drift`
// only proves the generator reproduces its own output, so a hand-typed production
// can encode a form the language has never had and stay green forever.
//
// Every verdict below is TAKEN FROM `compile()`, never written beside the case, so
// the corpus cannot be greened by editing a column — only by changing the grammar or
// the compiler. What counts as "parses" is: no `E_PARSE` error. Any OTHER catalogued
// `E_*` is a RESOLVE-time refusal and is deliberately still derivable — a decoder
// should be able to emit an off-wall door and be told about it.
//
// Three lists, because "equivalent" is not quite the contract:
//
//   AGREEMENT   — the biconditional. `accepts(grammar) === parses(compiler)`. Any
//                 form whose shape the grammar takes a position on belongs here.
//   NARROWER    — forms the grammar deliberately refuses although they parse. The
//                 admission rule, and the reason this list cannot become a dumping
//                 ground: the compiler must itself flag the form with a CATALOGUED
//                 code (error or warning) every time. A form that compiles clean can
//                 never be parked here.
//   DIVERGENT   — known over-permissiveness, PINNED so it stays visible instead of
//                 being forgotten. Each entry says why it is not fixed. Fixing one
//                 fails its pin, which is the prompt to move the case up to AGREEMENT.
//
// Out of scope by construction (the grammar approximates layout, not shape): inter-
// token whitespace — `ws` sits between two word-like tokens the lexer would glue —
// and the `sp ::= [ \t\r]{0,80}` bound on a single run of inline space.

/**
 * Does the real compiler PARSE this source? (Resolve-time codes don't count.)
 *
 * The marker is `E_PARSE`, the code every lexer/parser refusal carries. Until v1.27.0
 * it was the ABSENCE of a code, which worked only because parse errors were the one
 * uncoded diagnostic in the system — a property nothing asserted and any new uncoded
 * `diag()` call would have quietly broken, turning a refusal into a "parses". Naming
 * the marker also makes it selectable: `arch lint --code E_PARSE`.
 */
function parses(src: string): boolean {
  const { diagnostics } = compile(src, { noCache: true });
  return !diagnostics.some((d) => d.severity === "error" && d.code === "E_PARSE");
}

/** The catalogued codes the compiler answers this source with. */
function codes(src: string): string[] {
  return compile(src, { noCache: true })
    .diagnostics.map((d) => d.code)
    .filter((c): c is string => c !== undefined);
}

/** A plan wrapping `body`, with a wall `w1` and a room `r1` in scope. */
const P = (body: string): string =>
  `plan "p" {\n` +
  `  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }\n` +
  `  room id=r1 at (0,0) size 5000x4000\n` +
  `${body}\n}\n`;

/**
 * Both directions must hold. Roughly half of these parse and half do not; the
 * balance is asserted below so the suite cannot pass by being all-positive.
 */
const AGREEMENT: [string, string][] = [
  // —— openings: the `wall` clause is `at`-form-only (the v1.25 defect) ————
  ["door at + wall clause", P(`  door at (2500,0) width 900 wall w1`)],
  ["door on + wall clause", P(`  door on w1 at 50% width 900 wall w1`)],
  ["door on, no wall clause", P(`  door on w1 at 50% width 900`)],
  ["window at + wall clause", P(`  window at (2500,0) width 900 wall w1`)],
  ["window on + wall clause", P(`  window on w1 at 50% width 900 wall w1`)],
  ["opening at + wall clause", P(`  opening at (2500,0) width 900 wall w1`)],
  ["opening on + wall clause", P(`  opening on w1 at 50% width 900 wall w1`)],
  ["door kind + on + wall clause", P(`  door pocket on w1 at 50% width 900 wall w1`)],
  ["door garage (the clause-free kind)", P(`  door garage on w1 at 60% width 2400`)],
  ["door garage + open (E_ not parse)", P(`  door garage on w1 at 60% width 2400 open 0.5`)],
  ["door on center", P(`  door on w1 at center width 900`)],
  // —— the attachment position is an EXPRESSION, and `%` ends it ——————————
  ["on at ref", P(`  let bay = 1200\n  door on w1 at bay width 900`)],
  ["on at arithmetic", P(`  let bay = 1200\n  door on w1 at bay * 2 + 600 width 900`)],
  ["on at arithmetic percent", P(`  door on w1 at 10 + 15% width 900`)],
  ["on at unary minus", P(`  door on w1 at 0 - 500 width 900`)],
  ["on at call", P(`  door on w1 at min(1200, 3000) width 900`)],
  ["on at parenthesised modulo", P(`  door on w1 at (5000 % 3000) width 900`)],
  ["on at bare modulo (the % ends it)", P(`  door on w1 at 5000 % 3000 width 900`)],
  ["on at bare modulo, percent-suffixed", P(`  door on w1 at 50 % 3% width 900`)],
  ["on at nothing", P(`  door on w1 at width 900`)],
  ["on at trailing operator", P(`  door on w1 at 1200 + width 900`)],
  ["window on at arithmetic", P(`  let bay = 1200\n  window on w1 at bay + 300 width 900`)],
  ["opening on at arithmetic", P(`  let bay = 1200\n  opening on w1 at bay + 300 width 900`)],
  ["for-generated run of openings", P(`  for i in 0..3 { door on w1 at 900 * i + 600 width 800 }`)],
  // —— door clauses are a fixed SEQUENCE, not a set ————————————————————
  ["door clauses in order", P(`  door at (2500,0) width 900 wall w1 hinge left swing in`)],
  ["door swing before hinge", P(`  door at (2500,0) width 900 swing in hinge left`)],
  ["door hinge twice", P(`  door at (2500,0) width 900 hinge left hinge right`)],
  ["door wall after hinge", P(`  door at (2500,0) width 900 hinge left wall w1`)],
  ["door open before slide", P(`  door sliding on w1 at 50% width 900 open 0.5 slide left`)],
  ["door slide then open", P(`  door sliding on w1 at 50% width 900 slide left open 0.5`)],
  ["door hinge near / swing into", P(`  door at (2500,0) width 900 hinge near start swing into r1`)],
  ["door pocket + hinge (E_ not parse)", P(`  door pocket on w1 at 50% width 900 hinge left`)],
  // —— furniture: fixed clause order, and one `in` only ————————————————
  ["furn size,label,rotate,in", P(`  furniture id=f bed at (1000,1000) size 1000x2000 label "b" rotate 90 in r1`)],
  ["furn label before size", P(`  furniture id=f bed at (1000,1000) label "b" size 1000x2000`)],
  ["furn in before rotate", P(`  furniture id=f bed at (1000,1000) size 1000x2000 in r1 rotate 90`)],
  ["furn size twice", P(`  furniture id=f bed at (1000,1000) size 1000x2000 size 900x900`)],
  ["furn in-form + trailing in", P(`  furniture id=f bed in r1 centered size 1000x2000 in r1`)],
  ["furn in-form, no trailing in", P(`  furniture id=f bed in r1 centered size 1000x2000`)],
  [
    "furn against seg,offset,side",
    P(`  furniture id=f bed against wall w1 segment 0 offset 100 side left size 1000x600`),
  ],
  ["furn against side before offset", P(`  furniture id=f bed against wall w1 side left offset 100 size 1000x600`)],
  ["furn against offset twice", P(`  furniture id=f bed against wall w1 offset 100 offset 200 size 1000x600`)],
  ["furn anchor flush inset", P(`  furniture id=f bed in r1 anchor bottom flush inset 100 size 1000x600`)],
  ["furn anchor inset before flush", P(`  furniture id=f bed in r1 anchor bottom inset 100 flush size 1000x600`)],
  // —— room shapes ————————————————————————————————————————————
  ["room polygon 3 vertices", P(`  room id=r2 polygon (6000,0) (7000,0) (7000,1000)`)],
  ["room polygon 2 vertices", P(`  room id=r2 polygon (6000,0) (7000,0)`)],
  ["room polygon label at", P(`  room id=r2 polygon (6000,0) (7000,0) (7000,1000) label "x" at (6500,500)`)],
  ["room circle + uses", P(`  room id=r2 circle at (9000,0) radius 1000 uses living`)],
  ["room uses before label", P(`  room id=r2 at (6000,0) size 1000x1000 uses living label "x"`)],
  ["room uses garage", P(`  room id=r2 at (6000,0) size 1000x1000 uses garage`)],
  ["room relational align/gap", P(`  room id=r2 right-of r1 align top gap 100 size 1000x1000`)],
  ["room relational gap before align", P(`  room id=r2 right-of r1 gap 100 align top size 1000x1000`)],
  // —— wall body arity + `arc` cannot lead ————————————————————————
  ["wall two points", P(`  wall id=w2 partition thickness 100 { (0,5000) (1000,5000) }`)],
  ["wall one point", P(`  wall id=w2 partition thickness 100 { (0,5000) }`)],
  ["wall arc as first vertex", P(`  wall id=w2 partition thickness 100 { arc (1000,5000) radius 800 }`)],
  ["wall arc as second vertex", P(`  wall id=w2 partition thickness 100 { (0,5000) arc (1000,5000) radius 800 }`)],
  [
    "wall material scale+angle",
    P(`  wall id=w2 partition thickness 100 material brick scale 2 angle 30 { (0,5000) (1,5000) }`),
  ],
  [
    "wall material three subclauses",
    P(`  wall id=w2 p thickness 100 material brick scale 2 scale 3 angle 5 { (0,5000) (1,5000) }`),
  ],
  ["wall close before a point", P(`  wall id=w2 partition thickness 100 { close (0,5000) (1000,5000) }`)],
  // —— strip: the cross keyword is chosen by the direction ————————————
  ["strip right + height", P(`  strip right at (0,6000) gap 100 height 3000 { room id=s1 size 2000 }`)],
  ["strip right + width", P(`  strip right at (0,6000) gap 100 width 3000 { room id=s1 size 2000 }`)],
  ["strip down + width", P(`  strip down at (0,6000) gap 100 width 3000 { room id=s1 size 2000 }`)],
  ["strip down + height", P(`  strip down at (0,6000) gap 100 height 3000 { room id=s1 size 2000 }`)],
  ["strip cross before gap", P(`  strip right at (0,6000) height 3000 gap 100 { room id=s1 size 2000 }`)],
  [
    "strip room label + uses",
    P(`  strip right at (0,6000) gap 100 height 3000 { room id=s1 size 2000 label "a" uses living }`),
  ],
  [
    "strip room label at",
    P(`  strip right at (0,6000) gap 100 height 3000 { room id=s1 size 2000 label "a" at (1,1) }`),
  ],
  // —— dim ————————————————————————————————————————————————
  ["dim without offset", P(`  dim (0,0)->(1000,0)`)],
  ["dim offset then text", P(`  dim (0,0)->(1000,0) offset 300 text "a"`)],
  ["dim text before offset", P(`  dim (0,0)->(1000,0) text "a" offset 300`)],
  ["dim faces + radius", P(`  dim faces radius w1`)],
  ["dim diameter + segment", P(`  dim diameter r1 segment 0`)],
  // —— vertical / column clause order ————————————————————————————
  ["stair dir then width", P(`  stair at (0,7000) size 1000x3000 dir up width 900`)],
  ["stair width before dir", P(`  stair at (0,7000) size 1000x3000 width 900 dir up`)],
  // —— settings, theme/style, numbers ————————————————————————————
  ["paper A4 landscape", P(`  paper A4 landscape`)],
  ["paper a4 lowercase", P(`  paper a4`)],
  ["paper A4 Landscape (cap)", P(`  paper A4 Landscape`)],
  ["theme bare", `plan "p" { theme }\n`],
  ["theme named + block", P(`  theme blueprint { wall "#333" }`)],
  ["theme unknown key, number", P(`  theme { bogus 5 }`)],
  ["style known key, string", P(`  style room { fill "#333" }`)],
  ["style known key, number", P(`  style room { fill 5 }`)],
  ["number with leading dot", P(`  room id=r2 at (.5,6000) size 1x1`)],
  ["number with trailing dot", P(`  room id=r2 at (5.,6000) size 1x1`)],
  ["site block, either order", P(`  site { hemisphere south street north }`)],
  ["north negative", P(`  north -45`)],
  ["units cm", P(`  units cm`)],
  // —— place / level ————————————————————————————————————————
  [
    "place rotate then mirror",
    `plan "p" {\n  component c() { room at (0,0) size 100x100 }\n  place c() as a at (0,0) rotate 90 mirror x\n}\n`,
  ],
  [
    "place mirror before rotate",
    `plan "p" {\n  component c() { room at (0,0) size 100x100 }\n  place c() as a at (0,0) mirror x rotate 90\n}\n`,
  ],
  ["place without as", `plan "p" {\n  component c() { room at (0,0) size 100x100 }\n  place c() at (0,0)\n}\n`],
  [
    "level blocks",
    `plan "p" {\n  level 1 { room at (0,0) size 100x100 }\n  level 2 { room at (0,0) size 100x100 }\n}\n`,
  ],
  // —— roof: two spellings that are ALTERNATIVES, never a sequence ————————
  ["roof overhang", P(`  roof overhang 600`)],
  ["roof overhang + wall", P(`  roof overhang 600 wall w1`)],
  ["roof overhang expression", P(`  let eave = 300\n  roof overhang eave * 2`)],
  ["roof polygon", P(`  roof polygon (0,0) (9000,0) (9000,6000) (0,6000)`)],
  // …and the four shapes neither the parser nor a decoder may produce. `roof` takes no
  // `id=` (the shape word leads, as after `room`), the ring needs three points, and the
  // two spellings do not concatenate.
  ["roof with id=", P(`  roof id=r overhang 600`)],
  ["roof polygon, two points", P(`  roof polygon (0,0) (9000,0)`)],
  ["roof overhang then polygon", P(`  roof overhang 600 polygon (0,0) (1,0) (0,1)`)],
  ["roof bare", P(`  roof`)],
  // —— void ————————————————————————————————————————————————
  ["void", P(`  void at (1000,1000) size 2000x2000`)],
  ["void with id=", P(`  void id=well at (1000,1000) size 2000x2000`)],
  ["void without size", P(`  void at (1000,1000)`)],
  ["void size before at", P(`  void size 2000x2000 at (1000,1000)`)],
];

/**
 * The grammar refuses these although they parse. Admissible ONLY because the
 * compiler answers each with a catalogued code every time — refusing a form the
 * compiler itself flags is the grammar doing its job, not a hole in it.
 */
const NARROWER: [string, string, string][] = [
  // `flush` needs an anchored edge; on a centred piece it is always E_FURN_FLUSH.
  ["furn centered + flush", P(`  furniture id=f bed in r1 centered flush size 1000x2000`), "E_FURN_FLUSH"],
  // Every recognised style key is a colour, so a numeric value is a parse error and
  // `style-entry` takes a string. That also puts an unknown key's numeric value out
  // of reach — a form the parser accepts, but never silently.
  ["style unknown key, number", P(`  style room { bogus 5 }`), "W_UNKNOWN_STYLE_KEY"],
  // Plan-level-only blocks. The parser consumes them for clean recovery and reports.
  [
    "strip inside a block",
    P(`  if 1 == 1 { strip right at (0,6000) gap 0 height 100 { room size 100 } }`),
    "E_STRIP_NEST",
  ],
  ["level inside a block", P(`  if 1 == 1 { level 1 { room at (0,0) size 1x1 } }`), "E_LEVEL_NEST"],
  ["accTitle inside a block", P(`  if 1 == 1 { accTitle "x" }`), "E_ACC_PLACEMENT"],
];

/**
 * Known over-permissiveness, pinned so it stays visible. Each parses-check FAILS
 * while the grammar accepts; the pin asserts exactly that, so a future fix breaks it
 * and the case moves up into AGREEMENT.
 */
const DIVERGENT: [string, string, string][] = [
  [
    "theme colour key, numeric value",
    P(`  theme { wall 5 }`),
    "Every theme key but `lineWeight` takes a string, so this is a parse error. Splitting " +
      "`theme-entry` by key needs the theme key table AND its friendly aliases (`wall` → " +
      "`wallStroke`) injected from src/theme.ts, where the alias map is module-private. " +
      "Fix = export it and render two key alternations, one per value type.",
  ],
  [
    "place … rotate 45",
    `plan "p" {\n  component c() { room at (0,0) size 100x100 }\n  place c() as a at (0,0) rotate 45\n}\n`,
    "`place … rotate` is a closed set (0|90|180|270) rejected at PARSE time, but the set " +
      "exists nowhere at runtime — it is a TS union in ast.ts plus a conditional in " +
      "parser.ts. Emitting it here would be a third retyped copy, the exact thing this " +
      "generator's guards exist to prevent. Fix = add a PLACE_ROTATIONS table both read.",
  ],
  [
    "level 1.5",
    `plan "p" {\n  level 1 { room at (0,0) size 1x1 }\n  level 1.5 { room at (0,0) size 1x1 }\n}\n`,
    "NOT EXPRESSIBLE, and deliberately left alone. The parser requires an INTEGER storey, " +
      "but integrality is a property of the value AFTER the lexer folds a unit suffix: " +
      "`level 1.5` is an error and `level 0.5cm` (= 5) is not. No context-free rule can " +
      "separate them; a `digits`-only rule would reject `level 1.0`, which is valid.",
  ],
];

/** Every top-level `.arch` under examples/ (incl. lib/) — all are plan files. */
function allExamples(): { name: string; src: string }[] {
  const out: { name: string; src: string }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".arch")) {
        out.push({ name: `${prefix}${entry.name}`, src: readFileSync(join(dir, entry.name), "utf8") });
      }
    }
  };
  walk(resolve(ROOT, "examples"), "");
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

describe("gbnf grammar", () => {
  const grammarText = readFileSync(GBNF_PATH, "utf8");
  const rules = parseGrammar(grammarText);

  it("has no drift from the generator (regenerate + commit)", () => {
    expect(grammarText).toBe(renderGbnf());
  });

  it("sanity: the recognizer parses the grammar and defines root", () => {
    expect(rules.has("root")).toBe(true);
    // every referenced rule is defined
    const refs = new Set<string>();
    const collect = (e: Expr) => {
      if (e.t === "ref") refs.add(e.name);
      else if (e.t === "seq") e.items.forEach(collect);
      else if (e.t === "alt") e.opts.forEach(collect);
      else if (e.t === "rep") collect(e.e);
    };
    for (const e of rules.values()) collect(e);
    const missing = [...refs].filter((r) => !rules.has(r));
    expect(missing).toEqual([]);
  });

  describe("accepts every example (never rejects valid .arch)", () => {
    for (const { name, src } of allExamples()) {
      it(name, () => {
        expect(accepts(rules, src)).toBe(true);
      });
    }
  });

  it("accepts a synthetic snippet exercising the v1.13 placement sugar", () => {
    const src = `# new-syntax smoke: strip / on-at-% / swing-into / anchor-inset
plan "Sugar" {
  units mm
  grid 100
  strip right at (0,0) gap 0 height 4000 {
    room id=r_a size 4000 label "A" uses living
    room id=r_b size 3000 label "B" uses bedroom
  }
  wall id=w_s exterior thickness 200 { (0,4000) (7000,4000) }
  door id=d on w_s at 2000 width 1000 hinge near start swing into r_a
  window on w_s at 50% width 1400
  furniture sofa in r_a anchor top-left inset 300 size 2000x900 label "Sofa"
}
`;
    expect(accepts(rules, src)).toBe(true);
  });

  it("accepts tricky-but-valid spellings the parser allows", () => {
    const ok = [
      `plan "d" {\n  room at (4000,-100) size 4000 x 6000\n}\n`, // spaced dimension, negative coord
      `plan "d" {\n  room at(0,0) size 10x20\n}\n`, // no space after at, glued WxH
      `plan "d" {\n  let n = ["A", "B"]\n  room at (0,0) size 1x1 label "{n[0]}!"\n}\n`, // array + interpolation
      `plan "d" {\n  door on w at 40% width 900\n}\n`, // percent attach
      `plan "d" {\n  room right-of a align top gap 0 size 1x1\n}\n`, // relational placement
      `plan "d" {\n  room at (0,0) size 1x1 label "a \\"q\\" \\{brace\\} end"\n}\n`, // string escapes
      `plan "d" {\n  wall x thickness 100 { (0,0) (1,0) (1,1) close }\n}\n`, // wall points + close
      `plan "d" {\n  room at (0,0) size 3m x 4cm\n}\n`, // spaced dimension with metric unit suffixes
      `plan "d" {\n  room at (0,0) size 3.5mx4200\n}\n`, // glued WxH, first component suffixed, second bare
      `plan "d" {\n  door on w at 1.2m width 900mm\n}\n`, // suffixed attach position + width
    ];
    for (const s of ok) expect(accepts(rules, s), s).toBe(true);
  });

  it("accepts comments and blank lines in any position", () => {
    // A leading comment, blank lines around/after `{`, a comment as the first
    // statement, and trailing end-of-line comments are all layout the `ws` rule
    // swallows — the grammar must never reject a well-formed plan over them.
    const src = [
      "# leading comment before the plan",
      "",
      'plan "Comments" {',
      "",
      "  # a comment as the first thing inside the block",
      "  units mm   # trailing comment after a statement",
      "",
      "  grid 100",
      "",
      "  room at (0,0) size 4000x6000  # inline after a glued dimension",
      "",
      "}",
      "",
    ].join("\n");
    expect(accepts(rules, src)).toBe(true);
  });

  describe("rejects malformed input (no valid derivation)", () => {
    const bad: [string, string][] = [
      ["missing plan header", `units mm\nroom at (0,0) size 1x1\n`],
      ["unknown leading keyword", `plan "x" {\n  wombat at (0,0) size 1x1\n}\n`],
      ["unbalanced brace", `plan "x" {\n  room at (0,0) size 1x1\n`],
      ["garbage size", `plan "x" {\n  room at (0,0) size @!\n}\n`],
      ["bad enum value (hinge)", `plan "x" {\n  door at (0,0) width 900 hinge sideways\n}\n`],
      ["statement soup", `plan "x" {\n  = = ) ( 3 3 ,\n}\n`],
      ["unterminated string", `plan "x" {\n  room at (0,0) size 1x1 label "oops\n}\n`],
      ["number where keyword expected", `plan "x" {\n  units 5\n}\n`],
      ["unknown unit suffix", `plan "x" {\n  room at (0,0) size 3k x 4\n}\n`],
    ];
    for (const [label, src] of bad) {
      it(label, () => {
        expect(accepts(rules, src)).toBe(false);
      });
    }
  });

  describe("agrees with the parser", () => {
    for (const [label, src] of AGREEMENT) {
      it(label, () => {
        // The expected value comes from the compiler, every run. There is no column
        // to edit: making this pass means changing the grammar or the language.
        expect(accepts(rules, src)).toBe(parses(src));
      });
    }

    it("the corpus cannot pass vacuously", () => {
      const parseable = AGREEMENT.filter(([, s]) => parses(s));
      const rejected = AGREEMENT.length - parseable.length;
      // Both verdicts must be well represented, or "agreement" would be satisfied by
      // a grammar that accepted everything (or nothing).
      expect(parseable.length).toBeGreaterThanOrEqual(20);
      expect(rejected).toBeGreaterThanOrEqual(20);
      // And no duplicate labels quietly counting twice.
      expect(new Set(AGREEMENT.map(([l]) => l)).size).toBe(AGREEMENT.length);
    });
  });

  describe("is narrower than the parser only where the compiler itself objects", () => {
    for (const [label, src, code] of NARROWER) {
      it(label, () => {
        expect(parses(src)).toBe(true); // it really is a parse-level narrowing
        expect(accepts(rules, src)).toBe(false); // the grammar really does refuse it
        // The admission rule: a form may be unreachable from the grammar only if the
        // compiler flags it with a catalogued code. A clean-compiling form parked here
        // fails this line rather than hiding.
        expect(codes(src)).toContain(code);
      });
    }
  });

  describe("known divergences stay pinned (fixing one should fail its pin)", () => {
    for (const [label, src, why] of DIVERGENT) {
      it(label, () => {
        expect(why.length).toBeGreaterThan(80); // a pin must carry its reasoning
        expect(parses(src)).toBe(false);
        expect(accepts(rules, src)).toBe(true);
      });
    }
  });
});
