# 产品规划卡片（RM），v2

规则同 `../drawing-set/cards.md`：选依赖已完成的第一张 `todo` 卡（按阶段的先后排）；同一阶段先做"线"以上的卡。**阶段标题里的日期是参考日期，不是门（RM-D27，所有者 2026-11-11，`README.md` §6.5）：** 卡在真实依赖满足时开工、CI 绿了就合并，不等某个日期或某个阶段"开放"，冻结期也不挡。状态词：`todo`、`doing`、`done`（裁成 id、标题、状态、PR、commit）、`blocked`（等 `README.md` §6 裁定）、`parked`。规模是 AI 协作日，±50%，是估算不是测量；没有估算的写"未估"。"模型"是建议执行者，主会话可改。每张卡都写明不许做什么。

**状态（2026-11-11 01:18Z → 01:46Z 按 `git` 与 `gh` 读）：** `done` 的有 RM0.3（#689）、RM0.1（#692）、RM8.1 与 RM8.2（#691）、RM0.2（#693，头注释一项拆成 RM0.2b）、RM0.4（三条回复与 #693 的 docs 一行）；做了一部分的有 RM0.5、RM8.4（CLI 一项由 #695 合并，只剩 RM8.4b）、RM1.3a（分支，没有 PR，没绿）；其余全部 `todo`。逐卡的状态行写在各卡下面，恢复点是 `handoff.md`。2026-11-11 新增的卡：RM0.2b、RM1.3c、RM1.4b、RM7.4、RM8.1b、RM8.4b、RM8.10（各在所在阶段）。RM-D9…D16 已由所有者 2026-11-11 批准（`README.md` §6.1），RM-D17…D20 是同日的受托裁定（§6.2）；下面的阶段划分生效。**第 8 轨"视觉质感"（RM8.1…RM8.9，2026-11-11 增补）** 的卡也全部 `todo`：RM-D21 是所有者的方向；RM-D22（第二条车道）与 RM-D23（接触阴影）已由所有者 2026-11-11 批准（`README.md` §6.3）。视觉卡各自放在所在阶段的末尾，排法以 `README.md` §3 为准（两条车道）。估时标"主会话估"的是主会话的估算，±50%。`[语法：词表]` 标记的卡只给已有形式加闭集里的词，不加新子句，但同样依赖 PS7.9、带字节恒等律。

**更新（2026-11-11 12:23Z，按 `git` 与 `gh` 读）：** 第二场合并了 #697–#718（`handoff.md` §1.1 有表）：阶段 B 的核心与视觉卡基本完成；1.59.0 的版本号 PR #720 在途；#719（RM8.5）与 #721（RM6.1 第一半）是草稿。**新增高优先卡 RM0.7（编译器路径预算）**，另新增 RM2.1b、RM1.6c、RM8.1e、RM6.1c。

大多数 RM 卡是对 backlog / 各计划已有卡的**打包与排序**。打包卡 `done` 时，被打包的原卡同一 PR 裁掉，并在原处留一行"由 RMx.y 完成，PR #n"。`[语法]` 标记的卡新增语言形式：依赖 PS7.9（spec 腾空）先完成；遵守 `AGENTS.md` 硬规则与 `docs/agents/iron-laws.md`"每个新形式带字节恒等律"；`gen:*` 的闭集从源头派生。由 profile 数字驱动的新规则还依赖 RM1.6a（`README.md` 原则 10）。

卡内 `file:line` 和 id 指 `main@69fa5864`，动手前重新确认（v1 的报告 C 与 v2 的报告 D 都发现过记录漂移，见 RM0.1）。

## 0. 每张卡都跑的门禁

| 何时 | 命令 |
|---|---|
| 本地，永远 | `npm run check:quick`（文档另加 `npm run docs:build`），别的都不跑（`AGENTS.md` § How to work） |
| 只在 CI 跑 | `check`、`check:drift`、`typecheck:all`、e2e、`check:3d`、bench |
| 执行者 | 两条车道（RM-D22，所有者 2026-11-11 批准）：一个核心执行者、一个视觉执行者（第 8 轨），外加纯文档卡；每张卡一个 worktree（`docs/agents/orchestration.md`）；一次一个重命令对整台机器生效，重的门禁交给 CI |
| 每个 PR | 从 `main` 建 worktree，分支 `feat/<card>-<slug>`（文档卡 `docs/<card>-<slug>`）；红队最多两轮；代码 PR 经 `npm run train` 上车，其余按层级直接合并（`docs/agents/commands.md` § Merging a PR） |
| 规则卡（RM1.2a/b、RM1.7） | 另加：每条规则一对公开夹具（合法图零报、缺陷图必报）进 `test/defect-corpus/`；留出的一对只写进私有 `archlang-lab`，PR 只报它的计数；PR 里写出该规则用 `arch lint --json` 跑过全部 `examples/**` 的报出数 |
| ~~冻结期 11-24 → 12-01~~ | ~~只合 bug 修复、测量与文档；不发 minor~~ 已由所有者 2026-11-11 取消（RM-D27，`README.md` §6.5）：这一周照常合并，不再是门。仍然成立：Show HN（12-01）之前 `main` 保持绿；任何一次发布（minor 或 patch）都要所有者对那一次的决定 |
| 3D 回放的改动（2026-11-11 加） | 除终帧与海报外，还要比对墙升起过程中的帧（例如回放的 6.75 s、6.80 s 处）。#691 的终帧与海报都对，透缝只在升墙中途出现，是第一轮评审逐帧比对视频时抓到的（`docs/agents/gotchas.md` § PRs & CI） |
| 执行者的长等待（2026-11-11 加） | 简报写明：可能长时间等待（等资产生成、等机器空闲）之前，先在自己的 scratchpad 写一个状态文件（已做什么、还剩什么），文件按卡命名（例如 `state-rm1.3a.md`，不叫 `state.md`：同一会话的代理共用 scratchpad，2026-11-11 有两个代理互相覆盖过）；机器忙时，小改动先提交，报告写"门禁未跑"，不在长循环里等。两个执行者在长等待中丢过任务卡（`docs/agents/orchestration.md`） |

**字节恒等载荷：** SVG + `describe()` + `lint()` + `compile().diagnostics`。
**消息规则：** lint 的 `message` 不含 id；id 只在 `hint`。条文出处的结构化字段（RM1.6a/b）只增不替：已有的 hint 文本不删，新字段不进 `lint()` 的序列化。
**核实等级：** 规则数字的出处取五值之一：`V`（读过官方原文）、`S-full`（读过全文第三方副本）、`S-secondary`（转述、摘要、讲义）、`M`（杂志）、`convention`（无文献的约定）。只有 `V` 和 `S-full` 能进新规则或公开夹具（drawing-set D13；`README.md` 原则 10）。
**证明方式：** 走 CLI 和 digest，不靠看图（`AGENTS.md`）。PNG 只作说明附件。

---

## 阶段 A · 立刻（11-10 → 11-12）：发布与对账

执行顺序以 `README.md` §3 的表为准：RM0.3 → RM0.1 → RM0.4 → RM0.5。RM0.4、RM0.5 中的纯文档部分可以由第二个执行者并行。

- RM0.3 · 发布 1.58.0 → done (lab)
- RM0.1 · 记录修正（扩大） → done (lab)
- RM0.4 · 欠外部的跟进 → done (lab)
- RM0.5 · 依赖与悬空状态 → done (lab)
- RM0.6 · 工具：`scripts/backlog-archive.mjs` 的两处缺陷（2026-11-11 加，出自 RM0.1 余项的真实运行） → done (lab)
- RM0.7 · playground 编译器路径预算用尽，结构性腾出余量（2026-11-12 加，出自 #721 与 #704、#713） → done (lab)

### RM2.1b · 旋钮拖动中途重载保留旧平面（2026-11-12 加，出自 #718 的 "Known residue"） — `todo` · 未估 · sonnet · 依赖无（线下）

#718 修了 gallery 选样例后的过期渲染覆盖旋钮编辑的竞态。残留：选样例后 250 ms 内的非最终旋钮移动，在松手前重载，草稿与 hash 仍是旧平面（被取消的保存要到松手才补做）。一个小的行为变化。内容：决定补做还是接受；补做则在被取消的保存处记待保存并在重载前冲刷。证明：一个把这个窗口钉死的 e2e（不靠重试，等过去抖窗口再断言）。不许：用重试掩盖竞态。

### RM1.6c · `W_LEAF_TOO_WIDE` 的 explain 文字仍写 "2018 and earlier"（2026-11-12 加，出自 #713） — `todo` · 未估 · sonnet · 依赖无（线下）

#713 的出处表把 IBC 1219 mm 门扇的版本记为 "2018 and earlier"（iDigHardware 转引，2021 版删了这句；growth 的勘误 (1)），但 `W_LEAF_TOO_WIDE` 的 `arch explain` 文字仍沿用旧说法。内容：让文字与出处表一致（先读表，不重抄）。证明：`arch explain W_LEAF_TOO_WIDE` 与表一致的测试。不许：在 `message` 里引条文号；把 `S-secondary` 写成 `S-full`。

### RM0.7b · 增长门重取基线（2026-11-12 加，出自 #727） — `todo` · 未估 · sonnet · 依赖无（线下）

现象：增长门（基线 438,980 + 20,000 = 458,980）现在比 `compilerPathBudget` 401,000 还松，永远不会先触发。内容：按实测大小重取增长门基线。证明：门的上限低于预算，且在人为加重的构建上先红。不许：抬 `compilerPathBudget`。

### RM0.7c · `explain("constructor")` 在库里抛 TypeError（2026-11-12 加，出自 #727） — `todo` · 未估 · sonnet · 依赖无（线下）

现象：库的 `explain("constructor")` 抛 `TypeError`（CLI 先拒绝了这个名字，所以只有库露出）。内容：对自有键做守卫。证明：`explain` 对 `constructor`、`__proto__`、`toString` 返回未知码的结果而不抛。不许：改已知码的输出文字。

- RM0.7d · 其他被打包器因不纯而保留的顶层值（2026-11-12 加，出自 #727） → done (lab)

### RM8.5b · Plan JSON 丢掉用作洞盖的 `outdoor`（2026-11-12 加，出自 #719） — `todo` · 未估 · opus · 依赖无（线下）

现象：`outdoor` 用作洞盖时 Plan JSON 把它丢了，`examples/courtyard-family.arch` 经 JSON 回来后无法编译（`E_ROOMS_NOT_TILING`）。内容：让 JSON 带上它，或由 `planToJson` 明说该文档不能还原；修好后删掉 `UNRESOLVED_WAY_BACK` 里的那一条。证明：该示例的 JSON 往返测试。不许：只删名单不修。

### RM8.5c · `test/visual.test.ts` 以 basename 为 garden-courtyard 金图取键（2026-11-12 加，出自 #719） — `todo` · 未估 · sonnet · 依赖无（线下）

现象：金图按 basename 取键，将来同名的顶层示例会撞。内容：改成按相对路径取键。证明：同名两个示例不撞的测试，现有金图不动。不许：重蓝金图。

### RM8.5d · `scripts/specimen.ts` 比较模式遇到 `--before` 检出不认识的家族就抛（2026-11-12 加，出自 #719） — `todo` · 未估 · sonnet · 依赖无（线下）

现象：新增家族后无法跨增加做前后对照。内容：不认识的家族在 before 侧显示为缺失而不抛。证明：对一个缺家族的检出跑比较的测试。不许：改非比较模式的输出。

### RM8.5e · 余项：3D 目录小图与 garden-courtyard 的文档提及（2026-11-12 加，出自 #719） — `todo` · 未估 · sonnet · 依赖无（线下）

内容：在主检出干净的 `npm run build` 之后重现 3D 目录小图并核对；为 garden-courtyard 在 docs 里加一处提及（用文字，不在围栏里写新家族词，见 `.claude/rules/docs-prose.md`）。证明：重生成的图与已提交的一致；`docs:build` 绿。不许：手修图。

### RM0.8 · Deploy mcp 的 smoke：对固定版本的副本，在一次 302 或非 immutable 的响应上重试几秒（2026-11-12 加，出自 run 43015163598） — `todo` · 未估 · sonnet · 依赖无（线下）

run 43015163598（`9a3be392`，11:49:49Z）的 `Deploy mcp (scripted Worker)` smoke 报 `/svg/<studio.arch payload>: the pinned copy is not immutable: public, max-age=300, stale-while-revalidate=86400`。协调者的判断：版本传播的竞态，部署后一秒固定版本的 URL 落到了旧的 isolate，不是配置缺口；之后的 Deploy run 43025136172 全部 success。内容：让 `scripts/smoke.mjs` 在固定版本的取副本上遇到 302 或非 immutable 的头时重试几秒（有上限、有最后一次的真实错误），其余检查不放宽。证明：一个测试用假服务器先返回旧头再返回 immutable 头；真正的缺陷（一直不 immutable）仍然失败。不许：放宽 immutable 的断言；无上限地重试。

- RM0.9 · 兼容检查器把带 `kind` 的联合当作枚举集合（2026-11-12 加，出自 RM-D33 的协调者裁定） → done (lab)

## 阶段 B · 冻结前（11-13 → 约 11-21 切 1.59.0）：~~不加语法~~（RM-D27 作废，`README.md` §6.5：`[语法]` 卡在 PS7.9 合并后就开工，不等阶段）

执行顺序以 `README.md` §3 的表为准：RM1.3a → RM5.1 → RM1.4 → 发布 1.59.0，线（8 日 = 3 + 2 + 2 + 发布 1，9 个日历日）以下 RM2.1 → RM1.6a → PS7.9。RM0.2 是纯文档卡，也在线上，但由第二个（只做文档的）执行者并行，不计入 8 日。~~切点前合不完的进阶段 D，不挤进冻结期。~~ RM-D27 之后：切点前合不完的卡接着做、绿了就合并，进下一次所有者决定的发布；没有冻结期要躲。

- RM1.3a · 可达性盲点第一批 → done (lab)

### RM1.3c · 双开门读成两扇窄门（6.11，从 RM1.3a 拆出） — `todo` · 未估 · opus · 依赖一次设计裁定（记入 `README.md` §6）

内容：backlog 6.11：`describe()` 的到达图与 circulation 把双开门的每一扇当成一个门；`museum-wings.arch` 的主入口（两扇 1000 mm 门扇，各净宽 940 mm）因此算成两个 940 mm 门洞，而不是一个约 1940 mm 的洞口。backlog 把"分析要不要、以及怎样认出一对门扇"（同一门框、同一宿主、都铰在外侧门框上）记为开放的设计问题，并指出拟议的 egress 事实（M.16，最大流的门通行能力）会顺带解决它。所以先写一页设计（两种做法：在分析里认出一对门扇；或等 M.16），交主会话或所有者裁定并记入 `README.md` §6，裁定之后才写代码。

证明：裁定的出处；若做，`museum-wings` 的 `bottleneckClearWidth` 前后对照写进 PR，语料上 `describe()` 的变化逐图列出并解释（分析修正，允许移动 `describe()`，但要列全）；SVG 与默认 `lint()` 零差。

不许：没有裁定就写代码；改 `door … double` 的画法（`doorLeaves`，`docs/agents/gotchas.md` § Core）；顺带改 `W_PATH_TOO_NARROW` 的阈值。

- RM5.1 · MCP 能力摘要 → done (lab)

### RM5.1b · MCP 能力页的文字小项（出自 #703 的第二轮评审，报告没有保留） — `todo` · 未估 · sonnet · 依赖无（线下）

- `archlang manifest` 的摘要 "this document: the whole CLI API"（在 `src/manifest.ts`）读起来像是能力页本身，改成只指 CLI 清单。
- 生成器里手写了 `npx -y @chanmeng666/archlang`，应当从真源派生，不重抄。
- 托管端的 CPU 上限没有在能力页里点名。

证明：能力页由生成器出，drift 绿；`INSTRUCTIONS.length` 上限测试不变。

不许：手写清单；在摘要里加能力承诺（`../public-surfaces/3d.md` §2）。

- RM1.4 · 静默接受改出声（只加 W） → done (lab)
- RM0.2 · "编译器说不、并说为什么" → done (lab)
- RM0.2b · `examples/studio.arch` 头注释改正（#683，从 RM0.2 拆出） → done (lab)

### ── 线（8 日）──

- RM2.1 · 编辑模型的剩余可见性 → done (lab)
- RM1.6a · 出处成为数据（#680 前半） → done (lab)
- PS7.9 · spec 腾空 → done (lab)
- RM1.4b · 写错大小写的主题名静默无效 → done (lab)

### RM1.4c · `W_GRID_SNAPPED` 没覆盖的几类（2026-11-11 加，出自 #704 的评审） — `todo` · 未估 · opus · 依赖 #704 已合并（线下）

**状态（12:23Z）：** #704 已合并，本卡依赖满足，仍 `todo`。**下面那句 "只剩 145 B" 已过时：** 预算已被协调者在 #704 里重取为 458,980 B，之后 #713 +74 B，#721 超出 848 B，见 RM0.7。

`W_GRID_SNAPPED` 不报：门宽、窗、派生的门位（`on <wall> at …`、`centered`）、多边形顶点、圆半径。要不要报、报哪些，先在 PR 里按"哪些值真的会被吸附"逐类核对再加，只加 W。**另：** playground 的编译器路径预算只剩 145 B 余量（457,855 / 458,000 B），本卡或之后任何动核心的卡先削掉可证明的重复，不抬上限。

证明：每类一个最小夹具；不触发的图字节恒等。不许：改吸附行为本身（M.9/PS0.26 是所有者的）；抬预算。

### RM7.4 · `examples/clinic.svg` 没有生成器，已与编译器输出不一致 — `todo` · 未估 · sonnet · 依赖无（2026-11-11 加，出自 #695 的评审 L）

