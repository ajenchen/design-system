---
component: Select
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Select 設計原則

## 定位

Select 是**單選下拉的表單 control**——從 3+ 選項中挑恰好一個，選項收在 dropdown 內展開。底層走原生 `<select>`，透過 CSS 客製視覺。

共用規則見 `field-controls.spec.md`。本文件只記錄 Select 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker / Material MUI Select 皆支援 dual-mode;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

---

## 何時用

- **表單中節省垂直空間**：create user 的 role、profile settings 的 timezone、product form 的 category
- **Toolbar / filter 的選擇**：table 上方的 category filter、sort by、狀態篩選
- **Table cell 的 inline edit**：Jira-style task 的 status / priority / assignee（見下文「即時 vs on-submit」）
- **選項 label 自帶語意**：國家、類別、時區——使用者看 label 就知道要選什麼，不需要額外 description
- **選項 10+ 且不需搜尋**：時區、國家這類使用者熟悉的清單，依賴 native select 的 type-to-jump 快速定位

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 2-5 個選項且選擇是「決策節點」 | `RadioGroup` | 使用者需要看到全部選項比較——見下「與 RadioGroup 的分界」 |
| 2-5 個緊湊切換（filter / view mode） | `SegmentedControl` | 更 compact，跟 Button / Input 並排不違和。詳見 `segmented-control.spec.md` |
| 選項需要多行描述或圖文並列 | `RadioGroup` | Select option 是單行純文字，無法承載複雜排版 |
| 多選 | `Combobox` | Select 永遠單選 |
| 布林切換（on / off） | `Switch` | 布林不需要「選一個」的心智模型 |

---

## 與 RadioGroup 的分界

兩者都能「從 N 個選項中挑一個」，在 2-5 個選項的範圍內常被誤用互換。判斷**不是數量**，而是以下三個角度——**任何一個明確傾向哪邊就選哪邊**：

### 1. Progressive disclosure 成本

- **Select**：選項隱藏，使用者多一次點擊才看到。適合「label 本身就夠清楚」的場景（國家、類別、角色）——使用者已經知道自己要選什麼，只是需要一個 picker
- **RadioGroup**：全部選項一次可見。適合「使用者需要看完所有選項才能決定」——付款方式、訂閱方案、票種，選擇本身是決策動作

### 2. 視覺重量

- **Select**：O(1)——永遠佔 field height 一格空間，無論 3 個或 300 個選項
- **RadioGroup**：O(n)——每個選項各佔一行（block 模式），總高度隨選項數線性增加。超過 5 個 option 會開始主導 form 的視覺節奏

### 3. 評估深度

- **Select**：使用者已經知道要選什麼，label 只是確認。例：我知道我要選「Electronics」，dropdown 只是找到它的工具
- **RadioGroup**：使用者需要仔細讀每個選項的 label（有時連帶 description 比較價格 / 權限 / 時長），評估才做選擇

### Fallback heuristic

- **表單中要節省垂直空間 / label 自帶語意 / 使用者熟悉選項 → Select**
- **選擇本身是決策節點（使用者需要對比評估） → RadioGroup**
- **灰色地帶時，問：「使用者看一眼 label 就能下決定嗎？」** 能 → Select；不能、需要閱讀 → RadioGroup

### 情境對照表

| 場景 | 選哪個 | 原因 |
|------|-------|------|
| 國家 / 時區選擇 | Select（可配 searchable） | label 自帶語意、使用者熟悉、選項數多 |
| Table cell 的 status 切換 | Select | 空間受限、使用者熟悉 status 名 |
| 類別（Electronics / Furniture / Food）| Select 或 RadioGroup | 看容器空間；3-4 個且在 form 中傾向 RadioGroup |
| **付款方式**（信用卡 / 轉帳 / 現金）| RadioGroup | 決策節點、通常連帶手續費或處理時間 description |
| **訂閱方案**（Basic / Pro / Enterprise）| RadioGroup | 決策節點、通常連帶價格比較與 feature list |
| **票種**（成人 / 兒童 / 敬老）| RadioGroup | 決策節點、通常連帶價格 |
| 使用者角色（Admin / Editor / Viewer）| Select 或 RadioGroup | 新手用 RadioGroup（要解釋權限）、熟悉使用者 Select |
| 時區選擇 | Select + searchable | 選項 > 100 個、使用者記得時區名 |

