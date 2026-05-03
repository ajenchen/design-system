---
component: ProgressBar
family: null
traits:
  - isInternal
variants: {}
sizes: {}
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# ProgressBar 設計原則

**水平進度條(linear determinate progress)**——表達「已完成 X%、還剩 Y%」的量化進度視覺 primitive。0–100% 的已知進度、單向推進、可預期終點。circular 形式(含 indeterminate)走 `CircularProgress`。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構；僅 `affix` 附加區可選顯示進度文字或狀態 icon）。

**實作基礎**：基於 Radix `@radix-ui/react-progress` primitive（原生提供 `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-valuetext`），外包本 DS 的 status / affix 語意與 token。高度**固定 4px**,不提供 size 選項(見下「單一高度」節)。

> 最薄的 linear determinate progress primitive。沒有 indeterminate animation(那屬 `CircularProgress` 無 value 模式的職責)、沒有 buffered fill(目前無 streaming 場景)、沒有自訂色(只能走 inProgress / success / error 三狀態)。

---

## 定位

ProgressBar 是**量化 linear 進度** primitive——consumer 必須能回答「目前進度是百分之幾」才能使用。若無法量化（e.g. fetching 中不知道要多久），改用 `CircularProgress`(不傳 value,indeterminate 模式)。

世界級對照:
- **Material** `LinearProgress`(determinate) — 同樣區分 determinate / indeterminate 兩模式,indeterminate 在我們系統由 `CircularProgress`(無 value)承擔
- **Ant Design** `Progress` — 支援百分比文字、status（success/exception/normal）,我們以 `affix="value"` / `status` 對應
- **Polaris** `ProgressBar` — 單一直線進度,不含 status 色區分,我們加上 status 對應上傳完成 / 失敗語意
- **shadcn** `Progress` — 同為 Radix Progress 薄包裝

---

## 何時用

- **批次任務進度**：CSV 匯入、批量同步、報表生成（Linear batch action / Jira bulk edit / Airtable import）
- **下載 / 匯出進度**（非檔案上傳列表情境）:單檔下載進度、匯出 zip、報表生成
- **多步驟流程的整體進度**：表單 wizard「步驟 3/5 = 60%」（但**步驟結構本身**用 `Steps` 元件,ProgressBar 只表達整體完成比例）
- **Table cell / row 內的 inline 進度**：DataTable 裡「配額使用率 45%」、「完成度 78%」等單列靜態指標

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| **檔案上傳 / 下載列表** | `FileItem` | FileItem 是檔案情境 canonical consumer-facing primitive,內部已消費 ProgressBar(見「與 FileItem 的分界」)——consumer 不自組 raw ProgressBar + 檔名 + icon 做上傳 UI |
| 進度無法量化(fetch / 等待 server) | `CircularProgress`(無 value,indeterminate) | ProgressBar 需已知 0-100%,無法估算終點時用 CircularProgress 的 indeterminate 語意 |
| <1 秒的短暫操作 | `CircularProgress` 或不顯示 | ProgressBar 動畫(300ms transition)在極短操作反而造成閃爍 |
| 骨架載入(預期內容形狀) | `Skeleton` | Skeleton 保留 layout,ProgressBar 只傳達「執行中量化」 |
| 步驟導覽(顯示 step 1/2/3 結構) | `Steps` | Steps 強調 step 本身是什麼、ProgressBar 只看整體百分比 |
| 容量 / 配額靜態顯示(非動態進行中) | 可用 ProgressBar(不傳 status,預設 inProgress 即可) | 可接受——ProgressBar 也能表達靜態 ratio,但若只是裝飾比例、非「進行中」語意,考慮 Chart bar 類元件 |
| 評分顯示(5 顆星 80%) | `Rating` | Rating 有離散刻度語意 |
| 小空間 / inline icon 位置的量化進度 | `CircularProgress`(有 value,determinate) | ProgressBar 在 16–24px 的小空間視覺比例不如 circular arc |

---

## 與 CircularProgress 的分界(SSOT)

**本節為 ProgressBar ↔ CircularProgress 分界的 single source of truth**,`circular-progress.spec.md` 的定位表以 pointer 指向本節深度規則。

**核心判斷**:兩個維度擇一(兩者都必須通過才選 ProgressBar):
1. **能量化進度嗎?**(ProgressBar 必須能;CircularProgress 兩態都接受)
2. **形狀適合 linear 還是 circular?**(頁面級 / 表單 wizard / 上傳列表 = linear;inline 小空間 / Button / Field = circular)

