---
component: PeoplePicker
family: 4
variants: {}
sizes: {}
traits:
  - isInputLike
benchmark:
  - Ant Design Mentions: github.com/ant-design/ant-design/tree/master/components/mentions
  - MUI Autocomplete: github.com/mui/material-ui/tree/master/packages/mui-material/src/Autocomplete
  - Polaris Combobox: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Combobox
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# PeoplePicker 設計原則

## 定位

PeoplePicker 是**人員選擇器**——專為「從人員清單中選一個或多個」設計的複合元件。外觀對齊 Select / Combobox，差異在選項前綴有 Avatar 視覺。

**實作基礎**：組合元件——single mode wrap `<Select searchable>`、multi mode wrap `<Combobox>`(stack / pill 皆同;`people-picker.tsx` 檔頭「v15.6 SSOT 重構 v2」comment SSOT),已選值 render 用 `PersonDisplay`(Avatar + Name)。Popover + Command(cmdk)搜尋 + SelectMenu 浮層是 Select / Combobox 內部下層細節,PeoplePicker 不直接 import / render 它們。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 PeoplePicker 特有的原則。

## Controlled-only rationale(Dim 26)

本元件採 **controlled-only**:`value` + `onChange`,不支援 `defaultValue` uncontrolled fallback(value pair V1)。多選跟隨內部 wrap 的 `Combobox`(controlled-only,rationale 見其 spec「Controlled-only rationale(Dim 26)」段);單選雖 wrap dual-mode 的 `Select`(其有 `defaultValue`),但本 wrapper 刻意不 expose `defaultValue` 以維持兩 mode API 一致——wrapper 單側開放 dual-mode 會產生狀態斷層。未來要改 dual-mode 需自 primitive 層引入 `useControllableState`,屬 major API 擴充。

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
| 只顯示單一人員（不需選擇）| `ProfileCard` + `Avatar` | PeoplePicker 是選擇器，純展示用 ProfileCard |
| 顯示整個 team 成員列表 | `Avatar.Group` / 自訂 list | PeoplePicker 是「選人」介面，不是「展示 team」 |

---

## 單選 vs 多選

透過 `value` prop 的類型決定：

| 模式 | value 類型 | 視覺 |
|------|-----------|------|
| 單選 | `PersonValue \| null` | Field 顯示單一 Avatar + Name |
| 多選 | `PersonValue[]` | default `multiDisplay='stack'`:Avatar 疊合陣列;`multiDisplay='pill'` opt-in:每人矩形 Tag pill |

**判斷**：
- 「這個 task 指派給誰」→ 單選（assignee 通常一個）
- 「選擇 reviewers」→ 多選（reviewer 可多人）
- 「加入 channel 的成員」→ 多選
- 「文章作者」→ 單選

### 多選顯示樣式(multiDisplay)

Multi mode 公開 `multiDisplay` / `pillShowAvatar` / `pillWrap` 三個顯示 props(jsDoc SSOT 見 `people-picker.tsx` `PeoplePickerProps`;single mode 忽略):`multiDisplay='stack'`(default)= Avatar 疊合 + 圓形 `+N` overflow、不可 wrap;`'pill'` opt-in = 每人矩形 Tag pill、可 wrap(對齊 GitHub Reviewers / Combobox tag-input idiom)。`pillShowAvatar`(default `true`)控 pill 內 avatar prefix,`false` → 純文字 pill(對齊 Tag 元件 `avatar` prop SSOT);`pillWrap`(default `true`)控 pill 換行(對齊 Combobox `wrap` prop)。

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
| 底層實作 | Popover + Command + SelectMenu | 桌機自建 listbox（`role="combobox"` div + cmdk SelectMenu，`select.tsx:570`）/ 觸控 native `<select>`(`select.tsx` NativeSelect) | 桌機自建 listbox（`role="combobox"` div + cmdk SelectMenu + Tag overlay，`combobox.tsx:699`）/ 觸控 native `<select>`(`combobox.tsx` NativeCombobox) |
| 搜尋 | 永遠啟用（人名本質）；single = inline-trigger（wrap `<Select searchable>`），multi 預設 panel-top（`searchIn='menu'`，`searchIn='trigger'` opt-in）— 對齊本 spec L91-92 SSOT 表 | 可選 `searchable`（單選短列表 → inline-trigger only）| 可選 `searchable` + `searchIn='menu' \| 'trigger'`（多選 → 兩種模式）|

