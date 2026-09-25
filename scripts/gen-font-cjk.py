#!/usr/bin/env python3
"""
Generate packages/font-cjk/ArchLangCJKSans-Regular.otf — the optional CJK face the
PDF and PNG backends fall back to (issue #107). Run it with `npm run gen:font-cjk`.

It is deliberately NOT part of `gen:all` / `check:drift`: it needs the network and a
pinned Python fonttools, neither of which the drift gate may assume. Its output is a
committed binary, and its SHA-256 is recorded beside it in
`ArchLangCJKSans-Regular.otf.sha256` (a test pins the committed font to that file).

The recipe, every input of which is pinned:

  1. Download `Sans/OTC/NotoSansCJK-Regular.ttc` and `Sans/LICENSE` from notofonts/noto-cjk
     at commit UPSTREAM_COMMIT, and verify each file's SHA-256.
  2. Extract face index 2 of the collection (Noto Sans CJK SC).
  3. Derive the character set: the union of GB 2312, Big5, JIS X 0208 and KS X 1001
     (every double-byte cell each codec decodes, via Python's own codecs), whose SHA-256
     is pinned too, so a codec change in a future Python fails loudly instead of quietly
     changing the font.
  4. Subset with pyftsubset: that text, plus U+0020-007E (ASCII), U+00A0-024F (Latin-1
     and Latin Extended-A/B), U+2000-206F (general punctuation), U+3000-30FF (CJK
     punctuation, hiragana, katakana), U+FF00-FFEF (half/fullwidth forms) and
     U+AC00-D7A3 (all 11,172 Hangul syllables), with every layout feature kept. Name
     IDs are all retained here (pyftsubset keeps only 0-6 by default) so the copyright,
     trademark notice and licence records survive into step 5.
  5. Rename. "Noto" is a trademark of Google Inc. (name ID 7), so the subset must not be
     called Noto: the family becomes "ArchLang CJK Sans" / `ArchLangCJKSans-Regular`
     (name IDs 1, 3, 4, 6, 16, 17 and the CFF font name). The copyright (ID 0), the
     trademark notice (ID 7), the designer/vendor credits and the OFL licence (IDs 13/14)
     are kept, and ID 10 (description) credits the source. There is no Reserved Font
     Name, so OFL-1.1 permits the modified font under a new name.

Timestamps are never recalculated, so the output is a pure function of the inputs.

Usage:
  python scripts/gen-font-cjk.py [--source-ttc PATH] [--out-dir DIR]

`--source-ttc` reuses an already-downloaded TTC (its SHA-256 is still verified);
`--out-dir` writes somewhere other than packages/font-cjk (used to prove determinism).
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
import urllib.request

FONTTOOLS_VERSION = "4.63.0"

UPSTREAM_REPO = "notofonts/noto-cjk"
UPSTREAM_COMMIT = "f8d157532fbfaeda587e826d4cd5b21a49186f7c"
RAW = f"https://raw.githubusercontent.com/{UPSTREAM_REPO}/{UPSTREAM_COMMIT}"
TTC_URL = f"{RAW}/Sans/OTC/NotoSansCJK-Regular.ttc"
TTC_SHA256 = "b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a"
LICENSE_URL = f"{RAW}/Sans/LICENSE"
LICENSE_SHA256 = "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2"

# Face index 2 of NotoSansCJK-Regular.ttc is Noto Sans CJK SC (0 JP, 1 KR, 2 SC, 3 TC, 4 HK).
SC_FACE_INDEX = 2
SC_FACE_PS_NAME = "NotoSansCJKsc-Regular"

# 20,273 characters: the GB 2312 ∪ Big5 ∪ JIS X 0208 ∪ KS X 1001 union, sorted, UTF-8.
CHARSET_SHA256 = "c67b72b930fad79af30c38fdf1f9379789560a81034535530c99b6147a617104"
CHARSET_SIZE = 20273

UNICODES = "U+0020-007E,U+00A0-024F,U+2000-206F,U+3000-30FF,U+FF00-FFEF,U+AC00-D7A3"

FAMILY = "ArchLang CJK Sans"
STYLE = "Regular"
PS_NAME = "ArchLangCJKSans-Regular"
DESCRIPTION = (
    "ArchLang CJK Sans is a subset of Noto Sans CJK SC 2.004 (face 2 of "
    f"NotoSansCJK-Regular.ttc from github.com/{UPSTREAM_REPO} at commit {UPSTREAM_COMMIT}), "
    "renamed because Noto is a trademark of Google Inc. It covers GB 2312, Big5, JIS X 0208, "
    "KS X 1001, all Hangul syllables, kana, Latin, punctuation and fullwidth forms. "
    "Licensed under the SIL Open Font License 1.1."
)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_OUT_DIR = os.path.join(ROOT, "packages", "font-cjk")
OUT_NAME = PS_NAME + ".otf"


def fail(msg: str) -> None:
    print(f"gen-font-cjk: {msg}", file=sys.stderr)
    sys.exit(1)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, expected: str) -> bytes:
    print(f"gen-font-cjk: downloading {url}")
    with urllib.request.urlopen(url) as r:  # noqa: S310 — a pinned https URL
        data = r.read()
    got = sha256(data)
    if got != expected:
        fail(f"SHA-256 mismatch for {url}\n  expected {expected}\n  got      {got}")
    return data


def dbcs(codec: str, lead: range, trail: list[int]) -> set[str]:
    """Every character a double-byte codec decodes from one lead/trail byte pair."""
    out: set[str] = set()
    for a in lead:
        for b in trail:
            try:
                t = bytes([a, b]).decode(codec)
            except UnicodeDecodeError:
                continue
            if len(t) == 1:
                out.add(t)
    return out


def charset() -> str:
    euc = list(range(0xA1, 0xFF))
    gb2312 = dbcs("gb2312", range(0xA1, 0xFF), euc)
    big5 = dbcs("big5", range(0x81, 0xFF), list(range(0x40, 0x7F)) + euc)
    jisx0208 = dbcs("euc_jp", range(0xA1, 0xFF), euc)  # the two-byte EUC-JP plane IS JIS X 0208
    ksx1001 = dbcs("euc_kr", range(0xA1, 0xFF), euc)
    text = "".join(sorted(gb2312 | big5 | jisx0208 | ksx1001))
    if len(text) != CHARSET_SIZE:
        fail(f"charset has {len(text)} characters, expected {CHARSET_SIZE} (Python codec change?)")
    got = sha256(text.encode("utf-8"))
    if got != CHARSET_SHA256:
        fail(f"charset SHA-256 mismatch (Python codec change?)\n  expected {CHARSET_SHA256}\n  got      {got}")
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-ttc", help="reuse a local NotoSansCJK-Regular.ttc (SHA-256 still verified)")
    ap.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="where to write the font, LICENSE and .sha256")
    args = ap.parse_args()

    try:
        import fontTools
        from fontTools import subset
        from fontTools.ttLib import TTFont
    except ImportError:
        fail(f"needs fonttools: pip install fonttools=={FONTTOOLS_VERSION}")
    if fontTools.version != FONTTOOLS_VERSION:
        fail(f"needs fonttools=={FONTTOOLS_VERSION} (found {fontTools.version}): pip install fonttools=={FONTTOOLS_VERSION}")

    text = charset()
    os.makedirs(args.out_dir, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="archlang-font-cjk-") as tmp:
        ttc = os.path.join(tmp, "NotoSansCJK-Regular.ttc")
        if args.source_ttc:
            with open(args.source_ttc, "rb") as f:
                data = f.read()
            if sha256(data) != TTC_SHA256:
                fail(f"--source-ttc SHA-256 mismatch: expected {TTC_SHA256}, got {sha256(data)}")
        else:
            data = fetch(TTC_URL, TTC_SHA256)
        with open(ttc, "wb") as f:
            f.write(data)
        licence = fetch(LICENSE_URL, LICENSE_SHA256)

        # 2. Extract the SC face.
        sc = os.path.join(tmp, "sc-full.otf")
        face = TTFont(ttc, fontNumber=SC_FACE_INDEX, recalcTimestamp=False, lazy=False)
        if face["name"].getDebugName(6) != SC_FACE_PS_NAME:
            fail(f"face {SC_FACE_INDEX} is {face['name'].getDebugName(6)!r}, expected {SC_FACE_PS_NAME!r}")
        face.save(sc)
        face.close()

        # 3-4. Subset with the pinned recipe.
        charset_file = os.path.join(tmp, "charset.txt")
        with open(charset_file, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        subsetted = os.path.join(tmp, "subset.otf")
        subset.main(
            [
                sc,
                f"--text-file={charset_file}",
                f"--unicodes={UNICODES}",
                "--layout-features=*",
                "--name-IDs=*",
                f"--output-file={subsetted}",
            ]
        )

        # 5. Rename (and credit the source).
        font = TTFont(subsetted, recalcTimestamp=False)
        name = font["name"]
        version = name.getDebugName(5) or ""
        ver = version.split(";")[0].replace("Version ", "").strip() or "2.004"
        name.names = [n for n in name.names if n.nameID not in (1, 2, 3, 4, 6, 10, 16, 17)]
        for nid, value in (
            (1, FAMILY),
            (2, STYLE),
            (3, f"{ver};ARCHLANG;{PS_NAME}"),
            (4, f"{FAMILY} {STYLE}"),
            (6, PS_NAME),
            (10, DESCRIPTION),
            (16, FAMILY),
            (17, STYLE),
        ):
            name.setName(value, nid, 3, 1, 0x409)
        name.names.sort(key=lambda n: (n.platformID, n.platEncID, n.langID, n.nameID))
        for n in name.names:
            s = n.toUnicode()
            if n.nameID != 10 and ("Noto Sans CJK" in s or "NotoSansCJK" in s):
                fail(f"name ID {n.nameID} still names the upstream font: {s!r}")

        cff = font["CFF "].cff
        cff.fontNames = [PS_NAME]
        top = cff.topDictIndex[0]
        for attr, value in (("FullName", f"{FAMILY} {STYLE}"), ("FamilyName", FAMILY)):
            if hasattr(top, attr):
                setattr(top, attr, value)
        # A CID-keyed CFF also names each FDArray sub-font after the upstream face
        # (`NotoSansCJKjp-Regular-Alphabetic`, … — the collection shares one CFF).
        if hasattr(top, "FDArray"):
            for fd in top.FDArray:
                if hasattr(fd, "FontName"):
                    fd.FontName = re.sub(r"^NotoSansCJK\w*-Regular", PS_NAME, fd.FontName)
                    if "Noto" in fd.FontName:
                        fail(f"CFF FDArray font name still names the upstream font: {fd.FontName!r}")

        out = os.path.join(args.out_dir, OUT_NAME)
        font.save(out)
        font.close()

    with open(out, "rb") as f:
        digest = sha256(f.read())
    with open(os.path.join(args.out_dir, OUT_NAME + ".sha256"), "w", encoding="utf-8", newline="\n") as f:
        f.write(f"{digest}  {OUT_NAME}\n")
    with open(os.path.join(args.out_dir, "LICENSE"), "wb") as f:
        f.write(licence)
    size = os.path.getsize(out)
    print(f"gen-font-cjk: wrote {out} ({size} bytes)\ngen-font-cjk: sha256 {digest}")


if __name__ == "__main__":
    main()
