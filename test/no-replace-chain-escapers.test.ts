/** Guard: no `String.replace` escaper chains in tooling or source (CodeQL js/incomplete-sanitization). */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An escaper written as `s.replace(/\|/g, "\\|")` or `s.replace(/</g, "&lt;").replace(/>/g, "&gt;")`
 * trips CodeQL `js/incomplete-sanitization` when its pattern omits the backslash, and CodeQL is a required
 * check (docs/agents/gotchas.md, the "escaper written with `String.replace`" bullet). Write it as a
 * character map instead: `Array.from(s, (c) => TABLE[c] ?? c).join("")` (see `scripts/gen-module-map.ts`).
 *
 * A violation is a group of `.replace(/…/g, "<escape sequence>")` calls (the replacement starts with a
 * backslash or is an HTML entity; calls within a few lines of each other form a group) in which no call
 * covers `\` in its pattern and none is the `&` -> `&amp;` head of a complete HTML escaper. A group that
 * escapes the backslash first, as `escapeRegex` and the `\\` chains do, is the safe shape and CodeQL leaves
 * it alone. Nothing is allow-listed.
 */

const ROOT = join(__dirname, "..");
const SCANNED = /^(?:(?:scripts|src|eval)\/.+\.ts|\.claude\/hooks\/[^/]+\.mjs)$/;

// `.replace(/PATTERN/flags, "REPLACEMENT")` with a string-literal replacement; the groups are the source text.
const REPLACE =
  /\.replace\(\s*\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/([a-z]*)\s*,\s*(["'])((?:\\.|(?!\3)[^\\\n])*)\3\s*\)/g;
const ESCAPE_REPLACEMENT = /^(?:\\\\|&[a-z]+;|&#)/;
const CHAIN_WINDOW_LINES = 6;

interface EscaperHit {
  file: string;
  line: number;
  text: string;
}

function findReplaceEscapers(file: string, source: string): EscaperHit[] {
  const calls: { line: number; safe: boolean; text: string }[] = [];
  for (const m of source.matchAll(REPLACE)) {
    const text = m[0];
    const pattern = m[1] ?? "";
    const flags = m[2] ?? "";
    const replacement = m[4] ?? "";
    if (!flags.includes("g") || !ESCAPE_REPLACEMENT.test(replacement)) continue;
    const line = source.slice(0, m.index ?? 0).split("\n").length;
    const safe = pattern.includes("\\\\") || (pattern === "&" && replacement === "&amp;");
    calls.push({ line, safe, text });
  }
  const hits: EscaperHit[] = [];
  let group: typeof calls = [];
  const flush = (): void => {
    if (group.length > 0 && !group.some((c) => c.safe)) {
      for (const c of group) hits.push({ file, line: c.line, text: c.text });
    }
    group = [];
  };
  for (const c of calls) {
    if (group.length > 0 && c.line - (group[group.length - 1]?.line ?? 0) > CHAIN_WINDOW_LINES) flush();
    group.push(c);
  }
  flush();
  return hits;
}

function trackedSources(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => SCANNED.test(f));
}

describe("no String.replace escaper chains", () => {
  it("the detector flags the chained and the backslash-less shapes", () => {
    const chain = 's.replace(/</g, "&lt;").replace(/>/g, "&gt;")';
    expect(findReplaceEscapers("x.ts", chain)).toHaveLength(2);
    expect(findReplaceEscapers("x.ts", 's.replace(/\\|/g, "\\\\|")')).toHaveLength(1);
    // a metacharacter escaper that lists the backslash, and a full HTML escaper, are the safe shapes
    expect(findReplaceEscapers("x.ts", 's.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")')).toHaveLength(0);
    expect(findReplaceEscapers("x.ts", 's.replace(/&/g, "&amp;").replace(/</g, "&lt;")')).toHaveLength(0);
  });

  it("scripts/, src/, eval/ and .claude/hooks/ carry none", () => {
    const hits = trackedSources().flatMap((f) => findReplaceEscapers(f, readFileSync(join(ROOT, f), "utf8")));
    const report = hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join("\n");
    expect(
      report,
      "Write the escaper as a character map, not a String.replace chain: docs/agents/gotchas.md (CodeQL escaper bullet), pattern in scripts/gen-module-map.ts (CELL_ESC).",
    ).toBe("");
  });
});
