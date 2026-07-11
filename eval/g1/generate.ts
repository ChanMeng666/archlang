/**
 * Gate G1 — intent generation harness (roadmap `docs/research/2026-07-roadmap-proposal.md`).
 *
 * Asks a strong model to translate each NL brief into machine-checkable *intent JSON*
 * (the {@link Expect} shape from `run.ts`, lowerable to the six judge-v2 predicates by
 * `compileExpect`). This is only the GENERATION side of G1; the double-blind per-assertion
 * faithfulness grading happens downstream against the file this writes.
 *
 * ORACLE ISOLATION (load-bearing). The prompt a model sees NEVER contains: any corpus
 * `expect` block, any of the eval's private concept-vocabulary table, or any golden `.arch`
 * source. The model works from the brief text plus a description of the intent-JSON shape
 * and discipline — nothing that would let it copy the scorer's own answer key. If any of
 * that leaked into the prompt, G1 would be measuring the eval against itself. (A test
 * statically forbids this module from even naming the private-vocabulary module.)
 *
 * Networked and paid, so it is guarded exactly like `run.ts`'s live path: it prints the
 * plan and exits `3` unless `--yes` (or `ARCHLANG_EVAL_CONFIRM=1`) is given. Dependency-free
 * `fetch`; only `loadCorpus`/`CorpusEntry`/`Expect` (from run.ts) and `compileExpect`/
 * `Predicate` (from assertions.ts) are imported — no network code is shared with run.ts.
 *
 * Run: `npm run eval:g1 -- --yes [--max N]` (or via the "Eval (G1 intent generation)"
 * workflow). Writes `eval/g1/intents.json`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Predicate, compileExpect } from "../assertions.js";
import { type CorpusEntry, type Expect, loadCorpus } from "../run.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

/** Default generation model; overridable via `ARCHLANG_EVAL_MODEL`. */
const DEFAULT_MODEL = "gpt-5.5-2026-04-23";

/** Reproducibility seed for the OpenAI request (matches the live harness's pin). */
const OPENAI_SEED = 20260711;

/** The output ledger written to `eval/g1/intents.json`. */
const OUTPUT = "eval/g1/intents.json";

/** One brief's generated intent: the parsed {@link Expect}, its lowered predicates, and
 *  the raw model reply. `expect`/`predicates` are `null` (with an `error` string) when the
 *  reply could not be parsed or lowered — the raw text is always kept for review. */
interface IntentEntry {
  id: string;
  expect: Expect | null;
  predicates: Predicate[] | null;
  error?: string;
  raw: string;
  usage: { input: number; output: number };
}

/**
 * The one system prompt every brief gets. It teaches ONLY the intent-JSON shape and the
 * assertion discipline — never the eval's private concept vocabulary, never a golden,
 * never a corpus `expect` block (oracle isolation). The worked example uses a fabricated
 * brief that is not in the corpus.
 */
export function buildSystemPrompt(): string {
  return `You translate a single natural-language floor-plan brief into machine-checkable intent JSON. The JSON is a FAITHFUL transcription of what the brief asks for — it is not a design and not an elaboration. Assert only what the brief's own words license; when the brief is silent on something, leave it out.

## Output

Reply with exactly ONE JSON object and nothing else (a \`\`\`json fenced block is allowed, but no prose before or after it). The object has this shape — every field is optional except where a rule requires it:

- \`rooms\` (number): the total count of distinct rooms the brief's wording enumerates, INCLUDING any circulation space it names (a hall, a corridor, …).
- \`roomsInclude\` (array): one item per named room concept:
  - \`concept\` (string): the brief's own word for the room, written as a short kebab-case noun (e.g. "living-room", "wet-room", "consulting-room").
  - \`count\` ({ "min"?: number, "max"?: number }) OPTIONAL: use for several rooms of one concept (e.g. "two bedrooms" → concept "bedroom", count.min 2).
  - \`areaM2\` ({ "min"?: number, "max"?: number, "source": string }) OPTIONAL: a per-room floor-area band in square metres — only when the brief gives THAT room a number.
- \`totalAreaM2\` ({ "min": number, "max": number, "source": string }) OPTIONAL: a whole-plan floor-area band in square metres — only when the brief states a TOTAL area for the whole plan.
- \`adjacency\` ({ "requiredEdges": object, "source": string }) OPTIONAL: \`requiredEdges\` maps a concept to the list of concepts it must share an interior door or opening with. Both the keys and the listed values are concept names.
- \`reachable\` (boolean) OPTIONAL: set true only when the brief requires the whole plan to be reachable, or reachable from the entrance.

## Discipline

1. Assert only what the brief's words permit. Every quantitative band (an \`areaM2\` or a \`totalAreaM2\`) MUST carry a \`source\` field quoting the phrase that licensed it, in the form \`brief: '<the exact phrase>' <the band rule>\`.
2. Area bands come from NUMBERS only:
   - "about / around / approximately / ~N m²" → N ±10%.
   - "at least N m²" → give only \`min\` (= N), no \`max\`.
   - a bare "N m²" → N ±10%.
   Qualitative size words (compact, generous, large, small) produce NO area band at all.
3. \`rooms\` counts every distinct room the wording enumerates, circulation included.
4. \`concept\` is the brief's own wording turned into a short kebab-case noun. For several rooms of one concept use \`count.min\` rather than repeating the concept.
5. \`adjacency.requiredEdges\` is asserted ONLY where the brief states a connection ("off the hall", "opening off X", "reached through …"). Keys and values are concept names.
6. \`reachable: true\` is asserted ONLY where the brief asks for whole-plan reachability or reachability from an entrance.

## Worked example

Brief: A small bakery: a shop floor of about 30 m², a kitchen of at least 12 m², and a storeroom, with the kitchen opening off the shop floor.

\`\`\`json
{
  "rooms": 3,
  "roomsInclude": [
    { "concept": "shop-floor", "areaM2": { "min": 27, "max": 33, "source": "brief: 'a shop floor of about 30 m²' ±10%" } },
    { "concept": "kitchen", "areaM2": { "min": 12, "source": "brief: 'a kitchen of at least 12 m²'" } },
    { "concept": "storeroom" }
  ],
  "adjacency": {
    "requiredEdges": { "kitchen": ["shop-floor"] },
    "source": "brief: 'the kitchen opening off the shop floor'"
  }
}
\`\`\`

Note: the 30 m² is the shop floor's OWN area, so it is a per-room \`areaM2\` on that concept — NOT a \`totalAreaM2\` (the brief never states a whole-plan total). "at least 12 m²" gives a \`min\` with no \`max\`. The single stated connection becomes one adjacency edge.`;
}

