/** ci.yml's Playwright shard jobs name every spec of their site exactly once, by explicit lists. */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const SITES = [
  {
    job: "e2e-playground-chromium",
    dir: "playground/e2e",
    run: "npx playwright test -c playground --project chromium",
  },
  { job: "e2e-docs-shard", dir: "docs-site/e2e", run: "npx playwright test -c docs-site" },
];

describe.each(SITES)("$job", ({ job, dir, run }) => {
  const block = jobBlock(job);
  const shards = shardSpecs(block);
  const specs = readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `e2e/${f}`)
    .sort();

  it("names every spec in the directory exactly once, over shards 1..N", () => {
    const listed = [...shards.values()].flat();
    expect(listed.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual(specs);
    expect(new Set(listed).size).toBe(listed.length);
    for (const s of shards.values()) expect(s.length).toBeGreaterThan(0);
    expect([...shards.keys()]).toEqual(Array.from({ length: shards.size }, (_, i) => i + 1));
  });

  it("runs its shard's list (no Playwright --shard), named N/<count>", () => {
    expect(block).toContain(["run: ", run, " $", "{{ matrix.specs }}"].join(""));
    expect(block).not.toContain("--shard=");
    expect(block).toContain(["/", shards.size, "\n"].join(""));
  });

  it("no spec name is a substring of another's path filter (a filter matches by substring)", () => {
    for (const a of specs) for (const b of specs) if (a !== b) expect(b.includes(a), `${a} in ${b}`).toBe(false);
  });
});
