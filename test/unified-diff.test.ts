import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../src/index.js";
import { unifiedDiff as datasetUnifiedDiff } from "../dataset/diff.js";

/**
 * `unifiedDiff` moved from `dataset/diff.ts` into the pure core (`src/unified-diff.ts`)
 * so `arch fix`'s preview and the dataset generator's trajectories share one
 * implementation. These pin the behavior the move must preserve — and that the dataset
 * layer still reaches it through the same import path (now a re-export of the core).
 */

describe("unifiedDiff", () => {
  it("dataset/diff.ts re-exports the very same core function", () => {
    expect(datasetUnifiedDiff).toBe(unifiedDiff);
  });

  it("identical text produces an empty diff", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n")).toBe("");
  });

  it("emits standard headers, an @@ hunk, and -/+ lines", () => {
    const a = "one\ntwo\nthree\n";
    const b = "one\nTWO\nthree\n";
    const d = unifiedDiff(a, b, "a/x.arch", "b/x.arch");
    expect(d.split("\n")[0]).toBe("--- a/x.arch");
    expect(d.split("\n")[1]).toBe("+++ b/x.arch");
    expect(d).toContain("@@ -1,3 +1,3 @@");
    expect(d).toContain("-two");
    expect(d).toContain("+TWO");
    expect(d).toContain(" one");
    expect(d.endsWith("\n")).toBe(true);
  });

  it("is deterministic and pure (same inputs → byte-identical output)", () => {
    const a = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n";
    const b = "1\n2\nX\n4\n5\n6\n7\n8\n9\nY\n";
    expect(unifiedDiff(a, b)).toBe(unifiedDiff(a, b));
  });

  it("splits distant changes into separate hunks", () => {
    const a = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n";
    const b = a.replace("line 2", "line TWO").replace("line 27", "line TWENTYSEVEN");
    const d = unifiedDiff(a, b);
    expect(d.match(/^@@ /gm)).toHaveLength(2);
  });
});
