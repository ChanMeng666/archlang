import { readFileSync, readdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe as suite, expect, it } from "vitest";
import {
  compile,
  describe as describePlan,
  FINISH_STAGES,
  FINISH_STAGES_AVAILABLE,
  finish,
  format,
  lint,
  type FinishResult,
} from "../src/index.js";
import { parse } from "../src/parser.js";
import { sourceConflicts } from "../src/repair.js";
import { PAPER_SIZES } from "../src/sheet.js";
import type { World } from "../src/world.js";
import { AUTHORS_HEIGHT, BASELINE, SEMANTIC_BASELINE } from "./byte-identity-baseline.js";
import { type CompilerApi, allStoreysDigestWith, semanticDigestWith } from "./byte-identity-digest.js";
import { heightFreeSource } from "./height-free-source.js";

/**
 * `finish()` — the sheet stage (`docs/adr/0024-finish-as-explicit-transform.md`). The
 * furnish stage is pinned in `test/finish-furnish.test.ts`; the laws over the examples
 * below run both stages, and a case about one sheet decision asks for `only: "sheet"`.
 *
 * The six laws are named in the suite titles below. The corpus is every shipped example,
 * read from the directory rather than listed, so a new example is covered without an edit
 * here; the generated corpus is in `test/fuzz.test.ts`.
 */

const EXAMPLES = resolvePath("examples");
const world: World = {
  read: (p) => {
    try {
      return readFileSync(resolvePath(EXAMPLES, p), "utf8");
    } catch {
      return null;
    }
  },
  now: () => new Date(0),
};
const NAMES = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith(".arch"))
  .map((f) => f.slice(0, -".arch".length))
  .sort();
const srcOf = (name: string): string => readFileSync(join(EXAMPLES, `${name}.arch`), "utf8");

/** compile + lint diagnostic codes as a multiset — re-derived here, not read from `finish`. */
function codes(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of [...compile(src, { world, noCache: true }).diagnostics, ...lint(src, { world })])
    out.set(d.code ?? "", (out.get(d.code ?? "") ?? 0) + 1);
  return out;
}
const errorsOf = (src: string): string[] =>
  compile(src, { world, noCache: true })
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
const OVERFLOW = ["W_SCALE_OVERFLOW", "W_DRAWING_OVERFLOW"];
const overflows = (src: string): string[] => OVERFLOW.filter((c) => codes(src).has(c));
const wroteSheet = (r: FinishResult): boolean =>
  r.changes.some((c) => c.statement === "paper" || c.statement === "scale");

/** Is `a` a subsequence of `b`? Every authored byte survives, in order, when nothing is replaced. */
function isSubsequence(a: string, b: string): boolean {
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
  return i === a.length;
}

const SHELL = `  wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }
  room id=r at (0,0) size 6000x4000 label "Room" uses living
  door id=d on w at 60% width 900 swing in
  window id=win on w at 10% width 1500`;
const BARE = `plan "Bare" {\n  units mm\n  grid 50\n  north up\n${SHELL}\n}\n`;

suite("finish — the corpus is not empty", () => {
  it("reads every shipped example, and most of them have something to add", () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(30);
    const changed = NAMES.filter((n) => finish(srcOf(n), { world }).changed);
    expect(changed.length).toBeGreaterThan(NAMES.length / 2);
  }, 120000);
});

suite("finish law 1 — fixpoint: finishing a finished plan changes nothing", () => {
  for (const name of NAMES)
    it(`${name}: finish(finish(s)) === finish(s), with and without reissue`, () => {
      for (const reissue of [false, true]) {
        const once = finish(srcOf(name), { world, reissue });
        const twice = finish(once.source, { world, reissue });
        expect(twice.source).toBe(once.source);
        expect(twice.changed).toBe(false);
        expect(twice.changes).toEqual([]);
        expect(once.unresolved.map((u) => u.reason).join("\n")).not.toContain("did not settle");
      }
    }, 120000);
});

