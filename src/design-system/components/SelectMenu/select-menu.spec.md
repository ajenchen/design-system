# SelectMenu 設計原則

## 定位

SelectMenu 是 **Popover + Command 組成的完整下拉選單浮層**——提供搜尋 + 鍵盤導覽 + 分組 + 可建立新選項，作為**選值類**元件的 internal primitive（不直接使用）。

**實作基礎**：基於 cmdk（搜尋 / 鍵盤導覽）+ shadcn Popover（浮動容器）+ 消費 MenuItem primitive（item 佈局）。

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

## 相關

- `../Menu/menu-item.spec.md` — 選項 row 的 item-layout 共用規則（SelectMenu 消費 MenuItem）
- `../Popover/popover.tsx` — 浮動容器（SelectMenu 消費）
- `../Command/command.tsx` — cmdk 搜尋 + 鍵盤導覽（SelectMenu 消費）
- `../Empty/empty.spec.md` — 搜尋無結果的 empty state
- `../Select/select.spec.md` — 主要消費者之一（searchable 時切換到 SelectMenu）
- `../Combobox/combobox.spec.md` — 主要消費者之一（searchable 多選時切換到 SelectMenu）
- `../PeoplePicker/people-picker.spec.md` — 永遠使用 SelectMenu 的消費者
- `../../patterns/item-layout/item-layout.spec.md` — item-layout pattern（MenuItem 繼承）
