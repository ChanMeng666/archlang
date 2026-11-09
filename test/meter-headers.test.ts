/**
 * Every `src/` module that charges the evaluation-step meter says so in its header comment
 * (engineering-health A-F13, cards EH2.2/EH2.7). The meter (`MAX_EVAL_STEPS`, `chargeSteps`,
 * `src/expr.ts`) is what keeps `compile()` bounded, and a charge site a reader cannot find from
 * the top of the file is one a refactor drops. The header is the module's leading comment (a
 * block comment or a run of `//` lines before any code); it must name the meter itself: "step
 * meter", `MAX_EVAL_STEPS`, `chargeSteps`, or "charges <n> step(s)". A header that only says
 * "numbered steps" or "parameter" does not count.
 * A module counts as charging when its code, comments stripped, calls `chargeSteps(`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe as suite, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** The module's leading comment: a block comment, or a run of `//` lines, before any code. */
function headerOf(text: string): string {
  const t = text.replace(/^#![^\n]*\n/, "").trimStart();
  if (t.startsWith("/*")) {
    const end = t.indexOf("*/");
    return end < 0 ? "" : t.slice(0, end + 2);
  }
  const lines: string[] = [];
  for (const line of t.split(/\r?\n/)) {
    if (!line.trimStart().startsWith("//")) break;
    lines.push(line);
  }
  return lines.join("\n");
}

/** Does the code (comments stripped) call `chargeSteps(`? */
function charges(text: string): boolean {
  return /\bchargeSteps\(/.test(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""));
}

/** Does a header name the meter? Read as prose: comment markers dropped, a line break is a space. */
function namesMeter(header: string): boolean {
  const prose = header.replace(/^\s*(\/\*+|\*\/|\*|\/\/)/gm, " ").replace(/\s+/g, " ");
  return /step meter|MAX_EVAL_STEPS|chargeSteps|charges? \w+ steps?/i.test(prose);
}

const charging = listTs(SRC)
  .map((f) => ({ path: relative(ROOT, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }))
  .filter((m) => charges(m.text));

suite("a module that charges the step meter says so in its header", () => {
  it("finds the charging modules (the scan is not vacuous)", () => {
    const paths = charging.map((m) => m.path);
    expect(paths.length).toBeGreaterThan(10);
    for (const p of ["src/expr.ts", "src/ir.ts", "src/ir/expand.ts", "src/keep.ts"]) expect(paths).toContain(p);
  });

  for (const m of charging) {
    it(`${m.path} names the step meter in its header`, () => {
      const header = headerOf(m.text);
      expect(header, `${m.path} has no header comment`).not.toBe("");
      expect(namesMeter(header), `${m.path}: say in the header what it charges to the step meter`).toBe(true);
    });
  }

  it("catches a planted module whose header is silent about the meter", () => {
    const planted = '/**\n * Rooms.\n */\nimport { chargeSteps } from "./expr.js";\nchargeSteps(1);\n';
    expect(charges(planted)).toBe(true);
    expect(namesMeter(headerOf(planted))).toBe(false);
    // A header that only happens to say "steps", "stepSite" or "parameter" names no meter, and a
    // commented-out call is not a charge.
    expect(namesMeter("/** `resolveBody`'s numbered steps. */")).toBe(false);
    expect(namesMeter("/** Sets the stepSite. */")).toBe(false);
    expect(namesMeter("/** Bindings of every parameter. */")).toBe(false);
    expect(charges("// chargeSteps(1)\nconst x = 1;")).toBe(false);
    expect(namesMeter(headerOf("// Line one.\n// Charges one step per room.\nconst x = 1;"))).toBe(true);
    expect(namesMeter("/** Step meter (`MAX_EVAL_STEPS`): one per room. */")).toBe(true);
  });
});
