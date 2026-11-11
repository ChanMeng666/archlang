# 设计稿：Plan JSON 的范围表（RM3.1）

**状态：** 草案，2026-11-11 写成，基线 `main@6059e52a`。对应卡 RM3.1 前半与后半（`../cards.md` 阶段 D），以及 RM8.7 的"3D 读 `floor`"。本稿只写设计，不改代码；`file:line` 在基线上读过，动手前重新确认。

**一句话：** 下表逐个顶层语句与元素子句，写出 Plan JSON 今天是"往返"、"按结果承载"、"部分"还是"丢弃"，每个"丢弃"都已由 `dropped` 报出；RM3.1 前半把 `outdoor`、`fence`、`floor` 三项搬进范围，3D 读作者写的 `floor` 不走 Plan JSON，而走 `resolvePlan` 已经公开的 `RRoom.floor`。

## 1. 今天的事实

- **入口与部件：** `src/plan-json.ts` 是入口，部件在 `src/plan-json/`：`to-json.ts`（投影）、`emit.ts`（JSON 回 `.arch` 文本）、`from-json.ts`（校验）、`types.ts`、`schema.ts`（`.claude/rules/plan-json.md`）。
- **丢弃从不静默：** 投影不到的子句由 `planToJson` 的 `dropped` 逐条报出，种类是 `PlanJsonDroppedClause`（`src/plan-json/to-json.ts:414-436`），每层的在 `droppedFromStorey`（第 453-488 行），全图的在 `droppedFromPlan`（第 491-519 行），`keep` 与 `level` 在 `planToJson` 里（第 563-573 行）。CLI 把它们印成 stderr 的说明（`DROPPED_WORDS`，`src/cli/serialize.ts:139`），`test/plan-json-dropped.test.ts` 钉住。
- **没有行的元素种类：** `UNPROJECTED_KINDS` 由 `KIND_FACETS.unprojected` 派生（`src/plan-json/to-json.ts:406-408`；`src/elements/facets.ts:49-55`）：`stair`、`elevator`、`escalator`、`roof`、`void`、`outdoor`、`fence`。
- **今天的往返律：** 非脚本、分组的平面，`planFromJson(planToJson(src))` 编出逐字节相同的 SVG（`test/plan-json.test.ts:193-232`）；做不到的示例列在 `CANNOT_ROUND_TRIP`（`test/tables/plan-json-gaps.ts`），带丢失的语言面与一个必须仍然匹配文件的 `proof`。基线上 `examples/*.arch` 有 37 个，其中 29 个在 `CANNOT_ROUND_TRIP` 里，8 个往返。今天的律只比 SVG；RM3.1 的新律（`test/plan-json-roundtrip-law.test.ts`）要比 SVG + `describe()` + `lint()`。

## 2. 范围表

"往返"= 写进 Plan JSON 并由 `emit.ts` 写回原子句；"按结果"= Plan JSON 写的是它产生的元素，不是它本身（`planToJson` 文档注释："a loop is exported as what it made, a `place`d element by its plan coordinates, a relational position by its result"，`to-json.ts:543-548`），这是设计如此，不算丢；"部分"= 一部分往返，其余进 `dropped` 或改了写法；"丢弃"= 整个进 `dropped`。

### 2.1 plan 层语句与设置

