/**
 * `POST /api/event` (ruling RM-D86, card FW4): the closed list the Worker counts, and every refusal
 * writing nothing. Driven like share-worker.test.ts: `fetch(Request, env)` on the handler, over an
 * in-memory Analytics Engine and rate limiter.
 */
import { compile, diagnosticToJson, ERROR_CATALOG, inputTooLarge, rateLimited } from "archlang";
import { describe, expect, it } from "vitest";
import { makeShareWorker } from "../worker/app.js";
import {
  COMPILE_OUTCOMES,
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
import type { Env } from "../worker/types.js";

const ORIGIN = "https://playground.archlang.uk";
const worker = makeShareWorker({ compile, diagnosticToJson, ERROR_CATALOG, inputTooLarge, rateLimited });
const isCode = (c: string) => Object.hasOwn(ERROR_CATALOG, c);
const CODES = Object.keys(ERROR_CATALOG).sort();
const E = CODES.find((c) => c.startsWith("E_"))!;
const W = CODES.find((c) => c.startsWith("W_"))!;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function fakeEnv(over: Partial<Env> = {}) {
  const points: { blobs?: string[]; indexes?: string[] }[] = [];
  const shared: unknown[] = [];
  const env: Env = {
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) },
    EVENTS: { writeDataPoint: (p) => points.push(p) },
    SHARE_ANALYTICS: { writeDataPoint: (p) => shared.push(p) },
    ...over,
  };
  return { env, points, shared };
}

const send = (env: Env, body: unknown, init: { headers?: Record<string, string>; method?: string } = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}${EVENT_PATH}`, {
      method: init.method ?? "POST",
      body: init.method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        "cf-connecting-ip": "203.0.113.9",
        origin: ORIGIN,
        "sec-fetch-site": "same-origin",
        ...init.headers,
      },
    }),
    env,
  );

describe("POST /api/event: the closed list", () => {
  it("accepts each listed event with 204 and writes one point: name, word, codes, day", async () => {
    const cases: Array<[unknown, string[]]> = [
      [{ e: "compile", outcome: "error", codes: [W, E, E] }, ["compile", "error", [E, W].sort().join(";")]],
      [{ e: "compile", outcome: "ok" }, ["compile", "ok", ""]],
      [{ e: "export", fmt: "dxf" }, ["export", "dxf", ""]],
      [{ e: "view_3d" }, ["view_3d", "", ""]],
      [{ e: "share", fmt: "short" }, ["share", "short", ""]],
      [{ e: "fix_applied", codes: [E] }, ["fix_applied", "", E]],
      [{ e: "contribute", id: "AbCdEfGh12", codes: [W] }, ["contribute", "AbCdEfGh12", W]],
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
    expect(EVENT_NAMES).toEqual(["compile", "export", "view_3d", "share", "fix_applied", "contribute"]);
  });

  it("refuses anything else with 400 and writes nothing", async () => {
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
      { e: "fix_applied", codes: [E], id: "AbCdEfGh12" },
      { e: "contribute", codes: [E] },
      { e: "contribute", id: "x", codes: [E] },
      { e: "contribute", id: "../../etc", codes: [] },
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

  it("the point: the word slot holds the outcome, format or link kind, or a contribution's id", () => {
    expect(eventPoint({ e: "view_3d" }, "2026-11-23")).toEqual({
      blobs: ["view_3d", "", "", "2026-11-23"],
      indexes: ["view_3d"],
    });
    expect(eventPoint({ e: "contribute", id: "AbCdEfGh12", codes: [E, W] }, "2026-11-23").blobs).toEqual([
      "contribute",
      "AbCdEfGh12",
      `${E};${W}`,
      "2026-11-23",
    ]);
  });
});
