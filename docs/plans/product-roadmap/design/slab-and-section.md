# 设计稿：剖切符号、楼板 datum 与净高子句（RM6.1）

**状态：** 草案，2026-11-11 写成，基线 `main@6059e52a`。对应卡 RM6.1（`../cards.md` 阶段 F 首位，依赖 PS7.9 与本稿）。它定下 DS11 并入时的四件事，和 RM-D17（MF-D11 的受托裁定，`../README.md` §6.2）留给本稿的净高子句拼写。本稿只写设计，不改代码；`file:line` 在基线上读过，动手前重新确认。按 `../handoff.md` §8 的承诺，本稿写成后在 #544 贴链接，请 gerontec 看形状是否合 `archlang-section` 用。

**一句话：** `section A (x,y)->(x,y) look east` 是一条写在 plan 层的平面语句，画在最低层那一页（首层平面），`describe()` 在它出现时多一个 `sections` 键；`level` 的头部加 `slab <mm>` 与 `clear <mm>` 两个子句，单层平面在 `height` 那行加 `clear <mm>`，三者只进 `describe().heights`，核心一笔不画。

## 1. 今天的事实

- **没有剖切线，也没有楼板。** `section`、`look`、`slab` 都不是关键字（`src/grammar/tokens.ts` 的 `KEYWORDS` 与 `STATEMENT_STARTS` 里没有这三个词，第 25-605 行）。`clear` 已经是 `control` 类关键字（第 141 行），今天用在 `dim clear` 与 `keep min clear`。
- **`level` 的头部只有编号、名字与 `height`**：`level <n> ["Name"] [height <expr>] { … }`（`src/parser.ts:690-724`）。注释写明层高只能放在头部，因为体内放 plan 层设置是 `E_LEVEL_MIX`（第 703-705 行）。单层平面的层高是 plan 层的 `height <expr>`（`src/parser.ts:764-771`）。
- **多层平面里，plan 层只能放共享的东西。** `checkLevels` 对 plan 层的可画语句报 `E_LEVEL_MIX`（`src/parser.ts:641-681`），放行的只有 `LEVEL_SHARED_KINDS = ["let", "set", "assign", "error", "level", "keep"]`（`src/ast.ts:1333`）和各项设置（`axes`、`site` 等存在 `PlanNode` 上）。
- **页面：** `compile().pages` 每层一页，`compile().svg` 是最低层那一页（`src/plan-json/to-json.ts` 的 `planToJson` 文档注释写了同一条规矩；`resolvePlan` 的 `ir` 是最低层，ADR 0031 第 88-93 行）。
- **高度块：** `describe().heights` 每层一份（`HeightFacts`，`src/describe/types.ts:233-249`）：`storey_height`（该层自己的 `height`，否则 plan 的，否则 3000）、`elevation`（下面各层层高之和）、`walls[]`。整块受一个全图闸门 `_heightsAuthored` 控制（`src/describe.ts:489-493,772-781`），闸门由 `plansAuthorHeights` 决定（`src/datum.ts:323-360`）：plan 写了 `height`、或任何墙、窗、门、洞口、`level` 写了竖向子句才打开。
- **省略要说原因的先例：** `gross_internal_area_omitted` 一类键（`src/describe/types.ts:744-757`）：数算不出时不给数，给一个原因词，不猜（ADR 0005、ADR 0027）。
- **两点间的写法：** `dim (x,y)->(x,y)` 用 `->` 记号（`src/lexer.ts:23,407`；`src/elements/dim.ts:246-248`），示例里大量使用（如 `examples/clinic.arch:171`）。语言里 `from` 已经有别的意思（`walls from rooms`、`at … from`）。
- **方向：** 指北 `north` 可以是 `up|down|left|right` 或一个角度（`src/ast.ts:48`）；`northQuarterTurns`（`src/algebra/d4.ts:312-340`）把任意角度吸到最近的正方向，45° 整的平局按顺时针取，已被窗的朝向事实使用（`src/describe.ts:509,518`）。罗盘词 `north|south|east|west` 是 `COMPASS_DIRECTIONS`（`src/ast.ts:1469`）。
- **外部用户的写法：** `archlang-section` 用注释 `# @section A x=700 look east`、`# @floor 1 Belag+Estrich:80 Stahlbeton:240`（#532 正文）。他的房子写了每层净高（KG/EG/OG 为 2,19 / 2,34 / 2,34 m），楼板"0,32 m including floor finish"。
- **已经公开说过的：** #532 与 #544 的维护者回复写的是 `section A from (700, 0) to (700, 9000) look east`，"`describe()` reports the segment and the viewing direction under a `sections` key"；楼板"The exact spelling will go through our generator's closed value set"。#544 的 2026-11-11 回复还说定了一条："where a level states its clear ceiling height, that value is reported as written"。

