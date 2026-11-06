/**
 * The free camera's maths (card CR4, decision CR-D2), without a browser: the presets the viewer
 * offers beside the replay's own camera (`presetCamera`), the orbit's limits (`ELEVATION_RANGE`,
 * `distanceLimits`, `targetBounds`), and that `iso` is the end camera to the bit, which is what lets
 * the playground's Iso and Reset buttons return the end frame's exact `__frameHash`
 * (`playground/e2e/preview3d.spec.ts`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  adaptPlan,
  boxOfNodes,
  buildMesh,
  cameraStops,
  corners,
  coverage,
  distanceLimits,
  drawingFrame,
  ELEVATION_RANGE,
  END_AZIMUTH,
  END_FOV,
  frameCamera,
  type FrameCamera,
  pivotAbove,
  PRESET_NAMES,
  presetCamera,
  projectBox,
  stateAt,
  storeysOf,
  takenLens,
  targetBounds,
  type Vec3,
  type ViewScene,
  viewMesh,
  ZOOM,
} from "../src/index.js";
import { cameraPosition } from "../src/replay/camera.js";
import { replayPayload } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASPECT = 16 / 9;

/** Every corpus plan the mesh stage builds, every view, as the viewer mounts it. */
function scenes(): Array<{ name: string; v: ViewScene }> {
  const out: Array<{ name: string; v: ViewScene }> = [];
  for (const [name, src] of EXAMPLES_LIST) {
    const r = adaptPlan(src, { world: WORLD });
    if (!r.ok) continue;
    const mesh = buildMesh(r.scene);
    const svg = compile(src, { world: WORLD }).svg;
    for (const view of ["all" as const, ...storeysOf(mesh).map((_, i) => i + 1)]) {
      const p = replayPayload(viewMesh(mesh, view), { title: name, svg });
      const orbit = { elevation: p.elevation, azimuth: END_AZIMUTH, fov: END_FOV, aspect: ASPECT };
      const { cx, cz, oh } = drawingFrame(p.viewBox, ASPECT);
      out.push({
        name: `${name} ${view}`,
        v: {
          events: p.events,
          fits: cameraStops(p.nodes, p.events, orbit),
          frame: { cx, cz, oh, elevation: p.elevation },
          // As the viewer mounts it: the building as the end frame shows it, storeys settled (card X2).
          box: boxOfNodes(p.nodes, { settle: 1 }),
          aspect: ASPECT,
        },
      });
    }
  }
  return out;
}

const ALL = scenes();
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const positionOf = (f: FrameCamera): Vec3 => cameraPosition(f.target, f.dist, f);

/** A three.js camera placed as the viewer places a preset (`mount.ts`'s `place`). */
function threeCamera(f: FrameCamera): PerspectiveCamera {
  const cam = new PerspectiveCamera(f.fov, ASPECT, 10, 1e9);
  cam.up.set(0, 0, -1);
  if (f.elevation < 89.99) cam.up.set(0, 1, 0);
  cam.position.set(...positionOf(f));
  cam.lookAt(new Vector3(...f.target));
  cam.updateMatrixWorld();
  return cam;
}

