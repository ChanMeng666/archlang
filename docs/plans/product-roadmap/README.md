# 产品开发规划：让 ArchLang 成为"会说不、会解释、改一处不动全局"的开放平面语言（2026-11-06）

**状态：** 已规划，未开工。基线 `main@5593484d`（core 1.57.0）。本轮只有文档，没有实现。卡片在 `cards.md`，证据对照在 `evidence.md`，恢复点在 `handoff.md`。初稿经一轮独立红队（13 条发现）修订。

**一句话：** 把 growth 仓库到 2026-11-06 为止的全部调研、决策和竞品分析，折成一份 ArchLang 自己的开发排期。它不替代已有的计划（checker-reach、drawing-set、plan-soundness、preview-and-remodel、public-surfaces、visual-assets、geo-seo），而是给它们排序、补缺、划界：哪些先做，哪些等信号，哪些永远不做。

**起因：** 所有者 2026-11-06 要求"按 archcanvas-growth 的调研、分析、思考、策略，做 archlang 后续的产品开发规划，目标是有竞争力、吸引用户、满足痛点、有独特优势、设计上专业优雅且克制"。

## 如何使用本文（给新会话）

1. 先读 `handoff.md`，确认当前位置。
2. 读 §1–§4，约十五分钟。动某张卡前，读它在 `evidence.md` 里引用的 growth 报告段落。
3. 选 `cards.md` 里依赖已完成、所在波次已开放的第一张 `todo` 卡。
4. 本计划的卡大多是**对已有卡的排序和打包**。打包卡落地时，被打包的原卡（backlog 的 `U.*`、`PS*`、`CRF*` 等）同时裁掉，不要留两份记录。
5. 法则照旧：`AGENTS.md`、`docs/agents/*`。各卡门禁见 `cards.md` §0。

---

## 1. 证据一页纸

