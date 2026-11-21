/**
 * A build entry, not a package export (card 3.18), the third of the playground's four (after
 * `src/compile-path.ts` and `src/first-use-path.ts`, before `src/lint-path.ts`): the core values the header actions run only
 * when a button is pressed (`playground/src/press-core.ts`, the door `playground/src/actions.ts`
 * imports dynamically: Format, Finish, Repair furniture, the DXF and TXT downloads). Each is
 * imported from its declaring module, never through `index.ts`.
 *
 * As an entry of its own it gives this code chunks apart from both what a first use loads
 * (`src/first-use-path.ts`) and edit mode's share of the core, so a first use, which mounts the
 * actions before its first render, loads none of it (`firstUsePathBudget`,
 * `playground/e2e/startup-chunks.baseline.json`), and the first press loads it, with lint's chunk
 * (`src/lint-path.ts`), which `finish` and `repair` read, unless edit mode has loaded that already.
 * `dist/actions-path.js` itself holds no code and is left out of the npm tarball (`files` in
 * package.json). Nothing changes for a consumer of `dist/index.js`, which exports the same values
 * from the same code.
 */
export { renderAscii } from "./backends/ascii.js";
export { toDxf } from "./export/dxf.js";
export { finish } from "./finish.js";
export { format } from "./format.js";
export { repair } from "./repair.js";
