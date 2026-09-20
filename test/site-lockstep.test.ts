/**
 * Site lockstep gate — the "change one, change the other" laws AGENTS.md states in prose
 * but nothing enforced.
 *
 * Three duplications exist on purpose (the two site build systems cannot share a CSS
 * import, and a `var()` cannot cross into an SVG data URI), so each one is a place the
 * brand can silently fork:
 *
 *   1. the shared brand TOKEN BLOCK, duplicated byte-identically in
 *      `playground/src/styles/tokens.css` and `docs-site/.vitepress/theme/style.css`
 *      (AGENTS.md → "Token-lockstep law" + the brand iron law);
 *   2. the eight `--syn-*` syntax colours, which additionally appear as literal
 *      fallbacks in `scripts/gen-grammars.ts` and as the `archlangLight` Shiki theme in
 *      `docs-site/.vitepress/config.ts` — AGENTS.md: "Change a syntax colour in ALL FOUR
 *      places, then `npm run gen:grammars`";
 *   3. the two CodeMirror lint-squiggle hexes in `playground/src/editor-setup.ts`, the one
 *      legitimate fixed hex left in the site sources (ADR 0014 retired the rest), which
 *      AGENTS.md says to "keep in step with `--redline` / `--warn-ink` by hand".
 *
 * Everything is located by CONTENT anchors (comment markers, token names, CSS selectors),
 * never by line number, so moving a block around is fine and changing a value is not.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TOKENS_CSS = "playground/src/styles/tokens.css";
const STYLE_CSS = "docs-site/.vitepress/theme/style.css";
const GEN_GRAMMARS = "scripts/gen-grammars.ts";
const VP_CONFIG = "docs-site/.vitepress/config.ts";
const EDITOR_SETUP = "playground/src/editor-setup.ts";
const GEN_STATIC = "playground/scripts/gen-static.mjs";

const read = (f: string) => readFileSync(f, "utf8");

/** The first line of the shared block's own header comment — the content anchor. */
const BLOCK_MARKER = "/* ── The Compile Boundary — shared brand tokens";

/**
 * The shared brand token block: from its header comment through the end of the enclosing
 * `:root { … }` rule. Anchored on the comment text and the first line-initial `}` after it
 * (no nested rule lives inside the block), so neither file's line numbers matter.
 */
function sharedTokenBlock(file: string, text: string): string {
  const start = text.indexOf(BLOCK_MARKER);
  expect(
    start,
    `${file} no longer contains the shared brand token block's header comment ` +
      `(${JSON.stringify(BLOCK_MARKER)}). That comment IS the anchor for the AGENTS.md ` +
      `"Token-lockstep law" — the block must stay byte-identical in ${TOKENS_CSS} and ${STYLE_CSS}.`,
  ).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n}", start);
  expect(end, `${file}: the shared token block's enclosing \`:root { … }\` rule is unterminated.`).toBeGreaterThan(
    start,
  );
  // The block must be the body of a `:root` rule in both files, not some other selector.
  expect(
    text.slice(Math.max(0, start - 10), start),
    `${file}: the shared token block must be the first thing inside a \`:root {\` rule.`,
  ).toBe(":root {\n  ");
  return text.slice(start, end + 2);
}

