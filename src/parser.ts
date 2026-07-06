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
  ImportItem,
  ImportNode,
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
import { isNumericThemeKey, resolveThemeKey, resolveStyleKey } from "./theme.js";
import { isDisallowedConfigValue } from "./sanitize.js";
import { fnv1a } from "./hash.js";
import { idToken } from "./identity.js";
import type { ParseCtx, Registry } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import { STATEMENT_STARTS } from "./grammar/tokens.js";

export interface ParseOutcome {
  plan?: PlanNode;
  diagnostics: Diagnostic[];
}

/** Keywords that begin a plan-body statement (registry element keywords are added
 *  per-parse, so recovery is plugin-aware). Sourced from the one grammar file
 *  (`src/grammar/tokens.ts`) so the parser and the editor grammars stay in sync. */
const FIXED_STATEMENT_STARTS: readonly string[] = STATEMENT_STARTS;

/** Thrown internally by `eat*` helpers; always caught within the parser. */
class ParseError extends Error {
  constructor(
    public override message: string,
    public span: Span,
  ) {
    super(message);
  }
}

// Stage memo: parsing is a pure function of (source, registry). Keyed by content
// hash + registry identity (a plugin changes parse output), source verified on
// hit. The cached PlanNode is never mutated downstream (link clones before
// merging; resolve reads only), so sharing it is safe.
const parseCache = new Map<string, { src: string; out: ParseOutcome }>();
const PARSE_CACHE_MAX = 32;

/** Clear the parse stage memo (called by `clearCache`). */
export function clearParseCache(): void {
  parseCache.clear();
}

