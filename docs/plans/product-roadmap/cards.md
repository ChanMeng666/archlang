# 产品规划卡片（RM），v2

规则同 `../drawing-set/cards.md`：选依赖已完成、阶段已开放的第一张 `todo` 卡；同一阶段先做"线"以上的卡。状态词：`todo`、`doing`、`done`（裁成 id、标题、状态、PR、commit）、`blocked`（等 `README.md` §6 裁定）、`parked`。规模是 AI 协作日，±50%，是估算不是测量；没有估算的写"未估"。"模型"是建议执行者，主会话可改。每张卡都写明不许做什么。

**v2 的卡全部 `todo`，没有一张开工。** RM-D9…D16 是待所有者裁定的提议（`README.md` §6.1）；未裁之前，下面的阶段划分不生效，任何一张卡都不开工。

大多数 RM 卡是对 backlog / 各计划已有卡的**打包与排序**。打包卡 `done` 时，被打包的原卡同一 PR 裁掉，并在原处留一行"由 RMx.y 完成，PR #n"。`[语法]` 标记的卡新增语言形式：依赖 PS7.9（spec 腾空）先完成；遵守 `AGENTS.md` 硬规则与 `docs/agents/iron-laws.md`"每个新形式带字节恒等律"；`gen:*` 的闭集从源头派生。由 profile 数字驱动的新规则还依赖 RM1.6a（`README.md` 原则 10）。

卡内 `file:line` 和 id 指 `main@69fa5864`，动手前重新确认（v1 的报告 C 与 v2 的报告 D 都发现过记录漂移，见 RM0.1）。

## 0. 每张卡都跑的门禁

| 何时 | 命令 |
|---|---|
| 本地，永远 | `npm run check:quick`（文档另加 `npm run docs:build`），别的都不跑（`AGENTS.md` § How to work） |
| 只在 CI 跑 | `check`、`check:drift`、`typecheck:all`、e2e、`check:3d`、bench |
| 执行者 | 一个执行者、一张卡一个 worktree、一次一个重命令（`docs/agents/orchestration.md`）；只有纯文档卡可以由第二个执行者并行（EH-D1 的上限是两个） |
| 每个 PR | 从 `main` 建 worktree，分支 `feat/<card>-<slug>`（文档卡 `docs/<card>-<slug>`）；红队最多两轮；合并串行，按风险层级走 `docs/agents/commands.md` § Merging a PR |
| 规则卡（RM1.2a/b、RM1.7） | 另加：每条规则一对公开夹具（合法图零报、缺陷图必报）进 `test/defect-corpus/`；留出的一对只写进私有 `archlang-lab`，PR 只报它的计数；PR 里写出该规则用 `arch lint --json` 跑过全部 `examples/**` 的报出数 |
| 冻结期 11-24 → 12-01 | 只合 bug 修复、测量与文档；不发 minor |

**字节恒等载荷：** SVG + `describe()` + `lint()` + `compile().diagnostics`。
**消息规则：** lint 的 `message` 不含 id；id 只在 `hint`。条文出处的结构化字段（RM1.6a/b）只增不替：已有的 hint 文本不删，新字段不进 `lint()` 的序列化。
**核实等级：** 规则数字的出处取五值之一：`V`（读过官方原文）、`S-full`（读过全文第三方副本）、`S-secondary`（转述、摘要、讲义）、`M`（杂志）、`convention`（无文献的约定）。只有 `V` 和 `S-full` 能进新规则或公开夹具（drawing-set D13；`README.md` 原则 10）。
**证明方式：** 走 CLI 和 digest，不靠看图（`AGENTS.md`）。PNG 只作说明附件。

---

## 阶段 A · 立刻（11-10 → 11-12）：发布与对账

执行顺序以 `README.md` §3 的表为准：RM0.3 → RM0.1 → RM0.4 → RM0.5。RM0.4、RM0.5 中的纯文档部分可以由第二个执行者并行。

### RM0.3 · 发布 1.58.0 — `todo` · 1 日 · opus · 依赖 RM-D9（所有者）

`v*` tag 由所有者打（RM-D9）；发布链的其余步骤由代理端到端执行。

- nightly 前置已满足：run 42801157907（`main@69fa5864`，2026-11-10）里 `Deep fuzz (FC_SCALE=10)`（`.github/workflows/nightly.yml`；11-09 两次红在 `test/plan-json-malformed.test.ts`，由 #664 修复）与四个 `Test …` job 全部 success；#497 已于 2026-11-10T11:07Z 关闭。发布前按 release-check 第 5 项再读一次最新的 nightly；若它又红，停下交所有者。
- 步骤按 `.claude/commands/release-check.md` 全走：先确认真实的最新版本（第 1 项）；bump `packages/mcp`（`packages/mcp/server.json` 两处 `version` 同步）与 `packages/archlang-3d`（`prove:pack`、`check:3d` 是重命令，在 CI 跑）；`winders` 是新关键字，`editors/vscode` 自 v1.57.0 改了 6 个文件，重打 `.vsix` 并上传、派发 `publish-openvsx.yml`；OpenAI 插件 ZIP、ClawHub、Docker Catalog 的 `source.commit`。
- `docs/whats-new.md` 现在的标题是 "What's new in 1.44 to 1.55"：补 1.56、1.57、1.58（源文件；`docs-site/` 的副本由 `sync-docs.mjs` 生成）。
- CHANGELOG：把 `arch impact` 遇到无法解析的方案退出 2（#648，`[Unreleased]` 已标 breaking）放在 1.58.0 段落的显眼处。

证明：`npm view @chanmeng666/archlang version` 为 1.58.0，`gh release view v1.58.0` 存在；`npx -y @chanmeng666/archlang@1.58.0 compile` 一份带 `winders` 的最小平面零 E；`@chanmeng666/archlang-mcp` 与 `archlang-3d` 的新版本 `npm view` 可见；Open VSX API 返回新的扩展版本；release-check 第 2 项的版本一致性全过。

