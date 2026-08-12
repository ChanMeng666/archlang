/**
 * The door `hinge` / `swing` value sets have ONE source — `DOOR_ENUMS` in
 * `src/grammar/tokens.ts` — and this file is what keeps it that way.
 *
 * Before the refactor the two pairs were hand-kept in six places: the parser's inline
 * check and the resolver's `set door(…)` allow-list (`src/elements/door.ts`), the Plan
 * JSON validator and the Plan JSON schema (`src/plan-json.ts`), `scripts/gen-gbnf.ts`'s
 * door productions and `scripts/gen-llm-spec.ts`'s door grammar line. The last two are
 * the dangerous ones and the reason this test exists: a literal typed INSIDE a generator
 * reproduces the same wrong text forever while `npm run check:drift` stays green, because
 * the gate compares a generator's output to the committed file — it proves reproducibility,
 * never correctness. That is exactly how MCP 0.2.2 shipped a GBNF grammar that could not
 * decode `polygon`/`arc`.
 *
 * So three properties are pinned here:
 *
 *  1. **No seventh copy.** Modelled on the `EM_PER_CHAR` pin in `dim-stagger.test.ts`: a
 *     fixed list of the files that used to hold a copy, and only the source file may still
 *     spell one out.
 *  2. **Both generators fail LOUDLY** when a door clause has no rendering — proved by
 *     calling each guard on a synthetic table, not by trusting a comment.
 *  3. **The weld to `KEYWORDS.enum`** — the highlighting bucket must contain every value,
 *     so a new one can never ship unhighlighted.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, planFromJson } from "../src/index.js";
import {
  DOOR_ENUMS,
  DOOR_HINGE_NEAR,
  DOOR_KIND_CLAUSES,
  DOOR_KINDS,
  KEYWORDS,
  enumList,
} from "../src/grammar/tokens.js";
import { assertDoorVocab, renderGbnf } from "../scripts/gen-gbnf.js";
import { assertDoorEnumsRendered } from "../scripts/gen-llm-spec.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]): string => readFileSync(join(__dirname, ...p), "utf8");

/** The one file allowed to spell a door value set out. */
const SOURCE = "../src/grammar/tokens.ts";
/** Every file that used to keep its own copy, plus the source. */
const FILES = [
  SOURCE,
  "../src/elements/door.ts",
  "../src/plan-json.ts",
  "../scripts/gen-gbnf.ts",
  "../scripts/gen-llm-spec.ts",
  "../src/ast.ts",
  "../src/ir.ts",
  "../src/geometry.ts",
  "../src/fix-producers.ts",
];

/**
 * The spellings a copy of a two-value set takes in this tree: a TS union or a literal
 * array (`"left" | "right"` / `["left", "right"]`), a GBNF alternation (same shape), and
 * the prose form the spec generator emits (`left|right`). A line counts as a copy only
 * when it is also ABOUT a door clause — `left`/`right` are equally a `strip` direction, a
 * furniture `side` and a `north` bearing, and those legitimately keep their own lists.
 */
function copyLines(text: string): string[] {
  const sets = [...Object.values(DOOR_ENUMS), DOOR_HINGE_NEAR, DOOR_KINDS].map((v) => [...v]);
  const patterns = sets.map((v) => new RegExp(`"${v.join('"\\s*[|,]\\s*"')}"|\\b${v.join("\\|")}\\b`));
  return (
    text
      .split(/\r?\n/)
      // Prose comments are out of scope: a stale comment misleads a reader, but only an
      // EXECUTABLE copy can make the parser, the schema or a generated grammar disagree
      // about what the language accepts. So strip trailing `//` and skip doc-comment lines.
      .map((line) => (/^\s*(\*|\/\*)/.test(line) ? "" : line.replace(/\/\/.*$/, "")))
      .filter((line) => /hinge|swing|slide|door.?kind/i.test(line) && patterns.some((p) => p.test(line)))
  );
}

