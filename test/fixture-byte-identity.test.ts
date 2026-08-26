/**
 * Full-SVG pins for the fixture-symbol layer.
 *
 * The furniture glyphs are about to be rewritten by several hands at once: the eight shipped
 * families moved onto a shared factory library, twenty-four more families are catalogued
 * stubs, and five domain modules will grow real art in parallel. Snapshots of *scene objects*
 * or counts of primitives would not catch what actually matters here, which is whether the
 * bytes a user's `arch compile` writes moved. So each case below pins the WHOLE document.
 *
 * The file has two groups, and they carry different promises.
 *
 * ## Group 1 — PERMANENT. Later phases must not move these.
 *
 * A plan with no furniture at all, and a plan whose furniture category the language does not
 * know. Neither has any business changing when a glyph is drawn: the first never reaches the
 * glyph layer, and the second is the labelled-rectangle fallback every unknown word takes.
 * If a phase that draws a bed moves either of these, it did something to the shared path — a
 * changed factory default, a stray node, a re-tagged paint — and that is a bug, not a
 * re-blessing. Do not update these with `-u`; find out why they moved.
 *
 * ## Group 2 — the eight shipped symbol families, DELIBERATELY re-blessable.
 *
 * One minimal plan per family. Today they pin the refactor: the bodies moved verbatim into
 * `glyphs-bath.ts` / `glyphs-kitchen.ts` and picked up semantic `lineWeight` tags, and these
 * eight snapshots are the proof that neither move changed a byte. The phase that redraws
 * these symbols WILL move them, on purpose, and each diff is expected to be read and
 * explained rather than accepted.
 *
 * Sizes are each family's catalogued footprint, so the drawing is one a real plan would make.
 */

import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/** The smallest plan that draws a room and one fixture — no walls, so the SVG stays readable. */
const plan = (body: string): string =>
  ['plan "F" {', "  units mm", '  room id=r at (0,0) size 3000x2400 label "Room"', `  ${body}`, "}"].join("\n");

const svg = (body: string): string => {
  const { svg, errors } = compile(plan(body), { noCache: true });
  if (errors.length) throw new Error(`fixture plan does not compile: ${errors.map((e) => e.message).join("; ")}`);
  return svg;
};

