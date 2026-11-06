# 产品规划卡片（RM）

规则同 `../drawing-set/cards.md`：选依赖已完成、波次已开放的第一张 `todo` 卡。状态词：`todo`、`doing`、`done`（裁成 id、标题、状态、PR、commit）、`blocked`（等 §6 裁定）、`parked`。规模是 AI 协作日，±50%，是估算不是测量。"模型"是建议执行者，主会话可改。每张卡都写明不许做什么。

大多数 RM 卡是对 backlog / 各计划已有卡的**打包与排序**。打包卡 `done` 时，被打包的原卡同一 PR 裁掉，并在原处留一行"由 RMx.y 完成，PR #n"。`[语法]` 标记的卡新增语言形式：依赖 PS7.9（spec 腾空）先完成；遵守 `AGENTS.md` 硬规则与 `docs/agents/iron-laws.md`"每个新形式带字节恒等律"；`gen:*` 的闭集从源头派生。

卡内 `file:line` 和 id 指 `main@5593484d`，动手前重新确认（C 报告发现过六处记录漂移，见 RM0.1）。

## 0. 每张卡都跑的门禁

| 何时 | 命令 |
|---|---|
| 本地，永远 | `npm run check:quick`（文档另加 `npm run docs:build`），别的都不跑（`AGENTS.md` § How to work） |
| 只在 CI 跑 | `check`、`check:drift`、`typecheck:all`、e2e、`check:3d`、bench |
| 每个 PR | 从 `main` 建 worktree，分支 `feat/<card>-<slug>`；红队最多两轮；合并按风险层级走 `docs/agents/commands.md` § Merging a PR |
| 规则卡（RM1.2a/b） | 另加：每条规则一对公开夹具（合法图零报、缺陷图必报）进 `test/defect-corpus/`；留出的一对只写进私有 `archlang-lab`，PR 只报它的计数；PR 里写出该规则用 `arch lint --json` 跑过全部 `examples/**` 的报出数 |
| 冻结期 11-24 → 12-01 | 只合 bug 修复与文档；不发 minor |

**字节恒等载荷：** SVG + `describe()` + `lint()` + `compile().diagnostics`。
**消息规则：** lint 的 `message` 不含 id；id 只在 `hint`。所有 advisory 规则的 `hint` 带 `[V]`/`[S]` 来源标记。
**证明方式：** 走 CLI 和 digest，不靠看图（`AGENTS.md`）。PNG 只作说明附件。

---

## 波次 0 · 冻结前（11-07 → 11-21 切点 → 11-23），按序

执行顺序以 `README.md` §3 的表为准：RM0.1 → RM0.2 → RM1.4 → RM1.3a → **RM5.1 → RM3.1**（RM-D4：RM5.1 的 MCP bump 必须搭 11-21 的 minor）→ RM2.1。下面的小节顺序只是编号顺序。

### RM0.1 · 记录修正 — `todo` · 0.5 日 · sonnet · 依赖无

- `../drawing-set/cards.md`：DS1、DS2 改 `done`，指向 CR1/CR2b 的 PR。
- `../preview-and-remodel/cards.md`：D1 改 `done`，指向 U.13 的 commit。
- `../plan-soundness/`：PS0.2 裁掉（1.52 已带弧）。
- `docs/backlog.md`：U.17 去掉会漂移的码数，改为指向 `ERROR_CATALOG`；"N.1" 双义处改名。
- `docs/whats-new.md`（源文件；`docs-site/` 的副本由 `sync-docs.mjs` 生成）补 1.56、1.57；`playground/README.md` profile 数改为与 `LINT_PROFILES` 一致的写法（不写数字）。
- #497 nightly 红：分诊成一行原因 + 指向的 backlog 项，不修。
- `docs/plans/README.md` 加本计划一行，状态列日期更新（与 geo-seo 会话同一行表，后合并者解决冲突）。
- growth 仓库待办写进 `handoff.md`：`category.md` §5、`master-plan.md` §1 刷新稿（另一仓库、另一会话）。

不许：改任何代码；改 `AGENTS.md`；碰 `/3d` 页（PR #529 在飞）；碰 `/axonometric`（它不在导航里，页面留到 2.0）。

### RM0.2 · "编译器说不、并说为什么" — `todo` · 1 日 · sonnet · 依赖无

