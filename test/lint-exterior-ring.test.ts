/**
 * `W_EXTERIOR_RING_OPEN` (card H1, issues #346 and #370): exterior walls that stand on a room and
 * close nothing, on the gross internal area's own reading (`openExteriorRuns`,
 * `src/analyze/gross-area.ts`). Every case here is one the corpus does not hold: of the 631 storeys
 * measured for the card, one fires (`test/fixtures/wall-closure/open-ring.arch`) and one has a
 * free-standing exterior run beside a room (the `parapet` in `docs/language-reference.md`).
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe, lint, lintCoverage } from "../src/index.js";

const CODE = "W_EXTERIOR_RING_OPEN";
const plan = (body: string): string => `plan "P" {\n  units mm\n${body}\n}\n`;
const found = (src: string, opts: Parameters<typeof lint>[1] = {}) => lint(src, opts).filter((d) => d.code === CODE);
const count = (src: string, code: string, opts: Parameters<typeof lint>[1] = {}): number =>
  lint(src, opts).filter((d) => d.code === code).length;
const totals = (src: string): Record<string, unknown> =>
  (describe(src) as unknown as { totals: Record<string, unknown> }).totals;

const ROOM = `  room id=a at (0,0) size 6000x4000 label "A" uses living`;
const OPEN = `  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) (0,1000) }`;
const CLOSED = `  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }`;
const REPRO = plan(`${OPEN}\n${ROOM}\n  door on w at 3000 width 900 swing inward`);

suite("the reported plan (issue #370, a)", () => {
  it("names the gap in plain words, with no id in the message", () => {
    const [d, ...rest] = found(REPRO);
    expect(rest).toEqual([]);
    expect(d?.severity).toBe("warning");
    expect(d?.message).toBe(
      "The exterior walls do not close: their ends stop 1000 mm apart on the line x 0, y 0–1000, centreline to centreline. No wall joins them, so the shell encloses no floor and counts in no gross internal area.",
    );
    expect(d?.hints?.at(-1)).toBe('The wall is "w".');
    expect(d?.fixes).toBeUndefined();
    expect(REPRO.slice(d!.span!.start, d!.span!.end)).toContain("wall id=w exterior");
    expect(totals(REPRO).gross_internal_area_omitted).toBe("no-closed-exterior-ring");
  });

  it("the closed twin is silent and reports the area", () => {
    const src = plan(`${CLOSED}\n${ROOM}\n  door on w at 3000 width 900 swing inward`);
    expect(found(src)).toEqual([]);
    expect(totals(src).gross_internal_area_m2).toBe(22.04);
  });

  it("the wall its hint quotes closes the ring", () => {
    const stmt = /`(wall exterior [^`]+)`/.exec(found(REPRO)[0]!.hints![0]!)![1]!;
    expect(stmt).toBe("wall exterior thickness 200 { (0,0) (0,1000) }");
    const fixed = plan(`${OPEN}\n  ${stmt}\n${ROOM}\n  door on w at 3000 width 900 swing inward`);
    expect(found(fixed)).toEqual([]);
    expect(totals(fixed).gross_internal_area_m2).toBeGreaterThan(20);
  });

  it("an unnamed wall is named by no hint", () => {
    const src = plan(`  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) (0,1000) }\n${ROOM}`);
    const [d] = found(src);
    expect(d?.hints?.join(" ")).not.toMatch(/The walls? (is|are) "/);
  });
});

suite("what it never judges", () => {
  it("a plan with no exterior wall at all", () => {
    expect(found(plan(`${ROOM}\n  door at (3000,0) width 900`))).toEqual([]);
    const partitions = `  wall id=w partition thickness 100 { (0,0) (6000,0) (6000,4000) (0,4000) (0,1000) }`;
    expect(found(plan(`${partitions}\n${ROOM}`))).toEqual([]);
  });

  it("a storey with no room: nothing says the wall is a shell", () => {
    expect(found(plan(OPEN))).toEqual([]);
  });

  it("a run that stands on no room is a garden wall", () => {
    const garden = `  wall id=g exterior thickness 200 { (9000,0) (12000,0) (12000,3000) }`;
    expect(found(plan(`${ROOM}\n${garden}`))).toEqual([]);
    expect(found(plan(`${CLOSED}\n${ROOM}\n${garden}`))).toEqual([]);
  });

  it("a wall that only touches a room's corner stands on no room", () => {
    expect(found(plan(`${ROOM}\n  wall id=g exterior thickness 200 { (6000,4000) (9000,4000) (9000,7000) }`))).toEqual(
      [],
    );
  });

  it("runs on one straight line are no ring", () => {
    const north = `  wall id=n exterior thickness 200 { (0,0) (6000,0) }`;
    expect(found(plan(`${north}\n${ROOM}`))).toEqual([]);
    const split = `  wall id=n exterior thickness 200 { (0,0) (2000,0) }\n  wall id=m exterior thickness 200 { (3000,0) (6000,0) }`;
    expect(found(plan(`${split}\n${ROOM}`))).toEqual([]);
  });

  it("a closed ring with a garden wall built off it encloses floor", () => {
    const stub = `  wall id=g exterior thickness 200 { (6000,2000) (9000,2000) (9000,6000) }`;
    const src = plan(`${CLOSED}\n${stub}\n${ROOM}`);
    expect(found(src)).toEqual([]);
    expect(totals(src).gross_internal_area_m2).toBe(22.04);
  });

  it("a run standing free inside a closed building", () => {
    const fin = `  wall id=g exterior thickness 200 { (2000,1000) (4000,1000) (4000,3000) }`;
    expect(found(plan(`${CLOSED}\n${fin}\n${ROOM}`))).toEqual([]);
  });

  it("a shell finished in another category is closed: nothing is open there", () => {
    const u = `  wall id=u exterior thickness 200 { (0,4000) (0,0) (6000,0) (6000,4000) }`;
    const last = `  wall id=party party thickness 200 { (0,4000) (6000,4000) }`;
    const src = plan(`${u}\n${last}\n${ROOM}`);
    expect(found(src)).toEqual([]);
    // The figure still reads no exterior ring: that omission is about the category, not a gap.
    expect(totals(src).gross_internal_area_omitted).toBe("no-closed-exterior-ring");
    const partition = `  wall id=p partition thickness 100 { (0,4000) (6000,4000) }`;
    expect(found(plan(`${u}\n${partition}\n${ROOM}`))).toEqual([]);
  });

  it("`walls from rooms` and `wall … around` close by construction", () => {
    const rooms = `${ROOM}\n  room id=b at (6000,0) size 3000x4000 label "B" uses bedroom`;
    expect(found(plan(`${rooms}\n  walls from rooms exterior 200 partition 100`))).toEqual([]);
    expect(found(plan(`${rooms}\n  wall id=s exterior thickness 200 around [a b]`))).toEqual([]);
  });

  it("every wall derived and demolished leaves no exterior wall to judge", () => {
    const src = plan(`${ROOM}\n  walls from rooms exterior 200 partition 100 status demolish`);
    expect(found(src)).toEqual([]);
  });
});

/** The ring split into two walls with `gap` mm of centreline between their ends on the east side. */
const splitRing = (gap: number): string =>
  plan(`  wall id=n exterior thickness 200 { (0,0) (6000,0) (6000,2000) }
  wall id=s exterior thickness 200 { (6000,${2000 + gap}) (6000,8000) (0,8000) (0,0) }
  room id=a at (0,0) size 6000x8000 label "A" uses living`);

