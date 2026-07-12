/**
 * `npm run dataset:gen` — the repair-trajectory + authoring dataset generator.
 *
 * Fully deterministic from `--seed`: no network, no clock, no entropy randomness. Every row
 * is self-verifying at generation time (broken source raises its fault; healed source is
 * strict-clean and idempotent; authoring intent validates), passes the dual dedup against
 * the private holdout, and carries the canary twice (a row field AND a first-line source
 * comment). A candidate that fails any gate is REJECTED and counted in the report — never
 * silently emitted or truncated.
 *
 * Writes `<out>/repair.jsonl`, `<out>/authoring.jsonl`, and `<out>/report.json`.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type DiagnosticJson, compile, describe, diagnosticToJson, lint, validateIntent } from "../src/index.js";
import { authoringFor } from "./briefs.js";
import { CANARY } from "./canary.js";
import { unifiedDiff } from "./diff.js";
import { IntraDedup, loadHoldout, structReject, textReject } from "./dedup.js";
import { FAULT_CLASSES, FAULT_FAMILIES, type FaultClass, injectFault } from "./faults.js";
import { mulberry32, pick, splitmix32 } from "./rng.js";
import { type Family, emit, generatePlan, isStrictClean } from "./templates.js";
import { recordTrajectory } from "./trajectory.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR_NAME = "archlang-dataset-gen";
const GENERATOR_VERSION = "1.0.0";
const DEFAULT_SEED = 20260712;
const DEFAULT_REPAIR_ROWS = 1200;
const DEFAULT_AUTHORING_ROWS = 400;

/** The pinned ArchLang version this corpus was generated against (read, never hardcoded). */
function archlangVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
  return pkg.version as string;
}

// ---------------------------------------------------------------------------
// Flag parsing — explicit emptiness checks (an empty-string value must fall to the
// default, the `??`-passthrough bug eval/run.ts once shipped).
// ---------------------------------------------------------------------------

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) return undefined;
  return v;
}

