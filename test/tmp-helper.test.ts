/**
 * `test/helpers/tmp.ts` hands out temp directories in their long, canonical form, so a module
 * `importSource` writes there loads under Vite on Windows. A runner's `os.tmpdir()` can be an 8.3
 * short path (`C:\Users\RUNNER~1\…`); `pathToFileURL` encodes its `~` as `%7E` and Vite then
 * fails with "Failed to load url C:/Users/RUNNER%7E1/…/module.mjs" (every Windows shard after #1045).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { importSource, mkTmp } from "./helpers/tmp.js";

/** The 8.3 short form of an existing Windows path, from cmd's `%~s` modifier (the long path when the volume makes none). */
function shortPathOf(path: string): string {
  const r = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${path}") do @echo %~sI`], {
    encoding: "utf8",
    windowsVerbatimArguments: true,
  });
  return r.status === 0 ? r.stdout.trim() : path;
}

describe("test/helpers/tmp.ts", () => {
  it("mkTmp returns the directory's canonical path (realpathSync.native of itself)", () => {
    const dir = mkTmp("arch-tmp-helper-");
    try {
      expect(realpathSync.native(dir)).toBe(dir);
      expect(dir.split(sep).filter((s) => s.includes("~"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === "win32")(
    "under an 8.3 short TEMP, mkTmp expands it and importSource still loads a module",
    async (ctx) => {
      const base = mkTmp("arch-tmp-helper-");
      const long = join(base, "a-directory-name-longer-than-eight-characters");
      mkdirSync(long);
      const short = shortPathOf(long);
      const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP };
      try {
        if (short === long) {
          // The volume generates no 8.3 names; the first case still covers a short `os.tmpdir()`.
          ctx.skip();
          return;
        }
        expect(short).toContain("~");
        process.env.TEMP = short;
        process.env.TMP = short;
        const dir = mkTmp("arch-tmp-helper-");
        expect(dir.startsWith(long + sep)).toBe(true);
        expect(dir.split(sep).filter((s) => s.includes("~"))).toEqual([]);
        rmSync(dir, { recursive: true, force: true });
        const mod = await importSource<{ default: number }>("export default 7;\n");
        expect(mod.default).toBe(7);
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        rmSync(base, { recursive: true, force: true });
      }
    },
  );
});