suite("one gap, one rule: W_WALL_END_SHORT keeps what it reports", () => {
  it("each gap is reported by exactly one of the two rules, at the wallGapMm boundary too", () => {
    // Caps 100 mm each: a 201 mm gap is a 1 mm slit, a 300 mm gap the default 100 mm slit.
    const want: Array<[number, string]> = [
      [201, "W_WALL_END_SHORT"],
      [250, "W_WALL_END_SHORT"],
      [300, "W_WALL_END_SHORT"],
      [301, CODE],
      [302, CODE],
      [400, CODE],
      [1000, CODE],
    ];
    for (const [gap, code] of want) {
      const src = splitRing(gap);
      const hits = lint(src)
        .map((d) => d.code)
        .filter((c) => c === CODE || c === "W_WALL_END_SHORT");
      expect(hits, `gap ${gap}`).toEqual([code]);
    }
  });

  it("caps that meet close the ring: neither rule speaks", () => {
    for (const gap of [0, 100, 200]) {
      const src = splitRing(gap);
      expect(count(src, CODE), `gap ${gap}`).toBe(0);
      expect(count(src, "W_WALL_END_SHORT"), `gap ${gap}`).toBe(0);
      expect(totals(src).gross_internal_area_m2).toBeGreaterThan(40);
    }
  });

  it("wallGapMm moves the line between them; null hands the slit to this rule", () => {
    expect(count(splitRing(350), CODE)).toBe(1);
    expect(count(splitRing(350), CODE, { ruleset: { wallGapMm: 200 } })).toBe(0);
    expect(count(splitRing(350), "W_WALL_END_SHORT", { ruleset: { wallGapMm: 200 } })).toBe(1);
    expect(count(splitRing(250), CODE, { ruleset: { wallGapMm: null } })).toBe(1);
    expect(count(splitRing(250), "W_WALL_END_SHORT", { ruleset: { wallGapMm: null } })).toBe(0);
  });

  it("a wall ending short of itself is no W_WALL_END_SHORT, so this rule names it", () => {
    const src = plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) (0,230) }\n${ROOM}`);
    expect(count(src, "W_WALL_END_SHORT")).toBe(0);
    expect(found(src)[0]?.message).toContain("230 mm apart");
  });

  it("an end stopping short of a partition is that rule's: the ring's one gap is not reported twice", () => {
    const src = plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (230,4000) }
  wall id=p partition thickness 100 { (0,4000) (0,0) }
${ROOM}`);
    expect(count(src, "W_WALL_END_SHORT")).toBe(1);
    expect(count(src, CODE)).toBe(0);
  });
});

