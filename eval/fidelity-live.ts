/**
 * The fidelity slice's LIVE path: ask a model each fidelity brief `--trials` times and score
 * every reply with the slice's deterministic measure. Paid; approved by the owner on
 * 2026-11-15; run by the owner, never by CI.
 *
 * ## What is fixed, and what this file adds
 *
 * The ruler is `eval/fidelity.ts`, used unchanged: {@link fidelitySystemPrompt} (the spec plus
 * the refusal protocol), {@link buildFidelityUserPrompt} (the brief verbatim),
 * {@link parseFidelityReply} and {@link scoreReply}. `FIDELITY_VERSION`, the corpus and the
 * committed references are not touched. This file only drives the calls and writes the record.
 * The provider adapters are `eval/l2-run.ts`'s ({@link makeL2Author}): they return the RAW reply
 * (the refusal fence must reach the parser intact; run.ts's authors keep only the extracted
 * `.arch`), the per-call token split and stop reason, retry 429/5xx/network errors, and send no
 * `temperature`, so the k trials of one brief are samples at the model's default sampling and not
 * near-copies of one pinned reply. Provider and model resolve through run.ts's
 * {@link resolveProvider}; `--budget` is run.ts's {@link LiveLedger} breaker.
 *
 * ## Scoring (rubric §7, policies F1 to F4)
 *
 * A satisfiable brief scores 1 when the plan honours every stated requirement; an infeasible
 * brief scores 1 when the reply declares infeasibility and names exactly the conflict set. Any
 * plan for an infeasible brief, and a compiling plan that moved a stated number, is a
 * laundering and scores 0, and the moved requirement ids are named. A refusal of a satisfiable
 * brief, a refusal naming the wrong set, a malformed reply and a non-compiling plan score 0.
 *
 * ## Guards
 *
 * Without `--yes` it prints the plan (provider, model, calls, an estimate, the budget, the
 * output paths) and exits `3` before any call. It refuses, also with `3`, when either results
 * file for the model already exists: a live result is never overwritten. `--trials <n>`
 * (default 5) and `--budget <n>tok|<n>usd` (checked before each call) are the only other flags.
 *
 * ## Output (git-ignored)
 *
 * `eval/results.fidelity-live.<model>.json` is written before the first call and after every
 * call (`meta.status` `running`, then `complete`): every call's raw reply, stop reason, token
 * split, retries and score. `eval/results.fidelity-live.<model>.md` is written once at the end.
 * These numbers are reported on their own: they are never compared with `eval:ci`, the L0
 * baseline (`eval/live-baseline.json`) or the offline fidelity scorecard.
 *
 * Run: `npm run eval:fidelity-live -- --yes --budget <n>usd`. Exit `0` when the run completed,
 * `1` on an abort, `3` on bad usage or a guard.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIDELITY_VERSION,
  type FidelityEntry,
  type FidelityScore,
  buildFidelityUserPrompt,
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
  type RetryEvent,
  type RetryPolicy,
  makeL2Author,
  writeJsonAtomic,
} from "./l2-run.js";
import { LiveLedger, isTruncationStop, parseBudget, resolveProvider } from "./run.js";
import { wilson95 } from "./stats.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** Default repetitions per brief. */
export const DEFAULT_TRIALS = 5;
/** Trial t (1-based) carries seed `SEED_BASE + t − 1`: the OpenAI `seed`, a record label on
 *  Anthropic (which has none). */
export const SEED_BASE = 20260711;
/** The output cap every call is sent with (`anthropicRequest` / the OpenAI adapter). */
export const MAX_OUTPUT_TOKENS = 16384;

/** The record and scorecard paths for one model (repo-relative, git-ignored). Any character
 *  outside `[A-Za-z0-9._-]` becomes `_`, as in `eval/l2-run.ts`. */
export function liveResultsPaths(model: string): { md: string; json: string } {
  const slug = model.replace(/[^A-Za-z0-9._-]/g, "_");
  return { md: `eval/results.fidelity-live.${slug}.md`, json: `eval/results.fidelity-live.${slug}.json` };
}

// ── Running ──────────────────────────────────────────────────────────────────────────

/** One trial as the record keeps it. */
export interface TrialRecord {
  brief: string;
  /** 1-based. */
  trial: number;
  seed: number;
  /** `scored`: the call returned and the reply was scored. `failed`: the call failed after its
   *  retries (no reply to score). `skipped`: the `--budget` breaker had tripped, so no call
   *  was made. Only `scored` trials enter a rate. */
  status: "scored" | "failed" | "skipped";
  /** The call: raw reply, stop reason, token split, retries (`scored` only). */
  call?: CallMeta;
  /** The failure message (`failed` only). */
  error?: string;
  /** The retries a failed call made (`failed` only). */
  retries?: RetryEvent[];
  /** The fidelity score of the reply (`scored` only). */
  score?: FidelityScore;
}

