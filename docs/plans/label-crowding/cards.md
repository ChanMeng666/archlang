# 密集图面可读：卡片

## 0. 所有卡共用的规则

- **门禁**：本地只跑 `npm run check:quick`，改了 `docs/*.md` 再加 `npm run docs:build`。合并以 CI 绿为证据（`docs/agents/iron-laws.md`）。
- **硬规则照旧**：
  - `compile()` 纯函数、同步、确定。
  - 新增工作先向计量器记账，再分配内存，记到 `MAX_FIT_WORK` 或步数计量上。
  - 坐标在 `MODEL_RANGE_MM` 之内。
  - 新画的东西计入 `drawCost` 和 `bounds()`。
  - `--view` 什么都不量。
  - 派生位置从形状取，不从包围盒取。
- **绘图卡**：
  - 不移动语料上的 `describe()`，`lint()` 只允许 drafting 层变化（ADR 0032 §4）。
  - PR 列出 drafting lint 有变化的平面，其余部分用对调律证明不变。
  - PNG 金样变了就做像素差分，并核对差分区域的外框。
  - 不为让测试变绿而改写金样。
  - `examples/*.svg` 用 `gen:example-svgs` 重新生成。
- **见证平面**：每张卡加一个公开夹具 `test/fixtures/dense-office.arch`（由 AL6 加入）。它复刻 11 个房间、`dims auto all` 的办公平面，PR 里附修复前后的局部截图。
- **状态取值**：`todo`、`blocked`、`folded`、`withdrawn`。卡合并后删除，在 `handoff.md` 记一行。
- **估时**：AI 日，±50%。

### AL6b · AL6 的测试加固 — `todo` · 0.5 日 · opus
AL6（#957）第二轮红队的三条测试缺口，只改测试，不改 `src/`。

- **N-1**：`test/label-fit.test.ts` 的 `ORDER_EXCUSED` 只对 `"agrees"` 断言两种房间顺序的结果相等；`"differs"` 的条目什么都不断言。给 `"differs"` 加上"不相等"的断言，否则一个已经不再依赖顺序的平面仍被名单放过。
- **N-2**：`dim-chain`、`dim-diameter` 两种主体和"无名房间"的主体（`room-label` 的 `text` 取面积数字）没有测试，语料里也没有例子。`src/lint/rules/annotations.ts` 的 `FIGURE_KIND` 即使两行写反，测试也全绿。为每种主体各写一个最小平面，断言 `overprint.subject.kind` 和 `text`。
- **N-3**：`test/label-wrap.test.ts` 里 `expect(t.knockOns).toBe(t.knocked!.length)` 是同义反复：两个计数在同一处一起加一。删掉它，或改成一个能失败的断言（例如与独立数出的 knock-on 数比较）。
- **变化面**：只有测试。两份所有者批准的名单（`ORDER_EXCUSED` 和 label-wrap 的 knock-on 名单）只能缩小。
- **发布**：不发布（只改测试）。

### AL1 · 指北针避开尺寸链 — `todo` · 1.5 日 · opus
现在 `src/backends/svg.ts:370–391` 和 `src/export/pdf.ts:387–403` 各自算一遍位置：`cx = b.maxX − r`，`cy = b.minY − margin·0.55`，不看任何尺寸。

- 在 `src/chrome-layout.ts` 加一个共用的 `northArrowBox(...)`（照 `titleBlockMetrics` 的写法），结果放在可选字段 `ChromeLayout.north` 里，两个后端都从它取位置。
- 按顺序取第一个空位（协调方 2026-11-18 裁定，方案 C）：
  1. 原位置的框不碰 `dims`/`axes` 节点时留在原位，这类平面字节不变；
  2. 否则放进页面右上角的方块：`x > b.maxX + reach.right`、`y < b.minY − reach.top`。尺寸链止于建筑转角，这里不会有尺寸链；
  3. 角上的方块放不下时，放到右侧尺寸带以外那一条的顶端；
  4. 再放不下，放到顶部尺寸带以上那一条的右端；
  5. 都放不下时，没有图纸的平面把上边距和右边距加大到刚好能放进角上的方块；图纸模式留在原位置。
- 2–4 还要避开已画的其他节点、比例尺和图签，并在页面之内。量过：语料 33 个需要移动的页面里，角上方块放不下的有 10 页（见证夹具在内），这正是 3、4 两步的用处。回退一步在语料上从不触发。
- **不要**加大图纸模式的任何边距。那样页面会超出图纸，而 `describe().sheet.fits` 仍报为真（`sheet.ts:235–237` 警告过这个问题）。
- 用一条语料不变式测试钉住"指北针框与尺寸、轴线不相交"，不加 lint 码。
- **变化面**：示例首页 22 页的 SVG 和 PNG 金样会变（多层平面另量），`describe()`/`lint()` 不变。
- **发布**：`ChromeLayout.north` 经公开的 `Scene.chrome` 可读到，所以算 minor；如果字段不公开，算 patch。