| 維度 | ProgressBar | CircularProgress |
|------|-------------|------------------|
| **形狀** | linear(水平直線) | circular(圓弧) |
| **進度模式** | determinate(0–100% 已知) | 兩態合一:無 value → indeterminate / 有 value → determinate |
| **視覺** | 水平直線從左往右填充 | 圓弧從 12 點順時針填充 / indeterminate 整體旋轉 |
| **典型情境** | 批次處理 / 表單 wizard / 頁面級大區塊 / quota(檔案上傳 → 走 FileItem) | Button loading / Field loading / cell 局部 / inline 小 % |
| **可量化時機** | **必須能量化**(100% 結束可預期) | determinate 能量化 / indeterminate 不需要 |
| **a11y** | `role="progressbar"` + `aria-valuenow` | `role="progressbar"`(有 value) / `role="status"`(無 value) |
| **終止條件** | 到 100% 或 status 變 success / error | 任務完成(卸載或 aria-busy 移除) |
| **typical 時長** | 秒級到分鐘級(值得顯示比例) | 秒級(短暫等待) / 秒到分鐘(determinate) |

**選擇 flowchart**:

```
1. 有進度數值嗎?
   ├─ 沒有 / 不知道時長 ────────→ CircularProgress(不傳 value)
   │    ├─ < 1 秒          ──→ 不顯示(避免閃爍)
   │    ├─ 1-10 秒         ──→ CircularProgress indeterminate
   │    └─ > 10 秒 + 無量化 ──→ CircularProgress + 額外文字說明
   │
   └─ 有(0-100%)
      2. 場景形狀適合?
         ├─ 頁面級 / 表單級 / 上傳列表 / 大區塊 ─→ ProgressBar
         └─ inline 小空間 / Button / Field / cell ─→ CircularProgress(傳 value)
```

**禁止混搭**:同一操作內不能先 CircularProgress 再 ProgressBar(會讓使用者以為是兩個獨立步驟)。一個操作若一開始不知進度、中段才取得 → 維持 indeterminate CircularProgress 到底,或改由上層 overlay 控制切換。

---

## API

```tsx
export interface ProgressBarProps {
  /** 當前進度 0-100,超出範圍自動 clamp */
  value: number
  /** inProgress=進行中 / success=完成 / error=失敗 */
  status?: 'inProgress' | 'success' | 'error'
  /** 右側附加:value=顯示 `{value}%` / status-icon=顯示狀態圖示 / ReactNode=客製 */
  affix?: 'value' | 'status-icon' | React.ReactNode
  /**
   * Track 高度 override(**非 consumer API**)。
   * 僅 FileItem 的 compact mode 內部使用,匹配極密集 row 的視覺比例。
   * Consumer 不要傳此 prop;若有新需求應先討論是否開新 variant,而非濫用此逃生艙。
   */
  height?: number
}
```

### Status 語意

| Status | 語意 | fill token | 使用時機 |
|--------|------|-----------|---------|
| `inProgress`(預設) | 進行中 / 未完成 ratio | `--primary` | 處理中、靜態比例顯示、CSV 匯入 |
| `success` | 完成 / 成功 | `--success` | value 到 100% 且操作成功完成 |
| `error` | 失敗 / 中斷 | `--error` | 處理中斷、配額超出警示 |

**禁止新增 `warning` status**:ProgressBar 的語意是「進行中 / 成功 / 失敗」二元終態,warning 屬於 Notice / Alert 的範疇。若要表達配額警示(如 90% 快滿),consumer 自己根據 value 切換到 `error`,不要在 ProgressBar 加中間色。

### 單一高度 4px(2026-04-20 決策)

本元件**不提供 size 選項**,track 固定 `4px`——對齊 Material 3 / Carbon / Ant Design 慣例(皆固定單一高度)。

**為什麼不分 size**:
- 過往分 size 的刻度差太小,視覺差異使用者幾乎無法區分,形同冗餘 API
- 分 size 反而讓 consumer 每次要「判斷該選哪個」,增加認知負擔
- 世界級 canonical:Material LinearProgress / Carbon ProgressBar / Ant Progress 皆固定單一高度,無 size variant
- 若需要視覺強調(hero level progress),改用 full-width 排版 + 放大百分比文字 / swap 為 CircularProgress 大尺寸,不靠 size 階梯撐

### 與 FileItem 的分界(consumer 選哪個)

**檔案上傳 UI 一律走 `FileItem`,不直接消費 ProgressBar**。FileItem 是檔案情境的 canonical consumer-facing primitive(檔名 / icon / 進度 / status / actions 一條龍);FileItem 內部**可能**消費 ProgressBar(實作細節,consumer 不用關心)。

| 情境 | 用什麼 |
|------|--------|
| 單檔 / 多檔上傳列表 / 下載 progress | **FileItem**(`components/FileItem/`)|
| CSV 匯入 / 批次處理 / 表單 wizard / quota 使用率 | **ProgressBar** 直接用 |
| 短暫 loading(不知時長) | **CircularProgress**(indeterminate) |

**世界級對照**:Ant Design 的 `Upload` vs `Progress`(Upload.List 內部用 Progress,consumer 不直接拼 Progress 做上傳 UI)。

### Affix 選擇

