/** W_ROOM_TOO_SMALL — the floor follows the room's use. */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, lint } from "../src/index.js";

/**
 * `W_ROOM_TOO_SMALL` reads the room's use (plan-soundness PS0.11). One 4 m² floor for every
 * room asked a WC and a cupboard to be kitchen-sized, and an author repairing against it
 * inflated a staff WC and deleted a linen store (first-contact audit, "repair pressure"). The
 * audit's probe was a 1.5 × 1.5 m WC and cupboard beside a living room: two warnings on main.
 */

const plan = (rooms: string): string => `plan "P" {
  units mm
  grid 100
  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=p2 partition thickness 100 { (0,1500) (6000,1500) }
  wall id=p1 partition thickness 100 { (1500,0) (1500,1500) }
  wall id=p3 partition thickness 100 { (3000,0) (3000,1500) }
  ${rooms}
  room id=r_live at (0,1500) size 6000x2500 label "Living"
  door id=d_front on shell at 15000 width 900 swing in
}`;

const tooSmall = (src: string, opts?: Parameters<typeof lint>[1]) =>
  lint(src, opts).filter((d) => d.code === "W_ROOM_TOO_SMALL");

describe("W_ROOM_TOO_SMALL — the floor follows the room's use", () => {
  it("the audit's 1.5 × 1.5 m WC and cupboard no longer warn", () => {
    const src = plan(`room id=r_wc at (0,0) size 1500x1500 label "WC"
  room id=r_cup at (1500,0) size 1500x1500 label "Cupboard" uses storage`);
    expect(tooSmall(src)).toEqual([]);
  });

  it("a WC under 1.1 m² still warns, naming its floor and its source", () => {
    const src = plan(`room id=r_wc at (0,0) size 1000x1000 label "WC"`);
    const [d, ...rest] = tooSmall(src);
    expect(rest).toEqual([]);
    expect(d!.message).toBe('Room "WC" is only 1 m² (under 1.1 m², the floor for a WC).');
    expect(d!.message).not.toContain("r_wc");
    expect(d!.hints![0]).toContain("GB 50096-2011 5.4.2");
    expect(d!.hints!.some((h) => h.includes("`r_wc`"))).toBe(true);
  });

  it("a bathroom is held to 2.0 m²", () => {
    expect(tooSmall(plan(`room id=r_b at (0,0) size 1500x1500 label "Bathroom"`))).toEqual([]);
    const [d] = tooSmall(plan(`room id=r_b at (0,0) size 1500x1200 label "Bathroom"`));
    expect(d!.message).toBe('Room "Bathroom" is only 1.8 m² (under 2 m², the floor for a bathroom).');
  });

  it("an unclassified room keeps the generic floor and its message byte for byte", () => {
    const [d] = tooSmall(plan(`room id=r_n at (0,0) size 1500x1500 label "Nook"`));
    expect(d!.message).toBe('Room "Nook" is only 2.25 m² (under 4 m²).');
    expect(d!.hints).toEqual(["Increase its `size`, or merge it into an adjacent space."]);
  });

  it("a room with several uses takes the highest floor; the generic floor wins a tie", () => {
    // kitchen has no entry of its own, so it takes the generic 4 m², above storage's none.
    const [d] = tooSmall(plan(`room id=r_k at (0,0) size 1500x1500 label "Kitchenette" uses kitchen storage`));
    expect(d!.message).toBe('Room "Kitchenette" is only 2.25 m² (under 4 m²).');
    // hall + storage: both exempt.
    expect(tooSmall(plan(`room id=r_h at (0,0) size 1000x1000 label "Lobby" uses hall storage`))).toEqual([]);
    // bath + wc: the bath's 2.0 m².
    const [b] = tooSmall(plan(`room id=r_s at (0,0) size 1000x1500 label "Shower room" uses bath wc`));
    expect(b!.message).toContain("under 2 m², the floor for a bathroom");
  });

  it("the per-use floors are a ruleset knob a profile or caller can change", () => {
    const src = plan(`room id=r_cup at (0,0) size 1500x1500 label "Cupboard" uses storage`);
    expect(tooSmall(src)).toEqual([]);
    const strict = { ...DEFAULT_RULESET.minRoomAreaByUseM2, storage: 3 };
    const [d] = tooSmall(src, { ruleset: { minRoomAreaByUseM2: strict } });
    expect(d!.message).toBe('Room "Cupboard" is only 2.25 m² (under 3 m², the floor for a room used as storage).');
    // A floor a caller sets has no source the rule could name.
    expect(d!.hints![0]).toBe("Increase its `size`, or merge it into an adjacent space.");
  });

  it("the table merges per use: one key overrides, every other default (exemptions included) stays", () => {
    const src = plan(`room id=r_wc at (0,0) size 1000x1400 label "WC"
  room id=r_cup at (1500,0) size 1500x1500 label "Cupboard" uses storage`);
    // Default: the 1.4 m² WC clears 1.1, the cupboard is exempt.
    expect(tooSmall(src)).toEqual([]);
    const [d, ...rest] = tooSmall(src, { ruleset: { minRoomAreaByUseM2: { wc: 1.5 } } });
    // The cupboard stays exempt; only the WC's floor moved.
    expect(rest).toEqual([]);
    expect(d!.message).toBe('Room "WC" is only 1.4 m² (under 1.5 m², the floor for a WC).');
    // 1.5 is not GB 50096's 1.10, so the clause is not cited for it.
    expect(d!.hints!.join(" ")).not.toContain("GB 50096");
    // At the default value the clause is cited.
    const [e] = tooSmall(plan(`room id=r_wc at (0,0) size 1000x1000 label "WC"`), {
      ruleset: { minRoomAreaByUseM2: { wc: 1.1 } },
    });
    expect(e!.hints![0]).toContain("GB 50096-2011 5.4.2");
  });

  it("a profile or caller that sets the generic floor holds every room to at least it (accessibility-advisory)", () => {
    // The profile sets 5 m², and no researched accessible per-use table exists: a 4.5 m² bath and
    // a 2.25 m² cupboard are held to 5 m², with the message the single floor always gave.
    const src = plan(`room id=r_b at (0,0) size 1500x3000 label "Bathroom"
  room id=r_cup at (1500,0) size 1500x1500 label "Cupboard" uses storage`);
    expect(tooSmall(src)).toEqual([]);
    expect(tooSmall(src, { profile: "accessibility-advisory" }).map((d) => d.message)).toEqual([
      'Room "Bathroom" is only 4.5 m² (under 5 m²).',
      'Room "Cupboard" is only 2.25 m² (under 5 m²).',
    ]);
    // The same through the caller's ruleset; and an explicit mode keeps the per-use table.
    expect(tooSmall(src, { ruleset: { minRoomAreaM2: 5 } })).toHaveLength(2);
    expect(tooSmall(src, { ruleset: { minRoomAreaM2: 5, roomAreaFloorMode: "by-use" } })).toEqual([]);
  });
});
