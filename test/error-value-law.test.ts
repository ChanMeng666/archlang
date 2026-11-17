/**
 * The AF3 law: the error value (`POISON`, `src/expr.ts`) is held only by a plan that already
 * fails. Every source of it raises an error-severity diagnostic as it yields it, so a plan
 * with no error diagnostic never has an element dropped for reading it, and no plan that
 * compiles can change. Read over the whole corpus (`docs/testing.md` § 5, the hand-broken
 * defect corpus included) and over the examples with one number swapped, in turn, for each
 * source of the error value; every source must drop something somewhere, so the law is not
 * read off an observer that sees nothing.
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
import { CORPUS_DIRS, corpusFiles, examples } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

/** A source's error diagnostics, and the ids every storey dropped for reading the error value. */
function observe(src: string, world: World): { errors: string[]; dropped: string[] } {
  const errors = compile(src, { world, noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code} ${d.message}`);
  const { plan } = parse(src, BUILTIN_REGISTRY);
  if (!plan) return { errors, dropped: [] };
  const r = resolveAll(link(plan, world, BUILTIN_REGISTRY).plan, BUILTIN_REGISTRY, world);
  const irs = r.levels.length > 0 ? r.levels.map((l) => l.ir) : [r.ir];
  return { errors, dropped: irs.flatMap((ir) => [...droppedForErrorValue(ir)]) };
}

/** Each source of the error value, written where a number stands. */
const SOURCES: readonly [name: string, text: string][] = [
  ["an unknown name", "nosuch_name"],
  ["an unknown function", "nosuch_fn(1)"],
  ["a string in arithmetic", `"s" + 1`],
  ["a string where a number is read", `"s"`],
  ["a boolean where a number is read", "true"],
  ["a division by zero", "1 / 0"],
  ["a modulo by zero", "1 % 0"],
  ["an index out of range", "[1][4]"],
  ["a built-in's domain", "sqrt(0 - 1)"],
  ["a built-in's arity", "min()"],
  ["a non-finite result", Array(30).fill("99999999999").join(" * ")],
  ["a refused datum", "nosuch_room.top"],
  ["an undeclared axis", "axis.ZZ"],
];

/** Up to this many numbers per example are swapped, one plan each, spread over the file. */
const PER_EXAMPLE = 8;

/** The example with its `k`-th spread number (or a size's first number) written as `text`. */
function mutants(src: string): ((text: string) => string)[] {
  const nums = lex(src).tokens.filter((t) => t.type === "number" || t.type === "dimension");
  const picks = [
    ...new Set(Array.from({ length: PER_EXAMPLE }, (_, k) => Math.floor((k * nums.length) / PER_EXAMPLE))),
  ];
  return picks
    .filter((i) => i < nums.length)
    .map((i) => {
      const t = nums[i]!;
      const tail = t.type === "dimension" ? `x${String(t.num2)}` : "";
      return (text: string) => `${src.slice(0, t.start)}(${text})${tail}${src.slice(t.end)}`;
    });
}

describe("AF3: a plan with no error diagnostic never drops an element for the error value", () => {
  it("holds over the corpus, the hand-broken plans included", () => {
    const broken: string[] = [];
    for (const file of corpusFiles({ dirs: [...CORPUS_DIRS, "test/defect-corpus"] })) {
      const { errors, dropped } = observe(readFileSync(file, "utf8"), worldFor(dirname(file)));
      if (errors.length === 0 && dropped.length > 0) broken.push(`${file}: dropped ${dropped.join(", ")}`);
    }
    expect(broken).toEqual([]);
  });

  it("holds over the examples with a number swapped for each source of the error value", () => {
    const broken: string[] = [];
    const seen = new Map<string, number>(SOURCES.map(([name]) => [name, 0]));
    let n = 0;
    for (const file of examples()) {
      const world = worldFor(dirname(file));
      for (const make of mutants(readFileSync(file, "utf8"))) {
        const [name, text] = SOURCES[n++ % SOURCES.length]!;
        const { errors, dropped } = observe(make(text), world);
        if (dropped.length > 0) seen.set(name, seen.get(name)! + 1);
        if (errors.length === 0 && dropped.length > 0)
          broken.push(`${file} with ${name}: dropped ${dropped.join(", ")}`);
      }
    }
    expect(broken).toEqual([]);
    // Not vacuous: every source dropped an element in some plan, and the observer saw it.
    expect([...seen].filter(([, k]) => k === 0).map(([name]) => name)).toEqual([]);
  });
});
