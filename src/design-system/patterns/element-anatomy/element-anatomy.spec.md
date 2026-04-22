# Element Anatomy 設計原則(4-Family Model Taxonomy)

本檔是 design system 中 **element-level 結構分類系統**的頂層 governance doc——跨 pattern / cross-component。每個元件 spec 第一段**必須聲明 Layout Family**(1/2/3/4 或「非 family,self-contained / composite」)。

**為什麼住 `patterns/element-anatomy/` 而非 DS 根目錄**:taxonomy 橫跨 patterns + components 兩個家:
- Family 1+2(row 結構)→ runtime primitive 在同 folder `item-anatomy.{spec.md, tsx, stories.tsx}`
- Family 3(pill 結構)→ SSOT pointer 到 `components/Button/button.spec.md`
- Family 4(field control 結構)→ SSOT pointer 到 `components/Field/field-controls.spec.md`

Taxonomy 跟 F1+F2 runtime primitive **co-locate 在同 folder** 是 `src/design-system/README.md` L17 的 home governance 決策:**「即使跨 pattern 的 taxonomy(如 4-Family Model)也住在最相關的 pattern topic 資料夾內,folder = topic home,不需要頂層 flat 檔案」**。co-location 讓新 element 查 taxonomy 時,runtime primitive 就在隔壁,查閱效率最高。

**與「layout」命名分家**:「anatomy」= element-level 結構分類;「layout」= page-level 版面(未來頁面設計原則的家)。世界級 DS 一致如此(Material Foundations > Layout = page grid / Polaris / Atlassian / Carbon 皆然)。

---

## 4 個可繼承的 Layout Family

| Family | 用途 | 結構 | Sizes baseline | SSOT |
|--------|------|------|----------------|------|
| **1. Menu item anatomy** | Menu 容器內的掃視單列(scanning mode)| `[small icon/avatar 16-20px] [content: label 單行 + desc 選用] [small suffix]`, tight density, leading-compact | **sm / md / lg** | `patterns/element-anatomy/item-anatomy.spec.md`「Family 1: Menu item」章節 |
| **2. List item anatomy** | 頁面上的閱讀式單列(reading mode)| `[larger icon/avatar 20-24px] [content: label + multi-line desc OK] [suffix action/button/counter]`, looser density, reading typography | **sm / md / lg** | `patterns/element-anatomy/item-anatomy.spec.md`「Family 2: List item」章節 |
| **3. Pill anatomy** | 單行互動 pill(action trigger / data indicator)| `[startIcon?] [<span px-1>label</span>] [suffix badge/endIcon/dismiss]`, single-line, whitespace-nowrap | **sm / md / lg + 可選 xs** | `components/Button/button.spec.md`「Pill Layout」章節 |
| **4. Field control anatomy** | 可編輯資料輸入(單行為主,Textarea 多行 variant) | `fieldWrapperStyles + [startIcon?] [<editable content>] [endAction?]`, **視覺對齊 Family 1** | **sm / md / lg** | `components/Field/field-controls.spec.md` |

---

## 尺寸 baseline 與合法偏離

每個 Family 有明文 baseline sizes。消費元件**必須**實作 baseline,除非有合理理由偏離——偏離必須在元件 spec 明文記錄。

| 偏離類型 | 範例 | 合理理由 |
|---------|------|---------|
| **單一固定 size** | Chip (`h-field-sm`) / Notice / Alert / Toast | 世界級共識(Material 3 filter chips / Material Banner):此類元件不需密度選擇 |
| **Alias** | Tag lg=md=24px | 子元件補齊(discrete tier):consumer 傳 size 不 break,視覺等同 |
| **Mode 取代 Size** | FileItem(`compact` / `rich`) | **結構變體**非密度變體——用 size 會誤導 |
| **額外 xs**(Family 3 only) | Button / SegmentedControl xs | icon-only toolbar utility(24px 固定 不配對 Field) |

違反但無理由 = 設計 bug,必須改 code 或補 spec 理由。

---

## Family 3 兩個 sub-profile(重要)

同結構、不同 role、不同 padding / typography:

| Sub-profile | 成員 | Padding | Typography | Cursor | 為什麼 |
|-------------|------|---------|-----------|--------|------|
| **Action trigger** | Button / SegmentedControl / Chip | 較鬆(xs=`px-2`, sm+=`px-3`) | 對應 size 的 font-medium | pointer | 需命中區 + 視覺重量搶點擊焦點 |
| **Data indicator** | Tag | 較緊(`px-1` 所有 size) | font-normal | text | Passive 讀取,不搶焦點 |

---

## Size Pairing 規則(跨 Family)

| Pairing | 意義 |
|---------|------|
| Tag md ↔ Field md / Tag sm ↔ Field sm | Tag 的 size 對應同名 Field size,視覺對齊 form 內字級 |
| Button sm/md/lg ↔ Field sm/md/lg | Button 配對 Field 時 size 同名 |
| Button xs = 獨立 utility | 不配對 Field,用於 toolbar compact button |
| Family 4 視覺對齊 Family 1 | 讓 Select trigger + dropdown options 視覺連續 |

---