不许：代理自己打 tag；收窄 `prepublishOnly`；跳过 release-check 的任何一项；在发布说明里写"first/only"、合规或任何 IFC 承诺；把下载量写成 traction。

### RM0.1 · 记录修正（扩大） — `todo` · 1 日 · sonnet · 依赖无；"单一队列"一项依赖 RM-D15（所有者）

v1 的条目（已做的标出）：
- `../drawing-set/cards.md`：DS1、DS2 改 `done`，指向 CR1/CR2b 的 PR。
- `../preview-and-remodel/cards.md`：D1 改 `done`，指向 U.13 的 commit。
- `../plan-soundness/`：PS0.2 裁掉（1.52 已带弧）。
- `docs/backlog.md`：U.17 去掉会漂移的码数，改为指向 `ERROR_CATALOG`；"N.1" 双义处改名。
- `docs/whats-new.md` 补版本：并入 RM0.3（补到 1.58）。`playground/README.md` profile 数改为与 `LINT_PROFILES` 一致的写法（不写数字）。
- #497 nightly 红的分诊：不再需要。#664 修复了它，run 42801157907 全绿，#497 已于 2026-11-10 关闭。
- `docs/plans/README.md` 加本计划一行：已由 #540 完成。
- growth 仓库 `category.md` §5、`master-plan.md` §1 刷新稿：已由 growth PR #56 完成。

v2 加上：
- `../drawing-set/cards.md`：DS0 改 `done`（#451）。
- PS0.16、PS0.20、PS0.21（`../plan-soundness/cards.md`）与 backlog 的 U.4、U.7：标为已裁（RM-D6），指向 RM1.4、RM3.1、RM4.2。
- backlog O.10：条目写的 #119、#121 已于 2026-10-19 关闭，后继的 #206–#208 也已于 2026-11-09 关闭；核对是否还有待裁的主版本升级（#603 另由所有者定），没有就关闭 O.10；5.2（CR8 #493 已交付直角多边形 `void`，只剩非直角）；H.1（`test/lint-messages-id-free.test.ts` 已守住，核对后关闭）。
- `../archlang-3d/amendment-v0.7.md` 的 "Proposed" 改为 superseded（已被交付的包取代）。
- `../plan-soundness/handoff.md` 的 spec 余量数字（写的是 29,977 / 23；2026-11-10 实测 29,856，余量按 `< 30_000` 算是 143）。
- 2.0 桶（V.5、V.6、6.7、PS0.16 升 E、`origin/feat/remove-view`）在 backlog 里写明"不在任何排期，2.0 时一起做"。
- CRF13：`src/ir.ts` 已拆分（#618），重新核对那条注释，过时则关。
- **单一队列的落地**（RM-D15 获批后）：`docs/plans/README.md` 状态列按 `README.md` §7 改；各计划 handoff 顶部加一行指向 `../product-roadmap/handoff.md`。
证明：每处改动在 PR 里列出它依据的 PR 号或 commit；`docs:build` 绿。

不许：改任何代码；改 `AGENTS.md`；碰 `/3d` 页（public-surfaces 的面）；碰 `/axonometric`（它不在导航里，页面留到 2.0）；RM-D15 未获批时改其他计划的状态列。

### RM0.4 · 欠外部的跟进 — `todo` · 0.5 日 · sonnet · 依赖 RM0.3；发出前所有者过目

主会话起草，英文、具体；所有者过目后才发（对外动作）。
- gerontec（#544，相关 #532、#533）：1.58 带上了 `winders`；#544 的两个事实排在哪里（RM6.1，批次 D 首位，起点 2027-01-10，设计稿在冻结期）；欢迎他做 ST.2（折线行走线画成弧）。
- bobsch-io（Daniel）：本卡不给他发任何东西。growth `AGENTS.md` 第 44 行的 Daniel 规则："The founder holds the follow-up question; do not post it or plan on its answer." 要不要告诉他 1.54–1.58 的交付、问不问、怎么问，都归所有者（列在 `handoff.md` 的所有者待办）。
- #405：补记 L 形洞口栏杆已在 1.55.0 交付（issue 里仍写 "left open"）。
- docs：加"建在 ArchLang 上的工具"一行，只列作者已同意的 `gerontec/archlang-section`（他 2026-11-06 在 #532 同意，并给了描述）。放哪一页按 ADR 0031 的下游读者口径定。

证明：每条回复的链接记进 `handoff.md`；docs 一行 `docs:build` 绿。

不许：向 bobsch-io 提问；未经所有者要求起草给他的消息（Daniel 规则）；承诺 IFC；承诺剖面进核心（核心不画高度）；承诺日期以外的范围；列出未同意的仓库（`AI-Building-Floor-Planner-SaaS` 尚无对话，不列）；在回复里写"first/only"或合规。

### RM0.5 · 依赖与悬空状态 — `todo` · 0.5 日 · sonnet · 依赖无；#603、`origin/ChanMeng666-patch-1` 依赖所有者

- 合 #675（codeql-action，workflow 属高风险层）、#677、#678：`@dependabot rebase` 到新 `main`，CI 绿后按层级合并（`docs/agents/iron-laws.md` 的 Dependabot 规则）。
- #604：先修 biome 2.6 的 lint 差异，再合。
- #676（`three` 0.187）：单独评估 3D 的帧哈希与 GLB 字节、许可白名单与 THIRD_PARTY_NOTICES；不与别的升级同 PR。
- #603（`@modelcontextprotocol/ext-apps` 主版本）：等所有者。
- 清掉 13 个已合并 PR 的远程分支、`refs/remotes/pr308` 和过期的本地分支（例如 `refactor/exhaustive-element-kinds`）；保留 `feat/remove-view`。
- `origin/ChanMeng666-patch-1`（所有者网页上改的影片链接，没有 PR）：等所有者一句话。

