/**
 * `W_EXTERIOR_RING_OPEN` (issues #346 and #370): exterior walls that should enclose a room and do
 * not, read end by end (`src/analyze/open-shell.ts`), so a ring closing elsewhere hides nothing.
 * Measured on the file, fence and inline corpus of `docs/testing.md` § 5: 71 storeys hold an open
 * exterior wall, with 426 ends. 385 meet a wall, 21 are shell ends (the plans that fired before this
 * reading, and the straight walls no ring is made of, which still do not), 18 stand on no room and 2
 * are low (the `parapet` in `docs/language-reference.md`). No corpus plan builds an exterior wall off
 * a ring, so `test/fixtures/wall-closure/` holds each kind.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { DOOR_HEAD, describe, describeLevel, lint, lintCoverage } from "../src/index.js";
import { buildLintContext } from "../src/lint/context.js";
import { exteriorRingOpen, wallEndShort } from "../src/lint/rules/enclosure.js";
import { DEFAULT_RULESET } from "../src/lint/ruleset.js";

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

  it("a run standing free inside a building is not outermost, even along a room's edge", () => {
    // The L stands on room b's two sides, so only "outermost" can refuse it.
    const big = `  wall id=w exterior thickness 200 { (0,0) (12000,0) (12000,8000) (0,8000) close }`;
    const inner = `  wall id=g exterior thickness 200 { (3000,2000) (8000,2000) (8000,6000) }`;
    const b = `  room id=b at (3000,2000) size 5000x4000 label "B" uses bedroom`;
    expect(found(plan(`${big}\n${inner}\n${b}`))).toEqual([]);
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

suite("a ring closing elsewhere hides no gap", () => {
  const annex = `  wall id=p exterior thickness 200 { (6000,1000) (8000,1000) (8000,3000) (6000,3000) }
  room id=b at (6000,1000) size 2000x2000 label "Porch" uses storage`;
  const src = plan(`${OPEN}\n${ROOM}\n${annex}`);

  it("a closed annex off an open shell: the shell's gap is named as if the annex were not there", () => {
    const alone = plan(`${OPEN}\n${ROOM}`);
    expect(found(src).map((d) => d.message)).toEqual(found(alone).map((d) => d.message));
    expect(found(src)[0]?.message).toContain("1000 mm apart on the line x 0, y 0–1000");
    expect(found(src)[0]?.hints?.at(-1)).toBe('The wall is "w".');
  });

  it("the wall its hint quotes closes the shell, and the fixed plan is measured whole", () => {
    const stmt = /`(wall exterior [^`]+)`/.exec(found(src)[0]!.hints![0]!)![1]!;
    const fixed = plan(`${OPEN}\n  ${stmt}\n${ROOM}\n${annex}`);
    expect(found(fixed)).toEqual([]);
    // Two rings now share a wall: the figure's own refusal, no longer a porch passed off as the house.
    expect(totals(fixed).gross_internal_area_omitted).toBe("exterior-ring-subdivided");
    expect(totals(fixed).gross_internal_area_leaves_out).toBeUndefined();
  });

  it("a closed annex off a closed ring leaves nothing open", () => {
    expect(found(plan(`${CLOSED}\n${ROOM}\n${annex}`))).toEqual([]);
  });

  it("a shell in two walls, each built off the ring, is one gap between them", () => {
    const two = plan(`  wall id=x exterior thickness 200 { (6000,2000) (6000,0) (0,0) (0,1000) }
  wall id=y exterior thickness 200 { (6000,2000) (6000,4000) (0,4000) (0,2000) }
${ROOM}\n${annex}`);
    expect(found(two).map((d) => /on the line x (\d+), y (\S+),/.exec(d.message)?.slice(1))).toEqual([
      ["0", "1000–2000"],
    ]);
    expect(found(two)[0]?.hints?.at(-1)).toBe('The walls are "x" and "y".');
  });

  it("each gap is one rule's: a slit off a ring is W_WALL_END_SHORT's", () => {
    const slit = plan(`  wall id=w exterior thickness 200 { (6000,2000) (6000,0) (0,0) (0,3000) }
  wall id=z exterior thickness 200 { (6000,2000) (6000,4000) (0,4000) (0,3260) }
${ROOM}\n${annex}`);
    expect(count(slit, "W_WALL_END_SHORT")).toBe(1);
    expect(count(slit, CODE)).toBe(0);
    // The ring is still open, so what the figure leaves out does not depend on which rule spoke.
    expect(totals(slit).gross_internal_area_leaves_out).toEqual(["a"]);
  });
});

suite("telling a shell from what is not one", () => {
  const stub = (body: string): string => plan(`${CLOSED}\n${ROOM}\n${body}`);

  it("the last stretch decides, not the wall: a boundary wall carrying a shell's line past the corner", () => {
    const rest = `  wall id=r exterior thickness 200 { (6000,0) (6000,4000) (0,4000) (0,0) }`;
    expect(found(plan(`  wall id=n exterior thickness 200 { (0,0) (9000,0) }\n${rest}\n${ROOM}`))).toEqual([]);
    // Turning, so the one-line guard is not what keeps it out.
    const turning = `  wall id=n exterior thickness 200 { (0,0) (9000,0) (9000,5000) }`;
    expect(found(plan(`${turning}\n${rest}\n${ROOM}`))).toEqual([]);
  });

  it("past the wall that meets it a run is a garden wall, though it stands on a room before: its end pairs with nothing", () => {
    // The end at (7000,1500) is nearer the shell's end at (6000,1000) than the gap's other side is.
    const n = `  wall id=n exterior thickness 200 { (0,4000) (0,0) (9000,0) (9000,1500) (7000,1500) }`;
    const shell = `  wall id=r exterior thickness 200 { (6000,0) (6000,1000) }
  wall id=s exterior thickness 200 { (6000,3000) (6000,4000) (0,4000) }`;
    const ds = found(plan(`${n}\n${shell}\n${ROOM}`));
    expect(ds.map((d) => /stop (.+), centreline/.exec(d.message)?.[1])).toEqual([
      "2000 mm apart on the line x 6000, y 1000–3000",
    ]);
  });

  it("a garden wall built off a ring is silent, the same wall along a room left outside is not", () => {
    const garden = `  wall id=g exterior thickness 200 { (6000,0) (9000,0) (9000,4000) }`;
    expect(found(stub(garden))).toEqual([]);
    const carport = `  room id=c at (6000,0) size 3000x4000 label "Carport" uses garage`;
    expect(found(stub(`${garden}\n${carport}`))[0]?.message).toContain("a run stops at (9000, 4000)");
  });

  it("a straight wall built off a ring beside a room left outside is a lean-to, as one standing free is", () => {
    const lean = `  wall id=x exterior thickness 200 { (6000,0) (9000,0) }
  room id=c at (6000,0) size 3000x4000 label "Carport" uses garage`;
    expect(found(stub(lean))).toEqual([]);
    expect(totals(stub(lean)).gross_internal_area_leaves_out).toBeUndefined();
  });

  const parapet = `  wall id=q exterior thickness 100 height 1100 { (6000,0) (9000,0) (9000,4000) (7000,4000) }`;
  const terrace = (label: string, uses = ""): string =>
    `  room id=t at (6000,0) size 3000x4000 label "${label}"${uses}`;

  it("a wall lower than a door's head is no shell, one at it is", () => {
    const at = (h: number): string => parapet.replace("1100", String(h));
    expect(found(stub(`${parapet}\n${terrace("Lookout")}`))).toEqual([]);
    expect(found(stub(`${at(DOOR_HEAD - 1)}\n${terrace("Lookout")}`))).toEqual([]);
    expect(found(stub(`${at(DOOR_HEAD)}\n${terrace("Lookout")}`))).toHaveLength(1);
    const noHeight = parapet.replace(" height 1100", "");
    expect(found(stub(`${noHeight}\n${terrace("Lookout")}`))).toHaveLength(1);
  });

  it("a shell authored to the clear height, below its storey, is a shell", () => {
    const shell = OPEN.replace("thickness 200", "thickness 200 height 2700");
    expect(found(plan(`  height 3000\n${shell}\n${ROOM}`))).toHaveLength(1);
    const storeys = plan(`  height 3000
  level 0 {\n  ${CLOSED}\n  ${ROOM}\n  }
  level 1 height 3500 {\n  ${OPEN.replace("thickness 200", "thickness 200 height 3000")}\n  ${ROOM}\n  }`);
    expect(found(storeys).map((d) => d.level)).toEqual([1]);
  });

  it("a room named for a place outdoors has no shell", () => {
    const wall = parapet.replace(" height 1100", "");
    const outdoors = [
      "Roof terrace",
      "Balcony",
      "Sun deck",
      "Back yard",
      "Backyard",
      "Yard 2",
      "Patio",
      "Roof garden",
      "Veranda",
      "Forecourt",
      "Lawn",
      "Pool",
      "Driveway",
      "Loggia",
      "Carport",
    ];
    for (const label of outdoors) expect(found(stub(`${wall}\n${terrace(label)}`)), label).toEqual([]);
    const alone = terrace("Terrace").replace("(6000,0)", "(0,0)");
    expect(found(plan(`  wall id=q exterior thickness 100 { (0,4000) (0,0) (6000,0) (6000,4000) }\n${alone}`))).toEqual(
      [],
    );
  });

  it("the word must be the label's head: what is built in a garden has its own enclosure", () => {
    const wall = parapet.replace(" height 1100", "");
    for (const label of ["Garden shed", "Pool house", "Yardley", "Decker", "Porch", "Terrasse", "Bin store"])
      expect(found(stub(`${wall}\n${terrace(label)}`)), label).toHaveLength(1);
  });

  it("with no label the id is read, as a room's use is", () => {
    const wall = parapet.replace(" height 1100", "");
    expect(found(stub(`${wall}\n  room id=terrace at (6000,0) size 3000x4000`))).toEqual([]);
    expect(found(stub(`${wall}\n  room id=t at (6000,0) size 3000x4000`))).toHaveLength(1);
  });

  it("an authored use wins over the label", () => {
    const wall = parapet.replace(" height 1100", "");
    expect(found(stub(`${wall}\n${terrace("Winter terrace", " uses living")}`))).toHaveLength(1);
    expect(found(stub(`${wall}\n${terrace("Carport", " uses garage")}`))).toHaveLength(1);
  });

  it("a closed core standing inside a room encloses the core, not the room, wherever it stands", () => {
    for (const [x, y] of [
      [2000, 1500],
      [500, 500],
      [3500, 2500],
    ] as const) {
      const core = `  wall id=core exterior thickness 200 { (${x},${y}) (${x + 2000},${y}) (${x + 2000},${y + 1000}) (${x},${y + 1000}) close }`;
      const src = plan(`${OPEN}\n${core}\n${ROOM}`);
      expect(
        found(src).map((d) => d.message),
        `core at ${x},${y}`,
      ).toEqual(found(plan(`${OPEN}\n${ROOM}`)).map((d) => d.message));
      expect(totals(src).gross_internal_area_leaves_out, `core at ${x},${y}`).toEqual(["a"]);
    }
  });

  it("a ring over part of a room puts that part in the figure and lists the room", () => {
    const src = plan(`${OPEN}\n  wall id=p exterior thickness 200 { (4000,0) (4000,4000) }\n${ROOM}`);
    expect(found(src).map((d) => /stop (.+), centreline/.exec(d.message)?.[1])).toEqual([
      "1000 mm apart on the line x 0, y 0–1000",
    ]);
    // The hole: 1800 × 3800 mm between the faces of the walls at x 4000 and x 6000.
    expect(totals(src).gross_internal_area_m2).toBe(6.84);
    expect(totals(src).gross_internal_area_leaves_out).toEqual(["a"]);
  });

  it("a room drawn a little past a ring's wall is not outside it", () => {
    const open = `  wall id=x exterior thickness 200 { (10000,0) (16000,0) (16000,4000) (10000,4000) (10000,1000) }
  room id=b at (10000,0) size 6000x4000 label "B" uses living`;
    // 20 mm past the wall's outer face along 4000 mm: 0.08 m², under the figure W_ROOM_OUTSIDE_SHELL calls outside.
    const over = ROOM.replace("6000x4000", "6120x4000");
    expect(totals(plan(`${CLOSED}\n${over}\n${open}`)).gross_internal_area_leaves_out).toEqual(["b"]);
  });

  it("a fin off an open run is not a shell end: it no longer pairs with the shell's", () => {
    const src = plan(`  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) (0,1000) }
  wall id=fin exterior thickness 200 { (0,0) (-3000,0) (-3000,900) }
${ROOM}`);
    expect(found(src)).toHaveLength(1);
    expect(found(src)[0]?.message).toContain("a run stops at (0, 1000)");
  });

  it("a free-standing run inside a closed ring stands on no room left outside", () => {
    const src = plan(`${CLOSED}\n${ROOM}\n  wall id=g exterior thickness 200 { (0,1000) (3000,1000) (3000,3000) }`);
    expect(found(src)).toEqual([]);
  });

  const fixture = (name: string): string =>
    readFileSync(new URL(`./fixtures/wall-closure/${name}.arch`, import.meta.url), "utf8");

  it("the fixtures of a shell", () => {
    expect(found(fixture("annex-porch")).map((d) => /stop (.+), centreline/.exec(d.message)?.[1])).toEqual([
      "1000 mm apart on the line x 0, y 0–1000",
    ]);
    expect(totals(fixture("annex-porch")).gross_internal_area_leaves_out).toEqual(["a", "b"]);
    expect(found(fixture("annex-garage")).map((d) => /stop (.+), centreline/.exec(d.message)?.[1])).toEqual([
      "1500 mm apart on the line y 0, x 2500–4000",
    ]);
    expect(totals(fixture("annex-garage")).gross_internal_area_leaves_out).toEqual(["a"]);
  });

  it.each([
    ["not-garden-wall"],
    ["not-boundary-wall"],
    ["not-fence"],
    ["not-parapet"],
    ["not-roof-terrace"],
    ["not-free-standing"],
  ])("%s: nothing fires, and the figure is the building's", (name) => {
    const src = fixture(name);
    expect(found(src)).toEqual([]);
    expect(totals(src).gross_internal_area_m2).toBeGreaterThan(25);
    expect(totals(src).gross_internal_area_leaves_out).toBeUndefined();
  });

  it("each kept-out fixture's control: what holds it is the clause it names", () => {
    expect(found(fixture("not-parapet").replace(" height 1100", ""))).toHaveLength(1);
    expect(found(fixture("not-parapet").replace(" height 1100", " height 2100"))).toHaveLength(1);
    expect(found(fixture("not-roof-terrace").replace('label "Roof terrace"', 'label "Lookout"'))).toHaveLength(1);
    // The garden wall along a room left outside is a run standing on it.
    const room = `  room id=z at (8000,2500) size 3000x4500 label "Shed" uses storage\n`;
    expect(found(fixture("not-garden-wall").replace(/\}\n$/, `${room}}\n`))).toHaveLength(1);
  });
});

suite("what the gross internal area leaves out", () => {
  const second = `  wall id=x exterior thickness 200 { (10000,0) (16000,0) (16000,4000) (10000,4000) (10000,1000) }
  room id=b at (10000,0) size 6000x4000 label "B" uses living`;
  const annex = `  wall id=p exterior thickness 200 { (6000,1000) (8000,1000) (8000,3000) (6000,3000) }
  room id=b at (6000,1000) size 2000x2000 label "Porch" uses storage`;

  it("names the rooms an open shell leaves outside, beside the figure of the ring that closes", () => {
    const t = totals(plan(`${OPEN}\n${ROOM}\n${annex}`));
    expect(t.gross_internal_area_m2).toBe(3.24);
    expect(t.gross_internal_area_leaves_out).toEqual(["a"]);
    expect(t.gross_internal_area_all_levels_leaves_out).toEqual([{ rooms: ["a"] }]);
  });

  it("names an open building beside a closed one", () => {
    const t = totals(plan(`${CLOSED}\n${ROOM}\n${second}`));
    expect(t.gross_internal_area_m2).toBe(22.04);
    expect(t.gross_internal_area_leaves_out).toEqual(["b"]);
  });

  it("does not name a room open to the sky, or a room inside the ring", () => {
    const t = totals(plan(`${OPEN}\n${ROOM}\n${annex}\n  room id=y at (9000,0) size 3000x3000 label "Yard"`));
    expect(t.gross_internal_area_leaves_out).toEqual(["a"]);
  });

  it("is absent where the figure is the whole building, and where there is no figure", () => {
    for (const src of [plan(`${CLOSED}\n${ROOM}`), plan(`${OPEN}\n${ROOM}`), plan(ROOM)]) {
      const t = totals(src);
      expect(t.gross_internal_area_leaves_out).toBeUndefined();
      expect(t.gross_internal_area_all_levels_leaves_out).toBeUndefined();
    }
  });

  it("is absent beside a lean-to, which the rule does not call a shell", () => {
    const lean = `  room id=c at (8000,0) size 3000x4000 label "Carport" uses garage
  wall id=x exterior thickness 200 { (8000,0) (11000,0) }`;
    expect(totals(plan(`${CLOSED}\n${ROOM}\n${lean}`)).gross_internal_area_leaves_out).toBeUndefined();
  });

  const storeys = plan(`  level 0 {\n  ${CLOSED}\n  ${ROOM}\n  }\n  level 1 {\n  ${OPEN}\n  ${ROOM}\n  ${annex}\n  }`);

  it("each storey says its own, and the building's figure says which storey", () => {
    const s = describe(storeys);
    expect(s.totals.gross_internal_area_leaves_out).toBeUndefined();
    expect(s.levels?.map((l) => l.totals.gross_internal_area_leaves_out)).toEqual([undefined, ["a"]]);
    expect(s.totals.gross_internal_area_all_levels_m2).toBe(25.28);
    expect(s.totals.gross_internal_area_all_levels_leaves_out).toEqual([{ level: 1, rooms: ["a"] }]);
  });

  it("narrowed to one storey, it says that storey's and no building's", () => {
    const s = describe(storeys);
    expect(describeLevel(s, 1).totals.gross_internal_area_leaves_out).toEqual(["a"]);
    expect(describeLevel(s, 0).totals.gross_internal_area_leaves_out).toBeUndefined();
    expect(describeLevel(s, 1).totals.gross_internal_area_all_levels_leaves_out).toBeUndefined();
  });

  it("the key follows the figure, so a summary carries one of the figure and its omission", () => {
    const keys = Object.keys(totals(plan(`${OPEN}\n${ROOM}\n${annex}`))).filter((k) => k.startsWith("gross"));
    expect(keys).toEqual([
      "gross_internal_area_m2",
      "gross_internal_area_all_levels_m2",
      "gross_internal_area_all_levels_leaves_out",
      "gross_internal_area_leaves_out",
    ]);
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

  it("a straight run's own two ends are its length, never a gap, even when they are the nearest pair", () => {
    // The short south wall's ends stand 2000 mm apart; the nearest ends it can pair with are 4472 mm off.
    const src = plan(`  wall id=n exterior thickness 200 { (0,0) (6000,0) }
  wall id=s exterior thickness 200 { (2000,4000) (4000,4000) }
${ROOM}`);
    const ds = found(src);
    expect(ds).toHaveLength(2);
    for (const d of ds) expect(d.message).toContain("4472 mm apart from (");
  });

  it("a straight run beside a shell closed in another category has nothing to pair with: not a gap", () => {
    const u = `  wall id=u exterior thickness 200 { (0,4000) (0,0) (6000,0) (6000,4000) }`;
    const last = `  wall id=p partition thickness 100 { (0,4000) (6000,4000) }`;
    const lean = `  room id=c at (8000,0) size 3000x4000 label "Lean-to" uses storage
  wall id=x exterior thickness 200 { (8000,0) (11000,0) }`;
    expect(found(plan(`${u}\n${last}\n${ROOM}\n${lean}`))).toEqual([]);
  });

  const mouth = `  wall id=u exterior thickness 200 { (0,4000) (0,0) (6000,0) (6000,4000) }`;

  it("a straight wall standing past a shell's mouth has no gap to it: the shell's own gap is named", () => {
    const src = plan(`${mouth}
  wall id=x exterior thickness 200 { (8000,4000) (11000,4000) }
${ROOM}
  room id=c at (8000,0) size 3000x4000 label "Carport" uses garage`);
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.message).toContain("6000 mm apart on the line y 4000, x 0–6000");
    expect(ds[0]?.hints?.[0]).toContain("wall exterior thickness 200 { (0,4000) (6000,4000) }");
    expect(ds[0]?.hints?.at(-1)).toBe('The wall is "u".');
  });

  it("a straight wall standing in a shell's mouth leaves a gap each side of it", () => {
    const src = plan(`${mouth}\n  wall id=x exterior thickness 200 { (1000,4000) (5000,4000) }\n${ROOM}`);
    expect(found(src).map((d) => /on the line y 4000, x (\S+),/.exec(d.message)?.[1])).toEqual(["0–1000", "5000–6000"]);
  });

  it("a lone end is named alone, not paired with a straight wall past the shell", () => {
    const src = plan(`  wall id=u exterior thickness 200 { (0,0) (6000,0) (6000,4000) (2000,4000) }
  wall id=p partition thickness 100 { (2000,4000) (0,4000) }
  wall id=x exterior thickness 200 { (8000,0) (11000,0) }
${ROOM}
  room id=c at (8000,0) size 3000x4000 label "Lean-to" uses storage`);
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.message).toContain("a run stops at (0, 0) with no wall to meet there");
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

  it("the annex's reading crosses a turn or a mirror: the same gap, the same rooms left out", () => {
    const annex = `  wall id=p exterior thickness 200 { (6000,1000) (8000,1000) (8000,3000) (6000,3000) }
  room id=b at (6000,1000) size 2000x2000 label "Porch" uses storage`;
    const body = `  component wing() {\n  ${OPEN}\n  ${ROOM}\n  ${annex}\n  }\n`;
    for (const placement of ["", " rotate 90", " rotate 180", " rotate 270", " mirror x", " mirror y"]) {
      const src = `plan "P" {\n  units mm\n${body}  place wing() as g at (0,0)${placement}\n}\n`;
      const ds = found(src);
      expect(ds, placement).toHaveLength(1);
      expect(ds[0]?.message, placement).toContain("1000 mm apart");
      expect(totals(src).gross_internal_area_leaves_out, placement).toEqual(["g.a"]);
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

  it("the rule's own count is charged before it walks them, each end's nine stations and every pair", () => {
    // 280 free-standing Ls leave 560 open ends on 560 segments, all of them exterior and open. `under`:
    // (560·9 + 4) × 560 + 560² + 2 × 560 × 560 is 3 765 440. `near` adds 50 partitions, 610 segments, for
    // 4 017 640: past MAX_GROSS_AREA_TESTS only because each END walks its wall's segments (once per
    // segment it would come to 3 704 040). `over` adds 100, 660 segments, for 4 269 840: at one test per
    // end it would stay under, so the stations are counted.
    const ells = Array.from({ length: 280 }, (_, i) => {
      const x = i * 3000;
      return `  wall exterior thickness 200 { (${x},0) (${x + 1000},0) (${x + 1000},1000) }`;
    }).join("\n");
    const rest = Array.from(
      { length: 100 },
      (_, i) => `  wall partition thickness 100 { (${i * 3000},9000) (${i * 3000 + 1000},9000) }`,
    );
    const room = `  room id=a at (0,0) size 1000x1000 label "A" uses living`;
    const under = plan(`${ells}\n${room}`);
    const near = plan(`${ells}\n${rest.slice(0, 50).join("\n")}\n${room}`);
    const over = plan(`${ells}\n${rest.join("\n")}\n${room}`);
    expect(() => lint(over)).not.toThrow();
    expect(found(under).length).toBeGreaterThan(0);
    expect(budgetSkips(under)).toEqual([]);
    expect(budgetSkips(near)).toEqual([["enclosure-budget", "point-tests"]]);
    expect(found(over)).toEqual([]);
    expect(budgetSkips(over)).toEqual([["enclosure-budget", "point-tests"]]);
  }, 60_000);

  it("the slit scan runs once for a context, whichever of its two rules reads it", () => {
    let reads = 0;
    const rules = {
      ...DEFAULT_RULESET,
      get wallGapMm(): number | null {
        reads++;
        return DEFAULT_RULESET.wallGapMm;
      },
    };
    const ctx = buildLintContext(resolvePlan(splitRing(250), {}).ir!, rules);
    expect(wallEndShort.check(ctx)).toHaveLength(1);
    expect(reads).toBe(1);
    expect(exteriorRingOpen.check(ctx)).toEqual([]);
    expect(reads).toBe(1);
  });
});

suite("the corpus", () => {
  it("the open-ring fixture fires, once, on its east side", () => {
    const src = readFileSync(new URL("./fixtures/wall-closure/open-ring.arch", import.meta.url), "utf8");
    const ds = found(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]?.message).toContain("1000 mm apart on the line x 8000, y 2000–3000");
  });
});
