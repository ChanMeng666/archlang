# 产品规划卡片（RM），v2

规则同 `../drawing-set/cards.md`：选依赖已完成、阶段已开放的第一张 `todo` 卡；同一阶段先做"线"以上的卡。状态词：`todo`、`doing`、`done`（裁成 id、标题、状态、PR、commit）、`blocked`（等 `README.md` §6 裁定）、`parked`。规模是 AI 协作日，±50%，是估算不是测量；没有估算的写"未估"。"模型"是建议执行者，主会话可改。每张卡都写明不许做什么。

**状态（2026-11-11 01:18Z → 01:46Z 按 `git` 与 `gh` 读）：** `done` 的有 RM0.3（#689）、RM0.1（#692）、RM8.1 与 RM8.2（#691）、RM0.2（#693，头注释一项拆成 RM0.2b）、RM0.4（三条回复与 #693 的 docs 一行）；做了一部分的有 RM0.5、RM8.4（CLI 一项由 #695 合并，只剩 RM8.4b）、RM1.3a（分支，没有 PR，没绿）；其余全部 `todo`。逐卡的状态行写在各卡下面，恢复点是 `handoff.md`。2026-11-11 新增的卡：RM0.2b、RM1.3c、RM1.4b、RM7.4、RM8.1b、RM8.4b、RM8.10（各在所在阶段）。RM-D9…D16 已由所有者 2026-11-11 批准（`README.md` §6.1），RM-D17…D20 是同日的受托裁定（§6.2）；下面的阶段划分生效。**第 8 轨"视觉质感"（RM8.1…RM8.9，2026-11-11 增补）** 的卡也全部 `todo`：RM-D21 是所有者的方向；RM-D22（第二条车道）与 RM-D23（接触阴影）已由所有者 2026-11-11 批准（`README.md` §6.3）。视觉卡各自放在所在阶段的末尾，排法以 `README.md` §3 为准（两条车道）。估时标"主会话估"的是主会话的估算，±50%。`[语法：词表]` 标记的卡只给已有形式加闭集里的词，不加新子句，但同样依赖 PS7.9、带字节恒等律。

大多数 RM 卡是对 backlog / 各计划已有卡的**打包与排序**。打包卡 `done` 时，被打包的原卡同一 PR 裁掉，并在原处留一行"由 RMx.y 完成，PR #n"。`[语法]` 标记的卡新增语言形式：依赖 PS7.9（spec 腾空）先完成；遵守 `AGENTS.md` 硬规则与 `docs/agents/iron-laws.md`"每个新形式带字节恒等律"；`gen:*` 的闭集从源头派生。由 profile 数字驱动的新规则还依赖 RM1.6a（`README.md` 原则 10）。

卡内 `file:line` 和 id 指 `main@69fa5864`，动手前重新确认（v1 的报告 C 与 v2 的报告 D 都发现过记录漂移，见 RM0.1）。

## 0. 每张卡都跑的门禁

| 何时 | 命令 |
|---|---|
| 本地，永远 | `npm run check:quick`（文档另加 `npm run docs:build`），别的都不跑（`AGENTS.md` § How to work） |
| 只在 CI 跑 | `check`、`check:drift`、`typecheck:all`、e2e、`check:3d`、bench |
| 执行者 | 两条车道（RM-D22，所有者 2026-11-11 批准）：一个核心执行者、一个视觉执行者（第 8 轨），外加纯文档卡；每张卡一个 worktree（`docs/agents/orchestration.md`）；一次一个重命令对整台机器生效，重的门禁交给 CI |
| 每个 PR | 从 `main` 建 worktree，分支 `feat/<card>-<slug>`（文档卡 `docs/<card>-<slug>`）；红队最多两轮；合并串行，按风险层级走 `docs/agents/commands.md` § Merging a PR |
| 规则卡（RM1.2a/b、RM1.7） | 另加：每条规则一对公开夹具（合法图零报、缺陷图必报）进 `test/defect-corpus/`；留出的一对只写进私有 `archlang-lab`，PR 只报它的计数；PR 里写出该规则用 `arch lint --json` 跑过全部 `examples/**` 的报出数 |
| 冻结期 11-24 → 12-01 | 只合 bug 修复、测量与文档；不发 minor |
| 3D 回放的改动（2026-11-11 加） | 除终帧与海报外，还要比对墙升起过程中的帧（例如回放的 6.75 s、6.80 s 处）。#691 的终帧与海报都对，透缝只在升墙中途出现，是第一轮评审逐帧比对视频时抓到的（`docs/agents/gotchas.md` § PRs & CI） |
| 执行者的长等待（2026-11-11 加） | 简报写明：可能长时间等待（等资产生成、等机器空闲）之前，先在自己的 scratchpad 写一个状态文件（已做什么、还剩什么），文件按卡命名（例如 `state-rm1.3a.md`，不叫 `state.md`：同一会话的代理共用 scratchpad，2026-11-11 有两个代理互相覆盖过）；机器忙时，小改动先提交，报告写"门禁未跑"，不在长循环里等。两个执行者在长等待中丢过任务卡（`docs/agents/orchestration.md`） |

**字节恒等载荷：** SVG + `describe()` + `lint()` + `compile().diagnostics`。
**消息规则：** lint 的 `message` 不含 id；id 只在 `hint`。条文出处的结构化字段（RM1.6a/b）只增不替：已有的 hint 文本不删，新字段不进 `lint()` 的序列化。
**核实等级：** 规则数字的出处取五值之一：`V`（读过官方原文）、`S-full`（读过全文第三方副本）、`S-secondary`（转述、摘要、讲义）、`M`（杂志）、`convention`（无文献的约定）。只有 `V` 和 `S-full` 能进新规则或公开夹具（drawing-set D13；`README.md` 原则 10）。
**证明方式：** 走 CLI 和 digest，不靠看图（`AGENTS.md`）。PNG 只作说明附件。

---

## 阶段 A · 立刻（11-10 → 11-12）：发布与对账

执行顺序以 `README.md` §3 的表为准：RM0.3 → RM0.1 → RM0.4 → RM0.5。RM0.4、RM0.5 中的纯文档部分可以由第二个执行者并行。

### RM0.3 · 发布 1.58.0 — `done` · #689 · `e68fd576`

实际交付与卡不同之处：发布评审 H 指出第二个破坏性变更（import 限根、非 `.arch` 模块、超过 1 MiB 的模块），按 RM-D25 一并放进 minor，CHANGELOG 的 Breaking 写两条；`v1.58.0` 由代理在 `e68fd576` 上推出（RM-D24），`release.yml` run 42924321089 四个 job 全部 success；`@chanmeng666/arch-plan` 随之升到 0.1.2（RM-D26）。npm：核心 1.58.0、`archlang-mcp` 0.2.41、`archlang-3d` 0.5.0、`arch-plan` 0.1.2（2026-11-11 01:20Z `npm view`）。上架状态见 `docs/seo.md` § 8 与 `handoff.md` §1。版本号 PR 合并到 tag 之间隔了 9 小时 38 分（`handoff.md` 的事故一节）。

### RM0.1 · 记录修正（扩大） — `done` · #692 · `41150b53`

实际交付与卡不同之处：同一 PR 还记下了 RM-D24…D26、1.58.0 的发布状态、事故条目（`docs/agents/gotchas.md` § PRs & CI）与 backlog O.19。**没做完的两件**：CRF13（`src/ir.ts` 那条过时注释）在 #618 拆分之后找不到对应位置，没有关；O.10、H.1 的归档块还没有追加到私有的 `archlang-lab/backlog-archive.md`（另一仓库，`scripts/backlog-archive.mjs`；2026-11-11 在本机的 `archlang-lab` 检出里查不到这两个 id）。PR 里留给所有者的措辞问题已由 #694 解决（`c5513950`）。

**两件余项已由 #697 做完**（2026-11-11T03:26:31Z，合并提交 `47c7bc68`）：VA.4 已归档；O.10、H.1 的归档块已追加到私有的 `archlang-lab/backlog-archive.md`。CRF13 建议关闭，理由"不可复现"：#618 拆分之后在 `src/ir.ts` 与 `src/ir/*.ts` 里找不到过时注释（`../checker-reach/README.md` 的 CRF13 行已记）。附带发现工具缺陷，记入 RM0.6。

### RM0.4 · 欠外部的跟进 — `done` · #693 · `8f9ca2bb`（docs 一行）；三条回复是 issue 评论

实际交付（2026-11-11 01:45Z 读）：#544 给 gerontec（<https://github.com/ChanMeng666/archlang/issues/544#issuecomment-6782842533>，00:06:55Z）；#362 给 bobsch-io（<https://github.com/ChanMeng666/archlang/issues/362#issuecomment-6782843000>，00:06:56Z，只有事实、没有提问）；#405 的补记（<https://github.com/ChanMeng666/archlang/issues/405#issuecomment-6784462072>，01:40:06Z：L 形洞口栏杆已在 1.55.0 交付，清单其余各项是 RM4.4）；docs 的 `archlang-section` 一行随 #693 合并（`docs/analysis.md` 的 "Tools built on `describe`"）。与卡不同之处：#544 的回复还承诺了设计稿 `slab-and-section.md` 写成后在 #544 贴链接（`handoff.md` §8）。

### RM0.5 · 依赖与悬空状态 — `doing` · 0.5 日 · sonnet · 依赖无

