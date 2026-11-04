/**
 * Dual deduplication against the eval corpus (the 26 briefs + goldens in
 * `eval/`) — the enforcement arm of the contamination iron law. Used BOTH as a
 * generation-time filter (rejections counted into the report, never silent) and by the
 * permanent CI guard `test/dataset.test.ts`.
 *
 * Two independent checks:
 *   1. TEXT (brief vs each holdout prompt): normalize → token-set Jaccard similarity +
 *      8-word n-gram containment. Reject on Jaccard ≥ {@link JACCARD_THRESHOLD} or ANY
 *      shared 8-gram. Conservative on purpose — a false reject only costs a candidate.
 *   2. STRUCTURE (plan vs each holdout golden): a `describe()` fingerprint — the sorted
 *      multiset of (normalized room label, area rounded to 0.5 m²), the interior-door
 *      adjacency edge set, and the room count. Reject an exact fingerprint match, or a
 *      "near" match (identical label multiset AND every paired area within ±5%).
 *
 * Reading the holdout for COMPARISON is allowed and intended; copying any holdout byte
 * into dataset output is the one unforgivable failure — this module only ever reads it to
 * reject look-alikes. It imports the pure core (`describe`) and reads data files; it does
 * NOT import anything from `eval/`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type World, describe } from "../src/index.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A read-only World over the filesystem (no `now` — dataset code takes no clock), so a
 *  golden that `import`s a fixture library still resolves for fingerprinting. */
