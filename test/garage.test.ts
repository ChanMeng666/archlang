/**
 * `uses garage` — the thirteenth room use, its label vocabulary, and the one advisory rule that
 * reads it.
 *
 * A use kind is cheap to add and easy to add wrongly, so four things are pinned here rather
 * than assumed.
 *
 * **1. The word reaches every layer that spells the closed set out.** `USE_KINDS` is the
 * parser's accept list, the formatter's print order, both generators' alternation and the Plan
 * JSON projection's key set; a value present in one and missing from another is the v1.26.0
 * defect class. The additions are asserted at the END of the list, because that order is what
 * a published grammar renders.
 *
 * **2. The label classifier's emission order did not move.** `describe().rooms[].uses` is an
 * ARRAY that agents diff, so `garage` is appended to `classifyLabelUses`'s sequence rather than
 * slotted in beside `storage`. A room that classified as `[bedroom, bath]` before still does.
 *
 * **3. `W_GARAGE_TOO_NARROW` is calibrated, and the calibration is the interesting part.** The
 * bay figure is 2700 mm, not the rounder 3000: a 5500 mm double garage is a normal buildable
 * layout — `examples/hillside-villa.arch` has one — and a rule that warns about it is a false
 * positive, which is the failure mode the fixture catalog's own clearance rule names. Both
 * sides of that boundary are pinned below.
 *
 * **4. The rule DECLINES a polygon room.** Measuring a concave floor's "clear width" from its
 * bounding box is the derived-position defect class this compiler has shipped six instances of.
 * No warning is the right answer there, and it is asserted rather than left to the reader.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint, format, planToJson, planFromJson } from "../src/index.js";
import { USE_KINDS } from "../src/ast.js";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { USE_VOCABULARY, classifyLabelUses } from "../src/vocabulary.js";
import { PLAN_JSON_SCHEMA, ROOM_TYPE_TO_USE, USE_TO_ROOM_TYPE, roomTypeForUses } from "../src/plan-json.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";

/** A garage of the given size, optionally with cars in it. */
const plan = (w: number, h: number, cars = 0, uses = "uses garage", shape?: string): string =>
  [
    'plan "G" {',
    "  units mm",
    `  wall id=shell exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }`,
    shape ?? `  room id=g at (0,0) size ${w}x${h} label "Garage" ${uses}`,
    `  door on shell at 50% width 3000`,
    ...Array.from({ length: cars }, (_, i) => `  furniture car at (${300 + i * 2200},600) size 1800x4600 in g`),
    "}",
  ].join("\n");

const codes = (src: string): string[] => lint(src).map((d) => d.code);
const garageWarning = (src: string) => lint(src).find((d) => d.code === "W_GARAGE_TOO_NARROW");

