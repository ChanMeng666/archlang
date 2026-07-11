/**
 * L2 — the diagnostic feedback-loop tier of the eval ladder, and its equal-budget control.
 *
 * L0 is a raw one-shot model generation; L1 runs that source through the deterministic
 * healers with no model in the loop (see `l1.ts`). L2 asks the decisive question the
 * v1.13 "drivability" narrative rests on (roadmap Tranche 3; deep-dive H3): **does
 * feeding a model its own compiler/lint diagnostics and letting it revise beat simply
 * resampling the model the same number of tokens?**
 *
 * The experiment is two arms per brief, reported net of each other:
 *   - **loop arm** — generate, feed back the deterministic diagnostics (compile + lint,
 *     the same `arch fix --dry-run` preview an agent sees) plus trimmed `describe()`
 *     facts, revise, ≤ `maxRounds` rounds; stop early once the plan is clean.
 *   - **control arm** — i.i.d. resampling of the *same* one-shot prompt with the **same
 *     token budget the loop actually spent** (Olausson et al., arXiv:2306.09896: a fair
 *     refinement comparison must equalize the sampling budget, else the loop is just
 *     buying extra tries). Best-of-n over both arms, scored per metric.
 *
 * If the loop's delta over the control is ≤ 0, that is the finding — the caller prints it
 * verbatim (roadmap T3: "if ≤ 0, print exactly that").
 *
 * **Oracle isolation (load-bearing; deep-dive H3, AgentLens arXiv:2605.12925).** The
 * feedback the model receives is derived ONLY from the plan it wrote: compiler
 * diagnostics, lint suggestions, and a trimmed `describe()` projection. It never contains
 * the corpus `expect` block, the reference plans, subscore targets, or intent-graph
 * ground truth — the scorer's private knowledge lives strictly on the scorer's side. This
 * module is therefore free of any reference to the private concept table or the reference
 * plan directory (a static test enforces it).
 *
 * Pure and network-free: the model is injected as an {@link L2Author}, so the whole
 * protocol is unit-testable with a scripted fake. The one impurity is `describe`/`compile`/
 * `lint` — all deterministic core functions.
 */

import { compile, describe as describePlan, diagnosticToJson, lint } from "../src/index.js";
import { type CorpusEntry, type Score, extractArch, scoreSource } from "./run.js";

/** A single chat message in a multi-turn author exchange. */
export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Token usage for one model call (prompt vs. completion tokens). */
export interface Usage {
  input: number;
  output: number;
}

/**
 * The injected model. Given a full message list and a seed, returns the reply text and
 * its token usage. The harness (`eval/l2-run.ts`) supplies a real OpenAI implementation;
 * tests supply a scripted fake. Kept deliberately thin so this module needs no network.
 */
export type L2Author = (messages: ChatMsg[], seed: number) => Promise<{ text: string; usage: Usage }>;

/**
 * The deterministic feedback string handed back to the model after a round. Contains
 * ONLY facts about the plan the model just wrote:
 *   (a) `compile --json` diagnostics (with machine-applicable `fixes` — the same preview
 *       `arch fix --dry-run` shows),
 *   (b) `lint --json` diagnostics (same projection),
 *   (c) a trimmed `describe()` — room ids/labels/areas, totals, the plan's own interior
 *       adjacency (`input_graph`), and per-room reachability — omitted when the plan does
 *       not compile (there are no facts to report),
 *   (d) a fixed revise instruction.
 *
 * It never carries the corpus expectations, reference plans, subscore targets, or
 * intent-graph truth (oracle isolation — see the module header).
 */
export function buildFeedback(source: string): string {
  const c = compile(source, { noCache: true });
  const valid = c.errors.length === 0;
  const compileDiags = c.diagnostics.map((d) => diagnosticToJson(source, d));
  const lintDiags = lint(source).map((d) => diagnosticToJson(source, d));

  const lines: string[] = [];
  lines.push("## Compiler diagnostics (`arch compile --json`)");
  lines.push(compileDiags.length ? JSON.stringify(compileDiags, null, 2) : "(none)");
  lines.push("");
  lines.push("## Lint (`arch lint --json`)");
  lines.push(lintDiags.length ? JSON.stringify(lintDiags, null, 2) : "(none)");
  lines.push("");

  if (valid) {
    const s = describePlan(source);
    const trimmed = {
      rooms: s.rooms.map((r) => ({ id: r.id, label: r.label, area_m2: r.area_m2 })),
      totals: s.totals,
      input_graph: s.input_graph,
      access: {
        hasEntrance: s.access.hasEntrance,
        rooms: s.access.rooms.map((r) => ({ id: r.id, reachable: r.reachable })),
      },
    };
    lines.push("## Plan facts (`arch describe --json`, trimmed)");
    lines.push(JSON.stringify(trimmed, null, 2));
    lines.push("");
  }

  lines.push("Revise your plan to address the diagnostics above. Reply with ONLY one ```arch code block.");
  return lines.join("\n");
}

