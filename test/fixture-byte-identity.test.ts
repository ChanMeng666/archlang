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
      <polygon points="660,737.92 654.55,802.92 638.56,863.5 613.14,915.52 580,955.43 541.41,980.52 500,989.08 458.59,980.52 420,955.43 386.86,915.52 361.44,863.5 345.45,802.92 340,737.92 345.45,672.92 361.44,612.34 386.86,560.32 420,520.41 458.59,495.32 500,486.76 541.41,495.32 580,520.41 613.14,560.32 638.56,612.34 654.55,672.92" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
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
      <line x1="600" y1="345" x2="600" y2="408" stroke="#a8a29a" stroke-width="4.8"/>
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
      <line x1="300" y1="300" x2="1200" y2="1200" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="1200" y1="300" x2="300" y2="1200" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="822,750 819.55,768.63 812.35,786 800.91,800.91 786,812.35 768.63,819.55 750,822 731.37,819.55 714,812.35 699.09,800.91 687.65,786 680.45,768.63 678,750 680.45,731.37 687.65,714 699.09,699.09 714,687.65 731.37,680.45 750,678 768.63,680.45 786,687.65 800.91,699.09 812.35,714 819.55,731.37" fill="#f4f2ee" stroke="#a8a29a" stroke-width="4.8"/>
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
      <polygon points="1818,398 1850.15,404.39 1877.4,422.6 1895.61,449.85 1902,482 1902,818 1895.61,850.15 1877.4,877.4 1850.15,895.61 1818,902 482,902 449.85,895.61 422.6,877.4 404.39,850.15 398,818 398,482 404.39,449.85 422.6,422.6 449.85,404.39 482,398" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="454,650 452.81,659.06 449.31,667.5 443.75,674.75 436.5,680.31 428.06,683.81 419,685 409.94,683.81 401.5,680.31 394.25,674.75 388.69,667.5 385.19,659.06 384,650 385.19,640.94 388.69,632.5 394.25,625.25 401.5,619.69 409.94,616.19 419,615 428.06,616.19 436.5,619.69 443.75,625.25 449.31,632.5 452.81,640.94" fill="#a8a29a" stroke="#a8a29a" stroke-width="4.8"/>
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
      <polygon points="384,456 658,456 658,816 384,816" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="742,456 1016,456 1016,816 742,816" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <line x1="700" y1="348" x2="700" y2="420" stroke="#a8a29a" stroke-width="4.8"/>
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
      <line x1="300" y1="792" x2="900" y2="792" stroke="#a8a29a" stroke-width="4.8"/>
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
      <polygon points="576,480 572.73,504.85 563.14,528 547.88,547.88 528,563.14 504.85,572.73 480,576 455.15,572.73 432,563.14 412.12,547.88 396.86,528 387.27,504.85 384,480 387.27,455.15 396.86,432 412.12,412.12 432,396.86 455.15,387.27 480,384 504.85,387.27 528,396.86 547.88,412.12 563.14,432 572.73,455.15" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="576,720 572.73,744.85 563.14,768 547.88,787.88 528,803.14 504.85,812.73 480,816 455.15,812.73 432,803.14 412.12,787.88 396.86,768 387.27,744.85 384,720 387.27,695.15 396.86,672 412.12,652.12 432,636.86 455.15,627.27 480,624 504.85,627.27 528,636.86 547.88,652.12 563.14,672 572.73,695.15" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="816,480 812.73,504.85 803.14,528 787.88,547.88 768,563.14 744.85,572.73 720,576 695.15,572.73 672,563.14 652.12,547.88 636.86,528 627.27,504.85 624,480 627.27,455.15 636.86,432 652.12,412.12 672,396.86 695.15,387.27 720,384 744.85,387.27 768,396.86 787.88,412.12 803.14,432 812.73,455.15" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
      <polygon points="816,720 812.73,744.85 803.14,768 787.88,787.88 768,803.14 744.85,812.73 720,816 695.15,812.73 672,803.14 652.12,787.88 636.86,768 627.27,744.85 624,720 627.27,695.15 636.86,672 652.12,652.12 672,636.86 695.15,627.27 720,624 744.85,627.27 768,636.86 787.88,652.12 803.14,672 812.73,695.15" fill="#ffffff" stroke="#a8a29a" stroke-width="4.8"/>
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
