/**
 * Card AL6: `W_ANNOTATION_OVERLAP` says, as data beside the warning, which text is printed over
 * what (`diagnosticOverprint`, `src/lint/overprint-ref.ts`).
 *
 * Pinned on the label-crowding witness (`test/fixtures/dense-office.arch`): its two room names over
 * fixtures and its `dims auto all` wall-thickness figure over the kitchenette's name, each detail
 * exact, kinds and ids. Then what holds everywhere: `lint()` and its JSON are untouched (the detail
 * is kept beside the diagnostic, never on it), the two-argument projection is unchanged and the
 * option only appends a last key, a copy or a clone has no detail while `lint()`'s own copies (a
 * storey's `level`) carry it, the CLI's `lint`/`validate --json` attach it, and over the
 * annotation-collisions defects every report has one whose subject is the text the message
 * names, whose ids are ids `describe()` lists. The message no longer names the room a
 * thickness figure stands in when the label under it is another room's (the witness's
 * ` in "Boardroom"`).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as suite, expect, it } from "vitest";
import {
  describe,
  type Diagnostic,
  type DiagnosticOverprintJson,
  diagnosticOverprint,
  diagnosticRule,
  diagnosticToJson,
  lint,
} from "../src/index.js";
import { runArch } from "./helpers/cli.js";

const OVERLAP = "W_ANNOTATION_OVERLAP";
const WITNESS_PATH = "test/fixtures/dense-office.arch";
const WITNESS = readFileSync(WITNESS_PATH, "utf8");
const overlaps = (src: string): Diagnostic[] => lint(src).filter((d) => d.code === OVERLAP);

suite("the witness: who overprints whom", () => {
  const ds = overlaps(WITNESS);

  it("reports two room names over fixtures and one wall-thickness figure over a name", () => {
    expect(ds.map(diagnosticOverprint)).toEqual([
      {
        subject: { kind: "room-name", room: "r_store", text: "Store / IT" },
        over: [{ kind: "symbol", id: "filing_cabinet_6" }],
      },
      {
        subject: { kind: "room-name", room: "r_kitchen", text: "Kitchenette / Break" },
        over: [
          { kind: "symbol", id: "server_rack_5" },
          { kind: "symbol", id: "kitchen_sink_7" },
        ],
      },
      {
        subject: { kind: "dim-thickness", room: "r_board", text: "200" },
        over: [{ kind: "room-name", room: "r_kitchen", text: "Kitchenette / Break" }],
      },
    ] satisfies DiagnosticOverprintJson[]);
  });

  it("the figure stands in the boardroom, and its message names the kitchenette's label, not the boardroom", () => {
    const figure = ds[2]!;
    expect(figure.message).toBe(
      'The wall-thickness figure 200 that `dims auto all` writes beside its wall is printed over the name "Kitchenette / Break", so the two overprint each other on the drawing.',
    );
    expect(figure.message).not.toContain("Boardroom");
    // The structured detail keeps both rooms: where the figure stands and whose label it covers.
    expect(diagnosticOverprint(figure)?.subject.room).toBe("r_board");
    expect(diagnosticOverprint(figure)?.over[0]?.room).toBe("r_kitchen");
  });

  it("every id it names is one describe() lists", () => {
    const s = describe(WITNESS);
    const ids = new Set([...s.rooms.map((r) => r.id), ...s.furniture.map((f) => f.id), ...s.doors.map((d) => d.id)]);
    for (const d of ds) {
      const o = diagnosticOverprint(d)!;
      for (const item of [o.subject, ...o.over]) {
        if (item.id !== undefined) expect(ids.has(item.id), item.id).toBe(true);
        if (item.room !== undefined) expect(ids.has(item.room), item.room).toBe(true);
      }
    }
  });
});

suite("beside the diagnostic, never on it", () => {
  it("lint() returns the same keys: JSON.stringify(lint()) carries no detail", () => {
    const ds = lint(WITNESS);
    expect(JSON.stringify(ds)).not.toContain(`"overprint":`);
    for (const d of ds) expect(Object.keys(d)).not.toContain("overprint");
  });

  it("the two-argument projection is unchanged; the option appends `overprint` last, after `rule`", () => {
    for (const d of lint(WITNESS)) {
      const plain = diagnosticToJson(WITNESS, d);
      const both = diagnosticToJson(WITNESS, d, { rule: diagnosticRule, overprint: diagnosticOverprint });
      expect(plain).not.toHaveProperty("overprint");
      expect(Object.keys(both).at(-1)).toBe("overprint");
      const { overprint, rule: _r, ...rest } = both;
      expect(JSON.stringify(rest)).toBe(JSON.stringify(plain));
      expect(overprint).toEqual(diagnosticOverprint(d));
    }
  });

  it("a copy or a clone has none; a diagnostic of another code has none", () => {
    const [d] = overlaps(WITNESS);
    expect(diagnosticOverprint(d!)).toBeDefined();
    expect(diagnosticOverprint({ ...d! })).toBeUndefined();
    expect(diagnosticOverprint(structuredClone(d!))).toBeUndefined();
    const other = lint(WITNESS, { profile: "accessibility-advisory" }).filter((x) => x.code !== OVERLAP);
    expect(other.length).toBeGreaterThan(0);
    for (const x of other) expect(diagnosticOverprint(x)).toBeUndefined();
  });

  it("lint()'s own copies carry it: each storey's warning, stamped with its `level`", () => {
    const body = `
    wall id=shell exterior thickness 200 { (0,0) (2000,0) (2000,2500) (0,2500) close }
    room id=r_bath at (0,0) size 2000x2500 label "Bathroom" at (1000,1650) uses bath
    door id=d_bath at (600,2500) width 800 wall shell swing in
    furniture bathtub against wall shell segment 0 offset 1000 in r_bath
    furniture wc against wall shell segment 1 offset 1300 in r_bath
    furniture basin against wall shell segment 3 offset 1350 in r_bath`;
    const src = `plan "two storeys" {
  units mm
  grid 50
  paper A4 landscape
  scale 1:100
  level 1 {${body}
  }
  level 2 {${body}
  }
}`;
    const ds = overlaps(src);
    expect(ds.map((d) => d.level)).toEqual([1, 2]);
    for (const d of ds)
      expect(diagnosticOverprint(d)?.subject).toEqual({ kind: "room-name", room: "r_bath", text: "Bathroom" });
  });
});

suite("the fabric kinds: a wall, a door's swing, the floor's edge", () => {
  it("a pinned name over a wall and a swing", () => {
    const src = `plan "labels in small rooms" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=flur at (0,0) size 3000x1400 label "Flur" uses hall
  room id=wc right-of flur size 1000x1400 label "WC" uses wc
  room id=abst below wc align left size 1200x900 label "Abstellraum" at (3600,1985) uses storage
  walls from rooms exterior 200 partition 100
  door on flur.bottom at 800 from start width 900 swing into flur
  door between flur and wc at center width 800 swing into wc
  door id=d_abst between wc and abst at center width 600 swing into abst
}`;
    const [d, ...rest] = overlaps(src);
    expect(rest).toEqual([]);
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-name", room: "abst", text: "Abstellraum" },
      over: [{ kind: "wall" }, { kind: "door-swing", id: "d_abst" }],
    });
  });

  it("a name wider than its floor, over a wall and off the floor", () => {
    const src = `plan "r" {
  units mm
  paper A4 landscape
  scale 1:50
  room id=r at (0,0) size 1200x2000 label "Hauswirtschaftsraumundabstellkammer" uses bedroom
  walls from rooms exterior 100 partition 100
}`;
    const [d] = overlaps(src);
    expect(d!.message).toContain("is printed over a wall and runs out of the room");
    expect(diagnosticOverprint(d!)).toEqual({
      subject: { kind: "room-name", room: "r", text: "Hauswirtschaftsraumundabstellkammer" },
      over: [{ kind: "wall" }, { kind: "floor-edge", room: "r" }],
    });
  });
});

suite("the annotation-collisions defects: every report has a detail, and its subject is the message's", () => {
  const dir = "test/defect-corpus/annotation-collisions";
  const files = [
    WITNESS_PATH,
    ...readdirSync(dir)
      .filter((f) => f.endsWith(".arch"))
      .sort()
      .map((f) => join(dir, f).replace(/\\/g, "/")),
  ];
  /** The subject kind each opening of the message names. */
  const OPENING: [RegExp, string][] = [
    [/^The name /, "room-name"],
    [/^The area figure /, "room-area"],
    [/^The wall-thickness figure /, "dim-thickness"],
    [/^The radius call-out /, "dim-radius"],
    [/^The diameter call-out /, "dim-diameter"],
    [/^The figure /, "dim-chain"],
  ];

  it("holds on each report, and the set is not empty", () => {
    let reports = 0;
    const kinds = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const s = describe(src);
      const ids = new Set([...s.rooms.map((r) => r.id), ...s.furniture.map((x) => x.id), ...s.doors.map((x) => x.id)]);
      for (const d of overlaps(src)) {
        reports++;
        const o = diagnosticOverprint(d);
        expect(o, `${f}: ${d.message}`).toBeDefined();
        const want = OPENING.find(([re]) => re.test(d.message))?.[1];
        expect(o!.subject.kind, `${f}: ${d.message}`).toBe(want);
        expect(o!.subject.text.length, f).toBeGreaterThan(0);
        expect(o!.over.length, f).toBeGreaterThan(0);
        for (const item of [o!.subject, ...o!.over]) {
          kinds.add(item.kind);
          if (item.id !== undefined) expect(ids.has(item.id), `${f}: ${item.id}`).toBe(true);
          if (item.room !== undefined) expect(ids.has(item.room), `${f}: ${item.room}`).toBe(true);
          // An id is data here and a handle in the hint; the message never quotes it.
          if (item.id !== undefined) expect(d.message, f).not.toContain(item.id);
        }
      }
    }
    expect(reports).toBeGreaterThan(4);
    for (const k of ["room-name", "dim-thickness", "dim-radius", "symbol", "door-swing"])
      expect(kinds.has(k), k).toBe(true);
  });
});

suite("the CLI attaches it: `lint --json` and `validate --json`", () => {
  it("lint --json: every W_ANNOTATION_OVERLAP carries `overprint` as its last key, no other code does", async () => {
    const r = await runArch(["lint", WITNESS_PATH, "--json"]);
    const out = JSON.parse(r.stdout) as { diagnostics: Array<Record<string, unknown>> };
    const ds = lint(WITNESS);
    expect(out.diagnostics.map((d) => d.overprint)).toEqual(ds.map(diagnosticOverprint));
    for (const d of out.diagnostics)
      if (d.code === OVERLAP) expect(Object.keys(d).at(-1)).toBe("overprint");
      else expect(d).not.toHaveProperty("overprint");
  });

  it("validate --json: `overprint` sits after `rule`, before the `stage` it ends with", async () => {
    const r = await runArch(["validate", WITNESS_PATH, "--json"]);
    const out = JSON.parse(r.stdout) as { diagnostics: Array<Record<string, unknown>> };
    const shown = out.diagnostics.filter((d) => d.code === OVERLAP);
    expect(shown).toHaveLength(3);
    for (const d of shown) expect(Object.keys(d).slice(-2)).toEqual(["overprint", "stage"]);
  });
});
