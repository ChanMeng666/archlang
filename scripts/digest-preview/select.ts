/**
 * Which test files `npm run digest:preview` runs (`scripts/digest-preview.ts`), as a pure read of the tree.
 *
 * A digest test file is a `test/**\/*.test.ts` that imports the core (`../src/`) and either holds a 64-hex
 * literal itself or imports a local `test/` module that does (`test/byte-identity-baseline.ts`,
 * `test/keep-byte-identity-baseline.ts`, …). Derived on every run, so a new law joins by existing; pinned by
 * `test/digest-preview.test.ts`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const HEX64_ANYWHERE = /\b[0-9a-f]{64}\b/;
const IMPORTS_CORE = /from\s+["'](?:\.\.\/)+src\//;
const LOCAL_IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;
const posix = (p: string) => p.replace(/\\/g, "/");

function testFiles(root: string, dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) testFiles(root, p, out);
    else if (p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/** A relative import of `file`, as a repo path (`.js` written for a `.ts` module), or null outside `test/`. */
function localModule(root: string, file: string, spec: string): string | null {
  const p = resolve(root, dirname(file), spec);
  for (const c of [p, p.replace(/\.js$/, ".ts"), `${p}.ts`]) {
    const rel = posix(relative(root, c));
    if (rel.startsWith("test/") && existsSync(c)) return rel;
  }
  return null;
}

/** The digest test files under `root`, sorted, each with the local modules whose pins it reads. */
export function digestFiles(root: string): { file: string; via: string[] }[] {
  const out: { file: string; via: string[] }[] = [];
  for (const file of testFiles(root, "test").sort()) {
    const text = readFileSync(join(root, file), "utf8");
    if (!IMPORTS_CORE.test(text)) continue;
    const via: string[] = [];
    for (const m of text.matchAll(LOCAL_IMPORT)) {
      const mod = localModule(root, file, m[1] as string);
      if (mod && !mod.endsWith(".test.ts") && HEX64_ANYWHERE.test(readFileSync(join(root, mod), "utf8"))) via.push(mod);
    }
    if (HEX64_ANYWHERE.test(text) || via.length > 0) out.push({ file, via: [...new Set(via)].sort() });
  }
  return out;
}

/** vitest's `setupFiles`, read from `vitest.config.ts`, so the preview loads what every test file gets. */
export function setupFiles(root: string): string[] {
  const text = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const m = /setupFiles:\s*\[([^\]]*)\]/.exec(text);
  return m ? [...(m[1] as string).matchAll(/["']([^"']+)["']/g)].map((x) => x[1] as string) : [];
}
