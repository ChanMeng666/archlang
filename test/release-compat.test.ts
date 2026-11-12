/**
 * Release compatibility: this checkout against the LAST PUBLISHED `@chanmeng666/archlang` and
 * `@chanmeng666/archlang-mcp`, additive-only, over the four surfaces downstream code is keyed on
 * (public types, MCP tool input schemas, the Plan JSON schema, the error-code set). The logic is
 * `scripts/compat-check.mjs` (also run by hand: `node scripts/compat-check.mjs`); this file runs it
 * in the suite with no build. `public-surface` pins only nameability and `plan-schema-drift` only
 * file == generator; neither sees what the last release promised.
 *
 * Types are compared by variance (inputs may only widen, outputs only narrow). Enum-like sets (a
 * union of literals, an `as const` list, a tagged union's variants) may gain a member in either
 * role, never lose one; a variant on both sides keeps its role's variance; a constant keyed by a
 * set may gain a key, never lose one. A failure is a
 * breaking change: restore the surface, or waive it under CHANGELOG's `## [Unreleased]` with
 * `BREAKING: <surface>: item, item` (or `BREAKING: <surface> (all)`) and plan a MAJOR. It needs the npm registry: offline it skips with
 * the reason locally and fails under `CI`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../packages/mcp/src/server.js";
// @ts-expect-error — a zero-dep .mjs script with no type declarations.
import * as compatModule from "../scripts/compat-check.mjs";
import { ERROR_CODES } from "../src/error-catalog.js";

interface Finding {
  surface: string;
  kind: string;
  name: string;
  path?: string;
  old?: string;
  new?: string;
  role?: string;
  why?: string;
}
interface Check {
  findings: Finding[];
  note?: string;
  skipped?: string;
}
interface Release {
  coreVersion: string;
  mcpVersion: string;
  coreDir: string;
}
const compat = compatModule as {
  loadRelease: () => Release;
  checkPublicTypes: (r: Release) => Check;
  checkMcpSchemas: (r: Release, create: typeof createServer) => Promise<Check>;
  checkPlanSchema: (r: Release) => Promise<Check>;
  checkErrorCodes: (r: Release, codes: readonly string[]) => Promise<Check>;
  repoBreakingLines: () => string[];
  breakingLines: (changelog: string) => string[];
  parseWaiver: (line: string) => { surface: string; all: boolean; items: string[] } | null;
  applyOverrides: (f: Finding[], lines: string[]) => { failures: Finding[]; accepted: (Finding & { by: string })[] };
  formatFinding: (f: Finding) => string;
  typeSurface: (entry: string) => Record<string, Record<string, string>>;
  compareTypeSurfaces: (o: unknown, n: unknown) => Finding[];
  compareMcpTools: (o: unknown, n: unknown) => Finding[];
  compareJsonSchemas: (o: unknown, n: unknown, opts: { surface: string; name: string; path?: string }) => Finding[];
  compareErrorCodes: (o: readonly string[], n: readonly string[]) => Finding[];
};

const TIMEOUT = 180_000;
let release: Release | undefined;
let offline: string | undefined;

beforeAll(() => {
  try {
    release = compat.loadRelease();
  } catch (e) {
    offline = (e as Error).message;
  }
}, TIMEOUT);

/** The release, or a visible skip (locally) / a failure (under CI) when the registry is unreachable. */
function needRelease(ctx: { skip: () => void }): Release {
  if (release) return release;
  const why = `release-compat needs the npm registry to fetch the last published tarballs: ${offline}`;
  if (process.env.CI) expect.fail(why);
  console.warn(`SKIPPED: ${why}`);
  ctx.skip();
  throw new Error("unreachable");
}

/** Assert no unaccepted finding; print what a `BREAKING:` line accepted. */
function expectAdditive(surface: string, check: Check): void {
  if (check.skipped) {
    // A surface the published packages do not carry cannot be compared: say so, loudly.
    console.warn(`release-compat ${surface}: SKIPPED (${check.skipped})`);
    if (process.env.CI) expect.fail(`${surface}: ${check.skipped}`);
    return;
  }
  const { failures, accepted } = compat.applyOverrides(check.findings, compat.repoBreakingLines());
  for (const a of accepted) console.log(`release-compat ${surface}: accepted by "${a.by}": ${compat.formatFinding(a)}`);
  expect(failures.map(compat.formatFinding), `${surface} (${check.note})`).toEqual([]);
}

