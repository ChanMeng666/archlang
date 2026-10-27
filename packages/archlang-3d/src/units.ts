/**
 * Scene3D lengths are integer micrometres (plan §3.4): a plan coordinate in millimetres is
 * multiplied by 1000 and rounded ONCE, at the adapter's edge, so every later stage works on
 * integers and a last-ulp difference between engines is absorbed here. Rounding is half away
 * from zero, symmetric about the origin, and never yields `-0`.
 */
export function um(mm: number): number {
  const v = mm * 1000;
  const r = v < 0 ? -Math.round(-v) : Math.round(v);
  return r === 0 ? 0 : r;
}

/** A plan point as a Scene3D `[x, y]` pair in micrometres (plan axes: x right, y down). */
export function umPoint(p: { x: number; y: number }): [number, number] {
  return [um(p.x), um(p.y)];
}
