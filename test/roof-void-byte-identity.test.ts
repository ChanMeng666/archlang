/**
 * The byte-identity law for `roof` and `void` (v1.29).
 *
 * **Every new language form ships with a byte-identity law, pinned by test: a plan that
 * does not use it renders, describes and lints exactly as before.** `site`, the door
 * kinds, `zone`, `paper`, `polygon` and `arc` each have one; these are theirs.
 *
 * ## Why the hashes are hardcoded rather than computed from a baseline
 *
 * A test that compiled each example twice and compared would prove determinism, not
 * identity — it would stay green through a change that moved every byte. The numbers
 * below were measured against **`main`'s `src/`** (v1.28.0, the branch point), by
 * checking that tree out into this worktree and running the exact `digest()` below on
 * it, so they are a genuine before-and-after: if one moves, the two new elements changed
 * a drawing that never mentions them, and that is a finding to explain rather than a diff
 * to bless. (`git stash` is shared across worktrees, so `git checkout main -- src/` and
 * back is the safe form of the same measurement.)
 *
 * A note for whoever measures the next one: take the baseline with the SAME `digest()`
 * body the test will run, not a lookalike written in a throwaway script. The first
 * attempt here used a scratch script whose payload separator differed by one character,
 * which produced four digests that all "failed" while every underlying artifact — SVG,
 * `describe()`, `lint()` — was in fact byte-identical to main. The scare cost more time
 * than the law it was checking.
 *
 * The payload is deliberately the WHOLE agent-facing surface — the SVG, `describe()` and
 * `lint()` — not just the drawing. A new element that quietly appended an empty key to
 * every summary, or that shifted a diagnostic's order, would leave the SVG untouched and
 * still be a behaviour change for every consumer of `arch describe --json`.
 *
 * The four examples are the ones this track does NOT edit (`bungalow` gains a `roof` and
 * `two-storey` a `void`, so both are excluded on purpose) and are import-free, so no
 * `World` is needed. They span the shapes most likely to be disturbed: an all-rectangle
 * dwelling, the flagship, a CONCAVE polygon plan (whose ring code the roof's offset shares
 * a module with) and a CURVED sheet plan on `paper` (whose auto-fit reads the same
 * `planBounds` the roof now contributes to).
 *
 * ## RE-MEASURED for v1.32 (the furniture pass), and how it was proved
 *
 * All four digests below moved, and it is not this law breaking. v1.32 redraws FOURTEEN symbols across both furniture tracks — `island`,
 * `upper_cabinet`, `dishwasher`, `oven`, `fridge` and `washer` in the kitchen and bath
 * modules, and `coffee_table`, `table`, `stool`, `bench`, `chair`, `tv_unit`, `nightstand`
 * and `desk` in the living, bedroom and office ones, so every plan that places one draws different bytes ON
 * PURPOSE. Which track moved which is itself a useful reading: `studio` places only bath and
 * kitchen fixtures and moved under that track alone; `gallery-l` and `aquarium` place none of
 * those six and moved only under the living/bedroom/office one; `laneway-house` moved under
 * both.
 *
 * That was proved by SUBSTITUTION rather than assumed, and the proof is reproducible. The
 * committed `examples/<name>.svg` files are the compiler's own output, drift-gated as such,
 * so the BASE drawing of any of these plans is `git show <the commit before the redraw>:`
 * `examples/<name>.svg`. Feeding that into this file's digest body — with `describe()` and
 * `lint()` taken from the MERGED code — reproduces the OLD hex exactly, for every plan here.
 * Only the drawing moved.
 *
 * So that the next such release need not repeat the argument, each example now also carries a
 * pin over the SUMMARY half alone (`semanticDigestWith`: the same payload with the SVG
 * removed). Those numbers are the original measurement, unchanged, and a drawing change can
 * never move them. If one of THEM moves, the finding is real.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint, planToJson } from "../src/index.js";
import { type CompilerApi, semanticDigestWith } from "./byte-identity-digest.js";

/**
 * SHA-256 over the SVG + `describe()` + `lint()` of one example, as measured on main.
 *
 * Two changes on 2026-08-28, for the gallery refresh:
 *
 * `laneway-house` and `aquarium` kept their slot but got new CONTENT unrelated to
 * `roof`/`void` — a rug (laneway-house) and furniture (aquarium) — so their digests were
 * RE-MEASURED against that new content. The law the test protects — a plan that does not
 * use `roof`/`void` renders, describes and lints exactly as before its own last commit —
 * still holds; the digest moving is the content edit, not a src regression.
 *
 * `courtyard-house` was DROPPED from this set: the refresh gave it its own `roof overhang`
 * (eaves on its own gallery, not the neighbouring form this test exists to rule out), so
 * it now legitimately fails the "contains neither keyword" assertion below and no longer
 * belongs here. `gallery-l` — the other CONCAVE polygon plan, import-free, and untouched
 * by `roof`/`void` — takes its slot; its digest is a fresh measurement, not a carry-over
 * (the refresh gave it furniture too).
 *
 * `studio` is untouched by the refresh and its digest is unchanged from the v1.28.0
 * measurement.
 *
 * ## The v1.30 re-measurement — wall joinery, and the ONLY sanctioned cause so far
 *
 * All four moved again on 2026-08-28, and this time for a reason that is neither a content
 * edit nor a regression: **the wall-lowering pipeline was replaced.** One `joinWalls` pass
 * now produces a plan's poché and its single outline, every opening is cut on every host
 * (so the cased opening's two dashed lintel lines are gone and no cover is painted), and
 * `wall.bounds` measures the band rather than each segment's square-capped box. Every
 * shipped drawing moves; see ADR 0018.
 *
 * That is what makes this the right place to say what the law still guarantees, because
 * the digests alone no longer say it: **`describe()` and `lint()` were held SHA-256
 * identical for all 29 examples across the whole change**, measured example by example
 * before and after. The bytes that moved here are SVG bytes. If a future digest moves,
 * that separation is the first thing to re-measure — a drawing change is explicable, a
 * `describe()`/`lint()` change on a plan that mentions neither keyword is not.
 *
 *
 * ## The v1.32 re-measurement — six furniture symbols were REDRAWN
 *
 * Three of the four moved again, and `studio` did NOT — which is the whole shape of the
 * finding and the reason to read it before touching a number. v1.32's F2 track redraws six
 * living-room symbols (`coffee_table`, `table`, `stool`, `bench`, `chair`, `tv_unit`) plus
 * `nightstand` and `desk`, so any plan that draws one of those eight renders different bytes
 * and every plan that does not is untouched. `studio` places only bath and kitchen fixtures,
 * so its digest is UNCHANGED from the v1.30 measurement — the same number, not a re-blessing —
 * which is the control that says the redraw stayed inside the glyph layer.
 *
 * **`describe()` and `lint()` were held SHA-256 identical across the whole change**, measured
 * example by example against `8fc432a`'s `src/` (extracted with `git archive`) for all 28
 * import-free examples: 22 SVGs moved, 0 summaries and 0 diagnostic sets. So the bytes that
 * moved here are SVG bytes, and net lint change across the shipped examples is zero. A future
 * digest move on a plan that draws none of the redrawn families would be a different finding
 * and is not covered by this note.
 *
 * Do not read this entry as permission. The rule is unchanged: find out WHICH shared path
 * moved before touching a number here, and write down what it was.
 *
 *
 * ## The backlog-5.8 re-measurement — the SUMMARY moved, and that is the point
 *
 * This is the case the message on the summary half describes: **a moved lint rule and a
 * changed `describe()` value**, not a drawing. Nothing in the circulation fix touches a
 * glyph, and the SVG half moved only because its payload contains `describe()`.
 *
 * Exactly what changed on `studio.arch`, measured field by field against the previous
 * commit: **one number.** `circulation.rooms[r_bath].bottleneckClearWidthMm` and the
 * `r_bed -> r_bath` route's copy of it both go **700 -> 740**. Every other key of the whole
 * summary — rooms, areas, adjacency, openings, freedom, totals — is byte-identical, and
 * `lint(studio)` is unchanged (still empty). 740 is the interior door's own clear width
 * (800 - 60); the old 700 was a FURNITURE pinch reported one body diameter short, so the
 * flagship sat exactly on the 700 mm minimum by arithmetic accident and one cell of drift
 * would have made it warn.
 *
 * `furnished-flat.arch`, where this suite also pins one: `circulation` gains an `r_bath`
 * entry and the two bedroom->bath routes that depend on it (the room was silently dropped
 * because its label point sat in a pocket the entrance could not reach), and gains
 * `blockedRoomIds: ["r_kitchen"]` — a real, previously unreported finding about that plan.
 * Nothing else in its summary moved.
 *
 * Do not read this entry as permission either. A summary digest still moves only for a
 * named, measured reason, written down here.
 */
