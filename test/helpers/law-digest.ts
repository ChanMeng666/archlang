/**
 * The body of the rectilinear-rooms byte-identity law ({@link lawDigest}) and its row type, moved here
 * verbatim from `./rectilinear-rooms-law.ts` (which re-exports both) so a law that pins only plans of its
 * own can share the body without importing a module that lists the corpus.
 *
 * The payload is the repository's whole-surface one ({@link allStoreysDiagnosticsPayload}: every
 * page's SVG, `describe()`, `lint()`, `compile().diagnostics`) plus the two things that surface
 * cannot show: the Scene of every page, and the evaluation steps the resolution spends.
 */

import { sha256 } from "./digest.js";
import { allStoreysDiagnosticsPayload, type CompilerApi } from "./byte-identity-payload.js";
import type { World } from "../../src/world.js";

/** The compiler surface the law reads, handed in so an older tree can be measured. */
export interface LawApi extends CompilerApi {
  /** The steps a source's whole resolution spends, every storey. */
  stepsOf(src: string, world: World | undefined): number;
}

/** SHA-256 over the whole-surface payload, every page's Scene and the step count. */
export function lawDigest(api: LawApi, src: string, world: World | undefined): string {
  const opts = world ? { world } : {};
  const out = api.compile(src, { noCache: true, ...opts });
  const scenes = out.pages ? out.pages.map((p) => p.scene) : [out.scene];
  const payload = [
    allStoreysDiagnosticsPayload(api, src, opts),
    JSON.stringify(scenes),
    String(api.stepsOf(src, world)),
  ].join(" ");
  return sha256(payload);
}

/** A plan the law pins: `dir` is what an `import` of its is read against. */
export interface LawRow {
  name: string;
  src: string;
  dir?: string;
}
