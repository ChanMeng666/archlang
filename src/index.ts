/**
 * ArchLang — compile declarative floor-plan source to a professional SVG.
 *
 * @example
 * import { compile } from "@chanmeng666/archlang";
 * const { svg, errors } = compile(`plan "Demo" { room at (0,0) size 4000x3000 label "Room" }`);
 */

import { parse } from "./parser.js";
import { resolveAll } from "./ir.js";
import { toScene } from "./scene-build.js";
import { renderSvg } from "./backends/svg.js";
import { renderErrorSvg } from "./backends/error-svg.js";
import { offsetToLineCol } from "./diagnostics.js";
import { createRegistry, BUILTIN_REGISTRY } from "./registry.js";
import type { Runtime } from "./registry.js";
import { NULL_WORLD } from "./world.js";
import { link } from "./import.js";
import { clearLexCache } from "./lexer.js";
import { clearParseCache } from "./parser.js";
import { clearResolveCache } from "./ir.js";
import { idToken } from "./identity.js";
import type { Scene } from "./scene.js";
import type { Diagnostic } from "./diagnostics.js";
import type { CompileError, CompileOptions, CompilePage, CompileResult } from "./types.js";

export type {
  CompileError,
  CompileOptions,
  CompilePage,
  CompileResult,
  CompileWarning,
  Diagnostic,
  Span,
  Severity,
} from "./types.js";
export { formatDiagnostic, offsetToLineCol } from "./diagnostics.js";
// Agent-facing JSON projection of a diagnostic (line/col + catalogued `fix`) —
// the canonical shape the CLI's `--json` output emits, exposed for programmatic
// consumers (playground, LSP embedders, SDK users).
export { diagnosticToJson } from "./diagnostic-json.js";
export type { DiagnosticJson, FixSuggestionJson } from "./diagnostic-json.js";
// Machine-applicable fixes (v1.13): the `Diagnostic.fixes` model + a deterministic,
// pure piece-table applier (ported from rustfix). `applyFixes` filters by
// `Applicability`, applies each `FixSuggestion` atomically, and reports what it
// skipped. Fix PRODUCERS attach these; `applyFixes` consumes them.
export type { Applicability, FixEdit, FixSuggestion } from "./diagnostics.js";
export { applyFixes, rankFixes } from "./fix-apply.js";
export type { ApplyReport, ApplyFixesOptions } from "./fix-apply.js";
export type * from "./ast.js";
// Source formatter (v0.11): pure text→text, comment-preserving, idempotent.
export { format } from "./format.js";
// Vertical circulation (v1.21): the shared semantics of `stair`/`elevator`/`escalator` —
// which end a run is entered from, what it does to the nav grid, and (the part that only
// exists across storeys) which shafts join which `level` blocks. Pure, zero-dep.
export {
  entryEdges,
  flightAxis,
  isVertical,
  verticalConnections,
  verticalReach,
  verticalsOf,
  VERTICAL_KINDS,
} from "./vertical.js";
export type { RVertical, VerticalLevelInput, VerticalObstacle, VerticalReach } from "./vertical.js";
// Semantic summary (v1.1): pure source→facts. `describe(source)` returns rooms
// (areas, bboxes, adjacency), doors (what they connect), windows, and totals —
// the channel a text-only agent uses to verify a plan without rendering it.
export { describe } from "./describe.js";
export type {
  SceneSummary,
  LevelSummary,
  SheetSummary,
  VerticalSummary,
  VerticalReport,
  VerticalConnection,
  VerticalKind,
  VerticalStop,
  RoomSummary,
  DoorSummary,
  WindowSummary,
  FurnitureSummary,
  AxesSummary,
  AxisSummary,
  ScheduleRow,
  ZoneSummary,
  FreedomReport,
  FreedomElement,
  RoomPlacement,
  OpeningPlacement,
  FurniturePlacement,
  BBox,
  DescribeOptions,
  CirculationModel,
  RoomCirculation,
  CirculationRoute,
} from "./describe.js";
// Structured JSON I/O (v1.13): the machine-native RPLAN/DStruct2Design plan shape.
// `planFromJson` builds a PlanNode from JSON (catalogued E_JSON_* on bad shape),
// `planToJson` projects a resolved plan OUT with enrichments (area/floor_polygon/
// input_graph/edges), `astToJson` is a span-bearing AST projection, and `checkGraph`
// compares an intended adjacency dict to a plan's interior-door connectivity. Pure,
// deterministic, zero-dep. PLAN_JSON_SCHEMA is the JSON Schema (2020-12) source.
export {
  planFromJson,
  planToJson,
  planJsonToArch,
  resolvedToJson,
  astToJson,
  checkGraph,
  buildInputGraph,
  PLAN_JSON_SCHEMA,
  ROOM_TYPES,
  USE_TO_ROOM_TYPE,
  ROOM_TYPE_TO_USE,
  roomTypeForUses,
  usesForRoomType,
} from "./plan-json.js";
export type {
  PlanJson,
  RoomJson,
  WallJson,
  OpeningJson,
  OpeningOnJson,
  FurnitureJson,
  DimJson,
  ColumnJson,
  TitleJson,
  PointJson,
  EdgeJson,
  RoomType,
  GraphCheck,
} from "./plan-json.js";
// Intent channel (v1.14): author-time checking of a brief's INTENT against a plan.
// `validateIntent(source, intent)` compiles the intent to predicates, checks them over
// `describe()`'s facts, and returns catalogued E_INTENT_* violations with Nickel-style
// blame; `feedbackForResult` turns them into advisory correction prompts (ADR 0005).
// `intentFromJson` validates an untrusted Intent shape (pathed errors). The concept
// vocabulary (`roomsMatchingConcept`/`isKnownConcept`) is production name resolution.
// The eval consumes `compileIntent`/`checkPredicates`/`projectSubscores` (one judge, no
// eval↔prod skew). INTENT_JSON_SCHEMA is the JSON Schema (2020-12) source. Pure, zero-dep.
export {
  validateIntent,
  intentFromJson,
  feedbackForResult,
  compileIntent,
  checkPredicates,
  projectSubscores,
  INTENT_JSON_SCHEMA,
} from "./intent.js";
export type {
  Intent,
  Predicate,
  AssertionResult,
  Subscores,
  IntentViolation,
  IntentCode,
  IntentCheckResult,
} from "./intent.js";
export {
  roomsMatchingConcept,
  isKnownConcept,
  isCirculationRoom,
  CONCEPTS,
  SYNONYMS_VERSION,
} from "./intent-concepts.js";
export type { Concept } from "./intent-concepts.js";
// Semantic diff (v1.11): pure two-source→delta on top of `describe()`. `diffPlans`
// returns which rooms/openings/furniture were added/removed/resized/relabeled, per-room
// bbox edge deltas, circulation deltas, and frozen human-readable summary sentences —
// the channel ArchCanvas uses to narrate an iteration without re-rendering.
export { diffPlans } from "./diff.js";
export type { PlanDiff, RoomChange, OpeningChange, FurnitureChange, CirculationChange } from "./diff.js";
// Textual diff: a zero-dep line-based unified diff between two sources. The *syntactic*
// counterpart to `diffPlans`'s semantic delta — what `arch fix` prints so an agent can
// preview (`--dry-run`) exactly which bytes a fix pass would rewrite, and what the
// dataset generator records as each repair trajectory's patch.
export { unifiedDiff } from "./unified-diff.js";
// Architectural lint (v1.1): habitability rules as `W_*` diagnostics — every room
// enterable, bedrooms have a window, doors wide enough, the building has an entrance.
// Pure; the ruleset is data. Surfaced as `arch lint`.
export { lint, DEFAULT_RULESET, LINT_PROFILES, LINT_PROFILE_NAMES } from "./lint.js";
export type { LintOptions, LintRuleset } from "./lint.js";
// Explicit opt-in source-to-source corrector (ADR 0006): never part of compile().
export { repair } from "./repair.js";
export type { RepairResult, RepairChange, RepairNote } from "./repair.js";
// CLI capability manifest (v1.8): the whole `arch` API surface as structured data,
// for agent discovery (`arch manifest --json`). Pure; assembles existing exports.
export { buildManifest, MANIFEST_COMMAND_NAMES, EXPORT_FORMATS } from "./manifest.js";
export type { Manifest, ManifestCommand, ManifestExample, ManifestFlag, ExportFormat } from "./manifest.js";
// Markdown embedding (v1.8): extract ```arch blocks and rewrite them to image
// links. Pure text helpers behind `arch md`.
export { extractArchBlocks, rewriteMarkdown } from "./markdown.js";
export type { ArchBlock } from "./markdown.js";
// Language services (v0.11): pure LSP core (hover/completion/definition/rename/
// signature help) over the CST cursor + registry schemas. The VS Code server is
// a thin adapter; these are isomorphic and unit-testable.
export { hover, completion, definition, rename, signatureHelp, codeActions, COMPLETION_KINDS } from "./lsp.js";
export type { HoverResult, CompletionItem, CompletionKind, TextEdit, SignatureResult, CodeAction } from "./lsp.js";
// Topology suggestions (v1.13): advisory, never-applied `.arch` statements that
// would resolve a room-unreachable / bedroom-no-window fault (`arch suggest`).
// Data only (ADR 0005) — pure, deterministic, zero-dep.
export { suggestTopology } from "./suggest.js";
export type { Suggestion, SuggestionCandidate, SuggestOptions } from "./suggest.js";
// Error catalog (v0.11): every E_*/W_* code with cause/fix/example. Backs
// `arch explain <CODE>` and the generated docs/error-codes.md.
export { explain, ERROR_CATALOG, ERROR_CODES } from "./error-catalog.js";
export type { CatalogEntry } from "./error-catalog.js";

