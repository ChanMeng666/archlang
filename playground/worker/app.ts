/**
 * The playground Worker's request handler (ADR 0034). It runs ONLY for the paths
 * `assets.run_worker_first` lists in `playground/wrangler.jsonc` (`/s/*`, `/api/*`), plus any
 * request the asset layer finds no file for, which it hands straight back to the asset layer
 * (`env.ASSETS`) so a 404 is the asset layer's own. Every other path is served as a static asset
 * without this code running.
 *
 *   POST /api/share        body: a `#z=` payload → `{ id, url }`, the plan stored in KV
 *   GET  /api/share/<id>   → `{ id, z }` (embed.html's `#s=<id>`)
 *   GET  /s/<id>           → a small HTML page: the card metadata, then on to `/#z=<payload>`
 *   GET  /s/<id>.png       → the 1200×630 card image: the plan as `compile()` draws it
 *
 * The core is passed in rather than imported, so the same handler runs bundled by wrangler
 * (`worker/index.ts`), against the core's source under vitest, and against the built core in a
 * Playwright route (`playground/e2e/short-link.spec.ts`).
 */
import type * as Archlang from "archlang";
import {
  DEFAULT_TITLE,
  decodePayload,
  ID_MAX,
  ID_MIN,
  isShareId,
  notFoundHtml,
  PAYLOAD_CAP_CHARS,
  planTitle,
  RATE_PERIOD_SECONDS,
  SHARE_PER_PERIOD,
  SOURCE_CAP_BYTES,
  shareKey,
  sharePageHtml,
  sourceHash,
} from "./share-core.js";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, previewSvg, type Rasterize } from "./preview.js";
import type { Env, ExecutionContext, ShareMeta } from "./types.js";

/** The core functions the handler calls. */
export type Core = Pick<typeof Archlang, "compile" | "diagnosticToJson" | "inputTooLarge" | "rateLimited">;

/** The stable `error.code` values a JSON refusal carries. */
export type ShareErrorCode =
  | "cross_origin"
  | "payload_too_large"
  | "source_too_large"
  | "bad_payload"
  | "not_a_plan"
  | "rate_limited"
  | "not_found"
  | "method_not_allowed"
  | "unavailable";

/**
 * The site's static card, served for `/s/<id>.png` when the plan draws nothing (it has an error),
 * draws too much to rasterise here ({@link PREVIEW_SVG_CAP}), or the renderer is unavailable.
 */
export const FALLBACK_IMAGE = { path: "/brand/archlang-og.png", width: 1200, height: 630 } as const;

/**
 * The largest compiled SVG the Worker rasterises, in characters. Measured on a desktop: the
 * largest example (`hillside-villa`) compiles and rasterises in ~0.4 s; 70×70 rooms written as a
 * loop, near the element budget, draw 1.7 M characters in ~2.3 s. Past this cap the static card is
 * served instead, so no plan can make one card cost more than that.
 */
export const PREVIEW_SVG_CAP = 2_000_000;

/** `/s/<id>.png` cache misses per address per period (`RATE_PREVIEW`): a hit renders nothing. */
export const PREVIEW_PER_PERIOD = 120;

/** What the Worker draws card images with; absent, `/s/<id>.png` is always the static card. */
export interface PreviewDeps {
  rasterize?: Rasterize;
  /** The edge cache (`caches.default`); absent in a bare test, which then renders every time. */
  cache?: Cache;
}

/** The parse-stage and budget refusals that make a payload "not a plan" (see {@link create}). */
const NOT_A_PLAN = new Set(["E_PARSE", "E_STEP_LIMIT"]);

/** Every response this Worker writes carries these, as `public/_headers`' `/*` rule does for assets. */
const BASE_HEADERS = {
  "strict-transport-security": "max-age=63072000",
  "x-content-type-options": "nosniff",
} as const;

const IMMUTABLE = "public, max-age=31536000, immutable";

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function refuse(
  status: number,
  code: ShareErrorCode,
  message: string,
  extra: { diagnostic?: unknown; headers?: Record<string, string> } = {},
): Response {
  return json(
    status,
    { error: { code, message, ...(extra.diagnostic ? { diagnostic: extra.diagnostic } : {}) } },
    { "cache-control": "no-store", ...extra.headers },
  );
}

