/** No tracked script derives a filesystem path from a file URL by hand. */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `new URL(import.meta.url).pathname` keeps percent-encoding (`%20`) and, on Windows, a leading slash,
 * so the path is wrong under a checkout with spaces (#915). A `file://` + `process.argv[1]` template never
 * equals `import.meta.url` on Windows or with encoded characters. The fix is `fileURLToPath` /
 * `pathToFileURL`. The patterns are assembled from pieces so this file does not match itself.
 */

const ROOT = join(__dirname, "..");
const DOT = "\\.";
const RULES: { re: RegExp; fix: string }[] = [
  {
    re: new RegExp(`import${DOT}meta${DOT}url\\)${DOT}pathname`),
    fix: "use fileURLToPath(import.meta.url) from node:url",
  },
  {
    re: new RegExp(`\`file:${"/"}/\\$\\{`),
    fix: "compare against pathToFileURL(resolve(path)).href from node:url",
  },
];

/** `file:line (fix)` for each rule hit in `text`. */
function hits(file: string, text: string): string[] {
  const out: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const r of RULES) if (r.re.test(line)) out.push(`${file}:${i + 1} (${r.fix})`);
  });
  return out;
}

describe("file URLs are decoded, not sliced", () => {
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.ts", "*.mts", "*.mjs", "*.js", "*.cjs"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((f) => f && !/(^|\/)(node_modules|dist)\//.test(f));

  it("reads the tracked source files", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("scripts/check-quick.mjs");
  });

  it("positive control: both patterns are caught and name their fix", () => {
    const bad = `const a = new URL(${"import"}.meta.url).pathname;\nif (u === \`file:${"/"}/\${p}\`) {}\n`;
    const found = hits("x.ts", bad);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("fileURLToPath");
    expect(found[1]).toContain("pathToFileURL");
    expect(hits("x.ts", "fileURLToPath(import.meta.url)")).toEqual([]);
  });

  it("no tracked source uses either", () => {
    const found = files.flatMap((f) => hits(f, readFileSync(join(ROOT, f), "utf8")));
    expect(found, `derive paths with fileURLToPath / pathToFileURL:\n${found.join("\n")}`).toEqual([]);
  });
});