/** `--syn-<name>: #hex` declarations in a CSS file, as name → hex. */
function synFromCss(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/--syn-([a-z]+)\s*:\s*(#[0-9a-f]{3,8})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

/** Any `--<name>: #hex` / `--<name>: <value>;` declaration in the shared block. */
function tokenValue(text: string, name: string): string {
  const m = text.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  expect(m, `the shared token block no longer declares \`--${name}\`.`).toBeTruthy();
  return m![1]!.trim();
}

describe("brand token block stays byte-identical across the two sites (AGENTS.md: Token-lockstep law)", () => {
  const tokens = read(TOKENS_CSS);
  const style = read(STYLE_CSS);

  it("both files still carry the shared block", () => {
    expect(sharedTokenBlock(TOKENS_CSS, tokens).length).toBeGreaterThan(500);
    expect(sharedTokenBlock(STYLE_CSS, style).length).toBeGreaterThan(500);
  });

  it("the two copies are byte-for-byte the same text", () => {
    const a = sharedTokenBlock(TOKENS_CSS, tokens);
    const b = sharedTokenBlock(STYLE_CSS, style);
    expect(
      b,
      `The shared brand token block has FORKED.\n` +
        `  ${TOKENS_CSS}\n  ${STYLE_CSS}\n` +
        `AGENTS.md's "Token-lockstep law" (and the brand iron law) require this block to be ` +
        `duplicated BYTE-IDENTICALLY in both files — the two build systems cannot share a CSS ` +
        `import, so the duplication is the source of truth. Change one, change the other.`,
    ).toBe(a);
  });

  it("declares the tokens the design system is stated in terms of", () => {
    const block = sharedTokenBlock(TOKENS_CSS, tokens);
    for (const name of ["plum", "plum-deep", "src-bg", "src-surface", "paper", "ink", "redline", "warn-ink"]) {
      expect(tokenValue(block, name)).toMatch(/^#[0-9a-f]{6}$/);
    }
    // ONE LIGHT WORLD (ADR 0014): the opt-out of Chromium's forced Auto Dark stays.
    expect(block).toContain("color-scheme: only light;");
  });
});

describe("the --syn-* palette is the same in all four places (AGENTS.md: one syntax palette, three renderers)", () => {
  const tokens = read(TOKENS_CSS);
  const canonical = synFromCss(sharedTokenBlock(TOKENS_CSS, tokens));

  it(`${TOKENS_CSS} declares exactly the eight syntax tokens`, () => {
    expect(Object.keys(canonical).sort()).toEqual([
      "atom",
      "comment",
      "keyword",
      "number",
      "operator",
      "propertyname",
      "string",
      "typename",
    ]);
  });

  it(`${STYLE_CSS} carries the identical name→hex map`, () => {
    expect(
      synFromCss(sharedTokenBlock(STYLE_CSS, read(STYLE_CSS))),
      `The --syn-* palette differs between ${TOKENS_CSS} and ${STYLE_CSS} — a syntax colour ` +
        `must change in ALL FOUR places (both token blocks, ${GEN_GRAMMARS}'s fallbacks, and ` +
        `${VP_CONFIG}'s archlangLight Shiki theme), then \`npm run gen:grammars\`.`,
    ).toEqual(canonical);
  });

  it(`${GEN_GRAMMARS}'s literal fallbacks repeat the same hexes`, () => {
    const fallbacks: Record<string, string> = {};
    for (const m of read(GEN_GRAMMARS).matchAll(/var\(--syn-([a-z]+),\s*(#[0-9a-f]{3,8})\)/g)) fallbacks[m[1]!] = m[2]!;
    expect(
      fallbacks,
      `${GEN_GRAMMARS}'s \`var(--syn-*, <fallback>)\` hexes drifted from the shared token block ` +
        `(${TOKENS_CSS}). These fallbacks are what CodeMirror paints when the token block is absent, ` +
        `so they must repeat the same values. Fix the fallback, then \`npm run gen:grammars\`.`,
    ).toEqual(canonical);
  });

  /**
   * The Shiki theme is scope-keyed, not token-keyed, so the correspondence is written out
   * here rather than inferred. Each entry names the TextMate scope `archlangLight` colours
   * and the `--syn-*` token that scope is the docs-fence rendering of.
   */
  const SCOPE_TO_TOKEN: ReadonlyArray<readonly [string, string]> = [
    ["comment", "comment"],
    ["string", "string"],
    ["constant.numeric", "number"],
    ["constant.language", "atom"],
    ["keyword", "keyword"],
    ["storage.type", "typename"],
    ["entity.name.function", "propertyname"],
    ["keyword.operator", "operator"],
  ];

  it(`${VP_CONFIG}'s archlangLight Shiki theme paints the same hexes`, () => {
    const config = read(VP_CONFIG);
    const start = config.indexOf("const archlangLight = {");
    expect(start, `${VP_CONFIG} no longer defines \`const archlangLight = {\` — the docs fence theme.`).toBeGreaterThan(
      -1,
    );
    const theme = config.slice(start, config.indexOf("\n};", start));

    /** scope name → the foreground hex the theme gives it. */
    const byScope = new Map<string, string>();
    for (const m of theme.matchAll(/scope:\s*\[([^\]]*)\][\s\S]{0,120}?foreground:\s*"(#[0-9a-f]{3,8})"/g)) {
      for (const raw of m[1]!.split(",")) {
        const scope = raw.trim().replace(/^["']|["']$/g, "");
        if (scope) byScope.set(scope, m[2]!);
      }
    }

    const fromTheme: Record<string, string> = {};
    for (const [scope, token] of SCOPE_TO_TOKEN) {
      expect(
        byScope.has(scope),
        `${VP_CONFIG}'s archlangLight theme no longer colours the \`${scope}\` scope — the docs ` +
          `fences would stop rendering \`--syn-${token}\`. Update SCOPE_TO_TOKEN here if the scope ` +
          `was deliberately renamed.`,
      ).toBe(true);
      fromTheme[token] = byScope.get(scope)!;
    }
    expect(
      fromTheme,
      `${VP_CONFIG}'s archlangLight Shiki theme drifted from the shared token block (${TOKENS_CSS}). ` +
        `The docs fences, the docs hero and the playground editor render ONE palette — a syntax ` +
        `colour changes in all four places (both token blocks, ${GEN_GRAMMARS}, this theme), then ` +
        `\`npm run gen:grammars\`.`,
    ).toEqual(canonical);
  });

  it(`${VP_CONFIG}'s Shiki editor ground is the source world's own ground`, () => {
    const block = sharedTokenBlock(TOKENS_CSS, tokens);
    const theme = read(VP_CONFIG);
    expect(theme).toContain(`"editor.background": "${tokenValue(block, "src-bg")}"`);
    expect(theme).toContain(`"editor.foreground": "${tokenValue(block, "src-fg")}"`);
  });
});

describe("the CodeMirror lint squiggles keep the redline/warn hexes they inline (ADR 0014's one legitimate literal)", () => {
  const block = sharedTokenBlock(TOKENS_CSS, read(TOKENS_CSS));
  const editor = read(EDITOR_SETUP);

  /** The `stroke="%23<hex>"` a `.cm-lintRange-<kind>` rule inlines into its SVG data URI. */
  const squiggleHex = (kind: "error" | "warning"): string => {
    const at = editor.indexOf(`".cm-lintRange-${kind}"`);
    expect(at, `${EDITOR_SETUP} no longer styles \`.cm-lintRange-${kind}\`.`).toBeGreaterThan(-1);
    const m = editor.slice(at).match(/stroke="%23([0-9a-f]{6})"/);
    expect(m, `${EDITOR_SETUP}'s \`.cm-lintRange-${kind}\` rule has no \`stroke="%23…"\` data-URI hex.`).toBeTruthy();
    return `#${m![1]!}`;
  };

  it("the error squiggle is --redline", () => {
    expect(
      squiggleHex("error"),
      `${EDITOR_SETUP}'s error squiggle no longer matches \`--redline\` in ${TOKENS_CSS}. A \`var()\` ` +
        `cannot cross into an SVG data URI, so this hex is inlined by hand — AGENTS.md says to keep it ` +
        `in step with the token. Update the URL-encoded \`%23<hex>\` to the token's value.`,
    ).toBe(tokenValue(block, "redline"));
  });

  it("the warning squiggle is --warn-ink", () => {
    expect(
      squiggleHex("warning"),
      `${EDITOR_SETUP}'s warning squiggle no longer matches \`--warn-ink\` in ${TOKENS_CSS} (same ` +
        `hand-inlined data-URI hex law as the error squiggle).`,
    ).toBe(tokenValue(block, "warn-ink"));
  });
});

describe("the static example pages INLINE the token block — they no longer retype it", () => {
  const gen = read(GEN_STATIC);
  const block = sharedTokenBlock(TOKENS_CSS, read(TOKENS_CSS));

  /**
   * `gen-static.mjs`'s inline stylesheet, sliced on its own content anchors. These pages
   * load no CSS FILE, which is why every colour in here used to be a hand-typed hex
   * carrying the token's name in a trailing comment — and why nothing could tell when a
   * copy drifted. `--font-mono` had in fact already lost `"Cascadia Code"` against
   * tokens.css by the time this gate was written. A `var()` cannot reach ACROSS to
   * tokens.css, but it resolves perfectly against the real block inlined into the page's
   * own `<style>`, so the generator inlines it and references it. This describe holds
   * that shape: no literal may creep back.
   */
  const style = (() => {
    const open = gen.indexOf("const STYLE = `");
    expect(open, `${GEN_STATIC} no longer declares \`const STYLE = \``).toBeGreaterThan(-1);
    const end = gen.indexOf("`.trim();", open);
    expect(end, `${GEN_STATIC}: the STYLE template literal is unterminated.`).toBeGreaterThan(open);
    return gen.slice(open, end);
  })();

  it("carries no colour literal at all — every colour is a var()", () => {
    expect(
      style.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [],
      `a literal colour in ${GEN_STATIC}'s STYLE is a COPY of a token in ${TOKENS_CSS}, and nothing ` +
        `diffs the two. Use \`var(--token)\` — the real block is inlined above these rules.`,
    ).toEqual([]);
    expect(
      style.match(/\b(?:rgba?|hsla?|oklch|oklab)\s*\(/g) ?? [],
      `same law as the hexes: a literal colour function in STYLE is an un-diffed copy. ` +
        `\`color-mix(in oklab, var(--token) …)\` is the supported way to derive one.`,
    ).toEqual([]);
  });

  it("retypes none of the three font stacks", () => {
    expect(
      style.match(/Archivo|Public Sans|IBM Plex|Segoe UI|ui-monospace|sans-serif|monospace/g) ?? [],
      `${GEN_STATIC}'s STYLE names a font family directly. The three stacks live in ${TOKENS_CSS} as ` +
        `--font-display/--font-body/--font-mono; a retyped copy is what silently dropped "Cascadia Code" ` +
        `from the mono stack on 27 published pages.`,
    ).toEqual([]);
  });

  it("re-declares no shared token — it inherits them", () => {
    for (const name of ["src-bg", "src-fg", "paper", "ink", "hairline", "redline", "plum-deep", "font-mono"]) {
      expect(
        style,
        `${GEN_STATIC}'s STYLE re-declares \`--${name}\` instead of inheriting it from the inlined block.`,
      ).not.toMatch(new RegExp(`--${name}s*:`));
    }
    expect(
      gen,
      `${GEN_STATIC} must READ ${TOKENS_CSS} (readTokenBlock) rather than embed a copy of its values.`,
    ).toMatch(/"styles",\s*"tokens\.css"/);
  });

  it("every var() it uses is declared — by the token block or by its own local scale", () => {
    const declared = new Set([
      ...[...block.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
      ...[...style.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
    ]);
    const used = [...new Set([...style.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]!))];
    expect(
      used.filter((name) => !declared.has(name)),
      `${GEN_STATIC}'s STYLE references var(--…) names that neither ${TOKENS_CSS} nor its own local ` +
        `scale declares. On these pages an undeclared var() resolves to nothing and the rule silently ` +
        `does not apply — exactly the failure mode this file exists to make loud.`,
    ).toEqual([]);
  });

  it("the theme-color meta — the one literal that cannot be a var() — is --src-bg", () => {
    const m = /name="theme-color" content="(#[0-9a-f]{3,8})"/.exec(gen);
    expect(m, `${GEN_STATIC} no longer emits a \`theme-color\` meta.`).toBeTruthy();
    expect(
      m![1],
      `${GEN_STATIC}'s \`theme-color\` drifted from \`--src-bg\` in ${TOKENS_CSS}. A meta ATTRIBUTE ` +
        `cannot hold a var(), so this hex is inlined by hand — same law as the CodeMirror squiggles above.`,
    ).toBe(tokenValue(block, "src-bg"));
  });
});
