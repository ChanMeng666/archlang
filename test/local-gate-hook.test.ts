/** .claude/hooks/local-gate.mjs; .claude/hooks/local-gate.mjs RULES. */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs hook with no type declarations.
import { decide, generatedArtifacts, RULES, verdict } from "../.claude/hooks/local-gate.mjs";
import { renderGeneratedArtifacts } from "../scripts/gen-generated-artifacts.js";
import { GENERATED_ARTIFACTS_JSON, GENERATORS } from "../scripts/generators.js";

const here = resolve(__dirname, "..");
const check = (command: string, cwd = here): string | null => verdict(command, cwd, here);

let scratch = "";
let other = "";
let otherWorktree = "";

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "local-gate-"));
  other = join(scratch, "other");
  otherWorktree = join(scratch, "other-wt");
  const git = (...args: string[]) => execFileSync("git", args, { stdio: "ignore" });
  git("init", "-q", other);
  git("-C", other, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  git("-C", other, "worktree", "add", "-q", otherWorktree);
});

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe(".claude/hooks/local-gate.mjs", () => {
  it("blocks heavy suites run in this repository", () => {
    expect(check("npx vitest run test/keep.test.ts")).toBe("vitest");
    expect(check("npm run check")).toBe("npm run check");
    expect(check("cd test && npx vitest run keep")).toBe("vitest");
  });

  it("lets the local gate and mentions through", () => {
    expect(check("npm run check:quick")).toBeNull();
    expect(check('git commit -m "ran npm run check and vitest"')).toBeNull();
    expect(check("npx vitest run x  #allow-local-heavy release gate")).toBeNull();
  });

  it("leaves a command that runs in another repository to that repository", () => {
    expect(check(`cd ${other} && npm run check`)).toBeNull();
    expect(check(`cd "${other}" && npx vitest run`)).toBeNull();
    expect(check(`Set-Location "${other}"; npm test`)).toBeNull();
    expect(check(`npm --prefix ${other} run check`)).toBeNull();
    expect(check("npm run check", other)).toBeNull();
  });

  it("treats every worktree of a repository as that repository", () => {
    expect(verdict("npm test", otherWorktree, other)).toBe("npm test");
  });

  it("fails closed when the target directory cannot be read or told", () => {
    expect(check(`cd ${join(scratch, "missing")} && npm run check`)).toBe("npm run check");
    expect(check(`cd ${other} && cd ${here} && npm test`)).toBe("npm test");
    expect(check(`cd ${other} && cd - && npm test`)).toBe("npm test");
    expect(check(`pushd ${other}; popd; npm test`)).toBe("npm test");
    expect(check(`cd ${other} || npm test`)).toBe("npm test");
    expect(check(`cd ${other} && npm --prefix ${here} test`)).toBe("npm test");
    expect(check(`npm --prefix ${other} run x && npm --prefix ${here} test`)).toBe("npm test");
    expect(check(`npm --prefix ${other} run x && npm test`)).toBe("npm test");
  });

  it("does not count directory changes or || inside quotes, or || after the heavy call", () => {
    expect(check(`cd ${other} && npm test || echo failed`)).toBeNull();
    expect(check(`cd ${other} && git commit -m "fix; cd later" && npm test`)).toBeNull();
    expect(check(`cd ${other} && git log --format="a||b" && npm test`)).toBeNull();
  });

  it("reads PowerShell's location aliases", () => {
    expect(check(`Push-Location "${other}"; npm test`)).toBeNull();
    expect(check(`sl "${other}"; npm test`)).toBeNull();
  });
});

// ---- RULES: refused outright, whatever #allow-local-heavy says ---------------------------------

type Hit = { rule: string; reason: string; why: string } | null;
const call = (tool: string, toolInput: Record<string, unknown>, cwd = here, env: Record<string, string> = {}): Hit =>
  decide({ tool_name: tool, tool_input: toolInput, cwd }, here, env);
const ruleOf = (tool: string, command: string, cwd = here): string | null => call(tool, { command }, cwd)?.rule ?? null;
const fwd = (p: string): string => p.replace(/\\/g, "/");