新文档页 `docs/says-no.md`（名字可改，进 `sync-docs.mjs` 的 PAGES 和 sidebar）：6–8 个最小 `.arch`，每个配 `arch lint --json` 的真实输出和一句人话解释。候选：门扇撞家具（`W_SWING_OBSTRUCTED`）、房间不可达（`W_ROOM_UNREACHABLE`）、卧室无窗、车库过窄、家具进墙、被 `keep` 锁住的元素被改（`E_LOCKED_ELEMENT_CHANGED`）、`impact --lock` 报出"什么动了"。fence 用 `arch static`（错误演示不能活编译）。X9 的 Show HN 回答稿引用这页。

证明：`docs:build` 绿；每段输出由脚本从示例重新生成（放 `scripts/` 或测试里比对，不手抄）。

不许：出现"first/only/唯一"；写"合规"；提模型名或分数。

### RM1.4 · 静默接受改出声（只加 W） — `todo` · 2 日 · opus · 依赖无

- U.2 裸米值静默编译 → 一条 W（带它猜成的毫米值）。**不升 E**：会让今天能编译的图在 Show HN 前变红。
- U.3 家具类别拼错过 `--strict` → 走 `W_ALIAS_MATCH` 同路，`--strict` 下升级。
- PS0.25 与 6.10（尺寸和门位网格吸附无声）→ 一条 W，带吸附前后值；同一 PR 裁两条。
- PS0.16（`set door(width: W)` 静默字串化）→ W 现在，消息给出被当成字串的值；2.0 升 E，记进 backlog 的 2.0 桶（RM-D6）。
- U.4（家具 `label` 不画）：**不加诊断**（RM-D6）。label 是数据不是图：本卡只确认 `describe().furniture[].label` 带出它（缺则补），`docs/furniture.md` 写一句"符号不画 label，label 进 describe 与 schedule"；`schedule fixtures` 在 RM4.2。

证明：每条一个最小 `.arch` 夹具 + `arch explain` 条目；字节恒等律（不触发的图不变）。

不许：改吸附行为本身（M.9/PS0.26 是所有者的）；改 `fmt` 精度（M.8）；碰 PS0.27 词法（新形式，波次 2）。

### RM1.3a · 可达性盲点第一批 — `todo` · 3 日 · opus · 依赖无

PS0.3（上层经楼梯 `reachable:false`）、U.1（阳台门算到达）、6.11（双开门读成两窄门）。这三条都坐在 README "computed, not estimated" 的声明下面。

证明：三个最小夹具上 `describe().access`/`circulation` 的前后对照写进 PR；语料里其他图的 `describe()` 变化逐条列出并解释（这是分析修正，允许移动 describe，但要列全）。

不许：改 `W_PATH_TOO_NARROW` 的阈值（PS0.8 等复测）。

### RM3.1 · Plan JSON 无损 — `todo` · 6 日 · opus · 依赖无 · **批次 C 的前置**

- G.10/PS3.12：`place` 的图往返（投影半边已做，补回写半边）。
- PS0.21：`outdoor`、`fence` 进 Plan JSON（可选新键，不破坏）；schema 变更按 CR11 的政策记录，`$id` 版本由 CR11 定。
- PS0.20（`swing` 与 `swing_building` 矛盾）→ 一条 W，消息说明哪一个被画出（RM-D6）。
- U.7（导入产生两个 `MasterRoom`）→ 确定性改名加后缀（`MasterRoom`、`MasterRoom_2`）+ 一条 W 列出改名，与 `W_IMPORT_DROPPED` 同族（RM-D6）。
- PS3.13（每个 `place` 印回原处）：并入本卡，往返律就是证明；若证明写不出，`place` 在范围表里标 `dropped`，不发有损声明（RM-D6）。

证明：先在 PR 里列出 Plan JSON **声称承载**的形式（逐个顶层语句对 `src/plan-json*`），法则范围就是这张表；新增 `test/plan-json-roundtrip-law.test.ts`：范围内的每个示例 `-f json` → `--from-json` → SVG + `describe()` + `lint()` 字节恒等；范围外的形式在 Plan JSON 里显式标 `dropped`。这张表与这条法则就是 CR12 conformance 语料的第一条。

不许：给 Plan JSON 加任何 3D 字段；自己定 `$id` 版本；为了绿而把形式移出范围表却不标 `dropped`。

