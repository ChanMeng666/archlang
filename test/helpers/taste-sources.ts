/**
 * The corpus every taste law reads (ADR 0032): the shipped examples, the defect corpus
 * (`test/defect-corpus/`) and the taste corpus (`test/taste-corpus/`), each file once, sorted, read
 * from disk (never listed by hand, so a new file is covered the day it lands). Examples resolve
 * their `import`s through the examples' virtual World; the corpora import nothing.
 */

import { sha256 } from "./digest.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { taste } from "../../src/index.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./d4-oracle.js";

export interface TasteSource {
  /** Forward-slash path from the repository root. */
  name: string;
  src: string;
}

/** Every `.arch` under a folder, sorted by path. */
export function archFilesUnder(dir: string): TasteSource[] {
  const out: TasteSource[] = [];
  const walk = (d: string, rel: string): void => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      const r = `${rel}/${f}`;
      if (statSync(p).isDirectory()) walk(p, r);
      else if (f.endsWith(".arch")) out.push({ name: r, src: readFileSync(p, "utf8") });
    }
  };
  walk(resolvePath(dir), dir);
  return out;
}

export const EXAMPLE_SOURCES: readonly TasteSource[] = SHIPPED_EXAMPLES.map((rel) => ({
  name: `examples/${rel}`,
  src: EXAMPLE_FILES[rel]!,
}));
export const DEFECT_SOURCES: readonly TasteSource[] = archFilesUnder("test/defect-corpus");
export const TASTE_CORPUS_SOURCES: readonly TasteSource[] = archFilesUnder("test/taste-corpus");

/** Examples, then the defect corpus, then the taste corpus. */
export const TASTE_SOURCES: readonly TasteSource[] = [...EXAMPLE_SOURCES, ...DEFECT_SOURCES, ...TASTE_CORPUS_SOURCES];

/** The World every taste law compiles through (examples import from `examples/lib`). */
export const TASTE_WORLD = EXAMPLES_WORLD;

/** A corpus file's `# key: value` header (continuation lines start `#` and two spaces). */
export function headerOf(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  let last: string | null = null;
  for (const line of src.split("\n")) {
    if (!line.startsWith("#")) break;
    const cont = /^# {2,}(.*)$/.exec(line);
    if (cont && last) {
      out[last] = `${out[last]} ${cont[1]!.trim()}`;
      continue;
    }
    const kv = /^# ([a-z-]+): (.*)$/.exec(line);
    if (kv) {
      last = kv[1]!;
      out[last] = kv[2]!.trim();
    }
  }
  return out;
}

/**
 * The digest the taste table pins: SHA-256 of `JSON.stringify(taste(src, { profile }))` through
 * {@link TASTE_WORLD}. The one body both the table and its measurement use.
 */
export function tasteDigest(src: string, profile: string): string {
  return sha256(JSON.stringify(taste(src, { profile, world: TASTE_WORLD })));
}

/** One case and its better twin. */
export interface TastePair {
  /** The case's path without `.arch`. */
  slug: string;
  bad: TasteSource;
  good: TasteSource;
}

/** The defect corpus's pairs: `<case>.arch` and `<case>.clean.arch`. */
export function defectPairs(): TastePair[] {
  return DEFECT_SOURCES.filter((s) => !s.name.endsWith(".clean.arch")).map((bad) => {
    const goodName = bad.name.replace(/\.arch$/, ".clean.arch");
    const good = DEFECT_SOURCES.find((s) => s.name === goodName);
    if (!good) throw new Error(`no clean twin for ${bad.name}`);
    return { slug: bad.name.replace(/^test\/defect-corpus\//, "").replace(/\.arch$/, ""), bad, good };
  });
}

/** The taste corpus's pairs, each with the criterion its header names. */
export function tasteCorpusPairs(): Array<TastePair & { criterion: string }> {
  return TASTE_CORPUS_SOURCES.filter((s) => !s.name.endsWith(".good.arch")).map((bad) => {
    const goodName = bad.name.replace(/\.arch$/, ".good.arch");
    const good = TASTE_CORPUS_SOURCES.find((s) => s.name === goodName);
    if (!good) throw new Error(`no better twin for ${bad.name}`);
    return {
      slug: bad.name.replace(/^test\/taste-corpus\//, "").replace(/\.arch$/, ""),
      bad,
      good,
      criterion: headerOf(bad.src).criterion ?? "",
    };
  });
}
