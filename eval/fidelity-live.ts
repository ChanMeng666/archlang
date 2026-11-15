/**
 * The fidelity slice's LIVE path: ask a model each fidelity brief `--trials` times and score
 * every reply with the slice's deterministic measure. Paid and owner-only: approved by the
 * owner on 2026-11-15 (product-roadmap RM-D46); run by the owner, never by CI.
 *
 * ## What is fixed, and what this file adds
 *
 * The ruler is `eval/fidelity.ts`, used unchanged: {@link fidelitySystemPrompt} (the spec plus
 * the refusal protocol), {@link buildFidelityUserPrompt} (the brief verbatim),
 * {@link parseFidelityReply} and {@link scoreReply}. `FIDELITY_VERSION`, the corpus and the
 * committed references are not touched. This file only drives the calls and writes the record.
 * The provider adapters are `eval/live-author.ts`'s ({@link makeL2Author}, shared with the L2
 * harness): they return the RAW reply (the refusal fence must reach the parser intact; run.ts's
 * authors keep only the extracted `.arch`), the per-call token split and stop reason, retry
 * 429/5xx/network errors, and send no `temperature`, so the k trials of one brief are samples at
 * the model's default sampling and not near-copies of one pinned reply. Provider and model
 * resolve through run.ts's {@link resolveProvider}; `--budget` is run.ts's {@link LiveLedger}
 * breaker.
 *
 * ## Scoring (rubric §7, policies F1 to F4) and the live reading of a zero
 *
 * The score is the ruler's, verbatim: a satisfiable brief scores 1 when the plan honours every
 * stated requirement; an infeasible brief scores 1 when the reply declares infeasibility and
 * names exactly the conflict set; everything else scores 0.
 *
 * The ruler marks ANY non-refusal reply to an infeasible brief as laundered, because the parser
 * reads anything outside an ```` ```infeasible ```` fence as plan source. A live model can also
 * refuse in prose, in a `json` fence, as bare JSON, or in a fence cut off by the output cap, and
 * each of those is a format failure, not a delivered plan. So the live layer records whether the
 * extracted plan COMPILED and reads a zero through {@link outcomeOf}: `laundered` only when a
 * compiling plan was delivered (on either kind of brief), `not-compiled` when the "plan" did not
 * compile. Only launderings are listed with their moved requirements; the score stays 0 either way.
 *
 * ## Guards
 *
 * Every refusal exits `3` before any call:
 *   - an unknown, repeated or bad flag (`--trials` is 1 to {@link MAX_TRIALS}; `--budget` takes
 *     `<n>tok` or `<n>usd`);
 *   - without `--yes`, it prints the plan (provider, model, calls, an estimate, the budget, the
 *     output paths) and stops;
 *   - `--yes` without `--budget`: a live run needs a ceiling;
 *   - either results file for the model already exists: a live result is never overwritten.
 * The breaker is checked before every call. After {@link MAX_CONSECUTIVE_FAILURES} failed calls in
 * a row the run stops, the record is marked `aborted`, and the exit code is `1`.
 *
 * ## Output (git-ignored)
 *
 * `eval/results.fidelity-live.<model>.json` is written before the first call and after every
 * call (`meta.status` `running`, then `complete` or `aborted`): every call's raw reply, stop
 * reason, token split, retries, the ruler's score and the live outcome.
 * `eval/results.fidelity-live.<model>.md` is written once at the end. These numbers are reported
 * on their own: they are never compared with `eval:ci`, the L0 baseline
 * (`eval/live-baseline.json`) or the offline fidelity scorecard.
 *
 * Run: `npm run eval:fidelity-live -- --yes --budget <n>usd`. Exit `0` when the run completed,
 * `1` on an abort, `3` on bad usage or a guard.
 */

