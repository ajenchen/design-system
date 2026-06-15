---
component: Field
family: self-contained
traits:
  - hasInteractiveStates
  - isStructural
variants: {}
sizes: {}
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline(M22(d) 顯式撤回;本檔 frontmatter 無 benchmark list,來源 URL 未補)。 -->

# Field 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> 表單 layout container canonical。Input / NumberInput / Checkbox / RadioGroup / Switch / Select / Combobox / DatePicker 等 field controls 皆消費本 spec 的 `orientation` / `controlLayout` / context API(mode / disabled / required / invalid / id)/ 水平對齊公式。跨元件 pattern canonical,scope 本質 > 單一元件。

## 定位

Field 是**表單欄位的佈局容器**。只負責排版（label / control / description / error 的空間關係）與**狀態 context**（把 mode / disabled / required / invalid / id 傳給子元件），**不擁有任何資料型別邏輯**。

與資料相關的一切（格式化、驗證、readonly 呈現、DataTable cell 顯示）住在各個資料型別的 Control 元件本身（Input、NumberInput、Checkbox、Switch 等）。Field 不 wrap、不代理、不轉換它們的行為。

**實作基礎**：自建——本 DS 的 form layout 設計。shadcn 的 `Form` 元件走 react-hook-form + Zod + 自己的 Field primitive（含 Controller），本 DS 不採用這套耦合設計：Field 只做 layout + context，驗證由 consumer 自選（本 DS 建議 zod，見 `form-validation.spec.md`），保持更輕量、更獨立的定位。

**Layout Family**：Field **不屬於** 4-Family Model 的 element layout families——它是 form composition pattern（包 Family 4 control + label + description）。見 CLAUDE.md「4-Family Layout Model」段 + `patterns/element-anatomy/element-anatomy.spec.md`「Field Composition(不在 family 但相關)」段。

---

## 與 Field Controls 的職責切分

Field 和 Field Controls（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker / Textarea）是兩件事：

- **Field**（本元件）：只管佈局 + 狀態 context
- **Field Controls / Checkbox / Switch / RadioGroup**：管自己的資料型別 + edit/readonly/disabled 三態 + 格式化(`mode="display"` 渲染供 DataTable cell 共用)

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

**Label / Description / Error 字體固定 `text-body`（14px），不隨 field size 變**——Field size 只影響 input 高度，不影響表單佈局元素的 typography。

**為什麼固定**：世界級系統（Material、Ant Design、Atlassian、Carbon、Polaris）都是固定 label/helper text size。 <!-- @benchmark-unverified -->

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

**硬規則(2026-06-10 codify,user 確認)**:同一表單的多個 horizontal Field **必經 `FieldGroup horizontalLabelWidth` 統一 label 寬**(單行 `labelWidth` 覆寫)——禁各自 `auto` 造成控件起點不對齊(錨例:field.principles 原違反自家 idiom,圖示控件參差)。機制詳下方「FieldGroup horizontalLabelWidth cascade」段。

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

**為什麼分兩套**:inline / block 是不同的對齊語意模型(固定高度可談整體中線 vs 多行群組只有第一行錨點),必分兩套。純 CSS 跨 size/density/字體自動連動,無 JS 測量。對齊 Atlassian DSP / Salesforce Lightning(Polaris 用 baseline 修正,類似)。(附註・技術陷阱:曾試 `min-h + flex-center` 統一,出 block + 長 label regression——justify-center 失效 + 跟 SelectionItem 公式錯位,勿再嘗試) <!-- @benchmark-unverified -->

---

## Control area:Inline vs Block

Field 的 control area 有兩種佈局模型,涵蓋所有 control 類型。**核心原則:無論哪一種,「control 第一行內容的中線」都錨在 `field-height/2`**——這是維持 FieldGroup 垂直韻律的關鍵錨點,也讓 horizontal 模式的 label 公式對 inline / block 都成立。

| Layout | Control area 樣式 | 適用 control |
|---|---|---|
| **inline**(預設) | `min-h-field-{size}` + `flex items-center` | Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea(單行使用)、Checkbox / Switch / 單一 Button(如 upload picker) |
| **block** | `flex flex-col items-start`,**不設 min-h、不加 padding-top**(第一行對齊由 block primitive 自帶 py 保證,見「如何宣告 block primitive」) | RadioGroup / CheckboxGroup / FileDropzone / RichTextEditor / inline DataTable 等多行/任意高度區塊 |

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

