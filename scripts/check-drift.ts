/**
 * Drift gate for every generated artifact. Runs each `gen:*` generator, then
 * `git diff --exit-code`s its outputs; any change means a generated file was
 * hand-edited (or its source changed without regenerating). Run with
 * `npm run check:drift` (used by CI in place of the old per-generator steps).
 *
 * Generators run in the order the CLI declares them — `gen:spec` MUST precede
 * `gen:llms` because `llms-full.txt` is built from `spec.llm.md`, and `gen:llms` MUST precede
 * `gen:cli` because the CLI reference states the bundle size `gen:llms` measures.
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATORS } from "./generators.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");

const ALL_ARTIFACTS = GENERATORS.flatMap((g) => g.artifacts);

/**
 * True when the given paths are unchanged in the working tree AND none is untracked. A generator
 * re-creates an artifact deleted from the repository as an UNTRACKED file, which `git diff` cannot
 * see, so that is checked separately; a staged, in-sync file stays clean (regenerating cannot clear
 * an index-vs-HEAD difference, so `git status` would be wrong here).
 */
function isClean(paths: readonly string[]): boolean {
  const list = paths.join(" ");
  try {
    execSync(`git diff --quiet -- ${list}`, { cwd: ROOT, stdio: "ignore" });
  } catch {
    return false;
  }
  return execSync(`git ls-files --others --exclude-standard -- ${list}`, { cwd: ROOT, encoding: "utf8" }).trim() === "";
}

function main(): void {
  if (!isClean(ALL_ARTIFACTS)) {
    process.stderr.write(
      "warning: generated artifacts already have uncommitted changes in the working tree — " +
        "drift results below reflect that dirty state, not just this run.\n",
    );
  }

  const drifted: string[] = [];
  for (const { script, artifacts } of GENERATORS) {
    execSync(`npm run ${script}`, { cwd: ROOT, stdio: "inherit" });
    for (const artifact of artifacts) {
      if (!isClean([artifact])) drifted.push(artifact);
    }
  }

  if (drifted.length > 0) {
    process.stderr.write("\n");
    for (const path of drifted) {
      process.stderr.write(
        `DRIFT: ${path} — regenerate with \`npm run gen:all\`; generated files must never be hand-edited\n`,
      );
    }
    process.exit(1);
  }

  process.stdout.write(`\n✓ all ${ALL_ARTIFACTS.length} generated artifacts are in sync with their sources\n`);
}

main();
