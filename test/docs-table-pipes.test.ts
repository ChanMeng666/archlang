/**
 * The bare-`|`-inside-inline-code gate — the one Markdown fault that has actually taken
 * the docs deploy down.
 *
 * GFM splits a table row into cells on `|` BEFORE any inline parsing runs. So a cell
 * written as `` `anchor|centered` `` is split mid-span: the backtick pair is severed, the
 * text stops being code, and anything angle-bracketed inside it — `<room>`, `<pos>` — leaks
 * out as raw HTML. VitePress hands that to Vue's template compiler, which fails the WHOLE
 * build with "Element is missing end tag". That is not hypothetical: it took the docs site
 * down for four consecutive pushes on 2026-07-12, and the resulting rule is an AGENTS.md
 * gotcha — "write `\|` inside table cells".
 *
 * Nothing enforced it. The core suite never compiles the site (`npm run docs:build` is the
 * only thing that would catch it), so the fault reaches CI's site-build job at best and the
 * deploy at worst, with a error message that names a Vue template rather than a table cell.
 * This test finds it in milliseconds and says exactly which cell.
 *
 * WHAT IS CHECKED, precisely: in every tracked Markdown file, for every line shaped like a
 * table row, an unescaped `|` that falls INSIDE a code span of that line. Escaped `\|` — the
 * documented workaround, used ~30 times across docs/cli-reference.md alone — is correct and
 * must stay passing, which is why the check is span-position-based rather than a naive
 * "backticks contain a pipe" regex.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Nothing is excluded. `docs/archive/` used to be, because it held a real, uncorrected
 * instance of this fault (`|to−from|` in the frozen work log) that served as the gate's
 * real-data positive control. That row was escaped on 2026-08-01 and the archive joined the
 * scanned set; the archive itself left this repository on 2026-08-26 (it is in the private
 * growth repo now). The unit-level pin at the bottom of this file is what keeps the
 * detector's fire proven, and always was — which is the only reason losing that real-data
 * control costs nothing. Re-adding an exclusion here means a Markdown file stops being
 * checked — don't, unless it genuinely cannot reach any build.
 */
const EXCLUDED_PREFIXES: string[] = [];

/** Every Markdown file git tracks (so generated site copies and node_modules never appear). */
function trackedMarkdown(): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", "*.md"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
}

/**
 * The `[start, end)` content ranges of every code span on ONE line, matched the way
 * CommonMark does it: a run of N backticks opens a span, and the NEXT run of exactly N
 * closes it; runs of a different length in between are content (which is what makes
 * `` ` ```arch ` `` — a fenced-block example quoted inline — parse correctly). A run with
 * no partner is literal text, not a span.
 */
function codeSpans(line: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const runLength = (at: number): number => {
    let n = 0;
    while (line[at + n] === "`") n++;
    return n;
  };
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    const n = runLength(i);
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      if (line[j] === "`") {
        const m = runLength(j);
        if (m === n) {
          close = j;
          break;
        }
        j += m;
      } else j++;
    }
    if (close === -1) {
      i += n; // unmatched run — literal backticks, no span
    } else {
      spans.push([i + n, close]);
      i = close + n;
    }
  }
  return spans;
}

/** Byte offsets of the cell-severing pipes on `line`: unescaped, and inside a code span. */
function severingPipes(line: string): number[] {
  const spans = codeSpans(line);
  const hits: number[] = [];
  for (let p = 0; p < line.length; p++) {
    if (line[p] !== "|") continue;
    if (p > 0 && line[p - 1] === "\\") continue; // `\|` — the documented, correct form
    if (spans.some(([s, e]) => p >= s && p < e)) hits.push(p);
  }
  return hits;
}

interface Offence {
  file: string;
  line: number;
  text: string;
  columns: number[];
}

/**
 * Scan one file. Fenced code blocks are skipped: a ```` ```md ```` example may legitimately
 * show a raw table, and it is never parsed as one.
 */
function scan(file: string): Offence[] {
  const out: Offence[] = [];
  let fence: string | null = null;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, idx) => {
      const opener = /^\s*(`{3,}|~{3,})/.exec(line);
      if (opener) {
        const marks = opener[1]!;
        if (fence === null) fence = marks;
        else if (line.trim().startsWith(fence)) fence = null;
        return;
      }
      if (fence !== null) return;
      // A table row: a line that both opens and closes with a pipe.
      if (!/^\s*\|.*\|\s*$/.test(line)) return;
      const columns = severingPipes(line);
      if (columns.length > 0) out.push({ file, line: idx + 1, text: line, columns });
    });
  return out;
}

const files = trackedMarkdown();
const scanned = files.filter((f) => !EXCLUDED_PREFIXES.some((p) => f.startsWith(p)));

describe("no Markdown table cell severs an inline code span with a bare `|`", () => {
  it("the file list is real (so a green run cannot be vacuous)", () => {
    expect(files.length, '`git ls-files -- "*.md"` returned nothing — is this a git checkout?').toBeGreaterThan(40);
    expect(scanned.length).toBeGreaterThan(files.length - 10);
    for (const required of ["README.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "docs/language-reference.md"]) {
      expect(scanned, `${required} must be in the scanned set`).toContain(required);
    }
  });

  it("every tracked, published Markdown file is clean", () => {
    const offences = scanned.flatMap(scan);
    const report = offences
      .map((o) => {
        const caret = o.columns.map((c) => " ".repeat(Math.max(0, c)) + "^").join("\n        ");
        return `  ${o.file}:${o.line}\n        ${o.text}\n        ${caret}`;
      })
      .join("\n\n");
    expect(
      offences,
      offences.length === 0
        ? ""
        : `A Markdown TABLE ROW contains an unescaped \`|\` INSIDE an inline code span:\n\n${report}\n\n` +
            `GFM splits table cells on \`|\` BEFORE inline-code parsing, so each caret above severs a ` +
            `backtick pair. Whatever follows stops being code, and any \`<token>\` inside it leaks out ` +
            `as raw HTML — VitePress/Vue then fails the ENTIRE docs build with "Element is missing end ` +
            `tag". This exact fault took the docs deploy down for four pushes on 2026-07-12; it is a ` +
            `standing AGENTS.md gotcha.\n\n` +
            `FIX: escape it — write \`\\|\` inside the code span (e.g. \`<svg\\|dxf\\|png>\`), which is ` +
            `what docs/cli-reference.md already does everywhere. Then re-run \`npm run docs:build\`: ` +
            `the core test suite does not compile the site, so that is the only full verification.`,
    ).toEqual([]);
  });

  it("recognises the escaped form as correct, and the bare form as broken", () => {
    // Unit-level pin on the two shapes, so the rule survives a refactor of the scanner.
    expect(severingPipes("| `--format, -f <svg\\|dxf\\|png>` | output format |")).toEqual([]);
    expect(severingPipes("| `anchor|centered` | how the fixture sits |")).toHaveLength(1);
    // A pipe that is genuinely a cell separator is not an offence.
    expect(severingPipes("| `left` | `right` |")).toEqual([]);
    // Backtick runs of different lengths nest, so a quoted fence marker is not a false hit.
    expect(severingPipes("| Render ` ```arch ` fences | in any Markdown |")).toEqual([]);
  });
});
