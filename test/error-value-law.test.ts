/**
 * The AF3 laws: the error value (`POISON`, `src/expr.ts`) is held only by a plan that already
 * fails, and when it is, its root errors are the plan's only new diagnostics.
 *
 * - Every site in `src/` that yields the error value (or counts a statement as having read it)
 *   carries an `// error value: <codes>` tag naming the error its path reported, or `passed on`
 *   when an operand was the error value already. The guard reads the sites off the code, so a
 *   new site without a tag fails, and a tagged code with no row below fails.
 * - A plan with no error diagnostic never has an element dropped for reading it, over the whole
 *   corpus (`docs/testing.md` § 5, the hand-broken defect corpus included) and over the examples
 *   with one number swapped, in turn, for each source of the error value.
 * - A plan that drops an element for it gains no diagnostic beyond that source's own: no
 *   follow-on (a size that is not positive, a keep that names what went, a door off its wall).
 * - Every source drops something somewhere, so neither law is read off an observer that sees
 *   nothing.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { link } from "../src/import.js";
import { droppedForErrorValue, resolveAll } from "../src/ir.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { BUILTIN_REGISTRY } from "../src/registry.js";
import type { World } from "../src/world.js";
import { CORPUS_DIRS, corpusFiles, examples, walkFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

/** A source's diagnostic codes, its error diagnostics, and the ids every storey dropped for
 *  reading the error value. */
