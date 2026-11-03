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
import {
  boxOfNodes,
  cameraPosition,
  cameraStops,
  drawingFrame,
  END_AZIMUTH,
  END_FOV,
  frameCamera,
  START_FOV,
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
}

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
 * without it.
 */
export function mountReplay(out: HTMLCanvasElement, p: ReplayPayload, strip?: HTMLElement): ReplayHandle {
  const theme = THEMES[p.theme];
  const furniture = theme.colors.furniture as string;
  const W = p.width;
  const H = p.height;

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

  // Nodes in millimetres. Each node rises about its own base (its lowest point).
  const nodes = new Map<string, { g: Group; flat: number }>();
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
    nodes.set(n.key, { g, flat: Math.min(1, FOOTPRINT_MM / Math.max(1e-6, topY - base)) });
  }

  // The first frame frames the core drawing's viewBox exactly, letterboxed as the image is.
  const [vx, vy, vw, vh] = p.viewBox;
  const aspect = W / H;
  const { cx, cz, ow, oh } = drawingFrame(p.viewBox, aspect);
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
  const orbit = { elevation: p.elevation, azimuth: END_AZIMUTH, fov: END_FOV, aspect };
  // One framing per camera stop (`cameraStops`): the lower floor fills the frame before the floor
  // above rises over it; the last stop is the whole building.
  const fits = cameraStops(p.nodes, p.events, orbit);
  const size = hi.clone().sub(lo);
  const mid = lo.clone().add(hi).multiplyScalar(0.5);
  // Every point of the building lies within this of any target the camera aims at (the target moves
  // from the drawing's centre to the stops' targets).
  const reach = Math.max(...fits.map((f) => mid.distanceTo(new Vector3(...f.target))));
  const radius = Math.max(
    size.length() * 0.75 + reach + Math.hypot(mid.x - (vx + vw / 2), mid.z - (vy + vh / 2)),
    1000,
  );
  const rad = (d: number) => (d * Math.PI) / 180;

  const img = new Image();
  const ready = new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(p.svg)))}`;

  let disposed = false;

  function seek(t: number): void {
    if (disposed) return;
    if (strip && p.facts) paintStrip(strip, stripAt(p.facts, p.events, Math.min(1, Math.max(0, t))));
    const s = stateAt(p.events, t);
    for (const [key, { g, flat }] of nodes) {
      const st = s.nodes.get(key);
      g.visible = st?.visible === true;
      g.scale.y = Math.max(flat, st?.rise ?? 0);
    }
    let cam: OrthographicCamera | PerspectiveCamera = ortho;
    if (s.tilt > 0 || s.dolly > 0) {
      const f = frameCamera(s, fits, { cx, cz, oh, elevation: p.elevation });
      const { fov, dist, elevation, azimuth } = f;
      const target = new Vector3(...f.target);
      const el = rad(elevation);
      persp.fov = fov;
      // Near and far hug the scene, so depth precision is spent where the building is.
      persp.near = Math.max(10, dist - radius);
      persp.far = dist + radius;
      persp.updateProjectionMatrix();
      persp.up.set(0, 0, -1);
      if (el < rad(89.99)) persp.up.set(0, 1, 0);
      persp.position.set(...cameraPosition([target.x, target.y, target.z], dist, { elevation, azimuth }));
      persp.lookAt(target);
      cam = persp;
    }
    renderer.render(scene, cam);
    ctx.globalAlpha = 1;
    ctx.drawImage(gl, 0, 0);
    if (s.svg > 0 && img.complete && img.naturalWidth > 0) {
      const k = Math.min(W / vw, H / vh);
      const dw = vw * k;
      const dh = vh * k;
      ctx.globalAlpha = s.svg;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }
  }

  async function frameHash(): Promise<string> {
    const data = ctx.getImageData(0, 0, W, H).data;
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const o of owned) o.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { seek, frameHash, ready, dispose };
}
