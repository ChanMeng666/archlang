/**
 * The 16-gon's exact table, shared by the T0 generators (`t0.ts`: round sections) and the contact
 * shadows' corner fans (`replay/shadows.ts`, card RM8.8). Pure, browser-safe, no import.
 */

/** cos/sin at k × 22.5°, written out so no engine's last ulp reaches a coordinate. */
export const C16 = [
  1,
  0.9238795325112867,
  Math.SQRT1_2,
  0.3826834323650898,
  0,
  -0.3826834323650898,
  -Math.SQRT1_2,
  -0.9238795325112867,
  -1,
  -0.9238795325112867,
  -Math.SQRT1_2,
  -0.3826834323650898,
  0,
  0.3826834323650898,
  Math.SQRT1_2,
  0.9238795325112867,
];
export const S16 = C16.map((_, k) => C16[(k + 12) % 16] as number);
