# Progress 設計原則

**水平進度條（determinate progress）**——表達「已完成 X%、還剩 Y%」的量化進度視覺 primitive。0–100% 的已知進度、單向推進、可預期終點。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構；僅 `affix` 附加區可選顯示進度文字或狀態 icon）。

**實作基礎**：基於 Radix `@radix-ui/react-progress` primitive（原生提供 `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-valuetext`），外包本 DS 的 status / size / affix 語意與 token。

> 最薄的 determinate progress primitive。沒有 indeterminate animation（那屬 Spinner 職責）、沒有 buffered fill（目前無 streaming 場景）、沒有自訂色（只能走 inProgress / success / error 三狀態）。

---

## 定位

Progress 是**量化進度** primitive——consumer 必須能回答「目前進度是百分之幾」才能使用。若無法量化（e.g. fetching 中不知道要多久），改用 `Spinner`。

世界級對照:
- **Material** `LinearProgress`(determinate) — 同樣區分 determinate / indeterminate 兩模式,indeterminate 在我們系統由 `Spinner` 承擔
- **Ant Design** `Progress` — 支援百分比文字、status（success/exception/normal）,我們以 `affix="value"` / `status` 對應
- **Polaris** `ProgressBar` — 單一直線進度,不含 status 色區分,我們加上 status 對應上傳完成 / 失敗語意
- **shadcn** `Progress` — 同為 Radix Progress 薄包裝

---

## 何時用

- **檔案上傳 / 下載進度**：上傳中顯示 inProgress、完成顯示 success、失敗顯示 error（Dropbox / Google Drive / Slack 檔案上傳模式）
- **批次任務進度**：CSV 匯入、批量同步、報表生成（Linear batch action / Jira bulk edit / Airtable import）
- **多步驟流程的整體進度**：表單 wizard「步驟 3/5 = 60%」（但**步驟結構本身**用 `Steps` 元件,Progress 只表達整體完成比例）
- **Table cell / row 內的 inline 進度**：DataTable 裡「配額使用率 45%」、「完成度 78%」等單列靜態指標

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 進度無法量化（fetch / 等待 server） | `Spinner` | Progress 需已知 0-100%,無法估算終點時用 Spinner 的 indeterminate 語意 |
| <1 秒的短暫操作 | `Spinner` 或不顯示 | Progress 動畫（300ms transition）在極短操作反而造成閃爍 |
| 骨架載入（預期內容形狀） | `Skeleton` | Skeleton 保留 layout,Progress 只傳達「執行中量化」 |
| 步驟導覽（顯示 step 1/2/3 結構） | `Steps` | Steps 強調 step 本身是什麼、Progress 只看整體百分比 |
| 容量 / 配額靜態顯示（非動態進行中） | 可用 Progress（不傳 status,預設 inProgress 即可） | 可接受——Progress 也能表達靜態 ratio,但若只是裝飾比例、非「進行中」語意,考慮 Chart bar 類元件 |
| 評分顯示（5 顆星 80%） | `Rating` | Rating 有離散刻度語意 |

---

## 與 Spinner 的分界（SSOT）

**本節為 Progress ↔ Spinner 分界的 single source of truth**，`spinner.spec.md` 以 pointer 指向此節。

**核心判斷**：「consumer 能告訴使用者『剩下 X%』嗎?」
- 能 → **Progress**（determinate）
- 不能 → **Spinner**（indeterminate）

| 維度 | Progress | Spinner |
|------|-------------|---------|
| **進度模式** | determinate(0–100% 已知) | indeterminate(時長未知) |
| **視覺** | 水平直線從左往右填充 | 原地旋轉(無方向起訖) |
| **典型情境** | 檔案上傳 / 下載 / 批次處理 / 已完成比例 | Button loading / async validation / fetch 中 |
| **可量化時機** | **必須能量化**(100% 結束可預期) | **無需量化**(等 server / 不知時長) |
| **a11y** | `role="progressbar"` + `aria-valuenow` | `role="status"` 或父層 `aria-busy` |
| **終止條件** | 到 100% 或 status 變 success / error | 任務完成(卸載或 aria-busy 移除) |
| **typical 時長** | 秒級到分鐘級(值得顯示比例) | 秒級(短暫等待) |

**選擇 flowchart**:

```
有進度數值嗎?
├─ 有(0-100%) ──────────→ Progress
└─ 無 / 不知道時長
   ├─ < 1 秒          ──→ 不顯示(避免閃爍)
   ├─ 1-10 秒         ──→ Spinner
   └─ > 10 秒 + 無量化 ──→ Spinner + 額外文字說明「處理中,預計 X」(由上層元件組合)
```

**禁止混搭**：同一操作內不能先 Spinner 再 Progress（會讓使用者以為是兩個獨立步驟）。一個操作若一開始不知進度、中段才取得 → 維持 Spinner 到底,或改由上層 overlay 控制切換。

---

## API

