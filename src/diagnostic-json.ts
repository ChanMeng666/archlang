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

import type { Applicability, Diagnostic, Severity, Span } from "./diagnostics.js";
import { offsetToLineCol } from "./diagnostics.js";
import { diagnosticFix } from "./catalog-fix.js";

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
  /** Catalogued remediation for `code`; present only when the code has a `fix`. On a diagnostic
   *  that names a {@link cause}, it says to fix that root first instead (RM9.4). */
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
  /** The `place … as <name>` instance whose expansion raised it, dotted when nested; present only
   *  when the diagnostic carries one. See {@link Diagnostic.instance}. */
  instance?: string;
  /** The component {@link instance} was made from; present only when the diagnostic carries one. */
  component?: string;
  /**
   * Secondary locations that explain it (rustc's secondary spans, LSP `relatedInformation`): the
   * statement an id was first declared at, the `place` that put an instance's body here, the wall
   * a door was expected on. Present only when the diagnostic carries related spans; each entry
   * follows the diagnostic's own rule for `line`/`col`/`span`/`file`.
   */
  related?: RelatedSpanJson[];
  /**
   * The root diagnostic this one follows from (RM9.4, {@link import("./diagnostics.js").Diagnostic.cause}):
   * its `code`, then its location by the rule `related` follows. The root is the diagnostic of that
   * `code`, `span` and `file` with this one's own `instance`. Present only on a diagnostic that
   * carries one, which is listed after its root; after `related`.
   */
  cause?: { code: string; line?: number; col?: number; span: [number, number]; file?: string };
  /**
   * The lint ruleset number this warning was raised against (card RM1.6b): its key, value, units,
   * who set it, its document, clause, edition and verification grade, and the profile the run
   * used. Present only when the caller asks for it ({@link DiagnosticJsonOptions.rule}) and a
   * ruleset number drives the diagnostic; never part of `lint()`'s own return value.
   */
  rule?: DiagnosticRuleJson;
  /**
   * What a `W_ANNOTATION_OVERLAP` warning says is printed over what (card AL6): the text it is
   * about and each thing under it, by kind, so a reader can tell a room's own name or area figure
   * from a figure `dims auto` drew. Present only when the caller asks for it
   * ({@link DiagnosticJsonOptions.overprint}) and the diagnostic carries one; after `rule`; never
   * part of `lint()`'s own return value.
   */
  overprint?: DiagnosticOverprintJson;
}

/**
 * The kinds of text and ink an overprint names (card AL6). A subject is one of the texts:
 * `room-label` (a room's name and area figure, the one label they make), `furniture-label`, or a
 * `dims auto` figure (`dim-chain`, a chain's span; `dim-thickness`, the wall-thickness figure;
 * `dim-radius` and `dim-diameter`, the curve call-outs). What it is printed over may also be a
 * drawn `symbol` (a piece, a fixture, a stair or a lift), a `wall`'s poché, a `door-swing`, the
 * `floor-edge` of the subject's own room (the text runs off its floor), the sheet `chrome` (the
 * north arrow, the scale bar, the title block) or a `leader` line. Some kinds are named for checks
 * the rule does not make yet: today it reports a `furniture-label` (an uncatalogued piece's label,
 * its `id` the piece's; card AL4) only as what a text is printed over, never as a subject; no
 * `chrome` or `leader`; and no `dims auto` figure under another text.
 */
export type OverprintKind =
  | "room-label"
  | "furniture-label"
  | "dim-chain"
  | "dim-thickness"
  | "dim-radius"
  | "dim-diameter"
  | "symbol"
  | "wall"
  | "door-swing"
  | "floor-edge"
  | "chrome"
  | "leader";

/** One of the two texts a room's label is drawn as: its `name`, its `area` figure. */
export type LabelPart = "name" | "area";

/**
 * One text or thing an overprint names. `id` is the element's id as `describe()` lists it (a
 * symbol's, a door's, the piece's for a `furniture-label`; authored or assigned, and an assigned
 * one such as `desk_15` moves when a statement is inserted before it, so it identifies the element
 * in this run and is no handle to edit by: the hint quotes only authored ids); `room` is the id of the room a label belongs to, or,
 * for a `dims auto` figure, the room it stands in; `text` is the text as the sheet draws it (a
 * `room-label`'s is the room's name, or its area figure when it has no name). `parts` says which
 * texts of a room's label are involved, `name` before `area`, each measured on its own: on every
 * `over` entry of a `room-label` report, the texts of the subject's label that lie over that thing;
 * on a `room-label` entry of a figure's report, the texts of that label the figure is printed over.
 * Each key is present only when it applies.
 */
