---
name: project_agent_ui_draft_model
description: "AI agent 面板規格已定稿並歸檔 BACKLOG(2026-08-11);SSOT = repo governance/planning/2026-08-11-agent-ui-panel-spec.md 的 §〇;實作前禁寫入 DS canonical"
metadata:
  node_type: memory
  type: project
  originSessionId: b1e3fe19-f71f-4828-b483-cf3fe2323f47
  modified: 2026-08-11T10:54:13.451Z
---

# AI agent 面板規格 — 已定稿,BACKLOG(2026-08-11)

**SSOT(durable)** = repo `governance/planning/2026-08-11-agent-ui-panel-spec.md`(§〇 為唯一規範:user 草案逐字 + 27 條結論 + 30 列窮舉表;§一後僅證據)。artifact 鏡像:`f22888f5-8687-450f-83b4-4db30f92e08f`。planning registry 已登記(reference / non-executable)。

**user 拍板定位(逐字)**:「先確保有完整有脈絡記錄下來,之後我們再安排,目前先放在 backlog,但要確保沒有遺漏我們討論的細節,也不要讓這個規格汙染目前ds不該被汙染的地方」。

**Why**:規格歷經雙方對抗稽核(我方 43 項 + codex 7 組)修畢、未決項 0;但未排實作。最大風險是(a)細節散失回 scratchpad/對話,(b)條款提早滲入 DS spec/token/hook。

**How to apply**:
1. 任何 agent 面板相關工作**先讀該 planning 檔 §〇**;它與其他來源衝突時以它為準。
2. **隔離令**:user 排定實作前,不得把該規格條款寫進 `packages/design-system/src/**`、token、hook、M-rule。
3. 禁把 §〇 條款降級成「未決」;引 user 原話一律逐字(M36(a))。
4. 實作啟動時走正常 propose 流程,§〇 為需求輸入。
