/**
 * The Node-only entry: a `World` over the file system. Kept out of `src/index.ts` so the
 * browser bundle (adapter + Scene3D) never pulls a `node:*` module (`test/browser-safety.test.ts`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { World } from "@chanmeng666/archlang";

/** A World that reads an `import`ed module relative to `baseDir`; a missing file reads as `null`. */
export function makeNodeWorld(baseDir: string): World {
  return {
    read: (p) => {
      try {
        return readFileSync(resolve(baseDir, p), "utf8");
      } catch {
        return null;
      }
    },
  };
}

export { PREVIEW_LABEL, replayHtml, replayPayload, viewBoxOf, viewerScript } from "./replay/html.js";
export type { ReplayOptions } from "./replay/html.js";
export { renderReplay, SWIFTSHADER_ARGS } from "./replay/video.js";
export type { KeyFrame, VideoOptions, VideoReport } from "./replay/video.js";
export { GLB_GENERATOR, glbNodeName, levelNodeName, nodeExtras, readGlbNodes, writeGlb } from "./glb/write.js";
export type { GlbNode } from "./glb/write.js";
export {
  checkGlb,
  checkNaming,
  checkScene,
  checkShells,
  checkValidator,
  glbJson,
  openEdges,
  signedVolume,
} from "./check/verify.js";
export type { CheckId, CheckResult } from "./check/verify.js";
