/**
 * The `archlang://capabilities` resource (card RM5.1): generated, never hand-written. Both servers
 * serve the same text.
 *
 * - **Drift.** The committed `packages/mcp/capabilities.md` is exactly what
 *   `scripts/gen-capabilities.ts` renders (refresh with `npm run gen:mcp-capabilities`;
 *   `check:drift` runs it too). That it is served byte-equal on `archlang://capabilities` is
 *   `resources.test.ts`'s pin, and the hosted Worker's is `worker.test.ts`'s.
 * - **Coverage.** Every tool both servers register, every tool only the hosted Worker adds, every
 *   export format, every CLI command and every `*_LIMIT` budget is on the page. Each is read here
 *   from its own source (the stdio server, `createHostedServer`, `buildManifest()`, the error
 *   catalogue, the Worker's limits), not from the generator, so an entry the generator stopped
 *   rendering, or a tool the Worker gains, fails.
 * - **Wording.** No promise of design, layout, furniture, IFC, BIM or 3D (the card's "do not"). One
 *   allowance, by ruling on PR #703: the `repair` tool's own title, "Repair furniture placement",
 *   is a factual title read off the registry, not a promise; only that one derived line may say
 *   "furniture".
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, ERROR_CATALOG, EXPORT_FORMATS } from "@chanmeng666/archlang";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { MCP_PER_PERIOD, RATE_PERIOD_SECONDS, SOURCE_CAP_BYTES } from "../../mcp-worker/src/limits.js";
import { createHostedServer } from "../../mcp-worker/src/server.js";
import { CAPABILITIES_PATH, renderCapabilities } from "../scripts/gen-capabilities.js";
import { INSTRUCTIONS, RESOURCE_DEFS, type ResourceName } from "../src/tools.js";
import { connect } from "./helpers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const committed = (): string => readFileSync(resolve(REPO, CAPABILITIES_PATH), "utf8").replace(/\r\n/g, "\n");

/** `tools/list` of the hosted Worker's server (placeholder assets: only the tool list is read). */
async function hostedTools() {
  const resources = Object.fromEntries(RESOURCE_DEFS.map(([name]) => [name, ""])) as Record<ResourceName, string>;
  const server = createHostedServer("https://example.test", {
    resources,
    viewerHtml: "",
    version: "0.0.0",
    renderVersion: "0",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "capabilities-test", version: "0.0.0" });
  await client.connect(clientSide);
  return (await client.listTools()).tools;
}

describe("archlang://capabilities", () => {
  it("the committed file is the generator's output", async () => {
    expect(committed()).toBe(await renderCapabilities());
  });

  it("lists every tool both servers register, in registration order, with its title", async () => {
    const { tools } = await (await connect()).listTools();
    const text = committed();
    let at = -1;
    for (const t of tools) {
      const i = text.indexOf(`\n- \`${t.name}\`: ${t.title}\n`);
      expect(i, `no line for tool ${t.name}`).toBeGreaterThan(at);
      at = i;
    }
    expect(text).toContain(`## Tools on both servers (${tools.length})`);
  });

  it("lists every tool only the hosted Worker registers, with its title and description", async () => {
    const shared = new Set((await (await connect()).listTools()).tools.map((t) => t.name));
    const hosted = await hostedTools();
    for (const name of shared)
      expect(
        hosted.map((t) => t.name),
        `the Worker lacks ${name}`,
      ).toContain(name);
    const only = hosted.filter((t) => !shared.has(t.name));
    expect(only.length, "the Worker adds no tool: drop or reword the hosted line").toBeGreaterThan(0);
    const text = committed();
    for (const t of only)
      expect(text, `hosted-only ${t.name}`).toContain(`- \`${t.name}\`: ${t.title}. ${t.description}`);
  });

  it("lists every export format, and every CLI command either as a tool or as a command line", async () => {
    const text = committed();
    for (const f of EXPORT_FORMATS) expect(text, f.id).toMatch(new RegExp(`^- \`${f.id}\`: `, "m"));
    const tools = new Set((await (await connect()).listTools()).tools.map((t) => t.name));
    const manifest = buildManifest("0.0.0");
    for (const c of manifest.commands) {
      if (tools.has(c.name)) continue;
      expect(text, c.name).toContain(`- \`${manifest.invoke} ${c.name}\`: `);
    }
  });

  it("states every *_LIMIT budget and the hosted caps it names in INSTRUCTIONS", () => {
    const text = committed();
    const budgets = Object.keys(ERROR_CATALOG).filter((c) => /^[EW]_\w+_LIMIT$/.test(c));
    expect(budgets.length).toBeGreaterThan(0);
    for (const c of budgets) expect(text, c).toContain(`- \`${c}\`: ${ERROR_CATALOG[c]!.message}`);
    expect(text).toContain(`over ${SOURCE_CAP_BYTES / 1024} KB with \`E_INPUT_TOO_LARGE\``);
    expect(text).toContain(`more than ${MCP_PER_PERIOD} requests in ${RATE_PERIOD_SECONDS} s gets \`E_RATE_LIMITED\``);
    expect(INSTRUCTIONS).toMatch(/\blimit\b/);
    expect(text).toContain("## Limits");
  });

  it("points to the image workflow and the edit-one-room guide on the docs site", () => {
    const text = committed();
    expect(text).toContain("https://archlang.uk/from-an-image");
    expect(text).toContain("https://archlang.uk/edit-one-room");
  });

  it("carries INSTRUCTIONS' loop, and INSTRUCTIONS names the resource", () => {
    const text = committed();
    for (const step of INSTRUCTIONS.split("\n").filter((l) => /^\d+\. /.test(l))) expect(text).toContain(step);
    expect(INSTRUCTIONS).toContain("archlang://capabilities");
  });

  it("promises no design, layout, furniture, IFC, BIM or 3D, but for the repair tool's own title", async () => {
    const repair = (await (await connect()).listTools()).tools.find((t) => t.name === "repair");
    // The one allowance (PR #703 ruling): the derived title line, exactly once.
    const allowed = `- \`repair\`: ${repair?.title}\n`;
    const text = committed();
    expect(text.split(allowed).length - 1, "the allowed repair line").toBe(1);
    const rest = text.replace(allowed, "");
    for (const re of [/\bdesign/i, /\blayout/i, /\bfurni/i, /\bIFC\b/, /\bBIM\b/, /\b3D\b/i])
      expect(re.test(rest), `${re} in the capabilities resource`).toBe(false);
  });
});
