/**
 * The hosted MCP Worker, driven the way the platform drives it: `fetch(Request, env, ctx)` on the
 * handler (`src/app.ts`), with the assets the build would inline read from the repo instead. The
 * built bundle and `wrangler dev` are exercised by `scripts/smoke.mjs --site mcp`; this suite pins
 * the contract without a build.
 */
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodePlanHash } from "../../../src/cli/share-codec.mjs";
import { compile, ERROR_CATALOG } from "../../../src/index.js";
import { INSTRUCTIONS, RESOURCE_DEFS, TOOL_ANNOTATIONS } from "../../mcp/src/tools.js";
import { connect } from "../../mcp/test/helpers.js";
import { resourcePaths } from "../scripts/resource-paths.mjs";
import {
  FRESH,
  IMMUTABLE,
  KNOWN_TOOLS,
  MAX_ARGUMENT_DEPTH,
  makeWorker,
  OPENAI_CHALLENGE_PATH,
  oversizeArgument,
  tooDeep,
} from "../src/app.js";
import {
  BODY_CAP_BYTES,
  MCP_PER_PERIOD,
  PAYLOAD_CAP_CHARS,
  RATE_PERIOD_SECONDS,
  SOURCE_CAP_BYTES,
  SVG_PER_PERIOD,
} from "../src/limits.js";
import { PNG_HOSTED, VIEWER_URI } from "../src/server.js";

// Node 18 (a CI leg) has no global `crypto`, which the SDK's Web-standard transport calls
// (`crypto.randomUUID()`) and the /svg/ ETag hashes with. workerd and Node 20+ have it; give Node
// 18 the same object rather than skip the suite there.
if (!(globalThis as { crypto?: unknown }).crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const paths = resourcePaths(read("packages/mcp/src/server.ts"));
const resources = Object.fromEntries(Object.entries(paths).map(([n, rel]) => [n, read(rel)])) as never;
const VIEWER = "<!doctype html><title>viewer stub</title>";
const RV = "0.0.0-test";
const assetsFor = (renderVersion: string) => ({ resources, viewerHtml: VIEWER, version: "0.0.0-test", renderVersion });
const worker = makeWorker(assetsFor(RV));

const points: Array<{ blobs?: string[]; indexes?: string[]; doubles?: number[] }> = [];
const env = { ANALYTICS: { writeDataPoint: (p: (typeof points)[number]) => points.push(p) } };
const ctx = { waitUntil: () => {} };
const ORIGIN = "https://mcp.test";

const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let id = 0;
async function post(body: unknown, w = worker, e: Env = env): Promise<Response> {
  return w.fetch(
    new Request(`${ORIGIN}/mcp`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) }),
    e,
    ctx,
  );
}
async function rpc(method: string, params: unknown = {}): Promise<Record<string, any>> {
  const res = await post({ jsonrpc: "2.0", id: ++id, method, params });
  expect(res.status).toBe(200);
  const msg = (await res.json()) as Record<string, any>;
  expect(msg.error).toBeUndefined();
  return msg.result;
}
const toolText = (result: Record<string, any>) => JSON.parse(result.content.find((c: any) => c.type === "text").text);

const STUDIO = read("examples/studio.arch");
const TINY = 'plan "Smoke" {\n  room at (0,0) size 4000x3000 label "Room"\n}\n';

/** A rate limiter that has already been exhausted. */
const exhausted: RateLimit = { limit: async () => ({ success: false }) };

