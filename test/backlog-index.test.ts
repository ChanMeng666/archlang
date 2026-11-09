/**
 * The backlog holds open work only, and `docs/backlog-index.md` lists exactly its entries
 * (card EH3.2). Both sides are derived: the headings from `docs/backlog.md`, the rows from the
 * generated index, the closed vocabulary from `scripts/backlog-archive.mjs`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEntries, renderIndex, STATUSES } from "../scripts/gen-backlog-index.js";

// A plain `.mjs` module (no declaration file): loaded by a computed specifier, as test/docs-3d.test.ts does.
const ARCHIVE = "../scripts/backlog-archive.mjs";
const { parseHeading } = (await import(/* @vite-ignore */ ARCHIVE)) as {
  parseHeading: (line: string) => { archive: boolean; status: string };
};

const read = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const backlog = read("docs/backlog.md");
const index = read("docs/backlog-index.md");

const headings = backlog.split("\n").filter((l) => /^### /.test(l));

describe("docs/backlog.md", () => {
  it("holds no archive-class status in any heading", () => {
    expect(headings.length).toBeGreaterThan(50);
    for (const h of headings) {
      const parsed = parseHeading(h);
      expect(parsed.archive, h).toBe(false);
      expect(STATUSES as readonly string[], h).toContain(parsed.status);
    }
  });

  it("flags a closed heading (the guard is not vacuous)", () => {
    expect(() => parseEntries(`${backlog}\n### X.1 · A closed thing — \`closed\`\n`)).toThrow(/status/);
    expect(parseHeading("### X.1 · A closed thing — closed by W9").archive).toBe(true);
    expect(parseHeading("### X.2 · A done thing — `done` (doors)").archive).toBe(true);
  });

  it("repeats no id", () => {
    expect(() => parseEntries(`${backlog}\n### 3.1 · Again — \`todo\`\n`)).toThrow(/duplicate id 3\.1/);
  });
});

describe("docs/backlog-index.md", () => {
  const rows = [...index.matchAll(/^\| (\S+) \| .* \| \[↗\]\(backlog\.md#([^)]+)\) \|$/gm)].map((m) => ({
    id: m[1] as string,
    anchor: m[2] as string,
  }));
  const entries = parseEntries(backlog);

  it("equals the generator output (run `npm run gen:backlog-index`)", () => {
    expect(index).toBe(renderIndex(entries));
  });

  it("has a row for every heading and a heading for every row", () => {
    expect(rows.map((r) => r.id)).toEqual(headings.map((h) => /^### (\S+) · /.exec(h)?.[1]));
    expect(rows).toHaveLength(headings.length);
  });

  it("links every row to a distinct heading anchor", () => {
    expect(new Set(rows.map((r) => r.anchor)).size).toBe(rows.length);
    for (const e of entries) expect(index).toContain(`(backlog.md#${e.anchor})`);
  });
});
