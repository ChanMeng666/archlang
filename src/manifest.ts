/**
 * CLI capability manifest — the whole `archlang` API surface as one structured
 * document, so an AI agent can discover commands, flags, formats, elements, lint
 * profiles, error codes, and fixture categories in a single `archlang manifest --json`
 * call instead of parsing `--help`/`SKILL.md` prose.
 *
 * Pure: it assembles values that already exist as exports (`KEYWORDS`,
 * `ERROR_CODES`, `LINT_PROFILES`, `FIXTURE_CATEGORIES`) — there is **no new source
 * of truth** here except the command/flag table, which a drift test
 * (`test/cli-manifest.test.ts`) keeps in sync with the CLI's command dispatch.
 */

import { PNG_PREVIEW_WIDTH } from "./backends/png-defaults.js";
import { CONTEXT_BUNDLE_KB } from "./context-size.js";
import { CONTEXT_LEVELS, STARTER_MAX_UNITS } from "./context-levels.js";
import { KEYWORDS } from "./grammar/tokens.js";

// The command name lives in a leaf module so diagnostics can name it without importing this
// file (which imports `lint.ts`); re-exported here for every existing importer.
import { CLI_NAME } from "./command-name.js";
export { CLI_NAME };

/**
 * The export formats the CLI can emit — the single source for `-f` validation
 * (cli.ts `parseFormat`), the capability manifest, and the CLI serializer
 * dispatch. Adding a format = one row here + one serializer line in cli.ts.
 * `json` is the one row that is not a drawing: it writes the Plan JSON (`planToJson`,
 * one document per storey) that `compile --from-json` reads back.
 * Deliberately NOT a public registry seam like elements/themes/hatches: formats
 * drag optional native deps and CLI flags with them, which a registry cannot
 * abstract cleanly (see AGENTS.md).
 */
export const EXPORT_FORMATS = [
  { id: "svg", zeroDep: true },
  { id: "dxf", zeroDep: true },
  { id: "txt", zeroDep: true },
  { id: "json", zeroDep: true },
  { id: "pdf", zeroDep: false, optionalDep: "pdfkit" },
  { id: "png", zeroDep: false, optionalDep: "@resvg/resvg-js" },
] as const;

/** A format id the CLI accepts for `-f`. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number]["id"];
import { ERROR_CODES, ERROR_CATALOG } from "./error-catalog.js";
import { LINT_PROFILE_NAMES, LINT_PROFILES, DEFAULT_RULESET } from "./lint.js";
import { TASTE_PROFILE_NAMES } from "./taste/index.js";
import { AUTHORING_STAGES } from "./stages.js";
import { FIXTURE_CATEGORIES } from "./elements/fixtures-glyphs.js";
import { DESCRIBE_FACTS, MAX_WASTE_PCT } from "./describe.js";
import { FINISH_STAGE_ORDER, FINISH_STAGES, FINISH_STAGES_AVAILABLE } from "./finish.js";
import { CASED_OPENING_HEAD, DOOR_HEAD, MAX_HEIGHT, STOREY_HEIGHT, WINDOW_HEAD, WINDOW_SILL } from "./datum.js";

export interface ManifestFlag {
  flag: string;
  alias?: string;
  /** Placeholder for a flag that takes a value (e.g. `<file>`), else omitted. */
  arg?: string;
  description: string;
}

