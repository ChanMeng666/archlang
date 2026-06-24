// src/lexer.ts
var isDigit = (c) => c >= "0" && c <= "9";
var isIdentStart = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_";
var isIdentPart = (c) => isIdentStart(c) || isDigit(c);
function lex(src) {
  const tokens = [];
  const errors = [];
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
  const push = (type, value, startLine, startCol, extra) => tokens.push({ type, value, line: startLine, col: startCol, ...extra });
  while (i < src.length) {
    const c = peek();
    const startLine = line;
    const startCol = col;
    if (c === " " || c === "	" || c === "\r" || c === "\n") {
      advance();
      continue;
    }
    if (c === "#") {
      while (i < src.length && peek() !== "\n") advance();
      continue;
    }
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
        if (ch === "\n") break;
        value += advance();
      }
      if (!terminated) {
        errors.push({ message: "Unterminated string literal", line: startLine, col: startCol });
      }
      push("string", value, startLine, startCol);
      continue;
    }
    if (c === "(") {
      advance();
      push("lparen", "(", startLine, startCol);
      continue;
    }
    if (c === ")") {
      advance();
      push("rparen", ")", startLine, startCol);
      continue;
    }
    if (c === "{") {
      advance();
      push("lcurly", "{", startLine, startCol);
      continue;
    }
    if (c === "}") {
      advance();
      push("rcurly", "}", startLine, startCol);
      continue;
    }
    if (c === ",") {
      advance();
      push("comma", ",", startLine, startCol);
      continue;
    }
    if (c === "=") {
      advance();
      push("equals", "=", startLine, startCol);
      continue;
    }
    if (c === ":") {
      advance();
      push("colon", ":", startLine, startCol);
      continue;
    }
    if (c === "-" && peek(1) === ">") {
      advance();
      advance();
      push("arrow", "->", startLine, startCol);
      continue;
    }
    if (isDigit(c) || c === "-" && isDigit(peek(1)) || c === "." && isDigit(peek(1))) {
      let raw = "";
      if (c === "-") raw += advance();
      while (isDigit(peek())) raw += advance();
      if (peek() === ".") {
        raw += advance();
        while (isDigit(peek())) raw += advance();
      }
      const first = parseFloat(raw);
      if (peek() === "x" && (isDigit(peek(1)) || peek(1) === "-" && isDigit(peek(2)) || peek(1) === "." && isDigit(peek(2)))) {
        advance();
        let raw2 = "";
        if (peek() === "-") raw2 += advance();
        while (isDigit(peek())) raw2 += advance();
        if (peek() === ".") {
          raw2 += advance();
          while (isDigit(peek())) raw2 += advance();
        }
        const second = parseFloat(raw2);
        push("dimension", `${raw}x${raw2}`, startLine, startCol, { num: first, num2: second });
        continue;
      }
      push("number", raw, startLine, startCol, { num: first });
      continue;
    }
    if (isIdentStart(c)) {
      let value = "";
      while (i < src.length && isIdentPart(peek())) value += advance();
      push("ident", value, startLine, startCol);
      continue;
    }
    errors.push({ message: `Unexpected character ${JSON.stringify(c)}`, line: startLine, col: startCol });
    advance();
  }
  push("eof", "", line, col);
  return { tokens, errors };
}

