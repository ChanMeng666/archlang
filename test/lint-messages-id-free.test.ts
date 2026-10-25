import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, ERROR_CATALOG, lint, taste } from "../src/index.js";
import { resolvePlan } from "../src/analyze.js";
import type { ResolvedPlan } from "../src/ir.js";
import { makeNaming, type NameableRoom, nameableOf } from "../src/naming.js";
import { DOOR_HINGE_NEAR, DOOR_KINDS, DOOR_SWING_BUILDING, KEYWORDS } from "../src/grammar/tokens.js";
import { EXAMPLE_FILES, EXAMPLES_WORLD, SHIPPED_EXAMPLES } from "./d4-oracle.js";

/**
 * PS2.22 + PS2.29 — a message never quotes an internal id (iron law, `docs/agents/iron-laws.md`).
 *
 * A consumer may show `message` to someone who never sees the source, while an agent edits by the
 * id in the `hint`. The forbidden set is built from each plan's OWN ids, never retyped: every
 * element id (rooms, doors, windows, openings, furniture, walls, outdoor surfaces), which for an
 * unlabelled room is the only name it has, and the derived names a `walls from rooms` plan gives
 * its walls (`A|B`, `A|B:open`, `exterior`, `exterior#n`), all of which are ids too.
 *
 * An id that is also a plain word (`hall`, `exterior`, `1`) would flag the prose "the hall"; for
 * those only a QUOTED occurrence (`"hall"`) counts, and not when the quoted string is a label the
 * plan itself gives some room or piece. An id with an underscore, dot, digit, `|`, `:` or `#`
 * counts wherever it stands as a whole token.
 */

/** Every `.arch` under a folder, sorted, with its forward-slash name. */
function archUnder(dir: string): { name: string; src: string }[] {
  const out: { name: string; src: string }[] = [];
  const walk = (d: string, rel: string): void => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      const r = `${rel}/${f}`;
      if (statSync(p).isDirectory()) walk(p, r);
      else if (f.endsWith(".arch")) out.push({ name: r, src: readFileSync(p, "utf8") });
    }
  };
  walk(resolvePath(dir), dir);
  return out;
}

const CORPUS = [
  ...SHIPPED_EXAMPLES.map((rel) => ({ name: `examples/${rel}`, src: EXAMPLE_FILES[rel]! })),
  ...archUnder("eval/goldens"),
  ...archUnder("docs/plans/plan-soundness/audits/first-contact-plans"),
  ...archUnder("test/defect-corpus"),
  ...archUnder("test/taste-corpus"),
  ...archUnder("test/fixtures"),
];

const ID_SHAPED = /[^A-Za-z]/;

interface Forbidden {
  /** Ids that count wherever they stand as a whole token. */
  shaped: string[];
  /** Plain-word ids: only a quoted occurrence counts. */
  plain: string[];
  /** Strings the plan itself uses as names (labels), which may be quoted legitimately. */
  names: Set<string>;
  /** Every id, shaped or plain. */
  ids: string[];
}

function forbiddenOf(src: string): Forbidden {
  const { ir, levels } = resolvePlan(src, { world: EXAMPLES_WORLD });
  const shaped = new Set<string>();
  const plain = new Set<string>();
  const names = new Set<string>();
  const irs: ResolvedPlan[] = [...(ir ? [ir] : []), ...levels.map((l) => l.ir)];
  for (const p of irs) {
    const ids = [...p.elements.map((e) => e.id), ...p.walls.map((w) => w.id)];
    for (const e of p.elements) {
      const l = (e as { label?: string }).label;
      if (l !== undefined) names.add(l);
      const c = (e as { category?: string }).category;
      if (c !== undefined) names.add(c);
    }
    for (const id of ids) (ID_SHAPED.test(id) ? shaped : plain).add(id);
  }
  return { shaped: [...shaped], plain: [...plain], names, ids: [...shaped, ...plain] };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The ids of `f` that `message` quotes. */
function quotedIds(message: string, f: Forbidden): string[] {
  const hits: string[] = [];
  for (const id of f.shaped)
    if (new RegExp(`(?<![A-Za-z0-9_|:#])${esc(id)}(?![A-Za-z0-9_|:#])`).test(message)) hits.push(id);
  for (const id of f.plain) if (!f.names.has(id) && message.includes(`"${id}"`)) hits.push(id);
  return hits;
}

function walkMessages(node: unknown, out: string[]): void {
  if (Array.isArray(node)) for (const n of node) walkMessages(n, out);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      if (k === "message" && typeof v === "string") out.push(v);
      else walkMessages(v, out);
    }
}

