/**
 * `scripts/bump-lockstep.ts` rewrites exactly the pinned release fields and nothing else:
 * run on a tmp copy of the three manifests, undo exactly the expected edits, compare every byte.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { pinLockstep } from "../scripts/bump-lockstep.js";

const REPO = resolve(__dirname, "..");
const MCP = "packages/mcp/package.json";
const SERVER = "packages/mcp/server.json";
const VSCODE = "editors/vscode/package.json";
const FILES = [MCP, SERVER, VSCODE];
const tmp = mkdtempSync(join(tmpdir(), "bump-lockstep-"));
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

describe("release:pin", () => {
  it("changes exactly the pinned fields, byte-for-byte elsewhere, and is idempotent", () => {
    const root = copyTo("a");
    const edits = pinLockstep(root, "9.8.7", { write: true });
    expect(edits.map((e) => `${e.file} ${e.field}`).sort()).toEqual([
      `${VSCODE} devDependencies["@chanmeng666/archlang"]`,
      `${MCP} dependencies["@chanmeng666/archlang"]`,
      `${MCP} version`,
      `${SERVER} packages[0].version`,
      `${SERVER} version`,
    ]);
    const oldShim: string = JSON.parse(original(MCP)).version;
    const [a, b, c] = oldShim.split(".").map(Number);
    const newShim = `${a}.${b}.${c! + 1}`;
    const oldRange = /"@chanmeng666\/archlang": "(\^[^"]*)"/.exec(original(MCP))![1]!;
    for (const f of FILES) {
      const undone = read(root, f)
        .replaceAll("^9.8.7", oldRange)
        .replaceAll(`"version": "${newShim}"`, `"version": "${oldShim}"`);
      // editors/vscode's own version is not the shim's: it must be untouched, so only the range undoes.
      expect(undone).toBe(original(f));
    }
    expect(read(root, VSCODE)).toContain('"@chanmeng666/archlang": "^9.8.7"');
    expect(JSON.parse(read(root, SERVER)).packages[0].version).toBe(newShim);
    expect(pinLockstep(root, "9.8.7", { write: true })).toEqual([]);
  });

  it("--dry-run writes nothing", () => {
    const root = copyTo("b");
    expect(pinLockstep(root, "9.8.7", { write: false }).length).toBe(5);
    for (const f of FILES) expect(read(root, f)).toBe(original(f));
  });
});
