/**
 * Build the ArchLang MCP server as an MCPB bundle (`.mcpb`) — the one-click Claude
 * Desktop extension AND the artifact Smithery publishes for local stdio servers.
 *
 *   npm run build:mcpb          # → dist-mcpb/archlang-mcp-<version>.mcpb
 *
 * Self-contained: `src/server.ts` is bundled with esbuild together with the MCP SDK,
 * zod and the ArchLang core, so the user needs no network and no `npm install`. The five
 * baked resources sit beside the entry exactly as in the npm package's `dist/`.
 *
 * Nothing derived is retyped: the version and metadata come from `package.json` /
 * `server.json`, the resource list from `copy-resources.mjs`, the icon from the Claude
 * plugin, and the tool list from the BUNDLED server itself (an MCP `tools/list` over
 * stdio at build time) — so the manifest cannot disagree with what the bundle serves.
 *
 * Requires `npm run build` (the core's `dist/`) first. The packer is a pinned
 * `npx @anthropic-ai/mcpb@MCPB_CLI_VERSION` rather than a devDependency: it is needed
 * only here and in CI, and a pinned npx keeps the lockfile and the install small.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

/** Pinned MCPB CLI (published well before this pin; bump deliberately). */
export const MCPB_CLI_VERSION = "2.1.2";
/** The manifest schema generation this builder emits. */
export const MANIFEST_VERSION = "0.3";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, "..");
const REPO = resolve(MCP, "..", "..");
const OUT_ROOT = join(REPO, "dist-mcpb");
const ICON = join(REPO, "plugins", "archlang", ".claude-plugin", "icon.png");

export interface McpbTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface PackageMeta {
  name: string;
  version: string;
  description: string;
  keywords?: string[];
  license: string;
  author: string;
  homepage: string;
  repository: { url: string };
  bugs: { url: string };
  engines: { node: string };
}
interface ServerJsonMeta {
  description: string;
  websiteUrl?: string;
}

