import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compile, planFromJson, planToJson } from "../src/index.js";
import { type MutationKind, applyMutations, mutationsArb, protoSnapshot } from "./json-mutate.js";

/**
 * Malformed Plan JSON never throws (EH1.10, T-F3 / S-FZ-5).
 *
 * Start from `planToJson(<example>)` and apply 1-3 seeded mutations (`test/json-mutate.ts`: drop a
 * key, wrong type, NaN / +-Infinity / +-1e12 / -0 / 1e-9, empty array, extra key, `__proto__` /
 * `constructor` / `prototype` keys, swap siblings, duplicate an element, empty a string).
 * Laws: (a) `planFromJson` never throws; (b) its result is a plan whose emitted `.arch` compiles
 * without throwing (`compile` returns, so within the budgets), or it carries >= 1 `E_JSON_*`
 * error that names a JSON path; (c) no prototype gains an own key; (d) unmutated, the round-trip
 * law holds (same SVG as the source).
 */

const SEED = 20261109;
const NUM_RUNS = 400;
const EXAMPLES = [
  "studio",
  "tiny-house",
  "one-room",
  "laneway-house",
  "bungalow",
  "garden-loft",
  "two-storey",
  "hillside-villa",
];
const sources = EXAMPLES.map((n) => ({ name: n, src: readFileSync(`examples/${n}.arch`, "utf8") }));
const docs = sources.flatMap(({ name, src }) => {
  const r = planToJson(src);
  const json = r.json ?? r.pages?.[0];
  return json ? [{ name, src, json }] : [];
});

/**
 * DEFECT FOUND (EH1.10; `src/` is out of scope for this card, so it is pinned, not fixed):
 * `emitFurniture` guards `f.label !== undefined` and then `q(f.label)` iterates it, so a furniture
 * `label` that is a number, boolean, null, object or array makes `planFromJson` THROW
 * (`TypeError: s is not iterable`) instead of returning `E_JSON_SCHEMA`. The property lets exactly
 * this throw (message + `emitFurniture` frame) pass and counts it; any other throw fails. When
 * `src/` is fixed, delete `isKnownDefect` and flip the `it.fails` pin to `it`.
 */
let knownDefectHits = 0;
const isKnownDefect = (e: unknown): boolean =>
  e instanceof TypeError && /is not iterable/.test(e.message) && /emitFurniture/.test(String(e.stack));

describe("malformed Plan JSON", () => {
  it.fails("PINNED DEFECT: a non-string furniture label returns E_JSON_SCHEMA instead of throwing", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).furniture?.length)?.json));
    j.furniture[0].label = 7;
    expect(() => planFromJson(j)).not.toThrow();
  });

  it("projects at least five examples, one of them multi-storey", () => {
    expect(docs.length).toBeGreaterThanOrEqual(5);
    expect(docs.some((d) => /^\s*level\b/m.test(d.src))).toBe(true);
  });

  const histogram = new Map<MutationKind, number>();

  /** The laws over one document; returns a failure string or undefined. */
  function check(doc: unknown): string | undefined {
    const before = protoSnapshot();
    let r: ReturnType<typeof planFromJson>;
    try {
      r = planFromJson(doc);
    } catch (e) {
      if (isKnownDefect(e)) {
        knownDefectHits++;
        return undefined;
      }
      return `planFromJson threw: ${(e as Error)?.stack ?? e}`;
    }
    if (protoSnapshot() !== before) return "a prototype gained an own key";
    const jsonErrors = r.diagnostics.filter((d) => d.severity === "error" && d.code?.startsWith("E_JSON"));
    if (jsonErrors.length > 0) {
      const unpathed = jsonErrors.filter((d) => !/plan JSON \S+/.test(d.message));
      if (unpathed.length > 0) return `E_JSON diagnostic without a path: ${unpathed[0]?.code} ${unpathed[0]?.message}`;
      return undefined;
    }
    if (r.source === undefined) return `no source and no E_JSON error: ${JSON.stringify(r.diagnostics.slice(0, 2))}`;
    try {
      compile(r.source);
    } catch (e) {
      return `compile threw on the emitted source: ${(e as Error)?.stack ?? e}`;
    }
    if (protoSnapshot() !== before) return "a prototype gained an own key (compile)";
    return undefined;
  }

  it(`laws (a)-(c) hold under 1-3 mutations (seed ${SEED}, ${NUM_RUNS} runs)`, () => {
    fc.assert(
      fc.property(fc.nat(docs.length - 1), mutationsArb(1, 3), (di, ms) => {
        const { value, applied, kinds } = applyMutations(docs[di]!.json, ms);
        for (const k of kinds) histogram.set(k, (histogram.get(k) ?? 0) + 1);
        const bad = check(value);
        if (bad) throw new Error(`${docs[di]!.name}: ${applied.join("; ")}\n${bad}`);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
    console.info(`plan-json-malformed mutation histogram: ${JSON.stringify(Object.fromEntries(histogram))}`);
    console.info(`plan-json-malformed known-defect throws absorbed: ${knownDefectHits}`);
    expect(histogram.size).toBe(9);
  });

  it("hostile roots: non-objects and empty containers", () => {
    for (const v of [undefined, null, 0, Number.NaN, "x", true, [], {}, [{}], { rooms: null }, { rooms: {} }]) {
      expect(check(v), String(JSON.stringify(v))).toBeUndefined();
    }
  });

  it("law (d): unmutated, the round trip holds for projectable examples", () => {
    let same = 0;
    for (const { src, json } of docs) {
      const r = planFromJson(json);
      if (r.source === undefined || r.diagnostics.some((d) => d.severity === "error")) continue;
      if (compile(r.source).svg === compile(src).svg) same++;
    }
    expect(same).toBeGreaterThanOrEqual(3);
  });
});
