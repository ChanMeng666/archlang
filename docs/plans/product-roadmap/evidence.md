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

§A–§F 是 v1（2026-11-06）的对照，原样保留；v2（2026-11-10）新增的说法在 §G；2026-11-11 增补的第 8 轨"视觉质感"在 §H。

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

---

## §G v2 的证据对照（2026-11-10）

v2 的说法出自六份只读报告（A 专业化包与影响力审计、B 竞品、C 需求与战略、D 仓库计划状态、E issue 与采用、F 红队，2026-11-10）。报告本体不进本仓库，将归档在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\`；本节只保留它们引用的一手出处。报告是二手的：下列 growth 路径 2026-11-10 逐条 `Test-Path` 核过，全部存在；本仓库路径、id 与 issue/PR 号逐条 grep 或 `gh` 查过。核对中发现的与报告或规格不符之处列在 §G.6。

growth 路径缩写（相对 `D:\github_repository\archcanvas-growth`）：

| 缩写 | 路径 |
|---|---|
| P10 | `research/2026-11-10-archlang-professionalisation-and-use-case-expansion/`（`README.md`、`professionalisation-roadmap.md`、`current-capability-audit.md`、`codes-rules-catalog.json`、`building-codes-and-standards.md`、`drawing-and-data-standards.md`、`use-case-expansion.md`、`handoff.md`、`spikes/`） |
| IA | `research/2026-11-10-influence-audit/README.md`（另 `listings.csv`、`TODO-submissions.md`） |
| DEC10 | `strategy/decisions/2026-11-10-rule-provenance-and-resolved-walls-precede-ifc.md` |
| RUL | `strategy/decisions/2026-11-06-archlang-roadmap-rulings.md`（RM-D1、RM-D2、RM-D7） |
| ARD | `strategy/decisions/2026-10-13-agent-reach-decisions.md`（决策 5：Show HN 日期；决策 6：读数门槛） |
| CC | `research/2026-11-10-competitor-cycle-handoff/`（`analysis.md`、`owner-decisions-pending.md`） |
| CW | `research/2026-11-10-competitor-watch-deltas/README.md` |
| MA10 | `research/2026-11-10-discovery-session-MODE-A/README.md` |
| OL9 / OL10 | `research/2026-11-09-outreach-session-log.md` / `research/2026-11-10-outreach-session-log.md` |
| AR | `data/agent-reach.csv` |
| CMP | `data/competitors.json` |
| CAMP | `data/community-campaigns.json` |
| SHN | `marketing/launches/show-hn/`（`draft.md`、`anticipated-comments.md`）；`marketing/launches/runbook-2026-09.md` |
| XRC | `research/cross-report-corrections.md` |
| DD、N4、N5 | 同本文开头的表 |

### G.1 §1.1b 的事实

| # | 说法 | 一手出处 |
|---|---|---|
| 1a | `gerontec/archlang-section` 用 `describe --json` 画剖面；作者同意列入 docs | #532 正文与 2026-11-06 的评论（"Rudimentary building sections (Schnitte)…"）；IA §1 的使用表；作者另有 PR #533（已合并） |
| 1b | `harshalsankala18-stack/AI-Building-Floor-Planner-SaaS` 把核心包当编译器，尚无对话 | IA §1 第 5 条与使用表（"created 2026-11-10; code-level dependency"） |
| 1c | 工程量 POC 的意向（已 fork，样本未到） | IA §1 第 6 条（@SiddarthaDevops）；OL9 |
| 1d | 外联里回复的都是工具作者 | OL9 "Which angles got answers"；N4 `README.md` §5 |
| 1e | gerontec 与 bobsch-io 是否同一人未证实 | 本仓库 v1 `README.md` §5；无反证 |
| 2a | `walls from rooms` 的墙在机读输出里没有坐标；IFC 探针 `two-bed.arch` 0 面墙 | P10 `spikes/ifc_spike_result.json`；DEC10 Context；本仓库 `src/ir/types.ts`（`DerivedWallRow`）、`src/plan-json/types.ts`；#681 |
| 2b | 出处主要在 `src/lint/ruleset.ts` 注释与 `explain` 散文；少数默认下限的 hint 带条文；`DiagnosticJson` 无规则字段 | P10 `README.md` Top findings；本仓库 `src/lint/ruleset.ts`、`src/lint/rules/per-room.ts`、`src/diagnostic-json.ts`；#680 |
| 2c | 没有 `lint --rules` | `docs/cli-reference.md`（无该旗标）；#680 |
| 2d | 没有楼板 datum | #544；`../math-foundations/README.md` §6.1（MF-D1） |
| 2e | DXF 不写线宽 | `src/export/dxf.ts`（无组码 370）；#682；P10 `drawing-and-data-standards.md` §2 |
| 3 | 7 个实测工具里 2 个硬拒；brief 单层 12×8 | CC `analysis.md` 第一张表（BIMCraft、3D New Era AI 硬拒；Lini、Aedifex 等放行）；ArchLang 侧：`docs/error-codes.md`（`E_DOOR_WIDTH`、`E_WALL_THICKNESS`、`E_ROOM_SIZE`；`W_DOOR_OFF_WALL`、`W_OPENING_OFF_WALL`） |
| 4a | BIMCraft、debim、Aedifex、ifc-lite 导出 IFC4 | CC `analysis.md`；CMP 的对应行 |
| 4b | 2026-11-10 新入库 20 个同类工具（观察，不是计数） | MA10（"20 new entities … 68 → 88 entries"）；CMP |
| 4c | 所有者 2026-11-03 不承诺 IFC | DD（2026-11-03 附记） |
| 5 | 规则目录至少四处与仓库不符 | P10 `codes-rules-catalog.json`（目录本身）对照本仓库 `src/lint/ruleset.ts`（1219 mm 门扇注释写明 IBC 2018 及更早；WC 1.1 m²、卫浴 2.0 m² 在 `DEFAULT_RULESET`；cn 套内楼梯 200/220）；P10 `spikes/rules_screen_spike.py`（玻璃高度缺省 900/2100）。勘误将记入 XRC（RM1.6a） |

### G.2 §1.1c 的排序

| 说法 | 一手出处 |
|---|---|
| 按独立人数：读图 12–14、其实错 12–13、3D 下游约 10、导出约 10 | N4 `README.md` §2–§3（11-04 的线程计数）加 OL9 §3、§6 与 OL10 的新增（计数方法是报告 C 的推断） |
| Daniel 用 1.53 重画 28 张平面、9 个 issue | DD 第 4、6 条与 2026-11-03 私信段（"So glad 1.53 worked for your 28 plans"）；本仓库 #362–#370 |
| Daniel：非直跑楼梯、IFC、代理不知道能力 | DD 第 4 条（"agent not fully knowing archlang's capabilities"）、第 6 条（"transform it to IFC"）；#362 |
| Daniel 明说未做的项 | #364、#367、#369、#362、#405 的 issue 正文与评论 |
| gerontec：楼板 datum 与剖切线 | #532、#544 |
| Dhruv：规则出处、退界与容积率 | N5 `dhruv-kapri-bylaw-engine-insight.md`；OL9 "Rules and provenance" |

### G.3 新卡与改动的卡

| 卡 | 一手出处 |
|---|---|
| RM0.3 发布 1.58.0 | 本仓库 `CHANGELOG.md` `[Unreleased]`（`winders`、`--import-root`、import 限根、`#z=` 解压上限、`arch impact` 退出 2）；`git rev-list --count v1.57.0..main` = 529；`git diff --stat v1.57.0 main -- packages/mcp`（8 个文件）、`-- editors/vscode`（6 个文件）；`packages/mcp/server.json`（0.2.40，两处）；`.claude/commands/release-check.md`；`.github/workflows/nightly.yml`（`Deep fuzz (FC_SCALE=10)`）；nightly run 42801157907（`main@69fa5864`：`Deep fuzz (FC_SCALE=10)` 与四个 `Test …` job 均 success，`gh run view 42801157907`）；#497（`gh issue view 497`：CLOSED，2026-11-10T11:07:17Z）；#664、#648；`docs/whats-new.md` 标题 "What's new in 1.44 to 1.55" |
| RM0.1 扩大 | `../drawing-set/cards.md`（DS0、DS1、DS2 仍 `todo`；#451、#480、#482、#483 已合并）；`../plan-soundness/cards.md`（PS0.16、PS0.20、PS0.21）；`docs/backlog.md`（U.4、U.7 仍 `decision`；O.10；5.2 对照 #493；H.1 对照 `test/lint-messages-id-free.test.ts`；V.5、V.6、6.7）；`../archlang-3d/amendment-v0.7.md`（"Proposed"）；`../plan-soundness/handoff.md`（29,977 / 23）对照 `spec.llm.md` 实测 29,856；#618（`src/ir.ts` 拆分，CRF13） |
| RM0.4 欠外部的跟进 | #532 的评论（gerontec 2026-11-06 的同意，以及所有者的承诺"I will post here when the section-line card has a PR"；#544 没有评论）；#533；#544（剖面的两个事实）；不向 bobsch-io 提问：growth `AGENTS.md` 第 44 行的 Daniel 规则，DD 的 2026-11-09 附记（所有者 11-07 亲自回复；代理起草的 IFC 跟进已取消，问题由所有者拿着）；#405（L 形洞口栏杆由 #493 在 1.55.0 交付，issue 未更新）；#362–#370 |
| RM0.5 依赖与悬空状态 | #603、#604、#675、#676、#677、#678；`docs/agents/iron-laws.md` 的 Dependabot 规则；`origin/ChanMeng666-patch-1`（`git log origin/ChanMeng666-patch-1`：commit `6c86203a`，2026-11-08，"Change video link to new asset URL"，只改 `README.md`）；RM-D19、RM-D20 |
| RM5.4 ext-apps 2.x 迁移 | #603（CI 红在 "Workspace builds"：`packages/mcp-worker/src/server.ts` 的 `TS2353`）；RM-D19 |
| RM0.2 加三项 | #683；`examples/studio.arch` 第 3–5 行；`src/cli/commands-analyze.ts` 的 `--strict` 说明（警告计入失败）；`src/lint/ruleset.ts`（`LINT_PROFILES`） |
| RM5.1 加两行 | `docs/from-an-image.md`、`docs/edit-one-room.md`；C §G.6 的建议（出处 N4 S1、OL9 §6） |
| RM1.6a | #680；DEC10 决定 1；P10 `professionalisation-roadmap.md` P0-A；`src/index.ts:358`（`DEFAULT_RULESET`、`LINT_PROFILES` 公开导出）；`src/lint/ruleset.ts`（`[V]`/`[S]`/`[M]` 注释、`wallGapMm` 无文献）；`../drawing-set/README.md` D13；XRC |
| RM1.6b | #680；`src/diagnostic-json.ts:67`（`diagnosticToJson(source, d)`）；`test/lint-summary.test.ts`；`test/helpers/byte-identity-payload.ts`（`JSON.stringify(api.lint(...))`）；`src/lint/ruleset.ts:261`（`minDoubleBedroomAreaM2`）；`src/lint/rules/per-room.ts`（同一码多键）；`diagnosticToJson` 的调用方（grep）：`src/cli/commands-analyze.ts`、`packages/mcp/src/tools.ts`、`packages/mcp-worker/src/server.ts`（注册同一组工具）与 `app.ts`、`packages/web-component/src/arch-plan.ts`、`playground/src/actions.ts`、`playground/src/checks-panel.ts`、`playground/worker/app.ts`、`dataset/generate.ts`、`eval/l2.ts`；`AGENTS.md`（dataset 金丝雀永不重新生成） |
| PS7.9 目标 | `spec.llm.md` 29,856 UTF-16 单位；`test/llm-spec-drift.test.ts`（`< 30_000`）；`../plan-soundness/cards.md`（PS7.9） |
| RM1.1a / RM1.1b 改记录处 | `../plan-soundness/handoff.md` §4（现有表）；本计划 `handoff.md` 的测量表 |
| RM5.3 一条 URL 的代理入门 | B §F4 引 CC 与 CMP 的 Cogram、Lini 条目（"skill.md 零账号上手"）；本仓库 `skills/archlang/SKILL.md`、`llms-install.md` |
| RM1.8 | #684；P10 `building-codes-and-standards.md`；`src/lint/ruleset.ts`（两个数在 `DEFAULT_RULESET`） |
| CR11a / CR11b | `../checker-reach/README.md` §3 CR11；F §S5（schema 先于政策）；`GOVERNANCE.md` |
| CR10 加跨辖区一列 | P10 `professionalisation-roadmap.md` P0-B；`src/lint/ruleset.ts`（`us-residential-advisory` 的 handouts 注释）；`../drawing-set/README.md` D13 |
| RM3.1 拆半 | v1 `cards.md` RM3.1；`../plan-soundness/cards.md` PS0.18；`../preview-and-remodel/cards.md` J16；RM-D10 |
| RM4.3 | #682；DEC10 决定 1（独立的导出项）；`src/export/dxf.ts`；`docs/backlog.md` D.7 |
| CRF1 → RM7.2 | #681；DEC10 决定 1 与规模门（"more than about 500 lines of `src/`"）；`../checker-reach/README.md` CRF1；`src/elements/walls-from-rooms.ts`（`_derivedWalls`）；`src/describe.ts`（`DESCRIBE_FACTS`）；`src/analyze/quantities.ts`；`test/helpers/byte-identity-payload.ts`（`engineProbeParts`）；`docs/agents/iron-laws.md:121-122`（不为 `describe()` 构建墙体接合） |
| RM1.2b 加可开启值 | P10 `professionalisation-roadmap.md` P1-F；`docs/agents/iron-laws.md:14`（T6）；`src/lint/ruleset.ts`（`DEFERRED_PROFILE_NUMBERS`）；`../plan-soundness/cards.md` PS2.16 |
| MF1 → RM1.7 | P10 `professionalisation-roadmap.md` P1-E；`src/finish.ts:287`、`:317`（`STRICTER_PROFILES`）；`../engineering-health/closing-audit.md` §1（06-F3）；`../math-foundations/cards.md` MF1 |
| RM7.3 读数自检 | AR（11-09 行：1,451 次，按工具拆分，无来源拆分）；RUL（RM-D2 的四项与窗口）；ARD 决策 6；IA §1 |
| RM4.4 | #362、#364、#367、#369、#405（关闭时写明的未做项）；触发只按 growth `AGENTS.md` 第 44 行的 Daniel 规则 |
| RM6.1 时间不变；MF-D11 由 RM-D17 裁定 | `../math-foundations/README.md:307`（"排期不变"）；同文件 §6.1 第 2 条（一层楼板都没写时 `describe()` 一字不变、不加跳过说明）、第 3 条（MF-D11 必须在 RM6.1 的 PR 里解决）、第 1 条（Plan JSON 已承载的高度字段）；#544 |
| RM4.3 不等 D.7 | `docs/backlog.md` D.7；#682（正文要求线宽值与 SVG/PDF 已画的线宽同表） |

