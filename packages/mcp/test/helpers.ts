/**
 * Shared test harness for the MCP shim's suites.
 *
 * The server is exercised the way a real host does — over the SDK's in-process
 * `InMemoryTransport` linked pair — never by calling the handler functions
 * directly. That is deliberate: the thing under test is the *wiring* (tool
 * registration, zod input schemas, the text-content projection), not the core
 * functions, which have their own suites at the repo root.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

/** Link a fresh server to a client over the SDK's in-process transport. */
export async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: "archlang-mcp-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** The first text-content block of a tool result, parsed as JSON. */
export function payload(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  const block = content.find((c) => c.type === "text");
  return JSON.parse(block?.text ?? "{}");
}

/** Call one tool on a connected client and parse its JSON payload. */
export async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return payload(await client.callTool({ name, arguments: args }));
}

/** The `code` of every diagnostic in a tool payload's `diagnostics` array. */
export function codes(out: Record<string, unknown>): string[] {
  return ((out.diagnostics as Array<{ code?: string }> | undefined) ?? []).map((d) => d.code ?? "");
}

// ---------------------------------------------------------------------------
// fixtures — real `.arch` sources, kept here so several suites share one plan
// ---------------------------------------------------------------------------

/** The smallest thing that compiles: one room, no shell. */
export const TINY = 'plan "Smoke" {\n  room at (0,0) size 4000x3000 label "Room"\n}\n';

/** A lint-CLEAN one-room dwelling: shell, entrance door, window. */
export const CLEAN = `plan "Clean" {
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r1 at (0,0) size 5000x4000 label "Living" uses living
  door id=d1 at (2000,4000) width 900 wall exterior hinge left swing in
  window at (0,2000) width 1200 wall exterior
}
`;

/** {@link CLEAN} with an 800 mm door — still clean by default, but under the
 *  `accessibility-advisory` profile the raised `minDoorWidthMm` flags it. */
export const NARROW_DOOR = CLEAN.replace("width 900", "width 800");

/** A sealed bedroom: no entrance, no interior door, no window — the shape
 *  `suggest` exists for. */
export const NO_DOORS = `plan "NoDoor" {
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r1 at (0,0) size 5000x4000 label "Bedroom" uses bedroom
}
`;

/** A sofa hanging through the exterior wall — the geometric fault `repair` corrects. */
export const FURNITURE_IN_WALL = `plan "Furn" {
  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r1 at (0,0) size 5000x4000 label "Living" uses living
  door id=d1 at (2000,4000) width 900 wall exterior hinge left swing in
  furniture sofa at (-100,1000) size 1800x800
}
`;

/** Two rooms joined by one interior door, with an entrance — the `graph` fixture. */
export const TWO_ROOMS = `plan "Two" {
  wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  wall partition thickness 100 { (3000,0) (3000,4000) }
  room id=a at (0,0) size 3000x4000 label "Living" uses living
  room id=b at (3000,0) size 3000x4000 label "Bedroom" uses bedroom
  door id=d0 at (1500,4000) width 900 wall exterior hinge left swing in
  door id=d1 at (3000,2000) width 900 wall partition hinge left swing in
  window at (0,2000) width 1200 wall exterior
  window at (6000,2000) width 1200 wall exterior
}
`;

/** Two storeys — the shape that used to come back as the ground floor alone. */
export const TWO_STOREY = `plan "Stack" {
  level 1 "Ground floor" {
    room at (0,0) size 4000x3000 label "Living"
  }
  level 2 "First floor" {
    room at (0,0) size 4000x3000 label "Bedroom"
  }
}
`;
