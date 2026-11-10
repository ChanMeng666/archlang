/**
 * The CJK font pin: the core's exact `optionalDependencies` pin of
 * `@chanmeng666/archlang-font-cjk` must equal `packages/font-cjk`'s own version, else a published
 * core could never resolve its font. One comparison for two callers: `release.yml` (the "Resolve
 * versions" step, at tag time) and `test/font-cjk-pins.test.ts` (every PR).
 *
 *   node scripts/check-font-pin.mjs [<root>]     exit 0 when equal, else 1 with a `::error::` line
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FONT_PACKAGE = "@chanmeng666/archlang-font-cjk";

const readJson = (root, file) => JSON.parse(readFileSync(join(root, file), "utf8"));

/** The failure message when the pin and the package disagree, else `null`. */
export function fontPinProblem(root) {
  const fontVersion = readJson(root, "packages/font-cjk/package.json").version;
  const pinned = readJson(root, "package.json").optionalDependencies?.[FONT_PACKAGE];
  if (pinned !== fontVersion) {
    return `package.json pins ${FONT_PACKAGE}@${pinned} but packages/font-cjk is ${fontVersion}.`;
  }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const problem = fontPinProblem(root);
  if (problem) {
    console.log(`::error::${problem}`);
    process.exit(1);
  }
}
