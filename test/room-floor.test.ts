/**
 * `room … floor <pattern>` (issue #405): a hatch over a room's floor, and a drawing fact alone.
 *
 * The twin law is the heart of it: a plan with a `floor` on every room reads exactly as the same plan
 * without, through `describe()` and `lint()`, on every room form. The drawing gains one `hatch` node and
 * one `<pattern>` and nothing else moves, so a label stays where it was and the page keeps its size.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint, planToJson } from "../src/index.js";
import { room } from "../src/elements/room.js";
import { toDxf } from "../src/export/dxf.js";
import { renderAscii } from "../src/backends/ascii.js";
import { FLOOR_MATERIALS, floorHatch, hatchId, KNOWN_MATERIALS } from "../src/hatches.js";
import type { RRoom } from "../src/ir.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";
import { DEFAULT_THEME } from "../src/theme.js";

const plan = (body: string): string => `plan "F" {\n  units mm\n  ${body}\n}\n`;

/** Every room form, with `{f}` where the clause goes. */
const FORMS: readonly [string, string][] = [
  [
    "a rectangle",
    `room id=a at (0,0) size 4000x3000 label "A" uses bath{f}\n  walls from rooms exterior 200 partition 100`,
  ],
  [
    "a relational room",
    `room id=a at (0,0) size 3000x3000 uses living{f}\n  room id=b right-of a size 2000x3000 uses kitchen{f}\n  walls from rooms exterior 200 partition 100`,
  ],
  ["a polygon", `room id=a polygon (0,0) (4000,0) (4000,2000) (2000,2000) (2000,4000) (0,4000) label "L"{f}`],
  ["a circle", `room id=a circle at (2000,2000) radius 2000 label "Round"{f}`],
  [
    "a strip",
    `strip right at (0,0) gap 0 height 3000 {\n    room id=a size 3000 label "A" uses hall{f}\n    room id=b size 3000 label "B"\n  }`,
  ],
  [
    "a placed room, turned and mirrored",
    `component c() {\n    room id=r at (0,0) size 3000x2000 label "R"{f}\n    wall id=w exterior thickness 200 { (0,0) (3000,0) (3000,2000) (0,2000) close }\n  }\n  place c() as x at (0,0)\n  place c() as y at (8000,0) rotate 90 mirror x`,
  ],
  [
    "a storey",
    `level 1 {\n    room id=a at (0,0) size 3000x3000 label "A"{f}\n  }\n  level 2 {\n    room id=b at (0,0) size 3000x3000 label "B"\n  }`,
  ],
];

const withFloor = (body: string, floor: string): string => plan(body.replaceAll("{f}", floor));
const noSpans = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (k, v) => (k === "span" ? undefined : v)));

/** One `<pattern>` of a drawing, found by its id: `""` when it has none. */
const patternOf = (svg: string, id: string): string => {
  const at = svg.indexOf(`<pattern id="${id}"`);
  return at < 0 ? "" : svg.slice(at, svg.indexOf("</pattern>", at));
};

/** A `deck` floor's pattern and hatch taken out of an SVG, leaving what the plain plan drew. Each hatch is a line. */
const withoutFloors = (svg: string): string => {
  const pattern = patternOf(svg, "hatch-deck");
  const defs = pattern ? svg.replace(`${pattern}</pattern>`, "") : svg;
  return defs
    .split("\n")
    .filter((l) => !l.includes('"url(#hatch-deck)"'))
    .join("\n");
};

suite("a floor is a drawing fact", () => {
  it.each(FORMS)("%s: describe() and lint() read as the plan without it", (_, body) => {
    for (const material of FLOOR_MATERIALS) {
      const plain = withFloor(body, "");
      const floored = withFloor(body, ` floor ${material}`);
      expect(describe(floored), material).toEqual(describe(plain));
      expect(noSpans(lint(floored)), material).toEqual(noSpans(lint(plain)));
    }
  });

  it.each(FORMS)("%s: the drawing gains a pattern and a hatch and nothing else", (_, body) => {
    const plain = compile(withFloor(body, ""));
    const floored = compile(withFloor(body, " floor deck"));
    expect(floored.errors).toEqual([]);
    expect(floored.svg).toContain("url(#hatch-deck)");
    expect(withoutFloors(floored.svg)).toBe(plain.svg);
    const pages = (o: typeof floored) => (o.pages ?? [{ svg: o.svg }]).map((p) => withoutFloors(p.svg));
    expect(pages(floored)).toEqual(pages(plain));
  });

  it("does not move a label, a dimension or the page", () => {
    const body = `room id=a at (0,0) size 4000x3000 label "A"{f}\n  furniture table at (1500,1100) size 1000x800\n  walls from rooms exterior 200 partition 100\n  dims auto all`;
    const text = (src: string) =>
      compile(src)
        .scene!.nodes.filter((n) => n.prim.t === "text")
        .map((n) => n.prim);
    expect(text(withFloor(body, " floor tile"))).toEqual(text(withFloor(body, "")));
  });
});

