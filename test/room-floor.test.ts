/**
 * `room … floor <pattern>` (issue #405): a hatch over a room's floor, and a drawing fact alone.
 *
 * The twin law is the heart of it: a plan with a `floor` on every room reads exactly as the same plan
 * without, through `describe()` and `lint()`, on every room form. The drawing gains one `hatch` node and
 * one `<pattern>` and nothing else moves, so a label stays where it was and the page keeps its size.
 */

import { describe as suite, expect, it } from "vitest";
import { compile, describe, format, lint, planToJson } from "../src/index.js";
import { FLOOR_TINT_MATERIAL, FLOOR_TINT_MIX, floorWash, room, roomFloorFill } from "../src/elements/room.js";
import { toDxf } from "../src/export/dxf.js";
import { renderAscii } from "../src/backends/ascii.js";
import { FLOOR_MATERIALS, FLOOR_PATTERNS, floorHatch, hatchId, hatchPattern, KNOWN_MATERIALS } from "../src/hatches.js";
import type { RRoom } from "../src/ir.js";
import type { RenderSizes, SceneNode } from "../src/scene.js";
import { DEFAULT_THEME, mergeTheme, THEMES, type Theme } from "../src/theme.js";
import { parseHexColor } from "../src/elements/glyph-lib.js";

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

  it("lists every known word, the three of card RM8.7 last, so a mistyped floor's text is the one that moved", () => {
    const d = compile(plan(`room id=a at (0,0) size 4000x3000 floor timbre`)).diagnostics.find(
      (x) => x.code === "W_UNKNOWN_MATERIAL",
    );
    expect(d?.message).toBe(
      'Unknown floor "timbre" (known: tile, paving, deck, concrete, timber, carpeting, stone); drawing no pattern',
    );
    expect(d?.hints).toEqual(['Did you mean "timber"?']);
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

/** WCAG 2 relative luminance and contrast ratio, from the spec's formula. */
const lum = (hex: string): number => {
  const [r, g, b] = parseHexColor(hex)!;
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The fill of a plan's first room floor (its polygon or its circle). */
const floorFill = (src: string): string | undefined =>
  compile(src).scene!.nodes.find((n) => n.layer === "floor" && n.prim.t !== "hatch")?.paint?.fill;

suite("under `rendered`, a floor-only word washes its room (card RM8.7, RM-D28)", () => {
  const rendered = mergeTheme(THEMES.rendered);
  const room3 = (theme: string, floor: string) =>
    plan(`${theme}room id=a at (0,0) size 4000x3000 label "A" uses living${floor}`);

  it("keeps the floor pattern's ink at 2.0:1 or more on every wash (the ruling's hard floor)", () => {
    // ADR 0023's 2026-11-12 amendment: the floor-hatch ink (`pocheHatch`) against the wash, by WCAG
    // relative luminance. The full material tints give 1.66 to 1.87:1; `roomFill` itself gives 2.28:1.
    expect(Object.keys(FLOOR_TINT_MATERIAL).sort()).toEqual([...FLOOR_PATTERNS].sort());
    const tints = rendered.materialTints!;
    for (const word of FLOOR_PATTERNS) {
      const fill = floorFill(room3("theme rendered\n  ", ` floor ${word}`))!;
      expect(fill, word).toBe(roomFloorFill(rendered, word));
      expect(fill, `${word} is a wash, not the plain floor`).not.toBe(rendered.roomFill);
      expect(contrast(rendered.pocheHatch, fill), `${rendered.pocheHatch} on ${word} ${fill}`).toBeGreaterThanOrEqual(
        2,
      );
      // The control: the full tint of the same material does not clear the floor, so the check can fail.
      const full = tints[FLOOR_TINT_MATERIAL[word]!]!;
      expect(contrast(rendered.pocheHatch, full), `${word} full tint ${full}`).toBeLessThan(2);
    }
    expect(contrast(rendered.pocheHatch, rendered.roomFill)).toBeGreaterThan(2.2);
    // The values the PR and `FLOOR_TINT_MIX`'s comment quote, held here so the prose cannot drift.
    expect(FLOOR_PATTERNS.map((w) => roomFloorFill(rendered, w))).toEqual(["#f8f2e7", "#faf6f0", "#f7f5f1"]);
  });

  it("holds every shipped theme that has tints to the same floor, not `rendered` alone", () => {
    // The wash follows `materialTints`, not a theme's name: a theme given tints later is washed too, so
    // the 2.0:1 floor is asserted for every theme that has them. Today that is `rendered` alone.
    const tinted = Object.entries(THEMES).filter(([, layer]) => mergeTheme(layer).materialTints !== undefined);
    expect(tinted.map(([name]) => name)).toContain("rendered");
    for (const [name, layer] of tinted) {
      const t = mergeTheme(layer);
      for (const word of FLOOR_PATTERNS) {
        const fill = floorFill(room3(`theme ${name}\n  `, ` floor ${word}`))!;
        expect(fill, `${word} under ${name}`).toBe(roomFloorFill(t, word));
        expect(contrast(t.pocheHatch, fill), `${word} under ${name}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("is the material's tint moved a third of the way from `roomFill`, channel by channel", () => {
    expect(FLOOR_TINT_MIX).toEqual([1, 3]);
    const [p, q] = FLOOR_TINT_MIX;
    for (const word of FLOOR_PATTERNS) {
      const t = parseHexColor(rendered.materialTints![FLOOR_TINT_MATERIAL[word]!]!)!;
      const f = parseHexColor(rendered.roomFill)!;
      const want = `#${[0, 1, 2]
        .map((i) =>
          Math.round((f[i]! * (q - p) + t[i]! * p) / q)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
      expect(roomFloorFill(rendered, word), word).toBe(want);
    }
  });

  it("washes nothing under any other theme, nor an older word under `rendered`", () => {
    const others: [string, string, Theme][] = [
      ["default", "", mergeTheme()],
      ...Object.entries(THEMES)
        .filter(([t]) => t !== "rendered")
        .map(([t, layer]): [string, string, Theme] => [t, `theme ${t}\n  `, mergeTheme(layer)]),
    ];
    expect(others.length).toBeGreaterThan(4);
    for (const [name, theme, t] of others) {
      expect(t.materialTints, name).toBeUndefined();
      for (const word of FLOOR_PATTERNS)
        expect(floorFill(room3(theme, ` floor ${word}`)), `${word} under ${name}`).toBe(t.roomFill);
    }
    for (const word of FLOOR_MATERIALS.filter((w) => !(FLOOR_PATTERNS as readonly string[]).includes(w)))
      expect(floorFill(room3("theme rendered\n  ", ` floor ${word}`)), word).toBe(rendered.roomFill);
    // A circle's floor is a `circle` primitive: it takes the wash the same way.
    const circle = plan(`theme rendered\n  room id=a circle at (2000,2000) radius 2000 floor stone`);
    expect(floorFill(circle)).toBe(roomFloorFill(rendered, "stone"));
  });

  it("an author's one furniture colour drops the tints, and the wash with them", () => {
    // `theme rendered { furniture … }` replaces the material tints (`mergeTheme`), so there is no
    // material tint left to wash a floor in: the room keeps `roomFill`.
    const src = room3('theme rendered { furniture: "#eeeeee" }\n  ', " floor timber");
    expect(floorFill(src)).toBe(rendered.roomFill);
    // A tint table that is not an object, or a room colour that is no hex, keeps `roomFill`.
    expect(roomFloorFill({ ...rendered, materialTints: null as never }, "timber")).toBe(rendered.roomFill);
    expect(roomFloorFill({ ...rendered, roomFill: "white" }, "timber")).toBe("white");
    expect(roomFloorFill(rendered, undefined)).toBe(rendered.roomFill);
  });

  it("is a drawing fact: `describe()` and `lint()` under `rendered` read as the plan without it", () => {
    for (const word of FLOOR_PATTERNS) {
      const floored = room3("theme rendered\n  ", ` floor ${word}`);
      const plain = room3("theme rendered\n  ", "");
      expect(describe(floored), word).toEqual(describe(plain));
      expect(noSpans(lint(floored)), word).toEqual(noSpans(lint(plain)));
    }
  });

  // Card RM8.7b: the legend swatch is drawn on the wash the room is, from the same `roomFloorFill`.
  const legendPlan = (pre: string, floor: string) =>
    plan(
      `${pre}paper A2 landscape\n  scale 1:100\n  legend\n  room id=a at (0,0) size 4000x3000 label "A" uses living${floor}`,
    );
  /** The legend swatch of `material` and the nodes drawn just before and after it. */
  const swatchOf = (src: string, material: string) => {
    const { scene, svg } = compile(src, { noCache: true });
    const nodes = scene!.nodes;
    const i = nodes.findIndex((n) => n.layer === "annotations" && n.prim.t === "hatch" && n.prim.material === material);
    return { svg, nodes, swatch: nodes[i], under: i > 0 ? nodes[i - 1] : undefined, after: nodes[i + 1] };
  };

  for (const word of FLOOR_PATTERNS) {
    it(`${word}: its legend swatch is drawn on the room's wash`, () => {
      const wash = roomFloorFill(rendered, word);
      expect(wash, "a wash, not the plain floor").not.toBe(rendered.roomFill);
      expect(floorWash(rendered, word)).toBe(wash);
      const src = legendPlan("theme rendered\n  ", ` floor ${word}`);
      const { svg, swatch, under, after } = swatchOf(src, word);
      expect(swatch, `${word} has a legend row`).toBeDefined();
      // The swatch's frame takes the wash and is drawn under the pattern: one loop, not two.
      expect(under?.layer).toBe("annotations");
      expect(under?.prim.t).toBe("polygon");
      expect(under?.paint.fill, "the swatch's tint is the room's own").toBe(floorFill(src));
      expect(under?.paint.fill).toBe(wash);
      expect(under?.paint.stroke).toBe(rendered.annotation);
      expect(after?.prim.t, "no second frame over the pattern").not.toBe("polygon");
      // The tint fills the swatch's own box, and nothing else.
      expect(under!.prim.t === "polygon" && under!.prim.pts).toEqual(
        swatch!.prim.t === "hatch" && swatch!.prim.region[0],
      );
      // In the SVG: the room's floor and the swatch, the only two shapes in the wash.
      expect(svg.split(`fill="${wash}"`).length - 1).toBe(2);
    });
  }

  it("with no wash (an older word, or any theme but `rendered`) a swatch is drawn as on `main`: pattern, then frame", () => {
    const asBefore = (src: string, word: string, where: string): void => {
      const { swatch, under, after } = swatchOf(src, word);
      expect(swatch, where).toBeDefined();
      expect(under?.prim.t, `${where}: nothing drawn under the pattern`).not.toBe("polygon");
      expect(after?.prim.t, `${where}: the frame over it`).toBe("polygon");
      expect(after?.paint.fill, where).toBe("none");
    };
    asBefore(legendPlan("theme rendered\n  ", " floor tile"), "tile", "tile under rendered");
    for (const [name, pre, t] of [
      ["default", "", DEFAULT_THEME] as const,
      ...Object.keys(THEMES)
        .filter((n) => n !== "rendered")
        .map((n) => [n, `theme ${n}\n  `, mergeTheme(THEMES[n])] as const),
    ]) {
      for (const word of FLOOR_PATTERNS) {
        expect(floorWash(t, word), `${word} under ${name}`).toBeUndefined();
        asBefore(legendPlan(pre, ` floor ${word}`), word, `${word} under ${name}`);
      }
    }
  });

  it("a `style room` block's room colour washes the swatch as it washes the room", () => {
    const src = legendPlan('theme rendered\n  style room { fill: "#f4f8fc" }\n  ', " floor stone");
    const { under } = swatchOf(src, "stone");
    const room = floorFill(src);
    expect(room, "the styled room is washed from its own colour").not.toBe(roomFloorFill(rendered, "stone"));
    expect(under?.paint.fill).toBe(room);
  });
});

suite("the floor-only patterns (card RM8.7)", () => {
  it("reach DXF as their named HATCH and paint no base", () => {
    for (const [word, dxf] of [
      ["timber", "AR-HBONE"],
      ["carpeting", "CROSS"],
      ["stone", "AR-RSHKE"],
    ] as const) {
      const out = compile(plan(`room id=a at (0,0) size 4000x3000 floor ${word}`));
      expect(toDxf(out.scene!), word).toContain(dxf);
      const pattern = patternOf(out.svg, `hatch-${word}`);
      expect(pattern, word).not.toBe("");
      expect(pattern, word).not.toContain("<rect");
    }
  });

  it("a herringbone tile is covered exactly once: every block of the repeat, no gap and no overlap", () => {
    // Read the blocks back off the markup at a round gap, unit a = 1 (gap 2), and sample the tile at
    // every cell centre: each must fall in exactly one block.
    const svg = compile(plan(`room id=a at (0,0) size 4000x3000 floor timber`)).svg;
    expect(patternOf(svg, "hatch-timber")).toContain('patternTransform="rotate(45)"');
    const markup = hatchPattern(
      { material: "timber", scale: 1, angle: 0 },
      { fmt: String, gap: 2, thin: 1, base: "", line: "" },
    );
    const blocks = [...markup.matchAll(/M(-?[\d.]+),(-?[\d.]+) h(-?[\d.]+) v(-?[\d.]+)/g)].map((m) =>
      m.slice(1, 5).map(Number),
    );
    expect(blocks.length).toBeGreaterThan(8);
    for (let x = 0.5; x < 8; x++)
      for (let y = 0.5; y < 8; y++) {
        const n = blocks.filter(([bx, by, w, h]) => x > bx! && x < bx! + w! && y > by! && y < by! + h!).length;
        expect(n, `cell (${x}, ${y})`).toBe(1);
      }
  });
});
