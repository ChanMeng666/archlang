/**
 * The site & orientation layer — `site { street … [hemisphere …] }`, its five derived
 * direction NAMES, the one lint rule that reads them, and the intent channel's symbolic
 * `windows.facing`.
 *
 * Four things this suite exists to hold down:
 *
 * 1. **The byte-identity law.** A plan that declares no `site` is byte-identical in every
 *    backend, and its `describe()` / `lint()` / `validateIntent()` output is unchanged
 *    field for field. `site` draws nothing, so a plan that DOES declare one renders
 *    identically to its site-less twin too.
 * 2. **The derivation is closed form and total.** Five names, four table lookups and one
 *    negation — no sun model, no latitude, no date, no threshold. The `_side` names
 *    report an ASPECT; the honesty clause that says so is pinned here so it cannot be
 *    quietly dropped from the schema an LLM is prompted with.
 * 3. **The vocabulary weld, including its deliberate asymmetry.** `south`/`east`/`west`
 *    are in `KEYWORDS.enum` and `north` is NOT — see the `north` case below for why that
 *    is on purpose and must not be "fixed".
 * 4. **The refusals.** `E_SITE_NO_STREET`, `E_SITE_DUP`, and — the one that matters most —
 *    `E_INTENT_NO_SITE`: a symbolic facing against a plan with no `site` is an
 *    unanswerable question, never a silent pass and never a silent miss.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe as describePlan, lint, validateIntent, planToJson, planFromJson } from "../src/index.js";
import { compassLetter, deriveSite, oppositeLetter, SYMBOLIC_FACINGS } from "../src/site.js";
import { COMPASS_DIRECTIONS, HEMISPHERES } from "../src/ast.js";
import { KEYWORDS } from "../src/grammar/tokens.js";
import { INTENT_JSON_SCHEMA, intentFromJson } from "../src/intent.js";
import { PLAN_JSON_SCHEMA } from "../src/plan-json.js";
import { format } from "../src/format.js";
import { parse } from "../src/parser.js";
import { toDxf } from "../src/export/dxf.js";
import { renderAscii } from "../src/backends/ascii.js";
import type { Intent } from "../src/intent.js";

/** A two-room plan: `liv` lit from the page bottom, `bed` from the page top. */
const body = `
  wall exterior thickness 200 { (0,0) (8000,0) (8000,6000) (0,6000) close }
  wall partition thickness 100 { (5000,0) (5000,6000) }
  room id=liv at (0,0) size 5000x6000 label "Living"
  room id=bed at (5000,0) size 3000x6000 label "Bedroom"
  door on exterior at 10% width 900
  door on partition at 50% width 800
  window id=w_liv at (2500,6000) width 1400
  window id=w_bed at (6500,0) width 1400
`;

const planWith = (settings: string): string => `plan "P" {\n  units mm\n${settings}${body}}\n`;

const NO_SITE = planWith("");
const WITH_SITE = planWith("  site { street north }\n");

suite("site — the byte-identity law", () => {
  it("renders identically with and without a `site` block, in every zero-dep backend", () => {
    const a = compile(NO_SITE);
    const b = compile(WITH_SITE);
    expect(b.svg).toBe(a.svg);
    expect(toDxf(b.scene!)).toBe(toDxf(a.scene!));
    expect(renderAscii(b.scene!)).toBe(renderAscii(a.scene!));
    // Page size too: `site` reaches no geometry, so nothing about the sheet moves.
    expect(b.scene!.width).toBe(a.scene!.width);
    expect(b.scene!.height).toBe(a.scene!.height);
  });

  it("leaves `describe()` byte-identical apart from the appended `site` key", () => {
    const a = describePlan(NO_SITE) as unknown as Record<string, unknown>;
    const b = describePlan(WITH_SITE) as unknown as Record<string, unknown>;
    expect(a.site).toBeUndefined();
    expect(b.site).toBeDefined();
    // The key is ABSENT, not null — the discipline `sheet` and `axes` keep.
    expect(Object.hasOwn(a, "site")).toBe(false);
    const { site: _drop, ...rest } = b;
    expect(rest).toEqual(a);
  });

  it("cannot change lint output for a plan with no `site` — the rule returns before it looks", () => {
    // `bed`'s only window faces N; with `street north` (equator side S) that IS the
    // W_ROOM_NOT_EQUATOR_FACING condition, so this pair proves the gate is the `site`
    // block itself rather than the geometry.
    const withoutSite = lint(NO_SITE);
    expect(withoutSite.map((d) => d.code)).not.toContain("W_ROOM_NOT_EQUATOR_FACING");
    const withSite = lint(WITH_SITE);
    expect(withSite.map((d) => d.code)).toContain("W_ROOM_NOT_EQUATOR_FACING");
    // Appended LAST: every diagnostic the site-less plan raised is still in the same
    // position, in the same order.
    expect(withSite.slice(0, withoutSite.length)).toEqual(withoutSite);
  });

  it("is deterministic — `compile(s) === compile(s)` on a site-bearing plan", () => {
    expect(compile(WITH_SITE).svg).toBe(compile(WITH_SITE).svg);
  });
});

