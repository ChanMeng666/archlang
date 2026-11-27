/** No tracked code file holds the two literal patterns a dynamic-code scanner reads as `eval` or the Function constructor. */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What this checks is TEXT: no tracked code file contains either of two literal patterns
 * ({@link PATTERNS}), the word `eval` followed by an opening parenthesis and the Function
 * constructor written after `new` with its parenthesis. It does not prove that no
 * code is built at runtime (an indirect form written differently, such as the comma-operator call
 * in `scripts/engine-digests.ts`, a script that is never shipped, is not either pattern). It
 * exists because plugin-directory and package scanners match that text: the HOL `plugin-scanner`
 * (the gate of the awesome-codex-plugins list) zeroes its "No eval or Function constructor" check
 * on one match of either pattern in any code file of the whole repository, and other package
 * scanners flag the same token. The matches it found were not dynamic code: the expression
 * evaluator's member was named `eval` (now `ResolveCtx.evaluate`, the old member kept as a
 * deprecated method whose quoted name is not the pattern, `src/evaluator.ts`), and tests loaded
 * generated or extracted code through the Function constructor (now a real ES module through
 * `importSource`, `test/helpers/tmp.ts`).
 *
 * The file set is the scanner's: tracked files (`git ls-files`, so an untracked scratch file is not
 * read) with its code extensions, outside its excluded directories (any path segment). Patterns,
 * extensions and directories are copied from `codex_plugin_scanner/checks/code_quality.py`
 * (`EVAL_RE` and `FUNCTION_RE` as {@link PATTERNS}, `CODE_EXTS`, `EXCLUDED_DIRS`). A file that must hold such text goes in
 * {@link ALLOWED} with the reason; the list is empty, and an entry that no longer matches fails.
 */

const ROOT = join(__dirname, "..");

// Global so a match is found over the whole text, as the scanner's `re.search` does (`\s*` crosses a
// line break); each is named by the line it starts on.
const PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\beval\s*\(/g, "eval call"],
  [/new\s+Function\s*\(/g, "Function constructor"],
];
const CODE_EXTS = new Set([".py", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", ".next", "coverage", "__pycache__", ".venv", "venv"]);

/** Files allowed to match, each with the reason. Empty: nothing in the repository needs it. */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [];

/** Would the scanner read `file` (a repository-relative path with `/` separators)? */
function scanned(file: string): boolean {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || !CODE_EXTS.has(base.slice(dot))) return false;
  return !file.split("/").some((part) => EXCLUDED_DIRS.has(part));
}

/** `file:line <what>` for every match of the scanner's patterns in `text`. */
function hits(file: string, text: string): string[] {
  const out: string[] = [];
  for (const [re, what] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index ?? 0).split("\n").length;
      out.push(`${file}:${line} ${what}`);
    }
  }
  return out;
}

describe("no dynamic-code pattern in tracked code files", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .filter(scanned);
  const allowed = new Set(ALLOWED.map((a) => a.file));

  it("reads the scanner's file set", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain("src/registry.ts");
    expect(files).toContain("test/no-dynamic-code.test.ts");
    expect(scanned("a/node_modules/x.js")).toBe(false);
    expect(scanned("editors/vscode/dist/server.js")).toBe(false);
    expect(scanned("docs/x.md")).toBe(false);
    expect(scanned("docs-site/x.vue")).toBe(false);
  });

  it("positive control: a planted call of either kind is named by file and line", () => {
    // Assembled from pieces so this file's own text never matches.
    const planted = ["ok", `const r = ctx.${"ev"}al(e);`, `const f = new ${"Func"}tion("return 1");`].join("\n");
    expect(hits("x.ts", planted)).toEqual(["x.ts:2 eval call", "x.ts:3 Function constructor"]);
    // The scanner's `\s*` crosses a line break; so does this.
    expect(hits("x.ts", `a\nctx.${"ev"}al\n  (e)`)).toEqual(["x.ts:2 eval call"]);
    // A property key, a method named `evaluate` and a word in prose are not calls.
    expect(hits("x.ts", "eval: fn,\nctx.evaluate(e)\n// the eval corpus\nctx[OLD](e)")).toEqual([]);
  });

  it("every scanned tracked file is free of them, outside the allow-list", () => {
    const found = files.filter((f) => !allowed.has(f)).flatMap((f) => hits(f, readFileSync(join(ROOT, f), "utf8")));
    expect(
      found,
      "dynamic-code pattern(s) a repository scanner flags (rename the member, load code as a real module " +
        `with \`importSource\`, or reword the comment; an entry in ALLOWED needs its reason):\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it("every allow-list entry is a scanned file that still matches", () => {
    for (const { file } of ALLOWED) {
      expect(files, `ALLOWED names ${file}, which the scanner does not read`).toContain(file);
      expect(
        hits(file, readFileSync(join(ROOT, file), "utf8")),
        `ALLOWED names ${file}, which no longer matches`,
      ).not.toEqual([]);
    }
  });
});