**本節是 Select vs RadioGroup 的 SSOT**，`radio-group.spec.md` 和 `checkbox.spec.md` 點回本節，不重複書寫。

---

## 即時 vs on-submit

Select 的值套用時機是**由 onChange handler 的副作用決定**，不是 Select 本身的屬性——兩種場景都是正當用法：

### 即時套用（change → API）

選值一變就直接觸發外部動作，不經 form submit：

- **Jira-style view/edit**：task 的 status / priority / assignee 欄位，改了立刻寫回 DB
- **篩選器**：table 上方的 category / status filter，改了立刻篩 table
- **即時設定**：notification preference、theme dropdown
- **URL param 綁定**：改 value 立刻 push URL（deep-linkable）

這類場景的 onChange 通常呼叫 mutation / API / setState 更新父層。**沒有「取消」的概念**——改了就是改了。

### 隨 form 送出（change → local state → submit）

選值先寫進 local state，等 form submit 才套用：

- **建立 / 編輯表單**：create project 裡的 type、edit user 的 role
- **對話框設定**：dialog 內的選項，按確認才生效
- **精靈流程**：多步驟表單的中間選擇

這類場景 onChange 只更新 React state，直到 submit handler 才送出。**有「取消」可回復**。

### 設計規則

- 即時場景：用 `aria-label` 或旁邊的 label 明確告知「這個改了會立刻套用」
- on-submit 場景：搭配 `<Field>` 容器 + submit button，使用者清楚哪個動作觸發儲存
- **不要讓使用者搞不清楚是哪種**——這是 DS 最常見的信任破壞點

---

## Searchable 開啟判斷

`searchable` 啟用後 field 變 input，打字即篩選 options。判斷依以下順序：

### 主判準：label 性質

- ✅ **需要 searchable**：label 是獨特關鍵字 / 代碼 / 非自然語言，使用者**無法靠捲動快速定位**
  - 產品代碼：`SKU-4837`、`ORDER-2024-001`
  - 郵遞區號、機場代碼（TPE / NRT / JFK）
  - 使用者 ID、專案 slug、ticket number
  - 中文姓名（同姓大量集中，字母跳不動）
- ❌ **不需要 searchable**：label 是流暢自然語言、品類名稱，native select 的 type-to-jump 就夠用
  - `Electronics`、`Furniture`、`Food`
  - `Draft` / `In progress` / `Done`
  - 國家英文名（按首字母跳夠快）

### 次要啟發：選項數量

數量只是啟發，主判準永遠是 label 性質。

- **< 10** + 自然語言 label → 不開
- **10-50** → 往搜尋傾斜（但仍看 label 性質）
- **> 50** → 幾乎必開

### 為什麼不用純數量 threshold

- 100 個 `a` / `b` / `c` / ... 不需要搜尋（native type-to-jump 直達）
- 5 個 `SKU-4837` / `SKU-8210` / ... 需要搜尋（使用者記不起哪個代碼對應哪個產品）

純量化規則會誤判這兩端。label 性質是唯一可靠的主判準。

---

## 顯示模式（`display` prop）

| 模式 | 何時使用 |
|------|---------|
| `plain`（預設） | 選項語意靠文字表達（類別、國家、角色） |
| `tag` | 選項有色彩語意，顏色加速掃視（狀態：紅黃綠） |