### RM5.1 · MCP 能力摘要 — `todo` · 1.5 日 · opus · 依赖无

CRF10：`INSTRUCTIONS` 879/900。做法：`INSTRUCTIONS` 保留一句能力句（客户端很少主动读资源），工具清单与"能做/不能做/编辑循环/导出清单"移入新资源 `archlang://capabilities`。PS5.3a：`validate` 返回 `next`（`NEXT_TIERS` 同序）。一次 `packages/mcp` 版本 bump，随 11-21 的 minor 发布。

证明：`INSTRUCTIONS.length` 上限测试不变；资源内容由 `src/manifest.ts`（CLI 半边）、`packages/mcp/src/tools.ts`（工具半边）、`EXPORT_FORMATS` 生成，带 drift 测试。

不许：在摘要里写"设计/布置/家具"、IFC、任何 3D 能力承诺（展示用词按 `../public-surfaces/3d.md` §2 的固定句）；手写清单。

### RM2.1 · 编辑模型的剩余可见性 — `todo` · 1 日 · sonnet · 依赖无

CR7 ② 已把"只改一个房间"放进 README（`README.md:32,75,82`）、`docs/edit-one-room.md`、ChatGPT 起始提示；`packages/mcp/README.md:68-71` 已写 `source_hash` 与 `--expected-hash` 的关系。剩余：
- CRF11：playground 起手"改一个房间"（一对源，一个 knob）。
- `skills/archlang/SKILL.md` "The loop"：编辑路径把 `impact --lock` 提到 `validate` 之后第一步；四个任务技能同步。

证明：`npm run e2e:playground` 在 CI 绿；技能文本的 drift 测试绿。

不许：加 `keep locked` 语法（B2 parked）；改 README（PS-D11 的 3D 段由 public-surfaces 管）。

### 发布切点 · 约 11-21

以上合并项切一个 minor。切点后合并的 minor 内容等 12-02。

---

## 冻结期（11-24 → 12-01）

### RM1.1a · 首次接触复测（第一次） — `todo` · 1 日 · opus · 依赖 11-21 发布

纯测量，不改代码。按 plan-soundness D7/D15 的六份 brief 与冻结提示，在发布版上跑一次；记录"N 个缺陷、最终 lint 报出 k 个"进 `../plan-soundness/handoff.md` §4 表。这个数字是 CR10 发布说明引用的覆盖数字（Q3 裁定措辞）。

不许：改提示；改 brief；把数字叫 benchmark 或与模型分数并列。

---

## 波次 1 · 批次 C（12-02 → 12-16）

### CR9 · CR10 · CR11 · CR12 — 见 `../checker-reach/README.md` §3"第 C 批"，不改日期

本计划的追加（记在各卡下，不另开卡）：
- **CR10**：发布说明附 RM1.1a 的数字和"lint 跳过了什么"（无解析、无 `site`、无 `level`、无 `height`）；加一个最小 GitHub Action 示例（`npx archlang lint --json` 跑夹具，失败即红），因为"第三方在 CI 里跑"是 CR10 的成功指标。
- **CR11 → RM3.2**（0.5 日，sonnet）：SBOM（CycloneDX）进 `release.yml`；`GOVERNANCE.md` 加继任/第二维护者一行。11-04 专业度清单仅剩的两项 N。

### RM2.2 · `arch diff` — `todo` · 2 日 · opus · 依赖无（`diffPlans` 读解析后的 plan，不读 Plan JSON）

先修 `diffPlans`：PS0.22（同框内重塑漏报）、PS0.23（位置自动 id 配错）。再加动词 `arch diff <a.arch> <b.arch> [--json]`，输出按房间/门窗/家具分组的"动了什么、没动什么"，与 `impact` 共用词表。进 `manifest.ts`，生成 `docs/cli-reference.md`。批次 C 顺延时本卡先让。

证明：`diff(a,a)` 为空；`diff(a,b)` 与 `impact` 对同一编辑的结论一致（测试）；MCP 不加工具（ADR 0012，先看 CLI 使用）。

不许：输出里带坐标以外的"建议"；给 diff 配色主题。

---

## 波次 2 · Show HN 之后（12-17 → 2027-01-09），按 Show HN 评论重排