三份只读报告（2026-11-06，`D:\.claude-scratch\2026-11-06\archlang-roadmap\`，归档后见 `evidence.md`）：A 战略综合、B 用户与竞品证据、C 仓库现状审计；加一份红队 D。下面只写结论和出处，细节在 `evidence.md`。

### 1.1 用户要什么（growth N4 的约 31 个外联线程，加 N5、X25、C6 的零散样本；频次是研究者的判断）

| 诉求 | 频次 | ArchLang 今天 | 本计划的回答 |
|---|---|---|---|
| 从已有图片 / PDF / 草图 / 房源页出图 | ~12 线程 + 2 竞品帖下的建造商提问，**最高** | `docs/from-an-image.md` 工作流（CR7 ①）；OpenPlan3D JSON 导入；一个实验性 mask→Plan JSON 工具 | 不把读图做进语言；把实验工具推进到"输出可 lint 的 `.arch`"，但只在第二个独立样本到来时开工（RM3.3） |
| "看着对、其实错"，能不能验证 | ~10 线程 + 7 条行家嘲讽 | 250 个诊断码，69 条 lint；缺陷语料 77/84；**首次接触复测：61 个缺陷中最终 lint 报出 12 个** | 第 1 轨：公开 check suite（CR10）+ 诚实的覆盖数字 + 行家点名而我们没有的规则（RM1.*） |
| 改一处全重画；楼层对不上；"在原有外壳里改" | ~5 + 3 | `keep`、`impact --lock`、`status existing\|demolish\|new`、`docs/edit-one-room.md` 都有（CR7 ②） | 第 2 轨：剩余的可见性（CRF11、技能循环顺序）、`arch diff`、编辑模型补全（RM2.*） |
| 3D / 漫游 / 渲染 | ~9 | `archlang-3d` 0.4.0；PS-D11（2026-11-06）：3D 预览配对平面出现在所有公开面 | 不新增 3D 能力；展示按 public-surfaces `3d.md` 走，本计划不碰 |
| 导出进既有流水线（IFC、DCjson、BOQ、英制） | ~6；IFC 仅 1 人 | SVG/PNG/PDF/DXF/Plan JSON/CSV；无 IFC | 英尺英寸显示（RM3.4）；IFC 只定触发，不承诺（§4、§5） |
| 家具放不放得下、门撞不撞 | ~5 | 间距、门扇、碰撞规则已有（`W_FURN_CLEAR_*`、`W_SWING_OBSTRUCTED`、`W_FURNITURE_WALL_COLLISION`） | 已覆盖；RM0.2 用它们写"编译器说不"的示例 |
| "我的代理不知道这个工具能做什么" | 1 个真实用户 + 2 条旁证 | CR7 ③ 加了能力摘要与常见错误页；`spec.llm.md` 29,695/30,000，MCP `INSTRUCTIONS` 879/900 | 第 5 轨：腾空间、把能力摘要放进 MCP 资源（RM5.1、PS7.9） |

### 1.2 行家怎么嘲讽 AI 平面图（Solvaix 197 万次曝光帖下的回复、Troche 的建筑师审稿、Opus 5.5 测试）

门浮在空中没有台阶；车库门比车门小；车停进去开不了门；门往不合理的一侧开；家具埋进墙里；走廊通向无处；没有指北针；没有场地；楼梯级高加起来对不上层高；写着"书桌角"却没有书桌；漏了第二疏散口；湿区不叠放；退界、覆盖率、容积率不对。报告 B 列了 19 条：**11 条已有码，2 条有码但适配未核实（级高总和、标签无实物），6 条无码**（指北针、场地、门浮在空中、第二疏散口、湿区叠放、退界容积率）。"门浮在空中"是立面层面的事，核心只画平面，进 §4。其余五条无码的和两条未核实的进 RM1.2。清单见 `evidence.md` §B。

### 1.3 战略层已定的边界（growth `strategy/decisions/` 与本仓库的所有者裁定，不在本计划内重议）

- ArchLang 以**分发与可信度**衡量，收入其次（2026-10-09）。可以按价值新增语言形式（2026-11-01 D29）。
- 消费者产品已 STOP（2026-11-01）；ArchCanvas 维护态、钉在 core 1.48；不做消费者功能。
- **3D（PS-D11，所有者 2026-11-06，`docs/plans/public-surfaces/3d.md` §1）：** 3D 预览出现在 ArchLang 的每个公开面，永远配对平面、同一源文件、由 `archlang-3d` 生成。它取代了"Show HN 保持 2D"和 Tier C 门。仍然有效的：用词禁令（永不"3D CAD / BIM / render / walkthrough / photoreal / model"，产品词是"3D 预览"）；3D 代码只在 `packages/archlang-3d`；核心不画高度。N10 读数照读，但**记为受干扰，没有人等它**。
- 可以作为**度量**声明的只有三件：可达性、精确面积、字节恒等。间距、宽度、步行距离永远是 advisory。禁止"first/only"、"code beats CAD"、合规/报批、"设计/布置/家具"、任何 IFC 承诺。
- "public check suite" 永不叫 benchmark 或 leaderboard（A2）；导入是功能事实不是标题（A3）。
- 没有遥测；eval 语料和 `test/defect-corpus/` 是公开夹具，不是留出集；新留出集只在私有 `archlang-lab` 里写；T3 永久拒绝。
- Show HN 冻结 2026-11-24 → 12-01：只修 bug、只发 patch、不加语言形式（checker-reach §3）。

### 1.4 两份先行路线图的分歧，本计划如何裁

growth 里已有两份 ArchLang 路线图：11-04 版把**格式与契约**（OAS/OpenPlan3D 互操作、规范版本、conformance、check suite）列为 P0；11-06 版把**规则与事实深度**（家具当碰撞几何、建筑师点名的规则、派生表格）列为 P0。两者都没列对方的 P0。

裁决：**两条都做，但顺序由"可信度先于可达范围"决定。** 一个会漏掉"走廊通向无处"的检查器，接入再多格式也不会被引用。所以第 1 轨（检查器可信度）和第 2 轨（编辑模型）排在 Show HN 前的空档里能做多少做多少；互操作批次 C 保持 checker-reach 已排的 12-02 → 12-16，日期不动；但它的前置——**Plan JSON 无损**（RM3.1）——放进波次 0，因为 OpenPlan3D 导出、OAS 和 conformance 语料都建在 Plan JSON 上，而它今天丢 `place`、丢 `outdoor`、默许矛盾的门扇方向。RM3.1 不加语法，冻结规则允许它在 11-24 前合并。

### 1.5 证据的薄弱处（照实写）

- 所有用户信号都小：外联回复 5–36 次浏览；唯一的外部 issue 作者是一个人；GitHub 30 星。
- 11-04 的"验证过的需求"是竞品的投入，不是用户的付费。11-06 的 P0 建在一条帖子下的 11 条回复上。
- 前沿模型可能自检得够好（Opus 5.5 首稿尺寸全对，三处小错一轮改完）。若如此，外部检查器的需求会缩。反证：同一测试仍需人工红线；另一个模型漏了第二疏散口。
- 3D 的诉求与检查的诉求一样多，最火的内容是奇观。PS-D11 已把 3D 展示放到所有公开面；本计划不再追加 3D 能力（光影、漫游），这条写进 §4。
- 检查这件事存在三十年（CORENET、Solibri）没有绑定行业。LLM 作者是否改变这点，是在测的假设。
- 首次接触复测（plan-soundness D7）是本计划衡量"可信度"的唯一尺子，而它最近一次是 2026-10-27。本计划排了两次复测（RM1.1）。

---

## 2. 原则（在已有计划的原则之上）

1. **先可信，再可达。** 每条新规则按层归位：**有效性**规则在合法图语料上零报、在私有留出缺陷上必报，否则不合并；**图纸完整性**（如没画指北针）走 `finish sheet` 的填充和 `validate --stage drafting` 的提示，不是默认 W；**文化或偏好**（如湿区叠放）走 `score --taste` 的 `A_*` 行或作者自报的 `keep`（ADR 0032）。公开的覆盖数字是首次接触复测的"N 个缺陷、lint 报出 k 个"，不是对着夹具写出来的通过率。
2. **克制的工具会说话。** 凡是改了作者输入的地方（单位猜测、网格吸附、默认值、丢弃的标签）都要出声；凡是算不准的地方省略并说明（ADR 0027）。本计划把所有"静默接受"当缺陷，但 Show HN 前只加 W，不把今天能编译的图变成 E（那是 2.0 的事）。
3. **一个编辑原语。** `keep` / `impact --lock` / `status` / `diff` 是同一件事的四个面：改一处、其余不动、看得见什么动了。它们在 README、docs、playground 起手、技能循环、MCP 说明里以同一组词出现。
4. **互操作去除反对意见，不做标题。** 导入导出是功能事实。IFC 不承诺，只定触发。读图永远不进语言，只进工作流和一个输出可 lint 文本的导入工具。
5. **语法只在非做不可时加。** 每张加语法的卡都标 `[语法]`，依赖 PS7.9（spec 腾空）先完成，带字节恒等律。本计划新增语法只有三处（RM1.2b 的 `keep site …` 度量、RM4.2 的 `schedule fixtures`、RM3.4 的尺寸单位显示），都可拒。波次 0 不加任何语法。
6. **图纸先像图纸。** 比例尺、图例、细线、净尺寸这些小而可见的缺陷，排在任何新能力之前；但会动金样的绘图修正不排在 Show HN 截图之前。
7. **记录不说谎。** 卡片状态、whats-new、README 里的数字与代码一致，不一致先改记录；红的 nightly（#497）先分诊。
8. **不做的事写明。** §4 的"不做"清单与"做"清单同等重要，这是"克制"的定义。

---

## 3. 排期

六条轨加一条基础轨，四个波次。时间锚点：Show HN 冻结 2026-11-24 → 12-01；**波次 0 的 minor 发布切点约 11-21**（冻结期只发 patch，切点后合并的 minor 内容等到 12-02）；checker-reach 批次 C 12-02 → 12-16；agent-reach 读数 2027-01-09；批次 D 2027 Q1。执行节律：一个执行者、一张卡一个 worktree、一次一个重命令（`one heavy process at a time`）。

### 轨

| 轨 | 名字 | 回答的痛点 | 优势（不用"唯一"） |
|---|---|---|---|
| 1 | **会说不、会解释** | "看着对其实错"；行家嘲讽清单 | 公开规则集 + 公开的首次接触覆盖数字；"服务器不跑模型" |
| 2 | **改一处不动全局** | 编辑重画、楼层不对齐、在原壳里改 | Maket、Drafted 对"上传已有图、在外壳里改"都答"还没有"；我们有 `keep`/`impact --lock`/`status` |
| 3 | **接得进去** | 其他开放格式、读图工作流、英制 | 开放文本、离线、确定性、能进 CI |
| 4 | **图纸像图纸** | 行家第一眼 | 专业、优雅、克制的落点 |
| 5 | **代理知道它能做什么** | Daniel 的"代理不知道能力" | spec 腾空、能力摘要 |
| 6 | **图纸集与 3D 能力（守门）** | 剖面、立面、指标 | 全部按既定触发，不在本计划内提前 |
| 7 | **基础：记录、无障碍、性能** | 可信度的地基 | 记录与代码一致；图纸可读屏；拼接不慢 |

### 波次 0 · 冻结前（2026-11-07 → 11-21 切点 → 11-23）：可信度与契约地基，不加语法

按序执行；切点前合不完的顺延到波次 2，不挤进冻结期。

| 序 | 卡 | 内容 | 轨 | 估 |
|---|---|---|---|---|
| 1 | RM0.1 | 记录修正：DS1/DS2、D1、PS0.2 裁掉；U.17 去掉会漂移的数字；`docs/whats-new.md` 到 1.57；playground README profile 数；#497 nightly 分诊；`docs/plans/README.md` 加本计划一行；growth `category.md`/`master-plan.md` 刷新稿记为另一仓库待办 | 7 | 0.5 |
| 2 | RM0.2 | "编译器说不、并说为什么"示例页：6–8 个最小 `.arch`，每个配 lint 输出与一句解释（门扇撞家具、房间不可达、卧室无窗、车库过窄、被 `keep` 锁住的元素被改）；给 X9 Show HN 回答稿复用 | 1 | 1 |
| 3 | RM1.4 | 静默接受改出声（只加 W）：U.2 裸米值、U.3 类别拼写、PS0.25/6.10 吸附（同一 PR 裁两条）、PS0.16 `set` 字串化 W（2.0 升 E，RM-D6）；U.4 不加诊断，label 由 `describe()` 与 `schedule fixtures` 带出（RM4.2） | 1 | 2 |
| 4 | RM1.3a | 可达性盲点第一批：PS0.3 多层经楼梯 `reachable:false`、U.1 阳台门算到达、6.11 双开门读成两窄门 | 1 | 3 |
| 5 | RM5.1 | MCP 能力摘要：`INSTRUCTIONS` 留一句能力句 + 指向新资源 `archlang://capabilities`（由 `manifest.ts`、`packages/mcp/src/tools.ts`、`EXPORT_FORMATS` 生成）；PS5.3a `validate` 返回 `next`；一次 `packages/mcp` 版本 bump（必须搭 11-21 的 minor，RM-D4） | 5 | 1.5 |
| 6 | RM3.1 | **Plan JSON 无损**：G.10/PS3.12/PS3.13 `place` 往返、PS0.21 `outdoor`/`fence`、PS0.20 门扇矛盾 W、U.7 导入改名 W；法则范围限定为 Plan JSON 声称承载的形式（PR 里列全）。RM-D4/D6 已裁，不再 blocked | 3 | 6 |
| 7 | RM2.1 | 编辑模型的剩余可见性：CRF11 playground 起手"改一个房间"；`skills/archlang/SKILL.md` 的 loop 把 `impact --lock` 提到编辑路径第一步 | 2 | 1 |
| — | **发布** | 约 11-21 切 minor（含以上已合并项） | | |

