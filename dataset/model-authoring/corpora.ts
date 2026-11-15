/**
 * The corpora the model-authoring briefs must stay disjoint from, each as a `HoldoutIndex` so the
 * existing `dataset/dedup.ts` checks (`textReject`, `structReject`) apply unchanged:
 *
 *   - the eval corpus (`eval/corpus.json` + goldens) — `loadHoldout()` from `dedup.ts`;
 *   - the fidelity corpus (`eval/corpus-fidelity.json` + its committed reference plans), built the
 *     way `test/dataset.test.ts` builds it (`loadHoldout` is deliberately not widened: it decides
 *     what the seed-20260712 generator rejects, and those bytes are pinned);
 *   - the published splits: the `repair.jsonl` and `authoring.jsonl` files actually UPLOADED to
 *     Hugging Face, downloaded into the git-ignored `dataset/out/published/` and pinned by the
 *     SHA-256 values in `published.json`. They were generated with ArchLang 1.15.0, so a
 *     regeneration today (1.62.0+) is not byte-equal to them; only the downloaded files are the
 *     published corpus. CI cannot download, so its test indexes a regeneration subset instead
 *     ({@link indexOfRows}; see `test/dataset.test.ts` § e).
 *
 * Both eval corpora are a public regression fixture, never called held-out; they are read only to
 * reject look-alikes. Nothing here imports `eval/`; it reads data files, as `dedup.ts` does.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type HoldoutIndex, NGRAM_WIDTH, fingerprint, loadHoldout, normalizeText } from "../dedup.js";
import { DEFAULT_AUTHORING_ROWS, DEFAULT_REPAIR_ROWS, DEFAULT_SEED } from "../generate.js";

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

/** Every `.arch` reference plan the fidelity corpus commits (a refusal is JSON, not a plan). */
export function fidelityPlans(): { id: string; path: string }[] {
  const corpus: FidelityEntry[] = JSON.parse(readFileSync(resolve(REPO_ROOT, "eval/corpus-fidelity.json"), "utf8"));
  return corpus.flatMap((e) =>
    [e.references.correct, e.references.laundered]
      .filter((p) => p.endsWith(".arch"))
      .map((p) => ({ id: `${e.id}:${p.split("/").pop()}`, path: resolve(REPO_ROOT, p) })),
  );
}

/** The fidelity corpus: its briefs and every `.arch` reference plan it commits. */
export function fidelityIndex(): HoldoutIndex {
  const corpus: FidelityEntry[] = JSON.parse(readFileSync(resolve(REPO_ROOT, "eval/corpus-fidelity.json"), "utf8"));
  return {
    prompts: corpus.map((e) => promptEntry(e.id, e.prompt)),
    fingerprints: fidelityPlans().map((p) => fingerprintEntry(p.id, readFileSync(p.path, "utf8"), dirname(p.path))),
  };
}

/** The default config's generation parameters (the generator's own defaults), which the CI
 *  regeneration subset uses. */
export const PUBLISHED = {
  seed: DEFAULT_SEED,
  repairRows: DEFAULT_REPAIR_ROWS,
  authoringRows: DEFAULT_AUTHORING_ROWS,
} as const;

/**
 * An index over published rows: every distinct authoring brief as a prompt, and every distinct
 * plan (authoring `source`, repair `broken_source` and `fixed_source`) as a fingerprint.
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

/** The pin of the uploaded files (`published.json`, committed). */
export interface PublishedManifest {
  repo: string;
  repo_type: string;
  revision: string;
  archlang_version: string;
  dir: string;
  files: Record<"repair.jsonl" | "authoring.jsonl", { bytes: number; sha256: string }>;
}

export function publishedManifest(): PublishedManifest {
  return JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "published.json"), "utf8"),
  ) as PublishedManifest;
}

/** The command that downloads the pinned files (printed when they are missing or differ). */
export function downloadCommand(m: PublishedManifest = publishedManifest()): string {
  return `hf download ${m.repo} repair.jsonl authoring.jsonl --repo-type ${m.repo_type} --revision ${m.revision} --local-dir ${m.dir}`;
}

/**
 * The published splits, read from the downloaded files in `dir` (default: the manifest's
 * `dataset/out/published`) after checking each file's SHA-256 against `published.json`. Throws
 * when a file is missing or differs, naming the download command: the brief set is never built
 * against anything but the uploaded bytes.
 */
export function publishedIndex(dir?: string): HoldoutIndex {
  const m = publishedManifest();
  const base = resolve(REPO_ROOT, dir ?? m.dir);
  const read = (name: "repair.jsonl" | "authoring.jsonl"): string => {
    const path = resolve(base, name);
    if (!existsSync(path)) throw new Error(`missing ${path}; download the published files: ${downloadCommand(m)}`);
    const bytes = readFileSync(path);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (sha !== m.files[name].sha256)
      throw new Error(
        `${path} has SHA-256 ${sha}, not the pinned ${m.files[name].sha256}; re-download: ${downloadCommand(m)}`,
      );
    return bytes.toString("utf8");
  };
  return indexOfRows(read("repair.jsonl"), read("authoring.jsonl"));
}

/** The three corpora a model-authoring brief is checked against, by name. */
export interface Corpora {
  eval: HoldoutIndex;
  fidelity: HoldoutIndex;
  published: HoldoutIndex;
}

/** Load all three (the published one from the downloaded, hash-checked files). */
export function loadCorpora(): Corpora {
  return { eval: evalIndex(), fidelity: fidelityIndex(), published: publishedIndex() };
}

/** Normalized golden / reference-plan texts of both eval corpora, for the containment check
 *  on model replies (a model can echo a golden it has seen). */
export function evalGoldenTexts(): { id: string; norm: string }[] {
  const corpus: { id: string; golden: string }[] = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "eval/corpus.json"), "utf8"),
  );
  const out = corpus.map((e) => ({
    id: e.id,
    norm: normalizeText(readFileSync(resolve(REPO_ROOT, e.golden), "utf8")),
  }));
  for (const p of fidelityPlans())
    out.push({ id: `fidelity:${p.id}`, norm: normalizeText(readFileSync(p.path, "utf8")) });
  return out;
}
