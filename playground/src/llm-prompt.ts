/**
 * Assemble a single paste-ready prompt for an AI assistant from the current
 * plan: an intro line, the source in an ```arch fence, the compact `describe()`
 * facts (rooms/areas/adjacency + an access summary), the diagnostics with
 * line/col/fix, and a pointer to the language spec. Pure and deterministic so it
 * can be unit-tested — the UI wiring (button + clipboard) lives in actions.ts.
 */
import type { DiagnosticJson, SceneSummary } from "archlang";

export interface LlmPromptInput {
  /** The current editor source. */
  source: string;
  /** `describe()` output for the same source (diagnostics field is ignored here). */
  facts: SceneSummary;
  /** The current diagnostics, already projected via `diagnosticToJson`. */
  diagnostics: DiagnosticJson[];
}

/** The compact facts object embedded in the prompt — a small, stable subset of
 *  `describe()` (rooms with areas/uses/adjacency + an access summary). */
interface CompactFacts {
  plan: string;
  units: "mm";
  totals: SceneSummary["totals"];
  rooms: Array<{ id: string; label?: string; area_m2: number; uses: string[]; adjacent: string[] }>;
  access: { hasEntrance: boolean; entrances: string[]; unreachable: string[] };
}

/** Project the full describe() summary down to the compact, prompt-sized subset. */
function compactFacts(facts: SceneSummary): CompactFacts {
  return {
    plan: facts.plan,
    units: facts.units,
    totals: facts.totals,
    rooms: facts.rooms.map((r) => ({
      id: r.id,
      ...(r.label != null ? { label: r.label } : {}),
      area_m2: r.area_m2,
      uses: r.uses,
      adjacent: r.adjacent,
    })),
    access: {
      hasEntrance: facts.access.hasEntrance,
      entrances: facts.access.entrances,
      unreachable: facts.access.rooms.filter((r) => r.reachable === false).map((r) => r.id),
    },
  };
}

/** One human-readable line per diagnostic: `- [severity] CODE at line:col — message` + a `fix:` line. */
function renderDiagnostics(diagnostics: DiagnosticJson[]): string {
  if (diagnostics.length === 0) return "None — the plan compiles clean.";
  return diagnostics
    .map((d) => {
      const loc = d.line != null && d.col != null ? ` at ${d.line}:${d.col}` : "";
      const code = d.code ?? d.severity;
      const head = `- [${d.severity}] ${code}${loc} — ${d.message}`;
      return d.fix ? `${head}\n  fix: ${d.fix}` : head;
    })
    .join("\n");
}

/**
 * Build the full paste-ready prompt string. Deterministic given its inputs —
 * no clock, no randomness — so the same plan always yields the same text.
 */
export function buildLlmPrompt({ source, facts, diagnostics }: LlmPromptInput): string {
  return [
    "This is an ArchLang floor plan — a small declarative language that compiles to professional SVG floor plans. Below are the source, the computed semantic facts, and the current compiler diagnostics.",
    "",
    "## Source",
    "```arch",
    source.replace(/\n+$/, ""),
    "```",
    "",
    "## Facts (from `describe`)",
    "```json",
    JSON.stringify(compactFacts(facts), null, 2),
    "```",
    "",
    "## Diagnostics",
    renderDiagnostics(diagnostics),
    "",
    "Full language spec: run `npx @chanmeng666/archlang spec` or see https://archlang.uk/spec",
  ].join("\n");
}