interface Case {
  name: string;
  src: string;
  profile?: string;
}

/** The smallest legal plan a catalogue fragment can be dropped into (as `error-catalog-examples`). */
const wrap = (body: string): string => `plan "E" {\n  units mm\n${body}\n}\n`;

/** Every `W_*` catalogue example, wrapped, under the profile its comment names: each is the
 *  smallest plan that raises its code, so the rules the corpus never fires are fired here. */
const CATALOGUE: Case[] = Object.entries(ERROR_CATALOG)
  .filter(([code]) => code.startsWith("W_"))
  .map(([code, e]) => ({
    name: `catalogue ${code}`,
    src: /^\s*plan\b/.test(e.example) ? e.example : wrap(e.example),
    ...(/# lint --profile ([a-z-]+)/.exec(e.example)?.[1]
      ? { profile: /# lint --profile ([a-z-]+)/.exec(e.example)![1]! }
      : {}),
  }));

/** Plans for the rules neither the corpus nor the catalogue fires on their own. */
const INLINE: Case[] = [
  {
    name: "inline: a dimension drawn inside the building",
    src: `plan "Dim" {
  units mm
  wall id=w_shell exterior thickness 200 { (0,0) (5000,0) (5000,4000) (0,4000) close }
  room id=r_main at (0,0) size 5000x4000 label "Main"
  door id=d_front on w_shell at 2500 width 900
  dim (5000,4000)->(0,4000) offset 500 text "5000"
}
`,
  },
  {
    name: "inline: a piece declared in the wrong room",
    src: `plan "Wrong" {
  units mm
  wall id=w_shell exterior thickness 200 { (0,0) (6000,0) (6000,3000) (0,3000) close }
  room id=r_bed at (0,0) size 3000x3000 label "Bed" uses bedroom
  room id=r_bath at (3000,0) size 3000x3000 label "Bath" uses bath
  door id=d_front on w_shell at 1500 width 900
  furniture wc at (4500,200) size 400x700 in r_bed
}
`,
  },
  {
    name: "inline: a room read as a garage from its id alone",
    src: `plan "Carport" {
  units mm
  wall id=w_shell exterior thickness 200 { (0,0) (6000,0) (6000,6000) (0,6000) close }
  room id=r_carport at (0,0) size 3000x6000
  room id=r_hall at (3000,0) size 3000x6000 label "Hall"
  door id=d_front on w_shell at 4500 width 900
  door id=d_car on w_shell at 3000 width 900
}
`,
  },
];

/** Words of the language an id must not be renamed over (a keyword, a door kind, an anchor edge). */
const LANGUAGE = new Set<string>([
  ...Object.values(KEYWORDS).flat(),
  ...DOOR_KINDS,
  ...DOOR_HINGE_NEAR,
  ...DOOR_SWING_BUILDING,
  "top",
  "bottom",
  "left",
  "right",
  "north",
  "south",
  "east",
  "west",
  "in",
  "out",
  "up",
  "down",
]);

/**
 * The same plan with every id renamed to `zz_<id>`, so that an id which is also a plain word
 * (`hall`, `bath`, `kitchen`) or equals a furniture category is as visible to the check as
 * `r_hall` is: a message that says "the bath" no longer hides an id `bath`. Tokens inside strings
 * and comments are left alone, and so is an id that is a word of the language (`left`), which the
 * quoted-id rule still covers. A rename that stops the plan compiling is dropped.
 */
function renameIds(c: Case): Case {
  const ids = new Set(forbiddenOf(c.src).ids.filter((id) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(id) && !LANGUAGE.has(id)));
  const src = c.src.replace(/"(?:[^"\\]|\\.)*"|#[^\n]*|[A-Za-z_][A-Za-z0-9_]*/g, (t) => (ids.has(t) ? `zz_${t}` : t));
  return { ...c, src };
}

