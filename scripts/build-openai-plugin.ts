/**
 * Assemble the ZIP the OpenAI plugin directory (Codex and ChatGPT) takes, from the generated
 * plugin folder `plugins/archlang/`:
 *
 *   npm run build:openai-plugin     # → dist-openai/archlang-plugin-<core version>.zip
 *   npm run prove:openai-plugin     # re-open that ZIP and check it (or name one: -- path.zip)
 *
 * `-- --plugin-version=<version>` names the listing's version when it updates between core
 * releases: the directory needs a new version, and the skills must still pin a CLI that is on npm.
 *
 * The ZIP holds, at its root, the portable "Agent Plugins" layout the directory reads
 * (https://developers.openai.com/plugins/build/plugins): `plugin.json` with the listing under
 * `extensions["com.openai"]`, `mcp.json`, `skills/` and `assets/icon.png`. It differs from the
 * folder in three ways, all on purpose:
 *   - `plugin.json` gains `"version"` (the core's, root `package.json`, unless named), which final
 *     submission requires and every update must change; the repository's manifest names no version.
 *   - `mcp.json` declares the hosted server (Streamable HTTP, no sign-in), because a public
 *     submission takes a remote HTTPS server and excludes a local one; the repository's keeps the
 *     local `npx` server that Copilot CLI and Cursor start (PNG, offline use).
 *   - each skill's install commands name the core's version, because the directory's scan flags an
 *     unpinned package as a mutable source, and a reviewed skill should run the CLI it was written
 *     for; the repository's skills name no version.
 * `.claude-plugin/`, `.cursor-plugin/` and `rules/` are other hosts' files and stay out.
 *
 * The folder must be in sync with its generators first (`npm run gen:all`); a stale folder is
 * refused rather than zipped. The archive is deterministic (sorted entries, fixed timestamp: the
 * MCPB builder's `zipFiles`), and it is written to the gitignored `dist-openai/`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { inflateRawSync } from "node:zlib";
import { zipFiles } from "../packages/mcp/scripts/build-mcpb.js";
import {
  hostedMcpManifest,
  ICON_SOURCE,
  MCP_MANIFEST,
  mcpManifest,
  PLUGIN_ICON,
  PLUGIN_ROOT,
  PORTABLE_MANIFEST,
  portableManifest,
} from "./gen-agent-manifests.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT_DIR = "dist-openai";
/** Plugin-root paths that belong to other hosts and never enter the ZIP. */
export const ZIP_EXCLUDED = [".claude-plugin/", ".cursor-plugin/", "rules/"] as const;

export const coreVersion = (): string =>
  (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;
export const zipName = (version: string): string => `archlang-plugin-${version}.zip`;

const bytes = (rel: string): Buffer => readFileSync(join(ROOT, rel));

/** Every file under `<PLUGIN_ROOT>/skills`, as plugin-root-relative names with `/`. */
function skillFiles(): string[] {
  const root = join(ROOT, PLUGIN_ROOT);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [relative(root, join(dir, e.name)).split(/[\\/]/).join("/")],
    );
  return walk(join(root, "skills")).sort();
}

/** The `version` field placed right after `name`, so the manifest reads like a package's. */
function withVersion(manifestText: string, version: string): string {
  const m = JSON.parse(manifestText) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    out[k] = v;
    if (k === "name") out.version = version;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** A command that installs or runs the core CLI, with no version named. */
const UNPINNED_CLI = /\b(npx -y|npm i -g) @chanmeng666\/archlang(?![\w@-])/g;

/** A skill as the ZIP carries it: its CLI install commands pinned to `version`. */
export function pinSkill(skill: string, version: string): string {
  return skill.replace(UNPINNED_CLI, `$1 @chanmeng666/archlang@${version}`);
}

/** Refuse a plugin folder that is not what the generators write (run `npm run gen:all`). */
function assertFolderInSync(): void {
  const stale: string[] = [];
  if (bytes(PORTABLE_MANIFEST).toString("utf8") !== portableManifest()) stale.push(PORTABLE_MANIFEST);
  if (bytes(MCP_MANIFEST).toString("utf8") !== mcpManifest()) stale.push(MCP_MANIFEST);
  if (!bytes(PLUGIN_ICON).equals(bytes(ICON_SOURCE))) stale.push(PLUGIN_ICON);
  // `<PLUGIN_ROOT>/skills/<name>/SKILL.md` is a copy of the repository's `skills/<name>/SKILL.md`
  for (const f of skillFiles()) if (!bytes(`${PLUGIN_ROOT}/${f}`).equals(bytes(f))) stale.push(`${PLUGIN_ROOT}/${f}`);
  if (stale.length > 0)
    throw new Error(`build-openai-plugin: stale generated files (run \`npm run gen:all\`): ${stale.join(", ")}`);
}

/** The ZIP's entries: name → bytes. */
export function openaiPluginFiles(
  version = coreVersion(),
  cliVersion = coreVersion(),
): Array<{ name: string; data: Buffer }> {
  assertFolderInSync();
  return [
    { name: "plugin.json", data: Buffer.from(withVersion(portableManifest(), version), "utf8") },
    { name: "mcp.json", data: Buffer.from(hostedMcpManifest(), "utf8") },
    { name: "assets/icon.png", data: bytes(PLUGIN_ICON) },
    ...skillFiles().map((f) => ({
      name: f,
      data: Buffer.from(pinSkill(bytes(`${PLUGIN_ROOT}/${f}`).toString("utf8"), cliVersion), "utf8"),
    })),
  ];
}

export function buildOpenaiZip(version = coreVersion(), cliVersion = coreVersion()): Buffer {
  return zipFiles(openaiPluginFiles(version, cliVersion));
}

/**
 * Read a ZIP's entries back through its central directory (stored or deflated entries, no
 * zip64), independently of the writer, so the check below sees what an unzipper would.
 */
export function readZip(zip: Buffer): Map<string, Buffer> {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("readZip: no end-of-central-directory record");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("readZip: bad central directory entry");
    const method = zip.readUInt16LE(at + 10);
    const csize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`readZip: bad local header for ${name}`);
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataAt, dataAt + csize);
    const data = method === 8 ? inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : undefined;
    if (!data || data.length !== size) throw new Error(`readZip: cannot read ${name} (method ${method})`);
    out.set(name, data);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * The proof: the entry list is exactly the four kinds of file the directory reads, and the two
 * files the ZIP rewrites say what they must. Throws on the first mismatch.
 */
