/**
 * The `archlang://capabilities` resource (card RM5.1): generated, never hand-written.
 *
 * - **Drift.** The committed `packages/mcp/capabilities.md` is exactly what
 *   `scripts/gen-capabilities.ts` renders from the tool registry, the CLI manifest and
 *   `EXPORT_FORMATS` (refresh with `npm run gen:mcp-capabilities`; `check:drift` runs it too). That
 *   it is served byte-equal on `archlang://capabilities` is `resources.test.ts`'s pin.
 * - **Coverage.** Every registered tool, every export format and every CLI command is on the page,
 *   read from the sources here rather than from the generator, so a source entry the generator
 *   stopped rendering fails.
 * - **Wording.** No promise of design, layout, furnishing, IFC, BIM or 3D (the card's "do not").
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, EXPORT_FORMATS } from "@chanmeng666/archlang";
import { describe, expect, it } from "vitest";
import { CAPABILITIES_PATH, renderCapabilities } from "../scripts/gen-capabilities.js";
import { INSTRUCTIONS } from "../src/tools.js";
import { connect } from "./helpers.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const committed = (): string => readFileSync(resolve(REPO, CAPABILITIES_PATH), "utf8").replace(/\r\n/g, "\n");

describe("archlang://capabilities", () => {
  it("the committed file is the generator's output", async () => {
    expect(committed()).toBe(await renderCapabilities());
  });

  it("lists every registered tool, in registration order, with its title", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const text = committed();
    let at = -1;
    for (const t of tools) {
      const line = `- \`${t.name}\`: ${t.title}`;
      const i = text.indexOf(`\n${line}\n`);
      expect(i, `no line for tool ${t.name}`).toBeGreaterThan(at);
      at = i;
    }
    expect(text).toContain(`## Tools on this server (${tools.length})`);
  });

  it("lists every export format, and every CLI command either as a tool or as a command line", async () => {
    const text = committed();
    for (const f of EXPORT_FORMATS) expect(text, f.id).toMatch(new RegExp(`^- \`${f.id}\`: `, "m"));
    const client = await connect();
    const tools = new Set((await client.listTools()).tools.map((t) => t.name));
    const manifest = buildManifest("0.0.0");
    for (const c of manifest.commands) {
      if (tools.has(c.name)) continue;
      expect(text, c.name).toContain(`- \`${manifest.invoke} ${c.name}\`: `);
    }
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

  it("promises no design, layout, furnishing, IFC, BIM or 3D", () => {
    const text = committed();
    for (const re of [/\bdesign/i, /\blayout/i, /\bfurnish/i, /\bIFC\b/, /\bBIM\b/, /\b3D\b/i])
      expect(re.test(text), `${re} in the capabilities resource`).toBe(false);
  });
});