评审 L 发现 `compile examples/clinic.arch -o -` 与已提交的 `examples/clinic.svg` 字节不同。2026-11-11 复核：用 1.58.0 的 `dist/cli.js` 编译，第 20 行起不同；`scripts/gen-example-svgs.ts` 的 `README_SVGS` 列了 20 个示例，不含 `clinic`，`examples/` 下却有 21 个 `.svg`；`git grep "clinic.svg"` 没有任何引用。所以这张图没有生成器、`check:drift` 不守它，旧了也没人知道（那个生成器头注释写的正是这类"rot"）。

内容：二选一并在 PR 里写理由：删掉这张没人引用的图；或把 `clinic` 加进生成器的清单并有引用它的地方。再查一遍 `examples/` 与 `docs-site/public/` 下有没有同类没有生成器的图。

证明：`check:drift` 绿；若保留，生成器重生成后与编译器输出逐字节相同。

不许：手改 SVG；为了留下它而放宽 `test/example-svgs-drift.test.ts`。

### 第 8 轨（视觉）· 阶段 B

排法见 `README.md` §3 阶段 B：视觉车道 RM8.1 → RM8.2 → RM8.3，核心车道的线不变。三张卡都动 `packages/archlang-3d` 与 `docs-site/public/3d/`，不碰 `src/`。

- RM8.1 · 3D 假缝：按楼层、按平面求墙的特征线 → done (lab)
- RM8.2 · 海报与视频抗锯齿 → done (lab)
- RM8.1b · #691 的后续：分组切换的纯函数与没测到的情形 → done (lab)
- RM8.1d · 共线对接的两面墙，一面深度偏 1 µm 时，窗的位置改变墙的拓扑（2026-11-11 加，出自 #706 执行者的报告；先调查） → done (lab)

### RM8.1e · 角接（L 形）的点落在边上的吸附（2026-11-12 加，出自 #711） — `todo` · 未估 · opus · 依赖无（线下）

#711 之后，在其模糊测试里，0.005–0.015 带内的 1,471 个平面中仍有 29 个不闭合（全是 L 形）：面在 `SNAP_MM` 之内而角在其外（距离 0.01525–0.0211 mm）。互操作器合并点，不把点吸到边上，所以这一步在 #711 的范围之外；CHANGELOG 已写明仍未解决。内容：设计"点吸到边上"的吸附（核心的 joinery），或记录为不可修的原因。证明：那 29 个用例的前后；语料上 SVG、`describe()`、`lint()`、Plan JSON、Mesh3D、GLB 逐字节不变。不许：把 `SNAP_MM` 放大来遮住；本地 bless 关键帧。

### RM8.1c · 墙线通道 `linesOf` 在长而窗多的墙上占挂载耗时（2026-11-11 加，出自 #706 执行者的报告） — `todo` · 未估 · sonnet · 依赖 #706 已合并（线下）

#706 的执行者报告（PR 正文里没有）：一面墙上有 80 扇窗时 `wallOutline` 要 173–265 ms，线通道（`linesOf`）占大头。先用合成的窗多的长墙量出耗时与内存，超出可接受范围才改算法；改了的话 `wall-lines` 在语料上的输出逐字节不变。

证明：量法与数字进 PR；关键帧、Mesh3D、GLB、事件表零差。不许：移动任何钉子；本地 bless 关键帧。

- RM8.3 · 3D 画出庭院（backlog VA.2） → done (lab)

### RM8.3b · 庭院地面的深度精度与 `build --json` 的计数（2026-11-11 加，出自 #701 第二轮评审） — `todo` · 未估 · opus · 依赖无（线下）

- 0.5 mm 的抬高小于 Blender 视口与其他 GLB 查看器在建筑尺度下的深度精度，庭院的 patio 在那里仍可能闪烁。三选一并在 PR 里论证：开放天空的地面之下不放楼板进 GLB；室外地面比楼板抬更大一点；或在 `docs-site/3d.md` 写明 GLB 的这条限制。
- `build --json` 每层的计数不含 outdoor 与 fence 节点，补上或写明。

证明：按所选做法的最小夹具；其余图的 Mesh3D 与 GLB 零差（或钉子带理由移动）。不许：本地 bless 关键帧；改核心。

---

## 阶段 C · 原"冻结期"（11-24 → 12-01，日期现为参考）：测量与文档

~~不合任何功能代码。~~ RM-D27（所有者 2026-11-11，`README.md` §6.5）取消了冻结期：本阶段的卡依赖满足就开工，功能代码在这一周也照常合并，只要 `main` 在 Show HN（12-01）之前保持绿。

- RM1.1a · 首次接触复测（第一次） → done (lab)

### X9 · Show HN 回答稿 — 见 `../public-surfaces/3d.md`

本计划只加一项：growth 仓库里过期的 Show HN 物料另开 PR（`marketing/launches/show-hn/anticipated-comments.md` 还写 "no winders"，`marketing/launches/runbook-2026-09.md` 对 "It does 3D now." 还答 "It does not"，日期还是 09-16，`marketing/launches/show-hn/draft.md` 还写 "Not scheduled"）。回答稿只写 1.59.0 里已发布的事实。

### RM5.3 · 代理入门一条 URL — `todo` · 未估（报告 B 引来源估 2–4 日） · sonnet · 依赖 RM5.1

它含一个生成器和一条 drift 测试，还要改 `sync-docs.mjs` 的 PAGES，所以不是纯文档卡：由主执行者做，不由第二个执行者并行；~~冻结期只合 bug 修复、测量与文档，合不了就顺延到阶段 D。~~ RM-D27 之后：依赖 RM5.1 已合并（#703），按核心车道的顺序做，绿了就合并。

docs 站一页（名字可改，进 `sync-docs.mjs` 的 PAGES）：一个代理从这一个 URL 出发就能装好、写一张平面、编译、lint。内容由 `skills/archlang/SKILL.md` 与 `llms-install.md` 同步生成（生成器从这两个源派生，不重抄），带 drift 测试。

证明：全新会话只给这个 URL，能编译并 lint 一张 12×8 的平面（记录会话的输入与 `arch lint --json` 的输出，放 PR 说明，不进测试）；drift 测试绿；`docs:build` 绿。

不许：手抄 SKILL 或安装说明；页里出现"first/only"、合规、IFC 或 3D 能力承诺；加 `.mcp.json`；示例 fence 用活编译的 `arch`（片段用 `arch static`）；示例里出现新的 fixture 家族名（`.claude/rules/docs-prose.md`）。

### 冻结期设计稿（五份，纯文档，可由第二个执行者并行；第五份 `visual-language.md` 于 2026-11-11 随第 8 轨加入）

放 `design/`（本目录下；原定冻结期才建，RM-D27 之后提前建了）。每份是对应卡开工前要读的设计，不是实现。**2026-11-11 已写成四份**：`design/schema-policy.md`、`design/walls-facts.md`、`design/slab-and-section.md`、`design/plan-json-scope.md`；各卡的依赖行已注明。原来的要求：
- `schema-policy.md` → CR11a：`$id` 与变更、弃用政策草案。
- `walls-facts.md` → RM7.2：字段按 `_derivedWalls` 的真实形状（`points[]`、`closed`、`between` 或 `ring`、厚度、类别、状态，`src/elements/walls-from-rooms.ts`）；按墙 `id`（即 piece 名）与 `heights.walls[]`（`src/describe.ts` 的 `{ id, height }`）、`describe --facts quantities`（`src/analyze/quantities.ts` 按 `id`）对齐；已有的 `describe().derived_walls[].name` 是 spec 名，CR8 切分后一个 spec 对应多个 piece，设计稿要交代新事实与默认 `derived_walls` 的关系；写明"段的粒度在 CRF1 之后才稳定"；新事实进 `engineProbeParts`（`test/helpers/byte-identity-payload.ts`）；消费者一栏照实写。
- `slab-and-section.md` → RM6.1：DS11 并入时的四件事（拼写取 DS11 的 `section A (x,y)->(x,y)` 还是 #544 的 `from … to …`；进 `describe` 主体还是 opt-in 事实；多层平面上剖切符号画在哪一页；`section` 写进日后 DS5 的 `level a..b` 时 id 怎么不重复，定不下来就保留对 DS5 的依赖）；净高子句的拼写，按 RM-D17（MF-D11 的受托裁定，`README.md` §6.2）。
- `plan-json-scope.md` → RM3.1：范围表，逐个顶层语句对 `src/plan-json*`；列出 J16（每扇窗写 `sill`）与 PS0.18（Hall 往返成 `uses entry`，~~待所有者裁定，未裁则标 `dropped`~~ 设计稿读到它已由 `78e0b7f9` 修掉，`uses` 一行是"往返"；PS0.18 已由 RM-D31 于 2026-11-12 关闭）。RM8.7 的"3D 读 `floor`"在这张表里一起定（`floor` 今天在 `PlanJsonDroppedClause` 里，`src/plan-json/to-json.ts`）。
- `visual-language.md` → 第 8 轨（RM8.5–RM8.9）。写明：
  - RM8.8：接触阴影与环境遮蔽怎样从几何确定性地烘焙（不用实时阴影图）；帧时间预算的数字与量法（backlog VA.5 的条件；V9 的阴影图实测在 SwiftShader 上多约 55% 帧时间，超过当时约 30% 的预算，`mount.ts` 灯光处的注释）；它进 Mesh3D 与 GLB 还是只在查看器里。
  - RM8.6：门框与门套、窗台板、楼梯踏步与栏杆的默认尺寸（每个都进账本），各取墙厚或洞口的哪个比例。
  - RM8.7：新地面词与 `outdoor` 种类的名字与图案（裸图案，线色跟主题，不重画墙材料的图案：`.claude/rules/glyphs.md`）；`carpet` 今天是 `rug` 家族的别名，`stone` 是 `NEAR_WORDS` 里的词，也是 `FIXTURE_MATERIALS` 的材质名，取名时逐个说明会不会混淆；每个词的 `spec.llm.md` 成本。
  - RM8.9：新家族清单、canonical 名与别名（避开 `test/helpers/new-families-law.ts` 的 `NEAR_WORDS`：`rack`、`lamp`、`table_lamp`、`stand`、`trunk`、`planter_box`、`stone`；`screen` 已是材质名；"院门"与 `fence` 头注释按名字推迟的 gate 怎样不冲突）；哪些有目录占地（决定 spec 成本）；挂墙物的默认挂高。
  - RM8.5：展示示例怎样合法进入 `test/new-families-byte-identity.test.ts` 扫描的语料（它扫描所有已发布平面与 `docs/` 的 Markdown 围栏）：一份带理由的名单，法则本身不放宽；新示例对其他字节恒等律语料的影响。

### RM1.8 · 读 GB 55038-2025 原文（#684） — `todo` · 未估 · sonnet · 依赖无

读 GB 55038-2025 的官方原文（drawing-set D13：先取官方免费文本，取不到再请所有者手动打开；第三方镜像只能当 `S-full` 或 `S-secondary`）。回答 #684：它是否取代 GB 50096-2011 5.4.2 的 WC 1.1 m²、卫浴 2.0 m²；4.1.1、4.1.4 的下限与 `cn-residential-advisory` 现有值的关系。结论写回 #684，并按 §0 的五值标出读到的等级。注意这两个数在 `DEFAULT_RULESET` 里，动它们影响每张图，不只 cn。

证明：#684 下的评论引条文号、版本与读到的文本来源；本卡不改代码。

不许：在本卡里改任何规则数字（动默认规则集的两个数另开卡，带语料扫描与字节变化说明）；把镜像标成 `V`；写"合规"。

### 第 8 轨（视觉）· 冻结期

RM8.1 是查看器缺陷修复，冻结期允许合并；但海报要在 Show HN（12-01）前部署，关键帧重钉还要一轮 CI，所以目标是冻结前合并。（2026-11-11：RM8.1 与 RM8.2 已由 #691 合并，`main` 推送即部署了新海报；Deploy run 42937898404 success。）~~RM8.2、RM8.3 不是缺陷修复，冻结期不合。~~（RM-D27 之后不再有冻结期；两张卡都已合并。）`visual-language.md` 见上面的设计稿列表。

---

## 阶段 D · 批次 C′（12-02 → 12-16；1.60.0 约 12-21 切）：契约、出处、公开检查集、无损

执行顺序以 `README.md` §3 的表为准：CR11a → RM1.6a（若阶段 B 没做完）→ RM1.6b → CR10 → RM3.1 前半 → 发布 1.60.0，线（12–14.5 日 = 11–13.5 + 发布 1）以下 RM3.1 后半 → PS7.9（若没做完）→ CR11b + RM3.2 → RM4.3。CR9、CR12、RM2.2 在阶段 E 线下。1.60.0 避开 Product Hunt 那一周。RM3.1 按 RM-D10 拆成两半。RM5.4 在线下，~~12-02 之后才开工~~（RM-D27 作废了这个日期；主版本升级仍等所有者）。

- CR11a · schema `$id` 与变更政策 → done (lab)
- RM1.6b · 诊断带结构化 `rule`（#680 后半） → done (lab)
- CR10 · 公开检查集 + `POST /check` → done (lab)
- RM3.1 前半 · Plan JSON 无损：范围表、往返律、`outdoor` 与 `fence` → done (lab)

### ── 线（12–14.5 日）──

### RM3.1 后半 · Plan JSON 无损：`place` 往返及其余 — `todo` · 3 日 · opus · 依赖 RM3.1 前半

- G.10/PS3.12：`place` 的图往返（投影半边已做，补回写半边）。
- PS3.13（每个 `place` 印回原处）：并入本卡，往返律就是证明；若证明写不出，`place` 在范围表里保持 `dropped`，不发有损声明（RM-D6）。
- PS0.20（`swing` 与 `swing_building` 矛盾）→ 一条 W，消息说明哪一个被画出（RM-D6）。
- U.7（导入产生两个 `MasterRoom`）→ 确定性改名加后缀（`MasterRoom`、`MasterRoom_2`）+ 一条 W 列出改名，与 `W_IMPORT_DROPPED` 同族（RM-D6）。
- 加一页"把识别结果写成 Plan JSON"：识别器输出 Plan JSON，再 `arch lint` 的路径；链接 `docs/from-an-image.md` 与 `docs/import.md`。

证明：往返律把 `place` 从 `dropped` 移进范围（或照实保持 `dropped`）；W 各一个最小夹具；`docs:build` 绿。

不许：给 Plan JSON 加任何 3D 字段；在页里写"checks other formats"或把 ArchLang 说成检查别家格式的工具（A3：OAS 发布且往返指标通过之前不说）；在核心里读像素。

### CR11b + RM3.2 · `lang-1.0`、SBOM、继任 — `todo` · 2 日 · sonnet · 依赖 CR11a

CR11 的其余一半：语言规范独立版本 `lang-1.0`。RM3.2：SBOM（CycloneDX）进 `release.yml`；`GOVERNANCE.md` 加继任/第二维护者一行（11-04 专业度清单仅剩的两项 N）。

证明：一次 dry-run 的发布工作流产出 SBOM 文件（CI 跑）；`docs:build` 绿。

不许：改 tag 与 OIDC 发布流程的权限；在 `GOVERNANCE.md` 里写具体的人名而所有者没有同意。

### RM4.3 · DXF 图层线宽（#682） — `todo` · 1 日 · opus · 依赖无（相关：backlog D.7）

`src/export/dxf.ts` 的每个 LAYER 写线宽（组码 370）。取值映射到 370 允许的枚举值（DXF 只接受一组固定的线宽值），由 SVG/PDF 已画的线宽同一张表派生，映射写成一个函数并有测试。所以 D.7（一种细线）日后怎么裁，DXF 都随这张表变；D.7 是相关项，不是依赖。颜色不变。`--layers ncs6` 不在本卡。

证明：DXF 字节的变化逐示例列出，SVG/PDF 零差，`describe()`/`lint()` 零差；一条测试断言每个图层都有 370 且值在允许的枚举里；QCAD 或 LibreCAD 打开，加 ezdxf 读回线宽（记录在 PR）；AutoCAD 的检查交给所有者。

不许：改 SVG/PDF 的线宽；在 DXF 里另立一张线宽表（只能从 SVG/PDF 的表派生）；改图层名（NCS v6 的命名是另一件事）；写 `--layers iso13567`（§4 不做）。

- RM5.4 · `@modelcontextprotocol/ext-apps` 2.x 迁移（#603） → done (lab)

### 第 8 轨（视觉）· 阶段 D

视觉车道 RM8.3（若阶段 B 没做完）→ RM8.4 → RM8.5 → RM8.6，合计 8.5 日（RM8.3 顺延过来时 12.5 日）（`README.md` §3 阶段 D）。

- RM8.4 · 把色彩主题亮出来 → done (lab)
- RM8.4b · 示例页与 gallery 的 `rendered` 版本（RM8.4 的后半） → done (lab)
- RM8.5 · 把词表亮出来 → done (lab)
- RM8.6 · 门窗与楼梯的 3D 细部 → done (lab)
- RM8.6b · 3D 门窗套的顺序无关与分段栏杆（2026-11-12 加，出自 RM8.6 评审） → done (lab)

### RM8.6c · RM8.6 的余项（2026-11-12 加，出自 #729、#732） — `todo` · 未估 · opus · 依赖无（线下）

1. 梯段边没有在墙的端点处分开。复现：`wall id=p interior thickness 100 { (2000,0) (2000,2500) }` 加 `stair id=s at (2050,500) size 1000x3000 dir up width 1000`，左侧读作墙，1000 mm 的敞边没有栏杆；`main` 上本来就有。
2. 栏杆终点落在梯段内时没有柱头。
3. 中等墩（c < 墩 < 2c）两条腿都省了；考虑改为一条居中的共用腿。
4. 自动命名的洞口 id 含 `:` 时没有门窗套；需要对 GLB 安全的节点名。
5. 3D 的窗台侧规则对语料外的核心边界情形（多边形洞口接缝、圆房间的细分）未验证。
6. 推拉门（barn）的门扇面跟随墙的绘制方向，镜像不对称。
证明：每件各一条测试，复现用例先红后绿。不许：改 `main` 上已有的 3D 默认尺寸而不进账本。