/** First sentence of a tool description: the manifest wants a one-liner, the server keeps the full text. */
const oneLine = (s: string): string => {
  const flat = s.replace(/\s+/g, " ").trim();
  const first = /^(.*?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
  if (first.length <= 200) return first;
  return `${first.slice(0, 200).replace(/\s+\S*$/, "")}…`;
};

/** `"Name <mail>"` → `{ name, email }`. */
function parseAuthor(a: string): { name: string; email?: string; url?: string } {
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(a);
  return m ? { name: (m[1] ?? "").trim(), email: m[2] } : { name: a.trim() };
}

/**
 * The manifest, as a pure function of the package metadata, `server.json` and the
 * server's real tool list. Key order is fixed, so the output is byte-stable.
 */
export function buildManifest(
  pkg: PackageMeta,
  serverJson: ServerJsonMeta,
  tools: McpbTool[],
  opts: { inputSchemas?: boolean } = {},
) {
  const author = parseAuthor(pkg.author);
  if (serverJson.websiteUrl) author.url = serverJson.websiteUrl;
  return {
    manifest_version: MANIFEST_VERSION,
    name: "archlang-mcp",
    display_name: "ArchLang",
    version: pkg.version,
    description: serverJson.description,
    long_description: pkg.description,
    author,
    repository: { type: "git", url: pkg.repository.url.replace(/^git\+/, "") },
    homepage: pkg.homepage,
    documentation: pkg.homepage,
    support: pkg.bugs.url,
    icon: "icon.png",
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: { command: "node", args: ["${__dirname}/server/index.js"] },
    },
    tools: tools.map((t) => ({
      name: t.name,
      description: oneLine(t.description ?? t.name),
      // Smithery's API requires each tool to carry an `inputSchema`; `mcpb validate` rejects the key.
      ...(opts.inputSchemas ? { inputSchema: t.inputSchema ?? { type: "object" } } : {}),
    })),
    keywords: pkg.keywords ?? [],
    license: pkg.license,
    compatibility: { platforms: ["darwin", "win32", "linux"], runtimes: { node: pkg.engines.node } },
  };
}

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer): number => {
  let c = 0xffffffff;
  for (const x of b) c = (CRC_TABLE[(c ^ x) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * A minimal, dependency-free zip writer (deflate, fixed 2020-01-01 timestamp, sorted
 * entries, so the bytes are a pure function of the contents). Used for the Smithery
 * variant, which `mcpb pack` cannot produce because it validates the manifest strictly.
 */
export function zipFiles(files: Array<{ name: string; data: Buffer }>): Buffer {
  const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const name = Buffer.from(f.name, "utf8");
    const comp = deflateRawSync(f.data);
    const crc = crc32(f.data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // UTF-8 names
    h.writeUInt16LE(8, 8); // deflate
    h.writeUInt16LE(DOS_DATE, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(f.data.length, 22);
    h.writeUInt16LE(name.length, 26);
    parts.push(h, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + comp.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** Every file under `root`, as forward-slash relative names. */
function walk(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(root, join(dir, e.name)) : [relative(root, join(dir, e.name)).split(/[\\/]/).join("/")],
  );
}

/** The resource copy list, extracted from `copy-resources.mjs` (the one place it is written). */
function resourceList(): Array<{ src: string; dest: string }> {
  const script = readFileSync(join(HERE, "copy-resources.mjs"), "utf8");
  const body = script.slice(script.indexOf("const RESOURCES"));
  const pairs = [...body.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map((m) => ({
    src: m[1] as string,
    dest: m[2] as string,
  }));
  if (pairs.length === 0) throw new Error("build-mcpb: no RESOURCES list found in copy-resources.mjs");
  return pairs;
}

/** Ask the bundled server for its tools over real stdio — the same path a host uses. */
async function listBundledTools(entry: string): Promise<McpbTool[]> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "build-mcpb", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry] }));
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const pkg = readJson<PackageMeta>(join(MCP, "package.json"));
  const serverJson = readJson<ServerJsonMeta>(join(MCP, "server.json"));

  const stage = join(OUT_ROOT, "bundle");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "server"), { recursive: true });

  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(MCP, "src", "server.ts")],
    outfile: join(stage, "server", "index.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    // The core's OPTIONAL lazy backends (resvg/pdfkit/clipper2) are never reached by the
    // server's tools; leave their dynamic imports alone, as the VS Code bundle does.
    external: ["@resvg/resvg-js", "pdfkit", "clipper2-wasm"],
    // Some bundled CJS dependencies call `require`; give the ESM output one.
    banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
    logLevel: "warning",
  });
  // `readShimVersion()` resolves `../package.json` from server/index.js → the bundle root.
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify({ name: pkg.name, version: pkg.version, type: "module", license: pkg.license }, null, 2)}\n`,
  );
  for (const { src, dest } of resourceList()) copyFileSync(join(REPO, src), join(stage, "server", dest));
  copyFileSync(ICON, join(stage, "icon.png"));
  copyFileSync(join(REPO, "LICENSE"), join(stage, "LICENSE"));

  const tools = await listBundledTools(join(stage, "server", "index.js"));
  const manifest = buildManifest(pkg, serverJson, tools);
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const out = join(OUT_ROOT, `archlang-mcp-${pkg.version}.mcpb`);
  rmSync(out, { force: true });
  // One command string (not argv + shell:true): Windows needs the shell for npx.cmd.
  const q = (a: string): string => JSON.stringify(a);
  for (const args of [
    ["validate", join(stage, "manifest.json")],
    ["pack", stage, out],
  ]) {
    const r = spawnSync(`npx --yes @anthropic-ai/mcpb@${MCPB_CLI_VERSION} ${args.map(q).join(" ")}`, {
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) throw new Error(`mcpb ${args[0]} failed (exit ${r.status})`);
  }
  // The Smithery variant: same files, but the manifest's tools carry `inputSchema`.
  const smithery = join(OUT_ROOT, `archlang-mcp-${pkg.version}.smithery.mcpb`);
  const variant = buildManifest(pkg, serverJson, tools, { inputSchemas: true });
  const entries = walk(stage)
    .filter((n) => n !== "manifest.json")
    .map((n) => ({ name: n, data: readFileSync(join(stage, n)) }));
  entries.push({ name: "manifest.json", data: Buffer.from(`${JSON.stringify(variant, null, 2)}\n`) });
  writeFileSync(smithery, zipFiles(entries));
  console.log(`build-mcpb: ${smithery} (${statSync(smithery).size} bytes)`);
  console.log(`build-mcpb: ${out} (${statSync(out).size} bytes, ${tools.length} tools)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
