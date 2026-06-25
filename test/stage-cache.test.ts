import { describe, expect, it } from "vitest";
import { compile, clearCache, createRegistry, BUILTIN_REGISTRY, registerElement } from "../src/index.js";
import type { ElementDef } from "../src/index.js";
import { lex } from "../src/lexer.js";
import { parse } from "../src/parser.js";
import { resolve } from "../src/ir.js";

const SRC = `plan "P" { units mm grid 50 room id=r at (0,0) size 4000x3000 label "R" }`;

describe("T4.5 — stage memo: lex", () => {
  it("returns the same tokens object for repeated source", () => {
    clearCache();
    const a = lex(SRC);
    const b = lex(SRC);
    expect(a).toBe(b);
  });
  it("different source → different object", () => {
    expect(lex(SRC)).not.toBe(lex(SRC + " "));
  });
});

describe("T4.5 — stage memo: parse", () => {
  it("returns the same AST for repeated (source, registry)", () => {
    clearCache();
    const a = parse(SRC);
    const b = parse(SRC);
    expect(a).toBe(b);
  });

  it("changing the registry busts the parse memo (no cross-plugin bleed)", () => {
    clearCache();
    const tree = registerElement({
      kind: "tree", keyword: "tree",
      parse: (c) => ({ kind: "tree", id: "", line: c.eatKeyword("tree").line } as never),
      idPrefix: () => "tree",
      resolve: (_n, c) => ({ kind: "tree", id: c.id } as never),
      bounds: () => [],
      render: () => [],
    } as ElementDef);
    const withBuiltins = parse(SRC, BUILTIN_REGISTRY);
    const withPlugin = parse(SRC, createRegistry([tree]));
    expect(withBuiltins).not.toBe(withPlugin); // distinct registry identity → distinct memo entry
  });

  it("clearCache() drops the parse memo (fresh object after)", () => {
    const a = parse(SRC);
    clearCache();
    const b = parse(SRC);
    expect(a).not.toBe(b);
  });
});

describe("T4.5 — stage memo: resolve", () => {
  it("returns the same IR for the same AST object", () => {
    clearCache();
    const { plan } = parse(SRC);
    const a = resolve(plan!);
    const b = resolve(plan!);
    expect(a).toBe(b);
  });
});

describe("T4.5 — memos are transparent (determinism intact)", () => {
  it("compile output is byte-identical with memos warm", () => {
    clearCache();
    const a = compile(SRC, { noCache: true });
    const b = compile(SRC, { noCache: true });
    expect(a.svg).toBe(b.svg);
  });
});
