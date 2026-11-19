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

- **N-1**：~~`ORDER_EXCUSED` 的 `"differs"` 条目什么都不断言~~。AL3a（#964）删掉了这份名单：五个平面现在都断言与书写顺序无关，此项随之作废。
- **N-2**：`dim-chain`、`dim-diameter` 两种主体和"无名房间"的主体（`room-label` 的 `text` 取面积数字）没有测试，语料里也没有例子。`src/lint/rules/annotations.ts` 的 `FIGURE_KIND` 即使两行写反，测试也全绿。为每种主体各写一个最小平面，断言 `overprint.subject.kind` 和 `text`。
- **N-3**：`test/label-wrap.test.ts` 里 `expect(t.knockOns).toBe(t.knocked!.length)` 是同义反复：两个计数在同一处一起加一。删掉它，或改成一个能失败的断言（例如与独立数出的 knock-on 数比较）。
- **变化面**：只有测试。label-wrap 的 knock-on 名单（所有者批准）只能缩小。
- **发布**：不发布（只改测试）。

### AL5b · AL5 的后续 — `todo` · 1 日 · opus
AL5（#959）第二轮红队留下的三项。

- **S1 计数不一致**：重新选位用的是 `fitWork` 里 `fitLabels` 剩下的部分（单层 8M），`W_ANNOTATION_OVERLAP` 有自己的 1M 计数（`MAX_ANNOTATION_WORK`，`annotations.ts` 中 `pairs > MAX_ANNOTATION_WORK` 处）。很大的单层平面上（例：1 层、1200 种墙厚 → 501 个不画并报告，699 个留在标签上），重新选位用完计数后留下的数字，lint 因自身计数超限整层跳过而不报。做法二选一：给 `DrawnAutoDims` 加一个"计数用完"标记，并由 lint 记一条跳过；或者让两个计数对齐。
- **S2 备份副本无测试**：`src/scene-memo.ts` 的 `copyScene` 把布局复制到 memo 副本上（`carryDrawnAutoDims`），但没有测试覆盖；`annotations.ts` 的 `drawnStorey` 在拿不到布局时静默回退到 `autoDimensions`。加一个测试：数字被挪动的平面，经 playground 的路径（先 lint 请求，再 `compile` 提供 Scene，再 lint 命中 memo），断言 lint 读到的是挪动后的布局；考虑把回退改成显式。
- **细节**：没被挪动的数字压在开口编号、门扇扫过的范围或另一个尺寸数字上时，没有规则报告，和 main 一样。决定是否扩展 `W_ANNOTATION_OVERLAP` 去量这些。
- **变化面**：S1 若加跳过记录，会改变超大平面的 lint 覆盖说明；S2 只加测试；细节项若扩展规则，会改变 drafting lint，需量语料。
- **发布**：S1/细节按实际改动定；S2 不发布。

### AL3c · 房间名压在另一个房间的名字上时报告 — `todo`（在 AL3b 之后）· 1 日 · opus
- `W_ANNOTATION_OVERLAP` 不报房间名压在另一个房间名上（#964 第一轮红队：AL3a 的旧版本因此新增了两标签相压，规则的条数与消息都不变）。把另一个房间的标签作为可被压住的对象（overprint `over` 的种类用 `room-label`）。同样不报的还有：家具互相叠放时家具文字压在家具文字上（#961 记在旧 AL3 卡上）。
- 另一项，来自 AL3w（#962）第一轮红队 N3：`dims auto` 数字与房间标签之间的判断仍按估算宽度读房间文字（`src/lint/rules/annotations.ts` 中 `over(nb.text, [l.text.rect], l.text.box)`，`src/scene-build.ts` 中 `restationThickness` 的 `textBox(prim)`）。像 "WC" 这样墨迹宽于估算宽度的名字，被数字压住时可能漏报、漏挪（`relocateLabels` 读已放好的标签时已经用 `symbolExtent`）。本卡一并决定这两处是否也改用 `symbolExtent`（画图和 lint 同时改，并量语料）。
- **变化面**：先在合并了 AL3b 的 `main` 上量。示例必须保持零警告。
- **发布**：minor（行为变化，无新码）。