### RM1.2a · 行家规则，不加语法的三条 — `todo` · 3 日 · opus · 依赖 RM1.3a

每条一个 PR，可独立合并或拒绝：

1. **指北针缺失**：不是默认 W（没画指北针的图是合法的）。`finish sheet` 已处理 `north`（`src/finish.ts`）；补 `validate --stage drafting` 的一条提示"图纸没有指北针，`finish` 可补"。
2. **级高对层高**（ST.1）：推算级高 = 层高 ÷（画出的踏步数 + 梯段数），超 `[S]` 数值（来源写在 `hint`）报 W；无 `height` 跳过并计入"跳过了什么"。ST.1 已点名四个示例会命中（two-storey、townhouse、garden-house、hillside-villa）：同一 PR 修示例并在 PR 里列出每个示例的 digest 变化。
3. **"标签无实物"**：用 Opus 测试的"desk nook"案例做夹具复核 `W_ROOM_MISSING_DEFINING`；已覆盖则只加夹具，不加码。

证明：§0 规则卡门禁。

不许：第 1 条加默认 W；第 2 条加 `risers` 之类新语法；在 `message` 里引条文号。

### PS7.9 · spec 腾空 — 见 `../plan-soundness/`，本计划把它提为波次 2 所有 `[语法]` 卡的前置

目标余量 ≥ RM1.2b 第 3 条、RM4.2 的 `schedule fixtures`、RM3.4 三者估算字数之和。

### RM1.2b · 行家规则，有效性与声明的三条 — `todo` · 9 日 · opus · 依赖 RM1.2a、PS7.9；`[语法]` 仅第 3 条（RM-D5 已裁）

1. **第二疏散口**：与 PS2.16（`W_INNER_ROOM`，UK）合并为一张。先建 M.16 的 egress 事实为 opt-in `describe --facts egress`（支配点、门不相交的第二路径），这是该事实的第一个消费者；再加 advisory W，只对 `uses` 为居住且满足读过的条文条件的图。条文只取读过的文本：Approved Document B 第 1 卷（`[S]` 第三方全文副本可接受，写明版本）；读不到则本条 `parked`。
2. **湿区叠放**：不做默认 W（不叠放是合法的，且语言没有"管道墙"事实）。做两件事：`score --taste` 加一条 `A_*` 建议行（跨 `level` 的湿房间投影不重叠）；`docs/edit-one-room.md` 或 keep 文档加 `keep stacked` 的配方。跨层墙检查只经 `keep stacked`（iron-laws）。
3. `[语法]` **作者自报的场地约束，走 `keep`**（RM-D5）：`keep site setback front 5m side 1.5m rear 3m`、`keep site coverage max 40%`、`keep site far max 1.2`。三个新的 `keep` 度量进 PS4.9 的卡位，默认 advisory 等级（作者可写 `hard`），触发现有 `W_KEEP_VIOLATED`，**不新开 W 码族，不给 `site` 加字段**。`front/side/rear` 按 `site.street` 给地块边分类；coverage 读外壳投影，FAR 读各 `level` 的毛面积（ADR 0027 口径，算不准的层省略并说明）。事实模块 `src/analyze/site-metrics.ts` 与 DS3 共用，谁先做谁建。同 PR 在 `../drawing-set/README.md` 加一条 D 记录：作者声明的 `keep` 不是 D5 说的"指标判限值"，D4 不动。

证明：§0 规则卡门禁；第 3 条另加字节恒等律与 `gen:*`；`keep` 的 hard/soft/advisory 三档各一个夹具。

不许：写"符合/不符合某规范"；第 3 条做任何求解或建议数值；给 `site` 加辖区名或新字段。

### RM1.1b · 首次接触复测（第二次） — `todo` · 1 日 · opus · 依赖 RM1.2a、RM1.2b

同 RM1.1a。报出数不高于 RM1.1a 时，§5 的对应行生效：轨 1 停止加规则，转向对账与"跳过了什么"。

### RM1.3b · 可达性盲点第二批 — `todo` · 4 日 · opus · 依赖 RM1.3a

4.5（草坪、水面当可走 → `outdoor` 地面种类决定可走性）、M.4（竖井到达层的叠加与行进方向）、U.22/PS0.15（`describe()` 步数预算与净面积项的二次复杂度）、PS0.6（`suggest` 经卧室给房间连门）。

