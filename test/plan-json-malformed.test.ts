import { readFileSync, readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { compile, describe as describePlan, planFromJson, planToJson } from "../src/index.js";
import { MUTATION_KINDS, type MutationKind, applyMutations, mutationsArb, protoSnapshot } from "./json-mutate.js";
import { CANNOT_ROUND_TRIP } from "./plan-json-gaps.js";

/**
 * Malformed Plan JSON never throws (EH1.10, T-F3 / S-FZ-5).
 *
 * Start from `planToJson(<example>)` for EVERY shipped example and apply 1-3 seeded mutations
 * (`test/json-mutate.ts`: drop a key, wrong type, NaN / +-Infinity / +-1e12 / -0 / 1e-9, empty
 * array, extra key, `__proto__` / `constructor` / `prototype` keys, swap siblings, duplicate an
 * element, empty a string). Laws: (a) `planFromJson` never throws; (b) every diagnostic code is
 * catalogued, and the result is either a plan whose emitted `.arch` compiles with NO `E_PARSE`
 * (a semantic error, catalogued, may stand), or >= 1 `E_JSON_*` error that names a JSON path;
 * (c) no prototype gains an own key; (d) unmutated, every example outside `CANNOT_ROUND_TRIP`
 * round-trips to the same SVG. Since EH1.15 no throw and no `E_PARSE` is absorbed: the three
 * defects EH1.10 pinned (a non-string furniture label or title field threw; an identifier field
 * emitted unparsable source) are fixed in `planFromJson`'s validator.
 *
 * And (e), EH1.15: a hostile string (quotes, backslashes, newlines, CR, NUL, braces, `#`) in any
 * string field is either refused with a pathed diagnostic or written as a literal that parses
 * with no `E_PARSE` and reads back as the same string; in an identifier field it is refused or
 * emitted as exactly the word it is.
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

/** Law (e): one string placed in one field of a small, valid plan. */
const STRING_SEED = 20261110;
const STRING_RUNS = 400;
const stringBase = (): any => ({
  version: 1,
  plan: "P",
  units: "mm",
  rooms: [{ id: "r1", x: 0, y: 0, width: 4000, height: 3000, label: "Room" }],
  walls: [
    {
      id: "w1",
      category: "exterior",
      thickness: 200,
      points: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      closed: true,
    },
  ],
  openings: [{ kind: "door", id: "d1", on: { wall: "w1", at: "50%" }, width: 900 }],
  furniture: [
    {
      category: "bed",
      id: "f1",
      x: 500,
      y: 500,
      width: 1600,
      height: 2000,
      label: "Bed",
    },
  ],
  dims: [{ from: { x: 0, y: 0 }, to: { x: 4000, y: 0 }, text: "4 m" }],
  title: {
    project: "Pr",
    drawn_by: "Me",
    date: "2026",
    number: "A-1",
    revision: "B",
  },
});
const back = (source: string): any => planToJson(source).json;
/** Every string field of the base plan: a LITERAL (printed by `q`) reads back as the same text; a
 *  WORD (printed bare where the grammar reads one identifier) reads back as the same word. */
const STRING_FIELDS: Array<{
  name: string;
  kind: "literal" | "word" | "position";
  set: (doc: any, s: string) => void;
  /** Absent for a position, which reads back as the coordinate it resolves to, not its text. */
  read?: (source: string) => unknown;
}> = [
  {
    name: "plan",
    kind: "literal",
    set: (d, s) => (d.plan = s),
    read: (src) => back(src).plan,
  },
  ...(["project", "drawn_by", "date", "number", "revision"] as const).map((k) => ({
    name: `title.${k}`,
    kind: "literal" as const,
    set: (d: any, s: string) => (d.title[k] = s),
    read: (src: string) => back(src).title?.[k],
  })),
  {
    name: "rooms/0/label",
    kind: "literal",
    set: (d, s) => (d.rooms[0].label = s),
    read: (src) => describePlan(src).rooms[0]?.label,
  },
  {
    name: "furniture/0/label",
    kind: "literal",
    set: (d, s) => (d.furniture[0].label = s),
    read: (src) => describePlan(src).furniture[0]?.label,
  },
  {
    name: "dims/0/text",
    kind: "literal",
    set: (d, s) => (d.dims[0].text = s),
    read: (src) => back(src).dims?.[0]?.text,
  },
  {
    name: "rooms/0/id",
    kind: "word",
    set: (d, s) => (d.rooms[0].id = s),
    read: (src) => describePlan(src).rooms[0]?.id,
  },
  {
    name: "furniture/0/category",
    kind: "word",
    set: (d, s) => (d.furniture[0].category = s),
    read: (src) => describePlan(src).furniture[0]?.category,
  },
  {
    name: "furniture/0/id",
    kind: "word",
    set: (d, s) => (d.furniture[0].id = s),
    read: (src) => describePlan(src).furniture[0]?.id,
  },
  {
    name: "walls/0/id",
    kind: "word",
    set: (d, s) => (d.walls[0].id = s),
    read: (src) => back(src).walls[0]?.id,
  },
  {
    name: "walls/0/category",
    kind: "word",
    set: (d, s) => (d.walls[0].category = s),
    read: (src) => back(src).walls[0]?.category,
  },
  {
    name: "openings/0/id",
    kind: "word",
    set: (d, s) => (d.openings[0].id = s),
    read: (src) => back(src).openings[0]?.id,
  },
  {
    name: "openings/0/on/at",
    kind: "position",
    set: (d, s) => (d.openings[0].on.at = s),
  },
];
/** Strings dense in the characters that end a literal or a word, mixed with ordinary ones. */
const hostileString = fc.string({
  unit: fc.oneof(
    fc.constantFrom('"', "\\", "\n", "\r", "\0", "}", "{", "#", " ", "\t", "=", ".", "-", "%", "1"),
    fc.constantFrom("a", "b", "Z", "_"),
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 1 }),
  ),
  maxLength: 12,
});

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
      if (bad.length > 0) return `emitted source: ${bad[0]?.code} ${bad[0]?.message}\n${r.source.slice(0, 400)}`;
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
    console.info(`plan-json-malformed documents changed: ${changed}/${runs}`);
    expect(changed / runs).toBeGreaterThanOrEqual(0.9);
    expect(histogram.size).toBe(MUTATION_KINDS.length);
  });

  it("EH1.15 (was EH1.10 defect 1): a non-string furniture label returns a pathed E_JSON_SCHEMA, not a throw", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).furniture?.length)?.json));
    j.furniture[0].label = 7;
    const r = planFromJson(j);
    const d = r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA");
    expect(d?.message).toMatch(/^plan JSON \/furniture\/0\/label:/);
  });

  it("EH1.15 (was EH1.10 defect 2): a non-string title field returns a pathed E_JSON_SCHEMA, not a throw", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).title)?.json));
    j.title.date = { a: 1 };
    const r = planFromJson(j);
    const d = r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA");
    expect(d?.message).toMatch(/^plan JSON \/title\/date:/);
  });

  it("EH1.15 (was EH1.10 defect 3): an empty furniture category is refused with a pathed E_JSON_SCHEMA, not emitted as unparsable source", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).furniture?.length)?.json));
    j.furniture[0].category = "";
    const r = planFromJson(j);
    expect(r.diagnostics.some((x) => x.code === "E_PARSE")).toBe(false);
    expect(r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA")?.message).toMatch(
      /^plan JSON \/furniture\/0\/category:/,
    );
  });

  it("EH1.15 (was EH1.10 defect 3b): a numeric opening id is refused with a pathed E_JSON_SCHEMA, not emitted as unparsable source", () => {
    const j: any = JSON.parse(JSON.stringify(docs.find((d) => (d.json as any).openings?.length)?.json));
    j.openings[0].id = 1000;
    const r = planFromJson(j);
    expect(r.diagnostics.some((x) => x.code === "E_PARSE")).toBe(false);
    expect(r.diagnostics.find((x) => x.code === "E_JSON_SCHEMA")?.message).toMatch(/^plan JSON \/openings\/0\/id:/);
  });

  it(`law (e): a hostile string in any string field is refused or round-trips (seed ${STRING_SEED}, ${STRING_RUNS} runs)`, () => {
    const tally = { refused: 0, literal: 0, word: 0, position: 0 };
    fc.assert(
      fc.property(fc.constantFrom(...STRING_FIELDS), hostileString, (field, s) => {
        const doc = stringBase();
        field.set(doc, s);
        const where = `${field.name} = ${JSON.stringify(s)}`;
        let r: ReturnType<typeof planFromJson>;
        try {
          r = planFromJson(doc);
        } catch (e) {
          throw new Error(`${where}: planFromJson threw: ${(e as Error)?.stack ?? e}`);
        }
        const errors = r.diagnostics.filter((d) => d.severity === "error");
        if (errors.length > 0) {
          // Refused: only pathed E_JSON_* errors, never a parse error on generated text.
          for (const d of errors)
            expect(d.code?.startsWith("E_JSON") && PATHED.test(d.message), `${where}: ${d.code} ${d.message}`).toBe(
              true,
            );
          tally.refused++;
          return;
        }
        const source = r.source!;
        const parseErrors = compile(source).diagnostics.filter((d) => d.code === "E_PARSE");
        expect(parseErrors, `${where}\n${source}`).toEqual([]);
        // An empty `id` is documented as no id at all (an automatic one takes its place).
        if (field.read && !(field.kind === "word" && s === ""))
          expect(field.read(source), `${where}\n${source}`).toBe(s);
        tally[field.kind]++;
      }),
      { seed: STRING_SEED, numRuns: STRING_RUNS },
    );
    console.info(`plan-json-malformed law (e): ${JSON.stringify(tally)}`);
    // Both halves ran: hostile strings were refused, and literals were written and read back.
    expect(tally.refused).toBeGreaterThan(0);
    expect(tally.literal).toBeGreaterThan(0);
  });

  it("law (e) by example: a string that tries to leave its literal or its word stays put", () => {
    const inject = 'x" } room id=evil at (0,0) size 1x1 label "y\n# z \\';
    for (const field of STRING_FIELDS) {
      const doc = stringBase();
      field.set(doc, inject);
      const r = planFromJson(doc);
      const errors = r.diagnostics.filter((d) => d.severity === "error");
      if (field.kind === "literal" && field.read) {
        expect(errors, field.name).toEqual([]);
        expect(field.read(r.source!), field.name).toBe(inject);
        expect(
          describePlan(r.source!).rooms.map((x) => x.id),
          field.name,
        ).toEqual(["r1"]);
      } else {
        expect(
          errors.map((d) => d.code),
          field.name,
        ).toEqual(["E_JSON_SCHEMA"]);
        expect(errors[0]!.message, field.name).toMatch(PATHED);
      }
    }
  });

  it("EH1.15: a tiny number is printed without an exponent; a bad `north`, `grid` or `on` is a pathed refusal", () => {
    const tiny = stringBase();
    tiny.furniture[0].x = 1e-9;
    const r = planFromJson(tiny);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.source).toContain("at (0.000000001,500)");
    expect(compile(r.source!).diagnostics.filter((d) => d.code === "E_PARSE")).toEqual([]);
    for (const [key, value, path] of [
      ["north", 5, "/north"],
      ["north", { deg: "x" }, "/north"],
      ["grid", Number.NaN, "/grid"],
    ] as const) {
      const doc = stringBase();
      doc[key] = value;
      expect(
        planFromJson(doc).diagnostics.map((d) => d.message.split(":")[0]),
        String(value),
      ).toEqual([`plan JSON ${path}`]);
    }
    const on = stringBase();
    on.openings[0].on = { wall: 7, at: "50% width 1" };
    expect(planFromJson(on).diagnostics.map((d) => d.message.split(":")[0])).toEqual([
      "plan JSON /openings/0/on/wall",
      "plan JSON /openings/0/on/at",
      "plan JSON /openings/0", // and so it has no placement
    ]);
  });

  it("EH1.15: 64 KiB of empty rooms returns at most 500 validation diagnostics and one E_DIAGNOSTIC_LIMIT", () => {
    const rows = Math.floor((64 * 1024 - '{"rooms":[]}'.length + 1) / 3);
    const text = `{"rooms":[${Array.from({ length: rows }, () => "{}").join(",")}]}`;
    expect(text.length).toBeLessThanOrEqual(64 * 1024);
    const r = planFromJson(JSON.parse(text));
    console.info(`plan-json-malformed cap probe: ${rows} rows, ${r.diagnostics.length} diagnostics`);
    expect(r.diagnostics.length).toBeLessThanOrEqual(501);
    expect(r.diagnostics.at(-1)?.code).toBe("E_DIAGNOSTIC_LIMIT");
    expect(r.diagnostics.at(-1)?.severity).toBe("error");
    const ordinary = r.diagnostics.slice(0, -1);
    expect(ordinary.length).toBe(500);
    expect(ordinary.every((d) => d.code === "E_JSON_SCHEMA" && PATHED.test(d.message))).toBe(true);
    // Below the cap nothing changes: the same document cut to 10 rows reports every field, no marker.
    const small = planFromJson({ rooms: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}] }).diagnostics;
    expect(small.some((d) => d.code === "E_DIAGNOSTIC_LIMIT")).toBe(false);
    expect(small.length).toBe(40);
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
