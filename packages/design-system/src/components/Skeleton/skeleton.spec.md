---
component: Skeleton
family: self-contained
variants: {}
sizes: {}
traits:
  - isMatrixHeavy
benchmark:
  - Ant Design Skeleton: github.com/ant-design/ant-design/tree/master/components/skeleton
  - MUI Skeleton: github.com/mui/material-ui/tree/master/packages/mui-material/src/Skeleton
  - Polaris SkeletonBodyText: github.com/Shopify/polaris/tree/main/polaris-react/src/components/SkeletonBodyText
---

# Skeleton 設計原則

## 定位

Skeleton 是**載入中的內容佔位符**——在資料載入完成前，用灰色色塊模擬真實內容的形狀與排版，讓使用者預期即將出現的佈局。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：shadcn passthrough——純 CSS opacity-pulse div（`animate-pulse`，不透明度脈動，非掃光/漸層動畫）。本 DS 保留 shadcn 原結構 + 橋接 DS token。

---

## 何時用

- **初次載入資料的 list / table / card grid**：保留內容形狀讓使用者預期佈局
- **非同步載入的 dashboard widget / chart**：資料來之前填滿空間避免跳動
- **內容切換後的短暫載入**：router 切換、tab 切換後的過渡狀態
- **已知佈局結構的等待**：佈局固定 + 資料動態的場景

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 小區塊 / 按鈕內的 loading | `CircularProgress` | CircularProgress(indeterminate)適合不佔空間的小 inline loading |
| 整頁 / overlay loading | `<Empty icon={<CircularProgress/>}/>` compose | Skeleton 是內容佔位,不是頁面遮罩 |
| 確認「沒有資料」的空狀態 | `Empty` | Empty 是「確定沒有」,Skeleton 是「還沒來」 |
| 錯誤 / 失敗狀態 | `Alert` + 重試 | Skeleton 無錯誤語意 |
| 進度有具體百分比 | `ProgressBar` / `CircularProgress`(有 value) | Skeleton 是不定進度占位,有 % 用 determinate progress |

---

## Skeleton vs CircularProgress

| | Skeleton | CircularProgress(indeterminate) |
|---|---|---|
| 視覺 | 內容形狀占位(灰色色塊) | 旋轉圓弧 |
| 尺寸 | 隨內容(list row / card / text line) | 自由 size(常用 16 / 20 / 24 / 48) |
| 訊號強度 | 弱(暗示「佈局已就位」) | 強(暗示「正在處理」) |
| 典型用途 | 初次載入 list / grid | Button loading、cell 載入、inline 等待 |

**判準**:
- **有已知佈局結構需保留 → Skeleton**(佔位、防跳動)
- **小區塊 / inline 等待 → CircularProgress**(無 value,indeterminate)
- **長載入換手**(先 Skeleton、超時換 progress):> 3s 的 fallback 規則見「A11y 預設」「替代文字」段

---

## 禁止事項

- ❌ 用 Skeleton 取代 Empty（確定沒有資料的空狀態）——語意不同
- ❌ 用 Skeleton 取代 error state——錯誤需要明確提示 + 解決路徑
- ❌ Skeleton 形狀嚴重偏離真實內容——會讓使用者預期被打破、體感更慢
- ❌ 長時間（> 10s）的 loading 一直用 Skeleton——使用者會懷疑是否卡住，需改用 progress indicator 或說明文字（10s = 硬性上限；> 3s 起即建議換手，見「A11y 預設」「替代文字」段）

---

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

Skeleton 是 pure passive primitive(占位用的 opacity-pulse div),刻意無變體:

- **無 Inspector**:Skeleton 唯一變因是「形狀」(w / h / rounded),由 consumer 透過 className 決定。互動 Inspector 無 prop 可調——該討論的是「怎麼畫出符合實際內容的形狀」,由 `CommonShapes` story 覆蓋。
- **無 ColorMatrix**:Skeleton 底色固定為 `bg-muted`(對齊 `color.spec.md`「Static Subtle」段「placeholder / 退化」原則;2026-05-20 修正歷史 drift `bg-secondary`)。Dark mode 自動由 semantic token 處理,加 color variant 會誤導成狀態變化(Skeleton 是 loading 中,不該有語意色)。
- **無 SizeMatrix**:Skeleton 無 size prop,尺寸完全由 consumer className(`w-32 h-4`)或 parent 決定——因為它要精確模擬內容形狀,不能限制成 sm/md/lg tier。
- **無 StateBehavior**:Skeleton 只有「顯示 / 不顯示」兩態(consumer unmount 即消失),無 hover / focus / active / selected / disabled——非互動元件。

對應 anatomy story:保留 `Overview` + 元件特有 `CommonShapes`(避免漂移的標準形狀庫)+ `DesignPrinciple`(與 CircularProgress 的分界)+ `Accessibility`(2026-05-17 加)。

---

## A11y 預設

Skeleton 是**純視覺 loading placeholder**,預設 ARIA 行為:

- **無內建 ARIA**:Skeleton 實作只是一個套用 pulse 動畫的 div(`{...props}` 原樣傳遞),不會自動設任何 ARIA 屬性。SR 不該朗讀 N 條 placeholder shape,因此 consumer 若需要對 SR 隱藏這些佔位塊,應自行在容器設 `aria-hidden="true"`
- **`aria-busy="true"` 由 consumer 容器 own**:loading region 的容器(如 DataTable / Card / Sidebar group)應設 `aria-busy="true"`,告知 SR「該區域 loading 中」;data ready 後 consumer 移除 `aria-busy` 同時 unmount Skeleton
- **不取得 focus**:Skeleton 永遠 non-interactive,無鍵盤行為
- **動畫**:`prefers-reduced-motion: reduce` 用戶自動 stop pulse 動畫(`skeleton.tsx:10` 的 `motion-reduce:animate-none`)。pulse 是自動播放的循環動畫,歸 WCAG 2.2.2 Pause, Stop, Hide(Level A);honor `prefers-reduced-motion` 即滿足。注意非 2.3.3 Animation from Interactions(該 SC 是 Level AAA,僅涵蓋由互動 / 捲動觸發的位移動畫,不適用 auto-play loop)
- **替代文字**:長時間 loading(>3s)consumer 應 fallback 為 `<Empty icon={<CircularProgress/>} description="載入中..." />`(SR-friendly text)— Skeleton 適合 < 3s 短暫 placeholder(3s 為建議換手值;> 10s 仍用 Skeleton 屬「禁止事項」硬性違規)
- **驗證**:Storybook a11y addon panel 0 critical violation。Skeleton 本身無文字內容、無互動角色,axe 不會要求 label;若 consumer 把 Skeleton 包進有語意的容器,label 由該容器負責

## 相關

- `../CircularProgress/circular-progress.spec.md` — 小區塊 / inline loading 的對應元件(取代 Spinner)
- `../Empty/empty.spec.md` — 確定沒有資料的空狀態
- `../Alert/alert.spec.md` — 錯誤 / 失敗狀態
- `../../tokens/color/color.spec.md` — Skeleton 底色 token（`bg-muted` 靜態底色 + `animate-pulse` opacity 脈動,2026-05-20 修 drift）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `circular-progress.spec.md`
- `progress-bar.spec.md`
