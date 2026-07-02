/**
 * Thin, defensive localStorage helpers. Every access is wrapped: private-mode,
 * disabled storage, or quota errors degrade to a no-op / fallback rather than
 * breaking the editor. Keys are namespaced under `archlang.pg.*`.
 */

const PREFIX = "archlang.pg.";

export const KEYS = {
  source: PREFIX + "source",
  snapshots: PREFIX + "snapshots",
  split: PREFIX + "split",
  theme: PREFIX + "theme",
  lintProfile: PREFIX + "lintProfile",
};

export function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStr(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable / full — ignore */
  }
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = readStr(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    writeStr(key, JSON.stringify(value));
  } catch {
    /* non-serialisable — ignore */
  }
}
