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
import type { Theme } from "../src/theme.js";
import { DEFAULT_THEME, resolveStyleKey, STYLE_KEYS, STYLE_KINDS, styleKeyFor } from "../src/theme.js";

const EXAMPLES = readdirSync("examples").filter((f) => f.endsWith(".arch"));
const LIBS = readdirSync("examples/lib")
  .filter((f) => f.endsWith(".arch"))
  .map((f) => `lib/${f}`);
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
      const comments = src
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith("#"));
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

  it("preserves the `dims auto` directive (header setting must not be dropped)", () => {
    for (const mode of ["overall", "rooms", "walls", "all"]) {
      const src = `plan "P" { units mm dims auto ${mode} wall exterior thickness 200 { (0,0) (3000,0) (3000,3000) (0,3000) close } room id=r at (0,0) size 3000x3000 label "R" }`;
      const out = format(src);
      expect(out).toContain(`dims auto ${mode}`);
      expect(format(out)).toBe(out); // idempotent
    }
  });
});

describe("`style <kind> { … }` round-trips through the formatter", () => {
  // `plan.styles` stores CANONICAL Theme keys; the grammar only accepts the FRIENDLY
  // attribute. The formatter therefore has to invert the mapping, and until v1.26.x it did
  // not — it printed `wallStroke:` where the author wrote `stroke:`, so the SECOND format
  // emitted an empty block and the plan lost its colours. Both directions of the law are
  // asserted below, over STYLE_KEYS itself rather than a retyped copy, so a new kind or
  // attribute is covered the moment it is added to the table.

  /** A minimal plan carrying one `style <kind> { <attr>: <colour> }` block. */
  const planWith = (kind: string, attr: string, colour: string): string =>
    `plan "S" {\n  style ${kind} { ${attr}: "${colour}" }\n` +
    "  wall id=w exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n" +
    '  room id=r at (0,0) size 4000x3000 label "R"\n' +
    "  door id=d on w at 50% width 900\n" +
    "  window id=n on w at 20% width 1200\n" +
    "  column id=c at (2000,1500) size 300x300\n" +
    "  furniture id=f sink at (1000,1000) size 600x600\n" +
    "  stair id=s at (2500,200) size 1000x2400 dir up\n" +
    "  elevator id=e at (300,2000) size 900x900\n" +
    "  escalator id=x at (3000,200) size 900x2000 dir up\n" +
    "  dim (0,0)->(4000,0) offset 600\n" +
    "}\n";

  for (const kind of STYLE_KINDS) {
    for (const attr of Object.keys(STYLE_KEYS[kind]!)) {
      it(`style ${kind} { ${attr} } survives format and re-format`, () => {
        const src = planWith(kind, attr, "#123456");

        // 1. The source itself is clean — no W_UNKNOWN_STYLE_KEY, so the block is real.
        expect(compile(src, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("W_UNKNOWN_STYLE_KEY");

        const once = format(src);
        // 2. The printed key is a FRIENDLY one the parser accepts — never the canonical
        //    Theme key, and never an empty block.
        expect(once).toMatch(new RegExp(`style ${kind} {`));
        const printed = /^\s*(\w+): "#123456"$/m.exec(once)?.[1];
        expect(printed).toBeTruthy();
        expect(resolveStyleKey(kind, printed!)).toBe(STYLE_KEYS[kind]![attr]);

        // 3. Re-formatting is a fixpoint (the failure mode was a SECOND format emptying it).
        expect(format(once)).toBe(once);
        // 4. …and the round-tripped source still parses clean and renders identically.
        const after = compile(once, { noCache: true });
        expect(after.diagnostics.map((d) => d.code)).not.toContain("W_UNKNOWN_STYLE_KEY");
        expect(after.svg).toBe(compile(src, { noCache: true }).svg);
      });
    }
  }

  it("a style block's colour actually reaches the SVG after two formats", () => {
    // The strongest form of the bug: it was SILENT. Both the styled and unstyled plans
    // compiled clean, and only the pixels differed — so pin the ink, not just the text.
    const src = planWith("wall", "stroke", "#ff00ff");
    expect(compile(src, { noCache: true }).svg).toContain("#ff00ff");
    expect(compile(format(format(src)), { noCache: true }).svg).toContain("#ff00ff");
  });

  it("styleKeyFor is total over STYLE_KEYS and inverts resolveStyleKey", () => {
    for (const kind of STYLE_KINDS) {
      for (const [attr, themeKey] of Object.entries(STYLE_KEYS[kind]!)) {
        const back = styleKeyFor(kind, themeKey);
        // Total: every reachable Theme key has a friendly spelling for its kind…
        expect(back, `${kind}.${themeKey} has no friendly key`).not.toBeNull();
        // …and that spelling resolves to the SAME Theme key. `dim` maps two attributes
        // onto one key, so this is inversion up to equivalence, not identity of `attr`.
        expect(resolveStyleKey(kind, back!)).toBe(themeKey);
        expect(resolveStyleKey(kind, attr)).toBe(themeKey);
      }
    }
  });

  it("styleKeyFor refuses an unknown kind or an unreachable Theme key", () => {
    expect(styleKeyFor("nope", "wallStroke")).toBeNull();
    expect(styleKeyFor("constructor", "wallStroke")).toBeNull(); // prototype key
    expect(styleKeyFor("room", "wallStroke")).toBeNull(); // real key, wrong kind
    // A FRIENDLY key is not a Theme key. The cast is the assertion, not a workaround: the
    // parameter is `keyof Theme`, so this call is exactly the one TypeScript forbids — and
    // the runtime guard still has to refuse it, because `styleKeyFor`'s real callers hand it
    // keys read out of a `Partial<Theme>` at runtime, where the type is a claim rather than a
    // check. Removing the cast by widening the parameter would delete the type-level
    // protection every other caller relies on; removing the case would leave the guard
    // untested. Keep both.
    expect(styleKeyFor("dim", "stroke" as keyof Theme)).toBeNull();
  });

  it("theme { … } round-trips through every friendly alias", () => {
    // The sibling surface. It is SAFE — `resolveThemeKey` accepts the canonical key the
    // formatter prints — but that is a property to pin, not to assume, since it is the only
    // thing keeping `theme` out of the `style` failure above.
    for (const key of [
      ...Object.keys(DEFAULT_THEME),
      "background",
      "wall",
      "wallFill",
      "wallHatch",
      "room",
      "furniture",
      "door",
      "window",
    ]) {
      const v = key === "lineWeight" ? "1.5" : key === "font" ? '"Georgia, serif"' : '"#123456"';
      const src = `plan "T" {\n  theme { ${key}: ${v} }\n  wall exterior thickness 200 { (0,0) (3000,0) }\n}\n`;
      const once = format(src);
      expect(format(once), `theme { ${key} } is not a fixpoint`).toBe(once);
      expect(compile(once, { noCache: true }).diagnostics.map((d) => d.code)).not.toContain("W_UNKNOWN_THEME_KEY");
      expect(compile(once, { noCache: true }).svg).toBe(compile(src, { noCache: true }).svg);
    }
  });
});
