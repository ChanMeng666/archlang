/**
 * The landing hero streams a real agent-gallery plan (`docs/gallery/<id>.arch`, the pair named
 * by sync-docs.mjs's HOME_PROOFS.hero) WITHOUT its leading comment header — and nothing else
 * about that file changes.
 *
 * Why this file exists: `CompileSeam.vue` compiles only when a streamed line completes, so a
 * plan that opens with a comment block shows an empty sheet until the first statement arrives
 * (the laneway-house hero this replaced spent 5.3 seconds on its 7-line header). The fix narrows
 * the ANIMATION'S INPUT (`stripHeaderComments`), not the file: the `#z=` permalink, /gallery and
 * `docs-site/e2e/homepage-links.spec.ts` all still see the agent's file byte for byte.
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

/** The hero pair sync-docs.mjs's HOME_PROOFS names, read from that table (the generated
 *  home-data.js does not exist on a fresh checkout). */
const HERO_ID = /hero: \{ gallery: "([^"]+)" \}/.exec(readFileSync("docs-site/sync-docs.mjs", "utf8"))?.[1] ?? "";
/** Its source, LF-normalised exactly as `sync-docs.mjs` reads it. */
const HERO_SOURCE = readFileSync(`docs/gallery/${HERO_ID}.arch`, "utf8").replace(/\r\n/g, "\n");

vitestDescribe("the hero streams the agent's plan without its header comments", () => {
  it("names a real agent-gallery pair, brief and plan", () => {
    expect(HERO_ID).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(readFileSync(`docs/gallery/${HERO_ID}.brief.txt`, "utf8").trim().length).toBeGreaterThan(50);
  });

  it("removes only the leading comment lines, and the plan starts at once", () => {
    const typed = stripHeaderComments(HERO_SOURCE);
    const removed = HERO_SOURCE.slice(0, HERO_SOURCE.length - typed.length);
    expect(removed.split("\n").filter((l) => l.trim() !== "").length).toBeGreaterThan(0);
    expect(removed.split("\n").every((l) => l.trim() === "" || l.trimStart().startsWith("#"))).toBe(true);
    expect(typed.startsWith('plan "')).toBe(true);
    // The comments inside the plan stay: they are what the agent wrote at each decision.
    const all = HERO_SOURCE.split("\n").filter((l) => l.trimStart().startsWith("#")).length;
    const kept = typed.split("\n").filter((l) => l.trimStart().startsWith("#")).length;
    expect(kept).toBe(all - removed.split("\n").filter((l) => l.trim() !== "").length);
    expect(kept).toBeGreaterThan(0);
  });

  it("draws and describes the same plan: comments never reach the compiler", () => {
    const full = compile(HERO_SOURCE, { noCache: true });
    const typed = compile(stripHeaderComments(HERO_SOURCE), { noCache: true });
    expect(full.errors).toHaveLength(0);
    expect(typed.errors).toHaveLength(0);
    expect(typed.svg).toBe(full.svg);
    expect(describe(stripHeaderComments(HERO_SOURCE))).toEqual(describe(HERO_SOURCE));
  });

  it("the file on disk still carries the header: only the animation is narrowed", () => {
    // The `#z=` permalink and /gallery read this file; homepage-links.spec.ts decodes the
    // hero's link back to it byte for byte.
    expect(HERO_SOURCE.startsWith("#")).toBe(true);
  });
});
