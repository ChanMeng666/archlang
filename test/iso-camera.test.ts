/**
 * **No trigonometry under `src/view/`** — the one structural guard the axonometric layer
 * has, and the reason its constants are square roots.
 *
 * `Math.sin`, `Math.cos`, `Math.tan` and the `atan` family are **implementation-approximated**
 * in ECMAScript: the specification requires only that the result be close, so two engines,
 * or two versions of one, may differ in the last bits. This repository's CI spans Windows
 * and Linux across Node 18/20/22 and its whole verification system rests on byte-identical
 * output, so a projection built on `Math.cos` would put a determinism hazard under every
 * face the view draws — and one that would surface as a one-legged snapshot failure with no
 * obvious cause.
 *
 * `Math.sqrt` carries no such licence: IEEE-754 requires it to be **exactly rounded**, as
 * are `+`, `-`, `*` and `/`. So both cameras are expressible without trigonometry, and this
 * grep is what keeps them that way. It is a lexical test on purpose — a semantic one would
 * have to know which helper is safe, and the point is that none is.
 *
 * The camera's own algebra is checked below too, because a grep proves absence and not
 * correctness: the isometric's three axes must foreshorten equally, its vertical must stay
 * vertical, and both cameras must place the viewer at the same corner.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import { VIEW_NAMES, cameraFor } from "../src/view/camera.js";

const VIEW_DIR = resolvePath("src/view");

/** Every `.ts` file under `src/view/`, recursively. */
function viewSources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...viewSources(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** The forbidden calls. `atan2` is caught by the `atan` stem. */
const TRIG = /\bMath\.(cos|sin|tan|atan2?|acos|asin)\s*\(/g;

suite("iso camera — no trigonometry, and the algebra the constants encode", () => {
  const files = viewSources(VIEW_DIR);

  it("finds the view modules at all (a grep over nothing passes vacuously)", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const f of files) {
    it(`${f.slice(f.indexOf("src"))} calls no trigonometric function`, () => {
      const hits = [...readFileSync(f, "utf8").matchAll(TRIG)].map((m) => m[0]);
      expect(hits).toEqual([]);
    });
  }

  it("catches a planted call — the pattern is not inert", () => {
    const planted = "const k = Math.cos(Math.PI / 4);";
    expect([...planted.matchAll(TRIG)].map((m) => m[0])).toEqual(["Math.cos("]);
  });

  it("iso is a TRUE isometric: the three axes project to equal length", () => {
    const cam = cameraFor("iso");
    const o = cam.project(0, 0, 0);
    const len2 = (p: { x: number; y: number }): number => (p.x - o.x) ** 2 + (p.y - o.y) ** 2;
    // Each unit axis projects to √(2/3) — the defining property of an isometric, and the
    // reason `atan(1/√2)` is the only pitch that gives one.
    const wanted = 2 / 3;
    expect(len2(cam.project(1, 0, 0))).toBeCloseTo(wanted, 12);
    expect(len2(cam.project(0, 1, 0))).toBeCloseTo(wanted, 12);
    expect(len2(cam.project(0, 0, 1))).toBeCloseTo(wanted, 12);
  });

  it("iso draws the vertical axis VERTICALLY, and upward", () => {
    const cam = cameraFor("iso");
    const a = cam.project(1000, 2000, 0);
    const b = cam.project(1000, 2000, 3000);
    expect(b.x).toBeCloseTo(a.x, 9); // no horizontal component
    expect(b.y).toBeLessThan(a.y); // and SVG y runs down, so higher z is a smaller y
  });

  it("axon keeps the plan at TRUE size and true angle — that is what a plan oblique is", () => {
    const cam = cameraFor("axon");
    const o = cam.project(0, 0, 0);
    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - o.x, p.y - o.y);
    expect(dist(cam.project(4000, 0, 0))).toBeCloseTo(4000, 6);
    expect(dist(cam.project(0, 3000, 0))).toBeCloseTo(3000, 6);
    // A right angle in plan stays a right angle on the page.
    const ex = cam.project(1, 0, 0);
    const ey = cam.project(0, 1, 0);
    expect((ex.x - o.x) * (ey.x - o.x) + (ex.y - o.y) * (ey.y - o.y)).toBeCloseTo(0, 12);
    // Heights are true size too, and straight up.
    const up = cam.project(0, 0, 1000);
    expect(up.x).toBeCloseTo(o.x, 9);
    expect(o.y - up.y).toBeCloseTo(1000, 6);
  });

  for (const name of VIEW_NAMES) {
    it(`${name} puts the viewer at the plan's SOUTH-WEST, above`, () => {
      const cam = cameraFor(name);
      // Depth grows AWAY from the viewer. South (larger plan y) and west (smaller x) and
      // up (larger z) must all come nearer, or the two presets disagree about where the
      // reader is standing — which would make switching preset a different building.
      const here = cam.depth(1000, 1000, 1000);
      expect(cam.depth(1000, 2000, 1000)).toBeLessThan(here); // further south = nearer
      expect(cam.depth(2000, 1000, 1000)).toBeGreaterThan(here); // further east = farther
      expect(cam.depth(1000, 1000, 2000)).toBeLessThan(here); // higher = nearer
    });
  }
});
