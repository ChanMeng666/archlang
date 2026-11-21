/**
 * Card NR.10's premise, pinned: `compile()` never raises an intent violation (`E_INTENT_*`, only
 * `validateIntent` does), so the compile path's fix column (`src/error-catalog-fixes.ts`) leaves
 * those rows out and `compile()`'s error card reads only it (`renderCompileErrorSvg`). Walked from
 * the source: every module `src/compile-path.ts` reaches through value imports and re-exports (the
 * playground's compiler chunk is built from exactly that entry), none of which may write an
 * `E_INTENT_` code in a string. A module that starts raising one, or that the compile path starts
 * importing (`src/intent.ts`), fails here; the built chunk is held to the same by the startup-chunks
 * spec (`playground/e2e/preview3d.spec.ts`).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../src/index.js";
import { reach } from "./helpers/import-walk.js";

describe("NR.10: the compile path raises no intent violation", () => {
  const files = reach("src/compile-path.ts");

  it("walks the compile path (the memo, the parser and the pipeline are in it)", () => {
    for (const f of ["src/compile-memo.ts", "src/parser.ts", "src/pipeline.ts"]) expect(files, f).toContain(f);
    // validateIntent's modules and the intent fix column are not.
    for (const f of ["src/intent.ts", "src/intent-feasibility.ts", "src/error-catalog-fixes-intent.ts"])
      expect(files, f).not.toContain(f);
    // Card 3.19: nor is `compile()`'s error card, with the fix column it prints. The playground's
    // compiler chunk serves `compileWithoutErrorCard` (`src/compile-memo.ts`); `compile()` draws the
    // card through `src/compile-uncached.ts`, which no file on the path imports.
    for (const f of [
      "src/compile.ts",
      "src/compile-uncached.ts",
      "src/backends/error-svg.ts",
      "src/catalog-fix.ts",
      "src/error-catalog-fixes.ts",
    ])
      expect(files, f).not.toContain(f);
    expect(reach("src/compile.ts"), "compile() itself reaches the card's fix column").toContain(
      "src/error-catalog-fixes.ts",
    );
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
