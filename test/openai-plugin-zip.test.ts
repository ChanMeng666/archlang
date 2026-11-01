/**
 * The OpenAI plugin directory ZIP (`npm run build:openai-plugin`). The archive itself is a
 * gitignored build product, so what is pinned here is the builder: the ZIP it would write is
 * opened again and read entry by entry, and must hold exactly the portable layout the directory
 * reads, differing from the generated folder `plugins/archlang/` only on purpose (`plugin.json`
 * gains the version, `mcp.json` names the hosted server, the skills pin the CLI). The same check
 * (`checkOpenaiZip`) runs on the written file in `build:openai-plugin` and `prove:openai-plugin`;
 * this suite also asserts the contents directly, so the check cannot pass by being lenient.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { zipFiles } from "../packages/mcp/scripts/build-mcpb.js";
import {
  buildOpenaiZip,
  checkOpenaiZip,
  coreVersion,
  openaiPluginFiles,
  pinSkill,
  pluginVersion,
  readZip,
  zipName,
} from "../scripts/build-openai-plugin.js";
import { HOSTED_MCP_URL, MCP_SCHEMA_ID, PORTABLE_MANIFEST } from "../scripts/gen-agent-manifests.js";

const read = (p: string) => readFileSync(resolve(p));
const readJson = (p: string) => JSON.parse(read(p).toString("utf8"));
const version = readJson("package.json").version as string;

describe("OpenAI plugin ZIP", () => {
  const zip = buildOpenaiZip();
  const entries = readZip(zip);

  it("is named for the core version and stamped with it", () => {
    expect(coreVersion()).toBe(version);
    expect(zipName(version)).toBe(`archlang-plugin-${version}.zip`);
  });

  it("holds exactly plugin.json, mcp.json, the icon and the skills, at the archive root", () => {
    const names = [...entries.keys()].sort();
    const skillNames = names.filter((n) => n.startsWith("skills/"));
    expect(names).toEqual(["assets/icon.png", "mcp.json", "plugin.json", ...skillNames].sort());
    expect(skillNames.length).toBeGreaterThan(1);
    for (const n of skillNames) {
      expect(n).toMatch(/^skills\/[a-z0-9-]+\/SKILL\.md$/);
      expect(entries.get(n)!.toString("utf8"), n).toBe(pinSkill(read(n).toString("utf8"), version));
    }
    for (const n of names) {
      expect(n).not.toMatch(/\\|^\.|\/\./);
      expect(n).not.toMatch(/^(\.claude-plugin|\.cursor-plugin|rules)\//);
    }
    expect(entries.get("assets/icon.png")!.equals(read("plugins/archlang/.claude-plugin/icon.png"))).toBe(true);
  });

  it("plugin.json is the generated manifest plus `version`, right after `name`", () => {
    const m = JSON.parse(entries.get("plugin.json")!.toString("utf8"));
    expect(m.version).toBe(version);
    expect(Object.keys(m).slice(0, 4)).toEqual(["$schema", "name", "version", "description"]);
    const { version: _v, ...rest } = m;
    expect(rest).toEqual(readJson(PORTABLE_MANIFEST));
    // the repository's own manifest names no version (agent-manifests.test.ts)
    expect(readJson(PORTABLE_MANIFEST)).not.toHaveProperty("version");
  });

  it("mcp.json is the hosted server, not the repository's local one", () => {
    const mcp = JSON.parse(entries.get("mcp.json")!.toString("utf8"));
    expect(mcp).toEqual({
      $schema: MCP_SCHEMA_ID,
      mcpServers: { archlang: { type: "streamable-http", url: HOSTED_MCP_URL } },
    });
    expect(HOSTED_MCP_URL).toBe("https://mcp.archlang.uk/mcp");
    expect(readJson("plugins/archlang/mcp.json").mcpServers.archlang.type).toBe("stdio");
  });

  it("every skill pins the CLI to the core version, and the repository's skills name none", () => {
    const skillNames = [...entries.keys()].filter((n) => n.startsWith("skills/"));
    for (const n of skillNames) {
      const skill = entries.get(n)!.toString("utf8");
      expect(skill, n).not.toMatch(/(npx -y|npm i -g) @chanmeng666\/archlang(?![\w@-])/);
      expect(skill, n).toContain(`npx -y @chanmeng666/archlang@${version}`);
      expect(read(n).toString("utf8"), n).not.toContain(`@chanmeng666/archlang@${version}`);
    }
    // a sibling package and a prose mention stay as written
    expect(pinSkill("npx -y @chanmeng666/archlang-mcp, the @chanmeng666/archlang package", "9.9.9")).toBe(
      "npx -y @chanmeng666/archlang-mcp, the @chanmeng666/archlang package",
    );
    expect(pinSkill("`npx -y @chanmeng666/archlang spec`", "9.9.9")).toBe("`npx -y @chanmeng666/archlang@9.9.9 spec`");
  });

  it("passes the builder's own check, which fails on a tampered archive", () => {
    expect(() => checkOpenaiZip(entries)).not.toThrow();
    const files = openaiPluginFiles();
    const tamper = (f: (fs: typeof files) => typeof files) => readZip(zipFiles(f(files.map((x) => ({ ...x })))));
    // a stray other-host file
    expect(() =>
      checkOpenaiZip(tamper((fs) => [...fs, { name: "rules/archlang.mdc", data: Buffer.from("x") }])),
    ).toThrow(/entries/);
    // the repository's local mcp.json instead of the hosted one
    expect(() =>
      checkOpenaiZip(
        tamper((fs) => fs.map((x) => (x.name === "mcp.json" ? { ...x, data: read("plugins/archlang/mcp.json") } : x))),
      ),
    ).toThrow(/hosted server/);
    // the version missing
    expect(() =>
      checkOpenaiZip(
        tamper((fs) => fs.map((x) => (x.name === "plugin.json" ? { ...x, data: read(PORTABLE_MANIFEST) } : x))),
      ),
    ).toThrow(/version/);
    // a skill as the repository holds it, with the CLI unpinned
    const skill = [...entries.keys()].find((n) => n.startsWith("skills/"))!;
    expect(() =>
      checkOpenaiZip(tamper((fs) => fs.map((x) => (x.name === skill ? { ...x, data: read(skill) } : x)))),
    ).toThrow(/pinned CLI/);
  });

  it("a named plugin version moves the listing and leaves the CLI pin on the core", () => {
    expect(pluginVersion([], "1.50.0")).toBe("1.50.0");
    expect(pluginVersion(["--plugin-version=1.50.1"], "1.50.0")).toBe("1.50.1");
    expect(pluginVersion(["--plugin-version=1.51.0"], "1.50.3")).toBe("1.51.0");
    for (const bad of ["1.50.0", "1.49.9", "1.5", "v2.0.0"])
      expect(() => pluginVersion([`--plugin-version=${bad}`], "1.50.0")).toThrow(/plugin-version/);

    const named = readZip(buildOpenaiZip("99.0.0", version));
    expect(JSON.parse(named.get("plugin.json")!.toString("utf8")).version).toBe("99.0.0");
    expect(() => checkOpenaiZip(named, "99.0.0", version)).not.toThrow();
    const skill = [...named.keys()].find((n) => n.startsWith("skills/"))!;
    expect(named.get(skill)!.toString("utf8")).toContain(`@chanmeng666/archlang@${version}`);
    expect(() => checkOpenaiZip(named, "99.0.0", "99.0.0")).toThrow(/pinned CLI/);
  });

  it("is deterministic", () => {
    expect(buildOpenaiZip().equals(zip)).toBe(true);
  });
});