/** Whether a plan still has something worth feeding back: a compile error, or any lint
 *  warning. A plan with neither is "clean" and stops the loop early. */
export function hasIssues(source: string): boolean {
  const c = compile(source, { noCache: true });
  if (c.errors.length > 0) return true;
  return lint(source).length > 0;
}

/** One round of the loop arm: the source the model authored and the tokens it cost. */
export interface RoundResult {
  source: string;
  usage: Usage;
}

/** The loop arm's full trace: one entry per model call (≥ 1, ≤ `1 + maxRounds`). */
export interface LoopArmResult {
  rounds: RoundResult[];
}

/**
 * Run the diagnostic feedback loop for one brief. Round 0 is a plain one-shot generation
 * (`[system, user=brief]`). While the authored source still {@link hasIssues} and the
 * round cap is not reached, the prior *raw* reply is appended as an assistant turn and a
 * {@link buildFeedback} string as the next user turn, and the model is called again. A
 * clean plan stops the loop early. Total calls are bounded by `1 + maxRounds`.
 */
export async function runLoopArm(
  entry: CorpusEntry,
  author: L2Author,
  opts: { system: string; seed: number; maxRounds?: number },
): Promise<LoopArmResult> {
  const maxRounds = opts.maxRounds ?? 2;
  const messages: ChatMsg[] = [
    { role: "system", content: opts.system },
    { role: "user", content: entry.prompt },
  ];
  const rounds: RoundResult[] = [];
  let round = 0;
  while (true) {
    const { text, usage } = await author(messages, opts.seed);
    const source = extractArch(text);
    rounds.push({ source, usage });
    round++;
    if (round > maxRounds) break; // reached the call cap (1 + maxRounds)
    if (!hasIssues(source)) break; // clean plan — no reason to spend another round
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: buildFeedback(source) });
  }
  return { rounds };
}

/** One i.i.d. control sample: its source, token cost, and the seed it was drawn with. */
export interface ControlSample {
  source: string;
  usage: Usage;
  seed: number;
}

/** The control arm's full trace: the i.i.d. samples drawn under the equal budget. */
export interface ControlArmResult {
  samples: ControlSample[];
}

/**
 * Run the equal-budget control arm: draw i.i.d. one-shot samples of the *same* prompt
 * (`[system, user=brief]`), each with seed `seedBase + i`, until the cumulative
 * (input + output) token spend reaches `budgetTokens`. The sample that crosses the
 * budget is **kept** — rounding the sample count UP, which spends slightly more on the
 * control than the loop and so is conservative toward the loop's conclusion (a control
 * that gets a fractional extra try can only make the loop look worse, never better).
 * At least one sample is always drawn.
 */
export async function runControlArm(
  entry: CorpusEntry,
  author: L2Author,
  opts: { system: string; seedBase: number; budgetTokens: number },
): Promise<ControlArmResult> {
  const messages: ChatMsg[] = [
    { role: "system", content: opts.system },
    { role: "user", content: entry.prompt },
  ];
  const samples: ControlSample[] = [];
  let spent = 0;
  let i = 0;
  do {
    const seed = opts.seedBase + i;
    const { text, usage } = await author(messages, seed);
    samples.push({ source: extractArch(text), usage, seed });
    spent += usage.input + usage.output;
    i++;
  } while (spent < opts.budgetTokens);
  return { samples };
}

/** An arm's per-metric verdict (independent best-of over its outputs). */
export interface MetricTriple {
  valid: boolean;
  intent: boolean;
  sound: boolean;
}

/** An arm's score: the per-metric best-of verdict plus every output's full {@link Score}. */
export interface ArmScore extends MetricTriple {
  scores: Score[];
}

/**
 * Best-of over an arm's outputs, **independently per metric** (applied symmetrically to
 * both arms): the arm passes `valid`/`intent`/`sound` if *any* one output satisfies that
 * metric — the metrics need not be satisfied by the same output. This is the standard
 * best-of-n reading and is what makes the control a fair equal-budget comparison.
 */
export function combineMetrics(scores: Score[]): MetricTriple {
  return {
    valid: scores.some((s) => s.valid),
    intent: scores.some((s) => s.semanticPass),
    sound: scores.some((s) => s.valid && s.lintWarnings === 0),
  };
}

