#!/bin/sh
# Evidence: ifc-lite's SVG drawing exporter stamps `new Date().toLocaleDateString()`
# into the title block, so the same model exported twice on different days - or on two
# machines with different locales or time zones - yields different bytes. The package's
# own "byte-identical SVG (compatibility guarantee)" test never enables the title block,
# and the sibling DXF writer takes determinism seriously in the same directory.
#
# Usage: sh run.sh /path/to/ifc-lite    Pinned: be110ecf0c41e8f6862da21b4d999ce0baaa787d
# Part 2 (executed) needs `tsx` on PATH (npm i -g tsx); no ifc-lite install required.
set -eu
ROOT="${1:?usage: run.sh <path-to-ifc-lite-clone>}"
E="$ROOT/packages/drawing-2d/src/svg-exporter.ts"
fail() { echo "EVIDENCE ABSENT: $1" >&2; exit 1; }

echo "== commit =="
git -C "$ROOT" rev-parse HEAD
git -C "$ROOT" log -1 --format='%ad' --date=short

echo
echo "== the wall clock reaches the drawing =="
grep -n 'new Date().toLocaleDateString()' "$E" || fail "the Date stamp is gone - claim no longer holds"
sed -n '500,503p' "$E"

echo
echo "== it is the ONLY non-determinism in the package's exporters =="
N=$(grep -rn 'new Date()\|Date.now()\|Math.random()' "$ROOT/packages/drawing-2d/src" \
    | grep -v '\.test\.ts' | wc -l | tr -d ' ')
echo "  clock/random references in packages/drawing-2d/src (excluding tests): $N"
[ "$N" -eq 1 ] || echo "  (note: count moved from 1 - re-read before citing)"

echo
echo "== the byte-identity test that does not cover it =="
grep -n 'byte-identical SVG (compatibility guarantee)' "$ROOT/packages/drawing-2d/src/svg-exporter.test.ts" \
  || fail "the byte-identity test is gone"
grep -n 'showTitleBlock = false' "$E" || fail "showTitleBlock no longer defaults to false"
T="$ROOT/packages/drawing-2d/src/svg-exporter.test.ts"
LN=$(grep -n 'byte-identical SVG (compatibility guarantee)' "$T" | cut -d: -f1)
BODY=$(sed -n "${LN},$((LN + 11))p" "$T")
echo "$BODY" | grep -q 'showTitleBlock' && fail "the byte-identity test now enables the title block"
echo "  -> its body never sets showTitleBlock, which defaults to false:"
echo "     the only byte-for-byte assertion in the file runs on the path that excludes the clock."
echo "  -> the two tests that DO render the title block assert on a regex-extracted scale label only:"
grep -n 'showTitleBlock: true' "$T" | sed 's/^/     /'
grep -n 'expect(extractScaleLabel' "$T" | sed 's/^/     /' 

echo
echo "== meanwhile, the DXF writer in the same package guards determinism explicitly =="
grep -rn 'deterministic' "$ROOT/packages/drawing-2d/src/dxf/writer.ts" | head -3

if ! command -v tsx >/dev/null 2>&1; then
  echo
  echo "tsx not on PATH - skipping the executed half. Static evidence CONFIRMED."
  exit 0
fi

echo
echo "== executed: export the same drawing under two different clocks =="
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/probe.mts" <<'JS'
import { pathToFileURL } from 'node:url';
const ROOT = pathToFileURL(process.argv[2]).href.replace(/\/?$/, '/');
const u = (p: string) => new URL(p, ROOT).href;
const { exportToSVG } = await import(u('packages/drawing-2d/src/svg-exporter.ts'));
const { PAPER_SIZES } = await import(u('packages/drawing-2d/src/styles.ts'));
const drawing: any = { lines: [], polygons: [], cutPolygons: [], texts: [], dimensions: [], annotations: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 4, y: 6 } } };
const opts: any = { paperSize: PAPER_SIZES.A3_LANDSCAPE, scale: { name: '1:100', factor: 100 }, showTitleBlock: true };
const RealDate = Date;
const at = (iso: string) => {
  (globalThis as any).Date = class extends RealDate {
    constructor(...a: any[]) { super(...((a.length ? a : [iso]) as [any])); }
  };
  const svg = exportToSVG(drawing, opts);
  (globalThis as any).Date = RealDate;
  return svg;
};
const a = at('2020-01-02T12:00:00Z'), b = at('2031-11-30T12:00:00Z');
const stamp = (s: string) => (s.match(/<text[^>]*font-size="7">(?!Date:)([^<]*)</) || [, '?'])[1];
console.log('  clock 2020-01-02 -> title block reads:', stamp(a));
console.log('  clock 2031-11-30 -> title block reads:', stamp(b));
console.log('  identical bytes:', a === b);
process.exit(a === b ? 1 : 0);
JS
ABS=$(cd "$ROOT" && pwd)
command -v cygpath >/dev/null 2>&1 && ABS=$(cygpath -m "$ABS")
tsx "$TMP/probe.mts" "$ABS"   || fail "the probe did not observe two different exports (see the output above)"

echo
echo "CONFIRMED (executed)"
