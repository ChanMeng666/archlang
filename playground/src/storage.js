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

export function readStr(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStr(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable / full — ignore */
  }
}

export function readJSON(key, fallback) {
  const raw = readStr(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    writeStr(key, JSON.stringify(value));
  } catch {
    /* non-serialisable — ignore */
  }
}
