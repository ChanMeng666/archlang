# 04 · ArchLang 仓库可行性审计（供后续规划文档使用）

> 调研原始记录（2026-11-02，基线 `main@18127701`）。结论若与 `../README.md` 冲突，以 README 为准；勘误见 README §1.3。文中“探针”指当时的一次性文件，未入库，只有 Band Envelope 探针留在 `../spike/band-envelope.mjs.txt`。

审计基线：`main@18127701`，`node dist/cli.js --version` 输出 `1.50.0`（未重建）。所有探针文件在 `（探针目录）`。行号均指该提交。"估算"字样是我的判断，不是测量；其余数字都来自文中给出的命令或文件。工作量单位是"AI 协作日"：一个执行代理加一轮红队，含法则测试，不含 CI 排队。

---

## 0. 结论先行

| 项 | 建议 | 规模（估算） | 风险 | 排期 |
|---|---|---|---|---|
| A 重复楼层 | 字面量糖 `level 2..5 "Typical" [as n] { … }`，在 `levelBlocks()` 展开；不让 `for` 生成楼层。另做 `place … as "b{i}"`，不做 `id="c{i}"` | 2.5 + 1 日 | 低到中 | 11-24 前 |
| B 场地层 | 不开新顶层形式。先用 `tools/` 脚本（无新语法，已跑通）；再做 `building polygon` 元素；`building from` 放到 Show HN 之后 | 0.5 / 3–4 / 5–7 日 | 高（第三档） | 只有前两档进 11-24 前 |
| C 派生指标 | `describe --facts indicators`（opt-in），后接 `schedule indicators`；打印高度要 D-entry | 2 + 2 日 | 中 | 11-24 前 |
| D 地面弧线 | 扩展 `outdoor … polygon` 的 `arc` 边，加 `track` 种类；不做 fixture | 3–4 + 1 日 | 中 | 11-24 前，可砍 |
| E `cn-school` | `uses classroom` 只进 `USE_KINDS`，不进标签词表；画像命名 `cn-school-advisory`，数字必须读 GB 50099 原文 | 1 + 2–3 日 | 低（代码）/ 中（来源） | 11-24 前 |
| F 剖面/立面 | 核心永不画；放 `archlang-3d`，不违法，但受 N10 与曝光分级约束 | 本轮不做 | — | N10 读数之后 |

三个最容易被规划文档漏掉的硬约束：

1. **`spec.llm.md` 只剩 245 字符**（29,754，上限 `< 30,000`）。A–E 全做要 ~630 字符（估算），所以第一张卡必须是削减，见 §F.3。
2. **语言冻结日是 2026-11-24**，D29 没有废除它（§G.1），今天起只有 22 天。
3. **`outdoor_area_m2` 把重叠面积重复计入**：探针 b4 里 `outdoor_area_m2` 为 20,200，地块只有 19,200（§C.2）。绿地率不能直接用它。

---

## A. 重复楼层

### A.1 现状追踪

- **语法**：`parseLevel` 用 `eatNumber()` 读字面量（`src/parser.ts:656-664`）。`level 2..5` 报 `Expected lcurly but found ".."`（探针 `a1-level-range.arch`）。词法已能切出 `..`，语法之外不需要改词法。`level n`（`a5`）、`for` 内 `level i`（`a2`）都报 `Expected number`。
- **静态校验**：`checkLevels` 在解析结束时运行（`src/parser.ts:574, 615-648`），产生 `E_LEVEL_DUP`、`E_LEVEL_MIX`。`for` 在根层是 `E_LEVEL_MIX`（探针 `a10`，`LEVEL_SHARED_KINDS` 不含 `for`，`src/ast.ts:1284`）。`for` 内写 `level` 是 `E_LEVEL_NEST`（`src/parser.ts:1421-1425`）。
- **分区早于求值**：`levelBlocks`（`src/ir.ts:2048-2057`）直接读 `ast.body`；`levelPlanFor`（`src/ir.ts:2070-2088`）把共享语句克隆进每层。所以根作用域在楼层之前并不存在，共享 `let` 是每层各求值一次。
- **解析流程**：`resolveLevelsImpl`（`src/ir.ts:2179`）。有 `paper` 时每层求值两次，步数预算全楼一个计数器（`src/ir.ts:2185-2189, 2255-2258`）。标高累加（`src/ir.ts:2241-2252, 2270`）。`MAX_ELEMENTS` 5,000（`src/ir.ts:1083`）按层算（`src/ir.ts:2712`）；探针 scale300 全楼 13,500 个元素仍 `ok:true`，这证实了按层算。
- **下游**：`compile` 每层一页（`src/pipeline.ts:121-126`）；`describe` 的 `levels[]`；`keep stacked` 根层（`src/ir.ts:2292-2321`）；3D 适配器读解析后的 levels（`packages/archlang-3d/src/adapter/adapt.ts:82-84`）。这些都只看解析后的结果，**展开发生在它们之前就都不用改**。
- **井道身份**：同 id 跨层即同一井道（`src/vertical.ts:366-405`），纯身份匹配。层内 id 互不冲突，`place … as t` 可每层重用（`seenInstances` 每次 resolve 重建，`src/ir.ts:2723`；探针 `a7` ok）。所以重复楼层的楼梯**自动成井道**，这是这个设计最大的白捡。探针 `a6` 证实：`vertical.connections[0].levels = [1,2,3]`。
- **今天的替代写法**：`component typical(n) {…}` 加每层一行 `level k { typical(k) }`，探针 `a6` 全绿。所以糖的净收益是把 N 行变 1 行，不是新能力。
- **规模**：生成的 30/100/300 层字面量楼（每层 22 间房 + 楼梯），写盘全量编译 680 / 1,241 / 2,745 ms，全部 `ok:true`（`scale{30,100,300}.arch`）。预算不构成约束，见下文新发现的放大问题。

### A.2 能不能让 `for` 生成楼层？不建议

`for` 要先求值才知道有几层，而 `E_LEVEL_DUP`、`E_LEVEL_MIX` 是解析期静态的，分区也早于求值（§A.1）。要支持就得新增一个"解析前的根层求值阶段"，它既没有作用域，也没有步数计量；楼层号变成动态值后，`keep stacked`、`--level`、`keep-facts`（`src/analyze/keep-facts.ts:424`）、`fmt` 都失去静态读法。

