import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORMAT_LIST } from "../src/cli/io.js";
import { extractArchBlocks, rewriteMarkdown } from "../src/index.js";

/**
 * Pure markdown-embedding helpers behind `arch md`: locate ```arch fenced blocks
 * and rewrite them to image links. No IO — offsets index into the input string.
 */

describe("extractArchBlocks", () => {
  it("finds a single arch block with its source, info, and a range covering the fences", () => {
    const md = '# Title\n\n```arch\nplan "X" { room at (0,0) size 1x1 }\n```\n\nafter\n';
    const blocks = extractArchBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].index).toBe(0);
    expect(blocks[0].info).toBe("arch");
    expect(blocks[0].source).toBe('plan "X" { room at (0,0) size 1x1 }');
    const slice = md.slice(blocks[0].range[0], blocks[0].range[1]);
    expect(slice.startsWith("```arch")).toBe(true);
    expect(slice.trimEnd().endsWith("```")).toBe(true);
  });

  it("indexes multiple blocks in order and ignores non-arch fences", () => {
    const md = ["```js", "const x = 1;", "```", "", "```arch", "a", "```", "", "```arch", "b", "```"].join("\n");
    const blocks = extractArchBlocks(md);
    expect(blocks.map((b) => b.index)).toEqual([0, 1]);
    expect(blocks.map((b) => b.source)).toEqual(["a", "b"]);
  });

  it("supports ~~~ fences", () => {
    const md = "~~~arch\nplan x\n~~~\n";
    const blocks = extractArchBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].source).toBe("plan x");
  });

  it("ignores an unterminated fence (no block)", () => {
    const md = "```arch\nplan x\nnever closed\n";
    expect(extractArchBlocks(md)).toHaveLength(0);
  });

  it("returns nothing for a doc with no arch blocks", () => {
    expect(extractArchBlocks("# just prose\n\nno code here\n")).toEqual([]);
  });
});

describe("rewriteMarkdown", () => {
  it("replaces each block with its image link and keeps surrounding text", () => {
    const md = "intro\n\n```arch\nplan x\n```\n\noutro\n";
    const blocks = extractArchBlocks(md);
    const out = rewriteMarkdown(md, blocks, ["![Plan 1](p-1.svg)"]);
    expect(out).toContain("intro");
    expect(out).toContain("![Plan 1](p-1.svg)");
    expect(out).toContain("outro");
    expect(out).not.toContain("plan x");
  });

  it("leaves a block untouched when its replacement is undefined", () => {
    const md = "```arch\nok\n```\n\n```arch\nbad\n```\n";
    const blocks = extractArchBlocks(md);
    const out = rewriteMarkdown(md, blocks, ["![ok](a.svg)", undefined]);
    expect(out).toContain("![ok](a.svg)");
    expect(out).toContain("bad"); // the second block stays as source
  });

  it("splices back-to-front so multiple replacements stay aligned", () => {
    const md = "```arch\na\n```\n\n```arch\nb\n```\n";
    const blocks = extractArchBlocks(md);
    const out = rewriteMarkdown(md, blocks, ["[[A]]", "[[B]]"]);
    expect(out.indexOf("[[A]]")).toBeLessThan(out.indexOf("[[B]]"));
    expect(out).not.toContain("```");
  });
});

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const MD_DOC = '# doc\n\n```arch\nplan "P" { units mm room at (0,0) size 3000x3000 label "Hall" }\n```\n';

function writeDoc(): { dir: string; doc: string } {
  const dir = mkdtempSync(join(tmpdir(), "arch-md-"));
  const doc = join(dir, "doc.md");
  writeFileSync(doc, MD_DOC, "utf8");
  return { dir, doc };
}

/**
 * `arch md` routes `-f` through the one shared `parseFormat`, so an unknown id gets
 * the same full-format-list error as every other command, and a *known but
 * unembeddable* id (dxf/pdf/txt) gets the subset error. Both are usage errors (3).
 */
describe("CLI — md format handling", () => {
  it("renders the arch blocks with the default svg format, exit 0", () => {
    const { dir, doc } = writeDoc();
    const out = join(dir, "doc.out.md");
    const r = run(["md", doc, "-o", out, "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.blocks).toBe(1);
    expect(j.images[0].format).toBe("svg");
    expect(existsSync(join(dir, "doc.out-1.svg"))).toBe(true);
    expect(readFileSync(out, "utf8")).toContain("![Floor plan 1](doc.out-1.svg)");
  }, 60000);

  it("accepts -f png (the other embeddable format)", () => {
    const { dir, doc } = writeDoc();
    const out = join(dir, "doc.out.md");
    const r = run(["md", doc, "-o", out, "-f", "png", "--json"]);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.images[0].format).toBe("png");
  }, 60000);

  it("rejects a known-but-unembeddable format (-f dxf) with exit 3, naming the svg|png subset", () => {
    const { doc } = writeDoc();
    const r = run(["md", doc, "-f", "dxf"]);
    expect(r.status).toBe(3);
    expect(r.stderr.trim()).toBe('error: md supports -f svg or png (got "dxf")');
  }, 60000);

  it("rejects an unknown format (-f bogus) with exit 3 and the shared format-list message", () => {
    const { doc } = writeDoc();
    const r = run(["md", doc, "-f", "bogus"]);
    expect(r.status).toBe(3);
    expect(r.stderr.trim()).toBe(`error: unknown format "bogus" (use ${FORMAT_LIST})`);
  }, 60000);
});