合计约 14.5 AI 日，±50%，17 个日历日。顺延优先级：RM2.1 → RM5.1 → RM3.1 的后半。

**冻结期（11-24 → 12-01）：** 只修 bug；X9 Show HN 回答稿；**RM1.1a 首次接触复测**（纯测量，不改代码：六份 brief、冻结提示，报出数写进 plan-soundness handoff §4，作为 CR10 发布时引用的数字）；收集 Show HN 评论作为 §5 的信号。

### 波次 1 · 批次 C（2026-12-02 → 12-16）：契约

| 卡 | 内容 | 轨 |
|---|---|---|
| CR9 | OAS 导入 + OpenPlan3D 导出（既定，建在 RM3.1 上） | 3 |
| CR10 | 公开 check suite（50 夹具）+ 托管 `POST /check`（既定）。**追加**：发布说明附 RM1.1a 的首次接触数字和"lint 跳过了什么"；一个最小 GitHub Action 示例（`npx archlang lint --json` 跑夹具），因为"第三方在 CI 里跑"是 CR10 自己的成功指标 | 1 |
| CR11 | `lang-1.0`、schema `$id`、GOVERNANCE 变更/弃用政策（既定）。**追加 RM3.2**：SBOM（CycloneDX）进发布流程；GOVERNANCE 加继任/第二维护者一行（11-04 专业度清单仅剩的两项 N） | 3 |
| CR12 | conformance 语料 100 例（既定，第一条法则就是 RM3.1 的往返律） | 3 |
| RM2.2 | `arch diff`（U.14）；先修 `diffPlans` 的 PS0.22/0.23；不依赖 RM3.1 | 2 |

