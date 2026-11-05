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
import { PLUGIN_MANIFEST, pluginSkillFiles } from "./gen-plugin.js";
import { allOutputs } from "./gen-agent-manifests.js";
import { SURFACES as DOORS_SURFACES } from "./gen-doors.js";
import { README_SVGS, VIEW_SVGS, svgPath } from "./gen-example-svgs.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Each generator with the exact files it writes (verified against every
 * `scripts/gen-*.ts` `writeFileSync`). Order is load-bearing: spec, then llms, then cli.
 */
const GENERATORS: readonly { script: string; artifacts: readonly string[] }[] = [
  {
    script: "gen:grammars",
    artifacts: [
      "editors/archlang.tmLanguage.json",
      "playground/src/arch-language.js",
      "docs-site/.vitepress/theme/arch-highlight.js",
    ],
  },
  { script: "gen:errors", artifacts: ["docs/error-codes.md"] },
  { script: "gen:spec", artifacts: ["spec.llm.md"] },
  // `gen:llms` also measures the bundle into `src/context-size.ts`, which the manifest's
  // `context` help states, so `gen:cli` (rendered from that manifest) runs after it.
  { script: "gen:llms", artifacts: ["llms-full.txt", "src/context-size.ts"] },
  { script: "gen:cli", artifacts: ["docs/cli-reference.md"] },
  { script: "gen:gbnf", artifacts: ["grammars/archlang.gbnf"] },
  { script: "gen:plan-schema", artifacts: ["schemas/plan.schema.json"] },
  { script: "gen:intent-schema", artifacts: ["schemas/intent.schema.json"] },
  // NOTE: `gen:paper-facts` used to be here, gating `paper/facts.{json,tex}`. The papers
  // moved to a separate repository on 2026-08-26. The gate went
  // WITH them — it is `scripts/check-drift.mjs` there, run first by that repo's
  // `paper:check`, and it still derives every count from this repo's own tables through a
  // sibling checkout. Dropping the gate in the move would have been the exact defect those
  // papers document, so it was not dropped.
  // Imported, never retyped: the curated README drawing list lives in the generator, so a
  // name added there is drift-gated here with no second edit (and cannot be forgotten).
  { script: "gen:example-svgs", artifacts: [...README_SVGS.map(svgPath), ...VIEW_SVGS.map((v) => v.dest)] },
  { script: "gen:plugin", artifacts: [...pluginSkillFiles().map((f) => f.dest), PLUGIN_MANIFEST] },
  // The per-route `.md` Content-Type rules, derived from the PAGES + SITE_PAGES tables in docs-site/sync-docs.mjs.
  { script: "gen:docs-headers", artifacts: ["docs-site/public/_headers"] },
  { script: "gen:agent-manifests", artifacts: allOutputs() },
  // The `<arch-plan>` element the docs site serves, built by packages/web-component/scripts/build.ts.
  { script: "gen:arch-plan", artifacts: ["docs-site/public/arch-plan.js"] },
  { script: "gen:doors", artifacts: DOORS_SURFACES.map((s) => s.file) },
];

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
