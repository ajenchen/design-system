---
component: Command
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInternal
benchmark:
  - cmdk (shadcn Command base): github.com/pacocoursey/cmdk
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Command 設計原則

## 定位

Command 是**搜尋 + 鍵盤導覽的指令清單**——提供搜尋框、分組選項、鍵盤導覽、空狀態。多用於浮層選單內部（SelectMenu）或 Command Palette（Cmd+K）。

**實作基礎**：shadcn passthrough——基於 cmdk + Radix Dialog（Command Palette 模式）。本 DS 保留 shadcn 原結構,視覺樣式以 inline Tailwind class 直接掛在 cmdk primitive 上（`command.tsx`），token 值對齊（非結構繼承）MenuItem / Input / Empty 的 canonical token——改 MenuItem 不會自動連動 Command。

**分類**：Internal primitive——由 SelectMenu 消費（Select / Combobox / PeoplePicker 透過 SelectMenu 使用）。App 不直接使用 Command;若要 Command Palette 類 UX,用本檔 export 的 `CommandDialog`(cmdk + Radix Dialog 包裝,showcase「CommandPalette」story 消費)。

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

兩者底層都消費 Command。Field 場景用 SelectMenu（已處理 input binding）；非 Field 場景(Cmd+K)用 `CommandDialog`(cmdk + Radix Dialog 包裝)。

---

## 禁止事項

- ❌ **不在短選單（< 6 項）用 Command**：多此一舉增加認知負擔,改用 DropdownMenu 或 RadioGroup
- ❌ **Command 不當 form input**：它是選值浮層而非輸入框——表單內選值請用 Select / Combobox,它們會自動決定是否啟用 Command 模式
- ❌ **Command 搜尋框不是 Field Control**：不對齊 Field size token（不配對 `--field-height-md`）——它是浮層內的搜尋輸入,走 Command 自身的尺寸規格
- ⚠️ **Inline 嵌頁面 = 次要用法,必須自帶邊框容器**(2026-06-12 user 拍板放寬,原為全面禁止):主用法仍是浮層(SelectMenu 內部 / CommandDialog Cmd+K)——實際產品幾乎都走浮層形態。Inline 嵌頁面是原廠 documented 用法(cmdk README「Render this to show the command menu inline」;shadcn 預設範例即 inline 且包 `rounded-lg border`),允許但**必須自己包有邊框的容器**(rounded + border,對齊 shadcn 同款),且不可拿來替代 SelectMenu / Select(表單選值仍走它們)

---

## A11y 預設

cmdk 自動處理：

- **List 語意**：`role="listbox"` + `aria-activedescendant` 指向目前 highlight 項
- **搜尋框**：`role="combobox"` + `aria-expanded` / `aria-controls` 指向 list
- **鍵盤導覽**：cmdk 提供 ↑ / ↓ 移動 highlight、Enter 選取（另支援 vim-style Ctrl+n/p/j/k、Home/End）。cmdk 本身無 Esc handler — Esc 關閉僅在 `CommandDialog`(Cmd+K)模式由 Radix Dialog 的 DismissableLayer 提供;inline `<Command>` 模式按 Esc 無反應
- **空狀態**：`<CommandEmpty>` 自動帶 `role="presentation"`,不干擾 screen reader 的 list 朗讀

Consumer 無需額外處理 a11y,保留 cmdk 原結構 + 使用 `<CommandInput>` / `<CommandList>` / `<CommandItem>` 即可。

---

## 邊界案例

- **Disabled item**:`<CommandItem disabled>` 透過 cmdk 內建支援,視覺繼承 MenuItem SSOT(`text-fg-disabled` + `aria-disabled=true` + 鍵盤導覽自動 skip + Enter 不觸發 onSelect)。skip 是「不進導覽清單」(cmdk `:not([aria-disabled="true"])` selector)— ↑/↓ 直接跳到下一個可選項,無中途 highlight。
- **Group heading 不可選中**:heading 是 `aria-hidden` 裝飾 div(group container `role="presentation"`),不參與導覽與選取;SR 經 items wrapper `role="group"` + `aria-labelledby` 取得群組語意。
- **Empty 後持續打字**:cmdk 每個 keystroke 重新過濾(`filtered.count` 驅動),`<CommandEmpty>` 持續顯示直到有 match;input 不鎖、不清空。
- **Loading**:Command 本身非 async surface。async option fetch 應由 consumer(SelectMenu / Cmd+K palette)在外層處理 — 將 `<CommandList>` body 切換為 `<Empty icon={<CircularProgress size={48}/>}/>`(對齊 `empty.spec.md`「現有消費者」SelectMenu loading row SSOT,禁止事項見其「禁止事項」loading 條)。Command primitive 不獨立 own loading prop。
- **Empty(no results)**:`<CommandEmpty>` 自動偵測 search filter result = 0 時渲;consumer 必傳 fallback 文案(預設 cmdk 不渲)。
- **Dark mode / density**:Command 的 inline Tailwind class 直接消費 semantic token（`bg-neutral-hover` / `text-fg-muted` / `text-fg-disabled` 等），token 在 dark mode 自動切值——非透過 MenuItem / Input / Empty primitive 連動。density 不獨立 own（由 consumer SelectMenu 控）。

