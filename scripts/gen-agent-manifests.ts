/**
 * Generate the agent-directory manifests: one skill source (`skills/<name>/SKILL.md`), published
 * in the shape each host reads. Nothing here carries a version number or a count: a manifest that
 * names neither cannot go stale, and the listing hosts read the repository's own tags.
 *
 * Host formats, each taken from the host's own published documentation on 2026-10-13
 * (the vendored schema is `test/fixtures/schemas/agent-plugin.schema.json`):
 *   - portable "Agent Plugins" 1.0.0 : https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
 *     and https://developers.openai.com/codex/plugins/build (`plugin.json` at the plugin root; skills
 *     are found in that root's `skills/` directory, so the manifest has no `skills` field). The same
 *     file is what the Codex / ChatGPT plugin directory and Awesome Copilot read. Reference layout:
 *     https://github.com/remotion-dev/agent-plugin (`plugin.json` + `skills/`).
 *   - Cursor plugin                  : https://cursor.com/docs/plugins (`.cursor-plugin/plugin.json`,
 *     only `name` required; `skills/` and `rules/*.mdc` are discovered from the plugin root).
 *   - Copilot custom instructions    : https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
 *     (`.github/copilot-instructions.md`; `.github/instructions/NAME.instructions.md` with an
 *     `applyTo` glob) and https://raw.githubusercontent.com/github/awesome-copilot/main/CONTRIBUTING.md
 *     (skills/instructions/plugins contribution format).
 * OpenAI plugin directory (Codex and ChatGPT), read on 2026-10-15:
 *   - https://developers.openai.com/plugins/build/plugins (portable layout: root `plugin.json`, root
 *     `mcp.json`, `skills/`, assets under `./assets/`; OpenAI-specific settings in the root manifest's
 *     `extensions["com.openai"]`, which replaces a `.codex-plugin/plugin.json` overlay).
 *   - https://developers.openai.com/plugins/deploy/submission (listing fields in
 *     `extensions["com.openai"].interface`: displayName and shortDescription at most 30 characters,
 *     the four HTTPS listing URLs required for MCP review, `logo` the primary icon, `composerIcon`).
 *   - https://developers.openai.com/plugins/deploy/submission-errors (the category list, image rules:
 *     PNG/JPEG/WebP/SVG, square, 48 to 4096 px, at most 5 MiB).
 * The plugin root is `plugins/archlang/` (the slim folder the Claude plugin already uses; the
 * repository root carries an 11 MB font), which `gen:plugin` fills with `skills/`. `mcp.json` there
 * (portable Agent Plugins MCP file, https://agent-plugins.org/schemas/1.0.0/mcp.schema.json) starts the
 * MCP server unpinned, like the README's recommended command, so it names no version. The OpenAI
 * directory takes a remote HTTPS server instead and no longer accepts a skills-only package, so the
 * ZIP `npm run build:openai-plugin` assembles swaps in {@link hostedMcpManifest} (ADR 0026's server).
 * `assets/icon.png` is a byte copy of the Claude plugin's `.claude-plugin/icon.png` (1024 px square),
 * so the OpenAI listing icon sits inside the plugin folder the ZIP is built from.
 * Gemini CLI extension, read on 2026-11-06:
 *   - https://geminicli.com/docs/extensions/reference/ (`gemini-extension.json` in the extension root:
 *     `name` lowercase with dashes, matching the install directory; `version`; `description`, shown in
 *     the gallery; `mcpServers` keyed by server name with `command` and `args` kept apart;
 *     `contextFileName`, `GEMINI.md` when omitted).
 *   - https://geminicli.com/docs/extensions/releasing/ (the manifest sits at the repository root; its
 *     `version` should match the GitHub release tag; the gallery crawls repositories carrying the
 *     `gemini-cli-extension` topic).
 *   - google-gemini/gemini-cli `packages/cli/src/config/extension-manager.ts` (`validateContextFilePath`):
 *     `contextFileName` may be a relative path inside the extension root, so it names the generated
 *     Copilot instructions file rather than a root `GEMINI.md` (Gemini CLI would also load a root
 *     `GEMINI.md` as contributor context, and `AGENTS.md` is the repository's only root instruction file).
 * The Gemini manifest is the one output that names a version: the tag match is the host's rule, so it
 * carries the core's version from the root `package.json` (as `gen:plugin` does for the Claude
 * plugin) and a release bump reruns this generator.
 * The instruction snippets are copy-in files (a user's own `.github/` or `.cursor/rules/`), so they
 * live under `integrations/`; the manifests and skills sit where the host auto-detects them.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../src/manifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

export const PLUGIN_ROOT = "plugins/archlang";
export const PORTABLE_MANIFEST = `${PLUGIN_ROOT}/plugin.json`;
export const CURSOR_MANIFEST = `${PLUGIN_ROOT}/.cursor-plugin/plugin.json`;
export const MCP_MANIFEST = `${PLUGIN_ROOT}/mcp.json`;
export const MCP_SCHEMA_ID = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
export const CURSOR_RULE = `${PLUGIN_ROOT}/rules/archlang.mdc`;
export const PORTABLE_SCHEMA_ID = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
/** The listing icon, copied from the Claude plugin's icon (binary, so not among the text outputs). */
export const ICON_SOURCE = `${PLUGIN_ROOT}/.claude-plugin/icon.png`;
export const PLUGIN_ICON = `${PLUGIN_ROOT}/assets/icon.png`;
/** Root files copied byte-for-byte into the plugin bundle, which is distributed on its own (MIT notice). */
export const BUNDLED_ROOT_FILES = ["LICENSE", "SECURITY.md"] as const;
/** Gemini CLI extension manifest (repository root) and the context file it names. */
export const GEMINI_MANIFEST = "gemini-extension.json";
export const COPILOT_INSTRUCTIONS = "integrations/copilot/copilot-instructions.md";
export const GEMINI_CONTEXT = COPILOT_INSTRUCTIONS;
/** The hosted MCP server (ADR 0026; `docs/integrations.md` names the same URL). */
export const HOSTED_MCP_URL = "https://mcp.archlang.uk/mcp";
/** The OpenAI directory's categories (submission-errors, `plugin_category_unknown`). */
export const OPENAI_CATEGORIES = [
  "Productivity",
  "Creativity",
  "Developer Tools",
  "Business & Operations",
  "Data & Analytics",
  "Communication",
  "Education & Research",
  "Security",
  "Finance",
  "Healthcare",
  "Travel",
  "Entertainment",
  "Other",
] as const;

