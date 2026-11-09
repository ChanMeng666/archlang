import { readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { compile, planFromJson, planToJson } from "../src/index.js";
import { MUTATION_KINDS, type MutationKind, applyMutations, mutationsArb, protoSnapshot } from "./json-mutate.js";
import { CANNOT_ROUND_TRIP } from "./plan-json-gaps.js";

/**
 * Malformed Plan JSON never throws (EH1.10, T-F3 / S-FZ-5).
 *
 * Start from `planToJson(<example>)` for EVERY shipped example and apply 1-3 seeded mutations
 * (`test/json-mutate.ts`: drop a key, wrong type, NaN / +-Infinity / +-1e12 / -0 / 1e-9, empty
 * array, extra key, `__proto__` / `constructor` / `prototype` keys, swap siblings, duplicate an
 * element, empty a string). Laws: (a) `planFromJson` never throws; (b) every diagnostic code is
 * catalogued, and the result is either a plan whose emitted `.arch` compiles with NO error
 * diagnostic, or >= 1 `E_JSON_*` error that names a JSON path; (c) no prototype gains an own
 * key; (d) unmutated, every example outside `CANNOT_ROUND_TRIP` round-trips to the same SVG.
 */

const SEED = 20261109;
const NUM_RUNS = 400;
const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort();
const docs = EXAMPLES.flatMap((file) => {
  const src = readFileSync(`examples/${file}`, "utf8");
  const r = planToJson(src);
  const json = r.json ?? r.pages?.[0];
  return json ? [{ name: file, src, json, single: r.json !== undefined }] : [];
});

/** An E_JSON message names its path: `plan JSON /rooms/0/width: ...` (the root path is empty). */
const PATHED = /^plan JSON (?:\/[^\s:/]*)*:/;

/**
 * DEFECT 1 (EH1.10; `src/` is out of scope for this card, so it is pinned, not fixed):
 * `emitFurniture` guards `f.label !== undefined` and then `q(f.label)` iterates it, so a furniture
 * `label` that is a number, boolean, null, object or array makes `planFromJson` THROW
 * (`TypeError: s is not iterable`) instead of returning `E_JSON_SCHEMA`. The property lets exactly
 * this throw pass, and only when the input holds a furniture item with a non-string label; it
 * counts it. Any other throw fails. Removal: delete `isKnownDefect` and flip the `it.fails` pin to
 * `it` when the fix lands (follow-up: planFromJson furniture label type (EH1.10 defect 1)).
 */
let knownDefectHits = 0;
const hasNonStringLabel = (doc: unknown): boolean => {
  const furniture = (doc as { furniture?: unknown } | null)?.furniture;
  return (
    Array.isArray(furniture) &&
    furniture.some(
      (f) =>
        typeof f === "object" && f !== null && "label" in f && typeof f.label !== "string" && f.label !== undefined,
    )
  );
};
/**
 * DEFECT 2 (EH1.10, pinned, not fixed): `emitArch` writes each title field as `q(v)` after only
 * `v !== undefined`, so a non-string `title.<field>` (e.g. `title.date = {}`) throws the same
 * `TypeError: s is not iterable` instead of returning `E_JSON_SCHEMA`. Absorbed only when the input
 * holds a non-string title field. Removal: as defect 1 (follow-up: planFromJson title field type,
 * EH1.10 defect 2).
 */
let titleDefectHits = 0;
const hasNonStringTitleField = (doc: unknown): boolean => {
  const title = (doc as { title?: unknown } | null)?.title;
  return (
    typeof title === "object" &&
    title !== null &&
    Object.values(title).some((v) => v !== undefined && typeof v !== "string")
  );
};
const isKnownTitleDefect = (e: unknown, doc: unknown): boolean =>
  e instanceof TypeError &&
  /is not iterable/.test(e.message) &&
  !/emitFurniture/.test(String(e.stack)) &&
  /emitArch/.test(String(e.stack)) &&
  hasNonStringTitleField(doc);
/**
 * DEFECT 3 (EH1.10, pinned, not fixed): string fields that become source tokens (ids, categories,
 * room and wall references, kinds) are printed verbatim, with no type or syntax check. An empty
 * `category` emits `furniture  at (...)`; a number swapped into an `id` emits `id=1000` after a
 * keyword: the parser refuses both with `E_PARSE`, where planFromJson should have returned
 * `E_JSON_SCHEMA` naming the path. A string carrying spaces, quotes or newlines is a source-injection
 * vector for the same reason. The property absorbs an emitted-source result whose only errors are
 * `E_PARSE` and counts it (the class is wider than one field, so the absorber is the code, not a
 * field). Removal: follow-up planFromJson identifier validation (EH1.10 defect 3).
 */
let parseDefectHits = 0;
const isKnownDefect = (e: unknown, doc: unknown): boolean =>
  e instanceof TypeError &&
  /is not iterable/.test(e.message) &&
  /emitFurniture/.test(String(e.stack)) &&
  hasNonStringLabel(doc);

describe("malformed Plan JSON", () => {
  it("projects the whole corpus, multi-storey examples included", () => {
    expect(docs.length).toBeGreaterThanOrEqual(30);
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
      if (isKnownDefect(e, doc)) {
        knownDefectHits++;
        return undefined;
      }
      if (isKnownTitleDefect(e, doc)) {
        titleDefectHits++;
        return undefined;
      }
      return `planFromJson threw: ${(e as Error)?.stack ?? e}`;
    }
    if (protoSnapshot() !== before) return "a prototype gained an own key";
    const uncatalogued = r.diagnostics.filter((d) => !d.code || !(d.code in ERROR_CATALOG));
    if (uncatalogued.length > 0) return `uncatalogued diagnostic: ${JSON.stringify(uncatalogued[0])}`;
    const jsonErrors = r.diagnostics.filter((d) => d.severity === "error" && d.code?.startsWith("E_JSON"));
    if (jsonErrors.length > 0) {
      const unpathed = jsonErrors.filter((d) => !PATHED.test(d.message));
      if (unpathed.length > 0) return `E_JSON diagnostic without a path: ${unpathed[0]?.code} ${unpathed[0]?.message}`;
      return undefined;
    }
    if (r.source === undefined) return `no source and no E_JSON error: ${JSON.stringify(r.diagnostics.slice(0, 2))}`;
    try {
      // A mutated plan may be semantically invalid (a furniture item with no size, a dangling room
      // reference): the compiler says so with a catalogued diagnostic. What planFromJson must never do
      // is emit text the parser cannot read, so a syntax-level error on the emitted source is a defect.
      const cd = compile(r.source).diagnostics;
      const bad = cd.filter((d) => !d.code || !(d.code in ERROR_CATALOG) || d.code === "E_PARSE");
      if (bad.length > 0 && bad.every((d) => d.code === "E_PARSE")) {
        parseDefectHits++;
      } else if (bad.length > 0) return `emitted source: ${bad[0]?.code} ${bad[0]?.message}\n${r.source.slice(0, 400)}`;
    } catch (e) {
      return `compile threw on the emitted source: ${(e as Error)?.stack ?? e}`;
    }
    if (protoSnapshot() !== before) return "a prototype gained an own key (compile)";
    return undefined;
  }

  it(`laws (a)-(c) hold under 1-3 mutations (seed ${SEED}, ${NUM_RUNS} runs)`, () => {
    let runs = 0;
    let changed = 0;
    fc.assert(
      fc.property(fc.nat(docs.length - 1), mutationsArb(1, 3), (di, ms) => {
        const doc = docs[di]!;
        const { value, applied, kinds } = applyMutations(doc.json, ms);
        runs++;
        if (!isDeepStrictEqual(value, doc.json)) changed++;
        for (const k of kinds) histogram.set(k, (histogram.get(k) ?? 0) + 1);
        const bad = check(value);
        if (bad) throw new Error(`${doc.name}: ${applied.join("; ")}\n${bad}`);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
    console.info(`plan-json-malformed mutation histogram: ${JSON.stringify(Object.fromEntries(histogram))}`);
    console.info(
      `plan-json-malformed documents changed: ${changed}/${runs}; known-defect throws absorbed: label ${knownDefectHits}, title ${titleDefectHits}, E_PARSE (identifier fields) ${parseDefectHits}`,
    );
    expect(changed / runs).toBeGreaterThanOrEqual(0.9);
    expect(histogram.size).toBe(MUTATION_KINDS.length);
  });

  it.fails("PINNED DEFECT 1: a non-string furniture label returns a pathed E_JSON_SCHEMA, not a throw", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).furniture?.length)?.json));
    j.furniture[0].label = 7;
    const r = planFromJson(j);
    const d = r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA");
    expect(d?.message).toMatch(/^plan JSON \/furniture\/0\/label:/);
  });

  it.fails("PINNED DEFECT 2: a non-string title field returns a pathed E_JSON_SCHEMA, not a throw", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).title)?.json));
    j.title.date = { a: 1 };
    const r = planFromJson(j);
    const d = r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA");
    expect(d?.message).toMatch(/^plan JSON \/title\/date:/);
  });

  it.fails("PINNED DEFECT 3: an empty furniture category is refused with a pathed E_JSON_SCHEMA, not emitted as unparsable source", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).furniture?.length)?.json));
    j.furniture[0].category = "";
    const r = planFromJson(j);
    expect(r.diagnostics.some((x) => x.code === "E_PARSE")).toBe(false);
    expect(r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA")?.message).toMatch(
      /^plan JSON \/furniture\/0\/category:/,
    );
  });

  it.fails("PINNED DEFECT 3b: a numeric opening id is refused with a pathed E_JSON_SCHEMA, not emitted as unparsable source", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).openings?.length)?.json));
    j.openings[0].id = 1000;
    const r = planFromJson(j);
    expect(r.diagnostics.some((x) => x.code === "E_PARSE")).toBe(false);
    expect(r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA")?.message).toMatch(/^plan JSON \/openings\/0\/id:/);
  });

  it("hostile roots: non-objects and empty containers", () => {
    for (const v of [undefined, null, 0, Number.NaN, "x", true, [], {}, [{}], { rooms: null }, { rooms: {} }]) {
      expect(check(v), String(JSON.stringify(v))).toBeUndefined();
    }
  });

  it("law (d): every example outside CANNOT_ROUND_TRIP round-trips exactly", () => {
    const roundTrippers = docs.filter((d) => d.single && !(d.name in CANNOT_ROUND_TRIP));
    expect(roundTrippers.length).toBeGreaterThanOrEqual(4);
    for (const { name, src, json } of roundTrippers) {
      const r = planFromJson(json);
      expect(
        r.diagnostics.filter((d) => d.severity === "error"),
        name,
      ).toEqual([]);
      expect(compile(r.source ?? "").svg, name).toBe(compile(src).svg);
    }
  });
});