对 AI 作者，字面量也更好：一行就能读出楼层数，错误有确切字节 span，不用写脚本。`level 2..5 as n { if n == 3 {…} }` 已能表达逐层差异，能力上不输 `for`。

### A.3 推荐设计

```
level 2..5 "Typical" [height <h>] [as n] { … }
```

- `LevelNode` 加 `through?: number`、`varName?: string`。`parser.ts:656` 解析 `..`。
- **解析期上限，新码 `E_LEVEL_RANGE`（`b <= a` 或跨度超限）。这是法则要求，不是优化**：字面量写法下楼层数正比于源码长度，而 `level 1..1000000000 {}` 一行就会在 `levelBlocks` 里分配，早于步数计量，违反 "Charge … BEFORE allocating"（AGENTS.md）。建议上限 256（估算；300 层已测可行）。
- `checkLevels` 按区间逐号查重：`level 2..5` 与 `level 3` 同时出现报 `E_LEVEL_DUP`。"拒绝，不替作者选"，要例外就拆成 `2`、`3`、`4..5`。
- `levelBlocks()` 展开为克隆节点（共享 `body`，只读），用 `WeakMap` 按 AST 记忆；`levelPlanFor` 的缓存键已含 `block.level`（`src/ir.ts:2071`），无需改。
- `as n` 的绑定：把 body 包成单项 `for n in [k] { … }`。探针 `a9-level-for-wrap.arch` 证实这个包裹下 `walls from rooms`、关系放置、`keep align` 全绿；它开子作用域，所以不与共享 `let` 产生 `E_REDEF`。

**必须改的 AST 直读点**（`rg 'kind === "level"|case "level"'` 全部列出后筛选）：

| 位置 | 动作 |
|---|---|
| `src/parser.ts:616-635` | 区间查重 |
| `src/format.ts:84-91` | 打印 `a..b [as n]`，否则 `fmt` 静默改义 |
| `src/analyze/keep-facts.ts:424` | `s.level === l.level` 改区间判断 |
| `src/repair.ts:645-648` | 注释明说 "A level is not an expansion construct"，区间层**是**展开构造，要像 `for` 一样压 `Enclosure`，否则 repair 静默改写所有楼层 |
| `src/while-fix.ts:185`、`src/cursor.ts:260`、`src/datum.ts:359`、`src/while-deprecation.ts:78` | 读一次 body，语义不变，要有测试锁住 |
| `src/import.ts:141, 262` | 不变（整文件导入丢弃 level） |

### A.4 循环内命名

- 自动 id 在循环里可用（`a4b` ok）；相同 id 报 `E_DUP_ID`（`a4c`）。
- **真正的硬墙是 `place`**：`for … { place c() as b … }` 报 `E_DUP_INSTANCE`（探针 `a8`）。也就是说，`place` 今天完全不能进循环。
- 建议：`place c(i) as "b{i}" at (…)`，字符串模板，只开这一处。`aliasTok` 在 `src/parser.ts:1341`，在 `placeFrame`（`src/ir.ts:1801`）求值。要同步的静态读 `.alias` 处：`src/ir.ts:1578`、`src/analyze/keep-facts.ts:379`、`src/impact.ts:439`、`src/repair.ts:687`、`src/statement-print.ts:344`。动态别名在 keep-facts 和 impact 里读不到，要显式跳过，不能猜。
- 不用 `as b{i}`：`{` 作为词元和块开始同形，`fence id=f { … }` 证明这条路在 `id=` 上行不通，保持两处一致。
- **不做 `id="c{i}"`**：引用侧（`wall <id>`、`in <room>`、`<room>.left`、`between A and B`、`keep`）全是 `eatIdent`，只给声明侧加插值造出的 id 无法被引用，要改就是 `parseIdOpt`（`src/parser.ts:936`）加 elements 里 38 处相关读取再加全部引用点。实例别名已经提供命名空间（`b1.x`），够用。

### A.5 冲突、规模、风险、证明

- **法则**：不改任何法则。步数预算、byte-identity、spec 配额都需要遵守。
- **风险**：
  1. 诊断膨胀：100 层的坏计划 `compile --json` 输出 2,339,340 字节（scale100 首次运行，同一错误每层重复一次）。对 agent 上下文有害。建议对同 `code`+`span`+`message` 折叠并加可选 `levels` 字段（对无区间计划字节不变）。
  2. `keep stacked` 的 `MAX_KEEP_TARGETS` 为 64（`src/keep.ts:57`），超过 64 层的塔无法一次 keep 全部楼层。
  3. 每层一个文件（`--level` 外，`<stem>.L<n>`）：30 层出 30 个几乎相同的文件。标准层图一张图的绘图惯例本轮不解决。
- **规模**：范围语法 2.5 日，别名插值 1 日（估算）。
- **字节恒等证明**：
  - 弱律：`test/level-range-byte-identity.test.ts`，语料 SHA-256（SVG + `describe` + `lint` + `compile().diagnostics`，resolver 可达故必须含后者），基线用 `test/byte-identity-digest.ts` 的 digest 本体。
  - **强律**（这个形式才有的好东西）：`level a..b { B }` 与手写展开成字面量的同一计划，逐页 SVG、`describe`、`lint` 完全相等，span 归一后比较。

---

## B. 场地层

### B.1 现状追踪

