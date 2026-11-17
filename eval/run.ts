/**
 * NL → ArchLang eval harness.
 *
 * Measures (and protects) the one claim that makes ArchLang "AI-first": that a model,
 * given the one-page spec, writes valid, sound, intent-matching `.arch` from a plain
 * English brief. Each corpus entry pairs a natural-language prompt with a golden
 * `.arch` and a set of semantic expectations (room count, labels, floor-area range).
 *
 *   - **offline** (default, CI-safe): score the committed goldens through
 *     compile → lint → describe. This guards *authorability regressions* — if a
 *     language change breaks a plan a model already wrote, the eval fails. No API key.
 *     Writes the committed scorecard `eval/results.md`.
 *   - **live** (`--live`, needs an API key): ask a model to author each plan from the
 *     prompt (system prompt: `spec.llm.md` + a reply-format line, {@link systemPrompt}) and score that. This produces
 *     the headline number for the README.
 *
 * Because live runs cost money, `--live` is guarded: it prints what it *would* send
 * (provider, model, brief count) and exits `3` **without calling any API** unless you
 * pass `--yes` (or set `ARCHLANG_EVAL_CONFIRM=1`). `--max <n>` caps how many briefs
 * run; `--budget <n>tok|usd` is a cumulative-usage circuit breaker; `--l1` overlays the
 * deterministic-repair tier (ΔL0→L1, zero extra API calls) — all three are live-only.
 * Live output is written to `eval/results.live.md` (git-ignored, ephemeral — the numbers
 * move with the model and the day) and always ends with a "Delta vs baseline" section
 * (always L0, never mixed with L1): the delta against `eval/live-baseline.json` when that file
 * exists, else only this run's prompt hashes, for the next baseline to record. A baseline that
 * exists but is unreadable or invalid stops the run before any call. The offline path is
 * unchanged.
 *
 * Run: `npm run eval` / `npm run eval:ci` (offline) · `npm run eval:live -- --yes`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile, describe as describePlan, lint } from "../src/index.js";
import type { Intent } from "../src/intent.js";
import { extractArch, firstArchFence } from "../dataset/model-authoring/reply.js";
import {
  type AssertionResult,
  type Subscores,
  JUDGE_VERSION,
  checkPredicates,
  compileExpect,
  projectSubscores,
} from "./assertions.js";
import { SYNONYMS_VERSION } from "./synonyms.js";
import { l1Pipeline } from "./l1.js";
import { wilson95 } from "./stats.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** The judge/concept-table version tag stamped into every result header
 *  (`judge v2 · synonyms v1`). Exported so the L2 harness (`eval/l2-run.ts`) can stamp
 *  the same tag without importing the private oracle module directly — keeping its own
 *  source free of any reference to that table (oracle isolation is source-checked). */
export const VERSION_TAG = `judge v${JUDGE_VERSION} · synonyms v${SYNONYMS_VERSION}`;

/**
 * A brief's semantic expectations — the judge-v2 shape, now the production {@link Intent}
 * type (lifted into `src/intent.ts` in v1.14 T4; re-exported here so the eval and shipped
 * judge share ONE definition). Every field is BRIEF-grounded (derived from the prompt's
 * words, not the golden's labels/geometry): concepts come from the {@link
 * import("./synonyms.js")} oracle, and quantitative bands (`areaM2`/`totalAreaM2`) carry a
 * `source` quote from the brief so a failure can cite what licensed the number.
 * `adjacency`/`reachable` are asserted only where the brief's own words license them; they
 * score as subscores and never gate.
 */
export type Expect = Intent;

export interface CorpusEntry {
  id: string;
  prompt: string;
  golden: string;
  expect: Expect;
}

/** Lint codes that flag a *physically impossible* plan — never acceptable in a golden,
 *  unlike habitability advisories (no window, small room) a brief may legitimately omit. */
const PHYSICAL_CODES = new Set(["W_FURNITURE_WALL_COLLISION", "W_DOORWAY_BLOCKED", "W_ROOM_NO_CLEAR_PATH"]);

export interface Score {
  id: string;
  /** Compiled with no errors and produced a drawing. */
  valid: boolean;
  /** Architectural lint warnings raised (0 = sound). */
  lintWarnings: number;
  /** Physical-correctness violations (furniture through a wall, blocked doorway, sealed room). */
  physicalWarnings: number;
  /** All semantic expectations met (implies valid + no physical violations). */
  semanticPass: boolean;
  /** Human-readable reasons any check failed. */
  failures: string[];
  /** Per-dimension scores (rooms/labels/area/adjacency). Omitted on the invalid path. */
  subscores?: Subscores;
  /** Every intent predicate's result (gating and subscore-only). Omitted when invalid. */
  assertions?: AssertionResult[];
  /** Scoring core version this row was produced by (`"2"` = intent assertions). */
  judgeVersion?: string;
  /** Live-only: the `--budget` circuit breaker tripped before this brief ran, so it was
   *  never authored/scored. Excluded from every summary denominator. */
  skipped?: true;
}

/** Load the corpus (entries with golden paths resolved relative to the repo root). */
export function loadCorpus(text: string = readCorpusText()): CorpusEntry[] {
  return JSON.parse(text) as CorpusEntry[];
}

/** The raw text of `eval/corpus.json`; a live run reads it once, parses and hashes that one string. */
export function readCorpusText(): string {
  return readFileSync(resolve(ROOT, "eval/corpus.json"), "utf8");
}

/** Read an entry's committed golden source. */
export function readGolden(entry: CorpusEntry): string {
  return readFileSync(resolve(ROOT, entry.golden), "utf8");
}

