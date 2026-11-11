/**
 * ArchLang MCP server — a thin stdio Model Context Protocol shim over the
 * `@chanmeng666/archlang` LIBRARY (never a subprocess of the CLI). Every tool
 * wraps one pure, exported function; the core stays zero-dependency — the MCP SDK
 * lives ONLY in this package.
 *
 * Positioning (ADR 0012): the agent-native `archlang` CLI remains the primary
 * interface — it costs nothing in an agent's context window until it is called,
 * whereas an MCP tool schema sits in the window permanently. This server exists so
 * MCP-speaking hosts can *discover* ArchLang through the registry; it is the
 * discoverability channel, not a replacement for the CLI.
 *
 * This file is the stdio host: it reads the six resources from disk and starts the stdio
 * transport. The tools themselves live in `tools.ts`, which the hosted HTTP Worker
 * (`packages/mcp-worker`) registers too.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  INSTRUCTIONS,
  JSON_PAGES_NEED_NEWER_CORE,
  type LinkUnavailable,
  PNG_NEEDS_NEWER_CORE,
  pngDependencyDiagnostic,
  registerResources,
  registerTools,
} from "./tools.js";

export {
  INSTRUCTIONS,
  JSON_PAGES_NEED_NEWER_CORE,
  type LinkUnavailable,
  PNG_NEEDS_NEWER_CORE,
  pngDependencyDiagnostic,
};

const HERE = dirname(fileURLToPath(import.meta.url));
// Repo root when the server runs from src/ (tests); irrelevant but harmless from dist/.
const REPO = resolve(HERE, "..", "..", "..");

/** Read a shipped resource: flat next to the built server (dist/), else the repo tree. */
function readResource(flat: string, repoRel: string): string {
  for (const p of [resolve(HERE, flat), resolve(REPO, repoRel)]) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return `(${flat} not found — run \`npm run mcp:build\`)`;
}

/**
 * This shim's own version, for the MCP handshake — **derived, never retyped**. It was a
 * hardcoded literal through 0.2.1–0.2.2, so the published server introduced itself as
 * "0.2.0" and a host had no reliable way to tell which shim it was talking to. Mirrors the
 * core's `readVersion()` (`src/cli/io.ts`): `../package.json` resolves from both `dist/`
 * (the packed artifact — npm always includes package.json) and `src/` (the tests).
 */
function readShimField(pick: (pkg: any) => unknown, fallback: string): string {
  for (const rel of ["../package.json", "../../package.json"]) {
    const p = resolve(HERE, rel);
    if (existsSync(p)) {
      try {
        const v = pick(JSON.parse(readFileSync(p, "utf8")));
        if (typeof v === "string") return v;
      } catch {
        /* fall through to the next candidate */
      }
    }
  }
  return fallback;
}
export const SHIM_VERSION = readShimField((pkg) => pkg.version, "0.0.0");

/**
 * The core this shim was released against, from its own dependency range (`^1.x.y` → `1.x.y`).
 * The lockstep test holds that range to the core that first exports `./link`, so this is the
 * version to name when an older core is installed under the shim.
 */
const CORE_MIN = readShimField((pkg) => pkg.dependencies?.["@chanmeng666/archlang"], "").replace(/^[\^~]/, "");

/**
 * Load the share-link minter on first use, not at startup. The rest of the server needs only the
 * core's main entry, so a host that resolved an older core without `./link` keeps ten working
 * tools and gets this as data from `link`, instead of a server that dies at load.
 *
 * Two failures are data, told apart by Node's error code: `ERR_PACKAGE_PATH_NOT_EXPORTED` is a
 * core too old to export `./link` (the fix is a newer core), `ERR_MODULE_NOT_FOUND` is a core that
 * exports it but whose file is missing (the fix is a reinstall). Anything else is a bug and throws.
 */
export async function loadPlanLinks(
  importer: () => Promise<typeof import("@chanmeng666/archlang/link")> = () => import("@chanmeng666/archlang/link"),
): Promise<typeof import("@chanmeng666/archlang/link") | LinkUnavailable> {
  try {
    return await importer();
  } catch (e) {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (code === "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      const need = CORE_MIN ? ` >= ${CORE_MIN}` : " with the ./link export";
      return { ok: false, error: `link needs @chanmeng666/archlang${need}; the installed core has no ./link export` };
    }
    if (code === "ERR_MODULE_NOT_FOUND") {
      const detail = String(message ?? "").split("\n")[0];
      return {
        ok: false,
        error: `link could not load @chanmeng666/archlang/link; the core install looks incomplete, reinstall it (${detail})`,
      };
    }
    throw e;
  }
}

/** Build the fully-configured ArchLang MCP server (tools + resources). */
export function createServer(): McpServer {
  const server = new McpServer({ name: "archlang", version: SHIM_VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, { loadLinks: () => loadPlanLinks() });
  // Resources: the static context artifacts, read once at server start.
  registerResources(server, {
    spec: readResource("spec.llm.md", "spec.llm.md"),
    context: readResource("llms-full.txt", "llms-full.txt"),
    schema: readResource("plan.schema.json", "schemas/plan.schema.json"),
    grammar: readResource("archlang.gbnf", "grammars/archlang.gbnf"),
    "intent-schema": readResource("intent.schema.json", "schemas/intent.schema.json"),
    capabilities: readResource("capabilities.md", "packages/mcp/capabilities.md"),
  });
  return server;
}

/** Start the server over stdio (the bin entry). */
async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

// Run only when executed directly as the bin — not when imported by a test.
// realpath both sides so a `node_modules/.bin` symlink still matches.
const invokedDirectly = (() => {
  try {
    return (
      process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();
if (invokedDirectly) void main();