- **任意角度被拒**：`place … rotate 45` 报 `must be 0, 90, 180 or 270`（`src/parser.ts:1362-1364`，探针 `b1`）。
- **不能放宽 `Frame`**：`Frame` 是有符号置换矩阵（`src/frame.ts:8-11`），ADR 0020 拒绝更通用表示的理由就是 "no trigonometry, so no float is introduced"（`docs/adr/0020-algebraic-core.md:208-211`）。`fromMatrix` 对非 D4 矩阵返回 `null`（`src/algebra/d4.ts:111-117`），`composeFrame` 随后**静默回退到恒等拼写**（`src/frame.ts:167`）；`transformRect` 假定矩形轴对齐（`src/frame.ts:218-229`）；`transformRailSide` 同样有兜底（`src/frame.ts:399`）。硬扩会得到错误而非报错。
- **但渲染器不需要旋转**：Scene 图元坐标显式（`src/scene.ts:190`），没有层级变换，任意角度的多边形今天就能画：`examples/hexagon-pavilion.arch` 以及探针 b5 的三个斜放外轮廓。所以任意角度只是**把点算好再写进 `polygon`**，完全绕开 grid、D4、`walls from rooms`。
- **导入多层文件得到空**：`wholeFileComponent` 丢弃 level（`src/import.ts:137-147`），探针 `b3` 报 `W_IMPORT_EMPTY_FILE`。整文件导入加 `rotate 90` 对单层文件可用（`b2`）。
- **`World`**：只有 `read`/`now`（`src/world.ts:19-24`），读文件只发生在 `link()`（`src/import.ts:7`）。`ResolveCtx` 只暴露 `now`（`src/registry.ts:93-97`），没有 `read`，所以元素 `resolve` 不能读文件，必须走 link 阶段。
- **一步预算的先例**：`ResolveExtras.stepsBefore`（`src/ir.ts:1960`）就是"一个计数器跨多次 resolve"；`withStepMeter` 可嵌套（`src/expr.ts:777-792`）。子建筑解析应走这个模式。
- **外轮廓数据**：`describe` 只给 `bbox_outer`（矩形）。精确外环在 `joinWallSet(shell.map(w => ({...w, openings: []})), [])` 的 `result.outline`（`src/analyze/gross-area.ts:121-126`），`joinWallSet`、`loopsToPolygons` 均已公开（ADR 0031）。探针证实：classroom-block 外环面积 324.1875 m²，正是 22750×14250。
- **量程**：`MODEL_RANGE_MM` 2^25 mm，约 33.5 km（`src/ir.ts:4290`），校园放得下，不用动。旋转后点要过 `bounds()`，超限走 `E_OUT_OF_RANGE`。
- **绘图预算**：`drawUnits = drawCost + bounds().length`（`src/draw-budget.ts:85-89`）。外环每顶点 1 单位，远低于 300,000。
- **可复用**：`roof polygon`（虚线、不进 describe，`src/elements/roof.ts:7-15`）；`outdoor polygon`（填色、标签、面积，`src/elements/outdoor.ts`）；`fence { … }`；`site boundary`；`zone`（描述分组）。

### B.2 无新语法原型（已跑通）

`probe/site-proto.mjs`：用公开 API 算外环 → 任意角度旋转 → 生成 `b5-site-generated.arch`（`roof polygon` + `outdoor paving` + `site boundary`）。

```
classroom-block 外环 324.19 m² / two-storey 59.04 / museum 6048.09
coverage 0.298  plot ratio 0.295  max height 5700 mm   ← 脚本侧算出
compile ok, lint "no warnings"
```

图 `probe/b5.png` 证实三个角度（17°、−33°、41°）都能画。**同时暴露三个缺口**，它们就是 `building` 元素存在的理由：

1. 虚线 `roof` 表达的是"上方投影"，线太弱，不是建筑轮廓。
2. museum 的外环明显越出地块，`lint` 仍是 "no warnings"。
3. `describe` 对它们一无所知：caption 是 "a 0-room floor plan"，`roof` 没有 describe 键。

建议把原型落到 `tools/`（D18 的 tools 路径），只用公开 API，不进核心，不占 spec。Show HN 前可发。

### B.3 推荐设计

**不做 `site plan` 新顶层形式。** `compile`、`describe`、`lint`、Plan JSON、schema、playground、MCP 全部以 `plan` 为入口。一个 `plan` 加一种新元素就够，且服从"一个模块一个元素"：

```
building [id=<name>] polygon (x,y) (x,y) … [storeys <n>] [storey_height <mm>] [label "…"]   # 第二档
building [id=<name>] from <importAlias> at (x,y) [angle <deg>] [label "…"]                  # 第三档
```

**第二档（`src/elements/building.ts`，先做）**：多边形直接写，天然任意角度，不读文件，不碰 `Frame`。`bounds()` 取环，`drawCost` 3 左右，`measures()` 覆盖环和高度。`KEYWORDS.element` 与 `BUILTIN_DEFS` **同序追加**（`test/element-keyword-drift.test.ts`）。`transform` 必须实现，哪怕语法上禁止放进 component：`roof.ts:367-370` 的注释说明整文件导入能绕过解析期拒绝。

**第三档（放到 Show HN 后）**：`import "a.arch" as a`（复用现有语法），`resolvePlan` 式地先解析子建筑，把 `{ ring, storeys, heights, gia }` 作为表传给场地 resolve，共用 `stepsBefore`；同一文件只解析一次。角度在 `resolve` 里算成点，四舍五入到 0.001 mm 格；90/180/270 走 D4 表，否则 `cos 90° ≠ 0` 会破坏精确性。环的来源用 `EdgeLoop`，弧边走 `path` 图元保真，不要 48 边形（`roof.ts:34-36` 的立场）。

**新规则**：`W_BUILDING_OUTSIDE_LOT`、`W_BUILDINGS_OVERLAP`（消息不含 id，走 `src/naming.ts`；环计算走 `polygonsOverlap` 已有计费）。图层名加入 `src/label-placement.ts:611, 622` 的跳过集，否则环内所有标签被挤走。`caption` 要加分支。

### B.4 冲突

| 法则 | 影响 |
|---|---|
| `compile()` 纯、无 I/O | 第三档只能走 link + World |
| Ring work is charged（iron-laws:73）；`compile()` bounded | **真冲突**：`gross-area.ts:42-48` 明说 GIA "never computed inside `compile()`"，所以预算不收费。第三档在 compile 里做 joinery，必须用 `MAX_FACE_WALL_SEGMENTS`/`wallContacts` 的计数先收费再做 |
| "Never build the wall joinery to answer a `describe()` question"（iron-laws:122-123，语境是派生位置） | 第三档用于绘图，不是回答 describe，但要在 ADR 里写明，GIA 是先例 |
| Heights draw nothing（AGENTS.md；iron-laws:97-98；ADR 0021 决定 4） | `storeys`/`height` 只进数据。图上打印 "6F 19.8 m" 见 §C.4 |
| 元素规则：`drawCost`、`bounds()`、`measures()` | 第二档全满足 |
| 等变预言机 | `test/d4-oracle.ts` 按元素枚举事实（outdoor 在 758-765）。新事实要加；`test/drawing-budget.test.ts`、`test/element-keyword-drift.test.ts`、`test/plan-json-dropped.test.ts` 都按注册表遍历，新元素自动进入，需要各自补期望 |
| T6（iron-laws:14-16：无 `area` token） | `building` 不能有 `area` 子句 |
| 派生位置来自形状 | 标签用 `polygonLabelPoint` |

