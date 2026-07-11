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
 *     prompt (with `spec.llm.md` as the system prompt) and score that. This produces
 *     the headline number for the README.
 *
 * Because live runs cost money, `--live` is guarded: it prints what it *would* send
 * (provider, model, brief count) and exits `3` **without calling any API** unless you
 * pass `--yes` (or set `ARCHLANG_EVAL_CONFIRM=1`). `--max <n>` caps how many briefs
 * run. Live output is written to `eval/results.live.md` (git-ignored, ephemeral — the
 * numbers move with the model and the day) and, when `eval/live-baseline.json` is
 * present, carries a "Delta vs baseline" section. The offline path is unchanged.
 *
 * Run: `npm run eval` / `npm run eval:ci` (offline) · `npm run eval:live -- --yes`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile, describe as describePlan, lint } from "../src/index.js";
import {
  type AssertionResult,
  type Subscores,
  JUDGE_VERSION,
  checkPredicates,
  compileExpect,
  projectSubscores,
} from "./assertions.js";
import { SYNONYMS_VERSION } from "./synonyms.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * A brief's semantic expectations — the judge-v2 shape. Every field is BRIEF-grounded
 * (derived from the prompt's words, not the golden's labels/geometry): concepts come
 * from the eval's private {@link import("./synonyms.js")} oracle, and quantitative
 * bands (`areaM2`/`totalAreaM2`) carry a `source` quote from the brief so a failure can
 * cite what licensed the number. `adjacency`/`reachable` are asserted only where the
 * brief's own words license them; they score as subscores and never gate (see
 * {@link import("./assertions.js")}).
 */
