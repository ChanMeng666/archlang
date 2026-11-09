/**
 * **The Plan JSON projector is a leaf.** `to-json.ts` turns a resolved plan into Plan JSON; it
 * must not load the validator (`from-json.ts`), which it reads nothing from. The parser stays only behind `analyze.ts`'s `resolvePlan` and `import.ts`, the projector's source-reading inputs (`src/ir.ts` imports no parser). A
 * stray import of a printer helper from `emit.ts` once pulled both in. Structural, with the
 * walk `describe-overlay-blind.test.ts` uses.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importRefs } from "./helpers/imports.js";

const SRC = resolve("src");

/** Every relative module a source file loads at runtime (type-only statements are erased). */
function runtimeImports(file: string, text: string = readFileSync(file, "utf8")): string[] {
  return importRefs(file, text)
    .filter((r) => !r.typeOnly && r.spec.startsWith("."))
    .map((r) => resolve(dirname(file), r.spec).replace(/\.js$/, ".ts"));
}

/** The modules `entry` loads, transitively. */
function closure(entry: string, skipExpanding: ReadonlySet<string> = new Set()): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (skipExpanding.has(f)) continue;
    for (const g of runtimeImports(f)) stack.push(g);
  }
  return seen;
}

describe("the Plan JSON projector is a leaf", () => {
  const mods = closure(resolve(SRC, "plan-json/to-json.ts"));

  it("the walk is not vacuous", () => {
    expect(mods.size).toBeGreaterThan(5);
    expect(mods.has(resolve(SRC, "plan-json/source-tokens.ts"))).toBe(true);
  });

  it("to-json.ts does not reach the validator", () => {
    expect(mods.has(resolve(SRC, "plan-json/from-json.ts"))).toBe(false);
  });

  it("the resolver (src/ir.ts) reaches the parser only through import.ts (it parses imported files)", () => {
    const parser = resolve(SRC, "parser.ts");
    const imp = resolve(SRC, "import.ts");
    expect(runtimeImports(resolve(SRC, "ir.ts"))).not.toContain(parser);
    expect(closure(resolve(SRC, "ir.ts")).has(imp)).toBe(true);
    expect(closure(resolve(SRC, "ir.ts"), new Set([imp])).has(parser)).toBe(false);
  });

  it("to-json.ts reaches the parser only through analyze.ts (resolvePlan, its input) and import.ts", () => {
    const parser = resolve(SRC, "parser.ts");
    const analyze = resolve(SRC, "analyze.ts");
    const imp = resolve(SRC, "import.ts");
    const direct = runtimeImports(resolve(SRC, "plan-json/to-json.ts"));
    expect(direct).not.toContain(parser);
    expect(direct).toContain(resolve(SRC, "ir.ts"));
    expect(mods.has(analyze)).toBe(true);
    expect(mods.has(imp)).toBe(true);
    expect(closure(resolve(SRC, "plan-json/to-json.ts"), new Set([analyze, imp])).has(parser)).toBe(false);
  });

  it("the walk can see the edge where it exists (emit.ts loads both)", () => {
    const emit = closure(resolve(SRC, "plan-json/emit.ts"));
    expect(emit.has(resolve(SRC, "plan-json/from-json.ts"))).toBe(true);
    expect(emit.has(resolve(SRC, "parser.ts"))).toBe(true);
  });
});
