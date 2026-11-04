# 方案图纸集卡片

规则同 `../preview-and-remodel/cards.md`：选依赖已完成、波次已开放的第一张 `todo` 卡。状态词：`todo`、`doing`、`done`（裁成 id、标题、状态、PR、commit，实施记录原样移到 `research/` 的日期文件）、`parked`。规模是 AI 协作日，±50%，是估算不是测量。“模型”是建议执行者，主会话可改。每张卡都写明不许做什么。

卡内 `file:line` 指 `main@18127701`，动手前重新确认。

## 0. 每张卡都跑的门禁

| 何时 | 命令 |
|---|---|
| 本地，永远 | `npm run check:quick`（文档另加 `npm run docs:build`），别的都不跑（`AGENTS.md` § How to work） |
| 只在 CI 跑 | `check`、`check:drift`、`typecheck:all`，以及下面的 playground 和 3D 两行 |
| `docs/*.md` | `npm run docs:build`；表格内联代码里的 `\|` 要转义；片段用 `arch static` |
| playground | `npm run build && npm run playground:build:only && npm run e2e:playground` |
| 3D 包 | `npm run check:3d` |
| 每个 PR | 从 `main` 建 worktree，分支 `feat/<card>-<slug>`；一轮红队，最多两轮；审过后 `reviewed <完整 sha>`，`gh pr merge <n> --auto --merge --match-head-commit <40 位 sha>` |

**新语言形式的通用清单：** `research/2026-11-02-repo-feasibility.md` §F.4，手改源、测试、生成物都列全了。特别注意 `src/lsp.ts:38-60` 是手写目录，没有漂移门禁。

**字节恒等载荷：** SVG + `describe()` + `lint()` + `compile().diagnostics`（解析器可达时必须含后者），基线用 `test/byte-identity-digest.ts` 的 digest 本体。

**消息规则：** lint 的 `message` 不含 id，用 `src/naming.ts`；id 只在 `hint`。

---

## 波次 0 · 地基

### DS0 · 把计划接入仓库记录 — `todo` · 0.2 日 · sonnet

在 `docs/plans/README.md`、`docs/backlog.md` 的程序表登记（本轮已做，只需确认）。D9、D10 已批准，无待办。

不许：写进 `AGENTS.md`，它只剩 421 字节余量。

### DS1 · 给 `spec.llm.md` 腾 ≥650 字符 — `todo` · 1 日 · opus · 依赖无

现状 29,754 UTF-16 单位，上限 `< 30_000`（`test/llm-spec-drift.test.ts:82`），只余 245。A–E 估算要约 630。`wc -c` 的 30,049 是字节，量错了会以为已超。

做法：改 `scripts/gen-llm-spec.ts` 和 `src/grammar`/`manifest` 的来源，删**可证明的重复**。杠杆：`furniture` 2,025、`door` 1,949、`room` 1,350、`wall` 1,190 字符行。测试注释说 door 最长，已过时，顺手改。

证明：每处删除在 PR 里写明同一事实还在哪里。`test/spec-forms.test.ts` 绿。

不许：调阈值；删除只有一处的事实；手改 `spec.llm.md`。

### DS2 · 修 backlog N.1：`finish` 漏算表行 — `todo` · 1 日 · sonnet · 依赖无

`src/finish.ts` 的 `tableRows` 漏算 NOTES 和 DOOR & WINDOW SCHEDULE（`docs/backlog.md:749`）。再加一种表只会放大它。修完从 backlog 删除该条。

证明：先写失败测试。语料 `finish` 选纸有变化时逐例说明。

不许：借机改 `AUTO_SCALE_DENOMINATORS`。

---

## 波次 1 · 数字与重复

### DS3 · `describe --facts indicators` — `todo` · 2 日 · opus · 依赖 DS1

opt-in 事实，走 `DESCRIBE_FACTS`（`src/describe.ts:200`）。默认 `describe` 字节不动，这是强制的：带 `site boundary` 的示例多一个 key 就违法。

字段：`site_area_m2`、`footprint_outer_m2`、`gross_floor_area_outer_m2`、`plot_ratio`、`site_coverage`、`green_area_m2`、`green_ratio`、`track_area_m2`（DS6 后）、`max_height_mm`（只有 authored heights 时）、`parking_spaces.car_fixtures`、`omitted{}`。基底外环用 `joinWallSet` 的 `result.outline`，先例 `src/analyze/gross-area.ts:121-126`。`GROUND` 表加 `green: boolean`，`water` 不算绿地，写明这是约定。

**陷阱：** `totals.outdoor_area_m2` 是简单求和，探针里 20,200 大于地块 19,200。有重叠就把 `green_ratio` 放进 `omitted`，用 `polygonsOverlap` 且先计费。学校有“可比总用地”口径（GB 50099 2.0.11，除环形跑道外），DS6 后加 `comparable_plot_ratio`。

