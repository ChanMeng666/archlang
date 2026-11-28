/**
 * Scratch directories for tests.
 *
 * Replaces the local `mkdtempSync(join(tmpdir(), "arch-…"))` scaffolds. {@link mkTmp} makes one
 * (the caller removes it); {@link withTmpDir} makes one, runs `fn` in it and always removes it.
 * {@link importSource} loads JavaScript source text as a real ES module through one.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * A fresh empty directory under the OS temp dir whose name starts with `prefix`, as its canonical
 * path: `realpathSync.native` expands a Windows 8.3 short segment (a runner's `C:\Users\RUNNER~1`),
 * whose `~` `pathToFileURL` encodes as `%7E`, a URL Vite cannot load (`test/tmp-helper.test.ts`).
 */
export function mkTmp(prefix = "arch-test-"): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
}

/** Run `fn` with a fresh scratch directory and remove it afterwards, even when `fn` throws. */
export async function withTmpDir<T>(fn: (dir: string) => T | Promise<T>, prefix?: string): Promise<T> {
  const dir = mkTmp(prefix);
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Load `source` (plain JavaScript in ES module syntax) as a real module: write it to a fresh
 * scratch directory and `import()` it by file URL, then remove the directory. A test uses this to
 * run code it read out of a file it cannot import directly (a `.vue` component's script, a
 * generator's output, a bundle's one-line definitions) instead of building a function from a
 * string at runtime: the repository holds no dynamic-code construction for scanners to flag
 * (`test/no-dynamic-code.test.ts`). The module runs in strict mode, as every ES module does.
 */
export async function importSource<T>(source: string, prefix = "arch-module-"): Promise<T> {
  return withTmpDir(async (dir) => {
    const file = join(dir, "module.mjs");
    writeFileSync(file, source, "utf8");
    return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as T;
  }, prefix);
}
