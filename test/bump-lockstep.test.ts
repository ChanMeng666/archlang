/**
 * `scripts/bump-lockstep.ts` rewrites exactly the pinned release fields and nothing else:
 * run on a tmp copy of the manifests and the lock, undo exactly the expected edits, compare every byte.
 */
import { mkTmp } from "./helpers/tmp.js";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pinLockstep } from "../scripts/bump-lockstep.js";

const REPO = resolve(__dirname, "..");
const MCP = "packages/mcp/package.json";
const SERVER = "packages/mcp/server.json";
const VSCODE = "editors/vscode/package.json";
const LOCK = "package-lock.json";
const FILES = [MCP, SERVER, VSCODE, LOCK];
const tmp = mkTmp("bump-lockstep-");
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function copyTo(name: string): string {
  const root = join(tmp, name);
  for (const f of FILES) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    cpSync(join(REPO, f), join(root, f));
  }
  return root;
}
const read = (root: string, f: string): string => readFileSync(join(root, f), "utf8");
const original = (f: string): string => readFileSync(join(REPO, f), "utf8");
const oldShim: string = JSON.parse(original(MCP)).version;
const oldRange = /"@chanmeng666\/archlang": "(\^[^"]*)"/.exec(original(MCP))![1]!;
const [a, b, c] = oldShim.split(".").map(Number);
const bumped = `${a}.${b}.${c! + 1}`;

describe("release:pin", () => {
  it("changes exactly the pinned fields (lock included), byte-for-byte elsewhere, and is idempotent", () => {
    const root = copyTo("a");
    const edits = pinLockstep(root, "9.8.7", { write: true });
    expect(edits.map((e) => `${e.file} ${e.field}`).sort()).toEqual(
      [
        `${LOCK} editors/vscode devDependencies range`,
        `${LOCK} packages/mcp dependencies range`,
        `${LOCK} packages/mcp version`,
        `${VSCODE} devDependencies["@chanmeng666/archlang"]`,
        `${MCP} dependencies["@chanmeng666/archlang"]`,
        `${MCP} version`,
        `${SERVER} packages[0].version`,
        `${SERVER} version`,
      ].sort(),
    );
    for (const f of FILES) {
      const undone = read(root, f)
        .replaceAll("^9.8.7", oldRange)
        .replaceAll(`"version": "${bumped}"`, `"version": "${oldShim}"`);
      expect(undone).toBe(original(f));
    }
    // The lock now agrees with the manifests it mirrors.
    const lock = JSON.parse(read(root, LOCK)).packages;
    expect(lock["packages/mcp"].version).toBe(bumped);
    expect(lock["packages/mcp"].dependencies["@chanmeng666/archlang"]).toBe("^9.8.7");
    expect(lock["editors/vscode"].devDependencies["@chanmeng666/archlang"]).toBe("^9.8.7");
    expect(read(root, VSCODE)).toContain('"@chanmeng666/archlang": "^9.8.7"');
    expect(JSON.parse(read(root, SERVER)).packages[0].version).toBe(bumped);
    expect(pinLockstep(root, "9.8.7", { write: true })).toEqual([]);
  });

  it("--dry-run writes nothing", () => {
    const root = copyTo("b");
    expect(pinLockstep(root, "9.8.7", { write: false }).length).toBe(8);
    for (const f of FILES) expect(read(root, f)).toBe(original(f));
  });

  it("an explicit shim version wins over the patch bump", () => {
    const root = copyTo("c");
    pinLockstep(root, "9.8.7", { write: true, shimVersion: "3.0.0" });
    expect(JSON.parse(read(root, MCP)).version).toBe("3.0.0");
    expect(JSON.parse(read(root, SERVER)).packages[0].version).toBe("3.0.0");
    expect(JSON.parse(read(root, LOCK)).packages["packages/mcp"].version).toBe("3.0.0");
  });

  it("leaves the shim version alone when the range is already current", () => {
    const root = copyTo("d");
    const current = oldRange.slice(1);
    expect(pinLockstep(root, current, { write: true })).toEqual([]);
    for (const f of FILES) expect(read(root, f)).toBe(original(f));
  });

  it("refuses a non-semver version", () => {
    const root = copyTo("e");
    expect(() => pinLockstep(root, "1.2", { write: true })).toThrow(/x\.y\.z/);
    expect(() => pinLockstep(root, "9.8.7", { write: true, shimVersion: "latest" })).toThrow(/x\.y\.z/);
    for (const f of FILES) expect(read(root, f)).toBe(original(f));
  });
});
