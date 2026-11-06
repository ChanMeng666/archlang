/**
 * The replay's end camera as plain maths (card A3, look notes round 1): the viewer and the tests
 * read the same functions, so "the end frame fills the canvas" is a property a test can check
 * without a browser. Millimetres, the exporters' axes (X plan x, Y up, Z plan y). No three.js here:
 * the conventions copy three.js's `lookAt` for a camera (it looks down its local −Z; right =
 * up × back, true up = back × right, world up +Y).
 */

import { type ReplayEvent, type ReplayState, stateAt } from "./timeline.js";

export type Vec3 = [number, number, number];

export interface Box {
  lo: Vec3;
  hi: Vec3;
}

/** Where the end camera looks from: elevation and azimuth in degrees, vertical field of view. */
export interface Orbit {
  elevation: number;
  azimuth: number;
  fov: number;
  /** Canvas width / height. */
  aspect: number;
}

export interface EndCamera {
  target: Vec3;
  /** Distance from the target to the camera (mm). */
  dist: number;
}

/**
 * The fraction of each half-axis the building may use: a margin of 6 % of the frame on each side
 * of the binding axis.
 */
export const FILL = 0.88;

const rad = (d: number): number => (d * Math.PI) / 180;

/** The unit vector from the target to the camera. */
export function backOf(o: Pick<Orbit, "elevation" | "azimuth">): Vec3 {
  const el = rad(o.elevation);
  const az = rad(o.azimuth);
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
}

/** The camera position for a target, a distance and an orbit (the viewer's own formula). */
export function cameraPosition(target: Vec3, dist: number, o: Pick<Orbit, "elevation" | "azimuth">): Vec3 {
  const b = backOf(o);
  return [target[0] + dist * b[0], target[1] + dist * b[1], target[2] + dist * b[2]];
}

/** The camera's right and up axes (three.js `lookAt` with world up +Y; elevation < 90°). */
function axes(back: Vec3): { right: Vec3; up: Vec3 } {
  // right = (0,1,0) × back, normalised.
  const rx = back[2];
  const rz = -back[0];
  const rl = Math.hypot(rx, rz);
  const right: Vec3 = [rx / rl, 0, rz / rl];
  // up = back × right.
  const up: Vec3 = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ];
  return { right, up };
}

export function corners(b: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.lo[0], b.hi[0]])
    for (const y of [b.lo[1], b.hi[1]]) for (const z of [b.lo[2], b.hi[2]]) out.push([x, y, z]);
  return out;
}

/**
 * The projected extent of `box` in normalised device coordinates (−1…1 on each axis) for a camera
 * at `cam` with orbit `o`.
 */
export function projectBox(box: Box, cam: EndCamera, o: Orbit): { x: [number, number]; y: [number, number] } {
  const back = backOf(o);
  const { right, up } = axes(back);
  const t = Math.tan(rad(o.fov) / 2);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of corners(box)) {
    const r: Vec3 = [p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2]];
    const depth = cam.dist - (r[0] * back[0] + r[1] * back[1] + r[2] * back[2]);
    const x = (r[0] * right[0] + r[2] * right[2]) / (depth * t * o.aspect);
    const y = (r[0] * up[0] + r[1] * up[1] + r[2] * up[2]) / (depth * t);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x: [x0, x1], y: [y0, y1] };
}

/**
 * The end camera that fills the frame with `box`: the 8 corners are projected through the end
 * orbit and the distance is solved so the binding corner sits at `FILL` of the half-frame; the
 * target is then re-centred on the projected box (perspective makes the near half larger) and the
 * distance solved again. A fixed number of rounds, so the result is a pure function of its input.
 */
