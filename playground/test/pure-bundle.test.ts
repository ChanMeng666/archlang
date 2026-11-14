import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `pure()` through the playground's own bundler (card RM0.7e). `test/pure-guard.test.ts` checks the
 * marks in the source; this checks what they DO. It bundles a synthetic two-module graph with the
 * real `src/pure.ts` (read, never retyped) and rolldown, the bundler behind the playground's Vite:
 *
 *  - `lib.ts` exports `big = /* @__PURE__ *\/ pure(() => ["SENTINEL_X"].filter(k).map(g))`, a call
 *    chain a bundler cannot prove effect-free, and a small export;
 *  - the entry imports only the small export, lazily, so `lib.ts` is a chunk of its own and `pure`
 *    is declared in another (and, in the second case, pinned to a chunk of its own).
 *
 * With the marks, `SENTINEL_X` is in no chunk; with both marks stripped it is, which is what proves
 * the sentinel could be kept and that the marks (not the bundler's own analysis) drop it. The red
 * half lives inside the test, so a toolchain that stops honouring the marks fails here, in CI's
 * ordinary vitest run (no build of the playground is needed).
 *
 * Measured at rolldown 1.2.15: stripping ONE mark still drops the value in this graph, so only the
 * pair is asserted; that either alone suffices here is not a promise (RM0.7f saw a call kept in a
 * lazy chunk when only the declaration was marked), which is why `test/pure-guard.test.ts` pins both.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PURE_SRC = readFileSync(join(HERE, "..", "..", "src", "pure.ts"), "utf8");
const DECL_MARK = "/* @__NO_SIDE_EFFECTS__ */ ";
const CALL_MARK = "/* @__PURE__ */ ";

// rolldown is the playground's bundler (Vite 8); under CI a missing one is a failure, never a skip.
type Rolldown = typeof import("rolldown");
async function load(skip: () => void): Promise<Rolldown> {
  try {
    return await import("rolldown");
  } catch (e) {
    if (process.env.CI) throw e;
    skip();
    throw e;
  }
}

async function bundle(
  { rolldown }: Rolldown,
  marks: { decl: boolean; call: boolean },
  pinPureChunk: boolean,
): Promise<string> {
  expect(PURE_SRC, "src/pure.ts carries the declaration mark this test strips").toContain(DECL_MARK);
  const dir = mkdtempSync(join(tmpdir(), "pure-bundle-"));
  writeFileSync(join(dir, "pure.ts"), marks.decl ? PURE_SRC : PURE_SRC.replace(DECL_MARK, ""));
  writeFileSync(
    join(dir, "lib.ts"),
    [
      `import { pure } from "./pure.ts";`,
      `const keep = (globalThis as { keep?: (s: string) => boolean }).keep as (s: string) => boolean;`,
      `export const big = ${marks.call ? CALL_MARK : ""}pure(() => ["SENTINEL_X"].filter(keep).map((s) => s + keep));`,
      `export const small = 1;`,
      ``,
    ].join("\n"),
  );
  // The entry uses `pure` itself, so the declaration is shared by two chunks.
  writeFileSync(
    join(dir, "entry.ts"),
    [
      `import { pure } from "./pure.ts";`,
      `export const used = ${CALL_MARK}pure(() => [1, 2].map((n) => n * 2));`,
      `import("./lib.ts").then((m) => console.log(m.small));`,
      ``,
    ].join("\n"),
  );
  const build = await rolldown({ input: { entry: join(dir, "entry.ts") }, logLevel: "silent" });
  const { output } = await build.generate({
    format: "esm",
    minify: true,
    ...(pinPureChunk
      ? {
          codeSplitting: {
            groups: [{ name: "pure-decl", test: (id: string) => id.replace(/\\/g, "/").endsWith("/pure.ts") }],
          },
        }
      : {}),
  });
  await build.close();
  return output.map((o) => (o.type === "chunk" ? o.code : "")).join("\n");
}

describe("pure() through rolldown (card RM0.7e)", () => {
  for (const pin of [false, true]) {
    describe(pin ? "declaration pinned to its own chunk" : "default chunks", () => {
      it("with both marks, the value nobody reads is in no chunk", async (ctx) => {
        const text = await bundle(await load(() => ctx.skip()), { decl: true, call: true }, pin);
        expect(text).not.toContain("SENTINEL_X");
      });
      it("with both marks stripped, the same value is kept (the sentinel can be kept)", async (ctx) => {
        const text = await bundle(await load(() => ctx.skip()), { decl: false, call: false }, pin);
        expect(text).toContain("SENTINEL_X");
      });
    });
  }
});
