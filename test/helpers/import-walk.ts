/**
 * The modules a source entry reaches through value imports and re-exports, read from the files
 * (`import { a } from "./x.js"`, `import "./x.js"`, `export … from`; never `import type`). The
 * playground's compiler chunk is built from `src/compile-path.ts`, so what this walk reaches from it
 * is what that chunk can hold. Shared by `test/compile-path-intent.test.ts` (NR.10) and
 * `test/af9-fixes.test.ts` (AF9's lint-only modules stay off it).
 */
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";

/** Value imports and re-exports (`import { a } from "./x.js"`, `import "./x.js"`, `export … from`); never `import type`. */
const EDGE = /^(?:import|export)\s+(?!type\s)(?:[^;]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']/gm;

/** The modules `entry` reaches, as repository paths. */
export function reach(entry: string): string[] {
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
