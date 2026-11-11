/**
 * Generate `packages/mcp/capabilities.md`, the `archlang://capabilities` resource: every tool this
 * server registers, every CLI command no tool serves, the export formats, what ArchLang does not
 * do, and the authoring loop. Run with `npm run gen:mcp-capabilities`.
 *
 * Nothing in it is retyped. The tool half is `tools/list` of a server built by `registerTools`
 * (`../src/tools.ts`), in registration order, with each tool's title, annotations and `compile`'s
 * format enum; the CLI half is `buildManifest()` (`src/manifest.ts`) and `EXPORT_FORMATS`; the loop
 * is the numbered lines of `INSTRUCTIONS`; the two guide links are the docs pages' own H1s, at the
 * route `docs-site/sync-docs.mjs`'s `PAGES` table gives them under the root package's `homepage`.
 * Only the headings and the sentences that join the lists are written here.
 *
 * The generator runs from source under tsx with `tsconfig.gen.json`, which maps the core's package
 * name to `src/index.ts` (as `vitest.config.ts` does), so it needs no `npm run build`.
 * `packages/mcp/test/capabilities.test.ts` regenerates it in memory and compares it with the
 * committed file; `check:drift` runs it too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, EXPORT_FORMATS } from "@chanmeng666/archlang";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCTIONS, registerTools } from "../src/tools.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
/** The committed artifact, repo-relative. */
export const CAPABILITIES_PATH = "packages/mcp/capabilities.md";
/** The two guides the resource points to (card RM5.1): reading an image, and editing one room. */
export const GUIDES = ["docs/from-an-image.md", "docs/edit-one-room.md"] as const;

const read = (rel: string): string => readFileSync(resolve(REPO, rel), "utf8").replace(/\r\n/g, "\n");

interface ListedTool {
  name: string;
  title?: string;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean; destructiveHint?: boolean };
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
}

/** `tools/list` of the shared registry, as a host sees it. */
async function listTools(): Promise<ListedTool[]> {
  const server = new McpServer({ name: "archlang", version: "0.0.0" });
  registerTools(server, { loadLinks: async () => ({ ok: false, error: "not loaded by the generator" }) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "gen-capabilities", version: "0.0.0" });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  await client.close();
  return tools as unknown as ListedTool[];
}

/** A docs page's public URL and H1, from the docs site's `PAGES` table and the page itself. */
function guide(rel: string): { title: string; url: string } {
  const sync = read("docs-site/sync-docs.mjs");
  const row = new RegExp(`\\[\\s*"${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*,\\s*"([^"]+)\\.md"\\s*\\]`).exec(
    sync,
  );
  if (!row) throw new Error(`${rel} has no row in the PAGES table of docs-site/sync-docs.mjs`);
  const title = /^# (.+)$/m.exec(read(rel))?.[1];
  if (!title) throw new Error(`${rel} has no H1`);
  const home = (JSON.parse(read("package.json")) as { homepage: string }).homepage.replace(/\/$/, "");
  return { title, url: `${home}/${row[1]}` };
}

/** The first sentence of a page's first paragraph after its H1. */
function firstSentence(rel: string): string {
  const body = read(rel)
    .split("\n# ")[0]!
    .replace(/^# .+\n+/, "");
  const para = body.split(/\n\s*\n/)[0]!.replace(/\s*\n\s*/g, " ");
  const m = /^.+?[.!?](?=\s|$)/.exec(para);
  if (!m) throw new Error(`${rel}: no first sentence`);
  return m[0];
}

const ids = (xs: readonly string[]): string => xs.map((x) => `\`${x}\``).join(", ");

/** The resource's exact text (LF, one trailing newline). */
export async function renderCapabilities(): Promise<string> {
  const tools = await listTools();
  const manifest = buildManifest("0.0.0");
  const invoke = manifest.invoke;
  const toolNames = new Set(tools.map((t) => t.name));

  const compile = tools.find((t) => t.name === "compile");
  const viaCompile = (compile?.inputSchema.properties?.format?.enum ?? []).map(String);
  if (viaCompile.length === 0) throw new Error("compile declares no format enum");
  const cliOnly = EXPORT_FORMATS.map((f) => f.id).filter((id) => !viaCompile.includes(id));
  const optional = EXPORT_FORMATS.filter((f) => !f.zeroDep);

  const readOnly = tools.every(
    (t) =>
      t.annotations?.readOnlyHint === true &&
      t.annotations.destructiveHint === false &&
      t.annotations.openWorldHint === false,
  );
  if (!readOnly) throw new Error("a tool is no longer read-only and closed-world: reword the line that says so");

  const loop = INSTRUCTIONS.split("\n").filter((l) => /^\d+\. /.test(l));
  if (loop.length === 0) throw new Error("INSTRUCTIONS has no numbered loop");

  const [image, oneRoom] = GUIDES.map(guide) as [{ title: string; url: string }, { title: string; url: string }];

  const lines = [
    "# What ArchLang can and cannot do",
    "",
    "ArchLang compiles `.arch` text to floor-plan drawings and checks them. This page is generated from this server's tool list and the CLI manifest.",
    "",
    `## Tools on this server (${tools.length})`,
    "",
    ...tools.map((t) => `- \`${t.name}\`: ${t.title ?? ""}`.trimEnd()),
    "",
    "## The loop",
    "",
    ...loop,
    "",
    `- ${image.title}: ${image.url}`,
    `- ${oneRoom.title}: ${oneRoom.url}`,
    "",
    "## Export formats",
    "",
    ...EXPORT_FORMATS.map(
      (f) =>
        `- \`${f.id}\`: ${f.zeroDep ? "no dependency" : `needs the optional \`${"optionalDep" in f ? f.optionalDep : ""}\``}${viaCompile.includes(f.id) ? "" : ", CLI only"}`,
    ),
    "",
    `\`compile\` on this server returns ${ids(viaCompile)}${viaCompile.includes("png") ? " (`png` only where its optional renderer is installed, never on the hosted server)" : ""}.`,
    "",
    "## What it does not do",
    "",
    `- ${firstSentence(GUIDES[0])} Text is the only input; the first guide above says how an assistant that sees images writes the text.`,
    `- No tool writes a file or reaches anything outside the server: each returns text${viaCompile.includes("png") ? " (or, for `png`, an image)" : ""}.`,
    ...(cliOnly.length > 0 ? [`- ${ids(cliOnly)} come only from the CLI, not from \`compile\` here.`] : []),
    ...(optional.length > 0
      ? [`- ${ids(optional.map((f) => f.id))} need an optional dependency the zero-dependency core does not install.`]
      : []),
    "",
    "## CLI commands no tool serves",
    "",
    `With a shell, \`${invoke} <cmd>\` (or \`npx -y @chanmeng666/archlang <cmd>\`) runs these too:`,
    "",
    ...manifest.commands.filter((c) => !toolNames.has(c.name)).map((c) => `- \`${invoke} ${c.name}\`: ${c.summary}`),
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const text = await renderCapabilities();
  writeFileSync(resolve(REPO, CAPABILITIES_PATH), text);
  process.stdout.write(`✓ generated ${CAPABILITIES_PATH} (${Buffer.byteLength(text)} bytes)\n`);
}

// Only write when run directly (the drift test imports `renderCapabilities`).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("packages/mcp/scripts/gen-capabilities.ts")) await main();
