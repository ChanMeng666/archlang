#!/bin/sh
# Evidence: PlanScript's `assert rooms_connected` treats two rooms that merely SHARE A
# WALL as connected, so a sealed room passes. The one upstream test written to prove
# that doors establish connectivity uses three rooms that already share edges - it
# passes identically with both doors deleted. 46 tests are green.
#
# Usage: sh run.sh /path/to/planscript    Pinned: 6b0a0c08ec4e58ac8001681833fd03546cd144ab
# Part 2 (executed) needs the clone built: (cd <clone> && npm install) - node_modules,
# dist/ and the generated parser are all gitignored, so this leaves the tree clean.
set -eu
ROOT="${1:?usage: run.sh <path-to-planscript-clone>}"
V="$ROOT/src/validation/index.ts"
T="$ROOT/test/validation/validation.test.ts"
fail() { echo "EVIDENCE ABSENT: $1" >&2; exit 1; }

echo "== commit =="
git -C "$ROOT" rev-parse HEAD
git -C "$ROOT" log -1 --format='%ad' --date=short

echo
echo "== adjacency is seeded from shared edges, before doors are considered =="
grep -n 'if (polygonsShareEdge(rooms\[i\].polygon, rooms\[j\].polygon))' "$V" \
  || fail "the share-edge adjacency pass is gone"
sed -n '338,342p' "$V"
echo "  ...only THEN are doors added, and only as extra edges:"
grep -n 'Also consider doors as connections' "$V" || fail "the door pass moved"

echo
echo "== the same shape in the Rust port (validation.rs:463) =="
RS="$(dirname "$ROOT")/planscript-rust/planscript-rust/src/validation.rs"
if [ -f "$RS" ]; then
  grep -n 'if polygons_share_edge(&a.polygon, &b.polygon, 0.01) {' "$RS" \
    || echo "  (the Rust port's line moved - re-check)"
else
  echo "  (planscript-rust clone not found next to this one; skipping)"
fi

echo
echo "== the test that is supposed to prove doors matter =="
LN=$(grep -n "should consider doors as connections" "$T" | cut -d: -f1)
[ -n "$LN" ] || fail "the door-connectivity test is gone"
sed -n "$((LN + 2)),$((LN + 5))p" "$T"
echo "  -> living (0,0)-(10,10), kitchen (10,0)-(20,10), hall (20,0)-(30,10):"
echo "     each pair already shares a full edge, so the graph is connected"
echo "     before the door pass runs. The doors are decoration."

if ! [ -d "$ROOT/dist" ]; then
  echo
  echo "$ROOT/dist not built - skipping the executed half."
  echo "Run (cd \"$ROOT\" && npm install) first. Static evidence CONFIRMED."
  exit 0
fi

echo
echo "== executed: run the upstream suite, then delete the feature under test =="
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
ABS=$(cd "$ROOT" && pwd); command -v cygpath >/dev/null 2>&1 && ABS=$(cygpath -m "$ABS")
cat > "$TMP/probe.mjs" <<'JS'
import { pathToFileURL } from 'node:url';
const ROOT = pathToFileURL(process.argv[2]).href.replace(/\/?$/, '/');
const u = (p) => new URL(p, ROOT).href;
const { parse } = await import(u('dist/parser/index.js'));
const { lower } = await import(u('dist/lowering/index.js'));
const { generateGeometry } = await import(u('dist/geometry/index.js'));
const { validate } = await import(u('dist/validation/index.js'));
const V = (s) => { const l = lower(parse(s)); return validate(l, generateGeometry(l)); };

const WITH_DOORS = `
plan {
  footprint rect (0,0) (30,15)
  room living { rect (0,0) (10,10) }
  room kitchen { rect (10,0) (20,10) }
  room hall { rect (20,0) (30,10) }
  opening door d1 { between living and kitchen
    on shared_edge
    at 50%
    width 0.9 }
  opening door d2 { between kitchen and hall
    on shared_edge
    at 50%
    width 0.9 }
  assert rooms_connected
}`;
const NO_DOORS = WITH_DOORS.replace(/opening door[\s\S]*?width 0\.9 \}/g, '');
const e1 = V(WITH_DOORS).filter((e) => e.code === 'E801');
const e2 = V(NO_DOORS).filter((e) => e.code === 'E801');
console.log('  upstream plan, doors present -> E801 diagnostics:', e1.length);
console.log('  same plan, BOTH doors deleted -> E801 diagnostics:', e2.length);
const vacuous = e1.length === 0 && e2.length === 0;
console.log('  the assertion holds identically without the feature it tests:', vacuous);

console.log('  probes for the dead codes:');
const probes = {
  'self-intersecting bowtie ring        (E102?)':
    `plan { footprint rect (0,0) (20,20) room r { polygon (0,0) (10,10) (10,0) (0,10) } }`,
  'room landlocked inside another, no door (E420?)':
    `plan { footprint rect (0,0) (30,30) room outer { rect (0,0) (30,30) } room inner { rect (10,10) (20,20) } }`,
};
let leaked = false;
for (const [name, src] of Object.entries(probes)) {
  let codes;
  try { codes = V(src).map((e) => e.code); } catch (err) { codes = ['<threw: ' + err.message.slice(0, 50) + '>']; }
  if (codes.includes('E102') || codes.includes('E420')) leaked = true;
  console.log(`    ${name}: [${codes.join(', ') || 'NO DIAGNOSTICS'}]`);
}
if (leaked) { console.error('  a dead code fired - claim no longer holds'); process.exit(1); }
process.exit(vacuous ? 0 : 1);
JS
(cd "$ROOT" && npx --no-install vitest run test/validation/validation.test.ts 2>&1 | grep -E 'Tests |Test Files ' | sed 's/^/  upstream suite: /') || true
node "$TMP/probe.mjs" "$ABS" || fail "the probe did not reproduce the vacuous pass"

echo
echo "CONFIRMED (executed)"