function fsWorld(baseDir: string): World {
  return {
    read(path: string): string | null {
      try {
        return readFileSync(resolve(baseDir, path), "utf8");
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Text normalization + similarity.
// ---------------------------------------------------------------------------

/** Lowercase, punctuation → spaces, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (s: string): string[] => normalizeText(s).split(" ").filter(Boolean);

/** Set of 8-word n-grams (as space-joined strings) over a token list. */
function ngrams(toks: string[], n = 8): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= toks.length; i++) out.add(toks.slice(i, i + n).join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Reject a brief whose token-set Jaccard with any holdout prompt is ≥ this. */
export const JACCARD_THRESHOLD = 0.5;
/** The n-gram width whose sharing (any single window) rejects a brief. */
export const NGRAM_WIDTH = 8;

// ---------------------------------------------------------------------------
// Structural fingerprint.
// ---------------------------------------------------------------------------

/** A normalized room label: lowercase, digits/punctuation stripped (so "Bedroom 2"
 *  and "Bedroom" share a label — the conservative direction for near-match). */
const normLabel = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface Fingerprint {
  roomCount: number;
  rooms: { label: string; area: number }[];
  edges: string[];
}

/** Fingerprint a plan via `describe()`. Sizes rounded to 0.5 m²; rooms sorted so the
 *  multiset compares order-independently; edges an undirected sorted set. `baseDir`
 *  lets a golden's relative imports resolve. */
export function fingerprint(source: string, baseDir: string = REPO_ROOT): Fingerprint {
  const s = describe(source, { world: fsWorld(baseDir) });
  const rooms = s.rooms
    .map((r) => ({ label: normLabel(r.label ?? r.id), area: Math.round(r.area_m2 * 2) / 2 }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.area - b.area);
  const edgeSet = new Set<string>();
  for (const [a, ns] of Object.entries(s.input_graph)) {
    for (const b of ns) edgeSet.add([a, b].sort().join("|"));
  }
  return { roomCount: s.rooms.length, rooms, edges: [...edgeSet].sort() };
}

const exactKey = (f: Fingerprint): string => JSON.stringify(f);

/** Same label multiset AND every paired area within ±5% (a near-structural clone). */
function nearMatch(a: Fingerprint, b: Fingerprint): boolean {
  if (a.rooms.length !== b.rooms.length) return false;
  const la = a.rooms.map((r) => r.label).sort();
  const lb = b.rooms.map((r) => r.label).sort();
  if (la.join("\u0000") !== lb.join("\u0000")) return false;
  // Compare areas position-wise over the (label,area)-sorted lists.
  for (let i = 0; i < a.rooms.length; i++) {
    const x = a.rooms[i]!.area;
    const y = b.rooms[i]!.area;
    const tol = 0.05 * Math.max(x, y, 1);
    if (Math.abs(x - y) > tol) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The holdout index (built once from eval/corpus.json + its goldens).
// ---------------------------------------------------------------------------

interface CorpusEntry {
  id: string;
  prompt: string;
  golden: string;
}

export interface HoldoutIndex {
  prompts: { id: string; tokenSet: Set<string>; grams: Set<string> }[];
  fingerprints: { id: string; fp: Fingerprint; exact: string }[];
}

/** Build the holdout index: normalized prompt token/n-gram sets + golden fingerprints. */
export function loadHoldout(): HoldoutIndex {
  const corpus: CorpusEntry[] = JSON.parse(readFileSync(resolve(REPO_ROOT, "eval/corpus.json"), "utf8"));
  const prompts = corpus.map((e) => {
    const toks = tokens(e.prompt);
    return { id: e.id, tokenSet: new Set(toks), grams: ngrams(toks, NGRAM_WIDTH) };
  });
  const fingerprints = corpus.map((e) => {
    const goldenPath = resolve(REPO_ROOT, e.golden);
    const src = readFileSync(goldenPath, "utf8");
    const fp = fingerprint(src, dirname(goldenPath));
    return { id: e.id, fp, exact: exactKey(fp) };
  });
  return { prompts, fingerprints };
}

// ---------------------------------------------------------------------------
// The reject checks (shared by generator and test).
// ---------------------------------------------------------------------------

export interface RejectResult {
  reject: boolean;
  reason?: string;
}

/** Reject a brief that is too similar to any holdout prompt (Jaccard or shared 8-gram). */
export function textReject(brief: string, holdout: HoldoutIndex): RejectResult {
  const toks = tokens(brief);
  const set = new Set(toks);
  const grams = ngrams(toks, NGRAM_WIDTH);
  for (const p of holdout.prompts) {
    const j = jaccard(set, p.tokenSet);
    if (j >= JACCARD_THRESHOLD)
      return { reject: true, reason: `text: Jaccard ${j.toFixed(2)} ≥ ${JACCARD_THRESHOLD} vs holdout "${p.id}"` };
    for (const g of grams) {
      if (p.grams.has(g)) return { reject: true, reason: `text: shares an ${NGRAM_WIDTH}-gram with holdout "${p.id}"` };
    }
  }
  return { reject: false };
}

/** Reject a plan whose structural fingerprint matches (exactly or nearly) any holdout
 *  golden. `baseDir` is where the source's own imports (if any) resolve from. */
export function structReject(source: string, holdout: HoldoutIndex, baseDir: string = REPO_ROOT): RejectResult {
  const fp = fingerprint(source, baseDir);
  const exact = exactKey(fp);
  for (const h of holdout.fingerprints) {
    if (h.exact === exact) return { reject: true, reason: `structure: exact fingerprint match vs holdout "${h.id}"` };
    if (nearMatch(fp, h.fp)) return { reject: true, reason: `structure: near fingerprint match vs holdout "${h.id}"` };
  }
  return { reject: false };
}

/** An intra-dataset dedup tracker: rejects an exact source repeat or an exact fingerprint
 *  repeat within the generated corpus. */
export class IntraDedup {
  private readonly sources = new Set<string>();
  private readonly fps = new Set<string>();

  /** Register `source`; returns a rejection if it duplicates an earlier row. */
  check(source: string): RejectResult {
    if (this.sources.has(source)) return { reject: true, reason: "intra: exact source repeat" };
    const key = exactKey(fingerprint(source));
    if (this.fps.has(key)) return { reject: true, reason: "intra: exact fingerprint repeat" };
    this.sources.add(source);
    this.fps.add(key);
    return { reject: false };
  }
}