import { type ExecFileSyncOptionsWithStringEncoding, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIDELITY_VERSION,
  type FidelityEntry,
  type FidelityScore,
  buildFidelityUserPrompt,
  checkFidelity,
  fidelitySystemPrompt,
  loadFidelityCorpus,
  parseFidelityReply,
  scoreReply,
} from "./fidelity.js";
import {
  type CallMeta,
  CallFailed,
  DEFAULT_RETRY,
  type LiveAuthor,
  MAX_OUTPUT_TOKENS,
  type RetryEvent,
  type RetryPolicy,
  makeL2Author,
  writeJsonAtomic,
} from "./live-author.js";
import { LiveLedger, isTruncationStop, resolveProvider } from "./run.js";
import { wilson95 } from "./stats.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Default repetitions per brief. */
export const DEFAULT_TRIALS = 5;
/** The most repetitions one run may ask for. */
export const MAX_TRIALS = 20;
/** Failed calls in a row after which the run stops (`aborted`, exit 1). */
export const MAX_CONSECUTIVE_FAILURES = 5;
/** Trial t (1-based) carries seed `SEED_BASE + t − 1`: the OpenAI `seed`, a record label on
 *  Anthropic (which has none). */
export const SEED_BASE = 20260711;

/** The record and scorecard paths for one model (repo-relative, git-ignored). Any character
 *  outside `[A-Za-z0-9._-]` becomes `_`, as in `eval/l2-run.ts`. */
export function liveResultsPaths(model: string): { md: string; json: string } {
  const slug = model.replace(/[^A-Za-z0-9._-]/g, "_");
  return { md: `eval/results.fidelity-live.${slug}.md`, json: `eval/results.fidelity-live.${slug}.json` };
}

// ── Outcomes: the live reading of a score ────────────────────────────────────────────

/** What a scored reply did. The score is the ruler's; this is the live layer's reading of it. */
export type Outcome =
  | "honoured" // satisfiable brief, every stated requirement held (score 1)
  | "declared" // infeasible brief, refusal naming exactly the conflict set (score 1)
  | "laundered" // a COMPILING plan was delivered and a stated number moved (any plan, on an infeasible brief)
  | "false-refusal" // a well-formed refusal of a satisfiable brief
  | "wrong-conflict" // a well-formed refusal of an infeasible brief naming the wrong set
  | "malformed" // the parser could not read the reply (e.g. an `infeasible` fence that is not JSON)
  | "not-compiled"; // the reply was read as plan source and did not compile: no plan, or the wrong format

/**
 * Classify one score. `compiled` is whether the extracted plan compiled (`null` when the reply
 * was not read as a plan). A plan that did not compile is never a laundering here, on either
 * kind of brief: nothing was delivered for a validator to accept.
 */
export function outcomeOf(s: FidelityScore, compiled: boolean | null): Outcome {
  if (s.score === 1) return s.feasible ? "honoured" : "declared";
  if (s.replyKind === "malformed") return "malformed";
  if (s.replyKind === "refusal") return s.feasible ? "false-refusal" : "wrong-conflict";
  return compiled === true ? "laundered" : "not-compiled";
}

/** Whether a reply's extracted plan compiles (`null` when the reply is not read as a plan). The
 *  same notion `checkFidelity` reports as `compiled` (`describe()` succeeded). */
export function planCompiled(text: string): boolean | null {
  const reply = parseFidelityReply(text);
  return reply.kind === "plan" ? checkFidelity(reply.source, []).compiled : null;
}

// ── Running ──────────────────────────────────────────────────────────────────────────

/** One trial as the record keeps it. */
export interface TrialRecord {
  brief: string;
  /** 1-based. */
  trial: number;
  seed: number;
  /** `scored`: the call returned and the reply was scored. `failed`: the call failed after its
   *  retries, or its reply could not be scored. `skipped`: the `--budget` breaker had tripped, so
   *  no call was made. Only `scored` trials enter a rate. */
  status: "scored" | "failed" | "skipped";
  /** The call: raw reply, stop reason, token split, retries (whenever the call returned). */
  call?: CallMeta;
  /** The failure message (`failed` only). */
  error?: string;
  /** The retries a failed call made (`failed` only). */
  retries?: RetryEvent[];
  /** The ruler's score of the reply, verbatim (`scored` only). */
  score?: FidelityScore;
  /** Whether the extracted plan compiled; `null` when the reply was not read as a plan. */
  compiled?: boolean | null;
  /** The live reading of the score ({@link outcomeOf}). */
  outcome?: Outcome;
}