### G.4 §4 新增的九行"不做"

| 行 | 一手出处 |
|---|---|
| 墙上的结构标签 | P10 `professionalisation-roadmap.md` P2-B；`docs/agents/iron-laws.md:75`（D25） |
| 按窗种猜可开启比例 | P10 P1-F（"per-kind defaults"）；ADR 0005、ADR 0027 |
| 拼接后的墙几何进默认输出 | #681 正文；`docs/agents/iron-laws.md:121-122` |
| 建筑标志（挂起） | P10 P1-B；v1 `README.md` §6 RM-D5 |
| Wi-Fi、电气、通风、室内地图导出 | P10 `use-case-expansion.md`（"Recommended top 4 (plus one conditional)"，电气的 Floorcraft 门） |
| IFC 保证措辞、IDS | P10 P1-G；DD（2026-11-03） |
| `--layers iso13567` | P10 P1-C；P10 `drawing-and-data-standards.md` §1 |
| ResPlan 指标报告、benchmark | P10 P2-E；`DEC/2026-11-04-positioning-proposals-and-competitor-registry.md` A2 |
| PyPI、付费目录、中文社区推广 | IA `listings.csv`（GAP-PYPI 行）与 IA `TODO-submissions.md`（付费目录）；CAMP（"Excluded by owner policy of 2026-10-22: no V2EX, Zhihu or Xiaohongshu marketing"） |

