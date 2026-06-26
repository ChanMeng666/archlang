# Relational placement

By default a room is positioned with absolute coordinates:

```arch
room id=living at (0,0) size 5000x4000 label "Living"
```

Since v1.0 a room can instead be positioned **relative to another room**, and the
compiler resolves its absolute coordinates for you — by pure arithmetic, in
dependency order. This is sugar over absolute coordinates: it is fully
deterministic and is *not* an optimizer (see
[ADR 0004](/adr/0004-relational-placement-not-optimizer)).

## Syntax

```
room [id=NAME] DIRECTION REF [align EDGE] [gap N] size WxH [label "…"]
```

- **DIRECTION** — one of `right-of`, `left-of`, `below`, `above`.
- **REF** — the `id` of another room to place against.
- **`align EDGE`** *(optional)* — which edges line up on the cross axis:
  - horizontal placement (`right-of` / `left-of`): `top` · `middle` · `bottom`
  - vertical placement (`below` / `above`): `left` · `center` · `right`
  - default: the leading edge (`top` for horizontal, `left` for vertical).
- **`gap N`** *(optional)* — spacing in mm along the placement axis (default `0`).

## Example

```arch
plan "Relational 1BR" {
  units mm
  grid 50

  room id=living  at (0,0)                        size 5000x4000 label "Living"
  room id=kitchen right-of living align top gap 0 size 3000x4000 label "Kitchen"
  room id=bed     below living    align left gap 0 size 5000x3500 label "Bedroom"
  room id=bath    right-of bed    align top  gap 0 size 3000x3500 label "Bath"
}
```

Only `living` is anchored; every other room derives its position from a neighbour,
so moving the anchor or resizing a room reflows the whole plan deterministically.

<img src="/examples/relational.svg" alt="Relational layout example" style="max-width:520px;border:1px solid #ddd;border-radius:8px;margin-top:1rem" />

## Placement arithmetic

For reference room `R`, new room `N`, and gap `g`:

| Direction  | Position |
|------------|----------|
| `right-of` | `N.x = R.x + R.w + g`; `N.y` from `align` (`top`/`middle`/`bottom`) |
| `left-of`  | `N.x = R.x − N.w − g`; `N.y` from `align` |
| `below`    | `N.y = R.y + R.h + g`; `N.x` from `align` (`left`/`center`/`right`) |
| `above`    | `N.y = R.y − N.h − g`; `N.x` from `align` |

Computed coordinates are grid-snapped exactly like absolute ones.

## Diagnostics

- **[`E_LAYOUT_CYCLE`](/errors#e-layout-cycle)** — rooms reference each other in a
  loop, so no order resolves them. Break the cycle by giving one room absolute
  `at (x,y)` coordinates.
- **[`E_LAYOUT_REF`](/errors#e-layout-ref)** — a relational clause names a room id
  that does not exist. Reference an existing room, or fix the typo.
