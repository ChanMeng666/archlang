/**
 * Deterministic, pure application of {@link FixSuggestion}s to source text.
 *
 * A port of rustfix's piece-table replacer (`replace.rs` + the filter/apply loop
 * in `lib.rs`) to TypeScript. The heart is {@link Data}: the original source is
 * kept immutable and edits are recorded as a list of contiguous `parts`, so
 * every edit's `span` stays in ORIGINAL-source coordinates — the table accounts
 * for the shifts an earlier edit would introduce. Touching bytes an earlier edit
 * already replaced is an error (the caller rolls the offending suggestion back),
 * with one exception: replacing the exact same range with the exact same text is
 * an idempotent no-op success.
 *
 * {@link applyFixes} is the public loop: it filters suggestions by
 * {@link Applicability}, applies each suggestion atomically into a trial table,
 * and commits or skips as a unit. No I/O — offsets are code-unit offsets into the
 * source string (the same coordinates {@link import("./diagnostics.js").Span}
 * uses everywhere else in the core).
 */

import type { Applicability, FixSuggestion, Span } from "./diagnostics.js";

type PartState = "initial" | "replaced" | "inserted";

interface Part {
  /** Start offset of this part in the ORIGINAL source. */
  start: number;
  /** End offset (exclusive) of this part in the ORIGINAL source. */
  end: number;
  state: PartState;
  /** Rendered text: for `initial`, the original slice; otherwise the replacement. */
  text: string;
}

/** Sentinel thrown by {@link Data.replaceRange} when an edit hits already-edited
 *  bytes; {@link applyFixes} translates it into a skip reason. */
const OVERLAP_REASON = "overlaps an earlier fix";

/**
 * A piece table over an immutable source string: replace ranges cheaply while
 * keeping every not-yet-applied edit addressable in original coordinates.
 */
export class Data {
  private readonly original: string;
  private parts: Part[];

  constructor(source: string) {
    this.original = source;
    this.parts = [{ start: 0, end: source.length, state: "initial", text: source }];
  }

  /** Render the current content by concatenating the parts in order. */
  render(): string {
    if (this.original.length === 0) return "";
    let out = "";
    for (const p of this.parts) out += p.text;
    return out;
  }

  /**
   * Replace the original-source range `[start, end)` with `newText`
   * (an insertion when `start === end`). Throws on an invalid range or on
   * touching bytes an earlier edit already changed — except replacing the exact
   * same range with the exact same text, which is an idempotent no-op success.
   */
  replaceRange(start: number, end: number, newText: string): void {
    if (start > end) throw new Error(`invalid range ${start}..${end}: start is past end`);
    if (end > this.original.length)
      throw new Error(`invalid range ${start}..${end}: source is only ${this.original.length} long`);

    const insertOnly = start === end;

    // We always split a single covering `initial` part into up to three pieces
    // (left / replacement / right), so an `initial` part can never overlap
    // another and two `initial` parts never touch. Skip zero-width `inserted`
    // parts when locating the covering part, so an insertion adjacent to a prior
    // insertion lands after it (matches rustfix).
    const idx = this.parts.findIndex((p) => p.state !== "inserted" && p.start <= start && p.end >= end);
    if (idx < 0) throw new Error(OVERLAP_REASON);

    const part = this.parts[idx]!;

    // Replacing the exact same range with the exact same text: allow it (no-op).
    if (part.start === start && part.end === end && part.state === "replaced" && part.text === newText) return;

    if (part.state !== "initial") throw new Error(OVERLAP_REASON);

    const replacement: Part[] = [];
    if (start > part.start)
      replacement.push({
        start: part.start,
        end: start,
        state: "initial",
        text: this.original.slice(part.start, start),
      });
    replacement.push({ start, end, state: insertOnly ? "inserted" : "replaced", text: newText });
    if (end < part.end)
      replacement.push({ start: end, end: part.end, state: "initial", text: this.original.slice(end, part.end) });

    this.parts = [...this.parts.slice(0, idx), ...replacement, ...this.parts.slice(idx + 1)];
  }
}

/** Options for {@link applyFixes}. */
export interface ApplyFixesOptions {
  /**
   * The widest {@link Applicability} tier to apply. Default `"machine-applicable"`
   * — only fully-confident fixes. Pass `"maybe-incorrect"` to also apply
   * likely-correct fixes. `"has-placeholders"` and `"unspecified"` are **never**
   * applied, whatever this is set to.
   */
  maxApplicability?: Applicability;
}

/** The outcome of {@link applyFixes}: the rewritten source plus what was and
 *  wasn't applied. */
export interface ApplyReport {
  /** The source after applying every committed suggestion. */
  output: string;
  /** Suggestions that were applied, in the order applied. */
  applied: FixSuggestion[];
  /** Suggestions that were skipped, each with a human-readable reason. */
  skipped: { suggestion: FixSuggestion; reason: string }[];
}

const firstEditStart = (s: FixSuggestion): number =>
  s.edits.reduce((min, e) => Math.min(min, e.span.start), Number.POSITIVE_INFINITY);

/**
 * Rank an {@link Applicability} for the confidence gate: `machine-applicable` (0)
 * < `maybe-incorrect` (1); the placeholder/unspecified tiers are never
 * applicable (∞).
 */