// IR + export backends (for consumers that want resolved geometry or other
// output formats). `resolve`/`toDxf` are pure & zero-dep; `toPdf` lazily loads
// optional deps. None of these are part of `compile()`.
export { resolve } from "./ir.js";
// Multi-storey resolve (v1.21): `resolveAll` is the level-aware entry — one
// `ResolvedPlan` per `level` block (`levels: []` for a single-storey plan, whose `ir` is
// exactly what `resolve()` returns). `levelBlocks(ast)` is the AST-side helper: the plan's
// storeys in drawing order (ascending, duplicates dropped).
export { levelBlocks, resolveAll } from "./ir.js";
export type { PlanResolution, ResolvedLevel } from "./ir.js";
export type {
  ResolvedPlan,
  ResolvedElement,
  RWall,
  RRoom,
  RDoor,
  RWindow,
  RFurniture,
  RDim,
  RColumn,
  RAxis,
  RZone,
} from "./ir.js";
// Scene IR (the backend-neutral drawing target) + its builder. Backends consume
// a Scene: `toDxf(scene)` / `toPdf(scene)`; build one with `toScene(ir)` or read
// `compile().scene`.
export { toScene } from "./scene-build.js";
// Positioning axes (定位轴线): the GB/T numbering rules, exposed so a tool can label an
// axis grid the same way the drawing does (`ir.axes` already carries the labels).
export { numberAxes, axisLetter, AXIS_LETTERS } from "./axes.js";
export type {
  Scene,
  SceneNode,
  ScenePrim,
  Paint,
  RenderPass,
  RenderSizes,
  SceneSheet,
  LineWeight,
  LineType,
} from "./scene.js";
// Sheet layer (v1.20): `paper A1 landscape` makes `scale` OPERATIVE — every annotation
// size becomes a fixed number of millimetres on the sheet × the scale denominator,
// instead of a fraction of the drawing's own size. Pure arithmetic; a plan with no
// `paper` never touches it and renders byte-identically. `sizesFromPaper` is the second
// `RenderSizes` constructor; `chooseScaleDenominator` is the 4-candidate auto-fit.
export {
  AUTO_SCALE_DENOMINATORS,
  chooseScaleDenominator,
  fitsOnSheet,
  PAPER_MM,
  PAPER_ORIENTATIONS,
  PAPER_SIZES,
  paperMm,
  resolveSheetSpec,
  scaleDenominator,
  SHEET_MM,
  sizesFromPaper,
  usablePlanMm,
} from "./sheet.js";
export type { PaperOrientation, PaperSize, PaperSpec, ResolvedSheet, SheetFitInput } from "./sheet.js";
// Sheet tables (v1.20): the `schedule rooms` room schedule and the `legend` derived from
// the plan's hatches + fixture symbols. Exposed so a tool can render or audit the same
// rows the drawing prints (`describe().schedule` is the schedule half as data).
export { roomSchedule, legendEntries } from "./sheet-tables.js";
export type { RoomSchedule, ScheduleGroup, LegendEntry } from "./sheet-tables.js";
export { toDxf } from "./export/dxf.js";
export { toPdf } from "./export/pdf.js";
// PNG raster backend (v1.0). Rasterizes the Scene's SVG with the OPTIONAL,
// lazy-loaded `@resvg/resvg-js`; deterministic via a bundled font. Node-only.
export { renderPng, renderPngFromSvg } from "./backends/png.js";
export type { PngOptions } from "./backends/png.js";
// Error-card backend (opt-in). `compile(src, { onError: "svg" })` and the CLI's
// `--error-svg` flag route a broken plan's diagnostics through this instead of
// leaving `svg === ""`, so agent loops/embeds always get visual feedback. Pure,
// deterministic, zero-dep; never touches the default (error-free) output.
export { renderErrorSvg } from "./backends/error-svg.js";
export type { ErrorSvgOptions } from "./backends/error-svg.js";
// ASCII text backend (v1.13). `renderAscii(scene)` serializes a Scene to a
// fixed-width text floor plan — the channel a sandboxed, text-only agent uses to
// *see* its plan. Pure, deterministic, zero-dep; behind `arch compile -f txt` and
// `arch preview --ascii`. Furniture markers use opt-in `annotate` metadata.
export { renderAscii } from "./backends/ascii.js";
export type { AsciiOptions } from "./backends/ascii.js";
// Optional polygon-geometry backend seam. The default path is zero-dependency
// (rectilinear boolean); registering a backend (e.g. the lazily-loaded
// `clipper2-wasm` adapter) unlocks seamless angled-wall joinery.
export { setGeometryBackend, getGeometryBackend } from "./geometry/backend.js";
export type { GeometryBackend, JoinKind } from "./geometry/backend.js";
export { loadClipperBackend } from "./geometry/clipper.js";
// Extensibility surface (v0.10). `compile(src, { plugins, backend, hatches, themes })`
// adds third-party elements/backends/hatches/themes per call — cache-safe, with no
// global mutation. The `register*` helpers validate + tag an extension for an opts field.
export {
  createRegistry,
  BUILTIN_REGISTRY,
  registerElement,
  registerTheme,
  registerHatch,
  registerBackend,
} from "./registry.js";
export type {
  Registry,
  Runtime,
  ElementDef,
  ParseCtx,
  ResolveCtx,
  RenderCtx,
  ThemePlugin,
  HatchPlugin,
  HatchMetaInput,
} from "./registry.js";
// World seam (v0.10): the compiler's window onto its environment (import reads,
// `now`). Pass `compile(src, { world })`; default is a pure no-op World.
export { NULL_WORLD, makeVirtualWorld } from "./world.js";
export type { World } from "./world.js";
// Theming (v0.10): named bases (`theme <name>`), per-element `style`, and opt-in
// one-colour poché derivation. THEMES are the built-in named bases.
export { THEMES, DEFAULT_THEME, mergeTheme, derivePoche, hexToHsl, hslToHex } from "./theme.js";
export type { Theme, StyleMap } from "./theme.js";
// Config sanitization (v0.10): denylist for untrusted .arch config; trusted
// CompileOptions skip it. `fnv1a` keys the per-stage memo caches.
export { sanitizeConfig, isDisallowedConfigValue } from "./sanitize.js";
export { fnv1a } from "./hash.js";

