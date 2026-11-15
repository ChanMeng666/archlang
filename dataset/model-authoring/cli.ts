/**
 * `npm run dataset:model-authoring -- <phase>` — the model-authoring config of the dataset.
 *
 * Real models author `.arch` one-shot from procedural briefs (`briefs.ts`, `manifest.ts`), sent
 * as one Anthropic Message Batch per model; the deterministic tools then heal each reply
 * (`rows.ts`). Four phases:
 *
 *   plan     free, no network: the brief count, the models and the estimated cost at Batch prices.
 *   submit   PAID, OWNER-ONLY (product-roadmap RM-D47): `--yes --models a,b --briefs N --max-usd X`.
 *            Refuses if the state file or `results/` exists, if a model has no copied price, or if
 *            the estimated cost ceiling exceeds `--max-usd`. Writes the manifest, the system prompt
 *            and the state (batch ids, git commit) under `--out`.
 *   collect  polls each batch and downloads the results of every ended one; re-runnable, and it
 *            resumes (a batch whose results file exists is skipped). `--wait` polls until done.
 *   build    deterministic, no network: raw results + manifest -> `model-authoring.jsonl` and a
 *            report. Refuses unless the repository is at the commit `submit` ran at. Every row is
 *            written, parsed back and replayed before it is kept.
 *
 * `--out` defaults to `dataset/out/model-authoring` (git-ignored, HF-only). The API key comes
 * from `ANTHROPIC_API_KEY` and is never printed or written.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANARY } from "../canary.js";
import { normalizeText, structReject } from "../dedup.js";
import { DEFAULT_SEED as PUBLISHED_SEED } from "../generate.js";
import { type BatchInfo, type FetchLike, batchRequest, createBatch, downloadResults, retrieveBatch } from "./batch.js";
import { type Corpora, evalGoldenTexts, evalIndex, fidelityIndex, loadCorpora } from "./corpora.js";
import {
  type BriefSet,
  DEFAULT_BRIEF_SEED,
  buildBriefSet,
  byCodeUnit,
  manifestJsonl,
  parseManifest,
} from "./manifest.js";
import {
  CHARS_PER_TOKEN,
  type CacheTtl,
  type ModelCost,
  TYPICAL_OUTPUT_TOKENS,
  estimateCost,
  resolveModel,
} from "./prices.js";
import {
  CONFIG_NAME,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  type ResultLine,
  deriveRow,
  fencedBlocks,
  systemPromptOf,
  verifyRow,
} from "./rows.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_OUT = "dataset/out/model-authoring";
export const DEFAULT_BRIEFS = 400;
export const DEFAULT_MODELS = ["haiku-5-5", "sonnet-5-5", "opus-5-5"];
/** As the eval harness: sized so truncation measures authorability, not the budget. */
export const MAX_TOKENS = 16384;
/** The Message Batches request-body cap is 256 MB; stay under it with margin. */
const MAX_BATCH_BYTES = 200 * 1024 * 1024;
/** The shortest `--poll` interval, in seconds. */
export const MIN_POLL_SECONDS = 5;

export const FILES = {
  state: "state.json",
  manifest: "briefs.jsonl",
  system: "system-prompt.txt",
  rows: "model-authoring.jsonl",
  report: "model-authoring-report.json",
  resultsDir: "results",
  results: (model: string): string => join("results", `${model}.jsonl`),
};

