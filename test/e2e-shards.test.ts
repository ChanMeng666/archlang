/** ci.yml's Playwright shard jobs name every spec of their site exactly once, by explicit lists. */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const yml = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8").replace(/\r\n/g, "\n");

/** A job's block in ci.yml: from its `  <id>:` line to the next job's. */
function jobBlock(id: string): string {
  const start = yml.indexOf(`\n  ${id}:\n`);
  if (start < 0) throw new Error(`ci.yml has no job ${id}`);
  const rest = yml.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[A-Za-z0-9_-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/** The `specs` of each `matrix.include` entry, by shard, a folded (`>-`) value joined. */
function shardSpecs(block: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  let shard: number | undefined;
  let folding = false;
  for (const line of block.split("\n")) {
    const entry = /^ {10}- shard: (\d+)$/.exec(line);
    if (entry?.[1]) {
      shard = Number(entry[1]);
      out.set(shard, []);
      folding = false;
      continue;
    }
    const specs = /^ {12}specs: (.*)$/.exec(line);
    if (specs?.[1] !== undefined && shard !== undefined) {
      folding = specs[1] === ">-";
      if (!folding) out.get(shard)!.push(...specs[1].split(/\s+/).filter(Boolean));
      continue;
    }
    if (folding && shard !== undefined && /^ {14}\S/.test(line)) out.get(shard)!.push(...line.trim().split(/\s+/));
    else folding = false;
  }
  return out;
}

/**
 * Every file Playwright would collect under a config's `testDir`, as `e2e/…` paths: its default
 * `testMatch` (any `.spec` or `.test` file ending `.js`, `.ts`, `.cjs`, `.mjs`, `.cts` or `.mts`,
 * with an optional `x`), walked recursively into subfolders. A config that overrides
 * `testMatch` or `testIgnore`, or moves `testDir`, fails here until this follows it.
 */
const TEST_FILE = /\.(spec|test)\.(c|m)?[jt]sx?$/;
function collected(site: string): string[] {
  const config = readFileSync(resolve(ROOT, site, "playwright.config.ts"), "utf8");
  expect(config, `${site}: testMatch/testIgnore override`).not.toMatch(/\btest(Match|Ignore)\s*:/);
  expect(
    [...config.matchAll(/\btestDir:\s*"([^"]+)"/g)].map((m) => m[1]),
    `${site}: testDir`,
  ).toEqual(["./e2e"]);
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/${entry.name}`);
      else if (TEST_FILE.test(entry.name)) out.push(`${rel}/${entry.name}`);
    }
  };
  walk(resolve(ROOT, site, "e2e"), "e2e");
  return out.sort();
}

const SITES = [
  { job: "e2e-playground-chromium", site: "playground" },
  { job: "e2e-docs-shard", site: "docs-site" },
];

describe.each(SITES)("$job", ({ job, site }) => {
  const block = jobBlock(job);
  const shards = shardSpecs(block);
  const specs = collected(site);

  it("names every test file Playwright collects for the site exactly once, over shards 1..N", () => {
    const listed = [...shards.values()].flat();
    expect(listed.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual(specs);
    expect(new Set(listed).size).toBe(listed.length);
    for (const s of shards.values()) expect(s.length).toBeGreaterThan(0);
    expect([...shards.keys()]).toEqual(Array.from({ length: shards.size }, (_, i) => i + 1));
  });

  it("runs its shard's list right after the config, then only `--opt=value` options; no --shard", () => {
    // `--project` (and other list options) are variadic: a spec right after one is read as its value.
    const runs = block.split("\n").filter((l) => /^ {8}run: npx playwright test\b/.test(l));
    expect(runs).toHaveLength(1);
    const shape = new RegExp(
      `^ {8}run: npx playwright test -c ${site} \\$\\{\\{ matrix\\.specs \\}\\}(?: --[a-z-]+=\\S+)*$`,
    );
    expect(runs[0]).toMatch(shape);
    expect(block).not.toContain("--shard=");
    expect(block).toContain(["/", shards.size, "\n"].join(""));
  });

  it("no listed path is a substring of another's (a filter matches by substring)", () => {
    for (const a of specs) for (const b of specs) if (a !== b) expect(b.includes(a), `${a} in ${b}`).toBe(false);
  });
});
