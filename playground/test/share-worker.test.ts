/**
 * The playground Worker's short links (ADR 0034), driven the way the platform drives it:
 * `fetch(Request, env)` on the handler, over in-memory fakes of KV, the rate limiter, Analytics
 * Engine and the asset layer. `wrangler dev` and the live site are exercised by
 * `scripts/smoke.mjs --site playground`; this suite pins the contract without a build.
 */
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { compile, diagnosticToJson, inputTooLarge, rateLimited } from "archlang";
import { describe, expect, it } from "vitest";
import { encodePlanHash } from "../../src/cli/share-codec.mjs";
import { encodeSrc } from "../src/share.js";
import { makeShareWorker, PREVIEW_PER_PERIOD } from "../worker/app.js";
import {
  base62,
  decodePayload,
  escapeHtml,
  ID_MAX,
  ID_MIN,
  PAYLOAD_CAP_CHARS,
  planTitle,
  RATE_PERIOD_SECONDS,
  SHARE_PER_PERIOD,
  SOURCE_CAP_BYTES,
  sharePageHtml,
  sourceHash,
} from "../worker/share-core.js";
import type { Env, ShareMeta } from "../worker/types.js";
import { SOURCE_CAP_BYTES as MCP_SOURCE_CAP_BYTES } from "../../packages/mcp-worker/src/limits.js";
import { supportsDeflateRaw } from "./helpers.js";

// Node 18 has neither a global `crypto` nor a "deflate-raw" DecompressionStream; the Worker runtime
// has both. The suite needs the second, so it skips (visibly) where it is missing.
(globalThis as { crypto?: unknown }).crypto ??= webcrypto;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const STUDIO = read("examples/studio.arch");
const ORIGIN = "https://playground.archlang.uk";

const worker = makeShareWorker({ compile, diagnosticToJson, inputTooLarge, rateLimited });

/** Workers KV over a Map, counting writes. */
function fakeKv(seed: Record<string, { value: string; metadata: ShareMeta | null }> = {}) {
  const store = new Map(Object.entries(seed));
  let puts = 0;
  return {
    store,
    puts: () => puts,
    async getWithMetadata<M>(key: string) {
      const hit = store.get(key);
      return { value: hit?.value ?? null, metadata: (hit?.metadata ?? null) as M | null };
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      puts++;
      store.set(key, { value, metadata: (options?.metadata ?? null) as ShareMeta | null });
    },
  };
}

