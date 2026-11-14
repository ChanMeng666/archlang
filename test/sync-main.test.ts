/** scripts/sync-main.mjs: merge origin/main, script the record and generated-artifact conflicts, focus the re-review. */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as syncMain from "../scripts/sync-main.mjs";

const { artifactSets, changedExports, classifyUnmerged, focusFiles, importLinked, main, parseArgs, reportLines } =
  syncMain;

/**
 * The pure parts (classification, the re-review focus) on literal inputs, then the whole script in
 * process against throwaway git repositories in `mkdtemp`: a local `origin` whose `main` moved, a clone
 * on a PR branch, and a fake `.claude/hooks/generated-artifacts.json`. No network and no `gen:all`
 * (`--no-gen`, or a fake regenerator passed in).
 */

const JSON_TEXT = JSON.stringify({
  artifacts: { "gen/out.txt": "gen:x", "README.md": "gen:doors", ".claude/hooks/generated-artifacts.json": "gen:y" },
  partial: ["README.md"],
});

describe("pure parts", () => {
  const sets = artifactSets([JSON_TEXT]);

  it("reads the artifact keys and the partial list, as a union over both sides", () => {
    expect([...sets.artifacts].sort()).toEqual([".claude/hooks/generated-artifacts.json", "README.md", "gen/out.txt"]);
    expect([...sets.partial]).toEqual(["README.md"]);
    const both = artifactSets([JSON_TEXT, JSON.stringify({ artifacts: { "new.md": "gen:z" } }), null, "{not json"]);
    expect(both.artifacts.has("new.md")).toBe(true);
    expect(both.artifacts.has("gen/out.txt")).toBe(true);
  });

  it("classifies each unmerged path", () => {
    expect(classifyUnmerged("gen/out.txt", sets)).toBe("generated");
    expect(classifyUnmerged("CHANGELOG.md", sets)).toBe("changelog");
    expect(classifyUnmerged("src/a.ts", sets)).toBe("conflict");
    // A region-only artifact keeps the branch's hand edits outside the region: never one side.
    expect(classifyUnmerged("README.md", sets)).toBe("conflict");
    // CHANGELOG.md deleted on one side (no stage 2 or 3) is not a union merge.
    expect(classifyUnmerged("CHANGELOG.md", sets, [1, 3])).toBe("conflict");
    expect(classifyUnmerged("CHANGELOG.md", sets, [2, 3])).toBe("changelog");
  });

  it("overlap: files both sides changed, minus records, whole-file artifacts and low-tier paths", () => {
    const shared = ["CHANGELOG.md", "gen/out.txt", "README.md", "docs/plans/x.md", ".claude/rules/y.md", "src/c.ts"];
    const f = focusFiles({
      prFiles: ["src/a.ts", ...shared],
      mainFiles: ["src/z.ts", ...shared],
      hand: ["src/h.ts", "docs/plans/x.md", "src/c.ts"],
      sets,
    });
    // README.md is a region-only artifact: its hand-written part is reviewed, so it stays.
    expect(f).toEqual({ overlap: ["README.md", "src/c.ts"], hand: ["src/c.ts", "src/h.ts"] });
    expect(focusFiles({ prFiles: ["src/a.ts"], mainFiles: ["src/b.ts"], sets })).toEqual({ overlap: [], hand: [] });
  });

  it("import-linked: code main changed that a PR file imports or is imported by, one level", () => {
    const graph: Record<string, string[]> = {
      "src/pr.ts": ["src/dep.ts"],
      "src/user.ts": ["src/pr.ts"],
      "src/far.ts": ["src/user.ts"],
      "src/both.ts": ["src/dep.ts"],
    };
    const importsOf = (f: string) => graph[f] ?? [];
    expect(
      importLinked({
        prFiles: ["src/pr.ts", "src/both.ts", "docs/plans/p.md"],
        mainFiles: ["src/dep.ts", "src/user.ts", "src/far.ts", "src/both.ts", "docs/x.md", "gen/out.txt"],
        importsOf,
        sets,
      }),
    ).toEqual([
      {
        file: "src/dep.ts",
        via: [
          { file: "src/both.ts", how: "imported by" },
          { file: "src/pr.ts", how: "imported by" },
        ],
      },
      { file: "src/user.ts", via: [{ file: "src/pr.ts", how: "imports" }] },
    ]);
  });

  it("changed exports: export lines main's side added or removed, per file, artifacts skipped", () => {
    const diff = [
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1,2 @@",
      "-export function old(x: number) {",
      "+export async function fresh(x: number) {",
      "+export const old = fresh;",
      "+  const inner = 1;",
      "diff --git a/src/context-size.ts b/src/context-size.ts",
      "@@ -1 +1 @@",
      "-export const CONTEXT_BYTES = 1;",
      "+export const CONTEXT_BYTES = 2;",
      "diff --git a/scripts/x.mjs b/scripts/x.mjs",
      "@@ -0,0 +1 @@",
      "+export class Thing {}",
      "",
    ].join("\n");
    expect(changedExports(diff, (f: string) => f === "src/context-size.ts")).toEqual([
      "scripts/x.mjs: Thing",
      "src/b.ts: fresh",
      "src/b.ts: old",
    ]);
  });

  it("the report is a focus block for the red team, never a verdict", () => {
    const lines = reportLines({
      head: "f".repeat(40),
      scripted: ["CHANGELOG.md"],
      regenerated: [],
      focus: {
        overlap: [],
        hand: ["src/h.ts"],
        importLinked: [{ file: "src/dep.ts", via: [{ file: "src/pr.ts", how: "imported by" }] }],
        changedExports: ["src/dep.ts: f"],
      },
    });
    expect(lines).toEqual([
      "scripted: CHANGELOG.md",
      `re-review focus (red-team the merged head ${"f".repeat(40)}; start here):`,
      "  overlap (both the PR and main changed): none",
      "  hand-resolved conflicts:",
      "    src/h.ts",
      "  import-linked (main changed; one import from a PR file):",
      "    src/dep.ts (imported by src/pr.ts)",
      "  exports main changed (grep their callers in the PR):",
      "    src/dep.ts: f",
      `head: ${"f".repeat(40)}`,
    ]);
    expect(lines.join("\n")).not.toMatch(/carries/);
  });

  it("parses the flags and refuses an unknown one", () => {
    expect(parseArgs(["--continue", "--no-gen", "--json"])).toEqual({
      resume: true,
      push: false,
      gen: false,
      json: true,
      exempt: false,
    });
    expect(() => parseArgs(["--force"])).toThrow(/unknown argument --force/);
  });
});

