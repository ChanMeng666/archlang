/**
 * The replay's renderer (card A3), browser-only: `mountReplay(canvas, payload)` draws the frame at
 * replay time `t` into `canvas`, synchronously, and hashes the composed frame (plan §6.5). Two
 * hosts use it: the single-file replay HTML (`viewer.ts`, which reads the payload the file
 * carries) and the playground's 3D preview tab (card A5, which builds the payload in the browser
 * with `replayPayload`). Everything drawn is a function of `t`; no clock or random source reaches
 * a frame.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  boxOfNodes,
  cameraPosition,
  cameraStops,
  distanceLimits,
  drawingFrame,
  ELEVATION_RANGE,
  END_AZIMUTH,
  END_FOV,
  type FrameCamera,
  frameCamera,
  pivotAbove,
  type PresetName,
  presetCamera,
  START_FOV,
  settledLift,
  stopCount,
  takenLens,
  targetBounds,
  type Vec3,
  type ViewScene,
} from "./camera.js";
import { finishColour, KIND_PALETTE, PALETTE, slotColour, WALL_CAP_SRGB } from "../materials.js";
import type { ReplayPayload } from "./payload.js";
import { stripAt } from "./strip.js";
import { paintStrip } from "./strip-dom.js";

import { stateAt } from "./timeline.js";

export type { ReplayNode, ReplayPayload } from "./payload.js";

export interface ReplayHandle {
  /** Render the frame at replay time `t` (clamped to [0, 1]) into the canvas, synchronously. */
  seek: (t: number) => void;
  /** SHA-256 (hex) of the canvas's composed RGBA pixels. */
  frameHash: () => Promise<string>;
  /** Settles once the core's drawing has loaded (or failed to); `seek` draws it from then on. */
  ready: Promise<void>;
  /** Release the WebGL context and the GPU buffers. The handle draws nothing afterwards. */
  dispose: () => void;
  /** The camera the user moves (card CR4); present when mounted with `interactive: true`. */
  view?: ViewControl;
  /**
   * Give the canvas a new drawing size (a host whose canvas follows its container, playground card
   * PG1) and redraw the last frame at it. Everything the frame reads from the size (the drawing's
   * frame, the cameras' aspect, the stops' framing, the presets) is worked out again as a mount at
   * that size works it out, so after `resize(w, h)` the frame at `t` is the frame a fresh mount at
   * `w`×`h` draws at `t`. Never called, nothing changes: the payload's size is the canvas's.
   */
  resize: (width: number, height: number) => void;
}

export type { PresetName } from "./camera.js";

/** Who holds the camera: the replay, a preset, or the user's own orbit. */
export type CameraHolder = "replay" | PresetName | "free";

/** A view to carry over to a new mount of an edited plan (`ViewControl.state`, `restore`). */
export type ViewState =
  | { camera: "replay" | PresetName; storeys: Shown }
  | { camera: "free"; position: Vec3; target: Vec3; fov: number; storeys: Shown };
/** The storeys shown: 1…n, or every one (so an edit that adds a storey shows it too). */
type Shown = number | "all";

/**
 * The free camera (card CR4, decision CR-D2), browser side. `seek(t)` still draws the replay's own
 * frame at `t` and hands a taken camera back to the replay; `at(t)` draws `t` from whatever camera
 * holds the view. The storeys shown persist across both. Nothing here reaches the default path: a
 * handle nobody touches draws exactly the frames it drew before.
 */
