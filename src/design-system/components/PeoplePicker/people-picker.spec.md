# PeoplePicker 設計原則

## 定位

PeoplePicker 是**人員選擇器**——專為「從人員清單中選一個或多個」設計的複合元件。外觀對齊 Select / Combobox，差異在選項前綴有 Avatar 視覺。

**實作基礎**：組合元件——Popover + Command（cmdk）搜尋 + SelectMenu 浮層 + PersonDisplay render。無直接 external primitive base（底層靠 shadcn passthrough 的 Popover / Command）。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 PeoplePicker 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## 何時用

- **指派人員**：指派 task、assignee、reviewer 選擇
- **加入成員**：team / channel / project 加人
- **@提及選擇器**：文章 / 留言 / chat 內插入 @user
- **多人協作選擇**：訂單協作人員、共同擁有者
- **需要 avatar 視覺識別**：人員清單視覺辨識高於純文字 label

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 一般分類選擇（非人員）| `Select` / `Combobox` | PeoplePicker 專為人員設計，有 Avatar prefix |
| 單選純文字選項（狀態 / 類別）| `Select` | PeoplePicker 開銷較大，靠 Avatar 識別；非人員用 Select |
| 多選非人員 tag | `Combobox` | Combobox 是通用多選，無 Avatar 假設 |
| 只顯示單一人員（不需選擇）| `NameCard` + `Avatar` | PeoplePicker 是選擇器，純展示用 NameCard |
| 顯示整個 team 成員列表 | `Avatar.Group` / 自訂 list | PeoplePicker 是「選人」介面，不是「展示 team」 |

---

## 單選 vs 多選

透過 `value` prop 的類型決定：

| 模式 | value 類型 | 視覺 |
|------|-----------|------|
| 單選 | `PersonValue \| null` | Field 顯示單一 Avatar + Name |
| 多選 | `PersonValue[]` | Field 顯示 Avatar 陣列（與 Combobox 多選同模式）|

**判斷**：
- 「這個 task 指派給誰」→ 單選（assignee 通常一個）
- 「選擇 reviewers」→ 多選（reviewer 可多人）
- 「加入 channel 的成員」→ 多選
- 「文章作者」→ 單選

---

## 搜尋

PeoplePicker 永遠支援搜尋（內部使用 `Command` / cmdk）——因為人員清單通常規模較大且使用者記得人名關鍵字（符合 Select spec「Searchable 開啟判斷」的「label 性質」主判準：人名是獨特關鍵字）。

- **搜尋 placeholder**：預設「搜尋人員…」，可透過 `searchPlaceholder` 覆寫
- **空狀態**：預設「沒有符合的人員」，透過 `emptyText` 覆寫

---

## 與 Select / Combobox 的分界

| | PeoplePicker | Select | Combobox |
|---|---|---|---|
| 資料類型 | **人員**（含 Avatar） | 任意（純文字）| 任意（純文字）|
| 單選 / 多選 | 兩者皆支援（value 類型決定）| 單選 | 多選 |
| 視覺 prefix | Avatar（必備） | 可選 startIcon | 無 |
| 底層實作 | Popover + Command + SelectMenu | native `<select>` | native `<select>` + Tag overlay |
| 搜尋 | 永遠啟用（人名本質）| 可選 `searchable` | 可選 `searchable` |

**判準**：
- **選人 → PeoplePicker**（不用 Select / Combobox 代替，失去 Avatar 視覺）
- **非人員單選 → Select**
- **非人員多選 → Combobox**

---

## PersonValue 型別

```tsx
type PersonValue = string | { name: string; avatarUrl?: string; description?: string }
```

- **簡單用 string**：只有名字（fallback 顯示 initials）
- **完整物件**：包含 avatar URL 和 description（顯示 Avatar + 次要資訊如 role / email）

---

## readonly / disabled

與其他 Field 一致：
- **readonly**：顯示選中人員（Avatar + Name），無 dropdown trigger、無搜尋
- **disabled**：灰化整個 field，不可互動

---

## 禁止事項

- ❌ 用 PeoplePicker 選非人員（部門 / 專案 / 類別）——那些用 Select / Combobox
- ❌ 在 readonly 模式顯示搜尋或 dropdown——readonly 是純展示
- ❌ 多選情境強制單選（限制 value.length === 1）——改用 Select（如果真的單選）
- ❌ 把 PeoplePicker 當 Team Member 展示元件用（不選人、只看名單）——用 Avatar.Group 或自訂 list
- ❌ 不搭配 Avatar 視覺（純文字名字）——失去 PeoplePicker 存在的理由，直接用 Select / Combobox

---

## 為何無 Inspector

PeoplePicker 是 **composite Field Control**(Field shell + Avatar + SelectMenu),關鍵決策維度是 `mode`(single / multi)× `size` × search behavior × value type——已由 `ModeMatrix` / `SizeMatrix` / `ColorMatrix` / `StateBehavior` / `PersonValueType` 五張矩陣完整覆蓋。互動 Inspector 對 composite 元件較弱:「傳 PersonValue 陣列」需要真實資料 fixture 展示,單組合試玩無法呈現——改以 `StateBehavior` 的真實 Assignee picker 場景取代。

對應 anatomy story:保留 `Overview` + 元件特有 `ModeMatrix` / `PersonValueType` + `SizeMatrix` + `ColorMatrix` + `StateBehavior`。

---

## 相關

- `./person-display.tsx` — PersonValue 的顯示元件（Avatar + Name，readonly / DataTable cell 用）
- `../Select/select.spec.md` — 非人員單選的對應元件
- `../Combobox/combobox.spec.md` — 非人員多選的對應元件
- `../SelectMenu/select-menu.tsx` — PeoplePicker edit mode 的浮層選單（內部消費）
- `../Avatar/avatar.spec.md` — 選項與已選值的 Avatar 視覺
- `../NameCard/name-card.spec.md` — 純顯示人員資訊的對應元件（非選擇器）
- `../Field/field-controls.spec.md` — Field Control 共用規則
