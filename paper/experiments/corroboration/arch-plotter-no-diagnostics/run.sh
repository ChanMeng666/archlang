#!/bin/sh
# Evidence: arch-plotter has no diagnostic mechanism at all - zero panic/assert calls
# across all five source files - and its "CRASH-PROOF SAFETY NET" explicitly converts a
# misspelled anchor name into a silent no-op. A one-character typo therefore compiles
# with exit 0 to a DIFFERENT drawing. Its two "tests" cannot even be compiled, and
# there is no CI.
#
# Usage: sh run.sh /path/to/arch-plotter   Pinned: 63cbd2e72829f940ef99a0d01cab646009076b9d
# Part 2 (executed) needs `typst` on PATH.
set -eu
ROOT="${1:?usage: run.sh <path-to-arch-plotter-clone>}"
fail() { echo "EVIDENCE ABSENT: $1" >&2; exit 1; }

echo "== commit =="
git -C "$ROOT" rev-parse HEAD
git -C "$ROOT" log -1 --format='%ad' --date=short

echo
echo "== no diagnostic mechanism exists =="
TOTAL=0
for f in "$ROOT"/src/*.typ "$ROOT"/lib.typ; do
  n=$(grep -c 'panic(\|assert(\|assert\.' "$f" || true)
  l=$(wc -l < "$f" | tr -d ' ')
  printf '  %-28s %6s lines   panic/assert = %s\n' "$(basename "$f")" "$l" "$n"
  TOTAL=$((TOTAL + n))
done
echo "  TOTAL panic/assert calls in the whole library: $TOTAL"
[ "$TOTAL" -eq 0 ] || fail "the library now raises $TOTAL diagnostic(s) - claim no longer holds"

echo
echo "== the 'CRASH-PROOF SAFETY NET' (src/Arch.typ:1443-1446) =="
grep -n 'CRASH-PROOF SAFETY NET' "$ROOT/src/Arch.typ" || fail "the comment is gone"
sed -n '1441,1447p' "$ROOT/src/Arch.typ"
echo
echo "  the branch it guards: a VALID anchor name snaps (Arch.typ:1409),"
grep -n 'if type(val) == str and val in anchors {' "$ROOT/src/Arch.typ" || fail "anchor-snapping branch moved"
echo "  an INVALID one falls through to a zero-length move with no message."

echo
echo "== the two 'tests' cannot be compiled (wrong relative import root, no runner, no CI) =="
ls "$ROOT/tests"
head -1 "$ROOT/tests/test1" | sed 's/^/  test1 line 1: /'
head -3 "$ROOT/tests/test2" | tail -1 | sed 's/^/  test2 line 3: /'
[ -d "$ROOT/.github" ] && fail "a CI directory now exists - re-check" || echo "  no .github/ directory: there is no CI"

if ! command -v typst >/dev/null 2>&1; then
  echo
  echo "typst not on PATH - skipping the executed half. Static evidence CONFIRMED."
  exit 0
fi

echo
echo "== executed: the shipped tests do not compile =="
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
for t in test1 test2; do
  if typst compile --root "$ROOT" "$ROOT/tests/$t" "$TMP/$t.pdf" >"$TMP/$t.log" 2>&1; then
    fail "tests/$t compiles now - re-check"
  fi
  MSG=$(head -1 "$TMP/$t.log")
  echo "  tests/$t: typst compile FAILS -> $MSG"
  echo "$MSG" | grep -q 'file not found'     || fail "tests/$t fails for a reason other than its bad relative import path"
done

echo
echo "== executed: a one-character typo compiles clean to a different drawing =="
ABS=$(cd "$ROOT" && pwd); command -v cygpath >/dev/null 2>&1 && ABS=$(cygpath -m "$ABS")
# Typst needs the source inside --root, so use the filesystem root that contains both.
CASE_ROOT="$TMP"
cp -r "$ROOT" "$TMP/lib-under-test"
cat > "$TMP/good.typ" <<'TYP'
#import "/lib-under-test/lib.typ": *
#set page(width: auto, height: auto, margin: 1cm)
#arch-canvas(scale: 0.4cm, {
  draw-walls(trace-walls(start: (0,0), align: "left", thickness: 0.75,
    (R(20), mark("a"), U(12), mark("b"), L(20), C(), home(),
     JU(6), mark("mid"), R("b"))))
})
TYP
sed 's/R("b")/R("bb")/' "$TMP/good.typ" > "$TMP/typo.typ"
echo "  the only difference between the two sources:"
diff "$TMP/good.typ" "$TMP/typo.typ" | sed 's/^/    /' || true

for f in good typo; do
  typst compile --root "$CASE_ROOT" --format svg "$TMP/$f.typ" "$TMP/$f.svg" >"$TMP/$f.log" 2>&1 \
    || { echo "  $f: compile FAILED:"; sed 's/^/    /' "$TMP/$f.log"; fail "$f did not compile"; }
  echo "  $f.typ: typst exit 0, no diagnostics ($(wc -c < "$TMP/$f.svg" | tr -d ' ') bytes of SVG)"
done
# control: the compiler itself is deterministic, so any difference is the typo's doing
typst compile --root "$CASE_ROOT" --format svg "$TMP/good.typ" "$TMP/good2.svg" >/dev/null 2>&1
H1=$(md5sum "$TMP/good.svg" | cut -d' ' -f1)
H2=$(md5sum "$TMP/good2.svg" | cut -d' ' -f1)
H3=$(md5sum "$TMP/typo.svg" | cut -d' ' -f1)
echo "  control - same source compiled twice: $([ "$H1" = "$H2" ] && echo 'IDENTICAL (compiler is deterministic)' || echo 'DIFFERENT - control failed')"
[ "$H1" = "$H2" ] || fail "typst output is not reproducible; the control is invalid"
echo "  typo'd source vs correct source:      $([ "$H1" = "$H3" ] && echo 'identical' || echo 'DIFFERENT DRAWING, zero diagnostics')"
[ "$H1" = "$H3" ] && fail "the typo produced the same drawing - claim no longer holds" || true

echo
echo "CONFIRMED (executed)"