describe("free camera presets (card CR4)", () => {
  it("covers the corpus", () => {
    expect(ALL.length).toBeGreaterThan(34);
  });

  it("iso is the replay's end camera, number for number", () => {
    for (const { name, v } of ALL) {
      const end = frameCamera(stateAt(v.events, 1), v.fits, v.frame);
      expect(presetCamera("iso", v), name).toEqual(end);
      // And bit for bit: the same doubles, so the viewer draws the very end frame.
      const a = presetCamera("iso", v);
      expect(Object.is(a.dist, end.dist) && a.target.every((x, i) => Object.is(x, end.target[i])), name).toBe(true);
    }
  });

  it("is a pure function of the scene", () => {
    const { v } = ALL[0] as { v: ViewScene };
    for (const n of PRESET_NAMES) expect(presetCamera(n, v)).toEqual(presetCamera(n, v));
  });

  it("every preset frames the standing building unclipped and fills >= 80 % of the binding axis", () => {
    for (const { name, v } of ALL)
      for (const n of PRESET_NAMES) {
        const f = presetCamera(n, v);
        const o = { elevation: f.elevation, azimuth: f.azimuth, fov: f.fov, aspect: ASPECT };
        const pr = projectBox(v.box, f, o);
        for (const x of [...pr.x, ...pr.y]) expect(Math.abs(x), `${name} ${n}`).toBeLessThanOrEqual(0.95);
        expect(coverage(v.box, f, o), `${name} ${n}`).toBeGreaterThanOrEqual(0.8);
      }
  });

  it("every preset stays within the orbit's limits: elevation range, distance, the target's sphere, above the ground", () => {
    for (const { name, v } of ALL) {
      const lim = distanceLimits(v.fits, END_FOV);
      const sphere = targetBounds(v.box);
      for (const n of PRESET_NAMES) {
        const f = presetCamera(n, v);
        expect(f.elevation, `${name} ${n}`).toBeGreaterThanOrEqual(ELEVATION_RANGE.min);
        expect(f.elevation, `${name} ${n}`).toBeLessThanOrEqual(ELEVATION_RANGE.max);
        expect(f.dist, `${name} ${n}`).toBeGreaterThanOrEqual(lim.min);
        expect(f.dist, `${name} ${n}`).toBeLessThanOrEqual(lim.max);
        expect(Math.hypot(...sub(f.target, sphere.centre)), `${name} ${n}`).toBeLessThanOrEqual(sphere.radius);
        // The camera is never below the building's lowest point, nor the pivot the orbit takes it
        // about (a fitted target can sink under the slab: aquarium's end camera's does).
        const eye = positionOf(f);
        expect(eye[1], `${name} ${n}`).toBeGreaterThanOrEqual(v.box.lo[1]);
        expect(pivotAbove(eye, f.target, v.box.lo[1])[1], `${name} ${n}`).toBeGreaterThanOrEqual(v.box.lo[1]);
      }
    }
  });

  it("the orbit's pivot lies on the camera's line of sight: taking the camera never moves the view", () => {
    let moved = 0;
    for (const { name, v } of ALL)
      for (const n of PRESET_NAMES) {
        const f = presetCamera(n, v);
        const eye = positionOf(f);
        const pivot = pivotAbove(eye, f.target, v.box.lo[1]);
        if (pivot === f.target) continue;
        moved++;
        const a = sub(f.target, eye);
        const b = sub(pivot, eye);
        const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        expect(Math.hypot(...cross) / (Math.hypot(...a) * Math.hypot(...b)), `${name} ${n}`).toBeLessThan(1e-9);
        // In front of the camera, between it and the sunken target.
        expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], `${name} ${n}`).toBeGreaterThan(0);
        expect(pivot[1], `${name} ${n}`).toBe(v.box.lo[1]);
      }
    // The case is real in the corpus, so this test reads something.
    expect(moved).toBeGreaterThan(0);
  });

  it("each elevation looks level from its side of the plan (plan axes: north is the plan's top edge)", () => {
    for (const { name, v } of ALL) {
      const side = (n: "north" | "east" | "south" | "west") => {
        const f = presetCamera(n, v);
        const d = sub(positionOf(f), f.target);
        expect(Math.abs(d[1]), `${name} ${n}: level`).toBeLessThan(1e-6 * f.dist);
        return d;
      };
      const [north, east, south, west] = [side("north"), side("east"), side("south"), side("west")];
      // The exporters' axes: X is plan x (east), Z is plan y (down the page, south).
      expect(north[2] < 0 && Math.abs(north[0]) < 1e-6 * Math.abs(north[2]), name).toBe(true);
      expect(south[2] > 0 && Math.abs(south[0]) < 1e-6 * south[2], name).toBe(true);
      expect(east[0] > 0 && Math.abs(east[2]) < 1e-6 * east[0], name).toBe(true);
      expect(west[0] < 0 && Math.abs(west[2]) < 1e-6 * Math.abs(west[0]), name).toBe(true);
    }
  });

  it("through three.js: top has the plan's top edge up, and each elevation has the compass the right way round", () => {
    const { v } = ALL.find((s) => s.name.startsWith("townhouse.arch all")) ?? (ALL[0] as { v: ViewScene });
    const c = targetBounds(v.box).centre;
    const at = (f: FrameCamera, p: Vec3) => new Vector3(...p).project(threeCamera(f));
    const step = 1000;
    const top = presetCamera("top", v);
    // Plan north (−Z) is up the screen, plan east (+X) to the right.
    expect(at(top, [c[0], c[1], c[2] - step]).y).toBeGreaterThan(at(top, [c[0], c[1], c[2] + step]).y);
    expect(at(top, [c[0] + step, c[1], c[2]]).x).toBeGreaterThan(at(top, [c[0] - step, c[1], c[2]]).x);
    // Facing the building from the south, east is on the right; from the north, west is.
    const south = presetCamera("south", v);
    expect(at(south, [c[0] + step, c[1], c[2]]).x).toBeGreaterThan(at(south, [c[0] - step, c[1], c[2]]).x);
    const north = presetCamera("north", v);
    expect(at(north, [c[0] - step, c[1], c[2]]).x).toBeGreaterThan(at(north, [c[0] + step, c[1], c[2]]).x);
    const east = presetCamera("east", v);
    expect(at(east, [c[0], c[1], c[2] - step]).x).toBeGreaterThan(at(east, [c[0], c[1], c[2] + step]).x);
    // And every preset's box corners project inside the frame for three.js too.
    for (const n of PRESET_NAMES)
      for (const p of corners(v.box)) {
        const q = at(presetCamera(n, v), p);
        expect(Math.abs(q.x), n).toBeLessThanOrEqual(0.95);
        expect(Math.abs(q.y), n).toBeLessThanOrEqual(0.95);
      }
  });
});

