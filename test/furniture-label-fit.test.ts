/**
 * Card AL4: an uncatalogued piece's label is drawn upright when it fits its rectangle, turned along a
 * tall piece when only that fits, and not drawn when it fits neither way (ruling AL-D2: never below
 * the furniture-label size), always inside the piece; and a drawn piece label is something a room's
 * label or a `dims auto` number must not sit on, for `fitLabels` and `W_ANNOTATION_OVERLAP` as for
 * `relocateLabels`.
 *
 * "Fits" is the wider of the shared width estimate ({@link textExtent}, the box every label pass
 * measures a text by) and the width the text draws ({@link inkExtent}), by the size, so both the box
 * and the ink stay in the piece; the containment case below measures the ink. A label that fits
 * upright is the node the drawing has always drawn, byte for byte: over the corpus every drawn piece
 * label fits so (31 in 9 sources, measured for the card), and the corpus sweep moved no byte for this
 * part. The rule reads a piece's label only for a text already over its piece, so a plan of many
 * labelled pieces is linted exactly as far as before (the last case). The label is a fact of the plan, not of the drawing:
 * `describe()` lists it whether or not it is drawn. Text is never mirrored, so a mirrored piece draws
 * the same label (`test/glyph-chirality.test.ts` pins that). The witness
 * (`test/fixtures/dense-office.arch`) carries the case that started the card: "IT Rack", "Supplies"
 * and "Display" wider than their pieces either way, and "Coats" turned.
 */

import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { furnitureLabelPrim } from "../src/elements/furniture.js";
import { toDxf } from "../src/export/dxf.js";
import { clippedArea } from "../src/geometry/polygon.js";
import { compile, type Diagnostic, describe, diagnosticOverprint, lint, lintWithCoverage } from "../src/index.js";
import type { SceneNode, ScenePrim } from "../src/scene.js";
import { inkExtent, textBox, textExtent } from "../src/text-layout.js";

type Text = Extract<ScenePrim, { t: "text" }>;

/** One room, `paper A4 landscape`, `scale 1:50` (a 100 mm furniture label), and the lines given. */
const room = (body: string, w = 4000, h = 3000) => `plan "AL4" {
  units mm
  paper A4 landscape
  scale 1:50
  wall id=s exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }
  room id=r at (0,0) size ${w}x${h} label "Store" uses storage
${body}
}`;

function sceneOf(src: string) {
  const out = compile(src, { noCache: true, annotate: true });
  expect(out.errors).toEqual([]);
  return out.scene!;
}

/** The text nodes the piece `id` draws. */
const pieceTexts = (src: string, id: string): Text[] =>
  sceneOf(src)
    .nodes.filter((n: SceneNode) => n.elementId === id && n.prim.t === "text")
    .map((n) => n.prim as Text);

