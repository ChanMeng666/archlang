import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * CLI integration for the v1.14 Tranche 4 intent surface: `arch validate --intent`
 * (+ `--feedback`) and the `arch score` meter. Spawns the real CLI via the tsx loader
 * (no build) and checks the agent contract: `--json` parses on stdout, the documented
 * exit codes (0 ok · 2 gating violation · 1 IO · 3 usage), the intent/graph blocks
 * compose, and `--feedback` is deterministic. Mirrors `test/cli-structured.test.ts`.
 */

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}
function run(args: string[], input?: string): Run {
  const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// A two-room plan: a Bedroom (with an exterior window) and a Bathroom, sharing a
// partition but with NO interior door between them (so bedroom↔bathroom is not
// adjacent — the advisory-violation fixture), plus a front door on the exterior.
const PLAN = `plan "Home" {
  units mm
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (4000,0) (4000,5000) }
  room id=bed at (0,0) size 4000x5000 label "Bedroom"
  room id=bath at (4000,0) size 4000x5000 label "Bathroom"
  door id=entry at (2000,0) width 900 wall ext
  window id=w1 at (1000,0) width 1200 wall ext
}`;

let dir: string;
const p = (name: string): string => join(dir, name);
const writeJson = (name: string, value: unknown): string => {
  const path = p(name);
  writeFileSync(path, JSON.stringify(value));
  return path;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-intent-"));

  // Everything the brief asks for is present: 2 rooms, a bedroom (with a window), a bathroom.
  writeJson("ok.json", {
    rooms: 2,
    roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }, { concept: "bathroom" }],
  });
  // A gating miss: the brief enumerates 7 rooms, the plan draws 2.
  writeJson("count7.json", { rooms: 7 });
  // Advisory-only miss: every gating assertion holds, but the brief licenses a
  // bedroom↔bathroom door the plan lacks (adjacency scores but never gates).
  writeJson("advisory.json", {
    rooms: 2,
    roomsInclude: [{ concept: "bedroom", windows: { min: 1 } }, { concept: "bathroom" }],
    adjacency: { requiredEdges: { bedroom: ["bathroom"] }, source: "bedroom opens into the bathroom" },
  });
  // A gating window miss: the bathroom has no window.
  writeJson("bathwin.json", { roomsInclude: [{ concept: "bathroom", windows: { min: 1 } }] });
  // Two violations (count + window) for the feedback-determinism fixture.
  writeJson("two-fail.json", { rooms: 7, roomsInclude: [{ concept: "bathroom", windows: { min: 1 } }] });
  // A partial intent for the score meter: room-count passes, the bathroom-window fails.
  writeJson("partial.json", { rooms: 2, roomsInclude: [{ concept: "bathroom", windows: { min: 1 } }] });
  // Shape errors: an unknown top-level key, and an areaM2 missing its `source`.
  writeJson("unknown-key.json", { rooms: 2, bogus: true });
  writeJson("no-source.json", { roomsInclude: [{ concept: "bedroom", areaM2: { min: 10 } }] });
  // A bare empty adjacency graph (matches the plan — the two rooms are unconnected),
  // for the --graph + --intent composition test.
  writeJson("graph-empty.json", { bed: [], bath: [] });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("arch validate --intent", () => {
  it("passes (exit 0) when every gating assertion holds; intent.ok, satisfied === total", () => {
    const r = run(["validate", "-", "--intent", p("ok.json"), "--json"], PLAN);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.intent.ok).toBe(true);
    expect(j.intent.satisfied).toBe(j.intent.total);
    expect(j.intent.violations).toEqual([]);
    expect(j.intent.subscores).toHaveProperty("rooms");
  }, 30000);

  it("fails (exit 2) on a gating room-count miss with E_INTENT_ROOM_COUNT naming the path + fact", () => {
    const r = run(["validate", "-", "--intent", p("count7.json"), "--json"], PLAN);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.intent.ok).toBe(false);
    const v = j.intent.violations.find((x: { code: string }) => x.code === "E_INTENT_ROOM_COUNT");
    expect(v).toBeDefined();
    expect(v.gate).toBe(true);
    expect(v.message).toContain("/rooms");
    expect(v.message).toContain("7");
    expect(v.message).toContain("got 2");
  }, 30000);

  it("passes (exit 0) on an advisory-only adjacency miss; the violation is listed with gate:false", () => {
    const r = run(["validate", "-", "--intent", p("advisory.json"), "--json"], PLAN);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.intent.ok).toBe(true);
    const v = j.intent.violations.find((x: { code: string }) => x.code === "E_INTENT_NOT_ADJACENT");
    expect(v).toBeDefined();
    expect(v.gate).toBe(false);
  }, 30000);

  it("fails (exit 2) on a gating window miss with E_INTENT_NO_WINDOW", () => {
    const r = run(["validate", "-", "--intent", p("bathwin.json"), "--json"], PLAN);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.intent.ok).toBe(false);
    expect(j.intent.violations.some((x: { code: string }) => x.code === "E_INTENT_NO_WINDOW")).toBe(true);
  }, 30000);

  it("--feedback appends a deterministic prompt per violation (identical across runs)", () => {
    const once = run(["validate", "-", "--intent", p("two-fail.json"), "--feedback", "--json"], PLAN);
    const twice = run(["validate", "-", "--intent", p("two-fail.json"), "--feedback", "--json"], PLAN);
    expect(once.status).toBe(2);
    const j1 = JSON.parse(once.stdout);
    const j2 = JSON.parse(twice.stdout);
    expect(Array.isArray(j1.intent.feedback)).toBe(true);
    expect(j1.intent.feedback).toHaveLength(j1.intent.violations.length);
    expect(j1.intent.feedback).toHaveLength(2);
    expect(j1.intent.feedback).toEqual(j2.intent.feedback);
  }, 30000);

  it("is a usage error (exit 3) on a bad-shape intent, naming the JSON path on stderr", () => {
    const r = run(["validate", "-", "--intent", p("unknown-key.json"), "--json"], PLAN);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("/bogus");
    expect(r.stderr).toContain("unknown key");
  }, 30000);

  it("is a usage error (exit 3) when a band omits its required source", () => {
    const r = run(["validate", "-", "--intent", p("no-source.json"), "--json"], PLAN);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("/roomsInclude/0/areaM2/source");
  }, 30000);

  it("is an IO error (exit 1) when the intent file cannot be read", () => {
    const r = run(["validate", "-", "--intent", p("does-not-exist.json"), "--json"], PLAN);
    expect(r.status).toBe(1);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
  }, 30000);

  it("composes with --graph: both the graph{} and intent{} blocks appear", () => {
    const r = run(["validate", "-", "--graph", p("graph-empty.json"), "--intent", p("ok.json"), "--json"], PLAN);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.graph).toBeDefined();
    expect(j.intent).toBeDefined();
    expect(j.intent.ok).toBe(true);
    expect(j.graph.ok).toBe(true);
  }, 30000);
});

describe("arch score", () => {
  it("scores a fully satisfied intent 1.0 and exits 0", () => {
    const r = run(["score", "-", "--brief", p("ok.json"), "--json"], PLAN);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.score).toBe(1);
    expect(j.satisfied).toBe(j.total);
  }, 30000);

  it("measures a partial intent (exit 0 even though a gating assertion fails)", () => {
    const r = run(["score", "-", "--brief", p("partial.json"), "--json"], PLAN);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.satisfied).toBeLessThan(j.total);
    // score is the satisfied fraction, rounded to 4 decimals.
    expect(j.score).toBe(Math.round((j.satisfied / j.total) * 10000) / 10000);
    // the failing window assertion still gates ok (but never the exit code).
    expect(j.ok).toBe(false);
  }, 30000);

  it("is a usage error (exit 3) when --brief is missing", () => {
    const r = run(["score", "-", "--json"], PLAN);
    expect(r.status).toBe(3);
  }, 30000);
});