- RM8.10 · 在回放 HTML 与 playground 的 3D 页签里显示 `W3D_MIXED_HEIGHT_JOINT` → done (lab)

## 阶段 E · 波次 2′（12-17 → 2027-01-09；1.61.0 约 01-05 切）：深度

~~先按 Show HN 评论重排（`README.md` §5）。~~ RM-D43：不等评论，按默认顺序开工。RM1.1b 量的工作必须在 1.61.0 里，所以有效窗口是 12-17 → 约 01-05，19 个日历日，跨圣诞与新年。默认顺序：RM3.1 后半（若没做完）→ PS7.9（若没做完）→ RM1.2a → 发布 1.61.0 → RM1.1b（01-06 → 01-08），线（9.5 日 = 3 + 1.5 + 3 + 1 + 1，前两项只在没做完时计）以下 CRF1 → RM7.2（线下首位）→ RM4.1 → RM1.2b → MF1 → RM1.7 → 其余。RM7.3 在读数日做，不计入线。

- RM1.2a · 行家规则，不加语法的三条 → done (lab)
- RM1.2c · "Desk Nook" 不触发任何规则（2026-11-14 加，出自 #733） → done (lab)

### RM1.2d · `arch fmt` 总是打印 `north up`（2026-11-14 加，出自 #738） — `todo` · 未估 · opus · 依赖无（线下）

现象：`src/format.ts:309` 无条件输出 `north up`，悄悄回答了 drafting 的指北针提示。内容：只在源里写了 `north` 时才打印（格式输出变更）。证明：全语料字节同一性（写了 `north` 的图不变，没写的图的 `fmt` 输出变化逐个列出）。不许：改 `north` 的绘制。

### RM1.2e · 指北针提示压过 `W_GRID_SNAPPED` 的测试与文档（2026-11-14 加，出自 #738） — `todo` · 未估 · sonnet · 依赖无（线下）

内容：补测试，复现 `grid 100`、房间 4050x3000、无 `north`、`--stage drafting`；核对 `docs/analysis.md` 表中的行序与"gates"的措辞。证明：测试先红后绿或确认现状。不许：改排序。

### RM1.2f · 级高提示的余项（2026-11-14 加，出自 #736） — `todo` · 未估 · opus · 依赖无（线下）

1. 270° 四梯段楼梯上，级高提示让第 1 与第 7 块重叠（`E_STAIR_PIECES`）：提示的增长若与别的块重叠就拒绝并回退（opus）。
2. 提示引用的是取整后的解算数，源为小数或表达式时不能原样粘贴。
3. 目录的 Fix 文字应提到已放置的楼梯会得到进深；Cause 对 winder 的说法自相矛盾。
4. `inline:stair-arrival` 的重钉没有写进 `byte-identity-baseline` 的 RM1.2a 一节。
5. 第三份 `rectOfPiece` 重复辅助函数，合并。
证明：每条一条测试或一处文字对账。不许：加新语法。

- RM1.2g · winder 与 3D 不一致（2026-11-14 加，出自 #736） → done (lab)

### RM1.2h · ST.1 残余：三个示例没写高度（2026-11-14 加，出自 #736） — `todo` · 未估 · sonnet · 依赖无（线下）

现象：townhouse、garden-house、hillside-villa 在默认 3000 层高上画出的隐含级高为 250/250/273 mm，但没写 `height`，规则跳过。内容：决定写高度（逐个列 digest 变化）还是保持。不许：为过规则而改梯段。

- RM8.8b · RM8.8 的余项（2026-11-14 加，出自 #737） → done (lab)
- RM8.7b · PDF 导出与图例不显示新材质的地面浅色（2026-11-14 加，出自 #744 评审 N2） → done (lab)
- RM0.7e · `pure()` 机制的守卫测试与误用检查（2026-11-14 加，出自 #747） → done (lab)
- RM0.7f · 核心 chunk 拆分：约 65 KB 只被惰性路径用到的代码还在编译器 chunk 里（2026-11-14 加，出自 #747） → done (lab)
- RM1.3d · RM1.3b 的余项（2026-11-14 加，出自 #742–#746） → done (lab)

### RM1.3e · RM1.3d 的余项：走法与裁定（2026-11-15 加，出自 #771 与它的评审） — `todo` · 未估 · opus · 依赖无（线下；(b)(c) 先要裁定）

1. 原第 2 项"花园小径算可走"拆成三件：(a) 室外走法图：每个相接的可走地面组一张，按步数计量；(b) 围栏当屏障、`garden_gate` 当开口（**先要一次裁定：夹具家族能不能带通行属性**）；(c) **先要一次裁定：** 通向没有连到街道的草坪的门，算不算"进来的路"。
2. Plan JSON 的 `edges` / `input_graph` 可达性忽略 `outdoor`（通向水面的门在那里算入口，在 `describe` 里不算）：并入 RM3.1 后半，或自成一卡。
3. `levelsEnteredFromBelow`（主入口命名）忽略扶梯方向。
4. `W_ROOM_VIA_PRIVATE` 的提示在没有地面层的上层也建议"从室外来一扇门，深度 1"。
证明：每条一条测试。不许：未量就改 digest 表。

### RM1.3f · RM1.3d 的余项：计量与漂移（2026-11-15 加，出自 #771 评审） — `todo` · 未估 · sonnet · 依赖无（线下）

1. `separateBalconies` 的两两检查在每个竖井到达层上跑 3 遍（每条私密规则一遍），不计量：按层记忆化。
2. `quantities.ts:179` 先提供两两工作、后检查探针上限，超大层报 plan-budget 而不是 too-much-work：调换顺序。
3. `describe().access`（`describe.ts:663-667`）、`analyze/circulation.ts:256`、`lint/rules/circulation-facts.ts:322` 仍直接调 `separateBalconies`：改走 `storeyWalkDigraph`，免得漂移。
4. 工料的余量测试只钉 star30 与 clinic：扫所有已发布示例，或断言 clinic 最大。
5. 记一条抖动（不是缺陷）：`docs-site/e2e/homepage-links.spec.ts:240` "a sheet shows and opens the SAME plan" 在 #771（`60601be6`）上超时 2 次，`main` 上绿。再出现时按 §12 (h) 先把竞态钉住。
证明：每条一条测试；1–3 条的输出逐字节不变。

### RM8.8c · RM8.8b 的余项（2026-11-15 加，出自 #772 评审） — `todo` · 未估 · opus · 依赖 #772（已合并，`bbdc374b`）

1. 设计裁定：多边形房间的内角带随半径变化（12 边形 r3000→4 条，r3001→6 条；13/14 边形没有）。(a) 在墙节点上标出曲线弦的接点（会移动曲线平面的 Mesh3D/GLB）；(b) 只在查看器里按转角平滑过渡。
2. 53 条带仍跨过墙或柱（不平行的：短曲线弦上的内角、沿墙面的 80 mm 带、斜楔）：通用的裁剪。
3. 多边形房间的每次探针测试数现在约为 sqrt(n)，不是常数：记入计量表。
4. 第二轮评审 m3：负宽度测试不可能红（它接受 `w === undefined`，旧公式也从不出负数）：改成能红的测试，或只记为说明。
5. 第二轮评审 m4：间隙的 0 夹紧从不触发；同一墙节点内的亚微米间隙产出零面积四边形而不是不出带：不出带，并加一条测试。
6. 第一轮评审 m4：阴影网格最坏的内存是 N × 65,536 个条目（许多大的、互相重叠的三角形，例如叠起来的房间）：给条目总数设上限。
7. 第一轮评审 m6：`packages/archlang-3d/scripts/e2e.ts` 把 `-t <名字>` 的值当成文件过滤；从仓库根传的部分路径被拒：分开处理两种参数。
8. 附带（示例，不是 3D 缺陷）：`examples/hexagon-pavilion.arch` 东西两根辐条离鼓墙约 51.9 mm 就停了（像是写错，3D 的收窄把它遮住了）：核对作者意图；改示例要按 digest 规则列出变化。
证明：每条一条测试。不许：抬帧时间预算。

### RM8.8d · 门偏墙中线 1 mm 时 2D 把门洞画死（核心；2026-11-15 加，出自 #772 评审第 4 项） — `todo` · 未估 · opus · 依赖无（线下）

现象：门偏离墙中线 1 mm 时，`joinWallSet` 的切口留下 1 mm 的皮，2D SVG 把门洞画成关死的（外面直线穿过），也没有诊断。做法二选一：把开口投到中线上，或报警告。证明：2D 字节恒等测试（不用该形式的平面逐字节不变）。不许：在 3D 里补洞而 2D 不管。

### ST.4 · 块式楼梯可结束在带 `winders` 的四分之一转平台上（2026-11-14 加，RM-D38，#532） — `todo` · 未估 · opus · 依赖无（线下；外部邀请 gerontec，先等他回复）

裁定见 `README.md` §6.12 RM-D38。现象：到 1.61.0，块式楼梯结束在带 `winders` 的平台上仍报 `E_STAIR_PIECES` "must end on a flight"。内容：放宽结尾判定，取最后一级 winder 的后缘作到达边；lint 不需要新概念（`winderGoings` 已把 winder 计为踏步）。若 gerontec 不提 PR，按所有者的话排进下一批，开 PR 时在 #532 贴链接。与 backlog ST.2（行走线画成弦、按弧计）不是同一件事。
证明：`haus_winders.arch` 去掉 560 mm 替身梯段后作夹具，编译不再报 `E_STAIR_PIECES`；不用此写法的平面 SVG、`describe()`、`lint()` 逐字节不变（字节恒等律钉值）。
不许：改 winder 的画法或几何；改 `winderGoings` 的计数。

### RM8.10b · RM8.10 的小项（2026-11-15 加，出自 #760） — `todo` · 未估 · sonnet · 依赖无（线下）

1. 滚动路径的测试。2. 实时区域（live region）重复播报。3. 横屏布局。
证明：每条一条测试。

### RM0.7g · RM0.7f 的小项（2026-11-15 加，出自 #753） — `todo` · 未估 · sonnet · 依赖无（线下）

1. 首次使用预算偏松：收紧。2. 索引页首次渲染。
证明：前后路径大小贴进 PR。不许：抬 `compilerPathBudget`。

### RM8.7c · RM8.7b 的余项（2026-11-15 加，出自 #762） — `todo` · 未估 · opus · 依赖无（线下）

1. PDF 里更早的地面与地面词仍不显示浅色。
2. 地面色块对比度低于 2.0:1（RM-D28 的门槛只管了图案线）。
3. PDF 用页面主题而不是计划主题。
证明：每条一条 PDF/对比测试。不许：另设一份颜色表。

### RM1.2i · RM1.2c 的已知误报（2026-11-15 加，出自 #763） — `todo` · 未估 · sonnet · 依赖无（线下）

"标签点名了房间没有的家具"规则对这四个标签会误报："Painting Studio"、"Spa Suite"、"Table Tennis Room"、"Buffet Area"。内容：为每一个找出读法上的缺口（名词中心语 / 修饰语）并修，或写进豁免并说明。证明：每个标签一对夹具（报与不报）。不许：因此放松 RM-D35a 的读法。

### RM1.1c · 首次接触复测的第二个提示臂（2026-11-15 加，出自 RM1.1a） — `todo` · 未估 · opus · 依赖 RM1.1a（已 `done`）

RM1.1a 只跑了第 1 臂（冻结提示，六份 brief）。内容：第二臂（另一份提示），在同一版本上量，记入 `handoff.md` §6。不许：改第 1 臂的提示或事后重算 N。

### CR10b · CR10 的余项（2026-11-15 加，出自 #768 评审） — `todo` · 未估 · sonnet · 依赖无（线下）

1. `test/lint-report.test.ts` 部分同义反复（`cmdLint` 与 `lintReport` 共用 `lintFindings`）：加一条对 CR10 之前输出的字节恒等测试。
2. `lintReport({profile: 拼错})` 静默回落到默认（`src/lint.ts:136` 的 `?? {}`）：库的调用者需要一个 `Diagnostic`。
3. `../checker-reach/README.md:135` 的种子只写了一部分（3 个种子里 2 个，5 条 AECBench 检查）。
4. `joint` 标记只证明必要性与无引文：还要求另一把键使其沉默，或一份联合持有的代码清单。
5. README 的"落下"清单（3 个代码）没有测试钉住。
6. 引文覆盖审计：凡读规则集数字却没调 `cite()` 的规则（默认列只和 `cite()` 覆盖一样干净；`W_STAIR_TOO_STEEP` 由 m5 发现）。
7. `W_BED_UNDERSIZED`、`W_EXIT_APPROACH_BLOCKED`、`W_LEAF_TOO_WIDE` 可加入检查集的 opt-in 列。
证明：每条一条测试。

### RM3.1c · RM3.1 前半的余项（2026-11-15 加，出自 #769 评审） — `todo` · 未估 · opus · 依赖无（线下；与 RM3.1 后半一起做更省）

1. 往返缺口示例（`CANNOT_ROUND_TRIP`）：把每处不一致对到所报的被丢子句。
2. 先核 `dim diameter` 能否往返（要一个圆形房间的夹具）再按结果列入范围表。
3. Plan JSON 范围表对照语法的语句/元素关键字表（`src/grammar/tokens.ts`）核一遍。
4. `on <wall> at <pos>` 的 lint 提示在回程变了（`openings.ts:390-394`）而没有 dropped 行，与 `auto id` 不一致：报出或说明理由。
5. 标签摆放的重叠求和顺序（`label-placement.ts:310,344`）在室外重排时可能差 1 ulp：加夹具或对和排序（理论上的）。
证明：每条一条测试。

### RM0.10 · 小件：工具与 schema 的余项（2026-11-15 加，出自 #750、#758、#753 的报告） — `todo` · 未估 · sonnet · 依赖无（线下）

1. `OpenPlan3D` 的 id 映射。
2. ~~`scripts/backlog-archive.mjs` 改写了 10 个标题（缺陷；与 RM0.6 同源，先读那张卡）。~~ 已由 #1055 随 RM0.6 修好（已规范的 `note`/`decision` 标题原样保留）。
3. lint-rules schema 的 `v1` 声明。
4. `Scene3D` 占位 `$id` 与镜像副本。
证明：每条一条测试或生成器的漂移检查。不许：手改生成物。

### RM0.11 · 发布链的三处小毛病（2026-11-15 加，出自 1.62.0 的发布与 #766、#776、#777、#778） — `todo` · 未估 · sonnet · 依赖无（线下）

1. 夜间的 `npm audit signatures` 在版本号提交上报 ETARGET（根包的版本还没上 npm），每次发布都开一张 ci-red（#766、#776）：根版本不在 npm 时把这一项记为"预期"，不算红。
2. `check:quick` 在只改 `package-lock.json` 时 biome 报错（它只收到一个被忽略的文件）：没有可检查的文件时跳过 biome。
3. 兼容检查只对比已发布版本，所以新导出的问题发布后才暴露（#778）：`release-check.md` 第 6 项加一步，在版本号 PR 上用本提交打的 tarball 当"旧"侧再跑一次 `compat-check`（应零发现）。
证明：每条一条测试或一次演示运行。不许：放宽兼容检查的规则或加豁免。

### 发布 1.61.0 · 约 01-05 · 1 日

线上合并项切一个 minor（发布由所有者决定，发布链含 tag 由代理跑），步骤同 RM0.3。RM1.1b 量的就是它。

### RM1.1b · 首次接触复测（第二次） — `todo` · 1 日 · opus · 依赖 1.61.0 发布、RM1.2a

同 RM1.1a，2027-01-06 → 01-08 在 1.61.0 上量，数字附在 01-09 的 agent-reach 读数里。RM1.2b 没合就只量 RM1.2a 与 RM1.3a 的效果，并在测量表里照实写明。结果记在本计划 `handoff.md` 的测量表。报出数不高于 RM1.1a 时，`README.md` §5 的对应行生效：轨 1 停止加规则，转向对账与"跳过了什么"。

不许：改提示或 brief；把数字叫 benchmark；在 1.61.0 以外的版本上量而不写明。

### RM7.3 · 读数的三项自检 — `todo` · 未估（读数日做，不计入线） · sonnet · 依赖 RM1.1a、RM1.1b；读数日 2027-01-09、2027-01-31

agent-reach 读数（01-09，窗口到 01-05）与 RM-D2 读数（01-31，窗口到 01-28）时一并写出三项：
1. Worker 调用的来源分布（若 Analytics Engine 有；没有就写"没有来源拆分"）；
2. 外部仓库清单及链接（RM-D2 信号 1）；
3. RM1.1a 与 RM1.1b 的"N 个缺陷、lint 报出 k 个"。

来源集中在一两个时，写明"读数不能当独立使用的证据"。门槛与后果不改：后果按 RM-D2 与 agent-reach 决策 6 执行。读数本体写在 growth 仓库（另一仓库）；本仓库只在 `handoff.md` 记一行结论与链接。

证明：两次读数的记录里三项都在，每项有链接或"没有数据"的说明。

不许：改门槛；把下载量或安装量写成 traction；把一周的数当窗口的数；跳过一项而不写明。

### ── 线（9.5 日）──

### CRF1 · 洞口旁的墙段合并 — 见 `../checker-reach/README.md`，`todo` · 与 RM7.2 合计 6 日 · opus · 依赖无 · **线下首位**

赶得上就进 1.61.0，否则进下一个 minor。CR8 的网格单元切分让洞口旁的墙面碎成多段：合并共线相邻段，且保持转动不变。v1 把它放在 RM1.5a；v2 把它提到 RM7.2 之前，因为它会改变墙段的切分，RM7.2 公开的段要在它之后才稳定。若它改变 `describe().derived_walls`，按分析修正论证并逐图列出，不按绘图修正。