证明：预算是计数不是时间（`E_STEP_LIMIT` 同路）；`describe()` 变化逐图列出。

不许：加时间限制。

### RM1.5a · 确定性泄漏第一批 — `todo` · 3 日 · opus · 依赖无

CRF1（空洞旁墙面碎片，合并共线段，保持旋转不变性；若它改变 `describe().derived_walls`，按分析修正论证并逐图列出，不按绘图修正）、CRF2（房间投票和依赖输入次序）、J16 的 `relocateLabels` 次序。

证明：等变预言机（D4 帧）在语料上零差；打乱输入次序的 digest 零差；SVG 字节变化逐图列出。

不许：碰 M.9/PS0.26。

### RM4.1 · 图纸第一批 — `todo` · 2 日 · opus · 依赖无

U.11（10 m 图上 0–1 m 比例尺 → 按图幅与比例选 2/5/10 m 档）、U.10（图例按墙类别出多个样例）、N.6（宽字形溢出 NOTES）、M.23（大图 PNG 超 2000 px → 按图幅定像素上限）。D.7（一种细线）等所有者裁定，裁定后并入。

证明：digest 差异逐图列出 + drafting 层 lint 的变化（ADR 0032 允许动）；`describe()` 零差；`W_DRAWING_OVERFLOW` 不新增。PNG 只作说明附件。

不许：改标题栏布局（D.7 之前）；改默认主题颜色。

### RM2.3 · 编辑模型补全 — `todo` · 4 日 · opus · 依赖 RM2.2

PS4.6/4.7（impact 键控：重复语句里 `preview --review` 不画环；impact 解析绑定）、PS4.8（组件内 `keep`）、PS4.10（`keep` 过 Plan JSON 与 MCP：Plan JSON 带 `keeps`，MCP `validate` 报 `W_KEEP_VIOLATED`）。PS4.9、PS4.12 留在 plan-soundness。

不许：`solve`（PS6.1 parked）；`keep locked`（B2）。

### RM4.2 · 图纸第二批 — `todo` · 8 日 · opus · 依赖 RM4.1、PS7.9；`[语法]` 仅 `schedule fixtures`

U.9（净尺寸：房间面对面尺寸作为 `dims auto rooms` 的可选项）、D.9（楼梯上的厚度标注）、PS2.39（自动尺寸落在房间地面）、J18（PDF 地面平涂；DXF 径向尺寸与带套开洞块）、D.5（DXF hatch 原点/缩放）、U.18（playground PDF 改矢量：**只允许浏览器内懒加载的矢量后端**；不许 Worker 端生成，那会上传每张图，违反 CR-D4/CR-D6 与托管法则）、`[语法]` `schedule fixtures`（按房间列家具/洁具家族、数量与作者给的 `label`，派生自 `describe().furniture`，与 `schedule rooms` 同格式；不含灯具；这是 U.4 的 label 在图纸上的唯一出口，RM-D6）。可拆成两张 PR。

不许：给 `schedule` 加手填列；改标题栏（D.7 之前）；playground Worker 加路径。

### RM3.4 · 英尺英寸显示 — `todo` · 2 日 · opus · 依赖 PS7.9 · `[语法]`

P2-10：`dimension_units standard` 或等价词（由 `gen:*` 的闭集决定），图上尺寸以 `12'-6"` 格式显示；`describe()` 仍是毫米（ADR 0027 口径不动）。`units ft` 输入已存在。

证明：不用它的图字节不变；`fmt` 往返；`W_DIM_TEXT_MISMATCH` 仍读得懂。

不许：改内部单位；在 `describe()` 输出英制。

### RM5.2 · CLI 日常 — `todo` · 3 日 · sonnet · 依赖 RM5.1

U.15 `arch doctor`（Node 版本、可选依赖、字体、`arch` 别名 bin 的 U.19）、U.16 第二套起手模板（`arch new --template remodel`，与 CRF11 的起手同源）、U.8 `compile --json=brief` 可选瘦身（**不改默认**：`compile --json` 的形状是代理契约，ADR 0015）、VA.4 `--theme`。同 PR 在 `docs/cli-reference.md` 顶部加一段"动词边界"（`validate` 对 `lint`、`describe` 对 `takeoff`），把 28 个动词按阶段分组列出；不设动词数上限。MCP 工具分组留在批次 D。