/**
 * Ask every brief `trials` times, trial-major (every brief's trial 1, then every brief's
 * trial 2, …), so a tripped budget leaves each brief with the same number of trials ±1. The
 * breaker is checked before every call. `onTrial` runs after every trial with the records so
 * far, in run order (the incremental write). After {@link MAX_CONSECUTIVE_FAILURES} failed
 * calls in a row it stops and returns `aborted: true`.
 */
export async function runFidelityLive(
  entries: readonly FidelityEntry[],
  author: LiveAuthor,
  ledger: LiveLedger,
  opts: { system: string; trials: number; onTrial?: (records: readonly TrialRecord[]) => void },
): Promise<{ records: TrialRecord[]; aborted: boolean }> {
  const records: TrialRecord[] = [];
  let failedInARow = 0;
  for (let t = 1; t <= opts.trials; t++) {
    for (const entry of entries) {
      const seed = SEED_BASE + t - 1;
      const head = { brief: entry.id, trial: t, seed };
      if (ledger.over()) {
        records.push({ ...head, status: "skipped" });
        opts.onTrial?.(records);
        continue;
      }
      let call: CallMeta;
      try {
        ({ call } = await author(
          [
            { role: "system", content: opts.system },
            { role: "user", content: buildFidelityUserPrompt(entry) },
          ],
          seed,
        ));
      } catch (err) {
        records.push({
          ...head,
          status: "failed",
          error: (err as Error).message,
          retries: err instanceof CallFailed ? err.retries : [],
        });
        opts.onTrial?.(records);
        if (++failedInARow >= MAX_CONSECUTIVE_FAILURES) return { records, aborted: true };
        continue;
      }
      failedInARow = 0;
      // Scoring is outside the call's try: a paid reply is never dropped. The ruler is total, so
      // this catch is a guard, not a path; if it ever fires, the reply is kept beside the error.
      try {
        const score = scoreReply(entry, parseFidelityReply(call.text));
        const compiled = planCompiled(call.text);
        records.push({ ...head, status: "scored", call, score, compiled, outcome: outcomeOf(score, compiled) });
      } catch (err) {
        records.push({ ...head, status: "failed", call, error: `scoring threw: ${(err as Error).message}` });
      }
      opts.onTrial?.(records);
    }
  }
  return { records, aborted: false };
}

// ── Summary ──────────────────────────────────────────────────────────────────────────

/** A rate: k of n. */
export interface Rate {
  k: number;
  n: number;
}

/** The run's rates (scored trials only), the per-outcome counts and the per-stop counts. */
export interface LiveSummary {
  scored: number;
  failed: number;
  skipped: number;
  /** Score 1 over every scored trial. */
  fidelity: Rate;
  /** Score 1 over the trials of satisfiable briefs. */
  feasibleHonoured: Rate;
  /** Score 1 over the trials of infeasible briefs. */
  infeasibleDeclared: Rate;
  /** A compiling plan that moved a stated number, over every scored trial, then per class. */
  laundered: Rate;
  launderedFeasible: Rate;
  launderedInfeasible: Rate;
  /** Infeasible briefs: no compiling plan and no well-formed refusal (`malformed` or
   *  `not-compiled`) — a format failure, scored 0 but not a laundering. */
  noPlanInfeasible: Rate;
  outcomes: Record<Outcome, number>;
  /** Stop reason → count, over the scored trials (`none` when the provider sent none). */
  stops: Record<string, number>;
  truncated: number;
}

