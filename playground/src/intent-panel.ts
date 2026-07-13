/**
 * The Intent tab — the v1.14 intent channel, in the browser.
 *
 * A brief ("a 1-bed flat, bathroom about 6 m², ~40 m² total") is written down as data,
 * then the plan is checked against it. This runs the SAME pure functions the CLI does —
 * `intentFromJson` → `validateIntent` → `feedbackForResult` — so the playground's verdict
 * and `arch validate --intent` / `arch score --brief` cannot disagree.
 *
 * Gating vs advisory is the contract's, not ours: room count/existence/area/window
 * assertions gate (a miss is a failure), while adjacency/reachability score but never
 * gate. We render the same distinction rather than inventing a second policy.
 */
import { escapeHtml } from "./escape.js";
import {
  feedbackForResult,
  intentFromJson,
  validateIntent,
  type DescribeOptions,
  type IntentCheckResult,
} from "archlang";

/** A starter brief for the default Studio example — valid, and mostly satisfied. */
export const STARTER_INTENT = `{
  "rooms": 4,
  "roomsInclude": [
    { "concept": "bathroom", "count": { "min": 1 } },
    { "concept": "bedroom", "count": { "min": 1 }, "windows": { "min": 1 } }
  ],
  "totalAreaM2": { "min": 38, "max": 46, "source": "around 42 m² total" },
  "reachable": true
}`;

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 100));

/** Render the subscore bars — the same projection `arch score` reports. */
function subscoreRows(result: IntentCheckResult): string {
  const entries = Object.entries(result.subscores).filter(([, v]) => v != null);
  if (entries.length === 0) return "";
  return (
    `<ul class="intent-sub">` +
    entries
      .map(([name, value]) => {
        const p = Math.round(Number(value) * 100);
        return (
          `<li><span class="intent-sub-name">${escapeHtml(name)}</span>` +
          `<span class="intent-bar"><i style="width:${p}%"></i></span>` +
          `<span class="intent-sub-val">${p}%</span></li>`
        );
      })
      .join("") +
    `</ul>`
  );
}

/**
 * Check `source` against the JSON brief in `intentText` and render the verdict.
 * Never throws: a malformed brief renders as a list of pathed parse errors, which is
 * exactly what `intentFromJson` returns.
 */
export function renderIntent(el: HTMLElement, source: string, intentText: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(intentText);
  } catch (err) {
    el.innerHTML = `<p class="intent-bad">Not valid JSON — ${escapeHtml((err as Error).message)}</p>`;
    return;
  }

  const { intent, errors } = intentFromJson(parsed);
  if (!intent) {
    el.innerHTML =
      `<p class="intent-bad">This isn't a valid intent contract:</p><ul class="intent-errs">` +
      errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("") +
      `</ul>`;
    return;
  }

  const result = validateIntent(source, intent, { noCache: true } as DescribeOptions & { noCache?: boolean });
  const feedback = feedbackForResult(result);
  const verdict = result.ok ? "ok" : "miss";
  const label = result.ok ? "Plan satisfies the brief" : "Plan misses the brief";

  el.innerHTML =
    `<div class="intent-head intent-${verdict}">` +
    `<strong>${label}</strong>` +
    `<span class="intent-count">${result.satisfied}/${result.total} assertions · ${pct(result.satisfied, result.total)}%</span>` +
    `</div>` +
    subscoreRows(result) +
    (result.violations.length
      ? `<p class="intent-vh">Violations</p><ul class="intent-list">` +
        result.violations
          .map(
            (v) =>
              `<li class="intent-${v.gate ? "gate" : "adv"}">` +
              `<code>${escapeHtml(v.code)}</code> ${escapeHtml(v.message)}` +
              `<span class="intent-tag">${v.gate ? "gating" : "advisory"}</span></li>`,
          )
          .join("") +
        `</ul>`
      : `<p class="intent-none">Every assertion in the brief holds.</p>`) +
    (feedback.length
      ? `<p class="intent-vh">Correction prompts <span class="intent-tag">--feedback</span></p>` +
        `<ul class="intent-list">${feedback.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
      : "");
}
