/**
 * Share links for a plan: the playground URL that opens it in the editor, and the chrome-less
 * embed URL that only draws it. Published as `@chanmeng666/archlang/link` (Node only: it
 * compresses with `zlib`) so the MCP shim mints the same bytes `archlang link` prints.
 *
 * No query string and no tracking parameter: everything after the origin is the fragment, the `#z=`
 * plan and (on the playground link) the `&edit` flag that opens the editor; the browser never sends
 * it to the server.
 */

import { decodePlanHash, encodePlanHash, PLAYGROUND_EDIT_FLAG, PLAYGROUND_ORIGIN } from "./share-codec.mjs";

export { decodePlanHash, encodePlanHash, PLAYGROUND_ORIGIN };

/** The two URLs for a plan and the size of what they carry. */
export interface PlanLinks {
  /** Opens the plan in the playground editor (`&edit`: the source beside the drawing), rendered, with its diagnostics. */
  playground: string;
  /** Draws the plan alone, for an `<iframe>`; append `&editable=1` or `&theme=<key>` to taste. */
  embed: string;
  /** Length of the compressed payload in bytes; the URL carries it base64url-encoded, about 4/3 as long. */
  bytes: number;
}

/** What `archlang link --json` prints and the MCP `link` tool returns: the links plus the verdict. */
export interface LinkResult extends PlanLinks {
  /** The plan compiles with no error. A plan that does not still gets its links. */
  ok: boolean;
  /** How many error diagnostics the plan has; present only when `ok` is false. */
  errors?: number;
}

/**
 * The one shape both callers emit. `diagnostics` is the caller's `compile(source)` result, run
 * with no `World` as the playground runs it, so `ok` says what the person opening the link sees.
 */
export function linkResult(source: string, diagnostics: readonly { severity: string }[]): LinkResult {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  return { ok: errors === 0, ...(errors > 0 ? { errors } : {}), ...planLinks(source) };
}

/** Mint both links for `source`. Pure and deterministic: the same source gives the same URLs. */
export function planLinks(source: string): PlanLinks {
  const payload = encodePlanHash(source);
  return {
    playground: `${PLAYGROUND_ORIGIN}/#z=${payload}&${PLAYGROUND_EDIT_FLAG}`,
    embed: `${PLAYGROUND_ORIGIN}/embed.html#z=${payload}`,
    bytes: Buffer.from(payload, "base64url").length,
  };
}
