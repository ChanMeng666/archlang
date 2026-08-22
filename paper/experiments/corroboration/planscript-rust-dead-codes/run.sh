#!/bin/sh
# Evidence: PlanScript-Rust declares 20 error codes; three of them (E101, E102, E420)
# have zero raise sites anywhere in src/ or tests/. Two of the three are inherited
# from the TypeScript original, which has four dead codes (E101, E102, E311, E420).
# Usage: sh run.sh /path/to/planscript-rust   Pinned: 6cf5060ad73f26e09bcdb4fe212af780bee2d11b
set -eu
ROOT="${1:?usage: run.sh <path-to-planscript-rust-clone>}"
C="$ROOT/planscript-rust"
fail() { echo "EVIDENCE ABSENT: $1" >&2; exit 1; }

echo "== commit =="
git -C "$ROOT" rev-parse HEAD
git -C "$ROOT" log -1 --format='%ad' --date=short

echo
echo "== every ErrorCode variant, and how many times it is CONSTRUCTED =="
# Declaration sites are the `#[serde(rename=...)]` enum body and the as_str() match arms
# (which use `Self::`), so a real raise site is any `ErrorCode::<Variant>` reference.
VARIANTS=$(sed -n '/^pub enum ErrorCode {/,/^}/p' "$C/src/validation.rs" \
           | grep -Ev '#\[serde|pub enum|^}' | tr -d ' ,' | grep -E '^[A-Z]')
[ -n "$VARIANTS" ] || fail "could not parse the ErrorCode enum"
DEAD=""
for v in $VARIANTS; do
  n=$(grep -rho "ErrorCode::$v\b" "$C/src" "$C/tests" 2>/dev/null | wc -l | tr -d ' ')
  printf '  %-34s construction sites = %s\n' "$v" "$n"
  [ "$n" -eq 0 ] && DEAD="$DEAD $v"
done

echo
echo "== dead codes (declared, never constructed) ==$DEAD"
for want in PolygonNotClosed PolygonSelfIntersecting RoomNoAccess; do
  echo "$DEAD" | grep -q " $want\b" || fail "$want now HAS a raise site - claim no longer holds"
done
echo "  -> E101 PolygonNotClosed, E102 PolygonSelfIntersecting, E420 RoomNoAccess: all dead"

echo
echo "== E420 is documented as a 'typical compiler error' in DESIGN.md =="
grep -n 'E420 room has no access' "$ROOT/DESIGN.md" || fail "DESIGN.md no longer documents E420"

echo
echo "CONFIRMED"
