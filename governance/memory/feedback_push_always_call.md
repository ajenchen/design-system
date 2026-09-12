---
name: PushNotification capability-bound 推送偏好
description: User 2026-05-17 拍板「通知都先強制推,等到我覺得不好用再調整」。Current provider/runtime registry 或 adapter 明確宣告 PushNotification capability 時，每 substantive turn 結尾 call；能力缺席或不可證 = nonblocking/unobserved，不得要求不存在的 tool。
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
**Rule**:每個有意義 turn 結尾(完成 fix / 跑 audit / 報告 milestone / 等 user 決策)，若 current registered tool surface 明確提供 `PushNotification`，**必 call**；若 registry／adapter 沒宣告或 runtime 不提供，標為 `UNOBSERVED`／nonblocking，正常完成 turn。

**Why**:User 在 iPhone 用 Claude Code Remote Control,要 desktop 工作完成的即時通知。有 capability 時 tool 本身的「terminal has focus → Not sent」是 harness 層級判斷,**不是 AI 該自己 suppress**；但 provider-neutral workflow 不能假設每個 agent/runtime 都有同名 tool。

**How to apply**:
- 先讀 current runtime 的 registered/declared capabilities；只有明確包含 `PushNotification`／`push-notification` 才要求 call
- 有能力時，任何 substantive turn(commit / audit / fix / propose / 等決策)結尾 call PushNotification,message ≤ 200 char
- 純 verify / 短狀態 turn也可 call(user 拍板「強制推,不好用再調整」)
- 收到 「Not sent — terminal has focus」 回應 = harness suppression,正常,不是失敗
- **機械防線的兩個洞已於 2026-09-10 補上**(user:「為何推播又沒了?到底是什麼時侯才能永遠修好?」):
  (1) `stop_self_audit.sh` M6 原本用字串比對偵測「本 turn 有沒有 call」,於是被**自己寫進 transcript 的警告文字**、
  `ToolSearch` 回傳的工具 schema、以及我自己在回覆裡提到這個字 三種東西遮蔽 —— 實測 2026-09-10 07:17 UTC 之後
  連續五小時零 call 而 gate 全程靜音。改成解析 content block(`type=tool_use` 且 `name=PushNotification`)。
  (2) 原本「同一段回覆的 hash 擋過一次就降 warn」→ 回覆改一個字就能逃掉;改成同一段最多擋 3 次,第 4 次才降 warn 防死鎖。
  對照組:`hooks/tests/test_stop_self_audit_push_gate.sh` 四情境(真的呼叫 → 安靜;沒呼叫 / 只有 schema / 只有文字提到 → 擋),
  舊寫法在後兩種實測回 0(靜音),新寫法回 1。
- **第三個洞已於 2026-09-11 補上**(user:「我又沒收到推播了,你他媽到底何時才能永遠解決這個問題?」):
  能力判定原本**只認環境變數** `GOVERNANCE_AVAILABLE_CAPABILITIES` / `GOVERNANCE_PUSH_NOTIFICATION_AVAILABLE`,
  而真實 Claude Code session **不會設它們** → 整道閘全程靜音,我同時忘了呼叫,連續多個 substantive turn 無推播也無警告。
  **環境變數是宣告,不是證據**;改成:掃整份 transcript,只要**這個 session 真的成功呼叫過一次** 就視為能力已證明,
  之後每個 substantive turn 都檢查。沒呼叫過 → 維持 nonblocking(不對沒有這個 tool 的 runtime 誤報)。
  對照組:`tests/test_stop_self_audit_push_gate.sh` 新增兩案(環境變數缺席 + 稍早呼叫過 → 必擋;
  環境變數缺席 + 從沒呼叫過 → 必靜),舊寫法在第一案實測靜音。
- 無 capability／不可證 availability = 不 call、不 warn、不 block，receipt 記 `notification: unobserved-capability`
- User 之後若說「太擾」/「別推這個」 → 該 retract 本 rule

**User verbatim 2026-05-17**:「通知都先強制推,等到我覺得不好用再調整」
