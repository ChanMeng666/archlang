/** rule provenance — every ruleset key has a row, grades match the source tags; lint --rules exports the effective ruleset; off the compile path. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, LINT_PROFILE_NAMES, LINT_PROFILES } from "../src/index.js";
import {
  LINT_RULES_SCHEMA_DRAFT,
  RULE_PROVENANCE,
  type RuleProvenance,
  VERIFICATION_GRADES,
  effectiveRuleset,
  rulesetKeys,
  unitsOf,
} from "../src/lint/provenance.js";
import { resolveRuleset } from "../src/lint/ruleset.js";
import { runArch } from "./helpers/cli.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * The key lists come FROM THE SOURCE: {@link rulesetKeys} over `DEFAULT_RULESET` and over each
 * profile's overrides (a scalar field, or `table.use` for a per-use table entry). No list of keys
 * is kept here, so a field added to the ruleset or a number added to a profile without its
 * provenance row is red, and so is a row left behind for a key that no longer exists.
 */
describe("rule provenance — one row per ruleset key, derived from the ruleset objects", () => {
  it("the key derivation is not vacuous", () => {
    const keys = rulesetKeys(DEFAULT_RULESET);
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).toContain("minRoomAreaByUseM2.wc");
    expect(keys).toContain("minRoomAreaByUseM2.bath");
    expect(keys).toContain("wallGapMm");
    // An empty per-use table has no number, so no key.
    expect(keys.some((k) => k.startsWith("minRoomShortSideByUseMm"))).toBe(false);
  });

  it("DEFAULT_RULESET: every key has a row, and no row names a key it does not have", () => {
    expect(Object.keys(RULE_PROVENANCE.defaults)).toEqual(rulesetKeys(DEFAULT_RULESET));
  });

  it("every built-in profile has a table, and no table names a profile that does not exist", () => {
    expect(Object.keys(RULE_PROVENANCE.profiles).sort()).toEqual([...LINT_PROFILE_NAMES].sort());
  });

  for (const name of LINT_PROFILE_NAMES) {
    it(`${name}: a row for every key it sets, and only those`, () => {
      const own = rulesetKeys(LINT_PROFILES[name] ?? {});
      expect(own.length).toBeGreaterThan(0);
      expect(Object.keys(RULE_PROVENANCE.profiles[name]!).sort()).toEqual([...own].sort());
    });
  }
});

/** Every row of the table, with where it sits. */
function allRows(): [where: string, row: RuleProvenance][] {
  const rows: [string, RuleProvenance][] = Object.entries(RULE_PROVENANCE.defaults).map(([k, r]) => [
    `default ${k}`,
    r,
  ]);
  for (const [p, t] of Object.entries(RULE_PROVENANCE.profiles))
    for (const [k, r] of Object.entries(t)) rows.push([`${p} ${k}`, r]);
  return rows;
}

