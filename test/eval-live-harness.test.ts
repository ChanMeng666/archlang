/** Live-eval harness, offline: price table, stop/finish-reason capture (fetch mocked, no network). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveLedger, isTruncationStop, makeAuthor, renderResults } from "../eval/run.js";
import type { Score } from "../eval/run.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("--budget usd prices", () => {
  const rows: [string, number, number][] = [
    ["claude-opus-5-5", 4, 20],
    ["claude-sonnet-5-5", 2, 10],
    ["claude-haiku-5-5", 0.5, 2.5],
    ["claude-fable-5-2", 8, 40],
    ["claude-fable-5-1", 10, 50],
  ];
  for (const [model, input, output] of rows) {
    it(`${model} is priced`, () => {
      const l = new LiveLedger(model);
      expect(l.priceKnown).toBe(true);
      l.record({ input: 1_000_000, output: 1_000_000 });
      expect(l.usd()).toBeCloseTo(input + output, 6);
    });
  }
  it("an unknown model stays token-only", () => {
    expect(new LiveLedger("claude-nope").priceKnown).toBe(false);
  });
});

describe("stop reason capture", () => {
  const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

  it("records Anthropic stop_reason", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ content: [{ type: "text", text: "```arch\nplan\n```" }], stop_reason: "max_tokens" })),
    );
    const ledger = new LiveLedger("claude-sonnet-5-5");
    const text = await makeAuthor("anthropic", "claude-sonnet-5-5", ledger)("brief");
    expect(text).toBe("plan");
    expect(ledger.lastStop).toBe("max_tokens");
    expect(ledger.stops.get("max_tokens")).toBe(1);
  });

  it("records OpenAI finish_reason", async () => {
    vi.stubEnv("OPENAI_API_KEY", "k");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ choices: [{ message: { content: "x" }, finish_reason: "length" }] })),
    );
    const ledger = new LiveLedger("gpt-5.5-2026-04-23");
    await makeAuthor("openai", "gpt-5.5-2026-04-23", ledger)("brief");
    expect(ledger.lastStop).toBe("length");
  });

  it("truncation predicate", () => {
    expect(isTruncationStop("max_tokens")).toBe(true);
    expect(isTruncationStop("length")).toBe(true);
    expect(isTruncationStop("end_turn")).toBe(false);
    expect(isTruncationStop("stop")).toBe(false);
  });

  const row = (id: string): Score => ({
    id,
    valid: false,
    lintWarnings: 0,
    physicalWarnings: 0,
    semanticPass: false,
    failures: ["compile: x"],
  });
  const summary = { total: 2, valid: 0, semanticPass: 0, sound: 0 };

  it("scorecard shows stops and a truncation count only when given", () => {
    const rs = [row("a"), row("b")];
    const withStops = renderResults(rs, summary, "live", undefined, {
      stops: new Map([
        ["a", "max_tokens"],
        ["b", "end_turn"],
      ]),
    });
    expect(withStops).toContain("compile: x; stop: max_tokens");
    expect(withStops).toContain("stop: end_turn");
    expect(withStops).toContain("stop):** 1/2");
    const plain = renderResults(rs, summary, "offline");
    expect(plain).not.toContain("stop:");
    expect(plain).not.toContain("Truncated");
  });
});
