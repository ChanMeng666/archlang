# 证据对照（product-roadmap）

本文是 `README.md` §1 引用的对照表（2026-11-06 红队修订后与当前 `README.md`/`cards.md` 对齐；初稿的 RM1.2 六条、RM1.1 无卡、RM3.2 缺号等说法已作废）：每条结论回指到 growth 仓库（`D:\github_repository\archcanvas-growth`，下文路径都相对其根目录）的文件，和本仓库的卡片 id。三份只读报告（A 战略、B 用户与竞品、C 现状，2026-11-06）不进本仓库；本文只保留它们引用的出处。2026-11-06 逐条 `test -e` 核过下列 growth 路径，全部存在；本仓库 id 逐条 grep 过 `docs/backlog.md` 和各计划的 `cards.md`/`README.md`，找不到或有歧义的列在 §E 末尾（第二轮：新卡引用的 id 全部重新 grep）。

growth 路径缩写（与报告 B 一致）：

| 缩写 | 路径 |
|---|---|
| N4 | `research/2026-11-04-outreach-user-needs-insights/`（`README.md`、`evidence.json`） |
| N5 | `research/2026-11-05-outreach-insights/`（`README.md`、`dhruv-kapri-bylaw-engine-insight.md`、`castle-procedural-insight.md`） |
| DD | `discovery/interviews/2026-10-30-daniel-damm-x-thread.md` |
| CR | `data/community-replies.json` |
| C6 | `research/2026-11-06-competitor-features-marketing-roadmap/`（`README.md`、`summary.json`、`floorcraft-chiro.md`、`floorcraft-troche.md`、`home3dplan.md`） |
| X25 | `research/2026-10-25-x-cad-and-solvaix-research/02-x-ai-cad-ecosystem-and-sentiment.md` |
| CX1 / CX2 | `research/2026-10-28-corrections-to-2026-10-25-x-research.md` / `research/2026-10-29-corrections-to-2026-10-28-creator-research.md` |
| VP | `research/2026-11-04-viral-post-analysis-and-content-playbook/`（`02-why-they-worked.md`、`03-user-pain-points.md`） |
| HO | `research/2026-11-04-new-competitors-homistry-openplan3d-llm-floorplan-test/`（`02-openplan3d.md`、`03-llm-floorplan-drafting-test.md`、`04-comparison-and-recommendations.md`） |
| R04 | `research/2026-11-04-archlang-optimization-roadmap/`（`01-validated-market-needs.md`、`02-archlang-current-state-audit.md`、`04-roadmap.md`、`05-professionalism-checklist.md`、`06-why-openplan3d-and-oas-interop.md`） |
| MA | `research/2026-11-02-multi-angle-positioning-research/`（`02-verifier-and-benchmark-harness.md`、`06-synthesis-and-recommendations.md`） |
| DEC | `strategy/decisions/` |

频次是研究者对约 31 个外联线程（偏 X）的判断，主题有重叠；一个用户不是 traction。

---

## §A 用户诉求 → 卡片

