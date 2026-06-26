/**
 * T5.4 — one grammar source of truth: drift guard.
 *
 * `src/grammar/tokens.ts` is the single source; `scripts/gen-grammars.ts`
 * generates the editor grammars from it. This test regenerates them in-memory
 * and asserts the committed files match — the CI equivalent of
 * `npm run gen:grammars && git diff --exit-code`. If it fails, run
 * `npm run gen:grammars` and commit the result.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderPlayground, renderTmLanguage } from "../scripts/gen-grammars.js";
import { KEYWORDS, STATEMENT_STARTS } from "../src/grammar/tokens.js";

describe("T5.4 — editor grammars are in sync with the token source", () => {
  it("editors/archlang.tmLanguage.json has no drift", () => {
    const committed = readFileSync("editors/archlang.tmLanguage.json", "utf8").replace(/\r\n/g, "\n");
    expect(renderTmLanguage()).toBe(committed);
  });

  it("playground/src/arch-language.js has no drift", () => {
    const committed = readFileSync("playground/src/arch-language.js", "utf8").replace(/\r\n/g, "\n");
    expect(renderPlayground()).toBe(committed);
  });
});

describe("T5.4 — the parser's statement starts come from the token source", () => {
  it("every control keyword (except plan/else) and the four settings begin a statement", () => {
    for (const kw of ["let", "component", "for", "if", "while", "set", "import", "theme"]) {
      expect(STATEMENT_STARTS).toContain(kw);
    }
    for (const s of ["units", "grid", "scale", "north"]) expect(STATEMENT_STARTS).toContain(s);
  });

  it("element kinds and enum values are not statement starts (they come from the registry / are values)", () => {
    for (const e of KEYWORDS.element) expect(STATEMENT_STARTS).not.toContain(e);
    for (const e of KEYWORDS.enum) expect(STATEMENT_STARTS).not.toContain(e);
  });
});
