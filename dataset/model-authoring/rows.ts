/**
 * Model-authoring rows: one model's one-shot reply to one brief, scored and healed by the
 * deterministic tools.
 *
 * {@link deriveRow} is a pure function of its inputs (the manifest entry, the batch result line,
 * the ids, the pinned version): it extracts the reply's `.arch`, prefixes the canary comment,
 * records the L0 compile + lint diagnostics, heals with the repair split's own pipeline
 * (`recordTrajectory`: the `arch fix` fixpoint, then one `repair()`, which declines scripted
 * sources), and records the healed sources, `fix_kind`, the final verdicts, the brief's intent
 * check and the `describe()` facts that check reads. {@link verifyRow} rebuilds a row from the
 * inputs it stores and compares bytes, so every row is self-verifying.
 *
 * One-shot only: the model sees the brief once and never sees a diagnostic. Nothing here is a
 * model-repair loop.
 */

import {
  type DiagnosticJson,
  type Intent,
  compile,
  describe,
  diagnosticToJson,
  lint,
  validateIntent,
} from "../../src/index.js";
import { CANARY, CANARY_COMMENT } from "../canary.js";
import { recordTrajectory } from "../trajectory.js";
import type { ManifestEntry } from "./manifest.js";

export const CONFIG_NAME = "model-authoring";
export const GENERATOR_NAME = "archlang-dataset-model-authoring";
export const GENERATOR_VERSION = "1.0.0";

/** The reply-format instruction appended to `spec.llm.md` for the system prompt. */
export const REPLY_FORMAT =
  "You write ArchLang. Reply with one fenced ```arch code block containing the whole plan, and nothing else.";

/** The system prompt: the spec, then the reply-format instruction. */
export function systemPromptOf(spec: string): string {
  return `${spec}\n\n${REPLY_FORMAT}`;
}

/**
 * Pull the `.arch` source out of a reply: the body of the first fenced block opened by
 * ```` ```arch ```` or a bare ```` ``` ```` at a line end, up to the next ```` ``` ````; the whole
 * reply when there is none. Trimmed. Written with `indexOf`, not a lazy regex, so it is linear.
 */
export function extractArch(text: string): string {
  let from = 0;
  for (;;) {
    const i = text.indexOf("```", from);
    if (i === -1) break;
    const after = i + 3;
    let start = -1;
    if (text.startsWith("arch\n", after)) start = after + 5;
    else if (text[after] === "\n") start = after + 1;
    if (start !== -1) {
      const end = text.indexOf("```", start);
      if (end === -1) break; // no closing fence anywhere later: no block
      return text.slice(start, end).trim();
    }
    from = i + 1;
  }
  return text.trim();
}

/** The `.arch` source a row records: the canary comment line, then the extracted reply. */
export const rowSource = (reply: string): string => `${CANARY_COMMENT}\n${extractArch(reply)}\n`;

/** One line of a Message Batches results file. */
export interface ResultLine {
  custom_id: string;
  result: {
    type: "succeeded" | "errored" | "canceled" | "expired";
    message?: {
      id?: string;
      model?: string;
      content?: { type: string; text?: string }[];
      stop_reason?: string | null;
      usage?: Record<string, unknown>;
    };
    error?: unknown;
  };
}

/** The ids and pins a row carries besides its brief and its result. */
export interface RowContext {
  model: string;
  batchId: string;
  systemPromptSha256: string;
  archlangVersion: string;
}

const diagsJson = (source: string): DiagnosticJson[] => [
  ...compile(source).diagnostics.map((d) => diagnosticToJson(source, d)),
  ...lint(source).map((d) => diagnosticToJson(source, d)),
];

/** A stable projection of an intent check (the full result carries predicate objects). */
function intentSummary(source: string, intent: Intent): Record<string, unknown> {
  const r = validateIntent(source, intent);
  return {
    ok: r.ok,
    satisfied: r.satisfied,
    total: r.total,
    violations: r.violations.map((v) => ({ code: v.code, gate: v.gate, message: v.message })),
    ...(r.measures ? { measures: r.measures } : {}),
  };
}

/** The `describe()` facts the brief's intent check reads: rooms (labels, uses, areas, the
 *  rectangle a size binds to), windows and the rooms that host them, doors, the adjacency
 *  graph and the total. */
function factsOf(source: string): Record<string, unknown> {
  const s = describe(source);
  return {
    rooms: s.rooms.map((r) => ({
      id: r.id,
      label: r.label ?? null,
      uses: r.uses,
      room_type: r.room_type,
      area_m2: r.area_m2,
      bbox: r.bbox,
    })),
    total_area_m2: s.totals.floor_area_m2,
    doors: s.doors.map((d) => ({ id: d.id, between: d.between, width: d.width })),
    windows: s.windows.map((w) => ({
      id: w.id,
      room: w.room,
      width: w.width,
      ...(w.facing !== undefined ? { facing: w.facing } : {}),
    })),
    adjacency: s.input_graph,
  };
}

