/** The plans the package's tests read: the core's shipped examples and the synthetic stress plans. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { makeVirtualWorld, type World } from "@chanmeng666/archlang";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "../../..");
const EXAMPLES = join(REPO, "examples");
const STRESS = join(HERE, "fixtures", "stress");

const walk = (d: string): string[] =>
  readdirSync(d)
    .sort()
    .flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".arch") ? [p] : [];
    });

/** Every `examples/**\/*.arch`, keyed as a whole-file `import` resolves it. */
export const EXAMPLE_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  walk(EXAMPLES).map((p) => [relative(EXAMPLES, p).split(sep).join("/"), readFileSync(p, "utf8")]),
);

/** The World every corpus resolve reads through (so `imports.arch` finds `lib/`). */
export const WORLD: World = makeVirtualWorld({ ...EXAMPLE_FILES });

/** The shipped examples (top level; `lib/` holds component libraries), sorted. */
export const EXAMPLES_LIST: ReadonlyArray<readonly [name: string, source: string]> = Object.entries(EXAMPLE_FILES)
  .filter(([k]) => !k.includes("/"))
  .sort(([a], [b]) => a.localeCompare(b));

/** The synthetic stress plans `s1…s11` (copied from the archlang-3d spike), by file name. */
export const STRESS_PLANS: Readonly<Record<string, string>> = Object.fromEntries(
  readdirSync(STRESS)
    .filter((f) => f.endsWith(".arch"))
    .sort()
    .map((f) => [f.replace(/\.arch$/, ""), readFileSync(join(STRESS, f), "utf8")]),
);
