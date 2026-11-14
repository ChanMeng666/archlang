/**
 * Agent-facing JSON projection of a {@link Diagnostic}.
 *
 * `diagnosticToJson` is the **canonical** shape emitted by the CLI's `--json`
 * output for every diagnostic: it resolves the byte `span` to 1-based
 * `line`/`col` (via {@link offsetToLineCol}) and attaches the catalogued `fix`
 * (from {@link CATALOG_FIXES}, the catalogue's fix column generated from `ERROR_CATALOG`) so a
 * self-correcting agent needs no docs lookup. It reads that column, never the catalogue itself, so a
 * bundle that compiles (the `--error-svg` card draws these fixes) need not carry every message,
 * cause and example (card RM0.7). Pure and isomorphic — it only maps data, no I/O.
 */

import type { Applicability, Diagnostic, Severity } from "./diagnostics.js";
import { offsetToLineCol } from "./diagnostics.js";
import { CATALOG_FIXES } from "./error-catalog-fixes.js";

/** A {@link import("./diagnostics.js").FixSuggestion} projected to JSON — edit
 *  spans become `[start, end]` tuples (like the diagnostic's own `span`). */
export interface FixSuggestionJson {
  title: string;
  applicability: Applicability;
  edits: { span: [number, number]; newText: string }[];
  fixId?: string;
  /** The module these edit spans are offsets into, when that is not the source being
   *  fixed. **A consumer must not apply a suggestion carrying one** — the offsets address
   *  another file's bytes (`applyFixes` refuses it for exactly that reason). Absent for
   *  every suggestion whose edits belong to the source you passed in. */
  file?: string;
}

/** A {@link Diagnostic} projected to the agent-friendly JSON shape (with `fix`). */
export interface DiagnosticJson {
  /** Stable machine code, e.g. `"E_ROOM_SIZE"`; absent when the diagnostic has none. */
  code?: string;
  severity: Severity;
  message: string;
  /** 1-based line of `span.start`; present only when the diagnostic has a `span`. */
  line?: number;
  /** 1-based column of `span.start`; present only when the diagnostic has a `span`. */
  col?: number;
  /** `[start, end)` byte range; present only when the diagnostic has a `span`. */
  span?: [number, number];
  /**
   * The `.arch` module `span` (and every `fixes[].edits[].span`) is measured in, when that
   * is NOT the source being compiled — i.e. the defect lives in an `import`ed file. Absent
   * (the overwhelmingly common case) means "the source you passed in".
   *
   * When it IS present, `line`/`col` are deliberately omitted: they can only be derived
   * from the text the offsets index into, and that text is not the one being projected.
   * Emitting them anyway would print a location in the compiled source that has nothing to
   * do with the problem — which is exactly the confusion `file` exists to end. Read `span`
   * against `file` instead, and see {@link import("./diagnostics.js").Diagnostic.file}.
   */
  file?: string;
  /** Catalogued remediation for `code`; present only when the code has a `fix`. */
  fix?: string;
  /** Follow-up suggestions; present only when the diagnostic carries hints. */
  hints?: string[];
  /** Machine-applicable fix alternatives; present only when the diagnostic
   *  carries `fixes`. Each entry's edit spans are `[start, end)` byte ranges into
   *  the original source (mutually-exclusive alternatives — apply at most one). */
  fixes?: FixSuggestionJson[];
  /** The storey that raised it (a multi-storey plan's authored `level` number);
   *  present only when the diagnostic carries one. See {@link Diagnostic.level}. */
  level?: number;
  /**
   * The lint ruleset number this warning was raised against (card RM1.6b): its key, value, units,
   * who set it, its document, clause, edition and verification grade, and the profile the run
   * used. Present only when the caller asks for it ({@link DiagnosticJsonOptions.rule}) and a
   * ruleset number drives the diagnostic; never part of `lint()`'s own return value.
   */
  rule?: DiagnosticRuleJson;
}

/** A source a ruleset number is read from, as {@link DiagnosticRuleJson.also} lists it. */
export interface RuleSourceJson {
  document: string;
  clause: string | null;
  edition: string | null;
  verification: "V" | "S-full" | "S-secondary" | "M";
  note?: string;
}

/**
 * A diagnostic's `rule`: one row of `lint --rules --json` (the same keys, in the same order), after
 * `profile`, the built-in profile the run used (`null`: the default ruleset). `from` says who set
 * the value (`"default"`, the profile's name, or `"cascade"`); `verification` is the source's
 * grade, `"convention"` for a number ArchLang chose itself, with `document`, `clause` and `edition`
 * then `null`. `diagnosticRule` (the provenance table, `src/lint/provenance.ts`) builds it; this
 * module only carries it, so the table stays off the compile path.
 */
export interface DiagnosticRuleJson {
  profile: string | null;
  key: string;
  value: number | string | boolean | null;
  units: "mm" | "m2" | "ratio" | null;
  from: string;
  verification: RuleSourceJson["verification"] | "convention";
  document: string | null;
  clause: string | null;
  edition: string | null;
  note?: string;
  also?: readonly RuleSourceJson[];
}

/** What {@link diagnosticToJson} adds beyond the canonical shape, when the caller asks. */
export interface DiagnosticJsonOptions {
  /**
   * Attach `rule`: pass `diagnosticRule`, which reads the reference `lint()` keeps beside each
   * diagnostic. Call it on the diagnostics `lint()` returned, where it ran: a copied, cloned or
   * posted diagnostic has no reference, and gets no `rule`.
   */
  rule?: (d: Diagnostic) => DiagnosticRuleJson | undefined;
}

/**
 * Project a {@link Diagnostic} into the agent-friendly JSON shape (with `fix`). The two-argument
 * call is the canonical shape; `opts` only appends keys (`rule`, after every other key).
 */
export function diagnosticToJson(source: string, d: Diagnostic, opts?: DiagnosticJsonOptions): DiagnosticJson {
  const out: DiagnosticJson = {} as DiagnosticJson;
  if (d.code) out.code = d.code;
  out.severity = d.severity;
  out.message = d.message;
  if (d.span) {
    // `line`/`col` are only meaningful for offsets into `source`. A diagnostic carrying a
    // `file` is measured in ANOTHER module, so it gets `span` + `file` and no line/col
    // rather than a confidently-wrong location in the file the caller is reading.
    if (d.file === undefined) {
      const { line, col } = offsetToLineCol(source, d.span.start);
      out.line = line;
      out.col = col;
    }
    out.span = [d.span.start, d.span.end];
  }
  if (d.file !== undefined) out.file = d.file;
  // An own key only, as `ERROR_CATALOG[code]?.fix` was: an inherited name (`constructor`) has no fix.
  const fix = d.code && Object.hasOwn(CATALOG_FIXES, d.code) ? CATALOG_FIXES[d.code] : undefined;
  if (fix) out.fix = fix;
  if (d.hints?.length) out.hints = d.hints;
  if (d.fixes?.length)
    out.fixes = d.fixes.map((f) => {
      const j: FixSuggestionJson = {
        title: f.title,
        applicability: f.applicability,
        edits: f.edits.map((e) => ({ span: [e.span.start, e.span.end], newText: e.newText })),
      };
      if (f.fixId !== undefined) j.fixId = f.fixId;
      if (f.file !== undefined) j.file = f.file;
      return j;
    });
  if (d.level !== undefined) out.level = d.level;
  const rule = opts?.rule?.(d);
  if (rule) out.rule = rule;
  return out;
}
