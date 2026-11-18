/**
 * Card AL3w (label-crowding): a room's name or area figure is read against a symbol, and against a
 * piece's own label, at the wider of the shared estimate and the width it draws (`symbolExtent`,
 * `src/text-layout.ts`), in the label fit (`src/label-fit.ts`) and in `W_ANNOTATION_OVERLAP` alike.
 *
 * The estimate (0.62 em a character) is generous for most text and short of the ink for a short run
 * of wide letters: "WC" is 1.24 em estimated and 1.67 em of ink. Read at the estimate, a "WC" printed
 * over a basin stood clear of it, so the fit left it there and the rule did not report it (the
 * label-crowding witness's two WCs). Everything else is read exactly as before: where the estimate
 * is the wider, the box is the estimate's own.
 *
 * What is measured here reads the Scene the compiler draws and clips each symbol's drawn shapes
 * itself, never the rule's verdict.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlan } from "../src/analyze.js";
import { clippedArea } from "../src/geometry/polygon.js";
import { diagnosticOverprint, lint } from "../src/index.js";
import type { ResolvedPlan } from "../src/ir.js";
import { isSymbolElement, shapesOf } from "../src/label-fit.js";
import { COLLIDE_MIN } from "../src/label-placement.js";
import type { ScenePrim } from "../src/scene.js";
import { toScene } from "../src/scene-build.js";
import { inkExtent, symbolExtent, textBox, textExtent } from "../src/text-layout.js";
import type { World } from "../src/world.js";
import { corpusFiles, walkFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

type Text = Extract<ScenePrim, { t: "text" }>;

const OVERLAP = "W_ANNOTATION_OVERLAP";
const text = (value: string, size = 100): Text => ({
  t: "text",
  at: { x: 0, y: 0 },
  value,
  size,
  anchor: "middle",
  baseline: "central",
});

/** A 3 x 2 m room at 1:50 whose "WC" stands at `label`, and a plain rectangle (an uncatalogued
 *  word) whose left edge is 120 mm right of it, over the name's row only: past the name's
 *  estimated half-width (108.5 mm) and short of its ink's (145.8 mm). */
const plinth = (label: string) => `plan "p" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size 3000x2000 label "WC"${label}
  furniture plinth at (1120,830) size 600x120
}
`;

/** Each room text on every storey, and each symbol it stands over at its symbol width by more
 *  than the trigger, by the symbols' drawn shapes as the Scene holds them. */
function overSymbols(src: string, world?: World): { room: string; value: string; symbol: string }[] {
  const { ir, levels } = resolvePlan(src, world ? { world } : {});
  if (!ir) return [];
  const out: { room: string; value: string; symbol: string }[] = [];
  const storeys: ResolvedPlan[] = levels.length > 0 ? levels.map((l) => l.ir) : [ir];
  for (const plan of storeys) {
    const symbolIds = new Set(plan.elements.filter(isSymbolElement).map((el) => el.id));
    const scene = toScene(plan, { annotate: true });
    const shapes = new Map<string, ReturnType<typeof shapesOf>>();
    for (const n of scene.nodes) {
      if (n.elementId === undefined || !symbolIds.has(n.elementId) || n.prim.t === "text") continue;
      shapes.set(n.elementId, [...(shapes.get(n.elementId) ?? []), ...shapesOf(n.prim)]);
    }
    for (const n of scene.nodes) {
      if (n.elementKind !== "room" || n.prim.t !== "text") continue;
      const w = Math.max(textExtent(n.prim).w, inkExtent(n.prim).w);
      const box = textBox(n.prim, w);
      for (const [id, rings] of shapes) {
        let largest = 0;
        for (const ring of rings) largest = Math.max(largest, clippedArea(ring, box.rect));
        if (largest > COLLIDE_MIN * box.area) out.push({ room: n.elementId!, value: n.prim.value, symbol: id });
      }
    }
  }
  return out;
}