## 2. 剖切符号：四件事

### 2.1 拼写

| 选项 | 例子 | 评价 |
|---|---|---|
| DS11 的写法 | `section A (700,0)->(700,9000) look east` | 与 `dim (x,y)->(x,y)` 同一记号，不加新的连接词；spec 成本最低 |
| #544 的写法 | `section A from (700,0) to (700,9000) look east` | 读起来像英语，但要加 `to` 这个新词，`from` 在语言里已经另有两种意思 |

**建议：DS11 的写法**（协调者的决定）。理由：两点之间的线在语言里已经有一种写法（`dim`），第二种写法会让模型和作者在两者之间犹豫；`->` 不占新词，`spec.llm.md` 的成本只有 `section`、`look` 两个词（PS7.9 按"剖切符号一个形式"算过额度，`../cards.md` PS7.9）。#544 回复里的 `from … to …` 写的是"along the lines of"，不是承诺；在 #544 贴本稿链接时说明换成了 `dim` 的记号。

细节（都是协调者的决定）：

- **编号**是一个标识符或一个正整数（`section A …`、`section 1 …`）。常见做法是中国制图用数字（1-1 剖面）、ISO 用字母（A-A）；本稿没有读这两份标准的原文，这一条只是取名参考，不进任何规则。编号同时是这条语句的 id，在剖切符号之间唯一（重复报新码 `E_SECTION_DUP`），与房间、墙的 id 不在同一个命名空间（像轴号一样）。
- **`look`** 后跟罗盘词，经 `northQuarterTurns` 换成页面方向；换出的方向必须垂直于剖切线，否则报新码 `E_SECTION_LOOK`，消息里写出这条线在本图指北下能取的两个罗盘词。用罗盘词而不是 `left|right`，因为 #532 的工具和建筑师都这样说（"looking north"），而且指北已经是图上的事实。
- **只允许轴对齐**（两端 `x` 相同或 `y` 相同），斜线报 `E_SECTION_AXIS`，等第二个用例再放开（卡的既定范围）。长度为零的线同样报这个码。
- 新码都进 `src/error-catalog/`，按 `.claude/commands/` 的流程生成文档。

### 2.2 进 `describe` 主体，还是 opt-in 事实

| 选项 | 说明 |
|---|---|
| 主体 | 写了 `section` 才出现顶层 `sections` 键；没写的图一字不变 |
| opt-in | `describe --facts sections`（DS11 卡原文"默认不进 describe 主体，放 opt-in 事实"） |

**建议：进主体，只在写了时出现**（协调者的决定）。理由：(1) opt-in 事实（`symmetry`、`syntax`、`depends`、`clearances`、`quantities`，`src/describe.ts:237`）都是要额外计算的分析；剖切符号是作者写下的声明，同类的 `outdoor`、`fences`、`derived_walls` 都是"有才出现"的主体键（`src/describe.ts:764-767`）。(2) 字节恒等律对两种做法一样成立：没写 `section` 的图，`describe()` 一字不变。(3) #532 与 #544 已经公开说了"under a `sections` key"，`archlang-section` 只读 `describe --json` 的默认输出。DS11 的"opt-in"是卡的原文，不是 drawing-set 的裁定（drawing-set README 的 D 表里只有 D5 讲 opt-in，管的是指标）。

`sections` 的行：`{ id, from: {x, y}, to: {x, y}, look: "east", toward: {x, y} }`，`toward` 是页面上的单位方向（`{x: 1, y: 0}` 一类），让读者不必自己按指北换算。它是全图的键，不进 `PER_STOREY_OPTIONAL_KEYS`（`src/describe.ts:1012-1018`），`describeLevel` 收窄到某一层时照样保留。

### 2.3 多层平面上画在哪一页

**建议：画在最低层那一页，也就是 `compile().svg`**（协调者的决定）。理由：剖切线切的是整栋楼，制图惯例把它标在首层平面上（`../../drawing-set/README.md:31` 引的深度规定："首层剖切线"）；最低层那一页也正是单页输出、Plan JSON 的 `json` 与 `resolvePlan` 的 `ir` 所代表的一页，读者不用另找。其他各层的页不画。单层平面只有一页，就画在那一页。

