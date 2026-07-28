---
name: PushNotification 預設強制推(every turn end call)
description: User 2026-05-17 拍板「通知都先強制推,等到我覺得不好用再調整」。每 turn 結尾 call PushNotification,不自我 suppress / 不判斷 terminal focus(那是 tool harness 自己的 heuristic)。
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
**Rule**:每個有意義 turn 結尾(完成 fix / 跑 audit / 報告 milestone / 等 user 決策)**必 call** `PushNotification` tool。

**Why**:User 在 iPhone 用 Claude Code Remote Control,要 desktop 工作完成的即時通知。Tool 本身有 「terminal has focus → Not sent」 heuristic,**那是 harness 層級判斷,不是 AI 該自己 suppress**。AI 該做的是 ALWAYS 主動 call,讓 OS / harness 決定是否真推到 iPhone。

**How to apply**:
- 任何 substantive turn(commit / audit / fix / propose / 等決策)結尾 call PushNotification,message ≤ 200 char
- 純 verify / 短狀態 turn 也可 call(user 拍板 「強制推,不好用再調整」)
- 收到 「Not sent — terminal has focus」 回應 = harness suppression,正常,不是失敗
- User 之後若說「太擾」/「別推這個」 → 該 retract 本 rule

**User verbatim 2026-05-17**:「通知都先強制推,等到我覺得不好用再調整」
