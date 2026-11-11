/**
 * The hosted server's `McpServer`: the stdio server's tool set and resources (one registry,
 * `packages/mcp/src/tools.ts`), plus what only a hosted, HTTP-reachable server has — the
 * `read_me` tool, the MCP App viewer that `compile` links to, and `/svg/` image URLs.
 *
 * Built fresh for every request: the Worker is stateless (no sessions, no sign-in), so nothing
 * outlives the request that created it.
 */
import { RESOURCE_MIME_TYPE, RESOURCE_URI_META_KEY, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  INSTRUCTIONS,
  type ResourceName,
  registerResources,
  registerTools,
  TOOL_ANNOTATIONS,
} from "../../mcp/src/tools.js";
import { MCP_PER_PERIOD, RATE_PERIOD_SECONDS, SOURCE_CAP_BYTES, SVG_PER_PERIOD } from "./limits.js";

/** What the Worker serves that it cannot read at run time (it has no filesystem): bundled at build. */
export interface HostedAssets {
  /** The six `archlang://` resource texts, keyed by name. */
  resources: Readonly<Record<ResourceName, string>>;
  /** The viewer page, one self-contained HTML document. */
  viewerHtml: string;
  /** This Worker's version, for the MCP handshake. */
  version: string;
  /**
   * What decides the bytes of a drawing: the core's version plus a hash of the bundled core
   * (`1.42.1-3fa9c2d1`). It keys the edge cache and names the one immutable image path,
   * `/v/<renderVersion>/svg/<payload>`, so a core change can never serve an old drawing.
   */
  renderVersion: string;
}

/** The MCP App the `compile` tool's results open in (spec: `ui://` scheme, one HTML page). */
export const VIEWER_URI = "ui://archlang/viewer";

/** What `compile` says about `format:"png"` here: there is no renderer in a Worker. */
export const PNG_HOSTED =
  'format "png" is unavailable on the hosted server, which has no image renderer: use format "svg", or GET /svg/<payload> on this server for an image URL.';

/** The `read_me` tool's text: what this server is, how to use it, and what it keeps. */
export function readMe(origin: string): string {
  return [
    "# ArchLang, hosted",
    "",
    "ArchLang is a small language for floor plans: write `.arch` text, compile it to an SVG drawing, and check it with the same tools a person would use.",
    "",
    INSTRUCTIONS,
    "",
    "## This server",
    "",
    `- The same tools as the npm server (\`npx -y @chanmeng666/archlang-mcp\`), over Streamable HTTP at ${origin}/mcp. No sign-in, no sessions: every request stands alone.`,
    `- Any tool argument (a source, \`plan_json\`, an intent) larger than ${SOURCE_CAP_BYTES / 1024} KB is refused with \`E_INPUT_TOO_LARGE\` before anything is compiled, and an address that sends more than ${MCP_PER_PERIOD} requests to /mcp (or ${SVG_PER_PERIOD} new images) in ${RATE_PERIOD_SECONDS} s gets \`E_RATE_LIMITED\`. The CLI and the npm server have neither limit.`,
    '- `compile` with format "png" is not available here; format "svg" is.',
    `- An image URL for a plan: call \`link\`, take the text after \`#z=\` in its \`embed\` URL, and GET ${origin}/svg/<that text>. It answers \`image/svg+xml\`, the same bytes \`compile\` returns, fresh for five minutes: when the compiler changes, the drawing at that URL follows it. Its \`Content-Location\` names the pinned copy, \`/v/<render version>/svg/<payload>\`, which keeps the same bytes and may be cached until the next release of this server; after that it redirects to the unpinned URL. Unlike a playground link, whose plan stays in the \`#\` fragment and never reaches a server, an /svg/ URL sends the plan to this server in its path.`,
    `- Hosts that support MCP Apps show \`compile\` results in a viewer (pan and zoom, plus the lint findings); every other host gets the same result as text.`,
    "- The server keeps no source and no request body, and logs neither. It stores only the rendered SVG of each /svg/ URL, in Cloudflare's edge cache. Each MCP call is counted by its method and tool name, from fixed lists; nothing else is recorded.",
  ].join("\n");
}

/** Build the server for one request. `origin` is where this Worker answers (for `read_me`). */
export function createHostedServer(origin: string, assets: HostedAssets): McpServer {
  const server = new McpServer({ name: "archlang", version: assets.version }, { instructions: INSTRUCTIONS });

  registerTools(server, {
    loadLinks: () => import("@chanmeng666/archlang/link"),
    pngUnavailable: PNG_HOSTED,
    // As `registerAppTool` (ext-apps) writes it: the current key and the deprecated flat one.
    compileMeta: { ui: { resourceUri: VIEWER_URI }, [RESOURCE_URI_META_KEY]: VIEWER_URI },
  });
  registerResources(server, assets.resources);

  registerAppResource(
    server,
    "viewer",
    VIEWER_URI,
    {
      title: "ArchLang plan viewer",
      description:
        "Shows a `compile` result: the drawing with pan and zoom, and the plan's lint findings. Text-only hosts read the same result as JSON.",
    },
    async () => ({
      contents: [
        {
          uri: VIEWER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: assets.viewerHtml,
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    }),
  );

  server.registerTool(
    "read_me",
    {
      title: "How to use this server",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Explain this hosted ArchLang server in one short page: the authoring loop, the size cap, what is unavailable here, how to get an image URL for a plan, and what the server keeps (nothing). Call it first when unsure.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text" as const, text: readMe(origin) }] }),
  );

  return server;
}
