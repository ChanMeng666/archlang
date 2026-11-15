/**
 * The analysis of the one T3 run, exactly as pre-registered in
 * `eval/live-runs/2026-11-t3-preregistration.md` (§§ 4–6, and the § 2/§ 3 checks a record can
 * show). It reads the two JSON records `eval:l2` wrote (Haiku's, then Sonnet's; either may be
 * gzipped, or the literal `none` when that model was not run) and prints Markdown on stdout,
 * for `eval/live-runs/2026-11-t3-result.md`.
 *
 * It is pure apart from reading the two files and has no randomness and no clock. It never
 * re-scores a source: the primary outcome reads only each trial's stored `loopScore.intent`
 * and `controlScore.intent`, and the § 6 tables read only stored scores, usage, stop reasons
 * and the ledger. Binomial tails and the Holm adjustment are exact rationals over BigInt, so
 * every comparison with 0.05 is exact.
 *
 * It decides nothing beyond the pre-registration. A § 2/§ 3 check that fails is printed as a
 * PROTOCOL VIOLATION and changes no verdict. A record that is malformed, in the wrong argument
 * slot, or whose D disagrees with its own `summary.net.intent` is an error (exit 1).
 *
 * Run: `npm run eval:t3 -- <haiku.json[.gz]|none> <sonnet.json[.gz]|none>`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { JUDGE_VERSION } from "./assertions.js";
import { type MetricTriple, type TrialCell, passAtN, passHatN, summarizeTrials } from "./l2.js";
import type { BriefRecord, CallRecord, RunMeta, TrialRecord } from "./l2-run.js";
import { isTruncationStop } from "./run.js";

// ── Fixed by the pre-registration ────────────────────────────────────────────────────

/** The corpus size (§ 1). A test pins it against `eval/corpus.json`. */
export const T3_BRIEFS = 26;
/** Trials per brief (§ 2: `--trials 3`). */
export const T3_TRIALS = 3;
/** More than this many dropped briefs makes a complete record inconclusive (§ 5). */
export const MAX_DROPPED = 4;
/** The two models, in run order (§ 2: Haiku first, then Sonnet). */
export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";
/** The exact `eval:l2` arguments of each model's one command (§ 2). */
export const T3_ARGV: Readonly<Record<string, readonly string[]>> = {
  [HAIKU]: ["--yes", "--trials", "3", "--concurrency", "4", "--budget", "25usd"],
  [SONNET]: ["--yes", "--trials", "3", "--concurrency", "4", "--budget", "80usd"],
};
/** `MAX_ROUNDS` (§ 2). */
const T3_MAX_ROUNDS = 2;
/** A model not run by this instant is "Inconclusive (not run)" (§ 2). */
export const T3_DEADLINE = "2026-11-30T00:00:00.000Z";
/** Sonnet starts within this long of Haiku's end (§ 2). */
const SONNET_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The tolerance of the D = `summary.net.intent` assertion (§ 4). */
const NET_TOLERANCE = 1e-9;
/** The label every § 6 table carries. */
export const SECONDARY_LABEL = "secondary, not pre-registered for a decision";

// ── The record, as `buildRecord` in eval/l2-run.ts writes it ──────────────────────────