```tsx
export interface ProgressProps {
  /** 當前進度 0-100,超出範圍自動 clamp */
  value: number
  /** inProgress=進行中 / success=完成 / error=失敗 */
  status?: 'inProgress' | 'success' | 'error'
  /** sm=2px / md=4px / lg=6px */
  size?: 'sm' | 'md' | 'lg'
  /** 右側附加:value=顯示 `{value}%` / status-icon=顯示狀態圖示 / ReactNode=客製 */
  affix?: 'value' | 'status-icon' | React.ReactNode
}
```

### Status 語意

| Status | 語意 | fill token | 使用時機 |
|--------|------|-----------|---------|
| `inProgress`(預設) | 進行中 / 未完成 ratio | `--primary` | 上傳中、處理中、靜態比例顯示 |
| `success` | 完成 / 成功 | `--success` | value 到 100% 且操作成功完成 |
| `error` | 失敗 / 中斷 | `--error` | 上傳失敗、處理中斷、配額超出警示 |

**禁止新增 `warning` status**：Progress 的語意是「進行中 / 成功 / 失敗」二元終態,warning 屬於 Notice / Alert 的範疇。若要表達配額警示（如 90% 快滿）,consumer 自己根據 value 切換到 `error`,不要在 Progress 加中間色。

### Size 選擇

| Size | Height | 使用時機 |
|------|--------|---------|
| `sm` | 2px | Table cell inline / FileItem compact mode / 密集列表內的輕量指標 |
| `md`（預設）| 4px | 一般用途：上傳列表、表單 wizard、FileItem rich mode |
| `lg` | 6px | Prominent card 中央的主要進度（匯入流程、onboarding progress） |

**判斷法**：進度本身是主要資訊（使用者正在盯著看）→ `lg`；進度是列表或卡片的附屬資訊 → `md`；進度只是一行資料的次要指標 → `sm`。

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

❌ **不得硬寫色值**——所有 status 色必走 `--primary` / `--success` / `--error` token,consumer 不可 override fill 色（若業務需要其他色,提到系統層討論新 status,不是每個消費者自己改）

❌ **不得將 Progress 當 Spinner 用**——進度不可量化的操作一律用 Spinner,不要傳 `value={indeterminate ? ... : ...}` 假裝進度

❌ **不得堆疊多個 Progress 在同一操作**——每個操作一個 bar。多檔上傳清單 = 每檔一個 Progress,但「整體進度」不再加一條總 bar（Dropbox / Google Drive 皆此做法）

❌ **不得用於 <1 秒的短暫操作**——動畫 transition（300ms）會造成閃爍,改用 Spinner 或不顯示

❌ **不得用於未知進度**（詳見「與 Spinner 的分界」）

❌ **不得加 `warning` status**（見 Status 語意節）

❌ **不得在 Progress 內塞內容（children）**——它是純視覺,附加資訊走 `affix`

---

## 狀態與邊界

- **Disabled**：本元件無 disabled 狀態。Progress 是純視覺回饋,不接受互動事件。若整個上傳流程被禁用,由 parent container 控制（e.g. 包裝 `<fieldset disabled>` 或不 render）
- **Loading**：Progress 本身就是 loading 的視覺,不再疊加 Spinner
- **Empty / 0%**：value=0 時仍 render 整條 track（灰底 + 無填充）,不做特殊 empty state
- **Dark mode**：fill 色透過 semantic token（`--primary` / `--success` / `--error`）自動反轉,詳見 `color.spec.md`
- **Density**：本元件不隨 density 縮放（sm / md / lg 為固定 px）。Size 選擇由 consumer 依情境決定,非 density 聯動

---

## A11y

Radix `Progress.Root` 自動提供：
- `role="progressbar"`
- `aria-valuenow={value}` / `aria-valuemin={0}` / `aria-valuemax={100}`
- 如需客製 announce（e.g.「上傳中 45%」）,在 parent 傳 `aria-valuetext="上傳中 45%"` override

**Consumer 需補**：若此 Progress 代表特定語境任務,在 parent 加 `aria-label`（e.g.「檔案上傳進度」）讓螢幕閱讀器能辨認。

---

## 為何無 StateBehavior

Progress 是**純視覺百分比指示**,本身**無互動狀態**(見「狀態與邊界」段:無 disabled,不接受互動事件)。唯一的「行為」是 value 變化時 fill 寬度動畫——那是 controlled prop 的資料更新,不是 UI state 切換。color variant(primary / success / error)依 value 狀態切換的行為已在 `ColorMatrix` + 元件特有 `AffixBehavior`(percent / icon-on-complete 驅動邏輯)覆蓋。

對應 anatomy story:保留 `Overview` + `Inspector`(value 試玩) + `ColorMatrix` + `SizeMatrix` + 元件特有 `AffixBehavior`。

---

## 相關

- **Spinner 分界** — 本 spec「與 Spinner 的分界」節（SSOT）
- **FileItem 消費** — `components/FileItem/file-item.tsx`（compact mode 使用 sm、rich mode 使用 md,為 Progress 的首個實際消費者）
- **Steps** — `components/Steps/steps.spec.md`（步驟結構非百分比）
- **Skeleton** — `components/Skeleton/skeleton.spec.md`（骨架載入非進度）
- **Color tokens** — `tokens/color/color.spec.md`（`--primary` / `--success` / `--error` 定義）
