/** rule provenance — every ruleset key has a row, grades match the source tags; lint --rules exports the effective ruleset; off the compile path; a diagnostic's rule (RM1.6b). */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULESET,
  diagnosticRule,
  diagnosticToJson,
  lint,
  LINT_PROFILE_NAMES,
  LINT_PROFILES,
} from "../src/index.js";
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
import { worldFor } from "./helpers/world.js";

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
  // never calls it drops them. A size budget cannot see the table come back (its leak was +3,868 B
  // gzip, inside the first-use headroom), so the playground's startup-chunks e2e
  // (`playground/e2e/preview3d.spec.ts`) fails on any built asset carrying one of the
  // PROVENANCE_SENTINELS below; that bundle check, not a budget, is what replaced the stricter pin.
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
    // CR10: `lintReport` (`src/lint/report.ts`) is `arch lint --json` as data, `rule` included, so
    // it reads the table; it is held off the compile path one hop further below.
    expect(importers.sort()).toEqual(["src/cli/commands-analyze.ts", "src/index.ts", "src/lint/report.ts"]);
    // The report is read by the entry (a re-export the playground never calls) and the CLI alone:
    // no module of the compile path, lint() included, and no playground module reaches it.
    const IMPORTS_REPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)["'`][^"'`]*\blint\/report(?:\.[mc]?[jt]s)?["'`]/;
    const reportImporters = [...core, ...playground].filter(
      (f) => f !== "src/lint/report.ts" && IMPORTS_REPORT.test(readFileSync(join(ROOT, f), "utf8")),
    );
    expect(reportImporters.sort()).toEqual(["src/cli/commands-analyze.ts", "src/index.ts"]);
    for (const f of playground) expect(readFileSync(join(ROOT, f), "utf8"), f).not.toMatch(/\blintReport\b/);
    // The entry carries the resolver and nothing else of the table.
    const entry = readFileSync(join(ROOT, "src/index.ts"), "utf8")
      .split("\n")
      .filter((l) => IMPORTS_PROVENANCE.test(l));
    expect(entry).toEqual(['export { diagnosticRule } from "./lint/provenance.js";']);
    // lint() and the projection never import it: the reference beside a diagnostic is `rule-ref.ts`.
    for (const f of ["src/lint.ts", "src/lint/rule-ref.ts", "src/diagnostic-json.ts"])
      expect(IMPORTS_PROVENANCE.test(readFileSync(join(ROOT, f), "utf8")), f).toBe(false);
  });

  // The call site carries `@__PURE__` too: `pure` is declared in another chunk of `dist/`, and the
  // playground's bundler reads `pure`'s own mark only within one file (measured on RM1.6b's build).
  it("every table value is a marked `pure` call, so an unused export costs a bundle nothing", () => {
    const src = readFileSync(join(ROOT, "src/lint/provenance.ts"), "utf8");
    const names = ["DEFAULTS", "PROFILES", "admHall", "NO_STORE_AREA", "NO_PASSAGE_AREA", "OFF", "sourceSchema"];
    for (const name of [...names, "LINT_RULES_SCHEMA_DRAFT"])
      expect(src, name).toMatch(new RegExp(`const ${name}(?::[^=]+)? = /\\* @__PURE__ \\*/ pure\\(`));
  });

  // The bundle check's strings, the same two as `playground/e2e/preview3d.spec.ts`'s PROVENANCE:
  // code only the table holds, so finding one in a built asset means the table is there. A comment
  // elsewhere is fine (a minifier drops it); code is not, or the e2e would fail on a legitimate hint.
  it("the playground's bundle sentinels are code only in the provenance table", () => {
    const PROVENANCE_SENTINELS = ["Nationally Described Space Standard", "lint-rules/v0"];
    const spec = readFileSync(join(ROOT, "playground/e2e/preview3d.spec.ts"), "utf8");
    expect(spec).toContain(`const PROVENANCE = ${JSON.stringify(PROVENANCE_SENTINELS).replace(/,/g, ", ")};`);
    const table = readFileSync(join(ROOT, "src/lint/provenance.ts"), "utf8");
    const comment = /^\s*(?:\/\/|\/?\*)/;
    for (const m of PROVENANCE_SENTINELS) {
      expect(table, m).toContain(m);
      const elsewhere = [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "playground", "src"))]
        .filter((f) => f !== "src/lint/provenance.ts")
        .flatMap((f) =>
          readFileSync(join(ROOT, f), "utf8")
            .split("\n")
            .filter((l) => l.includes(m) && !comment.test(l))
            .map((l) => `${f}: ${l.trim()}`),
        );
      expect(elsewhere, m).toEqual([]);
    }
  });
});

/** One 2.25 m² room with no use of its own: under the default ruleset's 4 m² generic floor. */
const TINY_ROOM = `plan "Small" {
  wall exterior thickness 200 { (0,0) (1500,0) (1500,1500) (0,1500) close }
  room id=a at (0,0) size 1500x1500 label "Den"
  door id=d0 at (750,1500) width 800 wall exterior hinge left swing in
}
`;

/**
 * Card RM1.6b: a lint diagnostic names the ruleset number it was raised against (`rule`), read
 * where `lint()` ran and attached by `diagnosticToJson`'s third argument. The rule names its key
 * where it pushes the warning, so one code from several keys names the right one.
 */
describe("diagnostic rule (RM1.6b)", () => {
  const twoBed = readFileSync(join(ROOT, "examples/two-bed.arch"), "utf8");

  it("reverse test: W_ROOM_TOO_SMALL from minDoubleBedroomAreaM2 names that key, not the code's per-use floor", () => {
    const ds = lint(twoBed, { profile: "uk-residential-advisory" }).filter((d) => d.code === "W_ROOM_TOO_SMALL");
    expect(ds.length).toBe(1);
    expect(ds[0]!.message).toMatch(/the floor for a double bedroom/);
    const rule = diagnosticRule(ds[0]!)!;
    expect(rule.key).toBe("minDoubleBedroomAreaM2");
    // What a lookup by code and room use would have named: a different key, and a different number.
    expect(rule.key).not.toBe("minRoomAreaByUseM2.bedroom");
    expect(LINT_PROFILES["uk-residential-advisory"]!.minRoomAreaByUseM2?.bedroom).not.toBe(rule.value);
    expect(rule).toEqual({
      profile: "uk-residential-advisory",
      key: "minDoubleBedroomAreaM2",
      value: 11.5,
      units: "m2",
      from: "uk-residential-advisory",
      verification: "V",
      document: "Nationally Described Space Standard",
      clause: "10(d)",
      edition: "2015",
    });
    // The row is the one `lint --rules --profile uk-residential-advisory` prints, after `profile`.
    const row = effectiveRuleset("uk-residential-advisory").rules.find((r) => r.key === rule.key);
    expect({ profile: "uk-residential-advisory", ...row }).toEqual(rule);
  });

  it("the default ruleset's generic floor names minRoomAreaM2, with no profile", () => {
    const [d] = lint(TINY_ROOM).filter((x) => x.code === "W_ROOM_TOO_SMALL");
    expect(diagnosticRule(d!)).toMatchObject({ profile: null, key: "minRoomAreaM2", value: 4, from: "default" });
  });

  it("a diagnostic no ruleset number drives has no rule", () => {
    const ds = lint(TINY_ROOM);
    for (const code of ["W_HABITABLE_NO_WINDOW", "W_ALIAS_MATCH"]) {
      const d = ds.find((x) => x.code === code);
      expect(d, code).toBeDefined();
      expect(diagnosticRule(d!), code).toBeUndefined();
      expect(diagnosticToJson(TINY_ROOM, d!, { rule: diagnosticRule }), code).not.toHaveProperty("rule");
    }
  });

  it("lint() and its JSON.stringify are unchanged: the reference sits beside each diagnostic, never on it", () => {
    for (const d of lint(twoBed, { profile: "uk-residential-advisory" })) {
      expect(Object.getOwnPropertySymbols(d)).toEqual([]);
      expect(JSON.stringify(d)).not.toMatch(/minDoubleBedroomAreaM2|"rule"/);
      // The two-argument projection is the canonical shape; the option only appends `rule`, last.
      const plain = diagnosticToJson(twoBed, d);
      const ruled = diagnosticToJson(twoBed, d, { rule: diagnosticRule });
      expect(plain).not.toHaveProperty("rule");
      expect(diagnosticToJson(twoBed, d, {})).toEqual(plain);
      expect(Object.keys(ruled)).toEqual([...Object.keys(plain), "rule"]);
    }
  });

  it("a copy or a structuredClone of a diagnostic carries no reference (resolve it where lint() ran)", () => {
    const [d] = lint(twoBed, { profile: "uk-residential-advisory" }).filter((x) => x.code === "W_ROOM_TOO_SMALL");
    expect(diagnosticRule(d!)).toBeDefined();
    expect(diagnosticRule(structuredClone(d!))).toBeUndefined();
    expect(diagnosticRule({ ...d! })).toBeUndefined();
  });

  it("a number the caller's own ruleset sets is not the table's, and gets no rule", () => {
    const [d] = lint(TINY_ROOM, { ruleset: { minRoomAreaM2: 3 } }).filter((x) => x.code === "W_ROOM_TOO_SMALL");
    expect(d).toBeDefined();
    expect(diagnosticRule(d!)).toBeUndefined();
  });

  it("lint --json carries the rule", async () => {
    const r = await runArch(["lint", "examples/two-bed.arch", "--profile", "uk-residential-advisory", "--json"]);
    expect(r.status).toBe(0);
    const [d] = JSON.parse(r.stdout).diagnostics;
    expect(d.rule).toMatchObject({ key: "minDoubleBedroomAreaM2", value: 11.5, verification: "V", clause: "10(d)" });
  });
});

/**
 * Which key a rule names, as a table (card RM1.6b, review m2): for each named file and each
 * ruleset lint() runs it under (no profile, then every built-in one), the key every warning of a
 * code names, or `null` for a warning that fires with no `rule`. A string is the key under all six
 * rulesets, each of which raises it; an object lists the rulesets that raise it. A file's row holds
 * every code that names a key under some ruleset, so a new citation here shows up, and the codes
 * listed `null` on purpose: held to two ruleset numbers at once (`W_FLOOR_UNASSIGNED`, a doorway as
 * wide as `minDoorWidthMm` under `W_LEAF_ACROSS_DOORWAY` and `W_STAIR_SIDE_ENTRY`,
 * `W_STAIR_TOO_STEEP`) or driven by no number (`W_CONNECTOR_AMBIGUOUS`; `W_OPENING_AT_JUNCTION`
 * with a wall inside the span). Other codes that never name a key are not listed.
 *
 * The files are a small cover of the corpus's 34 (code, key) pairs, chosen for cost (each runs in
 * tens of milliseconds); `two-bed.arch`'s reverse test is above. Taken from a probe of the corpus
 * at RM1.6b's round 1; why a row is `null` is in a comment where its rule pushes the warning.
 */
type KeyRow = string | null | Readonly<Record<string, string | null>>;
const RULE_KEY_TABLE: Readonly<Record<string, Readonly<Record<string, KeyRow>>>> = {
  "test/defect-corpus/clearances/bed-blocks-alcove.clean.arch": {
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_NARROW: {
      "uk-residential-advisory": "minMainDoubleBedroomShortSideMm",
      "us-residential-advisory": "minRoomShortSideByUseMm.bedroom",
    },
    W_ROOM_TOO_SMALL: {
      "cn-residential-advisory": "minDoubleBedroomAreaM2",
      "uk-residential-advisory": "minDoubleBedroomAreaM2",
    },
  },
  "eval/goldens/dims-auto-cottage.arch": {
    W_DOORWAY_BLOCKED: "doorwayLandingMm",
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_SMALL: {
      "uk-residential-advisory": "minRoomAreaByUseM2.bedroom",
      "us-residential-advisory": "minRoomAreaByUseM2.bedroom",
    },
  },
  "test/defect-corpus/clearances/seat-facing-away.clean.arch": {
    W_EXIT_APPROACH_BLOCKED: { "accessibility-advisory": "exitApproachPullMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
  },
  "test/defect-corpus/clearances/exit-approach-blocked.arch": {
    W_EXIT_APPROACH_BLOCKED: "exitApproachMm",
  },
  "test/defect-corpus/openings-ignore-walls/door-jamb-50-from-tee.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_OPENING_AT_JUNCTION: "minJunctionNibMm",
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
  },
  "test/recovery-corpus/terrace-row.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_HOB_FRIDGE_GAP: "hobLandingMm",
    W_OPENING_AT_JUNCTION: "junctionNibThicknessRatio",
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_WC_SIDE_CLEARANCE: "wcSideClearanceMm",
  },
  "test/defect-corpus/clearances/leaf-across-doorway.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_LEAF_ACROSS_DOORWAY: {
      default: null,
      "residential-basic": null,
      "accessibility-advisory": "doorwayLandingMm",
      "cn-residential-advisory": null,
      "uk-residential-advisory": null,
      "us-residential-advisory": null,
    },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
  },
  "test/defect-corpus/stair-safety/door-onto-flank.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_STAIR_SIDE_ENTRY: {
      default: null,
      "residential-basic": null,
      "accessibility-advisory": "minPathClearWidthMm",
      "cn-residential-advisory": null,
      "uk-residential-advisory": null,
      "us-residential-advisory": null,
    },
  },
  "test/defect-corpus/clearances/hob-against-fridge.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_HOB_FRIDGE_GAP: "hobLandingMm",
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_NARROW: { "us-residential-advisory": "minRoomShortSideByUseMm.living" },
    W_ROOM_TOO_SMALL: { "cn-residential-advisory": "minRoomAreaByUseM2.living" },
  },
  "eval/goldens/two-bed-hall.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_NARROW: {
      "cn-residential-advisory": "minPathClearWidthByUseMm.bedroom",
      "us-residential-advisory": "minRoomShortSideByUseMm.hall",
    },
  },
  "examples/relational.arch": {
    W_DOORWAY_BLOCKED: { "accessibility-advisory": "doorwayLandingMm" },
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_NARROW: {
      "cn-residential-advisory": "minEntryPassageWidthMm",
      "uk-residential-advisory": "minMainDoubleBedroomShortSideMm",
    },
    W_ROOM_TOO_SMALL: { "uk-residential-advisory": "minDoubleBedroomAreaM2" },
  },
  "test/defect-corpus/space-not-enclosed/bath-open-side.arch": {
    W_BOUNDARY_NO_WALL: "maxBoundaryGapMm",
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_NOT_ENCLOSED: "maxUnenclosedMm",
    W_ROOM_TOO_SMALL: { "accessibility-advisory": "minRoomAreaM2" },
    W_SWING_OBSTRUCTED: {
      default: null,
      "residential-basic": null,
      "accessibility-advisory": "swingClearanceMm",
      "cn-residential-advisory": null,
      "uk-residential-advisory": null,
      "us-residential-advisory": null,
    },
  },
  "test/defect-corpus/space-not-enclosed/round-snug-unassigned.arch": {
    W_FLOOR_UNASSIGNED: null,
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_SMALL: {
      "accessibility-advisory": "minRoomAreaM2",
      "cn-residential-advisory": "minRoomAreaByUseM2.living",
      "us-residential-advisory": "minRoomAreaByUseM2.living",
    },
  },
  "test/defect-corpus/openings-ignore-walls/door-on-exterior-tee.arch": {
    W_CONNECTOR_AMBIGUOUS: null,
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_OPENING_AT_JUNCTION: null,
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
  },
  "test/defect-corpus/stair-safety/stair-too-steep.arch": {
    W_DOOR_CLEARANCE: { "accessibility-advisory": "minDoorWidthMm" },
    W_PATH_TOO_NARROW: { "accessibility-advisory": "minPathClearWidthMm" },
    W_ROOM_TOO_SMALL: { "accessibility-advisory": "minRoomAreaM2" },
    W_STAIR_TOO_STEEP: null,
  },
};

describe("diagnostic rule (RM1.6b): the key table", () => {
  const RULESETS: Array<string | undefined> = [undefined, ...LINT_PROFILE_NAMES];
  const name = (p: string | undefined): string => p ?? "default";

  it("covers both exit-approach depths and both nib limbs, and the six rulesets", () => {
    const keys = new Set(
      Object.values(RULE_KEY_TABLE).flatMap((row) =>
        Object.values(row).flatMap((v) => (v === null ? [] : typeof v === "string" ? [v] : Object.values(v))),
      ),
    );
    for (const k of ["exitApproachMm", "exitApproachPullMm", "minJunctionNibMm", "junctionNibThicknessRatio"])
      expect(keys.has(k), k).toBe(true);
    expect(RULESETS.map(name)).toEqual([
      "default",
      "residential-basic",
      "accessibility-advisory",
      "cn-residential-advisory",
      "uk-residential-advisory",
      "us-residential-advisory",
    ]);
  });

  for (const [file, want] of Object.entries(RULE_KEY_TABLE)) {
    it(file, () => {
      const src = readFileSync(join(ROOT, file), "utf8");
      const world = worldFor(dirname(join(ROOT, file)));
      // code → ruleset → the keys its warnings name ("-" for none), joined when they differ.
      const seen = new Map<string, Map<string, string>>();
      for (const p of RULESETS) {
        const per = new Map<string, Set<string>>();
        for (const d of lint(src, { world, profile: p })) {
          const code = d.code ?? "(no code)";
          const s = per.get(code) ?? new Set<string>();
          s.add(diagnosticRule(d)?.key ?? "-");
          per.set(code, s);
        }
        for (const [code, s] of per) {
          const m = seen.get(code) ?? new Map<string, string>();
          m.set(name(p), [...s].sort().join(" + "));
          seen.set(code, m);
        }
      }
      const got: Record<string, KeyRow> = {};
      for (const [code, m] of [...seen].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const cited = [...m.values()].some((v) => v !== "-");
        if (!cited && !(code in want)) continue;
        const vals = new Set(m.values());
        const one = m.size === RULESETS.length && vals.size === 1 ? [...vals][0]! : undefined;
        got[code] =
          one !== undefined
            ? one === "-"
              ? null
              : one
            : Object.fromEntries([...m].map(([p, v]) => [p, v === "-" ? null : v]));
      }
      expect(got).toEqual(want);
    });
  }
});