suite("drawing the label of an uncatalogued word", () => {
  it("upright when it fits: the very node the drawing always drew", () => {
    const src = room(`  furniture id=p kiosk at (1000,1000) size 1200x600 label "Display" in r`);
    const furnFont = sceneOf(src).sizes.furnFont;
    expect(pieceTexts(src, "p")).toEqual([
      { t: "text", at: { x: 1600, y: 1300 }, value: "Display", size: furnFont, anchor: "middle", baseline: "central" },
    ]);
  });

  it("the trigger is strict: a label exactly as wide as its piece stays upright", () => {
    const size = 100;
    for (const label of ["Abc", "ill"]) {
      const prim: Text = { t: "text", at: { x: 0, y: 0 }, value: label, size, anchor: "middle", baseline: "central" };
      const { h } = textExtent(prim);
      const w = Math.max(textExtent(prim).w, inkExtent(prim).w);
      expect(furnitureLabelPrim(label, { x: 0, y: 0 }, { w, h }, size)?.rotate, label).toBeUndefined();
      expect(furnitureLabelPrim(label, { x: 0, y: 0 }, { w: w - 1e-6, h }, size), label).toBeNull();
    }
  });

  it("fits by the ink too, where the ink is wider than the estimate", () => {
    // At 100 mm "MMWWMMWW" is 496 mm by the estimate and 727 mm in ink; six CJK characters are 372
    // and 600. Each is left out of a piece the estimate alone would have it fit, and drawn in one
    // that holds its ink.
    for (const [label, size, drawn] of [
      ["MMWWMMWW", "150x700", undefined],
      ["MMWWMMWW", "150x800", -90],
      ["储物柜储物柜", "550x150", undefined],
      ["储物柜储物柜", "650x150", 0],
    ] as const) {
      const ts = pieceTexts(room(`  furniture id=p screen at (1000,900) size ${size} label "${label}" in r`), "p");
      expect(
        ts.map((t) => t.rotate ?? 0),
        `${label} ${size}`,
      ).toEqual(drawn === undefined ? [] : [drawn]);
    }
  });

  it("turned along a tall piece when only that fits, reading bottom to top, inside the piece", () => {
    const src = room(`  furniture id=p screen at (1000,900) size 300x1200 label "Display" in r`);
    const [t, ...rest] = pieceTexts(src, "p");
    expect(rest).toEqual([]);
    expect(t!.rotate).toBe(-90);
    expect(t!.at).toEqual({ x: 1150, y: 1500 });
    const b = textBox(t!).box;
    expect(b.minX).toBeGreaterThanOrEqual(1000);
    expect(b.maxX).toBeLessThanOrEqual(1300);
    expect(b.minY).toBeGreaterThanOrEqual(900);
    expect(b.maxY).toBeLessThanOrEqual(2100);
    const out = compile(src, { noCache: true });
    expect(out.svg).toContain('transform="rotate(-90 1150 1500)"');
    // The DXF writes the same turn (a TEXT's angle, counter-clockwise with y up).
    expect(toDxf(out.scene!)).toMatch(/\n1\nDisplay\n50\n90(\.0+)?\n/);
  });

  it("not drawn when it fits neither way, and never below the furniture-label size; describe() keeps it", () => {
    // At 100 mm a label is 62 mm a character by 100 mm.
    for (const [size, label, why] of [
      ["300x300", "Display board, north", "too long either way"],
      ["1200x300", "Display board, north", "longer than the piece, and too long to turn"],
      ["2000x80", "Display board, north", "too low to hold the lettering"],
      // "A" would fit turned across this flat piece (62 mm along its 80 mm), but only along the long side turns.
      ["400x80", "A", "a wide piece is never turned along its short side"],
    ] as const) {
      const src = room(`  furniture id=p screen at (1000,900) size ${size} label "${label}" in r`);
      expect(pieceTexts(src, "p"), why).toEqual([]);
      expect(describe(src).furniture.find((f) => f.id === "p")?.label, why).toBe(label);
    }
    const src = room(`  furniture id=p screen at (1000,900) size 300x300 label "Display board, north" in r`);
    expect(compile(src, { noCache: true }).svg).not.toContain("Display board, north");
  });

  it("decides on the footprint the sheet draws, whatever the `rotate`", () => {
    // `size` is the footprint on the sheet; the turn only turns the piece inside it.
    const drawn = (turn: string) =>
      pieceTexts(room(`  furniture id=p screen at (1000,900) size 300x1200${turn} label "Display" in r`), "p");
    for (const turn of [" rotate 90", " rotate 180", " rotate 270"]) expect(drawn(turn)).toEqual(drawn(""));
  });

  it("a piece's ink stays inside its footprint at every aspect", () => {
    for (const w of [150, 300, 600, 900, 1500, 2400])
      for (const h of [150, 300, 600, 900, 1500, 2400])
        for (const label of ["A", "TV", "ill", "Display", "MMWWMMWW", "储物柜储物柜", "Stationery cupboard"]) {
          const src = room(`  furniture id=p kiosk at (500,500) size ${w}x${h} label "${label}" in r`);
          for (const t of pieceTexts(src, "p")) {
            // The text's box at the width it draws (the faces' own advances), turned with it; and
            // the estimate's box, which every label pass reads.
            for (const b of [textBox(t, inkExtent(t).w).box, textBox(t).box]) {
              const e = 1e-9;
              expect(
                b.minX >= 500 - e && b.maxX <= 500 + w + e && b.minY >= 500 - e && b.maxY <= 500 + h + e,
                `${w}x${h} ${label}`,
              ).toBe(true);
            }
          }
        }
  });
});

suite("the witness", () => {
  const WITNESS = readFileSync("test/fixtures/dense-office.arch", "utf8");
  it('leaves out "IT Rack", "Supplies" and "Display", turns "Coats", and describe() keeps all four', () => {
    const texts = sceneOf(WITNESS).nodes.filter((n) => n.elementKind === "furniture" && n.prim.t === "text");
    expect(texts.map((n) => [n.elementId, (n.prim as Text).value, (n.prim as Text).rotate])).toEqual([
      ["coat_stand_33", "Coats", -90],
    ]);
    const labels = describe(WITNESS)
      .furniture.filter((f) => ["shelving", "cabinet", "screen", "coat_stand"].includes(f.category))
      .map((f) => f.label);
    expect(labels).toEqual(["IT Rack", "Supplies", "Display", "Coats"]);
  });
});

const OVERLAP = "W_ANNOTATION_OVERLAP";
const overlaps = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === OVERLAP);