**状态（2026-11-11 06:45Z 重读）：只剩 #676。** 本会话（第二场）完成：#700（2026-11-11T04:21:20Z，`b6edfd8f`）biome 2.6.4 与 vue-tsc 3.3.14，取代 Dependabot #604（GitHub 随后把 #604 标为已合并，`d13f6509`）；只关掉 2.6 新增的三条规则，backlog 3.3 记着采纳 `useMathMinMax` 与 `useDomNodeTextContent`。12 个已合并 PR 的远程分支逐个核对是 `main` 的祖先且 PR 为 MERGED 之后删除，`refs/remotes/pr308` 与过期的本地分支一并删除；`origin/ChanMeng666-patch-1` 的内容早已由 #568（`02851c1f`）落地，2026-11-11 经所有者同意删除（旧 SHA `6c86203a0044838a94150e26ff3178b7dd209d03`），所以 RM-D20 的 cherry-pick 不再需要；`origin/docs/rm0.2-studio-comment` 在 #699 后删除。#676（`three` 0.187）按顺序等 RM8.1b（#706）合并之后再评估。当前 `git branch -r` 只剩开着的 PR 分支、`origin/feat/remove-view` 与 `origin/main`。

**下面是 01:18Z 的原状态：** 已合并：#678（`dfd126b6`，00:36Z）、#677（`644a390c`，00:46Z）、#675（`aa639f5b`，00:56Z）。**还剩：** #604 开着（biome 2.6 的 lint 差异没修）；#676 开着（`three` 0.187，帧哈希与 GLB 字节的评估没做）；#603 按 RM-D19 保持打开，不在本卡；`origin/ChanMeng666-patch-1`（`6c86203a`）没有落地（RM-D20 的 URL 核对与 cherry-pick 都没做）；分支清理没做：`git branch -r` 仍有 12 个 2026-10-17 → 10-24 的旧分支（卡里说的"已合并 PR 的远程分支"，是否每个都已合并本次没有逐个核对；`origin/feat/plan-json-instance-walls`、`origin/fix/analysis-entrance-size-arc`、`origin/feat/lint-space-enclosure`、`origin/feat/lint-room-contents`、`origin/feat/lint-openings-vs-walls`、`origin/feat/lint-coverage-report`、`origin/test/defect-corpus`、`origin/fix/label-living-dining`、`origin/fix/between-face-probes`、`origin/feat/lint-circulation-privacy`、`origin/docs/plan-soundness-programme`、`origin/docs/post-1.43.1-sync`）与 `refs/remotes/pr308`，本地另有 `refactor/exhaustive-element-kinds`、`docs/roadmap-visual-track`（#688 已合并）。清理前逐个确认已合并。

- 合 #675（codeql-action，workflow 属高风险层）、#677、#678：`@dependabot rebase` 到新 `main`，CI 绿后按层级合并（`docs/agents/iron-laws.md` 的 Dependabot 规则）。
- #604：先修 biome 2.6 的 lint 差异，再合。
- #676（`three` 0.187）：单独评估 3D 的帧哈希与 GLB 字节、许可白名单与 THIRD_PARTY_NOTICES；不与别的升级同 PR。
- #603（`@modelcontextprotocol/ext-apps` 1.7.5 → 2.0.4，主版本）：按 RM-D19，Show HN 之前不合并，PR 保持打开；12-02 之后由 RM5.4 迁移。
- 清掉 13 个已合并 PR 的远程分支、`refs/remotes/pr308` 和过期的本地分支（例如 `refactor/exhaustive-element-kinds`）；保留 `feat/remove-view`。
- `origin/ChanMeng666-patch-1`（所有者 2026-11-08 网页上改的 README 影片链接，一行，commit `6c86203a`，没有 PR）：按 RM-D20 落地。先确认新的资源 URL 能打开；再从 `main` 新建分支，cherry-pick `6c86203a`，经 PR 合并（README 改动按风险层级走）。

证明：每个 PR 合并时钉的完整 SHA；分支清理前后的 `git branch -r` 计数；patch-1 的新资源 URL 的 HTTP 状态记在 PR 里。

不许：合并主版本升级（#603 留给 RM5.4）；直接推 `origin/ChanMeng666-patch-1` 或把它当 PR 合并（cherry-pick 到新分支）；新资源 URL 打不开时落地 patch-1；为了让 #676 绿而重新钉帧哈希或 GLB digest（字节移动要逐项解释）；删 `feat/remove-view`。

### RM0.6 · 工具：`scripts/backlog-archive.mjs` 的两处缺陷（2026-11-11 加，出自 RM0.1 余项的真实运行） — `todo` · 未估 · sonnet · 依赖无（线下）

内容：(1) 一次真实运行把 11 个 KEEP 标题上的状态词写了两遍；(2) 它不重生成 `docs/backlog-index.md`，归档之后要手跑 `npm run gen:backlog-index`。修脚本使两件都对，并补一个测试。

证明：对一份含 KEEP 标题的夹具，归档前后标题不重复状态词；归档后 `backlog-index` 与生成器输出一致。不许：手改 `docs/backlog-index.md`；顺带归档任何条目。

---

## 阶段 B · 冻结前（11-13 → 约 11-21 切 1.59.0）：不加语法

执行顺序以 `README.md` §3 的表为准：RM1.3a → RM5.1 → RM1.4 → 发布 1.59.0，线（8 日 = 3 + 2 + 2 + 发布 1，9 个日历日）以下 RM2.1 → RM1.6a → PS7.9。RM0.2 是纯文档卡，也在线上，但由第二个（只做文档的）执行者并行，不计入 8 日。切点前合不完的进阶段 D，不挤进冻结期。

### RM1.3a · 可达性盲点第一批 — `done` · #698 · `b385685c`（2026-11-11T04:57:27Z）

PS0.3（上层经楼梯 `reachable:false`）、U.1（阳台门算到达）、6.11（双开门读成两窄门）。这三条都坐在 README "computed, not estimated" 的声明下面。

证明：三个最小夹具上 `describe().access`/`circulation` 的前后对照写进 PR；语料里其他图的 `describe()` 变化逐条列出并解释（这是分析修正，允许移动 describe，但要列全）。

不许：改 `W_PATH_TOO_NARROW` 的阈值（PS0.8 等复测）。

**实际交付（PS0.3 与 U.1，#698）：** 188 个 digest 钉值带理由重钉（比 01:19Z 估的约 100 个多），每行理由写在 `test/byte-identity-baseline.ts` 头注释的规则下；两轮红队修了两个种子：登船即止的停靠点（boarding-stop）与双侧转折楼梯（two-sided turning-stair）。6.11 仍是 RM1.3c。执行者发现的后续项并入 RM1.3b。

**下面是合并前 01:19Z 的状态（历史）：做了一半，分支没绿，没有 PR。** 分支 `origin/fix/rm1.3a-reachability-blind-spots`，头 `fef92a70`，基于 `e68fd576`（落后 `main`，合并前先合入），四个提交；worktree `.claude/worktrees/agent-a7037ea87974db09b`。
- 分支上已做：PS0.3（只经楼梯到达的上层房间不再 `reachable: false`，`describe().levels[].access.rooms[]` 带 `reachable: true`、深度与瓶颈宽度）；U.1（通向阳台或其他室外地面的门不再算入口，房间从前门起走，只经阳台才到的房间进 `circulation.blocked`）。
- 执行者对 788 份平面相对基线的全语料对比：SVG、`compile().diagnostics`、默认 profile 的 `lint()` 与语法事实无一行移动；`describe()` 动了 40 行，circulation 叠加层 10 行，`accessibility-advisory` 下的 `lint()` 只有 `garden-house`；五个示例做了换回证明（新 SVG 与 lint 配旧 `describe()` 重现钉住的 digest）。证据在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\rm1.3a\`（`fielddiff-now.txt`、`sweep-base\`、`sweep-after2\`、`check-quick-rm13a-4.log`）。
- **还剩：** (1) 22 张字节恒等表里约 100 个 digest 钉值要移动，全在那 40 行只动 `describe()` 的行里；执行者没有重量。分支上 `check:quick` 红在其中 5 个（`new-families-byte-identity`、五个多层示例），CI 也会红。重钉是带理由的重量：`test/byte-identity-baseline.ts` 头注释，逐行列出哪一行动了、为什么这个移动就是修复本身，再加一次新上下文的评审确认新事实正确；不许为了变绿而重钉。(2) 合并 `main`（生成文件冲突时在本地合并后 `gen:all`，不手解）。(3) 开 PR，写出卡要的三个最小夹具的前后对照（`test/reachability-blind-spots.test.ts` 已断言这些值）。6.11 拆出为 RM1.3c，不在本卡。
- 留给后面卡的发现（记进 RM1.3b）：`accessibility-advisory` 下瓶颈是楼梯梯段本身时，`W_PATH_TOO_NARROW` 不指名任何门，hint 却说加宽最窄的门或洞口。
- 过程记录：执行者因本地门禁钩子挡住 vitest，用自制的替身跑测试文件，替身在几个文件上给出假红。替身不是认可的做法：本地跑不了指定的测试文件，以 CI 的 vitest 为准。

### RM1.3c · 双开门读成两扇窄门（6.11，从 RM1.3a 拆出） — `todo` · 未估 · opus · 依赖一次设计裁定（记入 `README.md` §6）

内容：backlog 6.11：`describe()` 的到达图与 circulation 把双开门的每一扇当成一个门；`museum-wings.arch` 的主入口（两扇 1000 mm 门扇，各净宽 940 mm）因此算成两个 940 mm 门洞，而不是一个约 1940 mm 的洞口。backlog 把"分析要不要、以及怎样认出一对门扇"（同一门框、同一宿主、都铰在外侧门框上）记为开放的设计问题，并指出拟议的 egress 事实（M.16，最大流的门通行能力）会顺带解决它。所以先写一页设计（两种做法：在分析里认出一对门扇；或等 M.16），交主会话或所有者裁定并记入 `README.md` §6，裁定之后才写代码。

证明：裁定的出处；若做，`museum-wings` 的 `bottleneckClearWidth` 前后对照写进 PR，语料上 `describe()` 的变化逐图列出并解释（分析修正，允许移动 `describe()`，但要列全）；SVG 与默认 `lint()` 零差。

不许：没有裁定就写代码；改 `door … double` 的画法（`doorLeaves`，`docs/agents/gotchas.md` § Core）；顺带改 `W_PATH_TOO_NARROW` 的阈值。

### RM5.1 · MCP 能力摘要 — `done` · #703 · `07ac9554`（2026-11-11T05:56:45Z）

CRF10：`INSTRUCTIONS` 879/900。做法：`INSTRUCTIONS` 保留一句能力句（客户端很少主动读资源），工具清单与"能做/不能做/编辑循环/导出清单"移入新资源 `archlang://capabilities`。PS5.3a：`validate` 返回 `next`（`NEXT_TIERS` 同序）。**v2 加：** 能力资源里另加两行，分别指向 `docs/from-an-image.md`（读图的工作流）与 `docs/edit-one-room.md`（改一个房间）。一次 `packages/mcp` 版本 bump，搭 1.59.0 发布。

