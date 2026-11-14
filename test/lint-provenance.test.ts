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
   * Every row against the source comment in `src/lint/ruleset.ts` that documents its number: the
   * row's grade is the comment's FIRST tag, exactly (`[V` → `V`, `[S-full` → `S-full`, `[S` →
   * `S-secondary`, `[M` → `M`), and a comment with no tag, or no comment, is a `convention`. So an
   * `[S]` row can never be graded `S-full` or `V` here without its comment saying so first, and a
   * comment cannot be raised without its row. A key whose value is `null` is a `convention`
   * whatever its comment says (a `null` cites no number; the comment's tag is then a profile's).
   *
   * Where the comment is, by ruleset:
   *  - `DEFAULT_RULESET`: the JSDoc block of the field in `interface LintRuleset`; for a per-use
   *    table's entry, the block's bullet that names the use (`` - `wc` 1.1: … ``).
   *  - a profile: the key's inline `//` comment, else the `//` block above it (which covers every
   *    key after it until the next comment), else none.
   */
  const RULESET_SRC = readFileSync(join(ROOT, "src/lint/ruleset.ts"), "utf8");
  const gradeOfTag = (text: string): string => {
    const t = /\[(S-full|V|S|M)(?![\w-])/.exec(text)?.[1];
    return t === undefined ? "convention" : t === "S" ? "S-secondary" : t;
  };

  it("every DEFAULT_RULESET row's grade is the first tag of its field's JSDoc in ruleset.ts", () => {
    const start = RULESET_SRC.indexOf("export interface LintRuleset {");
    const end = RULESET_SRC.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const docs = new Map<string, string>();
    let doc: string[] = [];
    let inDoc = false;
    for (const line of RULESET_SRC.slice(start, end).split("\n")) {
      if (/^\s*\/\*\*/.test(line)) {
        doc = [line];
        inDoc = !line.includes("*/");
        continue;
      }
      if (inDoc) {
        doc.push(line);
        if (line.includes("*/")) inDoc = false;
        continue;
      }
      const field = /^ {2}(\w+)\??:/.exec(line);
      if (field) {
        docs.set(field[1]!, doc.join("\n"));
        doc = [];
      }
    }
    // The bullet of a per-use table's JSDoc that names `use`, with its continuation lines.
    const bullet = (block: string, use: string): string | undefined => {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => l.includes(`- \`${use}\``));
      if (i < 0) return undefined;
      const out = [lines[i]!];
      for (const l of lines.slice(i + 1)) {
        if (!/^\s*\*\s{4,}\S/.test(l)) break;
        out.push(l);
      }
      return out.join("\n");
    };
    let checked = 0;
    for (const key of rulesetKeys(DEFAULT_RULESET)) {
      const [field, use] = key.split(".") as [string, string | undefined];
      const block = docs.get(field);
      expect(block, `${field} has a JSDoc block`).toBeDefined();
      const at = (DEFAULT_RULESET as unknown as Record<string, unknown>)[field];
      const value = use === undefined ? at : (at as Record<string, unknown>)[use];
      let expected: string;
      if (value === null) expected = "convention";
      else if (use === undefined) expected = gradeOfTag(block!);
      else {
        const text = bullet(block!, use);
        expect(text, `${key}: the ${field} JSDoc has a bullet for \`${use}\``).toBeDefined();
        expected = gradeOfTag(text!);
      }
      expect(RULE_PROVENANCE.defaults[key]!.verification, `default ${key}`).toBe(expected);
      checked++;
    }
    expect(checked).toBe(Object.keys(RULE_PROVENANCE.defaults).length);
  });

  it("every profile row's grade is the first tag of its source comment in ruleset.ts", () => {
    const start = RULESET_SRC.indexOf("export const LINT_PROFILES");
    const end = RULESET_SRC.indexOf("export const DEFERRED_PROFILE_NUMBERS");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    let profile: string | undefined;
    let table: string | undefined;
    let pending: string | undefined;
    let afterKey = false;
    const seen: string[] = [];
    const check = (key: string, comment: string | undefined) => {
      expect(profile, `${key} sits in a profile`).toBeDefined();
      const row = RULE_PROVENANCE.profiles[profile!]?.[key];
      expect(row, `${profile} ${key}`).toBeDefined();
      expect(row!.verification, `${profile} ${key}: "${comment ?? ""}"`).toBe(gradeOfTag(comment ?? ""));
      seen.push(`${profile} ${key}`);
    };
    for (const line of RULESET_SRC.slice(start, end).split("\n")) {
      const oneLine = /^ {2}"([a-z-]+)": \{ (\w+): [^}]*\},\s*$/.exec(line);
      if (oneLine) {
        profile = oneLine[1];
        check(oneLine[2]!, undefined);
        profile = undefined;
        continue;
      }
      const head = /^ {2}"([a-z-]+)": \{\s*$/.exec(line);
      if (head) {
        [profile, table, pending, afterKey] = [head[1], undefined, undefined, false];
        continue;
      }
      if (/^ {2}\},\s*$/.test(line)) {
        [profile, table, pending] = [undefined, undefined, undefined];
        continue;
      }
      const comment = /^\s+\/\/ ?(.*)$/.exec(line);
      if (comment && profile !== undefined) {
        pending = afterKey || pending === undefined ? comment[1] : `${pending} ${comment[1]}`;
        afterKey = false;
        continue;
      }
      const open = /^ {4}(\w+): \{\s*$/.exec(line);
      if (open) {
        [table, pending] = [open[1], undefined];
        continue;
      }
      if (/^ {4}\},\s*$/.test(line)) {
        [table, pending] = [undefined, undefined];
        continue;
      }
      // `key: value, // comment`, split at the `//` (no backtracking regex over the line).
      const slash = line.indexOf("//");
      const code = slash < 0 ? line : line.slice(0, slash);
      const entry = /^ +(\w+): \S/.exec(code);
      if (!entry || !code.trimEnd().endsWith(",") || profile === undefined) continue;
      const key = table !== undefined ? `${table}.${entry[1]}` : entry[1]!;
      if (slash >= 0) {
        check(key, line.slice(slash + 2));
        pending = undefined;
      } else check(key, pending);
      afterKey = true;
    }
    // Every profile row was read, once: none is graded without a source line to hold it to.
    const rows = Object.entries(RULE_PROVENANCE.profiles).flatMap(([p, t]) => Object.keys(t).map((k) => `${p} ${k}`));
    expect([...seen].sort()).toEqual(rows.sort());
  });

  it("every row whose value is null says in its note what null means for that key", () => {
    for (const profile of [undefined, ...LINT_PROFILE_NAMES])
      for (const row of effectiveRuleset(profile).rules)
        if (row.value === null) expect(row.note, `${profile ?? "default"} ${row.key}`).toBeTruthy();
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

  // RM1.6b gave the draft its `$id` (`v0`, GOVERNANCE.md § Compatibility and deprecation, rules 4
  // and 5), so the export names it; before, `id` was `null`. A move to `v1` is its own declaration.
  it("the schema is a v0 draft: its $id is the versioned lint-rules URL, and the export says so", async () => {
    expect(LINT_RULES_SCHEMA_DRAFT.$id).toBe("https://archlang.uk/schemas/lint-rules/v0.schema.json");
    const doc = JSON.parse((await runArch(["lint", "--rules", "--json"])).stdout);
    expect(doc.schema).toEqual({ status: "draft", id: "https://archlang.uk/schemas/lint-rules/v0.schema.json" });
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
    expect(r.stdout).toContain(
      "  minDoubleBedroomAreaM2 = null (off by default; a profile sets it) [convention, default]\n",
    );
  });

  it("a null value is printed with what it means for that key, never as a bare 'off'", async () => {
    for (const profile of [undefined, ...LINT_PROFILE_NAMES]) {
      const r = await runArch(["lint", "--rules", ...(profile ? ["--profile", profile] : [])]);
      for (const row of effectiveRuleset(profile).rules.filter((x) => x.value === null))
        expect(r.stdout, `${profile ?? "default"} ${row.key}`).toContain(`  ${row.key} = null (${row.note}) [`);
      expect(r.stdout).not.toMatch(/ = off\b/);
    }
    const text = (await runArch(["lint", "--rules"])).stdout;
    // `null` here means "the same as exitApproachMm", not "off" (src/lint/ruleset.ts).
    expect(text).toContain("  exitApproachPullMm = null (the same as exitApproachMm) [convention, default]\n");
    expect(text).toContain("  stairMaxPitchRatio = null (no pitch cap by default; a profile sets one) [");
    expect(text).toContain("  minRoomAreaByUseM2.storage = null (exempt, no floor: ");
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
    const r = await runArch(["lint", "--rules", "--profile", "uk-residential-advisor", "--json"]);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/did you mean "uk-residential-advisory"/);
  });
});

