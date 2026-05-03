---
component: SelectMenu
family: 4
variants: {}
sizes: {}
traits:
  - isInputLike
  - isInternal
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# SelectMenu 設計原則

## 定位

SelectMenu 是 **Popover + Command 組成的完整下拉選單浮層**——提供搜尋 + 鍵盤導覽 + 分組 + 可建立新選項，作為**選值類**元件的 internal primitive（不直接使用）。

**實作基礎**：基於 cmdk（搜尋 / 鍵盤導覽）+ shadcn Popover（浮動容器）+ 消費 MenuItem primitive（item 佈局）。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker / Material MUI Select 皆支援 dual-mode;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

---

## 何時用 / 何時不用

**SelectMenu 是 internal primitive**——不直接使用，透過外層選值元件消費。

| 場景 | 正確做法 |
|------|---------|
| 人員選擇器（搜尋 + Avatar）| 用 `PeoplePicker`（內部消費 SelectMenu）|
| 大量選項單選 + 搜尋 | 用 `Select` with `searchable`（內部會切換到 SelectMenu 模式）|
| 大量選項多選 + 搜尋 | 用 `Combobox` with `searchable`（內部會切換到 SelectMenu 模式）|
| 可建立新選項（creatable tag）| 用 `Combobox` + `creatable` prop |
| 直接在 JSX 中用 `<SelectMenu>` | ❌ **禁止**——失去外層 Select / Combobox / PeoplePicker 的 Field 整合、trigger 行為、state 管理 |

### 消費者

- `../PeoplePicker/people-picker.tsx` — 人員選擇（永遠 searchable）
- `../Select/select.tsx` — `searchable` 模式會切換到 SelectMenu 浮層
- `../Combobox/combobox.tsx` — `searchable` 模式會切換到 SelectMenu 浮層

---

## 架構

```
Popover（浮動容器，handle 展開 / 定位）
  └─ Command（cmdk — 搜尋 + 鍵盤導覽）
       ├─ CommandInput（搜尋框，選項 > 5 時顯示）
       ├─ CommandList（捲動區）
       │    └─ CommandGroup（分組標題）
       │         └─ MenuItem（選項 row，消費 item-layout）
       └─ Footer（多選全選 checkbox，選填）
```

**定位**:SelectMenu 的 `sideOffset` 與 `align` 直接走 Popover canonical——`sideOffset=8` / `align` 跟隨 trigger 位置(見 `../Popover/popover.spec.md`「Align 對齊 canonical(跨浮層 SSOT)」)。SelectMenu 不自訂浮層定位規則。

**視覺 vs 語意**(2026-04-20 精緻化):SelectMenu 的 **width 預設跟 trigger(input)同寬**(Radix trigger-width),此時 `start` / `center` / `end` 三種 align 呈現視覺完全相同(popover 正好跟 input 貼合,左右邊緣對齊無差異)。但當 consumer 傳 `minWidth` 大於 input 寬度(例:長 option label 要空間展示)、或 option 內容撐開導致 popover 寬於 trigger,**align 的視覺差異立刻顯現**——此時嚴格照 structured overlay canonical(trigger 在左 → start / 中 → center / 右 → end)。

換言之 SelectMenu **永遠照 canonical**,只是大多數情況 width=trigger-width 讓 canonical 視覺上被 mask,一旦 popover 突破 trigger 寬度 canonical 立刻生效。規則沒例外,只是呈現條件。

---

## 單選 vs 多選

透過 `value` / `onValueChange` 的類型決定：

- **單選**：`value: string | null`，選中後立即關閉浮層
- **多選**：`value: string[]`，選中不關閉，可繼續選（footer 可顯示全選 checkbox）

---

## Creatable（建立新選項）

透過 `onCreate` prop 啟用。搜尋無結果時顯示「建立 "xxx"」提示（`Plus` icon + 使用者輸入的字）。

**何時啟用**：
- Tag input 允許使用者建立新 tag
- Assignee 選擇允許邀請外部人員
- Label / category 自由建立