/** The same plan with its labels taken away: an unlabelled room has only its id to be named by. */
const unlabelled = (c: Case): Case => ({
  ...c,
  name: `${c.name} (unlabelled)`,
  src: c.src.replace(/\blabel\s+"[^"]*"(\s+at\s*\([^)]*\))?/g, ""),
});

const compiles = (c: Case): boolean =>
  compile(c.src, { world: EXAMPLES_WORLD, noCache: true }).diagnostics.every((d) => d.severity !== "error");

/** What a sweep saw: the messages that quote an id, how many it read, and the codes it read. */
interface Swept {
  rows: string[];
  messages: number;
  codes: Set<string>;
}

/** Every message of the given plans, on all three channels, that quotes one of the plan's own ids. */
function sweep(cases: readonly Case[]): Swept {
  const rows: string[] = [];
  const codes = new Set<string>();
  let messages = 0;
  for (const { name, src, profile } of cases) {
    const f = forbiddenOf(src);
    const opts = { world: EXAMPLES_WORLD, ...(profile ? { profile } : {}) };
    const check = (channel: string, code: string | undefined, message: string): void => {
      messages++;
      if (code) codes.add(code);
      const hit = quotedIds(message, f);
      if (hit.length > 0) rows.push(`${name} · ${channel} ${code ?? ""} [${hit.join(", ")}]: ${message}`);
    };
    for (const d of lint(src, opts)) check("lint", d.code, d.message);
    // The compile channel: the one warning that names two rooms. Other resolver diagnostics quote
    // what the author wrote at the span they point at (PS2.29 leaves them).
    for (const d of compile(src, { world: EXAMPLES_WORLD, noCache: true }).diagnostics)
      if (d.code === "W_ROOM_OVERLAP") check("compile", d.code, d.message);
    const t: string[] = [];
    walkMessages(taste(src, opts), t);
    for (const m of t) check("taste", undefined, m);
  }
  return { rows, messages, codes };
}

let plain: Swept | undefined;
/** The sweep of the plans as written, once for the whole file. */
const plainSweep = (): Swept => (plain ??= sweep([...CORPUS, ...CATALOGUE, ...INLINE]));

/** The rules whose messages named an id before PS2.29 (the card's list, plus what its sweep found):
 *  a sweep that never fires them proves nothing about them, so each must be read at least once. */
const WAS_QUOTING = [
  "W_ALIAS_MATCH",
  "W_OPENING_NOT_DIMENSIONED",
  "W_POCKET_RUN",
  "W_DOOR_NEAR_CORNER",
  "W_CIRCUITOUS_PATH",
  "W_OUTDOOR_OVERLAPS_ROOM",
  "W_BALCONY_NO_DOOR",
  "W_ROOM_OVERLAP",
  "W_ROOM_TOO_NARROW",
  "W_SWING_OBSTRUCTED",
  "W_STAIR_UNMATCHED",
  "W_DIM_INSIDE",
  "W_DIM_OVERLAP",
  "W_FIXTURE_WRONG_ROOM",
  "W_ROOM_MISSING_DEFINING",
  "W_PATH_TOO_NARROW",
];

describe("no message over the corpus quotes an internal id (PS2.22, PS2.29)", () => {
  it("the corpus is read from disk and is not empty", () => {
    expect(CORPUS.length).toBeGreaterThan(150);
    expect(CATALOGUE.length).toBeGreaterThan(50);
  });

  it("lint(), taste() and compile().diagnostics messages are id-free", () => {
    const { rows, messages } = plainSweep();
    expect(messages).toBeGreaterThan(1000);
    expect(rows).toEqual([]);
  });

  it("the same holds with every label taken away (an unlabelled room has only its id)", () => {
    const bare = [...CORPUS, ...CATALOGUE, ...INLINE].map(unlabelled).filter(compiles);
    // …and every id renamed to an id-shaped sentinel; where that breaks the plan, the plain twin.
    const twins = bare.map((c) => {
      const r = renameIds(c);
      return compiles(r) ? r : c;
    });
    expect(twins.filter((c, i) => c !== bare[i]).length).toBeGreaterThan(150);
    expect(twins.length).toBeGreaterThan(200);
    const { rows, codes } = sweep(twins);
    expect(rows).toEqual([]);
    // Not vacuous: every rule that once quoted an id is read at least once across the sweeps.
    const seen = new Set([...codes, ...plainSweep().codes]);
    expect(WAS_QUOTING.filter((c) => !seen.has(c))).toEqual([]);
  });
});

