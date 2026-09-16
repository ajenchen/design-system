---
name: project_agent_ui_draft_model
description: "AI agent 面板規格:唯一權威 = governance/planning/2026-09-06-agent-principles-v14.md(2026-09-08 起);2026-08-11 規格已過時;實作已落地(2026-09-07),隔離令解除,後續改動走 spec / v14 propose 流程"
metadata:
  node_type: memory
  type: project
  originSessionId: b1e3fe19-f71f-4828-b483-cf3fe2323f47
  modified: 2026-09-16T00:00:00.000Z
---

# AI agent 面板規格 — 已定稿,BACKLOG(2026-08-11)

**⚠️ 2026-09-08 更新:SSOT 已換人。** 現行唯一權威 =
`governance/planning/2026-09-06-agent-principles-v14.md`(agent 原則 v14 七條)。
下方 2026-08-11 規格**整份過時、不得引用**(總帳 :90)。
v14 定稿後一度只存在於 scratchpad,repo 無副本,直接造成 2026-09-08 把已定案條款重列為「待拍板」;
**權威不落地就等於不存在**,這正是本檔「最大風險 (a) 細節散失回 scratchpad」的實現。

**歷史 SSOT(已過時)** = repo `governance/planning/2026-08-11-agent-ui-panel-spec.md`(§〇 為唯一規範:user 草案逐字 + 27 條結論 + 30 列窮舉表;§一後僅證據)。artifact 鏡像:`f22888f5-8687-450f-83b4-4db30f92e08f`。planning registry 已登記(reference / non-executable)。

**user 拍板定位(逐字)**:「先確保有完整有脈絡記錄下來,之後我們再安排,目前先放在 backlog,但要確保沒有遺漏我們討論的細節,也不要讓這個規格汙染目前ds不該被汙染的地方」。

**Why**:規格歷經雙方對抗稽核(我方 43 項 + codex 7 組)修畢、未決項 0;但未排實作。最大風險是(a)細節散失回 scratchpad/對話,(b)條款提早滲入 DS spec/token/hook。

**How to apply**:
1. 任何 agent 面板相關工作**先讀 v14**(`2026-09-06-agent-principles-v14.md`,含來源總帳);它與其他來源衝突時以它為準。2026-08-11 的 §〇 只是歷史,不再當需求輸入。
2. **隔離令(已解除)**:2026-09-07 起 user 排定並落地實作(v14 + `agent-panel.spec.md`),後續改動走 spec / v14 的正常 propose 流程;未落地前那條「不得寫進 `packages/design-system/src/**`」只剩歷史意義。
3. 禁把 v14 已答題重列為「未決」;引 user 原話一律逐字(M36(a)),新裁示逐字登進 v14 來源總帳。
4. 改動走正常 propose 流程(產品／UI／UX 真取捨才 ASK),落地必同步 spec / code / story / 閘。
