/** RM3.1: the Plan JSON round-trip law (`-f json` → `--from-json` → SVG + describe() + lint()) over every in-scope example and the ground/floor/sill fixtures; the scope table held to `dropped`. */

import { exampleNames } from "./helpers/corpus.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compile,
  type Diagnostic,
  describe as describePlan,
  type FreedomReport,
  lint,
  type PlanJson,
  planToJson,
  type SceneSummary,
} from "../src/index.js";
import { type Args, makeNodeWorld, sourceFromJson } from "../src/cli/io.js";
import { DROPPED_WORDS, renderArtifact } from "../src/cli/serialize.js";
import { CANNOT_ROUND_TRIP, CLI_CLOSES } from "./tables/plan-json-gaps.js";
import { PLAN_JSON_SCOPE } from "./tables/plan-json-scope.js";

/**
 * The law. For every shipped example in scope — every example that is not a listed gap of the CLI
 * path (`CANNOT_ROUND_TRIP` minus `CLI_CLOSES`) — the plan `-f json` writes, read back by
 * `--from-json`, compiles to byte-identical SVG, a byte-identical `describe()` and a byte-identical
 * `lint()`, storey by storey. What the format does not carry is out of scope, and an out-of-scope
 * form is reported in `dropped` (the scope table, `test/tables/plan-json-scope.ts`, says which word).
 *
 * Byte-identical, compared as `JSON.stringify` (key order included), with these exceptions, each
 * because it is not a fact of the plan the document could carry:
 *
 * - `describe()`'s run wrapper (`ok`, `diagnostics`): the run, not the plan.
 * - `describe().freedom`, which reports which positions the SOURCE wrote as a relation and which
 *   as a number, is compared whole on a plan whose every element sits at a literal position and
 *   whose walls are typed as points. Elsewhere Plan JSON writes a relational position as its
 *   result (the `by-result` rows of the table), so only what that leaves standing is compared: the
 *   totals of each family and the set of elements it names. The positions themselves are held by
 *   the SVG bytes and every other fact.
 * - a `lint()` diagnostic's `span` and the `span` of each fix edit: byte offsets into the source
 *   text, and the way back's text is the canonical emission, not the author's. Everything else
 *   (code, severity, message, hints, each fix's `title`, `applicability` and every edit's
 *   `newText`, and the order) is compared.
 *
 * Every in-scope example is single-storey (a multi-storey plan is a `level` gap), and the test says
 * so rather than compare per-storey slices it cannot check whole.
 */

const ARGS: Args = { _: [] };
const EXAMPLES = exampleNames().sort();
const GAPS = new Set(Object.keys(CANNOT_ROUND_TRIP).filter((n) => !(n in CLI_CLOSES)));
const IN_SCOPE = EXAMPLES.filter((n) => !GAPS.has(n));

const NOT_FACTS = new Set(["ok", "diagnostics", "freedom"]);
const factsText = (s: SceneSummary): string =>
  JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => !NOT_FACTS.has(k))));

/** Every element at a literal position, every wall typed as points: nothing written as a result. */
const literal = (f: FreedomReport): boolean =>
  f.elements.every((e) => e.placement === "absolute") && (f.walls?.relational ?? 0) === 0;
/** What survives a relational position written as its result: the totals and the elements named. */
const freedomShape = (f: FreedomReport): string =>
  JSON.stringify({
    rooms: f.rooms.total,
    openings: f.openings.total,
    furniture: f.furniture.total,
    walls: f.walls?.total,
    elements: f.elements.map((e) => `${e.kind}:${e.id}`).sort(),
  });
const freedomText = (direct: FreedomReport, f: FreedomReport): string =>
  literal(direct) ? JSON.stringify(f) : freedomShape(f);

const lintText = (ds: Diagnostic[]): string =>
  JSON.stringify(
    ds.map(({ span: _span, fixes, ...rest }) => ({
      ...rest,
      ...(fixes ? { fixes: fixes.map((x) => ({ ...x, edits: x.edits.map((e) => e.newText) })) } : {}),
    })),
  );

interface Run {
  svg: string;
  facts: SceneSummary;
  lint: Diagnostic[];
}

/** What differs between a direct plan and its way back: `[]` when the law holds. */
function differs(want: Run, back: Run): string[] {
  const what: string[] = [];
  if (back.svg !== want.svg) what.push("svg");
  if (factsText(back.facts) !== factsText(want.facts)) what.push("describe");
  if (freedomText(want.facts.freedom, back.facts.freedom) !== freedomText(want.facts.freedom, want.facts.freedom))
    what.push("freedom");
  if (lintText(back.lint) !== lintText(want.lint)) what.push("lint");
  return what;
}

