/**
 * The error catalogue is written by family (`src/error-catalog/<family>.ts`, one
 * `defineEntries({...})` each) and merged by `src/error-catalog.ts` with object spreads. A spread
 * cannot see a code two families both define (the later silently wins, where one object literal
 * was a `tsc` error), nor a family file nobody spreads. This file pins what the split relies on,
 * deriving every list from the source: the family files from the directory, the lint families
 * from `FAMILY_NOUN`, the rules' codes from `LINT_RULES`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/error-catalog.js";
import { ERROR_CATALOG } from "../src/error-catalog.js";
import { diag } from "../src/diagnostics.js";
import { FAMILY_NOUN } from "../src/lint/coverage.js";
import { LINT_RULES } from "../src/lint/rules/index.js";

const DIR = "src/error-catalog";
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && f !== "entry.ts")
  .sort();

interface Family {
  file: string;
  header: string;
  entries: Readonly<Record<string, CatalogEntry>>;
}

async function loadFamilies(): Promise<Family[]> {
  const out: Family[] = [];
  for (const file of FILES) {
    const mod = (await import(`../src/error-catalog/${file}`)) as Record<string, unknown>;
    const named = Object.keys(mod).filter((k) => k.endsWith("_ENTRIES"));
    expect(named, `${file} exports exactly one *_ENTRIES object`).toHaveLength(1);
    const header = /^\/\*\*([\s\S]*?)\*\//.exec(readFileSync(`${DIR}/${file}`, "utf8"))?.[1] ?? "";
    out.push({ file, header, entries: mod[named[0]!] as Family["entries"] });
  }
  return out;
}

describe("error catalogue families", () => {
  it("has family files to check", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it("are disjoint, and ERROR_CATALOG is exactly their union (every family file is spread)", async () => {
    const families = await loadFamilies();
    const owner = new Map<string, string>();
    const twice: string[] = [];
    for (const f of families) {
      for (const code of Object.keys(f.entries)) {
        if (owner.has(code)) twice.push(`${code} in ${owner.get(code)} and ${f.file}`);
        owner.set(code, f.file);
        // The merged entry is the family's own object, not a copy that could drift.
        expect(ERROR_CATALOG[code], `${code} (${f.file}) is in ERROR_CATALOG`).toBe(f.entries[code]);
      }
    }
    expect(twice).toEqual([]);
    expect([...owner.keys()].sort()).toEqual(Object.keys(ERROR_CATALOG).sort());
  });

  it("fill each entry's code from its key", () => {
    const wrong = Object.entries(ERROR_CATALOG)
      .filter(([key, e]) => e.code !== key)
      .map(([key]) => key);
    expect(wrong).toEqual([]);
  });

  it("give every E_ code severity error and every W_ code severity warning (what diag() relies on)", () => {
    const wrong = Object.values(ERROR_CATALOG)
      .filter((e) => !/^[EW]_/.test(e.code) || (e.code.startsWith("E_") ? "error" : "warning") !== e.severity)
      .map((e) => `${e.code} (${e.severity})`);
    expect(wrong).toEqual([]);
  });

  it("name each lint family in exactly one file header, and catalogue each rule's codes in that file", async () => {
    const families = await loadFamilies();
    const homeOf = new Map<string, string>();
    for (const lf of Object.keys(FAMILY_NOUN)) {
      const named = families.filter((f) => f.header.includes(`\`${lf}\``)).map((f) => f.file);
      expect(named, `lint family \`${lf}\` is named in exactly one family header`).toHaveLength(1);
      homeOf.set(lf, named[0]!);
    }
    const misplaced: string[] = [];
    for (const rule of LINT_RULES) {
      const home = families.find((f) => f.file === homeOf.get(rule.family))!;
      for (const code of rule.codes)
        if (!(code in home.entries))
          misplaced.push(`${code} (rule ${rule.name}, family ${rule.family}) -> ${home.file}`);
    }
    expect(misplaced).toEqual([]);
  });
});

describe("diag()", () => {
  it("takes the severity from the code's prefix and omits an absent span", () => {
    expect(diag("E_PARSE", "m", { start: 1, end: 2 })).toEqual({
      severity: "error",
      message: "m",
      span: { start: 1, end: 2 },
      code: "E_PARSE",
    });
    const w = diag("W_EMPTY_PLAN", "empty", undefined, { hints: ["h"] });
    expect(w).toEqual({ severity: "warning", message: "empty", code: "W_EMPTY_PLAN", hints: ["h"] });
    expect("span" in w).toBe(false);
  });

  it("refuses an uncatalogued code at compile time", () => {
    // @ts-expect-error — not a catalogue code (typecheck:all fails if this ever compiles)
    expect(diag("E_NOT_A_CODE", "m").code).toBe("E_NOT_A_CODE");
  });
});
