---
component: Field
family: self-contained
traits:
  - hasInteractiveStates
  - isStructural
variants: {}
sizes: {}
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Field 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> 表單 layout container canonical。Input / NumberInput / Checkbox / RadioGroup / Switch / Select / Combobox / DatePicker 等 field controls 皆消費本 spec 的 `orientation` / `controlLayout` / context API(mode / disabled / required / invalid / id)/ 水平對齊公式。跨元件 pattern canonical,scope 本質 > 單一元件。

## 定位

Field 是**表單欄位的佈局容器**。只負責排版（label / control / description / error 的空間關係）與**狀態 context**（把 mode / disabled / required / invalid / id 傳給子元件），**不擁有任何資料型別邏輯**。

與資料相關的一切（格式化、驗證、readonly 呈現、DataTable cell 顯示）住在各個資料型別的 Control 元件本身（Input、NumberInput、Checkbox、Switch 等）。Field 不 wrap、不代理、不轉換它們的行為。

**實作基礎**：自建——本 DS 的 form layout 設計。shadcn 的 `Form` 元件走 react-hook-form + Zod + 自己的 Field primitive（含 Controller），本 DS 不採用這套耦合設計：Field 只做 layout + context，驗證由 consumer 自選（本 DS 建議 zod，見 `form-validation.spec.md`），保持更輕量、更獨立的定位。

**Layout Family**：Field **不屬於** 4-Family Model 的 element layout families——它是 form composition pattern（包 Family 4 control + label + description）。見 CLAUDE.md「系統內部 Layout — 4-Family Model」→「Field Composition」段落。

---

## 與 Field Controls 的職責切分

Field 和 Field Controls（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker / Textarea）是兩件事：

- **Field**（本元件）：只管佈局 + 狀態 context
- **Field Controls / Checkbox / Switch / RadioGroup**：管自己的資料型別 + edit/readonly/disabled 三態 + 格式化（XxxDisplay 供 DataTable 共用）

這麼拆的理由：**Checkbox 在 table cell、form field、settings row 應該是同一個 primitive**，不該為了進到 form 就被包一層 CheckboxField；form 的高度對齊由 Field 的 control area 負責，不由 primitive 本身負責。Field Controls 的詳細共用規則見 `Field/field-controls.spec.md`。

---

## 結構

```tsx
<Field orientation="vertical | horizontal" labelWidth="120px">
  <FieldLabel>姓名</FieldLabel>
  <Input value={name} onChange={setName} />
  <FieldDescription>會顯示在專案列表標題</FieldDescription>
  <FieldError>{errors.name}</FieldError>
</Field>
```

子元件有四種 slot：

| Slot | 元件 | 職責 |
|---|---|---|
| label | `<FieldLabel>` | 欄位名稱，handles required 星號、disabled 灰化、htmlFor 連結 |
| control | 任何非 label/desc/error 的 child | 輸入元件本體（Input、Checkbox、Switch...） |
| description | `<FieldDescription>` | 次要說明文字，fg-secondary |
| error | `<FieldError>` | 錯誤訊息，error-text 色，`role="alert"`，無內容時不渲染 |

子元件寫法採**扁平結構**（直接作為 Field children），Field 內部用 `displayName` 判別 slot 類型並自動組合。consumer 不需要包 wrapper。

---

## 樣式規範（全部 codify 在 field.tsx，不依賴 consumer）

| 元素 | Token / 值 |
|---|---|
| FieldLabel（一般） | `text-body`（14px）/ `text-foreground`（neutral-9） |
| FieldLabel（disabled） | `text-body` / `text-fg-disabled`（neutral-6） |
| FieldLabel 的 required `*` | `text-fg-muted`（neutral-7），**貼齊 label 文字無 gap**，disabled 時 `text-fg-disabled` |
| FieldDescription（一般） | `text-body`（14px）/ `text-fg-secondary`（neutral-8） |
| FieldDescription（disabled） | `text-body` / `text-fg-disabled` |
| FieldError | `text-body`（14px）/ `text-error-text` / `role="alert"` |
| Field 內部 gap（vertical） | `gap-1`（4px） |
| Field 內部 gap（horizontal，content 欄） | `gap-1`（4px） |
| Horizontal 模式 label 與 control 的 gap | `gap-x-3`（12px） |
| Control area（任何 size） | `min-h-field-{size}` + `flex items-center` |

