/**
 * `docs/agents/module-map.md` names every source module (engineering-health EH3.1): the set is
 * what `git ls-files` returns under the generator's globs, read on both sides here, never retyped,
 * and no module's summary is empty (the generator itself fails on a module with no header, so a
 * stale map and an unrendered module are both red).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_GLOBS, moduleFiles, parseHeader } from "../scripts/gen-module-map.js";

const ROOT = resolve(__dirname, "..");
const map = readFileSync(resolve(ROOT, "docs/agents/module-map.md"), "utf8");

/** Rows of the map as `dir/name` -> summary cell. */
function rows(): Map<string, string> {
  const out = new Map<string, string>();
  let dir = "";
  for (const line of map.split("\n")) {
    const h = /^## `(.+)\/`$/.exec(line);
    if (h) dir = h[1]!;
    const r = /^\| `([^`]+)` \| \d+ \| \d+ \| (.*) \| [^|]*\|$/.exec(line);
    if (r && dir) out.set(`${dir}/${r[1]}`, r[2]!);
  }
  return out;
}

describe("module map", () => {
  const listed = execFileSync("git", ["ls-files", "-z", "--", ...MODULE_GLOBS], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((f) => f && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"));

  it("covers every module git ls-files returns under the globs", () => {
    expect(listed.length).toBeGreaterThan(200);
    expect(moduleFiles()).toEqual([...listed].sort());
    expect([...rows().keys()].sort()).toEqual([...listed].sort());
  });

  it("gives every module a non-empty summary", () => {
    for (const [file, summary] of rows()) expect(summary.trim(), file).not.toBe("");
    for (const f of listed) expect(parseHeader(readFileSync(resolve(ROOT, f), "utf8")).summary, f).not.toBe("");
  });
});
