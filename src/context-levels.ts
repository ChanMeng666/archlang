/**
 * The `archlang context --level` words and the starter's size cap. A leaf module (no imports) so the
 * manifest can state the cap without importing the CLI; `src/cli/context-starter.ts` re-exports both.
 */

/** The most UTF-16 code units the starter may occupy: one screen. Pinned by test. */
export const STARTER_MAX_UNITS = 4000;

/** The `--level` words `context` accepts; `full` is today's output, byte for byte. */
export const CONTEXT_LEVELS = ["starter", "full"] as const;
