# Playground 极简化：一个舞台，一处入口

所有者的要求（2026-11-07）：让 playground 更极简、更优雅、更顺手，删掉重复和冗余；3D 区要大，
要让人一眼看出能转动。定位：绝大多数访客不学 ArchLang，代码由他们自己的 AI 写；playground 的
任务是用画面和手感说服人去用。原则："如非必须，勿增实体"。

本页是计划，不是实现。实现按 §5 的卡片逐张开 PR。

## 1. 现状（2026-11-07 实测，1422×676 视口，Furnished Flat）

- **3D 画布 402×226 px，占视口 9%。** 原因：画布固定 16:9（960×540），宽度被
  `(100cqh - 13.5rem) * 16 / 9` 限住（`playground/src/styles/panels.css:1553`）；13.5rem 被
  画布上下的八行常驻内容吃掉：PS-D12 说明句、Replay+进度条、7 个视角按钮、操作提示、
  Download GLB、GLB 说明加命令行、限制说明。画布 `cursor: auto`，静止在终帧，看不出能拖。
- **同一件事有两处或三处入口：**

  | 功能 | 入口 |
  |---|---|
  | 换方案 | 顶栏下拉 `#examples` · 底部缩略图条 `#strip` |
  | 平面 / 3D | 输出栏 tab（Preview、3D preview）· 舞台开关（Plan、3D）· Tools → Panels → 3D preview |
  | 下载 / 复制 | Tools → Download · 舞台工具条 SVG、PNG · 3D 区 Download GLB |
  | 问题列表 | 顶栏 Checks · Lint tab · 手机端 Problems |
  | 交给 AI | Tools → Ask AI（Claude、ChatGPT）· Tools → Copy for LLM · Make your own 对话框里的入口 |
  | 方案数字 | 平面下方的事实行 · 3D 画布上的事实浮层 · Describe tab |
  | 状态 | 一直显示的 `● READY` 行 |

- **介绍条**（h1 加 lede）在顶栏下多占一行，lede 被截断；它是给爬虫的静态字节（`docs/seo.md`
  第 37 行，`scripts/smoke.mjs` 会检查 `<h1` 和 lede 原文）。