---

## 常見誤解

- 「選單一律用 Command」— < 6 項、選完即觸發動作的操作選單是 `DropdownMenu`(見「與 DropdownMenu 的分界」)。
- 「Command 搜尋框是 Field control」— 不對齊 `--field-height-*`(見「禁止事項」)。
- 「cmdk `data-selected` = 持續選中態」— 它是鍵盤 / 指標的臨時 roving highlight,故用 `bg-neutral-hover` 而非 `bg-neutral-selected`(見「為何無 StateBehavior」)。

---

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

Command 是 **internal primitive**(SelectMenu 底層消費,app 不直接使用,見本 spec「分類」段),視覺 token 對齊既有 primitive 的 canonical 值（inline 寫在 `command.tsx`,非結構消費 primitive):

- **無 Inspector**:Command 無自己的決策性 prop(variant / size / severity),behavior 全部由 cmdk library 處理。該讓消費者 inspect 的是 **SelectMenu**(公開消費入口),不是 Command 本身。
- **無 ColorMatrix**:Command 的視覺(`CommandItem` / `CommandGroup` / `CommandInput`;`CommandEmpty` 為純 className passthrough 無自帶 class)以 inline Tailwind class 直接消費 semantic token(`bg-neutral-hover` / `text-fg-muted` / `text-fg-disabled` 等,token 值對齊 MenuItem row / Input field 的 canonical 用法),無自己的色彩決策——色彩漂移由 token layer 控制(改 token 連動,改 MenuItem 不連動)。
- **無 SizeMatrix**:Command 搜尋框與 list items 的尺寸由 **Menu block tier**(consumer SelectMenu 決定 compact / reading),Command 自身無 size prop(見本 spec「禁止事項」:Command 搜尋框不對齊 Field size token)。
- **無 StateBehavior**:Command item 的 highlight / disabled 由 cmdk 的 `data-[selected]` / `data-[disabled]` attribute 觸發,樣式 inline 寫在 `command.tsx`(`data-[selected='true']:bg-neutral-hover` / `data-[disabled=true]:text-fg-disabled`)。**注意 cmdk `data-selected` 是「鍵盤 / 指標當前 active-highlight」(roving 臨時反白)而非 item-anatomy 的「持續選中態(persistent selected)」**,故刻意用 `bg-neutral-hover`(hover 色)而**非** `item-anatomy.spec.md` 的 `bg-neutral-selected`——對齊 VS Code / Raycast command palette 的臨時 highlight 慣例。Command 層級僅處理 search 過濾與鍵盤導覽,那是 cmdk behavior 不是視覺 state。

對應 anatomy story:保留 `Overview`(展示 internal primitive 的 API surface——CommandInput / CommandList / CommandGroup / CommandItem / CommandEmpty)。深度視覺 / 尺寸對照請查 SelectMenu(consumer)與 MenuItem(item primitive)的 anatomy。

---

## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家世界級對照),「禁短選單用 Command」+「禁直接 app 使用」是本 spec 的 binary strict rule,以下為支撐 rationale。

### Cmd-K palette 結構哲學

