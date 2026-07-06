import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, format } from "../src/index.js";
import { describe as describePlan } from "../src/describe.js";

/**
 * T4.1b — the plan-level `accTitle` / `accDescr` keywords.
 *
 * These supply EXPLICIT accessibility metadata that overrides the T4.1a-derived
 * pair in accessible-SVG output: `accTitle` replaces the plan name in `<title>`,
 * `accDescr` replaces the derived describe() caption in `<desc>`. They are the
 * project's one language-surface change here, so the guarantees are strict:
 * default (non-accessible) output stays byte-identical, and with neither keyword
 * present the behavior is exactly T4.1a's.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

const BASE = `plan "T" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room"
  door at (2000,0) width 900
}`;

const WITH = `plan "T" {
  units mm
  accTitle "Explicit accessible title"
  accDescr "Explicit accessible description."
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room"
  door at (2000,0) width 900
}`;

describe("T4.1b — parsing accTitle/accDescr", () => {
  it("accepts both at plan level with no diagnostics", () => {
    const { diagnostics } = compile(WITH, { noCache: true });
    expect(diagnostics).toEqual([]);
  });

  it("requires a string argument", () => {
    const { diagnostics } = compile(`plan "T" { units mm accTitle 42 }`, { noCache: true });
    expect(diagnostics.some((d) => d.severity === "error")).toBe(true);
  });

  it("flags a duplicate with W_DUP_ACC_METADATA (last wins)", () => {
    const src = `plan "T" {
  units mm
  accTitle "first"
  accTitle "second"
  room at (0,0) size 1000x1000
}`;
    const { diagnostics } = compile(src, { noCache: true });
    const dup = diagnostics.find((d) => d.code === "W_DUP_ACC_METADATA");
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe("warning");
    // Last value wins → the accessible <title> shows "second".
    const { svg } = compile(src, { accessible: true, noCache: true });
    expect(svg).toContain('<title id="arch-title">second</title>');
  });

  it("rejects accTitle/accDescr outside plan level with E_ACC_PLACEMENT", () => {
    const src = `plan "T" {
  units mm
  component c() { accDescr "nope" }
  room at (0,0) size 1000x1000
}`;
    const { diagnostics } = compile(src, { noCache: true });
    const err = diagnostics.find((d) => d.code === "E_ACC_PLACEMENT");
    expect(err).toBeDefined();
    expect(err!.severity).toBe("error");
  });
});

describe("T4.1b — accessible override", () => {
  it("uses the explicit values in <title>/<desc> under accessible:true", () => {
    const { svg } = compile(WITH, { accessible: true, noCache: true });
    expect(svg).toContain('<title id="arch-title">Explicit accessible title</title>');
    expect(svg).toContain('<desc id="arch-desc">Explicit accessible description.</desc>');
  });

  it("xml-escapes the explicit values", () => {
    const src = `plan "T" {
  units mm
  accTitle "A & <B>"
  accDescr "desc & <x>"
  room at (0,0) size 1000x1000
}`;
    const { svg } = compile(src, { accessible: true, noCache: true });
    expect(svg).toContain('<title id="arch-title">A &amp; &lt;B&gt;</title>');
    expect(svg).toContain('<desc id="arch-desc">desc &amp; &lt;x&gt;</desc>');
  });

  it("with NO keywords, accessible output is exactly T4.1a's derived pair", () => {
    const { svg } = compile(BASE, { accessible: true, noCache: true });
    const caption = describePlan(BASE).caption;
    expect(svg).toContain('<title id="arch-title">T</title>');
    const escaped = caption.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    expect(svg).toContain(`<desc id="arch-desc">${escaped}</desc>`);
  });

  it("accTitle overrides only the title; a missing accDescr still derives the caption", () => {
    const src = `plan "T" {
  units mm
  accTitle "Custom title"
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room"
  door at (2000,0) width 900
}`;
    const { svg } = compile(src, { accessible: true, noCache: true });
    const caption = describePlan(src).caption;
    expect(svg).toContain('<title id="arch-title">Custom title</title>');
    const escaped = caption.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    expect(svg).toContain(`<desc id="arch-desc">${escaped}</desc>`);
  });
});

describe("T4.1b — default-output invariant", () => {
  it("default compile of a source WITH keywords emits no accessibility metadata", () => {
    const { svg } = compile(WITH, { noCache: true });
    expect(svg).not.toContain("<title");
    expect(svg).not.toContain("<desc");
    expect(svg).not.toContain('role="img"');
    expect(svg).not.toContain("aria-labelledby");
  });

  it("the keywords do not change the default SVG (byte-identical to the source without them)", () => {
    // WITH minus the two accTitle/accDescr lines is exactly BASE, so their default
    // renders must be identical — the statements carry no geometry.
    expect(compile(WITH, { noCache: true }).svg).toBe(compile(BASE, { noCache: true }).svg);
  });
});

describe("T4.1b — describe() surfaces the explicit values", () => {
  it("exposes accTitle/accDescr when present, and omits them otherwise", () => {
    const s = describePlan(WITH);
    expect(s.accTitle).toBe("Explicit accessible title");
    expect(s.accDescr).toBe("Explicit accessible description.");
    // The derived caption is still reported (it is a computed fact, not the override).
    expect(s.caption).not.toBe("");

    const bare = describePlan(BASE);
    expect(bare.accTitle).toBeUndefined();
    expect(bare.accDescr).toBeUndefined();
  });
});

describe("T4.1b — arch fmt", () => {
  it("preserves the keywords and is idempotent", () => {
    const once = format(WITH);
    expect(once).toContain(`accTitle "Explicit accessible title"`);
    expect(once).toContain(`accDescr "Explicit accessible description."`);
    expect(format(once)).toBe(once);
  });

  it("formats the shipped example idempotently", () => {
    const src = example("accessible.arch");
    const once = format(src);
    expect(once).toContain("accTitle ");
    expect(once).toContain("accDescr ");
    expect(format(once)).toBe(once);
  });
});

describe("T4.1b — the shipped example", () => {
  it("compiles clean and carries its explicit metadata when accessible", () => {
    const src = example("accessible.arch");
    const { svg, errors } = compile(src, { accessible: true, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toContain('<title id="arch-title">Two-room flat — accessible floor plan</title>');
    expect(svg).toContain('<desc id="arch-desc">A small flat:');
  });
});