/** Score a single (entry, source) pair: valid? sound? matches intent? */
export function scoreSource(entry: CorpusEntry, source: string): Score {
  const failures: string[] = [];

  const c = compile(source, { noCache: true });
  const valid = c.errors.length === 0 && c.svg.length > 0;
  if (!valid) {
    // Invalid path: no facts to project subscores from — leave them undefined.
    for (const e of c.errors) failures.push(`compile: ${e.message}`);
    return {
      id: entry.id,
      valid: false,
      lintWarnings: 0,
      physicalWarnings: 0,
      semanticPass: false,
      failures,
      judgeVersion: JUDGE_VERSION,
    };
  }

  const lintDiags = lint(source);
  const lintWarnings = lintDiags.length;
  const physicalWarnings = lintDiags.filter((d) => d.code && PHYSICAL_CODES.has(d.code)).length;
  // A physically impossible plan never "authors correctly", whatever its room count.
  for (const d of lintDiags) {
    if (d.code && PHYSICAL_CODES.has(d.code)) failures.push(`physical: ${d.code} — ${d.message}`);
  }

  // Intent: compile the brief's Expect to predicates, check them against the facts.
  const summary = describePlan(source);
  const preds = compileExpect(entry.expect);
  const assertions = checkPredicates(preds, summary);
  // Only gating predicates (room-count/exists/area) fail a plan; adjacent/reachable
  // are subscore-only in Tier 1. Conjunctive meaning unchanged from judge v1.
  for (const a of assertions) {
    if (a.predicate.gate && !a.pass) failures.push(a.detail);
  }
  const subscores = projectSubscores(assertions);

  return {
    id: entry.id,
    valid,
    lintWarnings,
    physicalWarnings,
    semanticPass: failures.length === 0,
    failures,
    subscores,
    assertions,
    judgeVersion: JUDGE_VERSION,
  };
}

/** A row's headline verdict, ordered fail < warns < pass (see {@link STATUS_RANK}). */
type RowStatus = "pass" | "warns" | "fail";

/** Classify a score into its table verdict. `semanticPass` with no lint = a clean pass;
 *  `semanticPass` with advisory lint = warns; anything else = fail. */
function statusOf(r: Score): RowStatus {
  if (!r.semanticPass) return "fail";
  return r.lintWarnings === 0 ? "pass" : "warns";
}

/** The exact status cell strings (kept identical to the historical inline literals). */
const STATUS_LABEL: Record<RowStatus, string> = {
  pass: "✅ pass",
  warns: "⚠️ warns",
  fail: "❌ fail",
};

/** Verdict ordering so an L0→L1 transition can be called an improvement or a regression. */
const STATUS_RANK: Record<RowStatus, number> = { fail: 0, warns: 1, pass: 2 };

/** One brief's L1 overlay: the same authored source re-scored after the deterministic
 *  {@link l1Pipeline} healers (`arch fix` + `arch repair`). `raw === undefined` means the
 *  brief produced no source (an API/parse error) — there is nothing to heal, so L1 mirrors
 *  L0 exactly (the deterministic tools cannot rescue a plan the model never emitted). */
export interface L1Row {
  id: string;
  /** The L0 verdict, so a transition can be shown/counted. */
  l0Status: RowStatus;
  /** The L1 score (produced by {@link scoreSource} verbatim — same judge as L0). */
  l1: Score;
  /** Machine-applicable fix span-edits committed by the pipeline. */
  fixesApplied: number;
  /** Furniture pieces `repair` moved. */
  repairChanges: number;
}

/** Build one brief's L1 overlay from its authored source. Pure and deterministic (a fixed
 *  `(entry, l0, raw)` always yields a deeply-equal row); exported for unit testing. */
export function l1Row(entry: CorpusEntry, l0: Score, raw: string | undefined): L1Row {
  const l0Status = statusOf(l0);
  if (raw === undefined)
    return {
      id: entry.id,
      l0Status,
      l1: l0,
      fixesApplied: 0,
      repairChanges: 0,
    };
  const healed = l1Pipeline(raw);
  return {
    id: entry.id,
    l0Status,
    l1: scoreSource(entry, healed.source),
    fixesApplied: healed.fixesApplied,
    repairChanges: healed.repairChanges,
  };
}

/** The L1 overlay for every NON-skipped brief (skipped briefs have no source to heal and
 *  are excluded from both tiers). `rawById` carries each brief's authored L0 source. */
function computeL1Overlay(entries: CorpusEntry[], l0: Score[], rawById: Map<string, string>): L1Row[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return l0.filter((r) => !r.skipped).map((r) => l1Row(byId.get(r.id) as CorpusEntry, r, rawById.get(r.id)));
}

/** Summarise the L1 tier over the same non-skipped denominator as its L0 summary. */
function summarizeL1(rows: L1Row[]): Summary {
  return {
    total: rows.length,
    valid: rows.filter((x) => x.l1.valid).length,
    semanticPass: rows.filter((x) => x.l1.semanticPass).length,
    sound: rows.filter((x) => x.l1.valid && x.l1.lintWarnings === 0).length,
  };
}

/** The L1 overlay bundle threaded into {@link renderResults}. */
interface L1Overlay {
  rows: L1Row[];
  summary: Summary;
}

/** Score every entry; `getSource` decides where the `.arch` comes from (golden or model).
 *  `opts.beforeEach` (live only) is consulted BEFORE each brief; when it returns true the
 *  `--budget` breaker has tripped, so the brief is recorded as `skipped` and never
 *  authored. With no `opts` (the offline path) this is byte-identical to the 2-arg form. */
export async function evaluate(
  entries: CorpusEntry[],
  getSource: (e: CorpusEntry) => string | Promise<string>,
  opts?: { beforeEach?: (e: CorpusEntry) => boolean },
): Promise<{ results: Score[]; summary: Summary }> {
  const results: Score[] = [];
  let scored = 0;
  for (const entry of entries) {
    if (opts?.beforeEach?.(entry)) {
      results.push({
        id: entry.id,
        valid: false,
        lintWarnings: 0,
        physicalWarnings: 0,
        semanticPass: false,
        failures: [`budget: skipped — budget exhausted after ${scored} briefs`],
        skipped: true,
      });
      continue;
    }
    let source: string;
    try {
      source = await getSource(entry);
    } catch (err) {
      results.push({
        id: entry.id,
        valid: false,
        lintWarnings: 0,
        physicalWarnings: 0,
        semanticPass: false,
        failures: [`source: ${(err as Error).message}`],
      });
      scored++;
      continue;
    }
    results.push(scoreSource(entry, source));
    scored++;
  }
  // Skipped briefs are excluded from every denominator — the rates describe only the
  // briefs actually authored. With no skips this yields the pre-budget summary exactly.
  const done = results.filter((r) => !r.skipped);
  const skipped = results.length - done.length;
  const summary: Summary = {
    total: done.length,
    valid: done.filter((r) => r.valid).length,
    semanticPass: done.filter((r) => r.semanticPass).length,
    sound: done.filter((r) => r.valid && r.lintWarnings === 0).length,
    ...(skipped > 0 ? { skipped } : {}),
  };
  return { results, summary };
}

/** The committed judge fixture (`eval/judge-fixture.json`): every golden's pinned `Score`, in
 *  corpus order, and a per-row `notes` reason for any judgment a plan-soundness decision moved. */
