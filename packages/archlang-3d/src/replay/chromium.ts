/**
 * Playwright's Chromium, loaded on demand. `playwright-core` is an optional peer, not a dependency:
 * a consumer that never renders a frame (a GLB, a scene, the replay HTML) never installs it. Only
 * the paths that start a browser (`view`'s key frames and video, `doctor`'s probe, the asset
 * scripts) load it, and only then, because 1.64 calls `process.exit(1)` on import under Node < 20.
 *
 * Internal: no public entry re-exports it, so no published `.d.ts` names a Playwright type.
 */
import type { BrowserType } from "playwright-core";

/** What a render or the doctor says when `playwright-core` is not installed. */
export const PLAYWRIGHT_MISSING =
  "playwright-core is not installed: npm i -D playwright-core && npx playwright-core install chromium";

/** Node's module-not-found for `playwright-core` itself (ESM or CommonJS), not a fault inside it. */
function isMissing(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const message = e instanceof Error ? e.message : "";
  return (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") && message.includes("'playwright-core'");
}

/**
 * `playwright-core`'s `chromium`. A missing `playwright-core` throws an `Error` whose message is
 * exactly `PLAYWRIGHT_MISSING` (the original as its `cause`); any other failure passes through.
 * `load` is the import, a parameter so the missing path is testable where the package is installed.
 */
export async function loadChromium(
  load: () => Promise<{ chromium: BrowserType }> = () => import("playwright-core"),
): Promise<BrowserType> {
  try {
    return (await load()).chromium;
  } catch (e) {
    if (isMissing(e)) throw new Error(PLAYWRIGHT_MISSING, { cause: e });
    throw e;
  }
}