/**
 * A copy-pasteable invocation. `cmd` always starts with `archlang ` and its verb is the
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
  /**
   * The command to type, `archlang`. `name` stays `"arch"` for existing readers, but a command
   * built from it runs coreutils on Linux, macOS and Git Bash; build commands from `invoke`.
   */
  invoke: typeof CLI_NAME;
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
  /**
   * The vertical datum's DEFAULTS in millimetres, so a consumer reads them once
   * from the compiler rather than hard-coding six numbers that would then drift.
   *
   * They are here, in the manifest, rather than in `describe()` for a reason worth
   * keeping: `describe()` reports what a PLAN is, and a default is a property of the
   * LANGUAGE. A plan that authors no height reports no heights at all (the byte-identity
   * law) — and an agent still needs to know what the compiler would use if it did.
   */
  datum: {
    /** Floor-to-floor height of a storey when the plan declares none. */
    storeyHeight: number;
    /** Head height of a door leaf when the statement declares none. */
    doorHead: number;
    /** Sill height of a window when the statement declares none. */
    windowSill: number;
    /** Head height of a window when the statement declares none. */
    windowHead: number;
    /** Head height of a cased opening in a default-height storey — the RULE is "as tall
     *  as the host wall", and this is what that evaluates to when the wall is default. */
    casedOpeningHead: number;
    /** The largest height any clause may name; anything above is `E_HEIGHT_RANGE`. */
    maxHeight: number;
  };
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
  arg: `<${EXPORT_FORMATS.map((f) => f.id).join("|")}>`,
  description: "output format (default svg); json writes the Plan JSON that --from-json reads",
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
/**
 * `compile` and `watch` declare the same flag with one clause the others do not need.
 *
 * The card is an artifact like any other, so it follows `compile`'s one file rule: it is
 * written when something names a file, and `--json` with no `-o` names none. The bytes
 * are NOT smuggled into the payload instead — the `--json` envelope reports facts about
 * a render (`ok`, `bytes`, `diagnostics`, `summary`) and has never carried content, and
 * making the broken-plan case the sole exception would trade one surprise for a worse
 * one: an unbounded, error-only key in a deliberately bounded envelope. So the flag does
 * nothing visible in that one combination, and says so here rather than surprising a
 * reader. `-o <file>` (or `-o -` without `--json`) gets the image, as it always did.
 *
 * `preview` and `md` keep the plain description: neither changed, and for them the
 * sentence would be false.
 */
const ERROR_SVG_FLAG_COMPILE: ManifestFlag = {
  flag: "--error-svg",
  description:
    "on a broken plan, still emit a self-describing error-card image listing the diagnostics (exit code stays 2); it is an output like any other, so with --json and no -o nothing is written and the card is not in the payload — pass -o <file> to get the image",
};
const ACCESSIBLE_FLAG: ManifestFlag = {
  flag: "--accessible",
  description:
    "emit <title>/<desc>/role/aria accessibility metadata (the describe() caption) into the SVG; default output is unchanged",
};
const ACC_ID_PREFIX_FLAG: ManifestFlag = {
  flag: "--acc-id-prefix",
  arg: "<prefix>",
  description:
    "with --accessible, prefix the <title>/<desc> element ids (default arch, giving arch-title/arch-desc) so several plans inlined in one HTML page do not share them; ignored without --accessible",
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
  description: "the intent JSON to measure satisfaction against (this or --taste)",
};
const TASTE_FLAG: ManifestFlag = {
  flag: "--taste",
  arg: `<${TASTE_PROFILE_NAMES.join("|")}>`,
  description:
    "score taste instead (ADR 0032): sourced criteria in [0,1], capped at 0.5 while a validity lint warning stands; never gates (not with --brief)",
};

/**
 * `--level <n>` — the multi-storey selector. A plan with `level` blocks compiles to
 * ONE FILE PER STOREY (`<stem>.L<level>.<ext>`); this narrows the call to a single storey,
 * which is also the only way to stream a multi-storey plan to stdout (`-o -`).
 */
const LEVEL_FLAG: ManifestFlag = {
  flag: "--level",
  arg: "<n>",
  description:
    "render only this storey of a multi-storey plan (level blocks) to the plain -o target, instead of one <stem>.L<level>.<ext> file per level",
};

const INSTALL_FLAG: ManifestFlag = {
  flag: "--install",
  description: "auto-install the optional dep for the chosen format if missing (PNG/PDF)",
};

/**
 * The narrowing flags — bounded, high-signal output. On a large plan an agent
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
/**
 * `--zone <path[,path…]>` — read one wing/department of a zoned plan. A DISPLAY
 * filter over the rooms the zone DECLARES (nested zones roll up), so it narrows exactly
 * what `--room` would with that zone's member list typed out by hand.
 */
const ZONE_FLAG: ManifestFlag = {
  flag: "--zone",
  arg: "<path[,path…]>",
  description:
    "keep only the rooms declared in these `zone` blocks (nested zones roll up; paths are dotted, e.g. west.galleries) — a DISPLAY filter: `ok` and the exit code still weigh the whole plan",
};
/**
 * `--facts <fact[,fact…]>` — opt-in DERIVED facts `describe()` computes only on request, so
 * the default payload stays byte-identical. The names are `DESCRIBE_FACTS`, never retyped.
 */
