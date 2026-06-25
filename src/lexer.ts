/** Hand-written lexer for ArchLang. Zero dependencies; tracks line/col. */

import { fnv1a } from "./hash.js";

export type TokenType =
  | "ident"
  | "number"
  | "string"
  | "dimension" // e.g. 4000x3000
  | "lparen"
  | "rparen"
  | "lcurly"
  | "rcurly"
  | "comma"
  | "equals"
  | "colon"
  | "arrow" // ->
  | "plus" // +
  | "minus" // - (binary or unary; arrow -> is separate)
  | "star" // *
  | "slash" // /
  | "percent" // %
  | "lbracket" // [
  | "rbracket" // ]
  | "lt" // <
  | "gt" // >
  | "le" // <=
  | "ge" // >=
  | "eq" // ==
  | "ne" // !=
  | "bang" // !
  | "and" // &&
  | "or" // ||
  | "dotdot" // .. (range)
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  /** For "number": the parsed value. For "dimension": w. */
  num?: number;
  /** For "dimension": h. */
  num2?: number;
  /** For "string": the exact source characters between the quotes (escapes
   *  intact), so the parser can find `{…}` interpolations. */
  raw?: string;
  line: number;
  col: number;
  /** Byte offset of the token's first character into the source. */
  start: number;
  /** Byte offset just past the token's last character. */
  end: number;
}