| # | 诉求 | 频次（研究计数） | growth 出处 | 来源 URL（报告 B 记录） | 本计划的回答 |
|---|---|---|---|---|---|
| A1 | 从已有图片 / PDF / 草图 / 房源页出图 | ~12 线程 + 2 条竞品帖下的建造商提问，最高 | N4 §2A、`evidence.json` 主题 A；CR（siddarthadevops 行）；X25 Maket/Drafted 段；CX2（#344 "the only grade-A gap"） | reddit.com/r/ClaudeAI/comments/1s7zmw2/；x.com/KernelChai/status/2112414795400085828；x.com/manan/status/2117221468715278703；x.com/SiddarthaDevops/status/2115079682072924612；x.com/RavirajsinhGJ12/status/2109546096074817999；x.com/llamochka_agi/status/2116789884560040119；x.com/MillerAurval/status/2105226224478113904；x.com/sayloronai/status/2106609366178914775 | RM3.3（把已有的实验 mask 工具推进为 `import --from mask`，触发门控：第二个独立样本；`docs/from-an-image.md` 已存在，不重写）；README §4 "把读图做成语言的一部分" |
| A2 | 看着对、其实错；能不能验证 | ~10 线程 + ~7 条行家嘲讽 | N4；X25；HO `03-llm-floorplan-drafting-test.md` | x.com/stevehou/status/2104544235517308977；x.com/kane/status/2115589888263557164；x.com/AIC_Hugo/status/2112438360958804120；x.com/jiangbinAI/status/2105524015775490198 | RM0.2（拒绝并解释示例页）、RM1.1a/b（首次接触复测，覆盖数字）、RM1.2a/b、RM1.3a/b、RM1.4、RM1.5a/b；CR10 追加引用 RM1.1a 的数字 |
| A3 | 公开被嘲讽的可见错误（门、入口、开启方向、家具） | 1.97M 曝光帖下 5 条回复 + Troche 审稿 + Opus 测试 | X25 §2；VP `02`/`03`；C6 `floorcraft-troche.md` | 见 §B | RM0.2、RM1.2a/b；§B 逐条 |
| A4 | 改一处全重画；楼层不对齐；原壳内改造 | ~5 线程 + 3 条竞品帖 | N4 主题 D；X25；CX2（"约一半'升级'早已存在，缺的是可发现性"） | x.com/7thletterja/status/2113656781511520641；x.com/HakYeom33/status/2110073286965243951；x.com/sayloronai/status/2106609366178914775；x.com/MillerAurval/status/2105226224478113904 | RM2.1（已缩小：CR7 ② 已交付大半，余 CRF11 与技能循环顺序）、RM2.2、RM2.3 |
| A5 | 3D、漫游、渲染 | ~9 线程 | N4；HO `02-openplan3d.md`；VP `02` | x.com/wcaianime/status/2108225558807253091；x.com/cryptomanavan/status/2117291707364470800 | 不新增卡；§4 第 1 行；轨 6 守门。注意：本仓库 PS-D11（`docs/plans/public-surfaces/3d.md` §1，所有者 2026-11-06）已把 3D 预览放上所有公开面 |
| A6 | 导出进既有流水线（IFC、DCjson、BOQ、英制、材料表） | ~6 线程；IFC 仅 1 人 | N4；DD（2026-11-03 附记：取消 IFC 跟进）；X25；CX1（Maket 24 小时英制补丁"unverified, do not cite"） | x.com/Daniel__Damm/status/2115679568077922600；reddit.com/r/LocalLLaMA/comments/1xg5qx4/；x.com/ThinkingEngine2/status/2109978769613476348；x.com/HODLr_Design/status/2106578302404173930 | 英制显示 RM3.4；IFC README §4 "IFC 导出的任何承诺" 行 + 等待触发表；BOQ 由现有 `takeoff` 回答；DCjson 归 README §4 "Pattern Language 层、…游戏关卡/DCjson 导出" 行（preview-and-remodel G6 等所有者回复，N10 后无回复即关） |
| A7 | 代理不知道工具能做什么 | 1 个真实用户 + 2 条旁证 | DD；VP `03`（P4、P8） | x.com/Daniel__Damm/status/2115678491328893058 | RM5.1（`archlang://capabilities` 资源）、RM5.2（`arch doctor`、动词边界说明；CR7 的文档部分已 `done`）；MCP 工具分组留在 checker-reach 批次 D，不在 RM5.2 |
| A8 | 非专业用户要不学 CAD 的简单系统 | ~6 线程，弱匹配 | N4（"Tool builders answer; frustrated homeowners do not"） | x.com/realdanbaum/status/2117342227529613392 | README §4 "面向不想学 CAD 的业主的易用系统" 行（出处 N4 A8；属 STOP 的消费者方向，入口是 ChatGPT app） |
| A9 | 家具放不放得下、门撞不撞 | ~5 线程 | C6 `floorcraft-chiro.md`；X25 | （@jnnywlth、@DKretyn、@prettysites，B 未记 URL） | 已覆盖，无新卡：已有 `W_FURN_CLEARANCE`、`W_SWING_OBSTRUCTED` 等（§B）；RM0.2 用它们写"编译器说不"的示例 |
| A10a | 墙高做阳台；灯具 / 洁具表（division-16） | 各 1 人 | C6 `floorcraft-chiro.md` | — | 洁具表 RM4.2 `schedule fixtures`；灯具 README §4 "灯具/照明图层" 行；墙高 README §4 "阳台所需的墙高" 行（`height` 已有，核心不画，3D 预览已显示） |
| A10b | 地块上的退界 / 容积率 / 疏散 | 1 人 | N5 `dhruv-kapri-bylaw-engine-insight.md` | x.com/Dhruv_Kapri/status/2118209624088498439 | RM1.2b 第 1 条（第二疏散口）与第 3 条（作者自报的 `keep site …` 度量，`[语法]`，RM-D5 已裁） |
| A10c | 声明式平面上的 Pattern Language | 1 人 | DD | x.com/Daniel__Damm/status/2115679066745606591 | README §4 "Pattern Language 层、…" 行 |
| A10d | 竣工真相（"matches what was actually built"） | 1 条回复 | VP `03` P7 | — | README §4 同一行（"按建成现状"的真值）；最接近的现有能力是 `status existing`，RM2.1 让它可见 |
| A10e | 游戏关卡 / 程序化房间 | 3 线程 | N4 主题 H；N5 `castle-procedural-insight.md` | — | README §4 同一行（游戏关卡 / DCjson 导出）；G6 在 preview-and-remodel 等所有者回复，N10 后无回复即关 |
| A10f | 组件接缝的"单一所有者"规则（城堡启发） | 他领域一条评论 | N5 `castle-procedural-insight.md` | — | README §4 "组件接缝的单一所有者规则" 行 + `cards.md` 等待触发表（两个 `place` 实例在共享边上对门洞冲突的真实用例出现时再议） |