const APPLY_RANK: Record<Applicability, number> = {
  "machine-applicable": 0,
  "maybe-incorrect": 1,
  "has-placeholders": Number.POSITIVE_INFINITY,
  unspecified: Number.POSITIVE_INFINITY,
};

/** Total change magnitude of a suggestion: Σ over its edits of the bytes it
 *  removes (`span.end - span.start`) plus the bytes it inserts (`newText.length`).
 *  The smaller-change-wins term of {@link rankFixes} (egg-style extraction). */
const editMagnitude = (s: FixSuggestion): number =>
  s.edits.reduce((sum, e) => sum + (e.span.end - e.span.start) + e.newText.length, 0);

/**
 * Order the mutually-exclusive {@link FixSuggestion} ALTERNATIVES on **one**
 * diagnostic (see {@link import("./diagnostics.js").FixSuggestion}) into a single
 * canonical, deterministic sequence so every consumer — the `arch fix` fixpoint,
 * LSP quick-fixes — picks or presents them the same way. Returns a **new** sorted
 * array; the input is not mutated (pure).
 *
 * Suggestions are compared by a cost tuple, lexicographically:
 * 1. {@link APPLY_RANK} of `applicability` — the more confidently applicable fix
 *    first (`machine-applicable` < `maybe-incorrect` < placeholder/unspecified);
 * 2. total edit magnitude ({@link editMagnitude}) — the smallest change wins;
 * 3. earliest edit start offset ({@link firstEditStart});
 * 4. original array index — a stable tie-break.
 *
 * On a singleton array (today's only shape — no producer emits more than one
 * alternative per diagnostic) this is the identity, so existing behavior is
 * unchanged.
 */
export function rankFixes(fixes: FixSuggestion[]): FixSuggestion[] {
  return fixes
    .map((fix, index) => ({ fix, index }))
    .sort(
      (a, b) =>
        APPLY_RANK[a.fix.applicability] - APPLY_RANK[b.fix.applicability] ||
        editMagnitude(a.fix) - editMagnitude(b.fix) ||
        firstEditStart(a.fix) - firstEditStart(b.fix) ||
        a.index - b.index,
    )
    .map(({ fix }) => fix);
}

/**
 * Apply `suggestions` to `source`, atomically per suggestion and deterministically.
 *
 * Suggestions are filtered by {@link Applicability} (see
 * {@link ApplyFixesOptions.maxApplicability}), then processed in a deterministic
 * order — by their earliest edit's start offset, ties broken by original array
 * order. Each surviving suggestion is applied into a trial copy of the piece
 * table; if any of its edits conflicts (overlaps an already-applied edit, or is
 * out of range) the **whole** suggestion is rolled back and recorded in
 * `skipped`. Pure: no I/O, and the same inputs always yield the same report.
 *
 * This orders suggestions across diagnostics by edit position only; it does **not**
 * treat the several `fixes` on one diagnostic as mutually-exclusive alternatives.
 * A caller that wants the pick-one semantics those alternatives promise should
 * reduce each diagnostic's `fixes` to its top-ranked one via {@link rankFixes}
 * before handing them here.
 */
export function applyFixes(source: string, suggestions: FixSuggestion[], opts: ApplyFixesOptions = {}): ApplyReport {
  const threshold = opts.maxApplicability === "maybe-incorrect" ? 1 : 0;
  const admissible = suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .filter(({ suggestion }) => APPLY_RANK[suggestion.applicability] <= threshold);

  // Deterministic order: earliest edit first, ties by original position.
  admissible.sort((a, b) => firstEditStart(a.suggestion) - firstEditStart(b.suggestion) || a.index - b.index);

  const applied: FixSuggestion[] = [];
  const skipped: { suggestion: FixSuggestion; reason: string }[] = [];

  for (const { suggestion } of admissible) {
    // Edit spans are in ORIGINAL coordinates, so trial-apply this suggestion onto
    // a fresh table replaying every already-committed edit — a conflict there
    // means it touches bytes an earlier committed fix owns. All-or-nothing: on any
    // failure the suggestion contributes nothing (the trial table is discarded).
    const trial = cloneWithReplay(source, applied);
    let ok = true;
    let reason = OVERLAP_REASON;
    for (const edit of orderedEdits(suggestion.edits)) {
      try {
        trial.replaceRange(edit.span.start, edit.span.end, edit.newText);
      } catch (e) {
        ok = false;
        reason = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    if (ok) applied.push(suggestion);
    else skipped.push({ suggestion, reason });
  }

  return { output: cloneWithReplay(source, applied).render(), applied, skipped };
}

/** Edits of one suggestion, ordered by span for a stable, self-consistent replay. */
function orderedEdits(edits: { span: Span; newText: string }[]): { span: Span; newText: string }[] {
  return [...edits].sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
}

/** A fresh piece table with every already-committed suggestion's edits replayed —
 *  the base a trial applies its own edits on top of. */
function cloneWithReplay(source: string, committed: FixSuggestion[]): Data {
  const d = new Data(source);
  for (const s of committed)
    for (const edit of orderedEdits(s.edits)) d.replaceRange(edit.span.start, edit.span.end, edit.newText);
  return d;
}
