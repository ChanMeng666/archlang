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
import { dimReach, northArrowBox, northArrowInk, northArrowMetrics } from "../src/chrome-layout.js";
import { compile, describe as describePlan } from "../src/index.js";
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

/**
 * A plan dimensioned on all four sides: its top and right strips are each only `gap` deep, so an
 * upright arrow fits the right strip only, an arrow pointing right the top strip only, and one
 * turned 45 degrees neither. `extra` adds statements before the closing brace.
 */
const turned = (settings: string, extra = ""): string => `plan "Turned" {
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
${extra}}
`;
const sceneOf = (src: string): { svg: string; scene: Scene } => {
  const out = compile(src, { noCache: true });
  expect(out.errors).toEqual([]);
  return { svg: out.svg, scene: out.scene! };
};
const isArrowLine = (l: string): boolean => l.startsWith("<g><polygon ") && l.includes('transform="rotate(');
const withoutArrow = (svg: string): string =>
  svg
    .split("\n")
    .filter((l) => !isArrowLine(l))
    .join("\n");

describe("each strip is reached in a drawing", () => {
  it("an upright arrow takes the right strip, one pointing right the top strip, each clear of the bands", () => {
    for (const [north, spot] of [
      ["up", "right"],
      ["right", "top"],
    ] as const) {
      const { svg, scene } = sceneOf(turned(`  north ${north}`));
      expect(scene.chrome!.north!.spot, north).toBe(spot);
      expect(bandHits(scene, inset(drawnArrow(svg)!, 0.02)), north).toBe(0);
    }
  });
});

