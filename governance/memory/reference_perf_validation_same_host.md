---
name: 效能驗收必同網域 — user 的慢機器把 *.netlify.app 送進遠端隔離 thin client(2026-09-15)
description: user 在「非本機器」上量到 main 17ms / 分支 33ms 兩天追不到根因;LoAF 歸因證明是該機器的網路/安全產品對 netlify.app 注入 thin-client-min.js(逐幀 rAF + WebSocket),github.io 在白名單本地渲染;程式碼無退步。效能比較必同網域、先歸因再消融
type: reference
originSessionId: b1e3fe19-f71f-4828-b483-cf3fe2323f47
---
# 效能驗收必同網域(2026-09-15 結案)

## 事實(user 機器上的 Long Animation Frames 歸因,同一支量具)
| 頁面 | 幀距 | 長幀(≥50ms) | 長幀裡 script 來源 |
|---|---|---|---|
| 分支 `*--ajenchen-design-system.netlify.app` | 17×135、34–187ms 長尾 | 82 | 5301ms `FrameRequestCallback @thin-client-min.js` + `DOMWebSocket.onmessage @thin-client-min.js` |
| main `main--ajenchen-design-system.netlify.app` | 同樣長尾 | 多 | 7333ms `thin-client-min.js` |
| main `ajenchen.github.io/design-system` | 893 幀全 17 | 0 | 無 |

`thin-client-min.js` 不在建置裡(curl 預覽站 iframe.html 只有 Storybook 的 script),是那台機器的環境對 `*.netlify.app` 注入的遠端隔離 / thin client 腳本;
該機器回報 WebGL renderer = SwiftShader、`hardwareConcurrency` 22、DPR 1、視窗 958×910 —— 那是遠端隔離環境的樣子。github.io 在白名單、本地渲染。

**結論:三個組合的唯一變數是網域,DataTable 程式碼沒有 hover 退步。**

## Why
兩天內所有 DS 內部消融(骨架底、過渡、hover 底色、按鈕、把手、捲軸、pointer-events:none)在那台機器上全部 33 —— 因為頁面內容不是變數。
本機 headless / CPU 降速 / SwiftShader 全部重現不出 —— 因為那支腳本不在本機。
09-14 就寫好的 LoAF 歸因量具被我放下去做消融,晚了兩天。

## How to apply
1. **效能 A/B 必同網域、同主機**:main 與分支都用 Netlify(`main--<site>` vs `<branch>--<site>`),或都用 github.io。跨網域的差異先當網路/注入,不當程式碼。
2. **先歸因再消融**:任何「慢」先用 `long-animation-frame` 的 `scripts[].sourceURL / invoker` 看長幀裡是誰(`scripts/user-probe/loaf-attribution.js` 貼進 Console),再決定要不要動程式碼。不是我們的 sourceURL → 不是我們的問題。
3. 遇到 user 的機器回報 SwiftShader / 異常核心數 / 只有某網域慢:先問「這頁有沒有被注入非建置內的 script」(`document.scripts` 或 LoAF 來源),再開工。
4. 若要在那台機器上驗收 Netlify 預覽:請 user 的 IT 把 `*.netlify.app` 加白名單,或改看 github.io。
5. 相關:M32 錨例 (h)(`packages/design-system/ds-canonical/rules/meta-patterns.md`)。
6. **同一個環境也會改寫輸入事件**(2026-09-16):user 在該機器上「拖一下 FAB 就開面板」,本機 135 次真滑鼠拖曳零誤開、程式碼自 9/8 起零改動;
   唯一能重現的是「pointermove 被丟掉 / 合併」與「click 比 pointerup 晚一個 task 送達」兩種形狀 —— 正是輸入經代理轉送會發生的事。
   互動判準不得依賴事件計數或同 task 假設(判距離、旗標到下一次 pointerdown 才清);AGENTS.md 失敗記憶索引已收一行。