证明：每个 PR 合并时钉的完整 SHA；分支清理前后的 `git branch -r` 计数。

不许：合并主版本升级；为了让 #676 绿而重新钉帧哈希或 GLB digest（字节移动要逐项解释）；删 `feat/remove-view`。

---

## 阶段 B · 冻结前（11-13 → 约 11-21 切 1.59.0）：不加语法

执行顺序以 `README.md` §3 的表为准：RM1.3a → RM5.1 → RM1.4 → 发布 1.59.0，线（8 日 = 3 + 2 + 2 + 发布 1，9 个日历日）以下 RM2.1 → RM1.6a → PS7.9。RM0.2 是纯文档卡，也在线上，但由第二个（只做文档的）执行者并行，不计入 8 日。切点前合不完的进阶段 D，不挤进冻结期。

### RM1.3a · 可达性盲点第一批 — `todo` · 3 日 · opus · 依赖无

PS0.3（上层经楼梯 `reachable:false`）、U.1（阳台门算到达）、6.11（双开门读成两窄门）。这三条都坐在 README "computed, not estimated" 的声明下面。

证明：三个最小夹具上 `describe().access`/`circulation` 的前后对照写进 PR；语料里其他图的 `describe()` 变化逐条列出并解释（这是分析修正，允许移动 describe，但要列全）。

不许：改 `W_PATH_TOO_NARROW` 的阈值（PS0.8 等复测）。

### RM5.1 · MCP 能力摘要 — `todo` · 2 日 · opus · 依赖无

CRF10：`INSTRUCTIONS` 879/900。做法：`INSTRUCTIONS` 保留一句能力句（客户端很少主动读资源），工具清单与"能做/不能做/编辑循环/导出清单"移入新资源 `archlang://capabilities`。PS5.3a：`validate` 返回 `next`（`NEXT_TIERS` 同序）。**v2 加：** 能力资源里另加两行，分别指向 `docs/from-an-image.md`（读图的工作流）与 `docs/edit-one-room.md`（改一个房间）。一次 `packages/mcp` 版本 bump，搭 1.59.0 发布。

证明：`INSTRUCTIONS.length` 上限测试不变；资源内容由 `src/manifest.ts`（CLI 半边）、`packages/mcp/src/tools.ts`（工具半边）、`EXPORT_FORMATS` 生成，带 drift 测试。

不许：在摘要里写"设计/布置/家具"、IFC、任何 3D 能力承诺（展示用词按 `../public-surfaces/3d.md` §2 的固定句）；手写清单；在仓库根加 `.mcp.json`（高风险层的根配置，所有者待定，默认不做）。

### RM1.4 · 静默接受改出声（只加 W） — `todo` · 2 日 · opus · 依赖无

- U.2 裸米值静默编译 → 一条 W（带它猜成的毫米值）。**不升 E**：会让今天能编译的图在 Show HN 前变红。
- U.3 家具类别拼错过 `--strict` → 走 `W_ALIAS_MATCH` 同路，`--strict` 下升级。
- PS0.25 与 6.10（尺寸和门位网格吸附无声）→ 一条 W，带吸附前后值；同一 PR 裁两条。
- PS0.16（`set door(width: W)` 静默字串化）→ W 现在，消息给出被当成字串的值；2.0 升 E，记进 backlog 的 2.0 桶（RM-D6）。
- U.4（家具 `label` 不画）：**不加诊断**（RM-D6）。label 是数据不是图：本卡只确认 `describe().furniture[].label` 带出它（缺则补），`docs/furniture.md` 写一句"符号不画 label，label 进 describe 与 schedule"；`schedule fixtures` 在 RM4.2。

证明：每条一个最小 `.arch` 夹具 + `arch explain` 条目；字节恒等律（不触发的图不变）。

不许：改吸附行为本身（M.9/PS0.26 是所有者的）；改 `fmt` 精度（M.8）；碰 PS0.27 词法（新形式，RM1.5b）。

### RM0.2 · "编译器说不、并说为什么" — `todo` · 1.5 日（第二个执行者，不计入线） · sonnet · 依赖无 · 纯文档

新文档页 `docs/says-no.md`（名字可改，进 `sync-docs.mjs` 的 PAGES 和 sidebar）：6–8 个最小 `.arch`，每个配 `arch lint --json` 的真实输出和一句人话解释。候选：门扇撞家具（`W_SWING_OBSTRUCTED`）、房间不可达（`W_ROOM_UNREACHABLE`）、卧室无窗、车库过窄、家具进墙、被 `keep` 锁住的元素被改（`E_LOCKED_ELEMENT_CHANGED`）、`impact --lock` 报出"什么动了"。fence 用 `arch static`（错误演示不能活编译）。X9 的 Show HN 回答稿引用这页。

**v2 加三项：**
1. `examples/studio.arch` 头注释改正（#683）：去掉无条件的 "Architecturally sound (passes `arch lint`)"；改正"every room opens off a central hall"（前门进客厅，客厅经洞口到门厅，卧室和卫生间挂在门厅上）；写明"默认 profile 下 lint 无报；`uk-residential-advisory` 下报一条 `W_ROOM_TOO_SMALL`"。内房（AD B 2.11）判定交给 RM1.2b 第 1 条。
2. 一张"过默认检查不等于过任何辖区"的对照表：只列仓库 profile（`LINT_PROFILES`）里已有的数，例如楼梯级高；不从调研包的目录搬数（`README.md` §1.1b 第 5 条）。
3. 一段 `validate --strict`：它把警告也当失败（退出码 2），适合放进 CI。写成"把警告当失败"，不写成"编译器拒绝"。