/** The `eval:l2` JSON record (`buildRecord`). */
export interface L2Record {
  meta: RunMeta & { mode?: string; status: string; maxRounds?: number; judge?: string };
  summary?: { net?: { intent?: number; valid?: number; sound?: number } };
  briefs: BriefRecord[];
  ledger: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    usd: number | null;
    stops: Record<string, number>;
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Check the parts of a parsed record the analysis reads, and return it typed. Throws on
 *  anything missing: a record the script cannot read is an error, never a verdict. */
export function asRecord(raw: unknown, label: string): L2Record {
  const bad = (what: string): never => {
    throw new Error(`${label}: not an eval:l2 record (${what})`);
  };
  if (!isObj(raw)) bad("not a JSON object");
  const r = raw as Record<string, unknown>;
  if (!isObj(r.meta)) bad("no meta");
  const meta = r.meta as Record<string, unknown>;
  if (typeof meta.status !== "string") bad("meta.status is not a string");
  if (typeof meta.model !== "string") bad("meta.model is not a string");
  if (!isObj(meta.git)) bad("no meta.git");
  if (!Array.isArray(r.briefs)) bad("briefs is not an array");
  if (!isObj(r.ledger) || typeof (r.ledger as Record<string, unknown>).calls !== "number") bad("no ledger.calls");
  const seen = new Set<string>();
  for (const b of r.briefs as unknown[]) {
    if (!isObj(b) || typeof b.id !== "string") bad("a brief without an id");
    const brief = b as Record<string, unknown>;
    const id = brief.id as string;
    if (seen.has(id)) bad(`brief ${id} appears twice`);
    seen.add(id);
    if (brief.status !== "complete" && brief.status !== "partial" && brief.status !== "skipped")
      bad(`brief ${id} has status ${String(brief.status)}`);
    if (!Array.isArray(brief.trials)) bad(`brief ${id} has no trials array`);
    for (const t of brief.trials as unknown[]) {
      const tr = t as Record<string, unknown>;
      const ok =
        isObj(t) &&
        typeof tr.trial === "number" &&
        isObj(tr.loopScore) &&
        typeof tr.loopScore.intent === "boolean" &&
        isObj(tr.controlScore) &&
        typeof tr.controlScore.intent === "boolean";
      if (!ok) bad(`brief ${id} has a trial without a stored loopScore.intent / controlScore.intent`);
    }
  }
  if (r.summary !== undefined) {
    const net = isObj(r.summary) ? (r.summary as Record<string, unknown>).net : undefined;
    if (!isObj(net) || typeof net.intent !== "number") bad("summary without a numeric summary.net.intent");
  }
  return raw as L2Record;
}

// ── Exact binomial test and Holm (§ 4) ───────────────────────────────────────────────

/** A non-negative rational, exact. */
export interface Rational {
  num: bigint;
  den: bigint;
}

const ONE: Rational = { num: 1n, den: 1n };
const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
};
const reduce = (r: Rational): Rational => {
  const g = gcd(r.num, r.den);
  return g === 0n ? r : { num: r.num / g, den: r.den / g };
};
/** a < b, exactly. */
export const ltR = (a: Rational, b: Rational): boolean => a.num * b.den < b.num * a.den;
const minR = (a: Rational, b: Rational): Rational => (ltR(b, a) ? b : a);
const maxR = (a: Rational, b: Rational): Rational => (ltR(a, b) ? b : a);
const times2 = (a: Rational): Rational => reduce({ num: a.num * 2n, den: a.den });
/** The decision threshold, 0.05. */
const ALPHA: Rational = { num: 1n, den: 20n };
const toNum = (r: Rational): number => Number(r.num) / Number(r.den);

/** The exact two-sided sign-test p value of § 4: p = min(1, 2·P(X ≥ max(k, n − k))) with
 *  X ~ Binomial(n, ½), and p = 1 at n = 0. Binomial coefficients in BigInt. */
export function signTestP(k: number, n: number): Rational {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 0 || k < 0 || k > n) {
    throw new Error(`signTestP: need integers 0 ≤ k ≤ n (got k=${k}, n=${n})`);
  }
  if (n === 0) return ONE;
  const m = Math.max(k, n - k);
  let coeff = 1n; // C(n, 0)
  let tail = 0n;
  for (let i = 0; i <= n; i++) {
    if (i >= m) tail += coeff;
    coeff = (coeff * BigInt(n - i)) / BigInt(i + 1); // C(n, i+1), exact
  }
  const den = 1n << BigInt(n);
  return minR(reduce({ num: 2n * tail, den }), ONE);
}

/** Holm over the fixed two-model family (§ 4): the smaller raw p is doubled, the larger is the
 *  maximum of itself and that doubled value, both capped at 1. Returns [p_Holm(a), p_Holm(b)]. */
