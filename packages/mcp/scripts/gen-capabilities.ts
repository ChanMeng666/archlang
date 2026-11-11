/**
 * Generate `packages/mcp/capabilities.md`, the `archlang://capabilities` resource: every tool both
 * servers serve and the tools only the hosted one adds, every CLI command no tool serves, the export
 * formats, what ArchLang does not do, the limits, and the authoring loop. Run with
 * `npm run gen:mcp-capabilities`. Both servers serve the same text.
 *
 * Nothing in it is retyped. The shared tools are `tools/list` of a server built by `registerTools`
 * (`../src/tools.ts`), in registration order, with each tool's title, annotations and `compile`'s
 * format enum; the hosted-only tools are what `tools/list` of `createHostedServer`
 * (`packages/mcp-worker/src/server.ts`) adds to them, with their own titles and descriptions; the
 * CLI half is `buildManifest()` (`src/manifest.ts`) and `EXPORT_FORMATS`; the budgets are the
 * error catalogue's `*_LIMIT` codes with their messages, and the hosted caps are the Worker's own
 * constants (`packages/mcp-worker/src/limits.ts`), its png sentence and `server.json`'s remote; the
 * loop is the numbered lines of `INSTRUCTIONS`; the two guide links are the docs pages' own H1s, at
 * the route `docs-site/sync-docs.mjs`'s `PAGES` table gives them under the root package's
 * `homepage`. Only the headings and the sentences that join the lists are written here.
 *
 * The generator runs from source under tsx with `tsconfig.gen.json`, which maps the core's package
 * name (and its `./share` subpath, which the Worker's limits read) to the core's source (as
 * `vitest.config.ts` does), so it needs no `npm run build`.
 * `packages/mcp/test/capabilities.test.ts` regenerates it in memory and compares it with the
 * committed file; `check:drift` runs it too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, ERROR_CATALOG, EXPORT_FORMATS } from "@chanmeng666/archlang";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MCP_PER_PERIOD, RATE_PERIOD_SECONDS, SOURCE_CAP_BYTES } from "../../mcp-worker/src/limits.js";
import { createHostedServer, PNG_HOSTED } from "../../mcp-worker/src/server.js";
import { INSTRUCTIONS, RESOURCE_DEFS, type ResourceName, registerTools } from "../src/tools.js";

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
  description?: string;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean; destructiveHint?: boolean };
  inputSchema: { properties?: Record<string, { enum?: unknown[] }> };
}

/** `tools/list` of a server, as a host sees it. */
export async function listToolsOf(server: McpServer): Promise<ListedTool[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "gen-capabilities", version: "0.0.0" });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  await client.close();
  return tools as unknown as ListedTool[];
}

/** The shared registry: what both servers register through `registerTools`. */
export function sharedServer(): McpServer {
  const server = new McpServer({ name: "archlang", version: "0.0.0" });
  registerTools(server, { loadLinks: async () => ({ ok: false, error: "not loaded by the generator" }) });
  return server;
}

/** The hosted server's endpoint: the registry entry's one remote. */
export function hostedUrl(): string {
  const remotes = (JSON.parse(read("packages/mcp/server.json")) as { remotes?: Array<{ url: string }> }).remotes;
  const url = remotes?.[0]?.url;
  if (!url) throw new Error("packages/mcp/server.json declares no remote");
  return url;
}

/** The hosted Worker's server, with placeholder assets: only its tool list is read. */
export function hostedServer(): McpServer {
  const resources = Object.fromEntries(RESOURCE_DEFS.map(([name]) => [name, ""])) as Record<ResourceName, string>;
  return createHostedServer(new URL(hostedUrl()).origin, {
    resources,
    viewerHtml: "",
    version: "0.0.0",
    renderVersion: "0",
  });
}