export interface JudgeFixture {
  judgeVersion: string;
  synonymsVersion: number;
  scores: Score[];
  notes?: Record<string, string>;
}

export function readJudgeFixture(): JudgeFixture {
  return JSON.parse(readFileSync(resolve(ROOT, "eval/judge-fixture.json"), "utf8")) as JudgeFixture;
}

/** One golden whose offline result is not the one the fixture records. */
export interface FixtureRegression {
  id: string;
  why: string;
}

/**
 * The offline gate (plan-soundness D25's consequence): the committed judge fixture is the truth, so
 * a golden regresses only when its result differs from the one recorded there. A golden recorded as
 * passing that now fails, one whose `physicalWarnings` or `lintWarnings` differ from the fixture's,
 * or one the fixture has no row for. A golden the fixture records as failing (a ratified judgment,
 * with its reason in `notes`) is not a regression while it fails as recorded. No threshold: the gate
 * never asks for a pass count, only for agreement with the fixture.
 */
export function regressionsAgainstFixture(results: readonly Score[], fixture: JudgeFixture): FixtureRegression[] {
  const pinned = new Map(fixture.scores.map((s) => [s.id, s]));
  const out: FixtureRegression[] = [];
  for (const r of results) {
    const f = pinned.get(r.id);
    if (!f) {
      out.push({ id: r.id, why: "no row in the judge fixture" });
      continue;
    }
    const why: string[] = [];
    if (f.semanticPass && !r.semanticPass) why.push("recorded as passing, now fails");
    if (r.physicalWarnings !== f.physicalWarnings)
      why.push(`physicalWarnings ${f.physicalWarnings} → ${r.physicalWarnings}`);
    if (r.lintWarnings !== f.lintWarnings) why.push(`lintWarnings ${f.lintWarnings} → ${r.lintWarnings}`);
    if (why.length > 0) out.push({ id: r.id, why: why.join(", ") });
  }
  return out;
}

/** The offline gate's verdict line, and whether it fails ({@link regressionsAgainstFixture}). The
 *  decisions behind the goldens recorded as failing are read off their fixture notes (`D25 …`). */
export function fixtureVerdict(results: readonly Score[], fixture: JudgeFixture): { ok: boolean; line: string } {
  const regressed = regressionsAgainstFixture(results, fixture);
  if (regressed.length > 0)
    return {
      ok: false,
      line: `✗ ${regressed.length} golden(s) regressed against the fixture: ${regressed.map((x) => `${x.id} (${x.why})`).join("; ")}`,
    };
  const pass = results.filter((r) => r.semanticPass).length;
  const failing = results.filter((r) => !r.semanticPass);
  const decisions = [
    ...new Set(failing.map((r) => /^(D\d+)\b/.exec(fixture.notes?.[r.id] ?? "")?.[1]).filter((d) => d !== undefined)),
  ];
  return {
    ok: true,
    line: `✓ ${pass}/${results.length} pass, ${failing.length} recorded as failing${decisions.length > 0 ? ` (${decisions.join(", ")})` : ""}`,
  };
}

/** Live provider/model, resolved from env: explicit `ARCHLANG_EVAL_PROVIDER`,
 *  else OpenAI when only its key is present, else Anthropic (the default). */
export function resolveProvider(): {
  provider: "anthropic" | "openai";
  model: string;
} {
  const explicit = process.env.ARCHLANG_EVAL_PROVIDER?.toLowerCase();
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const useOpenAI = explicit === "openai" || (explicit !== "anthropic" && hasOpenAI && !hasAnthropic);
  // Trim + `||` (not bare `??`): the eval-live workflow exports ARCHLANG_EVAL_MODEL from an
  // optional dispatch input, so an EMPTY string means "use the default" — `??` once let ""
  // through and every call died with OpenAI 400 "you must provide a model parameter".
  const modelOverride = process.env.ARCHLANG_EVAL_MODEL?.trim() || undefined;
  return useOpenAI
    ? { provider: "openai", model: modelOverride ?? "gpt-5.5-2026-04-23" }
    : { provider: "anthropic", model: modelOverride ?? "claude-sonnet-5" };
}

/** The one system prompt both providers get: the spec + a reply-format instruction.
 *  Exported so the L2 harness (`eval/l2-run.ts`) drives the same system prompt; `spec` is
 *  injectable so a past commit's prompt can be rebuilt (and hashed) from its `spec.llm.md`. */
export function systemPrompt(spec: string = readFileSync(resolve(ROOT, "spec.llm.md"), "utf8")): string {
  return `${spec}\n\nYou write ArchLang. Reply with ONLY one \`\`\`arch code block — no prose.`;
}

/** `extractArch` pulls the `.arch` source out of a model reply: the body of its first complete
 *  `arch` or untyped fence (`firstArchFence`), else the block the pre-EV.7 regex took
 *  (`legacyRegexBlock`), else the whole reply, trimmed. Re-exported so the L2
 *  harness and the `model-authoring` rows parse replies identically to the L0 path: one
 *  implementation, in `dataset/model-authoring/reply.ts` (EV.7). */
export { extractArch, firstArchFence };

/** Author a plan via the Anthropic Messages API; resolves to the raw reply text. */
async function authorWithAnthropic(
  prompt: string,
  system: string,
  model: string,
  ledger?: LiveLedger,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (required for --live with the anthropic provider)");
  const call = (pinTemperature: boolean) =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        // Reasoning models spend internal thinking tokens from this same budget — a 2048
        // cap starved the model into empty/truncated plans (this was the live bug). Sized
        // so truncation measures authorability, not the budget (mirrors the OpenAI cap).
        max_tokens: 16384,
        // Pin sampling for reproducibility (the OpenAI reasoning endpoint rejects this, so
        // it is anthropic-only — see authorWithOpenAI).
        ...(pinTemperature ? { temperature: 0 } : {}),
        // The ~40 KB spec system prompt is byte-identical across every brief, so mark it
        // cacheable: the first call writes the cache, every later call reads it.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
  let res = await call(true);
  // Newer models reject `temperature` outright (400 "`temperature` is deprecated for this
  // model"); a rejected request is not billed, so retry once at the model's default sampling.
  if (res.status === 400) {
    const body = await res.text();
    if (!/temperature/i.test(body)) throw new Error(`Anthropic API 400: ${body}`);
    res = await call(false);
  }
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
    stop_reason?: string | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  ledger?.record({
    input: json.usage?.input_tokens,
    output: json.usage?.output_tokens,
    cacheCreation: json.usage?.cache_creation_input_tokens,
    cacheRead: json.usage?.cache_read_input_tokens,
    stop: json.stop_reason,
  });
  return json.content.map((b) => b.text ?? "").join("");
}