证明：`docs:build` 绿；每段输出由脚本从示例重新生成（放 `scripts/` 或测试里比对，不手抄）；`studio.arch` 只改注释，默认 digest 不动（注释不进 `describe`，按 `.claude/rules/examples.md` 只移动 permalink），PR 里附 `arch lint examples/studio.arch --profile uk-residential-advisory --json` 的输出。

不许：出现"first/only/唯一"；写"合规"或"passes"某辖区；提模型名或分数；对照表里出现仓库 profile 以外的数。

### 发布 1.59.0 · 约 11-21 · 1 日

线上合并项切一个 minor（tag 归所有者），含 RM5.1 的 `packages/mcp` bump；步骤同 RM0.3，按 `.claude/commands/release-check.md`。切点后合并的 minor 内容等 12-02。

### ── 线（8 日）──

### RM2.1 · 编辑模型的剩余可见性 — `todo` · 1 日 · sonnet · 依赖无

CR7 ② 已把"只改一个房间"放进 README（`README.md:32,75,82`）、`docs/edit-one-room.md`、ChatGPT 起始提示；`packages/mcp/README.md:68-71` 已写 `source_hash` 与 `--expected-hash` 的关系。剩余：
- CRF11：playground 起手"改一个房间"（一对源，一个 knob）。
- `skills/archlang/SKILL.md` "The loop"：编辑路径把 `impact --lock` 提到 `validate` 之后第一步；四个任务技能同步。

证明：`npm run e2e:playground` 在 CI 绿；技能文本的 drift 测试绿。

不许：加 `keep locked` 语法（B2 parked）；改 README（PS-D11 的 3D 段由 public-surfaces 管）。

### RM1.6a · 出处成为数据（#680 前半） — `todo` · 2.5 日 · opus · 依赖无（schema 的 `$id` 等 CR11a）

- 一张按 `profile + key` 索引的平行表，记每个规则数字的 document、clause、edition、核实等级（§0 的五值）。默认规则集（`DEFAULT_RULESET`）的数也在内，不只 profile 的数（例如 WC 1.1 m²、卫浴 2.0 m² 在默认规则集里）。没有文献的默认值（如 `wallGapMm` 的 100）标 `convention`，不硬找出处。
- `LINT_PROFILES`、`DEFAULT_RULESET` 是公开导出（`src/index.ts:358`），形状不变：出处是平行表，不改它们的字段。
- `lint --rules [--profile X] --json`：导出生效规则集（每个键的值与出处）。按 `.claude/commands/` 的 `new-cli-flag` 流程注册。schema 标为 `$id` 未定的草案，等 CR11a。
- 现有源码注释里的标签（`[V]`、`[S]`、`[M]`）逐条映射到五值；第三方讲义（如 `us-residential-advisory` 的 jurisdiction handouts）标 `S-secondary`，除非重读了全文副本。
- 调研包的规则目录不直接搬：勘误（1219 mm 门扇的 IBC 版本、WC/卫浴下限所在的规则集、GB 50352 175 mm 的适用范围、采光筛查的假设玻璃高度）另记在 growth 仓库 `research/cross-report-corrections.md`（另一仓库，本卡的 PR 改不到）。

证明：不用 `--rules` 时，语料上 SVG + `describe()` + `lint()` 的 digest 一字不变；一条测试从源头（规则集对象）派生键表，断言每个键在平行表里有一行；`arch lint --rules --profile uk-residential-advisory --json` 的输出贴进 PR。

不许：改 `lint()` 的返回值；改 `LINT_PROFILES`、`DEFAULT_RULESET` 的形状；删已有的 hint 文本；把 `S-secondary` 写成 `S-full`；在 `message` 里引条文号；自己定 `$id`。

### PS7.9 · spec 腾空 — 见 `../plan-soundness/cards.md`，`todo` · 1.5 日 · opus · 依赖无

本计划把它提为所有 `[语法]` 卡的前置。今天 `spec.llm.md` 是 29,856 UTF-16 单位，测试是 `< 30_000`（`test/llm-spec-drift.test.ts`），可用余量 143。目标按后面排到的 `[语法]` 形式重算：RM6.1 两个（剖切符号、楼板 datum）、MF-D11 的净高子句一个、RM1.2b 的 `keep site` 与可开启值两个，共五个；线下的 RM4.2 `schedule fixtures`、RM3.4 另计。

不许：提高上限而不先削掉可证明的重复（铁律）；删掉 spec 里仍在用的事实。

线下的卡在 1.59.0 切点前合并的，随 1.59.0 发布；切点后合并的等 12-02。

---

## 阶段 C · 冻结期（11-24 → 12-01）：只修 bug，加测量与文档

不合任何功能代码。

### RM1.1a · 首次接触复测（第一次） — `todo` · 1 日 · opus · 依赖 1.59.0 发布（兜底见下）

纯测量，不改代码。按 plan-soundness D7/D15 的六份 brief 与冻结提示，在 1.59.0 上跑一次；记录"N 个缺陷、最终 lint 报出 k 个"。**v2：** 结果记在本计划 `handoff.md` 的测量表；`../plan-soundness/handoff.md` §4 只留一行指针。这个数字是 CR10 发布说明引用的覆盖数字（RM-D3 的措辞），也是 RM7.3 的自检项。

兜底：1.59.0 到 2026-11-23 还没打 tag，就在冻结时 `main` 的提交上量，把完整 SHA 记进测量表；CR10 的发布说明引这个 SHA 和第一个包含它的版本。

不许：改提示；改 brief；把数字叫 benchmark 或与模型分数并列；在 1.59.0 以外的版本上量，除非是上面的兜底并在测量表里写明 SHA。

### X9 · Show HN 回答稿 — 见 `../public-surfaces/3d.md`

本计划只加一项：growth 仓库里过期的 Show HN 物料另开 PR（`marketing/launches/show-hn/anticipated-comments.md` 还写 "no winders"，`marketing/launches/runbook-2026-09.md` 对 "It does 3D now." 还答 "It does not"，日期还是 09-16，`marketing/launches/show-hn/draft.md` 还写 "Not scheduled"）。回答稿只写 1.59.0 里已发布的事实。

