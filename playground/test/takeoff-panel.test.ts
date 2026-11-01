/**
 * The pure half of the Takeoff tab. The figures come from the core's `quantities` fact, so these
 * cases hold the panel to that block and to `takeoffCsv`, never to a number of its own; the tab
 * itself is `playground/e2e/takeoff.spec.ts`.
 */
import { describe as coreDescribe, MAX_WASTE_PCT, takeoffCsv } from "archlang";
import { describe, expect, it } from "vitest";
import { csvFileName, parseWaste, quantitiesHtml } from "../src/takeoff-panel.js";

const PLAN = `plan "Cabin, two rooms" {
  units mm
  wall id=s exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall id=p partition thickness 100 { (3000,0) (3000,4000) }
  room id=a at (0,0) size 3000x4000 label "Living <room>" uses living
  room id=b at (3000,0) size 3000x4000 label "Bed" uses bedroom
  door on s at 1000 width 900
  door on p at 2000 width 800
  window on s at 4000 width 1500
}
`;
const read = (wastePct?: number) =>
  coreDescribe(PLAN, { facts: ["quantities"], ...(wastePct !== undefined ? { wastePct } : {}) });
const labels = new Map([
  ["a", "Living <room>"],
  ["b", "Bed"],
]);

describe("parseWaste", () => {
  it("blank is no allowance, never a default", () => {
    expect(parseWaste("")).toEqual({});
    expect(parseWaste("   ")).toEqual({});
  });

  it("takes describe's own range, and no more", () => {
    expect(parseWaste("0")).toEqual({ pct: 0 });
    expect(parseWaste(" 7.5 ")).toEqual({ pct: 7.5 });
    expect(parseWaste(String(MAX_WASTE_PCT))).toEqual({ pct: MAX_WASTE_PCT });
    for (const bad of ["-1", String(MAX_WASTE_PCT + 1), "ten", "Infinity", "NaN"])
      expect(parseWaste(bad), bad).toEqual({ error: `A percentage from 0 to ${MAX_WASTE_PCT}, or blank for none.` });
  });

  it("whatever it accepts, describe accepts", () => {
    for (const text of ["0", "7.5", String(MAX_WASTE_PCT)]) {
      const w = parseWaste(text) as { pct: number };
      expect(() => read(w.pct)).not.toThrow();
    }
  });
});

describe("quantitiesHtml", () => {
  const q = read().quantities!;
  const html = quantitiesHtml(q, labels);

  it("shows every figure of the block, by its convention", () => {
    for (const heading of [
      "Centreline length (mm)",
      "Face length (mm)",
      "Perimeter, centreline (mm)",
      "Perimeter, net (mm)",
      "Net area (m²)",
    ])
      expect(html).toContain(heading);
    for (const w of q.walls) {
      expect(html).toContain(`<td>${w.category}</td>`);
      expect(html).toContain(`>${w.length_centreline_mm}<`);
      expect(html).toContain(`>${w.length_face_mm}<`);
    }
    for (const r of q.rooms) {
      expect(html).toContain(`>${r.perimeter_centreline_mm}<`);
      expect(html).toContain(`>${r.perimeter_net_mm}<`);
      expect(html).toContain(`>${r.area_net_m2}<`);
    }
    for (const d of q.doors) expect(html).toContain(`<td>${d.kind}</td>`);
    expect(q.doors.reduce((n, d) => n + d.count, 0)).toBe(2);
    expect(html).toContain(`>${q.floor_area_net_m2}<`);
  });

  it("escapes a label, and falls back to the id", () => {
    expect(html).toContain("Living &lt;room&gt;");
    expect(html).not.toContain("<room>");
    expect(quantitiesHtml(q, new Map())).toContain("<td>a</td>");
  });

  it("names waste only when the author gave one", () => {
    expect(html).not.toContain("waste");
    const withWaste = read(10).quantities!;
    const out = quantitiesHtml(withWaste, labels);
    expect(out).toContain("Waste you entered (%)");
    expect(out).toContain(`>${withWaste.floor_area_with_waste_m2}<`);
  });

  it("an omitted figure is a dash, never a zero, and an omitted storey of faces says why", () => {
    const { length_face_mm: _f, ...wall } = q.walls[0]!;
    const out = quantitiesHtml({ ...q, walls: [wall], faces_omitted: "too-much-work" }, labels);
    expect(out).toContain(">—<");
    expect(out).toContain("Face lengths are omitted on this storey: too-much-work.");
  });

  it("makes no claim for cost or construction", () => {
    expect(html).not.toMatch(/accura|estimate|guarantee|cost/i);
  });
});

describe("the CSV", () => {
  it("is the core's, the bytes `arch takeoff --format csv` writes", () => {
    const csv = takeoffCsv(read());
    expect(csv.split("\n")[0]).toBe("level,section,item,width_mm,field,value");
    expect(csv).toContain(",walls,exterior,,count,1\n");
    expect(csv).not.toContain("waste");
    expect(takeoffCsv(read(10))).toContain(",floor,storey,,waste_pct,10\n");
  });

  it("names its file for the plan", () => {
    expect(csvFileName("Cabin, two rooms")).toBe("cabin-two-rooms-takeoff.csv");
    expect(csvFileName("  ")).toBe("plan-takeoff.csv");
  });
});
