/**
 * The workspaces `check:quick` (`scripts/check-quick.mjs`) typechecks when a change touches them,
 * derived from `package.json` `workspaces` (globs such as `packages/*` expanded, keeping only
 * directories with a `package.json`). Pure and dependency-free; `test/check-quick-workspaces.test.ts`
 * ties the result to the workspaces the `typecheck:all` script names.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Workspaces with no `typecheck` script, so neither `check:quick` nor `typecheck:all` runs one. */
export const EXCLUDED = new Map([["packages/font-cjk", "ships a font and index.js only; no typecheck script"]]);

/** Workspace directories (posix, relative to `root`) declared by `package.json`, minus `EXCLUDED`. */
export function checkQuickWorkspaces(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const dirs = [];
  for (const pattern of pkg.workspaces ?? []) {
    if (pattern.endsWith("/*")) {
      const parent = pattern.slice(0, -2);
      const base = join(root, parent);
      if (!existsSync(base)) continue;
      for (const name of readdirSync(base).sort()) dirs.push(`${parent}/${name}`);
    } else if (/[*?[\]{}!]/.test(pattern)) {
      throw new Error(`check:quick: unsupported workspaces glob "${pattern}" (only a trailing "/*" is expanded)`);
    } else dirs.push(pattern);
  }
  return dirs.filter(
    (d) =>
      !EXCLUDED.has(d) &&
      statSync(join(root, d), { throwIfNoEntry: false })?.isDirectory() &&
      existsSync(join(root, d, "package.json")),
  );
}
