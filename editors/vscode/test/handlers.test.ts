/**
 * WS-F1 — the VS Code language server's handler layer (`src/handlers.ts`).
 *
 * These are the conversions the core deliberately does not do: source offsets ↔
 * LSP line/character positions, core results ↔ LSP payloads. The handlers are
 * dependency-injected, so every case here runs WITHOUT an LSP transport: most
 * drive the REAL core (vitest aliases `@chanmeng666/archlang` to `src/index.ts`),
 * and the few that must reach a branch the real core cannot produce drive a stub.
 *
 * Two things are pinned that nothing else pins:
 *   1. LSP positions are line/character, never source offsets, and `character`
 *      counts UTF-16 units — so a line with CJK text does not shift columns.
 *   2. A quickfix whose edits are measured in ANOTHER file is refused, mirroring
 *      the core `applyFixes` contract (AGENTS.md: "a diagnostic's span is not
 *      always in the file you compiled").
 */
import { describe, expect, it } from "vitest";
import * as archlang from "@chanmeng666/archlang";
import { CompletionItemKind, DiagnosticSeverity } from "vscode-languageserver-protocol";
import { offsetToPosition } from "../src/diagnostics.js";
import { COMPLETION_KIND, createHandlers, type CoreCodeAction, type CoreLsp } from "../src/handlers.js";

const { COMPLETION_KINDS } = archlang;
const h = createHandlers(archlang as unknown as CoreLsp);

/** Position of a source offset — the same conversion the editor would do. */
const pos = (text: string, offset: number) => offsetToPosition(text, offset);
/** Position just inside the first occurrence of `needle`. */
const atText = (text: string, needle: string, plus = 1) => pos(text, text.indexOf(needle) + plus);

const SRC = [
  'plan "T" {',
  "  units mm",
  "  let W = 4000",
  "  let H = 3000",
  "  let aream2(w, hh) = w * hh",
  "  component bed(x, y) {",
  "    furniture bed at (x, y) size 1500x2000",
  "  }",
  "  wall exterior thickness 200 { (0, 0) (W, 0) (W, 4000) close }",
  '  room id=main at (0, 0) size W x H label "Room"',
  "  let area = aream2(W, 3000)",
  "  bed(300, 300)",
  "}",
].join("\n");

/** A minimal CoreLsp whose every member throws unless overridden. */
function stubCore(over: Partial<CoreLsp>): CoreLsp {
  const nope = (name: string) => () => {
    throw new Error(`stub core: ${name} not stubbed`);
  };
  return {
    compile: () => ({ diagnostics: [] }),
    hover: nope("hover"),
    completion: nope("completion"),
    definition: nope("definition"),
    rename: nope("rename"),
    signatureHelp: nope("signatureHelp"),
    codeActions: nope("codeActions"),
    ...over,
  } as CoreLsp;
}

// ---------------------------------------------------------------- capabilities

describe("capabilities", () => {
  it("advertises exactly the providers the handlers implement", () => {
    const c = h.capabilities;
    expect(c.hoverProvider).toBe(true);
    expect(c.definitionProvider).toBe(true);
    expect(c.renameProvider).toBe(true);
    expect(c.completionProvider?.triggerCharacters).toEqual([" "]);
    expect(c.signatureHelpProvider?.triggerCharacters).toEqual(["(", ","]);
    expect(c.codeActionProvider).toEqual({ codeActionKinds: ["quickfix"] });
  });
});

// ---------------------------------------------------------------------- hover

describe("hover", () => {
  it("returns markdown contents and the range of the token under the cursor", () => {
    const hov = h.hover(SRC, atText(SRC, "room id=main"));
    expect(hov).not.toBeNull();
    expect(hov!.contents).toMatchObject({ kind: "markdown" });
    expect((hov!.contents as { value: string }).value).toContain("room");
    // The range is line/character, and slicing the source between those two
    // positions yields the hovered token.
    const r = hov!.range!;
    expect(r.start.line).toBe(9); // 0-based: the `room` line
    expect(SRC.split("\n")[r.start.line]!.slice(r.start.character, r.end.character)).toBe("room");
  });

  it("resolves an id reference to its declaration text", () => {
    const hov = h.hover(SRC, atText(SRC, "(W, 0)", 1));
    expect((hov!.contents as { value: string }).value).toContain("let W");
  });

  it("returns null where the core has nothing to say", () => {
    // Inside the string literal of the plan name — no symbol, no keyword.
    expect(h.hover(SRC, pos(SRC, SRC.indexOf('"T"') + 1))).toBeNull();
  });

  it("omits `range` when the core reports no span", () => {
    const stub = createHandlers(stubCore({ hover: () => ({ contents: "no span" }) }));
    expect(stub.hover("x", { line: 0, character: 0 })!.range).toBeUndefined();
  });
});

