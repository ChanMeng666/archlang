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
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../src/index.js";

/** Value imports and re-exports (`import { a } from "./x.js"`, `import "./x.js"`, `export … from`); never `import type`. */
const EDGE = /^(?:import|export)\s+(?!type\s)(?:[^;]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']/gm;

/** The modules `entry` reaches, as repository paths. */
function reach(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(EDGE)) {
      const spec = m[1]!.replace(/\.js$/, ".ts");
      const next = posix.normalize(posix.join(posix.dirname(file), spec));
      if (!existsSync(next)) throw new Error(`${file} imports ${m[1]}, which is no src file`);
      visit(next);
    }
  };
  visit(entry);
  return [...seen];
}

describe("NR.10: the compile path raises no intent violation", () => {
  const files = reach("src/compile-path.ts");

  it("walks the compile path (the parser, the pipeline and the compile-path fix column are in it)", () => {
    for (const f of ["src/compile.ts", "src/parser.ts", "src/pipeline.ts", "src/error-catalog-fixes.ts"])
      expect(files, f).toContain(f);
    // validateIntent's modules and the intent fix column are not.
    for (const f of ["src/intent.ts", "src/intent-feasibility.ts", "src/error-catalog-fixes-intent.ts"])
      expect(files, f).not.toContain(f);
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
