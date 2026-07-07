---
name: project-beta81-deep-audit-closure
description: beta.81(2026-07-05)deep-audit solo run 收斂發版;error×focus 照 Mantine canonical;殘餘 backlog 指標
metadata: 
  node_type: memory
  type: project
  originSessionId: 3fb5856b-7b97-40a4-afa1-5db311326bea
---

beta.81(2026-07-05 發版,npm view 驗證)= deep-audit solo run 完整收斂:A.1b 77 單元 3,762 句 / D3、D4、D5 首跑 / 66 修(含 React #310 家族 ×3、鍵盤 P0 ×2)/ 11 題設計拍板。

**關鍵 canonical(user 多輪追問後拍板)**:error×focus = **完全不變(照 Mantine)** — DS 聚焦主機制「邊框換 primary 基準色、無第二訊號」,12 家實查唯一同款 Mantine 選不變;已寫入 field.spec.md state machine 段(含 documented tradeoff:無游標觸發器聚焦隱形 + 重議條件)。**若未來升級全 DS 聚焦語言(加第二訊號),此題必重議**。

**殘餘 backlog**(不阻擋,完整清單 → repo `.claude/logs/deep-audit-2026-07-03/C1-final-report.md`):D4 62 個 P2 未驗、Sidebar disableShortcut API、DataTable Enter-commit 下移(API 設計)、aria-activedescendant 綁回 trigger、data-table.spec 行數 prune、baseline 為 ubuntu CI 渲染(刷新必走 CI artifacts,禁本機)。

**教訓已 codify**:smoke 驗 stale static build = 假綠(防線已建);`git add -A` 在背景 agents 改樹時會掃進半成品;preflight pass-marker 綁 HEAD — 必先 commit bump 再跑。
