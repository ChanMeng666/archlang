/**
 * The ArchLang MCP TOOL SET, transport-agnostic: every tool and resource the server offers,
 * registered on any `McpServer` the caller built. It reads nothing from disk and starts no
 * transport, so the stdio server (`server.ts`, the npm bin) and the hosted HTTP Worker
 * (`packages/mcp-worker`) register the same tools from this one module. What differs between
 * them is passed in: the resource texts (read from disk by the stdio server, bundled at build
 * time by the Worker), the link minter, and whether `png` can render there.
 */
import {
  applyFixes,
  checkGraph,
  compile,
  completion,
  describe,
  diagnosticToJson,
  type Diagnostic,
  feedbackForResult,
  finish,
  type FixSuggestion,
  intentFromJson,
  type IntentCheckResult,
  lint,
  PLAN_JSON_SCHEMA,
  planFromJson,
  planToJson,
  renderAscii,
  renderPng,
  repair,
  type Scene,
  suggestTopology,
  validateIntent,
} from "@chanmeng666/archlang";
import * as coreNamespace from "@chanmeng666/archlang";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  compilePngSentence,
  fitPngWidth,
  IN_MCPB_BUNDLE,
  PNG_MAX_WIDTH,
  PNG_MIN_WIDTH,
  pngUnavailable,
  svgPageBox,
} from "./png.js";

/**
 * Core exports newer than the oldest core this server may find installed, read through the
 * namespace rather than imported by name: a named import of an export the installed core lacks
 * fails the whole module at load, and the server keeps every other tool working on an older core
 * (see `loadPlanLinks` in server.ts). Each is `undefined` on such a core, and its one caller says so.
 */
/**
 * What a call that needs one of those exports says on a core without it. No version number: the
 * shim's own range floor admits the older core until the release that bumps it, so naming it
 * would point at a version that does not help.
 */
export const PNG_NEEDS_NEWER_CORE =
  "png needs an @chanmeng666/archlang that exports PNG_PREVIEW_WIDTH and isOptionalDepError; the installed core predates them: upgrade it";
export const JSON_PAGES_NEED_NEWER_CORE =
  "per-storey Plan JSON needs an @chanmeng666/archlang whose planToJson returns `pages`; the installed core projects only the lowest storey: upgrade it";

const newerCore = coreNamespace as Partial<Pick<typeof coreNamespace, "PNG_PREVIEW_WIDTH" | "isOptionalDepError">>;

/** What the `link` tool reports when the installed core cannot provide the `./link` subpath. */
export interface LinkUnavailable {
  ok: false;
  error: string;
}

/** The share-link minter, `@chanmeng666/archlang/link`. */
export type PlanLinksModule = typeof import("@chanmeng666/archlang/link");

