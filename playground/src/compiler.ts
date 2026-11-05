/**
 * The compiler functions the view path (main.ts) calls, behind the one dynamic import that
 * keeps the core out of the startup chunk. Named, not `import("archlang")`: a dynamic import of
 * the package itself keeps every export it has, while named re-exports let the bundler drop the
 * ones no chunk uses. Add a name here when main.ts needs one.
 */
export { compile, describe, describeLevel, THEMES } from "archlang";
