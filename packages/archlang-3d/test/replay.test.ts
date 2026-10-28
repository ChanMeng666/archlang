/**
 * The replay (card A3), light half: the event table follows the authoring order (D3), the state is
 * a pure function of time, and the single-file HTML is offline and labelled. The heavy half (a
 * browser, key-frame pixels, the MP4) is `e2e/replay.e2e.ts` under `npm run check:3d`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  adaptPlan,
  boxOfNodes,
  buildMesh,
  corners,
  coverage,
  END_AZIMUTH,
  END_FOV,
  explodeLifts,
  fitEndCamera,
  keyFrames,
  type Mesh3D,
  PHASE,
  projectBox,
  stateAt,
  storeysOf,
  timeline,
  viewMesh,
} from "../src/index.js";
import { cameraPosition } from "../src/replay/camera.js";
import { PREVIEW_LABEL, replayHtml, replayPayload } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const meshOf = (name: string) => {
  const src = EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
  const r = adaptPlan(src, { world: WORLD });
  if (!r.ok) throw new Error(r.refusal.code);
  return { src, mesh: buildMesh(r.scene) };
};

const STAGES = ["brief", "rooms", "walls", "openings", "fixtures", "drafting"];

describe("replay timeline (D3)", () => {
  const all = EXAMPLES_LIST.map(([n]) => ({ n, ...meshOf(n) }));

  it("orders every corpus plan by stage, then D3's sub-order, then source order", () => {
    for (const { n, mesh } of all) {
      const ev = timeline(mesh);
      expect(ev.length, n).toBe(mesh.nodes.length);
      const nodeOf = new Map(mesh.nodes.map((x) => [x.key, x] as const));
      const stages = ev.map((e) => STAGES.indexOf(e.stage));
      expect(stages, `${n}: stages never go back`).toEqual([...stages].sort((a, b) => a - b));
      const kinds = ev.map((e) => nodeOf.get(e.key));
      const first = (p: (k: (typeof kinds)[number]) => boolean) => kinds.findIndex(p);
      const last = (p: (k: (typeof kinds)[number]) => boolean) => kinds.length - 1 - [...kinds].reverse().findIndex(p);
      const ext = (k: (typeof kinds)[number]) => k?.kind === "wall" && k.extras.category === "exterior";
      const inner = (k: (typeof kinds)[number]) => k?.kind === "wall" && k.extras.category !== "exterior";
      if (kinds.some(ext) && kinds.some(inner))
        expect(last(ext) < first(inner), `${n}: exterior walls first`).toBe(true);
      if (kinds.some((k) => k?.kind === "door") && kinds.some((k) => k?.kind === "window"))
        expect(last((k) => k?.kind === "door") < first((k) => k?.kind === "window"), `${n}: doors before windows`).toBe(
          true,
        );
    }
  });

  it("draws the lowest storey in phase 1, raises walls with their openings, then fixtures and furniture", () => {
    let upper = 0;
    for (const { n, mesh } of all) {
      const ev = timeline(mesh);
      const byKey = new Map(ev.map((e) => [e.key, e] as const));
      const lowest = Math.min(...mesh.nodes.map((x) => x.level));
      for (const nd of mesh.nodes) {
        const e = byKey.get(nd.key);
        if (!e || e.hidden) continue;
        // The core's drawing (page 1) is the lowest storey: only it is drawn top-down; an upper
        // storey appears no earlier than the rise (PR #330 review round 1).
        if (nd.level === lowest) expect(e.appear, `${n} ${nd.key}`).toBeLessThan(PHASE.drawn);
        else {
          upper++;
          expect(e.appear, `${n} ${nd.key}`).toBeGreaterThanOrEqual(PHASE.rise);
        }
        const within = (a: number, b: number) => e.riseFrom >= a - 1e-9 && e.riseTo <= b + 1e-9;
        if (nd.kind !== "slab" && nd.kind !== "floor")
          expect(within(PHASE.rise, PHASE.done), `${n} ${nd.key}`).toBe(true);
        if (storeysOf(mesh).length === 1) {
          if (nd.kind === "wall") expect(within(PHASE.rise, PHASE.wallsUp), `${n} ${nd.key}`).toBe(true);
          if (nd.kind === "furniture") expect(within(PHASE.wallsUp, PHASE.done), `${n} ${nd.key}`).toBe(true);
        }
        // Inside a storey, furniture rises after its storey's walls.
        if (nd.kind === "furniture")
          for (const w of mesh.nodes)
            if (w.kind === "wall" && w.level === nd.level)
              expect(e.riseFrom, `${n} ${nd.key} after ${w.key}`).toBeGreaterThanOrEqual(
                (byKey.get(w.key)?.riseTo ?? 0) - 1e-9,
              );
        if (nd.kind === "door" || nd.kind === "window") {
          const host = byKey.get(`L${nd.level}/wall:${String(nd.extras.host)}`);
          expect(host, `${n} ${nd.key} finds its host wall`).toBeDefined();
          expect([e.riseFrom, e.riseTo], `${n} ${nd.key} rises with its wall`).toEqual([host?.riseFrom, host?.riseTo]);
        }
      }
      // Storey by storey: every wall of a storey starts no earlier than every wall below it.
      const wallStarts = mesh.nodes
        .filter((x) => x.kind === "wall")
        .map((x) => [x.level, byKey.get(x.key)?.riseFrom ?? 0] as const);
      for (const [l, t] of wallStarts) {
        for (const [l2, t2] of wallStarts) if (l2 < l) expect(t, n).toBeGreaterThanOrEqual(t2);
      }
      expect(
        ev.filter((e) => mesh.nodes.find((x) => x.key === e.key)?.kind === "roof").every((e) => e.hidden),
        n,
      ).toBe(true);
    }
    expect(upper, "the multi-storey plans have upper-storey nodes").toBeGreaterThan(50);
  });

  it("is a pure function of t: the same t gives the same state, and t is clamped", () => {
    const ev = timeline(meshOf("laneway-house.arch").mesh);
    const snap = (t: number) => JSON.stringify({ ...stateAt(ev, t), nodes: [...stateAt(ev, t).nodes] });
    expect(snap(0.37)).toBe(snap(0.37));
    expect(snap(-1)).toBe(snap(0));
    expect(snap(2)).toBe(snap(1));
    expect(stateAt(ev, 0).svg).toBe(0);
    expect(stateAt(ev, PHASE.svgIn).svg).toBe(1);
    expect(stateAt(ev, PHASE.svgOut).svg).toBe(0);
    expect(stateAt(ev, 0.3).tilt).toBe(0);
    expect(stateAt(ev, 1).tilt).toBe(1);
    expect([...stateAt(ev, 1).nodes.values()].filter((s) => s.visible).every((s) => s.rise === 1)).toBe(true);
    // One storey: one camera stop, and the dolly runs to the end.
    for (const t of [0.5, 0.7, 0.9, 1]) expect(stateAt(ev, t).stop).toBe(0);
    expect(stateAt(ev, 0.96).dolly).toBeLessThan(1);
    expect(stateAt(ev, 1).dolly).toBe(1);
  });

  it("pins laneway-house's event table (a replay order change is a decision, not drift)", () => {
    const ev = timeline(meshOf("laneway-house.arch").mesh);
    const digest = createHash("sha256").update(JSON.stringify(ev)).digest("hex");
    expect(digest).toBe(LANEWAY_EVENTS_SHA256);
    expect(keyFrames(ev).map((k) => k.label)).toEqual([
      "stage:brief",
      "stage:rooms",
      "stage:walls",
      "stage:openings",
      "stage:fixtures",
      "drawing",
      "tilted",
      "end",
    ]);
  });
});

const MULTI = ["two-storey.arch", "townhouse.arch", "hillside-villa.arch", "garden-house.arch"];

describe("multi-storey views (D14: each storey on its own, and the storeys combined)", () => {
  for (const name of MULTI) {
    const { src, mesh } = meshOf(name);
    const levels = storeysOf(mesh);
    const isFlat = (k: string) => /\/(slab|floor):/.test(k);

    it(`${name}: the core's pages are the mesh's storeys, in the same order`, () => {
      expect(levels.length, name).toBeGreaterThan(1);
      expect(compile(src, { world: WORLD }).pages?.map((p) => p.level)).toEqual(levels);
    });

    it(`${name}: a storey view's event table holds that storey's nodes, all of them`, () => {
      levels.forEach((level, i) => {
        const ev = timeline(viewMesh(mesh, i + 1));
        expect(ev.map((e) => e.key).sort(), `${name} storey ${i + 1}`).toEqual(
          mesh.nodes
            .filter((x) => x.level === level)
            .map((x) => x.key)
            .sort(),
        );
        // Its footprints are what phase 1 draws, under its own page of the drawing.
        for (const e of ev) if (!e.hidden) expect(e.appear, e.key).toBeLessThan(PHASE.drawn);
        expect(ev.every((e) => e.storey === undefined)).toBe(true);
      });
      expect(() => viewMesh(mesh, levels.length + 1)).toThrow(RangeError);
    });

    it(`${name}: combined, storey k+1 starts only after every node of storey k is fully up`, () => {
      const ev = timeline(viewMesh(mesh, "all"));
      const levelOf = new Map(mesh.nodes.map((x) => [x.key, x.level] as const));
      for (let k = 0; k + 1 < levels.length; k++) {
        const below = ev.filter((e) => !e.hidden && levelOf.get(e.key) === levels[k]);
        const above = ev.filter((e) => !e.hidden && levelOf.get(e.key) === levels[k + 1]);
        const up = Math.max(...below.map((e) => e.riseTo));
        const start = Math.min(...above.map((e) => Math.min(e.appear, e.riseFrom)));
        expect(start, `${name}: storey ${k + 2} after storey ${k + 1}`).toBeGreaterThanOrEqual(up);
        // A lead-in separates them, in which the camera pulls back to frame storeys 1…k+2.
        expect(start - up, name).toBeGreaterThan(0.02);
        expect(stateAt(ev, up).stop).toBe(k);
        expect(stateAt(ev, start).stop).toBe(k + 1);
        // An upper storey's flat footprint is not visible before its storey starts.
        for (const t of [0.2, PHASE.svgIn, start - 1e-6]) {
          const st = stateAt(ev, t);
          for (const e of above) expect(st.nodes.get(e.key)?.visible, `${name} ${e.key} at ${t}`).toBe(false);
        }
        const flats = above.filter((e) => isFlat(e.key));
        expect(flats.length).toBeGreaterThan(0);
        expect(flats.every((e) => stateAt(ev, start).nodes.get(e.key)?.visible)).toBe(true);
      }
      // The camera stops: storey 1 is framed when it is fully up; the last stop is the whole building.
      const end0 = Math.max(...ev.filter((e) => !e.hidden && e.storey === 0).map((e) => e.riseTo));
      expect(stateAt(ev, end0).stop).toBe(0);
      expect(stateAt(ev, end0).dolly).toBe(1);
      expect(stateAt(ev, 1).stop).toBe(levels.length - 1);
    });

    it(`${name}: combined, the storeys are exploded by a gap; a storey view is not`, () => {
      const svg = compile(src, { world: WORLD }).svg;
      const lifts = explodeLifts(mesh);
      expect(levels.map((l) => lifts.get(l))).toEqual(levels.map((_, i) => i * 3000));
      const one = replayPayload(viewMesh(mesh, 2), { title: name, svg });
      expect(one.nodes.every((x) => x.lift === undefined)).toBe(true);
      expect(one.elevation).toBe(30);
      expect(replayPayload(mesh, { title: name, svg }).elevation).toBe(45);
    });
  }

  it("a one-storey plan's combined replay is byte for byte its storey-1 replay", async () => {
    let count = 0;
    for (const [name, src] of EXAMPLES_LIST) {
      const r = adaptPlan(src, { world: WORLD });
      if (!r.ok) continue;
      const mesh = buildMesh(r.scene);
      if (storeysOf(mesh).length !== 1) continue;
      const svg = compile(src, { world: WORLD }).svg;
      expect(JSON.stringify(replayPayload(viewMesh(mesh, 1), { title: name, svg })), name).toBe(
        JSON.stringify(replayPayload(viewMesh(mesh, "all"), { title: name, svg })),
      );
      count++;
    }
    expect(count).toBeGreaterThan(20);
    const { src, mesh } = meshOf("laneway-house.arch");
    const svg = compile(src, { world: WORLD }).svg;
    expect(await replayHtml(viewMesh(mesh, 1), { title: "L", svg })).toBe(
      await replayHtml(viewMesh(mesh, "all"), { title: "L", svg }),
    );
  }, 60_000);
});

describe("the end frame fills the canvas (look notes round 1)", () => {
  const ASPECT = 16 / 9;
  const viewsOf = (mesh: Mesh3D) => ["all" as const, ...storeysOf(mesh).map((_, i) => i + 1)];

  it("the projection is three.js's own (the camera conventions match the viewer's)", () => {
    const { src, mesh } = meshOf("townhouse.arch");
    const p = replayPayload(mesh, { title: "t", svg: compile(src, { world: WORLD }).svg });
    const box = boxOfNodes(p.nodes);
    const orbit = { elevation: p.elevation, azimuth: END_AZIMUTH, fov: END_FOV, aspect: ASPECT };
    const end = fitEndCamera(box, orbit);
    const cam = new PerspectiveCamera(END_FOV, ASPECT, 10, 1e9);
    cam.up.set(0, 1, 0);
    cam.position.set(...cameraPosition(end.target, end.dist, orbit));
    cam.lookAt(new Vector3(...end.target));
    cam.updateMatrixWorld();
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of corners(box)) {
      const v = new Vector3(...c).project(cam);
      xs.push(v.x);
      ys.push(v.y);
    }
    const ours = projectBox(box, end, orbit);
    expect(Math.min(...xs)).toBeCloseTo(ours.x[0], 6);
    expect(Math.max(...xs)).toBeCloseTo(ours.x[1], 6);
    expect(Math.min(...ys)).toBeCloseTo(ours.y[0], 6);
    expect(Math.max(...ys)).toBeCloseTo(ours.y[1], 6);
  });

  it("fills >= 80 % of the binding dimension, unclipped, for every corpus plan and every view", () => {
    let views = 0;
    for (const [name, src] of EXAMPLES_LIST) {
      const r = adaptPlan(src, { world: WORLD });
      if (!r.ok) continue;
      const mesh = buildMesh(r.scene);
      const svg = compile(src, { world: WORLD }).svg;
      for (const v of viewsOf(mesh)) {
        const p = replayPayload(viewMesh(mesh, v), { title: name, svg });
        const box = boxOfNodes(p.nodes);
        const orbit = { elevation: p.elevation, azimuth: END_AZIMUTH, fov: END_FOV, aspect: ASPECT };
        const end = fitEndCamera(box, orbit);
        const pr = projectBox(box, end, orbit);
        expect(coverage(box, end, orbit), `${name} ${v}`).toBeGreaterThanOrEqual(0.8);
        for (const x of [...pr.x, ...pr.y]) expect(Math.abs(x), `${name} ${v}`).toBeLessThanOrEqual(0.95);
        views++;
      }
    }
    expect(views).toBeGreaterThan(34);
  });
});

describe("replay HTML", () => {
  it("is one offline file: inline script and payload, three.js's MIT notice, the preview label, no network", async () => {
    const { src, mesh } = meshOf("laneway-house.arch");
    const html = await replayHtml(mesh, { title: "Laneway House", svg: compile(src, { world: WORLD }).svg });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toMatch(/three\.js 0\.186\.1/);
    expect(html).toMatch(/MIT License/);
    expect(html).toContain(PREVIEW_LABEL);
    expect(html).toContain('id="archlang-replay-payload"');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    // Nothing is LOADED from a network (namespaces and references in strings are not loads).
    expect(html).not.toMatch(
      /(src|href)=["']https?:|url\(\s*["']?https?:|fetch\(\s*["']https?:|import\(\s*["']https?:/i,
    );
    expect(html.length).toBeLessThan(3_000_000);
  }, 60_000);

  it("the viewer's own code reads no clock and no random source (three.js's object UUIDs never reach a frame)", () => {
    const viewer = readFileSync(join(HERE, "../src/replay/viewer.ts"), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(viewer).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now/);
    const timelineSrc = readFileSync(join(HERE, "../src/replay/timeline.ts"), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(timelineSrc).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now|requestAnimationFrame/);
  });
});

const LANEWAY_EVENTS_SHA256 = "38384e98f53d3d7091f8a4a6e8312d6a0d3bc40e44891bbfe3f634bc2256921e";