const OUTCOMES: readonly Outcome[] = [
  "honoured",
  "declared",
  "laundered",
  "false-refusal",
  "wrong-conflict",
  "malformed",
  "not-compiled",
];
/** The zeros that are neither a score of 1 nor a laundering. */
const OTHER_ZEROS = OUTCOMES.filter((o) => o !== "honoured" && o !== "declared" && o !== "laundered");

type Scored = TrialRecord & { score: FidelityScore; outcome: Outcome };
const isScored = (r: TrialRecord): r is Scored => r.status === "scored";

const rate = (xs: readonly Scored[], pred: (r: Scored) => boolean): Rate => ({
  k: xs.filter(pred).length,
  n: xs.length,
});

/** Summarise a run's records. Pure. */
export function summarizeLive(records: readonly TrialRecord[]): LiveSummary {
  const scored = records.filter(isScored);
  const feasible = scored.filter((r) => r.score.feasible);
  const infeasible = scored.filter((r) => !r.score.feasible);
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  for (const r of scored) outcomes[r.outcome]++;
  const stops: Record<string, number> = {};
  for (const r of scored) {
    const stop = r.call?.stop ?? "none";
    stops[stop] = (stops[stop] ?? 0) + 1;
  }
  const one = (r: Scored): boolean => r.score.score === 1;
  const laundered = (r: Scored): boolean => r.outcome === "laundered";
  return {
    scored: scored.length,
    failed: records.filter((r) => r.status === "failed").length,
    skipped: records.filter((r) => r.status === "skipped").length,
    fidelity: rate(scored, one),
    feasibleHonoured: rate(feasible, one),
    infeasibleDeclared: rate(infeasible, one),
    laundered: rate(scored, laundered),
    launderedFeasible: rate(feasible, laundered),
    launderedInfeasible: rate(infeasible, laundered),
    noPlanInfeasible: rate(infeasible, (r) => r.outcome === "malformed" || r.outcome === "not-compiled"),
    outcomes,
    stops,
    truncated: scored.filter((r) => typeof r.call?.stop === "string" && isTruncationStop(r.call.stop)).length,
  };
}

// ── The record ───────────────────────────────────────────────────────────────────────

/** The run's provenance, as it goes into the record's `meta`. */
export interface LiveMeta {
  provider: "anthropic" | "openai";
  model: string;
  trials: number;
  briefs: number;
  budget: string;
  argv: string[];
  /** ISO 8601, before the first call. */
  startedAt: string;
  /** ISO 8601, after the last call; `null` while running. */
  endedAt: string | null;
  git: { head: string | null; dirty: boolean | null };
  sha256: { systemPrompt: string };
}

/** The record's status: `running` while calls are made, then `complete`, or `aborted` after
 *  {@link MAX_CONSECUTIVE_FAILURES} failed calls in a row. */
export type RunStatus = "running" | "complete" | "aborted";

/** The JSON record: provenance and status, the summary so far, every trial, the ledger. */
export function buildLiveRecord(
  meta: LiveMeta,
  status: RunStatus,
  records: readonly TrialRecord[],
  ledger: LiveLedger,
): Record<string, unknown> {
  return {
    meta: {
      mode: "live-fidelity",
      status,
      ...meta,
      fidelityVersion: FIDELITY_VERSION,
      seedBase: SEED_BASE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      fingerprint: ledger.systemFingerprint ?? null,
      retry: { baseMs: DEFAULT_RETRY.baseMs, maxTotalWaitMs: DEFAULT_RETRY.maxTotalWaitMs },
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      done: records.length,
    },
    summary: summarizeLive(records),
    trials: records,
    ledger: {
      calls: ledger.calls,
      inputTokens: ledger.inputTokens,
      outputTokens: ledger.outputTokens,
      cacheCreationTokens: ledger.cacheCreation,
      cacheReadTokens: ledger.cacheRead,
      totalTokens: ledger.totalTokens(),
      usd: ledger.usd(),
      stops: Object.fromEntries(ledger.stops),
    },
  };
}

