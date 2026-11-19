/**
 * `npm run digest:preview` (card TR12): the file selection and the vitest stand-in it loads them with.
 *
 * The preview runs the digest test files' own code with `vitest` resolved to
 * `scripts/digest-preview/vitest-shim.ts`, so what can go wrong is the stand-in, not a measurement:
 *  - a digest test file the selection misses (a pinned row nobody previews);
 *  - a vitest export a selected file imports that the stand-in lacks (it would fail to load);
 *  - an equality that disagrees with vitest's (a row reported moved, or not, wrongly);
 *  - a moved row that throws instead of being recorded, which would hide the rows after it.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { digestFiles, setupFiles } from "../scripts/digest-preview/select.js";
import * as shim from "../scripts/digest-preview/vitest-shim.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const HEX_C = "c".repeat(64);

describe("digest:preview selection", () => {
  const selected = digestFiles(ROOT).map((f) => f.file);

  it("holds the laws whose rows CI flagged on AL1, AL4 and AL3a, and a file whose pins live in a module", () => {
    for (const f of [
      "test/outdoor-byte-identity.test.ts",
      "test/roof-void-byte-identity.test.ts",
      "test/new-families-byte-identity.test.ts",
      "test/openings-between-digests.test.ts",
      "test/wall-between-around-digests.test.ts",
      "test/height-byte-identity.test.ts",
    ]) {
      expect(selected, f).toContain(f);
    }
    expect(digestFiles(ROOT).find((f) => f.file === "test/height-byte-identity.test.ts")?.via).toContain(
      "test/byte-identity-baseline.ts",
    );
  });

  it("is sorted and never selects itself (it imports no core)", () => {
    expect([...selected].sort()).toEqual(selected);
    expect(selected).not.toContain("test/digest-preview.test.ts");
  });

  it("every vitest name a selected file imports is one the stand-in exports", () => {
    const exported = new Set(Object.keys(shim));
    const missing: string[] = [];
    for (const f of selected) {
      const text = readFileSync(join(ROOT, f), "utf8");
      for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']vitest["']/g)) {
        for (const part of (m[1] as string).split(",")) {
          const name = part
            .trim()
            .split(/\s+as\s+/)[0]
            ?.replace(/^type\s+/, "");
          if (name && !part.trim().startsWith("type ") && !exported.has(name)) missing.push(`${f}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("loads vitest's setup files, read from vitest.config.ts", () => {
    expect(setupFiles(ROOT)).toEqual(["./test/setup/fast-check.ts"]);
  });
});

describe("digest:preview stand-in: equality agrees with vitest's toEqual", () => {
  const cases: [string, unknown, unknown][] = [
    ["same primitives", 1, 1],
    ["NaN", Number.NaN, Number.NaN],
    ["+0 and -0", 0, -0],
    ["an undefined key is absent", { a: 1, b: undefined }, { a: 1 }],
    ["array order", [1, 2], [2, 1]],
    ["array holes vs length", [1], [1, undefined]],
    ["nested", { a: [{ b: "x" }] }, { a: [{ b: "x" }] }],
    ["nested differs", { a: [{ b: "x" }] }, { a: [{ b: "y" }] }],
    ["sets by content", new Set([1, 2]), new Set([2, 1])],
    ["sets differ", new Set([1, 2]), new Set([1, 3])],
    ["maps", new Map([["k", 1]]), new Map([["k", 1]])],
    ["maps differ", new Map([["k", 1]]), new Map([["k", 2]])],
    ["string vs number", "1", 1],
    ["null vs undefined", null, undefined],
    ["array vs object", [], {}],
    ["table rows", [["frames", HEX_A]], [["frames", HEX_A]]],
    ["table row moved", [["frames", HEX_A]], [["frames", HEX_B]]],
  ];
  it.each(cases)("%s", (_name, a, b) => {
    let vitest = true;
    try {
      expect(a).toEqual(b);
    } catch {
      vitest = false;
    }
    expect(shim.equals(a, b)).toBe(vitest);
  });

  it("asymmetric matchers match as vitest's do", () => {
    const got = { code: "W_X", list: [1, 2, 3], text: "hello world" };
    const want = {
      code: shim.expect.any(String),
      list: shim.expect.arrayContaining([3, 1]),
      text: shim.expect.stringMatching(/world$/),
    };
    expect(shim.equals(got, want)).toBe(true);
    expect(shim.equals({ ...got, code: 7 }, want)).toBe(false);
    expect(shim.equals({ a: 1, b: 2 }, shim.expect.objectContaining({ a: 1 }))).toBe(true);
  });
});

describe("digest:preview stand-in: a moved pin is recorded, every other failure throws", () => {
  const run = async (fn: () => void) => {
    shim.takeTests();
    shim.it("t", fn);
    const [t] = shim.takeTests();
    return shim.runTest(t!);
  };

  it("a moved toBe is a row and the test carries on to the next pin", async () => {
    let reached = false;
    const rows = await run(() => {
      shim.expect(HEX_B).toBe(HEX_A);
      reached = true;
      shim.expect(HEX_C).toBe(HEX_C);
    });
    expect(rows).toEqual([{ where: "", pinned: HEX_A, now: HEX_B }]);
    expect(reached).toBe(true);
  });

  it("a moved row in a pinned table is named by its first column", async () => {
    const rows = await run(() => {
      shim
        .expect([
          ["frames", HEX_B],
          ["ring", HEX_C],
        ])
        .toEqual([
          ["frames", HEX_A],
          ["ring", HEX_C],
        ]);
    });
    expect(rows).toEqual([{ where: "[frames][1]", pinned: HEX_A, now: HEX_B }]);
  });

  it("a non-digest failure throws, and so does a pin measured as something other than a string", async () => {
    await expect(run(() => shim.expect("x").toBe("y"))).rejects.toThrow(/expected "x" to be "y"/);
    await expect(run(() => shim.expect(undefined).toBe(HEX_A))).rejects.toThrow(/to be/);
    await expect(run(() => shim.expect([["frames", HEX_B], 1]).toEqual([["frames", HEX_A], 2]))).rejects.toThrow();
  });

  it("a negated matcher never records a row", async () => {
    await expect(run(() => shim.expect(HEX_A).not.toBe(HEX_A))).rejects.toThrow(/not to be/);
  });

  it("names an .each case as vitest does, and nests describe titles with ' > '", () => {
    shim.takeTests();
    shim.describe("law", () => {
      shim.it.each([[HEX_A, "studio.arch"]])("%s %s", () => {});
      shim.it.each([{ name: "frames" }])("$name row", () => {});
    });
    expect(shim.takeTests().map((t) => t.name)).toEqual([`law > ${HEX_A} studio.arch`, "law > frames row"]);
  });
});