suite("the pattern", () => {
  it("takes the room's own ring, never its bounding box", () => {
    const src = plan(`room id=a polygon (0,0) (4000,0) (4000,2000) (2000,2000) (2000,4000) (0,4000) floor deck`);
    const hatch = compile(src).scene!.nodes.find((n) => n.prim.t === "hatch" && n.layer === "floor")!;
    expect(hatch.prim).toMatchObject({
      region: [
        [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 2000 },
          { x: 2000, y: 2000 },
          { x: 2000, y: 4000 },
          { x: 0, y: 4000 },
        ],
      ],
    });
  });

  it("follows the room through a `place`", () => {
    const src = plan(
      `component c() {\n    room id=r at (0,0) size 3000x2000 floor tile\n  }\n  place c() as y at (8000,0) rotate 90`,
    );
    const out = compile(src).scene!;
    const floor = out.nodes.find((n) => n.prim.t === "polygon" && n.layer === "floor")!;
    const hatch = out.nodes.find((n) => n.prim.t === "hatch" && n.layer === "floor")!;
    expect(hatch.prim.t === "hatch" && hatch.prim.region[0]).toEqual(floor.prim.t === "polygon" && floor.prim.pts);
  });

  it("a wall word paints no base, so a tiled room does not take a wall's tint", () => {
    const wall = `wall id=w exterior thickness 200 material tile { (0,0) (4000,0) (4000,3000) (0,3000) close }`;
    const svg = compile(plan(`room id=a at (0,0) size 4000x3000 floor tile\n  ${wall}`)).svg;
    const defs = svg.slice(svg.indexOf("<defs>"), svg.indexOf("</defs>"));
    const floor = patternOf(defs, "hatch-tile-floor");
    const own = patternOf(defs, "hatch-tile");
    expect(floor).toContain('fill="none"');
    expect(floor).not.toContain(DEFAULT_THEME.pocheBase);
    expect(own).toContain(DEFAULT_THEME.pocheBase);
    expect(own).toBe(patternOf(compile(plan(wall)).svg, "hatch-tile"));
  });

  it("every word is a pattern the scene defines, with no dangling reference", () => {
    for (const material of FLOOR_MATERIALS) {
      const svg = compile(plan(`room id=a at (0,0) size 4000x3000 floor ${material}`)).svg;
      const id = hatchId(floorHatch(material));
      expect(svg).toContain(`url(#${id})`);
      expect(svg).toContain(`<pattern id="${id}"`);
      expect(id.endsWith("-floor")).toBe((KNOWN_MATERIALS as readonly string[]).includes(material));
    }
  });

  it("is one pattern however many rooms write it", () => {
    const svg = compile(
      plan(`room id=a at (0,0) size 2000x2000 floor deck\n  room id=b at (2000,0) size 2000x2000 floor deck`),
    ).svg;
    expect(svg.match(/<pattern /g)).toHaveLength(1);
  });
});

