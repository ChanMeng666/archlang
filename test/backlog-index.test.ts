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
const { parseHeading, archiveBacklog } = (await import(/* @vite-ignore */ ARCHIVE)) as {
  parseHeading: (line: string) => { archive: boolean; status: string };
  archiveBacklog: (
    src: string,
    otherLines: string[],
  ) => { text: string; arch: string[]; archived: number; tombstoned: string[] };
};

/** GitHub's heading anchor, written independently of the generator: a character walk, no regex stripping. */
function githubSlug(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    if (ch === " ") out += "-";
    else if (ch === "-" || ch === "_" || /[\p{L}\p{N}\p{M}]/u.test(ch)) out += ch;
  }
  return out;
}

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

  it("anchors equal GitHub's slug of the heading, underscores kept", () => {
    expect(githubSlug("C.6 · `W_PATH_TOO_NARROW` names fewer — `todo`")).toBe(
      "c6--w_path_too_narrow-names-fewer--todo",
    );
    const seen = new Map<string, number>();
    const expected = headings.map((h) => {
      const base = githubSlug(h.slice(4).replaceAll("`", ""));
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n === 0 ? base : `${base}-${n}`;
    });
    expect(rows.map((r) => r.anchor)).toEqual(expected);
    expect(rows.some((r) => r.anchor.includes("_"))).toBe(true);
  });

  it("links every row to a distinct heading anchor", () => {
    expect(new Set(rows.map((r) => r.anchor)).size).toBe(rows.length);
    for (const e of entries) expect(index).toContain(`(backlog.md#${e.anchor})`);
  });
});

describe("scripts/backlog-archive.mjs", () => {
  const src = [
    "# Backlog",
    "",
    "## Probes",
    "",
    "Section prose.",
    "",
    "### P.1 · Closed, uncited — closed",
    "",
    "body one",
    "",
    "### P.2 · Closed, cited from code — closed by W5a",
    "",
    "body two",
    "",
    "## Gone",
    "",
    "### G.1 · Closed, uncited — closed",
    "",
    "body",
    "",
    "## Open",
    "",
    "### O.1 · Waits on the owner — `todo` (needs a decision)",
    "",
    "body",
    "",
  ].join("\n");

  it("keeps a section whose only surviving trace is a tombstone, and drops one with none", () => {
    const r = archiveBacklog(src, ["// see docs/backlog.md P.2"]);
    expect(r.tombstoned).toEqual(["P.2"]);
    expect(r.text).toContain("## Probes");
    expect(r.text).toContain("- P.2 · Closed, cited from code — closed by W5a → archived (lab)");
    expect(r.text).not.toContain("P.1 ·");
    expect(r.text).not.toContain("## Gone");
    expect(r.archived).toBe(3);
    expect(r.arch.join("\n")).toContain("body two");
  });

  it("reads a todo that needs a decision as `decision`", () => {
    expect(archiveBacklog(src, []).text).toContain("### O.1 · Waits on the owner (needs a decision) — `decision`");
  });
});
