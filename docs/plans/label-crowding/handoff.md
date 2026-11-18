# 密集图面可读：续接点

**2026-11-18**：计划写成（#956）。所有者批准全部修复；AL-D1…D3 按 README §5 的建议默认执行，所有者可以改。

**2026-11-18**：AL6 完成（#957，合并提交 `a9db286e`）。实际交付的附加信息形状：

- `subject` 是 `{kind, room, text}`（`room` 只在适用时出现）。`kind` 取 `room-label`（房间的标签，`text` 是房间名，无名房间是面积数字），或某种尺寸数字（`dim-chain`、`dim-thickness`、`dim-radius`、`dim-diameter`）。
- `over[]` 每一项是一个被压到的东西。`room-label` 报告里，每项带 `parts`，取值 `"name"`、`"area"` 的数组，说明标签里哪段文字压在它上面；尺寸数字的报告里，`room-label` 项的 `parts` 说明数字压住了那个标签的哪段文字。
- 形状的权威定义是 `src/diagnostic-json.ts` 的 `DiagnosticOverprintJson`。
- 导出 `diagnosticOverprint`；JSON 选项是 `DiagnosticJsonOptions.overprint`。
- 所有者 2026-11-18 批准了两份只列见证平面的守卫名单：`test/label-fit.test.ts` 的 `ORDER_EXCUSED`，和 `test/label-wrap.test.ts` 的 knock-on 名单。两份都只能缩小；AL3 合并时必须缩小。
- 第二轮红队的三条测试缺口记为 AL6b。

下一步：AL1。依次做下去，每张卡一个 PR；卡合并后在这里记一行，并从 `cards.md` 删掉那张卡。

| 卡 | PR | 状态 |
|---|---|---|
| AL6 | #957 | 完成 |
| AL6b | — | todo |
| AL1 | — | todo |
| AL5 | — | todo |
| AL4 | — | todo |
| AL3 | — | todo |
| AL2a | — | todo |
| AL2b | — | blocked（AL-D1） |
| AL2c | — | todo |
| AL7 | — | todo |
| AL8 | — | todo |

完成后告诉下游应用是哪个发布版本带上了这些修复。发布本身仍需所有者单独决定。