suite("door enums — one source, six call sites", () => {
  it("is the only file that spells a door value set out", () => {
    const hits = FILES.filter((f) => copyLines(read(f)).length > 0);
    expect(hits).toEqual([SOURCE]);
  });

  it("detects a copy when one is planted (the pin is not vacuously green)", () => {
    expect(copyLines('  hinge?: "left" | "right";')).toHaveLength(1);
    expect(copyLines('          swing: { enum: ["in", "out"] },')).toHaveLength(1);
    expect(copyLines("  door … [hinge left|right] …")).toHaveLength(1);
    expect(copyLines('  doorKind?: "hinged" | "sliding" | "barn" | "bifold" | "pocket";')).toHaveLength(1);
    expect(copyLines('  slide?: "left" | "right";')).toHaveLength(1);
    // …and stays quiet on the other enums that happen to share members.
    expect(copyLines('  side?: "left" | "right";')).toHaveLength(0);
    expect(copyLines('["strip-dir", `"right" | "left" | "down" | "up"`],')).toHaveLength(0);
  });

  it("routes every call site through the table", () => {
    for (const f of FILES.filter((f) => f !== SOURCE)) {
      const src = read(f);
      // Either the values (DOOR_ENUMS) or the derived types are imported from the source.
      expect(src, f).toMatch(/DOOR_ENUMS|DOOR_HINGE_NEAR|DOOR_KINDS|DoorHinge|DoorSwingDir|DoorEnumClause|DoorKind/);
      expect(src, f).toMatch(/grammar\/tokens\.js/);
    }
  });
});

