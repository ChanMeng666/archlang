/**
 * `POST /api/event` (ruling RM-D86, card FW4): the closed list the Worker counts, and every refusal
 * writing nothing; and the one point the Worker writes itself, a contributed plan's, from
 * `POST /api/share` with `contribute: true` (ruling RM-D87, card FW5). Driven like
 * share-worker.test.ts: `fetch(Request, env)` on the handler, over an in-memory Analytics Engine,
 * KV store and rate limiter.
 */
import { webcrypto } from "node:crypto";
import { compile, diagnosticToJson, ERROR_CATALOG, inputTooLarge, rateLimited } from "archlang";
import { describe, expect, it } from "vitest";
import { encodePlanHash } from "../../src/cli/share-codec.mjs";
import { makeShareWorker } from "../worker/app.js";
import {
  COMPILE_OUTCOMES,
  contributionPoint,
  EVENT_BODY_CAP_BYTES,
  EVENT_NAMES,
  EVENT_PATH,
  eventCodes,
  eventPoint,
  EXPORT_FORMATS,
  MAX_EVENT_CODES,
  readEvent,
  SHARE_KINDS,
} from "../worker/event-core.js";
import { readShareBody } from "../worker/share-core.js";
import type { Env, ShareMeta } from "../worker/types.js";
import { supportsDeflateRaw } from "./helpers.js";

// Node 18 has no global `crypto` (the short-link id hashes with it); the Worker runtime has one.
(globalThis as { crypto?: unknown }).crypto ??= webcrypto;

const ORIGIN = "https://playground.archlang.uk";
const worker = makeShareWorker({ compile, diagnosticToJson, ERROR_CATALOG, inputTooLarge, rateLimited });
const isCode = (c: string) => Object.hasOwn(ERROR_CATALOG, c);
const CODES = Object.keys(ERROR_CATALOG).sort();
const E = CODES.find((c) => c.startsWith("E_"))!;
const W = CODES.find((c) => c.startsWith("W_"))!;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function fakeEnv(over: Partial<Env> = {}) {
  const points: { blobs?: string[]; indexes?: string[] }[] = [];
  const shared: { blobs?: string[]; indexes?: string[] }[] = [];
  const store = new Map<string, { value: string; metadata: ShareMeta | null }>();
  const env: Env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    EVENTS: { writeDataPoint: (p) => points.push(p) },
    SHARE_ANALYTICS: { writeDataPoint: (p) => shared.push(p) },
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
  return { env, points, shared, store };
}

const request = (
  path: string,
  body: unknown,
  init: { headers?: Record<string, string>; method?: string } = {},
): Request =>
  new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "POST",
    body: init.method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "cf-connecting-ip": "203.0.113.9",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...init.headers,
    },
  });

const send = (env: Env, body: unknown, init: { headers?: Record<string, string>; method?: string } = {}) =>
  worker.fetch(request(EVENT_PATH, body, init), env);

