/**
 * The one SHA-256 hex helper for tests.
 *
 * Replaces the local `createHash("sha256").update(x).digest("hex")` one-liners (`sha`, `sha256`,
 * `digest`, `hash`, …) beside the canonical body in `test/helpers/byte-identity-digest.ts`, whose
 * `sha256` this module re-exports (a string is hashed as UTF-8, raw bytes as they are).
 */

export { sha256 } from "./byte-identity-digest.js";
