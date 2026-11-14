import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coreFiles, ENTRY } from "../scripts/core-files.mjs";

/** An in-memory dist/: relative path → text. */
const dist = (files: Record<string, string>) =>
  coreFiles(
    (rel) => files[rel]!,
    (rel) => rel in files,
  );

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The value names a module re-exports (`export { a, b as c } from "…"`), in source order. */
const reexported = (text: string) =>
  [...text.matchAll(/^export\s*\{([^}]*)\}\s*from\s*"[^"]+";$/gm)].flatMap((m) =>
    m[1]!
      .split(",")
      .map(
        (n) =>
          n
            .trim()
            .split(/\s+as\s+/)
            .pop()!,
      )
      .filter((n) => n && !n.startsWith("type ")),
  );

describe("coreFiles (vite.config.js's compiler chunk)", () => {
  it("is index.js plus compile-path.js's imports, transitively, and nothing else", () => {
    const files = {
      "index.js":
        'import {\n  compile,\n  lint\n} from "./chunk-A.js";\nimport { finish } from "./chunk-L.js";\nexport { compile, finish, lint };\n',
      [ENTRY]:
        'import {\n  compile,\n  lint\n} from "./chunk-A.js";\nimport "./chunk-side.js";\nexport { compile, lint };\n',
      "chunk-A.js": 'import { x } from "./chunk-B.js";\nvar compile = 1;\n',
      "chunk-B.js": "var x = 2;\nexport { x };\n",
      "chunk-side.js": "globalThis.y = 1;\n",
      // Only the rest of index.js reaches it (card RM0.7f): it goes with the lazy chunks.
      "chunk-L.js": 'import { x } from "./chunk-B.js";\nvar finish = 4;\nexport { finish };\n',
      "cli/review.js": 'import { r } from "../chunk-R.js";\nexport { r };\n',
      "chunk-R.js": 'import { compile } from "./chunk-A.js";\nvar r = 3;\nexport { r };\n',
    };
    expect([...dist(files)]).toEqual(["index.js", "chunk-A.js", "chunk-B.js", "chunk-side.js"]);
  });

  it("refuses a dist/ built before compile-path.js existed, rather than taking all of index.js", () => {
    const files = { "index.js": 'import { a } from "./chunk-A.js";\nexport { a };\n', "chunk-A.js": "var a = 1;\n" };
    expect(() => dist(files)).toThrow(/compile-path\.js is missing/);
    expect([...dist({})]).toEqual([]);
  });

  it("refuses a re-export, which the walk would not follow", () => {
    const files = {
      "index.js": 'import { a } from "./chunk-A.js";\nexport { b } from "./chunk-B.js";\nexport { a };\n',
      [ENTRY]: 'import { a } from "./chunk-A.js";\nexport { a };\n',
      "chunk-A.js": "var a = 1;\nexport { a };\n",
      "chunk-B.js": "var b = 1;\nexport { b };\n",
    };
    expect(() => dist(files)).toThrow(/re-exports from "\.\/chunk-B\.js"/);
    // …in a chunk as much as in index.js.
    const deep = {
      "index.js": 'import { a } from "./chunk-A.js";\n',
      [ENTRY]: 'import { a } from "./chunk-A.js";\n',
      "chunk-A.js": 'export * from "./chunk-B.js";\n',
      "chunk-B.js": "",
    };
    expect(() => dist(deep)).toThrow(/dist\/chunk-A\.js re-exports/);
  });

  it("src/compile-path.ts names exactly what the playground's compiler door re-exports", () => {
    // A name the door adds without the entry would land in a lazy-only core chunk, which the
    // compiler chunk would then import statically: the startup gate's walk would count it.
    const door = reexported(readFileSync(join(REPO, "playground/src/compiler.ts"), "utf8"));
    const entry = reexported(readFileSync(join(REPO, "src/compile-path.ts"), "utf8"));
    expect(door.length).toBeGreaterThan(0);
    expect([...entry].sort()).toEqual([...door].sort());
  });
});