// ── The scorecard ────────────────────────────────────────────────────────────────────

/** Table-cell escapes, character by character, as `eval/l2-run.ts` does. */
const CELL_ESC: Record<string, string> = { "|": "\\|", "\\": "\\\\", "\r": " ", "\n": " " };
const cell = (s: string): string => (s.length === 0 ? "—" : Array.from(s, (c) => CELL_ESC[c] ?? c).join(""));

/** `k/n (p %; Wilson 95 % lo–hi %)`, whole percents, outward-rounded so the label never
 *  narrows the interval (run.ts's `wilsonLabel` convention). `n = 0` prints `0/0 (—)`. */
export function rateLabel({ k, n }: Rate): string {
  if (n === 0) return "0/0 (—)";
  const { lo, hi } = wilson95(k, n);
  return `${k}/${n} (${Math.round((k / n) * 100)} %; Wilson 95 % ${Math.floor(lo * 100)}–${Math.ceil(hi * 100)} %)`;
}

/** `R1×3, R2` — ids with their counts, in first-seen order. */
const tally = (ids: readonly string[]): string => {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => (n === 1 ? id : `${id}×${n}`)).join(", ");
};

/** Render the live scorecard. Deterministic for a given record. */
export function renderLiveResults(
  entries: readonly FidelityEntry[],
  records: readonly TrialRecord[],
  meta: Pick<LiveMeta, "provider" | "model" | "trials"> & { fingerprint?: string; status?: RunStatus },
): string {
  const s = summarizeLive(records);
  const fp = meta.fingerprint ? ` · fp ${meta.fingerprint}` : "";
  const rows = entries.map((e) => {
    const mine = records.filter((r) => r.brief === e.id);
    const scored = mine.filter(isScored);
    const others = OTHER_ZEROS.map((o) => [o, scored.filter((r) => r.outcome === o).length] as const)
      .filter(([, n]) => n > 0)
      .map(([o, n]) => `${o} ${n}`);
    const launderedHere = scored.filter((r) => r.outcome === "laundered");
    const cells = [
      `\`${e.id}\``,
      e.infeasible === undefined ? "yes" : "**no**",
      rateLabel(rate(scored, (r) => r.score.score === 1)),
      `${launderedHere.length}`,
      cell(others.join(", ")),
      cell(tally(launderedHere.flatMap((r) => r.score.drifted))),
      cell(tally(scored.map((r) => r.call?.stop ?? "none"))),
      `${mine.length - scored.length}`,
    ];
    return `| ${cells.join(" | ")} |`;
  });
  const launderings = records.filter(isScored).filter((r) => r.outcome === "laundered");
  const unscored = records.filter((r) => r.status !== "scored");
  return [
    "# ArchLang intent-fidelity scorecard — live",
    "",
    `Mode: **live (${meta.provider} · ${meta.model} · provider default sampling${fp})** · ${entries.length} briefs × ${meta.trials} trials · fidelity v${FIDELITY_VERSION}.`,
    "",
    ...(meta.status === "aborted"
      ? [
          `> **Aborted** after ${MAX_CONSECUTIVE_FAILURES} failed calls in a row; the rates below cover only the trials scored before it.`,
          "",
        ]
      : []),
    "Reported on its own and **never compared** with `eval:ci` or the L0 baseline",
    "(`eval/live-baseline.json`), which measure authorability on another corpus under another prompt",
    "and judge, nor with the offline fidelity scorecard, which scores the committed reference replies",
    "and so measures the detector, not a model. A rate is never comparable across a `FIDELITY_VERSION` change.",
    "",
    `Scored ${s.scored} trial(s); ${s.failed} failed and ${s.skipped} skipped by the budget breaker, both excluded from every rate.`,
    "Trials of one brief are not independent, so the intervals (each call a Bernoulli trial) understate the uncertainty about brief-level behaviour.",
    "A **laundering** is a compiling plan that moved a stated number; on an infeasible brief, any compiling plan. A reply read as plan source that did not compile (a prose refusal, a `json` fence, bare JSON, a cut-off fence) scores 0 as **not-compiled** and is not one.",
    "",
    `- **Fidelity (score 1):** ${rateLabel(s.fidelity)}`,
    `- **Satisfiable briefs honoured:** ${rateLabel(s.feasibleHonoured)}`,
    `- **Infeasible briefs declared, conflict named exactly:** ${rateLabel(s.infeasibleDeclared)}`,
    `- **Laundered (a compiling plan delivered, a stated number moved):** ${rateLabel(s.laundered)} — satisfiable ${rateLabel(s.launderedFeasible)}; infeasible ${rateLabel(s.launderedInfeasible)}`,
    `- **Infeasible briefs, no plan / wrong format (malformed or not-compiled):** ${rateLabel(s.noPlanInfeasible)}`,
    `- **Other zeros:** ${OTHER_ZEROS.map((o) => `${o} ${s.outcomes[o]}`).join(" · ")}`,
    `- **Stop reasons:** ${
      Object.entries(s.stops)
        .map(([k, n]) => `${k} ${n}`)
        .join(" · ") || "—"
    } (truncated, \`max_tokens\`/\`length\`: ${s.truncated}/${s.scored})`,
    "",
    "| Brief | Feasible | Score 1 | Laundered | Other zeros | Moved requirements | Stops | Unscored |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Launderings",
    "",
    ...(launderings.length === 0
      ? ["None."]
      : launderings.flatMap((r) => [
          `- \`${r.brief}\` trial ${r.trial} — ${r.score.verdict}`,
          ...r.score.checks
            .filter((c) => !c.honoured)
            .map((c) => `  - ${c.id} (${c.code}): ${c.detail} — brief: "${c.quote}"`),
        ])),
    "",
    ...(unscored.length === 0
      ? []
      : [
          "## Unscored trials",
          "",
          ...unscored.map(
            (r) =>
              `- \`${r.brief}\` trial ${r.trial} — ${r.status}${r.error !== undefined ? `: ${r.error.slice(0, 300)}` : ""}`,
          ),
          "",
        ]),
  ].join("\n");
}

