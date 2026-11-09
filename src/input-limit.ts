/**
 * A host's refusals, as catalogued diagnostics.
 *
 * `compile()` has no size cap and no rate of its own: it is bounded by counts (the step and
 * drawing budgets), never by bytes or time, and every input returns. A HOST can still have
 * ceilings the core does not — the hosted MCP Worker (`packages/mcp-worker`) runs under a
 * per-request CPU limit and pays for every request — and refuses an input above its byte cap, or
 * a caller over its request rate, before any compile work starts. These are the shapes those
 * refusals take, so a caller reads them like every other diagnostic: `E_INPUT_TOO_LARGE` and
 * `E_RATE_LIMITED`, whose catalog entries say what to do. `compile()`, `describe()` and `lint()`
 * never call them.
 *
 * Pure: they measure what they are given and allocate nothing proportional to it.
 */

import type { Diagnostic } from "./diagnostics.js";
import { plainDigits } from "./num-format.js";

/** The UTF-8 length of `s` in bytes, counted without encoding it. */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

/**
 * `E_INPUT_TOO_LARGE` when `input` is longer than `capBytes` of UTF-8, else `undefined`.
 * `input` is the text itself, or its size in bytes when the host stopped reading it at the cap
 * (`exact: false`: the message then says "more than"). Whole-input, so it carries no span.
 * `what` names the input in the message ("source", "plan_json", "request body").
 */
export function inputTooLarge(
  input: string | number,
  capBytes: number,
  what = "source",
  exact = true,
): Diagnostic | undefined {
  const bytes = typeof input === "number" ? input : utf8ByteLength(input);
  if (bytes <= capBytes) return undefined;
  const size = exact ? plainDigits(bytes) : `more than ${plainDigits(capBytes)}`;
  return {
    severity: "error",
    code: "E_INPUT_TOO_LARGE",
    message: `${what} is ${size} bytes; this host accepts at most ${plainDigits(capBytes)}`,
  };
}

/**
 * `E_RATE_LIMITED`: this caller sent more than `limit` requests of one kind (`scope`, e.g.
 * "/mcp") within `periodSeconds`. Whole-request, so it carries no span; the catalogued fix says
 * to wait or run locally.
 */
export function rateLimited(scope: string, limit: number, periodSeconds: number): Diagnostic {
  return {
    severity: "error",
    code: "E_RATE_LIMITED",
    message: `too many ${scope} requests from this address: this host answers at most ${plainDigits(limit)} every ${plainDigits(periodSeconds)} s`,
  };
}

/**
 * The most UTF-8 bytes of one imported `.arch` module the Node CLI's World reads (1 MiB). A larger
 * file is refused with `E_IMPORT_TOO_LARGE` before it is read: an `import` must not pull an
 * arbitrary file into memory. The largest `.arch` file in the repository is about 34 KB.
 */
export const MODULE_CAP_BYTES = 1024 * 1024;
