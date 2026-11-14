/**
 * The hosted server's caps — byte counts and request counts, checked BEFORE any compile work,
 * never a clock (docs/adr/0026-hosted-mcp-worker.md).
 *
 * INTERIM: 64 KiB of source is a placeholder until the per-tool CPU measurement on Cloudflare
 * (scripts/measure-cpu.mjs) sets it. The largest example is well under it, so no corpus plan is
 * refused.
 */

import { SOURCE_CAP_BYTES } from "@chanmeng666/archlang/share";

/**
 * The most UTF-8 bytes any one tool argument (`source`, `plan_json`, `intent`, …) may carry, and a
 * `/svg/<payload>` may inflate to: the share-link source cap, defined once in the core's
 * `@chanmeng666/archlang/share` (the playground's short-link Worker holds a stored plan to it too).
 */
export { SOURCE_CAP_BYTES };

/**
 * The most bytes a request body may carry, read before it is parsed. JSON-escaping a source can
 * grow it (a quote becomes two bytes, a control character six), so this sits well above
 * {@link SOURCE_CAP_BYTES}; a body past it is refused with the same diagnostic.
 */
export const BODY_CAP_BYTES = 4 * SOURCE_CAP_BYTES;

/**
 * The longest `/svg/<payload>` accepted (`MCP_PAYLOAD_CAP_CHARS`, derived in the core from
 * {@link SOURCE_CAP_BYTES}): a cap-sized source that does not compress stays under it.
 */
export { MCP_PAYLOAD_CAP_CHARS } from "@chanmeng666/archlang/share";

/**
 * Per-address request rates, enforced by the Workers rate-limiting bindings declared in
 * wrangler.jsonc (`ratelimits`), whose `simple` blocks a test holds to these numbers. The period
 * is one of the two the binding allows (10 or 60 s).
 *
 * An ABUSE GUARD, not the spend bound, and set high on purpose: a connector platform (a chat
 * product calling this server for its users) reaches it from a few shared cloud egress addresses,
 * so every one of its users shares one bucket. One agent turn is 5–15 calls. The spend bound is
 * `limits.cpu_ms` plus the owner's billing alert (ADR 0026).
 */
export const RATE_PERIOD_SECONDS = 60;
/** `POST /mcp` requests per address per period. */
export const MCP_PER_PERIOD = 600;
/** `/svg/` cache MISSES per address per period (a hit compiles nothing and is not counted). */
export const SVG_PER_PERIOD = 3000;
/**
 * `POST /check` requests per address per period: one lint each, the same work as a `/mcp` `lint`
 * call, so the same ceiling. The public check set's runner sends two per case.
 */
export const CHECK_PER_PERIOD = 600;