证明：等变预言机（D4 帧）在语料上零差；SVG 与 `describe()` 的字节变化逐图列出并解释。

不许：碰 M.9/PS0.26；为了合并而构建墙体接合。

### RM7.2 · `describe --facts walls`（#681） — `todo` · 与 CRF1 合计 6 日 · opus · 依赖 CRF1、冻结期的 `walls-facts.md` · 线下首位（紧接 CRF1）

**设计稿已写（2026-11-11）：** `design/walls-facts.md`，设计稿一项的依赖满足（仍依赖 CRF1）。设计稿的发现：`describe --facts quantities` 的墙是按 `category` 汇总的行，不按 `id`（`src/analyze/quantities.ts:236-256`），所以与 quantities 只能按类别对齐，下面"按墙 `id` 与 … `describe --facts quantities` 对齐"一句按设计稿 §2.4 读。它建议新事实列每面绘出的墙（与 `heights.walls[]` 同集合、同顺序），推导段另带 `spec` 指回 `derived_walls[].name`；只列推导段（本卡原文）是备选。

赶得上就进 1.61.0，否则进下一个 minor。

opt-in 的 `describe --facts walls`（加进 `DESCRIBE_FACTS`，`src/describe.ts`）：输出 `walls from rooms` 推导的墙段。字段按 `_derivedWalls` 的真实形状：`points[]`、`closed`、`between` 或 `ring`（外圈只带 `ring`）、厚度、类别、状态；按墙 `id`（即 piece 名）与 `heights.walls[]`、`describe --facts quantities` 对齐。已有的 `describe().derived_walls[].name` 是 spec 名，一个 spec 对应多个 piece，两者不是一一对应；新事实与默认 `derived_walls` 的关系按设计稿写明。算第 7 轨（RM-D12，所有者 2026-11-11 批准；这样归类会让它不受 RM-D2 收缩的约束）。

- 消费者照实写：没有具名读者；`archlang-section` 自己从 `walls_from_rooms` 的厚度重建墙，是**可能的读者**；排进来是因为 growth 2026-11-10 决策把它定为 IFC 下游包的前置。
- 新事实进 `engineProbeParts`（`test/helpers/byte-identity-payload.ts`），让跨引擎探针读到它。
- 工程量已有 `describe --facts quantities` 与 `arch takeoff`（`src/analyze/quantities.ts`），本卡不重复它们。
- PR 动 `src/` 超过约 500 行就停下，回到主会话重划范围（growth 决策的规模门）。

证明：默认 `describe()` 在语料上一字不变（字节恒等律）；没有 `walls from rooms` 的图，`--facts walls` 输出为空并说明；一条测试断言段的并集与绘出的墙芯一致（从同一份 `_derivedWalls` 派生，不重算）；`arch describe examples/two-bed.arch --facts walls --json` 贴进 PR。

不许：构建墙体接合来回答这个问题（铁律）；改默认 `describe()`；给 Plan JSON 加只出不进的字段；加语法；写任何 IFC 承诺或"IFC-ready"。

### RM4.1 · 图纸第一批 — `todo` · 2 日 · opus · 依赖无

U.11（10 m 图上 0–1 m 比例尺 → 按图幅与比例选 2/5/10 m 档）、U.10（图例按墙类别出多个样例）、N.6（宽字形溢出 NOTES）、M.23（大图 PNG 超 2000 px → 按图幅定像素上限）。D.7（一种细线）等所有者裁定，裁定后并入。

证明：digest 差异逐图列出 + drafting 层 lint 的变化（ADR 0032 允许动）；`describe()` 零差；`W_DRAWING_OVERFLOW` 不新增。PNG 只作说明附件。

不许：改标题栏布局（D.7 之前）；改默认主题颜色。

### RM1.2b · 行家规则，有效性与声明 — `doing`（第 2 条已由 #1007 `4b161800` 做完：taste 的 R20 `A_WET_UNSTACKED`，按 RM-D82 计分，加 `keep stacked` 配方；余项 SR.28；第 1、3、4 条未开工） · 9+ 日 · opus · 依赖 RM1.2a、PS7.9、RM1.6a；`[语法]` 第 3、4 条

1. **第二疏散口**：与 PS2.16（拟议的 `W_INNER_ROOM`，UK）合并为一张。先建 M.16 的 egress 事实为 opt-in `describe --facts egress`（支配点、门不相交的第二路径），这是该事实的第一个消费者；再加 advisory W，只对 `uses` 为居住且满足读过的条文条件的图。条文只取读过的文本：Approved Document B 第 1 卷（`S-full` 第三方全文副本可接受，写明版本）；读不到则本条 `parked`。`examples/studio.arch` 的内房读法（#683）在这里判。
2. **湿区叠放**：不做默认 W（不叠放是合法的，且语言没有"管道墙"事实）。做两件事：`score --taste` 加一条 `A_*` 建议行（跨 `level` 的湿房间投影不重叠）；`docs/edit-one-room.md` 或 keep 文档加 `keep stacked` 的配方。跨层墙检查只经 `keep stacked`（iron-laws）。
3. `[语法]` **作者自报的场地约束，走 `keep`**（RM-D5）：`keep site setback front 5m side 1.5m rear 3m`、`keep site coverage max 40%`、`keep site far max 1.2`。三个新的 `keep` 度量进 PS4.9 的卡位，默认 advisory 等级（作者可写 `hard`），触发现有 `W_KEEP_VIOLATED`，**不新开 W 码族，不给 `site` 加字段**。`front/side/rear` 按 `site.street` 给地块边分类；coverage 读外壳投影，FAR 读各 `level` 的毛面积（ADR 0027 口径，算不准的层省略并说明）。事实模块 `src/analyze/site-metrics.ts` 与 DS3 共用，谁先做谁建。同 PR 在 `../drawing-set/README.md` 加一条 D 记录：作者声明的 `keep` 不是 D5 说的"指标判限值"，D4 不动。
4. **（v2 加）**`[语法]` **作者写出的窗可开启值**：只收作者值，不按窗种猜（§4 不做）。写成毫米的净宽与净高，或比值，拼写由 `gen:*` 闭集定；不用 `m2`、`area`（T6）。`fixed` 窗写了可开启值要有诊断（E 或 W，在 PR 里论证）。它是逃生窗"通过"与豁免判断的前提（`DEFERRED_PROFILE_NUMBERS` 里的逃生窗数字），拟议的 `W_INNER_ROOM`（PS2.16，今天 `src/` 里没有这个码）报失败不需要它。

证明：§0 规则卡门禁；第 3、4 条另加各自的字节恒等律与 `gen:*`；`keep` 的 hard/soft/advisory 三档各一个夹具；第 4 条：不写可开启值的图字节不变。

不许：写"符合/不符合某规范"；第 3 条做任何求解或建议数值；给 `site` 加辖区名或新字段；第 4 条按窗种给默认值、用 `m2`/`area`、在没有作者值时给出"通过"。

### MF1 · 精确净宽 — 见 `../math-foundations/cards.md`，`todo` · 3 日 · opus · 依赖 RM1.1a

排在 RM1.1a 复测之后：它会移动 lint 的宽度结论，冻结期量的检查器不能刚变过。

### RM1.7 · 转身空间检查 — `todo` · 未估（报告 A 估 M） · opus · 依赖 MF1、RM1.6a

无障碍 profile 加转身空间检查：房间减家具的最大内切圆，对照读过的条文值。开工前要先定三件事：
1. 条文读原文：ADA 304.3.1、AD M M4(3)（drawing-set D13；调研包标的 `[V]` 不算数，要自己读）。核实等级进 RM1.6a 的平行表。
2. `accessibility-advisory` 在 `finish` 的 never-worse 比较集里（`STRICTER_PROFILES` 只排除辖区 profile，`src/finish.ts`）：新规则要么让 `finish` 学会它，要么另开一个不进比较集的 profile。在 PR 里写明选哪一种，并列出 `finish` 输出在语料上的变化。
3. 步数记账：几何计算先向步数计量记账（`MAX_EVAL_STEPS`），并给出 `finish` 每个候选多出的成本（engineering-health 06-F3：`finish` 1,500 个房间已用 4.6 s）。

证明：§0 规则卡门禁；`finish` 的 never-worse 律在语料上仍成立；预算是计数不是时间。

不许：用时间做限制；把调研包目录里的数直接写进规则；让 `finish` 的输出在没有论证的情况下移动；写"合规"。

### 其余（线下，有余量才做）

CR12、RM2.2、CR9（只在 OpenPlan3D 导入有使用迹象或有人来问时做）、RM1.3b、RM1.5a 余下部分、RM2.3、RM4.2、RM3.4、RM5.2、RM1.5b、MF5、MF8、MF10、RM4.4。CRF3 并入 RM1.5a；CRF12 并入 RM2.3。MF6、MF11、CRF7 是执行者空档时做的小件。

### CR9 · CR12 — 见 `../checker-reach/README.md` §3"第 C 批"

CR9：OAS 导入 + OpenPlan3D 导出，建在 RM3.1 上；只在 OpenPlan3D 导入有使用迹象或有人来问时做。CR12：conformance 语料 100 例，第一条法则就是 RM3.1 的往返律。

### RM2.2 · `arch diff` — `todo` · 2 日 · opus · 依赖无（`diffPlans` 读解析后的 plan，不读 Plan JSON）

先修 `diffPlans`：PS0.22（同框内重塑漏报）、PS0.23（位置自动 id 配错）。再加动词 `arch diff <a.arch> <b.arch> [--json]`，输出按房间/门窗/家具分组的"动了什么、没动什么"，与 `impact` 共用词表。进 `manifest.ts`，生成 `docs/cli-reference.md`。

证明：`diff(a,a)` 为空；`diff(a,b)` 与 `impact` 对同一编辑的结论一致（测试）；MCP 不加工具（ADR 0012，先看 CLI 使用）。

不许：输出里带坐标以外的"建议"；给 diff 配色主题。

- RM1.3b · 可达性盲点第二批 → done (lab)

### RM1.5a · 确定性泄漏第一批（余下部分） — `todo` · 未估（v1 含 CRF1 时估 3 日） · opus · 依赖无

CRF2（房间投票和依赖输入次序）、J16 的 `relocateLabels` 次序、CRF3（`W_FURNITURE_ON_VOID` 消息里的坐标随帧变化，改成相对房间的说法）。CRF1 已移到 RM7.2 之前（见上）。

证明：等变预言机（D4 帧）在语料上零差；打乱输入次序的 digest 零差；SVG 字节变化逐图列出。

不许：碰 M.9/PS0.26。

### RM2.3 · 编辑模型补全 — `todo` · 4 日 · opus · 依赖 RM2.2

PS4.6/4.7（impact 键控：重复语句里 `preview --review` 不画环；impact 解析绑定）、PS4.8（组件内 `keep`）、PS4.10（`keep` 过 Plan JSON 与 MCP：Plan JSON 带 `keeps`，MCP `validate` 报 `W_KEEP_VIOLATED`）、CRF12（`impact --lock --json` 的顶层 `ok` 与 `lock.ok` 不一致）。PS4.9、PS4.12 留在 plan-soundness。

不许：`solve`（PS6.1 parked）；`keep locked`（B2）。

### RM4.2 · 图纸第二批 — `todo` · 8 日 · opus · 依赖 RM4.1、PS7.9；`[语法]` 仅 `schedule fixtures`

U.9（净尺寸：房间面对面尺寸作为 `dims auto rooms` 的可选项）、D.9（楼梯上的厚度标注）、PS2.39（自动尺寸落在房间地面）、J18（PDF 地面平涂；DXF 径向尺寸与带套开洞块）、D.5（DXF hatch 原点/缩放）、U.18（playground PDF 改矢量：**只允许浏览器内懒加载的矢量后端**；不许 Worker 端生成，那会上传每张图，违反 CR-D4/CR-D6 与托管法则）、`[语法]` `schedule fixtures`（按房间列家具/洁具家族、数量与作者给的 `label`，派生自 `describe().furniture`，与 `schedule rooms` 同格式；不含灯具；这是 U.4 的 label 在图纸上的唯一出口，RM-D6）。可拆成两张 PR。

不许：给 `schedule` 加手填列；改标题栏（D.7 之前）；playground Worker 加路径。

### RM3.4 · 英尺英寸显示 — `todo` · 2 日 · opus · 依赖 PS7.9 · `[语法]`

P2-10：`dimension_units standard` 或等价词（由 `gen:*` 的闭集决定），图上尺寸以 `12'-6"` 格式显示；`describe()` 仍是毫米（ADR 0027 口径不动）。`units ft` 输入已存在。

证明：不用它的图字节不变；`fmt` 往返；`W_DIM_TEXT_MISMATCH` 仍读得懂。

不许：改内部单位；在 `describe()` 输出英制。

### RM5.2 · CLI 日常 — `todo` · 3 日 · sonnet · 依赖 RM5.1

U.15 `arch doctor`（Node 版本、可选依赖、字体、`arch` 别名 bin 的 U.19）、U.16 第二套起手模板（`arch new --template remodel`，与 CRF11 的起手同源）、U.8 `compile --json=brief` 可选瘦身（**不改默认**：`compile --json` 的形状是代理契约，ADR 0015）。VA.4 `--theme` 已于 2026-11-11 移到 RM8.4（第 8 轨，阶段 D），本卡不再做。同 PR 在 `docs/cli-reference.md` 顶部加一段"动词边界"（`validate` 对 `lint`、`describe` 对 `takeoff`），把 28 个动词按阶段分组列出；不设动词数上限。MCP 工具分组在阶段 F。

不许：改任何现有动词的默认输出。

### RM1.5b · 确定性泄漏第二批 — `todo` · 2 日 · opus · 依赖所有者 M.9

M.9/PS0.26（吸附舍入半值远离零，镜像等变）、E.11（浮点平移改事实）、PS0.27（`1e30` 词法为一个 token；它是词法形式，带字节恒等律）。

证明：等变预言机加平移轨道。会动输出，PR 列全。

### RM4.4 · Daniel 明说未做的项 — `todo` · 未估 · opus · 依赖无（触发见下）

bobsch-io 在 #362–#370、#405 里明说未做的项（排序依据就是这些 issue 里已有的文字），可拆成多张 PR：
- #364：`place` 组件内的房间不被 `finish` 装家具；
- #367：小房间里的长房名没有引线，也不在词内断行；
- #369：窗扇开启弧；`takeoff` 按窗类型计；
- #362：`shape quarter-turn` 一类的楼梯简写；
- #405 余下的：`fence`、`outdoor` 高度；洞口宽高标注；玻璃栏杆；天窗；`finish` 同时给浴缸和淋浴。

本卡默认在波次 2′ 线下。提到当期线上的触发只有两个：他的下一批 issue 到来，或所有者说一句（`README.md` §5）。不向他提问，也不按他的答复排期：growth `AGENTS.md` 第 44 行的 Daniel 规则（"The founder holds the follow-up question; do not post it or plan on its answer."）。加语法的项标 `[语法]` 并依赖 PS7.9；绘图项不得移动语料的 `describe()`/`lint()`。

证明：每项一个最小夹具；绘图项列 SVG 字节变化，`describe()`/`lint()` 零差；语法项带字节恒等律。

不许：为本卡向 bobsch-io 提问或等他的答复（Daniel 规则）；`paper auto`（ADR 0024 已拒）；为一项而改变不用它的图的输出；`finish` 被说成 "designs"、"arranges"。

### 第 8 轨（视觉）· 阶段 E

视觉车道 RM8.7 → RM8.8 → RM8.9，合计 13 日（`README.md` §3 阶段 E）。要进 1.61.0 的，在约 01-05 的切点前合并。

**词表卡的 spec 成本**（RM8.7、RM8.9 共用，2026-11-11 对 `scripts/gen-llm-spec.ts` 核过）：`spec.llm.md` 今天 29,856 UTF-16 单位，`test/llm-spec-drift.test.ts` 要求 `< 30_000`，余量 143。`room` 行用 `FLOOR_MATERIALS.join("|")` 列出地面词，`outdoor` 行用 `OUTDOOR_KINDS.join("|")` 列出地面种类，所以每个新词花"词长 + 1"。家族词只有一条路进 spec：`furniture` 行的 `SIZE_OPTIONAL_FIXTURES`（`CANONICAL_FIXTURES` 中有目录占地的，用 `/` 连接），所以**只有带目录占地的 canonical 家族**花"词长 + 1"，别名和没有占地的家族花 0。RM8.7 按暂定名的六个词花 39 单位；RM8.9 的十二个家族若都带占地，按平均词长约 9–10 计约 120 单位。两张合起来超过余量，所以 PS7.9 的目标要先算进它们。

- RM8.7 · 地面材质 → done (lab)
- RM8.8 · 接触阴影与环境遮蔽 → done (lab)
- RM8.9 · 新家族首批 → done (lab)

### 第 8 轨（视觉）· 阶段 G：家具细部与明暗（RM-D94，2026-11-27 加；同日按 #1034 的评审改写）

所有者 2026-11-27 批准（`README.md` §6.40）：把最常见的家具做得更精致，并调整材质与光照。建模思路借鉴 sand3d（Apache-2.0，Python 加 Blender `bpy`）的 `programs/tufted_chair.py`：截面是超椭圆；坐垫由逐层内收的截面放样而成（`upholstered_seat` 的 `crown` 表）；腿有收分。只借思路，不逐行移植代码，不加依赖，也不引入任何第三方模型。ADR 0030 决定 9 的 CC0 资源包现在不做。

**状态：四张卡都是 `parked`。** 所有者 2026-11-27 的原话是"目前先确保开发计划已经准确完整地落档，暂时不实施"。按本文件的选卡规则，`parked` 的卡不会被挑中。所有者说开工时，协调者把四张卡改回 `todo`，并在 `README.md` §6.40 记下那句原话。