suite("finish law 2 — never worse: no error and no new diagnostic code", () => {
  for (const name of NAMES)
    it(`${name}: the result compiles and raises no code the input did not`, () => {
      const src = srcOf(name);
      for (const reissue of [false, true]) {
        const r = finish(src, { world, reissue });
        expect(errorsOf(r.source)).toEqual([]);
        const before = codes(src);
        const gained = [...codes(r.source)].filter(([c, n]) => n > (before.get(c) ?? 0)).map(([c]) => c);
        expect(gained, `finish${reissue ? " --reissue" : ""} added diagnostics to ${name}`).toEqual([]);
        const was = sourceConflicts(src, { world }).conflicts;
        const now = [...sourceConflicts(r.source, { world }).conflicts.keys()].filter((k) => !was.has(k));
        expect(now).toEqual([]);
        expect(r.unresolved.map((u) => u.reason).join("\n")).not.toContain("rolled back");
      }
    }, 120000);

  it("rolls the whole stage back when the result would not compile, and says why", () => {
    // `north` and its value on two lines: the settings run ends on `north`, so the insert
    // lands between the keyword and its argument. The check has to catch that.
    const src = `plan "Wrapped" {\n  units mm\n  north\n  up\n${SHELL}\n}\n`;
    expect(errorsOf(src)).toEqual([]);
    const r = finish(src, { only: "sheet" });
    expect(r.source).toBe(src);
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
    expect(r.unresolved.map((u) => u.reason).join("\n")).toContain("rolled back");
  });
});

suite("finish law 3 — an already-sheeted plan is a byte no-op for the sheet stage", () => {
  const SHEETED = NAMES.filter((n) => {
    const s = srcOf(n);
    return ["paper ", "scale ", "schedule ", "legend", "title "].every((w) => new RegExp(`^\\s*${w}`, "m").test(s));
  });

  it("some shipped example carries every sheet statement (the law is not vacuous)", () => {
    expect(SHEETED.length).toBeGreaterThan(0);
  });

  for (const name of SHEETED)
    it(`${name}: comes back byte-identical, changed: false`, () => {
      const src = srcOf(name);
      const r = finish(src, { world, only: "sheet" });
      expect(r.source).toBe(src);
      expect(r.changed).toBe(false);
      expect(r.changes).toEqual([]);
      expect(finish(src, { world }).changes.filter((c) => c.stage === "sheet")).toEqual([]);
    });

  it("a multi-storey plan that finish has completed is a byte no-op, pages and all", () => {
    for (const name of ["two-storey", "townhouse"]) {
      const done = finish(srcOf(name), { world }).source;
      expect(compile(done, { world, noCache: true }).pages?.length).toBeGreaterThan(1);
      const again = finish(done, { world });
      expect(again.source).toBe(done);
      expect(again.changed).toBe(false);
      expect(again.unresolved.filter((u) => u.stage === "sheet")).toEqual([]);
    }
  });
});

suite("finish law 4 — no core path moved: every example renders, describes and lints as before", () => {
  const API: CompilerApi = { compile, describe: describePlan, lint };
  const authorsHeight = new Set(AUTHORS_HEIGHT);
  const measured = (name: string): string => (authorsHeight.has(name) ? heightFreeSource(srcOf(name)) : srcOf(name));

  it("covers the whole baseline", () => {
    expect(BASELINE.length).toBe(30);
    expect(SEMANTIC_BASELINE.length).toBe(30);
  });

  for (const [name, sha] of BASELINE)
    it(`${name}: SHA-256 of every storey's SVG + describe() + lint() is the pinned one`, () => {
      // Finishing first is the point: a transform that left state behind in a stage memo
      // would move the digest of the plan it was called on.
      finish(srcOf(name), { world, reissue: true });
      expect(allStoreysDigestWith(API, measured(name), { world })).toBe(sha);
    }, 120000);

  for (const [name, sha] of SEMANTIC_BASELINE)
    it(`${name}: describe() + lint() are the pinned ones`, () => {
      expect(semanticDigestWith(API, measured(name), { world })).toBe(sha);
    });
});

