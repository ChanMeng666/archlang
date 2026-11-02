# 03 一份底图、多张分析图、一套图纸：D2 / Typst / Vega-Lite / 制图标准 / ArchLang 现状

> 调研原始记录（2026-11-02，基线 `main@18127701`）。结论若与 `../README.md` 冲突，以 README 为准；勘误见 README §1.3。文中“探针”指当时的一次性文件，未入库，只有 Band Envelope 探针留在 `../spike/band-envelope.mjs.txt`。

调研日期 2026-11-02。未修改 ArchLang 仓库；三个外部仓库均 `git clone --depth 1` 到
`（本地浅克隆目录）`，只读文件，未运行任何安装或构建脚本。

- d2 `6a7b4837838a3907604a1d9eec57ee98b6f3cd01`（terrastruct/d2）
- typst `84cca406aafe7f830ed3f37f1cc6f0c8b6b65a03`（typst/typst）
- vega-lite `4a29260c30c2a7352ec681ecca65c0c2ad960dfc`（vega/vega-lite）
- archlang `181277015e59280d46515cbf3790feb45b745700`（main，工作区干净）

标记：**VERIFIED** = 我读到了原文或实测；**INFERRED** = 由代码或二手材料推断，未直接证实。

---

## 0. 结论先行

1. 要做的不是“更多 overlay”，而是三件彼此独立的小事：
   (a) 语言里的命名分析图 `diagram`（D2 的 scenario/step 语义）；
   (b) 一个新的一等元素 `route`（照 `fence` 的先例，描述事实、默认不画）；
   (c) 一个纯函数 `pack()` 加 CLI 子命令，产出多页 PDF、图纸目录和逐步动画。
2. `--overlay circulation` 是“测量事实的叠加层”，route 是“作者声明的数据”。两者不能混成同一个机制：前者在 `compile()` 之后追加 Scene 节点（`src/scene-build.ts:1072-1078`），后者必须进 IR。
3. 探针 A1 总图“站点悬在远处”不是 `chrome-layout.ts` 的 bug，而是设计行为叠加一个无法自动选择的比例：作者写了 1:1000，而 auto-fit 和 `finish` 都只到 1:500。正确的修法大部分不动现有 golden（第 5.4 节）。
4. 放哪：语言侧（`route`、`diagram`）进核心；`pack` 的纯逻辑进核心、I/O 进 `src/cli/`；playground 只消费。不需要新包，因为没有新的重依赖（pdfkit 已是核心的可选依赖，`package.json:141-144`）。

---

## 1. D2：一份源码，多块派生 board

许可证：**MPL-2.0**（`repos/d2/LICENSE.txt` 开头）。文件级 copyleft，结论：**copy idea，不复制代码**。

### 1.1 三种 board 的继承语义（VERIFIED）

`d2ir/d2ir.go:550-584`：`NodeBoardKind` 按父字段名 `layers` / `scenarios` / `steps` 分类。三种在 `d2ir/compile.go` 的 `compileField` 中处理不同（行 1771-1799）：

- **scenario**：`c.overlay(ParentBoard(f).Map(), f)`，以父 board 为底，叠加自己的改动（行 1772-1776）。
- **step**：叠加在**前一个 step** 上，第一个 step 叠加在父 board 上（行 1777-1790）。所以 step 是累积的，这正是“逐步生成”的语义。
- **layer**：`case BoardLayer:` 为空（行 1792），不继承，是一块全新的画布。

`overlay`（`d2ir/compile.go:897-915`）：复制底 map，删除 `label`（“给 scenario 取了标题不希望所有 step 都同名”，行 907-909），再把子 map 叠上去。

继承的细节：glob 样式在 scenario 里按“拷贝已应用集”隔离，使 scenario 中应用的 glob 不污染后续 board；在 step 里则“应用结果延续”（`compile.go:988-1015`，注释行 1003-1004 “this is different from steps, where applications carry over”）。

`d2compiler/compile.go:330-361`：每个 board 编译成独立的 `d2graph.Graph`，挂在父图的 `Layers` / `Scenarios` / `Steps` 上，board 名重复报错。

### 1.2 导出（VERIFIED）

