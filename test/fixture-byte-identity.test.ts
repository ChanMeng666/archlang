/**
 * Full-SVG pins for the fixture-symbol layer.
 *
 * The furniture glyphs are about to be rewritten by several hands at once: the eight shipped
 * families moved onto a shared factory library, twenty-four more families are catalogued
 * stubs, and five domain modules will grow real art in parallel. Snapshots of *scene objects*
 * or counts of primitives would not catch what actually matters here, which is whether the
 * bytes a user's `arch compile` writes moved. So each case below pins the WHOLE document.
 *
 * The file has four groups, and they carry different promises.
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
 *
 * ## Group 3 — the second tranche, on the same terms as Group 2.
 *
 * `rug`, `sofa_l`, `piano`, `sun_lounger`. Also re-blessable, also expected to be read. Three
 * of the four have no catalogued footprint on purpose, so their sizes are stated where the
 * group is written rather than looked up.
 *
 * ## Group 4 — the outdoor tranche, on the same terms again.
 *
 * Four of the twenty-one site symbols, chosen because each one pins a DIFFERENT property of that
 * module rather than a fourth drawing: `tree` is unfilled planting, `pergola` is dashed all the
 * way round, `shed` mixes a filled carcass with a dashed ridge, and `bbq` is the one outdoor kind
 * with a catalogued footprint AND a frontal clearance. Re-blessable, and each diff read first.
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
      <line x1="300" y1="820" x2="900" y2="820" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="495" x2="900" y2="495" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="504" y1="891.5" x2="696" y2="891.5" stroke="#a8a29a" stroke-width="4.8"/>
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
 * The second furniture tranche, pinned the same way and on the same terms as the eight above:
 * these four MAY be re-blessed when their symbols are redrawn, and each diff is to be read
 * before it is accepted.
 *
 * They are a separate block only because their footprints come from somewhere else. Three of
 * the four carry no catalogued footprint on purpose (see `fixtures-catalog.ts`), so the size
 * in each case is the one a real plan would write: a 2000 x 1400 rug, a 1500 x 1400 baby
 * grand, a 700 x 1900 lounger. `sofa_l` uses its catalogued 2600 x 1600.
 *
 * The rug's pin carries one thing the others do not: every `fill` in it is `none`. That is the
 * property `test/glyphs-batch2.test.ts` asserts structurally, and having it visible in a byte
 * pin as well means a fill can never creep in unnoticed at either level.
 */