suite("uses garage — the word reaches every closed set", () => {
  it("is the last USE_KINDS value, so no published alternation re-orders", () => {
    expect(USE_KINDS).toContain("garage");
    expect(USE_KINDS[USE_KINDS.length - 1]).toBe("garage");
    // …and the twelve that came before are untouched, in order.
    expect(USE_KINDS.slice(0, -1)).toEqual([
      "living",
      "kitchen",
      "dining",
      "bedroom",
      "bath",
      "wc",
      "hall",
      "circulation",
      "storage",
      "utility",
      "office",
      "entry",
    ]);
  });

  it("is a highlighting keyword, exactly once", () => {
    // The bucket is flat and shared: `door garage …` and `uses garage` are the same word here,
    // and a SECOND entry would make both generators emit the alternation twice.
    expect(KEYWORDS.enum).toContain("garage");
    expect(KEYWORDS.enum.filter((k) => k === "garage")).toHaveLength(1);
  });

  it("parses, describes and formats round-trip", () => {
    const src = plan(6000, 6000);
    expect(compile(src, { noCache: true }).errors).toEqual([]);
    expect(describePlan(src).rooms[0]?.uses).toEqual(["garage"]);
    expect(format(src)).toContain("uses garage");
    // The formatted source still compiles to the same drawing.
    expect(compile(format(src), { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("maps to the RPLAN `Storage` room_type, and the inverse is lossy on purpose", () => {
    expect(USE_TO_ROOM_TYPE.garage).toBe("Storage");
    expect(roomTypeForUses(["garage"])).toBe("Storage");
    // RPLAN has no garage category, so the many-to-one collapse sends it where `utility`
    // already goes, and `Storage` maps back to `storage`. That loss only bites a document
    // that carries a `room_type` and no `uses` — an explicit tag is authoritative.
    expect(ROOM_TYPE_TO_USE.Storage).toBe("storage");
  });

  it("survives a Plan JSON round trip, tag and drawing alike", () => {
    // This is the assertion that would have caught the bug this change actually found: the
    // validator's `uses` allow-list was a hand-typed twelve-name literal, so `planToJson`
    // emitted `uses: ["garage"]` and its own `planFromJson` rejected it with E_JSON_SCHEMA.
    // Both that list and the schema's enum are interpolated from USE_KINDS now.
    const src = plan(6000, 6000, 1);
    const { json, diagnostics: outDiags } = planToJson(src);
    expect(outDiags.filter((d) => d.severity === "error")).toEqual([]);
    expect((json as { rooms: { uses?: string[]; room_type?: string }[] }).rooms[0]).toMatchObject({
      uses: ["garage"],
      room_type: "Storage",
    });
    const back = planFromJson(json);
    expect(back.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(back.source).toContain("uses garage");
    expect(compile(back.source!, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("interpolates the wire format's `uses` enum rather than retyping it", () => {
    const rooms = (PLAN_JSON_SCHEMA as any).properties.rooms.items.properties;
    expect(rooms.uses.items.enum).toEqual([...USE_KINDS]);
  });
});

suite("uses garage — the label vocabulary", () => {
  it("classifies a Garage from its label, canonically", () => {
    const m = classifyLabelUses("Garage");
    expect(m.uses).toEqual(["garage"]);
    expect(m.aliases).toEqual([]);
  });

  it("classifies a carport or a parking space from an ALIAS, so lint can advise a tag", () => {
    for (const [label, word] of [
      ["Carport", "carport"],
      ["Car Port", "car port"],
      ["Parking", "parking"],
    ] as const) {
      const m = classifyLabelUses(label);
      expect(m.uses, label).toEqual(["garage"]);
      expect(m.aliases, label).toEqual([{ kind: "garage", word }]);
    }
  });

  it("is token-bounded, so it does not eat a word that merely contains one", () => {
    // The matcher's whole point: "Garageband" is not a garage, and "Parkinson" is not parking.
    expect(classifyLabelUses("Garageband").uses).toEqual([]);
    expect(classifyLabelUses("Parkinson Suite").uses).toEqual([]);
    // …while a numeric suffix still resolves, like every other kind.
    expect(classifyLabelUses("Garage 2").uses).toEqual(["garage"]);
  });

  it("raises W_ALIAS_MATCH on a carport and not on a garage", () => {
    const carport = plan(6000, 6000, 0, "", '  room id=g at (0,0) size 6000x6000 label "Carport"');
    expect(codes(carport)).toContain("W_ALIAS_MATCH");
    const garage = plan(6000, 6000, 0, "", '  room id=g at (0,0) size 6000x6000 label "Garage"');
    expect(codes(garage)).not.toContain("W_ALIAS_MATCH");
  });

  it("appends to the classifier's emission order rather than joining the middle of it", () => {
    // `uses` is an array agents diff, so an existing label's sequence must be untouched.
    expect(classifyLabelUses("Master Bedroom with Ensuite").uses).toEqual(["bedroom", "bath"]);
    expect(classifyLabelUses("Kitchen").uses).toEqual(["kitchen"]);
    // A label that reads as two kinds, one of them the new one, puts the new one LAST.
    expect(classifyLabelUses("Garage Utility Entrance").uses).toEqual(["entry", "garage"]);
  });

  it("keeps `garage` out of the canonical lists of every other concept", () => {
    for (const [kind, entry] of Object.entries(USE_VOCABULARY)) {
      if (kind === "garage") continue;
      expect([...entry.canonical, ...entry.aliases], kind).not.toContain("garage");
    }
  });
});

suite("W_GARAGE_TOO_NARROW — the measured rule", () => {
  it("is catalogued as a warning with a cause, a fix and an example", () => {
    const e = ERROR_CATALOG.W_GARAGE_TOO_NARROW;
    expect(e?.severity).toBe("warning");
    expect(e?.cause).toContain("2700");
  });

  it("warns on a single bay under 2700 mm and stays quiet at it", () => {
    expect(codes(plan(2500, 6000, 1))).toContain("W_GARAGE_TOO_NARROW");
    expect(codes(plan(2700, 6000, 1))).not.toContain("W_GARAGE_TOO_NARROW");
  });

  it("scales with the cars actually drawn in the room", () => {
    // Two cars want 5400. 5500 passes — which is the calibration that matters, because
    // `examples/hillside-villa.arch`'s double garage is 5500 and a rounder 3000-per-bay
    // figure would warn about a normal, buildable layout.
    expect(codes(plan(5500, 6000, 2))).not.toContain("W_GARAGE_TOO_NARROW");
    expect(codes(plan(5300, 6000, 2))).toContain("W_GARAGE_TOO_NARROW");
    // …and the same 5300 room is fine with one car in it.
    expect(codes(plan(5300, 6000, 1))).not.toContain("W_GARAGE_TOO_NARROW");
  });

  it("measures an EMPTY garage against one bay", () => {
    // A room you could not park in does not become sound by having no car drawn in it.
    expect(codes(plan(2400, 6000, 0))).toContain("W_GARAGE_TOO_NARROW");
    expect(codes(plan(3000, 6000, 0))).not.toContain("W_GARAGE_TOO_NARROW");
  });

  it("does not count a bicycle or a motorcycle toward the bay total", () => {
    const src = [
      'plan "G" {',
      "  units mm",
      "  wall id=shell exterior thickness 200 { (0,0) (3000,0) (3000,6000) (0,6000) close }",
      '  room id=g at (0,0) size 3000x6000 label "Garage" uses garage',
      "  door on shell at 50% width 900",
      "  furniture bicycle at (300,300) size 600x1800 in g",
      "  furniture motorcycle at (1400,300) size 800x2100 in g",
      "}",
    ].join("\n");
    expect(codes(src)).not.toContain("W_GARAGE_TOO_NARROW");
  });

  it("quotes the required width, the width it has, and the shortfall", () => {
    const d = garageWarning(plan(2500, 6000, 1));
    expect(d?.message).toContain("2500 mm across its short side");
    expect(d?.message).toContain("under the 2700 mm 1 bay need");
    expect(d?.message).toContain("200 mm short");
    const two = garageWarning(plan(4000, 8000, 2));
    expect(two?.message).toContain("under the 5400 mm 2 bays need (2 cars)");
    expect(two?.message).toContain("1400 mm short");
    const empty = garageWarning(plan(2400, 6000, 0));
    expect(empty?.message).toContain("no car drawn, so one bay is assumed");
  });

  it("measures the SHORT side whichever page axis it is on", () => {
    expect(codes(plan(6000, 2500, 0))).toContain("W_GARAGE_TOO_NARROW");
    expect(garageWarning(plan(6000, 2500, 0))?.message).toContain("2500 mm across its short side");
  });

  it("DECLINES a polygon room rather than measuring its bounding box", () => {
    // A concave floor's clear width is not its box's short side, and a derived measurement
    // taken from the box instead of the shape is the defect class this repo has shipped six
    // of. The L below has a 2000 mm leg — narrower than any bay — and is deliberately silent.
    const src = [
      'plan "G" {',
      "  units mm",
      "  wall id=shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }",
      '  room id=g polygon (0,0) (6000,0) (6000,2000) (2000,2000) (2000,6000) (0,6000) label "Garage" uses garage',
      "  door on shell at 50% width 900",
      "}",
    ].join("\n");
    expect(compile(src, { noCache: true }).errors).toEqual([]);
    expect(codes(src)).not.toContain("W_GARAGE_TOO_NARROW");
  });

  it("fires on a label-classified garage, and an explicit `uses` overrides the label", () => {
    const byLabel = plan(2400, 6000, 0, "", '  room id=g at (0,0) size 2400x6000 label "Garage"');
    expect(codes(byLabel)).toContain("W_GARAGE_TOO_NARROW");
    // A store that happens to be called a garage: the authored tag wins over the label.
    const tagged = plan(2400, 6000, 0, "", '  room id=g at (0,0) size 2400x6000 label "Garage" uses storage');
    expect(codes(tagged)).not.toContain("W_GARAGE_TOO_NARROW");
  });

  it("has no machine-applicable fix — widening a room is a geometric decision", () => {
    expect(garageWarning(plan(2500, 6000, 1))?.fixes ?? []).toEqual([]);
  });
});

suite("uses garage — the byte-identity law", () => {
  const PLANS = ["examples/studio.arch", "examples/laneway-house.arch", "examples/bungalow.arch"];

  it("leaves a plan that uses no garage exactly as it was", async () => {
    // The law every new form ships with: adding a use kind may not move a plan that does not
    // use it. Asserted over the whole agent-facing surface — the drawing, the summary AND the
    // diagnostics — because a form that appends an empty key to every summary leaves the
    // drawing untouched and is still a change for every `arch describe --json` consumer.
    const { readFileSync } = await import("node:fs");
    for (const f of PLANS) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const out = compile(src, { noCache: true });
      expect(out.errors, f).toEqual([]);
      const summary = describePlan(src);
      expect(JSON.stringify(summary), f).not.toContain("garage");
      for (const room of summary.rooms) expect(room.uses ?? [], `${f} ${room.id}`).not.toContain("garage");
      expect(
        lint(src).map((d) => d.code),
        f,
      ).not.toContain("W_GARAGE_TOO_NARROW");
    }
  });
});
