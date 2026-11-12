/**
 * `level … slab <mm>`, `level … clear <mm>` and `height <mm> clear <mm>` (RM6.1: MF-D1, RM-D17): what
 * each storey's `describe().heights` reports, the refusals and the warning, the words as names, the
 * printer, and Plan JSON's `dropped` rows. The byte-identity law is `test/slab-clear-byte-identity.test.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint } from "../src/index.js";
import { planToJson } from "../src/plan-json.js";
import { ROOT } from "./helpers/rectilinear-rooms-law.js";

const SHELL = `    wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
    room id=a at (0,0) size 6000x4000 label "Hall" uses hall`;
const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;
const level = (head: string): string => `  level ${head} {\n${SHELL}\n  }`;

type Heights = Record<string, unknown>;
/** Each storey's `heights` block without its walls, lowest storey first. */
const heightsOf = (src: string): Heights[] => {
  const d = describe(src) as unknown as { heights?: Heights; levels?: { heights?: Heights }[] };
  const blocks = d.levels ? d.levels.map((l) => l.heights) : [d.heights];
  return blocks.map((h) => {
    const { walls: _walls, ...rest } = h ?? {};
    return rest;
  });
};
const codesOf = (src: string): string[] => compile(src, { noCache: true }).diagnostics.map((d) => d.code ?? "");

suite("slab and clear: the heights each storey reports", () => {
  it("the fixture: derived below each written slab, authored on the top storey", () => {
    const src = readFileSync(join(ROOT, "test/fixtures/slab-clear/levels.arch"), "utf8");
    expect(codesOf(src)).toEqual([]);
    expect(heightsOf(src)).toEqual([
      { storey_height: 2510, elevation: 0, clear_height: 2190, clear_height_source: "derived" },
      { storey_height: 2750, elevation: 2510, slab: 320, clear_height: 2430, clear_height_source: "derived" },
      { storey_height: 2750, elevation: 5260, slab: 320, clear_height: 2340, clear_height_source: "authored" },
    ]);
  });

  it("a single-storey plan reports its `clear` as written, and none without one", () => {
    const src = readFileSync(join(ROOT, "test/fixtures/slab-clear/single.arch"), "utf8");
    expect(codesOf(src)).toEqual([]);
    expect(heightsOf(src)).toEqual([
      { storey_height: 2600, elevation: 0, clear_height: 2340, clear_height_source: "authored" },
    ]);
    // Without the clause the plan writes neither form: no clear-height key at all.
    expect(heightsOf(src.replace("height 2600 clear 2340", "height 2600"))).toEqual([
      { storey_height: 2600, elevation: 0 },
    ]);
  });

  it("every omitted reason, never a guess", () => {
    const src = plan(
      [
        level("1 height 3000"), // the storey above writes no slab
        level("2"), // its own height is the default 3000
        level("3 slab 300"), // the top storey writes no clear
      ].join("\n"),
    );
    expect(heightsOf(src).map((h) => h.clear_height_omitted)).toEqual([
      "no-slab-above",
      "default-storey-height",
      "top-storey",
    ]);
    expect(heightsOf(src).map((h) => h.slab)).toEqual([undefined, undefined, 300]);
    const thick = plan([level("1 height 3000"), level("2 slab 3000")].join("\n"));
    expect(heightsOf(thick)[0]!.clear_height_omitted).toBe("slab-above-too-thick");
    expect(heightsOf(plan(`  height 2700\n${SHELL}`))).toEqual([{ storey_height: 2700, elevation: 0 }]);
  });

  it("a plan-level binding feeds every clause, and nothing is drawn", () => {
    const src = plan(`  let s = 300\n  let h = 3000\n${level("1 height h clear h - s")}\n${level("2 slab s")}`);
    expect(codesOf(src)).toEqual([]);
    expect(heightsOf(src)[0]).toMatchObject({ clear_height: 2700, clear_height_source: "authored" });
    const bare = plan(`  let s = 300\n  let h = 3000\n${level("1 height h")}\n${level("2")}`);
    const a = compile(src, { noCache: true });
    const b = compile(bare, { noCache: true });
    expect(a.pages!.map((p) => p.svg)).toEqual(b.pages!.map((p) => p.svg));
  });
});

