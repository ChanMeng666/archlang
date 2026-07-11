import { describe, expect, it } from "vitest";
import type { RoomSummary } from "../src/index.js";
import { evaluate, loadCorpus, readGolden, scoreSource } from "../eval/run.js";
import { JUDGE_VERSION } from "../eval/assertions.js";
import { SYNONYMS_VERSION, roomsMatching } from "../eval/synonyms.js";

/**
 * Authorability regression guard (offline eval).
 *
 * Every golden in the corpus must compile and match its semantic expectations. This
 * is the CI-safe half of the NL→ArchLang eval: if a language change breaks a plan a
 * model already wrote, this fails — no API key needed. The live eval (`npm run eval
 * -- --live`) produces the headline authorability number for the README.
 */

describe("eval — committed goldens still author correctly", () => {
  const entries = loadCorpus();

  it("the corpus is non-empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every golden compiles and matches its expected semantics", async () => {
    const { results, summary } = await evaluate(entries, (e) => readGolden(e));
    const failed = results.filter((r) => !r.semanticPass);
    expect(failed.map((r) => `${r.id}: ${r.failures.join(", ")}`)).toEqual([]);
    expect(summary.valid).toBe(summary.total);
  });

  // The gate for the NON-gating dimensions: a golden must not only pass its
  // conjunctive checks, it must earn a perfect (or unasserted) score on every
  // dimension — including adjacency/reachability, which score but never fail a plan.
  it("every golden scores 1.0 (or null) on all subscores", async () => {
    const { results } = await evaluate(entries, (e) => readGolden(e));
    const off = results
      .filter((r) => {
        const s = r.subscores;
        if (!s) return true;
        const perfect = (n: number | null): boolean => n === null || n === 1;
        return !(perfect(s.rooms) && perfect(s.labels) && perfect(s.area) && perfect(s.adjacency));
      })
      .map((r) => `${r.id}: ${JSON.stringify(r.subscores)} — ${r.failures.join(", ")}`);
    expect(off).toEqual([]);
  });

  it("pins the scoring-core and synonym versions", () => {
    expect(SYNONYMS_VERSION).toBe(1);
    expect(JUDGE_VERSION).toBe("2");
  });

  it("synonym matching is token-bounded (whole-word, not substring)", () => {
    // room_type/uses deliberately non-matching so only the LABEL path is exercised.
    const room = (label: string): RoomSummary => ({
      id: "x",
      label,
      uses: [],
      room_type: "Room",
      area_m2: 10,
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      floor_polygon: [],
      adjacent: [],
    });
    expect(roomsMatching("hall", [room("Entrance Hall")])).toHaveLength(1);
    expect(roomsMatching("hall", [room("Hallmark Suite")])).toHaveLength(0);
    // Numeric/letter suffixes are tolerated.
    expect(roomsMatching("bedroom", [room("Bedroom 2")])).toHaveLength(1);
    expect(roomsMatching("unit", [room("Unit A")])).toHaveLength(1);
  });

  it("scoreSource is deterministic (same source → deeply-equal score)", () => {
    const entry = entries[0]!;
    const src = readGolden(entry);
    expect(scoreSource(entry, src)).toEqual(scoreSource(entry, src));
  });

  it("scoreSource flags a plan that misses its room-count expectation", () => {
    const s = scoreSource(
      { id: "x", prompt: "", golden: "", expect: { rooms: 5 } },
      `plan "P" { units mm room at (0,0) size 4000x3000 label "Only" }`,
    );
    expect(s.valid).toBe(true);
    expect(s.semanticPass).toBe(false);
    expect(s.failures.some((f) => f.startsWith("rooms:"))).toBe(true);
  });

  // Policy B: one surplus room is tolerated ONLY when it is circulation.
  it("room-count policy B: a +1 circulation room passes, a +1 non-circulation room fails", () => {
    const expect2 = { rooms: 1, roomsInclude: [{ concept: "hall" }] };
    const circSurplus = scoreSource(
      { id: "c", prompt: "", golden: "", expect: expect2 },
      `plan "P" { units mm room at (0,0) size 2000x2000 label "Hall" room at (2000,0) size 2000x2000 label "Corridor" }`,
    );
    expect(circSurplus.semanticPass).toBe(true);
    expect(circSurplus.failures.some((f) => f.startsWith("rooms:"))).toBe(false);

    const bedroomSurplus = scoreSource(
      { id: "b", prompt: "", golden: "", expect: expect2 },
      `plan "P" { units mm room at (0,0) size 2000x2000 label "Hall" room at (2000,0) size 3000x3000 label "Bedroom" }`,
    );
    expect(bedroomSurplus.semanticPass).toBe(false);
    expect(bedroomSurplus.failures.some((f) => f.includes("not a circulation room"))).toBe(true);
  });

  // One room may satisfy at most one roomsInclude concept (greedy, corpus order).
  it("one-room-one-concept: a single WC room can't clear both a bathroom and a wc expectation", () => {
    const s = scoreSource(
      {
        id: "w",
        prompt: "",
        golden: "",
        expect: { rooms: 1, roomsInclude: [{ concept: "bathroom" }, { concept: "wc" }] },
      },
      `plan "P" { units mm room at (0,0) size 2000x2000 label "WC" }`,
    );
    // The room is claimed by the first concept (bathroom); wc then finds nothing.
    expect(s.failures.some((f) => f.includes('"bathroom"'))).toBe(false);
    expect(s.failures.some((f) => f.includes('"wc"'))).toBe(true);
    expect(s.semanticPass).toBe(false);
  });

  it("no golden contains a physical-correctness violation", async () => {
    const { results } = await evaluate(entries, (e) => readGolden(e));
    const broken = results.filter((r) => r.physicalWarnings > 0);
    expect(broken.map((r) => `${r.id}: ${r.failures.join(", ")}`)).toEqual([]);
  });

  it("scoreSource fails a plan with furniture drawn through a wall", () => {
    const s = scoreSource(
      { id: "y", prompt: "", golden: "", expect: { rooms: 2 } },
      `plan "P" {
        units mm
        wall exterior  thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
        wall partition thickness 100 { (4000,0) (4000,4000) }
        room id=a at (0,0)    size 4000x4000 label "A"
        room id=b at (4000,0) size 4000x4000 label "B"
        furniture sofa at (3500,1000) size 1000x900
      }`,
    );
    expect(s.physicalWarnings).toBeGreaterThan(0);
    expect(s.semanticPass).toBe(false);
    expect(s.failures.some((f) => f.startsWith("physical:"))).toBe(true);
  });
});
