/**
 * ArchLang MCP server — a thin stdio Model Context Protocol shim over the
 * `@chanmeng666/archlang` LIBRARY (never a subprocess of the CLI). Every tool
 * wraps one pure, exported function; the core stays zero-dependency — the MCP SDK
 * lives ONLY in this package.
 *
 * Positioning (ADR 0012): the agent-native `arch` CLI remains the primary
 * interface — it costs nothing in an agent's context window until it is called,
 * whereas an MCP tool schema sits in the window permanently. This server exists so
 * MCP-speaking hosts can *discover* ArchLang through the registry; it is the
 * discoverability channel, not a replacement for the CLI.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFixes,
  checkGraph,
  compile,
  completion,
  describe,
  diagnosticToJson,
  type Diagnostic,
  type FixSuggestion,
  lint,
  planFromJson,
  renderAscii,
  repair,
  suggestTopology,
} from "@chanmeng666/archlang";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
// Repo root when the server runs from src/ (tests); irrelevant but harmless from dist/.
const REPO = resolve(HERE, "..", "..", "..");

/** Read a shipped resource: flat next to the built server (dist/), else the repo tree. */
function readResource(flat: string, repoRel: string): string {
  for (const p of [resolve(HERE, flat), resolve(REPO, repoRel)]) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return `(${flat} not found — run \`npm run mcp:build\`)`;
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

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------

/** Build the fully-configured ArchLang MCP server (tools + resources). */
export function createServer(): McpServer {
  const server = new McpServer({ name: "archlang", version: "0.1.0" });

  server.registerTool(
    "compile",
    {
      title: "Compile ArchLang → SVG or ASCII",
      description:
        'Compile ArchLang `.arch` source (or a Plan-JSON object) to an SVG floor plan, or to a zero-dependency ASCII text plan (format:"txt"). Returns the rendered output plus diagnostics — each a byte span, line/col, catalogued E_/W_ code, and a machine-applicable fix. Errors are DATA, never exceptions: read `diagnostics` and correct the source.',
      inputSchema: {
        source: z.string().optional().describe('ArchLang source (a `plan "…" { … }`). Provide this OR plan_json.'),
        plan_json: z
          .record(z.any())
          .optional()
          .describe("Plan JSON (RPLAN shape) as an alternative to `source`; converted to .arch then compiled."),
        format: z.enum(["svg", "txt"]).optional().describe("svg (default) or txt (zero-dependency ASCII)."),
        accessible: z.boolean().optional().describe("Emit <title>/<desc>/role/aria accessibility metadata (SVG only)."),
        overlay: z.enum(["circulation"]).optional().describe("Draw an opt-in circulation overlay (SVG only)."),
      },
    },
    async (a) => {
      const r = resolveSource(a);
      if ("diagnostics" in r) return json({ ok: false, diagnostics: r.diagnostics });
      const format = a.format ?? "svg";
      const { svg, diagnostics, scene } = compile(r.source, {
        noCache: true,
        ...(a.accessible ? { accessible: true } : {}),
        ...(a.overlay === "circulation" ? { overlays: ["circulation"] as const } : {}),
        ...(format === "txt" ? { annotate: true } : {}),
      });
      const diags = toJson(r.source, diagnostics);
      if (errorCount(diagnostics) > 0 || !scene) return json({ ok: false, format, diagnostics: diags });
      return json({ ok: true, format, output: format === "txt" ? renderAscii(scene) : svg, diagnostics: diags });
    },
  );

  server.registerTool(
    "describe",
    {
      title: "Describe a plan (facts, no render)",
      description:
        "Semantic facts about a plan without rendering: rooms (areas, bboxes, adjacency, uses), doors (what they connect), windows, circulation (walk distance / bottleneck width / detour), and totals. The channel a text-only agent uses to VERIFY that a plan matches intent.",
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
      description:
        'Advisory `W_*` soundness warnings as data: unreachable room, windowless bedroom, too-narrow door, blocked doorway, furniture through a wall, circuitous path, and more. `profile` selects a ruleset (e.g. "residential-basic", "accessibility-advisory").',
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
      description:
        "The ship gate: parse + resolve + lint in one pass, no render. `strict:true` makes advisory warnings fail too. Optional `graph` checks the plan's interior-door adjacency against an intended room graph (`{ room: [neighbours] }`); a mismatch fails. Returns { ok, diagnostics, graph? }.",
      inputSchema: {
        source: z.string().describe("ArchLang source."),
        strict: z.boolean().optional().describe("Advisory warnings fail too."),
        graph: z
          .record(z.array(z.string()))
          .optional()
          .describe("Intended interior-door adjacency: { room: [neighbour rooms] }."),
      },
    },
    async ({ source, strict, graph }) => {
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
      const ok = errs === 0 && (!strict || warns === 0) && graphOk;
      return json({
        ok,
        strict: strict ?? false,
        diagnostics: toJson(source, all),
        ...(graph ? { graph: graphReport } : {}),
      });
    },
  );

  server.registerTool(
    "repair",
    {
      title: "Repair furniture placement",
      description:
        "The explicit source-to-source corrector (ADR 0006): push furniture out of walls / doorways / swing arcs, separate overlaps, relocate wrong-room fixtures, snap floating pieces to walls. Returns corrected `.arch` source + a change log. It NEVER adds doors or windows — that is a design choice; use `suggest` for topology.",
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
      description:
        "Apply the machine-applicable fixes a compile attaches to its diagnostics — the SYNTACTIC corrector (off-wall openings → the attachment form, out-of-range positions clamped, …), distinct from `repair`'s geometric solver. Bounded fixpoint (≤4 passes; a pass that raises the error count is rolled back). `unsafe:true` also applies `maybe-incorrect` fixes. Returns { ok, passes, applied, skipped, source }.",
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
    "suggest",
    {
      title: "Suggest topology fixes (advisory)",
      description:
        "Advisory topology suggestions as DATA — never applied (ADR 0005). For a room with no path to the entrance or a bedroom with no window, returns ready-to-paste `door`/`window` statements (attachment form) plus a rationale, for the agent to choose among and insert.",
      inputSchema: { source: z.string().describe("ArchLang source.") },
    },
    async ({ source }) => json({ ok: true, suggestions: suggestTopology(source) }),
  );

  server.registerTool(
    "complete",
    {
      title: "Completions at a source offset",
      description:
        "Completion items in scope at a source BYTE offset (the LSP `completion()` core): keywords, element names, ids, enum values — for structured or assisted authoring.",
      inputSchema: {
        source: z.string().describe("ArchLang source."),
        at: z.number().int().nonnegative().describe("Source byte offset to complete at."),
      },
    },
    async ({ source, at }) => json({ ok: true, items: completion(source, at) }),
  );

  // Resources: the static context artifacts, read once at server start.
  const RESOURCES: Array<[string, string, string, string, string, string]> = [
    [
      "spec",
      "archlang://spec",
      "ArchLang language spec",
      "The whole language in one page (spec.llm.md).",
      "text/markdown",
      readResource("spec.llm.md", "spec.llm.md"),
    ],
    [
      "context",
      "archlang://context",
      "ArchLang full agent context",
      "Spec + workflow skill + CLI reference + error catalog (llms-full.txt) — drop into a system prompt.",
      "text/markdown",
      readResource("llms-full.txt", "llms-full.txt"),
    ],
    [
      "schema",
      "archlang://schema",
      "Plan JSON schema",
      "JSON Schema (2020-12) for the Plan-JSON compile input.",
      "application/schema+json",
      readResource("plan.schema.json", "schemas/plan.schema.json"),
    ],
    [
      "grammar",
      "archlang://grammar",
      "ArchLang GBNF grammar",
      "GBNF constrained-decoding grammar for guaranteed-parseable generation.",
      "text/plain",
      readResource("archlang.gbnf", "grammars/archlang.gbnf"),
    ],
  ];
  for (const [name, uri, title, description, mimeType, text] of RESOURCES) {
    server.registerResource(name, uri, { title, description, mimeType }, async (u) => ({
      contents: [{ uri: u.href, mimeType, text }],
    }));
  }

  return server;
}

/** Start the server over stdio (the bin entry). */
async function main(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}

// Run only when executed directly as the bin — not when imported by a test.
// realpath both sides so a `node_modules/.bin` symlink still matches.
const invokedDirectly = (() => {
  try {
    return (
      process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();
if (invokedDirectly) void main();