suite("the sheet and the exports", () => {
  it("adds one legend row per pattern, and the fit reserves it", () => {
    const body = `room id=a at (0,0) size 2000x2000 label "A" floor tile\n  room id=b at (2000,0) size 2000x2000 label "B" floor deck\n  room id=c at (4000,0) size 2000x2000 label "C" floor deck`;
    const legend = (src: string) => compile(src).scene!.chrome!.tables?.legend?.entries.map((e) => e.name);
    const rows = legend(plan(`paper A4\n  legend\n  ${body}`));
    expect(rows).toEqual(["deck", "tile floor"]);
    // The rows the page draws are the rows `resolve()` reserved, or the page outgrows its paper.
    expect(compile(plan(`paper A4\n  legend\n  ${body}`)).scene!.sheet?.grown).toBe(false);
  });

  it("a floor's row reads apart from a wall's of the one word, and `sheet text` writes the word", () => {
    const wall = "wall id=w exterior thickness 200 material tile { (0,0) (4000,0) (4000,3000) (0,3000) close }";
    const body = `legend\n  room id=a at (0,0) size 4000x3000 floor tile\n  ${wall}`;
    const names = (src: string) => compile(src).scene!.chrome!.tables?.legend?.entries.map((e) => e.name);
    expect(names(plan(body))).toEqual(["tile", "tile floor"]);
    expect(names(plan(`sheet text { floor "Boden" tile "Fliese" }\n  ${body}`))).toEqual(["Fliese", "Fliese Boden"]);
  });

  it("reaches DXF as a real HATCH, on the room's ring", () => {
    const dxf = toDxf(compile(plan(`room id=a at (0,0) size 4000x3000 floor tile`)).scene!);
    expect(dxf).toContain("HATCH");
    expect(dxf).toContain("NET");
  });

  it("leaves the ASCII drawing alone", () => {
    const ascii = (src: string): string => renderAscii(compile(src).scene!);
    const body = `room id=a at (0,0) size 4000x3000 label "A"{f}\n  walls from rooms exterior 200 partition 100`;
    expect(ascii(withFloor(body, " floor tile"))).toBe(ascii(withFloor(body, "")));
  });

  it("is counted by the drawing budget", () => {
    const r = (floor: boolean): RRoom =>
      ({
        kind: "room",
        id: "a",
        at: { x: 0, y: 0 },
        size: { w: 1000, h: 1000 },
        ...(floor ? { floor: "tile" } : {}),
      }) as RRoom;
    const sizes = compile(plan("room id=a at (0,0) size 1000x1000")).scene!.sizes as RenderSizes;
    const drawn = (floor: boolean): SceneNode[] =>
      room.render(r(floor), {
        theme: DEFAULT_THEME,
        sizes,
        bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        fmt: String,
        openingsVoided: true,
        floorAt: () => true,
      });
    expect(drawn(true).length).toBeLessThanOrEqual(room.drawCost!(r(true)));
    expect(drawn(false).length).toBeLessThanOrEqual(room.drawCost!(r(false)));
    expect(room.drawCost!(r(true))).toBe(room.drawCost!(r(false)) + 1);
  });
});

suite("the clause in the grammar", () => {
  it("stands after `uses` or before it", () => {
    const a = compile(plan(`room id=a at (0,0) size 4000x3000 label "A" uses bath floor tile`)).svg;
    const b = compile(plan(`room id=a at (0,0) size 4000x3000 label "A" floor tile uses bath`)).svg;
    expect(a).toBe(b);
    expect(a).toContain("hatch-tile-floor");
  });

  it("refuses an unknown word as W_UNKNOWN_MATERIAL, and draws no pattern", () => {
    const out = compile(plan(`room id=a at (0,0) size 4000x3000 floor tiles`));
    const d = out.diagnostics.find((x) => x.code === "W_UNKNOWN_MATERIAL");
    expect(d?.message).toContain('Unknown floor "tiles"');
    expect(d?.hints).toEqual(['Did you mean "tile"?']);
    expect(out.svg).toBe(compile(plan(`room id=a at (0,0) size 4000x3000`)).svg);
  });

  it("points the warning at the word", () => {
    const src = plan(`room id=a at (0,0) size 4000x3000 floor marble`);
    const span = compile(src).diagnostics.find((x) => x.code === "W_UNKNOWN_MATERIAL")?.span;
    expect(src.slice(span!.start, span!.end)).toBe("marble");
  });

  it("wants its word on its own line, so `floor` alone stays a refused statement", () => {
    const src = plan(`room id=a at (0,0) size 4000x3000 floor\n  room id=b at (4000,0) size 1000x1000`);
    expect(compile(src).diagnostics.find((d) => d.code === "E_PARSE")?.message).toContain('"floor"');
  });

  it("prints back and stays a fixed point, in a strip as well", () => {
    const src = withFloor(FORMS[4]![1], " floor tile");
    const once = format(src);
    expect(once).toContain("uses hall floor tile");
    expect(format(once)).toBe(once);
    expect(compile(once).svg).toBe(compile(src).svg);
    const rect = plan(`room id=a at (0,0) size 4000x3000 floor deck uses bath`);
    expect(format(rect)).toContain("uses bath floor deck");
  });

  it("is listed in Plan JSON's `dropped`, with the rooms that wrote it", () => {
    const src = plan(`room id=a at (0,0) size 2000x2000 floor tile\n  room id=b at (2000,0) size 2000x2000`);
    expect(planToJson(src).dropped?.find((r) => r.clause === "floor")).toEqual({
      clause: "floor",
      count: 1,
      ids: ["a"],
    });
  });
});
