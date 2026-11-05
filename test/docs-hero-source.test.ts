/**
 * The landing hero streams a plan WITHOUT its leading comment header, and nothing else about the
 * file changes.
 *
 * Why this file exists: `CompileSeam.vue` compiles only when a streamed line completes, so a plan
 * that opens with a comment block shows an empty sheet until the first statement arrives (the
 * laneway-house hero spent 5.3 seconds on its 7-line header). The fix narrows the ANIMATION'S
 * INPUT (`stripHeaderComments`), not the file: the `#z=` permalink still carries it byte for byte.
 *
 * The hero displays an agent-gallery pair, and the gallery is not pinned corpus: no test but
 * test/agent-gallery.test.ts reads it (that file's isolation law). So the compiler half below runs
 * on the hero's FALLBACK, an example from examples/, which is corpus; the gallery pair itself is
 * only ever proved by the built page (docs-site/e2e).
 *
 * Two things are pinned here that a browser would never notice going wrong:
 *   1. the function's edge cases — a header that is only blank lines away from the
 *      code, an inline `#` on a statement line, a file with no header, a file that is
 *      NOTHING but header;
 *   2. that stripping the header is a no-op for the COMPILER — the hero must still
 *      draw the same plan, byte for byte, and still describe it the same way (the
 *      sheet's title block is `describe(raw).plan`).
 *
 * NB it imports the docs-site module directly. That is safe where
 * `test/arch-highlight.test.ts` had to go through `new Function`: this is a `.ts`
 * module with no imports of its own, so it joins the root program cleanly — the
 * `allowJs: false` wall that blocks a generated `.js` artifact is not in play.
 */

import { readFileSync } from "node:fs";
import { describe as vitestDescribe, expect, it } from "vitest";
import { stripHeaderComments } from "../docs-site/.vitepress/theme/strip-header-comments.js";
import { compile, describe } from "../src/index.js";

vitestDescribe("stripHeaderComments", () => {
  it("drops the leading comment block and the blank lines inside it", () => {
    const src = ["# title", "#", "", "# still the header", "", 'plan "P" {', "  units mm", "}"].join("\n");
    expect(stripHeaderComments(src)).toBe(['plan "P" {', "  units mm", "}"].join("\n"));
  });

  it("keeps an inline `#` comment on a code line", () => {
    const src = ["# header", 'plan "P" {', "  grid 50  # partitions are 100 thick", "}"].join("\n");
    expect(stripHeaderComments(src)).toBe(['plan "P" {', "  grid 50  # partitions are 100 thick", "}"].join("\n"));
  });

  it("keeps a comment that sits INSIDE the body, after code has started", () => {
    const src = ["# header", 'plan "P" {', "  # a decision, explained where it is made", "  units mm", "}"].join("\n");
    expect(stripHeaderComments(src)).toBe(
      ['plan "P" {', "  # a decision, explained where it is made", "  units mm", "}"].join("\n"),
    );
  });

  it("returns a file with no header unchanged, byte for byte", () => {
    const src = ['plan "P" {', "  units mm", "}"].join("\n");
    expect(stripHeaderComments(src)).toBe(src);
  });

  it("returns a file that is ONLY comments unchanged — never empty", () => {
    const src = ["# all", "#", "# comment", ""].join("\n");
    expect(stripHeaderComments(src)).toBe(src);
    expect(stripHeaderComments("")).toBe("");
    expect(stripHeaderComments("\n\n")).toBe("\n\n");
  });

  it("tolerates an indented header line", () => {
    expect(stripHeaderComments(["  # indented", 'plan "P" {}'].join("\n"))).toBe('plan "P" {}');
  });
});

/** The example sync-docs.mjs's HOME_PROOFS.hero falls back to, read from that table. */
const FALLBACK = /hero: \{ gallery: "[^"]+", fallback: "([^"]+)" \}/.exec(
  readFileSync("docs-site/sync-docs.mjs", "utf8"),
)?.[1];
const SOURCE = readFileSync(`examples/${FALLBACK}.arch`, "utf8").replace(/\r\n/g, "\n");

vitestDescribe("stripping the header is a no-op for the compiler", () => {
  it("the hero names an example to fall back to", () => {
    expect(FALLBACK).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(SOURCE.startsWith("#"), "the fallback opens with a header, so this proves something").toBe(true);
  });

  it("removes only the leading comment lines, and the plan starts at once", () => {
    const typed = stripHeaderComments(SOURCE);
    const removed = SOURCE.slice(0, SOURCE.length - typed.length);
    expect(removed.split("\n").every((l) => l.trim() === "" || l.trimStart().startsWith("#"))).toBe(true);
    expect(typed.startsWith('plan "')).toBe(true);
  });

  it("draws and describes the same plan: comments never reach the compiler", () => {
    const full = compile(SOURCE, { noCache: true });
    const typed = compile(stripHeaderComments(SOURCE), { noCache: true });
    expect(full.errors).toHaveLength(0);
    expect(typed.errors).toHaveLength(0);
    expect(typed.svg).toBe(full.svg);
    expect(describe(stripHeaderComments(SOURCE))).toEqual(describe(SOURCE));
  });
});
