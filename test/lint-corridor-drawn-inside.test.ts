/**
 * Product roadmap RM9.6, coverage class CV16 (plan-soundness PS2.42): `W_CORRIDOR_DRAWN_INSIDE`,
 * the building's common corridor drawn as a room inside the dwelling's exterior walls. Every door
 * to the outside opens onto an `outdoor balcony`, and an entry, hall or circulation room with no
 * door to the outside opens only into one other room, by a hinged door: the front door.
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
  'Every door to the outside opens onto a balcony, and "Corridor" has no door to the outside: it opens only into "Hall", by a hinged door that reads as the front door. The building\'s corridor looks drawn inside the dwelling\'s exterior walls, so the front door reads as an inside door and the only way in reads as the balcony.';

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
