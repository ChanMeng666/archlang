/**
 * The error card the embed shows for a plan that is broken on first load (embed.ts), behind one
 * dynamic import, so the embed path does not carry the card's renderer and the catalogue's fix column
 * it prints (card 3.19, `embedPathBudget` in `e2e/startup-chunks.baseline.json`): a broken plan
 * loads them, a plan that draws never does. `renderErrorSvg` draws, for `compile()`'s own
 * diagnostics, the card `compile(source, { onError: "svg" })` draws, byte for byte
 * (`test/error-svg.test.ts`; the embed's own options, `playground/test/embed-params.test.ts`).
 */
export { renderErrorSvg } from "archlang";