suite("door enums — the generators fail loudly, not silently", () => {
  const body = (): [string, string][] => [
    ["door-stmt", `"door" rws id-opt ( door-kind rws )? opening-placement door-clauses`],
    ["door-kind", `"hinged" | "sliding" | "barn" | "bifold" | "pocket"`],
    // A SEQUENCE of optionals in the parser's own clause order, not a `( clause )*`
    // set: `door … swing in hinge left` is a parse error, so a grammar that offered
    // the clauses as an unordered repeat would emit forms the language has never had.
    [
      "door-clauses",
      `( ws "hinge" rws hinge-val )? ( ws "swing" rws swing-val )? ( ws "slide" rws slide-val )? ( ws "open" ws expr )?`,
    ],
    ["hinge-val", `"near" rws ( "start" | "end" ) | "left" | "right"`],
    ["swing-val", `"into" rws ref | "in" | "out"`],
    ["slide-val", `"left" | "right"`],
  ];

  it("gen-gbnf accepts the shipped grammar", () => {
    expect(() => renderGbnf()).not.toThrow();
    expect(() => assertDoorVocab(body(), DOOR_ENUMS, DOOR_KINDS)).not.toThrow();
    // The productions really are derived — the committed grammar carries them.
    const g = renderGbnf();
    expect(g).toContain(`hinge-val ::= "near" rws ( "start" | "end" ) | "left" | "right"`);
    expect(g).toContain(`swing-val ::= "into" rws ref | "in" | "out"`);
    expect(g).toContain(`slide-val ::= "left" | "right"`);
    expect(g).toContain(`door-kind ::= "hinged" | "sliding" | "barn" | "bifold" | "pocket"`);
    expect(g).toContain(
      `door-clauses ::= ( ws "hinge" rws hinge-val )? ( ws "swing" rws swing-val )? ( ws "slide" rws slide-val )? ( ws "open" ws expr )?`,
    );
    // The kind word LEADS the statement (it is not a clause), which is what makes the
    // separate `door-kind` arm of the guard necessary at all.
    expect(g).toContain(`door-stmt ::= "door" rws id-opt ( door-kind rws )? opening-placement door-clauses`);
  });

  it("gen-gbnf throws when a door clause has no production", () => {
    expect(() => assertDoorVocab(body(), { ...DOOR_ENUMS, latch: ["left", "right"] }, DOOR_KINDS)).toThrow(
      /door clause "latch" has no `latch-val` production/,
    );
  });

  it("gen-gbnf throws when a production stops deriving its value set", () => {
    // The failure mode the guard exists for: the literals stay behind while the table moves.
    expect(() => assertDoorVocab(body(), { ...DOOR_ENUMS, swing: ["in", "out", "either"] }, DOOR_KINDS)).toThrow(
      /`swing-val` does not render its value set/,
    );
  });

  it("gen-gbnf throws when a clause is unreachable from `door-clauses`", () => {
    const orphaned = body().map(([n, p]) => (n === "door-clauses" ? [n, `( ws "hinge" rws hinge-val )?`] : [n, p])) as [
      string,
      string,
    ][];
    expect(() => assertDoorVocab(orphaned, DOOR_ENUMS, DOOR_KINDS)).toThrow(/no door clause emits/);
  });

  it("gen-gbnf throws when the clause table is reordered out of the parser's order", () => {
    // `door-clauses` renders one optional per key IN TABLE ORDER, which makes that
    // order load-bearing: the parser reads `hinge`, then `swing`, then `slide`, once
    // each, so a table shuffled for some unrelated reason would silently ship a
    // grammar whose every two-clause door is a parse error. Nothing about the
    // per-clause checks above would notice — every production is still present and
    // still derives its value set.
    const reordered = { swing: DOOR_ENUMS.swing, hinge: DOOR_ENUMS.hinge, slide: DOOR_ENUMS.slide };
    expect(() => assertDoorVocab(body(), reordered, DOOR_KINDS)).toThrow(/no longer matches the order/);
  });

  it("gen-gbnf throws when a door KIND stops being rendered", () => {
    // The same hazard one level up: a kind is not a clause, so the clause loop above
    // cannot see it. A kind added to `DOOR_KINDS` and not to the grammar would ship a
    // decoder that cannot emit it, with `check:drift` green throughout.
    expect(() => assertDoorVocab(body(), DOOR_ENUMS, [...DOOR_KINDS, "dutch"])).toThrow(
      /`door-kind` does not render its value set/,
    );
    const noKind = body().filter(([n]) => n !== "door-kind");
    expect(() => assertDoorVocab(noKind, DOOR_ENUMS, DOOR_KINDS)).toThrow(/no `door-kind` production/);
    const unreachable = body().map(([n, p]) =>
      n === "door-stmt" ? [n, `"door" rws id-opt opening-target`] : [n, p],
    ) as [string, string][];
    expect(() => assertDoorVocab(unreachable, DOOR_ENUMS, DOOR_KINDS)).toThrow(/unreachable from `door-stmt`/);
  });

  it("gen-llm-spec throws when the door line stops rendering a clause", () => {
    const line =
      "door … [hinged|sliding|barn|bifold|pocket] [hinge left|right|near start|near end] [swing in|out|into <roomId>] [slide left|right]";
    expect(() => assertDoorEnumsRendered(line, DOOR_ENUMS, DOOR_HINGE_NEAR, DOOR_KINDS)).not.toThrow();
    expect(() =>
      assertDoorEnumsRendered(line, { ...DOOR_ENUMS, latch: ["left", "right"] }, DOOR_HINGE_NEAR, DOOR_KINDS),
    ).toThrow(/does not render the "latch" clause/);
    expect(() =>
      assertDoorEnumsRendered(line, { ...DOOR_ENUMS, hinge: ["left", "right", "auto"] }, DOOR_HINGE_NEAR, DOOR_KINDS),
    ).toThrow(/does not render the "hinge" clause/);
    expect(() => assertDoorEnumsRendered(line, DOOR_ENUMS, ["start", "end", "middle"], DOOR_KINDS)).toThrow(
      /hinge near/,
    );
    expect(() => assertDoorEnumsRendered(line, DOOR_ENUMS, DOOR_HINGE_NEAR, [...DOOR_KINDS, "dutch"])).toThrow(
      /does not render the door KIND alternation/,
    );
  });
});