suite("finish law 5 — a sheet finish wrote holds the drawing", () => {
  for (const name of NAMES)
    it(`${name}: no W_SCALE_OVERFLOW / W_DRAWING_OVERFLOW once finish has written paper or scale`, () => {
      const r = finish(srcOf(name), { world });
      if (wroteSheet(r)) expect(overflows(r.source)).toEqual([]);
      // Without `reissue` an authored sheet is kept, so an overflow can only be one the
      // input already had — and then it is reported, never passed over in silence.
      if (overflows(r.source).length > 0) {
        expect(overflows(srcOf(name))).toEqual(overflows(r.source));
        expect(r.unresolved.some((u) => u.reason.includes("--reissue"))).toBe(true);
      }
    }, 120000);

  for (const name of NAMES)
    it(`${name}: with reissue no example is left overflowing`, () => {
      expect(overflows(finish(srcOf(name), { world, reissue: true }).source)).toEqual([]);
    }, 120000);

  it("the shipped corpus exercises both halves (some example overflows as authored)", () => {
    expect(NAMES.filter((n) => overflows(srcOf(n)).length > 0).length).toBeGreaterThan(0);
  });
});

suite("finish law 6 — a source that does not compile is returned untouched", () => {
  for (const [what, src] of [
    ["a parse error", `plan "X" {\n  units mm\n  room at (0,0) size\n}\n`],
    [
      "a resolve error",
      `plan "X" {\n  units mm\n  room id=a at (0,0) size 0x0\n  door on nowhere at 50% width 900\n}\n`,
    ],
    ["no plan at all", "this is not a plan"],
    ["the empty string", ""],
  ] as const)
    it(`${what}`, () => {
      expect(errorsOf(src).length).toBeGreaterThan(0);
      const r = finish(src, { reissue: true });
      expect(r.source).toBe(src);
      expect(r.changed).toBe(false);
      expect(r.changes).toEqual([]);
      expect(r.unresolved.length).toBeGreaterThan(0);
    });
});

suite("finish — fill only what is missing, delete nothing", () => {
  it("a bare plan gains all six statements, on a sheet it fits", () => {
    const r = finish(BARE, { only: "sheet" });
    expect(r.changes.map((c) => c.statement)).toEqual(["paper", "scale", "dims", "schedule", "legend", "title"]);
    expect(r.changes.every((c) => c.kind === "added" && c.stage === "sheet")).toBe(true);
    expect(r.source).toContain("  paper A4 landscape\n  scale 1:50\n  dims auto all\n  schedule rooms\n  legend\n");
    expect(r.source).toContain(`  title { project "Bare" }\n}\n`);
    expect(describePlan(r.source).sheet).toEqual({
      paper: "A4",
      orientation: "landscape",
      scale_denominator: 50,
      scale_auto: false,
      fits: true,
    });
  });

  for (const name of NAMES)
    it(`${name}: every authored byte survives, in order`, () => {
      const src = srcOf(name);
      const r = finish(src, { world });
      expect(isSubsequence(src, r.source)).toBe(true);
      for (const line of src.split("\n")) if (line.trim().startsWith("#")) expect(r.source).toContain(line);
    });

  it("the title block invents no date and no author: the project is the plan's own name", () => {
    const r = finish(BARE);
    const title = r.changes.find((c) => c.statement === "title")!;
    expect(title.text).toBe(`title { project "Bare" }`);
    expect(r.source).not.toMatch(/drawn_by|date /);
  });

  it("an authored title, dim, axes and north are left exactly as written", () => {
    const src = `plan "Kept" {
  units mm
  north right
${SHELL}
  axes { x at 0, 6000 y at 0, 4000 }
  dim (0,-100)->(6000,-100) offset 300
  title { drawn_by "Someone" }
}
`;
    const r = finish(src);
    expect(isSubsequence(src, r.source)).toBe(true);
    expect(r.changes.map((c) => c.statement)).not.toContain("title");
    expect(r.changes.map((c) => c.statement)).not.toContain("dims");
    expect(r.source).toContain(`title { drawn_by "Someone" }`);
    expect(r.source).not.toContain("dims auto");
    expect(r.unresolved.some((u) => u.statement === "dims" && u.reason.includes("hand-written"))).toBe(true);
  });

  it("a plan with no name gets no title block, and says so", () => {
    const r = finish(BARE.replace(`"Bare"`, `""`));
    expect(r.changes.map((c) => c.statement)).not.toContain("title");
    expect(r.unresolved.some((u) => u.statement === "title")).toBe(true);
  });

  it("keeps the file's own line endings and indentation", () => {
    const crlf = BARE.replace(/\n/g, "\r\n").replace(/^ {2}/gm, "\t");
    const r = finish(crlf);
    expect(r.changed).toBe(true);
    expect(r.source.replace(/\r\n/g, "")).not.toContain("\n");
    expect(r.source).toContain("\tpaper A4 landscape\r\n\tscale 1:50\r\n");
    expect(r.source).toContain(`\ttitle { project "Bare" }\r\n}`);
  });

  it("finishes a plan written on one line", () => {
    const src = `plan "One" { units mm ${SHELL.replace(/\n\s*/g, " ")} }`;
    const r = finish(src);
    expect(r.changed).toBe(true);
    expect(errorsOf(r.source)).toEqual([]);
    expect(isSubsequence(src, r.source)).toBe(true);
    expect(finish(r.source).source).toBe(r.source);
  });

  it("puts `paper` on the line above an authored `scale`, and `scale` below an authored `paper`", () => {
    const withScale = finish(BARE.replace("  north up\n", "  scale 1:100   # issued scale\n  north up\n"));
    expect(withScale.source).toContain("  paper A4 landscape\n  scale 1:100   # issued scale\n");
    expect(withScale.changes.map((c) => c.statement)).not.toContain("scale");
    const withPaper = finish(BARE.replace("  north up\n", "  paper A3   # the office plotter\n  north up\n"));
    expect(withPaper.source).toContain("  paper A3   # the office plotter\n  scale 1:50\n");
    expect(withPaper.changes.map((c) => c.statement)).not.toContain("paper");
  });
});