/**
 * Ask every brief `trials` times, trial-major (every brief's trial 1, then every brief's
 * trial 2, …), so a tripped budget leaves each brief with the same number of trials ±1. The
 * breaker is checked before every call. `onTrial` runs after every trial with the records so
 * far, in run order (the incremental write).
 */
export async function runFidelityLive(
  entries: readonly FidelityEntry[],
  author: LiveAuthor,
  ledger: LiveLedger,
  opts: { system: string; trials: number; onTrial?: (records: readonly TrialRecord[]) => void },
): Promise<TrialRecord[]> {
  const records: TrialRecord[] = [];
  for (let t = 1; t <= opts.trials; t++) {
    for (const entry of entries) {
      const seed = SEED_BASE + t - 1;
      const head = { brief: entry.id, trial: t, seed };
      if (ledger.over()) {
        records.push({ ...head, status: "skipped" });
      } else {
        try {
          const { call } = await author(
            [
              { role: "system", content: opts.system },
              { role: "user", content: buildFidelityUserPrompt(entry) },
            ],
            seed,
          );
          records.push({ ...head, status: "scored", call, score: scoreReply(entry, parseFidelityReply(call.text)) });
        } catch (err) {
          records.push({
            ...head,
            status: "failed",
            error: (err as Error).message,
            retries: err instanceof CallFailed ? err.retries : [],
          });
        }
      }
      opts.onTrial?.(records);
    }
  }
  return records;
}

// ── Summary ──────────────────────────────────────────────────────────────────────────

/** What a scored reply did, one word per {@link scoreReply} branch. */
export type Outcome =
  | "honoured" // satisfiable brief, every stated requirement held (score 1)
  | "declared" // infeasible brief, refusal naming exactly the conflict set (score 1)
  | "laundered" // a validator-facing plan that moved a stated number, or any plan for an infeasible brief
  | "false-refusal" // refused a satisfiable brief
  | "wrong-conflict" // refused an infeasible brief but named the wrong set
  | "malformed" // the reply could not be read
  | "not-compiled"; // satisfiable brief, the plan did not compile

/** Classify one score. */
export function outcomeOf(s: FidelityScore): Outcome {
  if (s.score === 1) return s.feasible ? "honoured" : "declared";
  if (s.laundered) return "laundered";
  if (s.replyKind === "malformed") return "malformed";
  if (s.replyKind === "refusal") return s.feasible ? "false-refusal" : "wrong-conflict";
  return "not-compiled";
}

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
  /** Laundered over every scored trial, then per brief class. */
  laundered: Rate;
  launderedFeasible: Rate;
  launderedInfeasible: Rate;
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

const rate = (xs: readonly FidelityScore[], pred: (s: FidelityScore) => boolean): Rate => ({
  k: xs.filter(pred).length,
  n: xs.length,
});

/** Summarise a run's records. Pure. */
export function summarizeLive(records: readonly TrialRecord[]): LiveSummary {
  const scored = records.filter((r) => r.status === "scored");
  const scores = scored.map((r) => r.score as FidelityScore);
  const feasible = scores.filter((s) => s.feasible);
  const infeasible = scores.filter((s) => !s.feasible);
  const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  for (const s of scores) outcomes[outcomeOf(s)]++;
  const stops: Record<string, number> = {};
  for (const r of scored) {
    const stop = r.call?.stop ?? "none";
    stops[stop] = (stops[stop] ?? 0) + 1;
  }
  return {
    scored: scored.length,
    failed: records.filter((r) => r.status === "failed").length,
    skipped: records.filter((r) => r.status === "skipped").length,
    fidelity: rate(scores, (s) => s.score === 1),
    feasibleHonoured: rate(feasible, (s) => s.score === 1),
    infeasibleDeclared: rate(infeasible, (s) => s.score === 1),
    laundered: rate(scores, (s) => s.laundered),
    launderedFeasible: rate(feasible, (s) => s.laundered),
    launderedInfeasible: rate(infeasible, (s) => s.laundered),
    outcomes,
    stops,
    truncated: scored.filter((r) => r.call?.stop !== undefined && r.call.stop !== null && isTruncationStop(r.call.stop))
      .length,
  };
}

// ── The record ───────────────────────────────────────────────────────────────────────

