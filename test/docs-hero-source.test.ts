/**
 * The landing hero types `examples/laneway-house.arch` WITHOUT its leading prose
 * header — and nothing else about that file changes.
 *
 * Why this file exists: the hero's right-hand pane was an empty sheet for the first
 * 5.3 seconds of the animation, because `CompileSeam.vue` compiles only when a typed
 * line completes and the example opens with a 7-line, 458-character comment block.
 * The fix narrows the ANIMATION'S INPUT (`stripHeaderComments`), not the file: the
 * `#z=` permalink, the gallery, the README hero and `docs-site/e2e/homepage-links.spec.ts`
 * all still see `examples/laneway-house.arch` byte for byte.
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

/** The hero's own source, LF-normalised exactly as `sync-docs.mjs` reads it. */
const HERO_SOURCE = readFileSync("examples/laneway-house.arch", "utf8").replace(/\r\n/g, "\n");

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

vitestDescribe("the hero types laneway-house without its essay", () => {
  it("removes exactly the seven-line header and nothing else", () => {
    const typed = stripHeaderComments(HERO_SOURCE);
    const removed = HERO_SOURCE.slice(0, HERO_SOURCE.length - typed.length);
    expect(removed.split("\n").filter((l) => l.trim() !== "")).toHaveLength(7);
    expect(removed.split("\n").every((l) => l.trim() === "" || l.trimStart().startsWith("#"))).toBe(true);
    expect(typed.startsWith('plan "Laneway House" {')).toBe(true);
    // The saving is the whole point: quote it, so a shrinking header shows up here.
    expect(removed.length).toBeGreaterThan(400);
  });

  it("keeps the inline comments — they are what the hero is demonstrating", () => {
    const typed = stripHeaderComments(HERO_SOURCE);
    expect(typed).toContain("is walked lane→garden");
    expect(typed).toContain("The rug is an UNDERLAY");
    // Every comment line the file has, minus the seven-line header.
    const all = HERO_SOURCE.split("\n").filter((l) => l.trimStart().startsWith("#")).length;
    const kept = typed.split("\n").filter((l) => l.trimStart().startsWith("#")).length;
    expect(kept).toBe(all - 7);
  });

  it("draws and describes the same plan — comments never reach the compiler", () => {
    const full = compile(HERO_SOURCE, { noCache: true });
    const typed = compile(stripHeaderComments(HERO_SOURCE), { noCache: true });
    expect(full.errors).toHaveLength(0);
    expect(typed.errors).toHaveLength(0);
    expect(typed.svg).toBe(full.svg);
    expect(describe(stripHeaderComments(HERO_SOURCE))).toEqual(describe(HERO_SOURCE));
  });

  it("the file on disk still carries the header — only the animation is narrowed", () => {
    // The `#z=` permalink, the gallery and docs-site/e2e/homepage-links.spec.ts all
    // read this file; "fixing" it here would break the byte comparison there.
    expect(HERO_SOURCE.startsWith("# A one-bedroom laneway cottage")).toBe(true);
  });
});