function observe(src: string, world: World): { codes: string[]; errors: string[]; dropped: string[] } {
  const diagnostics = compile(src, { world, noCache: true }).diagnostics;
  const codes = diagnostics.map((d) => d.code ?? "");
  const errors = diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`);
  const { plan } = parse(src, BUILTIN_REGISTRY);
  if (!plan) return { codes, errors, dropped: [] };
  const r = resolveAll(link(plan, world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, world);
  const irs = r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir];
  return { codes, errors, dropped: irs.flatMap((ir) => [...droppedForErrorValue(ir)]) };
}

/** One source of the error value, written where a number stands. `code` is the tagged error it
 *  raises; `also`, a root it raises instead where it is written (a datum read in a room's own
 *  position is read too early); `prelude` is bound at the top of the plan for the text to call. */
interface Source {
  name: string;
  code: string;
  text: string;
  also?: string[];
  prelude?: string;
}

const SOURCES: readonly Source[] = [
  { name: "an unknown name", code: "E_UNKNOWN_REF", text: "nosuch_name" },
  { name: "an unknown function", code: "E_UNKNOWN_FN", text: "nosuch_fn(1)" },
  { name: "a string in arithmetic", code: "E_TYPE", text: `"s" + 1` },
  { name: "a string where a number is read", code: "E_TYPE", text: `"s"` },
  { name: "a boolean where a number is read", code: "E_TYPE", text: "true" },
  { name: "a string negated", code: "E_TYPE", text: `-"s"` },
  { name: "a number under `!`", code: "E_TYPE", text: "!1" },
  { name: "a number under `&&`", code: "E_TYPE", text: "1 && true" },
  { name: "a number under `||`", code: "E_TYPE", text: "false || 1" },
  { name: "a number as an `if` condition", code: "E_TYPE", text: "if 1 { 2 } else { 3 }" },
  { name: "a string as a range bound", code: "E_TYPE", text: `len(0.."s")` },
  { name: "a number indexed", code: "E_TYPE", text: "5[0]" },
  { name: "a division by zero", code: "E_DIV_ZERO", text: "1 / 0" },
  { name: "a modulo by zero", code: "E_DIV_ZERO", text: "1 % 0" },
  { name: "an index out of range", code: "E_INDEX", text: "[1][4]" },
  { name: "a built-in's domain", code: "E_DOMAIN", text: "sqrt(0 - 1)" },
  { name: "a built-in's arity", code: "E_ARITY", text: "min()" },
  { name: "a built-in's argument type", code: "E_TYPE", text: `sqrt("s")` },
  { name: "a user function's arity", code: "E_ARITY", text: "af3_two(1)", prelude: "let af3_two(a, b) = a + b" },
  {
    name: "unbounded recursion",
    code: "E_CALL_DEPTH",
    text: "af3_deep(1)",
    prelude: "let af3_deep(n) = af3_deep(n + 1)",
  },
  { name: "a non-finite result", code: "E_NON_FINITE", text: Array(30).fill("99999999999").join(" * ") },
  {
    name: "an unknown room's datum",
    code: "E_UNKNOWN_REF",
    text: "nosuch_room.top",
    also: ["E_DATUM_BEFORE_ROOMS"],
  },
  { name: "an undeclared axis", code: "E_UNKNOWN_REF", text: "axis.ZZ" },
];

/** A source that needs a plan of its own (an axis, an instance, a room of some shape): the whole
 *  plan, the tagged error it raises, and every code its diagnostics may hold (its roots). */
interface Context {
  name: string;
  code: string;
  roots: string[];
  src: string;
}

const plan = (...lines: string[]): string => `plan "p" {\n  units mm\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
const ROOM_A = "room id=a at (0,0) size 4000 x 3000";

const CONTEXTS: readonly Context[] = [
  {
    name: "a near miss of an axis label",
    code: "E_UNKNOWN_REF",
    roots: ["E_UNKNOWN_REF"],
    src: plan("axes { x at 0, 4000 y at 0, 3000 }", "room id=a at (axis.1, axis.a) size 4000 x 3000"),
  },
  {
    name: "a datum read in a `let`",
    code: "E_DATUM_BEFORE_ROOMS",
    roots: ["E_DATUM_BEFORE_ROOMS"],
    src: plan(ROOM_A, "let v = a.top", "column at (v, 0) size 600x600"),
  },
  {
    name: "a datum read in a room's own position",
    code: "E_DATUM_BEFORE_ROOMS",
    roots: ["E_DATUM_BEFORE_ROOMS"],
    src: plan(ROOM_A, "room id=b at (a.right, 0) size 4000 x 3000"),
  },
  {
    name: "a datum read in a function's body",
    code: "E_DATUM_BEFORE_ROOMS",
    roots: ["E_DATUM_BEFORE_ROOMS"],
    src: plan("let f(n) = n + a.top", ROOM_A, "column at (f(1), 0) size 600x600"),
  },
  {
    name: "a datum that also names an instance's element",
    code: "E_DATUM_NAME",
    roots: ["E_DATUM_NAME"],
    src: plan(
      "component cell() {",
      "  room id=top at (0,0) size 3000 x 3000",
      "}",
      "room id=west at (0,0) size 3000 x 3000",
      "place cell() as west at (5000,0)",
      "column at (west.top, 0) size 600x600",
    ),
  },
  {
    name: "a compass datum where north is not up",
    code: "E_DATUM_COMPASS",
    roots: ["E_DATUM_COMPASS"],
    src: plan("north left", ROOM_A, "column at (a.west, 0) size 600x600"),
  },
  {
    name: "a datum of a circle room",
    code: "E_ROOM_NOT_RECTANGLE",
    roots: ["E_ROOM_NOT_RECTANGLE"],
    src: plan("room id=c circle at (2000,2000) radius 1500", "column at (c.left, 0) size 600x600"),
  },
  {
    name: "a datum of a room that could not be placed",
    code: "E_DATUM_UNPLACED",
    roots: ["E_DATUM_UNPLACED", "E_LAYOUT_REF"],
    src: plan("room id=c right-of nosuch size 3000 x 3000", "column at (c.left, 0) size 600x600"),
  },
  {
    name: "a component argument left out",
    code: "E_ARGCOUNT",
    roots: ["E_ARGCOUNT"],
    src: plan("component cell(w, d) {", "  room id=r at (0,0) size w x d", "}", "place cell(4000) as c1 at (0,0)"),
  },
];

// ---- the guard: the sites, read off the code -------------------------------------------------

/** A line that yields the error value (or the stack budget's stand-in, which the resolver reads
 *  as it), or counts a statement as having read it. */
const YIELDS =
  /\breturn\s+(?:POISON|REFUSED|BUDGET_SUBSTITUTE)\b|(?:\?\?|[?:])\s*\(?\s*(?:POISON|REFUSED|BUDGET_SUBSTITUTE)\b|\bpoisonHits\+\+/;
const TAG = "// error value:";

interface Site {
  at: string;
  tag: string | undefined;
}

/** Every yielding site under `src/`, with its tag: on its line, or in the comments (and yielding
 *  lines) directly above it. */
function sites(): Site[] {
  const out: Site[] = [];
  for (const file of walkFiles("src", (n) => n.endsWith(".ts")).map((f) => f.replaceAll("\\", "/"))) {
    const lines = readFileSync(file, "utf8").split("\n");
    const code = (l: string): string => {
      const t = l.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
      const k = l.indexOf("//");
      return k >= 0 ? l.slice(0, k) : l;
    };
    lines.forEach((line, i) => {
      if (!YIELDS.test(code(line))) return;
      let tag = line.includes(TAG) ? line.slice(line.indexOf(TAG) + TAG.length) : undefined;
      for (let j = i - 1; tag === undefined && j >= 0; j--) {
        const above = lines[j]!;
        const isComment = above.trim().startsWith("//");
        if (!isComment && !YIELDS.test(code(above))) break;
        if (above.includes(TAG)) tag = above.slice(above.indexOf(TAG) + TAG.length);
      }
      out.push({ at: `${file}:${i + 1}`, tag });
    });
  }
  return out;
}

const codesIn = (text: string): string[] => [...text.matchAll(/\bE_[A-Z0-9_]+\b/g)].map((m) => m[0]);
const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

describe("AF3: every site that yields the error value names the error it reported", () => {
  const all = sites();

  it("finds the sites, and every one is tagged", () => {
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((s) => s.tag === undefined).map((s) => s.at)).toEqual([]);
  });

  it("a tagged code has a source row, and a source row exercises a tagged code", () => {
    const tagged = sorted(all.flatMap((s) => codesIn(s.tag ?? "")));
    const rows = sorted([...SOURCES, ...CONTEXTS].map((s) => s.code));
    expect(rows).toEqual(tagged);
  });

  it("the built-in site names every error a built-in raises", () => {
    const site = all.find((s) => s.tag?.includes("src/builtins.ts"));
    expect(site).toBeDefined();
    const raised = sorted(codesIn(readFileSync("src/builtins.ts", "utf8")));
    expect(raised.filter((c) => !codesIn(site!.tag!).includes(c))).toEqual([]);
  });
});

// ---- the laws ----------------------------------------------------------------------------------

/** Up to this many numbers per example are swapped, one plan each, spread over the file. */
const PER_EXAMPLE = 8;

/** The example with its `k`-th spread number (or a size's first number) written as a source. */
function mutants(src: string): ((s: Source) => string)[] {
  const nums = lex(src).tokens.filter((t) => t.type === "number" || t.type === "dimension");
  const picks = [
    ...new Set(Array.from({ length: PER_EXAMPLE }, (_, k) => Math.floor((k * nums.length) / PER_EXAMPLE))),
  ];
  const open = /\bplan\s+"[^"]*"\s*\{/.exec(src);
  return picks
    .filter((i) => i < nums.length)
    .map((i) => {
      const t = nums[i]!;
      const tail = t.type === "dimension" ? `x${String(t.num2)}` : "";
      return (s: Source) => {
        const swapped = `${src.slice(0, t.start)}(${s.text})${tail}${src.slice(t.end)}`;
        if (s.prelude === undefined || !open || open.index + open[0].length > t.start) return swapped;
        const at = open.index + open[0].length;
        return `${swapped.slice(0, at)}\n  ${s.prelude}${swapped.slice(at)}`;
      };
    });
}

/** The codes of `after` that `before` does not hold (a multiset difference). */
function gained(before: readonly string[], after: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const c of before) left.set(c, (left.get(c) ?? 0) + 1);
  return after.filter((c) => {
    const n = left.get(c) ?? 0;
    if (n === 0) return true;
    left.set(c, n - 1);
    return false;
  });
}