/** The run's provenance, as it goes into the record's `meta`. */
export interface LiveMeta {
  provider: "anthropic" | "openai";
  model: string;
  trials: number;
  briefs: number;
  budget: string | null;
  argv: string[];
  /** ISO 8601, before the first call. */
  startedAt: string;
  /** ISO 8601, after the last call; `null` while running. */
  endedAt: string | null;
  git: { head: string | null; dirty: boolean | null };
  sha256: { systemPrompt: string };
}

/** The JSON record: provenance and status, the summary so far, every trial, the ledger. */
export function buildLiveRecord(
  meta: LiveMeta,
  status: "running" | "complete",
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
  meta: Pick<LiveMeta, "provider" | "model" | "trials"> & { fingerprint?: string },
): string {
  const s = summarizeLive(records);
  const fp = meta.fingerprint ? ` · fp ${meta.fingerprint}` : "";
  const rows = entries.map((e) => {
    const mine = records.filter((r) => r.brief === e.id);
    const scored = mine.filter((r) => r.status === "scored");
    const scores = scored.map((r) => r.score as FidelityScore);
    const others = OUTCOMES.filter((o) => o !== "honoured" && o !== "declared" && o !== "laundered")
      .map((o) => [o, scores.filter((x) => outcomeOf(x) === o).length] as const)
      .filter(([, n]) => n > 0)
      .map(([o, n]) => `${o} ${n}`);
    const lost = mine.length - scored.length;
    const cells = [
      `\`${e.id}\``,
      e.infeasible === undefined ? "yes" : "**no**",
      rateLabel(rate(scores, (x) => x.score === 1)),
      `${scores.filter((x) => x.laundered).length}`,
      cell(others.join(", ")),
      cell(tally(scores.filter((x) => x.laundered).flatMap((x) => x.drifted))),
      cell(tally(scored.map((r) => r.call?.stop ?? "none"))),
      `${lost}`,
    ];
    return `| ${cells.join(" | ")} |`;
  });
  const launderings = records.filter((r) => r.status === "scored" && r.score?.laundered === true);
  const unscored = records.filter((r) => r.status !== "scored");
  return [
    "# ArchLang intent-fidelity scorecard — live",
    "",
    `Mode: **live (${meta.provider} · ${meta.model} · provider default sampling${fp})** · ${entries.length} briefs × ${meta.trials} trials · fidelity v${FIDELITY_VERSION}.`,
    "",
    "Reported on its own. These numbers are **never compared** with `eval:ci`, the L0 baseline",
    "(`eval/live-baseline.json`) or the offline fidelity scorecard: different corpus, different",
    "prompt, different measure. A rate is never comparable across a `FIDELITY_VERSION` change.",
    "",
    `Scored ${s.scored} trial(s); ${s.failed} failed after retries and ${s.skipped} skipped by the budget breaker, both excluded from every rate.`,
    "Trials of one brief are not independent, so the intervals (each call a Bernoulli trial) understate the uncertainty about brief-level behaviour.",
    "",
    `- **Fidelity (score 1):** ${rateLabel(s.fidelity)}`,
    `- **Satisfiable briefs honoured:** ${rateLabel(s.feasibleHonoured)}`,
    `- **Infeasible briefs declared, conflict named exactly:** ${rateLabel(s.infeasibleDeclared)}`,
    `- **Laundered (a stated number moved):** ${rateLabel(s.laundered)} — satisfiable ${rateLabel(s.launderedFeasible)}; infeasible ${rateLabel(s.launderedInfeasible)}`,
    `- **Other zeros:** ${OUTCOMES.filter((o) => o !== "honoured" && o !== "declared" && o !== "laundered")
      .map((o) => `${o} ${s.outcomes[o]}`)
      .join(" · ")}`,
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
      : launderings.flatMap((r) => {
          const sc = r.score as FidelityScore;
          return [
            `- \`${r.brief}\` trial ${r.trial} — ${sc.verdict}`,
            ...sc.checks
              .filter((c) => !c.honoured)
              .map((c) => `  - ${c.id} (${c.code}): ${c.detail} — brief: "${c.quote}"`),
          ];
        })),
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

// ── The plan, the guards, main ───────────────────────────────────────────────────────

/** A rough upper estimate of one run's spend, for the dry-run plan only (no API is asked).
 *  Prompt tokens are characters / 3.5, rounded up; output is the worst case, every call
 *  hitting the {@link MAX_OUTPUT_TOKENS} cap; USD uses the ledger's deliberately high prices
 *  (`null` for a model without one). */
export function estimateRun(
  entries: readonly FidelityEntry[],
  system: string,
  trials: number,
  model: string,
): { calls: number; promptTokens: number; maxOutputTokens: number; maxUsd: number | null } {
  const perBrief = entries.reduce(
    (n, e) => n + Math.ceil((system.length + buildFidelityUserPrompt(e).length) / 3.5),
    0,
  );
  const calls = entries.length * trials;
  const promptTokens = perBrief * trials;
  const maxOutputTokens = calls * MAX_OUTPUT_TOKENS;
  const probe = new LiveLedger(model);
  probe.record({ input: promptTokens, output: maxOutputTokens });
  return { calls, promptTokens, maxOutputTokens, maxUsd: probe.usd() };
}

/** Parse the flags this command takes (`--yes`, `--trials <n>`, `--budget <n>tok|usd`).
 *  Returns an error message for anything else. `--budget` is validated by run.ts's
 *  {@link parseBudget}, which exits `3` itself on a bad value. */
export function parseArgs(argv: readonly string[]): { yes: boolean; trials: number } | { error: string } {
  let trials = DEFAULT_TRIALS;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") yes = true;
    else if (a === "--budget") i++;
    else if (a === "--trials") {
      const raw = argv[++i];
      const v = Number(raw);
      if (raw === undefined || !Number.isInteger(v) || v <= 0)
        return { error: `--trials needs a positive integer (got ${raw ?? "nothing"})` };
      trials = v;
    } else return { error: `unknown argument ${a} (takes --yes, --trials <n>, --budget <n>tok|<n>usd)` };
  }
  return { yes, trials };
}

