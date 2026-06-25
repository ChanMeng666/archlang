import { describe, expect, it } from "vitest";
import { compile, clearCache } from "../src/index.js";

/**
 * src/index.ts holds a bounded memo cache: CACHE_MAX = 64 entries, FIFO
 * eviction (delete the oldest-inserted key once full). A cache *hit* returns
 * the very same CompileResult object reference, so object identity (`toBe`)
 * lets us observe hits vs. misses without exposing cache internals.
 */
const src = (i: number) => `plan "C${i}" { room id=r at (0,0) size 1000x1000 label "R${i}" }`;

describe("compile cache — hits & eviction", () => {
  it("returns the same object on an immediate repeat (hit)", () => {
    clearCache();
    const a = compile(src(1));
    const b = compile(src(1));
    expect(b).toBe(a);
  });

  it("evicts the oldest entry once the 64-entry limit is exceeded", () => {
    clearCache();

    // Insert source 0, then 64 *more* distinct sources (1..64). Inserting the
    // 65th distinct source trips eviction of the oldest (source 0).
    const first0 = compile(src(0));
    for (let i = 1; i <= 64; i++) compile(src(i));

    // Source 0 was evicted → recompiling yields a brand-new object.
    const second0 = compile(src(0));
    expect(second0).not.toBe(first0);

    // A recently-inserted source is still cached → same object on repeat.
    const a = compile(src(64));
    const b = compile(src(64));
    expect(b).toBe(a);
  });

  it("clearCache() drops everything (next compile is a fresh object)", () => {
    const x = compile(src(200));
    clearCache();
    const y = compile(src(200));
    expect(y).not.toBe(x);
  });

  it("noCache bypasses the cache (always a fresh object)", () => {
    clearCache();
    const a = compile(src(300), { noCache: true });
    const b = compile(src(300), { noCache: true });
    expect(b).not.toBe(a);
  });
});
