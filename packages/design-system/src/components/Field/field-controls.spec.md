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
> Family 4 (Field Control Layout) SSOT owner。Input / NumberInput / DatePicker / Select / Combobox / LinkInput / TimePicker / Textarea / PeoplePicker 等皆消費 `fieldWrapperStyles` / edit-readonly-disabled 三態 mode architecture / endAction 處理 / `mode="view"` 渲染 pattern / Inline Action canonical(後者也 cascade 到 Sidebar / TreeView / DropdownMenu)。scope 本質 > 單一元件。

> **注意**：此文件是 Field Controls（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker 等)**共用**的設計原則，與 `Field/field.spec.md`（表單 Layout 容器）**不是同一個東西**。
>
> - **Field Controls**（本文件）：具體的資料型別輸入元件，內部含 edit/readonly/disabled 三態 + 格式化 + DataTable Display 共用
> - **Field**（`Field/field.spec.md`）：shadcn 風格的表單 Layout 容器（label + description + error），wrap 上述 Field Controls 元件

**Layout Family**：本 spec 是 CLAUDE.md 4-Family Model **Family 4（Field Control Layout）的 SSOT**。結構 `fieldWrapperStyles + [startIcon?] [<editable content>] [endAction?]`，**視覺對齊 Family 1（Menu item layout）**——Select trigger 的高度 / 字體 / icon size 必須跟其 SelectMenu options 連續一致。Consumers: Input（canonical）, NumberInput, DatePicker, Select, Combobox, LinkInput, PeoplePicker。

## 定位

Field Controls 是資料輸入與顯示的基礎元件。每種資料類型（text、number、date、select...）對應一個元件，同時服務 Form 和 DataTable：