// src/parser.ts
var ParseError = class extends Error {
  constructor(message, line, col) {
    super(message);
    this.message = message;
    this.line = line;
    this.col = col;
  }
  message;
  line;
  col;
};
function parse(src) {
  const { tokens, errors: lexErrors } = lex(src);
  if (lexErrors.length > 0) {
    return { errors: [lexErrors[0]] };
  }
  try {
    const p = new Parser(tokens);
    const plan = p.parsePlan();
    return { plan, errors: [] };
  } catch (e) {
    if (e instanceof ParseError) {
      return { errors: [{ message: e.message, line: e.line, col: e.col }] };
    }
    throw e;
  }
}
var Parser = class {
  constructor(toks) {
    this.toks = toks;
  }
  toks;
  pos = 0;
  peek(o = 0) {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)];
  }
  next() {
    return this.toks[Math.min(this.pos++, this.toks.length - 1)];
  }
  fail(msg, t = this.peek()) {
    throw new ParseError(msg, t.line, t.col);
  }
  isKeyword(kw, o = 0) {
    const t = this.peek(o);
    return t.type === "ident" && t.value === kw;
  }
  eatKeyword(kw) {
    const t = this.peek();
    if (t.type !== "ident" || t.value !== kw) this.fail(`Expected "${kw}" but found ${describe(t)}`);
    return this.next();
  }
  eat(type) {
    const t = this.peek();
    if (t.type !== type) this.fail(`Expected ${type} but found ${describe(t)}`);
    return this.next();
  }
  eatIdent() {
    return this.eat("ident");
  }
  eatNumber() {
    const t = this.eat("number");
    return t.num;
  }
  eatString() {
    return this.eat("string").value;
  }
  parsePlan() {
    this.eatKeyword("plan");
    const name = this.eatString();
    this.eat("lcurly");
    const plan = {
      name,
      units: "mm",
      grid: 0,
      north: "up",
      walls: [],
      rooms: [],
      doors: [],
      windows: [],
      furniture: [],
      dims: []
    };
    while (!this.isType("rcurly") && !this.isType("eof")) {
      const t = this.peek();
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
        case "wall":
          plan.walls.push(this.parseWall());
          break;
        case "room":
          plan.rooms.push(this.parseRoom());
          break;
        case "door":
          plan.doors.push(this.parseDoor());
          break;
        case "window":
          plan.windows.push(this.parseWindow());
          break;
        case "furniture":
          plan.furniture.push(this.parseFurniture());
          break;
        case "dim":
          plan.dims.push(this.parseDim());
          break;
        case "title":
          plan.title = this.parseTitle();
          break;
        default:
          this.fail(`Unknown statement "${t.value}"`, t);
      }
    }
    this.eat("rcurly");
    return plan;
  }
  isType(type) {
    return this.peek().type === type;
  }
  /** Optional `id=<ident>` prefix; returns "" when absent. */
  parseIdOpt() {
    if (this.isKeyword("id")) {
      this.next();
      this.eat("equals");
      return this.eatIdent().value;
    }
    return "";
  }
  parseNorth() {
    const t = this.peek();
    if (t.type === "number") {
      this.next();
      return { deg: t.num };
    }
    if (t.type === "ident" && ["up", "down", "left", "right"].includes(t.value)) {
      this.next();
      return t.value;
    }
    this.fail(`Expected a north direction (up|down|left|right|<degrees>) but found ${describe(t)}`);
  }
  parsePoint() {
    this.eat("lparen");
    const x = this.eatNumber();
    this.eat("comma");
    const y = this.eatNumber();
    this.eat("rparen");
    return { x, y };
  }
  parseWall() {
    const kw = this.eatKeyword("wall");
    const id = this.parseIdOpt();
    const kind = this.eatIdent().value;
    this.eatKeyword("thickness");
    const thickness = this.eatNumber();
    this.eat("lcurly");
    const points = [];
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
  parseRoom() {
    const kw = this.eatKeyword("room");
    const id = this.parseIdOpt();
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("size");
    const dim = this.eat("dimension");
    const node = { id, at, size: { w: dim.num, h: dim.num2 }, line: kw.line };
    if (this.isKeyword("label")) {
      this.next();
      node.label = this.eatString();
    }
    return node;
  }
  parseDoor() {
    const kw = this.eatKeyword("door");
    const id = this.parseIdOpt();
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("width");
    const width = this.eatNumber();
    const node = { id, at, width, hinge: "left", swing: "in", line: kw.line };
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
  parseWindow() {
    const kw = this.eatKeyword("window");
    const id = this.parseIdOpt();
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("width");
    const width = this.eatNumber();
    const node = { id, at, width, line: kw.line };
    if (this.isKeyword("wall")) {
      this.next();
      node.wall = this.eatIdent().value;
    }
    return node;
  }
  parseFurniture() {
    const kw = this.eatKeyword("furniture");
    const id = this.parseIdOpt();
    const kind = this.eatIdent().value;
    this.eatKeyword("at");
    const at = this.parsePoint();
    this.eatKeyword("size");
    const dim = this.eat("dimension");
    const node = { id, kind, at, size: { w: dim.num, h: dim.num2 }, line: kw.line };
    if (this.isKeyword("label")) {
      this.next();
      node.label = this.eatString();
    }
    return node;
  }
  parseDim() {
    const kw = this.eatKeyword("dim");
    const from = this.parsePoint();
    this.eat("arrow");
    const to = this.parsePoint();
    const node = { id: "", from, to, offset: 300, line: kw.line };
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
  parseTitle() {
    const kw = this.eatKeyword("title");
    this.eat("lcurly");
    const node = { line: kw.line };
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
};
function describe(t) {
  if (t.type === "eof") return "end of input";
  if (t.type === "string") return `string ${JSON.stringify(t.value)}`;
  return `"${t.value}"`;
}

// src/geometry.ts
var sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
var add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
var mul = (v, s) => ({ x: v.x * s, y: v.y * s });
var length = (v) => Math.hypot(v.x, v.y);
function unit(v) {
  const l = length(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}
var normal = (v) => ({ x: -v.y, y: v.x });
var emptyBounds = () => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity
});
function extendBounds(b, x, y) {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
}
function distPointToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}
function rectCorners(x, y, w, h) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ];
}
function segmentRectangle(a, b, thickness) {
  const d = unit(sub(b, a));
  const n = normal(d);
  const half = thickness / 2;
  const a2 = add(a, mul(d, -half));
  const b2 = add(b, mul(d, half));
  return [
    add(a2, mul(n, half)),
    add(b2, mul(n, half)),
    add(b2, mul(n, -half)),
    add(a2, mul(n, -half))
  ];
}
function wallSegments(plan) {
  const segs = [];
  for (const w of plan.walls) {
    for (let k = 0; k < w.points.length - 1; k++) {
      segs.push({ a: w.points[k], b: w.points[k + 1], thickness: w.thickness, kind: w.kind });
    }
    if (w.closed && w.points.length > 2) {
      segs.push({ a: w.points[w.points.length - 1], b: w.points[0], thickness: w.thickness, kind: w.kind });
    }
  }
  return segs;
}
function hostSegment(plan, at, wallRef) {
  const walls = wallRef ? plan.walls.filter((w) => w.id === wallRef || w.kind === wallRef) : plan.walls;
  let best = null;
  let bestDist = Infinity;
  for (const w of walls) {
    const segs = [];
    for (let k = 0; k < w.points.length - 1; k++) segs.push([w.points[k], w.points[k + 1]]);
    if (w.closed && w.points.length > 2) segs.push([w.points[w.points.length - 1], w.points[0]]);
    for (const [a, b] of segs) {
      const dist = distPointToSegment(at, a, b);
      if (dist < bestDist) {
        bestDist = dist;
        best = { a, b, thickness: w.thickness, kind: w.kind };
      }
    }
  }
  return best;
}
function planBounds(plan) {
  const b = emptyBounds();
  for (const seg of wallSegments(plan)) {
    for (const c of segmentRectangle(seg.a, seg.b, seg.thickness)) extendBounds(b, c.x, c.y);
  }
  for (const r of plan.rooms) {
    extendBounds(b, r.at.x, r.at.y);
    extendBounds(b, r.at.x + r.size.w, r.at.y + r.size.h);
  }
  for (const f of plan.furniture) {
    extendBounds(b, f.at.x, f.at.y);
    extendBounds(b, f.at.x + f.size.w, f.at.y + f.size.h);
  }
  for (const d of plan.dims) {
    extendBounds(b, d.from.x, d.from.y);
    extendBounds(b, d.to.x, d.to.y);
  }
  if (!isFinite(b.minX)) {
    return { minX: 0, minY: 0, maxX: 1e3, maxY: 1e3 };
  }
  return b;
}

