/**
 * `/s/<id>.png`, the short link's card image (ADR 0034): the plan as `compile()` draws it,
 * rasterised by the same resvg-wasm package and font the Worker bundles, read here from disk.
 */
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as resvg from "@resvg/resvg-wasm";
import { compile, diagnosticToJson, inputTooLarge, rateLimited } from "archlang";
import { describe, expect, it } from "vitest";
import { encodePlanHash } from "../../src/cli/share-codec.mjs";
import { FALLBACK_IMAGE, makeShareWorker, type PreviewDeps } from "../worker/app.js";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, previewSvg, type ResvgWasm, resvgRasterizer } from "../worker/preview.js";
import type { Env, ShareMeta } from "../worker/types.js";
import { supportsDeflateRaw } from "./helpers.js";

(globalThis as { crypto?: unknown }).crypto ??= webcrypto;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ORIGIN = "https://playground.archlang.uk";
const CORE = { compile, diagnosticToJson, inputTooLarge, rateLimited };

const require = createRequire(import.meta.url);
const WASM = readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
const FONT = new Uint8Array(readFileSync(join(ROOT, "assets/fonts/Roboto-Regular.ttf")));
/** One rasteriser for the file: resvg-wasm initialises once per process. */
const rasterize = resvgRasterizer(resvg, WASM, FONT);
/** The static card's bytes, as the asset layer would serve them. */
const OG = readFileSync(join(ROOT, "playground/public/brand/archlang-og.png"));

/** A PNG's signature and its IHDR size. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(bytes);
  expect(b.subarray(0, 8).toString("hex"), "PNG signature").toBe("89504e470d0a1a0a");
  expect(b.subarray(12, 16).toString("latin1"), "IHDR first").toBe("IHDR");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** The Cache API over a Map, counting puts. */
function fakeCache() {
  const store = new Map<string, Response>();
  let puts = 0;
  const cache = {
    async match(req: Request) {
      return store.get(req.url)?.clone();
    },
    async put(req: Request, res: Response) {
      puts++;
      store.set(req.url, res.clone());
    },
  } as unknown as Cache;
  return { cache, store, puts: () => puts };
}

/** The KV store behind the last {@link fakeEnv}, for a test that removes a plan. */
type Store = Map<string, { value: string; metadata: ShareMeta | null }>;

function fakeEnv(over: Partial<Env> = {}, store: Store = new Map()) {
  const env: Env = {
    ASSETS: {
      async fetch(req: Request) {
        return new URL(req.url).pathname === FALLBACK_IMAGE.path
          ? new Response(OG, { headers: { "content-type": "image/png" } })
          : new Response(null, { status: 404 });
      },
    },
    SHARE: {
      getWithMetadata: async <M>(key: string) => ({
        value: store.get(key)?.value ?? null,
        metadata: (store.get(key)?.metadata ?? null) as M | null,
      }),
      put: async (key, value, options) => {
        store.set(key, { value, metadata: (options?.metadata ?? null) as ShareMeta | null });
      },
    },
    ...over,
  };
  return env;
}

async function shareAndFetch(deps: PreviewDeps, source: string, env = fakeEnv()) {
  const worker = makeShareWorker(CORE, deps);
  const created = await worker.fetch(
    new Request(`${ORIGIN}/api/share`, { method: "POST", body: encodePlanHash(source) }),
    env,
  );
  const { id } = (await created.json()) as { id: string };
  const get = (method = "GET") => worker.fetch(new Request(`${ORIGIN}/s/${id}.png`, { method }), env);
  return { id, get, env };
}

