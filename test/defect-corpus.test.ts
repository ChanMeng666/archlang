import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { compile, ERROR_CATALOG, LINT_PROFILE_NAMES, lint } from "../src/index.js";

/**
 * The defect corpus (`test/defect-corpus/`, card PS1.1 of `docs/plans/plan-soundness/README.md`).
 *
 * Every case is a minimal plan holding one verified defect, with a header naming the `W_*` code
 * that must report it, and a clean twin that differs only in the fix. Everything this test checks
 * is read from the files and from the folder's README (the class slugs and the code tables), never
 * retyped here. The README states the header scheme and what is asserted.
 *
 * A `todo` case is the red half of the guard: its code is not asserted present. It IS asserted
 * absent, so a rule that starts catching it turns this test red until the header says `done`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "defect-corpus");
const README = readFileSync(join(ROOT, "README.md"), "utf8");

/** The rows of the README table that follows `heading`, as arrays of trimmed cells. */
function tableAfter(heading: string): string[][] {
  const at = README.indexOf(`\n${heading}\n`);
  if (at < 0) throw new Error(`README.md has no "${heading}" heading`);
  const lines = README.slice(at + heading.length + 2).split("\n");
  const start = lines.findIndex((l) => l.startsWith("|"));
  const rows: string[][] = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim()),
    );
  }
  // Header row, then the `|---|` rule, then the body.
  return rows.slice(2);
}

