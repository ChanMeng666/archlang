/** The model-authoring dataset config, offline: the Message Batches client against a mocked fetch (request shape, cache_control, refuse-if-state-exists, resume) and `build` on fixture results (deterministic, self-verifying, canary-carrying, disjoint). */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANARY, CANARY_COMMENT } from "../dataset/canary.js";
import { type HoldoutIndex, textReject } from "../dataset/dedup.js";
import { injectFault } from "../dataset/faults.js";
import { mulberry32 } from "../dataset/rng.js";
import { type PlanModel, emit } from "../dataset/templates.js";
import { type FetchLike, batchRequest, createBatch } from "../dataset/model-authoring/batch.js";
import { spineBrief } from "../dataset/model-authoring/briefs.js";
import {
  type Deps,
  FILES,
  MAX_TOKENS,
  buildAll,
  parseOptions,
  runCollect,
  runSubmit,
} from "../dataset/model-authoring/cli.js";
import { evalGoldenTexts, evalIndex, fidelityIndex } from "../dataset/model-authoring/corpora.js";
import { type BriefSet, type ManifestEntry, buildBriefSet } from "../dataset/model-authoring/manifest.js";
import { LIST_PRICES_USD_PER_MTOK, estimateCost } from "../dataset/model-authoring/prices.js";
import { extractArch, systemPromptOf, verifyRow } from "../dataset/model-authoring/rows.js";
// The eval harness's own reply parser is the oracle (a test may import eval/; dataset/ may not).
import { extractArch as evalExtract } from "../eval/run.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version;
const EMPTY: HoldoutIndex = { prompts: [], fingerprints: [] };
const EVAL = evalIndex();
const FIDELITY = fidelityIndex();
const SYSTEM = systemPromptOf("A tiny stand-in for spec.llm.md.");

// A small brief set; disjointness from the published splits is covered in test/dataset.test.ts.
const SET: BriefSet = buildBriefSet(20261115, 7, { eval: EVAL, fidelity: FIDELITY, published: EMPTY });

/** A recording fake `fetch`: `respond` maps a call to [status, body]. */
function fakeFetch(respond: (url: string, method: string, body: string | undefined) => [number, string]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, headers: init?.headers ?? {}, body: init?.body });
    const [status, body] = respond(url, method, init?.body);
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetch, calls };
}

function deps(fetch: FetchLike, extra: Partial<Deps> = {}): Deps & { lines: string[] } {
  const lines: string[] = [];
  return {
    fetch,
    apiKey: "test-key",
    log: (l) => lines.push(l),
    sleep: async () => {},
    briefSet: SET,
    system: SYSTEM,
    lines,
    ...extra,
  };
}

const outDir = (): string => mkdtempSync(join(tmpdir(), "ma-"));

describe("the batch client — request shape", () => {
  it("one request is a one-shot Messages call with a cached system block", () => {
    const r = batchRequest("ma-spine-1", "claude-haiku-5-5", SYSTEM, "a brief", MAX_TOKENS, "5m");
    expect(r).toEqual({
      custom_id: "ma-spine-1",
      params: {
        model: "claude-haiku-5-5",
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: "a brief" }],
      },
    });
    expect(batchRequest("x", "m", SYSTEM, "b", 10, "1h").params.system[0]!.cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
  });

  it("createBatch POSTs the requests with the key header only", async () => {
    const { fetch, calls } = fakeFetch(() => [
      200,
      JSON.stringify({ id: "msgbatch_1", processing_status: "in_progress" }),
    ]);
    const reqs = [batchRequest("a", "claude-haiku-5-5", SYSTEM, "b", 100, "5m")];
    const info = await createBatch(fetch, "k-123", reqs);
    expect(info.id).toBe("msgbatch_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages/batches");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers).toEqual({
      "x-api-key": "k-123",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ requests: reqs });
  });

  it("an HTTP error quotes the status and body, never the key", async () => {
    const { fetch } = fakeFetch(() => [400, '{"error":"bad"}']);
    await expect(createBatch(fetch, "secret-key-value", [])).rejects.toThrow(/HTTP 400/);
    await expect(createBatch(fetch, "secret-key-value", [])).rejects.not.toThrow(/secret-key-value/);
  });
});

