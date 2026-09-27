/**
 * Lint fixes pulled back through the instance frame (backlog E.1, `fix-pullback`).
 *
 * A fix edits a span in the SOURCE, and an element inside a `place`d component is written
 * in the component's LOCAL frame. `W_FIXTURE_BACK_TO_ROOM` and `W_DIM_OVERLAP` compute
 * their value from plan-space geometry, so each pulls it back through `g⁻¹`
 * (`LintContext.frameOf`) before writing it. The proof here is the one an author gets:
 * apply the fix to the source it names, recompile, and the warning is gone.
 *
 * A statement shared by several placed instances is one span behind several elements.
 * `reconcileSharedFixes` (`src/lint.ts`) keeps ONE fix when every instance raises the same
 * edit, and otherwise drops the fix and says why (ADR 0005: decline, never guess).
 */

import { describe, expect, it } from "vitest";
import type { Diagnostic, FixSuggestion } from "../src/diagnostics.js";
import { applyFixes, lint, makeVirtualWorld } from "../src/index.js";

/** `MULTI_LIB` of test/lint-file-provenance.test.ts: a WC standing with its back to the room,
 *  inside an imported component. Unplaced, its fix is `rotate 270`. */
const MULTI_LIB = `plan "lib" {
  component wing() {
    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
    room id=lounge at (0,0) size 6000x5000 label "Powder room"
    dim (0,0)->(6000,0) offset 1000
    furniture wc at (100,2000) size 700x400 rotate 180
  }
}`;

const main = (clauses: string): string => `plan "main" {
  units mm
  import "lib.arch": wing
  place wing() as w at (20000,20000)${clauses}
}`;

const lintWith = (src: string, lib: string): Diagnostic[] =>
  lint(src, { world: makeVirtualWorld({ "lib.arch": lib }) });

const byCode = (ds: Diagnostic[], code: string): Diagnostic[] => ds.filter((d) => d.code === code);

/** A fix's edits addressed to the file it names, with the `file` tag dropped so
 *  `applyFixes` (which refuses a foreign file's edit) applies it to that file's text. */
const forItsFile = (f: FixSuggestion): FixSuggestion => {
  const { file: _file, ...rest } = f;
  return rest;
};

const SPELLINGS: [string, string][] = [
  ["e", ""],
  ["r90", " rotate 90"],
  ["r180", " rotate 180"],
  ["r270", " rotate 270"],
  ["mx", " mirror x"],
  ["my", " mirror y"],
];