README 退出条件（"每条诉求都能指向一张 `done` 卡、一条等待中的触发，或一条写明理由的不做"）：红队指出的无归属诉求（A8、A10a 墙高、A10c–A10f）现在都有 README §4 行或触发行。

---

## §B 行家嘲讽清单 → 规则

码名取自 `src/error-catalog.ts`（1.57.0）；报告 B 只核了码名存在，没核行为。

| 嘲讽点 | 出处 | ArchLang 已有检查 | 归属（RM1.2a/b 或 README §4） |
|---|---|---|---|
| 门在墙中间 / 不在墙上 | Troche 审稿；@euandredaiki | `W_DOOR_OFF_WALL`、`W_OPENING_OFF_WALL`、`W_DOOR_NEAR_CORNER` | 已覆盖 |
| 开启方向不合理或被挡 | @euandredaiki；Opus 测试 | `W_SWING_OBSTRUCTED`、`W_DOORWAY_BLOCKED`、`W_LEAF_ACROSS_DOORWAY`；"关着的门画了开启弧"无码 | 码已覆盖；子项"关着的门画了开启弧"仍**无归属**（RM1.2a/b 与 §4 均未收；CR10 种子夹具提到它），见 §E 末尾 |
| 走廊通向无处 / 房间到不了 | Troche 审稿 | `W_ROOM_UNREACHABLE`、`W_ROOM_DISCONNECTED`、`W_NO_ENTRANCE`、`W_ROOM_NO_CLEAR_PATH`、`W_CIRCUITOUS_PATH` | 已覆盖（盲点由 RM1.3a/b 修） |
| 通道不够两人错身 | Troche；@stevehou | `W_PATH_TOO_NARROW`、`W_ROOM_TOO_NARROW` | 已覆盖 |
| 家具埋进墙 / 压窗 | @euandredaiki | `W_FURNITURE_WALL_COLLISION`、`W_FURNITURE_OVER_WINDOW`、`W_FURNITURE_OVERLAP` | 已覆盖 |
| 家具放不下 / 门撞家具 | @prettysites；@jnnywlth | `W_FURN_CLEARANCE`、`W_FURN_CLEAR_FRONT`、`W_FURN_CLEAR_SIDES` | 已覆盖 |
| 卧室无窗 | @stevehou | `W_BEDROOM_NO_WINDOW`、`W_HABITABLE_NO_WINDOW` | 已覆盖 |
| 车库太窄 / 车门开不了 | @Karmadillion；@RaytheonSalesMG | `W_GARAGE_TOO_NARROW`、`W_GARAGE_OPENING_UNDERSIZED` | 已覆盖 |
| 浴室经卧室；入口进私密区 | 建筑师（泛） | `W_BATH_VIA_BEDROOM`、`W_ENTRANCE_INTO_PRIVATE`、`W_ROOM_VIA_PRIVATE` | 已覆盖 |
| 空间超出外壳 | @stevehou | `W_ROOM_OUTSIDE_SHELL`、`W_ROOM_OVERLAP`、`W_EXTERIOR_RING_OPEN` | 已覆盖 |
| 叫它别动却改了入口 / 窗 | @stevehou | `keep` / `E_LOCKED_ELEMENT_CHANGED` | 已覆盖（RM2.1 让它可见） |
| 楼梯级高总和对不上 | Opus 测试 | `W_STAIR_TOO_STEEP`、`W_STAIR_NO_LANDING`；总和对层高未核实 | RM1.2a 第 2 条（= backlog ST.1；无 `height` 跳过并说明） |
| 标签无实物（"desk nook"） | Opus 测试 | 最近的是 `W_ROOM_MISSING_DEFINING`、`W_ROOM_NO_FIXTURE`；是否精确命中未核实 | RM1.2a 第 3 条（复核 `W_ROOM_MISSING_DEFINING`，可能只加夹具） |
| 没有指北针 | Troche 审稿 | `north` 是图纸语句；缺失时无 lint | RM1.2a 第 1 条（`finish sheet` 填充 + `validate --stage drafting` 提示，不是默认 W） |
| 没有场地 / 地块 | Troche 审稿 | `site { boundary }` 已有；只有 `W_ROOM_NOT_EQUATOR_FACING` 读它 | RM1.2b 第 3 条（`[语法]`；只部分覆盖：作者声明了才查） |
| 入口悬空、无台阶 | @jk_tech_stuff | 立面问题；核心只画平面 | README §4 "门浮在空中、没有台阶的检查" 行（立面层面，核心只画平面，ADR 0021） |
| 漏了第二疏散口 | Gallagher 测试（HO `03`） | 无码 | RM1.2b 第 1 条（与 PS2.16 `W_INNER_ROOM` 合并，消费 M.16 egress 事实） |
| 湿区不在同一管道墙 / 不上下叠放 | Troche | 无码 | RM1.2b 第 2 条（taste `A_*` 行 + `keep stacked` 配方，不做默认 W） |
| 退界 / 覆盖率 / 容积率 | Dhruv；aiparabellum | 无（N5 在 `d0a848a2` 核过） | RM1.2b 第 3 条（`keep site setback\|coverage\|far`，advisory，只算作者给的数，RM-D5 已裁） |

