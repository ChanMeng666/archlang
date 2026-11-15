/**
 * The package's `e2e` script passes its arguments to both vitest passes (card RM8.8b item 6). npm
 * appends a script's arguments to the script's LAST command, so a script `A && B` filters B only:
 * `npm -w packages/archlang-3d run e2e -- e2e/glb.e2e.ts` ran every e2e file in A. The script is
 * one command, `tsx scripts/e2e.ts`, and the runner gives each pass the filters that select its files.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { e2eFiles, e2ePasses, FRAME_BUDGET } from "../scripts/e2e.js";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = (JSON.parse(readFileSync(resolve(PKG, "package.json"), "utf8")) as { scripts: Record<string, string> })
  .scripts.e2e as string;
const FILES = e2eFiles(PKG);

describe("the e2e script (card RM8.8b item 6)", () => {
  it("is one command, so npm's appended arguments reach the runner and not only a last pass", () => {
    expect(script.split(/&&|\|\||;/).length).toBe(1);
    expect(script).toBe("tsx scripts/e2e.ts");
  });

  it("with no argument: every other file, then the frame budget alone", () => {
    expect(FILES).toContain(FRAME_BUDGET);
    expect(e2ePasses([], FILES)).toEqual([
      ["run", "--config", "vitest.e2e.config.ts", "--exclude", FRAME_BUDGET],
      ["run", "--config", "vitest.e2e.config.ts", FRAME_BUDGET],
    ]);
  });

  it("a file filter reaches the first pass and skips the frame budget's", () => {
    expect(e2ePasses(["e2e/glb.e2e.ts"], FILES)).toEqual([
      ["run", "--config", "vitest.e2e.config.ts", "--exclude", FRAME_BUDGET, "e2e/glb.e2e.ts"],
    ]);
    // From the repository root, with Windows separators, and with an option.
    expect(e2ePasses(["--reporter=verbose", "packages\\archlang-3d\\e2e\\keyframes.e2e.ts"], FILES)).toEqual([
      [
        "run",
        "--config",
        "vitest.e2e.config.ts",
        "--exclude",
        FRAME_BUDGET,
        "--reporter=verbose",
        "packages/archlang-3d/e2e/keyframes.e2e.ts",
      ],
    ]);
  });

  it("the frame budget's filter runs its pass alone; a filter selecting both runs both", () => {
    expect(e2ePasses(["frame-budget"], FILES)).toEqual([["run", "--config", "vitest.e2e.config.ts", FRAME_BUDGET]]);
    expect(e2ePasses(["e2e/"], FILES)).toEqual([
      ["run", "--config", "vitest.e2e.config.ts", "--exclude", FRAME_BUDGET, "e2e/"],
      ["run", "--config", "vitest.e2e.config.ts", FRAME_BUDGET],
    ]);
  });

  it("a filter that selects nothing runs nothing", () => {
    expect(e2ePasses(["no-such-file"], FILES)).toEqual([]);
  });
});
