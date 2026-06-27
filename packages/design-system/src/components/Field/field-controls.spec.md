---
component: FieldControls
traits:
  - hasVariants
  - hasSizes
  - hasInteractiveStates
  - isStructural
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline(M22(d) 顯式撤回;本檔 frontmatter 無 benchmark list,來源 URL 未補)。 -->

# Field Controls 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> Family 4 (Field Control Layout) SSOT owner。Input / NumberInput / DatePicker / Select / Combobox / LinkInput / TimePicker / Textarea / PeoplePicker 等皆消費 `fieldWrapperStyles` / edit-readonly-disabled 三態 mode architecture / endAction 處理 / `mode="display"` 渲染 pattern / Inline Action canonical(後者也 cascade 到 Sidebar / TreeView / DropdownMenu)。scope 本質 > 單一元件。

> **注意**：此文件是 Field Controls（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker 等)**共用**的設計原則，與 `Field/field.spec.md`（表單 Layout 容器）**不是同一個東西**。
>
> - **Field Controls**（本文件）：具體的資料型別輸入元件，內部含 edit/readonly/disabled 三態 + 格式化 + DataTable Display 共用
> - **Field**（`Field/field.spec.md`）：shadcn 風格的表單 Layout 容器（label + description + error），wrap 上述 Field Controls 元件

**Layout Family**：本 spec 是 CLAUDE.md 4-Family Model **Family 4（Field Control Layout）的 SSOT**。結構 `fieldWrapperStyles + [startIcon?] [<editable content>] [endAction?]`，**視覺對齊 Family 1（Menu item layout）**——Select trigger 的高度 / 字體 / icon size 必須跟其 SelectMenu options 連續一致。Consumers: Input（canonical）, NumberInput, DatePicker, Select, Combobox, LinkInput, PeoplePicker。

## 定位

Field Controls 是資料輸入與顯示的基礎元件。每種資料類型（text、number、date、select...）對應一個元件，同時服務 Form 和 DataTable：

- **Form**：用 Field Controls 的 edit / readonly / disabled 三態（在 Field 容器內）
- **DataTable**:以 Field Controls 的 `mode="display"` 渲染 cell

每個元件擁有該類型的格式化邏輯（唯一真實來源），Form 和 DataTable 消費同一份 code。

---

## 架構

```
components/
├── Field/
│   ├── field.tsx               ← Field 佈局容器(label + control + desc + error)
│   ├── field.spec.md           ← Field 佈局容器設計原則
│   ├── field-controls.spec.md  ← 本文件
│   ├── field-types.ts          ← FieldMode / FieldVariant 共用型別 + getMenuListMinHeight(InlineActionConfig 住 patterns/element-anatomy/item-anatomy.tsx)
│   └── field-wrapper.tsx       ← 共用 wrapper 樣式、bareInputStyles、EMPTY_DISPLAY
├── Input/                      ← Input(含 mode="display";與 Field 平行的兄弟目錄,以下同)
├── NumberInput/                ← NumberInput(含 mode="display" + formatNumber)
├── DatePicker/                 ← DatePicker(含 mode="display" + formatDate)
├── Select/                     ← Select(含 mode="display")
├── Combobox/                   ← Combobox(含 mode="display")
├── LinkInput/                  ← LinkInput(含 mode="display")
├── PeoplePicker/               ← PeoplePicker + PersonDisplay(cross-component primitive)
└── Textarea/                   ← Textarea(多行)
```

每個元件統一以 `mode` prop 切換樣態：
1. **edit / readonly / disabled** — Form 用，可編輯 / 鎖定 / 不可用
2. **`mode="display"`** — DataTable cell 用，純格式化顯示（取代過往的 `XxxDisplay` 子元件）

---

## Mode — 表單三態 (display 見下方 Display 段)

下表涵蓋 Form-context 三態(edit / readonly / disabled);完整 `FieldMode` 為四值(`'edit' | 'display' | 'readonly' | 'disabled'`),`display` 模式於下方 `## Display` 段記載。

