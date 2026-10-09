/**
 * Generate the Claude Code plugin's skill copies under `plugins/archlang/skills/`.
 *
 * The plugin lives in a slim subfolder (the repo root carries an 11 MB font the plugin directory
 * refuses). The sources of truth stay where `npx skills add` finds them: the root `SKILL.md`
 * (the umbrella `archlang` skill) and `skills/<name>/SKILL.md`. This copies them byte-for-byte
 * into the layout a plugin expects, `skills/<name>/SKILL.md`; `check:drift` gates the result.
 * It also stamps two derived values into the hand-written manifest
 * `plugins/archlang/.claude-plugin/plugin.json` (the directory validator requires both): its
 * `version` (the core's, root `package.json`) and the `npx` pin of the MCP server
 * (`packages/mcp/package.json`, an exact version, never `@latest`). A release bump therefore
 * reaches the plugin by `npm run gen:plugin`, and `check:drift` fails on a stale manifest.
 * `.claude-plugin/icon.png` is a static render of `brand/archlang-icon-plum.svg`.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN_SKILLS_DIR = "plugins/archlang/skills";

export const PLUGIN_MANIFEST = "plugins/archlang/.claude-plugin/plugin.json";

/** The manifest with its derived fields (`version`, the MCP pin) recomputed from the package manifests. */
export function pluginManifest(): string {
  const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
  const manifest = readJson(PLUGIN_MANIFEST);
  const mcp = readJson("packages/mcp/package.json");
  const next = { ...manifest, version: readJson("package.json").version as string };
  next.mcpServers = { archlang: { ...manifest.mcpServers.archlang, args: ["-y", `${mcp.name}@${mcp.version}`] } };
  return `${JSON.stringify(next, null, 2)}\n`;
}

/** Published path → source path, for every skill the plugin ships. */
export function pluginSkillFiles(): { dest: string; src: string }[] {
  const out = [{ dest: `${PLUGIN_SKILLS_DIR}/archlang/SKILL.md`, src: "SKILL.md" }];
  for (const d of readdirSync(join(ROOT, "skills")).sort()) {
    if (statSync(join(ROOT, "skills", d)).isDirectory()) {
      out.push({ dest: `${PLUGIN_SKILLS_DIR}/${d}/SKILL.md`, src: `skills/${d}/SKILL.md` });
    }
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rmSync(join(ROOT, PLUGIN_SKILLS_DIR), { recursive: true, force: true });
  for (const { dest, src } of pluginSkillFiles()) {
    mkdirSync(dirname(join(ROOT, dest)), { recursive: true });
    writeFileSync(join(ROOT, dest), readFileSync(join(ROOT, src)));
  }
  writeFileSync(join(ROOT, PLUGIN_MANIFEST), pluginManifest());
  process.stdout.write(`gen-plugin: wrote ${pluginSkillFiles().length} skills to ${PLUGIN_SKILLS_DIR}\n`);
}
