/**
 * Drift gate for every generated artifact. Runs each `gen:*` generator, then
 * `git diff --exit-code`s its outputs; any change means a generated file was
 * hand-edited (or its source changed without regenerating). Run with
 * `npm run check:drift` (used by CI in place of the old per-generator steps).
 *
 * Generators run in the order the CLI declares them — `gen:spec` MUST precede
 * `gen:llms` because `llms-full.txt` is built from `spec.llm.md`.
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Each generator with the exact files it writes (verified against every
 * `scripts/gen-*.ts` `writeFileSync`). Order is load-bearing: spec before llms.
 */
const GENERATORS: readonly { script: string; artifacts: readonly string[] }[] = [
  { script: "gen:grammars", artifacts: ["editors/archlang.tmLanguage.json", "playground/src/arch-language.js"] },
  { script: "gen:errors", artifacts: ["docs/error-codes.md"] },
  { script: "gen:spec", artifacts: ["spec.llm.md"] },
  { script: "gen:llms", artifacts: ["llms-full.txt"] },
  { script: "gen:gbnf", artifacts: ["grammars/archlang.gbnf"] },
  { script: "gen:plan-schema", artifacts: ["schemas/plan.schema.json"] },
  { script: "gen:intent-schema", artifacts: ["schemas/intent.schema.json"] },
];

const ALL_ARTIFACTS = GENERATORS.flatMap((g) => g.artifacts);

/** True when `git diff --quiet` reports the given paths are unchanged in the working tree. */
function isClean(paths: readonly string[]): boolean {
  try {
    execSync(`git diff --quiet -- ${paths.join(" ")}`, { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