**实际交付（#703）：** 资源 `archlang://capabilities` 由真源生成（CLI 半边 `src/manifest.ts`、工具半边 `packages/mcp/src/tools.ts`、`EXPORT_FORMATS`），`INSTRUCTIONS` 891/900；`validate` 返回 `next`。**PR 里有意没有 bump `packages/mcp` 的版本**：`release:pin` 在 1.59.0 时 bump 这个 shim（`scripts/bump-lockstep.ts`），插件清单钉的是 shim 的精确版本（`scripts/gen-plugin.ts`），提前 bump 会让两处不同步。受托裁定：派生的 `repair` 标题保持 "Repair furniture placement"（是标题，不是能力承诺）。评审留下的文字小项记为 RM5.1b。**合并后 `main` 红了：** #703 的合并提交 `07ac9554` 与 #701 的 `594ba1c7` 上 CI 的 Node 18 job 失败，步骤 "Generated artifacts are in sync" 里 `npm run gen:mcp-capabilities` 报 `TypeError: E.toReversed is not a function`（`Array.prototype.toReversed` Node 18 没有；run 42969029371、42970758650）；自动开了 issue #705 "main is red after a merge"。合并下一个 PR 前要先 fix-forward（用 `[...a].reverse()` 之类的 Node 18 可用写法）。

### RM5.1b · MCP 能力页的文字小项（从 #703 的评审留下） — `todo` · 未估 · sonnet · 依赖无（线下）

- `archlang manifest` 的摘要 "this document: the whole CLI API"（在 `src/manifest.ts`）读起来像是能力页本身，改成只指 CLI 清单。
- 生成器里手写了 `npx -y @chanmeng666/archlang`，应当从真源派生，不重抄。
- 托管端的 CPU 上限没有在能力页里点名。

证明：能力页由生成器出，drift 绿；`INSTRUCTIONS.length` 上限测试不变。不许：手写清单；在摘要里加能力承诺（`../public-surfaces/3d.md` §2）。

证明：`INSTRUCTIONS.length` 上限测试不变；资源内容由 `src/manifest.ts`（CLI 半边）、`packages/mcp/src/tools.ts`（工具半边）、`EXPORT_FORMATS` 生成，带 drift 测试。

不许：在摘要里写"设计/布置/家具"、IFC、任何 3D 能力承诺（展示用词按 `../public-surfaces/3d.md` §2 的固定句）；手写清单；在仓库根加 `.mcp.json`（高风险层的根配置，所有者待定，默认不做）。

### RM1.4 · 静默接受改出声（只加 W） — `doing` · #704（评审中，与 RM1.4b 同一个 PR） · 2 日 · opus · 依赖无

受托裁定（2026-11-11，所有者可一句话推翻）：随 PR 带出 `W_GRID_SNAPPED` 的示例，凡触发它的已发布示例，改写成吸附后的值（图字节恒等）；`W_UNKNOWN_THEME` 也由 CLI 的 `validate` 与 `lint` 报出。

- U.2 裸米值静默编译 → 一条 W（带它猜成的毫米值）。**不升 E**：会让今天能编译的图在 Show HN 前变红。
- U.3 家具类别拼错过 `--strict` → 走 `W_ALIAS_MATCH` 同路，`--strict` 下升级。
- PS0.25 与 6.10（尺寸和门位网格吸附无声）→ 一条 W，带吸附前后值；同一 PR 裁两条。
- PS0.16（`set door(width: W)` 静默字串化）→ W 现在，消息给出被当成字串的值；2.0 升 E，记进 backlog 的 2.0 桶（RM-D6）。
- U.4（家具 `label` 不画）：**不加诊断**（RM-D6）。label 是数据不是图：本卡只确认 `describe().furniture[].label` 带出它（缺则补），`docs/furniture.md` 写一句"符号不画 label，label 进 describe 与 schedule"；`schedule fixtures` 在 RM4.2。

证明：每条一个最小 `.arch` 夹具 + `arch explain` 条目；字节恒等律（不触发的图不变）。

不许：改吸附行为本身（M.9/PS0.26 是所有者的）；改 `fmt` 精度（M.8）；碰 PS0.27 词法（新形式，RM1.5b）。

### RM0.2 · "编译器说不、并说为什么" — `done` · #693 · `8f9ca2bb`

实际交付与卡不同之处：页面是 `docs/says-no.md`，七个小平面，输出由 `scripts/says-no.ts` 从示例重新生成、`test/docs-says-no.test.ts` 比对；"过默认检查不等于过任何辖区"的对照表与 `validate --strict` 一段都在页里。同一 PR 带了 RM0.4 的 docs 一行（`docs/analysis.md` 的 "Tools built on `describe`"，只列 `gerontec/archlang-section`）。评审 J 的 1 个 blocker（`archlang repair` 在页面自己的平面上什么也不做）与 5 个 should-fix 合并前已改。**v2 加的第 1 项（`examples/studio.arch` 头注释，#683）没有做**：它会移动两处钉住的源文本哈希，拆成下面的 RM0.2b。#693 于 2026-11-11T01:25:16Z 合并。

### RM0.2b · `examples/studio.arch` 头注释改正（#683，从 RM0.2 拆出） — `done` · #699 · `b04cbd07`（2026-11-11T03:59:31Z）

**实际交付与卡不同之处：** 头注释按原字节长度重写，所以没有 span 移动。移动的钉值：`test/double-door-byte-identity.test.ts` 里 studio 的源文本哈希、finish-furnish 的 studio 一行、`docs-site/public/3d/manifest.json` 的 `source.sha256`（重生成，没手改）。**卡里写错了一处：** `db6313cf…` 不是移动的钉值，它是载荷 digest，没有动。#683 随 PR 关闭。

（以下为原卡。）

`examples/studio.arch` 第 3–5 行今天写 "Architecturally sound (passes `arch lint`): every room opens off a central hall"。2026-11-11 用 1.58.0 的 `dist/cli.js` 核过的事实：前门 `d_main` 在 (3000,6000) 的外墙上，开进 "Living / Kitchen"（`r_living`，x 0–4000）；门厅经 `o_living`（x=4000 隔墙上的洞口）从客厅到达；卧室与卫生间各有一扇门开在门厅上；`arch lint examples/studio.arch` 无报（`"summary": "no warnings"`）；`--profile uk-residential-advisory` 下报一条 `W_ROOM_TOO_SMALL`。改好的注释已在分支 `origin/docs/rm0.2-studio-comment`（头 `e42184a9`，两个提交，只改 `examples/studio.arch` 与 `CHANGELOG.md`，没有 PR，没过门禁），从它出发。

内容：
- 注释按上面的事实改写（分支上的文字可以直接用）；内房（AD B 2.11）的判定不在这里，交给 RM1.2b 第 1 条。
- 改注释会移动两处钉值，这是本卡要带理由处理的：`test/double-door-byte-identity.test.ts` 里 `examples/studio.arch` 一行的源文本哈希（`db6313cf…`），与 `docs-site/public/3d/manifest.json` 里 studio 的 `source.sha256`（`a43e6800…`，由 `npm run gen:3d-assets -- --only studio` 重生成，不手改）。移动的理由（只改注释）写进提交与测试注释；`describe()`、`lint()`、SVG 不应移动，移动了就是缺陷。
- `playground/src/examples.ts` 的 studio 描述重复了同一句不实的话（"passes arch lint, with every room opening off a central hall"），同卡改正。
- 再 grep 一次别处的同句（README、docs、gallery）。

证明：SVG + `describe()` + `lint()` 在语料上零差；两处钉值的前后值与理由写进 PR；`arch lint examples/studio.arch --profile uk-residential-advisory --json` 的输出贴进 PR；CI 的 `check:3d`（`e2e/assets.e2e.ts`）与 `check:drift` 绿。

不许：手改 `manifest.json`；不写理由就改哈希；把注释写成"合规"或 "passes" 某辖区；顺带改平面本身。

### 发布 1.59.0 · 约 11-21 · 1 日

线上合并项切一个 minor（发布由所有者决定，发布链含 tag 由代理跑），含 RM5.1 的 `packages/mcp` bump；RM8.1（与 RM8.2，若已合并）带来一次 `packages/archlang-3d` 的版本 bump；步骤同 RM0.3，按 `.claude/commands/release-check.md`。切点后合并的 minor 内容等 12-02。

**所有者已决定（2026-11-11，"我同意发布"）：** 发布 1.59.0。代理在路线图切点（约 11-21）跑整条发布链，含 tag；所有者明说提前才提前。bump 三处：核心 minor；`packages/mcp` 的 shim 经 `release:pin`；`packages/archlang-3d`（自 0.5.0 以来含 RM8.1、RM8.2、RM8.3）。tag 前的每一项证明在版本号 PR 的分支头上跑完，再合并该 PR。

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

本计划把它提为所有 `[语法]` 卡的前置。今天 `spec.llm.md` 是 29,856 UTF-16 单位，测试是 `< 30_000`（`test/llm-spec-drift.test.ts`），可用余量 143。目标按后面排到的 `[语法]` 形式重算：RM6.1 两个（剖切符号、楼板 datum）、RM-D17（MF-D11）的净高子句一个、RM1.2b 的 `keep site` 与可开启值两个，共五个；线下的 RM4.2 `schedule fixtures`、RM3.4 另计。

