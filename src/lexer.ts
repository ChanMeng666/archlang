/** Hand-written lexer for ArchLang. Zero dependencies; tracks line/col. */

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
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  /** For "number": the parsed value. For "dimension": w. */
  num?: number;
  /** For "dimension": h. */
  num2?: number;
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

export function lex(src: string): LexResult {
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

    // String literal with \" and \\ escapes
    if (c === '"') {
      advance();
      let value = "";
      let terminated = false;
      while (i < src.length) {
        const ch = peek();
        if (ch === "\\") {
          advance();
          const esc = advance();
          value += esc === "n" ? "\n" : esc;
          continue;
        }
        if (ch === '"') {
          advance();
          terminated = true;
          break;
        }
        if (ch === "\n") break; // strings don't span lines
        value += advance();
      }
      if (!terminated) {
        errors.push({ message: "Unterminated string literal", span: { start: startIdx, end: i } });
      }
      push("string", value, startLine, startCol, startIdx);
      continue;
    }

    // Punctuation & operators
    if (c === "(") { advance(); push("lparen", "(", startLine, startCol, startIdx); continue; }
    if (c === ")") { advance(); push("rparen", ")", startLine, startCol, startIdx); continue; }
    if (c === "{") { advance(); push("lcurly", "{", startLine, startCol, startIdx); continue; }
    if (c === "}") { advance(); push("rcurly", "}", startLine, startCol, startIdx); continue; }
    if (c === ",") { advance(); push("comma", ",", startLine, startCol, startIdx); continue; }
    if (c === "=") { advance(); push("equals", "=", startLine, startCol, startIdx); continue; }
    if (c === ":") { advance(); push("colon", ":", startLine, startCol, startIdx); continue; }
    if (c === "-" && peek(1) === ">") { advance(); advance(); push("arrow", "->", startLine, startCol, startIdx); continue; }

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
      if (peek() === ".") {
        raw += advance();
        while (isDigit(peek())) raw += advance();
      }
      const first = parseFloat(raw);
      // Dimension: <num>x<num>
      if (peek() === "x" && (isDigit(peek(1)) || (peek(1) === "." && isDigit(peek(2))))) {
        advance(); // consume 'x'
        let raw2 = "";
        while (isDigit(peek())) raw2 += advance();
        if (peek() === ".") {
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