function html(status: number, body: string, cache: string, method: string): Response {
  return new Response(method === "HEAD" ? null : body, {
    status,
    headers: {
      ...BASE_HEADERS,
      "content-type": "text/html; charset=utf-8",
      "cache-control": cache,
      "x-robots-tag": "noindex",
    },
  });
}

/**
 * The caller's address, for the rate limiter only: it is never stored, logged or counted
 * (ADR 0034, privacy).
 */
const addressOf = (req: Request): string => req.headers.get("cf-connecting-ip") ?? "unknown";

/**
 * Is this request from another site? A browser sends `Origin` on every POST and `Sec-Fetch-Site`
 * on every request; the playground's own fetch is same-origin. The client posts `text/plain`, a
 * CORS "simple" request, so no preflight stops another page from making its visitors' browsers
 * store plans (and spreading the per-address rate across them): the Worker refuses it here. A
 * request with neither header (a server, `curl`, the smoke test) is not a browser's, and passes.
 */
export function crossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) return true;
  const site = req.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/** `true` when the limiter (absent in a test or a bare local run) lets this address through. */
async function allowed(limiter: Env["RATE_SHARE"], req: Request): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key: addressOf(req) })).success;
  } catch {
    return true; // a limiter fault never takes sharing down
  }
}

/** The events counted: one data point each, holding the event, the id and the UTC day. */
export type ShareEvent = "create" | "resolve" | "resolve-json" | "preview" | "refused";

function count(env: Env, event: ShareEvent, idOrReason: string): void {
  try {
    env.SHARE_ANALYTICS?.writeDataPoint({
      blobs: [event, idOrReason, new Date().toISOString().slice(0, 10)],
      indexes: [event],
    });
  } catch {
    /* telemetry never fails a request */
  }
}

/**
 * Read a request body as text, refusing past `cap` characters without buffering the rest. The
 * body is ASCII when valid, so bytes and characters agree; anything else fails validation later.
 */
async function readCapped(req: Request, cap: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > cap) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** A stored share: its payload and metadata, or null. */
async function lookup(env: Env, id: string): Promise<{ payload: string; meta: ShareMeta | null } | null> {
  if (!env.SHARE || !isShareId(id)) return null;
  const { value, metadata } = await env.SHARE.getWithMetadata<ShareMeta>(shareKey(id));
  return value === null ? null : { payload: value, meta: metadata };
}