正確做法是「**第一行對齊**」——後續 item 從第一行往下流,label 公式錨在第一行中線。Atlassian DSP / Polaris / Material 都是這個模型。 <!-- @benchmark-unverified -->

### 為什麼 primitive 不自己變高

**Checkbox / Switch / RadioGroupItem 的 primitive 保持原生尺寸**(16-20px),不為了 form 而被拉高。世界級系統(shadcn、Radix、Material、Atlassian)全部這樣做。理由: <!-- @benchmark-unverified -->

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

Field render 時迭代**全部** control child 的 `type.fieldLayout`,**任一**宣告為 `'block'` 即整個 area 切 block(first-block-wins);全部缺宣告則 `'inline'`。Consumer 完全無感(`<Field><RadioGroup>...</RadioGroup></Field>` 自動切 block)。

**為什麼這機制**:Consumer 傳 prop 易忘 → 歪;Field 內寫死白名單 → 跟 primitive 名稱耦合。Primitive 自宣告 = Field 0 耦合,新增 block primitive 只在自己檔案加 1 行。

**逃生艙**:`Field controlLayout="inline"|"block"` prop 覆寫(consumer 手寫 JSX 當 control 無法偵測時用)。

**第一行對齊責任**:Field 的 block control area **不加 paddingTop**(避免跟 RadioGroup 自帶 `py = calc((field-height - 1lh) / 2)` double)。需 label 對齊的 block primitive 自行保證第一行位置(RadioGroup/CheckboxGroup 自帶 ✓;FileDropzone/RichTextEditor 自管)。

**已宣告 block**:`RadioGroup`、`CheckboxGroup`(checkbox-group.tsx:92)。新增 `FileDropzone` 等同模式加 `fieldLayout = 'block'`。

---

## FieldContext — 子元件如何讀 Field 狀態

Field 透過 Context 暴露以下狀態給子元件（Primitive 可以透過 `useFieldContext()` 讀取）：

| 欄位 | 用途 |
|---|---|
| `id` | FieldLabel 自動 `htmlFor`、Input 自動 `id` |
| `descriptionId` | FieldDescription 的 id，Input 自動 `aria-describedby` |
| `errorId` | FieldError 的 id，Input 自動 `aria-errormessage` |
| `mode` | `edit` / `display` / `readonly` / `disabled`，Control 決定自己的視覺形態 |
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

**為什麼貼齊無 gap**:星號是 label 語意的一部分,不是獨立視覺元素,所以不需要間距(星號本身 `aria-hidden`,SR 的 required 資訊由控件 `aria-required` 承擔——見「A11y 預設」段)。

## FieldLabel `info` icon(2026-06-10 文件化,對齊 field.tsx 既有實作)

label 文字後可帶 info icon(ℹ)hover 出 tooltip 補充說明:`<FieldLabel info="說明文字">`。

- **與 label 間距 `gap-1`(4px)**、InfoIcon **16px 固定**、色 `fg-muted` hover `fg-secondary`(field.tsx L388-408)
- **disabled 時整顆不渲染**(L400)— info 是 action affordance(hover 互動),非類型身份 indicator,non-editable 隱藏
- 設計定位:inline action pattern(補充工具,視覺退後)— label 的 primary interaction 是 input,info 是輔助

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

gap 三個語意層級(具體 gap class map 見 `field.tsx` FieldGroup,`compact`→`gap-3` / `normal`→`gap-4` / `loose`→`gap-6`):

| gap | 用途 |
|---|---|
| `compact` | 密集表單、dialog 內 |
| `normal`(預設) | 標準表單 |
| `loose` | 寬鬆大表單、settings 頁 |

### FieldGroup `horizontalLabelWidth` cascade(2026-04-20)

同一畫面 / 同一 FieldGroup 內多個 horizontal Field **必須共用 label 欄寬度**。若每個 Field 各自傳 `labelWidth`(或省略 → 內容撐開),label 寬度會參差不齊,Switch / Input 的左邊緣不對齊,視覺上每一行「歪七扭八」。

**世界級 idiom**:macOS System Settings / iOS Settings / GitHub Settings / Notion preferences / Figma 偏好設定——setting list 的 label 全部固定寬、control 全部右對齊,列與列對齊成可掃描的欄位格網。 <!-- @benchmark-unverified -->

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

## 邊界案例

