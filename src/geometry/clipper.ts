/**
 * Optional {@link GeometryBackend} adapter over `clipper2-wasm`.
 *
 * `clipper2-wasm` is an **optional** dependency (declared in
 * `optionalDependencies`, pinned for determinism). This module is the only place
 * that references it, and it does so via a lazy `import()` so the core bundle
 * never hard-requires it — exactly how `export/pdf.ts` loads `pdfkit`. When the
 * package is absent, {@link loadClipperBackend} rejects with an actionable error
 * and callers fall back to the zero-dependency rectilinear path.
 *
 * Clipper works in an integer coordinate space. ArchLang points are millimetres
 * (grid-snapped, but angled-segment offset corners are fractional), so we scale
 * by {@link SCALE} and round on the way in, then divide on the way out. Rounding
 * is deterministic, so the engine's output is stable run-to-run.
 */

import type { Point } from "../ast.js";
import type { GeometryBackend, JoinKind } from "./backend.js";

/** Integer scale factor: 1000 ⇒ sub-micron precision into the integer engine. */
const SCALE = 1000;

/** Minimal structural view of the `clipper2-wasm` module we depend on. */
interface Clipper2Module {
  FillRule: { NonZero: unknown };
  JoinType: { Square: unknown; Round: unknown; Miter: unknown };
  EndType: { Polygon: unknown; Square: unknown };
  Paths64: new () => Paths64;
  MakePath64(coords: number[]): Path64;
  Union64(subjects: Paths64, clips: Paths64, fillRule: unknown): Paths64;
  Difference64(subjects: Paths64, clips: Paths64, fillRule: unknown): Paths64;
  InflatePaths64(
    paths: Paths64,
    delta: number,
    joinType: unknown,
    endType: unknown,
    miterLimit: number,
    arcTolerance: number,
  ): Paths64;
}
interface Path64 {
  size(): number;
  get(i: number): { x: bigint; y: bigint; delete(): void };
  delete(): void;
}
interface Paths64 {
  push_back(p: Path64): void;
  size(): number;
  get(i: number): Path64;
  delete(): void;
}

/** Memoized module instance — the WASM is instantiated at most once per process. */
let modulePromise: Promise<Clipper2Module> | null = null;

async function loadModule(): Promise<Clipper2Module> {
  if (modulePromise) return modulePromise;
  modulePromise = (async () => {
    let factory: () => Promise<Clipper2Module>;
    try {
      const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ "clipper2-wasm" as string)) as {
        default?: unknown;
      };
      factory = (mod.default ?? mod) as () => Promise<Clipper2Module>;
    } catch {
      throw new Error(
        "Angled-wall geometry needs the optional dependency 'clipper2-wasm'. Install it: npm install clipper2-wasm",
      );
    }
    return factory();
  })();
  return modulePromise;
}

/** Build a Clipper `Paths64` from polygon loops (caller must `.delete()` it). */
function toPaths64(m: Clipper2Module, polys: Point[][]): Paths64 {
  const paths = new m.Paths64();
  for (const poly of polys) {
    const coords: number[] = [];
    for (const p of poly) {
      coords.push(Math.round(p.x * SCALE), Math.round(p.y * SCALE));
    }
    const path = m.MakePath64(coords);
    paths.push_back(path); // push_back copies by value
    path.delete();
  }
  return paths;
}

/** Read a Clipper `Paths64` back into plain millimetre loops, freeing the WASM objects. */
function fromPaths64(paths: Paths64): Point[][] {
  const loops: Point[][] = [];
  const n = paths.size();
  for (let i = 0; i < n; i++) {
    const path = paths.get(i);
    const loop: Point[] = [];
    const m = path.size();
    for (let j = 0; j < m; j++) {
      const pt = path.get(j);
      loop.push({ x: Number(pt.x) / SCALE, y: Number(pt.y) / SCALE });
      pt.delete();
    }
    path.delete();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function joinType(m: Clipper2Module, join: JoinKind): unknown {
  return join === "miter" ? m.JoinType.Miter : join === "round" ? m.JoinType.Round : m.JoinType.Square;
}

/**
 * Load the `clipper2-wasm` adapter. Rejects with an actionable error when the
 * optional dependency is not installed. The returned backend's operations are
 * synchronous (the WASM is already instantiated), so it can be registered via
 * `setGeometryBackend` and consulted from the synchronous `toScene` pipeline.
 */
export async function loadClipperBackend(): Promise<GeometryBackend> {
  const m = await loadModule();
  const NZ = m.FillRule.NonZero;

  return {
    union(polys: Point[][]): Point[][] {
      if (polys.length === 0) return [];
      const subj = toPaths64(m, polys);
      const clips = new m.Paths64();
      const res = m.Union64(subj, clips, NZ);
      const out = fromPaths64(res);
      res.delete();
      subj.delete();
      clips.delete();
      return out;
    },
    difference(subjPolys: Point[][], clipPolys: Point[][]): Point[][] {
      if (subjPolys.length === 0) return [];
      const subj = toPaths64(m, subjPolys);
      const clip = toPaths64(m, clipPolys);
      const res = m.Difference64(subj, clip, NZ);
      const out = fromPaths64(res);
      res.delete();
      subj.delete();
      clip.delete();
      return out;
    },
    offset(path: Point[], delta: number, join: JoinKind): Point[][] {
      const paths = toPaths64(m, [path]);
      const res = m.InflatePaths64(paths, delta * SCALE, joinType(m, join), m.EndType.Polygon, 2, 0);
      const out = fromPaths64(res);
      res.delete();
      paths.delete();
      return out;
    },
  };
}
