/**
 * The Node-only entry: a `World` over the file system. Kept out of `src/index.ts` so the
 * browser bundle (adapter + Scene3D) never pulls a `node:*` module (`test/browser-safety.test.ts`).
 */
/** A rooted World over the file system: `import` reads only `.arch` files under its roots (`world.ts`). */
export { makeNodeWorld } from "./world.js";

export {
  PREVIEW_ABOUT_URL,
  PREVIEW_LABEL,
  PREVIEW_LEAD,
  PREVIEW_LIMITS,
  replayHtml,
  replayPayload,
  viewBoxOf,
  viewerScript,
} from "./replay/html.js";
export type { ReplayHtmlOptions, ReplayNotice, ReplayOptions } from "./replay/html.js";
export { replayFacts } from "./replay/facts.js";
export type { FactsOptions } from "./replay/facts.js";
export { stripAt } from "./replay/strip.js";
export type { ReplayFacts, StripItem } from "./replay/strip.js";
export { renderReplay, SWIFTSHADER_ARGS } from "./replay/video.js";
export type { KeyFrame, VideoOptions, VideoReport } from "./replay/video.js";
export {
  bodyMaterialName,
  GLB_GENERATOR,
  glbNodeName,
  levelNodeName,
  nodeExtras,
  readGlbNodes,
  writeGlb,
} from "./glb/write.js";
export type { GlbNode } from "./glb/write.js";
export {
  checkGlb,
  checkNaming,
  checkScene,
  checkShells,
  checkValidator,
  glbJson,
  glbLeaks,
  openEdges,
  signedVolume,
} from "./check/verify.js";
export type { CheckId, CheckResult } from "./check/verify.js";