同步改 `src/describe.ts:530` 的注释。在 `docs/analysis.md` 写定义。

证明：不传 flag 时语料 SHA 不变；闭式测试：矩形地块、矩形楼的比值手算。

不许：判限值；发合规类警告；从 `garage` 面积推断车位；声称符合 GB 50352。

### DS4 · `tools/` 无语法场地草图 — `todo` · 0.5 日 · sonnet · 依赖无

把调研探针 `site-proto` 的思路落到 `tools/`：用公开 API 算外环、任意角度旋转、生成 `roof polygon` + `outdoor` + `site boundary`。只用公开导出。图上已证实 17°、−33°、41° 都能画。

它暴露的三个缺口（虚线太弱、出界不警告、`describe` 不知情）是 DS7 的理由，写进工具 README。

不许：进核心；占 spec。

### DS5 · `level 2..5` 与 `place … as "b{i}"` — `todo` · 3.5 日 · opus · 依赖 DS1

语法：`level 2..5 "Typical" [height <h>] [as n] { … }`。在 `levelBlocks()`（`src/ir.ts:2048`）展开为克隆节点，共享 body，只读。`LevelNode` 加 `through?`、`varName?`。`as n` 包成单项 `for`，探针证实 `walls from rooms`、关系放置、`keep align` 全绿。井道身份自动成立。

必须：
- 解析期上限，新码 `E_LEVEL_RANGE`，建议 256。`level 1..1000000000 {}` 否则在步数计量前分配，违反预算法则。
- `checkLevels` 按区间查重；`level 2..5` 与 `level 3` 同现报 `E_LEVEL_DUP`，不替作者选。
- 改 `src/format.ts:84-91`、`src/analyze/keep-facts.ts:424`、`src/repair.ts:645-648`（区间层是展开构造，要压 `Enclosure`），并用测试锁住 `while-fix`、`cursor`、`datum`、`while-deprecation`。
- 诊断折叠：同 `code`+`span`+`message` 合并，加可选 `levels`。100 层坏计划曾输出 2.3 MB。

别名：`place c(i) as "b{i}" at (…)`，只开这一处。`aliasTok` 在 `src/parser.ts:1341`，在 `placeFrame` 求值；`keep-facts` 和 `impact` 读不到动态别名时显式跳过。

证明：弱律；强律：`level a..b { B }` 与手写展开逐页 SVG、`describe`、`lint` 相等（span 归一）。

不许：让 `for` 生成楼层；`as b{i}`；`id="c{i}"`；顺手做标准层“一图多层”。

---

## 波次 2 · 学校与总图

### DS6 · `outdoor` 弧边和 `track` — `todo` · 4–5 日 · opus · 依赖 DS1

`outdoor [id=] <kind> polygon (x,y) (x,y) arc (x,y) radius <mm> [cw|ccw] [major] …`，解析复用 `wall` 的 arc。沿用 `room circle` 三视图先例（`src/elements/room.ts:514`）：`ROutdoor.poly` 存细分环，其他读者不改；新增 `arcs` 供精确面积和真弧绘制。`track` 追加到 `OUTDOOR_KINDS`，`green: false`。

必须：`bounds()` 加 `arcExtremes`（`src/geometry/arc.ts:343`）；**补 `measures()`**，`outdoor` 今天没有；面积走精确公式，不用 48 边形；`hatch` 走细分环，描边走 `path`；`balcony` 拒绝弧。

数据：IAAF 2008：直道 84.390 m，量线半径 36.800 m，构造半径 36.500 m，道宽 1.220 m。2×84.390 + 2π×36.800 = 400.00。8 道外缘 46.26 m 是推算，未核实。文档给配方，不给 `lanes` 子句。

证明：弱律；闭式面积律 `πr² + 2rL`；`place` 下的等变律；`plan-json-dropped` 记录。

不许：做 `track` fixture（只能 90° 转，无面积）；放开 `fence` 弧。

### DS7 · `building polygon` — `todo` · 3–4 日 · opus · 依赖 DS3 · **冻结前首个可砍**

`building [id=] polygon (x,y)… [storeys <n>] [storey_height <mm>] [label "…"]`，`src/elements/building.ts`，天然任意角度，不碰 `Frame`。`KEYWORDS.element` 与 `BUILTIN_DEFS` 同序追加。`transform` 必须实现，整文件导入能绕过解析期拒绝（`src/elements/roof.ts:367`）。图层名加入 `src/label-placement.ts:611,622` 的跳过集。`caption` 加分支。

规则：`W_BUILDING_OUTSIDE_LOT`、`W_BUILDINGS_OVERLAP`。

