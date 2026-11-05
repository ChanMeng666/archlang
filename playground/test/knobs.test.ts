import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { compile, lint } from "../../src/index.js";
import { extractKnobs, knobRange, knobReadout, literalFor, rewriteKnob } from "../src/knobs.js";

const example = (name: string) =>
  readFileSync(new URL(`../../examples/${name}.arch`, import.meta.url), "utf8").replace(/\r\n?/g, "\n");
const knobsOf = (src: string) => extractKnobs(src, compile(src, { noCache: true }).ast);
const plan = (body: string, grid = "grid 50") => `plan "K" {\n  units mm\n  ${grid}\n${body}\n}\n`;

suite("extractKnobs", () => {
  it("reads parametric's plain numbers, with their comments as labels, and skips the rest", () => {
    const knobs = knobsOf(example("parametric"));
    expect(knobs.map((k) => k.name)).toEqual(["WALL", "W", "H", "DOOR", "WIN", "COUNT"]);
    const w = knobs.find((k) => k.name === "W")!;
    expect(w).toMatchObject({
      label: "unit width",
      value: 4000,
      unit: "",
      count: false,
      min: 2400,
      max: 5600,
      step: 50,
    });
    expect(knobs.find((k) => k.name === "DOOR")!.label).toBe("DOOR");
    expect(knobs.find((k) => k.name === "COUNT")).toMatchObject({
      label: "number of units",
      count: true,
      min: 2,
      max: 4,
      step: 1,
    });
  });

  it("gives the span of the literal alone", () => {
    const src = example("parametric");
    for (const k of knobsOf(src)) expect(Number(src.slice(k.span.start, k.span.end))).toBe(k.value);
  });

  it("finds knobs where the plan's lets are plain numbers, and none in a plan without lets", () => {
    const names = (n: string) => knobsOf(example(n)).map((k) => k.name);
    expect(names("terrace-row")).toEqual(["DEPTH", "SETBACK"]);
    expect(names("classroom-block")).toEqual(["CW"]);
    expect(names("museum")).toEqual(["BAY"]);
    expect(names("garden-house")).toEqual(["T"]);
    expect(names("knob-flat")).toEqual(["LIVING", "BEDROOM", "DEPTH"]);
    expect(names("laneway-house")).toEqual([]);
  });

  it("takes only a positive numeric literal bound once at the plan's top level", () => {
    const src = plan(
      [
        "  let A = 3000",
        "  let B = 3000 + 0",
        "  let C = -3000",
        "  let D = 0",
        "  let E = [3000]",
        "  let F(x) = x",
        "  let G = 3000",
        "  let G = 4000",
        "  let H = 3000",
        "  H = 3500",
        "  for i in 0..1 { let I = 3000 }",
        "  room at (0,0) size A x A",
      ].join("\n"),
    );
    expect(knobsOf(src).map((k) => k.name)).toEqual(["A"]);
  });

  it("keeps the unit a literal is written in", () => {
    const src = plan("  let A = 4.5m\n  let B = 450cm\n  let C = 4500mm\n  room at (0,0) size A x B");
    const knobs = knobsOf(src);
    expect(knobs.map((k) => [k.name, k.unit, k.value])).toEqual([
      ["A", "m", 4500],
      ["B", "cm", 4500],
      ["C", "mm", 4500],
    ]);
    expect(knobReadout(knobs[0]!, 4550)).toBe("4.55 m");
    expect(knobReadout(knobs[1]!, 4550)).toBe("455 cm");
    expect(knobReadout(knobs[2]!, 4550)).toBe("4550 mm");
  });

  it("steps by the plan's grid, or 50 mm without one", () => {
    const body = "  let A = 3000\n  room at (0,0) size A x A";
    expect(knobsOf(plan(body, "grid 100"))[0]).toMatchObject({ min: 1800, max: 4200, step: 100 });
    expect(knobsOf(plan(body, "")).map((k) => k.step)).toEqual([50]);
  });
});

suite("knobRange", () => {
  it("is ±40 % on the grid around the value, which is a stop", () => {
    expect(knobRange("W", 4000, "", 50)).toEqual({ min: 2400, max: 5600, step: 50, count: false });
    // Off the grid itself: the range is still whole steps either side of it.
    const r = knobRange("W", 4025, "", 50)!;
    expect((4025 - r.min) % 50).toBe(0);
    expect((r.max - 4025) % 50).toBe(0);
  });

  it("counts by 1, never under 1, for a count-like name or a whole number under 20", () => {
    expect(knobRange("COUNT", 3, "", 50)).toEqual({ min: 2, max: 4, step: 1, count: true });
    expect(knobRange("N_UNITS", 30, "", 50)).toEqual({ min: 18, max: 42, step: 1, count: true });
    expect(knobRange("BAYS", 1, "", 50)).toEqual({ min: 1, max: 2, step: 1, count: true });
  });

  it("is no knob when one step either side does not fit", () => {
    expect(knobRange("T", 60, "", 100)).toBeNull();
    expect(knobRange("T", 0, "", 50)).toBeNull();
  });
});

suite("rewriteKnob", () => {
  it("changes only the literal: every byte outside it is unchanged", () => {
    for (const name of ["parametric", "terrace-row", "classroom-block", "museum", "garden-house", "knob-flat"]) {
      const src = example(name);
      for (const k of knobsOf(src)) {
        for (const v of [k.min, k.max]) {
          const out = rewriteKnob(src, k, v);
          const lit = literalFor(v, k.unit);
          expect(out.slice(0, k.span.start)).toBe(src.slice(0, k.span.start));
          expect(out.slice(k.span.start + lit.length)).toBe(src.slice(k.span.end));
          expect(out.slice(k.span.start, k.span.start + lit.length)).toBe(lit);
          // And the plan reads the new value back as that knob.
          expect(knobsOf(out).find((x) => x.name === k.name)?.value).toBe(v);
        }
      }
    }
  });

  it("writes the value in the literal's own unit", () => {
    expect(literalFor(4550, "m")).toBe("4.55m");
    expect(literalFor(4000, "m")).toBe("4m");
    expect(literalFor(455, "cm")).toBe("45.5cm");
    expect(literalFor(4550, "")).toBe("4550");
    expect(literalFor(4550, "mm")).toBe("4550mm");
  });
});

suite("knob-flat: the knobs example stays a sound plan across every knob's range", () => {
  const src = example("knob-flat");
  const knobs = knobsOf(src);
  for (const k of knobs) {
    for (const v of [k.min, k.value, k.max]) {
      it(`${k.name} = ${v}: compiles with no errors, and lint() is clean`, () => {
        const out = rewriteKnob(src, k, v);
        expect(compile(out, { noCache: true }).errors).toEqual([]);
        expect(lint(out).map((d) => d.code)).toEqual([]);
      });
    }
  }
});