// src/validate.ts
function validate(plan) {
  const errors = [];
  const warnings = [];
  const g = plan.grid;
  const snap = (v) => g > 0 ? Math.round(v / g) * g : v;
  const snapPt = (p) => ({ x: snap(p.x), y: snap(p.y) });
  for (const w of plan.walls) {
    w.points = w.points.map(snapPt);
    w.thickness = snap(w.thickness) || w.thickness;
  }
  for (const r of plan.rooms) {
    r.at = snapPt(r.at);
    r.size = { w: snap(r.size.w), h: snap(r.size.h) };
  }
  for (const f of plan.furniture) {
    f.at = snapPt(f.at);
    f.size = { w: snap(f.size.w), h: snap(f.size.h) };
  }
  for (const d of plan.doors) {
    d.at = snapPt(d.at);
    d.width = snap(d.width) || d.width;
  }
  for (const win of plan.windows) {
    win.at = snapPt(win.at);
    win.width = snap(win.width) || win.width;
  }
  for (const dm of plan.dims) {
    dm.from = snapPt(dm.from);
    dm.to = snapPt(dm.to);
  }
  const seen = /* @__PURE__ */ new Set();
  const assign = (provided, prefix, idx, line) => {
    if (provided) {
      if (seen.has(provided)) {
        errors.push({ message: `Duplicate id "${provided}"`, line });
      }
      seen.add(provided);
      return provided;
    }
    let auto = `${prefix}_${idx}`;
    while (seen.has(auto)) auto = `${auto}_`;
    seen.add(auto);
    return auto;
  };
  plan.walls.forEach((w, i) => w.id = assign(w.id, w.kind || "wall", i + 1, w.line));
  plan.rooms.forEach((r, i) => r.id = assign(r.id, "room", i + 1, r.line));
  plan.doors.forEach((d, i) => d.id = assign(d.id, "door", i + 1, d.line));
  plan.windows.forEach((w, i) => w.id = assign(w.id, "window", i + 1, w.line));
  plan.furniture.forEach((f, i) => f.id = assign(f.id, f.kind || "furniture", i + 1, f.line));
  plan.dims.forEach((d, i) => d.id = assign(d.id, "dim", i + 1, d.line));
  for (const r of plan.rooms) {
    if (r.size.w <= 0 || r.size.h <= 0)
      errors.push({ message: `Room "${r.id}" must have a positive size`, line: r.line });
  }
  for (const f of plan.furniture) {
    if (f.size.w <= 0 || f.size.h <= 0)
      errors.push({ message: `Furniture "${f.id}" must have a positive size`, line: f.line });
  }
  for (const d of plan.doors) {
    if (d.width <= 0) errors.push({ message: `Door "${d.id}" must have a positive width`, line: d.line });
  }
  for (const w of plan.windows) {
    if (w.width <= 0) errors.push({ message: `Window "${w.id}" must have a positive width`, line: w.line });
  }
  for (const w of plan.walls) {
    if (w.thickness <= 0)
      errors.push({ message: `Wall "${w.id}" must have a positive thickness`, line: w.line });
  }
  if (plan.walls.length === 0 && plan.rooms.length === 0 && plan.furniture.length === 0) {
    warnings.push({ message: "Plan has no walls, rooms, or furniture \u2014 nothing to draw" });
  }
  const onSomeWall = (at, wallRef) => {
    const candidates = wallRef ? plan.walls.filter((w) => w.id === wallRef || w.kind === wallRef) : plan.walls;
    for (const w of candidates) {
      const tol = w.thickness / 2 + Math.max(w.thickness, 1);
      for (let k = 0; k < w.points.length - 1; k++) {
        if (distPointToSegment(at, w.points[k], w.points[k + 1]) <= tol) return true;
      }
      if (w.closed && w.points.length > 2) {
        if (distPointToSegment(at, w.points[w.points.length - 1], w.points[0]) <= tol) return true;
      }
    }
    return false;
  };
  for (const d of plan.doors) {
    if (plan.walls.length > 0 && !onSomeWall(d.at, d.wall))
      warnings.push({ message: `Door "${d.id}" does not lie on any wall`, line: d.line });
  }
  for (const w of plan.windows) {
    if (plan.walls.length > 0 && !onSomeWall(w.at, w.wall))
      warnings.push({ message: `Window "${w.id}" does not lie on any wall`, line: w.line });
  }
  for (let a = 0; a < plan.rooms.length; a++) {
    for (let b = a + 1; b < plan.rooms.length; b++) {
      const r1 = plan.rooms[a];
      const r2 = plan.rooms[b];
      const ox = Math.max(0, Math.min(r1.at.x + r1.size.w, r2.at.x + r2.size.w) - Math.max(r1.at.x, r2.at.x));
      const oy = Math.max(0, Math.min(r1.at.y + r1.size.h, r2.at.y + r2.size.h) - Math.max(r1.at.y, r2.at.y));
      if (ox > 1 && oy > 1) {
        warnings.push({ message: `Rooms "${r1.id}" and "${r2.id}" overlap`, line: r2.line });
      }
    }
  }
  return { errors, warnings };
}