describe("the law over the shipped examples", () => {
  it("keeps a non-vacuous in-scope set, and every gap is named", () => {
    expect(IN_SCOPE.length).toBeGreaterThanOrEqual(10);
    for (const must of ["studio.arch", "one-room.arch", "garden-loft.arch", "imports.arch", "relational.arch"])
      expect(IN_SCOPE).toContain(must);
  });

  it("compares `freedom` whole on some in-scope examples, not only its shape", () => {
    const whole = IN_SCOPE.filter((n) => literal(describePlan(readFileSync(`examples/${n}`, "utf8")).freedom));
    expect(whole.length).toBeGreaterThan(0);
  });

  it.each(IN_SCOPE)("examples/%s comes back with the same SVG, describe() and lint()", async (name) => {
    const src = readFileSync(`examples/${name}`, "utf8");
    const world = makeNodeWorld("examples");
    const direct = await renderArtifact(src, "svg", ARGS, "examples", "all");
    const json = await renderArtifact(src, "json", ARGS, "examples", "all");
    expect(json.error, `${name}: -f json failed`).toBeUndefined();
    expect(json.pages, `${name} is in scope, so single-storey`).toBeUndefined();
    const conv = sourceFromJson(json.bytes as string);
    if ("error" in conv)
      throw new Error(`${name}: --from-json refused it: ${conv.error.map((d) => d.code).join(", ")}`);
    const back = await renderArtifact(conv.source, "svg", ARGS, process.cwd(), "first");
    const want: Run = { svg: direct.bytes as string, facts: describePlan(src, { world }), lint: lint(src, { world }) };
    const got: Run = { svg: back.bytes as string, facts: describePlan(conv.source), lint: lint(conv.source) };
    expect(differs(want, got), name).toEqual([]);
  });
});

/**
 * The forms RM3.1 moved into scope, and the round-trip cases the design asked the law to answer
 * (`plan-json-scope.md` §2.2, §3): each plan drops nothing, and comes back the same.
 */