计数：19 条里有码的 11 条，码存在但命中未核实的 2 条（级高总和、标签无实物 → RM1.2a 第 2、3 条），无码 6 条（指北针 → RM1.2a 第 1 条；第二疏散口、湿区叠放、场地、退界 → RM1.2b 第 1、2、3 条；入口悬空 → §4）。当前 README §1.2 的 11 / 2 / 6 与此一致。

---

## §C 战略决策 → 边界

| README 中的边界 | growth 依据 | 备注 |
|---|---|---|
| §1.3 分发与可信度，收入其次 | `DEC/2026-10-09-archlang-distribution-first-and-open-finish.md` (a)；重申于 `DEC/2026-11-01-day-90-verdict-stop.md`、`DEC/2026-11-01-archlang-keeps-being-built.md` | |
| §1.3 可按价值新增语言形式（D29） | `DEC/2026-11-01-archlang-keeps-being-built.md` | 风险句见 `strategy/master-plan.md` §1 |
| §1.3 消费者产品 STOP；ArchCanvas 钉 1.48 | `DEC/2026-11-01-day-90-verdict-stop.md`；本仓库 D28（`docs/agents/iron-laws.md` Owner policies） | |
| §1.3 3D 只在 `archlang-3d`，Tier B 等 N10 | `DEC/2026-10-28-3d-preview-exposure-and-positioning-row-8.md`；`DEC/2026-10-31-archlang-3d-on-npm-tier-b-gates.md` | 包边界仍有效 |
| §1.3 Show HN 保持 2D；核心 README 在 Tier C 前不提 3D | 同上（10-28 Tier C 门） | **已被本仓库 PS-D11 取代**（`docs/plans/public-surfaces/3d.md` §1，所有者 2026-11-06）：README 已放 3D 预览，Show HN 材料也要放；N10 照读但记为受干扰 |
| §1.3 只有三件可作度量：可达性、精确面积、字节恒等 | `strategy/positioning.md` §Two banned phrasings | |
| §1.3 禁用 "first/only"、"code beats CAD"、合规、"设计/布置"、"3D CAD/BIM/render"、IFC 承诺 | `strategy/positioning.md` 规则 3、4；`DEC/2026-10-09-…` 护栏；`DEC/2026-10-29-creator-funnel-governance.md` (c)；`strategy/category.md` §5 | `category.md` 停在 2026-09-14，部分过期（RM0.1 提议刷新） |
| §1.3 公开 check suite 不叫 benchmark（A2）；导入是功能事实（A3） | `DEC/2026-11-04-positioning-proposals-and-competitor-registry.md` A2、A3 | A3 的通用说法要等 OAS 发版 |
| §1.3 无遥测 | `DEC/2026-10-13-agent-reach-decisions.md` 决定 4 | |
| §1.3 eval 语料是公开夹具；T3 永久拒绝 | `DEC/2026-11-04-repo-split-and-public-surfaces.md` 裁定 2；`strategy/positioning.md` 规则 5 | 新的留出集只能私下写在 `archlang-lab` |
| §4 光影、漫游、PBR、"漂亮 3D" | `DEC/2026-11-01-day-90-verdict-stop.md`；C6 `README.md` 含义 7 | |
| §4 读图不进语言 | N4 `README.md` 想法 1；C6 `README.md` 含义 8 | |
| §4 IFC 不承诺 | DD（2026-11-03 附记）；`DEC/2026-10-31-archlang-3d-on-npm-tier-b-gates.md`；`DEC/2026-10-28-…` (b)；R04 `02-archlang-current-state-audit.md`（"not close, never promise it"） | 四种口径并存，见报告 A §G.4 |
| §4 `compile()` 内不放求解器 / CP-SAT / 条文库 | 本仓库 ADR 0004/0005/0006；N5 `dhruv-kapri-bylaw-engine-insight.md`（"Not recommended"） | |
| §4 合规、报批 | `strategy/positioning.md` 规则 3；`DEC/2026-10-29-creator-funnel-governance.md` | |
| §4 托管付费层 | R04 `04-roadmap.md` P2-3（"decision memo before build"）；`DEC/2026-10-09-…` | |
| §4 灯具图层 | C6 `floorcraft-chiro.md` | 单人诉求 |
| §4 拖拽画布 GUI | 无 growth 决策记录；README 引的 ADR 0021 是"plan-first, view deprecated"，与 GUI 无关 | 需改引；`research/2026-11-02-code-is-cheap-thesis-validation.md` 反而说"the canvas merged with code" |
| §4 任意旋转、`area`/`m2`、轴测修复 | 本仓库 backlog P3-7、T6（`docs/backlog.md` 末段）、V.1–V.4 | 无 growth 记录，属仓库内决定 |
| §4 剖面立面、派生高度 | 本仓库 drawing-set D3、D9；`DEC/2026-10-28-…`（"Still no"） | |
| §4 OAS 不叫行业标准 | R04 `06-why-openplan3d-and-oas-interop.md` §Boundaries | |

