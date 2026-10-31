/**
 * The datum table (ADR 0028 §1): what one resolution group's rooms and grid axes expose as
 * lines, frozen after every room is placed and before any wall resolves.
 *
 * A group is the root plan or one `place`d instance (ADR 0016). Its table holds every room
 * the group can see — its own and its descendants', carried into its frame under their
 * relative ids (`west.main`) — because that is exactly the room list the group resolves
 * against. A rectangular room contributes its four edge lines and its centre, in the frame
 * the group is resolved in (`+y` down, so `top` is the smaller `y`). A `polygon` or `circle`
 * room, a room that could not be placed, and a room of no positive size contribute no
 * lines; the table records why, so a later reader can refuse with the right code rather
 * than report an unknown name. A rectilinear polygon contributes its ring as well, for the one
 * reader that takes a ring where it would take lines (`door|opening between`).
 *
 * The table is built and frozen here and read by the room-edge datums of the language
 * (`hall.top`, ADR 0028 §2) through the readers below, which the resolver installs on the
 * evaluator (`withDatumReader`, `src/expr.ts`) for the phase it is in. Building it is new
 * work, so it is charged to the step meter before it allocates.
 */

import type { Point } from "./ast.js";
import type { Diagnostic } from "./diagnostics.js";
import { chargeSteps, closest, type DatumReader, type Value } from "./expr.js";
import type { RAxis, RRoom } from "./ir.js";
import { rectilinear } from "./room-tiling.js";

/** A rectangular room's lines: edges and centre, in the group's own frame (mm). */
export interface RoomDatums {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly cx: number;
  readonly cy: number;
}

/** Why a room the group can see exposes no lines. */
export type DatumRefusal = "polygon" | "circle" | "unplaced" | "degenerate";

/** One positioning axis of the plan's `axes` block (root group only). */
export interface DatumAxis {
  readonly axis: "x" | "y";
  /** The axis's derived label (`1`, `2`, … for `x`; `A`, `B`, … for `y`). */
  readonly label: string;
  /** Its position, grid-snapped as the axis is drawn (mm). */
  readonly pos: number;
}

/** A group's frozen datum table. Every level of it is read-only and `Object.freeze`d. */
export interface DatumTable {
  /** Rectangular rooms by id, in the order the group sees them. */
  readonly rooms: ReadonlyMap<string, RoomDatums>;
  /** Rooms the group can see that expose no lines, by id, with the reason. */
  readonly refused: ReadonlyMap<string, DatumRefusal>;
  /** The rectilinear polygons among `refused`, by id, each with its ring (the room's own, in the
   *  group's frame). `null` for a ring the room itself refused: that room has reported it. */
  readonly rings: ReadonlyMap<string, readonly Point[] | null>;
  /** The plan's positioning axes, sorted and labelled as drawn; empty in an instance. */
  readonly axes: readonly DatumAxis[];
}

/** A `ReadonlyMap` whose mutators throw, so a frozen table cannot be edited through a cast. */
function frozenMap<K, V>(entries: readonly (readonly [K, V])[]): ReadonlyMap<K, V> {
  const m = new Map<K, V>(entries);
  const refuse = (): never => {
    throw new TypeError("a datum table is frozen");
  };
  m.set = refuse;
  m.delete = refuse;
  m.clear = refuse;
  return Object.freeze(m);
}

/**
 * Build and freeze the datum table of one resolution group, from the rooms it can see (in
 * that order) once relational placement has run, and the plan's axes (root only).
 *
 * Steps: one per room and one per axis, charged in one call BEFORE anything is allocated. Asking
 * whether a ring is rectilinear allocates nothing and reads a ring the room's own resolution paid
 * for, so it is free, and a slanted polygon costs what it always cost.
 */