| Mode | 底色 | 邊框 | 文字色 | 用途 |
|------|------|------|--------|------|
| `edit` | surface | border（hover 深一階、focus primary） | foreground | 表單可編輯欄位 |
| `readonly` | neutral-2(`--bg-readonly`)| 無 | foreground | 表單中不可編輯但可見的欄位 |
| `disabled` | neutral-2(`--bg-disabled`)| 無 | fg-disabled | 表單中被停用的欄位 |

三種模式共用同一個 wrapper 結構（`fieldWrapperStyles`），只有底色、邊框、文字色不同。

**Boolean / 單選控件的 readonly(2026-06-12 user 拍板)**:Field 內 readonly 的 Checkbox / Switch = 同一 `fieldWrapperStyles` readonly 灰框 + ✓/—(display 同款值語言);RadioGroup = 灰框 + 選中項 label(= Select readonly 同款呈現)。理由:同一張 readonly 表單中,文字控件有灰框鎖定訊號、boolean 保留全彩控件會誤導「仍可操作」(世界級 0/4 採原樣鎖互動:Salesforce = ✓ 無框靜態 glyph / SAP = 靜態文字 / Atlassian = readView / Ant Pro = 文字)。standalone readOnly(settings list / SelectionItem row)維持原樣鎖互動。**邊界**:Rating readonly = 星星本身(星星即值語言,role=img,全業界 review-stars canonical,不包灰框);Slider 在 `<Field mode="readonly">` 內 = 鎖互動保留正常視覺(value 可讀不降色,pointer-events-none + thumb tabIndex=-1)。

### Loading state(async 驗證 / debounce fetch 中)

Loading **不是第四個 mode**,是 `edit` mode 的子狀態,語義 = **editable 仍可輸入**(UX「邊改邊讀」:debounce search / async validation 場景中 user 常需要繼續打字修正,凍結輸入反而破壞心流)。

**世界級流派選擇**(editable 派 vs readonly 派):

| DS | Loading input 做法 | 流派 |
|----|-------------------|------|
| Ant Input.Search | **input 仍 editable**,suffix spinner;submit 另鎖 | editable |
| Material TextField | readonly + suffix adornment loader | readonly |
| Polaris TextField | readonly + helpText 提示 | readonly |
| Carbon TextInput | readonly + inline Loading | readonly |
| Atlassian TextField | disabled | disabled(少數派) |
| Apple HIG UITextField | visual overlay only,不阻礙輸入 | editable |

**本 DS 採 editable 派**(Ant / Apple HIG):
- **UX 理由**:debounce 搜尋場景,user 邊打邊看建議,凍結一格會卡節奏;async validation 若第一次失敗,user 該能立即改,不是等 spinner 完才能動
- **對照 readonly 派**:readonly 派適合「提交後驗證」的場景(e.g. 表單 submit → 驗證),本 DS 的 `loading` prop 用在 debounce / inline validation,editable 更 fit

**實作 canonical(Input / Combobox 等具 async 語意的 Field 元件;NumberInput 不提供 loading——見 `number-input.spec.md`「Loading」)**:
- API:`loading?: boolean` prop
- 內部:`loading=true` → wrapper `aria-busy="true"` + **endAction slot 自動塞 `<CircularProgress size={iconSize}/>`**(與 `endAction` prop 互斥,loading 優先)
- input **不進 readonly / disabled**,保持可編輯
- CircularProgress 尺寸:程式化 `iconSize`(sm/md=16, lg=20),消費者不用再傳
- CircularProgress 顏色:走預設 `text-primary`(表達「正在處理,請注意」)
- startIcon(Search 等語義 icon)**不受 loading 影響**,保留原位置

```tsx
// 世界級 canonical:search field 在 loading 中,user 仍可修改關鍵字
<Input startIcon={Search} loading placeholder="搜尋..." />
// → search icon 在 prefix(保留語義身分)
// → CircularProgress 在 endAction 位置(暫時狀態)
// → input editable + aria-busy,user 可繼續輸入 / 修改
```

❌ 禁止手刻路線:
```tsx
// 絕對不寫
<div className="relative">
  <Input startIcon={Search} />
  <div className="absolute right-3 top-1/2 -translate-y-1/2">
    <CircularProgress size={16} />
  </div>
</div>
```
手刻 absolute 對齊容易跑掉(Field 元件內 loading 指示與既有 endAction 垂直對齊不一致)。一律用 `loading` prop。