describe("AF3: the error value is held only by a plan that already fails", () => {
  it("holds over the corpus, the hand-broken plans included", () => {
    const broken: string[] = [];
    for (const file of corpusFiles({ dirs: [...CORPUS_DIRS, "test/defect-corpus"] })) {
      const { errors, dropped } = observe(readFileSync(file, "utf8"), worldFor(dirname(file)));
      if (errors.length === 0 && dropped.length > 0) broken.push(`${file}: dropped ${dropped.join(", ")}`);
    }
    expect(broken).toEqual([]);
  });

  it("holds over the examples with a number swapped for each source, with no follow-on diagnostic", () => {
    const broken: string[] = [];
    const followOn: string[] = [];
    const seen = new Map<string, number>(SOURCES.map((s) => [s.name, 0]));
    let n = 0;
    for (const file of examples()) {
      const world = worldFor(dirname(file));
      const text = readFileSync(file, "utf8");
      const base = observe(text, world).codes;
      for (const make of mutants(text)) {
        const s = SOURCES[n++ % SOURCES.length]!;
        const { codes, errors, dropped } = observe(make(s), world);
        if (dropped.length === 0) continue;
        seen.set(s.name, seen.get(s.name)! + 1);
        if (errors.length === 0) broken.push(`${file} with ${s.name}: dropped ${dropped.join(", ")}`);
        const extra = gained(base, codes).filter((c) => c !== s.code && !s.also?.includes(c));
        if (extra.length > 0) followOn.push(`${file} with ${s.name}: ${sorted(extra).join(", ")}`);
      }
    }
    expect(broken).toEqual([]);
    expect(followOn).toEqual([]);
    // Not vacuous: every source dropped an element in some plan, and the observer saw it.
    expect([...seen].filter(([, k]) => k === 0).map(([name]) => name)).toEqual([]);
  });

  it.each(CONTEXTS.map((c) => [c.name, c] as const))("holds for %s, with no follow-on diagnostic", (_, c) => {
    const { codes, dropped } = observe(c.src, worldFor("."));
    expect(dropped.length).toBeGreaterThan(0);
    expect(codes).toContain(c.code);
    expect(sorted(codes)).toEqual(sorted(c.roots));
  });
});
