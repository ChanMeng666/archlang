// Copy the five MCP resource files from the repo tree into dist/ (flat), so the
// built server can read them next to itself and they ship via the package "files"
// (dist/). Deterministic: fixed source→dest list, run after `tsup` in the build
// script. The server also falls back to reading them from the repo tree when it
// runs from source (tests), so this copy matters only for the packed artifact.
//
// The list below is the ONE place the set is written down; `test/lockstep.test.ts`
// extracts it and pins it against `src/server.ts`'s `readResource()` calls, and
// `scripts/check-dist-resources.mjs` byte-compares each copy after a build. Keep the
// count in this comment honest — it read "four" for two releases after the fifth
// resource landed.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", ".."); // packages/mcp/scripts → repo root
const dist = join(here, "..", "dist");
mkdirSync(dist, { recursive: true });

/** [repo-relative source, flat dest name] — the five `archlang://…` resources. */
const RESOURCES = [
  ["spec.llm.md", "spec.llm.md"],
  ["llms-full.txt", "llms-full.txt"],
  ["schemas/plan.schema.json", "plan.schema.json"],
  ["grammars/archlang.gbnf", "archlang.gbnf"],
  ["schemas/intent.schema.json", "intent.schema.json"],
];

for (const [src, dest] of RESOURCES) {
  copyFileSync(join(repo, src), join(dist, dest));
  // eslint-disable-next-line no-console
  console.log(`  ${src} → dist/${dest}`);
}
