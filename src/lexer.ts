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

/** A piece of trivia: a line comment, kept so the formatter is non-destructive. */
export interface Comment {
  /** Byte span covering the comment including its leading `#` (excludes the newline). */
  span: { start: number; end: number };
  /** The comment text including the leading `#`. */
  text: string;
}

export interface LexResult {
  tokens: Token[];
  errors: { message: string; span: { start: number; end: number } }[];
  /** Line comments, in source order — trivia for the formatter / tooling. */
  comments: Comment[];
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

/**
 * Fold an optional metric unit suffix into millimetres by shifting the decimal
 * point of the raw digit string `shift` places to the right (×10^shift) —
 * cm→1, m→3, mm→0. Done on the string, never by float multiply, so
 * `3.333m` is exactly `3333` and `0.0005m` is exactly `0.5` (mm). parseFloat is
 * applied to the shifted string by the caller.
 */
function shiftDecimalLeft(raw: string, shift: number): string {
  if (shift === 0) return raw;
  const dot = raw.indexOf(".");
  const intPart = dot === -1 ? raw : raw.slice(0, dot);
  let fracPart = dot === -1 ? "" : raw.slice(dot + 1);
  while (fracPart.length < shift) fracPart += "0";
  const newInt = intPart + fracPart.slice(0, shift);
  const newFrac = fracPart.slice(shift);
  return newFrac.length > 0 ? `${newInt}.${newFrac}` : newInt;
}

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
  const comments: Comment[] = [];
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

  // The char after a metric unit suffix must not continue an identifier, EXCEPT
  // an `x` that begins the dimension separator (`3mx4`) — so `3meters` stays a
  // number plus the ident `meters`, while `3m` folds and `3mx4` still splits.
  const unitBoundaryOk = (len: number) => {
    const after = peek(len);
    if (!isIdentPart(after)) return true;
    return after === "x" && (isDigit(peek(len + 1)) || (peek(len + 1) === "." && isDigit(peek(len + 2))));
  };
  // Consume a trailing metric unit suffix (mm|cm|m, longest first) that sits
  // immediately after the digits (no whitespace) and return its decimal shift;
  // null if none applies. Advances past the suffix on a match.
  const scanUnitSuffix = (): number | null => {
    let shift = -1;
    let len = 0;
    if (peek(0) === "m" && peek(1) === "m" && unitBoundaryOk(2)) {
      shift = 0;
      len = 2;
    } else if (peek(0) === "c" && peek(1) === "m" && unitBoundaryOk(2)) {
      shift = 1;
      len = 2;
    } else if (peek(0) === "m" && unitBoundaryOk(1)) {
      shift = 3;
      len = 1;
    }
    if (len === 0) return null;
    for (let k = 0; k < len; k++) advance();
    return shift;
  };
  // Scan one numeric literal (digits, optional `.frac`, optional unit suffix)
  // starting at the cursor and fold any suffix into a millimetre value.
  const scanNum = (): number => {
    let raw = "";
    while (isDigit(peek())) raw += advance();
    // A "." is a decimal point only when a digit follows; ".." is the range op.
    if (peek() === "." && isDigit(peek(1))) {
      raw += advance();
      while (isDigit(peek())) raw += advance();
    }
    const shift = scanUnitSuffix();
    return parseFloat(shift === null ? raw : shiftDecimalLeft(raw, shift));
  };

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

