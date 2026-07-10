/**
 * CLI capability manifest (v1.8) — the whole `arch` API surface as one structured
 * document, so an AI agent can discover commands, flags, formats, elements, lint
 * profiles, error codes, and fixture categories in a single `arch manifest --json`
 * call instead of parsing `--help`/`SKILL.md` prose.
 *
 * Pure: it assembles values that already exist as exports (`KEYWORDS`,
 * `ERROR_CODES`, `LINT_PROFILES`, `FIXTURE_CATEGORIES`) — there is **no new source
 * of truth** here except the command/flag table, which a drift test
 * (`test/cli-manifest.test.ts`) keeps in sync with the CLI's command dispatch.
 */

import { KEYWORDS } from "./grammar/tokens.js";

/**
 * The export formats the CLI can emit — the single source for `-f` validation
 * (cli.ts `parseFormat`), the capability manifest, and the CLI serializer
 * dispatch. Adding a format = one row here + one serializer line in cli.ts.
 * Deliberately NOT a public registry seam like elements/themes/hatches: formats
 * drag optional native deps and CLI flags with them, which a registry cannot
 * abstract cleanly (see AGENTS.md).
 */
export const EXPORT_FORMATS = [
  { id: "svg", zeroDep: true },
  { id: "dxf", zeroDep: true },
  { id: "txt", zeroDep: true },
  { id: "pdf", zeroDep: false, optionalDep: "pdfkit" },
  { id: "png", zeroDep: false, optionalDep: "@resvg/resvg-js" },
] as const;

/** A format id the CLI accepts for `-f`. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number]["id"];
import { ERROR_CODES, ERROR_CATALOG } from "./error-catalog.js";
import { LINT_PROFILE_NAMES, LINT_PROFILES, DEFAULT_RULESET } from "./lint.js";
import { FIXTURE_CATEGORIES } from "./elements/fixtures-glyphs.js";

export interface ManifestFlag {
  flag: string;
  alias?: string;
  /** Placeholder for a flag that takes a value (e.g. `<file>`), else omitted. */
  arg?: string;
  description: string;
}

export interface ManifestCommand {
  name: string;
  aliases?: string[];
  summary: string;
  flags: ManifestFlag[];
  /** Accepted input (e.g. `<file.arch|->`), or `none`. */
  input: string;
  /** Where output goes (stdout, a file, etc.). */
  output: string;
}

export interface Manifest {
  name: "arch";
  version: string;
  description: string;
  exitCodes: Record<string, string>;
  globalFlags: ManifestFlag[];
  commands: ManifestCommand[];
  formats: Array<{ id: string; zeroDep: boolean; optionalDep?: string }>;
  elements: readonly string[];
  keywords: typeof KEYWORDS;
  fixtureCategories: readonly string[];
  lint: {
    profiles: readonly string[];
    defaultRuleset: typeof DEFAULT_RULESET;
    profileOverrides: Record<string, Partial<typeof DEFAULT_RULESET>>;
  };
  errorCodes: Array<{ code: string; severity: "error" | "warning" }>;
}