- **空 Field(無 control children)**:code 不擋——control area 渲染成空容器。Field 是佈局容器,無 control 即無意義,屬 consumer 誤用
- **RTL**:未實作方向鏡像(horizontal label 欄固定在左、Switch `ml-auto` 推右皆以 LTR 設計);RTL 屬 DS-wide 決策,未定(與 Chip / Breadcrumb 同口徑)

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
| 把 Field 當輸入元件本身（常見誤解：「Field = form 輸入框」）| `Input` 等 Field Control | Field 只管佈局 + context，輸入行為住在 control（見「與 Field Controls 的職責切分」）|
| 純 action 按鈕（submit / cancel / 頁面導覽）| 頁面 footer / toolbar | Field 是資料輸入容器，不放頁面級 action |
| 巢狀 Field | ❌ 不支援 | Field 不支援巢狀，多欄位用 FieldGroup |

---

## Anatomy stories

對應 anatomy story:`Overview` + `Inspector`(元件檢閱器——切 orientation / size / mode / required / invalid 即時 render)+ `OrientationMatrix` + `SizeMatrix` + `StateBehavior` + `ColorMatrix` + 元件特有 `FieldGroupBehavior` + `Accessibility`。

---

## Field state machine SSOT(v13.3)

**Canonical**:**focus dominates everything**(M11 延伸:focus 勝 hover/open/error-rest)。Cursor in input = user 編輯中 = 永遠藍。對齊 Material 3 / Polaris / Ant Design 5 共識。SSOT 在 `field-wrapper.tsx` 三 compoundVariant — 改一處全 control + cell + 各 variant 跟動(**例外:error state CSS 目前逐 control 實作**——input.tsx / select.tsx / number-input.tsx 各自帶 `border-error` 系列,不在 field-wrapper compoundVariants,改 error 需逐 control 同步)。 <!-- @benchmark-unverified -->

| State | Token | CSS |
|---|---|---|
| rest | `--border` | `border-border` |
| hover(無 focus)| `--border-hover` | `hover:border-border-hover` |
| **focus** | `--primary` | **`focus-within:!border-primary`**(`!important` 勝 data-state)|
| focus + hover | `--primary` | `focus-within:hover:!border-primary`(M11 AND case)|
| open(無 focus)| `--border-hover` | `data-[state=open]:border-border-hover` |
| error | `--error` | `focus-within:border-error focus-within:hover:border-error` |

副作用(自動達成 Ant「選後藍 / 取消灰」):選 option → Radix `onCloseAutoFocus` return focus → focus-within fires → 藍 / 點外取消 → focus 移外 → 灰。純 focus 機制無需 transient class。

**反模式 ❌**:per-control `open && 'border-primary'`(Combobox/Select/PeoplePicker)/ `data-[state=open]:border-primary` — 已 v13.3 全 retire。hook `check_field_family_invariants.sh` A.3(原 check_field_state_token_consume)write-time 攔。

---

## Naked variant — Cell-as-input(M19 SSOT,v15)

`naked` = cell-as-input(Notion / Airtable / Excel / AG Grid:host cell 提供 box,Field 融入)。**核心**:完全繼承 Field default state machine,只改**物理尺寸 + 位置**。Combobox/Select 加新 stacking 子元件必檢查 cell context;cell 內元件不要自寫 `position:absolute/fixed` 對抗(必要時加 `// @field-state-ring-allow:` 通過 hook)。

### Layer 分配