// ----------------------------------------------------------------- definition

describe("definition", () => {
  it("points a reference at its binding, in the requested document", () => {
    const def = h.definition(SRC, "file:///p.arch", atText(SRC, "(W, 0)", 1));
    expect(def).not.toBeNull();
    const loc = def as { uri: string; range: { start: { line: number; character: number } } };
    expect(loc.uri).toBe("file:///p.arch");
    // `let W = 4000` is the 3rd line (0-based 2); the name starts at column 6.
    expect(loc.range.start).toEqual({ line: 2, character: 6 });
  });

  it("resolves the same binding from several call sites to ONE location", () => {
    const uri = "file:///p.arch";
    const sites: [string, number][] = [
      ["(W, 0)", 1],
      ["(W, 4000)", 1],
      ["aream2(W, 3000)", "aream2(".length + 1], // the W ARGUMENT, not the callee
    ];
    const from = sites.map(([needle, plus]) => h.definition(SRC, uri, atText(SRC, needle, plus)) as { range: unknown });
    expect(from.every((d) => d !== null)).toBe(true);
    for (const d of from) expect(d.range).toEqual(from[0]!.range);
  });

  it("returns null off any identifier", () => {
    expect(h.definition(SRC, "file:///p.arch", pos(SRC, 0))).toBeNull(); // the `plan` keyword
  });
});

// --------------------------------------------------------------------- rename

describe("rename", () => {
  const uri = "file:///p.arch";

  it("returns a WorkspaceEdit keyed by the document uri, one TextEdit per use", () => {
    const edit = h.rename(SRC, uri, pos(SRC, SRC.indexOf("let W = ") + 4), "WIDTH");
    expect(edit).not.toBeNull();
    const edits = edit!.changes![uri]!;
    // decl + (W,0) + (W,4000) + `size W` + the W in aream2(W, 3000)
    expect(edits).toHaveLength(5);
    for (const e of edits) {
      expect(e.newText).toBe("WIDTH");
      const line = SRC.split("\n")[e.range.start.line]!;
      expect(line.slice(e.range.start.character, e.range.end.character)).toBe("W");
    }
  });

  it("COLLISION: renaming onto an existing name touches only the renamed symbol", () => {
    // `H` is already bound. Renaming `W` → `H` is a legal edit request; the server
    // must not silently merge the two symbols by also rewriting H's occurrences.
    const edits = h.rename(SRC, uri, pos(SRC, SRC.indexOf("let W = ") + 4), "H")!.changes![uri]!;
    const lines = SRC.split("\n");
    for (const e of edits) {
      expect(lines[e.range.start.line]!.slice(e.range.start.character, e.range.end.character)).toBe("W");
    }
    // …and none of them is the `let H = 3000` declaration.
    expect(edits.some((e) => e.range.start.line === 3)).toBe(false);
  });

  it("returns null (no edit) when the cursor is not on a renameable symbol", () => {
    expect(h.rename(SRC, uri, pos(SRC, 0), "X")).toBeNull(); // the `plan` keyword
  });
});

// ----------------------------------------------------------------- completion