function fakeEnv(over: Partial<Env> = {}) {
  const points: { blobs?: string[]; indexes?: string[] }[] = [];
  const assetCalls: string[] = [];
  const kv = fakeKv();
  const env: Env = {
    ASSETS: {
      async fetch(req: Request) {
        assetCalls.push(`${req.method} ${new URL(req.url).pathname}`);
        return new Response(null, { status: 404, headers: { "x-from": "assets" } });
      },
    },
    SHARE: kv,
    SHARE_ANALYTICS: { writeDataPoint: (p) => points.push(p) },
    ...over,
  };
  return { env, kv, points, assetCalls };
}

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/share`, {
    method: "POST",
    body,
    headers: { "cf-connecting-ip": "203.0.113.9", ...headers },
  });
const get = (path: string, method = "GET") => new Request(`${ORIGIN}${path}`, { method });

async function share(env: Env, source: string) {
  const res = await worker.fetch(post(encodePlanHash(source)), env);
  return { res, body: (await res.json()) as { id: string; url: string; error?: { code: string } } };
}

describe.skipIf(!supportsDeflateRaw)("short links: the content address", () => {
  it("is base62 of SHA-256 over the source: 43 digits that read back to the digest", async () => {
    const hash = await sourceHash(STUDIO);
    expect(hash).toMatch(/^[0-9A-Za-z]{43}$/);
    // Read the digits back with an independent decoder and compare against node:crypto.
    const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let n = 0n;
    for (const c of hash) n = n * 62n + BigInt(A.indexOf(c));
    expect(n.toString(16).padStart(64, "0")).toBe(createHash("sha256").update(STUDIO, "utf8").digest("hex"));
    expect(base62(new Uint8Array(32))).toBe("0".repeat(43));
  });

  it("one plan, one id: the same source shared twice is stored once", async () => {
    const { env, kv } = fakeEnv();
    const a = await share(env, STUDIO);
    const b = await share(env, STUDIO);
    expect(a.res.status).toBe(200);
    expect(a.body.id).toHaveLength(ID_MIN);
    expect(a.body.id).toBe((await sourceHash(STUDIO)).slice(0, ID_MIN));
    expect(b.body).toEqual(a.body);
    expect(a.body.url).toBe(`${ORIGIN}/s/${a.body.id}`);
    expect(kv.puts()).toBe(1);
  });

  it("is one id per plan whichever encoder wrote the payload (the CLI's zlib or a browser's)", async () => {
    const { env } = fakeEnv();
    // Two levels stand in for two encoders: deflate output is the encoder's choice.
    const villa = read("examples/hillside-villa.arch");
    const fast = deflateRawSync(Buffer.from(villa, "utf8"), { level: 1 }).toString("base64url");
    const best = encodePlanHash(villa);
    const web = (await encodeSrc(villa)).slice("#z=".length);
    expect(fast).not.toBe(best);
    const ids = new Set<string>();
    for (const payload of [fast, best, web]) {
      const res = await worker.fetch(post(payload), env);
      ids.add(((await res.json()) as { id: string }).id);
    }
    expect([...ids]).toEqual([(await sourceHash(villa)).slice(0, ID_MIN)]);
  });

  it("lengthens past a prefix that holds a different plan, one character at a time, deterministically", async () => {
    const hash = await sourceHash(STUDIO);
    const other: ShareMeta = { v: 1, h: "x".repeat(43), t: "Other" };
    const seed = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n - ID_MIN + 1 }, (_, i) => [
          `s:${hash.slice(0, ID_MIN + i)}`,
          { value: "AA", metadata: other },
        ]),
      );
    for (const taken of [ID_MIN, ID_MIN + 1]) {
      const kv = fakeKv(seed(taken));
      const { env } = fakeEnv({ SHARE: kv });
      const { body } = await share(env, STUDIO);
      expect(body.id).toBe(hash.slice(0, taken + 1));
      // The other plans keep their ids: nothing is ever overwritten.
      expect(kv.store.get(`s:${hash.slice(0, ID_MIN)}`)?.metadata?.h).toBe(other.h);
      // Asked again, the same lengthened id.
      expect((await share(env, STUDIO)).body.id).toBe(body.id);
    }
    expect(ID_MAX).toBe(43);
  });
});

describe.skipIf(!supportsDeflateRaw)("short links: what POST /api/share refuses", () => {
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

  it("a body over the payload cap, before reading it all", async () => {
    const { env, kv } = fakeEnv();
    const res = await worker.fetch(post("A".repeat(PAYLOAD_CAP_CHARS + 1)), env);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string; diagnostic: { code: string } } };
    expect(body.error.code).toBe("payload_too_large");
    expect(body.error.diagnostic.code).toBe("E_INPUT_TOO_LARGE");
    expect(kv.puts()).toBe(0);
  });

  it("text that is not base64url, base64url that is not deflate, deflate that is not UTF-8", async () => {
    const { env } = fakeEnv();
    for (const body of ["not base64!", "", "A", Buffer.from("plain bytes").toString("base64url")]) {
      const res = await worker.fetch(post(body), env);
      expect(res.status, body).toBe(400);
      expect(await code(res)).toBe("bad_payload");
    }
    const badUtf8 = deflateRawSync(Buffer.from([0x70, 0x6c, 0xff, 0xfe])).toString("base64url");
    expect(await code(await worker.fetch(post(badUtf8), env))).toBe("bad_payload");
  });

  it("a payload that inflates past the source cap (a deflate bomb), stopping at the cap", async () => {
    const bomb = encodePlanHash(`plan "B" {\n${" ".repeat(SOURCE_CAP_BYTES)}\n}`);
    expect(bomb.length).toBeLessThan(2000);
    const { env } = fakeEnv();
    const res = await worker.fetch(post(bomb), env);
    expect(res.status).toBe(413);
    expect(await code(res)).toBe("source_too_large");
    expect(await decodePayload(bomb, 1024)).toBe("source_too_large");
    // A plan of exactly the cap is read; the cap is the hosted MCP Worker's, held in step here.
    const atCap = `plan "B" {
${" ".repeat(SOURCE_CAP_BYTES - 13)}
}`;
    expect(new TextEncoder().encode(atCap).length).toBe(SOURCE_CAP_BYTES);
    expect(await decodePayload(encodePlanHash(atCap))).toBe(atCap);
    expect(SOURCE_CAP_BYTES).toBe(MCP_SOURCE_CAP_BYTES);
  });

  it("text the parser does not accept as a plan, with its E_PARSE diagnostic", async () => {
    const { env, kv } = fakeEnv();
    const res = await worker.fetch(post(encodePlanHash("hello world")), env);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; diagnostic: { code: string } } };
    expect(body.error.code).toBe("not_a_plan");
    expect(body.error.diagnostic.code).toBe("E_PARSE");
    expect(kv.puts()).toBe(0);
  });

  it("but stores a plan whose only faults are its own (a resolve error is what people share to ask)", async () => {
    const broken = `plan "E2E" {\n  units mm\n  wall exterior thickness 150 { (0,0) arc (4000,0) radius 100 }\n}`;
    expect(compile(broken).diagnostics.some((d) => d.code === "E_ARC_RADIUS")).toBe(true);
    const { env } = fakeEnv();
    expect((await share(env, broken)).res.status).toBe(200);
  });

  it("an address over its rate, with E_RATE_LIMITED and Retry-After, before reading the body", async () => {
    const { env, kv } = fakeEnv({ RATE_SHARE: { limit: async () => ({ success: false }) } });
    const res = await worker.fetch(post(encodePlanHash(STUDIO)), env);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(RATE_PERIOD_SECONDS));
    const body = (await res.json()) as { error: { code: string; diagnostic: { code: string } } };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.diagnostic.code).toBe("E_RATE_LIMITED");
    expect(kv.puts()).toBe(0);
  });

  it("keys the limiter on the connecting address, and a limiter fault lets the request through", async () => {
    const keys: string[] = [];
    const limit = async ({ key }: { key: string }) => {
      keys.push(key);
      return { success: true };
    };
    const { env } = fakeEnv({ RATE_SHARE: { limit } });
    await share(env, STUDIO);
    expect(keys).toEqual(["203.0.113.9"]);
    const faulty = fakeEnv({
      RATE_SHARE: {
        limit: async () => {
          throw new Error("down");
        },
      },
    });
    expect((await share(faulty.env, STUDIO)).res.status).toBe(200);
  });

  it("every refusal is JSON with a stable code, never a stack", async () => {
    const throwing = fakeEnv({
      SHARE: {
        getWithMetadata: async () => {
          throw new Error("kv exploded at /secret/path");
        },
        put: async () => {},
      },
    });
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      const res = await worker.fetch(post(encodePlanHash(STUDIO)), throwing.env);
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: { code: "unavailable", message: "internal error" } });
      expect(text).not.toContain("secret");
    } finally {
      console.error = orig;
    }
    expect(JSON.stringify(errors)).not.toContain("secret");
    const noKv = fakeEnv({ SHARE: undefined });
    expect((await share(noKv.env, STUDIO)).res.status).toBe(503);
    const wrongMethod = await worker.fetch(get("/api/share"), fakeEnv().env);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
  });
});

describe.skipIf(!supportsDeflateRaw)("short links: only the playground itself may create one", () => {
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
  const z = encodePlanHash(STUDIO);

  it("refuses a browser POST from another site: a foreign Origin, or a Sec-Fetch-Site that is not same-origin", async () => {
    const refused: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "null" },
      { origin: "http://playground.archlang.uk" }, // another scheme is another origin
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { origin: ORIGIN, "sec-fetch-site": "cross-site" },
    ];
    for (const headers of refused) {
      const { env, kv, points } = fakeEnv();
      const res = await worker.fetch(post(z, { "content-type": "text/plain;charset=utf-8", ...headers }), env);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect(await code(res)).toBe("cross_origin");
      expect(kv.puts()).toBe(0);
      expect(points.map((p) => p.blobs!.slice(0, 2))).toEqual([["refused", "cross-origin"]]);
    }
  });

  it("refuses before the rate limiter is asked, so another site cannot spend a visitor's quota", async () => {
    let asked = 0;
    const limit = async () => {
      asked++;
      return { success: true };
    };
    const { env } = fakeEnv({ RATE_SHARE: { limit } });
    expect((await worker.fetch(post(z, { origin: "https://evil.example" }), env)).status).toBe(403);
    expect(asked).toBe(0);
  });

  it("accepts the playground's own request, and a request with neither header (a server, curl, the smoke test)", async () => {
    const accepted: Record<string, string>[] = [
      {},
      { origin: ORIGIN },
      { "sec-fetch-site": "same-origin" },
      { origin: ORIGIN, "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "none" },
    ];
    for (const headers of accepted) {
      const { env } = fakeEnv();
      const res = await worker.fetch(post(z, headers), env);
      expect(res.status, JSON.stringify(headers)).toBe(200);
    }
  });
});

describe.skipIf(!supportsDeflateRaw)("short links: resolving", () => {
  it("GET /s/<id> is the card page, then on to /#z=<payload>, and the editor reads the source back", async () => {
    const { env, kv } = fakeEnv();
    const { body } = await share(env, STUDIO);
    const res = await worker.fetch(get(`/s/${body.id}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toMatch(/^public, max-age=\d+$/);
    const page = await res.text();
    const payload = kv.store.get(`s:${body.id}`)!.value;
    expect(page).toContain(`<title>Studio 1BR · ArchLang playground</title>`);
    expect(page).toContain(`<meta property="og:title" content="Studio 1BR">`);
    expect(page).toContain(`<meta name="twitter:card" content="summary_large_image">`);
    expect(page).toContain(`<link rel="canonical" href="${ORIGIN}/s/${body.id}">`);
    expect(page).toContain(`<meta property="og:url" content="${ORIGIN}/s/${body.id}">`);
    expect(page).toContain(`<meta property="og:image" content="${ORIGIN}/s/${body.id}.png">`);
    expect(page).toContain(`<meta property="og:image:width" content="1200">`);
    expect(page).toContain(`<meta property="og:image:height" content="630">`);
    expect(page).toContain(`<meta name="twitter:image" content="${ORIGIN}/s/${body.id}.png">`);
    expect(page).toContain(`location.replace("/#z=${payload}")`);
    expect(page).toContain(`<noscript><meta http-equiv="refresh" content="0; url=/#z=${payload}"></noscript>`);
    expect(await decodePayload(payload)).toBe(STUDIO);
  });

  it("HEAD answers the same headers with no body, and is not counted as an open", async () => {
    const { env, points } = fakeEnv();
    const { body } = await share(env, STUDIO);
    const res = await worker.fetch(get(`/s/${body.id}`, "HEAD"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect((await worker.fetch(get(`/api/share/${body.id}`, "HEAD"), env)).status).toBe(200);
    expect(points.map((p) => p.indexes![0])).toEqual(["create"]);
  });

  it("a query on /s/<id> is a 301 to the canonical path, counted as nothing", async () => {
    const { env, points } = fakeEnv();
    const { body } = await share(env, STUDIO);
    for (const q of ["?utm_source=x", "?", "?a=1&b=2"]) {
      const res = await worker.fetch(get(`/s/${body.id}${q}`), env);
      // `?` alone is no search to the URL parser: it is the canonical page.
      if (q === "?") {
        expect(res.status).toBe(200);
        continue;
      }
      expect(res.status, q).toBe(301);
      expect(res.headers.get("location")).toBe(`/s/${body.id}`);
      expect(await res.text()).toBe("");
    }
    expect(points.map((p) => p.indexes![0])).toEqual(["create", "resolve"]);
    // Unknown ids redirect too: the query never reaches the store.
    expect((await worker.fetch(get("/s/zzzzzzzz?x=1"), env)).status).toBe(301);
  });

  it("GET /api/share/<id> is the payload as JSON, cacheable forever, readable cross-origin", async () => {
    const { env, kv } = fakeEnv();
    const { body } = await share(env, STUDIO);
    const res = await worker.fetch(get(`/api/share/${body.id}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ id: body.id, z: kv.store.get(`s:${body.id}`)!.value });
  });

  it("an unknown or malformed id is a 404 page with a way on to the playground", async () => {
    const { env } = fakeEnv();
    for (const path of ["/s/zzzzzzzz", "/s/short", "/s/", "/s/abc%3Cdef", "/s/0123456789/extra"]) {
      const res = await worker.fetch(get(path), env);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(await res.text()).toContain(`<a href="/">Open the ArchLang playground</a>`);
    }
    const json = await worker.fetch(get("/api/share/zzzzzzzz"), env);
    expect(json.status).toBe(404);
    expect(((await json.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("a plan's name is escaped wherever the page writes it", async () => {
    const evil = `plan "</title><script>alert('x')</script>&\\"" {\n  units mm\n  room at (0,0) size 4000x3000 label "R"\n}`;
    const name = compile(evil).ast?.name ?? "";
    expect(name).toContain("<script>");
    const { env } = fakeEnv();
    const { res, body } = await share(env, evil);
    expect(res.status).toBe(200);
    const page = await (await worker.fetch(get(`/s/${body.id}`), env)).text();
    expect(page).not.toContain("<script>alert");
    expect(page).not.toContain("</title><");
    expect(page).toContain("&lt;/title&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;&quot;");
    // The only script on the page is the redirect.
    expect(page.match(/<script>/g)).toHaveLength(1);
  });

  it("the title is the plan's name, collapsed and capped, or a default", () => {
    expect(planTitle("  Two\n  words ")).toBe("Two words");
    expect(planTitle("")).toBe("ArchLang plan");
    expect(planTitle(undefined)).toBe("ArchLang plan");
    expect([...planTitle("x".repeat(500))]).toHaveLength(120);
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
    const page = sharePageHtml({ origin: ORIGIN, id: "abcdefgh", payload: "AAAA", title: "T", image: { url: "u" } });
    expect(page).not.toContain("og:image:width");
  });

  it("counts one data point per create and per resolve: the event, the id and the day, nothing else", async () => {
    const { env, points } = fakeEnv();
    const { body } = await share(env, STUDIO);
    await worker.fetch(get(`/s/${body.id}`), env);
    await worker.fetch(get(`/api/share/${body.id}`), env);
    await worker.fetch(post("not base64!"), env);
    expect(points.map((p) => p.indexes)).toEqual([["create"], ["resolve"], ["resolve-json"], ["refused"]]);
    for (const p of points) {
      expect(p.blobs).toHaveLength(3);
      expect(p.blobs![2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(JSON.stringify(p)).not.toContain("203.0.113.9");
    }
    expect(points[0]!.blobs!.slice(0, 2)).toEqual(["create", body.id]);
    expect(points[3]!.blobs![1]).toBe("payload");
  });
});

describe("the static paths stay the asset layer's", () => {
  /** wrangler.jsonc as data: `//` line comments removed (none of these files puts `//` in a string). */
  const jsonc = (rel: string) => JSON.parse(read(rel).replace(/^\s*\/\/.*$/gm, ""));
  const w = jsonc("playground/wrangler.jsonc");

  it("the script runs first for exactly /s/* and /api/*, and every other path is the asset layer's", async () => {
    expect(w.main).toBe("worker/index.ts");
    expect(w.assets.run_worker_first).toEqual(["/s/*", "/api/*"]);
    expect(w.assets.binding).toBe("ASSETS");
    expect(w.assets.html_handling).toBe("none");
    expect(w.assets.not_found_handling).toBe("none");
    // A request the asset layer finds no file for reaches the script; it goes straight back.
    const { env, assetCalls } = fakeEnv();
    for (const path of ["/no-such-page", "/embed", "/s", "/api", "/sx/abc", "/examples/nope.html"]) {
      const res = await worker.fetch(get(path), env);
      expect(res.headers.get("x-from"), path).toBe("assets");
    }
    const res = await worker.fetch(new Request(`${ORIGIN}/robots.txt`, { method: "POST", body: "x" }), env);
    expect(res.headers.get("x-from")).toBe("assets");
    expect(assetCalls).toHaveLength(7);
  });

  it("binds the store, the limiter at the numbers the code states, and the counter; logs no request", () => {
    expect(w.kv_namespaces).toEqual([{ binding: "SHARE", id: "1a147498742b4bd4b4579175085ef9a0" }]);
    const limits = w.ratelimits as { name: string; namespace_id: string; simple: unknown }[];
    expect(Object.fromEntries(limits.map((r) => [r.name, r.simple]))).toEqual({
      RATE_SHARE: { limit: SHARE_PER_PERIOD, period: RATE_PERIOD_SECONDS },
      RATE_PREVIEW: { limit: PREVIEW_PER_PERIOD, period: RATE_PERIOD_SECONDS },
    });
    const mcp = jsonc("packages/mcp-worker/wrangler.jsonc");
    const taken = (mcp.ratelimits as { namespace_id: string }[]).map((r) => r.namespace_id);
    const ours = limits.map((r) => r.namespace_id);
    expect(new Set([...taken, ...ours]).size).toBe(taken.length + ours.length);
    expect(w.analytics_engine_datasets).toEqual([{ binding: "SHARE_ANALYTICS", dataset: "archlang_share" }]);
    expect(w.observability).toEqual({ enabled: true, logs: { enabled: true, invocation_logs: false } });
    expect(w.workers_dev).toBe(false);
  });

  it("the docs Worker stays script-less", () => {
    const docs = jsonc("docs-site/wrangler.jsonc");
    expect(docs.main).toBeUndefined();
    expect(docs.assets.run_worker_first).toBeUndefined();
  });
});
