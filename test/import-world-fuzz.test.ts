import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { makeNodeWorld } from "../src/cli/io.js";
import { runs } from "./setup/fast-check.js";

/**
 * S-FZ-2: hostile `import` specs against the CLI's file-system World (EH1.12, EH-D7).
 *
 * A Node World rooted in a tmp dir, with a canary `.arch` file OUTSIDE the root and a library
 * inside it. Seeded fast-check drives specs built from `..`, `/`, `\`, drive letters, `%2e`,
 * NUL, `@local/…` and very long segments through both `world.read` and `compile()`: neither
 * throws, the canary's content never comes back, and a read that succeeds returned a file under
 * the root (only the library is there to return).
 */

const CANARY = "CANARY_c4n4ry_91";
const LIB = 'plan "lib" {\n  component box(x, y) { room at (x, y) size 1000x1000 }\n}\n';
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "arch-import-fuzz-")));
const ROOT = join(TMP, "root");
mkdirSync(join(ROOT, "plans"), { recursive: true });
mkdirSync(join(ROOT, "lib"), { recursive: true });
writeFileSync(join(ROOT, "lib", "box.arch"), LIB);
writeFileSync(join(TMP, "canary.arch"), `${CANARY}\n`);
writeFileSync(join(TMP, "canary.txt"), `${CANARY}\n`);
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

const TMP_FWD = TMP.replace(/\\/g, "/");
const SEGMENTS = [
  "..",
  ".",
  "",
  "%2e%2e",
  "%2e",
  "..%2f",
  "..\\..",
  "\\",
  "C:",
  "c:",
  "D:\\",
  "\\\\?\\C:",
  "//server/share",
  "\u0000",
  "..\u0000",
  "lib",
  "box.arch",
  "canary.arch",
  "canary.txt",
  "canary.ARCH",
  "root",
  "plans",
  "@local",
  "x".repeat(300),
  TMP_FWD,
  TMP,
];
const spec = fc.oneof(
  fc
    .array(fc.constantFrom(...SEGMENTS), { minLength: 1, maxLength: 8 })
    .chain((segs) => fc.constantFrom("/", "\\").map((sep) => segs.join(sep))),
  fc.string({ maxLength: 64 }),
  fc.constantFrom(
    `${TMP_FWD}/canary.arch`,
    `${TMP}\\canary.arch`,
    "../../canary.arch",
    "..\\..\\canary.arch",
    "/canary.arch",
  ),
);

const world = makeNodeWorld(join(ROOT, "plans"), ROOT);

describe("S-FZ-2 — hostile import specs against a rooted Node World", () => {
  it("world.read never throws and never returns the canary", () => {
    fc.assert(
      fc.property(spec, (s) => {
        const got = world.read(s);
        if (got !== null) {
          expect(got).not.toContain(CANARY);
          expect(got).toBe(LIB);
        }
        const why = world.refusal?.(s);
        if (why) expect(why.code).toMatch(/^E_IMPORT_(OUTSIDE_ROOT|NOT_ARCH|TOO_LARGE)$/);
      }),
      { seed: 20261109, numRuns: runs(400) },
    );
  });

  it("compile() with the spec as an import never throws and never quotes the canary", () => {
    fc.assert(
      fc.property(spec, (s) => {
        const lit = JSON.stringify(s).slice(1, -1);
        const src = `plan "P" {\n  import "${lit}" as m\n  room at (0,0) size 3000x3000\n}\n`;
        const out = compile(src, { world, noCache: true });
        expect(JSON.stringify(out.diagnostics)).not.toContain(CANARY);
        expect(out.svg).not.toContain(CANARY);
      }),
      { seed: 20261109, numRuns: runs(150) },
    );
  });
});
