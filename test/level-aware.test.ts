/**
 * Product roadmap RM9.10: level awareness on a plan of `level` blocks, the five places the card
 * names. Each is shown on `examples/two-storey.arch` with one edit, beside the plan without it.
 *
 *  1. `suggestTopology` reads every storey, walks an upper one from the rooms its shafts land in,
 *     never offers a door to the outside on a storey reached only by a shaft nor onto the roof of
 *     a storey below, and says which storey's block a statement goes in (`level`, `insertAt`).
 *  2. `validateIntent`'s `reachable` reads each storey's rooms.
 *  3. (`W_EXTERIOR_DOOR_ONTO_ROOF`: `test/lint-exterior-door-onto-roof.test.ts`.)
 *  4. `vertical.reachable_levels` is seeded only from doors from the ground: a door onto the roof
 *     of a storey below reaches no storey.
 *  5. `W_ROOM_UNREACHABLE` on an upper storey starts from where a person arrives.
 *
 * And a plan of one `level` block reads as the same plan without the wrapper (red team S2).
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
/** The defect corpus's upper storey set back over level 1, its door out onto that roof. */
const ROOF = readFileSync("test/defect-corpus/circulation-privacy/door-onto-roof.arch", "utf8");
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

  it("never offers a door to the outside on a storey reached only by its stair", () => {
    for (const src of [POCKET, upper(BATH_DOOR, "")]) {
      const sug = suggestTopology(src);
      expect(sug.length).toBeGreaterThan(0);
      for (const s of sug) {
        expect(s.level).toBe(2);
        for (const c of s.candidates) expect(c.insertText, c.rationale).not.toMatch(/\bon shell\b/);
      }
    }
  });

  it("never offers a door onto the roof of a storey below", () => {
    // Level 2 has a way in from the ground (a door on its back wall, beyond level 1), and a store
    // with no door; each candidate pasted where it says raises no door onto the roof.
    const src = ROOF.replace(
      '    room id=study at (0,0) size 6000x3000 label "Study" uses office\n',
      [
        "    wall id=mid partition thickness 100 { (4800,0) (4800,3000) }",
        '    room id=study at (0,0) size 4800x3000 label "Study" uses office',
        '    room id=store at (4800,0) size 1200x3000 label "Store" uses storage',
        "",
      ].join("\n"),
    ).replace("    door id=d_out on shell at 12000 width 900\n", "    door id=back on shell at 3000 width 900\n");
    expect(lint(src).map((d) => d.code)).not.toContain("W_EXTERIOR_DOOR_ONTO_ROOF");
    const sug = suggestTopology(src).filter((s) => s.roomId === "store");
    expect(sug.map((s) => [s.code, s.level])).toEqual([["W_ROOM_UNREACHABLE", 2]]);
    for (const c of sug[0]!.candidates) {
      const pasted = `${src.slice(0, sug[0]!.insertAt!)}  ${c.insertText}\n${src.slice(sug[0]!.insertAt!)}`;
      expect(
        lint(pasted).map((d) => d.code),
        c.insertText,
      ).not.toContain("W_EXTERIOR_DOOR_ONTO_ROOF");
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

suite("RM9.10 · reachable_levels and per-storey access from the doors from the ground", () => {
  it("a door onto a roof is no way in: the stair still reaches the storey, and its room", () => {
    const d = describe(ROOF);
    expect(d.levels![1]!.access.entrances).toEqual(["d_out"]);
    expect(d.levels![1]!.access.rooms.filter((r) => !r.reachable)).toEqual([]);
    expect(d.vertical!.reachable_levels).toEqual([1, 2]);
  });

  it("a storey whose only way in is a door onto a roof is not reached, and no room on it is", () => {
    // The stair stops on level 2 under another id: nothing joins the storeys, so before RM9.10 the
    // door made level 2 reachable on its own.
    const cut = ROOF.replace(
      "stair id=st at (2000,200) size 2600x900 dir down",
      "stair id=st2 at (2000,200) size 2600x900 dir down",
    );
    const d = describe(cut);
    expect(d.vertical).toBeUndefined();
    expect(d.levels![1]!.access.hasEntrance).toBe(true);
    expect(d.levels![1]!.access.rooms.every((r) => !r.reachable)).toBe(true);
    const codes = lint(cut).map((x) => `${x.code}@${x.level}`);
    expect(codes).toContain("W_EXTERIOR_DOOR_ONTO_ROOF@2");
    expect(codes.filter((c) => c.startsWith("W_ROOM_UNREACHABLE"))).toEqual([]);
    expect(reachableRow(cut).detail).toBe("reachable: unreachable on level 2: study");
  });

  it("a door onto a deck upstairs is still a way in, as it always was", () => {
    const p5 = readFileSync("test/main-entrance-fixtures/p5-upper-terrace.arch", "utf8");
    expect(describe(p5).vertical!.reachable_levels).toEqual([1, 2]);
    expect(lint(p5).map((x) => x.code)).not.toContain("W_EXTERIOR_DOOR_ONTO_ROOF");
  });
});

suite("RM9.10 · one `level` block reads as the plan without it", () => {
  const body = [
    "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }",
    "  wall id=mid partition thickness 100 { (3000,0) (3000,3000) }",
    '  room id=a at (0,0) size 3000x3000 label "Living" uses living',
    '  room id=b at (3000,0) size 3000x3000 label "Bedroom" uses bedroom',
    "  door id=slider on shell at 13500 width 900",
    "  window on shell at 1500 width 1200",
    "  window on shell at 4500 width 1200",
    "  outdoor balcony at (500,3000) size 2000x1200 rail all",
  ];
  /** A balcony door only, and a room behind a missing door: what a cut-off storey would change. */
  const bare = `plan "P" {\n  units mm\n${body.join("\n")}\n}\n`;
  const wrapped = `plan "P" {\n  units mm\n  level 1 {\n${body.map((l) => `  ${l}`).join("\n")}\n  }\n}\n`;
  const facts = (src: string) => lint(src).map((d) => [d.code, d.message]);

  it("lints, describes and suggests alike", () => {
    expect(facts(wrapped)).toEqual(facts(bare));
    expect(facts(bare).map(([c]) => c)).toContain("W_ROOM_DISCONNECTED");
    expect(describe(wrapped).levels![0]!.access.rooms).toEqual(describe(bare).access.rooms);
    expect(describe(bare).access.rooms.find((r) => r.id === "a")!.reachable).toBe(true);
    const strip = ({ level: _l, insertAt: _a, ...s }: ReturnType<typeof suggestTopology>[number]) => s;
    expect(suggestTopology(wrapped).map(strip)).toEqual(suggestTopology(bare));
    expect(suggestTopology(bare).length).toBeGreaterThan(0);
  });
});