suite("site — the derivation is closed form and total", () => {
  it("maps every source word to its letter and back", () => {
    expect(COMPASS_DIRECTIONS.map(compassLetter)).toEqual(["N", "S", "E", "W"]);
    for (const w of COMPASS_DIRECTIONS) expect(oppositeLetter(oppositeLetter(compassLetter(w)))).toBe(compassLetter(w));
  });

  it("derives every name for every (street, hemisphere) pair — a total function", () => {
    for (const street of COMPASS_DIRECTIONS) {
      for (const hemisphere of HEMISPHERES) {
        const f = deriveSite({ street, hemisphere });
        expect(f.street).toBe(compassLetter(street));
        expect(f.back).toBe(oppositeLetter(compassLetter(street)));
        // `hemisphere` decides exactly ONE thing, and this is it.
        expect(f.equator_side).toBe(hemisphere === "north" ? "S" : "N");
        // The sun rises in the east in BOTH hemispheres, which is why neither of these
        // reads `hemisphere`.
        expect(f.sunrise_side).toBe("E");
        expect(f.sunset_side).toBe("W");
        expect(f.hemisphere).toBe(hemisphere);
        // Every symbolic facing an intent may assert resolves to a letter.
        for (const name of SYMBOLIC_FACINGS) expect(["N", "S", "E", "W"]).toContain(f[name]);
      }
    }
  });

  it("reports the derived names on `describe().site`, as compass letters", () => {
    expect(describePlan(planWith("  site { street south }\n")).site).toEqual({
      street: "S",
      back: "N",
      equator_side: "S",
      sunrise_side: "E",
      sunset_side: "W",
      hemisphere: "north",
    });
    expect(describePlan(planWith("  site { street south hemisphere south }\n")).site?.equator_side).toBe("N");
  });

  it("reads `street` as a TRUE compass direction — it composes with `north`, never replaces it", () => {
    // The declared street direction is a compass fact, so rotating the PAGE cannot move
    // it; what `north right` moves is which page edge a window's `facing` reports.
    const up = describePlan(planWith("  north up\n  site { street north }\n"));
    const right = describePlan(planWith("  north right\n  site { street north }\n"));
    expect(right.site).toEqual(up.site);
    const facing = (s: typeof up, id: string): string => s.windows.find((w) => w.id === id)!.facing;
    expect(facing(up, "w_bed")).toBe("N");
    expect(facing(right, "w_bed")).toBe("W");
  });
});