/** The backticked first cell of every body row of the table under `heading`. */
function firstColumn(heading: string): string[] {
  return tableAfter(heading).map((row) => {
    const m = /^`([^`]+)`$/.exec(row[0] ?? "");
    if (!m) throw new Error(`README.md "${heading}": first cell "${row[0]}" is not one backticked name`);
    return m[1]!;
  });
}

const CLASSES = firstColumn("## Classes");
const LISTED_CODES = [...firstColumn("## Codes named by the plan (PS2 table)"), ...firstColumn("## Proposed codes")];

type Header = Record<string, string>;

/** The leading `# key: value` block; `#` + two or more spaces continues the previous value. */
function parseHeader(src: string): Header {
  const out: Header = {};
  let last: string | null = null;
  for (const line of src.split(/\r?\n/)) {
    if (!line.startsWith("#")) break;
    const kv = /^# ([a-z-]+): (.+)$/.exec(line);
    const more = /^# {2,}(\S.*)$/.exec(line);
    if (kv) {
      if (kv[1]! in out) throw new Error(`duplicate header key "${kv[1]}"`);
      out[kv[1]!] = kv[2]!.trim();
      last = kv[1]!;
    } else if (more && last) out[last] += ` ${more[1]!.trim()}`;
    else throw new Error(`malformed header line: ${line}`);
  }
  return out;
}

interface CaseFile {
  /** `<class>/<file>` */
  path: string;
  cls: string;
  /** The file name without `.arch` (a twin keeps its `.clean`). */
  name: string;
  twin: boolean;
  src: string;
  header: Header;
}

const FILES: CaseFile[] = readdirSync(ROOT)
  .filter((d) => statSync(join(ROOT, d)).isDirectory())
  .sort()
  .flatMap((cls) =>
    readdirSync(join(ROOT, cls))
      .filter((f) => f.endsWith(".arch"))
      .sort()
      .map((f) => {
        const src = readFileSync(join(ROOT, cls, f), "utf8");
        return {
          path: `${cls}/${f}`,
          cls,
          name: f.slice(0, -".arch".length),
          twin: f.endsWith(".clean.arch"),
          src,
          header: parseHeader(src),
        };
      }),
  );
const CASES = FILES.filter((f) => !f.twin);
const TWINS = FILES.filter((f) => f.twin);
const caseByName = new Map(CASES.map((c) => [`${c.cls}/${c.name}`, c]));

/** `lint()` codes and compile errors, computed once per file. */
const RESULTS = new Map(
  FILES.map((f) => [
    f.path,
    {
      errors: compile(f.src)
        .diagnostics.filter((d) => d.severity === "error")
        .map((d) => d.code),
      codes: new Set(lint(f.src).map((d) => d.code)),
    },
  ]),
);
const result = (f: CaseFile) => RESULTS.get(f.path)!;

describe("defect corpus: shape", () => {
  it("covers every README class, and only those, with at least 40 cases in all", () => {
    expect(CLASSES.length).toBe(8);
    expect([...new Set(FILES.map((f) => f.cls))].sort()).toEqual([...CLASSES].sort());
    for (const cls of CLASSES) expect(CASES.filter((c) => c.cls === cls).length, cls).toBeGreaterThan(0);
    expect(CASES.length).toBeGreaterThanOrEqual(40);
  });

  it("pairs every case with a twin and every twin with a case", () => {
    for (const c of CASES) expect(existsSync(join(ROOT, c.cls, `${c.name}.clean.arch`)), c.path).toBe(true);
    for (const t of TWINS) expect(caseByName.has(`${t.cls}/${t.name.replace(/\.clean$/, "")}`), t.path).toBe(true);
  });

  it("lists every code that is not catalogued yet, and uses every code it lists", () => {
    const expected = new Set(CASES.map((c) => c.header.expect!));
    for (const code of expected) {
      if (!(code in ERROR_CATALOG))
        expect(LISTED_CODES, `${code} is neither catalogued nor listed in README.md`).toContain(code);
    }
    for (const code of LISTED_CODES)
      expect([...expected], `README.md lists ${code} but no case expects it`).toContain(code);
  });
});

describe.each(CASES.map((c) => [c.path, c] as const))("defect case %s", (_path, c) => {
  it("has a well-formed header", () => {
    expect(Object.keys(c.header).sort()).toEqual(["class", "expect", "fact", "origin", "status"]);
    expect(c.header.class).toBe(c.cls);
    expect(c.header.expect).toMatch(/^W_[A-Z0-9_]+$/);
    expect(["todo", "done"]).toContain(c.header.status);
    expect(c.header.origin!.length).toBeGreaterThan(0);
    expect(c.header.fact!.length).toBeGreaterThan(0);
    // `done` means an existing rule reports it, so the code must be in the catalogue.
    if (c.header.status === "done") expect(Object.keys(ERROR_CATALOG)).toContain(c.header.expect);
  });

  it("compiles without errors", () => {
    expect(result(c).errors).toEqual([]);
  });

  it(c.header.status === "done" ? "is reported by its code" : "is not reported yet (status todo)", () => {
    const fired = result(c).codes.has(c.header.expect!);
    expect(fired, `${c.path}: ${c.header.expect} ${fired ? "fires, so mark it done" : "does not fire"}`).toBe(
      c.header.status === "done",
    );
  });
});

describe.each(TWINS.map((t) => [t.path, t] as const))("clean twin %s", (_path, t) => {
  const of = caseByName.get(`${t.cls}/${t.name.replace(/\.clean$/, "")}`);

  it("has a well-formed header", () => {
    expect(Object.keys(t.header).sort()).toEqual(["class", "expect", "fact", "origin", "twin-of"]);
    expect(t.header.class).toBe(t.cls);
    expect(t.header["twin-of"]).toBe(t.name.replace(/\.clean$/, ""));
    expect(t.header.expect).toBe("none");
  });

  it("compiles without errors", () => {
    expect(result(t).errors).toEqual([]);
  });

  it("does not raise its case's code", () => {
    expect(of, "the case this twin belongs to").toBeDefined();
    expect([...result(t).codes]).not.toContain(of!.header.expect);
  });

  it("does not raise its case's code under any profile, but where the ledger says why", () => {
    const raised = LINT_PROFILE_NAMES.filter((p) =>
      lint(t.src, { profile: p }).some((d) => d.code === of!.header.expect),
    );
    expect(raised).toEqual(Object.keys(PROFILE_LEDGER[`${t.cls}/${t.name}`] ?? {}));
  });
});

/**
 * Twins that raise their case's code under a STRICTER profile than the default the case was fixed
 * against, each with why the profile is right to: the twin is the default's fix, and the profile
 * asks more (PR #280 extended the twin check to every profile and found these three; none is a
 * stair twin). Checked both ways: a row whose twin no longer raises the code fails too.
 */
const PROFILE_LEDGER: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "clearances/bed-blocks-alcove.clean": {
    "accessibility-advisory":
      "its walk squeezes to 800 mm through the alcove opening: over the default 700, under the profile's 900",
  },
  "clearances/masked-route-balcony-door.clean": {
    "accessibility-advisory":
      "its walk squeezes to 740 mm through the laundry door: over the default 700, under the profile's 900",
  },
  "clearances/wc-side-clearance.clean": {
    "accessibility-advisory":
      "its WC centreline stands 400 mm from the basin: the default's figure, not the profile's 450",
  },
};

afterAll(() => {
  const caught = (c: CaseFile) => result(c).codes.has(c.header.expect!);
  const line = (label: string, cs: CaseFile[]) => `${label}: ${cs.filter(caught).length}/${cs.length}`;
  const lines = CLASSES.map((cls) =>
    line(
      cls,
      CASES.filter((c) => c.cls === cls),
    ),
  );
  console.log(`defect-corpus catch rate\n  ${[...lines, line("overall", CASES)].join("\n  ")}`);
});