**跨层外环的真实困难**：上层悬挑时外环不等于首层。仓库没有通用多边形并（`clippedArea` 只支持凸裁剪，`src/geometry/polygon.ts:620-627`）。第三档 v1：取最低层外环，上层出界用诊断说明，**精确或省略**（ADR 0027 §2 的立场），省略原因沿用 `GrossAreaReason` 模式。

### B.5 规模、风险、证明

- **规模**：工具 0.5 日；第二档 3–4 日；第三档 5–7 日（估算）。
- **风险**：第二档中。第三档高：跨模块预算、缓存键、跨文件诊断 provenance（`stampProvenance`）、playground 单文件环境下 World 为空都要处理，**不应在 Show HN 前上**。
- **证明**：`test/building-byte-identity.test.ts` 弱律同上。新增元素的额外律：一个计划加 `building` 后，除新事实外其他 room/wall 事实不动；`place rotate 90` 下 ring 过预言机。

---

## C. 派生指标

### C.1 已有与缺失

| 指标 | 现状 | 来源 |
|---|---|---|
| 地块面积 | 有：`site.lot_area_m2`，精确鞋带公式 | `src/describe.ts:1060-1065` |
| 总建面 | 只有内净：`gross_internal_area_all_levels_m2`（按内面） | `src/describe.ts:929-937` |
| 基底面积 | **无**。`bbox_outer` 是矩形 | `src/describe.ts:801` |
| 室外面积 | `totals.outdoor_area_m2`，**简单求和** | `src/describe.ts:1675` |
| 绿地分类 | **无**。`GROUND` 只有 material/tint/layer | `src/elements/outdoor.ts:131-144` |
| 最大高度 | 无汇总。每层 `heights.storey_height`、`elevation` | `src/describe.ts:404-420` |
| 停车位 | 无。`car` 是 fixture（`src/elements/fixtures-glyphs.ts:168`），`garage` 是 use | — |
| 工程量 | `describe --facts quantities`、`arch takeoff`：单层墙/房/门窗，无楼栋级 | `src/analyze/quantities.ts` |
| 图上表格 | `schedule rooms\|openings` | `src/ast.ts:1400`，`src/sheet-tables.ts` |

### C.2 两个陷阱

- **面积重复**：探针 b4 中 lawn 19,200 m² 铺满地块，paving 1,000 m² 压在上面：`outdoor_area_m2: 20200`，地块 `lot_area_m2: 19200`。覆盖率超 100%。绿地率必须先判重叠，重叠就**省略并说明原因**，不能猜。检测用 `polygonsOverlap`，`src/lint/rules/outdoor.ts` 已有 `polygonsOverlapCost` 的先算后做模式。
- **字节恒等**：任何带 `site boundary` 的现有示例（如 garden-house）如果多出一个默认 key，`describe` 字节就变，违反法则。所以**必须 opt-in**，与 D9 一样走 `DESCRIBE_FACTS`（`src/describe.ts:200`）。

另注：`src/describe.ts:530` 注释写"想要 plot coverage 的消费者自己加"。这是代码注释不是法则，但新事实上线要改这条注释，否则文档自相矛盾。

### C.3 事实命名方案（`describe --facts indicators`）

约定写进字段名，延续 D9 和 Principle 5（"Geometry, never claims"）：

```jsonc
"indicators": {
  "site_area_m2": 19200,                       // = lot_area_m2；无 boundary 时缺省
  "footprint_outer_m2": 6431.3,                // 外墙外面的最外环（第二档后 + building 环）
  "gross_floor_area_outer_m2": …,              // 每层 footprint_outer 之和（有 building 时 storeys × 环）
  "plot_ratio": 0.295,                         // gross_floor_area_outer / site_area
  "site_coverage": 0.298,                      // footprint_outer / site_area
  "green_area_m2": …,                          // lawn + planting 的声明面
  "green_ratio": …,                            // green_area / site_area
  "max_height_mm": …,                          // 只有 heights authored 时
  "parking_spaces": { "car_fixtures": 12 },    // 数 `car` 图元，不推断
  "omitted": { "green_ratio": "overlapping-surfaces" }
}
```

- 分类放 `GROUND` 表加 `green: boolean`，一张表，不新增 switch。`water` 不算绿地，这是约定，要写明。
- `parking_spaces` 只数 `furniture car`，键名把这一点写死，绝不从 `garage` 面积推断。
- **不做合规判断**，不对"容积率限值"发警告，那会是 compliance claim（growth 禁语，Principle 5）。

### C.4 `schedule indicators`（第二步）

接入面（照 `schedule openings` 先例）：`SCHEDULE_SUBJECTS`（`src/ast.ts:1400`）、`parser.ts:815-816`、`ir.ts:2095-2104, 3500, 3632-3639`、`sheet-tables.ts` 的 `planTableRows`/`layoutSheetTables`、`scene-build.ts:972, 1005`、`draw-budget.ts:101-143`、`plan-json.ts:975-976`。

**必须先修 backlog N.1**（`docs/backlog.md:749`）：`src/finish.ts` 的 `tableRows` 已经漏算 notes 和 openings，再加一种表只会把缺陷放大。

**法则问题**：高度打印进图表是否算"draw"？`Heights draw nothing` 字面上会被触犯，`test/height-byte-identity.test.ts` 的强律是"写了 height 的计划绘图逐字节等于删掉 height 的同一计划"。

建议：第一版表格**不含高度和楼层数**，只列面积和比值。若坚持打印，走 D-entry，把法则精确表述为"高度不产生几何，schedule 表可打印数值"，并给强律加一条例外：仅当 `schedule indicators` 出现时。