export function buildDatumTable(rooms: readonly RRoom[], axes: readonly RAxis[] | undefined): DatumTable {
  chargeSteps(rooms.length + (axes?.length ?? 0));
  const lines: [string, RoomDatums][] = [];
  const refused: [string, DatumRefusal][] = [];
  const rings: [string, readonly Point[] | null][] = [];
  for (const r of rooms) {
    if (r.circle) refused.push([r.id, "circle"]);
    else if (r.poly) {
      refused.push([r.id, "polygon"]);
      if (rectilinear(r.poly)) rings.push([r.id, r._ringRefused ? null : r.poly]);
    } else if (r._unplaced) refused.push([r.id, "unplaced"]);
    else if (!(r.size.w > 0 && r.size.h > 0)) refused.push([r.id, "degenerate"]);
    else {
      const { x, y } = r.at;
      const { w, h } = r.size;
      lines.push([
        r.id,
        Object.freeze({
          top: y,
          bottom: y + h,
          left: x,
          right: x + w,
          cx: x + w / 2,
          cy: y + h / 2,
        }),
      ]);
    }
  }
  return Object.freeze({
    rooms: frozenMap(lines),
    refused: frozenMap(refused),
    rings: frozenMap(rings),
    axes: Object.freeze((axes ?? []).map((a) => Object.freeze({ axis: a.axis, label: a.label, pos: a.pos }))),
  });
}

// ---- room-edge datums: the language's reading of the table (ADR 0028 §2) -------------

/** The frame words a rectangular room exposes, in the order the reference lists them. */
export const DATUM_WORDS = ["top", "bottom", "left", "right", "cx", "cy"] as const;
export type DatumWord = (typeof DATUM_WORDS)[number];

/** The compass words a datum may use for a frame word, only in a root frame whose `north`
 *  is `up` (explicit or default). */
export const COMPASS_DATUM_ALIASES: Readonly<Record<string, DatumWord>> = Object.freeze({
  north: "top",
  south: "bottom",
  west: "left",
  east: "right",
});

/** The words that name an EDGE (a line an opening's run can lie on, or an offset can be
 *  measured from, ADR 0028 §5): the four frame words and their compass aliases. */
export const EDGE_WORDS: readonly string[] = Object.freeze([
  ...DATUM_WORDS.filter((w) => w !== "cx" && w !== "cy"),
  ...Object.keys(COMPASS_DATUM_ALIASES),
]);

/**
 * A dotted name read as a datum: everything before the last dot names the room, the last
 * segment is the datum word (`west.main.top` is room `west.main`, word `top`). `undefined`
 * when the last segment is neither a datum word nor a compass alias, so the name stays an
 * ordinary unknown reference.
 */
export function splitDatum(name: string): { room: string; word: string } | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const word = name.slice(dot + 1);
  if (!(DATUM_WORDS as readonly string[]).includes(word) && !Object.hasOwn(COMPASS_DATUM_ALIASES, word)) {
    return undefined;
  }
  return { room: name.slice(0, dot), word };
}

const NUM0: Value = { t: "num", v: 0 };

/** Where a datum is read when no table exists yet. */
export type DatumPhase = "expand" | "rooms";

/**
 * The reader in force before a group's table is frozen: every datum is refused with
 * `E_DATUM_BEFORE_ROOMS` at the datum. `expand` is the plan's expansion (a `let`, a loop
 * bound, a condition, a `place`, a `set`, a component argument) and its plan settings
 * (`height`, `axes`, the site boundary); `rooms` is a group's room pass (a room's own
 * position or size, relational placement).
 */
export function beforeRoomsReader(phase: DatumPhase): DatumReader {
  return (name, span, onError) => {
    if (splitDatum(name) === undefined) return undefined;
    onError({
      severity: "error",
      message:
        phase === "expand"
          ? `\`${name}\` is read when the plan expands (a \`let\`, a loop or condition, a \`place\`, a \`set\`, a component argument or a plan setting), before any room is placed; write the datum in the statement that uses it`
          : `\`${name}\` is read while the rooms are being placed, before any room's edges are known; give this room numbers or a relational placement (\`right-of|left-of|above|below\`) instead`,
      code: "E_DATUM_BEFORE_ROOMS",
      ...(span ? { span } : {}),
    });
    return NUM0;
  };
}

/**
 * The reader a user function's body is evaluated under (`withDatumReader`'s `inBody`): a
 * body has no room of its own, so reading a datum there would bind the room name at each
 * call site. It is refused with `E_DATUM_BEFORE_ROOMS`; the edge is passed as an argument
 * instead, which the caller evaluates under its own reader.
 */