const JSON_FLAG: ManifestFlag = { flag: "--json", description: "structured result on stdout, messages on stderr" };
const QUIET_FLAG: ManifestFlag = { flag: "--quiet", alias: "-q", description: "suppress human messages on stderr" };
const OUT_FLAG: ManifestFlag = {
  flag: "--out",
  alias: "-o",
  arg: "<file|->",
  description: "output destination ('-' = stdout)",
};
const FMT_FLAG: ManifestFlag = {
  flag: "--format",
  alias: "-f",
  arg: "<svg|dxf|txt|pdf|png>",
  description: "output format (default svg)",
};
const COLS_FLAG: ManifestFlag = {
  flag: "--cols",
  arg: "<n>",
  description: "text renderer (-f txt / preview --ascii) grid width in characters (default 80)",
};
const CHARSET_FLAG: ManifestFlag = {
  flag: "--charset",
  arg: "<unicode|ascii>",
  description: "text renderer glyph set (default unicode)",
};
const WIDTH_FLAG: ManifestFlag = {
  flag: "--width",
  alias: "-w",
  arg: "<px>",
  description: "page width hint in pixels",
};
const OVERLAY_FLAG: ManifestFlag = {
  flag: "--overlay",
  arg: "<circulation>",
  description:
    "draw an opt-in diagnostic overlay (circulation walks + bottleneck markers); default output is unchanged",
};
const ERROR_SVG_FLAG: ManifestFlag = {
  flag: "--error-svg",
  description:
    "on a broken plan, still emit a self-describing error-card image listing the diagnostics (exit code stays 2)",
};
const ACCESSIBLE_FLAG: ManifestFlag = {
  flag: "--accessible",
  description:
    "emit <title>/<desc>/role/aria accessibility metadata (the describe() caption) into the SVG; default output is unchanged",
};

/**
 * The command table. Keys MUST cover exactly the verbs the CLI's `main()`
 * dispatch handles (the manifest drift test enforces it both ways).
 */
