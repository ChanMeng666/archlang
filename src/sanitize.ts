/**
 * Config sanitization — a denylist for **untrusted** `.arch`-sourced config.
 *
 * Source-derived config (theme/style values) is escaped at the serialization
 * boundary (see `sanitizeTheme`), but a few shapes are better rejected outright:
 * prototype-polluting keys (`__proto__`, `constructor`, `prototype`) and string
 * values carrying markup (`<`, `>`) or a `data:` URL (`url(data:…)`), which could
 * smuggle active content into an SVG `fill`/`stroke`. Trusted `CompileOptions`
 * are author-controlled and skip this entirely.
 */

import type { Diagnostic } from "./diagnostics.js";

const DENIED_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const BAD_VALUE = /[<>]|url\(\s*data:/i;

/** True if a config string value carries a disallowed token (markup or a data: URL). */
export function isDisallowedConfigValue(s: string): boolean {
  return BAD_VALUE.test(s);
}

/**
 * Deep-sanitize an untrusted config value: drop prototype-polluting keys and
 * blank disallowed string values, collecting a diagnostic for each. Objects are
 * rebuilt with safe assignment (denied keys are never written), so prototype
 * pollution is impossible regardless of input shape.
 */
export function sanitizeConfig<T>(raw: unknown): { value: T; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (isDisallowedConfigValue(v)) {
        diagnostics.push({ severity: "warning", code: "W_SANITIZED_CONFIG", message: "Stripped a disallowed config value" });
        return "";
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>)) {
        if (DENIED_KEYS.has(k)) {
          diagnostics.push({ severity: "warning", code: "W_SANITIZED_CONFIG", message: `Ignored disallowed config key "${k}"` });
          continue;
        }
        out[k] = walk((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return { value: walk(raw) as T, diagnostics };
}