批次 C 本身按 11-04 的规模估是 4–6 周的活，窄进 15 天；RM2.2 排在最后，批次 C 顺延时它先让。

### 波次 2 · Show HN 之后到 agent-reach 读数（2026-12-17 → 2027-01-09）：深度

按 Show HN 评论重排（§5）。默认顺序：

| 卡 | 内容 | 轨 |
|---|---|---|
| RM1.2a | 行家规则，不加语法的三条：**指北针缺失** → `finish sheet` 填充 + `validate --stage drafting` 提示（不是默认 W）；**级高对层高**（ST.1：层高 ÷ 画出的踏步数推算级高，超 `[S]` 数值报，无 `height` 跳过并说明；会命中四个示例，同一 PR 修示例并列出）；**"标签无实物"** 复核 `W_ROOM_MISSING_DEFINING`（只加夹具） | 1 |
| PS7.9 | spec 腾空（≥ 三张 `[语法]` 卡的估算字数），波次 2 所有 `[语法]` 卡的前置 | 5 |
| RM1.2b | 行家规则，有效性与声明的三条：**第二疏散口**（与 PS2.16 `W_INNER_ROOM` 合并，消费 M.16 的 egress 事实，先建事实再建规则；阈值只取读过的条文，`[S]` 标注来源）；**湿区叠放** → taste `A_*` 行 + `keep stacked` 的文档配方（iron-laws：跨层墙检查只经 `keep stacked`）；`[语法]` **作者自报的场地约束走 `keep`**（RM-D5）：`keep site setback front 5m …`、`keep site coverage max 40%`、`keep site far max 1.2`，默认 advisory，触发现有 `W_KEEP_VIOLATED`，不新开 W 码族；度量进 PS4.9 的卡位；与 DS3 共用 `site-metrics` 事实模块 | 1 |
| RM1.1b | 第二次首次接触复测，量 RM1.2a/b 的效果 | 1 |
| RM1.3b | 可达性盲点第二批：4.5 草坪水面可走、M.4 竖井到达层叠加、U.22/PS0.15 `describe` 预算、PS0.6 `suggest` 经卧室连门 | 1 |
| RM1.5a | 确定性泄漏第一批：CRF1 墙面碎片（若动 `derived_walls` 则按分析修正论证）、CRF2、J16 `relocateLabels` 次序 | 1 |
| RM4.1 | 图纸第一批：U.11 比例尺、U.10 图例墙类型、N.6 宽字形、M.23 大图 PNG；D.7 等所有者 | 4 |
| RM2.3 | 编辑模型补全：PS4.6/4.7 impact 键控、PS4.8 组件内 `keep`、PS4.10 `keep` 过 Plan JSON 与 MCP | 2 |
| RM4.2 | 图纸第二批：U.9 净尺寸、D.9、PS2.39、J18 PDF 地面与 DXF 残留、D.5、U.18 playground 矢量 PDF（只允许浏览器内懒加载后端）；`[语法]` `schedule fixtures` | 4 |
| RM3.4 | `[语法]` 英尺英寸显示（P2-10） | 3 |
| RM5.2 | `arch doctor`（U.15）、第二套起手模板（U.16）、`compile --json=brief` 可选瘦身（U.8，不改默认）、`--theme`（VA.4）；同 PR 写一页"动词边界"说明（`validate` 与 `lint`），不做动词数上限 | 5 |
| RM1.5b | M.9/PS0.26 吸附舍入（所有者裁定后）、E.11 平移改事实、PS0.27 `1e30` 词法 | 1 |

