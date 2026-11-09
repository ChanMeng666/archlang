/**
 * No new local copy of a helper `test/helpers/` already provides.
 *
 * Three copies grew by pasting: the on-disk `worldFor(dir)` World (23 definitions), the
 * `createHash("sha256")` one-liner (19) and the `readdirSync("examples")` listing (113 files, each
 * with its own filter and so its own corpus). They are now `worldFor` (`test/helpers/world.ts`),
 * `sha256` (`test/helpers/digest.ts`) and `exampleNames()` / `corpusFiles()`
 * (`test/helpers/corpus.ts`). This guard fails a test file outside `test/helpers/` that defines
 * `worldFor`, calls `createHash("sha256")` or lists the examples directory itself, unless it is on
 * the allow-list below WITH a reason. The list only shrinks: an entry whose file no longer matches
 * its rule fails too, so delete it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rule = "worldFor" | "sha256" | "examplesDir";

const RULES: Record<Rule, { re: RegExp; use: string }> = {
  worldFor: {
    re: /(?:function worldFor\b|(?:const|let) worldFor\s*=)/,
    use: "import { worldFor } from './helpers/world.js'",
  },
  sha256: {
    re: /createHash\(\s*"sha256"\s*\)/,
    use: "import { sha256 } from './helpers/digest.js'",
  },
  examplesDir: {
    re: /readdirSync\(\s*(?:"examples"|[^)\n]*"examples"[^)\n]*\))/,
    use: "exampleNames() / libNames() / corpusFiles() from './helpers/corpus.js'",
  },
};

const WORKSPACE = "a workspace package's tests cannot import the root test/ helpers (workspace seam)";

/** file -> rule -> why this file may keep its own. */
const ALLOW: Record<string, Partial<Record<Rule, string>>> = {
  "packages/archlang-3d/test/glb.test.ts": { sha256: WORKSPACE },
  "packages/archlang-3d/test/mesh.test.ts": { sha256: WORKSPACE },
  "packages/archlang-3d/test/replay.test.ts": { sha256: WORKSPACE },
  "packages/mcp/test/tools.test.ts": { sha256: WORKSPACE },
  "playground/test/glb-export-random.test.ts": { sha256: WORKSPACE },
  "playground/test/glb-export.test.ts": { sha256: WORKSPACE },
  "playground/test/share-worker.test.ts": { sha256: WORKSPACE },
  "playground/test/svg-sanitize.test.ts": { examplesDir: WORKSPACE },
  "test/compose-assoc.test.ts": {
    worldFor: "a virtual World over one in-memory source (makeVirtualWorld), not a directory reader",
  },
};

const files = execFileSync(
  "git",
  [
    "ls-files",
    ":(glob)test/**/*.ts",
    ":(glob)playground/test/**/*.ts",
    ":(glob)packages/*/test/**/*.ts",
    ":(glob)editors/vscode/test/**/*.ts",
  ],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && !f.startsWith("test/helpers/") && f !== "test/no-duplicate-helpers.test.ts");

/** The rules a file's code breaks (comment-only lines do not count). */
function breaks(file: string): Rule[] {
  const code = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !/^\s*(?:\*|\/\/|\/\*)/.test(l))
    .join("\n");
  return (Object.keys(RULES) as Rule[]).filter((r) => RULES[r].re.test(code));
}

describe("no new local copy of a test helper", () => {
  const found = new Map(files.map((f) => [f, breaks(f)] as const));

  it("scans the test files (the guard cannot pass by finding nothing)", () => {
    expect(files.length).toBeGreaterThan(400);
    expect(RULES.worldFor.re.test("const worldFor = (dir: string): World => ({")).toBe(true);
    expect(RULES.sha256.re.test('createHash("sha256").update(x)')).toBe(true);
    expect(RULES.examplesDir.re.test('readdirSync(join(ROOT, "examples"))')).toBe(true);
  });

  it("no file outside test/helpers/ defines its own, unless it is allow-listed with a reason", () => {
    const offenders: string[] = [];
    for (const [file, rules] of found)
      for (const r of rules) if (!ALLOW[file]?.[r]) offenders.push(`${file}: ${r} — use ${RULES[r].use}`);
    expect(offenders).toEqual([]);
  });

  it("every allow-list entry is still needed (the list only shrinks)", () => {
    const stale: string[] = [];
    for (const [file, why] of Object.entries(ALLOW))
      for (const r of Object.keys(why) as Rule[])
        if (!found.get(file)?.includes(r)) stale.push(`${file}: ${r} no longer matches — delete the entry`);
    expect(stale).toEqual([]);
  });
});
