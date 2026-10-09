/**
 * The MCPB manifest is generated at build time, never committed — so what is pinned
 * here is the generator: every derived field equals its source, and the tool list the
 * manifest would carry equals the server's real registry (the same `tools/list` the
 * build runs against the bundled server). The heavy pack-and-run proof is
 * `npm run build:mcpb && npm run prove:mcpb`, a release step, not part of `check`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildManifest, MANIFEST_VERSION, zipFiles } from "../scripts/build-mcpb.js";
import { connect } from "./helpers.js";

const MCP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(MCP, "..", "..");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const pkg = readJson(resolve(MCP, "package.json"));
const serverJson = readJson(resolve(MCP, "server.json"));

async function registryTools() {
  const client = await connect();
  const { tools } = await client.listTools();
  return tools.map((t) => ({ name: t.name, description: t.description }));
}

describe("MCPB manifest generator", () => {
  it("derives identity, version and runtime from the package metadata", async () => {
    const m = buildManifest(pkg, serverJson, await registryTools());
    expect(m.manifest_version).toBe(MANIFEST_VERSION);
    expect(m.version).toBe(pkg.version);
    expect(m.version).toBe(serverJson.version);
    expect(m.description).toBe(serverJson.description);
    expect(m.long_description).toBe(pkg.description);
    expect(m.license).toBe(pkg.license);
    expect(m.author.name).toBe("Chan Meng");
    expect(m.author.email).toBe("chanmeng.dev@gmail.com");
    expect(m.repository.url).toBe("https://github.com/ChanMeng666/archlang.git");
    expect(m.homepage).toBe(pkg.homepage);
    expect(m.compatibility.runtimes.node).toBe(pkg.engines.node);
  });

  it("lists exactly the tools the server registers, in registry order", async () => {
    const live = await registryTools();
    const m = buildManifest(pkg, serverJson, live);
    expect(m.tools.map((t) => t.name)).toEqual(live.map((t) => t.name));
    expect(m.tools.length).toBe(10);
    for (const t of m.tools) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.description.length).toBeLessThanOrEqual(201);
    }
  });

  it("launches the bundled entry point with node, from inside the bundle", async () => {
    const m = buildManifest(pkg, serverJson, await registryTools());
    expect(m.server.type).toBe("node");
    expect(m.server.mcp_config.command).toBe("node");
    expect(m.server.mcp_config.args).toEqual([`\${__dirname}/${m.server.entry_point}`]);
  });

  it("is byte-stable for the same inputs", async () => {
    const tools = await registryTools();
    expect(JSON.stringify(buildManifest(pkg, serverJson, tools))).toBe(
      JSON.stringify(buildManifest(pkg, serverJson, tools)),
    );
  });

  it("the strict manifest has no inputSchema; the Smithery variant carries the server's, per tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const live = tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    const strict = buildManifest(pkg, serverJson, live);
    for (const t of strict.tools) expect("inputSchema" in t).toBe(false);
    const variant = buildManifest(pkg, serverJson, live, { inputSchemas: true });
    expect(variant.tools.length).toBe(tools.length);
    variant.tools.forEach((t, i) => {
      const schema = (t as { inputSchema?: unknown }).inputSchema;
      expect(typeof schema).toBe("object");
      expect(schema).toEqual(tools[i]?.inputSchema);
    });
    // Everything but the tools' schemas is identical.
    expect({ ...variant, tools: 0 }).toEqual({ ...strict, tools: 0 });
  });

  it("zipFiles writes a readable archive (entries inflate back, deterministic)", () => {
    const files = [
      { name: "b/two.txt", data: Buffer.from("two two two two") },
      { name: "a.txt", data: Buffer.from("one") },
    ];
    const z = zipFiles(files);
    expect(zipFiles(files).equals(z)).toBe(true);
    expect(z.readUInt32LE(z.length - 22)).toBe(0x06054b50);
    expect(z.readUInt16LE(z.length - 22 + 10)).toBe(2);
    // First local entry is the lexicographically first name.
    const nameLen = z.readUInt16LE(26);
    expect(z.subarray(30, 30 + nameLen).toString()).toBe("a.txt");
    const csize = z.readUInt32LE(18);
    expect(inflateRawSync(z.subarray(30 + nameLen, 30 + nameLen + csize)).toString()).toBe("one");
  });

  it("takes its icon from the Claude plugin's approved square PNG", () => {
    const png = resolve(REPO, "plugins", "archlang", ".claude-plugin", "icon.png");
    expect(existsSync(png)).toBe(true);
    const b = readFileSync(png);
    expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(b.readUInt32BE(16)).toBe(b.readUInt32BE(20)); // IHDR width == height
  });
});
