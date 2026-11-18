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

下一步：AL4。依次做下去，每张卡一个 PR；卡合并后在这里记一行，并从 `cards.md` 删掉那张卡。

| 卡 | PR | 状态 |
|---|---|---|
| AL6 | #957 | 完成 |
| AL6b | — | todo |
| AL1 | #958 | 完成 |
| AL5 | #959 | 审阅中 |
| AL5b | — | todo |
| AL4 | — | todo |
| AL3 | — | todo |
| AL2a | — | todo |
| AL2b | — | blocked（AL-D1） |
| AL2c | — | todo |
| AL7 | — | todo |
| AL8 | — | todo |

完成后告诉下游应用是哪个发布版本带上了这些修复。发布本身仍需所有者单独决定。
