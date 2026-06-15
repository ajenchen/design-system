---
component: Combobox
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design AutoComplete: github.com/ant-design/ant-design/tree/master/components/auto-complete
  - MUI Autocomplete: github.com/mui/material-ui/tree/master/packages/mui-material/src/Autocomplete
  - Polaris Combobox: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Combobox
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Combobox 設計原則

## 定位

Combobox 是**多選下拉**的輸入與顯示元件。選中值以 Tag 陣列呈現，支援單行溢出與多行換行兩種版面。底層依裝置走兩條實作（觸控偵測自動切換）：**桌機（預設，非觸控）走自建浮層選單**（SelectMenu → Popover + Command（cmdk）），**手機 / 觸控裝置走隱藏的原生 `<select>`**（配合 Tag 疊層 overlay）。詳見「A11y 預設」段的雙路徑設計。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 Combobox 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 為唯一狀態來源(canonical 用法必同傳;型別 optional、無 runtime 強制),不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant AutoComplete / MUI Autocomplete(frontmatter benchmark)皆支援 dual-mode(`defaultValue`);我們選 controlled-only 對齊狀態一致性優先 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,目前不在 scope。

### Open-pair rationale:defaultOpen + onOpenChange,無 controlled open(2026-06-12 deep-audit R2 補)

value 軸 controlled-only;open 軸方向相反 — **uncontrolled-only**:`defaultOpen`(初始開)+ `onOpenChange`(通知 callback),無 controlled `open` prop。

