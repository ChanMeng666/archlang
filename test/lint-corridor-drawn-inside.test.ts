/**
 * Product roadmap RM9.6, coverage class CV16 (plan-soundness PS2.42): `W_CORRIDOR_DRAWN_INSIDE`,
 * the building's common corridor drawn as a room inside the dwelling's exterior walls (or the
 * dwelling's own entrance with its door out not drawn). Every door to the outside opens onto an
 * `outdoor balcony`, and a room that is only entry, hall or circulation, holds no stair or lift and
 * has no door to the outside opens only into one other room, by a hinged door.
 *
 * Each finding is shown beside the same plan with its cause removed, so a test cannot pass because
 * the rule never ran.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { compile, type Diagnostic, describe, ERROR_CATALOG, lint, lintCoverage, resolvePlan } from "../src/index.js";
import { LINT_PROFILE_NAMES } from "../src/lint/ruleset.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD } from "./helpers/d4-oracle.js";

const CODE = "W_CORRIDOR_DRAWN_INSIDE";
const ROOT = join(__dirname, "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const of = (src: string, profile?: string): Diagnostic[] =>
  lint(src, profile === undefined ? {} : { profile }).filter((d) => d.code === CODE);

const CASE = read("test/defect-corpus/circulation-privacy/corridor-drawn-inside.arch");
const TWIN = read("test/defect-corpus/circulation-privacy/corridor-drawn-inside.clean.arch");
const FRONT = "  door id=d_front between r_corr and r_hall at center width 1000 swing into r_hall\n";
/** The case with one line replaced (the line must be there, so a variant never tests the case itself). */
const edit = (from: string, to: string): string => {
  expect(CASE).toContain(from);
  return CASE.replace(from, to);
};
const MESSAGE =
  'Every door to the outside opens onto a balcony, and "Corridor" has no door to the outside: it opens only into "Hall", by a hinged door. So the only way in reads as the balcony: either the building\'s corridor is drawn inside the dwelling\'s exterior walls and that door is the front door, or this room\'s own door to the outside is not drawn.';

const AUDITS = "test/plans/plan-soundness/audits/first-contact-plans";