- 格式：`d2cli/export.go:11-14,36-41`（svg/png/pdf/pptx/gif）。
- 多页 PDF / PPTX：`d2cli/paged.go:428-480`（PDF，`walk` 递归遍历 board 树，每个 board 一页，带面包屑 `BoardTitle` 和内部链接）；`paged.go:509-560`（PPTX，同构，`LinkToSlide`）。
- 动画 SVG：`d2cli/main.go:109` 的 `--animate-interval`，行 755 调 `d2animate.Wrap(diagram, boards, ...)`。`d2renderers/d2animate/d2animate.go:13-37`：每个 board 是一整份 SVG，用 CSS `@keyframes` 切换 `opacity` 0↔1。没有补间，没有路径形变，只是逐帧显隐。

### 1.3 对 ArchLang 的判断

- **Copy idea**：`scenario = 基底 + 增量`、`step = 前一步 + 增量`、`layer = 不继承的新画布`。分析图需要的是前两者；ArchLang 没有“新画布”的需求，因为底图（场地、建筑）是共享的。
- **Copy idea**：动画 SVG 用显隐而不是补间，易于确定性（输出是纯字符串拼接），ArchLang 的 “build-up” 可以直接这样做。
- **Avoid**：D2 的 board 是独立图，布局引擎每块重算。ArchLang 恰相反：几何只有一份，各 diagram 的几何位置必须逐字相同，否则“同一底图”就破了。所以 diagram 不能走“复制 plan 再改”，只能是“同一 Scene 加一层选择”。

---

## 2. Typst：确定性分页与目录

许可证：**Apache-2.0**（`repos/typst/LICENSE`）。结论：**copy idea**（可复用，但 Rust，无可复用代码）。

### 2.1 事实（VERIFIED）

- 编译循环 `crates/typst/src/lib.rs:130-172`：“Relayout until all introspections stabilize. If that doesn't happen within five attempts, we give up.” `MAX_ITERS = 5`（`crates/typst-library/src/introspection/convergence.rs:16`）。目录之所以要迭代，是因为目录自身占的页数会改变后面页码。
- 目录是对 introspector 的查询：`crates/typst-library/src/model/outline.rs:186` 默认 `target` 为 `HeadingElem::ELEM.select()`。
- 页码与页眉页脚：`crates/typst-library/src/layout/page.rs:283-311`（`numbering`，第二个数字是总页数）。
- 多文件输出：`crates/typst-bundle/src/lib.rs`（`Target::Bundle`，`lib.rs:104-110` 的 `compile_impl` 里与 Paged/Html 并列）。我没有细读，不据此下结论。

### 2.2 图纸目录（图纸目录）能抄什么

- **抄**：目录是“对已声明元素的查询”，不是手写。ArchLang 的 title 块已经有 `number` 和 `revision` 行（`src/chrome-layout.ts:151-152`），图纸目录就是对各 sheet 这两个字段的查询。
- **不抄**：不要引入不动点迭代。Typst 需要它因为内容决定页数。ArchLang 的 pack 可以让目录占固定的 sheet 0，目录行只含 id、标题、比例，不含依赖目录长度的页码；总张数 N 在清单里就已知。这样一遍就够，且“确定性”（`compile()` 不变式）得以保留。
- **抄**：页码风格“第 n 张 / 共 N 张”对应 `numbering: "1 / 1"` 的第二个数。

---

## 3. Vega-Lite：图例由编码推导，调色板即共享的 scale

许可证：**BSD-3-Clause**（`repos/vega-lite/package.json:4`）。结论：**copy idea**。

### 3.1 事实（VERIFIED）

- 默认解析模式 `src/compile/resolve.ts:6-16`：layer 模型一律 `shared`；facet 默认 `shared`（仅 theta 独立）；concat 的 x/y 独立，其余 shared。
- 图例 `src/compile/legend/parse.ts:32-50`：单元模型对 `color` 及其它非位置通道遍历，**有 scale 才有图例**（`!model.getScaleComponent(channel)` 就 `continue`）。
- 非单元模型 `parse.ts:183-223`：子图图例逐个 `mergeLegendComponent`；若合并冲突，则把该通道降为 `independent` 并删除共享图例。合并成功后从子图删除，图例只在父级画一次。
- 调色板：`src/compile/scale/range.ts:69` 的 `RANGE_PROPERTIES = ['range','scheme']`，调色板就是 scale 的 range。

