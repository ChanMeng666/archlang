#!/bin/sh
# Evidence: PlanScript (TypeScript) `isPolygonClosed` returns true unconditionally,
# and error code E101 (POLYGON_NOT_CLOSED) has zero raise sites.
# Usage: sh run.sh /path/to/planscript      Pinned: 6b0a0c08ec4e58ac8001681833fd03546cd144ab
set -eu
ROOT="${1:?usage: run.sh <path-to-planscript-clone>}"
V="$ROOT/src/validation/index.ts"
fail() { echo "EVIDENCE ABSENT: $1" >&2; exit 1; }

echo "== commit =="
git -C "$ROOT" rev-parse HEAD
git -C "$ROOT" log -1 --format='%ad' --date=short

echo
echo "== src/validation/index.ts:48-54 =="
sed -n '48,54p' "$V"

echo
echo "== the two locals and the epsilon parameter are computed and then discarded =="
BODY=$(sed -n '48,54p' "$V")
echo "$BODY" | grep -q 'const first = points\[0\]' || fail "'const first' not in the body"
echo "$BODY" | grep -q 'const last = points\[points.length - 1\]' || fail "'const last' not in the body"
# after the two declarations (lines 50-51) nothing in the body reads first/last/epsilon
TAIL=$(sed -n '52,54p' "$V")
echo "$TAIL" | grep -Eq 'first|last|epsilon' && fail "first/last/epsilon ARE read - claim no longer holds"
echo "  -> first, last and epsilon are never read after being bound: OK"
echo "$TAIL" | grep -q 'return true;' || fail "the body no longer ends in an unconditional 'return true'"
echo "  -> the only exit for a >=3-point polygon is an unconditional 'return true': OK"

echo
echo "== the function is also never called =="
CALLS=$(grep -c 'isPolygonClosed(' "$V")
echo "  isPolygonClosed( occurrences in the whole repo: $CALLS (1 = the declaration only)"
[ "$CALLS" -eq 1 ] || fail "expected exactly 1 occurrence (declaration), got $CALLS"

echo
echo "== E101 declared, never raised =="
grep -rn "POLYGON_NOT_CLOSED" "$ROOT/src" || fail "E101 constant missing"
RAISES=$(grep -rn "ErrorCodes.POLYGON_NOT_CLOSED" "$ROOT/src" | wc -l | tr -d ' ')
echo "  raise sites (ErrorCodes.POLYGON_NOT_CLOSED): $RAISES"
[ "$RAISES" -eq 0 ] || fail "E101 now has $RAISES raise site(s) - claim no longer holds"

echo
echo "== and it is documented as a 'typical compiler error' =="
grep -n 'E101 polygon not closed' "$ROOT/DESIGN.md" || fail "DESIGN.md no longer documents E101"

echo
echo "CONFIRMED"