suite("W_CORRIDOR_DRAWN_INSIDE", () => {
  it("reports the public case once, at its front door, with the message id-free and the ids in the hints", () => {
    const ds = of(CASE);
    expect(ds).toHaveLength(1);
    const d = ds[0]!;
    expect(d.severity).toBe("warning");
    expect(d.message).toBe(MESSAGE);
    expect(CASE.slice(d.span!.start, d.span!.end)).toBe(FRONT.trim());
    expect(d.hints).toEqual([
      'If "Corridor" (r_corr) is the building\'s common corridor, draw it outside the dwelling\'s exterior walls (for example as an `outdoor paving` surface labelled "Corridor") and hang d_front on the exterior wall of "Hall" (r_hall) that faces it, as a door from outside.',
      'If "Corridor" (r_corr) belongs to the dwelling, draw its door to the outside: that door is then the way in.',
      "Accept if the plan is a fragment of a larger dwelling whose way in is not drawn. The warning is advisory.",
    ]);
  });

  it("is silent on the twin, whose corridor is outside the ring and whose front door is on the exterior wall", () => {
    expect(lint(TWIN)).toEqual([]);
    expect(describe(TWIN).access?.entrances).toEqual(["d_front", "d_balc"]);
  });

  it("does not re-read the corridor as the way in: describe() still lists the balcony door alone", () => {
    expect(describe(CASE).access?.entrances).toEqual(["d_balc"]);
    const privacy = lintCoverage(CASE)!.families.find((f) => f.family === "privacy")!;
    expect(privacy.skipped?.map((s) => s.reason)).toEqual(["balcony-only-entrance"]);
  });

  it("reads the first-contact apartments PS2.42 names: the 2026-10-25 and later re-runs warn, 2026-10-24 does not", () => {
    for (const run of ["2026-10-25-rerun", "2026-10-26-rerun-row6", "2026-10-27-rerun-arm2"])
      expect(of(read(`${AUDITS}/${run}/1-apartment.arch`)), run).toHaveLength(1);
    expect(of(read(`${AUDITS}/2026-10-24-rerun/1-apartment.arch`))).toEqual([]);
  });

  it("is silent when the corridor has a door to the outside: that door is the way in", () => {
    const src = edit(FRONT, `${FRONT}  door id=d_out on r_corr.bottom at 2000 from start width 1000 swing inward\n`);
    expect(describe(src).access?.entrances).toContain("d_out");
    expect(of(src)).toEqual([]);
  });

  it("is silent when any door to the outside opens onto the ground, not a balcony", () => {
    const src = edit(
      "  window on r_living.left at center width 1500\n",
      "  door id=d_side on r_living.left at center width 1000 swing inward\n",
    );
    expect(of(src)).toEqual([]);
    // With no balcony drawn, the slider itself opens onto the ground.
    expect(of(edit('  outdoor balcony at (800,-1600) size 3400x1500 label "Balcony"\n', ""))).toEqual([]);
  });

  it("is silent when the corridor opens into two rooms: it is a passage of the dwelling", () => {
    const src = edit(
      FRONT,
      `${FRONT}  door id=d_corr2 between r_corr and r_bed at center width 900 swing into r_bed\n`,
    );
    expect(
      describe(src)
        .access?.edges.filter((e) => e.between.includes("r_corr"))
        .map((e) => e.doorId),
    ).toEqual(["d_front", "d_corr2"]);
    expect(of(src)).toEqual([]);
  });

  it("needs a hinged door: a sliding door or a cased opening into the dwelling is not a front door", () => {
    const sliding = edit(
      FRONT,
      FRONT.replace("door id=d_front", "door id=d_front sliding").replace(" swing into r_hall", ""),
    );
    const opening = edit(FRONT, "  opening id=o_front between r_corr and r_hall at center width 1000\n");
    for (const src of [sliding, opening]) {
      // The variant compiles and its connector still joins the corridor to the hall.
      expect(compile(src).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(describe(src).access?.edges.some((e) => e.between.includes("r_corr"))).toBe(true);
      expect(of(src)).toEqual([]);
    }
    expect(of(edit(FRONT, FRONT.replace("door id=d_front", "door id=d_front hinged")))).toHaveLength(1);
    expect(of(edit(FRONT, FRONT.replace("door id=d_front", "door id=d_front double")))).toHaveLength(1);
  });

  it("needs an entry, hall or circulation room: a store with the same doors is not a corridor", () => {
    expect(of(edit('label "Corridor" uses circulation', 'label "Corridor" uses circulation storage'))).toEqual([]);
    expect(of(edit('label "Corridor" uses circulation', 'label "Store" uses storage'))).toEqual([]);
    expect(of(edit('label "Corridor" uses circulation', 'label "Landing" uses hall'))).toHaveLength(1);
  });

  it("declares a non-residential plan instead of judging it, and residential-basic judges it", () => {
    const shop = edit('label "Living" uses living', 'label "Cafe" uses living');
    expect(of(shop)).toEqual([]);
    const privacy = lintCoverage(shop)!.families.find((f) => f.family === "privacy")!;
    expect(privacy.skipped?.map((s) => s.reason)).toContain("non-dwelling");
    expect(of(shop, "residential-basic")).toHaveLength(1);
  });

  it("is silent on a storey a stair arrives on: its walk starts at the landing", () => {
    const body = CASE.slice(CASE.indexOf("{\n") + 2, CASE.lastIndexOf("}"));
    const src =
      'plan "Upper flat" {\n  units mm\n  grid 100\n' +
      '  level 1 "Ground" {\n' +
      "    wall id=g exterior thickness 200 { (0,0) (10000,0) (10000,5900) (0,5900) close }\n" +
      '    room id=g_hall at (0,0) size 10000x5900 label "Entrance hall" uses hall\n' +
      "    door id=g_front on g at 5000 width 1000\n" +
      "    stair id=st at (8000,500) size 1000x3000 dir up\n" +
      "  }\n" +
      '  level 2 "Upper" {\n' +
      body.replace(/^ {2}units mm\n {2}grid 100\n/, "") +
      "    stair id=st at (8000,500) size 1000x3000 dir down\n" +
      "  }\n}\n";
    expect(resolvePlan(src).levels.map((l) => l.ir.elements.length > 0)).toEqual([true, true]);
    expect(of(src)).toEqual([]);
    // The same two storeys with no stair between them: the upper flat is judged, and reported.
    expect(of(src.replace(/^ {4}stair id=st .*\n/gm, ""))).toHaveLength(1);
  });

  /** A flat of the review's probes (round 1 of #1069): a balcony slider in the living room. */
  const flat = (...lines: string[]): string =>
    [
      'plan "Probe" {',
      "  units mm",
      "  grid 100",
      ...lines,
      '  outdoor balcony at (800,-1600) size 3400x1500 label "Balcony"',
      "  door id=d_balc sliding on r_living.top at 1600 from start width 1800",
      "  window on r_living.left at center width 1500",
      "}",
      "",
    ].join("\n");

  it("leads with the front-door hint when the room is the dwelling's entry or hall, not a corridor", () => {
    // Round 1 (p03b): a studio whose entry has no front door drawn. It reports, as either reading.
    const src = flat(
      '  room id=r_living at (0,0) size 5000x4500 label "Living" uses living',
      '  room id=r_entry right-of r_living size 1600x4500 label "Entry" uses entry',
      "  walls from rooms exterior 200 partition 100",
      "  door id=d_liv between r_entry and r_living at center width 900 swing into r_living",
    );
    const ds = of(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.hints![0]).toBe(
      'If "Entry" (r_entry) belongs to the dwelling, draw its door to the outside: that door is then the way in.',
    );
    expect(ds[0]!.hints![1]).toMatch(/^If "Entry" \(r_entry\) is the building's common corridor/);
    // The public case's corridor is `uses circulation`: the corridor hint leads.
    expect(of(CASE)[0]!.hints![0]).toMatch(/^If "Corridor" \(r_corr\) is the building's common corridor/);
  });

  it("needs a room that is only a way through: a hall bath, a hall WC or a store beside the hall is not one", () => {
    // Round 1 (p28): a flat whose front door is not drawn; "Hall Bath" reads `hall` and `bath`.
    const p28 = flat(
      '  room id=r_living at (0,0) size 5000x4500 label "Living" uses living',
      '  room id=r_hall right-of r_living size 1600x4500 label "Hall" uses hall',
      '  room id=r_bath right-of r_hall align top size 3400x2000 label "Hall Bath"',
      '  room id=r_bed below r_bath align left size 3400x2500 label "Bedroom" uses bedroom',
      "  walls from rooms exterior 200 partition 100",
      "  door id=d_liv between r_hall and r_living at center width 900 swing into r_living",
      "  door id=d_bath between r_hall and r_bath at center width 800 swing into r_bath",
      "  door id=d_bed between r_hall and r_bed at center width 900 swing into r_bed",
      "  furniture toilet at (8600,200) size 400x700",
      "  furniture basin at (7000,200) size 500x400",
    );
    expect(lintCoverage(p28)!.families.find((f) => f.family === "privacy")!.status).toBe("partial");
    expect(of(p28)).toEqual([]);
    // Round 1 (p29): the same flat off an access gallery drawn as a balcony, its front door onto it.
    const p29 = p28.replace(
      "  door id=d_liv ",
      '  outdoor balcony at (0,4600) size 10000x1500 label "Access gallery"\n' +
        "  door id=d_front on r_hall.bottom at center width 1000 swing inward\n  door id=d_liv ",
    );
    expect(describe(p29).access?.entrances).toContain("d_front");
    expect(of(p29)).toEqual([]);
    // The hall bath read as a hall alone would report: the uses are what clears it.
    expect(of(p28.replace('label "Hall Bath"', 'label "Hall Bath" uses hall'))).toHaveLength(1);
    for (const uses of ["hall bath", "hall wc", "hall storage", "entry dining", "circulation bedroom"])
      expect(of(edit('label "Corridor" uses circulation', `label "Corridor" uses ${uses}`)), uses).toEqual([]);
  });

  it("is silent on a landing that holds a stair, drawn alone or under a storey that holds the defect", () => {
    // Round 1 (p04b): a maisonette's upper floor drawn alone, its landing holding the stair down.
    const p04b = flat(
      '  room id=r_living at (0,0) size 5000x4500 label "Living" uses living',
      '  room id=r_land right-of r_living size 2200x4500 label "Landing" uses hall',
      '  room id=r_bed below r_living align left size 5000x3500 label "Bedroom" uses bedroom',
      "  walls from rooms exterior 200 partition 100",
      "  stair id=st at (5600,500) size 1000x3000 dir down",
      "  door id=d_liv between r_land and r_living at center width 900 swing into r_living",
      "  door id=d_bed between r_living and r_bed at center width 900 swing into r_bed",
    );
    expect(of(p04b)).toEqual([]);
    expect(of(p04b.replace(/^ {2}stair id=st .*\n/m, ""))).toHaveLength(1);
    // Round 1 (p04d): a duplex whose lower storey has the defect; only the lower storey reports.
    const body = CASE.slice(CASE.indexOf("{\n") + 2, CASE.lastIndexOf("}")).replace(
      /^ {2}units mm\n {2}grid 100\n/,
      "",
    );
    const p04d =
      'plan "Duplex off a corridor" {\n  units mm\n  grid 100\n  level 1 "Lower" {\n' +
      body +
      "    stair id=st at (5300,500) size 1000x3000 dir up\n  }\n" +
      '  level 2 "Upper" {\n' +
      '    room id=u_bed at (0,0) size 5000x4500 label "Main bedroom" uses bedroom\n' +
      '    room id=u_land right-of u_bed size 1600x4500 label "Landing" uses hall\n' +
      "    walls from rooms exterior 200 partition 100\n" +
      '    outdoor balcony at (800,-1600) size 3400x1500 label "Upper balcony"\n' +
      "    stair id=st at (5300,500) size 1000x3000 dir down\n" +
      "    door id=u_d between u_land and u_bed at center width 900 swing into u_bed\n" +
      "    door id=u_balc sliding on u_bed.top at 1600 from start width 1800\n" +
      "    window on u_bed.left at center width 1500\n  }\n}\n";
    expect(compile(p04d).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const ds = of(p04d);
    expect(ds).toHaveLength(1);
    expect(p04d.slice(ds[0]!.span!.start, ds[0]!.span!.end)).toBe(FRONT.trim());
  });

  it("reports a door once when the two rooms it joins each open only into the other", () => {
    // Round 1 (p25): the hall has no other door, so the corridor and the hall both qualify.
    const src = edit("  door id=d_bed between r_hall and r_bed at center width 900 swing into r_bed\n", "").replace(
      "{ open between r_living and r_hall }",
      "",
    );
    expect(src).not.toContain("open between");
    const ds = of(src);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toBe(MESSAGE);
  });

  it("files `non-dwelling` on every non-residential plan, so a plan without the pattern keeps privacy skipped", () => {
    for (const name of ["corner-cafe.arch", "library.arch", "museum.arch", "transit-hall.arch"]) {
      const privacy = lintCoverage(EXAMPLE_FILES[name]!, { world: EXAMPLES_WORLD })!.families.find(
        (f) => f.family === "privacy",
      )!;
      expect(privacy.status, name).toBe("skipped");
      expect(
        privacy.skipped?.map((s) => s.reason),
        name,
      ).toContain("non-dwelling");
    }
  });

  it("reports nothing over the shipped examples, under the default ruleset and every profile", () => {
    expect(Object.keys(EXAMPLE_FILES).length).toBeGreaterThan(40);
    for (const profile of [undefined, ...LINT_PROFILE_NAMES]) {
      const hits = Object.entries(EXAMPLE_FILES).flatMap(([name, src]) =>
        lint(src, { world: EXAMPLES_WORLD, ...(profile === undefined ? {} : { profile }) })
          .filter((d) => d.code === CODE)
          .map(() => name),
      );
      expect(hits, profile ?? "default").toEqual([]);
    }
  });

  it("has a catalogue entry whose example reports it and whose fixed form does not", () => {
    const e = ERROR_CATALOG[CODE]!;
    expect(e.severity).toBe("warning");
    expect(of(e.example!)).toHaveLength(1);
    expect(of(e.fixed!)).toEqual([]);
  });
});
