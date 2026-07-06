/**
 * Agent-facing JSON projection of a {@link Diagnostic}.
 *
 * `diagnosticToJson` is the **canonical** shape emitted by the CLI's `--json`
 * output for every diagnostic: it resolves the byte `span` to 1-based
 * `line`/`col` (via {@link offsetToLineCol}) and attaches the catalogued `fix`
 * (from {@link ERROR_CATALOG}) so a self-correcting agent needs no docs lookup.
 * Pure and isomorphic — it only maps data, no I/O.
 */

import type { Diagnostic, Severity } from "./diagnostics.js";
import { offsetToLineCol } from "./diagnostics.js";
import { ERROR_CATALOG } from "./error-catalog.js";

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
  /** Catalogued remediation for `code`; present only when the code has a `fix`. */
  fix?: string;
  /** Follow-up suggestions; present only when the diagnostic carries hints. */
  hints?: string[];
}

/** Project a {@link Diagnostic} into the agent-friendly JSON shape (with `fix`). */
export function diagnosticToJson(source: string, d: Diagnostic): DiagnosticJson {
  const out: DiagnosticJson = {} as DiagnosticJson;
  if (d.code) out.code = d.code;
  out.severity = d.severity;
  out.message = d.message;
  if (d.span) {
    const { line, col } = offsetToLineCol(source, d.span.start);
    out.line = line;
    out.col = col;
    out.span = [d.span.start, d.span.end];
  }
  const fix = d.code ? ERROR_CATALOG[d.code]?.fix : undefined;
  if (fix) out.fix = fix;
  if (d.hints?.length) out.hints = d.hints;
  return out;
}
