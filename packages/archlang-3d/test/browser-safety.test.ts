/**
 * The adapter and Scene3D run in a browser (the playground preview reads them later): bundled for
 * `platform: "browser"` with the core INSIDE, the bundle builds, and it carries no static `node:`
 * import, no `process`, no clock and no randomness.
 *
 * Externals: only the core's optional Node-only backends (PDF, PNG, the CJK font), which it reaches
 * by a lazy `import()` that never runs in a browser. The list is the one the core's own standalone
 * browser build uses (`NODE_ONLY` in `packages/web-component/scripts/build.ts`), read from there,
 * and the test proves each is reached only dynamically.
 *
 * The `./glb` entry (`writeGlb` for a page with no Node) is bundled the same way: no Node module in
 * its graph, no `process`, no clock, and the bundle, run, writes laneway-house's pinned GLB bytes
 * (a well-formed GLB 2.0 header) with no `Math.random` call while it loads and writes.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, type Mesh3D } from "../src/index.js";
import { EXAMPLES_LIST, REPO, WORLD } from "./corpus.js";
import { LANEWAY_GLB_SHA256, PIN_GENERATOR } from "./pins.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `NODE_ONLY` from the web component's build script: the core's lazy Node-only imports. */
function nodeOnly(): string[] {
  const script = readFileSync(join(REPO, "packages/web-component/scripts/build.ts"), "utf8");
  const body = /const NODE_ONLY = \[([^\]]*)\]/.exec(script)?.[1] ?? "";
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