### G.5 §5 新增的信号

| 信号 | 一手出处 |
|---|---|
| Show HN 评论要剖面 | v1 `README.md` §5 第 1 行（既有规则） |
| 读数三项自检 | AR；RUL；ARD 决策 6 |
| `compile` 多于 `validate` + `lint` | AR（11-02：validate 114、compile 88；11-09：compile 430、validate 362、lint 311）；RUL（RM-D1 的证伪条件） |
| `--facts walls` 八周无读者 | DEC10（IFC 的前置）；原则 9 |
| Daniel 的下一批 issue，或所有者一句话 | DD（11-03、11-06 私信段与 11-09 附记）；growth `AGENTS.md` 第 44 行（不提问，不按答复排期） |
| 第三个外部仓库 | IA §1；RUL（RM-D2 信号 1） |
| 批次 C′ 12-09 前三张未合 | 本计划排期（推断，无外部出处） |

### G.6 核对中改正的说法

- XRC 是 growth `research/cross-report-corrections.md` 一个文件（`research/README.md` 只链接它），RM1.6a 写的是这个文件。
- Show HN 的 runbook 在 `marketing/launches/runbook-2026-09.md`，不在 `marketing/launches/show-hn/` 下。
- MP7 不在 `docs/backlog.md`，仍记在 `../playground-mobile-perf/README.md` §5（deferred）。
- 外联日志里"退界、FAR、分区的范围裁定 open"一行在 OL9 第 123 行；RM-D5 已于 2026-11-06 裁过（v1 `README.md` §6）。更正记为 growth 待办（`handoff.md`）。
- RM-D2 的读数窗口是截至 2027-01-28 的四周；11-09 那周不在窗口里（RUL）。
- nightly run 42801157907（`main@69fa5864`，2026-11-10 的定时运行）里 `Deep fuzz (FC_SCALE=10)` 与四个 `Test …` job 全部 success；#497 已于 2026-11-10T11:07Z 关闭。第一版写"还没有一次完成的 nightly"，第二轮红队指出它已过时，已更正（2026-11-11 用 `gh` 复核）。
- `W_INNER_ROOM` 不在 `src/` 里，是 PS2.16 拟议的码；文中都写成"拟议的"。
- 推导墙的 `id` 是 piece 名（`src/elements/walls-from-rooms.ts`），`heights.walls[]`（`src/describe.ts`）与 quantities 的行（`src/analyze/quantities.ts`）都按 `id`；`describe().derived_walls[].name` 是 spec 名，一对多。第一版写"按 `name` 对齐"，已更正。
- backlog O.10 写的是 #119、#121（2026-10-19 关闭）；后继的 #206–#208 于 2026-11-09 关闭。
- 托管 MCP 的工具由 `packages/mcp-worker/src/server.ts` 从 `packages/mcp/src/tools.ts` 注册，是同一组工具。