---

## §D 先行路线图对照

### D.1 2026-11-04 路线图（R04 `04-roadmap.md`）

| ID | 项 | 1.57.0 状态 | 本计划 / 承载卡 |
|---|---|---|---|
| P0-1 | OpenPlan3D 导入 + 导出 | 导入 `done`（CR6）；导出未做 | CR9（批次 C）；RM3.1 前置 |
| P0-2 | OAS 导入 + 导出 | 未做 | CR9 |
| P0-3 | `--expected-hash`；MCP 返回 `source_hash` | `done`（CR5）；`packages/mcp/README.md` 已写 `source_hash` | 已完成，不排卡：`source_hash` 在 `packages/mcp/src/tools.ts`，写在 `packages/mcp/README.md` |
| P0-4 | 公开 check suite | 未做 | CR10 + 漏检率追加 |
| P0-5 | `lang-1.0`、`$id`、GOVERNANCE | 未做 | CR11 |
| P0-6 | conformance 语料 | 未做 | CR12；RM3.1 的往返律作第一条 |
| P1-1 | NZ/AU advisory | 未做 | 批次 D，不变 |
| P1-2 | FLOORA 导入 | 未做 | 批次 D，不变 |
| P1-3 | `lint --brief` | 未做 | 批次 D，不变 |
| P1-4 | IFC4 下游包 | 未做 | "等待触发"（archlang-3d M5；preview-and-remodel D2） |
| P1-5 | MCP 工具分组 | 未做 | checker-reach 批次 D（不变，不在 RM5.2）；注：P1-5 是 growth R04 编号，不是本仓库 id |
| P2-1 | 剖面立面 | 未做 | drawing-set DS13，按 D3 等 |
| P2-2 | 向 AECBench 提交 | AECBench 未发布 | README §4 "AECBench 提交、OAS/OpenPlan3D 上游联络" 行 |
| P2-3 | 托管付费层 | 未做 | 不做（§4） |
| P2-4 | 向 OAS/OpenPlan3D 上游提字段 | 未做 | README §4 同一行（所有者的对外动作，代理只起草 issue 文本） |

