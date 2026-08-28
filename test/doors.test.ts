/**
 * The door vocabulary (v1.25) — four kinds beside `hinged`, `slide`, `open`, and the
 * `W_POCKET_RUN` soundness rule.
 *
 * The properties, in the order they matter:
 *
 *  1. **Byte identity.** A plan that names no kind, no `slide` and no `open` compiles
 *     to exactly the bytes it did before the feature — SVG, DXF, ASCII, `describe`,
 *     `lint` and Plan JSON alike — and writing the default kind explicitly (`door
 *     hinged …`) is indistinguishable from omitting it. The repo-wide half of this is
 *     the untouched snapshot/golden/ASCII/DXF suites; the half that can be *stated*
 *     rather than merely observed is here.
 *  2. **A kind changes two things and only two:** whether a swing arc exists, and what
 *     is drawn in the reveal. The four kind-INDEPENDENT invariants (the wall boolean,
 *     the opening cover polygon, `describe()` adjacency, the walk-through landing) are
 *     pinned, because "the sliding door stopped tripping the swing rule" is right and
 *     "it stopped tripping the landing rule" is a regression.
 *  3. **Refuse, never approximate.** A clause a kind has no meaning for is an error
 *     with a machine-applicable deletion, in BOTH directions; so is a non-hinged kind
 *     on a curved host, and an `open` outside [0,1].
 *  4. **`W_POCKET_RUN` measures**, subtracts intervening openings, and carries exactly
 *     one applicable fix — reversing the slide, and only when the reverse is proved to
 *     fit. "Narrow it" is a hint and must never become a fix.
 *  5. **Determinism** with the optional clipper2 backend registered *and* cleared.
 */

import { afterAll, describe as suite, expect, it } from "vitest";
import {
  applyFixes,
  compile,
  describe as describePlan,
  format,
  getGeometryBackend,
  lint,
  loadClipperBackend,
  planToJson,
  renderAscii,
  setGeometryBackend,
  toDxf,
} from "../src/index.js";
import { doorSwing } from "../src/geometry.js";
import { DOOR_KINDS } from "../src/grammar/tokens.js";
import type { RDoor } from "../src/ir.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

/** A two-room plan whose middle partition hosts the door under test. */
const plan = (door: string, extra = ""): string =>
  [
    'plan "Doors" {',
    "  units mm",
    "  wall exterior thickness 200 { (0,0) (12000,0) (12000,6000) (0,6000) close }",
    "  wall id=mid partition thickness 100 { (6000,0) (6000,6000) }",
    '  room id=west at (0,0) size 6000x6000 label "West"',
    '  room id=east at (6000,0) size 6000x6000 label "East"',
    "  door id=front on exterior at 10% width 1000",
    `  ${door}`,
    extra,
    "}",
  ].join("\n");

const clean = (src: string): string => {
  const r = compile(src, { noCache: true });
  expect(r.errors.map((e) => e.message)).toEqual([]);
  return r.svg;
};

/** The resolved doors of a source, straight off the IR. */
const doorsOf = (src: string): RDoor[] => {
  const { ir } = resolve(parse(src).plan!);
  return ir.elements.filter((e): e is RDoor => e.kind === "door");
};

const codes = (src: string): string[] => lint(src).map((d) => d.code ?? "");

// ---------------------------------------------------------------------------
// 1 — the byte-identity law
// ---------------------------------------------------------------------------