### 3.2 对 ArchLang 的判断

- **Copy idea**：“图例 = 这张图实际用到的语义类”的推导（对应 `src/sheet-tables.ts:304-325` `legendEntries`，它已经是“画了才列”的推导：材质来自 hatches，家具来自 present categories）。diagram 的图例沿用同一原则：列该图选中的 route 类和该图实际画出的区域类。
- **Copy idea**：统一的语义调色板 = **一张全局 class→色表**（shared scale），任何 diagram 不得私自覆盖；两个 diagram 对同一 class 要不同色就是冲突，应报诊断（对应 Vega-Lite 的“冲突则降为 independent”，但 ArchLang 里应报错而不是降级，因为“同色同义”是投标图册的核心要求）。
- **Avoid**：不要照搬 grammar 的完整抽象（repeat/facet/concat）。我们只有“一块底图 + 选择哪些类亮起”这一个轴。

---

## 4. 制图与交付标准

**说明：以下多数标准的原文是付费或不可达的。凡未读到原文的条目都标注。**

### 4.1 《建筑工程设计文件编制深度规定》（2016）方案设计（VERIFIED，转载版）

来源：`https://zjj.yangling.gov.cn/upload/zjj/2021/08/04/202108041431382766346.doc`（地方住建局转载，标题页 “建筑工程设计文件编制深度规定 2016年11月”，前言称在 2008 年版基础上修编）。属**二手转载**，不是住建部原发布页；条款号取自该转载本的正文。我把 .doc 的 UTF-16 文本抽出核对，未做 OCR。

- **2.1.1 方案设计文件**：(1) 设计说明书（含各专业说明及投资估算）；(2) 总平面图及相关建筑设计图纸；(3) 合同规定的透视图、鸟瞰图、模型。
- **2.1.2 编排顺序**：封面（项目名、编制单位、年月）→ 扉页（法人、技术负责人、项目负责人、各专业负责人签署）→ 设计文件目录 → 设计说明书 → 设计图纸。
- **2.2.1 设计依据、要求及主要技术经济指标**，其中第 7 项指标：总用地面积、总建筑面积及各分项（地上、地下分列）、建筑基底总面积、绿地总面积、容积率、建筑密度、绿地率、停车泊位数（室内/室外、地上/地下），主要建筑层数、层高、总高度；按功能增列（住宅套型/套数，旅馆客房/床位，医院门诊/病床等）。
- **2.2.2 总平面设计说明**：场地区位、现状、周边；总体构思；竖向、交通组织、防火、景观绿化、环保措施；分期建设和既有建筑保留。
- **2.2.3 建筑设计说明**：构思；与城市空间关系；功能布局与内部交通（出入口、垂直交通）；防火（总体消防、防火分区、疏散）；无障碍；节能；绿色建筑；装配式。
- **2.3.1 总平面设计图纸**：1 区域位置；2 场地范围及角点坐标；3 四邻环境；4 拟建道路、停车场、广场、绿地、建筑布置及各类控制线、间距；5 建筑名称、出入口、层数、高度、设计标高；6 指北针或风玫瑰、比例；**7 “根据需要绘制下列反映方案特性的分析图：功能分区、空间组合及景观分析、交通分析（人流及车流的组织、停车场的布置及停车泊位数量等）、消防分析、地形分析、竖向设计分析、绿地布置、日照分析、分期建设等”**。
- **2.3.2 建筑设计图纸**：平面（总尺寸、开间进深、柱网、房间名称、标高、车库行车线、首层剖切线与指北针、图名比例）；立面（有代表性的立面、标高、总高度、相邻建筑局部立面）；剖面（剖在高度或层数变化复杂处、各层标高、总高度、剖面编号、比例）。

**关键发现**：视频里的八张图（教学混合、内庭院、城市共享、接送与人流、车流、食堂物流、消防、日照）几乎逐项对应 2.3.1 第 7 项的分析图清单。所以 diagram 的类别词汇可以直接取这张表，而不是自造。