### D.2 2026-11-06 含义（C6 `README.md`、`summary.json`）

| # | 含义 | 1.57.0 状态 | 本计划 / 承载卡 |
|---|---|---|---|
| 1 | 家具当碰撞几何 | 间距、门扇规则已有 | 已有码，无新卡；RM0.2 用它们写示例 |
| 2 | Troche 点名的规则（门在墙上、走廊两人宽、湿区一面墙、最小面积、指北针与场地） | 门、走廊、最小面积已有码 | 指北针 RM1.2a 第 1 条；湿区 RM1.2b 第 2 条；场地 RM1.2b 第 3 条 |
| 3 | 表格胜过奇观（灯具、洁具、房间表） | `schedule rooms\|openings`、`takeoff` 已有 | RM4.2 `schedule fixtures`；灯具不做 |
| 4 | 写回安全的 MCP | done：`source_hash` 在 `packages/mcp/src/tools.ts`，写在 `packages/mcp/README.md`；MCP 不写回 | 无卡 |
| 5 | "服务器不跑模型"的定位 | 文案项 | 轨 1 用语；无卡 |
| 6 | 导出诚实，IFC 只是观察项 | README Limits 行已写"no BIM or IFC" | §4 第 3 行 |
| 7 | playground 讲清楚：精确输入长度、剖切、带尺寸面积标签 | knobs 已有；剖切未做 | 剖切等 D3；其余仍无卡（playground 归 public-surfaces，本计划未取） |
| 8 | 读图只能产出可 lint 的 `.arch` | 实验 mask 工具已有（`docs/import.md`） | RM3.3 |
| 9 | 文档里的"拒绝并解释"示例 | 未做 | RM0.2 |
| 10 | ArchCanvas 只保留写 → 查 → 诚实残差循环 | 维护态 | 不在本仓库 |

---

## §E 本计划新增 vs 打包

"新"指没有任何既有 id 的工作，表中用**新**标出。id 都在 `main@5593484d` 的记录里重新 grep 过（第二轮，对象是当前 `cards.md`）。

