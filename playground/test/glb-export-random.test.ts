/**
 * Download GLB (card X5) puts glTF-Transform in a playground chunk, and glTF-Transform's bundle
 * carries a `Math.random()` (an id helper the package's browser bundle may not hold, which is why
 * the package exports `writeGlb` from its Node entry only). It is reached only when READING a glTF
 * with external resources, never on the write path. This holds the page's path to that: the GLB
 * writer's modules are loaded and laneway-house written twice with `Math.random` recording every
 * caller, and no call comes from the writer, the library, the package or the playground modules;
 * the two writes are the same bytes.
 *
 * Its own file, so the modules are first loaded here, under the recorder (module set-up counts).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

describe("the GLB write path reads no random source (card X5)", () => {
  it("loads and writes laneway-house twice: no Math.random from it, the same bytes", async () => {
    const real = Math.random;
    const callers: string[] = [];
    Math.random = () => {
      callers.push(new Error("Math.random").stack ?? "");
      return real();
    };
    let a: Uint8Array;
    let b: Uint8Array;
    try {
      const { glbBytes } = await import("../src/glb-export.js");
      const { adapt3d, mesh3d } = await import("../src/plan3d.js");
      const r = adapt3d(readFileSync(join(process.cwd(), "examples", "laneway-house.arch"), "utf8"));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      a = await glbBytes(mesh3d(r.scene));
      b = await glbBytes(mesh3d(r.scene));
    } finally {
      Math.random = real;
    }
    const ours = callers.filter((s) => /gltf-transform|archlang-3d[\\/]src|playground[\\/]src/.test(s));
    expect(ours, "Math.random called from the GLB write path").toEqual([]);
    expect(sha(a), "the same plan, the same GLB").toBe(sha(b));
    expect(a.length).toBeGreaterThan(1000);
  });
});