describe("submit", () => {
  const argv = ["--yes", "--models", "haiku-5-5,sonnet-5-5", "--briefs", "7", "--max-usd", "100"];

  it("builds one batch per model with the manifest's briefs, and records the ids", async () => {
    const out = outDir();
    let n = 0;
    const { fetch, calls } = fakeFetch(() => [
      200,
      JSON.stringify({ id: `msgbatch_${++n}`, processing_status: "in_progress" }),
    ]);
    const d = deps(fetch);
    const code = await runSubmit({ ...parseOptions(argv), out }, d);
    expect(code, d.lines.join("\n")).toBe(0);
    expect(calls).toHaveLength(2);
    const bodies = calls.map((c) => JSON.parse(c.body!) as { requests: ReturnType<typeof batchRequest>[] });
    expect(bodies.map((b) => b.requests[0]!.params.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    for (const b of bodies) {
      expect(b.requests.map((r) => r.custom_id)).toEqual(SET.entries.map((e) => e.brief_id));
      expect(b.requests.map((r) => r.params.messages[0]!.content)).toEqual(SET.entries.map((e) => e.brief));
      for (const r of b.requests) expect(r.params.system[0]!.cache_control).toEqual({ type: "ephemeral" });
    }
    const state = JSON.parse(readFileSync(join(out, FILES.state), "utf8"));
    expect(state.complete).toBe(true);
    expect(state.canary).toBe(CANARY);
    expect(state.batches).toEqual([
      { model: "claude-haiku-5-5", batch_id: "msgbatch_1", requests: 7 },
      { model: "claude-sonnet-5-5", batch_id: "msgbatch_2", requests: 7 },
    ]);
  });

  it("refuses, with no network call, when the state file exists", async () => {
    const out = outDir();
    writeFileSync(join(out, FILES.state), "{}");
    const { fetch, calls } = fakeFetch(() => [200, "{}"]);
    expect(await runSubmit({ ...parseOptions(argv), out }, deps(fetch))).toBe(2);
    expect(calls).toHaveLength(0);
    expect(readFileSync(join(out, FILES.state), "utf8")).toBe("{}");
  });

  it("refuses without --yes, without --max-usd, over the ceiling, or for an unpriced model", async () => {
    const { fetch, calls } = fakeFetch(() => [200, "{}"]);
    const cases = [
      argv.filter((a) => a !== "--yes"),
      ["--yes", "--models", "haiku-5-5", "--briefs", "7"],
      ["--yes", "--models", "opus-5-5", "--briefs", "7", "--max-usd", "0.01"],
      ["--yes", "--models", "gpt-9", "--briefs", "7", "--max-usd", "100"],
    ];
    for (const c of cases) {
      const out = outDir();
      expect(await runSubmit({ ...parseOptions(c), out }, deps(fetch))).not.toBe(0);
      expect(existsSync(join(out, FILES.state)), c.join(" ")).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("a failure part-way records the batches already created, and the state then blocks a re-run", async () => {
    const out = outDir();
    let n = 0;
    const { fetch } = fakeFetch(() =>
      ++n === 1 ? [200, JSON.stringify({ id: "msgbatch_ok", processing_status: "in_progress" })] : [500, "overloaded"],
    );
    expect(await runSubmit({ ...parseOptions(argv), out }, deps(fetch))).toBe(1);
    const state = JSON.parse(readFileSync(join(out, FILES.state), "utf8"));
    expect(state.complete).toBe(false);
    expect(state.batches.map((b: { batch_id: string }) => b.batch_id)).toEqual(["msgbatch_ok"]);
    expect(state.error).toMatch(/HTTP 500/);
    const again = fakeFetch(() => [200, "{}"]);
    expect(await runSubmit({ ...parseOptions(argv), out }, deps(again.fetch))).toBe(2);
    expect(again.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture results: replies built from each brief's reference plan, some with faults.
// ---------------------------------------------------------------------------

/** The reference plan of a manifest entry, without the canary line (a model never writes it). */
function referencePlan(e: ManifestEntry): PlanModel {
  const b = spineBrief(mulberry32(e.seed));
  if (!b) throw new Error("brief regenerates");
  return b.plan;
}
const bare = (plan: PlanModel): string => emit(plan).split("\n").slice(1).join("\n");
const withPiece = (plan: PlanModel): PlanModel => ({
  ...plan,
  furniture: [
    { id: "f_move", category: "sofa", at: { x: 300, y: 300 }, size: { w: 1600, h: 700 }, label: "Sofa", movable: true },
  ],
});

/** Seven reply shapes, one per brief: clean, fixable, repairable, both, scripted, prose, truncated. */
function replyFor(i: number, e: ManifestEntry): { text: string; stop: string } {
  const plan = referencePlan(e);
  const fence = (src: string): string => `\`\`\`arch\n${src}\`\`\``;
  switch (i % 7) {
    case 0:
      return { text: fence(bare(plan)), stop: "end_turn" };
    case 1:
      return { text: fence(bare(injectFault("off-wall-door", plan)!.plan)), stop: "end_turn" };
    case 2:
      return { text: fence(bare(injectFault("furniture-through-wall", withPiece(plan))!.plan)), stop: "end_turn" };
    case 3:
      return { text: fence(bare(injectFault("combined", withPiece(plan))!.plan)), stop: "end_turn" };
    case 4: {
      // The piece's x is an expression, so repair declines to rewrite it (scripted placement).
      const src = bare(injectFault("furniture-through-wall", withPiece(plan))!.plan)
        .replace("  units mm", "  units mm\n  let px = 300")
        .replace(/furniture sofa at \(300,/, "furniture sofa at (px,");
      return { text: fence(src), stop: "end_turn" };
    }
    case 5:
      return { text: `Here is your plan.\n\n${bare(plan)}`, stop: "end_turn" };
    default:
      return { text: `\`\`\`arch\n${bare(plan).slice(0, 300)}`, stop: "max_tokens" };
  }
}

function resultsFor(model: string, order: "asc" | "desc"): string {
  const lines = SET.entries.map((e, i) => {
    const { text, stop } = replyFor(i, e);
    return JSON.stringify({
      custom_id: e.brief_id,
      result: {
        type: "succeeded",
        message: {
          id: `msg_${model}_${i}`,
          type: "message",
          role: "assistant",
          model,
          content: [{ type: "text", text }],
          stop_reason: stop,
          usage: {
            input_tokens: 40 + i,
            output_tokens: 900 + i,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 9000,
          },
        },
      },
    });
  });
  // One errored request, which build counts and does not emit.
  lines.push(JSON.stringify({ custom_id: "ma-spine-unknown", result: { type: "errored", error: { type: "error" } } }));
  return `${(order === "asc" ? lines : [...lines].reverse()).join("\n")}\n`;
}

/** Submit against a fake API, then lay the fixture results where collect would put them. */
async function submittedRun(order: "asc" | "desc" = "asc"): Promise<string> {
  const out = outDir();
  let n = 0;
  const { fetch } = fakeFetch(() => [200, JSON.stringify({ id: `msgbatch_${++n}`, processing_status: "in_progress" })]);
  const argv = ["--yes", "--models", "haiku-5-5,opus-5-5", "--briefs", "7", "--max-usd", "100"];
  expect(await runSubmit({ ...parseOptions(argv), out }, deps(fetch))).toBe(0);
  mkdirSync(join(out, "results"), { recursive: true });
  for (const m of ["claude-haiku-5-5", "claude-opus-5-5"])
    writeFileSync(join(out, FILES.results(m)), resultsFor(m, order));
  return out;
}

describe("collect — polls, downloads, resumes", () => {
  it("downloads ended batches, leaves running ones, and a re-run fetches only what is missing", async () => {
    const out = outDir();
    let n = 0;
    const sub = fakeFetch(() => [200, JSON.stringify({ id: `msgbatch_${++n}`, processing_status: "in_progress" })]);
    const argv = ["--yes", "--models", "haiku-5-5,sonnet-5-5", "--briefs", "7", "--max-usd", "100"];
    expect(await runSubmit({ ...parseOptions(argv), out }, deps(sub.fetch))).toBe(0);

    let secondEnded = false;
    const api = fakeFetch((url) => {
      if (url.endsWith("/msgbatch_1"))
        return [200, JSON.stringify({ id: "msgbatch_1", processing_status: "ended", results_url: "https://r/1" })];
      if (url.endsWith("/msgbatch_2"))
        return [
          200,
          JSON.stringify({
            id: "msgbatch_2",
            processing_status: secondEnded ? "ended" : "in_progress",
            results_url: secondEnded ? "https://r/2" : null,
          }),
        ];
      if (url === "https://r/1") return [200, "RESULTS-1\n"];
      if (url === "https://r/2") return [200, "RESULTS-2\n"];
      return [404, "no"];
    });
    const opts = { ...parseOptions([]), out };
    expect(await runCollect(opts, deps(api.fetch))).toBe(4);
    expect(readFileSync(join(out, FILES.results("claude-haiku-5-5")), "utf8")).toBe("RESULTS-1\n");
    expect(existsSync(join(out, FILES.results("claude-sonnet-5-5")))).toBe(false);
    expect(api.calls.map((c) => c.url)).toEqual([
      "https://api.anthropic.com/v1/messages/batches/msgbatch_1",
      "https://r/1",
      "https://api.anthropic.com/v1/messages/batches/msgbatch_2",
    ]);
    for (const c of api.calls) expect(c.headers["x-api-key"]).toBe("test-key");

    secondEnded = true;
    api.calls.length = 0;
    expect(await runCollect(opts, deps(api.fetch))).toBe(0);
    expect(api.calls.map((c) => c.url)).toEqual([
      "https://api.anthropic.com/v1/messages/batches/msgbatch_2",
      "https://r/2",
    ]);
    expect(readFileSync(join(out, FILES.results("claude-sonnet-5-5")), "utf8")).toBe("RESULTS-2\n");
  });

  it("--wait polls until every batch has ended", async () => {
    const out = outDir();
    const sub = fakeFetch(() => [200, JSON.stringify({ id: "msgbatch_w", processing_status: "in_progress" })]);
    const argv = ["--yes", "--models", "haiku-5-5", "--briefs", "7", "--max-usd", "100"];
    expect(await runSubmit({ ...parseOptions(argv), out }, deps(sub.fetch))).toBe(0);
    let polls = 0;
    const api = fakeFetch((url) =>
      url.startsWith("https://r/")
        ? [200, "R\n"]
        : [
            200,
            JSON.stringify({
              id: "msgbatch_w",
              processing_status: ++polls >= 3 ? "ended" : "in_progress",
              results_url: "https://r/w",
            }),
          ],
    );
    let slept = 0;
    const code = await runCollect(
      { ...parseOptions(["--wait", "--poll", "5"]), out },
      deps(api.fetch, {
        sleep: async (ms) => {
          slept += ms;
        },
      }),
    );
    expect(code).toBe(0);
    expect(polls).toBe(3);
    expect(slept).toBe(10_000);
  });
});

describe("build — deterministic, self-verifying, canary-carrying, disjoint", () => {
  it("is byte-identical across runs and across the order the results file lists", async () => {
    const a = buildAll(await submittedRun("asc"), { eval: EVAL, fidelity: FIDELITY });
    const b = buildAll(await submittedRun("desc"), { eval: EVAL, fidelity: FIDELITY });
    if ("error" in a || "error" in b) throw new Error("build failed");
    expect(a.jsonl.length).toBeGreaterThan(0);
    expect(b.jsonl).toBe(a.jsonl);
    expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
  });

  it("emits one row per succeeded result and counts the rest", async () => {
    const res = buildAll(await submittedRun(), { eval: EVAL, fidelity: FIDELITY });
    if ("error" in res) throw new Error(res.error);
    const rows = res.jsonl.trim().split("\n");
    expect(rows).toHaveLength(14);
    const models = res.report.models as { result_types: Record<string, number>; emitted: number }[];
    for (const m of models) {
      expect(m.emitted).toBe(7);
      expect(m.result_types).toEqual({ errored: 1, succeeded: 7 });
    }
  });

  it("every stored row replays: re-deriving from its own brief and raw reply reproduces it byte for byte", async () => {
    const res = buildAll(await submittedRun(), { eval: EVAL, fidelity: FIDELITY });
    if ("error" in res) throw new Error(res.error);
    for (const line of res.jsonl.trim().split("\n")) {
      const row = JSON.parse(line) as Record<string, unknown>;
      expect(verifyRow(row, VERSION), String(row.id)).toEqual({ ok: true });
      // A tampered diagnostic list no longer replays (the check can fail).
      const l0 = row.l0 as { diagnostics: unknown[] };
      const bad = { ...row, l0: { ...l0, diagnostics: [...l0.diagnostics, { code: "W_FAKE" }] } };
      expect(verifyRow(bad, VERSION).ok).toBe(false);
    }
  });

  it("covers the healing outcomes: clean, fix, repair, both, a declined scripted repair, unparseable replies", async () => {
    const res = buildAll(await submittedRun(), { eval: EVAL, fidelity: FIDELITY });
    if ("error" in res) throw new Error(res.error);
    const rows = res.jsonl
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, any>)
      .filter((r) => r.model === "claude-haiku-5-5");
    expect(rows.map((r) => r.fix_kind)).toEqual(["none", "fix", "repair", "both", "none", "none", "none"]);
    expect(rows[0]!.l0.sound).toBe(true);
    expect(rows[0]!.l0.intent.ok).toBe(true);
    expect(rows[2]!.final.sound).toBe(true);
    expect(rows[4]!.repair_unresolved.length).toBeGreaterThan(0);
    expect(rows[4]!.final.sound).toBe(false);
    expect(rows[5]!.l0.valid).toBe(false);
    expect(rows[6]!.stop_reason).toBe("max_tokens");
    expect(rows[6]!.l0.valid).toBe(false);
  });

  it("every row carries the canary field and every .arch source starts with the canary comment", async () => {
    const res = buildAll(await submittedRun(), { eval: EVAL, fidelity: FIDELITY });
    if ("error" in res) throw new Error(res.error);
    expect((res.report as { canary: string }).canary).toBe(CANARY);
    for (const line of res.jsonl.trim().split("\n")) {
      const row = JSON.parse(line) as Record<string, string>;
      expect(row.canary).toBe(CANARY);
      for (const k of ["source", "after_fix_source", "after_repair_source"]) {
        expect(row[k]!.split("\n")[0], `${row.id} ${k}`).toBe(CANARY_COMMENT);
      }
    }
  });

  it("rows stay disjoint from both eval corpora (brief text, and no golden echoed)", async () => {
    const res = buildAll(await submittedRun(), { eval: EVAL, fidelity: FIDELITY });
    if ("error" in res) throw new Error(res.error);
    const goldens = evalGoldenTexts();
    expect(goldens.length).toBeGreaterThan(26);
    for (const line of res.jsonl.trim().split("\n")) {
      const row = JSON.parse(line) as Record<string, string>;
      expect(textReject(row.brief!, EVAL).reject).toBe(false);
      expect(textReject(row.brief!, FIDELITY).reject).toBe(false);
    }
  });

  it("refuses to build from a manifest or system prompt that is not the submitted one", async () => {
    const out = await submittedRun();
    writeFileSync(join(out, FILES.manifest), `${readFileSync(join(out, FILES.manifest), "utf8")}\n`);
    const res = buildAll(out, { eval: EVAL, fidelity: FIDELITY });
    expect("error" in res && res.error).toMatch(/sha256/);
  });
});

describe("extractArch matches the eval harness's reply parser", () => {
  const samples = [
    '```arch\nplan "a" {}\n```',
    "prose\n```\nplan {}\n```\nmore",
    "````arch\nx\n```",
    "```archx\nnope```\n```arch\nyes\n```",
    "```json\n{}\n```\n```arch\nplan\n```",
    "no fence at all",
    "```arch\nunclosed",
    "``` \nspace\n```",
    "",
    "```arch\n```",
  ];
  it.each(samples)("%j", (s) => {
    expect(extractArch(s)).toBe(evalExtract(s));
  });
});

describe("prices", () => {
  it("every copied list price matches eval/run.ts's table", () => {
    const run = readFileSync(resolve(ROOT, "eval/run.ts"), "utf8");
    for (const [model, p] of Object.entries(LIST_PRICES_USD_PER_MTOK)) {
      const row = new RegExp(`"${model}": \\{ input: ([\\d.]+), output: ([\\d.]+) \\}`).exec(run);
      expect(row, `${model} missing from eval/run.ts`).not.toBeNull();
      expect([Number(row![1]), Number(row![2])], model).toEqual([p.input, p.output]);
    }
  });

  it("the estimates are ordered cache-hit <= no-cache-hit <= ceiling, at half the list price", () => {
    const c = estimateCost("claude-opus-5-5", 400, 30_000, 400 * 900, MAX_TOKENS, "5m");
    expect(c.cachedEstimateUsd).toBeLessThan(c.estimateUsd);
    expect(c.estimateUsd).toBeLessThan(c.ceilingUsd);
    // Ceiling output alone: 400 x 16384 tokens at $20/M, halved.
    expect(c.ceilingUsd).toBeGreaterThan((400 * MAX_TOKENS * 20 * 0.5) / 1e6);
  });
});
