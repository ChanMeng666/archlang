/** scripts/sync-main.mjs: merge origin/main, script the record and generated-artifact conflicts, focus the re-review. */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { renderGeneratedArtifacts } from "../scripts/gen-generated-artifacts.js";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as syncMain from "../scripts/sync-main.mjs";
import { selfReadArtifacts } from "./helpers/self-read-artifacts.js";
import { mkTmp } from "./helpers/tmp.js";

const {
  artifactSets,
  changedExports,
  classifyUnmerged,
  conflictLines,
  continueHint,
  diff3EditsBase,
  focusFiles,
  importLinked,
  main,
  parseArgs,
  reportLines,
  scriptableSets,
} = syncMain;

/**
 * The pure parts (classification, the re-review focus) on literal inputs; the partial-artifact list of
 * the real generator table and the guard that keeps it complete; then the whole script in process
 * against throwaway git repositories (`mkTmp`): a local `origin` whose `main` moved, a clone on a PR
 * branch, and a fake `.claude/hooks/generated-artifacts.json`. No network and no `gen:all` (`--no-gen`,
 * or a fake regenerator passed in).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

  it("scripts an artifact only when both sides call it a whole-file artifact", () => {
    const theirs = JSON.stringify({ artifacts: { "gen/out.txt": "gen:x", "gen/new.txt": "gen:z" }, partial: [] });
    const s = scriptableSets(JSON_TEXT, theirs);
    expect(classifyUnmerged("gen/out.txt", s)).toBe("generated");
    // An artifact only main knows of is the branch's hand-written file of that name.
    expect(classifyUnmerged("gen/new.txt", s)).toBe("conflict");
    // Partial on either side is partial.
    expect(
      classifyUnmerged("README.md", scriptableSets(JSON_TEXT, JSON_TEXT.replace(',"partial":["README.md"]', ""))),
    ).toBe("conflict");
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

  it("a diff3 hunk with base lines is two edits of one entry; an empty base is two insertions", () => {
    const hunk = (base: string[]) =>
      [
        "head",
        "<<<<<<< ours",
        "- ours",
        ...(base.length ? ["||||||| base", ...base] : ["||||||| base"]),
        "=======",
        "- theirs",
        ">>>>>>> theirs",
        "tail",
      ].join("\n");
    expect(diff3EditsBase(hunk([]))).toBe(false);
    expect(diff3EditsBase(hunk(["- the entry both sides reworded"]))).toBe(true);
    expect(diff3EditsBase("no conflict at all\n")).toBe(false);
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
    expect(changedExports(diff, (f: string) => f === "src/context-size.ts")).toEqual({
      declarations: ["scripts/x.mjs: Thing", "src/b.ts: fresh", "src/b.ts: old"],
      bodies: [],
    });
  });

  it("changed exports: a body-only change is read from the hunk header (the c2978a47 shape)", () => {
    // c2978a47 changed `doorSwing`'s body and not its `export` line; `git diff -U0` names the function
    // only in the hunk header's context.
    const diff = [
      "diff --git a/src/geometry.ts b/src/geometry.ts",
      "--- a/src/geometry.ts",
      "+++ b/src/geometry.ts",
      "@@ -537 +537,3 @@ export function doorSwing(d: RDoor): Swing | null {",
      "-  const r = d.width;",
      "+  const r = leafWidth(d);",
      "@@ -566,0 +571 @@ function doorRec(d: RDoor): Rec<Point> {",
      "+  rec.push(x);",
      "@@ -126 +126 @@ export const ELEMENT_GRAMMAR: Record<string, string> = {",
      '-  door: "a",',
      '+  door: "b",',
      "",
    ].join("\n");
    expect(changedExports(diff)).toEqual({
      declarations: [],
      bodies: ["src/geometry.ts: ELEMENT_GRAMMAR", "src/geometry.ts: doorSwing"],
    });
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
        changedExportBodies: ["src/dep.ts: g"],
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
      "  export declarations main added/removed (grep their callers in the PR):",
      "    src/dep.ts: f",
      "  exports whose body main changed (grep their callers in the PR):",
      "    src/dep.ts: g",
      `head: ${"f".repeat(40)}`,
    ]);
    expect(lines.join("\n")).not.toMatch(/carries/);
  });

  it("stop hints echo the flags the sync was started with; a partial artifact gets its own advice", () => {
    const hint = continueHint(parseArgs(["--push", "--no-gen", "--changelog-exempt"]));
    expect(hint).toBe("npm run sync:main -- --continue --push --no-gen --changelog-exempt");
    const lines = conflictLines(["README.md", "src/a.ts"], new Set(["README.md"]), hint).join("\n");
    expect(lines).toContain("README.md (only its marked region is generated; the rest is hand-written.");
    expect(lines).toContain("git checkout --ours -- <file>");
    expect(lines).toContain(`then \`${hint}\``);
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

describe("partial artifacts in the real generator table", () => {
  const partial = (JSON.parse(renderGeneratedArtifacts()) as { partial: string[] }).partial;

  it("are the files a generator rewrites only in part (pinned)", () => {
    expect(partial).toEqual([
      "plugins/archlang/.claude-plugin/plugin.json",
      "docs-site/public/_headers",
      "README.md",
      "packages/mcp/README.md",
      "editors/vscode/README.md",
      "llms.txt",
    ]);
  });

  /** Read by their own generator only to compare with the new rendering; written whole. */
  const READ_TO_COMPARE: Record<string, string> = {
    "src/context-size.ts": "gen:llms reads it to decide whether the measured size moved, then writes it whole",
  };

  it("a generator that reads its own artifact marks it partial, and nothing else is marked", () => {
    const selfRead = selfReadArtifacts(ROOT);
    const unmarked = selfRead.filter((a) => !partial.includes(a) && READ_TO_COMPARE[a] === undefined);
    expect(unmarked, "mark these `partial` in scripts/generators.ts, or list them in READ_TO_COMPARE").toEqual([]);
    expect(
      partial.filter((a) => !selfRead.includes(a)),
      "marked partial but no generator reads them",
    ).toEqual([]);
    expect(
      Object.keys(READ_TO_COMPARE).filter((a) => !selfRead.includes(a)),
      "stale READ_TO_COMPARE",
    ).toEqual([]);
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
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

type Files = Record<string, string>;

/** `origin` (on `main`) with `base`, and a clone `work` on branch `feat`. */
function setup(base: Files) {
  const root = mkTmp("archlang-sync-main-");
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
      // No background gc or maintenance holding files open while afterEach removes the directory.
      ["gc.auto", "0"],
      ["maintenance.auto", "false"],
    ];
    for (const [k, v] of config) git(cwd, "config", k, v);
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
  const remoteHead = (branch: string) => git(origin, "rev-parse", "-q", "--verify", `refs/heads/${branch}`);
  return { root, origin, work, git, write, commit, run, remoteHead };
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
const ends = (one: string, five: string) => `${one}\ntwo\nthree\nfour\n${five}\n`;

// Each case spawns about 40 git processes: well under a second on Linux, 2–5 s on Windows, where the
// default 5 s timeout would be too close (the main-only Windows leg runs this file).
describe("sync:main on a throwaway repository", { timeout: 30_000 }, () => {
  it("scripts a CHANGELOG and a generated-file conflict, commits, lists the focus, then pushes", () => {
    const r = setup(BASE);
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
        "src/dep.ts": "export function fresh() {\n  return 2;\n}\nexport const old = fresh;\n",
        "src/shared.txt": ends("one", "FIVE"),
        "docs/plans/notes.md": ends("one", "FIVE"),
      },
      "main",
    );
    const oldHead = r.git(r.work, "rev-parse", "HEAD");
    const res = r.run(["--no-gen", "--json", "--push"]);
    expect(res.code, res.err.join("\n")).toBe(0);
    const j = res.json();
    // The low-tier docs/plans file merged cleanly from both sides and is no focus; src/shared.txt is.
    expect(j).toMatchObject({
      upToDate: false,
      oldHead,
      hand: [],
      pushed: true,
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
    expect(r.remoteHead("feat")).toBe(j.head);
    expect(r.git(r.work, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(r.git(r.work, "status", "--porcelain", "--untracked-files=no")).toBe("");
    const changelog = readFileSync(join(r.work, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("- branch entry\n");
    expect(changelog).toContain("- main entry\n");
    expect(readFileSync(join(r.work, "gen/out.txt"), "utf8")).toBe("count 3\n");
    expect(r.git(r.work, "log", "-1", "--format=%s")).toBe("Merge remote-tracking branch 'origin/main' into feat");
    // Nothing to merge on a second run: no focus without a merge, and no push of what the remote has.
    const again = r.run(["--no-gen", "--json", "--push"]);
    expect(again.code).toBe(0);
    expect(again.json()).toEqual({
      upToDate: true,
      head: j.head,
      oldHead: j.head,
      scripted: [],
      hand: [],
      pushed: false,
      focus: null,
    });
    expect(again.err.join("\n")).toContain("not pushed (already up to date)");
  });

  it("text mode ends with the focus block and the new head's full SHA; a failed push still prints it", () => {
    const r = setup(BASE);
    r.commit(r.work, { "src/a.txt": "A\n" }, "pr");
    r.commit(r.origin, { "src/b.txt": "B\n" }, "main");
    r.git(r.work, "remote", "set-url", "--push", "origin", join(r.root, "no-such-remote"));
    const res = r.run(["--no-gen", "--push"]);
    expect(res.code).toBe(1);
    const head = r.git(r.work, "rev-parse", "HEAD");
    expect(res.out.slice(1)).toEqual([
      `re-review focus (red-team the merged head ${head}; start here):`,
      "  overlap (both the PR and main changed): none",
      "  hand-resolved conflicts: none",
      "  import-linked (main changed; one import from a PR file): none",
      "  export declarations main added/removed (grep their callers in the PR): none",
      "  exports whose body main changed (grep their callers in the PR): none",
      `head: ${head}`,
    ]);
    expect(res.err.join("\n")).toContain("git push failed");
    expect(res.err.join("\n")).toContain(`the merge is committed (${head}) but not pushed`);
  });

  it("a rename counts both paths (--no-renames): main's edit of the old path overlaps the PR", () => {
    const r = setup(BASE);
    r.git(r.work, "mv", "src/shared.txt", "src/moved.txt");
    r.git(r.work, "commit", "-q", "-m", "pr: rename");
    r.commit(r.origin, { "src/shared.txt": ends("one", "FIVE") }, "main");
    const res = r.run(["--no-gen", "--json"]);
    expect(res.code, res.err.join("\n")).toBe(0);
    expect(res.json().focus.overlap).toEqual(["src/shared.txt"]);
  });

  it("stops on real conflicts, then --continue keeps --push, stages only artifacts, records the hand files", () => {
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
    const stop = r.run(["--no-gen", "--push"]);
    expect(stop.code).toBe(2);
    const said = stop.err.join("\n");
    expect(said).toContain("  README.md (only its marked region is generated");
    expect(said).toContain("  src/a.txt");
    expect(said).toContain("then `npm run sync:main -- --continue --push --no-gen`");
    expect(r.git(r.work, "rev-parse", "-q", "--verify", "MERGE_HEAD")).toMatch(/^[0-9a-f]{40}$/);
    expect(r.git(r.work, "diff", "--name-only", "--diff-filter=U").split("\n")).toEqual(["README.md", "src/a.txt"]);
    // The generated file was already taken from main and staged.
    expect(readFileSync(join(r.work, "gen/out.txt"), "utf8")).toBe("count 3\n");

    // Staged with its markers still in it: refused.
    r.git(r.work, "add", "README.md", "src/a.txt");
    expect(r.run(["--continue", "--no-gen"]).code).toBe(2);

    r.write(r.work, { "src/a.txt": "both\n", "README.md": "# Readme\n\nboth texts\n", "notes.txt": "untracked\n" });
    r.git(r.work, "add", "README.md", "src/a.txt");
    let regenerated = 0;
    const fakeGen = (root: string) => {
      regenerated++;
      writeFileSync(join(root, "gen/out.txt"), "regenerated\n");
      writeFileSync(join(root, "stray.txt"), "a file no generator owns\n");
      return true;
    };
    // --push is not repeated: the sync was started with it.
    const res = r.run(["--continue", "--json"], fakeGen);
    expect(res.code, res.err.join("\n")).toBe(0);
    expect(regenerated).toBe(1);
    const j = res.json();
    expect(j).toMatchObject({
      upToDate: false,
      oldHead,
      scripted: ["gen/out.txt"],
      hand: ["README.md", "src/a.txt"],
      pushed: true,
      focus: {
        overlap: ["README.md", "src/a.txt"],
        hand: ["README.md", "src/a.txt"],
        importLinked: [],
        changedExports: [],
        changedExportBodies: [],
      },
    });
    expect(r.remoteHead("feat")).toBe(j.head);
    expect(r.git(r.work, "show", "HEAD:gen/out.txt")).toBe("regenerated");
    // Never `git add -A`: the regenerator's stray file is reported and left out of the commit, and an
    // untracked file from before the regeneration is not even reported.
    expect(r.git(r.work, "ls-tree", "--name-only", "HEAD")).not.toContain("stray.txt");
    expect(existsSync(join(r.work, "stray.txt"))).toBe(true);
    const strayLine = res.err.find((l) => l.includes("not generated artifacts")) ?? "";
    expect(strayLine).toContain("stray.txt");
    expect(strayLine).not.toContain("notes.txt");
  });

  it("a CHANGELOG entry both sides edited is a hand conflict; an artifact only main knows of is too", () => {
    const r = setup(BASE);
    r.commit(
      r.work,
      {
        "CHANGELOG.md": CHANGELOG_BASE.replace("- base entry", "- base entry, reworded by the PR"),
        "gen/new.txt": "mine\n",
      },
      "pr",
    );
    const json = JSON.stringify({
      ...JSON.parse(JSON_TEXT),
      artifacts: { ...JSON.parse(JSON_TEXT).artifacts, "gen/new.txt": "gen:z" },
    });
    r.commit(
      r.origin,
      {
        "CHANGELOG.md": CHANGELOG_BASE.replace("- base entry", "- base entry, reworded on main"),
        "gen/new.txt": "generated\n",
        ".claude/hooks/generated-artifacts.json": json,
      },
      "main",
    );
    const res = r.run(["--no-gen"]);
    expect(res.code).toBe(2);
    const said = res.err.join("\n");
    expect(said).toContain("  CHANGELOG.md");
    expect(said).toContain("  gen/new.txt");
    expect(said).not.toContain("resolved CHANGELOG.md");
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
    expect(res.err.join("\n")).toContain("--changelog-exempt");
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
      focus: { overlap: [], hand: [], importLinked: [], changedExports: [], changedExportBodies: [] },
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
