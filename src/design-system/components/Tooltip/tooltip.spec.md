# Tooltip 設計原則

## 定位

Tooltip 是 hover 或 focus 時出現的短文字提示，用於補充畫面上未能清楚傳達的資訊。

## 何時使用

Tooltip 的判斷標準是：**畫面上的資訊是否已經足夠讓使用者理解？**

- **畫面不夠清楚 → 用 tooltip 補充。** 例如：icon-only 按鈕沒有文字 label，使用者需要 tooltip 才能確認這個 icon 代表什麼操作
- **畫面已經清楚 → 不需要 tooltip。** 例如：按鈕已有完整的文字 label（「儲存」「刪除」），tooltip 重複同樣的文字沒有價值
- **截斷文字 → 用 tooltip 顯示完整內容。** 但只有當文字實際被截斷時才顯示——tooltip 是補救機制，不是裝飾

## 出現時機

全產品統一一組時間參數，不因 tooltip 類型或位置而異——不一致的延遲會讓使用者無法建立穩定的操作預期。

**Warm-up pattern（暖機模式）：**

1. 使用者首次 hover 某個觸發器 → 等待初始延遲，確認是刻意停留而非滑鼠路過（NNGroup 研究：低於此閾值會導致隨意移動滑鼠時螢幕不停閃爍）
2. Tooltip 出現後，使用者移到下一個觸發器 → 在掃描窗口期內，tooltip 即時切換，不再等待（toolbar 逐一掃描場景）
3. 使用者離開所有觸發器超過掃描窗口期 → 系統冷卻，下次 hover 重新等待初始延遲

這是一個行為的兩個階段，不是兩種不同的延遲。全域一個 `TooltipProvider` 統一控制，所有 tooltip（包括 Button icon-only 自動產生的）共享同一組參數。

## 不是什麼

- **不是 popover**——tooltip 不能包含互動元素（按鈕、連結、輸入框），使用者無法點擊 tooltip 內容
- **不是長篇說明**——tooltip 適合一句話的補充，需要多段文字或圖片應使用 popover 或 help panel
- **不是錯誤提示**——欄位驗證錯誤使用 inline error message，不用 tooltip

## 與 Button icon-only 的關係

Button 的 `iconOnly` 模式已內建自動 tooltip（以 `aria-label` 驅動），開發者不需要額外包 `<Tooltip>`。只有在非 Button 元素需要 tooltip 時，才手動使用 Tooltip 元件。

## 禁止事項

- ❌ 不要在已有完整 label 的按鈕上加 tooltip 重複同樣的文字
- ❌ 不要在 tooltip 裡放互動元素——改用 popover
- ❌ 不要把 tooltip 當作必要資訊的唯一載體——tooltip 需要 hover 才能看到，觸控裝置無法觸發
- ❌ 不要為個別 tooltip 設定不同的延遲時間——全產品統一一組參數
