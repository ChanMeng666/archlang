/**
 * `.arch` source → Scene3D, or a NAMED refusal. The one input path is the core's
 * `resolvePlan(source, { world })` (ADR 0031): parse → link → resolve, so imported and placed
 * content is present. A plan the core does not resolve, or one with nothing to raise, is refused
 * with a code and the reason; nothing is guessed.
 */
import * as core from "@chanmeng666/archlang";
import type { Diagnostic, World } from "@chanmeng666/archlang";
import { buildScene3D, type Storey } from "../scene3d/build.js";
import { type MixedHeightJoint, mixedHeightJoints, wallOwnership } from "../walls/ownership.js";
import { type FloorOverlap, floorOverlaps } from "../scene3d/overlap.js";
import type { Scene3D } from "../scene3d/types.js";

/** A warning of the package's own, on one storey. */
export type Warning3D = (MixedHeightJoint | FloorOverlap) & { level: number };

export type RefusalCode = "E3D_CORE_TOO_OLD" | "E3D_PLAN_ERRORS" | "E3D_NO_WALLS";

export interface Refusal {
  code: RefusalCode;
  message: string;
  /** The core's error diagnostics, for `E3D_PLAN_ERRORS`. */
  diagnostics?: Diagnostic[];
}

export type AdaptResult =
  | {
      ok: true;
      scene: Scene3D;
      storeys: Storey[];
      /** The core's diagnostics (warnings only: an error refuses). */
      diagnostics: Diagnostic[];
      /** The package's own warnings, per storey (`W3D_MIXED_HEIGHT_JOINT`, `W3D_FLOOR_OVERLAP`). */
      warnings: Warning3D[];
    }
  | { ok: false; refusal: Refusal };

export interface AdaptOptions {
  /** Where `import`s resolve; default: nothing resolves. */
  world?: World;
  /** The core version to stamp; default: `unknown`. */
  coreVersion?: string;
  /** Largest sagitta (mm) of an arc's chords; default 2 (plan §4.1, `--curve-tol`). */
  curveTolMm?: number;
}

/** The first core release expected to carry the seam (the exports are on `main`, unreleased). */
export const MIN_CORE = "the first release after 1.43.1";

export function adaptPlan(source: string, opts: AdaptOptions = {}): AdaptResult {
  // Feature-detect the export instead of failing with a TypeError on a published core that
  // predates ADR 0031 (its downstream contract, item 3).
  const resolvePlan = (core as Partial<typeof core>).resolvePlan;
  if (typeof resolvePlan !== "function") {
    return {
      ok: false,
      refusal: {
        code: "E3D_CORE_TOO_OLD",
        message: `@chanmeng666/archlang does not export resolvePlan; archlang-3d needs ${MIN_CORE}.`,
      },
    };
  }
  const res = resolvePlan(source, opts.world ? { world: opts.world } : {});
  const errors = res.diagnostics.filter((d) => d.severity === "error");
  if (!res.ir || errors.length > 0) {
    const codes = [...new Set(errors.map((d) => d.code))].join(", ");
    return {
      ok: false,
      refusal: {
        code: "E3D_PLAN_ERRORS",
        message: `The plan does not resolve (${codes || "no IR"}); fix it with \`arch validate\` first.`,
        diagnostics: errors,
      },
    };
  }
  const storeys: Storey[] =
    res.levels.length > 0
      ? res.levels.map((l) => ({ level: l.level, ...(l.name ? { name: l.name } : {}), ir: l.ir }))
      : [{ level: 1, ir: res.ir }];
  if (storeys.every((s) => s.ir.walls.length === 0)) {
    return {
      ok: false,
      refusal: { code: "E3D_NO_WALLS", message: "The plan has no walls, so there is nothing to raise." },
    };
  }
  const scene = buildScene3D(storeys, {
    coreVersion: opts.coreVersion ?? "unknown",
    ...(opts.curveTolMm !== undefined ? { curveTolMm: opts.curveTolMm } : {}),
  });
  return {
    ok: true,
    scene,
    storeys,
    diagnostics: res.diagnostics,
    warnings: [
      ...storeys.flatMap((s) => mixedHeightJoints(wallOwnership(s.ir.walls)).map((w) => ({ ...w, level: s.level }))),
      ...scene.levels.flatMap((lv) => floorOverlaps(lv.floors).map((w) => ({ ...w, level: lv.level }))),
    ],
  };
}
