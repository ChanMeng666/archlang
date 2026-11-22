/**
 * A wrapped room name reads as the name (card SR.15): its `<text>` element's text content — what a
 * screen reader, a search or a schedule check reads from the SVG — is the label, "Entrance Hall",
 * never "EntranceHall". The space a break removed rides between the lines in a `font-size="0"`
 * separator (`src/backends/svg.ts`), so no glyph moves: a visible space at the end of a line, at the
 * start of the next or between the two would widen an anchored text chunk and shift its line by half
 * a space (measured in Chrome and resvg when the card was worked). Here: the card's repro, the gaps
 * (`lineGaps`, `src/text-layout.ts`), a hand-built block, and the raster pixel for pixel.
 * The corpus sweep is `test/label-wrap.test.ts`'s law.
 */

import { describe, expect, it } from "vitest";
import { renderSvg } from "../src/backends/svg.js";
import { compile } from "../src/index.js";
import type { ScenePrim } from "../src/scene.js";
import { balancedLines, lineGaps } from "../src/text-layout.js";

type Text = Extract<ScenePrim, { t: "text" }>;

const SEPARATOR = /<tspan font-size="0" xml:space="preserve">( +)<\/tspan>/g;

/** The card's repro: a hall `w` wide beside a 4 m living room. */
const repro = (w: number) => `plan "SR15" {
  room id=hall at (0,0) size ${w}x2400 label "Entrance Hall"
  room id=living at (${w},0) size 4000x2400 label "Living"
}`;

/** Every `<text>` element's text content (tags removed), in document order. */
function texts(svg: string): string[] {
  const out: string[] = [];
  for (let i = svg.indexOf("<text "); i >= 0; i = svg.indexOf("<text ", i + 1)) {
    const end = svg.indexOf("</text>", i);
    const inner = svg.slice(svg.indexOf(">", i) + 1, end);
    let s = "";
    for (let j = 0; j < inner.length; ) {
      const lt = inner.indexOf("<", j);
      if (lt < 0) {
        s += inner.slice(j);
        break;
      }
      s += inner.slice(j, lt);
      j = inner.indexOf(">", lt) + 1;
    }
    out.push(s);
  }
  return out;
}

describe("SR.15: a wrapped room name's text is the name", () => {
  it("the card's repro: 1200 wide wraps and reads 'Entrance Hall'; 1800 wide stays one line", () => {
    const narrow = compile(repro(1200), { noCache: true }).svg;
    expect(narrow).toContain(
      '<tspan x="600" y="1075.2">Entrance</tspan><tspan font-size="0" xml:space="preserve"> </tspan><tspan x="600" y="1262.4">Hall</tspan>',
    );
    expect(texts(narrow)).toContain("Entrance Hall");
    expect(texts(narrow)).not.toContain("EntranceHall");
    const wide = compile(repro(1800), { noCache: true }).svg;
    expect(wide).not.toContain("<tspan");
    expect(texts(wide)).toContain("Entrance Hall");
  });

  it("removing the separators gives the lines exactly as they were drawn before", () => {
    const narrow = compile(repro(1200), { noCache: true }).svg;
    expect(narrow.replace(SEPARATOR, "")).toContain(
      '<tspan x="600" y="1075.2">Entrance</tspan><tspan x="600" y="1262.4">Hall</tspan></text>',
    );
  });

  it("the gaps are the name's own spaces: a separator glued to its word, a double space, none mid-word", () => {
    // `Kitchen / Living` breaks after the slash, never before it; the gap is the space after it.
    expect(balancedLines("Kitchen / Living", 2)).toEqual(["Kitchen /", "Living"]);
    expect(lineGaps("Kitchen / Living", ["Kitchen /", "Living"])).toEqual(["", " ", ""]);
    // A hyphen is part of its word: `Walk-in Closet` breaks only at the space.
    expect(balancedLines("Walk-in Closet", 2)).toEqual(["Walk-in", "Closet"]);
    expect(lineGaps("Walk-in Closet", ["Walk-in", "Closet"])).toEqual(["", " ", ""]);
    // A run of spaces is kept whole; spaces round the name are kept where they stand.
    expect(lineGaps("Bedroom  3", ["Bedroom", "3"])).toEqual(["", "  ", ""]);
    expect(lineGaps(" Bedroom 3 ", ["Bedroom", "3"])).toEqual([" ", " ", " "]);
    // A word is never broken (only U+0020 is a break opportunity), so no wrap has a gap-less join.
    expect(balancedLines("Kitchenette", 2)).toBeNull();
    // Lines that are not the value's own text in order have no gaps.
    expect(lineGaps("Entrance Hall", ["Hall", "Entrance"])).toBeNull();
  });

  it("every gap is drawn: the text content equals the value, spaces and escapes included", () => {
    const { scene } = compile(repro(1200), { noCache: true });
    const at = scene!.nodes.findIndex((n) => n.prim.t === "text" && (n.prim as Text).block !== undefined);
    expect(at).toBeGreaterThanOrEqual(0);
    const prim = scene!.nodes[at]!.prim as Text;
    const swap = (value: string, lines: string[]) =>
      renderSvg({
        ...scene!,
        nodes: scene!.nodes.map((n, i) =>
          i === at ? { ...n, prim: { ...prim, value, block: { ...prim.block!, lines } } } : n,
        ),
      });
    expect(texts(swap(" A &  B ", ["A &", "B"]))).toContain(" A &amp;  B ");
    // A hand-built block whose lines are not its value's text draws its lines alone, as before.
    const odd = swap("Entrance Hall", ["Hall", "Entrance"]);
    expect(odd).toContain('<tspan x="600" y="1075.2">Hall</tspan><tspan x="600" y="1262.4">Entrance</tspan></text>');
    expect(odd).not.toContain('font-size="0"');
  });

  it("the raster is pixel-identical with and without the separators (resvg, the PNG backend)", async () => {
    let renderPngFromSvg: typeof import("../src/backends/png.js").renderPngFromSvg;
    try {
      await import("@resvg/resvg-js" as string);
      ({ renderPngFromSvg } = await import("../src/backends/png.js"));
    } catch {
      if (process.env.CI) throw new Error("optional dep @resvg/resvg-js missing in CI — the raster was not compared");
      return; // absent locally: the SVG halves above still ran
    }
    const svg = compile(repro(1200), { noCache: true }).svg;
    const stripped = svg.replace(SEPARATOR, "");
    expect(stripped).not.toBe(svg);
    const [a, b] = await Promise.all([renderPngFromSvg(svg, { scale: 4 }), renderPngFromSvg(stripped, { scale: 4 })]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
