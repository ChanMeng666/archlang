/**
 * The hosted `POST /check` (card CR10), driven as the platform drives it: `fetch(Request, env, ctx)`
 * on the handler (`src/app.ts`). It must answer what `arch lint --json` prints for the same input,
 * byte for byte, over every plan of the public check set (`test/check-set/`), and refuse a bad or
 * oversized request, or an address over its rate, as data before any lint work.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG, LINT_PROFILE_NAMES } from "../../../src/index.js";
import { loadCases } from "../../../test/check-set/run.mjs";
import { runArch } from "../../../test/helpers/cli.js";
import { checkRequest, makeWorker } from "../src/app.js";
import { BODY_CAP_BYTES, CHECK_PER_PERIOD, RATE_PERIOD_SECONDS, SOURCE_CAP_BYTES } from "../src/limits.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
// `/check` reads no resource and no viewer; the assets only have to exist.
const worker = makeWorker({
  resources: {} as never,
  viewerHtml: "",
  version: "0.0.0-test",
  renderVersion: "0.0.0-test",
});
const points: Array<{ blobs?: string[]; indexes?: string[] }> = [];
const env = { ANALYTICS: { writeDataPoint: (p: (typeof points)[number]) => points.push(p) } };
const ctx = { waitUntil: () => {} };
const URL_ = "https://mcp.test/check";
const exhausted: RateLimit = { limit: async () => ({ success: false }) };

const TINY = 'plan "Smoke" {\n  room at (0,0) size 4000x3000 label "Room"\n}\n';

function check(body: BodyInit, headers: Record<string, string> = {}, query = "", e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`${URL_}${query}`, { method: "POST", headers, body }), e, ctx);
}
const checkJson = (body: unknown, e: Env = env) =>
  check(JSON.stringify(body), { "content-type": "application/json" }, "", e);

async function cliStdout(file: string, profile: string | null, strict = false): Promise<string> {
  const args = ["lint", file, "--json", ...(profile ? ["--profile", profile] : []), ...(strict ? ["--strict"] : [])];
  return (await runArch(args)).stdout;
}

describe("POST /check answers what `arch lint --json` prints", () => {
  it("on every plan and twin of the public check set, under its profile", async () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      for (const file of [c.planPath, c.twinPath]) {
        const source = readFileSync(file, "utf8");
        const res = await checkJson(c.profile ? { source, profile: c.profile } : { source });
        expect(res.status, file).toBe(200);
        expect(`${await res.text()}\n`, file).toBe(await cliStdout(file, c.profile));
      }
    }
  }, 60_000);

  it("with --strict, and as a plain body with the options in the query", async () => {
    const file = join(REPO, "examples", "two-bed.arch");
    const source = readFileSync(file, "utf8");
    const profile = "uk-residential-advisory";
    const want = await cliStdout(file, profile, true);
    const viaJson = await checkJson({ source, profile, strict: true });
    expect(`${await viaJson.text()}\n`).toBe(want);
    const plain = await check(source, { "content-type": "text/plain" }, `?profile=${profile}&strict=1`);
    expect(`${await plain.text()}\n`).toBe(want);
    expect(plain.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(plain.headers.get("access-control-allow-origin")).toBe("*");
    expect(plain.headers.get("cache-control")).toBe("no-store");
  });

  it("a plan that does not compile is still a 200 whose report is not ok", async () => {
    const res = await checkJson({ source: 'plan "Broken" {\n  room at (0,0 size 4000x3000\n}\n' });
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { ok: boolean; diagnostics: Array<{ code: string }> };
    expect(doc.ok).toBe(false);
    expect(doc.diagnostics.map((d) => d.code)).toEqual(["E_PARSE"]);
  });
});

describe("POST /check refuses as data, before any lint work", () => {
  it("answers OPTIONS for CORS and refuses another method", async () => {
    const pre = await worker.fetch(new Request(URL_, { method: "OPTIONS" }), env, ctx);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("POST");
    const get = await worker.fetch(new Request(URL_), env, ctx);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("a malformed request is a 400 naming what is wrong", async () => {
    const bad = async (res: Promise<Response>) => {
      const r = await res;
      expect(r.status).toBe(400);
      return ((await r.json()) as { ok: boolean; error: string }).error;
    };
    expect(await bad(check("{", { "content-type": "application/json" }))).toMatch(/^not JSON/);
    expect(await bad(checkJson([TINY]))).toMatch(/must be an object/);
    expect(await bad(checkJson({ plan: TINY }))).toBe("source must be a string");
    expect(await bad(checkJson({ source: TINY, strict: "yes" }))).toBe("strict must be true or false");
    expect(await bad(check(TINY, {}, "?strict=maybe"))).toBe("strict must be true or false");
    expect(await bad(checkJson({ source: TINY, profile: "mars-residential" }))).toBe(
      `unknown lint profile "mars-residential" (available: ${LINT_PROFILE_NAMES.join(", ")})`,
    );
    expect(await bad(checkJson({ source: TINY, profile: "x".repeat(500) }))).toContain(`"${"x".repeat(64)}"`);
  });

  it("a source or a body over its cap is 413 E_INPUT_TOO_LARGE", async () => {
    const big = await checkJson({ source: "x".repeat(SOURCE_CAP_BYTES + 1) });
    expect(big.status).toBe(413);
    const d = ((await big.json()) as { diagnostics: Array<{ code: string }> }).diagnostics;
    expect(d.map((x) => x.code)).toEqual(["E_INPUT_TOO_LARGE"]);
    const body = await check("x".repeat(BODY_CAP_BYTES + 1));
    expect(body.status).toBe(413);
    expect(((await body.json()) as { diagnostics: Array<{ code: string }> }).diagnostics[0]!.code).toBe(
      "E_INPUT_TOO_LARGE",
    );
  });

  it("an address over its /check rate gets 429 with the diagnostic and Retry-After", async () => {
    const res = await checkJson({ source: TINY }, { RATE_CHECK: exhausted });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe(String(RATE_PERIOD_SECONDS));
    expect(((await res.json()) as { diagnostics: unknown[] }).diagnostics).toEqual([
      {
        code: "E_RATE_LIMITED",
        severity: "error",
        message: `too many /check requests from this address: this host answers at most ${CHECK_PER_PERIOD} every ${RATE_PERIOD_SECONDS} s`,
        fix: ERROR_CATALOG.E_RATE_LIMITED!.fix,
      },
    ]);
  });

  it("checkRequest reads the JSON and the plain forms alike", () => {
    const q = new URLSearchParams("profile=uk-residential-advisory&strict=true");
    expect(checkRequest(TINY, "text/plain", q)).toEqual({
      source: TINY,
      profile: "uk-residential-advisory",
      strict: true,
    });
    expect(checkRequest(JSON.stringify({ source: TINY }), "application/json; charset=utf-8", q)).toEqual({
      source: TINY,
      strict: false,
    });
  });
});

describe("telemetry: one data point per check, its profile from the fixed list", () => {
  it("records [check, profile] and nothing from the plan; a refusal records its reason", async () => {
    points.length = 0;
    await checkJson({ source: TINY });
    await checkJson({ source: TINY, profile: "cn-residential-advisory" });
    await checkJson({ source: TINY, profile: "not-a-profile" });
    await checkJson({ source: "x".repeat(SOURCE_CAP_BYTES + 1) });
    await checkJson({ source: TINY }, { ...env, RATE_CHECK: exhausted });
    expect(points).toEqual([
      { blobs: ["check", ""], indexes: ["check"] },
      { blobs: ["check", "cn-residential-advisory"], indexes: ["check"] },
      { blobs: ["refused", "too-large /check"], indexes: ["refused"] },
      { blobs: ["refused", "rate-limited /check"], indexes: ["refused"] },
    ]);
  });
});
