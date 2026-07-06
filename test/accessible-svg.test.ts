import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe as vitestDescribe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { describe } from "../src/describe.js";

/**
 * `accessible` — opt-in <title>/<desc>/role/aria SVG metadata (ADR 0007 pattern,
 * borrowing Mermaid's accessibility lesson).
 *
 * The contract: the feature is PURELY ADDITIVE. With the flag off, output is
 * byte-identical to before (no <title>/<desc>/role) — shipped SVGs stay clean.
 * With it on, the SVG carries a <title> (plan name), a <desc> (the deterministic
 * describe() caption), role="img", and aria-labelledby wiring them.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

const SRC = `plan "T" {
  units mm
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r1 at (0,0) size 4000x3000 label "Room"
  door at (2000,0) width 900
}`;

vitestDescribe("accessible (opt-in <title>/<desc>/aria)", () => {
  it("default output carries no accessibility metadata (byte-identical)", () => {
    const plain = compile(SRC, { noCache: true });
    // The feature existing must not change the default: no opts === empty opts.
    expect(compile(SRC, { noCache: true }).svg).toBe(compile(SRC, {}).svg);
    expect(plain.svg).not.toContain("<title");
    expect(plain.svg).not.toContain("<desc");
    expect(plain.svg).not.toContain('role="img"');
    expect(plain.svg).not.toContain("aria-labelledby");
  });

  it("accessible:true emits <title>, <desc>, role and aria-labelledby", () => {
    const { svg } = compile(SRC, { accessible: true, noCache: true });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-labelledby="arch-title arch-desc"');
    expect(svg).toContain('<title id="arch-title">T</title>');
    expect(svg).toContain('<desc id="arch-desc">');
  });

  it("the <desc> text is exactly describe().caption (xml-escaped for the SVG)", () => {
    const { svg } = compile(SRC, { accessible: true, noCache: true });
    const caption = describe(SRC).caption;
    expect(caption).not.toBe("");
    // The backend xml-escapes on emit; the <desc> content decodes back to the caption.
    const escaped = caption.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    expect(svg).toContain(`<desc id="arch-desc">${escaped}</desc>`);
  });

  it("is purely additive — the drawing body is unchanged from the default", () => {
    const plain = compile(SRC, { noCache: true }).svg;
    const acc = compile(SRC, { accessible: true, noCache: true }).svg;
    // Strip the injected metadata from the opening tag + the title/desc lines.
    const stripped = acc
      .replace(' role="img" aria-labelledby="arch-title arch-desc"', "")
      .replace(/<title id="arch-title">[^<]*<\/title>\n/, "")
      .replace(/<desc id="arch-desc">[^<]*<\/desc>\n/, "");
    expect(stripped).toBe(plain);
  });

  it("accessible output is deterministic", () => {
    const a = compile(SRC, { accessible: true, noCache: true }).svg;
    const b = compile(SRC, { accessible: true, noCache: true }).svg;
    expect(a).toBe(b);
  });

  it("caption is a sensible sentence composed from describe() facts", () => {
    const s = describe(SRC);
    expect(s.caption).toBe(
      `"T" — a 1-room floor plan, 12 m² total: Room (12 m²); 1 door, entrance via ${s.doors[0]!.id}.`,
    );
  });

  it("composes with annotate (both features present)", () => {
    const { svg } = compile(SRC, { accessible: true, annotate: true, noCache: true });
    expect(svg).toContain('<desc id="arch-desc">');
    expect(svg).toContain('role="img"');
    expect(svg).toContain("data-span=");
  });

  it("xml-escapes plan name and caption", () => {
    const src = `plan "A & <B>" {
  units mm
  room id=r1 at (0,0) size 4000x3000 label "R & <D>"
}`;
    const { svg } = compile(src, { accessible: true, noCache: true });
    expect(svg).toContain('<title id="arch-title">A &amp; &lt;B&gt;</title>');
    expect(svg).toContain("R &amp; &lt;D&gt;");
    expect(svg).not.toContain("<B>");
  });

  it("renders studio.arch accessibly and deterministically (golden)", () => {
    const { svg, errors } = compile(example("studio.arch"), { accessible: true, noCache: true });
    expect(errors).toEqual([]);
    expect(svg).toMatchSnapshot();
  });
});
