/**
 * The `.arch` files of the corpus, and the example listings tests share.
 *
 * {@link corpusFiles} returns the `.arch` files (recursively) under {@link CORPUS_DIRS}: `examples/`
 * (`lib` included), `test/fixtures`, `test/recovery-corpus`, `eval/goldens`, `eval/faults` and
 * `eval/fidelity-plans`. That is the file half of the corpus `docs/testing.md` § 5 sweeps; the sweep
 * also covers the `arch` fences of docs/, README and spec, which a test extracts with
 * `extractArchBlocks` (`src/markdown.ts`) and which this module does not return.
 * `scripts/engine-digests.ts` keeps its own directory list on purpose (non-recursive, adds
 * `examples/lib`, omits `eval/faults`), so its browser digests do not move with this one.
 *
 * Replaces the local recursive `.arch` walkers (14 migrated to {@link walkFiles}), the six-directory
 * lists (6 migrated to {@link CORPUS_DIRS}, 4 of them to {@link corpusFiles}) and the
 * `readdirSync("examples")` listings (52 migrated to {@link exampleNames} / {@link libNames}). A copy
 * that picks a different set stays, with a comment saying how.
 *
 * Paths are repo-relative with forward slashes (`examples/studio.arch`): vitest runs from the repo
 * root, so they open as they are; pass `absolute: true` for absolute ones. A test that needs a
 * DIFFERENT set passes `dirs` or filters the result, and says why.
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
