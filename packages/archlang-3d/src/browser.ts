/**
 * The browser entry for a host page that shows the replay (card A5, the playground's 3D preview
 * tab): build the payload in the page (`replayPayload`) and mount it on a canvas (`mountReplay`).
 * It bundles three.js, so it is a separate entry from `.` (the adapter and Scene3D alone); the
 * Node-only single-file HTML lives in `./node`. `mountReplay(…, { interactive: true })` adds the free
 * camera (card CR4) and `viewToolbar` its buttons.
 */
export { mountReplay } from "./replay/mount.js";
export type {
  CameraHolder,
  MountOptions,
  PresetName,
  ReplayHandle,
  ReplayNode,
  ReplayPayload,
  ViewControl,
  ViewState,
} from "./replay/mount.js";
export { PRESET_LABELS, VIEW_CONTROLS_LABEL, VIEW_HINT, viewToolbar } from "./replay/view-dom.js";
export type { ToolbarOptions } from "./replay/view-dom.js";
export { stripAt } from "./replay/strip.js";
export { paintStrip } from "./replay/strip-dom.js";
export type { ReplayFacts, StripItem } from "./replay/strip.js";
export {
  PREVIEW_ABOUT_URL,
  PREVIEW_LABEL,
  PREVIEW_LEAD,
  PREVIEW_LIMITS,
  replayPayload,
  viewBoxOf,
} from "./replay/payload.js";
export type { ReplayOptions } from "./replay/payload.js";
