/**
 * Laws L1 and L2 of the taste layer (ADR 0032; design §5): **taste is invisible** and **taste
 * draws nothing**.
 *
 * - L1 · After `taste()` has run on every example and every corpus file under every profile IN
 *   THIS PROCESS (so a mutated parse/resolve memo would leak into what follows), every
 *   example's SVG + `describe()` + `lint()` digest still equals the pinned byte-identity baseline
 *   (`./byte-identity-baseline.ts`), and every corpus file's payload equals the one taken before
 *   taste ran. And `describe()` and `lint()` import nothing from `src/taste/`, directly or
 *   through any module they load (an import-graph walk, like `algebra-leaf.test.ts`).
 * - L2 · `compile()` output is part of that payload (every storey's SVG), so taste drew nothing.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, TASTE_PROFILE_NAMES, taste } from "../src/index.js";
import { AUTHORS_HEIGHT, BASELINE, SEMANTIC_BASELINE } from "./byte-identity-baseline.js";
import { type CompilerApi, allStoreysDigestWith, semanticDigestWith } from "./helpers/byte-identity-digest.js";
import { heightFreeSource } from "./helpers/height-free-source.js";
import {
  DEFECT_SOURCES,
  EXAMPLE_SOURCES,
  TASTE_CORPUS_SOURCES,
  TASTE_SOURCES,
  TASTE_WORLD,
} from "./helpers/taste-sources.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const opts = { world: TASTE_WORLD };

/** The text a baseline row is measured on (the height-free derivation for a plan that authors heights). */
const authorsHeight = new Set(AUTHORS_HEIGHT);
const measuredText = (name: string): string => {
  const src = EXAMPLE_SOURCES.find((s) => s.name === `examples/${name}.arch`)!.src;
  return authorsHeight.has(name) ? heightFreeSource(src) : src;
};

describe("L1/L2 · taste is invisible and draws nothing", () => {
  // The corpus files' payloads BEFORE taste runs (this also warms the memos taste will read).
  const corpus = [...DEFECT_SOURCES, ...TASTE_CORPUS_SOURCES];
  const before = new Map(corpus.map((s) => [s.name, allStoreysDigestWith(API, s.src, opts)]));
  let tasted = 0;
  for (const profile of TASTE_PROFILE_NAMES)
    for (const s of TASTE_SOURCES) {
      taste(s.src, { profile, world: TASTE_WORLD });
      tasted++;
    }

  it("taste ran over the whole corpus first (the law is not vacuous)", () => {
    expect(tasted).toBe(TASTE_SOURCES.length * TASTE_PROFILE_NAMES.length);
    expect(BASELINE.length).toBe(EXAMPLE_SOURCES.length);
  });

  for (const [name, sha] of BASELINE) {
    it(`examples/${name}.arch: every storey's SVG, describe() and lint() equal the pinned baseline`, () => {
      expect(allStoreysDigestWith(API, measuredText(name), opts)).toBe(sha);
    });
  }
  for (const [name, sha] of SEMANTIC_BASELINE) {
    it(`examples/${name}.arch: describe() and lint() equal the pinned semantic baseline`, () => {
      expect(semanticDigestWith(API, measuredText(name), opts)).toBe(sha);
    });
  }

  it("every corpus file's payload is the one taken before taste ran", () => {
    const moved = corpus.filter((s) => allStoreysDigestWith(API, s.src, opts) !== before.get(s.name));
    expect(corpus.length).toBeGreaterThan(100);
    expect(moved.map((s) => s.name)).toEqual([]);
  }, 300_000);
});

// ---------------------------------------------------------------------------
// The import graph: describe() and lint() never load the taste module.
// ---------------------------------------------------------------------------

const SRC = resolve("src");

/** Every relative module a source file loads at runtime (type-only statements are erased). */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause?.isTypeOnly !== true) out.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) out.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = node.arguments[0];
      if (a && ts.isStringLiteral(a)) out.push(a.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.filter((s) => s.startsWith(".")).map((s) => resolve(dirname(file), s).replace(/\.js$/, ".ts"));
}

/** The modules `entry` loads, transitively. */
function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const g of runtimeImports(f)) stack.push(g);
  }
  return seen;
}

describe("L1 · describe() and lint() import nothing from src/taste/", () => {
  const TASTE = resolve(SRC, "taste");
  for (const entry of ["describe.ts", "lint.ts"]) {
    it(`src/${entry} never loads a src/taste/ module`, () => {
      const mods = closure(resolve(SRC, entry));
      expect(mods.size).toBeGreaterThan(20); // the walk followed the graph
      expect([...mods].filter((m) => m.startsWith(TASTE))).toEqual([]);
    });
  }

  it("the walk can see a taste import (the guard is not vacuous)", () => {
    const mods = closure(resolve(SRC, "index.ts"));
    expect([...mods].some((m) => m.startsWith(TASTE))).toBe(true);
  });
});