### C.5 规模、风险、证明

- **规模**：事实 2 日，表 2 日（估算）。
- **风险**：中。主要是 GFA 定义（外面 vs 内面）在不同辖区不同；字段名带约定可缓解。
- **证明**：不传 `--facts indicators` 时语料 SHA 不变（D9 的同一证明）；`schedule indicators` 弱律；另加一条逆向律：有表计划的 `describe` 除表外不动。

---

## D. 地面弧线与跑道

### D.1 对比

| | `outdoor … polygon` 加 `arc` | `track` fixture |
|---|---|---|
| 单模块规则 | 扩展现有 `src/elements/outdoor.ts`，不新增元素 | 加 `FIXTURE_FAMILIES` 行 + `CATALOG` |
| 任意角度 | 可以，弦端点自写 | **不行**：`rotate 0\|90\|180\|270`（spec 第 81 行） |
| 面积 | 精确，`loopArea`（`src/geometry/band.ts:264-271`） | 无，fixture 不算面积 |
| 尺寸 | 真实毫米 | `glyphs.md`：每个量是 footprint 的分数，真实车道宽 1,220 mm 表达不了 |
| 标签 | 有 | "a drawn symbol ignores its `label`"（AGENTS.md） |
| 分类 | 进绿地/硬地 | 进 furniture，成为障碍物语义 |

**建议 `outdoor`**，fixture 否决。

### D.2 推荐设计

```
outdoor [id=] <kind> polygon (x,y) (x,y) arc (x,y) radius <mm> [cw|ccw] [major] … [label "…"]
outdoor track polygon …
```

- 解析复用 `wall` 的 arc 子句（`room polygon` 拒绝 arc，`src/elements/room.ts:215`，那条不动）。`arcFromChord`（`src/geometry/arc.ts:189`）、`E_ARC_RADIUS` 已有。
- **复用 `room circle` 的"三视图"先例**（`src/elements/room.ts:514`）：`ROutdoor.poly` 继续存细分环（`arcTessellate`，7.5° 一段），所有现有读者（`polygonsOverlap`、`pointInPolygon`、标签、`archlang-3d` 的 `outdoorOf`，`build.ts:112`）零改动；新增 `arcs` 供精确面积和真弧绘制。
- 面积**必须走精确公式**：48 边形差 0.29%（`src/elements/room.ts:452`）；400 m 跑道半径约 36.5 m，弦高误差 78 mm（`R(1−cos 3.75°)`，算得），画图看不出，面积会看出。
- `hatch` 图元的 `region` 只收点（`src/scene.ts:237`），所以填色走细分环，描边走 `path` 真弧。
- **`bounds()` 要加 `arcExtremes`**（`src/geometry/arc.ts:343`），弧鼓出弦外的部分否则漏算，违反 "covering every coordinate"。**`outdoor` 今天没有 `measures()`**（grep 只有 `dim`、`door`），弧半径必须补一个，否则 `E_OUT_OF_RANGE` 查不到它。
- `transform` 用 `t.arc`；`rail` 继续 balcony 专用，`balcony` 拒绝弧。
- `track` 是 `OUTDOOR_KINDS` 末尾追加（`src/ast.ts:828`），`GROUND` 加一行，`green: false`。**不做 `lanes` 子句**：`for i in 0..8 { outdoor track polygon … }` 用现有 `for` 就能画嵌套车道线，但它们是重叠面，要用 §C.2 的省略规则处理。
- `fence` 不开放弧（`E_FENCE_CURVED`，`src/elements/fence.ts:39-42`）：柱距和长度都按直段定义。

### D.3 规模、风险、证明

- **规模**：弧 3–4 日，`track` 1 日（估算）。
- **风险**：中。`polygonSelfIntersects` 跑细分环；Plan JSON 已丢 `outdoor` 和弧（#366），要在 `plan-json-dropped` 记录。
- **证明**：`test/outdoor-arc-byte-identity.test.ts` 弱律；外加**闭式面积律**：跑道 `πr² + 2rL` 与 `describe` 精确到 2 dp；等变律：`place rotate/mirror` 下 `sweep` 符号按 `frame.ts:268` 反转。

---

## E. 规则画像 `cn-school`

### E.1 现有画像（`LINT_PROFILES`，`src/lint/ruleset.ts:530-647`）

| 名称 | 构成 | 来源标记 | 列入 `ADVISORY_CODE_PROFILES`（:689） |
|---|---|---|---|
| `residential-basic` | `{assumeDwelling: true}` | — | 否 |
| `accessibility-advisory` | 门宽、净宽、WC 侧距、出口接近 | ADM [V]、ADA [S/V] | 否（通用，进 never-worse） |
| `cn-residential-advisory` | 净面积、分用途下限、通道、楼梯 | GB 50096-2011 全文 [V]，楼梯 [S] | 是 |
| `uk-residential-advisory` | NDSS、ADM、ADK | [V]/[S] | 是 |
| `us-residential-advisory` | IRC 二手 | [S] | 是 |

构造是 `resolveRuleset` 三层合并（:707-733），`ByUse` 表按 key 合并。CLI 名单由 `Object.keys` 派生（:696），所以名字自动进帮助。

### E.2 `uses classroom` 的实际影响

探针：`uses classroom` 今天 `E_PARSE`（`e1`）；标签 "Classroom 1" 无 `uses` 时 `uses: []`、`room_type: "Room"`（`e2`）。

**必须改**（TypeScript 穷尽性会强制）：
- `USE_KINDS` 末尾追加（`src/ast.ts:266`；注释要求追加不插入）
- `USE_PHRASE`（`src/lint/rules/alias-match.ts:24`，`Record<UseKind,…>`）
- `USE_TO_ROOM_TYPE`（`src/plan-json.ts:143`）、`USE_PRIORITY`（:173）。建议映射 `StudyRoom`，与 `office` 同类（RPLAN 无教室；garage 的先例说明不加新 `room_type`，否则是破坏性 schema 变更）。JSON 往返退化为 `uses office`，这是已知的有损，与 garage 同。

