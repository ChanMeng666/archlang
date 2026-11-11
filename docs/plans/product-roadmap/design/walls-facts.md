# 设计稿：`describe --facts walls`（RM7.2，#681）

**状态：** 草案，2026-11-11 写成，基线 `main@6059e52a`。对应卡 RM7.2（`../cards.md` 阶段 E，依赖 CRF1 与本稿）。本稿只写设计，不改代码；`file:line` 在基线上读过，动手前重新确认。

**一句话：** 加一个 opt-in 事实 `walls`，按每面墙一行列出绘出的墙（含 `walls from rooms` 推导的每一段），行的 `id` 与 `heights.walls[].id` 逐行对齐；推导段另带它所属的 spec 名，接上默认 `describe()` 的 `derived_walls[]`。默认输出一字不变。

## 1. 今天的事实

**推导墙存在哪里。** `walls from rooms` 解析出 `RWallsFromRooms`，推导的墙放在 `_derivedWalls: RWall[]`，每个 spec 一行事实放在 `_derivedRows: DerivedWallRow[]`，两者都标 Internal（`src/ir/types.ts:843-847`）。推导墙进 `ResolvedPlan.walls`，不进 `elements`（同文件第 827-832 行的注释）。每段 `RWall` 的字段（`src/elements/walls-from-rooms.ts:252-279`）：

| 字段 | 值 | 出处 |
|---|---|---|
| `id` | piece 名：spec 名本身，或 `<spec>~<k>`（k ≥ 2） | `src/room-tiling.ts:1394` |
| `category` | `exterior` 或 `partition`（spec 的 `role`） | `walls-from-rooms.ts:254` |
| `thickness` | 外圈用 `exterior`，隔墙用 `between … thickness` 的值，否则 `partition` | `walls-from-rooms.ts:255` |
| `height` | 本层层高（`ctx.storeyHeight`） | `walls-from-rooms.ts:259` |
| `points[]`、`closed` | 该段的折线；没有被作者墙占去任何一段的环是一条闭合折线 | `walls-from-rooms.ts:260-261`；`room-tiling.ts:1372` |
| `status` | 语句写了 `status` 才有 | `walls-from-rooms.ts:264` |
| `_derived.ring` | 只在环上：`outer` 或 `inner`（院子的环） | `src/ir/types.ts:230-241` |
| `_derived.between` | 只在隔墙上：两个房间，按源码顺序 | 同上 |
| `_derived.open` | 隔墙被 `open between` 挖空时有；`whole` 表示整段净跨都挖空 | 同上 |

推导段都是轴对齐直线（`room-tiling.ts` 只处理直角房间），所以没有弧；材料永远是默认值（`walls-from-rooms.ts:256`）。

**spec 名与 piece 名。** spec 名是 `exterior`、`exterior#<k>`（第 k 个环）、`<A>|<B>`、`<A>|<B>#<k>`（同一对房间的第 k 段），见 `src/room-tiling.ts:166-167,398-400,418`。作者墙压在推导路径上时（ADR 0028 §3 的共存），被压的跨度记进 `dropped`，剩下的连续段才是 piece：第一段沿用 spec 名，其余是 `<spec>~2`、`<spec>~3`……（`room-tiling.ts:1320-1396`）。在 `place` 里，名字带实例前缀（`west.<A>|<B>`）。

**三个已有的读法，键不一样：**

| 输出 | 一行是什么 | 键 | 出处 |
|---|---|---|---|
| `describe().derived_walls[]` | 一个 spec（共存之前） | `name` = spec 名；带 `between` 或 `around`、`dropped` | `src/describe.ts:458-470,767`；`src/ir/types.ts:812-824` |
| `describe().heights.walls[]` | 一面绘出的墙（作者墙与推导段，含已拆除的） | `id` = piece 名 | `src/describe.ts:772-781`（`drawnView(ir).walls`） |
| `describe --facts depends` 的 `depends.derived_walls[]` | 一个推导段 | `name` = piece 名；用 `w.id.replace(/~\d+$/, "")` 回找 spec 行 | `src/analyze/depends.ts:323-353`（第 340-342 行） |

