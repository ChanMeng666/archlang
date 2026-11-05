# Embed a floor plan in a web page

The compiler is a zero-dependency ES module that runs in the browser, so a web page can turn
`.arch` source into an SVG drawing with no server. There are two ways to do it: import the
compiler from jsDelivr and place the SVG yourself, or add the `<arch-plan>` element and give it a
plan.

## Import the compiler from jsDelivr

jsDelivr serves the npm package as one ES module at its `+esm` URL. Pin the version: the URL
below names the one this site was built from.

```html
<div id="plan"></div>
<script type="module">
  import { compile } from "https://cdn.jsdelivr.net/npm/@chanmeng666/archlang@%ARCHLANG_VERSION%/+esm";

  const source = `plan "Garden studio" {
    wall exterior thickness 200 { (0,0) (5000,0) (5000,3600) (0,3600) close }
    room id=r_studio at (0,0) size 5000x3600 label "Studio" uses living
    door at (2500,3600) width 900 wall exterior hinge left swing in
  }`;
  document.getElementById("plan").innerHTML = compile(source, { onError: "svg" }).svg;
</script>
```

`compile()` returns the drawing as an SVG string with its `diagnostics` beside it. With
`onError: "svg"`, a plan that has errors returns an error card instead of an empty string, listing
each diagnostic with its code and `line:col`, so the page always shows something. The same import
also gives you `describe`, `lint` and the rest of the [library API](/agents#also).

Use this form in a Claude Code artifact and on any other page that can load ES modules from
jsDelivr. A Claude Code artifact may load scripts from a few CDNs, `cdn.jsdelivr.net` among them,
and `archlang.uk` is not one of them, so the element below cannot be loaded there.

## The `<arch-plan>` element

One script tag, then one element per drawing:

```html
<script type="module" src="https://archlang.uk/arch-plan.js"></script>

<arch-plan src="https://archlang.uk/examples/studio.arch"></arch-plan>
```

Each element compiles its plan and draws the SVG into its own shadow root. Every plan on the
[examples page](/examples) is served as source at `/examples/<name>.arch`, next to its drawing at
`/examples/<name>.svg`.

The site serves the element in two builds. Load one of them, not both:

| File | Size | The compiler |
| --- | --- | --- |
| `/arch-plan.js` | a few KB | Slim: imported from the pinned jsDelivr URL above on the first render, once per page and shared by every element. |
| `/arch-plan.standalone.js` | about 1.5 MB (about 520 KB gzipped) | Standalone: inlined, built from the same source as this site. No CDN dependency. |

The slim build depends on jsDelivr at run time. If jsDelivr cannot be reached, or the page's
Content-Security-Policy does not allow `cdn.jsdelivr.net` in `script-src`, every element shows
`arch-plan: could not load the ArchLang compiler (…)` instead of a drawing. Use the standalone
build when that matters: it needs nothing but `archlang.uk`.

| Attribute | What it does |
| --- | --- |
| `src` | The URL of a `.arch` file, fetched with `fetch`. A file on another origin needs CORS; this site sends `Access-Control-Allow-Origin: *`. |
| `level` | The storey to draw, by its `level` number. Without it, a multi-storey plan draws its lowest storey. |
| `theme` | A built-in theme by name, such as `blueprint`. It overrides the plan's own `theme`. |

Without `src`, the element's text is the plan. Put the text inside a `text/plain` script element,
as below, to keep `<` and `&` literal:

```html
<arch-plan level="2">
  <script type="text/plain">
plan "Two storeys" {
  # …
}
  </script>
</arch-plan>
```

Until the module has loaded, the browser shows inline source as plain text. To hide it until
then, add this to the page's CSS. The animation shows the text again after three seconds, so a
script that never loads (a 404, a blocked origin) leaves the source readable rather than a blank:

```css
arch-plan:not(:defined) { visibility: hidden; animation: arch-plan-reveal 0s 3s forwards; }
@keyframes arch-plan-reveal { to { visibility: visible; } }
```

A plan with errors draws a `<pre>` instead, one line per error as `CODE line:col message`, for
example `E_PARSE 3:1 Expected a value but found "}"`. For inline source, lines count from the
plan's first non-blank line, not from the opening tag; columns count from the start of the line,
so they include any indent the HTML gives the plan. A failed fetch, an unknown theme or a
missing storey are reported in the same `<pre>`; the element never throws. Changing an attribute
or the inline text redraws it. After each render the element dispatches a `render` event whose
`detail` is `{ ok, problems }`, and the drawing and the error list are styleable from the page as
`arch-plan::part(plan)` and `arch-plan::part(diagnostics)`.

[See three elements on a plain HTML page](/arch-plan-demo.html): a plan loaded by URL, a plan
written inline, and a plan with an error.

## In a bundled app

Install the core with `npm install @chanmeng666/archlang` and call `compile` as in the first
example; your bundler resolves the import. The element's source is
[`packages/web-component/`](https://github.com/chanmeng666/archlang/tree/main/packages/web-component)
in the repository.