export function parse(src: string, registry: Registry = BUILTIN_REGISTRY): ParseOutcome {
  const key = `${fnv1a(src)}|${idToken(registry)}`;
  const hit = parseCache.get(key);
  if (hit && hit.src === src) return hit.out;
  const out = parseImpl(src, registry);
  if (parseCache.size >= PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  parseCache.set(key, { src, out });
  return out;
}

function parseImpl(src: string, registry: Registry): ParseOutcome {
  const { tokens, errors: lexErrors, comments } = lex(src);
  const lexDiags: Diagnostic[] = lexErrors.map((e) => ({
    severity: "error" as const,
    message: e.message,
    span: e.span,
  }));

  // parsePlan never throws on user source: it recovers from a malformed header
  // and from per-statement errors, so a PlanNode (possibly partial) is always
  // produced — `CompileResult.ast` is present even on broken input.
  const p = new Parser(tokens, registry);
  const plan = p.parsePlan();
  plan.comments = comments;
  return { plan, diagnostics: [...lexDiags, ...p.diagnostics] };
}

class Parser {
  private pos = 0;
  public diagnostics: Diagnostic[] = [];
  /** Facade passed to element parse functions (see registry.ts). */
  private readonly ctx: ParseCtx;
  /** Statement-start keywords for recovery resync — fixed keywords + this
   *  registry's element keywords (so plugin elements resync correctly). */
  private readonly statementStarts: ReadonlySet<string>;

  constructor(
    private toks: Token[],
    private readonly registry: Registry = BUILTIN_REGISTRY,
  ) {
    this.statementStarts = new Set<string>([...FIXED_STATEMENT_STARTS, ...registry.byKeyword.keys()]);
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
      isStatementStart: (v) => this.statementStarts.has(v),
      parsePoint: () => this.parsePoint(),
      parseExpr: () => parseExprPratt(this.ctx),
      parseDimensions: () => this.parseDimensions(),
      parseStringExpr: () => this.parseStringExpr(),
      parseIdOpt: () => this.parseIdOpt(),
      fail: (msg, t) => this.fail(msg, t),
    };
  }

  // The token list always ends with EOF, so the clamped index is present.
  private peek(o = 0): Token {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)]!;
  }
  private next(): Token {
    return this.toks[Math.min(this.pos++, this.toks.length - 1)]!;
  }
  private fail(msg: string, t = this.peek()): never {
    throw new ParseError(msg, { start: t.start, end: t.end });
  }

  /** Span from a start offset to the end of the last consumed token. */
  private spanFrom(start: number): Span {
    const last = this.toks[Math.max(0, Math.min(this.pos - 1, this.toks.length - 1))]!;
    return { start, end: last.end };
  }

  /**
   * Recover after a statement error: skip to the next statement start or block
   * end. `failStart` is the byte offset where the failed statement began; we
   * only stop at a statement-start keyword *past* it, which both (a) preserves a
   * next-statement keyword the expression recovery guard refused to consume, and
   * (b) guarantees forward progress (the failing token itself is always skipped),
   * so a hard-stuck token can't loop forever.
   */
  private synchronize(failStart: number): void {
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      if (t.start > failStart && t.type === "ident" && this.statementStarts.has(t.value)) return;
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
    const plan: PlanNode = {
      name: "",
      units: "mm",
      grid: 0,
      north: "up",
      components: new Map(),
      imports: [],
      body: [],
    };

    // Header recovery: a malformed `plan "name" {` is reported but does not bail —
    // we skip to the opening brace (or the first statement keyword) and parse the
    // body anyway, so a partial tree is still produced.
    try {
      this.eatKeyword("plan");
      plan.name = this.eatString();
      plan.bodyStart = this.eat("lcurly").end;
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.diagnostics.push({ severity: "error", message: e.message, span: e.span });
      while (!this.isType("eof") && !this.isType("lcurly")) {
        const t = this.peek();
        if (t.type === "ident" && this.statementStarts.has(t.value)) break;
        this.next();
      }
      if (this.isType("lcurly")) this.next();
    }

    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      const start = t.start;
      try {
        if (t.type !== "ident") this.fail(`Expected a statement but found ${describe(t)}`);
        switch (t.value) {
          case "units":
            this.parseUnitsSetting(plan, t);
            break;
          case "grid":
            this.next();
            plan.grid = this.eatNumber();
            break;
          case "scale":
            this.parseScaleSetting(plan);
            break;
          case "north":
            this.next();
            plan.north = this.parseNorth();
            break;
          case "dims":
            this.parseDimsSetting(plan, t);
            break;
          case "title": {
            const n = this.parseTitle();
            n.span = this.spanFrom(start);
            plan.title = n;
            break;
          }
          case "accTitle":
            this.next();
            if (plan.accTitle !== undefined) this.warnDupAcc("accTitle", t);
            plan.accTitle = this.eatString();
            break;
          case "accDescr":
            this.next();
            if (plan.accDescr !== undefined) this.warnDupAcc("accDescr", t);
            plan.accDescr = this.eatString();
            break;
          case "theme": {
            const r = this.parseTheme();
            if (r.base !== undefined) plan.themeBase = r.base;
            if (r.from !== undefined) plan.themeFrom = r.from;
            plan.theme = { ...plan.theme, ...r.theme };
            break;
          }
          case "style": {
            const { kind, style } = this.parseStyle();
            plan.styles = { ...plan.styles, [kind]: { ...plan.styles?.[kind], ...style } };
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
          case "import": {
            const imp = this.parseImport();
            imp.span = this.spanFrom(start);
            plan.imports.push(imp);
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
          this.synchronize(start);
          plan.body.push({ kind: "error", id: "", line: t.line, message: e.message, span: this.spanFrom(start) });
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

  // ---- plan-level settings (one method per `parsePlan` switch case) ----------

  /** A repeated `accTitle`/`accDescr` at plan level: last value wins, but flag it
   *  (catalogued warning) since a duplicate metadata line is almost always a mistake. */
  private warnDupAcc(kw: string, t: Token): void {
    this.diagnostics.push({
      severity: "warning",
      message: `Duplicate "${kw}" — the last one wins`,
      code: "W_DUP_ACC_METADATA",
      span: { start: t.start, end: t.end },
    });
  }

  private parseUnitsSetting(plan: PlanNode, t: Token): void {
    this.next();
    const u = this.eatIdent().value;
    if (u !== "mm") this.fail(`Unsupported units "${u}" (only "mm" is supported)`, t);
    plan.units = "mm";
  }

  private parseScaleSetting(plan: PlanNode): void {
    this.next();
    const a = this.eatNumber();
    this.eat("colon");
    const b = this.eatNumber();
    plan.scale = `${a}:${b}`;
  }

  private parseDimsSetting(plan: PlanNode, t: Token): void {
    this.next();
    const a = this.eatIdent().value;
    if (a !== "auto") this.fail(`Expected "auto" after "dims" but found "${a}"`, t);
    let mode: "overall" | "rooms" | "walls" | "all" = "all";
    if (this.isType("ident") && ["overall", "rooms", "walls", "all"].includes(this.peek().value)) {
      mode = this.eatIdent().value as "overall" | "rooms" | "walls" | "all";
    }
    plan.autoDims = mode;
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

  /**
   * Theme directive, in three shapes:
   *   - `theme { key: <value> … }`              — overrides only
   *   - `theme <name> [ { … } ]`                — named base + optional overrides
   *   - `theme from "#color"`                   — derive poché from one wall colour
   */
  private parseTheme(): { base?: string; from?: string; theme: Partial<Theme> } {
    this.eatKeyword("theme");
    if (this.isKeyword("from")) {
      this.next();
      return { from: this.eatString(), theme: {} };
    }
    // A leading ident is a named base (`theme blueprint { … }` or just `theme blueprint`).
    const base = this.isType("ident") ? this.eatIdent().value : undefined;
    const theme: Partial<Theme> = {};
    if (this.isType("lcurly")) {
      this.eat("lcurly");
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
          (theme as Record<string, unknown>)[resolved] = this.eatNumber();
        } else {
          (theme as Record<string, unknown>)[resolved] = this.sanitizedStringValue(keyTok, "theme");
        }
      }
      this.eat("rcurly");
    }
    return { base, theme };
  }

  /** Eat a string value, blanking it (with a diagnostic) if it carries a
   *  disallowed token — markup or a `data:` URL (untrusted source config). */
  private sanitizedStringValue(keyTok: Token, what: string): string {
    const val = this.eatString();
    if (isDisallowedConfigValue(val)) {
      this.diagnostics.push({
        severity: "warning",
        message: `Disallowed value for ${what} key "${keyTok.value}" stripped`,
        code: "W_SANITIZED_CONFIG",
        span: { start: keyTok.start, end: keyTok.end },
      });
      return "";
    }
    return val;
  }

  /**
   * `style <kind> { fill … stroke … }` — per-element-kind colour overrides
   * (resolved element → theme → default at lowering, kept out of the IR). Keys
   * are friendly attributes (`fill`/`stroke`/`label`) mapped per kind to a Theme key.
   */
  private parseStyle(): { kind: string; style: Partial<Theme> } {
    this.eatKeyword("style");
    const kind = this.eatIdent().value;
    const style: Partial<Theme> = {};
    this.eat("lcurly");
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const keyTok = this.eatIdent();
      if (this.isType("colon")) this.next();
      const resolved = resolveStyleKey(kind, keyTok.value);
      if (!resolved) {
        this.diagnostics.push({
          severity: "warning",
          message: `Unknown style key "${keyTok.value}" for "${kind}"`,
          code: "W_UNKNOWN_STYLE_KEY",
          span: { start: keyTok.start, end: keyTok.end },
        });
        if (this.isType("string") || this.isType("number")) this.next();
        else this.fail(`Expected a value for style key "${keyTok.value}"`);
        continue;
      }
      (style as Record<string, unknown>)[resolved] = this.sanitizedStringValue(keyTok, "style");
    }
    this.eat("rcurly");
    return { kind, style };
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
    // `accTitle`/`accDescr` are plan-level only. Reaching here means one appeared
    // inside a component or control-flow block: consume it (with its string arg, if
    // present) and report a catalogued error so recovery is clean and the message is
    // specific rather than a generic "unknown statement".
    if (t.value === "accTitle" || t.value === "accDescr") {
      this.next();
      if (this.isType("string")) this.next();
      const msg = `"${t.value}" is only allowed at plan level, not inside a block or component`;
      this.diagnostics.push({ severity: "error", message: msg, code: "E_ACC_PLACEMENT", span: this.spanFrom(start) });
      return { kind: "error", id: "", line: t.line, message: msg };
    }
    let node: Statement;
    if (t.value === "for") node = this.parseFor(components, selfName);
    else if (t.value === "if") node = this.parseIf(components, selfName);
    else if (t.value === "while") node = this.parseWhile(components, selfName);
    else if (t.value === "set") node = this.parseSet();
    else {
      const def = this.registry.byKeyword.get(t.value);
      if (def) node = def.parse(this.ctx);
      else if (t.value === "let") node = this.parseLet();
      // An ident immediately followed by "=" is an assignment.
      else if (this.peek(1).type === "equals") node = this.parseAssign();
      // Any ident followed by "(" is a component call. The component may be
      // defined later, recursively (`selfName`), or brought in by an `import`
      // (added at link time, after parse) — so an unknown name is validated at
      // expand (E_UNKNOWN_COMPONENT), not here. `components`/`selfName` retained
      // for clarity of intent.
      else if (this.peek(1).type === "lparen") node = this.parseInstance();
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
      const stmtTok = this.peek();
      try {
        body.push(this.parseOneBodyStatement(components, selfName));
      } catch (e) {
        if (e instanceof ParseError) {
          this.diagnostics.push({ severity: "error", message: e.message, span: e.span });
          this.synchronize(stmtTok.start);
          body.push({
            kind: "error",
            id: "",
            line: stmtTok.line,
            message: e.message,
            span: this.spanFrom(stmtTok.start),
          });
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

  /**
   * `import "<spec>" : a, b as c` | `import "<spec>" : *` — bring a module's
   * components into this plan. Header-level (link-time), so it never interleaves
   * with draw order. Resolution + reading happen later via the World.
   */
  private parseImport(): ImportNode {
    const kw = this.eatKeyword("import");
    const spec = this.eatString();
    this.eat("colon");
    const items: ImportItem[] = [];
    let star = false;
    if (this.isType("star")) {
      this.next();
      star = true;
    } else {
      for (;;) {
        const name = this.eatIdent().value;
        let alias: string | undefined;
        if (this.isKeyword("as")) {
          this.next();
          alias = this.eatIdent().value;
        }
        items.push({ name, alias });
        if (this.isType("comma")) {
          this.next();
          continue;
        }
        break;
      }
    }
    return { kind: "import", spec, items, star, line: kw.line };
  }

  /** `set <kind>(key: value, …)` — scoped default overrides for an element kind. */
  private parseSet(): SetNode {
    const kw = this.eatKeyword("set");
    const targetTok = this.eatIdent();
    const def = this.registry.byKeyword.get(targetTok.value);
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
    // `target` is keyed as a string at runtime (scope.sets / effectiveSet), so a
    // plugin's custom kind works here even though the field type is ElementKind.
    return { kind: "set", id: "", target: def.kind as SetNode["target"], over, line: kw.line };
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
