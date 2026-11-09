/**
 * `docs/agents/module-map.md` names every source module (engineering-health EH3.1). The expected set
 * is listed here by a plain directory walk, NOT by the generator's pathspecs (a shared list once hid
 * a pathspec that skipped every top-level file): `src/**` (`.ts`, `.mjs`), `packages/<pkg>/src/**`
 * (`.ts`), `playground/src/*.ts` and `playground/worker/*.ts`, minus `.d.ts` and `.test.ts`. The map
 * must cover it both ways, and no module's summary is empty.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { moduleFiles, parseHeader } from "../scripts/gen-module-map.js";

const ROOT = resolve(__dirname, "..");
const map = readFileSync(resolve(ROOT, "docs/agents/module-map.md"), "utf8");

/** Repo-relative files under `dir` with one of `exts`, recursing when asked. */
function walk(dir: string, exts: readonly string[], deep: boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (deep && e.name !== "node_modules") out.push(...walk(rel, exts, deep));
    } else if (exts.some((x) => e.name.endsWith(x)) && !e.name.endsWith(".d.ts") && !e.name.endsWith(".test.ts")) {
      out.push(rel);
    }
  }
  return out;
}

function expected(): string[] {
  const out = [
    ...walk("src", [".ts", ".mjs"], true),
    ...walk("playground/src", [".ts"], false),
    ...walk("playground/worker", [".ts"], false),
  ];
  for (const pkg of readdirSync(resolve(ROOT, "packages"), { withFileTypes: true })) {
    if (pkg.isDirectory() && readdirSync(resolve(ROOT, "packages", pkg.name)).includes("src")) {
      out.push(...walk(`packages/${pkg.name}/src`, [".ts"], true));
    }
  }
  return out.sort();
}

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
  const want = expected();

  it("covers every module a directory walk finds, both ways", () => {
    expect(want.length).toBeGreaterThan(350);
    expect(want).toContain("src/index.ts");
    expect(moduleFiles()).toEqual(want);
    expect([...rows().keys()].sort()).toEqual(want);
  });

  it("gives every module a non-empty summary", () => {
    for (const [file, summary] of rows()) expect(summary.trim(), file).not.toBe("");
    for (const f of want) expect(parseHeader(readFileSync(resolve(ROOT, f), "utf8")).summary, f).not.toBe("");
  });
});