## Consumers 快速查

| Family | Canonical | Consumers |
|--------|-----------|-----------|
| 1 Menu item | `MenuItem`(from `item-anatomy`) | `TreeItem`, `SidebarMenuButton`, `DropdownMenuItem`(重用 MenuItem), `SelectMenu` 內部 |
| 2 List item | (無單一 canonical) | `StepItem`(例外:indicator 對齊), `FileItem`(icon 作邊界), `Notice` → `Alert/Toast`(視覺一致非語意), `SelectionItem` variant → `RadioGroup` / `Checkbox` group |
| 3 Pill | `Button` | `SegmentedControlItem`, `Chip`, `Tag`(data indicator sub-profile) |
| 4 Field control | `Input`(field-controls SSOT) | `NumberInput`, `DatePicker`, `Select`, `Combobox`, `LinkInput`, `PeoplePicker`, `Textarea`(multi-line variant) |

---

## 不進 Family Model 的元件

不能舉一反三的不分類。**Composite 類再細分三子類**,因為三類的設計約束不同:

### Self-contained primitive(獨立視覺 atom,無 slot 結構)

Switch / Checkbox / Radio / Avatar / Badge / CircularProgress / ProgressBar / Skeleton / Separator

各自獨立視覺,spec 直接描述自己結構。

### Overlay-composite(浮層 composite,消費 overlay-surface pattern)

Dialog / Sheet / Popover / Tooltip / HoverCard / Coachmark / Command / SelectMenu / DropdownMenu

**共同約束**:
- 必消費 `patterns/overlay-surface/` 的 `SurfaceHeader` / `SurfaceBody` / `SurfaceFooter`(padding SSOT)
- elevation 走 `--elevation-200`+ 的 overlay layer
- dismiss 走 `onClose`(語意:關閉 overlay session,見 CLAUDE.md 命名 canonical)
- 部分 overlay 有 modal vs non-modal 分流(Dialog / Sheet modal;Popover / HoverCard non-modal)
- 在 dark-mode context(如 FileViewer chrome)中需支援 `data-theme="dark"` 子樹

### Page-composite(頁面內 composite,無 overlay 性質)

Tabs / Accordion / DataTable / Calendar / Carousel / Breadcrumb / Sidebar / NameCard / FileItem / FileUpload / FileViewer / OverflowIndicator

**共同約束**:
- 消費多個 row primitive 或 self-contained primitive
- 不走 overlay-surface(沒有 elevation / dismiss)
- 佈局 token 用 `--layout-space-*`(chrome / section)
- 各自 own 內部 layout SSOT(例:DataTable 的 header row、Calendar 的 grid、Carousel 的 track + arrow)

### Pure-wrapper(純行為 wrapper,無自己視覺)

CheckboxGroup / RadioGroup / FieldGroup(若建)

**共同約束**:
- 自己**無 render**(transparent wrapper)
- 提供 context(`CheckboxGroupContext`)給 descendant 同步 state
- spec 應明文「本元件無視覺」,對應 anatomy story 只有 `Overview` + `Inspector` 兩個(no ColorMatrix / SizeMatrix)

---

### 判斷新 composite 時的流程

寫新 composite spec 時先自問:
1. 這是浮層(elevation / Portal / dismiss session)嗎? → **Overlay-composite**
2. 這是頁面內多區塊 layout 嗎? → **Page-composite**
3. 這本身無視覺、只是 context / state wrapper 嗎? → **Pure-wrapper**

三題全否 → 應該是 Family 1/2/3/4 或 Self-contained primitive,而不是 composite。

---

## 允許的跨 Family 視覺對齊

Family 4 的 Input / Select 視覺對齊 Family 1 的 menu-item(高度、字體、icon size)——但兩個 family **各自 own SSOT**。這是「視覺對齊」非「結構繼承」。

---

## Field Composition(不在 family 但相關)

`components/Field/field.spec.md` 描述 **form field composition pattern**——Field 容器如何包 Family 4 control + label + help。不同 scope 的 pattern(composition 非 element anatomy),不列入 4-Family。

---

## 新元件判斷流程

1. **垂直列表裡?** → Family 1(menu 容器)/ Family 2(頁面)
2. **單行可點擊 / 可讀的 pill?** → Family 3(action trigger or data indicator)
3. **單行可編輯資料?** → Family 4(必須視覺對齊 Family 1)
4. **都不是?** → **停下討論**——新 family 還是 self-contained

CLAUDE.md `# 系統內部 Layout — 4-Family Model` 留概要 + 判斷流程(每 session signal)。本檔 own 完整 taxonomy + Family 3 sub-profile + size pairing + consumers + exclusions。

---

## 相關

- `patterns/element-anatomy/item-anatomy.spec.md` — Family 1+2 row anatomy deep SSOT + runtime primitive(`<MenuItem>` canonical + `<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>` slot components)
- `components/Button/button.spec.md` — Family 3 Pill anatomy SSOT
- `components/Field/field-controls.spec.md` — Family 4 Field control anatomy SSOT
- CLAUDE.md `# 系統內部 Layout — 4-Family Model` — 每 session signal 的概要 + judgment flow