| 语句 | 状态 | 依据 | RM3.1 的处理 |
|---|---|---|---|
| `plan "<name>"` | 往返 | `plan` 字段 | 范围内 |
| `units mm` | 往返 | `units: "mm"`；解析器只接受 `mm`（`src/parser.ts:757-762`） | 范围内 |
| `grid` | 往返 | `emit.ts:36` | 范围内 |
| `paper` | 往返 | `emit.ts:39`；自动适配的比例不写回（`scale_auto`） | 范围内 |
| `scale` | 部分 | 往返（`emit.ts:40`）；`scale … hidden` 进 `hidden` | 范围内；`hidden` 见下 |
| `north` | 部分 | 往返（`emit.ts:41-42`）；`hidden` 同上 | 同上 |
| `site { street … hemisphere … }` | 部分 | 两个字段往返（`emit.ts:46-47`）；`boundary` 进 `site boundary`（`to-json.ts:494`） | `boundary` 保持丢弃 |
| `dims auto` | 往返 | `dims_auto`（`emit.ts:51`） | 范围内 |
| `height <mm>`（plan 层） | 往返，受闸门 | 只在 `_heightsAuthored` 时写 `storey_height`（`to-json.ts:369`；`emit.ts:55`） | 范围内 |
| `title { … }` | 部分 | 各字段往返（`emit.ts:74-77`）；`title hidden` 进 `hidden` | 范围内 |
| `accTitle`、`accDescr` | 丢弃 | `to-json.ts:516-517` | 保持丢弃 |
| `theme` | 丢弃 | `to-json.ts:513` | 保持丢弃 |
| `style <kind> { … }` | 丢弃 | `to-json.ts:514-515` | 保持丢弃 |
| `axes` | 丢弃 | `to-json.ts:493`；`at axis …` 定位的洞口按坐标导出（`to-json.ts:240-244`） | 保持丢弃 |
| `schedule rooms`、`schedule openings` | 丢弃 | `to-json.ts:495-501` | 保持丢弃 |
| `legend` | 丢弃 | `to-json.ts:502` | 保持丢弃 |
| `notes` | 丢弃 | `to-json.ts:505` | 保持丢弃 |
| `sheet text { … }`、`decimal` | 丢弃 | `to-json.ts:506-511`（`sheet text`、`decimal mark`） | 保持丢弃 |
| 各处的 `hidden` 标记 | 丢弃 | `to-json.ts:503-504`（`hidden`） | 保持丢弃 |
| `level <n> ["name"] [height …] { … }` | 部分 | 每层由 `pages[]` 单独投影；`level` 本身进 `dropped`（`to-json.ts:566-573`） | 保持现状；RM6.1 的 `slab`、`clear` 跟着 `level` 行丢（`slab-and-section.md` §3.4） |
| `zone` | 丢弃 | `to-json.ts:485-486` | 保持丢弃 |
| `keep` | 丢弃 | `droppedKeeps` 与 `keep` 行（`to-json.ts:564`；ADR 0033） | 保持丢弃（PS4.10 才承载） |
| `let`、`for`、`if`、`while`、`set`、赋值 | 按结果 | 脚本不承载，设计如此（`.claude/rules/plan-json.md` 末条） | 范围外，不标丢弃 |
| `strip` | 按结果 | 写成它展开出的房间 | 范围外；`strip` 里房间的 `floor` 按 §2.2 |
| `component` + `place` | 部分 | 一般按结果（展平的行，`instance` 标记只在承载实例时出现）；推导墙的实例由 `components`/`instances` 承载（PS3.9，`to-json.ts:611` 起），嵌套 `place`、`import` 进来的组件、实参不同的同名组件被拒（`E_JSON_DERIVED_IN_INSTANCE`） | 前半：`place` 标 `dropped`；后半把 `place` 移进范围或照实保持 `dropped`（`../cards.md` RM3.1 后半） |
| `import` | 丢弃（设计如此） | `CANNOT_ROUND_TRIP` 的 "`import` — refused by design" | 保持 |

### 2.2 元素与子句