不许：提高上限而不先削掉可证明的重复（铁律）；删掉 spec 里仍在用的事实。

线下的卡在 1.59.0 切点前合并的，随 1.59.0 发布；切点后合并的等 12-02。

### RM1.4b · 写错大小写的主题名静默无效 — `doing` · #704（与 RM1.4 同一个 PR） · 未估 · sonnet · 依赖无（2026-11-11 加，出自 #695 的评审 L，M6）

评审 L 的 M6：`--theme Rendered` 退出 3 并提示 `did you mean "rendered"?`，但源文件里写 `theme Rendered`，`compile --json` 的 `diagnostics` 为空，也不按 `rendered` 画。2026-11-11 用 1.58.0 的 `dist/cli.js` 复核：一份写了 `theme Rendered` 的最小平面，`compile --json` 的 `diagnostics` 是 `[]`。这是原则 2 说的"静默接受"，与 RM1.4 同类，只加 W。评审明说不在 #695 里做。

内容：源文件里的 `theme <name>` 不是已知主题名时出一条 W（码名按目录，`.claude/commands/new-lint-rule.md` 或诊断目录的流程），hint 给出最接近的已知名；已知名的行为与字节不变。

证明：最小夹具；字节恒等律（不触发的图 SVG、`describe()`、`lint()`、诊断不变）；`arch explain` 条目。

不许：升 E（Show HN 前只加 W，原则 2）；把大小写不对的名字当成已知名去画；改任何主题的值。

### RM1.4c · `W_GRID_SNAPPED` 没覆盖的几类（2026-11-11 加，出自 #704 的评审） — `todo` · 未估 · opus · 依赖 #704 已合并（线下）

`W_GRID_SNAPPED` 不报：门宽、窗、派生的门位（`on <wall> at …`、`centered`）、多边形顶点、圆半径。要不要报、报哪些，先在 PR 里按"哪些值真的会被吸附"逐类核对再加，只加 W。**另：** playground 的编译器路径预算只剩 145 B 余量（457,855 / 458,000 B），本卡或之后任何动核心的卡先削掉可证明的重复，不抬上限。

证明：每类一个最小夹具；不触发的图字节恒等。不许：改吸附行为本身（M.9/PS0.26 是所有者的）；抬预算。

### RM7.4 · `examples/clinic.svg` 没有生成器，已与编译器输出不一致 — `todo` · 未估 · sonnet · 依赖无（2026-11-11 加，出自 #695 的评审 L）

评审 L 发现 `compile examples/clinic.arch -o -` 与已提交的 `examples/clinic.svg` 字节不同。2026-11-11 复核：用 1.58.0 的 `dist/cli.js` 编译，第 20 行起不同；`scripts/gen-example-svgs.ts` 的 `README_SVGS` 列了 20 个示例，不含 `clinic`，`examples/` 下却有 21 个 `.svg`；`git grep "clinic.svg"` 没有任何引用。所以这张图没有生成器、`check:drift` 不守它，旧了也没人知道（那个生成器头注释写的正是这类"rot"）。

内容：二选一并在 PR 里写理由：删掉这张没人引用的图；或把 `clinic` 加进生成器的清单并有引用它的地方。再查一遍 `examples/` 与 `docs-site/public/` 下有没有同类没有生成器的图。

证明：`check:drift` 绿；若保留，生成器重生成后与编译器输出逐字节相同。

不许：手改 SVG；为了留下它而放宽 `test/example-svgs-drift.test.ts`。

### 第 8 轨（视觉）· 阶段 B

排法见 `README.md` §3 阶段 B：视觉车道 RM8.1 → RM8.2 → RM8.3，核心车道的线不变。三张卡都动 `packages/archlang-3d` 与 `docs-site/public/3d/`，不碰 `src/`。

### RM8.1 · 3D 假缝：按楼层、按平面求墙的特征线 — `done` · #691 · `6d1680e5`

实际交付与卡不同之处：新模块 `packages/archlang-3d/src/replay/wall-lines.ts`，按楼层跨节点求墙与柱的轮廓线（卡的方案 F1）。第一轮评审 R1 的 blocker：删掉两个节点共有的面之后，回放逐墙升起时墙体中途出现透光的竖槽（laneway 回放 6.80 s 的 T 形处），终帧与海报看不出。修法是共有的面做两个版本：`alone`（每个节点各自是闭合实体）与 `joined`（整层完成后的并集表面），`mount.ts` 只在同一组的节点全部升到顶时才换成 `joined`；分组是传递的，一层相连的墙通常是一组。轮廓线始终是终态的那一套，所以升墙中途有的真实棱暂时没有线（卡已接受）。关键帧基线 13 帧按 CI run 42931433003（job 130230923132）打印的哈希重钉，理由与前后哈希写在 `packages/archlang-3d/e2e/fixtures/README.md`；Mesh3D、GLB、Scene3D 与事件表的钉子不动。挂载耗时（15 次中位数）：library 23.5 ms，旧的逐节点描边 8.7 ms。第二轮评审 R2 无 blocker；它留下的两项与 PR 正文的 "Known limits" 成为 RM8.1b。`packages/archlang-3d` 的版本 bump 没有随 PR 做，搭 1.59.0。后面的卡（RM8.6、RM8.8）说的"按 RM8.1 写的 CI 打印值流程重钉"，流程原文在 `.claude/rules/archlang-3d.md` 的 Traps 第 1 条与 `README.md` §6.3 末段。

### RM8.2 · 海报与视频抗锯齿 — `done` · #691 · `6d1680e5`

实际交付与卡不同之处：与 RM8.1 同一个 PR。`renderReplay({ supersample: k })`（`@chanmeng666/archlang-3d/node`，k 取 1–4，默认 1 不变）与 `ReplayPayload.supersample`；archlang.uk 的海报按 3 × 3、回放视频按 2 × 2 生成（`docs-site/public/3d/manifest.json` 的 `supersample`）。`renderStill` 不从任何入口导出，卡里写的"给 `renderStill` 加选项"不成立。体积：海报 PNG 增大 55–86%，WebP 减小 9–16%（例：studio 40,992 → 34,732），MP4 变小（例：studio 577,336 → 438,110）；CI 里 `e2e/assets.e2e.ts` 29.5 s → 54.6 s，`check:3d` 的 vitest 106.6 s → 117.6 s（PR 正文）。实时查看器的 `antialias: false` 未动。

### RM8.1b · #691 的后续：分组切换的纯函数与没测到的情形 — `doing` · #706（修评审意见中） · 未估 · sonnet · 依赖无（2026-11-11 加，出自 #691 的评审 R2 与 PR 正文的 "Known limits"）

内容：
- 评审 R2 SF2：`packages/archlang-3d/test/wall-lines.test.ts` 的 `drawnAt` 自己重写了"组内全部 `rise === 1` 才换 `joined`"，所以"每种升起状态都闭合"的测试验证的是这份复刻，不是 `mount.ts` 的 `draw`。把切换写成 `wall-lines.ts` 里一个导出的纯函数（评审的建议：`joinedGroups(fixes, standing)`），`mount.ts` 与测试都调用它。今天 13 个关键帧里只有 laneway 的 `tilted` 处在升墙中途，是唯一能看到这类回归的帧。
- 评审 R2 m5 与 PR 正文：深度方向相差 1 µm、互相重叠的近共面墙段只用合成的盒子测过，补一个由平面建出的夹具。
- 评审 R2 m1：每个有争议的平面上格子数是 `|S| × |Y|` 的乘积（长墙上很多高度不同的窗，背面有一个 stem 时可到平方级，在 playground 每次编辑重新挂载时于主线程上计算）；先用一个合成的病态平面量出耗时与内存，超出可接受范围才改为只在有绕数的列上按区间合并行。量法与数字进 PR。
- 评审 R2 m2：两份 CHANGELOG 把切换写成 "once the walls meeting there are all up" / "once every node meeting them is up"，比实际窄，改成"同层与之相连的墙全部升起之后"。升墙期间共有面上的掠射角残影照旧存在（终帧没有），记为已知限制，不在本卡修。

证明：切换函数被 `mount.ts` 与测试共用（grep 两处调用）；把它改成逐节点判断时有单测变红；新夹具绿；关键帧、Mesh3D、GLB、事件表零差；若改了格子算法，`wall-lines` 的输出在语料上逐字节不变。

不许：移动任何钉子；碰 `src/mesh/build.ts`；在本地 bless 关键帧；顺带改灯光或 `antialias`。

### RM8.1d · 共线对接的两面墙，一面深度偏 1 µm 时，窗的位置改变墙的拓扑（2026-11-11 加，出自 #706 执行者的报告；先调查） — `todo` · 未估 · opus · 依赖无

现象：两面共线的 200 mm 墙 `a` 与 `b` 在 x = 3100 mm 处对接，`b` 的深度偏 0.001 mm；在 `b` 上放一扇 800 mm 的窗，窗在 `b` 局部坐标 2000 或 2500 mm 处时，墙不再被修到 `a` 的墙角：`b` 失去接缝与窗之间的一段，`a` 留下一条 1 µm 的斜边。窗改成 600 mm 且更靠近接缝时，拓扑正常。**不知道缺陷在核心（斜接或洞口）还是在网格（`packages/archlang-3d`）。**

内容：用最小平面复现；比较核心解出的墙多边形与 Mesh3D，找出哪一级丢了那一段；然后修，或在不可修时记录原因。

证明：最小平面的前后对照；定位结论（核心还是网格）写进 PR；若修核心，SVG 字节恒等律；若修网格，关键帧、GLB 的移动逐项带理由。不许：本地 bless 关键帧；在没定位之前两边都改。

