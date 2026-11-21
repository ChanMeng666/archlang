import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coreFiles, ENTRY, FIRST_USE_ENTRY, firstUseFiles } from "../scripts/core-files.mjs";

/** An in-memory dist/: relative path → text. */
const dist = (files: Record<string, string>) =>
  coreFiles(
    (rel) => files[rel]!,
    (rel) => rel in files,
  );

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The value names a module re-exports (`export { a, b as c } from "…"`), in source order. */
const reexported = (text: string, side: "exported" | "imported" = "exported") =>
  [...text.matchAll(/^export\s*\{([^}]*)\}\s*from\s*"[^"]+";$/gm)].flatMap((m) =>
    m[1]!
      .split(",")
      .map((n) => {
        const [imported, exported = imported] = n.trim().split(/\s+as\s+/);
        return side === "exported" ? exported! : imported!;
      })
      .filter((n) => n && !n.startsWith("type ")),
  );

describe("coreFiles (vite.config.js's compiler chunk)", () => {
  it("is index.js, compile-path.js and compile-path.js's imports, transitively, and nothing else", () => {
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
    // The entry itself too (card 3.19): the compiler door imports it, for the one value it serves
    // that index.js does not export.
    expect([...dist(files)]).toEqual(["index.js", ENTRY, "chunk-A.js", "chunk-B.js", "chunk-side.js"]);
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

  it("firstUseFiles is first-use-path.js's imports, transitively, stopping at the compiler chunk's files", () => {
    // Card 3.18: diagnosticToJson and lint in two dist chunks (their entry sets differ) still make
    // one `first-use` chunk; what only a press or edit mode reaches is not in it.
    const files = {
      "index.js":
        'import { compile } from "./chunk-A.js";\nimport { d } from "./chunk-D.js";\nexport { compile, d };\n',
      [ENTRY]: 'import { compile } from "./chunk-A.js";\nexport { compile };\n',
      [FIRST_USE_ENTRY]:
        'import { d } from "./chunk-D.js";\nimport { lint } from "./chunk-L.js";\nexport { d, lint };\n',
      "chunk-A.js": "var compile = 1;\nexport { compile };\n",
      "chunk-D.js": 'import { compile } from "./chunk-A.js";\nvar d = 2;\nexport { d };\n',
      "chunk-L.js": 'import { s } from "./chunk-S.js";\nvar lint = 3;\nexport { lint };\n',
      "chunk-S.js": "var s = 4;\nexport { s };\n",
      // Only a press (src/actions-path.ts) reaches it.
      "chunk-F.js": 'import { lint } from "./chunk-L.js";\nvar finish = 5;\nexport { finish };\n',
    };
    const read = (rel: string) => (files as Record<string, string>)[rel]!;
    const exists = (rel: string) => rel in files;
    const compiler = coreFiles(read, exists);
    expect([...firstUseFiles(read, exists, compiler)]).toEqual(["chunk-D.js", "chunk-L.js", "chunk-S.js"]);
    const withoutEntry = Object.fromEntries(Object.entries(files).filter(([rel]) => rel !== FIRST_USE_ENTRY));
    expect(() =>
      firstUseFiles(
        (rel) => withoutEntry[rel]!,
        (rel) => rel in withoutEntry,
        compiler,
      ),
    ).toThrow(/first-use-path\.js is missing/);
    expect([...firstUseFiles(read, () => false, new Set())]).toEqual([]);
    const reexporting = { ...files, "chunk-L.js": 'export { s } from "./chunk-S.js";\n' };
    expect(() =>
      firstUseFiles(
        (rel) => (reexporting as Record<string, string>)[rel]!,
        (rel) => rel in reexporting,
        compiler,
      ),
    ).toThrow(/dist\/chunk-L\.js re-exports/);
  });

  it("src/compile-path.ts names exactly what the playground's compiler door re-exports", () => {
    // A name the door adds without the entry would land in a lazy-only core chunk, which the
    // compiler chunk would then import statically: the startup gate's walk would count it.
    // The door's own names, before any `as` (card 3.19: it serves `compileWithoutErrorCard` as `compile`).
    const doorText = readFileSync(join(REPO, "playground/src/compiler.ts"), "utf8");
    const door = reexported(doorText, "imported");
    const entry = reexported(readFileSync(join(REPO, "src/compile-path.ts"), "utf8"));
    expect(door.length).toBeGreaterThan(0);
    expect([...entry].sort()).toEqual([...door].sort());
    // …read from the entry itself, the one file that exports `compileWithoutErrorCard`.
    expect(doorText).toMatch(/^export\s*\{[^}]*\}\s*from\s*"archlang\/compile-path";$/m);
  });

  it("no playground module imports compile() itself, so no path carries its error card (card 3.19)", () => {
    // `compile` from `archlang` is the one that draws `onError: "svg"`'s card, and with it the
    // card's renderer and the catalogue's fix column; the door's `compile` is
    // `compileWithoutErrorCard`. A module that took the other would put them back on whichever path
    // loads it (the header actions are on the first use's). The embed draws the card itself, on a
    // broken plan, through its lazy door (error-card.ts).
    const SRC = join(REPO, "playground/src");
    /** The value names `text` imports from `from` (a regex source), before any `as`. */
    const names = (text: string, from: string) =>
      [...text.matchAll(new RegExp(`^import\\s*\\{([^}]*)\\}\\s*from\\s*"${from}";?$`, "gm"))].flatMap((m) =>
        m[1]!
          .split(",")
          .map((n) => n.trim().split(/\s+as\s+/)[0]!)
          .filter((n) => n && !n.startsWith("type ")),
      );
    const CORE = "(?:archlang|@chanmeng666/archlang)";
    const files = readdirSync(SRC).filter((f) => /\.[jt]s$/.test(f));
    const offenders = files.filter((f) => names(readFileSync(join(SRC, f), "utf8"), CORE).includes("compile"));
    expect(offenders).toEqual([]);
    // The embed's card door is a dynamic import of embed.ts alone, never a static one, so neither
    // the embed path nor any other path carries the card.
    const cardImporters = files.filter((f) =>
      /\bimport\s*\(\s*"\.\/error-card\.js"\s*\)/.test(readFileSync(join(SRC, f), "utf8")),
    );
    expect(cardImporters).toEqual(["embed.ts"]);
    for (const f of files)
      expect(readFileSync(join(SRC, f), "utf8"), `${f} imports error-card.js statically`).not.toMatch(
        /^(?:import|export)\s[^;]*?from\s*"\.\/error-card\.js"/m,
      );
    expect(reexported(readFileSync(join(SRC, "error-card.ts"), "utf8"))).toEqual(["renderErrorSvg"]);
    // The probe is live: it reads a core import, and the door's callers take `compile` from the door.
    expect(names('import { compile, describe } from "archlang";', CORE)).toContain("compile");
    for (const f of ["actions.ts", "embed.ts", "compile-worker.ts", "arch-language.js", "preview3d.ts"])
      expect(names(readFileSync(join(SRC, f), "utf8"), String.raw`\./compiler\.js`), f).toContain("compile");
  });

  it("src/first-use-path.ts names exactly what the header actions and the compile job take from the core beyond the door", () => {
    // Card EB.2: a name the actions or the compile worker import from `archlang` without the entry
    // would sit in a core chunk with edit mode's code, which a first use would then load with them
    // (firstUsePathBudget counts it); a name the entry keeps after they drop it holds code there for
    // nobody. Names the compiler door serves (compile, describe, …) are the compiler chunk's.
    // Read from both modules and every playground module they import statically (share.ts,
    // snapshots.ts, raster-export.ts, …), which the bundler puts on the same path.
    const SRC = join(REPO, "playground/src");
    const text = (rel: string) => readFileSync(join(SRC, rel), "utf8");
    const reached = new Set<string>();
    const visit = (rel: string) => {
      if (reached.has(rel)) return;
      reached.add(rel);
      for (const m of text(rel).matchAll(/^import\s+(?!type\s)(?:[^;]*?\sfrom\s*)?"\.\/([\w.-]+)\.js";?$/gm)) {
        const ts = `${m[1]}.ts`;
        visit(existsSync(join(SRC, ts)) ? ts : `${m[1]}.js`);
      }
    };
    visit("actions.ts");
    visit("compile-worker.ts");
    expect([...reached]).toEqual(
      expect.arrayContaining(["share.ts", "snapshots.ts", "raster-export.ts", "compiler.ts"]),
    );
    const imported = (rel: string) =>
      [...text(rel).matchAll(/^import\s*\{([^}]*)\}\s*from\s*"archlang";$/gm)].flatMap((m) =>
        m[1]!
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith("type ")),
      );
    const door = new Set(reexported(text("compiler.ts")));
    const used = [...new Set([...reached].flatMap(imported))];
    const entry = reexported(readFileSync(join(REPO, "src/first-use-path.ts"), "utf8"));
    expect(used).toContain("diagnosticToJson");
    expect(used).toContain("lint");
    // Card 3.18: what the actions run only on a press comes through their lazy door, never here.
    expect(reached.has("press-core.ts"), "press-core.ts is imported dynamically only").toBe(false);
    expect(used).not.toContain("finish");
    expect(entry.sort()).toEqual(used.filter((n) => !door.has(n)).sort());
  });

  it("src/actions-path.ts names exactly what the header actions' lazy door re-exports, which only a dynamic import reaches", () => {
    // Card 3.18: Format, Finish, Repair and the DXF/TXT downloads load their core code on a press.
    // A name the door adds without the entry would sit in a chunk with another entry's code (edit
    // mode's, or the first use's, which would then carry it); a static import of the door anywhere
    // in the playground would put it back on the first use's path.
    const SRC = join(REPO, "playground/src");
    const door = reexported(readFileSync(join(SRC, "press-core.ts"), "utf8"));
    const entry = reexported(readFileSync(join(REPO, "src/actions-path.ts"), "utf8"));
    expect(door).toEqual(expect.arrayContaining(["finish", "repair", "format", "toDxf", "renderAscii"]));
    expect([...entry].sort()).toEqual([...door].sort());
    const firstUse = new Set(reexported(readFileSync(join(REPO, "src/first-use-path.ts"), "utf8")));
    expect(door.filter((n) => firstUse.has(n))).toEqual([]);
    const importers = readdirSync(SRC)
      .filter((f) => /\.[jt]s$/.test(f))
      .filter((f) => /\bimport\s*\(\s*"\.\/press-core\.js"\s*\)/.test(readFileSync(join(SRC, f), "utf8")));
    expect(importers).toEqual(["actions.ts"]);
    for (const f of readdirSync(SRC).filter((f) => /\.[jt]s$/.test(f)))
      expect(readFileSync(join(SRC, f), "utf8"), `${f} imports press-core.js statically`).not.toMatch(
        /^(?:import|export)\s[^;]*?from\s*"\.\/press-core\.js"/m,
      );
  });
});
