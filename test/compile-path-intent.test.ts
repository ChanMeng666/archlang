/**
 * Card NR.10's premise, pinned: `compile()` never raises an intent violation (`E_INTENT_*`, only
 * `validateIntent` does), so the compile path's fix column (`src/error-catalog-fixes.ts`) leaves
 * those rows out and `compile()`'s error card reads only it (`renderCompileErrorSvg`). Walked from
 * the source: every module `compile()` reaches (`src/compile.ts`, the card and its fix column
 * included) and every module `src/compile-path.ts` reaches (the playground's compiler chunk is built
 * from exactly that entry, which since card 3.19 serves `compileWithoutErrorCard` and reaches neither
 * the card nor the column), through value imports and re-exports, none of which may write an
 * `E_INTENT_` code in a string. A module that starts raising one, or that either starts importing
 * (`src/intent.ts`), fails here; the built chunk is held to the same by the startup-chunks spec
 * (`playground/e2e/preview3d.spec.ts`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../src/index.js";
import { reach } from "./helpers/import-walk.js";

describe("NR.10: the compile path raises no intent violation", () => {
  const compilePath = reach("src/compile-path.ts");
  /** What either reaches: `compile()` with its card, and the compiler chunk's entry. */
  const files = [...new Set([...reach("src/compile.ts"), ...compilePath])];

  it("walks compile() and the compile path (the memo, the parser, the pipeline, the card and its fix column)", () => {
    for (const f of [
      "src/compile.ts",
      "src/compile-memo.ts",
      "src/compile-uncached.ts",
      "src/parser.ts",
      "src/pipeline.ts",
      "src/backends/error-svg.ts",
      "src/catalog-fix.ts",
      "src/error-catalog-fixes.ts",
    ])
      expect(files, f).toContain(f);
    // validateIntent's modules and the intent fix column are not.
    for (const f of ["src/intent.ts", "src/intent-feasibility.ts", "src/error-catalog-fixes-intent.ts"])
      expect(files, f).not.toContain(f);
  });

  it("the compile path reaches the pipeline without compile()'s error card (card 3.19)", () => {
    // The playground's compiler chunk serves `compileWithoutErrorCard` (`src/compile-memo.ts`);
    // `compile()` draws the card through `src/compile-uncached.ts`, which no file on the path imports.
    for (const f of ["src/compile-memo.ts", "src/parser.ts", "src/pipeline.ts"]) expect(compilePath, f).toContain(f);
    for (const f of [
      "src/compile.ts",
      "src/compile-uncached.ts",
      "src/backends/error-svg.ts",
      "src/catalog-fix.ts",
      "src/error-catalog-fixes.ts",
    ])
      expect(compilePath, f).not.toContain(f);
  });

  it("no module on it writes an E_INTENT_ code in a string", () => {
    expect(
      ERROR_CODES.some((c) => c.startsWith("E_INTENT_")),
      "the codes exist",
    ).toBe(true);
    const QUOTED = /["'`]E_INTENT_[A-Z$]/;
    expect(QUOTED.test(readFileSync("src/intent.ts", "utf8")), "the probe finds the codes where they are raised").toBe(
      true,
    );
    expect(files.filter((f) => QUOTED.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