### G.7 2026-11-11 的裁定

| 裁定 | 一手出处 |
|---|---|
| RM-D9…D16 批准 | 所有者 2026-11-11 原话："RM-D9 到 D16 我全部同意。"（本会话，记入本计划 `README.md` §6.1） |
| RM-D17…D20 受托 | 所有者 2026-11-11 原话："请你帮我做出最佳决策。"（针对当时"仍等所有者"的四项；当日委托，不是长期委托） |
| RM-D17 = MF-D11 | `../math-foundations/README.md` §6.1（MF-D1 第 2、3 条）；#532（房子写了顶层净高 OG 2,34 m，同文件第 3 条引） |
| RM-D18 | growth `AGENTS.md` 第 44 行（Daniel 规则）；#362（bobsch-io 的楼梯 issue）；#544；#532 |
| RM-D19 | #603（主版本，CI 红在 "Workspace builds"）；`docs/agents/iron-laws.md` 的 Dependabot 规则（主版本等所有者） |
| RM-D20 | `origin/ChanMeng666-patch-1` 的 commit `6c86203a`（没有 PR） |

---

## §H 第 8 轨"视觉质感"的证据对照（2026-11-11）

第 8 轨（`README.md` §1.1d、原则 13–14、§3 的 RM8.1…RM8.9、§4 第 1 行、§5 的四条视觉信号、§6.3）出自三份只读调查（V1 3D 竖线根因、V2 元素清单与新增规则、V3 视觉需求，2026-11-11）和主会话据此写的增补规格。三份调查与规格不进本仓库，将归档在 `D:\github_repository\claude-kept\2026-11-10-archlang-roadmap-v2\`；本节只保留它们引用的一手出处。调查是二手的：下列本仓库路径、符号、测试名与 backlog id 2026-11-11 在 `main@4adceabc` 上逐条 grep 或读过；数字（家族数、生成器数、未露面的家族、spec 长度）用只读脚本从源码重算过；growth 路径逐条 `Test-Path` 核过，全部存在。与调查或规格不符之处列在 §H.5。

growth 路径缩写（相对 `D:\github_repository\archcanvas-growth`；§A 与 §G 的缩写照用）：

| 缩写 | 路径 |
|---|---|
| VP1 | `research/2026-11-04-viral-post-analysis-and-content-playbook/01-post-corpus-and-metrics.md`（同目录的 `02-why-they-worked.md`、`03-user-pain-points.md` 即 VP） |
| SP | `data/social-posts.json` |
| X28 | `strategy/decisions/2026-10-28-3d-preview-exposure-and-positioning-row-8.md` |
| D3P | `strategy/decisions/2026-11-06-archlang-3d-on-public-surfaces.md` |
| XM | `research/2026-10-25-x-ai-cad-market-research-and-strategy.md` |
| TR | `research/2026-11-08-competitor-hands-on-trials/`、`research/2026-11-10-hands-on-trials-MODE-C-batch1/` |
| VOICE | `marketing/content/voice.md` |
| C6、CW、IA、OL10 | 同 §A 与 §G 的表 |

### H.1 §1.1d 的事实

| # | 说法 | 一手出处 |
|---|---|---|
| 1a | 查看器对每个节点单独描边 | `packages/archlang-3d/src/replay/mount.ts`：`add()` 里的 `new EdgesGeometry(geo, 30)` 与 `LineSegments`（楼板、玻璃除外，约第 309–314 行）；面片的 `polygonOffset`（约第 303–305 行）；墙的压顶单独拆出、不加边（约第 334 行的注释） |
| 1b | 每个墙块、窗台块、过梁块是独立的闭合棱柱 | `packages/archlang-3d/src/mesh/build.ts`（`w.body.map((p) => prism(p, e, top, splits))`；`o.sill > 0`、`o.head < height` 各一个 `prism`，约第 514–523 行）；`src/mesh/extrude.ts:90`（`prism`）；`src/check/verify.ts`（V-GEO-02：每个壳体封闭）；交叉块的归属来自核心的 `joinWallSet`（`src/walls/ownership.ts`） |
| 1c | GLB 没有线 | `packages/archlang-3d/src/glb/write.ts`（只写 `POSITION` 与索引）；V1 对已提交的 `docs-site/public/3d/studio.glb` 的实测 |
| 1d | 门窗每个 4 条；39 个示例里可见的墙间假缝 81 处 | V1 的草稿脚本（读 `archlang3d build --format scene3d` 的输出），**未入仓库**，本节未复算；机理由 1a、1b 推出 |
| 2a | 103 个家族、163 个词；2D 每个家族专门画 | `src/elements/fixtures-glyphs.ts`（`CANONICAL_FIXTURES`、`FIXTURE_CATEGORIES`、`DRAW_BY_FAMILY`）；`test/glyph-dispatch-table.test.ts`；`docs/furniture.md:122` 的手写计数 |
| 2b | 3D 101 个专属生成器，2 个共用，目录内无灰盒 | `packages/archlang-3d/src/mesh/t0.ts`（`T0_FAMILIES` 101 个键，只读脚本重算）；`packages/archlang-3d/test/t0.test.ts` |
| 2c | 42 个家族从未以 `furniture <词>` 出现在 `examples/**`，其中 20 个是 2026-11-04 那一批 | 只读脚本对 40 个 `examples/**/*.arch` 的统计（未解析组件导入）；那一批 = `CANONICAL_FIXTURES` 第 84–103 个（`test/helpers/new-families-law.ts:36`，`FAMILIES_BEFORE = 83`），字节恒等律禁止已发布平面用它们（`test/new-families-byte-identity.test.ts`；`.claude/rules/glyphs.md` § Traps） |
| 2d | 符号目录只有文字；样张工具从未提交 | `docs/furniture.md` "The symbol catalogue" 一节；`docs/backlog.md` D.8 |
| 3a | `outdoor` 地面与围栏 3D 都不建 | `docs/backlog.md` VA.2；`packages/archlang-3d/src/mesh/build.ts` 的账本 `m1-omits-outdoor-fences`；Scene3D 已带 `outdoor`、`fences`（`src/scene3d/build.ts` 的 `outdoorOf`、`fenceOf`） |
| 3b | `floor` 子句 3D 不读；Plan JSON 列为 `dropped` | `src/plan-json/to-json.ts`（`PlanJsonDroppedClause` 的 `"floor"` 与 `add("floor", …)`）；`test/room-floor.test.ts`；`packages/archlang-3d/src/materials.ts`（`FLOOR_FINISH_RULES`、`floorFinish`、账本 `floor-finish-default`） |
| 3c | 没有地面平面 | `mount.ts`（无地面片、网格或雾；V2 的 grep） |
| 4a | 无阴影（阴影图多约 55% 帧时间） | `mount.ts` 灯光处的注释（"a 2048² PCF map for the key cost ~55% more per frame … over the card's ~30% budget"）；`docs/backlog.md` VA.5 |
| 4b | 关闭了抗锯齿 | `mount.ts`：`new WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true })`、`setPixelRatio(1)` |
| 4c | 门无门框，窗无窗台板，楼梯实心 | `packages/archlang-3d/src/mesh/build.ts` 头注释（门扇 40 mm；窗 16 mm 玻璃与 40 × 60 mm 框，`GLASS_MM`）；账本 `stair-solid-default` |
| 5a | CLI 没有 `--theme` | `docs/backlog.md` VA.4；`src/manifest.ts` 与 `docs/cli-reference.md` 无该旗标；`src/types.ts`（`CompileOptions.theme`） |
| 5b | playground 已有主题下拉框 | `playground/index.html` 的 `<select id="theme">`（含 `rendered`）；`playground/src/main.ts`（`themeSelect`） |
| 6 | 地面词只有四个；缺的家族与装饰 | `src/hatches.ts:72`（`FLOOR_MATERIALS`）；`src/ast.ts:863`（`OUTDOOR_KINDS`）；V2 §D 按 `CATALOG` 的对照（缺口的排序是调查者的判断） |
| 7a | 平面升 3D 的帖子曝光最大（1,978,574；372,742；185,750；795,219） | VP1 语料表（Solvaix、akokoi1、SammmAing、Maketplans 四行）；X28 的触发条件 |
| 7b | ArchLang 自己的 3D 帖子 15–38 次曝光，账号 7 个粉丝 | SP（各帖的 `impressions`）；IA；`strategy/archlang-archcanvas-strategy.html`（"At 7 followers"） |
| 7c | 指出门放错的回复 34,613 次曝光 | VP1 回复表（@jk_tech_stuff） |
| 7d | ArchLang 2D 高于多数竞品，3D 最弱 | TR 的截图（V3 §B 逐张列出路径）；**调查者看图的判断**，不是测量 |

### H.2 第 8 轨的卡

| 卡 | 一手出处 |
|---|---|
| RM8.1 | 同 H.1 第 1a–1c 行；`packages/archlang-3d/test/mesh.test.ts:391`（`LANEWAY_MESH_SHA256`）、`test/pins.ts:39`（`LANEWAY_GLB_SHA256`）、`test/replay.test.ts:464`（`LANEWAY_EVENTS_SHA256`）；`src/scene3d/scene3d.schema.json`；`e2e/keyframes.e2e.ts`、`e2e/fixtures/keyframe-baseline.json`、`e2e/fixtures/README.md`（X4 的重钉先例）、`e2e/assets.e2e.ts`；`.claude/rules/archlang-3d.md`（Pins 一条与 Traps 第 1 条，卡里逐字引用）；`scripts/gen-3d-assets.ts`（`--videos`）；仓库根 `README.md` 第 50、54 行的两张海报；`test/fixtures/stress/s5-door-on-arc.arch`；`../drawing-set/cards.md` DS13（`lines.ts`，`prism` 外的旁路） |
| RM8.2 | `mount.ts`（`antialias: false`、`setPixelRatio(1)`）；`packages/archlang-3d/src/replay/video.ts`（`renderStill`、`renderReplay`）；`scripts/gen-3d-assets.ts`（`POSTER` 1600 × 900，`--check`）；`e2e/keyframes.e2e.ts`（480 × 270，`renderReplay`）；`docs/backlog.md` 3D.2；`../playground-mobile-perf/README.md` §5（MP7） |
| RM8.3 | `docs/backlog.md` VA.2；账本 `m1-omits-outdoor-fences`；`src/elements/outdoor.ts`（`GROUND` 的 `tint`：`lawn`、`paving`、`water`）；`src/index.ts`（`THEMES` 公开导出）；`src/ast.ts`（`OUTDOOR_KINDS`、`FENCE_STYLES`）；`../visual-assets/README.md` V-D4、V-D5；`../checker-reach/README.md` §3 与本计划 `cards.md` §0（冻结只合缺陷修复） |
| RM8.4 | `docs/backlog.md` VA.4；`src/manifest.ts`；`.claude/commands/new-cli-flag.md`；`scripts/generators.ts`（`gen:cli` → `docs/cli-reference.md`）；`src/types.ts`（`CompileOptions.theme` 压过源文件的 `theme`）；`playground/index.html`（`#theme`）；`scripts/gen-example-svgs.ts`；`test/fixture-byte-identity.test.ts`（`.claude/rules/glyphs.md` § Traps）；本计划 `cards.md` RM5.2 |
| RM8.5 | `docs/backlog.md` D.8；`src/elements/fixtures-glyphs.ts`、`src/fixtures-catalog.ts`；`docs/furniture.md`；`test/new-families-byte-identity.test.ts`、`test/helpers/new-families-law.ts`；`.claude/rules/docs-prose.md`；`../public-surfaces/3d.md` §1（配对、只用编译器输出） |
| RM8.6 | `docs/backlog.md` VA.1；`packages/archlang-3d/src/mesh/build.ts` 头注释与 `GLASS_MM`；账本 `stair-solid-default`；`src/mesh/t0.ts`（`profile`、`T0_HANDED`、`handedAt`）；`src/check/verify.ts`（V-GEO-02）；`../visual-assets/README.md` V-D3、V-D4、V-D5；`test/glyph-chirality.test.ts` |
| RM8.7 | `src/hatches.ts`（`FLOOR_MATERIALS`、`META`）；`src/elements/outdoor.ts`（`GROUND`）；`src/ast.ts`（`OUTDOOR_KINDS`）；`scripts/gen-llm-spec.ts`（`room` 行的 `FLOOR_MATERIALS.join("\|")`，`outdoor` 行的 `OUTDOOR_KINDS.join("\|")`）；`test/llm-spec-drift.test.ts`（`< 30_000`）；`spec.llm.md`（29,856 UTF-16 单位，2026-11-11 重算）；`test/room-floor.test.ts`；`src/plan-json/to-json.ts`；`packages/archlang-3d/src/materials.ts`；`.claude/rules/archlang-3d.md`（加性导出）；`.claude/rules/glyphs.md`（不改墙材料图案）；`test/helpers/new-families-law.ts`（`NEAR_WORDS` 含 `stone`）；`src/elements/fixtures-glyphs.ts`（`carpet` 是 `rug` 的别名） |
| RM8.8 | `docs/backlog.md` VA.5；`mount.ts` 灯光处的注释；`packages/archlang-3d/src/replay/payload.ts:71`（`PREVIEW_LIMITS`）；要求同句的测试：`packages/archlang-3d/test/package-meta.test.ts`、`replay.test.ts`、`docs-site.test.ts`，仓库根 `test/readme-3d.test.ts`，`playground/e2e/preview3d.spec.ts:44`；同句或同义的面：`README.md`、`packages/mcp/README.md`、`editors/vscode/README.md`、`packages/archlang-3d/README.md`、`docs-site/3d.md`、`docs/plans/public-surfaces/3d.md`；ADR 0023 决定 5（2D 无阴影）；`../math-foundations/README.md` §6.2（MF-D2） |
| RM8.9 | `.claude/commands/new-fixture-family.md`；`src/elements/fixtures-glyphs.ts`；`src/fixtures-catalog.ts`；`test/tables/glyph-dispatch.json`；`test/handedness-grid-baseline.ts`；`test/glyph-chirality.test.ts`；`packages/archlang-3d/src/mesh/t0.ts`（`T0_MOUNT_MM`）与 `test/t0.test.ts`；仓库根 `test/material-vocabulary.test.ts`；`test/new-families-byte-identity.test.ts:123`、`:125`（`FAMILIES_BEFORE + 20`、`desk_pod`）；`scripts/gen-llm-spec.ts:115`（`SIZE_OPTIONAL_FIXTURES`）；`docs/furniture.md:122`、`docs/overview.md:272`（手写计数）；`../visual-assets/README.md` V-D6、V-D7；`docs/backlog.md` 3D.4 |
| `visual-language.md` | 上面各行；`../visual-assets/README.md` V-D1…V-D7 |
| RM5.2 去掉 `--theme` | `docs/backlog.md` VA.4；本计划 `cards.md` RM5.2 |

