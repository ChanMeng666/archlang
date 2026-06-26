import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { compile } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const example = (name: string) => readFileSync(join(__dirname, "..", "examples", name), "utf8");

/**
 * Golden-SVG guards: any change to rendered output for the shipped examples
 * must be intentional (review the snapshot diff, then `vitest -u`).
 */
describe("golden SVG snapshots", () => {
  for (const name of ["studio.arch", "two-bed.arch", "parametric.arch", "themed.arch", "relational.arch"]) {
    it(`renders ${name} deterministically`, () => {
      const { svg, errors } = compile(example(name), { noCache: true });
      expect(errors).toEqual([]);
      expect(svg).toMatchSnapshot();
    });
  }
});