### disabled 的停用原因

停用原因由外部承擔，不在 input 內放 info icon：
- **Tooltip**：包住整個 Field 元件（wrapper `<div>` 不是 disabled 元素，可正常接收 hover）
- **Form help text**：在 input 下方說明（Form 層負責）

### 原生屬性與 mode

未顯式傳 `mode` 時,`disabled` / `readOnly` 原生屬性參與 mode 解析(disabled → `'disabled'`,優先於 fieldCtx.mode;readOnly → `'readonly'`,殿後);**顯式 `mode` prop 永遠最優先**,不被原生屬性覆蓋。完整 precedence 見「Field context cascade — SSOT」表。

---

## Error — 正交於 mode

Error 是 boolean prop，獨立於 mode。只在 `edit` 模式下有視覺效果（`border-error`）。

- Error 視覺在 Field（input）層級：紅色邊框 + `aria-invalid`
- Error 訊息在 Form 層級：help text 顯示在 input 下方
- Field 不在尾部放狀態 icon（如 ⚠️）——邊框顏色已經傳達了 error 狀態

Form wrapper 可透過 context 注入 `error` prop，消費者不需要在每個 Field 上手動傳。

---

## Field context cascade — SSOT（2026-06-08）

`<Field>` 透過 context 把欄位狀態流給「所有」子控件，控件**不可各自手刻解析邏輯**，一律消費 `field-context.ts` 的 resolver hook（SSOT，precedence 全庫一致）：

| 流下的狀態 | Resolver hook | Precedence |
|---|---|---|
| size | `useResolvedFieldSize(prop)` | prop > fieldCtx.size > surface-size > fallback |
| disabled | `useResolvedFieldDisabled(prop)` | prop > fieldCtx.disabled > false |
| mode | `useResolvedFieldMode({ mode, disabled, readOnly })` | 顯式 mode prop > 有效 disabled→`'disabled'` > fieldCtx.mode > readOnly > `'edit'` |
| variant | `useResolvedFieldVariant(prop)` | prop > fieldCtx.variant > `'default'` |
| error/invalid | `useResolvedFieldInvalid(prop)` | prop OR fieldCtx.invalid |

**precedence 關鍵**：顯式 prop 永遠最優先（故 DataTable cell 顯式傳 mode/size → 完全不受 context 影響）；其次「有效 disabled」（prop 或 `<Field disabled>`）強制 `'disabled'` 完整 chrome（對齊 MUI FormControl「disabled → label/input displayed in a disabled state」）。`<Field disabled>` 只設 `ctx.disabled=true`、`ctx.mode` 仍是 `'edit'`，故控件**必須讀 disabled 而非只讀 mode**，否則 `<Field disabled>` 失效（2026-06-08 PeoplePicker/Switch/Rating/Slider/Avatar 之 cascade bug 根因）。

### 哪些元件吃 `<Field disabled>` cascade（一致判斷標準）

判準 = **「這個元件是不是承載／編輯一個欄位值的互動控件？」**（對齊 MUI FormControl 對 form control 的 cascade、Ant `Form disabled` 排除非表單控件如 Segmented/Tabs）：

- **承載欄位值的互動控件** → 完整 cascade（disabled + 有 display 態者含 mode）：Input / NumberInput / Textarea / LinkInput / Select / Combobox / DatePicker / TimePicker / PeoplePicker / Switch / Checkbox / RadioGroup / Slider / SegmentedControl / Rating。
- **欄位內的展示元素**（Avatar）→ 跟隨 `<Field disabled>` / `<Field mode="disabled">` **變淡**（視覺一致），用 fieldCtx 存在性 scope（DataTable cell 無 fieldCtx → 不影響）。
- **獨立 action 元件**（Button）→ **不**自動 cascade；由 consumer 自控 `disabled`（對齊 MUI Button 無 FormControl 整合 + Ant 排除 custom／非表單控件）。

