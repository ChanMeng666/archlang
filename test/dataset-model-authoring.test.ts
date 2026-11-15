/** The model-authoring dataset config, offline: the Message Batches client against a mocked fetch (request shape, cache_control, refusals, resume) and `build` on fixture results (deterministic, replayed from its JSONL, canary-carrying, leak-gated), plus the brief-set dedup gates. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANARY, CANARY_COMMENT } from "../dataset/canary.js";
import { type HoldoutIndex, textReject } from "../dataset/dedup.js";
import { injectFault } from "../dataset/faults.js";
import {
  type BatchInfo,
  type FetchLike,
  batchRequest,
  createBatch,
  downloadResults,
} from "../dataset/model-authoring/batch.js";
import { spineBrief } from "../dataset/model-authoring/briefs.js";
import {
  type Deps,
  FILES,
  type GitState,
  MAX_TOKENS,
  buildAll,
  parseOptions,
  parseResults,
  runCollect,
  runSubmit,
} from "../dataset/model-authoring/cli.js";
import {
  evalGoldenTexts,
  evalIndex,
  fidelityIndex,
  fidelityPlans,
  indexOfRows,
  publishedIndex,
  publishedManifest,
} from "../dataset/model-authoring/corpora.js";
import { type BriefSet, type ManifestEntry, buildBriefSet } from "../dataset/model-authoring/manifest.js";
import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  CHARS_PER_TOKEN,
  LIST_PRICES_USD_PER_MTOK,
  TYPICAL_OUTPUT_TOKENS,
  estimateCost,
} from "../dataset/model-authoring/prices.js";
import { extractArch, fencedBlocks, systemPromptOf, verifyRow } from "../dataset/model-authoring/rows.js";
import { mulberry32 } from "../dataset/rng.js";
import { type PlanModel, emit } from "../dataset/templates.js";
// The eval harness's own reply parser is the oracle (a test may import eval/; dataset/ may not).
import { extractArch as evalExtract } from "../eval/run.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = (JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string }).version;
const EMPTY: HoldoutIndex = { prompts: [], fingerprints: [] };
const EVAL = evalIndex();
const FIDELITY = fidelityIndex();
const CORPORA = { eval: EVAL, fidelity: FIDELITY };
const SYSTEM = systemPromptOf("A tiny stand-in for spec.llm.md.");
const GIT: GitState = { commit: "0123456789abcdef0123456789abcdef01234567", dirty: false };
const KEY = "sk-test-key-must-never-be-written";
const API = "https://api.anthropic.com/v1/messages/batches";

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

/** Batch creation that answers msgbatch_1, msgbatch_2, … */
function creating() {
  let n = 0;
  return fakeFetch(() => [200, JSON.stringify({ id: `msgbatch_${++n}`, processing_status: "in_progress" })]);
}

function deps(fetch: FetchLike, extra: Partial<Deps> = {}): Deps & { lines: string[] } {
  const lines: string[] = [];
  return {
    fetch,
    apiKey: KEY,
    log: (l) => lines.push(l),
    sleep: async () => {},
    git: () => GIT,
    briefSet: SET,
    system: SYSTEM,
    lines,
    ...extra,
  };
}

const outDir = (): string => mkdtempSync(join(tmpdir(), "ma-"));
/** Parsed options for `argv` with `--out` replaced; fails the test on a flag error. */
function opt(argv: string[], out: string) {
  const { opts, errors } = parseOptions(argv);
  expect(errors).toEqual([]);
  return { ...opts, out };
}
const SUBMIT2 = ["--yes", "--models", "haiku-5-5,sonnet-5-5", "--briefs", "7", "--max-usd", "100"];

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
    expect(calls[0]!.url).toBe(API);
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

  it("refuses to send the key to a results_url on another origin", async () => {
    const { fetch, calls } = fakeFetch(() => [200, "x"]);
    const info: BatchInfo = { id: "b", processing_status: "ended", results_url: "https://evil.example/r" };
    await expect(downloadResults(fetch, KEY, info)).rejects.toThrow(/not on https:\/\/api\.anthropic\.com/);
    expect(calls).toHaveLength(0);
    // No results_url: the URL is built from the API base.
    await downloadResults(fetch, KEY, { id: "b", processing_status: "ended", results_url: null });
    expect(calls[0]!.url).toBe(`${API}/b/results`);
  });
});

