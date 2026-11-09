/**
 * `test/INDEX.md` lists every `src` module and every root test file, and nothing that is not tracked.
 *
 * The expected sets come from an independent `git ls-files` listing here (not from the generator's
 * own reader), so a generator that silently skips a directory fails this test instead of agreeing
 * with itself. Staleness (a changed import or header) is `check:drift`'s job.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, headerSentence, readFiles, testsBySrc } from "../scripts/gen-test-index.js";

const ls = (...specs: string[]): string[] =>
  execFileSync("git", ["ls-files", ...specs], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

const srcModules = ls(":(glob)src/**/*.ts").filter((f) => !f.endsWith(".d.ts"));
const testFiles = ls(":(glob)test/**/*.test.ts");
const index = readFileSync("test/INDEX.md", "utf8");
const section = (title: string): string[] => {
  const start = index.indexOf(`\n## ${title}`);
  expect(start, title).toBeGreaterThan(-1);
  const end = index.indexOf("\n## ", start + 1);
  return index.slice(start, end < 0 ? undefined : end).split("\n");
};
const paths = (lines: string[], re: RegExp): string[] =>
  lines.flatMap((l) => {
    const m = re.exec(l);
    return m ? [m[1] as string] : [];
  });

describe("test/INDEX.md covers the tree both ways", () => {
  const byModule = section("`src` module → tests that import it");
  const perTest = section("Test files");
  const unimported = section("`src` modules no test imports");

  it("every root test file has exactly one line in the test section, and each names a tracked file", () => {
    const listed = paths(perTest, /^- `(test\/[^`]+)`/);
    expect([...listed].sort()).toEqual([...testFiles].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("every src module is either in the module section or in the unimported list, never both", () => {
    const withTests = paths(byModule, /^- `(src\/[^`]+)`/);
    const without = paths(unimported, /^- `(src\/[^`]+)`/);
    expect([...withTests, ...without].sort()).toEqual([...srcModules].sort());
    expect(withTests.filter((m) => without.includes(m))).toEqual([]);
  });

  it("the unimported list is what the walk finds, and the header counts agree", () => {
    const by = testsBySrc(readFiles());
    const none = [...by].filter(([, t]) => t.length === 0).map(([m]) => m);
    expect(paths(unimported, /^- `(src\/[^`]+)`/).sort()).toEqual(none.sort());
    expect(index).toContain(
      `${testFiles.length} test files in \`test/\`, ${srcModules.length} \`src\` modules, ${none.length} modules`,
    );
  });

  it("a module's line names tests that exist and really import it", () => {
    const files = readFiles();
    const by = testsBySrc(files);
    for (const m of ["src/index.ts", "src/lint.ts", "src/cli/run.ts"]) {
      const line = byModule.find((l) => l.startsWith(`- \`${m}\``));
      expect(line, m).toBeDefined();
      const first = by.get(m)?.[0]?.test;
      expect(first, m).toBeDefined();
      expect(line).toContain(`\`${(first as string).slice("test/".length).replace(/\.test\.ts$/, "")}\``);
    }
  });
});

describe("the generator's contract", () => {
  it("quotes the first sentence of a header, and not an e.g. inside it", () => {
    expect(headerSentence("/** Pins the thing, e.g. the other. Then more. */\nimport x from 'y';")).toBe(
      "Pins the thing, e.g. the other.",
    );
    expect(headerSentence("// One line.\n// Two.\nimport x from 'y';")).toBe("One line.");
    expect(headerSentence("import x from 'y';")).toBeNull();
  });

  it("fails, naming the file, when a test has no header", () => {
    const files = new Map([
      ["src/a.ts", "export const a = 1;\n"],
      ["test/a.test.ts", 'import { a } from "../src/a.js";\n'],
    ]);
    expect(() => buildIndex({ files })).toThrow(/test\/a\.test\.ts/);
  });

  it("walks through a helper but stops at src (a barrel is not an import of everything)", () => {
    const files = new Map([
      ["src/index.ts", 'export * from "./a.js";\n'],
      ["src/a.ts", "export const a = 1;\n"],
      ["src/b.ts", "export const b = 1;\n"],
      ["test/helpers/h.ts", 'import { b } from "../../src/b.js";\nexport { b };\n'],
      ["test/x.test.ts", '/** X. */\nimport "./helpers/h.js";\nimport "../src/index.js";\n'],
    ]);
    const by = testsBySrc(files);
    expect(by.get("src/b.ts")).toEqual([{ test: "test/x.test.ts", distance: 2 }]);
    expect(by.get("src/index.ts")).toEqual([{ test: "test/x.test.ts", distance: 1 }]);
    expect(by.get("src/a.ts")).toEqual([]);
  });
});