/** Score every source an arm produced and reduce to the per-metric best-of verdict. */
export function scoreArm(entry: CorpusEntry, sources: string[]): ArmScore {
  const scores = sources.map((s) => scoreSource(entry, s));
  return { ...combineMetrics(scores), scores };
}

/** One (brief, trial) cell: the two arms' per-metric verdicts, for aggregation. */
export interface TrialCell {
  id: string;
  trial: number;
  loop: MetricTriple;
  control: MetricTriple;
}

/** A rate's mean and (population) standard deviation across trials. */
export interface MeanSigma {
  mean: number;
  sigma: number;
}

/** One arm's mean±σ on each metric, aggregated across trials. */
export interface ArmMetricSummary {
  valid: MeanSigma;
  intent: MeanSigma;
  sound: MeanSigma;
}

/** The net loop − control delta on each metric (of the mean rates). */
export interface NetDelta {
  valid: number;
  intent: number;
  sound: number;
}

/** The cross-trial summary of an L2 run: per-arm mean±σ and the net loop−control delta. */
export interface TrialsSummary {
  trials: number;
  briefs: number;
  loop: ArmMetricSummary;
  control: ArmMetricSummary;
  /** loop.mean − control.mean, per metric. Roadmap T3: print ≤ 0 verbatim. */
  net: NetDelta;
}

/**
 * Aggregate per-(brief, trial) cells into per-arm mean±σ rates and the net delta. A
 * "rate" is computed **per trial** (fraction of briefs passing a metric in that trial);
 * mean and population σ are then taken across the trials, so σ reports the trial-to-trial
 * variance of the rate (the quantity a small corpus makes noisy — H3's resolution point).
 */
export function summarizeTrials(cells: TrialCell[]): TrialsSummary {
  const trialIds = [...new Set(cells.map((c) => c.trial))].sort((a, b) => a - b);
  const briefIds = [...new Set(cells.map((c) => c.id))];

  const rateInTrial = (trial: number, arm: "loop" | "control", metric: keyof MetricTriple): number => {
    const inTrial = cells.filter((c) => c.trial === trial);
    if (inTrial.length === 0) return 0;
    return inTrial.filter((c) => c[arm][metric]).length / inTrial.length;
  };

  const meanSigma = (arm: "loop" | "control", metric: keyof MetricTriple): MeanSigma => {
    const rates = trialIds.map((t) => rateInTrial(t, arm, metric));
    const n = rates.length || 1;
    const mean = rates.reduce((a, b) => a + b, 0) / n;
    const variance = rates.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
    return { mean, sigma: Math.sqrt(variance) };
  };

  const armSummary = (arm: "loop" | "control"): ArmMetricSummary => ({
    valid: meanSigma(arm, "valid"),
    intent: meanSigma(arm, "intent"),
    sound: meanSigma(arm, "sound"),
  });

  const loop = armSummary("loop");
  const control = armSummary("control");
  return {
    trials: trialIds.length,
    briefs: briefIds.length,
    loop,
    control,
    net: {
      valid: loop.valid.mean - control.valid.mean,
      intent: loop.intent.mean - control.intent.mean,
      sound: loop.sound.mean - control.sound.mean,
    },
  };
}

/** `pass@n`: the fraction of briefs where **at least one** trial passed `metric` for
 *  `arm` (default `intent`). The optimistic best-of-trials rate. */
export function passAtN(cells: TrialCell[], arm: "loop" | "control", metric: keyof MetricTriple = "intent"): number {
  const briefIds = [...new Set(cells.map((c) => c.id))];
  if (briefIds.length === 0) return 0;
  let hits = 0;
  for (const id of briefIds) {
    const rows = cells.filter((c) => c.id === id);
    if (rows.some((c) => c[arm][metric])) hits++;
  }
  return hits / briefIds.length;
}

/** `pass^n`: the fraction of briefs where **every** trial passed `metric` for `arm`
 *  (default `intent`). The reliability rate — how often the arm is dependable. */
export function passHatN(cells: TrialCell[], arm: "loop" | "control", metric: keyof MetricTriple = "intent"): number {
  const briefIds = [...new Set(cells.map((c) => c.id))];
  if (briefIds.length === 0) return 0;
  let hits = 0;
  for (const id of briefIds) {
    const rows = cells.filter((c) => c.id === id);
    if (rows.length > 0 && rows.every((c) => c[arm][metric])) hits++;
  }
  return hits / briefIds.length;
}
