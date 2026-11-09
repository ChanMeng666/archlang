/**
 * The Node `World` the CLI compiles through: an `import` is read only from under a root, only a
 * `.arch` file, only up to {@link MODULE_CAP_BYTES}. Node-only (it reads `node:fs`): reached from
 * `node.ts` and the CLI, never from `index.ts` (`test/browser-safety.test.ts`).
 *
 * A copy of the core CLI's `makeNodeWorld` (`src/cli/io.ts` in the repository), which is not a
 * public export of the core and so cannot be imported here (the seam, ADR 0031). The repository
 * holds the two in lockstep: `test/workspace-seams.test.ts` runs one case table through both
 * and requires the same text or the same refusal code for every case, and the same cap.
 */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { utf8ByteLength, type World } from "@chanmeng666/archlang";

/**
 * The core's `WorldRefusal`, written here so this module also compiles against a core that predates
 * `World.refusal` (the peer range starts below it). Such a core never asks: a refused module reads
 * as not found, and is still never read.
 */
interface WorldRefusal {
  code: string;
  message: string;
}

/** The most UTF-8 bytes of one imported module this World reads (1 MiB, the core CLI's cap). */
export const MODULE_CAP_BYTES = 1024 * 1024;

/**
 * `child` is `root` itself or lies under it (both absolute; case-insensitive on Windows via
 * `relative`). Only a whole `..` segment leaves the root: `..evil.arch` is a file inside it.
 */
function isWithin(root: string, child: string): boolean {
  const rel = relative(root, child);
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel);
}

const realOrNull = (p: string): string | null => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};

/** The real path of `p`'s nearest existing ancestor, or `null` when none resolves. */
function nearestRealAncestor(p: string): string | null {
  for (let at = dirname(p); ; at = dirname(at)) {
    const real = realOrNull(at);
    if (real !== null) return real;
    if (dirname(at) === at) return null;
  }
}

/**
 * A World that reads an `import`ed module relative to `baseDir` (the plan's own directory). It is
 * ROOTED: a module is read only when its real path (symbolic links and junctions followed) lies
 * under `root` (default: the working directory) or under `baseDir`, ends in `.arch`, and is at most
 * {@link MODULE_CAP_BYTES}. A refused module reads as `null` and `refusal` names the code
 * (`E_IMPORT_OUTSIDE_ROOT`, `E_IMPORT_NOT_ARCH`, `E_IMPORT_TOO_LARGE`), which the core reports at
 * the `import`; a module missing inside the roots is the core's `E_IMPORT_NOT_FOUND`. A path whose
 * written form leaves the roots is refused before the file system is touched.
 */
export function makeNodeWorld(baseDir: string, root: string = process.cwd()): World {
  const roots = [resolve(root), resolve(baseDir)].flatMap((r) => {
    const real = realOrNull(r);
    return real === null ? [] : [{ lexical: r, real }];
  });
  const refusals = new Map<string, WorldRefusal>();
  const outside = (path: string): WorldRefusal => ({
    code: "E_IMPORT_OUTSIDE_ROOT",
    message: `Imported module "${path}" is outside the import root (the working directory) and the plan's own directory; run archlang3d from a directory that contains it`,
  });
  const notArch = (path: string): WorldRefusal => ({
    code: "E_IMPORT_NOT_ARCH",
    message: `Imported module "${path}" is not an .arch file`,
  });
  const inRoot = (abs: string): boolean => roots.some((r) => isWithin(r.lexical, abs) || isWithin(r.real, abs));
  const inRealRoot = (real: string): boolean => roots.some((r) => isWithin(r.real, real));
  const isArch = (p: string): boolean => /\.arch$/i.test(p);
  const attempt = (path: string): string | WorldRefusal | null => {
    // A NUL cannot name a file; refusing it here keeps `fs` from throwing on it.
    if (path.includes("\0")) return null;
    const abs = resolve(baseDir, path);
    if (!inRoot(abs)) return outside(path);
    if (!isArch(abs)) return notArch(path);
    const real = realOrNull(abs);
    if (real === null) {
      const ancestor = nearestRealAncestor(abs);
      return ancestor !== null && inRealRoot(ancestor) ? null : outside(path);
    }
    if (!inRealRoot(real)) return outside(path);
    if (!isArch(real)) return notArch(path);
    const st = statSync(real);
    if (!st.isFile()) return null;
    const tooLarge = (): WorldRefusal => ({
      code: "E_IMPORT_TOO_LARGE",
      message: `Imported module "${path}" is larger than ${String(MODULE_CAP_BYTES)} bytes`,
    });
    if (st.size > MODULE_CAP_BYTES) return tooLarge();
    const text = readFileSync(real, "utf8");
    // The file may have grown since the stat.
    return utf8ByteLength(text) > MODULE_CAP_BYTES ? tooLarge() : text;
  };
  const world = {
    read(path: string): string | null {
      let r: string | WorldRefusal | null;
      try {
        r = attempt(path);
      } catch {
        r = null;
      }
      if (typeof r === "string") {
        refusals.delete(path);
        return r;
      }
      if (r) refusals.set(path, r);
      else refusals.delete(path);
      return null;
    },
    refusal: (path: string): WorldRefusal | undefined => refusals.get(path),
  };
  return world;
}
