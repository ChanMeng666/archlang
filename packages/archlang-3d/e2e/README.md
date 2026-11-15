# Heavy tests

`*.e2e.ts` files here run under `npm run check:3d` (root), never under `npm test`. See
`../vitest.e2e.config.ts`.

`frame-budget.e2e.ts` runs on its own, after the others (the package's `e2e` script,
`../scripts/e2e.ts`), so no other file's browser shares the runner while it times the contact
shadows. `npm -w packages/archlang-3d run e2e -- <file filter>…` applies the filter to both passes
and skips a pass none of whose files it selects; give options as `--name=value`.