export interface OverprintItemJson {
  kind: OverprintKind;
  id?: string;
  room?: string;
  text?: string;
  parts?: LabelPart[];
}

/**
 * A diagnostic's `overprint`: the text it is about (`subject`, which always has its `text`) and
 * what that text is printed over (`over`), in the order the rule found them: the drawn symbols,
 * then the pieces' labels (a piece whose label is under the text is listed as a `symbol` too),
 * then for a room's label a wall, the door swings and its floor's edge, and for a `dims auto`
 * figure the rooms whose labels it covers, one entry per room. A room's warning is about its
 * label (`room-label`), whichever of its texts overprints; each `over` entry's `parts` says which.
 */
export interface DiagnosticOverprintJson {
  subject: OverprintItemJson & { text: string };
  over: OverprintItemJson[];
}

/**
 * A {@link import("./diagnostics.js").RelatedSpan} projected to JSON, keyed as a diagnostic is:
 * `message`, then 1-based `line`/`col` of `span[0]` (only when the span is in the source being
 * projected), `span` as `[start, end)`, and `file` when the span is measured in an imported module
 * (then no `line`/`col`, as for the diagnostic itself).
 */
export interface RelatedSpanJson {
  message: string;
  line?: number;
  col?: number;
  span: [number, number];
  file?: string;
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
  /**
   * Attach `overprint`: pass `diagnosticOverprint`, which reads the detail `lint()` keeps beside
   * each `W_ANNOTATION_OVERLAP` warning (card AL6). As for `rule`, call it on the diagnostics
   * `lint()` returned, where it ran.
   */
  overprint?: (d: Diagnostic) => DiagnosticOverprintJson | undefined;
}

/** `head`, then where `at` lies: `line`/`col` when it is in `source` (none in another `file`), `span`, `file`. */
function located<T extends object>(
  source: string,
  head: T,
  at: { span: Span; file?: string | undefined },
): T & { line?: number; col?: number; span: [number, number]; file?: string } {
  const j: T & { line?: number; col?: number; span?: [number, number]; file?: string } = { ...head };
  if (at.file === undefined) {
    const { line, col } = offsetToLineCol(source, at.span.start);
    j.line = line;
    j.col = col;
  }
  j.span = [at.span.start, at.span.end];
  if (at.file !== undefined) j.file = at.file;
  return j as T & { span: [number, number] };
}

/**
 * Project a {@link Diagnostic} into the agent-friendly JSON shape (with `fix`). The two-argument
 * call is the canonical shape; `opts` only appends keys (`rule`, then `overprint`, after every
 * other key).
 */
export function diagnosticToJson(source: string, d: Diagnostic, opts?: DiagnosticJsonOptions): DiagnosticJson {
  const out: DiagnosticJson = {} as DiagnosticJson;
  if (d.code) out.code = d.code;
  out.severity = d.severity;
  out.message = d.message;
  // `line`/`col` are only meaningful for offsets into `source`. A diagnostic carrying a
  // `file` is measured in ANOTHER module, so it gets `span` + `file` and no line/col
  // rather than a confidently-wrong location in the file the caller is reading.
  if (d.span) Object.assign(out, located(source, {}, { span: d.span, file: d.file }));
  else if (d.file !== undefined) out.file = d.file;
  const fix = diagnosticFix(d);
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
  // Card AF1: appended after every key above (and before `rule`, which stays last), so a
  // diagnostic that carries none of these projects to exactly the bytes it did before.
  if (d.instance !== undefined) out.instance = d.instance;
  if (d.component !== undefined) out.component = d.component;
  if (d.relatedSpans?.length) out.related = d.relatedSpans.map((r) => located(source, { message: r.message }, r));
  if (d.cause) out.cause = located(source, { code: d.cause.code }, d.cause);
  const rule = opts?.rule?.(d);
  if (rule) out.rule = rule;
  const overprint = opts?.overprint?.(d);
  if (overprint) out.overprint = overprint;
  return out;
}
