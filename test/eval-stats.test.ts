/** wilson95; live report intervals. */

import { describe, expect, it } from "vitest";
import { wilson95 } from "../eval/stats.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JUDGE_VERSION } from "../eval/assertions.js";
import {
  liveDeltaSection,
  parseBaseline,
  promptHashes,
  readBaseline,
  renderDelta,
  renderResults,
  sha256Text,
  systemPrompt,
} from "../eval/run.js";
import type { Score } from "../eval/run.js";
import { sha256 } from "./helpers/digest.js";

describe("wilson95", () => {
  const near = (k: number, n: number, lo: number, hi: number): void => {
    const w = wilson95(k, n);
    expect(w.lo).toBeCloseTo(lo, 4);
    expect(w.hi).toBeCloseTo(hi, 4);
  };

  it("matches known values", () => {
    near(23, 26, 0.7102, 0.96);
    near(14, 26, 0.3546, 0.7124);
    near(3, 26, 0.04, 0.2898);
  });

  it("edges never produce NaN and stay inside [0, 1]", () => {
    expect(wilson95(0, 0)).toEqual({ lo: 0, hi: 1 });
    const none = wilson95(0, 10);
    expect(none.lo).toBe(0);
    expect(none.hi).toBeCloseTo(0.2775, 4);
    const all = wilson95(10, 10);
    expect(all.hi).toBe(1);
    expect(all.lo).toBeCloseTo(0.7225, 4);
    for (const [k, n] of [
      [0, 0],
      [0, 1],
      [1, 1],
      [5, 10],
      [26, 26],
    ] as const) {
      const w = wilson95(k, n);
      expect(Number.isNaN(w.lo) || Number.isNaN(w.hi)).toBe(false);
      expect(w.lo).toBeGreaterThanOrEqual(0);
      expect(w.hi).toBeLessThanOrEqual(1);
      expect(w.lo).toBeLessThanOrEqual(w.hi);
    }
  });
});

describe("live report intervals", () => {
  const row = (id: string, ok: boolean): Score => ({
    id,
    valid: true,
    lintWarnings: 0,
    physicalWarnings: 0,
    semanticPass: ok,
    failures: ok ? [] : ["x"],
  });
  const results = [row("a", true), row("b", true), row("c", false)];
  const summary = { total: 3, valid: 3, semanticPass: 2, sound: 3 };

  it("ci mode (default) is unchanged — no interval text", () => {
    const md = renderResults(results, summary, "offline");
    expect(md).not.toContain("Wilson");
    expect(md).toContain("- **Valid (compiles):** 3/3 (100%)\n");
    expect(md).toContain("- **Intent match (semantic):** 2/3 (67%)\n");
    expect(renderResults(results, summary, "offline", undefined, {})).toBe(md);
  });

  it("live mode prints k/n with a Wilson 95 % interval beside every rate", () => {
    const md = renderResults(results, summary, "live (x)", undefined, {
      intervals: true,
    });
    expect(md).toContain("- **Valid (compiles):** 3/3 (100%; Wilson 95 % 43–100 %)");
    expect(md).toContain("- **Intent match (semantic):** 2/3 (67%; Wilson 95 % 20–94 %)");
    expect(md).toContain("- **Sound (lint-clean):** 3/3 (100%; Wilson 95 % 43–100 %)");
  });

  it("the delta carries intervals only when asked, and keeps the judge warning", () => {
    const base = { total: 3, valid: 3, semanticPass: 1, sound: 3, judge: "0" };
    const plain = renderDelta(base, summary);
    expect(plain).not.toContain("Wilson");
    const live = renderDelta(base, summary, { intervals: true });
    expect(live).toContain("baseline 1/3 (Wilson 95 %");
    expect(live).toContain("now 2/3 (Wilson 95 % 20–94 %)");
    expect(live).toContain("are NOT comparable");
    expect(plain).toContain("are NOT comparable");
  });
});