// src/render.ts
var THEME = {
  bg: "#ffffff",
  pocheBase: "#e9e4db",
  pocheHatch: "#b9b1a4",
  wallStroke: "#1b1b1b",
  roomFill: "#fbfaf7",
  roomLabel: "#222222",
  areaLabel: "#7a7a7a",
  furnitureStroke: "#a8a29a",
  furnitureFill: "#f4f2ee",
  furnitureLabel: "#9a948c",
  opening: "#ffffff",
  doorLeaf: "#555555",
  windowPane: "#3a6ea5",
  dim: "#0E5484",
  annotation: "#333333",
  annotationMuted: "#888888"
};
function fmt(v) {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}
var pt = (p) => `${fmt(p.x)},${fmt(p.y)}`;
function xml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var NICE_LENGTHS = [500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5];
function niceBarLength(target) {
  let best = NICE_LENGTHS[0];
  for (const v of NICE_LENGTHS) if (v <= target) best = v;
  return best;
}
function render(plan, opts = {}) {
  const b = planBounds(plan);
  const drawW = b.maxX - b.minX;
  const drawH = b.maxY - b.minY;
  const refDim = Math.max(drawW, drawH, 1);
  const wallStroke = refDim * 28e-4;
  const thin = refDim * 16e-4;
  const roomFont = refDim * 0.03;
  const areaFont = refDim * 0.022;
  const dimFont = refDim * 0.02;
  const furnFont = refDim * 0.017;
  const margin = refDim * 0.17;
  const hatchGap = refDim * 0.013;
  const vbX = b.minX - margin;
  const vbY = b.minY - margin;
  const vbW = drawW + margin * 2;
  const vbH = drawH + margin * 2;
  const out = [];
  const svgAttrs = opts.width ? `width="${fmt(opts.width)}" height="${fmt(opts.width * vbH / vbW)}"` : "";
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" ${svgAttrs} viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}" font-family="Helvetica, Arial, sans-serif">`
  );
  out.push(
    `<defs><pattern id="poche" patternUnits="userSpaceOnUse" width="${fmt(hatchGap)}" height="${fmt(hatchGap)}" patternTransform="rotate(45)"><rect width="${fmt(hatchGap)}" height="${fmt(hatchGap)}" fill="${THEME.pocheBase}"/><line x1="0" y1="0" x2="0" y2="${fmt(hatchGap)}" stroke="${THEME.pocheHatch}" stroke-width="${fmt(thin * 0.7)}"/></pattern></defs>`
  );
  out.push(`<rect x="${fmt(vbX)}" y="${fmt(vbY)}" width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${THEME.bg}"/>`);
  for (const r of plan.rooms) {
    const c = rectCorners(r.at.x, r.at.y, r.size.w, r.size.h);
    out.push(`<polygon points="${c.map(pt).join(" ")}" fill="${THEME.roomFill}"/>`);
  }
  for (const f of plan.furniture) {
    const c = rectCorners(f.at.x, f.at.y, f.size.w, f.size.h);
    out.push(
      `<polygon points="${c.map(pt).join(" ")}" fill="${THEME.furnitureFill}" stroke="${THEME.furnitureStroke}" stroke-width="${fmt(thin)}"/>`
    );
    if (f.label) {
      const cx = f.at.x + f.size.w / 2;
      const cy = f.at.y + f.size.h / 2;
      out.push(
        `<text x="${fmt(cx)}" y="${fmt(cy)}" font-size="${fmt(furnFont)}" fill="${THEME.furnitureLabel}" text-anchor="middle" dominant-baseline="central">${xml(f.label)}</text>`
      );
    }
  }
  const segs = wallSegments(plan);
  for (const s of segs) {
    const poly = segmentRectangle(s.a, s.b, s.thickness);
    out.push(`<polygon points="${poly.map(pt).join(" ")}" fill="url(#poche)"/>`);
  }
  for (const s of segs) {
    const d = unit(sub(s.b, s.a));
    const n = normal(d);
    const h = s.thickness / 2;
    const fa1 = add(s.a, mul(n, h));
    const fb1 = add(s.b, mul(n, h));
    const fa2 = add(s.a, mul(n, -h));
    const fb2 = add(s.b, mul(n, -h));
    out.push(
      `<line x1="${fmt(fa1.x)}" y1="${fmt(fa1.y)}" x2="${fmt(fb1.x)}" y2="${fmt(fb1.y)}" stroke="${THEME.wallStroke}" stroke-width="${fmt(wallStroke)}" stroke-linecap="square"/>`
    );
    out.push(
      `<line x1="${fmt(fa2.x)}" y1="${fmt(fa2.y)}" x2="${fmt(fb2.x)}" y2="${fmt(fb2.y)}" stroke="${THEME.wallStroke}" stroke-width="${fmt(wallStroke)}" stroke-linecap="square"/>`
    );
  }
  for (const dr of plan.doors) {
    const seg = hostSegment(plan, dr.at, dr.wall);
    if (!seg) continue;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2 + wallStroke;
    const hw = dr.width / 2;
    const cover = [
      add(add(dr.at, mul(d, -hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, h)),
      add(add(dr.at, mul(d, hw)), mul(n, -h)),
      add(add(dr.at, mul(d, -hw)), mul(n, -h))
    ];
    out.push(`<polygon points="${cover.map(pt).join(" ")}" fill="${THEME.opening}"/>`);
    const hinge = dr.hinge === "left" ? add(dr.at, mul(d, -hw)) : add(dr.at, mul(d, hw));
    const farJamb = dr.hinge === "left" ? add(dr.at, mul(d, hw)) : add(dr.at, mul(d, -hw));
    const leafDir = dr.swing === "in" ? n : mul(n, -1);
    const leafEnd = add(hinge, mul(leafDir, dr.width));
    const cross = (leafEnd.x - hinge.x) * (farJamb.y - hinge.y) - (leafEnd.y - hinge.y) * (farJamb.x - hinge.x);
    const sweep = cross < 0 ? 1 : 0;
    out.push(
      `<line x1="${fmt(hinge.x)}" y1="${fmt(hinge.y)}" x2="${fmt(leafEnd.x)}" y2="${fmt(leafEnd.y)}" stroke="${THEME.doorLeaf}" stroke-width="${fmt(thin * 1.3)}"/>`
    );
    out.push(
      `<path d="M ${pt(leafEnd)} A ${fmt(dr.width)} ${fmt(dr.width)} 0 0 ${sweep} ${pt(farJamb)}" fill="none" stroke="${THEME.doorLeaf}" stroke-width="${fmt(thin)}" stroke-dasharray="${fmt(thin * 4)} ${fmt(thin * 3)}"/>`
    );
  }
  for (const wn of plan.windows) {
    const seg = hostSegment(plan, wn.at, wn.wall);
    if (!seg) continue;
    const d = unit(sub(seg.b, seg.a));
    const n = normal(d);
    const h = seg.thickness / 2;
    const he = h + wallStroke;
    const hw = wn.width / 2;
    const cover = [
      add(add(wn.at, mul(d, -hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, he)),
      add(add(wn.at, mul(d, hw)), mul(n, -he)),
      add(add(wn.at, mul(d, -hw)), mul(n, -he))
    ];
    out.push(`<polygon points="${cover.map(pt).join(" ")}" fill="${THEME.opening}"/>`);
    const jA = add(wn.at, mul(d, -hw));
    const jB = add(wn.at, mul(d, hw));
    for (const off of [h, -h]) {
      const a = add(jA, mul(n, off));
      const bb = add(jB, mul(n, off));
      out.push(
        `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(bb.x)}" y2="${fmt(bb.y)}" stroke="${THEME.wallStroke}" stroke-width="${fmt(thin)}"/>`
      );
    }
    out.push(
      `<line x1="${fmt(jA.x)}" y1="${fmt(jA.y)}" x2="${fmt(jB.x)}" y2="${fmt(jB.y)}" stroke="${THEME.windowPane}" stroke-width="${fmt(thin)}"/>`
    );
  }
  for (const r of plan.rooms) {
    const cx = r.at.x + r.size.w / 2;
    const cy = r.at.y + r.size.h / 2;
    const areaM2 = (r.size.w / 1e3 * (r.size.h / 1e3)).toFixed(1);
    if (r.label) {
      out.push(
        `<text x="${fmt(cx)}" y="${fmt(cy - roomFont * 0.2)}" font-size="${fmt(roomFont)}" fill="${THEME.roomLabel}" text-anchor="middle" dominant-baseline="central" font-weight="600">${xml(r.label)}</text>`
      );
    }
    out.push(
      `<text x="${fmt(cx)}" y="${fmt(cy + (r.label ? roomFont * 0.9 : 0))}" font-size="${fmt(areaFont)}" fill="${THEME.areaLabel}" text-anchor="middle" dominant-baseline="central">${areaM2} m\xB2</text>`
    );
  }
  for (const dm of plan.dims) {
    const dir = unit(sub(dm.to, dm.from));
    const n = normal(dir);
    const off = mul(n, dm.offset);
    const p1 = add(dm.from, off);
    const p2 = add(dm.to, off);
    const tick = refDim * 0.012;
    out.push(
      `<line x1="${fmt(dm.from.x)}" y1="${fmt(dm.from.y)}" x2="${fmt(p1.x)}" y2="${fmt(p1.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin * 0.7)}"/>`
    );
    out.push(
      `<line x1="${fmt(dm.to.x)}" y1="${fmt(dm.to.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin * 0.7)}"/>`
    );
    out.push(
      `<line x1="${fmt(p1.x)}" y1="${fmt(p1.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin)}"/>`
    );
    for (const p of [p1, p2]) {
      const t1 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), tick));
      const t2 = add(p, mul(unit({ x: dir.x + n.x, y: dir.y + n.y }), -tick));
      out.push(
        `<line x1="${fmt(t1.x)}" y1="${fmt(t1.y)}" x2="${fmt(t2.x)}" y2="${fmt(t2.y)}" stroke="${THEME.dim}" stroke-width="${fmt(thin)}"/>`
      );
    }
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const tp = add(mid, mul(n, dimFont * 0.7));
    let angle = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const label = dm.text ?? String(Math.round(length(sub(dm.to, dm.from))));
    out.push(
      `<text x="${fmt(tp.x)}" y="${fmt(tp.y)}" font-size="${fmt(dimFont)}" fill="${THEME.dim}" text-anchor="middle" dominant-baseline="central" transform="rotate(${fmt(angle)} ${fmt(tp.x)} ${fmt(tp.y)})">${xml(label)}</text>`
    );
  }
  out.push(northArrow(plan, b, margin, refDim));
  out.push(scaleBar(b, margin, refDim, thin));
  const tb = titleBlock(plan, b, margin, refDim, thin);
  if (tb) out.push(tb);
  out.push("</svg>");
  return out.join("\n");
}
function northArrow(plan, b, margin, refDim) {
  const r = refDim * 0.045;
  const cx = b.maxX - r;
  const cy = b.minY - margin * 0.55;
  let deg;
  switch (plan.north) {
    case "up":
      deg = 0;
      break;
    case "down":
      deg = 180;
      break;
    case "left":
      deg = 270;
      break;
    case "right":
      deg = 90;
      break;
    default:
      deg = typeof plan.north === "object" ? plan.north.deg : 0;
  }
  const fs = refDim * 0.026;
  const tri = `${fmt(cx)},${fmt(cy - r)} ${fmt(cx - r * 0.5)},${fmt(cy + r * 0.6)} ${fmt(cx)},${fmt(cy + r * 0.25)} ${fmt(cx + r * 0.5)},${fmt(cy + r * 0.6)}`;
  const rad = deg * Math.PI / 180;
  const nx = Math.sin(rad);
  const ny = -Math.cos(rad);
  const lx = cx + nx * (r + fs * 0.8);
  const ly = cy + ny * (r + fs * 0.8);
  return `<g><polygon points="${tri}" fill="${THEME.annotation}" transform="rotate(${fmt(deg)} ${fmt(cx)} ${fmt(cy)})"/><text x="${fmt(lx)}" y="${fmt(ly)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="middle" dominant-baseline="central">N</text></g>`;
}
function scaleBar(b, margin, refDim, thin) {
  const barLen = niceBarLength(refDim * 0.3);
  const x0 = b.minX;
  const y0 = b.maxY + margin * 0.55;
  const hgt = refDim * 0.014;
  const fs = refDim * 0.02;
  const parts = [];
  const half = barLen / 2;
  parts.push(`<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(half)}" height="${fmt(hgt)}" fill="${THEME.annotation}"/>`);
  parts.push(
    `<rect x="${fmt(x0 + half)}" y="${fmt(y0)}" width="${fmt(half)}" height="${fmt(hgt)}" fill="none" stroke="${THEME.annotation}" stroke-width="${fmt(thin)}"/>`
  );
  parts.push(
    `<text x="${fmt(x0)}" y="${fmt(y0 + hgt + fs)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="start" dominant-baseline="central">0</text>`
  );
  parts.push(
    `<text x="${fmt(x0 + barLen)}" y="${fmt(y0 + hgt + fs)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="middle" dominant-baseline="central">${barLen / 1e3} m</text>`
  );
  return `<g>${parts.join("")}</g>`;
}
function titleBlock(plan, b, margin, refDim, thin) {
  const t = plan.title;
  if (!t && !plan.scale) return null;
  const boxW = refDim * 0.34;
  const boxH = margin * 0.82;
  const x0 = b.maxX - boxW;
  const y0 = b.maxY + margin * 0.15;
  const fs = refDim * 0.019;
  const pad = boxW * 0.05;
  const lines = [];
  if (t?.project) lines.push({ k: "PROJECT", v: t.project });
  if (t?.drawnBy) lines.push({ k: "DRAWN BY", v: t.drawnBy });
  if (t?.date) lines.push({ k: "DATE", v: t.date });
  if (plan.scale) lines.push({ k: "SCALE", v: plan.scale });
  const parts = [];
  parts.push(
    `<rect x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(boxW)}" height="${fmt(boxH)}" fill="none" stroke="${THEME.annotation}" stroke-width="${fmt(thin)}"/>`
  );
  const rowH = boxH / Math.max(lines.length, 1);
  lines.forEach((ln, i) => {
    const ly = y0 + rowH * (i + 0.5);
    parts.push(
      `<text x="${fmt(x0 + pad)}" y="${fmt(ly)}" font-size="${fmt(fs * 0.8)}" fill="${THEME.annotationMuted}" dominant-baseline="central">${xml(ln.k)}</text>`
    );
    parts.push(
      `<text x="${fmt(x0 + boxW - pad)}" y="${fmt(ly)}" font-size="${fmt(fs)}" fill="${THEME.annotation}" text-anchor="end" dominant-baseline="central">${xml(ln.v)}</text>`
    );
    if (i > 0)
      parts.push(
        `<line x1="${fmt(x0)}" y1="${fmt(y0 + rowH * i)}" x2="${fmt(x0 + boxW)}" y2="${fmt(y0 + rowH * i)}" stroke="${THEME.annotation}" stroke-width="${fmt(thin * 0.5)}"/>`
      );
  });
  return `<g>${parts.join("")}</g>`;
}

// src/index.ts
var cache = /* @__PURE__ */ new Map();
var CACHE_MAX = 64;
function compile(source, opts = {}) {
  const key = JSON.stringify([source, opts.width ?? null]);
  if (!opts.noCache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const result = compileUncached(source, opts);
  if (!opts.noCache) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== void 0) cache.delete(oldest);
    }
    cache.set(key, result);
  }
  return result;
}
function compileUncached(source, opts) {
  const { plan, errors: parseErrors } = parse(source);
  if (!plan || parseErrors.length > 0) {
    return { svg: "", errors: parseErrors, warnings: [] };
  }
  const { errors, warnings } = validate(plan);
  if (errors.length > 0) {
    return { svg: "", errors, warnings, ast: plan };
  }
  const svg = render(plan, opts);
  return { svg, errors: [], warnings, ast: plan };
}
function clearCache() {
  cache.clear();
}
export {
  clearCache,
  compile
};