- **Form**：用 Field Controls 的 edit / readonly / disabled 三態（在 Field 容器內）
- **DataTable**:以 Field Controls 的 `mode="view"` 渲染 cell

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
├── Input/                      ← Input(含 mode="view";與 Field 平行的兄弟目錄,以下同)
├── NumberInput/                ← NumberInput(含 mode="view" + formatNumber)
├── DatePicker/                 ← DatePicker(含 mode="view" + formatDate)
├── Select/                     ← Select(含 mode="view")
├── Combobox/                   ← Combobox(含 mode="view")
├── LinkInput/                  ← LinkInput(含 mode="view")
├── PeoplePicker/               ← PeoplePicker + PersonDisplay(cross-component primitive)
└── Textarea/                   ← Textarea(多行)
```

每個元件統一以 `mode` prop 切換樣態：
1. **edit / readonly / disabled** — Form 用，可編輯 / 鎖定 / 不可用
2. **`mode="view"`** — DataTable cell 用，純格式化顯示（取代過往的 `XxxDisplay` 子元件）

---

## Field 框架地圖(兩軸 + InlineEdit 疊上層)— SSOT(2026-07-09 user 拍板收斂)

Field 家族 = **一個 `fieldWrapperStyles` cva + 兩條正交軸**;`InlineEdit` 是**疊在其上的組合 primitive**,不屬於任一軸。此段為「框架為何長這樣」的單一住所。

**軸一 `mode`(4)× 軸二 `variant`(2)**(2026-07-16 round16 `display`→`view` 更名 + Model A):`variant` 只有 `default`(公開,完整 chrome)與 `naked`(`@internal`,cell-as-input:edit×naked 自畫 border-based state machine,view×naked 用 transparent border 由 host cell 供視覺邊框;只 DataTable `cell-registry.tsx` 消費)。`bare`(透明外殼)**2026-07-09 退役**;SSOT `field-types.ts` `FieldVariant`。有效組合:default × {edit/view/readonly/disabled};naked × {edit/view}。**`readonly×naked` / `disabled×naked` 死格 2026-07-16 移除**——DataTable cell「disabled」態廢除 + readonly 從不入 naked,全庫 0 消費;軸對稱靠 cva 省略天然覆蓋。readonly 2026-07-09 補鍵盤 focus ring(WCAG 2.4.7)。**型別層 public/internal union(2026-07-14 API 策展 E)**:公開 `FieldVariant = 'default'`;`naked` 收 `FieldVariantInternal`(`@internal`),cell-registry 經 `WithFieldVariantInternal` 消費。

**軸一 `view` mode = Model A(2026-07-16,user GO)**:`view`(原 `display`)= 非表單的值呈現(cell / InlineEdit / 詳情)。**`view×default` = edit 幾何減 chrome**——保留 `px-[--field-px]` + `py` + `h-field`,只拔 border/bg(透明);推翻 2026-05-13 Path Ⅰ 的 `!px-0 !py-0`。理由:view 對齊「edit 值位置」(非 label 左緣)→ 水平垂直都留 → view 與 edit **同一顆控件、只差 chrome** → read↔edit 零跳。**`view×naked` = bare**(host TD 給 padding),與 view×default **不同用途、不 collapse**。世界級對照 [Atlassian inline-edit](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx)(read=edit 幾何)+ Bootstrap [`.form-control-plaintext`](https://github.com/twbs/bootstrap/blob/main/scss/forms/_form-control.scss)(留 padding)。geometry 抽 `fieldViewGeometry(size, multiline)` helper(view×default 幾何 SSOT)。

**軸二 就地編輯 host(InlineEdit ＝ DataTable cell,同一份語義,2026-07-16)**:只有 **`view ↔ edit` 二態 + `editable` 判準閘**(布林/callback,預設 true),**無 disabled 態**——世界級就地編輯 detail-pane / grid 皆無 disabled cell:[MUI X isCellEditable](https://mui.com/x/react-data-grid/editing/) / [AG Grid editable](https://www.ag-grid.com/react-data-grid/cell-editing/)。`editable=false` → view 無 hover 入口、無藍框、**不灰化**。永久唯讀資料 → 用 `<Control mode="view">`,不用 disabled。

**InlineEdit ≠ mode ≠ variant**:它是 **view↔edit 二態切換**——靜止 = 純值/格式化(內容 + 隱形 Pressable),點擊/Enter 才生一個 **edit-mode Field 控件**(預設 `<Input mode="edit">`,可 `renderEdit` 換 Textarea/Select)。站在 mode 軸**之上**。**Model A:InlineEdit 不自帶 geometry cva**——**兩條 view 路徑都用 `fieldViewGeometry`(field-px)**(2026-07-17 對齊 root cause 修):(a) 值-格式化路徑用 `fieldViewGeometry` **包住** `<Control mode="view">`(委派控件 bare view 皆 0px → 包住統一 field-px + 內部格式化間距仍由控件提供);(b) 純值/標題 `<Tag>` 直接套 `fieldViewGeometry`。本體只給:**orientation-aware `-mx`(vertical 含 standalone 貼 label / horizontal 對齊 sibling;不依 fieldCtx)**+ exit 保證(pointerdown-outside)+ hover bg + focus 藍框 + 隱形 Pressable。edit 態完全繼承原 field(Jira 式)。

**`naked` vs `InlineEdit`(不同層級,非冗餘)**:`naked` = 視覺外殼變體(chrome 層),靜止態**仍是控件**(裸 input),對應 in-cell 即時編輯;`InlineEdit` = 互動組合(behavior 層),靜止態**不是控件**(純值),對應 click-to-edit。各自獨立。

**InlineEdit 多行 / padding / 零位移契約(Model A)**:read↔edit 零跳 = view 與 edit **同一顆控件、只差 chrome**。**多行(`multiline`)**:edit 自動用 `<Textarea mode="edit">`,view 用 `fieldViewGeometry(size, true)` = `items-start py-2`(**= Textarea edit `py-2`**)。**多 tag / avatar / prefix 換行的 wrap py 由委派控件 view mode 提供**(= 它 edit 的 py)—— 故 view×default **不可** collapse 成 `!py-0`。水平:InlineEdit `-mx-[--field-px]` 拉整塊到欄左緣、view(`fieldViewGeometry` 統一 `px-[--field-px]`,含委派控件 bare view 被包住)被 -mx 抵消 → 值/tag 落 label x=0。edit 態繼承原 field(不統一 px)→ 純文字零跳、tag ~6px 微移(Jira 式)。pixel 鎖 `scripts/probe-inline-edit-align.mjs`。

---

## Mode — 表單三態 (view 見下方 View 段)

下表涵蓋 Form-context 三態(edit / readonly / disabled);完整 `FieldMode` 為四值(`'edit' | 'view' | 'readonly' | 'disabled'`,2026-07-16 `display`→`view` 更名),`view`(非表單值呈現)於下方 `## View` 段記載。

