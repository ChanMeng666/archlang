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
