// Import the core straight from source (not the bare `archlang` specifier, which at
// the repo root resolves to the vscode extension bundle and lacks new exports like
// `diagnosticToJson`) so `tsc` typechecks this file cleanly without the Vite alias.
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, diagnosticToJson } from "../../src/index.js";
import { buildLlmPrompt } from "../src/llm-prompt.js";

const STUDIO = `plan "Studio" {
  units mm
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r1 at (0,0) size 5000x4000 label "Living" uses living
  door id=d1 at (1000,0) width 900 wall exterior hinge left swing in
}`;

/** Assemble a prompt for a source the same way the button does. */
function promptFor(source: string): string {
  const facts = describePlan(source);
  const { diagnostics } = compile(source);
  return buildLlmPrompt({
    source,
    facts,
    diagnostics: (diagnostics ?? []).map((d) => diagnosticToJson(source, d)),
  });
}

describe("buildLlmPrompt", () => {
  it("includes the intro, the source in an ```arch fence, and the spec pointer", () => {
    const out = promptFor(STUDIO);
    expect(out).toContain("This is an ArchLang floor plan");
    expect(out).toContain("```arch");
    expect(out).toContain('room id=r1 at (0,0) size 5000x4000 label "Living" uses living');
    expect(out).toContain("npx @chanmeng666/archlang spec");
    expect(out).toContain("https://archlang.uk/spec");
  });

  it("embeds a compact facts JSON block with rooms and an access summary", () => {
    const out = promptFor(STUDIO);
    expect(out).toContain("## Facts (from `describe`)");
    const json = out.slice(out.indexOf("```json") + 7, out.indexOf("```", out.indexOf("```json") + 7));
    const facts = JSON.parse(json);
    expect(facts.plan).toBe("Studio");
    expect(facts.units).toBe("mm");
    expect(facts.totals.rooms).toBe(1);
    expect(facts.rooms.map((r: { label?: string }) => r.label)).toEqual(["Living"]);
    // rooms carry area/uses/adjacency; access summarises entrance + reachability.
    expect(facts.rooms[0]).toHaveProperty("area_m2");
    expect(facts.rooms[0]).toHaveProperty("adjacent");
    expect(facts.access).toHaveProperty("hasEntrance");
    expect(facts.access).toHaveProperty("unreachable");
  });

  it("says the plan is clean when there are no diagnostics", () => {
    const out = promptFor(STUDIO);
    expect(out).toContain("## Diagnostics");
    expect(out).toContain("None — the plan compiles clean.");
  });

  it("lists each diagnostic with severity, code, line:col and its catalogued fix", () => {
    // A bad size triggers a catalogued error with a fix.
    const bad = `plan "X" {\n  units mm\n  room at (0,0) size 0x0\n}`;
    const out = promptFor(bad);
    expect(out).toMatch(/- \[(error|warning)\] E_\w+ at \d+:\d+ —/);
    expect(out).toContain("fix:");
    expect(out).not.toContain("None — the plan compiles clean.");
  });

  it("is deterministic — the same plan yields byte-identical output", () => {
    expect(promptFor(STUDIO)).toBe(promptFor(STUDIO));
  });
});