export const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** The pinned ArchLang version (read, never hardcoded). */
export function archlangVersion(): string {
  return (JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
}

/** The system prompt: `spec.llm.md` plus the reply-format line. */
export function systemPrompt(): string {
  return systemPromptOf(readFileSync(resolve(REPO_ROOT, "spec.llm.md"), "utf8"));
}

/** The repository's commit and whether its working tree has uncommitted changes. */
export interface GitState {
  commit: string;
  dirty: boolean;
}

/** Read the git state of the repository this file lives in. */
export function readGitState(): GitState {
  const git = (args: string[]): string => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  return { commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "" };
}

// ---------------------------------------------------------------------------
// Flags. Unknown flags and out-of-range values are refused, never defaulted.
// ---------------------------------------------------------------------------

/** Flags that take a value, and flags that stand alone. */
const VALUE_FLAGS = ["--out", "--seed", "--briefs", "--models", "--max-usd", "--cache-ttl", "--poll"];
const BOOL_FLAGS = ["--yes", "--wait"];

/** The phase options every phase shares, parsed from argv. */
export interface Options {
  out: string;
  seed: number;
  briefs: number;
  models: string[];
  maxUsd: number | null;
  yes: boolean;
  ttl: CacheTtl;
  wait: boolean;
  pollSeconds: number;
}

/** Parse the flags after the phase. `errors` is non-empty when any flag is unknown or invalid. */
export function parseOptions(argv: string[]): { opts: Options; errors: string[] } {
  const errors: string[] = [];
  const values = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (BOOL_FLAGS.includes(a)) bools.add(a);
    else if (VALUE_FLAGS.includes(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--") || v.trim() === "") errors.push(`${a} needs a value`);
      else {
        values.set(a, v);
        i++;
      }
    } else errors.push(`unknown argument ${JSON.stringify(a)}`);
  }
  const int = (name: string, def: number, min: number): number => {
    const raw = values.get(name);
    if (raw === undefined) return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) {
      errors.push(`${name} must be an integer >= ${min} (got ${JSON.stringify(raw)})`);
      return def;
    }
    return n;
  };
  const seed = int("--seed", DEFAULT_BRIEF_SEED, 0);
  if (seed === PUBLISHED_SEED)
    errors.push(`--seed ${PUBLISHED_SEED} is the published default config's seed; use another`);
  const briefs = int("--briefs", DEFAULT_BRIEFS, 1);
  const pollSeconds = int("--poll", 60, MIN_POLL_SECONDS);
  let maxUsd: number | null = null;
  const rawUsd = values.get("--max-usd");
  if (rawUsd !== undefined) {
    const n = Number(rawUsd);
    if (!Number.isFinite(n) || n <= 0)
      errors.push(`--max-usd must be a positive number (got ${JSON.stringify(rawUsd)})`);
    else maxUsd = n;
  }
  const rawTtl = values.get("--cache-ttl") ?? "5m";
  if (rawTtl !== "5m" && rawTtl !== "1h") errors.push(`--cache-ttl must be 5m or 1h (got ${JSON.stringify(rawTtl)})`);
  const models = values.get("--models");
  return {
    opts: {
      out: resolve(REPO_ROOT, values.get("--out") ?? DEFAULT_OUT),
      seed,
      briefs,
      models: models
        ? models
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean)
        : DEFAULT_MODELS,
      maxUsd,
      yes: bools.has("--yes"),
      ttl: rawTtl === "1h" ? "1h" : "5m",
      wait: bools.has("--wait"),
      pollSeconds,
    },
    errors,
  };
}

/** What a phase needs from the outside world; tests pass fakes. */
export interface Deps {
  fetch: FetchLike;
  apiKey: string | undefined;
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  /** The repository's git state; read with `git` when absent. */
  git?: () => GitState;
  /** The brief set; computed from the seed and the three corpora when absent. */
  briefSet?: BriefSet;
  /** The system prompt; `spec.llm.md` + the reply-format line when absent. */
  system?: string;
}

/** The state file `submit` writes. Its existence is what makes `submit` refuse. */
export interface State {
  config: string;
  generator: { name: string; version: string };
  archlang_version: string;
  canary: string;
  git: GitState;
  seed: number;
  briefs: number;
  max_tokens: number;
  cache_ttl: CacheTtl;
  system_prompt_sha256: string;
  manifest_sha256: string;
  brief_set: { requested: number; emitted: number; attempts: number; rejections: Record<string, number> };
  /** Every model submit was asked for, in order; `batches` holds those it created a batch for. */
  models: string[];
  /** True once every batch was created; false means submit stopped part-way (inspect, never re-submit blindly). */
  complete: boolean;
  batches: { model: string; batch_id: string; requests: number }[];
  error?: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const writeText = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
};
const writeJson = (path: string, v: unknown): void => writeText(path, `${JSON.stringify(v, null, 2)}\n`);

function briefSetOf(opts: Options, deps: Deps): BriefSet {
  if (deps.briefSet) return deps.briefSet;
  deps.log("building briefs: indexing the downloaded published splits for dedup (about a minute)...");
  return buildBriefSet(opts.seed, opts.briefs, loadCorpora());
}

