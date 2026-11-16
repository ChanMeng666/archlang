/**
 * `scripts/gate-select.mjs`: what `check:quick` selects beyond the import graph, and how it caps it. The
 * real-tree cases pin the scanners that CI has failed on (`no-cli-spawn`, `lint-provenance`,
 * `no-replace-chain-escapers`) staying selected; the temp-tree cases pin the caps.
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
  gitleaksExcluded,
  listedTrees,
  medianSecs,
  namedTests,
  planTests,
  scannedTrees,
  scanningGuards,
  TEXT_GUARDS,
  treeGuards,
  wakesTextGuards,
  // @ts-expect-error — a zero-dep .mjs script with no type declarations.
} from "../scripts/gate-select.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim().replace(/\\/g, "/"))
    .filter(Boolean);
type Pick = { file: string; secs?: number; why?: string; rule?: string };
const files_ = (l: Pick[]): string[] => l.map((g) => g.file);

describe("driftWanted", () => {
  it("runs for anything but a change set of test files only", () => {
    expect(driftWanted(["src/lint.ts"])).toBe(true);
    expect(driftWanted(["docs/analysis.md"])).toBe(true);
    expect(driftWanted(["test/a.test.ts", "scripts/gen-doors.ts"])).toBe(true);
    expect(driftWanted(["test/a.test.ts", "packages/mcp/test/b.test.ts"])).toBe(false);
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

describe("scannedTrees: a source-tree scanner is a test that lists a source root and reads what it finds", () => {
  const scan = `import { readdirSync, readFileSync } from "node:fs";\nreaddirSync(join(ROOT, "src")).map((f) => readFileSync(f));`;

  it("takes a test that lists src/ and reads the files", () => {
    expect([...scannedTrees(scan)]).toEqual(["src"]);
  });

  it("leaves out a test that lists a root but reads nothing", () => {
    expect([...scannedTrees(`readdirSync(join(ROOT, "src"));`)]).toEqual([]);
  });

  it("leaves out a corpus test: it lists examples/ and imports the core to run it", () => {
    // The folder is a variable so this file holds no literal corpus listing (`no-duplicate-helpers` scans it).
    const corpusDir = "examples";
    const listing = `readdirSync(join(ROOT, "${corpusDir}"));`;
    const corpus = `${scan}\nimport { compile } from "../src/index.js";\n${listing}`;
    expect([...scannedTrees(corpus)]).toEqual([]);
    // Listing examples/ without the core is still a scanner.
    expect([...scannedTrees(`${scan}\n${listing}`)]).toEqual(["src"]);
  });

  it("leaves out a workspace test: its src/ is the workspace's, not the repo's", () => {
    expect([...scannedTrees(scan, "packages/mcp/test/server.test.ts")]).toEqual([]);
  });
});

describe("treeGuards: the scanners no import reaches", () => {
  const files = tracked();

  it("a changed test file wakes no-cli-spawn", () => {
    expect(files_(treeGuards(ROOT, ["test/cache.test.ts"], files))).toContain("test/no-cli-spawn.test.ts");
  });

  it("a changed src/ file wakes the provenance walk and the escaper-chain scan", () => {
    const got = files_(treeGuards(ROOT, ["src/cli/commands-analyze.ts"], files));
    expect(got).toContain("test/lint-provenance.test.ts");
    expect(got).toContain("test/no-replace-chain-escapers.test.ts");
  });

  it("a changed eval/ or scripts/ file wakes the escaper-chain scan, a changed docs page wakes none", () => {
    expect(files_(treeGuards(ROOT, ["eval/l2-run.ts"], files))).toContain("test/no-replace-chain-escapers.test.ts");
    expect(files_(treeGuards(ROOT, ["scripts/gen-module-map.ts"], files))).toContain(
      "test/no-replace-chain-escapers.test.ts",
    );
    expect(treeGuards(ROOT, ["docs/agents/commands.md"], files)).toEqual([]);
  });

  it("a data file under a tree wakes nothing", () => {
    expect(treeGuards(ROOT, ["src/error-catalog/rooms.json"], files)).toEqual([]);
  });

  it("stays within 30 files and 15 recorded seconds on the real tree, for a change under every tree", () => {
    const got = treeGuards(
      ROOT,
      ["src/lint.ts", "test/a.test.ts", "scripts/a.mjs", "eval/a.ts", ".claude/hooks/a.mjs"],
      files,
    );
    expect(got.length).toBeLessThanOrEqual(30);
    expect(got.reduce((a: number, g: Pick) => a + (g.secs ?? 0), 0)).toBeLessThanOrEqual(15);
  });

  describe("on a temp tree", () => {
    let dir = "";
    const scanner = `import { readdirSync, readFileSync } from "node:fs";\nreaddirSync("src").map((f) => readFileSync(f));\n`;
    const wide = `${scanner}readdirSync("scripts").map((f) => readFileSync(f));\n`;
    const names = (l: Pick[]) => files_(l).map((f) => f.replace(/^test\/|\.test\.ts$/g, ""));
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "gate-tree-"));
      mkdirSync(join(dir, "test"), { recursive: true });
      for (const n of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
        writeFileSync(join(dir, "test", `${n}.test.ts`), scanner);
      }
      writeFileSync(join(dir, "test", "wide.test.ts"), wide);
      writeFileSync(join(dir, "test", "slow.test.ts"), scanner);
      writeFileSync(join(dir, "test", "not-a-scanner.test.ts"), `it("x", () => 1);\n`);
      // `a`..`g`, `slow` and `wide` are recorded; `h`..`j` are not (costed at 0.5).
      const rec: Record<string, number> = { a: 0.1, b: 0.2, c: 0.3, d: 0.8, e: 0.9, f: 1.0, g: 1.1, slow: 9, wide: 5 };
      writeFileSync(
        join(dir, "test", ".durations.json"),
        JSON.stringify(Object.fromEntries(Object.entries(rec).map(([k, v]) => [`test/${k}.test.ts`, v]))),
      );
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const all = () =>
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "wide", "not-a-scanner"].map((n) => `test/${n}.test.ts`);

    it("takes every scanner within the budget: the fewest trees first, then the cheapest", () => {
      expect(names(treeGuards(dir, ["src/x.ts"], all()))).toEqual([
        "a",
        "b",
        "c",
        "h",
        "i",
        "j",
        "d",
        "e",
        "f",
        "g",
        "wide",
      ]);
    });

    it("cuts a scanner that no longer fits the seconds it is given, and keeps the cheaper ones", () => {
      expect(names(treeGuards(dir, ["src/x.ts"], all(), 30, 1.0))).toEqual(["a", "b", "c"]); // .6, then .5 passes 1.0
      const got = treeGuards(dir, ["src/x.ts"], all(), 30, 5.95); // a..j cost 5.9; `wide` costs 5 more
      expect(names(got)).not.toContain("wide");
      expect(got).toHaveLength(10);
    });

    it("holds the ceiling on files, whatever the seconds", () => {
      expect(names(treeGuards(dir, ["src/x.ts"], all(), 3, 100))).toEqual(["a", "b", "c"]);
    });

    it("costs a scanner with no record at a small default, not at infinity", () => {
      const got = treeGuards(dir, ["src/x.ts"], ["test/h.test.ts"]) as Pick[];
      expect(got.map((g) => g.secs)).toEqual([0.5]);
    });

    it("ranks a scanner dedicated to the woken tree before one that lists several, even a dearer one", () => {
      expect(names(treeGuards(dir, ["src/x.ts"], ["test/wide.test.ts", "test/slow.test.ts"]))).toEqual([
        "slow",
        "wide",
      ]);
    });
  });
});

describe("namedTests", () => {
  const files = tracked();

  it("a rule module wakes the test named after it", () => {
    expect(files_(namedTests(["src/lint/rules/room-contents.ts"], files))).toContain("test/lint-room-contents.test.ts");
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
    expect(files_(namedTests(["src/room-contents.ts"], fake)).sort()).toEqual([
      "test/lint-room-contents-extra.test.ts",
      "test/lint-room-contents.test.ts",
    ]);
  });

  it("never names a test file for itself", () => {
    expect(namedTests(["test/lint-room-contents.test.ts"], files)).toEqual([]);
  });

  describe("caps", () => {
    const fake = ["a", "b", "c", "d", "e", "f"].map((n) => `test/widget-${n}.test.ts`);
    const durations: Record<string, number> = {
      "test/widget-a.test.ts": 4,
      "test/widget-b.test.ts": 1,
      "test/widget-c.test.ts": 5,
      "test/widget-d.test.ts": 2,
      "test/widget-e.test.ts": 3,
      "test/widget-f.test.ts": 9,
    };

    it("takes the cheapest first, at most 5 files", () => {
      const got = files_(namedTests(["src/widget.ts"], fake, durations, 5, 100));
      expect(got).toEqual(["b", "d", "e", "a", "c"].map((n) => `test/widget-${n}.test.ts`));
    });

    it("stops at the seconds it is given", () => {
      const got = namedTests(["src/widget.ts"], fake, durations, 5, 6) as Pick[];
      expect(files_(got)).toEqual(["b", "d", "e"].map((n) => `test/widget-${n}.test.ts`)); // 1 + 2 + 3, `a` (4) no longer fits
    });

    it("costs a test with no record at the median of the record", () => {
      expect(medianSecs({ x: 1, y: 2, z: 30 })).toBe(2);
      const got = namedTests(["src/widget.ts"], fake, {
        "test/widget-a.test.ts": 1,
        "test/widget-b.test.ts": 3,
      }) as Pick[];
      expect(got.find((g) => g.file === "test/widget-c.test.ts")?.secs).toBe(3);
    });

    it("defaults to 5 files and 10 seconds", () => {
      const heavy = Object.fromEntries(fake.map((f) => [f, 4]));
      expect(namedTests(["src/widget.ts"], fake, heavy)).toHaveLength(2); // 4 + 4; a third (12) does not fit
      const light = Object.fromEntries(fake.map((f) => [f, 0.1]));
      expect(namedTests(["src/widget.ts"], fake, light)).toHaveLength(5);
    });
  });
});

describe("corpusPins", () => {
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
    expect(files_(corpusPins(guards, related, 20, durations))).toEqual([
      "test/b.test.ts",
      "test/e.test.ts",
      "test/d.test.ts",
    ]); // 1 + 3 + 10, `a` (30) does not fit
  });

  it("skips what the change does not reach, and what does not pin", () => {
    expect(files_(corpusPins(guards, ["test/b.test.ts", "test/c.test.ts"], 100, durations))).toEqual([
      "test/b.test.ts",
    ]);
  });

  it("keeps looking past a test too dear for what is left", () => {
    expect(files_(corpusPins(guards, ["test/a.test.ts", "test/b.test.ts"], 5, durations))).toEqual(["test/b.test.ts"]);
  });

  it("finds keep-digests among the example pins of the real tree", () => {
    const keep = scanningGuards(ROOT, ["examples"], tracked()).filter(
      (g: { file: string }) => g.file === "test/keep-digests.test.ts",
    );
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

describe("planTests: what the gate runs for a change set", () => {
  const files = tracked();
  const plan = (changed: string[], related: string[], extra: Record<string, unknown> = {}) =>
    planTests({ ROOT, changed, files, related, ...extra }) as {
      own: string[];
      extras: Pick[];
      picked: string[];
      total: number;
    };

  it("caps own + guards + nearest at --max and puts the extras beyond it", () => {
    const related = Array.from({ length: 30 }, (_, i) => `test/near-${i}.test.ts`);
    const p = plan(["src/lint/rules/room-contents.ts"], related, { max: 7 });
    const capped = p.picked.filter((f) => f.startsWith("test/near-"));
    expect(capped).toEqual(related.slice(0, 7));
    expect(p.extras.length).toBeGreaterThan(0);
    expect(p.picked).toHaveLength(7 + p.extras.length);
  });

  it("selects the three scanners CI has failed on, by their rule", () => {
    const rule = (changed: string[], file: string) => plan(changed, []).extras.find((e) => e.file === file)?.rule;
    expect(rule(["test/cache.test.ts"], "test/no-cli-spawn.test.ts")).toBe("treeGuards");
    expect(rule(["src/cli/commands-analyze.ts"], "test/lint-provenance.test.ts")).toBe("treeGuards");
    expect(rule(["scripts/gen-module-map.ts"], "test/no-replace-chain-escapers.test.ts")).toBe("treeGuards");
    expect(rule(["src/lint/rules/room-contents.ts"], "test/lint-room-contents.test.ts")).toBe("namedTests");
  });

  it("keeps each extra under its own cap whatever the change set", () => {
    const changed = [
      "src/lint.ts",
      "test/a.test.ts",
      "scripts/a.mjs",
      "eval/a.ts",
      ".claude/hooks/a.mjs",
      "src/room-contents.ts",
    ];
    const p = plan(
      changed,
      tracked().filter((f) => /^test\/.*\.test\.ts$/.test(f)),
    );
    const by = (rule: string) => p.extras.filter((e) => e.rule === rule);
    expect(by("treeGuards").length).toBeLessThanOrEqual(30);
    expect(by("namedTests").length).toBeLessThanOrEqual(5);
  });

  it("runs no extra for an examples change, and only the text guards for a docs change", () => {
    expect(plan(["docs/agents/commands.md"], []).extras.map((e) => e.rule)).toEqual([
      "textGuards",
      "textGuards",
      "textGuards",
    ]);
    expect(plan(["examples/studio.arch"], []).extras).toEqual([]);
  });

  it("selects the three text guards CI failed on (#848) for a catalogue, docs, CHANGELOG or gitleaks-excluded test change", () => {
    const guards = (changed: string[]) =>
      plan(changed, [])
        .extras.filter((e) => e.rule === "textGuards")
        .map((e) => e.file)
        .sort();
    const all = [...TEXT_GUARDS].sort();
    expect(all).toEqual([
      "test/docs-flags.test.ts",
      "test/lint-fix-texts.test.ts",
      "test/opaque-literal-guard.test.ts",
    ]);
    for (const f of all) expect(tracked()).toContain(f);
    expect(guards(["src/error-catalog/layout.ts"])).toEqual(all);
    expect(guards(["src/error-catalog.ts"])).toEqual(all);
    expect(guards(["docs/language-reference.md"])).toEqual(all);
    expect(guards(["CHANGELOG.md"])).toEqual(all);
    // A test file a `.gitleaksignore` fingerprint names (read from the real file, not retyped).
    const excluded = [...gitleaksExcluded(ROOT)].filter((f) => f.startsWith("test/") && f.endsWith(".test.ts"));
    expect(excluded.length).toBeGreaterThan(0);
    expect(guards([excluded[0]])).toEqual(all);
  });

  it("leaves the text guards out for a change that touches none of their inputs", () => {
    const guards = (changed: string[]) => plan(changed, []).extras.filter((e) => e.rule === "textGuards");
    expect(guards(["src/lint/rules/room-contents.ts"])).toEqual([]);
    expect(guards(["examples/studio.arch"])).toEqual([]);
    expect(guards(["test/cache.test.ts"])).toEqual([]);
    expect(guards(["docs-site/index.md"])).toEqual([]);
    expect(wakesTextGuards("test/cache.test.ts", new Set(["test/other.test.ts"]))).toBeUndefined();
    expect(wakesTextGuards("test/x.test.ts", new Set(["test/x.test.ts"]))).toBe("a gitleaks-excluded test file");
  });

  it("an extra the capped list already holds is listed once", () => {
    const p = plan(["test/cache.test.ts"], ["test/cache.test.ts", "test/no-cli-spawn.test.ts"]);
    expect(p.picked.filter((f) => f === "test/no-cli-spawn.test.ts")).toHaveLength(1);
    expect(p.extras.map((e) => e.file)).not.toContain("test/no-cli-spawn.test.ts");
  });
});
