/**
 * The Claude Code plugin is a slim, self-contained folder, `plugins/archlang/`: the plugin directory
 * rejects any plugin folder holding a file over 5 MiB, and the repo root carries an 11 MB font. Its
 * `skills/` are GENERATED copies (`npm run gen:plugin`) of the repo's `skills/*` (the umbrella skill
 * `skills/archlang` and the task skills) — the sources `npx skills add` reads — so the byte-equality
 * here is the drift gate's twin. `.claude-plugin/plugin.json` is the Claude manifest, hand-written except for two derived fields
 * `gen:plugin` stamps and `check:drift` gates: `version` (the core's) and the hosted MCP server. The
 * portable and OpenAI manifests (`gen:agent-manifests`) sit beside it, version-free. Anthropic's
 * directory accepts a local MCP server, and any file that is not Markdown, text, JSON, YAML or an
 * image, only from a Verified organization, so the folder starts no local server and holds only those
 * types; the Cursor plugin (its rule, its local server) is its own folder, `plugins/archlang-cursor/`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_ROOT_FILES, HOSTED_MCP_URL } from "../scripts/gen-agent-manifests.js";

const read = (p: string) => JSON.parse(readFileSync(resolve(p), "utf8"));
const PLUGIN = "plugins/archlang";
const MAX_FILE = 5 * 1024 * 1024;
const ICON = ".claude-plugin/icon.png";
// the Claude manifest and icon, plus the version-free files `gen:agent-manifests` generates here
// (`assets/icon.png` is its byte copy of the icon, for the OpenAI listing)
const CLAUDE_PLUGIN_FILES = new Set([
  ".claude-plugin/plugin.json",
  ICON,
  "plugin.json",
  "mcp.json",
  "assets/icon.png",
  // hand-written: what the plugin runs and sends, and how to use the local server instead
  "README.md",
  ...BUNDLED_ROOT_FILES.map((f) => f.dest),
]);
/** The file types Anthropic's directory accepts from an unverified publisher. */
const ALLOWED_TYPE = /\.(?:md|txt|json|ya?ml|png|jpe?g|gif|webp|ico)$/i;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("plugin folder", () => {
  const plugin = read(`${PLUGIN}/.claude-plugin/plugin.json`);
  const market = read(".claude-plugin/marketplace.json");
  const umbrellaName = /^name:\s*(\S+)/m.exec(readFileSync(resolve("skills/archlang/SKILL.md"), "utf8"))?.[1];

  it("is the only plugin manifest, named after the umbrella skill", () => {
    expect(existsSync(resolve(".claude-plugin/plugin.json"))).toBe(false);
    expect(umbrellaName).toBe("archlang");
    expect(plugin.name).toBe(umbrellaName);
    // the default skills/<name>/SKILL.md scan finds all five; a `skills` key would only add to it
    expect(plugin).not.toHaveProperty("skills");
  });

  it("ships the umbrella skill and every task skill, byte-identical to its source", () => {
    // One source directory, copied whole: the umbrella skill sits beside the task skills.
    const skills = readdirSync(resolve("skills")).sort();
    expect(skills).toContain("archlang");
    expect(skills.length).toBeGreaterThan(1);
    expect(readdirSync(resolve(PLUGIN, "skills")).sort()).toEqual(skills);
    for (const d of skills) {
      expect(readFileSync(resolve(PLUGIN, "skills", d, "SKILL.md"), "utf8"), d).toBe(
        readFileSync(resolve("skills", d, "SKILL.md"), "utf8"),
      );
    }
  });

  it("holds only the manifest and the skills, none over 5 MiB, and stays small", () => {
    const root = resolve(PLUGIN);
    const files = walk(root);
    const rel = files.map((f) => f.slice(root.length + 1).replace(/\\/g, "/")).sort();
    const stray = rel.filter((f) => !CLAUDE_PLUGIN_FILES.has(f) && !/^skills\/[^/]+\/SKILL\.md$/.test(f));
    expect(stray).toEqual([]);
    for (const f of rel) {
      expect(f, f).toMatch(ALLOWED_TYPE);
      // nothing that reads as a script
      expect(readFileSync(join(root, f)).subarray(0, 2).toString("latin1"), f).not.toBe("#!");
    }
    let total = 0;
    for (const f of files) {
      const size = statSync(f).size;
      expect(size, f).toBeLessThan(MAX_FILE);
      total += size;
    }
    expect(total).toBeLessThan(384 * 1024);
    // package-manager / attributes files above the plugin folder count toward the same limit
    for (const f of ["package-lock.json", ".gitattributes"]) {
      expect(statSync(resolve(f)).size, f).toBeLessThan(MAX_FILE);
    }
  });

  it("declares the hosted MCP server over HTTP, and no local one anywhere in the folder", () => {
    expect(plugin.mcpServers).toEqual({ archlang: { type: "http", url: HOSTED_MCP_URL } });
    expect(new URL(HOSTED_MCP_URL).protocol).toBe("https:");
    // no sign-in: a header would carry a credential
    expect(plugin.mcpServers.archlang).not.toHaveProperty("headers");
    // no file in the folder starts a program: the directory refuses a local server from an unverified publisher
    for (const f of walk(resolve(PLUGIN)).filter((x) => x.endsWith(".json"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/"command"\s*:|"stdio"/);
    }
  });

  it("discloses in its README that the MCP server is the hosted one, and how to run the local one", () => {
    const readme = readFileSync(resolve(PLUGIN, "README.md"), "utf8");
    expect(readme).toContain(HOSTED_MCP_URL);
    // the hand-written manifest description names the same host
    expect(plugin.description).toContain(new URL(HOSTED_MCP_URL).host);
    expect(readme).toContain("https://archlang.uk/privacy");
    expect(readme).toContain(`claude mcp add archlang -- npx -y ${read("packages/mcp/package.json").name}`);
  });

  it("carries the core version (the plugin's skills ship with the core)", () => {
    expect(plugin.version).toBe(read("package.json").version);
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has a square PNG icon, 512-2048 px, under 2 MB", () => {
    const buf = readFileSync(resolve(PLUGIN, ICON));
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.subarray(12, 16).toString("latin1")).toBe("IHDR");
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(h);
    expect(w).toBeGreaterThanOrEqual(512);
    expect(w).toBeLessThanOrEqual(2048);
    expect(buf.length).toBeLessThan(2 * 1024 * 1024);
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