### RM8.1c · 墙线通道 `linesOf` 在长而窗多的墙上占挂载耗时（2026-11-11 加，出自 #706） — `todo` · 未估 · sonnet · 依赖 #706 已合并（线下）

#706 量出：一面墙上有 80 扇窗时，线通道 `linesOf` 约 170 ms，是挂载耗时的大头。先用合成的窗多的长墙量出耗时与内存，超出可接受范围才改算法；改了的话 `wall-lines` 在语料上的输出逐字节不变。

证明：量法与数字进 PR；关键帧、Mesh3D、GLB、事件表零差。不许：移动任何钉子；本地 bless 关键帧。

### RM8.3 · 3D 画出庭院（backlog VA.2） — `done` · #701 · `594ba1c7`（2026-11-11T06:12:04Z） · 4 日（主会话估） · opus · 依赖无 · **不是缺陷修复**：赶不上约 11-21 的切点就等 12-02

**实际交付与卡不同之处：** 9 种 `outdoor` 地面与围栏进 Mesh3D；室外地面比楼板抬高 0.5 mm；增加庭院住宅（courtyard-house）的关键帧。**地面平面只由查看器画，作为背景，不属于建筑，也不进 GLB**（受托裁定，所有者可一句话推翻；`../public-surfaces/3d.md` §2 的固定句因此不改）。账本的 `m1-omits-outdoor-fences` 已换成各默认值的条目。评审留下的两项记为 RM8.3b。`packages/archlang-3d` 的版本 bump 搭 1.59.0。

（以下为原卡。）

Scene3D 已经带 `outdoor` 与 `fences`（`src/scene3d/build.ts` 的 `outdoorOf`、`fenceOf`），Mesh3D 今天不建它们，并记账本 `m1-omits-outdoor-fences`（`src/mesh/build.ts`）。本卡：
- 9 种 `outdoor` 地面（`OUTDOOR_KINDS`：lawn、planting、paving、deck、gravel、water、driveway、patio、balcony）各建一块薄板，每种一个带账本的默认颜色。颜色取自 2D 主题：核心的 `GROUND` 表（`src/elements/outdoor.ts`）让每个种类读三个主题键之一（`tint`：`lawn`、`paving`、`water`），所以 9 种今天只对应 3 个底色；3D 先照这张表取色（经核心公开导出的 `THEMES`，ADR 0031 的缝），种类之间要不要再分色（例如 deck 与 gravel），在 PR 里论证，分出来的每一个都是 3D 调色板里的一项并进账本。
- 围栏（`picket`、`panel`、`post`）各建一个按样式的低面数剖面，高度是带账本的默认值。
- 建筑之外的地面平面：一个带账本的默认尺寸与颜色。它放进 Mesh3D（每张图的 GLB 都会变，含 laneway 的 Mesh3D 与 GLB 钉子），还是只在查看器里画（只动关键帧与海报），在 PR 里选一种并写明理由。
- 去掉账本里的 `m1-omits-outdoor-fences`，换成每项默认值的条目（ADR 0030 决定 5，V-D4）。
- 重生成 `docs-site/public/3d/`（`npm run gen:3d-assets`；有 `outdoor` 的图会变，例如 hillside-villa）。

证明：每种地面和每种围栏样式一个最小夹具，Mesh3D 里有对应节点、GLB 过 glTF-Validator（V-GLTF-01，CI）；没有 `outdoor`、`fence` 的图 Mesh3D 与 GLB 零差（laneway 与 two-storey 没有，除非选了"地面平面进 Mesh3D"）；钉子只按 V-D5 带理由移动，理由写进提交与测试注释；核心的 SVG、`describe()`、`lint()` 零差。

不许：在冻结期（11-24 → 12-01）合并；为地面加位图纹理、UV 或 `TEXCOORD_0`；给 3D 加核心没有的地面种类；读 `label` 决定地面；没写理由就移动钉子；改核心的主题值或 `GROUND` 表。

### RM8.3b · 庭院地面的深度精度与 `build --json` 的计数（2026-11-11 加，出自 #701 第二轮评审） — `todo` · 未估 · opus · 依赖无（线下）

- 0.5 mm 的抬高小于 Blender 视口与其他 GLB 查看器在建筑尺度下的深度精度，庭院的 patio 在那里仍可能闪烁。三选一并在 PR 里论证：开放天空的地面之下不放楼板进 GLB；室外地面比楼板抬更大一点；或在 `docs-site/3d.md` 写明 GLB 的这条限制。
- `build --json` 每层的计数不含 outdoor 与 fence 节点，补上或写明。

证明：按所选做法的最小夹具；其余图的 Mesh3D 与 GLB 零差（或钉子带理由移动）。不许：本地 bless 关键帧；改核心。

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

### 冻结期设计稿（五份，纯文档，可由第二个执行者并行；第五份 `visual-language.md` 于 2026-11-11 随第 8 轨加入）

放 `design/`（本目录下，冻结期才建）。每份是对应卡开工前要读的设计，不是实现：
- `schema-policy.md` → CR11a：`$id` 与变更、弃用政策草案。
- `walls-facts.md` → RM7.2：字段按 `_derivedWalls` 的真实形状（`points[]`、`closed`、`between` 或 `ring`、厚度、类别、状态，`src/elements/walls-from-rooms.ts`）；按墙 `id`（即 piece 名）与 `heights.walls[]`（`src/describe.ts` 的 `{ id, height }`）、`describe --facts quantities`（`src/analyze/quantities.ts` 按 `id`）对齐；已有的 `describe().derived_walls[].name` 是 spec 名，CR8 切分后一个 spec 对应多个 piece，设计稿要交代新事实与默认 `derived_walls` 的关系；写明"段的粒度在 CRF1 之后才稳定"；新事实进 `engineProbeParts`（`test/helpers/byte-identity-payload.ts`）；消费者一栏照实写。
- `slab-and-section.md` → RM6.1：DS11 并入时的四件事（拼写取 DS11 的 `section A (x,y)->(x,y)` 还是 #544 的 `from … to …`；进 `describe` 主体还是 opt-in 事实；多层平面上剖切符号画在哪一页；`section` 写进日后 DS5 的 `level a..b` 时 id 怎么不重复，定不下来就保留对 DS5 的依赖）；净高子句的拼写，按 RM-D17（MF-D11 的受托裁定，`README.md` §6.2）。
- `plan-json-scope.md` → RM3.1：范围表，逐个顶层语句对 `src/plan-json*`；列出 J16（每扇窗写 `sill`）与 PS0.18（Hall 往返成 `uses entry`，待所有者裁定，未裁则标 `dropped`）。RM8.7 的"3D 读 `floor`"在这张表里一起定（`floor` 今天在 `PlanJsonDroppedClause` 里，`src/plan-json/to-json.ts`）。
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

RM8.1 是查看器缺陷修复，冻结期允许合并；但海报要在 Show HN（12-01）前部署，关键帧重钉还要一轮 CI，所以目标是冻结前合并。（2026-11-11：RM8.1 与 RM8.2 已由 #691 合并，`main` 推送即部署了新海报；Deploy run 42937898404 success。）RM8.2、RM8.3 不是缺陷修复，冻结期不合。`visual-language.md` 见上面的设计稿列表。

---

## 阶段 D · 批次 C′（12-02 → 12-16；1.60.0 约 12-21 切）：契约、出处、公开检查集、无损

执行顺序以 `README.md` §3 的表为准：CR11a → RM1.6a（若阶段 B 没做完）→ RM1.6b → CR10 → RM3.1 前半 → 发布 1.60.0，线（12–14.5 日 = 11–13.5 + 发布 1）以下 RM3.1 后半 → PS7.9（若没做完）→ CR11b + RM3.2 → RM4.3。CR9、CR12、RM2.2 在阶段 E 线下。1.60.0 避开 Product Hunt 那一周。RM3.1 按 RM-D10 拆成两半。RM5.4 在线下，12-02 之后才开工。

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

v1 的 RM3.1 拆成两半（RM-D10，所有者 2026-11-11 批准）。前半：
- 范围表：按设计稿列出 Plan JSON **声称承载**的形式（逐个顶层语句对 `src/plan-json*`），含 J16（每扇窗写 `sill`）与 PS0.18（待所有者裁定，未裁则标 `dropped`）。
- 往返律：新增 `test/plan-json-roundtrip-law.test.ts`：范围内的每个示例 `-f json` → `--from-json` → SVG + `describe()` + `lint()` 字节恒等；范围外的形式在 Plan JSON 里显式标 `dropped`。`place` 在后半做完之前标 `dropped`。
- PS0.21：`outdoor`、`fence` 进 Plan JSON（可选新键，不破坏）；schema 变更按 CR11a 的政策记录。

证明：往返律测试；范围表进 PR 说明。这张表与这条法则就是 CR12 conformance 语料的第一条。

不许：给 Plan JSON 加任何 3D 字段或只出不进的字段；自己定 `$id` 版本；为了绿而把形式移出范围表却不标 `dropped`。

### 发布 1.60.0 · 约 12-21 · 1 日

线上合并项切一个 minor（发布由所有者决定，发布链含 tag 由代理跑），步骤同 RM0.3；避开 Product Hunt 那一周。

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

### RM5.4 · `@modelcontextprotocol/ext-apps` 2.x 迁移（#603） — `todo` · 未估 · opus · 依赖 2026-12-02 之后；与 RM1.6b 共用一次 `packages/mcp` bump · 高风险层

RM-D19 的受托裁定：Dependabot #603（1.7.5 → 2.0.4，主版本，CI 在 "Workspace builds" 上红，`packages/mcp-worker/src/server.ts` 的 `TS2353 'title' does not exist in type 'McpUiAppResourceConfig'`）Show HN 之前不合并，之后由本卡迁移。
- 先读 `ext-apps` 2.0 的 release notes，列出影响本仓库的破坏性变更。
- 修好 workspace 构建（`packages/mcp-worker`）。
- 证明托管的 app 仍能渲染（ChatGPT app 的 UI 层）。
- 与 RM1.6b 共用一次 `packages/mcp` 版本 bump（`packages/mcp/server.json` 两处同步）。
- 风险层是 high：评审 + 协调者判断后合并（`docs/agents/commands.md` § Merging a PR）。