/** Best-effort reproducibility seed for the OpenAI request (the API documents `seed` as
 *  a hint, not a guarantee — pair it with `system_fingerprint` to detect backend drift). */
const OPENAI_SEED = 20260711;

/** Author a plan via the OpenAI Chat Completions API (dependency-free `fetch`); resolves to the raw reply text. */
async function authorWithOpenAI(prompt: string, system: string, model: string, ledger?: LiveLedger): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set (required for --live with the openai provider)");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      // Reasoning models spend internal thinking tokens from this same budget — a
      // 4096 cap starved gpt-5.5 into empty/truncated plans (8/18 briefs at first
      // measurement). Sized so truncation measures authorability, not the budget.
      max_completion_tokens: 16384,
      // Deliberately NO `temperature`: the gpt-5.x reasoning endpoints reject any
      // non-default temperature, so `seed` is the only reproducibility lever here.
      seed: OPENAI_SEED,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: {
      message?: { content?: string };
      finish_reason?: string | null;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    system_fingerprint?: string | null;
  };
  ledger?.record({
    input: json.usage?.prompt_tokens,
    output: json.usage?.completion_tokens,
    stop: json.choices?.[0]?.finish_reason,
  });
  ledger?.noteFingerprint(json.system_fingerprint);
  return json.choices?.[0]?.message?.content ?? "";
}

/** Ask the resolved provider's model to author a plan from the prompt; resolves to the
 *  {@link extractArch} source. The optional `ledger` records per-call token usage (and OpenAI's
 *  system_fingerprint); `system` is the exact system prompt sent, so a live run can hash the same
 *  string it sends; the optional `onReply` sees the raw reply before extraction, so
 *  {@link liveSourceFile} can decide what may be stored (the raw reply itself never is). */
export function makeAuthor(
  provider: "anthropic" | "openai",
  model: string,
  ledger?: LiveLedger,
  system: string = systemPrompt(),
  onReply?: (reply: string) => void,
): (prompt: string) => Promise<string> {
  const author = provider === "openai" ? authorWithOpenAI : authorWithAnthropic;
  return async (prompt: string) => {
    const reply = await author(prompt, system, model, ledger);
    onReply?.(reply);
    return extractArch(reply);
  };
}

/** Where a live run writes each scored brief's plan source (git-ignored; the `eval-live`
 *  workflow uploads it in the `eval-results-live` artifact). */
export const LIVE_SOURCES_DIR = "eval/results.live-sources";

/** The start of a marker file: the brief was scored, but no source is stored for it. */
export const NOT_EXTRACTED = "not extracted";

/**
 * What a live run stores for one scored brief (product-roadmap RM-D53): the extracted `.arch`
 * source as `<id>.arch` when the scored text is exactly the body of the reply's first complete
 * `arch` or untyped fence ({@link firstArchFence}), else a `<id>.not-extracted.txt` marker naming
 * the reason and holding no reply text. The raw reply is never stored, so neither is its prose: an
 * unfenced or truncated reply gets the marker, and so does a reply only the pre-EV.7 regex reads a
 * block from (a ```` ```markdown ```` wrapper, a closer glued to the last line), since that block
 * is not a complete top-level fence. Since EV.7 {@link extractArch} scores exactly that
 * block whenever there is one, so the equality check below holds by construction; it stays as the
 * guard that a later change to the scored text cannot store a text that was not scored. `reply` is
 * `undefined` when the call failed before a reply came back.
 */
export function liveSourceFile(id: string, reply: string | undefined): { name: string; text: string } {
  const marker = (why: string) => ({ name: `${id}.not-extracted.txt`, text: `${NOT_EXTRACTED}: ${why}\n` });
  if (reply === undefined) return marker("no reply");
  const block = firstArchFence(reply);
  if (block === undefined) return marker("no complete arch fence in the reply");
  if (block !== extractArch(reply)) return marker("the scored text is not the reply's first arch fence");
  // Exactly the scored string, no suffix: recompiling it reproduces the scored diagnostics.
  return { name: `${id}.arch`, text: block };
}

/** A brief id {@link writeLiveSources} may turn into a file name: a plain slug, no separators. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/** Write one {@link liveSourceFile} per scored (non-skipped) brief into `dir`, replacing what a
 *  previous run left there. Throws, before touching `dir`, on an id that is not a plain slug. */
export function writeLiveSources(dir: string, results: readonly Score[], replyById: ReadonlyMap<string, string>): void {
  for (const r of results) {
    if (!SAFE_ID.test(r.id) || r.id.includes("..")) {
      throw new Error(`unsafe brief id for a file name: ${JSON.stringify(r.id)}`);
    }
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const r of results) {
    if (r.skipped) continue;
    const f = liveSourceFile(r.id, replyById.get(r.id));
    writeFileSync(resolve(dir, f.name), f.text);
  }
}

/** main()'s reply wiring: `onReply` goes to {@link makeAuthor}, `author` wraps each brief's call
 *  and keeps that brief's raw reply in memory only, and `write` hands them to
 *  {@link writeLiveSources}. */
export function liveReplyCollector() {
  const replyById = new Map<string, string>();
  let last: string | undefined;
  return {
    onReply: (reply: string): void => {
      last = reply;
    },
    async author(id: string, call: () => Promise<string>): Promise<string> {
      last = undefined;
      const src = await call();
      if (last !== undefined) replyById.set(id, last);
      return src;
    },
    write(dir: string, results: readonly Score[]): void {
      writeLiveSources(dir, results, replyById);
    },
  };
}

/** The L1 table cell for a brief: healers applied + any L0→L1 verdict transition. */
function l1CellText(row: L1Row | undefined): string {
  if (!row) return "—";
  const heal = `f${row.fixesApplied} r${row.repairChanges}`;
  const to = statusOf(row.l1);
  return row.l0Status === to ? `${heal} · =` : `${heal} · ${row.l0Status}→${to}`;
}