export function holm2(a: Rational, b: Rational): [Rational, Rational] {
  const aSmaller = !ltR(b, a); // a ≤ b; on a tie both come out the same either way
  const small = aSmaller ? a : b;
  const large = aSmaller ? b : a;
  const hs = minR(times2(small), ONE);
  const hl = minR(maxR(large, hs), ONE);
  return aSmaller ? [hs, hl] : [hl, hs];
}

// ── One model's primary quantities (§ 4, § 5) ────────────────────────────────────────

/** Why a brief was dropped (§ 5): a failed call, the budget breaker, or the run stopping
 *  before the brief was written to the record. */
export type DropReason = "error" | "budget" | "abort" | "not in the record" | "trial count";

/** One dropped brief, for the § 5 list. */
export interface Dropped {
  /** The brief id, or `null` when the record does not name it (a brief never written). */
  id: string | null;
  reason: DropReason;
  detail: string;
}

/** Everything § 4 and § 5 compute for one model's record. */
export interface ModelAnalysis {
  model: string;
  status: string;
  /** Complete briefs: all 3 trials completed both arms. */
  c: number;
  /** Briefs not complete, of the 26 (`26 − c`). */
  m: number;
  dropped: Dropped[];
  /** s_b per complete brief, in record order. */
  sb: { id: string; s: number }[];
  S: number;
  /** S / (3c); `null` when c = 0. */
  D: number | null;
  ties: number;
  n: number;
  k: number;
  p: Rational;
  /** The § 5 inconclusive sentence, or `null` when § 5 leaves the model a § 4 verdict. */
  inconclusive: string | null;
  /** The complete briefs, for the § 6 tables. */
  complete: BriefRecord[];
}

/** Whether a brief counts as complete under § 4: status `complete` and exactly trials 1, 2, 3. */
function isComplete(b: BriefRecord): boolean {
  if (b.status !== "complete" || b.trials.length !== T3_TRIALS) return false;
  const ts = new Set(b.trials.map((t) => t.trial));
  return ts.size === T3_TRIALS && [1, 2, 3].every((t) => ts.has(t));
}

