/**
 * **`describe()` and `lint()` never learn the view exists.** The one permanent constraint
 * on this feature, and the reason it is a picture rather than a surface.
 *
 * The design that proposed the axonometric wrote the rule down before a line
 * of it was built: *it is illustrative only, forever — a marketing render, never a measured
 * surface; `describe()` must not learn it exists.* Everything else about the view can be
 * revised; that cannot, because the moment a derived number is read off a projection, an
 * agent has a measurement whose provenance is a drawing convention.
 *
 * The check is **structural first, behavioural second**, and the order matters. A
 * behavioural check ("the JSON is the same") is a statement about today's code; a grep for
 * the import is a statement about what the module is even able to do. The first would go
 * green again the moment someone read a view number and happened not to expose it yet.
 *
 * `test/iso-byte-identity.test.ts` carries the behavioural half over the shipped corpus.
 * This file carries the structural half, plus the type-level one: `DescribeOptions` and
 * `LintOptions` must not so much as ADMIT a `view`, so the mistake cannot be made by
 * passing an option.
 */

import { readFileSync } from "node:fs";
import { dirname, relative, resolve as resolvePath, sep } from "node:path";
import ts from "typescript";
import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";

/** Every relative module a source file loads at runtime (type-only statements are erased). */
function runtimeImports(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
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
  return out.filter((s) => s.startsWith(".")).map((s) => resolvePath(dirname(file), s).replace(/\.js$/, ".ts"));
}

/** The modules the entries load, transitively. */
function closure(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const g of runtimeImports(f)) stack.push(g);
  }
  return seen;
}

/** Every module the two summary surfaces load: the runtime import closure of `describe()` and
 *  of `lint()`, so a module added under either is scanned without anyone listing it. */
const SUMMARY_MODULES = [...closure([resolvePath("src/describe.ts"), resolvePath("src/lint.ts")])]
  .map((f) => relative(process.cwd(), f).split(sep).join("/"))
  .sort();

/** How many modules the hand-written list this walk replaced named. */
const OLD_LIST_LENGTH = 19;

/** A type-position `import("…")` is erased, so it is a name, not a load: `Scene.view` is typed
 *  `ViewName` and no code under `describe()`/`lint()` reads it. Listed by module, exact text. */
const TYPE_ONLY_VIEW_REFERENCE = new Map<string, string[]>([["src/scene.ts", ['import("./view/camera.js"']]]);

/** Any import that reaches the view layer, however it is spelled. */
const VIEW_IMPORT = /from\s+["'][^"']*\bview\/[^"']*["']|import\s*\(\s*["'][^"']*\bview\/[^"']*["']/g;

suite("describe()/lint() are blind to the axonometric", () => {
  it("the walk is not vacuous: it reaches the plan-json modules and outgrows the old hand list", () => {
    expect(SUMMARY_MODULES.length).toBeGreaterThan(OLD_LIST_LENGTH);
    expect(SUMMARY_MODULES.filter((m) => m.startsWith("src/plan-json/")).length).toBeGreaterThanOrEqual(8);
  });

  it("the module list is real — a grep over missing files passes vacuously", () => {
    for (const m of SUMMARY_MODULES) expect(readFileSync(resolvePath(m), "utf8").length).toBeGreaterThan(0);
  });

  for (const m of SUMMARY_MODULES) {
    it(`${m} imports nothing from src/view/`, () => {
      const hits = [...readFileSync(resolvePath(m), "utf8").matchAll(VIEW_IMPORT)].map((h) => h[0]);
      expect(hits.filter((h) => !(TYPE_ONLY_VIEW_REFERENCE.get(m) ?? []).includes(h))).toEqual([]);
    });
  }

  it("the one allowed reference is a type (erased), so it loads nothing at runtime", () => {
    expect(runtimeImports(resolvePath("src/scene.ts"))).not.toContain(resolvePath("src/view/camera.ts"));
    expect(readFileSync(resolvePath("src/scene.ts"), "utf8")).toMatch(
      /view\?: import\("\.\/view\/camera\.js"\)\.ViewName;/,
    );
  });

  it("catches a planted import — the pattern is not inert", () => {
    const planted = 'import { cameraFor } from "./view/camera.js";';
    expect([...planted.matchAll(VIEW_IMPORT)].map((h) => h[0])).toEqual(['from "./view/camera.js"']);
  });

  it("`describe()`'s options do not ADMIT a view — the mistake is unavailable, not merely unmade", () => {
    const src = readFileSync(resolvePath("src/describe.ts"), "utf8");
    // The interface is the contract an embedder reads. A `view` key here would be an
    // invitation regardless of whether anything consumed it.
    const opts = src.slice(src.indexOf("export interface DescribeOptions"));
    expect(opts.slice(0, opts.indexOf("}"))).not.toMatch(/\bview\b/);
  });

  it("`describe()` returns the same JSON for a plan whose picture was drawn in between", () => {
    const src = readFileSync(resolvePath("examples/studio.arch"), "utf8");
    const before = JSON.stringify(describePlan(src));
    compile(src, { view: "iso", noCache: true });
    compile(src, { view: "axon", noCache: true });
    expect(JSON.stringify(describePlan(src))).toBe(before);
  });

  it("`lint()` does too", () => {
    const src = readFileSync(resolvePath("examples/hillside-villa.arch"), "utf8");
    const world = {
      read: (p: string): string | null => {
        try {
          return readFileSync(resolvePath("examples", p), "utf8");
        } catch {
          return null;
        }
      },
      now: (): Date => new Date(0),
    };
    const before = JSON.stringify(lint(src, { world }));
    compile(src, { view: "iso", world, noCache: true });
    expect(JSON.stringify(lint(src, { world }))).toBe(before);
  });

  it("no `describe()` key mentions the view, and no diagnostic code does either", () => {
    const src = readFileSync(resolvePath("examples/two-storey.arch"), "utf8");
    expect(JSON.stringify(describePlan(src))).not.toMatch(/"(view|iso|axon|axonometric)"/);
    expect(
      lint(src)
        .map((d) => d.code ?? "")
        .filter((c) => /VIEW|ISO|AXON/.test(c)),
    ).toEqual([]);
  });
});