### H.3 裁定

| 裁定 | 一手出处 |
|---|---|
| RM-D21 | 所有者 2026-11-11 的原话（本会话，全文录在 `README.md` §6.3） |
| RM-D22（提请） | `../engineering-health/README.md` EH-D1（"Two, each running `check:quick` once with 2 vitest workers"）；`docs/agents/orchestration.md`；V1 §D.4 与 V2 §E 列的文件范围（视觉卡只动 `packages/archlang-3d`、资产与文档，RM8.4、RM8.7、RM8.9 除外） |
| RM-D23（提请） | `docs/backlog.md` VA.5；`mount.ts` 灯光处的注释；`packages/archlang-3d/src/replay/payload.ts`（`PREVIEW_LIMITS`）；ADR 0023 决定 5 |
| T 形阴角线的设计默认 | V1 §B.4（阴角线是真实折角，无论交叉块判给谁都在）与 §D.5（线稿惯例） |
| 关键帧重钉 | `.claude/rules/archlang-3d.md`；`packages/archlang-3d/e2e/fixtures/README.md` |

### H.4 §4 第 1 行的改写与 §5 的视觉信号

| 项 | 一手出处 |
|---|---|
| 仍然不做：漫游、PBR、照片级、AI 图像、发光 | `../public-surfaces/3d.md` §1（PS-D11 用词禁令与 "Compiler output only"）；`.claude/rules/archlang-3d.md`；D3P；`../math-foundations/README.md` §6.2（MF-D2）；CW（"Do not chase parity on AR, PBR or photoreal"） |
| 现在允许的三项 | RM-D21；VA.1、VA.2 的门禁（`docs/backlog.md`） |
| "好看但画错"会被嘲讽 | VP1 回复表；OL10（@MitchellWallAD）；VP `03-user-pain-points.md` P7 |
| 用访问量检验 | `docs-site/privacy.md`（两个站点用 Cloudflare Web Analytics 计访问） |

