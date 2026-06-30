import { describe, expect, it } from "vitest";
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