### 波次 3 · 2027 Q1：按证据重排的批次 D

既定内容不变：NZ/AU advisory、`lint --brief`（它与 11-06 的"最小房间尺寸"重叠，RM1.2 不取，留给它）、FLOORA 导入、MCP 工具分组、DS3–DS9（DS5 `level 2..5` 先）、3D M2+、Cron 巡检、Workers AI 读图探针设计、#344 mask 导入。本计划加两条：

| 卡 | 内容 | 轨 |
|---|---|---|
| RM3.3 | 读图工作流的下一步：把实验性 mask→Plan JSON 工具推进为 `import --from mask`，输出可 lint 的 `.arch`，丢弃物进 `W_IMPORT_DROPPED`；只在第二个独立来源带样本时开工。`docs/from-an-image.md` 已有，不重写 | 3 |
| RM7.1 | 无障碍与性能：A.6/A.7 CLI 与 MCP 的 `annotate`+`accessible` 开关、A.1/A.3 朗读、PG.1–PG.3、4.1 拼接 3× 性能（字节不动） | 7 |
| RM6.1 | **剖面所需的两个事实**（#532 触发，批次 D 首位）：`[语法]` DS11 平面剖切符号 `section A from (x,y) to (x,y) look east`（平面图元素，核心允许画它；`describe().sections` 带出）；`[语法]` 楼板构造 datum（`level n … slab 320` 或 `floor { … }` 之类，由 `gen:*` 闭集定），**核心不画它**，只进 `describe().heights`，使净高可派生；两者都是 DS13 剖面的输入，剖面本身仍在 `archlang-3d`，按 D3 等 Show HN 之后 | 6 |