**Label / Description / Error 字體固定 `text-body`（14px），不隨 field size 變。** Field size 只影響 input 高度，不影響表單佈局元素的 typography。世界級系統（Material、Ant Design、Atlassian、Carbon、Polaris）都是固定 label/helper text size。

---

## Orientation

### vertical（預設）

Label 在上、control 在下、description 和 error 往下堆疊。垂直節奏 `gap-1`（4px）。

```
[Label]
[Control]       ← min-h-field-md，control 垂直置中於此 box
[Description]
[Error]
```

適用：標準表單、密集欄位。

### horizontal

Label 在左、control + description + error 在右欄垂直堆疊。Label 與 control **垂直對齊於第一行中線**（見下一段）。

```
[Label]   [Control       ]
          [Description]
          [Error]
```

適用：settings 面板、寬螢幕 form、iOS-style 欄位。

Horizontal 模式下 label 的欄寬由 `labelWidth` prop 控制（任何 CSS length 值），預設 `auto` 由 label 內容撐開。內部用 CSS variable `--field-label-width` 傳給 grid template column。

---

## Horizontal 模式 label 垂直對齊

依 `controlLayout`(Field 自動偵測)分兩套對齊語意:

**A. Inline control**(Input/Button/Switch/SegmentedControl)— control 有固定 `--field-height-{size}`,可談中線。
- label ≤ field-height → 第一行中線對齊 control 中線(視覺置中)
- label > field-height → 齊頂對齊 control top
- 實作:`min-h-field-{size} flex flex-col justify-center`(內容 < min-h → justify-center 置中;內容 > min-h → 容器被撐大,top 對齊)

**B. Block control**(RadioGroup/CheckboxGroup)— 多行群組無整體中線,錨點 = 第一個 item 第一行中線在 `field-height/2`(SelectionItem `py = calc((field-height - 1lh)/2)` 維持)。
- label 第一行永遠對齊第一個 item 第一行
- 實作:`padding-top: calc((field-height - 1lh)/2)`

**為什麼分兩套**:曾試 `min-h + flex-center` 統一 → block + 長 label regression(justify-center 失效 + 跟 SelectionItem 公式錯位)。Inline / block 不同對齊語意模型,必分兩套。純 CSS 跨 size/density/字體自動連動,無 JS 測量。對齊 Atlassian DSP / Salesforce Lightning(Polaris 用 baseline 修正,類似)。

---

## Control area:Inline vs Block

Field 的 control area 有兩種佈局模型,涵蓋所有 control 類型。**核心原則:無論哪一種,「control 第一行內容的中線」都錨在 `field-height/2`**——這是維持 FieldGroup 垂直韻律的關鍵錨點,也讓 horizontal 模式的 label 公式對 inline / block 都成立。

| Layout | Control area 樣式 | 適用 control |
|---|---|---|
| **inline**(預設) | `min-h-field-{size}` + `flex items-center` | Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea(單行使用)、Checkbox / Switch / 單一 Button(如 upload picker) |
| **block** | `flex flex-col items-start` + `padding-top: calc((field-height - 1lh) / 2)`,**不設 min-h** | RadioGroup / CheckboxGroup / FileDropzone / RichTextEditor / inline DataTable 等多行/任意高度區塊 |

### 兩種模式的對齊幾何

```
Inline                            Block
┌────┬───────────────┐           ┌────┬───────────────┐
│    │               │           │Lbl │ ● Option A    │ ← 第一行中線 = field-height/2
│Lbl │ [Input      ] │ ← 中線    │    │ ● Option B    │
│    │               │           │    │ ● Option C    │
└────┴───────────────┘           └────┴───────────────┘
```

兩個 Field 放在同一個 FieldGroup 時,Lbl 第一行中線完全對齊——Input 的中線與 Option A 的中線都落在同一條水平線上。

### 為什麼 block 不是「整組垂直置中」

直覺上會想說 control area 多行時整組 vertical center,但這會讓:
1. 第一個 Radio 往下掉,跟 label 第一行中線錯位
2. FieldGroup 裡 inline / block field 並排時節奏斷掉

正確做法是「**第一行對齊**」——後續 item 從第一行往下流,label 公式錨在第一行中線。Atlassian DSP / Polaris / Material 都是這個模型。

### 為什麼 primitive 不自己變高

**Checkbox / Switch / RadioGroupItem 的 primitive 保持原生尺寸**(16-20px),不為了 form 而被拉高。世界級系統(shadcn、Radix、Material、Atlassian)全部這樣做。理由:

1. **Primitive 保持單一職責**——Checkbox 在 table cell、toolbar、menu 裡仍然是 16px,不受 form 高度污染
2. **高度節奏由 Field 容器提供**——一次設定,所有 primitive 在任何 size / density 都自動對齊
3. **DataTable cell 共用同一個 min-h 機制**——不需為 cell 另發明對齊邏輯

### 水平排列 Field 時的垂直對齊

多個 Field 並排時,每個 Field 的 control area 都依公式錨在 `field-height/2`,不論 inline 還是 block,**「控件第一行中線」都落在同一條線上**——Input、Checkbox、Switch、RadioGroup 第一個 option 並列時視覺上完全對齊。

---

## 如何宣告 block primitive(程式化機制)

block / inline 是**元件固有性質**(RadioGroup 永遠 block,Input 永遠 inline),由 primitive 自我宣告:

```tsx
;(RadioGroup as unknown as { fieldLayout: 'block' }).fieldLayout = 'block'
```

Field render 時讀第一個 control child 的 `type.fieldLayout`,缺則 `'inline'`。Consumer 完全無感(`<Field><RadioGroup>...</RadioGroup></Field>` 自動切 block)。

**為什麼這機制**:Consumer 傳 prop 易忘 → 歪;Field 內寫死白名單 → 跟 primitive 名稱耦合。Primitive 自宣告 = Field 0 耦合,新增 block primitive 只在自己檔案加 1 行。

**逃生艙**:`Field controlLayout="inline"|"block"` prop 覆寫(consumer 手寫 JSX 當 control 無法偵測時用)。

**第一行對齊責任**:Field 的 block control area **不加 paddingTop**(避免跟 RadioGroup 自帶 `py = calc((field-height - 1lh) / 2)` double)。需 label 對齊的 block primitive 自行保證第一行位置(RadioGroup/CheckboxGroup 自帶 ✓;FileDropzone/RichTextEditor 自管)。

**已宣告 block**:`RadioGroup`。新增 `CheckboxGroup` / `FileDropzone` 等同模式加 `fieldLayout = 'block'`。

---

## FieldContext — 子元件如何讀 Field 狀態

Field 透過 Context 暴露以下狀態給子元件（Primitive 可以透過 `useFieldContext()` 讀取）：

| 欄位 | 用途 |
|---|---|
| `id` | FieldLabel 自動 `htmlFor`、Input 自動 `id` |
| `descriptionId` | FieldDescription 的 id，Input 自動 `aria-describedby` |
| `errorId` | FieldError 的 id，Input 自動 `aria-errormessage` |
| `mode` | `edit` / `readonly` / `disabled`，Control 決定自己的視覺形態 |
| `disabled` | Control 顯示 disabled 樣式 |
| `required` | FieldLabel 自動渲染 `*`；Input 自動 `aria-required` |
| `invalid` | Control 顯示 error 邊框；Input 自動 `aria-invalid` |
| `size` | Control 自動同步尺寸（sm / md / lg） |
| `orientation` | FieldLabel 的垂直對齊策略（horizontal 模式套用 padding-top 公式） |
| `hasFieldWrapper` | Primitive 讀到此旗標時應忽略自己的 label / description prop，由 FieldLabel / FieldDescription 接管 |

### Primitive 的 Field-aware 行為

**Checkbox / Switch / RadioItem** 等 primitive 自己有 `label` / `description` props 可用於**獨立使用場景**（不在 Field 內），但在 Field context 內時：

- 讀到 `hasFieldWrapper === true` 就**忽略自己的 `label` / `description` props**（若 consumer 誤傳，開發環境可 warn）
- 改由 `<FieldLabel>` 和 `<FieldDescription>` 接管這兩個 slot
- 避免「雙層 label」

這個機制讓**同一個 primitive 可以在兩種情境下正確呈現**：

```tsx
// 情境 A：獨立使用（toolbar / settings row / dashboard widget）
<Checkbox label="訂閱電子報" description="每週一封" />

// 情境 B：form 內（Field 接管 label）
<Field>
  <FieldLabel>訂閱電子報</FieldLabel>
  <Checkbox />
  <FieldDescription>每週一封</FieldDescription>
</Field>
```

兩種情境用同一個 primitive，一份樣式規範。

---

## Required 星號

- Field 的 `required` prop 透過 context 傳給 FieldLabel 自動渲染 `*`
- 星號 `text-fg-muted`（neutral-7），**緊貼 label 文字無 gap**（不用 `margin-right`）
- Disabled 時星號改為 `text-fg-disabled`（neutral-6），與 label 同步降色
- 個別 FieldLabel 可用 `required` prop 覆寫 context 值

