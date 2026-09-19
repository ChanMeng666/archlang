/**
 * Drop the leading `#` comment block from an ArchLang source — the hero's typing
 * pane only.
 *
 * WHY THIS EXISTS. `CompileSeam.vue` types `examples/laneway-house.arch` character
 * by character at 90 chars/s and compiles only when a line completes, painting the
 * sheet from the first prefix that compiles clean. That file opens with a 7-line,
 * 458-character prose header explaining how the plan is authored — real
 * documentation, and the reason the file reads well in the gallery, the README hero
 * and the playground. It is also 5.3 SECONDS of an empty sheet before the first
 * compilable prefix, which a visitor reads as a broken panel, not as a pause.
 *
 * So the HERO types the plan without its essay, and the file on disk is untouched:
 * `examples/laneway-house.arch` is what the `#z=` permalink carries, what
 * `docs-site/e2e/homepage-links.spec.ts` byte-compares, and what the gallery and the
 * README show. Only the animation's input is narrowed.
 *
 * What is NOT stripped: the inline comments in the body (`# w_hall is walked
 * lane→garden …`, `# The rug is an UNDERLAY …`). They are half of what the hero is
 * demonstrating — that a plan explains itself where a decision is made — and they
 * cost nothing, because by then the drawing is already on the sheet.
 *
 * Comments never reach the compiler, so the final drawing is byte-identical either
 * way; `test/docs-hero-source.test.ts` pins that, and the four edge cases below.
 */

/**
 * `source` with its leading run of `#` comment lines removed, along with any blank
 * lines inside or directly after that run.
 *
 * Returns `source` UNCHANGED when there is no leading comment at all, and when the
 * file is nothing but comments and blank lines — stripping either would trade a slow
 * hero for an empty one.
 */
export function stripHeaderComments(source: string): string {
  const lines = source.split("\n");
  let i = 0;
  let sawComment = false;
  while (i < lines.length) {
    const line = lines[i]!.trimStart();
    if (line.startsWith("#")) {
      sawComment = true;
      i++;
    } else if (line.trimEnd() === "") {
      i++;
    } else {
      break;
    }
  }
  // No header to strip, or nothing but a header: hand back the original bytes.
  if (!sawComment || i >= lines.length) return source;
  return lines.slice(i).join("\n");
}
