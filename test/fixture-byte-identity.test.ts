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
      <path d="M 327,300 L 873,300 A 27 27 0 0 1 900,327 L 900,723 A 27 27 0 0 1 873,750 L 327,750 A 27 27 0 0 1 300,723 L 300,327 A 27 27 0 0 1 327,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 828,561 A 120.17 120.17 0 0 1 774.79,660.79 A 313.68 313.68 0 0 1 425.21,660.79 A 120.17 120.17 0 0 1 372,561 A 120.17 120.17 0 0 1 425.21,461.21 A 313.68 313.68 0 0 1 774.79,461.21 A 120.17 120.17 0 0 1 828,561 Z" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 797.4,561 A 92.52 92.52 0 0 1 753.63,639.63 A 291.54 291.54 0 0 1 446.37,639.63 A 92.52 92.52 0 0 1 402.6,561 A 92.52 92.52 0 0 1 446.37,482.37 A 291.54 291.54 0 0 1 753.63,482.37 A 92.52 92.52 0 0 1 797.4,561 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="600" cy="351.75" r="15.75" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="600" y1="351.75" x2="600" y2="439.5" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="600" cy="576.3" r="13.5" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 336,300 L 1164,300 A 36 36 0 0 1 1200,336 L 1200,1164 A 36 36 0 0 1 1164,1200 L 336,1200 A 36 36 0 0 1 300,1164 L 300,336 A 36 36 0 0 1 336,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 372,354 L 1128,354 A 18 18 0 0 1 1146,372 L 1146,1128 A 18 18 0 0 1 1128,1146 L 372,1146 A 18 18 0 0 1 354,1128 L 354,372 A 18 18 0 0 1 372,354 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="373.09" y1="373.09" x2="715" y2="715" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1126.91" y1="373.09" x2="785" y2="715" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1126.91" y1="1126.91" x2="785" y2="785" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="373.09" y1="1126.91" x2="715" y2="785" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="750" cy="750" r="49.5" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="750" cy="750" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 356,300 L 1944,300 A 56 56 0 0 1 2000,356 L 2000,944 A 56 56 0 0 1 1944,1000 L 356,1000 A 56 56 0 0 1 300,944 L 300,356 A 56 56 0 0 1 356,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 520.36,363 L 1695.92,363 A 241.08 241.08 0 0 1 1937,604.08 L 1937,695.92 A 241.08 241.08 0 0 1 1695.92,937 L 520.36,937 A 80.36 80.36 0 0 1 440,856.64 L 440,443.36 A 80.36 80.36 0 0 1 520.36,363 Z" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="370" cy="566" r="24.5" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="370" cy="734" r="24.5" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="545" cy="650" r="31.5" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="545" cy="650" r="10.5" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 470.05,420 L 929.95,420 A 43.8 43.8 0 0 1 973.75,463.8 L 973.75,814.2 A 43.8 43.8 0 0 1 929.95,858 L 470.05,858 A 43.8 43.8 0 0 1 426.25,814.2 L 426.25,463.8 A 43.8 43.8 0 0 1 470.05,420 Z" fill="#ffffff" stroke="#6c6864" stroke-width="4.8"/>
      <circle cx="700" cy="639" r="28.47" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="700" cy="363" r="21" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="700" y1="384" x2="700" y2="507.6" stroke="#a8a29a" stroke-width="3.47"/>
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
      <line x1="300" y1="327" x2="900" y2="327" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="864" x2="900" y2="864" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 351,336 L 849,336 A 15 15 0 0 1 864,351 L 864,729 A 15 15 0 0 1 849,744 L 351,744 A 15 15 0 0 1 336,729 L 336,351 A 15 15 0 0 1 351,336 Z" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="474.12" cy="444.12" r="76.7" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="474.12" cy="444.12" r="42.19" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="725.88" cy="444.12" r="76.7" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="725.88" cy="444.12" r="42.19" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="474.12" cy="635.88" r="55.61" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="474.12" cy="635.88" r="30.59" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="725.88" cy="635.88" r="55.61" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="725.88" cy="635.88" r="30.59" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="420" cy="837" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="540" cy="837" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="660" cy="837" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
      <circle cx="780" cy="837" r="18" fill="#a8a29a" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 312,300 L 888,300 A 12 12 0 0 1 900,312 L 900,938 A 12 12 0 0 1 888,950 L 312,950 A 12 12 0 0 1 300,938 L 300,312 A 12 12 0 0 1 312,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="300" y1="859" x2="900" y2="859" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="504" y1="904.5" x2="696" y2="904.5" stroke="#6c6864" stroke-width="4.8"/>
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
      <polygon points="2216,300 2248.15,306.39 2275.4,324.6 2293.61,351.85 2300,384 2300,1616 2293.61,1648.15 2275.4,1675.4 2248.15,1693.61 2216,1700 384,1700 351.85,1693.61 324.6,1675.4 306.39,1648.15 300,1616 300,384 306.39,351.85 324.6,324.6 351.85,306.39 384,300" fill="none" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="2129.76,398 2157.41,403.5 2180.84,419.16 2196.5,442.59 2202,470.24 2202,1529.76 2196.5,1557.41 2180.84,1580.84 2157.41,1596.5 2129.76,1602 470.24,1602 442.59,1596.5 419.16,1580.84 403.5,1557.41 398,1529.76 398,470.24 403.5,442.59 419.16,419.16 442.59,403.5 470.24,398" fill="none" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="400" x2="370" y2="400" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="400" x2="2300" y2="400" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="600" x2="370" y2="600" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="600" x2="2300" y2="600" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="800" x2="370" y2="800" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="800" x2="2300" y2="800" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1000" x2="370" y2="1000" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1000" x2="2300" y2="1000" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1200" x2="370" y2="1200" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1200" x2="2300" y2="1200" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1400" x2="370" y2="1400" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1400" x2="2300" y2="1400" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="300" y1="1600" x2="370" y2="1600" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2230" y1="1600" x2="2300" y2="1600" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,460 312.18,398.77 346.86,346.86 398.77,312.18 460,300 2740,300 2801.23,312.18 2853.14,346.86 2887.82,398.77 2900,460 2900,1036 2887.82,1097.23 2853.14,1149.14 2801.23,1183.82 2740,1196 1210,1196 1210,1740 1197.82,1801.23 1163.14,1853.14 1111.23,1887.82 1050,1900 460,1900 398.77,1887.82 346.86,1853.14 312.18,1801.23 300,1740" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <line x1="300" y1="540" x2="2900" y2="540" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="638" y1="300" x2="638" y2="1900" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1773.33" y1="540" x2="1773.33" y2="1196" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="2336.67" y1="540" x2="2336.67" y2="1196" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="638" y1="1548" x2="1210" y2="1548" stroke="#a8a29a" stroke-width="3.47"/>
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
      <polygon points="300,300 1800,300 1794.44,534.12 1777.76,697.75 1750.02,840.14 1711.29,968.21 1661.67,1084.58 1601.29,1190.38 1530.25,1286.15 1448.67,1372.09 1356.59,1448.23 1253.98,1514.53 1140.62,1570.89 1015.94,1617.2 878.72,1653.35 726.16,1679.24 550.84,1694.81 300,1700" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <polygon points="360,328 1620,328 1620,468 360,468" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="612" y1="328" x2="612" y2="468" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="864" y1="328" x2="864" y2="468" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1116" y1="328" x2="1116" y2="468" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="1368" y1="328" x2="1368" y2="468" stroke="#a8a29a" stroke-width="3.47"/>
      <line x1="390" y1="552" x2="900" y2="1504" stroke="#a8a29a" stroke-width="3.47"/>
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
      <path d="M 356,300 L 944,300 A 56 56 0 0 1 1000,356 L 1000,2144 A 56 56 0 0 1 944,2200 L 356,2200 A 56 56 0 0 1 300,2144 L 300,356 A 56 56 0 0 1 356,300 Z" fill="#f4f2ee" stroke="#6c6864" stroke-width="4.8"/>
      <path d="M 391,366.5 L 909,366.5 A 28 28 0 0 1 937,394.5 L 937,861 A 28 28 0 0 1 909,889 L 391,889 A 28 28 0 0 1 363,861 L 363,394.5 A 28 28 0 0 1 391,366.5 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 391,917.5 L 909,917.5 A 28 28 0 0 1 937,945.5 L 937,1336 A 28 28 0 0 1 909,1364 L 391,1364 A 28 28 0 0 1 363,1336 L 363,945.5 A 28 28 0 0 1 391,917.5 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 391,1392.5 L 909,1392.5 A 28 28 0 0 1 937,1420.5 L 937,2105.5 A 28 28 0 0 1 909,2133.5 L 391,2133.5 A 28 28 0 0 1 363,2105.5 L 363,1420.5 A 28 28 0 0 1 391,1392.5 Z" fill="#ffffff" stroke="#a8a29a" stroke-width="3.47"/>
      <path d="M 480.32,414 L 819.68,414 A 14 14 0 0 1 833.68,428 L 833.68,495 A 14 14 0 0 1 819.68,509 L 480.32,509 A 14 14 0 0 1 466.32,495 L 466.32,428 A 14 14 0 0 1 480.32,414 Z" fill="#f4f2ee" stroke="#a8a29a" stroke-width="3.47"/>
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