**建议改**：
- `src/analyze/dwelling.ts:40-45`：`uses classroom` 作为强证据返回 non-residential。否则标签写 "Room 3" 的教室被读成住宅。
- `HABITABLE_USES`（`src/taste/criteria.ts:84`、`src/lint/rules/privacy.ts:69`）：加入，仅影响用了它的计划。

**绝对不要改**：
- **`USE_VOCABULARY`/`FALLBACK_USE_VOCABULARY`**：加入后，所有标签含 "Classroom" 且无 `uses` 的房间从 `uses: []` 变成 `[classroom]`，移动 `describe`/`lint`，`test/fixtures/vocabulary-equivalence.json` 里有 4 处 classroom 会动。没必要：`NON_RESIDENTIAL_VOCABULARY` 已含 "classroom"（`src/vocabulary.ts:403`），所以不会有 `W_ALIAS_MATCH` 问题（该码只来自 alias 词）。
- **`intent-concepts.ts`**：加概念要动 `SYNONYMS_VERSION`（当前 1，`:38`），触发"不可跨版本比较"的法则。
- **`examples/classroom-block.arch`**：现写 `uses office`，改了动基线。

**评测**：`grep -c -i classroom eval/corpus.json eval/corpus-fidelity.json` 都是 0；`eval/goldens/*`、`eval/fidelity-plans/*` 无匹配；`eval/` 和 `dataset/` 不读 `USE_KINDS`/`classifyLabelUses`。所以 `judge-fixture.json` 不动，`JUDGE_VERSION`（"2"）不动，不碰任何 eval 法则。`garage` 的提交 `4c1f67b6` 是完整先例，可对照其 22 文件清单。

**furnish/taste**：`FURNISH_TABLE` 是 `Partial`（`src/furnish-table.ts:59`），`DEFINING` 也是，不加行就不铺家具，这是正确默认；`finish` 不声称会布置教室。

### E.3 画像实现

命名 **`cn-school-advisory`**，不叫 `cn-school`：注释（`ruleset.ts:524-528`）要求名字不等同标准，且 `-advisory` 后缀是现有约定。

必须同时：
1. 加入 `LINT_PROFILES`。
2. **加入 `ADVISORY_CODE_PROFILES`**：否则 `stricterProfileNames(LINT_PROFILES)` 把它算进 `STRICTER_PROFILES`（`src/finish.ts:279`），破坏 `finish` 的 never-worse（ADR 0024 决定 6）。
3. 不设 `assumeDwelling`。
4. 可选加 `TASTE_PROFILES`（`src/taste/profiles.ts:17`）。

**来源是硬门槛**：iron-laws:77-79 "as the other profiles were" 要求读原文。GB 50099-2011 的条款数字本报告**没有读，不提供**，由规划的研究卡完成，逐行标 [V]/[S]。能力边界也要写明：ruleset 只能表达房间面积、净宽、楼梯；"每座面积"需要座位数，语言没有，**不能模型化就不写**。

### E.4 规模、风险、证明

- **规模**：`uses` 1 日；画像 2–3 日（含读规范；估算）。
- **风险**：代码低；来源中，如果原文取不到全文，只能标 [S]。
- **证明**：`test/classroom-byte-identity.test.ts`：语料 SHA 不变（只加枚举值）；`vocabulary-equivalence` 不动；画像只在 `--profile` 下生效的律（`lint` 默认输出不变）。生成物（gbnf、schema、tmLanguage）变化是预期内的，列入 PR 说明。

---

## F. 曝光与法则

### F.1 剖面/立面到底能走多远

| 层 | 能否 | 依据 |
|---|---|---|
| 核心 `src/` 画剖面 | **不能** | iron-laws:93-98 "it draws 2D plans only… never a drawing"；ADR 0021 决定 1、5；AGENTS.md "Heights draw nothing"；`.claude/rules/archlang-3d.md` "the core never gains a 3D option, command or drawing" |
| `archlang-3d` 出剖面/立面 | **不违法** | ADR 0030 Scope 明列 "a viewer and renders"；Non-goals 只排除复活 `--view` 和 3D 进 `compile()`。开发计划已含：四向立面相机（`development-plan.md:835`）、竖向剖切（:837）、`section` 预设（:438） |
| 文档站/README/npm README/落地页出现 | **不能，到 Tier C** | D5、D16、D20；"Show HN 2026-12-01 stays 2D" |
| playground | 只能在 "3D preview" 页签，带 D5 原文标签 | `PREVIEW_LABEL`，`.claude/rules/archlang-3d.md` |
| 时间 | **N10 读数之后** | D29 保留 "wave 4 and wave 6's 3D work waiting for N10"，handoff:44 |

"ArchLang draws 2D plans only" 与包内剖面不冲突，因为 ADR 0030 决定 1 把主语写清了："ArchLang itself draws plans"。但有两条实质约束：
- 输出必须携带 `assumptions[]` 台账（ADR 0030 决定 5：楼板厚 200 等默认值），否则默认值被读成事实。
- ADR 0030 决定 8：渲染图不字节固定，比像素。

**没有开放 issue 要剖面或立面**：`gh issue list` 搜索命中 #345、#369，但 #345 的 "elevations" 指标高，#369 指窗户的立面图例，都不是请求。写规划时不能写"用户要求"（D17）。

### F.2 哪些改动需要 D-entry

规则（iron-laws:3-6）：PR 中提出，记入所属程序 README §3 并附 reverse-if，**标 *awaiting ratification* 直到所有者用文字批准**，列入阶段报告。注意 plan-soundness D18 明写 "it is not read as a standing delegation"（`README.md:330`），所以不要按"反对才推翻"执行法则修改。普通程序决定可用 README:100 的 "Stands unless the owner objects"。

| 改动 | 需要吗 |
|---|---|
| 图上打印高度/楼层数 | **需要**（改 Heights draw nothing 的表述） |
| 核心画任何剖面 | 需要，且要改 ADR 0021；**建议永不** |
| 2026-11-24 之后再上新语言形式 | 需要（D23、§4 波次表） |
| 提高 spec 上限 | 不是 D-entry，但 iron-laws:90 要求先证明削减了重复 |
| 新建"场地与校园"程序 | 不是法则，但应开新 README，D-entry 落在那里 |
| 放宽 `place rotate` / `Frame` | **不要做**，属 ADR 0020 架构决策 |
| `MODEL_RANGE_MM` | 不需要动 |
| A、C（不含高度）、D、E | 只需常规 byte-identity + 红队 + spec 行（D29） |