describe("renderDelta prompt hashes (EV.3)", () => {
  const summary = { total: 3, valid: 3, semanticPass: 2, sound: 3 };
  const prompt = "a".repeat(64);
  const corpus = "b".repeat(64);
  const base = {
    total: 3,
    valid: 3,
    semanticPass: 1,
    sound: 3,
    judge: JUDGE_VERSION,
  };
  const hashed = { ...base, promptSha256: prompt, corpusSha256: corpus };
  const HASH_LINE = `This run's prompt: \`promptSha256\` ${prompt} · \`corpusSha256\` ${corpus}.`;
  const UNVERIFIED = "comparability unverified";

  it("matching hashes add only the hash line: byte-equal to the delta without hashes", () => {
    const md = renderDelta(hashed, summary, { prompt: { prompt, corpus } });
    const without = renderDelta(hashed, summary);
    const anchor = `Against \`eval/live-baseline.json\` (recorded run).\n`;
    expect(without).toContain(anchor);
    expect(md).toBe(without.replace(anchor, `${anchor}\n${HASH_LINE}\n`));
  });

  it("a differing prompt hash is NOT comparable, naming only that hash, as a prompt change", () => {
    const md = renderDelta({ ...hashed, promptSha256: "c".repeat(64) }, summary, { prompt: { prompt, corpus } });
    expect(md).toContain(`(SHA-256: \`promptSha256\` ${"c".repeat(12)} → ${"a".repeat(12)})`);
    expect(md).toContain("span a prompt change and are NOT comparable");
    expect(md).not.toMatch(/`corpusSha256` [0-9a-f]{12} →/);
    expect(md).not.toContain(UNVERIFIED);
  });

  it("a differing corpus hash alone is NOT comparable as a corpus change, never a prompt one", () => {
    const md = renderDelta({ ...hashed, corpusSha256: "d".repeat(64) }, summary, { prompt: { prompt, corpus } });
    expect(md).toContain(
      `> ⚠ Baseline corpus ≠ this run's corpus (SHA-256: \`corpusSha256\` ${"d".repeat(12)} → ${"b".repeat(12)}) — these deltas span a corpus change and are NOT comparable.`,
    );
    expect(md).not.toContain("Baseline prompt");
    expect(md).not.toContain("prompt change");
  });

  it("both hashes differing names the prompt and the corpus", () => {
    const md = renderDelta({ ...hashed, promptSha256: "c".repeat(64), corpusSha256: "d".repeat(64) }, summary, {
      prompt: { prompt, corpus },
    });
    expect(md).toContain("> ⚠ Baseline prompt and corpus ≠ this run's prompt and corpus (SHA-256: `promptSha256`");
    expect(md).toContain("span a prompt and corpus change and are NOT comparable");
  });

  it("a baseline without hashes is unverified, never called not comparable", () => {
    const md = renderDelta(base, summary, { prompt: { prompt, corpus } });
    expect(md).toContain(`> Baseline records no \`promptSha256\` or \`corpusSha256\` hash; ${UNVERIFIED}.`);
    expect(md).not.toContain("NOT comparable");
    expect(md).toContain(HASH_LINE);
  });

  it("without the run's hashes the delta is byte-identical to the pre-EV.3 one", () => {
    expect(renderDelta(base, summary)).toBe(
      [
        "",
        "## Delta vs baseline",
        "",
        "Against `eval/live-baseline.json` (recorded run).",
        "",
        "- **Valid (compiles):** 3 → 3 (0)",
        "- **Intent match (semantic):** 1 → 2 (+1)",
        "- **Sound (lint-clean):** 3 → 3 (0)",
        "",
        "",
        "",
      ].join("\n"),
    );
  });

  it("with no baseline the live section still prints this run's hashes", () => {
    const md = liveDeltaSection(null, summary, { prompt, corpus });
    expect(md).toContain(HASH_LINE);
    expect(md).toContain("No `eval/live-baseline.json`");
    expect(liveDeltaSection(hashed, summary, { prompt, corpus })).toBe(
      renderDelta(hashed, summary, {
        intervals: true,
        prompt: { prompt, corpus },
      }),
    );
  });

  it("the live run hashes what it sends and reads the baseline before the first call", () => {
    const src = readFileSync(resolve(fileURLToPath(new URL("..", import.meta.url)), "eval/run.ts"), "utf8");
    const main = src.slice(src.indexOf("// LIVE — networked and paid."));
    const at = (needle: string): number => {
      const i = main.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      expect(main.indexOf(needle, i + 1), `${needle} appears once`).toBe(-1);
      return i;
    };
    const hashed = at("const hashes = promptHashes(system, corpusText);");
    const read = at("baseline = readBaseline();");
    const parsed = at("loadCorpus(corpusText)");
    const sent = at("makeAuthor(provider, model, ledger, system, replies.onReply)");
    const confirm = at("if (!confirmed)");
    const firstCall = at("await evaluate(");
    for (const before of [hashed, read, parsed]) expect(before).toBeLessThan(Math.min(confirm, sent, firstCall));
    expect(at("md += liveDeltaSection(baseline, summary, hashes);")).toBeGreaterThan(firstCall);
    expect(main).not.toContain("promptHashes()");
  });

  it("a baseline is null only when missing; unparsable or malformed throws, naming the problem", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    expect(readBaseline(resolve(root, "eval/no-such-baseline.json"))).toBeNull();
    expect(() => readBaseline(resolve(root, "eval"))).toThrow("could not be read");
    expect(() => parseBaseline("{ not json")).toThrow("is not valid JSON");
    expect(() => parseBaseline("[]")).toThrow("is not a JSON object");
    const ok = { ...hashed };
    expect(parseBaseline(JSON.stringify(ok))).toEqual(ok);
    expect(parseBaseline(JSON.stringify(base))).toEqual(base);
    expect(() => parseBaseline(JSON.stringify({ ...ok, promptSha256: null }))).toThrow("`promptSha256` must be 64");
    expect(() => parseBaseline(JSON.stringify({ ...ok, corpusSha256: "abc" }))).toThrow("`corpusSha256` must be 64");
    expect(() => parseBaseline(JSON.stringify({ ...ok, sound: "3" }))).toThrow(
      "`sound` must be a non-negative integer",
    );
    expect(() => parseBaseline(JSON.stringify({ ...ok, valid: 4 }))).toThrow("`valid` exceeds `total`");
    expect(() => parseBaseline(JSON.stringify({ ...ok, total: 0, valid: 0, semanticPass: 0, sound: 0 }))).toThrow(
      "`total` must be at least 1",
    );
    expect(() => parseBaseline(JSON.stringify({ ...ok, judge: 2 }))).toThrow("`judge` must be a string");
    // The committed baseline is valid as recorded.
    expect(readBaseline()).not.toBeNull();
  });

  it("a null hash in an unvalidated baseline would throw in renderDelta (why the run validates first)", () => {
    const bad = { ...hashed, promptSha256: null as unknown as string };
    expect(() => renderDelta(bad, summary, { prompt: { prompt, corpus } })).toThrow();
  });

  it("sha256Text normalises CRLF to LF", () => {
    const lf = "line one\nline two\n";
    expect(sha256Text(lf)).toBe(sha256(lf));
    expect(sha256Text(lf.replace(/\n/g, "\r\n"))).toBe(sha256(lf));
  });

  it("promptHashes hashes the exact system prompt sent, not spec.llm.md alone", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const read = (rel: string): string => readFileSync(resolve(root, rel), "utf8");
    const h = promptHashes();
    expect(h).toEqual({
      prompt: sha256Text(systemPrompt()),
      corpus: sha256Text(read("eval/corpus.json")),
    });
    expect(h.prompt).not.toBe(sha256Text(read("spec.llm.md")));
    expect(promptHashes("x\r\ny", "c")).toEqual({
      prompt: sha256("x\ny"),
      corpus: sha256("c"),
    });
  });
});
