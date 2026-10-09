/**
 * Generate the Claude Code plugin's skill copies under `plugins/archlang/skills/`.
 *
 * The plugin lives in a slim subfolder (the repo root carries an 11 MB font the plugin directory
 * refuses). The sources of truth stay where `npx skills add` finds them: the root `SKILL.md`
 * (the umbrella `archlang` skill) and `skills/<name>/SKILL.md`. This copies them byte-for-byte
 * into the layout a plugin expects, `skills/<name>/SKILL.md`; `check:drift` gates the result.
 * The hand-written manifest `plugins/archlang/.claude-plugin/plugin.json` is the only other file.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN_SKILLS_DIR = "plugins/archlang/skills";

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
  process.stdout.write(`gen-plugin: wrote ${pluginSkillFiles().length} skills to ${PLUGIN_SKILLS_DIR}\n`);
}