/** Banner marking the scorecard as ephemeral. */
const liveHeader = (jsonPath: string): string =>
  [
    "<!-- Live fidelity results — generated by `npm run eval:fidelity-live`. EPHEMERAL and",
    "     git-ignored: these numbers depend on the model and the day. The full per-call record",
    `     (raw replies, stop reasons, usage, retries, scores) is the sibling ${jsonPath}. -->`,
    "",
    "",
  ].join("\n");

// ── The plan, the flags, main ────────────────────────────────────────────────────────

/** A rough estimate of one run's spend, for the dry-run plan only (no API is asked). Prompt
 *  tokens are characters / 3.5, rounded up; output is the worst case, every call hitting the
 *  {@link MAX_OUTPUT_TOKENS} cap; USD uses the ledger's deliberately high prices (`null` for a
 *  model without one). An estimate, not a bound: the prompt count is a heuristic. */
export function estimateRun(
  entries: readonly FidelityEntry[],
  system: string,
  trials: number,
  model: string,
): { calls: number; promptTokens: number; maxOutputTokens: number; worstUsd: number | null } {
  const perBrief = entries.reduce(
    (n, e) => n + Math.ceil((system.length + buildFidelityUserPrompt(e).length) / 3.5),
    0,
  );
  const calls = entries.length * trials;
  const promptTokens = perBrief * trials;
  const maxOutputTokens = calls * MAX_OUTPUT_TOKENS;
  const probe = new LiveLedger(model);
  probe.record({ input: promptTokens, output: maxOutputTokens });
  return { calls, promptTokens, maxOutputTokens, worstUsd: probe.usd() };
}

/** A `--budget` limit, in run.ts's `LiveLedger` shape. */
export type Budget = { kind: "tok" | "usd"; amount: number };

