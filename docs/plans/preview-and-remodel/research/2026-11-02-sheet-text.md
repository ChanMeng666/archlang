# J13: sheet text in other languages (issue #403)

A written design, measured on `main@3f3060a3`. Probe plan: two rooms, `schedule rooms net`, `schedule openings`, `legend`,
`notes`, a title block, a stair, a lawn, fractional lengths. It reproduces as filed. Every fixed word on the sheet is
English and every number has a decimal point: `ROOM SCHEDULE`, `NET AREA (m²)`, `(no zone)`, `SUBTOTAL`, `TOTAL`,
`DOOR & WINDOW SCHEDULE`, `hinged`, `left`, `exterior / Bad`, `LEGEND`, `brick x1.5`, `casement window`, `NOTES`, `N`, `1 m`,
`PROJECT`, `DRAWING NO.`, `SCALE`, `UP`, `10.4 m² net`, `900.5`.

## 1. Decision

One plan-level block, authored in the plan:

```arch static
sheet text {
  decimal ","
  room_schedule "RAUMBUCH"
  total "SUMME"
  hinged "Drehtür"
}
```

Each entry is a stable key and the string drawn in its place. A key the block does not write keeps its English word.
`decimal ","` prints drawn numbers with a comma. Without the block nothing changes, byte for byte.

The core ships **no translation**. Nobody at this project reads German drafting vocabulary professionally, and a shipped
`locale de` would be a claim that its words are right, and a table to keep right as keys are added. The docs carry a German
table to copy, marked as an unreviewed starting point.

| # | Decision | Rejected | Reverse if |
|---|---|---|---|
| 1 | An authored table with stable keys | `locale de`, or both: shipping and maintaining translations with no reviewer | a native drafter offers a reviewed table and several plans paste the same one; `locale de` is then a preset of these same keys, and this form stays |
| 2 | The key is the word the language already has where there is one: a door or window kind, a material, a fixture category, a `title` field. Fixed captions get a name in `SHEET_WORDS` (`src/sheet-text.ts`) | msgid keys (the English string is the key): an English rewording would silently orphan every translation | never |
| 3 | `sheet text { … }`: `sheet` is contextual, read only when `text {` follows it | a reserved `locale` or `sheet` word in `STATEMENT_STARTS`, which would stop `room id=sheet` parsing; a bare `text { … }`, which a bare `dim` on the line above would swallow as its `text` clause | a second `sheet` statement appears; it then shares the word |
| 4 | `decimal ","` is an entry like any other, and the only legal values are `","` and `"."` | a `decimal comma` clause: a second entry shape for one bit | a thousands separator is wanted; a `grouping` key then sits beside it |
| 5 | A bad entry is an `E_PARSE` naming the entry, as an unknown `title` field or `schedule` subject is | a warning that draws anyway: a mistyped key would quietly leave an English word on the sheet; a new `E_` code: same message, more surface | keys are retired, which needs a warning for the old spelling |
| 6 | Refused: an unknown key (with a did-you-mean), a key written twice, a second block, an empty string, a control character, more than 40 units (6 for `north`, `up`, `down`, which sit in a fixed spot) | last one wins, as `title` fields do: one of the two strings would be dropped with no report | a real word is refused; raise the number, it costs only column width |
| 7 | Plan JSON reports the block in `dropped`, as `notes` and `legend`; it draws and measures nothing | a Plan JSON field: this format holds the model, and a sheet's wording is not the model | Plan JSON starts carrying the sheet tables |
| 8 | A column widens for an authored word, never for a default word, so a default table keeps its bytes | clipping, which would shorten someone's translation; a warning per column, when `NETTOFLÄCHE (m²)` is simply wider than `NET AREA (m²)` | a page grows past its paper too often; then a warning joins the widening |
| 9 | The door and window tags (`D01`, `W01`), the axis bubbles and `m²` are identifiers and units, and stay | keys for them: a tag is a handle into the table beside it, and a change of letter means nothing to translate | a buyer asks for `T01`/`F01` |
| 10 | The legend row of a window kind or a `glazed_sliding` door is the kind's own word when it is authored (`casement "Drehflügel"`), never word + ` window` | composing two translated words: German compounds, so `Dreh Fenster` is wrong | never |

