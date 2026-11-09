/**
 * The hosted ArchLang MCP Worker's request handler (docs/adr/0026-hosted-mcp-worker.md);
 * `worker.ts` is the entry that hands it the assets bundled at build time.
 *
 *   POST /mcp                   stateless Streamable-HTTP MCP: no sign-in, no sessions, JSON replies
 *   GET  /svg/<payload>         a `#z=` payload compiled to `image/svg+xml`, fresh for five minutes
 *   GET  /v/<render>/svg/<p>    the same drawing pinned to one compiler: the only immutable path
 *   GET  /                      the `read_me` text
 *
 * Bounded before any compile work, by counts, never by a clock: a body over
 * {@link BODY_CAP_BYTES} or any tool argument over {@link SOURCE_CAP_BYTES} gets
 * `E_INPUT_TOO_LARGE`, and an address over its request rate gets `E_RATE_LIMITED`, both as data.
 * `compile()`'s own budgets stay counts; a Worker that runs out of CPU anyway fails with the
 * platform's 5xx, which is never presented as a diagnostic.
 *
 * Nothing logs a body or a source. Each MCP message writes one Analytics Engine data point holding
 * its method and tool name, each from a fixed list; there is no other telemetry and no cookie.
 */
import { compile, type Diagnostic, diagnosticToJson, inputTooLarge, rateLimited } from "@chanmeng666/archlang";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { decodePlanHashWeb } from "@chanmeng666/archlang/share";
import {
  BODY_CAP_BYTES,
  MCP_PER_PERIOD,
  MCP_PAYLOAD_CAP_CHARS,
  RATE_PERIOD_SECONDS,
  SOURCE_CAP_BYTES,
  SVG_PER_PERIOD,
} from "./limits.js";
import { createHostedServer, type HostedAssets, readMe } from "./server.js";

/** The pinned image path `/v/<render version>/svg/<payload>`: one compiler, so its bytes never change. */
export const IMMUTABLE = "public, max-age=31536000, immutable";
/**
 * The unpinned `/svg/<payload>`: the plan is in the URL but the compiler is not, and a release can
 * move a drawing, so downstream caches (browsers, image proxies) revalidate after five minutes.
 */
export const FRESH = "public, max-age=300, stale-while-revalidate=86400";

/**
 * OpenAI's plugin-portal domain verification: the portal shows a token and fetches it from this
 * path on the MCP host, expecting the exact token as plain text. The token is a public
 * verification string, not a secret, so it is a plain `vars` entry in wrangler.jsonc; while that is
 * empty the path is a 404 like any unknown one. Nothing is logged or counted here.
 */
export const OPENAI_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-allow-headers":
    "content-type, accept, if-none-match, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "etag, content-location",
  "access-control-max-age": "86400",
};

function withHeaders(res: Response, extra: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

const jsonResponse = (body: unknown, status: number, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra },
  });

/** The `{ ok:false, diagnostics }` envelope every tool result uses, around one diagnostic. */
const envelope = (d: Diagnostic) => ({ ok: false, diagnostics: [diagnosticToJson("", d)] });

/**
 * The caller's address, for the rate limiters only: it is never stored or logged. Many callers can
 * share one address — a connector platform calls from its own cloud egress — so the per-address
 * ceilings are set high, as an abuse guard; the spend bound is `limits.cpu_ms` plus the owner's
 * billing alert (ADR 0026).
 */
const addressOf = (req: Request): string => req.headers.get("cf-connecting-ip") ?? "unknown";

/** `true` when `limiter` (absent in local dev) lets this address through. */
async function allowed(limiter: RateLimit | undefined, req: Request): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key: addressOf(req) })).success;
  } catch {
    return true; // a limiter fault never takes the service down
  }
}

// ---------------------------------------------------------------------------
// telemetry: method + tool name, from fixed lists, nothing else
// ---------------------------------------------------------------------------

