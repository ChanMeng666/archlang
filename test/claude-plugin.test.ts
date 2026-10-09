/**
 * The Claude Code plugin manifests are hand-written JSON that must keep pointing at things that
 * exist: the plugin exposes the ROOT `SKILL.md` (one source of truth, via `"skills": ["."]`), the
 * task skills under `skills/` and the published MCP package. No version is written in either file — the manifest omits it so it
 * cannot drift from `package.json`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    expect(skillName).toBe("archlang");
    expect(plugin.name).toBe(skillName);
  });

  it("the task skills load from the default skills/ scan, which the `skills` key adds to", () => {
    // Claude Code scans `skills/<name>/SKILL.md` by default and a manifest `skills` key ADDS to
    // that scan, so `["."]` (the root skill) plus the directory is the whole set. Listing
    // `./skills/` as well would name each task skill twice.
    const dirs = readdirSync(resolve("skills"));
    expect(dirs.length).toBeGreaterThan(0);
    for (const d of dirs) expect(existsSync(resolve("skills", d, "SKILL.md")), `skills/${d}/SKILL.md`).toBe(true);
    expect(dirs).not.toContain(skillName);
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