不许：改任何现有动词的默认输出。

### RM1.5b · 确定性泄漏第二批 — `todo` · 2 日 · opus · 依赖所有者 M.9

M.9/PS0.26（吸附舍入半值远离零，镜像等变）、E.11（浮点平移改事实）、PS0.27（`1e30` 词法为一个 token；它是词法形式，带字节恒等律）。

证明：等变预言机加平移轨道。会动输出，PR 列全。

---

## 波次 3 · 2027 Q1（批次 D 之上）

### RM3.3 · mask 导入 — `todo` · 3 日 · opus · **触发：第二个独立来源带样本**

`docs/import.md` 已提到一个把分割 mask 变成 Plan JSON 的实验工具；`docs/from-an-image.md` 已是 CR7 ① 的工作流页。本卡把实验工具推进为 `archlang import --from mask`，输出可 lint 的 `.arch`，丢弃物进 `W_IMPORT_DROPPED`（与 OpenPlan3D 导入同路）。工作流页只加一段"有 mask 时"。

不许：在核心里读像素；任何视觉模型依赖；重写 `from-an-image.md`。

### RM6.1 · 剖面所需的两个事实 — `todo` · 5 日 · opus · 依赖 PS7.9 · `[语法]` · **批次 D 首位（#532 触发）**

外部用户（#532，`gerontec/archlang-section`）只用 `describe --json` 与 `compile -f json` 画出了剖面，缺两件事，都是 `describe()` 的数据，不是核心的绘图：

1. **平面剖切符号**（DS11 提前）：`section A from (700, 0) to (700, 9000) look east`。平面图元素（`src/elements/section.ts`，注册在 `defs.ts`，带 `drawCost`/`bounds()`/`measures()`）：画剖切线两端的符号与编号，这是 GB/T 50001 和 ISO 128 都有的平面图要素，核心允许。`describe().sections` 带出线段与观察方向。只允许轴对齐（与 #532 的工具一致；斜切等第二个用例）。
2. **楼板构造 datum**：在 `level` 上一个由 `gen:*` 闭集定的子句（候选 `slab <mm>`，或 `floor { structure <mm> finish <mm> }`），**核心不画它**（铁律：高度不画），只进 `describe().heights`，使每层净高 = 层高 − 楼板可派生；无声明时 `describe()` 省略并在"跳过了什么"里说（ADR 0027）。

证明：两条各自的字节恒等律；`describe()` 变化只在用了新子句的图上；`archlang-section` 的示例 `haus_winders.arch` 加剖切线后 `describe --json` 能喂给它（在 PR 里跑一次该工具作说明，不进测试）。

不许：在核心画任何高度或剖面；把剖面放进 `describe()` 以外的核心输出；碰 DS13（它在 `archlang-3d`，按 D3 等 Show HN 之后）。

### RM7.1 · 无障碍与性能 — `todo` · 4 日 · opus · 依赖无

A.6/A.7（CLI `--accessible --annotate` 与 MCP 对应参数）、A.1（`dims auto` 文本的朗读）、A.3（朗读标题不引 id）、PG.1（playground 房间键盘可达）、PG.2（按形状而非 bbox 命中，"shape, never bbox"）、PG.3（事实行不抖动布局）、4.1（拼接 3× 性能，字节零动）。

证明：axe 零新增；4.1 的 bench 在 CI 上跑，本地不跑。

---

## 等待触发（不排期）

| 卡 | 触发 |
|---|---|
| IFC 下游包（archlang-3d M5） | 三个外部用户在格式之前先要它，或 Show HN 评论要它；先过 M5 spike 判据 |
| DS10–DS15 剖面立面 | N10 读过（记为受干扰即可）+ Show HN 之后（D3） |
| 3D 能力 M2+ | 由 `../archlang-3d/` 自定节奏；PS-D11 后不再等 N10 |
| RM3.3 mask 导入 | 第二个独立样本 |
| NZ/AU profile、`lint --brief`、FLOORA、MCP 工具分组 | 批次 D 既定，按 Show HN 评论重排 |
| 组件接缝单一所有者规则 | 两个 `place` 实例在共享边上对门洞冲突的真实用例 |
| PS0.16 升 E | 2.0 major（与 V.5、V.6、6.7 同桶） |