证明：CI 的 "Workspace builds" 绿；托管 app 的资源在部署后能取到并渲染（记录请求与截图在 PR 说明，不进测试）；MCP 工具的输出除 bump 外不变。

不许：2026-12-02 之前开工或合并；在没读 release notes 的情况下改代码；为了绿而降低 TypeScript 检查；与 RM1.6b 以外的 MCP 改动另做一次 bump。

### 第 8 轨（视觉）· 阶段 D

视觉车道 RM8.3（若阶段 B 没做完）→ RM8.4 → RM8.5 → RM8.6，合计 8.5 日（RM8.3 顺延过来时 12.5 日）（`README.md` §3 阶段 D）。

### RM8.4 · 把色彩主题亮出来 — `done` · #695（`6683c788`）+ #702（`1d5f46a4`） · 1.5 日（主会话估） · sonnet · 依赖无（backlog VA.4，从 RM5.2 提前到这里）

**状态（2026-11-11 06:45Z）：两半都已合并。** RM8.4b 由 #702 于 2026-11-11T05:20:29Z 合并。

**下面是 01:45Z 的状态（历史）：CLI 一项已交付，只剩 RM8.4b。** 实际在阶段 B 就做了（排期把它放在阶段 D）。CLI `--theme <name>` 由 #695 合并（2026-11-11T01:44:52Z，合并提交 `6683c788`）：接受它的命令是 `compile`、`batch`、`md`、`preview`、`watch`，`-f json|txt|dxf` 退出 3。#695 经三轮才合并：评审 L 的 blocker（`test/cli-theme.test.ts` 违反 `test/no-duplicate-helpers.test.ts`）、单测超时守卫与 flag 矩阵的棘轮都满足了，没有动任何允许名单。**本卡剩下的都在 RM8.4b**：docs 示例页与 gallery 的 `rendered` 版本，以及 playground `#theme` 下拉框在手机宽度下的核对。RM8.4b 做完时本卡改 `done`（评审 L 的 M3）。

`rendered` 主题今天只能由源文件里的 `theme rendered` 或库调用的 `CompileOptions.theme` 选中；CLI 没有 `--theme`（`src/manifest.ts` 与 `docs/cli-reference.md` 都没有）。
- CLI `--theme <name>`：按 `.claude/commands/new-cli-flag.md` 注册，`src/manifest.ts` 一行，`npm run gen:cli` 重生成 `docs/cli-reference.md`。可选名从核心公开导出的 `THEMES` 派生，不重抄。CLI 把选中的主题作为 `CompileOptions.theme` 传入；按 `src/types.ts` 的说明，这个选项压过源文件的 `theme { … }`，帮助文本照实写出这一点。未知的名字给出可选名列表。
- playground：主题下拉框已有（`playground/index.html` 的 `#theme`，含 Rendered，`playground/src/main.ts` 读写它）。本卡只核对它在手机宽度下能不能被找到，找不到就调位置，不另做一个切换入口。
- docs 的示例页与 gallery 提供 `rendered` 版本：由生成器出图（扩 `scripts/gen-example-svgs.ts` 或同类生成器，`check:drift` 守着），不手做；站点仍只用浅色（`AGENTS.md`）。

证明：不带标志时，语料上每个 CLI 命令的输出逐字节不变（字节恒等，测试取 digest）；`arch compile <plan> --theme rendered` 与 `compile(src, { theme: THEMES.rendered })` 的 SVG 逐字节相同（测试）；`describe()` 与 `lint()` 不接主题（`src/types.ts`），零差；生成的 `docs/cli-reference.md` 与示例图在 CI 的 `check:drift` 绿；`docs:build` 绿。

不许：改默认主题或任何现有主题的值（`test/fixture-byte-identity.test.ts` 第 1 组红就是缺陷，ADR 0023 决定 6）；手改 `docs/cli-reference.md`；新增主题名；在本卡给 MCP 工具加主题参数；让站点出现深色页面。

### RM8.4b · 示例页与 gallery 的 `rendered` 版本（RM8.4 的后半） — `done` · #702 · `1d5f46a4`（2026-11-11T05:20:29Z）（2026-11-11 加，出自评审 L 的 M3）

**实际交付与卡不同之处：** `/examples` 与 `/gallery` 上每张图一个"Rendered colours"开关。**没有登记 `GENERATORS` 一行**：`test/agent-gallery.test.ts` 禁止脚本读 `docs/gallery`，而 gallery 的 rendered 图是站点构建时由 `sync-docs.mjs` 生成的、不提交，所以没有可让 `check:drift` 守的产物。

（以下为原卡。）

内容：
- 扩 `scripts/gen-example-svgs.ts`，或写一个同类的生成器，为 docs 的示例页与 gallery 出 `rendered` 主题的图；生成器经核心公开的 `compile(src, { theme: THEMES.rendered })`，与 #695 的 `--theme rendered` 同一条路，不重抄主题值。
- 新产物登记进 `scripts/generators.ts` 的 `GENERATORS`，让 `check:drift` 守着；接进 docs 页（`docs-site/` 的示例页与 gallery 的数据，按现有的 `sync-docs.mjs` 与页面结构），两种主题怎样并排或切换在 PR 里写明。
- 站点仍只用浅色（`AGENTS.md`、`.claude/rules/sites.md`）：`rendered` 是一张图的配色，不是站点的深色模式；不加 `.dark` 规则。
- RM8.4 的 playground 一项：在手机宽度下核对 `playground/index.html` 的 `#theme` 能不能被找到，找不到才调位置，不另做切换入口。

证明：生成的图在 CI 的 `check:drift` 绿；同一检出两次生成逐字节相同；默认主题的示例图零差；`docs:build` 绿；playground 的核对写进 PR（截图只作说明）。

不许：手做或手修任何图；改任何主题的值；让站点出现深色页面或 `.dark` 规则；把 `rendered` 图放进核心以外的渲染路径。

### RM8.5 · 把词表亮出来 — `todo` · 3 日（主会话估） · opus · 依赖冻结期的 `visual-language.md`（展示示例一节）；backlog D.8

`docs/furniture.md` 的符号目录（"The symbol catalogue" 一节）只有文字，没有一张图；评审用的前后对照样张工具从未提交（backlog D.8："`scripts/` has no equivalent"）；103 个家族里 42 个从未以 `furniture <词>` 出现在 `examples/**`（`README.md` §1.1d 第 2 条）。
- 提交样张工具（D.8）：从 `CANONICAL_FIXTURES`（`FIXTURE_FAMILIES` 的派生，`src/elements/fixtures-glyphs.ts`）与 `CATALOG`（`src/fixtures-catalog.ts` 的占地）生成每个家族的 2D 符号图，在 `scale 1:50` 与 `1:100`、各主题（默认、`blueprint`、`mono`、`dark`、`presentation`、`rendered`）下；D.8 的前后对照模式（两份检出，一张 PNG）一并做。按 D.8，它不进 `check:drift`。
- 3D 小图：每个家族一张，由 `packages/archlang-3d` 的 T0 生成器出（脚本在 `packages/archlang-3d/scripts/`，与 `gen:3d-assets` 同法），放在它的 2D 符号旁边（3D 永远配对平面，PS-D11）。核心不因此获得任何 3D 输出。
- `docs/furniture.md` 的目录配图；图由工具生成并提交，一条轻测试从 `CANONICAL_FIXTURES` 派生清单，断言每个家族都有图（不比像素）。
- 一到两个"带庭院的住宅"展示示例，用上从未露面的家族。它们怎样合法进入 `test/new-families-byte-identity.test.ts` 扫描的语料，按 `visual-language.md` 的带理由名单；法则本身不放宽。新示例同时进其他按示例取 digest 的语料，PR 里列出哪些测试多了行。

证明：样张工具对同一检出两次出图逐字节相同；"每个家族都有图"的测试绿；展示示例零 E，`arch lint --json` 的报出贴进 PR；字节恒等律在 CI 绿；`docs:build` 绿。

不许：手画或手修任何图；用 AI 图像；放宽字节恒等律，或在设计稿没写理由时改 `FAMILIES_BEFORE`、`NEAR_WORDS`；在 `docs/` 的 Markdown 围栏里写 2026-11-04 那一批的家族词（`.claude/rules/docs-prose.md`，用文字说明）；把样张工具放进 `check:drift`；让 3D 小图离开它的 2D 符号单独出现。

### RM8.6 · 门窗与楼梯的 3D 细部 — `todo` · 4 日（主会话估） · opus · 依赖冻结期的 `visual-language.md`（细部尺寸一节）；backlog VA.1

今天：门是放在墙厚中央的一块 40 mm 门扇，洞口侧面是光秃的墙体；窗是 40 × 60 mm 的框和 16 mm 的玻璃（`GLASS_MM`），都在切口中线上，没有窗台板（`src/mesh/build.ts` 头注释）；楼梯是实心阶梯体（账本 `stair-solid-default`）；`bean_bag` 由堆叠的圆角层构成，轮廓呈阶梯（VA.1），树冠同类。
- 门框与门套；窗台板与洞口侧面；楼梯做出踏步与栏杆（不再是实心体块）；树冠与 `bean_bag` 用 `profile` 平滑截面（`src/mesh/t0.ts`）。
- 每个默认尺寸进 `assumptions[]` 账本（ADR 0030 决定 5，V-D4），尺寸按 `visual-language.md` 取墙厚或洞口的比例。
- 只做四分之一转，整数 µm，每个壳体封闭（V-GEO-02，`src/check/verify.ts`）。
- 手性：符号"永不新增手性"的规则只管 2D（`test/glyph-chirality.test.ts`）；3D 里镜像跟核心走：有手性的部件按核心 Plan JSON 的 `mirror` 反射（V-D3、`T0_HANDED`、`handedAt`），门的细部按核心画出的开启侧，不另行推断。
- 动的钉子：门、窗、楼梯出现在 laneway 与 two-storey 里，所以 laneway 的 Mesh3D 与 GLB SHA-256、事件表若有变化、关键帧基线都会动：Mesh3D 与 GLB 按 V-D5 带理由移动（提交与测试注释）；关键帧按 RM8.1 写的 CI 打印值流程重钉；资产重生成（`npm run gen:3d-assets -- --videos`）。