| Layer | Home | 內容 |
|---|---|---|
| **L1 Slot** | `patterns/element-anatomy/item-anatomy.tsx` | `<ItemPrefix>` / `<ItemSuffix>`(永遠 `h-[1lh]` 對齊第 1 行) |
| **L2 Align** | `field-wrapper.tsx` `nakedCellRowModeAlign` | host cell `data-row-mode` propagate(autoRow→items-start / fixed→items-center)|
| **L3 State machine** | **繼承 Field default v13.3**(↑ 上方 SSOT)| 不重定義 |
| **L4 Display hover** | `field-wrapper.tsx` `nakedCellEditableDisplayHover` | editable cell display mode `outline-1 outline-offset:-1 outline-[var(--border-hover)]`(cell wrapper outline)。**v15.13 design intent(user-accepted 2026-05-07)**:hover ring 蓋 cell.borderRight。**known asymmetry**(2026-05-09 user 重抓):只 **right** 邊 outline 跟 cell own border-r 同位置覆蓋成 1 條;top/left/bottom 邊 outline 在 cell.outer 內 1px,grid lines(前 row border-b / 前 cell border-r / row 自己 border-b 在 cell.outer 外 1px)露出 → 視覺 4 邊不對稱。**Pending design decision**(等 user 拍板才 ship):4 邊都蓋(spec 1 selection-style)vs 4 邊都不蓋(spec 2 inset 1px)vs 維持現狀。三層 SSOT:state source = cell wrapper / paint owner = 混合(hover=cell / edit=Field)/ grid divider = DataTable own |
| **L5 Position(v14,2026-05-06 revert v12)** | naked compoundVariant flow | Field 留 layout flow,**不**用 `!absolute`(v12 absolute 跟 autoRowHeight 不相容)。視覺接受 cell `border-r grid` + Field border 2px 雙線;cell border-r divider 永遠保留(對齊 L4 Invariant divider-owner / editor-owner 分離)|
| **L6 Cell trigger indicator(v15,2026-05-09)** | naked-display branch + `showDisplayEndIcon?: boolean` opt-in | DataTable cell-registry 顯式傳 `showDisplayEndIcon` → Field component 內部 `<ItemSuffix>` 渲對應 trigger icon(Select/Combobox/PeoplePicker → ChevronDown / DatePicker → CalendarIcon / TimePicker → Clock / LinkInput 例外無 suffix)。table 外用法不傳此 prop = 純展示無 icon。詳 `.claude/planning/cell-indicator-ssot-rfc.md`。|

**前身 retire**:v4-v8 `outline-2` 平行 state(已下沉 L3)/ v9 border-only(focus 跟 open specificity tie)/ per-control `open && 'border-primary'`(v13.3 retire)/ `nakedCell{Hover,Focus,Open}Ring` 三 const / `nakedCell{Prefix,Suffix}Slot`(下沉 L1)/ **v12 `!absolute -inset-px` seamless grid**(2026-05-06 revert — autoRowHeight 不相容)/ **DataTable parallel `getEditIndicator`**(2026-05-09 D-path retire — 由 Field naked-display 透過 `showDisplayEndIcon` opt-in 自渲 ItemSuffix,跨元件 SSOT 統一)。

**反模式 ❌**:naked 自寫 `outline-*` / `box-shadow inset` state ring(用 L3) / hardcode `<span h-[1lh]>` slot(用 L1)/ hardcode `items-center`(用 L2)/ per-control `open && 'border-primary'`(用 L3 SSOT)。

**機械防漂移**:hooks `check_field_family_invariants.sh`(A.1 naked row-mode propagation / A.3 Field state ring SSOT,原 standalone hooks 已 folded)+ `check_pattern_invariants.sh`(C.2 inline-action canonical gap / C.4 row slot handcraft)write-time 攔 + `/design-system-audit` 對應 audit dim。

## 相關

- `./field-controls.spec.md` — Field Controls（Input/Select/etc.）共用規則：三 mode、size、focus、endAction、Display
- `./form-validation.spec.md` — 表單驗證標準（blur 驗證、zod schema、error 顯示）
- `../DescriptionList/description-list.spec.md` — 唯讀資訊展示（非表單）
- `../../patterns/element-anatomy/item-anatomy.spec.md` — SelectionItem 佈局（Checkbox / Radio 放進 Field 時 block 模式的參照）

## A11y 預設

**ARIA / Pattern**:對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應 pattern。

**Keyboard 行為**:Field 是純排版容器,不擁有任何鍵盤 handler,鍵盤行為全由內部 control 接管。

- Tab — focus 移進內部 control(Input / Select / DatePicker 等)
- Esc 取消編輯等行為由 control 本身或放置它的 host(如 DataTable cell)實作,**不在 Field**

**Focus**:focus-visible ring 對齊 DS canonical(`outline: 2px solid var(--ring)`);Field 不搶焦點,focus 由內部 control 自管。

**SR 識別路徑**(由既有 aria 接線達成,見「FieldContext」與「驗證與 aria 屬性」段):focus 進 control 時 SR 可得完整資訊——label(`htmlFor`/`id` 連結)、required(control 的 `aria-required`)、invalid(`aria-invalid`)、description(`aria-describedby`)、error(`aria-errormessage`;`<FieldError role="alert">` 另在錯誤出現時即時播報)。required 星號本身 `aria-hidden`,SR 資訊來自 `aria-required` 非 `*` 字元。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `description-list.spec.md`
- `element-anatomy.spec.md`
- `field-control-group.spec.md`
- `field-controls.spec.md`
- `form-validation.spec.md`
- `input.spec.md`
- `radio-group.spec.md`
- `switch.spec.md`
