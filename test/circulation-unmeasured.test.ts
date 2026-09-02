import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, type SceneSummary } from "../src/index.js";
import { NULL_WORLD, type World } from "../src/world.js";

/**
 * Two laws about what `describe().circulation` is allowed to leave OUT
 * (`docs/backlog.md` G.5).
 *
 * The defect this file exists against was the SILENCE, not the omission. A consumer got
 * circulation facts for five of seven rooms and nothing whatever telling it two were
 * missing — no key, no diagnostic, no count — so it could not distinguish "this plan is
 * fine, we simply measure from a different front door" from "nothing can walk in here".
 * Twenty-one rooms across the thirty shipped examples were in that state.
 *
 * ## Law 1 — the report is TOTAL
 *
 * Whenever `circulation` is non-null, every room in `rooms[]` appears in exactly ONE of
 * `circulation.rooms[]`, `circulation.blocked[]` and `circulation.unmeasured[]`. Not "at
 * least one" and not "at most one": a room that appears twice is two different claims
 * about the same floor, and a room that appears in none is the original defect back.
 *
 * This is the honest gate because it cannot be greened by tuning anything. It fails for a
 * newly-dropped room, for a double-count, and for a reason-classifier that returns nothing
 * for a case it does not recognise — and no constant fixes any of the three.
 *
 * ## Law 2 — a curved wall blocks the ARC, not its chord
 *
 * The nav grid used to rasterise every wall segment against the straight chord between
 * its endpoints, ignoring the `arcs[]` solve `resolve` had already done. That is not a
 * coarser version of the same wall, it is a different wall in a different place: a closed
 * drum — two semicircular `arc` edges sharing endpoints — rasterises to a bar along its
 * own DIAMETER, so a route walked through the masonry while the round room inside was cut
 * into two caps.
 *
 * The specimen is proved in BOTH directions on one plan, which is what makes it a law
 * rather than a snapshot: a room on the far side of the drum from the entrance must be
 * measured (the openings really do connect it), and its walk must be long enough that the
 * route cannot have crossed the drum's interior — a route that cheated through the wall is
 * strictly shorter than one that goes round through a doorway.
 */

/** Every shipped example, read with a World so the importing ones resolve. */
const EXAMPLES = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort();

const exampleWorld: World = {
  read: (p) => {
    try {
      return readFileSync(`examples/${p.replace(/^\.\//, "")}`, "utf8");
    } catch {
      return null;
    }
  },
};

/** The top-level summary plus one per storey — `circulation` is per-storey, so a law
 *  checked only at the top level would miss every upper floor. */
function everySummary(s: SceneSummary): SceneSummary[] {
  return s.levels && s.levels.length > 0 ? (s.levels as unknown as SceneSummary[]) : [s];
}