describe("release compatibility (against the last published release)", () => {
  it(
    "public types: no export removed, no input narrowed or newly required, no output widened",
    (ctx) => {
      const r = needRelease(ctx);
      const check = compat.checkPublicTypes(r);
      expect(check.note).toMatch(/^\d{3,} exports/);
      expectAdditive("public-types", check);
    },
    TIMEOUT,
  );

  it(
    "MCP tool schemas: no tool removed, no input property removed or newly required, no enum narrowed",
    async (ctx) => {
      const r = needRelease(ctx);
      const check = await compat.checkMcpSchemas(r, createServer);
      expect(check.note).toMatch(/^[1-9]\d* tools/);
      expectAdditive("mcp-schemas", check);
    },
    TIMEOUT,
  );

  it(
    "Plan JSON schema: no property removed or newly required, no type or enum narrowed, version unchanged",
    async (ctx) => {
      const r = needRelease(ctx);
      expectAdditive("plan-schema", await compat.checkPlanSchema(r));
    },
    TIMEOUT,
  );

  it(
    "error codes: every published E_*/W_* code still exists",
    async (ctx) => {
      const r = needRelease(ctx);
      const check = await compat.checkErrorCodes(r, ERROR_CODES);
      expect(check.note).toMatch(/^[1-9]\d* codes/);
      expectAdditive("error-codes", check);
    },
    TIMEOUT,
  );
});

