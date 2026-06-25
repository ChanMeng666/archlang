/** Recursive-descent parser: tokens -> PlanNode. Registry-driven element dispatch. */

import type { Token } from "./lexer.js";
import { lex } from "./lexer.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type { ExprPoint, NorthDir, PlanNode, TitleNode } from "./ast.js";
import type { Expr } from "./expr.js";
import { parseExpr as parseExprPratt } from "./expr.js";
import type { ParseCtx } from "./registry.js";
import { registry } from "./elements/index.js";

export interface ParseOutcome {
  plan?: PlanNode;
  diagnostics: Diagnostic[];
}

/** Plan-level settings (not registry elements). */
const SETTINGS = ["units", "grid", "scale", "north", "title"];
/** Keywords that begin a plan-body statement; recovery resynchronizes to one. */
const STATEMENT_STARTS = new Set<string>([...SETTINGS, ...registry.keys()]);

/** Thrown internally by `eat*` helpers; always caught within the parser. */
class ParseError extends Error {
  constructor(public override message: string, public span: Span) {
    super(message);
  }
}

export function parse(src: string): ParseOutcome {
  const { tokens, errors: lexErrors } = lex(src);
  const lexDiags: Diagnostic[] = lexErrors.map((e) => ({
    severity: "error" as const,
    message: e.message,
    span: e.span,
  }));

  const p = new Parser(tokens);
  let plan: PlanNode | undefined;
  try {
    plan = p.parsePlan();
  } catch (e) {
    // Only a malformed plan *header* escapes parsePlan's per-statement recovery.
    if (e instanceof ParseError) {
      p.diagnostics.push({ severity: "error", message: e.message, span: e.span });
    } else {
      throw e;
    }
  }
  return { plan, diagnostics: [...lexDiags, ...p.diagnostics] };
}

class Parser {
  private pos = 0;
  public diagnostics: Diagnostic[] = [];
  /** Facade passed to element parse functions (see registry.ts). */
  private readonly ctx: ParseCtx;

  constructor(private toks: Token[]) {
    this.ctx = {
      peek: (o) => this.peek(o),
      next: () => this.next(),
      eat: (type) => this.eat(type),
      eatKeyword: (kw) => this.eatKeyword(kw),
      eatIdent: () => this.eatIdent(),
      eatNumber: () => this.eatNumber(),
      eatString: () => this.eatString(),
      isKeyword: (kw, o) => this.isKeyword(kw, o),
      isType: (type) => this.isType(type),
      parsePoint: () => this.parsePoint(),
      parseExpr: () => parseExprPratt(this.ctx),
      parseDimensions: () => this.parseDimensions(),
      parseIdOpt: () => this.parseIdOpt(),
      fail: (msg, t) => this.fail(msg, t),
    };
  }