const HEADER =
  "GENERATED by scripts/gen-agent-manifests.ts from skills/*/SKILL.md and src/manifest.ts. Do not edit; run `npm run gen:agent-manifests`.";

/** The commands the snippets name, in order; each must exist in the CLI manifest. */
const SNIPPET_COMMANDS = ["spec", "compile", "fix", "describe", "lint", "preview"] as const;

type Frontmatter = { name: string; description: string };

function frontmatter(src: string): Frontmatter {
  const text = read(src);
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const description = /^description:\s*(.+)$/m.exec(text)?.[1]?.trim();
  if (!name || !description) throw new Error(`${src}: SKILL.md frontmatter needs name and description`);
  return { name, description };
}

export function skillNames(): string[] {
  return readdirSync(join(ROOT, "skills"))
    .sort()
    .filter((d) => existsSync(join(ROOT, "skills", d, "SKILL.md")));
}

/** These manifests carry the skills only (the MCP server is the Claude plugin's), so they say so. */
const DESCRIPTION =
  "ArchLang: write floor plans as code, compiled and checked by a deterministic compiler. Skills to author, edit, review and export .arch plans through the archlang CLI, and the ArchLang MCP server.";

/** Identity fields shared by every manifest, from the one hand-written plugin manifest. */
function identity() {
  const m = JSON.parse(read("plugins/archlang/.claude-plugin/plugin.json"));
  return {
    name: m.name as string,
    description: DESCRIPTION,
    author: m.author as { name: string; url: string },
    homepage: m.homepage as string,
    repository: m.repository as string,
    license: m.license as string,
    keywords: m.keywords as string[],
  };
}

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