/** The "After deterministic repair (L1)" summary block: L1 rates + explicit ΔL0→L1. */
function renderL1Block(l0: Summary, l1: L1Overlay): string[] {
  const pct = (n: number): string => `${Math.round((n / l1.summary.total) * 100)}%`;
  const line = (name: string, a: number, b: number): string => {
    const d = b - a;
    return `- **${name}:** ${b}/${l1.summary.total} (${pct(b)}) — ΔL0→L1 ${d > 0 ? `+${d}` : `${d}`}`;
  };
  const healed = l1.rows.filter((x) => STATUS_RANK[statusOf(x.l1)] > STATUS_RANK[x.l0Status]).length;
  const regressed = l1.rows.filter((x) => STATUS_RANK[statusOf(x.l1)] < STATUS_RANK[x.l0Status]).length;
  const totalFix = l1.rows.reduce((n, x) => n + x.fixesApplied, 0);
  const totalRepair = l1.rows.reduce((n, x) => n + x.repairChanges, 0);
  return [
    "### After deterministic repair (L1)",
    "",
    "The same authored briefs re-scored after `arch fix` + `arch repair` — deterministic, **zero extra API calls**. The delta is the free tool dividend (ΔL0→L1).",
    "",
    line("Valid (compiles)", l0.valid, l1.summary.valid),
    line("Intent match (semantic)", l0.semanticPass, l1.summary.semanticPass),
    line("Sound (lint-clean)", l0.sound, l1.summary.sound),
    "",
    `${healed} brief(s) healed (status improved)${regressed ? `, ${regressed} regressed` : ""}; ${totalFix} fix edit(s) + ${totalRepair} repair move(s) applied.`,
    "",
  ];
}

/** `Wilson 95 % lo–hi %` for k of n, whole percents (outward-rounded so the label never narrows it). */
function wilsonLabel(k: number, n: number): string {
  const { lo, hi } = wilson95(k, n);
  return `Wilson 95 % ${Math.floor(lo * 100)}–${Math.ceil(hi * 100)} %`;
}

/** True for a stop reason that means the reply hit the output cap (Anthropic `max_tokens`,
 *  OpenAI `length`) rather than ending on its own. */
export function isTruncationStop(stop: string): boolean {
  return stop === "max_tokens" || stop === "length";
}

/** Render the scorecard as Markdown. The optional `l1` overlay (live `--l1` only) adds an
 *  "After deterministic repair (L1)" block and a per-row `L1` column; without it the output
 *  is byte-identical to the plain scorecard. */
export function renderResults(
  results: Score[],
  summary: Summary,
  mode: string,
  l1?: L1Overlay,
  opts: { intervals?: boolean; stops?: ReadonlyMap<string, string> } = {},
): string {
  const pct = (n: number): string => `${Math.round((n / summary.total) * 100)}%`;
  // Live only: a Wilson 95 % interval beside each rate (off for the committed offline scorecard).
  const rate = (k: number): string =>
    opts.intervals
      ? `${k}/${summary.total} (${pct(k)}; ${wilsonLabel(k, summary.total)})`
      : `${k}/${summary.total} (${pct(k)})`;
  // Compact per-dimension subscores, e.g. `R1 L0.67 A– Adj1` (– = dimension unasserted).
  const sub = (n: number | null | undefined): string =>
    n === null || n === undefined ? "–" : `${Math.round(n * 100) / 100}`;
  const subCell = (r: Score): string =>
    r.subscores
      ? `R${sub(r.subscores.rooms)} L${sub(r.subscores.labels)} A${sub(r.subscores.area)} Adj${sub(r.subscores.adjacency)}`
      : "—";
  const l1ById = l1 ? new Map(l1.rows.map((x) => [x.id, x])) : undefined;
  const rows = results.map((r) => {
    if (r.skipped) {
      const cells = [
        `\`${r.id}\``,
        "⏭️ skipped",
        "—",
        "—",
        "—",
        ...(l1ById ? ["—"] : []),
        r.failures.join("; ") || "budget",
      ];
      return `| ${cells.join(" | ")} |`;
    }
    const status = STATUS_LABEL[statusOf(r)];
    const baseNotes = r.failures.length
      ? r.failures.join("; ")
      : r.lintWarnings
        ? `${r.lintWarnings} lint warning(s)`
        : "—";
    // Live only: the provider's stop/finish reason, so a truncated reply reads differently from a bad plan.
    const stop = opts.stops?.get(r.id);
    const notes = stop ? `${baseNotes === "—" ? "" : `${baseNotes}; `}stop: ${stop}` : baseNotes;
    const cells = [
      `\`${r.id}\``,
      status,
      r.valid ? "yes" : "no",
      `${r.lintWarnings}`,
      subCell(r),
      ...(l1ById ? [l1CellText(l1ById.get(r.id))] : []),
      notes,
    ];
    return `| ${cells.join(" | ")} |`;
  });
  const ncol = 6 + (l1 ? 1 : 0);
  return [
    "# ArchLang authorability scorecard",
    "",
    `Mode: **${mode}** · ${summary.total} prompts · judge v${JUDGE_VERSION} · synonyms v${SYNONYMS_VERSION}.`,
    "",
    ...(summary.skipped
      ? [
          `> Aborted at brief ${summary.total}/${summary.total + summary.skipped} — the \`--budget\` breaker tripped; the ${summary.skipped} skipped brief(s) are excluded from the rates below.`,
          "",
        ]
      : []),
    `- **Valid (compiles):** ${rate(summary.valid)}`,
    `- **Intent match (semantic):** ${rate(summary.semanticPass)}`,
    `- **Sound (lint-clean):** ${rate(summary.sound)}`,
    ...(opts.stops
      ? [
          `- **Truncated replies (\`max_tokens\`/\`length\` stop):** ${[...opts.stops.values()].filter(isTruncationStop).length}/${opts.stops.size}`,
        ]
      : []),
    "",
    ...(l1 ? renderL1Block(summary, l1) : []),
    "Subscores per row: **R**ooms · **L**abels · **A**rea · **Adj**acency (– = unasserted; adjacency/reachability score but never gate).",
    "",
    `| Prompt | Result | Valid | Lint | Subscores | ${l1 ? "L1 heal | " : ""}Notes |`,
    `| ${Array(ncol).fill("---").join(" | ")} |`,
    ...rows,
    "",
  ].join("\n");
}

export type Summary = {
  total: number;
  valid: number;
  semanticPass: number;
  sound: number;
  /** Live-only: briefs the `--budget` breaker skipped (excluded from `total`). Append-only. */
  skipped?: number;
};

