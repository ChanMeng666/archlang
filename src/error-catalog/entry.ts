/**
 * The helpers every error-catalogue family module writes its entries with. A family is one
 * `defineEntries({ E_X: e(message, cause, fix, example), … })`: the code is written once, as the
 * key, and `defineEntries` copies it into the entry. `src/error-catalog.ts` merges the families
 * into `ERROR_CATALOG`.
 *
 * All three helpers build a value and touch nothing else, and are marked `@__NO_SIDE_EFFECTS__` to
 * say so: a bundler that cannot tell keeps every family's text for the calls alone in a bundle
 * that never reads the catalogue (card RM0.7: the playground's compiler chunk, which needs only the
 * fix column in `src/error-catalog-fixes.ts`). They are arrows because esbuild re-emits the mark on
 * a function declaration as a line comment, which the playground's bundler does not read.
 */

import type { CatalogEntry } from "../error-catalog.js";

/** A catalogue entry before its code is filled in from its key. */
export type EntryBody = Omit<CatalogEntry, "code">;

/** An `E_*` entry. */
export const e = /* @__NO_SIDE_EFFECTS__ */ (
  message: string,
  cause: string,
  fix: string,
  example: string,
): EntryBody => ({
  severity: "error",
  message,
  cause,
  fix,
  example,
});

/** A `W_*` entry. */
export const w = /* @__NO_SIDE_EFFECTS__ */ (
  message: string,
  cause: string,
  fix: string,
  example: string,
): EntryBody => ({
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
export const defineEntries = /* @__NO_SIDE_EFFECTS__ */ <T extends Record<string, EntryBody>>(
  bodies: T,
): { readonly [K in keyof T]: CatalogEntry } => {
  const out: Record<string, CatalogEntry> = {};
  for (const [code, body] of Object.entries(bodies)) out[code] = { code, ...body };
  return out as { readonly [K in keyof T]: CatalogEntry };
};