export function functionBodyReader(fn: string): DatumReader {
  return (name, span, onError) => {
    const d = splitDatum(name);
    if (d === undefined) return undefined;
    onError({
      severity: "error",
      message: `\`${name}\` is read inside the body of \`${fn}\`, which has no room of its own; pass the edge as an argument: \`${fn}(${name})\``,
      code: "E_DATUM_BEFORE_ROOMS",
      ...(span ? { span } : {}),
    });
    return NUM0;
  };
}

/** What a group's table reader needs beside the table. */
export interface TableReaderOpts {
  /** Compass words alias the frame words: the root group of a plan whose `north` is `up`. */
  readonly compassAliases: boolean;
  /** Why compass words are refused here, when they are (quoted in the message). */
  readonly compassWhy: string;
  /** The ids of every element inside the instances this group can see, named relative to
   *  it (`west.top`). Asked only when a datum is read, so a plan that reads none pays nothing. */
  readonly instanceIds: () => ReadonlySet<string>;
}

/**
 * The reader of one group's frozen table, in force for every statement that resolves after
 * the group's rooms (walls, openings, furniture, dimensions, …). Refusals, each at
 * the datum's span:
 *
 * - `E_DATUM_NAME` when the whole dotted path is also an element id inside an instance (an
 *   instance `west` holding an element `top`): never resolved either way;
 * - `E_DATUM_COMPASS` for a compass word where it would mean two things;
 * - `E_ROOM_NOT_RECTANGLE` for a polygon or circle room, `E_DATUM_UNPLACED` for a room that
 *   could not be placed or has no positive size;
 * - `E_UNKNOWN_REF` for a room the group cannot see (the closest room id as a hint).
 *
 * A read is one table lookup, paid by the evaluation step of the name itself.
 */
export function tableReader(table: DatumTable, opts: TableReaderOpts): DatumReader {
  return (name, span, onError) => {
    const d = splitDatum(name);
    if (d === undefined) return undefined;
    const refuse = ({ code, message }: { code: string; message: string }, hint?: string): Value => {
      const out: Diagnostic = {
        severity: "error",
        message,
        code,
        ...(span ? { span } : {}),
      };
      if (hint !== undefined) out.hints = [hint];
      onError(out);
      return NUM0;
    };
    if (opts.instanceIds().has(name)) {
      return refuse({
        code: "E_DATUM_NAME",
        message: `\`${name}\` could be the \`${d.word}\` datum of "${d.room}" or the element "${name}" inside the instance; rename the element so the name reads one way`,
      });
    }
    let word = d.word as DatumWord;
    const alias = COMPASS_DATUM_ALIASES[d.word];
    if (alias !== undefined) {
      if (!opts.compassAliases) {
        return refuse({
          code: "E_DATUM_COMPASS",
          message: `\`${d.word}\` would mean two things here (${opts.compassWhy}); write \`${d.room}.${alias}\``,
        });
      }
      word = alias;
    }
    const lines = table.rooms.get(d.room);
    if (lines !== undefined) return { t: "num", v: lines[word] };
    const why = table.refused.get(d.room);
    if (why === "polygon" || why === "circle") {
      return refuse({
        code: "E_ROOM_NOT_RECTANGLE",
        message: `Room "${d.room}" is a ${why} room, so \`${name}\` names no edge; only a rectangular room exposes datums`,
      });
    }
    if (why === "unplaced" || why === "degenerate") {
      return refuse({
        code: "E_DATUM_UNPLACED",
        message:
          why === "unplaced"
            ? `Room "${d.room}" could not be placed (its own error says why), so \`${name}\` has no position`
            : `Room "${d.room}" has no positive size, so \`${name}\` names no edge`,
      });
    }
    const hint = closest(d.room, [...table.rooms.keys(), ...table.refused.keys()]);
    return refuse(
      {
        code: "E_UNKNOWN_REF",
        message: `Unknown room "${d.room}" in the datum \`${name}\``,
      },
      hint ? `did you mean "${hint}.${d.word}"?` : undefined,
    );
  };
}