describe("completion", () => {
  it("maps EVERY core completion kind — the map is total", () => {
    // The core's own list of kinds is the oracle: a kind added there with no icon
    // here fails this case instead of silently falling back to a Text icon.
    expect(Object.keys(COMPLETION_KIND).sort()).toEqual([...COMPLETION_KINDS].sort());
    for (const kind of COMPLETION_KINDS) expect(COMPLETION_KIND[kind]).toBeTypeOf("number");
  });

  it("translates each core kind to its distinct LSP icon", () => {
    const stub = createHandlers(
      stubCore({ completion: () => COMPLETION_KINDS.map((kind) => ({ label: kind, kind })) as never }),
    );
    const items = stub.completion("x", { line: 0, character: 0 });
    expect(items.map((i) => i.kind)).toEqual([
      CompletionItemKind.Keyword,
      CompletionItemKind.Class,
      CompletionItemKind.Variable,
      CompletionItemKind.Function,
      CompletionItemKind.Module,
      CompletionItemKind.EnumMember,
    ]);
    // Nothing fell through to the Text fallback.
    expect(items.some((i) => i.kind === CompletionItemKind.Text)).toBe(false);
  });

  it("offers in-scope symbols at an offset, carrying detail/documentation", () => {
    const items = h.completion(SRC, pos(SRC, SRC.indexOf("  bed(300, 300)") + 2));
    expect(items.length).toBeGreaterThan(0);
    const w = items.find((i) => i.label === "W");
    expect(w?.kind).toBe(CompletionItemKind.Variable);
    const comp = items.find((i) => i.label === "bed");
    expect(comp?.kind).toBe(CompletionItemKind.Module);
    expect(items.find((i) => i.label === "room")?.kind).toBe(CompletionItemKind.Class);
  });

  // G.7 — the core's category-slot completion, seen through the adapter. Both directions are
  // asserted on the SAME source and the SAME handler, because the failure this guards against
  // is the 129 words being offered everywhere, which a presence-only case would pass.
  it("offers the fixture vocabulary in a `furniture` statement's category slot", () => {
    const items = h.completion(SRC, atText(SRC, "furniture bed", "furniture ".length));
    for (const word of ["bathtub", "wardrobe", "range_hood", "tub"]) {
      expect(items.map((i) => i.label)).toContain(word);
    }
    // One icon for the whole slot, and it is not the Text fallback.
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set([CompletionItemKind.EnumMember]));
    // The core's `detail`/`doc` survive the conversion — `documentation`, not `doc`.
    const tub = items.find((i) => i.label === "tub")!;
    expect(tub.detail).toContain("bathtub");
    expect(String(tub.documentation)).toContain("another name for");
  });

  it("keeps the fixture vocabulary OUT of a plan-scope completion", () => {
    const items = h.completion(SRC, pos(SRC, SRC.indexOf("  bed(300, 300)") + 2));
    for (const word of ["bathtub", "wardrobe", "range_hood", "tub"]) {
      expect(items.map((i) => i.label)).not.toContain(word);
    }
    expect(items.some((i) => i.kind === CompletionItemKind.EnumMember)).toBe(false);
  });
});

// -------------------------------------------------------------- signatureHelp

describe("signatureHelp", () => {
  it("describes the enclosing call and the active parameter", () => {
    const call = SRC.indexOf("aream2(W, 3000)");
    const sig = h.signatureHelp(SRC, pos(SRC, call + "aream2(".length));
    expect(sig).not.toBeNull();
    expect(sig!.signatures).toHaveLength(1);
    expect(sig!.signatures[0]!.label).toContain("aream2");
    expect(sig!.signatures[0]!.parameters!.map((p) => p.label)).toEqual(["w", "hh"]);
    expect(sig!.activeSignature).toBe(0);
    expect(sig!.activeParameter).toBe(0);
  });

  it("advances activeParameter past a comma", () => {
    const call = SRC.indexOf("aream2(W, 3000)");
    const sig = h.signatureHelp(SRC, pos(SRC, call + "aream2(W, ".length));
    expect(sig!.activeParameter).toBe(1);
  });

  it("returns null outside any call", () => {
    expect(h.signatureHelp(SRC, pos(SRC, SRC.indexOf("units mm")))).toBeNull();
  });
});

// ------------------------------------------------------------------ codeAction

const QUICKFIX_SRC = [
  'plan "P" {',
  "  units mm",
  "  grid 50",
  "  wall id=w1 exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }",
  '  room id=r at (0,0) size 5000x4000 label "Room"',
  "  door id=d at (2500,9000) width 900",
  "}",
].join("\n");