| 卡 | 打包的既有 id | 新工作 |
|---|---|---|
| RM0.1 | DS1、DS2（`drawing-set/cards.md`）；preview-and-remodel D1；PS0.2；U.17；N.1 | 记录修正本身无 id（来自报告 C §E 的漂移清单） |
| RM0.2 | 候选码均已存在（`W_SWING_OBSTRUCTED`、`W_ROOM_UNREACHABLE`、`E_LOCKED_ELEMENT_CHANGED` 等） | **新**：`docs/says-no.md` 示例页与重新生成脚本 |
| RM1.4 | U.2、U.3、U.4、PS0.25、6.10、PS0.16（M.8 排除；PS0.27 已移到 RM1.5b） | 无 |
| RM1.3a | PS0.3、U.1、6.11 | 无 |
| RM3.1 | G.10、PS3.12、PS3.13、PS0.21、PS0.20、U.7 | `test/plan-json-roundtrip-law.test.ts`（**新**） |
| RM5.1 | CRF10、PS5.3a | `archlang://capabilities` 资源（**新**） |
| RM2.1 | CRF11；CR7 ② 的余项 | SKILL.md 循环改序（小，新） |
| RM1.1a | plan-soundness D7/D15 的六份 brief | **新**：一次测量与写回 handoff §4 的数字 |
| CR10 追加 | CR10 | 发布说明引用 RM1.1a 的数字和"跳过了什么"、GitHub Action 示例（**新**） |
| RM3.2（CR11 追加） | CR11；11-04 专业度清单 | **新**：SBOM（CycloneDX）进 `release.yml`；`GOVERNANCE.md` 继任/第二维护者一行 |
| RM2.2 | U.14、PS0.22、PS0.23 | **新**：动词 `arch diff`（与 `impact` 共用词表） |
| RM1.2a | ST.1（第 2 条）；`W_ROOM_MISSING_DEFINING`（第 3 条） | **新**：第 1 条的 `validate --stage drafting` 指北针提示；第 3 条可能只是夹具 |
| PS7.9 | PS7.9 | 无（只提为前置） |
| RM1.2b | M.16 egress 事实（第 1 条前提）；PS2.16 `W_INNER_ROOM`（合并）；第 3 条与 DS3 共 `site-metrics` 模块 | **新**：第 3 条的三个 `keep site …` 度量（进 PS4.9 卡位，触发现有 `W_KEEP_VIOLATED`，不新开码）；第 2 条的 taste `A_*` 行与 `keep stacked` 配方 |
| RM1.1b | 同 RM1.1a | **新**：第二次测量 |
| RM1.3b | 4.5、M.4、U.22、PS0.15、PS0.6 | 无 |
| RM1.5a | CRF1、CRF2、J16 | 无 |
| RM4.1 | U.11、U.10、N.6、M.23（D.7 等所有者） | 无 |
| RM2.3 | PS4.6、PS4.7、PS4.8、PS4.10 | 无 |
| RM4.2 | U.9、D.9、PS2.39、J18、D.5、U.18 | **新**：`schedule fixtures` 语法 |
| RM3.4 | P2-10 | **新**：显示单位语法（有 id，但是新语法） |
| RM5.2 | U.15、U.19、U.16、U.8、VA.4（MCP 工具分组留在批次 D） | "动词边界"说明一页（小，新） |
| RM1.5b | M.9、PS0.26、E.11、PS0.27 | 无 |
| RM3.3 | CR7 ①（`docs/from-an-image.md`）；`docs/import.md` 所述的实验 mask 工具；#344 | `import --from mask` 与 `W_IMPORT_DROPPED`（触发门控；新） |
| RM7.1 | A.6、A.7、A.1、A.3、PG.1、PG.2、PG.3、4.1 | 无 |

真正的新工作：RM0.2 的示例页、RM1.1a/b 两次测量、RM3.2、RM1.2a 第 1 条的 drafting 提示、RM1.2b 第 3 条的 `site` 约束语法（及第 2 条的 taste 行）、RM2.2 的 `arch diff` 动词、RM4.2 的 `schedule fixtures`、RM3.4、RM5.1 的能力资源、RM3.1 的往返律测试。其余都是排序与打包。