**為什麼貼齊無 gap**：星號是 label 語意的一部分（WCAG 友善——screen reader 先讀 required 再讀 label），不是獨立視覺元素，所以不需要間距。

---

## 驗證與 aria 屬性

- `invalid` 透過 context 讓 Control 顯示 error 邊框、自動 `aria-invalid`
- `errorId` 讓 Control 自動 `aria-errormessage`
- `descriptionId` 讓 Control 自動 `aria-describedby`
- `<FieldError>` 自帶 `role="alert"` 並有 id = `errorId`
- 無 children 的 `<FieldError>` 不渲染，不佔位

---

## FieldGroup — 多 Field 垂直堆疊

```tsx
<FieldGroup gap="normal" horizontalLabelWidth="120px">
  <Field><FieldLabel>姓名</FieldLabel><Input /></Field>
  <Field><FieldLabel>Email</FieldLabel><Input /></Field>
  <Field orientation="horizontal">
    <FieldLabel>訂閱通知</FieldLabel>
    <Switch />
  </Field>
  <Field orientation="horizontal">
    <FieldLabel>小字體</FieldLabel>
    <Switch />
  </Field>
</FieldGroup>
```

gap 三個語意層級(具體 gap token 見 `field.tsx` cva):

| gap | 用途 |
|---|---|
| `compact` | 密集表單、dialog 內 |
| `normal`(預設) | 標準表單 |
| `loose` | 寬鬆大表單、settings 頁 |

### FieldGroup `horizontalLabelWidth` cascade(2026-04-20)

同一畫面 / 同一 FieldGroup 內多個 horizontal Field **必須共用 label 欄寬度**。若每個 Field 各自傳 `labelWidth`(或省略 → 內容撐開),label 寬度會參差不齊,Switch / Input 的左邊緣不對齊,視覺上每一行「歪七扭八」。

**世界級 idiom**:macOS System Settings / iOS Settings / GitHub Settings / Notion preferences / Figma 偏好設定——setting list 的 label 全部固定寬、control 全部右對齊,列與列對齊成可掃描的欄位格網。

`FieldGroup horizontalLabelWidth` 透過 React Context cascade 到所有子 Field(含 `vertical` 模式的 Field 不受影響——vertical 無 label 欄概念)。單一 Field 仍可用自己的 `labelWidth` prop 覆寫 group 預設(罕見 — 通常 group 預設就是 canonical)。

**搭配 Switch 自動齊右**:horizontal Field 內的 Switch 自動 `ml-auto` 推到右邊緣。配合 FieldGroup `horizontalLabelWidth` → 整排 toggles 的 switch 視覺完全對齊。

---

## Button 作為 control 的判斷標準

Field 的 control 是「**承載這個欄位 value 的輸入介面**」。Button 在某些場景就是這個介面——例如 upload button(點擊開檔案選擇器,結果寫回 field)、picker opener(連結 OAuth、開選人對話框)。這類 Button **可以**作為 control:

```tsx
<Field orientation="horizontal" labelWidth="120px">
  <FieldLabel>合約附件</FieldLabel>
  <Button startIcon={Upload} variant="secondary">上傳檔案</Button>
  <FieldDescription>PDF / DOCX,最大 10 MB</FieldDescription>
</Field>
```

Button 的 height 與 `field-height` 共用同一組 token,放進 inline control area 自然對齊 Input 中線,horizontal 模式的 label 公式也自然對到——不需要任何特例。

**判斷標準**:點擊這顆 Button 是否產生 / 修改此欄位的 value?

| 是 | 否 |
|---|---|
| ✅ Upload(產生 file value) | ❌ 表單 submit / cancel(form action,放到 form footer) |
| ✅ Picker opener(開對話框選 value) | ❌ 「重設此欄位」(可放到 endAction 或 description 旁,不是 control) |
| ✅ Connect OAuth(產生 token value) | ❌ 頁面導覽、刪除整筆資料(page action) |

**規則**:Button 是 control 時通常 inline(高度 = field-height);若是 block 類的「上傳區塊」(FileDropzone),則該元件本身宣告為 block primitive。

---

## 禁止事項