### RM5.3 · 代理入门一条 URL — `todo` · 未估（报告 B 引来源估 2–4 日） · sonnet · 依赖 RM5.1

它含一个生成器和一条 drift 测试，还要改 `sync-docs.mjs` 的 PAGES，所以不是纯文档卡：由主执行者做，不由第二个执行者并行；冻结期只合 bug 修复、测量与文档，合不了就顺延到阶段 D。

docs 站一页（名字可改，进 `sync-docs.mjs` 的 PAGES）：一个代理从这一个 URL 出发就能装好、写一张平面、编译、lint。内容由 `skills/archlang/SKILL.md` 与 `llms-install.md` 同步生成（生成器从这两个源派生，不重抄），带 drift 测试。

证明：全新会话只给这个 URL，能编译并 lint 一张 12×8 的平面（记录会话的输入与 `arch lint --json` 的输出，放 PR 说明，不进测试）；drift 测试绿；`docs:build` 绿。

不许：手抄 SKILL 或安装说明；页里出现"first/only"、合规、IFC 或 3D 能力承诺；加 `.mcp.json`；示例 fence 用活编译的 `arch`（片段用 `arch static`）；示例里出现新的 fixture 家族名（`.claude/rules/docs-prose.md`）。

### 冻结期设计稿（四份，纯文档，可由第二个执行者并行）

放 `design/`（本目录下，冻结期才建）。每份是对应卡开工前要读的设计，不是实现：
- `schema-policy.md` → CR11a：`$id` 与变更、弃用政策草案。
- `walls-facts.md` → RM7.2：字段按 `_derivedWalls` 的真实形状（`points[]`、`closed`、`between` 或 `ring`、厚度、类别、状态，`src/elements/walls-from-rooms.ts`）；按墙 `id`（即 piece 名）与 `heights.walls[]`（`src/describe.ts` 的 `{ id, height }`）、`describe --facts quantities`（`src/analyze/quantities.ts` 按 `id`）对齐；已有的 `describe().derived_walls[].name` 是 spec 名，CR8 切分后一个 spec 对应多个 piece，设计稿要交代新事实与默认 `derived_walls` 的关系；写明"段的粒度在 CRF1 之后才稳定"；新事实进 `engineProbeParts`（`test/helpers/byte-identity-payload.ts`）；消费者一栏照实写。
- `slab-and-section.md` → RM6.1：DS11 并入时的四件事（拼写取 DS11 的 `section A (x,y)->(x,y)` 还是 #544 的 `from … to …`；进 `describe` 主体还是 opt-in 事实；多层平面上剖切符号画在哪一页；`section` 写进日后 DS5 的 `level a..b` 时 id 怎么不重复，定不下来就保留对 DS5 的依赖）；MF-D11 的提案（`README.md` §6.1 的倾向）供所有者裁定。
- `plan-json-scope.md` → RM3.1：范围表，逐个顶层语句对 `src/plan-json*`；列出 J16（每扇窗写 `sill`）与 PS0.18（Hall 往返成 `uses entry`，待所有者裁定，未裁则标 `dropped`）。

### RM1.8 · 读 GB 55038-2025 原文（#684） — `todo` · 未估 · sonnet · 依赖无

读 GB 55038-2025 的官方原文（drawing-set D13：先取官方免费文本，取不到再请所有者手动打开；第三方镜像只能当 `S-full` 或 `S-secondary`）。回答 #684：它是否取代 GB 50096-2011 5.4.2 的 WC 1.1 m²、卫浴 2.0 m²；4.1.1、4.1.4 的下限与 `cn-residential-advisory` 现有值的关系。结论写回 #684，并按 §0 的五值标出读到的等级。注意这两个数在 `DEFAULT_RULESET` 里，动它们影响每张图，不只 cn。

证明：#684 下的评论引条文号、版本与读到的文本来源；本卡不改代码。

不许：在本卡里改任何规则数字（动默认规则集的两个数另开卡，带语料扫描与字节变化说明）；把镜像标成 `V`；写"合规"。

---

## 阶段 D · 批次 C′（12-02 → 12-16；1.60.0 约 12-21 切）：契约、出处、公开检查集、无损

执行顺序以 `README.md` §3 的表为准：CR11a → RM1.6a（若阶段 B 没做完）→ RM1.6b → CR10 → RM3.1 前半 → 发布 1.60.0，线（12–14.5 日 = 11–13.5 + 发布 1）以下 RM3.1 后半 → PS7.9（若没做完）→ CR11b + RM3.2 → RM4.3。CR9、CR12、RM2.2 在阶段 E 线下。1.60.0 避开 Product Hunt 那一周。RM3.1 的拆分只在 RM-D10 获批后生效；未获批时 RM-D4 照旧，RM3.1 按 v1 的整张卡排。

### CR11a · schema `$id` 与变更政策 — `todo` · 1 日 · sonnet · 依赖冻结期的 `schema-policy.md`

CR11（`../checker-reach/README.md` §3）的政策那一半：schema 用带版本的 `$id`；`GOVERNANCE.md` 写清 schema 与语言形式的变更和弃用政策。排在任何新 schema 发布之前（RM1.6a 的规则集 schema、RM1.6b 的 `rule` 字段、RM3.1 的 Plan JSON 新键）。

证明：已发布的 schema 文件都带 `$id`，一条测试从 schema 目录派生清单并断言；`docs:build` 绿。

不许：改现有 schema 的字段；在这张卡里发 `lang-1.0`（那是 CR11b）。

### RM1.6b · 诊断带结构化 `rule`（#680 后半） — `todo` · 2 日 · opus · 依赖 RM1.6a、CR11a