### AL3d · `fitLabels` 宁要贴墙余量的小字号 — `blocked`（协调方定取舍）· 1 日 · opus
`fitLabels` 在"缩小一号但离墙有余量"（tier 0）与"原字号放得下但贴墙"（tier 1）之间选前者。例：#962 第二轮红队模糊测试的样例 475，"MASTER BEDROOM" 175 → 150（没有钉成测试）；同类还有样例 358。（样例 1808 不是这一类：那里是 fit 把放不下的标签留在原字号。）这是取舍问题，不是错误；改之前先在语料与模糊测试上量两种排序各自的结果，由协调方定。**发布**：按实际改动定。

### AL3e · 被挤出自己地面的标签仍占着地面，邻居因此缩小 — `todo` · 1.5 日 · opus
- **问题**：`relocateLabels` 把它放好的每个标签都当作后面标签的障碍，包括站在自己地面之外、`fitLabels` 之后会缩小或换行的标签。它原字号的框能伸到邻室，邻室只好离开本来放得下的锚点，再被缩小。例：#962 第二轮红队模糊测试的样例 352："NEWSROOM" 比房间宽，隔壁 "GYM" 画成 300（4075, 1015），而不是锚点上的 350（4075, 1005）。`test/label-fit.test.ts` 把现状钉成测试，以本卡命名。
- **试过并排除（AL3a，#964）**："让出地面"，即 fit 会重画的出地面标签不占地方。被让出的标签互相压在一起（红队的 `over.mts`：带让出时，base 干净的平面中新增相压的，条带 seed 11 / 网格 seed 13 为 1 / 3，不让出为 0 / 0；`star30` 新增相压）。裁定：两标签相压比 GYM 小一号更糟。
- **方向**：让重定位按 fit 将要画的大小看这个标签（在占位之前先跑 fit 的字号与换行选择，或按 fit 可能选的最小形式占位），占的既不是原字号的框，也不是什么都不占。
- **所有者批准的名单**：`test/label-wrap.test.ts` 的 knock-on 名单（所有者 2026-11-18 批准，只能缩小）原定在 AL3 合并时缩小；AL3a 撤回了"让出地面"，名单仍是 4 个名字。缩小它的义务由本卡承担，AL3b 不得让它变长。
- **验收**：样例 352 的 GYM 在锚点上是 350；knock-on 名单缩小；base 干净而新增相压的平面数不增加；语料字节恒等律，每个变化的行都用对调律证明。
- **发布**：patch。

### AL3f · 墙厚数字的选位与书写顺序无关 — `todo` · 1 日 · opus
- **问题**：AL3a 让两个标签处理步骤在给定输入时与书写顺序无关，但 `walls from rooms` 加 `dims auto` 的平面仍随顺序变化：墙厚数字（`src/scene-build.ts` 的选位）在两个标签步骤之前、按派生墙的顺序选位，而派生墙的顺序跟着房间的书写顺序。例：三个空房间倒过来写，标签相同，"100" 分别在 x=4407.5 和 x=8407.5（base 和 head 都如此）。#964 第一轮红队的房间打乱测试：`dims auto` + `walls from rooms` 有 96/391 个平面的标签随顺序变化，其他组合为 0。
- **做法**：墙厚选位的处理顺序从平面上读（按墙段几何，如站点中点的 y、再 x，最后墙 id），同 AL3a 对标签的做法。
- **字节恒等律**：不同时写 `walls from rooms` 与 `dims auto` 的平面逐字节不变（SVG + `describe()` + `lint()` + 诊断）；两者都写的平面重量。钉住：红队的打乱样例两种顺序画得相同。本卡合并时删掉 `src/label-fit.ts` 与 `src/label-placement.ts` 文件头里为这一残余写的限定语；CHANGELOG 里 AL3a 那一条若已发布就不改，在新条目里说明。
- **发布**：patch。

