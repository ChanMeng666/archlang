import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile, describe as describePlan, lint } from "../src/index.js";

/**
 * `overlays: ["circulation"]` — the opt-in circulation render overlay (ADR 0008).
 *
 * The contract mirrors `annotate` (ADR 0007): the option OFF leaves the Scene IR and
 * SVG byte-identical (also guarded by the golden snapshots, which compile without it),
 * and it never affects the facts (`describe`) or lint. ON it appends the walk paths,
 * bottleneck markers and routes on the `annotations` layer, deterministically.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");
const STUDIO = example("studio.arch"); // entrance + rooms → a drawable overlay
const TWO_BED = example("two-bed.arch"); // no exterior entrance → overlay is empty

describe("circulation overlay (opt-in render)", () => {
  it("leaves default output byte-identical (off, empty, and no cross-contamination)", () => {
    for (const src of [STUDIO, TWO_BED]) {
      const plain = compile(src, { noCache: true }).svg;
      // Compiling WITH the overlay must not perturb a later default compile.
      compile(src, { noCache: true, overlays: ["circulation"] });
      expect(compile(src, { noCache: true }).svg).toBe(plain);
      // An empty overlay list is exactly the default.
      expect(compile(src, { noCache: true, overlays: [] }).svg).toBe(plain);
    }
  });

  it("appends the overlay when on (studio) and is deterministic", () => {
    const off = compile(STUDIO, { noCache: true }).svg;
    const on1 = compile(STUDIO, { noCache: true, overlays: ["circulation"] }).svg;
    const on2 = compile(STUDIO, { noCache: true, overlays: ["circulation"] }).svg;
    expect(on1).toBe(on2); // deterministic
    expect(on1).not.toBe(off); // the overlay is drawn
    expect(on1.length).toBeGreaterThan(off.length);
    // A bottleneck marker (a diamond filled with the annotation colour) is present
    // only with the overlay on, and the clear-width labels match the facts.
    const markers = (on1.match(/<polygon[^>]*fill="#333333"[^>]*stroke="none"/g) || []).length;
    expect(markers).toBe(describePlan(STUDIO).circulation?.rooms.length);
    expect(markers).toBeGreaterThan(0);
    expect((off.match(/<polygon[^>]*fill="#333333"[^>]*stroke="none"/g) || []).length).toBe(0);
  });

  it("does nothing when the plan has no modeled entrance", () => {
    // two-bed has no exterior entrance → circulation is null → the overlay is empty.
    expect(compile(TWO_BED, { noCache: true, overlays: ["circulation"] }).svg).toBe(
      compile(TWO_BED, { noCache: true }).svg,
    );
  });

  it("does not change describe() or lint()", () => {
    // The overlay is a compile-only option; the facts and lint never read it.
    const before = { d: describePlan(STUDIO), l: lint(STUDIO).map((x) => x.code) };
    compile(STUDIO, { noCache: true, overlays: ["circulation"] });
    expect(describePlan(STUDIO)).toEqual(before.d);
    expect(lint(STUDIO).map((x) => x.code)).toEqual(before.l);
  });
});
