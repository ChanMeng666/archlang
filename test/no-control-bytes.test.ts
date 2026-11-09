/** No tracked Markdown file contains a stray control byte. */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No tracked Markdown file holds a C0 control byte other than tab, newline, form feed and carriage
 * return. A record written through a shell heredoc or `node -e` loses its backslashes, and a Windows
 * path's `\2…` became a control byte in a handoff (#335); nothing rendered it, so nothing noticed.
 * The file list is `git ls-files`, never a directory walk, so an untracked scratch file is not read.
 */

const ROOT = join(__dirname, "..");
// biome-ignore lint/suspicious/noControlCharactersInRegex: finding control characters is this test's purpose
const CONTROL = /[\x01-\x08\x0b\x0e-\x1f]/g;

/** `file:line:col U+00XX` for every control byte in `text`. */
function controlBytes(file: string, text: string): string[] {
  const hits: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(CONTROL)) {
      const code = (m[0] as string).charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
      hits.push(`${file}:${i + 1}:${(m.index ?? 0) + 1} U+${code}`);
    }
  });
  return hits;
}

describe("no control bytes in tracked Markdown", () => {
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

  it("reads the tracked Markdown files", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("AGENTS.md");
  });

  it("positive control: a planted byte is named by file, line and column", () => {
    expect(controlBytes("x.md", "ok\nD:\\a\x02b\n")).toEqual(["x.md:2:5 U+0002"]);
    expect(controlBytes("x.md", "tab\there\r\nff\f")).toEqual([]);
  });

  it("every tracked *.md is free of them", () => {
    const hits = files.flatMap((f) => controlBytes(f, readFileSync(join(ROOT, f), "utf8")));
    expect(hits, `control bytes (rewrite the text with the Write/Edit tools):\n${hits.join("\n")}`).toEqual([]);
  });
});