这要求 `section` 写在 plan 层：在多层平面里不能报 `E_LEVEL_MIX`。实现上它的语句种类加进 `LEVEL_SHARED_KINDS` 一类的放行名单，并且只解析进最低层；写在 `level` 体内、`zone` 或 `component` 体内的 `section` 报新码 `E_SECTION_SCOPE`（`component` 里也不行：放两次就有两条同号的剖切线）。它仍是 `src/elements/section.ts` 一个元素模块，注册在 `defs.ts`，带 `drawCost`、`bounds()`、`measures()`（AGENTS.md 的硬规则），符号画在线的两端，标签不随指北转。

日后若真有人要在某一层单独标剖切线（例如只穿过地下室的剖面），再加 `on level <n>` 一类子句；本卡不做。

### 2.4 与 DS5 `level a..b` 的 id 冲突

DS5（`../../drawing-set/cards.md:80-96`）把 `level 2..5 { B }` 展开成共享同一个 body 的克隆层。若 `section` 能写在 `level` 体内，展开后同一个编号会出现四次。按 §2.3 的建议，`section` 只能写在 plan 层，任何 `level` 体（包括 DS5 日后的区间层）里都报 `E_SECTION_SCOPE`，展开永远碰不到它，编号由 `E_SECTION_DUP` 在全图范围内查重。**所以不必保留对 DS5 的依赖**：RM6.1 可以先于 DS5 合并，DS5 落地时只需在它的测试里加一例"区间层体内的 `section` 照样报 `E_SECTION_SCOPE`"。DS11 卡写的"依赖 DS5"随 RM6.1 一起作废，由 RM6.1 的 PR 在 drawing-set 的卡上留一行。

## 3. 楼板 datum 与净高子句

### 3.1 楼板的拼写

MF-D1 的推荐语义（`../../math-foundations/README.md:296-301`）：子句挂在 `level` 上，表示"本层楼面之下的楼板构造总厚"，含面层；候选 `slab <mm>`，或 `floor { structure <mm> finish <mm> }`。

**建议：`slab <expr>`，写在 `level` 头部、`height` 之后**：`level 2 "OG" height 2750 slab 320 { … }`（协调者的决定，MF-D1 已把拼写交给 RM6.1）。理由：一个数就够算净高，#532 的房子本身给的就是一个总厚（"0,32 m including floor finish"）；`floor` 已经是房间地面图案的关键字（`src/grammar/tokens.ts` 的 `floor` 注释），再让它在 `level` 上开一个块会一词两义；块形式比一个词贵得多的 spec 成本。MF-D1 的推翻条件照旧：实施时若发现一个总厚画不对 #532 那类剖面的标高，就改成 `slab <mm> finish <mm>` 两个数，并回 math-foundations §6.1 记一笔。

`slab` 是表达式（同 `height`），值的范围检查进 `checkNumberDomain` 一类的检查与 `MODEL_RANGE_MM`；负数与零报码。它只能写在 `level` 头部：单层平面的楼板在它自己楼面之下，不影响任何一层的净高，所以 plan 层不提供 `slab`。

### 3.2 净高子句的拼写（RM-D17）

RM-D17：一个 `level` 可以写一个净高值，作者写了就用；中间层没写的，取本层层高减上一层写的楼板；顶层或单层没有作者值的，什么也不报并给出 coverage 原因；作者值与推算值不一致时出一条诊断。

**建议：`clear <expr>`**，复用已有的关键字 `clear`（协调者的决定）。

- 多层：`level 3 "OG" height 2750 clear 2340 { … }`；头部子句的固定顺序是 `height`、`slab`、`clear`，与窗的竖向子句 `sill` 再 `head` 的固定顺序同理（`src/plan-json/emit.ts:210-213` 的注释）。
- 单层：`height 2600 clear 2340`，写在 plan 层的 `height` 那一行。多层平面的 plan 层 `height … clear …` 报码（新码 `E_CLEAR_SCOPE`），提示写进各 `level` 头部：plan 层的 `height` 在多层平面里是各层的默认层高，一个默认的净高不是作者对某一层说的话。
- 为什么是 `clear` 而不是新词 `ceiling`：英文的术语就是 clear height（德文 lichte Höhe，#532 写作 LH），而 `clear` 在 `dim clear` 里已经是"扣掉构造之后的净尺寸"，意思一致；不加新词。`clear` 只在 `height` 之后读作净高，别处的意思不变。

### 3.3 `describe()` 怎么报

**字节恒等的闸门**（MF-D1 第 2 条，按 RM-D17 推广到净高子句）：全图一个 `slab` 也没写、一个 `clear` 也没写时，SVG、`describe()`、`lint()`、`compile().diagnostics` 都逐字节不变，不加任何跳过说明。