export interface ViewControl {
  /** Draw replay time `t` (clamped) from the current camera, without handing it back. */
  at: (t: number) => void;
  /** Draw the current `t` from a preset camera (`presetCamera`); `iso` is the end camera exactly. */
  preset: (name: PresetName) => void;
  /** The replay's own camera and every storey: at t = 1 the end frame, byte for byte. */
  reset: () => void;
  /** How many storeys the replay has (1: nothing to hide). */
  readonly storeys: number;
  /** Show storeys 1…`upTo` (1-based, clamped) and hide those above; the camera stays. */
  showStoreys: (upTo: number) => void;
  /** How many storeys are shown, from the lowest. */
  readonly shown: number;
  readonly camera: CameraHolder;
  state: () => ViewState;
  /**
   * Take over a state from an earlier mount (an edit rebuilt the replay); draws nothing. A held view
   * (a preset, the user's orbit) is taken as a preset is: `onTake`.
   */
  restore: (s: ViewState) => void;
  /** Hear when `camera` or `shown` changes (a drag, a preset, a seek, a restore); returns the unsubscribe. */
  onChange: (fn: () => void) => () => void;
  /**
   * Turn the view `degrees` about its pivot, as a drag across would (a host's turntable, playground
   * card PG1), and draw it. The host chooses each step; nothing here reads a clock. The first step
   * takes the view from the replay or a preset (the camera becomes "free", `onTake`), from the
   * frame on the canvas. A host that never calls it draws exactly what it drew before.
   */
  spin: (degrees: number) => void;
}

export interface MountOptions {
  /**
   * Drag to turn, wheel or pinch to zoom, right-drag or two fingers to pan, arrow keys and + / −
   * on the focused canvas (three.js's `OrbitControls`). Off by default.
   */
  interactive?: boolean;
  /**
   * The user took the view (the first movement of a drag, the wheel or a key, a preset, a restored
   * held view): a host that is playing pauses, or its next `seek` hands the camera back.
   */
  onTake?: () => void;
}

/** One arrow-key press turns the view this far (degrees); one + or − dollies by this factor. */
const KEY_TURN_DEG = 5;
const KEY_DOLLY = 0.9;

/**
 * The replay's themes. The light theme's building colours ARE the shared palette (`KIND_PALETTE`,
 * `FINISH_PALETTE`, `materials.ts`), the GLB's too; the dark (blueprint) theme is the viewer's own.
 * `edge` is the outline every solid but the slab carries, `cap` a wall's cut top.
 */
const THEMES = {
  light: {
    background: "#f7f5f0",
    edge: "#8f877c",
    cap: WALL_CAP_SRGB,
    colors: Object.fromEntries(Object.entries(KIND_PALETTE).map(([k, v]) => [k, v.srgb])) as Record<string, string>,
  },
  dark: {
    background: "#0f2235",
    edge: "#cfe3f5",
    cap: "#cfe3f5",
    colors: {
      slab: "#20384f",
      floor: "#1b3248",
      column: "#3b5b78",
      wall: "#2e4d6a",
      roof: "#14283c",
      door: "#7aa6c9",
      "window:frame": "#5d86a8",
      "window:glass": "#86c5ee",
      "wall:demolish": "#e07a5f",
      furniture: "#3f6a8f",
      stair: "#5d86a8",
    } as Record<string, string>,
  },
} as const;

/**
 * The replay's lights (visual-assets V9): directions are world vectors (X plan x, Y up, Z plan y)
 * toward the light; the end camera looks from azimuth −32° (`END_AZIMUTH`), so the key, from the
 * west and a little south, lights one of the two wall faces it sees and leaves the other in the
 * sky's half-light. No shadow maps: on SwiftShader a 2048² PCF map for the key cost ~55% more per
 * frame (1600 × 900, measured for V9), over the card's ~30% budget.
 */
const LIGHT = {
  sky: 0xf8fbff,
  ground: 0xd9d2c7,
  hemi: 2.4,
  keyColour: 0xfffaf2,
  key: 2.7,
  keyFrom: [-1, 1.25, 0.3] as [number, number, number],
  fillColour: 0xe4ecf5,
  fill: 0.5,
  fillFrom: [0.7, 0.5, -0.6] as [number, number, number],
} as const;

/**
 * A footprint stands this many millimetres high while flat: above the 5 mm floor finish, so a door
 * leaf or a wall shows in the top-down phase (a fraction of the height hid a door under the floor;
 * red-team, PR #330).
 */
