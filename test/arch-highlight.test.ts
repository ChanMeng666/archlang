/**
 * The docs site's ArchLang highlighter — the vocabulary weld and the three properties
 * that make it safe to render through `v-html`.
 *
 * Why this file exists: `docs-site/.vitepress/theme/arch-highlight.js` REPLACED a
 * hand-typed ~200-word keyword Set inside `CompileSeam.vue` that carried a "keep this in
 * step with src/grammar/tokens.ts" comment — and was already behind it. The generator is
 * the fix; this is the gate that stops the same thing growing back. `grammar-drift.test.ts`
 * welds the committed artifact to `renderHighlighter()`; this welds `renderHighlighter()`
 * to `KEYWORDS`, and pins the behaviour its two call sites depend on.
 *
 * NB it evaluates the GENERATOR's output rather than importing the generated `.js`. A
 * static import would drag a `docs-site` module into the ROOT tsconfig program — where
 * `allowJs` is off — and fail `typecheck:all` with a TS2307 (AGENTS.md: `exclude` cannot
 * hold a file out of a program it was imported into). `test/share-codec.test.ts` uses the
 * same `new Function` idiom on `ArchLive.vue`'s inline codec for the same reason.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderHighlighter } from "../scripts/gen-grammars.js";
import { KEYWORDS } from "../src/grammar/tokens.js";

const ARTIFACT = "docs-site/.vitepress/theme/arch-highlight.js";
const STYLE_CSS = "docs-site/.vitepress/theme/style.css";

const GENERATED = renderHighlighter();

/** The generated module, evaluated. It imports nothing, so stripping `export` is enough. */
const mod = new Function(`${GENERATED.replace(/^export /gm, "")}\nreturn { highlightArch, TOKEN_CLASSES };`)() as {
  highlightArch: (s: string) => string;
  TOKEN_CLASSES: string[];
};

/** The `new Set([...])` literal the generator wrote for a category, as a string list. */
function emittedSet(name: string): string[] {
  const m = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`).exec(GENERATED);
  expect(m, `the generator no longer emits \`const ${name} = new Set([…])\``).toBeTruthy();
  return [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1] as string);
}

/** Strip the spans and un-escape, recovering the plain text a highlighted run came from. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

describe("the docs highlighter's vocabulary IS src/grammar/tokens.ts", () => {
  it.each([
    ["CONTROL", KEYWORDS.control],
    ["ELEMENT", KEYWORDS.element],
    ["ATTR", KEYWORDS.attribute],
    ["ENUM", KEYWORDS.enum],
  ])("%s equals its KEYWORDS category, in order", (name, expected) => {
    expect(
      emittedSet(name),
      `${ARTIFACT} carries a keyword list that is not src/grammar/tokens.ts's. This module ` +
        `REPLACED a hand-typed Set in CompileSeam.vue precisely so the docs site could not ` +
        `colour a vocabulary the parser does not have; it must never grow one of its own. ` +
        `Regenerate with \`npm run gen:grammars\`.`,
    ).toEqual([...expected]);
  });

  it("classifies each category into the role the playground gives it", () => {
    const role = (word: string): string | null => {
      const m = /class="ahl-([a-z]+)"/.exec(mod.highlightArch(word));
      return m?.[1] ?? null;
    };
    expect(role(KEYWORDS.control[0] as string)).toBe("keyword");
    expect(role(KEYWORDS.element[0] as string)).toBe("typename");
    expect(role(KEYWORDS.attribute[0] as string)).toBe("propertyname");
    expect(role(KEYWORDS.enum[0] as string)).toBe("atom");
    // A word in no category stays ground-coloured — the same as CodeMirror's
    // `variableName`, which its HighlightStyle deliberately gives no colour.
    expect(role("some_room_id")).toBeNull();
  });
});

describe("the tokenizer is total, lossless and injection-proof", () => {
  const plan = readFileSync("examples/laneway-house.arch", "utf8").replace(/\r\n/g, "\n");

  it("every PREFIX round-trips to itself", () => {
    // CompileSeam re-highlights a growing prefix on every animation frame, so
    // "lossless on a complete file" is not the property that matters — this is.
    // It is also a de-facto performance gate: ~2.7 KB x ~2 700 prefixes is millions
    // of characters, which a backtracking tokenizer would not get through.
    for (let i = 0; i <= plan.length; i++) {
      expect(plain(mod.highlightArch(plan.slice(0, i)))).toBe(plan.slice(0, i));
    }
  });

  it("a truncated string stays a string and a truncated comment stays a comment", () => {
    // Without this, a half-typed `label "Livi` flickers between "string" and
    // "stray quote + identifier" on every keystroke of the hero animation.
    expect(mod.highlightArch('room label "Livi')).toContain('class="ahl-string"');
    expect(mod.highlightArch("# a plan for")).toContain('class="ahl-comment"');
  });

  it("hostile source reaches the page as text, never as markup", () => {
    // Both call sites render this through `v-html`, which is unescaped by construction.
    const out = mod.highlightArch('# <img src=x onerror="alert(1)">\nroom label "<script>"');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img");
    // …including the runs BETWEEN tokens, which is the easy half to forget.
    expect(mod.highlightArch("<b>&</b>")).not.toContain("<b>");
  });

  it("is deterministic — the module-level /g regex carries no cursor between calls", () => {
    expect(mod.highlightArch(plan)).toBe(mod.highlightArch(plan));
    // Interleaving two sources must not corrupt either.
    const a = mod.highlightArch(plan);
    mod.highlightArch('plan "other" { units mm }');
    expect(mod.highlightArch(plan)).toBe(a);
  });
});

describe("every class the tokenizer can emit has exactly one colour rule", () => {
  it("style.css declares `.ahl-<n> { color: var(--syn-<n>) }` for each, and no others", () => {
    const css = readFileSync(STYLE_CSS, "utf8");
    const declared = [...css.matchAll(/\.ahl-([a-z]+)\s*\{\s*color:\s*var\(--syn-([a-z]+)\)/g)];
    expect(
      declared.map((m) => m[1] as string).sort(),
      `${STYLE_CSS}'s .ahl-* rules are not the set the tokenizer can emit. An unstyled token ` +
        `renders as flat --src-fg with no error anywhere — the exact failure this whole change ` +
        `was made to remove.`,
    ).toEqual([...mod.TOKEN_CLASSES].sort());
    for (const m of declared) {
      expect(m[1], "an .ahl-* class must be coloured by the --syn-* token of the SAME name").toBe(m[2]);
    }
  });

  it("colours only through var(--syn-*) — no hex may appear beside the classes", () => {
    // The palette lives in the shared token block (duplicated byte-identically in
    // playground/src/styles/tokens.css) plus gen-grammars.ts's CodeMirror fallbacks and
    // config.ts's Shiki theme. This file must never become a fifth copy.
    expect(GENERATED, `${ARTIFACT} must not contain a colour literal`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