suite("slab and clear: refusals and the warning", () => {
  it("W_CLEAR_HEIGHT_MISMATCH when the written clear disagrees with the derived one; the written one stands", () => {
    const src = plan([level("1 height 3000 clear 2400"), level("2 slab 300")].join("\n"));
    const d = compile(src, { noCache: true }).diagnostics;
    expect(d.map((x) => [x.code, x.severity, x.level])).toEqual([["W_CLEAR_HEIGHT_MISMATCH", "warning", 1]]);
    expect(d[0]!.message).toContain("2700");
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("clear 2400");
    expect(heightsOf(src)[0]).toMatchObject({ clear_height: 2400, clear_height_source: "authored" });
    // Equal in whole millimetres: no warning.
    expect(codesOf(plan([level("1 height 3000 clear 2700.2"), level("2 slab 300")].join("\n")))).toEqual([]);
  });

  it("E_CLEAR_SCOPE on a multi-storey plan's height line", () => {
    const src = plan(`  height 3000 clear 2400\n${level("1")}`);
    const d = compile(src, { noCache: true }).diagnostics;
    expect(d.map((x) => x.code)).toEqual(["E_CLEAR_SCOPE"]);
    expect(src.slice(d[0]!.span!.start, d[0]!.span!.end)).toBe("clear 2400");
  });

  it("E_HEIGHT_RANGE on a slab or a clear of zero, below or above 100 m", () => {
    const src = plan([level("1 height 3000 slab 0 clear -5"), level("2 slab 200000")].join("\n"));
    expect(codesOf(src)).toEqual(["E_HEIGHT_RANGE", "E_HEIGHT_RANGE", "E_HEIGHT_RANGE"]);
    expect(codesOf(plan(`  height 2600 clear 0\n${SHELL}`))).toEqual(["E_HEIGHT_RANGE"]);
  });
});

suite("slab and clear: contextual words", () => {
  it("`slab`, `clear` and `look` stay names: bindings, ids, a reassignment and a macro after `height`", () => {
    const src = plan(
      `  let slab = 2800\n  let look = 1\n  component clear() {\n    room id=c at (6000,0) size 1000x1000\n  }\n` +
        `  height slab\n  clear()\n${SHELL}\n  room id=section at (7000,0) size 1000x1000`,
    );
    expect(codesOf(src)).toEqual([]);
    expect(heightsOf(src)).toEqual([{ storey_height: 2800, elevation: 0 }]);
  });

  it("`arch fmt` keeps the clauses in their order and is a fixed point", () => {
    const src = plan(`  height 2600 clear 2340\n${SHELL}`);
    const once = format(src);
    expect(once).toContain("height 2600 clear 2340");
    expect(format(once)).toBe(once);
    const multi = plan([level('1 "G" height 3000 slab 200 clear 2400'), level("2 slab 250")].join("\n"));
    const fm = format(multi);
    expect(fm).toContain('level 1 "G" height 3000 slab 200 clear 2400 {');
    expect(fm).toContain("level 2 slab 250 {");
    expect(format(fm)).toBe(fm);
  });
});

