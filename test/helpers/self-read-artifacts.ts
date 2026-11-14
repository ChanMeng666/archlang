/**
 * Which generated artifacts their own generator READS: a static scan of each `gen:*` script for
 * `scripts/sync-main.mjs`'s partial-artifact guard (`test/sync-main.test.ts`). A generator that reads
 * the file it writes keeps something of the old file (a hand-written part outside a marked region, the
 * fields it does not derive), so the file is partial unless the read is only a comparison.
 *
 * Static on purpose: running every generator against a planted artifact would cost the whole of
 * `gen:all` per test run, and every generator reads through `readFileSync` (directly or through a
 * one-line helper such as `read`/`readJson`) with a path that is a string literal, an exported constant
 * or a local variable bound to one. The scan follows exactly those three forms; a read it cannot place
 * (a variable built from a loop value, as `gen:doors` does) counts against every artifact of the row, so
 * it errs towards "reads its own output".
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATORS } from "../../scripts/generators.js";

/** The text of each first argument passed to `callee(` in `src`, by a bracket-depth scan (no regex backtracking). */
export function firstArgs(src: string, callee: string): string[] {
  const out: string[] = [];
  const needle = `${callee}(`;
  let at = src.indexOf(needle);
  while (at >= 0) {
    const before = at === 0 ? "" : src[at - 1];
    if (!/[\w$.]/.test(before ?? "")) {
      let depth = 0;
      let i = at + needle.length;
      const start = i;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") {
          if (depth === 0) break;
          depth--;
        } else if (c === "," && depth === 0) break;
      }
      out.push(src.slice(start, i).trim());
    }
    at = src.indexOf(needle, at + needle.length);
  }
  return out;
}

/** `export const NAME = "literal"` across `scripts/*.ts`: constant name → path. */
function exportedPathConstants(root: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const f of readdirSync(join(root, "scripts"))) {
    if (!f.endsWith(".ts")) continue;
    for (const m of readFileSync(join(root, "scripts", f), "utf8").matchAll(
      /export const ([A-Z][A-Z0-9_]*) = "([^"\n]+)"/g,
    )) {
      names.set(m[1] as string, m[2] as string);
    }
  }
  return names;
}

/** The script file a `gen:*` npm script runs (its last `.ts` argument). */
function scriptFile(root: string, script: string): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const cmd = pkg.scripts[script];
  const file = cmd
    ?.split(/\s+/)
    .filter((w) => w.endsWith(".ts"))
    .pop();
  if (!file) throw new Error(`${script}: no .ts script in ${JSON.stringify(cmd)}`);
  return file;
}

/** Every artifact whose own generator script reads it, per the rules in the header. */
export function selfReadArtifacts(root: string): string[] {
  const constants = exportedPathConstants(root);
  const found = new Set<string>();
  for (const { script, artifacts } of GENERATORS) {
    const src = readFileSync(join(root, scriptFile(root, script)), "utf8");
    // `readFileSync` and the one-line helpers that wrap it (`const read = (p) => readFileSync(…)`).
    const readers = ["readFileSync"];
    for (const line of src.split("\n")) {
      const helper = /\b(?:const|let|function)\s+([A-Za-z_$][\w$]*)\b.*\breadFileSync\(/.exec(line);
      if (helper && helper[1] !== undefined) readers.push(helper[1]);
    }
    /** The artifacts one path expression names: literals and exported constants, or a local bound to one. */
    const named = (expr: string, seen = new Set<string>()): string[] | null => {
      const hits = artifacts.filter(
        (a) =>
          expr.includes(JSON.stringify(a)) ||
          [...constants].some(([name, path]) => path === a && new RegExp(`\\b${name}\\b`).test(expr)),
      );
      if (hits.length > 0) return hits;
      const local = /^(?:resolve|join)\(\s*ROOT\s*,\s*([A-Za-z_$][\w$]*)\s*\)$|^([A-Za-z_$][\w$]*)$/.exec(expr);
      const name = local?.[1] ?? local?.[2];
      if (name === undefined || seen.has(name)) return null;
      seen.add(name);
      const def = new RegExp(`\\b(?:const|let)\\s+${name}\\s*=\\s*([^;\\n]+)`).exec(src);
      return def?.[1] === undefined ? null : named(def[1].trim(), seen);
    };
    const writes = new Set(firstArgs(src, "writeFileSync"));
    for (const reader of readers) {
      for (const arg of firstArgs(src, reader)) {
        const hits = named(arg);
        if (hits !== null) for (const a of hits) found.add(a);
        // A path the scan cannot place but that the script also writes to: every artifact of the row.
        else if (writes.has(arg)) for (const a of artifacts) found.add(a);
      }
    }
  }
  return [...found].sort();
}
