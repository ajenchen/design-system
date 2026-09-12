<!-- Authority/status: governance/planning/registry.json -->
# AgentFab 命中區 brief(給第二意見:請辯論根因與最佳解,不要接受既有結論)

## 使用者回報(原話)

> 小fab又變難按了啊，按鈕視覺跟點擊範圍完全沒有對應起來啊，照理說 hover 會出現 tooltip 時
> 都應該要可以點擊打開 panel，但目前事實就不是如此，這個問題修了一百次還修不好

之前同一題的原話(2026-09-03):

> 最早我提出的問題其實是觸控範圍並沒有涵蓋所有視覺範圍，所以其實只要觸控範圍跟視覺範圍
> 是對齊的話，此問題就解決了

## 元件現況(`packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx`)

- 兩個形態(`SHAPES`,:244-245):`home` = 40px 圓、`dock` = 28px 左半圓貼右緣。
- 按鈕(:698-748):`<button>` 尺寸 = `spec.px`,**刻意不帶圓角**;圓角畫在內層
  `<span class="h-full w-full ... rounded-full / rounded-l-full">`。
  用意:命中盒 = 可視形狀的外接矩形,「看得到的每一點都點得到」。
- 殼(:635-652):`pointer-events-none absolute z-20 flex w-10 justify-end`。
  貼邊時殼 40 寬、鈕 28 靠右 → 殼左側 12px 是空白且不吃指標。
- 外層(:615):`pointer-events-none absolute inset-0 overflow-clip`(防裝飾溢出長出捲軸)。
- Tooltip(:680-750):`TooltipTrigger asChild` 直接包住那顆 `<button>`,
  所以 hover 目標與 click 目標**是同一個元素**。
- 拖曳(:340-456):`DRAG_THRESHOLD = 8`;只有超過門檻才 `moved=true`,
  放開時 `swallowNextClick()` 吞掉那一次 click。零位移點擊不會被吞。
- 右鍵選單錨點(:664)、招喚光圈(:656)皆 `pointer-events-none`。

## 我(Claude)實測到的事實(2026-09-04,Chrome extension,storybook-static)

**重要前提**:分頁 `document.visibilityState === "hidden"` 時 CSS 過渡不前進,
早期量到的「按鈕 40px、殼 right:16px」全是**過渡卡住的假象**;強制出幀(截圖)後即為正確值。
以下都是強制出幀後的量測。

1. 家態(40px):按鈕盒 40×40、`border-radius: 0`;內層 span 40×40、`border-radius: 9999px`。
   在盒內以 2px 網格取 400 點做 `elementFromPoint`,**400/400 全部命中按鈕**。
2. 貼邊態(28px,經右鍵選單切換):按鈕盒 `x=1179..1207`(視窗寬 1207,即貼齊右緣)、28×28;
   內層 `border-radius: 9999px 0 0 9999px`;
   取樣左上/左中/左下/中心/右上/右中/右下 **7/7 全部命中按鈕**。
3. 零位移的 pointerdown→pointerup→click 會正常開啟面板(`role="log"` 由 false → true)。

**所以我用幾何量測重現不出「hover 有 tooltip 但點不開」。** 我不打算硬套一個根因。

## 請你辯論的問題

1. 在「hover 目標與 click 目標是同一個 `<button>`」的前提下,**有哪些機制會造成
   hover 生效但 click 不生效?** 請窮舉並給出各自的可證偽判準,例如:
   - Radix Tooltip 的 grace period / `disableHoverableContent` 造成 tooltip 殘留,
     使用者其實已經移出按鈕;
   - `hover:scale-[1.04]` 造成的邊界抖動(進入→放大→指標相對位置改變);
   - 指標裝置的微小位移超過 `DRAG_THRESHOLD=8` 被判成拖曳 → `swallowNextClick()`;
   - 貼邊時鈕壓在別人的捲軸上(現行程式碼刻意讓捲軸贏,見 :690-697 註解);
   - `overflow-clip` 對命中測試的裁切;
   - 觸控板「輕點」與 `pointerdown/up` 的時序。
2. **「命中盒 = 可視形狀的外接矩形」這個決策本身對不對?** 使用者的原始要求是
   「觸控範圍涵蓋所有視覺範圍」。外接矩形滿足這句,但角落是看不到卻點得到的區域。
   桌機慣例(Material FAB / Fluent / HIG)在這一點上怎麼做?圓形按鈕該用圓形命中還是矩形命中?
3. **貼邊態該不該貼到視窗最外緣?** 現行是 `right: 0`,於是鈕的最右 1px 就在視窗邊界上,
   而且可能壓在宿主的捲軸上。是否應該留一個最小逃生邊距(例如 2–4px),
   或改成「貼邊但不吃最後 N px」?請給世界級對照(Android Bubbles / macOS Dock / Windows Snap)。
4. 若要一次解決「難按」而不再反覆,**最小且無副作用的解法**是什麼?
   請給 2–3 案的三欄對照:改動面 / 風險 / SSOT 歸屬。

## 約束

- 設計語言、視覺、互動一律以本 repo 的 DS SSOT 為準(`agent-panel.spec.md`、
  `patterns/element-anatomy/inline-action.spec.md`、`tokens/uiSize`)。
- 不得只改症狀;請指出 root invariant。
- 任何世界級對照請附可查證的來源(官方文件 URL 或原始碼路徑+行號)。
