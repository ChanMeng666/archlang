import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

/**
 * `annotate` — opt-in `data-span` stamping on drawn primitives (ADR 0007).
 *
 * The contract: annotation is PURELY ADDITIVE. Turning it on must add nothing but
 * `data-span="start:end"` attributes — so shipped (un-annotated) SVGs stay
 * byte-identical (guarded here by stripping the attributes and comparing to the
 * default output, on top of the golden snapshots in snapshot.test.ts which compile
 * without the flag).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

const SRC = `plan "T" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room"
  door at (2000,0) width 900
}`;

describe("annotate (opt-in data-span)", () => {
  it("default output carries no data-span", () => {
    const { svg } = compile(SRC, { noCache: true });
    expect(svg).not.toContain("data-span");
  });

  it("is purely additive — stripping data-span yields the default output", () => {
    const plain = compile(SRC, { noCache: true }).svg;
    const annotated = compile(SRC, { annotate: true, noCache: true }).svg;
    expect(annotated).toContain('data-span="');
    const stripped = annotated.replace(/ data-span="\d+:\d+"/g, "");
    expect(stripped).toBe(plain);
  });

  it("spans point at the source that produced each primitive", () => {
    const { svg } = compile(SRC, { annotate: true, noCache: true });
    const spans = [...svg.matchAll(/data-span="(\d+):(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(spans.length).toBeGreaterThan(0);
    // Every span is a valid half-open range within the source.
    for (const [s, e] of spans) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(e).toBeGreaterThan(s);
      expect(e).toBeLessThanOrEqual(SRC.length);
    }
    // At least one primitive maps back to the `room` and one to the `door`
    // (walls are unioned across statements, so they are intentionally unstamped).
    const texts = spans.map(([s, e]) => SRC.slice(s, e));
    expect(texts.some((t) => t.startsWith("room"))).toBe(true);
    expect(texts.some((t) => t.startsWith("door"))).toBe(true);
  });

  it("annotated output is deterministic", () => {
    const a = compile(SRC, { annotate: true, noCache: true }).svg;
    const b = compile(SRC, { annotate: true, noCache: true }).svg;
    expect(a).toBe(b);
  });

  it("renders studio.arch annotated deterministically (golden)", () => {
    const { svg, errors } = compile(example("studio.arch"), { annotate: true, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toMatchSnapshot();
  });
});
