import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

// vscode-textmate / vscode-oniguruma are CommonJS dev-only deps (not shipped).
const require = createRequire(import.meta.url);
const { Registry, parseRawGrammar, INITIAL } = require("vscode-textmate");
const { loadWASM, OnigScanner, OnigString } = require("vscode-oniguruma");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const grammarPath = join(root, "editors", "archlang.tmLanguage.json");

interface Tok {
  text: string;
  scopes: string[];
}

/** Tokenize a source string with the shipped TextMate grammar. */
async function tokenize(source: string): Promise<Tok[]> {
  const wasm = readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm"));
  await loadWASM(wasm.buffer);
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p: string[]) => new OnigScanner(p),
      createOnigString: (s: string) => new OnigString(s),
    }),
    loadGrammar: async (scope: string) =>
      scope === "source.arch"
        ? parseRawGrammar(readFileSync(grammarPath, "utf8"), "archlang.tmLanguage.json")
        : null,
  });
  const grammar = await registry.loadGrammar("source.arch");
  if (!grammar) throw new Error("grammar failed to load");

  const out: Tok[] = [];
  let rules = INITIAL;
  for (const line of source.split(/\r?\n/)) {
    const r = grammar.tokenizeLine(line, rules);
    for (const t of r.tokens) out.push({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes });
    rules = r.ruleStack;
  }
  return out;
}

describe("tmLanguage grammar highlights .arch", () => {
  let tokens: Tok[];
  beforeAll(async () => {
    tokens = await tokenize(readFileSync(join(root, "examples", "studio.arch"), "utf8"));
  });

  const scopesOf = (text: string) => (tokens.find((t) => t.text === text)?.scopes ?? []).join(" ");

  it.each([
    ["plan", "keyword.control.arch"],
    ["component", "keyword.control.arch"],
    ["wall", "storage.type.element.arch"],
    ["room", "storage.type.element.arch"],
    ["door", "storage.type.element.arch"],
    ["thickness", "keyword.other.arch"],
    ["units", "keyword.other.arch"],
    ["hinge", "keyword.other.arch"],
    ["up", "constant.language.arch"],
    ["left", "constant.language.arch"],
    ["200", "constant.numeric.arch"],
  ])("scopes %s as %s", async (text, want) => {
    const src = `plan "P" { component c() {} ${text} }`;
    const toks = await tokenize(src);
    const s = (toks.find((t) => t.text === text)?.scopes ?? []).join(" ");
    expect(s).toContain(want);
  });

  it("scopes a literal dimension as constant.numeric.dimension", () => {
    const dim = tokens.find((t) => /^[0-9]+x[0-9]+$/.test(t.text));
    expect(dim, "no dimension token found in studio.arch").toBeDefined();
    expect(dim!.scopes.join(" ")).toContain("constant.numeric.dimension.arch");
  });

  it("scopes comments and strings", () => {
    expect(tokens.some((t) => t.scopes.join(" ").includes("comment.line"))).toBe(true);
    expect(tokens.some((t) => t.scopes.join(" ").includes("string.quoted.double"))).toBe(true);
  });

  it("scopes the door swing/hinge enum values", () => {
    expect(scopesOf("swing")).toContain("keyword.other.arch");
    expect(scopesOf("in")).toContain("constant.language.arch");
  });
});
