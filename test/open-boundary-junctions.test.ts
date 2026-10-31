/**
 * An `open between` boundary and the openings beside it (issue #368, part 2): voided over its whole
 * clear span, a boundary has nothing built on it for a jamb to meet, so it stops counting as a
 * meeting wall for `E_OPENING_NIB` and its lint twin `W_OPENING_AT_JUNCTION`, and for what they
 * share (`standingJunctionSpans`, `src/opening-junctions.ts`).
 *
 * The door's `W_SWING_ROOM_NOT_ADJACENT` was a follow-on, not a second finding: `E_OPENING_NIB`
 * leaves the door with no host, and `swingInto` reports a door with no host as not bordering the
 * room. A door that is placed has a host. A door that stays refused keeps both, pinned here.
 *
 * Every digest here was **measured against `src/` at `dff02717`** (`main` before this change), with
 * that tree extracted by `git archive` and its own digest body run against it. A moved row is a
 * finding to explain (`docs/testing.md` section 3), never a re-pin.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { Diagnostic } from "../src/index.js";
import { type CompilerApi, allStoreysDigestWithDiagnostics } from "./byte-identity-digest.js";
import { NIB, NIB_HOSTS } from "./open-crossing-plans.js";

const API: CompilerApi = { compile, describe: describePlan, lint };

const compileCodes = (src: string): (string | undefined)[] =>
  compile(src, { noCache: true }).diagnostics.map((d) => d.code);
const lintOf = (src: string, code: string): Diagnostic[] => lint(src).filter((d) => d.code === code);

const REFUSED = ["E_OPENING_NIB", "W_SWING_ROOM_NOT_ADJACENT"];

/** Plans that read exactly as they did: the boundary still has wall on it, or the host stops at it. */
const TODAY: [string, string, string][] = [
  ["a narrower opening", NIB.narrower, "7c416cd6b4abfdf511ded0d70270c7c0471f9a5f72cbca16b4ab4670eae8cba6"],
  ["no clause", NIB.closed, "6dfb9a3ef6418ccb0fd177730aff2f0bdd4abe87893aa48cf1b53c1db0a945e9"],
  ["by point, narrower", NIB.byPointNarrower, "f5a70b89aeeb392e320e87d42716d699f46eb48f8983cc683ab585269a97a62f"],
  ["across, narrower", NIB.acrossLineNarrower, "a80f92c33ea8b4ee1ba96ca145ccc78ee995a31392a35ac8d5965d68d10d6b5c"],
  ["under, narrower", NIB_HOSTS.underNarrower, "760a183151624802540303f04da3ddf2a7bbab4278802347c13ee58023308429"],
  ["a free end", NIB_HOSTS.stemAtFreeEnd, "5580eb42def67bfa864f58668e7a0b38e3ca5a99cc7441653757c3da0707608b"],
];

suite("a door beside an open boundary (#368)", () => {
  it("places the issue's door, on the wall the room's edge names", () => {
    const c = compile(NIB.whole, { noCache: true });
    expect(c.diagnostics).toEqual([]);
    const door = describePlan(NIB.whole).access?.edges.find((e) => e.kind === "door");
    expect(door).toMatchObject({ between: ["exterior", "hall"], hostWallId: "exterior", ambiguous: false });
    expect(door?.straddles).toBeUndefined();
  });

  it("gives the door the swing it asked for: the warning was the refusal's follow-on", () => {
    expect(compileCodes(NIB.whole)).not.toContain("W_SWING_ROOM_NOT_ADJACENT");
    expect(compileCodes(NIB.narrower)).toEqual(REFUSED);
  });

  it("lints the plan clean", () => {
    expect(lint(NIB.whole)).toEqual([]);
  });

  it("reads the span, not the clause: a width that fills it is the same boundary", () => {
    expect(compileCodes(NIB.wholeWritten)).toEqual([]);
    expect(compile(NIB.wholeWritten, { noCache: true }).svg).toBe(compile(NIB.whole, { noCache: true }).svg);
  });

  it.each(TODAY)("%s reads as it did", (_name, src, digest) => {
    expect(allStoreysDigestWithDiagnostics(API, src)).toBe(digest);
  });

  it("keeps a narrower opening's refusal, naming the partition still on the boundary", () => {
    const nib = compile(NIB.narrower, { noCache: true }).diagnostics[0];
    expect(nib?.code).toBe("E_OPENING_NIB");
    expect(nib?.message).toContain('the partition between "hall" and "liv" stands inside its span');
  });

  it("still holds a door to its room's edge, and quotes a position that compiles", () => {
    const nib = compile(NIB.pastTheEdge, { noCache: true }).diagnostics[0];
    expect(nib?.code).toBe("E_OPENING_NIB");
    expect(nib?.message).toContain("runs past the end of the wall it can stand in there (x 0–2400)");
    // The boundary keeps out no stretch of the run, so the legal position runs to the room's edge.
    const quoted = /on hall\.bottom at ([\d.]+) from start/.exec(nib?.hints?.[0] ?? "")?.[1];
    expect(quoted).toBe("1832.5");
    expect(compileCodes(NIB.pastTheEdge.replace("at 2200 from start", `at ${quoted} from start`))).toEqual([]);
  });
});