/** A recorded live baseline (`eval/live-baseline.json`) to compare a fresh run against. */
export interface Baseline extends Summary {
  provider?: string;
  model?: string;
  date?: string;
  /** Scoring-core version the baseline was produced under. Absent on pre-judge-field
   *  baselines — which `renderDelta` flags, since a judge change makes deltas incomparable. */
  judge?: string;
  /** SHA-256 (hex) of the system prompt the baseline was measured under ({@link systemPrompt}:
   *  `spec.llm.md` + the reply-format line), as {@link promptHashes} computes it. Absent on
   *  baselines recorded before the field existed. */
  promptSha256?: string;
  /** SHA-256 (hex) of `eval/corpus.json`, the briefs the baseline was measured on. */
  corpusSha256?: string;
}

/** The SHA-256s of what a live run's prompt is made of. */
export interface PromptHashes {
  /** Of the {@link systemPrompt} string both providers are sent (LF-normalised, {@link sha256Text}). */
  prompt: string;
  /** Of the `eval/corpus.json` text the briefs were parsed from (LF-normalised). */
  corpus: string;
}

/** SHA-256 (hex) of a text after CRLF -> LF, so the string a CRLF working copy sends hashes
 *  the same as the one an LF checkout sends: the hash names the text, not its line endings. */
export function sha256Text(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

/** The hashes a baseline records (`promptSha256`, `corpusSha256`) and a run compares against.
 *  A live run passes the strings it sends, before its first call; both inputs default to the
 *  working tree, and a past commit's texts rebuild its hashes. */
export function promptHashes(system: string = systemPrompt(), corpus: string = readCorpusText()): PromptHashes {
  return { prompt: sha256Text(system), corpus: sha256Text(corpus) };
}

/** The live report's baseline section: the delta (with prompt hashes) when a baseline exists,
 *  else this run's hashes alone, so they can be recorded into the next baseline. */
export function liveDeltaSection(base: Baseline | null, s: Summary, prompt: PromptHashes): string {
  if (base) return renderDelta(base, s, { intervals: true, prompt });
  return [
    "",
    "## Delta vs baseline",
    "",
    `No \`${BASELINE}\`; nothing to compare against.`,
    "",
    hashLine(prompt),
    "",
  ].join("\n");
}

function hashLine(p: PromptHashes): string {
  return `This run's prompt: \`promptSha256\` ${p.prompt} · \`corpusSha256\` ${p.corpus}.`;
}

const LIVE_RESULTS = "eval/results.live.md";
const BASELINE = "eval/live-baseline.json";

/** Banner prepended to the live results file so nobody mistakes it for the committed scorecard. */
const LIVE_HEADER = [
  "<!-- Live authorability results — generated by `npm run eval:live`. EPHEMERAL and",
  "     git-ignored: these numbers depend on the model and the day, so they must NOT be",
  "     committed as the offline scorecard (that is `eval/results.md`). The section below",
  "     is the delta against `eval/live-baseline.json` when that file exists, else only",
  "     this run's prompt hashes. -->",
  "",
  "",
].join("\n");

const HEX64 = /^[0-9a-f]{64}$/;

/** Parse and validate a recorded live baseline's text. Throws (naming the field) on anything
 *  `renderDelta` could not print, so a live run fails before its first paid call. */
export function parseBaseline(text: string): Baseline {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new Error(`${BASELINE} is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${BASELINE} is not a JSON object`);
  const o = v as Record<string, unknown>;
  for (const k of ["total", "valid", "semanticPass", "sound"]) {
    const n = o[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw new Error(`${BASELINE}: \`${k}\` must be a non-negative integer, got ${JSON.stringify(n)}`);
    }
  }
  if (o.total === 0) throw new Error(`${BASELINE}: \`total\` must be at least 1`);
  for (const k of ["valid", "semanticPass", "sound"]) {
    if ((o[k] as number) > (o.total as number)) throw new Error(`${BASELINE}: \`${k}\` exceeds \`total\``);
  }
  for (const k of ["provider", "model", "date", "judge"]) {
    if (o[k] !== undefined && typeof o[k] !== "string") {
      throw new Error(`${BASELINE}: \`${k}\` must be a string when present, got ${JSON.stringify(o[k])}`);
    }
  }
  for (const k of ["promptSha256", "corpusSha256"]) {
    const h = o[k];
    if (h !== undefined && !(typeof h === "string" && HEX64.test(h))) {
      throw new Error(`${BASELINE}: \`${k}\` must be 64 lowercase hex digits when present, got ${JSON.stringify(h)}`);
    }
  }
  return o as unknown as Baseline;
}

/** Read the recorded live baseline: `null` only if the file does not exist; an unreadable or
 *  invalid file throws ({@link parseBaseline}) rather than being reported as missing. */
export function readBaseline(path: string = resolve(ROOT, BASELINE)): Baseline | null {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`${BASELINE} could not be read: ${(e as Error).message}`);
  }
  return parseBaseline(text);
}

/** `--max <n>`: cap the brief count. Exits `3` on a missing/invalid value. */
function parseMax(argv: string[]): number | undefined {
  const i = argv.indexOf("--max");
  if (i === -1) return undefined;
  const raw = argv[i + 1];
  const v = Number(raw);
  if (raw === undefined || !Number.isInteger(v) || v <= 0) {
    process.stderr.write(`✗ --max needs a positive integer (got ${raw ?? "nothing"})\n`);
    process.exit(3);
  }
  return v;
}

/** A `--budget` circuit-breaker limit: an amount plus the unit it is denominated in. */
type BudgetLimit = { kind: "tok"; amount: number } | { kind: "usd"; amount: number };

/** `--budget <n>tok` / `<n>usd`: a cumulative-usage ceiling. The unit SUFFIX is required
 *  (a bare number is ambiguous between tokens and dollars). Exits `3` on a missing/invalid
 *  value, mirroring {@link parseMax}. Returns `undefined` when the flag is absent (no
 *  breaker). Pure and exported so the parse rule is unit-testable. */
export function parseBudget(argv: string[]): BudgetLimit | undefined {
  const i = argv.indexOf("--budget");
  if (i === -1) return undefined;
  const raw = argv[i + 1];
  const m = raw?.match(/^(\d+(?:\.\d+)?)(tok|usd)$/);
  const amount = m ? Number(m[1]) : Number.NaN;
  if (!m || !Number.isFinite(amount) || amount <= 0) {
    process.stderr.write(`✗ --budget needs <n>tok or <n>usd, e.g. 500000tok or 2.50usd (got ${raw ?? "nothing"})\n`);
    process.exit(3);
  }
  return { kind: m[2] as "tok" | "usd", amount };
}

