/**
 * The agent-directory manifests (`npm run gen:agent-manifests`) are one skill source published in
 * each host's shape. `check:drift` proves they are reproducible; this proves they are well formed:
 * the portable manifest validates against the vendored Agent Plugins schema (never fetched at test
 * time), the OpenAI directory listing meets that directory's submission limits, `mcp.json` starts the
 * local server while the OpenAI ZIP's names the hosted one, the Cursor manifest meets its one
 * documented requirement, every skill a host will look for exists and is byte-identical to its
 * source, and no generated text file carries a version number, a secret or a retired positioning
 * claim.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURSOR_RULE,
  GEMINI_CONTEXT,
  GEMINI_MANIFEST,
  HOSTED_MCP_URL,
  hostedMcpManifest,
  BUNDLED_ROOT_FILES,
  ICON_SOURCE,
  MCP_MANIFEST,
  MCP_SCHEMA_ID,
  OPENAI_CATEGORIES,
  PLUGIN_ICON,
  PLUGIN_ROOT,
  allOutputs,
  CURSOR_MANIFEST,
  PORTABLE_MANIFEST,
  PORTABLE_SCHEMA_ID,
  textOutputs,
  versionedOutputs,
} from "../scripts/gen-agent-manifests.js";

const read = (p: string) => readFileSync(resolve(p), "utf8");
const readJson = (p: string) => JSON.parse(read(p));

type Schema = {
  type?: string;
  const?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
};

/** The subset of JSON Schema the vendored Agent Plugins schema uses; throws on any other keyword. */
const KNOWN = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "type",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "pattern",
  "minLength",
  "maxLength",
]);

function validate(value: unknown, schema: Schema, at: string, errors: string[]): void {
  for (const k of Object.keys(schema))
    if (!KNOWN.has(k)) throw new Error(`validator does not support \`${k}\` (${at})`);
  if ("const" in schema && value !== schema.const) errors.push(`${at}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.type === "string") {
    if (typeof value !== "string") return void errors.push(`${at}: must be a string`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match pattern`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) return void errors.push(`${at}: must be an array`);
    const item = schema.items;
    if (item) for (const [i, v] of value.entries()) validate(v, item, `${at}[${i}]`, errors);
  } else if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return void errors.push(`${at}: must be an object`);
    const obj = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in obj)) errors.push(`${at}: missing required \`${r}\``);
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (sub) validate(v, sub, `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property \`${k}\``);
      else if (typeof schema.additionalProperties === "object")
        validate(v, schema.additionalProperties, `${at}.${k}`, errors);
    }
  }
}

/** The retired claims and hype words (same list as test/docs-page-meta.test.ts). */
const KILLED: readonly RegExp[] = [
  /\bLaTeX\b/i,
  /\bTypst\b/i,
  /(?<![-\w])first\b/i,
  /(?<![-\w])only\b/i,
  /Design Compiler/i,
  /Code as CAD/i,
  /checked design/i,
  /every clearance measured/i,
  /game.?chang/i,
  /revolutionar/i,
  /seamless/i,
  /effortless/i,
  /cutting.edge/i,
  /world.class/i,
  /blazing/i,
  /state.of.the.art/i,
  /\b10x\b/i,
  /\bmagic/i,
  /remotion/i,
];
/** Anything shaped like a credential. */
const SECRETS: readonly RegExp[] = [
  /\bnpm_[A-Za-z0-9]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bsk-[A-Za-z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY/,
  /\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9]{12,}/i,
];
/** A semver, or a `name@x.y.z` pin. */
const VERSION = /\d+\.\d+\.\d+/;