| 元素 / 子句 | 状态 | 依据 | RM3.1 的处理 |
|---|---|---|---|
| `room`（矩形、`polygon`） | 往返 | `to-json.ts:169-190` | 范围内 |
| `room` 的 `uses` | 往返 | 作者写的才写（`to-json.ts:176-178`）；从标签推出的用途不写，回程由标签再推（`emit.ts:166-185`） | 范围内；见 §3 的 PS0.18 |
| `room circle` | 部分 | 文档留 48 边形，`dropped` 报 `circle`（`to-json.ts:470-471`） | 保持丢弃 |
| `room … label at` | 丢弃 | `to-json.ts:472-473` | 保持丢弃 |
| `room … floor <pattern>` | 丢弃 | `to-json.ts:474-475` | **前半移进范围**（§4） |
| `wall` | 往返 | 点、弧、厚度、`status`、`closed`、非默认材料（`to-json.ts:199-217`） | 范围内 |
| `wall … material poche scale/angle` | 部分 | 默认材料不写缩放与角度，`dropped` 报 `poche hatch`（`to-json.ts:463-468`） | 保持丢弃 |
| `walls from rooms` | 往返 | 写语句，不写它推导的墙（`to-json.ts:219-228`；`emit.ts:112-114`；ADR 0028 §3） | 范围内 |
| `door` | 往返 | 种类允许的子句才写（`to-json.ts:246-266`）；`swing_building` 在实例里不写 | 范围内；PS0.20 在后半 |
| `window` | 部分 | 往返，但 **J16**：在高度闸门下每扇窗都写 `sill`（`to-json.ts:270-276`），回程后默认窗台变成作者写的窗台 | 见 §3 |
| `opening` | 往返 | `open between` 推出的洞口按子句导出，不写成行（`to-json.ts:230-238`） | 范围内 |
| `furniture` | 往返 | 位置子句按作者写的导出（`to-json.ts:279-327`）；`facing` 在实例里不写 | 范围内 |
| `dim (x,y)->(x,y)` | 往返 | `to-json.ts:329-338` | 范围内 |
| `dim faces\|clear …`、`dim radius\|diameter …` | 部分（未验证） | 只写解析后的两端与 `text`，`faces`、`clear`、`radius`、`diameter` 的写法不写；往返后 SVG 是否逐字节相同，基线上没有测试回答 | 前半的往返律要给出答案：相同就列"按结果"，不同就加丢弃词 |
| `column` | 部分 | 往返，但写在家具之前的柱回程后排在家具之后，`dropped` 报 `column order`（`to-json.ts:476-480`） | 保持丢弃 |
| `stair`、`elevator`、`escalator` | 丢弃 | `UNPROJECTED_KINDS`；schema 的描述写明"Vertical circulation … is not projected"（`src/plan-json/schema.ts:71`） | 保持丢弃 |
| `roof`、`void` | 丢弃 | `UNPROJECTED_KINDS` | 保持丢弃 |
| `outdoor` | 丢弃 | `UNPROJECTED_KINDS` | **前半移进范围**（PS0.21，卡已定） |
| `fence` | 丢弃 | `UNPROJECTED_KINDS` | **前半移进范围**（PS0.21） |
| RM6.1 的 `section`、`slab`、`clear` | 尚不存在 | — | RM6.1 先让它们进 `dropped`（`slab-and-section.md` §3.4）；搬进 Plan JSON 是之后的一次加性变更，按 `schema-policy.md` 记录 |

## 3. J16 与 PS0.18

**J16（每扇窗写 `sill`）：** `preview-and-remodel` J16 的原文："Plan JSON writes `sill` for every window under the heights gate, so a round trip makes a default window look authored once `outdoor` is projected."（`../../preview-and-remodel/cards.md:229`）。代码：`if (e.kind === "window") base.sill = e.sill;`（`src/plan-json/to-json.ts:273`），`emit.ts:213` 写回 ` sill <n>`。今天的 SVG 往返不受影响（画出的窗台相同），但 `describe()` 与任何区分"作者写的窗台"和"默认窗台"的读者会看到差别。**状态：部分。** 建议前半修掉：投影只在作者写了 `sill` 时写它（解析后的窗要带一个"作者写过"的标记，像 `_idAuthored` 那样；需要在 `RWindow` 上加一个下划线字段，或在 `to-json.ts` 里回读 AST），否则新律在有高度、有窗的图上比 `describe()` 时会红。这是协调者的决定，属于 RM3.1 前半的范围。

**PS0.18（Hall 往返成 `uses entry`）：** 卡原文（`../../plan-soundness/cards.md:37`）描述的现象——只有标签"Hall"的房间回程后写成 `uses entry`——已由 `78e0b7f9`（2026-11-05，"fix(plan-json): a label-inferred use survives the round trip"）在回程一侧修掉：当标签或 id 推出的用途已经对应这个 `room_type` 时，回程不写 `uses`，由标签再推一次（`src/plan-json/emit.ts:166-185`，测试 `test/plan-json-uses-roundtrip.test.ts`，第 37 行就是 `label "Hall"`）。卡里问的"honest mapping"（承载分类出的 `uses`，还是把 `Entrance` 映射回产生它的用途）没有被裁定，PS0.18 在 plan-soundness 里仍是 `todo`。本稿没有跑 CLI 复现，只读了代码与测试。**按简报，PS0.18 在范围表里标 `dropped`（待所有者裁定）**；同时建议 RM3.1 前半在新律里加一例 `label "Hall"` 的房间，若它在 SVG + `describe()` + `lint()` 上都往返，就把这个发现交给所有者，请他确认 PS0.18 可以按 `78e0b7f9` 关闭。是否关闭：**需要所有者裁定**（它在 `../README.md` §6"仍等所有者"的名单里）。

## 4. `floor`：Plan JSON 与 3D（与 RM8.7 一起定）