另注（VERIFIED）：初步设计阶段才要求“民用建筑主要技术经济指标表（表 3.3.2）”（同文，第 3.3.2 节第 6 点、3.3.3 节），方案阶段只要求在设计说明书 2.2.1 第 7 项列出指标。若 pack 要出“结尾指标表”，其行集合取 2.2.1 第 7 项；表格版式可参照表 3.3.2，但要在报告里标明那是初步设计阶段的表。

### 4.2 GB/T 50001-2017 房屋建筑制图统一标准

- **VERIFIED（二手）**：现行，2017-09-27 发布，2018-05-01 实施，代替 2010 版；第 3 章 “图纸幅面规格与图纸编排顺序”，含 3.1 图纸幅面、3.2 标题栏、3.3 图纸编排顺序（工标库等目录页的转述，搜索结果摘要，未打开原文）。
- **UNVERIFIED**：图框边距 c/a 的具体数值、标题栏尺寸、图纸编排顺序条文。我没有读到原文，不引用具体数。
- 仓库自述：`src/sheet.ts:64-71` 的注释写 “GB/T 50001 / ISO 128 practice”，纸张表 `PAPER_MM` 是 ISO 216（`src/sheet.ts:49-56`），A0-A4 尺寸与国标幅面一致（国标幅面即 A 系列，**INFERRED**，我没读到条文）。

### 4.3 US National CAD Standard 图号

**VERIFIED（二手，多个博客、学习指南和地方标准一致）**，**未读到 NCS Module 2 原文**：图号由三部分组成：专业代号（一级一个字母，可加二级修饰，如 A、AS、AD、AI；G 总则、F 消防、P、M）、图类代号（一位数字，0 总则/图例/说明，1 平面，2 立面，3 剖面……）、序号（两位）。示例 A-201、AD-101。各版本（V3.1、V5、V6）细节不一致，需看 NIBS 原文。

对 ArchLang：`title { number "A-101" }` 已经存在，所以 `pack` 只需要“按此约定派生或校验图号”，不需要新语言形式。

### 4.4 ISO 13567 图层

**未读到原文（付费）**。仓库自己的研究文档写 “No standard fixes a drafting order. NCS, AIA, ISO 13567 and BS 1192 name layers and pen widths”（`docs/plans/preview-and-remodel/README.md:59`）。仓库的 DXF 层名是 AIA 风格（`src/scene.ts:262-285` `aiaLayer`，`SceneNode.layerName` 可覆盖）。建议：route 的 layerName 沿用 AIA 习惯（`C-` 总图前缀等，**INFERRED**，未对照 NCS 层名表），不要引入 ISO 13567 的 agent/element/presentation 三段式，除非有人要求。

---

## 5. ArchLang 源码：最小做法

### 5.1 现状（VERIFIED）

- 叠加层：`src/overlays/circulation.ts:1-12` 头注释：只用现有 Scene 图元和现有 Theme 色（`annotation`/`annotationMuted`，行 49-50），“no new prim kinds or Theme keys”；追加时机在页面布局之后（`src/scene-build.ts:1072-1078`），因此不改页面。CLI 仅此一个：`src/types.ts:63` `overlays?: readonly "circulation"[]`。
- 分页：多层平面一层一页，`src/pipeline.ts:107-125`；`CompilePage` 只有 `level`/`name`/`svg`/`scene`（`src/types.ts:157-167`）。CLI 写 `<stem>.L<level>.<ext>`（`src/cli/io.ts:369-376`），`-o -` 对多页报错（`io.ts:381-391`）。
- PDF：`toPdf(scene, opts)` 一个 Scene 一页（`src/export/pdf.ts:243,265,279`）；pdfkit 是 `optionalDependencies`（`package.json:141-144`），缺失时抛错（`pdf.ts:248`）。
- 图例：`legendEntries`（`src/sheet-tables.ts:304-325`），表行数必须同时进“适纸规则”：`planTableRows`（`sheet-tables.ts:635-680`）、`tableBandDepth`（`src/chrome-layout.ts:301-304`）、`usablePlanMm`（`src/sheet.ts:234-247`）。`src/sheet.ts:208-217` 与 `chrome-layout.ts:287-300` 的注释记录了漏算行数导致页面超出声明纸张的旧事故。
- 元素先例：`fence`（`src/elements/fence.ts`）是描述性、有 `bounds()`（行 184）和 `drawCost()`（行 190）、`render()`（行 197）的折线元素。`describe()` 按 `kind` 过滤元素（`src/describe.ts:1401-1405`），因此不认识的 kind 不进 describe。
- 铁律（VERIFIED，`AGENTS.md`）：新元素 = `src/elements/` 一个模块、在 `defs.ts` 注册、无 switch，声明 `drawCost` 与覆盖全部绘制坐标的 `bounds()/measures()`；每个新语言形式必须有字节同一性定律（SHA-256 over SVG + describe + lint）；`compile()` 纯、同步、确定、零运行时依赖；`Heights draw nothing`。