| Affix | 適用時機 | 範例 |
|-------|---------|------|
| `"value"` | 靜態 poll 場景 / 使用者想知道具體百分比 | DataTable cell「配額 78%」、FileItem「45%」 |
| `"status-icon"` | final state（success ✓ / error ✗）| 上傳完成顯示勾、失敗顯示叉 |
| `ReactNode` | 客製（e.g. action button「取消」、file size「2.3/5.0 MB」） | 上傳中顯示「取消」按鈕 |
| 不傳 | in-flight 不需額外資訊 | 短暫過渡狀態、nested 容器已有進度文字 |

**禁止**：同時在 affix 顯示 value 又在旁邊額外寫 `{value}%` 文字——會重複。取一個。

---

## 禁止事項

❌ **不得硬寫色值**——所有 status 色必走 `--primary` / `--success` / `--error` token,consumer 不可 override fill 色(若業務需要其他色,提到系統層討論新 status,不是每個消費者自己改)

❌ **不得將 ProgressBar 當 CircularProgress 用**——進度不可量化的操作一律用 `CircularProgress`(不傳 value),不要傳 `value={indeterminate ? ... : ...}` 假裝進度

❌ **不得堆疊多個 ProgressBar 在同一操作**——每個操作一個 bar。多檔上傳清單 = 每檔一個 ProgressBar,但「整體進度」不再加一條總 bar(Dropbox / Google Drive 皆此做法)

❌ **不得用於 <1 秒的短暫操作**——動畫 transition(300ms)會造成閃爍,改用 CircularProgress 或不顯示

❌ **不得用於未知進度**(詳見「與 CircularProgress 的分界」)

❌ **不得加 `warning` status**(見 Status 語意節)

❌ **不得在 ProgressBar 內塞內容(children)**——它是純視覺,附加資訊走 `affix`

---

## 狀態與邊界

- **Disabled**:本元件無 disabled 狀態。ProgressBar 是純視覺回饋,不接受互動事件。若整個上傳流程被禁用,由 parent container 控制(e.g. 包裝 `<fieldset disabled>` 或不 render)
- **Loading**:ProgressBar 本身就是 loading 的視覺,不再疊加 CircularProgress
- **Empty / 0%**:value=0 時仍 render 整條 track(灰底 + 無填充),不做特殊 empty state
- **Dark mode**:fill 色透過 semantic token(`--primary` / `--success` / `--error`)自動反轉,詳見 `color.spec.md`
- **Density**:本元件不隨 density 縮放(track 單一高度,見 tsx)

---

## A11y

Radix `Progress.Root` 自動提供：
- `role="progressbar"`
- `aria-valuenow={value}` / `aria-valuemin={0}` / `aria-valuemax={100}`
- 如需客製 announce（e.g.「上傳中 45%」）,在 parent 傳 `aria-valuetext="上傳中 45%"` override

**Consumer 需補**:若此 ProgressBar 代表特定語境任務,在 parent 加 `aria-label`(e.g.「檔案上傳進度」)讓螢幕閱讀器能辨認。

---

## 為何無 StateBehavior

ProgressBar 是**純視覺百分比指示**,本身**無互動狀態**(見「狀態與邊界」段:無 disabled,不接受互動事件)。唯一的「行為」是 value 變化時 fill 寬度動畫——那是 controlled prop 的資料更新,不是 UI state 切換。color variant(inProgress / success / error)依 value 狀態切換的行為已在 `ColorMatrix` + 元件特有 `AffixBehavior`(percent / icon-on-complete 驅動邏輯)覆蓋。

對應 anatomy story:保留 `Overview` + `Inspector`(value 試玩) + `ColorMatrix` + 元件特有 `AffixBehavior`。無 `SizeMatrix`(高度固定 4px)。

---

## 相關

- **CircularProgress 分界** — 本 spec「與 CircularProgress 的分界」節(SSOT)
- **CircularProgress 元件** — `components/CircularProgress/circular-progress.spec.md`(circular 兩態 primitive)
- **FileItem 消費** — `components/FileItem/file-item.tsx`(canonical 檔案情境 consumer-facing primitive,內部消費 ProgressBar 的 4px 單一高度)
- **Steps** — `components/Steps/steps.spec.md`(步驟結構非百分比)
- **Skeleton** — `components/Skeleton/skeleton.spec.md`(骨架載入非進度)
- **Color tokens** — `tokens/color/color.spec.md`(`--primary` / `--success` / `--error` 定義)

## 遷移記錄(2026-04-20)

元件由 `Progress`(folder `Progress/` + identifier `Progress`)重命名為 `ProgressBar`(folder `ProgressBar/` + identifier `ProgressBar`)。Breaking change:

- `import { Progress } from '.../Progress/progress'` → `import { ProgressBar } from '.../ProgressBar/progress-bar'`
- `<Progress value={N}/>` → `<ProgressBar value={N}/>`(props 契約未變)
- `ProgressProps` type name → `ProgressBarProps`

重命名理由:`CircularProgress` 元件(circular 兩態合一)納入系統後,需和 `Progress`(原 linear)在名稱上明確區分形狀。`ProgressBar` 對齊 Polaris / shadcn 命名慣例,使用者一看即知是 linear。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `file-item.spec.md`
