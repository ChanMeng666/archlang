/** wilson95; live report intervals. */

import { describe, expect, it } from "vitest";
import { wilson95 } from "../eval/stats.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JUDGE_VERSION } from "../eval/assertions.js";
import { liveDeltaSection, promptHashes, renderDelta, renderResults, sha256Text, systemPrompt } from "../eval/run.js";
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
    expect(md).not.toContain("`corpusSha256` d");
    expect(md).not.toContain(UNVERIFIED);
  });

  it("a differing corpus hash is NOT comparable as a prompt or corpus change", () => {
    const md = renderDelta({ ...hashed, corpusSha256: "d".repeat(64) }, summary, { prompt: { prompt, corpus } });
    expect(md).toContain(`(SHA-256: \`corpusSha256\` ${"d".repeat(12)} → ${"b".repeat(12)})`);
    expect(md).toContain("span a prompt or corpus change and are NOT comparable");
  });

  it("a baseline without hashes is unverified, never called not comparable", () => {
    const md = renderDelta(base, summary, { prompt: { prompt, corpus } });
    expect(md).toContain(`> Baseline records no \`promptSha256\` or \`corpusSha256\` hash; ${UNVERIFIED}.`);
    expect(md).not.toContain("NOT comparable");
    expect(md).toContain(HASH_LINE);
  });

  it("without the run's hashes the delta is unchanged", () => {
    expect(renderDelta(base, summary)).not.toContain("prompt");
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

  it("the live run passes its prompt hashes into the delta section", () => {
    const src = readFileSync(resolve(fileURLToPath(new URL("..", import.meta.url)), "eval/run.ts"), "utf8");
    const main = src.slice(src.indexOf("async function main("));
    expect(main).toContain("md += liveDeltaSection(baseline, summary, promptHashes());");
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
