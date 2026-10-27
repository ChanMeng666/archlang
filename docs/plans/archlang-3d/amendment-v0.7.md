# archlang-3d 计划修订 v0.7（2026-10-28）：回放查看器先行，曝光分级

**Status:** Proposed（所有者 2026-10-27/28 口头委托；未改核心、未开工）· **基线：** `main@8829a8bb`
（v0.6 的基线 `1a1efd9` 之后 350 个提交）· **上位文档：** `../preview-and-remodel/README.md`（本修订的
卡片、波次与决定 D1–D13 在那里；本文件只记录对 v0.6 的改动）。

## 1. 改了什么

| 项 | v0.6 | v0.7 |
|---|---|---|
| M1 | 一个里程碑：GLB 为主交付物，D10 才有最小查看器，视频到 M3 | **拆为 M1a → M1b → M1c → M1d**：M1a = 适配器 + H1 + Scene3D v0 + **Mesh3D** + 墙/洞口/楼板/平屋顶/柱/灰盒与 T0 家具 + **按绘图工序的生长回放查看器** + `archlang3d view --replay [--video]`（Playwright + ffmpeg 从 M3 提前）；M1b = GLB + 校验门 + CLI + `check:3d` + 许可门；M1c = playground 2D/3D 切换；M1d = 浏览器内 WebCodecs MP4（parked） |
| 几何真相 | Scene3D | Scene3D → **Mesh3D**（整数微米三角网、`(level, kind, id)` 规范序）；查看器与 GLB 同吃 Mesh3D |
| Q5 | M6 前不宣传 3D | **重开**：曝光按验收门分级（growth 仓库决策记录 2026-10-28）：Tier A 在 M1a 验收后 = 所有者个人 X 账号 + playground 切换（标注"Preview — from the separate archlang-3d package. ArchLang itself draws plans."）；Tier B 在 N10 读数为正 + M1b 绿 + 所有者亲发 0.x 后 = ArchCanvas + positioning 第 8 行改写；Tier C = M6。ADR 0030 决定 1 与风险 R8 按此改写 |
| Q1 | `private: true` 直到 M6 | 孵化在 monorepo 不变；**"private 到 M6"重开**：Tier B 需要一次 0.x 发布（trusted publisher 登记与发布均为所有者动作） |
| C1 导出 | 26 个名字 | **27 个**：加 `doorLeaves`（`src/geometry.ts:211`）。`double` 门种类下 `doorSwing()` 返回 `null`，门扇只来自 `doorLeaves()` |
| 回放顺序 | 无 | 写作阶段为骨架 `brief → rooms → walls → openings → fixtures → drafting` → 升墙；`walls` 内 柱 → 外墙 → 内墙 → 栏栅；房间先淡线；`drafting` 交叉淡入核心 SVG；不改核心（`ELEMENT_KIND_STAGES` 已覆盖全部种类）|
| 主题 | 未提 | 深色蓝图只允许在导出的 HTML/MP4；站点浅色（ADR 0014）|
| 人天 | 85 / 47 | 约 94 / 52（M1a 18/10，M1b 6/3，M1c 3/1.5，M1d 2/1；M3 扣除已提前的 `view`/视频工作）；首支可复现回放视频约在第 12 个 AI 协作人天 |

其余 20 项决定（Q2–Q4、Q6–Q22）**不变**。

## 2. 对 v0.6 文档的更正（2026-10-28 在 `main@8829a8bb` 实测，脚本见所有者的 scratch 报告 08）

- `core-pr/c1-c2-exports.md`：根导出数应为 549 → 576（加 `doorLeaves`），不是 462 → 488；`resolvePlan` 的返回
  类型现为 `{ ir, diagnostics, levels, plan? }`（多了 `plan?: PlanNode`，稳定性承诺的引文要更新）；
  "27 other types" 现为 28（新增 `Comment`）；`src/index.ts` 的插入点约在第 417–422 行。
  10 个被跟踪声明的文件与行号均未变；`doorSwing` 签名未变、函数体重构为 `swingAlong(...)`。
- C1 类型闭包仍是 13 个类型 + `AnalyzeOptions`；新导出的 87 个名字（stages、taste、keep/impact、facts）与提案无冲突。
- Plan JSON 缺口仍是 13/34、同一批文件；`hillside-villa` 另需 `outdoor`；34 份里 27 份指纹因示例改写而变化。
- Q16 **已实测确认**：`packages/x/test/*.test.ts` 被 `check:test-wiring` 与 vitest 同时拾取；`e2e/` 下的文件只要
  不以 `.test.ts` 结尾即通过 wiring 门；`typecheck:all` 逐个列出 workspace，新包必须加入。
- ADR 0030/0031 编号仍空闲（ADR 0032 为其保留）。
- `spike/src/planjson_gap.mts` 在 Windows 上因裸路径 `import()` 失败；A1 迁入包内时修正，spike 原件不动。
- 实测尺寸：three.js 0.186.1 为最新版，MIT，不带 `three.module.min.js`；用 esbuild 压缩后 gzip：全库 190 kB、
  查看器子集（含 OrbitControls）140 kB、含 GLTFExporter 151 kB、无头导出 82 kB。playground 启动两块 chunk 共
  约 554 kB gzip，查看器必须按需加载。解析器以 `platform: browser` 打包零外部依赖，183 kB gzip。
  `npm run check` 787 s（11,078 个测试）。

## 3. 与绘图顺序调研的关系

调研（scratch 报告 03）结论：没有任何标准规定绘图顺序；教材一致骨架为 设出 → 外墙 → 内墙 → 门 → 窗 → 楼梯与固定
设施 → 尺寸 → 加深线型 → 图签；"轴网→柱"只见于框架结构；Berkeley 讲义"先画内线"与 ADR 0028 一致；引发本轮的
Solvaix 帖子是 LLM 演示，不作证据。因此回放顺序取写作阶段（对 ADR 0028 诚实），`RENDER_PASSES` 不动。

## 4. 不变的事

核心零依赖、`compile()` 纯且有界、heights draw nothing、3D 永不进核心、每个新语言形式一条字节同一律、
发版与发布为所有者动作、M2–M6 的交付物与验收。
