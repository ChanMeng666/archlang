import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, extractJson } from "../eval/g1/generate.js";
import { loadCorpus } from "../eval/run.js";
import { CONCEPTS } from "../eval/synonyms.js";

/**
 * Gate G1 intent-generation harness — offline guards. These pin the two contracts the
 * generator must honour: the user message is the brief verbatim (no smuggled framing), and
 * the system prompt is oracle-isolated — it leaks no `expect` block, no golden source, and
 * none of the eval's private concept vocabulary that the scorer alone should hold.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const corpus = loadCorpus();
const system = buildSystemPrompt();
const systemLower = system.toLowerCase();

describe("G1 generate — the user prompt is the brief verbatim", () => {
  for (const entry of corpus) {
    it(`${entry.id}: buildUserPrompt returns entry.prompt unchanged`, () => {
      expect(buildUserPrompt(entry)).toBe(entry.prompt);
    });
  }
});

describe("G1 generate — oracle isolation of the system prompt", () => {
  it("quotes no `expect`-block source string from any brief", () => {
    for (const entry of corpus) {
      const e = entry.expect;
      if (e.totalAreaM2) expect(system).not.toContain(e.totalAreaM2.source);
      for (const inc of e.roomsInclude ?? []) {
        if (inc.areaM2) expect(system).not.toContain(inc.areaM2.source);
      }
      if (e.adjacency) expect(system).not.toContain(e.adjacency.source);
    }
  });

  it("includes no golden `.arch` source", () => {
    for (const entry of corpus) {
      const golden = readFileSync(resolve(ROOT, entry.golden), "utf8");
      const head = golden.replace(/\s+/g, "").slice(0, 60);
      expect(system).not.toContain(head);
    }
  });

  it("leaks no oracle-only room vocabulary (labels absent from every corpus brief)", () => {
    const prompts = corpus.map((e) => e.prompt.toLowerCase());
    const oracleOnly = new Set<string>();
    for (const concept of Object.values(CONCEPTS)) {
      for (const label of concept.labels) {
        const l = label.toLowerCase();
        if (!prompts.some((p) => p.includes(l))) oracleOnly.add(l);
      }
    }
    for (const label of oracleOnly) expect(systemLower).not.toContain(label);
  });

  it("names no private-vocabulary module in its source (isolation is structural)", () => {
    const src = readFileSync(resolve(ROOT, "eval/g1/generate.ts"), "utf8");
    expect(src).not.toMatch(/synonyms/);
  });
});

describe("G1 generate — extractJson", () => {
  it("returns bare JSON untouched", () => {
    expect(extractJson('{"rooms": 3}')).toBe('{"rooms": 3}');
  });

  it("strips a ```json fenced block", () => {
    expect(extractJson('```json\n{"rooms": 3}\n```')).toBe('{"rooms": 3}');
  });

  it("strips a bare ``` fenced block", () => {
    expect(extractJson('```\n{"rooms": 3}\n```')).toBe('{"rooms": 3}');
  });
});

describe("G1 generate — the worked example is not a corpus brief", () => {
  it("embeds no corpus prompt in the system prompt", () => {
    for (const entry of corpus) expect(system).not.toContain(entry.prompt);
  });
});
