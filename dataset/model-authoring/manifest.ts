/**
 * The brief manifest: the deterministic list of briefs the model-authoring batches send.
 *
 * Seeded (default {@link DEFAULT_BRIEF_SEED}, a seed space of its own: the published splits use
 * 20260712), and every brief passes the same gates as the published authoring split: its
 * reference plan is strict-clean and satisfies the brief's intent, and the brief is
 * deduplicated, with the existing `dataset/dedup.ts` checks, against
 *   - the eval corpus and the fidelity corpus (text: Jaccard / shared 8-gram; structure: the
 *     reference plan's `describe()` fingerprint),
 *   - the published `repair` and `authoring` splits (the same two checks),
 *   - itself (exact brief repeat; `IntraDedup` on the reference plan).
 * A rejected candidate is counted, never silently dropped.
 */

import { type Intent, validateIntent } from "../../src/index.js";
import { IntraDedup, structReject, textReject } from "../dedup.js";
import { mulberry32, splitmix32 } from "../rng.js";
import { emit, isStrictClean } from "../templates.js";
import { type BriefParams, spineBrief } from "./briefs.js";
import type { Corpora } from "./corpora.js";

export const DEFAULT_BRIEF_SEED = 20261115;

/** One manifest line. `brief_id` is also the batch request's `custom_id`. */
export interface ManifestEntry {
  brief_id: string;
  seed: number;
  brief: string;
  brief_params: BriefParams;
  intent: Intent;
}

export interface BriefSet {
  seed: number;
  requested: number;
  attempts: number;
  entries: ManifestEntry[];
  rejections: Record<string, number>;
}

/** Build `count` briefs from `seed`, rejecting look-alikes of every corpus in `corpora`. */
export function buildBriefSet(seed: number, count: number, corpora: Corpora): BriefSet {
  const entries: ManifestEntry[] = [];
  const rejections = new Map<string, number>();
  const bump = (k: string): void => {
    rejections.set(k, (rejections.get(k) ?? 0) + 1);
  };
  const intra = new IntraDedup();
  const briefs = new Set<string>();
  const maxAttempts = count * 40 + 100;
  let k = 0;
  for (; entries.length < count && k < maxAttempts; k++) {
    const rowSeed = splitmix32(seed, k);
    const b = spineBrief(mulberry32(rowSeed));
    if (!b) {
      bump("draw-miss");
      continue;
    }
    const source = emit(b.plan);
    if (!isStrictClean(source)) {
      bump("reference-not-strict-clean");
      continue;
    }
    if (!validateIntent(source, b.intent).ok) {
      bump("reference-intent-not-ok");
      continue;
    }
    let rejected = false;
    for (const name of ["eval", "fidelity", "published"] as const) {
      if (textReject(b.brief, corpora[name]).reject) {
        bump(`dedup-text-${name}`);
        rejected = true;
        break;
      }
      if (structReject(source, corpora[name]).reject) {
        bump(`dedup-structure-${name}`);
        rejected = true;
        break;
      }
    }
    if (rejected) continue;
    if (briefs.has(b.brief)) {
      bump("dedup-intra-brief");
      continue;
    }
    if (intra.check(source).reject) {
      bump("dedup-intra");
      continue;
    }
    const id = `ma-spine-${rowSeed}`;
    if (entries.some((e) => e.brief_id === id)) {
      bump("duplicate-id");
      continue;
    }
    briefs.add(b.brief);
    entries.push({ brief_id: id, seed: rowSeed, brief: b.brief, brief_params: b.params, intent: b.intent });
  }
  return {
    seed,
    requested: count,
    attempts: k,
    entries,
    rejections: Object.fromEntries([...rejections.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

/** The manifest as JSONL (one entry per line, trailing newline). */
export function manifestJsonl(entries: ManifestEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}

/** Parse a manifest written by {@link manifestJsonl}. */
export function parseManifest(jsonl: string): ManifestEntry[] {
  return jsonl
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ManifestEntry);
}
