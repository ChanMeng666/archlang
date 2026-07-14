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

/**
 * A copy-pasteable invocation. `cmd` always starts with `arch ` and its verb is the
 * command's `name` or one of its `aliases` (a test enforces both); `note` says what
 * the call does. Agent-oriented on purpose: prefer `--json`, stdin `-`, and `-o -`.
 */
export interface ManifestExample {
  cmd: string;
  note: string;
}

export interface ManifestCommand {
  name: string;
  aliases?: string[];
  summary: string;
  /**
   * EXACTLY the flags this command honors — the CLI's flag parser rejects anything
   * else, so a flag a `cmd*` function reads must be listed here or it stops working.
   * Global flags (`--json`/`--quiet`) are repeated per command when the command
   * actually honors them (`manifest`/`spec`/`context`/`explain` ignore `--quiet`).
   */
  flags: ManifestFlag[];
  /** Accepted input (e.g. `<file.arch|->`), or `none`. */
  input: string;
  /** Where output goes (stdout, a file, etc.). */
  output: string;
  /** At least one worked invocation (see {@link ManifestExample}). */
  examples: readonly ManifestExample[];
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
/**
 * `-o/--out` is deliberately overloaded across commands (kept for backward compat):
 * a FILE for compile/watch/preview/md/repair/fix/new, a DIRECTORY for batch. Each
 * command therefore declares its own `--out` with its real semantics rather than
 * sharing one vague description.
 */
const OUT_FLAG: ManifestFlag = {
  flag: "--out",
  alias: "-o",
  arg: "<file|->",
  description: "output file, or '-' for stdout (default: the input path with the format's extension)",
};
const FMT_FLAG: ManifestFlag = {
  flag: "--format",
  alias: "-f",
  arg: "<svg|dxf|txt|pdf|png>",
  description: "output format (default svg)",
};
const SCALE_FLAG: ManifestFlag = {
  flag: "--scale",
  alias: "-s",
  arg: "<n>",
  description: "raster scale for the PNG backend (ignored by the non-raster formats)",
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
const FROM_JSON_FLAG: ManifestFlag = {
  flag: "--from-json",
  description: "read the input as Plan JSON (RPLAN shape) instead of .arch, convert it, then compile",
};
const GRAPH_FLAG: ManifestFlag = {
  flag: "--graph",
  arg: "<graph.json>",
  description:
    "also check the plan's interior-door adjacency against an intended graph (bare dict or {input_graph:{…}}); mismatch → exit 2",
};
const AT_FLAG: ManifestFlag = {
  flag: "--at",
  arg: "<byteOffset>",
  description: "source byte offset to list completions at (required)",
};
const INTENT_FLAG: ManifestFlag = {
  flag: "--intent",
  arg: "<intent.json>",
  description:
    "gate the plan against a brief's intent JSON; a failing gating assertion (room count/existence/area/windows) → exit 2. Adjacency/reachability score but never gate. Composes with --graph.",
};
const FEEDBACK_FLAG: ManifestFlag = {
  flag: "--feedback",
  description: "with --intent, append a deterministic per-violation correction prompt (advisory data, never applied)",
};
const BRIEF_FLAG: ManifestFlag = {
  flag: "--brief",
  arg: "<intent.json>",
  description: "the intent JSON to measure satisfaction against (required)",
};

const INSTALL_FLAG: ManifestFlag = {
  flag: "--install",
  description: "auto-install the optional dep for the chosen format if missing (PNG/PDF)",
};

/**
 * The narrowing flags (v1.17) — bounded, high-signal output. On a large plan an agent
 * used to have to pull EVERY room / diagnostic into its context and filter client-side;
 * these do it at the source. `--code`/`--severity` are DISPLAY filters only: the exit
 * code and `ok` are always computed from the unfiltered diagnostic set, so narrowing
 * what you read can never change what gates (see `report` in cli/commands-analyze.ts).
 */
const ROOM_FLAG: ManifestFlag = {
  flag: "--room",
  arg: "<id[,id…]>",
  description:
    "keep only these rooms; doors/windows/openings/furniture narrow to the ones touching them (plan-level facts — bbox, totals, caption — stay whole-plan)",
};
const SELECT_FLAG: ManifestFlag = {
  flag: "--select",
  arg: "<key[,key…]>",
  description:
    "emit only these top-level keys of the --json object (rooms, doors, totals, access, circulation, freedom, …); the ok/plan/units/diagnostics envelope is always kept",
};
const CODE_FLAG: ManifestFlag = {
  flag: "--code",
  arg: "<CODE[,CODE…]>",
  description:
    "show only diagnostics with these codes — a DISPLAY filter: the exit code and `ok` still come from the unfiltered set",
};
const SEVERITY_FLAG: ManifestFlag = {
  flag: "--severity",
  arg: "<error|warning>",
  description: "show only diagnostics of this severity — a DISPLAY filter, like --code (never changes the exit code)",
};
const SECTION_FLAG: ManifestFlag = {
  flag: "--section",
  arg: "<spec|workflow|cli|errors>",
  description:
    "print only one section of the bundle instead of all ~50KB of it (spec = the language, workflow = the agent loop, cli = every command, errors = the diagnostic catalog)",
};

/**
 * The render pipeline's flag set. `compile` and `watch` share it byte-for-byte
 * because `cmdWatch` re-enters `cmdCompile` on every save — it honors literally
 * everything compile does, so it must declare it (the parser rejects the rest).
 */
const COMPILE_FLAGS: ManifestFlag[] = [
  OUT_FLAG,
  FMT_FLAG,
  WIDTH_FLAG,
  SCALE_FLAG,
  COLS_FLAG,
  CHARSET_FLAG,
  OVERLAY_FLAG,
  ERROR_SVG_FLAG,
  ACCESSIBLE_FLAG,
  FROM_JSON_FLAG,
  INSTALL_FLAG,
  JSON_FLAG,
  QUIET_FLAG,
];

/**
 * The command table. Keys MUST cover exactly the verbs the CLI's `main()`
 * dispatch handles (the manifest drift test enforces it both ways), and each
 * command's `flags` must be EXACTLY the flags its `cmd*` function honors — the
 * two are checked against each other, and an undeclared flag is rejected at parse.
 */
const COMMANDS: ManifestCommand[] = [
  {
    name: "compile",
    summary: "render a plan to SVG/DXF/TXT/PDF/PNG",
    flags: COMPILE_FLAGS,
    input: "<file.arch|-> (Plan JSON with --from-json)",
    output: "file (or stdout with -o -)",
    examples: [
      { cmd: "arch compile plan.arch --json", note: "render SVG next to the input; structured result on stdout" },
      { cmd: "arch compile - -o - < plan.arch", note: "compile source from stdin straight to SVG on stdout" },
      {
        cmd: "arch compile plan.arch -f png --install --json",
        note: "rasterize to PNG, fetching the optional renderer if it is missing",
      },
    ],
  },
  {
    name: "batch",
    summary: "render many .arch files in one call, concurrently",
    flags: [
      {
        flag: "--out",
        alias: "-o",
        arg: "<dir>",
        description: "output DIRECTORY for every rendered file (default: alongside each input)",
      },
      FMT_FLAG,
      { flag: "--jobs", alias: "-j", arg: "<n>", description: "max concurrent renders (default: CPU count)" },
      WIDTH_FLAG,
      SCALE_FLAG,
      COLS_FLAG,
      CHARSET_FLAG,
      OVERLAY_FLAG,
      ERROR_SVG_FLAG,
      ACCESSIBLE_FLAG,
      INSTALL_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<a.arch> <b.arch> …",
    output: "one file per input; --json gives a results[] array",
    examples: [
      {
        cmd: "arch batch a.arch b.arch c.arch -o out/ --json",
        note: "render design variants concurrently; one result row per input",
      },
      {
        cmd: "arch batch plans/*.arch -f dxf -j 4 --json",
        note: "export a whole directory to DXF, 4 renders at a time",
      },
    ],
  },
  {
    name: "md",
    aliases: ["markdown"],
    summary: "render every ```arch block in a Markdown file and rewrite to image links",
    flags: [
      {
        flag: "--out",
        alias: "-o",
        arg: "<out.md|->",
        description: "rewritten Markdown file, or '-' for stdout (default: <name>.out.md)",
      },
      { flag: "--format", alias: "-f", arg: "<svg|png>", description: "image format for the blocks (default svg)" },
      WIDTH_FLAG,
      SCALE_FLAG,
      OVERLAY_FLAG,
      ERROR_SVG_FLAG,
      ACCESSIBLE_FLAG,
      INSTALL_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<doc.md>",
    output: "out.md + one image per block",
    examples: [
      {
        cmd: "arch md README.md -o README.out.md --json",
        note: "render the fenced arch blocks to SVGs and rewrite them to image links",
      },
      {
        cmd: "arch md doc.md -f png --error-svg --json",
        note: "PNG images; a broken block still yields an error card",
      },
    ],
  },
  {
    name: "preview",
    summary: "render a PNG you can look at (zero-install where the optional binary is present)",
    flags: [
      {
        flag: "--out",
        alias: "-o",
        arg: "<out.png|->",
        description: "output PNG file, or '-' for stdout (default: <name>.png)",
      },
      {
        ...SCALE_FLAG,
        description: "raster scale (default 1; without -w/-s the page auto-targets ~1600px wide for legibility)",
      },
      WIDTH_FLAG,
      { flag: "--ascii", description: "print a zero-dependency ASCII text plan to stdout instead of a PNG" },
      COLS_FLAG,
      CHARSET_FLAG,
      OVERLAY_FLAG,
      ERROR_SVG_FLAG,
      { ...INSTALL_FLAG, description: "auto-install @resvg/resvg-js if missing, then render" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "PNG file (or ASCII text on stdout with --ascii)",
    examples: [
      { cmd: "arch preview plan.arch --ascii --json", note: "a zero-dependency text plan an agent can read on stdout" },
      { cmd: "arch preview plan.arch -o plan.png --json", note: "raster the plan so a vision model can look at it" },
    ],
  },
  {
    name: "watch",
    summary: "recompile on save (interactive)",
    flags: COMPILE_FLAGS,
    input: "<file.arch>",
    output: "file, rewritten on each save",
    examples: [
      {
        cmd: "arch watch plan.arch -o plan.svg",
        note: "recompile on every save (interactive; agents should use compile)",
      },
    ],
  },
  {
    name: "validate",
    summary: "parse + resolve + lint, no render (is it valid & sound?)",
    flags: [
      { flag: "--strict", alias: "--fail-on-warning", description: "advisory warnings fail too (exit 2)" },
      GRAPH_FLAG,
      INTENT_FLAG,
      FEEDBACK_FLAG,
      CODE_FLAG,
      SEVERITY_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output:
      "diagnostics (plus a graph{} report with --graph and an intent{ ok, satisfied, total, subscores, violations } block with --intent)",
    examples: [
      { cmd: "arch validate plan.arch --strict --json", note: "the ship gate: errors and advisory warnings both fail" },
      {
        cmd: "arch validate plan.arch --intent brief.json --feedback --json",
        note: "gate on a brief's intent contract and get per-violation correction prompts",
      },
      {
        cmd: "arch validate plan.arch --graph rooms.json --json",
        note: "check interior-door adjacency against an intended room graph",
      },
      {
        cmd: "arch validate plan.arch --severity error --json",
        note: "read only the blocking errors; `ok` and the exit code still weigh every diagnostic",
      },
    ],
  },
  {
    name: "describe",
    summary: "semantic facts: rooms, areas, adjacency, what doors connect",
    flags: [ROOM_FLAG, SELECT_FLAG, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "facts (JSON or a summary), narrowed by --room/--select",
    examples: [
      {
        cmd: "arch describe plan.arch --json",
        note: "rooms, areas, adjacency, door connections, caption, freedom — confirm the plan means what you intended",
      },
      { cmd: "arch describe - --json < plan.arch", note: "describe source piped on stdin, no temp file" },
      {
        cmd: "arch describe plan.arch --select rooms,totals --json",
        note: "just the rooms and the totals — keep a big plan's facts inside a bounded context",
      },
      {
        cmd: "arch describe plan.arch --room kitchen,bath --json",
        note: "only those two rooms and the doors/windows/furniture that touch them",
      },
    ],
  },
  {
    name: "score",
    summary:
      "continuous intent satisfaction (satisfied/total) as data — the refine-loop reward. Measures, never gates (validate --intent is the gate).",
    flags: [BRIEF_FLAG, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output:
      "{ ok, satisfied, total, score, subscores, violations } (exit 0 on a successful measurement, even when assertions fail)",
    examples: [
      {
        cmd: "arch score plan.arch --brief brief.json --json",
        note: "continuous intent satisfaction as the refine-loop reward; always exits 0 on a measurement",
      },
    ],
  },
  {
    name: "lint",
    summary: "architectural soundness warnings",
    flags: [
      { flag: "--profile", arg: `<${LINT_PROFILE_NAMES.join("|")}>`, description: "advisory ruleset" },
      { flag: "--strict", alias: "--fail-on-warning", description: "warnings fail (exit 2)" },
      CODE_FLAG,
      SEVERITY_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "W_* warnings (narrowed by --code/--severity; `filtered`/`total_diagnostics` mark a filtered result)",
    examples: [
      { cmd: "arch lint plan.arch --json", note: "architectural soundness warnings as data, each with a fix" },
      {
        cmd: "arch lint plan.arch --profile accessibility-advisory --strict",
        note: "gate on the accessibility ruleset (any warning exits 2)",
      },
      {
        cmd: "arch lint plan.arch --code W_ROOM_UNREACHABLE,W_NO_ENTRANCE --json",
        note: "read only the reachability warnings; the exit code still reflects every diagnostic",
      },
    ],
  },
  {
    name: "ast",
    summary: "parse only (no resolve/render) and print the span-bearing AST as JSON",
    flags: [JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "AST JSON (scripting nodes unexpanded)",
    examples: [
      {
        cmd: "arch ast plan.arch --json",
        note: "span-bearing parse tree with no resolve or render — locate a statement by byte offset",
      },
    ],
  },
  {
    name: "complete",
    summary: "completion items in scope at a source byte offset (the LSP completion() core)",
    flags: [AT_FLAG, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "{ items: [...] } completion items",
    examples: [
      { cmd: "arch complete plan.arch --at 120 --json", note: "what may legally be written at byte offset 120" },
      { cmd: "arch complete - --at 0 --json < plan.arch", note: "completions for source on stdin" },
    ],
  },
  {
    name: "fmt",
    summary: "canonical formatting",
    flags: [{ flag: "--write", description: "format the file in place" }, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "formatted source (or in place with --write)",
    examples: [
      { cmd: "arch fmt plan.arch --json", note: "canonical source plus a `changed` flag, nothing written" },
      { cmd: "arch fmt plan.arch --write", note: "rewrite the file in canonical form" },
    ],
  },
  {
    name: "repair",
    summary: "explicit source-to-source corrector (furniture out of walls) + change log",
    flags: [
      {
        ...OUT_FLAG,
        description: "output file for the corrected source, or '-' for stdout (default: stdout)",
      },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "corrected source + change log on stderr",
    examples: [
      {
        cmd: "arch repair plan.arch --json",
        note: "the geometric corrector: `source` + a `changes[]` log of every furniture move",
      },
      { cmd: "arch repair plan.arch -o repaired.arch", note: "write the corrected source to a new file" },
    ],
  },
  {
    name: "fix",
    summary: "apply the machine-applicable fix suggestions on a plan's diagnostics (bounded fixpoint)",
    flags: [
      {
        ...OUT_FLAG,
        description: "output file for the fixed source, or '-' for stdout (default: rewrite the input file in place)",
      },
      { flag: "--unsafe", description: "also apply `maybe-incorrect` fixes (default: machine-applicable only)" },
      { flag: "--dry-run", description: "compute the result but do not write it (the diff preview still prints)" },
      {
        flag: "--backup",
        description: "before rewriting a file in place, save the original bytes to <file>.bak",
      },
      { flag: "--force", description: "keep a pass even if it raises the error count" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "fixed source (to the input file or -o) + a unified diff and change log on stderr",
    examples: [
      {
        cmd: "arch fix plan.arch --dry-run",
        note: "preview the exact unified diff `fix` would write, changing nothing on disk",
      },
      {
        cmd: "arch fix plan.arch --dry-run --json",
        note: "the same preview as data: which fixes would be applied, plus the `diff` they produce",
      },
      {
        cmd: "arch fix plan.arch --backup --json",
        note: "apply the machine-applicable fixes in place, keeping the original as plan.arch.bak",
      },
      {
        cmd: "arch fix plan.arch -o fixed.arch --unsafe --json",
        note: "also apply the maybe-incorrect fixes, leaving the input untouched",
      },
    ],
  },
  {
    name: "suggest",
    summary: "advisory topology suggestions as data (door/window statements that resolve reachability/window faults)",
    flags: [JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "suggestions (JSON or a summary)",
    examples: [
      {
        cmd: "arch suggest plan.arch --json",
        note: "ready-to-paste door/window statements for unreachable rooms, no entrance, or a windowless bedroom",
      },
    ],
  },
  {
    name: "manifest",
    aliases: ["capabilities"],
    summary: "this document: the whole CLI API as structured data",
    flags: [JSON_FLAG],
    input: "none",
    output: "the manifest (JSON or a summary)",
    examples: [
      { cmd: "arch manifest --json", note: "discover every command, flag, format, and error code in one call" },
    ],
  },
  {
    name: "spec",
    summary: "print the one-prompt language spec (spec.llm.md)",
    flags: [JSON_FLAG],
    input: "none",
    output: "the spec",
    examples: [{ cmd: "arch spec", note: "the whole language on one page — read this before authoring" }],
  },
  {
    name: "context",
    summary: "print the full bundled agent context (spec + workflow + CLI + errors)",
    flags: [SECTION_FLAG, JSON_FLAG],
    input: "none",
    output: "the full agent context (llms-full.txt), or one --section of it",
    examples: [
      { cmd: "arch context", note: "the cold-start bundle: spec + workflow + CLI reference + every diagnostic" },
      {
        cmd: "arch context --section errors",
        note: "just the diagnostic catalog — read one section instead of paying for the whole ~50KB bundle",
      },
    ],
  },
  {
    name: "new",
    aliases: ["init"],
    summary: "scaffold a starter .arch",
    flags: [
      {
        flag: "--out",
        alias: "-o",
        arg: "<file|->",
        description: "output file — refuses to overwrite an existing one without --force (default: stdout)",
      },
      { flag: "--force", description: "overwrite an existing file" },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "none",
    output: "starter source",
    examples: [
      { cmd: "arch new --json", note: "get the starter plan as a `template` string, writing nothing" },
      { cmd: "arch new -o plan.arch", note: "scaffold a starter file to edit" },
    ],
  },
  {
    name: "explain",
    summary: "look up an error code (cause / fix / example)",
    flags: [JSON_FLAG],
    input: "<CODE>",
    output: "catalog entry",
    examples: [
      { cmd: "arch explain E_ROOM_SIZE --json", note: "the catalog entry for a diagnostic code: cause, fix, example" },
    ],
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
