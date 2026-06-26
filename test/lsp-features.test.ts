/**
 * T5.3 — full LSP feature core (pure functions over source + offset).
 *
 * Exercises hover, completion, go-to-definition, rename, and signature help on a
 * controlled source that uses values, a function, a component, params, and
 * element keywords.
 */

import { describe, expect, it } from "vitest";
import { completion, definition, hover, rename, signatureHelp } from "../src/index.js";

const SRC = [
  'plan "T" {',
  "  units mm",
  "  let W = 4000",
  "  let aream2(w, h) = w * h",
  "  component bed(x, y) {",
  "    furniture bed at (x, y) size 1500x2000",
  "  }",
  "  wall exterior thickness 200 { (0, 0) (W, 0) (W, 4000) close }",
  '  room at (0, 0) size W x 3000 label "Room"',
  "  let area = aream2(W, 3000)",
  "  bed(300, 300)",
  "}",
].join("\n");

/** Offset just inside the first occurrence of `needle` (optionally past `plus`). */
const at = (needle: string, plus = 1): number => SRC.indexOf(needle) + plus;

describe("T5.3 — hover", () => {
  it("shows an element signature + docs for a keyword", () => {
    const h = hover(SRC, at("room at"));
    expect(h).not.toBeNull();
    expect(h!.contents).toContain("room");
    expect(h!.contents).toContain("size WxH");
    expect(h!.contents.toLowerCase()).toContain("filled rectangle");
  });

  it("shows the definition of an in-scope value reference", () => {
    const h = hover(SRC, at("(W, 0)") + 1); // the `W` inside the wall
    expect(h!.contents).toContain("let W");
  });

  it("shows a function's signature on its name", () => {
    const h = hover(SRC, at("aream2(w"));
    expect(h!.contents).toContain("aream2(w, h)");
  });

  it("shows a parameter binding inside a component body", () => {
    // the `x` in `furniture bed at (x, y)`
    const h = hover(SRC, SRC.indexOf("at (x, y)") + 4);
    expect(h!.contents).toContain("parameter x of bed");
  });
});

describe("T5.3 — completion", () => {
  it("offers element keywords, control keywords, and in-scope bindings", () => {
    const items = completion(SRC, at("bed(300")); // plan scope
    const labels = items.map((i) => i.label);
    expect(labels).toContain("room");
    expect(labels).toContain("wall");
    expect(labels).toContain("for");
    expect(labels).toContain("W");
    expect(labels).toContain("aream2");
    expect(labels).toContain("bed");
  });

  it("does not leak component params into plan scope", () => {
    const labels = completion(SRC, at("bed(300")).map((i) => i.label);
    expect(labels).not.toContain("x"); // `x` is a param local to `component bed`
  });
});

describe("T5.3 — go to definition", () => {
  it("jumps from a reference to its `let`", () => {
    const def = definition(SRC, at("(W, 0)") + 1);
    expect(def).not.toBeNull();
    expect(SRC.slice(def!.start, def!.end)).toBe("W");
    // The definition is the `W` in `let W = 4000`, not a later use.
    expect(def!.start).toBe(SRC.indexOf("let W = ") + 4);
  });
});

describe("T5.3 — rename", () => {
  it("renames a global binding at every use, scoped correctly", () => {
    const edits = rename(SRC, at("let W = ") + 4, "WIDTH");
    expect(edits).not.toBeNull();
    // def + (W,0) + (W,4000) + `size W` + the W in `aream2(W, 3000)`
    expect(edits!.length).toBe(5);
    for (const e of edits!) expect(SRC.slice(e.span.start, e.span.end)).toBe("W");
    for (const e of edits!) expect(e.newText).toBe("WIDTH");
  });

  it("renames a component parameter only within its component", () => {
    const edits = rename(SRC, SRC.indexOf("bed(x, y)") + 4, "px"); // the param `x`
    expect(edits).not.toBeNull();
    // the param decl + its single use `(x, y)` — nothing outside the component
    expect(edits!.length).toBe(2);
    for (const e of edits!) expect(e.span.start).toBeGreaterThan(SRC.indexOf("component bed"));
    for (const e of edits!) expect(e.span.end).toBeLessThan(SRC.indexOf("wall exterior"));
  });
});

describe("T5.3 — signature help", () => {
  it("describes a component call and tracks the active argument", () => {
    const sig0 = signatureHelp(SRC, SRC.indexOf("bed(300") + 4);
    expect(sig0!.label).toContain("bed(x, y)");
    expect(sig0!.params).toEqual(["x", "y"]);
    expect(sig0!.activeParameter).toBe(0);
    const sig1 = signatureHelp(SRC, SRC.indexOf("bed(300, 300") + 9); // after the comma
    expect(sig1!.activeParameter).toBe(1);
  });

  it("describes a value-function call", () => {
    const sig = signatureHelp(SRC, SRC.indexOf("= aream2(W, 3000") + 9);
    expect(sig).not.toBeNull();
    expect(sig!.params).toEqual(["w", "h"]);
  });
});
