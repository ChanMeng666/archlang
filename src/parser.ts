/** Recursive-descent parser: tokens -> PlanNode. Registry-driven element dispatch. */

import type { LexResult, Token } from "./lexer.js";
import { lex, lexUnmemoised } from "./lexer.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { recordIdSpan } from "./id-spans.js";
import { CATALOG_FIXES } from "./error-catalog-fixes.js";
import { capDiagnostics, isLimitClass, MAX_DIAGNOSTICS } from "./diagnostics.js";
import type {
  AssignNode,
  AxesNode,
  ComponentDef,
  ExprPoint,
  ForNode,
  IfNode,
  ImportItem,
  ImportNode,
  InstanceNode,
  LetNode,
  LevelNode,
  NorthDir,
  PlaceNode,
  PlaceRotate,
  PlanNode,
  SetNode,
  SetOverride,
  Statement,
  StripNode,
  StripRoomChild,
  TitleNode,
  UseKind,
  WhileNode,
  ZoneNode,
} from "./ast.js";
import type { AutoDimsMode, CompassWord, Hemisphere, NorthCardinal, ScheduleSubject, StripDir } from "./ast.js";
import {
  AUTO_DIMS_MODES,
  COMPASS_DIRECTIONS,
  HEMISPHERES,
  LEVEL_SHARED_KINDS,
  NORTH_DIRS,
  SCHEDULE_SUBJECTS,
  STRIP_DIRS,
  REL_DIRS,
  TITLE_FIELD_KEY,
  USE_KINDS,
} from "./ast.js";
import { furnitureKinds } from "./elements/furniture.js";
import { FLOOR_MATERIALS, KNOWN_MATERIALS } from "./hatches.js";
import type { Expr } from "./expr.js";
import type { ExprTokens } from "./expr.js";
import { closest, exprContinuations, MAX_NEST_DEPTH, parseExpr as parseExprPratt, spelling } from "./expr.js";
import { fixesFrom, spellingFix } from "./fix-producers.js";
import type { Theme } from "./theme.js";
import { isNumericThemeKey, resolveThemeKey, resolveStyleKey, THEMES } from "./theme.js";
import { fmt3, MAX_ANGLE_DEG, MODEL_RANGE_MM, outOfRangeDiagnostic, plainDigits } from "./num-format.js";
import { isDisallowedConfigValue } from "./sanitize.js";
import { fnv1a } from "./hash.js";
import { idToken } from "./identity.js";
import type { ElementDef, ParseCtx, Registry } from "./registry.js";
import { BUILTIN_REGISTRY } from "./registry.js";
import { floorClause, roomUsesExpected, roomUsesOutdoorHint } from "./elements/room.js";
import { missingClause, readClauses, type TailClause } from "./clause-order.js";
import {
  ATTRIBUTE_KEYWORDS,
  KEEP_GRADES,
  KEEP_WORDS,
  KEYWORDS,
  STATEMENT_STARTS,
  TITLE_FIELDS,
  TOKEN_TEXT,
  type TitleField,
} from "./grammar/tokens.js";
import type { KeepGrade, KeepNode, KeepRef } from "./ast.js";
import { splitDatum } from "./room-datums.js";
import type { PaperOrientation, PaperSize } from "./grammar/tokens.js";
import { PAPER_ORIENTATIONS, PAPER_SIZES } from "./grammar/tokens.js";
import type { ChromeHide, SheetTextNode } from "./ast.js";
import { isSheetTextKey, MAX_SHEET_WORD, type SheetTextEntry, sheetTextKeys, sheetTextRefusal } from "./sheet-text.js";
import { checkWhileDeprecation } from "./while-deprecation.js";

export interface ParseOutcome {
  plan?: PlanNode;
  diagnostics: Diagnostic[];
}

/** Keywords that begin a plan-body statement (registry element keywords are added
 *  per-parse, so recovery is plugin-aware). Sourced from the one grammar file
 *  (`src/grammar/tokens.ts`) so the parser and the editor grammars stay in sync. */
const FIXED_STATEMENT_STARTS: readonly string[] = STATEMENT_STARTS;

/** The longest word {@link glued} splits: a number written out longer is no slip (AF4). */
const MAX_GLUED_WORD = 40;

/**
 * A word of `near` glued to the number after it (`x3000` where `x` belongs, `width900`, and a
 * size, `size3000x3000`): the lexer reads the two as one name. The split is the suggestion, never
 * unique: the name may be meant. A word past {@link MAX_GLUED_WORD} letters is never split, so a
 * hint and a fix never repeat a huge word.
 */
function glued(word: string, near: readonly string[]): { word: string; unique: boolean } | null {
  if (word.length > MAX_GLUED_WORD) return null;
  for (const w of near) {
    const rest = word.slice(w.length);
    if (!rest || !word.startsWith(w)) continue;
    const toks = lexUnmemoised(rest).tokens;
    const one = toks[0]!.type;
    if (toks.length === 2 && (one === "number" || one === "dimension")) return { word: `${w} ${rest}`, unique: false };
  }
  return null;
}

/**
 * The did-you-mean for a word that should have been one of `near` (AF2): {@link spelling}, then
 * {@link glued}; a word ending in a digit tries the split first (AF4), so `width90` reads as
 * `width 90`, not as a respelling that drops the number.
 */
function suggestion(word: string, near: readonly string[]): { word: string; unique: boolean } | null {
  if (/[0-9]$/.test(word)) return glued(word, near) ?? spelling(word, near);
  return spelling(word, near) ?? glued(word, near);
}

/**
 * The most entries a site's own closed list gives a parse error's `expected` (AF4): a longer list
 * (the 267 `sheet text` keys) keeps its first {@link EXPECTED_PREFIX}, and `expectedMore` counts
 * the rest. The statement position's list (about 50 words) stays whole.
 */
const EXPECTED_MAX = 64;
const EXPECTED_PREFIX = 16;

/** Where a parse error stands and what it knows (AF4): its `span` (the failing token's own by
 *  default), the words the token may be a slip of (`near`, AF2), and what the position takes
 *  (`expected`, `near` by default). */
interface FailAt {
  span?: Span;
  near?: readonly string[];
  expected?: readonly string[];
}

/** What a parse error says was expected (AF4): the list, how many entries were cut from it, and the
 *  offset of the token the parser was looking at when that is not where the error is spanned. */
interface Expected {
  list: string[];
  more: number;
  at?: number;
}

/** A scope a body statement stands in (AF4): inside a block (a `level`, `zone`, control-flow or
 *  `component` body), and inside a component. */
interface BodyScope {
  block: boolean;
  component: boolean;
}

/**
 * A fixed statement word the body-statement parser dispatches on (AF4): how it is read, and in which
 * scopes it begins a statement of its own. In any other scope `read` refuses it where it stands (a
 * `level` in a block, a `keep` in a component), so a parse error's `expected` leaves it out there.
 */
interface BodyForm {
  read(start: number, t: Token, components: Map<string, ComponentDef>, selfName?: string): Statement;
  opens(scope: BodyScope): boolean;
}

/**
 * Clause words agents write where a statement must start (live runs): each names the
 * form it belongs to. Message unchanged; only the hint is added.
 */
const STRAY_CLAUSE_HINTS: ReadonlyMap<string, string> = new Map([
  [
    "offset",
    "`offset` is not a statement: it is a clause of `furniture … against wall <id> offset <mm>` or " +
      "`furniture … against <room>.<edge> offset <mm>` (mm along the wall to the piece's centre) and " +
      "`dim … offset <mm>`, and follows `keep` in `keep offset <d|id> from <d> <mm>`. Place an opening " +
      "along its wall with `at <mm> from start|end`; pull an anchored piece in from its edge with " +
      "`in <room> anchor <a> inset <mm>`",
  ],
  [
    "hinged",
    "`hinged` is a door kind, not a statement: it comes straight after `door` " +
      "(`door hinged on <room>.<edge> at <pos> width <mm>`), and a door with no kind is already hinged; " +
      "the hinge side is the clause `hinge left|right`",
  ],
]);

/** The plan body's own scope (AF4). */
const PLAN_SCOPE: BodyScope = { block: false, component: false };

/** A diagnostic's `expected`, `expectedAt` and `expectedMore` (AF4), in that order. */
function expectedFields(e: Expected | undefined): Pick<Diagnostic, "expected" | "expectedAt" | "expectedMore"> {
  if (!e || e.list.length === 0) return {};
  return {
    expected: e.list,
    ...(e.at !== undefined ? { expectedAt: e.at } : {}),
    ...(e.more ? { expectedMore: e.more } : {}),
  };
}

/** What a `theme` or `style` key takes when its key is unknown (AF4). */
const KEY_VALUE = [TOKEN_TEXT.string, TOKEN_TEXT.number];