注：有 display 渲染分支者（Input 家族 / Select / Combobox / DatePicker / TimePicker / PeoplePicker / **Checkbox** / **Switch**，後二者 display = ✓/—）完整響應 `<Field mode="display"/"readonly">` + `<Field disabled>`；**Slider / Rating 無 display 態但有 readonly cascade**（2026-06-12 補:Slider readonly = 鎖互動保留視覺;Rating readonly = 星星鎖定 role=img）+ 響應 `<Field disabled>`;**SegmentedControl 無 display/readonly 態**（僅 enabled/disabled）→ 只響應 `<Field disabled>`。**group 控件（Checkbox/RadioGroup/Switch/SegmentedControl）雖非 fieldWrapperStyles 消費者，仍一律經 resolver hook 解析**（gate Check 1b/2 強制）。

**機械強制**：`scripts/check-field-cascade-resolve.mjs`（ci + release:preflight）—— 消費 `fieldWrapperStyles` 的控件若散落手刻 `fieldCtx?.{disabled,mode}` 解析（而非走 resolver hook）= fail，防新控件重演 cascade 漏接。

---

## Size — 與 Button 對齊

| Size | 高度 token | Tailwind | 字體 |
|------|-----------|----------|------|
| `sm` | `--field-height-sm` | `h-field-sm` | text-body |
| `md` | `--field-height-md` | `h-field-md` | text-body |
| `lg` | `--field-height-lg` | `h-field-lg` | text-body-lg |

高度使用 `--field-height-*` semantic token（rem 單位），與 Button 共用同一組 token，同 size 的 Field 和 Button 並排時高度一致。

---

## Focus 行為

`<input>` 元素在點擊和鍵盤 Tab 時都觸發 `:focus-visible`（瀏覽器規範：文字輸入永遠 focus-visible），CSS 無法區分。

統一使用 `border-primary`（1px），不加 ring、不加粗。

---

## 點擊與游標原則

### 點擊穿透

Field 內部所有不會觸發獨立 action 的元素必須 `pointer-events-none`，讓點擊穿透到底層的 input/select，確保使用者點擊 Field 內任何位置都能 focus/activate。

穿透（`pointer-events-none`）：startIcon、ChevronDown 下拉箭頭、tag 文字區域。
不穿透：endAction（clear、toggle password）、tag dismiss button——這些有自己的 action。

### 游標指引

可點擊的元素必須有明確的 cursor 變化：
- endAction、dismiss button → `cursor-pointer`
- input / select → `cursor-text` / `cursor-pointer`（原生行為）
- disabled → `cursor-not-allowed`

## Icon 色彩原則

跨元件統一規則（詳見 `item-anatomy.spec.md`）：**icon 代表內容/類別 → 與 label 同色；icon 純指示方向 → fg-muted（neutral-7）。**

Field 內的具體套用：

- **startIcon**（Search、Calendar）：`fg-muted`——指示 field 用途，不是 value
- **ChevronDown 下拉箭頭**：`fg-muted`——指示可下拉
- **代表 value 的 icon**（如狀態 icon）：**foreground**——icon 本身就是 value 的一部分
- **disabled 時**：所有 icon 統一 `fg-disabled`

## startIcon

左側靜態 icon，輔助使用者理解 input 的用途（如 Search icon）。屬於 input 的視覺提示，不屬於 value。

- 顏色 `fg-muted`（disabled 時 `fg-disabled`）
- `aria-hidden`——純裝飾
- 命名與 Button 的 `startIcon` 一致

## 下拉箭頭（Select / Combobox）與類型身份 indicator