    // Comment to end of line — captured as trivia (not a token). Exclude a
    // trailing CR so CRLF sources don't leave a stray `\r` in the comment text.
    if (c === "#") {
      while (i < src.length && peek() !== "\n") advance();
      const end = src[i - 1] === "\r" ? i - 1 : i;
      comments.push({ span: { start: startIdx, end }, text: src.slice(startIdx, end) });
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
    if (c === "(") {
      advance();
      push("lparen", "(", startLine, startCol, startIdx);
      continue;
    }
    if (c === ")") {
      advance();
      push("rparen", ")", startLine, startCol, startIdx);
      continue;
    }
    if (c === "{") {
      advance();
      push("lcurly", "{", startLine, startCol, startIdx);
      continue;
    }
    if (c === "}") {
      advance();
      push("rcurly", "}", startLine, startCol, startIdx);
      continue;
    }
    if (c === ",") {
      advance();
      push("comma", ",", startLine, startCol, startIdx);
      continue;
    }
    if (c === ":") {
      advance();
      push("colon", ":", startLine, startCol, startIdx);
      continue;
    }
    if (c === "[") {
      advance();
      push("lbracket", "[", startLine, startCol, startIdx);
      continue;
    }
    if (c === "]") {
      advance();
      push("rbracket", "]", startLine, startCol, startIdx);
      continue;
    }
    if (c === "-" && peek(1) === ">") {
      advance();
      advance();
      push("arrow", "->", startLine, startCol, startIdx);
      continue;
    }

    // Comparison / equality / logical operators (multi-char forms first).
    if (c === "=" && peek(1) === "=") {
      advance();
      advance();
      push("eq", "==", startLine, startCol, startIdx);
      continue;
    }
    if (c === "=") {
      advance();
      push("equals", "=", startLine, startCol, startIdx);
      continue;
    }
    if (c === "!" && peek(1) === "=") {
      advance();
      advance();
      push("ne", "!=", startLine, startCol, startIdx);
      continue;
    }
    if (c === "!") {
      advance();
      push("bang", "!", startLine, startCol, startIdx);
      continue;
    }
    if (c === "<" && peek(1) === "=") {
      advance();
      advance();
      push("le", "<=", startLine, startCol, startIdx);
      continue;
    }
    if (c === "<") {
      advance();
      push("lt", "<", startLine, startCol, startIdx);
      continue;
    }
    if (c === ">" && peek(1) === "=") {
      advance();
      advance();
      push("ge", ">=", startLine, startCol, startIdx);
      continue;
    }
    if (c === ">") {
      advance();
      push("gt", ">", startLine, startCol, startIdx);
      continue;
    }
    if (c === "&" && peek(1) === "&") {
      advance();
      advance();
      push("and", "&&", startLine, startCol, startIdx);
      continue;
    }
    if (c === "|" && peek(1) === "|") {
      advance();
      advance();
      push("or", "||", startLine, startCol, startIdx);
      continue;
    }
    if (c === "." && peek(1) === ".") {
      advance();
      advance();
      push("dotdot", "..", startLine, startCol, startIdx);
      continue;
    }

    // Arithmetic operators (unary minus is handled by the expression parser).
    if (c === "+") {
      advance();
      push("plus", "+", startLine, startCol, startIdx);
      continue;
    }
    if (c === "-") {
      advance();
      push("minus", "-", startLine, startCol, startIdx);
      continue;
    }
    if (c === "*") {
      advance();
      push("star", "*", startLine, startCol, startIdx);
      continue;
    }
    if (c === "/") {
      advance();
      push("slash", "/", startLine, startCol, startIdx);
      continue;
    }
    if (c === "%") {
      advance();
      push("percent", "%", startLine, startCol, startIdx);
      continue;
    }

    // Number (optionally part of a literal dimension WxH). Numbers are
    // non-negative; negation is a unary operator in expressions.
    if (isDigit(c) || (c === "." && isDigit(peek(1)))) {
      const first = scanNum();
      // Dimension: <num>x<num> (each component may carry its own unit suffix).
      if (peek() === "x" && (isDigit(peek(1)) || (peek(1) === "." && isDigit(peek(2))))) {
        advance(); // consume 'x'
        const second = scanNum();
        push("dimension", src.slice(startIdx, i), startLine, startCol, startIdx, { num: first, num2: second });
        continue;
      }
      push("number", src.slice(startIdx, i), startLine, startCol, startIdx, { num: first });
      continue;
    }

    // Identifier / keyword
    if (isIdentStart(c)) {
      // Compound relational keywords `right-of` / `left-of` lex as a single
      // ident so the hyphen is not mistaken for subtraction (these are the only
      // hyphenated words in the grammar; everything else keeps `a-b` as `a - b`).
      // Matched only as whole words: `right-of` followed by a non-ident char.
      let j = i;
      while (j < src.length && isIdentPart(src[j]!)) j++;
      const word = src.slice(i, j);
      if ((word === "right" || word === "left") && src[j] === "-") {
        let k = j + 1;
        while (k < src.length && isIdentPart(src[k]!)) k++;
        if (src.slice(j + 1, k) === "of" && !isIdentPart(src[k] ?? "")) {
          while (i < k) advance();
          push("ident", `${word}-of`, startLine, startCol, startIdx);
          continue;
        }
      }
      // Corner-anchor keywords `top-left` / `top-right` / `bottom-left` /
      // `bottom-right` lex as a single ident (same rule as `right-of`), so the
      // hyphen is not mistaken for subtraction in `furniture … anchor top-left`.
      if ((word === "top" || word === "bottom") && src[j] === "-") {
        let k = j + 1;
        while (k < src.length && isIdentPart(src[k]!)) k++;
        const tail = src.slice(j + 1, k);
        if ((tail === "left" || tail === "right") && !isIdentPart(src[k] ?? "")) {
          while (i < k) advance();
          push("ident", `${word}-${tail}`, startLine, startCol, startIdx);
          continue;
        }
      }
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
  return { tokens, errors, comments };
}