describe("taking the camera from the replay (card CR4, red-team round 1)", () => {
  const height = (f: FrameCamera) => 2 * f.dist * Math.tan((f.fov * Math.PI) / 360);

  it("keeps the frame's aim and its framing at the target, through the end lens", () => {
    for (const { name, v } of ALL)
      for (const t of [0, 0.2, 0.45, 0.6, 0.7, 0.9]) {
        const f = frameCamera(stateAt(v.events, t), v.fits, v.frame);
        const taken = takenLens(f);
        expect(taken.fov, `${name} ${t}`).toBe(END_FOV);
        expect(taken.target, `${name} ${t}`).toEqual(f.target);
        expect([taken.elevation, taken.azimuth], `${name} ${t}`).toEqual([f.elevation, f.azimuth]);
        expect(height(taken) / height(f), `${name} ${t}`).toBeCloseTo(1, 9);
      }
  });

  it("a top-down frame becomes a top view at the end lens, not the 1.5° near-orthographic one", () => {
    const { v } = ALL[0] as { v: ViewScene };
    const f = frameCamera(stateAt(v.events, 0), v.fits, v.frame);
    expect(f.fov).toBeLessThan(2);
    expect(f.elevation).toBe(90);
    expect(takenLens(f).fov).toBe(END_FOV);
    expect(takenLens(f).elevation).toBe(90);
  });

  it("a frame already at the end lens is taken as it is (the end frame, so a take at the end moves nothing)", () => {
    for (const { name, v } of ALL) {
      const end = frameCamera(stateAt(v.events, 1), v.fits, v.frame);
      expect(takenLens(end), name).toBe(end);
    }
  });
});

describe("free camera limits (card CR4)", () => {
  it("distance limits are ZOOM's multiples of the whole building's fitted distance, the same framings for any lens", () => {
    for (const { name, v } of ALL) {
      const whole = (v.fits[v.fits.length - 1] as { dist: number }).dist;
      const end = distanceLimits(v.fits, END_FOV);
      expect(end.min, name).toBeCloseTo(whole / ZOOM.in, 6);
      expect(end.max, name).toBeCloseTo(whole * ZOOM.out, 6);
      // A narrower lens (a camera taken mid-dolly): the same view heights at the target.
      const height = (d: number, fov: number) => 2 * d * Math.tan((fov * Math.PI) / 360);
      const narrow = distanceLimits(v.fits, 5);
      expect(height(narrow.min, 5) / height(end.min, END_FOV), name).toBeCloseTo(1, 9);
      expect(height(narrow.max, 5) / height(end.max, END_FOV), name).toBeCloseTo(1, 9);
    }
  });

  it("the target's sphere holds the whole box", () => {
    for (const { name, v } of ALL) {
      const s = targetBounds(v.box);
      for (const p of corners(v.box))
        expect(Math.hypot(...sub(p, s.centre)), name).toBeLessThanOrEqual(s.radius * (1 + 1e-12));
    }
  });

  it("the elevation range is the horizon to straight down", () => {
    expect(ELEVATION_RANGE).toEqual({ min: 0, max: 90 });
  });
});

describe("the free camera's browser code", () => {
  it("reads no clock and no random source (the damping counts animation frames, never time)", () => {
    for (const file of ["mount.ts", "view-dom.ts", "camera.ts"]) {
      const code = readFileSync(join(HERE, "../src/replay", file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now/);
    }
  });

  it("uses three.js's own OrbitControls from the pinned package, never a CDN or another library", () => {
    const code = readFileSync(join(HERE, "../src/replay/mount.ts"), "utf8");
    expect(code).toContain('from "three/examples/jsm/controls/OrbitControls.js"');
    expect(code).not.toMatch(/https?:\/\//);
  });
});
