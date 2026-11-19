# 密集图面可读：续接点

**2026-11-18**：计划写成（#956）。所有者批准全部修复；AL-D1…D3 按 README §5 的建议默认执行，所有者可以改。

**2026-11-18**：AL6 完成（#957，合并提交 `a9db286e`）。实际交付的附加信息形状：

- `subject` 是 `{kind, room, text}`（`room` 只在适用时出现）。`kind` 取 `room-label`（房间的标签，`text` 是房间名，无名房间是面积数字），或某种尺寸数字（`dim-chain`、`dim-thickness`、`dim-radius`、`dim-diameter`）。
- `over[]` 每一项是一个被压到的东西。`room-label` 报告里，每项带 `parts`，取值 `"name"`、`"area"` 的数组，说明标签里哪段文字压在它上面；尺寸数字的报告里，`room-label` 项的 `parts` 说明数字压住了那个标签的哪段文字。
- 形状的权威定义是 `src/diagnostic-json.ts` 的 `DiagnosticOverprintJson`。
- 导出 `diagnosticOverprint`；JSON 选项是 `DiagnosticJsonOptions.overprint`。
- 所有者 2026-11-18 批准了两份只列见证平面的守卫名单：`test/label-fit.test.ts` 的 `ORDER_EXCUSED`，和 `test/label-wrap.test.ts` 的 knock-on 名单。两份都只能缩小；AL3 合并时必须缩小。
- 第二轮红队的三条测试缺口记为 AL6b。

**2026-11-18**：AL1 完成（#958，合并提交 `0c44a140`）。

**2026-11-18**：AL5 进入审阅（#959）。墙厚数字在标签定位之后，按 `W_ANNOTATION_OVERLAP` 自己的判断与最终的房间文字相撞时重新选位：同一墙段（标签框作障碍）→ 同厚度次长墙段 → 两者的另一侧（只限下面有地面的一侧，不进外墙外的尺寸带）。都不行就不画，由新的 drafting 层警告 `W_DIM_THICKNESS_UNPLACED` 指出墙和厚度。`autoDimensions(ir, sizes, registry, labelBoxes?)` 接收 lint 从 Scene 读到的标签框，画图和 lint 由同一个函数决定。语料中只有见证夹具变化（"200" 移到南墙）；见证夹具头注释改写时保持字节数不变，span 不动。第一轮红队后（同一 PR）：候选位必须避开所有已画的东西（标签、开口编号、轴号、符号、墙、门扇扫过的范围、其他尺寸数字），用同一个判断；重新选位计入 `MAX_FIT_WORK` 中 `fitLabels` 剩下的部分，用完就停，没处理的数字留在原位，`W_ANNOTATION_OVERLAP` 只在它自己的计数（`MAX_ANNOTATION_WORK`）够用时报告，超出时和以前一样不报（记一条 `annotation-budget` 跳过）；lint 读画图时留下的布局（`drawnAutoDims`），改造平面上也与画图一致。发布级别：minor（新增 `W_` 码，`.claude/commands/release-check.md`），cards.md 已改。第二轮红队留下的三项后续记为 AL5b。

**2026-11-19**：AL5 完成（#959，合并提交 `48334285`）。

