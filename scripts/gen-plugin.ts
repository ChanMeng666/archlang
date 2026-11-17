/**
 * Generate the plugins' skill copies under `plugins/archlang/skills/` (the Claude Code plugin) and
 * `plugins/archlang-cursor/skills/` (the Cursor plugin, its own folder: see `gen-agent-manifests.ts`).
 *
 * The plugin lives in a slim subfolder (the repo root carries an 11 MB font the plugin directory
 * refuses). The sources of truth stay where `npx skills add` finds them, `skills/<name>/SKILL.md`
 * (the umbrella `archlang` skill and the task skills beside it); the repo root holds no `SKILL.md`,
 * because a root one makes the whole repository the skill. This copies them byte-for-byte into
 * the same layout under each plugin; `check:drift` gates the result.
 * It also stamps two derived values into the hand-written manifest
 * `plugins/archlang/.claude-plugin/plugin.json`: its `version` (the core's, root `package.json`,
 * which the directory validator requires) and its MCP server, the hosted one (`HOSTED_MCP_URL`,
 * ADR 0026) over HTTP, because Anthropic's plugin directory accepts a local (stdio) server only from
 * a Verified organization. A release bump therefore reaches the plugin by `npm run gen:plugin`, and
 * `check:drift` fails on a stale manifest.
 * `.claude-plugin/icon.png` is a static render of `brand/archlang-icon-plum.svg`.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CURSOR_ROOT, HOSTED_MCP_URL } from "./gen-agent-manifests.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN_SKILLS_DIR = "plugins/archlang/skills";
export const CURSOR_SKILLS_DIR = `${CURSOR_ROOT}/skills`;
/** Every folder that carries a copy of the skills. */
export const SKILLS_DIRS = [PLUGIN_SKILLS_DIR, CURSOR_SKILLS_DIR] as const;

export const PLUGIN_MANIFEST = "plugins/archlang/.claude-plugin/plugin.json";

/** The manifest with its derived fields (`version`, the hosted MCP server) recomputed. */
export function pluginManifest(): string {
  const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
  const manifest = readJson(PLUGIN_MANIFEST);
  const next = { ...manifest, version: readJson("package.json").version as string };
  next.mcpServers = { archlang: { type: "http", url: HOSTED_MCP_URL } };
  return `${JSON.stringify(next, null, 2)}\n`;
}

/** Published path → source path, for every skill a plugin ships (`dir`: one plugin's skills folder). */
export function pluginSkillFiles(dir: string = PLUGIN_SKILLS_DIR): { dest: string; src: string }[] {
  const out: { dest: string; src: string }[] = [];
  for (const d of readdirSync(join(ROOT, "skills")).sort()) {
    if (statSync(join(ROOT, "skills", d)).isDirectory()) {
      out.push({ dest: `${dir}/${d}/SKILL.md`, src: `skills/${d}/SKILL.md` });
    }
  }
  return out;
}

/** Every skill copy in every plugin folder. */
export function allPluginSkillFiles(): { dest: string; src: string }[] {
  return SKILLS_DIRS.flatMap((d) => pluginSkillFiles(d));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const d of SKILLS_DIRS) rmSync(join(ROOT, d), { recursive: true, force: true });
  for (const { dest, src } of allPluginSkillFiles()) {
    mkdirSync(dirname(join(ROOT, dest)), { recursive: true });
    writeFileSync(join(ROOT, dest), readFileSync(join(ROOT, src)));
  }
  writeFileSync(join(ROOT, PLUGIN_MANIFEST), pluginManifest());
  process.stdout.write(`gen-plugin: wrote ${pluginSkillFiles().length} skills to each of ${SKILLS_DIRS.join(", ")}\n`);
}
