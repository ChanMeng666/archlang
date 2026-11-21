/**
 * The compiler functions the view path calls (main.ts, and the compile job it runs in a worker,
 * compile-worker.ts), behind the one dynamic import that keeps the core out of the startup chunk.
 * Named, not `import("archlang")`: a dynamic import of the package itself keeps every export it
 * has, while named re-exports let the bundler drop the ones no chunk uses. Add a name here when
 * either needs one, and to `src/compile-path.ts` with it (playground/test/core-files.test.ts).
 * `lint` is not one (card EB.2): the compile job imports it from the core's lazy chunk, since only
 * the editor asks for it.
 *
 * Its `compile` is the core's `compileWithoutErrorCard` (card 3.19): `compile()` without
 * `onError: "svg"`'s error card, so the compiler chunk carries neither the card's renderer nor the
 * catalogue's fix column it prints. For every call that does not ask for the card it is `compile()`;
 * no playground module imports the other one (playground/test/core-files.test.ts), and the embed,
 * the one page that shows the card, draws it on a broken plan with `renderErrorSvg`, which that
 * plan loads (error-card.ts). Read from the build entry itself (`archlang/compile-path`,
 * vite.config.js), since `dist/index.js` does not export that function.
 */
export {
  compileWithoutErrorCard as compile,
  describe,
  describeLevel,
  THEMES,
} from "archlang/compile-path";