/** The parsed flags. */
export interface Args {
  yes: boolean;
  trials: number;
  budget: Budget | undefined;
}

/**
 * Parse the flags this command takes: `--yes`, `--trials <n>` (1 to {@link MAX_TRIALS}) and
 * `--budget <n>tok|<n>usd`. Returns an error message for an unknown, repeated or bad flag,
 * never exits. The `--budget` rule is run.ts's `parseBudget`'s (a positive number with a
 * required unit suffix), re-stated here because that one exits the process on a bad value.
 */
export function parseArgs(argv: readonly string[]): Args | { error: string } {
  const args: Args = { yes: false, trials: DEFAULT_TRIALS, budget: undefined };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a !== "--yes" && a !== "--trials" && a !== "--budget")
      return { error: `unknown argument ${a} (takes --yes, --trials <n>, --budget <n>tok|<n>usd)` };
    if (seen.has(a)) return { error: `${a} given more than once` };
    seen.add(a);
    if (a === "--yes") {
      args.yes = true;
    } else if (a === "--trials") {
      const raw = argv[++i];
      const v = Number(raw);
      if (raw === undefined || !Number.isInteger(v) || v <= 0 || v > MAX_TRIALS)
        return { error: `--trials needs an integer from 1 to ${MAX_TRIALS} (got ${raw ?? "nothing"})` };
      args.trials = v;
    } else {
      const raw = argv[++i];
      const m = raw?.match(/^(\d+(?:\.\d+)?)(tok|usd)$/);
      const amount = m ? Number(m[1]) : Number.NaN;
      if (!m || !Number.isFinite(amount) || amount <= 0)
        return { error: `--budget needs <n>tok or <n>usd, e.g. 500000tok or 2.50usd (got ${raw ?? "nothing"})` };
      args.budget = { kind: m[2] as "tok" | "usd", amount };
    }
  }
  return args;
}

const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");

/** `git rev-parse HEAD` and whether the tree is dirty, or nulls when git is unavailable. */
function gitInfo(root: string): { head: string | null; dirty: boolean | null } {
  try {
    const opts: ExecFileSyncOptionsWithStringEncoding = {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    };
    const head = execFileSync("git", ["rev-parse", "HEAD"], opts).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], opts).trim() !== "";
    return { head, dirty };
  } catch {
    return { head: null, dirty: null };
  }
}

/** Where `main` writes and logs; the defaults are the repo root and the process streams.
 *  Tests point `root` at a temporary directory. */
export interface MainIO {
  root?: string;
  out?: (s: string) => void;
  err?: (s: string) => void;
  retry?: RetryPolicy;
}

