// Plan JSON -> GeoJSON (RFC 7946). A recipe, not a plugin: it reads the document `compile -f json`
// writes and imports nothing, so copy it and change what you need.
// Usage: node plan_to_geojson.mjs plan.json [out.geojson]    (stdout without an output file)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The plan's millimetres, y down, as local metres, y up. RFC 7946 §11.2: six decimals is a micrometre. */
const position = (p) => [Math.round(p.x * 1000) / 1e6, -Math.round(p.y * 1000) / 1e6 + 0];

/** Twice the signed area of a ring of positions, positive when it runs counter-clockwise (y up). */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum;
}

/**
 * A closed ring of positions, counter-clockwise as RFC 7946 §3.1.6 asks of an exterior ring. The
 * document's rings are open, but one a person wrote may already end where it starts.
 */
function exteriorRing(points) {
  const ring = points.map(position);
  const closed = ring.length > 1 && ring[0].every((v, i) => v === ring[ring.length - 1][i]);
  if (ring.length > 0 && !closed) ring.push(ring[0]);
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

const polygon = (points) => ({ type: "Polygon", coordinates: [exteriorRing(points)] });

const rectangle = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/**
 * The points of an arc edge from `a` to `b`, with neither end included. GeoJSON has no curve, so
 * an arc is flattened, one chord per 7.5 degrees, at least 8, which is the rule the core draws by.
 * The centre is on the chord's perpendicular bisector. In the plan's y-down coordinates `(-dy, dx)`
 * is 90 degrees clockwise from the direction of travel, and `cw` keeps the centre on that side, so
 * `major`, the long way round, swaps it.
 */
export function flattenArc(a, b, { radius, dir = "ccw", major = false }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  const half = chord / 2;
  const side = (dir === "cw") !== major ? 1 : -1;
  const k = (side * Math.sqrt(Math.max(0, radius * radius - half * half))) / chord;
  const c = { x: (a.x + b.x) / 2 - dy * k, y: (a.y + b.y) / 2 + dx * k };
  const minor = 2 * Math.asin(Math.min(1, half / radius));
  const sweep = (dir === "cw" ? 1 : -1) * (major ? 2 * Math.PI - minor : minor);
  const start = Math.atan2(a.y - c.y, a.x - c.x);
  const steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24) - 1e-9));
  const out = [];
  for (let i = 1; i < steps; i++) {
    const t = start + (sweep * i) / steps;
    out.push({ x: c.x + radius * Math.cos(t), y: c.y + radius * Math.sin(t) });
  }
  return out;
}

/** A wall's centreline as a list of points: `arc` says the edge arriving at a point is curved. */
function wallLine(wall) {
  const out = [];
  (wall.points ?? []).forEach((p, i) => {
    if (p.arc && i > 0) out.push(...flattenArc(wall.points[i - 1], p, p.arc));
    out.push(p);
  });
  const first = out[0];
  const last = out[out.length - 1];
  if (wall.closed && out.length > 1 && (first.x !== last.x || first.y !== last.y)) out.push(first);
  return out;
}

const feature = (layer, geometry, properties) => ({
  type: "Feature",
  geometry,
  properties: { layer, ...properties },
});

/** Drop the keys with no value, so a reader sees only what the plan says. */
const present = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** A row a flattened `place` left in plan coordinates is a row like any other here. */
export function planToGeoJson(plan) {
  if (plan.version !== undefined && plan.version !== 1) throw new Error(`Plan JSON version ${plan.version} is not 1`);
  const features = [];
  for (const r of plan.rooms ?? []) {
    const geometry = polygon(r.floor_polygon ?? r.polygon ?? rectangle(r.x, r.y, r.width, r.height));
    // RFC 7946 §3.1.6: a ring has at least four positions, so fewer is no polygon.
    if (geometry.coordinates[0].length < 4) continue;
    features.push(
      feature(
        "room",
        geometry,
        present({ id: r.id, label: r.label, room_type: r.room_type, uses: r.uses, area_m2: r.area }),
      ),
    );
  }
  for (const w of plan.walls ?? []) {
    const line = wallLine(w);
    // RFC 7946 §3.1.4: a LineString has two positions or more, so one point is no wall.
    if (line.length < 2) continue;
    features.push(
      feature(
        "wall",
        { type: "LineString", coordinates: line.map(position) },
        present({ id: w.id, category: w.category, thickness_mm: w.thickness, status: w.status }),
      ),
    );
  }
  // Written out, an opening has its centre; one a person wrote may hold only `on` or `relation`.
  for (const o of plan.openings ?? []) {
    if (o.x === undefined || o.y === undefined) continue;
    features.push(
      feature(
        "opening",
        { type: "Point", coordinates: position(o) },
        present({
          id: o.id,
          kind: o.kind,
          width_mm: o.width,
          door_kind: o.door_kind,
          window_kind: o.window_kind,
          wall: o.wall,
        }),
      ),
    );
  }
  for (const f of plan.furniture ?? []) {
    if (f.x === undefined || f.width === undefined) continue;
    features.push(
      feature(
        "furniture",
        polygon(rectangle(f.x, f.y, f.width, f.height)),
        present({ id: f.id, category: f.category, room: f.room, rotate: f.rotate }),
      ),
    );
  }
  for (const c of plan.columns ?? []) {
    features.push(feature("column", polygon(rectangle(c.x, c.y, c.width, c.height)), present({ id: c.id })));
  }
  return {
    type: "FeatureCollection",
    // Foreign members (RFC 7946 §6.1). `walls_derived`: the document holds `walls from rooms` as the
    // statement, so those walls are not in `walls`, and not here: read `describe().derived_walls`.
    name: plan.plan,
    units: "m",
    ...(plan.walls_from_rooms ? { walls_derived: true } : {}),
    features,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, out] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node plan_to_geojson.mjs <plan.json> [out.geojson]");
    process.exit(3);
  }
  const text = `${JSON.stringify(planToGeoJson(JSON.parse(readFileSync(file, "utf8"))), null, 2)}\n`;
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
}