**命名 rationale**(2026-05-01 從 `'text'` 改 `'plain'`):跨元件 prop value 衝突防避 — `Button variant="text"` 表「無 chrome 文字按鈕」,跟 Select.display 的「純文字呈現」是兩個不同概念,共用 `'text'` 字面值會造成 consumer 認知衝突(命名三 test 第 3 條)。改 `'plain'` 後語意專屬:plain = 樸素文字呈現,對立 tag = 用 Tag 元件呈現。

### plain 模式

- 原生 select 純文字 + ChevronDown
- 可搭配 `startIcon`——代表 value 的圖示（如狀態 icon），不是裝飾
- startIcon 的語意是「描述目前選中的值」，不是「描述這個 field 的用途」

### tag 模式

- Tag 元件呈現選中值 + 隱藏的原生 select overlay
- Tag 設為 `pointer-events-none`，點擊穿透到底層 select
- edit 模式：Tag + ChevronDown + 可選 clear
- readonly / disabled：Tag 只顯示，無 ChevronDown

---

## Clearable

`clearable` 在有值時顯示 clear 按鈕。

- Clear 按鈕在 ChevronDown 左側
- 清除後回到 placeholder 狀態
- 只在 edit 模式顯示

**何時開 clearable**：
- 「無選擇」是有效狀態（選填欄位、可清除的 filter）→ 開
- 必須有選擇（每個項目都必須有 status）→ 不開

---

## 常見誤解

**誤解**：「Select 只用於表單送出，即時套用應該用別的元件」。
**事實**：Select 的表單送出與即時套用都是正當用法。Jira、Linear、Notion 的 inline status dropdown 都是 Select + 即時 onChange。關鍵是 onChange 的副作用清楚，不是 Select 本身。

**誤解**：「3-5 個選項一定要用 RadioGroup」。
**事實**：看容器與決策性質，不看數量。Toolbar 的 3 個 filter 必須是 Select / SegmentedControl（RadioGroup 不符 toolbar 視覺）；form 中 3 個付款方式用 RadioGroup（決策節點）。見「與 RadioGroup 的分界」。

**誤解**：「選項超過 N 個一定要開 searchable」。
**事實**：主判準是 label 性質，不是數量。見「Searchable 開啟判斷」。

---

## 禁止事項

- ❌ `startIcon` 不可用於 tag 模式——Tag 本身已有視覺標記，startIcon 是冗餘的
- ❌ 不自建 dropdown menu——使用原生 `<select>` 保證無障礙和行動裝置體驗
- ❌ 讓使用者搞不清楚是即時還是 on-submit——用 label / 按鈕位置明確傳達
- ❌ 把「決策節點」選擇塞進 Select（付款方式、訂閱方案）——使用者需要對比評估，用 RadioGroup

---

## 為何無 StateBehavior

Select 是 **Field Controls family 成員**——互動狀態(focus / invalid / disabled / readonly)完全繼承 `../Field/field-controls.spec.md` SSOT「Mode 狀態」。dropdown 開啟時的 MenuItem hover / selected 狀態由 MenuItem primitive own(`patterns/element-anatomy/item-anatomy.spec.md`)。Select 層級無自有 state 行為。重寫 StateBehavior = 複製 Field Controls + MenuItem SSOT 內容,雙邊漂移風險。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix` + `SizeMatrix`。Field-level state 見 Input `StateBehavior` + field-controls.spec.md;item-level state 見 MenuItem `ColorMatrix`。

---

## 相關

- `segmented-control.spec.md` — 2-5 個緊湊互斥切換；「何時不用」的主要去處
- `../Checkbox/checkbox.spec.md`（含 RadioGroup 設計原則）— RadioGroup 共用規則
- `combobox.spec.md` — 多選的對應元件
- `../Switch/switch.spec.md` — 布林切換
- `../Field/field-controls.spec.md` — Select 作為 Field control 時的共用規則（mode、size、endAction）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `people-picker.spec.md`
- `select-menu.spec.md`