/** The MCP methods a client sends (requests and notifications), as the 2025-06-18 schema names them. */
export const KNOWN_METHODS: ReadonlySet<string> = new Set([
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "resources/subscribe",
  "resources/unsubscribe",
  "prompts/list",
  "prompts/get",
  "completion/complete",
  "logging/setLevel",
  "notifications/initialized",
  "notifications/cancelled",
  "notifications/progress",
  "notifications/roots/list_changed",
]);

/** The tools this server registers; a test holds this list to its own `tools/list`. */
export const KNOWN_TOOLS: ReadonlySet<string> = new Set([
  "compile",
  "describe",
  "lint",
  "validate",
  "score",
  "repair",
  "fix",
  "finish",
  "suggest",
  "complete",
  "link",
  "read_me",
]);

/** A listed name, or the fixed bucket: a client-chosen string never reaches the dataset. */
const listed = (v: unknown, known: ReadonlySet<string>): string =>
  typeof v === "string" && known.has(v) ? v : "(other)";

/** Why a request was refused before any work: the `tool` field of a `refused` data point. */
export type Refusal =
  | "rate-limited /mcp"
  | "rate-limited /svg/"
  | "too-large body"
  | "too-large argument"
  | "too-large payload";

/** One data point for a refusal: method `refused`, tool the reason, both from fixed lists. */
function countRefusal(env: Env, reason: Refusal): void {
  try {
    env.ANALYTICS?.writeDataPoint({ blobs: ["refused", reason], indexes: ["refused"] });
  } catch {
    /* telemetry never fails a request */
  }
}

/** Drop an unread request body before answering early (an unread body can fail the response). */
async function discardBody(req: Request): Promise<void> {
  try {
    await req.body?.cancel();
  } catch {
    /* already consumed or closed */
  }
}

function count(env: Env, messages: unknown[]): void {
  if (!env.ANALYTICS) return;
  for (const m of messages) {
    const msg = (m ?? {}) as { method?: unknown; params?: { name?: unknown } };
    const method = msg.method === undefined ? "(response)" : listed(msg.method, KNOWN_METHODS);
    const tool = method === "tools/call" ? listed(msg.params?.name, KNOWN_TOOLS) : "";
    try {
      env.ANALYTICS.writeDataPoint({ blobs: [method, tool], indexes: [method] });
    } catch {
      /* telemetry never fails a request */
    }
  }
}

// ---------------------------------------------------------------------------
// /mcp
// ---------------------------------------------------------------------------

/**
 * Read at most `cap` bytes of the body: the text, or the number of bytes read when it stopped
 * (more than `cap`; `exact` false), or the declared length when that alone is over.
 */
async function readCapped(req: Request, cap: number): Promise<string | { bytes: number; exact: boolean }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > cap) return { bytes: declared, exact: true };
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
      return { bytes: total, exact: false };
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

/**
 * The diagnostic a `tools/call` earns for an argument over the cap, else `undefined`. EVERY
 * argument is measured — a source, `plan_json`, an intent, a brief, a graph, a profile name —
 * a string by its UTF-8 bytes, anything else by its JSON.
 */
export function oversizeArgument(message: unknown): Diagnostic | undefined {
  const m = (message ?? {}) as { method?: unknown; params?: { arguments?: Record<string, unknown> } };
  if (m.method !== "tools/call") return undefined;
  for (const [name, value] of Object.entries(m.params?.arguments ?? {})) {
    if (value === undefined || typeof value === "number" || typeof value === "boolean") continue;
    if (typeof value === "string") {
      const d = inputTooLarge(value, SOURCE_CAP_BYTES, name);
      if (d) return d;
      continue;
    }
    // Depth first, without recursion: a deeply nested argument would overflow JSON.stringify's
    // stack. Too deep is refused as too large (it cannot be a reasonable plan, intent or graph).
    if (tooDeep(value, MAX_ARGUMENT_DEPTH))
      return {
        ...inputTooLarge(SOURCE_CAP_BYTES + 1, SOURCE_CAP_BYTES, name, false)!,
        message: `${name} is nested more than ${MAX_ARGUMENT_DEPTH} levels deep; this host accepts at most ${MAX_ARGUMENT_DEPTH}`,
      };
    let text: string;
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      return inputTooLarge(SOURCE_CAP_BYTES + 1, SOURCE_CAP_BYTES, name, false);
    }
    const d = inputTooLarge(text, SOURCE_CAP_BYTES, name);
    if (d) return d;
  }
  return undefined;
}