---

## 4. 不做（本计划的克制）

| 不做 | 为什么 | 出处 |
|---|---|---|
| 新的 3D 能力：光影、漫游、PBR 家具、剖面立面提前 | PS-D11 管展示，不改能力；Day 90 STOP；"只有 Chiro 的书签数当证据的 pretty-3D 卡直接杀"；剖面立面等 N10 读数且 Show HN 之后（D3） | 2026-11-01；C6 实施 7；drawing-set D3 |
| 把读图做成语言的一部分 | 读图是幻觉陷阱（"照片是它开始猜的地方"）；语言只接可 lint 的文本 | N4 想法 1；C6 实施 8 |
| IFC 导出的任何承诺 | 一个用户问过；所有者已取消跟进；"not close, never promise it" | DD 2026-11-03；2026-10-31 |
| 在 `compile()` 里放求解器 / CP-SAT / 辖区条文库 | ADR 0004/0005/0006；`arch solve` 等 `keep` 有真实使用 | PS6.1 |
| 合规、报批、"符合某规范" | 五个 profile 全是 advisory；禁用词 | positioning 规则 3 |
| 托管付费层（11-04 P2-3） | 与"收入其次"、无遥测冲突；路线图自己要求先写决策备忘 | 2026-10-09 |
| 灯具/照明图层、luminaire schedule | 一条回复的诉求；核心不画灯光；`schedule fixtures` 已够 | C6 floorcraft-chiro |
| 拖拽画布 GUI | 代码即产物；playground 的 knobs 是边界（public-surfaces）；code-is-cheap 的教训是"画布与代码合并"，那是 playground 的事，不是语言的 | public-surfaces README |
| "门浮在空中、没有台阶"的检查 | 立面层面；核心只画平面（ADR 0021） | B §B |
| 阳台所需的"墙高" | `height` 已存在，核心不画它；3D 预览已显示它 | spec |
| "关着的门却画了开启弧"的检查 | 不适用：ArchLang 的门扇由 `door` 的种类与 `swing` 画出，不存在"关着却画弧"的状态；这是像素生成器的缺陷类 | B §B；HO 03 |
| playground 里"输入精确长度、面积标签"（11-06 实施 7） | 已有：顶层 `let` 的 knobs 就是精确长度输入，房间卡片显示面积（public-surfaces 阶段 0–4） | C6 实施 7 |
| 任意角度旋转、`area`/`m2` 语法、轴测修复 | 已明确 parked / won't fix | P3-7、T6、V.1–V.4 |
| 面向不想学 CAD 的业主的易用系统 | 那是 ChatGPT app 的入口；语言不为此改 | N4 A8 |
| Pattern Language 层、"按建成现状"的真值、游戏关卡/DCjson 导出 | 各一个人的提问；G6 等所有者回复，N10 后无回复即关 | N4 A10；preview-and-remodel G6 |
| 组件接缝的"单一所有者"规则（城堡启发） | 证据极低（他领域一条评论）；记为触发：两个 `place` 实例在共享边上对门洞冲突的真实用例出现时再议 | N5 |
| AECBench 提交、OAS/OpenPlan3D 上游联络（11-04 P2-2/P2-4） | 前者未发布；后者是所有者的对外动作，代理起草 issue 文本即可 | 11-04 路线图 |
| 把 OAS 叫"行业标准"、把下载量叫 traction、"first/only"、"唯一" | 禁用 | positioning |

---

## 5. 信号与反证（何时改排期）