Select / Combobox 的 ChevronDown、DatePicker 的 Calendar、TimePicker 的 Clock = **類型身份 indicator**(「這是什麼欄位」)。**edit 顯示(可互動)/ readonly 不顯示 / disabled 顯示(灰示)**(2026-06-26 user 拍板;readonly = 純值顯示、不可開下拉 → 箭頭會誤導故不顯;disabled 保留對齊原生 `<select disabled>` 灰示箭頭 + MUI #19833 / Carbon read-only「keep icon signifiers de-emphasized」/ Accordion M24 precedent):

- edit:`fg-muted`;**readonly:不顯示 indicator**;**disabled:`fg-disabled`**(對齊上方 Icon 色彩原則)
- 不可互動(`pointer-events-none`)——下拉由 select 元素本身觸發
- **Cell(naked variant)例外**:indicator 依 `showDisplayEndIcon`(= cell 的 isEditable)——非可編欄不顯(2026-05-10 cell canonical「indicator = editable affordance」);**可編欄的 disabled cell 顯示 + fg-disabled**(同表單邏輯)
- locked(readonly/disabled)wrapper 並設 `aria-disabled`(disabled 時)——styled-disabled 非原生元素需明告 AT inactive,亦使 axe 正確套用 WCAG 1.4.3 inactive-UI 豁免
- clearable 有值時：clear X 在左，ChevronDown 在右
- **右側元素(clear / chevron / calendar / clock)右緣水平內距 = `--field-px`(12px,SSOT `tokens/uiSize/uiSize.css`),edit / readonly / disabled / display 全 mode 一致**(跟 Input 一致)。**tag 模式特例**:左側 `tagPadding` 用對稱 px-calc(≈8px)貼齊 tags、會吃掉右緣,故 tag 容器(含 readonly/disabled)**必 re-assert `paddingRight: var(--field-px)`** 對齊 edit;漏接 = chevron 右緣偏移 bug(2026-06-27 修 Select:354 / Combobox ReadonlyMultiSelect)
- **多行(Combobox tag wrap)垂直對齊**:tags 換行、容器動態變高時,右側 chevron **鎖第一行 tag 中線**(非整體置中)——容器 `items-start` + `ItemSuffix self-start` + `style={{ height: tagHeight }}`(sm 20 / md+lg 24)。對齊 item-anatomy「suffix 永遠 `h-[1lh]` 對齊第一行」canonical;edit / readonly / disabled 全 mode 一致(2026-06-27 補 readonly/disabled wrap 漏接)

## Select 顯示模式

Select 支援兩種顯示模式（`display` prop）：

| 模式 | edit | readonly / disabled | 適用場景 |
|------|------|---------------------|---------|
| `plain`(預設) | 原生 select 純文字 + ChevronDown | 跟 Input 一致（純文字 + 標準 padding） | 狀態、類別等文字選項 |
| `tag` | Tag + 隱藏 select overlay + ChevronDown | Tag + tagPadding | 需要視覺標記的選項（顏色標籤等） |

`plain` 模式可搭配 `startIcon`(代表 value 的圖示,如狀態 icon;2026-05-01 由 `text` 改名 `plain`,rationale 見 `select.spec.md`)。

`tag` 模式的 edit 用 hidden select overlay(跟 Combobox 同模式),Tag 用 `pointer-events-none`,點擊穿透到 select。右側元素右緣 = `--field-px`(見上方「右側元素」canonical;tag 模式 readonly/disabled 必 re-assert)。

tagPadding 只在有 Tag 時才套用。Placeholder/空值狀態使用 fieldWrapper 的標準 `--field-px`(`px-[var(--field-px)]`)padding，確保文字與邊框有足夠間距。

---

## endAction（Inline Action）

右側可互動元素，用於操作動作（清除內容、顯示密碼等）。

使用宣告式 API：

```tsx
<Input endAction={{ icon: X, label: '清除', onClick: handleClear }} />
```

Field 內部用 `<ItemInlineAction>`(`patterns/element-anatomy/item-anatomy.tsx` 共用元件)渲染 — 跟 Sidebar / TreeView / DropdownMenu 的 inline action **完全同一套** canonical 實作,不再有「每個 host 自己複製 18 行 button JSX」的漂移。

- 共用規則見 `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」節
- Helper 規格與 API 見 `item-anatomy.spec.md` 的「Inline action 共用元件」節
- Field host 必須傳 `size={size}` 給 `<ItemInlineAction>`(field 不在 `RowSizeContext` 內,需明確覆寫)

Icon 色彩遵循 Inline Action 統一規則:預設 `fg-muted`,hover 時 `foreground`。

- disabled / readonly 模式不渲染 endAction
- 條件渲染即可——消失後不佔位,input 自然擴展
- 下拉箭頭不屬於 endAction,屬於 Select / Combobox

**特例:Tag dismiss**——Tag 的 dismiss button 需要 chromatic hover bg(跟 tag 的 solid variant 色相一致),不是中性的 neutral-hover。2026-05-01 起改消費 `ItemInlineActionButton` + `hoverBgClassName` override prop 套色相 token(消除原自刻 `<button>` 繞 DS infra 的 tech debt),詳見 `tag.tsx` TagDismiss 註解。

**Escape hatch**(10% case config 表達不出時):每 Field host 提供 `endSlot?: React.ReactNode`,規則 SSOT 見 `patterns/element-anatomy/inline-action.spec.md`「Escape hatch」節。

---

## Display — 格式化顯示(mode="display")

每個 Field 元件以 `mode="display"` 渲染分支把 raw value 格式化為純展示輸出(已取代過往的 `XxxDisplay` 子元件;唯一現存 cross-component display primitive 是 PeoplePicker 的 `PersonDisplay`)。

Display 的消費者:
- **DataTable cell**:cell-registry 根據 `meta.type` 選對應 Field 元件並傳 `mode="display"`(disabled cell 傳 `"disabled"`)
- **Field readonly 模式**:內部使用相同的格式化邏輯

### null / undefined 值

Display 模式統一顯示 em dash `—`，顏色 `text-fg-muted`。edit 模式顯示空白。

此規則適用於所有 Field 類型，boolean 例外（顯示 unchecked 狀態）。

### DataTable 整合

DataTable 根據 column 的 `meta.type` 自動選擇 Field 元件(以 `mode="display"` 渲染):

```tsx
// 自動渲染——不需要手寫 cell
col.accessor('price', {
  header: 'Price',
  meta: { type: 'currency', prefix: '$' },
})

// 客製化——有自訂 cell 時完全跳過 type → Display
col.accessor('status', {
  header: 'Status',
  cell: (info) => <MyCustomBadge status={info.getValue()} />,
})
```

兩者可在同一張 table 混用。

---

## 共享 contract(2026-05-12 Stream C — Selected renderer / Placeholder vocabulary / Cell surface)

**(a) Selected value renderer**:rich display(avatar+name/icon+label)元件**必**提供 consumer renderer slot,**display/readonly/disabled/edit** 4 mode 共享同一 renderer(禁 edit-only)。`Select.selectedItemRenderer` / `Combobox.tagRenderer`(edit 已接;display path unify deferred 下 cycle)/ PeoplePicker 走 `PersonDisplay`+`MultiPersonDisplay`+`Combobox.tagRenderer`。對齊 MUI Autocomplete `renderValue` / Ant Select `tagRender`+`labelRender`+`optionRender` / MUI DataGrid `renderCell`+`renderEditCell` 共享 params。 <!-- @benchmark-unverified -->

**(b) Placeholder vocabulary**(3 props 對 3 UI state,**不可混用**):
- `placeholder` — trigger empty(沒選值,例「請選擇人員」)— Ant/Polaris/Carbon canonical
- `searchPlaceholder` — search input hint(例「搜尋人員…」)— Ant `searchPlaceholder`
- `emptyText`/`noResultsText` — filtered menu 無結果(例「沒有符合的人員」)— Ant `notFoundContent` / Material X `localeText.noResultsOverlayLabel`

**禁**:wrapper 把 `emptyText`(search-empty)silent forward 成 `emptyPlaceholder`(trigger-empty);**Combobox `emptyPlaceholder` deprecated**,保留 1 cycle fallback,future `placeholder` 唯一 trigger source。Hook `check_field_controls_contracts.sh` (contract b) 機械強制。

**(c) Cell surface metrics**:Field family 在 cell 內**禁** hardcode padding(`tagAreaPaddingLeftPx={isEmpty ? undefined : 8}` 反 pattern)。改 **`FieldSurface` context**(`'form' | 'toolbar' | 'table-cell'`):`useFieldSurface()` 取值,`<FieldSurfaceProvider surface="table-cell">` 自動套於 `cell-registry.resolveCellComponent`。Consumer 用 `surface === 'table-cell'` 顯式 query(取代 `variant === 'naked'` heuristic)。**risk mitigation**:`avatar.left = cell.left + computed(--table-cell-px)`,禁再加 magic 8px(double-count)。**Token scope**:`--table-cell-px/py` 是 DataTable-scoped metric(CSS 定義在 `data-table.css`,Field naked variant 是 DataTable cell substrate sub-component 故 cross-path reference 不算真 cross-component),per 2026-05-13 codex Q2 verdict + AG Grid `cellHorizontalPadding`(grid theme param)/ MUI X `cellClassName`(per-cell)/ Carbon spacing scale primitive(不升 cell padding 全域 token)idiom — **不**升 `tokens/layoutSpace/` canonical。對齊 AG Grid cellRendererSelector / Material X DataGrid 共享 params / Notion property type registry。Hook `check_field_controls_contracts.sh` (contract c) 機械強制。 <!-- @benchmark-unverified -->

**(d) Default variant display = zero chrome SSOT**(2026-05-13 user 拍板 Path Ⅰ + codex V2 verdict):default `mode='display'` **必** zero chrome。Display 純展示語意,真要包 chrome 走 `readonly` 或 `showDisplayEndIcon=true` opt-in。**Impl**:`field-wrapper.tsx` + `textarea.tsx` compoundVariants `mode:'display'+variant:'default'` 加 `!px-0 !py-0`。對齊 Carbon read-only / Stripe display / Notion property / Polaris readonly。Hook `check_field_controls_contracts.sh` (contract d) propose。 <!-- @benchmark-unverified -->

**(e) Display typography canonical**(2026-05-14 user I2 + codex M31 verdict):Field family display path **必** consume `fieldWrapperStyles` size variants typography token — `sm/md → text-body`(14px line-height 1.5)/ `lg → text-body-lg`(16px)。**禁**:LinkInput / Select / Combobox 非 D-path 的 bare-span 直接 render 無 font-size class(瀏覽器 default 字體);**必**包 `text-body` (sm/md) / `text-body-lg` (lg) class。對齊跨 Field family display 視覺尺寸統一(user 抓 LinkInput display 字體跟其他 Field 不一致 = SSOT 違反 漏接 typography token)。**Impl**:LinkInput / Select / Combobox / DatePicker / TimePicker non-D-path bare-span 加 size-aware text class。world-class cite:MUI X DataGrid `Typography` consistent / Atlassian @atlaskit/textfield size-prop typography token / Polaris TextField typographyToken size-aware。 <!-- @benchmark-unverified -->

---

## 邊界案例(家族共用 pointer)

- **極長輸入溢出**:由各元件 spec own — Input 超寬走原生水平捲動(`input.spec.md`「邊界(內容超寬)」)、Textarea 內容超出時 native 內部捲動 / display 態隨內容增高(`textarea.spec.md`「極長文字」)。
- **常見誤解 — disabled 時 label 該隱藏?**:不隱藏 — label 保留但變灰(`FieldLabel` disabled 灰化、required 星號同步 `text-fg-disabled`,SSOT `Field/field.spec.md`);停用原因由外部 Tooltip / help text 承擔(見「disabled 的停用原因」)。

## 表單驗證原則

詳見 `Field/form-validation.spec.md`。

## 禁止事項

- ❌ 不在 disabled input 內放 info icon——停用原因由外部 Tooltip 或 Form help text 承擔
- ❌ 不在 input 尾部放 error 狀態 icon——邊框顏色已傳達 error
- ❌ endAction 不可傳入 ReactNode——使用 InlineActionConfig 宣告式 API
- ❌ endAction 的 inline action 不可省略 `aria-label`（即 `label` 欄位）
- ❌ Display 的 null 值不可顯示空白——統一使用 `—`（em dash）+ `text-fg-muted`
- ❌ Field 的 readonly 模式不可用於 DataTable cell——readonly 有底色和 wrapper 開銷，table cell 用 Display 元件

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `checkbox.spec.md`
- `circular-progress.spec.md`
- `combobox.spec.md`
- `date-picker.spec.md`
- `element-anatomy.spec.md`
- `field-control-group.spec.md`
- `field.spec.md`
- `form-validation.spec.md`
- `input.spec.md`
- `item-anatomy.spec.md`
- `link-input.spec.md`
- `number-input.spec.md`
- `people-picker.spec.md`
- `rating.spec.md`
- `segmented-control.spec.md`
- `select.spec.md`
- `slider.spec.md`
- `switch.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`
