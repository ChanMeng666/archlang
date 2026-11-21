/**
 * A build entry, not a package export (card 3.19b), the fourth of the playground's four (after
 * `src/compile-path.ts`, `src/first-use-path.ts` and `src/actions-path.ts`): `lint`, which no
 * view-mode render runs (`playground/src/lint-core.ts`, the door that edit mode imports and the
 * compile job imports by URL for a request from the editor; the Checks overlay's review sheet and
 * the press-only `finish` and `repair` read it too). Imported from its declaring module, never
 * through `index.ts`.
 *
 * As an entry of its own it gives lint's code chunks apart from what a first use loads
 * (`src/first-use-path.ts`, which named `lint` until this card) and from what only a press loads
 * (`src/actions-path.ts`: `finish` reads `lint`, so without this entry lint's rules would share a
 * chunk with finish, repair, format and the DXF/TXT writers). So a first use, which renders in view
 * mode with no lint, loads none of it (`firstUsePathBudget`,
 * `playground/e2e/startup-chunks.baseline.json`), and entering edit mode loads it with the editor.
 * `dist/lint-path.js` itself holds no code and is left out of the npm tarball (`files` in
 * package.json). Nothing changes for a consumer of `dist/index.js`, which exports the same values
 * from the same code.
 */
export { lint } from "./lint.js";