| 信号 | 动作 |
|---|---|
| Show HN 评论要图纸集 / 剖面 / IFC | 批次 D 把对应项提前（checker-reach §5 既定） |
| **已触发（2026-11-06，#532）：** 外部用户 gerontec（GitHub 账号与 #362 的 bobsch-io 不同，是否同一人未确认；若不是，这就是 D24/D41 等的"第二个人的提问"）用 `describe --json` 和 `compile -f json` 的公开输出，在自己的 MIT 工具（`gerontec/archlang-section`）里画出了剖面，并提出两件 `describe()` 缺的事：楼板构造层（层高是唯一竖向基准）、平面上的剖切线元素 | 这是 D24 "a landing cannot stand in for" 和 M.16 "每个能力要有消费者" 的触发。动作：RM6.1 进批次 D 首位（DS11 剖切符号 + 楼板构造 datum 只进 `describe()`）；DS13 自己的剖面仍按 D3 等 Show HN 之后；`archlang-section` 作为下游读者进 docs 的生态一行（ADR 0031） |
| 第二个独立来源带 mask 或 PDF 样本来问导入 | RM3.3 从"等待"变"开工" |
| 三个外部用户在格式之前先要 IFC | 11-04 的交换触发：IFC 以下游包形式进入批次 D 第一位，先过 archlang-3d M5 的 spike 判据 |
| N10 读数 | 照读，记为受干扰（PS-D11）；不再是任何卡的门；3D 能力节奏由 archlang-3d 计划自定 |
| RM1.2 某条有效性规则在合法图上误报或在私有留出集上漏报 | 该条不合并 |
| RM1.1b 复测的报出数没有比 RM1.1a 高 | 轨 1 从"补规则"转向"对账与说明跳过了什么"，不再加规则 |
| OpenPlan3D 导入 8 周无人用（issue、Worker 调用、无遥测的来源） | OAS 降级（既定） |
| check suite 到 2027-03-31 无外部运行 | 留作内部测试，不再推广（既定） |
| agent-reach 四项 2027-01-09 有两项动 | 继续；否则 2026-10-09 反向条件 4："(c) 是一句话不是战略"，波次 3 收缩到轨 1 与轨 4 |
| 前沿模型连续多次运行近零可检错误 | 轨 1 转向公开覆盖数字 + 对账，仍不停 |

---

## 6. 需要所有者裁定的事

已在 backlog 顶部的：M.8、M.9、M.14、D.7、3.1(b)、CI 吞吐 E/F、O.10，仍等所有者。

本计划提出的 Q1–Q7，所有者 2026-11-06 说"请你帮我做出最佳决策"，以下为**受托裁定（RM-D1…D8）**；所有者同日复核后说"我全部同意"，自此为所有者裁定。它们不改任何铁律；涉及 growth 仓库的记录在 growth PR #56。