describe("fixture symbols — the second tranche (re-blessed when redrawn)", () => {
  it("rug", () => {
    expect(svg("furniture rug at (300,300) size 2000x1400")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="2216,300 2248.15,306.39 2275.4,324.6 2293.61,351.85 2300,384 2300,1616 2293.61,1648.15 2275.4,1675.4 2248.15,1693.61 2216,1700 384,1700 351.85,1693.61 324.6,1675.4 306.39,1648.15 300,1616 300,384 306.39,351.85 324.6,324.6 351.85,306.39 384,300" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="2129.76,398 2157.41,403.5 2180.84,419.16 2196.5,442.59 2202,470.24 2202,1529.76 2196.5,1557.41 2180.84,1580.84 2157.41,1596.5 2129.76,1602 470.24,1602 442.59,1596.5 419.16,1580.84 403.5,1557.41 398,1529.76 398,470.24 403.5,442.59 419.16,419.16 442.59,403.5 470.24,398" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="400" x2="370" y2="400" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="400" x2="2300" y2="400" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="600" x2="370" y2="600" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="600" x2="2300" y2="600" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="800" x2="370" y2="800" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="800" x2="2300" y2="800" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="1000" x2="370" y2="1000" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="1000" x2="2300" y2="1000" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="1200" x2="370" y2="1200" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="1200" x2="2300" y2="1200" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="1400" x2="370" y2="1400" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="1400" x2="2300" y2="1400" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="300" y1="1600" x2="370" y2="1600" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2230" y1="1600" x2="2300" y2="1600" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1902" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="2001" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("sofa_l", () => {
    expect(svg("furniture sofa_l at (300,300) size 2600x1600")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,460 312.18,398.77 346.86,346.86 398.77,312.18 460,300 2740,300 2801.23,312.18 2853.14,346.86 2887.82,398.77 2900,460 2900,1036 2887.82,1097.23 2853.14,1149.14 2801.23,1183.82 2740,1196 1210,1196 1210,1740 1197.82,1801.23 1163.14,1853.14 1111.23,1887.82 1050,1900 460,1900 398.77,1887.82 346.86,1853.14 312.18,1801.23 300,1740" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="300" y1="540" x2="2900" y2="540" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="638" y1="300" x2="638" y2="1900" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="1773.33" y1="540" x2="1773.33" y2="1196" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="2336.67" y1="540" x2="2336.67" y2="1196" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="638" y1="1548" x2="1210" y2="1548" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="2142" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="2241" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("piano", () => {
    expect(svg("furniture piano at (300,300) size 1500x1400")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 1800,300 1794.44,534.12 1777.76,697.75 1750.02,840.14 1711.29,968.21 1661.67,1084.58 1601.29,1190.38 1530.25,1286.15 1448.67,1372.09 1356.59,1448.23 1253.98,1514.53 1140.62,1570.89 1015.94,1617.2 878.72,1653.35 726.16,1679.24 550.84,1694.81 300,1700" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="360,328 1620,328 1620,468 360,468" fill="#ffffff" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="612" y1="328" x2="612" y2="468" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="864" y1="328" x2="864" y2="468" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="1116" y1="328" x2="1116" y2="468" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="1368" y1="328" x2="1368" y2="468" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="390" y1="552" x2="900" y2="1504" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1950" y="1182" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1950" y="1281" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("sun_lounger", () => {
    expect(svg("furniture sun_lounger at (300,300) size 700x1900")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="860,300 913.58,310.66 958.99,341.01 989.34,386.42 1000,440 1000,2060 989.34,2113.58 958.99,2158.99 913.58,2189.34 860,2200 440,2200 386.42,2189.34 341.01,2158.99 310.66,2113.58 300,2060 300,440 310.66,386.42 341.01,341.01 386.42,310.66 440,300" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="860,395 892.15,401.39 919.4,419.6 937.61,446.85 944,479 944,805 937.61,837.15 919.4,864.4 892.15,882.61 860,889 440,889 407.85,882.61 380.6,864.4 362.39,837.15 356,805 356,479 362.39,446.85 380.6,419.6 407.85,401.39 440,395" fill="#f4f2ee" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="370" y1="1060" x2="930" y2="1060" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="370" y1="1257.6" x2="930" y2="1257.6" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="370" y1="1455.2" x2="930" y2="1455.2" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="370" y1="1652.8" x2="930" y2="1652.8" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="370" y1="1850.4" x2="930" y2="1850.4" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="370" y1="2048" x2="930" y2="2048" stroke="#a8a29a" stroke-width="2.64"/>
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
 * The outdoor tranche (Group 4), pinned on the same terms as Groups 2 and 3.
 *
 * Four symbols, each pinning a property the other three do not. `tree` is the unfilled-planting
 * case — the whole canopy is `fill="none"`, which is the thing a later refactor is most likely to
 * "tidy" into a body fill without noticing it paints out the path underneath. `pergola` is the
 * all-dashed case (`stroke-dasharray` on the outline, not on the posts). `shed` mixes the two: a
 * filled carcass with a dashed ridge over it. `bbq` is the only one of the four with a catalogued
 * footprint, so its size comes from the catalog rather than from this file.
 */
describe("fixture symbols — the outdoor tranche (re-blessed when redrawn)", () => {
  it("tree", () => {
    expect(svg("furniture tree at (300,300) size 2400x2400")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3720" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3720" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="2652,1500 2415.31,1879.13 2314.59,2314.59 1879.13,2415.31 1500,2652 1120.87,2415.31 685.41,2314.59 584.69,1879.13 348,1500 584.69,1120.87 685.41,685.41 1120.87,584.69 1500,348 1879.13,584.69 2314.59,685.41 2415.31,1120.87" fill="none" stroke="#a8a29a" stroke-width="4.8"/>
      <circle cx="1500" cy="1500" r="391.68" fill="none" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="1500" cy="1500" r="138.24" fill="#a8a29a" stroke="#a8a29a" stroke-width="4.8"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="300" y="222" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="300" y="321" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2850" width="250" height="42" fill="#333333"/><rect x="250" y="2850" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2952" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2952" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("pergola", () => {
    expect(svg("furniture pergola at (300,300) size 2000x1400")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 2300,300 2300,1700 300,1700" fill="none" stroke="#a8a29a" stroke-width="4.8" stroke-dasharray="28.8 19.2"/>
      <circle cx="412" cy="412" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="2188" cy="412" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="2188" cy="1588" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="412" cy="1588" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="1902" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="2001" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("shed", () => {
    expect(svg("furniture shed at (300,300) size 2400x1800")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="300,300 2700,300 2700,2100 300,2100" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="444" y1="1200" x2="2556" y2="1200" stroke="#a8a29a" stroke-width="2.64" stroke-dasharray="28.8 19.2"/>
      <line x1="1140" y1="1992" x2="1860" y2="1992" stroke="#a8a29a" stroke-width="2.64"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="300" y="2142" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="300" y="2241" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
      </g>
      <g><polygon points="2865,-415.5 2797.5,-199.5 2865,-246.75 2932.5,-199.5" fill="#333333" transform="rotate(0 2865 -280.5)"/><text x="2865" y="-477.9" font-size="78" fill="#333333" text-anchor="middle" dominant-baseline="central">N</text></g>
      <g><rect x="0" y="2550" width="250" height="42" fill="#333333"/><rect x="250" y="2550" width="250" height="42" fill="none" stroke="#333333" stroke-width="4.8"/><text x="0" y="2652" font-size="60" fill="#333333" text-anchor="start" dominant-baseline="central">0</text><text x="500" y="2652" font-size="60" fill="#333333" text-anchor="middle" dominant-baseline="central">0.5 m</text></g>
      </svg>"
    `);
  });

  it("bbq", () => {
    expect(svg("furniture bbq at (300,300) size 1200x600")).toMatchInlineSnapshot(`
      "<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"  viewBox="-510 -510 4020 3420" font-family="Helvetica, Arial, sans-serif">
      <defs></defs>
      <rect x="-510" y="-510" width="4020" height="3420" fill="#ffffff"/>
      <g id="A-FLOR" inkscape:groupmode="layer" inkscape:label="A-FLOR">
      <polygon points="0,0 3000,0 3000,2400 0,2400" fill="#fbfaf7"/>
      </g>
      <g id="A-FURN" inkscape:groupmode="layer" inkscape:label="A-FURN">
      <polygon points="1416,300 1448.15,306.39 1475.4,324.6 1493.61,351.85 1500,384 1500,816 1493.61,848.15 1475.4,875.4 1448.15,893.61 1416,900 384,900 351.85,893.61 324.6,875.4 306.39,848.15 300,816 300,384 306.39,351.85 324.6,324.6 351.85,306.39 384,300" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="1260,348 1452,348 1452,852 1260,852" fill="#ffffff" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="1260" y1="600" x2="1452" y2="600" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="588" y1="384" x2="588" y2="780" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="780" y1="384" x2="780" y2="780" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="972" y1="384" x2="972" y2="780" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="396" y1="483" x2="1164" y2="483" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="396" y1="582" x2="1164" y2="582" stroke="#a8a29a" stroke-width="2.64"/>
      <line x1="396" y1="681" x2="1164" y2="681" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="492" cy="840" r="36" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
      <circle cx="1044" cy="840" r="36" fill="#a8a29a" stroke="#a8a29a" stroke-width="2.64"/>
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