const oneLine = (s: string, max = 200): string => {
  const flat = s.replace(/[\r\n]+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** Compute § 4 and § 5 for one model's record. Throws when |D − summary.net.intent| ≥ 1e-9. */
export function analyseModel(model: string, rec: L2Record): ModelAnalysis {
  const complete = rec.briefs.filter(isComplete);
  const dropped: Dropped[] = [];
  for (const b of rec.briefs) {
    if (isComplete(b)) continue;
    if (b.status === "skipped") dropped.push({ id: b.id, reason: "budget", detail: "skipped by the --budget breaker" });
    else if (b.status === "partial")
      dropped.push({
        id: b.id,
        reason: "error",
        detail: `trial ${b.failure?.trial ?? "?"} failed (${b.trials.length} trial(s) kept): ${oneLine(b.failure?.message ?? "no message")}`,
      });
    else dropped.push({ id: b.id, reason: "trial count", detail: `status complete with ${b.trials.length} trial(s)` });
  }
  const missing = T3_BRIEFS - rec.briefs.length;
  if (missing > 0) {
    const reason: DropReason = rec.meta.status === "complete" ? "not in the record" : "abort";
    dropped.push({
      id: null,
      reason,
      detail: `${missing} brief(s) never written to the record; it does not name them`,
    });
  }

  const sb = complete.map((b) => ({
    id: b.id,
    s: b.trials.reduce((acc, t) => acc + (t.loopScore.intent ? 1 : 0) - (t.controlScore.intent ? 1 : 0), 0),
  }));
  const c = complete.length;
  const S = sb.reduce((a, x) => a + x.s, 0);
  const D = c === 0 ? null : S / (3 * c);
  const net = rec.summary?.net?.intent;
  if (D !== null && typeof net === "number" && !(Math.abs(D - net) < NET_TOLERANCE)) {
    throw new Error(
      `${model}: D = ${D} but the record's summary.net.intent = ${net} (|Δ| ≥ ${NET_TOLERANCE}); the record and the analysis disagree`,
    );
  }
  const ties = sb.filter((x) => x.s === 0).length;
  const n = c - ties;
  const k = sb.filter((x) => x.s > 0).length;
  const p = signTestP(k, n);
  const m = T3_BRIEFS - c;

  let inconclusive: string | null = null;
  if (rec.meta.status !== "complete") {
    inconclusive = `Inconclusive for ${model}: the run did not complete (status ${rec.meta.status}).`;
  } else if (m > MAX_DROPPED) {
    inconclusive = `Inconclusive for ${model}: ${m} of ${T3_BRIEFS} briefs were not completed.`;
  }
  return { model, status: rec.meta.status, c, m, dropped, sb, S, D, ties, n, k, p, inconclusive, complete };
}

// ── Formatting ───────────────────────────────────────────────────────────────────────

/** D with its sign, 4 decimals. */
export const fmtD = (d: number | null): string =>
  d === null ? "undefined (c = 0)" : d > 0 ? `+${d.toFixed(4)}` : d.toFixed(4);
/** A p value: `1`, 4 decimals, or 3 significant digits in exponent form below 0.0001. */
export const fmtP = (r: Rational): string => {
  if (!ltR(r, ONE)) return "1";
  const x = toNum(r);
  return x >= 1e-4 ? x.toFixed(4) : x.toExponential(2);
};
const fmtExact = (r: Rational): string => (r.den === 1n ? `${r.num}` : `${r.num}/${r.den}`);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const signed3 = (x: number): string => (x > 0 ? `+${x.toFixed(3)}` : x.toFixed(3));

/** The § 4 verdict sentence for a model § 5 leaves conclusive. */
export function verdictSentence(a: ModelAnalysis, pHolm: Rational): string {
  const paren = `D = ${fmtD(a.D)}, k/n = ${a.k}/${a.n}, ${a.c}/${T3_BRIEFS} complete, p_Holm = ${fmtP(pHolm)}`;
  const significant = ltR(pHolm, ALPHA);
  if (significant && a.k > a.n - a.k && a.S > 0) {
    return `On this corpus and protocol, the loop met intent more often than equal-budget resampling for ${a.model} (${paren}).`;
  }
  if (significant && a.k < a.n - a.k && a.S < 0) {
    return `On this corpus and protocol, equal-budget resampling met intent more often than the loop for ${a.model} (${paren}).`;
  }
  return `On this corpus and protocol, no difference between the loop and equal-budget resampling was detected for ${a.model} (${paren}).`;
}

/** The sentence for a model with no record (§ 2). */
export const notRunSentence = (model: string): string => `Inconclusive (not run) for ${model}.`;

// ── Protocol checks (§ 2, § 3) ───────────────────────────────────────────────────────

/** One § 2/§ 3 check the record can show. */
export interface Check {
  what: string;
  ok: boolean;
  detail: string;
}

const sameArgv = (a: unknown, b: readonly string[]): boolean =>
  Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

/** The § 2/§ 3 checks for one model's record. */
function modelChecks(model: string, rec: L2Record): Check[] {
  const m = rec.meta;
  const checks: Check[] = [
    {
      what: `${model}: \`meta.git.dirty\` is false`,
      ok: m.git.dirty === false,
      detail: `dirty = ${String(m.git.dirty)}`,
    },
    {
      what: `${model}: \`ledger.calls\` ≥ 1 (otherwise attempt 0, not the run, § 3)`,
      ok: rec.ledger.calls >= 1,
      detail: `calls = ${rec.ledger.calls}`,
    },
    {
      what: `${model}: the command's arguments are § 2's`,
      ok: sameArgv(m.argv, T3_ARGV[model] ?? []),
      detail: `argv = ${JSON.stringify(m.argv)}`,
    },
    {
      what: `${model}: provider anthropic, ${T3_BRIEFS} briefs, ${T3_TRIALS} trials, MAX_ROUNDS ${T3_MAX_ROUNDS}`,
      ok:
        m.provider === "anthropic" && m.briefs === T3_BRIEFS && m.trials === T3_TRIALS && m.maxRounds === T3_MAX_ROUNDS,
      detail: `provider ${String(m.provider)}, briefs ${String(m.briefs)}, trials ${String(m.trials)}, maxRounds ${String(m.maxRounds)}`,
    },
    {
      what: `${model}: judge ${JUDGE_VERSION} (\`JUDGE_VERSION\` unchanged)`,
      ok: m.judge === JUDGE_VERSION,
      detail: `meta.judge = ${String(m.judge)}`,
    },
    {
      what: `${model}: started before ${T3_DEADLINE}`,
      ok: typeof m.startedAt === "string" && Date.parse(m.startedAt) < Date.parse(T3_DEADLINE),
      detail: `startedAt = ${String(m.startedAt)}`,
    },
  ];
  return checks;
}

/** Every § 2/§ 3 check the two records can show. A model that was not run has no checks. */
export function protocolChecks(haiku: L2Record | null, sonnet: L2Record | null): Check[] {
  const checks: Check[] = [];
  if (haiku) checks.push(...modelChecks(HAIKU, haiku));
  if (sonnet) checks.push(...modelChecks(SONNET, sonnet));
  if (haiku && sonnet) {
    const h = haiku.meta.git.head;
    const s = sonnet.meta.git.head;
    checks.push({
      what: "both models ran at the same `meta.git.head`",
      ok: h !== null && h === s,
      detail: `${HAIKU} ${String(h)}, ${SONNET} ${String(s)}`,
    });
    const end = haiku.meta.endedAt;
    const start = sonnet.meta.startedAt;
    const gap = end === null ? Number.NaN : Date.parse(start) - Date.parse(end);
    checks.push({
      what: `${SONNET} started after ${HAIKU}'s end and within 24 h of it`,
      ok: Number.isFinite(gap) && gap >= 0 && gap <= SONNET_WINDOW_MS,
      detail:
        end === null
          ? `cannot verify: ${HAIKU}'s endedAt is null (its run did not end); ${SONNET} startedAt ${start}`
          : `${HAIKU} endedAt ${end}, ${SONNET} startedAt ${start} (${Number.isFinite(gap) ? `${(gap / 3_600_000).toFixed(2)} h` : "unreadable"})`,
    });
  }
  return checks;
}

// ── § 6 secondary measures ───────────────────────────────────────────────────────────

const cellsOf = (briefs: BriefRecord[]): TrialCell[] =>
  briefs.flatMap((b) =>
    b.trials.map((t) => ({
      id: b.id,
      trial: t.trial,
      loop: triple(t.loopScore),
      control: triple(t.controlScore),
    })),
  );
const triple = (s: MetricTriple): MetricTriple => ({ valid: s.valid, intent: s.intent, sound: s.sound });
const trialsOf = (briefs: BriefRecord[]): TrialRecord[] => briefs.flatMap((b) => b.trials);
const tokens = (us: { usage: { input: number; output: number } }[]): { input: number; output: number } =>
  us.reduce((a, u) => ({ input: a.input + u.usage.input, output: a.output + u.usage.output }), { input: 0, output: 0 });
const truncatedIn = (calls: CallRecord[], arm: "loop" | "control"): number =>
  calls.filter((c) => c.arm === arm && c.stop !== null && isTruncationStop(c.stop)).length;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function secondaryTables(models: { model: string; rec: L2Record; a: ModelAnalysis }[]): string[] {
  const label = `*${SECONDARY_LABEL}.* Over the complete briefs unless a column says the whole run.`;
  const out: string[] = ["## Secondary measures (§ 6)", ""];
  if (models.length === 0) return [...out, "No model was run.", ""];

  out.push("### Net deltas, valid and sound (loop − control, of the mean per-trial rates)", "", label, "");
  out.push("| Model | Valid | Sound |", "| --- | --- | --- |");
  for (const { model, a } of models) {
    const s = summarizeTrials(cellsOf(a.complete));
    out.push(`| ${model} | ${signed3(s.net.valid)} | ${signed3(s.net.sound)} |`);
  }

  out.push("", "### pass@3 and pass^3 on intent", "", label, "");
  out.push("| Model | Arm | pass@3 | pass^3 |", "| --- | --- | --- | --- |");
  for (const { model, a } of models) {
    const cells = cellsOf(a.complete);
    for (const arm of ["loop", "control"] as const) {
      out.push(`| ${model} | ${arm} | ${pct(passAtN(cells, arm))} | ${pct(passHatN(cells, arm))} |`);
    }
  }

  out.push("", "### Per-trial rates, mean ± σ across the 3 trials", "", label, "");
  out.push("| Model | Arm | Valid | Intent | Sound |", "| --- | --- | --- | --- | --- |");
  for (const { model, a } of models) {
    const s = summarizeTrials(cellsOf(a.complete));
    for (const arm of ["loop", "control"] as const) {
      const ms = (x: { mean: number; sigma: number }): string => `${pct(x.mean)} ± ${pct(x.sigma)}`;
      out.push(`| ${model} | ${arm} | ${ms(s[arm].valid)} | ${ms(s[arm].intent)} | ${ms(s[arm].sound)} |`);
    }
  }

  out.push("", "### Loop rounds used (calls per trial, at most 3)", "", label, "");
  out.push("| Model | Trials | 1 call | 2 calls | 3 calls | Mean |", "| --- | --- | --- | --- | --- | --- |");
  for (const { model, a } of models) {
    const rounds = trialsOf(a.complete).map((t) => t.loop.rounds.length);
    const at = (r: number): number => rounds.filter((x) => x === r).length;
    const mean = rounds.length ? rounds.reduce((x, y) => x + y, 0) / rounds.length : 0;
    out.push(`| ${model} | ${rounds.length} | ${at(1)} | ${at(2)} | ${at(3)} | ${mean.toFixed(2)} |`);
  }

  out.push("", "### Control sample counts (samples per trial)", "", label, "");
  out.push("| Model | Trials | Min | Median | Max | Mean | Total |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const { model, a } of models) {
    const n = trialsOf(a.complete).map((t) => t.control.samples.length);
    const total = n.reduce((x, y) => x + y, 0);
    const mn = n.length ? Math.min(...n) : 0;
    const mx = n.length ? Math.max(...n) : 0;
    const mean = n.length ? total / n.length : 0;
    out.push(`| ${model} | ${n.length} | ${mn} | ${median(n)} | ${mx} | ${mean.toFixed(2)} | ${total} |`);
  }

  out.push("", "### Tokens", "", label, "");
  out.push(
    "| Model | Loop in / out | Control in / out | Whole run: calls | Fresh in | Cache write | Cache read | Out | Total |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const { model, rec, a } of models) {
    const tr = trialsOf(a.complete);
    const lt = tokens(tr.flatMap((t) => t.loop.rounds));
    const ct = tokens(tr.flatMap((t) => t.control.samples));
    const l = rec.ledger;
    out.push(
      `| ${model} | ${lt.input} / ${lt.output} | ${ct.input} / ${ct.output} | ${l.calls} | ${l.inputTokens} | ${l.cacheCreationTokens} | ${l.cacheReadTokens} | ${l.outputTokens} | ${l.totalTokens} |`,
    );
  }

  out.push("", "### Dollars", "", `*${SECONDARY_LABEL}.* Whole run.`, "");
  out.push("| Model | Harness count (`ledger.usd`) | Console promo balance |", "| --- | --- | --- |");
  for (const { model, rec } of models) {
    const usd = rec.ledger.usd;
    out.push(`| ${model} | ${usd === null ? "n/a" : `$${usd.toFixed(2)}`} | (from the Console, by hand) |`);
  }

  out.push("", "### Truncated replies (`max_tokens`)", "", label, "");
  out.push("| Model | Loop calls | Control calls | Whole run (`ledger.stops`) |", "| --- | --- | --- | --- |");
  for (const { model, rec, a } of models) {
    const calls = trialsOf(a.complete).flatMap((t) => t.calls);
    const whole = Object.entries(rec.ledger.stops ?? {}).reduce((x, [k, v]) => x + (isTruncationStop(k) ? v : 0), 0);
    out.push(`| ${model} | ${truncatedIn(calls, "loop")} | ${truncatedIn(calls, "control")} | ${whole} |`);
  }
  out.push("");
  return out;
}

// ── The report ───────────────────────────────────────────────────────────────────────

/** One model's input: where it came from, and its record (`null` when not run). */
export interface ModelInput {
  source: string;
  record: L2Record | null;
}

/** The full Markdown report. Pure: the same two records always give the same bytes. */
export function renderReport(haikuIn: ModelInput, sonnetIn: ModelInput): string {
  const slots = [
    { model: HAIKU, input: haikuIn },
    { model: SONNET, input: sonnetIn },
  ];
  for (const { model, input } of slots) {
    if (input.record && input.record.meta.model !== model) {
      throw new Error(
        `${input.source}: meta.model is ${input.record.meta.model}, but this argument slot is ${model} (the order is <haiku> <sonnet>)`,
      );
    }
  }
  const analyses = slots.map(({ model, input }) => (input.record ? analyseModel(model, input.record) : null));
  // Holm (§ 4): an inconclusive or not-run model enters with p = 1.
  const entering = analyses.map((a) => (a === null || a.inconclusive !== null ? ONE : a.p));
  const [h0, h1] = holm2(entering[0] as Rational, entering[1] as Rational);
  const pHolm = [h0, h1];

  const out: string[] = [
    "# T3 result: analysis output",
    "",
    "Printed by `eval/t3-analysis.ts` from the two records, as pre-registered in",
    "`eval/live-runs/2026-11-t3-preregistration.md` (§§ 4–6).",
    "",
    `- ${HAIKU}: ${haikuIn.record ? `\`${haikuIn.source}\`` : "none (not run)"}`,
    `- ${SONNET}: ${sonnetIn.record ? `\`${sonnetIn.source}\`` : "none (not run)"}`,
    "",
  ];

  // § 2 / § 3 checks.
  const checks = protocolChecks(haikuIn.record, sonnetIn.record);
  const violations = checks.filter((c) => !c.ok);
  out.push("## Protocol checks (§ 2, § 3)", "");
  if (violations.length > 0) {
    out.push(`> **PROTOCOL VIOLATION: ${violations.length} check(s) failed.** They change no verdict below.`);
    for (const v of violations) out.push(`> - **${v.what}**: ${v.detail}`);
    out.push("");
  }
  if (checks.length === 0) out.push("No record, so nothing to check.", "");
  else {
    out.push("| Check | Holds | Detail |", "| --- | --- | --- |");
    for (const c of checks) out.push(`| ${c.what} | ${c.ok ? "yes" : "**NO**"} | ${c.detail.replace(/\|/g, "\\|")} |`);
    out.push("");
  }

  // § 4 / § 5 verdicts.
  out.push("## Verdicts (§ 4, § 5)", "");
  let anyNoDifference = false;
  slots.forEach(({ model }, i) => {
    const a = analyses[i];
    let sentence: string;
    if (!a) sentence = notRunSentence(model);
    else if (a.inconclusive) sentence = a.inconclusive;
    else {
      sentence = verdictSentence(a, pHolm[i] as Rational);
      if (sentence.includes("no difference")) anyNoDifference = true;
    }
    out.push(`- ${sentence}`);
  });
  out.push("");
  if (anyNoDifference) {
    out.push(
      'A "no difference detected" verdict at this resolution is not evidence of no effect (§ 4: with Holm over two models a model needs raw p < 0.025, 20/26 at n = 26; n counts non-tied briefs only).',
      "",
    );
  }

  // § 4 quantities.
  out.push("## Primary quantities (§ 4)", "");
  out.push(
    "Per complete brief b, s_b = Σ over its 3 trials of (loop intent − control intent); S = Σ s_b; D = S / (3c); n = non-tied complete briefs; k = those with s_b > 0. Raw p is the exact two-sided sign test; an inconclusive or not-run model enters Holm with p = 1.",
    "",
  );
  out.push(
    "| Model | Record status | c | Dropped (of 26) | S | 3c | D | Ties | n | k | n − k | Raw p (exact) | Enters Holm | p_Holm |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  slots.forEach(({ model }, i) => {
    const a = analyses[i];
    const ph = pHolm[i] as Rational;
    const en = entering[i] as Rational;
    if (!a) {
      out.push(`| ${model} | not run | — | — | — | — | — | — | — | — | — | — | ${fmtP(en)} | ${fmtP(ph)} |`);
      return;
    }
    out.push(
      `| ${model} | ${a.status} | ${a.c} | ${a.m} | ${a.S} | ${3 * a.c} | ${fmtD(a.D)} | ${a.ties} | ${a.n} | ${a.k} | ${a.n - a.k} | ${fmtP(a.p)} (${fmtExact(a.p)}) | ${fmtP(en)} | ${fmtP(ph)} |`,
    );
  });
  out.push("");
  const inconclusiveWithData = analyses.filter((a): a is ModelAnalysis => a !== null && a.inconclusive !== null);
  if (inconclusiveWithData.length > 0) {
    out.push(
      `For ${inconclusiveWithData.map((a) => a.model).join(" and ")}, § 5 makes the verdict inconclusive: the row above is arithmetic over the record and decides nothing.`,
      "",
    );
  }
  const histogram = slots.flatMap(({ model }, i) => {
    const a = analyses[i];
    if (!a || a.sb.length === 0) return [];
    const counts = new Map<number, number>();
    for (const { s } of a.sb) counts.set(s, (counts.get(s) ?? 0) + 1);
    const parts = [...counts.keys()].sort((x, y) => y - x).map((s) => `${s > 0 ? `+${s}` : s}: ${counts.get(s) ?? 0}`);
    return [`- ${model}, complete briefs by s_b: ${parts.join(" · ")}`];
  });
  if (histogram.length > 0) out.push(...histogram, "");

  // § 5 list.
  out.push("## Dropped briefs (§ 5)", "");
  slots.forEach(({ model }, i) => {
    const a = analyses[i];
    if (!a) {
      out.push(`- ${model}: not run.`);
      return;
    }
    if (a.dropped.length === 0) {
      out.push(`- ${model}: none.`);
      return;
    }
    out.push(`- ${model}:`);
    for (const d of a.dropped) out.push(`  - ${d.id === null ? "(unnamed)" : `\`${d.id}\``}: ${d.reason}. ${d.detail}`);
  });
  out.push("");

  // § 6 tables.
  const run = slots.flatMap(({ model, input }, i) => {
    const a = analyses[i];
    return input.record && a ? [{ model, rec: input.record, a }] : [];
  });
  out.push(...secondaryTables(run));
  return out.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────

/** Read one argument: `none`, or a JSON record, gzipped or not (detected by its magic bytes). */
export function readRecord(arg: string, read: (path: string) => Buffer = (p) => readFileSync(p)): ModelInput {
  if (arg === "none") return { source: "none", record: null };
  const buf = read(arg);
  const text =
    buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${arg}: not JSON (${(err as Error).message})`);
  }
  return { source: arg.replace(/\\/g, "/"), record: asRecord(raw, arg) };
}

/** The whole CLI as a function of its arguments: the report, or an error. */
export function runCli(args: string[], read?: (path: string) => Buffer): string {
  if (args.length !== 2) {
    throw new Error("usage: tsx eval/t3-analysis.ts <haiku.json[.gz]|none> <sonnet.json[.gz]|none>");
  }
  return renderReport(readRecord(args[0] as string, read), readRecord(args[1] as string, read));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(`${runCli(process.argv.slice(2))}\n`);
  } catch (err) {
    process.stderr.write(`✗ t3-analysis: ${(err as Error).message}\n`);
    process.exit(1);
  }
}
