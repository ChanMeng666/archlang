/**
 * The Claude Code plugin manifests are hand-written JSON that must keep pointing at things that
 * exist: the plugin exposes the ROOT `SKILL.md` (one source of truth, via `"skills": ["."]`) and
 * the published MCP package. No version is written in either file — the manifest omits it so it
 * cannot drift from `package.json`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => JSON.parse(readFileSync(resolve(p), "utf8"));

describe(".claude-plugin manifests", () => {
  const plugin = read(".claude-plugin/plugin.json");
  const market = read(".claude-plugin/marketplace.json");
  const skillName = /^name:\s*(\S+)/m.exec(readFileSync(resolve("SKILL.md"), "utf8"))?.[1];

  it("plugin.json exposes the root SKILL.md without duplicating it", () => {
    expect(plugin.skills).toEqual(["."]);
    expect(existsSync(resolve("SKILL.md"))).toBe(true);
    expect(existsSync(resolve("skills"))).toBe(false);
    expect(skillName).toBe("archlang");
    expect(plugin.name).toBe(skillName);
  });

  it("plugin.json declares the published MCP server and writes no version", () => {
    const mcp = read("packages/mcp/package.json");
    expect(plugin.mcpServers.archlang.command).toBe("npx");
    expect(plugin.mcpServers.archlang.args).toContain(mcp.name);
    expect(plugin).not.toHaveProperty("version");
  });

  it("marketplace.json lists the plugin by its manifest name, sourced from the repo root", () => {
    expect(market.owner.name).toBeTruthy();
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0].name).toBe(plugin.name);
    expect(market.plugins[0].source).toBe("./");
    expect(market.plugins[0]).not.toHaveProperty("version");
  });
});
