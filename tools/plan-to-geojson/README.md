# plan-to-geojson (experimental)

Plan JSON to GeoJSON ([RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)): a worked example of the
converter seam, read a document and write another format. The recipe, why GeoJSON and its limits:
[the language reference](../../docs/language-reference.md#convert-plan-json-to-another-format-experimental)
(published at https://archlang.uk/language-reference).

| File | What it does |
|---|---|
| `plan_to_geojson.mjs` | Plan JSON → GeoJSON. Node only, imports nothing |
| `example/plan.arch` | the worked example: a studio with a bowed wall, a door, a window, furniture and a column |
| `example/plan.json` | what `archlang compile example/plan.arch -f json` writes |
| `example/plan.geojson` | what the script writes from it |

```sh
archlang compile example/plan.arch -f json -o example/plan.json
node plan_to_geojson.mjs example/plan.json example/plan.geojson
```

The script trusts the document it reads. It skips a wall or a ring with too few points to be GeoJSON,
and validates nothing else, so a hand-written document goes through `archlang compile --from-json`
first: that is what checks it.

The files in `example/` are generated: after changing the script or the plan, regenerate them with
those two commands rather than editing them. `test/tools-plan-to-geojson.test.ts` holds the script to
them, and to the core's own arc and area figures.

Nothing here is part of the npm package, and the core never reads it.
