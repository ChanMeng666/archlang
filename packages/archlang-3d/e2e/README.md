# Heavy tests

`*.e2e.ts` files here run under `npm run check:3d` (root), never under `npm test`. See
`../vitest.e2e.config.ts`.

`frame-budget.e2e.ts` runs on its own, after the others (the package's `e2e` script), so no other
file's browser shares the runner while it times the contact shadows.
