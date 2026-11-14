/** scripts/sync-main.mjs: merge origin/main, script the record and generated-artifact conflicts, triage the review. */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import { artifactSets, classifyUnmerged, main, parseArgs, triage } from "../scripts/sync-main.mjs";

/**
 * The pure parts (classification, the review verdict) on literal inputs, then the whole script in
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

  it("the review carries when nothing overlaps and nothing was resolved by hand", () => {
    const v = triage({
      prFiles: ["src/a.ts", "CHANGELOG.md", "gen/out.txt"],
      mainFiles: ["src/b.ts", "CHANGELOG.md", "gen/out.txt"],
      hand: [],
      artifacts: sets.artifacts,
    });
    expect(v).toEqual({ overlap: [], hand: [], reasons: [], reviewCarries: true });
  });

  it("overlap and hand resolution each need a re-review, with the reason", () => {
    const v = triage({
      prFiles: ["src/a.ts", "src/c.ts"],
      mainFiles: ["src/c.ts", "src/a.ts", "src/z.ts"],
      hand: ["src/a.ts", "src/h.ts"],
      artifacts: sets.artifacts,
    });
    expect(v.reviewCarries).toBe(false);
    expect(v.overlap).toEqual(["src/a.ts", "src/c.ts"]);
    expect(v.hand).toEqual(["src/a.ts", "src/h.ts"]);
    expect(v.reasons).toEqual([
      { file: "src/a.ts", why: "overlap: the PR and main both changed it; hand-resolved conflict" },
      { file: "src/c.ts", why: "overlap: the PR and main both changed it" },
      { file: "src/h.ts", why: "hand-resolved conflict" },
    ]);
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
    for (const [k, v] of [
      ["core.autocrlf", "false"],
      ["user.email", "sync-main@example.invalid"],
      ["user.name", "sync-main"],
      ["commit.gpgsign", "false"],
      ["core.hooksPath", join(root, "no-hooks")],
    ]) {
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
};

const withEntry = (entry: string, text = CHANGELOG_BASE) => text.replace("- base entry\n", `- base entry\n${entry}\n`);

describe("sync:main on a throwaway repository", () => {
  it("scripts a CHANGELOG and a generated-file conflict, commits, and the review carries", () => {
    const r = setup(BASE);
    r.commit(
      r.work,
      { "CHANGELOG.md": withEntry("- branch entry"), "gen/out.txt": "count 2\n", "src/a.txt": "A\n" },
      "pr",
    );
    r.commit(
      r.origin,
      { "CHANGELOG.md": withEntry("- main entry"), "gen/out.txt": "count 3\n", "src/b.txt": "B\n" },
      "main",
    );
    const oldHead = r.git(r.work, "rev-parse", "HEAD");
    const res = r.run(["--no-gen", "--json"]);
    expect(res.code, res.err.join("\n")).toBe(0);
    const j = res.json();
    expect(j).toMatchObject({ upToDate: false, oldHead, hand: [], overlap: [], reviewCarries: true });
    expect([...j.scripted].sort()).toEqual(["CHANGELOG.md", "gen/out.txt"]);
    expect(j.head).toMatch(/^[0-9a-f]{40}$/);
    expect(r.git(r.work, "rev-parse", "HEAD")).toBe(j.head);
    expect(r.git(r.work, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(r.git(r.work, "status", "--porcelain", "--untracked-files=no")).toBe("");
    const changelog = readFileSync(join(r.work, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("- branch entry\n");
    expect(changelog).toContain("- main entry\n");
    expect(readFileSync(join(r.work, "gen/out.txt"), "utf8")).toBe("count 3\n");
    // Nothing to merge on a second run.
    const again = r.run(["--no-gen", "--json"]);
    expect(again.code).toBe(0);
    expect(again.json()).toMatchObject({ upToDate: true, head: j.head, reviewCarries: true });
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
      overlap: ["README.md", "src/a.txt"],
      reviewCarries: false,
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
    expect(done.json()).toMatchObject({ oldHead, hand: [], overlap: [], reviewCarries: true });
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