**卡的前提有一处不成立：** 卡与 `cards.md` 设计稿清单说新事实"按墙 `id` 与 `describe --facts quantities` 对齐（`src/analyze/quantities.ts` 按 `id`）"。读代码，quantities 的墙不按 `id`：`quantities.walls[]` 是**按 `category` 汇总**的行（`count`、`length_centreline_mm`、`length_face_mm`、`face_area_before_openings_m2`；`src/analyze/quantities.ts:60-73,236-256`），按 `id` 的只有 `quantities.rooms[]`。所以与 quantities 的对齐只能是按 `category` 的汇总一致，不是逐行对齐；见 §2.4。

**两套墙集合。** `heights.walls[]` 读 `drawnView(ir).walls`，含 `status demolish` 的墙（`src/ir/sheet.ts:74-75`；`src/ir/types.ts:1024-1030`）；quantities 读 `ir.walls`，是拆除之后的平面。`derived_walls[]` 在语句写了 `status demolish` 时整组不列（`src/describe.ts:464-467`）。

## 2. 要定的事与建议

### 2.1 列哪些墙

| 选项 | 说明 |
|---|---|
| A. 只列推导段 | 卡的写法："没有 `walls from rooms` 的图，`--facts walls` 输出为空并说明" |
| B. 列每面绘出的墙，推导段另带推导信息 | 与 `heights.walls[]` 同一个集合、同一个顺序 |

**建议 B**（协调者的决定）。理由：#681 列的下游（剖面、IFC、射频与疏散叠加）都要全部的墙；作者墙的几何今天在 Plan JSON `walls[]` 里，推导段只在这个新事实里，选 A 时每个下游仍要自己把两边拼起来，而 #681 抱怨的正是"每个下游各自重建"。选 B 时新事实与 `heights.walls[]` 由同一个数组派生，逐行对齐由构造保证，测试只需断言两边的 `id` 序列相等。作者墙的信息 Plan JSON 已经公开，没有新的泄露面。代价：作者墙可能带弧与材料，要多映射两个字段（形状照抄 Plan JSON 的 `WallPointJson`，`src/plan-json/types.ts:30-45`）。若协调者要守住卡的范围和 500 行的规模门，取 A，并把 B 记成后续卡；A 的行形状与下表相同，只是没有作者墙的行。

### 2.2 行的字段

键名 `walls`（顶层 `SceneSummary` 今天没有 `walls` 键，`src/describe/types.ts:585` 起；`heights.walls`、`freedom.walls`、`wall_status.walls`、`quantities.walls` 都是嵌套的）。每行：

| 字段 | 何时出现 | 值 |
|---|---|---|
| `id` | 总是 | 作者墙的 id；推导段的 piece 名 |
| `source` | 总是 | `authored`、`rooms`（`walls from rooms`）、`between`、`around`（ADR 0028 §4 的作者成对墙） |
| `category` | 总是 | `RWall.category` |
| `thickness` | 总是 | mm |
| `points` | 总是 | `{x, y}` 数组，弧在到达点上带 `arc`（与 Plan JSON 同形）；数照 `heights`、`derived_walls[].dropped` 的打法原样输出，不另加取整 |
| `closed` | 总是 | 布尔 |
| `status` | 墙有 `status` 时 | 与 `wall_status` 同值 |
| `height` | 只在高度闸门 `_heightsAuthored` 打开时 | 与 `heights.walls[].height` 同值；闸门关着时不出现，免得把默认层高说成作者写的 |
| `spec` | 只在推导段 | 所属 spec 名 = `derived_walls[].name`；显式给出，不让读者靠剥 `~k` 后缀去猜（`depends.ts:342` 的正则是内部做法，不写进公开契约） |
| `ring` | 只在推导环 | `outer`、`inner` |
| `between` | 推导隔墙与作者 `between` 墙 | 两个房间 |
| `around` | 作者 `around` 墙 | 房间列表 |
| `open` | 被 `open between` 挖空的推导隔墙 | `{ whole?: true }`；挖出的洞口本身照旧在 `openings[]` 里 |

`material` 只在作者墙不是默认材料时出现（与 Plan JSON 同规则，`src/plan-json/to-json.ts:212-214`）。

### 2.3 与默认 `derived_walls[]` 的关系

- `derived_walls[]` 不动：它是共存之前、按 spec 的事实（ADR 0028 §6），默认 `describe()` 一字不变是本卡的字节恒等律。
- 一个 spec 对应一个或多个 piece；新事实的每个推导行用 `spec` 指回 `derived_walls[].name`，被作者墙占去的跨度仍只在 `derived_walls[].dropped` 里。
- `status demolish` 的语句：`derived_walls[]` 整组不列；新事实与 `heights.walls[]` 一样照列这些段，带 `status: "demolish"`。文档要写明这处不对称，它来自两个既有输出的不同定义，不是新事实造成的。
- 每层一份：顶层是最低层，`levels[i].walls` 是第 i 层，做法同 `quantities`（`src/describe.ts:944-950`）。不进 `PER_STOREY_OPTIONAL_KEYS`（`src/describe.ts:1012-1018`）的条件与 quantities 相同。