suite("curves", () => {
  const bowed = `{ (0,0) (6000,0) arc (6000,4000) radius 3000 (0,4000) (0,1000) }`;

  it("a gap in a shell with a curved side", () => {
    const src = plan(`  wall id=w exterior thickness 200 ${bowed}\n${ROOM}`);
    expect(found(src)).toHaveLength(1);
    expect(found(src)[0]?.message).toContain("1000 mm apart on the line x 0");
  });

  it("its closed twin is silent", () => {
    const closed = bowed.replace("(0,1000) }", "close }");
    expect(found(plan(`  wall id=w exterior thickness 200 ${closed}\n${ROOM}`))).toEqual([]);
  });

  it("a gap at a curved end, which W_WALL_END_SHORT does not judge", () => {
    const src =
      plan(`  wall id=w exterior thickness 200 { (0,3000) (0,0) (6000,0) (6000,2000) arc (4000,4000) radius 2000 }
${ROOM}`);
    expect(count(src, "W_WALL_END_SHORT")).toBe(0);
    expect(found(src)).toHaveLength(1);
    // Not axis-aligned: no wall statement is offered for a diagonal.
    expect(found(src)[0]?.hints?.[0]).toBe("Carry the walls on until their ends meet.");
  });

  it("a half drum round a circle room, read by the curve, not its chord", () => {
    const src = plan(`  wall id=d exterior thickness 200 { (0,3000) arc (6000,3000) radius 3000 }
  room id=c circle at (3000,3000) radius 3000 label "Drum" uses living`);
    expect(found(src)).toHaveLength(1);
  });

  it("a whole drum is closed", () => {
    const src =
      plan(`  wall id=d exterior thickness 200 { (0,3000) arc (6000,3000) radius 3000 arc (0,3000) radius 3000 close }
  room id=c circle at (3000,3000) radius 3000 label "Drum" uses living`);
    expect(found(src)).toEqual([]);
  });
});