suite("door enums — the weld to the highlighting bucket", () => {
  it("every door value is also a `KEYWORDS.enum` word", () => {
    // DOOR_ENUMS sits BESIDE `KEYWORDS.enum` (the flat, cross-element highlighting bag)
    // rather than deriving from it — but nothing may be in one and not the other, or a
    // value would ship without editor colour.
    for (const v of [...Object.values(DOOR_ENUMS).flat(), ...DOOR_HINGE_NEAR, ...DOOR_KINDS]) {
      expect(KEYWORDS.enum, v).toContain(v);
    }
  });

  it("every clause INTRODUCER is a `KEYWORDS.attribute` word", () => {
    // The other half of the weld: a clause keyword (`hinge`, `swing`, `slide`) must be
    // in the attribute bucket or it ships without editor colour — and, unlike a value,
    // it is what an author types first.
    for (const clause of Object.keys(DOOR_ENUMS)) expect(KEYWORDS.attribute, clause).toContain(clause);
    expect(KEYWORDS.attribute).toContain("open");
  });

  it("every kind in the table has a clause-legality row", () => {
    // `DOOR_KIND_CLAUSES` is the semantic twin of `DOOR_ENUMS`: a kind added to one and
    // not the other would resolve with `undefined` legality and quietly accept anything.
    for (const k of DOOR_KINDS)
      expect(Object.keys(DOOR_KIND_CLAUSES[k]).sort()).toEqual(["hinge", "open", "slide", "swing"]);
    expect(Object.keys(DOOR_KIND_CLAUSES).sort()).toEqual([...DOOR_KINDS].sort());
  });
});

suite("door enums — the behaviour the table drives", () => {
  const plan = (clause: string): string =>
    [
      'plan "D" {',
      "  units mm",
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }",
      `  door on exterior at 50% width 900 ${clause}`,
      "}",
    ].join("\n");

  /** The same plan with a leading kind word. */
  const kindPlan = (kind: string, clause = ""): string =>
    [
      'plan "D" {',
      "  units mm",
      "  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }",
      `  door ${kind} on exterior at 20% width 700 ${clause}`,
      "}",
    ].join("\n");

  it("accepts every value in the table, in both clauses", () => {
    for (const h of DOOR_ENUMS.hinge) expect(compile(plan(`hinge ${h}`)).errors).toEqual([]);
    for (const s of DOOR_ENUMS.swing) expect(compile(plan(`swing ${s}`)).errors).toEqual([]);
    for (const n of DOOR_HINGE_NEAR) expect(compile(plan(`hinge near ${n}`)).errors).toEqual([]);
  });

  it("accepts every KIND in the table, and every `slide` value on one that takes it", () => {
    for (const k of DOOR_KINDS) expect(compile(kindPlan(k)).errors, k).toEqual([]);
    for (const s of DOOR_ENUMS.slide) expect(compile(kindPlan("pocket", `slide ${s}`)).errors, s).toEqual([]);
  });

  it("refuses a `slide` value outside the table, naming the table's own list", () => {
    expect(compile(kindPlan("pocket", "slide sideways")).errors[0]?.message).toBe(
      `Expected slide ${enumList(DOOR_ENUMS.slide)} but found "sideways"`,
    );
  });

  it("refuses anything else, naming the table's own list in the message", () => {
    expect(compile(plan("hinge sideways")).errors[0]?.message).toBe(
      `Expected hinge ${enumList(DOOR_ENUMS.hinge)} but found "sideways"`,
    );
    expect(compile(plan("swing sideways")).errors[0]?.message).toBe(
      `Expected swing ${enumList(DOOR_ENUMS.swing)} but found "sideways"`,
    );
    expect(compile(plan("hinge near middle")).errors[0]?.message).toBe(
      `Expected hinge near ${enumList(DOOR_HINGE_NEAR)} but found "middle"`,
    );
  });

  it("holds Plan JSON to the same list", () => {
    const doc = (hinge: string) => ({
      plan: "J",
      rooms: [],
      walls: [
        {
          category: "exterior",
          thickness: 200,
          points: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          close: true,
        },
      ],
      openings: [{ kind: "door", x: 2000, y: 0, width: 900, hinge }],
      furniture: [],
    });
    for (const h of DOOR_ENUMS.hinge) expect(planFromJson(doc(h)).diagnostics).toEqual([]);
    const bad = planFromJson(doc("sideways")).diagnostics;
    expect(bad.map((d) => d.message)).toEqual([`plan JSON /openings/0/hinge: expected ${enumList(DOOR_ENUMS.hinge)}`]);
  });
});