suite("doors — the byte-identity law", () => {
  const omitted = plan("door id=d on mid at 50% width 900 hinge left swing in");
  const explicit = plan("door id=d hinged on mid at 50% width 900 hinge left swing in");

  it("`door hinged …` is byte-identical to omitting the kind, in every output", () => {
    expect(clean(explicit)).toBe(clean(omitted));
    expect(toDxf(compile(explicit, { noCache: true }).scene!)).toBe(toDxf(compile(omitted, { noCache: true }).scene!));
    expect(renderAscii(compile(explicit, { annotate: true, noCache: true }).scene!)).toBe(
      renderAscii(compile(omitted, { annotate: true, noCache: true }).scene!),
    );
    expect(JSON.stringify(describePlan(explicit))).toBe(JSON.stringify(describePlan(omitted)));
    expect(JSON.stringify(lint(explicit))).toBe(JSON.stringify(lint(omitted)));
    expect(JSON.stringify(planToJson(explicit))).toBe(JSON.stringify(planToJson(omitted)));
  });

  it("a hinged door carries NO new field anywhere — the IR, `describe` and Plan JSON are unchanged", () => {
    // The mechanism behind the law: `hinged` is DROPPED at resolve, so there is nothing
    // downstream to emit conditionally in the first place.
    for (const src of [omitted, explicit]) {
      const d = doorsOf(src).find((x) => x.id === "d")!;
      expect(d.doorKind).toBeUndefined();
      expect(d.slide).toBeUndefined();
      expect(d.open).toBeUndefined();
    }
    expect(describePlan(omitted).doors.every((d) => d.kind === undefined)).toBe(true);
    const json = planToJson(omitted).json!;
    const opening = json.openings.find((o) => o.id === "d")!;
    expect(opening.door_kind).toBeUndefined();
    expect(opening.slide).toBeUndefined();
    expect(opening.open).toBeUndefined();
    // …and the clauses a hinged door DOES take are still emitted, as before.
    expect(opening.hinge).toBe("left");
    expect(opening.swing).toBe("in");
  });

  it("`describe().doors[].kind` appears only on a non-hinged door", () => {
    for (const k of DOOR_KINDS) {
      const src = plan(`door id=d ${k} on mid at 50% width 900`);
      const d = describePlan(src).doors.find((x) => x.id === "d")!;
      expect(d.kind, k).toBe(k === "hinged" ? undefined : k);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — a kind changes the swing arc and the reveal, and NOTHING else
// ---------------------------------------------------------------------------

suite("doors — `doorSwing` is the one place a kind reaches the swing model", () => {
  it("returns a swing for a hinged door and null for every other kind", () => {
    for (const k of DOOR_KINDS) {
      const d = doorsOf(plan(`door id=d ${k} on mid at 50% width 900`)).find((x) => x.id === "d")!;
      expect(doorSwing(d) === null, k).toBe(k !== "hinged");
    }
    // The optional field means every pre-existing caller and fixture is unaffected.
    const d = doorsOf(plan("door id=d on mid at 50% width 900")).find((x) => x.id === "d")!;
    expect(doorSwing(d)).not.toBeNull();
  });

  it("draws a leaf + arc for a hinged door and neither for a non-hinged one", () => {
    const arcs = (src: string): number =>
      compile(src, { noCache: true }).scene!.nodes.filter((n) => n.layer === "doors" && n.prim.t === "arc").length;
    expect(arcs(plan("door id=d on mid at 50% width 900"))).toBe(2); // the front door too
    expect(arcs(plan("door id=d pocket on mid at 50% width 900"))).toBe(1);
  });
});

suite("doors — the four kind-independent invariants", () => {
  const hinged = plan("door id=d on mid at 50% width 900");
  const pocket = plan("door id=d pocket on mid at 50% width 900");

  it("adjacency is the same: a pocket door connects two rooms exactly as a hinged one does", () => {
    const between = (src: string): string[] => describePlan(src).doors.find((d) => d.id === "d")!.between;
    expect(between(pocket)).toEqual(between(hinged));
    // …and so is the access graph it feeds.
    expect(JSON.stringify(describePlan(pocket).access)).toBe(JSON.stringify(describePlan(hinged).access));
  });

  it("the opening cover polygon is still emitted — the ASCII/DXF backends locate the doorway by it", () => {
    const covers = (src: string): number =>
      compile(src, { noCache: true }).scene!.nodes.filter((n) => n.layer === "doors" && n.prim.t === "polygon").length;
    // Every kind emits the cover first, so the count never drops below the hinged one's.
    const base = covers(hinged);
    for (const k of DOOR_KINDS)
      expect(covers(plan(`door id=d ${k} on mid at 50% width 900`)), k).toBeGreaterThanOrEqual(base);
    // And the doorway still reads in the zero-dep text plan.
    expect(renderAscii(compile(pocket, { annotate: true, noCache: true }).scene!).length).toBeGreaterThan(0);
  });

  it("the walk-through landing rule still fires on a sliding door — only the SWING rule stops", () => {
    const blocked = (kind: string): string[] =>
      codes(plan(`door id=d ${kind} on mid at 50% width 900`, "  furniture wc at (5500,2800) size 700x400"));
    // A hinged door in this position trips both the swing arc and the landing.
    expect(blocked("")).toContain("W_SWING_OBSTRUCTED");
    expect(blocked("")).toContain("W_DOORWAY_BLOCKED");
    // A sliding one sweeps nothing — but you still have to walk through it.
    expect(blocked("sliding")).not.toContain("W_SWING_OBSTRUCTED");
    expect(blocked("sliding")).toContain("W_DOORWAY_BLOCKED");
  });

  it("the sub-passable width rule is kind-independent", () => {
    for (const k of DOOR_KINDS) {
      expect(codes(plan(`door id=d ${k} on mid at 50% width 600`)), k).toContain("W_DOOR_CLEARANCE");
    }
  });

  it("`W_SWING_OBSTRUCTED`'s hint set names the kinds that solve it", () => {
    const d = lint(plan("door id=d on mid at 50% width 900", "  furniture wc at (5500,2800) size 700x400")).find(
      (x) => x.code === "W_SWING_OBSTRUCTED",
    )!;
    // P1-5 removed "use a sliding door" because the language could not write one.
    // v1.25 can, so the remedy is back — named by the property that solves it.
    expect(d.hints?.some((h) => /sweeps nothing/.test(h))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3 — refuse, never approximate
// ---------------------------------------------------------------------------

suite("doors — E_DOOR_KIND_CLAUSE refuses in both directions", () => {
  const err = (door: string): { code?: string; message: string } | undefined => {
    const r = compile(plan(door), { noCache: true });
    return r.diagnostics.find((d) => d.code === "E_DOOR_KIND_CLAUSE");
  };

  it("refuses a hinged-only clause on a sliding-family door", () => {
    expect(err("door id=d pocket on mid at 50% width 900 hinge left")?.message).toMatch(
      /is a "pocket" door, which has no `hinge` clause/,
    );
    expect(err("door id=d sliding on mid at 50% width 900 swing in")?.message).toMatch(/no `swing` clause/);
    expect(err("door id=d pocket on mid at 50% width 900 hinge near start")?.message).toMatch(/no `hinge` clause/);
  });

  it("refuses a sliding-only clause on a hinged door", () => {
    expect(err("door id=d on mid at 50% width 900 slide left")?.message).toMatch(
      /is a "hinged" door, which has no `slide` clause/,
    );
    expect(err("door id=d hinged on mid at 50% width 900 open 0.5")?.message).toMatch(/no `open` clause/);
  });

  it("allows `swing` on barn and bifold — the mounting/fold face, the one deliberate overload", () => {
    expect(err("door id=d barn on mid at 50% width 900 swing out")).toBeUndefined();
    expect(err("door id=d bifold on mid at 50% width 900 swing in")).toBeUndefined();
  });

  it("carries a machine-applicable fix that deletes exactly that clause", () => {
    const src = plan("door id=d pocket on mid at 50% width 900 hinge left slide right");
    const fixes = compile(src, { noCache: true }).diagnostics.flatMap((d) => d.fixes ?? []);
    expect(fixes.map((f) => f.fixId)).toContain("door-kind-clause");
    const out = applyFixes(src, fixes);
    expect(out.output).toContain("door id=d pocket on mid at 50% width 900 slide right");
    expect(compile(out.output, { noCache: true }).errors).toEqual([]);
  });
});

suite("doors — a non-hinged kind on a curved host is refused, not approximated", () => {
  const curved = (door: string): string =>
    [
      'plan "C" {',
      "  units mm",
      "  wall id=w exterior thickness 200 { (0,0) arc (8000,0) radius 6000 }",
      `  ${door}`,
      "}",
    ].join("\n");

  it("E_DOOR_KIND_CURVED for every sliding-family kind", () => {
    for (const k of DOOR_KINDS) {
      const got = compile(curved(`door id=d ${k} on w at 50% width 900`), { noCache: true }).diagnostics.some(
        (d) => d.code === "E_DOOR_KIND_CURVED",
      );
      expect(got, k).toBe(k !== "hinged");
    }
  });

  it("a hinged door on the same curve still works — its leaf comes from the tangent", () => {
    expect(compile(curved("door id=d on w at 50% width 900"), { noCache: true }).errors).toEqual([]);
  });
});

suite("doors — `open` is a drawing fact with a stated range", () => {
  it("E_DOOR_OPEN_RANGE outside [0,1], with a clamping fix", () => {
    const src = plan("door id=d sliding on mid at 50% width 1200 open 1.5");
    const diag = compile(src, { noCache: true }).diagnostics.find((d) => d.code === "E_DOOR_OPEN_RANGE")!;
    expect(diag.message).toMatch(/outside the 0–1 range/);
    const out = applyFixes(src, diag.fixes ?? []);
    expect(out.output).toContain("open 1");
    expect(compile(out.output, { noCache: true }).errors).toEqual([]);
    expect(
      compile(plan("door id=d sliding on mid at 50% width 1200 open -2"), { noCache: true }).diagnostics.some(
        (d) => d.code === "E_DOOR_OPEN_RANGE",
      ),
    ).toBe(true);
  });

  it("accepts both ends and defaults to 0.5", () => {
    for (const v of ["0", "0.25", "1"]) {
      expect(
        compile(plan(`door id=d sliding on mid at 50% width 1200 open ${v}`), { noCache: true }).errors,
        v,
      ).toEqual([]);
    }
    const d = doorsOf(plan("door id=d sliding on mid at 50% width 1200")).find((x) => x.id === "d")!;
    expect(d.open).toBe(0.5);
  });

  it("changes NOTHING measured — only the bytes", () => {
    // The laundering guard: if a drawn `open` value could move a measured fact, an
    // author could satisfy a checker by redrawing rather than by fixing.
    const a = plan("door id=d sliding on mid at 50% width 1200 open 0");
    const b = plan("door id=d sliding on mid at 50% width 1200 open 1");
    expect(JSON.stringify(describePlan(a))).toBe(JSON.stringify(describePlan(b)));
    expect(JSON.stringify(lint(a))).toBe(JSON.stringify(lint(b)));
    expect(clean(a)).not.toBe(clean(b)); // …but it IS drawn differently
  });
});

// ---------------------------------------------------------------------------
// 4 — W_POCKET_RUN
// ---------------------------------------------------------------------------

/** A single straight wall of `len` mm with one pocket door on it. */
const pocketPlan = (len: number, pos: string, slide: string, extra = ""): string =>
  [
    'plan "P" {',
    "  units mm",
    `  wall id=w partition thickness 100 { (0,0) (${len},0) }`,
    `  door id=p pocket on w at ${pos} width 900 slide ${slide}`,
    extra,
    "}",
  ].join("\n");

suite("doors — W_POCKET_RUN", () => {
  const pocketDiag = (src: string) => lint(src).find((d) => d.code === "W_POCKET_RUN");

  it("does not fire when the wall runs on far enough past the jamb", () => {
    // 6000 mm wall, door centred at 1000 → the left jamb is at 550, and sliding LEFT
    // has 550 mm; sliding RIGHT has 6000 − 1450 = 4550, well over the 950 required.
    expect(pocketDiag(pocketPlan(6000, "1000", "right"))).toBeUndefined();
  });

  it("fires with the measured requirement, availability and shortfall", () => {
    const d = pocketDiag(pocketPlan(6000, "1000", "left"))!;
    // required = 900 + max(50, 900 × 5%) = 950; available = 1000 − 450 = 550.
    expect(d.message).toBe(
      'Pocket door has nowhere to slide — it needs 950 mm of clear wall past the left jamb but only 550 mm is available on wall "w" (400 mm short).',
    );
  });

  it("uses the TWO-TERM threshold, not a flat ×1.05 ratio", () => {
    // A 700 mm door asks for 700 + max(50, 35) = 750, not the reference's 735. The gap
    // between the two thresholds is the whole divergence, so it is MEASURED rather than
    // asserted: a run of 740 satisfies the flat ratio and fails ours. The door is
    // centred at 350 on a wall from (0,0) to (700+run, 0), so its right jamb is at 700
    // and the run past it is exactly `run`.
    const narrow = (run: number): string =>
      [
        'plan "P" {',
        "  units mm",
        `  wall id=w partition thickness 100 { (0,0) (${700 + run},0) }`,
        "  door id=p pocket on w at 350 width 700 slide right",
        "}",
      ].join("\n");
    expect(pocketDiag(narrow(740))).toBeDefined();
    expect(pocketDiag(narrow(760))).toBeUndefined();
  });

  it("subtracts an intervening opening — a panel cannot slide through a window either", () => {
    // The wall is long enough on its own, but a window sits inside the pocket run.
    const withWindow = pocketPlan(6000, "1000", "right", "  window on w at 2600 width 1000");
    expect(pocketDiag(pocketPlan(6000, "1000", "right"))).toBeUndefined();
    const d = pocketDiag(withWindow)!;
    // the window's near edge is at 2100; the jamb is at 1450 → 650 available.
    expect(d.message).toMatch(/only 650 mm is available/);
  });

  it("offers the reverse-slide fix ONLY when the reverse is proved to fit", () => {
    // Fits the other way: the fix is emitted and applies to a clean plan.
    const src = pocketPlan(6000, "1000", "left");
    const d = pocketDiag(src)!;
    expect(d.fixes?.map((f) => f.fixId)).toEqual(["pocket-run"]);
    const out = applyFixes(src, d.fixes ?? []);
    expect(out.output).toContain("slide right");
    expect(lint(out.output).some((x) => x.code === "W_POCKET_RUN")).toBe(false);

    // Too short BOTH ways: the warning still fires, with no fix at all.
    const stuck = pocketPlan(1800, "900", "left");
    const s = pocketDiag(stuck)!;
    expect(s.fixes).toBeUndefined();
    expect(s.hints?.[0]).toMatch(/that run is no longer/);
  });

  it("inserts a `slide` clause when the author wrote none, before the trailing `open`", () => {
    const src = [
      'plan "P" {',
      "  units mm",
      "  wall id=w partition thickness 100 { (0,0) (6000,0) }",
      "  door id=p pocket on w at 1000 width 900 open 0.3",
      "}",
    ].join("\n");
    const d = pocketDiag(src)!; // defaults to `slide left`, which does not fit
    const out = applyFixes(src, d.fixes ?? []);
    expect(out.output).toContain("width 900 slide right open 0.3");
    expect(compile(out.output, { noCache: true }).errors).toEqual([]);
  });

  it("never offers `narrow it` as an applicable fix — it is a hint on principle", () => {
    const d = pocketDiag(pocketPlan(6000, "1000", "left"))!;
    expect(d.hints?.some((h) => /Narrowing the door is not offered as a fix/.test(h))).toBe(true);
    for (const f of d.fixes ?? []) expect(f.fixId).not.toMatch(/narrow|width/);
  });

  it("is followed only by rules appended after it — no existing plan's diagnostic order moves", async () => {
    const { LINT_RULES } = await import("../src/lint/rules/index.js");
    const names = LINT_RULES.map((r) => r.name);
    const i = names.indexOf("pocket-run");
    expect(i).toBeGreaterThanOrEqual(0);
    // The claim this pin was written for is ORDER STABILITY, not the literal last slot:
    // every rule that existed when `pocket-run` shipped must still run BEFORE it, so no
    // plan written before v1.25 sees its diagnostics move. Until v1.31 those two
    // statements were the same sentence, because `pocket-run` was genuinely last.
    //
    // They are not the same sentence any more, and asserting the weaker one would have
    // been the wrong repair: a rule appended after `pocket-run` is only harmless because
    // it CANNOT FIRE on a plan that predates it (the two below need an `outdoor`
    // statement, which did not exist), so the list of what may follow is exactly that
    // set — named here, one line per rule, rather than left open.
    expect(names.slice(i + 1)).toEqual(["outdoor-overlaps-room", "balcony-no-door"]);
  });

  it("cannot fire on any kind but `pocket`", () => {
    for (const k of DOOR_KINDS.filter((x) => x !== "pocket")) {
      const src = pocketPlan(1800, "900", "left").replace("pocket on", `${k} on`);
      expect(
        lint(src).some((d) => d.code === "W_POCKET_RUN"),
        k,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — the drawing, the round trip and determinism
// ---------------------------------------------------------------------------

suite("doors — every kind draws, within the shipped primitive budget", () => {
  it("emits only primitives all four backends already serialize", () => {
    for (const k of DOOR_KINDS) {
      const scene = compile(plan(`door id=d ${k} on mid at 50% width 1200 ${k === "hinged" ? "" : "slide right"}`), {
        noCache: true,
      }).scene!;
      const kinds = new Set(scene.nodes.filter((n) => n.layer === "doors").map((n) => n.prim.t));
      for (const t of kinds) expect(["polygon", "line", "arc", "circle"], `${k}/${t}`).toContain(t);
      // A non-hinged kind draws something beyond the bare cover.
      if (k !== "hinged") expect(scene.nodes.filter((n) => n.layer === "doors").length).toBeGreaterThan(3);
    }
  });

  it("exports to DXF and ASCII with no per-backend code", () => {
    for (const k of DOOR_KINDS) {
      const r = compile(plan(`door id=d ${k} on mid at 50% width 1200`), { annotate: true, noCache: true });
      expect(r.errors, k).toEqual([]);
      expect(toDxf(r.scene!).length, k).toBeGreaterThan(0);
      expect(renderAscii(r.scene!).length, k).toBeGreaterThan(0);
    }
  });

  it("round-trips through Plan JSON", () => {
    const src = plan("door id=d pocket on mid at 50% width 900 slide right open 0.25");
    const json = planToJson(src).json!;
    const o = json.openings.find((x) => x.id === "d")!;
    expect(o.door_kind).toBe("pocket");
    expect(o.slide).toBe("right");
    expect(o.open).toBe(0.25);
    // A pocket door takes no `hinge`/`swing`, so the projection must not emit one —
    // it would round-trip straight into `E_DOOR_KIND_CLAUSE`.
    expect(o.hinge).toBeUndefined();
    expect(o.swing).toBeUndefined();
  });
});

suite("doors — determinism, with the geometry backend registered and cleared", () => {
  afterAll(() => setGeometryBackend(null));

  it("gives byte-identical SVG for every kind in both backend states", async () => {
    const sources = DOOR_KINDS.map((k) => plan(`door id=d ${k} on mid at 50% width 1200`));
    setGeometryBackend(null);
    expect(getGeometryBackend()).toBeNull();
    const without = sources.map((s) => compile(s, { noCache: true }).svg);
    // …and stable across repeated compiles in the same state.
    expect(sources.map((s) => compile(s, { noCache: true }).svg)).toEqual(without);

    setGeometryBackend(await loadClipperBackend());
    expect(getGeometryBackend()).not.toBeNull();
    const with_ = sources.map((s) => compile(s, { noCache: true }).svg);
    expect(with_).toEqual(without);
  });
});

// ---------------------------------------------------------------------------
// 9 — the formatter must print what the parser read
// ---------------------------------------------------------------------------

/**
 * `format()` printed the door statement WITHOUT its kind, `slide` or `open` for three
 * releases: `door id=d pocket on mid at 50% width 900 slide right` came back as
 * `door id=d on mid at 50% width 900`. That is not a formatting difference but a
 * semantic one — the re-formatted plan is a HINGED door with a swing arc, so
 * `arch fmt --write` and `arch repair`'s emitted source both silently rebuilt the
 * building. It survived because `test/format.test.ts` compares `compile(src)` against
 * `compile(format(src))` over `examples/`, and until `examples/bungalow.arch` not one
 * shipped example used a door kind: the gate was real and the corpus was empty.
 *
 * So this asserts the property directly rather than trusting the corpus — over EVERY
 * kind, and over `slide`/`open` too, checking both that the clause survives the round
 * trip and that the drawing does.
 */
suite("doors — format() round-trips the kind, `slide` and `open`", () => {
  for (const kind of DOOR_KINDS) {
    it(`\`${kind}\` survives format() as source and as bytes`, () => {
      const src = plan(`door id=d ${kind} on mid at 50% width 900`);
      const out = format(src);
      expect(out).toContain(`door id=d ${kind} on mid`);
      expect(compile(out, { noCache: true }).svg).toBe(clean(src));
    });
  }

  it("`slide` and `open` survive too — both are sliding-family only", () => {
    const src = plan("door id=d pocket on mid at 50% width 900 slide right open 0.25");
    const out = format(src);
    expect(out).toContain("door id=d pocket on mid at 50% width 900 slide right open 0.25");
    expect(compile(out, { noCache: true }).svg).toBe(clean(src));
  });

  it("`open 0` survives — the printer tests for PRESENCE, not truthiness", () => {
    // `open` is a [0,1] fraction, so 0 is a legal value and a falsy one. A
    // `s.open ? …` guard prints every other value and silently drops this one, which
    // re-formats a shut panel into one drawn at the default opening.
    const src = plan("door id=d sliding on mid at 50% width 900 open 0");
    const out = format(src);
    expect(out).toContain("width 900 open 0");
    expect(compile(out, { noCache: true }).svg).toBe(clean(src));
  });

  it("a hinged door still prints exactly as it did — no kind word appears from nowhere", () => {
    const src = plan("door id=d on mid at 50% width 900 hinge left swing in");
    const out = format(src);
    expect(out).toContain("door id=d on mid at 50% width 900 hinge left swing in");
    // An explicit `hinged` is preserved as written; it is the ONE kind the resolver
    // drops, so the printer must not invent it for a door that never said it.
    expect(out).not.toMatch(/door id=d hinged/);
    expect(format(out)).toBe(out);
  });
});
