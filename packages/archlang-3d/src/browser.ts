/**
 * The browser entry for a host page that shows the replay (card A5, the playground's 3D preview
 * tab): build the payload in the page (`replayPayload`) and mount it on a canvas (`mountReplay`).
 * It bundles three.js, so it is a separate entry from `.` (the adapter and Scene3D alone); the
 * Node-only single-file HTML lives in `./node`.
 */
export { mountReplay } from "./replay/mount.js";
export type { ReplayHandle, ReplayNode, ReplayPayload } from "./replay/mount.js";
export { PREVIEW_LABEL, replayPayload, viewBoxOf } from "./replay/payload.js";
export type { ReplayOptions } from "./replay/payload.js";