诊断的 JSON 输出带结构化 `rule`（profile、key、value、units、document、clause、edition、核实等级），只加在由规则数字驱动的诊断上。

- **载体：** 同一个码可能来自几个键（`W_ROOM_TOO_SMALL` 可能出自 `minRoomAreaM2`、`minRoomAreaByUseM2[use]` 或 `minDoubleBedroomAreaM2`，由规则内部当场选），所以不能按码查表。规则推入诊断时附一个不进 `JSON.stringify` 的引用（Symbol 键或 WeakMap）；`diagnosticToJson(source, d)`（`src/diagnostic-json.ts`，公开导出）追加一个可选参数读它，原有两个参数的行为不变。
- `lint(src)` 的序列化一字不变（字节恒等律对它取 digest）；同步改 `test/lint-summary.test.ts` 的断言（它要求 CLI 的 `diagnostics` 与 `lint(src).map((d) => diagnosticToJson(src, d))` 逐字节相等）。
- 已有的 hint 文本（例如默认 WC/卫浴下限的 hint 里的 GB 50096 引文）不删，结构化字段只增不替。
- **跨进程：** Symbol 键或 WeakMap 的引用过不了 `structuredClone` 与 `postMessage`。所以解析成 JSON 必须在跑 `lint()` 的那一侧完成；在 playground 里就是编译 worker 内部、发消息之前。任何先拷贝诊断再交给 `diagnosticToJson` 的路径都拿不到 `rule`。
- **哪些调用方打开这个可选参数：** CLI 的 `lint --json` 与 `validate --json`（`src/cli/commands-analyze.ts`）；MCP 的 `lint` 与 `validate` 工具（`packages/mcp/src/tools.ts`；托管服务器经 `packages/mcp-worker/src/server.ts` 注册同一组工具；会改 MCP 输出，所以要搭一次 `packages/mcp` 的版本 bump）；CR10 的 `POST /check`（将建在 `packages/mcp-worker`，今天还没有）。`packages/mcp-worker/src/app.ts` 里现有的两处（错误信封与短链接的编译错误）不打开。**不许打开的：** `dataset/generate.ts`（dataset 金丝雀永不重新生成）与 `eval/l2.ts`（公开 eval 语料）。playground（`playground/src/actions.ts`、`playground/src/checks-panel.ts`、`playground/worker/app.ts`）与 web component（`packages/web-component/src/arch-plan.ts`）默认不打开，除非本卡的 PR 论证要打开它，并按上一条在 worker 一侧序列化。其余调用方（`src/cli/` 的其他命令、`src/lsp.ts` 等）不打开。

证明：语料上 SVG + `describe()` + `lint()` 的 digest 不变；反向测试：由 `minDoubleBedroomAreaM2` 触发的 `W_ROOM_TOO_SMALL`，`rule.key` 必须是这个键，不是按码查表得到的 `minRoomAreaByUseM2`；不由规则数字驱动的诊断没有 `rule`；`arch lint examples/two-bed.arch --profile uk-residential-advisory --json` 的前后对照贴进 PR。

不许：改 `lint(src)` 的返回值或它的 `JSON.stringify` 结果；改 `diagnosticToJson` 现有参数的含义；在 `dataset/generate.ts` 或 `eval/l2.ts` 里打开新参数；改 MCP 输出却不 bump `packages/mcp`；删任何已有 hint 文本；在 `message` 里引条文号或 id；给不由数字驱动的诊断编出处。

### CR10 · 公开检查集 + `POST /check` — `todo` · 5 日 · opus · 依赖 RM1.1a、RM1.6a

`../checker-reach/README.md` §3：50 个夹具，每个都写明必须产生的诊断，按通过/失败判定；托管 `POST /check`。用词只叫"公开检查集"（A2）。v1 的追加：发布说明附 RM1.1a 的数字和"lint 跳过了什么"（无解析、无 `site`、无 `level`、无 `height`）；一个最小 GitHub Action 示例（`npx archlang lint --json` 跑夹具，失败即红）。

**v2 加：** 一列跨辖区夹具，只用核实等级 `V` 与 `S-full` 的规则，profile 限定，不进默认规则。`us-residential-advisory` 现有的数来自讲义转述（`S-secondary`），重读原文之前不进这一列。

RM1.1a 若走了兜底（量的是冻结时 `main` 的 SHA），发布说明引这个 SHA 和第一个包含它的版本。

证明：每个夹具的期望诊断由测试判定；跨辖区一列的每条规则在 RM1.6a 的平行表里是 `V` 或 `S-full`（测试从表派生）；`POST /check` 与 CLI 对同一输入的 `lint --json` 一致。

不许：叫 benchmark 或 leaderboard；与模型分数并列；把覆盖数字放进标题、README 徽章、首页、包描述（RM-D3）；跨辖区一列用 `S-secondary`、`M`、`convention` 的数；把跨辖区规则放进默认规则集。

### RM3.1 前半 · Plan JSON 无损：范围表、往返律、`outdoor` 与 `fence` — `todo` · 3 日 · opus · 依赖 CR11a、冻结期的 `plan-json-scope.md` · **批次 C′ 线上**

v1 的 RM3.1 拆成两半（RM-D10，待所有者）。前半：
- 范围表：按设计稿列出 Plan JSON **声称承载**的形式（逐个顶层语句对 `src/plan-json*`），含 J16（每扇窗写 `sill`）与 PS0.18（待所有者裁定，未裁则标 `dropped`）。
- 往返律：新增 `test/plan-json-roundtrip-law.test.ts`：范围内的每个示例 `-f json` → `--from-json` → SVG + `describe()` + `lint()` 字节恒等；范围外的形式在 Plan JSON 里显式标 `dropped`。`place` 在后半做完之前标 `dropped`。
- PS0.21：`outdoor`、`fence` 进 Plan JSON（可选新键，不破坏）；schema 变更按 CR11a 的政策记录。

