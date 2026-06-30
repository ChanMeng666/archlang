/**
 * Markdown embedding helpers (v1.8) — extract ` ```arch ` fenced blocks from a
 * Markdown document and rewrite each to an image reference, mirroring
 * mermaid-cli's markdown mode.
 *
 * Pure and isomorphic: no IO, no clock. The CLI (`arch md`) does the rendering
 * and file writes; these two functions are the testable text core. Offsets are
 * character indices into the original `md` string; {@link rewriteMarkdown}
 * splices back-to-front so earlier ranges stay valid.
 */

/** One ` ```arch ` fenced code block located in a Markdown document. */
export interface ArchBlock {
  /** 0-based order of appearance. */
  index: number;
  /** The ArchLang source inside the fence (fences excluded). */
  source: string;
  /** The info string after the opening fence (e.g. `arch`, or `arch title=…`). */
  info: string;
  /**
   * `[start, end)` char offsets covering the whole fenced block — from the
   * opening fence's indentation through the closing fence (its trailing newline
   * is left in place, so a replacement without a newline still separates cleanly).
   */
  range: [number, number];
}

/**
 * Find every fenced code block whose language is exactly `arch`. Handles ` ``` `
 * and `~~~` fences of three-or-more characters; the closing fence must use the
 * same character and be at least as long. An unterminated fence ends the scan
 * (the remainder is treated as prose, never a block).
 */
export function extractArchBlocks(md: string): ArchBlock[] {
  const blocks: ArchBlock[] = [];
  const lines = md.split("\n");
  let offset = 0; // char offset of the start of `lines[i]`
  let index = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const open = /^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)/.exec(line);
    if (open) {
      const fence = open[2];
      const lang = open[3].toLowerCase();
      const blockStart = offset;
      const closeRe = new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);

      // Walk content lines until the matching closing fence.
      let contentOffset = offset + line.length + 1; // start of the line after the opener
      const content: string[] = [];
      let j = i + 1;
      let closeEnd = -1; // offset just before the closing fence's trailing newline
      while (j < lines.length) {
        const l = lines[j];
        if (closeRe.test(l)) {
          closeEnd = contentOffset + l.length;
          break;
        }
        content.push(l);
        contentOffset += l.length + 1;
        j++;
      }

      if (closeEnd !== -1) {
        if (lang === "arch") {
          blocks.push({
            index: index++,
            source: content.join("\n"),
            info: open[3],
            range: [blockStart, Math.min(closeEnd, md.length)],
          });
        }
        offset = contentOffset + (lines[j]?.length ?? 0) + 1;
        i = j + 1;
        continue;
      }
      // Unterminated fence — stop treating the rest as fences.
    }
    offset += line.length + 1;
    i++;
  }

  return blocks;
}

/**
 * Replace each block with `replacements[block.index]`, splicing from the last
 * block to the first so the unmodified earlier offsets stay correct. A block with
 * no replacement (e.g. it failed to render) is left untouched.
 */
export function rewriteMarkdown(md: string, blocks: ArchBlock[], replacements: ReadonlyArray<string | undefined>): string {
  let out = md;
  const ordered = [...blocks].sort((a, b) => b.range[0] - a.range[0]);
  for (const b of ordered) {
    const rep = replacements[b.index];
    if (rep === undefined) continue;
    out = out.slice(0, b.range[0]) + rep + out.slice(b.range[1]);
  }
  return out;
}
