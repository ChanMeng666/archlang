/**
 * One Scene per resolved plan and drawing options, shared by `compile()` and `lint()`.
 *
 * `annotation-overlap` (`lint/rules/annotations.ts`) reads the annotated Scene of each storey,
 * and the playground's render has just drawn that very Scene in `compile()` (same source, so
 * the parse and resolve memos hand both the same `ResolvedPlan`). Rebuilding it inside lint was
 * the largest single cost of the rule. So `lint()` asks here ({@link memoScene}) and the
 * pipeline offers what it drew ({@link offerScene}); output is byte-identical, because a hit
 * returns a Scene equal, field for field, to the one a miss draws (less the `walls` projection).
 *
 * The key is IDENTITY: the `ResolvedPlan` object, the registry and the `themes` list, plus
 * the three options that change the Scene, as booleans: `annotate` (spans and labels on each
 * node), `accessible` (the Scene's `name`/`caption`) and the `circulation` overlay. `width`
 * and `onError` are the SVG's alone; `view` is drawn by `toIso`, never here. A Scene drawn under
 * an API `theme` is never kept: its key would be the theme's content, and no reader asks for
 * one. A fresh resolve is a fresh object, so it can never hit a Scene drawn for another plan.
 *
 * The memo never hands out a Scene that anybody else holds. `compile().scene` is public and a
 * caller may mutate it, so the pipeline's offer is stored as a deep copy of its data, taken
 * before the SVG is written; and a Scene the memo draws itself is only ever read by lint, never
 * returned to a caller. The copy has no `walls`/`parts` (the lazy DXF projections), hence
 * {@link SharedScene}. Copying costs about a tenth of drawing, so the pipeline pays it only for
 * options some `memoScene` call has asked for in this process: a compile-only caller never pays it.
 *
 * Bounded by count AND weight, because the hosted MCP tools call `lint()` with no compile before
 * it, in 128 MB isolates: at most {@link SCENE_MEMO_MAX} Scenes and {@link SCENE_MEMO_MAX_NODES}
 * Scene nodes across them, oldest out first until both hold; a Scene of more than
 * {@link SCENE_MEMO_MAX_SCENE_NODES} nodes is never kept (it is drawn, read and dropped, as before).
 * Weight is `scene.nodes.length`, which costs nothing to read. `clearCache()` (`src/index.ts`)
 * empties it. A hit changes no budget: the drawing budget is estimated from the IR before anything
 * is drawn, by `compile()` and by the rule alike.
 *
 * The memo assumes `toScene` is a pure function of its key; a test that swaps a drawing module by
 * mock must `clearCache()` around the swap.
 */

import type { ResolvedPlan } from "./ir.js";
import type { Registry, Runtime } from "./registry.js";
import { BUILTIN_RUNTIME } from "./registry.js";
import type { Scene } from "./scene.js";
import { toScene } from "./scene-build.js";
import type { CompileOptions } from "./types.js";

/** A memoised Scene: read-only, without the DXF projections a copy does not carry. */
export type SharedScene = Omit<Scene, "walls" | "parts">;

/** Scenes kept: the storeys of the last plan or two. */
export const SCENE_MEMO_MAX = 4;
/** The most Scene nodes kept across all entries (a hosted isolate has 128 MB). */
export const SCENE_MEMO_MAX_NODES = 150_000;
/** A Scene with more nodes than this is never kept. */
export const SCENE_MEMO_MAX_SCENE_NODES = 60_000;

/** Distinct draw keys remembered as asked for (each is two references and a string). */
const ASKED_MAX = 8;

/** Everything but the plan that a Scene's key holds. */
interface DrawKey {
  registry: Registry;
  themes: Runtime["themes"];
  /** `annotate`, `accessible`, the `circulation` overlay, as `0`/`1`. */
  flags: string;
}

interface Entry extends DrawKey {
  ir: ResolvedPlan;
  scene: SharedScene;
}

const entries: Entry[] = [];
/** `scene.nodes.length` summed over {@link entries}. */
let nodesKept = 0;
let hits = 0;
/** The draw keys {@link memoScene} has been asked for, so an offer copies only what may be read. */
const asked: DrawKey[] = [];

