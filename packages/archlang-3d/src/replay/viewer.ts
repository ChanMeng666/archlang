/**
 * The replay viewer's browser code (card A3), bundled with three.js into the single HTML file
 * `replay.ts` writes. It reads the payload the file carries, and everything it draws is a function
 * of the replay time: `window.__seek(t)` renders the frame at `t` synchronously and
 * `window.__frameHash()` hashes the composed frame (plan §6.5). The playback loop only chooses which
 * `t` to show next; no clock or random source reaches a frame.
 */
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
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
import { type ReplayEvent, stateAt } from "./timeline.js";

export interface ReplayNode {
  key: string;
  kind: string;
  part?: string;
  /** The combined view's exploded storeys: how far (mm) the node is lifted; absent = 0. */
  lift?: number;
  /** Flat `[x, y, z, …]` in micrometres, exporters' axes (X plan x, Y up, Z plan y). */
  positions: number[];
  indices: number[];
}

export interface ReplayPayload {
  title: string;
  theme: "light" | "dark";
  width: number;
  height: number;
  seconds: number;
  /** The core's own drawing of the plan (light theme) and its viewBox in plan millimetres. */
  svg: string;
  viewBox: [number, number, number, number];
  /** The end camera's elevation in degrees (`endElevation`). */
  elevation: number;
  nodes: ReplayNode[];
  events: ReplayEvent[];
}

declare global {
  interface Window {
    __seek: (t: number) => void;
    __frameHash: () => Promise<string>;
    __ready: Promise<void>;
    __replayAutoplay?: boolean;
  }
}

const THEMES = {
  light: {
    background: "#f7f5f0",
    edge: "#5b5650",
    colors: {
      slab: "#cfc8bc",
      floor: "#ece5d8",
      column: "#bdb5a8",
      wall: "#f4f1eb",
      roof: "#9c958a",
      door: "#b48a5c",
      "window:frame": "#e9e6e0",
      "window:glass": "#a9c7d8",
      "wall:demolish": "#c8553d",
      furniture: "#d9d1c3",
    } as Record<string, string>,
  },
  dark: {
    background: "#0f2235",
    edge: "#cfe3f5",
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
 * A footprint stands this many millimetres high while flat: above the 5 mm floor finish, so a door
 * leaf or a wall shows in the top-down phase (a fraction of the height hid a door under the floor;
 * red-team, PR #330).
 */
const FOOTPRINT_MM = 12;

function payload(): ReplayPayload {
  const el = document.getElementById("archlang-replay-payload");
  return JSON.parse(el?.textContent ?? "{}") as ReplayPayload;
}

function start(): void {
  const p = payload();
  const theme = THEMES[p.theme];
  const W = p.width;
  const H = p.height;

  const gl = document.createElement("canvas");
  gl.width = W;
  gl.height = H;
  const out = document.getElementById("archlang-replay") as HTMLCanvasElement;
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

  const renderer = new WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  const scene = new Scene();
  scene.background = new Color(theme.background);
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(-0.6, 1.4, 0.9);
  scene.add(sun);

  // Nodes in millimetres. Each node rises about its own base (its lowest point).
  const nodes = new Map<string, { g: Group; flat: number }>();
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
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setIndex(n.indices);
    geo.computeVertexNormals();
    const key = n.part ? `${n.kind}:${n.part}` : n.kind;
    const glass = key === "window:glass";
    // A demolished wall (B3a) is a ghost: translucent, writing no depth, never read as structure.
    const ghost = key === "wall:demolish";
    const mat = new MeshLambertMaterial({
      color: new Color(theme.colors[key] ?? theme.colors.furniture),
      transparent: glass || ghost,
      opacity: glass ? 0.45 : ghost ? 0.3 : 1,
      depthWrite: !ghost,
      flatShading: true,
      // The floor finish sits a few millimetres under every footprint: pushed back in depth, so a
      // flat footprint never fights it in perspective.
      polygonOffset: n.kind === "floor" || n.kind === "slab",
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 4,
    });
    const g = new Group();
    g.position.y = base + (n.lift ?? 0);
    g.add(new Mesh(geo, mat));
    if (n.kind !== "slab" && !glass) {
      g.add(new LineSegments(new EdgesGeometry(geo, 30), new LineBasicMaterial({ color: new Color(theme.edge) })));
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

  function seek(t: number): void {
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

  window.__seek = seek;
  window.__frameHash = frameHash;
  window.__ready = ready.then(() => seek(0));

  // Playback: the browser's frame clock only picks the next t; every frame is seek(t).
  const scrub = document.getElementById("archlang-replay-t") as HTMLInputElement | null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  void window.__ready.then(() => {
    if (window.__replayAutoplay === false) return;
    if (reduced) {
      seek(1);
      if (scrub) scrub.value = "1";
      return;
    }
    let t0: number | undefined;
    const step = (now: number) => {
      t0 ??= now;
      const t = Math.min(1, (now - t0) / (p.seconds * 1000));
      seek(t);
      if (scrub) scrub.value = String(t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  scrub?.addEventListener("input", () => seek(Number(scrub.value)));
}

start();