describe.skipIf(!supportsDeflateRaw)("/s/<id>.png", () => {
  for (const example of ["studio", "hillside-villa"]) {
    it(`is a ${PREVIEW_WIDTH}×${PREVIEW_HEIGHT} PNG of examples/${example}.arch, the same bytes every time`, async () => {
      const { get } = await shareAndFetch({ rasterize }, read(`examples/${example}.arch`));
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      const png = new Uint8Array(await res.arrayBuffer());
      expect(pngSize(png)).toEqual({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT });
      // Not the static card: the plan itself was drawn.
      expect(Buffer.from(png).equals(OG)).toBe(false);
      const again = new Uint8Array(await (await get()).arrayBuffer());
      expect(Buffer.from(again).equals(Buffer.from(png))).toBe(true);
    });
  }

  it("is rendered once: a miss is stored in the edge cache and the next request is served from it", async () => {
    const cache = fakeCache();
    const store: Store = new Map();
    let renders = 0;
    const counting = async (svg: string) => {
      renders++;
      return rasterize(svg);
    };
    const { id, get } = await shareAndFetch(
      { rasterize: counting, cache: cache.cache },
      read("examples/studio.arch"),
      fakeEnv({}, store),
    );
    const first = Buffer.from(await (await get()).arrayBuffer());
    expect(renders).toBe(1);
    expect(cache.puts()).toBe(1);
    expect([...cache.store.keys()]).toEqual([`${ORIGIN}/s/${id}.png`]);
    const second = await get();
    expect(renders).toBe(1);
    expect(second.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await second.arrayBuffer()).equals(first)).toBe(true);
    const head = await get("HEAD");
    expect(head.status).toBe(200);
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    // Removed on request: the cached card is not served for it any more.
    store.delete(`s:${id}`);
    expect((await get()).status).toBe(404);
  });

  it("is the static card for a plan that draws nothing, and for a host with no renderer, never cached under its key", async () => {
    const broken = `plan "B" {\n  units mm\n  wall exterior thickness 150 { (0,0) arc (4000,0) radius 100 }\n}`;
    for (const [rasterizer, source] of [
      [rasterize, broken],
      [undefined, read("examples/studio.arch")],
    ] as const) {
      const cache = fakeCache();
      const { get } = await shareAndFetch({ rasterize: rasterizer, cache: cache.cache }, source);
      const res = await get();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
      expect(Buffer.from(await res.arrayBuffer()).equals(OG)).toBe(true);
      expect(cache.puts()).toBe(0);
    }
  });

  it("is the static card, no-store and uncached, when the renderer throws; the next request renders", async () => {
    const cache = fakeCache();
    let calls = 0;
    const flaky = async (svg: string) => {
      calls++;
      if (calls === 1) throw new Error("wasm trap");
      return rasterize(svg);
    };
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      const { get } = await shareAndFetch({ rasterize: flaky, cache: cache.cache }, read("examples/studio.arch"));
      const first = await get();
      expect(first.status).toBe(200);
      expect(first.headers.get("cache-control")).toBe("no-store");
      expect(Buffer.from(await first.arrayBuffer()).equals(OG)).toBe(true);
      expect(cache.puts()).toBe(0);
      const second = await get();
      expect(second.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(Buffer.from(await second.arrayBuffer()).equals(OG)).toBe(false);
      expect(cache.puts()).toBe(1);
    } finally {
      console.error = orig;
    }
    expect(JSON.stringify(errors)).toContain("card render failed (Error)");
  });

  it("forgets a failed wasm initialisation, so the next card tries again", async () => {
    let inits = 0;
    const fake: ResvgWasm = {
      initWasm: async () => {
        inits++;
        if (inits === 1) throw new Error("init failed");
      },
      Resvg: class {
        render() {
          return { asPng: () => new Uint8Array([1, 2, 3]), free() {} };
        }
        free() {}
      } as unknown as ResvgWasm["Resvg"],
    };
    const raster = resvgRasterizer(fake, new Uint8Array(0), FONT);
    await expect(raster("<svg/>")).rejects.toThrow("init failed");
    expect(Array.from(await raster("<svg/>"))).toEqual([1, 2, 3]);
    expect(Array.from(await raster("<svg/>"))).toEqual([1, 2, 3]);
    expect(inits).toBe(2); // once failed, once succeeded, then remembered
  });

  it("is the static card, uncached, for an address over its rate of renders", async () => {
    const env = fakeEnv({ RATE_PREVIEW: { limit: async () => ({ success: false }) } });
    let renders = 0;
    const { get } = await shareAndFetch(
      {
        rasterize: async (svg) => {
          renders++;
          return rasterize(svg);
        },
      },
      read("examples/studio.arch"),
      env,
    );
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await res.arrayBuffer()).equals(OG)).toBe(true);
    expect(renders).toBe(0);
  });

  it("is a JSON 404 for an id that holds no plan", async () => {
    const res = await makeShareWorker(CORE, { rasterize }).fetch(new Request(`${ORIGIN}/s/zzzzzzzz.png`), fakeEnv());
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });
});

describe("the card's SVG", () => {
  it("nests the plan's drawing with its own viewBox, drops its size, and escapes the caption", () => {
    const svg = compile(read("examples/hillside-villa.arch")).svg;
    expect(svg).toMatch(/^<svg [^>]*width="841mm"/); // a sheet-sized root: its size must give way
    const card = previewSvg(svg, `A <b>&</b> "plan"`)!;
    expect(card).toContain(`width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}"`);
    const inner = card.split("\n").find((l) => l.startsWith("<svg x="))!;
    expect(inner).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(inner).toContain('viewBox="');
    expect(inner).not.toContain('width="841mm"');
    expect(card).toContain("A &lt;b&gt;&amp;&lt;/b&gt; &quot;plan&quot;");
    expect(previewSvg("", "x")).toBeNull();
    expect(previewSvg("<svg width='1'/>", "x")).toBeNull();
  });
});
