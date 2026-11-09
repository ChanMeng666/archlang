/**
 * Every lint rule declares its soundness LAYER and the codes it may emit (ADR 0032).
 *
 * A diagnostic does not name the rule that raised it, so `LintRule.codes` is what maps a code to
 * its layer (`LINT_CODE_LAYERS`, returned by `lintWithCoverage()` beside the diagnostics). The
 * taste score caps on validity-layer warnings only, so a code missing from every rule, or
 * claimed by two, would silently cap (or not) on the wrong layer. This file holds:
 *
 *  1. the shape: every rule has a layer and a non-empty `codes`, and the `annotation` family is
 *     exactly the drafting layer;
 *  2. completeness from the SOURCE: every `code: "W_…"` literal a rule module raises belongs to
 *     exactly one rule's `codes` (scanned, never listed, so a new code is covered the day it
 *     lands), and no rule claims a code no module raises;
 *  3. completeness from the CORPUS: every warning each rule raises over the examples, the defect
 *     corpus and the taste corpus is in that rule's own `codes` (the per-rule fold), and every
 *     code `lint()` raises there has a layer;
 *  4. `lintWithCoverage()` hands back the map and leaves `lint()` untouched.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { LINT_CODE_LAYERS, LINT_RULES, lint, lintWithCoverage } from "../src/lint.js";
import { EXAMPLES_WORLD, EXAMPLE_FILES, lintByRule, SHIPPED_EXAMPLES } from "./helpers/d4-oracle.js";

const RULES_DIR = resolvePath("src/lint/rules");

/** Every `.arch` under a folder, sorted, as [relative name, source]. */
function archFiles(dir: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".arch")) out.push([p.replace(/\\/g, "/"), readFileSync(p, "utf8")]);
    }
  };
  walk(resolvePath(dir));
  return out;
}

const CORPUS: Array<[string, string]> = [
  ...SHIPPED_EXAMPLES.map((rel): [string, string] => [`examples/${rel}`, EXAMPLE_FILES[rel]!]),
  ...archFiles("test/defect-corpus"),
  ...archFiles("test/taste-corpus"),
];

describe("lint rule layers: the shape", () => {
  it("every rule declares a layer and a non-empty list of W_ codes", () => {
    expect(LINT_RULES.length).toBeGreaterThan(30);
    for (const r of LINT_RULES) {
      expect(["validity", "drafting"], r.name).toContain(r.layer);
      expect(r.codes.length, r.name).toBeGreaterThan(0);
      for (const c of r.codes) expect(c, r.name).toMatch(/^W_[A-Z_]+$/);
    }
  });

  it("the annotation family is exactly the drafting layer", () => {
    for (const r of LINT_RULES) expect(r.layer === "drafting", r.name).toBe(r.family === "annotation");
    expect(LINT_RULES.filter((r) => r.layer === "drafting").length).toBeGreaterThan(0);
  });
});

describe("lint rule layers: every code belongs to exactly one rule", () => {
  // The codes the rule modules raise, read from the source.
  const raised = new Set<string>();
  for (const f of readdirSync(RULES_DIR).filter((x) => x.endsWith(".ts"))) {
    for (const m of readFileSync(join(RULES_DIR, f), "utf8").matchAll(/code: "(W_[A-Z_]+)"/g)) raised.add(m[1]!);
  }

  it("scans a non-empty set (the guard is not vacuous)", () => {
    expect(raised.size).toBeGreaterThan(40);
    expect(raised.has("W_DIM_INSIDE")).toBe(true);
  });

  it("each raised code is claimed by exactly one rule, and each claimed code is raised", () => {
    const owners = new Map<string, string[]>();
    for (const r of LINT_RULES) for (const c of r.codes) owners.set(c, [...(owners.get(c) ?? []), r.name]);
    const unowned = [...raised].filter((c) => !owners.has(c));
    const shared = [...owners].filter(([, o]) => o.length !== 1).map(([c, o]) => `${c}: ${o.join(", ")}`);
    const phantom = [...owners.keys()].filter((c) => !raised.has(c));
    expect(unowned, "a code no rule declares in its `codes`").toEqual([]);
    expect(shared, "a code two rules declare").toEqual([]);
    expect(phantom, "a declared code no rule module raises").toEqual([]);
  });

  it("LINT_CODE_LAYERS is each code's rule's layer", () => {
    for (const r of LINT_RULES) for (const c of r.codes) expect(LINT_CODE_LAYERS[c]).toBe(r.layer);
    expect(Object.keys(LINT_CODE_LAYERS).sort()).toEqual([...raised].sort());
  });
});

describe("lint rule layers: the corpus agrees with the declarations", () => {
  it("covers the examples and both corpora", () => {
    expect(CORPUS.filter(([n]) => n.startsWith("examples/")).length).toBeGreaterThan(30);
    expect(CORPUS.filter(([n]) => n.includes("defect-corpus")).length).toBeGreaterThan(100);
    expect(CORPUS.filter(([n]) => n.includes("taste-corpus")).length).toBeGreaterThan(0);
  });

  it("every warning a rule raises is in its own `codes`, and every lint() code has a layer", () => {
    const strays: string[] = [];
    let seen = 0;
    for (const [name, src] of CORPUS) {
      const { ir, levels } = resolvePlan(src, { world: EXAMPLES_WORLD });
      if (!ir) continue;
      for (const storey of levels.length > 0 ? levels.map((l) => l.ir) : [ir]) {
        for (const { name: rule, diags } of lintByRule(storey)) {
          const def = LINT_RULES.find((r) => r.name === rule)!;
          for (const d of diags) {
            seen++;
            if (!def.codes.includes(d.code ?? "")) strays.push(`${name}: ${rule} raised ${d.code}`);
          }
        }
      }
      for (const d of lint(src, { world: EXAMPLES_WORLD }))
        if (LINT_CODE_LAYERS[d.code ?? ""] === undefined) strays.push(`${name}: lint() raised ${d.code} with no layer`);
    }
    expect(seen).toBeGreaterThan(100);
    expect(strays).toEqual([]);
  }, 300_000);
});

describe("lintWithCoverage() returns the layers beside the diagnostics", () => {
  it("the map is LINT_CODE_LAYERS and the diagnostics are lint()'s", () => {
    const src = EXAMPLE_FILES["furnished-flat.arch"]!;
    const out = lintWithCoverage(src);
    expect(out.layers).toBe(LINT_CODE_LAYERS);
    expect(out.diagnostics).toEqual(lint(src));
    expect(lintWithCoverage(`plan "x" { room id=a at (0,0) size 1x }`).layers).toBe(LINT_CODE_LAYERS);
  });
});