suite("storeys and buildings", () => {
  it("names the one storey left open, tagged with its level", () => {
    const src = plan(`  level 0 {\n  ${CLOSED}\n  ${ROOM}\n  }\n  level 1 {\n  ${OPEN}\n  ${ROOM}\n  }`);
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.level).toBe(1);
    expect(ds[0]?.message).toContain("centreline to centreline on level 1.");
  });

  it("a single `level` block names no storey", () => {
    const src = plan(`  level 0 {\n  ${OPEN}\n  ${ROOM}\n  }`);
    expect(found(src)[0]?.message).not.toContain("on level");
  });

  it("a shell open on every storey is reported on each", () => {
    const src = plan(`  level 0 {\n  ${OPEN}\n  ${ROOM}\n  }\n  level 1 {\n  ${OPEN}\n  ${ROOM}\n  }`);
    expect(found(src).map((d) => d.level)).toEqual([0, 1]);
  });

  const second = `  wall id=x exterior thickness 200 { (10000,0) (16000,0) (16000,4000) (10000,4000) (10000,1000) }
  room id=b at (10000,0) size 6000x4000 label "B" uses living`;

  it("an open building beside a closed one, which the area's figure leaves out", () => {
    const src = plan(`${CLOSED}\n${ROOM}\n${second}`);
    expect(totals(src).gross_internal_area_m2).toBe(22.04);
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.message).toContain("on the line x 10000, y 0–1000");
    expect(ds[0]?.hints?.at(-1)).toBe('The wall is "x".');
  });

  it("two open buildings are two findings, in source order", () => {
    const ds = found(plan(`${OPEN}\n${ROOM}\n${second}`));
    expect(ds.map((d) => /on the line x (\d+)/.exec(d.message)?.[1])).toEqual(["0", "10000"]);
  });

  it("a straight wall beside a room outside the ring is a lean-to, an L an open building", () => {
    const carport = `  room id=c at (8000,0) size 3000x4000 label "Carport" uses garage`;
    const straight = `  wall id=x exterior thickness 200 { (8000,0) (11000,0) }`;
    expect(found(plan(`${CLOSED}\n${ROOM}\n${carport}\n${straight}`))).toEqual([]);
    const ell = `  wall id=x exterior thickness 200 { (8000,0) (11000,0) (11000,4000) }`;
    expect(found(plan(`${CLOSED}\n${ROOM}\n${carport}\n${ell}`))).toHaveLength(1);
  });
});

suite("`status demolish`", () => {
  const rest = `  wall id=w exterior thickness 200 { (0,2000) (0,4000) (6000,4000) (6000,0) (0,0) }`;

  it("a demolished wall closes nothing: the proposed shell is open", () => {
    const src = plan(`${rest}\n  wall id=x exterior thickness 200 status demolish { (0,0) (0,2000) }\n${ROOM}`);
    expect(totals(src).gross_internal_area_omitted).toBe("no-closed-exterior-ring");
    expect(found(src)).toHaveLength(1);
    expect(found(src)[0]?.message).toContain("2000 mm apart on the line x 0, y 0–2000");
  });

  it("the wall that replaces it does", () => {
    const src = plan(`${rest}
  wall id=x exterior thickness 200 status demolish { (0,0) (0,2000) }
  wall id=y exterior thickness 200 status new { (0,0) (0,2000) }
${ROOM}`);
    expect(found(src)).toEqual([]);
  });

  it("a demolished partition leaves a closed shell closed", () => {
    const src = plan(
      `${CLOSED}\n  wall id=x partition thickness 100 status demolish { (3000,0) (3000,4000) }\n${ROOM}`,
    );
    expect(found(src)).toEqual([]);
  });
});

