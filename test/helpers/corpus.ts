/**
 * The one definition of "the corpus" for tests, and the example listings they share.
 *
 * `docs/testing.md` § 5 defines the corpus a sweep covers: `examples/` (including `lib`),
 * `test/fixtures`, `test/recovery-corpus`, and the eval `goldens`, `fidelity-plans` and `faults`.
 * {@link corpusFiles} is that set. Replaces the 28 local `corpus()` / `archFiles()` / `exampleFiles()`
 * / `walk()` copies and the `readdirSync("examples").filter(… endsWith(".arch"))` listings (113 files
 * read the examples with their own directories and filters).
 *
 * Paths are repo-relative with forward slashes (`examples/studio.arch`): vitest runs from the repo
 * root, so they open as they are; pass `absolute: true` for absolute ones. A test that needs a
 * DIFFERENT set (an extra directory, the defect corpus, a filter) passes `dirs` or filters the
 * result, and says why.
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, absolute. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The directories `docs/testing.md` § 5 names as the corpus. */
export const CORPUS_DIRS: readonly string[] = [
  "examples",
  "test/fixtures",
  "test/recovery-corpus",
  "eval/goldens",
  "eval/faults",
  "eval/fidelity-plans",
];

const isArch = (name: string): boolean => name.endsWith(".arch");

/**
 * Every file under `dir` (recursively, names sorted at each level) that `keep` accepts, as `dir`
 * joined with its relative path. Replaces the local `walk(dir, keep)` copies.
 */
export function walkFiles(dir: string, keep: (name: string) => boolean = isArch): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p, keep));
    else if (keep(name)) out.push(p);
  }
  return out;
}

export interface CorpusOptions {
  /** Repo-relative directories to walk. Default {@link CORPUS_DIRS}. */
  dirs?: readonly string[];
  /** Return absolute paths instead of repo-relative ones. */
  absolute?: boolean;
}

/** Every `.arch` file of the corpus, in `dirs` order and sorted within each directory. */
export function corpusFiles(opts: CorpusOptions = {}): string[] {
  const out: string[] = [];
  for (const d of opts.dirs ?? CORPUS_DIRS) {
    const base = opts.absolute ? join(REPO_ROOT, d) : d;
    out.push(...walkFiles(base).map((p) => p.replace(/\\/g, "/")));
  }
  return out;
}

/** The names (`studio.arch`) of the top-level examples, sorted. Subdirectories (`lib/`) are not included. */
export function exampleNames(): string[] {
  return readdirSync("examples").filter(isArch).sort();
}

/** The repo-relative paths (`examples/studio.arch`) of the top-level examples, sorted. */
export function examples(): string[] {
  return exampleNames().map((f) => `examples/${f}`);
}

/** The names of the importable library modules in `examples/lib`, sorted. */
export function libNames(): string[] {
  return readdirSync("examples/lib").filter(isArch).sort();
}

/** The repo-relative paths of the hand-broken plans in `test/defect-corpus`. */
export function defectCorpus(): string[] {
  return corpusFiles({ dirs: ["test/defect-corpus"] });
}