export interface Expect {
  /** Exact expected room count. */
  rooms?: number;
  /** Rooms the brief names, as concepts, with an optional count band and area band. */
  roomsInclude?: {
    concept: string;
    count?: { min?: number; max?: number };
    areaM2?: { min?: number; max?: number; source: string };
  }[];
  /** Total floor-area band — only where the brief states a number (e.g. "about 42 m²"). */
  totalAreaM2?: { min: number; max: number; source: string };
  /** Interior-door adjacency the brief licenses: `{ conceptA: [conceptB, …] }`. */
  adjacency?: { requiredEdges: Record<string, string[]>; source: string };
  /** Every room reachable from a modeled entrance — asserted only on brief license. */
  reachable?: boolean;
}

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
export function loadCorpus(): CorpusEntry[] {
  return JSON.parse(readFileSync(resolve(ROOT, "eval/corpus.json"), "utf8")) as CorpusEntry[];
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

/** Live provider/model, resolved from env: explicit `ARCHLANG_EVAL_PROVIDER`,
 *  else OpenAI when only its key is present, else Anthropic (the default). */
export function resolveProvider(): { provider: "anthropic" | "openai"; model: string } {
  const explicit = process.env.ARCHLANG_EVAL_PROVIDER?.toLowerCase();
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const useOpenAI = explicit === "openai" || (explicit !== "anthropic" && hasOpenAI && !hasAnthropic);
  return useOpenAI
    ? { provider: "openai", model: process.env.ARCHLANG_EVAL_MODEL ?? "gpt-5.5-2026-04-23" }
    : { provider: "anthropic", model: process.env.ARCHLANG_EVAL_MODEL ?? "claude-sonnet-5" };
}

/** The one system prompt both providers get: the spec + a reply-format instruction. */
function systemPrompt(): string {
  const spec = readFileSync(resolve(ROOT, "spec.llm.md"), "utf8");
  return `${spec}\n\nYou write ArchLang. Reply with ONLY one \`\`\`arch code block — no prose.`;
}

/** Pull the `.arch` source out of a model reply (fenced block if present, else raw). */
function extractArch(text: string): string {
  const m = text.match(/```(?:arch)?\n([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

/** Author a plan via the Anthropic Messages API. */
async function authorWithAnthropic(
  prompt: string,
  system: string,
  model: string,
  ledger?: LiveLedger,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (required for --live with the anthropic provider)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      // Reasoning models spend internal thinking tokens from this same budget — a 2048
      // cap starved the model into empty/truncated plans (this was the live bug). Sized
      // so truncation measures authorability, not the budget (mirrors the OpenAI cap).
      max_tokens: 16384,
      // Pin sampling for reproducibility (the OpenAI reasoning endpoint rejects this, so
      // it is anthropic-only — see authorWithOpenAI).
      temperature: 0,
      // The ~40 KB spec system prompt is byte-identical across every brief, so mark it
      // cacheable: the first call writes the cache, every later call reads it.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
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
  });
  return extractArch(json.content.map((b) => b.text ?? "").join(""));
}

/** Best-effort reproducibility seed for the OpenAI request (the API documents `seed` as
 *  a hint, not a guarantee — pair it with `system_fingerprint` to detect backend drift). */
const OPENAI_SEED = 20260711;

/** Author a plan via the OpenAI Chat Completions API (dependency-free `fetch`). */
async function authorWithOpenAI(prompt: string, system: string, model: string, ledger?: LiveLedger): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set (required for --live with the openai provider)");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
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
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    system_fingerprint?: string | null;
  };
  ledger?.record({ input: json.usage?.prompt_tokens, output: json.usage?.completion_tokens });
  ledger?.noteFingerprint(json.system_fingerprint);
  return extractArch(json.choices?.[0]?.message?.content ?? "");
}

/** Ask the resolved provider's model to author a plan from the prompt. The optional
 *  `ledger` records per-call token usage (and OpenAI's system_fingerprint). */
function makeAuthor(
  provider: "anthropic" | "openai",
  model: string,
  ledger?: LiveLedger,
): (prompt: string) => Promise<string> {
  const system = systemPrompt();
  const author = provider === "openai" ? authorWithOpenAI : authorWithAnthropic;
  return (prompt: string) => author(prompt, system, model, ledger);
}

/** Render the scorecard as Markdown. */
function renderResults(results: Score[], summary: Summary, mode: string): string {
  const pct = (n: number): string => `${Math.round((n / summary.total) * 100)}%`;
  // Compact per-dimension subscores, e.g. `R1 L0.67 A– Adj1` (– = dimension unasserted).
  const sub = (n: number | null | undefined): string =>
    n === null || n === undefined ? "–" : `${Math.round(n * 100) / 100}`;
  const subCell = (r: Score): string =>
    r.subscores
      ? `R${sub(r.subscores.rooms)} L${sub(r.subscores.labels)} A${sub(r.subscores.area)} Adj${sub(r.subscores.adjacency)}`
      : "—";
  const rows = results.map((r) => {
    if (r.skipped) return `| \`${r.id}\` | ⏭️ skipped | — | — | — | ${r.failures.join("; ") || "budget"} |`;
    const status = r.semanticPass ? (r.lintWarnings === 0 ? "✅ pass" : "⚠️ warns") : "❌ fail";
    const notes = r.failures.length
      ? r.failures.join("; ")
      : r.lintWarnings
        ? `${r.lintWarnings} lint warning(s)`
        : "—";
    return `| \`${r.id}\` | ${status} | ${r.valid ? "yes" : "no"} | ${r.lintWarnings} | ${subCell(r)} | ${notes} |`;
  });
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
    `- **Valid (compiles):** ${summary.valid}/${summary.total} (${pct(summary.valid)})`,
    `- **Intent match (semantic):** ${summary.semanticPass}/${summary.total} (${pct(summary.semanticPass)})`,
    `- **Sound (lint-clean):** ${summary.sound}/${summary.total} (${pct(summary.sound)})`,
    "",
    "Subscores per row: **R**ooms · **L**abels · **A**rea · **Adj**acency (– = unasserted; adjacency/reachability score but never gate).",
    "",
    "| Prompt | Result | Valid | Lint | Subscores | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

type Summary = {
  total: number;
  valid: number;
  semanticPass: number;
  sound: number;
  /** Live-only: briefs the `--budget` breaker skipped (excluded from `total`). Append-only. */
  skipped?: number;
};

/** A recorded live baseline (`eval/live-baseline.json`) to compare a fresh run against. */
interface Baseline extends Summary {
  provider?: string;
  model?: string;
  date?: string;
  /** Scoring-core version the baseline was produced under. Absent on pre-judge-field
   *  baselines — which `renderDelta` flags, since a judge change makes deltas incomparable. */
  judge?: string;
}

const LIVE_RESULTS = "eval/results.live.md";
const BASELINE = "eval/live-baseline.json";

/** Banner prepended to the live results file so nobody mistakes it for the committed scorecard. */
const LIVE_HEADER = [
  "<!-- Live authorability results — generated by `npm run eval:live`. EPHEMERAL and",
  "     git-ignored: these numbers depend on the model and the day, so they must NOT be",
  "     committed as the offline scorecard (that is `eval/results.md`). The delta below,",
  "     when present, is against `eval/live-baseline.json`. -->",
  "",
  "",
].join("\n");

/** Read the recorded live baseline, or `null` if it is missing/unreadable. */
function readBaseline(): Baseline | null {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, BASELINE), "utf8")) as Baseline;
  } catch {
    return null;
  }
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
 *  providers' published pricing pages. An unknown model degrades a `usd` budget to
 *  token-only tracking (warned on stderr). Deliberate over-estimates so the ceiling trips
 *  early rather than late: cache-read tokens are billed at the full input rate, and
 *  sticker prices are used where an intro discount exists (claude-sonnet-5 is $2/$10
 *  through 2026-08-31; gpt-5.5 long-context requests can bill up to 2x input). */