/** The draw key, or `undefined` for options the memo does not keep (an API `theme`). */
function drawKey(opts: CompileOptions, runtime: Runtime): DrawKey | undefined {
  if (opts.theme !== undefined) return undefined;
  const flags = `${opts.annotate ? 1 : 0}${opts.accessible ? 1 : 0}${opts.overlays?.includes("circulation") ? 1 : 0}`;
  return { registry: runtime.registry, themes: runtime.themes, flags };
}

const sameKey = (a: DrawKey, b: DrawKey): boolean =>
  a.registry === b.registry && a.themes === b.themes && a.flags === b.flags;

function find(ir: ResolvedPlan, key: DrawKey): Entry | undefined {
  return entries.find((e) => e.ir === ir && sameKey(e, key));
}

/** Too heavy to keep on its own: {@link SCENE_MEMO_MAX_SCENE_NODES}. */
const tooHeavy = (scene: { nodes: readonly unknown[] }): boolean => scene.nodes.length > SCENE_MEMO_MAX_SCENE_NODES;

/** Keep `scene`, then drop the oldest until both bounds hold (the newest always fits on its own). */
function keep(ir: ResolvedPlan, key: DrawKey, scene: SharedScene): void {
  if (tooHeavy(scene)) return;
  entries.push({ ...key, ir, scene });
  nodesKept += scene.nodes.length;
  while (entries.length > SCENE_MEMO_MAX || nodesKept > SCENE_MEMO_MAX_NODES) {
    nodesKept -= entries.shift()!.scene.nodes.length;
  }
}

/**
 * `toScene(ir, opts, runtime)`, drawn once per key. The result is the memo's own: read it, never
 * mutate it, never return it to a caller.
 */
export function memoScene(
  ir: ResolvedPlan,
  opts: CompileOptions = {},
  runtime: Runtime = BUILTIN_RUNTIME,
): SharedScene {
  const key = drawKey(opts, runtime);
  if (key === undefined) return toScene(ir, opts, runtime);
  if (!asked.some((k) => sameKey(k, key))) {
    if (asked.length >= ASKED_MAX) asked.shift();
    asked.push(key);
  }
  const hit = find(ir, key);
  if (hit) {
    hits++;
    return hit.scene;
  }
  const scene = toScene(ir, opts, runtime);
  keep(ir, key, scene);
  return scene;
}

/**
 * Offer a Scene the pipeline has just drawn with `toScene(ir, opts, runtime)` and is about to
 * hand out. Kept as a deep copy, and only when a {@link memoScene} call has asked for this key.
 * Call it before anything reads or writes the Scene.
 */
export function offerScene(ir: ResolvedPlan, opts: CompileOptions, runtime: Runtime, scene: Scene): void {
  const key = drawKey(opts, runtime);
  if (key === undefined || tooHeavy(scene) || !asked.some((k) => sameKey(k, key)) || find(ir, key)) return;
  keep(ir, key, copyScene(scene));
}

/**
 * A deep copy of the Scene's data without `walls`, whose enumerable getter projects every wall on
 * first read: copying it would run that projection on the caller's Scene, which no lint reads.
 */
function copyScene(scene: Scene): SharedScene {
  const data = scene as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(data)) if (k !== "walls") out[k] = copyData(data[k]);
  return out as unknown as SharedScene;
}

/** A deep copy of plain data (objects, arrays, primitives: all a Scene holds). */
function copyData<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const out: unknown[] = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = copyData(v[i]);
    return out as T;
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = copyData((v as Record<string, unknown>)[k]);
  return out as T;
}

/** Empty the memo and its record of asked keys (`clearCache()`). */
export function clearSceneMemo(): void {
  entries.length = 0;
  nodesKept = 0;
  asked.length = 0;
  hits = 0;
}

/** Test seam: the Scenes kept, their nodes, and how many `memoScene` calls were answered from them. */
export function sceneMemoStats(): { size: number; nodes: number; hits: number } {
  return { size: entries.length, nodes: nodesKept, hits };
}
