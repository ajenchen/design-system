# Skeleton 設計原則

## 定位

Skeleton 是**載入中的內容佔位符**——在資料載入完成前，用灰色色塊模擬真實內容的形狀與排版，讓使用者預期即將出現的佈局。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：shadcn passthrough——純 CSS animated gradient div。本 DS 保留 shadcn 原結構 + 橋接 DS token。

---

## 何時用

- **初次載入資料的 list / table / card grid**：保留內容形狀讓使用者預期佈局
- **非同步載入的 dashboard widget / chart**：資料來之前填滿空間避免跳動
- **內容切換後的短暫載入**：router 切換、tab 切換後的過渡狀態
- **已知佈局結構的等待**：佈局固定 + 資料動態的場景

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 小區塊 / 按鈕內的 loading | `Spinner` | Spinner 適合不佔空間的小 inline loading |
| 整頁 / overlay loading | `LoadingOverlay`（未來）| Skeleton 是內容佔位，不是頁面遮罩 |
| 確認「沒有資料」的空狀態 | `Empty` | Empty 是「確定沒有」，Skeleton 是「還沒來」 |
| 錯誤 / 失敗狀態 | `Alert` + 重試 | Skeleton 無錯誤語意 |
| 進度有具體百分比 | Progress bar（未來）| Skeleton 是不定進度占位，有 % 用 progress |

---

## Skeleton vs Spinner

| | Skeleton | Spinner |
|---|---|---|
| 視覺 | 內容形狀占位（灰色色塊）| 旋轉 icon |
| 尺寸 | 隨內容（list row / card / text line） | 固定 icon 尺寸（sm 16 / md 20 / lg 24） |
| 訊號強度 | 弱（暗示「佈局已就位」） | 強（暗示「正在處理」） |
| 典型用途 | 初次載入 list / grid | Button loading、cell 載入、inline 等待 |

**判準**：
- **有已知佈局結構需保留 → Skeleton**（佔位、防跳動）
- **小區塊 / inline 等待 → Spinner**

---

## 禁止事項

- ❌ 用 Skeleton 取代 Empty（確定沒有資料的空狀態）——語意不同
- ❌ 用 Skeleton 取代 error state——錯誤需要明確提示 + 解決路徑
- ❌ Skeleton 形狀嚴重偏離真實內容——會讓使用者預期被打破、體感更慢
- ❌ 長時間（> 10s）的 loading 一直用 Skeleton——使用者會懷疑是否卡住，需改用 progress indicator 或說明文字

---

## 相關

- `../Spinner/spinner.spec.md` — 小區塊 / inline loading 的對應元件
- `../Empty/empty.spec.md` — 確定沒有資料的空狀態
- `../Alert/alert.spec.md` — 錯誤 / 失敗狀態
- `../../tokens/color/color.spec.md` — Skeleton 底色 token（`bg-secondary` / animated gradient）