顺序：RM8.11 → RM8.12 → RM8.13 → RM8.14，每张卡依赖前一张，一张卡一个 PR。RM8.12 与 RM8.13 都会移动钉子和关键帧，依次做可以避免两个 PR 互相冲掉对方的重钉。RM8.14 在定下来的几何上调明暗。代码只改 `packages/archlang-3d`。包外会动的只有重生成的资产（`docs-site/public/3d/`），以及 RM8.14 若改 `PREVIEW_LIMITS` 时的各个公开面。不碰 `src/` 或 2D 符号，所以 SVG、`describe()`、`lint()` 逐字节不变。

**RM8.12…RM8.14 共用的门槛**（RM8.11 不移动任何钉子，见它自己的律）
- 不改的：占地贴合、四分之一转、整数 µm、每个壳体封闭（V-GEO-02）。对称跟核心走（`T0_HANDED`、`handedAt`），只由一个细节决定方向的家族不画那个细节。高度不改。
- 账本：沿用现在的做法（`t0-kit.ts` 里 `T0Family` 的注释）。高度、挂高、材质与 `defaults` 进账本，部件尺寸不进账本。新增的 `defaults` 项照这个规则进账本。
- 钉子：laneway 的 Mesh3D 与 GLB SHA-256 按 V-D5 带理由移动，提交与测试注释都写理由。关键帧按 CI 打印的哈希重钉（`.claude/rules/archlang-3d.md` § Traps）。资产用 `npm run gen:3d-assets -- --videos` 重生成。
- 代价，用确定的计数，不计时：现有的 `3D package frame-budget pass` 只比较同一棵树上阴影开与关，没有拿分支和 `main` 比（`packages/archlang-3d/e2e/frame-budget.e2e.ts` 头注释），所以不拿它作门。RM8.11 加一条纯单测（它自己的证明里也列了这一条）：数出 laneway 与 two-storey 的 Mesh3D 三角形总数，上限是一个固定的数，三张卡合起来用，不随每张卡的 `main` 重算。2026-11-27 的读数是 laneway 7,992、two-storey 7,668，上限取 1.25 倍，即 9,990 与 9,585。这两张图里没有 `desk`、`bench`、`armchair`、`loveseat`、`sofa_l`、`bathtub`、`dishwasher`，所以同一条单测另外为每个改到的家族数一件的三角形数，上限取 RM8.11 合并时读数的 2 倍。尺寸固定写在测试里。有目录占地的用目录占地；`sofa`、`armchair`、`chair`、`table`、`desk`、`bench` 没有目录占地（`src/fixtures-catalog.ts` 里这几行没有 `footprint`），用下面的尺寸。部分读数已在 2026-11-27 量过（#1035 的评审）：

| 家族 | 尺寸（宽 × 深，mm） | 2026-11-27 的三角形数 |
|---|---|---|
| `bed` | 1500 × 2000（目录） | 640 |
| `wardrobe` | 1800 × 600（目录） | 344 |
| `loveseat` | 1500 × 850（目录） | 472 |
| `sofa_l` | 2600 × 1600（目录） | 820 |
| `wc` | 400 × 700（目录） | 588 |
| `bathtub` | 1700 × 700（目录） | 536 |
| `dishwasher` | 600 × 600（目录） | 184 |
| `sofa` | 2000 × 900 | RM8.11 量 |
| `armchair` | 900 × 850 | RM8.11 量 |
| `chair` | 450 × 500 | RM8.11 量 |
| `table` | 1600 × 900 | RM8.11 量 |
| `desk` | 1400 × 700 | RM8.11 量 |
| `bench` | 1200 × 400 | RM8.11 量 |
| 其余改到的家族 | 目录占地 | RM8.11 量 |

卡改回 `todo` 时，若 laneway 或 two-storey 的源文件在此之后改过，先在 RM8.11 里重读这两个总数，再按 1.25 倍定上限，并在 PR 里写明。每张卡在 PR 里列出前后对比和 laneway 的 GLB 文件大小。
- PR 里放同一视角的前后关键帧对照图。

### RM8.11 · T0 部件工具：放样的补全与超椭圆截面（借鉴 sand3d 的思路） — `parked` · 2 日（主会话估） · opus · 依赖无

今天已有的（不要再造第二套）：`Part.loft` 可以放样 `round`、`radius` 或方框截面（`t0.ts` 的 `loftShell`，`t0-kit.ts` 里 `Part.loft` 的注释）。凉亭顶已用方框截面做出收分放样（`t0-outdoor.ts` 的 `GAZEBO_ROOF`）。放样表每行是"高度比例、尺寸比例"。

缺的：
1. 每一圈只有一个比例，宽与深同比缩放（`loftShell` 的 `rings`）。所以做不出 sand3d `crown` 那样两侧与前后内收不同、并向后偏移的隆起。
2. `radius` 不随圈缩放，原样传给每一圈。
3. 最底一圈总是重复表里第一行的比例。所以两行的表不是一个从底到顶的直线收分（凉亭顶靠"底部一行比例为 1"绕开）。
4. `profile` 不能放样（`partShell` 遇到 `profile` 加 `loft` 会抛错）。没有超椭圆截面。
5. 放样只做竖直、不带孔的部件：横向部件（`axis`）或带孔的部件加 `loft` 都会抛错（`partShell` 开头两行）。坐垫、靠垫、被子今天大多是横向部件（例外：`sofa_l` 转角处的座垫是竖直的）。

做：
- 放样表的每行可分别给宽、深的比例，并给宽、深两个方向的偏移。旧的两元组写法照旧有效，结果逐字节不变。偏移后的每一圈必须仍在部件的盒子之内：占地裁剪只认盒子（`t0LocalParts`），越出就抛错。
- `radius` 按每圈的比例缩放。今天没有带 `radius` 的放样部件（凉亭顶是方框，豆袋、树冠、灌木、竹冠都是 `round`），所以直接改，不分新旧写法，也不动字节。
- 可选择直线收分：只给顶面比例，底面取部件自己的截面。用于腿。
- 超椭圆截面：`SectionShape` 加方度。点从预计算的定点表来，像 `C16`/`S16` 那样，运行时不算 `Math.pow` 或三角函数。点落在 1/64 的格上，镜像后与对侧的点重合。三处都能用：竖直部件、横向部件的截面（坐垫的鼓起就是这样做的，不靠放样），以及孔（`holes` 的截面）。超椭圆可以放样。
- `profile` 的放样不做，第 4 条缺口照旧。
- 阶段 G 的三角形计数单测（见上面的共用门槛）在本卡里加，并钉住 2026-11-27 的读数。
- `t0-kit.ts` 头注释写明思路的出处（sand3d `programs/tufted_chair.py`，Apache-2.0）。

证明：每种新写法一条单测：封闭壳、关于宽度镜像对称、整数 µm、恰好贴合占地；偏移越出盒子时抛错。旧写法的所有放样部件（凉亭顶、豆袋、树冠、灌木的土丘与叶团、竹冠）逐字节不变。本卡不改任何家族，所以每张示例的 Mesh3D 逐字节不变，laneway 的钉子不动（本卡的律）。三角形计数单测绿。`t0.test.ts` 绿。

不许：逐行移植 sand3d 的代码（许可门 `licences.json` 只管装进来的 npm 包，记不了移植的代码；RM-D94 是"只借思路"）；在运行时算三角函数或幂；做任意角度旋转；改任何家族的外形；加运行时依赖；在 `Part.loft` 之外另造一套放样；让放样接受横向或带孔的部件（要那样的形状，就把部件拆开）。

### RM8.12 · 起居、卧室家具细部 — `parked` · 3 日（主会话估） · opus · 依赖 RM8.11

挑选依据：`examples/**/*.arch` 里 `furniture` 行的家族词，`id=` 写在前面的也算，别名分开计（2026-11-27 统计）：`table` 33、`bed` 31、`chair` 29、`desk` 28、`sofa` 21、`bench` 21、`wardrobe` 18。

今天已有、本卡不做的：床头板顶边已是圆的（`t0.ts` 的 `bed`）。衣柜的门缝 4 mm 与退进的踢脚已有（`wardrobe`）。床头柜的抽屉缝和居中拉手已有，所以床头柜不在本卡里。

两种做法（RM8.11）：横向部件（坐垫、靠垫、被子、枕头，`axis`）的鼓起用超椭圆截面做；竖直、不带孔的部件（床垫、椅垫、桌面、腿）用放样做隆起、倒角或收分。

做（具体尺寸在 PR 里定）：
- 共用的 `upholstered`（`t0-kit.ts`），用的家族有 `sofa`、`armchair`、`loveseat`，三个一起改：座垫改为超椭圆截面，读作鼓起；扶手改为超椭圆截面；木腿收分。靠垫已有后仰的轮廓（`profile: BACK_CUSHION`），保留不改。
- `sofa_l`（`t0-living.ts`）的部件是自己建的，不走 `upholstered`。它两段上的横向座垫（沿 `x` 和沿 `z` 的）同样改为超椭圆截面；转角处的座垫是竖直、不带孔的部件，用放样做隆起，高度与鼓起程度和两侧一致。这样它和 `sofa` 摆在一起时不会一个平、一个鼓。靠垫同样保留 `BACK_CUSHION`。
- `bed`：床垫用放样做顶面隆起；被子与枕头改为超椭圆截面。
- `chair`：腿收分；椅垫用放样做隆起。
- `table`（`dining_table` 是它的别名）：腿收分；桌面边缘一道倒角，用两圈放样。
- `desk`：它立在两块侧板和一块挡板上，没有腿可收分。只做桌面边缘的倒角。
- `bench`：座板边缘一道倒角。侧板不改：它的上沿压在座板下面，看不见。
- `wardrobe`：顶部加一道线脚。

证明：上面的共用门槛；每个改到的家族一个最小夹具。夹具断言的是性质，不只是"部件存在"：例如隆起的部件顶圈比底圈窄、收分的腿顶面比底面小、超椭圆截面的点数与方度对得上；全部贴合占地。PR 列出改到的家族名单，名单与本卡一致（含 `armchair`、`loveseat`、`sofa_l`）。

不许：改高度；新增手性；用位图纹理或 UV；改名单之外的家族。

### RM8.13 · 厨卫家具细部 — `parked` · 3 日（主会话估） · opus · 依赖 RM8.12

挑选依据同上：`wc` 49、`basin` 47、`counter` 40、`stove` 22、`kitchen_sink` 22、`fridge` 21、`shower` 18、`bathtub` 7。

今天已有、本卡不做的：`cabinet()`（`t0-kit.ts`）的柜门缝 4 mm 和退进的踢脚已有。洗手盆的柜门缝与台面圆角已有。冰箱两扇门的 12 mm 缝和圆把手已有，所以冰箱不在本卡里。

放样只做竖直、不带孔的部件（RM8.11），所以带孔的台面、浴缸壁、托盘不做放样：要倒角的，把不带孔的一条拆成单独的部件再放样；只要平面圆角的，用截面形状（`radius` 或超椭圆）。孔碰到外轮廓时，`prism` 建不出来，`partShell` 会退回不带孔的实体，只记一个丢掉的孔数（`extrude.ts` 的 `holesApart`、`t0.ts` 的 `partShell`），所以每个夹具都断言丢掉的孔数为 0。

做：
- `wc`：碗身（竖直的 `round` 部件，0…300 mm）由圆柱改为收分放样，上大下小；水箱改为超椭圆截面。
- `basin`：看得见的是台面上的盆口（台面部件的 `hole`）。盆口与下面的盆体一起改为同一个超椭圆，盆体在每个方向都比盆口大 10 mm（今天的差值），从上面看不露出柜体。
- `bathtub`：外壁的两个部件改为超椭圆截面（平面形状，可以带孔）。上沿不做圆角：它带着浴缸的孔，放样做不了。
- 共用的 `cabinet()`，用的家族有 `counter`、`kitchen_sink`、`stove` 和 `dishwasher`，四个一起改：台面前沿拆出一条不带孔的部件，用两圈放样做倒角。这一条的深度小于 60 mm：`kitchen_sink` 只保证水槽孔前面留 60 mm 的石材（`t0.ts` 的 `kitchen_sink`）。台面其余部分（水槽孔在这里）不变。拆开后台面成了两个同材质的网格，查看器按网格描边（`mount.ts` 的 `EdgesGeometry(geo, 30)`），可能在接缝处出一条线；PR 的前后对照图要看这一处。
- `shower`：托盘外沿在平面上改为圆角（`radius`），托盘的孔不变。

证明：上面的共用门槛；每个改到的家族一个最小夹具，断言的是性质（如碗身顶圈大于底圈、盆体在每个方向都比盆口大）。PR 列出改到的家族名单（含 `dishwasher`）。

不许：加偏离中线的龙头、插头等决定方向的细节（今天居中的龙头保持不动）；改高度；改名单之外的家族。

### RM8.14 · 材质与明暗（RM-D94） — `parked` · 3 日（主会话估） · opus · 依赖 RM8.13

今天：查看器的实体网格用 `MeshLambertMaterial` 加 `flatShading: true`（`src/replay/mount.ts`），所以圆的、放样的部件看起来是一圈棱面。接触阴影层是 `MeshBasicMaterial`。灯是三盏：半球光、主光、补光（`mount.ts` 里模块私有的 `LIGHT`），加 `NeutralToneMapping`。颜色的来源：
- `materials.ts` 的表：`PALETTE`（材质槽）、`KIND_PALETTE`（墙、楼板等种类）、`FINISH_PALETTE`（楼面饰面）、`SITE_PALETTE`、`FENCE_PALETTE`、`GROUND_SPLITS`（六种室外地面），GLB 与查看器都读。另有只给查看器的 `GROUND_PLANE`（背景地面）与 `WALL_CAP_SRGB`（墙顶；GLB 不画墙顶）。
- 草坪、铺地、水面、露台、阳台等其余室外地面：取核心 `DEFAULT_THEME` 的色调，按 `GROUND_WASH`（`materials.ts`，一个记账的默认值）淡化（`mesh/outdoor.ts` 的 `groundColour`、`outdoorColour`）。`test/finish.test.ts` 钉住 `FINISH_PALETTE.paving` 必须等于 `groundColour("paving")`，所以这两个只能一起动。不碰 `src/`，所以这些地面能动的只有 `GROUND_WASH` 和新增的 `GROUND_SPLITS` 行。
- 查看器自己的字面量：`mount.ts` 里两种主题的背景色与描边色，以及暗主题的墙顶色。
- 暗主题：种类的暗色是 `mount.ts` 里写死的字面量；材质槽、饰面与室外的暗色由 `materials.ts` 的 `slotColour`、`finishColour`、`siteColour` 从亮色按比例混出来；`GROUND_PLANE.dark` 是字面量。GLB 今天只写 `POSITION`（`glb/write.ts`）。

做：
- 平滑法线：圆的、放样的、超椭圆的部件按折痕角算法线，平面仍然平直。
  - 法线按角点（每个三角形的每个顶点）给出，只存在 GLB 写出器与查看器里。`Shell` 的顶点仍然共用，V-GEO-02 按顶点编号判断封闭（`src/check/verify.ts` 的 `openEdges`），所以不受影响。
  - 由本包计算，不用 three.js 的 `computeVertexNormals`。只用加减乘除与 `Math.sqrt`（IEEE 754 要求这几种运算正确舍入，所以各引擎结果相同），再落到定点格上。GLB 写 `NORMAL` 属性，查看器读同一份。GLB 的钉子在所有环境下是同一个哈希（`test/pins.ts`），所以这一条是硬要求。
  - 格要足够细，使单位长度的误差在 glTF-Validator 的容差之内：V-GLTF-01 要求零错误、零警告（`verify.ts`）。PR 写明容差的出处和实测的最大误差。
- 调色：复核上面所有的表，让木与布、陶瓷与金属、墙与楼面、楼面与室外地面、室外地面与围栏在默认光下分得开。不另设第二份表。改亮色会经混色带动暗主题；PR 同时列出暗主题前后的颜色，`mount.ts` 里种类的暗色字面量按需一起调。
- 光照：先把 `LIGHT` 移到一个不依赖 three.js 与 DOM 的纯模块里，`mount.ts` 改为从那里读；然后调三盏灯的方向与强度。不加灯，不用实时阴影图。
- 对比的律，两条，都是纯函数，按 Lambert 模型与 `LIGHT` 计算。比值取色调映射之前的线性值；PR 另报经 `NeutralToneMapping` 之后的值，因为浅色在屏幕上会被压缩：
  1. 同一材质的朝上面、主光侧面、背光侧面之间的亮度比，钉下限。这一条会随灯的改动而变，体块的明暗层次靠它守。
  2. 常相邻的几对材质（上面调色一条列出的各对）在同一朝向的面上的亮度比，钉下限。同一朝向的两个面受到的光照相同，所以这一条测的其实是颜色表。
- 公开的那句话：如果 `PREVIEW_LIMITS` 的措辞需要改，同一个 PR 改所有的面（RM8.8 卡列的测试与文件）。新句子仍用"3D preview"。

证明：上面的共用门槛；两条对比律绿；GLB 钉子在 CI 的各环境下一致。

不许（RM-D21、RM-D23、RM-D94）：换 PBR 着色（`MeshStandardMaterial`）、位图纹理、HDR 天空或昼夜、照片级、实时阴影图、让任何物体发光（MF-D2）。换 PBR 着色要所有者另行裁定，本卡不做。

---

## 阶段 F · 批次 D（2027-01-10 起）：按证据重排

（RM-D27 之后 2027-01-10 是参考日期：本阶段的卡依赖满足就开工，不等这一天。）

- RM6.1 · 剖面所需的两个事实 → done (lab)

