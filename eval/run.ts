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

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

export interface Expect {
  rooms?: number;
  labelsInclude?: string[];
  floorAreaM2?: [number, number];
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
    for (const e of c.errors) failures.push(`compile: ${e.message}`);
    return { id: entry.id, valid: false, lintWarnings: 0, physicalWarnings: 0, semanticPass: false, failures };
  }

  const lintDiags = lint(source);
  const lintWarnings = lintDiags.length;
  const physicalWarnings = lintDiags.filter((d) => d.code && PHYSICAL_CODES.has(d.code)).length;
  // A physically impossible plan never "authors correctly", whatever its room count.
  for (const d of lintDiags) {
    if (d.code && PHYSICAL_CODES.has(d.code)) failures.push(`physical: ${d.code} — ${d.message}`);
  }
  const s = describePlan(source);
  const e = entry.expect;

  if (e.rooms !== undefined && s.totals.rooms !== e.rooms) {
    failures.push(`rooms: expected ${e.rooms}, got ${s.totals.rooms}`);
  }
  if (e.labelsInclude) {
    const labels = s.rooms.map((r) => r.label ?? "");
    for (const want of e.labelsInclude) {
      if (!labels.some((l) => l.toLowerCase().includes(want.toLowerCase()))) {
        failures.push(`label: missing a room labelled like "${want}"`);
      }
    }
  }
  if (e.floorAreaM2) {
    const [lo, hi] = e.floorAreaM2;
    if (s.totals.floor_area_m2 < lo || s.totals.floor_area_m2 > hi) {
      failures.push(`area: ${s.totals.floor_area_m2} m² outside [${lo}, ${hi}]`);
    }
  }

  return { id: entry.id, valid, lintWarnings, physicalWarnings, semanticPass: failures.length === 0, failures };
}

/** Score every entry; `getSource` decides where the `.arch` comes from (golden or model). */
export async function evaluate(
  entries: CorpusEntry[],
  getSource: (e: CorpusEntry) => string | Promise<string>,
): Promise<{ results: Score[]; summary: { total: number; valid: number; semanticPass: number; sound: number } }> {
  const results: Score[] = [];
  for (const entry of entries) {
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
      continue;
    }
    results.push(scoreSource(entry, source));
  }
  const summary = {
    total: results.length,
    valid: results.filter((r) => r.valid).length,
    semanticPass: results.filter((r) => r.semanticPass).length,
    sound: results.filter((r) => r.valid && r.lintWarnings === 0).length,
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
async function authorWithAnthropic(prompt: string, system: string, model: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (required for --live with the anthropic provider)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  return extractArch(json.content.map((b) => b.text ?? "").join(""));
}

/** Author a plan via the OpenAI Chat Completions API (dependency-free `fetch`). */
async function authorWithOpenAI(prompt: string, system: string, model: string): Promise<string> {
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
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return extractArch(json.choices?.[0]?.message?.content ?? "");
}

/** Ask the resolved provider's model to author a plan from the prompt. */
function makeAuthor(provider: "anthropic" | "openai", model: string): (prompt: string) => Promise<string> {
  const system = systemPrompt();
  const author = provider === "openai" ? authorWithOpenAI : authorWithAnthropic;
  return (prompt: string) => author(prompt, system, model);
}

/** Render the scorecard as Markdown. */
function renderResults(
  results: Score[],
  summary: { total: number; valid: number; semanticPass: number; sound: number },
  mode: string,
): string {
  const pct = (n: number): string => `${Math.round((n / summary.total) * 100)}%`;
  const rows = results.map((r) => {
    const status = r.semanticPass ? (r.lintWarnings === 0 ? "✅ pass" : "⚠️ warns") : "❌ fail";
    const notes = r.failures.length
      ? r.failures.join("; ")
      : r.lintWarnings
        ? `${r.lintWarnings} lint warning(s)`
        : "—";
    return `| \`${r.id}\` | ${status} | ${r.valid ? "yes" : "no"} | ${r.lintWarnings} | ${notes} |`;
  });
  return [
    "# ArchLang authorability scorecard",
    "",
    `Mode: **${mode}** · ${summary.total} prompts.`,
    "",
    `- **Valid (compiles):** ${summary.valid}/${summary.total} (${pct(summary.valid)})`,
    `- **Intent match (semantic):** ${summary.semanticPass}/${summary.total} (${pct(summary.semanticPass)})`,
    `- **Sound (lint-clean):** ${summary.sound}/${summary.total} (${pct(summary.sound)})`,
    "",
    "| Prompt | Result | Valid | Lint | Notes |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

type Summary = { total: number; valid: number; semanticPass: number; sound: number };

/** A recorded live baseline (`eval/live-baseline.json`) to compare a fresh run against. */
interface Baseline extends Summary {
  provider?: string;
  model?: string;
  date?: string;
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
        "",
        "Re-run with --yes (or set ARCHLANG_EVAL_CONFIRM=1) to authorise the calls.",
        "",
      ].join("\n"),
    );
    process.exit(3);
  }

  const author = makeAuthor(provider, model);
  const { results, summary } = await evaluate(entries, (e: CorpusEntry) => author(e.prompt));
  let md = renderResults(results, summary, `live (${provider} · ${model})`);
  const baseline = readBaseline();
  if (baseline) md += renderDelta(baseline, summary);
  md = LIVE_HEADER + md;
  writeFileSync(resolve(ROOT, LIVE_RESULTS), md);
  process.stdout.write(md + "\n");
  process.stdout.write(`✓ wrote ${LIVE_RESULTS} (git-ignored)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main();