suite("site — the grammar and its vocabulary weld", () => {
  it("is the same vocabulary the grammar highlights (tokens.ts drift guard)", () => {
    expect(KEYWORDS.control as readonly string[]).toContain("site");
    for (const h of HEMISPHERES) {
      // `north` is the one hemisphere word that is not here — see the next case.
      if (h === "north") continue;
      expect(KEYWORDS.enum as readonly string[]).toContain(h);
    }
    for (const d of COMPASS_DIRECTIONS) {
      if (d === "north") continue;
      expect(KEYWORDS.enum as readonly string[]).toContain(d);
    }
  });

  it("deliberately keeps `north` OUT of KEYWORDS.enum — do not 'fix' the three-of-four asymmetry", () => {
    // `north` already lives in KEYWORDS.attribute, because `north up` is a STATEMENT. No
    // word in `src/grammar/tokens.ts` appears in two categories, and the generators build
    // flat alternations from those lists: adding `north` here would create the first
    // duplicate and every KEYWORDS consumer would have to be audited for set-vs-list
    // assumptions. The cost of leaving it out is cosmetic — in `site { street north }` the
    // word is coloured as a setting keyword rather than an enum value, one word in one
    // position — and the parser is unaffected either way (the lexer emits every word as an
    // `ident`; keywords are recognised at parse time). This pin exists because three of
    // four compass words in one list LOOKS like an oversight and is not.
    expect(KEYWORDS.attribute as readonly string[]).toContain("north");
    expect(KEYWORDS.enum as readonly string[]).not.toContain("north");
    expect(parse(planWith("  site { street north }\n")).diagnostics).toEqual([]);
  });

  it("accepts the fields in either order and defaults the hemisphere to north", () => {
    const a = parse(planWith("  site { hemisphere south street east }\n"));
    expect(a.diagnostics).toEqual([]);
    expect(a.plan?.site).toMatchObject({ street: "east", hemisphere: "south" });
    expect(parse(planWith("  site { street east }\n")).plan?.site).toMatchObject({ hemisphere: "north" });
  });

  it("refuses a `site` with no `street` (E_SITE_NO_STREET)", () => {
    const d = parse(planWith("  site { hemisphere south }\n")).diagnostics;
    expect(d.map((x) => x.code)).toContain("E_SITE_NO_STREET");
  });

  it("refuses a second `site` block (E_SITE_DUP) and keeps the first", () => {
    const r = parse(planWith("  site { street north }\n  site { street south }\n"));
    const dup = r.diagnostics.find((x) => x.code === "E_SITE_DUP");
    expect(dup).toBeDefined();
    // Two `street` values CONTRADICT — unlike two `axes` blocks, which append.
    expect(r.plan?.site?.street).toBe("north");
  });

  it("spans an unknown word and offers a did-you-mean", () => {
    const bad = parse(planWith("  site { street northe }\n")).diagnostics[0]!;
    expect(bad.message).toContain('did you mean "north"');
    expect(planWith("  site { street northe }\n").slice(bad.span!.start, bad.span!.end)).toBe("northe");
    const field = parse(planWith("  site { hemispere north }\n")).diagnostics[0]!;
    expect(field.message).toContain('did you mean "hemisphere"');
  });

  it("round-trips through `arch fmt`, idempotently, in the slot after `north`", () => {
    const src = planWith("  site { street south hemisphere south }\n");
    const once = format(src);
    expect(once).toContain("site {");
    expect(once).toContain("street south");
    expect(once).toContain("hemisphere south");
    expect(once.indexOf("north ")).toBeLessThan(once.indexOf("site {"));
    expect(format(once)).toBe(once);
    expect(describePlan(once).site).toEqual(describePlan(src).site);
  });

  it("ignores an IMPORTED module's site, exactly as it ignores its `north`", () => {
    const world = {
      read: (p: string) =>
        p === "wing.arch"
          ? 'plan "W" {\n  units mm\n  site { street east }\n  room at (0,0) size 2000x2000 label "Wing"\n}\n'
          : null,
      resolve: (_from: string, spec: string) => spec,
    };
    const src =
      'plan "P" {\n  units mm\n  site { street north }\n  import "wing.arch" as wing\n  place wing() as w at (0,0)\n}\n';
    // The ROOT plan's site governs: one drawing is issued on one sheet, at one
    // orientation, and an imported wing must not be able to re-orient the building.
    expect(describePlan(src, { world }).site?.street).toBe("N");
  });
});