证明：每类细部一个最小夹具；`packages/archlang-3d/test/t0.test.ts` 绿；GLB 过 glTF-Validator（CI）；核心的 SVG、`describe()`、`lint()` 零差；每个移动的钉子在 PR 里列出旧值、新值与理由。

不许：碰核心（`src/`）或 2D 符号；不带理由移动钉子，或在本地 bless 关键帧；做任意角度旋转；用 PBR、位图纹理或 UV；让一个对称家族在 3D 里变成有手性（手性只从核心的 `mirror` 来）；漏记任何默认值。

### RM8.10 · 两种墙高的 T 形交接：较低的墙拥有交叉块时，较高的墙在其上方有真实缺口 — `todo` · 未估 · opus · 依赖一次设计裁定（ADR 0030 决定 5 的范围内，记入 `README.md` §6）（2026-11-11 加，出自 #691 期间的报告）

报告：T 形交接处两面墙高度不同，交叉块判给较低的 stem 时，较高的贯通墙在 stem 上方有一个真实的缺口，Mesh3D 与 GLB 里都有（平面图里没有）。2026-11-11 复核属实：`packages/archlang-3d/test/wall-lines.test.ts` 的夹具 "a T of two heights"（stem `s` 高 2000、厚 150，贯通墙 `t` 高 3000）用 `archlang3d build --json`（0.5.0）构建，报出 `W3D_MIXED_HEIGHT_JOINT`："Wall s (2000 mm high) owns 22500 mm² of the taller wall t's footprint (3000 mm), so the taller wall is notched where they meet."。这不是遗漏，是既定做法：ADR 0030 决定 5 写"Mixed wall heights at a joint keep the core's ownership and are reported (`W3D_MIXED_HEIGHT_JOINT`), never silently repaired"，`packages/archlang-3d/src/walls/ownership.ts` 的 `mixedHeightJoints` 注释同此；`test/h1-ownership.test.ts` 断言已发布的示例里没有一处触发。RM8.1 的轮廓线只画看得见的表面，所以缺口在 3D 预览里照实可见。

内容：先写一页设计，列出做法并交裁定：(a) 保持现状，只让查看器把这条警告显示出来（`../preview-and-remodel/README.md` 第 179 行已提到查看器要显示这条警告）；(b) 3D 包在交叉块上方为较高的墙补一块（等于在 3D 里改写归属，与 ADR 0030 决定 3 "The package writes no second wall joinery" 与决定 5 冲突，需要改 ADR）；(c) 核心改归属的平局规则（会动语料的 SVG，是核心行为变更）。裁定之后再写代码。

证明：裁定的出处；若做 (a)，警告在回放 HTML 与 playground 的 3D 页签里可见，夹具上有测试；任何做法下，已发布示例的 Mesh3D、GLB、关键帧零差（它们今天都不触发这条警告）。

不许：没有裁定就改几何；静默修补（ADR 0030 决定 5）；在 3D 包里另写一套墙体拼接；改核心的归属规则而不按核心行为变更论证。

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

4.5（草坪、水面当可走 → `outdoor` 地面种类决定可走性）、M.4（竖井到达层的叠加与行进方向）、U.22/PS0.15（`describe()` 步数预算与净面积项的二次复杂度）、PS0.6（`suggest` 经卧室给房间连门）。**2026-11-11 加（RM1.3a 执行者的发现）：** `accessibility-advisory` 下瓶颈是楼梯梯段本身时，`W_PATH_TOO_NARROW` 不指名任何门，hint 却说加宽最窄的门或洞口；它应当说瓶颈是梯段。

**2026-11-11 加（RM1.3a 合并后的余项）：**
- 楼梯可达的楼层上，每个阳台要各有一个独立的室外节点（`src/analyze.ts:536`，`src/lint/rules/reachability.ts:68`）。
- circulation 叠加层要拿到该层的竖井到达点（`src/overlays/circulation.ts`），使 garden-house 的 L2 与 `describe()` 一致。
- 去掉 `test/far-seed-pinch.test.ts:297` 的 skip。
- 多楼梯、多阳台的楼层补深度测试。
- garden-house 在 `accessibility-advisory` 下的 `W_PATH_TOO_NARROW` hint 不再指名门（正确：800 的楼梯才是瓶颈）；核对措辞。

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

### RM8.7 · 地面材质 — `todo` · 4 日（主会话估） · opus · 依赖 PS7.9、冻结期的 `visual-language.md`（地面一节）与 `plan-json-scope.md` · `[语法：词表]`

今天：`room … floor tile|paving|deck|concrete`（`FLOOR_MATERIALS`，`src/hatches.ts`）只画一层单色的裸图案，不进 `describe()`、`lint()`（`test/room-floor.test.ts` 的孪生律），Plan JSON 把它列为 `dropped`（`src/plan-json/to-json.ts`），3D 完全看不到它；3D 的地面颜色由 `floorFinish(uses)` 按 `FLOOR_FINISH_RULES` 猜（`packages/archlang-3d/src/materials.ts`，账本 `floor-finish-default`）。`examples/**` 里没有一张图写 `floor` 子句。
- 2D：`floor` 加 `timber`、`carpet`、`stone`（名字按设计稿）。每个词一个裸图案（`src/hatches.ts` 的 `META`，线色跟主题，冻结的分数表，不用随机数）；`rendered` 主题下带浅色块，其他主题与默认主题逐字节不变（色块走 `rendered` 的 `materialTints` 还是一个默认值等于今天行为的新主题键，按设计稿）。DXF 写对应的 `HATCH` 名，PDF 平涂。
- 2D：`outdoor` 加 `sand`、`soil`、`stepping`（名字按设计稿）：`OUTDOOR_KINDS`（`src/ast.ts`）、`GROUND` 表一行（`src/elements/outdoor.ts`，底色取现有三个主题键之一）、需要时的新图案；`gen:*` 重生成语法、GBNF、TextMate 与 spec（闭集从源头派生）。
- 3D 读作者写的 `floor`：经核心新增的**加性公开导出**取数（`.claude/rules/archlang-3d.md`：带自己的字节恒等证明，不深 import），或在 RM3.1 的范围表把 `floor` 移进 Plan JSON 且往返律成立；两条路在 `plan-json-scope.md` 里与 RM3.1 一起定。作者写了 `floor` 就用它，没写时才用 `FLOOR_FINISH_RULES` 的默认，并照旧记账本。新的 3D 地面词与新 `outdoor` 种类的 3D 颜色在同一张卡里交付（V-D6 的同卡规则，用于地面），RM8.3 已建的地面按种类补上新词。
- 法则：字节恒等律，不用新词的图 SVG、`describe()`、`lint()`、诊断逐字节不变（AGENTS.md 硬规则；V-D7 的"语料上 `describe()`/`lint()`/诊断不变"）；`floor` 的孪生律（`test/room-floor.test.ts`）对新词也成立。
- 取名：`carpet` 今天是 `rug` 家族的别名，`stone` 在 `NEAR_WORDS`（`test/helpers/new-families-law.ts`，钉的是"不是家具词"）里，也是 `FIXTURE_MATERIALS` 的材质名；两者在语法上位置不同，但设计稿要逐个写明会不会混淆，必要时换名。
- 成本：见上面"词表卡的 spec 成本"。

证明：每个新词一个最小夹具；字节恒等律与孪生律（CI）；`gen:*` 的产物在 `check:drift` 绿；一张写了 `floor timber` 的图在 3D 里是作者的地面，同一张图去掉 `floor` 后回到按 `uses` 的默认（测试）；没有 `floor` 的图 Mesh3D 与 GLB 零差，laneway 的钉子不动。

不许：加新子句（给 `floor` 加颜色、`scale`、`angle`，或 `finish …` 一类新写法，那是另一种语言形式）；重画或改动墙材料的图案（`.claude/rules/glyphs.md`："Ground-material work never re-frames or restyles a wall material's hatch."）；读 `label` 决定地面（VA.3 仍是所有者的 `decision`）；改 `FLOOR_FINISH_RULES` 的默认（会动每张有房间的图的 Mesh3D 与 GLB）；从 3D 包深 import 核心；不先削重复就提高 spec 上限；用位图纹理。

### RM8.8 · 接触阴影与环境遮蔽 — `todo` · 3 日（主会话估） · opus · 依赖冻结期的 `visual-language.md`（阴影一节）

