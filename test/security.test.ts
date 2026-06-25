import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const studio = readFileSync(join(__dirname, "..", "examples", "studio.arch"), "utf8");

const wallPlan = (extra = "") =>
  `plan "T" { ${extra} wall w thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close } }`;

describe("SVG output is XSS-safe", () => {
  it("never emits <script>, <foreignObject>, or event-handler attributes (studio)", () => {
    const { svg } = compile(studio, { noCache: true });
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<foreignObject");
    expect(svg).not.toMatch(/\son[a-z]+=/i); // onload=, onclick=, …
  });

  it("escapes user labels (no markup breakout from text content)", () => {
    const src = `plan "X" { room id=r at (0,0) size 1000x1000 label "<script>alert(1)</script>" }`;
    const { svg } = compile(src, { noCache: true });
    expect(svg).not.toContain("<script>alert(1)");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("sanitizes a malicious theme color from the `theme` directive (attribute breakout)", () => {
    const { svg } = compile(wallPlan(`theme { wall: "#fff\\" onload=\\"alert(1)" }`), { noCache: true });
    expect(svg).not.toContain('#fff" onload'); // raw quote breakout absent
    expect(svg).not.toMatch(/\bonload="/); // no real onload attribute
    expect(svg).toContain("&quot;"); // the injected quote was escaped
  });

  it("sanitizes a malicious theme value from CompileOptions.theme", () => {
    const { svg } = compile(wallPlan(), {
      noCache: true,
      theme: { wallStroke: '#fff" onload="alert(1)' },
    });
    expect(svg).not.toContain('#fff" onload');
    expect(svg).not.toMatch(/\bonload="/);
    expect(svg).toContain("&quot;");
  });

  it("leaves well-formed theme colors byte-for-byte unchanged (sanitization is identity)", () => {
    const { svg } = compile(wallPlan(`theme { wall: "#ff0000" }`), { noCache: true });
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).not.toContain("&quot;");
  });

  it("stays deterministic with a hostile theme", () => {
    const opts = { noCache: true, theme: { wallStroke: '#000" onload="x' } };
    expect(compile(wallPlan(), opts).svg).toBe(compile(wallPlan(), opts).svg);
  });
});