const WALL = "wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }";
const plan = (head: string, body: string): string => `plan "law" {\n  units mm\n${head}  ${WALL}\n${body}}\n`;
const FIXTURES: Record<string, string> = {
  // PS0.21: every outdoor spelling — a rectangle, a ring, a label, a derived rail, written rails.
  outdoor: plan(
    "",
    `  room id=r1 at (0,0) size 8000x5000 label "Hall"
  door id=d on w1 at 50% width 900
  outdoor id=g lawn at (-3000,-3000) size 16000x13000 label "Garden"
  outdoor id=pv paving polygon (0,5000) (4000,5000) (4000,7000)
  outdoor id=b1 balcony at (2000,5000) size 3000x1500
  outdoor id=b2 balcony at (8000,1000) size 1500x3000 rail right top
  outdoor id=b3 balcony at (-1500,1000) size 1500x3000 rail none
  outdoor id=pond water at (9500,6000) size 2000x1500
`,
  ),
  // PS0.21: each fence style, open and closed, after the furniture.
  fence: plan(
    "",
    `  room id=r1 at (0,0) size 8000x5000 label "Hall"
  door id=d on w1 at 50% width 900
  furniture id=b bed at (500,500) size 1600x2000
  fence id=f1 picket { (-4000,-4000) (14000,-4000) }
  fence id=f2 panel { (-4000,-3000) (-4000,9000) (12000,9000) close }
  fence id=f3 post { (13000,0) (13000,6000) }
`,
  ),
  // RM3.1: `floor`, before and with `uses`.
  floor: plan(
    "",
    `  wall id=w2 partition thickness 100 { (4000,0) (4000,5000) }
  room id=r1 at (0,0) size 4000x5000 label "Kitchen" floor tile
  room id=r2 at (4000,0) size 4000x5000 label "Living" floor timber uses living
  door id=d on w1 at 25% width 900
`,
  ),
  // J16: under the heights gate a default sill comes back a default, so the balcony rule that
  // reads only a WRITTEN sill (`W_BALCONY_NO_DOOR`) says the same thing both ways.
  "default sill": plan(
    "  height 2800\n",
    `  room id=r1 at (0,0) size 8000x5000 label "Living"
  door id=d on w1 at 10% width 900
  window id=win at (3500,5000) width 1500
  window id=low at (6500,5000) width 1000 sill 0
  window id=high at (4000,0) width 1000 sill 1200 head 2200
  outdoor id=bal balcony at (2000,5000) size 3000x1500
`,
  ),
  // PS0.18: a room whose use comes from its label "Hall" comes back with no `uses`.
  "label Hall": plan(
    "",
    `  wall id=w2 partition thickness 100 { (4000,0) (4000,5000) }
  room id=hall at (0,0) size 4000x5000 label "Hall"
  room id=r2 at (4000,0) size 4000x5000 label "Bedroom"
  door id=d on w1 at 25% width 900
  door id=d2 on w2 at 50% width 800
`,
  ),
  // Design §2.2: the `dim` variants written as their resolved ends (`by-result`).
  "dim faces": plan(
    "",
    `  wall id=w2 partition thickness 100 { (4000,0) (4000,5000) }
  room id=r1 at (0,0) size 4000x5000 label "A"
  room id=r2 at (4000,0) size 4000x5000 label "B"
  door id=d on w1 at 25% width 900
  dim faces (0,2500)->(4000,2500) offset 600
  dim clear (4000,2500)->(8000,2500) offset 0 text "clear"
`,
  ),
  // The new keys together, beside furniture, a column and a written `floor` (review M3): a lawn and
  // two balconies (a derived rail and a written one) written before the pieces, whose rails share
  // the `furniture` pass with them, and a fence after them all.
  "ground with furniture": plan(
    "",
    `  wall id=w2 partition thickness 100 { (4000,0) (4000,5000) }
  room id=r1 at (0,0) size 4000x5000 label "Kitchen" floor tile
  room id=r2 at (4000,0) size 4000x5000 label "Living" floor timber
  door id=d on w1 at 25% width 900
  door id=d2 on w2 at 50% width 800
  outdoor id=g lawn at (-3000,-3000) size 16000x13000 label "Garden"
  outdoor id=b1 balcony at (1000,5000) size 2500x1500
  outdoor id=b2 balcony at (8000,1000) size 1500x3000 rail right
  furniture id=t dining_table at (1000,1500) size 1600x900 label "Table"
  furniture id=s sofa at (5000,300) size 2000x900
  column id=k at (3800,4700) size 300x300
  fence id=f panel { (-3000,10500) (13000,10500) }
`,
  ),
  "dim radius": `plan "law" {
  units mm
  wall id=cw exterior thickness 200 { (0,0) (6000,0) arc (6000,6000) radius 3000 cw (0,6000) close }
  room id=r at (0,0) size 6000x6000 label "R"
  door id=d on cw at 10% width 900
  dim radius cw segment 1
}
`,
};