/** Resolve `--models`; null (with a logged reason) when one is unknown. */
function resolveModels(names: string[], log: (l: string) => void): string[] | null {
  const out: string[] = [];
  for (const n of names) {
    const id = resolveModel(n);
    if (!id) {
      log(`✗ model "${n}" has no copied price in dataset/model-authoring/prices.ts; refusing (cost unbounded)`);
      return null;
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

const usd = (n: number): string => `$${n.toFixed(2)}`;

function costs(models: string[], set: BriefSet, system: string, ttl: CacheTtl): ModelCost[] {
  const userChars = set.entries.reduce((s, e) => s + e.brief.length, 0);
  return models.map((m) => estimateCost(m, set.entries.length, system.length, userChars, MAX_TOKENS, ttl));
}

function printPlan(
  opts: Options,
  models: string[],
  set: BriefSet,
  system: string,
  log: (l: string) => void,
): ModelCost[] {
  const cs = costs(models, set, system, opts.ttl);
  log("model-authoring plan (no API call)");
  log(
    `  briefs: ${set.entries.length} of ${set.requested} requested (seed ${set.seed}, ${set.attempts} attempts; rejections ${JSON.stringify(set.rejections)})`,
  );
  log(
    `  system prompt: spec.llm.md + reply-format line, ${system.length} chars; cache_control ephemeral (${opts.ttl}); max_tokens ${MAX_TOKENS}`,
  );
  log(
    `  prices: list (copied from eval/run.ts) x 0.5 Batch, per-model cache multipliers; input tokens ESTIMATED at ${CHARS_PER_TOKEN} chars/token, not counted`,
  );
  log("  model               requests  input tok (est)  cache hits  no cache hits  est. ceiling (max_tokens)");
  const row = (name: string, req: number, tok: number, a: number, b: number, c: number): string =>
    `  ${name.padEnd(19)} ${String(req).padStart(8)}  ${String(tok).padStart(15)}  ${usd(a).padStart(10)}  ${usd(b).padStart(13)}  ${usd(c).padStart(25)}`;
  for (const c of cs) log(row(c.model, c.requests, c.inputTokens, c.cachedEstimateUsd, c.estimateUsd, c.ceilingUsd));
  const sum = (f: (c: ModelCost) => number): number => cs.reduce((s, c) => s + f(c), 0);
  log(
    row(
      "total",
      sum((c) => c.requests),
      sum((c) => c.inputTokens),
      sum((c) => c.cachedEstimateUsd),
      sum((c) => c.estimateUsd),
      sum((c) => c.ceilingUsd),
    ),
  );
  log(
    `  output: ${TYPICAL_OUTPUT_TOKENS} tokens per reply assumed for the two estimates; the ceiling bills max_tokens on every reply (its input part is still the estimate)`,
  );
  return cs;
}

// ---------------------------------------------------------------------------
// Phases. Each returns a process exit code.
// ---------------------------------------------------------------------------

export function runPlan(opts: Options, deps: Deps): number {
  const models = resolveModels(opts.models, deps.log);
  if (!models) return 2;
  printPlan(opts, models, briefSetOf(opts, deps), deps.system ?? systemPrompt(), deps.log);
  return 0;
}

export async function runSubmit(opts: Options, deps: Deps): Promise<number> {
  const statePath = join(opts.out, FILES.state);
  if (existsSync(statePath)) {
    deps.log(`✗ ${statePath} exists: batches were already submitted from it. Refusing to submit again.`);
    deps.log("  Run `collect` / `build`, or move the directory aside to start a new run.");
    return 2;
  }
  if (existsSync(join(opts.out, FILES.resultsDir))) {
    deps.log(`✗ ${join(opts.out, FILES.resultsDir)} exists: results from an earlier run are here. Refusing.`);
    return 2;
  }
  if (!opts.yes) {
    deps.log("✗ submit is paid and owner-only: pass --yes to confirm (run `plan` first to see the cost).");
    return 3;
  }
  if (opts.maxUsd === null) {
    deps.log("✗ submit needs --max-usd <n>: the estimated cost ceiling must be capped explicitly.");
    return 2;
  }
  if (!deps.apiKey) {
    deps.log("✗ ANTHROPIC_API_KEY is not set.");
    return 2;
  }
  const models = resolveModels(opts.models, deps.log);
  if (!models) return 2;
  const set = briefSetOf(opts, deps);
  if (set.entries.length < opts.briefs) {
    deps.log(`✗ only ${set.entries.length} of ${opts.briefs} briefs passed the gates; refusing a short run.`);
    return 2;
  }
  const system = deps.system ?? systemPrompt();
  const cs = printPlan(opts, models, set, system, deps.log);
  const ceiling = cs.reduce((s, c) => s + c.ceilingUsd, 0);
  if (ceiling > opts.maxUsd) {
    deps.log(`✗ estimated cost ceiling ${usd(ceiling)} exceeds --max-usd ${usd(opts.maxUsd)}; refusing.`);
    return 2;
  }

  const manifest = manifestJsonl(set.entries);
  const state: State = {
    config: CONFIG_NAME,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    archlang_version: archlangVersion(),
    canary: CANARY,
    git: (deps.git ?? readGitState)(),
    seed: set.seed,
    briefs: set.entries.length,
    max_tokens: MAX_TOKENS,
    cache_ttl: opts.ttl,
    system_prompt_sha256: sha256(system),
    manifest_sha256: sha256(manifest),
    brief_set: {
      requested: set.requested,
      emitted: set.entries.length,
      attempts: set.attempts,
      rejections: set.rejections,
    },
    models,
    complete: false,
    batches: [],
  };
  // The state is written BEFORE the first paid call, so an interrupted submit can never be
  // re-run blindly: whatever was created is recorded, and the file blocks a second submit.
  writeText(join(opts.out, FILES.manifest), manifest);
  writeText(join(opts.out, FILES.system), system);
  writeJson(statePath, state);
  for (const model of models) {
    const requests = set.entries.map((e) => batchRequest(e.brief_id, model, system, e.brief, MAX_TOKENS, opts.ttl));
    const bytes = Buffer.byteLength(JSON.stringify({ requests }), "utf8");
    let info: BatchInfo;
    try {
      if (bytes > MAX_BATCH_BYTES) throw new Error(`batch body ${bytes} bytes exceeds ${MAX_BATCH_BYTES}`);
      info = await createBatch(deps.fetch, deps.apiKey, requests);
    } catch (e) {
      state.error = `${model}: ${(e as Error).message}`;
      writeJson(statePath, state);
      deps.log(`✗ submit stopped at ${model}: ${(e as Error).message}`);
      deps.log(`  ${state.batches.length} batch(es) were created and are recorded in ${statePath}.`);
      return 1;
    }
    // Recorded the moment it exists, before anything else can fail.
    state.batches.push({ model, batch_id: info.id, requests: requests.length });
    writeJson(statePath, state);
    deps.log(`  submitted ${model}: batch ${info.id} (${requests.length} requests)`);
  }
  state.complete = true;
  writeJson(statePath, state);
  deps.log(`✓ ${state.batches.length} batch(es) submitted; state in ${statePath}`);
  return 0;
}

/** The models submit was asked for but created no batch for (it stopped part-way). */
const unsubmitted = (state: State): string[] =>
  (state.models ?? []).filter((m) => !state.batches.some((b) => b.model === m));

/** One collect pass. Returns how many batches still lack results. */
async function collectOnce(opts: Options, deps: Deps, state: State, apiKey: string): Promise<number> {
  let pending = 0;
  for (const b of state.batches) {
    const path = join(opts.out, FILES.results(b.model));
    if (existsSync(path)) {
      deps.log(`  ${b.model}: collected (${path})`);
      continue;
    }
    const info: BatchInfo = await retrieveBatch(deps.fetch, apiKey, b.batch_id);
    if (info.processing_status !== "ended") {
      pending++;
      deps.log(`  ${b.model}: ${info.processing_status} ${JSON.stringify(info.request_counts ?? {})}`);
      continue;
    }
    const raw = await downloadResults(deps.fetch, apiKey, info);
    // Write-then-rename, so a half-written file never counts as collected.
    writeText(`${path}.partial`, raw);
    renameSync(`${path}.partial`, path);
    deps.log(`  ${b.model}: ended ${JSON.stringify(info.request_counts ?? {})}; results saved`);
  }
  return pending;
}

export async function runCollect(opts: Options, deps: Deps): Promise<number> {
  const statePath = join(opts.out, FILES.state);
  if (!existsSync(statePath)) {
    deps.log(`✗ no ${statePath}: nothing was submitted.`);
    return 2;
  }
  if (!deps.apiKey) {
    deps.log("✗ ANTHROPIC_API_KEY is not set.");
    return 2;
  }
  const state = readJson<State>(statePath);
  if (!state.complete)
    deps.log(`⚠ submit stopped part-way (${state.error ?? "unknown"}); collecting the batches it created.`);
  for (const m of unsubmitted(state))
    deps.log(`  ${m}: no batch was created (submit stopped first); nothing to collect`);
  for (;;) {
    const pending = await collectOnce(opts, deps, state, deps.apiKey);
    if (pending === 0) {
      deps.log(`✓ all ${state.batches.length} created batch(es) collected`);
      return 0;
    }
    if (!opts.wait) {
      deps.log(`${pending} batch(es) still processing; re-run collect (or pass --wait).`);
      return 4;
    }
    await deps.sleep(opts.pollSeconds * 1000);
  }
}

/** Parse a results file into lines keyed by custom_id (a repeated id is an error). */
export function parseResults(raw: string): Map<string, ResultLine> {
  const out = new Map<string, ResultLine>();
  for (const l of raw.split("\n")) {
    if (!l.trim()) continue;
    const line = JSON.parse(l) as ResultLine;
    if (out.has(line.custom_id)) throw new Error(`results repeat custom_id ${line.custom_id}`);
    out.set(line.custom_id, line);
  }
  return out;
}

class Tally {
  readonly map = new Map<string, number>();
  bump(k: string, by = 1): void {
    this.map.set(k, (this.map.get(k) ?? 0) + by);
  }
  toObject(): Record<string, number> {
    return Object.fromEntries([...this.map.entries()].sort((a, b) => byCodeUnit(a[0], b[0])));
  }
}

/**
 * The leak gate on one reply: why it may not be published, or null. The reply text, normalized,
 * may not contain any eval golden or reference plan; and no fenced block in it, nor the healed
 * plan, may match one structurally. Fingerprints of model text use no World (no file is read).
 */
export function leakReason(
  rawReply: string,
  healed: string,
  goldens: { norm: string }[],
  corpora: Pick<Corpora, "eval" | "fidelity">,
): string | null {
  const norm = normalizeText(rawReply);
  if (goldens.some((g) => norm.includes(g.norm))) return "leak-golden-text";
  for (const src of [...fencedBlocks(rawReply), healed]) {
    if (structReject(src, corpora.eval, null).reject || structReject(src, corpora.fidelity, null).reject)
      return "leak-structure";
  }
  return null;
}

/** Build the rows and the report in memory (pure given the files and the git state). */
export function buildAll(
  out: string,
  corpora: Pick<Corpora, "eval" | "fidelity"> = { eval: evalIndex(), fidelity: fidelityIndex() },
  git: GitState = readGitState(),
): { jsonl: string; report: Record<string, unknown> } | { error: string } {
  const state = readJson<State>(join(out, FILES.state));
  const manifestText = readFileSync(join(out, FILES.manifest), "utf8");
  if (sha256(manifestText) !== state.manifest_sha256)
    return { error: "briefs.jsonl does not match the state's sha256" };
  const system = readFileSync(join(out, FILES.system), "utf8");
  if (sha256(system) !== state.system_prompt_sha256) return { error: "system-prompt.txt does not match the state" };
  const version = archlangVersion();
  if (version !== state.archlang_version)
    return {
      error: `submitted against archlang ${state.archlang_version}, running ${version}; build with the pinned version`,
    };
  if (git.commit !== state.git.commit)
    return {
      error: `submitted at commit ${state.git.commit}, repository is at ${git.commit}; check that commit out to build`,
    };
  const manifest = parseManifest(manifestText);
  const goldens = evalGoldenTexts();

  const rows: string[] = [];
  const perModel: Record<string, unknown>[] = [];
  for (const b of state.batches) {
    const path = join(out, FILES.results(b.model));
    if (!existsSync(path)) return { error: `no results for ${b.model}: run collect first` };
    let results: Map<string, ResultLine>;
    try {
      results = parseResults(readFileSync(path, "utf8"));
    } catch (e) {
      return { error: `${path}: ${(e as Error).message}` };
    }
    const t = {
      results: new Tally(),
      skipped: new Tally(),
      stop: new Tally(),
      fixKind: new Tally(),
      verdict: new Tally(),
      usage: new Tally(),
    };
    let emitted = 0;
    // Every line of the results file is tallied by type; a line naming no manifest brief is
    // counted too (it cannot be a row: there is no brief to pair it with).
    const known = new Set(manifest.map((e) => e.brief_id));
    for (const [id, line] of results) {
      t.results.bump(line.result.type);
      if (!known.has(id)) t.skipped.bump("unknown-custom-id");
    }
    for (const entry of manifest) {
      const line = results.get(entry.brief_id);
      if (!line) {
        t.skipped.bump("missing-result");
        continue;
      }
      if (line.result.type !== "succeeded") {
        t.skipped.bump(`result-${line.result.type}`);
        continue;
      }
      const row = deriveRow(entry, line, {
        model: b.model,
        batchId: b.batch_id,
        systemPromptSha256: state.system_prompt_sha256,
        archlangVersion: version,
        gitCommit: state.git.commit,
        gitDirty: state.git.dirty,
      });
      const leak = leakReason(row.raw_reply as string, row.after_repair_source as string, goldens, corpora);
      if (leak) {
        t.skipped.bump(leak);
        continue;
      }
      // Replay from the bytes that will be written, not from the in-memory object.
      const text = JSON.stringify(row);
      const v = verifyRow(JSON.parse(text) as Record<string, unknown>, version);
      if (!v.ok) {
        t.skipped.bump("self-verify-failed");
        continue;
      }
      rows.push(text);
      emitted++;
      t.stop.bump(String(row.stop_reason));
      t.fixKind.bump(row.fix_kind as string);
      const l0 = row.l0 as { valid: boolean; sound: boolean };
      const fin = row.final as { valid: boolean; sound: boolean };
      t.verdict.bump(`l0_valid:${l0.valid}`);
      t.verdict.bump(`l0_sound:${l0.sound}`);
      t.verdict.bump(`final_valid:${fin.valid}`);
      t.verdict.bump(`final_sound:${fin.sound}`);
      for (const [k, val] of Object.entries((row.usage as Record<string, unknown> | null) ?? {})) {
        if (typeof val === "number") t.usage.bump(k, val);
      }
    }
    perModel.push({
      model: b.model,
      batch_id: b.batch_id,
      requested: b.requests,
      emitted,
      result_types: t.results.toObject(),
      not_emitted: t.skipped.toObject(),
      stop_reasons: t.stop.toObject(),
      fix_kind: t.fixKind.toObject(),
      verdict_counts: t.verdict.toObject(),
      usage_totals: t.usage.toObject(),
    });
  }
  const report = {
    config: CONFIG_NAME,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    archlang_version: version,
    canary: CANARY,
    git: state.git,
    seed: state.seed,
    briefs: state.briefs,
    brief_set: state.brief_set,
    max_tokens: state.max_tokens,
    system_prompt_sha256: state.system_prompt_sha256,
    rows: rows.length,
    models: perModel,
    models_not_submitted: unsubmitted(state),
  };
  return { jsonl: rows.map((r) => `${r}\n`).join(""), report };
}

export function runBuild(opts: Options, deps: Pick<Deps, "log" | "git">): number {
  if (!existsSync(join(opts.out, FILES.state))) {
    deps.log(`✗ no ${join(opts.out, FILES.state)}: nothing was submitted.`);
    return 2;
  }
  const res = buildAll(opts.out, undefined, (deps.git ?? readGitState)());
  if ("error" in res) {
    deps.log(`✗ ${res.error}`);
    return 2;
  }
  writeText(join(opts.out, FILES.rows), res.jsonl);
  writeJson(join(opts.out, FILES.report), res.report);
  deps.log(`✓ ${res.report.rows as number} row(s) -> ${join(opts.out, FILES.rows)}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

const USAGE = "usage: npm run dataset:model-authoring -- plan|submit|collect|build [flags] (see dataset/README.md)";

export async function main(argv: string[], deps: Deps): Promise<number> {
  const [phase, ...rest] = argv;
  const { opts, errors } = parseOptions(rest);
  if (errors.length) {
    for (const e of errors) deps.log(`✗ ${e}`);
    deps.log(USAGE);
    return 2;
  }
  switch (phase) {
    case "plan":
      return runPlan(opts, deps);
    case "submit":
      return runSubmit(opts, deps);
    case "collect":
      return runCollect(opts, deps);
    case "build":
      return runBuild(opts, deps);
    default:
      deps.log(USAGE);
      return 2;
  }
}

if (/model-authoring[\\/]cli\.ts$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2), {
    fetch: globalThis.fetch as unknown as FetchLike,
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    log: (l) => process.stderr.write(`${l}\n`),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      process.stderr.write(`✗ ${(e as Error).message}\n`);
      process.exitCode = 1;
    },
  );
}