const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "gpt-5.5-2026-04-23": { input: 5, output: 30 },
};

/** Cumulative live-run usage tracker + `--budget` circuit breaker. Records per-call token
 *  usage (cache counts at face value) and, when the model's price is known, an approximate
 *  running cost; also captures OpenAI's first non-null `system_fingerprint`. */
class LiveLedger {
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  cacheCreation = 0;
  cacheRead = 0;
  systemFingerprint?: string;
  readonly priceKnown: boolean;

  constructor(
    readonly model: string,
    readonly limit?: BudgetLimit,
  ) {
    this.priceKnown = model in PRICES_USD_PER_MTOK;
  }

  /** Fold one API call's usage into the running totals. */
  record(u: { input?: number; output?: number; cacheCreation?: number; cacheRead?: number }): void {
    this.calls++;
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
function renderDelta(base: Baseline, s: Summary): string {
  const line = (name: string, b: number, n: number): string => {
    const d = n - b;
    return `- **${name}:** ${b} → ${n} (${d > 0 ? `+${d}` : `${d}`})`;
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
  return [
    "",
    "## Delta vs baseline",
    "",
    `Against \`${BASELINE}\` (${who}).`,
    "",
    line("Valid (compiles)", base.valid, s.valid),
    line("Intent match (semantic)", base.semanticPass, s.semanticPass),
    line("Sound (lint-clean)", base.sound, s.sound),
    note,
    judgeNote,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");

  // OFFLINE — the CI regression guard. Behaviour and output kept byte-identical.
  if (!live) {
    const entries = loadCorpus();
    const { results, summary } = await evaluate(entries, (e: CorpusEntry) => readGolden(e));
    const md = renderResults(results, summary, "offline");
    writeFileSync(resolve(ROOT, "eval/results.md"), md);
    process.stdout.write(md + "\n");
    process.stdout.write(`✓ wrote eval/results.md\n`);
    if (summary.semanticPass !== summary.total) {
      process.stderr.write(`✗ ${summary.total - summary.semanticPass} golden(s) regressed\n`);
      process.exit(1);
    }
    return;
  }

  // LIVE — networked and paid. Resolve the plan, then require explicit confirmation.
  const { provider, model } = resolveProvider();
  const max = parseMax(argv);
  const budget = parseBudget(argv);
  const all = loadCorpus();
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

  const author = makeAuthor(provider, model, ledger);
  // The breaker is checked BEFORE each brief: once cumulative usage reaches the limit,
  // every remaining brief is skipped (and excluded from the rates). No budget → no gate.
  const { results, summary } = await evaluate(entries, (e: CorpusEntry) => author(e.prompt), {
    beforeEach: budget ? () => ledger.over() : undefined,
  });

  // Live header records the pinned sampling settings (and OpenAI's backend fingerprint,
  // once seen) so a run is reproducible-by-record; judge version is stamped by renderResults.
  const pinned = provider === "anthropic" ? "temp 0" : `seed ${OPENAI_SEED}`;
  const fp = ledger.systemFingerprint ? ` · fp ${ledger.systemFingerprint}` : "";
  let md = renderResults(results, summary, `live (${provider} · ${model} · ${pinned}${fp})`);
  const baseline = readBaseline();
  if (baseline) md += renderDelta(baseline, summary);
  md = LIVE_HEADER + md;
  writeFileSync(resolve(ROOT, LIVE_RESULTS), md);
  process.stdout.write(md + "\n");
  process.stdout.write(`✓ wrote ${LIVE_RESULTS} (git-ignored)\n`);
  if (budget) process.stderr.write(`budget: ${ledger.spentLabel()} (limit ${budget.amount}${budget.kind})\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main();