function intFlag(argv: string[], name: string, def: number): number {
  const raw = flagValue(argv, name);
  if (raw === undefined || raw.trim() === "") return def; // empty => default, not NaN
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

function strFlag(argv: string[], name: string, def: string): string {
  const raw = flagValue(argv, name);
  if (raw === undefined || raw.trim() === "") return def;
  return raw;
}

// ---------------------------------------------------------------------------
// Rejection bookkeeping.
// ---------------------------------------------------------------------------

class Counts {
  readonly map = new Map<string, number>();
  bump(key: string): void {
    this.map.set(key, (this.map.get(key) ?? 0) + 1);
  }
  toObject(): Record<string, number> {
    return Object.fromEntries([...this.map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }
}

// ---------------------------------------------------------------------------
// Row builders.
// ---------------------------------------------------------------------------

const diagsJson = (source: string): DiagnosticJson[] => [
  ...compile(source).diagnostics.map((d) => diagnosticToJson(source, d)),
  ...lint(source).map((d) => diagnosticToJson(source, d)),
];

const warningCount = (source: string): number =>
  compile(source).diagnostics.filter((d) => d.severity === "warning").length + lint(source).length;
const errorCount = (source: string): number => compile(source).diagnostics.filter((d) => d.severity === "error").length;

interface Generator {
  name: string;
  version: string;
  seed: number;
}

/** A repair-split row, built with an explicit stable key order. */
function buildRepairRow(
  id: string,
  version: string,
  gen: Generator,
  faultClasses: string[],
  broken: string,
  fixed: string,
  fixKind: string,
  steps: unknown[],
): Record<string, unknown> {
  return {
    id,
    canary: CANARY,
    archlang_version: version,
    generator: gen,
    fault_classes: faultClasses,
    broken_source: broken,
    diagnostics: diagsJson(broken),
    fixed_source: fixed,
    diff: unifiedDiff(broken, fixed),
    fix_kind: fixKind,
    steps,
    verification: {
      broken_raises_fault: true,
      fixed_errors: 0,
      fixed_warnings: 0,
      idempotent: true,
    },
  };
}

/** describe()-derived facts for an authoring row (a compact, stable projection). */
function factsOf(source: string): Record<string, unknown> {
  const s = describe(source);
  return {
    rooms: s.rooms.map((r) => ({
      id: r.id,
      label: r.label ?? null,
      uses: r.uses,
      room_type: r.room_type,
      area_m2: r.area_m2,
    })),
    total_area_m2: s.totals.floor_area_m2,
    doors: s.doors.map((d) => ({ id: d.id, between: d.between, width: d.width })),
    adjacency: s.input_graph,
  };
}

// ---------------------------------------------------------------------------
// Generation.
// ---------------------------------------------------------------------------

interface GenResult {
  rows: Record<string, unknown>[];
  rejections: Counts;
  byFaultClass: Counts;
  byFamily: Counts;
  byFixKind: Counts;
  attempts: number;
}

function generateRepair(
  target: number,
  masterSeed: number,
  version: string,
  holdout: ReturnType<typeof loadHoldout>,
): GenResult {
  const rows: Record<string, unknown>[] = [];
  const rejections = new Counts();
  const byFaultClass = new Counts();
  const byFamily = new Counts();
  const byFixKind = new Counts();
  const intra = new IntraDedup();
  const ids = new Set<string>();
  const maxAttempts = target * 40 + 100;

  let k = 0;
  for (; rows.length < target && k < maxAttempts; k++) {
    const rowSeed = splitmix32(masterSeed, k);
    const rng = mulberry32(rowSeed);
    const fault = FAULT_CLASSES[k % FAULT_CLASSES.length] as FaultClass;
    const family = pick(rng, FAULT_FAMILIES[fault]) as Family;

    const base = generatePlan(family, rng);
    const baseSrc = emit(base);
    if (!isStrictClean(baseSrc)) {
      rejections.bump("base-not-strict-clean");
      continue;
    }
    const injected = injectFault(fault, base);
    if (!injected) {
      rejections.bump("inject-unsupported");
      continue;
    }
    const broken = emit(injected.plan);
    const brokenCodes = new Set(diagsJson(broken).flatMap((d) => (d.code ? [d.code] : [])));
    if (!injected.faultClasses.every((c) => brokenCodes.has(c))) {
      rejections.bump("broken-missing-fault");
      continue;
    }
    const traj = recordTrajectory(broken);
    if (errorCount(traj.fixedSource) !== 0 || warningCount(traj.fixedSource) !== 0) {
      rejections.bump("fixed-not-strict-clean");
      continue;
    }
    if (recordTrajectory(traj.fixedSource).fixedSource !== traj.fixedSource) {
      rejections.bump("not-idempotent");
      continue;
    }
    const sr = structReject(traj.fixedSource, holdout);
    if (sr.reject) {
      rejections.bump("dedup-structure");
      continue;
    }
    const ir = intra.check(traj.fixedSource);
    if (ir.reject) {
      rejections.bump("dedup-intra");
      continue;
    }
    const id = `repair-${family}-${fault}-${rowSeed}`;
    if (ids.has(id)) {
      rejections.bump("duplicate-id");
      continue;
    }
    ids.add(id);

    rows.push(
      buildRepairRow(
        id,
        version,
        { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed: rowSeed },
        injected.faultClasses,
        broken,
        traj.fixedSource,
        traj.fixKind,
        traj.steps,
      ),
    );
    byFaultClass.bump(fault);
    byFamily.bump(family);
    byFixKind.bump(traj.fixKind);
  }
  return { rows, rejections, byFaultClass, byFamily, byFixKind, attempts: k };
}

const AUTHORING_FAMILIES: Family[] = ["studio", "hall-flat", "corridor"];

function generateAuthoring(
  target: number,
  masterSeed: number,
  version: string,
  holdout: ReturnType<typeof loadHoldout>,
): GenResult {
  const rows: Record<string, unknown>[] = [];
  const rejections = new Counts();
  const byFamily = new Counts();
  const intra = new IntraDedup();
  const ids = new Set<string>();
  // A disjoint seed space from the repair split (offset) so the two never collide.
  const seedBase = masterSeed ^ 0x5a5a5a5a;
  const maxAttempts = target * 40 + 100;

  let k = 0;
  for (; rows.length < target && k < maxAttempts; k++) {
    const rowSeed = splitmix32(seedBase, k);
    const rng = mulberry32(rowSeed);
    const family = AUTHORING_FAMILIES[k % AUTHORING_FAMILIES.length] as Family;

    const plan = generatePlan(family, rng);
    const source = emit(plan);
    if (!isStrictClean(source)) {
      rejections.bump("base-not-strict-clean");
      continue;
    }
    const { brief, intent } = authoringFor(plan, rng);
    const res = validateIntent(source, intent);
    if (!res.ok) {
      rejections.bump("intent-not-ok");
      continue;
    }
    if (textReject(brief, holdout).reject) {
      rejections.bump("dedup-text");
      continue;
    }
    if (structReject(source, holdout).reject) {
      rejections.bump("dedup-structure");
      continue;
    }
    if (intra.check(source).reject) {
      rejections.bump("dedup-intra");
      continue;
    }
    const id = `authoring-${family}-${rowSeed}`;
    if (ids.has(id)) {
      rejections.bump("duplicate-id");
      continue;
    }
    ids.add(id);

    rows.push({
      id,
      canary: CANARY,
      archlang_version: version,
      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION, seed: rowSeed },
      brief,
      source,
      facts: factsOf(source),
      intent,
      verification: { errors: 0, warnings: 0, intent_ok: true },
    });
    byFamily.bump(family);
  }
  return { rows, rejections, byFamily, byFaultClass: new Counts(), byFixKind: new Counts(), attempts: k };
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

/** Generate both splits + the report as in-memory strings (used by the CLI and tests). */
export function generateAll(opts: { repairRows: number; authoringRows: number; seed: number }): {
  repairJsonl: string;
  authoringJsonl: string;
  report: Record<string, unknown>;
} {
  const version = archlangVersion();
  const holdout = loadHoldout();
  const repair = generateRepair(opts.repairRows, opts.seed, version, holdout);
  const authoring = generateAuthoring(opts.authoringRows, opts.seed, version, holdout);

  const repairJsonl = repair.rows.map((r) => JSON.stringify(r)).join("\n") + (repair.rows.length ? "\n" : "");
  const authoringJsonl = authoring.rows.map((r) => JSON.stringify(r)).join("\n") + (authoring.rows.length ? "\n" : "");

  const report = {
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    archlang_version: version,
    canary: CANARY,
    seed: opts.seed,
    repair: {
      requested: opts.repairRows,
      emitted: repair.rows.length,
      attempts: repair.attempts,
      by_fault_class: repair.byFaultClass.toObject(),
      by_family: repair.byFamily.toObject(),
      by_fix_kind: repair.byFixKind.toObject(),
      rejections: repair.rejections.toObject(),
    },
    authoring: {
      requested: opts.authoringRows,
      emitted: authoring.rows.length,
      attempts: authoring.attempts,
      by_family: authoring.byFamily.toObject(),
      rejections: authoring.rejections.toObject(),
    },
  };
  return { repairJsonl, authoringJsonl, report };
}

function main(): void {
  const argv = process.argv.slice(2);
  const repairRows = intFlag(argv, "--repair-rows", DEFAULT_REPAIR_ROWS);
  const authoringRows = intFlag(argv, "--authoring-rows", DEFAULT_AUTHORING_ROWS);
  const seed = intFlag(argv, "--seed", DEFAULT_SEED);
  const outDir = resolve(REPO_ROOT, strFlag(argv, "--out", "dataset/out"));

  const { repairJsonl, authoringJsonl, report } = generateAll({ repairRows, authoringRows, seed });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "repair.jsonl"), repairJsonl, "utf8");
  writeFileSync(resolve(outDir, "authoring.jsonl"), authoringJsonl, "utf8");
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

  const rep = report.repair as Record<string, number>;
  const auth = report.authoring as Record<string, number>;
  process.stderr.write(
    `dataset: repair ${rep.emitted}/${rep.requested}, authoring ${auth.emitted}/${auth.requested} ` +
      `(seed ${seed}) → ${outDir}\n`,
  );
}

// Run only when invoked directly (not when imported by the test).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("generate.ts")) {
  main();
}