describe("codeAction", () => {
  const uri = "file:///p.arch";
  const doorAt = QUICKFIX_SRC.indexOf("door id=d");
  const doorRange = { start: pos(QUICKFIX_SRC, doorAt), end: pos(QUICKFIX_SRC, doorAt) };

  it("returns a QuickFix carrying a WorkspaceEdit with LSP ranges", () => {
    const actions = h.codeAction(QUICKFIX_SRC, uri, doorRange);
    expect(actions).toHaveLength(1);
    const a = actions[0]!;
    expect(a.kind).toBe("quickfix");
    expect(a.isPreferred).toBe(true);
    const edits = a.edit!.changes![uri]!;
    expect(edits).toHaveLength(1);
    // The edit's range is line/character and covers the `door …` statement, not a
    // raw offset pair.
    expect(edits[0]!.range.start.line).toBe(5);
    const line = QUICKFIX_SRC.split("\n")[5]!;
    expect(line.slice(edits[0]!.range.start.character, edits[0]!.range.end.character)).toBe(
      "door id=d at (2500,9000) width 900",
    );
    expect(edits[0]!.newText).toContain("on w1 at");
  });

  it("attaches the originating diagnostic, with its own range and severity", () => {
    const a = h.codeAction(QUICKFIX_SRC, uri, doorRange)[0]!;
    expect(a.diagnostics).toHaveLength(1);
    expect(a.diagnostics![0]!.code).toBe("W_DOOR_OFF_WALL");
    expect(a.diagnostics![0]!.severity).toBe(DiagnosticSeverity.Warning);
    expect(a.diagnostics![0]!.range.start.line).toBe(5);
  });

  it("returns nothing for a range that touches no diagnostic", () => {
    expect(h.codeAction(QUICKFIX_SRC, uri, { start: pos(QUICKFIX_SRC, 0), end: pos(QUICKFIX_SRC, 1) })).toEqual([]);
  });
});

// ------------------------------------------- the cross-file quickfix guard (F1)

/**
 * A quickfix raised inside an `import`ed component carries spans measured in THAT
 * module. `applyFixes` refuses such a fix by design; the core's `codeActions`
 * projection drops the `file` field, so the adapter recovers it from `compile()`.
 *
 * The real core cannot reach this state through `codeActions` today (see the last
 * case), so the guard itself is driven with a stub.
 */
describe("codeAction — never edits another file", () => {
  const uri = "file:///main.arch";
  const text = 'plan "main" {\n  import "lib.arch": nook\n  nook()\n}';
  const range = { start: pos(text, 0), end: pos(text, text.length) };

  /** A quickfix whose spans belong to `lib.arch`, not to `text`. */
  const foreignAction: CoreCodeAction = {
    title: 'attach the door to wall "w" at 50%',
    kind: "quickfix",
    diagnostic: {
      code: "W_DOOR_OFF_WALL",
      severity: "warning",
      message: "door does not lie on any wall",
      span: [10, 30],
    },
    edits: [{ span: { start: 10, end: 30 }, newText: "door id=d on w at 50% width 800" }],
    isPreferred: true,
  };

  it("drops an action whose diagnostic is measured in an imported module", () => {
    const stub = createHandlers(
      stubCore({
        // compile() DOES carry `file` — that is where the provenance comes from.
        compile: () => ({
          diagnostics: [
            {
              severity: "warning",
              message: "door does not lie on any wall",
              code: "W_DOOR_OFF_WALL",
              span: { start: 10, end: 30 },
              file: "lib.arch",
            },
          ],
        }),
        codeActions: () => [foreignAction],
      }),
    );
    expect(stub.codeAction(text, uri, range)).toEqual([]);
  });

  it("keeps the identical action when the diagnostic belongs to THIS document", () => {
    const stub = createHandlers(
      stubCore({
        compile: () => ({
          diagnostics: [
            {
              severity: "warning",
              message: "door does not lie on any wall",
              code: "W_DOOR_OFF_WALL",
              span: { start: 10, end: 30 },
            },
          ],
        }),
        codeActions: () => [foreignAction],
      }),
    );
    const actions = stub.codeAction(text, uri, range);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.edit!.changes![uri]).toHaveLength(1);
  });

  it("drops an action whose edit span runs past the end of the document", () => {
    const stub = createHandlers(
      stubCore({
        codeActions: () => [{ ...foreignAction, edits: [{ span: { start: 10, end: text.length + 1 }, newText: "x" }] }],
      }),
    );
    expect(stub.codeAction(text, uri, range)).toEqual([]);
  });

  it("PIN: the real core cannot produce a cross-file quickfix — `codeActions` takes no World", () => {
    // `codeActions(source, range)` resolves with the NULL world, so the import never
    // links and no `file`-bearing diagnostic exists to build an action from. This is
    // why the guard above is a seam guard, not a live bug fix; if this case ever goes
    // red, the guard above is what stands between a quickfix and the wrong file.
    const importer = [
      'plan "main" {',
      "  grid 100",
      '  import "lib.arch": nook',
      "  wall exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }",
      "  place nook() as n1 at (0,0)",
      "}",
    ].join("\n");
    const whole = { start: pos(importer, 0), end: pos(importer, importer.length) };
    expect(h.codeAction(importer, uri, whole)).toEqual([]);
  });
});