const HAS_DEFLATE_RAW = (() => {
  try {
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
})();

describe("hosted MCP over Streamable HTTP", () => {
  it("initialize carries the stdio server's instructions", async () => {
    const r = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t", version: "0" },
    });
    expect(r.serverInfo).toEqual({ name: "archlang", version: "0.0.0-test" });
    expect(r.instructions).toBe(INSTRUCTIONS);
  });

  it("lists the stdio tool set plus read_me — derived from the stdio server, not retyped", async () => {
    const stdio = (await (await connect()).listTools()).tools.map((t) => t.name);
    const hosted = (await rpc("tools/list")).tools.map((t: { name: string }) => t.name);
    expect(hosted).toEqual([...stdio, "read_me"]);
    // The telemetry allow-list is exactly the registered set.
    expect([...KNOWN_TOOLS].sort()).toEqual([...hosted].sort());
  });

  it("every hosted tool, read_me included, carries the stdio server's annotations", async () => {
    const stdio = new Map((await (await connect()).listTools()).tools.map((t) => [t.name, t.annotations]));
    for (const t of (await rpc("tools/list")).tools as Array<{ name: string; annotations?: unknown }>) {
      expect(t.annotations, t.name).toEqual(TOOL_ANNOTATIONS);
      if (t.name !== "read_me") expect(t.annotations, t.name).toEqual(stdio.get(t.name));
    }
  });

  it("compile links the viewer: on its definition and on every result", async () => {
    const def = (await rpc("tools/list")).tools.find((t: { name: string }) => t.name === "compile");
    expect(def._meta.ui.resourceUri).toBe(VIEWER_URI);
    const res = await rpc("tools/call", { name: "compile", arguments: { source: STUDIO } });
    expect(res._meta.ui.resourceUri).toBe(VIEWER_URI);
    expect(res._meta["ui/resourceUri"]).toBe(VIEWER_URI);
    // The text fallback every host gets is the stdio result, unchanged.
    expect(toolText(res)).toMatchObject({ ok: true, format: "svg", output: compile(STUDIO, { noCache: true }).svg });
  });

  it("serves every archlang:// resource byte-equal to the repo, and the viewer as an MCP App", async () => {
    const listed = (await rpc("resources/list")).resources.map((r: { uri: string; mimeType: string }) => [
      r.uri,
      r.mimeType,
    ]);
    expect(listed).toContainEqual([VIEWER_URI, "text/html;profile=mcp-app"]);
    for (const [name, uri] of RESOURCE_DEFS) {
      const c = (await rpc("resources/read", { uri })).contents[0];
      expect(c.text, uri).toBe(read(paths[name]!));
    }
    const v = (await rpc("resources/read", { uri: VIEWER_URI })).contents[0];
    expect(v).toMatchObject({ uri: VIEWER_URI, mimeType: "text/html;profile=mcp-app", text: VIEWER });
  });

  it("the build bundles exactly the stdio server's resource set", () => {
    expect(Object.keys(paths).sort()).toEqual(RESOURCE_DEFS.map(([n]) => n).sort());
  });

  it('format "png" is refused with E_PNG_DEPENDENCY and a Worker-specific fix, never an exception', async () => {
    const out = toolText(await rpc("tools/call", { name: "compile", arguments: { source: TINY, format: "png" } }));
    expect(out).toMatchObject({ ok: false, format: "png", code: "E_PNG_DEPENDENCY", error: PNG_HOSTED });
    // The catalogued code rides inside `diagnostics`, as on npm, but its `fix` is this host's own
    // sentence: the catalogue's says to install a renderer, which nothing can do in a Worker.
    const dep = out.diagnostics.find((d: { code: string }) => d.code === "E_PNG_DEPENDENCY");
    expect(dep).toEqual({ code: "E_PNG_DEPENDENCY", severity: "error", message: PNG_HOSTED, fix: PNG_HOSTED });
    expect(dep.fix).not.toBe(ERROR_CATALOG.E_PNG_DEPENDENCY!.fix);
    // One storey of a multi-storey plan is refused the same way, and the description says so up front.
    const two = toolText(
      await rpc("tools/call", {
        name: "compile",
        arguments: { source: read("examples/two-storey.arch"), format: "png", level: 1 },
      }),
    );
    expect(two).toMatchObject({ ok: false, code: "E_PNG_DEPENDENCY", error: PNG_HOSTED, level: 1 });
    const def = (await rpc("tools/list")).tools.find((t: { name: string }) => t.name === "compile");
    expect(def.description).toContain(PNG_HOSTED);
  });

  it("link mints the same URLs the CLI does (one encoder)", async () => {
    const out = toolText(await rpc("tools/call", { name: "link", arguments: { source: TINY } }));
    expect(out.embed).toBe(`https://playground.archlang.uk/embed.html#z=${encodePlanHash(TINY)}`);
  });

  it("read_me explains the server: its caps, its images, and what it keeps", async () => {
    const text = (await rpc("tools/call", { name: "read_me", arguments: {} })).content[0].text as string;
    expect(text).toContain(`${ORIGIN}/svg/`);
    expect(text).toContain("/v/<render version>/svg/<payload>");
    expect(text).toContain(`${SOURCE_CAP_BYTES / 1024} KB`);
    expect(text).toContain("E_INPUT_TOO_LARGE");
    expect(text).toContain("E_RATE_LIMITED");
    expect(text).toContain("stores only the rendered SVG");
    expect(text).not.toMatch(/stores nothing|never changes \(the URL is the plan/);
  });

  it("is stateless: GET and DELETE are 405, and no session id is issued", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await worker.fetch(new Request(`${ORIGIN}/mcp`, { method, headers: HEADERS }), env, ctx);
      expect(res.status, method).toBe(405);
    }
    const res = await post({ jsonrpc: "2.0", id: 99, method: "tools/list", params: {} });
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the input cap: a Diagnostic envelope before any compile work, never a 5xx", () => {
  const over = "x".repeat(SOURCE_CAP_BYTES + 1);

  it("a source one byte over the cap gets E_INPUT_TOO_LARGE as a tool result", async () => {
    const res = await rpc("tools/call", { name: "compile", arguments: { source: over } });
    expect(res.isError).toBe(true);
    const out = toolText(res);
    expect(out.ok).toBe(false);
    expect(out.diagnostics).toEqual([
      {
        code: "E_INPUT_TOO_LARGE",
        severity: "error",
        message: `source is ${SOURCE_CAP_BYTES + 1} bytes; this host accepts at most ${SOURCE_CAP_BYTES}`,
        fix: ERROR_CATALOG.E_INPUT_TOO_LARGE!.fix,
      },
    ]);
  });

  it("a source AT the cap is compiled (no refusal)", async () => {
    const at = `${TINY}${"#".repeat(SOURCE_CAP_BYTES - TINY.length)}`;
    expect(at.length).toBe(SOURCE_CAP_BYTES);
    const out = toolText(await rpc("tools/call", { name: "lint", arguments: { source: at } }));
    expect(out.diagnostics.map((d: { code: string }) => d.code)).not.toContain("E_INPUT_TOO_LARGE");
  });

  it("every tool taking a source is capped, and plan_json too", async () => {
    for (const name of ["describe", "lint", "validate", "repair", "fix", "finish", "suggest", "link"]) {
      const out = toolText(await rpc("tools/call", { name, arguments: { source: over } }));
      expect(out.diagnostics[0].code, name).toBe("E_INPUT_TOO_LARGE");
    }
    const big = { rooms: [{ name: "x".repeat(SOURCE_CAP_BYTES) }] };
    const out = toolText(await rpc("tools/call", { name: "compile", arguments: { plan_json: big } }));
    expect(out.diagnostics[0]).toMatchObject({ code: "E_INPUT_TOO_LARGE" });
    expect(out.diagnostics[0].message).toMatch(/^plan_json is /);
  });

  it("every other argument is capped by the same rule: intent, brief, graph, profile", async () => {
    const bigObject = { rooms: Array.from({ length: 3000 }, (_, i) => ({ name: `room-${i}`, min_m2: 12 })) };
    expect(JSON.stringify(bigObject).length).toBeGreaterThan(SOURCE_CAP_BYTES);
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["validate", { source: TINY, intent: bigObject }, "intent"],
      ["score", { source: TINY, brief: bigObject }, "brief"],
      ["validate", { source: TINY, graph: { a: Array.from({ length: 20000 }, (_, i) => `n${i}`) } }, "graph"],
      ["lint", { source: TINY, profile: over }, "profile"],
    ];
    for (const [name, args, arg] of cases) {
      const out = toolText(await rpc("tools/call", { name, arguments: args }));
      expect(out.diagnostics[0].code, `${name}.${arg}`).toBe("E_INPUT_TOO_LARGE");
      expect(out.diagnostics[0].message, `${name}.${arg}`).toMatch(new RegExp(`^${arg} is `));
    }
  });

  it("a body over the body cap is a 413 carrying the same diagnostic", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "compile", arguments: { source: "\u0001".repeat(BODY_CAP_BYTES / 5) } },
    });
    expect(res.status).toBe(413);
    const msg = (await res.json()) as Record<string, any>;
    expect(msg.error.data.diagnostics[0].code).toBe("E_INPUT_TOO_LARGE");
    expect(msg.error.data.diagnostics[0].message).toMatch(
      /^request body is (more than )?\d+ bytes; this host accepts at most 262144$/,
    );
  });

  it("an over-cap call sent as a notification (no id) is 202 with no body", async () => {
    const res = await post({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "lint", arguments: { source: over } },
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it(`the depth boundary: ${MAX_ARGUMENT_DEPTH} levels pass, ${MAX_ARGUMENT_DEPTH + 1} are refused`, () => {
    /** `d` nested arrays: `[[…]]` with `d` brackets, depth `d` (the outermost is level 1). */
    const nested = (d: number): unknown => JSON.parse(`${"[".repeat(d)}${"]".repeat(d)}`);
    expect(MAX_ARGUMENT_DEPTH).toBe(64);
    expect(tooDeep(nested(64), 64)).toBe(false);
    expect(tooDeep(nested(65), 64)).toBe(true);
    // Objects count the same as arrays, and a scalar is depth 0.
    expect(tooDeep({ a: { b: nested(62) } }, 64)).toBe(false);
    expect(tooDeep({ a: { b: nested(63) } }, 64)).toBe(true);
    expect(tooDeep("x", 64)).toBe(false);
    const call = (intent: unknown) => ({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "validate", arguments: { source: TINY, intent } },
    });
    expect(oversizeArgument(call(nested(64)))).toBeUndefined();
    expect(oversizeArgument(call(nested(65)))).toMatchObject({
      code: "E_INPUT_TOO_LARGE",
      message: "intent is nested more than 64 levels deep; this host accepts at most 64",
    });
  });

  it("a deeply nested argument is refused as too large, never a stack overflow (500)", async () => {
    const deep = `${"[".repeat(120000)}${"]".repeat(120000)}`;
    const body = `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"validate","arguments":{"source":${JSON.stringify(TINY)},"intent":${deep}}}}`;
    expect(body.length).toBeLessThan(BODY_CAP_BYTES);
    const res = await worker.fetch(new Request(`${ORIGIN}/mcp`, { method: "POST", headers: HEADERS, body }), env, ctx);
    expect(res.status).toBe(200);
    const out = toolText(((await res.json()) as Record<string, any>).result);
    expect(out.diagnostics[0]).toMatchObject({ code: "E_INPUT_TOO_LARGE" });
    expect(out.diagnostics[0].message).toMatch(/^intent is nested more than 64 levels deep/);
    // A legitimate argument a few levels deep is untouched.
    const ok = toolText(
      await rpc("tools/call", { name: "validate", arguments: { source: TINY, graph: { a: ["b"], b: ["a"] } } }),
    );
    expect(ok.diagnostics.map((d: { code: string }) => d.code)).not.toContain("E_INPUT_TOO_LARGE");
  });

  it("malformed JSON is a JSON-RPC parse error, not a 5xx", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/mcp`, { method: "POST", headers: HEADERS, body: "{" }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, any>).error.code).toBe(-32700);
  });
});

describe("the rate limit: E_RATE_LIMITED as data, before any work", () => {
  it("an address over its /mcp rate gets 429 with the diagnostic and Retry-After", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, worker, {
      RATE_MCP: exhausted,
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(RATE_PERIOD_SECONDS));
    const msg = (await res.json()) as Record<string, any>;
    expect(msg.error.data.diagnostics).toEqual([
      {
        code: "E_RATE_LIMITED",
        severity: "error",
        message: `too many /mcp requests from this address: this host answers at most ${MCP_PER_PERIOD} every ${RATE_PERIOD_SECONDS} s`,
        fix: ERROR_CATALOG.E_RATE_LIMITED!.fix,
      },
    ]);
  });

  it("keys the limiter on CF-Connecting-IP, and a limiter fault lets the request through", async () => {
    const keys: string[] = [];
    const recording: RateLimit = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };
    await worker.fetch(
      new Request(`${ORIGIN}/mcp`, {
        method: "POST",
        headers: { ...HEADERS, "cf-connecting-ip": "203.0.113.7" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} }),
      }),
      { RATE_MCP: recording },
      ctx,
    );
    expect(keys).toEqual(["203.0.113.7"]);
    const broken: RateLimit = {
      limit: async () => {
        throw new Error("binding down");
      },
    };
    const res = await post({ jsonrpc: "2.0", id: 2, method: "ping", params: {} }, worker, { RATE_MCP: broken });
    expect(res.status).toBe(200);
  });
});

describe("telemetry: one data point per MCP message, method and tool name from fixed lists", () => {
  it("records [method, tool] and nothing from the arguments", async () => {
    points.length = 0;
    await rpc("tools/call", { name: "lint", arguments: { source: TINY } });
    expect(points).toEqual([{ blobs: ["tools/call", "lint"], indexes: ["tools/call"] }]);
  });

  it("a client-chosen name is bucketed unless it is a real tool or method, however name-shaped", async () => {
    points.length = 0;
    await post({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: 'plan "Secret" {', arguments: {} } });
    await post({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "bobs_floorplan", arguments: {} } });
    await post({ jsonrpc: "2.0", id: 7, method: "acmesecretproject", params: {} });
    expect(points).toEqual([
      { blobs: ["tools/call", "(other)"], indexes: ["tools/call"] },
      { blobs: ["tools/call", "(other)"], indexes: ["tools/call"] },
      { blobs: ["(other)", ""], indexes: ["(other)"] },
    ]);
  });

  it("a refusal writes one `refused` point with its reason, instead of the call's own", async () => {
    points.length = 0;
    await post({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "lint", arguments: { source: "x".repeat(SOURCE_CAP_BYTES + 1) } },
    });
    await post({ jsonrpc: "2.0", id: 9, method: "ping", params: {} }, worker, { ...env, RATE_MCP: exhausted });
    expect(points).toEqual([
      { blobs: ["refused", "too-large argument"], indexes: ["refused"] },
      { blobs: ["refused", "rate-limited /mcp"], indexes: ["refused"] },
    ]);
  });

  it("each other refusal site writes its own reason: body, /svg/ rate, both /svg/ payload checks", async () => {
    // The body cap (no deflate needed).
    points.length = 0;
    await post({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: { name: "compile", arguments: { source: "\u0001".repeat(BODY_CAP_BYTES / 5) } },
    });
    expect(points).toEqual([{ blobs: ["refused", "too-large body"], indexes: ["refused"] }]);
    // The /svg/ payload LENGTH check runs before any decode, so it needs no deflate-raw either.
    points.length = 0;
    await worker.fetch(new Request(`${ORIGIN}/svg/${"A".repeat(PAYLOAD_CAP_CHARS + 1)}`), env, ctx);
    expect(points).toEqual([{ blobs: ["refused", "too-large payload"], indexes: ["refused"] }]);
  });

  it("runs without the bindings (local dev)", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, worker, {});
    expect(res.status).toBe(200);
  });
});

/** A Cache API stand-in (`caches.default`) that records what it was given. */
function memoryCaches() {
  const store = new Map<string, Response>();
  const cache = {
    store,
    async match(req: Request) {
      return store.get(req.url)?.clone();
    },
    async put(req: Request, res: Response) {
      store.set(req.url, res);
    },
  };
  return { default: cache };
}

describe.skipIf(!HAS_DEFLATE_RAW)("GET /svg/<payload> and the pinned /v/<render version>/svg/<payload>", () => {
  const get = (path: string, init: RequestInit = {}, w = worker, e: Env = env) =>
    w.fetch(new Request(`${ORIGIN}${path}`, init), e, ctx);
  const P = encodePlanHash(STUDIO);
  const SVG = compile(STUDIO, { noCache: true }).svg;

  it("/svg/ answers compile()'s SVG, fresh for five minutes, with an ETag and the pinned path", async () => {
    const res = await get(`/svg/${P}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(FRESH);
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(res.headers.get("content-location")).toBe(`/v/${RV}/svg/${P}`);
    expect(await res.text()).toBe(SVG);
    // A trailing `.svg` names the same image; HEAD has headers and no body.
    expect(await (await get(`/svg/${P}.svg`)).text()).toBe(SVG);
    const head = await get(`/svg/${P}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
  });

  it("the pinned path is the only immutable one, with the same bytes and the same ETag", async () => {
    const loose = await get(`/svg/${P}`);
    const pinned = await get(`/v/${RV}/svg/${P}`);
    expect(pinned.status).toBe(200);
    expect(pinned.headers.get("cache-control")).toBe(IMMUTABLE);
    expect(pinned.headers.get("content-location")).toBeNull();
    expect(pinned.headers.get("etag")).toBe(loose.headers.get("etag"));
    expect(await pinned.text()).toBe(SVG);
  });

  it("the ETag names the compiler: another render version, another validator", async () => {
    const a = (await get(`/svg/${P}`)).headers.get("etag");
    const b = (await get(`/svg/${P}`, {}, makeWorker(assetsFor("9.9.9-ffffffff")))).headers.get("etag");
    expect(a).not.toBe(b);
  });

  it("If-None-Match with the current ETag is 304 with no body", async () => {
    const etag = (await get(`/svg/${P}`)).headers.get("etag")!;
    const res = await get(`/svg/${P}`, { headers: { "if-none-match": etag } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("a pin from another compiler redirects to the unpinned URL instead of serving new bytes under it", async () => {
    const res = await get(`/v/1.0.0-00000000/svg/${P}`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/svg/${P}`);
    expect(res.headers.get("cache-control")).not.toMatch(/immutable/);
  });

  it("the edge cache is keyed by render version: a new compiler never reads the old one's drawing", async () => {
    const mem = memoryCaches();
    const g = globalThis as { caches?: unknown };
    const before = g.caches;
    g.caches = mem;
    const waits: Promise<unknown>[] = [];
    const waitCtx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
    try {
      const old = makeWorker(assetsFor("1.0.0-aaaaaaaa"));
      const now = makeWorker(assetsFor("1.0.1-bbbbbbbb"));
      await old.fetch(new Request(`${ORIGIN}/svg/${P}`), env, waitCtx);
      await Promise.all(waits);
      expect([...mem.default.store.keys()]).toEqual([`${ORIGIN}/v/1.0.0-aaaaaaaa/svg/${P}`]);
      // Pretend the old compiler drew something else: the old Worker serves its cached copy...
      mem.default.store.set(`${ORIGIN}/v/1.0.0-aaaaaaaa/svg/${P}`, new Response("OLD DRAWING"));
      expect(await (await old.fetch(new Request(`${ORIGIN}/svg/${P}`), env, waitCtx)).text()).toBe("OLD DRAWING");
      // ...and the new one, sharing the same cache, never sees it.
      expect(await (await now.fetch(new Request(`${ORIGIN}/svg/${P}`), env, waitCtx)).text()).toBe(SVG);
    } finally {
      g.caches = before;
    }
  });

  it("a cache miss over the address's /svg/ rate is 429 E_RATE_LIMITED", async () => {
    const res = await get(`/svg/${P}`, {}, worker, { RATE_SVG: exhausted });
    expect(res.status).toBe(429);
    const out = (await res.json()) as Record<string, any>;
    expect(out.diagnostics[0]).toMatchObject({
      code: "E_RATE_LIMITED",
      message: `too many /svg/ requests from this address: this host answers at most ${SVG_PER_PERIOD} every ${RATE_PERIOD_SECONDS} s`,
    });
  });

  it("a plan that does not compile is 422 with its diagnostics, not an image", async () => {
    const res = await get(`/svg/${encodePlanHash('plan "Bad" { room at (0,0) size 0x0 }')}`);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });

  it("a payload that inflates past the cap is 413 E_INPUT_TOO_LARGE, inflated no further", async () => {
    const res = await get(`/svg/${encodePlanHash("#".repeat(SOURCE_CAP_BYTES * 20))}`);
    expect(res.status).toBe(413);
    expect(((await res.json()) as Record<string, any>).diagnostics[0]).toMatchObject({
      code: "E_INPUT_TOO_LARGE",
      message: `source is more than ${SOURCE_CAP_BYTES} bytes; this host accepts at most ${SOURCE_CAP_BYTES}`,
    });
  });

  it("If-None-Match uses the weak comparison: W/ tags, lists and * all give 304", async () => {
    const etag = (await get(`/svg/${P}`)).headers.get("etag")!;
    for (const inm of [`W/${etag}`, `"zzz", ${etag}`, `"zzz",W/${etag}`, "*"]) {
      const res = await get(`/svg/${P}`, { headers: { "if-none-match": inm } });
      expect(res.status, inm).toBe(304);
    }
    expect((await get(`/svg/${P}`, { headers: { "if-none-match": '"zzz"' } })).status).toBe(200);
  });

  it("a malformed pin is a 404 with a JSON reason, never a 500", async () => {
    const res = await get(`/v/%E0%A4%A/svg/${P}`);
    expect(res.status).toBe(404);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });

  it("the /svg/ refusals that need a decode write their reasons too: rate, inflate cap", async () => {
    points.length = 0;
    await get(`/svg/${P}`, {}, worker, { ...env, RATE_SVG: exhausted });
    await get(`/svg/${encodePlanHash("#".repeat(SOURCE_CAP_BYTES * 20))}`);
    expect(points).toEqual([
      { blobs: ["refused", "rate-limited /svg/"], indexes: ["refused"] },
      { blobs: ["refused", "too-large payload"], indexes: ["refused"] },
    ]);
  });

  it("garbage is 400", async () => {
    expect((await get("/svg/not!base64")).status).toBe(400);
    expect((await get("/svg/AAAA")).status).toBe(400);
  });
});

