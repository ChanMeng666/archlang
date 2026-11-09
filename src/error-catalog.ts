/**
 * The ArchLang diagnostic catalog: every `E_*` / `W_*` code with its cause, fix,
 * and a tiny example. One source for `arch explain <CODE>` and the generated
 * `docs/error-codes.md` (see `scripts/gen-error-codes.ts`). The codes themselves
 * are raised across `src/` (validate/resolve/import/builtins/elements); this file
 * documents them.
 *
 * The entries live by family in `src/error-catalog/<family>.ts` (one `defineEntries({...})`
 * each, the code written once as its key); this file spreads the families into one frozen
 * object. Key order reaches no output: `ERROR_CODES` is sorted, and every reader indexes by code.
 *
 * Where a NEW code goes: a lint rule's code goes in the family file whose header names its
 * `LintRule.family` (`test/error-catalog-families.test.ts` enforces it). Any other code goes in
 * the family whose prefix or subject it shares (`E_IMPORT_*` → `import.ts`, `E_*_LIMIT` →
 * `limits.ts`, storey/`level` codes → `vertical.ts`, parse/grammar → `language.ts`); when unsure,
 * the file an agent would open first. A new family file is imported and spread below.
 */

import { CIRCULATION_ENTRIES } from "./error-catalog/circulation.js";
import { DRAFTING_ENTRIES } from "./error-catalog/drafting.js";
import { FURNITURE_ENTRIES } from "./error-catalog/furniture.js";
import { FURNITURE_CHECKS_ENTRIES } from "./error-catalog/furniture-checks.js";
import { IMPORT_ENTRIES } from "./error-catalog/import.js";
import { INTENT_ENTRIES } from "./error-catalog/intent.js";
import { INTERCHANGE_ENTRIES } from "./error-catalog/interchange.js";
import { LANGUAGE_ENTRIES } from "./error-catalog/language.js";
import { LAYOUT_ENTRIES } from "./error-catalog/layout.js";
import { LIMITS_ENTRIES } from "./error-catalog/limits.js";
import { OPENINGS_ENTRIES } from "./error-catalog/openings.js";
import { ROOMS_ENTRIES } from "./error-catalog/rooms.js";
import { SITE_ENTRIES } from "./error-catalog/site.js";
import { VERTICAL_ENTRIES } from "./error-catalog/vertical.js";
import { WALLS_ENTRIES } from "./error-catalog/walls.js";

export interface CatalogEntry {
  code: string;
  severity: "error" | "warning";
  /** One-line summary. */
  message: string;
  /** Why the compiler raises it. */
  cause: string;
  /** How to resolve it. */
  fix: string;
  /** A minimal snippet illustrating the cause (or the fix). */
  example: string;
}

/**
 * Every family, merged. A code two families both define would be silently overwritten by the
 * spread, so `test/error-catalog-families.test.ts` pins the families disjoint.
 */
const CATALOG = Object.freeze({
  ...LANGUAGE_ENTRIES,
  ...WALLS_ENTRIES,
  ...LIMITS_ENTRIES,
  ...OPENINGS_ENTRIES,
  ...FURNITURE_ENTRIES,
  ...LAYOUT_ENTRIES,
  ...INTERCHANGE_ENTRIES,
  ...DRAFTING_ENTRIES,
  ...ROOMS_ENTRIES,
  ...SITE_ENTRIES,
  ...VERTICAL_ENTRIES,
  ...IMPORT_ENTRIES,
  ...INTENT_ENTRIES,
  ...CIRCULATION_ENTRIES,
  ...FURNITURE_CHECKS_ENTRIES,
});

/** A code the catalogue defines: the key type of the merged families, for new `diag()` call sites. */
export type CatalogCode = keyof typeof CATALOG;

/** The catalog, keyed by code. Frozen so it cannot be mutated at runtime. */
export const ERROR_CATALOG: Readonly<Record<string, CatalogEntry>> = CATALOG;

/** All catalog codes, sorted (errors then warnings, by UTF-16 code unit within — never
 *  `localeCompare`, whose ICU collation is host data and puts `_` before letters). */
export const ERROR_CODES: readonly string[] = Object.keys(ERROR_CATALOG).sort((a, b) => {
  const sev = (c: string): number => (ERROR_CATALOG[c]!.severity === "error" ? 0 : 1);
  return sev(a) - sev(b) || (a < b ? -1 : a > b ? 1 : 0);
});

/** Render a catalog entry as a plain-text block for `arch explain`, or null. */
export function explain(code: string): string | null {
  const e = ERROR_CATALOG[code];
  if (!e) return null;
  return [
    `${e.code}  (${e.severity})`,
    `  ${e.message}`,
    "",
    "Cause:",
    `  ${e.cause}`,
    "",
    "Fix:",
    `  ${e.fix}`,
    "",
    "Example:",
    ...e.example.split("\n").map((l) => `  ${l}`),
  ].join("\n");
}