describe("the forms RM3.1 carries, and the cases the design asked about", () => {
  it.each(Object.keys(FIXTURES))("%s: drops nothing, and comes back the same", (name) => {
    const src = FIXTURES[name]!;
    const out = planToJson(src);
    expect(out.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(out.dropped, name).toBeUndefined();
    const conv = sourceFromJson(JSON.stringify(out.json));
    if ("error" in conv) throw new Error(`${name}: refused: ${conv.error.map((d) => d.message).join(" | ")}`);
    const want = { svg: compile(src).svg, facts: describePlan(src), lint: lint(src) };
    const back = { svg: compile(conv.source).svg, facts: describePlan(conv.source), lint: lint(conv.source) };
    expect(differs(want, back), name).toEqual([]);
  });

  const json = (name: string): PlanJson => planToJson(FIXTURES[name]!).json!;

  it("carries `outdoor` as written: a ring, a label, and a rail only where the source wrote one", () => {
    const rows = json("outdoor").outdoor!;
    expect(rows.map((o) => [o.id, o.kind, o.rail])).toEqual([
      ["g", "lawn", undefined],
      ["pv", "paving", undefined],
      ["b1", "balcony", undefined],
      ["b2", "balcony", ["top", "right"]],
      ["b3", "balcony", []],
      ["pond", "water", undefined],
    ]);
    expect(rows[1]!.polygon).toEqual([
      { x: 0, y: 5000 },
      { x: 4000, y: 5000 },
      { x: 4000, y: 7000 },
    ]);
    expect(rows[0]!.label).toBe("Garden");
  });

  it("carries `fences` with their style and closure", () => {
    expect(json("fence").fences!.map((f) => [f.id, f.style, f.points.length, f.closed])).toEqual([
      ["f1", "picket", 2, false],
      ["f2", "panel", 3, true],
      ["f3", "post", 2, false],
    ]);
  });

  it("carries a room's `floor` only where it was written", () => {
    expect(json("floor").rooms.map((r) => r.floor)).toEqual(["tile", "timber"]);
    expect(json("label Hall").rooms.some((r) => "floor" in r)).toBe(false);
  });

  it("J16: writes a window's `sill` only when the statement wrote it", () => {
    const windows = json("default sill").openings.filter((o) => o.kind === "window");
    expect(windows.map((o) => [o.id, o.sill, o.head])).toEqual([
      ["win", undefined, 2100],
      ["low", 0, 2100],
      ["high", 1200, 2200],
    ]);
  });

  it("a plan with no ground and no floor has none of the new keys", () => {
    const doc = json("label Hall");
    expect("outdoor" in doc || "fences" in doc).toBe(false);
  });
});

describe("what does not come back is reported, never silent", () => {
  it("an outdoor surface before a room, or a fence before a piece, reports its order", () => {
    const early = plan(
      "",
      `  outdoor id=g lawn at (-3000,-3000) size 16000x13000\n  room id=r1 at (0,0) size 8000x5000\n`,
    );
    expect(planToJson(early).dropped).toEqual([{ clause: "outdoor order", count: 1, ids: ["g"] }]);
    const fence = plan(
      "",
      `  room id=r1 at (0,0) size 8000x5000\n  fence id=f { (-1000,-1000) (9000,-1000) }\n  furniture id=b bed at (500,500) size 1600x2000\n`,
    );
    expect(planToJson(fence).dropped).toEqual([{ clause: "fence order", count: 1, ids: ["f"] }]);
    // Both reports are not idle: each way back draws another SVG (its layer groups reorder).
    expect(sameBack(early)).toContain("svg");
    expect(sameBack(fence)).toContain("svg");
  });

  /**
   * A balcony's drawn rail is on the `furniture` pass with the pieces, the columns and the fences,
   * and the document writes `outdoor` before them all (review B2). It moves no byte: the SVG groups
   * its nodes by CAD layer in first-appearance order, and the rail's layer, `A-FLOR-BALC`, opens at
   * the balcony's tint on the `floor` pass, before any piece's `A-FURN` or fence's `L-SITE`. So
   * both orders come back the same, the plan with a written rail and the one with a derived rail,
   * and nothing is reported. (A fence written before a piece does move bytes: `L-SITE` then opens
   * before `A-FURN`. That is `fence order`, above.)
   */
  const ROOM = `  room id=r1 at (0,0) size 8000x5000 label "Hall"\n  door id=d on w1 at 50% width 900\n`;
  const BALCONIES: Record<string, string> = {
    "derived rail": "  outdoor id=bal balcony at (2000,5000) size 3000x1500\n",
    "written rail": "  outdoor id=bal balcony at (2000,5000) size 3000x1500 rail left right bottom\n",
  };
  const BEFORE: Record<string, string> = {
    furniture: "  furniture id=b bed at (2500,3000) size 1600x2000\n",
    fence: "  fence id=f { (-1000,7000) (9000,7000) }\n",
  };
  const sameBack = (src: string): string[] => {
    const conv = sourceFromJson(JSON.stringify(planToJson(src).json));
    if ("error" in conv) throw new Error(conv.error.map((d) => d.message).join(" | "));
    const run = (s: string): Run => ({ svg: compile(s).svg, facts: describePlan(s), lint: lint(s) });
    return differs(run(src), run(conv.source));
  };
  const ORDERS = Object.keys(BEFORE).flatMap((k) => Object.keys(BALCONIES).map((b) => `${k}|${b}`));
  it.each(ORDERS)(
    "a balcony after or before a piece or a fence (%s) comes back the same, and nothing is reported",
    (c) => {
      const [kind, rail] = c.split("|") as [string, string];
      for (const src of [
        plan("", `${ROOM}${BEFORE[kind]}${BALCONIES[rail]}`),
        plan("", `${ROOM}${BALCONIES[rail]}${BEFORE[kind]}`),
      ]) {
        expect(planToJson(src).dropped, src).toBeUndefined();
        expect(sameBack(src), src).toEqual([]);
      }
    },
  );

  it("an element with no `id=` reports `auto id`, and the hint that named it by size names it by id", () => {
    const src = plan(
      "  height 2800\n",
      `  room id=r1 at (0,0) size 8000x5000 label "Living"\n  window at (3500,5000) width 1500 sill 900\n  outdoor id=bal balcony at (2000,5000) size 3000x1500\n`,
    );
    const out = planToJson(src);
    expect(out.dropped).toEqual([{ clause: "auto id", count: 1, ids: ["window_1"] }]);
    const hint = (s: string): string | undefined => lint(s).find((d) => d.code === "W_BALCONY_NO_DOOR")?.hints?.[0];
    const conv = sourceFromJson(JSON.stringify(out.json));
    if ("error" in conv) throw new Error("refused");
    expect(hint(src)).toContain("the 1500 mm window");
    expect(hint(conv.source)).toContain("window `window_1`");
  });

  it("never reports a clause the document carries (`floor`, `outdoor`, `fence`)", () => {
    const sources = [...EXAMPLES.map((n) => readFileSync(`examples/${n}`, "utf8")), ...Object.values(FIXTURES)];
    for (const src of sources) {
      const clauses = (planToJson(src, { world: makeNodeWorld("examples") }).dropped ?? []).map((d) => d.clause);
      expect(clauses.filter((c) => c === "floor" || c === "outdoor" || c === "fence")).toEqual([]);
    }
  });

  it("a flattened `place` reports `place` until it round-trips (RM3.1 second half)", () => {
    const placed = `plan "p" {
  units mm
  component bay() { room id=r at (0,0) size 2000x2000 label "Bay" }
  place bay() as a at (0,0)
  place bay() as b at (3000,0)
}
`;
    expect(planToJson(placed).dropped).toEqual([{ clause: "place", count: 2, ids: ["a", "b"] }]);
    for (const name of EXAMPLES.filter((n) => /^\s*place\b/m.test(readFileSync(`examples/${n}`, "utf8")))) {
      const r = planToJson(readFileSync(`examples/${name}`, "utf8"), { world: makeNodeWorld("examples") });
      const carried = [r.json, ...(r.pages ?? []).map((p) => p.json)].some((d) => d?.instances !== undefined);
      if (!carried)
        expect(
          r.dropped?.map((d) => d.clause),
          name,
        ).toContain("place");
    }
  });

  it("every gap reports only clauses the scope table names as not carried", () => {
    const notCarried = new Set(PLAN_JSON_SCOPE.flatMap((r) => r.dropped ?? []));
    for (const name of GAPS) {
      const r = planToJson(readFileSync(`examples/${name}`, "utf8"), { world: makeNodeWorld("examples") });
      for (const row of r.dropped ?? []) expect(notCarried, `${name}: ${row.clause}`).toContain(row.clause);
    }
  });
});

describe("the scope table and the code agree", () => {
  /** Every word `planToJson` can put in `dropped`: the note words, and `keep`, which has its own note. */
  const CLAUSES = ["keep", ...Object.keys(DROPPED_WORDS)].sort();

  it("every dropped clause has a row, and every row's clause is one", () => {
    const named = new Set(PLAN_JSON_SCOPE.flatMap((r) => r.dropped ?? []));
    expect(
      CLAUSES.filter((c) => !named.has(c)),
      "clauses with no scope row",
    ).toEqual([]);
    expect(
      [...named].filter((c) => !CLAUSES.includes(c)),
      "scope rows naming no clause",
    ).toEqual([]);
  });

  it("a row names a clause exactly when it does not wholly travel", () => {
    for (const r of PLAN_JSON_SCOPE) {
      const lossy = r.status === "partial" || r.status === "dropped";
      expect((r.dropped?.length ?? 0) > 0, r.form).toBe(lossy);
    }
    expect(new Set(PLAN_JSON_SCOPE.map((r) => r.form)).size).toBe(PLAN_JSON_SCOPE.length);
  });

  it("`place` stays dropped, and the ground and `floor` are in scope", () => {
    const status = (form: string): string | undefined => PLAN_JSON_SCOPE.find((r) => r.form === form)?.status;
    expect(status("component + place")).toBe("dropped");
    expect(status("room … floor <pattern>")).toBe("round-trips");
    expect(status("outdoor")).toBe("partial");
    expect(status("fence")).toBe("partial");
    expect(Object.keys(DROPPED_WORDS)).not.toContain("outdoor");
    expect(Object.keys(DROPPED_WORDS)).not.toContain("fence");
    expect(Object.keys(DROPPED_WORDS)).not.toContain("floor");
  });
});