describe("rule provenance — the grades", () => {
  it("every row takes one of the five grades; a convention names no document, a source always does", () => {
    for (const [where, row] of allRows()) {
      expect(VERIFICATION_GRADES, where).toContain(row.verification);
      if (row.verification === "convention") {
        expect("document" in row, where).toBe(false);
      } else {
        expect(row.document.length, where).toBeGreaterThan(0);
        for (const a of row.also ?? []) {
          expect(VERIFICATION_GRADES, where).toContain(a.verification);
          expect(a.verification, where).not.toBe("convention");
        }
      }
    }
  });

  /**
   * Each profile number in `src/lint/ruleset.ts` that carries an inline source comment is read
   * here, its tag (`[V`, `[S`, `[M`) against its row: an `[S]` is `S-secondary`, never `S-full`
   * or `V`, until the full text is read; a `[V]` is `V`, or `S-full` where the copy read was a
   * third party's; an `[M]` is `M`; an inline comment with no tag is a `convention`. The profile
   * and the per-use table a line sits in are read from the block it is in.
   */
  it("every tagged profile line in ruleset.ts maps onto its row's grade", () => {
    const src = readFileSync(join(ROOT, "src/lint/ruleset.ts"), "utf8");
    const start = src.indexOf("export const LINT_PROFILES");
    const end = src.indexOf("export const DEFERRED_PROFILE_NUMBERS");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    let profile: string | undefined;
    let table: string | undefined;
    let checked = 0;
    for (const line of src.slice(start, end).split("\n")) {
      const head = /^ {2}"([a-z-]+)": \{\s*$/.exec(line);
      if (head) {
        profile = head[1];
        table = undefined;
        continue;
      }
      const open = /^ {4}(\w+): \{\s*$/.exec(line);
      if (open) {
        table = open[1];
        continue;
      }
      if (/^ {4}\},\s*$/.test(line)) {
        table = undefined;
        continue;
      }
      const entry = /^ +(\w+): [^/]+,\s*\/\/(.*)$/.exec(line);
      if (!entry || profile === undefined) continue;
      const key = table !== undefined ? `${table}.${entry[1]}` : entry[1]!;
      const row = RULE_PROVENANCE.profiles[profile]?.[key];
      expect(row, `${profile} ${key}`).toBeDefined();
      const tag = /\[([VSM])\b/.exec(entry[2]!)?.[1];
      const allowed =
        tag === "S" ? ["S-secondary"] : tag === "V" ? ["V", "S-full"] : tag === "M" ? ["M"] : ["convention"];
      expect(allowed, `${profile} ${key} is tagged ${tag ?? "nothing"}, graded ${row!.verification}`).toContain(
        row!.verification,
      );
      checked++;
    }
    // Every number of the three advisory-code profiles carries a tag, and a few others do.
    expect(checked).toBeGreaterThan(40);
  });

  it("a key's units come from its field name, and every numeric default has one", () => {
    for (const key of rulesetKeys(DEFAULT_RULESET)) {
      const field = key.split(".")[0] as keyof typeof DEFAULT_RULESET;
      const v = DEFAULT_RULESET[field];
      if (typeof v === "boolean" || typeof v === "string") expect(unitsOf(key), key).toBeNull();
      else expect(unitsOf(key), key).not.toBeNull();
    }
  });
});

describe("effectiveRuleset — the values are the ruleset lint() runs", () => {
  for (const profile of [undefined, ...LINT_PROFILE_NAMES]) {
    it(`${profile ?? "default"}: every row's value is the resolved ruleset's, and every key is there once`, () => {
      const r = effectiveRuleset(profile);
      const resolved = resolveRuleset(profile !== undefined ? LINT_PROFILES[profile] : {});
      expect(r.rules.map((x) => x.key)).toEqual(rulesetKeys(resolved));
      for (const row of r.rules) {
        const [field, use] = row.key.split(".") as [string, string | undefined];
        const at = (resolved as unknown as Record<string, unknown>)[field];
        const expected = use === undefined ? at : (at as Record<string, unknown>)[use];
        expect(row.value, row.key).toEqual(expected);
      }
    });
  }

  it("the cascade's own derivation is marked as such, not credited to the profile or the default", () => {
    const mode = effectiveRuleset("accessibility-advisory").rules.find((x) => x.key === "roomAreaFloorMode");
    expect(mode).toMatchObject({ value: "at-least-generic", from: "cascade" });
  });
});

/**
 * The structural subset of JSON Schema {@link LINT_RULES_SCHEMA_DRAFT} uses (`type`, `enum`,
 * `const`, `required`, `properties`, `additionalProperties: false`, `items`): enough to hold the
 * export to its draft schema without a validator dependency. Returns the paths that fail.
 */
function violations(schema: Record<string, unknown>, v: unknown, path = "$"): string[] {
  const out: string[] = [];
  const typeOf = (x: unknown): string =>
    x === null ? "null" : Array.isArray(x) ? "array" : typeof x === "number" ? "number" : typeof x;
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes(typeOf(v))) out.push(`${path}: ${typeOf(v)} is not ${types.join("|")}`);
  }
  if (schema.enum !== undefined && !(schema.enum as unknown[]).includes(v)) out.push(`${path}: not in enum`);
  if ("const" in schema && schema.const !== v) out.push(`${path}: not the const`);
  if (typeOf(v) === "object") {
    const o = v as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    for (const k of (schema.required ?? []) as string[]) if (!(k in o)) out.push(`${path}.${k}: missing`);
    for (const [k, x] of Object.entries(o)) {
      if (props[k]) out.push(...violations(props[k]!, x, `${path}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: not allowed`);
    }
  }
  if (typeOf(v) === "array" && schema.items) {
    const items = schema.items as Record<string, unknown>;
    (v as unknown[]).forEach((x, i) => {
      out.push(...violations(items, x, `${path}[${i}]`));
    });
  }
  return out;
}

describe("lint --rules", () => {
  it("--json prints effectiveRuleset() for the profile, and it holds to the draft schema", async () => {
    for (const profile of [undefined, ...LINT_PROFILE_NAMES]) {
      const args = ["lint", "--rules", ...(profile ? ["--profile", profile] : []), "--json"];
      const r = await runArch(args);
      expect(r.status, `${args.join(" ")}\n${r.stderr}`).toBe(0);
      const doc = JSON.parse(r.stdout);
      expect(doc).toEqual(JSON.parse(JSON.stringify(effectiveRuleset(profile))));
      expect(violations(LINT_RULES_SCHEMA_DRAFT as unknown as Record<string, unknown>, doc)).toEqual([]);
    }
  });

  it("the schema is a draft: no $id, and the export says so", async () => {
    expect("$id" in LINT_RULES_SCHEMA_DRAFT).toBe(false);
    const doc = JSON.parse((await runArch(["lint", "--rules", "--json"])).stdout);
    expect(doc.schema).toEqual({ status: "draft", id: null });
    expect(doc.advisory).toMatch(/not compliance/);
  });

  // One row pinned per ruleset, so a reader can see the shape; the values are read from the
  // ruleset objects above, these pins only say which source each one cites.
  const PINS: [profile: string | undefined, row: Record<string, unknown>][] = [
    [
      undefined,
      {
        key: "minRoomAreaByUseM2.wc",
        value: 1.1,
        units: "m2",
        from: "default",
        verification: "S-full",
        clause: "5.4.2 item 5",
        edition: "2011",
      },
    ],
    ["residential-basic", { key: "assumeDwelling", value: true, units: null, verification: "convention" }],
    ["accessibility-advisory", { key: "exitApproachPullMm", value: 1525, verification: "S-full", edition: "2010" }],
    [
      "cn-residential-advisory",
      {
        key: "minDoubleBedroomAreaM2",
        value: 9,
        from: "cn-residential-advisory",
        verification: "S-full",
        clause: "5.2.1",
      },
    ],
    [
      "uk-residential-advisory",
      {
        key: "minDoubleBedroomAreaM2",
        value: 11.5,
        units: "m2",
        from: "uk-residential-advisory",
        verification: "V",
        document: "Nationally Described Space Standard",
        clause: "10(d)",
        edition: "2015",
      },
    ],
    [
      "us-residential-advisory",
      { key: "stairMaxRiseMm", value: 196.85, verification: "S-secondary", clause: "R311.7.5.1" },
    ],
  ];
  for (const [profile, pin] of PINS) {
    it(`${profile ?? "default"}: ${pin.key as string}`, async () => {
      const args = ["lint", "--rules", ...(profile ? ["--profile", profile] : []), "--json"];
      const doc = JSON.parse((await runArch(args)).stdout);
      expect(doc.rules.find((x: { key: string }) => x.key === pin.key)).toMatchObject(pin);
    });
  }

  it("prints one line per key without --json, the value in its unit with grade, source and document", async () => {
    const r = await runArch(["lint", "--rules"]);
    expect(r.status).toBe(0);
    const lines = r.stdout.trimEnd().split("\n");
    expect(lines.length).toBe(effectiveRuleset().rules.length + 1);
    expect(r.stdout).toContain("  minRoomAreaByUseM2.wc = 1.1 m2 [S-full, default] · GB 50096-2011");
    expect(r.stdout).toContain("  wallGapMm = 100 mm [convention, default]\n");
    expect(r.stdout).toContain("  minDoubleBedroomAreaM2 = off [convention, default]\n");
  });

  it("--quiet (stderr only) leaves the list, which is the result, on stdout", async () => {
    const r = await runArch(["lint", "--rules", "--quiet"]);
    expect(r).toMatchObject({ status: 0, stdout: (await runArch(["lint", "--rules"])).stdout, stderr: "" });
  });

  it("reads no plan: an input or a diagnostic option with it is bad usage (exit 3)", async () => {
    for (const extra of [
      ["examples/studio.arch"],
      ["--code", "W_ROOM_TOO_SMALL"],
      ["--severity", "warning"],
      ["--strict"],
    ]) {
      const r = await runArch(["lint", "--rules", ...extra]);
      expect(r.status, extra.join(" ")).toBe(3);
      expect(r.stdout).toBe("");
      expect(r.stderr).toMatch(/--rules prints the ruleset and lints nothing; drop /);
    }
  });

  it("an unknown profile is bad usage, as without --rules", async () => {
    const r = await runArch(["lint", "--rules", "--profile", "uk-residential", "--json"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/did you mean "uk-residential-advisory"/);
  });
});

/** Every `.ts` file under `src/`, as a forward-slash path from the repository root. */
function srcFiles(dir = join(ROOT, "src")): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return srcFiles(p);
    return f.endsWith(".ts") ? [relative(ROOT, p).replace(/\\/g, "/")] : [];
  });
}

describe("rule provenance — off the compile path", () => {
  // The table is text the browser bundle must not carry (the playground's startup budget), and
  // lint() must not learn it (its return value is pinned by the byte-identity laws). Only the CLI
  // imports it.
  it("no module outside src/cli/ imports src/lint/provenance.ts", () => {
    const files = srcFiles();
    expect(files.length).toBeGreaterThan(100);
    const importers = files.filter(
      (f) =>
        f !== "src/lint/provenance.ts" &&
        /from "[./]*(?:lint\/)?provenance\.js"/.test(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(importers).toEqual(["src/cli/commands-analyze.ts"]);
  });
});