describe("fixture symbols — permanent byte pins (never re-bless)", () => {
  it("a plan with no furniture never reaches the glyph layer", () => {
    expect(svg("")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("an unknown category draws the labelled rectangle, unchanged", () => {
    expect(svg('furniture widget at (300,300) size 800x600 label "Widget"')).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 1100,300 1100,900 300,900" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <text x="700" y="600" font-size="51" fill="#9a948c" text-anchor="middle" dominant-baseline="central">Widget</text>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });
});

describe("fixture symbols — the eight shipped families (re-blessed when redrawn)", () => {
  it("wc", () => {
    expect(svg("furniture wc at (300,300) size 400x700")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 700,300 700,454 300,454" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="324" y1="346.2" x2="676" y2="346.2" stroke="#a8a29a" stroke-width="2.64"/>
      <polygon points="660,737.92 654.55,802.92 638.56,863.5 613.14,915.52 580,955.43 541.41,980.52 500,989.08 458.59,980.52 420,955.43 386.86,915.52 361.44,863.5 345.45,802.92 340,737.92 345.45,672.92 361.44,612.34 386.86,560.32 420,520.41 458.59,495.32 500,486.76 541.41,495.32 580,520.41 613.14,560.32 638.56,612.34 654.55,672.92" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="624.8,737.92 620.55,788.62 608.08,835.87 588.25,876.45 562.4,907.58 532.3,927.15 500,933.82 467.7,927.15 437.6,907.58 411.75,876.45 391.92,835.87 379.45,788.62 375.2,737.92 379.45,687.22 391.92,639.97 411.75,599.39 437.6,568.26 467.7,548.69 500,542.02 532.3,548.69 562.4,568.26 588.25,599.39 608.08,639.97 620.55,687.22" fill="#ffffff" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="500" cy="377" r="20" fill="#a8a29a" stroke="#a8a29a" stroke-width="4.8"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("basin", () => {
    expect(svg("furniture basin at (300,300) size 600x450")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 900,300 900,750 300,750" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="804,552 797.05,589.27 776.67,624 744.25,653.82 702,676.71 652.8,691.09 600,696 547.2,691.09 498,676.71 455.75,653.82 423.33,624 402.95,589.27 396,552 402.95,514.73 423.33,480 455.75,450.18 498,427.29 547.2,412.91 600,408 652.8,412.91 702,427.29 744.25,450.18 776.67,480 797.05,514.73" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="763.2,552 757.64,581.82 741.34,609.6 715.4,633.46 681.6,651.77 642.24,663.27 600,667.2 557.76,663.27 518.4,651.77 484.6,633.46 458.66,609.6 442.36,581.82 436.8,552 442.36,522.18 458.66,494.4 484.6,470.54 518.4,452.23 557.76,440.73 600,436.8 642.24,440.73 681.6,452.23 715.4,470.54 741.34,494.4 757.64,522.18" fill="#ffffff" stroke="#a8a29a" stroke-width="2.64"/>
      <polygon points="570,313.5 630,313.5 630,358.5 570,358.5" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="600" y1="358.5" x2="600" y2="494.4" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("shower", () => {
    expect(svg("furniture shower at (300,300) size 900x900")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 1200,300 1200,1200 300,1200" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="372,372 1128,372 1128,1128 372,1128" fill="#ffffff" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="372" y1="372" x2="1128" y2="1128" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="1128" y1="372" x2="372" y2="1128" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="750" cy="750" r="45" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="750" cy="750" r="16.2" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("bathtub", () => {
    expect(svg("furniture bathtub at (300,300) size 1700x700")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="1874,300 1922.22,309.59 1963.1,336.9 1990.41,377.78 2000,426 2000,874 1990.41,922.22 1963.1,963.1 1922.22,990.41 1874,1000 426,1000 377.78,990.41 336.9,963.1 309.59,922.22 300,874 300,426 309.59,377.78 336.9,336.9 377.78,309.59 426,300" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="1766.16,384 1790.59,388.86 1811.3,402.7 1825.14,423.41 1830,447.84 1830,852.16 1825.14,876.59 1811.3,897.3 1790.59,911.14 1766.16,916 669.84,916 645.41,911.14 624.7,897.3 610.86,876.59 606,852.16 606,447.84 610.86,423.41 624.7,402.7 645.41,388.86 669.84,384" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="419" cy="650" r="35" fill="#a8a29a" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="1354" cy="650" r="28" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("kitchen_sink", () => {
    expect(svg("furniture kitchen_sink at (300,300) size 800x600")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 1100,300 1100,900 300,900" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="636.08,456 644.47,457.67 651.58,462.42 656.33,469.53 658,477.92 658,794.08 656.33,802.47 651.58,809.58 644.47,814.33 636.08,816 405.92,816 397.53,814.33 390.42,809.58 385.67,802.47 384,794.08 384,477.92 385.67,469.53 390.42,462.42 397.53,457.67 405.92,456" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="521" cy="636" r="32.88" fill="#f4f2ee" stroke="#a8a29a" stroke-width="2.64"/>
      <polygon points="994.08,456 1002.47,457.67 1009.58,462.42 1014.33,469.53 1016,477.92 1016,794.08 1014.33,802.47 1009.58,809.58 1002.47,814.33 994.08,816 763.92,816 755.53,814.33 748.42,809.58 743.67,802.47 742,794.08 742,477.92 743.67,469.53 748.42,462.42 755.53,457.67 763.92,456" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="879" cy="636" r="32.88" fill="#f4f2ee" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="700" cy="336" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="700" y1="336" x2="700" y2="468" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("counter", () => {
    expect(svg("furniture counter at (300,300) size 600x600")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 900,300 900,900 300,900" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="300" y1="792" x2="900" y2="792" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("stove", () => {
    expect(svg("furniture stove at (300,300) size 600x600")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 900,300 900,900 300,900" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="480" cy="480" r="96" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="480" cy="480" r="57.6" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="480" cy="720" r="96" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="480" cy="720" r="57.6" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="720" cy="480" r="96" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="720" cy="480" r="57.6" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="720" cy="720" r="96" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="720" cy="720" r="57.6" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="852" x2="900" y2="852" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("fridge", () => {
    expect(svg("furniture fridge at (300,300) size 600x650")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 900,300 900,950 300,950" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="330,330 870,330 870,920 330,920" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="534" x2="900" y2="534" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="816" y1="378" x2="816" y2="482" stroke="#a8a29a" stroke-width="4.8"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });
});

/**
 * The inverse of the pin this block used to carry.
 *
 * Until the domain modules landed, these nine categories were catalogued but UNDRAWN, and this
 * block asserted they rendered byte-identically to an unknown word — an equality rather than a
 * snapshot, chosen so that "the phase which draws one of these breaks exactly the family it
 * drew, and no other". Every one of them draws now, so that equality has done its job and is
 * gone; leaving it would assert the opposite of the feature.
 *
 * What replaces it is the guard that still has work to do: each of these must DIFFER from the
 * fallback, which is what fails if a category is ever dropped from the registry or its glyph
 * silently stops emitting. The `widget` fallback itself stays pinned byte-for-byte in Group 1,
 * so this comparison keeps a fixed reference.
 *
 * The second assertion pins the consequence authors actually see: a drawn symbol IGNORES its
 * `label`, so the word never reaches the SVG. That is long-standing behaviour for `wc` and
 * `basin` — it is new only in that nine more categories now reach it.
 */
describe("catalogued categories that now draw a symbol are NOT the labelled rectangle", () => {
  const drawn = ["bed", "wardrobe", "sofa", "desk", "bookshelf", "washer", "dishwasher", "plant", "car"];

  for (const cat of drawn) {
    it(`${cat} draws its own symbol, not the fallback`, () => {
      const asFixture = svg(`furniture ${cat} at (300,300) size 800x600 label "X"`);
      const asUnknown = svg('furniture widget at (300,300) size 800x600 label "X"');
      expect(asFixture).not.toBe(asUnknown);
      // The fallback is the only path that renders the label.
      expect(asUnknown).toContain(">X</text>");
      expect(asFixture).not.toContain(">X</text>");
    });
  }
});