export function fitEndCamera(box: Box, o: Orbit): EndCamera {
  const back = backOf(o);
  const { right, up } = axes(back);
  const t = Math.tan(rad(o.fov) / 2);
  let target: Vec3 = [(box.lo[0] + box.hi[0]) / 2, (box.lo[1] + box.hi[1]) / 2, (box.lo[2] + box.hi[2]) / 2];
  let dist = 1000;
  for (let round = 0; round < 4; round++) {
    // For each corner: |x| / ((dist − b) · t · aspect) ≤ FILL  ⇔  dist ≥ b + |x| / (FILL · t · aspect).
    dist = 0;
    for (const p of corners(box)) {
      const r: Vec3 = [p[0] - target[0], p[1] - target[1], p[2] - target[2]];
      const b = r[0] * back[0] + r[1] * back[1] + r[2] * back[2];
      const x = Math.abs(r[0] * right[0] + r[2] * right[2]);
      const y = Math.abs(r[0] * up[0] + r[1] * up[1] + r[2] * up[2]);
      dist = Math.max(dist, b + x / (FILL * t * o.aspect), b + y / (FILL * t));
    }
    if (round === 3) break;
    // Re-centre: move the target across the view by the projected box's off-centre amount, read at
    // the target's own depth.
    const p = projectBox(box, { target, dist }, o);
    const dx = ((p.x[0] + p.x[1]) / 2) * dist * t * o.aspect;
    const dy = ((p.y[0] + p.y[1]) / 2) * dist * t;
    target = [
      target[0] + dx * right[0] + dy * up[0],
      target[1] + dx * right[1] + dy * up[1],
      target[2] + dx * right[2] + dy * up[2],
    ];
  }
  return { target, dist };
}

/** The share of the binding axis the projected box fills (1 = edge to edge). */
export function coverage(box: Box, cam: EndCamera, o: Orbit): number {
  const p = projectBox(box, cam, o);
  return Math.max((p.x[1] - p.x[0]) / 2, (p.y[1] - p.y[0]) / 2);
}

/** The end camera's lens and bearing. */
export const END_FOV = 30;
export const END_AZIMUTH = -32;

/**
 * The end camera's elevation: 45° for every view. The combined view of a taller building needs it so
 * the exploded gaps show the floors below (see `timeline.ts`'s header); a one-storey view took it
 * too (card A9, by delegation, the owner may veto on a look): at 30° the near walls hid the floor,
 * the inner doors and most furniture of `studio`. The storey count stays a parameter so a later
 * look can split the two again without a signature change.
 */
export const endElevation = (_storeys: number): number => 45;

/**
 * The scene's box (mm) from the payload's nodes: positions in micrometres, each node lifted by its
 * `lift` (the combined view's exploded storeys). A demolished wall's ghost (`part` "demolish") is not
 * the building and is left out of a fit (`timeline.ts`'s header), unless nothing else is there;
 * `ghosts: true` keeps it, for a box that must hold everything drawn (the viewer's clip range).
 * `settle` (`ReplayState.settle`) lowers each lift to `settledLift(lift, settle)`: 1 is the
 * assembled building, every storey at the height it stands at (the end frame's).
 */
export function boxOfNodes(
  nodes: ReadonlyArray<{ positions: readonly number[]; lift?: number; part?: string }>,
  opts: { ghosts?: boolean; settle?: number } = {},
): Box {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const standing = opts.ghosts ? nodes : nodes.filter((n) => n.part !== "demolish");
  for (const n of standing.length > 0 ? standing : nodes) {
    const lift = opts.settle === undefined ? (n.lift ?? 0) : settledLift(n.lift, opts.settle);
    for (let i = 0; i < n.positions.length; i += 3) {
      const p: Vec3 = [
        (n.positions[i] as number) / 1000,
        (n.positions[i + 1] as number) / 1000 + lift,
        (n.positions[i + 2] as number) / 1000,
      ];
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k] as number, p[k] as number);
        hi[k] = Math.max(hi[k] as number, p[k] as number);
      }
    }
  }
  return { lo, hi };
}

/**
 * A node's lift (mm) at settle `settle` (`ReplayState.settle`): the whole lift while the storeys are
 * exploded, none once they have settled. The viewer draws a node at this lift.
 */
export const settledLift = (lift: number | undefined, settle: number): number => (lift ?? 0) * (1 - settle);

/** How many camera stops the rise has: one per storey of the event table (one storey: one). */
export const stopCount = (events: readonly ReplayEvent[]): number =>
  Math.max(1, ...events.map((e) => (e.storey ?? 0) + 1));

/** The perspective camera's lens at the start of the dolly (a near-orthographic top-down view). */
export const START_FOV = 1.5;

/**
 * One fitted camera per stop: stop k fills the frame with storeys 0…k (the combined view; a node's
 * storey is its event's), the last stop with the whole building, exploded. One storey: one stop.
 * Several storeys add one fit after the stops: the assembled building (every lift settled), the
 * camera the settle ends on (`stateAt`'s `settle`), so the last fit is always the whole building as
 * the end frame shows it. Each is fitted for the end orbit, which `stateAt` has reached by the time
 * of the first stop.
 */