证明：往返律测试；范围表进 PR 说明。这张表与这条法则就是 CR12 conformance 语料的第一条。

不许：给 Plan JSON 加任何 3D 字段或只出不进的字段；自己定 `$id` 版本；为了绿而把形式移出范围表却不标 `dropped`。

### 发布 1.60.0 · 约 12-21 · 1 日

线上合并项切一个 minor（tag 归所有者），步骤同 RM0.3；避开 Product Hunt 那一周。

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

---

## 阶段 E · 波次 2′（12-17 → 2027-01-09；1.61.0 约 01-05 切）：深度

先按 Show HN 评论重排（`README.md` §5）。RM1.1b 量的工作必须在 1.61.0 里，所以有效窗口是 12-17 → 约 01-05，19 个日历日，跨圣诞与新年。默认顺序：RM3.1 后半（若没做完）→ PS7.9（若没做完）→ RM1.2a → 发布 1.61.0 → RM1.1b（01-06 → 01-08），线（9.5 日 = 3 + 1.5 + 3 + 1 + 1，前两项只在没做完时计）以下 CRF1 → RM7.2（线下首位）→ RM4.1 → RM1.2b → MF1 → RM1.7 → 其余。RM7.3 在读数日做，不计入线。

### RM1.2a · 行家规则，不加语法的三条 — `todo` · 3 日 · opus · 依赖 RM1.3a；第 2 条依赖 RM1.6a

每条一个 PR，可独立合并或拒绝：

1. **指北针缺失**：不是默认 W（没画指北针的图是合法的）。`finish sheet` 已处理 `north`（`src/finish.ts`）；补 `validate --stage drafting` 的一条提示"图纸没有指北针，`finish` 可补"。
2. **级高对层高**（ST.1）：推算级高 = 层高 ÷（画出的踏步数 + 梯段数），超出有出处的数值报 W（出处进 RM1.6a 的平行表，等级 `V` 或 `S-full`；来源也写在 `hint`）；无 `height` 跳过并计入"跳过了什么"。ST.1 已点名四个示例会命中（two-storey、townhouse、garden-house、hillside-villa）：同一 PR 修示例并在 PR 里列出每个示例的 digest 变化。
3. **"标签无实物"**：用 Opus 测试的"desk nook"案例做夹具复核 `W_ROOM_MISSING_DEFINING`；已覆盖则只加夹具，不加码。

CRF5（楼梯井同时报两条警告）若在同一 PR 碰到，一并去重。

证明：§0 规则卡门禁。

不许：第 1 条加默认 W；第 2 条加 `risers` 之类新语法；在 `message` 里引条文号；第 2 条用 `S-secondary` 的数。

### 发布 1.61.0 · 约 01-05 · 1 日

线上合并项切一个 minor（tag 归所有者），步骤同 RM0.3。RM1.1b 量的就是它。

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

赶得上就进 1.61.0，否则进下一个 minor。

opt-in 的 `describe --facts walls`（加进 `DESCRIBE_FACTS`，`src/describe.ts`）：输出 `walls from rooms` 推导的墙段。字段按 `_derivedWalls` 的真实形状：`points[]`、`closed`、`between` 或 `ring`（外圈只带 `ring`）、厚度、类别、状态；按墙 `id`（即 piece 名）与 `heights.walls[]`、`describe --facts quantities` 对齐。已有的 `describe().derived_walls[].name` 是 spec 名，一个 spec 对应多个 piece，两者不是一一对应；新事实与默认 `derived_walls` 的关系按设计稿写明。算第 7 轨（RM-D12，待所有者；这样归类会让它不受 RM-D2 收缩的约束）。

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

### RM1.2b · 行家规则，有效性与声明 — `todo` · 9+ 日 · opus · 依赖 RM1.2a、PS7.9、RM1.6a；`[语法]` 第 3、4 条

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

### RM1.3b · 可达性盲点第二批 — `todo` · 4 日 · opus · 依赖 RM1.3a

4.5（草坪、水面当可走 → `outdoor` 地面种类决定可走性）、M.4（竖井到达层的叠加与行进方向）、U.22/PS0.15（`describe()` 步数预算与净面积项的二次复杂度）、PS0.6（`suggest` 经卧室给房间连门）。

证明：预算是计数不是时间（`E_STEP_LIMIT` 同路）；`describe()` 变化逐图列出。

不许：加时间限制。

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

U.15 `arch doctor`（Node 版本、可选依赖、字体、`arch` 别名 bin 的 U.19）、U.16 第二套起手模板（`arch new --template remodel`，与 CRF11 的起手同源）、U.8 `compile --json=brief` 可选瘦身（**不改默认**：`compile --json` 的形状是代理契约，ADR 0015）、VA.4 `--theme`。同 PR 在 `docs/cli-reference.md` 顶部加一段"动词边界"（`validate` 对 `lint`、`describe` 对 `takeoff`），把 28 个动词按阶段分组列出；不设动词数上限。MCP 工具分组在阶段 F。

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

---

## 阶段 F · 批次 D（2027-01-10 起）：按证据重排

### RM6.1 · 剖面所需的两个事实 — `todo` · 5 日 · opus · 依赖 PS7.9、MF-D11（所有者）、冻结期的 `slab-and-section.md` · `[语法]` · **批次 D 首位（#532 触发）**

MF-D1（`../math-foundations/README.md` §6.1 第 3 条）要求 MF-D11 在本卡的 PR 里解决，所以没有所有者对 MF-D11 的裁定，本卡不合并。2027-01-10 时 MF-D11 还没裁，本卡标 `blocked`，阶段 F 从其余候选开始。本卡不改 MF-D1。

外部用户（#532，`gerontec/archlang-section`）只用 `describe --json` 与 `compile -f json` 画出了剖面，缺两件事，都是 `describe()` 的数据，不是核心的绘图：