/** Build the handler over a core, and the card renderer when there is one. */
export function makeShareWorker(core: Core, preview: PreviewDeps = {}) {
  /**
   * `POST /api/share`. The payload must decode, inflate to UTF-8 within the source cap, and be a
   * plan the core reads: `compile()` is the core's public route to its parser, and a plan that
   * fails to parse (`E_PARSE`) or runs out of steps (`E_STEP_LIMIT`) is refused, so the store
   * holds plans and not arbitrary text. Any other diagnostic is the plan's own business: a plan
   * with a wall error is exactly what someone shares to ask for help.
   */
  async function create(req: Request, env: Env): Promise<Response> {
    if (crossSite(req)) {
      count(env, "refused", "cross-origin");
      return refuse(403, "cross_origin", "short links are made from the playground itself, not from another site");
    }
    if (!(await allowed(env.RATE_SHARE, req))) {
      count(env, "refused", "rate");
      const d = core.rateLimited("share", SHARE_PER_PERIOD, RATE_PERIOD_SECONDS);
      return refuse(429, "rate_limited", d.message, {
        diagnostic: core.diagnosticToJson("", d),
        headers: { "retry-after": String(RATE_PERIOD_SECONDS) },
      });
    }
    const body = await readCapped(req, PAYLOAD_CAP_CHARS);
    if (body === null) {
      count(env, "refused", "payload-size");
      const d = core.inputTooLarge(PAYLOAD_CAP_CHARS + 1, PAYLOAD_CAP_CHARS, "share payload", false)!;
      return refuse(413, "payload_too_large", d.message, { diagnostic: core.diagnosticToJson("", d) });
    }
    const payload = body.trim();
    const source = await decodePayload(payload, SOURCE_CAP_BYTES);
    if (source === "bad_payload") {
      count(env, "refused", "payload");
      return refuse(400, "bad_payload", "the body is not a #z= payload: base64url of deflate-raw UTF-8 plan source");
    }
    if (source === "source_too_large") {
      count(env, "refused", "source-size");
      const d = core.inputTooLarge(SOURCE_CAP_BYTES + 1, SOURCE_CAP_BYTES, "plan source", false)!;
      return refuse(413, "source_too_large", d.message, { diagnostic: core.diagnosticToJson("", d) });
    }
    const result = core.compile(source, { noCache: true });
    const fault = result.diagnostics.find((d) => d.severity === "error" && NOT_A_PLAN.has(d.code ?? ""));
    if (fault) {
      count(env, "refused", "not-a-plan");
      return refuse(422, "not_a_plan", "the payload is not an ArchLang plan the parser accepts", {
        diagnostic: core.diagnosticToJson(source, fault),
      });
    }
    if (!env.SHARE) return refuse(503, "unavailable", "short links are not configured on this host");

    const hash = await sourceHash(source);
    const meta: ShareMeta = { v: 1, h: hash, t: planTitle(result.ast?.name) };
    // The shortest free prefix: an id already holding THIS plan is reused (one plan, one link),
    // one holding another plan is passed over for a longer prefix. Never overwritten by this
    // code: a short link, once given out, names one plan. KV is eventually consistent, so two
    // DIFFERENT plans sharing an 8-character prefix and created within its propagation window
    // (about 60 s) at two locations could both see the key free; the chance for a given pair is
    // about 2^-47 (ADR 0034).
    for (let n = ID_MIN; n <= ID_MAX; n++) {
      const id = hash.slice(0, n);
      const { value, metadata } = await env.SHARE.getWithMetadata<ShareMeta>(shareKey(id));
      if (value === null) {
        await env.SHARE.put(shareKey(id), payload, { metadata: meta });
      } else if (metadata?.h !== hash) {
        continue;
      }
      count(env, "create", id);
      return json(200, { id, url: `${new URL(req.url).origin}/s/${id}` }, { "cache-control": "no-store" });
    }
    return refuse(503, "unavailable", "no free id for this plan");
  }

  /** `GET /api/share/<id>`: the payload, for `embed.html#s=<id>`. */
  async function payloadOf(req: Request, id: string, env: Env): Promise<Response> {
    const hit = await lookup(env, id);
    if (!hit) return refuse(404, "not_found", "no plan is stored under this id");
    if (req.method === "GET") count(env, "resolve-json", id);
    return json(200, { id, z: hit.payload }, { "cache-control": IMMUTABLE, "access-control-allow-origin": "*" });
  }

  /** `GET /s/<id>`: the card page. */
  async function page(req: Request, id: string, env: Env): Promise<Response> {
    const hit = await lookup(env, id);
    if (!hit) return html(404, notFoundHtml(), "public, max-age=60", req.method);
    // A crawler's HEAD before its GET is not an open.
    if (req.method === "GET") count(env, "resolve", id);
    const origin = new URL(req.url).origin;
    const body = sharePageHtml({
      origin,
      id,
      payload: hit.payload,
      title: hit.meta?.t ?? DEFAULT_TITLE,
      image: { url: `${origin}/s/${id}.png`, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT },
    });
    // A day, not a year: the plan behind an id never changes, but this page's template can,
    // and a crawler re-reads it anyway.
    return html(200, body, "public, max-age=86400", req.method);
  }

  /** The static card, from the asset layer, under this route's headers. */
  async function fallbackImage(req: Request, env: Env, cache: string): Promise<Response> {
    const asset = await env.ASSETS.fetch(new Request(new URL(FALLBACK_IMAGE.path, req.url), { method: "GET" }));
    if (!asset.ok) return refuse(503, "unavailable", "no card image");
    return new Response(req.method === "HEAD" ? null : asset.body, {
      status: 200,
      headers: { ...BASE_HEADERS, "content-type": "image/png", "cache-control": cache },
    });
  }

  /**
   * `GET /s/<id>.png`: the plan's card. The image is a function of the stored plan and this
   * Worker's code, so it is rendered once per edge location and kept in its cache, `immutable`.
   * Only a rendered card is cached under the plan's key. The static card stands in, never cached
   * under that key: for a plan that draws nothing (an error) or too much ({@link PREVIEW_SVG_CAP})
   * it is served for a day; for an address over its rate of cache misses, or a renderer fault, it
   * is `no-store`, so the next request renders.
   */
  async function image(req: Request, id: string, env: Env, ctx?: ExecutionContext): Promise<Response> {
    // The store first, the cache second: a plan removed on request stops showing at once, even
    // where its card is still cached (one KV read per card request buys that).
    const hit = await lookup(env, id);
    if (!hit) return refuse(404, "not_found", "no plan is stored under this id");
    const key = new Request(new URL(`/s/${id}.png`, req.url), { method: "GET" });
    const cached = await preview.cache?.match(key);
    if (cached) return req.method === "HEAD" ? new Response(null, cached) : cached;

    if (!(await allowed(env.RATE_PREVIEW, req))) {
      count(env, "refused", "preview-rate");
      return fallbackImage(req, env, "no-store");
    }
    count(env, "preview", id);
    const source = await decodePayload(hit.payload, SOURCE_CAP_BYTES);
    const svg =
      typeof source === "string" && source !== "bad_payload" && source !== "source_too_large"
        ? core.compile(source, { noCache: true }).svg
        : "";
    const card = svg.length > 0 && svg.length <= PREVIEW_SVG_CAP ? previewSvg(svg, hit.meta?.t ?? DEFAULT_TITLE) : null;
    if (!card || !preview.rasterize) return fallbackImage(req, env, "public, max-age=86400");
    let png: Uint8Array;
    try {
      png = await preview.rasterize(card);
    } catch (e) {
      // Never a 500 for a card: the static one, uncached, and the error's name in the log.
      console.error(`share worker: card render failed (${(e as Error)?.name ?? "unknown"})`);
      return fallbackImage(req, env, "no-store");
    }
    const res = new Response(png as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: { ...BASE_HEADERS, "content-type": "image/png", "cache-control": IMMUTABLE },
    });
    if (preview.cache) {
      const put = preview.cache.put(key, res.clone());
      if (ctx) ctx.waitUntil(put);
      else await put;
    }
    return req.method === "HEAD" ? new Response(null, res) : res;
  }

  async function route(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const { pathname, search } = new URL(req.url);
    const read = req.method === "GET" || req.method === "HEAD";
    if (pathname === "/api/share") {
      if (req.method !== "POST")
        return refuse(405, "method_not_allowed", "POST a #z= payload", { headers: { allow: "POST" } });
      return create(req, env);
    }
    if (pathname.startsWith("/api/share/")) {
      if (!read) return refuse(405, "method_not_allowed", "GET only", { headers: { allow: "GET, HEAD" } });
      return payloadOf(req, pathname.slice("/api/share/".length), env);
    }
    if (pathname.startsWith("/api/")) return refuse(404, "not_found", "no such endpoint");
    if (pathname.startsWith("/s/")) {
      if (!read) return refuse(405, "method_not_allowed", "GET only", { headers: { allow: "GET, HEAD" } });
      // One URL per share: a query (a tracker's `?utm_…`, a cache-buster) goes to the canonical
      // path, so it is neither a second page or card to cache nor a second count.
      if (search !== "") {
        return new Response(null, {
          status: 301,
          headers: { ...BASE_HEADERS, location: pathname, "cache-control": "public, max-age=86400" },
        });
      }
      const rest = pathname.slice("/s/".length);
      if (rest.endsWith(".png")) return image(req, rest.slice(0, -".png".length), env, ctx);
      return page(req, rest, env);
    }
    // Not one of ours: the asset layer found no file for it (or it is a listed prefix we do not
    // serve). Hand it back so the answer is the asset layer's own, byte for byte.
    return env.ASSETS.fetch(req);
  }

  return {
    async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
      try {
        return await route(req, env, ctx);
      } catch (e) {
        // Never a stack, and never the plan: the error's name only.
        console.error(`share worker: internal error (${(e as Error)?.name ?? "unknown"})`);
        return refuse(500, "unavailable", "internal error");
      }
    },
  };
}