写了其中任何一个时，`slab` 与 `clear` 也算"作者写了竖向子句"，`plansAuthorHeights` 返回真（`src/datum.ts:335-360` 加两种情况），`heights` 块出现。每层的 `heights` 加：

| 字段 | 何时出现 | 值 |
|---|---|---|
| `slab` | 该层写了 `slab` | mm，原样 |
| `clear_height` | 能给出时 | mm |
| `clear_height_source` | 与 `clear_height` 同时 | `authored`（作者写了 `clear`）或 `derived`（本层层高 − 上一层的 `slab`） |
| `clear_height_omitted` | 给不出时 | 原因词：`no-slab-above`（上一层没写 `slab`）、`top-storey`（顶层，没有作者值）、`single-storey`（单层，没有作者值）、`default-storey-height`（本层层高是默认的 3000，不是作者写的） |

最后一个原因词是本稿加的：`storey_height` 在没人写层高时取 3000（`src/describe/types.ts:233-235`），拿它减楼板得出的"净高"是猜的，违反 MF-D1"不猜"。

**不一致的诊断：** 作者写了 `clear`，又能由层高减上一层的 `slab` 推出一个值，两者按 `describe()` 打印的整毫米比较不相等时，`compile()` 出一条警告（新码 `W_CLEAR_HEIGHT_MISMATCH`，span 在 `clear` 子句上，消息写出两个数和它们的来源）。报的仍是作者的值（RM-D17"作者写了就用"）。用打印出来的整毫米比较，免得表达式求值的浮点尾数造成假报。这条诊断只在用了新子句的图上出现，所以 `compile().diagnostics` 的字节恒等律照样成立。

**3D 包：** 按 MF-D1 第 5 条，写了 `slab` 的层，`archlang-3d` 读作者的值代替账本里的 `slab-default-200`；没写的照旧，laneway 的 Mesh3D 与 GLB 钉子不动。3D 经 `resolvePlan` 读解析后的层（ADR 0031），所以核心要把 `slab`、`clear` 放进一个公开类型的非下划线字段（这是一个加性的公开面变化，带它自己的字节恒等证明，`.claude/rules/archlang-3d.md`）。这一半可以在 RM6.1 之后另开小卡。

### 3.4 Plan JSON

`level` 今天整个在 `dropped` 里（`src/plan-json/to-json.ts:566-573` 的 `level` 行，`text` 写 `level <n> "<name>"`）。建议 RM6.1 不给 Plan JSON 加字段：多层平面的 `slab`、`clear` 跟着 `level` 行一起丢，`level` 行的 `text` 照实写出整个头部（`level 3 "OG" height 2750 slab 320 clear 2340`）；单层平面的 `clear` 加一个新的丢弃词 `clear height`（进 `PlanJsonDroppedClause` 与 `DROPPED_WORDS`，`src/cli/serialize.ts:139`）。要不要把它们搬进 Plan JSON，由 RM3.1 的范围表决定（`plan-json-scope.md` §2 已列）。`section` 同理：先进 `dropped`（新丢弃词 `section`）。

## 4. 字节恒等律（给 RM6.1 的 PR）

三个形式各一条：

1. 没写 `section` 的图：SVG、`describe()`、`lint()`、`compile().diagnostics` 逐字节不变。
2. 一个 `slab` 都没写的图：同上四处不变（MF-D1 第 2 条的写法）。
3. 一个 `clear` 都没写的图：同上四处不变。

另加：`describe()` 只在用了新子句的图上变；`archlang-section` 的示例 `haus_winders.arch`（MIT，#532）加剖切线、楼板与净高后 `describe --json` 能喂给它（PR 里跑一次该工具作说明，不进测试）。

## 5. 需要所有者裁定的

无。四件事、两种拼写与诊断都在 MF-D1、RM-D17 已经裁定的语义之内，不碰铁律或 ADR：剖切符号是平面元素（drawing-set README 原则 2："核心可以画平面上的剖切符号，那是平面图元素"），楼板与净高"只进数据，不画任何东西"。新的诊断码与 `describe()` 键都是新语言形式自带的、受字节恒等律约束的变化。全部是协调者的决定。

（3D 读楼板值时要在核心加一个公开字段，那是 ADR 0031 允许的加性导出，不是对 ADR 的修改。）

## 6. 不做

- 不在核心画任何高度、剖面或标高（铁律）。
- 不碰 DS13（在 `archlang-3d`，按 D3 等 Show HN 之后）。
- 不给没写楼板的图加跳过说明；不用默认值猜板厚或顶层净高。
- 不做斜剖切线、折线剖切（阶梯剖）、只标某一层的剖切线。