/** What differs between the hosts that register this tool set. */
export interface ToolOptions {
  /** Load the link minter on first use (never at startup), or say why it cannot load. */
  loadLinks: () => Promise<PlanLinksModule | LinkUnavailable>;
  /**
   * Set when `png` can never render on this host: `compile`'s description states this sentence,
   * and a png call returns it as the error and as the `fix` of its `E_PNG_DEPENDENCY` diagnostic.
   * Unset, png behaves as the npm package / bundle do.
   */
  pngUnavailable?: string;
  /** `_meta` merged into `compile`'s tool definition and every `compile` result (a UI link). */
  compileMeta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Wrap a value as an MCP text-content tool result (pretty JSON). */
function json(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const errorCount = (ds: Diagnostic[]): number => ds.filter((d) => d.severity === "error").length;
const toJson = (source: string, ds: Diagnostic[]) => ds.map((d) => diagnosticToJson(source, d));

/** The agent-facing projection of one intent violation. The predicate objects are dropped
 *  on purpose — a band's `maxM2` can be `Infinity`, which `JSON.stringify` would null. */
const violationJson = (v: IntentCheckResult["violations"][number]) => ({
  code: v.code,
  message: v.message,
  gate: v.gate,
});

/**
 * Run a raw intent object through the same gate/meter path the CLI uses. Returns pathed
 * shape errors as DATA (never a throw) when the intent JSON is malformed; otherwise the
 * checked result plus its deterministic per-violation feedback prompts.
 */
function checkIntent(
  source: string,
  intentRaw: unknown,
): { intentErrors: string[] } | { result: IntentCheckResult; feedback: string[] } {
  const { intent, errors } = intentFromJson(intentRaw);
  if (intent === null) return { intentErrors: errors };
  const result = validateIntent(source, intent);
  return { result, feedback: feedbackForResult(result) };
}

/** Resolve a tool's `source` | `plan_json` input to `.arch` source (or JSON error diagnostics). */
function resolveSource(input: {
  source?: string;
  plan_json?: unknown;
}): { source: string } | { diagnostics: ReturnType<typeof diagnosticToJson>[] } {
  if (input.plan_json !== undefined) {
    const { source, diagnostics } = planFromJson(input.plan_json);
    if (source === undefined || errorCount(diagnostics) > 0) return { diagnostics: toJson(source ?? "", diagnostics) };
    return { source };
  }
  if (typeof input.source === "string") return { source: input.source };
  return { diagnostics: [] };
}

/**
 * `compile`'s `format:"png"` result: the drawing as MCP image content, then the usual JSON
 * result as text. The renderer is the core's lazy optional import, reached only here, on the
 * first png call; when it is absent (always, in the `.mcpb` bundle) the call returns the
 * error as data, like every other tool, never an exception.
 */
/**
 * The `E_PNG_DEPENDENCY` diagnostic a png refusal carries, as JSON. The code is the catalogued
 * one, as the CLI reports it, but its `fix` is replaced: the catalogue's says "npm install, or
 * re-run with `--install`", and `--install` is a CLI flag no MCP call has, while in the `.mcpb`
 * bundle no install can help at all. So the fix is this build's own sentence, the same one the
 * response's `error` gives.
 */
export function pngDependencyDiagnostic(source: string, inBundle: boolean = IN_MCPB_BUNDLE) {
  return pngRefusalDiagnostic(source, pngUnavailable(inBundle));
}

/** {@link pngDependencyDiagnostic} for any sentence: a host that cannot render png names its own fix. */
export function pngRefusalDiagnostic(source: string, sentence: string) {
  const dep: Diagnostic = { severity: "error", code: "E_PNG_DEPENDENCY", message: sentence };
  return { ...diagnosticToJson(source, dep), fix: sentence };
}

async function pngResult(
  source: string,
  pageScene: Scene,
  pageSvg: string,
  meta: Record<string, unknown>,
  diagnostics: ReturnType<typeof diagnosticToJson>[],
  requestedWidth: number | undefined,
  hostSaysNoPng?: string,
) {
  // The catalogued code rides INSIDE `diagnostics`, as the CLI reports it; `code` repeats it at
  // the top level for a caller that reads only that.
  const unavailable = () =>
    json({
      ok: false,
      format: "png",
      error: hostSaysNoPng ?? pngUnavailable(),
      code: "E_PNG_DEPENDENCY",
      ...meta,
      diagnostics: [
        ...diagnostics,
        hostSaysNoPng === undefined ? pngDependencyDiagnostic(source) : pngRefusalDiagnostic(source, hostSaysNoPng),
      ],
    });
  if (IN_MCPB_BUNDLE || hostSaysNoPng !== undefined) return unavailable();
  const { PNG_PREVIEW_WIDTH, isOptionalDepError } = newerCore;
  if (PNG_PREVIEW_WIDTH === undefined || isOptionalDepError === undefined)
    return json({ ok: false, format: "png", error: PNG_NEEDS_NEWER_CORE, ...meta, diagnostics });
  // A model's vision input and a host's tool-result cap both bound an image; the native render
  // is thousands of pixels wide, so png renders at the preview width unless `width` says
  // otherwise, and a tall page renders narrower so its height is bounded too.
  const width = fitPngWidth(requestedWidth ?? PNG_PREVIEW_WIDTH, svgPageBox(pageSvg));
  const warnings: Diagnostic[] = [];
  let bytes: Uint8Array;
  try {
    bytes = await renderPng(pageScene, { width, scale: 1, onDiagnostic: (d) => warnings.push(d) });
  } catch (e) {
    if (isOptionalDepError(e)) return unavailable();
    return json({ ok: false, format: "png", error: (e as Error).message ?? String(e), ...meta, diagnostics });
  }
  // The size the image actually has, read from its IHDR chunk rather than restated.
  const png = Buffer.from(bytes);
  const text = JSON.stringify(
    {
      ok: true,
      format: "png",
      ...meta,
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
      bytes: bytes.length,
      diagnostics: [...diagnostics, ...toJson(source, warnings)],
    },
    null,
    2,
  );
  // Text first: a client that reads `content[0].text` gets the result; a host that shows images
  // still shows the second block.
  return {
    content: [
      { type: "text" as const, text },
      { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
    ],
  };
}

/**
 * The `instructions` every host reads at `initialize`, on every session — so it stays short
 * (a test caps it at 900 characters). It is SKILL.md's loop, condensed: a test holds the
 * commands it names to the CLI manifest and to the order SKILL.md's loop names them in, so the
 * two cannot drift apart silently.
 */
export const INSTRUCTIONS = [
  "ArchLang compiles `.arch` text to SVG floor plans. Before writing any `.arch`, read the " +
    "`archlang://spec` resource: the whole language (from a shell: `npx -y @chanmeng666/archlang spec`).",
  "The loop:",
  "1. Write the plan as `.arch` source.",
  "2. `compile` it. Errors are diagnostics, usually with a byte span, often a fix; `fix` applies the " +
    "machine-applicable ones, edit the rest by hand.",
  "3. `describe` it; check rooms, areas and doors against the brief.",
  "4. `validate` with strict:true (parse, resolve, `lint`); fix every warning, then back to 2.",
  "5. `finish` once lint is clean, before export: it furnishes empty rectangular rooms (single-storey plans) " +
    "and adds the missing sheet statements (paper, scale, dimensions, title, room schedule, legend).",
  "With a shell, the CLI runs the same loop at no context cost: `archlang <cmd>`, " +
    "or `npx -y @chanmeng666/archlang <cmd>` without a global install.",
].join("\n");

/** The five `archlang://` context resources: [name, uri, title, description, mimeType]. */
export const RESOURCE_DEFS = [
  [
    "spec",
    "archlang://spec",
    "ArchLang language spec",
    "The whole ArchLang language on one page. Read it before writing any `.arch`.",
    "text/markdown",
  ],
  [
    "context",
    "archlang://context",
    "ArchLang full agent context",
    "The spec, the authoring workflow, the CLI reference and the error catalog in one document, for a system prompt.",
    "text/markdown",
  ],
  [
    "schema",
    "archlang://schema",
    "Plan JSON schema",
    "JSON Schema (2020-12) for the Plan-JSON object `compile` accepts as `plan_json`.",
    "application/schema+json",
  ],
  [
    "grammar",
    "archlang://grammar",
    "ArchLang GBNF grammar",
    "GBNF grammar that constrains generation to ArchLang's statement shapes; it is looser than the parser, which remains the authority.",
    "text/plain",
  ],
  [
    "intent-schema",
    "archlang://intent-schema",
    "ArchLang intent JSON schema",
    "JSON Schema (2020-12) for a brief's Intent — the shape `validate`'s `intent` and `score`'s `brief` take.",
    "application/schema+json",
  ],
] as const;

/** A resource's name in {@link RESOURCE_DEFS}: the key its text is passed under. */
export type ResourceName = (typeof RESOURCE_DEFS)[number][0];

/** Register the five context resources, each serving the text the caller supplies for it. */
export function registerResources(server: McpServer, texts: Readonly<Record<ResourceName, string>>): void {
  for (const [name, uri, title, description, mimeType] of RESOURCE_DEFS) {
    const text = texts[name];
    server.registerResource(name, uri, { title, description, mimeType }, async (u) => ({
      contents: [{ uri: u.href, mimeType, text }],
    }));
  }
}

/**
 * The MCP tool annotations every ArchLang tool carries, because each one is the same kind of
 * tool: it computes over the arguments it is given and returns text (or, for `compile` with
 * format "png", an image). None writes to the caller's environment or deletes anything
 * (`readOnlyHint`, `destructiveHint`); each result is a function of the arguments alone, so a
 * repeated call returns the same result and has no further effect (`idempotentHint`); and none
 * reaches anything outside this server (`openWorldHint`): `link` builds its URLs locally and
 * fetches nothing.
 */
export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** Register every ArchLang tool on `server`. */
export function registerTools(server: McpServer, opts: ToolOptions): void {
  /** `compile`'s handler with `opts.compileMeta`, when set, on every result it returns. */
  const withCompileMeta =
    <A, R extends object>(handler: (a: A) => Promise<R>) =>
    async (a: A): Promise<R> => {
      const result = await handler(a);
      return opts.compileMeta ? { ...result, _meta: opts.compileMeta } : result;
    };

  server.registerTool(
    "compile",
    {
      title: "Compile ArchLang → SVG, ASCII, Plan JSON or PNG",
      annotations: TOOL_ANNOTATIONS,
      description:
        'Compile ArchLang `.arch` source (or a Plan-JSON object) to an SVG floor plan, or with `format` to a plain-text ASCII plan ("txt"), Plan JSON ("json") or an image ("png"). Format "json" returns the plan as an object, with `schema` naming its JSON Schema; passed back as `plan_json` it compiles to the same drawing, unless the plan uses a part of the language Plan JSON does not carry (the sheet, styles, curves, roofs, storeys, `place`, accessibility metadata). Returns the output plus diagnostics; a diagnostic usually carries a byte span with line/col and an E_/W_ code, and often a fix, sometimes one the `fix` tool can apply. Errors come back as data, never as exceptions: read `diagnostics` and correct the source. A multi-storey plan (`level <n> { … }`) returns the lowest storey in `output` and every storey in `pages[]` ({ level, name, output }); pass `level` to render just one. ' +
        (opts.pngUnavailable ?? compilePngSentence()),
      inputSchema: {
        source: z.string().optional().describe('ArchLang source (a `plan "…" { … }`). Provide this OR plan_json.'),
        plan_json: z
          .record(z.string(), z.any())
          .optional()
          .describe("Plan JSON (RPLAN shape) as an alternative to `source`; converted to .arch then compiled."),
        format: z
          .enum(["svg", "txt", "json", "png"])
          .optional()
          .describe(
            "svg (default), txt (zero-dependency ASCII), json (Plan JSON, the shape `plan_json` takes) or png (an image; needs the optional renderer).",
          ),
        accessible: z.boolean().optional().describe("Emit <title>/<desc>/role/aria accessibility metadata (SVG only)."),
        overlay: z.enum(["circulation"]).optional().describe("Draw an opt-in circulation overlay (SVG only)."),
        level: z
          .number()
          .int()
          .optional()
          .describe("Render only this storey of a multi-storey plan. An undeclared level is an error, not a guess."),
        width: z
          .number()
          .int()
          .optional()
          .describe(
            `png only (any other format refuses it): the image width in pixels, clamped to ${PNG_MIN_WIDTH}-${PNG_MAX_WIDTH}, and narrower for a tall plan so neither side exceeds ${PNG_MAX_WIDTH}; default ${newerCore.PNG_PREVIEW_WIDTH ?? "the core's preview width"}.`,
          ),
      },
      ...(opts.compileMeta ? { _meta: opts.compileMeta } : {}),
    },
    withCompileMeta(async (a) => {
      const r = resolveSource(a);
      if ("diagnostics" in r) return json({ ok: false, diagnostics: r.diagnostics });
      const format = a.format ?? "svg";
      // `width` sizes an image; on any other format it would do nothing, so it is refused, not ignored.
      if (a.width !== undefined && format !== "png")
        return json({
          ok: false,
          format,
          error: `width applies only to format "png"; drop it for format "${format}"`,
          diagnostics: [],
        });
      const { svg, diagnostics, scene, pages } = compile(r.source, {
        noCache: true,
        ...(a.accessible ? { accessible: true } : {}),
        ...(a.overlay === "circulation" ? { overlays: ["circulation"] as const } : {}),
        ...(format === "txt" ? { annotate: true } : {}),
      });
      const diags = toJson(r.source, diagnostics);
      if (errorCount(diagnostics) > 0 || !scene) return json({ ok: false, format, diagnostics: diags });
      // `json` is the plan's model, not a drawing of the Scene: the same projection `plan_json`
      // reads back, one document per storey exactly as the drawing formats have one page each.
      const projection = format === "json" ? planToJson(r.source) : undefined;
      if (projection && !projection.json)
        return json({ ok: false, format, error: "Plan JSON projection failed", diagnostics: diags });
      // A core older than this shim projects only the lowest storey (no `pages`): say so as data
      // rather than hand back the ground floor once per storey.
      if (projection && pages && !projection.pages)
        return json({
          ok: false,
          format,
          error: JSON_PAGES_NEED_NEWER_CORE,
          diagnostics: diags,
        });
      const schema = projection ? { schema: PLAN_JSON_SCHEMA.$id } : {};
      const render = (pageSvg: string, pageScene: typeof scene, level?: number): unknown => {
        if (projection) {
          const page = level === undefined ? undefined : projection.pages?.find((p) => p.level === level);
          return page ? page.json : projection.json;
        }
        return format === "txt" ? renderAscii(pageScene) : pageSvg;
      };
      // A `level` this plan does not declare is refused with the real set — never silently
      // answered with the ground floor, which would look like a successful render of it.
      if (a.level !== undefined) {
        const levels = pages?.map((p) => p.level) ?? [];
        const want = pages?.find((p) => p.level === a.level);
        if (!want)
          return json({ ok: false, format, error: `no level ${a.level} in this plan`, levels, diagnostics: diags });
        if (format === "png")
          return pngResult(
            r.source,
            want.scene,
            want.svg,
            { level: want.level, levels },
            diags,
            a.width,
            opts.pngUnavailable,
          );
        return json({
          ok: true,
          format,
          ...schema,
          level: want.level,
          output: render(want.svg, want.scene, want.level),
          levels,
          diagnostics: diags,
        });
      }
      // One image per call: a multi-storey plan draws its lowest storey and names the rest.
      if (format === "png")
        return pngResult(
          r.source,
          scene,
          svg,
          pages ? { levels: pages.map((p) => p.level) } : {},
          diags,
          a.width,
          opts.pngUnavailable,
        );
      return json({
        ok: true,
        format,
        ...schema,
        output: render(svg, scene),
        // Present only for a genuinely multi-storey plan, so a single-storey result is unchanged.
        ...(pages
          ? {
              pages: pages.map((p) => ({
                level: p.level,
                ...(p.name !== undefined ? { name: p.name } : {}),
                output: render(p.svg, p.scene, p.level),
              })),
            }
          : {}),
        diagnostics: diags,
      });
    }),
  );

  server.registerTool(
    "describe",
    {
      title: "Describe a plan (facts, no render)",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Report a plan's facts without rendering, so you can check it against the brief without looking at an image. Returns rooms (area, bbox, adjacency, use, and the exact shape: `floor_polygon` for a `room polygon`, `floor_circle` for a `room circle`, whose area is exactly πR²), doors (what each connects), windows, circulation (walk distance, bottleneck width, detour), zones, storeys (`levels[i]` carries the same facts per floor) with the shafts that join them and which storeys stay reachable (`vertical`), the drawing extent (`bbox`, `bbox_outer`), `freedom` (which positions are hand-authored and which are derived), and totals.",
      inputSchema: { source: z.string().describe("ArchLang source.") },
    },
    async ({ source }) => {
      const s = describe(source);
      return json({ ...s, diagnostics: toJson(source, s.diagnostics) });
    },
  );

  server.registerTool(
    "lint",
    {
      title: "Lint architectural soundness",
      annotations: TOOL_ANNOTATIONS,
      description:
        'List advisory architectural-soundness warnings (`W_*` codes) as data: unreachable room, windowless bedroom, too-narrow door, blocked doorway, furniture through a wall, circuitous path, and more. `profile` selects a ruleset ("residential-basic", "accessibility-advisory", …).',
      inputSchema: {
        source: z.string().describe("ArchLang source."),
        profile: z.string().optional().describe("Advisory ruleset name (default: the built-in ruleset)."),
      },
    },
    async ({ source, profile }) => json({ ok: true, diagnostics: toJson(source, lint(source, { profile })) }),
  );

  server.registerTool(
    "validate",
    {
      title: "Validate (parse + resolve + lint)",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Check a plan in one pass without returning a drawing (parse, resolve and lint): the gate a plan passes before it ships. `strict:true` makes advisory warnings fail too. Optional `graph` checks the plan's interior-door adjacency against an intended room graph (`{ room: [neighbours] }`); a mismatch fails. Optional `intent` (a brief's expectations, shaped as the `archlang://intent-schema` resource describes) is checked against the plan: a missed gating assertion (room count, existence, area, total area, windows) fails, while adjacency and reachability are advisory and only score. A malformed intent returns `{ ok:false, intentErrors }` as data, never an exception. Returns { ok, diagnostics, graph?, intent? }.",
      inputSchema: {
        source: z.string().describe("ArchLang source."),
        strict: z.boolean().optional().describe("Advisory warnings fail too."),
        graph: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe("Intended interior-door adjacency: { room: [neighbour rooms] }."),
        intent: z
          .record(z.string(), z.any())
          .optional()
          .describe("A brief's intent JSON (shape: the archlang://intent-schema resource); gating assertions fail."),
      },
    },
    async ({ source, strict, graph, intent }) => {
      const { diagnostics } = compile(source, { noCache: true });
      const all = [...diagnostics, ...lint(source)];
      const errs = errorCount(all);
      const warns = all.length - errs;
      let graphReport: unknown;
      let graphOk = true;
      if (graph) {
        const gc = checkGraph(source, graph);
        graphOk = gc.ok;
        graphReport = {
          ok: gc.ok,
          missing_rooms: gc.missing_rooms,
          missing_connections: gc.missing_connections,
          extra_connections: gc.extra_connections,
        };
      }
      let intentBlock: Record<string, unknown> | undefined;
      let intentErrors: string[] | undefined;
      let intentOk = true;
      if (intent !== undefined) {
        const checked = checkIntent(source, intent);
        if ("intentErrors" in checked) {
          intentErrors = checked.intentErrors;
          intentOk = false;
        } else {
          const { result, feedback } = checked;
          intentOk = result.ok;
          intentBlock = {
            ok: result.ok,
            satisfied: result.satisfied,
            total: result.total,
            subscores: result.subscores,
            violations: result.violations.map(violationJson),
            feedback,
          };
        }
      }
      const ok = errs === 0 && (!strict || warns === 0) && graphOk && intentOk;
      if (intentErrors) return json({ ok: false, strict: strict ?? false, intentErrors });
      return json({
        ok,
        strict: strict ?? false,
        diagnostics: toJson(source, all),
        ...(graph ? { graph: graphReport } : {}),
        ...(intentBlock ? { intent: intentBlock } : {}),
      });
    },
  );

  server.registerTool(
    "score",
    {
      title: "Score a plan against a brief (intent meter)",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Measure how much of a brief's intent JSON a plan satisfies, without gating. Returns { ok, satisfied, total, score, subscores, violations }, where `score` is satisfied/total in [0,1] (an empty intent scores 1); call it across edits to watch a plan approach the brief. The intent's shape is the `archlang://intent-schema` resource. A malformed intent returns `{ ok:false, intentErrors }` as data, never an exception.",
      inputSchema: {
        source: z.string().describe("ArchLang source."),
        brief: z
          .record(z.string(), z.any())
          .describe("A brief's intent JSON (shape: the archlang://intent-schema resource) to measure against."),
      },
    },
    async ({ source, brief }) => {
      const checked = checkIntent(source, brief);
      if ("intentErrors" in checked) return json({ ok: false, intentErrors: checked.intentErrors });
      const { result } = checked;
      const score = result.total === 0 ? 1 : Math.round((result.satisfied / result.total) * 10000) / 10000;
      return json({
        ok: result.ok,
        satisfied: result.satisfied,
        total: result.total,
        score,
        subscores: result.subscores,
        violations: result.violations.map(violationJson),
      });
    },
  );

  server.registerTool(
    "repair",
    {
      title: "Repair furniture placement",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Correct furniture placement and return the corrected `.arch` source with a change log. It pushes furniture out of walls, doorways and door swings, separates overlapping pieces, moves fixtures that sit in the wrong room, and snaps floating pieces to walls. A piece it may not rewrite is listed in `unresolved` with the reason. It never adds doors or windows (that is a design choice); use `suggest` for those.",
      inputSchema: { source: z.string().describe("ArchLang source to correct.") },
    },
    async ({ source }) => {
      const r = repair(source);
      return json({ ok: true, changed: r.changed, changes: r.changes, unresolved: r.unresolved, source: r.source });
    },
  );

  server.registerTool(
    "fix",
    {
      title: "Apply machine-applicable diagnostic fixes",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Apply the machine-applicable fixes attached to a plan's compile diagnostics and return the edited source. It corrects source-level faults (an opening off its wall becomes the attachment form, an out-of-range position is clamped, …); furniture geometry is `repair`'s job. It runs at most 4 passes and rolls back a pass that raises the error count. `unsafe:true` also applies `maybe-incorrect` fixes. Returns { ok, passes, applied, skipped, source }.",
      inputSchema: {
        source: z.string().describe("ArchLang source to fix."),
        unsafe: z
          .boolean()
          .optional()
          .describe("Also apply `maybe-incorrect` fixes (default: machine-applicable only)."),
      },
    },
    async ({ source, unsafe }) => {
      const maxApplicability = unsafe ? ("maybe-incorrect" as const) : ("machine-applicable" as const);
      const applied: Array<{ code?: string; title: string; applicability: string }> = [];
      const skipped: Array<{ code?: string; reason: string }> = [];
      let current = source;
      let passes = 0;
      for (let pass = 0; pass < 4; pass++) {
        const { diagnostics } = compile(current, { noCache: true });
        const fixes: FixSuggestion[] = [];
        const codeOf = new Map<FixSuggestion, string | undefined>();
        for (const d of diagnostics) {
          for (const f of d.fixes ?? []) {
            fixes.push(f);
            codeOf.set(f, d.code);
          }
        }
        if (fixes.length === 0) break;
        const report = applyFixes(current, fixes, { maxApplicability });
        if (report.applied.length === 0) break;
        const errBefore = errorCount(diagnostics);
        const errAfter = errorCount(compile(report.output, { noCache: true }).diagnostics);
        if (errAfter > errBefore) break; // rolled back
        current = report.output;
        passes++;
        for (const f of report.applied)
          applied.push({ code: codeOf.get(f), title: f.title, applicability: f.applicability });
        for (const s of report.skipped) skipped.push({ code: codeOf.get(s.suggestion), reason: s.reason });
      }
      const ok = errorCount(compile(current, { noCache: true }).diagnostics) === 0;
      return json({ ok, passes, applied, skipped, source: current });
    },
  );

  server.registerTool(
    "finish",
    {
      title: "Finish the drawing",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Complete a plan for export by adding what it lacks; run it once `lint` is clean. Two stages. `furnish` puts furniture, by room use, in each rectangular room that holds none (single-storey plans; a furnished room is never touched, and one that lacks a piece its use requires is named in `unresolved` with the missing pieces, not filled; placement is `against wall` / `in <room> anchor`, never absolute). `sheet` adds the sheet statements the plan lacks (`paper`, `scale`, `dims auto`, `title`, `schedule rooms`, `legend`), choosing the finest standard scale on the smallest sheet that holds the drawing. It fills only what is missing and deletes nothing; `only` runs one stage; `reissue:true` may replace `paper`/`scale` (only those) when the drawing does not fit them. Returns { ok, changed, changes, unresolved, source }; a plan that does not compile comes back untouched with `ok:false`, and every room left empty (its use has no furniture row, or furnishing it would raise a new diagnostic) and every sheet statement left out is named in `unresolved` with the reason.",
      inputSchema: {
        source: z.string().describe("ArchLang source to finish."),
        only: z
          .enum(["sheet", "furnish"])
          .optional()
          .describe("Run only this stage. Default: `furnish`, then `sheet`."),
        reissue: z
          .boolean()
          .optional()
          .describe("Allow `paper` and `scale` to be replaced when the drawing does not fit the authored sheet."),
      },
    },
    async ({ source, only, reissue }) => {
      const r = finish(source, { ...(only ? { only } : {}), ...(reissue ? { reissue: true } : {}) });
      const ok = errorCount(compile(source, { noCache: true }).diagnostics) === 0;
      return json({ ok, changed: r.changed, changes: r.changes, unresolved: r.unresolved, source: r.source });
    },
  );

  server.registerTool(
    "suggest",
    {
      title: "Suggest topology fixes (advisory)",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Suggest the doors and windows a plan's room graph needs, as data; nothing is applied. For a room with no path back, a building with no entrance, a bath reachable only through a bedroom, or a windowless bedroom, it returns ready-to-paste `door`/`window` statements with a rationale, for you to choose among and insert. Each names its wall by an authored id or a unique wall category, else by absolute `at (x, y)` coordinates. Door candidates avoid furniture in the door's approach; window candidates do not consider furniture.",
      inputSchema: { source: z.string().describe("ArchLang source.") },
    },
    async ({ source }) => json({ ok: true, suggestions: suggestTopology(source) }),
  );

  server.registerTool(
    "complete",
    {
      title: "Completions at a source offset",
      annotations: TOOL_ANNOTATIONS,
      description:
        "List the completion items in scope at a source byte offset: keywords, element names, ids and enum values, the same items an editor's language server offers. For structured or assisted authoring.",
      inputSchema: {
        source: z.string().describe("ArchLang source."),
        at: z.number().int().nonnegative().describe("Source byte offset to complete at."),
      },
    },
    async ({ source, at }) => json({ ok: true, items: completion(source, at) }),
  );

  server.registerTool(
    "link",
    {
      title: "Share link to the rendered plan",
      annotations: TOOL_ANNOTATIONS,
      description:
        "Make two URLs that show a plan in the browser with nothing to install, for handing to a person. `playground` opens it in the hosted editor, rendered; `embed` draws it alone, for an iframe. The plan travels inside the URL, after the `#`, so it is never sent to a server and the URL carries nothing else. A plan that does not compile still gets links, and the page shows its diagnostics; `ok` says whether it compiles, and `errors` counts the errors when it does not. `bytes` is the size of the compressed plan in the URL.",
      inputSchema: { source: z.string().describe("ArchLang source.") },
    },
    async ({ source }) => {
      const link = await opts.loadLinks();
      if ("error" in link) return json(link);
      return json(link.linkResult(source, compile(source, { noCache: true }).diagnostics));
    },
  );
}