suite("finish — choosing the sheet", () => {
  const plan = (w: number, h: number): string =>
    `plan "P" {\n  units mm\n  wall id=w exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }\n  room id=r at (0,0) size ${w}x${h} label "Hall" uses living\n}\n`;
  const sheetOf = (src: string) => describePlan(finish(src).source).sheet;

  it("picks the finest scale before the smallest sheet, and A0 only when A4–A1 hold nothing", () => {
    const sizes: string[] = [];
    for (const w of [5000, 12000, 30000, 60000, 150000, 400000]) {
      const sheet = sheetOf(plan(w, Math.round(w * 0.6)))!;
      expect(sheet.fits && sheet.drawing_fits !== false, `${w} mm`).toBe(true);
      sizes.push(`${sheet.paper} 1:${sheet.scale_denominator}`);
    }
    // 1:50 is kept for as long as any sheet up to A1 holds it; A0 never appears before 1:500 does.
    expect(sizes[0]).toBe("A4 1:50");
    expect(sizes.filter((s) => s.endsWith("1:50")).length).toBeGreaterThan(1);
    const firstA0 = sizes.findIndex((s) => s.startsWith("A0"));
    if (firstA0 >= 0)
      for (const s of sizes.slice(0, firstA0)) expect(PAPER_SIZES.slice(0, 4)).toContain(s.split(" ")[0]);
  });

  it("prefers landscape on a tie and portrait only when landscape does not hold the drawing", () => {
    expect(sheetOf(plan(6000, 4000))).toMatchObject({ paper: "A4", orientation: "landscape" });
    expect(sheetOf(plan(3000, 7000))).toMatchObject({ paper: "A4", orientation: "portrait" });
  });

  it("uses `dims auto overall` when the short facade is under 60 mm on paper, `all` otherwise", () => {
    const narrow = finish(plan(9000, 2500)); // 2700 mm outer at 1:50 = 54 mm
    expect(narrow.changes.find((c) => c.statement === "dims")?.text).toBe("dims auto overall");
    const wide = finish(plan(9000, 4000));
    expect(wide.changes.find((c) => c.statement === "dims")?.text).toBe("dims auto all");
  });

  it("reports, and adds no paper, when nothing up to A0 at 1:500 holds the drawing", () => {
    const r = finish(plan(900000, 700000));
    expect(r.changes.map((c) => c.statement)).not.toContain("paper");
    expect(r.changes.map((c) => c.statement)).not.toContain("scale");
    expect(r.unresolved.some((u) => u.statement === "paper")).toBe(true);
    expect(finish(r.source).source).toBe(r.source);
  });

  it("sizes a multi-storey plan for the largest storey, not the first", () => {
    const storey = (n: number, w: number, h: number): string =>
      `  level ${n} {\n    wall id=w exterior thickness 200 { (0,0) (${w},0) (${w},${h}) (0,${h}) close }\n    room id=r at (0,0) size ${w}x${h} label "Floor" uses living\n  }\n`;
    const small = `plan "Tower" {\n  units mm\n${storey(1, 6000, 4000)}${storey(2, 6000, 4000)}}\n`;
    const grown = `plan "Tower" {\n  units mm\n${storey(1, 6000, 4000)}${storey(2, 30000, 20000)}}\n`;
    const a = finish(small);
    const b = finish(grown);
    expect(describePlan(a.source).sheet).toMatchObject({ paper: "A4", scale_denominator: 50 });
    const sheet = describePlan(b.source).sheet!;
    expect(`${sheet.paper} 1:${sheet.scale_denominator}`).not.toBe("A4 1:50");
    expect(sheet.fits && sheet.drawing_fits !== false).toBe(true);
    expect(overflows(b.source)).toEqual([]);
    expect(compile(b.source, { noCache: true }).pages?.length).toBe(2);
  });
});