### RM6.1c · `skills/archlang/SKILL.md:323` 仍写 "sliding-family-only"（2026-11-12 加，出自 #714） — `todo` · 未估 · sonnet · 依赖无（线下）

#714 把 spec 的门行改成按种类的派生表（`DOOR_KIND_CLAUSES`）；`skills/archlang/SKILL.md` 第 323 行仍写 "`slide`/`open` are sliding-family-only"，而 barn 与 bifold 也接受它们。内容：照 `DOOR_KIND_CLAUSES` 改这句（用 `gen:*` 的真源，不手抄），生成的副本由生成器重生成。不许：手改生成副本。

### RM6.1b · 3D 读 `slab` — `todo` · 未估 · opus · 依赖无（线下）

现象：RM6.1 的 `slab` 只进 `describe().heights`，`archlang-3d` 的楼板仍按旧厚度。内容：`packages/archlang-3d` 读 `level` 的 `slab`，楼板厚度取作者值，没写时不变。证明：用了 `slab` 的图 3D 楼板厚度随之变；没写的图 Mesh3D 与 GLB 逐字节不变。不许：让核心依赖 3D；给没写的图猜板厚。

### RM6.1d · RM6.1 的评审余项（2026-11-12 加，出自 #721） — `todo` · 未估 · opus · 依赖无（线下）

六件小事，可拆：
1. `clear` 大于层高、`slab` 不小于层高，现在都不报诊断。内容：设计一条 W，并量编译器路径字节（#721 后为 393,692 B / 401,000 B）。不许：不量字节就加。
2. `import … as` 会静默丢掉模块里的 `section`。内容：报一条警告。
3. 编辑器高亮器把 section、slab、look 在 id 位置上着了关键字色（`sheet` 已处理过）。内容：照 `sheet` 的做法修。
4. OpenPlan3D 的 `UNRESERVED_KEYWORDS` 过滤没有测试。内容：补测试。
5. `levelPlanFor` 的缓存键不含注册表（只因每注册表一份解析备忘才安全）。内容：键里加上注册表，或在注释与测试里钉住这一前提。
6. `droppedFromStorey` 用 `BUILTIN_REGISTRY` 做 `nameOf`，没用平面自己的注册表或 `KIND_FACETS`。内容：改用后者。
证明：每件各一条测试；字节恒等律不变。不许：顺手改别的。

### RM3.3 · mask 导入 — `todo` · 3 日 · opus · **触发：第二个独立来源带样本**

`docs/import.md` 已提到一个把分割 mask 变成 Plan JSON 的实验工具；`docs/from-an-image.md` 已是 CR7 ① 的工作流页。本卡把实验工具推进为 `archlang import --from mask`，输出可 lint 的 `.arch`，丢弃物进 `W_IMPORT_DROPPED`（与 OpenPlan3D 导入同路）。工作流页只加一段"有 mask 时"。

不许：在核心里读像素；任何视觉模型依赖；重写 `from-an-image.md`。

### RM7.1 · 无障碍与性能 — `todo` · 4 日 · opus · 依赖无

A.6/A.7（CLI `--accessible --annotate` 与 MCP 对应参数）、A.1（`dims auto` 文本的朗读）、A.3（朗读标题不引 id）、PG.1（playground 房间键盘可达）、PG.2（按形状而非 bbox 命中，"shape, never bbox"）、PG.3（事实行不抖动布局）、4.1（拼接 3× 性能，字节零动）。

证明：axe 零新增；4.1 的 bench 在 CI 上跑，本地不跑。

### 阶段 F 的其余候选（不排序）

波次 2′ 线下没做完的卡；剖面本体（DS12 → DS13，在 `archlang-3d`）与 MF17–MF19；MF12、MF14、MF15（等 MF-D3(b)）；NZ/AU advisory profile（带 RM1.6 的出处）；`lint --brief`；FLOORA 导入；Cron 巡检；Workers AI 读图探针设计；#344；DS3–DS9；CRF4、CRF6、CRF8；IFC 下游包（只在触发后）；MCP 工具分组（工具数到二十个以上再议，今天 11 个）。

第 8 轨的候选（不排序）：3D 坡屋顶（backlog 3D.4，先写设计）；窗帘与吊灯、吊扇等挂顶物（MF14、MF15，等 MF-D3(b)）；新家族第二批；家具转到斜墙（backlog 5.6）；预览图的 CJK 字体（CRF9，仍 parked，见下表）；实时查看器的抗锯齿（MP7 之后）。

---

## 第 9 轨 · CI 吞吐（RM-D37，2026-11-14 加；出处与重开条件见 `../ci-throughput-research.md` §10）

不挡也不被任何产品卡挡。**不是第三个执行者：** TP 卡在核心车道两张卡之间占用核心执行者的位置（RM-D22 的两个执行者不变），一次一张。TP1、TP2 是 high 层级（脚本与工作流），评审后由协调者判断合并。

- TP1 · `npm run sync:main`：同步 `main` 时机械地解掉记录与生成物冲突 → done (lab)

### TP1b · `sync:main` 的余项（2026-11-14 加，出自 #754 的评审） — `todo` · 未估 · sonnet · 依赖无（线下）

(a) 重点清单的 import 关联看不到被删除或改名的模块（`scripts/nearest-tests.mjs` 只解析存在的文件）：main 删了 PR 引用的模块，或反过来，要列出来（CI 的 typecheck 会挡住，所以是线下）。(b) `test/sync-main.test.ts` 在 Windows 上约 22 s（每例 30 s 超时）；若 `Windows tests` 的某一片因它变成长杆，把集成用例并成更少的仓库。

- TP2 · Playground E2E 拆三个 job；Node 18、Node 20、Windows 在 `main` 上各分三片 → done (lab)
- TP6 · `test/sequencer.ts` 给记录为 0 秒的文件一个最小成本（2026-11-14 加，出自 #755） → done (lab)

### TP3 · E2E flaky 记账 — `todo` · 0.5 日 · sonnet · 依赖 TP2（线下）

`scripts/playwright-flaky.mjs` 的结果在每次 E2E 运行上传为产物；夜间汇总近 14 天，一个用例在 14 天里重试才过 ≥3 次就开 issue（标签 `flaky`），附运行链接。证明：用一个重试才过的 JSON 夹具测汇总逻辑。不许：用重试或调大超时把它压掉。

### TP4 · `main` 因合并而红时自动开回滚 PR — `todo`（暂缓） · 1 日 · opus · 依赖所有者建一个 GitHub App 或细粒度令牌（`GITHUB_TOKEN` 开的 PR 不触发 CI）（线下）

只数**合并造成的事故**：重跑能过的、或红在安装步骤（如 apt 的 "Install Chromium system deps"）的不算。基线：2026-11-10 → 11-14 一起（#703 带进 Node 18 上的 `toReversed`，#701、#706 的推送也红在它上面，#705 报警、#708 修复）；同期 11-11 红在 apt 安装步骤上约 7 小时的那次不算。触发（`../ci-throughput-research.md` §10）：连续两周每周超过两起，或一起事故让 `main` 红超过 2 小时。触发前不做；自动回滚只对"上一次绿到这次红之间只有一个合并"的情形。

### TP5 · 复测 — `superseded`（由 TR6 取代，2026-11-15，RM-D48） · 0.5 日 · sonnet · 依赖 TP1、TP2 合并后又过了 7 天的合并

照 `../ci-throughput-research.md` §9 的命令重取 §7 的表，**另加** §10.1 各重开条件要的量：每个合并的 PR 同步几次、P90 开 → 合、job 排队时间中位数、`check-changelog-unreleased` 拒掉 union 合并条目的次数、合并造成的 `main` 事故数（TP4 的数法）、每个 job 的中位时长。写在 §10.2 下面；触发了哪一行就记进本节新的一张卡。

**2026-11-15 之后（RM-D48）：** 合并列车（FT2，#788）、已证明的 push（FT1，#785）与更短的运行（FT3a，#794；FT3c，#798；FT4，#795，列车 #801，`4f432ca1`）已合并；记录在 `../ci-throughput-research.md` §12。下面是它留下的卡，都是线下，一次一张。

### TR1 · 列车脚本加固（2026-11-15 加） — `todo` · 未估 · sonnet · 依赖无（线下）

`scripts/merge-train.mjs`：(a) 对幂等的读操作有界重试 `gh` 的瞬时错误（HTTP 5xx、超时）——`--land --wait` 曾因一次 502 退出，重跑即过；(b) 更安静的 `--wait`（现在每 30 s 打印所有未完成的检查）；(c) 撤回一个钉的办法（固定首行如 `withdrawn <sha>`，最新的算数）；(d) 在 Linux/macOS 上，工作树状态检查在 `node_modules` 链接被解除之前跑；(e) 一个 run 的 `pull_requests` 为空数组被读成"还没有 run"；(f) 仅低层级豁免是按成员分层，不是按列车自己的 diff；(g) "已评论"标记是纯前缀匹配；(h) `--sync`（把动过的 `main` 合进已有列车）对"放弃再重建"。不许：放宽 `--land` 的任何一项拒绝条件。

### TR2 · 证明加固（2026-11-15 加） — `todo` · 未估 · sonnet · 依赖无（线下）

(a) `commits/{sha}/pulls` 滞后时，按头分支查找兜底；(b) 守卫测试用子串匹配步骤的 `if`：改为精确白名单，并要求每个非聚合 job 要么是标记 job、要么没有步骤 `if`；(c) 已证明的 push 不会重填 `main` 作用域的 Playwright 缓存——由夜间任务预热；(d) `scripts/release-guard.sh` 只查 10 个必需名里的 7 个（缺 `3D package (check:3d)`）。不许：让证明在存疑时通过（保持 fail-open 即"存疑就全跑"）。

### TR3 · 记录类合并在 `main` 上的判定（2026-11-15 加） — `todo`（低优先） · 未估 · sonnet · 依赖无（线下）

对 `main` 的 push 加"只含记录"的判定（今天记录类合并会在 `main` 上跑完整套）。列车承载代码 PR 期间价值低；只在记录类合并耽误了要紧的部署时才做。

### TR4 · 守卫（2026-11-15 加） — `todo` · 未估 · sonnet · 依赖无（线下）

(a) 钩子漏掉 `npm --prefix … run e2e`、`npm run -w <ws> e2e`、`npm -ws run e2e`、`npx tsx …/scripts/e2e.ts`；(b) `test/e2e-shards.test.ts` 抓不到参数写错：每个 job 加一次 `--list` 计数检查，与不分片的 `--list` 对账；(c) 它的子串检查应把过滤器当正则。

### TR5 · 40 个 job 的上限（2026-11-15 加） — `todo`（暂缓，一个选项都没选） · 未估 · opus · 依赖触发（线下）

选项：每次运行的 job 更少（合并很小的 job）；Windows 分 7 片（峰值 40）；把仅 `main` 的一条腿移出列车（削弱门禁：需所有者裁定）。触发：列车运行上 job 排队时间的中位数超过 1 分钟。

- TR6 · 复测（2026-11-15 加，取代 TP5） → done (lab)
- TR7 · finish 拆分之后的文字（2026-11-15 加） → done (lab)

### TR8 · 本地门禁的残余（2026-11-15 加，出自 #795 的最后一轮评审） — `todo` · 未估 · sonnet · 依赖无（线下）

`docs/agents/commands.md` 里过时的算出来的数（19 个扫描器、7.5 秒）与 `scripts/check-quick.mjs` 头注释的笔误已由 #806 改好（已在 `origin/main` 上核对）。仍开着：

(a) 源码树扫描器的判定：数任何带引号的 `"src"`（误判 `dataset` 4.3 s、`docs-page-meta`、`docs-sync-list`），不跟随辅助函数（漏掉 `test/sync-main.test.ts`），没有 `packages/` 根（漏掉 `test/workspace-seams.test.ts`）；(b) `test/gate-select.test.ts:80` 拼出一个字符串，被 import 图的正则读成对 `src/index.js` 的 import（使 `module-map.md` 与 `test/INDEX.md` 的 importer 数各多 1）；(c) 额外文件总数加一个 25 的上限；(d) 在空闲的机器上做一次成对计时：同一个一行的 `src/` 改动，分别用 #795 之前与之后的 `origin/main` 的门禁（现有只有负载下的 136、319、119、252 s，估计 30–35 s，置信度低）。不许：把 `typecheck:all` 或构建放回门禁。选择重放的工具在 `D:\github_repository\claude-kept\2026-11-15-archlang-ci-speedup\gate-replay\`（脚本与 17 份记录下来的改动集）。

- TR9 · 合并机器的风险层级（2026-11-16 加） → done (lab)
- TR10 · 列车与同步命令的许可（2026-11-16 加） → done (lab)

### TR11 · 发布与夜间机器的风险层级（2026-11-16 加，出自 #811 的评审） — `todo` · 不需所有者裁定（下一位协调者判断） · 依赖无（线下）

按 TR9 的同一逻辑，有意留在 medium 的候选，因为它们是发布或夜间的机器，不是合并机器：`scripts/release-guard.sh`（发布门；它只查 10 个必需名里的 7 个，那一项归 TR2）与 `scripts/playwright-flaky.mjs`（夜间用 `--fail-on-flaky` 卡门）。判断：要不要升成 high（改 `scripts/risk-tier.mjs` 的 `RULES`、`test/risk-tier.test.ts` 与 `docs/agents/commands.md` 第 0 步，高层级 PR）。

- TR12 · 推之前预看语料摘要（2026-11-19 加，出自 TR6） → done (lab)

### TR13 · 最后一次推之前先同步 `main`（2026-11-19 加，出自 TR6） — `todo` · 未估 · sonnet · 依赖无（线下）

TR6：生成物漂移与 backlog 索引过时的红（rr24、rr9、ev7、co1、rm9.2、af3）都是 `main` 在 PR 底下挪了。做法：执行者的简报与 `docs/agents/commands.md` 写明“最后一次推之前 `git merge origin/main` 并跑 `gen:all` 里改动涉及的生成器”；或者让 `check:quick` 在分支落后 `origin/main` 时提示。另记：§13.2 量到 2026-11-17 后 30 个合并只有 2 个走列车，直接合并让部署多等约 9 分钟（`main` 红率仍为 0）；要不要回到“代码 PR 走列车”，由下一位协调者判断。

### TR14 · Actions 缓存不超上限（2026-11-19 加，出自 #963 评审） — `doing` · #982 已合并（列车 #984，`0d9e27c7`，2026-11-19T19:40Z UTC；`main` 的 push 与定时运行裁掉旧的 CodeQL overlay 缓存；2026-11-20 UTC 读数 39 项、6.96 GB）；验收要的一周后读数约 2026-11-26 到期，读到并满足才改 `done` · 未估 · sonnet · 依赖无（线下）

仓库缓存 10.46 GB / 10 GB，41 项；`main` 上 14 个 `codeql-overlay-*` 占 5.3 GB，挤掉 Playwright 与 apt 缓存（夜间的 `playwright-all` 已经被重建过一次）。做法：定时 job 用 `gh cache delete` 只留最新 1–2 个 overlay，或关掉 CodeQL 的 overlay 缓存。验收：一周后缓存总量低于 8 GB，`apt-debs-*` 四组都还在。

### TR15 · 分片平衡的残余（2026-11-19 加，出自 #965 第二轮评审） — `todo` · 未估 · sonnet · 依赖无（线下）

(SF1) `test/gate-select.test.ts` 的 ×1.3 钉只取 {1, 1.3} 两点，而 dataset 与 docs-fences 在 ×1.24–1.27 处不单调；五棵树的期望列表漏了 dataset；中位数刷新后 ×1.3 那行可能变红。(SF2) 低于 1 s 的免费扫描器在 `TREE_MAX_FILES=30` 的上限下能把 ≥1 s 的专门扫描器挤出去（五棵树已有 30 个候选）。(N1) 改 `examples/` 时漏选 `no-duplicate-helpers`，下次刷新表格前一直如此。(N2) 只改测试也会跑 `new-families-byte-identity`（19.7 s）。(N3) `scripts/gen-test-durations.mjs` 对 `--median` 只给一个运行、给父目录、`--drop` 用反斜杠、`-o` 与输入同名、缺一片，都不报错。(N4) 夜间的耗时上传没有 `continue-on-error`，失败会跳过漂移检查。(N5) 表头写 729 个文件，实为 684。(N6) `gate-select.test.ts` 在 describe 时做的工作（16.4 s，对比 8.5 s）。

---

## 第 10 轨 · AI 优先语言（2026-11-18 加；设计与证据见 `../ai-first-language/README.md` §7，裁定 RM-D60…D64 见 `README.md` §6.27）

**已开工（RM-D65，2026-11-18）：** 本轨标着 `todo`（RM-D64 的 blocked 已由 RM-D65 解除）的卡，按 `v3.md` §3 的顺序解锁。下面这句是 RM-D64 原来的范围，留作记录：现在只能做 AF21、AF22（离线测量）、AF26（语法审计，只出文档）、AF9 的设计稿和 AF12 的 ADR 草稿；这两张卡的代码部分，以及其余 `blocked` 的卡，都等所有者一句"开工"。开工之后按下面的顺序做：先 A 波（便宜、纯增量），再做 AF9，然后按 AF21、AF22 的结果定 D 波的形态。这一轨不是新车道：它的卡在核心车道两张卡之间占用核心执行者的位置，一次一张（RM-D22 的两个执行者不变）。

**每张卡做什么写在调研记录 §7 的同号一行；这里只写状态、规模、依赖、门和不许做什么。** 所有卡都跑 `cards.md` §0 的门禁。**动 `describe()`、`lint()`、`compile().diagnostics` 的卡：** 先用字节恒等载荷证明语料不动；会动就停下报告，不重钉（AGENTS.md "Never bless a golden to green a suite"）。**`[语法]` 卡**（AF12、AF15）：带字节恒等律，并且先确认 spec 的余量（2026-11-18：29,629 个 UTF-16 单位，上限 30,000，`test/llm-spec-drift.test.ts:87`）。

