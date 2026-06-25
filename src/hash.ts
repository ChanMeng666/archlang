/**
 * FNV-1a — a tiny, fast, deterministic non-cryptographic string hash, used to
 * key the per-stage memo caches (lex → tokens, parse → ast). The length is
 * appended to make accidental collisions vanishingly unlikely; callers that need
 * certainty also verify the source matches on a cache hit.
 */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + s.length.toString(36);
}
