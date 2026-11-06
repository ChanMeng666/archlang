# Floor-plan tools for AI agents

An AI coding agent can be given four kinds of floor-plan tool today: an MCP server it calls over
stdio or HTTP, a skill (a folder of instructions and examples it reads), a text language with a
compiler it runs from the shell, and a web app with an API or a file format it can write. ArchLang
is a text language and compiler with an MCP server and a set of skills beside it, all under the MIT
licence: the agent writes `.arch` text, and the compiler draws it as SVG, DXF or PDF and reports the
rooms, areas and warnings back as JSON.

ArchLang is an open-source language for floor plans, created by
[Chan Meng](https://github.com/ChanMeng666). This page lists the tools an agent might be offered for
the same job, with what each one takes in and gives out, as each tool's own public page described it
on the date in the last column. Tools change; read the linked page before you choose.

## The tools, side by side

| Tool | What it takes in | What it gives out | How an agent uses it | Licence or pricing | Checked |
| --- | --- | --- | --- | --- | --- |
| [ArchLang](https://github.com/ChanMeng666/archlang) | `.arch` text: rooms, walls, doors, windows and furniture in millimetres | SVG, DXF, PDF, PNG, an ASCII preview; `describe` and `lint` reports as JSON | CLI (`npx -y @chanmeng666/archlang`), skills (`npx skills add ChanMeng666/archlang`), MCP (local from npm, or hosted at `https://mcp.archlang.uk/mcp`) | MIT; free | 2026-11-06 |
| [FloorGen](https://floorgen.app) | Drawing in its editor; a text description; a PNG, JPG, WebP, GIF or PDF of a plan; DXF | PDF plan sets with a title block (plans, elevations and sections on sheets), PNG, SVG, DXF (R12), glTF, MP4 or WebM video; its page says there is no DWG or IFC export. Checks the drawing as you edit it against a building-code profile you pick (its page lists 13, from the IRC to Japan), numbering each issue with the rule it cites | MCP server at `https://floorgen.app/mcp` with an API key; listed in the Claude directory | A free plan and paid plans; no software licence stated | 2026-11-06 |
| [OpenPlan3D](https://openplan3d.com) (Laan Labs) | A plan drawn in its web editor; an iPhone LiDAR scan through Apple RoomPlan; plan JSON | PNG, SVG, DXF, PDF, JSON; its format graphic also shows USDZ | Web editor; an agent skill in [its repository](https://github.com/laanlabs/openPlan3D) writes plan JSON for the editor to import | MIT; free, no sign-up | 2026-11-06 |
| [Skopia](https://skopia.datatreehaus.com) (Datatreehaus) | Edit operations from the agent (walls, doors, windows, fixtures, a roof), from a brief or a measured survey | SVG plan, section and elevation; a to-scale SVG sheet; DXF at 1:1 with layers named by role; typed validation errors | MCP over Streamable HTTP at `https://skopia.datatreehaus.com/v1` with a bearer key | Free at the time of checking; its page says pricing may come later; the engine's source is not public | 2026-11-06 |
| [WalkMyPlan](https://www.walkmyplan.com) | A description in chat; a sketch on an upload page; a DWG or vector PDF | A live link that opens the plan in 2D and 3D in a browser; a PDF download tool; `get_plan_structure` and `ask_plan_question` tools that report on a plan | MCP over Streamable HTTP at `https://mcp.walkmyplan.com/mcp`, OAuth sign-in | Hosted service; pricing not stated on the pages read; the [metadata repository](https://github.com/yaniv-fink/walkmyplan-mcp) is MIT | 2026-11-06 |
| [Simple House Planner](https://simplehouseplanner.com/floor-plan-mcp/) | Short scripts the agent sends (`edit_project`, `query_project`), run in a sandbox | `describe_plan` reports rooms, areas, doors, windows, routes and warnings; an editor view in hosts that support MCP Apps; no file export listed on its MCP page | MCP over Streamable HTTP at `https://simplehouseplanner.com/mcp`, OAuth sign-in; `com.simplehouseplanner/floor-plans` in the MCP registry | Free to use, its page says; no software licence stated | 2026-11-06 |
| [parti-mcp](https://github.com/Hbler/parti-mcp) | A floor-plan or site-plan spec as JSON: walls, rooms, openings, stairs, dimensions, a grid | SVG | stdio MCP server, run with `npx -y github:Hbler/parti-mcp` | MIT | 2026-11-06 |
| [Autodesk Open Architecture Standards (OAS)](https://github.com/autodesk-platform-services/open-architecture-standards-2d-floor-plans) | A JSON schema in millimetre coordinates for layouts, rooms, walls and openings | OAS JSON; a read-only SVG viewer for it | Six Claude Code skills in the repository, one per schema module | Apache-2.0; its README says it is "not an industry standard, but rather one approach" | 2026-11-06 |
| [Mermaid](https://mermaid.js.org) | Mermaid diagram text | SVG, and PNG or PDF through mermaid-cli; no floor-plan diagram type. A floor-plan syntax is requested in [mermaid-js/mermaid#6134](https://github.com/mermaid-js/mermaid/issues/6134), open when checked. A stand-alone prototype linked from that issue, [langalex/mermaid-floorplan](https://github.com/langalex/mermaid-floorplan), is MIT-licensed | Not applicable to floor plans in Mermaid itself until that request is resolved | MIT | 2026-11-06 |

Each row comes from the tool's own page or repository, read on 2026-11-06. Where a page did not
state a fact, the cell says so rather than guessing. The comparison with Mermaid is written out at
[ArchLang vs Mermaid](/vs-mermaid).

## How to choose

These are questions for you to answer about your own job; the table holds the facts each one needs.

- **Does the agent need to read the plan back as text?** If it should check room areas or which
  door joins which room without looking at an image, look for a tool that returns those facts as
  data, and try it on a plan you know.
- **Do you need DXF?** If the plan has to open in a CAD program, check the "gives out" column for
  DXF and note what the file carries: units, layers, blocks.
- **Does the licence permit what you will do with it?** Redistributing, modifying or self-hosting
  the tool needs an open-source licence; using a hosted service needs its terms.
- **What can your agent reach?** A shell runs a CLI or a stdio MCP server; a host without a shell
  needs a remote MCP server; a skill needs a host that reads skills.
- **Is a sign-in or an API key acceptable** where the agent runs, for example in CI?
- **Where does the plan live?** In your repository as a file, or in an account on a service.

A plan from ArchLang is a concept or scheme-stage drawing, not a permit set; for any other tool,
read what its own page says.

## A worked ArchLang example

A garden office: an office, a meeting room and a WC. Edit it below and it recompiles in your
browser.

```arch
plan "Garden office" {
  units mm
  grid 50
  north up
  room id=office  at (0,0)          size 4000x3500 label "Office" uses office
  room id=meeting right-of office   size 3000x3500 label "Meeting" uses office
  room id=wc      below meeting     size 3000x1500 label "WC" uses wc
  walls from rooms exterior 200 partition 100
  door on office.bottom at center width 900 swing into office
  door between office and meeting at 1750 from start width 900 swing into meeting
  door between meeting and wc at 700 from start width 800 swing into wc
  window on office.top width 1800
  window on meeting.top width 1500
  furniture desk in office anchor top-left flush inset 300 size 1400x700
  furniture wc against wc.right
  furniture basin against wc.bottom
}
```

Saved as `office.arch`, the agent checks it with two commands:

```bash
npx -y @chanmeng666/archlang describe office.arch --json
npx -y @chanmeng666/archlang lint office.arch --json
```

`describe` reports 3 rooms, 3 doors and 2 windows; 29 m² measured on the wall centrelines
(office 14 m², meeting room 10.5 m², WC 4.5 m²) and 26.04 m² net; and every room reachable from
the front door, the WC at depth 3 through the meeting room. `lint` reports no warnings.
`npx -y @chanmeng666/archlang link office.arch` prints a playground link that opens this plan; the
bundled [relational placement example](https://playground.archlang.uk/examples/relational.html)
uses the same `right-of` and `below` placement.

## FAQ

### What floor-plan tools can an AI agent use?

MCP servers (ArchLang, FloorGen, Skopia, WalkMyPlan, Simple House Planner, parti-mcp), skills
(ArchLang, OpenPlan3D, Autodesk OAS), a text language with a compiler (ArchLang), and web apps
the agent writes files for (OpenPlan3D). The table above says what each takes in and gives out.

### Which of these are open source?

As their own pages state: ArchLang (MIT), OpenPlan3D (MIT), parti-mcp (MIT), Autodesk OAS
(Apache-2.0) and Mermaid (MIT). FloorGen and Simple House Planner state no software licence,
Skopia says its engine's source is not public, and WalkMyPlan's public repository holds the MCP
server's metadata and documentation.

### Can an agent check a plan it wrote?

With ArchLang, `describe` returns the rooms, areas and reachability from the entrance, and `lint`
returns advisory warnings such as a windowless bedroom or a room with no door, each with a fix. The
table notes where another tool's page lists a report or validation step of its own.

### Is an ArchLang plan ready for a building permit?

No. Treat it as a concept or scheme-stage drawing to discuss and develop, then take it to a
professional for anything that needs approval. For any other tool, read what its own page says.

## Next

- [Floor plan MCP server](/mcp): set up ArchLang's server in each host.
- [Use it from an agent](/agents): the CLI loop, exit codes and JSON output.
- [Generate a floor plan with a coding agent](/floor-plan-with-a-coding-agent): install and the loop.