/** A catalogued code, refused when the catalogue does not have it (never a typed-in code). */
function catalogued(code: string): string {
  if (!(code in ERROR_CATALOG)) throw new Error(`${code} is not in the error catalogue`);
  return code;
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
  const tools = await listToolsOf(sharedServer());
  const hosted = await listToolsOf(hostedServer());
  const manifest = buildManifest("0.0.0");
  const invoke = manifest.invoke;
  const toolNames = new Set(tools.map((t) => t.name));
  const hostedOnly = hosted.filter((t) => !toolNames.has(t.name));
  const missing = tools.filter((t) => !hosted.some((h) => h.name === t.name));
  if (missing.length > 0) throw new Error(`the hosted server lacks ${missing.map((t) => t.name).join(", ")}`);

  const compile = tools.find((t) => t.name === "compile");
  const viaCompile = (compile?.inputSchema.properties?.format?.enum ?? []).map(String);
  if (viaCompile.length === 0) throw new Error("compile declares no format enum");
  const cliOnly = EXPORT_FORMATS.map((f) => f.id).filter((id) => !viaCompile.includes(id));
  const optional = EXPORT_FORMATS.filter((f) => !f.zeroDep);

  const readOnly = hosted.every(
    (t) =>
      t.annotations?.readOnlyHint === true &&
      t.annotations.destructiveHint === false &&
      t.annotations.openWorldHint === false,
  );
  if (!readOnly) throw new Error("a tool is no longer read-only and closed-world: reword the line that says so");

  const loop = INSTRUCTIONS.split("\n").filter((l) => /^\d+\. /.test(l));
  if (loop.length === 0) throw new Error("INSTRUCTIONS has no numbered loop");

  const [image, oneRoom] = GUIDES.map(guide) as [{ title: string; url: string }, { title: string; url: string }];

  // Every budget and cap the catalogue names a `*_LIMIT` code for, with its message.
  const budgets = Object.keys(ERROR_CATALOG)
    .filter((c) => /^[EW]_\w+_LIMIT$/.test(c))
    .sort();
  if (budgets.length === 0) throw new Error("the error catalogue has no *_LIMIT code");

  const lines = [
    "# What ArchLang can and cannot do",
    "",
    "ArchLang compiles `.arch` text to floor-plan drawings and checks them. This page is generated from the tool list both MCP servers serve and the CLI manifest.",
    "",
    `## Tools on both servers (${tools.length})`,
    "",
    ...tools.map((t) => `- \`${t.name}\`: ${t.title ?? ""}`.trimEnd()),
    "",
    ...(hostedOnly.length > 0
      ? [
          `The hosted server (${hostedUrl()}) adds:`,
          "",
          ...hostedOnly.map((t) => `- \`${t.name}\`: ${t.title ?? ""}. ${t.description ?? ""}`.trimEnd()),
          "",
        ]
      : []),
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
    `\`compile\` returns ${ids(viaCompile)}${viaCompile.includes("png") ? " (`png` only where its optional renderer is installed)" : ""}.`,
    "",
    "## What it does not do",
    "",
    `- ${firstSentence(GUIDES[0])} Text is the only input; the first guide above says how an assistant that sees images writes the text.`,
    `- No tool writes a file or reaches anything outside the server: each returns text${viaCompile.includes("png") ? " (or, for `png`, an image)" : ""}.`,
    ...(cliOnly.length > 0 ? [`- ${ids(cliOnly)} come only from the CLI, not from \`compile\`.`] : []),
    ...(optional.length > 0
      ? [`- ${ids(optional.map((f) => f.id))} need an optional dependency the zero-dependency core does not install.`]
      : []),
    `- ${PNG_HOSTED.charAt(0).toUpperCase()}${PNG_HOSTED.slice(1)}`,
    "",
    "## Limits",
    "",
    `- Work is counted, never timed: past a budget the work stops with a catalogued code, and \`${invoke} explain <code>\` gives its numbers:`,
    ...budgets.map((c) => `  - \`${c}\`: ${ERROR_CATALOG[c]!.message}`),
    `- The hosted server refuses any one tool argument over ${SOURCE_CAP_BYTES / 1024} KB with \`${catalogued("E_INPUT_TOO_LARGE")}\` before compiling anything, and answers an address at most ${MCP_PER_PERIOD} requests per ${RATE_PERIOD_SECONDS} s, then \`${catalogued("E_RATE_LIMITED")}\`. The npm server and the CLI have neither cap.`,
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