// ---- the whole script on throwaway repositories -----------------------------------------------

const CHANGELOG_BASE = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "",
  "- base entry",
  "",
  "## [1.0.0] - 2026-01-01",
  "",
  "- old entry",
  "",
].join("\n");

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

type Files = Record<string, string>;

/** `origin` (on `main`) with `base`, and a clone `work` on branch `feat`. */
function setup(base: Files) {
  const root = mkdtempSync(join(tmpdir(), "archlang-sync-main-"));
  roots.push(root);
  const origin = join(root, "origin");
  const work = join(root, "work");
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const configure = (cwd: string) => {
    const config: [string, string][] = [
      ["core.autocrlf", "false"],
      ["user.email", "sync-main@example.invalid"],
      ["user.name", "sync-main"],
      ["commit.gpgsign", "false"],
      ["core.hooksPath", join(root, "no-hooks")],
    ];
    for (const [k, v] of config) {
      git(cwd, "config", k, v);
    }
  };
  const write = (cwd: string, files: Files) => {
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, p)), { recursive: true });
      writeFileSync(join(cwd, p), text);
    }
  };
  const commit = (cwd: string, files: Files, msg: string) => {
    write(cwd, files);
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", msg);
  };
  mkdirSync(origin);
  git(origin, "init", "-q", "-b", "main");
  configure(origin);
  commit(origin, base, "base");
  // The checkout is written with the clone's own config: a global `core.autocrlf=true` would otherwise
  // check out CRLF copies that the next `git add -A` commits as changes to every file.
  git(root, "clone", "-q", "-c", "core.autocrlf=false", origin, work);
  configure(work);
  git(work, "checkout", "-q", "-b", "feat");
  const lines: { out: string[]; err: string[] } = { out: [], err: [] };
  const run = (argv: string[], runGen?: (root: string) => boolean) => {
    lines.out = [];
    lines.err = [];
    const code = main(argv, {
      cwd: work,
      out: (l: string) => lines.out.push(l),
      err: (l: string) => lines.err.push(l),
      runGen,
    });
    return { code, out: lines.out, err: lines.err, json: () => JSON.parse(lines.out.join("\n")) };
  };
  return { origin, work, git, write, commit, run };
}