const FACTS_FLAG: ManifestFlag = {
  flag: "--facts",
  arg: `<${DESCRIBE_FACTS.join("|")}[,…]>`,
  description:
    "also compute these opt-in facts: `symmetry` (the plan's symmetry group per layer — shell, rooms, full — and its repeated rooms), `syntax` (space-syntax depth, mean depth, RA, integration and control on the access graph), `depends` (per element, the ids it derives from and the `let`/parameter names it reads) and `clearances` (what each clearance rule measured, per storey under the default ruleset: a WC's sides, a tall unit's and a hob's cover of a window, a hob's nearest tall unit, a doorway's clear width and approach, a stair's run and landings) and `quantities` (per storey, geometry only: wall length per category on the centreline and on the faces, room perimeters on the centreline and net, the net floor area, door and window counts by kind and width, wall face areas when the plan authors heights); absent by default",
};
/** `--waste <pct>`: a parameter the author passes, never a default (preview-and-remodel D9). */
const WASTE_FLAG: ManifestFlag = {
  flag: "--waste",
  arg: "<pct>",
  description: `with the \`quantities\` fact, also report \`floor_area_with_waste_m2\` = the net floor area × (1 + pct/100), pct from 0 to ${MAX_WASTE_PCT}; absent unless given`,
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
  description: `print only one section of the bundle instead of all ${CONTEXT_BUNDLE_KB.total} KB of it (spec = the language, ${CONTEXT_BUNDLE_KB.spec} KB; workflow = the agent loop, ${CONTEXT_BUNDLE_KB.workflow} KB; cli = every command, ${CONTEXT_BUNDLE_KB.cli} KB; errors = the diagnostic catalog, ${CONTEXT_BUNDLE_KB.errors} KB)`,
};

const CONTEXT_LEVEL_FLAG: ManifestFlag = {
  flag: "--level",
  arg: `<${CONTEXT_LEVELS.join("|")}>`,
  description: `starter = one screen (at most ${STARTER_MAX_UNITS} characters) for a small model: the lead example, the statements a plan needs, the loop and the five commonest errors; full = the whole ${CONTEXT_BUNDLE_KB.total} KB bundle (default, unchanged)`,
};

/**
 * `--view <iso|axon>` — DEPRECATED (removed in 2.0, ADR 0021): render an ILLUSTRATIVE axonometric instead of the plan.
 *
 * On `compile` and `preview` only, and deliberately not on `watch` or `batch`: this is a
 * picture to look at once, not a drawing to iterate on. It is not an export FORMAT — every
 * raster and vector format still applies. Four combinations are refused with exit 3 rather
 * than silently ignored, and `resolveView` (`src/cli/io.ts`) states why each one is: an
 * unknown value, `-f txt`/`--ascii`, `--level` and `--overlay`.
 */
const VIEW_FLAG: ManifestFlag = {
  flag: "--view",
  arg: "<iso|axon>",
  description:
    "DEPRECATED (removed in 2.0; ArchLang draws plans) — render an illustrative axonometric of the building instead of the plan (iso = true isometric, axon = the 30/60 plan oblique) — a picture, never a measured drawing: no scale, no title block, no dimensions, and `describe`/`lint` are unaffected",
};

/**
 * The render pipeline's flag set. `compile` and `watch` share it byte-for-byte
 * because `cmdWatch` re-enters `cmdCompile` on every save — it honors literally
 * everything compile does, so it must declare it (the parser rejects the rest).
 *
 * `--view` is the ONE exception and therefore lives in {@link COMPILE_ONLY_FLAGS}: a
 * watcher exists to re-render a plan you are editing, and an axonometric is not that.
 */
const COMPILE_FLAGS: ManifestFlag[] = [
  OUT_FLAG,
  FMT_FLAG,
  LEVEL_FLAG,
  WIDTH_FLAG,
  SCALE_FLAG,
  COLS_FLAG,
  CHARSET_FLAG,
  OVERLAY_FLAG,
  ERROR_SVG_FLAG_COMPILE,
  ACCESSIBLE_FLAG,
  ACC_ID_PREFIX_FLAG,
  FROM_JSON_FLAG,
  INSTALL_FLAG,
  JSON_FLAG,
  QUIET_FLAG,
];

/** {@link COMPILE_FLAGS} plus `--view`, which `watch` deliberately does not take. */
const COMPILE_ONLY_FLAGS: ManifestFlag[] = [...COMPILE_FLAGS, VIEW_FLAG];

/**
 * The command table. Keys MUST cover exactly the verbs the CLI's `main()`
 * dispatch handles (the manifest drift test enforces it both ways), and each
 * command's `flags` must be EXACTLY the flags its `cmd*` function honors — the
 * two are checked against each other, and an undeclared flag is rejected at parse.
 */