RM-D23 已获所有者批准（2026-11-11）。backlog VA.5："Revisit only with a cheaper technique (baked contact shadows) and a frame-time budget." V9 的阴影图在 SwiftShader 上多约 55% 帧时间，超过当时约 30% 的预算（`mount.ts` 灯光处的注释）。
- 由几何确定性烘焙的地面接触阴影，和墙脚、墙角的环境遮蔽；不用实时阴影图。放进 Mesh3D 与 GLB 还是只在查看器里，按设计稿。
- 帧时间预算：数字与量法按设计稿（SwiftShader，1600 × 900，与 V9 同法），超出预算不合并。
- 确定性：同输入同字节、同帧哈希；不读时钟或随机源。
- 只在 `packages/archlang-3d` 里。2D 符号的"无阴影"（ADR 0023 决定 5）不动。
- **公开的那句话同 PR 改**：`PREVIEW_LIMITS`（`packages/archlang-3d/src/replay/payload.ts`）今天是 "3D preview: walls, openings, floors, stairs and furniture in flat colours; no pitched roofs yet, and no sections, elevations or BIM."。要求同一句话的测试与面：`packages/archlang-3d/test/package-meta.test.ts`（包 README）、`packages/archlang-3d/test/replay.test.ts`（回放 HTML）、`packages/archlang-3d/test/docs-site.test.ts`（`docs-site/three-d.mjs`，以及 `docs/plans/public-surfaces/3d.md` 里引用的那句）、仓库根的 `test/readme-3d.test.ts`（`README.md`、`packages/mcp/README.md`、`editors/vscode/README.md`）、`playground/e2e/preview3d.spec.ts`（逐字抄了一份）。另有手写的同义说法：README 两张海报的 alt 文本（"in flat colours"）、`docs-site/3d.md` 的正文。新句子仍用"3D preview"，不出现 render、photoreal、walkthrough、model。
- 动的钉子：关键帧基线按 RM8.1 写的 CI 打印值流程重钉；若进了 Mesh3D 与 GLB，laneway 的两个 SHA-256 按 V-D5 带理由移动；资产重生成。

证明：帧时间实测在预算内（数字进 PR）；上面每个测试改成新句子后绿，`grep "in flat colours"` 在仓库的公开面上不再命中旧句；同一环境两次出图逐字节相同；每个移动的钉子带理由。

不许：实时阴影图；PBR、位图纹理、HDR 天空或昼夜；让任何物体发光（MF-D2：照明不做）；只改一部分公开面的句子；把阴影说成 photoreal 或 render；动 2D 的符号或主题。

### RM8.9 · 新家族首批 — `todo` · 6 日（主会话估） · opus · 依赖 PS7.9、冻结期的 `visual-language.md`（家族一节） · `[语法：词表]`

十二个家族（名字按设计稿）：空调内机、空调外机、冷柜、酒柜、展示柜、屏风、贵妃榻或日床、泳池、院门、凉亭、温室、墙上挂画。每个家族的 2D 符号与 3D 生成器同卡交付（V-D6），按 `.claude/commands/new-fixture-family.md` 逐步：
- 2D：`src/elements/glyphs-<group>.ts` 的画法（先画轮廓、尺寸取占地分数、墨不出占地、四分之一转，`.claude/rules/glyphs.md`）；`FIXTURE_FAMILIES` **末尾**追加（V-D7，中间插入会改写所有含家具的图的图例顺序）；`DRAW_BY_FAMILY`、`FIXTURE_FAMILY_MATERIALS`（`src/elements/fixtures-glyphs.ts`）；每个词一行 `CATALOG`（`src/fixtures-catalog.ts`）；`test/tables/glyph-dispatch.json` 的行；对称家族在 `test/handedness-grid-baseline.ts` 记 `"none"`，不新增手性（`test/glyph-chirality.test.ts`）。
- 3D：`packages/archlang-3d/src/mesh/t0-*.ts` 各一个 T0 生成器（贴合占地、四分之一转、整数 µm、默认关于宽度对称；有手性的按核心 `mirror` 反射），每个默认（高度、挂高 `T0_MOUNT_MM`、材质、饰面）进账本；目录内的词没有生成器就是灰盒，`packages/archlang-3d/test/t0.test.ts` 会红。需要新材质时核心的 `FIXTURE_MATERIALS` 先行（`test/material-vocabulary.test.ts`）。
- 字节恒等律：不用新词的图 SVG、`describe()`、`lint()`、诊断逐字节不变；已发布的 `.arch` 与 `docs/` 的 Markdown 围栏里都不出现新词（展示走文字，或按 RM8.5 设计稿的名单）。现有的 `test/new-families-byte-identity.test.ts` 断言 `CANONICAL_FIXTURES.length` 等于 `FAMILIES_BEFORE + 20`（`FAMILIES_BEFORE = 83`）、最后一个新词是 `desk_pod`：第 104 个家族一加它就红。本批带自己的律（按 103 个家族重量），并在 PR 写明理由；不许只改数字让它变绿，也不放宽旧律。
- 取名避开 `NEAR_WORDS`（`rack`、`lamp`、`table_lamp`、`stand`、`trunk`、`planter_box`、`stone`），否则要带理由改这个名单；`screen` 已是材质名。
- 边界：凉亭的顶是生成器的一部分（家具几何），不是屋顶元素（3D 坡屋顶是 backlog 3D.4）；泳池是一个家族（带池沿的物体），`outdoor water` 照旧是水面；院门是独立家族，不让 `door` 宿主到 `fence` 上（`fence` 的门按名字推迟）；挂顶物与窗帘不在本批（MF14、MF15）。
- 手写的计数跟着改：`docs/furniture.md` 的 "A hundred and three families, a hundred and sixty-three names"、`docs/overview.md` 的 "163 words across 103 families"；`docs/furniture.md` 的符号表行。
- 成本：见上面"词表卡的 spec 成本"；`npm run gen:all` 重生成 `spec.llm.md`、`llms-full.txt` 等。

证明：`.claude/commands/new-fixture-family.md` 列的守卫全绿（CI）：`tsc`、`test/glyph-dispatch-table.test.ts`、`test/rendered-theme.test.ts`、包含性检查、`test/drawing-budget.test.ts`、`test/glyph-chirality.test.ts`、`t0.test.ts`、新批次的字节恒等律；laneway 的 Mesh3D、GLB 钉子与关键帧不动（现有示例不出现新词）；`check:drift` 绿。

不许：在 `FIXTURE_FAMILIES` 中间插入；让符号读 `label`；新增手性；留灰盒；材质不经核心就进 3D；在 docs 围栏里写新词；放宽或改写旧的字节恒等律来变绿；冻结期合并；让任何家族发光（MF-D2）。

---

## 阶段 F · 批次 D（2027-01-10 起）：按证据重排

### RM6.1 · 剖面所需的两个事实 — `todo` · 5 日 · opus · 依赖 PS7.9、冻结期的 `slab-and-section.md` · `[语法]` ×3 · **批次 D 首位（#532 触发）**

MF-D1（`../math-foundations/README.md` §6.1 第 3 条）要求 MF-D11 在本卡的 PR 里解决；MF-D11 已由 RM-D17 受托裁定（`README.md` §6.2，2026-11-11），本卡按它落地，不再等它。本卡不改 MF-D1。

外部用户（#532，`gerontec/archlang-section`）只用 `describe --json` 与 `compile -f json` 画出了剖面，缺两件事，都是 `describe()` 的数据，不是核心的绘图：

1. **平面剖切符号**（DS11 提前）：`section A from (700, 0) to (700, 9000) look east`（拼写按设计稿定：DS11 的写法与 #544 的不同）。平面图元素（`src/elements/section.ts`，注册在 `defs.ts`，带 `drawCost`/`bounds()`/`measures()`）：画剖切线两端的符号与编号，这是 GB/T 50001 和 ISO 128 都有的平面图要素，核心允许。`describe().sections` 带出线段与观察方向，或按设计稿改为 opt-in 事实。只允许轴对齐（与 #532 的工具一致；斜切等第二个用例）。多层平面上画在哪一页、与 DS5 的 id 是否冲突，按设计稿。
2. **楼板构造 datum**（2026-11-10 MF-D1 已裁定采纳，见 `../math-foundations/` §6.1；顶层和单层的天花来源 MF-D11 由 RM-D17 裁定，见第 3 条）：在 `level` 上一个由 `gen:*` 闭集定的子句（候选 `slab <mm>`，或 `floor { structure <mm> finish <mm> }`），**核心不画它**（铁律：高度不画），只进 `describe().heights`（以及 Plan JSON 已承载的高度字段，MF-D1 第 1 条），使第 n 层净高 = 第 n 层的 `height` − 第 n+1 层的楼板可派生。Plan JSON：楼板子句进 Plan JSON，或在 RM3.1 的范围表里标 `dropped`。没写时按 MF-D1 第 2 条：全图一层楼板都没写时，`describe()` 一字不变，不输出板厚和净高，也不加跳过说明；只有至少一层写了楼板时，没写的层才在"跳过了什么"里注明（ADR 0027）。
3. **净高子句**（RM-D17）：第三个 `[语法]` 形式，带自己的字节恒等律。一个 `level` 可以写一个净高值，作者写了就用；中间层没写的，取本层层高减上一层写的楼板；顶层或单层没有作者值的，什么也不报，并给出 coverage 原因；作者的值与推算值不一致时出一条诊断。拼写由 `gen:*` 闭集定，在 `slab-and-section.md` 里定下。

证明：每个形式各自的字节恒等律（一层楼板都没写的图，SVG、`describe()`、`lint()` 三处都逐字节不变，MF-D1 第 2 条）；`describe()` 变化只在用了新子句的图上；`archlang-section` 的示例 `haus_winders.arch` 加剖切线后 `describe --json` 能喂给它（在 PR 里跑一次该工具作说明，不进测试）。

不许：在核心画任何高度或剖面；把剖面放进 `describe()` 以外的核心输出；碰 DS13（它在 `archlang-3d`，按 D3 等 Show HN 之后）；给没写楼板的图加跳过说明；用默认值去猜板厚或顶层净高；不写作者值时推算顶层或单层的净高。

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
| PS0.16 升 E、无宿主门洞升 E | 2.0 major（与 V.5、V.6、6.7 同桶；RM-D16） |
| CRF9 预览图 CJK 字体 | parked（Worker 体积，ADR 0034 的已知缺口） |
| RM8.1 后的同类位置（楼梯梯段与平台、地面在门洞下的交界） | RM8.1 合并后仍有人指出 3D 的线或缝（`README.md` §5） |

残留卡（CRF3–CRF13、RM4.4、v1 波次 3 的既定项）的去向表在 `README.md` §7.1。