suite("finish — an authored sheet is kept unless reissue is asked for", () => {
  // 20 × 14 m on A4 at 1:50: it cannot fit.
  const TIGHT = `plan "Tight" {
  units mm
  paper A4 landscape
  scale 1:50
  wall id=w exterior thickness 200 { (0,0) (20000,0) (20000,14000) (0,14000) close }
  room id=r at (0,0) size 20000x14000 label "Hall" uses living
}
`;

  it("without reissue nothing is added and the misfit is reported", () => {
    const r = finish(TIGHT, { only: "sheet" });
    expect(r.source).toBe(TIGHT);
    expect(r.changed).toBe(false);
    expect(r.unresolved.some((u) => u.statement === "paper" && u.reason.includes("--reissue"))).toBe(true);
  });

  it("reissue keeps the authored scale when a larger sheet holds it, and replaces only paper", () => {
    const r = finish(TIGHT, { reissue: true });
    const replaced = r.changes.filter((c) => c.kind === "replaced");
    expect(replaced.map((c) => c.statement)).toEqual(["paper"]);
    expect(replaced[0]!.from).toBe("paper A4 landscape");
    expect(r.source).toContain("scale 1:50");
    expect(overflows(r.source)).toEqual([]);
    expect(finish(r.source, { reissue: true }).source).toBe(r.source);
  });

  it("reissue replaces paper and scale — and no other authored statement — when no sheet holds the scale", () => {
    const src = TIGHT.replace("scale 1:50", "scale 1:5").replace(
      /}\n$/,
      `  title { drawn_by "A" }\n  dims auto walls\n}\n`,
    );
    const r = finish(src, { reissue: true });
    expect(
      r.changes
        .filter((c) => c.kind === "replaced")
        .map((c) => c.statement)
        .sort(),
    ).toEqual(["paper", "scale"]);
    expect(r.source).toContain(`title { drawn_by "A" }`);
    expect(r.source).toContain("dims auto walls");
    expect(overflows(r.source)).toEqual([]);
  });

  it("gives up the margin tables before the authored sheet, and names what it left out", () => {
    const r = finish(srcOf("furnished-flat"), { world });
    expect(r.changes.map((c) => c.statement)).not.toContain("legend");
    expect(r.unresolved.some((u) => u.statement === "legend" && u.reason.includes("--reissue"))).toBe(true);
    expect(overflows(r.source)).toEqual([]);
  });
});

suite("finish — stages", () => {
  it("declares sheet and furnish, and implements both", () => {
    expect([...FINISH_STAGES]).toEqual(["sheet", "furnish"]);
    expect([...FINISH_STAGES_AVAILABLE].sort()).toEqual([...FINISH_STAGES].sort());
  });

  it("`only: sheet` writes no furniture, and `only: furnish` no sheet statement", () => {
    const sheet = finish(BARE, { only: "sheet" });
    expect(sheet.changed).toBe(true);
    expect(sheet.changes.every((c) => c.stage === "sheet" && c.statement !== "furniture")).toBe(true);
    const furnish = finish(BARE, { only: "furnish" });
    expect(furnish.changed).toBe(true);
    expect(furnish.changes.every((c) => c.stage === "furnish" && c.statement === "furniture")).toBe(true);
  });

  it("a stage this version does not know changes nothing and says so", () => {
    const r = finish(BARE, { only: "landscape" as never });
    expect(r.source).toBe(BARE);
    expect(r.changed).toBe(false);
    expect(r.unresolved[0]!.reason).toContain("not available");
  });

  it("is deterministic", () => {
    expect(finish(BARE)).toEqual(finish(BARE));
  });
});