### AL3g · 对称角之间的平局由舍入误差决定 — `blocked`（协调方定）· 0.5 日 · opus
`relocateLabels` 在两个对称位置之间的平局，由约 1e-13 的浮点误差决定（#962：一个对称小屋的内联快照里，名字从一个下角翻到另一个，300 → 2700）。做法：比较加容差，再用稳定的键打破平局。同类（#964 第二轮红队 M1）：`walls from rooms`、不写 `dims auto` 的对称平面上，`wallBands`（`src/label-placement.ts`）按派生墙的顺序列出墙带，`BoxSums.sum` 按下标顺序相加，两个镜像位置在精确算术里打平，由一步舍入决定（样例 twin4：WC 在 x=1883.7 或 1014.3，24 种房间顺序里 16 比 8）。1,500 个对称平面中 3 个。做法：墙带按规范顺序相加，或比较前先取整。会挪动摘要，所以要量语料，并逐行对调证明。**发布**：patch。

### AL3h · AL3a 的后续（测试与次要顺序） — `todo` · 1 日 · opus
#964 第二轮红队留下的项：

- `fitLabels` 的 `placeOrder`（`src/label-fit.ts`）只比较精确的 y、x、名字和面积，没有 `plotOrder` 的网格、字号与轮廓键。两个交叉、锚点名字面积都相同的房间，588 对里 46 对随顺序变化（要互相重叠的房间才出现）。
- 钉住的测试不钉平局键：删掉 sizes + ring + fixed、删掉"房间在地面之前"、或删掉 texts + "房间在地面之前"的变体，六个钉子都照样通过；oracle 从 `src` 导入 `plotOrder`，也抓不到。为每个键加一个只有它能分开的样例。
- `W_ANNOTATION_OVERLAP` 的消息按书写顺序列出门两侧的房间（"between Bedroom and WC" 与 "between WC and Bedroom"），图不变时 lint 文字也可能随顺序变。`main` 上早已如此。
- 已在 `main` 上出现、归 AL3e 一类：样例 hw-natural 的 "Hauswirtschaftsraum" 留在原字号 350，压过邻室名字 32%。
- **发布**：测试项不发布；消息顺序若改，属 drafting lint 变化，patch。

### AL3i · 引出与 fit 的计数按楼层数平分 — `todo` · 1 日 · opus
AL3b（#969）第一轮红队 M2 的余项。`leaderWork` 和 `fitWork` 都把整个平面的计数除以 `_storeyCount`，所以同一层在 1、2、4 层的平面里放 5 个标签，8 层时放 4 个，16 层时放 3 个：标签位置不只取决于这一层。做法：每层一个固定计数，整个平面的上限经每层元素上限保证；或者证明在语料内除法改变不了任何放置。钉住：同一层单独画与放在三层平面里画结果相同。**发布**：patch（可能移动大平面的标签）。

### AL3j · `W_ANNOTATION_OVERLAP` 的 `leader` 分支没有测试 — `todo` · 0.5 日 · opus
`src/lint/rules/annotations.ts` 里墙厚数字或房间文字压在引出线上、在 AL6 附加信息里列为 `leader` 的分支，没有任何测试能走到（编译器本来就让引出线避开文字）。造一个能走到的平面（例如手写的标签点让文字压线），钉住报告和 `overprint.over` 里的那一项；造不出来就说明并删掉死分支。**发布**：不发布（只加测试），删分支则 patch。

### AL3k · 零面积的线看不见 — `todo` · 0.5 日 · opus
`segmentMeetsRect` 要求 `t1 > t0`，零宽或零高的标记（直线的包围盒）面积为 0，引出线能穿过它而不被看见。例：手画的 `dim` 线上压着一段 2,147 mm 的引出文字，不报；300 个网格平面里引出线穿过尺寸线 90 次。给这类标记一个最小厚度，或改用线段与线段的判断。`main` 上 fit 读线时也是这样。**发布**：patch。

### AL3l · 引出排序的平局有手性 — `todo`（需协调方定）· 0.5 日 · opus
引出的格点排序最后按 `j`、`i` 打破平局，所以镜像平面可能引到另一边（400 个镜像条带里 63 个不对称，`main` 本来就有 108 个）。没有字形参与，不违反手性律。决定是否接受（如同文字），或从形状打破镜像平局。

