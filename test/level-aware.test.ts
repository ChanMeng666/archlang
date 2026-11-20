/**
 * Product roadmap RM9.10: level awareness on a plan of `level` blocks, the five places the card
 * names. Each is shown on `examples/two-storey.arch` with one edit, beside the plan without it.
 *
 *  1. `suggestTopology` reads every storey, walks an upper one from the rooms its shafts land in,
 *     never offers a door to the outside above the entrance storey, and says which storey's block
 *     a statement goes in (`level`, `insertAt`).
 *  2. `validateIntent`'s `reachable` reads each storey's rooms.
 *  3. (`W_EXTERIOR_DOOR_ABOVE_ENTRANCE`: `test/lint-exterior-door-above-entrance.test.ts`.)
 *  4. `vertical.reachable_levels` is seeded from the entrance storey: an upstairs door onto nothing
 *     reaches no storey.
 *  5. `W_ROOM_UNREACHABLE` on an upper storey starts from where a person arrives.
 */
import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { describe, intentFromJson, lint, suggestTopology, validateIntent } from "../src/index.js";

const TWO = readFileSync("examples/two-storey.arch", "utf8");
const UPPER = TWO.indexOf('level 2 "First floor"');
/** `TWO` with `from` replaced by `to` on level 2 only. */
const upper = (from: string, to: string): string => {
  const at = TWO.indexOf(from, UPPER);
  expect(at, from).toBeGreaterThan(UPPER);
  return TWO.slice(0, at) + to + TWO.slice(at + from.length);
};
const BATH_DOOR = "    door id=d_bath on bath_w at 1100 width 800 swing into bath\n";
const BED2_DOOR = "    door id=d_bed2 on hall_w at 4250 width 900 swing into bed2\n";
/** Level 2 with Bath and Bedroom 2 joined to each other only: a sealed pocket upstairs. */
const POCKET = upper(BED2_DOOR + BATH_DOOR, "    door id=d_bb on hall_w at 6000 width 800 swing into bed2\n");
/** Level 2 with Bedroom 2's way in replaced by a door through the shell onto nothing. */
const AIR = upper(BED2_DOOR, "    door id=d_air on shell at 18000 width 900 swing into bed2\n");
const REACHABLE = intentFromJson({ reachable: true }).intent!;
const reachableRow = (src: string) =>
  validateIntent(src, REACHABLE).assertions.find((a) => a.predicate.kind === "reachable")!;

suite("RM9.10 · suggestTopology per storey", () => {
  it("suggests for an upper storey, inside that storey's block, and the statement it gives clears it", () => {
    const src = upper(BATH_DOOR, "");
    const sug = suggestTopology(src);
    expect(sug.map((s) => [s.code, s.roomId, s.level])).toEqual([["W_ROOM_UNREACHABLE", "bath", 2]]);
    const at = sug[0]!.insertAt!;
    expect(src[at]).toBe("}");
    expect(src.lastIndexOf('level 2 "First floor"', at)).toBe(UPPER);
    expect(src.indexOf("}", src.indexOf("roof overhang 400"))).toBe(at);
    const pasted = `${src.slice(0, at)}  ${sug[0]!.candidates[0]!.insertText}\n${src.slice(at)}`;
    const after = lint(pasted).map((d) => d.code);
    expect(after).not.toContain("W_ROOM_DISCONNECTED");
    expect(after).not.toContain("W_ROOM_UNREACHABLE");
    expect(after).not.toContain("E_LEVEL_MIX");
  });

  it("never offers a door to the outside above the entrance storey", () => {
    for (const src of [POCKET, AIR, upper(BATH_DOOR, "")]) {
      for (const s of suggestTopology(src)) {
        expect(s.level).toBe(2);
        for (const c of s.candidates) expect(c.insertText, c.rationale).not.toMatch(/\bon shell\b/);
      }
    }
  });

  it("leaves a plan of one storey exactly as it was: no `level`, no `insertAt`", () => {
    const one = `plan "one" {\n  units mm\n  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }\n  room id=hall at (0,0) size 6000x3000 label "Hall" uses hall\n}\n`;
    const sug = suggestTopology(one);
    expect(sug.map((s) => s.code)).toEqual(["W_NO_ENTRANCE"]);
    for (const s of sug) {
      expect(s).not.toHaveProperty("level");
      expect(s).not.toHaveProperty("insertAt");
    }
  });
});

suite("RM9.10 · validateIntent reachable per storey", () => {
  it("fails a pocket of rooms upstairs, naming the storey", () => {
    expect(reachableRow(TWO).pass).toBe(true);
    const row = reachableRow(POCKET);
    expect(row.pass).toBe(false);
    expect(row.detail).toBe("reachable: unreachable on level 2: bath, bed2");
  });
});

suite("RM9.10 · reachable_levels and per-storey access from the entrance storey", () => {
  it("an upstairs door onto nothing is no way in: the stair's rooms stay reached, the door's room is not", () => {
    const l2 = describe(AIR).levels![1]!;
    expect(l2.access.entrances).toEqual(["d_air"]);
    expect(l2.access.rooms.filter((r) => !r.reachable).map((r) => r.id)).toEqual(["bed2"]);
    expect(describe(AIR).vertical!.reachable_levels).toEqual([1, 2]);
    const unreachable = lint(AIR).filter((d) => d.code === "W_ROOM_UNREACHABLE");
    expect(unreachable.map((d) => [d.level, AIR.slice(d.span!.start, d.span!.end).split(" ")[1]])).toEqual([
      [2, "id=bed2"],
    ]);
  });

  it("a storey whose only way in is a door onto nothing is not reached, and no room on it is", () => {
    // The stair stops on level 2 under another id: nothing joins the storeys, so before RM9.10 the
    // door made level 2 reachable on its own.
    const cut = upper("stair id=stair at", "stair id=stair2 at").replace(
      BED2_DOOR,
      `${BED2_DOOR}    door id=d_air on shell at 18000 width 900 swing into bed2\n`,
    );
    const d = describe(cut);
    expect(d.levels![1]!.access.hasEntrance).toBe(true);
    expect(d.levels![1]!.access.rooms.every((r) => !r.reachable)).toBe(true);
    const codes = lint(cut).map((x) => `${x.code}@${x.level}`);
    expect(codes).toContain("W_EXTERIOR_DOOR_ABOVE_ENTRANCE@2");
    expect(codes.filter((c) => c.startsWith("W_ROOM_UNREACHABLE"))).toEqual([]);
    expect(reachableRow(cut).detail).toBe("reachable: unreachable on level 2: landing, bath, bed1, bed2");
  });

  it("a door onto a deck upstairs is still a way in, as it always was", () => {
    const p5 = readFileSync("test/main-entrance-fixtures/p5-upper-terrace.arch", "utf8");
    expect(describe(p5).vertical!.reachable_levels).toEqual([1, 2]);
    expect(lint(p5).map((x) => x.code)).not.toContain("W_EXTERIOR_DOOR_ABOVE_ENTRANCE");
  });
});
