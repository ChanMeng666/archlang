# @chanmeng666/archlang-font-cjk

The CJK font [ArchLang](https://github.com/ChanMeng666/archlang)'s PDF and PNG exports use for
Chinese, Japanese and Korean labels.

**You normally never install this yourself.** It is an `optionalDependency` of
[`@chanmeng666/archlang`](https://www.npmjs.com/package/@chanmeng666/archlang), so `npm install`
and `npx` fetch it automatically. It is only loaded when a label actually contains a character the
bundled Latin font (Roboto) cannot draw, so plans without CJK text never read it.

If it was left out (for example `npm install --omit=optional`), a CJK label in `-f pdf` / `-f png`
output renders as empty boxes and the CLI reports `W_CJK_FONT_MISSING` with the fix:

```bash
npm install @chanmeng666/archlang-font-cjk
```

SVG output is unaffected either way: it uses the viewer's own fonts.

## What it contains

`ArchLangCJKSans-Regular.otf` (~11 MB, OpenType/CFF) covers:

- every character in **GB 2312**, **Big5**, **JIS X 0208** and **KS X 1001** (20,273 characters: Simplified and
  Traditional Chinese, Japanese kanji and kana, Korean);
- all **11,172 Hangul syllables**;
- ASCII, Latin-1 and Latin Extended-A/B, general punctuation, CJK punctuation and fullwidth forms.

Japanese kanji and Traditional Chinese characters are drawn with the **Simplified Chinese glyph
forms** of the source face. That's fine on a floor plan, but it isn't a typographically native
Japanese or Traditional Chinese face.

```js
import { fontPath, fontFamily } from "@chanmeng666/archlang-font-cjk";
// fontPath   → absolute path of ArchLangCJKSans-Regular.otf
// fontFamily → "ArchLang CJK Sans"
```

## Source and licence

The font is a **subset of [Noto Sans CJK SC](https://github.com/notofonts/noto-cjk)** (Regular,
face 2 of `NotoSansCJK-Regular.ttc`), © 2014–2021 Adobe, and is licensed under the
**[SIL Open Font License 1.1](./LICENSE)**. It is renamed "ArchLang CJK Sans" because *Noto* is a
trademark of Google Inc. The upstream copyright, trademark notice and licence records are kept
in the font's name table.

The font is generated reproducibly by
[`scripts/gen-font-cjk.py`](https://github.com/ChanMeng666/archlang/blob/main/scripts/gen-font-cjk.py)
(`npm run gen:font-cjk`). That script pins the upstream commit, the SHA-256 of every input, the
character set and the fonttools version. The output's SHA-256 is in
`ArchLangCJKSans-Regular.otf.sha256`.

The package's code (`index.js`, `index.d.ts`) is part of ArchLang and is distributed with the font
under the same OFL-1.1 terms.
