/**
 * `check:quick` and `typecheck:all` name the same workspaces.
 *
 * `scripts/check-quick.mjs` typechecks each changed workspace; it used to keep that list by hand, with
 * nothing tying it to `package.json` `workspaces` or to the `typecheck:all` script. It now derives the
 * list (`scripts/workspaces.mjs`). This pins the derived list to the workspaces `typecheck:all` runs
 * (`npm -w <dir> run typecheck`), so a workspace added to one and not the other goes red. Workspaces
 * with no typecheck are listed, with a reason, in `EXCLUDED`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { checkQuickWorkspaces, EXCLUDED } from "../scripts/workspaces.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };

describe("check:quick workspaces", () => {
  const named = [...(pkg.scripts["typecheck:all"] ?? "").matchAll(/npm -w (\S+) run typecheck\b/g)].map(
    (m) => m[1] as string,
  );

  it("the walk is not vacuous", () => {
    expect(named.length).toBeGreaterThan(4);
    expect(checkQuickWorkspaces(ROOT).length).toBeGreaterThan(4);
  });

  it("the derived list equals the workspaces typecheck:all names, minus the exclusions", () => {
    expect([...checkQuickWorkspaces(ROOT)].sort()).toEqual([...named].filter((w) => !EXCLUDED.has(w)).sort());
  });

  it("every exclusion has a reason and typecheck:all does not name it", () => {
    for (const [dir, why] of EXCLUDED) {
      expect(why.length).toBeGreaterThan(10);
      expect(named).not.toContain(dir);
    }
  });
});