suite("slab and clear: Plan JSON says what it leaves out", () => {
  it("each `level` row carries its written clauses; a single storey's `clear` is its own row", () => {
    const src = plan([level('1 "G" height 3000 clear 2400'), level("2 slab 300")].join("\n"));
    expect(
      planToJson(src)
        .dropped?.filter((r) => r.clause === "level")
        .map((r) => r.text),
    ).toEqual(['level 1 "G" height 3000 clear 2400', "level 2 slab 300"]);
    // The whole header, as design §3.4 writes it, only on a plan that writes a `slab` or a `clear`.
    const plain = plan([level('1 "G" height 3000'), level("2")].join("\n"));
    expect(
      planToJson(plain)
        .dropped?.filter((r) => r.clause === "level")
        .map((r) => r.text),
    ).toEqual(['level 1 "G"', "level 2"]);
    const single = planToJson(plan(`  height 2600 clear 2340\n${SHELL}`)).dropped;
    expect(single).toEqual([{ clause: "clear height", count: 1, text: "clear 2340" }]);
    expect(planToJson(plan(`  height 2600\n${SHELL}`)).dropped).toBeUndefined();
  });
});

suite("slab and clear: each storey reads its own scope, and only describe() learns them", () => {
  it("the slab above is the number that storey resolved in its own scope (review S1)", () => {
    // Each storey binds its own `t`: the upper storey's `slab t` is 300 there, never the lower's 100.
    const src = plan(
      [
        `  level 1 height 2800 clear 2500 {\n    let t = 100\n${SHELL}\n  }`,
        `  level 2 height 3000 slab t {\n    let t = 300\n${SHELL}\n  }`,
      ].join("\n"),
    );
    expect(codesOf(src)).toEqual([]);
    const [lower, upper] = heightsOf(src);
    expect(upper).toMatchObject({ slab: 300 });
    expect(lower).toMatchObject({ clear_height: 2500, clear_height_source: "authored" });
    // Without the authored clear, the derived value is 2800 - 300, not 2800 - 100.
    expect(heightsOf(src.replace("height 2800 clear 2500", "height 2800"))[0]).toMatchObject({
      clear_height: 2500,
      clear_height_source: "derived",
    });
    // A written clear that disagrees with 2800 - 300 warns, quoting the upper storey's number.
    const off = compile(src.replace("clear 2500", "clear 2700"), { noCache: true }).diagnostics;
    expect(off.map((d) => d.code)).toEqual(["W_CLEAR_HEIGHT_MISMATCH"]);
    expect(off[0]!.message).toContain("`slab 300`");
  });

  it("a slab or a clear moves neither lint nor the Plan JSON document (review S2)", () => {
    // No `height` anywhere and a stair that is steep only against the 3000 default: the clauses must
    // not open the storey-height gate that lint, Plan JSON and the quantities read.
    const stair = "    stair id=st at (500,500) size 900x1500 dir up";
    const two = (head1: string, head2: string): string =>
      plan(`  level 1${head1} {\n${SHELL}\n${stair}\n  }\n  level 2${head2} {\n${SHELL}\n${stair}\n  }`);
    const base = two("", "");
    const doc = (src: string): string => {
      const j = planToJson(src);
      return JSON.stringify([j.json, j.pages]);
    };
    // The clause moves every later byte offset, so a finding is compared without its spans.
    const findings = (src: string): string => JSON.stringify(lint(src), (k, v) => (k === "span" ? undefined : v));
    expect(findings(base)).toContain("W_STAIR");
    for (const [h1, h2] of [
      ["", " slab 200"],
      [" clear 2400", ""],
    ] as const) {
      const src = two(h1, h2);
      expect(findings(src), `lint with "${h1}${h2}"`).toBe(findings(base));
      expect(doc(src), `Plan JSON with "${h1}${h2}"`).toBe(doc(base));
      // …and describe() does report them.
      expect(JSON.stringify(describe(src))).not.toBe(JSON.stringify(describe(base)));
    }
  });

  it("a clear height is printed and compared in whole millimetres", () => {
    expect(heightsOf(plan([level("1 height 3000.4"), level("2 slab 300")].join("\n")))[0]).toMatchObject({
      clear_height: 2700,
      clear_height_source: "derived",
    });
    const authored = plan([level("1 height 3000 clear 2700.4"), level("2 slab 300")].join("\n"));
    expect(codesOf(authored)).toEqual([]);
    expect(heightsOf(authored)[0]).toMatchObject({ clear_height: 2700 });
  });
});
