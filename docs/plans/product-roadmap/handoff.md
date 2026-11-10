# 恢复点

本文件是本计划的恢复点，按 RM-D15 也是全部开发排期的恢复点：其他计划的 handoff 顶部只留一行指向这里（RM0.1 落地这些指针）。

## 1. 位置（2026-11-11）

- **v2 与第 8 轨都已合并**（#687、#688）。`README.md` 与 `cards.md` 已按 2026-11-10 的六份报告修订为 v2（阶段 A–F、一个队列）。截至 2026-11-11：RM0.3（1.58.0 发布准备）与 RM8.1（连同 RM8.2）在进行中，其余卡未开工，尚未发布任何版本。基线 `main@69fa5864`（core 1.57.0 已发布；`v1.57.0..main` 有 529 个提交未发布）。
- **v1 的裁定 RM-D1…D8** 是所有者裁定（2026-11-06，"我全部同意"），保留；其中 RM-D4 的主裁定已由 RM-D10 推翻。v1 的波次 0 没有开工，由 v2 的阶段 A、B 取代。
- **RM-D9…D16 已由所有者 2026-11-11 批准**（"RM-D9 到 D16 我全部同意。"，`README.md` §6.1）。v2 的阶段划分生效，可以开工。
- **RM-D17…D20 是 2026-11-11 的受托裁定**（`README.md` §6.2）：所有者对当时仍等所有者的四项（MF-D11、对外回复、Dependabot #603、`origin/ChanMeng666-patch-1`）说"请你帮我做出最佳决策。"只是当天这四项的委托，不是长期委托，所有者一句话可推翻任何一条。
- **第 8 轨"视觉质感"已规划，RM8.1、RM8.2 在进行中**（2026-11-11 增补，`README.md` §1.1d、§3、§6.3；卡 RM8.1…RM8.9 在 `cards.md` 各阶段的末尾，全部 `todo`）。RM-D21 是所有者 2026-11-11 的方向（原话录在 `README.md` §6.3）。**RM-D22**（视觉卡作为第二条车道，由第二个执行者并行）与 **RM-D23**（放开由几何确定性烘焙的接触阴影与环境遮蔽）已由所有者 2026-11-11 批准（"RM-D22 和 RM-D23 我都同意，T 字内侧转角线保留。"），T 形交接处保留真实阴角线的设计默认同日确认。
- **RM8.1**（3D 假缝，查看器缺陷修复）是视觉车道的首张卡，核心车道的线不变。它会移动关键帧像素基线，按 `.claude/rules/archlang-3d.md` 的 CI 打印值流程重钉（`README.md` §6.3 末段），目标是冻结前合并，好让 Show HN 的海报干净。

## 2. 先做什么

1. 第一张卡是 **RM0.3**（发布 1.58.0）。tag 由所有者打（RM-D9 已批准）。nightly 前置已满足：run 42801157907（`main@69fa5864`，2026-11-10）里 `Deep fuzz (FC_SCALE=10)` 与四个 `Test …` job 全部 success，#497 已于 2026-11-10T11:07Z 关闭。发布前按 release-check 第 5 项再读一次最新的 nightly。
2. 然后按 `README.md` §3 阶段 A 的顺序：RM0.1 → RM0.4（1.58.0 发布后按 RM-D18 发出两条回复）→ RM0.5（含 RM-D20 的 patch-1 落地）；再进阶段 B（RM1.3a → RM5.1 → RM1.4 → 发布 1.59.0，线 8 日；RM0.2 由第二个执行者并行；线以下 RM2.1 → RM1.6a → PS7.9），约 11-21 切 1.59.0（含 RM5.1 的 `packages/mcp` bump）。阶段 A 原定 11-10 → 11-12，已经晚了，会压进阶段 B 的时间。
3. 执行节律：两条车道（一个核心执行者、一个视觉执行者，外加纯文档卡），一张卡一个 worktree，一次一个重命令对整台机器生效。合并串行，每个 PR 至多两轮红队。
4. 冻结期（11-24 → 12-01）只做 RM1.1a、X9、RM5.3（含生成器，冻结期合不了就顺延到阶段 D）、四份设计稿（放 `design/`，那时才建这个目录；`slab-and-section.md` 要按 RM-D17 定下净高子句的拼写）与 RM1.8。1.59.0 到 11-23 没打 tag 时，RM1.1a 量冻结时 `main` 的提交并记下 SHA。
5. 阶段 D：RM5.4（#603 的 `ext-apps` 2.x 迁移，RM-D19）在线下，12-02 之后才开工，与 RM1.6b 共用一次 `packages/mcp` bump。
6. 阶段 E：1.61.0 约 01-05 切，RM1.1b 在 01-06 → 01-08 量它，数字附在 01-09 的读数里；CRF1 → RM7.2 在线下首位。
7. 阶段 F：RM6.1 在首位，三个 `[语法]` 形式（剖切符号、楼板 datum、RM-D17 的净高子句）；前提是 PS7.9 已合并、`slab-and-section.md` 已写。
8. 第 8 轨：阶段 B 的 RM8.1 → RM8.2 → RM8.3（两条车道，见 `README.md` §3 阶段 B）；冻结期写第五份设计稿 `visual-language.md`；阶段 D 的 RM8.4 → RM8.5 → RM8.6；阶段 E 的 RM8.7 → RM8.8 → RM8.9（两张 `[语法：词表]` 卡等 PS7.9）。

