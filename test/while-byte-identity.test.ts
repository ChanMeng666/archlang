/**
 * M3 of the W7 red-team verdict: the byte-identity law for **`compile().diagnostics`
 * itself**, over every shipped example (every storey) plus every `test/fixtures/*.arch`.
 *
 * Every other new-language-form law in this repository pins SVG + `describe()` +
 * `lint()`, which is exactly the set `docs/agents/iron-laws.md` says "carries no parse-
 * or resolve-stage diagnostic" — and `W_WHILE_DEPRECATED`/`W_REASSIGN_DEPRECATED`
 * (`src/while-deprecation.ts`) are raised at PARSE. A plan using neither `while` nor a
 * bare reassignment must get no new diagnostic at all, not merely an unchanged drawing
 * and summary — this is the law those other digests cannot state.
 *
 * See `test/while-byte-identity-baseline.ts` for how the baseline was measured.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { World } from "../src/world.js";
import { BASELINE } from "./while-byte-identity-baseline.js";
import { allStoreysDigestWithDiagnostics, type CompilerApi } from "./byte-identity-digest.js";

const API: CompilerApi = { compile, describe: describePlan, lint };
const EXAMPLES = resolvePath("examples");
const FIXTURES = resolvePath("test/fixtures");

/** A World that reads the given directory, so the examples that `import` (`imports.arch`,
 *  `museum-wings.arch`) are covered rather than silently skipped. */
function worldFor(dir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolvePath(dir, p), "utf8");
      } catch {
        return null;
      }
    },
    now: () => new Date(0),
  };
}

const shippedExamples = (): string[] =>
  readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".arch"))
    .map((f) => `examples/${f}`)
    .sort();

const fixtureFiles = (): string[] =>
  readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".arch"))
    .map((f) => `test/fixtures/${f}`)
    .sort();

/** `"examples/x.arch"` -> the file's absolute path and the World its own directory needs
 *  (so a plan that `import`s a sibling file resolves it). */
function locate(name: string): { path: string; world: World } {
  if (name.startsWith("examples/"))
    return { path: join(EXAMPLES, name.slice("examples/".length)), world: worldFor(EXAMPLES) };
  return { path: join(FIXTURES, name.slice("test/fixtures/".length)), world: worldFor(FIXTURES) };
}

suite("W7 byte-identity — compile().diagnostics over the whole corpus", () => {
  it("covers every shipped example and every fixture — the corpus cannot silently shrink", () => {
    const corpus = [...shippedExamples(), ...fixtureFiles()].sort();
    expect(BASELINE.map(([n]) => n).sort()).toEqual(corpus);
  });

  it.each(BASELINE)("digest unchanged: %s", (name, hash) => {
    const { path, world } = locate(name);
    const src = readFileSync(path, "utf8");
    expect(allStoreysDigestWithDiagnostics(API, src, { world })).toBe(hash);
  });

  it("no example or fixture gets W_WHILE_DEPRECATED or W_REASSIGN_DEPRECATED (none uses either form)", () => {
    for (const [name] of BASELINE) {
      const { path, world } = locate(name);
      const src = readFileSync(path, "utf8");
      const codes = compile(src, { noCache: true, world }).diagnostics.map((d) => d.code);
      expect(codes, name).not.toContain("W_WHILE_DEPRECATED");
      expect(codes, name).not.toContain("W_REASSIGN_DEPRECATED");
    }
  });

  it("is not vacuous: a planted `while` moves the digest (proves the sweep can fail)", () => {
    const untouched = 'plan "X" {\n  units mm\n  room at (0,0) size 3000x3000\n}\n';
    const planted =
      'plan "X" {\n  units mm\n  let i = 0\n  while i < 2 {\n    i = i + 1\n  }\n  room at (0,0) size 3000x3000\n}\n';
    expect(allStoreysDigestWithDiagnostics(API, planted)).not.toBe(allStoreysDigestWithDiagnostics(API, untouched));
  });
});