## 2. 目标布局（浏览模式，桌面）

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▲ ArchLang Playground   [▦ Furnished Flat ▾]        Source  Share  ⋯  [Make your own] │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌Plan│3D┐                                       [Checks][Paths] [− + ⤢ ⛶]  │
│                                                                             │
│                    舞台：平面图或 3D，铺满整块区域                          │
│                    （3D：首次进入自动播放绘制回放，播完缓慢转盘旋转）       │
│                                                                             │
│                         ✋ 拖动旋转 · 滚轮缩放（首次出现，交互后消失）     │
│ 7 rooms · 83.64 m² · 6 doors        Floor plans as code. Your AI writes it. │
└─────────────────────────────────────────────────────────────────────────────┘
```

顶栏五个控件，舞台上只有一个视图开关和一组浮动工具，底部只有一行字。没有 tab 栏、状态行、
介绍条和缩略图条。

## 3. 决定（PG-D）

- **PG-D1 · 每个功能只有一个入口。** §1 那张表里每一行最后只剩一个入口，见 PG-D2…D7。
- **PG-D2 · 方案选择：一个画廊按钮，替代下拉和缩略图条。**
  - 顶栏的 `[▦ 方案名 ▾]` 打开一个弹出画廊：按组分区的缩略图网格（沿用 `/examples/thumbs/*.svg`），
    名称干净，括号里的特性词（"for loop"、"knobs"）改成小号灰字标签。
  - 每个条目都是指向静态页的真实 `<a href>`，在服务端 HTML 里就有（`gen-static.mjs` 预渲染），
    所以缩略图条承担的爬虫链接迁到这里，一条不丢；有脚本时就在本页打开方案。
  - 键盘：方向键在网格里移动，输入字符过滤，Esc 关闭。缩略图在弹层第一次打开时才加载，
    不进启动预算（`e2e/startup-chunks.baseline.json`）。
  - 删掉 `#strip` 和 `strip.ts`；原生 `<select>` 也删掉。
- **PG-D3 · 视图切换：浏览模式只有 Plan | 3D。**
  - 浏览模式不显示输出 tab 栏，也不显示 `● READY` 行。状态只在出错或编译中出现：Source 按钮上
    一个小点，加一条可关闭的提示。
  - 编辑模式的输出窗格只有一排：`Plan · 3D · Facts · Checks`。
    - Facts = Describe + Takeoff（同一份 `describe()` 数据，表格分两节）。
    - Checks = Lint + Intent + Repair / Suggest；顶栏的 Checks 按钮改成舞台上的图层开关（与 Paths
      并列），只负责在图上画圈。
    - 手机端 Code / Plan / Problems 不变，Problems 指向 Checks。
  - Tools → Panels 整组删除。
- **PG-D4 · 3D 是舞台，不是一张卡片。**
  - **铺满**：画布填满舞台，宽高都跟容器走（`ResizeObserver` 加 `devicePixelRatio`），去掉
    固定 16:9。目标：1422×676 视口下画布至少占视口 60%（现在 9%）。
  - **一眼看出能动**：
    1. 首次切到 3D（每个会话一次）自动播放绘制回放（约 6 s），播完进入缓慢转盘旋转；第一次指针
       或按键交互后永久停止转盘。`prefers-reduced-motion` 时直接显示终帧，不转。（这条改了卡片
       X1 的"打开即终帧"，只改首次进入。）
    2. 画布 `cursor: grab`，拖动时 `grabbing`。
    3. 一个一次性的操作提示浮层（手势图标 + "拖动旋转 · 滚轮缩放 · 右键平移"），第一次交互或
       5 s 后淡出，`localStorage` 记住已看过（读写包在 try/catch 里）。完整按键说明留在
       `aria-describedby`，不占版面。
  - **控件全部浮在画布上，空闲时变淡**：
    - 左下：▶ Replay 一个按钮；进度条改成贴着画布底边的细线，悬停或聚焦时才可拖。
    - 右上：⟲ 复位，加一个 `视角 ▾` 弹出（Iso、Top、N、E、S、W）。
    - 楼层开关浮在左上 Plan | 3D 的下面，平面和 3D 共用同一个。
  - **说明文字收起**：PS-D12 句只保留粗体首句"Same source, plan and 3D preview."，作为左下小字
    说明，后面跟一个 ⓘ；ⓘ 打开一个小卡片，放完整句、限制句和"What it shows"链接。画布上的事实浮层
    删掉，统一用底部那一行（PG-D6）。
  - **GLB 进导出菜单**（PG-D5），校验说明和 `npx` 命令作为菜单里这一项的副文本。
- **PG-D5 · 导出、分享各一个菜单。**
  - 顶栏 **Share ▾**：Copy short link、Copy full link（ADR 0034 的那句说明原样保留在两个按钮旁边）、
    Embed，以及一个"Export"分节：SVG · PNG · PDF · DXF · TXT · GLB；第一次点击才加载 jsPDF 和
    GLB 写入器。
  - 舞台工具条上的 SVG、PNG 复制按钮删掉。
  - **"交给 AI"只在 Make your own 里**：Ask AI 和 Copy for LLM 合进那个对话框（它已经从
    `site-shared/doors.json` 读入口），Tools 里不再重复。
  - 剩下的放进 **⋯**：渲染主题、a11y 开关、Format / Finish / Saved（只在编辑模式可用）、以及
    文档、GitHub、npm、ArchCanvas 等链接。
- **PG-D6 · 一行事实，一行介绍。**
  - h1 就是顶栏里的品牌文字"ArchLang Playground"（看得见，是真文本），介绍条整行删掉。
  - lede 缩成 PS-D1 的标准句，放在舞台底部那一行的右侧，小号灰字，可见、可爬：
    "Floor plans as code. Your AI writes ArchLang; the compiler draws a precise, dimensioned plan."
    同时更新 `scripts/smoke.mjs` 里检查的 lede 原文和 `docs/seo.md` 第 37 行。`<noscript>` 段落
    不动（有 JS 时本来就不显示）。
  - 底部左侧是事实行（`N lines → rooms · m²`），平面和 3D 共用。
- **PG-D7 · 不变的东西。** 只有浅色主题；token 两站一致；URL 契约（`#z=`、`#src=`、`&edit`、
  `&3d`、`/s/<id>`、`/embed.html`、`/examples/*`）；首帧平面图预渲染进 HTML；启动 JS ≤ 60 KB gzip，
  启动 chunk 里没有 three.js 和 CodeMirror；3D 措辞禁令（不说 model、render、BIM……）；
  `#z=` 只有在用户点分享时才离开浏览器。

## 4. 与既有裁决的冲突（所有者 2026-11-07 批准："按计划执行"）

| 既有裁决 | 本计划 |
|---|---|
| PS-D3"原样保留：…预渲染的 h1 和 lede" | h1 移进顶栏，lede 缩成一句放到底部（PG-D6） |
| PS-D4"缩略图条切换方案" | 缩略图条并入画廊弹层（PG-D2） |
| PS-D12"3D 旁边始终显示该句和限制句" | 只常显首句，全文在 ⓘ 里（PG-D4） |
| 卡片 X1"新方案打开即终帧，不播放" | 每个会话首次进入 3D 时自动播放一次（PG-D4） |
| 顶栏 ≤ 5 个控件（`.claude/rules/sites.md`） | 仍然满足：Source、Share、⋯、Make your own，加方案按钮 |

所有者 2026-11-07 回复"按计划执行"，PG-D1…D7 即为现行裁决；`docs/plans/public-surfaces/`
的 README.md（PS-D3、PS-D4）和 3d.md（PS-D12、X1）已在原处标注被取代。

## 5. 卡片（按价值排序；每张一个 PR）

| 卡 | 内容 | 主要文件 | 要改写的测试（改写，不删） |
|---|---|---|---|
| **PG1 · 3D 舞台** | PG-D4 全部：铺满、自动回放加转盘、grab 光标、一次性提示、浮动控件、ⓘ、删画布事实浮层 | `playground/src/preview3d.ts`、`styles/panels.css`；`packages/archlang-3d` 的 `browser` 出口要加选项（`viewToolbar` 的紧凑形态、`autoRotate`、提示开关），默认行为保持不变，单文件回放 HTML 字节不动 | `e2e/preview3d.spec.ts`（新增：画布面积 ≥ 60% 视口、首次交互后转盘停、reduced-motion 下不转） |
| **PG2 · 一个视图开关** | PG-D3：浏览模式去掉 tab 栏和状态行；编辑模式四个 tab；Checks 变图层开关；删掉 Tools → Panels | `index.html`、`main.ts`、`edit-mode.ts`、`checks-panel.ts`、`describe-panel.ts`、`takeoff-panel.ts`、`lint-panel.ts`、`intent-panel.ts` | `panels.spec.ts`、`checks.spec.ts`、`takeoff.spec.ts`、`layout.spec.ts` |
| **PG3 · 画廊** | PG-D2：弹出画廊替代下拉和缩略图条，爬虫链接一条不丢 | `index.html`、`scripts/gen-static.mjs`、`strip.ts`→`gallery.ts`、`examples.ts` | `strip.spec.ts`→`gallery.spec.ts`、`examples-static.spec.ts`、`front-door.spec.ts`、`test/playground-examples-rows.test.ts` |
| **PG4 · 菜单与顶栏** | PG-D5 和 PG-D6：Share、⋯、Make your own 吸收 Ask AI；h1 入顶栏；lede 入底行 | `index.html`、`shell.ts`、`make-own.ts`、`share.ts`、`styles/chrome.css`、`scripts/smoke.mjs`、`docs/seo.md` | `boot.spec.ts`（`@prod` 的 h1/lede 用例）、`actions.spec.ts`、`make-own.spec.ts`、`short-link.spec.ts` |
| **PG5 · 收尾** | Plan ↔ 3D 交叉淡入（reduced-motion 时不做）；手机端检查；README 的 Features 节重写。PG2 审查遗留：① 手机编辑模式下 Code / Plan / Problems 与四个 tab 并存，出现两个"Plan"、两条进 Checks 的路；② `#statusText` 在输出窗格里，手机 Code 视图下这个 live region 是 `display:none`，不会播报；③ 360 px 时楼层开关可能压住换行后的舞台工具条；④ 3D 里 L1/L2/L3 开关和包自带的"Storeys shown"剖切控件并排；⑤ `docs/whats-new.md:47`（"Takeoff tab"）和 `docs/analysis.md:300`（"Describe tab"）还用旧 tab 名；⑥ 启动失败后 `data-booting` 永不移除。PG4 审查遗留：⑦ ≤ 900 px 时舞台工具条按钮宽 34 px，CSS 注释却承诺 44 px；`layout.spec` 的触控尺寸检查漏了 `<summary>` 触发器（Share、⋯、画廊）；⑧ Share 和 ⋯ 菜单在焦点 Tab 移出时不关闭，画廊与 Share 互相关闭也没有测试；⑨ "Share ▾" 的可访问名称里带着 ▾ | `styles/*.css`、`mobile-views.ts`、`playground/README.md` | `layout.spec.ts` 的手机用例 |

PG1 最先做：它是所有者最在意的一点，也和其他卡最少重叠。PG2 和 PG3 都改 `index.html` 的舞台，
要按顺序做，不并行。

**进度（2026-11-07）**：

- **已完成**：PG1（#549）、PG2（#550）、PG3（#551）、PG4（#552）、PG5b（收尾的 ①–⑨、交叉淡入、
  README，即本卡的 PR）。④ 去掉包的剖切控件后，3D 里的楼层开关多一个 "All"（合并视图，事实行改报
  全部楼层）；平面图只画一层，没有 "All"，回到平面时停在上次选的楼层。
- **PG5a**（启动预算与 chunk 基线）是 PR #553，等所有者批准：它改钉住的基线，风险等级为 high。
- **"3D 构图再收紧"不做了**：现在的取景在约束轴上已占画布高度约 88 %，左右的空白来自画布的宽
  长比，取景再近只会裁掉建筑。

**每张卡的本地门**：`npm run check:quick`（改了 docs 再加 `npm run docs:build`）；e2e 和全量测试只在
CI 跑。**证明方式**：PR 描述附 1422×676 和 390×844 两张截图，以及 PG1 的画布面积数字。
**风险等级**：用 `scripts/risk-tier.mjs` 定；`packages/archlang-3d` 的改动按包的发布规则走。

## 6. 不做的事

- 不做 ViewCube 这类 3D 导航小部件（工程量大，`视角 ▾` 已经够用）。
- 不改编辑器本身和自动补全。
- 不加新的示例，不改任何示例的字节（摘要不动）。
- 不加分析埋点，不加 UTM。
