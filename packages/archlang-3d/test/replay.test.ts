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
import { adaptPlan, buildMesh, keyFrames, PHASE, stateAt, timeline } from "../src/index.js";
import { PREVIEW_LABEL, replayHtml } from "../src/node.js";
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

  it("draws every footprint in phase 1, raises walls with their openings, then fixtures and furniture", () => {
    for (const { n, mesh } of all) {
      const ev = timeline(mesh);
      const byKey = new Map(ev.map((e) => [e.key, e] as const));
      for (const e of ev.filter((x) => !x.hidden)) expect(e.appear, n).toBeLessThan(PHASE.drawn);
      for (const nd of mesh.nodes) {
        const e = byKey.get(nd.key);
        if (!e || e.hidden) continue;
        const within = (a: number, b: number) => e.riseFrom >= a - 1e-9 && e.riseTo <= b + 1e-9;
        if (nd.kind === "wall") expect(within(PHASE.rise, PHASE.wallsUp), `${n} ${nd.key}`).toBe(true);
        if (nd.kind === "furniture") expect(within(PHASE.wallsUp, PHASE.done), `${n} ${nd.key}`).toBe(true);
        if (nd.kind === "door" || nd.kind === "window") {
          const host = byKey.get(`L${nd.level}/wall:${String(nd.extras.host)}`);
          if (host)
            expect([e.riseFrom, e.riseTo], `${n} ${nd.key} rises with its wall`).toEqual([host.riseFrom, host.riseTo]);
        }
      }
      expect(
        ev.filter((e) => mesh.nodes.find((x) => x.key === e.key)?.kind === "roof").every((e) => e.hidden),
        n,
      ).toBe(true);
    }
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