/** Thrown internally by `eat*` helpers; always caught within the parser. */
class ParseError extends Error {
  constructor(
    public override message: string,
    public span: Span,
    public hints?: string[],
    /** A did-you-mean for the word at `word` (AF2), and whether its fix may be machine-applicable. */
    public spelt?: { word: Span; s: { word: string; unique: boolean }; closed: boolean },
    /** What the grammar would have read at the failing token (AF4, `Diagnostic.expected`). */
    public expected?: Expected,
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

/**
 * {@link parse} with neither stage memo: for a probe that parses many small throwaway sources
 * (Plan JSON's position check) and must not evict a real source from the 32-entry caches.
 * Internal: not re-exported from the package root.
 */
export function parseUnmemoised(src: string, registry: Registry = BUILTIN_REGISTRY): ParseOutcome {
  return parseImpl(src, registry, lexUnmemoised);
}

/**
 * {@link parse} over a caller's lexer, unmemoised: the seam a test uses to count how many
 * times the parser reads a token (a proxied token array). Internal: not re-exported from
 * the package root.
 */
export function parseWithLexer(src: string, lexer: (src: string) => LexResult): ParseOutcome {
  return parseImpl(src, BUILTIN_REGISTRY, lexer);
}

function parseImpl(src: string, registry: Registry, lexer: (src: string) => LexResult = lex): ParseOutcome {
  const { tokens, errors: lexErrors, comments } = lexer(src);
  const lexDiags: Diagnostic[] = lexErrors.map((e) => ({
    severity: "error" as const,
    message: e.message,
    code: e.code ?? "E_PARSE",
    span: e.span,
    ...(e.hints ? { hints: e.hints } : {}),
  }));

  // parsePlan never throws on user source: it recovers from a malformed header
  // and from per-statement errors, so a PlanNode (possibly partial) is always
  // produced — `CompileResult.ast` is present even on broken input.
  const p = new Parser(tokens, registry, src);
  const plan = p.parsePlan();
  plan.comments = comments;
  const diagnostics = [...lexDiags, ...p.diagnostics];
  // W7: `while`/reassignment soft-deprecation — purely syntactic, over the plan body
  // and every locally-declared component; see `src/while-deprecation.ts`'s header.
  checkWhileDeprecation(plan, (d) => diagnostics.push(d));
  // The lexer needs no such flag: its diagnostics are all errors, so one that dropped any
  // has kept errors, and the cap sees them.
  return { plan, diagnostics: capDiagnostics(diagnostics, src.length, p.droppedError) };
}

class Parser {
  private pos = 0;
  /** How many `{ … }` statement blocks enclose the cursor (see {@link MAX_NEST_DEPTH}). */
  private blockDepth = 0;
  public diagnostics: Diagnostic[] = [];
  /** Sticky: an ERROR was discarded past the cap, so the limit must be `E_DIAGNOSTIC_LIMIT`
   *  even when every diagnostic kept is a warning (EH-D8 as amended). */
  public droppedError = false;
  /** Collect one diagnostic — at most one past {@link MAX_DIAGNOSTICS}, so a flood stops
   *  costing anything while `capDiagnostics` can still tell that some were dropped. */
  private report(d: Diagnostic): void {
    if (this.diagnostics.length <= MAX_DIAGNOSTICS || isLimitClass(d)) this.diagnostics.push(d);
    else if (d.severity === "error") this.droppedError = true;
  }
  /** Facade passed to element parse functions (see registry.ts). */
  private readonly ctx: ParseCtx & Pick<ExprTokens, "report" | "exprEnd">;
  /** Statement-start keywords for recovery resync — fixed keywords + this
   *  registry's element keywords (so plugin elements resync correctly). */
  private readonly statementStarts: ReadonlySet<string>;

  constructor(
    private toks: Token[],
    private readonly registry: Registry = BUILTIN_REGISTRY,
    /** The source the tokens came from — read only by {@link synchronize}, for the
     *  leading whitespace of a line (a token's `col` cannot tell a tab from a space). */
    private readonly src = "",
  ) {
    // A contextual element keyword (`section`) is no statement start: `room id=section` keeps parsing.
    const reserved = [...registry.byKeyword.values()].filter((d) => !d.contextual).map((d) => d.keyword);
    this.statementStarts = new Set<string>([...FIXED_STATEMENT_STARTS, ...reserved]);
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
      parseExpr: (opts) => parseExprPratt(this.ctx, opts),
      exprEnd: (noModulo) => {
        this.exprStop = this.pos;
        this.exprStopModulo = !noModulo;
      },
      parseDimensions: () => this.parseDimensions(),
      parseStringExpr: () => this.parseStringExpr(),
      parseIdOpt: () => this.parseIdOpt(),
      spanFrom: (start) => this.spanFrom(start),
      fail: (msg, t) => this.fail(msg, t),
      failAt: (msg, span) => this.fail(msg, this.peek(), { span }),
      failNear: (msg, near, t, span) => this.fail(msg, t, { span, near }),
      failExpected: (msg, expected, at) => this.fail(msg, at?.t, { span: at?.span, near: at?.near, expected }),
      diag: (d) => this.report(d),
      report: (code, message, span) => this.report({ severity: "error", message, code, span }),
    };
  }

  // The token list always ends with EOF, so the clamped index is present.
  private sheetKeyHinted = false;

  private peek(o = 0): Token {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)]!;
  }
  private next(): Token {
    return this.toks[Math.min(this.pos++, this.toks.length - 1)]!;
  }
  /**
   * Throw a parse error at `t`. With `near`, the closed set of words that could stand at `t`, a
   * misspelling of one of them (AF2, {@link spelling}) adds a did-you-mean hint and a fix that
   * rewrites `t` alone, even when the error is spanned on a whole statement. The fix is
   * machine-applicable only when `t` is no word of the language ({@link isLanguageWord}: a word
   * spelled right in the wrong place is never rewritten), its word stands nowhere else in the
   * source, and `near` is a closed list of words, not the one word a position expected. Parsing is
   * not metered, so the search runs only while the error can still be reported: past
   * `MAX_DIAGNOSTICS` it is dropped, and so the work is bounded whatever the source's size.
   * A word of `near` glued to the number after it (`x3000`, which the lexer reads as one name) gets
   * the same hint and a `maybe-incorrect` fix that splits it (AF4, {@link suggestion}).
   *
   * `at.expected` (AF4, `Diagnostic.expected`) is what the position takes at `t` (`near` by
   * default); {@link expectedAt} adds what an earlier statement, clause or expression would still
   * have read there. A site that names no list gets none.
   */
  private fail(msg: string, t = this.peek(), at: FailAt = {}): never {
    const span = at.span ?? { start: t.start, end: t.end };
    const near = at.near;
    const hints = this.parseHints(t);
    const live = this.reportable();
    const s = near && t.type === "ident" && live ? suggestion(t.value, near) : null;
    const site = at.expected ?? near;
    const expected = site && live ? this.expectedAt(t, span, site, s?.word.split(" ")[0]) : undefined;
    if (!s) throw new ParseError(msg, span, hints, undefined, expected);
    throw new ParseError(
      msg,
      span,
      [...(hints ?? []), `did you mean \`${s.word}\`?`],
      {
        word: { start: t.start, end: t.end },
        s,
        closed: near!.length > 1 && !this.isLanguageWord(t.value) && !this.elsewhere(t.value),
      },
      expected,
    );
  }

  /**
   * The `expected` of a parse error at `t` (AF4): the site's own list (cut to its first
   * {@link EXPECTED_PREFIX} past {@link EXPECTED_MAX}), then every word or token the parser looked
   * for at `t` before it failed ({@link probe}: a clause the statement before would still have
   * read, `hidden` before a setting's value, `}` closing a block), then the operators that would
   * have continued an expression ending just before `t`, then the did-you-mean word, so the hint
   * always names an entry. `at` is `t`'s offset when the error is spanned elsewhere.
   */
  private expectedAt(t: Token, span: Span, site: readonly string[], hint: string | undefined): Expected {
    const i = this.indexOf(t);
    const more = site.length > EXPECTED_MAX ? site.length - EXPECTED_PREFIX : 0;
    const list = new Set(more ? site.slice(0, EXPECTED_PREFIX) : site);
    for (let k = 0; k < this.probeAt.length; k++) if (this.probeAt[k] === i) list.add(this.probeWhat[k]!);
    // After a `uses` list a room reads one more use, on any line (its loop reads uses by value).
    if (t.type !== "eof" && this.afterUses(t, false)) for (const u of USE_KINDS) list.add(u);
    if (this.exprStop === i) {
      for (const op of exprContinuations(this.exprStopModulo)) list.add(op);
      const before = this.toks[i - 1];
      if (before?.type === "ident" && before.value !== "true" && before.value !== "false") list.add(TOKEN_TEXT.lparen);
    }
    if (hint !== undefined) list.add(hint);
    const e: Expected = { list: [...list], more };
    if (span.start !== t.start || span.end !== t.end) e.at = t.start;
    return e;
  }

  /** The index of `t` in the token list: the cursor's own, else found by its offset. */
  private indexOf(t: Token): number {
    if (this.toks[this.pos] === t) return this.pos;
    let lo = 0;
    let hi = this.toks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.toks[mid]!.start < t.start) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * The words and tokens the parser looked for at each token index (AF4): every `isKeyword` and
   * every `isType` but `ident`'s and the end's (a name or the end is no alternative a list can
   * name). A failure at that token lists them, so an `expected` follows the parser's own branches.
   * Recorded only while an error can still be reported, for the tokens at or past the cursor: two
   * flat arrays (a token's index, the word), compacted when the cursor moves, so a parse that never
   * fails pays one comparison and one push a look. At most 256 are held.
   */
  private readonly probeAt: number[] = [];
  private readonly probeWhat: string[] = [];
  private probePos = -1;
  private probe(i: number, what: string): void {
    if (!this.reportable()) return;
    if (this.probePos !== this.pos) {
      this.probePos = this.pos;
      let k = 0;
      for (let j = 0; j < this.probeAt.length; j++)
        if (this.probeAt[j]! >= this.pos) {
          this.probeAt[k] = this.probeAt[j]!;
          this.probeWhat[k++] = this.probeWhat[j]!;
        }
      this.probeAt.length = k;
      this.probeWhat.length = k;
    }
    if (this.probeAt.length < 256) {
      this.probeAt.push(i);
      this.probeWhat.push(what);
    }
  }
  /** Where the last expression the parser read stopped (AF4), and whether `%` would have continued it. */
  private exprStop = -1;
  private exprStopModulo = true;

  /** The `E_PARSE` a caught {@link ParseError} reports, with its did-you-mean fix (AF2) and what
   *  it expected (AF4). */
  private parseErrorDiag(e: ParseError): Diagnostic {
    return {
      severity: "error",
      message: e.message,
      code: "E_PARSE",
      span: e.span,
      ...(e.hints ? { hints: e.hints } : {}),
      ...fixesFrom(spellingFix(e.spelt?.word, e.spelt?.s ?? null, e.spelt?.closed === true)),
      ...expectedFields(e.expected),
    };
  }

  /**
   * What may begin a statement in `scope` (AF4): a statement keyword, a name (`x = …`, `part(…)`)
   * or the `}` that closes the block. At plan level, every statement keyword. In a block, only the
   * words that begin a statement there ({@link bodyForms}, {@link elementOpens}): the plan's
   * settings are unknown statements in a `component`, and a `level`, a `keep` in a component or a
   * plan-level element is read only to be refused. Built only while the error can still be
   * reported, as {@link wordsAt} is: past `MAX_DIAGNOSTICS` a flood of failing statements costs no
   * list each.
   */
  private statementExpected(scope: BodyScope): string[] {
    if (!this.reportable()) return [];
    return [...this.statementWords(scope), TOKEN_TEXT.ident, TOKEN_TEXT.rcurly];
  }

  /** The statement keywords that begin a statement in `scope` (see {@link statementExpected}). */
  private statementWords(scope: BodyScope): string[] {
    // At plan level a contextual element (`section A (…`) begins a statement too, where its context holds.
    if (!scope.block) return [...new Set([...this.statementStarts, ...this.registry.byKeyword.keys()])];
    return [...this.statementStarts].filter((w) => {
      const form = this.bodyForms.get(w);
      if (form) return form.opens(scope);
      const def = this.registry.byKeyword.get(w);
      return def !== undefined && this.elementOpens(def, scope);
    });
  }

  /** Whether element `def` begins a statement of its own in `scope` (AF4): a plan-level element
   *  does not in a block, nor a `roof` in a component; there each is read only to be refused. */
  private elementOpens(def: ElementDef, scope: BodyScope): boolean {
    if (def.planLevelOnly !== undefined && scope.block) return false;
    return !(def.keyword === "roof" && scope.component);
  }

  /** How many times each word stands in this source as a name, counted once off the tokens: a
   *  word written anywhere else (a parameter, an imported name, a binding, an id) is one the plan
   *  knows, so it is never machine-respelt (AF2). */
  private wordCounts: Map<string, number> | undefined;
  private elsewhere(word: string): boolean {
    if (!this.wordCounts) {
      this.wordCounts = new Map();
      for (const t of this.toks)
        if (t.type === "ident") this.wordCounts.set(t.value, (this.wordCounts.get(t.value) ?? 0) + 1);
    }
    return (this.wordCounts.get(word) ?? 0) > 1;
  }

  /** Whether `word` is a word of the language: a keyword of any category, a statement start, a
   *  registry element, a room use, a relational direction, a furniture or fixture kind, a material. */
  private isLanguageWord(word: string): boolean {
    LANGUAGE_WORDS ??= new Set<string>([
      ...Object.values(KEYWORDS).flat(),
      ...STATEMENT_STARTS,
      ...USE_KINDS,
      ...REL_DIRS,
      ...furnitureKinds(),
      ...FLOOR_MATERIALS,
      ...KNOWN_MATERIALS,
    ]);
    return LANGUAGE_WORDS.has(word) || this.registry.byKeyword.has(word);
  }

  /**
   * Hints for two shapes agents keep writing. Each fires only on the exact token it
   * describes: a `-` glued to the `id=` name just read, or a `,` that directly follows the
   * use-kinds of a `uses` list. Any other `-` or `,` gets none.
   */
  private parseHints(t: Token): string[] | undefined {
    if (t.type === "minus" && this.lastIdSpan && t.start === this.lastIdSpan.end) {
      return ["ids are letters, digits and `_` (not `-`); write `my_room`, not `my-room`"];
    }
    if (t.type === "comma" && this.afterUses(t, false)) {
      return ["separate uses with spaces: `uses living dining`"];
    }
    // An outdoor word after a `uses` list on its line (`uses living balcony`): the error it
    // raises (an unknown statement, a strip's expected `room`) names the `outdoor` surface
    // (backlog RR.5). The word is tested first, so any other failing token costs no walk; a
    // word on its own line after a `uses` list is the next statement and gets none.
    const outdoor = roomUsesOutdoorHint(t.type, t.value);
    return outdoor !== undefined && this.afterUses(t, true) ? [outdoor] : undefined;
  }

  /**
   * Whether `t` directly follows the use-kinds of a `uses` list (`uses living dining`); with
   * `sameLine`, only when the token before `t` is on its line. `t` is found by a binary search
   * on `start` (tokens are in source order), never a scan: a hint may be for a token already
   * consumed (the comma's, as in `room ,id=r …`), so the cursor does not locate it, and a file of
   * many failing statements must format its hints in time linear in its tokens.
   */
  private afterUses(t: Token, sameLine: boolean): boolean {
    const toks = this.toks;
    let lo = 0;
    let hi = toks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (toks[mid]!.start < t.start) lo = mid + 1;
      else hi = mid;
    }
    let i = lo - 1;
    if (sameLine && toks[i]?.line !== t.line) return false;
    const end = i;
    while (i >= 0 && toks[i]!.type === "ident" && USE_SET.has(toks[i]!.value)) i--;
    return i < end && toks[i]?.type === "ident" && toks[i]!.value === "uses";
  }

  /**
   * The words an unknown statement word `t` may be a slip of (AF2), in order: on the line of the
   * token before it, where a statement ended early at a misspelt word, a room use (after a `uses`
   * list), a clause word and a value word (`dims auto roomss`); then a statement keyword, of those
   * that begin a statement in `scope` (AF4: the words its `expected` lists). Each set is read from
   * its one source. A word of the language out of place (`sheet`, `left`, `closet`) is spelled
   * right, so it has none.
   */
  private wordsAt(t: Token, scope: BodyScope): readonly string[] {
    if (!this.reportable() || this.isLanguageWord(t.value)) return [];
    if (this.toks[this.pos - 1]?.line !== t.line) return this.statementWords(scope);
    return [
      ...(this.afterUses(t, true) ? USE_KINDS : []),
      ...ATTRIBUTE_KEYWORDS,
      ...KEYWORDS.enum,
      ...this.statementWords(scope),
    ];
  }

  /** Whether a diagnostic reported now is kept ({@link report}'s own test). */
  private reportable(): boolean {
    return this.diagnostics.length <= MAX_DIAGNOSTICS;
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
   *
   * When the failed statement starts its own line, recovery is guided by its
   * INDENTATION (as rustc locates an unclosed delimiter) — a local signal that no brace
   * far away in the file can move:
   *  - a statement keyword first on its line at the statement's indentation or left of
   *    it resumes parsing: the failed statement has ended, whether or not its `}` was
   *    written;
   *  - a `}` first on its line left of that indentation closes the ENCLOSING block (stop
   *    before it); at it, it is the failed statement's own closer if the statement left a
   *    `{` open (consume it and any `else` branches after it, then resume);
   *  - indentation is compared as whitespace strings ({@link compareIndent}); where a
   *    tab meets spaces there is no order, and that line stops recovery as before;
   *  - between those points, `{`/`}` are counted, so the `}` of the failed statement's own
   *    block on its own line (a wall's points, `theme { … }`) does not close the enclosing
   *    block, and a keyword inside that block is not parsed one scope too far out;
   *  - a `{` where a statement should start is stray and skipped alone.
   * A statement that does not start its line (one-line source, `room … {`) has no
   * indentation to read and recovers exactly as before: the next keyword or any `}`.
   */
  private synchronize(failStart: number): void {
    let s = Math.min(this.pos, this.toks.length - 1);
    while (s > 0 && this.toks[s - 1]!.start >= failStart) s--;
    const first = this.toks[s]!;
    if (first.start !== failStart || !this.startsLine(s)) {
      while (!this.isType("rcurly") && !this.isType("eof")) {
        const t = this.peek();
        if (t.start > failStart && this.isStatementKeyword(t)) return;
        this.next();
      }
      return;
    }
    const indent = this.indentOf(first);
    let depth = 0;
    for (let i = s; i < Math.min(this.pos, this.toks.length); i++) {
      const type = this.toks[i]!.type;
      if (type === "lcurly") depth++;
      else if (type === "rcurly") depth--;
    }
    if (depth < 0) depth = 0;
    if (this.pos === s && first.type === "lcurly") this.next();
    while (!this.isType("eof")) {
      const t = this.peek();
      if (t.start > failStart && this.startsLine(this.pos)) {
        // Where this line starts relative to the failed statement's line; `undefined`
        // (mixed tabs/spaces) means no indentation to read, so the previous rule decides:
        // stop at any `}` or keyword.
        const rel = compareIndent(this.indentOf(t), indent);
        if (t.type === "rcurly") {
          if (rel === undefined || rel < 0) return;
          if (rel === 0) {
            if (depth > 0) {
              this.next();
              this.skipElseChain();
            }
            return;
          }
        } else if ((rel === undefined || rel <= 0) && this.isStatementKeyword(t)) {
          return;
        }
      }
      if (t.type === "rcurly") {
        if (depth === 0) return;
        depth--;
      } else if (t.type === "lcurly") {
        depth++;
      } else if (depth === 0 && t.start > failStart && this.isStatementKeyword(t)) {
        return;
      }
      this.next();
    }
  }

  /** The whitespace between the start of `t`'s line and `t` (`t` starts its line). */
  private indentOf(t: Token): string {
    let i = t.start;
    while (i > 0 && (this.src[i - 1] === " " || this.src[i - 1] === "\t")) i--;
    return this.src.slice(i, t.start);
  }

  /** After a failed `if` header's own `}`: its `else [if …] { … }` branches belong to the
   *  failed statement too — skip them, or `else` would be parsed as a statement and its
   *  block's `}` would close the enclosing block. */
  private skipElseChain(): void {
    while (this.isKeyword("else")) {
      this.next();
      while (!this.isType("lcurly") && !this.isType("rcurly") && !this.isType("eof")) this.next();
      if (!this.isType("lcurly")) return;
      let depth = 0;
      do {
        if (this.isType("lcurly")) depth++;
        else if (this.isType("rcurly")) depth--;
        this.next();
      } while (depth > 0 && !this.isType("eof"));
    }
  }

  /** Token `i` is the first on its line. */
  private startsLine(i: number): boolean {
    return i === 0 || this.toks[i - 1]!.line < this.toks[i]!.line;
  }

  private isStatementKeyword(t: Token): boolean {
    return t.type === "ident" && this.statementStarts.has(t.value);
  }

  /** One `E_PARSE` for the `}`s still owed at end of input — they all share its span. */
  private missingClose(): void {
    const t = this.peek();
    const message = `Expected rcurly but found ${describe(t)}`;
    if (this.diagnostics.some((d) => d.message === message && d.span?.start === t.start)) return;
    this.report({
      severity: "error",
      message,
      code: "E_PARSE",
      span: { start: t.start, end: t.end },
      expected: [TOKEN_TEXT.rcurly],
    });
  }

  private isKeyword(kw: string, o = 0): boolean {
    const t = this.peek(o);
    this.probe(Math.min(this.pos + o, this.toks.length - 1), kw);
    return t.type === "ident" && t.value === kw;
  }
  private eatKeyword(kw: string): Token {
    const t = this.peek();
    if (t.type !== "ident" || t.value !== kw) this.fail(`Expected "${kw}" but found ${describe(t)}`, t, { near: [kw] });
    return this.next();
  }
  private eat(type: Token["type"]): Token {
    const t = this.peek();
    if (t.type !== type) this.fail(`Expected ${type} but found ${describe(t)}`, t, { expected: [TOKEN_TEXT[type]] });
    return this.next();
  }
  private eatIdent(): Token {
    return this.eat("ident");
  }
  /** The span of the last theme `lineWeight` value read, handed to the plan by its caller. */
  private lineWeightSpan: Span | undefined;
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
      const kw = this.eatKeyword("plan");
      const name = this.eat("string");
      plan.name = name.value;
      plan.headerSpan = { start: kw.start, end: name.end };
      plan.bodyStart = this.eat("lcurly").end;
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.report(this.parseErrorDiag(e));
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
        if (t.type !== "ident")
          this.fail(`Expected a statement but found ${describe(t)}`, t, {
            expected: this.statementExpected(PLAN_SCOPE),
          });
        if (this.atSheetText()) {
          plan.sheetText = this.parseSheetText(plan, start);
          continue;
        }
        switch (t.value) {
          case "units":
            this.parseUnitsSetting(plan);
            break;
          case "grid": {
            this.next();
            const gt = this.peek();
            const grid = this.eatNumber();
            // A grid is a length: past the modelling range it would snap every coordinate
            // to 0 or past the range. Reported here (the setting has no later span) and
            // neutralised to "no grid".
            if (grid > MODEL_RANGE_MM) {
              this.report(
                outOfRangeDiagnostic(
                  `The \`grid\` of ${fmt3(grid)} mm is outside the modelling range of ±${fmt3(MODEL_RANGE_MM)} mm (2^25 mm, about 33.5 km)`,
                  { start: gt.start, end: gt.end },
                ),
              );
              plan.grid = 0;
            } else plan.grid = grid;
            break;
          }
          case "paper":
            this.parsePaperSetting(plan, t);
            break;
          case "scale":
            this.parseScaleSetting(plan, t);
            break;
          case "height":
            this.parseHeightSetting(plan, t);
            break;
          case "north":
            this.next();
            if (!this.eatHidden(plan, "north")) {
              plan.north = this.parseNorth();
              this.eatHidden(plan, "north");
            }
            plan.northSpan = this.spanFrom(start);
            break;
          case "site":
            this.parseSiteSetting(plan, t);
            break;
          case "dims":
            this.parseDimsSetting(plan);
            break;
          case "title": {
            // `title hidden = 3` was an error, and stays the error `parseTitle` reports.
            if (this.peek(1).line === t.line && this.isKeyword("hidden", 1) && !this.isTrailer(this.peek(2))) {
              this.next();
              this.eatHidden(plan, "title");
              break;
            }
            const n = this.parseTitle();
            n.span = this.spanFrom(start);
            plan.title = n;
            break;
          }
          case "axes": {
            const n = this.parseAxes();
            n.span = plan.axes?.span ?? this.spanFrom(start);
            // Repeated blocks merge (both lists append), like `theme`; the first
            // block's span is kept so the formatter re-emits one block in place.
            plan.axes = plan.axes ? { ...plan.axes, x: [...plan.axes.x, ...n.x], y: [...plan.axes.y, ...n.y] } : n;
            break;
          }
          case "schedule":
            this.parseScheduleSetting(plan);
            break;
          case "legend":
            this.next();
            plan.legend = true;
            break;
          case "notes":
            this.parseNotesSetting(plan);
            break;
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
            if (r.base !== undefined) {
              plan.themeBase = r.base;
              // Where a name that is no built-in theme was written, for `W_UNKNOWN_THEME` (RM1.4b),
              // which `compile()` raises once it knows the themes the call registers. A built-in
              // name records nothing, so its plan's AST is what it was.
              if (Object.hasOwn(THEMES, r.base) || !r.baseSpan) delete plan.themeBaseSpan;
              else plan.themeBaseSpan = r.baseSpan;
            }
            if (r.from !== undefined) plan.themeFrom = r.from;
            plan.theme = { ...plan.theme, ...r.theme };
            if (this.lineWeightSpan) {
              plan.lineWeightSpan = this.lineWeightSpan;
              this.lineWeightSpan = undefined;
            }
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
          case "strip": {
            const strip = this.parseStrip();
            strip.span = this.spanFrom(start);
            plan.body.push(strip);
            break;
          }
          // A storey. Kept in `body` in source order (like `strip`) so every
          // statement walker — the formatter, the cursor, `repair` — sees it; the
          // level machinery in `ir.ts` partitions on it.
          case "level": {
            const lvl = this.parseLevel(plan.components);
            lvl.span = this.spanFrom(start);
            plan.body.push(lvl);
            break;
          }
          // Elements, `let`, instances, control flow, and assignment all flow
          // through the shared body-statement parser.
          default:
            plan.body.push(this.parseOneBodyStatement(plan.components, undefined));
        }
      } catch (e) {
        if (e instanceof ParseError) {
          this.report(this.parseErrorDiag(e));
          this.synchronize(start);
          plan.body.push({ kind: "error", id: "", line: t.line, message: e.message, span: this.spanFrom(start) });
        } else {
          throw e;
        }
      }
    }
    // A missing closing brace is reported but the partial plan is still returned.
    try {
      const close = this.eat("rcurly");
      // A file holds one plan and nothing after it: a stray `}` mid-body, or a second
      // `plan` block, would otherwise close the plan early and silently drop the tail.
      // One diagnostic on the first trailing token (comments are trivia, not tokens).
      this.checkTrailing(close);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      if (this.isType("eof")) this.missingClose();
      else this.report(this.parseErrorDiag(e));
    }
    this.checkLevels(plan);
    return plan;
  }

  /** `E_PARSE` on the first token after the plan's closing `}`, if any. The tail is
   *  not parsed: the plan is closed, so there is no scope it could belong to. */
  private checkTrailing(close: Token): void {
    const t = this.peek();
    if (t.type === "eof") return;
    // The "closed early" hint only when a `}` after this token could have been the
    // plan's real close — not for, say, a `// note` written after the last `}`.
    let laterClose = false;
    for (let i = this.pos + 1; i < this.toks.length && !laterClose; i++) laterClose = this.toks[i]!.type === "rcurly";
    const message =
      t.type === "ident" && t.value === "plan"
        ? `A second "plan" block after the plan was closed — a file holds one plan, and nothing after its closing "}" is read`
        : `Unexpected ${describe(t)} after the plan was closed — nothing after the plan's closing "}" is read` +
          (laterClose ? ` (an extra "}" may have closed it early)` : "");
    this.report({
      severity: "error",
      message,
      code: "E_PARSE",
      span: { start: t.start, end: t.end },
      relatedSpans: [{ span: { start: close.start, end: close.end }, message: "the plan was closed here" }],
      expected: [TOKEN_TEXT.eof],
    });
  }

  /**
   * Whole-plan checks for the multi-storey shape (`level <n> { … }`), run once the body
   * is parsed so they see every statement whatever the source order:
   *
   *  - **`E_LEVEL_DUP`** — a storey number declared twice. Reported on the *second*
   *    block, with the first as a related span.
   *  - **`E_LEVEL_MIX`** — a drawable statement sitting beside the level blocks. A plan
   *    is either single-storey or entirely levels; only the plan-global scope
   *    ({@link LEVEL_SHARED_KINDS}) may stay outside. Spanned on the offending statement,
   *    one diagnostic each, so a fix loop can move them one at a time.
   *
   * A plan with no `level` block returns immediately, so nothing about single-storey
   * parsing changes.
   */
  private checkLevels(plan: PlanNode): void {
    const levels = plan.body.filter((s): s is LevelNode => s.kind === "level");
    if (levels.length === 0) return;

    const seen = new Map<number, LevelNode>();
    for (const l of levels) {
      const first = seen.get(l.level);
      if (first) {
        this.report({
          severity: "error",
          code: "E_LEVEL_DUP",
          message: `Level ${l.level} is already declared — each level number may appear once`,
          span: l.span,
          ...(first.span
            ? { relatedSpans: [{ span: first.span, message: `level ${l.level} first declared here` }] }
            : {}),
        });
      } else {
        seen.set(l.level, l);
      }
    }

    // A plan-level `height` is every storey's default; a default clear height is nothing the
    // author said about any one storey (RM-D17).
    if (plan.clearSpan) {
      this.report({
        severity: "error",
        code: "E_CLEAR_SCOPE",
        message: "A multi-storey plan writes `clear` in each `level` header, not on the plan's `height` line",
        span: plan.clearSpan,
        hints: ['write it after the storey\'s own height: `level 2 "First" height 2750 clear 2400 { … }`'],
      });
    }

    for (const s of plan.body) {
      // A plan-level-only element (`ElementDef.planLevelOnly`, the `section` mark) belongs beside the
      // levels: `levelPlanFor` gives it to the lowest storey.
      if (LEVEL_SHARED_KINDS.includes(s.kind) || this.registry.byKind.get(s.kind)?.planLevelOnly) continue;
      this.report({
        severity: "error",
        code: "E_LEVEL_MIX",
        message: `"${s.kind}" cannot sit at plan level in a multi-storey plan. ${CATALOG_FIXES.E_LEVEL_MIX}`,
        span: s.span,
      });
    }
  }

  /**
   * `level <int> ["Name"] { <statements> }` — one storey. The number may be negative
   * (`level -1 "Basement"`) and must be a whole number: a fractional storey is a parse
   * error rather than a silently truncated page. The body is an ordinary statement block,
   * so scripting inside a level works exactly as it does in a single-storey plan.
   */
  private parseLevel(components: Map<string, ComponentDef>): LevelNode {
    const kw = this.eatKeyword("level");
    let sign = 1;
    if (this.isType("minus")) {
      this.next();
      sign = -1;
    }
    const numTok = this.peek();
    const n = sign * this.eatNumber();
    if (!Number.isInteger(n)) {
      this.fail(`Level number must be a whole number (got ${n})`, numTok);
    }
    const name = this.isType("string") ? this.eatString() : undefined;
    // `level 2 ["Name"] height <expr> { … }` — the storey's floor-to-floor height, in the
    // HEADER and after the optional name. It cannot go in the body: the body is an
    // ordinary statement list and a plan-level setting sitting there is `E_LEVEL_MIX`.
    let height: Expr | undefined;
    let heightSpan: Span | undefined;
    if (this.isKeyword("height")) {
      const hk = this.next();
      height = parseExprPratt(this.ctx);
      heightSpan = { start: hk.start, end: this.peek(-1).end };
    }
    // `slab <expr>` then `clear <expr>` (MF-D1, RM-D17), in that order after `height`. Both are
    // read only here, in the header before its `{`, so `slab` is no reserved word.
    const slab = this.headerClause("slab");
    const clear = this.headerClause("clear");
    const body = this.parseBlockBody(components, undefined);
    return {
      kind: "level",
      id: "",
      level: n,
      ...(name !== undefined ? { name } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(heightSpan !== undefined ? { heightSpan } : {}),
      ...(slab ? { slab: slab.expr, slabSpan: slab.span } : {}),
      ...(clear ? { clear: clear.expr, clearSpan: clear.span } : {}),
      body,
      line: kw.line,
    };
  }

  /**
   * `zone <id> ["Label"] { <statements> }` — a wing/department grouping. The body is an
   * ordinary statement block, so anything legal in a plan (including a nested `zone`) is
   * legal inside one; `level` is not, and `parseOneBodyStatement` already rejects it with
   * `E_LEVEL_NEST`.
   */
  private parseZone(components: Map<string, ComponentDef>, selfName?: string): ZoneNode {
    const kw = this.eatKeyword("zone");
    const id = this.eatIdent().value;
    const label = this.isType("string") ? this.eatString() : undefined;
    const body = this.parseBlockBody(components, selfName);
    return { kind: "zone", id, ...(label !== undefined ? { label } : {}), body, line: kw.line };
  }

  private isType(type: Token["type"]): boolean {
    if (type !== "ident" && type !== "eof") this.probe(Math.min(this.pos, this.toks.length - 1), TOKEN_TEXT[type]);
    return this.peek().type === type;
  }

  // ---- plan-level settings (one method per `parsePlan` switch case) ----------

  /** A repeated `accTitle`/`accDescr` at plan level: last value wins, but flag it
   *  (catalogued warning) since a duplicate metadata line is almost always a mistake. */
  private warnDupAcc(kw: string, t: Token): void {
    this.report({
      severity: "warning",
      message: `Duplicate "${kw}" — the last one wins`,
      code: "W_DUP_ACC_METADATA",
      span: { start: t.start, end: t.end },
    });
  }

  private parseUnitsSetting(plan: PlanNode): void {
    this.next();
    // Spanned on the unit word, the token the error's `expected` describes (AF4).
    const ut = this.eatIdent();
    const u = ut.value;
    if (u !== "mm") this.fail(`Unsupported units "${u}" (only "mm" is supported)`, ut, { expected: ["mm"] });
    plan.units = "mm";
  }

  /**
   * `height <expr>` — the plan's default floor-to-floor storey height, in mm.
   *
   * A full EXPRESSION rather than a bare number, exactly as `thickness` is, so a plan can
   * write `let h = 3200` once and `height h` everywhere. The value is not checked here:
   * range refusals belong at resolve, where the expression has a number
   * (`E_HEIGHT_RANGE`).
   */
  private parseHeightSetting(plan: PlanNode, t: Token): void {
    this.next();
    plan.height = parseExprPratt(this.ctx);
    plan.heightSpan = this.spanFrom(t.start);
    // `height <expr> clear <expr>`: a single-storey plan's clear height (RM-D17). On the same line
    // and never the first word of an assignment or a macro call, so a `clear` binding keeps its
    // meaning.
    const clear = this.isTrailingWord("clear") ? this.headerClause("clear") : undefined;
    if (clear) {
      plan.clear = clear.expr;
      plan.clearSpan = clear.span;
    }
  }

  /** `<word> <expr>` when the next token is `word`: the expression and the clause's span. */
  private headerClause(word: string): { expr: Expr; span: Span } | undefined {
    if (!this.isKeyword(word)) return undefined;
    const k = this.next();
    const expr = parseExprPratt(this.ctx);
    return { expr, span: { start: k.start, end: this.peek(-1).end } };
  }

  /**
   * A trailing `hidden`: the mark goes, the fact stays. Read only where the clause can stand, on its
   * statement's line, and never when `=` or `(` follows: a statement that starts with the word stays one.
   */
  private eatHidden(plan: PlanNode, mark: keyof ChromeHide): boolean {
    if (!this.isTrailingWord("hidden")) return false;
    this.next();
    plan.hide = { ...plan.hide, [mark]: true };
    return true;
  }

  /** The word as a clause: not the first token of an assignment or a macro call. */
  private isTrailingWord(word: string): boolean {
    // The line first: a word on the next line is no trailing clause, so it is not looked for there (AF4).
    return this.peek().line === this.peek(-1).line && this.isKeyword(word) && !this.isTrailer(this.peek(1));
  }

  /** Whether the next token is one of `words`, each looked for ({@link probe}, AF4). */
  private isOneOf(words: readonly string[]): boolean {
    return words.some((w) => this.isKeyword(w));
  }

  private isTrailer(t: Token): boolean {
    return t.type === "equals" || t.type === "lparen";
  }

  private parseScaleSetting(plan: PlanNode, t: Token): void {
    this.next();
    if (this.eatHidden(plan, "scale")) return;
    const a = this.eatNumber();
    this.eat("colon");
    const b = this.eatNumber();
    // `plainDigits` is `String` from 1e-6 to below 1e21, so every scale that was readable reads
    // the same; outside that range `String` wrote an exponent (`1e+21`, `1e-7`), which
    // `scaleDenominator` could not read (the scale was silently dropped) and `arch fmt` could not
    // re-parse, and `plainDigits` writes the digits out instead.
    plan.scale = `${plainDigits(a)}:${plainDigits(b)}`;
    plan.scaleSpan = this.spanFrom(t.start);
    this.eatHidden(plan, "scale");
  }

  /**
   * `paper A4|A3|A2|A1|A0 [landscape|portrait]` — the sheet the drawing is issued on.
   * Orientation defaults to `landscape` (floor plans are wide). Declaring `paper` makes
   * `scale` operative; see `src/sheet.ts`.
   */
  private parsePaperSetting(plan: PlanNode, t: Token): void {
    this.next();
    const sizeTok = this.eatIdent();
    const size = sizeTok.value.toUpperCase();
    if (!(PAPER_SIZES as readonly string[]).includes(size)) {
      this.fail(`Unknown paper size "${sizeTok.value}" (expected ${PAPER_SIZES.join("|")})`, sizeTok, {
        expected: PAPER_SIZES,
      });
    }
    let orientation: PaperOrientation = "landscape";
    if (this.isOneOf(PAPER_ORIENTATIONS)) {
      orientation = this.eatIdent().value as PaperOrientation;
    }
    plan.paper = { size: size as PaperSize, orientation };
    plan.paperSpan = this.spanFrom(t.start);
  }

  private parseDimsSetting(plan: PlanNode): void {
    this.next();
    // Spanned on the word after `dims`, the token the error's `expected` describes (AF4).
    const at = this.eatIdent();
    const a = at.value;
    if (a !== "auto") this.fail(`Expected "auto" after "dims" but found "${a}"`, at, { expected: ["auto"] });
    let mode: AutoDimsMode = "all";
    // `walls` is both a mode and a statement keyword (`walls from rooms`): a mode word that
    // starts a statement on the next line (`dims auto` then `walls from rooms …`) is left
    // to that statement.
    const startsStatement = this.statementStarts.has(this.peek().value) && this.isKeyword("from", 1);
    if (this.isOneOf(AUTO_DIMS_MODES) && !startsStatement) {
      mode = this.eatIdent().value as AutoDimsMode;
    }
    plan.autoDims = mode;
  }

  /**
   * `schedule <subject>` — opt into a sheet schedule table. The subject is required and
   * closed (`SCHEDULE_SUBJECTS`: `rooms`, `openings`) so the surface can grow without
   * a respelling; an unknown word fails with the available list plus a `closest()`
   * did-you-mean, spanned on the OFFENDING WORD rather than the keyword. Repeating the
   * statement is idempotent (declarative), never a duplicate error, and each subject is
   * its own flag, so `schedule rooms` and `schedule openings` compose.
   */
  private parseScheduleSetting(plan: PlanNode): void {
    this.next();
    const st = this.eatIdent();
    const subject = st.value;
    if (!(SCHEDULE_SUBJECTS as readonly string[]).includes(subject)) {
      const hint = closest(subject, [...SCHEDULE_SUBJECTS]);
      this.fail(
        `Unknown schedule subject "${subject}"${hint ? ` — did you mean "${hint}"?` : ""}` +
          ` (available: ${SCHEDULE_SUBJECTS.join(", ")})`,
        st,
        { expected: SCHEDULE_SUBJECTS },
      );
    }
    if ((subject as ScheduleSubject) === "openings") plan.openingSchedule = true;
    else {
      plan.schedule = "rooms";
      // `net` rides on `rooms` only. A word on the next line can also start a statement: an inline
      // macro call of a component named `net` (`net()`), as `dims auto` guards `walls` above. So `net`
      // is taken only when no `(` follows it.
      if (this.isKeyword("net") && this.peek(1).type !== "lparen") {
        this.next();
        plan.scheduleNet = true;
      }
    }
  }

  /**
   * `notes "…" ["…" …]` — one or more general-note strings for the sheet's NOTES table.
   * At least one string is required; repeated statements APPEND in source order (as
   * `axes` rows do), so a long list may be written one note per line.
   */
  private parseNotesSetting(plan: PlanNode): void {
    this.next();
    const notes = [this.eatString()];
    while (this.isType("string")) notes.push(this.eatString());
    plan.notes = [...(plan.notes ?? []), ...notes];
  }

  /**
   * Does `sheet text {` start here? `sheet` is contextual, never a `STATEMENT_STARTS` word: `room
   * id=sheet` keeps parsing, and a macro call `sheet()` falls through to the body statements.
   */
  private atSheetText(): boolean {
    const [kw, text] = [this.peek(), this.peek(1)];
    return (
      kw.type === "ident" &&
      kw.value === "sheet" &&
      text.type === "ident" &&
      text.value === "text" &&
      this.peek(2).type === "lcurly"
    );
  }

  /**
   * `sheet text { <key> "…" … }` — the words the sheet draws, in the plan's own language
   * (`src/sheet-text.ts`). One block, each key once, every string checked here: a mistyped key
   * or a second value would otherwise leave an English word on the sheet with no report, and a
   * block with no entry says nothing, which is a slip and not a sheet.
   */
  private parseSheetText(plan: PlanNode, start: number): SheetTextNode {
    const kw = this.peek();
    if (plan.sheetText) this.fail("`sheet text` is written twice: a plan has one", kw);
    this.next();
    this.next();
    this.eat("lcurly");
    const entries: SheetTextEntry[] = [];
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const k = this.peek();
      if (k.type !== "ident")
        // The 267 keys are built only while the error can be reported, and `expected` keeps the first
        // 16 (AF4, `EXPECTED_MAX`); the loop's own `}` is listed after them.
        this.fail(`Expected a sheet text key but found ${describe(k)}`, k, {
          expected: this.reportable() ? sheetTextKeys() : [],
        });
      if (!isSheetTextKey(k.value)) {
        // One hint a parse, on a word a key's length: this search reads every key, and no step meter
        // runs here, so a source of a million bad keys must not pay for a million searches.
        const near = !this.sheetKeyHinted && k.value.length <= MAX_SHEET_WORD;
        const hint = near ? closest(k.value, [...sheetTextKeys()]) : null;
        this.sheetKeyHinted = true;
        this.fail(`Unknown sheet text key "${k.value}"${hint ? ` — did you mean "${hint}"?` : ""}`, k, {
          expected: this.reportable() ? sheetTextKeys() : [],
        });
      }
      if (entries.some((e) => e.key === k.value)) this.fail(`\`${k.value}\` is written twice in \`sheet text\``, k);
      this.next();
      const v = this.peek();
      const value = this.eatString();
      const refused = sheetTextRefusal(k.value, value);
      if (refused) this.fail(refused, v);
      entries.push({ key: k.value, value, span: { start: k.start, end: v.end } });
    }
    this.eat("rcurly");
    if (entries.length === 0) this.fail("`sheet text` writes nothing: give it a key, or leave the block out", kw);
    return { entries, line: kw.line, span: this.spanFrom(start) };
  }

  /**
   * One value from a closed vocabulary, spanned on the OFFENDING WORD with a `closest()`
   * did-you-mean — the `schedule` variant of the pattern, factored out because `site` has
   * two such fields. `what` names the slot in the message ("street direction").
   */
  private eatVocab<T extends string>(values: readonly T[], what: string): T {
    const t = this.eatIdent();
    if (!(values as readonly string[]).includes(t.value)) {
      const hint = closest(t.value, [...values]);
      this.fail(
        `Unknown ${what} "${t.value}"${hint ? ` — did you mean "${hint}"?` : ""} (available: ${values.join(", ")})`,
        t,
        { expected: values },
      );
    }
    return t.value as T;
  }

  /**
   * `site { street north|south|east|west [hemisphere north|south] }` — where the building
   * sits relative to its street. A plan-level setting, like the `north` it composes with;
   * it draws nothing and moves nothing.
   *
   * Two refusals rather than two defaults:
   *  - **`E_SITE_NO_STREET`** — a `site` with no `street` derives nothing at all, so it is
   *    an error, not an empty block. (`hemisphere` DOES default, to `north`: it has a
   *    right answer for most of the world and both values derive the same shape of fact.)
   *  - **`E_SITE_DUP`** — `axes` merges because two axis lists append; two `street` values
   *    CONTRADICT. Silently overwriting (what `paper` does) would hide an authoring
   *    mistake in the one statement whose whole job is to be the single source of
   *    orientation. The FIRST block wins so the rest of the parse stays deterministic.
   */
  private parseSiteSetting(plan: PlanNode, t: Token): void {
    this.next();
    this.eat("lcurly");
    let street: CompassWord | undefined;
    let hemisphere: Hemisphere = "north";
    // `boundary (x,y) (x,y) …` — the LOT LINE. The one field of `site` that draws
    // anything and the one that joins the page bounds; absent unless written, which is
    // what preserves the law that a `site` block moves nothing.
    let boundary: ExprPoint[] | undefined;
    let boundarySpan: Span | undefined;
    const FIELDS = ["street", "hemisphere", "boundary"];
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const f = this.peek();
      if (f.type !== "ident") {
        this.fail(`Expected a site field (${FIELDS.map((x) => `"${x}"`).join(", ")}) but found ${describe(f)}`, f, {
          expected: [...FIELDS, TOKEN_TEXT.rcurly],
        });
      }
      if (f.value === "street") {
        this.next();
        street = this.eatVocab(COMPASS_DIRECTIONS, "street direction");
      } else if (f.value === "hemisphere") {
        this.next();
        hemisphere = this.eatVocab(HEMISPHERES, "hemisphere");
      } else if (f.value === "boundary") {
        const kw = this.next();
        const ring: ExprPoint[] = [];
        while (this.isType("lparen")) ring.push(this.parsePoint());
        if (ring.length < 3) {
          this.fail("A `boundary` needs at least 3 points — `boundary (x,y) (x,y) (x,y) …`", this.peek());
        }
        boundary = ring;
        boundarySpan = { start: kw.start, end: this.peek(-1).end };
      } else {
        const hint = closest(f.value, FIELDS);
        this.fail(
          `Unknown site field "${f.value}"${hint ? ` — did you mean "${hint}"?` : ""} ` +
            `(available: ${FIELDS.join(", ")})`,
          f,
          { expected: FIELDS },
        );
      }
    }
    this.eat("rcurly");
    const span = this.spanFrom(t.start);
    if (street === undefined) {
      this.report({
        severity: "error",
        code: "E_SITE_NO_STREET",
        message: "`site` needs a `street` direction — a site with no street derives nothing",
        span,
        hints: ["add `street north|south|east|west` inside the block, e.g. `site { street south }`"],
      });
      return;
    }
    if (plan.site !== undefined) {
      this.report({
        severity: "error",
        code: "E_SITE_DUP",
        message: "`site` is already declared — one building sits on one site",
        span,
        ...(plan.site.span ? { relatedSpans: [{ span: plan.site.span, message: "site first declared here" }] } : {}),
        hints: ["delete one of the two blocks, or merge their fields into a single `site { … }`"],
      });
      return;
    }
    plan.site = {
      street,
      hemisphere,
      ...(boundary ? { boundary } : {}),
      ...(boundarySpan ? { boundarySpan } : {}),
      line: t.line,
      span,
    };
  }

  /** Optional `id=<ident>` prefix; returns "" when absent. */
  private parseIdOpt(): string {
    if (this.isKeyword("id")) {
      this.next();
      this.eat("equals");
      const t = this.eatIdent();
      this.lastIdSpan = { start: t.start, end: t.end };
      return this.declName(t);
    }
    return "";
  }
  /** The span of the last `id=` name {@link parseIdOpt} read (see {@link idSpanOf}). */
  private lastIdSpan: Span | undefined;

  /**
   * A name in a DECLARATION position. A dotted name (`west.main`) addresses an element
   * inside a `place`d instance — it can only ever be a REFERENCE, because the namespace
   * belongs to the `place`, not to the statement being declared. Report it (once, with
   * the undotted suggestion) and keep the last segment so the rest of the statement
   * still parses.
   */
  private declName(t: Token): string {
    const dot = t.value.indexOf(".");
    if (dot < 0) return t.value;
    const tail = t.value.slice(t.value.lastIndexOf(".") + 1);
    this.report({
      severity: "error",
      code: "E_DOTTED_DECL",
      message: `"${t.value}" cannot be DECLARED — a dotted name addresses an element inside a \`place\`d instance, so it is a reference only`,
      span: { start: t.start, end: t.end },
      hints: [`declare it as "${tail}" and address it from outside as "<instance>.${tail}"`],
    });
    return tail;
  }

  private parseNorth(): NorthDir {
    const t = this.peek();
    if (t.type === "number") {
      this.next();
      // Past MAX_ANGLE_DEG a bearing's `deg × π` overflows and the north arrow draws `NaN`.
      if (Math.abs(t.num!) > MAX_ANGLE_DEG) {
        this.report(
          outOfRangeDiagnostic(
            `\`north ${fmt3(t.num!)}\` is a bearing of ${fmt3(t.num!)} degrees, outside ±${fmt3(MAX_ANGLE_DEG)} (2^25, so its sine and cosine stay finite)`,
            { start: t.start, end: t.end },
          ),
        );
        return "up";
      }
      return { deg: t.num! };
    }
    if (t.type === "ident" && (NORTH_DIRS as readonly string[]).includes(t.value)) {
      this.next();
      return t.value as NorthCardinal;
    }
    this.fail(`Expected a north direction (${NORTH_DIRS.join("|")}|<degrees>) but found ${describe(t)}`, t, {
      near: NORTH_DIRS,
      expected: [...NORTH_DIRS, TOKEN_TEXT.number],
    });
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
    else
      this.fail(`Expected "x" between width and height but found ${describe(this.peek())}`, undefined, { near: ["x"] });
    const h = parseExprPratt(this.ctx);
    return { w, h };
  }

  private parseTitle(): TitleNode {
    const kw = this.eatKeyword("title");
    this.eat("lcurly");
    const node: TitleNode = { line: kw.line };
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      if (t.type !== "ident")
        this.fail(`Expected a title field but found ${describe(t)}`, t, {
          expected: [...TITLE_FIELDS, TOKEN_TEXT.rcurly],
        });
      // One case per word of `TITLE_FIELDS`, each filling its `TitleNode` key.
      if (!(TITLE_FIELDS as readonly string[]).includes(t.value))
        this.fail(`Unknown title field "${t.value}"`, t, { near: TITLE_FIELDS });
      this.next();
      node[TITLE_FIELD_KEY[t.value as TitleField]] = this.eatString();
    }
    this.eat("rcurly");
    return node;
  }

  /**
   * `axes { x at <expr>, <expr>, … y at <expr>, … }` — plan-level positioning axes
   * (定位轴线). One row per direction, each row a comma-separated expression list;
   * rows may repeat and appear in either order (they append). `at` is the existing
   * attribute keyword, so no new token enters the grammar beyond `axes` itself.
   */
  private parseAxes(): AxesNode {
    const kw = this.eatKeyword("axes");
    this.eat("lcurly");
    const node: AxesNode = { x: [], y: [], line: kw.line };
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
      if (t.type !== "ident" || (t.value !== "x" && t.value !== "y")) {
        this.fail(`Expected an axis direction ("x" or "y") but found ${describe(t)}`, t, {
          expected: ["x", "y", TOKEN_TEXT.rcurly],
        });
      }
      this.next();
      this.eatKeyword("at");
      const into = t.value === "x" ? node.x : node.y;
      into.push(parseExprPratt(this.ctx));
      while (this.isType("comma")) {
        this.next();
        into.push(parseExprPratt(this.ctx));
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
  private parseTheme(): { base?: string; baseSpan?: Span; from?: string; theme: Partial<Theme> } {
    this.eatKeyword("theme");
    if (this.isKeyword("from")) {
      this.next();
      return { from: this.eatString(), theme: {} };
    }
    // A leading ident is a named base (`theme blueprint { … }` or just `theme blueprint`).
    const baseTok = this.isType("ident") ? this.eatIdent() : undefined;
    const base = baseTok?.value;
    const baseSpan = baseTok ? { start: baseTok.start, end: baseTok.end } : undefined;
    const theme: Partial<Theme> = {};
    if (this.isType("lcurly")) {
      this.eat("lcurly");
      while (!this.isType("rcurly") && !this.isType("eof")) {
        const keyTok = this.eatIdent();
        if (this.isType("colon")) this.next();
        const resolved = resolveThemeKey(keyTok.value);
        if (!resolved) {
          this.report({
            severity: "warning",
            message: `Unknown theme key "${keyTok.value}"`,
            code: "W_UNKNOWN_THEME_KEY",
            span: { start: keyTok.start, end: keyTok.end },
          });
          if (this.isType("string") || this.isType("number")) this.next();
          else this.fail(`Expected a value for theme key "${keyTok.value}"`, undefined, { expected: KEY_VALUE });
          continue;
        }
        if (isNumericThemeKey(resolved)) {
          const vt = this.peek();
          (theme as Record<string, unknown>)[resolved] = this.eatNumber();
          // Where the value was written: the drawn pen it scales is held to the modelling
          // range after resolve (`checkDrawnSizes`, `src/ir/checks.ts`), which blames this literal.
          this.lineWeightSpan = { start: vt.start, end: vt.end };
        } else {
          (theme as Record<string, unknown>)[resolved] = this.sanitizedStringValue(keyTok, "theme");
        }
      }
      this.eat("rcurly");
    }
    return { base, ...(baseSpan ? { baseSpan } : {}), theme };
  }

  /** Eat a string value, blanking it (with a diagnostic) if it carries a
   *  disallowed token — markup or a `data:` URL (untrusted source config). */
  private sanitizedStringValue(keyTok: Token, what: string): string {
    const val = this.eatString();
    if (isDisallowedConfigValue(val)) {
      this.report({
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
        this.report({
          severity: "warning",
          message: `Unknown style key "${keyTok.value}" for "${kind}"`,
          code: "W_UNKNOWN_STYLE_KEY",
          span: { start: keyTok.start, end: keyTok.end },
        });
        if (this.isType("string") || this.isType("number")) this.next();
        else this.fail(`Expected a value for style key "${keyTok.value}"`, undefined, { expected: KEY_VALUE });
        continue;
      }
      (style as Record<string, unknown>)[resolved] = this.sanitizedStringValue(keyTok, "style");
    }
    this.eat("rcurly");
    return { kind, style };
  }

  // ---- `keep` (ADR 0033) -------------------------------------------------------------

  /**
   * `keep <form> [hard|soft|advisory]` — a declared invariant (ADR 0033, PS4.3 design §2). Every
   * word after `keep` is contextual (`KEEP_WORDS`). Parsing rules (R14): a grade word is always
   * the grade, never a target, and ends the statement; a value (`<mm>`, a level) is the longest
   * complete expression; a target list ends at the first token that cannot be a target (a grade,
   * a statement keyword, `}`, or a name that starts an assignment or a call).
   */
  private parseKeep(): KeepNode {
    const line = this.peek().line;
    try {
      return this.parseKeepForm();
    } catch (e) {
      // A keep is one line: on a failure, skip the rest of it before recovery resyncs, so a form
      // word that is also a statement keyword (`level`, `height`) is not parsed as a statement.
      if (e instanceof ParseError) {
        while (!this.isType("eof") && !this.isType("rcurly") && this.peek().line === line) this.next();
      }
      throw e;
    }
  }

  private parseKeepForm(): KeepNode {
    const kw = this.eatKeyword("keep");
    const w = this.peek();
    const forms = KEEP_WORDS.forms;
    const base = { kind: "keep" as const, id: "", line: kw.line };
    let node: KeepNode;
    if (this.isKeyword(forms.align[0])) {
      this.next();
      node = { ...base, form: "align", refs: this.parseKeepRefs("align", "datums") };
    } else if (this.isKeyword(forms.equal[0])) {
      this.next();
      const m = this.peek();
      if (m.type !== "ident" || !(KEEP_WORDS.measures as readonly string[]).includes(m.value)) {
        this.fail(
          `\`keep equal\` takes ${KEEP_WORDS.measures.join(" or ")} first, then the rooms or openings it compares (found ${describe(m)})`,
          m,
          { near: KEEP_WORDS.measures },
        );
      }
      this.next();
      const measure = m.value as "width" | "depth";
      node = { ...base, form: "equal", measure, refs: this.parseKeepRefs("equal", "extents") };
    } else if (this.isKeyword(forms.offset[0])) {
      this.next();
      const x = this.parseKeepRef();
      this.eatKeyword("from");
      const from = this.parseKeepRef();
      node = { ...base, form: "offset", x, from, mm: parseExprPratt(this.ctx) };
    } else if (this.isKeyword(forms["min-clear"][0]) && this.isKeyword(forms["min-clear"][1], 1)) {
      this.next();
      this.next();
      const room = this.parseKeepRef();
      node = { ...base, form: "min-clear", room, mm: parseExprPratt(this.ctx) };
    } else if (this.isKeyword(forms["on-axis"][0]) && this.isKeyword(forms["on-axis"][1], 1)) {
      this.next();
      const axis = this.parseKeepRef();
      node = { ...base, form: "on-axis", axis, wall: this.parseKeepRef() };
    } else if (this.isKeyword(forms.stacked[0])) {
      this.next();
      const target = this.parseKeepRef();
      this.eatKeyword(KEEP_WORDS.levels[0]);
      this.eatKeyword(KEEP_WORDS.levels[1]);
      const levels = [parseExprPratt(this.ctx)];
      while (this.keepValueFollows()) levels.push(parseExprPratt(this.ctx));
      if (levels.length < 2) {
        this.fail("`keep stacked … on levels` compares storeys, so it names at least two levels");
      }
      node = { ...base, form: "stacked", target, levels };
    } else if (this.isKeyword(forms.fixed[0])) {
      this.next();
      const datum = this.parseKeepRef();
      this.eatKeyword("at");
      node = { ...base, form: "fixed", datum, mm: parseExprPratt(this.ctx) };
    } else {
      this.fail(
        `Expected a keep form (align, equal, offset, min clear, on axis, stacked or fixed) after "keep" but found ${describe(w)}`,
        w,
        { near: Object.values(forms).map((f) => f[0]) },
      );
    }
    if (this.isType("ident") && isKeepGrade(this.peek().value)) node.grade = this.next().value as KeepGrade;
    return node;
  }

  /** Whether the next token can be one more target of a keep's list (see {@link parseKeep}). */
  private keepRefFollows(): boolean {
    const t = this.peek();
    if (t.type !== "ident" || isKeepGrade(t.value) || this.statementStarts.has(t.value)) return false;
    const after = this.peek(1).type;
    return after !== "equals" && after !== "lparen";
  }

  /** Whether the next token can start one more level of a `stacked` keep's list. */
  private keepValueFollows(): boolean {
    const t = this.peek();
    if (t.type === "number" || t.type === "minus" || t.type === "lparen") return true;
    return this.keepRefFollows();
  }

  /** Two or more targets, then the end of the list. */
  private parseKeepRefs(form: string, what: string): KeepRef[] {
    const refs = [this.parseKeepRef()];
    while (this.keepRefFollows()) refs.push(this.parseKeepRef());
    if (refs.length < 2) this.fail(`\`keep ${form}\` compares ${what}, so it names at least two`);
    return refs;
  }

  /** One target: `<room>.<word>`, `axis <label>`, or an id with an optional `segment <n>`. */
  private parseKeepRef(): KeepRef {
    const t = this.peek();
    if (t.type === "ident" && t.value === "axis") {
      const after = this.peek(1);
      if (after.type === "number" || (after.type === "ident" && !isKeepGrade(after.value))) {
        this.next();
        const l = this.next();
        return { t: "axis", label: l.value, span: { start: t.start, end: l.end } };
      }
    }
    if (t.type !== "ident" || this.statementStarts.has(t.value) || isKeepGrade(t.value)) {
      this.fail(
        `Expected a keep target (a room datum such as \`a.left\`, \`axis <label>\`, or an authored id) but found ${describe(t)}`,
        t,
        { expected: [TOKEN_TEXT.ident, "axis"] },
      );
    }
    this.next();
    const d = splitDatum(t.value);
    if (d) return { t: "room", room: d.room, word: d.word, span: { start: t.start, end: t.end } };
    if (this.isKeyword("segment") && this.peek(1).type === "number") {
      this.next();
      const n = this.next();
      if (!Number.isInteger(n.num) || n.num! < 0) {
        this.fail(`\`segment\` takes a whole number counted from 0 (got ${n.value})`, n);
      }
      return { t: "el", id: t.value, segment: n.num!, span: { start: t.start, end: n.end } };
    }
    return { t: "el", id: t.value, span: { start: t.start, end: t.end } };
  }

  private parseLet(): LetNode {
    const kw = this.eatKeyword("let");
    const name = this.declName(this.eatIdent());
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

  /**
   * `place NAME(args) as <name> at (x,y) [rotate 0|90|180|270] [mirror x|y]` — the
   * component-v2 instantiation form.
   *
   * `as` and `at` are both REQUIRED, and the grammar says so rather than defaulting: an
   * instance that cannot be addressed is not a component, and one that lands wherever the
   * body's literals happen to point is the legacy macro (which is still spelled
   * `NAME(args)` and is unchanged). Rejecting the omission here, at parse time, is what
   * keeps the two forms from blurring into each other.
   */
  private parsePlace(): PlaceNode {
    const kw = this.eatKeyword("place");
    const nameTok = this.eatIdent();
    this.eat("lparen");
    const args: Expr[] = [];
    while (!this.isType("rparen") && !this.isType("eof")) {
      args.push(parseExprPratt(this.ctx));
      if (this.isType("comma")) this.next();
      else break;
    }
    this.eat("rparen");
    if (!this.isKeyword("as")) {
      this.fail(
        `\`place ${nameTok.value}(…)\` needs \`as <name>\` — a placed instance is addressable (write \`${nameTok.value}(…)\` for the legacy inline macro)`,
        undefined,
        { near: ["as"] },
      );
    }
    this.next();
    const aliasTok = this.eatIdent();
    const alias = this.declName(aliasTok);
    if (!this.isKeyword("at")) {
      this.fail(
        `\`place ${nameTok.value}(…) as ${alias}\` needs \`at (x, y)\` — a component is authored from (0,0)`,
        undefined,
        { near: ["at"] },
      );
    }
    this.next();
    const at = this.parsePoint();
    const node: PlaceNode = {
      kind: "place",
      id: "",
      name: nameTok.value,
      args,
      alias,
      aliasSpan: { start: aliasTok.start, end: aliasTok.end },
      at,
      line: kw.line,
    };
    if (this.isKeyword("rotate")) {
      this.next();
      const rt = this.peek();
      const deg = this.eatNumber();
      if (deg !== 0 && deg !== 90 && deg !== 180 && deg !== 270) {
        this.fail(`\`place … rotate\` must be 0, 90, 180 or 270 (got ${deg})`, rt, {
          expected: ["0", "90", "180", "270"],
        });
      }
      node.rotate = deg as PlaceRotate;
    }
    if (this.isKeyword("mirror")) {
      this.next();
      const mt = this.eatIdent();
      if (mt.value !== "x" && mt.value !== "y") {
        this.fail(`\`place … mirror\` must be "x" (flip left↔right) or "y" (flip top↔bottom)`, mt, {
          expected: ["x", "y"],
        });
      }
      node.mirror = mt.value;
    }
    return node;
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
   * The fixed statement words {@link parseOneBodyStatement} dispatches on (AF4), one handler each,
   * read by the dispatch and by {@link statementWords} alike. A word whose `opens` is false in a
   * scope is read there only to be refused (`E_ACC_PLACEMENT`, `E_LEVEL_NEST`, `E_STRIP_NEST`,
   * `E_KEEP_PLACEMENT`), so a parse error's `expected` leaves it out. A fixed word wins over a
   * registry element of the same name.
   */
  private readonly bodyForms: ReadonlyMap<string, BodyForm> = new Map<string, BodyForm>([
    ["accTitle", { opens: () => false, read: (start, t) => this.refuseAcc(start, t) }],
    ["accDescr", { opens: () => false, read: (start, t) => this.refuseAcc(start, t) }],
    // `level` partitions the WHOLE plan into storeys, so it is a plan-level block only.
    // Reaching here means one appeared inside another level, a control-flow body, a strip,
    // or a component: consume it for clean recovery and report E_LEVEL_NEST.
    [
      "level",
      {
        opens: () => false,
        read: (start, t, components) => {
          this.parseLevel(components);
          const msg = `"level" is only allowed at plan level, not inside a block, component, or another level`;
          this.report({ severity: "error", message: msg, code: "E_LEVEL_NEST", span: this.spanFrom(start) });
          return { kind: "error", id: "", line: t.line, message: msg };
        },
      },
    ],
    // `strip` is a plan-level block only. Inside a component/control-flow block (or
    // another strip), consume it for clean recovery and report E_STRIP_NEST.
    [
      "strip",
      {
        opens: () => false,
        read: (start, t) => {
          this.parseStrip();
          const msg = `"strip" is only allowed at plan level, not inside a block, component, or another strip`;
          this.report({ severity: "error", message: msg, code: "E_STRIP_NEST", span: this.spanFrom(start) });
          return { kind: "error", id: "", line: t.line, message: msg };
        },
      },
    ],
    // `zone` is legal wherever a statement is — plan level, inside a `level` block, inside
    // a control-flow body or a component — because it is a pure metadata wrapper with no
    // geometric semantics. Handled here (not in `parsePlan`'s switch) so all of those
    // positions get it from one place. `place` rides the same seam.
    ["zone", { opens: () => true, read: (_s, _t, c, self) => this.parseZone(c, self) }],
    ["place", { opens: () => true, read: () => this.parsePlace() }],
    ["for", { opens: () => true, read: (_s, _t, c, self) => this.parseFor(c, self) }],
    ["if", { opens: () => true, read: (_s, _t, c, self) => this.parseIf(c, self) }],
    ["while", { opens: () => true, read: (_s, _t, c, self) => this.parseWhile(c, self) }],
    ["set", { opens: () => true, read: () => this.parseSet() }],
    [
      "keep",
      {
        opens: (scope) => !scope.component,
        read: (start, t, _c, self) => {
          if (self === undefined) return this.parseKeep();
          // A keep inside a component would be checked once per instance in its own frame (ADR 0033):
          // refused where it is written, placed or not. Consumed for clean recovery, as `roof` is.
          this.parseKeep();
          const msg =
            "A keep inside a component would be checked once per instance in its own frame; write it in the plan";
          this.report({
            severity: "error",
            message: msg,
            code: "E_KEEP_PLACEMENT",
            span: this.spanFrom(start),
            hints: ["move the keep to the plan or storey that places the component"],
          });
          return { kind: "error", id: "", line: t.line, message: msg };
        },
      },
    ],
    ["let", { opens: () => true, read: () => this.parseLet() }],
  ]);

  /** `accTitle`/`accDescr` are plan-level only. Reaching a body means one appeared inside a
   *  component or control-flow block: consume it (with its string arg, if present) and report a
   *  catalogued error so recovery is clean and the message is specific rather than a generic
   *  "unknown statement". */
  private refuseAcc(start: number, t: Token): Statement {
    this.next();
    if (this.isType("string")) this.next();
    const msg = `"${t.value}" is only allowed at plan level, not inside a block or component`;
    this.report({ severity: "error", message: msg, code: "E_ACC_PLACEMENT", span: this.spanFrom(start) });
    return { kind: "error", id: "", line: t.line, message: msg };
  }

  /**
   * An element read where it does not begin a statement ({@link elementOpens}), consumed and refused.
   *
   * A `roof` belongs to a BUILDING, not to a reusable part of one. Its `overhang` sugar
   * asks "which closed exterior ring does this plan have?", and a component is authored
   * in its own local frame with no answer to that — two `place`d copies would each
   * derive their own outline and the plan would draw two roofs. `selfName` is set only
   * inside a `component` body (control-flow and `zone` bodies inherit it, which is
   * right: a `roof` in a loop inside a component is still inside the component), so it
   * is the precise test. Consumed for clean recovery, exactly as `E_ACC_PLACEMENT` does.
   *
   * A plan-level element inside a `level`, `zone`, `component` or block: consumed, then refused, as
   * `roof` is. The gate already read the statement as this element, so a malformed one is refused
   * for where it stands too (its shape is moot there), consumed to where the next statement starts.
   */
  private refuseElement(def: ElementDef, start: number, t: Token): Statement {
    if (def.planLevelOnly === undefined) {
      def.parse(this.ctx);
      const msg =
        `"roof" is only allowed at plan level (or inside a \`level\` block), not inside a component — ` +
        `an overhang is offset from the BUILDING's wall ring, which a component does not have`;
      this.report({ severity: "error", message: msg, code: "E_ROOF_PLACEMENT", span: this.spanFrom(start) });
      return { kind: "error", id: "", line: t.line, message: msg };
    }
    try {
      def.parse(this.ctx);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.synchronize(start);
    }
    const msg =
      `"${def.keyword}" is a plan-level statement: write it outside any \`level\`, \`zone\`, ` +
      `\`component\` or block, once for the whole plan`;
    this.report({ severity: "error", message: msg, code: def.planLevelOnly.code, span: this.spanFrom(start) });
    return { kind: "error", id: "", line: t.line, message: msg };
  }

  /**
   * Parse one body statement: an element, `let`, instance, `for`/`if`/`while`,
   * or assignment. Shared by the plan body, component bodies, and control-flow
   * blocks. `selfName` permits a component body to call itself recursively.
   */
  private parseOneBodyStatement(components: Map<string, ComponentDef>, selfName?: string): Statement {
    const t = this.peek();
    const start = t.start;
    const scope: BodyScope = { block: this.blockDepth > 0, component: selfName !== undefined };
    if (t.type !== "ident")
      this.fail(`Expected a statement but found ${describe(t)}`, t, { expected: this.statementExpected(scope) });
    // `sheet text` words the whole sheet, so it is plan-level only. Reaching here means one appeared
    // inside a `level`, a component or a control-flow block: consumed to its `}` without reading its
    // entries, because a key such as `legend` would otherwise read as a statement of its own.
    if (this.atSheetText()) {
      while (!this.isType("rcurly") && !this.isType("eof")) this.next();
      if (this.isType("rcurly")) this.next();
      const msg = "`sheet text` is a plan-level statement: write it once, outside any `level`, `component` or block";
      this.report({ severity: "error", message: msg, code: "E_PARSE", span: this.spanFrom(start) });
      return { kind: "error", id: "", line: t.line, message: msg };
    }
    // A fixed word (`for`, `zone`, `keep`, and the plan-level ones a block refuses): its handler
    // reads it, or refuses it where it stands (AF4, {@link bodyForms}). A refusal's error node is
    // returned as it was built, with no span, as every refusal here has always returned it.
    const form = this.bodyForms.get(t.value);
    let node: Statement;
    if (form) {
      node = form.read(start, t, components, selfName);
      if (node.kind === "error") return node;
    } else {
      const found = this.registry.byKeyword.get(t.value);
      // A contextual keyword starts its element only where the element says (`section A (`).
      const def = found && (!found.contextual || found.contextual(this.ctx)) ? found : undefined;
      if (def && !this.elementOpens(def, scope)) return this.refuseElement(def, start, t);
      if (def) {
        this.lastIdSpan = undefined;
        node = def.parse(this.ctx);
        if (this.lastIdSpan && (node as { id?: string }).id) recordIdSpan(node, this.lastIdSpan);
      }
      // An ident immediately followed by "=" is an assignment.
      else if (this.peek(1).type === "equals") node = this.parseAssign();
      // Any ident followed by "(" is a component call. The component may be
      // defined later, recursively (`selfName`), or brought in by an `import`
      // (added at link time, after parse) — so an unknown name is validated at
      // expand (E_UNKNOWN_COMPONENT), not here. `components`/`selfName` retained
      // for clarity of intent.
      else if (this.peek(1).type === "lparen") node = this.parseInstance();
      else {
        const stray = STRAY_CLAUSE_HINTS.get(t.value);
        // After a `uses` list on its line, a use is what the room would still have read (AF2, AF4).
        const expected = [...this.statementExpected(scope), ...(this.afterUses(t, true) ? USE_KINDS : [])];
        if (stray === undefined)
          this.fail(`Unknown statement "${t.value}"`, t, { near: this.wordsAt(t, scope), expected });
        throw new ParseError(
          `Unknown statement "${t.value}"`,
          { start: t.start, end: t.end },
          [stray],
          undefined,
          this.reportable() ? this.expectedAt(t, { start: t.start, end: t.end }, expected, undefined) : undefined,
        );
      }
    }
    node.span = this.spanFrom(start);
    return node;
  }

  /** Parse a `{ … }` block of body statements (with per-statement recovery). */
  private parseBlockBody(components: Map<string, ComponentDef>, selfName?: string): Statement[] {
    if (this.blockDepth >= MAX_NEST_DEPTH && this.isType("lcurly")) return this.skipTooDeepBlock();
    this.blockDepth++;
    try {
      return this.parseBlockBodyInner(components, selfName);
    } finally {
      this.blockDepth--;
    }
  }

  /** A block nested past {@link MAX_NEST_DEPTH}: one `E_PARSE` at its `{`, then the whole
   *  balanced block is skipped by counting braces — iteratively, so the cost is linear and
   *  the parser recurses no further however deep the source goes. */
  private skipTooDeepBlock(): Statement[] {
    const open = this.next();
    this.report({
      severity: "error",
      message: `Blocks are nested too deeply (limit ${MAX_NEST_DEPTH}); this block was not read`,
      code: "E_PARSE",
      span: { start: open.start, end: open.end },
    });
    let depth = 1;
    while (depth > 0 && !this.isType("eof")) {
      const t = this.next();
      if (t.type === "lcurly") depth++;
      else if (t.type === "rcurly") depth--;
    }
    if (depth > 0) this.missingClose();
    return [];
  }

  private parseBlockBodyInner(components: Map<string, ComponentDef>, selfName?: string): Statement[] {
    this.eat("lcurly");
    const body: Statement[] = [];
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const stmtTok = this.peek();
      try {
        body.push(this.parseOneBodyStatement(components, selfName));
      } catch (e) {
        if (e instanceof ParseError) {
          this.report(this.parseErrorDiag(e));
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
    // A block still open at end of input keeps what it parsed: the missing `}` is
    // reported (once, however many blocks owe one), and the statement holding this block
    // survives instead of turning the whole construct into one error node.
    if (this.isType("eof")) {
      this.missingClose();
      return body;
    }
    this.eat("rcurly");
    return body;
  }

  /** `for NAME in <expr> { body }`. */
  private parseFor(components: Map<string, ComponentDef>, selfName?: string): ForNode {
    const kw = this.eatKeyword("for");
    const varName = this.declName(this.eatIdent());
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
    // `import "wing.arch" as wing` (no `:`) — WHOLE-FILE instantiation: the module's own
    // top-level drawable statements become one implicit zero-parameter component. It is
    // spelled without the item list precisely because there is no item to name: the file
    // itself is the component.
    if (this.isKeyword("as")) {
      this.next();
      const aliasTok = this.eatIdent();
      return {
        kind: "import",
        spec,
        items: [],
        star: false,
        wholeAs: this.declName(aliasTok),
        line: kw.line,
      };
    }
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
    if (!def)
      this.fail(`Unknown element kind "${targetTok.value}" in "set" rule`, targetTok, {
        near: [...this.registry.byKeyword.keys()],
      });
    this.eat("lparen");
    const over: SetOverride[] = [];
    while (!this.isType("rparen") && !this.isType("eof")) {
      const keyTok = this.eatIdent();
      const key = keyTok.value;
      const refused = def.setRefuses?.[key];
      if (refused) this.fail(refused, keyTok);
      this.eat("colon");
      const valueTok = this.peek();
      const value = this.parseSetValue();
      over.push({ key, value });
      if (this.peek(-1) === valueTok && valueTok.type === "ident")
        this.warnSetWord(targetTok.value, key, valueTok, def);
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
    if (t.type !== "string")
      this.fail(`Expected a string but found ${describe(t)}`, t, { expected: [TOKEN_TEXT.string] });
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

  /**
   * `W_SET_VALUE_WORD` (plan-soundness PS0.16, ruled RM-D6: a warning in 1.x, an error at 2.0): a
   * bare word that {@link parseSetValue} took as text where the kind reads no such word, so the
   * rule does nothing (`set door(width: W)` is the text "W", never the value of `W`). The words a
   * kind reads come from its own `ElementDef.setWords`, never a list kept here. Every built-in
   * declares one (`{}` when it reads none); a kind that declares none (a plugin, which may read
   * any word from `ctx.defaults`) is never reported: only a declared table says which words a
   * kind does not read.
   */
  private warnSetWord(kind: string, key: string, tok: Token, def: ElementDef): void {
    const words = def.setWords;
    if (words === undefined) return;
    if (Object.hasOwn(words, key) && words[key]!.includes(tok.value)) return;
    const read = Object.entries(words).map(([k, ws]) => `${k} (${ws.join(", ")})`);
    // The word in another case (`hinge: Left`): name the one the key reads.
    const folded = Object.hasOwn(words, key)
      ? words[key]!.find((w) => w.toLowerCase() === tok.value.toLowerCase())
      : undefined;
    this.report({
      severity: "warning",
      code: "W_SET_VALUE_WORD",
      message: Object.hasOwn(words, key)
        ? `\`set ${kind}(${key}: ${tok.value})\` takes \`${tok.value}\` as the text "${tok.value}", which \`${key}\` does not read, so the rule does nothing`
        : `\`set ${kind}(${key}: ${tok.value})\` takes \`${tok.value}\` as the text "${tok.value}", not as a value, and \`set ${kind}\` reads no word for \`${key}\`, so the rule does nothing`,
      span: { start: tok.start, end: tok.end },
      hints: [
        ...(folded !== undefined ? [`Write \`set ${kind}(${key}: ${folded})\`: words match exactly.`] : []),
        read.length > 0
          ? `\`set ${kind}(…)\` reads a bare word only for ${read.join(" and ")}.`
          : `\`set ${kind}(…)\` reads no bare word for any key.`,
        "A bare word is never read as the value of a name; write the value on each element instead.",
      ],
    });
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
    const name = this.declName(this.eatIdent());
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

  /**
   * `strip <dir> at (x,y) gap G (height|width) H { room … }` — a row/column of
   * rooms. `dir` is the fill axis; the cross keyword is `height` for a horizontal
   * strip, `width` for a vertical one. Children must be `room`s; each gives a
   * main-axis extent (and may override the shared cross with `size <main>x<cross>`).
   */
  private parseStrip(): StripNode {
    const kw = this.eatKeyword("strip");
    const dirTok = this.eatIdent();
    const dir = dirTok.value as StripDir;
    if (!(STRIP_DIRS as readonly string[]).includes(dir)) {
      this.fail(`Expected a strip direction (${STRIP_DIRS.join("|")}) but found "${dirTok.value}"`, dirTok, {
        near: STRIP_DIRS,
      });
    }
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("gap");
    const gap = parseExprPratt(this.ctx);
    const horiz = dir === "right" || dir === "left";
    const crossKw = horiz ? "height" : "width";
    let cross: StripNode["cross"];
    if (this.isKeyword(crossKw)) {
      this.next();
      cross = parseExprPratt(this.ctx);
    }
    this.eat("lcurly");
    const rooms: StripRoomChild[] = [];
    while (!this.isType("rcurly") && !this.isType("eof")) {
      // A nested strip is illegal — report it and consume it for recovery.
      if (this.isKeyword("strip")) {
        const nestStart = this.peek().start;
        this.parseStrip();
        this.report({
          severity: "error",
          message: `"strip" is only allowed at plan level, not inside another strip`,
          code: "E_STRIP_NEST",
          span: this.spanFrom(nestStart),
        });
        continue;
      }
      rooms.push(this.parseStripRoom());
    }
    this.eat("rcurly");
    return { kind: "strip", id: "", dir, at, gap, ...(cross ? { cross } : {}), rooms, line: kw.line };
  }

  /** One `room [id=] size <main>[x<cross>] [label "…"] [uses …] [floor …]` inside a strip; the
   *  clauses come in any order, each once (`src/clause-order.ts`). The child is built after, in
   *  the order the grammar used to require, so a room written in that order keeps its tree. */
  private parseStripRoom(): StripRoomChild {
    const kw = this.eatKeyword("room");
    const start = kw.start;
    const id = this.parseIdOpt();
    let main: StripRoomChild["main"] | undefined;
    let cross: StripRoomChild["cross"];
    const tail: Pick<StripRoomChild, "label" | "uses"> = {};
    const floor: Pick<StripRoomChild, "floor"> = {};
    // Inside a strip only a `room` (or a refused nested `strip`) may follow, so no clause word
    // here can begin the next item: every clause reads in any position.
    const inStrip = (c: TailClause): TailClause => ({ ...c, startsStatement: () => false });
    const clauses: TailClause[] = [
      {
        word: "size",
        rank: 0,
        required: true,
        read: (keep) => {
          this.next();
          // `<main>` (cross inherited from the strip) or `<main>x<cross>` / `<main> x <cross>`.
          let m: StripRoomChild["main"];
          let c: StripRoomChild["cross"];
          if (this.isType("dimension")) {
            const d = this.eat("dimension");
            m = { t: "num", value: d.num! };
            c = { t: "num", value: d.num2! };
          } else {
            m = parseExprPratt(this.ctx);
            if (this.isKeyword("x")) {
              this.next();
              c = parseExprPratt(this.ctx);
            }
          }
          if (!keep) return;
          main = m;
          cross = c;
        },
      },
      {
        word: "label",
        rank: 1,
        read: (keep) => {
          this.next();
          const v = this.parseStringExpr();
          if (keep) tail.label = v;
        },
      },
      {
        word: "uses",
        rank: 2,
        read: (keep) => {
          this.next();
          const uses: UseKind[] = [];
          while (this.peek().type === "ident" && USE_SET.has(this.peek().value)) {
            uses.push(this.next().value as UseKind);
          }
          if (uses.length === 0)
            this.fail(roomUsesExpected(this.peek().value || undefined, this.peek().type), undefined, {
              near: USE_KINDS,
            });
          if (keep) tail.uses = uses;
        },
      },
      floorClause(this.ctx, 3, floor),
    ];
    readClauses(this.ctx, "room", clauses.map(inStrip));
    // The one clause a strip room cannot leave out; a `size` still at the cursor begins a statement.
    if (main === undefined) missingClause(this.ctx, { what: "room", id, start }, "size", "size <main>[x<cross>]");
    const child: StripRoomChild = { id, main, ...(cross ? { cross } : {}), line: kw.line };
    if (tail.label !== undefined) child.label = tail.label;
    if (tail.uses !== undefined) child.uses = tail.uses;
    if (floor.floor !== undefined) child.floor = floor.floor;
    child.span = this.spanFrom(start);
    return child;
  }
}

/** Room use-kind keywords, for the strip-child `uses` clause. */
const USE_SET: ReadonlySet<string> = new Set<string>(USE_KINDS);

/** Every word of the language, built on the first misspelling a parse reports (AF2). */
let LANGUAGE_WORDS: Set<string> | undefined;

/**
 * Line `a`'s indentation relative to line `b`'s, compared as whitespace STRINGS (Python's
 * rule): `0` same, `-1` left of (a proper prefix), `1` right of (extends it), `undefined`
 * when neither is a prefix of the other — a tab against spaces has no column order.
 */
function compareIndent(a: string, b: string): -1 | 0 | 1 | undefined {
  if (a === b) return 0;
  if (b.startsWith(a)) return -1;
  if (a.startsWith(b)) return 1;
  return undefined;
}

function describe(t: Token): string {
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}

/** A `keep` grade word (`KEEP_GRADES`). */
function isKeepGrade(v: string): boolean {
  return (KEEP_GRADES as readonly string[]).includes(v);
}