/** The deepest nesting a tool argument may have; a real `plan_json` or intent is a handful of levels. */
export const MAX_ARGUMENT_DEPTH = 64;

/** Whether `value` nests deeper than `limit` arrays/objects, walked with an explicit stack. */
export function tooDeep(value: unknown, limit: number): boolean {
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length > 0) {
    const [v, depth] = stack.pop()!;
    if (v === null || typeof v !== "object") continue;
    if (depth > limit) return true;
    for (const child of Array.isArray(v) ? v : Object.values(v)) {
      if (child !== null && typeof child === "object") stack.push([child, depth + 1]);
    }
  }
  return false;
}

/**
 * Answer every over-cap `tools/call` in the body without starting the server: a normal tool result
 * (`isError`) whose text is the usual `{ ok:false, diagnostics }` envelope, so a model reads it as
 * it reads any failed compile. A batch with one over-cap call is refused whole; a body of
 * notifications only (nothing to answer) gets 202 and no body, as Streamable HTTP specifies.
 */
function refuseOversize(parsed: unknown): Response | undefined {
  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const found = messages.map(oversizeArgument);
  if (found.every((d) => d === undefined)) return undefined;
  const replies = messages
    .map((m, i) => {
      const id = (m as { id?: unknown })?.id;
      if (id === undefined) return undefined; // a notification gets no reply
      const d = found[i];
      if (d)
        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(envelope(d), null, 2) }], isError: true },
        };
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32600, message: "batch refused: another call in it is over the input cap" },
      };
    })
    .filter((r) => r !== undefined);
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
  return jsonResponse(Array.isArray(parsed) ? replies : replies[0], 200);
}

async function handleMcp(req: Request, env: Env, origin: string, assets: HostedAssets): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Method not allowed: this server is stateless; POST JSON-RPC to /mcp." },
      },
      405,
      { allow: "POST, OPTIONS" },
    );

  if (!(await allowed(env.RATE_MCP, req))) {
    await discardBody(req);
    countRefusal(env, "rate-limited /mcp");
    const d = rateLimited("/mcp", MCP_PER_PERIOD, RATE_PERIOD_SECONDS);
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: d.message, data: envelope(d) } },
      429,
      {
        "retry-after": String(RATE_PERIOD_SECONDS),
      },
    );
  }

  const body = await readCapped(req, BODY_CAP_BYTES);
  if (typeof body !== "string") {
    await discardBody(req);
    countRefusal(env, "too-large body");
    const d = inputTooLarge(body.bytes, BODY_CAP_BYTES, "request body", body.exact) as Diagnostic;
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: d.message, data: envelope(d) } },
      413,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: invalid JSON" } },
      400,
    );
  }
  const refused = refuseOversize(parsed);
  if (refused) {
    countRefusal(env, "too-large argument");
    return refused;
  }
  count(env, Array.isArray(parsed) ? parsed : [parsed]);

  const server = createHostedServer(origin, assets);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: no session id is issued or checked
    enableJsonResponse: true, // one JSON reply per POST, no SSE stream to hold open
  });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req, { parsedBody: parsed });
    return withHeaders(res, { ...CORS, "cache-control": "no-store" });
  } finally {
    void server.close();
  }
}