### AL5 · 墙厚数字避开房间文字 — `todo` · 2 日 · opus
`thicknessStation`（`scene-build.ts:524–613`）在房间名定位之前就运行，看不到房间文字。之后 `relocateLabels` 按名字加面积的合框判断，而 lint 把每段文字单独、转向后再判断，两者的判断不一致。

- `fitLabels` 之后，对每个按规则自己的谓词与最终标签框相撞的墙厚数字，重新选位：把标签框加进障碍物，重跑各级候选位；还不行就换同厚度次长的墙段，再换另一侧。
- `autoDimensions(ir, sizes, registry, labelBoxes?)` 增加一个参数。lint 把它从 Scene 读到的标签框传进去（`annotations.ts:175–186`），这样画图和 lint 由同一个纯函数决定。
- **补充（下游应用的请求，2026-11-18）**：所有候选位都避不开时，不画这个墙厚数字，并由一条 drafting 层 lint 指出哪一个没画。用 `new-lint-rule` 技能加。示例必须保持零警告；语料里墙厚数字的报告现在是 0 条，这条 lint 在语料上预计不报，要量过再说。
- **变化面**：语料里没有墙厚数字的报告，预计语料零变化，用计数器证明；只有见证夹具变化。要守住 `test/dim-thickness-callout.test.ts` 和 `test/annotation-collisions.test.ts`（墙厚数字避开楼梯）。
- 同时完成 PS2.39 中"墙厚数字压房间文字"这一部分。
- **发布**：patch。`autoDimensions` 不从 `src/index.ts` 导出。

### AL4 · 比家具宽的家具文字 — `todo` · 1.5 日 · opus
只有没进目录的家具词会画文字：一个矩形加居中的 `furnFont` 文字（`src/elements/furniture.ts:620–653`），不检查放不放得下。

- 放不下时先转到长边；还放不下就不画文字（AL-D2 的建议默认）。图元数量不变，墨迹不超出 `bounds()`。
- 家具文字在 `fitLabels` 里和规则里都算障碍，三处判断从此一致。规则加入 `furniture-label` 作为可被压住的对象。
- 转向的文字不能引入左右手性，`mirror` 时的处理要写明（`test/glyph-chirality.test.ts`）。
- **变化面**：画文字这部分不改语料任何字节。障碍改动可能挪动那 18 个写了家具文字的文件里的标签位置和 drafting lint，要先量，不能直接声称为零。要守住 `test/label-fit.test.ts` 和 `test/fixture-byte-identity.test.ts`。
- **发布**：patch。

### AL3 · 小房间标签用引出线 — `todo` · 4 日 · opus · 需 ADR
在 `fitLabels` 之后加一个后处理，只处理 `fitLabels` 处理完仍然相撞的标签组。

- 把名字和面积放到相邻房间或最近空地上的一个空格点，按格点排名，并画一条引出线（可带一个点）指向房间自己的锚点（`roomLabelAnchor`/`polygonLabelPoint`，从形状取）。
- 障碍物：`relocateLabels` 用的全部，加上已放好的标签、开口编号标签和家具文字（依赖 AL4）。
- 工作量与 `MAX_FIT_WORK` 共用一个上限。房间的 `drawCost` 从 3（有地面时 4）提到新的上限，重新生成工作量表（`npx tsx test/work-counts-gen.ts "<why>"`）。
- 规则认定带引出线的标签已解决：按它实际所在的地面检查，不再报"跑出房间"。
- 改写 `W_ANNOTATION_OVERLAP` 的原因与修复文字（`src/error-catalog/drafting.ts:126–131`，用 `gen:*` 重新生成）。
- 写 ADR（AL-D3）。默认开启，不加语法；要加 `[语法]` 开关，就得等 PS7.9，并附字节恒等律。
- 让 `relocateLabels` 与房间的书写顺序无关。它现在按元素顺序逐组处理，已知结果随顺序变化的平面：`test/fixtures/chain30.arch`、`star30.arch`、`dense-office.arch`，以及 `test/plans/plan-soundness/audits/first-contact-plans/` 下的 `2026-10-24-rerun/2-house.arch` 和 `2026-10-26-walls-first/6-clinic.arch`。本卡合并时，两份所有者批准的名单（`test/label-fit.test.ts` 的 `ORDER_EXCUSED`、`test/label-wrap.test.ts` 的 knock-on 名单）都必须缩小。
- **变化面**：7 个"放不下"的语料文件（`test/fixtures/chain30.arch`、`star30.arch`，以及 5 个首次接触审计平面）的 SVG 和 drafting lint 会变，预计约 70 条报告消失。示例不变。要守住 `test/label-fit.test.ts`、`test/annotation-small-rooms.test.ts`、`test/annotation-collisions.test.ts`、`test/opening-tags-corpus.test.ts`（其 `ALLOWED` 只能缩小）和工作量表。
- 同时部分回应 N.3、L.2。
- **发布**：minor。