今天 `floor` 在 `PlanJsonDroppedClause` 里（`src/plan-json/to-json.ts:419,474-475`）；`RRoom.floor?: FloorMaterial` 的注释是"read only by the drawing and the legend. Never reaches `describe()` or `lint()`"（`src/ir/types.ts:313-316`）；3D 今天按 `uses` 猜地面（`floorFinish`，`packages/archlang-3d/src/materials.ts:137-146`；账本 `floor-finish-default`，`packages/archlang-3d/src/mesh/build.ts:354`）。RM8.7 的卡给了 3D 读作者 `floor` 的两条路：核心新增一个加性公开导出，或 RM3.1 把 `floor` 搬进 Plan JSON。

**读代码后有第三条路，而且不用新增任何导出：** 3D 已经经 `resolvePlan` 读解析后的平面（`packages/archlang-3d/src/adapter/adapt.ts:82-93`），场景构建直接拿 `RRoom`（`packages/archlang-3d/src/scene3d/build.ts:101-105` 的 `floorOf(r: RRoom, …)`）。`RRoom` 是 ADR 0031 公开的八个元素类型名之一（`src/index.ts:490`；ADR 0031 第 18-19 行），ADR 0031 不承诺的只是下划线字段（第 100 行），`floor` 不带下划线。所以 3D 读 `r.floor` 就在已有的缝之内。（`FloorMaterial` 这个类型名没有从 `src/index.ts` 导出，但字段类型经 `RRoom["floor"]` 可达。）

| 选项 | 代价 | 评价 |
|---|---|---|
| A. 新增一个加性公开导出 | 一个新名字、一条自己的字节恒等证明 | 不需要：要读的字段已经公开 |
| B. 3D 从 Plan JSON 读 `floor` | 3D 要多跑一次 `planToJson`（今天只为有手性家具的图才跑，`adapt.ts:60-73`），并且依赖 RM3.1 | 不取：把 3D 绑在 RM3.1 上，还多一次投影 |
| C. 3D 读 `resolvePlan` 的 `RRoom.floor` | 零个新导出 | **建议**（协调者的决定）：RM8.7 不依赖 RM3.1 |

与 3D 无关，**建议 RM3.1 前半同时把 `floor` 搬进 Plan JSON**（协调者的决定）：`rooms[].floor` 一个可选键（加性，只在写了时出现，所以没写 `floor` 的图载荷不变），`emit.ts` 写回 ` floor <pattern>`，`from-json.ts` 按 `FLOOR_MATERIALS`（`src/hatches.ts:72`）校验词形。它是一个闭集里的词，往返简单；之后 RM8.7 加的新词只是放宽枚举，按 `schema-policy.md` 是只增变更。基线上 `examples/**` 里没有一张图写 `floor`（`../cards.md` RM8.7），所以示例的往返结果不变。

## 5. 往返律的形状（给 RM3.1 前半）

- 法则：范围内（上表"往返"与"按结果"）的每个示例，`-f json` → `--from-json` → SVG + `describe()` + `lint()` 逐字节相同。
- 范围外的形式在 Plan JSON 里显式标 `dropped`；测试从 `PlanJsonDroppedClause` 派生清单，断言每个丢弃词在本表里有一行（不在测试里重抄本表）。
- `CANNOT_ROUND_TRIP` 继续存在：每个示例的 `because` 要能由本表的某一行解释。
- 前半做完后，`outdoor`、`fence`、`floor` 从 `UNPROJECTED_KINDS` 与 `PlanJsonDroppedClause` 里出来；含它们的示例（例如 hillside-villa，它的 `because` 写着 "`outdoor`/`fence`/`roof`"）若只因它们而不能往返，就从 `CANNOT_ROUND_TRIP` 移出。

## 6. 需要所有者裁定的

- **PS0.18 是否按 `78e0b7f9` 关闭**（§3）。在裁定之前，范围表里标 `dropped`。

其余（J16 前半修、`floor` 进 Plan JSON、3D 走 `RRoom.floor`、`dim` 变体的判定方法）都是协调者的决定，不碰铁律或 ADR：Plan JSON 的加性变更是 `version: 1` 的既定规则，3D 读公开类型的非下划线字段在 ADR 0031 之内。

## 7. 不做

- 不给 Plan JSON 加任何 3D 字段或只出不进的字段（RM3.1 的"不许"）。
- 不承载脚本、`import`、`keep`、图纸层（`axes`、`schedule`、`legend`、`notes`、`sheet text`、`theme`、`style`、无障碍元数据）。
- 不为了让法则变绿把形式移出范围表而不标 `dropped`。