// ---------------------------------------------------------------------------
// /svg/<payload> and /v/<render version>/svg/<payload>
// ---------------------------------------------------------------------------

const SVG_BASE: Record<string, string> = {
  "content-type": "image/svg+xml; charset=utf-8",
  "x-content-type-options": "nosniff",
  // The drawing needs nothing external; nothing in it may run or load.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  ...CORS,
};

/** A strong validator for one drawing: the compiler that drew it and the plan it drew. */
async function etagOf(renderVersion: string, payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${renderVersion}\n${payload}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `"${hex.slice(0, 32)}"`;
}

/**
 * RFC 9110 §13.1.2: `If-None-Match` uses the WEAK comparison and may be a list or `*`. An edge
 * that recompresses turns a strong tag weak (`W/"…"`), and the 304 must still fire.
 */
export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const opaque = (t: string) => t.trim().replace(/^W\//, "");
  if (header.trim() === "*") return true;
  return header.split(",").some((t) => opaque(t) === opaque(etag));
}

/** Whether a path segment's `%` escapes decode (a malformed one, `%E0%A4%A`, would throw). */
function wellFormedSegment(segment: string): boolean {
  try {
    decodeURIComponent(segment);
    return true;
  } catch {
    return false;
  }
}

/** The two image paths, parsed: the payload, and the render version a pinned path names. */
export function parseSvgPath(pathname: string): { payload: string; pinned?: string } | undefined {
  const pin = /^\/v\/([^/]+)\/svg\/(.*)$/.exec(pathname);
  const raw = pin ? pin[2]! : pathname.startsWith("/svg/") ? pathname.slice("/svg/".length) : undefined;
  if (raw === undefined) return undefined;
  const payload = raw.endsWith(".svg") ? raw.slice(0, -".svg".length) : raw;
  // The raw segment is compared with the encoded render version: decoding a malformed escape
  // (`%E0%A4%A`) would throw, and a user's URL must never become a 500.
  return pin ? { payload, pinned: pin[1]! } : { payload };
}

