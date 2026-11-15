/**
 * The package's heavy tests: `npm -w packages/archlang-3d run e2e [-- <file filter>… <--option=value>…]`
 * (the root `npm run check:3d` runs it bare). Two vitest passes: every `e2e/*.e2e.ts` but the frame
 * budget, then the frame budget on its own, so it times a browser no other test is loading (card
 * RM8.8).
 *
 * npm appends a script's arguments to its last command only, so the old `A && B` script applied a
 * file filter to the frame-budget pass alone and ran every other file regardless (card RM8.8b
 * item 6). Here the arguments reach both passes: each pass runs only when a filter selects one of its
 * files (or none is given), and gets the filters and every option. Options go as `--name=value` or a
 * bare flag, so every word not starting with `-` is a file filter.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The frame-budget file, run in a pass of its own. */
export const FRAME_BUDGET = "e2e/frame-budget.e2e.ts";

/**
 * The two passes by name, for `--pass=<name>` (repeatable): `suite` is every file but the frame
 * budget, `frame-budget` that file alone. Without the option both run, in this order. CI runs one
 * job per name; the runner consumes the option, it never reaches vitest.
 */
export const PASSES = ["suite", "frame-budget"] as const;
const PASS_OPTION = "--pass=";

const CONFIG = ["--config", "vitest.e2e.config.ts"];

/**
 * Whether vitest would select `file` (a path from the package, `e2e/….e2e.ts`) by `filter`: a
 * filter selects every file whose path contains it, so one written from the repository root
 * (`packages/archlang-3d/e2e/…`) or with backslashes selects the same file.
 */
export function selects(filter: string, file: string): boolean {
  const f = filter.split("\\").join("/");
  return file.includes(f) || f.endsWith(`/${file}`);
}

/**
 * The vitest argument lists the runner starts, in order, for the script's arguments `args`, over the
 * package's e2e files `files` (`e2e/….e2e.ts`).
 */
export function e2ePasses(args: readonly string[], files: readonly string[]): string[][] {
  const only = args.filter((a) => a.startsWith(PASS_OPTION)).map((a) => a.slice(PASS_OPTION.length));
  // An unknown pass name selects nothing, and the runner says so.
  const wanted = (pass: (typeof PASSES)[number]) => only.length === 0 || only.includes(pass);
  const options = args.filter((a) => a.startsWith("-") && !a.startsWith(PASS_OPTION));
  // Vitest matches a filter against the file's path with forward slashes, on Windows too.
  const filters = args.filter((a) => !a.startsWith("-")).map((a) => a.split("\\").join("/"));
  const all = filters.length === 0;
  const picked = (pass: (file: string) => boolean): string[] =>
    filters.filter((f) => files.some((file) => pass(file) && selects(f, file)));
  const first = picked((file) => file !== FRAME_BUDGET);
  const budget = picked((file) => file === FRAME_BUDGET);
  const passes: string[][] = [];
  if (wanted("suite") && (all || first.length > 0))
    passes.push(["run", ...CONFIG, "--exclude", FRAME_BUDGET, ...options, ...first]);
  if (wanted("frame-budget") && (all || budget.length > 0)) passes.push(["run", ...CONFIG, ...options, FRAME_BUDGET]);
  return passes;
}

/** The package's e2e files, `e2e/….e2e.ts`, sorted. */
export function e2eFiles(pkg: string): string[] {
  return readdirSync(resolve(pkg, "e2e"))
    .filter((f) => f.endsWith(".e2e.ts"))
    .sort()
    .map((f) => `e2e/${f}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const vitest = resolve(pkg, "../../node_modules/vitest/vitest.mjs");
  const passes = e2ePasses(process.argv.slice(2), e2eFiles(pkg));
  if (passes.length === 0) {
    process.stderr.write(`e2e: no e2e file matches the filter (or no pass is named ${PASSES.join(" or ")})\n`);
    process.exit(1);
  }
  for (const pass of passes) {
    const r = spawnSync(process.execPath, [vitest, ...pass], { cwd: pkg, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