**2026-11-19**：AL4 进入审阅（#961）。没进目录的家具词，文字放得下就照旧正着画（字节不变）；放不下而家具竖长、文字顺长边放得下时，转 −90°（从下往上读）；都放不下就不画（AL-D2：不缩到 `furnFont` 以下），文字仍在 `describe()` 里。文字从不镜像，`mirror` 前后画出的字相同（`test/glyph-chirality.test.ts` 钉住）。画出来的家具文字在 `fitLabels` 里成为文字障碍；`W_ANNOTATION_OVERLAP` 把它当作被压住的对象，`overprint.over` 里在家具本身那一项之后列出 `furniture-label`（`id` 是家具的，`text` 是文字）；消息不变，因为文字在家具矩形之内，压到文字必然也压到家具。AL5 的重新选位本来就把家具文字算作已画的东西，两边一致。语料：画出的家具文字 31 个、在 9 个来源里，全部正着放得下，画图部分零字节；障碍部分在语料上零变化（只有见证夹具同时有家具文字和放不下的房间名，且没有一次读到家具文字）。见证夹具换了家具：储藏间两个文件柜换成同样占地的 `shelving`（"IT Rack"）和 `cabinet`（"Supplies"），会议室加 300 mm 宽的 `screen`（"Display"），接待处加竖长的 `coat_stand`（"Coats"，转向）；前三个都不画，房间名、"200" 的位置和两条报告都不动（报告里的 `filing_cabinet_5` 变成 `shelving_5`）。`ORDER_EXCUSED` 和 knock-on 名单都没有变。第一轮红队后（同一 PR）：放不放得下按估算宽度和实际墨迹宽度中较大的一个判断；`fitLabels` 的搜索不再读家具文字（与没有家具文字时逐字节相同），只在最后一步把它重画过的、压在家具文字上的房间名挪到同一字号、各方面都不更差的格点上，从不因此缩小或改换行；规则只在文字已经压到家具时才读那件家具的文字，不占计数（300 个房间、900 件带文字家具的平面与 main 报告完全相同）；`new-families` 的 `inline:near-words` 一行把家具加宽到 850 mm（按对调律重钉），`export-dxf-blocks` 的 hammock 加大到能放下 "H"；规则还不报的三类相撞记到 AL3 卡上。

**2026-11-19**：AL3 拆成三个 PR（协调方裁定），依次合并：AL3w（宽度）→ AL3a（与书写顺序无关）→ AL3b（引出线）。AL3w 进入审阅（#962）：房间名和面积数字对符号、对家具文字，按估算宽度和墨迹宽度中较大的一个判断（`symbolExtent`），`relocateLabels`、`fitLabels` 和 `W_ANNOTATION_OVERLAP` 用同一个宽度（第一轮红队后 `relocateLabels` 也改用它，名字因此能在原字号下挪到空处，而不是被缩小）。墙、门扇、地面边缘和 `dims auto` 数字的判断不变。语料：见证夹具的 WC 1、WC 2 改成一行；`examples/laneway-house.arch` 和 `eval/goldens/anchor-furniture.arch` 的卧室名按墨迹宽度读后挤到了旁边的家具，现在以原字号移到更空的地方；`describe()`、`lint()` 不变。

**2026-11-19**：AL4 完成（#961，合并提交 `287e19f8`）。AL3w 完成（#962，合并提交 `db1acefd`）。第二轮红队后（同一 PR）：`relocateLabels` 读符号时也按较宽的宽度，所以 `test/taste-corpus/r6-bed-in-kitchen.good.arch` 的卧室名也移动；一个对称小屋的内联测试平面，名字移到另一个下角（两个角只差舍入误差）。

**2026-11-19**：AL3a 进入审阅（#964）。`relocateLabels` 按从平面读出的顺序处理标签（`plotOrder`：先 y 后 x，与 `fitLabels` 相同；坐标按微米网格比较，所以平面平移一个小数偏移画法不变；同位置时房间标签排在室外面标签前，再比字号），用 `label "…" at (x,y)` 钉住的标签在第一轮之前就占位。每个放下的标签都占着自己的位置，包括站在自己地面之外、`fitLabels` 之后会缩小的那种（红队第一轮后试过让它们让位，结果标签互相压字，协调方裁定不采用）。`ORDER_EXCUSED` 从 5 个平面减到 0（名单删除，这 5 个平面改为断言与顺序无关）；knock-on 名单仍是 4 个名字（没有缩小）。语料：没有任何 `.arch` 文件变（`chain30`、`star30`、walls-first `6-clinic` 与 `main` 字节相同）；只有测试内联的两个 `frames` 平面变：`test/tables/openings-between-plans.ts` 只变 SVG，`test/tables/wall-between-around-plans.ts` 变 SVG（四个副本里的五个标签重放）和 4 条 `W_ANNOTATION_OVERLAP` 的措辞及 `hints`（条数、代码、位置不变）。#962 第二轮红队的 S1（case352：邻居过宽的名字把 GYM 挤走、再被缩小到 300）没有修，钉成现状测试，另立卡 AL3e。画 `walls from rooms` 的平面仍可能随顺序变：`dims auto` 的墙厚数字在标签之前按自己的顺序放（卡 AL3f）；派生墙按自己的顺序累加墙带，镜像平局可能差一个舍入而落到另一边（卡 AL3g）。红队给的另一个例子 case475（"MASTER BEDROOM" 175 → 150）不是邻居的问题，是 `fitLabels` 宁要贴墙余量（tier 0）的小字号，也不要原字号的 tier 1；没有在这个 PR 里改，交给协调方裁定。这一条记为 AL3d；镜像平局由舍入决定（N2）记为 AL3g。第二轮红队的其余项记为 AL3h。

