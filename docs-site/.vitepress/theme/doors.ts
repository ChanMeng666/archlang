// The doors, as the docs site reads them: every URL, command, label and the agent prompt come
// from `site-shared/doors.json`, the one file every public surface shares
// (test/site-doors.test.ts). Nothing in this theme retypes a door; a component imports this
// module, never the JSON's raw text. Named imports only, so the bundle keeps the parts it uses.
import { agentPrompt, canonicalLine, doors, links, order } from "../../../site-shared/doors.json";

export { doors, links };

/** The one line that says what ArchLang is, on every surface (PS-D1). */
export const CANONICAL_LINE: string = canonicalLine;

/** A door's key in doors.json. */
export type DoorId = keyof typeof doors;

/** The order each docs surface shows the doors in (PS-D2). */
export const START_ORDER = order.start as readonly DoorId[];
export const HOME_ORDER = order.docsHome as readonly DoorId[];

/** The agent prompt as one copyable block, line for line as doors.json holds it. */
export const AGENT_PROMPT: string = agentPrompt.join("\n");