/** The user message for a brief: the brief text, verbatim. (Kept a function so a test can
 *  assert it is byte-identical to `entry.prompt` — no framing is smuggled in around it.) */
export function buildUserPrompt(entry: CorpusEntry): string {
  return entry.prompt;
}

/** Pull the JSON object out of a model reply: strip an optional \`\`\`json / \`\`\` fence,
 *  else return the trimmed text as-is. */
export function extractJson(text: string): string {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

/** One OpenAI chat-completions call. Dependency-free `fetch`; pinned `seed` and a completion
 *  cap sized so a reasoning model's thinking tokens do not truncate the JSON (the standing
 *  harness lesson). No `temperature` — the gpt-5.x reasoning endpoints reject a non-default. */
async function callOpenAI(
  system: string,
  user: string,
  model: string,
): Promise<{ text: string; input: number; output: number; systemFingerprint?: string }> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_completion_tokens: 16384,
      seed: OPENAI_SEED,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    system_fingerprint?: string | null;
  };
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    input: json.usage?.prompt_tokens ?? 0,
    output: json.usage?.completion_tokens ?? 0,
    systemFingerprint: json.system_fingerprint ?? undefined,
  };
}

/** `--max <n>`: cap the brief count. Exits `3` on a missing/invalid value (mirrors run.ts). */
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const model = process.env.ARCHLANG_EVAL_MODEL || DEFAULT_MODEL;
  const max = parseMax(argv);
  const all = loadCorpus();
  const entries = max !== undefined ? all.slice(0, max) : all;
  const confirmed = argv.includes("--yes") || process.env.ARCHLANG_EVAL_CONFIRM === "1";

  if (!confirmed) {
    process.stderr.write(
      [
        "G1 intent generation calls a paid API, once per brief. Nothing was sent.",
        "",
        `  provider : openai`,
        `  model    : ${model}`,
        `  briefs   : ${entries.length}${max !== undefined ? ` (capped by --max ${max})` : " (all)"}`,
        `  calls    : ${entries.length}`,
        "",
        "Re-run with --yes (or set ARCHLANG_EVAL_CONFIRM=1) to authorise the calls.",
        "",
      ].join("\n"),
    );
    process.exit(3);
  }

  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (required to generate intents)");

  const system = buildSystemPrompt();
  const out: IntentEntry[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  let systemFingerprint: string | undefined;

  for (const entry of entries) {
    const user = buildUserPrompt(entry);
    let raw = "";
    let usage = { input: 0, output: 0 };
    try {
      const res = await callOpenAI(system, user, model);
      calls++;
      inputTokens += res.input;
      outputTokens += res.output;
      usage = { input: res.input, output: res.output };
      if (!systemFingerprint && res.systemFingerprint) systemFingerprint = res.systemFingerprint;
      raw = res.text;
      const expect = JSON.parse(extractJson(res.text)) as Expect;
      const predicates = compileExpect(expect);
      out.push({ id: entry.id, expect, predicates, raw, usage });
      process.stderr.write(`  ✓ ${entry.id}\n`);
    } catch (err) {
      const message = (err as Error).message;
      out.push({ id: entry.id, expect: null, predicates: null, error: message, raw, usage });
      process.stderr.write(`  ✗ ${entry.id}: ${message}\n`);
    }
  }

  const payload = {
    model,
    seed: OPENAI_SEED,
    date: new Date().toISOString().slice(0, 10),
    systemFingerprint: systemFingerprint ?? null,
    totals: { inputTokens, outputTokens, calls },
    entries: out,
  };
  mkdirSync(resolve(ROOT, "eval/g1"), { recursive: true });
  writeFileSync(resolve(ROOT, OUTPUT), `${JSON.stringify(payload, null, 2)}\n`);

  const failed = out.filter((e) => e.error !== undefined).length;
  const ok = out.length - failed;
  process.stderr.write(
    `✓ wrote ${OUTPUT} — ${ok} ok, ${failed} failed; ${inputTokens + outputTokens} tokens over ${calls} call(s)\n`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    process.stderr.write(`✗ ${(err as Error).message}\n`);
    process.exit(1);
  });
}