| 維度 | 本 DS | Linear | Raycast | VS Code Quick Pick | macOS Spotlight | Notion Cmd+K | Slack Cmd+K |
|------|-------|--------|---------|--------------------|-----------------|--------------|--------------|
| Layout | **單欄 + grouped sections** | 單欄 + group | 單欄 + group + secondary action panel | 單欄 + multi-mode prefix(`> ` 命令 / `: ` 行)| 全螢幕 + multi-pane(blur background)| 單欄 + inline page preview | 單欄 + 切 tab(Search / Nav / Settings)|
| Search input 位置 | **頂端** always visible | 頂端 always | 頂端 always | 頂端 always | 中央 hero | 頂端 always | 頂端 always |
| 視覺 surface | Dialog overlay(`CommandDialog`)| Popover overlay | Standalone window | inline overlay(top-center)| Full-screen(blur)| Popover overlay | Popover overlay |
| 觸發 shortcut | **Cmd+K**(Apple)/ Ctrl+K(Windows) | Cmd+K | Hotkey(default Option+Space)| Cmd+P / Cmd+Shift+P | Cmd+Space | Cmd+P / Cmd+/ | Cmd+K |
| Empty state | `<CommandEmpty>` + 文案 | inline 「No results」 | inline 「No matching commands」 | inline 「No results」 | hides list | inline 「No results」 | inline 「No matches」 |
| 多 mode | 無(單一搜尋語意)| 無(單一)| 無 | 有(prefix mode `>` `:` `@`)| 有(隱式 routing)| 無 | 有(tab)|

### Primitive vs Consumer 分層

| DS | 本 DS | cmdk lib | Radix UI | shadcn/ui | Material UI |
|----|-------|----------|----------|-----------|--------------|
| Internal primitive 命名 | **Command** | cmdk | (無此 primitive,用 `<Combobox>` + filter)| Command | `<Autocomplete>` 一體 |
| Consumer wrapper 命名 | SelectMenu / Popover+Command(Cmd+K) | (consumer 自包)| Combobox | Combobox / Custom Cmd+K | Autocomplete |
| 是否 app 直接用 | **禁(必透過 SelectMenu / Popover wrapper)**| 開放 | 開放 | 開放 | 開放 |

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) 單欄 + grouped sections(non-multi-pane)— 對齊 Linear / Raycast / VS Code / Notion 多家共識** <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

macOS Spotlight 的 multi-pane / blur background 適合 system-level launcher(全 OS 範圍 routing),但 disruptive — 不適合 inline 元件場景(SelectMenu 內嵌 Cmd-K 模式)。Linear / Raycast / VS Code 共識「單欄 + group」適合 productivity tool 內嵌使用,且 cmdk lib(shadcn/Vercel)default 結構符合此哲學。

捨棄 multi-pane 的代價是「無 inline preview 直觀度」(Spotlight 可預覽檔案內容),但 DS 場景是命令清單非檔案 browser,接受。

**(2) Search input always visible at top — 對齊 Linear / Raycast / Notion / VS Code 共識** <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

input always visible 提示使用者「這是 search-driven」,對齊 input-first mental model。捨「only on focus 才出現 input」(節省垂直空間)的代價是「無法 list 看完再搜尋」,但 Cmd-K 場景 default 預期 search,不是 list browse。

**(3) Cmd+K(Apple)/ Ctrl+K(Windows)為觸發 shortcut — 對齊 Linear / Notion / Vercel / Slack / GitHub 共識** <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

Cmd-K 已成 productivity tool 的 universal idiom(Linear 推廣後 Notion / Vercel / Stripe / Slack 統一),使用者跨 app 預期一致。捨棄 Raycast 的 Option+Space(global launcher conflict)/ Spotlight Cmd+Space(macOS 內建衝突)/ VS Code Cmd+P(file-only,跟 Cmd+Shift+P 命令分流)的差異化代價接受 — 對齊主流 idiom 比差異化重要。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**(4) Internal primitive 哲學 — app 不直接用 Command,必透過 SelectMenu / Popover+Command wrapper**

cmdk / shadcn / Radix 默認開放 app 直接消費 primitive — 但本 DS 走 Material `<Autocomplete>` 一體 / Polaris 一體封裝哲學,把 search + popover + value-binding 包進 SelectMenu(form context)或 Popover+Command wrapper(global Cmd+K)。

捨棄「app code 直接 import Command 客製」的代價是「自由度受限」(無法在 app 內客製 cmdk filter logic),但 DS 一致性更重要 — 若 SelectMenu / Popover+Command 不夠用,回 DS 開新 wrapper 而不是繞過抽象層(對齊 SSOT 消費 canonical M1)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 相關

- `../SelectMenu/select-menu.spec.md` — 主要消費者（Select / Combobox / PeoplePicker 的 searchable 浮層）
- `../DropdownMenu/dropdown-menu.spec.md` — 不需搜尋的操作選單
- `../Dialog/dialog.spec.md` — Command Palette 的浮層容器(`CommandDialog` 內部 wrap Radix Dialog)
- cmdk library — 底層搜尋與鍵盤導覽實作