## 2. What the decimal mark touches

`src/num-format.ts` `drawnDecimal(printed, mark)` is the one place. It takes a number already printed by the formatter
each site always used, so no site's rounding moves, and it runs only on a drawn number.

Drawn numbers that take it: the room stamp and the `outdoor` stamp, every cell of the ROOM SCHEDULE, a `dims auto` number and a
plain `dim`'s measured length, the thickness, `R` and `φ` call-outs, the WIDTH cell, the scale and angle in a legend row
(`brick x1,5`), the scale-bar length (`0,5 m`), the SCALE row (`1:12,5`).

Left alone on purpose:

* What the author wrote is the author's: a room name, a `notes` line, a `dim … text "…"`, a title value. `notes` numbers its lines
  `1.`, which is a list mark, not a decimal point.
* What a machine reads: `describe()`, `lint()`, Plan JSON, `compile().diagnostics`, SVG attributes and coordinates, the
  `data-arch-*` attributes, DXF group values. A DXF `TEXT` entity's string is drawn text and carries the comma, as the SVG does.
* The accessible `<title>` and `<desc>` are read aloud from `describe`-style English; the deprecated `--view` draws no sheet.

No environment is read. No `Intl`, no `toLocaleString`: what the mark is comes from the source alone, so `compile()` stays
pure, and the same plan prints the same bytes on every host.

## 3. Consequences by surface

* `describe()`: does not read the block. `schedule[]` keeps its numbers, and a group's heading stays `(no zone)`.
* `lint()`: messages stay English, always. Rules that read the drawn sheet read the drawn strings: `W_ANNOTATION_OVERLAP` builds the
  Scene, so a longer stamp collides as it is drawn, and `label-fit.ts` shrinks it first. `W_TITLE_OVERFLOW` keeps its value
  test and gains one for an authored caption, which now shares the row: caption and value, at the bundled faces' advances, wider
  than the row. Its message names the row by its English caption. Only a plan with the block reaches that branch.
* `src/text-metrics.ts` covers Latin-1, so German is measured glyph by glyph; CJK is 1 em. Widening uses `inkWidth`, not the
  character estimate, because a column of capitals runs wider than it.
* `src/label-fit.ts`, `src/label-placement.ts`: read the printed string, nothing to do.
* Sheet fit, draw budget, step meter: nothing moves. No primitive is added, rows are the same rows, and a table's width is not in
  the fit rule. The block is literal text read by the parser with at most one entry per key, so nothing is evaluated and no step is charged.
* PDF and PNG: both gather their fonts from the drawn strings (`pdf.ts`'s recording pass, `svgTexts`), so an authored word in CJK
  reaches the optional face as a room name does.
* DXF: tables and stamps are Scene text, so they carry over. DXF draws no title block today, and that does not change.
* Formatter: prints the block, in written order; a fixed point.
* `import`: as `title`, a module's `sheet text` is not brought in. Components are. A shared table is a copy for now.
* Grammars: `sheet` joins the highlighted words; the GBNF gains the statement.

## 4. Byte law

A plan that does not write `sheet text` is unchanged in SVG, `describe()`, `lint()`, `compile().diagnostics`, the accessibility
profile, the circulation overlay, Scene and steps. Pinned by `test/sheet-text-byte-identity.test.ts` against a `git archive`
of `3f3060a3`, with a fixture of its own (`test/fixtures/sheet-text/`) that writes the form.

## 5. Not done

* No `locale`, no shipped table, no list separator, no date formats: a date in the title block is the author's string.
* The review sheet (`arch preview --review`) and every CLI message stay English.
