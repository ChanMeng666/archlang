/**
 * The generator → artifact table, the source of truth for "generated file". `scripts/check-drift.ts`
 * runs each row's `gen:*` and diffs its artifacts; `scripts/gen-generated-artifacts.ts` writes the
 * same table as `.claude/hooks/generated-artifacts.json`, which the local-gate hook reads to refuse a
 * hand edit (the hook is plain Node and cannot import TypeScript). Moved here from `check-drift.ts`
 * unchanged, so both read one list.
 */

import { PLUGIN_MANIFEST, pluginSkillFiles } from "./gen-plugin.js";
import { allOutputs } from "./gen-agent-manifests.js";
import { SURFACES as DOORS_SURFACES } from "./gen-doors.js";
import { README_SVGS, VIEW_SVGS, svgPath } from "./gen-example-svgs.js";
import { CATALOG_FIXES_PATH } from "./gen-error-codes.js";

/** Where `npm run gen:generated-artifacts` writes this table for `.claude/hooks/local-gate.mjs`. */
export const GENERATED_ARTIFACTS_JSON = ".claude/hooks/generated-artifacts.json";

/**
 * Each generator with the exact files it writes (verified against every
 * `scripts/gen-*.ts` `writeFileSync`). Order is load-bearing: spec, then llms, then cli.
 * `partial`: the artifacts the generator does not write whole — it rewrites only a marked region or
 * a few derived fields of a file that is otherwise written by hand — so a merge conflict in one is a
 * real conflict (`scripts/sync-main.mjs` never takes a side). `true` means every artifact of the row,
 * a list names some of them. `test/sync-main.test.ts` pins the list and fails when a generator reads
 * one of its own artifacts without marking it here.
 */
export const GENERATORS: readonly {
  script: string;
  artifacts: readonly string[];
  partial?: true | readonly string[];
}[] = [
  {
    script: "gen:grammars",
    artifacts: [
      "editors/archlang.tmLanguage.json",
      "playground/src/arch-language.js",
      "docs-site/.vitepress/theme/arch-highlight.js",
    ],
  },
  { script: "gen:errors", artifacts: ["docs/error-codes.md", CATALOG_FIXES_PATH] },
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
  // The skill copies are whole files; the manifest keeps its hand-written fields and gets only
  // `version` and the MCP pin rewritten (`pluginManifest()`).
  {
    script: "gen:plugin",
    artifacts: [...pluginSkillFiles().map((f) => f.dest), PLUGIN_MANIFEST],
    partial: [PLUGIN_MANIFEST],
  },
  // The per-route `.md` Content-Type rules, derived from the PAGES + SITE_PAGES tables in docs-site/sync-docs.mjs.
  { script: "gen:docs-headers", artifacts: ["docs-site/public/_headers"], partial: true },
  // The topmost-`todo` finder for the /loop driver, derived from the `### ` headings of docs/backlog.md.
  { script: "gen:backlog-index", artifacts: ["docs/backlog-index.md"] },
  // Which tests import each src module and what each test file is for, derived from the imports and the test headers.
  { script: "gen:test-index", artifacts: ["test/INDEX.md"] },
  { script: "gen:agent-manifests", artifacts: allOutputs() },
  // The `<arch-plan>` element the docs site serves, built by packages/web-component/scripts/build.ts.
  { script: "gen:arch-plan", artifacts: ["docs-site/public/arch-plan.js"] },
  { script: "gen:doors", artifacts: DOORS_SURFACES.map((s) => s.file), partial: true },
  // The `archlang://capabilities` MCP resource, from the tool registry, the CLI manifest and EXPORT_FORMATS.
  { script: "gen:mcp-capabilities", artifacts: ["packages/mcp/capabilities.md"] },
  // The public-surface map: every export of `src/index.ts`, its declaring module and in-repo consumers.
  { script: "gen:surface", artifacts: ["docs/agents/public-surface.md"] },
  // The module map: every source module's header summary, budget and importer count, from the tracked tree.
  { script: "gen:module-map", artifacts: ["docs/agents/module-map.md"] },
  // This table itself, as JSON for the local-gate hook's generated-file rule (it lists its own path).
  { script: "gen:generated-artifacts", artifacts: [GENERATED_ARTIFACTS_JSON] },
];