- ❌ 不得在 Field 內再包 Field——Field 不支援巢狀
- ❌ 不得在 Field 內同時放 `<FieldLabel>` 和給 primitive 傳 `label` prop——Field context 會讓 primitive 忽略自己的 label,但語意上仍是重複宣告,避免誤導
- ❌ 不得跳過 `<FieldLabel>` 直接寫 `<label>`——失去 required 星號、disabled 處理、size 連動等 codified 樣式
- ❌ 不得為了「讓 Checkbox 與 Input 同高」而修改 Checkbox primitive——高度對齊由 Field control area 負責
- ❌ Horizontal 模式下不得對 FieldLabel 自訂 `padding-top`——會打破公式對齊
- ❌ 不得把**與此欄位 value 無關的 action**(form submit/cancel、頁面導覽、刪除整筆資料)放進 control area——Field 是資料輸入容器,不是 action container。Button 是否能當 control,看上一節的判斷標準
- ❌ 不得在 block control area 自訂 `min-height` 或改 `items-start`——會打破第一行對齊公式
- ❌ 不得在 block primitive 的 `.tsx` 漏掉 `fieldLayout = 'block'` 宣告——Field 會誤判成 inline 導致 layout 歪掉

---

## Field Controls 共用設計原則

Field 內的資料輸入控件（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker / Textarea）共用的三 mode、size、focus、endAction、Display 規則，詳見 `Field/field-controls.spec.md`。

---

## 何時用

- **表單欄位的 label + control + description + error 標準佈局**：登入表單、設定頁、建立對話框
- **需要 required 星號、disabled 狀態、invalid 驗證的統一行為**
- **需要 `horizontal` / `vertical` 排版切換**：設定頁常用 horizontal（label 左 / control 右）
- **多欄位垂直堆疊**：搭配 `FieldGroup` 管理 density-aware 間距

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 唯讀資訊展示 | `DescriptionList` | Field 是表單容器，純展示用 `dl/dt/dd` 語義 |
| 單一 Checkbox（勾選同意）without label 結構 | 直接 Checkbox + label prop | 單個 Checkbox 是 inline primitive，不需要 Field 佈局 |
| DataTable cell 編輯（inline editable）| 直接放 Field Control | Field 是頁面表單佈局，table cell 空間受限 |
| 純 action 按鈕（submit / cancel / 頁面導覽）| 頁面 footer / toolbar | Field 是資料輸入容器，不放頁面級 action |
| 巢狀 Field | ❌ 不支援 | Field 不支援巢狀，多欄位用 FieldGroup |

---

## 為何無 Inspector

Field 是**表單欄位容器**(label + helper + control + error 的佈局包裝),設計決策維度是 `orientation`(vertical / horizontal)× `size`(sm/md/lg)× `state`(required / invalid / disabled / readonly)× `color`——已由 `OrientationMatrix` / `SizeMatrix` / `StateBehavior` / `ColorMatrix` + 元件特有 `FieldGroupBehavior` 五張結構矩陣完整覆蓋。

Inspector 對 container 類元件沒有對應教學價值——Field 本身不產生互動 affordance(互動由 Field Control 例如 Input / Select 處理),該 Inspect 的是 Field Control layer(已有各自元件的 Inspector)。重寫 Inspector = 複製 Input / Select 的 Inspector。

對應 anatomy story:保留 `Overview` + `OrientationMatrix` + `SizeMatrix` + `StateBehavior` + `ColorMatrix` + 元件特有 `FieldGroupBehavior`。

---

## Field state machine SSOT(v13.3)

**Canonical**:**focus dominates everything**(M11 延伸:focus 勝 hover/open/error-rest)。Cursor in input = user 編輯中 = 永遠藍。對齊 Material 3 / Polaris / Ant Design 5 共識。SSOT 在 `field-wrapper.tsx` 三 compoundVariant — 改一處全 control + cell + 各 variant 跟動。

| State | Token | CSS |
|---|---|---|
| rest | `--border` | `border-border` |
| hover(無 focus)| `--border-hover` | `hover:border-border-hover` |
| **focus** | `--primary` | **`focus-within:!border-primary`**(`!important` 勝 data-state)|
| focus + hover | `--primary` | `focus-within:hover:!border-primary`(M11 AND case)|
| open(無 focus)| `--border-hover` | `data-[state=open]:border-border-hover` |
| error | `--error` | `focus-within:border-error focus-within:hover:border-error` |

副作用(自動達成 Ant「選後藍 / 取消灰」):選 option → Radix `onCloseAutoFocus` return focus → focus-within fires → 藍 / 點外取消 → focus 移外 → 灰。純 focus 機制無需 transient class。