### H.5 核对中改正的说法

- 规格说 playground 没有主题切换入口；仓库里已有 `playground/index.html` 的 `#theme` 下拉框（含 Rendered）。RM8.4 的 playground 一项改为"核对能否被找到，不另做"，§1.1d 第 5 条照实写。
- 规格说 RM8.3 的每种地面"取自 2D 主题的同名键"；2D 主题只有三个地面键（`lawn`、`paving`、`water`），`GROUND` 表让 9 个种类各读其一。卡里写成"按 `GROUND` 的 `tint` 取色，再分色要论证"。
- 规格把接触阴影写在 RM8.5 名下（设计稿列表）；接触阴影是 RM8.8，RM8.5 在设计稿里的一节是展示示例怎样进入字节恒等律的语料。已按卡号改正。
- 规格的单车道排法把 RM8.2 写成"随 RM8.1"，但它的 1 日不在 9 日的线里；README 照实写成线下（RM1.4 之后），与 RM8.1 同一次重生成只在时间允许时成立。
- 规格把 CRF9 列为阶段 F 候选；本计划 §7.1 与 `cards.md` 的等待表记它为 parked。候选里注明它仍 parked，不改状态。
- backlog D.8 是"两份检出的前后对照样张"，并写明工具不进 `check:drift`；RM8.5 的"每个家族一张图"是它的扩展，卡里两样都写，并保留"不进 `check:drift`"。
- `.claude/rules/archlang-3d.md` 的正文说默认路径的改动 "must leave them"（含关键帧基线），RM8.1 改的正是默认路径的画面。卡与 `README.md` §6.3 写成带理由的重钉，并引 `e2e/fixtures/README.md` 里 X4 的先例；是否需要所有者对此另说一句，交主会话判断。
- 要求 `PREVIEW_LIMITS` 同句的不止包 README：还有回放 HTML、docs 站（含 `docs/plans/public-surfaces/3d.md` 的引文）、三个 README 与 playground 的 e2e 逐字副本；README 海报的 alt 文本也写着 "in flat colours"。RM8.8 全部列出。
- 规格写"39 个示例"；`examples/**` 下今天有 40 个 `.arch` 文件。81 处假缝是 V1 对它导出的 39 份 Scene3D 的统计，本节未复算。
- V2 引的 `material-vocabulary.test.ts` 在仓库根的 `test/`，不在 `packages/archlang-3d/test/`。
