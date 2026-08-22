#!/bin/sh
# Evidence: PlanScript-Rust's solver is non-deterministic. `PlanState.placed` is a
# std::collections::HashMap (RandomState), and its unsorted iteration order reaches
# four decision sites. The project's own README/DESIGN/SOLVER call the pipeline
# "deterministic" and SOLVER.md 12 promises "stable iteration order (sort room IDs)".
# There is no determinism test in the repository.
#
# Usage: sh run.sh /path/to/planscript-rust [N]   Pinned: 6cf5060ad73f26e09bcdb4fe212af780bee2d11b
# Part 1 (static) always runs. Part 2 (executed) runs only if `cargo` is on PATH.
set -eu
ROOT="${1:?usage: run.sh <path-to-planscript-rust-clone> [runs]}"
N="${2:-30}"
C="$ROOT/planscript-rust"
fail() { echo "EVIDENCE ABSENT: $1" >&2; exit 1; }

echo "== commit =="
git -C "$ROOT" rev-parse HEAD
git -C "$ROOT" log -1 --format='%ad' --date=short

echo
echo "== the field is a std HashMap =="
grep -n 'use std::collections::{HashMap' "$C/src/solver.rs" || fail "std HashMap import moved"
grep -n 'pub placed: HashMap<String, PlacedRoom>' "$C/src/solver.rs" \
  || fail "PlanState.placed is no longer a HashMap - claim no longer holds"

echo
echo "== decision sites that consume its iteration order =="
echo "-- solver.rs:1317  repair_placement: the greedy pairwise-swap order --"
sed -n '1317p;1321,1322p' "$C/src/solver.rs"
grep -n 'let ids: Vec<String> = state.placed.keys().cloned().collect();' "$C/src/solver.rs" \
  || fail "repair_placement no longer seeds its swap order from .keys()"
echo "-- solver.rs:1580-1599  find_entry_room: four .find() calls, first match wins --"
grep -c 'state$' "$C/src/solver.rs" >/dev/null
FINDS=$(sed -n '1574,1600p' "$C/src/solver.rs" | grep -c '\.find(')
echo "   .find() calls over state.placed.values() in find_entry_room: $FINDS"
[ "$FINDS" -ge 3 ] || fail "find_entry_room no longer selects by iteration order"
echo "-- solver.rs:970  generate_candidates: candidate ORDER, resolved by max_by (last max wins) --"
grep -n 'let placed: Vec<&PlacedRoom> = state.placed.values().collect();' "$C/src/solver.rs" \
  || fail "generate_candidates no longer reads values() unsorted"
grep -n 'max_by(|a, b| a.score.partial_cmp(&b.score).unwrap())' "$C/src/solver.rs" \
  || fail "the best-candidate tie-break is no longer max_by"
echo "-- validation.rs:518  a HashSet serialized straight into the error JSON --"
grep -n 'json!(visited.into_iter().collect::<Vec<_>>())' "$C/src/validation.rs" \
  || fail "validation.rs no longer serializes an unsorted HashSet"

echo
echo "== the documented promise =="
grep -n 'stable iteration order (sort room IDs)' "$ROOT/SOLVER.md" || fail "SOLVER.md 12 changed"
grep -n 'Deterministic.*Same input always produces the same output' "$ROOT/AGENTS.md" || true

echo
echo "== there is no determinism test =="
T=$(grep -ril 'determinis' "$C/tests" "$C/src" 2>/dev/null | wc -l | tr -d ' ')
echo "  files under src/ or tests/ mentioning 'determinis': $T"
[ "$T" -eq 0 ] || fail "a determinism test may now exist - re-check"

if [ -z "${PLANSCRIPT_BIN:-}" ] && ! command -v cargo >/dev/null 2>&1; then
  echo
  echo "cargo not on PATH and PLANSCRIPT_BIN unset - skipping the executed half."
  echo "Static evidence CONFIRMED."
  exit 0
fi

echo
echo "== executed: solve each shipped intent $N times and count distinct outputs =="
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
BIN="${PLANSCRIPT_BIN:-}"
if [ -z "$BIN" ]; then
  if CARGO_TARGET_DIR="$TMP/target" cargo build --release --manifest-path "$C/Cargo.toml" >"$TMP/build.log" 2>&1; then
    BIN=$(ls "$TMP/target/release/planscript-rust" "$TMP/target/release/planscript-rust.exe" 2>/dev/null | head -1)
  else
    echo "  cargo build failed (toolchain/linker problem, not missing evidence):"
    tail -3 "$TMP/build.log" | sed 's/^/    /'
    echo "  Build it yourself and re-run with PLANSCRIPT_BIN=<path-to-binary>."
    echo
    echo "Static evidence CONFIRMED; executed half skipped."
    exit 0
  fi
fi
[ -n "$BIN" ] || fail "solver binary not produced"

WORST=0
for f in "$ROOT"/examples/*.intent.json; do
  b=$(basename "$f" .intent.json)
  : > "$TMP/hashes"
  i=0
  while [ "$i" -lt "$N" ]; do
    if "$BIN" solve "$f" --out "$TMP/out.psc" --no-svg >/dev/null 2>&1; then
      md5sum "$TMP/out.psc" | cut -d' ' -f1 >> "$TMP/hashes"
    fi
    i=$((i + 1))
  done
  runs=$(wc -l < "$TMP/hashes" | tr -d ' ')
  distinct=$(sort -u "$TMP/hashes" | wc -l | tr -d ' ')
  printf '  %-18s %s successful runs -> %s DISTINCT floor plans\n' "$b" "$runs" "$distinct"
  [ "$distinct" -gt "$WORST" ] && WORST="$distinct"
done

echo
echo "  worst case: $WORST distinct outputs from one unchanged input"
[ "$WORST" -gt 1 ] || fail "every run agreed - the solver now looks deterministic"

echo
echo "CONFIRMED (executed)"