| # | 问题 | 裁定（2026-11-06，受托） | 理由 |
|---|---|---|---|
| Q1 → RM-D1 | "检查器 + 编辑模型"是否与"代理写的格式"并列为开发室主线 | **是，合成一句**："代理用它写平面，也用它核对平面"。标题仍是 floor plans as code，检查器是证明句，不是第二个标题 | Worker 基线 `validate` 114 > `compile` 88；06-synthesis 把检查器角度打分最高；同一套代码。落地：growth `positioning.md` 开发室段 + 一条决策记录（另一仓库） |
| Q2 → RM-D2 | 是否采纳 2027-01-31 的继续/收缩判据 | **采纳为收缩触发，不是停止。** 四项：≥3 个外部仓库或工具使用 ArchLang 或其检查器；≥1 篇论文、基准或工具作者的引用或对话；**Worker 某周总调用 ≥ 2026-11-02 基线（389）的 2 倍**；1 次入站集成询问。到 2027-01-31 不足两项：暂停新语法，收缩到轨 1、4、7，直到有信号 | 所有者 2026-11-01："想建的东西，不是需求判断"，所以不设停止。原判据"compile ≥ validate"与 RM-D1 矛盾，换掉。写成 growth 决策记录，与 agent-reach 读数并列 |
| Q3 → RM-D3 | 是否公开首次接触复测的覆盖数字 | **允许，措辞与位置受限。** 固定句："六份 brief 写成的平面里有 N 个缺陷，最终 lint 报出 k 个。"不提模型名。只出现在 check suite 发布说明和"编译器说不"页；永不进标题、README 徽章、首页、包描述。缺陷语料的 77/84 只在 suite README 里标注为"规则对着写的夹具"，不与前者并排 | 它量的是检查器；但首次接触的图是模型写的，并排或进标题就会被读成模型分数（positioning 规则 5） |
| Q4 → RM-D4 | RM3.1 Plan JSON 无损进波次 0 | **是。** 顺序调整：RM5.1 排到 RM3.1 之前，因为 RM5.1 的 MCP 版本 bump 必须搭 11-21 的 minor | schema 修复不是新语法，冻结规则允许；RM3.1 是最大的卡，不能压住小而必须发布的卡 |
| Q5 → RM-D5 | 作者自报的退界/覆盖率/容积率 | **允许，但不加 `site` 字段，走 `keep`。** 写法 `keep site setback front 5m side 1.5m rear 3m`、`keep site coverage max 40%`、`keep site far max 1.2`；默认 advisory 等级；触发现有 `W_KEEP_VIOLATED`，不新开 W 码族。度量进 PS4.9（"keep 的更多度量"）的卡位。事实模块仍与 DS3 共用 | 作者声明的不变量、只检查不求解，正是 `keep` 的定义（ADR 0033）。D4 不动（不开新顶层形式），D5 不动（它说派生指标不判限值；`keep` 判的是作者自己的数）。drawing-set 仍加一条 D 记录说明边界 |
| Q6 → RM-D6 | 六个被打包的待裁项 | PS0.16：**W 现在，2.0 升 E**。PS0.20：**W**，消息说明哪个 `swing` 被画出。PS0.21：**做**，可选新键不破坏，按 CR11 政策记录。U.4：**不加诊断**；label 是数据不是图，确保 `describe().furniture[].label` 与 `schedule fixtures` 带出它，`docs/furniture.md` 写明。U.7：导入时**确定性改名加后缀** + 一条 W 列出改名（`W_IMPORT_DROPPED` 同族）。PS3.13：**并入 RM3.1**，往返律即证明；证明写不出就把 `place` 标 `dropped` | 原则 2（Show HN 前只加 W）；AGENTS.md"画出的符号忽略 label"是设计，不是缺陷；导入的名字冲突与丢弃同类 |
| Q7 → RM-D7 | growth `category.md`、`master-plan.md` 刷新稿 | **是，代理起草，所有者审。** 已开 growth PR #56 | 两份是 living 文档，growth 自己的规则要求"写现在为真的事"；过期的边界表会让公开文案低估已发布的事实 |
| （新）RM-D8 | 外部 PR #533 的 `winders` 子句与 preview-and-remodel D41 的"no winders" | **接受该形式**（记为 preview-and-remodel D46；所有者 2026-11-06 当天批准）：D24 的触发已到（真实的、平台顶替不了的楼梯）；D41 的"残缺形式更糟"用几何回答：lint 只按行走线弧长能容纳的级数记梯级，`min(n, floor(arc / going))`，不引任何 DIN 数字。合并前提：评审的四项修改 + CI 绿 | 不读标准就不写标准数字（D13/D25 的做法）；几何记法让 `winders 8` 无法让 `W_STAIR_TOO_STEEP` 沉默，评审已实测这一漏洞 |

---

## 7. 与已有计划的关系

- **checker-reach**：批次 C 不动，RM3.1 在它之前；CRF10/CRF11 并入波次 0；CRF1/2 并入 RM1.5a；MCP 工具分组留在批次 D。
- **plan-soundness**：PS0 的 bug 按主题并入 RM1.3/RM1.4/RM1.5；PS2 的 46 条规则不在本计划逐条排，RM1.2 只取行家点名而 PS2 没有的，PS2.16 并入 RM1.2b；PS4.6–4.8、4.10 并入 RM2.3，PS4.9、PS4.12 留在原处；PS7.9 成为波次 2 的前置；首次接触复测 RM1.1 写回其 handoff §4。
- **drawing-set**：不动；DS3 指标与 RM1.2b 的场地声明共用事实模块，先做的一方建模块；Q5 若允许，加一条 D 记录。
- **preview-and-remodel**：G11/H9/J16–J18 残留按主题进 RM1.5a 与 RM4.2。
- **public-surfaces**：X9、V2（PR #529 在飞）不动；3D 展示全部按 `3d.md`；PG.1–3 进 RM7.1。
- **visual-assets**：VA.4 进 RM5.2；其余不动。
- **geo-seo（另一会话，2026-11-06 在 `plan/geo-seo-wave3` 上规划中）**：分发侧，与本计划不重叠；两边都要在 `docs/plans/README.md` 加一行，后合并的一方解决冲突。

退出条件：波次 2 结束（2027-01-09）时，`evidence.md` §A 的每条用户诉求都能指向一张 `done` 卡、一条等待中的触发，或一条写明理由的"不做"。
