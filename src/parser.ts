/** Recursive-descent parser: tokens -> PlanNode. Registry-driven element dispatch. */

import type { Token } from "./lexer.js";
import { lex } from "./lexer.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type {
  AssignNode,
  ComponentDef,
  ExprPoint,
  ForNode,
  IfNode,
  InstanceNode,
  LetNode,
  NorthDir,
  PlanNode,
  SetNode,
  SetOverride,
  Statement,
  TitleNode,
  WhileNode,
} from "./ast.js";
import type { Expr } from "./expr.js";
import { parseExpr as parseExprPratt } from "./expr.js";
import type { Theme } from "./theme.js";
import { isNumericThemeKey, resolveThemeKey } from "./theme.js";
import type { ParseCtx } from "./registry.js";
import { registry } from "./elements/index.js";

export interface ParseOutcome {
  plan?: PlanNode;
  diagnostics: Diagnostic[];
}

/** Plan-level settings + binding/definition keywords (not registry elements). */
const SETTINGS = ["units", "grid", "scale", "north", "title", "theme", "let", "component"];
/** Control-flow + rule keywords that begin a body statement. */
const CONTROL = ["for", "if", "while", "set"];
/** Keywords that begin a plan-body statement; recovery resynchronizes to one. */
const STATEMENT_STARTS = new Set<string>([...SETTINGS, ...CONTROL, ...registry.keys()]);

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
      parseStringExpr: () => this.parseStringExpr(),
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
      components: new Map(),
      body: [],
    };

    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      const start = t.start;
      try {
        if (t.type !== "ident") this.fail(`Expected a statement but found ${describe(t)}`);
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
          case "theme": {
            plan.theme = { ...plan.theme, ...this.parseTheme() };
            break;
          }
          case "component": {
            const def = this.parseComponent(plan.components);
            def.span = this.spanFrom(start);
            if (plan.components.has(def.name)) {
              this.fail(`Component "${def.name}" is already defined`, t);
            }
            plan.components.set(def.name, def);
            break;
          }
          // Elements, `let`, instances, control flow, and assignment all flow
          // through the shared body-statement parser.
          default:
            plan.body.push(this.parseOneBodyStatement(plan.components, undefined));
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

  /** `theme { key: <value> … }` — colours (strings), `lineWeight` (number), `font` (string). */
  private parseTheme(): Partial<Theme> {
    this.eatKeyword("theme");
    this.eat("lcurly");
    const t: Partial<Theme> = {};
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const keyTok = this.eatIdent();
      if (this.isType("colon")) this.next();
      const resolved = resolveThemeKey(keyTok.value);
      if (!resolved) {
        this.diagnostics.push({
          severity: "warning",
          message: `Unknown theme key "${keyTok.value}"`,
          code: "W_UNKNOWN_THEME_KEY",
          span: { start: keyTok.start, end: keyTok.end },
        });
        if (this.isType("string") || this.isType("number")) this.next();
        else this.fail(`Expected a value for theme key "${keyTok.value}"`);
        continue;
      }
      if (isNumericThemeKey(resolved)) {
        (t as Record<string, unknown>)[resolved] = this.eatNumber();
      } else {
        (t as Record<string, unknown>)[resolved] = this.eatString();
      }
    }
    this.eat("rcurly");
    return t;
  }

  private parseLet(): LetNode {
    const kw = this.eatKeyword("let");
    const name = this.eatIdent().value;
    // `let NAME(params) = body` defines a value-function (closure).
    if (this.isType("lparen")) {
      this.next();
      const params: string[] = [];
      while (!this.isType("rparen") && !this.isType("eof")) {
        params.push(this.eatIdent().value);
        if (this.isType("comma")) this.next();
        else break;
      }
      this.eat("rparen");
      this.eat("equals");
      const body = parseExprPratt(this.ctx);
      return { kind: "let", id: "", name, value: { t: "fnlit", params, body }, line: kw.line };
    }
    this.eat("equals");
    const value = parseExprPratt(this.ctx);
    return { kind: "let", id: "", name, value, line: kw.line };
  }

  private parseInstance(): InstanceNode {
    const nameTok = this.eatIdent();
    this.eat("lparen");
    const args: Expr[] = [];
    while (!this.isType("rparen") && !this.isType("eof")) {
      args.push(parseExprPratt(this.ctx));
      if (this.isType("comma")) this.next();
      else break;
    }
    this.eat("rparen");
    return { kind: "instance", id: "", name: nameTok.value, args, line: nameTok.line };
  }

  /** `NAME = <expr>` — reassign an existing binding. */
  private parseAssign(): AssignNode {
    const nameTok = this.eatIdent();
    this.eat("equals");
    const value = parseExprPratt(this.ctx);
    return { kind: "assign", id: "", name: nameTok.value, value, line: nameTok.line };
  }

  /**
   * Parse one body statement: an element, `let`, instance, `for`/`if`/`while`,
   * or assignment. Shared by the plan body, component bodies, and control-flow
   * blocks. `selfName` permits a component body to call itself recursively.
   */
  private parseOneBodyStatement(components: Map<string, ComponentDef>, selfName?: string): Statement {
    const t = this.peek();
    const start = t.start;
    if (t.type !== "ident") this.fail(`Expected a statement but found ${describe(t)}`);
    let node: Statement;
    if (t.value === "for") node = this.parseFor(components, selfName);
    else if (t.value === "if") node = this.parseIf(components, selfName);
    else if (t.value === "while") node = this.parseWhile(components, selfName);
    else if (t.value === "set") node = this.parseSet();
    else {
      const def = registry.get(t.value);
      if (def) node = def.parse(this.ctx);
      else if (t.value === "let") node = this.parseLet();
      // An ident immediately followed by "=" is an assignment.
      else if (this.peek(1).type === "equals") node = this.parseAssign();
      // A defined component (or this one, recursively) followed by "(" is a call.
      else if ((components.has(t.value) || t.value === selfName) && this.peek(1).type === "lparen") node = this.parseInstance();
      else this.fail(`Unknown statement "${t.value}"`, t);
    }
    node.span = this.spanFrom(start);
    return node;
  }

  /** Parse a `{ … }` block of body statements (with per-statement recovery). */
  private parseBlockBody(components: Map<string, ComponentDef>, selfName?: string): Statement[] {
    this.eat("lcurly");
    const body: Statement[] = [];
    while (!this.isType("rcurly") && !this.isType("eof")) {
      try {
        body.push(this.parseOneBodyStatement(components, selfName));
      } catch (e) {
        if (e instanceof ParseError) {
          this.diagnostics.push({ severity: "error", message: e.message, span: e.span });
          this.synchronize();
        } else {
          throw e;
        }
      }
    }
    this.eat("rcurly");
    return body;
  }

  /** `for NAME in <expr> { body }`. */
  private parseFor(components: Map<string, ComponentDef>, selfName?: string): ForNode {
    const kw = this.eatKeyword("for");
    const varName = this.eatIdent().value;
    this.eatKeyword("in");
    const iter = parseExprPratt(this.ctx);
    const body = this.parseBlockBody(components, selfName);
    return { kind: "for", id: "", varName, iter, body, line: kw.line };
  }

  /** `if <expr> { then } [else { else }]`. */
  private parseIf(components: Map<string, ComponentDef>, selfName?: string): IfNode {
    const kw = this.eatKeyword("if");
    const cond = parseExprPratt(this.ctx);
    const then = this.parseBlockBody(components, selfName);
    let els: Statement[] | undefined;
    if (this.isKeyword("else")) {
      this.next();
      els = this.parseBlockBody(components, selfName);
    }
    return { kind: "if", id: "", cond, then, else: els, line: kw.line };
  }

  /** `set <kind>(key: value, …)` — scoped default overrides for an element kind. */
  private parseSet(): SetNode {
    const kw = this.eatKeyword("set");
    const targetTok = this.eatIdent();
    const def = registry.get(targetTok.value);
    if (!def) this.fail(`Unknown element kind "${targetTok.value}" in "set" rule`, targetTok);
    this.eat("lparen");
    const over: SetOverride[] = [];
    while (!this.isType("rparen") && !this.isType("eof")) {
      const key = this.eatIdent().value;
      this.eat("colon");
      over.push({ key, value: this.parseSetValue() });
      if (this.isType("comma")) this.next();
      else break;
    }
    this.eat("rparen");
    return { kind: "set", id: "", target: def.kind, over, line: kw.line };
  }

  /** Parse a string literal as a (possibly interpolated) template expression. */
  private parseStringExpr(): Expr {
    const t = this.peek();
    if (t.type !== "string") this.fail(`Expected a string but found ${describe(t)}`);
    return parseExprPratt(this.ctx);
  }

  /** A `set` value: a bare keyword (enum like `out`/`left`) is a string;
   *  anything else is a normal expression. */
  private parseSetValue(): Expr {
    const t = this.peek();
    if (t.type === "ident" && (this.peek(1).type === "comma" || this.peek(1).type === "rparen")) {
      this.next();
      return { t: "str", parts: [t.value] };
    }
    return parseExprPratt(this.ctx);
  }

  /** `while <expr> { body }`. */
  private parseWhile(components: Map<string, ComponentDef>, selfName?: string): WhileNode {
    const kw = this.eatKeyword("while");
    const cond = parseExprPratt(this.ctx);
    const body = this.parseBlockBody(components, selfName);
    return { kind: "while", id: "", cond, body, line: kw.line };
  }

  /** `component NAME(p1, p2, …) { <statements> }`. */
  private parseComponent(components: Map<string, ComponentDef>): ComponentDef {
    const kw = this.eatKeyword("component");
    const name = this.eatIdent().value;
    this.eat("lparen");
    const params: string[] = [];
    while (!this.isType("rparen") && !this.isType("eof")) {
      params.push(this.eatIdent().value);
      if (this.isType("comma")) this.next();
      else break;
    }
    this.eat("rparen");
    const body = this.parseBlockBody(components, name);
    return { name, params, body, line: kw.line };
  }
}

function describe(t: Token): string {
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}