const FOOTPRINT_MM = 12;

/**
 * Mount the replay `p` on `out`: sizes the canvas to `p.width`×`p.height` and draws nothing yet.
 * `strip`, an element the host lays over the canvas, receives the metrics strip (card G4) as DOM
 * text at every `seek`; it is never drawn into the canvas, so `frameHash` is the same with and
 * without it. `opts.interactive` adds the free camera (`handle.view`, card CR4); until someone
 * drags, scrolls, presses a key or calls `view`, every frame is the one it is without it.
 */
export function mountReplay(
  out: HTMLCanvasElement,
  p: ReplayPayload,
  strip?: HTMLElement,
  opts: MountOptions = {},
): ReplayHandle {
  const theme = THEMES[p.theme];
  const furniture = theme.colors.furniture as string;
  // The drawing size: the payload's, until a host resizes the canvas (`resize`).
  let W = p.width;
  let H = p.height;

  const gl = document.createElement("canvas");
  gl.width = W;
  gl.height = H;
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

  const renderer = new WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  // Neutral tone mapping rolls a sunlit white off softly instead of clipping it to flat paper.
  renderer.toneMapping = NeutralToneMapping;
  const scene = new Scene();
  scene.background = new Color(theme.background);
  // Soft daylight, fixed in the world (the replay is a function of t alone): a warm sky over a
  // warm-grey ground, one key from high on the camera's left, a cool fill from the far side.
  scene.add(new HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.hemi));
  const key = new DirectionalLight(LIGHT.keyColour, LIGHT.key);
  key.position.set(...LIGHT.keyFrom);
  scene.add(key);
  const fill = new DirectionalLight(LIGHT.fillColour, LIGHT.fill);
  fill.position.set(...LIGHT.fillFrom);
  scene.add(fill);

  // Nodes in millimetres. Each node rises about its own base (its lowest point). A node of an
  // exploded storey (`lift`) comes down by it as the storeys settle (`stateAt`'s `settle`).
  const nodes = new Map<string, { g: Group; flat: number; base: number; lift: number }>();
  const owned: Array<{ dispose: () => void }> = [];
  for (const n of p.nodes) {
    const pos = new Float32Array(n.positions.length);
    let base = Infinity;
    let topY = -Infinity;
    for (let i = 1; i < n.positions.length; i += 3) {
      base = Math.min(base, (n.positions[i] as number) / 1000);
      topY = Math.max(topY, (n.positions[i] as number) / 1000);
    }
    for (let i = 0; i < n.positions.length; i += 3) {
      const x = (n.positions[i] as number) / 1000;
      const y = (n.positions[i + 1] as number) / 1000;
      const z = (n.positions[i + 2] as number) / 1000;
      pos[i] = x;
      pos[i + 1] = y - base;
      pos[i + 2] = z;
    }
    const key = n.part ? `${n.kind}:${n.part}` : n.kind;
    const g = new Group();
    g.position.y = base + (n.lift ?? 0);
    /**
     * One three.js mesh (and its edges) over `indices`, in `colour`; `glass` is translucent and
     * edgeless. `normals: false` skips the vertex normals: every material here is flat-shaded, whose
     * fragment normal three.js takes from screen-space derivatives (`FLAT_SHADED`), so they are
     * never read; a slotted node's meshes share one position buffer and need none.
     */
    const add = (
      attr: BufferAttribute,
      indices: number[],
      colour: string,
      glass: boolean,
      opacity: number,
      normals: boolean,
      edged = true,
    ) => {
      const geo = new BufferGeometry();
      geo.setAttribute("position", attr);
      geo.setIndex(indices);
      if (normals) geo.computeVertexNormals();
      // A demolished wall (B3a) is a ghost: translucent, writing no depth, never read as structure.
      const ghost = key === "wall:demolish";
      const flatLaid = n.kind === "floor" || n.kind === "slab";
      const mat = new MeshLambertMaterial({
        color: new Color(colour),
        transparent: glass || ghost,
        opacity: glass ? opacity : ghost ? 0.3 : 1,
        depthWrite: !ghost,
        flatShading: true,
        // Every face is pushed back a little, so the outline drawn on it wins the depth test
        // cleanly instead of stippling into a dashed line. The floor finish sits a few millimetres
        // under every footprint: pushed back further, so a flat footprint never fights it in
        // perspective.
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: flatLaid ? 4 : 1,
      });
      owned.push(geo, mat);
      g.add(new Mesh(geo, mat));
      if (n.kind !== "slab" && !glass && edged) {
        const edges = new EdgesGeometry(geo, 30);
        const line = new LineBasicMaterial({ color: new Color(theme.edge) });
        owned.push(edges, line);
        g.add(new LineSegments(edges, line));
      }
    };
    const attr = new BufferAttribute(pos, 3);
    if (n.groups) {
      // A T0 piece (visual-assets V1): one mesh per material slot, coloured from the one palette
      // the GLB writer reads too; `body` keeps the kind's own colour.
      let at = 0;
      for (const { slot, count } of n.groups) {
        const run = n.indices.slice(at, at + count);
        at += count;
        if (slot === "body") add(attr, run, theme.colors[key] ?? furniture, false, 1, false);
        else {
          const { alpha } = PALETTE[slot];
          add(attr, run, slotColour(slot, p.theme, furniture), alpha < 1, alpha, false);
        }
      }
    } else if (n.finish) {
      // A floor in its finish (visual-assets V9): timber, tile or the neutral one.
      add(attr, n.indices, finishColour(n.finish, p.theme, THEMES.dark.colors.floor as string), false, 1, true);
    } else if (key === "wall") {
      // A standing wall: its faces at full height (its cut top, the triangles whose three corners
      // all lie there) drawn apart in the cap colour, edgeless (the body's outline already rims it).
      // The same division as `topY`'s, so the comparison is exact.
      const atTop = (v: number) => (n.positions[v * 3 + 1] as number) / 1000 === topY;
      const cap: number[] = [];
      const body: number[] = [];
      for (let i = 0; i < n.indices.length; i += 3) {
        const tri = n.indices.slice(i, i + 3);
        (tri.every(atTop) ? cap : body).push(...tri);
      }
      add(attr, body, theme.colors.wall ?? furniture, false, 1, true);
      if (cap.length) add(attr, cap, theme.cap, false, 1, true, false);
    } else {
      // Every other node exactly as before the slots (normals computed, though never read).
      const glass = key === "window:glass";
      add(attr, n.indices, theme.colors[key] ?? furniture, glass, glass ? KIND_PALETTE["window:glass"].alpha : 1, true);
    }
    g.visible = false;
    scene.add(g);
    nodes.set(n.key, { g, flat: Math.min(1, FOOTPRINT_MM / Math.max(1e-6, topY - base)), base, lift: n.lift ?? 0 });
  }

  // The first frame frames the core drawing's viewBox exactly, letterboxed as the image is.
  const [vx, vy, vw, vh] = p.viewBox;
  let aspect = W / H;
  let { cx, cz, ow, oh } = drawingFrame(p.viewBox, aspect);
  // Everything drawn, ghosts included (exploded storeys too): the cameras' clip range. The fitted
  // cameras (`cameraStops`) frame the standing building only.
  const box = boxOfNodes(p.nodes, { ghosts: true });
  const lo = new Vector3(...box.lo);
  const hi = new Vector3(...box.hi);
  const top = hi.y + 1000;
  const ortho = new OrthographicCamera(-ow / 2, ow / 2, oh / 2, -oh / 2, 1, top + 100000);
  ortho.up.set(0, 0, -1);
  ortho.position.set(cx, top + 50000, cz);
  ortho.lookAt(cx, 0, cz);

  const persp = new PerspectiveCamera(START_FOV, aspect, 10, 1e9);
  // One framing per camera stop (`cameraStops`): the lower floor fills the frame before the floor
  // above rises over it; the last stop is the whole building.
  const fitsAt = (a: number) =>
    cameraStops(p.nodes, p.events, { elevation: p.elevation, azimuth: END_AZIMUTH, fov: END_FOV, aspect: a });
  let fits = fitsAt(aspect);
  const size = hi.clone().sub(lo);
  const mid = lo.clone().add(hi).multiplyScalar(0.5);
  // Every point of the building lies within this of any target the camera aims at (the target moves
  // from the drawing's centre to the stops' targets). `radius` is the rise's (the stops' targets);
  // `endRadius` adds the settle's (several storeys: the assembled building's fit, the last), so a
  // frame before the settle keeps the very clip range it had before the settle existed.
  const radiusOver = (cams: readonly { target: Vec3 }[]): number => {
    const reach = Math.max(...cams.map((f) => mid.distanceTo(new Vector3(...f.target))));
    return Math.max(size.length() * 0.75 + reach + Math.hypot(mid.x - (vx + vw / 2), mid.z - (vy + vh / 2)), 1000);
  };
  let radius = radiusOver(fits.slice(0, stopCount(p.events)));
  let endRadius = radiusOver(fits);
  const rad = (d: number) => (d * Math.PI) / 180;

  const img = new Image();
  const ready = new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(p.svg)))}`;

  let disposed = false;

  let frameView = { cx, cz, oh, elevation: p.elevation };
  // Each node's storey, 0-based from the lowest (the combined view's events carry it; one storey: 0).
  const storeyOf = new Map(p.events.map((e) => [e.key, e.storey ?? 0] as const));
  const storeys = Math.max(1, ...p.events.filter((e) => !e.hidden).map((e) => (e.storey ?? 0) + 1));
  /** Storeys 1…shown are drawn; all of them unless the viewer hid some (`view.showStoreys`). */
  let shown = storeys;
  /** Who holds the camera; "replay" unless the viewer took it (`view`). */
  let holder: CameraHolder = "replay";
  /** The replay time last drawn. */
  let tNow = 0;
  /** Whether any frame has been drawn yet (a `resize` before the first one draws nothing). */
  let drawn = false;
  const halfDiagonal = size.length() / 2;
  /**
   * The clip radius round a target the replay never aims at (a preset, the user's orbit): every
   * point drawn lies within half the box's diagonal of its centre. The replay's own `radius` when
   * that is wider, as it is for the end camera's target (`reach` covers it), so a preset that is the
   * end camera draws the end frame's own near and far planes.
   */
  const reachFrom = (target: Vector3): number => Math.max(endRadius, mid.distanceTo(target) + halfDiagonal);

  /** Aim the perspective camera from `f`, its near and far planes `r` either side of the target. */
  function place(f: FrameCamera, r: number): void {
    const { fov, dist, elevation, azimuth } = f;
    const target = new Vector3(...f.target);
    const el = rad(elevation);
    persp.fov = fov;
    // Near and far hug the scene, so depth precision is spent where the building is.
    persp.near = Math.max(10, dist - r);
    persp.far = dist + r;
    persp.updateProjectionMatrix();
    persp.up.set(0, 0, -1);
    if (el < rad(89.99)) persp.up.set(0, 1, 0);
    persp.position.set(...cameraPosition([target.x, target.y, target.z], dist, { elevation, azimuth }));
    persp.lookAt(target);
  }

  // The presets (`presetCamera`), each a pure function of the scene, worked out when first asked for.
  // They frame the building as the end frame shows it: the storeys settled (`ViewScene.box`).
  let viewScene: ViewScene = {
    events: p.events,
    fits,
    frame: frameView,
    box: boxOfNodes(p.nodes, { settle: 1 }),
    aspect,
  };
  const presets = new Map<PresetName, FrameCamera>();
  const presetOf = (name: PresetName): FrameCamera => {
    const known = presets.get(name);
    if (known) return known;
    const f = presetCamera(name, viewScene);
    presets.set(name, f);
    return f;
  };

  /** The orbit controls, when interactive; the user's camera while `holder` is "free". */
  let controls: OrbitControls | undefined;
  /** Stop the orbit's motion (its damping), so a camera set from outside holds still. */
  let halt = (): void => {};
  /** Take the free camera's listeners off the canvas. */
  let unhook = (): void => {};
  /** After a replay frame: re-aim an orbit whose press is down but has not moved yet. */
  let primeAgain = (): void => {};
  /** Who hears that the holder or the storeys shown changed (`view.onChange`: the toolbar). */
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const fn of listeners) fn();
  };

  /** Draw replay time `t` from whoever holds the camera. */
  function draw(t: number): void {
    tNow = t;
    drawn = true;
    if (strip && p.facts) paintStrip(strip, stripAt(p.facts, p.events, Math.min(1, Math.max(0, t))));
    const s = stateAt(p.events, t);
    for (const [key, { g, flat, base, lift }] of nodes) {
      const st = s.nodes.get(key);
      g.visible = st?.visible === true && (storeyOf.get(key) ?? 0) < shown;
      g.scale.y = Math.max(flat, st?.rise ?? 0);
      if (lift !== 0) g.position.y = base + settledLift(lift, s.settle);
    }
    let cam: OrthographicCamera | PerspectiveCamera = ortho;
    if (holder === "free" && controls) {
      // The orbit placed and aimed the camera; the clip range follows its target.
      const dist = persp.position.distanceTo(controls.target);
      const r = reachFrom(controls.target);
      persp.near = Math.max(10, dist - r);
      persp.far = dist + r;
      persp.updateProjectionMatrix();
      cam = persp;
    } else if (holder !== "replay" && holder !== "free") {
      const f = presetOf(holder);
      place(f, reachFrom(new Vector3(...f.target)));
      cam = persp;
    } else if (s.tilt > 0 || s.dolly > 0) {
      place(frameCamera(s, fits, frameView), s.settle > 0 ? endRadius : radius);
      cam = persp;
    }
    renderer.render(scene, cam);
    ctx.globalAlpha = 1;
    ctx.drawImage(gl, 0, 0);
    // The core's drawing is laid over the replay's own camera only (it matches the top-down frame).
    if (holder === "replay" && s.svg > 0 && img.complete && img.naturalWidth > 0) {
      const k = Math.min(W / vw, H / vh);
      const dw = vw * k;
      const dh = vh * k;
      ctx.globalAlpha = s.svg;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
  }

  /** The replay's own frame at `t`: a camera the viewer took goes back to the replay. */
  function seek(t: number): void {
    if (disposed) return;
    if (holder !== "replay") {
      halt();
      holder = "replay";
      notify();
    }
    draw(t);
    primeAgain();
  }

  async function frameHash(): Promise<string> {
    const data = ctx.getImageData(0, 0, W, H).data;
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const view = opts.interactive ? interact() : undefined;

  /**
   * The free camera (card CR4): three.js's own `OrbitControls` on the canvas the host shows. Built
   * with damping off and changing nothing the replay's frames read: every replay frame sets the
   * camera's lens, planes, up, position and aim itself (`place`), so the controls' first `update()`
   * (in their constructor) is overwritten before anything is drawn.
   */
  function interact(): ViewControl {
    const c = new OrbitControls(persp, out);
    controls = c;
    c.enableDamping = false;
    // Pan across the ground, not the screen: the target keeps its height, so with the polar limit
    // the camera never drops below it.
    c.screenSpacePanning = false;
    c.minPolarAngle = rad(90 - ELEVATION_RANGE.max);
    c.maxPolarAngle = rad(90 - ELEVATION_RANGE.min);
    const bounds = targetBounds(box);
    c.cursor.set(...bounds.centre);
    const tabIndex0 = out.getAttribute("tabindex");
    out.tabIndex = 0;

    let loop = 0;
    let dragging = false;
    /** Set while `halt` flushes the orbit: its `change` must not draw. */
    let quiet = false;
    const reduced = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    // Damping eases the orbit out over the next animation frames (a frame count, never a clock).
    const settle = (): void => {
      loop = 0;
      if (disposed || holder !== "free") return;
      if (c.update() || dragging) loop = requestAnimationFrame(settle);
    };
    const kick = (): void => {
      if (c.enableDamping && !loop) loop = requestAnimationFrame(settle);
    };
    halt = () => {
      if (loop) cancelAnimationFrame(loop);
      loop = 0;
      dragging = false;
      if (!c.enableDamping) return;
      // An undamped update applies and clears what the damping still owes.
      quiet = true;
      c.enableDamping = false;
      c.update();
      quiet = false;
    };

    /**
     * Line the orbit up from `position` toward `target` through lens `fov`, turning about a pivot on
     * that line of sight no lower than the building (`pivotAbove`). Draws nothing and leaves the
     * holder: the frame on the canvas stays until the orbit actually moves.
     */
    const aim = (position: Vec3, target: Vec3, fov: number): void => {
      persp.fov = fov;
      persp.up.set(0, 1, 0);
      persp.position.set(...position);
      c.target.set(...pivotAbove(position, target, viewScene.box.lo[1]));
      persp.lookAt(c.target);
      const dist = persp.position.distanceTo(c.target);
      const lim = distanceLimits(fits, fov);
      c.minDistance = Math.min(lim.min, dist);
      c.maxDistance = Math.max(lim.max, dist);
      c.maxTargetRadius = Math.max(bounds.radius, c.target.distanceTo(c.cursor));
      c.enableDamping = !reduced();
    };
    /**
     * Line the orbit up with the frame showing: a preset as it is; a replay frame through the end
     * lens with its aim and framing (`takenLens`), so a take in the top-down phase turns a top view at
     * the end lens, not the near-orthographic 1.5° one.
     */
    const prime = (): void => {
      if (holder === "free") return;
      const f =
        holder === "replay" ? takenLens(frameCamera(stateAt(p.events, tNow), fits, frameView)) : presetOf(holder);
      aim(cameraPosition(f.target, f.dist, f), f.target, f.fov);
    };
    /** The view is the user's now: the host pauses (`onTake`) and the toolbar hears of it. */
    const own = (): void => {
      if (holder === "free") return;
      holder = "free";
      opts.onTake?.();
      notify();
      kick();
    };
    /** A press is down but nothing has moved yet: the replay's frames may still change under it. */
    let armed = false;
    primeAgain = () => {
      if (armed) prime();
    };

    // A press only lines the orbit up; the first real movement (`change`) takes the view, so a
    // plain click on the canvas changes nothing.
    c.addEventListener("start", () => {
      prime();
      armed = true;
      dragging = true;
    });
    c.addEventListener("end", () => {
      armed = false;
      dragging = false;
    });
    c.addEventListener("change", () => {
      if (quiet || disposed) return;
      armed = false;
      own();
      draw(tNow);
    });
    const turn = rad(KEY_TURN_DEG);
    // Arrow keys turn the view, + and − dolly (= and _ are the same keys unshifted and shifted).
    const keys = new Map<string, () => void>([
      ["ArrowLeft", () => c.rotateLeft(turn)],
      ["ArrowRight", () => c.rotateLeft(-turn)],
      ["ArrowUp", () => c.rotateUp(turn)],
      ["ArrowDown", () => c.rotateUp(-turn)],
      ["+", () => c.dollyIn(KEY_DOLLY)],
      ["=", () => c.dollyIn(KEY_DOLLY)],
      ["-", () => c.dollyOut(KEY_DOLLY)],
      ["_", () => c.dollyOut(KEY_DOLLY)],
    ]);
    const onKey = (e: KeyboardEvent): void => {
      const act = keys.get(e.key);
      if (!act || disposed || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      // The move's own `change` takes the view (a key at a limit moves nothing and takes nothing).
      prime();
      act();
      kick();
    };
    out.addEventListener("keydown", onKey);
    // A host reuses its canvas for the next mount (the playground does): leave it as it was.
    unhook = () => {
      out.removeEventListener("keydown", onKey);
      c.dispose();
      if (tabIndex0 === null) out.removeAttribute("tabindex");
      else out.setAttribute("tabindex", tabIndex0);
      listeners.clear();
    };

    const clampStoreys = (k: number): number => Math.min(storeys, Math.max(1, Math.round(k)));
    const shownState = (): Shown => (shown === storeys ? "all" : shown);
    return {
      at: (t) => {
        if (!disposed) draw(t);
      },
      // A preset takes the view as a drag does: the host pauses, or its next frame would hand the
      // camera straight back to the replay.
      preset: (name) => {
        if (disposed) return;
        halt();
        holder = name;
        opts.onTake?.();
        notify();
        draw(tNow);
      },
      reset: () => {
        if (disposed) return;
        halt();
        holder = "replay";
        shown = storeys;
        notify();
        draw(tNow);
      },
      storeys,
      showStoreys: (k) => {
        if (disposed) return;
        shown = clampStoreys(k);
        notify();
        draw(tNow);
      },
      onChange: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      // One undamped step, so each call lands on its frame at once; the orbit's own `change` takes
      // the view (the first step) and draws. Never under a press: the user's drag holds the view.
      spin: (degrees) => {
        if (disposed || dragging || !Number.isFinite(degrees) || degrees === 0) return;
        prime();
        const damped = c.enableDamping;
        c.enableDamping = false;
        c.rotateLeft(rad(degrees));
        c.update();
        c.enableDamping = damped;
      },
      get shown() {
        return shown;
      },
      get camera() {
        return holder;
      },
      state: () =>
        holder === "free"
          ? {
              camera: "free",
              position: persp.position.toArray() as Vec3,
              target: c.target.toArray() as Vec3,
              fov: persp.fov,
              storeys: shownState(),
            }
          : { camera: holder, storeys: shownState() },
      restore: (s) => {
        if (disposed) return;
        halt();
        shown = s.storeys === "all" ? storeys : clampStoreys(s.storeys);
        if (s.camera === "free") aim(s.position, s.target, s.fov);
        holder = s.camera;
        // A view the user held stays held: the host pauses, as for a drag or a preset.
        if (holder !== "replay") opts.onTake?.();
        notify();
      },
    };
  }

  /**
   * A new drawing size: every size-dependent value is worked out again exactly as the mount above
   * works it out, so a resized handle draws what a fresh mount at that size draws. A held view keeps
   * its camera (only its lens's aspect follows), the replay's and the presets' are re-framed.
   */
  function resize(width: number, height: number): void {
    if (disposed) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === W && h === H) return;
    W = w;
    H = h;
    gl.width = W;
    gl.height = H;
    out.width = W;
    out.height = H;
    renderer.setSize(W, H, false);
    aspect = W / H;
    ({ cx, cz, ow, oh } = drawingFrame(p.viewBox, aspect));
    ortho.left = -ow / 2;
    ortho.right = ow / 2;
    ortho.top = oh / 2;
    ortho.bottom = -oh / 2;
    ortho.position.set(cx, top + 50000, cz);
    ortho.lookAt(cx, 0, cz);
    ortho.updateProjectionMatrix();
    persp.aspect = aspect;
    persp.updateProjectionMatrix();
    fits = fitsAt(aspect);
    radius = radiusOver(fits.slice(0, stopCount(p.events)));
    endRadius = radiusOver(fits);
    frameView = { cx, cz, oh, elevation: p.elevation };
    viewScene = { ...viewScene, fits, frame: frameView, aspect };
    presets.clear();
    if (drawn) draw(tNow);
  }

  function dispose(): void {
    if (disposed) return;
    halt();
    disposed = true;
    unhook();
    for (const o of owned) o.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { seek, frameHash, ready, dispose, resize, ...(view ? { view } : {}) };
}