**反模式 ❌**:per-control `open && 'border-primary'`(Combobox/Select/PeoplePicker)/ `data-[state=open]:border-primary` — 已 v13.3 全 retire。`hook check_field_state_token_consume` write-time 攔。

---

## Naked variant — Cell-as-input(M19 SSOT,v12 + v13.3)

`naked` = cell-as-input(Notion / Airtable / Excel / AG Grid:host cell 提供 box,Field 融入)。**核心**:完全繼承 Field default state machine,只改**物理尺寸 + 位置**。

### v12 `!absolute` trade-off(why)

User 需求「Field 邊框跟 grid 無縫接軌」(4 邊都 1px 不雙線)→ Field 必須伸出 cell 邊 1px overlay 相鄰 grid。實作:
- naked edit:`!absolute -top-px -left-px -right-px -bottom-px !h-auto !w-auto` → Field box = cell + 2px each
- editing cell 必 `overflow-visible`(允許 1px 外溢繪)
- `!important` 強制勝 per-control cn() 加的 `'relative'`(Combobox/Select Tag z-layering)— Field 自己 absolute 也是 positioned ancestor,Tag z-stacking 仍 work

**未來開發者注意**:Combobox/Select 加新 stacking 子元件 → 必檢查 cell context;cell 內元件不要自寫 `position:absolute/fixed` 對抗;必要時加 `// @field-state-ring-allow:` 通過 hook。

### Layer 分配

| Layer | Home | 內容 |
|---|---|---|
| **L1 Slot** | `patterns/element-anatomy/item-anatomy.tsx` | `<ItemPrefix>` / `<ItemSuffix>`(永遠 `h-[1lh]` 對齊第 1 行) |
| **L2 Align** | `field-wrapper.tsx` `nakedCellRowModeAlign` | host cell `data-row-mode` propagate(autoRow→items-start / fixed→items-center)|
| **L3 State machine** | **繼承 Field default v13.3**(↑ 上方 SSOT)| 不重定義 |
| **L4 Display hover** | `field-wrapper.tsx` `nakedCellEditableDisplayHover` | editable cell display mode `outline-1 outline-offset-[-1px] outline-[var(--border-hover)]`(cell wrapper outline)。**Invariant(2026-05-07 user-accepted)**:hover ring 跟 edit mode Field border 在 right edge 差 **1px**(因 cell `border-r border-divider` 1px 讓 cell.outer 比 Field 寬;divider-owner / editor-owner 分離為 enterprise canonical pattern,對齊 AG Grid 分層 theme idiom)。Future D 路徑改 `<CellInteractiveOverlay>` primitive 達 pixel-perfect 對齊 → 詳 `.claude/memory/project_cell_interactive_overlay_plan.md` |
| **L5 Position(v12)** | naked compoundVariant inline | `!absolute -top-px -left-px -right-px -bottom-px !h-auto !w-auto`(seamless grid)|

**前身 retire**:v4-v8 `outline-2` 平行 state(已下沉 L3)/ v9 border-only(focus 跟 open specificity tie)/ per-control `open && 'border-primary'`(v13.3 retire)/ `nakedCell{Hover,Focus,Open}Ring` 三 const / `nakedCell{Prefix,Suffix}Slot`(下沉 L1)。

**反模式 ❌**:naked 自寫 `outline-*` / `box-shadow inset` state ring(用 L3) / hardcode `<span h-[1lh]>` slot(用 L1)/ hardcode `items-center`(用 L2)/ per-control `open && 'border-primary'`(用 L3 SSOT)。

**機械防漂移**:hooks `check_naked_row_mode_propagation` / `check_field_state_token_consume`(v13 升級)/ `check_inline_action_canonical_gap` / `check_row_slot_handcraft`(write-time)+ audit `/design-system-audit` Group N M36-M39。

## 相關

- `./field-controls.spec.md` — Field Controls（Input/Select/etc.）共用規則：三 mode、size、focus、endAction、Display
- `./form-validation.spec.md` — 表單驗證標準（blur 驗證、zod schema、error 顯示）
- `../DescriptionList/description-list.spec.md` — 唯讀資訊展示（非表單）
- `../../patterns/element-anatomy/item-anatomy.spec.md` — SelectionItem 佈局（Checkbox / Radio 放進 Field 時 block 模式的參照）
- CLAUDE.md「元件 Props 命名原則」— Field 的 orientation / block control 宣告規則

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `element-anatomy.spec.md`
- `radio-group.spec.md`
- `switch.spec.md`