/** Valid = compiles with no error and draws; sound = valid and lint-clean (the eval's L0
 *  definitions). */
function stage(source: string, intent: Intent): Record<string, unknown> {
  const c = compile(source);
  const errors = c.diagnostics.filter((d) => d.severity === "error").length;
  const lintCount = lint(source).length;
  const compileWarnings = c.diagnostics.filter((d) => d.severity === "warning").length;
  const valid = errors === 0 && c.svg.length > 0;
  return {
    errors,
    warnings: compileWarnings + lintCount,
    valid,
    sound: valid && lintCount === 0,
    diagnostics: diagsJson(source),
    intent: intentSummary(source, intent),
    facts: factsOf(source),
  };
}

/** The reply text: every text block of the message, joined (as the eval harness does). */
const replyText = (line: ResultLine): string => (line.result.message?.content ?? []).map((b) => b.text ?? "").join("");

/** Build a row from a SUCCEEDED result line. Pure and deterministic. */
export function deriveRow(entry: ManifestEntry, line: ResultLine, ctx: RowContext): Record<string, unknown> {
  const msg = line.result.message ?? {};
  const raw = replyText(line);
  const source = rowSource(raw);
  const traj = recordTrajectory(source);
  const fixChanged = traj.afterFix !== source;
  const repairChanged = traj.fixedSource !== traj.afterFix;
  const fixKind = fixChanged && repairChanged ? "both" : fixChanged ? "fix" : repairChanged ? "repair" : "none";
  return {
    id: `${entry.brief_id}--${ctx.model}`,
    canary: CANARY,
    archlang_version: ctx.archlangVersion,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed: entry.seed },
    brief_id: entry.brief_id,
    brief: entry.brief,
    brief_params: entry.brief_params,
    intent: entry.intent,
    model: ctx.model,
    response_model: msg.model ?? null,
    batch_id: ctx.batchId,
    custom_id: line.custom_id,
    message_id: msg.id ?? null,
    system_prompt_sha256: ctx.systemPromptSha256,
    raw_reply: raw,
    stop_reason: msg.stop_reason ?? null,
    usage: msg.usage ?? null,
    source,
    l0: stage(source, entry.intent),
    after_fix_source: traj.afterFix,
    after_repair_source: traj.fixedSource,
    fix_kind: fixKind,
    steps: traj.steps,
    repair_unresolved: traj.repairUnresolved.map((n) => ({ id: n.id, reason: n.reason })),
    final: stage(traj.fixedSource, entry.intent),
  };
}

/** The inputs a row stores, recovered so {@link verifyRow} can rebuild it. */
function inputsOf(row: Record<string, unknown>): { entry: ManifestEntry; line: ResultLine; ctx: RowContext } {
  const gen = row.generator as { seed: number };
  return {
    entry: {
      brief_id: row.brief_id as string,
      seed: gen.seed,
      brief: row.brief as string,
      brief_params: row.brief_params as ManifestEntry["brief_params"],
      intent: row.intent as Intent,
    },
    line: {
      custom_id: row.custom_id as string,
      result: {
        type: "succeeded",
        message: {
          ...(row.message_id !== null ? { id: row.message_id as string } : {}),
          ...(row.response_model !== null ? { model: row.response_model as string } : {}),
          content: [{ type: "text", text: row.raw_reply as string }],
          stop_reason: row.stop_reason as string | null,
          ...(row.usage !== null ? { usage: row.usage as Record<string, unknown> } : {}),
        },
      },
    },
    ctx: {
      model: row.model as string,
      batchId: row.batch_id as string,
      systemPromptSha256: row.system_prompt_sha256 as string,
      archlangVersion: row.archlang_version as string,
    },
  };
}

/**
 * Re-derive a row from the brief, the raw reply and the ids it stores, with the CURRENT
 * compiler, and compare the serialization byte for byte. Only meaningful when the current
 * compiler is the row's pinned `archlang_version`; a mismatch is reported, not replayed.
 */
export function verifyRow(row: Record<string, unknown>, currentVersion: string): { ok: boolean; reason?: string } {
  if (row.archlang_version !== currentVersion)
    return { ok: false, reason: `pinned ${String(row.archlang_version)}, running ${currentVersion}` };
  if (row.canary !== CANARY) return { ok: false, reason: "canary field missing" };
  for (const k of ["source", "after_fix_source", "after_repair_source"]) {
    if (!(row[k] as string).startsWith(CANARY_COMMENT)) return { ok: false, reason: `${k} lacks the canary comment` };
  }
  const { entry, line, ctx } = inputsOf(row);
  const again = JSON.stringify(deriveRow(entry, line, ctx));
  return again === JSON.stringify(row) ? { ok: true } : { ok: false, reason: "replay differs from the stored row" };
}
