import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — a zero-dep .mjs hook with no type declarations.
import { verdict } from "../.claude/hooks/local-gate.mjs";

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