describe("makeNaming — what an unlabelled room is called (src/naming.ts)", () => {
  /** A rectangular room at (x, y) of w × h, named by its centre. */
  const room = (id: string, x: number, y: number, w: number, h: number, uses: string[] = [], label?: string) =>
    nameableOf({ id, at: { x, y }, size: { w, h }, ...(label !== undefined ? { label } : {}) }, uses);
  const say = (rooms: NameableRoom[], id: string, opts?: Parameters<ReturnType<typeof makeNaming>["phrase"]>[1]) =>
    makeNaming(rooms).phrase(rooms.find((r) => r.id === id)!, opts);

  it("names a lone room by its use", () => {
    const rooms = [room("r_k", 0, 0, 3000, 3000, ["kitchen"]), room("r_h", 3000, 0, 3000, 3000, ["hall"], "Hall")];
    expect(say(rooms, "r_k")).toBe("the kitchen");
  });

  it('counts a labelled room of the same use, so "the kitchen" is never ambiguous beside Kitchen', () => {
    const rooms = [
      room("r_k", 0, 0, 3000, 3000, ["kitchen"]),
      room("r_k2", 9000, 0, 3000, 3000, ["kitchen"], "Kitchen"),
    ];
    expect(say(rooms, "r_k")).toBe("the kitchen on the left of the plan");
  });

  it("tells two rooms of one use apart by where they stand, never by id", () => {
    const rooms = [room("r_a", 0, 0, 3000, 3000, ["bedroom"]), room("r_b", 9000, 0, 3000, 3000, ["bedroom"])];
    expect(say(rooms, "r_a")).toBe("the bedroom on the left of the plan");
    expect(say(rooms, "r_b")).toBe("the bedroom on the right of the plan");
  });

  it("reads place against the outline: two equal rooms side by side, one 10 mm lower, are left and right", () => {
    const rooms = [room("r_a", 0, 0, 3000, 3000), room("r_b", 3000, 10, 3000, 3000)];
    expect(say(rooms, "r_a")).toBe("the room on the left of the plan");
    expect(say(rooms, "r_b")).toBe("the room on the right of the plan");
  });

  it("a room 1000–3000 deep in a 6000-deep plan is not 'at the top'", () => {
    const rooms = [room("r_a", 0, 1000, 3000, 2000), room("r_b", 0, 0, 3000, 1000), room("r_c", 0, 3000, 3000, 3000)];
    expect(say(rooms, "r_a")).not.toMatch(/top/);
  });

  it("tells rooms that tie on use and place apart by size first, then by reading order, in one bracket", () => {
    const rooms = [
      room("r_a", 0, 0, 3200, 2400, ["bedroom"]),
      room("r_b", 0, 3000, 3000, 2000, ["bedroom"]),
      room("r_c", 0, 6000, 3000, 2000, ["bedroom"]),
      room("r_d", 6000, 0, 3200, 2400, ["bedroom"]),
    ];
    // Same use everywhere; r_a and r_d differ in place; r_b and r_c in place; none ties.
    expect(say(rooms, "r_a")).toBe("the bedroom in the top left of the plan");
    const tie = [room("r_a", 0, 0, 3200, 2400, ["bedroom"]), room("r_b", 0, 100, 3000, 2000, ["bedroom"])];
    expect(say(tie, "r_a")).toBe("the 3.2 × 2.4 m bedroom in the middle of the plan");
    expect(say(tie, "r_b")).toBe("the 3 × 2 m bedroom in the middle of the plan");
    const twin = [room("r_a", 0, 0, 3000, 2000, ["bedroom"]), room("r_b", 0, 100, 3000, 2000, ["bedroom"])];
    expect(say(twin, "r_a")).toBe("the 3 × 2 m bedroom in the middle of the plan (1 of 2)");
    expect(say(twin, "r_b")).toBe("the 3 × 2 m bedroom in the middle of the plan (2 of 2)");
    for (const id of ["r_a", "r_b"]) expect(say(twin, id)).not.toMatch(/\).*\(/);
  });

  it("names a room by the use the message is about, when it has it", () => {
    const rooms = [room("r_lb", 0, 0, 3000, 3000, ["living", "bedroom"])];
    expect(say(rooms, "r_lb")).toBe("the living room");
    expect(say(rooms, "r_lb", { noun: "bedroom" })).toBe("the bedroom");
    expect(say(rooms, "r_lb", { noun: "kitchen" })).toBe("the living room");
  });

  it("names by place alone when asked (a message about how the use was guessed)", () => {
    const rooms = [room("r_carport", 0, 0, 3000, 3000, ["garage"]), room("r_x", 9000, 0, 3000, 3000, ["hall"])];
    expect(say(rooms, "r_carport")).toBe("the garage");
    expect(say(rooms, "r_carport", { byUse: false })).toBe("the room on the left of the plan");
  });

  it("adds the storey only when asked for one", () => {
    const rooms = [room("r_k", 0, 0, 3000, 3000, ["kitchen"])];
    expect(makeNaming(rooms, 2).phrase(rooms[0]!)).toBe("the kitchen on level 2");
    expect(makeNaming(rooms).phrase(rooms[0]!)).toBe("the kitchen");
  });
});

