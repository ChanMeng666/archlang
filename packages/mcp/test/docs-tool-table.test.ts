/**
 * The tool tables people read name exactly the tools the server registers.
 *
 * `server.test.ts` holds the README to the registry one way (a row for every tool); nothing held
 * `docs-site/mcp.md`, and neither side caught a row for a tool that no longer exists. Both tables
 * are parsed here and compared with `tools/list` of the real server (`registerTools`, over the
 * SDK's in-process transport like every other suite): the registry is the source, never a retyped
 * list. The hosted Worker's extra `read_me` is described in prose, not in these tables.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { connect } from "./helpers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The tool names in the first column of the table under `heading` (up to the next heading). */
function toolRows(file: string, heading: string): string[] {
  const lines = readFileSync(resolve(REPO, file), "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === heading);
  expect(start, `${file}: no "${heading}" heading`).toBeGreaterThanOrEqual(0);
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6} /.test(line)) break;
    const m = /^\| `([a-z_]+)` \|/.exec(line);
    if (m) names.push(m[1] as string);
  }
  return names;
}

function diff(table: string[], registry: string[]): string {
  const missing = registry.filter((t) => !table.includes(t));
  const extra = table.filter((t) => !registry.includes(t));
  return `missing from the table: [${missing.join(", ")}]; in the table but not registered: [${extra.join(", ")}]`;
}

describe("tool tables match the registry", () => {
  for (const [file, heading] of [
    ["packages/mcp/README.md", "## Tools"],
    ["docs-site/mcp.md", "## What the tools do"],
  ] as const) {
    it(`${file} § ${heading.replace(/^#+ /, "")} lists exactly the registered tools`, async () => {
      const registry = (await (await connect()).listTools()).tools.map((t) => t.name);
      const table = toolRows(file, heading);
      expect(table.length, `${file}: no tool rows under "${heading}"`).toBeGreaterThan(0);
      expect([...table].sort(), diff(table, registry)).toEqual([...registry].sort());
    });
  }
});