suite("the lint twin reads the same wall set", () => {
  it("does not warn a jamb on the open boundary's face", () => {
    expect(lintOf(NIB.byPoint, "W_OPENING_AT_JUNCTION")).toEqual([]);
    expect(lintOf(NIB.byPointNarrower, "W_OPENING_AT_JUNCTION")).toHaveLength(1);
  });

  it("does not call the boundary a wall inside a span, and still reports the door on two rooms", () => {
    expect(lintOf(NIB.acrossLine, "W_OPENING_AT_JUNCTION")).toEqual([]);
    expect(lintOf(NIB.acrossLineNarrower, "W_OPENING_AT_JUNCTION")).toHaveLength(1);
    // Crossing the line is its own fact: which room the door opens into is still a guess.
    const [ambiguous] = lintOf(NIB.acrossLine, "W_CONNECTOR_AMBIGUOUS");
    expect(ambiguous?.message).toContain('spans "Hall" (400 mm) and "Living" (400 mm)');
    expect(describePlan(NIB.acrossLine).access?.edges.find((e) => e.kind === "door")).toMatchObject({
      between: ["exterior", "hall"],
      straddles: ["hall", "liv"],
    });
  });

  it("keeps the opening a clause derived on the faces its jambs were set by", () => {
    // `a|b`'s lower jamb is on the 100 mm `a|c`'s face; `b|d`, 60 mm, stands beside it as a pier.
    // `a|c` is open and `c|d` carries on, so read as a door would be, `b|d` would be a short nib.
    const src = `plan "Pier" {
  units mm
  room id=a at (0,0) size 4000x3000 label "A" uses living
  room id=b at (4000,0) size 3000x3000 label "B" uses dining
  room id=c at (0,3000) size 4000x3000 label "C" uses kitchen
  room id=d at (4000,3000) size 3000x3000 label "D" uses bedroom
  walls from rooms exterior 300 partition 100 {
    open between a and b
    open between a and c
    between b and d thickness 60
  }
  door on d.right at center width 1000 swing into d
}
`;
    expect(lintOf(src, "W_OPENING_AT_JUNCTION")).toEqual([]);
  });
});

suite("the host decides whether a jamb has wall beside it", () => {
  it("lets a door run up to a boundary its wall carries on past", () => {
    expect(compileCodes(NIB_HOSTS.under)).toEqual([]);
    expect(lintOf(NIB_HOSTS.under, "W_OPENING_AT_JUNCTION")).toEqual([]);
    expect(lintOf(NIB_HOSTS.under, "W_DOOR_NEAR_CORNER")).toEqual([]);
  });

  it("refuses a jamb beside a free end: the boundary is all that stands for the wall it would need", () => {
    const [nib, swing] = compile(NIB_HOSTS.stemAtFreeEnd, { noCache: true }).diagnostics;
    expect(nib?.code).toBe("E_OPENING_NIB");
    expect(nib?.message).toContain('leaves a jamb 40 mm from the face of the partition between "a" and "b"');
    expect(swing?.code).toBe("W_SWING_ROOM_NOT_ADJACENT");
  });

  it("places the door once it clears that end", () => {
    expect(compileCodes(NIB_HOSTS.stemClear)).toEqual([]);
  });
});
