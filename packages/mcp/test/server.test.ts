import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import { createServer, SHIM_VERSION } from "../src/server.js";

/** Link a fresh server to a client over the SDK's in-process transport. */
async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: "archlang-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** The first text-content block of a tool result, parsed as JSON. */
function payload(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  const block = content.find((c) => c.type === "text");
  return JSON.parse(block?.text ?? "{}");
}

const TINY = 'plan "Smoke" {\n  room at (0,0) size 4000x3000 label "Room"\n}\n';

/** Two storeys — the shape that used to come back as the ground floor alone. */
const TWO_STOREY = `plan "Stack" {
  level 1 "Ground floor" {
    room at (0,0) size 4000x3000 label "Living"
  }
  level 2 "First floor" {
    room at (0,0) size 4000x3000 label "Bedroom"
  }
}
`;

describe("archlang mcp server", () => {
  it("exposes the wrapping tools and resources", async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(
      ["compile", "complete", "describe", "fix", "lint", "repair", "score", "suggest", "validate"].sort(),
    );
    const resources = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(resources).toEqual([
      "archlang://context",
      "archlang://grammar",
      "archlang://intent-schema",
      "archlang://schema",
      "archlang://spec",
    ]);
  });

  it("compile returns SVG + diagnostics for a valid plan", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "compile", arguments: { source: TINY, format: "svg" } }));
    expect(out.ok).toBe(true);
    expect(out.format).toBe("svg");
    expect(typeof out.output).toBe("string");
    expect(out.output as string).toContain("<svg");
    expect(Array.isArray(out.diagnostics)).toBe(true);
  });

  it("compile reports errors as data (never throws) for a broken plan", async () => {
    const client = await connect();
    const out = payload(
      await client.callTool({ name: "compile", arguments: { source: 'plan "X" { room at (0,0) }' } }),
    );
    expect(out.ok).toBe(false);
    expect((out.diagnostics as unknown[]).length).toBeGreaterThan(0);
  });

  it("introduces itself with its REAL version, not a hardcoded literal", async () => {
    const client = await connect();
    // The handshake version was frozen at "0.2.0" through 0.2.1–0.2.2; deriving it from
    // package.json is what keeps it honest, so pin it to the package rather than to a string.
    expect(SHIM_VERSION).toBe(pkg.version);
    expect(client.getServerVersion()?.version).toBe(pkg.version);
  });

  it("compile returns every storey of a multi-storey plan, not just the ground floor", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "compile", arguments: { source: TWO_STOREY } }));
    expect(out.ok).toBe(true);
    const pages = out.pages as Array<{ level: number; name?: string; output: string }>;
    expect(pages.map((p) => p.level)).toEqual([1, 2]);
    expect(pages.map((p) => p.name)).toEqual(["Ground floor", "First floor"]);
    // `output` stays the lowest storey, so a level-unaware caller is unaffected.
    expect(out.output).toBe(pages[0]?.output);
    // Each storey is its own drawing: the upper floor is not a copy of the ground floor.
    expect(pages[1]?.output).not.toBe(pages[0]?.output);
  });

  it("compile --level renders one storey, and refuses one the plan lacks", async () => {
    const client = await connect();
    const one = payload(await client.callTool({ name: "compile", arguments: { source: TWO_STOREY, level: 2 } }));
    expect(one.ok).toBe(true);
    expect(one.level).toBe(2);
    expect(one.pages).toBeUndefined();
    const bad = payload(await client.callTool({ name: "compile", arguments: { source: TWO_STOREY, level: 7 } }));
    expect(bad.ok).toBe(false);
    expect(bad.levels).toEqual([1, 2]);
    expect(bad.output).toBeUndefined();
  });

  it("a single-storey compile carries no pages key", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "compile", arguments: { source: TINY } }));
    expect(out.ok).toBe(true);
    expect(out.pages).toBeUndefined();
  });

  it("describe returns rooms and totals", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "describe", arguments: { source: TINY } }));
    expect(out.ok).toBe(true);
    expect((out.rooms as unknown[]).length).toBe(1);
  });

  it("validate accepts an intent and passes a satisfied brief", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "validate", arguments: { source: TINY, intent: { rooms: 1 } } }));
    expect(out.ok).toBe(true);
    const intent = out.intent as Record<string, unknown>;
    expect(intent.ok).toBe(true);
    expect(intent.satisfied).toBe(intent.total);
    expect(Array.isArray(intent.feedback)).toBe(true);
  });

  it("validate fails when a gating intent assertion is missed", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "validate", arguments: { source: TINY, intent: { rooms: 3 } } }));
    expect(out.ok).toBe(false);
    const intent = out.intent as Record<string, unknown>;
    expect(intent.ok).toBe(false);
    const violations = intent.violations as Array<{ code: string; gate: boolean }>;
    expect(violations.some((v) => v.code === "E_INTENT_ROOM_COUNT" && v.gate === true)).toBe(true);
  });

  it("validate returns intentErrors (data) for a malformed intent", async () => {
    const client = await connect();
    const out = payload(
      await client.callTool({ name: "validate", arguments: { source: TINY, intent: { rooms: 2.5 } } }),
    );
    expect(out.ok).toBe(false);
    expect((out.intentErrors as unknown[]).length).toBeGreaterThan(0);
    expect(out.intent).toBeUndefined();
  });

  it("score meters a brief without gating", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "score", arguments: { source: TINY, brief: { rooms: 3 } } }));
    // A missed gating assertion → ok:false, but score still reports a fraction in [0,1].
    expect(out.ok).toBe(false);
    expect(typeof out.score).toBe("number");
    expect(out.score as number).toBeGreaterThanOrEqual(0);
    expect(out.score as number).toBeLessThanOrEqual(1);
    expect(out.total).toBe(1);
  });

  it("score returns intentErrors (data) for a malformed brief", async () => {
    const client = await connect();
    const out = payload(await client.callTool({ name: "score", arguments: { source: TINY, brief: { rooms: 2.5 } } }));
    expect(out.ok).toBe(false);
    expect((out.intentErrors as unknown[]).length).toBeGreaterThan(0);
  });

  it("serves the language spec resource", async () => {
    const client = await connect();
    const res = await client.readResource({ uri: "archlang://spec" });
    const text = (res.contents[0] as { text?: string }).text ?? "";
    expect(text.length).toBeGreaterThan(100);
  });

  it("serves the intent JSON schema resource", async () => {
    const client = await connect();
    const res = await client.readResource({ uri: "archlang://intent-schema" });
    const text = (res.contents[0] as { text?: string }).text ?? "";
    expect(text).toContain("roomsInclude");
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
