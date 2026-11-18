/**
 * Which text a `W_ANNOTATION_OVERLAP` warning reports, and what it is printed over (card AL6),
 * kept BESIDE the diagnostic in a `WeakMap`, never on it, as the ruleset reference is
 * (`rule-ref.ts`, RM1.6b): `lint()` returns the same objects, with the same keys, and
 * `JSON.stringify(lint(src))` is unchanged. The rule records it where it pushes the warning
 * ({@link citeOverprint}), since only there is it known whether the subject is the author's room
 * name or a figure `dims auto` drew.
 *
 * A copy of a diagnostic does not inherit the entry: `lint()` carries it across its own copies
 * ({@link carryOverprint}). Nor does a `structuredClone` or a `postMessage`, so the detail is read
 * where `lint()` ran, before the diagnostic leaves (`diagnosticToJson`'s `overprint` option). Pure:
 * an entry is written once per diagnostic a run creates and read only by that run's callers.
 */

import type { Diagnostic } from "../diagnostics.js";
import type { DiagnosticOverprintJson } from "../diagnostic-json.js";

const DETAILS = new WeakMap<Diagnostic, DiagnosticOverprintJson>();

/** Record that `d` reports `detail`'s subject printed over its `over` list; returns `d`, unchanged. */
export function citeOverprint<D extends Diagnostic>(d: D, detail: DiagnosticOverprintJson): D {
  DETAILS.set(d, detail);
  return d;
}

/**
 * What a `W_ANNOTATION_OVERLAP` warning reports as overprinting what (card AL6), for
 * `diagnosticToJson(source, d, { overprint: diagnosticOverprint })`: the text it is about
 * (`subject`) and each thing that text is printed over (`over`), each by its kind, the element id
 * `describe()` lists it by and the room it belongs to. `undefined` for every other diagnostic, and
 * for a copy, clone or posted diagnostic: read it on the diagnostics `lint()` returned, where it ran.
 */
export function diagnosticOverprint(d: Diagnostic): DiagnosticOverprintJson | undefined {
  return DETAILS.get(d);
}

/** `to`, a copy of `from`, carrying `from`'s detail. Returns `to`. */
export function carryOverprint<D extends Diagnostic>(from: Diagnostic, to: D): D {
  const e = DETAILS.get(from);
  if (e) DETAILS.set(to, e);
  return to;
}