/** Every source file under `dir` (`.ts`, `.mts`, `.js`, `.mjs`, `.vue`), as a forward-slash path from the repository root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" || f === "dist" ? [] : sourceFiles(p);
    return /\.(?:m?ts|m?js|vue)$/.test(f) ? [relative(ROOT, p).replace(/\\/g, "/")] : [];
  });
}

/** A static (`from "…provenance.js"`) or dynamic (`import("…provenance.js")`) import of the table. */
const IMPORTS_PROVENANCE = /(?:\bfrom\s*|\bimport\s*\(\s*)["'`][^"'`]*\bprovenance(?:\.[mc]?[jt]s)?["'`]/;

describe("rule provenance — off the compile path", () => {
  // The table is text the browser bundle must not carry (the playground's startup budget), and
  // lint() must not learn it (its return value is pinned by the byte-identity laws). The CLI
  // imports it, and the package entry re-exports `diagnosticRule` alone (RM1.6b: the MCP shim's
  // `rule`, which reads the package entry only). The table's values are `pure`, so a bundle that
  // never calls it drops them: the playground's compiler-path budget measures that.
  it("the import matcher sees both forms", () => {
    expect(IMPORTS_PROVENANCE.test('import { x } from "../lint/provenance.js";')).toBe(true);
    expect(IMPORTS_PROVENANCE.test('const m = await import("./lint/provenance.js");')).toBe(true);
    expect(IMPORTS_PROVENANCE.test('import("archlang/src/lint/provenance")')).toBe(true);
    expect(IMPORTS_PROVENANCE.test('import { x } from "../lint/ruleset.js";')).toBe(false);
  });

  it("no module of src/ outside src/cli/ but the entry's one re-export, and none of playground/src/, imports src/lint/provenance.ts", () => {
    const core = sourceFiles(join(ROOT, "src"));
    const playground = sourceFiles(join(ROOT, "playground", "src"));
    expect(core.length).toBeGreaterThan(100);
    expect(playground.length).toBeGreaterThan(10);
    const importers = [...core, ...playground].filter(
      (f) => f !== "src/lint/provenance.ts" && IMPORTS_PROVENANCE.test(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(importers.sort()).toEqual(["src/cli/commands-analyze.ts", "src/index.ts"]);
    // The entry carries the resolver and nothing else of the table.
    const entry = readFileSync(join(ROOT, "src/index.ts"), "utf8")
      .split("\n")
      .filter((l) => IMPORTS_PROVENANCE.test(l));
    expect(entry).toEqual(['export { diagnosticRule } from "./lint/provenance.js";']);
    // lint() and the projection never import it: the reference beside a diagnostic is `rule-ref.ts`.
    for (const f of ["src/lint.ts", "src/lint/rule-ref.ts", "src/diagnostic-json.ts"])
      expect(IMPORTS_PROVENANCE.test(readFileSync(join(ROOT, f), "utf8")), f).toBe(false);
  });

  it("every table value is built through `pure`, so an unused export costs a bundle nothing", () => {
    const src = readFileSync(join(ROOT, "src/lint/provenance.ts"), "utf8");
    for (const name of ["DEFAULTS", "PROFILES", "admHall", "NO_STORE_AREA", "NO_PASSAGE_AREA", "OFF", "sourceSchema", "LINT_RULES_SCHEMA_DRAFT"])
      expect(src, name).toMatch(new RegExp(`const ${name}(?::[^=]+)? = pure\\(`));
  });
});