**核不到或有歧义的 id（第二轮）：** `cards.md` 引用的 backlog 条目（U.*、M.*、N.6、D.*、E.11、G.10、J16/J18、A.*、PG.*、4.1、4.5、6.10、6.11、ST.1、VA.4、P2-10）、plan-soundness 的 PS0.*、2.16、2.39、3.12、3.13、4.6–4.12、5.3a、6.1、7.9，checker-reach 的 CRF1/2/10/11，ADR 0004/0005/0006/0012/0015/0021/0027/0032 均已 grep 到。没有找不到的 id。仍需注意：
- `W_INNER_ROOM` 不在 `src/error-catalog.ts`：它是 PS2.16 计划中的码，RM1.2b 第 1 条与之合并。
- `X9` 不在 backlog 或 public-surfaces 的 cards.md，只在 `docs/plans/public-surfaces/3d.md` 与 growth 提到；`CR-D6` 在 checker-reach 只作为 CRF8 的括注，`CR-D4` 有定义行。
- `P1-5`、`P2-2`、`P2-4` 是 growth R04 编号，不是本仓库 id（`P2-10` 在 backlog 有行）。
- `T6` 只在 `docs/backlog.md` 末段的一句话里出现，不是标题条目。
- `4.7` 有歧义：RM2.3 指 PS4.7（impact 解析绑定），backlog 的 4.7 是 MCP registry 发布竞争。`A.1`、`A.3` 在 backlog 各出现多次（图纸无障碍一组与站点无障碍一组）；RM7.1 指图纸那一组。`N.1` 双义，RM0.1 已列为待改名。
- "关着的门画了开启弧"：无卡、无 §4 行（§B 第 2 行）。
- 初稿的死引用 `../checker-reach/cards.md` 已不再出现：当前 `cards.md` 指 `../checker-reach/README.md` §3。

## §F 证据等级

需求证据，不是工程价值。

| 卡 | 等级 | 理由 |
|---|---|---|
| RM0.1 | 不适用 | 仓库事实，报告 C 逐条核过 |
| RM0.2 | 中低 | 红队 §5 的建议；X9 回答稿复用；无外部用户点名，但成本低、与 A2/A3 直接契合 |
| RM1.4 | 中 | 首次接触审计和 audit 附录 B 的实测缺陷，无外部用户点名 |
| RM1.3a | 中 | 坐在 README "computed, not estimated" 声明下的实测盲点，无外部点名 |
| RM3.1 | 低 | 是互操作的前置；互操作本身证据薄（OAS 10 星，报告 A §G.2） |
| RM5.1 | 低 | 一个真实用户（Daniel）+ 两条旁证；B 称"便宜" |
| RM2.1 | 中低 | A4 约 5+3 线程；N4 与 CX2 独立得出"缺的是可发现性"；CR7 已做大半，余项很小 |
| RM1.1a/b | 中 | 度量本身；MA `06` 三月优先级 3、HO `04` 想法 1；无外部运行者 |
| CR10 追加 | 中 | 同上 |
| RM3.2 | 低 | 11-04 专业度清单仅剩两项；无外部点名，成本小 |
| RM2.2 | 中 | 同 A4；`diffPlans` 已公开但无动词 |
| RM1.2a | 低 | Troche 审稿是二手；Opus 测试一例（级高、"desk nook"） |
| RM1.2b | 低；第 3 条很低 | 第二疏散口：Gallagher 一例；湿区：Troche 二手；`keep site`：Dhruv 低至中，一人；RM-D5 已允许，仍要 PS7.9 腾空 |
| RM1.3b | 低 | 仓库内发现，无外部点名 |
| RM1.5a | 低（外部）/ 高（可信度） | 无人问；但"byte for byte"是招牌，报告 C §H.5 |
| RM4.1 | 低 | 研究者判断"行家第一眼"，无外部用户点名比例尺或图例 |
| RM2.3 | 中低 | A4 的延伸，无人点名组件内 `keep` |
| RM4.2 | 低；`schedule fixtures` 很低 | 净尺寸等是仓库判断；洁具表来自 Chiro 帖一条回复（B §E4 "VERY LOW"） |
| RM3.4 | 很低 | @HODLr_Design 一条回复；Maket 补丁未证实（CX1） |
| RM5.2 | 低 | 开发体验项，无外部点名 |
| RM1.5b | 低 | 无人问，等所有者 M.9 |
| RM3.3 | 诉求高 / 导入器低 | 读图是最高频诉求（~12+2）；触发门控，只有一个沉默的线索（CX2：需第二个带样本的来源） |
| RM7.1 | 低 | 无外部点名；属原则 6 与铁律"shape, never bbox" |