/**
 * The OpenAI directory listing (`extensions["com.openai"].interface`). The URLs and the developer
 * come from the identity fields; `homepage` and `author.url` do not fill the listing on their own.
 * Category: the plugin is a language, a compiler and a CLI an agent drives, so Developer Tools.
 * Capabilities: the skills read and write `.arch` files and the files the CLI renders from them.
 */
function openaiInterface() {
  const { author, homepage, repository } = identity();
  const icon = `./${PLUGIN_ICON.slice(PLUGIN_ROOT.length + 1)}`;
  const category: (typeof OPENAI_CATEGORIES)[number] = "Developer Tools";
  return {
    displayName: "ArchLang",
    shortDescription: "Floor plans as checked code",
    longDescription: `${DESCRIPTION} The MCP server is hosted at ${HOSTED_MCP_URL} with no sign-in: it compiles a plan to an SVG drawing and returns the plan's measured facts and lint findings.`,
    developerName: author.name,
    category,
    capabilities: ["Read", "Write"],
    websiteURL: homepage,
    supportURL: `${repository}/issues`,
    privacyPolicyURL: `${homepage}/privacy`,
    termsOfServiceURL: `${homepage}/terms`,
    defaultPrompt: [
      "Design a two-bedroom flat of about 75 m² as an ArchLang plan and check it against the brief.",
      "Make the bedroom in plan.arch 1 m wider and show me what changed.",
      "Put plan.arch on an A3 sheet and give me a link to download it as a PDF.",
    ],
    composerIcon: icon,
    logo: icon,
  };
}

/**
 * Root `plugin.json`: the portable Agent Plugins manifest (skills found in root `skills/`, MCP
 * servers in root `mcp.json`), with the OpenAI directory listing under `extensions["com.openai"]`.
 */
export function portableManifest(): string {
  const { name, description, author, homepage, repository, license, keywords } = identity();
  return json({
    $schema: PORTABLE_SCHEMA_ID,
    name,
    description,
    author,
    homepage,
    repository,
    license,
    keywords,
    extensions: { "com.openai": { interface: openaiInterface() } },
  });
}

/** `mcp.json`: the MCP server, started by its package name with no version. */
export function mcpManifest(): string {
  const { name } = JSON.parse(read("packages/mcp/package.json"));
  return json({
    $schema: MCP_SCHEMA_ID,
    mcpServers: { archlang: { type: "stdio", command: "npx", args: ["-y", name] } },
  });
}

/**
 * The OpenAI ZIP's `mcp.json` (`scripts/build-openai-plugin.ts`): the hosted server over Streamable
 * HTTP, no sign-in, because the directory takes a remote HTTPS server and excludes a local one. The
 * repository's `mcp.json` keeps the local server for the hosts that start it (PNG, offline use).
 */
export function hostedMcpManifest(): string {
  return json({
    $schema: MCP_SCHEMA_ID,
    mcpServers: { archlang: { type: "streamable-http", url: HOSTED_MCP_URL } },
  });
}

/** `.cursor-plugin/plugin.json`: only `name` is required; `skills/` is discovered by default. */
export function cursorManifest(): string {
  const { name, description, author, homepage, repository, license, keywords } = identity();
  return json({ name, description, author, homepage, repository, license, keywords });
}

/**
 * `gemini-extension.json`: the stdio MCP server, started by its package name with no version like
 * `mcp.json`, and the generated instructions as the context file. The description is the core
 * package's one-liner (GS-D5); `version` is the core's, for the tag match the gallery asks for.
 */
export function geminiManifest(): string {
  const core = JSON.parse(read("package.json"));
  const { name: mcp } = JSON.parse(read("packages/mcp/package.json"));
  return json({
    name: identity().name,
    version: core.version as string,
    description: core.description as string,
    contextFileName: GEMINI_CONTEXT,
    mcpServers: { archlang: { command: "npx", args: ["-y", mcp] } },
  });
}