export function cameraStops(
  nodes: ReadonlyArray<{ key: string; positions: readonly number[]; lift?: number; part?: string }>,
  events: readonly ReplayEvent[],
  o: Orbit,
): EndCamera[] {
  const storeyOf = new Map(events.map((e) => [e.key, e.storey ?? 0] as const));
  const stops = stopCount(events);
  const fits: EndCamera[] = [];
  for (let k = 0; k < stops; k++)
    fits.push(fitEndCamera(boxOfNodes(nodes.filter((n) => (storeyOf.get(n.key) ?? 0) <= k)), o));
  if (stops > 1) fits.push(fitEndCamera(boxOfNodes(nodes, { settle: 1 }), o));
  return fits;
}

/** The fitted camera at a (fractional) stop: between two stops, a straight blend of the two. */
export function cameraAtStop(fits: readonly EndCamera[], stop: number): EndCamera {
  const k = Math.min(fits.length - 1, Math.floor(stop));
  const a = fits[k] as EndCamera;
  const b = fits[Math.min(fits.length - 1, k + 1)] as EndCamera;
  const f = stop - k;
  if (f <= 0 || a === b) return a;
  return {
    target: [0, 1, 2].map((i) => (a.target[i] as number) * (1 - f) + (b.target[i] as number) * f) as Vec3,
    dist: a.dist * (1 - f) + b.dist * f,
  };
}

/** The perspective camera of one frame: where it aims, from how far, with which lens and bearing. */
export interface FrameCamera {
  target: Vec3;
  dist: number;
  fov: number;
  elevation: number;
  azimuth: number;
}

/**
 * The perspective camera at state `s` (the viewer's `seek`): from straight down over the drawing's
 * centre (`cx`, `cz`; `oh` the drawing's height in the frame) it tilts to the end orbit and dollies
 * to the fitted camera of the current stop.
 */
export function frameCamera(
  s: Pick<ReplayState, "tilt" | "dolly" | "stop">,
  fits: readonly EndCamera[],
  view: { cx: number; cz: number; oh: number; elevation: number },
): FrameCamera {
  const rad1 = (d: number) => (d * Math.PI) / 180;
  const end = cameraAtStop(fits, s.stop);
  const endHeight = 2 * end.dist * Math.tan(rad1(END_FOV) / 2);
  const fov = START_FOV + (END_FOV - START_FOV) * s.dolly;
  const height = view.oh + (endHeight - view.oh) * s.dolly;
  const dist = height / (2 * Math.tan(rad1(fov) / 2));
  const target: Vec3 = [
    view.cx + (end.target[0] - view.cx) * s.dolly,
    end.target[1] * s.tilt,
    view.cz + (end.target[2] - view.cz) * s.dolly,
  ];
  return {
    target,
    dist,
    fov,
    elevation: 90 - (90 - view.elevation) * s.tilt,
    azimuth: END_AZIMUTH * s.tilt,
  };
}

/**
 * The first frame frames the core drawing's viewBox exactly, letterboxed as the image is: its
 * centre (`cx`, `cz`) and the height (`oh`) and width (`ow`) it spans in the frame, in plan mm.
 */
export function drawingFrame(
  viewBox: readonly [number, number, number, number],
  aspect: number,
): { cx: number; cz: number; ow: number; oh: number } {
  const [vx, vy, vw, vh] = viewBox;
  const ow = Math.max(vw, vh * aspect);
  return { cx: vx + vw / 2, cz: vy + vh / 2, ow, oh: ow / aspect };
}

/**
 * The free camera (card CR4, decision CR-D2): the views a viewer offers beside the replay's own
 * camera, as plain maths like the end camera's, so a test reads them without a browser. Each preset
 * is a pure function of the scene (`ViewScene`); the viewer draws it through the same placement as
 * the replay's frames (`cameraPosition`, then three.js's `lookAt`).
 */
export type PresetName = "iso" | "top" | "north" | "east" | "south" | "west";
export const PRESET_NAMES: readonly PresetName[] = ["iso", "top", "north", "east", "south", "west"];

/** What a preset reads: the replay's event table and fitted stops, the drawing's frame, the box. */
export interface ViewScene {
  events: readonly ReplayEvent[];
  fits: readonly EndCamera[];
  /** The first frame's framing (`drawingFrame`) and the end elevation, as `frameCamera` takes them. */
  frame: { cx: number; cz: number; oh: number; elevation: number };
  /**
   * The standing building as the end frame shows it (`boxOfNodes`, ghosts left out, `settle: 1`):
   * the box the last fit is fitted to (`cameraStops`).
   */
  box: Box;
  /** Canvas width / height. */
  aspect: number;
}

