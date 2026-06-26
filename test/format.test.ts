/**
 * T5.2 — `arch fmt` formatter.
 *
 * The formatter must be deterministic, idempotent, comment-preserving, and
 * semantics-preserving (formatting then compiling yields byte-identical output),
 * and it must wrap long point lists. It must never corrupt broken input.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile, format } from "../src/index.js";

const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));
const LIBS = readdirSync("examples/lib").filter((f) => f.endsWith(".arch")).map((f) => `lib/${f}`);
const ALL = [...EXAMPLES, ...LIBS.map((f) => f.replace("lib/", ""))];
const readExample = (name: string): string =>
  readFileSync(EXAMPLES.includes(name) ? `examples/${name}` : `examples/lib/${name}`, "utf8");

describe("T5.2 — formatter is idempotent", () => {
  for (const name of ALL) {
    it(`format(format(${name})) === format(${name})`, () => {
      const once = format(readExample(name));
      const twice = format(once);
      expect(twice).toBe(once);
    });
  }
});

describe("T5.2 — formatter preserves comments", () => {
  for (const name of ALL) {
    it(`every comment in ${name} survives`, () => {
      const src = readExample(name);
      const out = format(src);
      // Each `#…` comment line in the source must appear in the output.
      const comments = src.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("#"));
      for (const c of comments) {
        const text = c.replace(/\r$/, "");
        expect(out).toContain(text);
      }
    });
  }
});

describe("T5.2 — formatter preserves semantics (format then compile)", () => {
  // A filesystem World so examples using `import` (resolved relative to the file)
  // render — paths like "lib/furniture.arch" sit under examples/.
  const world = {
    read: (p: string): string | null => {
      try {
        return readFileSync(`examples/${p}`, "utf8");
      } catch {
        return null;
      }
    },
  };
  for (const name of EXAMPLES) {
    it(`compile(${name}) === compile(format(${name}))`, () => {
      const src = readExample(name);
      const a = compile(src, { noCache: true, world }).svg;
      const b = compile(format(src), { noCache: true, world }).svg;
      expect(b).toBe(a);
      expect(a.length).toBeGreaterThan(0);
    });
  }
});

describe("T5.2 — formatter is deterministic", () => {
  it("format(x) === format(x)", () => {
    const src = readExample("studio.arch");
    expect(format(src)).toBe(format(src));
  });
});

describe("T5.2 — long point lists wrap cleanly", () => {
  it("a wall that exceeds the print width breaks one point per line", () => {
    const pts = Array.from({ length: 16 }, (_, i) => `(${i * 1000}, ${i * 500})`).join(" ");
    const src = `plan "Wrap" {\n  wall exterior thickness 200 { ${pts} close }\n}\n`;
    const out = format(src);
    // The wall body must be multi-line, with `close` on its own line.
    expect(out).toMatch(/wall exterior thickness 200 \{\n/);
    expect(out).toMatch(/\n {4}close\n/);
    // And it must still round-trip.
    expect(format(out)).toBe(out);
    expect(compile(out, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
  });

  it("a short wall stays on one line", () => {
    const src = 'plan "S" {\n  wall exterior thickness 200 { (0,0) (1000,0) close }\n}\n';
    const out = format(src);
    expect(out).toContain("{ (0, 0) (1000, 0) close }");
  });
});

describe("T5.2 — formatter never corrupts broken input", () => {
  it("returns source unchanged when it does not parse", () => {
    const broken = 'plan "B" {\n  room at (0,0) size\n  totally not valid !!!\n}\n';
    expect(format(broken)).toBe(broken);
  });
});
