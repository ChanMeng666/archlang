/**
 * The core functions the header actions run only when a button is pressed (card 3.18): Format,
 * Finish, Repair furniture and the DXF and TXT downloads. actions.ts reaches them through one
 * dynamic import of this door (`loadActionsCore`), so a first use, which mounts the actions before
 * its first render, does not load their code (`firstUsePathBudget`,
 * `playground/e2e/startup-chunks.baseline.json`); the first press of one of them does, and the
 * menus that hold them start it when they open. Named, not `import("archlang")`, as
 * `compiler.ts` is: named re-exports let the bundler drop what no chunk uses. Add a name here and
 * to `src/actions-path.ts` together (playground/test/core-files.test.ts).
 */
export { finish, format, renderAscii, repair, toDxf } from "archlang";