**搜尋型態 SSOT canonical**（A1-A5 spec,2026-05-11;2026-05-12 補 PeoplePicker multi `searchIn` opt-in）：

| 型態 | 使用情境 | 元件 API |
|---|---|---|
| **none** | 短列表 (< 7 選項) / 自然語言 label 可用 native type-ahead | 不傳 `searchable` |
| **inline-trigger** | 單選 + 需快速 type-and-pick;trigger 變 input | `<Select searchable />` / `<Combobox searchable searchIn='trigger' />` / `<PeoplePicker />` single / `<PeoplePicker multi searchIn='trigger' />` |
| **panel-top** | 多選 + 連續 type-and-select(關鍵字保留在 menu 不被 chip 切走) | `<Combobox searchable searchIn='menu' />` / `<PeoplePicker multi />`(default menu) |

### Trigger display SSOT canonical table(2026-05-15 v3 user verbatim 整理)

**PeoplePicker 是獨立元件,有自己的另一層 SSOT,並非完全繼承 Select / Combobox**。下表標出哪些繼承、哪些 PeoplePicker 自己定義 — **改一處先看本表,違反該層 SSOT = 漂移**。

**讀表方式**:每 row 的設計意圖(canonical)為主體;`file:line` cite 是 drift 防護的實作錨點(改 code 必同步 cite),非要求讀者 trace 實作。

#### A. 元件本質繼承表

| 面向 | 來源 SSOT |
|---|---|
| 單人互動邏輯(open/close/keyboard/搜尋)| **繼承 Select**(只多套一層 Avatar 視覺包裝)|
| 多人互動邏輯(N tag / overflow / inline-search)| **繼承 Combobox**(但 tag 和溢出**換成圓形 avatar 視覺**)|
| Avatar 在 field 內 padding(12px 固定)| **PeoplePicker 自己**(不繼承 Combobox density-dependent 公式)|
| +N 溢出 chip 形狀(**圓形**;stack mode)| **PeoplePicker 自己**(不繼承 Combobox 矩形 tag) |
| 多人 tag 視覺(default `multiDisplay='stack'`:**圓形 avatar overlap `-ml-0.5`**) | **PeoplePicker 自己**(`multiDisplay='pill'` opt-in 才用 Combobox 矩形 Tag pill,見「多選顯示樣式」)|
| 多人 length=1 視覺(降階為 avatar+人名,跟單人視覺一致)| **PeoplePicker 自己**(Combobox 無此特殊)|

#### B. 單人完整 trigger SSOT

| state | trigger 顯示 |
|---|---|
| 空、closed | placeholder「請選擇人員」+ 按空間 ellipsis |
| 選 1 人、closed | avatar + 人名 + 按空間 ellipsis(`PersonDisplay`,`person-display.tsx:137-152`)|
| open + inline-search、未選 | input cursor + placeholder「請選擇人員」(trigger empty placeholder,**不**用「搜尋…」)|
| open + inline-search、選 1 人 | input cursor + 該人名 overlay(本人名字當記憶提示,按空間 ellipsis;`select.tsx:204-205` `triggerEmptyPlaceholder = placeholder \|\| '搜尋…'` + `showSelectedOverlay` span 顯人名,2026-05-15 Bug 2 fix 改 span overlay 取代原 native placeholder)|
| open + panel-search、選 1 人 | avatar + 人名 + ellipsis(搜尋框在 panel 內,trigger 視覺不變)|

#### C. 多人 length=1 trigger SSOT(降階為單人視覺)