describe("browser safety", () => {
  it("bundles adapter + Scene3D for the browser with no Node, clock or randomness", async () => {
    const external = nodeOnly();
    expect(external).toContain("node:*");
    expect(external.length).toBeGreaterThan(3);
    const out = await build({
      entryPoints: [join(HERE, "../src/index.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      external,
      // Comments out, so the scan reads code: the core's own comments say "never `Math.random()`".
      minifyWhitespace: true,
      legalComments: "none",
      // Read the core through its source entry, as the package's tests do.
      alias: { "@chanmeng666/archlang": join(REPO, "src/index.ts") },
    });
    expect(out.errors).toEqual([]);
    const code = out.outputFiles?.[0]?.text ?? "";
    expect(code.length).toBeGreaterThan(100_000); // the core is inside: nothing was left external
    const banned: Array<[RegExp, string]> = [
      [/\bfrom\s*["']node:/, "a static node: import"],
      [/\brequire\(\s*["']node:/, "a node: require"],
      [/\bprocess\.(env|argv|cwd|exit|platform)\b/, "process"],
      [/\bDate\.now\s*\(/, "Date.now()"],
      [/\bnew\s+Date\s*\(/, "new Date()"],
      [/\bperformance\.now\s*\(/, "performance.now()"],
      [/\bMath\.random\s*\(/, "Math.random()"],
    ];
    const hits = banned.filter(([re]) => re.test(code)).map(([, why]) => why);
    expect(hits).toEqual([]);
    // Each external the bundle still names is reached only through a dynamic import(): the
    // minified bundle writes a static one as `from"x"` or `import"x"`, a dynamic one as `import("x")`.
    const statics = external
      .filter((e) => !e.includes("*"))
      .filter((e) => [`from"${e}"`, `import"${e}"`].some((s) => code.includes(s)));
    expect(statics).toEqual([]);
    // And the list is not decoration: without it the browser build fails on those modules.
    const bare = await build({
      entryPoints: [join(HERE, "../src/index.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      alias: { "@chanmeng666/archlang": join(REPO, "src/index.ts") },
    }).catch((e: { errors?: unknown[] }) => ({ errors: e.errors ?? [e] }));
    expect(bare.errors.length).toBeGreaterThan(0);
  }, 60_000);

  it("bundles the ./browser entry (the playground's 3D tab) with no Node and no clock", async () => {
    const out = await build({
      entryPoints: [join(HERE, "../src/browser.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      minifyWhitespace: true,
      legalComments: "none",
      metafile: true,
    });
    expect(out.errors).toEqual([]);
    // The replay's host needs no mesh stage: not the T0 generators (or their earcut), not the
    // builder, not the site code that reads the core. The contact shadows read the Mesh3D's ledger
    // instead (`payload.ts`, review S5 of PR #737).
    const inputs = Object.keys(out.metafile?.inputs ?? {});
    expect(inputs.length).toBeGreaterThan(10);
    expect(
      inputs.filter((f) => /src[\\/]mesh[\\/](t0|build|outdoor|extrude|stair|openings|slab)|earcut/.test(f)),
    ).toEqual([]);
    const code = out.outputFiles?.[0]?.text ?? "";
    expect(code).toContain("WebGLRenderer"); // three.js is inside
    // three.js itself calls Math.random (object UUIDs, never a pixel), so only Node and the clock
    // are banned here; every frame is `seek(t)`.
    const banned: Array<[RegExp, string]> = [
      [/\bfrom\s*["']node:/, "a static node: import"],
      [/\bimport\s*\(\s*["']node:/, "a node: import()"],
      [/\brequire\(\s*["']node:/, "a node: require"],
      [/\bprocess\.(env|argv|cwd|exit|platform)\b/, "process"],
      [/\bDate\.now\s*\(/, "Date.now()"],
      [/\bnew\s+Date\s*\(/, "new Date()"],
    ];
    expect(banned.filter(([re]) => re.test(code)).map(([, why]) => why)).toEqual([]);
  }, 60_000);

  it("bundles the ./glb entry with no Node, and the bundle writes a valid GLB (the pinned bytes)", async () => {
    const out = await build({
      entryPoints: [join(HERE, "../src/glb.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      write: false,
      logLevel: "silent",
      minifyWhitespace: true,
      legalComments: "none",
      metafile: true,
      // Paths in the metafile are relative to the package, wherever vitest runs from.
      absWorkingDir: join(HERE, ".."),
      // glTF-Transform's `NodeIO`, which `writeGlb` never uses, loads `node:fs` and `node:path` by a
      // lazy `import()`; esbuild resolves it before it shakes the class out, so it is external here,
      // and the scan below proves no `node:` module survives into the bundle in any form.
      external: ["node:*"],
    });
    expect(out.errors).toEqual([]);
    const inputs = Object.keys(out.metafile?.inputs ?? {});
    expect(inputs).toContain("src/glb/write.ts");
    expect(inputs.some((f) => /node_modules[\\/]@gltf-transform[\\/]core[\\/]/.test(f))).toBe(true);
    // Only this package's own modules and its libraries: not the core, and nothing a GLB writer does
    // not need (the adapter, the mesh stage, Scene3D, the replay, three.js, earcut).
    expect(inputs.filter((f) => !/^(src[\\/]|package\.json$|(\.\.[\\/])*node_modules[\\/])/.test(f))).toEqual([]);
    expect(inputs.filter((f) => /src[\\/](adapter|mesh|scene3d|replay)[\\/]|[\\/](three|earcut)[\\/]/.test(f))).toEqual(
      [],
    );
    const code = out.outputFiles?.[0]?.text ?? "";
    // glTF-Transform's bundle names `Math.random` (an id helper for READING external resources), so the
    // scan bans Node and the clock; the run below proves the write path never calls it.
    const banned: Array<[RegExp, string]> = [
      [/\bfrom\s*["']node:/, "a static node: import"],
      [/\bimport\s*["']node:/, "a bare node: import"],
      [/\bimport\s*\(\s*["']node:/, "a node: import()"],
      [/\brequire\(\s*["']node:/, "a node: require"],
      [/\bprocess\.(env|argv|cwd|exit|platform)\b/, "process"],
      [/\bDate\.now\s*\(/, "Date.now()"],
      [/\bnew\s+Date\s*\(/, "new Date()"],
      [/\bperformance\.now\s*\(/, "performance.now()"],
    ];
    expect(banned.filter(([re]) => re.test(code)).map(([, why]) => why)).toEqual([]);

    const src = EXAMPLES_LIST.find(([n]) => n === "laneway-house.arch")?.[1] ?? "";
    const r = adaptPlan(src, { world: WORLD });
    if (!r.ok) throw new Error(r.refusal.code);
    const mesh = buildMesh(r.scene);
    // Run the bundle itself, from a temporary directory of its own, loaded and run under a
    // `Math.random` that counts every call.
    const dir = mkdtempSync(join(tmpdir(), "archlang3d-glb-"));
    const real = Math.random;
    let random = 0;
    let glb: Uint8Array;
    try {
      const file = join(dir, "glb.mjs");
      writeFileSync(file, code);
      Math.random = () => {
        random++;
        return real();
      };
      const bundled = (await import(pathToFileURL(file).href)) as {
        writeGlb: (mesh: Mesh3D, opts?: { generator?: string }) => Promise<Uint8Array>;
      };
      glb = await bundled.writeGlb(mesh, { generator: PIN_GENERATOR });
    } finally {
      Math.random = real;
      rmSync(dir, { recursive: true, force: true });
    }
    expect(random, "Math.random called while loading or writing").toBe(0);
    // The GLB 2.0 header: magic "glTF", version 2, total length = the bytes; then the JSON chunk.
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe("glTF");
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a); // "JSON"
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true)))) as {
      asset: { version: string; generator: string };
    };
    expect(json.asset).toEqual({ version: "2.0", generator: PIN_GENERATOR });
    // The same bytes `./node`'s `writeGlb` writes for this plan (`test/glb.test.ts`'s pin).
    expect(createHash("sha256").update(glb).digest("hex")).toBe(LANEWAY_GLB_SHA256);
  }, 60_000);
});
