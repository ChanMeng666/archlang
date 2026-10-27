import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

/**
 * The public surface must be CLOSED — every type you can reach from a value we
 * export must itself be nameable from `src/index.ts`.
 *
 * `describe()` is the agent-facing facts channel, so `SceneSummary` is the type a
 * TypeScript consumer actually writes down: `function check(s: SceneSummary)`,
 * `const g: AccessGraph = s.access`, `s.access.rooms.map((r: AccessRoomNode) => …)`.
 * A field whose type has no export is readable but unnameable — you can consume the
 * value and never annotate it, wrap it, or narrow it in a signature.
 *
 * Five such holes shipped (`OpeningSummary`, `InstanceSummary`, `AccessGraph`,
 * `AccessRoomNode`, `AccessEdge`) plus two this guard found on first run (`DoorKind`,
 * `RelatedSpan`). They were invisible because nothing in the repo consumes the package
 * the way a downstream package does: inside `src/`, every module imports from its
 * neighbour's real path, so `index.ts` being incomplete costs nothing here.
 *
 * The requirement list is **derived, never retyped** (the repo's generator doctrine
 * applied to a test): the TypeScript compiler walks `SceneSummary`'s declaration, follows
 * every type reference transitively into whatever `src/` module declares it, and the set
 * that walk returns IS the list. Add a field to `SceneSummary` whose type lives in an
 * unexported module and this test goes red with no edit to it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SRC = resolve(REPO, "src").replace(/\\/g, "/");
const INDEX = resolve(SRC, "index.ts");
const DESCRIBE = resolve(SRC, "describe.ts");

/**
 * The resolved-plan seam a downstream consumer reads (ADR 0031): each value and the module
 * that declares it. Only these four are walked; the types they reach are DERIVED below.
 */
const SEAM_VALUES: ReadonlyArray<readonly [name: string, module: string]> = [
  ["resolvePlan", "analyze.ts"],
  ["joinWallSet", "wall-lowering.ts"],
  ["loopsToPolygons", "geometry/joinery.ts"],
  ["doorSwing", "geometry.ts"],
  ["doorLeaves", "geometry.ts"],
];

/**
 * The element type names `ResolvedElement` carries that no exported signature reaches
 * (ADR 0031 decision 3). A named list, because a union member is not a signature: these are
 * what a consumer writes instead of `Extract<ResolvedElement, { kind: "stair" }>`.
 */
const ELEMENT_TYPE_NAMES = ["ROpening", "RStair", "RElevator", "REscalator", "RRoof", "RVoid", "ROutdoor", "RFence"];

/** The compiler options the repo actually builds `src/` with — read, not restated. */
function compilerOptions(): ts.CompilerOptions {
  const configPath = resolve(REPO, "tsconfig.json");
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(raw.error, "tsconfig.json must parse").toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, REPO, undefined, configPath);
  return { ...parsed.options, noEmit: true, skipLibCheck: true };
}

interface OwnedType {
  name: string;
  decl: ts.Declaration;
  file: string;
}

/**
 * The interface/alias/enum declaration a type-reference identifier resolves to — but only
 * when WE declare it. Lib types (`Record`, `Array`, `Partial`, …) and anything outside
 * `src/` return null here, which is the whole filter: they have no declaration in the
 * source tree we own, so there is nothing for `index.ts` to export.
 */
function ownedNamedType(checker: ts.TypeChecker, id: ts.Identifier): OwnedType | null {
  let sym = checker.getSymbolAtLocation(id);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  const decl = (sym?.declarations ?? []).find(
    (d) => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d) || ts.isEnumDeclaration(d),
  );
  if (!sym || !decl) return null;
  const file = decl.getSourceFile().fileName.replace(/\\/g, "/");
  if (!file.startsWith(`${SRC}/`) || file.includes("/node_modules/")) return null;
  return { name: sym.getName(), decl, file };
}

/**
 * Every named type declared under `src/` that is transitively reachable from `roots`, as
 * `name -> declaring file`. Breadth-first over type-reference nodes. A name in `stopAt` is
 * recorded but not expanded: the frontier walk of a function signature stops where the root
 * already gives the consumer a name, so a pre-existing hole behind an exported type is not
 * charged to the function that reaches it.
 */
