/**
 * The Claude Code plugin is a slim, self-contained folder, `plugins/archlang/`: the plugin directory
 * rejects any plugin folder holding a file over 5 MiB, and the repo root carries an 11 MB font. Its
 * `skills/` are GENERATED copies (`npm run gen:plugin`) of the root `SKILL.md` (the umbrella skill)
 * and `skills/*` — the sources `npx skills add` reads — so the byte-equality here is the drift gate's
 * twin. `plugin.json` is hand-written, is the only plugin manifest, and omits a version so it cannot
 * drift from `package.json`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => JSON.parse(readFileSync(resolve(p), "utf8"));
const PLUGIN = "plugins/archlang";
const MAX_FILE = 5 * 1024 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("plugin folder", () => {
  const plugin = read(`${PLUGIN}/.claude-plugin/plugin.json`);
  const market = read(".claude-plugin/marketplace.json");
  const rootSkillName = /^name:\s*(\S+)/m.exec(readFileSync(resolve("SKILL.md"), "utf8"))?.[1];

  it("is the only plugin manifest, named after the umbrella skill", () => {
    expect(existsSync(resolve(".claude-plugin/plugin.json"))).toBe(false);
    expect(rootSkillName).toBe("archlang");
    expect(plugin.name).toBe(rootSkillName);
    expect(plugin).not.toHaveProperty("version");
    // the default skills/<name>/SKILL.md scan finds all five; a `skills` key would only add to it
    expect(plugin).not.toHaveProperty("skills");
  });

  it("ships the umbrella skill and every task skill, byte-identical to its source", () => {
    const task = readdirSync(resolve("skills")).sort();
    expect(task.length).toBeGreaterThan(0);
    expect(task).not.toContain("archlang");
    expect(readdirSync(resolve(PLUGIN, "skills")).sort()).toEqual(["archlang", ...task].sort());
    const same = (dest: string, src: string) =>
      expect(readFileSync(resolve(PLUGIN, "skills", dest, "SKILL.md"), "utf8"), dest).toBe(
        readFileSync(resolve(src), "utf8"),
      );
    same("archlang", "SKILL.md");
    for (const d of task) same(d, `skills/${d}/SKILL.md`);
  });

  it("holds only the manifest and the skills, none over 5 MiB, and stays small", () => {
    const root = resolve(PLUGIN);
    const files = walk(root);
    const rel = files.map((f) => f.slice(root.length + 1).replace(/\\/g, "/")).sort();
    const stray = rel.filter((f) => f !== ".claude-plugin/plugin.json" && !/^skills\/[^/]+\/SKILL\.md$/.test(f));
    expect(stray).toEqual([]);
    let total = 0;
    for (const f of files) {
      const size = statSync(f).size;
      expect(size, f).toBeLessThan(MAX_FILE);
      total += size;
    }
    expect(total).toBeLessThan(256 * 1024);
    // package-manager / attributes files above the plugin folder count toward the same limit
    for (const f of ["package-lock.json", ".gitattributes"]) {
      expect(statSync(resolve(f)).size, f).toBeLessThan(MAX_FILE);
    }
  });

  it("declares the published MCP server", () => {
    const mcp = read("packages/mcp/package.json");
    expect(plugin.mcpServers.archlang.command).toBe("npx");
    expect(plugin.mcpServers.archlang.args).toContain(mcp.name);
  });

  it("is what marketplace.json installs, by its manifest name", () => {
    expect(market.owner.name).toBeTruthy();
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0].name).toBe(plugin.name);
    expect(market.plugins[0].source).toBe(`./${PLUGIN}`);
    expect(market.plugins[0]).not.toHaveProperty("version");
  });

  it("is not shipped in the npm package (the plugin installs from git, not npm)", () => {
    expect(read("package.json").files).not.toContain("plugins");
  });
});