describe("POST /api/event: the closed list", () => {
  it("accepts each listed event with 204 and writes one point: name, word, codes, day", async () => {
    const cases: Array<[unknown, string[]]> = [
      [{ e: "compile", outcome: "error", codes: [W, E, E] }, ["compile", "error", [E, W].sort().join(";")]],
      [{ e: "compile", outcome: "ok" }, ["compile", "ok", ""]],
      [{ e: "export", fmt: "dxf" }, ["export", "dxf", ""]],
      [{ e: "view_3d" }, ["view_3d", "", ""]],
      [{ e: "share", fmt: "short" }, ["share", "short", ""]],
      [{ e: "fix_applied", codes: [E] }, ["fix_applied", "", E]],
    ];
    for (const [body, blobs] of cases) {
      const { env, points, shared } = fakeEnv();
      const res = await send(env, body);
      expect(res.status, JSON.stringify(body)).toBe(204);
      expect(await res.text()).toBe("");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(points).toHaveLength(1);
      expect(points[0]!.blobs!.slice(0, 3)).toEqual(blobs);
      expect(points[0]!.blobs![3]).toMatch(DAY);
      expect(points[0]!.indexes).toEqual([blobs[0]]);
      expect(shared).toEqual([]); // the share counter is not this one
    }
  });

  it("every format, kind and outcome the lists name is accepted, and nothing else", async () => {
    for (const fmt of EXPORT_FORMATS) expect(readEvent({ e: "export", fmt }, isCode)).toEqual({ e: "export", fmt });
    for (const fmt of SHARE_KINDS) expect(readEvent({ e: "share", fmt }, isCode)).toEqual({ e: "share", fmt });
    for (const outcome of COMPILE_OUTCOMES) expect(readEvent({ e: "compile", outcome }, isCode)).not.toBeNull();
    expect(EVENT_NAMES).toEqual(["compile", "export", "view_3d", "share", "fix_applied"]);
  });

  it("refuses anything else with 400 and writes nothing: `contribute` and any `id` among them", async () => {
    const bad: unknown[] = [
      "not json",
      "[]",
      "null",
      '"compile"',
      {},
      { e: "pageview" },
      { e: "compile" },
      { e: "compile", outcome: "maybe" },
      { e: "compile", outcome: "ok", source: 'plan "Mine" {}' },
      { e: "compile", outcome: "ok", codes: E },
      { e: "compile", outcome: "ok", codes: [E, 1] },
      { e: "compile", outcome: "ok", codes: Array.from({ length: MAX_EVENT_CODES + 1 }, () => E) },
      { e: "export", fmt: "exe" },
      { e: "export", fmt: "svg", codes: [E] },
      { e: "view_3d", label: "Kitchen" },
      { e: "share", fmt: "twitter" },
      // No page event carries an id, and a contribution is the Worker's to mark, never the page's.
      { e: "contribute", id: "AbCdEfGh12", codes: [W] },
      { e: "contribute" },
      { e: "fix_applied", codes: [E], id: "AbCdEfGh12" },
      { e: "share", fmt: "short", id: "AbCdEfGh12" },
      { e: "compile", outcome: "ok", id: "AbCdEfGh12" },
      { e: "view_3d", id: "AbCdEfGh12" },
      { e: "__proto__" },
      { e: "toString" },
    ];
    for (const body of bad) {
      const { env, points } = fakeEnv();
      const res = await send(env, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("bad_event");
      expect(points, JSON.stringify(body)).toEqual([]);
    }
  });

  it("drops a string the catalogue does not hold, however code-shaped; dedupes, sorts, caps", async () => {
    const { env, points } = fakeEnv();
    const res = await send(env, {
      e: "compile",
      outcome: "error",
      codes: ["E_NOT_A_CODE", "W_MY_HOUSE", E, "hello", E],
    });
    expect(res.status).toBe(204);
    expect(points[0]!.blobs![2]).toBe(E);
    const twenty = CODES.slice(0, MAX_EVENT_CODES).reverse();
    expect(eventCodes(twenty, isCode)).toEqual(CODES.slice(0, MAX_EVENT_CODES));
    expect(eventCodes([...CODES.slice(0, 30)], isCode)).toHaveLength(MAX_EVENT_CODES);
    expect(eventCodes(["e_parse", " E_PARSE", undefined], isCode)).toEqual([]);
  });

  it("caps the body: over EVENT_BODY_CAP_BYTES is 413, declared or streamed, and writes nothing", async () => {
    const { env, points } = fakeEnv();
    const big = JSON.stringify({ e: "view_3d", pad: "x".repeat(EVENT_BODY_CAP_BYTES) });
    expect((await send(env, big)).status).toBe(413);
    expect(
      (await send(env, '{"e":"view_3d"}', { headers: { "content-length": String(EVENT_BODY_CAP_BYTES + 1) } })).status,
    ).toBe(413);
    expect(points).toEqual([]);
  });

  it("refuses another site (403) and an address over its rate (429), writing nothing", async () => {
    const { env, points } = fakeEnv();
    expect((await send(env, { e: "view_3d" }, { headers: { origin: "https://elsewhere.example" } })).status).toBe(403);
    expect((await send(env, { e: "view_3d" }, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    const limited = fakeEnv({ RATE_EVENT: { limit: async () => ({ success: false }) } });
    const res = await send(limited.env, { e: "view_3d" });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect([...points, ...limited.points]).toEqual([]);
  });

  it("a request with Sec-GPC: 1 or DNT: 1 is answered 204 and writes nothing (the server's backstop)", async () => {
    for (const headers of [{ "sec-gpc": "1" }, { dnt: "1" }, { "sec-gpc": "1", dnt: "1" }] as Record<
      string,
      string
    >[]) {
      const { env, points } = fakeEnv();
      const res = await send(env, { e: "compile", outcome: "error", codes: [E] }, { headers });
      expect(res.status, JSON.stringify(headers)).toBe(204);
      expect(points, JSON.stringify(headers)).toEqual([]);
    }
    // Any other value of either header is no signal.
    const { env, points } = fakeEnv();
    expect((await send(env, { e: "view_3d" }, { headers: { "sec-gpc": "0", dnt: "0" } })).status).toBe(204);
    expect(points).toHaveLength(1);
  });

  it("the address is the limiter's key only: it reaches no point", async () => {
    const keys: string[] = [];
    const { env, points } = fakeEnv({
      RATE_EVENT: {
        limit: async ({ key }) => {
          keys.push(key);
          return { success: true };
        },
      },
    });
    await send(env, { e: "compile", outcome: "ok", codes: [W] });
    expect(keys).toEqual(["203.0.113.9"]);
    expect(JSON.stringify(points)).not.toContain("203.0.113.9");
  });

  it("only POST; no binding still answers 204; a failing dataset fails nothing", async () => {
    const { env } = fakeEnv();
    const get = await send(env, null, { method: "GET" });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect((await send(fakeEnv({ EVENTS: undefined }).env, { e: "view_3d" })).status).toBe(204);
    const down = fakeEnv({
      EVENTS: {
        writeDataPoint: () => {
          throw new Error("down");
        },
      },
    });
    expect((await send(down.env, { e: "view_3d" })).status).toBe(204);
  });

  it("the point: the word slot holds the outcome, format or link kind", () => {
    expect(eventPoint({ e: "view_3d" }, "2026-11-23")).toEqual({
      blobs: ["view_3d", "", "", "2026-11-23"],
      indexes: ["view_3d"],
    });
    expect(eventPoint({ e: "compile", outcome: "error", codes: [E, W] }, "2026-11-23").blobs).toEqual([
      "compile",
      "error",
      `${E};${W}`,
      "2026-11-23",
    ]);
    expect(contributionPoint("AbCdEfGh12", [E, W], "2026-11-23")).toEqual({
      blobs: ["contribute", "AbCdEfGh12", `${E};${W}`, "2026-11-23"],
      indexes: ["contribute"],
    });
  });
});

describe("readShareBody: a payload, or { z, contribute: true }", () => {
  it("reads both forms and refuses any other JSON", () => {
    expect(readShareBody("  abc_DEF-123 \n")).toEqual({ payload: "abc_DEF-123", contribute: false });
    expect(readShareBody('{"z":"abc","contribute":true}')).toEqual({ payload: "abc", contribute: true });
    expect(readShareBody('{"z":"abc"}')).toEqual({ payload: "abc", contribute: false });
    for (const bad of [
      "{",
      "{}",
      '{"z":1}',
      '{"z":"abc","contribute":false}',
      '{"z":"abc","contribute":"yes"}',
      '{"z":"abc","contribute":true,"id":"AbCdEfGh12"}',
      '{"z":"abc","contribute":true,"codes":["E_PARSE"]}',
      '{"z":"abc","contribute":true,"__proto__":{"id":"x"}}',
    ])
      expect(readShareBody(bad), bad).toBeNull();
    // Anything that does not start with `{` is read as a payload; the payload decoder refuses it.
    expect(readShareBody("[]")).toEqual({ payload: "[]", contribute: false });
  });
});

describe.skipIf(!supportsDeflateRaw)(
  "POST /api/share with contribute: the Worker marks it, with its own id and codes",
  () => {
    // A plan that parses (the store refuses one that does not) and raises a catalogued error.
    const ARC = 'plan "C" {\n  units mm\n  wall exterior thickness 150 { (0,0) arc (4000,0) radius 100 }\n}';
    const codesOf = (src: string) =>
      eventCodes(
        compile(src, { noCache: true }).diagnostics.map((d) => d.code),
        isCode,
      ).join(";");
    const share = (env: Env, body: string, headers: Record<string, string> = {}) =>
      worker.fetch(request("/api/share", body, { headers }), env);

    it("writes exactly one contribute point: the id it minted, the codes of its own compile, the day", async () => {
      const { env, points, shared, store } = fakeEnv();
      const res = await share(env, JSON.stringify({ z: encodePlanHash(ARC), contribute: true }));
      expect(res.status).toBe(200);
      const { id } = (await res.json()) as { id: string };
      expect(store.has(`s:${id}`)).toBe(true);
      expect(codesOf(ARC)).toContain("E_ARC_RADIUS");
      expect(points).toEqual([
        { blobs: ["contribute", id, codesOf(ARC), expect.stringMatching(DAY)], indexes: ["contribute"] },
      ]);
      expect(shared.map((p) => p.blobs!.slice(0, 2))).toEqual([["create", id]]); // counted as every link is
    });

    it("without contribute, a short link writes no contribute point (the plain body and { z } alike)", async () => {
      for (const body of [encodePlanHash(ARC), JSON.stringify({ z: encodePlanHash(ARC) })]) {
        const { env, points, shared } = fakeEnv();
        const res = await share(env, body);
        expect(res.status).toBe(200);
        expect(points).toEqual([]);
        expect(shared).toHaveLength(1);
      }
    });

    it("a client cannot choose the id or the codes: any extra key is refused, nothing stored or written", async () => {
      for (const extra of [{ id: "AbCdEfGh12" }, { codes: ["E_PARSE"] }, { e: "contribute" }]) {
        const { env, points, store } = fakeEnv();
        const res = await share(env, JSON.stringify({ z: encodePlanHash(ARC), contribute: true, ...extra }));
        expect(res.status, JSON.stringify(extra)).toBe(400);
        expect(store.size).toBe(0);
        expect(points).toEqual([]);
      }
    });

    it("is written whatever privacy signal the request carries: the user asked for it", async () => {
      const { env, points } = fakeEnv();
      const res = await share(env, JSON.stringify({ z: encodePlanHash(ARC), contribute: true }), {
        "sec-gpc": "1",
        dnt: "1",
      });
      expect(res.status).toBe(200);
      expect(points.map((p) => p.blobs![0])).toEqual(["contribute"]);
    });

    it("a plan the store refuses is neither stored nor marked", async () => {
      const { env, points, store } = fakeEnv();
      const res = await share(
        env,
        JSON.stringify({
          z: encodePlanHash('plan "X" {\n  units mm\n  romo at (0,0) size 4000x3000\n}'),
          contribute: true,
        }),
      );
      expect(res.status).toBe(422);
      expect(store.size).toBe(0);
      expect(points).toEqual([]);
    });
  },
);