const BASELINE: [string, string][] = [
  ["laneway-house", "3a5653e0d1306f0bdb81221d05875e8f2ca0cb6550ef9619b76ece481337acc8"],
  ["studio", "230392f562ad97b4da05d5f812350651c1f2d7bd0f10f2df80a8bccad41ed0dd"],
  ["gallery-l", "753b39b0dc5ed5a38aa7243d4b7738257e771f95d0590f0595a2512550fcbc5f"],
  ["aquarium", "af532f0ff575b10c355bda8f7d54b2c5ee272f88cd1e1427a5c6ca756099a57b"],
];

/** The SUMMARY half of the same law — see the header. Unchanged since the measurement. */
const SEMANTIC_BASELINE: [string, string][] = [
  ["laneway-house", "ac2df20e15d2e4fbcc73e34a15d4e34578aa89a859860561b85361db170040b6"],
  ["studio", "19e14aff19562e4198f300fa342b4404e29f790b586f7d3d711eed8936865ddf"],
  ["gallery-l", "cef0ee1863a505bb831aa2512ca204547117872a61cf1a1ddd293361f0b688be"],
  ["aquarium", "2cc0778dbc3b1127e0e478d8e08d12a766de6a73458748ee40bd5f43473f1e1f"],
];

/** The compiler surface the summary-half pins are taken over. */
const API: CompilerApi = { compile, describe: describePlan, lint };