| Mode | 底色 | 邊框 | 文字色 | 用途 |
|------|------|------|--------|------|
| `edit` | surface | border（hover 深一階、focus primary） | foreground | 表單可編輯欄位 |
| `readonly` | neutral-2(`--bg-readonly`)| 無 | foreground | 表單中不可編輯但可見的欄位 |
| `disabled` | neutral-2(`--bg-disabled`)| 無 | fg-disabled | 表單中被停用的欄位 |

三種模式共用同一個 wrapper 結構（`fieldWrapperStyles`），只有底色、邊框、文字色不同。

**Boolean / 單選控件的 readonly(2026-06-12 user 拍板)**:Field 內 readonly 的 Checkbox / Switch = 同一 `fieldWrapperStyles` readonly 灰框 + ✓/—(view 同款值語言);RadioGroup = 灰框 + 選中項 label(= Select readonly 同款呈現)。理由:同一張 readonly 表單中,文字控件有灰框鎖定訊號、boolean 保留全彩控件會誤導「仍可操作」(世界級 0/4 採原樣鎖互動:Salesforce = ✓ 無框靜態 glyph / SAP = 靜態文字 / Atlassian = readView / Ant Pro = 文字)。standalone readOnly(settings list / SelectionItem row)維持原樣鎖互動。**邊界**:Rating readonly = 星星本身(星星即值語言,role=img,全業界 review-stars canonical,不包灰框);Slider 在 `<Field mode="readonly">` 內 = 鎖互動保留正常視覺(value 可讀不降色,pointer-events-none + thumb tabIndex=-1)。

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

Field wrapper 透過 context 注入的 key 是 `invalid`(**非 `error`**;field.tsx:122/211);各控件以 `useResolvedFieldInvalid` 合併自身 `error` prop 與 context `invalid`,消費者不需在每個控件手動傳。（`error` 另為 `fieldWrapperStyles` 內部 cva 軸名 + 各控件公開 boolean prop;Field 容器層 / context 一律用 `invalid`。）

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

- **承載欄位值的互動控件** → 完整 cascade（disabled + 有 view 態者含 mode）：Input / NumberInput / Textarea / LinkInput / Select / Combobox / DatePicker / TimePicker / PeoplePicker / Switch / Checkbox / RadioGroup / Slider / SegmentedControl / Rating。
- **欄位內的展示元素**（Avatar）→ 跟隨 `<Field disabled>` / `<Field mode="disabled">` **變淡**（視覺一致），用 fieldCtx 存在性 scope（DataTable cell 無 fieldCtx → 不影響）。
- **獨立 action 元件**（Button）→ **不**自動 cascade；由 consumer 自控 `disabled`（對齊 MUI Button 無 FormControl 整合 + Ant 排除 custom／非表單控件）。

注：有 view 渲染分支者（Input 家族 / Select / Combobox / DatePicker / TimePicker / PeoplePicker / **Checkbox** / **Switch**，後二者 view = ✓/—）完整響應 `<Field mode="view"/"readonly">` + `<Field disabled>`；**Slider / Rating 無 view 態但有 readonly cascade**（2026-06-12 補:Slider readonly = 鎖互動保留視覺;Rating readonly = 星星鎖定 role=img）+ 響應 `<Field disabled>`;**SegmentedControl 無 view/readonly 態**（僅 enabled/disabled）→ 只響應 `<Field disabled>`。**group 控件（Checkbox/RadioGroup/Switch/SegmentedControl）雖非 fieldWrapperStyles 消費者，仍一律經 resolver hook 解析**（gate Check 1b/2 強制）。

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

## 寬度軸(width: fill / hug)— 正交軸(2026-07-08 user 拍板)

Field 家族 wrapper 的寬度軸,與 mode / variant / size / error 全部正交:

| width | 行為 | 何時用 |
|-------|------|--------|
| `fill`(default)| `w-full` 填滿容器 — 原行為,零回歸 | form 表單直欄(欄位左緣對齊)、DataTable cell |
| `hug` | `w-fit max-w-full` 依內容收縮 | detail pane inline metadata(狀態/優先級/負責人 點擊即編輯)、toolbar 內 field |