const COMMANDS: ManifestCommand[] = [
  {
    name: "compile",
    summary: "render a plan to SVG/DXF/PDF/PNG",
    flags: [
      OUT_FLAG,
      FMT_FLAG,
      WIDTH_FLAG,
      COLS_FLAG,
      CHARSET_FLAG,
      OVERLAY_FLAG,
      ERROR_SVG_FLAG,
      ACCESSIBLE_FLAG,
      { flag: "--install", description: "auto-install the optional dep for the chosen format if missing (PNG/PDF)" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "file (or stdout with -o -)",
  },
  {
    name: "batch",
    summary: "render many .arch files in one call, concurrently",
    flags: [
      { flag: "--out", alias: "-o", arg: "<dir>", description: "output directory (default: alongside each input)" },
      FMT_FLAG,
      { flag: "--jobs", alias: "-j", arg: "<n>", description: "max concurrent renders (default: CPU count)" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<a.arch> <b.arch> …",
    output: "one file per input; --json gives a results[] array",
  },
  {
    name: "md",
    aliases: ["markdown"],
    summary: "render every ```arch block in a Markdown file and rewrite to image links",
    flags: [
      { flag: "--out", alias: "-o", arg: "<out.md>", description: "rewritten Markdown destination" },
      FMT_FLAG,
      ERROR_SVG_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<doc.md>",
    output: "out.md + one image per block",
  },
  {
    name: "preview",
    summary: "render a PNG you can look at (zero-install where the optional binary is present)",
    flags: [
      { flag: "--out", alias: "-o", arg: "<out.png>", description: "PNG destination (default: <name>.png)" },
      { flag: "--scale", alias: "-s", arg: "<n>", description: "raster scale (default 2)" },
      { flag: "--ascii", description: "print a zero-dependency ASCII text plan to stdout instead of a PNG" },
      COLS_FLAG,
      CHARSET_FLAG,
      ERROR_SVG_FLAG,
      { flag: "--install", description: "auto-install @resvg/resvg-js if missing, then render" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "PNG file (or ASCII text on stdout with --ascii)",
  },
  {
    name: "watch",
    summary: "recompile on save (interactive)",
    flags: [OUT_FLAG, FMT_FLAG, WIDTH_FLAG],
    input: "<file.arch>",
    output: "file, rewritten on each save",
  },
  {
    name: "validate",
    summary: "parse + resolve + lint, no render (is it valid & sound?)",
    flags: [
      { flag: "--strict", alias: "--fail-on-warning", description: "advisory warnings fail too (exit 2)" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "diagnostics",
  },
  {
    name: "describe",
    summary: "semantic facts: rooms, areas, adjacency, what doors connect",
    flags: [JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "facts (JSON or a summary)",
  },
  {
    name: "lint",
    summary: "architectural soundness warnings",
    flags: [
      { flag: "--profile", arg: `<${LINT_PROFILE_NAMES.join("|")}>`, description: "advisory ruleset" },
      { flag: "--strict", alias: "--fail-on-warning", description: "warnings fail (exit 2)" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "W_* warnings",
  },
  {
    name: "fmt",
    summary: "canonical formatting",
    flags: [{ flag: "--write", description: "format the file in place" }, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "formatted source (or in place with --write)",
  },
  {
    name: "repair",
    summary: "explicit source-to-source corrector (furniture out of walls) + change log",
    flags: [OUT_FLAG, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "corrected source + change log on stderr",
  },
  {
    name: "fix",
    summary: "apply the machine-applicable fix suggestions on a plan's diagnostics (bounded fixpoint)",
    flags: [
      OUT_FLAG,
      { flag: "--unsafe", description: "also apply `maybe-incorrect` fixes (default: machine-applicable only)" },
      { flag: "--dry-run", description: "compute the result but do not write it" },
      { flag: "--force", description: "keep a pass even if it raises the error count" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "fixed source (to the input file or -o) + change log on stderr",
  },
  {
    name: "suggest",
    summary: "advisory topology suggestions as data (door/window statements that resolve reachability/window faults)",
    flags: [JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "suggestions (JSON or a summary)",
  },
  {
    name: "manifest",
    aliases: ["capabilities"],
    summary: "this document: the whole CLI API as structured data",
    flags: [JSON_FLAG],
    input: "none",
    output: "the manifest (JSON or a summary)",
  },
  {
    name: "spec",
    summary: "print the one-prompt language spec (spec.llm.md)",
    flags: [JSON_FLAG],
    input: "none",
    output: "the spec",
  },
  {
    name: "context",
    summary: "print the full bundled agent context (spec + workflow + CLI + errors)",
    flags: [JSON_FLAG],
    input: "none",
    output: "the full agent context (llms-full.txt)",
  },
  {
    name: "new",
    aliases: ["init"],
    summary: "scaffold a starter .arch",
    flags: [
      { flag: "--out", alias: "-o", arg: "<file>", description: "write the starter here" },
      { flag: "--force", description: "overwrite an existing file" },
      JSON_FLAG,
    ],
    input: "none",
    output: "starter source",
  },
  {
    name: "explain",
    summary: "look up an error code (cause / fix / example)",
    flags: [JSON_FLAG],
    input: "<CODE>",
    output: "catalog entry",
  },
];

/** Assemble the full {@link Manifest}. `version` is injected by the CLI. */
export function buildManifest(version: string): Manifest {
  return {
    name: "arch",
    version,
    description: "ArchLang compiler — agent-native CLI. Compile .arch floor-plan source to SVG/PNG/PDF/DXF.",
    exitCodes: {
      "0": "ok",
      "2": "user-source error (deterministic — fix it, don't blindly retry)",
      "1": "internal / IO error",
      "3": "bad usage",
    },
    globalFlags: [JSON_FLAG, QUIET_FLAG],
    commands: COMMANDS,
    formats: EXPORT_FORMATS.map((f) => ({ ...f })),
    elements: KEYWORDS.element,
    keywords: KEYWORDS,
    fixtureCategories: FIXTURE_CATEGORIES,
    lint: {
      profiles: LINT_PROFILE_NAMES,
      defaultRuleset: DEFAULT_RULESET,
      profileOverrides: Object.fromEntries(LINT_PROFILE_NAMES.map((name) => [name, LINT_PROFILES[name] ?? {}])),
    },
    errorCodes: ERROR_CODES.map((code) => ({ code, severity: ERROR_CATALOG[code]!.severity })),
  };
}

/** The verb names the manifest documents (incl. aliases) — used by the drift test. */
export const MANIFEST_COMMAND_NAMES: readonly string[] = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
