/**
 * The north arrow keeps off the dimension and axis bands on every corpus page (card AL1).
 *
 * The arrow is read back from the SVG as drawn (its polygon, the turn about its centre, its label),
 * not from the layout that placed it, and tested against the scene's nodes with a separating-axis
 * test of its own, so a placement that agrees with itself but not with the drawing still fails.
 * The historical spot is re-derived from its formula (right edge on the drawing's right bound,
 * centre 0.55 of the base margin above the drawing), so a moved arrow is compared with where it
 * stood: it may move only off a band, and it may not land on anything it was not already on.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { dimReach } from "../src/chrome-layout.js";
import { compile } from "../src/index.js";
import { primBBox } from "../src/label-placement.js";
import type { Scene, SceneNode } from "../src/scene.js";
import { inkWidth, textWidth } from "../src/text-metrics.js";
import { corpusFiles } from "./helpers/corpus.js";
import { worldFor } from "./helpers/world.js";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The arrow as the SVG draws it: its turned triangle and its label, boxed. */
function drawnArrow(svg: string): Rect | null {
  const line = svg.split("\n").find((l) => l.startsWith("<g><polygon ") && l.includes('transform="rotate('));
  if (!line) return null;
  const cut = line.indexOf("<text ");
  // Each `name="value"` of one element, read by `indexOf` (a backtracking regex trips CodeQL).
  const attrs = (s: string): Map<string, string> => {
    const out = new Map<string, string>();
    for (let at = s.indexOf('="'); at >= 0; at = s.indexOf('="', at + 2)) {
      const end = s.indexOf('"', at + 2);
      out.set(s.slice(s.lastIndexOf(" ", at) + 1, at), s.slice(at + 2, end));
      at = end - 1;
    }
    return out;
  };
  const poly = attrs(line.slice(0, cut));
  const text = attrs(line.slice(cut));
  const [deg, cx, cy] = poly.get("transform")!.slice("rotate(".length, -1).split(" ").map(Number) as [
    number,
    number,
    number,
  ];
  const rad = (deg * Math.PI) / 180;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const pair of poly.get("points")!.split(" ")) {
    const [px, py] = pair.split(",").map(Number) as [number, number];
    xs.push(cx + (px - cx) * Math.cos(rad) - (py - cy) * Math.sin(rad));
    ys.push(cy + (px - cx) * Math.sin(rad) + (py - cy) * Math.cos(rad));
  }
  const word = line.slice(line.indexOf(">", cut) + 1, line.indexOf("</text>"));
  const fs = Number(text.get("font-size"));
  const half = Math.max(textWidth(word, fs), inkWidth(word, fs)) / 2;
  const tx = Number(text.get("x"));
  const ty = Number(text.get("y"));
  xs.push(tx - half, tx + half);
  ys.push(ty - fs / 2, ty + fs / 2);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Shrink a rect by `e` on every side: the SVG rounds coordinates to 0.01 mm. */
const inset = (r: Rect, e: number): Rect => ({ x0: r.x0 + e, y0: r.y0 + e, x1: r.x1 - e, y1: r.y1 - e });

/** Does the segment ab meet the closed rect? Separating axes: x, y and the segment's normal. */
function segmentMeets(a: { x: number; y: number }, b: { x: number; y: number }, r: Rect): boolean {
  if (Math.max(a.x, b.x) < r.x0 || Math.min(a.x, b.x) > r.x1) return false;
  if (Math.max(a.y, b.y) < r.y0 || Math.min(a.y, b.y) > r.y1) return false;
  const nx = a.y - b.y;
  const ny = b.x - a.x;
  const at = nx * a.x + ny * a.y;
  const corners = [nx * r.x0 + ny * r.y0, nx * r.x1 + ny * r.y0, nx * r.x0 + ny * r.y1, nx * r.x1 + ny * r.y1];
  return Math.min(...corners) <= at && at <= Math.max(...corners);
}

/** Does a node put ink in the rect? A line as its segment; anything else by its box. */
function meets(n: SceneNode, r: Rect): boolean {
  if (n.prim.t === "line") return segmentMeets(n.prim.a, n.prim.b, r);
  const bb = primBBox(n.prim);
  return bb !== null && bb.x <= r.x1 && bb.x + bb.w >= r.x0 && bb.y <= r.y1 && bb.y + bb.h >= r.y0;
}

