/**
 * The body of the straight-host byte-identity law for openings drawn on a curve (card ARC-W1),
 * importable without vitest, so the baseline was measured against `main`'s `src/` by this very code
 * and not a lookalike (`test/helpers/byte-identity-digest.ts` says why that matters).
 *
 * The payload is the rectilinear-rooms law's ({@link lawDigest}: every page's SVG, `describe()`,
 * `lint()`, `compile().diagnostics`, every page's Scene and the step count) plus what the change
 * touches beyond it: every page's DXF and ASCII (the ASCII backend learned the curved cover), and
 * `describe --facts symmetry`, which reads a door's leaves (`doorSwing`, now curved on an arc).
 */

import { sha256 } from "./digest.js";
import { type LawApi, lawDigest } from "./rectilinear-rooms-law.js";
import type { Scene } from "../../src/scene.js";

/** What the law reads beyond {@link LawApi}, handed in so an older tree can be measured. */
export interface ArcOpeningsLawApi extends LawApi {
  toDxf(scene: Scene): string;
  renderAscii(scene: Scene): string;
}

/** SHA-256 over {@link lawDigest}, every page's DXF and ASCII, and the symmetry facts. */
export function arcOpeningsLawDigest(api: ArcOpeningsLawApi, src: string): string {
  const out = api.compile(src, { noCache: true });
  const scenes = out.pages ? out.pages.map((p) => p.scene) : [out.scene!];
  const payload = [
    lawDigest(api, src, undefined),
    ...scenes.map((s) => api.toDxf(s)),
    ...scenes.map((s) => api.renderAscii(s)),
    JSON.stringify(api.describe(src, { facts: ["symmetry"] })),
  ].join(" ");
  return sha256(payload);
}