1. **平面剖切符号**（DS11 提前）：`section A from (700, 0) to (700, 9000) look east`（拼写按设计稿定：DS11 的写法与 #544 的不同）。平面图元素（`src/elements/section.ts`，注册在 `defs.ts`，带 `drawCost`/`bounds()`/`measures()`）：画剖切线两端的符号与编号，这是 GB/T 50001 和 ISO 128 都有的平面图要素，核心允许。`describe().sections` 带出线段与观察方向，或按设计稿改为 opt-in 事实。只允许轴对齐（与 #532 的工具一致；斜切等第二个用例）。多层平面上画在哪一页、与 DS5 的 id 是否冲突，按设计稿。
2. **楼板构造 datum**（2026-11-10 MF-D1 已裁定采纳。另需给出顶层和单层的天花来源 MF-D11，见 `../math-foundations/` §6.1）：在 `level` 上一个由 `gen:*` 闭集定的子句（候选 `slab <mm>`，或 `floor { structure <mm> finish <mm> }`），**核心不画它**（铁律：高度不画），只进 `describe().heights`（以及 Plan JSON 已承载的高度字段，MF-D1 第 1 条），使第 n 层净高 = 第 n 层的 `height` − 第 n+1 层的楼板可派生。Plan JSON：楼板子句进 Plan JSON，或在 RM3.1 的范围表里标 `dropped`。没写时按 MF-D1 第 2 条：全图一层楼板都没写时，`describe()` 一字不变，不输出板厚和净高，也不加跳过说明；只有至少一层写了楼板时，没写的层才在"跳过了什么"里注明（ADR 0027）。
3. 净高子句若获 MF-D11 裁定，是第三个 `[语法]` 形式，带自己的字节恒等律；作者写的净高与推算值不一致时有一条诊断。顶层与单层的天花按 MF-D11 的裁定做。

证明：每个形式各自的字节恒等律（一层楼板都没写的图，SVG、`describe()`、`lint()` 三处都逐字节不变，MF-D1 第 2 条）；`describe()` 变化只在用了新子句的图上；`archlang-section` 的示例 `haus_winders.arch` 加剖切线后 `describe --json` 能喂给它（在 PR 里跑一次该工具作说明，不进测试）。

不许：在核心画任何高度或剖面；把剖面放进 `describe()` 以外的核心输出；碰 DS13（它在 `archlang-3d`，按 D3 等 Show HN 之后）；在 MF-D11 未裁时合并本卡；给没写楼板的图加跳过说明；用默认值去猜板厚。

### RM3.3 · mask 导入 — `todo` · 3 日 · opus · **触发：第二个独立来源带样本**

`docs/import.md` 已提到一个把分割 mask 变成 Plan JSON 的实验工具；`docs/from-an-image.md` 已是 CR7 ① 的工作流页。本卡把实验工具推进为 `archlang import --from mask`，输出可 lint 的 `.arch`，丢弃物进 `W_IMPORT_DROPPED`（与 OpenPlan3D 导入同路）。工作流页只加一段"有 mask 时"。

不许：在核心里读像素；任何视觉模型依赖；重写 `from-an-image.md`。

### RM7.1 · 无障碍与性能 — `todo` · 4 日 · opus · 依赖无

A.6/A.7（CLI `--accessible --annotate` 与 MCP 对应参数）、A.1（`dims auto` 文本的朗读）、A.3（朗读标题不引 id）、PG.1（playground 房间键盘可达）、PG.2（按形状而非 bbox 命中，"shape, never bbox"）、PG.3（事实行不抖动布局）、4.1（拼接 3× 性能，字节零动）。

证明：axe 零新增；4.1 的 bench 在 CI 上跑，本地不跑。

### 阶段 F 的其余候选（不排序）

波次 2′ 线下没做完的卡；剖面本体（DS12 → DS13，在 `archlang-3d`）与 MF17–MF19；MF12、MF14、MF15（等 MF-D3(b)）；NZ/AU advisory profile（带 RM1.6 的出处）；`lint --brief`；FLOORA 导入；Cron 巡检；Workers AI 读图探针设计；#344；DS3–DS9；CRF4、CRF6、CRF8；IFC 下游包（只在触发后）；MCP 工具分组（工具数到二十个以上再议，今天 11 个）。

---

## 等待触发（不排期）

| 卡 | 触发 |
|---|---|
| IFC 下游包（archlang-3d M5） | 三个外部用户在格式之前先要它，或 Show HN 评论要它；先过 M5 spike 判据；RM7.2 先于它 |
| DS10–DS15 剖面立面 | N10 读过（记为受干扰即可）+ Show HN 之后（D3） |
| 3D 能力 M2+ | 由 `packages/archlang-3d` 的维护自定节奏（`../archlang-3d/` 计划已归档）；N10 读数的结论不挡它 |
| RM3.3 mask 导入 | 第二个独立样本 |
| NZ/AU profile、`lint --brief`、FLOORA、MCP 工具分组 | 阶段 F，按 Show HN 评论与读数重排 |
| 组件接缝单一所有者规则 | 两个 `place` 实例在共享边上对门洞冲突的真实用例 |
| 占用分类、喷淋、地理锚点等建筑标志 | 非住宅疏散或室内地图的外部请求；届时单独提所有者裁定（`README.md` §4，挂起） |
| 电气布置 overlay | 2027-01-31 前 Floorcraft 的电气功能显出用户反响（`README.md` §4） |
| PS0.16 升 E、无宿主门洞升 E | 2.0 major（与 V.5、V.6、6.7 同桶；RM-D16 待所有者） |
| CRF9 预览图 CJK 字体 | parked（Worker 体积，ADR 0034 的已知缺口） |

残留卡（CRF3–CRF13、RM4.4、v1 波次 3 的既定项）的去向表在 `README.md` §7.1。
