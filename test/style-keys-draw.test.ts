/**
 * Every accepted `style <kind> { <attr> … }` key moves its own kind's ink and nothing else (WS.5).
 *
 * #868's review found `style wall { fill }` and `{ hatch }` accepted, stored, and drawn by nobody:
 * the SVG backend built every hatch `<pattern>` from the scene theme. The reference's style
 * section now says a wall's `fill`/`hatch` recolour the walls' poché (and its legend swatch) and
 * leave the floor and ground patterns alone; the second block pins exactly that, and the sweep
 * pins the general claim for every `STYLE_KEYS` pair on a plan that draws the kind.
 */

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";
import { STYLE_KEYS, resolveStyleKey } from "../src/theme.js";

const INK = "#a1b2c3";

/** Insert `line` just after the plan's opening brace. */
function withStyle(src: string, line: string): string {
  return src.replace(/^(plan\b[^{\n]*\{)/m, `$1\n  ${line}`);
}

function svgOf(src: string): string {
  const r = compile(src, { annotate: true });
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  return r.svg;
}

/** The `<pattern>` elements of an SVG, by id (sliced with `indexOf`: no lazy regex over output). */
function patterns(svg: string): Map<string, string> {
  const out = new Map<string, string>();
  for (let at = svg.indexOf('<pattern id="'); at >= 0; at = svg.indexOf('<pattern id="', at + 1)) {
    const end = svg.indexOf("</pattern>", at);
    const id = svg.slice(at + 13, svg.indexOf('"', at + 13));
    out.set(id, svg.slice(at, end < 0 ? svg.length : end));
  }
  return out;
}

/** Every pattern (as `pattern#id`) and every tag outside `<defs>` that carries `ink`. */
function inked(svg: string, ink: string): string[] {
  const pats = [...patterns(svg)].filter(([, body]) => body.includes(ink)).map(([id]) => `pattern#${id}`);
  const defsEnd = svg.indexOf("</defs>");
  const body = defsEnd < 0 ? svg : svg.slice(defsEnd);
  const tags = [...body.matchAll(/<[a-z]+\b[^>]*>/g)].map((m) => m[0]).filter((t) => t.includes(ink));
  return [...pats, ...tags];
}

// The plans a kind is tried on: every example that writes it as a statement, then an inline plan.
// A key "moves" when at least one of them draws its ink (an example may write the kind only on an
// upper storey, which the default view does not draw); every one of them must keep it to the kind.
const SHELL = `wall exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room" uses living`;
const INLINE: Record<string, string> = {
  section: `plan "s" {
  ${SHELL}
  section A (0,2000)->(6000,2000) look north
}`,
  void: `plan "v" {
  ${SHELL}
  void id=v at (1000,1000) size 2000x2000
}`,
};
const examples = readdirSync("examples")
  .filter((f) => f.endsWith(".arch"))
  .sort()
  .map((f) => readFileSync(`examples/${f}`, "utf8"));
function plansFor(kind: string): string[] {
  const writes = examples.filter((s) => new RegExp(`^\\s*${kind}\\b`, "m").test(s));
  return [...(INLINE[kind] ? [INLINE[kind]] : []), ...writes];
}
/** Plans checked for strays once one has drawn the ink (keeps the sweep's compile count bounded). */
const STRAY_SAMPLE = 4;

describe("each accepted style key moves its own kind's ink and nothing else (WS.5)", () => {
  for (const [kind, attrs] of Object.entries(STYLE_KEYS)) {
    for (const attr of Object.keys(attrs)) {
      it(`style ${kind} { ${attr} }`, () => {
        expect(resolveStyleKey(kind, attr)).not.toBeNull();
        const srcs = plansFor(kind);
        expect(srcs.length, `no plan writes a ${kind}`).toBeGreaterThan(0);
        let drawn = 0;
        for (const [i, src] of srcs.entries()) {
          if (i >= STRAY_SAMPLE && drawn > 0) break;
          expect(svgOf(src)).not.toContain(INK);
          const hits = inked(svgOf(withStyle(src, `style ${kind} { ${attr}: "${INK}" }`)), INK);
          if (hits.length > 0) drawn++;
          // Nothing else: no element of another kind, and a pattern only for a wall.
          const strays = hits.filter((h) => {
            const k = /data-arch-kind="([^"]*)"/.exec(h)?.[1];
            if (k !== undefined) return k !== kind;
            return h.startsWith("pattern#") && kind !== "wall";
          });
          expect(strays).toEqual([]);
        }
        // Moves: the ink is drawn on at least one plan that writes the kind.
        expect(drawn, `style ${kind} { ${attr} } draws nothing`).toBeGreaterThan(0);
      });
    }
  }
});

// The reference names every STYLE_KEYS pair (`test/style-reference-section.test.ts`) and the sweep
// above draws every one, so the section may not keep a caveat saying some key is not drawn.
it("the reference's style section claims no accepted key goes undrawn", () => {
  const doc = readFileSync("docs/language-reference.md", "utf8").replace(/\s+/g, " ");
  const at = doc.indexOf("### Per-element styles — `style`");
  expect(at).toBeGreaterThanOrEqual(0);
  const text = doc.slice(at, doc.indexOf(" ### ", at + 10));
  expect(text).not.toMatch(/does not read|not drawn|draws nothing|not yet/i);
  expect(text).toContain("recolour the walls' poché");
});

describe("style wall { fill | hatch } recolours the walls' poché only (WS.5)", () => {
  const PLAN = `plan "w" {
  legend
  wall exterior thickness 200 material concrete { (0,0) (8000,0) (8000,5000) (0,5000) close }
  wall partition thickness 100 { (4000,0) (4000,5000) }
  room id=a at (0,0) size 4000x5000 label "A" uses living floor concrete
  room id=b at (4000,0) size 4000x5000 label "B" uses bedroom floor timber
  outdoor id=p paving at (0,6000) size 8000x2000 label "Terrace"
}`;
  const base = compile(PLAN).svg;

  for (const attr of ["fill", "hatch"]) {
    it(`style wall { ${attr} } draws the wall patterns in its ink, no floor or ground pattern`, () => {
      // Appended last, so no earlier statement's span moves.
      const styled = compile(PLAN.replace(/\}\s*$/, `  style wall { ${attr}: "${INK}" }\n}`)).svg;
      const pats = inked(styled, INK).filter((h) => h.startsWith("pattern#"));
      // The walls' two materials; the concrete FLOOR (`-floor`), timber and paving keep theirs.
      expect(pats.sort()).toEqual(["pattern#hatch-concrete", "pattern#poche"]);
      // Everything outside those two patterns is byte-identical: ids, references, legend.
      let a = styled;
      let b = base;
      for (const id of ["poche", "hatch-concrete"]) {
        a = a.replace(patterns(a).get(id)!, "");
        b = b.replace(patterns(b).get(id)!, "");
      }
      expect(a).toBe(b);
    });
  }

  it("a CompileOptions.theme pocheBase still wins over style wall { fill }", () => {
    const opts = { theme: { pocheBase: "#010203" } };
    const styled = compile(withStyle(PLAN, `style wall { fill: "${INK}" }`), opts).svg;
    expect(styled).toBe(compile(PLAN, opts).svg);
  });
});
