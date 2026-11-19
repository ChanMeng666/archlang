/**
 * `npm run digest:preview` (card TR12): the file selection, the vitest stand-in it loads them with, and the
 * runner end to end on a tiny synthetic tree.
 *
 * The preview runs the digest test files' own code with `vitest` resolved to
 * `scripts/digest-preview/vitest-shim.ts`, so what can go wrong is the harness, not a measurement:
 *  - a pin holder the selection misses (a pinned row nobody previews);
 *  - a vitest export a selected file imports that the stand-in lacks (it would fail to load);
 *  - an equality that disagrees with vitest's (a row reported moved, or not, wrongly);
 *  - a moved row lost to a throw, or zero work that reads as green.
 *
 * This file holds no 64-hex literal (each is built at run time), so the preview never selects it.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  digestFiles,
  EXCLUDED,
  pinsOf,
  reach,
  readTree,
  setupFiles,
  snapshotFiles,
} from "../scripts/digest-preview/select.js";
import * as shim from "../scripts/digest-preview/vitest-shim.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const HEX_C = "c".repeat(64);

describe("digest:preview selection", () => {
  const tree = readTree(ROOT);
  const selection = digestFiles(tree);
  const selected = selection.map((f) => f.file);

  it("holds the laws CI flagged on AL1, AL4 and AL3a, a pin reached through a helper, and a JSON pin table", () => {
    for (const f of [
      "test/outdoor-byte-identity.test.ts",
      "test/roof-void-byte-identity.test.ts",
      "test/new-families-byte-identity.test.ts",
      "test/openings-between-digests.test.ts",
      "test/wall-between-around-digests.test.ts",
      "test/height-byte-identity.test.ts",
      // pins in its own file, the core only through `test/helpers/keep-harness.ts`
      "test/keep-digests.test.ts",
      // pins in `test/tables/glyph-dispatch.json`, read with readFileSync
      "test/glyph-dispatch-table.test.ts",
    ]) {
      expect(selected, f).toContain(f);
    }
    const via = (f: string) => selection.find((s) => s.file === f)?.via;
    expect(via("test/height-byte-identity.test.ts")).toContain("test/byte-identity-baseline.ts");
    expect(via("test/glyph-dispatch-table.test.ts")).toContain("test/tables/glyph-dispatch.json");
  });

  it("every file under test/ holding a 64-hex literal is selected, reached by a selected file, or excluded by name", () => {
    const reached = new Set(selection.flatMap((s) => [s.file, ...s.via]));
    expect([...tree.holders].filter((h) => !reached.has(h) && !(h in EXCLUDED))).toEqual([]);
  });

  it("every exclusion names a file that still reaches a pin, with a reason (the list only shrinks)", () => {
    for (const [f, why] of Object.entries(EXCLUDED)) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
      expect(
        [...reach(tree, f)].some((x) => tree.holders.has(x)),
        f,
      ).toBe(true);
      expect(why.length, f).toBeGreaterThan(10);
    }
  });

  it("a file's pins are the 64-hex literals in its reach", () => {
    const pins = pinsOf(tree, "test/glyph-dispatch-table.test.ts");
    const table = JSON.parse(readFileSync(join(ROOT, "test/tables/glyph-dispatch.json"), "utf8")) as Record<
      string,
      string
    >;
    for (const hex of Object.values(table)) expect(pins.has(hex)).toBe(true);
  });

  it("is sorted, never selects itself, and names the snapshot laws it does not cover", () => {
    expect([...selected].sort()).toEqual(selected);
    expect(selected).not.toContain("test/digest-preview.test.ts");
    const snaps = snapshotFiles(tree);
    for (const f of ["test/fixture-byte-identity.test.ts", "test/snapshot.test.ts", "test/iso-snapshot.test.ts"]) {
      expect(snaps, f).toContain(f);
    }
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
  const holey: unknown[] = [];
  holey[1] = 1;
  const cases: [string, unknown, unknown][] = [
    ["same primitives", 1, 1],
    ["NaN", Number.NaN, Number.NaN],
    ["+0 and -0", 0, -0],
    ["an undefined key is absent", { a: 1, b: undefined }, { a: 1 }],
    ["array order", [1, 2], [2, 1]],
    ["array lengths", [1], [1, undefined]],
    ["a hole against a value", holey, [2, 1]],
    ["a hole against undefined", holey, [undefined, 1]],
    ["nested", { a: [{ b: "x" }] }, { a: [{ b: "x" }] }],
    ["nested differs", { a: [{ b: "x" }] }, { a: [{ b: "y" }] }],
    ["sets by content", new Set([1, 2]), new Set([2, 1])],
    ["sets differ", new Set([1, 2]), new Set([1, 3])],
    ["maps", new Map([["k", 1]]), new Map([["k", 1]])],
    ["maps differ", new Map([["k", 1]]), new Map([["k", 2]])],
    ["errors with different messages", new Error("a"), new Error("b")],
    ["errors with one message", new Error("a"), new Error("a")],
    ["error classes with one message", new TypeError("a"), new Error("a")],
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

  const contains: [string, () => unknown, unknown][] = [
    ["a string", () => "hello", "ell"],
    ["an array", () => [1, 2], 2],
    ["an array, absent", () => [1, 2], 3],
    ["a set", () => new Set(["k"]), "k"],
    ["a map's keys iterator", () => new Map([["k", 1]]).keys(), "k"],
    ["a map's keys iterator, absent", () => new Map([["k", 1]]).keys(), "z"],
  ];
  it.each(contains)("toContain and not.toContain on %s", (_name, got, item) => {
    const vitest = (neg: boolean) => {
      try {
        if (neg) expect(got()).not.toContain(item);
        else expect(got()).toContain(item);
        return true;
      } catch {
        return false;
      }
    };
    const stand = (neg: boolean) => {
      try {
        if (neg) shim.expect(got()).not.toContain(item);
        else shim.expect(got()).toContain(item);
        return true;
      } catch {
        return false;
      }
    };
    expect([stand(false), stand(true)]).toEqual([vitest(false), vitest(true)]);
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
  const run = async (fn: () => void, pins: string[] = [HEX_A]) => {
    shim.takeTests();
    shim.setPins(new Set(pins));
    shim.it("t", fn);
    const [t] = shim.takeTests();
    return shim.runTest(t!);
  };

  it("a moved toBe is a row and the test carries on to the next pin", async () => {
    let reached = false;
    const out = await run(() => {
      shim.expect(HEX_B).toBe(HEX_A);
      reached = true;
      shim.expect(HEX_C).toBe(HEX_C);
    });
    expect(out).toEqual({ moved: [{ where: "", pinned: HEX_A, now: HEX_B }] });
    expect(reached).toBe(true);
  });

  it("a moved row in a pinned table is named by its first column, a labelled one by its label", async () => {
    const table = await run(() => {
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
    expect(table.moved).toEqual([{ where: "[frames][1]", pinned: HEX_A, now: HEX_B }]);
    const labelled = await run(() => shim.expect(HEX_B, "wc").toBe(HEX_A));
    expect(labelled.moved).toEqual([{ where: "(wc)", pinned: HEX_A, now: HEX_B }]);
  });

  it("a row moved before a later failure in the same test is kept, with the failure", async () => {
    const out = await run(() => {
      shim.expect(HEX_B).toBe(HEX_A);
      shim.expect("x").toBe("y");
    });
    expect(out.moved).toEqual([{ where: "", pinned: HEX_A, now: HEX_B }]);
    expect(String(out.error)).toMatch(/expected "x" to be "y"/);
  });

  it("two measured digests that differ fail as a law, never as a moved pin", async () => {
    const out = await run(() => shim.expect(HEX_B).toBe(HEX_C));
    expect(out.moved).toEqual([]);
    expect(String(out.error)).toMatch(/law failed: two measured digests differ/);
  });

  it("a non-digest failure throws, and so does a pin measured as something other than a string", async () => {
    expect(String((await run(() => shim.expect(undefined).toBe(HEX_A))).error)).toMatch(/to be/);
    const mixed = await run(() => shim.expect([["frames", HEX_B], 1]).toEqual([["frames", HEX_A], 2]));
    expect(mixed.error).toBeDefined();
    expect(mixed.moved).toEqual([]);
  });

  it("a negated matcher never records a row", async () => {
    const out = await run(() => shim.expect(HEX_A).not.toBe(HEX_A));
    expect(out.moved).toEqual([]);
    expect(String(out.error)).toMatch(/not to be/);
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

describe("digest:preview end to end on a synthetic tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "digest-preview-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const zero = "0".repeat(64);
  const okHex = createHash("sha256").update("ok").digest("hex");
  mkdirSync(join(dir, "test"));
  // An ES-module package, as the repository is: without it tsx compiles the files as CommonJS, whose
  // `require("vitest")` never meets the preview's resolve hook.
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  const head = `import { createHash } from "node:crypto";\nimport { describe, expect, it } from "vitest";\nconst sha = (s: string) => createHash("sha256").update(s).digest("hex");\n`;
  writeFileSync(
    join(dir, "test", "law.test.ts"),
    `${head}const PIN = "${zero}";\nconst OK = "${okHex}";\ndescribe("law", () => {\n` +
      `  it("moved", () => { expect(sha("x")).toBe(PIN); });\n` +
      `  it("unchanged", () => { expect(sha("ok")).toBe(OK); });\n` +
      `  it.skip("skipped", () => { expect(sha("z")).toBe(PIN); });\n` +
      `  it("lost", () => { expect(sha("y")).toBe(PIN); expect("a").toBe("b"); });\n` +
      `  it("relation", () => { expect(sha("p")).toBe(sha("q")); });\n});\n`,
  );
  writeFileSync(
    join(dir, "test", "empty.test.ts"),
    `${head}void sha;\nconst PIN = "${zero}";\nvoid PIN;\ndescribe("none", () => {});\n`,
  );
  writeFileSync(
    join(dir, "test", "async.test.ts"),
    `${head}const PIN = "${zero}";\ndescribe("later", async () => {\n  await Promise.resolve();\n  it("never collected", () => { expect(sha("x")).toBe(PIN); });\n});\n`,
  );
  writeFileSync(
    join(dir, "test", "clean.test.ts"),
    `${head}const OK = "${okHex}";\ndescribe("c", () => { it("ok", () => { expect(sha("ok")).toBe(OK); }); });\n`,
  );

  /** The runner on the synthetic tree, as a process: its exit code and the JSON report, when there is one. */
  const preview = (...args: string[]) => {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", join(ROOT, "scripts", "digest-preview.ts"), "--root", dir, "--json", ...args],
      { cwd: ROOT, encoding: "utf8" },
    );
    const last = r.stdout.trim().split("\n").at(-1) ?? "";
    return { status: r.status, report: last.startsWith("{") ? JSON.parse(last) : undefined, stderr: r.stderr };
  };

  it("lists the moved rows, keeps one before a later failure, says a law failed, counts the skip; exit 1", () => {
    const { status, report } = preview("--only", "law");
    expect(status).toBe(1);
    expect(report.files).toBe(1);
    expect(report.tests).toBe(4);
    expect(report.skipped).toBe(1);
    expect(report.moved.map((m: { test: string; pinned: string }) => [m.test, m.pinned])).toEqual([
      ["law > moved", zero],
      ["law > lost", zero],
    ]);
    expect(report.moved[0].now).toBe(createHash("sha256").update("x").digest("hex"));
    expect(report.failed.map((f: { test: string }) => f.test)).toEqual(["law > lost", "law > relation"]);
    expect(report.failed[1].message).toMatch(/law failed/);
  }, 60_000);

  it("a clean tree is exit 0", () => {
    const { status, report } = preview("--only", "clean");
    expect(status).toBe(0);
    expect(report.moved).toEqual([]);
    expect(report.tests).toBe(1);
  }, 60_000);

  it("zero work is exit 2: no file matches, a file registers no test, an async describe body", () => {
    const none = preview("--only", "no-such-file");
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/no digest test file matches/);
    const { status, report } = preview("--only", "empty", "--only", "async");
    expect(status).toBe(2);
    expect(report.unloadable.map((u: { file: string; message: string }) => [u.file, u.message.split(":")[0]])).toEqual([
      ["test/async.test.ts", "an async describe body the stand-in cannot await"],
      ["test/empty.test.ts", "registered no test"],
    ]);
  }, 60_000);
});