suite("site — W_ROOM_NOT_EQUATOR_FACING", () => {
  const codes = (src: string): (string | undefined)[] => lint(src).map((d) => d.code);

  it("fires on a habitable room whose windows all miss the equator side", () => {
    const d = lint(WITH_SITE).find((x) => x.code === "W_ROOM_NOT_EQUATOR_FACING")!;
    expect(d.severity).toBe("warning");
    expect(d.message).toContain("Bedroom");
    expect(d.message).toContain("none facing S");
    // No machine fix: the remedy is geometry the compiler must not choose (ADR 0005).
    expect(d.fixes).toBeUndefined();
    // And it says what it is, on the surface the reader sees.
    expect(d.hints?.join(" ")).toContain("not a daylight measurement");
  });

  it("does not fire on a room that DOES have an equator-facing window — the hemisphere flips which", () => {
    // `liv`'s window is on the page bottom (S), `bed`'s on the top (N). Northern
    // hemisphere ⇒ equator side S ⇒ only `bed` is flagged; southern ⇒ equator side N ⇒
    // only `liv` is. The room that is clear is clear because of its OWN window, and the
    // rule's only hemisphere-dependent input is which letter it is looking for.
    const flagged = (src: string): string[] =>
      lint(src)
        .filter((d) => d.code === "W_ROOM_NOT_EQUATOR_FACING")
        .map((d) => d.message);
    expect(flagged(WITH_SITE).join(" ")).toContain("Bedroom");
    expect(flagged(WITH_SITE).join(" ")).not.toContain("Living");
    const southern = flagged(planWith("  site { street north hemisphere south }\n"));
    expect(southern.join(" ")).toContain("Living");
    expect(southern.join(" ")).not.toContain("Bedroom");
  });

  it("does not double-report a room that has NO window (that is W_BEDROOM_NO_WINDOW)", () => {
    const src = `plan "P" {
  units mm
  site { street north }
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=bed at (0,0) size 4000x3000 label "Bedroom"
  door on exterior at 50% width 900
}
`;
    expect(codes(src)).toContain("W_BEDROOM_NO_WINDOW");
    expect(codes(src)).not.toContain("W_ROOM_NOT_EQUATOR_FACING");
  });

  it("only considers HABITABLE rooms — a bathroom or store is never flagged", () => {
    const src = `plan "P" {
  units mm
  site { street north }
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=st at (0,0) size 4000x3000 label "Store"
  door on exterior at 50% width 900
  window at (2000,0) width 1000
}
`;
    expect(codes(src)).not.toContain("W_ROOM_NOT_EQUATOR_FACING");
  });

  it("reads the same facing describe() reports — one page→compass conversion, not two", () => {
    // Under `north right` the page-top window `w_bed` faces compass W, so with the
    // equator side at S the rule must still fire, and with `street north hemisphere
    // south` (equator side N) it must not — proving the rule turns by `north` too.
    const rotated = planWith("  north right\n  site { street north }\n");
    expect(describePlan(rotated).windows.find((w) => w.id === "w_bed")!.facing).toBe("W");
    expect(codes(rotated)).toContain("W_ROOM_NOT_EQUATOR_FACING");
  });
});

suite("site — the intent channel's symbolic facing", () => {
  const intentFacing = (facing: string): Intent => ({
    roomsInclude: [{ concept: "bedroom", windows: { min: 1, facing: facing as never } }],
  });

  it("resolves a symbolic facing through the plan's own site", () => {
    // `bed`'s single window faces N. `street north` makes `street` = N, so this passes…
    expect(validateIntent(WITH_SITE, intentFacing("street")).ok).toBe(true);
    // …and `equator_side` (S) fails, with the letter spelled out beside the name.
    const bad = validateIntent(WITH_SITE, intentFacing("equator_side"));
    expect(bad.ok).toBe(false);
    expect(bad.violations[0]!.code).toBe("E_INTENT_NO_WINDOW");
    expect(bad.violations[0]!.message).toContain("equator_side (S)");
  });

  it("refuses a symbolic facing against a plan with no `site` (E_INTENT_NO_SITE)", () => {
    const r = validateIntent(NO_SITE, intentFacing("equator_side"));
    expect(r.ok).toBe(false);
    // A REFUSAL, not a miss: the question cannot be evaluated, so it must not be
    // reported as "the window is not there".
    expect(r.violations[0]!.code).toBe("E_INTENT_NO_SITE");
    expect(r.violations[0]!.gate).toBe(true);
    expect(r.violations[0]!.message).toContain("needs a `site` block");
  });

  it("leaves a LETTER facing byte-identical — detail strings and all", () => {
    const letter = validateIntent(NO_SITE, intentFacing("N"));
    expect(letter.ok).toBe(true);
    expect(letter.assertions.at(-1)!.detail).toBe('windows: concept "bedroom" ok (found 1 facing N)');
    // A facing-free assertion still says nothing about facing.
    const bare = validateIntent(NO_SITE, { roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }] });
    expect(bare.assertions.at(-1)!.detail).toBe('windows: concept "bedroom" ok (found 1)');
  });

  it("rides the EXISTING `room-windows` predicate — no new kind, no tier change", () => {
    const preds = validateIntent(WITH_SITE, intentFacing("equator_side")).assertions.map((a) => a.predicate);
    const w = preds.find((p) => p.kind === "room-windows")!;
    expect(w.gate).toBe(true);
    expect(preds.some((p) => p.kind !== "room-exists" && p.kind !== "room-windows")).toBe(false);
  });

  it("validates the widened enum on input and names every value it accepts", () => {
    for (const f of ["N", "S", "E", "W", ...SYMBOLIC_FACINGS]) {
      const { errors } = intentFromJson({ roomsInclude: [{ concept: "bedroom", windows: { facing: f } }] });
      expect(errors).toEqual([]);
    }
    const { intent, errors } = intentFromJson({
      roomsInclude: [{ concept: "bedroom", windows: { facing: "good_sun" } }],
    });
    expect(intent).toBeNull();
    expect(errors.join(" ")).toContain("equator_side");
  });
});