const BASE: Files = {
  ".claude/hooks/generated-artifacts.json": JSON_TEXT,
  "CHANGELOG.md": CHANGELOG_BASE,
  "gen/out.txt": "count 1\n",
  "README.md": "# Readme\n\nhand text\n",
  "src/a.txt": "a\n",
  "src/b.txt": "b\n",
  "src/pr.ts": 'import { old } from "./dep.js";\nexport const pr = old;\n',
  "src/dep.ts": "export function old() {\n  return 1;\n}\n",
  "src/shared.txt": "one\ntwo\nthree\nfour\nfive\n",
  "docs/plans/notes.md": "one\ntwo\nthree\nfour\nfive\n",
};

const withEntry = (entry: string, text = CHANGELOG_BASE) => text.replace("- base entry\n", `- base entry\n${entry}\n`);

describe("sync:main on a throwaway repository", () => {
  it("scripts a CHANGELOG and a generated-file conflict, commits, and lists the re-review focus", () => {
    const r = setup(BASE);
    const ends = (one: string, five: string) => `${one}\ntwo\nthree\nfour\n${five}\n`;
    r.commit(
      r.work,
      {
        "CHANGELOG.md": withEntry("- branch entry"),
        "gen/out.txt": "count 2\n",
        "src/a.txt": "A\n",
        "src/pr.ts": 'import { old } from "./dep.js";\nexport const pr = old;\nexport const pr2 = pr;\n',
        "src/shared.txt": ends("ONE", "five"),
        "docs/plans/notes.md": ends("ONE", "five"),
      },
      "pr",
    );
    r.commit(
      r.origin,
      {
        "CHANGELOG.md": withEntry("- main entry"),
        "gen/out.txt": "count 3\n",
        "src/b.txt": "B\n",
        "src/dep.ts": "export function fresh() {\n  return 1;\n}\nexport const old = fresh;\n",
        "src/shared.txt": ends("one", "FIVE"),
        "docs/plans/notes.md": ends("one", "FIVE"),
      },
      "main",
    );
    const oldHead = r.git(r.work, "rev-parse", "HEAD");
    const res = r.run(["--no-gen", "--json"]);
    expect(res.code, res.err.join("\n")).toBe(0);
    const j = res.json();
    // The low-tier docs/plans file merged cleanly from both sides and is no focus; src/shared.txt is.
    expect(j).toMatchObject({
      upToDate: false,
      oldHead,
      hand: [],
      focus: {
        overlap: ["src/shared.txt"],
        hand: [],
        importLinked: ["src/dep.ts"],
        changedExports: ["src/dep.ts: fresh", "src/dep.ts: old"],
      },
    });
    expect(j).not.toHaveProperty("reviewCarries");
    expect([...j.scripted].sort()).toEqual(["CHANGELOG.md", "gen/out.txt"]);
    expect(j.head).toMatch(/^[0-9a-f]{40}$/);
    expect(r.git(r.work, "rev-parse", "HEAD")).toBe(j.head);
    expect(r.git(r.work, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(r.git(r.work, "status", "--porcelain", "--untracked-files=no")).toBe("");
    const changelog = readFileSync(join(r.work, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("- branch entry\n");
    expect(changelog).toContain("- main entry\n");
    expect(readFileSync(join(r.work, "gen/out.txt"), "utf8")).toBe("count 3\n");
    expect(r.git(r.work, "log", "-1", "--format=%s")).toBe("Merge remote-tracking branch 'origin/main' into feat");
    // Nothing to merge on a second run.
    const again = r.run(["--no-gen", "--json"]);
    expect(again.code).toBe(0);
    expect(again.json()).toMatchObject({ upToDate: true, head: j.head });
  });

  it("text mode ends with the focus block and the new head's full SHA", () => {
    const r = setup(BASE);
    r.commit(r.work, { "src/a.txt": "A\n" }, "pr");
    r.commit(r.origin, { "src/b.txt": "B\n" }, "main");
    const res = r.run(["--no-gen"]);
    expect(res.code, res.err.join("\n")).toBe(0);
    const head = r.git(r.work, "rev-parse", "HEAD");
    expect(res.out.slice(1)).toEqual([
      `re-review focus (red-team the merged head ${head}; start here):`,
      "  overlap (both the PR and main changed): none",
      "  hand-resolved conflicts: none",
      "  import-linked (main changed; one import from a PR file): none",
      "  exports main changed (grep their callers in the PR): none",
      `head: ${head}`,
    ]);
  });

  it("stops on a real conflict (and on a region-only artifact), then --continue records it as hand-resolved", () => {
    const r = setup(BASE);
    r.commit(
      r.work,
      { "src/a.txt": "branch\n", "README.md": "# Readme\n\nbranch text\n", "gen/out.txt": "count 2\n" },
      "pr",
    );
    r.commit(
      r.origin,
      { "src/a.txt": "main\n", "README.md": "# Readme\n\nmain text\n", "gen/out.txt": "count 3\n" },
      "main",
    );
    const oldHead = r.git(r.work, "rev-parse", "HEAD");
    const stop = r.run(["--no-gen"]);
    expect(stop.code).toBe(2);
    expect(stop.err.join("\n")).toContain("  README.md");
    expect(stop.err.join("\n")).toContain("  src/a.txt");
    expect(stop.err.join("\n")).toContain("then `npm run sync:main -- --continue`");
    expect(r.git(r.work, "rev-parse", "-q", "--verify", "MERGE_HEAD")).toMatch(/^[0-9a-f]{40}$/);
    expect(r.git(r.work, "diff", "--name-only", "--diff-filter=U").split("\n")).toEqual(["README.md", "src/a.txt"]);
    // The generated file was already taken from main and staged.
    expect(readFileSync(join(r.work, "gen/out.txt"), "utf8")).toBe("count 3\n");

    // Staged with its markers still in it: refused.
    r.git(r.work, "add", "README.md", "src/a.txt");
    expect(r.run(["--continue", "--no-gen"]).code).toBe(2);

    r.write(r.work, { "src/a.txt": "both\n", "README.md": "# Readme\n\nboth texts\n" });
    r.git(r.work, "add", "README.md", "src/a.txt");
    let regenerated = 0;
    const fakeGen = (root: string) => {
      regenerated++;
      writeFileSync(join(root, "gen/out.txt"), "regenerated\n");
      return true;
    };
    const res = r.run(["--continue", "--json"], fakeGen);
    expect(res.code, res.err.join("\n")).toBe(0);
    expect(regenerated).toBe(1);
    expect(res.json()).toMatchObject({
      upToDate: false,
      oldHead,
      scripted: ["gen/out.txt"],
      hand: ["README.md", "src/a.txt"],
      focus: {
        overlap: ["README.md", "src/a.txt"],
        hand: ["README.md", "src/a.txt"],
        importLinked: [],
        changedExports: [],
      },
    });
    expect(r.git(r.work, "show", "HEAD:gen/out.txt")).toBe("regenerated");
    expect(r.git(r.work, "status", "--porcelain", "--untracked-files=no")).toBe("");
  });

  it("a branch entry the merge leaves inside a just-released section stops the sync, uncommitted", () => {
    const r = setup(BASE);
    r.commit(r.work, { "CHANGELOG.md": withEntry("- branch entry") }, "pr");
    const released = CHANGELOG_BASE.replace("## [Unreleased]\n", "## [Unreleased]\n\n## [1.1.0] - 2026-02-01\n");
    r.commit(r.origin, { "CHANGELOG.md": released }, "release 1.1.0");
    const oldHead = r.git(r.work, "rev-parse", "HEAD");
    const res = r.run(["--no-gen"]);
    expect(res.code).toBe(2);
    expect(res.err.join("\n")).toContain('added under "## [1.1.0] - 2026-02-01": - branch entry');
    expect(r.git(r.work, "rev-parse", "HEAD")).toBe(oldHead);
    expect(r.git(r.work, "rev-parse", "-q", "--verify", "MERGE_HEAD")).toMatch(/^[0-9a-f]{40}$/);
    // Moving the line under [Unreleased] and continuing commits it; CHANGELOG is records, not a hand conflict.
    r.write(r.work, {
      "CHANGELOG.md": released.replace("## [Unreleased]\n", "## [Unreleased]\n\n- branch entry\n"),
    });
    r.git(r.work, "add", "CHANGELOG.md");
    const done = r.run(["--continue", "--no-gen", "--json"]);
    expect(done.code, done.err.join("\n")).toBe(0);
    expect(done.json()).toMatchObject({
      oldHead,
      hand: [],
      focus: { overlap: [], hand: [], importLinked: [], changedExports: [] },
    });
  });

  it("refuses on main, with tracked changes, or with --continue and no merge", () => {
    const r = setup(BASE);
    r.write(r.work, { "src/a.txt": "dirty\n" });
    const dirty = r.run(["--no-gen"]);
    expect(dirty.code).toBe(1);
    expect(dirty.err.join("\n")).toContain("changes to tracked files");
    r.git(r.work, "checkout", "-q", "--", "src/a.txt");
    expect(r.run(["--continue", "--no-gen"]).code).toBe(1);
    r.git(r.work, "checkout", "-q", "main");
    const onMain = r.run(["--no-gen"]);
    expect(onMain.code).toBe(1);
    expect(onMain.err.join("\n")).toContain("refusing: on main");
  });
});
