/**
 * **`sheet text { … }`** — the words a sheet draws, and the decimal mark of its numbers, as the plan
 * writes them (issue #403). The design and what was rejected:
 * `archlang-lab/plans/preview-and-remodel/research/2026-11-02-sheet-text.md`.
 *
 * Authored, never shipped: the core holds no translation, only the English words a sheet has always
 * drawn ({@link SHEET_WORDS}). A key the plan does not write keeps its English word, so a plan with no
 * block is {@link PLAIN_SHEET_TEXT}, which returns the bytes every site returned before this module.
 *
 * It reaches the drawing and nothing else. `toScene` reads it from the resolved plan; `describe()` never
 * does, and a `lint()` message never quotes it. Only the two drafting rules that read the drawn sheet see
 * these strings, as they see any other drawn text (`W_ANNOTATION_OVERLAP`, `W_TITLE_OVERFLOW`).
 *
 * Pure: what it reads is the source. No environment, `Intl` or `toLocaleString`.
 */

import type { Span } from "./diagnostics.js";
import { DOOR_KINDS, WINDOW_KINDS } from "./grammar/tokens.js";
import { FIXTURE_CATEGORIES } from "./elements/fixtures-glyphs.js";
import { GROUND_MATERIALS, KNOWN_MATERIALS } from "./hatches.js";
import { type DecimalMark, drawnDecimal, fmt2, plainDecimal } from "./num-format.js";
import { plainText } from "./text-safe.js";

/**
 * Every fixed word the sheet draws that has no word of its own in the language, by its stable key, with
 * the English drawn when the plan writes none. The five `title` fields keep their field word. A kind, a
 * material or a fixture category is its own key, and its own English ({@link vocabularyKeys}).
 *
 * The door and window tags (`D01`), axis bubbles and `m²` are handles and units, not words: no key.
 */
export const SHEET_WORDS = {
  project: "PROJECT",
  drawn_by: "DRAWN BY",
  date: "DATE",
  number: "DRAWING NO.",
  revision: "REVISION",
  scale: "SCALE",
  level: "LEVEL",
  room_schedule: "ROOM SCHEDULE",
  no: "NO.",
  name: "NAME",
  area: "AREA (CENTRELINE, m²)",
  net_area: "NET AREA (m²)",
  subtotal: "SUBTOTAL",
  total: "TOTAL",
  no_zone: "(no zone)",
  opening_schedule: "DOOR & WINDOW SCHEDULE",
  tag: "TAG",
  rooms: "ROOM(S)",
  width: "WIDTH",
  type: "TYPE",
  hand: "HAND",
  left: "left",
  right: "right",
  exterior: "exterior",
  window: "window",
  legend: "LEGEND",
  demolished: "demolished",
  floor: "floor",
  notes: "NOTES",
  net: "net",
  up: "UP",
  down: "DN",
  north: "N",
} as const;

/** The entry that sets the decimal mark rather than a word. */
export const SHEET_DECIMAL_KEY = "decimal";

/** The most UTF-16 units a sheet word may hold: past it a table's column would be a sheet wide. */
export const MAX_SHEET_WORD = 40;

/** The words that stand in one fixed spot and so hold less: a table can widen, a tread cell cannot. */
const SHORT_WORDS: ReadonlySet<string> = new Set(["north", "up", "down"]);
const MAX_SHORT_WORD = 6;

/** The closed words of the language that a sheet also draws: each is its own key. */
const vocabularyKeys = (): readonly string[] => [
  ...DOOR_KINDS,
  ...WINDOW_KINDS,
  ...KNOWN_MATERIALS,
  ...GROUND_MATERIALS,
  ...FIXTURE_CATEGORIES,
];

/** Every key a `sheet text` block may write. A function, for the load order: see `parser.ts`. */
export const sheetTextKeys = (): readonly string[] => [
  SHEET_DECIMAL_KEY,
  ...Object.keys(SHEET_WORDS),
  ...vocabularyKeys(),
];

let keySet: ReadonlySet<string> | undefined;

/** May a `sheet text` block write this key? */
export const isSheetTextKey = (key: string): boolean => {
  keySet ??= new Set(sheetTextKeys());
  return keySet.has(key);
};

/** One `key "value"` line of a `sheet text` block. */
export interface SheetTextEntry {
  key: string;
  value: string;
  span: Span;
}

/**
 * Why `value` cannot be written for the valid `key`, or `null`. Each of these would otherwise be a
 * string silently lost, or a drawn string that breaks its row.
 */
export function sheetTextRefusal(key: string, value: string): string | null {
  if (key === SHEET_DECIMAL_KEY) {
    return value === "," || value === "." ? null : `\`decimal\` is "," or ".", not ${JSON.stringify(value)}`;
  }
  if (value === "") return `The sheet text for \`${key}\` is empty`;
  if (plainText(value) !== value) return `The sheet text for \`${key}\` holds a control character: a word is one line`;
  const most = SHORT_WORDS.has(key) ? MAX_SHORT_WORD : MAX_SHEET_WORD;
  return value.length > most
    ? `The sheet text for \`${key}\` is ${value.length} long, past the ${most} it may hold`
    : null;
}

/** What the drawing asks of a plan's wording. */
export interface SheetText {
  /** The word drawn for `key`: the plan's, else the English. An unkeyed word (`-`) is itself. */
  word(key: string): string;
  /** Did the plan write this key? A column widens only for a word the plan wrote. */
  has(key: string): boolean;
  /** A number already printed, with the plan's decimal mark. For drawn text only. */
  num(printed: string): string;
  /** A length in mm, as a drawn dimension prints it: `fmt2`, with the plan's decimal mark. */
  mm(n: number): string;
  /** A number this sheet drew, with the decimal point again: lint messages stay English. */
  plain(drawn: string): string;
}

const ENGLISH: ReadonlyMap<string, string> = new Map(Object.entries(SHEET_WORDS));

/** The wording of a plan with no `sheet text`: the English, and the decimal point. */
export const PLAIN_SHEET_TEXT: SheetText = {
  word: (key) => ENGLISH.get(key) ?? key,
  has: () => false,
  num: (printed) => printed,
  mm: fmt2,
  plain: (drawn) => drawn,
};

/** The wording a plan's `sheet text` entries ask for. */
export function sheetText(entries: readonly SheetTextEntry[] | undefined): SheetText {
  if (!entries) return PLAIN_SHEET_TEXT;
  const written = new Map(entries.map((e) => [e.key, e.value]));
  const mark: DecimalMark = written.get(SHEET_DECIMAL_KEY) === "," ? "," : ".";
  const num = (printed: string): string => drawnDecimal(printed, mark);
  return {
    word: (key) => written.get(key) ?? PLAIN_SHEET_TEXT.word(key),
    has: (key) => written.has(key),
    num,
    mm: (n) => num(fmt2(n)),
    plain: (drawn) => plainDecimal(drawn, mark),
  };
}