### 5.2 (a) 命名分析图：最小方案

**不要叫 `view`**：`view` 已被废弃的轴测功能占用（`docs/adr/0021-plan-first-view-deprecated.md`，`CompileOptions.view`，计划 2.0 删除）。建议关键字 `diagram`。

最小形态（均为 **INFERRED 的设计建议**）：

```
diagram fire "消防分析" {
  show route fire        # 选中 route 类
  mute rooms             # 底图降调
  step "车道" { show route fire }
  step "回车场" { show area turning }   # 累积，语义取 D2 step
}
```

- 渲染位置：和 circulation 同一阶段，页面布局之后追加 Scene 节点，所以不会移动页面；`describe()`/`lint()` 不读它。入口是和 `overlays` 并列的 `CompileOptions.diagram?: string`（追加字段，缺省不变）。
- 底图降调不能靠“复制 Scene 再改色”：Scene 节点已是定稿；可以在追加阶段再覆盖一层半透明底色矩形（页面内），不改几何。**注意**：这是 INFERRED，需用现有后端验证 SVG/PDF/DXF 是否都能表达“半透明”。DXF 无透明度，需决定降级策略。
- 图例：沿用 `legendEntries` 的“画了才列”规则新增一种 entry 类型 `route`，并且**必须同时进 `planTableRows`**，否则重演“页面比声明纸张高”的事故（`src/sheet.ts:208-217`）。
- 语义调色板：新增 Theme 键（不是复用 `annotation`）。仓库约束 Sites light-only，且 `sanitizeTheme` 已存在；新增带默认值的键，不用就不改字节。**INFERRED**：需要看 `src/theme.ts` 里 `style` 的校验是否会因新键而改变既有 golden。
- 解析：`diagram` 是新语言形式，要有字节同一性测试；它必须从 parse 到 resolve 都不出现在没有该语句的计划中。

### 5.3 (b) route 一等元素

- 新模块 `src/elements/route.ts`，注册在 `defs.ts`。字段：`class`（`ped | veh | fire | service`，数据，不是代码分支）、折线点、可选 `width`、可选 `label`。
- 默认**不画**（类比 “Heights draw nothing”）：route 只在选中它的 diagram 里画。这样没有 diagram 的计划，字节不变；有 route 但没选 diagram 的计划，画面也不变。这是对 “plans not using them 不变” 最强的保证。
- `bounds()`/`measures()` 只覆盖“被画出的东西”；由于默认不画，`drawingBounds`（`src/sheet.ts:345-366`）里应排除未被选中的 route，否则一条越界的消防路线会改变纸张适配（`sheet.drawingFits`）。这是 **INFERRED 的风险点**，必须有测试。
- `describe()`：`describe.ts:1401-1405` 是按 kind 过滤，所以新 kind 自动不进；但**所有对 `ir.elements` 做通用遍历的 lint 规则**需要扫一遍确认（INFERRED，未逐一读 lint 规则）。要加 `compile().diagnostics` 到字节同一性载荷里，因为 route 触及 resolver（`.claude/rules/core-compiler.md` 末条）。
- 箭头方向必须来自折线段方向（“A derived position comes from the shape”），不是 bbox。
- 数值走 `src/num-format.ts`，坐标过 `MODEL_RANGE_MM`（`E_OUT_OF_RANGE`），`drawCost` 给上界；总平面尺度（如 340 m）已在探针中编译通过，说明范围没问题（`campus.arch`）。