### 2.4 与 quantities 的对齐

逐行对齐做不到（§1）。建议的证明：对每个 `category`，新事实里该类别（拆除之后的集合，即不含 `status: "demolish"` 的行）的行数等于 `quantities.walls[]` 该类别的 `count`，中心线长度之和（按 `wallCentrelineLength`，`quantities.ts:125-129`）等于 `length_centreline_mm`。测试从同一个 `ir` 派生，不重算几何。

### 2.5 粒度的稳定性

**段的粒度在 CRF1 之后才稳定。** CRF1（`../../checker-reach/README.md:114`）要合并 CR8 网格单元切分留下的共线相邻段，它会改变 piece 的条数和名字；所以 RM7.2 排在 CRF1 之后（`../cards.md`）。即使在 CRF1 之后，piece 名也只对同一份源文件、同一个核心版本稳定：作者加一面压在推导路径上的墙，就会多出 `~k`。文档要写："按 `id` 关联同一次 `describe` 输出里的各块；不要跨版本或跨编辑保存 piece 名。"

### 2.6 跨引擎探针

新事实进 `engineProbeParts`（`test/helpers/byte-identity-payload.ts:91-101`）：第 99 行的 `facts: ["symmetry", "syntax"]` 加上 `"walls"`。它只被 `scripts/engine-digests.ts` 读（运行时比较 Node 与三种浏览器，不是钉住的摘要），所以加了之后探针载荷变，但没有钉值要重钉。新事实只读已解析的坐标，不调 `sin`、`cos`、`atan2`，预期各引擎一致；探针是证明，不是假设。

### 2.7 消费者（照实写）

| 读者 | 状态 | 出处 |
|---|---|---|
| `gerontec/archlang-section` | **可能的读者**：今天从 `compile -f json` 的 `walls_from_rooms` 厚度自己重建墙 | #532 正文 |
| IFC 下游包 | **可能的读者**：growth 2026-11-10 决策把本事实定为它的前置；包本身不存在（`../cards.md` "等待触发"表） | #681 "Context" 段 |
| 射频叠加、疏散叠加 | **可能的读者**：#681 列出，没有具名仓库 | #681 正文 |
| 本仓库 | 没有读者：`archlang-3d` 经 `resolvePlan` 直接读 `ir.walls`（ADR 0031），不读 `describe()` | `resolvePlan` 在 `packages/archlang-3d/src/adapter/adapt.ts:93`；读 `ir.walls` 在 `adapt.ts:110,127` 与 `packages/archlang-3d/src/scene3d/build.ts:211` |

没有具名消费者。按原则 9，这张卡排进来的理由是 growth 决策的前置关系（RM-D12），不是一个已有的读者。

## 3. 证明（给 RM7.2 的 PR）

- 默认 `describe()` 在语料上一字不变（字节恒等律，SVG + `describe()` + `lint()` + `compile().diagnostics`）。
- 新事实的 `id` 序列等于 `heights.walls[]` 的 `id` 序列（闸门关着时，与 `drawnView(ir).walls` 的 `id` 序列比）。
- 推导段的并集等于绘出的墙芯：从同一份 `_derivedWalls` 派生，不重算。
- §2.4 的按类别对齐。
- `arch describe examples/two-bed.arch --facts walls --json` 贴进 PR。

## 4. 需要所有者裁定的

无。本稿的选择（§2.1 的 A 或 B、字段名、`spec` 显式给出、每层一份）都不碰铁律或 ADR：新事实是 opt-in 的，不改默认 `describe()`，不建墙体接合（铁律）。全部是协调者的决定。

## 5. 不做

- 不建墙体接合来回答 #681 的"Junction trimming should follow what the renderer draws"：新事实给的是墙芯折线与厚度，交接处的修剪是绘图的事，读者需要时用核心公开的 `joinWallSet`（ADR 0031）。
- 不给 Plan JSON 加只出不进的墙字段（卡的"不许"）。
- 不写任何 IFC 承诺或 "IFC-ready"。