suite("the shape of a gap", () => {
  it("a shell in two pieces has two gaps", () => {
    const src = plan(`  wall id=l1 exterior thickness 200 { (0,1500) (0,0) (6000,0) (6000,1500) }
  wall id=l2 exterior thickness 200 { (0,2500) (0,4000) (6000,4000) (6000,2500) }
${ROOM}`);
    expect(found(src).map((d) => /on the line x (\d+), y (\S+),/.exec(d.message)?.slice(1))).toEqual([
      ["0", "1500–2500"],
      ["6000", "1500–2500"],
    ]);
  });

  it("four straight walls short of every corner: the ends pair across runs, never along one", () => {
    const src = plan(`  wall id=n exterior thickness 200 { (1000,0) (5000,0) }
  wall id=e exterior thickness 200 { (6000,1000) (6000,3000) }
  wall id=s exterior thickness 200 { (5000,4000) (1000,4000) }
  wall id=w exterior thickness 200 { (0,3000) (0,1000) }
${ROOM}`);
    const ds = found(src);
    expect(ds).toHaveLength(4);
    for (const d of ds) expect(d.message).toContain("1414 mm apart from (");
  });

  it("a shell open across a whole side", () => {
    const src = plan(`  wall id=u exterior thickness 200 { (0,4000) (0,0) (6000,0) (6000,4000) }\n${ROOM}`);
    expect(found(src)[0]?.message).toContain("6000 mm apart on the line y 4000, x 0–6000");
  });

  it("a fin off the run does not add a finding of its own", () => {
    const src = plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) (0,1000) }
  wall id=fin exterior thickness 200 { (6000,2000) (9000,2000) }
${ROOM}`);
    expect(found(src)).toHaveLength(1);
    expect(found(src)[0]?.message).toContain("1000 mm apart on the line x 0");
  });

  it("an end with no other end to pair it is named alone", () => {
    const src = plan(`  wall id=u exterior thickness 200 { (0,0) (6000,0) (6000,4000) (2000,4000) }
  wall id=p partition thickness 100 { (2000,4000) (0,4000) }
${ROOM}`);
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.message).toContain("a run stops at (0, 0) with no wall to meet there");
    expect(ds[0]?.hints?.[0]).toBe("Carry the wall on until it meets another wall.");
  });
});

suite("`place`", () => {
  it("is judged in the plan's frame, turned or mirrored", () => {
    const body = `  component wing() {\n  ${OPEN}\n  ${ROOM}\n  }\n`;
    const want: Array<[string, string]> = [
      ["", "on the line x 0, y 0–1000"],
      [" rotate 180", "on the line x 0, y -1000–0"],
      [" mirror x", "on the line x"],
      [" rotate 90", "on the line y"],
      [" rotate 270", "on the line y"],
    ];
    for (const [placement, words] of want) {
      const src = `plan "P" {\n  units mm\n${body}  place wing() as g at (0,0)${placement}\n}\n`;
      const ds = found(src);
      expect(ds, placement).toHaveLength(1);
      expect(ds[0]?.message, placement).toContain(words);
      expect(ds[0]?.message, placement).toContain("1000 mm apart");
    }
  });
});

suite("the budget: counted, charged first, refused in words", () => {
  /** One open run of `n` short walls round three sides of a room. */
  const zigzag = (n: number): string => {
    const pts = Array.from({ length: n + 1 }, (_, i) => `(${i * 10},${i % 2 === 0 ? 0 : 10})`).join(" ");
    return plan(`  wall id=w exterior thickness 4 { ${pts} (${n * 10},4000) (0,4000) (0,2000) }
  room id=a at (0,0) size ${n * 10}x4000 label "A" uses living`);
  };

  const budgetSkips = (src: string): Array<[string, string | undefined]> =>
    (lintCoverage(src)?.families.find((f) => f.family === "enclosure")?.skipped ?? [])
      .filter((s) => s.reason === "enclosure-budget")
      .map((s) => [s.reason, s.cap]);

  it("past the segment count the storey is filed as a skip, never a throw", () => {
    const src = zigzag(2100);
    expect(() => lint(src)).not.toThrow();
    expect(found(src)).toEqual([]);
    expect(budgetSkips(src)).toEqual([["enclosure-budget", "regions"]]);
  });

  it("the same plan under the count is measured: the refusal is the count's", () => {
    expect(found(zigzag(400))).toHaveLength(1);
    expect(budgetSkips(zigzag(400))).toEqual([]);
  });

  it("the rule's own count, every open wall's ends against every segment, is charged before it walks them", () => {
    // The 600 free-standing Ls stay under the shell's caps; (2·600 + 4) × (1200 + 2200) segments is
    // past MAX_GROSS_AREA_TESTS. `over` is `under` plus partitions, so only that count can silence it.
    const ells = Array.from({ length: 600 }, (_, i) => {
      const x = i * 3000;
      return `  wall exterior thickness 200 { (${x},0) (${x + 1000},0) (${x + 1000},1000) }`;
    }).join("\n");
    const rest = Array.from(
      { length: 2200 },
      (_, i) => `  wall partition thickness 100 { (${i * 3000},9000) (${i * 3000 + 1000},9000) }`,
    );
    const room = `  room id=a at (0,0) size 1000x1000 label "A" uses living`;
    const under = plan(`${ells}\n${room}`);
    const over = plan(`${ells}\n${rest.join("\n")}\n${room}`);
    expect(() => lint(over)).not.toThrow();
    expect(found(under).length).toBeGreaterThan(0);
    expect(found(over)).toEqual([]);
    expect(budgetSkips(over)).toContainEqual(["enclosure-budget", "regions"]);
  }, 60_000);
});

suite("the corpus", () => {
  it("the open-ring fixture fires, once, on its east side", () => {
    const src = readFileSync(new URL("./fixtures/wall-closure/open-ring.arch", import.meta.url), "utf8");
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.message).toContain("1000 mm apart on the line x 8000, y 2000–3000");
  });
});
