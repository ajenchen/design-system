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
- 無 capability／不可證 availability = 不 call、不 warn、不 block，receipt 記 `notification: unobserved-capability`
- User 之後若說「太擾」/「別推這個」 → 該 retract 本 rule

**User verbatim 2026-05-17**:「通知都先強制推,等到我覺得不好用再調整」
