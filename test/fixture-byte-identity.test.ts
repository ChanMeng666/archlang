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
 * module rather than a fourth drawing: `tree` is a curved (`path`) canopy filled with the lawn
 * tint, `pergola` is dashed all the
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
      <path d="M 353.52,300 L 646.48,300 A 23.52 23.52 0 0 1 670,323.52 L 670,444.48 A 23.52 23.52 0 0 1 646.48,468 L 353.52,468 A 23.52 23.52 0 0 1 330,444.48 L 330,323.52 A 23.52 23.52 0 0 1 353.52,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 500,961.5 A 121.51 121.51 0 0 1 397.02,904.48 A 373.97 373.97 0 0 1 397.02,507.52 A 121.51 121.51 0 0 1 500,450.5 A 121.51 121.51 0 0 1 602.98,507.52 A 373.97 373.97 0 0 1 602.98,904.48 A 121.51 121.51 0 0 1 500,961.5 Z" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 500,923.1 A 91.53 91.53 0 0 1 422.01,879.49 A 294.71 294.71 0 0 1 422.01,570.91 A 91.53 91.53 0 0 1 500,527.3 A 91.53 91.53 0 0 1 577.99,570.91 A 294.71 294.71 0 0 1 577.99,879.49 A 91.53 91.53 0 0 1 500,923.1 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="432" y1="482.83" x2="432" y2="512.47" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="568" y1="482.83" x2="568" y2="512.47" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="500" cy="384" r="16" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 900,300 900,750 300,750" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="804,552 797.05,589.27 776.67,624 744.25,653.82 702,676.71 652.8,691.09 600,696 547.2,691.09 498,676.71 455.75,653.82 423.33,624 402.95,589.27 396,552 402.95,514.73 423.33,480 455.75,450.18 498,427.29 547.2,412.91 600,408 652.8,412.91 702,427.29 744.25,450.18 776.67,480 797.05,514.73" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="763.2,552 757.64,581.82 741.34,609.6 715.4,633.46 681.6,651.77 642.24,663.27 600,667.2 557.76,663.27 518.4,651.77 484.6,633.46 458.66,609.6 442.36,581.82 436.8,552 442.36,522.18 458.66,494.4 484.6,470.54 518.4,452.23 557.76,440.73 600,436.8 642.24,440.73 681.6,452.23 715.4,470.54 741.34,494.4 757.64,522.18" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <polygon points="570,313.5 630,313.5 630,358.5 570,358.5" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="600" y1="358.5" x2="600" y2="494.4" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 1200,300 1200,1200 300,1200" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="372,372 1128,372 1128,1128 372,1128" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="372" y1="372" x2="1128" y2="1128" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1128" y1="372" x2="372" y2="1128" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="750" cy="750" r="45" fill="none" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="750" cy="750" r="16.2" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="1874,300 1922.22,309.59 1963.1,336.9 1990.41,377.78 2000,426 2000,874 1990.41,922.22 1963.1,963.1 1922.22,990.41 1874,1000 426,1000 377.78,990.41 336.9,963.1 309.59,922.22 300,874 300,426 309.59,377.78 336.9,336.9 377.78,309.59 426,300" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="1766.16,384 1790.59,388.86 1811.3,402.7 1825.14,423.41 1830,447.84 1830,852.16 1825.14,876.59 1811.3,897.3 1790.59,911.14 1766.16,916 669.84,916 645.41,911.14 624.7,897.3 610.86,876.59 606,852.16 606,447.84 610.86,423.41 624.7,402.7 645.41,388.86 669.84,384" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="419" cy="650" r="35" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="1354" cy="650" r="28" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 1100,300 1100,900 300,900" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="636.08,456 644.47,457.67 651.58,462.42 656.33,469.53 658,477.92 658,794.08 656.33,802.47 651.58,809.58 644.47,814.33 636.08,816 405.92,816 397.53,814.33 390.42,809.58 385.67,802.47 384,794.08 384,477.92 385.67,469.53 390.42,462.42 397.53,457.67 405.92,456" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="521" cy="636" r="32.88" fill="#f4f2ee" stroke="#a8a29a" stroke-width="3.47"/>
      <polygon points="994.08,456 1002.47,457.67 1009.58,462.42 1014.33,469.53 1016,477.92 1016,794.08 1014.33,802.47 1009.58,809.58 1002.47,814.33 994.08,816 763.92,816 755.53,814.33 748.42,809.58 743.67,802.47 742,794.08 742,477.92 743.67,469.53 748.42,462.42 755.53,457.67 763.92,456" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="879" cy="636" r="32.88" fill="#f4f2ee" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="700" cy="336" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="700" y1="336" x2="700" y2="468" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 900,300 900,900 300,900" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="300" y1="792" x2="900" y2="792" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 900,300 900,900 300,900" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="480" cy="480" r="96" fill="none" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="480" cy="480" r="57.6" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="480" cy="720" r="96" fill="none" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="480" cy="720" r="57.6" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="720" cy="480" r="96" fill="none" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="720" cy="480" r="57.6" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="720" cy="720" r="96" fill="none" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="720" cy="720" r="57.6" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="852" x2="900" y2="852" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 900,300 900,950 300,950" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="330,330 870,330 870,920 330,920" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="820" x2="900" y2="820" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="495" x2="900" y2="495" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="504" y1="891.5" x2="696" y2="891.5" stroke="#6c6864" stroke-width="4.8"/>
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
      <polygon points="370,300 2230,300 2230,1700 370,1700" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <polygon points="482,412 2118,412 2118,1588 482,1588" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="350" x2="370" y2="350" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="350" x2="2300" y2="350" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="450" x2="370" y2="450" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="450" x2="2300" y2="450" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="550" x2="370" y2="550" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="550" x2="2300" y2="550" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="650" x2="370" y2="650" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="650" x2="2300" y2="650" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="750" x2="370" y2="750" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="750" x2="2300" y2="750" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="850" x2="370" y2="850" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="850" x2="2300" y2="850" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="950" x2="370" y2="950" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="950" x2="2300" y2="950" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1050" x2="370" y2="1050" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1050" x2="2300" y2="1050" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1150" x2="370" y2="1150" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1150" x2="2300" y2="1150" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1250" x2="370" y2="1250" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1250" x2="2300" y2="1250" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1350" x2="370" y2="1350" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1350" x2="2300" y2="1350" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1450" x2="370" y2="1450" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1450" x2="2300" y2="1450" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1550" x2="370" y2="1550" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1550" x2="2300" y2="1550" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1650" x2="370" y2="1650" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1650" x2="2300" y2="1650" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 300,362.72 A 62.72 62.72 0 0 1 362.72,300 L 2837.28,300 A 62.72 62.72 0 0 1 2900,362.72 L 2900,1133.28 A 62.72 62.72 0 0 1 2837.28,1196 L 1196,1196 L 1196,1837.28 A 62.72 62.72 0 0 1 1133.28,1900 L 362.72,1900 A 62.72 62.72 0 0 1 300,1837.28 L 300,362.72 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 2738.72,300 L 2837.28,300 A 62.72 62.72 0 0 1 2900,362.72 L 2900,1133.28 A 62.72 62.72 0 0 1 2837.28,1196 L 2801.44,1196 A 62.72 62.72 0 0 1 2738.72,1133.28 L 2738.72,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 300,1738.72 L 1133.28,1738.72 A 62.72 62.72 0 0 1 1196,1801.44 L 1196,1837.28 A 62.72 62.72 0 0 1 1133.28,1900 L 362.72,1900 A 62.72 62.72 0 0 1 300,1837.28 L 300,1738.72 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 376.16,344.8 L 1124.32,344.8 A 31.36 31.36 0 0 1 1155.68,376.16 L 1155.68,447.84 A 31.36 31.36 0 0 1 1124.32,479.2 L 376.16,479.2 A 31.36 31.36 0 0 1 344.8,447.84 L 344.8,376.16 A 31.36 31.36 0 0 1 376.16,344.8 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 376.16,495.33 L 447.84,495.33 A 31.36 31.36 0 0 1 479.2,526.69 L 479.2,1124.32 A 31.36 31.36 0 0 1 447.84,1155.68 L 376.16,1155.68 A 31.36 31.36 0 0 1 344.8,1124.32 L 344.8,526.69 A 31.36 31.36 0 0 1 376.16,495.33 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 1203.17,344.8 L 1646.62,344.8 A 31.36 31.36 0 0 1 1677.98,376.16 L 1677.98,447.84 A 31.36 31.36 0 0 1 1646.62,479.2 L 1203.17,479.2 A 31.36 31.36 0 0 1 1171.81,447.84 L 1171.81,376.16 A 31.36 31.36 0 0 1 1203.17,344.8 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 1725.47,344.8 L 2168.93,344.8 A 31.36 31.36 0 0 1 2200.29,376.16 L 2200.29,447.84 A 31.36 31.36 0 0 1 2168.93,479.2 L 1725.47,479.2 A 31.36 31.36 0 0 1 1694.11,447.84 L 1694.11,376.16 A 31.36 31.36 0 0 1 1725.47,344.8 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 2247.78,344.8 L 2691.23,344.8 A 31.36 31.36 0 0 1 2722.59,376.16 L 2722.59,447.84 A 31.36 31.36 0 0 1 2691.23,479.2 L 2247.78,479.2 A 31.36 31.36 0 0 1 2216.42,447.84 L 2216.42,376.16 A 31.36 31.36 0 0 1 2247.78,344.8 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 376.16,1171.81 L 447.84,1171.81 A 31.36 31.36 0 0 1 479.2,1203.17 L 479.2,1691.23 A 31.36 31.36 0 0 1 447.84,1722.59 L 376.16,1722.59 A 31.36 31.36 0 0 1 344.8,1691.23 L 344.8,1203.17 A 31.36 31.36 0 0 1 376.16,1171.81 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 535.65,495.33 L 1115.36,495.33 A 40.32 40.32 0 0 1 1155.68,535.65 L 1155.68,1115.36 A 40.32 40.32 0 0 1 1115.36,1155.68 L 535.65,1155.68 A 40.32 40.32 0 0 1 495.33,1115.36 L 495.33,535.65 A 40.32 40.32 0 0 1 535.65,495.33 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 1212.13,495.33 L 1637.66,495.33 A 40.32 40.32 0 0 1 1677.98,535.65 L 1677.98,1115.36 A 40.32 40.32 0 0 1 1637.66,1155.68 L 1212.13,1155.68 A 40.32 40.32 0 0 1 1171.81,1115.36 L 1171.81,535.65 A 40.32 40.32 0 0 1 1212.13,495.33 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 1734.43,495.33 L 2159.97,495.33 A 40.32 40.32 0 0 1 2200.29,535.65 L 2200.29,1115.36 A 40.32 40.32 0 0 1 2159.97,1155.68 L 1734.43,1155.68 A 40.32 40.32 0 0 1 1694.11,1115.36 L 1694.11,535.65 A 40.32 40.32 0 0 1 1734.43,495.33 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 2256.74,495.33 L 2682.27,495.33 A 40.32 40.32 0 0 1 2722.59,535.65 L 2722.59,1115.36 A 40.32 40.32 0 0 1 2682.27,1155.68 L 2256.74,1155.68 A 40.32 40.32 0 0 1 2216.42,1115.36 L 2216.42,535.65 A 40.32 40.32 0 0 1 2256.74,495.33 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 535.65,1171.81 L 1115.36,1171.81 A 40.32 40.32 0 0 1 1155.68,1212.13 L 1155.68,1682.27 A 40.32 40.32 0 0 1 1115.36,1722.59 L 535.65,1722.59 A 40.32 40.32 0 0 1 495.33,1682.27 L 495.33,1212.13 A 40.32 40.32 0 0 1 535.65,1171.81 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 300,300 L 1800,300 L 1800,1325 A 375 375 0 0 1 1523.16,1686.92 A 375 375 0 0 1 1101.39,1514.48 A 1425 1425 0 0 0 435.39,925.73 A 224 224 0 0 1 300,720 L 300,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 349,580 L 1751,580 L 1751,1325 A 326 326 0 0 1 1510.33,1639.63 A 326 326 0 0 1 1143.67,1489.72 A 1474 1474 0 0 0 454.77,880.72 A 175 175 0 0 1 349,720 L 349,580 Z" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 412.5,342 L 1687.5,342 L 1687.5,482 L 412.5,482 L 412.5,342 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="465.63" y1="342" x2="465.63" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="518.75" y1="342" x2="518.75" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="571.88" y1="342" x2="571.88" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="625" y1="342" x2="625" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="678.13" y1="342" x2="678.13" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="731.25" y1="342" x2="731.25" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="784.38" y1="342" x2="784.38" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="837.5" y1="342" x2="837.5" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="890.63" y1="342" x2="890.63" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="943.75" y1="342" x2="943.75" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="996.88" y1="342" x2="996.88" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1050" y1="342" x2="1050" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1103.13" y1="342" x2="1103.13" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1156.25" y1="342" x2="1156.25" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1209.38" y1="342" x2="1209.38" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1262.5" y1="342" x2="1262.5" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1315.63" y1="342" x2="1315.63" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1368.75" y1="342" x2="1368.75" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1421.88" y1="342" x2="1421.88" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1475" y1="342" x2="1475" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1528.13" y1="342" x2="1528.13" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1581.25" y1="342" x2="1581.25" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1634.38" y1="342" x2="1634.38" y2="482" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="860,300 913.58,310.66 958.99,341.01 989.34,386.42 1000,440 1000,2060 989.34,2113.58 958.99,2158.99 913.58,2189.34 860,2200 440,2200 386.42,2189.34 341.01,2158.99 310.66,2113.58 300,2060 300,440 310.66,386.42 341.01,341.01 386.42,310.66 440,300" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="860,395 892.15,401.39 919.4,419.6 937.61,446.85 944,479 944,805 937.61,837.15 919.4,864.4 892.15,882.61 860,889 440,889 407.85,882.61 380.6,864.4 362.39,837.15 356,805 356,479 362.39,446.85 380.6,419.6 407.85,401.39 440,395" fill="#f4f2ee" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="370" y1="1060" x2="930" y2="1060" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="370" y1="1257.6" x2="930" y2="1257.6" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="370" y1="1455.2" x2="930" y2="1455.2" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="370" y1="1652.8" x2="930" y2="1652.8" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="370" y1="1850.4" x2="930" y2="1850.4" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="370" y1="2048" x2="930" y2="2048" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 2426.49,1315.71 A 184.29 184.29 0 0 1 2610.78,1500 A 184.29 184.29 0 0 1 2426.49,1684.29 A 209.1 209.1 0 0 1 2457.88,1896.77 A 209.1 209.1 0 0 1 2285.44,2024.81 A 184.29 184.29 0 0 1 2285.44,2285.44 A 184.29 184.29 0 0 1 2024.81,2285.44 A 209.1 209.1 0 0 1 1896.77,2457.88 A 209.1 209.1 0 0 1 1684.29,2426.49 A 184.29 184.29 0 0 1 1500,2610.78 A 184.29 184.29 0 0 1 1315.71,2426.49 A 209.1 209.1 0 0 1 1103.23,2457.88 A 209.1 209.1 0 0 1 975.19,2285.44 A 184.29 184.29 0 0 1 714.56,2285.44 A 184.29 184.29 0 0 1 714.56,2024.81 A 209.1 209.1 0 0 1 542.12,1896.77 A 209.1 209.1 0 0 1 573.51,1684.29 A 184.29 184.29 0 0 1 389.22,1500 A 184.29 184.29 0 0 1 573.51,1315.71 A 209.1 209.1 0 0 1 542.12,1103.23 A 209.1 209.1 0 0 1 714.56,975.19 A 184.29 184.29 0 0 1 714.56,714.56 A 184.29 184.29 0 0 1 975.19,714.56 A 209.1 209.1 0 0 1 1103.23,542.12 A 209.1 209.1 0 0 1 1315.71,573.51 A 184.29 184.29 0 0 1 1500,389.22 A 184.29 184.29 0 0 1 1684.29,573.51 A 209.1 209.1 0 0 1 1896.77,542.12 A 209.1 209.1 0 0 1 2024.81,714.56 A 184.29 184.29 0 0 1 2285.44,714.56 A 184.29 184.29 0 0 1 2285.44,975.19 A 209.1 209.1 0 0 1 2457.88,1103.23 A 209.1 209.1 0 0 1 2426.49,1315.71 Z" fill="#eef3e7" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="1638.24" y1="1500" x2="1983.84" y2="1500" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1983.84" y1="1500" x2="2198.63" y2="1351.5" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1983.84" y1="1500" x2="2198.63" y2="1648.5" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1597.75" y1="1597.75" x2="1842.13" y2="1842.13" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1842.13" y1="1842.13" x2="2099.01" y2="1889" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1842.13" y1="1842.13" x2="1889" y2="2099.01" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1500" y1="1638.24" x2="1500" y2="1983.84" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1500" y1="1983.84" x2="1648.5" y2="2198.63" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1500" y1="1983.84" x2="1351.5" y2="2198.63" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1402.25" y1="1597.75" x2="1157.87" y2="1842.13" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1157.87" y1="1842.13" x2="1111" y2="2099.01" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1157.87" y1="1842.13" x2="900.99" y2="1889" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1361.76" y1="1500" x2="1016.16" y2="1500" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1016.16" y1="1500" x2="801.37" y2="1648.5" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1016.16" y1="1500" x2="801.37" y2="1351.5" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1402.25" y1="1402.25" x2="1157.87" y2="1157.87" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1157.87" y1="1157.87" x2="900.99" y2="1111" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1157.87" y1="1157.87" x2="1111" y2="900.99" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1500" y1="1361.76" x2="1500" y2="1016.16" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1500" y1="1016.16" x2="1351.5" y2="801.37" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1500" y1="1016.16" x2="1648.5" y2="801.37" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1597.75" y1="1402.25" x2="1842.13" y2="1157.87" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1842.13" y1="1157.87" x2="1889" y2="900.99" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1842.13" y1="1157.87" x2="2099.01" y2="1111" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="1500" cy="1500" r="57.6" fill="#6c6864" stroke="#6c6864" stroke-width="4.8"/>
      </g>
      <g id="A-ANNO-TEXT" inkscape:groupmode="layer" inkscape:label="A-ANNO-TEXT">
      <text x="1500" y="222" font-size="90" fill="#222222" text-anchor="middle" dominant-baseline="central" font-weight="600">Room</text>
      <text x="1500" y="321" font-size="66" fill="#7a7a7a" text-anchor="middle" dominant-baseline="central">7.2 m²</text>
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
      <polygon points="300,300 2300,300 2300,1700 300,1700" fill="none" stroke="#6c6864" stroke-width="4.8" stroke-dasharray="28.8 19.2"/>
      <circle cx="412" cy="412" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="2188" cy="412" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="2188" cy="1588" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="412" cy="1588" r="84" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 2700,300 2700,2100 300,2100" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="444" y1="1200" x2="2556" y2="1200" stroke="#a8a29a" stroke-width="3.47" stroke-dasharray="28.8 19.2"/>
      <line x1="1140" y1="1992" x2="1860" y2="1992" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="1416,300 1448.15,306.39 1475.4,324.6 1493.61,351.85 1500,384 1500,816 1493.61,848.15 1475.4,875.4 1448.15,893.61 1416,900 384,900 351.85,893.61 324.6,875.4 306.39,848.15 300,816 300,384 306.39,351.85 324.6,324.6 351.85,306.39 384,300" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="1260,348 1452,348 1452,852 1260,852" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1260" y1="600" x2="1452" y2="600" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="588" y1="384" x2="588" y2="780" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="780" y1="384" x2="780" y2="780" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="972" y1="384" x2="972" y2="780" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="396" y1="483" x2="1164" y2="483" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="396" y1="582" x2="1164" y2="582" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="396" y1="681" x2="1164" y2="681" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="492" cy="840" r="36" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="1044" cy="840" r="36" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