describe("GET /.well-known/openai-apps-challenge (OpenAI domain verification)", () => {
  const TOKEN = "challenge-token-for-test";
  const get = (e: Env, method = "GET") =>
    worker.fetch(new Request(`${ORIGIN}${OPENAI_CHALLENGE_PATH}`, { method }), e, ctx);

  it("answers the configured token, exactly, as text/plain, and records nothing", async () => {
    expect(OPENAI_CHALLENGE_PATH).toBe("/.well-known/openai-apps-challenge");
    points.length = 0;
    const res = await get({ ...env, OPENAI_APPS_CHALLENGE: TOKEN });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(TOKEN);
    const head = await get({ ...env, OPENAI_APPS_CHALLENGE: TOKEN }, "HEAD");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(points).toEqual([]);
  });

  it("is a 404 while the token is unset or empty, and for any other method", async () => {
    for (const e of [env, { ...env, OPENAI_APPS_CHALLENGE: "" }]) {
      const res = await get(e);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("not found\n");
    }
    expect((await get({ ...env, OPENAI_APPS_CHALLENGE: TOKEN }, "POST")).status).toBe(404);
  });
});

describe("configuration laws", () => {
  /** wrangler.jsonc as data: `//` line comments removed (none of these files puts `//` in a string). */
  const jsonc = (rel: string) => JSON.parse(read(rel).replace(/^\s*\/\/.*$/gm, ""));
  const w = jsonc("packages/mcp-worker/wrangler.jsonc");

  it("the docs Worker keeps NO script (ADR 0019); the playground's runs only for its run_worker_first paths (ADR 0034)", () => {
    expect(jsonc("docs-site/wrangler.jsonc").main).toBeUndefined();
    // A site script is allowed only behind an explicit route list, never `true` (which would run
    // it, metered, for every request); playground/test/share-worker.test.ts pins the rest.
    const playground = jsonc("playground/wrangler.jsonc");
    expect(playground.main).toBe("worker/index.ts");
    expect(playground.assets.run_worker_first).toEqual(["/s/*", "/api/*"]);
    expect(w.main).toBe("dist/worker.js");
  });

  it("carries no account id and no route: DNS and the custom domain are the owner's", () => {
    expect(w.account_id).toBeUndefined();
    expect(w.routes).toBeUndefined();
    expect(w.route).toBeUndefined();
    expect(w.workers_dev).toBe(true);
    expect(w.observability).toEqual({ enabled: false });
  });

  it("declares one plain var, the OpenAI domain-verification token (a public string, never a secret)", () => {
    expect(Object.keys(w.vars)).toEqual(["OPENAI_APPS_CHALLENGE"]);
    expect(typeof w.vars.OPENAI_APPS_CHALLENGE).toBe("string");
  });

  it("bounds spend: a CPU limit per request, and the rate limiters at the numbers the code states", () => {
    expect(w.limits.cpu_ms).toBeGreaterThan(0);
    expect(w.limits.cpu_ms).toBeLessThanOrEqual(30000);
    const byName = Object.fromEntries(
      (w.ratelimits as Array<{ name: string; simple: { limit: number; period: number } }>).map((r) => [
        r.name,
        r.simple,
      ]),
    );
    expect(byName).toEqual({
      RATE_MCP: { limit: MCP_PER_PERIOD, period: RATE_PERIOD_SECONDS },
      RATE_SVG: { limit: SVG_PER_PERIOD, period: RATE_PERIOD_SECONDS },
    });
  });
});
