/**
 * The playground's page events (ruling RM-D86, card FW4): the closed lists the page sends from and
 * the Worker accepts, and the one reader both hold to them. Pure: no DOM, no binding, no clock, so
 * the page (`playground/src/telemetry.ts`) and the Worker (`worker/app.ts`, `POST /api/event`)
 * import the same rules, and `playground/test/event-core.test.ts` pins them.
 *
 * An event is a name from {@link EVENT_NAMES} and, by name, one word from a fixed list (a compile's
 * outcome, an export's format, a link's kind) and the catalogued diagnostic codes it concerns.
 * Nothing else: no plan text, label, room or element id, no cookie and no account. The one id any
 * event carries is a `contribute`'s short-link id, the link the user has just asked to send
 * (ruling RM-D87, card FW5).
 */
import { isShareId } from "archlang/share";

/** Where the page sends an event (`run_worker_first`'s `/api/*` already covers it). */
export const EVENT_PATH = "/api/event";

/** Every event the Worker counts. Anything else is a 400 and writes nothing. */
export const EVENT_NAMES = ["compile", "export", "view_3d", "share", "fix_applied", "contribute"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** A render's verdict: it drew (`ok`, warnings or not) or it has an error. */
export const COMPILE_OUTCOMES = ["ok", "error"] as const;
export type CompileOutcome = (typeof COMPILE_OUTCOMES)[number];

/**
 * The Share menu's exports (`playground/index.html`): the six downloads, by their `data-download`
 * word, and the two copies.
 */
export const EXPORT_FORMATS = ["svg", "png", "pdf", "dxf", "txt", "glb", "svg-copy", "png-copy"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The Share menu's links: Copy short link, Copy full link, Embed. */
export const SHARE_KINDS = ["short", "full", "embed"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** The most codes one event carries (after dedupe), as the MCP Worker's result point holds them. */
export const MAX_EVENT_CODES = 20;

/** The largest body `POST /api/event` reads; twenty codes and the rest fit in well under it. */
export const EVENT_BODY_CAP_BYTES = 1024;

/** `POST /api/event` per address per period (the `RATE_EVENT` binding in wrangler.jsonc). */
export const EVENT_PER_PERIOD = 120;

/** One event, as the page sends it and the Worker counts it. */
export type PageEvent =
  | { e: "compile"; outcome: CompileOutcome; codes: string[] }
  | { e: "export"; fmt: ExportFormat }
  | { e: "view_3d" }
  | { e: "share"; fmt: ShareKind }
  | { e: "fix_applied"; codes: string[] }
  | { e: "contribute"; id: string; codes: string[] };

/**
 * The shape of a catalogued code. Only a pre-filter: the Worker keeps a code only when the core's
 * catalogue has it (`ERROR_CATALOG`), never on this shape alone.
 */
const CODE_SHAPE = /^[EW]_[A-Z0-9_]{1,64}$/;

/**
 * Codes as an event carries them: the strings that are codes (by `isCode`, else by shape), each
 * once, sorted, at most {@link MAX_EVENT_CODES}. A diagnostic with no code adds nothing.
 */
export function eventCodes(
  codes: Iterable<string | undefined>,
  isCode: (code: string) => boolean = (c) => CODE_SHAPE.test(c),
): string[] {
  const kept = new Set<string>();
  for (const c of codes) if (typeof c === "string" && CODE_SHAPE.test(c) && isCode(c)) kept.add(c);
  return [...kept].sort().slice(0, MAX_EVENT_CODES);
}

const listed = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** The keys each event may carry beside `e`; any other key refuses the body. */
const KEYS: Record<EventName, readonly string[]> = {
  compile: ["outcome", "codes"],
  export: ["fmt"],
  view_3d: [],
  share: ["fmt"],
  fix_applied: ["codes"],
  contribute: ["id", "codes"],
};

/**
 * Read a parsed body as an event, or null: `e` must be listed, every other key one that event
 * takes, each word from its list, `codes` (when given) an array of at most
 * {@link MAX_EVENT_CODES} strings. A string `isCode` does not know is dropped, never kept.
 */
export function readEvent(body: unknown, isCode: (code: string) => boolean): PageEvent | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (!listed(EVENT_NAMES, b.e)) return null;
  const e = b.e;
  for (const k of Object.keys(b)) if (k !== "e" && !KEYS[e].includes(k)) return null;
  let codes: string[] = [];
  if (b.codes !== undefined) {
    if (!Array.isArray(b.codes) || b.codes.length > MAX_EVENT_CODES) return null;
    if (!b.codes.every((c) => typeof c === "string")) return null;
    codes = eventCodes(b.codes as string[], isCode);
  }
  switch (e) {
    case "compile":
      return listed(COMPILE_OUTCOMES, b.outcome) ? { e, outcome: b.outcome, codes } : null;
    case "export":
      return listed(EXPORT_FORMATS, b.fmt) ? { e, fmt: b.fmt } : null;
    case "view_3d":
      return { e };
    case "share":
      return listed(SHARE_KINDS, b.fmt) ? { e, fmt: b.fmt } : null;
    case "fix_applied":
      return { e, codes };
    case "contribute":
      return typeof b.id === "string" && isShareId(b.id) ? { e, id: b.id, codes } : null;
  }
}

/**
 * The Analytics Engine point for an event: `blobs` are the name, then the one word it carries
 * (the outcome, the format or link kind, a `contribute`'s short-link id, else ""), its codes
 * joined with ";", and the UTC day; the index is the name.
 */
export function eventPoint(ev: PageEvent, day: string): { blobs: string[]; indexes: string[] } {
  const word = "outcome" in ev ? ev.outcome : "fmt" in ev ? ev.fmt : "id" in ev ? ev.id : "";
  const codes = "codes" in ev ? ev.codes.join(";") : "";
  return { blobs: [ev.e, word, codes, day], indexes: [ev.e] };
}