### 5.4 探针 A1 总图的“悬浮”问题（VERIFIED + INFERRED）

**现象**：`probe/campus.png` 中表（左下）、比例尺（左下）、标题块（右下）都在纸角，场地飘在中间偏上。

**原因（VERIFIED，用探针自己的数字验证）**：
- `campus.arch` 写了 `paper A1 landscape` + `scale 1:1000`。作者给的比例**永不被覆盖**（`src/sheet.ts:288-291`）。
- 场地范围 0..340000 × 0..260000 mm；SVG viewBox 是 `-250500 -136200 841000 594000`（`campus.svg` 开头）。左空 250500，右空 841000−250500−340000 = 250500，即水平居中；上空 136200，下空 197800，所以偏上。
- 页面在 `scene-build.ts:1047-1057` 把“内容盒”居中放到纸上，内容盒底部因比例尺/标题块/表的带而更深，故整体偏上。
- 然后 `anchorChromeToSheet`（`src/chrome-layout.ts:323-345`）把比例尺与标题块锚到**纸**的两个底角，把表锚到左边距上方一排。只要角带不压住内容就锚（行 336）。探针中角带清空，所以锚在纸角。这是文档化的行为（`chrome-layout.ts:306-321`：“This is how a real sheet reads”）。
- 为什么作者只能写 1:1000：auto-fit 候选是 `[50, 100, 200, 500]`（`src/sheet.ts:142`），而 `finish` 同表（`src/finish.ts:467`，ADR 0024 决策 4 “When nothing up to A0 at 1:500 holds the drawing, `paper` and `scale` are not added”）。
- **INFERRED（手算，未跑）**：1:500 下场地 680×520 mm，可用高约 594−30−标题带−表带，约 475 mm < 520，所以 A1 在 1:500 放不下，只能 1:1000，此时场地只占纸的约 40% × 44%（340/841，260/594），其余空白，纸角的东西自然远。

**结论**：不是排版 bug，是（1）总图尺度超出自动比例表，（2）没有图框使“纸角锚定”显得有意为之。

**修法（按风险）**：
1. **零风险，不动字节**：探针作者改用较小的纸（A2 或 A3）加 1:1000。一份 A2 在 1:1000 约 420×594，和 340×260 m 的场地匹配。这不需要改代码。
2. **扩展比例表**：在 `AUTO_SCALE_DENOMINATORS` 末尾追加 1000、2000（`sheet.ts:142`，导出于 `src/index.ts:537`，`finish.ts` 也用）。**会移动**当前在 1:500 仍放不下的、且未写 `scale` 的带纸计划的 `describe().sheet`、可能还有 `W_SCALE_OVERFLOW`，所以要先跑一遍语料看谁移动；已写 `scale` 的计划不受影响。**INFERRED**：我没跑语料，不知道有几个例子会动。`describe()` 要动就需要走“iron-laws”里的程序，不能顺手做。
3. **opt-in 图框**：新增 `frame` 语句，画内框和外框；纸角锚定自然读作“图框内角”。只对用了它的计划改字节。
4. **不要做**：改变居中规则或改锚定条件。仓库 `examples/` 36 个文件中有 21 个声明 `paper`（`grep` 实测），`test/__goldens__/` 有 38 个 PNG；改它们会动全部带纸例子的 SVG 摘要，还可能经过 `W_ANNOTATION_OVERLAP`/`W_TITLE_OVERFLOW`（读 Scene 的 drafting-layer lint，`docs/agents/iron-laws.md`，“A drawing change never moves describe(), and moves lint() only through its drafting-layer rules”）移动 lint。

### 5.5 (c) 多页文档与图纸目录