/** Approximate public list prices (USD per 1M tokens), verified 2026-07-11 against the
 *  providers' published pricing pages (the claude-opus-5-5 / sonnet-5-5 / haiku-5-5 / fable-5-x
 *  rows: verified 2026-11-15 against https://platform.claude.com/docs/en/about-claude/pricing). An unknown model degrades a `usd` budget to
 *  token-only tracking (warned on stderr). Deliberate over-estimates so the ceiling trips
 *  early rather than late: cache-read tokens are billed at the full input rate, and
 *  sticker prices are used where an intro discount exists (claude-sonnet-5 is $2/$10
 *  through 2026-08-31, since made standard; gpt-5.5 long-context requests can bill up to 2x input). */
const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "gpt-5.5-2026-04-23": { input: 5, output: 30 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  // Haiku 5.5 bills $0.10/$0.50 up to 100k prompt tokens, $0.50/$2.50 above; the higher tier is used.
  "claude-haiku-5-5": { input: 0.5, output: 2.5 },
  "claude-fable-5-2": { input: 8, output: 40 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

/** Cumulative live-run usage tracker + `--budget` circuit breaker. Records per-call token
 *  usage (cache counts at face value) and, when the model's price is known, an approximate
 *  running cost; also captures OpenAI's first non-null `system_fingerprint`. */
export class LiveLedger {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  cacheCreation = 0;
  cacheRead = 0;
  systemFingerprint?: string;
  /** Stop/finish reason of the most recent call (`undefined` if the API sent none). */
  lastStop?: string;
  /** Count of calls per stop/finish reason. */
  readonly stops = new Map<string, number>();
  readonly priceKnown: boolean;

  constructor(
    readonly model: string,
    readonly limit?: BudgetLimit,
  ) {
    this.priceKnown = model in PRICES_USD_PER_MTOK;
  }

  /** Fold one API call's usage into the running totals. */
  record(u: {
    input?: number;
    output?: number;
    cacheCreation?: number;
    cacheRead?: number;
    stop?: string | null;
  }): void {
    this.calls++;
    this.lastStop = u.stop ?? undefined;
    if (u.stop) this.stops.set(u.stop, (this.stops.get(u.stop) ?? 0) + 1);
    this.inputTokens += u.input ?? 0;
    this.outputTokens += u.output ?? 0;
    this.cacheCreation += u.cacheCreation ?? 0;
    this.cacheRead += u.cacheRead ?? 0;
  }

  /** Record the first non-null OpenAI `system_fingerprint` seen (for drift reporting). */
  noteFingerprint(fp?: string | null): void {
    if (fp && !this.systemFingerprint) this.systemFingerprint = fp;
  }

  /** Total tokens billed, cache counts included at face value. */
  totalTokens(): number {
    return this.inputTokens + this.outputTokens + this.cacheCreation + this.cacheRead;
  }

  /** Approximate USD spent, or `null` when the model has no dated price. */
  usd(): number | null {
    const p = PRICES_USD_PER_MTOK[this.model];
    if (!p) return null;
    const inRate = p.input / 1e6;
    const outRate = p.output / 1e6;
    return (this.inputTokens + this.cacheCreation + this.cacheRead) * inRate + this.outputTokens * outRate;
  }

  /** True once cumulative usage has reached the limit. A `usd` limit on an unknown model
   *  can never trip (cost is unknowable) — that degradation is warned on stderr at setup. */
  over(): boolean {
    if (!this.limit) return false;
    if (this.limit.kind === "tok") return this.totalTokens() >= this.limit.amount;
    const spent = this.usd();
    return spent !== null && spent >= this.limit.amount;
  }

  /** One-line spend summary for stderr. */
  spentLabel(): string {
    const usd = this.usd();
    return `${this.totalTokens()} tok / ${usd === null ? "usd n/a" : `$${usd.toFixed(4)}`} over ${this.calls} call(s)`;
  }
}

/** A "Delta vs baseline" Markdown section: each headline metric as baseline → now (±). */
export function renderDelta(
  base: Baseline,
  s: Summary,
  opts: { intervals?: boolean; prompt?: PromptHashes } = {},
): string {
  const line = (name: string, b: number, n: number): string => {
    const d = n - b;
    const ci = opts.intervals
      ? `; baseline ${b}/${base.total} (${wilsonLabel(b, base.total)}), now ${n}/${s.total} (${wilsonLabel(n, s.total)})`
      : "";
    return `- **${name}:** ${b} → ${n} (${d > 0 ? `+${d}` : `${d}`})${ci}`;
  };
  const who = base.provider ? `${base.provider} · ${base.model ?? "?"} · ${base.date ?? "?"}` : "recorded run";
  const note =
    base.total !== s.total
      ? `\n> Baseline ran ${base.total} briefs, this run ran ${s.total} — raw-count deltas are not normalised.\n`
      : "";
  // A judge (scoring-core) change re-defines what "pass"/"sound" mean, so a delta that
  // straddles one is comparing two different measurements — flag it loudly.
  const judgeNote =
    base.judge === JUDGE_VERSION
      ? ""
      : `\n> ⚠ Baseline judge ${
          base.judge ? `v${base.judge}` : "(unrecorded)"
        } ≠ current judge v${JUDGE_VERSION} — these deltas span a scoring-core change and are NOT comparable.\n`;
  // A prompt change (the system prompt the model reads, or the briefs it answers) is a different
  // measurement too: a recorded hash that differs is NOT comparable; an unrecorded one is unverified.
  const p = opts.prompt;
  const changed: string[] = [];
  const unrecorded: string[] = [];
  if (p) {
    const part = (field: string, was: string | undefined, now: string): void => {
      if (was === undefined) unrecorded.push(`\`${field}\``);
      else if (was !== now) changed.push(`\`${field}\` ${was.slice(0, 12)} → ${now.slice(0, 12)}`);
    };
    part("promptSha256", base.promptSha256, p.prompt);
    part("corpusSha256", base.corpusSha256, p.corpus);
  }
  const promptChanged = p !== undefined && base.promptSha256 !== undefined && base.promptSha256 !== p.prompt;
  const corpusChanged = p !== undefined && base.corpusSha256 !== undefined && base.corpusSha256 !== p.corpus;
  const what = promptChanged && corpusChanged ? "prompt and corpus" : promptChanged ? "prompt" : "corpus";
  const promptNote =
    (changed.length === 0
      ? ""
      : `\n> ⚠ Baseline ${what} ≠ this run's ${what} (SHA-256: ${changed.join("; ")}) — these deltas span a ${what} change and are NOT comparable.\n`) +
    (unrecorded.length === 0
      ? ""
      : `\n> Baseline records no ${unrecorded.join(" or ")} hash; comparability unverified.\n`);
  return [
    "",
    "## Delta vs baseline",
    "",
    `Against \`${BASELINE}\` (${who}).`,
    ...(p ? ["", hashLine(p)] : []),
    "",
    line("Valid (compiles)", base.valid, s.valid),
    line("Intent match (semantic)", base.semanticPass, s.semanticPass),
    line("Sound (lint-clean)", base.sound, s.sound),
    note,
    judgeNote,
    // Only when there is one, so a delta without hashes stays byte-identical to the pre-EV.3 one.
    ...(promptNote ? [promptNote] : []),
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");

  // OFFLINE — the CI regression guard. Behaviour and output kept byte-identical.
  if (!live) {
    // `--l1` heals a model's authored source; offline scores committed goldens, so there
    // is nothing to heal — reject the misuse (exit 3, consistent with parseMax) rather
    // than silently ignore it.
    if (argv.includes("--l1")) {
      process.stderr.write("✗ --l1 requires --live (there is no model source to heal offline)\n");
      process.exit(3);
    }
    const entries = loadCorpus();
    const { results, summary } = await evaluate(entries, (e: CorpusEntry) => readGolden(e));
    const md = renderResults(results, summary, "offline");
    writeFileSync(resolve(ROOT, "eval/results.md"), md);
    process.stdout.write(md + "\n");
    process.stdout.write(`✓ wrote eval/results.md\n`);
    // The gate compares against the committed judge fixture, never asks for every golden to pass
    // (plan-soundness D25): a ratified judgment of `semanticPass: false` is recorded there.
    const verdict = fixtureVerdict(results, readJudgeFixture());
    if (!verdict.ok) {
      process.stderr.write(`${verdict.line}\n`);
      process.exit(1);
    }
    process.stdout.write(`${verdict.line}\n`);
    return;
  }

  // LIVE — networked and paid. Resolve the plan, then require explicit confirmation.
  const { provider, model } = resolveProvider();
  const max = parseMax(argv);
  const budget = parseBudget(argv);
  const l1Mode = argv.includes("--l1");
  // Everything the delta section needs is read, validated and hashed BEFORE any paid call:
  // the system prompt and corpus text are read once, hashed, and those same strings are sent.
  const system = systemPrompt();
  const corpusText = readCorpusText();
  const hashes = promptHashes(system, corpusText);
  let baseline: Baseline | null;
  try {
    baseline = readBaseline();
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\nFix or remove it; nothing was sent.\n`);
    process.exit(3);
  }
  const all = loadCorpus(corpusText);
  const entries = max !== undefined ? all.slice(0, max) : all;
  const confirmed = argv.includes("--yes") || process.env.ARCHLANG_EVAL_CONFIRM === "1";
  if (!confirmed) {
    process.stderr.write(
      [
        "The live eval calls a paid API, once per brief. Nothing was sent.",
        "",
        `  provider : ${provider}`,
        `  model    : ${model}`,
        `  briefs   : ${entries.length}${max !== undefined ? ` (capped by --max ${max})` : " (all)"}`,
        `  budget   : ${budget ? `${budget.amount}${budget.kind}` : "none"}`,
        `  L1       : ${l1Mode ? "on (deterministic fix+repair overlay, zero extra calls)" : "off"}`,
        "",
        "Re-run with --yes (or set ARCHLANG_EVAL_CONFIRM=1) to authorise the calls.",
        "",
      ].join("\n"),
    );
    process.exit(3);
  }

  const ledger = new LiveLedger(model, budget);
  if (budget?.kind === "usd" && !ledger.priceKnown) {
    process.stderr.write(
      `⚠ --budget usd: no dated price for "${model}" — cost can't be enforced; tracking tokens only.\n`,
    );
  }

  // Each brief's raw reply stays in memory only, so writeLiveSources can decide what to store.
  const replies = liveReplyCollector();
  const author = makeAuthor(provider, model, ledger, system, replies.onReply);
  // With --l1 we keep each brief's authored L0 source so it can be healed and re-scored
  // afterwards (no extra API calls). Off the L1 path this is the original thin wrapper.
  const rawById = new Map<string, string>();
  const stopById = new Map<string, string>();
  const getSource = async (e: CorpusEntry): Promise<string> => {
    ledger.lastStop = undefined;
    const src = await replies.author(e.id, () => author(e.prompt));
    if (ledger.lastStop) stopById.set(e.id, ledger.lastStop);
    if (l1Mode) rawById.set(e.id, src);
    return src;
  };
  // The breaker is checked BEFORE each brief: once cumulative usage reaches the limit,
  // every remaining brief is skipped (and excluded from the rates). No budget → no gate.
  const { results, summary } = await evaluate(entries, getSource, {
    beforeEach: budget ? () => ledger.over() : undefined,
  });

  // L1 overlay: re-score each authored plan after the deterministic healers (same judge,
  // same non-skipped denominator). Pure post-processing — no further API calls.
  let l1: L1Overlay | undefined;
  if (l1Mode) {
    const rows = computeL1Overlay(entries, results, rawById);
    l1 = { rows, summary: summarizeL1(rows) };
  }

  // Live header records the pinned sampling settings (and OpenAI's backend fingerprint,
  // once seen) so a run is reproducible-by-record; judge version is stamped by renderResults.
  const pinned = provider === "anthropic" ? "temp 0" : `seed ${OPENAI_SEED}`;
  const fp = ledger.systemFingerprint ? ` · fp ${ledger.systemFingerprint}` : "";
  const l1Tag = l1Mode ? " · +L1" : "";
  let md = renderResults(results, summary, `live (${provider} · ${model} · ${pinned}${fp}${l1Tag})`, l1, {
    intervals: true,
    stops: stopById,
  });
  md += liveDeltaSection(baseline, summary, hashes);
  md = LIVE_HEADER + md;
  writeFileSync(resolve(ROOT, LIVE_RESULTS), md);
  replies.write(resolve(ROOT, LIVE_SOURCES_DIR), results);
  process.stdout.write(md + "\n");
  process.stdout.write(`✓ wrote ${LIVE_RESULTS} and ${LIVE_SOURCES_DIR}/ (git-ignored)\n`);
  if (budget) process.stderr.write(`budget: ${ledger.spentLabel()} (limit ${budget.amount}${budget.kind})\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main();
