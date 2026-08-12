import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

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
 * Every named type declared under `src/` that is transitively reachable from `root`'s
 * declaration, as `name -> declaring file`. Breadth-first over type-reference nodes.
 */
function reachableNamedTypes(checker: ts.TypeChecker, root: ts.InterfaceDeclaration): Map<string, string> {
  const found = new Map<string, string>();
  const queue: ts.Declaration[] = [root];
  const visited = new Set<ts.Declaration>([root]);
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
          if (!visited.has(hit.decl)) {
            visited.add(hit.decl);
            queue.push(hit.decl);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(current, visit);
  }
  return found;
}

describe("the public type surface is closed", () => {
  const program = ts.createProgram([INDEX, DESCRIBE], compilerOptions());
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

  const reachable = sceneSummary ? reachableNamedTypes(checker, sceneSummary) : new Map();

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
});