// ------------------------------------------------------- positions are UTF-16

describe("positions are line/character, not offsets", () => {
  /**
   * A parse-clean plan whose line 2 carries a non-ASCII string BEFORE the `W` we
   * probe, so the UTF-8 byte column and the UTF-16 column disagree there — and
   * whose line 3 raises `E_ROOM_SIZE`.
   */
  const uni = (label: string): string =>
    [
      'plan "P" {',
      "  let W = 3000",
      `  for n in [${JSON.stringify(label)}] { room at (0,0) size W x 3000 }`,
      "  room id=bad at (0,0) size 0x1000",
      "}",
    ].join("\n");

  const CJK = uni("客厅 · 起居");
  const cjkLine = CJK.split("\n")[2]!;

  it("`character` counts UTF-16 units, so a CJK label does not shift the column", () => {
    const col = cjkLine.indexOf("size W") + "size ".length;
    // Guard the guard: if the byte column and the UTF-16 column agreed, a
    // byte-based implementation would pass this case by accident.
    expect(Buffer.byteLength(cjkLine.slice(0, col), "utf8")).not.toBe(col);

    // Position → offset: the cursor lands on `W`, not on some byte-shifted token.
    const hov = h.hover(CJK, { line: 2, character: col + 1 });
    expect(hov).not.toBeNull();
    expect((hov!.contents as { value: string }).value).toContain("let W");
    // …and offset → position comes back on the same line at the same column.
    const r = hov!.range!;
    expect(r.start).toEqual({ line: 2, character: col });
    expect(cjkLine.slice(r.start.character, r.end.character)).toBe("W");
  });

  it("go-to-definition from after a CJK label still lands on the binding", () => {
    const col = cjkLine.indexOf("size W") + "size ".length;
    const def = h.definition(CJK, "file:///u.arch", { line: 2, character: col + 1 }) as {
      range: { start: { line: number; character: number } };
    };
    expect(def).not.toBeNull();
    expect(def.range.start).toEqual({ line: 1, character: 6 }); // the `W` of `let W = 3000`
  });

  it("a diagnostic after a CJK line lands on the right line, not a byte-derived one", () => {
    const err = h.diagnostics(CJK).find((d) => d.code === "E_ROOM_SIZE");
    expect(err).toBeDefined();
    expect(err!.severity).toBe(DiagnosticSeverity.Error);
    // A byte-derived position would have overshot past this line entirely.
    expect(err!.range.start.line).toBe(3);
    expect(err!.range.end.line).toBe(3);
    expect(CJK.split("\n")[3]!.slice(err!.range.start.character)).toMatch(/^room id=bad/);
  });

  it("an ASTRAL character counts as TWO units, the LSP UTF-16 default", () => {
    const src = uni("🏠🏠");
    const line = src.split("\n")[2]!;
    const col = line.indexOf("size W") + "size ".length;
    // A code-POINT count would be 2 short (each house is one code point, two units).
    expect([...line.slice(0, col)].length).toBe(col - 2);

    const hov = h.hover(src, { line: 2, character: col + 1 });
    expect(hov).not.toBeNull();
    expect(hov!.range!.start).toEqual({ line: 2, character: col });
    expect(line.slice(hov!.range!.start.character, hov!.range!.end.character)).toBe("W");
  });
});
