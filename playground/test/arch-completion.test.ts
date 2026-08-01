import type { CompletionContext } from "@codemirror/autocomplete";
import { COMPLETION_KINDS, completion } from "archlang";
import { describe, expect, it } from "vitest";
import { archCompletion, archCompletionSource, KIND_TO_CM } from "../src/arch-completion.js";

const DOC = `plan "X" {\n  units mm\n  let width = 4000\n  room at (0,0) size 4000x3000 label "R"\n  ro\n}`;
const AFTER_RO = DOC.indexOf("\n  ro\n") + 5; // caret just past the "ro" prefix

/**
 * The smallest honest CompletionContext double.
 *
 * `archCompletionSource` reads exactly four things off the context — `matchBefore`,
 * `explicit`, `state.doc` and `pos` — so this stubs those and nothing else.
 * `matchBefore` reproduces CodeMirror's contract: match `re` against the current
 * line's text ending AT `pos`, and return `{from,to,text}` or null.
 */
function stubContext(opts: {
  doc?: string;
  pos?: number;
  explicit?: boolean;
  /** Make `state.doc.toString()` throw, to exercise the advisory catch. */
  docThrows?: boolean;
}): CompletionContext {
  const doc = opts.doc ?? DOC;
  const pos = opts.pos ?? AFTER_RO;
  return {
    pos,
    explicit: opts.explicit ?? false,
    state: {
      doc: {
        toString: () => {
          if (opts.docThrows) throw new Error("doc unavailable");
          return doc;
        },
      },
    },
    matchBefore(re: RegExp) {
      const lineStart = doc.lastIndexOf("\n", pos - 1) + 1;
      const before = doc.slice(lineStart, pos);
      const m = before.match(new RegExp(`(?:${re.source})$`));
      return m ? { from: pos - m[0].length, to: pos, text: m[0] } : null;
    },
  } as unknown as CompletionContext;
}

describe("arch-completion KIND_TO_CM", () => {
  it("maps every completion kind the core can emit", () => {
    for (const kind of COMPLETION_KINDS) {
      expect(typeof KIND_TO_CM[kind]).toBe("string");
    }
  });

  it("has no stale keys the core no longer emits", () => {
    for (const key of Object.keys(KIND_TO_CM)) {
      expect(COMPLETION_KINDS).toContain(key);
    }
  });
});

describe("archCompletionSource", () => {
  it("offers the core's in-scope items at the cursor", () => {
    const result = archCompletionSource(stubContext({}))!;
    expect(result).not.toBeNull();
    expect(result.options.length).toBe(completion(DOC, AFTER_RO).length);
    expect(result.options.map((o) => o.label)).toContain("room");
  });

  it("anchors `from` at the START of the word being typed, not the caret", () => {
    // Otherwise accepting a completion would append to the prefix ("roroom").
    const result = archCompletionSource(stubContext({}))!;
    expect(result.from).toBe(AFTER_RO - 2); // the "ro" already typed
    expect(DOC.slice(result.from, AFTER_RO)).toBe("ro");
  });

  it("includes hyphenated identifiers in the matched word", () => {
    // `right-of`, `left-of`, `drawn_by` — an ArchLang identifier is not \w+.
    const doc = `plan "X" {\n  room right-of\n}`;
    const pos = doc.indexOf("right-of") + "right-of".length;
    const result = archCompletionSource(stubContext({ doc, pos }))!;
    expect(doc.slice(result.from, pos)).toBe("right-of");
  });

  it("returns null with no word under an unprompted cursor", () => {
    // Caret sits after a space: nothing typed, no explicit request → no popup.
    const doc = `plan "X" {\n  units mm\n  \n}`;
    const pos = doc.indexOf("\n  \n") + 3;
    expect(archCompletionSource(stubContext({ doc, pos, explicit: false }))).toBeNull();
  });

  it("DOES offer items with no word when the user asked explicitly (Ctrl-Space)", () => {
    const doc = `plan "X" {\n  units mm\n  \n}`;
    const pos = doc.indexOf("\n  \n") + 3;
    const result = archCompletionSource(stubContext({ doc, pos, explicit: true }))!;
    expect(result).not.toBeNull();
    expect(result.from).toBe(pos); // no word to replace — insert at the caret
    expect(result.options.length).toBeGreaterThan(0);
  });

  it("returns null instead of throwing when the core blows up — completion is advisory", () => {
    expect(archCompletionSource(stubContext({ docThrows: true }))).toBeNull();
  });

  it("maps every core kind through KIND_TO_CM (never a raw core kind)", () => {
    const result = archCompletionSource(stubContext({}))!;
    const cmTypes = new Set(Object.values(KIND_TO_CM));
    for (const o of result.options) expect(cmTypes.has(o.type as string)).toBe(true);
  });

  it("carries the core's detail/doc through to the popup", () => {
    const items = completion(DOC, AFTER_RO);
    const withDoc = items.find((i) => i.doc);
    const result = archCompletionSource(stubContext({}))!;
    const mapped = result.options.find((o) => o.label === withDoc!.label)!;
    expect(mapped.info).toBe(withDoc!.doc);
    expect(mapped.detail).toBe(withDoc!.detail);
  });

  it("keeps the popup open while a hyphenated word is being typed (validFor)", () => {
    const { validFor } = archCompletionSource(stubContext({}))!;
    expect((validFor as RegExp).test("right-of")).toBe(true);
    expect((validFor as RegExp).test("")).toBe(true);
    expect((validFor as RegExp).test("has space")).toBe(false);
  });

  it("offers a user-declared `let` variable, not just keywords", () => {
    const result = archCompletionSource(stubContext({}))!;
    expect(result.options.map((o) => o.label)).toContain("width");
  });
});

describe("archCompletion", () => {
  it("builds a CodeMirror extension", () => {
    const ext = archCompletion();
    expect(ext).toBeDefined();
    // `autocompletion()` returns an extension (array/facet value) — assert it is
    // something CodeMirror can consume rather than poking at its internals.
    expect(typeof ext === "object" || typeof ext === "function").toBe(true);
  });
});