`storeys`、`storey_height` 只进数据（D9 批准前不画）。`DS3` 指标纳入建筑环。

证明：弱律；加 `building` 后其他 room/wall 事实不动；`place rotate 90` 过预言机。

不许：复用 `offsetRingOutward`（继承 M.14）；加 `area` 子句（T6）；`overhang`。

### DS8 · `schedule indicators` — `todo` · 2 日 · sonnet · 依赖 DS2、DS3

接入 `SCHEDULE_SUBJECTS`（`src/ast.ts:1400`）、`src/parser.ts:815`、`src/ir.ts:2095,3500,3632`、`src/sheet-tables.ts` 的 `planTableRows`/`layoutSheetTables`、`src/scene-build.ts:972,1005`、`src/draw-budget.ts:101`、`src/plan-json.ts:975`。行数必须进适纸规则，否则重演“页面比纸高”（`src/sheet.ts:208-217`）。

只列面积和比值。层数和高度由 DS14 加入（D9）。表头英文，等 #403。

证明：弱律；逆向律：有表计划的 `describe` 除表外不动。

不许：在本卡打印高度；手填值。

### DS9 · `uses classroom` 和 `cn-school-advisory` — `todo` · 3–4 日 · opus · 依赖 DS1

`USE_KINDS` 末尾追加（`src/ast.ts:266`），`USE_PHRASE`、`USE_TO_ROOM_TYPE`（映射 `StudyRoom`）、`USE_PRIORITY`、`src/analyze/dwelling.ts:40`（强证据非住宅）、`HABITABLE_USES`。`garage` 的提交 `4c1f67b6` 是完整先例。

画像进 `LINT_PROFILES` 和 `ADVISORY_CODE_PROFILES`，否则破坏 `finish` 的 never-worse。不设 `assumeDwelling`。

首批只收能模型化且读过的：教学用房内走道 ≥2.40 m、外廊 ≥1.80 m（8.2.3）；楼梯梯段 ≥1.20 m，踏步中学 ≥0.28/≤0.16 m、小学 ≥0.26/≤0.15 m（8.7.2–8.7.3）；疏散门净宽 ≥0.90 m（8.2.4）；出入口净宽 ≥1.40 m（8.5.3）；中学主要教学用房层数（4.3.2，仅当能判定）。开工时先取官方文本；取不到时按 D13 标 `[S]` 并注明副本来源，不阻塞合并。

**先做研究：** 逐条确认 ruleset 能否表达。表达不了就不写，放 `DEFERRED_PROFILE_NUMBERS` 或记入卡片。

暂缓：日照 2 h（等 GB 7793-2025）、25 m 间距（要跨楼几何，等 DS7 后另开卡）、消防场地（必须先读 GB 55037-2022，它已废止 GB 50016 部分强制条文）。

证明：语料 SHA 不变；`vocabulary-equivalence` 不动；画像只在 `--profile` 下生效。

不许：动 `USE_VOCABULARY`、`intent-concepts.ts`、`examples/classroom-block.arch`；声称合规；写地方规划限值。

---

## 波次 3 · 剖面立面（N10 已读且 Show HN 跑完后）

### DS10 · 比例表加 1:1000、1:2000 — `todo` · 1 日 · sonnet

`AUTO_SCALE_DENOMINATORS`（`src/sheet.ts:142`，`src/finish.ts:467` 同用）。实测 570×425 m 场地在 A0 自动选 1:500 后 `W_DRAWING_OVERFLOW`。先跑语料，看谁动。动了 `describe().sheet` 就走法则程序。

### DS11 · 平面剖切符号 `section` — `todo` · 3 日 · opus · 依赖 DS5

`section A (x,y)->(x,y) look north|south|east|west` 是平面图元素，核心画剖切符号，3D 包读同一声明。这是平面符号，不触碰“Heights draw nothing”，但 PR 要显式论证。用 `drawCost`、`bounds()`；默认不进 `describe` 主体，放 opt-in 事实。

### DS12 · Scene3D 补缺 — `todo` · 3 日 · opus

经 additive 导出（ADR 0031）：`axes`（`RAxis`，只画声明过的，不猜）、`meta.groundZ` 默认 0 入台账、`flights/landings`。修 `slab-below-floor`，或明确放弃并改 `V-GEO-08`。必须先判断它是否动 laneway 的 Mesh3D/GLB 固定哈希，动了要写原因。

### DS13 · Band Envelope：`archlang3d section|elevation` — `todo` · 6–8 日 · opus · 依赖 DS12