suite("a drawn piece label is an obstacle", () => {
  /** A 2 m square laboratory almost filled by a kiosk: its name stands on the kiosk wherever it goes. */
  const LAB = (label: string) => `plan "Lab" {
  units mm
  paper A4 landscape
  scale 1:50
  wall id=s exterior thickness 200 { (0,0) (2000,0) (2000,2000) (0,2000) close }
  room id=r at (0,0) size 2000x2000 label "Laboratory"
  door id=d at (1000,2000) width 800 wall s swing out
  furniture id=k kiosk at (100,100) size 1800x1800${label} in r
}`;

  it("fitLabels: a name that cannot leave the piece keeps off the piece's label", () => {
    const with_ = sceneOf(LAB(' label "Ticket desk"'));
    const name = with_.nodes.find((n) => n.elementKind === "room" && n.prim.t === "text")!.prim as Text;
    const piece = with_.nodes.find((n) => n.elementKind === "furniture" && n.prim.t === "text")!.prim as Text;
    const nb = textBox(name);
    expect(clippedArea(textBox(piece).rect, nb.rect)).toBeLessThanOrEqual(0.02 * nb.area);
    // The control: the same kiosk unlabelled leaves the name where the label would have been under it.
    const without = sceneOf(LAB(""));
    const bare = without.nodes.find((n) => n.elementKind === "room" && n.prim.t === "text")!.prim as Text;
    expect(clippedArea(textBox({ ...piece }).rect, textBox(bare).rect)).toBeGreaterThan(0.02 * textBox(bare).area);
    // Still over the kiosk, so still reported, as the kiosk, with no piece label under it.
    const [d, ...rest] = overlaps(LAB(' label "Ticket desk"'));
    expect(rest).toEqual([]);
    expect(diagnosticOverprint(d!)!.over.map((o) => o.kind)).toEqual(["symbol", "wall"]);
  });

  it("the rule: a pinned name over a piece's label names the piece, and the overprint lists its label", () => {
    const src = room(`  furniture id=p kiosk at (1000,1000) size 2000x600 label "Ticket desk" in r`).replace(
      'label "Store" uses storage',
      'label "Store" at (2000,1300) uses storage',
    );
    const [d, ...rest] = overlaps(src);
    expect(rest).toEqual([]);
    expect(d!.message).toContain('the kiosk "Ticket desk"');
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-label", room: "r", text: "Store" },
      over: [
        { kind: "symbol", id: "p", parts: ["name", "area"] },
        { kind: "furniture-label", id: "p", text: "Ticket desk", parts: ["name"] },
      ],
    });
  });

  it("the rule: a `dims auto` figure over a piece's label lists it after the piece", () => {
    const src = `plan "Galley" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:100
  dims auto all
  wall id=shell exterior thickness 300 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r_k at (0,0) size 4000x3000 label "Kitchen" uses kitchen
  door id=d_k at (2000,3000) width 900 wall shell swing in
  furniture id=run kiosk at (150,150) size 3700x600 label "Bench"
}`;
    const [d, ...rest] = overlaps(src);
    expect(rest).toEqual([]);
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "dim-thickness", room: "r_k", text: "300" },
      over: [
        { kind: "symbol", id: "run" },
        { kind: "furniture-label", id: "run", text: "Bench" },
      ],
    });
  });

  it("a label the drawing leaves out is no obstacle and is never reported", () => {
    // The same pinned name over a piece too small for its label: the piece alone is under it.
    const src = room(`  furniture id=p kiosk at (1700,1100) size 600x400 label "Ticket desk" in r`).replace(
      'label "Store" uses storage',
      'label "Store" at (2000,1300) uses storage',
    );
    expect(pieceTexts(src, "p")).toEqual([]);
    const [d, ...rest] = overlaps(src);
    expect(rest).toEqual([]);
    expect(diagnosticOverprint(d!)!.over.map((o) => o.kind)).toEqual(["symbol"]);
  });

  it("costs the rule no pair: 300 rooms over 900 labelled pieces are all still reported", () => {
    // A piece's label is read only for a text already over its piece, so the rule's pair count is the
    // one a plan without labels has: 600 texts by 900 pieces, 540,000, under MAX_ANNOTATION_WORK. Read
    // as pairs of their own the labels doubled it past the count, and the storey was skipped whole
    // (`annotation-budget`) with not one of these reports.
    const L = ["units mm", "paper A0 landscape", "scale 1:100"];
    let k = 0;
    for (let i = 0; i < 20; i++)
      for (let j = 0; j < 15; j++) {
        const x = i * 3000;
        const y = j * 3000;
        L.push(`room id=r${i}_${j} at (${x},${y}) size 3000x3000 label "R" at (${x + 1500},${y + 1500})`);
        L.push(`furniture id=f${k++} widget at (${x + 1100},${y + 1250}) size 800x500 label "A"`);
        L.push(`furniture id=f${k++} widget at (${x + 200},${y + 200}) size 800x500 label "A"`);
        L.push(`furniture id=f${k++} widget at (${x + 2000},${y + 2300}) size 800x500 label "A"`);
      }
    const src = `plan "Big" {\n  ${L.join("\n  ")}\n}`;
    const { diagnostics, coverage } = lintWithCoverage(src);
    expect(JSON.stringify(coverage)).not.toContain("annotation-budget");
    const ds = diagnostics.filter((d) => d.code === OVERLAP);
    expect(ds).toHaveLength(300);
    for (const d of ds) expect(diagnosticOverprint(d)!.over.map((o) => o.kind)).toEqual(["symbol", "furniture-label"]);
  });
});