describe("the width a room's text is read at against a symbol", () => {
  it("is the ink where that is wider, and the estimate itself everywhere else", () => {
    const wc = text("WC");
    expect(inkExtent(wc).w).toBeGreaterThan(textExtent(wc).w);
    expect(symbolExtent(wc)).toEqual({ w: inkExtent(wc).w, h: textExtent(wc).h });
    for (const value of ["Store / IT", "Kitchenette / Break", "4.5 m²", "Bedroom 2"]) {
      const t = text(value);
      expect(inkExtent(t).w, value).toBeLessThan(textExtent(t).w);
      // The very object `textExtent` returns: no rounding of a width that did not change.
      expect(symbolExtent(t), value).toEqual(textExtent(t));
    }
  });

  it("reports a pinned name whose ink, not its estimate, is over a symbol", () => {
    const src = plinth(" at (1000,1000)");
    expect(overSymbols(src)).toEqual([{ room: "r", value: "WC", symbol: "plinth_1" }]);
    const reports = lint(src).filter((d) => d.code === OVERLAP);
    expect(reports.map((d) => d.message)).toEqual([
      'The name "WC" is printed over the plinth, so the label and the symbol overprint each other on the drawing.',
    ]);
    expect(diagnosticOverprint(reports[0]!)).toEqual({
      subject: { kind: "room-label", room: "r", text: "WC" },
      over: [{ kind: "symbol", id: "plinth_1", parts: ["name"] }],
    });
  });

  it("moves an unpinned name off the symbol its ink stands on", () => {
    // Six wide letters: 991 mm of ink against a 651 mm estimate at 1:50. Where the room draws it,
    // centred at x 1500, the ink reaches x 1996 and the rectangle starts at 1900, over the name's
    // row only: the estimate, even grown by the relocation's clearance, stands clear of it, and
    // only the ink is over it (5.6 % of the name's box). Read at the estimate it stayed there.
    const src = `plan "p" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size 3000x2000 label "WWWWWW"
  furniture plinth at (1900,830) size 600x150
}
`;
    const { ir } = resolvePlan(src, {});
    const name = toScene(ir!, {}).nodes.find((n) => n.prim.t === "text" && n.prim.value === "WWWWWW")!.prim as Text;
    expect(name.at.x).not.toBe(1500);
    expect(overSymbols(src)).toEqual([]);
    expect(lint(src).filter((d) => d.code === OVERLAP)).toEqual([]);
  });

  it("clears the witness's two WCs, which nothing read before", () => {
    const src = readFileSync("test/fixtures/dense-office.arch", "utf8");
    const over = overSymbols(src);
    expect(over.filter((o) => o.room === "r_wc1" || o.room === "r_wc2")).toEqual([]);
    expect([...new Set(over.map((o) => o.value))].sort()).toEqual(["Kitchenette / Break", "Store / IT"]);
    expect(
      lint(src)
        .filter((d) => d.code === OVERLAP)
        .map((d) => diagnosticOverprint(d)!.subject.text)
        .sort(),
    ).toEqual(["Kitchenette / Break", "Store / IT"]);
  });
});

describe("over the corpus", () => {
  it("every room text over a symbol at the wider width is reported as over that symbol", () => {
    const files = [...corpusFiles(), ...walkFiles("test/plans").map((p) => p.replace(/\\/g, "/"))];
    let pairs = 0;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const world = worldFor(dirname(file));
      const over = overSymbols(src, world);
      if (over.length === 0) continue;
      const reported = new Set<string>();
      for (const d of lint(src, { world })) {
        if (d.code !== OVERLAP) continue;
        const o = diagnosticOverprint(d);
        if (o?.subject.kind !== "room-label") continue;
        for (const u of o.over) if (u.kind === "symbol") reported.add(`${o.subject.room}|${u.id}`);
      }
      for (const o of over) {
        pairs++;
        expect(reported.has(`${o.room}|${o.symbol}`), `${file}: "${o.value}" over ${o.symbol}`).toBe(true);
      }
    }
    expect(pairs).toBeGreaterThan(10);
  }, 300_000);
});