## 3. 所有者待办（`README.md` §6.2 末尾）

- 打 `v1.58.0` tag，之后 1.59.0、1.60.0、1.61.0 的 tag（建议节奏见 `README.md` 原则 11）。
- PS0.18（Hall 往返成 `uses entry`；RM3.1 的范围表用到，未裁则标 `dropped`）。
- MF-D3(b)；backlog D.7（RM4.1 用到；RM4.3 的 DXF 线宽随同一张表变，不等它）、M.9（RM1.5b）；backlog 顶部其余待裁项（M.8、M.14、3.1(b)、CI throughput）。O.10 列的 #119、#121 与后继的 #206–#208 都已关闭，RM0.1 核对后可关闭它（#603 由 RM-D19 裁定）。
- 仓库根的 `.mcp.json`：做不做（默认不做；高风险层的根配置，且会让每个在本仓库开 Claude Code 或 Cursor 的会话收到启用项目级 MCP 的提示）。
- 任何一条受托裁定（RM-D17…D20），所有者都可以一句话推翻。
## 4. 首次接触复测的测量表（RM1.1a、RM1.1b）

固定句（RM-D3）："六份 brief 写成的平面里有 N 个缺陷，最终 lint 报出 k 个。"不提模型名，不叫 benchmark。`../plan-soundness/handoff.md` §4 只留一行指针指向本表；该表里 2026-10-27 及更早的行原样保留。

RM1.1a 的兜底：1.59.0 到 2026-11-23 还没打 tag，就量冻结时 `main` 的提交，"量的版本"一栏写完整 SHA，"说明"一栏写第一个包含它的版本（CR10 的发布说明引这两样）。

| 卡 | 量的版本（或 SHA） | N 个缺陷 | lint 报出 k 个 | 日期 | 说明 |
|---|---|---|---|---|---|
| RM1.1a | 1.59.0 | | | | |
| RM1.1b | 1.61.0（01-06 → 01-08，附在 01-09 读数里） | | | | |

## 5. 另一仓库的待办（growth，由另一会话执行）

- 刷新过期的 Show HN 物料（一个 PR）：`marketing/launches/show-hn/anticipated-comments.md` 还写 "no winders"；`marketing/launches/runbook-2026-09.md` 对 "It does 3D now." 还答 "It does not"，日期还是 09-16；`marketing/launches/show-hn/draft.md` 还写 "Not scheduled"。只写已发布版本里的事实（1.58.0 发布前，`winders` 仍是未发布）。
- 规则目录的勘误记入 `research/cross-report-corrections.md`：1219 mm 门扇的 IBC 版本（仓库注释写明出自 2018 及更早）；WC 1.1 m²、卫浴 2.0 m² 在默认规则集而不在 cn profile；GB 50352 的 175 mm 是公共楼梯；采光筛查的触发数主要来自假设的 1200 mm 玻璃高度（`README.md` §1.1b 第 5 条）。
- 更正外联日志的 open 项：`research/2026-11-09-outreach-session-log.md` 第 123 行把"退界、FAR、分区的范围裁定"记为 owner open；RM-D5 已于 2026-11-06 裁过（`keep site …`，排在阶段 E 的 RM1.2b）。
- 为 RM-D9…D16（所有者 2026-11-11 批准）与 RM-D17…D20（同日受托裁定）写 growth 决策记录（与 `strategy/decisions/2026-11-06-archlang-roadmap-rulings.md` 并列）；其中 RM-D12 回答了 `strategy/decisions/2026-11-10-rule-provenance-and-resolved-walls-precede-ifc.md` 留下的开放点（#681 算第 7 轨）。
- 读数日（2027-01-09、2027-01-31）附 RM7.3 的三项自检。
- v1 的 growth 待办（RM-D1 的 `positioning.md` 一句话与决策记录、RM-D2 的收缩触发决策记录、RM-D7 的刷新稿）已由 growth PR #56 完成。本仓库：RM-D5 的 drawing-set D 记录随 RM1.2b 第 3 条的 PR 一起落。