export interface LexResult {
  tokens: Token[];
  errors: { message: string; span: { start: number; end: number } }[];
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

// Stage memo: lexing is a pure function of the source text. Keyed by content
// hash (verified against the stored source on hit). Speeds re-lex on reparse.
const lexCache = new Map<string, { src: string; out: LexResult }>();
const LEX_CACHE_MAX = 32;

export function lex(src: string): LexResult {
  const key = fnv1a(src);
  const hit = lexCache.get(key);
  if (hit && hit.src === src) return hit.out;
  const out = lexImpl(src);
  if (lexCache.size >= LEX_CACHE_MAX) {
    const oldest = lexCache.keys().next().value;
    if (oldest !== undefined) lexCache.delete(oldest);
  }
  lexCache.set(key, { src, out });
  return out;
}

/** Clear the lex stage memo (called by `clearCache`). */
export function clearLexCache(): void {
  lexCache.clear();
}

function lexImpl(src: string): LexResult {
  const tokens: Token[] = [];
  const errors: { message: string; span: { start: number; end: number } }[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const peek = (o = 0) => src[i + o] ?? "";
  const advance = () => {
    const c = src[i++];
    if (c === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
    return c;
  };
  const push = (
    type: TokenType,
    value: string,
    startLine: number,
    startCol: number,
    startIdx: number,
    extra?: Partial<Token>,
  ) => tokens.push({ type, value, line: startLine, col: startCol, ...extra, start: startIdx, end: i });

  while (i < src.length) {
    const c = peek();
    const startLine = line;
    const startCol = col;
    const startIdx = i;

    // Whitespace
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance();
      continue;
    }

    // Comment to end of line
    if (c === "#") {
      while (i < src.length && peek() !== "\n") advance();
      continue;
    }

    // String literal with \" and \\ escapes. `raw` keeps the exact inner source
    // (escapes intact) so the parser can split out `{…}` interpolations.
    if (c === '"') {
      advance();
      const rawStart = i;
      let value = "";
      while (i < src.length) {
        const ch = peek();
        if (ch === "\\") {
          advance();
          const esc = advance();
          value += esc === "n" ? "\n" : esc;
          continue;
        }
        if (ch === '"') break; // closing quote — don't consume yet
        if (ch === "\n") break; // strings don't span lines
        value += advance();
      }
      const raw = src.slice(rawStart, i);
      let terminated = false;
      if (peek() === '"') {
        advance();
        terminated = true;
      }
      if (!terminated) {
        errors.push({ message: "Unterminated string literal", span: { start: startIdx, end: i } });
      }
      push("string", value, startLine, startCol, startIdx, { raw });
      continue;
    }

    // Punctuation & operators
    if (c === "(") { advance(); push("lparen", "(", startLine, startCol, startIdx); continue; }
    if (c === ")") { advance(); push("rparen", ")", startLine, startCol, startIdx); continue; }
    if (c === "{") { advance(); push("lcurly", "{", startLine, startCol, startIdx); continue; }
    if (c === "}") { advance(); push("rcurly", "}", startLine, startCol, startIdx); continue; }
    if (c === ",") { advance(); push("comma", ",", startLine, startCol, startIdx); continue; }
    if (c === ":") { advance(); push("colon", ":", startLine, startCol, startIdx); continue; }
    if (c === "[") { advance(); push("lbracket", "[", startLine, startCol, startIdx); continue; }
    if (c === "]") { advance(); push("rbracket", "]", startLine, startCol, startIdx); continue; }
    if (c === "-" && peek(1) === ">") { advance(); advance(); push("arrow", "->", startLine, startCol, startIdx); continue; }

    // Comparison / equality / logical operators (multi-char forms first).
    if (c === "=" && peek(1) === "=") { advance(); advance(); push("eq", "==", startLine, startCol, startIdx); continue; }
    if (c === "=") { advance(); push("equals", "=", startLine, startCol, startIdx); continue; }
    if (c === "!" && peek(1) === "=") { advance(); advance(); push("ne", "!=", startLine, startCol, startIdx); continue; }
    if (c === "!") { advance(); push("bang", "!", startLine, startCol, startIdx); continue; }
    if (c === "<" && peek(1) === "=") { advance(); advance(); push("le", "<=", startLine, startCol, startIdx); continue; }
    if (c === "<") { advance(); push("lt", "<", startLine, startCol, startIdx); continue; }
    if (c === ">" && peek(1) === "=") { advance(); advance(); push("ge", ">=", startLine, startCol, startIdx); continue; }
    if (c === ">") { advance(); push("gt", ">", startLine, startCol, startIdx); continue; }
    if (c === "&" && peek(1) === "&") { advance(); advance(); push("and", "&&", startLine, startCol, startIdx); continue; }
    if (c === "|" && peek(1) === "|") { advance(); advance(); push("or", "||", startLine, startCol, startIdx); continue; }
    if (c === "." && peek(1) === ".") { advance(); advance(); push("dotdot", "..", startLine, startCol, startIdx); continue; }

    // Arithmetic operators (unary minus is handled by the expression parser).
    if (c === "+") { advance(); push("plus", "+", startLine, startCol, startIdx); continue; }
    if (c === "-") { advance(); push("minus", "-", startLine, startCol, startIdx); continue; }
    if (c === "*") { advance(); push("star", "*", startLine, startCol, startIdx); continue; }
    if (c === "/") { advance(); push("slash", "/", startLine, startCol, startIdx); continue; }
    if (c === "%") { advance(); push("percent", "%", startLine, startCol, startIdx); continue; }

    // Number (optionally part of a literal dimension WxH). Numbers are
    // non-negative; negation is a unary operator in expressions.
    if (isDigit(c) || (c === "." && isDigit(peek(1)))) {
      let raw = "";
      while (isDigit(peek())) raw += advance();
      // A "." is a decimal point only when a digit follows; ".." is the range op.
      if (peek() === "." && isDigit(peek(1))) {
        raw += advance();
        while (isDigit(peek())) raw += advance();
      }
      const first = parseFloat(raw);
      // Dimension: <num>x<num>
      if (peek() === "x" && (isDigit(peek(1)) || (peek(1) === "." && isDigit(peek(2))))) {
        advance(); // consume 'x'
        let raw2 = "";
        while (isDigit(peek())) raw2 += advance();
        if (peek() === "." && isDigit(peek(1))) {
          raw2 += advance();
          while (isDigit(peek())) raw2 += advance();
        }
        const second = parseFloat(raw2);
        push("dimension", `${raw}x${raw2}`, startLine, startCol, startIdx, { num: first, num2: second });
        continue;
      }
      push("number", raw, startLine, startCol, startIdx, { num: first });
      continue;
    }

    // Identifier / keyword
    if (isIdentStart(c)) {
      let value = "";
      while (i < src.length && isIdentPart(peek())) value += advance();
      push("ident", value, startLine, startCol, startIdx);
      continue;
    }

    // Unknown character
    errors.push({ message: `Unexpected character ${JSON.stringify(c)}`, span: { start: startIdx, end: startIdx + 1 } });
    advance();
  }

  push("eof", "", line, col, i);
  return { tokens, errors };
}