/**
 * The bearing each elevation looks from, relative to the plan's axes (not its `north`): north is the
 * plan's top edge (plan −y, the exporters' −Z), east its right edge (+X). `backOf` puts the camera at
 * (sin az, ·, cos az) from the target, so azimuth 0 stands south of the plan.
 */
export const ELEVATION_AZIMUTH = { north: 180, east: 90, south: 0, west: -90 } as const;

/**
 * The free camera's elevation range, degrees: from the horizon through its target (an elevation
 * view) to straight down (the top view). The orbit's pivot is never below the building's lowest
 * point (`pivotAbove`) and never drops (panning keeps to its horizontal plane), so the camera never
 * goes below the building.
 */
export const ELEVATION_RANGE = { min: 0, max: 90 } as const;

/**
 * The point the orbit turns about when it takes a camera at `position` aimed at `target`: the target
 * itself, or, where the target lies below `minY` (a fitted target is re-centred across the view and
 * can sink under the slab: the end camera of a deep plan does), the point of the same line of sight
 * at height `minY`. The view does not move (the aim is the same ray), only the pivot.
 */
export function pivotAbove(position: Vec3, target: Vec3, minY: number): Vec3 {
  if (target[1] >= minY || position[1] <= minY) return target;
  const s = (position[1] - minY) / (position[1] - target[1]);
  return [position[0] + (target[0] - position[0]) * s, minY, position[2] + (target[2] - position[2]) * s];
}

/**
 * A preset camera. `iso` IS the replay's end camera (`frameCamera` at t = 1, the very numbers the
 * end frame is drawn from), so returning to it draws the end frame byte for byte; the other presets
 * are fitted to the standing building like the stops (`fitEndCamera`, the end lens): `top` from
 * straight down with the plan's top edge up, each elevation level with the target.
 */
export function presetCamera(name: PresetName, v: ViewScene): FrameCamera {
  if (name === "iso") return frameCamera(stateAt(v.events, 1), v.fits, v.frame);
  const bearing =
    name === "top"
      ? { elevation: ELEVATION_RANGE.max, azimuth: ELEVATION_AZIMUTH.south }
      : { elevation: ELEVATION_RANGE.min, azimuth: ELEVATION_AZIMUTH[name] };
  const fit = fitEndCamera(v.box, { ...bearing, fov: END_FOV, aspect: v.aspect });
  return { target: fit.target, dist: fit.dist, fov: END_FOV, ...bearing };
}

/**
 * The camera the orbit takes from a replay frame: the frame's aim and bearing, and its framing at the
 * target (the view height there), through the end lens. So a take in the top-down phase (a 1.5°,
 * near-orthographic lens under the core's drawing) turns a top view at the end lens over the same
 * area, and a take mid-dolly keeps what the frame showed. A frame already at the end lens (the end
 * frame, every stop) is returned as it is.
 */
export function takenLens(f: FrameCamera): FrameCamera {
  if (f.fov === END_FOV) return f;
  return { ...f, fov: END_FOV, dist: (f.dist * Math.tan(rad(f.fov) / 2)) / Math.tan(rad(END_FOV) / 2) };
}

/**
 * How far the free camera may dolly, as multiples of the whole building's fitted distance (the
 * last stop): in until an eighth of the building's span fills the frame (a corner, one room), out
 * until it stands at a third of its fitted size.
 */
export const ZOOM = { in: 8, out: 3 } as const;

/**
 * The free camera's distance limits for lens `fov`: the view heights at the target that the end
 * lens has at `ZOOM`'s distances, so a camera taken mid-dolly (a narrower lens) zooms over the same
 * framings.
 */
export function distanceLimits(fits: readonly EndCamera[], fov: number): { min: number; max: number } {
  const whole = (fits[fits.length - 1] as EndCamera).dist;
  const k = Math.tan(rad(END_FOV) / 2) / Math.tan(rad(fov) / 2);
  return { min: (whole * k) / ZOOM.in, max: whole * k * ZOOM.out };
}

/** Where the free camera's target may pan: the sphere round everything drawn (the clip box). */
export function targetBounds(box: Box): { centre: Vec3; radius: number } {
  const d: Vec3 = [box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]];
  return {
    centre: [(box.lo[0] + box.hi[0]) / 2, (box.lo[1] + box.hi[1]) / 2, (box.lo[2] + box.hi[2]) / 2],
    radius: Math.hypot(d[0], d[1], d[2]) / 2,
  };
}