**定義(user verbatim)**:hug 寬 = value 寬 + 其中各元素寬 + 彼此間距 + field 內部 padding —— **框線、互動、樣式全部不變,只有寬度變**(就是一般 field 把寬度改 hug)。`max-w-full` 保證窄容器不溢出(`min-w-0` + truncate 照常)。

- 鋪線範圍:`fieldWrapperStyles` cva 軸(SSOT)+ Select / Combobox / DatePicker / PeoplePicker 轉發 `width?: FieldWidth`(型別 `Field/field-types.ts`)
- **何時不用**:form 直欄(fill 對齊)、DataTable cell(naked 已 `!h-full` 滿格,cell 寬由 column 管)
- Benchmark(M22):shadcn v4 SelectTrigger 預設 `w-fit`(https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/select.tsx)/ Radix Select Trigger intrinsic sizing(https://www.radix-ui.com/primitives/docs/components/select)

---

## Focus 行為

`<input>` 元素在點擊和鍵盤 Tab 時都觸發 `:focus-visible`（瀏覽器規範：文字輸入永遠 focus-visible），CSS 無法區分。

**可編輯文字輸入(edit / naked mode 的 input / textarea)**:統一 `border-primary`（1px），不加 ring、不加粗。

**readonly(可聚焦但不可編輯的 input,2026-07-09 補 — 消解框架地圖 cross-ref)**:用 **ring idiom**(`[&:has(:focus-visible)]:ring-2 ring-ring ring-offset-1`;native text input 的 :focus-visible 在滑鼠點擊時**亦 match** — 對齊本段開頭「文字輸入永遠 focus-visible、CSS 無法區分點擊與 Tab」,勿宣稱僅鍵盤),**非** border-primary —— readonly 邊框 transparent 無可染,且 ring 語義=「可聚焦但非文字輸入」(對齊 Button / Tab / Checkbox);滿足 WCAG 2.4.7(readonly 有值渲染可聚焦 native input 需 focus 指示)。詳 `field-wrapper.tsx` readonly compound JSDoc。

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
- **Cell(naked variant)**:**view 態零恆顯 indicator(2026-07-08 user 拍板 A 案,推翻 2026-05-10「indicator = editable affordance」)** —— editable affordance 統一 = hover outline(field.spec.md L4)。Benchmark 6/6 product-table 域(Ant editable-cells / MUI X singleSelect / AG Grid / Atlaskit inline-edit(v2.0.0 移除 hover-pencil 後 9 版未回歸)/ Notion / Airtable)view 態皆純值零 icon;恆顯派僅 Google Sheets Chip/Arrow(spreadsheet 域可選檔位)。`showDisplayEndIcon` prop 保留為 opt-in 逃生門(spreadsheet-flavored 消費端);cell-registry 6 個 picker 站不再傳、url 站傳 `isEditable === true`(LinkInput 例外 = wrapper-only 無 icon,取 display↔edit 像素對齊)。edit 態 indicator 照舊(本節上方 form 規則);opt-in 時 (opt-in 時保留)(同表單邏輯)
- locked(readonly/disabled)wrapper 並設 `aria-disabled`(disabled 時)——styled-disabled 非原生元素需明告 AT inactive,亦使 axe 正確套用 WCAG 1.4.3 inactive-UI 豁免
- clearable 有值時：clear X 在左，ChevronDown 在右
- **右側元素(clear / chevron / calendar / clock)右緣水平內距 = `--field-px`(12px,SSOT `tokens/uiSize/uiSize.css`),edit / readonly / disabled / view 全 mode 一致**(跟 Input 一致)。**tag 模式特例**:左側 `tagPadding` 用對稱 px-calc(≈8px)貼齊 tags、會吃掉右緣,故 tag 容器(含 readonly/disabled)**必 re-assert `paddingRight: var(--field-px)`** 對齊 edit;漏接 = chevron 右緣偏移 bug(2026-06-27 修 Select:354 / Combobox ReadonlyMultiSelect)
- **多行(Combobox tag wrap)垂直對齊**:tags 換行、容器動態變高時,右側 chevron **鎖第一行 tag 中線**(非整體置中)——容器 `items-start` + `ItemSuffix self-start` + `style={{ height: tagHeight }}`(sm 20 / md+lg 24)。對齊 item-anatomy「suffix 永遠 `h-[1lh]` 對齊第一行」canonical;edit / readonly / disabled 全 mode 一致(2026-06-27 補 readonly/disabled wrap 漏接)

## Select 顯示模式

Select 支援兩種顯示模式（`display` prop）：

| 模式 | edit | readonly / disabled | 適用場景 |
|------|------|---------------------|---------|
| `plain`(預設) | 原生 select 純文字 + ChevronDown | 跟 Input 一致（純文字 + 標準 padding） | 狀態、類別等文字選項 |
| `tag` | Tag + 隱藏 select overlay + ChevronDown | Tag + tagPadding | 需要視覺標記的選項（顏色標籤等） |

`plain` 模式可搭配 `startIcon`(代表 value 的圖示,如狀態 icon;2026-05-01 由 `text` 改名 `plain`,rationale 見 `select.spec.md`)。

`selectedItemRenderer` 設定時優先於 plain / tag 預設呈現,且 **4 mode(edit/view/readonly/disabled)共享**(共享 contract (a),見下方)— view 態渲染 renderer 輸出(值內容),無 chrome 無 chevron。

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

- 共用規則見 `patterns/element-anatomy/inline-action.spec.md`(canonical SSOT,2026-04-24 自 item-anatomy 抽出;Field endAction 屬 neutral host 支)
- Helper 規格與 API 見 `item-anatomy.spec.md` 的「Inline action 共用元件」節
- Field host 必須傳 `size={size}` 給 `<ItemInlineAction>`(field 不在 `RowSizeContext` 內,需明確覆寫)

Icon 色彩遵循 Inline Action 統一規則:預設 `fg-muted`,hover 時 `foreground`。

- disabled / readonly 模式不渲染 endAction
- 條件渲染即可——消失後不佔位,input 自然擴展
- 下拉箭頭不屬於 endAction,屬於 Select / Combobox

**特例:Tag dismiss**——Tag 的 dismiss button 需要 chromatic hover bg(跟 tag 的 solid variant 色相一致),不是中性的 neutral-hover。2026-05-01 起改消費 `ItemInlineActionButton` + `hoverBgClassName` override prop 套色相 token(消除原自刻 `<button>` 繞 DS infra 的 tech debt),詳見 `tag.tsx` TagDismiss 註解。

**Escape hatch**(10% case config 表達不出時):每 Field host 提供 `endSlot?: React.ReactNode`,規則 SSOT 見 `patterns/element-anatomy/inline-action.spec.md`「Escape hatch」節。

---

## View — 值呈現(mode="view",Model A;2026-07-16 原 `display` 更名)

每個 Field 元件以 `mode="view"` 渲染分支把 raw value 格式化為純展示輸出(取代過往 `XxxDisplay` 子元件;唯一現存 cross-component view primitive 是 PeoplePicker 的 `PersonDisplay`)。**Model A 幾何**:`view×default` = edit 幾何減 chrome(留 `px`/`py`/`h-field`,只拔 border/bg)——見上方「軸一 view mode」。

View 的消費者:
- **DataTable cell**:cell-registry 根據 `meta.type` 選對應 Field 元件並傳 `mode="view"`(variant="naked";2026-07-16 cell「disabled」態廢除,鎖定用 `editable:(row)=>false`)
- **InlineEdit view 態**:委派 `<Control mode="view">` 取格式化 + 幾何(read=edit 同一顆控件)
- **Field readonly 模式**:內部使用相同的格式化邏輯

**例外 — LinkInput / PeoplePicker 預設 view 路徑不包 wrapper**(code 為準,2026-07-16 明文):LinkInput `mode="view"` 預設(`showDisplayEndIcon=false`)= 裸 span/anchor(`fieldDisplayTextClass` + truncate),**不消費** `fieldWrapperStyles` / `fieldViewGeometry` —— view 值是可點擊連結,inline 嵌入取 flush 呈現(backward compat);`showDisplayEndIcon=true` opt-in 才包 `fieldWrapperStyles(view × resolvedVariant)` 取 cell view↔edit 像素對齊。PeoplePicker 預設 view 同模式(裸 `PersonDisplay`/`MultiPersonDisplay`)。詳 `link-input.tsx` / `people-picker.tsx` docblock。

### null / undefined 值(2026-07-08 user 拍板 — 半形 hyphen + editable × surface 分流)

> **user verbatim**:「table cell 不可編輯的空值,單獨不可編輯的 display 的空值,單獨的 readonly 的空值都用"-";單獨可以編輯的 edit 輸入框的空值則是 placeholder;table cell 內可編輯的 display 的空值就是為空」+「我從頭到尾哪裡有說要用全形的」。

空值符號 = **半形 hyphen `-`(U+002D)**,**非**全形 em dash `—`(U+2014)。分流看 **surface × 是否可編輯 × mode**(SSOT 機械層 = `field-context.ts` `useFieldEmptyDisplay()` + `EMPTY_DISPLAY` 常數 `field-wrapper.tsx`;全 Field family view/readonly/disabled 空值渲染必經此 hook,**禁**直接引 `EMPTY_DISPLAY` 常數):

| 情境 | 判準 | 空值顯示 | 依據 |
|---|---|---|---|
| 不可編輯 — standalone view / readonly | mode ∈ {view, readonly} 且非可編輯 table cell | **半形 `-` + `text-foreground`** | 唯讀資料「此欄無值」明示;Ant ProTable `columnEmptyText` 預設 `'-'`(https://github.com/ant-design/pro-components/blob/master/src/table/Table.tsx)|
| 不可編輯 — table cell(readonly cell)| `surface==='table-cell'` 且 `isEditable===false` | **半形 `-`** | 同上;非可編欄位視同唯讀資料 |
| **可編輯** — table cell view 靜止態 | `surface==='table-cell'` 且 `isEditable===true` 且 mode='view' | **全空白 `''`** | grid 域壓倒性共識(MUI X `valueToRender?.toString()` null 短路 / AG Grid `_toString(null)`→不設 textContent / Ant core rc-table 裸值 / Notion / Airtable);表格密集時「-」海 = 視覺噪音。空 editable cell 的 affordance = hover outline(field.spec.md L4),非佔位符 |
| **可編輯** — form / panel edit 輸入框 | mode='edit' 且非 table cell | **native placeholder** | 標準表單輸入提示;「hover 才顯 placeholder」十路查證零家採用,**禁** |
| **可編輯** — table cell edit / focus | `surface==='table-cell'` 且 mode='edit' | **全空白**(DataTable cell 不接 placeholder)| 對齊 Notion / Airtable cell 編輯裸輸入 |

收斂式:`surface==='table-cell' && isEditable ? '' : '-'`(可編輯 form edit 走 native placeholder,不經此 hook)。`isEditable` 由 DataTable cell registry 經 `FieldSurfaceEditableProvider` boolean context 注入(standalone / form 無此 context → 預設 false → `-`)。

**readonly native input 兩派統一**(2026-07-08):Input / Textarea 的 readonly **空值** 改走 view-span 顯 `-`(原走 native `<input readOnly>` 吐 native placeholder / 空白);readonly **有值** 仍走 native input 保留選取/複製語意。NumberInput 早已 `resolvedMode !== 'edit'` 統一走 span,無需改。「有值」判定(2026-07-14 補註,dual-model consensus;不改空值顯 `-` 規則本身):uncontrolled(只傳 `defaultValue`)同樣算有值 —— 機械層 = `useControllable` 內部 resolved value(defaultValue 初始 + 打字寫回,native element 由 `value={resolved}` 內部驅動)+ form.reset() bridge(HTML reset 不發 input event → uncontrolled 掛 form `reset` listener 把 resolved 歸位 defaultValue),切 view / readonly(native element unmount/remount)後判定與 DOM 真值一致、不顯 stale 值;controlled 純 passthrough 行為不變。

**空值符號顏色**(2026-07-09 user 拍板 verbatim「「-」代表的是不可編輯只拿來供檢視的值所以應該跟readonly 的value同樣顏色吧」):不可編輯「-」= `text-foreground`(同 readonly value 色,非 placeholder 提示的裝飾語意);disabled → `text-fg-disabled`(M24)。SSOT helper = `field-context.ts` `fieldEmptyColorClass(resolvedMode)`,全 Field family view/readonly/disabled 空值 span 消費(禁散寫 `text-fg-muted`)。

**例外表**(唯一去處,禁散落各元件 spec):
- **boolean** → 顯示 unchecked 狀態(非空白非 dash)
- **disabled** → 同該情境上文字(`-` 或空白)+ `text-fg-disabled`(M24:disabled 顯著性 > muted)
- **Select display 傳 `placeholder`** → 顯 placeholder 而非 dash/空白(`select.tsx` `emptyText = placeholder ?? emptyDisplay`,2026-07-08 codify — 原為 spec 未載明的 code 行為)

### DataTable 整合

DataTable 根據 column 的 `meta.type` 自動選擇 Field 元件(以 `mode="view"` 渲染):

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

**(a) Selected value renderer**:rich display(avatar+name/icon+label)元件**必**提供 consumer renderer slot,**view/readonly/disabled/edit** 4 mode 共享同一 renderer(禁 edit-only)。`Select.selectedItemRenderer`(4 mode 已全接 — 2026-07-08 A 案回歸修正,view/readonly/disabled 的 ReadonlyDisplay 消費 renderer 輸出;renderer 輸出屬「值內容」,view 態照常渲染,與 affordance 分層見 `field.spec.md` L6)/ `Combobox.tagRenderer`(edit 已接;view path 走 ComboboxTagStack 預設 Tag,consumer tagRenderer unify 仍 deferred,見 `combobox.tsx` 檔頭 `@renderer-symmetry-allow`;現行唯一 tagRenderer consumer = PeoplePicker,其 view 走 MultiPersonDisplay 不經此 path,無實際丟失)/ PeoplePicker 走 `PersonDisplay`+`MultiPersonDisplay`+`Combobox.tagRenderer`。對齊 MUI Autocomplete `renderValue` / Ant Select `tagRender`+`labelRender`+`optionRender` / MUI DataGrid `renderCell`+`renderEditCell` 共享 params。 <!-- @benchmark-unverified -->

**(b) Placeholder vocabulary**(3 props 對 3 UI state,**不可混用**):
- `placeholder` — trigger empty(沒選值,例「請選擇人員」)— Ant/Polaris/Carbon canonical
- `searchPlaceholder` — search input hint(例「搜尋人員…」)— Ant `searchPlaceholder`
- `emptyText`/`noResultsText` — filtered menu 無結果(例「沒有符合的人員」)— Ant `notFoundContent` / Material X `localeText.noResultsOverlayLabel`

**禁**:wrapper 把 `emptyText`(search-empty)silent forward 成 `emptyPlaceholder`(trigger-empty);**Combobox `emptyPlaceholder` deprecated**,保留 1 cycle fallback,future `placeholder` 唯一 trigger source。Hook `check_field_controls_contracts.sh` (contract b) 機械強制。

**(c) Cell surface metrics**:Field family 在 cell 內**禁** hardcode padding(`tagAreaPaddingLeftPx={isEmpty ? undefined : 8}` 反 pattern)。改 **`FieldSurface` context**(`'form' | 'toolbar' | 'table-cell'`):`useFieldSurface()` 取值,`<FieldSurfaceProvider surface="table-cell">` 自動套於 `cell-registry.resolveCellComponent`。Consumer 用 `surface === 'table-cell'` 顯式 query(取代 `variant === 'naked'` heuristic)。**risk mitigation**:`avatar.left = cell.left + computed(--table-cell-px)`,禁再加 magic 8px(double-count)。**Token scope**:`--table-cell-px/py` 是 DataTable-scoped metric(CSS 定義在 `data-table.css`,Field naked variant 是 DataTable cell substrate sub-component 故 cross-path reference 不算真 cross-component),per 2026-05-13 codex Q2 verdict + AG Grid `cellHorizontalPadding`(grid theme param)/ MUI X `cellClassName`(per-cell)/ Carbon spacing scale primitive(不升 cell padding 全域 token)idiom — **不**升 `tokens/layoutSpace/` canonical。對齊 AG Grid cellRendererSelector / Material X DataGrid 共享 params / Notion property type registry。Hook `check_field_controls_contracts.sh` (contract c) 機械強制。 <!-- @benchmark-unverified -->

**(d) View×default = edit 幾何減 chrome(Model A)SSOT**(2026-07-16 round16 user GO;推翻 2026-05-13 Path Ⅰ「zero chrome + `!px-0 !py-0`」拍板):default `mode='view'` = **edit 幾何減 chrome** —— 保留 size 軸 `px-[var(--field-px)]` + `h-field-*`(多行留 py),只拔 border/bg(透明)→ view 與 edit 同一顆控件、只差 chrome → read↔edit 零跳(與上方「軸一 view mode」段同一 canonical)。真要包 chrome 走 `readonly` 或 `showDisplayEndIcon=true` opt-in。**Impl**:`field-wrapper.tsx` view×default compound(`bg-transparent border-transparent`,幾何由 base + size 軸天然保留)+ `fieldViewGeometry(size, multiline)` helper(view×default 幾何 SSOT,供 InlineEdit 純值/標題路徑消費)。世界級對照:[Atlassian inline-edit read-view](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx)(read=edit 幾何)+ Bootstrap [`.form-control-plaintext`](https://github.com/twbs/bootstrap/blob/main/scss/forms/_form-control.scss)(留 padding)。機械鎖:`scripts/inline-edit-view-geometry-invariant.mjs`(multiline py-2 = Textarea edit py-2 契約;注:hook `check_field_controls_contracts.sh` 的 contract (d) 為 field-px token 檢查,非本條)。

**(e) View typography canonical**(2026-05-14 user I2 + codex M31 verdict):Field family view path **必** consume `fieldWrapperStyles` size variants typography token — `sm/md → text-body`(14px line-height 1.5)/ `lg → text-body-lg`(16px)。**禁**:LinkInput / Select / Combobox 非 D-path 的 bare-span 直接 render 無 font-size class(瀏覽器 default 字體);**必**包 `text-body` (sm/md) / `text-body-lg` (lg) class。對齊跨 Field family view 視覺尺寸統一(歷史 anchor:user 抓 LinkInput view 字體跟其他 Field 不一致 = SSOT 違反 漏接 typography token)。**Impl**:LinkInput / Select / Combobox / DatePicker / TimePicker non-D-path bare-span 加 size-aware text class(helper = `fieldDisplayTextClass`)。world-class cite:MUI X DataGrid `Typography` consistent / Atlassian @atlaskit/textfield size-prop typography token / Polaris TextField typographyToken size-aware。 <!-- @benchmark-unverified -->

---

## 邊界案例(家族共用 pointer)

- **極長輸入溢出**:由各元件 spec own — Input 超寬走原生水平捲動(`input.spec.md`「邊界(內容超寬)」)、Textarea 內容超出時 native 內部捲動 / view 態隨內容增高(`textarea.spec.md`「極長文字」)。
- **常見誤解 — disabled 時 label 該隱藏?**:不隱藏 — label 保留但變灰(`FieldLabel` disabled 灰化、required 星號同步 `text-fg-disabled`,SSOT `Field/field.spec.md`);停用原因由外部 Tooltip / help text 承擔(見「disabled 的停用原因」)。

## 表單驗證原則

詳見 `Field/form-validation.spec.md`。

## 禁止事項

- ❌ 不在 disabled input 內放 info icon——停用原因由外部 Tooltip 或 Form help text 承擔
- ❌ 不在 input 尾部放 error 狀態 icon——邊框顏色已傳達 error
- ❌ endAction 不可傳入 ReactNode——使用 InlineActionConfig 宣告式 API
- ❌ endAction 的 inline action 不可省略 `aria-label`（即 `label` 欄位）
- ❌ 不可編輯 view / readonly 空值用全形 em dash `—` 或 `text-fg-muted`——半形 `-` + `text-foreground`(「-」是供檢視的值,同 readonly value 色;disabled → fg-disabled);可編輯 table cell view 空值為空白(見「null / undefined 值」分流表)
- ❌ Field 的 readonly 模式不可用於 DataTable cell——readonly 有底色和 wrapper 開銷，table cell 用 `mode="view"`

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
- `uiSize.spec.md`