/** Small LRU-ish memo cache keyed by source+options. Bounded to 64 entries. */
const cache = new Map<string, CompileResult>();
const CACHE_MAX = 64;

/**
 * Compile ArchLang source to a professional SVG floor plan.
 *
 * Pure, synchronous, and isomorphic (Node + browser): the same `source` always
 * yields byte-identical output. The result is append-only — `{ svg, errors,
 * warnings, diagnostics, ast, scene }` — and never throws on a user-source
 * problem; errors are returned as {@link CompileResult.diagnostics} (with byte
 * spans) and reflected in `errors`, with `svg` left `""` when any error is
 * present. Results are memoized by `source` + extension identity unless
 * `opts.noCache` is set.
 *
 * The default path is zero-dependency and emits SVG; the `scene` field exposes
 * the backend-neutral {@link Scene} so consumers can target other backends
 * ({@link toDxf}, {@link toPdf}, {@link renderPng}) without re-resolving. Pass a
 * {@link World} (via `opts.world`) to resolve `import`s and inject `now`.
 *
 * @param source  ArchLang source text (a `plan "…" { … }`).
 * @param opts    Width, theme, plugins/backend/hatches/themes, world, noCache.
 * @returns A {@link CompileResult}.
 *
 * @example
 * const { svg, diagnostics, scene } = compile(`plan "Demo" {
 *   room at (0,0) size 4000x3000 label "Room"
 * }`);
 */