suite("finish — where the statements land (edge layouts)", () => {
  const trailingBlanks = (s: string): string[] => s.split(/\r?\n/).filter((l) => /[ \t]$/.test(l));
  const EDGES: Record<string, string> = {
    "paper is the last leading setting": `plan "Last" {\n  units mm\n  north up\n  paper A3\n${SHELL}\n}\n`,
    "a setting on the brace line": `plan "X" { paper A4 landscape\n  units mm\n${SHELL}\n}\n`,
    "a statement on the brace line": `plan "Y" { wall id=w exterior thickness 200 { (0,0) (6000,0) (6000,4000) (0,4000) close }\n  room id=r at (0,0) size 6000x4000 label "Room" uses living\n}\n`,
    "one line": `plan "One" { units mm ${SHELL.replace(/\n\s*/g, " ")} }`,
    "an empty body": `plan "E" {}`,
    "an empty body with a blank": `  plan "E" { }\n`,
    "an empty body over two lines": `plan "E" {\n}\n`,
  };

  it("`scale` is the line directly below its `paper`, before the other settings", () => {
    const r = finish(EDGES["paper is the last leading setting"]!);
    expect(r.source).toContain("  paper A3\n  scale 1:50\n  dims auto all\n  schedule rooms\n  legend\n");
  });

  it("settings follow the authored leading settings when one sits on the brace line", () => {
    const r = finish(EDGES["a setting on the brace line"]!);
    expect(r.source).toContain(`plan "X" { paper A4 landscape\n  scale 1:50\n  units mm\n  dims auto all\n`);
  });

  it("an empty body gets its settings, then the title, then a brace on the plan's own indent", () => {
    const body = (pad: string): string =>
      ["paper A4 landscape", "scale 1:50", "dims auto overall", `title { project "E" }`]
        .map((l) => `${pad}  ${l}\n`)
        .join("");
    expect(finish(EDGES["an empty body"]!).source).toBe(`plan "E" {\n${body("")}}`);
    expect(finish(EDGES["an empty body with a blank"]!).source).toBe(`  plan "E" {\n${body("  ")}  }\n`);
    expect(finish(EDGES["an empty body over two lines"]!).source).toBe(`plan "E" {\n${body("")}}\n`);
  });

  for (const [what, src] of Object.entries(EDGES))
    it(`${what}: compiles, leaves no trailing whitespace, and is a fixpoint — also after fmt`, () => {
      const r = finish(src);
      expect(r.changed).toBe(true);
      expect(errorsOf(r.source)).toEqual([]);
      expect(trailingBlanks(r.source)).toEqual([]);
      expect(finish(r.source).source).toBe(r.source);
      const formatted = format(r.source);
      const again = finish(formatted);
      expect(again.source).toBe(formatted);
      expect(again.changed).toBe(false);
    });

  for (const name of NAMES)
    it(`${name}: fmt, then finish, is a no-op on a finished plan`, () => {
      const formatted = format(finish(srcOf(name), { world }).source);
      const again = finish(formatted, { world });
      expect(again.source).toBe(formatted);
      expect(again.changed).toBe(false);
    }, 120000);
});

suite("finish — the title's project is the plan's name, exactly", () => {
  const lit = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  const NAMES_TO_KEEP = [
    "Tab\there",
    'Quote "q"',
    "Back\\slash",
    "Two\nlines",
    "Çatı — 屋頂",
    "C:\\new\\table",
    "bell\u0007 and del\u007f",
  ];
  for (const name of NAMES_TO_KEEP)
    it(`round-trips ${JSON.stringify(name)}`, () => {
      const src = `plan ${lit(name)} {\n  units mm\n${SHELL}\n}\n`;
      expect(parse(src).plan?.name).toBe(name);
      const r = finish(src);
      expect(r.changes.map((c) => c.statement)).toContain("title");
      expect(parse(r.source).plan?.title?.project).toBe(name);
      expect(errorsOf(r.source)).toEqual([]);
      expect(finish(r.source).source).toBe(r.source);
    });
});