/** The exact payload the baseline digests were taken over — do not change its shape. */
function digest(src: string): string {
  const { svg } = compile(src, { noCache: true });
  const payload = [svg, JSON.stringify(describePlan(src)), JSON.stringify(lint(src))].join("\n \n");
  return createHash("sha256").update(payload).digest("hex");
}

describe("roof/void byte-identity — a plan that uses neither is unchanged", () => {
  for (const [name, sha] of BASELINE) {
    it(`${name}.arch renders, describes and lints exactly as on main`, () => {
      const src = readFileSync(`examples/${name}.arch`, "utf8");
      expect(src).not.toMatch(/(?<![\w-])(roof|void)(?![\w-])/);
      expect(
        digest(src),
        `${name}.arch changed. Nothing on this branch touches it, so either a shared code path ` +
          `moved (the label-placement obstacle set, the nav-grid obstacle list, planBounds, the ` +
          `describe() key order) or an element table grew a field every plan pays for. Find out ` +
          `WHICH before updating this digest — the point of the number is that it does not move.`,
      ).toBe(sha);
    });
  }

  for (const [name, sha] of SEMANTIC_BASELINE) {
    it(`${name}.arch describes and lints exactly as on main — no drawing in the payload`, () => {
      expect(
        semanticDigestWith(API, readFileSync(`examples/${name}.arch`, "utf8")),
        `${name}.arch's SUMMARY changed. A redrawn symbol cannot do this; a new describe() key, ` +
          `a moved lint rule or a catalog flag that changed an existing category's semantics can. ` +
          `This number is not re-measured for a drawing change.`,
      ).toBe(sha);
    });
  }
});

describe("roof/void are absent from the Plan JSON projection", () => {
  const PLAN = (extra: string): string =>
    `plan "J" {\n  units mm\n` +
    `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
    `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living\n` +
    `  door id=d on w1 at 50% width 900\n` +
    `${extra}}\n`;

  it("adding a roof and a void does not change one byte of `planToJson`", () => {
    // The strongest available form of "the schemas are byte-unchanged": a projection that
    // had learned about either element would differ here, and `schemas/plan.schema.json`
    // is generated from the same `PLAN_JSON_SCHEMA` the projection is written against.
    const bare = planToJson(PLAN(""));
    const both = planToJson(PLAN(`  roof overhang 600\n  void id=well at (2000,1500) size 1500x1500\n`));
    expect(bare.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(both.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(JSON.stringify(both.json)).toBe(JSON.stringify(bare.json));
  });

  it("neither keyword appears in either committed schema", () => {
    for (const f of ["schemas/plan.schema.json", "schemas/intent.schema.json"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/"(roof|void)"/);
    }
  });
});

describe("roof — additive to the drawing, but it does grow the page", () => {
  /** The same plan with and without a `roof overhang 600`. */
  const pair = (settings: string): [string, string] => {
    const body =
      `  units mm\n  north up\n${settings}` +
      `  wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }\n` +
      `  room id=r1 at (0,0) size 8000x5000 label "Hall" uses living\n`;
    return [
      compile(`plan "R" {\n${body}}\n`, { noCache: true }).svg,
      compile(`plan "R" {\n${body}  roof overhang 600\n}\n`, { noCache: true }).svg,
    ];
  };

  /** Every CAD-layer group in the SVG, keyed by layer name. */
  const layers = (svg: string): Map<string, string> =>
    new Map([...svg.matchAll(/<g id="([^"]+)"[\s\S]*?<\/g>/g)].map((m) => [m[1]!, m[0]!]));

  it("on a `paper` plan, every drawn layer is byte-identical and only A-ROOF is new", () => {
    // With a sheet, the render sizes come from the PAPER, so nothing rescales and the
    // claim is exact: the roof adds a group and touches no other. This is the strong
    // form of "additive" — a roof that had moved a label, a wall or a dimension would
    // fail here rather than hide inside a page-size difference.
    const [bare, roofed] = pair(`  paper A3 landscape\n  scale 1:100\n`);
    const a = layers(bare);
    const b = layers(roofed);
    expect([...b.keys()].filter((k) => !a.has(k))).toEqual(["A-ROOF"]);
    for (const [name, group] of a) expect(b.get(name), `layer ${name} moved`).toBe(group);
  });

  it("without `paper`, the eaves rescale the whole drawing — and that is the pre-existing rule", () => {
    // A plan with no sheet sizes every font and stroke from its own reference dimension
    // (`max(drawW, drawH)`), so ANY element that grows the extent rescales the drawing —
    // a far-flung `column` or a wide `dim` offset does exactly the same. Pinned rather
    // than papered over, so nobody reads the sheet-mode test above as a promise the
    // no-sheet path also makes.
    const [bare, roofed] = pair("");
    const fontOf = (svg: string): string => /font-size="([\d.]+)"[^>]*font-weight="600"/.exec(svg)![1]!;
    expect(Number(fontOf(roofed))).toBeGreaterThan(Number(fontOf(bare)));
  });
});