suite("site — the honesty clause is pinned, on every surface that emits the names", () => {
  // The load-bearing claim of this whole layer: `equator_side`/`sunrise_side`/
  // `sunset_side` name an ASPECT, not a daylight outcome. The consumer is a model, and a
  // model that reads only the schema is exactly the reader that would otherwise translate
  // "a sunny living room" into a gate that verifies something else — constraint
  // laundering, one level down, in the vocabulary. If one of these assertions fails
  // because the sentence was trimmed, restore the sentence; do not relax the test.
  const facingSchema = INTENT_JSON_SCHEMA.properties.roomsInclude.items.properties.windows.properties.facing;

  it("says so in the intent schema an LLM is prompted with", () => {
    expect(facingSchema.description).toContain("DRAFTING HEURISTIC");
    expect(facingSchema.description).toContain("NOT a measured daylight outcome");
    expect(facingSchema.description).toContain("no sun model");
    expect(facingSchema.description).toContain("E_INTENT_NO_SITE");
  });

  it("says so in the Plan JSON schema", () => {
    expect(PLAN_JSON_SCHEMA.properties.site.description).toContain("NOT a daylight measurement");
    expect(PLAN_JSON_SCHEMA.properties.site.description).toContain("no sun model");
  });

  it("spends no token on the word `sun` as a NAME — the names are all `_side`", () => {
    // The rejected spelling. `good_sun` would pass a gate while telling the brief's
    // author something the check never verified.
    expect(SYMBOLIC_FACINGS).not.toContain("good_sun" as never);
    for (const n of SYMBOLIC_FACINGS) expect(n.endsWith("_sun")).toBe(false);
  });

  it("accepts no latitude, longitude, date or season anywhere in the grammar", () => {
    // Refused BY NAME in the design so a later session does not read silence as an
    // invitation: the first thing any of them buys you is a sun path, which is precisely
    // the simulation the standing verdict refuses.
    for (const word of ["latitude", "longitude", "date", "season", "sunhours"]) {
      const r = parse(planWith(`  site { street north ${word} 51 }\n`));
      expect(r.diagnostics.length).toBeGreaterThan(0);
    }
  });
});

suite("site — the Plan JSON round trip", () => {
  it("carries `site` out and back in, so a round trip cannot lose the orientation", () => {
    const json = planToJson(WITH_SITE).json!;
    expect(json.site).toEqual({ street: "north", hemisphere: "north" });
    const { source } = planFromJson(json);
    expect(describePlan(source!).site).toEqual(describePlan(WITH_SITE).site);
  });

  it("emits no `site` key at all for a plan that declares none", () => {
    expect(Object.hasOwn(planToJson(NO_SITE).json!, "site")).toBe(false);
  });

  it("rejects a bad site on input at its JSON path", () => {
    const json = { ...planToJson(WITH_SITE).json!, site: { street: "up" } };
    const { diagnostics } = planFromJson(json);
    expect(diagnostics.some((d) => d.message.includes("/site/street"))).toBe(true);
  });
});
