/** room uses. */

import { describe, expect, it } from "vitest";
import { describe as describePlan, lint, compile, registerElement } from "../src/index.js";
import type { ParseCtx, ResolveCtx } from "../src/index.js";
import { format } from "../src/format.js";

/**
 * Room `uses` tags — the keystone that makes room classification *authored intent*
 * instead of a label-regex guess. Explicit `uses` win; untagged rooms keep the old
 * regex behaviour (so existing plans are byte-identical and lint is unchanged).
 */

const wrap = (room: string) =>
  `plan "P" {\n  units mm\n  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }\n  ${room}\n}`;

describe("room uses", () => {
  it("surfaces explicit uses (a multi-use studio room) in describe()", () => {
    const s = describePlan(wrap(`room id=r at (0,0) size 4000x3000 label "Open Plan" uses living kitchen`));
    expect(s.ok).toBe(true);
    expect(s.rooms[0]!.uses).toEqual(["living", "kitchen"]);
  });

  it("infers uses from the label when untagged (unchanged behaviour)", () => {
    const s = describePlan(wrap(`room id=r at (0,0) size 4000x3000 label "Bedroom 1"`));
    expect(s.rooms[0]!.uses).toEqual(["bedroom"]);
  });

  it("lets an explicit use OVERRIDE the label-regex guess", () => {
    // Labelled "Den" (no regex hit) but declared a bedroom → must get the bedroom
    // rule (W_BEDROOM_NO_WINDOW), which a label-only classifier would miss.
    const warnings = lint(wrap(`room id=r at (0,0) size 4000x3000 label "Den" uses bedroom`));
    expect(warnings.some((w) => w.code === "W_BEDROOM_NO_WINDOW")).toBe(true);
    // Without the tag, "Den" is not a bedroom → no such warning.
    const untagged = lint(wrap(`room id=r at (0,0) size 4000x3000 label "Den"`));
    expect(untagged.some((w) => w.code === "W_BEDROOM_NO_WINDOW")).toBe(false);
  });

  it("round-trips `uses` through the formatter", () => {
    const src = wrap(`room id=r at (0,0) size 4000x3000 label "Open" uses living kitchen`);
    expect(format(src)).toContain("uses living kitchen");
    // Formatting is idempotent.
    expect(format(format(src))).toBe(format(src));
  });

  it("reports a clear error for an unknown use value (no crash)", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses lounge`), { noCache: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/room uses/i);
  });

  // Backlog U.6: an outdoor word after `uses` names the element that draws it.
  it.each([
    ["balcony", "outdoor balcony"],
    ["patio", "outdoor patio"],
    // The language reference draws a terrace as `outdoor balcony … label "Terrace"` (RR.5).
    ["terrace", "outdoor balcony"],
    ["Balcony", "outdoor balcony"],
    ["garden", "outdoor lawn"],
  ])("points `uses %s` at `%s`", (word, hint) => {
    const { diagnostics } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses ${word}`), { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toContain(`\`${hint}\``);
  });

  it("points a strip room's `uses balcony` at `outdoor balcony` too", () => {
    const src = `plan "P" {\n  units mm\n  strip right at (0,0) gap 0 height 3000 { room id=s1 size 3000 uses balcony }\n}`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toContain("`outdoor balcony`");
  });

  it("adds no outdoor hint for a word that is not an outdoor surface", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses lounge`), { noCache: true });
    expect(errors[0]!.message).not.toContain("outdoor");
  });

  it("adds no outdoor hint to a quoted word after `uses`", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses "Garden"`), { noCache: true });
    expect(errors[0]!.message).not.toContain("outdoor");
  });

  // Backlog RR.5: an outdoor word after a valid use ends the list; the error it already raises
  // (the next statement is unknown) gains the hint, its message and span unchanged.
  it.each([
    ["living balcony", "balcony", "outdoor balcony"],
    ["living dining Terrace", "Terrace", "outdoor balcony"],
    ["bedroom garden", "garden", "outdoor lawn"],
  ])("points `uses %s` at the outdoor surface", (words, word, hint) => {
    const { diagnostics } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses ${words}`), { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toBe(`Unknown statement "${word}"`);
    expect(diagnostics[0]!.hints?.[0]).toContain(`"${word}" after "uses" is not a room use`);
    expect(diagnostics[0]!.hints?.[0]).toContain(`\`${hint}\``);
  });

  it("points a strip room's later `uses … balcony` at `outdoor balcony` too", () => {
    const src = `plan "P" {
  units mm
  strip right at (0,0) gap 0 height 3000 { room id=s1 size 3000 uses living balcony }
}`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics[0]!.code).toBe("E_PARSE");
    expect(diagnostics[0]!.message).toBe('Expected "room" but found "balcony"');
    expect(diagnostics[0]!.hints?.[0]).toContain("`outdoor balcony`");
  });

  it("keeps the room: `uses living balcony` reports exactly one diagnostic, no cascade", () => {
    const src = `plan "P" {
  units mm
  room id=a at (0,0) size 4000x3000 uses living balcony
  room id=b right-of a size 3000x3000
  furniture sofa in a centered size 2000x900
  furniture bed in b centered size 1600x2000
}`;
    const { diagnostics } = compile(src, { noCache: true });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.hints?.[0]).toContain("`outdoor balcony`");
  });

  // RR.5 review B1: an outdoor word after a uses list that STARTS a valid statement still
  // parses as that statement; only a word that already fails gets the hint.
  const usesThen = (stmt: string, before = "") => `plan "P" {
  units mm
  ${before}
  wall exterior thickness 200 { (0,0) (4000,0) (4000,3000) (0,3000) close }
  room id=r at (0,0) size 4000x3000 uses living
  ${stmt}
}`;
  const comp = (name: string, params: string) =>
    `component ${name}(${params}) { room at (${params.split(",")[0]},0) size 1000x1000 label "${name}" }`;
  it.each([
    ["a declared component call", usesThen("Balcony(0, 4000)", comp("Balcony", "x, y"))],
    ["a lower-case outdoor component call", usesThen("terrace(0)", comp("terrace", "x"))],
    ["a capitalised outdoor component call", usesThen("Water(0)", comp("Water", "x"))],
    ["an assignment to an outdoor name", usesThen("deck = 4000", "let deck = 0")],
    [
      "assignments in a for body",
      `plan "P" {
  units mm
  let deck = 0
  for i in 0..2 {
    room at (i * 2000, 0) size 2000x2000 uses living
    deck = 4000
    room at (i * 2000, 3000) size 2000x2000 uses bedroom
    deck = deck + 1
  }
}`,
    ],
    [
      "an assignment to a component parameter",
      `plan "P" {
  units mm
  component plot(garden) {
    room at (garden, 0) size 2000x2000 uses living
    garden = garden + 1
  }
  plot(0)
}`,
    ],
  ])("still compiles %s after a uses list", (_what, src) => {
    expect(compile(src, { noCache: true }).diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("still compiles a plugin element keyword `garden` after a uses list", () => {
    const garden = registerElement({
      kind: "garden_plot",
      keyword: "garden",
      parse(ctx: ParseCtx) {
        const kw = ctx.eatKeyword("garden");
        const at = ctx.parsePoint();
        return { kind: "garden_plot", id: "", at, line: kw.line } as never;
      },
      idPrefix: () => "garden",
      resolve(node: { at: unknown; span: unknown }, ctx: ResolveCtx) {
        const at = ctx.snapPt(ctx.evalPt(node.at as never));
        return { kind: "garden_plot", id: ctx.id, at, span: node.span } as never;
      },
      bounds: (r: { at: { x: number; y: number } }) => [r.at, r.at],
      render: () => [],
    } as never);
    const { diagnostics } = compile(usesThen("garden (1000,1000)"), { plugins: [garden], noCache: true });
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("names no outdoor kind for a word with no source in the language reference", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses yard`), { noCache: true });
    expect(errors[0]!.message).not.toContain("outdoor");
  });

  it("a valid uses list followed by a clause still compiles", () => {
    const { errors } = compile(wrap(`room id=r at (0,0) size 4000x3000 uses living dining label "L"`), {
      noCache: true,
    });
    expect(errors).toEqual([]);
  });
});
