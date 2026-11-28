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
const { parseHeading, archiveBacklog, citingFiles, cited } = (await import(/* @vite-ignore */ ARCHIVE)) as {
  parseHeading: (line: string) => { archive: boolean; status: string };
  citingFiles: (files: string[]) => string[];
  cited: (id: string, lines: string[]) => boolean;
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

  it("leaves an already-normalised kept heading as it was (no repeated status word)", () => {
    const kept = [
      "### K.1 · A note: done elsewhere — `note`",
      "### K.2 · Waits on the owner — `decision`",
      "### K.3 · Open work — `todo`",
      "### K.4 · Declared work — `declared`",
    ];
    const text = archiveBacklog(
      ["# Backlog", "", "## Kept", "", ...kept.flatMap((h) => [h, "", "body", ""])].join("\n"),
      [],
    ).text;
    expect(text.split("\n").filter((l) => l.startsWith("### "))).toEqual(kept);
  });

  it("keeps a tombstone or closure line that follows an archived entry in the backlog", () => {
    const tomb = "- T.2 · Archived before — done by #2 → archived (lab)";
    const closure = ["- T.3 · Closed in place — closed by #3 (the line is", "  wrapped)"];
    const doc = [
      "# Backlog",
      "",
      "## S",
      "",
      "### T.1 · Done now — `done` by #1",
      "",
      "body",
      "",
      tomb,
      "",
      "### T.4 · Done too — `done` by #4",
      "",
      "body",
      "",
      ...closure,
      "",
      "### T.5 · Open — `todo`",
      "",
      "body",
      "",
    ].join("\n");
    const r = archiveBacklog(doc, ["see T.1"]);
    expect(r.archived).toBe(2);
    expect(r.tombstoned).toEqual(["T.1"]);
    expect(r.text).toContain(`- T.1 · Done now — done by #1 → archived (lab)\n${tomb}\n`);
    expect(r.text).toContain(`${closure.join("\n")}\n\n### T.5 · Open — \`todo\``);
    expect(r.arch.join("\n")).not.toContain("T.2 ·");
    expect(r.arch.join("\n")).not.toContain("T.3 ·");
    // A second run moves nothing.
    expect(archiveBacklog(r.text, ["see T.1"]).text).toBe(r.text);
  });

  it("reads an id inside a cited range as cited", () => {
    expect(cited("NR.12", ["review residue is backlog NR.1–NR.16"])).toBe(true);
    expect(cited("NR.12", ["NR.10–14"])).toBe(true);
    expect(cited("NR.12", ["NR.1–NR.9, NR.11, NR.13–NR.15"])).toBe(false);
  });

  it("does not read the generated index as a citation", () => {
    expect(
      citingFiles(["docs/backlog.md", "docs/backlog-index.md", "docs/plans/x.md", "src/a.ts", "a.png", ""]),
    ).toEqual(["docs/plans/x.md", "src/a.ts"]);
  });
});