**何時不啟用**：
- 固定選項清單（狀態、類別、角色）
- 需要後端驗證合法性的 value（避免建立無效選項）

---

## 分組（group）

透過 `groups` prop 定義分組標籤，每個 option 的 `group` 欄位指向 group key。

**何時使用**：
- 選項明顯分兩個以上邏輯群組（「Recent」/「All」、「Your team」/「Others」）
- 超過 10 個選項需要視覺分區降低認知負擔

**何時不用**：
- 選項少於 6 個（分組反而增加視覺雜訊）
- 選項本質平行（沒有自然分組）

---

## Empty state

搜尋無結果時顯示 `Empty` 元件，可透過 `emptyText` 自訂訊息（預設「無符合的選項」）。

- **Creatable 時**：即使搜尋無結果，仍顯示「建立 "xxx"」讓使用者補建選項
- **非 creatable**：顯示 emptyText 提示使用者修改搜尋詞

---

## 禁止事項

- ❌ 直接在 JSX 用 `<SelectMenu>`——透過外層元件（Select / Combobox / PeoplePicker）消費
- ❌ 跳過 SelectMenu 自建 Popover + Command 組合——會漂移出共用 layout 與 item-layout 規則
- ❌ 不搭配 trigger / field 使用——SelectMenu 是浮層，一定需要觸發元件
- ❌ 超過 50 個選項不開搜尋——純捲動會變低效
- ❌ 分組少於 2 組——分組本身是視覺成本，只有一組等於沒分組

---

## 為何無 ColorMatrix

SelectMenu 是**多區塊 composite primitive**,不擁有獨立色彩決策:

- **無 ColorMatrix**:視覺完全繼承既有 DS primitive 的 token(`MenuItem` row / `Command` search / `Empty` layout / `Popover` surface),無自己的 bg / border / hover 決策。色彩漂移由 primitive layer 控制——SelectMenu 層級若加 ColorMatrix 會重複 MenuItem / Popover 的矩陣。

對應 anatomy story:保留 `Overview` / `Inspector` / `SizeMatrix` / `StateBehavior`,額外追加元件特有的 `ModeMatrix`(single / multi / searchable / creatable / grouped 等功能組合矩陣,這是 SelectMenu 真正的決策面向——取代 ColorMatrix)。

---

## shadcn passthrough 例外說明

SelectMenu 是 **composite**(Popover trigger + Command search + 滾動 MenuItem list + 浮動 surface),純 declarative API。**不套 `forwardRef` / `...props` spread`**,同 PeoplePicker 理由:

- **沒有單一 DOM root 可 ref**:trigger / search input / list / content portal 各自 DOM tree 離散
- **`...props` spread 目標不明**:composite 的 root wrapper 只是 control 容器,spread 到那裡 consumer 無從預期作用
- **API 邊界明確**:SelectMenu 暴露「選值」語意(value / onChange / options / mode),不暴露 DOM 細節

`displayName = 'SelectMenu'` 保留。若 consumer 需要 DOM-level 控制(custom trigger / portal / search input ref),改用底層 Popover + Command 自組。

`asChild` 不支援(composite 非 Slot-compat)。

---

## 相關

- `../Menu/menu-item.spec.md` — 選項 row 的 item-layout 共用規則（SelectMenu 消費 MenuItem）
- `../Popover/popover.tsx` — 浮動容器（SelectMenu 消費）
- `../Command/command.tsx` — cmdk 搜尋 + 鍵盤導覽（SelectMenu 消費）
- `../Empty/empty.spec.md` — 搜尋無結果的 empty state
- `../Select/select.spec.md` — 主要消費者之一（searchable 時切換到 SelectMenu）
- `../Combobox/combobox.spec.md` — 主要消費者之一（searchable 多選時切換到 SelectMenu）
- `../PeoplePicker/people-picker.spec.md` — 永遠使用 SelectMenu 的消費者
- `../../patterns/element-anatomy/item-anatomy.spec.md` — item-layout pattern（MenuItem 繼承）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `command.spec.md`
- `dropdown-menu.spec.md`