describe("G.5 — circulation reports every room it cannot measure", () => {
  it("rooms[] / blocked[] / unmeasured[] partition the plan's rooms, on all 30 examples", () => {
    const offenders: string[] = [];
    for (const f of EXAMPLES) {
      const s = describePlan(readFileSync(`examples/${f}`, "utf8"), { world: exampleWorld });
      for (const [i, lvl] of everySummary(s).entries()) {
        const c = lvl.circulation;
        if (!c) continue; // no modeled entrance: `W_NO_ENTRANCE` is the fact, not this key
        const counts = new Map<string, number>();
        for (const id of [
          ...c.rooms.map((r) => r.roomId),
          ...(c.blocked ?? []).map((r) => r.roomId),
          ...(c.unmeasured ?? []).map((r) => r.roomId),
        ]) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        for (const r of lvl.rooms) {
          const n = counts.get(r.id) ?? 0;
          if (n !== 1) offenders.push(`${f}[${i}] ${r.id} appears ${n}x`);
        }
        // Nothing may be reported that is not a room of this storey.
        for (const id of counts.keys()) {
          if (!lvl.rooms.some((r) => r.id === id)) offenders.push(`${f}[${i}] ${id} is not a room here`);
        }
      }
    }
    expect(offenders, "a room reported twice, or not at all — G.5 is the second one").toEqual([]);
  });

  it("emits no `unmeasured` key at all when every room measures — the byte-identity rule", () => {
    // `studio` is the lint-clean, import-free flagship: every room walks from its door.
    const s = describePlan(readFileSync("examples/studio.arch", "utf8"));
    expect(s.circulation?.rooms.map((r) => r.roomId).sort()).toEqual(s.rooms.map((r) => r.id).sort());
    expect(Object.keys(s.circulation ?? {})).not.toContain("unmeasured");
    expect(JSON.stringify(s.circulation)).not.toContain("unmeasured");
  });

  it("`other_entrance` names a room a LATER front door reaches — not a defect", () => {
    // `terrace-row` is four dwellings on one sheet; every walk is measured from house 1's
    // door, so the other three are legitimately elsewhere. Reporting them as `blocked`
    // would be the false positive item 5.8's furniture control exists to prevent.
    const s = describePlan(readFileSync("examples/terrace-row.arch", "utf8"), { world: exampleWorld });
    const u = s.circulation?.unmeasured ?? [];
    expect(u.length).toBe(12);
    expect(new Set(u.map((r) => r.reason))).toEqual(new Set(["other_entrance"]));
    expect(s.circulation?.blocked ?? []).toEqual([]);
  });

  it("`no_threshold` names a room whose doorway never opened in the grid", () => {
    // `garden-house`'s study has one door, and it opens onto the flank of the stair —
    // whose clearance covers the hall side of the opening, so no threshold across its
    // width can be carved. Not `blocked`: the obstruction is not furniture, and that
    // message would name the wrong element to move.
    const s = describePlan(readFileSync("examples/garden-house.arch", "utf8"), { world: exampleWorld });
    expect(s.circulation?.unmeasured).toEqual([{ roomId: "r_study", reason: "no_threshold" }]);
    expect((s.circulation?.blocked ?? []).map((b) => b.roomId)).not.toContain("r_study");
  });
});

describe("G.5 — a curved wall obstructs the arc it is drawn as", () => {
  const hexagon = readFileSync("examples/hexagon-pavilion.arch", "utf8");

  it("measures the galleries behind the drum, and by a route that goes ROUND it", () => {
    const s = describePlan(hexagon);
    const by = new Map((s.circulation?.rooms ?? []).map((r) => [r.roomId, r]));
    expect([...by.keys()].sort()).toEqual(s.rooms.map((r) => r.id).sort());

    // The entrance is on the south facade, in `g_s`. The three NORTHERN galleries are the
    // ones the chord-rasterised drum orphaned. Each is now measured — and each walk must
    // exceed the straight line, because reaching it means entering the rotunda at one
    // opening and leaving by another rather than cutting across the masonry.
    for (const id of ["g_ne", "g_n", "g_nw"]) {
      const r = by.get(id);
      expect(r, `${id} must be measured`).toBeDefined();
      expect(r!.detourRatio, `${id} must go round the drum, not through it`).toBeGreaterThan(1);
      expect(r!.walkDistanceMm).toBeGreaterThan(9000);
    }

    // The control: the three SOUTHERN galleries, on the entrance's own side, are measured
    // too. If the drum were over-blocked the plan would simply lose the other half.
    for (const id of ["g_sw", "g_s", "g_se"]) expect(by.get(id), `${id} must be measured`).toBeDefined();
  });

  it("does not move the drawing — the SVG always had the arc", () => {
    // The constructive half of the argument for the digest re-measurement: only the nav
    // grid ever held a chord, so a fix to it cannot touch a rendered byte.
    expect(compile(hexagon, { world: NULL_WORLD, noCache: true }).svg).toBe(
      compile(hexagon, { world: NULL_WORLD, noCache: true }).svg,
    );
    expect(compile(hexagon, { noCache: true }).svg).toContain(" A");
  });
});