### A 波 · 诊断的信息密度

- AF0 · 记录对账：两条过期的测试注释，U.2 与 U.5 的实际状态 → done (lab)
- AF1 · `relatedSpans`、`instance`、`component` 进 `--json`、MCP 与 LSP → done (lab)
- AF2 · 一个 did-you-mean 生产者，词级 span 加修复 → done (lab)
- AF3 · 未知名字求值为错误值，不再引出连带错误 → done (lab)
- AF4 · `E_PARSE` 带结构化的 `expected[]` 和建议 → done (lab)
- AF5 · 错误目录的错例与正例成对，`explain` 进 MCP → done (lab)
- AF6 · `fmt --json` 拒绝时要说出来（并入 M.8） → done (lab)
- AF7 · 冲突带上每条有贡献的语句 → done (lab)
- AF8 · capabilities 公布 `fix` 能解决哪些码 → done (lab)

### B 波 · 修复推进到语义失分

- AF9 · 被拒的开口与门道堵塞：带占位符的修复（并入 EV.5） → done (lab)

### AF10 · 量纲：先管过大，再数维度 — `doing`（第一步按 RM-D81 关闭：没有 `V`/`S-full` 的尺寸上限出处，也没有可挂提示的现有诊断；第二步的第一片 `W_AREA_AS_LENGTH` 已由 #1006 `fe43738d` 做完，其余见 backlog SR.27） · 第一步 1 日、第二步 3 日 · opus · 依赖无（第二步的警告也不依赖；升为错误要等 AF15）

第一步用 `new-lint-rule` skill，带规则卡的公开夹具；阈值要有 `V` 或 `S-full` 的出处（原则 10），否则只做提示、不进新规则。不许：自动换算单位。

### AF11 · lint 的可信度类别（RM-D60） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 1 日 · opus · 依赖无

归类表逐条写进 PR，经新上下文评审。不许：类别进入 `lint()` 的序列化。

### AF12 · 源内的 `expect <CODE> reason "…"`（RM-D60） — `todo`（调研阶段只做 ADR 草稿；代码等 RM-D64） · ADR 1 日、代码 3 日 · opus · 代码依赖 AF11 与 ADR · `[语法]`

规则全按 RM-D60。不许：不带理由的 `allow`；删除被期望的诊断；让评测或评分少算一条被期望的警告。

### C 波 · 编辑与变更

### AF13 · `arch edit` 与 MCP `edit`：按元素修改，核对旧值 — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 5 日 · opus · 依赖 AF14

用 `new-cli-flag`、`new-mcp-tool` 两个 skill。不许：把编辑放进 `compile()`（它保持纯函数）。

### AF14 · `impact`/`diff` 报告 `id_deltas`（RM-D62） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 1 日 · sonnet · 依赖无

不许：改自动 id 的生成方式。

### AF15 · 源内语言版本头与 `fix --edition`（RM-D61） — `parked`（随 2.0） · 4 日 · opus · 依赖所有者的 2.0 发布决定 · `[语法]`

范围按 RM-D61：backlog 的 2.0 bucket 加两个已弃用形式，本卡不增不减。

### AF16 · 保持意图的命名重构 — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 3 日 · opus · 依赖 AF13

不许：前后的 SVG、`describe()`、`lint()` 字节不同时仍然执行重构（这种情况必须拒绝）。

### AF17 · 放置出处，只走可选入口（RM-D62） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 2 日 · opus · 依赖无

带字节恒等律。不许：改默认的 `describe()`。

### D 波 · 上下文与编辑器

### AF18 · 生成的类型化签名表与 `context --for` — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 3 日 · opus · 依赖 AF5、AF21

带漂移测试。不许：手写第三份语言描述。

### AF19 · VS Code 对齐 LSP 3.18 — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 2 日 · sonnet · 依赖 AF1

只改 `editors/vscode`。

### AF20 · Lark 语法与"每个文件一处违例"的语料 — `todo`（RM-D64 的 blocked 已由 RM-D65 解除；低优先） · 2 日 · sonnet · 依赖无

不许：手写语法（与 GBNF 从同一张 token 表生成）。

### E 波 · 测量

### AF21 · 外来语法按来源语言分类（离线） — `todo`（调研阶段可做） · 1 日 · opus · 依赖无

输入：Hugging Face 上已发布的 model-authoring 行，以及 `eval-results-live` 的 workflow artifact（RM-D53）。**不读 `eval/live-runs/t3/`**：对 T3 两组的任何读数都是对 T3 结果的第二次表述，要所有者裁定（`docs/agents/iron-laws.md`）。报告写进 `../ai-first-language/`，写出方差，并分开报 26 张评测 brief 和 model-authoring 的 brief。不许：调用付费模型；把脚本放进 `src/`（脚本放 scratch 或 `archlang-lab`）。

### AF22 · 每张 brief 到达 lint 全过所需的 token 数（离线） — `todo`（调研阶段可做） · 1 日 · sonnet · 依赖无

输入、排除和规则同 AF21。一次只读一组。不许：比较带反馈循环的一组与对照组。

### AF23 · 付费的规格书消融（RM-D63） — `parked` · 未估 · opus · 重开条件见 RM-D63

花钱要所有者对那一次的明确同意。

### AF26 · 语法规则的不规则处审计（2026-11-18 补档时加） — `todo`（调研阶段可做，只出文档） · 1 日 · opus · 依赖 AF21

逐条看调研记录 §6 列出的不规则规则：它占多少 spec 字节，AF21 的分类里模型有没有在它上面出错，规则化之后的写法是什么。产物是写进 `../ai-first-language/` 的报告。不许：在本卡里改语法（每一项改动各开一张卡，并经裁定；会让源码不再编译的，归入 2.0 bucket，按 RM-D61 处理）。

### F 波 · 卫生与 MCP 对齐（2026-11-18 补档时加）

### AF24 · 剩下的字符串字面量诊断迁到 `diag()` — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 每批 0.5 日 · sonnet · 依赖无（线下）

`src/` 里约 440 处 `code: "…"`。一批一个 PR，每批都用字节恒等载荷证明输出不动（迁移会改诊断 JSON 的键序，`src/diagnostics.ts:159-161`），移动了就停下报告。不许：一个 PR 迁完全部；重钉载荷。

### AF25 · MCP 补上 `fmt`、`impact`、`ast`、`reroll` — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 每个工具 1 日 · sonnet · 依赖无

`explain` 归 AF5。一个工具一个 PR，用 `new-mcp-tool` skill，stdio shim 和托管 Worker 一起改。不许：新工具的行为与 CLI 不同。

---

## 第 11 轨 · v3：说对数字、查得出、改得动、交得出去（2026-11-18 加；排期、证据与原则见 `v3.md`）

**已开工（RM-D65，2026-11-18）：** 标着 `todo`（RM-D64 的 blocked 已由 RM-D65 解除）的卡，按下面的顺序解锁。顺序按 `v3.md` §3 的阶段走：阶段 1 是 RM9.1、RM9.2、EV.8、RM9.3、RM9.4、A 波、RM9.5；阶段 2 是 RM9.6、AF9、RM9.10、RM9.11；阶段 3 是 RM9.7；阶段 4 是其余各卡。这一轨不是新车道，它的卡占用核心执行者的位置（RM-D22）。每张卡都跑 §0 的门禁。**动 `describe()`、`lint()`、`compile().diagnostics` 或 SVG 字节的卡，按 RM-D56 的证明方法做：** 逐行证明只有本卡说明的那些项移动了；去掉这些移动之后，要能复现旧的摘要；其他任何东西移动就停下报告，不重钉。`[语法]` 卡先确认 spec 余量（2026-11-18 是 371 个 UTF-16 单位）。

- RM9.0 · 覆盖率回归集的设计（N1、N3） → done (lab)
- RM9.1 · 总面积与 intent 面积带用精确面积（N1） → done (lab)
- RM9.2 · 整栋的总面积（N1；下游请求 4） → done (lab)
- RM9.3 · 不可能的 brief：`E_INTENT_INFEASIBLE`（N1） → done (lab)
- RM9.4 · 连锁错误，根因排第一（N8） → done (lab)
- RM9.5 · 代理引导：局部编辑、`keep`、`impact --lock`、楼梯从哪一端进、先确认单位（N2、N8） → done (lab)

### RM9.6 · 检查覆盖率冲刺（N1、N3） — `doing`（CV13 已做：示例 #996 `e4d36045`，规则 `W_TABLE_NO_SEAT` #993 `f48633ff`，按 RM-D73 拆成两个 PR，见 backlog SR.14；CV08 已做：示例 #1000 `db8e7aa3`，规则 `W_SEAT_FACING_WALL` #1001 `490f2e36`（RM-D80）；CV14 已做：示例 #1003 `56dff28d`，规则 `W_STAIR_NO_VOID` #1004 `7f093fc3`；其余各类按 rm9.0 §4 的队列，下一类 CV11（CV12 等 PS2.30 的验收）） · 10–15 日 · opus · 依赖 RM9.0

按 RM9.0 的判定逐类实施：加 lint 的那些类，每条规则一张小卡，带 §0 规则卡的门（公开的一对夹具，留出的一对放私有仓库，跑遍 `examples/**` 的报出数）；声明不查的那些类，写进一份公开的"不检查清单"（`docs/says-no.md` 或参考文档里）。验收：RM1.1b 的报出数。不许：为了拉高报出数去放宽规则的误报标准；把留出集写进公开仓库。

### RM9.7 · 整图缩放或变换写成一句（N2） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 3 日 · opus · 依赖 AF14

先做 CLI 版（`arch transform --scale <k> --keep <id>…`），输出改写后的源码和 `impact` 报告；是否再加语言形式（`place … scale`）要另开一张 `[语法]` 卡。证明：2026-11-18 试用的 H2 用一条命令做完，并且 `validate --strict` 干净。不许：改写源码时丢掉注释或 `let`；不经 `impact` 就静默移动被 `keep` 锁定的值。

### RM9.8 · 英尺英寸作为真正的单位（N9；并入 RM3.4；下游请求 5） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 4 日 · opus · 依赖 PS7.9 已做、spec 余量 · `[语法]`

`units ft-in`（或 RM3.4 原定的形式）：内部用 1/16 in 的整数表示，相加精确，尺寸以英尺英寸显示，面积用 sq ft。公制平面字节不动。做完时 RM3.4 在同一 PR 里裁掉。**证据更新（2026-11-28）：** 第三方实测（[`2026-11-meltflex-review.md`](2026-11-meltflex-review.md) §2.3 第 3 条）把"公制优先，美国用户的平方英尺来自换算"列为局限之一。不许：把英尺换算成毫米再舍入后存储（这正是今天的缺陷）。

### RM9.9 · 场地包络，advisory（N7） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 3 日 · opus · 依赖 PS4.9 的卡位 · `[语法]`

按 RM-D5：`keep site setback front 5m side 1.5m rear 3m`、`keep site coverage max 40%`、`keep site far max 1.2`，默认 advisory 等级，触发 `W_KEEP_VIOLATED`。事实模块与 DS3 共用。不许：加 `site` 字段；新开 W 码族；任何"符合"字样。

- RM9.10 · 层级感知（N3；下游请求 1 与待提的四条） → done (lab)
- RM9.11 · `repair()` 对家具给出确定的选择（N3；下游请求 3） → done (lab)

### RM9.12 · Plan JSON 带每层的楼梯、洞口、井道占地（N3、N5；下游请求 2） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 2 日 · opus · 依赖 RM3.1 后半

只新增字段；schema 照 `design/schema-policy.md` 处理。不许：改已有字段。

### RM9.13 · `W_GRID_SNAPPED` 的数量（N8；下游请求 7） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 1 日 · opus · 依赖无

每张图聚合成一条（把各处列成相关位置），或者降为 info 级。先与 RM1.4c、CO.1（RM-D56）对齐。按 RM-D56 的方法证明。

### RM9.14 · 3D 查看器的钩子（N4；下游请求 9） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 2 日 · opus · 依赖无（在 `packages/archlang-3d`）

包括 `onContextLost` 选项或句柄上的 `gl` 字段、单独显示一层、导出 `renderStill`。只改 archlang-3d，随下一次核心 tag 发布。不许：核心依赖 3D 包。

### RM9.15 · 用户能读到的文字（N1） — `todo`（RM-D64 的 blocked 已由 RM-D65 解除） · 2 日 · sonnet · 依赖无

包括 `W_KEEP_VIOLATED` 的 "A keep moves nothing."、`W_ANNOTATION_OVERLAP` 里的 `dims auto all`、`describe()` 写进 `<desc>` 的原始 id、尺寸文字的 `aria-label`（opt-in 输出）。消息规则照 §0：lint 的 `message` 不含 id。按 RM-D56 的方法证明。不许：改诊断码。

### RM9.16 · 检查召回率要有独立的标注（N1、N3；RM-D95） — `todo` · 1 日 · opus · 依赖 RM1.1b 的那次运行

RM1.1a 的"N 个缺陷"是由同时在写规则的执行者数出来的，召回率的分母因此是自评的。RM1.1b 跑完之后，另找一个与规则编写无关的标注者（所有者本人，或一个没见过规则卡与 RM9.0 分类的新上下文实例）独立数一遍缺陷，至少覆盖一个子样本（六份 brief 里的三份）；报告两份缺陷清单的一致数与不一致项，按清单的并集重算 k/N，两个数都写进 `handoff.md` 的测量表。不许：让标注者看到 lint 的输出再数；把不一致项按规则作者的意见裁掉而不写明。

### RM9.17 · `spec.llm.md` 作为上下文的审计（N8；RM-D95） — `todo` · 1 日 · opus · 依赖无（只出文档）

`spec.llm.md` 有尺寸上限（`test/llm-spec-drift.test.ts`），下游代理把它整份注入提示词，每一节都在占模型的注意力。逐节判定：必须常驻（每次写 `.arch` 都要用的语法与规则）、可以改为按需读取（例如 `archlang://capabilities` 资源、MCP 的 `validate` 返回的 `next`、AF18 做完之后的 `context --for`），还是可以删。只出一份设计稿（`design/` 下），写清每节的判定与理由、移走后释放的余量；改 spec 的字节另开卡，并照下游的规矩先定价。不许：本卡里改 `spec.llm.md` 或生成器。

### RM9.18 · MCP 工具描述与错误按工具设计清单过一遍（N8；RM-D95） — `todo` · 每个工具 0.5 日 · sonnet · 依赖无（与 AF25 同一处，先后都可）

对 `registerTools`（`packages/mcp/src/tools.ts`）里的每个工具核对：描述是否写明用途、何时用它而不是相邻的工具（例如 `validate` 对 `lint`、`describe` 对 `compile`）、输入输出格式、一个例子；错误结果能否区分"参数错"、"源码有诊断"、"超时或内部失败"和"结果为空"，并说明可否重试。改动只是描述文字与错误结果的结构时，照 `.claude/rules/mcp.md` 的加法约定（模式只增不删）。不许：为此改工具名或删参数。

### 第三方实测（MeltFlex，2026-11-15）带出的卡（2026-11-28 加；证据、核对与读法见 [`2026-11-meltflex-review.md`](2026-11-meltflex-review.md)）

对方在 Claude Code 里用 1.62.0 的五个技能端到端跑了一个两室一卫约 80 m² 的 brief：技能被自动选中，验证器抓到门扇碰浴缸（差 25 mm）并被修正，尺寸链闭合；同一 brief 的图像模型方案数字全部不闭合。批评集中在"有效不等于好"：入户直通起居、两卧等大、起居呈带状、没有壁柜与洗衣；另有公制优先、3D 交给了别家、Codex 贵且要开网络、单一维护者宜固定版本。下列卡都是 `todo`，排期由所有者定（审阅稿 §5 有建议的先后）。

### RM9.19 · brief-to-plan 与 edit-plan 技能在循环干净后跑一次 taste 评审（N3、N8） — `todo` · 0.5 日 · sonnet · 依赖无

`skills/archlang/SKILL.md` 已写"循环干净后跑一次 `archlang score plan.arch --taste generic --json` 与 `archlang preview plan.arch --review -o review.png`，报告分数与 `A_*` 建议，不据此迭代"，但 `skills/archlang-brief-to-plan/SKILL.md` 只有 `preview -o plan.png`，`skills/archlang-edit-plan/SKILL.md` 也要核对。对方的带状起居（10 m × 3.6 m ≈ 2.78:1）按 R9 `A_ROOM_ELONGATED` 的 2:1 门槛会报，但流程没跑到。内容：两个技能在 strict 检查干净之后加这一步，最终报告列出 taste 分数、每条 `A_*` 建议与 review 图，并把"建议不是错误、不据此迭代、由用户决定"写清楚；措辞与 `skills/archlang/SKILL.md` 的那一段一致（读它，不重写）。核对技能文件是否被 `gen:agent-manifests` 复制到 `plugins/`，是则跑生成器。证明：技能相关的现有测试（`npm run check:quick` 选到的）全绿；PR 正文贴一份离线夹具（审阅稿 §6 的同类 brief）按新步骤跑出的 `score --taste` JSON 片段。不许：把 taste 变成门禁或迭代目标；在技能里承诺任何规范合规。

### RM9.20 · 新 taste 准则：入户直通公共房间，没有入口过渡（N3；RM1.2b 同一族） — `todo` · 1.5 日 · opus · 依赖 RM1.6a（出处成为数据，已 `done`）

