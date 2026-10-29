/**
 * The replay's metrics strip (card G4), light half: the facts are the core's own `describe()` and
 * `lint()` numbers, each shows when its stage is reached, the wording stays plain, and the replay
 * HTML carries the strip as a DOM layer (never drawn into the canvas, so the key-frame pixel
 * hashes cannot move; `e2e/replay.e2e.ts` proves that in a browser).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, describe as describePlan, lint } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { adaptPlan, buildMesh, PHASE, replayFacts, stripAt, timeline, viewMesh } from "../src/index.js";
import type { ReplayFacts } from "../src/index.js";
import { replayHtml, replayPayload } from "../src/node.js";
import { EXAMPLES_LIST, WORLD } from "./corpus.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const srcOf = (name: string) => EXAMPLES_LIST.find(([n]) => n === name)?.[1] ?? "";
const meshOf = (name: string) => {
  const r = adaptPlan(srcOf(name), { world: WORLD });
  if (!r.ok) throw new Error(r.refusal.code);
  return buildMesh(r.scene);
};
const texts = (f: ReplayFacts, name: string, t: number) => stripAt(f, timeline(meshOf(name)), t).map((i) => i.text);

describe("replayFacts", () => {
  it("reads laneway-house's numbers from describe() and lint(), nothing of its own", () => {
    const src = srcOf("laneway-house.arch");
    const d = describePlan(src, { world: WORLD });
    const f = replayFacts(src, { world: WORLD }) as ReplayFacts;
    expect(f).toEqual({
      rooms: d.totals.rooms,
      doors: d.totals.doors,
      windows: d.totals.windows,
      areaCentre: d.totals.floor_area_m2,
      areaNet: d.totals.net_floor_area_m2,
      warnings: lint(src, { world: WORLD }).filter((x) => x.severity === "warning").length,
    });
    expect(f.storeys).toBeUndefined();
  });

  it("two-storey: the combined view sums the storeys, a storey view reads its own", () => {
    const src = srcOf("two-storey.arch");
    const d = describePlan(src, { world: WORLD });
    const levels = d.levels ?? [];
    expect(levels.length).toBe(2);
    const all = replayFacts(src, { world: WORLD }) as ReplayFacts;
    expect(all.storeys).toBe(2);
    expect(all.rooms).toBe(levels.reduce((a, l) => a + l.totals.rooms, 0));
    expect(all.doors).toBe(levels.reduce((a, l) => a + l.totals.doors, 0));
    expect(all.areaCentre).toBeCloseTo(
      levels.reduce((a, l) => a + l.totals.floor_area_m2, 0),
      2,
    );
    const two = replayFacts(src, { world: WORLD, view: 2 }) as ReplayFacts;
    expect(two.storeys).toBeUndefined();
    expect(two.rooms).toBe(levels[1]?.totals.rooms);
    expect(two.areaNet).toBe(levels[1]?.totals.net_floor_area_m2);
  });

  it("is undefined for a plan the core does not resolve", () => {
    expect(replayFacts("room a at (0,0) size", { world: WORLD })).toBeUndefined();
  });
});

describe("stripAt", () => {
  const facts: ReplayFacts = { rooms: 3, doors: 1, windows: 4, areaCentre: 48.75, areaNet: 45.05, warnings: 0 };

  it("shows each number when its stage is reached, and never takes one back", () => {
    const events = timeline(meshOf("laneway-house.arch"));
    const first = (stage: string) =>
      Math.min(...events.filter((e) => e.stage === stage && !e.hidden).map((e) => e.appear));
    const at = (t: number) => stripAt(facts, events, t).map((i) => i.id);
    expect(at(0)).toEqual([]);
    expect(at(first("rooms"))).toEqual(["rooms", "area-net", "area-centre"]);
    expect(at(first("openings") - 1e-6)).not.toContain("doors");
    expect(at(first("openings"))).toEqual(["rooms", "area-net", "area-centre", "doors", "windows"]);
    expect(at(PHASE.svgIn - 1e-6)).not.toContain("warnings");
    expect(at(PHASE.svgIn)).toEqual(["rooms", "area-net", "area-centre", "doors", "windows", "warnings"]);
    let seen = 0;
    for (let i = 0; i <= 200; i++) {
      const n = at(i / 200).length;
      expect(n).toBeGreaterThanOrEqual(seen);
      seen = n;
    }
  });

  it("labels each area with its convention and uses plain words", () => {
    expect(texts(facts, "laneway-house.arch", 1)).toEqual([
      "3 rooms",
      "floor area 45.05 m² (net)",
      "floor area 48.75 m² (to wall centre lines)",
      "1 door",
      "4 windows",
      "no warnings",
    ]);
    expect(texts({ ...facts, areaNet: undefined, warnings: 2, storeys: 1 }, "laneway-house.arch", 1)).toEqual([
      "1 storey",
      "3 rooms",
      "floor area 48.75 m² (to wall centre lines)",
      "1 door",
      "4 windows",
      "2 warnings",
    ]);
    // The growth bans: no score, no pass counts, no percentages, no verdict words.
    const all = texts({ ...facts, storeys: 2, warnings: 3 }, "laneway-house.arch", 1).join(" ");
    expect(all).not.toMatch(/score|pass|%|clash|verified|compliant|checks?\b/i);
  });

  it("is a pure function of the facts, the events and t", () => {
    const events = timeline(meshOf("two-storey.arch"));
    expect(stripAt(facts, events, 0.7)).toEqual(stripAt(facts, events, 0.7));
    const src = readFileSync(join(HERE, "../src/replay/strip.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now|requestAnimationFrame/);
  });
});

describe("the replay HTML carries the strip as a DOM layer", () => {
  it("has a strip element and its facts only when given facts; the canvas is the same either way", async () => {
    const src = srcOf("laneway-house.arch");
    const mesh = meshOf("laneway-house.arch");
    const svg = compile(src, { world: WORLD }).svg;
    const facts = replayFacts(src, { world: WORLD }) as ReplayFacts;
    const bare = await replayHtml(mesh, { title: "L", svg });
    const withFacts = await replayHtml(mesh, { title: "L", svg, facts });
    expect(bare).not.toContain('id="archlang-replay-strip"');
    expect(withFacts).toContain('id="archlang-replay-strip"');
    expect(withFacts).toContain('id="archlang-replay-stage"');
    // The payload gains only `facts`: the geometry and the event table are untouched.
    const a = replayPayload(mesh, { title: "L", svg });
    const b = replayPayload(mesh, { title: "L", svg, facts });
    expect({ ...b, facts: undefined }).toEqual({ ...a, facts: undefined });
    expect(b.facts).toEqual(facts);
    expect(replayPayload(viewMesh(mesh, 1), { title: "L", svg }).events).toEqual(a.events);
  }, 60_000);
});
