/**
 * `E_LEVEL_MIX`'s catalogued remedy, written once (card 3.19): the catalogue entry's `fix`
 * (`src/error-catalog/vertical.ts`) and the parser's message, which quotes it, both read it here.
 * The parser once quoted it from the generated `CATALOG_FIXES`, which put the whole fix column on
 * the playground's compiler chunk for this one row; the compile path holds the phrase once either
 * way. A module of its own, which `src/index.ts` does not re-export, so the package surface does not
 * change.
 */
import { LEVEL_MIX_STAYS_OUTSIDE } from "./ast.js";

/** What `E_LEVEL_MIX` asks of the author: move the statement into its level; what may stay outside. */
export const LEVEL_MIX_FIX = `Move the statement inside the \`level\` block it belongs to. Only ${LEVEL_MIX_STAYS_OUTSIDE} stay outside — they apply to every level.`;