describe(".claude/hooks/local-gate.mjs RULES", () => {
  let base = "";
  let husk = ""; // a worktree husk whose node_modules is a junction (a dir symlink off Windows)
  let deep = ""; // a link at depth 2: deep/packages/node_modules
  let scratchDay = ""; // a scratch day folder: a worktree's node_modules junction 4 levels down
  let tooDeep = ""; // a link 7 levels down only, past the scan depth (6)
  let plain = "";
  const links: string[] = [];

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "local-gate-rules-"));
    const primary = join(base, "primary-node_modules");
    husk = join(base, "husk");
    deep = join(base, "deep");
    scratchDay = join(base, "2026-11-10");
    tooDeep = join(base, "too-deep");
    plain = join(base, "plain");
    const scratchWorktree = join(scratchDay, "eh35-slug", "worktrees", "agent-x");
    const sevenDown = join(tooDeep, "a", "b", "c", "d", "e", "f");
    for (const d of [primary, husk, join(deep, "packages"), scratchWorktree, sevenDown, join(plain, "a", "b")]) {
      mkdirSync(d, { recursive: true });
    }
    for (const at of [
      join(husk, "node_modules"),
      join(deep, "packages", "node_modules"),
      join(scratchWorktree, "node_modules"),
      join(sevenDown, "node_modules"),
    ]) {
      symlinkSync(primary, at, "junction");
      links.push(at);
    }
  });

  afterAll(() => {
    // Unlink first; the links point inside `base` anyway.
    for (const at of links) unlinkSync(at);
    if (base) rmSync(base, { recursive: true, force: true });
  });

  it("every row says why, names its tools, and has cases below", () => {
    expect(RULES.map((r: { id: string }) => r.id)).toEqual([
      "generated-edit",
      "filtered-update",
      "delete-through-link",
    ]);
    for (const r of RULES as { why: string; tools: string[]; check: unknown }[]) {
      expect(r.why.length).toBeGreaterThan(40);
      expect(r.tools.length).toBeGreaterThan(0);
      expect(typeof r.check).toBe("function");
    }
  });

  it("settings.json runs the hook for every tool a rule reads", () => {
    const settings = JSON.parse(readFileSync(join(here, ".claude", "settings.json"), "utf8"));
    const entry = settings.hooks.PreToolUse.find((e: { hooks: { command: string }[] }) =>
      e.hooks.some((h) => h.command.includes(".claude/hooks/local-gate.mjs")),
    );
    const matched = new Set(String(entry.matcher).split("|"));
    for (const r of RULES as { tools: string[] }[]) for (const t of r.tools) expect(matched, t).toContain(t);
  });

  describe("generated-edit", () => {
    it("the hook's list is GENERATORS, rendered by gen:generated-artifacts and committed fresh", () => {
      expect(readFileSync(join(here, GENERATED_ARTIFACTS_JSON), "utf8")).toBe(renderGeneratedArtifacts());
      expect(Object.keys(generatedArtifacts(here))).toEqual(GENERATORS.flatMap((g) => g.artifacts));
    });

    it("refuses an Edit of every artifact GENERATORS lists, naming its generator", () => {
      for (const { script, artifacts } of GENERATORS) {
        for (const a of artifacts) {
          const hit = call("Edit", { file_path: join(here, a), old_string: "x", new_string: "y" });
          expect(hit?.rule, a).toBe("generated-edit");
          expect(hit?.reason, a).toContain(`npm run ${script}`);
        }
      }
    });

    it("refuses Write, MultiEdit and NotebookEdit too, a relative path, and anything under dist/", () => {
      expect(call("Write", { file_path: join(here, "spec.llm.md"), content: "" })?.rule).toBe("generated-edit");
      expect(call("MultiEdit", { file_path: join(here, "docs", "error-codes.md"), edits: [] })?.rule).toBe(
        "generated-edit",
      );
      expect(call("NotebookEdit", { notebook_path: join(here, "llms-full.txt") })?.rule).toBe("generated-edit");
      expect(call("Edit", { file_path: "docs/cli-reference.md" })?.rule).toBe("generated-edit");
      expect(call("Write", { file_path: join(here, "dist", "index.js") })?.reason).toContain("dist/");
      expect(call("Write", { file_path: join(here, "packages", "mcp", "dist", "server.js") })?.rule).toBe(
        "generated-edit",
      );
    });

    it("allows a source, another repository's same-named file, node_modules, and the env escape", () => {
      expect(call("Edit", { file_path: join(here, "src", "expr.ts") })).toBeNull();
      expect(call("Edit", { file_path: join(here, "scripts", "generators.ts") })).toBeNull();
      expect(call("Write", { file_path: join(other, "docs", "error-codes.md") })).toBeNull();
      expect(call("Write", { file_path: join(here, "node_modules", "x", "dist", "y.js") })).toBeNull();
      const allowEnv = { ARCHLANG_ALLOW_GENERATED_EDIT: "1" };
      expect(call("Edit", { file_path: join(here, "docs", "error-codes.md") }, here, allowEnv)).toBeNull();
      expect(call("Bash", { command: "echo", file_path: join(here, "spec.llm.md") })).toBeNull();
    });
  });

  describe("filtered-update", () => {
    it("refuses a filtered -u, and -u on fixture-byte-identity, even under #allow-local-heavy", () => {
      for (const command of [
        'npx vitest run -u -t "multi-level" test/snapshot.test.ts #allow-local-heavy owner',
        "npx vitest -u --testNamePattern=storeys",
        "npm test -- -u -t storeys",
        "npx vitest run --update -t 're-blessed when redrawn'",
        'npx vitest run -u -t "re-blessed when redrawn" test/fixture-byte-identity.test.ts test/snapshot.test.ts',
        "npx vitest run -u test/fixture-byte-identity.test.ts #allow-local-heavy owner",
        "node_modules/.bin/vitest run -t=x -u",
        "npm --prefix . test -- -u -t storeys",
        "npx vitest run -u fixture-byte",
        "npx vitest run -u test/fixture-byte-identity",
        'npx vitest run -u -t "re-blessed when redrawn" byte-identity',
      ]) {
        expect(ruleOf("Bash", command), command).toBe("filtered-update");
      }
      expect(ruleOf("PowerShell", 'echo start; npx vitest run -u -t "x" test/a.test.ts')).toBe("filtered-update");
    });

    it("allows the one scoped re-bless, an unfiltered -u, a filter without -u, and mentions", () => {
      const scoped =
        'npx vitest run -u -t "re-blessed when redrawn" test/fixture-byte-identity.test.ts #allow-local-heavy owner';
      expect(ruleOf("Bash", scoped)).toBeNull();
      expect(verdict(scoped, here, here)).toBeNull();
      expect(ruleOf("Bash", "npx vitest run -u test/snapshot.test.ts")).toBeNull();
      expect(ruleOf("Bash", "npx vitest run -u test"), "no part of the pins file's stem: the whole suite").toBeNull();
      expect(
        ruleOf("Bash", "npm --prefix test run lint -- -u -t x"),
        "`--prefix`'s value is not the script",
      ).toBeNull();
      expect(ruleOf("Bash", "npx vitest run -t storeys test/a.test.ts")).toBeNull();
      expect(ruleOf("Bash", 'git commit -m "never run vitest -u -t x"')).toBeNull();
      expect(ruleOf("Bash", `cd ${other} && npx vitest run -u -t x`)).toBeNull();
    });
  });

  describe("delete-through-link", () => {
    it("refuses a recursive delete with a link at the target or up to six levels below it", () => {
      for (const command of [
        `rm -rf "${fwd(husk)}"`,
        `rm -r -f ${fwd(husk)}`,
        `rm --recursive -- ${fwd(husk)}`,
        `rm -rf ${fwd(join(husk, "node_modules"))}`,
        `rm -rf ${fwd(deep)}`,
        `rm -rf ${fwd(scratchDay)}/`,
        `cd ${fwd(base)} && rm -rf hu*`,
        `git worktree remove --force ${fwd(husk)}`,
        `git -C ${fwd(base)} worktree remove husk`,
      ]) {
        expect(ruleOf("Bash", command), command).toBe("delete-through-link");
      }
      for (const command of [
        `Remove-Item -Recurse -Force '${husk}'`,
        `Remove-Item -LiteralPath "${husk}" -Recurse`,
        `rm -r '${husk}'`,
        `ri -Path:${husk},${plain} -Recurse:$true`,
        `git worktree remove --force '${husk}'`,
        `[System.IO.Directory]::Delete('${husk}', $true)`,
      ]) {
        expect(ruleOf("PowerShell", command), command).toBe("delete-through-link");
      }
      const hit = call("Bash", { command: `rm -rf ${fwd(husk)}` });
      expect(hit?.reason).toContain(`[System.IO.Directory]::Delete('${join(husk, "node_modules")}')`);
    });

    it("allows a tree with no link within six levels, a non-recursive delete, the unlink itself, and what it cannot read", () => {
      expect(ruleOf("Bash", `rm -rf ${fwd(plain)}`)).toBeNull();
      expect(ruleOf("Bash", `rm -rf ${fwd(tooDeep)}`)).toBeNull();
      expect(ruleOf("Bash", `rm -f ${fwd(join(husk, "x.txt"))}`)).toBeNull();
      expect(ruleOf("Bash", "rm -rf $TARGET")).toBeNull();
      expect(ruleOf("Bash", `echo "rm -rf ${fwd(husk)}"`)).toBeNull();
      expect(ruleOf("PowerShell", `Remove-Item '${husk}'`)).toBeNull();
      expect(ruleOf("PowerShell", `[System.IO.Directory]::Delete('${join(husk, "node_modules")}')`)).toBeNull();
      expect(ruleOf("PowerShell", `rm -rf '${husk}'`), "-rf is not a PowerShell parameter").toBeNull();
    });
  });

  it("the hook process exits 2 with the rule's reason on stderr", () => {
    const hook = join(here, ".claude", "hooks", "local-gate.mjs");
    const run = (payload: object): { status: number; stderr: string } => {
      try {
        execFileSync(process.execPath, [hook], { input: JSON.stringify(payload), stdio: ["pipe", "pipe", "pipe"] });
        return { status: 0, stderr: "" };
      } catch (e) {
        const err = e as { status: number; stderr: Buffer };
        return { status: err.status, stderr: String(err.stderr) };
      }
    };
    const refused = run({ tool_name: "Bash", tool_input: { command: `rm -rf ${fwd(husk)}` }, cwd: here });
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain("[delete-through-link]");
    expect(run({ tool_name: "Edit", tool_input: { file_path: join(here, "src", "expr.ts") }, cwd: here }).status).toBe(
      0,
    );
  });
});
