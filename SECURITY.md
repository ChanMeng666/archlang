# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| Latest  | :white_check_mark: |

We provide security updates for the latest released version on the `main` branch.

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **chanmeng.dev@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce or a proof of concept
- The potential impact
- A suggested fix, if you have one

## Response Timeline

- **Acknowledgment**: within 48 hours of receiving your report
- **Assessment**: within 7 days we will confirm the issue and assess severity
- **Resolution**: we aim to release a fix within 30 days for confirmed vulnerabilities

## Output Safety (SVG / XSS)

ArchLang compiles untrusted `.arch` source to SVG, and that SVG is often rendered
inline in a browser (e.g. a playground or an AI-driven editor). The output is
designed to be **XSS-safe**:

- **Fixed element allowlist.** The renderer emits only a closed set of SVG
  primitives — `<svg>`, `<defs>`, `<pattern>`, `<rect>`, `<polygon>`, `<path>`,
  `<line>`, `<circle>`, `<text>`, `<g>`. It never emits `<script>`,
  `<foreignObject>`, or any `on*` event-handler attribute. There is no path that
  copies raw user markup into the output.
- **All user text is escaped.** Free-form strings — room/furniture labels,
  dimension text, and title-block fields — are emitted only as text content and
  always run through the `xml()` escaper (`& < > "`).
- **Theme values are sanitized.** Colours, fonts, and other theme strings (from
  the `theme { … }` directive or `CompileOptions.theme`) are interpolated into SVG
  attributes; they are escaped once at the render boundary (`sanitizeTheme`), so a
  hostile value cannot break out of its attribute. Identifiers, categories, and
  materials are restricted by the lexer to `[A-Za-z0-9_]` and are validated against
  known sets, so they carry no escapable characters.

These guarantees are covered by `test/security.test.ts`. If a future feature
introduces free-form user-controlled SVG or markup, it must be sanitized (or
allowlisted) before this guarantee can be relied on.

## Scope

Security concerns most likely to apply to this project include:

- Injection or insecure handling of user-supplied input
- Exposure or leakage of sensitive data
- Dependencies with known vulnerabilities

## Attribution

We appreciate responsible disclosure. With your permission, contributors who report valid security
issues will be acknowledged in the project.
