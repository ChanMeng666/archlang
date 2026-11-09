/**
 * Scratch directories for tests.
 *
 * Replaces the local `mkdtempSync(join(tmpdir(), "arch-…"))` scaffolds. {@link mkTmp} makes one
 * (the caller removes it); {@link withTmpDir} makes one, runs `fn` in it and always removes it.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fresh empty directory under the OS temp dir whose name starts with `prefix`. */
export function mkTmp(prefix = "arch-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
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
