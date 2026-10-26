<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./brand/archlang-wordmark.svg" />
  <img src="./brand/archlang-wordmark-black.svg" alt="ArchLang" width="440" />
</picture>

### Floor plans as code.

Write a floor plan as text. Get a precise, dimensioned drawing back.

<a href="https://playground.archlang.uk"><img src="./.github/readme/pill-playground.svg" height="40" alt="Playground"></a> <a href="https://archlang.uk"><img src="./.github/readme/pill-docs.svg" height="40" alt="Docs"></a> <a href="https://archlang.uk/gallery"><img src="./.github/readme/pill-gallery.svg" height="40" alt="Gallery"></a> <a href="https://www.npmjs.com/package/@chanmeng666/archlang"><img src="./.github/readme/pill-npm.svg" height="40" alt="npm"></a>

</div>

<br>

## Send this to your agent
Paste this into any coding agent. The skills are listed on skills.sh: https://skills.sh/ChanMeng666/archlang
```text
1. Run: npx -y skills add ChanMeng666/archlang --yes
2. Run: npx -y @chanmeng666/archlang spec   (read it before writing anything)
3. Write my floor plan as plan.arch from this brief: <describe rooms, areas, adjacencies>
4. Run: npx -y @chanmeng666/archlang compile plan.arch -o plan.svg --json
   then describe plan.arch --json, validate plan.arch --strict --json (same prefix); fix, recompile
5. Run: npx -y @chanmeng666/archlang finish plan.arch, then compile again to export.
```
For MCP clients: `claude mcp add archlang -- npx -y @chanmeng666/archlang-mcp`.

<a href="https://playground.archlang.uk"><img src="./.github/readme/card.svg" width="100%" alt="ArchLang compiles plain-text source into floor plans. The card shows source being typed and the drawing compiling beside it: five example plans, one constant changed, and a lint finding raised and cleared."></a>

<br>



https://github.com/user-attachments/assets/a60f3174-6a8c-4a42-b24a-fac030d39627



## Try it

```bash
npx skills add ChanMeng666/archlang
```

Then ask your coding agent:

> *Design a one-bedroom flat of about 54 m², with the front door on the north wall.*

It writes the plan, compiles it and checks it. This one is 57 lines of text:

