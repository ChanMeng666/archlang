/**
 * The files a families law's premise case ("no shipped plan names a new word") scans:
 * `test/new-families-byte-identity.test.ts` (card V8) and `test/rm89-families-byte-identity.test.ts`
 * (RM8.9) share it.
 *
 * "Shipped" means tracked by git, or untracked and not ignored: the list comes from
 * `git ls-files --cached --others --exclude-standard`, so the scan reads what the old disk walk
 * read except gitignored files. Gitignored local output (a paid eval run's `eval/results.*`, a
 * build, a generated site copy) can neither fail the premise locally nor be something CI checks,
 * while a new plan that is not `git add`ed yet is still caught before it is pushed.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The source kinds a plan can ship in: a plan file, a Markdown fence, or a string in code or data. */
export const SOURCE_EXT = /\.(arch|md|ts|tsx|js|mjs|json|vue)$/;

/** A path segment the scan never enters: dependencies, builds, generated sites and dot-directories. */
const SKIPPED = (seg: string): boolean =>
  seg === "node_modules" || seg === "dist" || seg === "public" || seg.startsWith(".");

/**
 * Every source file under `dir` (a repo-relative folder) that is tracked, or untracked and not
 * ignored, recursively, as sorted, de-duplicated, repo-relative `/`-separated paths. It skips any
 * path with a segment below `dir` (the file's own name included) that is `node_modules`, `dist`,
 * `public` or starts with `.`, and a tracked file deleted from the working tree (which the disk
 * walk never saw either).
 */
export function shippedSources(root: string, dir: string): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", dir], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, "/"));
  return [...new Set(listed)].sort().filter((p) => {
    const below = p.slice(dir.length + 1).split("/");
    return !below.some(SKIPPED) && SOURCE_EXT.test(below.at(-1)!) && existsSync(join(root, p));
  });
}