| state | trigger 顯示 |
|---|---|
| closed | avatar + 人名 + ellipsis(= 單人 closed,共享 `PersonDisplay`)|
| open + panel-search | avatar + 人名 + ellipsis(panel 內搜尋,trigger 視覺不變)|
| open + inline-search | avatar + **input cursor**(原本人名位置被輸入區取代;**因 avatar 仍可見,placeholder 永遠空,只剩 cursor** — 對齊 §E 「avatar 存在 → placeholder 空」rule,避免視覺重複造成混亂)|

#### D. 多人 length≥2 trigger SSOT(avatar stack 視覺)

| state | trigger 顯示 |
|---|---|
| closed | **圓形 avatar stack overlap `-ml-0.5` + 圓形 +N 溢出 chip**(本來放人名的地方不放人名)|
| open + inline-search、**未選**(length=0)| input cursor + placeholder「請選擇人員」(trigger empty placeholder,**不**用「搜尋…」)|
| open + inline-search、**已選**(length≥2)| **avatar stack + 圓形 +N + input cursor 在 +N 的右側**(stack 跟 +N 不動;cursor 接在 +N 後;empty search 不顯 placeholder,純 cursor。對齊 Combobox `trailing` slot placement)|
| open + panel-search、已選 | avatar stack + 圓形 +N(searchbox 在 panel 內,trigger 視覺不變)|

#### E. 共享 SSOT(單人 ↔ 多人 length=1 必對齊)

| 共享項 | SSOT owner |
|---|---|
| Avatar 左 inset 距 trigger.left = 12px 固定(不隨 size/density 漂移)| 本 spec L94 + `people-picker.tsx:362` `!px-3` inject(form context)/ `!px-[var(--table-cell-px)]`(naked variant table cell)|
| Avatar+人名視覺 | `person-display.tsx:137-152` `PersonDisplay`(共享 renderer)|
| 人名按空間 ellipsis | `person-display.tsx:150` `truncate flex-1 min-w-0` |
| Placeholder ellipsis(inline-search active 時)| `field-wrapper.tsx:244` `bareInputStyles` 含 `truncate` |
| Empty-state inline-search placeholder(未選時 → trigger empty placeholder) | `select.tsx:204` `triggerEmptyPlaceholder = placeholder \|\| '搜尋…'` / `combobox.tsx` CustomCombobox inline input `items.length === 0 ? placeholder : ''`(2026-05-15 Drift A fix 對齊 PeoplePicker SSOT)|

**Avatar-presence → placeholder 規則(2026-05-15 user verbatim「只要有 avatar 存在,placeholder 都是空的,只會出現 cursor,這樣才不會造成混亂」)**:

| 場景 | avatar 是否可見 | placeholder 行為 |
|---|---|---|
| 單人 inline-search、已選、open | ❌(input **取代** avatar/name,avatar 消失)| 該人名以 span overlay 顯示(memory aid)— `select.tsx:204-205`(2026-05-15 Bug 2 fix 改 span overlay)|
| 單人 inline-search、未選、open | ❌(從來沒 avatar)| placeholder = **trigger empty placeholder「請選擇人員」** |
| 多人 inline-search、length≥1、open | ✅(avatar/stack 仍在,input 在 trailing)| **placeholder = '' 純 cursor**(避免跟 avatar 重複)|
| 多人 inline-search、length=0、open | ❌(empty)| placeholder = **trigger empty placeholder「請選擇人員」** — `combobox.tsx` CustomCombobox inline input(Drift A fix)|

**規則一句話**:`placeholder = (visible_avatar_exists) ? '' : (selectedLabel ?? triggerEmptyPlaceholder)`。

**搜尋預設模式(2026-05-15 user 拍板)**:多選系列 default `searchIn='menu'`(panel-top search)。`searchIn='trigger'` 為 opt-in。Single mode 永遠 inline-search(Select 慣例)。

#### F. Cell-edit ↔ Field-edit 一致性 invariant

`MultiPersonCell` / `PersonCell`(`cell-registry.tsx` cell-as-input,DataTable)+ form context PeoplePicker **包同一個元件**,所以 §B/§C/§D 規則對兩 surface 都成立。差別只在 padding 機制(共 §E)— 兩 surface 都產出 12px inset,**禁分歧**。