起点 `spike/band-envelope.mjs.txt`，重写，不复制。模块：棱柱收集器（在 `mesh/build.ts:242` 的 `prism` 外加旁路，Mesh3D 字节不变）、`envelope.ts`、`lines.ts`、`style.ts`、`annotate.ts`、`svg.ts`、CLI。估算约 850 行加 700 行测试。

必须：
- **交叉细化**。
- 视图坐标 `u = -dy*x + dx*y`，写错就是镜像图。
- 确定性：整数 µm，只用四则和 `Math.round`，整数键全序，`byText`，不靠 `Map`/`Set` 迭代序。
- SVG 分层：projection、cut、ground、annotation。
- `cut` 分级：结构填 poché，门窗不填，家具默认不进。
- 曲面墙平滑抑制（同 prism 且夹角 <12°，语料确认）。
- 输出带 `assumptions[]`（ADR 0030 决定 5）和 D10 档案字样。

测试 T1–T8 见研究报告 §6，其中 T3 必须同时有均匀和定向采样，T4 必须四种故障变红，T7 Linux 和 Windows 比 SHA。动手前按 D13 取 GB/T 50104 核对 1.4b 和标高线宽；取不到时写成项目约定，不声称符合标准。

不许：`src/view/` 取代码；三角形反推棱柱；新依赖；像素外的“看起来对”。

### DS14 · 打印派生高度 — `todo` · 2 日 · opus · 依赖 DS7、DS8

D9 已批准。`schedule indicators` 和 `building` 标注加层数、高度；同一 PR 改 `AGENTS.md`（注意字节上限）、`docs/agents/iron-laws.md`、新 ADR，并给 `test/height-byte-identity.test.ts` 加例外：只有用到这些表或标注时才变，几何不变。高度算法读 GB 55037-2022 后确定，不是 `storeys × height`。验收：16 层宿舍是否跨 50 m。

### DS15 · 楼梯进剖面 — `todo` · 4–5 日 · opus · 依赖 DS12、DS13

横向棱柱：沿梯宽拉伸的侧面轮廓。踏步高按层高推导，入台账。只支持轴对齐两种情形。T1 明确放宽。

**没有这张卡，剖面穿不过楼梯间，不能宣称完成。**

---

## 波次 4 · 成套输出

### DS16 · `route` 元素 — `todo` · 2–3 日 · opus

`src/elements/route.ts`，照 `fence`。类别是数据：`ped|veh|fire|service`。默认不画；未选中的 route 不进 `drawingBounds`。箭头方向取折线段。扫一遍对 `ir.elements` 通用遍历的 lint 规则。

### DS17 · `diagram` 语句 — `todo` · 5 日 · opus · 依赖 DS16

`diagram fire "消防分析" { show route fire  mute rooms  step "车道" { … } }`，`CompileOptions.diagram?: string`。在 `src/scene-build.ts:1072` 同一阶段追加，不动页面。图例同时进 `planTableRows`。全局语义色表，冲突报诊断。先验证 SVG、PDF、DXF 的底图降调；DXF 无透明，要定降级方案。

不许：叫 `view`；复制 plan 再改；每图重排。

### DS18 · `frame` 图框 — `todo` · 1–2 日 · sonnet

opt-in。不动居中和锚定，21 个示例带 `paper`，改了金样全动。GB/T 50001 数字读过才写。

### DS19 · `pack()`、`toPdfSet`、`arch pack` — `todo` · 5 日 · opus · 依赖 DS8、DS17

纯函数，形态同 `finish()`。目录固定 sheet 0，一遍完成，不迭代。行来自 `title`。读 `src/export/pdf.ts` 全文确认无全局状态。图号校验按 `research/2026-11-02-views-and-sheet-sets.md` §4.3 的三段式。立面和剖面由 CLI 调 3D 包是可选；core 不依赖它。

### DS20 · `building from` — `todo` · 5–7 日 · opus · 依赖 DS7

`import "a.arch" as a`，link 阶段走 World。子建筑解析共用 `stepsBefore`。**真冲突：** `compile()` 今天不跑 joinery，这里必须先用 `MAX_FACE_WALL_SEGMENTS` 计费。角度量化到 0.01°，四则级数 sin/cos，90/180/270 走 D4 表，四舍五入到 0.001 mm。上层悬挑：取最低层外环，精确或省略。要 ADR。

### DS21 · 日照估算 — `parked` · 5 日 · opus

等 GB 7793-2025 和 GB 50180。放 3D 包，不进 `compile()`。Meeus 公式自行重写（ladybug 系是 AGPL，只看思路）。输出到分钟，距门槛 3 分钟内判“不可判定”。必须披露：非 GB/T 50947 软件、只算方案内遮挡、无满窗定义、采样参数、经纬度和北向来源。

### DS22 · 验收方案 — `todo` · 3 日 · opus · 依赖波次 3、4

README §7。