export function checkOpenaiZip(
  entries: Map<string, Buffer>,
  version = coreVersion(),
  cliVersion = coreVersion(),
): void {
  const fail = (msg: string): never => {
    throw new Error(`prove-openai-plugin: ${msg}`);
  };
  const names = [...entries.keys()].sort();
  const want = ["assets/icon.png", "mcp.json", "plugin.json", ...skillFiles()].sort();
  if (!isDeepStrictEqual(names, want)) fail(`entries ${JSON.stringify(names)} != ${JSON.stringify(want)}`);
  for (const n of names) {
    if (n.includes("\\") || n.startsWith("/") || n.split("/").includes(".."))
      fail(`entry path ${n} is not a relative /-path`);
    if (ZIP_EXCLUDED.some((x) => n.startsWith(x))) fail(`entry ${n} belongs to another host`);
  }
  const manifest = JSON.parse(entries.get("plugin.json")!.toString("utf8")) as Record<string, unknown>;
  if (manifest.version !== version) fail(`plugin.json version ${String(manifest.version)} != ${version}`);
  if (Object.keys(manifest).indexOf("version") !== Object.keys(manifest).indexOf("name") + 1)
    fail("plugin.json `version` does not follow `name`");
  const { version: _v, ...rest } = manifest;
  if (!isDeepStrictEqual(rest, JSON.parse(portableManifest())))
    fail("plugin.json differs from the generated manifest by more than `version`");
  const mcp = JSON.parse(entries.get("mcp.json")!.toString("utf8"));
  const servers = Object.keys(mcp.mcpServers ?? {});
  if (servers.length !== 1 || servers[0] !== "archlang") fail(`mcp.json servers ${JSON.stringify(servers)}`);
  if (!isDeepStrictEqual(mcp, JSON.parse(hostedMcpManifest()))) fail("mcp.json is not the hosted server");
  const server = mcp.mcpServers.archlang as Record<string, unknown>;
  if (server.type !== "streamable-http" || !String(server.url).startsWith("https://") || "headers" in server)
    fail(`mcp.json server ${JSON.stringify(server)} is not a header-free HTTPS Streamable HTTP server`);
  if (!entries.get("assets/icon.png")!.equals(bytes(ICON_SOURCE))) fail("assets/icon.png is not the plugin icon");
  for (const f of skillFiles()) {
    const skill = entries.get(f)!.toString("utf8");
    if (skill !== pinSkill(bytes(f).toString("utf8"), cliVersion))
      fail(`${f} differs from its source skills/ file by more than the pinned CLI version`);
    if (!skill.includes(`@chanmeng666/archlang@${cliVersion}`)) fail(`${f} names no pinned CLI`);
  }
}

/** The listing's version: `--plugin-version=<version>`, higher than the core's, or the core's. */
export function pluginVersion(argv: string[], core: string): string {
  const named = argv.find((a) => a.startsWith("--plugin-version="))?.slice("--plugin-version=".length);
  if (named === undefined) return core;
  const parts = (v: string) => v.split(".").map(Number);
  if (!/^\d+\.\d+\.\d+$/.test(named)) throw new Error(`build-openai-plugin: bad --plugin-version "${named}"`);
  const [a, b] = [parts(named), parts(core)];
  const i = a.findIndex((n, at) => n !== b[at]);
  if (i < 0 || a[i]! < b[i]!) throw new Error(`build-openai-plugin: --plugin-version ${named} is not above ${core}`);
  return named;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cliVersion = coreVersion();
  const version = pluginVersion(process.argv.slice(2), cliVersion);
  const prove = process.argv.includes("--prove");
  const named = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const path = named ? resolve(named) : join(ROOT, OUT_DIR, zipName(version));
  if (!prove) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buildOpenaiZip(version, cliVersion));
  }
  const entries = readZip(readFileSync(path));
  checkOpenaiZip(entries, version, cliVersion);
  for (const [name, data] of [...entries].sort(([a], [b]) => (a < b ? -1 : 1)))
    process.stdout.write(`${String(data.length).padStart(8)}  ${name}\n`);
  process.stdout.write(
    `${prove ? "prove" : "build"}-openai-plugin: ${relative(ROOT, path)} (${readFileSync(path).length} bytes, ${entries.size} entries, version ${version}, CLI ${cliVersion}) OK\n`,
  );
}
