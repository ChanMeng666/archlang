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
 *   rendering, or a tool the Worker gains, fails. Every code a fix producer declares
 *   (`FIX_PRODUCERS`, `src/fixable-codes.ts`, card AF8) is on the line of each applicability it
 *   declares, marked (CLI) exactly when it is not a `compile` fix, and a `lint` fix put to the `fix`
 *   tool shows the tool cannot reach it.
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
import { FIX_PRODUCERS } from "../../../src/fixable-codes.js";
import { INSTRUCTIONS, RESOURCE_DEFS, type ResourceName } from "../src/tools.js";
import { call, connect } from "./helpers.js";

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

  it("lists every code a fix producer declares under each applicability it declares, (CLI) unless a compile fix", () => {
    const text = committed();
    const start = text.indexOf("\n## What `fix` resolves\n");
    expect(start, "no section on what `fix` resolves").toBeGreaterThan(0);
    const section = text.slice(start + 1, text.indexOf("\n## ", start + 1));
    /** The items of the line for `a`: `code` → the item as written (`` `E_X` `` or `` `W_Y` (CLI) ``). */
    const items = (a: string): Map<string, string> => {
      const line = section.split("\n").find((l) => l.startsWith(`- \`${a}\`, `));
      expect(line, `no line for ${a}`).toBeDefined();
      const list = line!.slice(line!.indexOf(": ") + 2).split(", ");
      return new Map(list.map((item) => [/^`([EW]_[A-Z0-9_]+)`/.exec(item)?.[1] ?? item, item]));
    };
    const want = new Map<string, Map<string, string>>();
    for (const p of FIX_PRODUCERS)
      for (const a of p.applicability)
        for (const code of Object.keys(p.codes)) {
          const m = want.get(a) ?? new Map<string, string>();
          m.set(code, `\`${code}\`${p.stage === "compile" ? "" : " (CLI)"}`);
          want.set(a, m);
        }
    expect(want.size).toBeGreaterThan(0);
    for (const [a, codes] of want) expect([...items(a)].sort(), a).toEqual([...codes].sort());
    // No other applicability line.
    expect(section.split("\n").filter((l) => l.startsWith("- ")).length).toBe(want.size);
  });

  it("the fix tool leaves a lint fix alone, which is what (CLI) says", async () => {
    // W_SWING_OBSTRUCTED's hinge flip is a `lint` fix: `archlang fix` applies it, the tool never sees it.
    const source = [
      'plan "P" {',
      "  units mm",
      "  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }",
      '  room id=r at (0,0) size 6000x4000 label "Room"',
      "  door at (3000,4000) width 1000 wall exterior hinge left swing in",
      '  furniture box at (3400,2900) size 600x500 label "X"',
      "}",
    ].join("\n");
    expect(FIX_PRODUCERS.find((p) => Object.hasOwn(p.codes, "W_SWING_OBSTRUCTED"))?.stage).toBe("lint");
    const client = await connect();
    expect(JSON.stringify(await call(client, "lint", { source }))).toContain("door-swing-obstructed");
    const out = await call(client, "fix", { source, unsafe: true });
    expect(out.applied).toEqual([]);
    expect(out.source).toBe(source);
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
