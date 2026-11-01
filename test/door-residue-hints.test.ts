/**
 * Two things a door was told that it could not use.
 *
 * `W_SWING_OBSTRUCTED`'s hints wrote `on <wall>` on a wall `walls from rooms` derived, which has no
 * id to name (ADR 0028 §3). A relational door is told its own clause and a hand-placed one its
 * point, and each statement a hint quotes is pasted back into its plan.
 *
 * `W_SWING_ROOM_NOT_ADJACENT` and `E_SWING_SIDE` followed every refused placement: a door with no
 * wall has no side to read, and the refusal is the report. A door that simply has no wall keeps both.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, lint } from "../src/index.js";

const plan = (body: string): string => `plan "p" {\n  units mm\n${body}}\n`;
const W = "  walls from rooms exterior 200 partition 100\n";
const ROOMS = "  room id=a at (0,0) size 4000x3000 uses living\n  room id=b at (4000,0) size 4000x3000 uses bedroom\n";
const ENTRY = "  door id=e on a.left at center width 900 swing into a\n";
const SOFA = "  furniture id=s sofa at (3400,1500) size 800x800\n";

const obstructed = (src: string) => lint(src).filter((d) => d.code === "W_SWING_OBSTRUCTED");
const errors = (src: string) => compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error");
/** The statement the hint gives for a door with no leaf. */
const pocketOf = (hints: readonly string[]): string => /`(door pocket [^`]+)`/.exec(hints.join(" "))![1]!;

suite("W_SWING_OBSTRUCTED: hints a plan can use", () => {
  const between = "door id=d between a and b at 1500 from start width 900 swing into a";

  it("a relational door is told its own clause, and the statement resolves and clears it", () => {
    const src = plan(`${ROOMS}${W}  ${between}\n${SOFA}${ENTRY}`);
    const [d] = obstructed(src);
    expect(d!.hints!.join(" ")).not.toContain("<wall>");
    expect(d!.hints).toContain(
      "Move the door along its wall (the position in `between a and b at 1500 from start`), or the obstruction — `archlang repair` computes the smallest clearing shift.",
    );
    const pocket = pocketOf(d!.hints!);
    expect(pocket).toBe("door pocket between a and b at 1500 from start width 900");
    const fixed = src.replace(between, `${pocket}`);
    expect(errors(fixed)).toEqual([]);
    expect(obstructed(fixed)).toEqual([]);
  });

  it("a door on a room's edge is told that clause", () => {
    const written = "door id=d on a.top at 1000 from start width 900 swing into a";
    const src = plan(`${ROOMS}${W}  ${written}\n  furniture id=s sofa at (1000,600) size 800x800\n${ENTRY}`);
    const [d] = obstructed(src);
    const pocket = pocketOf(d!.hints!);
    expect(pocket).toBe("door pocket on a.top at 1000 from start width 900");
    expect(errors(src.replace(written, pocket))).toEqual([]);
  });

  it("a hand-placed door on a derived wall is told the point, and the point resolves", () => {
    const written = "door id=d at (4000,1500) width 900 wall partition swing into a";
    const src = plan(`${ROOMS}${W}  ${written}\n${SOFA}${ENTRY}`);
    const [d] = obstructed(src);
    const hints = d!.hints!.join(" ");
    expect(hints).not.toContain("<wall>");
    const pocket = pocketOf(d!.hints!);
    expect(pocket).toBe("door pocket at (x,y) width <mm>");
    const fixed = src.replace(written, pocket.replace("(x,y)", "(4000,1500)").replace("<mm>", "900"));
    expect(errors(fixed)).toEqual([]);
    expect(obstructed(fixed)).toEqual([]);
  });

  it("an authored wall keeps the text it always had, since `on <wall>` can name it", () => {
    const src = plan(
      `${ROOMS}  wall id=shell exterior thickness 200 { (0,0) (8000,0) (8000,3000) (0,3000) close }\n  wall id=p partition thickness 100 { (4000,0) (4000,3000) }\n  door id=d on p at 1500 width 900 swing into a\n${SOFA}  door id=e on shell at 30% width 900 swing into a\n`,
    );
    const [d] = obstructed(src);
    expect(d!.hints).toContain(
      "Move the door along its wall (`on <wall> at <pos>`), or the obstruction — `archlang repair` computes the smallest clearing shift.",
    );
    expect(pocketOf(d!.hints!)).toBe("door pocket on <wall> at <pos> width <mm>");
  });

  it("inside a `place` it quotes the component's own words, which are what the body holds", () => {
    const body = `${ROOMS}${W}  ${between}\n${SOFA}${ENTRY}`;
    const src = plan(`  component wing() {\n${body}  }\n  place wing() as w at (0,0) mirror x\n`);
    const [d] = obstructed(src);
    expect(pocketOf(d!.hints!)).toBe("door pocket between a and b at 1500 from start width 900");
    const fixed = src.replace(between, pocketOf(d!.hints!));
    expect(errors(fixed)).toEqual([]);
  });
});

suite("W_SWING_ROOM_NOT_ADJACENT: never on top of a refusal", () => {
  const WARN = "W_SWING_ROOM_NOT_ADJACENT";
  const codes = (src: string) => compile(src, { noCache: true }).diagnostics.map((d) => d.code);

  it.each([
    ["a nib", "door id=d between a and b at 100 from start width 800 swing into b", "E_OPENING_NIB"],
    ["an unknown room", "door id=d between nosuch and b at center width 800 swing into b", "E_UNKNOWN_REF"],
    ["no exterior wall", "door id=d on a.right at 500 from start width 800 swing into a", "E_OPENING_NO_SHARED_WALL"],
    ["no position", "door id=d between a and b width 800 swing into b", "E_OPENING_DATUM"],
    ["no such wall", "door id=d on nowall at 500 width 800 swing into a", "E_ATTACH_WALL_REF"],
  ])("%s: the refusal alone", (_name, door, code) => {
    expect(codes(plan(`${ROOMS}${W}  ${door}\n`))).toEqual([code]);
  });

  it.each([
    ["a nib", "door id=d between a and b at 100 from start width 800 swing outward", "E_OPENING_NIB"],
    ["an unknown room", "door id=d between nosuch and b at center width 800 swing inward", "E_UNKNOWN_REF"],
    ["no such wall", "door id=d on nowall at 500 width 800 swing inward", "E_ATTACH_WALL_REF"],
  ])("`swing inward|outward` on %s: the refusal alone, no E_SWING_SIDE", (_name, door, code) => {
    expect(codes(plan(`${ROOMS}${W}  ${door}\n`))).toEqual([code]);
  });

  it("the plan of four refused doors gives four refusals, and the resolved door none", () => {
    const src = plan(
      `${ROOMS}${W}  door id=d between nosuch and b at center width 800 swing inward\n  door id=e between a and b at 100 from start width 800 swing outward\n  door id=f on nowall at 500 width 800 swing inward\n  door id=g on a.right at 500 from start width 800 swing into a\n  door id=h between a and b at center width 800 hinge near start swing into a\n`,
    );
    expect(codes(src).sort()).toEqual([
      "E_ATTACH_WALL_REF",
      "E_OPENING_NIB",
      "E_OPENING_NO_SHARED_WALL",
      "E_UNKNOWN_REF",
    ]);
  });

  it("a door that resolves still hears E_SWING_SIDE, and one with no wall by position too", () => {
    expect(codes(plan(`${ROOMS}${W}  door id=d between a and b at center width 800 swing inward\n`))).toEqual([
      "E_SWING_SIDE",
    ]);
    expect(codes(plan(`${ROOMS}  door id=d at (4000,1500) width 800 swing inward\n`))).toContain("E_SWING_SIDE");
  });

  it("a door that resolves and names a room off its wall keeps the warning", () => {
    const three = `${ROOMS}  room id=c at (8000,0) size 2000x3000 uses hall\n${W}`;
    expect(codes(plan(`${three}  door id=d between a and b at center width 800 swing into c\n`))).toEqual([WARN]);
    expect(codes(plan(`${ROOMS}${W}  door id=d between a and b at center width 800 swing into nosuch\n`))).toEqual([
      WARN,
    ]);
  });

  it("a door with no wall that is refused by nothing keeps it too", () => {
    expect(codes(plan(`${ROOMS}  door id=d at (4000,1500) width 800 swing into a\n`))).toContain(WARN);
  });
});