const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");

/** `git rev-parse HEAD` and whether the tree is dirty, or nulls when git is unavailable. */
function gitInfo(root: string): { head: string | null; dirty: boolean | null } {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const dirty =
      execFileSync("git", ["status", "--porcelain"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() !== "";
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

/** The command. Returns the exit code instead of exiting, so the guards are testable. */
export async function main(argv: readonly string[], io: MainIO = {}): Promise<number> {
  const root = io.root ?? ROOT;
  const out = io.out ?? ((s: string) => void process.stdout.write(s));
  const err = io.err ?? ((s: string) => void process.stderr.write(s));
  const args = parseArgs(argv);
  if ("error" in args) {
    err(`✗ eval:fidelity-live: ${args.error}\n`);
    return 3;
  }
  const budget = parseBudget([...argv]);
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
        `  estimate : ~${est.promptTokens} prompt tok (chars/3.5; the system prompt is cached after the first call), ≤ ${est.maxOutputTokens} output tok (every call at the ${MAX_OUTPUT_TOKENS} cap)${est.maxUsd === null ? "" : `, ≤ $${est.maxUsd.toFixed(2)} at the ledger's high prices`}`,
        `  budget   : ${budget ? `${budget.amount}${budget.kind}` : "none"}${usdVoid ? ` — NOT enforceable: no dated price for "${model}"; use <n>tok` : ""} (checked before every call)`,
        `  writes   : ${paths.json} (after every call), then ${paths.md}`,
        "",
        "Re-run with --yes to authorise the calls.",
        "",
      ].join("\n"),
    );
    return 3;
  }

  const ledger = new LiveLedger(model, budget);
  if (budget?.kind === "usd" && !ledger.priceKnown) {
    err(`⚠ --budget usd: no dated price for "${model}" — cost can't be enforced; tracking tokens only.\n`);
  }
  const author = makeL2Author(provider, model, ledger, io.retry ?? DEFAULT_RETRY);
  const meta: LiveMeta = {
    provider,
    model,
    trials: args.trials,
    briefs: entries.length,
    budget: budget ? `${budget.amount}${budget.kind}` : null,
    argv: [...argv],
    startedAt: new Date().toISOString(),
    endedAt: null,
    git: gitInfo(root),
    sha256: { systemPrompt: sha256(system) },
  };
  const jsonPath = resolve(root, paths.json);
  // Before the first call: a failure here costs nothing, so it fails loudly.
  writeJsonAtomic(jsonPath, buildLiveRecord(meta, "running", [], ledger));
  const records = await runFidelityLive(entries, author, ledger, {
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
  meta.endedAt = new Date().toISOString();
  writeJsonAtomic(jsonPath, buildLiveRecord(meta, "complete", records, ledger));
  const md =
    liveHeader(paths.json) +
    renderLiveResults(entries, records, {
      provider,
      model,
      trials: args.trials,
      fingerprint: ledger.systemFingerprint,
    });
  writeFileSync(resolve(root, paths.md), md);
  out(`${md}\n`);
  out(`✓ wrote ${paths.json} + ${paths.md} (git-ignored)\n`);
  err(`ledger: ${ledger.spentLabel()}${budget ? ` (limit ${budget.amount}${budget.kind})` : ""}\n`);
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