**2026-11-19**：AL3a 完成（#964，合并提交 `b1e73f98`）。第二轮红队后（同一 PR）：顺序键的网格从纳米改成微米（文档本来就写微米；离原点 10 km 的平移也不再改变画法，钉成测试），并写明 `walls from rooms` 的例外。AL4 第二轮红队的残余记为 AL4b。

**2026-11-19**：AL3b 进入审阅（#969），在 `b1e73f98` 上重建。`fitLabels` 之后，一个仍压在符号、墙、门扇或家具文字上（或出了自己地面）的未钉住房间标签，在以房间锚点为中心的格点上再放一次：自己地面（不画引出线）和同层别的房间地面的格点按同一个键一起排名，字号从大到小，第一个 tier 0 的位置就停（走廊只在两个距离都相同时优先），从不放到建筑外；放到别的房间时画一条细线，以房间自己地面上的一个点结束（ADR 0035，接受）。红队的覆盖模糊测试发现，被引出的标签会压到别的房间的字（plain-strip 11 第 68 个平面："2.2 m²" 压在 "MW" 上；见证平面里 Store 的面积数字压在 Kitchenette 的名字上），原因是 `read()` 拿候选文字的墨迹宽度去比别的文字按估算宽度画的框，两边都比实际画出的窄。协调方裁定在本 PR 修：引出步骤自己维护一份所有文字按实际画出宽度（`labelBox`）的索引，候选的两段文字都不能碰到别的文字或已画的引出线。四组模糊测试（各 300 个平面）里，`main` 上干净、这里新出现压字的平面都是 0，压字对数都比 `main` 少（8→4、15→10、28→12、42→29）。语料：`W_ANNOTATION_OVERLAP` 101 → 91，其他测试文件夹 9 → 3；8 个标签被引出（5 个文件），2 个在自己地面重放，62 个没有位置（`chain30`、`star30` 的 61 个和一个楼梯）；`describe()` 和诊断不变，示例不变。knock-on 名单仍是 4 个。已知缺口：`W_ANNOTATION_OVERLAP` 不查房间文字压房间文字（卡 AL3c），所以这些压字原来没有报告。红队第一轮（#969）后：引出步骤先让开标签自己的旧位置（fit 记下的框以前没进 `marks`，引出点因此被挡到符号上）；同一格点在两个地面上时按几何选（面积小的、再比锚点），不看书写顺序；引出线除了两个地面之间的墙（沿两个地面都超过墙厚）不穿墙，不出楼外；引出点也按文字实际宽度避让；没写门类型的门 `drawCost` 从 5 改为 3，`test/drawing-budget.test.ts` 的 4 倍上限不变；`test/label-symbol-ink.test.ts` 加入缺陷语料，下限仍是 10。两种计数上限各有测试。

下一步：AL3b 合并后，按 `cards.md` 做下一张卡。依次做下去，每张卡一个 PR；卡合并后在这里记一行，并从 `cards.md` 删掉那张卡。

| 卡 | PR | 状态 |
|---|---|---|
| AL6 | #957 | 完成 |
| AL6b | — | todo |
| AL1 | #958 | 完成 |
| AL5 | #959 | 完成 |
| AL5b | — | todo |
| AL4 | #961 | 完成 |
| AL3w | #962 | 完成 |
| AL3a | #964 | 完成 |
| AL3b | #969 | 审阅中 |
| AL3c | — | todo |
| AL3d | — | blocked（协调方） |
| AL3e | — | todo |
| AL3f | — | todo |
| AL3g | — | blocked（协调方） |
| AL3h | — | todo |
| AL4b | — | todo |
| AL2a | — | todo |
| AL2b | — | blocked（AL-D1） |
| AL2c | — | todo |
| AL7 | — | todo |
| AL8 | — | todo |

完成后告诉下游应用是哪个发布版本带上了这些修复。发布本身仍需所有者单独决定。
