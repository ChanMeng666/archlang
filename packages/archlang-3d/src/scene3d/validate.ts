/**
 * The Scene3D v0 validator: zero dependencies, so it runs in the browser bundle. It checks what
 * `scene3d.schema.json` states (shapes, integer micrometres, enums, no unknown keys) and what a
 * JSON Schema cannot (ids unique per collection and level, each opening's host a wall of its
 * level, each wall's `cuts` an opening of its level). `test/scene3d-schema.test.ts` holds this
 * validator and the schema to the same verdicts on the corpus and on planted faults.
 */

export interface ValidationIssue {
  path: string;
  message: string;
}

type Obj = Record<string, unknown>;
type Check = (v: unknown, path: string, out: ValidationIssue[]) => void;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (out: ValidationIssue[], path: string, message: string): void => {
  out.push({ path, message });
};

const integer: Check = (v, p, out) => {
  if (!Number.isInteger(v)) fail(out, p, "must be an integer (micrometres)");
};
const number: Check = (v, p, out) => {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(out, p, "must be a finite number");
};
const string: Check = (v, p, out) => {
  if (typeof v !== "string") fail(out, p, "must be a string");
};
const id: Check = (v, p, out) => {
  if (typeof v !== "string" || v.length === 0) fail(out, p, "must be a non-empty string");
};
const boolean: Check = (v, p, out) => {
  if (typeof v !== "boolean") fail(out, p, "must be a boolean");
};
const any: Check = () => {};
const record: Check = (v, p, out) => {
  if (!isObj(v)) fail(out, p, "must be an object");
};
const oneOf =
  (...values: readonly unknown[]): Check =>
  (v, p, out) => {
    if (!values.includes(v)) fail(out, p, `must be one of ${values.map((x) => JSON.stringify(x)).join(", ")}`);
  };
const either =
  (...checks: Check[]): Check =>
  (v, p, out) => {
    const ok = checks.some((c) => {
      const tmp: ValidationIssue[] = [];
      c(v, p, tmp);
      return tmp.length === 0;
    });
    if (!ok) fail(out, p, "matches none of the allowed forms");
  };
const array =
  (item: Check, min = 0, max = Number.POSITIVE_INFINITY): Check =>
  (v, p, out) => {
    if (!Array.isArray(v)) return fail(out, p, "must be an array");
    if (v.length < min) fail(out, p, `must have at least ${min} items`);
    if (v.length > max) fail(out, p, `must have at most ${max} items`);
    v.forEach((x, i) => {
      item(x, `${p}/${i}`, out);
    });
  };
const object =
  (required: Record<string, Check>, optional: Record<string, Check> = {}): Check =>
  (v, p, out) => {
    if (!isObj(v)) return fail(out, p, "must be an object");
    for (const [k, c] of Object.entries(required)) {
      if (!(k in v)) fail(out, `${p}/${k}`, "is required");
      else c(v[k], `${p}/${k}`, out);
    }
    for (const [k, c] of Object.entries(optional)) if (k in v) c(v[k], `${p}/${k}`, out);
    for (const k of Object.keys(v)) {
      if (!(k in required) && !(k in optional)) fail(out, `${p}/${k}`, "is not a Scene3D field");
    }
  };

const pt = array(integer, 2, 2);
const ring = array(pt, 3);
const polygon = object({ outer: ring }, { holes: array(ring) });
const provenance = oneOf("authored", "derived", "default", "user-param");
const source = object({ kind: string, id: string }, { span: array(integer, 2, 2) });
const sized = (a: string, b: string): Check => object({ [a]: integer, [b]: integer });
const box = object({ id, source, at: pt, size: sized("w", "h") });

const LEVEL_COLLECTIONS: Record<string, Check> = {
  floors: array(object({ id, source, polygon }, { uses: array(string) })),
  walls: array(
    object(
      {
        id,
        source,
        footprint: array(polygon),
        body: array(polygon),
        height: integer,
        thickness: integer,
        cuts: array(string),
      },
      { category: string, material: string },
    ),
  ),
  openings: array(
    object(
      {
        id,
        source,
        kind: oneOf("door", "window", "opening"),
        host: string,
        cut: ring,
        centre: pt,
        jambs: array(pt, 2, 2),
        width: integer,
        sill: integer,
        head: integer,
      },
      {
        doorKind: oneOf("hinged", "sliding", "barn", "bifold", "pocket", "garage", "double"),
        leaves: array(array(pt, 2, 2)),
        hinge: oneOf("left", "right"),
        swing: oneOf("in", "out"),
        slide: oneOf("left", "right"),
      },
    ),
  ),
  furniture: array(
    object(
      { id, source, category: string, centre: pt, size: sized("w", "d"), yawDeg: integer, asset: string },
      { room: string },
    ),
  ),
  stairs: array(object({ id, source, box, dir: oneOf("up", "down"), width: integer })),
  voids: array(box),
  columns: array(box),
  outdoor: array(object({ id, source, surface: string, polygon }, { rail: array(string) })),
  fences: array(object({ id, source, style: string, points: array(pt, 2), closed: boolean })),
  roofs: array(object({ id, source, form: oneOf("flat"), ring, provenance })),
};

const level = object(
  { level: integer, elevation: integer, storeyHeight: integer, footprint: array(ring), ...LEVEL_COLLECTIONS },
  { name: string },
);

const scene = object({
  version: oneOf(0),
  kind: oneOf("scene3d"),
  meta: object(
    {
      name: string,
      units: oneOf("mm"),
      tool: object({ archlang3d: string, archlang: string }),
      assumptions: array(object({ kind: string, field: string, value: any, provenance, rule: string }, { id: string })),
    },
    { north: either(oneOf("up", "down", "left", "right"), number), siteBoundary: ring, params: record },
  ),
  levels: array(level, 1),
});

/** The references a JSON Schema cannot state: unique ids, hosts and cuts that resolve. */
function references(v: Obj, out: ValidationIssue[]): void {
  const levels = Array.isArray(v.levels) ? v.levels : [];
  levels.forEach((lv, li) => {
    if (!isObj(lv)) return;
    const ids = (k: string): string[] =>
      (Array.isArray(lv[k]) ? (lv[k] as unknown[]) : []).map((e) => (isObj(e) ? String(e.id) : ""));
    for (const k of Object.keys(LEVEL_COLLECTIONS)) {
      const seen = new Set<string>();
      ids(k).forEach((x, i) => {
        if (seen.has(x)) fail(out, `/levels/${li}/${k}/${i}/id`, `duplicates id "${x}" in ${k}`);
        seen.add(x);
      });
    }
    const walls = new Set(ids("walls"));
    const openings = new Set(ids("openings"));
    (Array.isArray(lv.openings) ? lv.openings : []).forEach((o, i) => {
      if (isObj(o) && !walls.has(String(o.host))) {
        fail(out, `/levels/${li}/openings/${i}/host`, `names no wall of this level ("${String(o.host)}")`);
      }
    });
    (Array.isArray(lv.walls) ? lv.walls : []).forEach((w, i) => {
      if (!isObj(w) || !Array.isArray(w.cuts)) return;
      w.cuts.forEach((c, j) => {
        if (!openings.has(String(c)))
          fail(out, `/levels/${li}/walls/${i}/cuts/${j}`, `names no opening ("${String(c)}")`);
      });
    });
  });
}

/** Every way `v` is not a valid Scene3D v0; `[]` when it is. */
export function validateScene3D(v: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  scene(v, "", out);
  if (isObj(v)) references(v, out);
  return out;
}