**改 PeoplePicker 視覺前必查本表,動 trigger render / placeholder / overflowShape / tagWrapperClassName 前先 cite 對應 row。** Hook `check_peoplepicker_ssot_drift.sh` 機械強制。

**Avatar 左 inset SSOT(GitHub people picker idiom)**:single trigger / multi stack 第一個 avatar 距 trigger.left = **12px 固定**(不隨 size / density 漂移)。實作:PeoplePicker form context + 有 tag → `cn(className, '!px-3')` inject 12px override 到 Combobox Field wrapper,**覆蓋** Combobox `tagPadding[size]` density-dependent calc 公式(該公式在 default lg + 全 comfortable 共 4/6 組合漂離 12px,故報廢改固定值;推導史詳 git log 2026-05-13);`tagAreaPaddingLeftPx={undefined}` 不再 +8 magic。Cell context naked variant `!px-[var(--table-cell-px)]` 已是 12px 不 inject。對齊 GitHub picker / Material Autocomplete renderTags / Ant Select tagRender 共享 fixed-inset canonical(不 scale with size)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**判準**：
- **選人 → PeoplePicker**（不用 Select / Combobox 代替，失去 Avatar 視覺）
- **非人員單選 → Select**
- **非人員多選 → Combobox**

**常見誤解**:(1)「PeoplePicker 只是 Combobox + avatar 皮」— 它有自己一層 SSOT(avatar 12px 固定 inset / 圓形 +N chip / avatar-presence placeholder 規則),見上方 §A 繼承表;(2)「拿來展示 team 名單」— 它是選擇器,純展示用 `Avatar.Group` / `ProfileCard`(見禁止事項)。

---

## PersonValue 型別

```tsx
type PersonValue = string | PersonData

interface PersonData {
  name: string
  avatarUrl?: string
  description?: string
  status?: 'online' | 'away' | 'busy' | 'offline'
  statusMessage?: React.ReactNode
  id?: string
  employeeNumber?: string
  fields?: { label: string; value: string }[]
  onViewProfile?: () => void
}
```

- **簡單用 string**：只有名字（fallback 顯示 initials）
- **完整物件 `PersonData`**：name + avatar + presence 狀態 + 狀態訊息 + 員工 ID + 自訂欄位 + profile 跳轉（展示完整 ProfileCard，對齊 `avatar.spec.md`「person avatar hover → ProfileCard」DS-wide canonical；SSOT 型別見 `person-display.tsx` PersonData）

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

## Anatomy story 結構

PeoplePicker 是 **composite Field Control**(Field shell + Avatar + SelectMenu),anatomy 採 DS 標準結構 + 元件特有矩陣:

- `Overview` —— 預設視覺概覽
- `Inspector` —— 互動式 prop 試玩(`mode` × `size` × `disabled` 即時切換,搭 `SAMPLE_PEOPLE` fixture)。對齊全部同類 composite Field Control(Combobox / Select / SelectMenu / DatePicker / TimePicker / NumberInput / LinkInput 皆有 Inspector)的 DS 慣例,單組合即時試玩 prop。
- 元件特有 `ModeMatrix`(single / multi)+ `PersonValueType`(value 結構)—— Inspector 單一組合無法同時並列的跨模式 / 多值對照,由矩陣補齊
- 標準 `SizeMatrix` / `ColorMatrix` / `StateBehavior`(真實 Assignee picker 場景)

---

## shadcn passthrough 例外說明

PeoplePicker 是 **composite 元件**(內部 wrap `<Select>`(single)/ `<Combobox>`(multi)),其主 API 為 declarative(value / onChange / size / mode / options...)。**有套 `forwardRef` + HTML root props spread**(codex P2 fix 2026-05-07 v15.10,`people-picker.tsx:110` / L52 / L130 `...rest`):