function intro(): string {
  const m = buildManifest("0.0.0");
  const lines = SNIPPET_COMMANDS.map((c) => {
    const cmd = m.commands.find((x) => x.name === c);
    if (!cmd) throw new Error(`gen-agent-manifests: CLI manifest has no \`${c}\` command`);
    return `- \`${m.invoke} ${c}\`: ${cmd.summary}`;
  });
  const all = skillNames().map((d) => frontmatter(`skills/${d}/SKILL.md`));
  const umbrella = all.filter((f) => f.name === "archlang");
  const tasks = all.filter((f) => f.name !== "archlang");
  const item = (f: Frontmatter) => `- \`${f.name}\`: ${f.description}`;
  return [
    "# ArchLang",
    "",
    "ArchLang is a text language (`.arch` files) that compiles to floor-plan drawings. Write and",
    "change plans as `.arch` source and drive the `archlang` CLI; do not hand-render a drawing.",
    "Run it with `npx -y @chanmeng666/archlang <command>` when it is not installed.",
    "",
    "Start with `archlang spec`, which prints the whole language, then loop: write the plan,",
    "`archlang compile plan.arch --json`, apply `archlang fix`, and check the result with",
    "`archlang describe` and `archlang lint` instead of looking at the image.",
    "",
    "Commands:",
    ...lines,
    "",
    "Skills for these tasks (the ArchLang plugin ships them; otherwise copy `skills/<name>/` from the ArchLang repository):",
    ...umbrella.map(item),
    "",
    "Task skills:",
    ...tasks.map(item),
    "",
  ].join("\n");
}

export function cursorRule(): string {
  return `---\ndescription: Author, edit and check ArchLang .arch floor plans with the archlang CLI\nglobs: "**/*.arch"\nalwaysApply: false\n---\n<!-- ${HEADER} -->\n\n${intro()}`;
}

export function copilotInstructions(): string {
  return `<!-- ${HEADER} -->\n\n${intro()}`;
}

export function copilotPathInstructions(): string {
  return `---\napplyTo: "**/*.arch"\n---\n<!-- ${HEADER} -->\n\n${intro()}`;
}

/** Published path → generated text, for every generated text file. */
export function textOutputs(): { dest: string; text: string }[] {
  return [
    { dest: PORTABLE_MANIFEST, text: portableManifest() },
    { dest: MCP_MANIFEST, text: mcpManifest() },
    { dest: CURSOR_MANIFEST, text: cursorManifest() },
    { dest: CURSOR_RULE, text: cursorRule() },
    { dest: COPILOT_INSTRUCTIONS, text: copilotInstructions() },
    { dest: "integrations/copilot/archlang.instructions.md", text: copilotPathInstructions() },
  ];
}

/** The generated files that carry the core's version (the host requires it); see the header. */
export function versionedOutputs(): { dest: string; text: string }[] {
  return [{ dest: GEMINI_MANIFEST, text: geminiManifest() }];
}

/** Every file this generator writes: the text outputs, the versioned outputs and the copied files. */
export function allOutputs(): string[] {
  return [
    ...textOutputs().map((o) => o.dest),
    ...versionedOutputs().map((o) => o.dest),
    PLUGIN_ICON,
    ...BUNDLED_ROOT_FILES.map((f) => `${PLUGIN_ROOT}/${f}`),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const { dest, text } of [...textOutputs(), ...versionedOutputs()]) {
    mkdirSync(dirname(join(ROOT, dest)), { recursive: true });
    writeFileSync(join(ROOT, dest), text);
  }
  mkdirSync(dirname(join(ROOT, PLUGIN_ICON)), { recursive: true });
  copyFileSync(join(ROOT, ICON_SOURCE), join(ROOT, PLUGIN_ICON));
  for (const f of BUNDLED_ROOT_FILES) copyFileSync(join(ROOT, f), join(ROOT, PLUGIN_ROOT, f));
  process.stdout.write(`gen-agent-manifests: wrote ${allOutputs().length} files\n`);
}