export function compile(source: string, opts: CompileOptions = {}): CompileResult {
  // The key includes plugin/theme/backend/hatch identity so distinct extension
  // sets never share a cache entry. Trusted, JSON-serializable `theme`/`width`
  // are embedded directly; object plugins get a stable process-local id token
  // (reused object → hit; different object → safe miss). Trailing tokens are 0
  // when absent, preserving the legacy key shape for plain compiles.
  const key = JSON.stringify([
    source,
    opts.width ?? null,
    opts.theme ?? null,
    opts.plugins?.map(idToken) ?? null,
    idToken(opts.themes),
    idToken(opts.backend),
    idToken(opts.hatches),
    idToken(opts.world),
    opts.annotate ?? null,
    opts.overlays ?? null,
    opts.onError ?? null,
    opts.accessible ?? null,
  ]);
  if (!opts.noCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const result = compileUncached(source, opts);

  if (!opts.noCache) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, result);
  }
  return result;
}

/** Project a span-carrying diagnostic onto the legacy `{message, line, col}` shape. */
function toLegacy(source: string, d: Diagnostic): CompileError {
  if (!d.span) return { message: d.message };
  const { line, col } = offsetToLineCol(source, d.span.start);
  return { message: d.message, line, col };
}

function compileUncached(source: string, opts: CompileOptions): CompileResult {
  // Per-call registry (built-ins + plugins) and runtime — fresh each compile, no
  // global mutation. Absent plugins/backend collapse to the built-in behavior.
  // Plugin-free compiles reuse the stable BUILTIN_REGISTRY so the parse/resolve
  // stage memos can hit across reparses (a fresh registry per call would defeat them).
  const registry = opts.plugins?.length ? createRegistry(opts.plugins) : BUILTIN_REGISTRY;
  const runtime: Runtime = { registry, backend: opts.backend, themes: opts.themes };
  const world = opts.world ?? NULL_WORLD;

  const { plan, diagnostics: parseDiags } = parse(source, registry);

  // parse → link (resolve `import`s through the World — the one I/O phase) →
  // resolve (AST→IR, the single place semantics live) → render. `resolveAll` is the
  // level-aware resolve: one ResolvedPlan per `level` block (none → one plan, as before).
  const linked = plan ? link(plan, world, registry) : null;
  const resolved = linked ? resolveAll(linked.plan, registry, world) : null;
  const diagnostics: Diagnostic[] = [...parseDiags, ...(linked?.diagnostics ?? []), ...(resolved?.diagnostics ?? [])];

  const errs = diagnostics.filter((d) => d.severity === "error");
  const errors = errs.map((d) => toLegacy(source, d));
  const warnings = diagnostics.filter((d) => d.severity === "warning").map((d) => toLegacy(source, d));

  // Warnings never block rendering; any error (or no plan) aborts with svg = "".
  // The Scene is built once and serialized to SVG; it is also exposed on the
  // result so consumers can target other backends (toDxf/toPdf) without re-resolving.
  // A multi-storey plan renders one page per storey, ascending — `svg`/`scene` are page 1
  // (the lowest level), so a level-unaware consumer still gets a complete drawing.
  let svg = "";
  let scene: Scene | undefined;
  let pages: CompilePage[] | undefined;
  if (resolved && errs.length === 0) {
    if (resolved.levels.length > 0) {
      pages = resolved.levels.map((l) => {
        const s = toScene(l.ir, opts, runtime);
        return { level: l.level, ...(l.name !== undefined ? { name: l.name } : {}), svg: renderSvg(s, opts), scene: s };
      });
      scene = pages[0]!.scene;
      svg = pages[0]!.svg;
    } else {
      scene = toScene(resolved.ir, opts, runtime);
      svg = renderSvg(scene, opts);
    }
  } else if (errs.length > 0 && opts.onError === "svg") {
    // Opt-in only: a broken plan yields a self-describing error card instead of
    // a blank. Default (no `onError`) leaves `svg === ""`, byte-identical to the
    // historical behavior. Errors/warnings/diagnostics are untouched.
    svg = renderErrorSvg(source, diagnostics);
  }

  // `pages` is spread so a single-storey result has no such key at all (append-only).
  return { svg, errors, warnings, diagnostics, ast: plan, scene, ...(pages ? { pages } : {}) };
}

/** Clear the internal compile cache + all per-stage memos (lex/parse/resolve). */
export function clearCache(): void {
  cache.clear();
  clearLexCache();
  clearParseCache();
  clearResolveCache();
}
