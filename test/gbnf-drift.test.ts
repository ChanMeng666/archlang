/**
 * Drift + acceptance/rejection gate for the generated GBNF grammar
 * (`grammars/archlang.gbnf`, produced by `scripts/gen-gbnf.ts`).
 *
 * Three things are asserted:
 *   1. DRIFT — regenerating in-memory equals the committed file, byte-for-byte
 *      (so a keyword/enum change in the single source must be regenerated).
 *   2. ACCEPTANCE — every top-level plan file under `examples/` is fully derivable
 *      from `root` (fed character-by-character). This is the hard "never reject a
 *      valid .arch" test, including the v1.13 placement sugar (strip / `on … at %` /
 *      `swing into` / `anchor … inset`).
 *   3. REJECTION — a set of malformed snippets have no valid derivation.
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
});