const BANDS: ReadonlySet<SceneNode["layer"]> = new Set(["dims", "axes"]);
const bandHits = (scene: Scene, r: Rect): number => scene.nodes.filter((n) => BANDS.has(n.layer) && meets(n, r)).length;
const allHits = (scene: Scene, r: Rect): Set<number> => {
  const out = new Set<number>();
  scene.nodes.forEach((n, i) => {
    if (meets(n, r)) out.add(i);
  });
  return out;
};

/** The title block and scale bar boxes the arrow must not newly cover. */
function chromeRects(scene: Scene): Rect[] {
  const out: Rect[] = [];
  const t = scene.chrome?.titleBlock;
  if (t) out.push({ x0: t.x0, y0: t.y0, x1: t.x0 + t.w, y1: t.y0 + t.h });
  const s = scene.chrome?.scaleBar;
  if (s && !s.hidden) out.push({ x0: s.x0, y0: s.y0, x1: s.x0 + s.barLen, y1: s.y0 + s.hgt + s.fs * 1.6 });
  return out;
}
const rectsMeet = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

/** The page rectangle the SVG's viewBox declares. */
function viewBox(svg: string): Rect {
  const at = svg.indexOf('viewBox="') + 'viewBox="'.length;
  const [x, y, w, h] = svg.slice(at, svg.indexOf('"', at)).split(" ").map(Number) as [number, number, number, number];
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

/**
 * Where the arrow stood before AL1, as `svg.ts` drew it: right edge on the drawing's right bound, centre
 * 0.55 of the base margin above it. The shape does not change with the spot, so the old ink is the drawn
 * ink moved from the drawn centre to that one.
 */
function historicalArrow(scene: Scene, svg: string, arrow: Rect): Rect {
  const r = scene.sizes.refDim * 0.045;
  const line = svg.split("\n").find((l) => l.startsWith("<g><polygon ") && l.includes('transform="rotate('))!;
  const at = line.indexOf("rotate(") + "rotate(".length;
  const [, cx, cy] = line.slice(at, line.indexOf(")", at)).split(" ").map(Number) as [number, number, number];
  const dx = scene.bounds.maxX - r - cx;
  const dy = scene.bounds.minY - scene.sizes.margin * 0.55 - cy;
  return { x0: arrow.x0 + dx, y0: arrow.y0 + dy, x1: arrow.x1 + dx, y1: arrow.y1 + dy };
}

describe("the north arrow over the corpus", () => {
  it("is clear of every dimension and axis node on every page, and moved only off a band onto clear page", () => {
    let pages = 0;
    let moved = 0;
    const spots = new Map<string, number>();
    for (const f of corpusFiles()) {
      const out = compile(readFileSync(f, "utf8"), { noCache: true, world: worldFor(dirname(join(process.cwd(), f))) });
      const drawn = out.pages
        ? out.pages.map((p) => ({ svg: p.svg, scene: p.scene }))
        : [{ svg: out.svg, scene: out.scene }];
      drawn.forEach(({ svg, scene }, i) => {
        if (!scene || scene.view || scene.northHidden) return;
        const where = `${f}#${i}`;
        // Recorded only when it moved: an arrow left where it always stood keeps its Scene's bytes.
        const north = scene.chrome?.north;
        const spot = north?.spot ?? "historical";
        const arrow = drawnArrow(svg);
        expect(arrow, where).not.toBeNull();
        pages++;
        spots.set(spot, (spots.get(spot) ?? 0) + 1);
        // Clear of both bands, wherever it stands.
        expect(bandHits(scene, inset(arrow!, 0.02)), where).toBe(0);

        const old = historicalArrow(scene, svg, arrow!);
        if (!north) {
          expect(Math.abs(old.x0 - arrow!.x0) + Math.abs(old.y0 - arrow!.y0), where).toBeLessThan(0.02);
          return;
        }
        moved++;
        // The layout's box is the drawn ink.
        expect(Math.abs(north.box.x - arrow!.x0), where).toBeLessThan(0.02);
        expect(Math.abs(north.box.y + north.box.h - arrow!.y1), where).toBeLessThan(0.02);
        // It moved because its old spot was on a band, and onto nothing it was not already on.
        expect(bandHits(scene, old), where).toBeGreaterThan(0);
        const before = allHits(scene, old);
        for (const n of allHits(scene, inset(arrow!, 0.02))) expect(before.has(n), `${where}: node ${n}`).toBe(true);
        for (const c of chromeRects(scene)) {
          if (rectsMeet(c, inset(arrow!, 0.02))) expect(rectsMeet(c, old), `${where}: chrome`).toBe(true);
        }
        // Inside the page, which did not grow for it: the fallback never fires on the corpus.
        const page = viewBox(svg);
        expect(
          arrow!.x0 >= page.x0 && arrow!.y0 >= page.y0 && arrow!.x1 <= page.x1 && arrow!.y1 <= page.y1,
          where,
        ).toBe(true);
        expect(["corner", "right", "top"], where).toContain(north.spot);
      });
    }
    // Every page of the corpus that draws an arrow, later storeys included; some moved and some did not.
    expect(pages).toBeGreaterThanOrEqual(136);
    expect(moved).toBeGreaterThanOrEqual(33);
    expect(spots.get("historical") ?? 0).toBeGreaterThan(90);
    expect(spots.has("grown") || spots.has("blocked")).toBe(false);
  }, 120_000);
});

/** A plan dimensioned on all four sides whose margins leave no strip wide enough for a turned arrow. */
const turned = (settings: string): string => `plan "Turned" {
  units mm
${settings}
  dims auto all
  wall exterior thickness 200 { (0,0) (6000,0) (6000,5000) (0,5000) close }
  wall id=w_div partition thickness 100 { (3500,0) (3500,5000) }
  room id=r_live at (0,0) size 3500x5000 label "Living"
  room id=r_bed at (3500,0) size 2500x5000 label "Bedroom"
  door at (1750,5000) width 1000 wall exterior
  opening at (3500,2500) width 900 wall w_div
  window at (0,2500) width 1500 wall exterior
  window at (5000,0) width 1200 wall exterior
  window at (6000,3800) width 700 wall exterior
}
`;
const sceneOf = (src: string): { svg: string; scene: Scene } => {
  const out = compile(src, { noCache: true });
  expect(out.errors).toEqual([]);
  return { svg: out.svg, scene: out.scene! };
};

describe("when no spot has room", () => {
  it("off a sheet, grows the top and right margins just enough for the corner square, and nothing else", () => {
    const { svg, scene } = sceneOf(turned("  north 45"));
    const control = sceneOf(turned("  north 45 hidden")).scene;
    // Upright, the arrow fits the strip right of the right-hand band; turned 45 degrees it fits no strip.
    expect(sceneOf(turned("  north up")).scene.chrome!.north!.spot).toBe("right");
    expect(scene.chrome!.north!.spot).toBe("grown");
    const arrow = drawnArrow(svg)!;
    expect(bandHits(scene, inset(arrow, 0.02))).toBe(0);
    const m = scene.chrome!.margin;
    const c = control.chrome!.margin;
    expect(m.left).toBe(c.left);
    expect(m.bottom).toBe(c.bottom);
    expect(m.top).toBeGreaterThan(c.top);
    expect(m.right).toBeGreaterThan(c.right);
    // Just enough: the corner square beyond both bands is exactly the arrow's size.
    const reach = dimReach(scene.bounds, scene.nodes);
    const page = viewBox(svg);
    expect(page.x1 - (scene.bounds.maxX + reach.right)).toBeCloseTo(arrow.x1 - arrow.x0, 1);
    expect(scene.bounds.minY - reach.top - page.y0).toBeCloseTo(arrow.y1 - arrow.y0, 1);
    expect(arrow.x0 >= page.x0 && arrow.y0 >= page.y0 && arrow.x1 <= page.x1 && arrow.y1 <= page.y1).toBe(true);
  });

  it("on a sheet, whose page must not grow, keeps the historical spot and every other byte", () => {
    const paper = "  paper A4 landscape\n  scale 1:20\n";
    const { svg, scene } = sceneOf(turned(`${paper}  north 45`));
    const control = sceneOf(turned(`${paper}  north 45 hidden`));
    expect(scene.chrome!.north!.spot).toBe("blocked");
    expect(scene.chrome!.margin).toEqual(control.scene.chrome!.margin);
    expect([scene.width, scene.height]).toEqual([control.scene.width, control.scene.height]);
    const arrowLine = (l: string): boolean => l.startsWith("<g><polygon ") && l.includes('transform="rotate(');
    expect(
      svg
        .split("\n")
        .filter((l) => !arrowLine(l))
        .join("\n"),
    ).toBe(control.svg);
    const arrow = drawnArrow(svg)!;
    const old = historicalArrow(scene, svg, arrow);
    expect(Math.abs(old.x0 - arrow.x0) + Math.abs(old.y0 - arrow.y0)).toBeLessThan(0.02);
  });
});