- **forwardRef + 單一 root**:`PeoplePickerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>`,ref 與 `...rest`(`id` / `data-testid` / `onBlur` / `onFocus` / `aria-*` 等 HTML root props)forward 到內部 trigger 容器(readonly/disabled root div、或 wrapped Select / Combobox 的 root),對齊 DS 既有 Combobox / Select 慣例
- **`onChange` 走 Omit**:本元件 onChange 用 `(value: PersonValue[]) => void` custom signature,跟 HTMLAttributes onChange 衝突,故 Omit
- **API 邊界明確才是 composite 價值**:PeoplePicker 暴露的是「選人」語意,不是「彈出選單 + 搜尋 + 渲染頭像」的 DOM 細節。若 consumer 需要更細的 DOM-level 控制,該用底層 Popover + Combobox 自組,不該透過 PeoplePicker

`displayName = 'PeoplePicker'` 保留,無 `asChild`(composite 不是 Slot-compat)。

---

## 邊界案例

- **Disabled**:`disabled` → `resolvedMode='disabled'`(`useResolvedFieldMode`),走獨立 static-display 分支(`people-picker.tsx`「readonly / disabled」段)——渲染靜態 `<div>` 包 `MultiPersonDisplay` / `PersonDisplay` + `ItemSuffix` ChevronDown 類型身份 indicator(2026-06-10 加;naked variant 依 `showDisplayEndIcon`),**不** wrap Select / Combobox、無 dismiss X、無 inline-search input。視覺與 readonly 等效。token 走 M24 state precedence(`text-fg-disabled`,含 chevron)。
- **Loading(async people fetch)**:目前 PeoplePicker **未暴露 `loading` prop**(`PeoplePickerProps` 無此欄位,內部也未 forward 給 wrapped Select / Combobox)。consumer 若需 loading 態,在 fetch 完成前自行控制 `people=[]`(走 emptyText 空態)。底層 Select / Combobox / SelectMenu 各有自己的 loading 機制,但尚未經 PeoplePicker API 層轉發。
- **Empty(no search results)**:`emptyText` 預設「沒有符合的人員」(本 spec L72 已 codify);無 creatable mode(人員不可建立)。
- **Empty(no value selected)**:single mode → trigger 顯 placeholder「請選擇人員」;multi mode `value=[]` → trigger 同 placeholder(無 avatar stack 渲);詳「Trigger display SSOT canonical table」B-D 段。
- **`people` 清單變動(async fetch 後更新)**:已選 value 顯示不依賴 `people` 查找 — display 路徑直接渲染 value 自帶資料;edit 路徑以人名回查 `people`,查不到降級為純名字 string(initials fallback),不報錯(`people-picker-helpers.ts:74-75`)。選單選項即時跟隨 props 重渲。
- **RTL**:未實作方向鏡像(avatar stack overlap `-ml-0.5` / 12px inset 皆以 LTR physical 方向設計);RTL 屬 DS-wide 決策,未定(與 Chip / Breadcrumb 同口徑)。
- **Dark mode / density**:Avatar 12px inset 固定不隨 density 漂移(PeoplePicker own,見「Trigger display SSOT canonical table」§E + Avatar 左 inset SSOT 段);其他走 Field + SelectMenu SSOT。

---

## 相關

- `./person-display.tsx` — PersonValue 的顯示元件（Avatar + Name，readonly / DataTable cell 用）
- `../Select/select.spec.md` — 非人員單選的對應元件
- `../Combobox/combobox.spec.md` — 非人員多選的對應元件
- `../SelectMenu/select-menu.tsx` — PeoplePicker edit mode 的浮層選單（內部消費）
- `../Avatar/avatar.spec.md` — 選項與已選值的 Avatar 視覺
- `../ProfileCard/profile-card.spec.md` — 純顯示人員資訊的對應元件（非選擇器）
- `../Field/field-controls.spec.md` — Field Control 共用規則

## A11y 預設

**ARIA / Pattern**:對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應 pattern。

**Keyboard 行為**:

- Tab — focus trigger
- Enter / Space — 開啟 picker
- 字母鍵 — type-ahead 搜尋
- ↑/↓ — 導覽 people
- Enter — 選擇 / 取消選擇

**Focus**:Field 家族 focus 由 Field wrapper 提供(`focus-within:!border-primary`,`field-wrapper.tsx` v13.3 SSOT;對齊 Select / Combobox spec「Focus」段),非 outline ring;focus management 由元件 own。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `select-menu.spec.md`
