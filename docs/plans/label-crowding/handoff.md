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

**2026-11-19**：AL3a 进入审阅（#964）。`relocateLabels` 按从平面读出的顺序处理标签（`plotOrder`：先 y 后 x，与 `fitLabels` 相同），站在自己地面之外的房间标签不再挡后面的标签。`ORDER_EXCUSED` 从 5 个平面减到 0（名单删除），knock-on 名单从 4 个名字减到 2 个。语料：`chain30`、`star30` 的房间文字重放，20 和 14 条报告改了措辞（条数不变）；walls-first `6-clinic` 的 Staff Room 名字从 300 变成 350。#962 第二轮红队的 S1（邻居过宽的名字把一个本来放得下的名字挤走、再被缩小）由这一条消除，并钉成测试。红队给的另一个例子 case475（"MASTER BEDROOM" 175 → 150）不是邻居的问题，是 `fitLabels` 宁要贴墙余量（tier 0）的小字号，也不要原字号的 tier 1；没有在这个 PR 里改，交给协调方裁定。镜像平局由舍入决定（N2）仍是单独的卡。

下一步：AL3a 合并后做 AL3b（引出线）。依次做下去，每张卡一个 PR；卡合并后在这里记一行，并从 `cards.md` 删掉那张卡。

| 卡 | PR | 状态 |
|---|---|---|
| AL6 | #957 | 完成 |
| AL6b | — | todo |
| AL1 | #958 | 完成 |
| AL5 | #959 | 完成 |
| AL5b | — | todo |
| AL4 | #961 | 完成 |
| AL3w | #962 | 完成 |
| AL3a | #964 | 审阅中 |
| AL3b | — | todo |
| AL2a | — | todo |
| AL2b | — | blocked（AL-D1） |
| AL2c | — | todo |
| AL7 | — | todo |
| AL8 | — | todo |

完成后告诉下游应用是哪个发布版本带上了这些修复。发布本身仍需所有者单独决定。