**為什麼**:
- 已知需求只要「初始開 + 知道何時關」:(1) 視覺快照 — Storybook OpenSnapshot / visual-audit(M15)`defaultOpen` 一行達成;(2) DataTable cell-as-input(`DataTable/cell-registry.tsx`)— `defaultOpen` 1-step 開選單,`onOpenChange(false)` → cell exit edit mode
- open 綁內部行為:關閉自動清 search(combobox.tsx `if (!open) setSearch('')`)/ Enter / Space / ArrowDown opener + Esc dismiss / trigger 內 inline input click 開啟。controlled `open` 要 consumer 忠實 echo 每一條內部 intent,漏接任一 → 卡開 / 卡關 / search 殘留
- 世界級對照:Radix Popover([radix-ui.com/primitives/docs/components/popover](https://www.radix-ui.com/primitives/docs/components/popover))/ Ant Select([ant.design/components/select](https://ant.design/components/select))/ MUI Select([mui.com/material-ui/api/select](https://mui.com/material-ui/api/select/))皆提供 controlled `open` — 它們是泛用 primitive / library,必須支援任意 orchestration;本 DS 是 opinionated form control,無真實 consumer 需求前不為「可能性」付受控成本(Rule-of-3)

**若未來要開 controlled open**:同 value 軸引入 `useControllableState` helper + 測 controlled↔uncontrolled switch,屬 major API 擴充,目前不在 scope。

---

## 何時用

- **多選場景**（使用者可選 0 個或多個）：Tag、分類、協作成員、通知訂閱
- **選項數 6+**（少於 6 且 2-5 可見的多選，用 Checkbox stack 更有效）
- **空間受限**：Table cell、toolbar filter、窄欄位 Form
- **需要搜尋或大量選項**：searchable 後可處理 50+ 選項

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 單選 | `Select` | Combobox 永遠多選；單選場景強迫使用者每次手動清除再選新的 |
| 2-5 個選項且全部可見 | Checkbox stack（`SelectionItem` 垂直排列）| 全可見 + 掃視快 + 支援描述文字 |
| 階層結構（父/子節點）| `TreeView` | Combobox 是平面選項，沒有層級概念 |
| 布林群組（多個獨立 on/off） | 多個 `Switch` | 每個開關是獨立功能，不是「從清單選」 |

### 與 Checkbox stack 的分界

兩者都能「2-5 個選項裡多選」，判斷與 Select vs RadioGroup 同構（詳見 `../Select/select.spec.md`「與 RadioGroup 的分界」），核心三角度：

- **Progressive disclosure 成本**：Combobox 藏（多一次點擊），Checkbox stack 全露
- **視覺重量**：Combobox O(1)，Checkbox stack O(n) 每個選項各一行
- **評估深度**：Checkbox stack 適合「需要仔細讀選項 / 連帶 description」（權限授予、條款勾選），Combobox 適合「label 自帶語意、快速添加」（tag、分類）

**Fallback**：表單中法律 / 權限類多選一律 Checkbox stack（完整閱讀優先，見 `../Checkbox/checkbox.spec.md`「Clamp 政策」）；Tag / 分類 / 協作成員用 Combobox。

---

## 版面模式（`wrap` prop）

| 模式 | 行為 | 適用場景 |
|------|------|---------|
| 單行（預設） | 固定高度，溢出的 Tag 隱藏，顯示 +N 指示器 | Table cell、空間受限的 Form |
| 多行（`wrap`） | 高度隨內容展開，Tag 自然換行 | 空間充裕的 Form |

### 單行溢出

- 以量測為基礎：計算可用寬度，依序放入 Tag，放不下的隱藏
- 溢出指示器 `+N` 顯示被隱藏的數量
- Hover 溢出指示器時，popover 顯示完整的隱藏 Tag 清單

---

## Tag 操作

### 個別移除

每個 Tag 有 dismiss 按鈕（X），點擊移除該選項。

### 全部清除

`clearable` 在有值時顯示 clear all 按鈕，一次清除所有選項。位於最右側，ChevronDown 左邊。

### 新增選擇

原生 `<select>` 只顯示**未選中**的選項——已選中的不重複出現在下拉。

### Search input 最小寬度 `min-w-[60px]`（documented constant）

多選時 tag 跟 search input 共擠在 `fieldWrapperStyles` 內；input 以 `flex-1 min-w-[60px]` 確保**最少 60px 可打字空間**。低於 60px 會讓 search 輸入變得無法用（使用者看不到自己打什麼）。這是 Combobox 專用 layout 常數，非跨元件 token。

---

## readonly / disabled 的 Tag

- 沒有 dismiss 按鈕——不可操作
- ChevronDown 保留——類型身份 indicator(2026-06-10;`pointer-events-none` 不可開啟新增、readonly `fg-muted` / disabled `fg-disabled`、naked cell 依 `showDisplayEndIcon`)
- 沒有 clear 按鈕——不可清除
- 溢出行為與 edit 模式相同（+N 指示器）

---

## Loading

`loading?: boolean`(forward 給 SelectMenu SSOT,2026-05-15 audit B 補):dropdown body 內取代 options 顯 `<Empty icon={<CircularProgress size={48}/>}/>`(消費 既有 empty.spec.md「現有消費者」SelectMenu loading row SSOT)。Trigger 不變,user 隨時可開。對齊 Ant AutoComplete loading idiom。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 邊界案例

- **Disabled**:Field SSOT own(`Field/field-controls.spec.md`)。trigger / tag dismiss / 搜尋 input 全部 disabled,token 走 M24 state precedence(`text-fg-disabled`);已選 Tag 的 dismiss X 自動隱藏(見「readonly / disabled 的 Tag」段)。
- **Loading**:已 codify(見「Loading」段)。
- **Empty(no search results)**:dropdown body 內渲 SelectMenu 預設 `emptyText`「沒有符合的選項」(Combobox 不傳 `emptyText`,走 SelectMenu primitive default)。Combobox 不暴露 `creatable` / `onCreate` prop(僅 SelectMenu primitive 本身支援),故 Combobox consumer 無「建立 "xxx"」row。
- **Empty(no value selected)**:multi mode `value=[]` 時 trigger 顯 placeholder(如「請選擇」);empty state 不渲 tag 區。
- **Dark mode / density**:走 Field + SelectMenu SSOT 自動 adapt。

## 驗證時機

走 Field SSOT(`Field/form-validation.spec.md`)。Combobox 為 form control,validation 行為:

- `required` + `value=[] / null` → submit 時 trigger error,`aria-invalid="true"` + error border
- `errorMessage` prop 由 Field wrapper 顯示於下方
- multi mode 可附 `min` / `max` selected count 限制(consumer 自驗,Combobox 不獨立 own validation rules)
- Validation timing:預設 onBlur + onSubmit,onChange 不立即 validate(避免邊選邊紅)

---

## 禁止事項

- ❌ 不在已選中的選項上再顯示 dismiss 以外的互動——Tag 只能被移除，不能被編輯或重新排序
- ❌ 溢出指示器 `+N` 不可省略——使用者需要知道有多少被隱藏的項目
- ❌ 不破壞「單一鍵盤聚焦點 + 多滑鼠點擊區」雙路徑無障礙——桌機浮層選單（`role="combobox"` 容器 + 選單鍵盤導覽）與手機原生 `<select>` 各自提供完整鍵盤可達性，欄位內 `onClick` 點擊區不可加 `tabIndex` 搶 focus（見「A11y 預設」段）
- ❌ 單選場景用 Combobox——使用者每次需手動清除再選新的，改用 `Select`
- ❌ 法律 / 權限類多選用 Combobox——完整閱讀優先，改用 Checkbox stack（見 Checkbox spec「Clamp 政策」）
- ❌ 「多選就一律用 Combobox」——2-5 個選項且全可見時 Checkbox stack 更有效（掃視快 + 支援描述文字），Combobox 從 6+ 選項才開始划算（見「與 Checkbox stack 的分界」）

---

## Internal API（PeoplePicker stack wrapper 私用，end-user 勿用）

`tagWrapperClassName` / `overflowWrapperClassName` / `tagAreaGapPx` / `tagAreaPaddingLeftPx` / `visibleCountOverride` 是 Combobox overflow 量測層的內部 hook,只供 DS-internal wrapper(PeoplePicker avatar stack)用,已標 `@internal`。`tagAreaPaddingLeftPx` 目前無 active consumer(PeoplePicker 走 `!px-3` 路徑),保留供未來精準 padding 但新 consumer 請先評估。`overflowShape` 是 public typed enum(矩形/圓形 +N),不在此列。

---

## A11y 預設

### 鍵盤可達性的雙路徑設計

Combobox 依裝置走兩條不同實作（觸控偵測自動切換）：

**桌機（預設，非觸控裝置）**:觸發區是一個 `role="combobox"` 的容器（`aria-expanded` / `aria-controls` 指向選單 / `tabIndex={0}` 可 tab 聚焦），開啟後是一個浮層選單（內含搜尋 + 選項清單）。鍵盤路徑：Tab 聚焦觸發區，方向鍵在選項間移動，Enter 選取，Esc 關閉——由選單元件的鍵盤導覽負責，**不是**原生 `<select>`。

**手機 / 觸控裝置**:改用隱藏的原生 `<select>`（tab-focusable，方向鍵導覽，原生 picker），以保留行動裝置 screen reader / 語音輸入 / OS-level 整合。有值時這個 `<select>` 以全幅透明 overlay 蓋住整個欄位，點擊任何位置都會喚起原生 picker。

兩條路徑共通點：欄位內多個 `<div>` / `<Tag>` 上的 `onClick` 是 mouse 優化的點擊區，**不是鍵盤介面**——鍵盤使用者不經過它們，但兩條路徑都已各自提供完整鍵盤可達性。

**為什麼這些 click target 不加 `role="button" tabIndex`**: 若每個點擊區都加 `tabIndex={0}` 會搶走真正聚焦目標（桌機的 combobox 容器 / 手機的原生 select）的 tab focus，反而破壞鍵盤體驗。「單一鍵盤聚焦點 + 多個滑鼠點擊區」是混合型控制項的世界級 canonical pattern（Material / Atlassian / GitHub issue filter 共識）。

**結論**: Combobox 多處 `onClick` 在非 button 元素上**是經過評估的 acceptable a11y 模式**,不是需要修復的 bug。

---

## 相關

- `../Select/select.spec.md` — 單選對應元件；「與 RadioGroup 的分界」是 Combobox vs Checkbox stack 的 framework 來源
- `../Checkbox/checkbox.spec.md` — Checkbox stack（多選全可見場景）
- `../TreeView/tree-view.spec.md` — 階層式選擇
- `../Switch/switch.spec.md` — 布林開關群組
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `checkbox.spec.md`
- `overflow-indicator.spec.md`
- `people-picker.spec.md`
- `select-menu.spec.md`
- `select.spec.md`
- `tag.spec.md`
