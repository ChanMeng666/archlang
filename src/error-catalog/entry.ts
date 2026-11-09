/**
 * The helpers every error-catalogue family module writes its entries with. A family is one
 * `defineEntries({ E_X: e(message, cause, fix, example), … })`: the code is written once, as the
 * key, and `defineEntries` copies it into the entry. `src/error-catalog.ts` spreads the families
 * into `ERROR_CATALOG`.
 */

import type { CatalogEntry } from "../error-catalog.js";

/** A catalogue entry before its code is filled in from its key. */
export type EntryBody = Omit<CatalogEntry, "code">;

/** An `E_*` entry. */
export const e = (message: string, cause: string, fix: string, example: string): EntryBody => ({
  severity: "error",
  message,
  cause,
  fix,
  example,
});

/** A `W_*` entry. */
export const w = (message: string, cause: string, fix: string, example: string): EntryBody => ({
  severity: "warning",
  message,
  cause,
  fix,
  example,
});

/**
 * A family's entries, keyed by code, each with `code` filled in from its key (first, so an entry
 * keeps the property order `code, severity, message, cause, fix, example`). The keys stay literal
 * in the type, which is what `CatalogCode` is built from.
 */
export function defineEntries<T extends Record<string, EntryBody>>(
  bodies: T,
): { readonly [K in keyof T]: CatalogEntry } {
  const out: Record<string, CatalogEntry> = {};
  for (const [code, body] of Object.entries(bodies)) out[code] = { code, ...body };
  return out as { readonly [K in keyof T]: CatalogEntry };
}