### AL2a · 尺寸数字放不下时外推或滑开 — `todo` · 3 日 · opus
- 尺寸链首、尾段的数字，如果宽度加两倍 `DIM_TEXT_GAP` 超过跨度，就写到链端站点之外的延长线上（把 `outsideStations` 推广到尺寸链）。
- 中间段的数字沿尺寸线滑到不压别的尺寸界线的最宽空段里，复用 `scene-build.ts:620–637` 的 `widestFreeRun`。
- 尺寸带的深度（`DIM_BAND_FONTS`）不能变：它影响图纸是否放得下，也就是 `describe().sheet`。所以不能加第二排错开，也不能抬高一排。
- `autoDimensions()` 必须算出同样的新位置。
- **变化面**：约 40 个尺寸链数字所在的示例页，SVG 和 PNG 会变。要守住 `test/dim-stagger.test.ts` 和 `test/stepped-facade-dims.test.ts`。`describe()`/`lint()` 不变。
- **发布**：patch。

### AL2b · 尺寸文字底色遮罩 — `blocked`（AL-D1）· 2 日 · opus
相当于 DIMTFILL：SVG 用 `paint-order`，PDF 先描边再填充，DXF 在尺寸样式上设 DIMTFILL。不增加图元，所以 `drawCost` 不变。代价是所有带 `dims auto` 的页面都会变。

### AL2c · 尺寸数字仍然相撞时报警 — `todo`（在 AL2a 之后）· 1.5 日 · opus
新增 drafting 层码（暂名 `W_DIM_TEXT_CROWDED`），用 `new-lint-rule` 技能加。`dims auto` 的尺寸链现在没有源码 span（`ir.autoDims` 只是一个字符串，`src/ir/types.ts:941`），要先给它记一个 span。要确认示例仍然零警告。**发布**：minor。

### AL7 · 第二行 `dims auto` 静默覆盖第一行 — `todo` · 0.5 日 · opus
一个平面写两行 `dims auto`（如先 `all` 后 `rooms`），后一行静默生效，前一行被丢掉，没有任何诊断（1.64 上核实过：`validate --json` 只报与此无关的码）。`parseDimsSetting`（`src/parser.ts`）每次直接覆盖 `plan.autoDims`。

- 做成解析阶段的目录化警告，不做 lint 规则，也不用 `E_DUP_CLAUSE`：
  - 不做 lint：第一行在解析后就没了，`plan.autoDims` 只是一个字符串，lint 只看解析结果，看不到重复。只有解析器同时看到两行。
  - 不报错：报 `E_*` 会让今天能编译的平面编译失败，等于破坏性变化。警告保持"后者生效"的行为不变，图和 `describe()` 一字不动。
  - 先例：`W_DUP_ACC_METADATA`（`warnDupAcc`，`src/parser.ts`）对重复的 `accTitle`/`accDescr` 就是这样做的：后者生效，在第二行上报警告。照它写，码名暂定 `W_DUP_SETTING` 或更窄的 `W_DUP_DIMS`，在目录（`src/error-catalog/language.ts`）登记，用 `gen:*` 重新生成文档。
- span 指向第二行，related span 指向第一行（同 `E_DUP_CLAUSE`）。
- **变化面**：只有写了两行 `dims auto` 的平面的 `compile().diagnostics` 会多一条警告；`lint()` 不变，解析阶段的警告不进 `lint()`（`W_DUP_ACC_METADATA` 也是这样，2026-11-18 核实）。要先在语料上数出有几个这样的平面（预计 0）。示例必须保持零警告。
- **发布**：minor（新码）。

### AL8 · 规格书写明 `dims auto` 每种模式画什么 — `todo` · 0.5 日 · opus
`spec.llm.md` 第 55 行 `# OPTIONAL: overall|rooms|walls|all` 只列模式名，不说各画什么。尤其 `rooms` 不画总尺寸链，所以外轮廓的总长总宽在图上从不出现，作者以为选了 `rooms` 就够了。

- 改那一行注释，写明每种模式画哪几条链，并点出 `rooms` 没有总尺寸。
- `spec.llm.md` 有铁律上限：渲染结果少于 30,000 个 UTF-16 码元（`test/llm-spec-drift.test.ts`，不是按字节量）。2026-11-18 的 `main` 上是 29,665 码元（`wc -c` 量出 29,968 字节，多出的是多字节字符），余量约 335。新字要用同一文件里可证明重复的内容换出来（`docs/agents/gotchas.md` 的 spec 删减规则：删之前 grep 确认同一事实仍在文件里），换不出来就等 PS7.9。动手前在合并后的树上重量一次。
- `gen:spec`、`gen:llms`、`gen:cli` 按顺序重新生成。
- **发布**：patch（只改文档）。