describe("when no spot has room", () => {
  it("off a sheet, grows the top and right margins just enough for the corner square, and nothing else", () => {
    const { svg, scene } = sceneOf(turned("  north 45"));
    const control = sceneOf(turned("  north 45 hidden")).scene;
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

  it("on a sheet, whose page must not grow, keeps the historical spot, records nothing, and moves no other byte", () => {
    // The building fits A4 at 1:50 (`describe().sheet.fits`); the lawn west and south of it does
    // not, so the page grows to the drawing and the strips beyond the bands are only `gap` deep.
    // (A sheet whose whole drawing fits always leaves at least 15 mm of paper in the corner, more
    // than the turned arrow needs, so this fallback needs a drawing larger than its sheet.)
    const paper = "  paper A4 landscape\n  scale 1:50\n";
    const yard = "  outdoor id=yard lawn at (-14000,0) size 14000x14000\n";
    const src = turned(`${paper}  north 45`, yard);
    const hidden = turned(`${paper}  north 45 hidden`, yard);
    const { svg, scene } = sceneOf(src);
    const control = sceneOf(hidden);
    expect(describePlan(src).sheet).toEqual(describePlan(hidden).sheet);
    expect(describePlan(src).sheet?.fits).toBe(true);
    expect(scene.sheet?.grown).toBe(true);
    // Not recorded: the arrow stands where it always stood, so the Scene's chrome is the control's.
    expect(scene.chrome!.north).toBeUndefined();
    expect(scene.chrome).toEqual(control.scene.chrome);
    expect([scene.width, scene.height]).toEqual([control.scene.width, control.scene.height]);
    expect(withoutArrow(svg)).toBe(control.svg);
    const arrow = drawnArrow(svg)!;
    const old = historicalArrow(scene, svg, arrow);
    expect(Math.abs(old.x0 - arrow.x0) + Math.abs(old.y0 - arrow.y0)).toBeLessThan(0.02);
    // And there it is on a band: no rule had room.
    expect(bandHits(scene, inset(arrow, 0.02))).toBeGreaterThan(0);
  });
});

/**
 * The rules one at a time, on a synthetic page: a drawing 5000 x 4000 at `refDim` 10 000, a top
 * band (one dimension line 800 above it, across the historical spot) and a right-hand band (one
 * line 800 right of it). Each row varies the page, or puts one obstacle where the corner square's
 * arrow would go, so the rule it names decides the spot. The upright arrow's ink is 450 x 1058;
 * `gap` is 500.
 */
describe("northArrowBox, rule by rule", () => {
  const refDim = 10000;
  const bounds = { minX: 0, minY: 0, maxX: 5000, maxY: 4000 };
  const line = (a: [number, number], b: [number, number]): SceneNode => ({
    layer: "dims",
    prim: { t: "line", a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } },
    paint: {},
  });
  const BANDS = [line([0, -800], [5000, -800]), line([5800, 0], [5800, 4000])];
  const LEFT = 5800; // the right-hand band's outer edge
  const ABOVE = -800; // the top band's outer edge
  const { r, fs } = northArrowMetrics(refDim);
  const ink = northArrowInk(0, 0, r, fs, 0, "N");
  const NO_CHROME = {
    scaleBar: { x0: 0, y0: 6000, barLen: 1000, hgt: 50, fs: 100, hidden: true as const },
    titleBlock: null,
  };
  /** A page whose right edge is `right` past the band and whose top is `top` above it. */
  const place = (
    right: number,
    top: number,
    opts: {
      nodes?: SceneNode[];
      chrome?: Parameters<typeof northArrowBox>[0]["chrome"];
      h?: number;
      sheet?: boolean;
    } = {},
  ) =>
    northArrowBox({
      bounds,
      refDim,
      baseMargin: 1700,
      nodes: [...BANDS, ...(opts.nodes ?? [])],
      deg: 0,
      word: "N",
      page: { x: -2000, y: ABOVE - top, w: LEFT + right + 2000, h: opts.h ?? 12000 },
      margin: { top: 800 + top, right: 800 + right, bottom: 1700, left: 2000 },
      sheet: opts.sheet ?? false,
      chrome: opts.chrome ?? NO_CHROME,
    });
  // An obstacle over the corner square's arrow (which sits at x 6300..6750, y -2358..-1300).
  const CORNER_BLOCK = { x: 6200, y: -2500, w: 700, h: 1300 };

  it("the premise: the historical spot is on the top band, and the corner square takes the arrow when it has room", () => {
    expect(ink.w).toBe(450);
    expect(ink.h).toBeCloseTo(1058, 6);
    const { north } = place(5000, 6000);
    expect(north.spot).toBe("corner");
    expect(north.box.x).toBe(LEFT + 500);
    expect(north.box.y + north.box.h).toBeCloseTo(ABOVE - 500, 6);
  });

  it("an arrow fitting only the strip above the top band takes it (rule 4)", () => {
    // 300 right of the band: narrower than the arrow, so no corner and no right strip.
    expect(place(300, 3000).north.spot).toBe("top");
  });

  it("a node in the corner sends the arrow to the right strip, which comes before the top strip (rules 2-4)", () => {
    const node: SceneNode = {
      layer: "labels",
      prim: {
        t: "polygon",
        pts: [
          { x: CORNER_BLOCK.x, y: CORNER_BLOCK.y },
          { x: CORNER_BLOCK.x + CORNER_BLOCK.w, y: CORNER_BLOCK.y },
          { x: CORNER_BLOCK.x + CORNER_BLOCK.w, y: CORNER_BLOCK.y + CORNER_BLOCK.h },
          { x: CORNER_BLOCK.x, y: CORNER_BLOCK.y + CORNER_BLOCK.h },
        ],
      },
      paint: {},
    };
    // Both strips have room and both are clear of the node, so the order decides.
    expect(place(5000, 6000, { nodes: [node] }).north.spot).toBe("right");
  });

  it("the title block or the scale bar in the corner sends the arrow on, as a node does", () => {
    const titleBlock = {
      x0: CORNER_BLOCK.x,
      y0: CORNER_BLOCK.y,
      w: CORNER_BLOCK.w,
      h: CORNER_BLOCK.h,
      rowH: 100,
      fs: 50,
      pad: 10,
      rows: [],
    };
    expect(place(5000, 6000, { chrome: { ...NO_CHROME, titleBlock } }).north.spot).toBe("right");
    const scaleBar = { x0: 6400, y0: -2000, barLen: 200, hgt: 50, fs: 100 };
    expect(place(5000, 6000, { chrome: { scaleBar, titleBlock: null } }).north.spot).toBe("right");
  });

  it("a spot that would leave the page is refused (the page check)", () => {
    // Room right of the band, none above it, and a page whose bottom the right strip's arrow would
    // cross. `toScene` never hands over such a page (it always holds the drawing); the rule is
    // `northArrowBox`'s own contract.
    const short = { h: 1000 };
    expect(place(2000, 500, { ...short, sheet: true }).north.spot).toBe("blocked");
    const grown = place(2000, 500, short);
    expect(grown.north.spot).toBe("grown");
    expect(grown.margin.top).toBeCloseTo(800 + ink.h, 6);
    expect(grown.margin.right).toBe(800 + 2000);
  });
});
