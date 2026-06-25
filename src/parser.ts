/** Recursive-descent parser: tokens -> PlanNode. Zero dependencies. */

import type { Token } from "./lexer.js";
import { lex } from "./lexer.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import type {
  DimNode,
  DoorNode,
  FurnitureNode,
  NorthDir,
  PlanNode,
  Point,
  RoomNode,
  TitleNode,
  WallNode,
  WindowNode,
} from "./ast.js";

export interface ParseOutcome {
  plan?: PlanNode;
  diagnostics: Diagnostic[];
}

/** Keywords that begin a plan-body statement; recovery resynchronizes to one. */
const STATEMENT_STARTS = new Set([
  "units", "grid", "scale", "north",
  "wall", "room", "door", "window", "furniture", "dim", "title",
]);

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
  constructor(private toks: Token[]) {}

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
      walls: [],
      rooms: [],
      doors: [],
      windows: [],
      furniture: [],
      dims: [],
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
          case "wall": {
            const n = this.parseWall();
            n.span = this.spanFrom(start);
            plan.walls.push(n);
            break;
          }
          case "room": {
            const n = this.parseRoom();
            n.span = this.spanFrom(start);
            plan.rooms.push(n);
            break;
          }
          case "door": {
            const n = this.parseDoor();
            n.span = this.spanFrom(start);
            plan.doors.push(n);
            break;
          }
          case "window": {
            const n = this.parseWindow();
            n.span = this.spanFrom(start);
            plan.windows.push(n);
            break;
          }
          case "furniture": {
            const n = this.parseFurniture();
            n.span = this.spanFrom(start);
            plan.furniture.push(n);
            break;
          }
          case "dim": {
            const n = this.parseDim();
            n.span = this.spanFrom(start);
            plan.dims.push(n);
            break;
          }
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

  private parsePoint(): Point {
    this.eat("lparen");
    const x = this.eatNumber();
    this.eat("comma");
    const y = this.eatNumber();
    this.eat("rparen");
    return { x, y };
  }

  private parseWall(): WallNode {
    const kw = this.eatKeyword("wall");
    const id = this.parseIdOpt();
    const kind = this.eatIdent().value;
    this.eatKeyword("thickness");
    const thickness = this.eatNumber();
    this.eat("lcurly");
    const points: Point[] = [];
    let closed = false;
    while (!this.isType("rcurly") && !this.isType("eof")) {
      if (this.isKeyword("close")) {
        this.next();
        closed = true;
        break;
      }
      if (this.isType("lparen")) {
        points.push(this.parsePoint());
        continue;
      }
      this.fail(`Expected a point "(x,y)" or "close" in wall body but found ${describe(this.peek())}`);
    }
    this.eat("rcurly");
    if (points.length < 2) this.fail("A wall needs at least two points", kw);
    return { id, kind, thickness, points, closed, line: kw.line };
  }

  private parseRoom(): RoomNode {
    const kw = this.eatKeyword("room");
    const id = this.parseIdOpt();
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("size");
    const dim = this.eat("dimension");
    const node: RoomNode = { id, at, size: { w: dim.num!, h: dim.num2! }, line: kw.line };
    if (this.isKeyword("label")) {
      this.next();
      node.label = this.eatString();
    }
    return node;
  }

  private parseDoor(): DoorNode {
    const kw = this.eatKeyword("door");
    const id = this.parseIdOpt();
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("width");
    const width = this.eatNumber();
    const node: DoorNode = { id, at, width, hinge: "left", swing: "in", line: kw.line };
    if (this.isKeyword("wall")) {
      this.next();
      node.wall = this.eatIdent().value;
    }
    if (this.isKeyword("hinge")) {
      this.next();
      const h = this.eatIdent().value;
      if (h !== "left" && h !== "right") this.fail(`Expected hinge "left" or "right" but found "${h}"`);
      node.hinge = h;
    }
    if (this.isKeyword("swing")) {
      this.next();
      const s = this.eatIdent().value;
      if (s !== "in" && s !== "out") this.fail(`Expected swing "in" or "out" but found "${s}"`);
      node.swing = s;
    }
    return node;
  }

  private parseWindow(): WindowNode {
    const kw = this.eatKeyword("window");
    const id = this.parseIdOpt();
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("width");
    const width = this.eatNumber();
    const node: WindowNode = { id, at, width, line: kw.line };
    if (this.isKeyword("wall")) {
      this.next();
      node.wall = this.eatIdent().value;
    }
    return node;
  }

  private parseFurniture(): FurnitureNode {
    const kw = this.eatKeyword("furniture");
    const id = this.parseIdOpt();
    const kind = this.eatIdent().value;
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("size");
    const dim = this.eat("dimension");
    const node: FurnitureNode = { id, kind, at, size: { w: dim.num!, h: dim.num2! }, line: kw.line };
    if (this.isKeyword("label")) {
      this.next();
      node.label = this.eatString();
    }
    return node;
  }

  private parseDim(): DimNode {
    const kw = this.eatKeyword("dim");
    const from = this.parsePoint();
    this.eat("arrow");
    const to = this.parsePoint();
    const node: DimNode = { id: "", from, to, offset: 300, line: kw.line };
    if (this.isKeyword("offset")) {
      this.next();
      node.offset = this.eatNumber();
    }
    if (this.isKeyword("text")) {
      this.next();
      node.text = this.eatString();
    }
    return node;
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