describe("flags", () => {
  it("accepts the documented flags", () => {
    expect(parseOptions([...SUBMIT2, "--cache-ttl", "1h", "--wait", "--poll", "5", "--seed", "7"]).errors).toEqual([]);
  });

  it.each([
    [["--bogus"], /unknown argument/],
    [["--briefs", "0"], /--briefs must be an integer >= 1/],
    [["--poll", "4"], /--poll must be an integer >= 5/],
    [["--seed", "20260712"], /published default config's seed/],
    [["--cache-ttl", "2h"], /--cache-ttl must be 5m or 1h/],
    [["--max-usd", "-1"], /--max-usd must be a positive number/],
    [["--models"], /--models needs a value/],
  ])("refuses %j", (argv, msg) => {
    const { errors } = parseOptions(argv);
    expect(errors.join("\n")).toMatch(msg);
  });
});

describe("submit", () => {
  it("builds one batch per model with the manifest's briefs, and records the ids and the commit", async () => {
    const out = outDir();
    const { fetch, calls } = creating();
    const d = deps(fetch);
    const code = await runSubmit(opt(SUBMIT2, out), d);
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
    expect(state.git).toEqual(GIT);
    expect(state.models).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(state.batches).toEqual([
      { model: "claude-haiku-5-5", batch_id: "msgbatch_1", requests: 7 },
      { model: "claude-sonnet-5-5", batch_id: "msgbatch_2", requests: 7 },
    ]);
    // The key reaches the header only: no file submit wrote contains it.
    for (const f of readdirSync(out)) expect(readFileSync(join(out, f), "utf8").includes(KEY), f).toBe(false);
  });

  it("refuses, with no network call, when the state file or the results directory exists", async () => {
    for (const plant of [
      (o: string) => writeFileSync(join(o, FILES.state), "{}"),
      (o: string) => mkdirSync(join(o, "results")),
    ]) {
      const out = outDir();
      plant(out);
      const { fetch, calls } = fakeFetch(() => [200, "{}"]);
      expect(await runSubmit(opt(SUBMIT2, out), deps(fetch))).toBe(2);
      expect(calls).toHaveLength(0);
    }
  });

  it("refuses without --yes, without --max-usd, over the estimated ceiling, or for an unpriced model", async () => {
    const { fetch, calls } = fakeFetch(() => [200, "{}"]);
    const cases = [
      SUBMIT2.filter((a) => a !== "--yes"),
      ["--yes", "--models", "haiku-5-5", "--briefs", "7"],
      ["--yes", "--models", "opus-5-5", "--briefs", "7", "--max-usd", "0.01"],
      ["--yes", "--models", "gpt-9", "--briefs", "7", "--max-usd", "100"],
    ];
    for (const c of cases) {
      const out = outDir();
      expect(await runSubmit(opt(c, out), deps(fetch))).not.toBe(0);
      expect(existsSync(join(out, FILES.state)), c.join(" ")).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("a failure part-way records the batch already created; the state blocks a re-run; collect skips the rest", async () => {
    const out = outDir();
    let n = 0;
    const { fetch } = fakeFetch(() =>
      ++n === 1 ? [200, JSON.stringify({ id: "msgbatch_ok", processing_status: "in_progress" })] : [500, "overloaded"],
    );
    expect(await runSubmit(opt(SUBMIT2, out), deps(fetch))).toBe(1);
    const state = JSON.parse(readFileSync(join(out, FILES.state), "utf8"));
    expect(state.complete).toBe(false);
    expect(state.batches.map((b: { batch_id: string }) => b.batch_id)).toEqual(["msgbatch_ok"]);
    expect(state.error).toMatch(/HTTP 500/);
    const again = fakeFetch(() => [200, "{}"]);
    expect(await runSubmit(opt(SUBMIT2, out), deps(again.fetch))).toBe(2);
    expect(again.calls).toHaveLength(0);

    const api = fakeFetch((url) =>
      url.endsWith("/results")
        ? [200, "R\n"]
        : [
            200,
            JSON.stringify({
              id: "msgbatch_ok",
              processing_status: "ended",
              results_url: `${API}/msgbatch_ok/results`,
            }),
          ],
    );
    const d = deps(api.fetch);
    expect(await runCollect(opt([], out), d)).toBe(0);
    expect(api.calls.map((c) => c.url)).toEqual([`${API}/msgbatch_ok`, `${API}/msgbatch_ok/results`]);
    expect(d.lines.join("\n")).toMatch(/claude-sonnet-5-5: no batch was created/);
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
const fence = (src: string): string => `\`\`\`arch\n${src}\`\`\``;
const withPiece = (plan: PlanModel): PlanModel => ({
  ...plan,
  furniture: [
    { id: "f_move", category: "sofa", at: { x: 300, y: 300 }, size: { w: 1600, h: 700 }, label: "Sofa", movable: true },
  ],
});

/** Seven reply shapes, one per brief: clean, fixable, repairable, both, scripted, prose, truncated. */
function replyFor(i: number, e: ManifestEntry): { text: string; stop: string } {
  const plan = referencePlan(e);
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

/** A succeeded results line. */
const succeeded = (customId: string, model: string, i: number, text: string, stop = "end_turn") => ({
  custom_id: customId,
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

function resultsFor(model: string, order: "asc" | "desc"): string {
  const lines = SET.entries.map((e, i) => {
    const { text, stop } = replyFor(i, e);
    return JSON.stringify(succeeded(e.brief_id, model, i, text, stop));
  });
  // One errored request naming no manifest brief: counted, never a row.
  lines.push(JSON.stringify({ custom_id: "ma-spine-unknown", result: { type: "errored", error: { type: "error" } } }));
  return `${(order === "asc" ? lines : [...lines].reverse()).join("\n")}\n`;
}

/** Submit against a fake API, then lay results where collect would put them. */
async function submittedRun(
  results: (model: string) => string = (m) => resultsFor(m, "asc"),
  models = ["claude-haiku-5-5", "claude-opus-5-5"],
): Promise<string> {
  const out = outDir();
  const argv = ["--yes", "--models", models.join(","), "--briefs", "7", "--max-usd", "100"];
  expect(await runSubmit(opt(argv, out), deps(creating().fetch))).toBe(0);
  mkdirSync(join(out, "results"), { recursive: true });
  for (const m of models) writeFileSync(join(out, FILES.results(m)), results(m));
  return out;
}

const built = (out: string) => {
  const res = buildAll(out, CORPORA, GIT);
  if ("error" in res) throw new Error(res.error);
  return res;
};
const rowsOf = (jsonl: string): Record<string, any>[] =>
  jsonl
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, any>);
type ModelReport = { emitted: number; result_types: Record<string, number>; not_emitted: Record<string, number> };

describe("collect — polls, downloads, resumes", () => {
  it("downloads ended batches, leaves running ones, and a re-run fetches only what is missing", async () => {
    const out = outDir();
    expect(await runSubmit(opt(SUBMIT2, out), deps(creating().fetch))).toBe(0);

    let secondEnded = false;
    const api = fakeFetch((url) => {
      if (url === `${API}/msgbatch_1`)
        return [
          200,
          JSON.stringify({ id: "msgbatch_1", processing_status: "ended", results_url: `${API}/msgbatch_1/results` }),
        ];
      if (url === `${API}/msgbatch_2`)
        return [
          200,
          JSON.stringify({
            id: "msgbatch_2",
            processing_status: secondEnded ? "ended" : "in_progress",
            results_url: secondEnded ? `${API}/msgbatch_2/results` : null,
          }),
        ];
      if (url === `${API}/msgbatch_1/results`) return [200, "RESULTS-1\n"];
      if (url === `${API}/msgbatch_2/results`) return [200, "RESULTS-2\n"];
      return [404, "no"];
    });
    const o = opt([], out);
    expect(await runCollect(o, deps(api.fetch))).toBe(4);
    expect(readFileSync(join(out, FILES.results("claude-haiku-5-5")), "utf8")).toBe("RESULTS-1\n");
    expect(existsSync(join(out, FILES.results("claude-sonnet-5-5")))).toBe(false);
    expect(api.calls.map((c) => c.url)).toEqual([
      `${API}/msgbatch_1`,
      `${API}/msgbatch_1/results`,
      `${API}/msgbatch_2`,
    ]);
    for (const c of api.calls) expect(c.headers["x-api-key"]).toBe(KEY);

    secondEnded = true;
    api.calls.length = 0;
    expect(await runCollect(o, deps(api.fetch))).toBe(0);
    expect(api.calls.map((c) => c.url)).toEqual([`${API}/msgbatch_2`, `${API}/msgbatch_2/results`]);
    expect(readFileSync(join(out, FILES.results("claude-sonnet-5-5")), "utf8")).toBe("RESULTS-2\n");
    expect(readFileSync(join(out, FILES.state), "utf8").includes(KEY)).toBe(false);
  });

  it("--wait polls until every batch has ended", async () => {
    const out = outDir();
    const argv = ["--yes", "--models", "haiku-5-5", "--briefs", "7", "--max-usd", "100"];
    expect(await runSubmit(opt(argv, out), deps(creating().fetch))).toBe(0);
    let polls = 0;
    const api = fakeFetch((url) =>
      url.endsWith("/results")
        ? [200, "R\n"]
        : [
            200,
            JSON.stringify({
              id: "msgbatch_1",
              processing_status: ++polls >= 3 ? "ended" : "in_progress",
              results_url: `${API}/msgbatch_1/results`,
            }),
          ],
    );
    let slept = 0;
    const code = await runCollect(
      opt(["--wait", "--poll", "5"], out),
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

describe("build — deterministic, replayed, canary-carrying", () => {
  it("is byte-identical across runs and across the order the results file lists", async () => {
    const a = built(await submittedRun((m) => resultsFor(m, "asc")));
    const b = built(await submittedRun((m) => resultsFor(m, "desc")));
    expect(a.jsonl.length).toBeGreaterThan(0);
    expect(b.jsonl).toBe(a.jsonl);
    expect(JSON.stringify(b.report)).toBe(JSON.stringify(a.report));
  });

  it("emits one row per succeeded result and counts a line naming no brief", async () => {
    const res = built(await submittedRun());
    expect(rowsOf(res.jsonl)).toHaveLength(14);
    for (const m of res.report.models as ModelReport[]) {
      expect(m.emitted).toBe(7);
      expect(m.result_types).toEqual({ errored: 1, succeeded: 7 });
      expect(m.not_emitted).toEqual({ "unknown-custom-id": 1 });
    }
  });

  it("every stored row replays from its parsed JSONL line, byte for byte; a tampered one does not", async () => {
    const res = built(await submittedRun());
    for (const row of rowsOf(res.jsonl)) {
      expect(verifyRow(row, VERSION), String(row.id)).toEqual({ ok: true });
      expect(row.generator.commit).toBe(GIT.commit);
      expect(row.generator.tree_dirty).toBe(false);
      const bad = { ...row, l0: { ...row.l0, diagnostics: [...row.l0.diagnostics, { code: "W_FAKE" }] } };
      expect(verifyRow(bad, VERSION).ok).toBe(false);
    }
  });

  it("covers the healing outcomes: clean, fix, repair, both, a declined scripted repair, unparseable replies", async () => {
    const rows = rowsOf(built(await submittedRun()).jsonl).filter((r) => r.model === "claude-haiku-5-5");
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
    const res = built(await submittedRun());
    expect((res.report as { canary: string }).canary).toBe(CANARY);
    for (const row of rowsOf(res.jsonl)) {
      expect(row.canary).toBe(CANARY);
      for (const k of ["source", "after_fix_source", "after_repair_source"]) {
        expect((row[k] as string).split("\n")[0], `${row.id} ${k}`).toBe(CANARY_COMMENT);
      }
      expect(textReject(row.brief, EVAL).reject).toBe(false);
      expect(textReject(row.brief, FIDELITY).reject).toBe(false);
    }
  });

  it("refuses a manifest that is not the submitted one, another commit, or a repeated custom_id", async () => {
    const out = await submittedRun();
    expect("error" in buildAll(out, CORPORA, { commit: "f".repeat(40), dirty: false })).toBe(true);
    expect((buildAll(out, CORPORA, { commit: "f".repeat(40), dirty: false }) as { error: string }).error).toMatch(
      /commit/,
    );
    writeFileSync(join(out, FILES.manifest), `${readFileSync(join(out, FILES.manifest), "utf8")}\n`);
    expect((buildAll(out, CORPORA, GIT) as { error: string }).error).toMatch(/sha256/);

    const dup = await submittedRun((m) => {
      const line = JSON.stringify(succeeded(SET.entries[0]!.brief_id, m, 0, "x"));
      return `${line}\n${line}\n`;
    });
    expect(() => parseResults(readFileSync(join(dup, FILES.results("claude-haiku-5-5")), "utf8"))).toThrow(
      /repeat custom_id/,
    );
    expect((buildAll(dup, CORPORA, GIT) as { error: string }).error).toMatch(/repeat custom_id/);
  });
});

describe("build — results that are not a reply produce no row", () => {
  it("errored, expired, canceled and missing results for manifest briefs are counted, never emitted", async () => {
    const types = ["errored", "expired", "canceled"] as const;
    const out = await submittedRun(
      (m) =>
        SET.entries
          .flatMap((e, i) => {
            if (i < 3) return [JSON.stringify({ custom_id: e.brief_id, result: { type: types[i] } })];
            if (i === 3) return []; // no line at all
            return [JSON.stringify(succeeded(e.brief_id, m, i, fence(bare(referencePlan(e)))))];
          })
          .join("\n") + "\n",
      ["claude-haiku-5-5"],
    );
    const res = built(out);
    const ids = rowsOf(res.jsonl).map((r) => r.brief_id);
    expect(ids).toEqual(SET.entries.slice(4).map((e) => e.brief_id));
    const m = (res.report.models as ModelReport[])[0]!;
    expect(m.emitted).toBe(3);
    expect(m.result_types).toEqual({ canceled: 1, errored: 1, expired: 1, succeeded: 3 });
    expect(m.not_emitted).toEqual({
      "missing-result": 1,
      "result-canceled": 1,
      "result-errored": 1,
      "result-expired": 1,
    });
  });
});

describe("build — the leak gate", () => {
  /** An eval golden and a fidelity reference plan with no `import` (so no World is needed). */
  const corpus: { id: string; golden: string }[] = JSON.parse(readFileSync(resolve(ROOT, "eval/corpus.json"), "utf8"));
  const evalGolden = corpus
    .map((e) => readFileSync(resolve(ROOT, e.golden), "utf8"))
    .find((s) => !/^\s*import\b/m.test(s))!;
  const fidelityPlan = fidelityPlans()
    .map((p) => readFileSync(p.path, "utf8"))
    .find((s) => !/^\s*import\b/m.test(s))!;
  /** The same plan with a comment inserted after its second line: the text no longer contains
   *  the golden, the structure still matches it. */
  const annotated = (src: string): string => {
    const lines = src.split("\n");
    return [...lines.slice(0, 2), "  # echoed, with a note in the middle", ...lines.slice(2)].join("\n");
  };

  it("an echoed golden is caught by the text check, an annotated one by the structural check", async () => {
    expect(evalGolden).toBeDefined();
    expect(fidelityPlan).toBeDefined();
    // The text gate scans both corpora: the 26 eval goldens and the fidelity reference plans.
    expect(evalGoldenTexts().length).toBeGreaterThan(26);
    const replies = [
      `Here you go:\n${fence(evalGolden)}`,
      fence(annotated(evalGolden)),
      fence(fidelityPlan),
      // The leaked plan sits in a SECOND block; the first block is a clean spine plan.
      `${fence(bare(referencePlan(SET.entries[3]!)))}\nAlternatively:\n${fence(annotated(fidelityPlan))}`,
    ];
    const out = await submittedRun(
      (m) =>
        SET.entries
          .map((e, i) => JSON.stringify(succeeded(e.brief_id, m, i, replies[i] ?? fence(bare(referencePlan(e))))))
          .join("\n") + "\n",
      ["claude-haiku-5-5"],
    );
    const res = built(out);
    expect(rowsOf(res.jsonl).map((r) => r.brief_id)).toEqual(SET.entries.slice(4).map((e) => e.brief_id));
    const m = (res.report.models as ModelReport[])[0]!;
    expect(m.not_emitted).toEqual({ "leak-golden-text": 2, "leak-structure": 2 });
  });

  it("fencedBlocks finds every block, whatever its info string", () => {
    expect(fencedBlocks("a\n```arch\nA\n```\nb\n```json\n{}\n```\n```\nC\n```")).toEqual(["A\n", "{}\n", "C\n"]);
    expect(fencedBlocks("````arch\nX\n```")).toEqual(["X\n"]);
    expect(fencedBlocks("```arch\nunclosed")).toEqual([]);
    expect(fencedBlocks("no fences")).toEqual([]);
  });
});

describe("buildBriefSet — the published-split dedup gates", () => {
  // Pin the candidate list to the first four draws, then index those very briefs as "published".
  const first = buildBriefSet(20261115, 4, { eval: EVAL, fidelity: FIDELITY, published: EMPTY }, 4);
  const authoringJsonl = first.entries
    .map((e) => JSON.stringify({ id: e.brief_id, brief: e.brief, source: emit(spineBrief(mulberry32(e.seed))!.plan) }))
    .join("\n");
  const own = indexOfRows("", authoringJsonl);
  const run = (published: HoldoutIndex) => buildBriefSet(20261115, 4, { eval: EVAL, fidelity: FIDELITY, published }, 4);

  it("the four draws pass against an empty published index", () => {
    expect(first.entries).toHaveLength(4);
    expect(first.attempts).toBe(4);
  });

  it("indexed as published, all four are rejected (text first)", () => {
    const s = run(own);
    expect(s.entries).toEqual([]);
    expect(s.rejections).toEqual({ "dedup-text-published": 4 });
  });

  it("the text gate alone rejects them", () => {
    const s = run({ prompts: own.prompts, fingerprints: [] });
    expect(s.entries).toEqual([]);
    expect(s.rejections).toEqual({ "dedup-text-published": 4 });
  });

  it("the structural gate alone rejects them", () => {
    const s = run({ prompts: [], fingerprints: own.fingerprints });
    expect(s.entries).toEqual([]);
    expect(s.rejections).toEqual({ "dedup-structure-published": 4 });
  });
});

describe("the published-split pin", () => {
  it("published.json pins both uploaded files by SHA-256 at a revision", () => {
    const m = publishedManifest();
    expect(m.repo).toBe("ChanMeng666/archlang-repair-trajectories");
    expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
    for (const f of ["repair.jsonl", "authoring.jsonl"] as const) expect(m.files[f].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.dir).toBe("dataset/out/published");
  });

  it("publishedIndex refuses a missing or a different file, naming the download command", () => {
    const dir = outDir();
    expect(() => publishedIndex(dir)).toThrow(/missing .*hf download ChanMeng666\/archlang-repair-trajectories/);
    writeFileSync(join(dir, "repair.jsonl"), "{}\n");
    writeFileSync(join(dir, "authoring.jsonl"), "{}\n");
    expect(() => publishedIndex(dir)).toThrow(/not the pinned/);
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

  it("every priced model has its own cache-read multiplier, and the cached estimate uses it", () => {
    expect(Object.keys(CACHE_READ_MULTIPLIER).sort()).toEqual(Object.keys(LIST_PRICES_USD_PER_MTOK).sort());
    expect(new Set(Object.values(CACHE_READ_MULTIPLIER)).size).toBeGreaterThan(1);
    for (const model of Object.keys(LIST_PRICES_USD_PER_MTOK)) {
      const p = LIST_PRICES_USD_PER_MTOK[model]!;
      const sys = 30_000 / CHARS_PER_TOKEN;
      const user = (400 * 900) / CHARS_PER_TOKEN;
      const want =
        ((sys * p.input * CACHE_WRITE_MULTIPLIER["5m"] +
          399 * sys * p.input * CACHE_READ_MULTIPLIER[model]! +
          user * p.input +
          400 * TYPICAL_OUTPUT_TOKENS * p.output) /
          1e6) *
        0.5;
      expect(estimateCost(model, 400, 30_000, 400 * 900, MAX_TOKENS, "5m").cachedEstimateUsd).toBeCloseTo(want, 9);
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