describe("agent-directory manifests", () => {
  it("the plugin and MCP schema ids carry the same schema version (Copilot requires the match)", () => {
    const version = (id: string) => /\/schemas\/([^/]+)\//.exec(id)?.[1];
    expect(version(PORTABLE_SCHEMA_ID)).toBeDefined();
    expect(version(MCP_SCHEMA_ID)).toBe(version(PORTABLE_SCHEMA_ID));
    expect(readJson(MCP_MANIFEST).$schema).toBe(MCP_SCHEMA_ID);
    expect(readJson(PORTABLE_MANIFEST).$schema).toBe(PORTABLE_SCHEMA_ID);
  });

  it("the portable manifest validates against the vendored Agent Plugins schema", () => {
    const schema = readJson("test/fixtures/schemas/agent-plugin.schema.json") as Schema & { $id: string };
    expect(schema.$id).toBe(PORTABLE_SCHEMA_ID);
    const errors: string[] = [];
    validate(readJson(PORTABLE_MANIFEST), schema, "plugin.json", errors);
    expect(errors).toEqual([]);
    expect(readJson(PORTABLE_MANIFEST).name).toBe("archlang");
  });

  it("the validator rejects what the schema forbids (so a pass means something)", () => {
    const schema = readJson("test/fixtures/schemas/agent-plugin.schema.json") as Schema;
    const errors: string[] = [];
    validate({ $schema: PORTABLE_SCHEMA_ID, name: "Bad Name", extra: 1 }, schema, "x", errors);
    expect(errors.join("\n")).toMatch(/pattern/);
    expect(errors.join("\n")).toMatch(/unexpected property `extra`/);
    const missing: string[] = [];
    validate({}, schema, "x", missing);
    expect(missing.join("\n")).toMatch(/missing required `name`/);
  });

  it("mcp.json meets the vendored Agent Plugins MCP schema and pins no version", () => {
    const schema = readJson("test/fixtures/schemas/agent-plugin-mcp.schema.json");
    expect(schema.$id).toBe(MCP_SCHEMA_ID);
    const mcp = readJson(MCP_MANIFEST);
    // structural checks by hand: the schema uses $ref/oneOf, beyond the small validator above
    expect(schema.required).toEqual(["$schema", "mcpServers"]);
    expect(Object.keys(mcp).sort()).toEqual(["$schema", "mcpServers"]);
    expect(mcp.$schema).toBe(MCP_SCHEMA_ID);
    const server = mcp.mcpServers.archlang;
    const stdio = schema.$defs.stdioServer;
    expect(stdio.required).toEqual(["type", "command"]);
    for (const k of Object.keys(server)) expect(Object.keys(stdio.properties), k).toContain(k);
    expect(server.type).toBe(stdio.properties.type.const);
    expect(server.command).toBe("npx");
    expect(server.args).toEqual(["-y", readJson("packages/mcp/package.json").name]);
    for (const a of server.args) expect(a).not.toMatch(/@[^/]*$|@latest/);
  });

  it("the OpenAI ZIP's mcp.json declares exactly the hosted server, Streamable HTTP, per the vendored schema", () => {
    const schema = readJson("test/fixtures/schemas/agent-plugin-mcp.schema.json");
    const mcp = JSON.parse(hostedMcpManifest());
    expect(Object.keys(mcp).sort()).toEqual(["$schema", "mcpServers"]);
    expect(mcp.$schema).toBe(MCP_SCHEMA_ID);
    // one server: the OpenAI portal connects one per plugin, and plugin-level review cases need one
    expect(Object.keys(mcp.mcpServers)).toEqual(["archlang"]);
    const server = mcp.mcpServers.archlang;
    const http = schema.$defs.streamableHttpServer;
    expect(http.required).toEqual(["type", "url"]);
    expect(http.additionalProperties).toBe(false);
    for (const k of Object.keys(server)) expect(Object.keys(http.properties), k).toContain(k);
    expect(server.type).toBe(http.properties.type.const);
    expect(server.url).toBe(HOSTED_MCP_URL);
    expect(new URL(server.url).protocol).toBe("https:");
    // no sign-in: a public submission rejects non-empty server headers, and a token is a secret
    expect(server).not.toHaveProperty("headers");
    // the URL is the one the integration docs and the hosted-server ADR name
    expect(read("docs/integrations.md")).toContain(HOSTED_MCP_URL);
    expect(read("docs/adr/0026-hosted-mcp-worker.md")).toContain(new URL(HOSTED_MCP_URL).host);
  });

  it("the OpenAI listing fields meet the directory's submission limits", () => {
    const manifest = readJson(PORTABLE_MANIFEST);
    const openai = manifest.extensions["com.openai"];
    // the ZIP portal rejects app references and lifecycle hooks
    expect(Object.keys(openai)).toEqual(["interface"]);
    const ui = openai.interface;
    const oneLine = (s: string, max: number, at: string) => {
      expect(typeof s, at).toBe("string");
      expect(s.trim().length, at).toBeGreaterThan(0);
      expect(s, at).not.toMatch(/[\n\r\t]/);
      expect(s.length, at).toBeLessThanOrEqual(max);
    };
    oneLine(ui.displayName, 30, "displayName");
    oneLine(ui.shortDescription, 30, "shortDescription");
    expect(ui.longDescription.length).toBeLessThanOrEqual(4000);
    expect(ui.longDescription).toContain(manifest.description);
    expect(ui.longDescription).toContain(HOSTED_MCP_URL);
    oneLine(ui.developerName, 80, "developerName");
    expect(ui.developerName).toBe(manifest.author.name);
    expect(OPENAI_CATEGORIES).toContain(ui.category);
    expect(ui.capabilities.length).toBeLessThanOrEqual(20);
    for (const c of ui.capabilities) oneLine(c, 120, "capabilities");
    expect(ui.defaultPrompt.length).toBeLessThanOrEqual(3);
    expect(new Set(ui.defaultPrompt).size).toBe(ui.defaultPrompt.length);
    for (const p of ui.defaultPrompt) {
      oneLine(p, 128, "defaultPrompt");
      expect(p).not.toContain("@");
    }
    for (const k of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      const u = new URL(ui[k]);
      expect(u.protocol, k).toBe("https:");
      expect(u.username + u.password, k).toBe("");
      expect(ui[k].length, k).toBeLessThanOrEqual(1024);
    }
    expect(ui.websiteURL).toBe(manifest.homepage);
    expect(ui.supportURL).toBe(`${manifest.repository}/issues`);
    // the privacy and terms URLs are pages the docs site builds
    for (const [k, page] of [
      ["privacyPolicyURL", "docs-site/privacy.md"],
      ["termsOfServiceURL", "docs-site/terms.md"],
    ] as const) {
      expect(ui[k]).toBe(`${manifest.homepage}/${page.slice("docs-site/".length, -".md".length)}`);
      expect(existsSync(resolve(page)), page).toBe(true);
    }
  });

  it("the plugin bundle carries the root LICENSE and SECURITY.md byte-for-byte", () => {
    for (const f of BUNDLED_ROOT_FILES) {
      expect(readFileSync(resolve(`${PLUGIN_ROOT}/${f}`)).equals(readFileSync(resolve(f))), f).toBe(true);
    }
  });

  it("the OpenAI listing icon is a square PNG inside the plugin, copied from the Claude icon", () => {
    const ui = readJson(PORTABLE_MANIFEST).extensions["com.openai"].interface;
    for (const k of ["composerIcon", "logo"]) {
      expect(ui[k], k).toMatch(/^\.\/[^.]/);
      expect(`${PLUGIN_ROOT}/${ui[k].slice(2)}`, k).toBe(PLUGIN_ICON);
    }
    const buf = readFileSync(resolve(PLUGIN_ICON));
    expect(buf.equals(readFileSync(resolve(ICON_SOURCE)))).toBe(true);
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.subarray(12, 16).toString("latin1")).toBe("IHDR");
    const w = buf.readUInt32BE(16);
    expect(buf.readUInt32BE(20)).toBe(w);
    expect(w).toBeGreaterThanOrEqual(48);
    expect(w).toBeLessThanOrEqual(4096);
    expect(buf.length).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it("the Cursor manifest has the one field Cursor requires, and the name agrees across hosts", () => {
    const cursor = readJson(CURSOR_MANIFEST);
    // Cursor requires `name`, lowercase alphanumerics, hyphens and periods (kebab-case)
    expect(cursor.name).toMatch(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
    expect(typeof cursor.description).toBe("string");
    // rules/*.mdc are discovered from the plugin root: the generated rule is where Cursor looks
    expect(CURSOR_RULE).toMatch(/\/rules\/[^/]+\.mdc$/);
    expect(cursor.name).toBe(readJson(PORTABLE_MANIFEST).name);
    // skills are found in the default root `skills/` directory; a `skills` key would only add to it
    expect(cursor).not.toHaveProperty("skills");
    expect(readJson(PORTABLE_MANIFEST)).not.toHaveProperty("skills");
  });

  it("the plugin root the manifests sit in holds every skill, byte-identical to skills/<name>/SKILL.md", () => {
    const sources = readdirSync(resolve("skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(resolve("skills", e.name, "SKILL.md")))
      .map((e) => e.name)
      .sort();
    expect(sources).toContain("archlang");
    expect(readdirSync(resolve(PLUGIN_ROOT, "skills")).sort()).toEqual(sources);
    for (const d of sources) {
      expect(read(`${PLUGIN_ROOT}/skills/${d}/SKILL.md`), d).toBe(read(`skills/${d}/SKILL.md`));
      // the manifests rely on the plugin root's skills/ directory: each skill names itself
      expect(read(`skills/${d}/SKILL.md`)).toMatch(new RegExp(`^name:\\s*${d}\\s*$`, "m"));
    }
  });

  it("every generated file exists and is the generator's output", () => {
    for (const f of allOutputs()) expect(existsSync(resolve(f)), f).toBe(true);
    for (const { dest, text } of [...textOutputs(), ...versionedOutputs()]) expect(read(dest), dest).toBe(text);
  });

  it("the Gemini CLI manifest sits at the root, names the core's version and the unpinned stdio server", () => {
    // releasing docs: the manifest is at the repository root and its version matches the release tag
    expect(GEMINI_MANIFEST).toBe("gemini-extension.json");
    expect(versionedOutputs().map((o) => o.dest)).toEqual([GEMINI_MANIFEST]);
    const g = readJson(GEMINI_MANIFEST);
    const core = readJson("package.json");
    expect(g.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(g.name).toBe(readJson(PORTABLE_MANIFEST).name);
    expect(g.version).toBe(core.version);
    expect(g.description).toBe(core.description);
    expect(g.mcpServers).toEqual({
      archlang: { command: "npx", args: ["-y", readJson("packages/mcp/package.json").name] },
    });
    // contextFileName: relative, inside the extension root, an existing generated file (never a root GEMINI.md)
    expect(g.contextFileName).toBe(GEMINI_CONTEXT);
    expect(g.contextFileName).not.toMatch(/^(?:\/|[A-Za-z]:)|(?:^|\/)\.\.(?:\/|$)/);
    expect(textOutputs().map((o) => o.dest)).toContain(GEMINI_CONTEXT);
    expect(existsSync(resolve("GEMINI.md"))).toBe(false);
    for (const re of SECRETS) expect(read(GEMINI_MANIFEST)).not.toMatch(re);
    for (const re of KILLED) expect(read(GEMINI_MANIFEST)).not.toMatch(re);
  });

  it("the Cursor rule and Copilot instructions carry their host's frontmatter and a generated header", () => {
    const rule = read(CURSOR_RULE);
    expect(rule).toMatch(/^---\ndescription: .+\nglobs: "\*\*\/\*\.arch"\nalwaysApply: false\n---\n<!-- GENERATED /);
    const path = read("integrations/copilot/archlang.instructions.md");
    expect(path).toMatch(/^---\napplyTo: "\*\*\/\*\.arch"\n---\n<!-- GENERATED /);
    expect(read("integrations/copilot/copilot-instructions.md")).toMatch(/^<!-- GENERATED /);
  });

  it("no generated text file names a version, a secret or a retired claim", () => {
    for (const { dest: f } of textOutputs()) {
      const text = read(f);
      // the Agent Plugins schema URL carries the schema revision, which is not a release version
      expect(text.replaceAll(PORTABLE_SCHEMA_ID, "").replaceAll(MCP_SCHEMA_ID, ""), `${f} has a version`).not.toMatch(
        VERSION,
      );
      for (const re of SECRETS) expect(text, `${f} ~ ${re}`).not.toMatch(re);
      for (const re of KILLED) expect(text, `${f} ~ ${re}`).not.toMatch(re);
    }
  });
});