- **不改 `compile()`**。照 ADR 0024 的 `finish()`（“explicit transform outside compile()”）：新增纯函数 `pack(manifest, compileFn)`，输入是一个清单（sheet id、标题、选哪个 diagram/level、比例），输出 `{ sheets: [{id, title, scene, svg}], index: rows[] }`。
- 目录：一张 sheet 0，行来自各 sheet 的 `number`/标题/比例；作为新的表类型走 `layoutSheetTables`（`sheet-tables.ts:683`），行数同样进适纸规则。
- 多页 PDF：`toPdf` 现在只吃一个 Scene。需要一个 `toPdfSet(scenes[])` 在同一 pdfkit 文档里循环 `addPage`，页大小取各自 `scene.sheet.page`（`pdf.ts:265-279` 已经按页计算）。**INFERRED**：改动小，但我没读 pdf.ts 全文，不确定是否有全局状态（字体嵌入等）。
- 逐步动画 SVG：照 D2 的 opacity 关键帧，纯字符串拼接，可在核心里做；是否值得进核心，取决于是否有人要。
- CLI：`arch pack <manifest> -o out/`；I/O 只出现在 `src/cli/`（核心铁律）。输出沿用 `levelTarget` 的命名习惯。
- 结尾指标表：来源只能是 `describe()`（面积、`schedule`），不能手输；表头取 4.1 节 2.2.1 第 7 项。**INFERRED**：容积率、绿地率、停车泊位等多数不是 ArchLang 现有事实（它只有房间面积与场地边界），需要新增事实或明确标注“作者声明”。这是最大的内容缺口，不是排版问题。

---

## 6. 放哪里

| 内容 | 位置 | 理由 |
|---|---|---|
| `route` 元素、`diagram` 语句、新 Theme 键 | 核心 `src/` | 它们改变语言与 IR；AGENTS 的“新元素一个模块”规则 |
| `pack()` 纯逻辑、目录表、`toPdfSet` | 核心 `src/`（`pack.ts`、`export/pdf.ts`） | 无新依赖；与 `finish()` 同类；需随 `src/index.ts` 公开（ADR 0031 管下游消费） |
| `arch pack`、文件写入、清单读取 | `src/cli/` | 铁律：I/O 只在 `src/cli*` |
| playground | 只消费 `diagram` 与逐步动画 | 站点是静态资源（ADR 0019），无 `main` |
| `packages/archlang-3d` | 不动 | ADR 0030 已把 3D 隔离；3D replay 我没读，不在此判断 |

**不要**把 `pack` 做成单独包：它没有 3D 那样的重依赖，且单独包会让“一份底图”的契约跨包漂移。

---

## 7. 判定表

| 对象 | 许可证 | 判定 | 理由 |
|---|---|---|---|
| D2 scenario/step/layer 语义 | MPL-2.0 | **copy idea** | 概念正合；代码是 Go，MPL 不可混入 |
| D2 多页 PDF/PPTX 遍历 | MPL-2.0 | copy idea | 面包屑与内部链接可借鉴 |
| D2 动画 SVG（opacity 关键帧） | MPL-2.0 | copy idea | 确定性、简单 |
| Typst 目录=查询 | Apache-2.0 | copy idea | 目录从声明派生 |
| Typst 不动点迭代 | Apache-2.0 | **avoid** | pack 可一遍完成 |
| Vega-Lite 图例=编码推导、共享 scale | BSD-3-Clause | copy idea | 对应 `legendEntries` 与全局调色板 |
| Vega-Lite grammar 整体 | BSD-3-Clause | avoid | 过度抽象 |
| 深度规定 2.3.1 第 7 项分析图词汇 | 公开规范 | **采用词汇** | 八图逐项对应 |
| NCS 图号三段式 | 二手 | copy idea | `title.number` 已能承载 |
| ISO 13567 | 未读 | avoid（暂） | 无原文，无需求 |

---

## 8. 未证实与风险汇总

- 未读到：GB/T 50001-2017 条文、NCS Module 2、ISO 13567 原文。
- 深度规定为地方转载 .doc，非部发原件，条款号以转载本为准。
- 探针 1:500 放不下的数值是手算，未跑 CLI。
- `AUTO_SCALE_DENOMINATORS` 追加后移动哪些例子，未跑语料。
- 新 route 对所有 lint 规则的通用遍历影响，未逐条读。
- 半透明底图在 DXF 的降级策略，未设计。
- 结尾指标表中的容积率等指标，ArchLang 目前没有对应事实。
