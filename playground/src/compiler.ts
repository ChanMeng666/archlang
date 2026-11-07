/**
 * The compiler functions the view path calls (main.ts, and the compile job it runs in a worker,
 * compile-worker.ts), behind the one dynamic import that keeps the core out of the startup chunk.
 * Named, not `import("archlang")`: a dynamic import of the package itself keeps every export it
 * has, while named re-exports let the bundler drop the ones no chunk uses. Add a name here when
 * either needs one.
 */
export { compile, describe, describeLevel, lint, THEMES } from "archlang";