describe("the storey is named only on a plan of several (PS2.29)", () => {
  const onelevel = `plan "One" {
  units mm
  level 0 {
    wall id=w_out exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    wall id=w_mid partition thickness 100 { (4000,0) (4000,4000) }
    room id=r_a at (0,0) size 4000x4000 uses living
    room id=r_b at (4000,0) size 4000x4000 uses kitchen
    door id=d_front on w_out at 2000 width 900
    door id=d_mid on w_mid at 2000 width 900
  }
}
`;
  const twolevels = `plan "Two" {
  units mm
  level 1 {
    wall id=w1 exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    room id=r_g at (0,0) size 8000x4000 uses living
    door id=d_g on w1 at 2000 width 900
    stair id=s at (7000,500) size 900x2600 dir up
  }
  level 2 {
    wall id=w2 exterior thickness 200 { (0,0) (8000,0) (8000,4000) (0,4000) close }
    room id=r_u1 at (0,0) size 4500x4000 uses bedroom
    room id=r_u2 at (4000,0) size 4000x4000 uses bedroom
    stair id=s at (7000,500) size 900x2600 dir down
  }
}
`;

  it('a plan of one `level` block says no "on level 0" in lint, taste or the compile warning', () => {
    const messages = [
      ...lint(onelevel, { world: EXAMPLES_WORLD }).map((d) => d.message),
      ...compile(onelevel, { world: EXAMPLES_WORLD, noCache: true }).diagnostics.map((d) => d.message),
    ];
    const t: string[] = [];
    walkMessages(taste(onelevel, { world: EXAMPLES_WORLD }), t);
    messages.push(...t);
    expect(messages.some((m) => /\bthe (living room|kitchen)\b/i.test(m))).toBe(true);
    expect(messages.filter((m) => /on level/.test(m))).toEqual([]);
  });

  it("a plan of several names the storey, in the compile warning too", () => {
    const warns = compile(twolevels, { world: EXAMPLES_WORLD, noCache: true }).diagnostics.filter(
      (d) => d.code === "W_ROOM_OVERLAP",
    );
    expect(warns.length).toBeGreaterThan(0);
    for (const w of warns) expect(w.message).toMatch(/on level 2 overlap$/);
    const lints = lint(twolevels, { world: EXAMPLES_WORLD }).filter((d) => d.level === 2);
    expect(lints.some((d) => /on level 2/.test(d.message))).toBe(true);
  });
});