describe("release compatibility: the comparisons are not vacuous", () => {
  const dir = mkdtempSync(join(tmpdir(), "archlang-compat-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it(
    "types: inputs may only widen and outputs only narrow, and each finding names its export and role",
    () => {
      const oldDts = join(dir, "old.d.ts");
      const newDts = join(dir, "new.d.ts");
      writeFileSync(
        oldDts,
        [
          "export declare function compileThing(src: string): string;",
          "export declare function keptFn(a: number, opts?: { strict?: boolean }): void;",
          'export type Mode = "fast" | "slow";',
          "export declare function run(mode: Mode): void;",
          "export interface RenderOptions { width: number; label?: string }",
          "export interface Summary { area: number; rooms: string[] }",
          "export declare function measure(): Summary;",
          "export declare function find(id: string): string;",
          "export declare function pick(): string | number;",
          'export declare const KEYWORDS: readonly ["room", "wall"];',
          'export type Shade = "red" | "green";',
          'export type Finish = "matt" | "gloss";',
          'export type Unit = "mm" | "m";',
          "export declare function setUnit(u: Unit): void;",
          'export type Axis = "x" | "y";',
          "export declare function flip(a: Axis): void;",
          "export declare function goneExport(): void;",
        ].join("\n"),
      );
      writeFileSync(
        newDts,
        [
          // A REQUIRED second parameter: breaking.
          "export declare function compileThing(src: string, world: object): string;",
          // Parameter WIDENED (a union, an optional option field, an optional third parameter): passes.
          "export declare function keptFn(a: number | string, opts?: { strict?: boolean; extra?: number }, more?: number): void;",
          // An input (a parameter type of `run`) narrowed: breaking.
          'export type Mode = "fast";',
          "export declare function run(mode: Mode): void;",
          // An input type (by its name) gains a REQUIRED member: breaking; an optional one passes.
          "export interface RenderOptions { width: number; label?: string; added?: boolean; dpi: number }",
          // An output type: a member became optional (breaking); a new member passes.
          "export interface Summary { area?: number; rooms: string[]; extra: boolean }",
          "export declare function measure(): Summary;",
          // Return WIDENED to `| undefined`: breaking.
          "export declare function find(id: string): string | undefined;",
          // Return NARROWED: passes.
          "export declare function pick(): string;",
          'export declare const KEYWORDS: readonly ["room", "door", "wall"];',
          // Enum-like literal unions are append-only sets in BOTH roles (owner ruling on #599):
          // an output gaining a literal passes, losing one fails…
          'export type Shade = "red" | "green" | "blue";',
          'export type Finish = "matt" | "satin";',
          // …and so does an input (a parameter type of setUnit / flip).
          'export type Unit = "mm" | "m" | "cm";',
          "export declare function setUnit(u: Unit): void;",
          'export type Axis = "x" | "z";',
          "export declare function flip(a: Axis): void;",
          "export declare function brandNew(): void;",
        ].join("\n"),
      );
      const types = compat.compareTypeSurfaces(compat.typeSurface(oldDts), compat.typeSurface(newDts));
      const said = types.map(compat.formatFinding).join("\n");
      expect(types.map((f) => `${f.kind} ${f.name}${f.path ? ` ${f.path}` : ""} (${f.role})`).sort(), said).toEqual([
        "enum member removed Axis type (input)",
        "enum member removed Finish type (output)",
        "enum member removed Mode type (input)",
        "member became optional Summary .?area (output)",
        // The same narrowing seen at its use: a one-member alias prints as its literal.
        "narrowed input type run sig0.p0 (input)",
        "new required member RenderOptions .dpi (input)",
        "new required parameter compileThing sig0.required (input)",
        "removed export goneExport (value)",
        "widened output type find sig0.returns (output)",
      ]);
      // The classification each finding used is printed with it, derived from the checker.
      const why = (name: string) => types.find((f) => f.name === name)?.why;
      expect(why("Mode")).toBe("input: a parameter type of run");
      expect(why("RenderOptions")).toBe("input by its name");
      expect(why("Summary")).toBe("output: no exported function takes it");
      expect(said).toContain("(input; input: a parameter type of run)");
    },
    TIMEOUT,
  );

  it(
    "types: a non-exported literal-union alias compares as its literals (and a derived list as the tuple)",
    () => {
      // `KindsWith<"opening">` in `src/elements/facets.ts` is such an alias: a mapped type over a
      // table, not exported from `src/index.ts`, so a consumer reads it as its literals.
      const table = [
        "declare const FLAGS: { a: { f: true }; b: { f: true }; c: { f: false } };",
        "type With<F extends 'f'> = { [K in keyof typeof FLAGS]: (typeof FLAGS)[K][F] extends true ? K : never }[keyof typeof FLAGS];",
      ];
      const write = (name: string, lines: string[]) => {
        const file = join(dir, `${name}.ts`);
        writeFileSync(file, lines.join("\n"));
        return file;
      };
      const literal = write("literal", [
        'export interface Thing { v: "a" | "b"; w: readonly ("a" | "b")[] }',
        'export interface ThingOptions { v: "a" | "b" }',
        'export declare const SCHEMA: { readonly enum: readonly ["a", "b"] };',
      ]);
      const aliased = write("aliased", [
        ...table,
        'type Hidden = "a" | "b";',
        "export interface Thing { v: Hidden; w: readonly With<'f'>[] }",
        "export interface ThingOptions { v: With<'f'> }",
        "export declare const SCHEMA: { readonly enum: readonly With<'f'>[] };",
      ]);
      const narrowed = write("narrowed", [
        'type Hidden = "a";',
        "export interface Thing { v: Hidden; w: readonly Hidden[] }",
        "export interface ThingOptions { v: Hidden }",
        "export declare const SCHEMA: { readonly enum: readonly Hidden[] };",
      ]);
      const a = compat.typeSurface(aliased);
      expect(a.Thing?.[".v"]).toBe('"a" | "b"');
      expect(a.Thing?.[".w"]).toBe('readonly ("a" | "b")[]');
      const l = compat.typeSurface(literal);
      const both = [...compat.compareTypeSurfaces(l, a), ...compat.compareTypeSurfaces(a, l)];
      expect(both.map(compat.formatFinding)).toEqual([]);
      // Not vacuous: the alias losing a literal is still a removed enum member, everywhere.
      const lost = compat.compareTypeSurfaces(a, compat.typeSurface(narrowed));
      expect(lost.map((f) => `${f.kind} ${f.name} ${f.path}`).sort()).toEqual([
        "enum member removed SCHEMA .enum",
        "enum member removed Thing .v",
        "enum member removed Thing .w",
        "enum member removed ThingOptions .v",
      ]);
      const lostTuple = compat.compareTypeSurfaces(l, compat.typeSurface(narrowed));
      expect(lostTuple.map((f) => `${f.kind} ${f.name} ${f.path}`)).toContain("enum member removed SCHEMA .enum[]");
    },
    TIMEOUT,
  );

  it(
    "types: a tagged union's variants are an enum-like set, and a constant keyed by a set may gain keys",
    () => {
      const write = (name: string, lines: string[]) => {
        const file = join(dir, `${name}.d.ts`);
        writeFileSync(file, lines.join("\n"));
        return file;
      };
      const common = [
        'export interface ANode { kind: "a"; x: number }',
        'export interface BNode { kind: "b"; y: string }',
        'export interface CNode { kind: "c" }',
      ];
      const oldDts = write("tagged-old", [
        ...common,
        "export type Node = ANode | BNode | CNode;",
        "export type Gone = ANode | BNode | CNode;",
        'export type Shape = { type: "sq"; side: number } | { type: "circ"; r: number };',
        'export type Cmd = { op: "move"; dx: number } | { op: "stop" };',
        "export declare function send(c: Cmd): void;",
        'export type Keep = { kind: "k"; form: "x"; p: number } | { kind: "k"; form: "y" } | { kind: "z" };',
        'export type Lost = { kind: "k"; form: "x"; p: number } | { kind: "k"; form: "y" } | { kind: "z" };',
        'export type Grow = { kind: "k"; form: "x" } | { kind: "z" };',
        "export type Mixed = { a: number } | { b: string };",
        'export type Dup = { kind: "a"; x: number } | { kind: "a"; y: string };',
        'export interface Holder { node: { tag: "p"; n: number } | { tag: "q" } | undefined }',
        'export declare const STAGES: Readonly<Record<"a" | "b", "x" | "y">>;',
        'export declare const GONE_KEYS: Readonly<Record<"a" | "b", "x">>;',
        'export declare const AXIS: Readonly<{ r: "v" }>;',
      ]);
      const newDts = write("tagged-new", [
        ...common,
        'export interface DNode { kind: "d"; z: boolean }',
        // A variant ADDED: passes (a new element kind is a minor release), output or input.
        "export type Node = ANode | BNode | CNode | DNode;",
        // A variant REMOVED: fails, naming it.
        "export type Gone = ANode | BNode;",
        // A matched variant still keeps the strict variance of its role: an output member widened…
        'export type Shape = { type: "sq"; side: number | string } | { type: "circ"; r: number };',
        // …an input variant gains a required member (its `move` widening and the new `jump` pass).
        'export type Cmd = { op: "move"; dx: number | string } | { op: "stop"; force: boolean } | { op: "jump" };',
        "export declare function send(c: Cmd): void;",
        // Variants sharing a tag are told apart by a further discriminant (`KeepNode`'s `form`).
        'export type Keep = { kind: "k"; form: "x"; p: number } | { kind: "k"; form: "y" } | { kind: "k"; form: "w" } | { kind: "z" };',
        'export type Lost = { kind: "k"; form: "x"; p: number } | { kind: "z" };',
        // A tag that grows a level (`kind="k"` → `kind="k",form="x"`) still names the same variant.
        'export type Grow = { kind: "k"; form: "x" } | { kind: "k"; form: "w" } | { kind: "z" };',
        // Not cleanly discriminated (no shared literal property; a tag two members share): today's widening.
        "export type Mixed = { a: number } | { b: string } | { c: boolean };",
        'export type Dup = { kind: "a"; x: number } | { kind: "a"; y: string } | { kind: "b" };',
        // A spelled-out tagged union in a member: a variant added passes, `undefined` kept.
        'export interface Holder { node: { tag: "p"; n: number } | { tag: "q" } | { tag: "r" } | undefined }',
        // A constant keyed by a set gains a key: passes; loses one: fails.
        'export declare const STAGES: Readonly<Record<"a" | "b" | "c", "x" | "y">>;',
        'export declare const GONE_KEYS: Readonly<Record<"a", "x">>;',
        // A declared literal member type is still compared (unlike an inferred `as const` value).
        'export declare const AXIS: Readonly<{ r: "h" }>;',
      ]);
      const oldS = compat.typeSurface(oldDts);
      const types = compat.compareTypeSurfaces(oldS, compat.typeSurface(newDts));
      const said = types.map(compat.formatFinding).join("\n");
      expect(types.map((f) => `${f.kind} ${f.name}${f.path ? ` ${f.path}` : ""} (${f.role})`).sort(), said).toEqual([
        "enum member removed AXIS .r (output)",
        "narrowed input type Cmd type (input)",
        "removed member GONE_KEYS .b (output)",
        "variant removed Gone type (output)",
        "variant removed Lost type (output)",
        "widened output type Dup type (output)",
        "widened output type Mixed type (output)",
        "widened output type Shape type (output)",
      ]);
      // Each finding names the variant and the classification it used.
      const one = (name: string) => types.find((f) => f.name === name);
      expect(one("Gone")?.old).toBe('kind="c": CNode');
      expect(one("Lost")?.old).toBe('kind="k",form="y": {kind: "k"; form: "y";}');
      expect(one("Shape")?.old).toMatch(/^type="sq": /);
      expect(one("Cmd")?.why).toBe("input: a parameter type of send");
      expect(said).toContain("variant removed: Gone type (output; output: no exported function takes it)");
      // Not vacuous: the union read as tagged, the keyed constant as one member per key.
      expect(Object.keys(oldS.Node ?? {})).toContain("@variantstype");
      expect(Object.keys(oldS.Holder ?? {})).toContain("@variants.node");
      expect(Object.keys(oldS.Mixed ?? {})).not.toContain("@variantstype");
      expect(Object.keys(oldS.STAGES ?? {}).filter((k) => k.startsWith("."))).toEqual([".a", ".b"]);
      // Removing a variant from a member, or a key from a keyed constant, is caught there too.
      const back = compat.compareTypeSurfaces(compat.typeSurface(newDts), oldS);
      expect(back.map((f) => `${f.kind} ${f.name} ${f.path}`)).toEqual(
        expect.arrayContaining([
          "variant removed Holder .node",
          "removed member STAGES .c",
          "variant removed Node type",
          "variant removed Keep type",
          "variant removed Grow type",
        ]),
      );
    },
    TIMEOUT,
  );

  it("schemas and codes: removed, newly required, narrowed and tightened are each reported", () => {
    const str = { type: "string" };
    const mcp = compat.compareMcpTools(
      {
        compile: {
          inputSchema: {
            type: "object",
            properties: { source: str, mode: { type: "string", enum: ["svg", "png"] }, extra: {} },
            required: ["source"],
          },
        },
        lint: { inputSchema: { type: "object", properties: {} } },
        describe: {
          inputSchema: { type: "object" },
          outputSchema: { type: "object", properties: { a: str, b: { type: "integer", minimum: 0 } } },
        },
      },
      {
        compile: {
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              source: { type: "string", maxLength: 1000 },
              mode: { type: "string", enum: ["svg"] },
              extra: str,
            },
            required: ["source", "mode"],
          },
          // An outputSchema that appears passes.
          outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
        },
        describe: {
          inputSchema: { type: "object", properties: { added: str } },
          outputSchema: { type: "object", properties: { b: { type: "integer", minimum: 1 } } },
        },
      },
    );
    expect(mcp.map((f) => `${f.kind} ${f.name}${f.path ?? ""}`).sort()).toEqual([
      "closed additionalProperties compile/",
      "narrowed enum compile/mode",
      "narrowed to a type compile/extra",
      "new required property compile/mode",
      "removed property describe/outputSchema/a",
      "removed tool lint",
      "tightened maxLength compile/source",
      "tightened minimum describe/outputSchema/b",
    ]);

    const plan = compat.compareJsonSchemas(
      { properties: { version: { const: 1 }, rooms: { type: "array" }, id: { type: "string" } } },
      { properties: { version: { const: 2 }, id: { type: "string", pattern: "^[a-z]+$" } } },
      { surface: "plan-schema", name: "plan.schema.json" },
    );
    expect(plan.map((f) => `${f.kind} ${f.path}`).sort()).toEqual([
      "changed const /version",
      "changed pattern /id",
      "removed property /rooms",
    ]);

    expect(compat.compareErrorCodes(["E_A", "W_B", "E_C"], ["E_A", "E_C", "E_D"])).toEqual([
      { surface: "error-codes", kind: "removed code", name: "W_B" },
    ]);
  });

  it("a BREAKING: waiver under [Unreleased] accepts only the items it names, or a surface with (all)", () => {
    const changelog = [
      "# Changelog",
      "## [Unreleased]",
      "### Removed",
      "- BREAKING: public-types: goneExport, `compileThing` — replaced by `brandNew`.",
      "- BREAKING: error-codes (all)",
      "- BREAKING: the `run` tool and `Mode` are gone (prose without a `<surface>:` prefix waives nothing).",
      "## [1.0.0] - 2026-01-01",
      "BREAKING: mcp-schemas (all)",
    ].join("\n");
    const lines = compat.breakingLines(changelog);
    expect(lines).toHaveLength(3);
    expect(compat.parseWaiver(lines[0] ?? "")).toEqual({
      surface: "public-types",
      all: false,
      items: ["goneExport", "compileThing"],
    });
    const findings: Finding[] = [
      { surface: "public-types", kind: "removed export", name: "goneExport" },
      { surface: "public-types", kind: "new required parameter", name: "compileThing" },
      { surface: "public-types", kind: "narrowed input type", name: "Mode" },
      { surface: "error-codes", kind: "removed code", name: "W_B" },
      { surface: "error-codes", kind: "removed code", name: "W_C" },
      { surface: "mcp-schemas", kind: "removed tool", name: "run" },
    ];
    const { failures, accepted } = compat.applyOverrides(findings, lines);
    expect(accepted.map((a) => a.name)).toEqual(["goneExport", "compileThing", "W_B", "W_C"]);
    // `Mode` and `run` appear only in prose, and the `(all)` for mcp-schemas is an old release's.
    expect(failures.map((f) => f.name)).toEqual(["Mode", "run"]);
  });
});