describe("W_FIXTURE_BACK_TO_ROOM — the quarter-turn is written in the component's frame", () => {
  it.each(SPELLINGS)("placed %s: the fix, applied to lib.arch, clears the warning in main", (_name, clauses) => {
    const src = main(clauses);
    const [d, ...rest] = byCode(lintWith(src, MULTI_LIB), "W_FIXTURE_BACK_TO_ROOM");
    expect(rest).toEqual([]);
    const fix = d!.fixes![0]!;
    expect(fix.file).toBe("lib.arch");
    // The component's own answer, whatever the frame.
    expect(fix.edits.map((e) => e.newText)).toEqual(["rotate 270"]);
    expect(d!.hints![0]).toContain("`rotate 270`");
    const patched = applyFixes(MULTI_LIB, [forItsFile(fix)]);
    expect(patched.applied).toHaveLength(1);
    expect(byCode(lintWith(src, patched.output), "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
  });

  it("a NESTED instance pulls back through the composed frame (r90 inside r90 is r180)", () => {
    const src = `plan "main" {
  units mm
  import "lib.arch": wing
  component outer() {
    place wing() as inner at (0,0) rotate 90
  }
  place outer() as o at (20000,20000) rotate 90
}`;
    const [d] = byCode(lintWith(src, MULTI_LIB), "W_FIXTURE_BACK_TO_ROOM");
    expect(d!.fixes![0]!.edits.map((e) => e.newText)).toEqual(["rotate 270"]);
    const patched = applyFixes(MULTI_LIB, [forItsFile(d!.fixes![0]!)]);
    expect(byCode(lintWith(src, patched.output), "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
  });
});

/** Two dims stacked in one tier, written in a component in the compiled file itself. */
const dims = (clauses: string, offsets = ["400", "450"], sheet = ""): string => `plan "p" {
  units mm
${sheet}  component dd() {
    wall id=shell exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
    room id=r at (0,0) size 4000x3000 label "Room"
    dim (0,3000)->(4000,3000) offset ${offsets[0]}
    dim (0,3000)->(4000,3000) offset ${offsets[1]}
  }
  place dd() as a at (0,0)${clauses}
}`;

describe("W_DIM_OVERLAP — the bumped offset is written in the component's frame", () => {
  it.each([
    ["e", ""],
    ["mx", " mirror x"],
    ["r90∘mx", " rotate 90 mirror x"],
  ])("placed %s: the fix, applied, clears the overlap", (_name, clauses) => {
    const src = dims(clauses);
    const [d, ...rest] = byCode(lint(src), "W_DIM_OVERLAP");
    expect(rest).toEqual([]);
    // A reflection negated `offset` on the way into plan space; the fix negates it back,
    // and the prose quotes the offsets as written.
    expect(d!.fixes![0]!.edits.map((e) => e.newText)).toEqual(["offset 626"]);
    expect(d!.message).toContain("(`offset 450` and `offset 400`)");
    expect(d!.hints![0]).toContain("`offset 626`");
    const patched = applyFixes(src, d!.fixes!);
    expect(patched.applied).toHaveLength(1);
    expect(byCode(lint(patched.output), "W_DIM_OVERLAP")).toEqual([]);
  });

  it("the sign is applied BEFORE rounding: a plan-space tie at x.5 still writes the unplaced value", () => {
    // At 1:50 a chain tier is exactly 275 mm, so `offset 450.5` bumps to 725.5 — a tie.
    // Negating the rounded plan-space value would write 725 (`Math.round(-725.5)` is -725),
    // one millimetre off the 726 the unplaced component asks for.
    const sheet = "  paper A3 landscape\n  scale 1:50\n";
    const edit = (clauses: string) =>
      byCode(lint(dims(clauses, ["400.5", "450.5"], sheet)), "W_DIM_OVERLAP").flatMap(
        (d) => d.fixes?.[0]?.edits.map((e) => e.newText) ?? [],
      );
    expect(edit("")).toEqual(["offset 726"]);
    expect(edit(" mirror x")).toEqual(["offset 726"]);
    expect(edit(" rotate 90 mirror x")).toEqual(["offset 726"]);
  });
});

describe("one statement, several placed instances — reconcileSharedFixes", () => {
  /** A square WC (either axis may be its back) with no wall of its own, placed against a
   *  ROOT wall: its instances back onto whichever of their local sides that wall lands on. */
  const square = (places: string): string => `plan "p" {
  units mm
  component c() {
    furniture wc at (0,0) size 500x500
  }
  wall id=w exterior thickness 200 { (-2000,0) (20000,0) }
${places}
}`;

  it("instances that need DIFFERENT local values: no fix, every diagnostic kept, with a hint", () => {
    // `a` has the wall on its local bottom (rotate 180); `b`, turned, on its local left
    // (rotate 270). One edit to the one statement cannot be right for both.
    const src = square("  place c() as a at (1000,-600)\n  place c() as b at (5000,100) rotate 90");
    const ds = byCode(lint(src), "W_FIXTURE_BACK_TO_ROOM");
    expect(ds).toHaveLength(2);
    expect(ds.map((d) => d.span)).toEqual([ds[0]!.span, ds[0]!.span]);
    for (const d of ds) {
      expect(d.fixes).toBeUndefined();
      expect("fixes" in d).toBe(false);
      expect(d.hints!.at(-1)).toContain("shared by 2 placed instances (a.wc_1, b.wc_1) and they need different edits");
    }
    // Each hint still names its own instance's local answer.
    expect(ds.map((d) => d.hints![0])).toEqual([
      expect.stringContaining("`rotate 180`"),
      expect.stringContaining("`rotate 270`"),
    ]);
    // Nothing is left for `arch fix` to guess with.
    expect(
      applyFixes(
        src,
        ds.flatMap((d) => d.fixes ?? []),
      ).output,
    ).toBe(src);
  });

  it("an instance that does NOT raise it withholds the fix from the ones that do", () => {
    const src = square(
      "  place c() as a at (1000,-600)\n  place c() as b at (9000,-600)\n  place c() as far at (1000,5000)",
    );
    const ds = byCode(lint(src), "W_FIXTURE_BACK_TO_ROOM");
    expect(ds).toHaveLength(2);
    for (const d of ds) {
      expect(d.fixes).toBeUndefined();
      expect(d.hints!.at(-1)).toContain(
        "shared by 3 placed instances (a.wc_1, b.wc_1, far.wc_1) and the fix was derived for only 2 of the 3 elements it draws",
      );
    }
  });

  it("instances that AGREE — even under different frames: exactly one fix, applied once", () => {
    const src = `plan "main" {
  units mm
  import "lib.arch": wing
  place wing() as a at (0,0)
  place wing() as b at (8000,0) rotate 90
}`;
    const ds = byCode(lintWith(src, MULTI_LIB), "W_FIXTURE_BACK_TO_ROOM");
    expect(ds).toHaveLength(2);
    const fixes = ds.flatMap((d) => d.fixes ?? []);
    expect(fixes).toHaveLength(1);
    expect(ds[0]!.fixes).toHaveLength(1); // on the first, in output order
    expect(ds[1]!.fixes).toBeUndefined();
    expect(ds[1]!.hints).toEqual(ds[0]!.hints); // no decline hint: nothing was declined
    const patched = applyFixes(MULTI_LIB, fixes.map(forItsFile));
    expect(patched.applied).toHaveLength(1);
    expect(byCode(lintWith(src, patched.output), "W_FIXTURE_BACK_TO_ROOM")).toEqual([]);
  });

  it("the same component placed on two storeys is one statement too", () => {
    const src = `plan "main" {
  units mm
  import "lib.arch": wing
  level 1 {
    place wing() as a at (0,0)
  }
  level 2 {
    place wing() as a at (0,0) mirror x
  }
}`;
    const ds = byCode(lintWith(src, MULTI_LIB), "W_FIXTURE_BACK_TO_ROOM");
    expect(ds.map((d) => d.level)).toEqual([1, 2]);
    expect(ds.map((d) => d.fixes?.map((f) => f.edits.map((e) => e.newText)))).toEqual([[["rotate 270"]], undefined]);
  });

  it("a statement drawn by ONE placement (or by the root) is left exactly as its rule emitted it", () => {
    // A `for` inside a single instance, and the same `for` at root: several elements, one
    // placement — the post-pass does not touch them, so a plan with no shared placed
    // statement lints as before.
    const body = `    wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
    room id=lounge at (0,0) size 6000x5000 label "Powder room" uses wc
    for i in 0..2 {
      furniture wc at (100, 1000 + i * 2000) size 700x400 rotate 180
    }`;
    const rooted = `plan "p" {\n  units mm\n${body}\n}`;
    const placed = `plan "p" {\n  units mm\n  component c() {\n${body}\n  }\n  place c() as a at (0,0)\n}`;
    for (const src of [rooted, placed]) {
      const ds = byCode(lint(src), "W_FIXTURE_BACK_TO_ROOM");
      expect(ds.length, src).toBeGreaterThan(1);
      for (const d of ds)
        expect(
          d.fixes?.map((f) => f.edits.map((e) => e.newText)),
          src,
        ).toEqual([["rotate 270"]]);
    }
  });
});
