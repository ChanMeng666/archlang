/**
 * Download GLB (public-surfaces card X5) writes the file `archlang3d build plan.arch -o plan.glb`
 * writes: the page's own path (`plan3d.ts`: the adapter with no options, the whole-plan Mesh3D;
 * `glb-export.ts`: the package's writer) against the CLI's `build`, run in this process on the same
 * example file, byte for byte, for every example the page builds. That is the claim the button's
 * note makes ("writes the same file"), and the plans it covers are the ones the page offers a GLB
 * for: one the page refuses (an `import`, which only the CLI's file-system World resolves) shows no
 * button. laneway-house is also held to the package's own GLB pin.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile } from "archlang";
import { afterAll, describe, expect, it } from "vitest";
import { writeGlb } from "../../packages/archlang-3d/src/glb/write.js";
import { HANDLERS, parseFlags } from "../../packages/archlang-3d/src/cli/commands.js";
import { LANEWAY_GLB_SHA256, PIN_GENERATOR } from "../../packages/archlang-3d/test/pins.js";
import { glbBytes } from "../src/glb-export.js";
import { adapt3d, mesh3d } from "../src/plan3d.js";

const EXAMPLES = join(process.cwd(), "examples");
const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const OUT = mkdtempSync(join(tmpdir(), "archlang-glb-"));
afterAll(() => rmSync(OUT, { recursive: true, force: true }));

/** What the page does with `source`: the GLB it offers, or null when it shows a refusal instead. */
async function pageGlb(source: string): Promise<Uint8Array | null> {
  const r = adapt3d(source);
  if (!r.ok) return null;
  // preview3d.ts refuses a plan the core does not draw before it builds anything.
  if (compile(source).errors.length > 0) return null;
  return glbBytes(mesh3d(r.scene));
}

describe("Download GLB writes the CLI's file (card X5)", () => {
  it("laneway-house, by the page's path, is the package's pinned GLB", async () => {
    const source = readFileSync(join(EXAMPLES, "laneway-house.arch"), "utf8");
    const r = adapt3d(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sha(await writeGlb(mesh3d(r.scene), { generator: PIN_GENERATOR }))).toBe(LANEWAY_GLB_SHA256);
  });

  it("every example the page builds is byte for byte the CLI build's GLB", { timeout: 300_000 }, async () => {
    const files = readdirSync(EXAMPLES)
      .filter((f) => f.endsWith(".arch"))
      .sort();
    const built: string[] = [];
    const refused: string[] = [];
    const stderr = process.stderr.write;
    for (const f of files) {
      const source = readFileSync(join(EXAMPLES, f), "utf8");
      const mine = await pageGlb(source);
      if (mine === null) {
        refused.push(f);
        continue;
      }
      const out = join(OUT, f.replace(/\.arch$/, ".glb"));
      // The CLI's own command, flags parsed as its manifest says; its one line of report is muted.
      process.stderr.write = () => true;
      let code: number;
      try {
        code = await HANDLERS.build!(parseFlags("build", [join(EXAMPLES, f), "-o", out]));
      } finally {
        process.stderr.write = stderr;
      }
      expect(code, `${f}: the CLI builds and checks it`).toBe(0);
      expect(sha(mine), `${f}: the page's GLB is the CLI's`).toBe(sha(readFileSync(out)));
      built.push(f);
    }
    expect(built).toContain("laneway-house.arch");
    expect(built).toContain("two-storey.arch");
    expect(built.length, `built ${built.length}, refused ${refused.join(", ")}`).toBeGreaterThan(20);
    // The page refuses only what it cannot resolve: a plan that imports (the CLI reads lib/ from disk).
    for (const f of refused) {
      expect(readFileSync(join(EXAMPLES, f), "utf8"), `${f} is refused by the page`).toMatch(/^\s*import\b/m);
    }
  });
});