<div align="center">
<a href="https://playground.archlang.uk/#z=jVZdbhs3EH7fU3yQXhxAdmjZ8k-bBEjbAAVipEWaIOiTd1YcaVmvSIGkLLmBgTz1AEXP0AP0CD1KTlIMufpZ23G6T1zuzDff_O708RLO8n7F2js3Q0OWl3SDsYuRpozPn_7C8Tlm__6DWFOEZ9IBFEQJc--mnmYHRb_o442LtbFT1OwZJmDugonGWdaoblCT1Qd4dc3-Bm7OViRFyFgRiA4Ev7DQJkSyYwY1zk5BRR-WZqyxpKbBXuksnsnxBSji2dyFF-WTATjBTswqLjzDc3DNNQfQlIwNUaDFNedBCafoY680Fs_k-gXIjmvn8fnT3-UA5VopGZS7JwOQ1Yg1o6JYP11Hak7GiwsNGQ23iKhuij7KEL2Zlwcog4mMjwjRM0dY52ON2zK5ExJaXDpMaEy6fZ83ZBEX3kpwv0lX2jlf9EWqlZH0DNJp2lAIO1-m5DXbgyKh9C7aNP7oFoF7-FgAC2tiwGxWAFNvNEYKO08fc_IxJSyAPONQKcTajK8GCJKdctIsQl1uotyQ1UIUJFEaqQKtj4t5AWgzC6CF5LVpCuDBYBQFcpiNfr68FNcA8CqyN84jW7ccAoZK4SP21EA9wd7pSKXDbUebKcTHtdd6-XAyUvcwcggfZ5D1voyx5K_xyCQe1q7lhG0qdrQPs_bxsPUiHR7CkCL9HxjDHUeGLUyB3ClGP_eXjblm6bJMOJjfGaK4EptoqOIGvQtzLY38FK9NHNdse1gEDmjy9VW-lPRLU0C7pU2IayemNIfC0uhY4-hIyBVSi1sOyZdkerhj9TuKdU8EkzGRuavGGi1jtaOWG7fl2LZxgey3dJoo68uJdzZCKrutSYoYSuQyz3OlIHOOYZk8QiQfEZZpntnokAPXQWzrKjRGi1hCbu8E-3SDfXimVBJjNDyJHZDkU0srlQlFjE42qmcbWqLZJVSxLqTDy6xZytRaUnPFOs2Tz3_8mdmkTi-zfW-mdSwRWLo8TSey3OQUymtwjclTOUFX3Lhl-vAbzapv1yjCpcTSLRoNMjOYmGgrhdksT1Wpi_LD5c8_ff_61bvLt-_flAddt9tqduMrjl3vzzvO79BOc8VY7ZZZoe1JifXxNtZDpe7IbXMiKVnLqUfkRmejDd7JPbl2JlHE4WhjV8QKYLLw1qRBOvFGT7kdw52_T8vcTSaBI44k2cZuC2wLEaK7XiM8BiE-fwGi7dXLYOzVYxBD9UWIsVvYyP6rLCQHHYg-3tUMv0gbAVm8f_PDq7cXL38dQHtaWlQ8cZ5zFRrOPzyK0npWS6RNlMLNVTkhqasEGqlqWP48uDbBVM2NyEY3h6dYsxcQizr3pIlp08mrQF5IBE8mxACNuco0056RtxxuAqdVZwAr1yCMnfPaWIp80ImLOLbj8HrfqFyMbraf2tXYdWDysDtTanV0nApqi5P92QEas8SbdVY6PFJqdb4dd-9EvNetEwnPV6ik33xLaDhqCZ0rtUqZX4P_4ibUxW7nU8JO5y52asyHwaU5Mvp2UHexvav4Iezo5pm0PB3sdSRloq5Odoh_IK8F7k5gardk3xqQibNjIDPfGNjE4_xOepbjTuFnoIPs_rr0T9c-Hyu1Or0DUFEwFvdJPBDBhHGi1Op4lKZJNLGR_Wru3W88jvf2v9RHl9UNei_9uL4gO-1BU2T0hmp4sq_O9g9Pergtbov_AA"><img src="./examples/laneway-house.svg" alt="A one-bedroom laneway house, compiled from 57 lines of ArchLang. Click to open it in the playground." width="620" /></a>

<sub>Click the drawing to open this exact plan in the playground. Change a number and it redraws.</sub>
</div>

## Why text

- **Change one number, and one thing moves.** Nothing else is redrawn.
- **The same source gives the same drawing**, byte for byte.
- **An agent can check its own plan** without ever looking at an image.

```mermaid
flowchart LR
    B([Brief]) --> W[Write .arch]
    W --> C{Compiles?}
    C -->|no| F[Apply the fix<br/>the error carries] --> C
    C -->|yes| V{Matches<br/>the brief?}
    V -->|no| W
    V -->|yes| O([SVG · DXF · PDF · PNG])
```

## For your agent

This page is all a person needs. Everything else is written for agents: clone the repo and point yours at [`AGENTS.md`](AGENTS.md), or give it the whole language in one call:

```bash
npx -y @chanmeng666/archlang context
```

<sub>[Full overview](docs/overview.md) · [Language reference](docs/language-reference.md) · [Release notes](https://github.com/ChanMeng666/archlang/blob/main/CHANGELOG.md) (installed: `node_modules/@chanmeng666/archlang/CHANGELOG.md`) · [Contributing](CONTRIBUTING.md) · [MIT](LICENSE)</sub>

<sub>ArchLang is the engine behind [ArchCanvas](https://github.com/archcanvas/archcanvas). Built by [Chan Meng](https://github.com/ChanMeng666).</sub>