/** The command. Returns the exit code instead of exiting, so every guard is testable. */
export async function main(argv: readonly string[], io: MainIO = {}): Promise<number> {
  const root = io.root ?? ROOT;
  const out = io.out ?? ((s: string) => void process.stdout.write(s));
  const err = io.err ?? ((s: string) => void process.stderr.write(s));
  const args = parseArgs(argv);
  if ("error" in args) {
    err(`✗ eval:fidelity-live: ${args.error}. Nothing was sent.\n`);
    return 3;
  }
  const { budget } = args;
  const { provider, model } = resolveProvider();
  const paths = liveResultsPaths(model);
  const existing = [paths.json, paths.md].filter((p) => existsSync(resolve(root, p)));
  if (existing.length > 0) {
    err(
      `✗ ${existing.join(" and ")} already exist${existing.length === 1 ? "s" : ""}: a live fidelity result is never overwritten. Move it aside first. Nothing was sent.\n`,
    );
    return 3;
  }
  const entries = loadFidelityCorpus();
  const system = fidelitySystemPrompt();

  if (!args.yes) {
    const est = estimateRun(entries, system, args.trials, model);
    const usdVoid = budget?.kind === "usd" && !new LiveLedger(model).priceKnown;
    err(
      [
        "The live fidelity eval calls a paid API, once per brief per trial. Nothing was sent.",
        "",
        `  provider : ${provider}`,
        `  model    : ${model}`,
        `  briefs   : ${entries.length} (all; ${entries.filter((e) => e.infeasible !== undefined).length} infeasible)`,
        `  trials   : ${args.trials}`,
        `  calls    : ${est.calls}`,
        `  estimate : ≈ ${est.promptTokens} prompt tok (chars/3.5; the system prompt is cached after the first call), ≈ ${est.maxOutputTokens} output tok worst case (every call at the ${MAX_OUTPUT_TOKENS} cap)${est.worstUsd === null ? "" : `, ≈ $${est.worstUsd.toFixed(2)} worst case at the ledger's high prices`}`,
        `  budget   : ${budget ? `${budget.amount}${budget.kind}` : "none — required with --yes"}${usdVoid ? ` — NOT enforceable: no dated price for "${model}"; use <n>tok` : ""} (checked before every call)`,
        `  writes   : ${paths.json} (after every call), then ${paths.md}`,
        "",
        "Re-run with --yes --budget <n>tok|<n>usd to authorise the calls.",
        "",
      ].join("\n"),
    );
    return 3;
  }
  if (budget === undefined) {
    err("✗ eval:fidelity-live: a live run needs --budget <n>tok|<n>usd. Nothing was sent.\n");
    return 3;
  }

  const ledger = new LiveLedger(model, budget);
  if (budget.kind === "usd" && !ledger.priceKnown) {
    err(`⚠ --budget usd: no dated price for "${model}" — cost can't be enforced; tracking tokens only.\n`);
  }
  const author = makeL2Author(provider, model, ledger, io.retry ?? DEFAULT_RETRY);
  const meta: LiveMeta = {
    provider,
    model,
    trials: args.trials,
    briefs: entries.length,
    budget: `${budget.amount}${budget.kind}`,
    argv: [...argv],
    startedAt: new Date().toISOString(),
    endedAt: null,
    git: gitInfo(root),
    sha256: { systemPrompt: sha256(system) },
  };
  const jsonPath = resolve(root, paths.json);
  // Before the first call: a failure here costs nothing, so it fails loudly.
  writeJsonAtomic(jsonPath, buildLiveRecord(meta, "running", [], ledger));
  const { records, aborted } = await runFidelityLive(entries, author, ledger, {
    system,
    trials: args.trials,
    // An incremental write that fails (on Windows, a reader holding the file makes the rename
    // throw EPERM) is logged and superseded by the next one; the paid calls must not be lost to it.
    onTrial: (rs) => {
      try {
        writeJsonAtomic(jsonPath, buildLiveRecord(meta, "running", rs, ledger));
      } catch (e) {
        err(`⚠ eval:fidelity-live: progress write failed (${(e as Error).message}); the next write supersedes it\n`);
      }
    },
  });
  const status: RunStatus = aborted ? "aborted" : "complete";
  meta.endedAt = new Date().toISOString();
  writeJsonAtomic(jsonPath, buildLiveRecord(meta, status, records, ledger));
  const md =
    liveHeader(paths.json) +
    renderLiveResults(entries, records, {
      provider,
      model,
      trials: args.trials,
      fingerprint: ledger.systemFingerprint,
      status,
    });
  writeFileSync(resolve(root, paths.md), md);
  out(`${md}\n`);
  out(`✓ wrote ${paths.json} + ${paths.md} (git-ignored)\n`);
  err(`ledger: ${ledger.spentLabel()} (limit ${budget.amount}${budget.kind})\n`);
  if (aborted) {
    err(
      `✗ eval:fidelity-live aborted after ${MAX_CONSECUTIVE_FAILURES} failed calls in a row (record status "aborted")\n`,
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`✗ eval:fidelity-live aborted: ${(e as Error)?.stack ?? String(e)}\n`);
      process.exit(1);
    },
  );
}
