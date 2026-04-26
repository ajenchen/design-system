---
component: Command
family: null
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInternal
---

# Command 設計原則

## 定位

Command 是**搜尋 + 鍵盤導覽的指令清單**——提供搜尋框、分組選項、鍵盤導覽、空狀態。多用於浮層選單內部（SelectMenu）或 Command Palette（Cmd+K）。

**實作基礎**：shadcn passthrough——基於 cmdk + Radix Dialog（Command Palette 模式）。本 DS 保留 shadcn 原結構 + 橋接 DS token 和 Empty / MenuItem primitive。

**分類**：Internal primitive——由 SelectMenu 消費（Select / Combobox / PeoplePicker 透過 SelectMenu 使用）。App 不直接使用 Command；若要 Command Palette 類 UX,組合 Popover + Command 即可。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **SelectMenu 內部搜尋**：Select / Combobox / PeoplePicker 的 searchable 模式底層
- **Command Palette（Cmd+K）**：全局跨頁搜尋、快速動作入口
- **需要搜尋過濾 + 鍵盤導覽的選項清單**

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 不需要搜尋的短選項清單（< 6 項）| `DropdownMenu` | DropdownMenu 是操作選單，不含搜尋 |
| 表單內的單選下拉 | `Select` | Select 自動判斷是否切到 SelectMenu 模式 |
| 表單內的多選下拉 | `Combobox` | 同上 |
| 人員選擇 | `PeoplePicker` | 專用人員選擇器（內部會消費 Command）|

---

## 消費者

Command 通常由 `SelectMenu` 或自訂 Command Palette 元件消費——直接使用 Command 很少見，除非建立全新的搜尋清單 UI。

---

## 與 DropdownMenu 的分界

**本節是 SSOT**——DropdownMenu / SelectMenu spec 反向引用此節。

- **DropdownMenu**：**操作選單**——選完觸發動作（複製 / 刪除 / 匯出），選單關閉，選項通常 < 10 項
- **Command**：**搜尋選值**——有 search input + 大量選項導覽，適合超過 10 項或需要鍵盤搜尋過濾的場景

**判斷法**：問「選項數量 > 10 且使用者需要搜尋嗎？」

- 是 → **Command / SelectMenu**
- 否（少量、固定清單） → **DropdownMenu**

## 與 SelectMenu 的分界

- **SelectMenu**：Select / Combobox / PeoplePicker 的 searchable 浮層（**由 Field 觸發**,帶有 input field + 選中值回填）
- **獨立 Command Palette**（Cmd+K）：也用 Command 但**不在 Field 觸發**——透過全域快捷鍵開啟,用於跨頁面搜尋 / 快速動作入口

兩者底層都消費 Command。Field 場景用 SelectMenu（已處理 input binding）；非 Field 場景（Cmd+K）自組 Popover + Command。

---

## 禁止事項

- ❌ **不在短選單（< 6 項）用 Command**：多此一舉增加認知負擔,改用 DropdownMenu 或 RadioGroup
- ❌ **Command 不當 form input**：它是選值浮層而非輸入框——表單內選值請用 Select / Combobox,它們會自動決定是否啟用 Command 模式
- ❌ **Command 搜尋框不是 Field Control**：不對齊 Field size token（不配對 `--field-height-md`）——它是浮層內的搜尋輸入,走 Command 自身的尺寸規格
- ❌ **不把 Command 直接貼進頁面**：Command 是浮層內容,必須搭配 Popover / Dialog container——若要 inline 搜尋清單用 Input + 自訂 list

---

## A11y 預設

cmdk 自動處理：

- **List 語意**：`role="listbox"` + `aria-activedescendant` 指向目前 highlight 項
- **搜尋框**：`role="combobox"` + `aria-expanded` / `aria-controls` 指向 list
- **鍵盤導覽**：↑ / ↓ 移動 highlight、Enter 選取、Esc 關閉（或清空搜尋）
- **空狀態**：`<CommandEmpty>` 自動帶 `role="presentation"`,不干擾 screen reader 的 list 朗讀

Consumer 無需額外處理 a11y,保留 cmdk 原結構 + 使用 `<CommandInput>` / `<CommandList>` / `<CommandItem>` 即可。

---

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

Command 是 **internal primitive**(SelectMenu 底層消費,app 不直接使用,見本 spec「分類」段),結構規格完全繼承既有 primitive:

- **無 Inspector**:Command 無自己的決策性 prop(variant / size / severity),behavior 全部由 cmdk library 處理。該讓消費者 inspect 的是 **SelectMenu**(公開消費入口),不是 Command 本身。
- **無 ColorMatrix**:Command 的視覺(`CommandItem` / `CommandGroup` / `CommandInput` / `CommandEmpty`)全部繼承既有 DS primitive 的 token(MenuItem row / Input field / Empty layout),無自己的色彩決策——色彩漂移由 primitive layer 控制。
- **無 SizeMatrix**:Command 搜尋框與 list items 的尺寸由 **Menu block tier**(consumer SelectMenu 決定 compact / reading),Command 自身無 size prop(見本 spec「禁止事項」:Command 搜尋框不對齊 Field size token)。
- **無 StateBehavior**:Command item 的 selected / hover / disabled 走 MenuItem primitive state(`patterns/element-anatomy/item-anatomy.spec.md`);Command 層級僅處理 search 過濾與鍵盤導覽,那是 cmdk behavior 不是視覺 state。

對應 anatomy story:保留 `Overview`(展示 internal primitive 的 API surface——CommandInput / CommandList / CommandGroup / CommandItem / CommandEmpty)。深度視覺 / 尺寸對照請查 SelectMenu(consumer)與 MenuItem(item primitive)的 anatomy。

---

## 相關

- `../SelectMenu/select-menu.spec.md` — 主要消費者（Select / Combobox / PeoplePicker 的 searchable 浮層）
- `../DropdownMenu/dropdown-menu.spec.md` — 不需搜尋的操作選單
- `../Popover/popover.spec.md` — Command Palette 的浮層容器
- cmdk library — 底層搜尋與鍵盤導覽實作