## 6. 外部贡献者

**历史（2026-11-06 → 11-07，已完结）：** PR #533（gerontec，`winders` 子句）两轮评审后**已合并**（merge `0617d272`；两份评审在 claude-kept `2026-11-06-archlang-product-roadmap/E-*.md`、`F-*.md`）。第二轮独立复算了新法则的 23 行 digest（取自 main）和 K1 重取（324 行里 6 行动，只因目录文案），CHANGELOG 的 `[Unreleased]` 冲突由主会话合入 main 解决（fork 允许维护者编辑）。跟进：backlog ST.2（折线行走线应画成弧，只动有 winders 的图）、ST.3（3D 包把 winder 平台建成平的）。#532 随 #533 自动关闭，剖面那一半在 **issue #544** 继续（卡 RM6.1）。fork PR 的每次推送都要 `gh api -X POST .../actions/runs/<id>/approve` 才跑 CI。

**欠的跟进（RM0.4，按 RM-D18 受托裁定，主会话在 1.58.0 发布后起草并发出）：**
- gerontec：按 RM-D18，1.58.0 发布、docs 的"建在 ArchLang 上的工具"一行（他已同意列入 `archlang-section`）落地后，在 #544 回复一次：`winders` 已发布；两个事实在批次 D 首位，2027-01-10 起，设计稿在冻结期写；欢迎 ST.2 的 PR；`archlang-section` 已列进 docs。另外，所有者在 #532 承诺过"I will post here when the section-line card has a PR"，RM6.1 开 PR 时兑现；他以 MIT 给的 `haus_winders.arch` 还没有当夹具用。
- bobsch-io（Daniel）：没有收到 1.54 以后的交付说明。按 RM-D18，1.58.0 发布后在他自己的 #362 下留一条事实说明（非直跑楼梯以 `winders` 在 1.58.0 发布），只一次，不含任何问题（Daniel 规则）。RM4.4 只按 issue 里已有的明说未做项排，提到线上的触发只有他的下一批 issue 或所有者一句话。
- #405：补记 L 形洞口栏杆已在 1.55.0 交付（#493）。
- #344：在等提问者给样本 mask 和类别名，不是欠。

## 7. 与 math-foundations 的交集（2026-11-10）

- RM6.1 = MF-D1 + DS11；
- RM1.4 覆盖 F11；
- RM1.5b 覆盖 MF3（E.11、M.9 两条）；
- RM1.2b 覆盖 MF6 的湿区部分；
- MF1 在阶段 E 线下，排在 RM1.1a 之后，随后是 RM1.7（转身空间）；
- MF-D1 已于 2026-11-10 委托裁定：采纳 RM6.1 的楼板 datum，设计和排期都不变（批次 D 首位），只增补 MF-D11；语义见 `../math-foundations/` §6.1。v2 不改这一条（RM-D13 的建议是维持）。RM6.1 的 PR 还要处理两件事：一是顶层和单层的天花从哪里来（MF-D11）；二是字节恒等律要写成"一层楼板都没写的图，`describe()` 一字不变"。
- MF-D2 已于同日委托裁定：挂顶物和窗帘作为物体做，照明不做。`README.md` §4 那一行已改写；MF-D7（RCP）仍待裁定。

## 8. 证据存放

- v1（2026-11-06）：研究报告与评审在 `D:\github_repository\claude-kept\2026-11-06-archlang-product-roadmap\`（A 战略、B 用户与竞品、C 现状、D 红队、E/F #533 两轮评审、G #545 评审）。
- v2（2026-11-10）：六份报告（A 专业化包与影响力审计、B 竞品、C 需求与战略、D 仓库计划状态、E issue 与采用、F 红队）与修订规格将归档在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\`。
- 第 8 轨（2026-11-11）：三份调查（V1 3D 竖线根因、V2 元素清单、V3 视觉需求）与增补规格，同样将归档在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\`；出处对照在 `evidence.md` §H。
- `evidence.md` 把计划用到的每条结论回指到 growth 仓库的文件路径、issue/PR 号或本仓库路径（v2 的部分在 §G），报告本体不进本仓库。