  private peek(o = 0): Token {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)];
  }
  private next(): Token {
    return this.toks[Math.min(this.pos++, this.toks.length - 1)];
  }
  private fail(msg: string, t = this.peek()): never {
    throw new ParseError(msg, { start: t.start, end: t.end });
  }

  /** Span from a start offset to the end of the last consumed token. */
  private spanFrom(start: number): Span {
    const last = this.toks[Math.max(0, Math.min(this.pos - 1, this.toks.length - 1))];
    return { start, end: last.end };
  }

  /** Recover after a statement error: skip to the next statement start or block end. */
  private synchronize(): void {
    // Always make progress so a hard-stuck token can't loop forever.
    if (!this.isType("rcurly") && !this.isType("eof")) this.next();
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      if (t.type === "ident" && STATEMENT_STARTS.has(t.value)) return;
      this.next();
    }
  }

  private isKeyword(kw: string, o = 0): boolean {
    const t = this.peek(o);
    return t.type === "ident" && t.value === kw;
  }
  private eatKeyword(kw: string): Token {
    const t = this.peek();
    if (t.type !== "ident" || t.value !== kw) this.fail(`Expected "${kw}" but found ${describe(t)}`);
    return this.next();
  }
  private eat(type: Token["type"]): Token {
    const t = this.peek();
    if (t.type !== type) this.fail(`Expected ${type} but found ${describe(t)}`);
    return this.next();
  }
  private eatIdent(): Token {
    return this.eat("ident");
  }
  private eatNumber(): number {
    const t = this.eat("number");
    return t.num!;
  }
  private eatString(): string {
    return this.eat("string").value;
  }

  parsePlan(): PlanNode {
    this.eatKeyword("plan");
    const name = this.eatString();
    this.eat("lcurly");

    const plan: PlanNode = {
      name,
      units: "mm",
      grid: 0,
      north: "up",
      elements: [],
    };

    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      const start = t.start;
      try {
        if (t.type !== "ident") this.fail(`Expected a statement but found ${describe(t)}`);
        const def = registry.get(t.value);
        if (def) {
          const node = def.parse(this.ctx);
          node.span = this.spanFrom(start);
          plan.elements.push(node);
          continue;
        }
        switch (t.value) {
          case "units": {
            this.next();
            const u = this.eatIdent().value;
            if (u !== "mm") this.fail(`Unsupported units "${u}" (only "mm" is supported)`, t);
            plan.units = "mm";
            break;
          }
          case "grid":
            this.next();
            plan.grid = this.eatNumber();
            break;
          case "scale": {
            this.next();
            const a = this.eatNumber();
            this.eat("colon");
            const b = this.eatNumber();
            plan.scale = `${a}:${b}`;
            break;
          }
          case "north":
            this.next();
            plan.north = this.parseNorth();
            break;
          case "title": {
            const n = this.parseTitle();
            n.span = this.spanFrom(start);
            plan.title = n;
            break;
          }
          default:
            this.fail(`Unknown statement "${t.value}"`, t);
        }
      } catch (e) {
        if (e instanceof ParseError) {
          this.diagnostics.push({ severity: "error", message: e.message, span: e.span });
          this.synchronize();
        } else {
          throw e;
        }
      }
    }
    // A missing closing brace is reported but the partial plan is still returned.
    try {
      this.eat("rcurly");
    } catch (e) {
      if (e instanceof ParseError) {
        this.diagnostics.push({ severity: "error", message: e.message, span: e.span });
      } else {
        throw e;
      }
    }
    return plan;
  }

  private isType(type: Token["type"]): boolean {
    return this.peek().type === type;
  }

  /** Optional `id=<ident>` prefix; returns "" when absent. */
  private parseIdOpt(): string {
    if (this.isKeyword("id")) {
      this.next();
      this.eat("equals");
      return this.eatIdent().value;
    }
    return "";
  }

  private parseNorth(): NorthDir {
    const t = this.peek();
    if (t.type === "number") {
      this.next();
      return { deg: t.num! };
    }
    if (t.type === "ident" && ["up", "down", "left", "right"].includes(t.value)) {
      this.next();
      return t.value as NorthDir;
    }
    this.fail(`Expected a north direction (up|down|left|right|<degrees>) but found ${describe(t)}`);
  }

  private parsePoint(): ExprPoint {
    this.eat("lparen");
    const x = parseExprPratt(this.ctx);
    this.eat("comma");
    const y = parseExprPratt(this.ctx);
    this.eat("rparen");
    return { x, y };
  }

  /** A size: either a `WxH` literal dimension token or `<expr> x <expr>`. */
  private parseDimensions(): { w: Expr; h: Expr } {
    if (this.isType("dimension")) {
      const d = this.eat("dimension");
      return { w: { t: "num", value: d.num! }, h: { t: "num", value: d.num2! } };
    }
    const w = parseExprPratt(this.ctx);
    if (this.isKeyword("x")) this.next();
    else this.fail(`Expected "x" between width and height but found ${describe(this.peek())}`);
    const h = parseExprPratt(this.ctx);
    return { w, h };
  }

  private parseTitle(): TitleNode {
    const kw = this.eatKeyword("title");
    this.eat("lcurly");
    const node: TitleNode = { line: kw.line };
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      if (t.type !== "ident") this.fail(`Expected a title field but found ${describe(t)}`);
      switch (t.value) {
        case "project":
          this.next();
          node.project = this.eatString();
          break;
        case "drawn_by":
          this.next();
          node.drawnBy = this.eatString();
          break;
        case "date":
          this.next();
          node.date = this.eatString();
          break;
        default:
          this.fail(`Unknown title field "${t.value}"`, t);
      }
    }
    this.eat("rcurly");
    return node;
  }
}

function describe(t: Token): string {
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}