const COMMANDS: ManifestCommand[] = [
  {
    name: "compile",
    summary: "render a plan to SVG/DXF/TXT/PDF/PNG, or to Plan JSON",
    flags: COMPILE_ONLY_FLAGS,
    input: "<file.arch|-> (Plan JSON with --from-json)",
    output: "file (or stdout with -o -) — with --json and no -o nothing is written",
    examples: [
      {
        cmd: "archlang compile plan.arch -o plan.svg --json",
        note: "render to the named file; structured result on stdout",
      },
      {
        cmd: "archlang compile plan.arch --json",
        note: "check it compiles and WRITE NOTHING (no -o names a file) — reports written:false, bytes, diagnostics, summary",
      },
      { cmd: "archlang compile plan.arch", note: "render SVG next to the input (plan.svg)" },
      { cmd: "archlang compile - -o - < plan.arch", note: "compile source from stdin straight to SVG on stdout" },
      {
        cmd: "archlang compile plan.arch -f json -o plan.json",
        note: "export the Plan JSON; `archlang compile plan.json --from-json` renders it back",
      },
      {
        cmd: "archlang compile plan.arch -f png -o plan.png --install --json",
        note: "rasterize to PNG, fetching the optional renderer if it is missing",
      },
      {
        cmd: "archlang compile house.arch -o house.svg --json",
        note: "a multi-storey plan writes one sheet per level (house.L1.svg, house.L2.svg …) and reports outputs[]",
      },
      {
        cmd: "archlang compile house.arch --level 2 -o upper.svg",
        note: "render just the upper storey of a multi-storey plan to one file",
      },
      {
        cmd: "archlang compile house.arch --view iso -o house-iso.svg",
        note: "an illustrative isometric of the whole building (every storey in ONE drawing, so no per-level fan-out)",
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
      ACC_ID_PREFIX_FLAG,
      INSTALL_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<a.arch> <b.arch> …",
    output: "one file per input; --json gives a results[] array",
    examples: [
      {
        cmd: "archlang batch a.arch b.arch c.arch -o out/ --json",
        note: "render design variants concurrently; one result row per input",
      },
      {
        cmd: "archlang batch plans/*.arch -f dxf -j 4 --json",
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
      ACC_ID_PREFIX_FLAG,
      INSTALL_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<doc.md>",
    output: "out.md + one image per block",
    examples: [
      {
        cmd: "archlang md README.md -o README.out.md --json",
        note: "render the fenced arch blocks to SVGs and rewrite them to image links",
      },
      {
        cmd: "archlang md doc.md -f png --error-svg --json",
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
        description: `raster scale (default 1; without -w/-s the page auto-targets ~${PNG_PREVIEW_WIDTH}px wide for legibility)`,
      },
      WIDTH_FLAG,
      { flag: "--ascii", description: "print a zero-dependency ASCII text plan to stdout instead of a PNG" },
      {
        flag: "--review",
        description:
          "render the REVIEW SHEET instead of the plain plan: the access graph over the plan, every element a compile or default-lint warning names ringed with its number and code, a legend (number → code → message) and fixed-scale close-ups of the flagged openings and furniture pieces, the first 24 in mark order (default output <name>.review.png; --json adds marks[] with each warning's span and ringed elements, crops[] and cropsOmitted[], boxes in plan mm). One mark per warning; a warning from a repeated statement that does not say which copy it means is listed, not ringed. One storey per sheet (--level); not with --ascii, --view or --overlay",
      },
      {
        ...LEVEL_FLAG,
        description: "preview this storey of a multi-storey plan (default: the lowest level, i.e. page 1)",
      },
      COLS_FLAG,
      CHARSET_FLAG,
      OVERLAY_FLAG,
      ERROR_SVG_FLAG,
      { ...INSTALL_FLAG, description: "auto-install @resvg/resvg-js if missing, then render" },
      VIEW_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "PNG file (or ASCII text on stdout with --ascii)",
    examples: [
      {
        cmd: "archlang preview plan.arch --ascii --json",
        note: "a zero-dependency text plan an agent can read on stdout",
      },
      {
        cmd: "archlang preview plan.arch -o plan.png --json",
        note: "raster the plan so a vision model can look at it",
      },
      {
        cmd: "archlang preview house.arch --level 2 -o upper.png --json",
        note: "look at one storey of a multi-storey plan",
      },
      {
        cmd: "archlang preview plan.arch --review -o review.png --json",
        note: "the reviewer's sheet: every warning ringed and numbered on the plan, with close-ups of each flagged opening and piece",
      },
      {
        cmd: "archlang preview house.arch --view axon -o house-axon.png --json",
        note: "raster an illustrative plan-oblique of the building so a vision model can look at it",
      },
    ],
  },
  {
    name: "link",
    summary: "print a playground URL that opens the plan, rendered, with nothing to install",
    flags: [JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output:
      "the playground URL; --json gives { ok, playground, embed, bytes } (embed: the plan alone, for an iframe; bytes: the compressed plan). A plan that does not compile still gets a link: ok false with an errors count, one warning on stderr, exit 0",
    examples: [
      { cmd: "archlang link plan.arch", note: "a URL to give the user: it opens the plan in the hosted playground" },
      {
        cmd: "archlang link plan.arch --json",
        note: "the playground and embed URLs as data, and whether the plan compiles",
      },
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
        cmd: "archlang watch plan.arch -o plan.svg",
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
      {
        flag: "--profile",
        arg: `<${LINT_PROFILE_NAMES.join("|")}>`,
        description:
          "lint under this advisory ruleset too (as `lint --profile`); its own warnings rank as `next` tier profile",
      },
      {
        flag: "--taste",
        arg: `<${TASTE_PROFILE_NAMES.join("|")}>`,
        description: "let `next` fall back to the lowest-scoring taste criterion (ADR 0032); never gates",
      },
      {
        flag: "--stage",
        arg: `<${AUTHORING_STAGES.join("|")}>`,
        description:
          "only the findings meaningful up to this authoring stage (errors always); `next`, `ok` and --strict read that set, `summary` says how many later-stage findings are held back; taste only at drafting",
      },
      CODE_FLAG,
      SEVERITY_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output:
      "diagnostics (plus a graph{} report with --graph and an intent{ ok, satisfied, total, subscores, violations, measures? } block with --intent; `measures` lists each brief-bound size with its measured value and signed residual), then `keeps` when the plan declares one (each { keep, grade, level?, holds, residual_mm, at?, measured_mm?, span }), then `next`: the one item to fix first { tier, code, message, span?, hint? } or null (tiers: error, warning, validity, drafting, intent, profile, taste). Each diagnostic and intent violation carries its authoring `stage`; with --stage, an `at_stage` { stage, held_back, clean } block precedes `keeps`",
    examples: [
      {
        cmd: "archlang validate plan.arch --strict --json",
        note: "the ship gate: errors and advisory warnings both fail",
      },
      {
        cmd: "archlang validate plan.arch --intent brief.json --feedback --json",
        note: "gate on a brief's intent contract and get per-violation correction prompts",
      },
      {
        cmd: "archlang validate plan.arch --graph rooms.json --json",
        note: "check interior-door adjacency against an intended room graph",
      },
      {
        cmd: "archlang validate plan.arch --json --taste generic",
        note: "read `next` first: the one diagnostic to fix before anything else, by fixed precedence",
      },
      {
        cmd: "archlang validate plan.arch --stage rooms --json",
        note: "author in stages: fix what the rooms alone decide, advance to walls once `at_stage.clean`",
      },
      {
        cmd: "archlang validate plan.arch --severity error --json",
        note: "read only the blocking errors; `ok` and the exit code still weigh every diagnostic",
      },
    ],
  },
  {
    name: "describe",
    summary: "semantic facts: rooms, areas, adjacency, what doors connect",
    flags: [
      ROOM_FLAG,
      ZONE_FLAG,
      SELECT_FLAG,
      {
        ...LEVEL_FLAG,
        description:
          "report this storey of a multi-storey plan as the top-level facts (a DISPLAY filter — `ok` and the exit code still weigh the whole plan)",
      },
      FACTS_FLAG,
      WASTE_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "facts (JSON or a summary), narrowed by --room/--zone/--select/--level",
    examples: [
      {
        cmd: "archlang describe plan.arch --json",
        note: "rooms, areas, adjacency, door connections, caption, freedom — confirm the plan means what you intended",
      },
      { cmd: "archlang describe - --json < plan.arch", note: "describe source piped on stdin, no temp file" },
      {
        cmd: "archlang describe plan.arch --select rooms,totals --json",
        note: "just the rooms and the totals — keep a big plan's facts inside a bounded context",
      },
      {
        cmd: "archlang describe plan.arch --room kitchen,bath --json",
        note: "only those two rooms and the doors/windows/furniture that touch them",
      },
      {
        cmd: "archlang describe museum.arch --zone west --json",
        note: "only the west wing's rooms and what touches them; `zones[]` reports every declared wing, its rooms and its area",
      },
      {
        cmd: "archlang describe house.arch --level 2 --json",
        note: "the upper storey's rooms/areas/access as the top-level facts (`levels[]` carries every storey)",
      },
      {
        cmd: "archlang describe plan.arch --facts symmetry,syntax --json",
        note: "add the symmetry group per layer, repeated rooms, and space-syntax integration on the access graph",
      },
      {
        cmd: "archlang describe plan.arch --facts depends --json --select depends",
        note: "per element, the ids it derives from (`on`) and the `let`/parameter names it reads (`params`) — what follows a change",
      },
      {
        cmd: "archlang describe plan.arch --facts quantities --waste 10 --json --select quantities",
        note: "wall lengths, room perimeters, net floor area (and with 10% waste), door and window counts — geometry only",
      },
    ],
  },
  {
    name: "takeoff",
    summary: "geometric quantities, CSV or Markdown",
    flags: [
      {
        flag: "--format",
        alias: "-f",
        arg: "<csv|md>",
        description:
          "csv: one row per figure (`level,section,item,width_mm,field,value`, the field named as in `describe`); md: one table per section and storey (default md)",
      },
      WASTE_FLAG,
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output:
      "the table on stdout, or with --json { ok, plan, units, quantities, levels?: [{ level, name?, quantities }], diagnostics } (exit 2 when the plan does not resolve)",
    examples: [
      {
        cmd: "archlang takeoff plan.arch --format csv > takeoff.csv",
        note: "wall lengths (centreline and face), room perimeters, net floor area, door and window counts, one figure per row",
      },
      {
        cmd: "archlang takeoff plan.arch --waste 10",
        note: "the same as Markdown tables, with the net floor area plus a 10% waste allowance you chose",
      },
    ],
  },
  {
    name: "score",
    summary:
      "continuous intent satisfaction (satisfied/total) as data — the refine-loop reward — or, with --taste, the plan's taste score. Measures, never gates (validate --intent is the gate).",
    flags: [BRIEF_FLAG, TASTE_FLAG, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output:
      "--brief: { ok, satisfied, total, score, subscores, violations, measures? }; --taste: { profile, ok, score, uncapped, capped, validity, advisory, coverage, subscores, criteria } (exit 0 on a successful measurement, whatever the score)",
    examples: [
      {
        cmd: "archlang score plan.arch --brief brief.json --json",
        note: "continuous intent satisfaction as the refine-loop reward; always exits 0 on a measurement",
      },
      {
        cmd: "archlang score plan.arch --taste generic --json",
        note: "taste advice per criterion with its source and an A_* code; read after lint is clean, never a gate",
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
    output:
      "W_* warnings (narrowed by --code/--severity; `filtered`/`total_diagnostics` mark a filtered result), then a `coverage` block naming the rule families skipped and why",
    examples: [
      { cmd: "archlang lint plan.arch --json", note: "architectural soundness warnings as data, each with a fix" },
      {
        cmd: "archlang lint plan.arch --profile accessibility-advisory --strict",
        note: "gate on the accessibility ruleset (any warning exits 2)",
      },
      {
        cmd: "archlang lint plan.arch --code W_ROOM_UNREACHABLE,W_NO_ENTRANCE --json",
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
        cmd: "archlang ast plan.arch --json",
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
      { cmd: "archlang complete plan.arch --at 120 --json", note: "what may legally be written at byte offset 120" },
      { cmd: "archlang complete - --at 0 --json < plan.arch", note: "completions for source on stdin" },
    ],
  },
  {
    name: "fmt",
    summary: "canonical formatting",
    flags: [{ flag: "--write", description: "format the file in place" }, JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "formatted source (or in place with --write)",
    examples: [
      { cmd: "archlang fmt plan.arch --json", note: "canonical source plus a `changed` flag, nothing written" },
      { cmd: "archlang fmt plan.arch --write", note: "rewrite the file in canonical form" },
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
        cmd: "archlang repair plan.arch --json",
        note: "the geometric corrector: `source` + a `changes[]` log of every furniture move",
      },
      { cmd: "archlang repair plan.arch -o repaired.arch", note: "write the corrected source to a new file" },
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
        cmd: "archlang fix plan.arch --dry-run",
        note: "preview the exact unified diff `fix` would write, changing nothing on disk",
      },
      {
        cmd: "archlang fix plan.arch --dry-run --json",
        note: "the same preview as data: which fixes would be applied, plus the `diff` they produce",
      },
      {
        cmd: "archlang fix plan.arch --backup --json",
        note: "apply the machine-applicable fixes in place, keeping the original as plan.arch.bak",
      },
      {
        cmd: "archlang fix plan.arch -o fixed.arch --unsafe --json",
        note: "also apply the maybe-incorrect fixes, leaving the input untouched",
      },
    ],
  },
  {
    name: "finish",
    summary:
      "furnish the rooms that hold no furniture, then add the sheet statements a plan lacks (paper, scale, dims auto, title, schedule rooms, legend); deletes nothing",
    flags: [
      {
        ...OUT_FLAG,
        description:
          "output file for the finished source, or '-' for stdout (default: rewrite the input file in place)",
      },
      {
        flag: "--only",
        arg: `<${FINISH_STAGES.join("|")}>`,
        description: `run only this stage (available: ${FINISH_STAGES_AVAILABLE.join(", ")}; default: ${FINISH_STAGE_ORDER.join(", then ")})`,
      },
      {
        flag: "--reissue",
        description:
          "allow `paper` and `scale` (nothing else) to be replaced when the drawing does not fit the authored sheet",
      },
      { flag: "--dry-run", description: "compute the result but do not write it (the diff preview still prints)" },
      {
        flag: "--backup",
        description: "before rewriting a file in place, save the original bytes to <file>.bak",
      },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "finished source (to the input file or -o) + a unified diff and change log on stderr",
    examples: [
      {
        cmd: "archlang finish plan.arch --dry-run --json",
        note: "preview the furniture and sheet statements `finish` would add: `changes[]`, `unresolved[]` and the `diff`",
      },
      {
        cmd: "archlang finish plan.arch --backup",
        note: "complete the drawing in place once lint is clean, keeping the original as plan.arch.bak",
      },
      {
        cmd: "archlang finish plan.arch --only furnish --dry-run --json",
        note: "preview only the furniture: one `furniture` statement per piece, and each room left empty with the reason",
      },
      {
        cmd: "archlang finish plan.arch --reissue -o issued.arch",
        note: "also replace a paper/scale the drawing does not fit, leaving the input untouched",
      },
    ],
  },
  {
    name: "reroll",
    summary: "offer a proven-equivalent `for` loop for a repeated statement run",
    flags: [
      {
        flag: "--write",
        description:
          "apply every non-overlapping suggestion and re-verify the combined result's compiled SVG is " +
          "byte-identical to the original before writing (no --dry-run/--backup: a failed re-verify writes " +
          "nothing, and every suggestion is already proven byte-for-byte before it is offered)",
      },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output: "suggestions (JSON or a summary), or the rewritten file with --write",
    examples: [
      {
        cmd: "archlang reroll plan.arch --json",
        note: "each candidate run as { span, replacement, count, loopVar, tokensBefore, tokensAfter }",
      },
      {
        cmd: "archlang reroll plan.arch --write --json",
        note: "splice in every proven loop; { ok, wrote, target, applied, skipped } (wrote/target as in `archlang fix`)",
      },
    ],
  },
  {
    name: "impact",
    summary: "change one number: what moved and why, what held, what broke",
    flags: [
      {
        flag: "--set",
        arg: "<NAME=value>",
        description:
          "override the root plan's top-level `let NAME` with a numeric literal (`4500` is mm, `4.5m`) and compare the plan before and after; refused with E_SET_OVERRIDE when NAME is not exactly one top-level let",
      },
      {
        flag: "--against",
        arg: "<old.arch>",
        description:
          "compare the input (the new version) against this older file instead; exactly one of --set and --against",
      },
      {
        flag: "--lock",
        arg: "<id[,id…]>",
        description:
          "elements that must not change: exit 2 with E_LOCKED_ELEMENT_CHANGED for each that moved, resized, was re-hosted, re-thickened, changed swing or kind, vanished or appeared (a relabel is not a change), with its span on both sides; a lock on an id not written as `id=` (an assigned `room_3` shifts) is refused with E_LOCK_UNNAMED. Lowest storey only, as `changed[]`",
      },
      JSON_FLAG,
      QUIET_FLAG,
    ],
    input: "<file.arch|->",
    output:
      "{ ok, set?, lets, changed[] (each with its `why` dependency chain and `root`), held[], diagnostics: { broke, healed, unchanged_count }, keeps? (when either side declares a keep: { broke, held, healed, added, removed, unchanged_count }, each { keep, grade (or { before, after } when an edit changed it), level?, occurrence, residual_mm: { before, after }, at?, changed, span }; a broken hard keep is reported here, never also under diagnostics), lock? (with --lock: { ok, checked, locked, violations[] { code, id, kind, change, detail, message, before?, after? (each { span, file? }) }, refused[] { code, id, message, hint, before?, after? } }), summary } (exit 0 on a report, 2 on a refused --set or a lock that changed, was refused or could not be checked)",
    examples: [
      {
        cmd: "archlang impact plan.arch --set W=4500 --json",
        note: "widen by one number: every moved/resized/re-hosted element with the chain that moved it, what held, what broke",
      },
      {
        cmd: "archlang impact plan.arch --against old.arch",
        note: "the same report between two versions of a plan (old.arch before, plan.arch after)",
      },
      {
        cmd: "archlang impact plan.arch --against old.arch --lock shell,entry,w1,w2 --json",
        note: "these written ids must not move, resize, re-host, swing or vanish: exit 2 with E_LOCKED_ELEMENT_CHANGED and both spans when one did",
      },
    ],
  },
  {
    name: "suggest",
    summary: "advisory door/window statements for unreachable or windowless rooms",
    flags: [JSON_FLAG, QUIET_FLAG],
    input: "<file.arch|->",
    output: "suggestions (JSON or a summary)",
    examples: [
      {
        cmd: "archlang suggest plan.arch --json",
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
      { cmd: "archlang manifest --json", note: "discover every command, flag, format, and error code in one call" },
    ],
  },
  {
    name: "spec",
    summary: "print the one-prompt language spec (spec.llm.md)",
    flags: [JSON_FLAG],
    input: "none",
    output: "the spec",
    examples: [{ cmd: "archlang spec", note: "the whole language on one page — read this before authoring" }],
  },
  {
    name: "context",
    summary: "print the full bundled agent context (spec + workflow + CLI + errors)",
    flags: [CONTEXT_LEVEL_FLAG, SECTION_FLAG, JSON_FLAG],
    input: "none",
    output: "the full agent context (llms-full.txt), one --section of it, or the one-screen --level starter",
    examples: [
      { cmd: "archlang context", note: "the cold-start bundle: spec + workflow + CLI reference + every diagnostic" },
      {
        cmd: "archlang context --level starter",
        note: "one screen for a small model: the lead example, the statements a plan needs, the loop and the five errors cold authors hit first",
      },
      {
        cmd: "archlang context --section errors",
        note: `just the diagnostic catalog (${CONTEXT_BUNDLE_KB.errors} KB) — read one section instead of paying for the whole ${CONTEXT_BUNDLE_KB.total} KB bundle`,
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
      { cmd: "archlang new --json", note: "get the starter plan as a `template` string, writing nothing" },
      { cmd: "archlang new -o plan.arch", note: "scaffold a starter file to edit" },
    ],
  },
  {
    name: "explain",
    summary: "look up an error code (cause / fix / example)",
    flags: [JSON_FLAG],
    input: "<CODE>",
    output: "catalog entry",
    examples: [
      {
        cmd: "archlang explain E_ROOM_SIZE --json",
        note: "the catalog entry for a diagnostic code: cause, fix, example",
      },
    ],
  },
];

/** Assemble the full {@link Manifest}. `version` is injected by the CLI. */
export function buildManifest(version: string): Manifest {
  return {
    name: "arch",
    invoke: CLI_NAME,
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
    // Interpolated from `src/datum.ts`, never retyped — the drift `check:drift` cannot
    // see is a language fact typed a second time into something that describes it.
    datum: {
      storeyHeight: STOREY_HEIGHT,
      doorHead: DOOR_HEAD,
      windowSill: WINDOW_SILL,
      windowHead: WINDOW_HEAD,
      casedOpeningHead: CASED_OPENING_HEAD,
      maxHeight: MAX_HEIGHT,
    },
  };
}

/** The verb names the manifest documents (incl. aliases) — used by the drift test. */
export const MANIFEST_COMMAND_NAMES: readonly string[] = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