function reachableNamedTypes(
  checker: ts.TypeChecker,
  roots: readonly ts.Node[],
  stopAt: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const found = new Map<string, string>();
  const queue: ts.Node[] = [...roots];
  const visited = new Set<ts.Node>(roots);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node)) {
        const nameNode = node.typeName;
        const id = ts.isIdentifier(nameNode) ? nameNode : nameNode.right;
        const hit = ownedNamedType(checker, id);
        if (hit) {
          if (!found.has(hit.name)) found.set(hit.name, relative(REPO, hit.file).replace(/\\/g, "/"));
          if (!visited.has(hit.decl) && !stopAt.has(hit.name)) {
            visited.add(hit.decl);
            queue.push(hit.decl);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    if (roots.includes(current) && !ts.isInterfaceDeclaration(current) && !ts.isTypeAliasDeclaration(current)) {
      visit(current);
    } else {
      ts.forEachChild(current, visit);
    }
  }
  return found;
}

/**
 * The type-bearing parts of an exported function's SIGNATURE — type parameters (their
 * constraints carry `W extends JoinableWall`), parameters and the return type — never its
 * body, whose local types are no part of what a caller writes down. A `const f = (…): T => …`
 * contributes its annotation or its arrow function's parameters and return type.
 */
function signatureNodes(decl: ts.Declaration): ts.Node[] {
  const of = (fn: ts.SignatureDeclarationBase): ts.Node[] => [
    ...(fn.typeParameters ?? []),
    ...fn.parameters,
    ...(fn.type ? [fn.type] : []),
  ];
  if (ts.isFunctionDeclaration(decl)) return of(decl);
  if (ts.isVariableDeclaration(decl)) {
    if (decl.type) return [decl.type];
    const init = decl.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return of(init);
  }
  return [];
}

describe("the public type surface is closed", () => {
  const program = ts.createProgram(
    [INDEX, DESCRIBE, ...SEAM_VALUES.map(([, m]) => resolve(SRC, m))],
    compilerOptions(),
  );
  const checker = program.getTypeChecker();

  const describeFile = program.getSourceFile(DESCRIBE);
  const indexFile = program.getSourceFile(INDEX);

  it("finds the two source files the surface is defined by", () => {
    expect(describeFile, "src/describe.ts must be in the program").toBeDefined();
    expect(indexFile, "src/index.ts must be in the program").toBeDefined();
  });

  const sceneSummary = (() => {
    let hit: ts.InterfaceDeclaration | undefined;
    if (describeFile) {
      ts.forEachChild(describeFile, (n) => {
        if (ts.isInterfaceDeclaration(n) && n.name.text === "SceneSummary") hit = n;
      });
    }
    return hit;
  })();

  const exportedFromIndex = (() => {
    const names = new Set<string>();
    if (!indexFile) return names;
    const sym = checker.getSymbolAtLocation(indexFile);
    if (!sym) return names;
    for (const e of checker.getExportsOfModule(sym)) names.add(e.getName());
    return names;
  })();

  const reachable = sceneSummary ? reachableNamedTypes(checker, [sceneSummary]) : new Map();

  // ——— The machinery has to be doing real work before its verdict means anything. ———
  it("actually resolves SceneSummary and the index's exports", () => {
    expect(sceneSummary, "SceneSummary must be declared in src/describe.ts").toBeDefined();
    // A collapsed walk (0 or a handful of names) would pass the closure check vacuously.
    expect(reachable.size).toBeGreaterThan(20);
    // Likewise a failed module read would make every name "missing" — or, if the sets
    // were reversed, would make nothing missing.
    expect(exportedFromIndex.size).toBeGreaterThan(50);
    expect(exportedFromIndex.has("compile")).toBe(true);
  });

  it("walks TRANSITIVELY, not just SceneSummary's own fields", () => {
    // `AccessGraph` is one hop (`SceneSummary.access`); `AccessRoomNode` is two
    // (`AccessGraph.rooms`) and lives in a different module. Finding the second proves
    // the queue recurses across file boundaries — the exact depth at which three of the
    // original holes hid.
    expect([...reachable.keys()]).toContain("AccessGraph");
    expect(reachable.get("AccessRoomNode")).toBe("src/analyze.ts");
  });

  it("exports the LSP code-action surface: the quickfix pair and the separate refactor pair", () => {
    // `codeActions`/`CodeAction` keep their historical quickfix-only contract; the re-roll
    // refactor is its own additive pair, so an embedder can name both result types.
    for (const name of ["codeActions", "CodeAction", "refactorActions", "RefactorAction"]) {
      expect(exportedFromIndex.has(name), `${name} must be exported from src/index.ts`).toBe(true);
    }
  });

  it("exports every src/ type reachable from SceneSummary", () => {
    const missing = [...reachable.entries()]
      .filter(([name]) => !exportedFromIndex.has(name))
      .map(([name, file]) => `${name} (declared in ${file})`)
      .sort();
    expect(
      missing,
      "these types are reachable from describe()'s result but cannot be named by a consumer — " +
        "re-export them from src/index.ts, routed through the module that surfaces them",
    ).toEqual([]);
  });

  // ——— The resolved-plan seam (ADR 0031): the signatures of the values it exports. ———
  const seamDecl = (name: string, module: string): ts.Declaration | undefined => {
    const file = program.getSourceFile(resolve(SRC, module));
    let hit: ts.Declaration | undefined;
    if (!file) return hit;
    const visit = (n: ts.Node): void => {
      if (ts.isFunctionDeclaration(n) && n.name?.text === name) hit = n;
      else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) hit = n;
      else ts.forEachChild(n, visit);
    };
    ts.forEachChild(file, visit);
    return hit;
  };
  // Where the walk stops: an exported name inside the IR vocabulary `resolvePlan`'s own
  // signature reaches (`ResolvedPlan`, `RWall`, `CompileOptions`, …). That vocabulary's full
  // closure is a pre-existing hole ADR 0031 scopes out (it reaches the expression parser's
  // internals); every type the seam itself introduces (`JoinedCut`, `DoorLike`, `Edge`, …) is
  // walked through, so a field added to one of them later with an unexported type goes red.
  const resolvePlanDecl = seamDecl("resolvePlan", "analyze.ts");
  const irVocabulary = new Set(
    [...(resolvePlanDecl ? reachableNamedTypes(checker, signatureNodes(resolvePlanDecl)) : new Map()).keys()].filter(
      (n) => exportedFromIndex.has(n),
    ),
  );
  const seam = new Map(
    SEAM_VALUES.map(([name, module]) => {
      const decl = seamDecl(name, module);
      return [name, decl ? reachableNamedTypes(checker, signatureNodes(decl), irVocabulary) : null] as const;
    }),
  );

  it("walks each seam value's signature, through constraints and aliases", () => {
    for (const [name, module] of SEAM_VALUES) {
      expect(seam.get(name), `${name} must be declared in src/${module}`).toBeTruthy();
    }
    // Non-vacuous: `JoinableWall` is reached only through the constraint `W extends
    // JoinableWall`, `JoinedCut` one hop past the return type, `Arc` only through the `Edge`
    // alias, `DoorSwingDir` only through `DoorLike`'s fields.
    expect([...(seam.get("joinWallSet")?.keys() ?? [])]).toEqual(
      expect.arrayContaining(["JoinableWall", "JoinedWallSet", "JoinedCut"]),
    );
    expect(seam.get("loopsToPolygons")?.get("Arc")).toBe("src/geometry/arc.ts");
    expect(seam.get("doorSwing")?.get("DoorSwingDir")).toBe("src/grammar/tokens.ts");
    expect(seam.get("resolvePlan")?.has("AnalyzeOptions")).toBe(true);
    // And the stop set is the IR vocabulary, not empty and not the whole root.
    expect(irVocabulary.has("ResolvedPlan")).toBe(true);
    expect(irVocabulary.has("JoinedCut")).toBe(false);
  });

  it("exports the seam's values", () => {
    for (const [name] of SEAM_VALUES) {
      expect(typeof (core as Record<string, unknown>)[name], `${name} must be exported from src/index.ts`).toBe(
        "function",
      );
    }
  });

  it("exports every src/ type the seam's signatures reach", () => {
    const missing = [...seam.entries()]
      .flatMap(([fn, types]) =>
        [...(types ?? new Map<string, string>()).entries()]
          .filter(([name]) => !exportedFromIndex.has(name))
          .map(([name, file]) => `${name} (declared in ${file}, reached from ${fn})`),
      )
      .sort();
    expect(
      missing,
      "these types are reachable from an exported seam function's signature but cannot be named by a consumer",
    ).toEqual([]);
  });

  it("names every element type a downstream consumer switches on", () => {
    for (const name of ELEMENT_TYPE_NAMES) {
      expect(exportedFromIndex.has(name), `${name} must be exported from src/index.ts`).toBe(true);
    }
  });
});

