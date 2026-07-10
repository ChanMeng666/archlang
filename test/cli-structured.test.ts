import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * CLI integration for the T3 structured-IO commands: `arch ast`,
 * `arch compile --from-json`, `arch validate --graph`, and `arch complete`.
 * Spawns the real CLI via the tsx loader (no build) and checks the agent
 * contract: `--json` parses on stdout, exit codes match the documented
 * convention (0 ok · 2 user-source · 3 usage), stdin (`-`) streams, and the
 * `--graph` file arg is read from disk.
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

// A minimal but complete Plan JSON (RPLAN shape) for `--from-json`.
const PLAN_JSON = JSON.stringify({
  version: 1,
  plan: "P",
  units: "mm",
  rooms: [{ id: "r", room_type: "Room", x: 0, y: 0, width: 4000, height: 3000, label: "R" }],
  walls: [],
  openings: [],
  furniture: [],
});

// A two-room plan with an interior door on the partition (a↔b) plus a front door.
const TWO_ROOM = `plan "G" {
  units mm
  wall id=ext exterior thickness 200 { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall id=part partition thickness 100 { (4000,0) (4000,5000) }
  room id=a at (0,0) size 4000x5000 label "A"
  room id=b at (4000,0) size 4000x5000 label "B"
  door id=d1 at (4000,2500) width 900 wall part
  door id=entry at (2000,0) width 900 wall ext
}`;

const SIMPLE = 'plan "P" { units mm room at (0,0) size 4000x3000 label "R" }';

describe("arch ast", () => {
  it("`ast - --json` prints the span-bearing AST, exit 0", () => {
    const r = run(["ast", "-", "--json"], SIMPLE);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.ast.kind).toBe("plan");
    expect(j.ast.name).toBe("P");
    expect(Array.isArray(j.ast.body)).toBe(true);
    // A room node carries its expression tree unexpanded (span-bearing projection).
    expect(j.ast.body[0].kind).toBe("room");
  }, 30000);

  it("non-json mode pretty-prints the same AST JSON to stdout", () => {
    const r = run(["ast", "-"], SIMPLE);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.kind).toBe("plan");
    expect(j.name).toBe("P");
  }, 30000);

  it("still emits a partial AST and exits 2 on a parse error", () => {
    // Unterminated plan block — the parser recovers with a PlanNode.
    const r = run(["ast", "-", "--json"], 'plan "P" { units mm room at (0,0) size 4000x3000 label "R"');
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.ast).toBeDefined();
    expect(j.diagnostics.length).toBeGreaterThan(0);
  }, 30000);
});

describe("arch compile --from-json", () => {
  it("`compile - --from-json -o -` compiles Plan JSON to SVG on stdout, exit 0", () => {
    const r = run(["compile", "-", "--from-json", "-o", "-"], PLAN_JSON);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("<svg");
  }, 30000);

  it("`--json` carries the describe() summary of the converted plan", () => {
    const dir = mkdtempSync(join(tmpdir(), "arch-fromjson-"));
    const out = join(dir, "out.svg");
    const r = run(["compile", "-", "--from-json", "-o", out, "--json"], PLAN_JSON);
    rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.summary.plan).toBe("P");
    expect(j.summary.totals.rooms).toBe(1);
  }, 30000);

  it("reports E_JSON_SCHEMA and exits 2 on a bad-shape Plan JSON", () => {
    const bad = '{"plan":"x","rooms":[{"x":"nope"}],"walls":[],"openings":[],"furniture":[]}';
    const r = run(["compile", "-", "--from-json", "--json"], bad);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.diagnostics.some((d: { code: string }) => d.code === "E_JSON_SCHEMA")).toBe(true);
  }, 30000);

  it("exits 2 on malformed JSON syntax", () => {
    const r = run(["compile", "-", "--from-json", "--json"], "{ not json ]");
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.diagnostics[0].message).toContain("invalid JSON");
  }, 30000);
});

describe("arch validate --graph", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "arch-graph-"));
    writeFileSync(join(dir, "match.json"), '{"a":["b"]}');
    writeFileSync(join(dir, "wrap.json"), '{"input_graph":{"a":["b"]}}');
    writeFileSync(join(dir, "extra.json"), '{"a":[]}');
    writeFileSync(join(dir, "missing.json"), '{"a":["ghost"]}');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("passes (exit 0) when the intended graph matches the plan's adjacency", () => {
    const r = run(["validate", "-", "--graph", join(dir, "match.json"), "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(j.graph.ok).toBe(true);
    expect(j.graph.missing_connections).toEqual([]);
    expect(j.graph.extra_connections).toEqual([]);
  }, 30000);

  it("accepts the `{ input_graph: {…} }` wrapper form", () => {
    const r = run(["validate", "-", "--graph", join(dir, "wrap.json"), "--json"], TWO_ROOM);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).graph.ok).toBe(true);
  }, 30000);

  it("fails (exit 2) with extra_connections when the plan has an unrequested door", () => {
    const r = run(["validate", "-", "--graph", join(dir, "extra.json"), "--json"], TWO_ROOM);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(false);
    expect(j.graph.ok).toBe(false);
    expect(j.graph.extra_connections).toEqual([["a", "b"]]);
  }, 30000);

  it("reports missing_rooms for an intent naming a room not in the plan", () => {
    const r = run(["validate", "-", "--graph", join(dir, "missing.json"), "--json"], TWO_ROOM);
    expect(r.status).toBe(2);
    const j = JSON.parse(r.stdout);
    expect(j.graph.missing_rooms).toContain("ghost");
  }, 30000);

  it("is a usage error (exit 3) when the graph file cannot be parsed", () => {
    writeFileSync(join(dir, "broken.json"), "{ not json");
    const r = run(["validate", "-", "--graph", join(dir, "broken.json"), "--json"], TWO_ROOM);
    expect(r.status).toBe(3);
  }, 30000);
});

describe("arch complete", () => {
  it("`complete - --at <n> --json` returns in-scope items, exit 0", () => {
    const r = run(["complete", "-", "--at", "15", "--json"], SIMPLE);
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j.ok).toBe(true);
    expect(Array.isArray(j.items)).toBe(true);
    expect(j.items.length).toBeGreaterThan(0);
    // Every item carries a label and a completion kind.
    expect(j.items[0]).toHaveProperty("label");
    expect(j.items[0]).toHaveProperty("kind");
    // The element and keyword catalogs are always in scope.
    expect(j.items.some((i: { label: string }) => i.label === "room")).toBe(true);
  }, 30000);

  it("is a usage error (exit 3) when --at is missing", () => {
    const r = run(["complete", "-", "--json"], SIMPLE);
    expect(r.status).toBe(3);
  }, 30000);

  it("is a usage error (exit 3) when --at is not a number", () => {
    const r = run(["complete", "-", "--at", "abc", "--json"], SIMPLE);
    expect(r.status).toBe(3);
  }, 30000);
});
