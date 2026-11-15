/**
 * `scripts/gate-select.mjs`: what `check:quick` selects beyond the import graph, and which deterministic
 * CI steps (`check:drift`, `typecheck:all`) a change set needs. The cases named for a run are failures
 * CI found that the gate's import-distance cut did not reach.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  corpusPins,
  driftWanted,
  listedTrees,
  namedTests,
  scanningGuards,
  surfaceChanged,
  treeGuards,
  typecheckAllWanted,
  // @ts-expect-error — a zero-dep .mjs script with no type declarations.
} from "../scripts/gate-select.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim().replace(/\\/g, "/"))
    .filter(Boolean);

describe("driftWanted", () => {
  it("runs for anything but a change set of test files only", () => {
    expect(driftWanted(["src/lint.ts"])).toBe(true);
    expect(driftWanted(["docs/analysis.md"])).toBe(true);
    expect(driftWanted(["test/a.test.ts", "scripts/gen-doors.ts"])).toBe(true);
    expect(driftWanted(["test/a.test.ts", "packages/mcp/test/b.test.ts"])).toBe(false);
  });
});

describe("surfaceChanged", () => {
  const diff = (...lines: string[]) => ["--- a/src/x.ts", "+++ b/src/x.ts", "@@ -1 +1 @@", ...lines].join("\n");

  it("sees an export or a type member added or removed", () => {
    expect(surfaceChanged(diff("+export function f(a: number): string {"))).toBe(true);
    expect(surfaceChanged(diff("-export const X = 1;"))).toBe(true);
    expect(surfaceChanged(diff("+  readonly wall?: Wall;"))).toBe(true);
    expect(surfaceChanged(diff("-  code: string; // the catalogued code"))).toBe(true);
  });

  it("does not see a change inside a function body", () => {
    expect(surfaceChanged(diff("+  const w = a + b;", "-  return w * 2;", "+  if (x) { y(); }"))).toBe(false);
    expect(surfaceChanged(diff("+  x ? a : b;"))).toBe(false);
  });

  it("does not take the diff header for a change", () => {
    expect(surfaceChanged("--- a/src/export.ts\n+++ b/src/export.ts\n")).toBe(false);
    expect(surfaceChanged("")).toBe(false);
  });
});

describe("typecheckAllWanted", () => {
  const surface = "+export const NEW = 1;";

  it("wakes for a dependency file, the build config or a tsconfig", () => {
    for (const f of [
      "package.json",
      "package-lock.json",
      "packages/mcp/package.json",
      "tsup.config.ts",
      "tsconfig.dev.json",
    ]) {
      expect(typecheckAllWanted([f]), f).toBe(true);
    }
  });

  it("wakes for code under src/ only when its diff moves an export or a type member", () => {
    expect(typecheckAllWanted(["src/lint/rules/doors.ts"], surface)).toBe(true);
    expect(typecheckAllWanted(["src/lint/rules/doors.ts"], "+  const a = 1;")).toBe(false);
    expect(typecheckAllWanted(["src/lint/rules/doors.ts"])).toBe(false);
  });

  it("stays asleep for what the per-file steps already compile or nothing compiles", () => {
    for (const f of [
      "test/lint.test.ts",
      "scripts/check-quick.mjs",
      "docs/analysis.md",
      "examples/studio.arch",
      "packages/mcp/src/tools.ts",
      "playground/src/main.ts",
      "src/README.md",
    ]) {
      expect(typecheckAllWanted([f], surface), f).toBe(false);
    }
  });
});

describe("listedTrees", () => {
  it("reads a bare folder literal next to a directory call", () => {
    const text = `import { readdirSync } from "node:fs";\nconst files = readdirSync(join(ROOT, "test"));`;
    expect([...listedTrees(text)]).toEqual(["test"]);
    expect([...listedTrees(`readdirSync(join(ROOT, "..", "src"))`)]).toEqual(["src"]);
  });

  it("does not take a subfolder or a file for the tree", () => {
    expect([...listedTrees(`readdirSync(join(ROOT, "test/fixtures"))`)]).toEqual([]);
    expect([...listedTrees(`readdirSync(d); const p = "../src/index.js"`)]).toEqual([]);
  });

  it("takes the folders a git-ls-files pattern names", () => {
    const text = `execFileSync("git", ["ls-files"]); const SCANNED = /^(?:scripts\\/.+|(?:src|eval)\\/.+\\.ts|\\.claude\\/hooks\\/[^/]+)$/;`;
    expect([...listedTrees(text)].sort()).toEqual([".claude", "eval", "scripts", "src"]);
  });

  it("is empty for a test that lists nothing", () => {
    expect([...listedTrees(`const a = join(ROOT, "src");`)]).toEqual([]);
  });
});

describe("treeGuards: the scanners no import reaches (CI runs 43531366145, 43588711461, 43693457545)", () => {
  const files = tracked();
  const names = (changed: string[]): string[] => treeGuards(ROOT, changed, files).map((g: { file: string }) => g.file);

  it("a changed test file wakes no-cli-spawn", () => {
    expect(names(["test/cache.test.ts"])).toContain("test/no-cli-spawn.test.ts");
  });

  it("a changed src/ file wakes the provenance walk and the escaper-chain scan", () => {
    const got = names(["src/cli/commands-analyze.ts"]);
    expect(got).toContain("test/lint-provenance.test.ts");
    expect(got).toContain("test/no-replace-chain-escapers.test.ts");
  });

  it("a changed eval/ or scripts/ file wakes the escaper-chain scan, a changed docs page wakes none", () => {
    expect(names(["eval/l2-run.ts"])).toContain("test/no-replace-chain-escapers.test.ts");
    expect(names(["scripts/gen-module-map.ts"])).toContain("test/no-replace-chain-escapers.test.ts");
    expect(names(["docs/agents/commands.md"])).toEqual([]);
  });

  it("a data file under a tree wakes nothing; a code file wakes only the trees it sits in", () => {
    expect(names(["src/error-catalog/rooms.json"])).toEqual([]);
    expect(names(["eval/l2.ts"])).not.toContain("test/no-cli-spawn.test.ts");
  });

  it("is the cheapest first and carries a reason", () => {
    const got = treeGuards(ROOT, ["src/lint.ts"], files) as { secs: number; why: string }[];
    expect(got.length).toBeGreaterThan(5);
    expect(got.every((g) => g.why.startsWith("scans "))).toBe(true);
    const secs = got.map((g) => g.secs);
    expect(secs).toEqual([...secs].sort((a, b) => a - b));
  });
});

describe("namedTests (CI run 43550526470)", () => {
  const files = tracked();

  it("a rule module wakes the test named after it", () => {
    const got = namedTests(["src/lint/rules/room-contents.ts"], files).map((t: { file: string }) => t.file);
    expect(got).toContain("test/lint-room-contents.test.ts");
  });

  it("skips a stem that names a family, a generic one and a short one", () => {
    expect(namedTests(["src/lint.ts"], files)).toEqual([]);
    expect(namedTests(["src/lint/rules/index.ts", "src/types.ts", "src/a.ts"], files)).toEqual([]);
  });

  it("matches a whole hyphen-delimited run, not a substring", () => {
    const fake = [
      "test/lint-room-contents.test.ts",
      "test/lint-room-contents-extra.test.ts",
      "test/subroom-contents.test.ts",
    ];
    const got = namedTests(["src/room-contents.ts"], fake).map((t: { file: string }) => t.file);
    expect(got).toEqual(["test/lint-room-contents.test.ts", "test/lint-room-contents-extra.test.ts"]);
  });

  it("never names a test file for itself", () => {
    expect(namedTests(["test/lint-room-contents.test.ts"], files)).toEqual([]);
  });
});

describe("corpusPins (CI runs 43547025802, 43544511999)", () => {
  const guards = [
    { file: "test/a.test.ts", pins: true },
    { file: "test/b.test.ts", pins: true },
    { file: "test/c.test.ts", pins: false },
    { file: "test/d.test.ts", pins: true },
    { file: "test/e.test.ts", pins: true },
  ];
  const durations = { "test/a.test.ts": 30, "test/b.test.ts": 1, "test/c.test.ts": 0.1, "test/d.test.ts": 10 };

  it("takes the reachable pins, cheapest first, within the budget; a test with no record costs the default", () => {
    const related = ["test/a.test.ts", "test/b.test.ts", "test/c.test.ts", "test/d.test.ts", "test/e.test.ts"];
    const got = corpusPins(guards, related, 20, durations).map((g: { file: string }) => g.file);
    expect(got).toEqual(["test/b.test.ts", "test/e.test.ts", "test/d.test.ts"]); // 1 + 3 + 10, `a` (30) does not fit
  });

  it("skips what the change does not reach, and what does not pin", () => {
    const got = corpusPins(guards, ["test/b.test.ts", "test/c.test.ts"], 100, durations).map(
      (g: { file: string }) => g.file,
    );
    expect(got).toEqual(["test/b.test.ts"]);
  });

  it("keeps looking past a test too dear for what is left", () => {
    const got = corpusPins(guards, ["test/a.test.ts", "test/b.test.ts"], 5, durations).map(
      (g: { file: string }) => g.file,
    );
    expect(got).toEqual(["test/b.test.ts"]);
  });

  it("finds the corpus pins CI failed on in the real tree", () => {
    const files = tracked();
    const exampleGuards = scanningGuards(ROOT, ["examples"], files);
    const keep = exampleGuards.filter((g: { file: string }) => g.file === "test/keep-digests.test.ts");
    expect(keep).toHaveLength(1);
    expect(keep[0].pins).toBe(true);
  });
});

describe("scanningGuards (moved from check-quick.mjs, behaviour unchanged)", () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gate-select-"));
    mkdirSync(join(dir, "test", "helpers"), { recursive: true });
    writeFileSync(
      join(dir, "test", "helpers", "corpus.ts"),
      `import { opendirSync } from "node:fs";\nexport const all = () => opendirSync("examples");\n`,
    );
    writeFileSync(
      join(dir, "test", "plain.test.ts"),
      `import { all } from "./helpers/corpus";\nit("x", () => all());\n`,
    );
    writeFileSync(
      join(dir, "test", "pinned.test.ts"),
      `import { all } from "./helpers/corpus";\nit("x", () => { all(); createHash("md5"); });\n`,
    );
    writeFileSync(join(dir, "test", "other.test.ts"), `it("x", () => 1);\n`);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("finds a test through the helper it imports; pinning tests come first", () => {
    const files = ["test/helpers/corpus.ts", "test/plain.test.ts", "test/pinned.test.ts", "test/other.test.ts"];
    const got = scanningGuards(dir, ["examples"], files) as { file: string; why: string; pins: boolean }[];
    expect(got.map((g) => g.file)).toEqual(["test/pinned.test.ts", "test/plain.test.ts"]);
    expect(got[0]?.why).toBe("lists examples/ via test/helpers/corpus.ts, pins its output");
    expect(got[1]?.why).toBe("lists examples/ via test/helpers/corpus.ts");
  });
});
