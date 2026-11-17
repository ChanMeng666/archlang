/**
 * The files a families law's premise case ("no shipped plan names a new word") scans:
 * `test/new-families-byte-identity.test.ts` (card V8) and `test/rm89-families-byte-identity.test.ts`
 * (RM8.9) share it.
 *
 * "Shipped" means TRACKED BY GIT: the list comes from `git ls-files`, never from the disk, so
 * gitignored local output (a paid eval run's `eval/results.*`, a build, a generated site copy)
 * can neither fail the premise locally nor be something CI checks. A file the repository ships
 * is one it tracks; a new plan is in the premise's corpus once it is `git add`ed, which is also
 * when CI first sees it.
 */
import { execFileSync } from "node:child_process";

/** The source kinds a plan can ship in: a plan file, a Markdown fence, or a string in code or data. */
export const SOURCE_EXT = /\.(arch|md|ts|tsx|js|mjs|json|vue)$/;

/** A path segment the scan never enters: dependencies, builds, generated sites and dot-directories. */
const SKIPPED = (seg: string): boolean =>
  seg === "node_modules" || seg === "dist" || seg === "public" || seg.startsWith(".");

/**
 * Every tracked source file under `dir` (a repo-relative folder), recursively, as repo-relative
 * `/`-separated paths, skipping any path with a segment below `dir` (the file's own name
 * included) that is `node_modules`, `dist`, `public` or starts with `.`.
 */
export function shippedSources(root: string, dir: string): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", dir], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => {
      const below = p.slice(dir.length + 1).split("/");
      return !below.some(SKIPPED) && SOURCE_EXT.test(below.at(-1)!);
    });
}