/** Every `examples/**\/*.arch`, keyed by its path relative to `examples/`, as a whole-file
 *  `import` resolves it. */
function exampleFiles(): Record<string, string> {
  const root = resolve(REPO, "examples");
  const walk = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".arch") ? [p] : [];
      });
  return Object.fromEntries(walk(root).map((p) => [relative(root, p).replace(/\\/g, "/"), readFileSync(p, "utf8")]));
}

describe("resolvePlan from the package root keeps linked content", () => {
  // `resolveAll(compile(src).ast)` reads the UNLINKED tree and silently drops imported and
  // placed elements; `resolvePlan` is the complete path. Pinned against `describe()`, which
  // reads the same IR, never against an element count an example edit would move.
  const files = exampleFiles();
  const world = core.makeVirtualWorld(files);
  for (const name of ["imports.arch", "museum-wings.arch", "laneway-house.arch"]) {
    it(name, () => {
      const source = files[name];
      expect(source, `examples/${name} must exist`).toBeDefined();
      const { ir } = core.resolvePlan(source ?? "", { world });
      expect(ir, `${name} must resolve`).not.toBeNull();
      const summary = core.describe(source ?? "", { world });
      const kinds = (k: string): number => ir?.elements.filter((e) => e.kind === k).length ?? -1;
      expect(kinds("room")).toBe(summary.rooms.length);
      expect(kinds("furniture")).toBe(summary.furniture.length);
      expect(summary.rooms.length + summary.furniture.length).toBeGreaterThan(0);
    });
  }
});
