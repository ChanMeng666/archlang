# checker-reach：交接

新会话的恢复点，每张卡合并后更新。计划与决定见 `README.md`。

## 1. 当前位置

- CR0 done（本 PR）：计划落库，drawing-set handoff 记下 CR-D1，已合并的 J 轮 worktree（`feat/j13-sheet-text`、`feat/j3-finish-levels`）已删。
- `spec.llm.md` 2026-11-05 实测 29,891 UTF-16 单位（`test/llm-spec-drift.test.ts` 的量法，上限 `< 30_000`），CR1 以此为基准腾出 ≥650。

## 2. 接下来，按序

CR1 → CR2（四组，每组一个 PR）→ CR2b → CR3 → CR4 → CR5，然后第 B 批 CR6 → CR7 → CR8。冻结日 2026-11-24。

## 3. 开工前

`git fetch --all --prune`；从 `origin/main` 开分支；`npm ci`；先看当前日期与开放 issue。