async function handleSvg(
  req: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  assets: HostedAssets,
  path: { payload: string; pinned?: string },
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD")
    return jsonResponse({ ok: false, error: "use GET" }, 405, { allow: "GET, HEAD" });
  const head = req.method === "HEAD";
  const bodyless = (res: Response) => (head ? new Response(null, res) : res);
  const { payload, pinned } = path;
  const rv = assets.renderVersion;

  // A pinned URL from an older compiler: those bytes are no longer drawn here, so send the reader
  // to the unpinned URL, briefly cacheable, rather than present new bytes under an old pin.
  // A pin segment that is not even a well-formed escape names no render version at all.
  if (pinned !== undefined && !wellFormedSegment(pinned))
    return jsonResponse({ ok: false, error: "not a render version: /v/<render version>/svg/<payload>" }, 404);
  if (pinned !== undefined && pinned !== encodeURIComponent(rv))
    return new Response(null, {
      status: 302,
      headers: { location: `/svg/${payload}`, "cache-control": "public, max-age=300", ...CORS },
    });

  const oversize = inputTooLarge(payload.length, MCP_PAYLOAD_CAP_CHARS, "payload");
  if (oversize) {
    countRefusal(env, "too-large payload");
    return jsonResponse(envelope(oversize), 413);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(payload))
    return jsonResponse({ ok: false, error: "not a #z= payload: expected base64url after /svg/" }, 400);

  const pinnedPath = `/v/${encodeURIComponent(rv)}/svg/${payload}`;
  const etag = await etagOf(rv, payload);
  const headers = {
    ...SVG_BASE,
    "cache-control": pinned === undefined ? FRESH : IMMUTABLE,
    etag,
    ...(pinned === undefined ? { "content-location": pinnedPath } : {}),
  };
  if (matchesIfNoneMatch(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });

  // The edge-cache key is the PINNED path, whichever route asked: a new compiler is a new key, so
  // a deploy can never serve a drawing the previous compiler made.
  const key = new Request(new URL(pinnedPath, url.origin).toString(), { method: "GET" });
  const cache = typeof caches !== "undefined" ? caches.default : undefined;
  const hit = await cache?.match(key);
  if (hit) return bodyless(new Response(hit.body, { status: 200, headers }));

  // A miss compiles: that is what the per-address limit meters.
  if (!(await allowed(env.RATE_SVG, req))) {
    countRefusal(env, "rate-limited /svg/");
    const d = rateLimited("/svg/", SVG_PER_PERIOD, RATE_PERIOD_SECONDS);
    return jsonResponse(envelope(d), 429, { "retry-after": String(RATE_PERIOD_SECONDS) });
  }

  const decoded = await decodePlanHashWeb(payload, { maxBytes: SOURCE_CAP_BYTES });
  if (decoded === "source_too_large") {
    countRefusal(env, "too-large payload");
    return jsonResponse(envelope(inputTooLarge(SOURCE_CAP_BYTES + 1, SOURCE_CAP_BYTES, "source", false)!), 413);
  }
  if (decoded === "bad_payload")
    return jsonResponse({ ok: false, error: "not a #z= payload: it does not inflate (deflate-raw)" }, 400);
  const source: string = decoded;

  const { svg, diagnostics } = compile(source, { noCache: true });
  if (diagnostics.some((d) => d.severity === "error"))
    return jsonResponse({ ok: false, diagnostics: diagnostics.map((d) => diagnosticToJson(source, d)) }, 422);

  // Stored under the pinned key with the pinned (immutable) lifetime; each route sets its own
  // headers on the way out.
  if (cache) ctx.waitUntil(cache.put(key, new Response(svg, { headers: { ...SVG_BASE, "cache-control": IMMUTABLE } })));
  return bodyless(new Response(svg, { status: 200, headers }));
}

// ---------------------------------------------------------------------------
// entry
// ---------------------------------------------------------------------------

/** The Worker, `{ fetch }`, over the given assets. */
export function makeWorker(assets: HostedAssets) {
  return {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      // Measurement only (scripts/measure-cpu.mjs against `wrangler dev --var MEASURE_CPU:1`): the
      // handler's elapsed time as a response header. Unset in wrangler.jsonc, so never deployed.
      if (env.MEASURE_CPU !== "1") return route(req, env, ctx, assets);
      const t0 = performance.now();
      const res = await route(req, env, ctx, assets);
      // Read the body inside the timed span: a streamed reply is still being produced until then.
      const body = await res.arrayBuffer();
      const ms = performance.now() - t0;
      const headers = new Headers(res.headers);
      headers.set("x-archlang-handler-ms", ms.toFixed(3));
      return new Response(req.method === "HEAD" || res.status === 304 ? null : body, { status: res.status, headers });
    },
  };
}

async function route(req: Request, env: Env, ctx: ExecutionContext, assets: HostedAssets): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname === "/mcp") return await handleMcp(req, env, url.origin, assets);
    const svg = parseSvgPath(url.pathname);
    if (svg) return await handleSvg(req, url, env, ctx, assets, svg);
    if (url.pathname === "/" && (req.method === "GET" || req.method === "HEAD"))
      return new Response(req.method === "HEAD" ? null : readMe(url.origin), {
        headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-cache", ...CORS },
      });
    if (url.pathname === OPENAI_CHALLENGE_PATH && (req.method === "GET" || req.method === "HEAD")) {
      const token = env.OPENAI_APPS_CHALLENGE;
      if (token)
        return new Response(req.method === "HEAD" ? null : token, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
    }
    return new Response("not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch {
    // A bug in this Worker, never a user's input (inputs get diagnostics). The error is not
    // logged: its message could quote a source.
    return jsonResponse({ ok: false, error: "internal error" }, 500);
  }
}
