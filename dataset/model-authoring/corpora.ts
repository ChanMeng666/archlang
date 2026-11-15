/**
 * The corpora the model-authoring briefs must stay disjoint from, each as a `HoldoutIndex` so the
 * existing `dataset/dedup.ts` checks (`textReject`, `structReject`) apply unchanged:
 *
 *   - the eval corpus (`eval/corpus.json` + goldens) — `loadHoldout()` from `dedup.ts`;
 *   - the fidelity corpus (`eval/corpus-fidelity.json` + its committed reference plans), built the
 *     way `test/dataset.test.ts` builds it (`loadHoldout` is deliberately not widened: it decides
 *     what the seed-20260712 generator rejects, and those bytes are pinned);
 *   - the published splits (`repair` + `authoring` at the pinned seed), regenerated in memory with
 *     `generateAll` — the generator is byte-deterministic, so this IS the published corpus.
 *
 * Both eval corpora are a public regression fixture, never called held-out; they are read only to
 * reject look-alikes. Nothing here imports `eval/`; it reads data files, as `dedup.ts` does.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type HoldoutIndex, NGRAM_WIDTH, fingerprint, loadHoldout, normalizeText } from "../dedup.js";
import { DEFAULT_AUTHORING_ROWS, DEFAULT_REPAIR_ROWS, DEFAULT_SEED, generateAll } from "../generate.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const tokensOf = (s: string): string[] => normalizeText(s).split(" ").filter(Boolean);

/** The NGRAM_WIDTH-word n-grams of a text, as `dedup.ts` computes them. */
function gramsOf(s: string): Set<string> {
  const toks = tokensOf(s);
  const out = new Set<string>();
  for (let i = 0; i + NGRAM_WIDTH <= toks.length; i++) out.add(toks.slice(i, i + NGRAM_WIDTH).join(" "));
  return out;
}

/** A prompt entry of a {@link HoldoutIndex}. */
function promptEntry(id: string, text: string): HoldoutIndex["prompts"][number] {
  return { id, tokenSet: new Set(tokensOf(text)), grams: gramsOf(text) };
}

/** A fingerprint entry of a {@link HoldoutIndex}; `baseDir` resolves the plan's imports. */
function fingerprintEntry(
  id: string,
  source: string,
  baseDir: string = REPO_ROOT,
): HoldoutIndex["fingerprints"][number] {
  const fp = fingerprint(source, baseDir);
  return { id, fp, exact: JSON.stringify(fp) };
}

/** The eval corpus (`eval/corpus.json`): the existing `dedup.ts` index, unchanged. */
export function evalIndex(): HoldoutIndex {
  return loadHoldout();
}

interface FidelityEntry {
  id: string;
  prompt: string;
  references: { correct: string; laundered: string };
}

/** The fidelity corpus: its briefs and every `.arch` reference plan it commits. */
export function fidelityIndex(): HoldoutIndex {
  const corpus: FidelityEntry[] = JSON.parse(readFileSync(resolve(REPO_ROOT, "eval/corpus-fidelity.json"), "utf8"));
  const plans = corpus.flatMap((e) =>
    [e.references.correct, e.references.laundered]
      .filter((p) => p.endsWith(".arch"))
      .map((p) => ({ id: `${e.id}:${p.split("/").pop()}`, path: resolve(REPO_ROOT, p) })),
  );
  return {
    prompts: corpus.map((e) => promptEntry(e.id, e.prompt)),
    fingerprints: plans.map((p) => fingerprintEntry(p.id, readFileSync(p.path, "utf8"), dirname(p.path))),
  };
}

/** The published-split generation parameters (the generator's own defaults). */
export const PUBLISHED = {
  seed: DEFAULT_SEED,
  repairRows: DEFAULT_REPAIR_ROWS,
  authoringRows: DEFAULT_AUTHORING_ROWS,
} as const;

/**
 * An index over published rows: every distinct authoring brief as a prompt, and every distinct
 * plan (authoring `source`, repair `broken_source` and `fixed_source`) as a fingerprint.
 * Exported for tests, which pass a smaller corpus.
 */
export function indexOfRows(repairJsonl: string, authoringJsonl: string): HoldoutIndex {
  const parse = (jsonl: string): Record<string, unknown>[] =>
    jsonl
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  const prompts = new Map<string, HoldoutIndex["prompts"][number]>();
  const fps = new Map<string, HoldoutIndex["fingerprints"][number]>();
  const addPlan = (id: string, source: string): void => {
    const e = fingerprintEntry(id, source);
    if (!fps.has(e.exact)) fps.set(e.exact, e);
  };
  for (const r of parse(authoringJsonl)) {
    const brief = r.brief as string;
    if (!prompts.has(brief)) prompts.set(brief, promptEntry(r.id as string, brief));
    addPlan(r.id as string, r.source as string);
  }
  for (const r of parse(repairJsonl)) {
    addPlan(`${r.id as string}:broken`, r.broken_source as string);
    addPlan(`${r.id as string}:fixed`, r.fixed_source as string);
  }
  return { prompts: [...prompts.values()], fingerprints: [...fps.values()] };
}

/** The published splits, regenerated at the pinned seed and sizes (about a minute and a half). */
export function publishedIndex(): HoldoutIndex {
  const { repairJsonl, authoringJsonl } = generateAll(PUBLISHED);
  return indexOfRows(repairJsonl, authoringJsonl);
}

/** The three corpora a model-authoring brief is checked against, by name. */
export interface Corpora {
  eval: HoldoutIndex;
  fidelity: HoldoutIndex;
  published: HoldoutIndex;
}

/** Load all three (the published one is the slow part). */
export function loadCorpora(): Corpora {
  return { eval: evalIndex(), fidelity: fidelityIndex(), published: publishedIndex() };
}

/** Normalized golden / reference-plan texts of both eval corpora, for the containment check
 *  `test/dataset.test.ts` applies to row sources (a model can echo a golden it has seen). */
export function evalGoldenTexts(): { id: string; norm: string }[] {
  const corpus: { id: string; golden: string }[] = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "eval/corpus.json"), "utf8"),
  );
  const fidelity: FidelityEntry[] = JSON.parse(readFileSync(resolve(REPO_ROOT, "eval/corpus-fidelity.json"), "utf8"));
  const out = corpus.map((e) => ({
    id: e.id,
    norm: normalizeText(readFileSync(resolve(REPO_ROOT, e.golden), "utf8")),
  }));
  for (const e of fidelity) {
    for (const p of [e.references.correct, e.references.laundered]) {
      if (p.endsWith(".arch"))
        out.push({ id: `fidelity:${e.id}:${p}`, norm: normalizeText(readFileSync(resolve(REPO_ROOT, p), "utf8")) });
    }
  }
  return out;
}