### F.3 配额

- **`spec.llm.md`**：`test/llm-spec-drift.test.ts:82` 要求 `< 30_000`，量内存串的 UTF-16。实测 29,754（`wc -c` 的 30,049 是字节，**量错了会以为已超**）。**可用 245 字符**。
  - 估算成本：`level` 区间 + `as` ~120；`place` 别名 ~40；`schedule indicators` ~40；`uses classroom` 约 22（`garage` 在 spec 出现 2 次）；`outdoor` 弧 + `track` ~60；`building` 新行 ≥ 350（测试要求 `^building ` 独立行，`:29-32`）。**合计 ~630**。
  - 杠杆：最长行是 `furniture` 2,025、`door` 1,949、`room` 1,350、`wall` 1,190（实测）。测试注释说 door 最长（"over 1,600"）已过时。规则：先证重复再削，再加；不能调阈值变绿。
  - `examples/parametric.arch` 整篇内嵌，示例改动也扣配额。
- **AGENTS + CLAUDE**：4,195 + 384 = 4,579 字节，上限 5,000，余 421。
- **`docs/agents/iron-laws.md`**：无上限，但别塞叙事（AGENTS.md "Lean agent context"）。

### F.4 新关键字注册清单

依据：`notes`（`a173408e`，34 文件）、`fence`（`176bba0f`，34 文件）、`keep`（`5c363dcf`，54 文件）、`garage`（`4c1f67b6`，22 文件）的真实提交。

**手改的源**

- [ ] `src/grammar/tokens.ts`：`KEYWORDS.control|element|attribute|enum`；元素须与 `BUILTIN_DEFS` 同序追加（`test/element-keyword-drift.test.ts`）；一个词只进一类
- [ ] `src/ast.ts`：节点、`Statement` 联合、枚举常量
- [ ] `src/parser.ts`：语句分派；设置走 `parsePlan` switch（`:528` 一带）
- [ ] `src/elements/<x>.ts` + `src/elements/defs.ts`（元素）：`parse/resolve/render/bounds/drawCost/measures/transform`，可选 `rewall`
- [ ] `src/ir.ts`：`ResolvedElement` 联合、`R<X>` 接口、`checkDrawnSizes`
- [ ] `src/index.ts`：公开类型导出（`test/public-surface.test.ts`；仅追加）
- [ ] `src/error-catalog.ts`：每个 `E_*/W_*` 带 remedy
- [ ] `src/format.ts`、`src/statement-print.ts`：`fmt` 往返
- [ ] `src/cursor.ts`：光标节点（`:179` fence 先例）
- [ ] `src/stages.ts`：`ELEMENT_KIND_STAGES`（`Record` 穷尽，`:177`）
- [ ] `src/describe.ts`：摘要接口与事实；`src/cli/serialize.ts:118`（文本摘要）
- [ ] `src/plan-json.ts`：丢弃清单 `:889`、校验；`test/plan-json-gaps.ts`
- [ ] `src/analyze/symmetry.ts:637-671`（画出的边）；`src/backends/ascii.ts:284-293`（ASCII 通道）
- [ ] `src/label-placement.ts:611, 622`（环形跨全图的图层必须跳过）
- [ ] `src/sheet.ts`（`drawn` 范围注释/fit）；`src/draw-budget.ts`（平面级 pass）
- [ ] `src/theme.ts`、`src/hatches.ts`（如有新色/材质）；`src/repair.ts`、`src/reroll.ts`、`src/impact.ts`、`src/datum.ts`、`src/analyze/keep-facts.ts`、`src/analyze/depends.ts`（AST 遍历）
- [ ] `src/lsp.ts:38-60`：`SETTING_KW`、`CONTROL_KW` 是**手写目录**（注释写 "T5.4 will source this from grammar/tokens"，至今没有）。新的设置或控制词要手加，否则没有悬停和补全，且没有漂移门禁；新**元素**经 `def.params` 派生（`elementSignature`，`:247`），不用改。`place` 的提示文本（`CONTROL_KW.place`）在 §A.4 后也要改
- [ ] `src/manifest.ts`（CLI 改动时）；`src/cli/context-starter.ts`（如进起步模板）
- [ ] `scripts/gen-llm-spec.ts`：手写的 `<kw>:` 语法行（`:123, :141`）及 `assertVocabRendered`（`:601, :627`）
- [ ] `scripts/gen-gbnf.ts`：手写产生式（`:314` 语句并集，`:643` fence 先例）
- [ ] `docs/language-reference.md`、`docs/analysis.md`（事实定义）、`docs-site/examples.md`
- [ ] `skills/archlang/SKILL.md`（`plugins/…/SKILL.md` 由生成）
- [ ] `playground/src/examples.ts`、`playground/src/llm-prompt.ts`（如涉及）
- [ ] `examples/<new>.arch`；`scripts/gen-example-svgs.ts` 的 `README_SVGS`（如入选）
- [ ] `packages/archlang-3d/src/scene3d/build.ts` + `scene3d.schema.json`（元素需进 3D 时）；否则走 `test/` 的显式拒绝
- [ ] `packages/mcp`：烘入 `spec.llm.md`（`packages/mcp/scripts/copy-resources.mjs:23`），发布须 bump `package.json` + 两处 `server.json`（iron-laws:38-40）
- [ ] `CHANGELOG.md` `[Unreleased]`

**测试**

- [ ] `test/<x>-byte-identity.test.ts`（基线用 `test/byte-identity-digest.ts`，含 `compile().diagnostics`）
- [ ] `test/spec-forms.test.ts`、`test/gbnf-drift.test.ts`、`test/llm-spec-drift.test.ts`、`test/element-keyword-drift.test.ts`、`test/drawing-budget.test.ts`、`test/model-range.test.ts`、`test/step-budget.test.ts`、`test/plan-json-dropped.test.ts`、`test/d4-oracle.ts`、`test/equivariance-*`、`test/lint-messages-id-free.test.ts`、`test/visual.test.ts`（金样）、`test/site-lockstep.test.ts`
- [ ] 新示例进入 `test/byte-identity-baseline.ts`、`test/while-byte-identity-baseline.ts`

