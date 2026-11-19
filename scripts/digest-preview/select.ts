/**
 * Which test files `npm run digest:preview` runs (`scripts/digest-preview.ts`), as a pure read of the tree.
 *
 * A PIN HOLDER is a `.ts` or `.json` file under `test/` that holds a 64-hex literal. A digest test file is
 * a `test/**\/*.test.ts` that is not {@link EXCLUDED} and whose REACH holds a pin holder: itself, the local
 * `test/` modules it imports, transitively (`test/helpers/keep-harness.ts`, `test/byte-identity-baseline.ts`,
 * …), and every pin-holding JSON file whose name appears in one of them (`readFileSync` of
 * `test/tables/glyph-dispatch.json`). Derived on every run, so a new law joins by existing;
 * `test/digest-preview.test.ts` checks that every pin holder is reached or excluded by name.
 *
 * Out by construction: laws pinned by a vitest snapshot (`toMatchSnapshot`, `toMatchInlineSnapshot`, …),
 * which hold no hex; {@link snapshotFiles} names them so the report can say so.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const HEX64_ANYWHERE = /\b[0-9a-f]{64}\b/;
const HEX64_ALL = /\b[0-9a-f]{64}\b/g;
const LOCAL_IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;
const SNAPSHOT_MATCHER =
  /\.(?:toMatchSnapshot|toMatchInlineSnapshot|toMatchFileSnapshot|toThrowErrorMatchingSnapshot|toThrowErrorMatchingInlineSnapshot)\(/;
const posix = (p: string) => p.replace(/\\/g, "/");

/**
 * Test files that hold or reach a pin and are NOT run, each with its reason. Only shrinks: an entry whose
 * file is gone or no longer reaches a pin fails `test/digest-preview.test.ts`.
 */
export const EXCLUDED: Record<string, string> = {};

/** Every `.ts`/`.json` file under `dir`, as a forward-slash repo path, sorted. */
function treeFiles(root: string, dir: string, out: string[] = []): string[] {
  if (!existsSync(join(root, dir))) return out;
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules") treeFiles(root, p, out);
    } else if (/\.(ts|mts|json)$/.test(p)) out.push(p);
  }
  return out.sort();
}

/** A read of the tree, made once: every file's text, and which files hold a pin. */
export interface Tree {
  root: string;
  files: string[];
  text: Map<string, string>;
  holders: Set<string>;
  jsonHolders: string[];
}

export function readTree(root: string): Tree {
  const files = treeFiles(root, "test");
  const text = new Map(files.map((f) => [f, readFileSync(join(root, f), "utf8")]));
  const holders = new Set(files.filter((f) => HEX64_ANYWHERE.test(text.get(f) as string)));
  return { root, files, text, holders, jsonHolders: [...holders].filter((f) => f.endsWith(".json")) };
}

/** A relative import of `file`, as a repo path (`.js` written for a `.ts` module), or null outside `test/`. */
function localModule(root: string, file: string, spec: string): string | null {
  const p = resolve(root, dirname(file), spec);
  for (const c of [p, p.replace(/\.js$/, ".ts"), p.replace(/\.mjs$/, ".mts"), `${p}.ts`]) {
    const rel = posix(relative(root, c));
    if (rel.startsWith("test/") && existsSync(c) && statSync(c).isFile()) return rel;
  }
  return null;
}

/** `file`, the local `test/` modules it imports transitively, and the pin-holding JSON files they name. */
export function reach(tree: Tree, file: string): Set<string> {
  const seen = new Set<string>();
  const visit = (f: string): void => {
    if (seen.has(f)) return;
    seen.add(f);
    const t = tree.text.get(f);
    if (t === undefined || f.endsWith(".json")) return;
    for (const m of t.matchAll(LOCAL_IMPORT)) {
      const mod = localModule(tree.root, f, m[1] as string);
      if (mod) visit(mod);
    }
    for (const j of tree.jsonHolders) if (t.includes(basename(j))) seen.add(j);
  };
  visit(file);
  return seen;
}

/** Every 64-hex literal in a file's reach: the pins a failed equality can be measured against. */
export function pinsOf(tree: Tree, file: string): Set<string> {
  const pins = new Set<string>();
  for (const f of reach(tree, file)) {
    if (tree.holders.has(f)) for (const m of (tree.text.get(f) as string).matchAll(HEX64_ALL)) pins.add(m[0]);
  }
  return pins;
}

/** The digest test files, sorted, each with the pin holders it reaches besides itself. */
export function digestFiles(tree: Tree): { file: string; via: string[] }[] {
  const out: { file: string; via: string[] }[] = [];
  for (const file of tree.files) {
    if (!file.endsWith(".test.ts") || file in EXCLUDED) continue;
    const r = reach(tree, file);
    const via = [...r].filter((f) => f !== file && tree.holders.has(f)).sort();
    if (tree.holders.has(file) || via.length > 0) out.push({ file, via });
  }
  return out;
}

/** The test files pinned by a vitest snapshot: out of the preview by construction, named in its report. */
export function snapshotFiles(tree: Tree): string[] {
  return tree.files.filter((f) => f.endsWith(".test.ts") && SNAPSHOT_MATCHER.test(tree.text.get(f) as string));
}

/** vitest's `setupFiles`, read from `vitest.config.ts`, so the preview loads what every test file gets. */
export function setupFiles(root: string): string[] {
  const config = join(root, "vitest.config.ts");
  if (!existsSync(config)) return [];
  const m = /setupFiles:\s*\[([^\]]*)\]/.exec(readFileSync(config, "utf8"));
  return m ? [...(m[1] as string).matchAll(/["']([^"']+)["']/g)].map((x) => x[1] as string) : [];
}