### AL3m · 引出步骤里没计数的工作 — `todo` · 0.5 日 · opus
`ownMarks` 里每个标签一次 `marks.filter`、`leaderClear` 里的 `drawnLines` 循环、`lead()` 里命中之后的宿主遍历，以及在任何标签触发之前就建好宿主、家具、文字三个索引，都没有先计数（或在工作之后才计）。ADR 0035 §5 说"读之前先计数"。按元素上限有界，但要先计数再分配，并在没有标签触发时跳过建索引（`classroom-block` 8.2 → 10.7 ms）。**发布**：patch。

### AL3n · DXF 里的引出点是空心圆 — `todo` · 0.5 日 · sonnet
引出线的点在 DXF 里导出为不填充的 `CIRCLE`（层 `A-ANNO-TEXT`）。改为填充的实体（实心 `HATCH` 或 donut），让 CAD 图与 SVG 一致。**发布**：patch。

### AL3o · 引出线"穿过两室之间的墙"按真实墙带判断 — `todo` · 1 日 · opus
AL3b 第二轮红队 M1。现在把每面墙读成轴对齐的盒子（`wallBands`），要求两块地面各与扩大 1 mm 的盒子重叠超过 t²。斜墙的盒子盖住墙两侧的地面；弧墙更粗；两室画到墙面时只靠 1 mm 接触，短墙（短于约 2t）就判不过，合理的引出线被拒（例：一面斜隔墙两侧、房间画在墙中线上的两室；房间画到墙面、共享墙长 1 m 的一排小室）。规则偏安全（拒绝时画法与 `main` 相同），所以 AL3b 照此合并。做法：按真实墙带（线段、厚度、方向，弧按弦）读墙，用每块地面沿墙带的共享边长判断"之间"；钉住一面斜墙、一面弧墙、一对画到墙面的短墙。**发布**：patch。

### AL3p · 绘图预算测试按视图逐种检查门 — `todo` · 0.5 日 · sonnet
AL3b 第二轮红队 M4。`test/drawing-budget.test.ts` 只在平面视图检查门，所以把没有种类词的门改计 3 时测试照样绿，而 iso 视图画 5 个。加一组差分行：每种门（无种类、`double`、每种门扇）在编译器的每种视图（平面、iso、`mirror` 两端）下画，断言画出的图元 ≤ `drawCost`；钉住无种类的门在 iso 下画 5 个，使更紧的计费在那里失败。**发布**：不发布（只加测试）。

### AL4b · AL4 的后续 — `todo` · 1 日 · opus
AL4（#961）第二轮红队留下的项：

- **S3 残余**：读家具文字仍计入 `W_ANNOTATION_OVERLAP` 的计数（`annotations.ts` 中 `work += sh.length`）。见证（第二轮红队）：约 408 个房间、带文字家具接近上限的平面，#961 之前的 `main`（`48334285`）报 140–152 条，#961 报 0 条外加一条 annotation-budget 跳过。文件头的说法与 `test/furniture-label-fit.test.ts` 的测试标题在这个边界上不成立。
- 没有测试钉住 S1 的性质：最后一步从不缩小、不取消换行、不改行数。
- `label-fit.ts` 允许再多跑出地面 2%，而注释说"不再更远"，两者不一致。
- `pieceLabelBoxes` 的准备工作没有计数（线性）。
- 墨迹模型把 Щ、Œ、— 当作 0.62 em（`text-metrics.ts`，早已如此）。
- **发布**：按实际改动定；只改测试与注释时不发布。

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
- **范围扩大（下游应用的请求，低优先，排在本卡之后）**：`spec.llm.md` 还应写明 (a) 定位短语自己的词紧跟其后、顺序固定（`against wall <id> [segment] [offset] [side]`、`anchor <a> [flush] [inset]`）；(b) 门窗的种类词能放在哪里（`door`/`window`/`id=` 之后，或 `at <pos>` 之后；不能在 `on <ref>` 与 `at` 之间）。1.64 上探过。每一句能让下游删掉一句自己的说明。同样受码元上限约束。
- `gen:spec`、`gen:llms`、`gen:cli` 按顺序重新生成。
- **发布**：patch（只改文档）。
