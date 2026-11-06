import { readFileSync } from "node:fs";
import { describe as describeSuite, expect, it } from "vitest";
import { describe, describeLevel } from "../../src/index.js";
import {
  areaText,
  factsLine,
  factsLineAll,
  openingsText,
  roomCardFacts,
  roomTip,
  sizeText,
  sourceLines,
} from "../src/room-facts.js";

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");

describeSuite("sourceLines", () => {
  it("counts newline-terminated lines, and a last line with no newline", () => {
    expect(sourceLines("")).toBe(0);
    expect(sourceLines("a")).toBe(1);
    expect(sourceLines("a\n")).toBe(1);
    expect(sourceLines("a\nb")).toBe(2);
    expect(sourceLines("a\r\nb\r\n")).toBe(2);
    expect(sourceLines("\n\n")).toBe(2);
  });
});

describeSuite("openingsText", () => {
  it("says only the kinds a room has, in plain words", () => {
    expect(openingsText({ doors: 2, windows: 1, openings: 6 })).toBe("2 doors · 1 window · 6 openings");
    expect(openingsText({ doors: 0, windows: 3, openings: 1 })).toBe("3 windows · 1 opening");
    expect(openingsText({ doors: 0, windows: 0, openings: 0 })).toBe("none");
  });
});

describeSuite("areaText", () => {
  it("says net when describe() has a net area, else centreline", () => {
    expect(areaText(12.13, 13.2)).toBe("12.13 m² (net)");
    expect(areaText(undefined, 13.2)).toBe("13.2 m² (centreline)");
  });
});

describeSuite("sizeText", () => {
  const box = { x: 0, y: 0, w: 3300, h: 4000 };
  it("gives a rectangle its centreline width × depth, whatever corner its ring starts at", () => {
    const ring = [
      { x: 3300, y: 4000 },
      { x: 0, y: 4000 },
      { x: 0, y: 0 },
      { x: 3300, y: 0 },
    ];
    expect(sizeText({ bbox: box, floor_polygon: ring })).toBe("3300 × 4000 mm (centreline)");
  });
  it("gives any other shape the extent of its ring, with a tilde", () => {
    const trapezoid = [
      { x: 0, y: 0 },
      { x: 3300, y: 0 },
      { x: 2300, y: 4000 },
      { x: 1000, y: 4000 },
    ];
    expect(sizeText({ bbox: box, floor_polygon: trapezoid })).toBe("~3300 × 4000 mm (extent)");
    // Four corners of the box, but in an order that crosses itself: not a rectangle.
    const bowtie = [
      { x: 0, y: 0 },
      { x: 3300, y: 4000 },
      { x: 3300, y: 0 },
      { x: 0, y: 4000 },
    ];
    expect(sizeText({ bbox: box, floor_polygon: bowtie })).toBe("~3300 × 4000 mm (extent)");
  });
  it("gives a circle its diameter", () => {
    expect(sizeText({ bbox: box, floor_polygon: [], floor_circle: { cx: 0, cy: 0, r: 3000 } })).toBe(
      "⌀ 6000 mm (centreline)",
    );
  });
});

describeSuite("against describe() of the shipped examples", () => {
  it("Laneway House: the facts line, the tooltip and the card", () => {
    const src = example("laneway-house");
    const d = describe(src);
    expect(factsLine(src, d, null)).toBe(
      `${src.split("\n").length - 1} lines of ArchLang → 3 rooms · ${d.totals.net_floor_area_m2} m² (net)`,
    );
    const bed = d.rooms.find((r) => r.id === "r_bed")!;
    expect(roomTip(bed)).toBe(`Bedroom · ${bed.net_area_m2} m² (net) · 3300 × 4000 mm (centreline)`);
    expect(roomCardFacts(bed, d)).toEqual({
      name: "Bedroom",
      area: `${bed.net_area_m2} m² (net)`,
      centreline: `${bed.area_m2} m² (centreline)`,
      size: "3300 × 4000 mm (centreline)",
      use: "bedroom",
      neighbours: ["Living / Kitchen", "Bath"],
      doors: 1,
      windows: 1,
      openings: 0,
    });
    expect(openingsText(roomCardFacts(bed, d))).toBe("1 door · 1 window");
  });

  it("counts a room's cased openings too: the Hexagon Pavilion's Rotunda has six and no door", () => {
    const d = describe(example("hexagon-pavilion"));
    const rotunda = d.rooms.find((r) => r.label === "Rotunda")!;
    const f = roomCardFacts(rotunda, d);
    expect([f.doors, f.windows, f.openings]).toEqual([0, 0, 6]);
    expect(openingsText(f)).toBe("6 openings");
  });

  it("a storey's facts line names the storey, with that storey's totals", () => {
    const src = example("garden-house");
    const whole = describe(src);
    const upper = describeLevel(whole, 2);
    expect(factsLine(src, upper, 2)).toMatch(
      new RegExp(`→ ${upper.totals.rooms} rooms · ${upper.totals.net_floor_area_m2} m² \\(net\\) · level 2$`),
    );
  });

  it("every storey's facts line adds the storeys up and says it is all of them (card PG5b)", () => {
    const src = example("townhouse");
    const whole = describe(src);
    const levels = whole.levels!;
    expect(levels.length).toBe(3);
    const rooms = levels.reduce((n, l) => n + l.totals.rooms, 0);
    const net = Math.round(levels.reduce((n, l) => n + l.totals.net_floor_area_m2!, 0) * 100) / 100;
    const line = factsLineAll(src, levels);
    expect(line).toBe(`${sourceLines(src)} lines of ArchLang → ${rooms} rooms · ${net} m² (net) · all 3 storeys`);
    // describe()'s own top-level totals are the lowest storey's: the combined line is more.
    expect(rooms).toBeGreaterThan(whole.totals.rooms);
    expect(line).not.toMatch(/level \d/);
  });

  it("a circular room and a trapezoid say what their size measures", () => {
    const d = describe(example("hexagon-pavilion"));
    const rotunda = d.rooms.find((r) => r.floor_circle)!;
    expect(sizeText(rotunda)).toBe(`⌀ ${Math.round(2 * rotunda.floor_circle!.r)} mm (centreline)`);
    for (const r of d.rooms.filter((x) => !x.floor_circle)) expect(sizeText(r)).toMatch(/^~\d+ × \d+ mm \(extent\)$/);
  });
});