**`check:drift` 自动重生成**（`scripts/check-drift.ts:25-61`，不可手改）

`editors/archlang.tmLanguage.json`、`playground/src/arch-language.js`、`docs-site/.vitepress/theme/arch-highlight.js`（`gen:grammars`）· `docs/error-codes.md`（`gen:errors`）· `spec.llm.md`（`gen:spec`）· `llms-full.txt`、`src/context-size.ts`（`gen:llms`）· `docs/cli-reference.md`（`gen:cli`）· `grammars/archlang.gbnf`（`gen:gbnf`）· `schemas/plan.schema.json`、`schemas/intent.schema.json`（`gen:plan-schema`、`gen:intent-schema`）· 示例 SVG（`gen:example-svgs`）· 插件 SKILL 与 manifest（`gen:plugin`）· `docs-site/public/_headers`（`gen:docs-headers`）· agent manifests（`gen:agent-manifests`）· `docs-site/public/arch-plan.js`（`gen:arch-plan`）。

顺序敏感：`gen:spec` → `gen:llms` → `gen:cli`。

**门禁**：`check` + `check:drift`；触及 test/ 加 `typecheck:all`；文档加 `docs:build`；playground 加 `e2e:playground`。

---

## G. 顺序与时间

### G.1 时间窗

- 今天 2026-11-02。**Show HN 2026-12-01**（D5、D23）。
- **语言冻结 2026-11-24**：D23 "New language forms freeze on 2026-11-24 until Show HN has run"，§4 波次表重申。D29 废除了 D26 的"不开新程序"和 D24 的停放，同时写明 "The last week before Show HN stays for stabilising"，两者一致。
- **N10 读数 ≥ 2026-11-27**（handoff:12）。
- `npm run check` 安静机器上 787 s（README:79），11 月 5 日后云积分耗尽，重探针要在本地或提前做。
- 下一个核心版本必须 > 1.50.1（O.15）。`main` 已领先 npm。

### G.2 重叠

| 项 | 关系 | 处理 |
|---|---|---|
| #364 `finish` 不处理 `level` | A 放大它：30 层楼也不铺家具 | 独立，不并入 A |
| #404 上层 lint 范围 | A 放大 `W_NO_ENTRANCE` 重复 | 与 A 的诊断折叠同看 |
| #405 集合 | "A file-name pattern for storeys"（A）、"a height for `fence` and `outdoor`"（§F）、"`paper auto`"（B） | 只取文件名 |
| #345 共享结构网 | 与 A 互补，D25 已收窄 | 不并入 |
| #346 takeoff 面板 | C 的邻居 | C 不做面板 |
| #366 Plan JSON 缺弧和图幅 | B、D 新数据同样缺 | 记入 `plan-json-dropped` |
| #402 净面积章、#403 其他语言图文 | `schedule indicators` 的表头语言 | 表头跟现有英文，等 #403 |
| backlog N.1（:749，`finish`） | **C 的前置**，必须先修 | 第一步修 |
| backlog M.14（:1513）锐角屋檐 | `building` 若复用 `offsetRingOutward` 会继承无界斜接 | 不复用，`building` 不做 overhang |
| backlog G.8（:313）per-category style | B/D 想要专用笔触时相关 | 不依赖，用 `GROUND` 表 |
| backlog D.7（:1758）双细线 | 新表用 `extraThin`；统一会移动所有带标题栏的金样 | 分开，所有者决定 |
| backlog V.5（:709）2.0 删除 view | 剖面**绝不能**从 `src/view/` 取代码（ADR 0021；README:50） | 硬隔离 |

Daniel 的 #362、#363、#370 已关闭，#364、#366、#367、#369 开放。handoff 第 3 节第 1 项是 "The open issues, by value (D29)"，所以本计划与开放 issue 竞争时间，要由所有者知情排序。#369（窗种）是目前唯一还在排队的 Daniel 语言需求。

### G.3 推荐顺序

1. **第 1 周（11-02 → 11-08）**
   - PR 0：spec 削减 ≥ 650 字符，证明重复（解锁一切）。
   - PR 1：修 N.1。
   - PR 2：`describe --facts indicators`（在现有单楼计划上就有用，地块来自 `site boundary`，基底来自外环）。
   - `tools/` 场地原型（无核心改动，云积分 11-05 前做）。
2. **第 2 周（11-09 → 11-15）**：A 区间楼层 + `place` 别名；E 的 `uses classroom` 与读 GB 50099。
3. **第 3 周（11-16 → 11-23）**：画像；D 弧线；`schedule indicators`；`building polygon` 只在前面全绿且 spec 有余量时上。**它是第一个该被砍的**。
4. **11-24 起**：冻结，只修缺陷，发版。
5. **Show HN 后**：`building from`，第三档；N10 之后再议包内剖面。

总量约 15–19 AI 协作日（不含第三档），三周并行可行但不宽裕（估算）。同时 D13 的"每 PR 一轮红队"和 `check` 13 分钟是真实节拍。

---

## 附：探针清单

| 文件 | 结论 |
|---|---|
| `a1`/`a2`/`a5` | 区间、`for` 内 level、表达式 level 都是 `E_PARSE` |
| `a3`、`a4` | `as b{i}`、`id="c{i}"` 都是 `E_PARSE` |
| `a4b`、`a4c` | 循环无 id 可用；同 id `E_DUP_ID` |
| `a6`、`a7` | component + level 组合可用，井道成立 |
| `a8` | `place` 入循环 `E_DUP_INSTANCE` |
| `a9` | 单项 `for` 包裹 level body 全绿 |
| `a10` | 根层 `for` 是 `E_LEVEL_MIX` |
| `b1`/`b2`/`b3` | `rotate 45` 拒绝；`rotate 90` 可用；多层文件导入为空 |
| `b4` | 重叠面积重复计入 |
| `b5`、`site-proto.mjs`、`b5.png` | 无新语法场地图跑通 |
| `e1`/`e2` | `uses classroom` 现为 `E_PARSE`；标签不分类 |
| `scale{30,100,300}.arch` | 680 / 1,241 / 2,745 ms，全 ok |