对方第一条批评：入户门直接开进起居室，没有门厅、挂衣处。现有检查都不覆盖：`A_INTIMACY_INVERSION`（R3）查的是公共房间比卧室更深，`W_ENTRANCE_INTO_PRIVATE` 查的是开进私密房间。内容：在 `src/taste/` 加一条 advisory 准则（新的 `A_*` 码与 R 编号，按现有行的格式写 `source`、`verified`、`asks`），判定"住宅的主入口门直接开进 living/dining/kitchen，且门内侧一定深度内没有可读作 entry/foyer/hall 的房间或区域"。入口读法用 `src/analyze/rooms.ts` 已有的 entry/foyer 分类与入口门的选择（`preview --review` 已显示主入口或并列），不另造。出处只取读过的原文（例如 Alexander, A Pattern Language 112 "entrance transition" 或 130 "entrance room"；读不到原文则 `verified` 照实写），阈值（深度）要有出处或写明是 ArchLang 自定并说明理由。只对 `uses` 为住宅的图生效；brief/intent 明说"开门见厅"时不报（读 intent 的方式按现有准则）。证明：§0 规则卡门禁；正反夹具各至少两个（有门厅、门开进走廊、门直开起居、开放式小公寓）；语料上 SVG、`describe()`、`lint()` 字节不变（taste 是 `score` 的输出，不进 `lint`）。不许：做成 W 或进 `lint()`；写"不符合某规范"；按国家猜门厅的默认尺寸。

### RM9.21 · 新 taste 准则：卧室面积没有层级（N3） — `todo` · 1 日 · opus · 依赖无

对方第二条批评：两间卧室同为轴线 17.6 m²，对次卧太大。内容：一条 advisory `A_*`：住宅里有两间以上卧室、且主卧（或面积最大的卧室）与其余卧室的净面积差在某个比例之内时提示"卧室大小没有分出主次"。比例与"次卧常见面积"要有可读的一手出处（对方引用的 100–144 sq ft 来自他们自己的指南，不能直接用；去找原始来源，读不到就只做"等大"判定、不给推荐面积）。intent 或 brief 明说卧室等大（合租、双主卧）时不报。证明：同 RM9.20 的门禁与字节不变；夹具：等大两卧、主次分明、三卧其中两间等大、intent 声明等大。不许：给出"应缩小到多少"的数值建议；改 `repair` 或 `finish` 去动面积。

### RM9.22 · brief-to-plan 的缺项清单：住宅常规项（N3） — `todo` · 1 日 · sonnet · 依赖无

对方第四条批评：没有壁柜、没有洗衣，brief 没要技能就没画，"设计师会问"。这是代理层的事，不进语言。内容：在 `skills/archlang-brief-to-plan/SKILL.md` 的"列出 brief 的每一条要求"之后加一步：对住宅 brief，核对一份短清单（入口与挂衣、卧室衣柜、洗衣、储藏、卫生间数量）里 brief 没有提到的项，在写 `.arch` 之前列出来，并对每一项写明采用的假设（画或不画、为什么）或向用户提问；交互不可用时按假设画并在最终报告里列出。清单与"不悄悄改数字"那条规矩并排，口径一致。证明：技能测试全绿；PR 正文附一次离线演练（同类夹具）的报告片段。不许：在技能里写死各国尺寸；把清单变成编译器的诊断。

### RM9.23 · 图纸表现审计：`finish` 与默认图纸 vs 图像方案的元素（只出设计稿） — `todo` · 1 日 · opus · 依赖无

对方说图像方案"看起来更专业"（家具符号、填充、指北针），读者不核对数字时更有说服力。内容：在 `design/` 下出一份审计：(1) `brief-to-plan` 技能描述说"finishes it as a sheet"，核对它是否总跑 `archlang finish`、跑了之后图纸多了什么；(2) 逐项列出默认图纸已有与没有的表现元素（指北针、比例尺、墙体填充/剖切填充、家具符号、房间名与面积、图框），对照 `docs/agents/iron-laws.md` 的绘图律（绘图改动不移动 `describe()`/`lint()`，字形不得新增手性）判定哪些可以作为默认、哪些只能作为选项；(3) 给出候选改动的清单与各自的字节影响预估。证明：设计稿本身；不改任何源码字节。不许：本卡里改绘图；为了"好看"画出没有依据的东西（虚构家具、虚构门）。

### RM9.24 · 3D 预览的入口写进技能结尾（N4） — `todo` · 0.5 日 · sonnet · 依赖无

对方把 ArchLang 的 PNG 交给 MeltFlex 去做 3D，没有发现 ArchLang 自己有 3D 预览（`packages/archlang-3d` 的 GLB、Scene3D JSON、离线 HTML；playground 的 Plan | 3D 切换与 Download GLB）。内容：`archlang-brief-to-plan` 与 `archlang-export` 技能的最终报告加一行 3D 入口：有 MCP 时用 `link` 工具给 playground 链接并说明可切到 3D；只有 CLI 时给出 `archlang-3d` 的命令（先读 `packages/archlang-3d` 的 README，照它写）。措辞用"3D preview"，按 `.claude/rules/archlang-3d.md` 的口径（预览，不是设计或施工文件）。证明：技能测试全绿；在 `.claude/rules/archlang-3d.md` 与 MCP 测试约束下核对文字。不许：改 MCP 工具描述去承诺 3D（测试禁止）；让核心依赖 `archlang-3d`。

### RM9.25 · Codex 路径：断网可用与上下文成本（N8；与 RM9.17 同一处）（只出设计稿） — `todo` · 1 日 · opus · 依赖无

对方同一 brief 在 Codex 里约 $2.07（Claude Code $0.73），且要先打开网络权限，因为技能经 `npx` 调 CLI。内容：在 `design/` 下出一份调查：(1) Codex 沙箱默认断网时技能的哪一步失败、失败时的报错是否告诉代理怎么办；(2) 断网可用的选项（插件里随带固定版本的 CLI、全局安装的说明、只读 `spec.llm.md` 的降级路径），各自的体积、更新与 provenance 代价（核心零运行时依赖）；(3) 上下文成本：两次运行的差别里哪些可能来自 spec 与技能的长度，与 RM9.17 的逐节判定对齐；只用离线手段（字节数、token 估算），不跑付费评测。证明：设计稿。不许：跑 `eval:live` 等付费评测（所有者专属）；本卡改技能或插件。

### RM9.26 · 信任信号：provenance 与固定版本写明（对方的局限第 6 条） — `todo` · 0.5 日 · sonnet · 依赖无

npm 已发布 SLSA provenance（`npm view @chanmeng666/archlang@<version> dist.attestations` 有 `https://slsa.dev/provenance/v1`，发布是无令牌 OIDC），README 第 104 行只写了单一维护者那一句。内容：README（与 `skills/*/SKILL.md` 的 `compatibility` 行，按需要）加一两句：发布带 provenance、怎样核对（`npm audit signatures` 或上面的命令）、在技能与 CI 里固定版本的写法（`npx -y @chanmeng666/archlang@<version>`）。版本号不写进文档（AGENTS.md：版本来自 npm/tag），用占位。证明：README 的现有测试与漂移检查全绿；命令在本机跑一次贴出输出。不许：写具体版本号；声称"已审计""安全"之类没有出处的话。

### RM9.27 · 公开页面引用这篇第三方实测（措辞律之内） — `todo` · 0.5 日 · sonnet · 依赖所有者看过措辞

这是至今第一篇与维护者无关的第三方实测，结论是 ArchLang 画出的平面数字闭合而图像方案不闭合。内容：在 README 或文档首页的合适位置加一行引用与链接，照 `docs/seo.md` §4 的措辞律：写"一篇独立的测试（MeltFlex，2026-11）在同一个 brief 上运行了…"，注明对方销售 3D 工具、与本项目无关；不转述对方的星数与费用；不用"best""first""only"。证明：`test/docs-page-meta.test.ts` 等公开文字守卫全绿；`docs:build`。不许：转载原文段落；把对方的时间与费用写成我们的基准；暗示认证或背书。

### 真实专业平面图复刻探针（HABS，2026-11-28）带出的卡（RM-D96；证据与读法见 [`2026-11-habs-probe.md`](2026-11-habs-probe.md)）

一个代理只用公开 spec 与 CLI，约 16 分钟把一张公有领域的 HABS 测绘图（Breuer Exhibition House，1949）写成 `.arch`。11 个房间的净面积与印刷值相差都在 3.1 % 以内，其中 7 个在 0.5 % 以内。缺口集中在三处：墙体（混厚、独立建筑、百叶）、英尺英寸、图纸排版。`E_OPENING_NIB` 拒绝了 8 扇真实存在的贴角门，严格校验对这栋住了七十多年的房子留下 13 条警告。下列卡都是 `todo`，排期按 `handoff.md` §2 与 `v3.md` §3，所有者决定；先后建议：RM9.31 与 RM9.32 是小卡，先做；RM9.28 接着做；RM9.29 依赖 RM9.28；RM9.30 只出设计稿，可与 RM9.28 并行。

### RM9.28 · HABS 公有领域住宅测绘图覆盖率基准（20 张） — `todo` · 3 日 · opus · 依赖无（与 RM9.31、RM9.32 的结论互相引用）

**目的：** 量出 ArchLang 能把真实专业平面图表达到哪一步，并收集检查对已建成住宅的全部判断，作为路线图的输入。

**内容：**
1. 从 HABS（Library of Congress / Wikimedia Commons，许可必须是 "Public domain"）选 20 张住宅平面测绘图：年代、地区、层数、构造各有分散；每张记下出处 URL、调查号、许可。
2. 每张由代理只用公开 spec 与 CLI 写成 `.arch`；按探针 §3 的三档（能表达 / 近似 / 做不到）逐元素记录；按 §2 的表记录印刷尺寸与 `describe` 净面积的偏差；记录每一条拒绝与警告，读法分三类：真错误 / 规则对真实建筑过严 / 无法判断。
3. 汇总：每类元素的可表达比例、最常见的五个缺口、最常见的五个疑似误报，写成 `docs/plans/product-roadmap/` 下的一份结果文档，不进任何评测分数。

**证明：** 结果文档加 20 份 `.arch` 与出处表。夹具放在 `eval/`、`examples/` 以外的地方（例如 `eval/coverage-habs/`，由执行者按 `docs/testing.md` 的夹具规则定），不进任何字节同一性定律的语料，不改任何已有分数或基线。

**不许：**
- 跑付费评测：`eval:live` 等是所有者专属；代理在订阅额度内手写即可。
- 用 Reddit 或任何许可不明的图；把结果写成"ArchLang 能复刻 N % 的真实平面"之类的对外宣称，除非另有所有者裁定。
- 为了让夹具通过而改规则（规则改动走 RM9.31）。

### RM9.29 · 开放数据集转换器 → 带署名发布的 `.arch` 语料（先做 Modified Swiss Dwellings） — `todo` · 4 日 · opus · 依赖 RM9.28（缺口清单决定转换范围）

**目的：** 公开数据集里出现真实的 `.arch` 文本，是"模型越强越会写 ArchLang"最具体的机制。程序化转换可以规模化，逐张让模型复刻做不到。

**内容：**
1. **先核许可**（不通过就停，写明原因）。
   - Modified Swiss Dwellings：4TU 记录（DOI 10.4121/e1d89cb5-6872-48fc-be63-aadd687ee6f9）第 2 版标注 CC BY 4.0，约 5,300 份；核对原始 Swiss Dwellings 的许可与衍生条款。
   - ResPlan（约 17,000 份矢量平面）：许可尚未核实，只在许可允许再发布衍生作品时才进第二步。
2. 写一个转换脚本，放在核心以外（`dataset/` 或 `scripts/`；核心零运行时依赖不动）：矢量几何 → `room … polygon` / `walls from rooms` / 门窗；每份输出都跑 `validate --strict --json`，记录通过率与失败原因分布。
3. 带署名发布到现有的 Hugging Face 数据集，作为单独的 split 或配置，数据卡写明来源、许可、转换版本和"这是转换，不是测绘"。
4. 报告可转换比例与主要失败原因，喂回 RM9.32。

**证明：** 转换脚本的单元测试；10 份抽样的人工核对（转换前后房间数、面积、邻接对照）；数据卡。

**不许：**
- 在许可未核实时发布任何衍生数据；动 dataset canary（`AGENTS.md`：canary 永不重生成）。
- 把转换数据混进评测语料（评测语料是公开夹具，不是留出集）。
- 宣称转换结果是"真实建筑的准确记录"。

### RM9.30 · 现状记录读法（as-built）：同样的规则，报告而不拒绝（只出设计稿） — `todo` · 1.5 日 · opus · 依赖无

**目的：** ArchLang 拒绝不合理的东西，这对设计是对的；但把一栋已建成的房子写下来时，规则会逼作者改掉真实几何。探针中 7 扇门移了位置，`E_OPENING_NIB` 拒绝 8 次。

**内容：** 在 `design/` 下出一份设计稿，回答四个问题：
1. 哪些拒绝与警告在"记录"语境下应当降为报告。逐个列出代码：至少 `E_OPENING_NIB`、`W_DOOR_CLEARANCE`、`W_STAIR_TOO_STEEP`、窗间墙下限。
2. 怎样声明这种读法：语句、lint profile，或 `--profile-file`（与 MX2 的关系）。
3. 输出如何标明"这是记录，数值 X 是假定的"（例如层高）。
4. 与 ADR 0004/0005 的边界：派生位置永不滑动，记录模式只改变是否拒绝，不改变放在哪里；`compile()` 不读 lint profile（`E_OPENING_NIB` 目录说明）这一点是否要动，动的话需要什么 ADR。

还要给出字节影响预估：对现有示例应为零。

**证明：** 设计稿本身；不改任何源码字节。

**不许：** 本卡改编译器或规则；为通过而滑动门洞；动 iron law（若设计需要，写成提案交所有者）。

### RM9.31 · 探针带出的疑似误报：先最小复现，再决定改不改 — `todo` · 1.5 日 · opus · 依赖无

**内容：** 对下列每一条，先写一个最小平面复现：复现不了就关掉并记录原因，复现了就判定是规则缺陷还是建筑本身的问题，再决定修、改文案或保留。

1. `W_BATH_VIA_BEDROOM`：二层卫生间是主卧套卫，一层另有走廊卫生间，仍然报警。核对规则是否按层判断、是否认得套卫。
2. `W_HOB_UNDER_WINDOW`：声明 1400 mm 窗台后仍然报。核对规则是否读窗台高度。
3. `W_STAIR_NO_LANDING`：室外楼梯底部落在铺地、顶部落在阳台。核对室外地面与阳台是否算平台。
4. 一扇窄门同时触发 `W_DOOR_CLEARANCE` 与 `W_PATH_TOO_NARROW`。核对是否应当去重或互相引用。
5. `north <角度>` 可用而 spec 只列四个方向，且旋转后剖切符号报 `E_SECTION_LOOK`。核对 spec 与行为哪个对。

**证明：** 每条一个先红后绿的测试，或一份"复现不了 / 按设计如此"的说明。任何修复都要证明对示例语料的 `describe()`/`lint()` 影响按 iron laws 列明。

**不许：** 没有复现就改规则；为了让探针平面通过而放宽规则；改动 SYNONYMS_VERSION / JUDGE_VERSION（所有者专属）。

### RM9.32 · 探针缺口清单分诊：对照已有卡去重与核对 — `todo` · 0.5 日 · sonnet · 依赖无（只改本目录文档）

**内容：** 把 [`2026-11-habs-probe.md`](2026-11-habs-probe.md) §3 的每一条对照 `cards.md`、`docs/backlog.md` 与 ADR，标成以下四类之一：已有卡（写卡号）/ 新卡候选 / 按设计不做（写 ADR）/ 不值得做。

必查项：
- **英尺英寸：** RM3.4 写"`units ft` 输入已存在"而探针报告 `units ft` 被拒，在本机用最小平面核对后，在 RM9.8 下补一行证据。
- **墙体：** 混用外墙厚度、`walls from rooms` 遇到不连通楼面时的报错（一个错误连带 33 个；应直接说明是第二栋）。
- **图纸排版：** 两层一张图纸、引线标注、折断线、百叶屏风墙。

**证明：** 本目录内的文档改动；`docs:build` 不适用（不是 `docs/*.md` 页面），按本目录惯例提交。

**不许：** 本卡写代码或开新的语言形式（新形式要单独的卡与字节同一性定律）。

---

## 等待触发（不排期）

| 卡 | 触发 |
|---|---|
| IFC 下游包（archlang-3d M5） | 三个外部用户在格式之前先要它，或 Show HN 评论要它；先过 M5 spike 判据；RM7.2 先于它 |
| DS10–DS15 剖面立面 | N10 读过（记为受干扰即可；D3）。~~+ Show HN 之后~~（RM-D43 作废） |
| 3D 能力 M2+ | 由 `packages/archlang-3d` 的维护自定节奏（`../archlang-3d/` 计划已归档）；N10 读数的结论不挡它 |
| RM3.3 mask 导入 | 第二个独立样本 |
| NZ/AU profile、`lint --brief`、FLOORA、MCP 工具分组 | 阶段 F 候选；不等 Show HN（RM-D43），评论与读数只给没开工的重排 |
| 组件接缝单一所有者规则 | 两个 `place` 实例在共享边上对门洞冲突的真实用例 |
| 占用分类、喷淋、地理锚点等建筑标志 | 非住宅疏散或室内地图的外部请求；届时单独提所有者裁定（`README.md` §4，挂起） |
| 电气布置 overlay | 2027-01-31 前 Floorcraft 的电气功能显出用户反响（`README.md` §4） |
| PS0.16 升 E、无宿主门洞升 E | 2.0 major（与 V.5、V.6、6.7 同桶；RM-D16） |
| CRF9 预览图 CJK 字体 | parked（Worker 体积，ADR 0034 的已知缺口） |
| RM8.1 后的同类位置（楼梯梯段与平台、地面在门洞下的交界） | RM8.1 合并后仍有人指出 3D 的线或缝（`README.md` §5） |

残留卡（CRF3–CRF13、RM4.4、v1 波次 3 的既定项）的去向表在 `README.md` §7.1。
