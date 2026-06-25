import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, clearCache, makeVirtualWorld, NULL_WORLD } from "../src/index.js";
import type { World } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const studio = readFileSync(join(__dirname, "..", "examples", "studio.arch"), "utf8");

describe("T4.2 — World seam", () => {
  it("compile accepts an optional World", () => {
    const { errors } = compile(studio, { world: NULL_WORLD, noCache: true });
    expect(errors).toEqual([]);
  });

  it("default (no World) is byte-identical to the no-op World — import-free plans are unaffected", () => {
    const a = compile(studio, { noCache: true });
    const b = compile(studio, { world: NULL_WORLD, noCache: true });
    const c = compile(studio, { world: makeVirtualWorld({}), noCache: true });
    expect(b.svg).toBe(a.svg);
    expect(c.svg).toBe(a.svg);
  });

  it("makeVirtualWorld reads its map (browser/test path), tolerating a leading ./", () => {
    const w = makeVirtualWorld({ "lib/furniture.arch": "SOURCE_A" });
    expect(w.read("lib/furniture.arch")).toBe("SOURCE_A");
    expect(w.read("./lib/furniture.arch")).toBe("SOURCE_A");
    expect(w.read("missing.arch")).toBe(null);
  });

  it("an injected now() keeps output deterministic (no hidden Date.now())", () => {
    clearCache();
    const frozen: World = { read: () => null, now: () => new Date(0) };
    const a = compile(studio, { world: frozen });
    const b = compile(studio, { world: frozen });
    expect(a).toBe(b); // same World object → cache hit
    // Two distinct frozen Worlds: different identity (cache miss) but identical bytes.
    const c = compile(studio, { world: { read: () => null, now: () => new Date(0) }, noCache: true });
    expect(c.svg).toBe(a.svg);
  });

  it("World identity participates in the cache key (no cross-World bleed)", () => {
    clearCache();
    const w1 = makeVirtualWorld({});
    const w2 = makeVirtualWorld({});
    const a = compile(studio, { world: w1 });
    const b = compile(studio, { world: w1 });
    const d = compile(studio, { world: w2 });
    expect(a).toBe(b); // same World → hit
    expect(a).not.toBe(d); // different World object → distinct key
  });
});
