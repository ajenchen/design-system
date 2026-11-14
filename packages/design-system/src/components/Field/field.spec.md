---
component: Field
family: self-contained
traits:
  - hasInteractiveStates
  - isStructural
variants: {}
sizes: {}
---


# Field 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> 表單 layout container canonical。Input / NumberInput / Checkbox / RadioGroup / Switch / Select / Combobox / DatePicker 等 field controls 皆消費本 spec 的 `orientation` / `controlLayout` / context API(mode / disabled / required / invalid / id)/ 水平對齊公式。跨元件 pattern canonical,scope 本質 > 單一元件。

## 定位

Field 是**表單欄位的佈局容器**。只負責排版（label / control / description / error 的空間關係）與**狀態 context**（把 mode / disabled / required / invalid / id 傳給子元件），**不擁有任何資料型別邏輯**。

與資料相關的一切（格式化、驗證、readonly 呈現、DataTable cell 顯示）住在各個資料型別的 Control 元件本身（Input、NumberInput、Checkbox、Switch 等）。Field 不 wrap、不代理、不轉換它們的行為。

**實作基礎**：自建——本 DS 的 form layout 設計。**拒絕的是 Field 層引擎耦合**（2026-07-03 精確化）：shadcn 的 `FormField` = react-hook-form `Controller` wrapper、脫離 RHF 不能用——本 DS 不採用，因 Field 同時是 DataTable cell 基底（naked variant）+ display/readonly 純展示載體，耦引擎會毒害非表單場景；Field 只做 layout + context（engine-agnostic，對齊 MUI FormControl 派:[FormControl.js](https://github.com/mui/material-ui/blob/fec132cb22a5f4f7e122f56cac616195e52bfeea/packages/mui-material/src/FormControl/FormControl.js) 只提供 context、不依賴任何表單引擎;對照 shadcn [form.tsx#L32-L42](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/form.tsx#L32-L42) 的 `FormField` 直接包 `<Controller>`）。**form 層另有可執行層** `useFormValidation`（基於 react-hook-form，wrapped 不外露，對齊 DS「基於 X」引擎慣例；見 `form-validation.spec.md`「可執行層」段）——引擎藏在 form 層 hook 內 ≠ Field 耦合，Field 經 `invalid` context 一行接入。

**Layout Family**：Field **不屬於** 4-Family Model 的 element layout families——它是 form composition pattern（包 Family 4 control + label + description）。見 taxonomy owner `patterns/element-anatomy/element-anatomy.spec.md`「Field Composition(不在 family 但相關)」段。

---

## 與 Field Controls 的職責切分

Field 和 Field Controls（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / PeoplePicker / Textarea）是兩件事：

- **Field**（本元件）：只管佈局 + 狀態 context
- **Field Controls / Checkbox / Switch / RadioGroup**：管自己的資料型別 + edit/readonly/disabled 三態 + 格式化(`mode="view"` 渲染供 DataTable cell 共用)

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

### Field 次要 action 的預留位置（canonical,尚未實作）

Field 若需要次要 action（如「重設」「全選」「從範本帶入」），**唯一預留位置 = label 行最右端**（label 與 action 兩端對齊）：

- 形式：超連結樣文字（link-like text），**字級與行高皆同 FieldLabel**（`text-body` 14px、同 label 的 leading）——同字級同行高即天然等高，這是「不增高」的機制核心（user 2026-08-05 確認）。
- 硬約束：**不得增加 label 行高度**（避免 field 被撐高）。等高機制之外還需三個盒模型條件缺一不可：(1) **零垂直 padding、無固定高度盒**——禁用 DS `Button`（xs 也自帶 `h-field-xs` 固定盒 + 自身 leading，`button.tsx` xs variant），必須是純文字元素；(2) **單行 `whitespace-nowrap`**（換行即行盒 ×2）；(3) **不得用 padding 把盒子撐大**（padding 直接長高 label 行）；也**不得在文字外加一圈看不見的邊**——命中區恆等於可視／懸停回饋的形狀，超連結樣文字的目標就是那行文字本身（owner = `ds-canonical/references/hit-area-canonical.md`）。underline／focus ring 不佔佈局，無礙。**2026-09-24 更正**：原文寫「hit target 以 pseudo-element／負 margin 擴大，不得用 padding 滿足 a11y 觸控目標」——「滿足 a11y 觸控目標」這個依據已撤回（本 DS 以滑鼠指標的精度為前提，不拿觸控尺寸建議當依據），連帶那個外擴處方也不再成立；保留的只有「不得用 padding」這條不增高的機制。
- 此位置是 field 次要 action 的**專屬 slot**——禁止把次要 action 放在 control 下方、error 位置或 field 外圍（那些位置屬 description/error/表單層動作）。
- 對齊世界級：Polaris TextField `labelAction`（https://polaris.shopify.com/components/selection-and-input/text-field 的「With label action」example；2026-08-05 WebFetch 驗證 prop 存在）。
- 狀態：**2026-08-05 user 拍板記錄,尚未實作**。實作時走 `<FieldLabelAction>` 類 slot + `/component-quality-gate`；在那之前任何 story/產品範例**不得**自行發明次要 action 擺位（anchor：PeoplePicker 多人 story 曾把 play() 測試用「重設協作者」按鈕誤植為 control 下方的產品 UI,2026-08-05 移除）。

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

**為什麼固定**：label / helper 是跨 Field family 的結構文字；若跟 control size 一起縮放，同一表單會失去一致的 label hierarchy。

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

適用：寬螢幕 form、設定頁裡跟其他欄位並列的控件(一列一個開關的設定列不用 Field,用自帶標題的 Switch,見 `../Switch/switch.spec.md`「設定列 vs 水平 Field」)。

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

**為什麼分兩套**:inline / block 是不同的對齊語意模型(固定高度可談整體中線 vs 多行群組只有第一行錨點),必分兩套。純 CSS 跨 size/density/字體自動連動,無 JS 測量。(附註・技術陷阱:曾試 `min-h + flex-center` 統一,出 block + 長 label regression——justify-center 失效 + 跟 SelectionItem 公式錯位,勿再嘗試)

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

正確做法是「**第一行對齊**」——後續 item 從第一行往下流,label 公式錨在第一行中線；如此 label anchor 不會隨 group item 數量改變。

### 為什麼 primitive 不自己變高

**Checkbox / Switch / RadioGroupItem 的 primitive 保持原生尺寸**(16-20px),不為了 form 而被拉高。理由:

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

**已宣告 block**:`RadioGroup`、`CheckboxGroup`(checkbox-group.tsx:93)。新增 `FileDropzone` 等同模式加 `fieldLayout = 'block'`。

---

## FieldContext — 子元件如何讀 Field 狀態

Field 透過 Context 暴露以下狀態給子元件（Primitive 可以透過 `useFieldContext()` 讀取）：

| 欄位 | 用途 |
|---|---|
| `id` | FieldLabel 自動 `htmlFor`、Input 自動 `id` |
| `descriptionId` | FieldDescription 的 id，Input 自動 `aria-describedby` |
| `errorId` | FieldError 的 id，Input 自動 `aria-errormessage` |
| `mode` | `edit` / `view` / `readonly` / `disabled`，Control 決定自己的視覺形態 |
| `disabled` | Control 顯示 disabled 樣式 |
| `required` | FieldLabel 自動渲染 `*`；Input 自動 `aria-required` |
| `invalid` | Control 顯示 error 邊框；Input 自動 `aria-invalid` |
| `size` | Control 自動同步尺寸（sm / md / lg） |
| `orientation` | FieldLabel 的垂直對齊策略（horizontal 模式套用 padding-top 公式） |
| `hasFieldWrapper` | Primitive 讀到此旗標時應忽略自己的 label / description prop，由 FieldLabel / FieldDescription 接管 |

### Control 偏好尺寸（`fieldPreferredSize`）SSOT

Field 未收到顯式 `size` 時，依序取 **顯式 prop → control 宣告的 `fieldPreferredSize` → `md`**（`field.tsx` `detectPreferredSize`）。Control 以自身檔案的 static 宣告偏好（唯一現行宣告者 = InlineEdit `'sm'`，owner 句 `InlineEdit/inline-edit.spec.md`）。

**解析時序**：control 是 Field 的直接子元件時，Field 可同步讀取 static 偏好。wrapper 元件、`React.memo` 或 HOC 會遮蔽 static，但 control 會在掛載時透過 `useRegisterFieldPreferredSize` 補註冊：control 自身以 fallback 同步解析為偏好尺寸，Field 的控件槽高度則在註冊後跟上。Consumer 在 Field 或 control 顯式傳入的 `size` 永遠優先，不會被註冊覆寫。

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

- **與 label 間距 `gap-1`(4px)**、InfoIcon **16px 固定**、色 `fg-muted` hover `fg-secondary`(`field.tsx:438-454`)
- **游標一般箭頭**(`cursor-default`,`field.tsx:447`):ⓘ 點下去不做事(Radix Tooltip 點擊只會收起說明),手形會讓人以為點了有作用。全域 `base.css` 讓所有 `<button>` 預設手形,所以要明寫 `cursor-default`,只刪 `cursor-pointer` 蓋不掉。〔2026-09-26 由手形改箭頭;user 條件式同意「I 可以從手形改掉，若改掉更合理的話」,AI 研究後提出、user 選「同意,照清單寫入」〕
- **disabled 時整顆不渲染**(`field.tsx:438`)— info 是滑過／聚焦才浮出的補充說明,非類型身份 indicator,non-editable 隱藏
- 設計定位:**給資訊的觸發處**(`ds-canonical/references/hit-area-canonical.md` 三-1),**不是**行內動作 —— 只借行內動作「顏色退後、滑過深一階」的長相,不套 `inline-action.spec.md` 的「必須手形」(那條給清除、顯示密碼這類按下去會做事的鈕)。label 的主要互動是 input,info 是輔助
- 範例:`field.stories.tsx`「標籤旁的說明圖示」

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
<FieldGroup horizontalLabelWidth="120px">
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

**欄位垂直間距 = `--layout-space-loose`,不開放 per-instance 選檔(2026-09-12 user 拍板〔UD-F19〕)。**

`FieldGroup` 直接消費 `gap-[var(--layout-space-loose)]`(md 16px / lg 24px),**沒有 `gap` prop**。
表單間距是**系統級**設定:要調就整個 density 一起調,不是每個表單各自挑一檔。
依據是 DS 自己早就寫下的規則 —— `tokens/layoutSpace/layoutSpace.spec.md`「親疏 3 級」表逐字把
「跨範疇 + parallel / independent」的例子列為「**form fields stack(parallel inputs)**」→ 規則 3 = **loose**。

**退役紀錄**:原本有 `gap?: 'compact' | 'normal' | 'loose'`(硬寫 `gap-3/4/6`、凍結不隨 density)。
它來自 2026-04-10 的 `9917993e`,commit 訊息宣稱「rename to shadcn conventions」(`git show 9917993e`:「refactor(fields): restructure field architecture + rename to shadcn conventions」)([來源](https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/field.tsx#L44)),
但 shadcn 的 `FieldGroup` **根本沒有 gap prop**(props 只有 `className`,間距由元件固定)——
那三檔是重構時自己長出來的,沒有任何 user 決定背書(本檔其餘 user 決定都有 user 拍板 / user 確認標記,
唯獨那張表沒有)。實際使用也證實它不帶資訊:全 repo 33 個 `<FieldGroup>` 只有 2 個傳過 `gap`
(1 個 `compact` 沒寫理由、1 個傳的就是預設值),`loose` 一次都沒用過。
世界級同樣沒有一家開放 per-instance 檔位:shadcn 元件固定 / MUI 泛用數值 × theme spacing /
Ant 全域 token `itemMarginBottom` 走 ConfigProvider。
**影響**:md 下新舊值都是 16px(33 個用法裡 32 個視覺零變化),lg 下從凍結的 16px 變成 24px。

### FieldGroup `horizontalLabelWidth` cascade(2026-04-20)

同一畫面 / 同一 FieldGroup 內多個 horizontal Field **必須共用 label 欄寬度**。若每個 Field 各自傳 `labelWidth`(或省略 → 內容撐開),label 寬度會參差不齊,Switch / Input 的左邊緣不對齊,視覺上每一行「歪七扭八」。

表單的 label 欄固定寬，讓每列 control 從同一條線開始，使列與列形成可掃描的欄位格網；label 長度不得逐列改變 control 起點。

`FieldGroup horizontalLabelWidth` 透過 React Context cascade 到所有子 Field(含 `vertical` 模式的 Field 不受影響——vertical 無 label 欄概念)。單一 Field 仍可用自己的 `labelWidth` prop 覆寫 group 預設(罕見 — 通常 group 預設就是 canonical)。

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
| ✅ Upload(產生 file value) | ❌ 表單 submit / cancel(form action:跟在欄位後面,或放進浮層 / 面板的 footer) |
| ✅ Picker opener(開對話框選 value) | ❌ 「重設此欄位」(可放到 endAction 或 description 旁,不是 control) |
| ✅ Connect OAuth(產生 token value) | ❌ 頁面導覽、刪除整筆資料(page action) |

**規則**:Button 是 control 時通常 inline(高度 = field-height);若是 block 類的「上傳區塊」(FileDropzone),則該元件本身宣告為 block primitive。

---

## 邊界案例

- **空 Field(無 control children)**:code 不擋——control area 渲染成空容器。Field 是佈局容器,無 control 即無意義,屬 consumer 誤用
- **RTL**:不支援；全域 LTR-only compatibility contract 見 `packages/design-system/README.md#compatibility-matrix`。horizontal label / suffix alignment 不在本檔另立支援決策。

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
- **多欄位垂直堆疊**：搭配 `FieldGroup` 統一管理欄位垂直間距（單一值 `--layout-space-loose`，隨 density 縮放；無 per-instance 選檔，見上方「欄位垂直間距」段）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 唯讀資訊展示 | `DescriptionList` | Field 是表單容器，純展示用 `dl/dt/dd` 語義 |
| 單一 Checkbox（勾選同意）without label 結構 | 直接 Checkbox + label prop | 單個 Checkbox 是 inline primitive，不需要 Field 佈局 |
| DataTable cell 編輯（inline editable）| 直接放 Field Control | Field 是頁面表單佈局，table cell 空間受限 |
| 把 Field 當輸入元件本身（常見誤解：「Field = form 輸入框」）| `Input` 等 Field Control | Field 只管佈局 + context，輸入行為住在 control（見「與 Field Controls 的職責切分」）|
| 純 action 按鈕（submit / cancel / 頁面導覽）| 跟在欄位後面的按鈕 / 浮層·面板的 footer / toolbar | Field 是資料輸入容器，不放頁面級 action |
| 巢狀 Field | ❌ 不支援 | Field 不支援巢狀，多欄位用 FieldGroup |

## Anatomy stories

對應 anatomy story:`Overview` + `Inspector`(元件檢閱器——切 orientation / size / mode / required / invalid 即時 render)+ `OrientationMatrix` + `SizeMatrix` + `StateBehavior` + `ColorMatrix` + 元件特有 `FieldGroupBehavior` + `Accessibility`。

## Field state machine SSOT(v13.3)

**Canonical**(2026-07-04 Q1 拍板修訂):**focus dominates everything — 除 error**。無 error 時 cursor in input = 藍;**有 error 時聚焦維持紅**(error 勝 focus 的「顏色」通道;修錯中不可失去 error 訊號)。開始編輯 → edit-clears-error(`useFormValidation`)→ 自然回 focus 藍。Benchmark 實查:MUI(error+focused 紅框加粗,OutlinedInput.js error rule 排 focused 後,[#L63-L83](https://github.com/mui/material-ui/blob/fec132cb22a5f4f7e122f56cac616195e52bfeea/packages/mui-material/src/OutlinedInput/OutlinedInput.js#L63-L83))/ Ant(`activeBorderColor: colorError` 紅框紅 glow,[input/style/variants.ts#L99-L105](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/input/style/variants.ts#L99-L105))/ Polaris(紅 border 聚焦持續 + 獨立藍 outline,[TextField.module.css#L67-L92](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-react/src/components/TextField/TextField.module.css#L67-L92))三家聚焦時 error 紅皆保留;唯一切藍的 Carbon 靠 in-field 紅 icon 補償(`:focus` 換藍框 [_text-input.scss#L72-L75](https://github.com/carbon-design-system/carbon/blob/593de4deda2d96f47f71cdfc9b30d07bd1302304/packages/styles/scss/components/text-input/_text-input.scss#L72-L75)、紅 icon [#L122-L124](https://github.com/carbon-design-system/carbon/blob/593de4deda2d96f47f71cdfc9b30d07bd1302304/packages/styles/scss/components/text-input/_text-input.scss#L122-L124);DS 無此通道故不採)。SSOT 全在 `field-wrapper.tsx` compoundVariants(**含 error** — 2026-07-04 起 `error` 為 cva 變體,原逐 control `border-error` 系列已 retire,控件只傳 `error` flag)。

| State | Token | CSS |
|---|---|---|
| rest | `--border` | `border-border` |
| hover(無 focus、自己的浮層沒開)| `--border-hover` | `hover:border-border-hover` |
| **focus(無 error)** | `--primary` | **`focus-within:!border-primary`**(error:false compound)|
| focus + hover | `--primary` | `focus-within:hover:!border-primary`(M11 AND case)|
| **自己的浮層開著(無 error)**:焦點留在欄位裡或已搬進浮層都算;滑過也不變 | `--primary`(= 聚焦的框)| `data-[field-open]:!border-primary`(error:false compound,default 與 naked 各一條)|
| **error(edit 全程,含聚焦)** | `--error` | `border-error hover:border-error-hover focus-within:!border-error focus-within:hover:!border-error`(error:true compound)|
| error × 自己的浮層開著(滑過也不變)| `--error`(不是 `--error-hover`)| `data-[field-open]:!border-error`(error:true compound,default 與 naked 共用)|

**欄位自己的浮層開著 = 維持聚焦的框**(本節是這條規則的唯一出處;其他規格與程式註解只指過來,不重述):
- **規則與優先序**:欄位 + 它自己打開的浮層(選單 / 月曆 / 時間面板)= 同一個欄位,所以浮層開著時外框維持聚焦的樣子,不看焦點留在欄位裡還是已搬進浮層。優先序:錯誤 > 自己的浮層開著 = 聚焦 > 滑過 > 預設 —— 錯誤欄位開著仍是 `--error` 紅框;開著又滑過仍是聚焦的框(兩條都帶 `!`,不被 `hover:` 蓋回去)。只有 wrapper 型宿主有這條,而且只在編輯模式(`<textarea>` 自己是宿主,沒有浮層)。**來源**:規則是 AI 建議、user 2026-11-12 採納(逐字句首「我覺得可以照你建議」;全句後半談的是工作方式,不是這條規則)。2026-11-12 前本表寫「open = 維持自己的 hover 框」(開著是滑過的灰;錯誤欄位是 `--error-hover`)—— 2026-11-12 查核那一條查無 user 原話,而且框色取決於焦點落在哪(改前實測:不可打字的 Select 開著是灰、可打字的日期欄位按 ↓ 打開由藍變灰),已退役。同一個想法早已管「離開欄位才算 blur」(`../../lib/composite-field-focus.ts` 檔頭)。**併排欄位組**:成員自己的浮層開著時,跟聚焦同一層、浮到鄰居上面(不然聚焦的框被相鄰那格的邊框蓋掉一邊;這一條是 AI 推導),而且壓過鄰居的滑過(下方「併排欄位組:聚焦 / 開著壓過滑過」),疊放規則住 `../FieldControlGroup/field-control-group.spec.md`「States」。
- **記號**:外框只認欄位自己掛的 `data-field-open`(屬性存在 = 開著)。唯一寫入者 = `../../lib/composite-field-focus.ts` 的 `fieldOpenProps`;每個欄位的外框宿主自己展開 `fieldOpenProps(open)`,而且寫在 consumer 傳進來的 props 之後(Select / Combobox(PeoplePicker 走這兩支)/ DatePicker / 日期區間 / TimePicker,共 5 處)—— 外面傳同名屬性蓋不掉,記號也不會落到不是欄位的觸發點上。**不認 Radix 通用的 `data-state="open"`**:那個屬性任何一層 Trigger 都會寫,外面的浮層把欄位元件當觸發點時,Radix Slot 會把外面那層的值蓋到欄位外框上 —— 2026-11-13 拿「認 `data-state`」的寫法實測 84 格:外面的浮層開著 → 欄位假藍 35 / 35;外面包了一層 → 欄位自己開著卻是灰 36 / 42(同檔檔頭最後一段);改認記號之後同一組重量,兩項都是 0(0 / 35、0 / 42)。這組數字來自一次性探針(不在 repo);同一件事的常駐檢查是瀏覽器閘 `field-open-border-invariant.mjs` 的 X 列。記號這個做法是 AI 的工程判斷(2026-11-13),不是 user 的決定。**關掉之後**:記號消失,框色回到純 focus 機制 —— 選完選項 Radix `onCloseAutoFocus` 把焦點還給欄位 → `focus-within` → 藍;點外面離開 → 焦點移外 → 灰。
- **邊界(只認欄位自己的主浮層;這幾條的寫法是 AI 推導)**:(1) 欄位裡的小按鈕開的選單不算(檔案檢視器縮放那顆,`../FileViewer/file-viewer.tsx` —— 那是按鈕的浮層,欄位不寫記號);(2) 包在欄位外面、把欄位當觸發點的浮層不算(Tooltip / Popover / DropdownMenu / Coachmark 導覽提示 —— 它們寫不到記號)。這樣包不影響框色,但另有與框色無關的副作用(2026-11-13 實測):Popover / Coachmark / Dialog / DropdownMenu 包純輸入欄時,裡面的 `<input>` 變成 `type=button` 並多出 `aria-haspopup` / `aria-expanded`;DatePicker / TimePicker 外框的 `aria-expanded` 被外面的值蓋掉 —— 屬這些浮層「觸發點該是什麼」的問題,不歸本表;DS 內沒有這種用法(唯一一筆 Tooltip 包 Input 是 `../Tooltip/tooltip.principles.stories.tsx` 的 ❌ 反例示範);(3) 欄位另外掛出去的小浮層(Combobox「+N」浮出清單)不算:記號只跟主浮層的 open 走。這張卡是滑過或聚焦「+N」就打開的預覽,卡的內容鍵盤到不了(`../OverflowIndicator/overflow-indicator.spec.md`「A11y 預設」Focus 段);焦點會在卡裡的只有「滑鼠按住卡裡 Tag 的 ×」那一下,放開後 `../../lib/collection-removal-focus.ts` 把焦點送回欄位,外框就是聚焦的框。「離開欄位才算 blur」那一半把這張卡算成同一個欄位(`../../lib/composite-field-focus.ts` 的 `extra`),為的是那一下不誤跑驗證;外框不為那一下另外變色 —— 兩半認的範圍不同是刻意的(AI 判斷;2026-11-13 實測:滑到「+N」卡開著 → 外框是滑過的灰,這次改動前後相同)。按鈕類觸發不歸本表,照舊「開著 = 自己的 hover」:`../../patterns/element-anatomy/inline-action.spec.md`「Overlay trigger canonical」、`../Button/button.spec.md`「狀態疊加(開啟中 / pressed / aria-disabled)」。
- **世界級對照**(原始碼 2026-11-12 開檔核對;2026-11-13 連結釘到固定 commit,逐檔與核對時存的副本位元組相同;看的是下拉選擇類開著時聚焦樣子還在不在):MUI Select 選單開著時不把 blur 往上傳,`focused` 狀態不被清掉(`if (!open && onBlur) {`,[SelectInput.js#L642-L643](https://github.com/mui/material-ui/blob/e2683473c5d0e1982ba90a7f093373a18859031a/packages/mui-material/src/Select/SelectInput.js#L642-L643));MUI X 日期 / 時間選擇器面板開著時直接把欄位設成 focused(`focused: pickerContext.open ? true : undefined`,[useFieldInternalPropsWithDefaults.ts#L63](https://github.com/mui/mui-x/blob/e6febb3da510f52bffe6c742c3c8bc692b381f79/packages/x-date-pickers/src/internals/hooks/useField/useFieldInternalPropsWithDefaults.ts#L63))—— 焦點已在月曆裡、欄位仍是聚焦的樣子,與本規則同一種做法。Ant Design Select 的框色認元件自己寫的 `-focused` class,`-open` 只把已選值調淡、不改框([select-input.ts#L48-L49](https://github.com/ant-design/ant-design/blob/b975f70f2e5101d638ce32662bde7f6eb2c9bf81/components/select/style/select-input.ts#L48-L49)、[#L333-L338](https://github.com/ant-design/ant-design/blob/b975f70f2e5101d638ce32662bde7f6eb2c9bf81/components/select/style/select-input.ts#L333-L338))。Carbon ComboBox 的聚焦外框線認元件自己寫的 class,選單開著時還在(指到選項時線由 2px 變 1px,[_combo-box.scss#L53-L63](https://github.com/carbon-design-system/carbon/blob/93583caf0925da6a08aac7c705beaae5001b79d7/packages/styles/scss/components/combo-box/_combo-box.scss#L53-L63);class 由 `isFocused` 狀態寫,[ComboBox.tsx#L893](https://github.com/carbon-design-system/carbon/blob/9bfa9e5aa8f888a0be2da9e88ab554fa9f1328a3/packages/react/src/components/ComboBox/ComboBox.tsx#L893))。Fluent UI v9 Combobox 的聚焦樣子掛在 `:focus-within`([useComboboxStyles.styles.ts#L70-L71](https://github.com/microsoft/fluentui/blob/6d02793e21251c1aecc33429ae2f9a8ed0e6469b/packages/react-components/react-combobox/library/src/components/Combobox/useComboboxStyles.styles.ts#L70-L71)),選單開著時焦點留在輸入框所以一直成立(選項用 active-descendant 追蹤,[useCombobox.tsx#L48](https://github.com/microsoft/fluentui/blob/42b30d8d0fa98f47ee39ca4736634c068631714c/packages/react-components/react-combobox/library/src/components/Combobox/useCombobox.tsx#L48))。Atlassian Select 的聚焦樣式由 `isFocused` 狀態決定,焦點落到選單清單時送回輸入框(<https://bitbucket.org/atlassian/atlassian-frontend-mirror/raw/6202f488beebf1140ad5557f61d8d5e1b08d81c3/design-system/react-select/src/components/control.tsx> 122–125 行、<https://bitbucket.org/atlassian/atlassian-frontend-mirror/raw/01dc0fa605306aa4b97e1138597265710fcfffaa/design-system/react-select/src/select.tsx> 2028–2030 行)。已查到相反的一處:Fluent 的 DatePicker 打開時把焦點送進月曆(`// When the popup is opened, focus should go to the calendar.`,[useDatePicker.tsx#L449-L455](https://github.com/microsoft/fluentui/blob/d2375b2452d9b8882ed63d4f4e91d8f537379e27/packages/react-components/react-datepicker-compat/library/src/components/DatePicker/useDatePicker.tsx#L449-L455)),月曆不在欄位裡,欄位的 `:focus-within` 不再成立(讀原始碼推得,沒有實機量)—— 本規則不分欄位種類,日期欄位開著一樣維持。其餘幾家的日期欄位在焦點進到月曆之後聚焦樣子還在不在,沒有查到定論,不列入對照。
- **併排欄位組:聚焦 / 開著壓過滑過(已定,2026-11-13)**:併排欄位組裡聚焦或自己的浮層開著的那一格,框永遠四邊完整;滑鼠滑到它左、右鄰居時,兩格共用的那條線仍是它的框色,不是鄰居滑過的灰;鍵盤聚焦同樣適用。**來源**:AI 建議甲、user 2026-11-13 採納,原話「你問我的問題，照你建議」(當時成品頁唯一一題就是這題)。本條只記結論與來源;怎麼疊(聚焦 / 開著 z-index 4、滑過 3)、為什麼、改前的現況(2026-11-13 前三種同層,滑到右邊那格時共用的線是它滑過的灰)住 `../FieldControlGroup/field-control-group.spec.md`「States」。世界級在這題不一致,所以當時是真取捨:Ant Design 併排元件把滑過、聚焦、按下放在同一層(`hoverEffects` 全部 `zIndex: 3`,[compact-item.ts#L30-L47](https://github.com/ant-design/ant-design/blob/5632e40fceabdbcdfef7e536158aaf404898c867/components/style/compact-item.ts#L30-L47);本 DS 改前同它);Bootstrap input-group 只把聚焦的那一格抬高、滑過不抬(`// Bring the "active" form control to the top of surrounding elements`,[_input-group.scss#L49-L53](https://github.com/twbs/bootstrap/blob/9062790fdb2379593a2973416dc5a3bfb203e4e3/scss/forms/_input-group.scss#L49-L53));Polaris Connected 也只有聚焦那一格最高(`--pc-connected-focused: 30`,[Connected.module.css#L3-L5](https://github.com/Shopify/polaris-react-archive/blob/a8ceec19306b62a0c0a5033efc633232da59ff9e/polaris-react/src/components/Connected/Connected.module.css#L3-L5)、[#L32-L35](https://github.com/Shopify/polaris-react-archive/blob/a8ceec19306b62a0c0a5033efc633232da59ff9e/polaris-react/src/components/Connected/Connected.module.css#L32-L35);那一版成員之間留間距、不共用一條線,只取它的層級順序 —— 細節見 `../FieldControlGroup/field-control-group.spec.md`「States」)—— 本規則與後兩家同向。

**Error × focus 疊加 canonical(2026-07-05 記為 user 拍板照 Mantine,來源不明:登記簿查無原話)**:錯誤欄位聚焦時**視覺完全不變**(紅框同色同寬,無加深/加粗/ring/暈)。依據:DS 聚焦主機制 =「邊框換 primary 基準色、無第二訊號」,同款機制的 Mantine(focus 僅 border 換 primary-filled、outline none,錯誤時 border 維持 error,[Input.module.css#L208-L215](https://github.com/mantinedev/mantine/blob/82fb128c43f9927c1370a2732cd5aa9e6663ca11/packages/@mantine/core/src/components/Input/Input.module.css#L208-L215))在此題同樣選擇不變;保紅又加訊號的三家(MUI 粗 [OutlinedInput.js#L63-L65](https://github.com/mui/material-ui/blob/fec132cb22a5f4f7e122f56cac616195e52bfeea/packages/mui-material/src/OutlinedInput/OutlinedInput.js#L63-L65) / Ant 暈 [variants.ts#L99-L105](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/input/style/variants.ts#L99-L105) / Bootstrap 暈 [v5.3.8 mixins/_forms.scss#L24-L76](https://github.com/twbs/bootstrap/blob/v5.3.8/scss/mixins/_forms.scss#L24-L76))前提是其一般聚焦本來就有該第二訊號可染紅,DS 無此前提。**已知代價(documented tradeoff,非 bug)**:無游標的觸發器(Select / DatePicker / TimePicker)error 聚焦時無視覺聚焦指示(文字框靠游標);Mantine 同款弱點。未來若升級全 DS 聚焦語言(一般態加第二訊號),本題應同步重議(錯誤態染紅該訊號,對齊 MUI/Ant/Bootstrap 結構)。D4 finding「error+focus 零 focus delta」據此結案為 user-拍板 intentional。

**反模式 ❌**:各元件自己寫 `open && 'border-primary'`(Combobox / Select / PeoplePicker,v13.3 已全 retire)/ 在欄位外框上認 `data-[state=open]` 來換框色 / 在 `field-wrapper.tsx` 以外用 `data-[field-open]` 換框色 / 在 `../../lib/composite-field-focus.ts` 以外手寫這個記號 —— 開著的框只有 `field-wrapper.tsx` 這一份、只認 `data-field-open`,記號只有一個寫入者(上方「記號」)。hook `check_field_family_invariants.sh` A.3(原 check_field_state_token_consume)write-time 攔,攔哪幾種寫法以 hook 本身為準。

---

## Naked variant — Cell-as-input(M19 SSOT,v15)

`naked` = cell-as-input(表格格子本身就是外框:host cell 提供 box,Field 融入)。**核心**:完全繼承 Field default state machine,只改**物理尺寸 + 位置**;唯一例外:檢視態滑過才出現的動作(網址格的「編輯連結」)改畫成 Button text xs(24、無框),見 `../../patterns/element-anatomy/inline-action.spec.md` 實例表「DataTable body cell internal — 檢視態滑過才出現的動作」(user 2026-10-28「Q4用乙'」)。Combobox/Select 加新 stacking 子元件必檢查 cell context;cell 內元件不要自寫 `position:absolute/fixed` 對抗(必要時加 `// @field-state-ring-allow:` 通過 hook)。

### Layer 分配

| Layer | Home | 內容 |
|---|---|---|
| **L1 Slot** | `patterns/element-anatomy/item-anatomy.tsx` | `<ItemPrefix>` / `<ItemSuffix>`(永遠 `h-[1lh]` 對齊第 1 行) |
| **L2 Align** | `field-wrapper.tsx` `nakedCellRowModeAlign` | host cell `data-row-mode` propagate(autoRow→items-start / fixed→items-center)|
| **L3 State machine** | **繼承 Field default v13.3**(↑ 上方 SSOT)| 不重定義 |
| **L4 Display hover** | `field-wrapper.tsx` `nakedCellEditableDisplayHover` | **意思 = 「這格可以編輯」**:跟著能不能編輯走,不跟點下去做什麼走 —— DataTable 有連結的可編輯網址格點了開連結,照樣出;不能編輯的格不出(2026-11-10 user「表格跟輸入框難道不應該是類似的邏輯嗎？hover連結表格難道不應該出現更深顏色的框嗎？然後同時在非筆的地方都是會開啟最常用的功能（開啟連結）？這樣做有什麼問題？這樣不是跟輸入框一致？」(問句,逐字全文;同一句也引在 `../../../ds-canonical/references/hit-area-canonical.md` 五「網址框」例),同編輯態 Field 外框滑過變深;`../DataTable/data-table.spec.md`「Navigate-valued cell 通用類別」第 1 條)。例外:值本身就是控件的格(boolean 勾選框)不出框,由勾選框自己表達【AI 推導:補記現行程式 `../DataTable/data-table.tsx` `cellShowsEditableHover` 排除 `boolean` 的行為,畫面與行為不變;這句未經 user 確認】。editable cell view mode `outline-1 outline-offset:-1 outline-[var(--cell-hover-outline-color,var(--border-hover))]`(cell wrapper outline;2026-05-10 Slice D:spreadsheet overlay 啟用時 DataTable cell host 可 set `--cell-hover-outline-color: transparent` 抑制 outline、讓 overlay layer 接管 hover ring paint,fallback 即 `--border-hover` 既有行為不變)。**v15.13 design intent(user-accepted 2026-05-07)**:hover ring 蓋 cell.borderRight。**known asymmetry**(2026-05-09 user 重抓):只 **right** 邊 outline 跟 cell own border-r 同位置覆蓋成 1 條;top/left/bottom 邊 outline 在 cell.outer 內 1px,grid lines(前 row border-b / 前 cell border-r / row 自己 border-b 在 cell.outer 外 1px)露出 → 視覺 4 邊不對稱。**Pending design decision**(等 user 拍板才 ship):4 邊都蓋(spec 1 selection-style)vs 4 邊都不蓋(spec 2 inset 1px)vs 維持現狀。三層 SSOT:state source = cell wrapper / paint owner = 混合(hover=cell / edit=Field)/ grid divider = DataTable own |
| **L5 Position(v14,2026-05-06 revert v12)** | naked compoundVariant flow | Field 留 layout flow,**不**用 `!absolute`(v12 absolute 跟 autoRowHeight 不相容)。視覺接受 cell `border-r grid` + Field border 2px 雙線;cell border-r divider 永遠保留(對齊 L4 Invariant divider-owner / editor-owner 分離)|
| **L6 Cell trigger indicator(v16,2026-07-08 user 拍板 A 案〔UD-J24〕)** | naked-view branch + `showDisplayEndIcon?: boolean` opt-in(**default off,production 不再傳**)| **view 態零恆顯型別 icon** — editable affordance 統一 = L4 hover outline。Benchmark(Ant editable-cells 純文字+hover border [table/demo/edit-cell.tsx#L11-L23](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/table/demo/edit-cell.tsx#L11-L23) / MUI X singleSelect view 純文字 https://mui.com/x/react-data-grid/editing/ / AG Grid 無內建 indicator https://www.ag-grid.com/react-data-grid/cell-editing/ / Atlaskit v2.0.0 移除 hover-pencil 後 9 版未回歸 https://github.com/pioug/atlassian-frontend-mirror/tree/main/design-system/inline-edit / Notion / Airtable click-to-edit)view 態皆無恆顯 icon;唯一反例 Google Sheets Chip/Arrow 為 spreadsheet 域可選檔位。prop 保留為 spreadsheet-flavored 消費端 opt-in 逃生門:傳 true → `<ItemSuffix>` 渲型別 icon(Select/Combobox/PeoplePicker → ChevronDown / DatePicker → Calendar / TimePicker → Clock / **LinkInput 例外 = wrapper 無型別 icon;可編輯時另有 `viewEditAction` 畫的編輯入口**(Button text xs 鉛筆,滑過 / 鍵盤焦點才出現,是 action 不是型別 icon;inline-action 實例表「檢視態滑過才出現的動作」)。cell-registry 現況:6 picker 站不傳;url 站傳 `isEditable === true`(取 wrapper chrome 對齊 edit Input),可編輯時再傳 `viewEditAction`(鉛筆由 LinkInput 自己畫,表格只給出現時機)。edit 態 chevron 照舊(edit-trigger 通道,不受此 prop 管)。**值內容 vs affordance 分層(2026-07-08 user Q2 拍板)**:值內容(`selectedItemRenderer` 輸出 / avatar / type icon 等語意呈現)歸 value renderer,view 態照常渲染,恆顯**不**違反本條;本條管的是 affordance(chevron / pencil / outline)。前身 v15 恆顯制(2026-05-10/06-26 拍板)由本輪 benchmark 重判推翻。詳 `.claude/planning/cell-indicator-ssot-rfc.md`(六家實查 SSOT)。|

**前身 retire**:v4-v8 `outline-2` 平行 state(已下沉 L3)/ v9 border-only(focus 跟 open specificity tie)/ per-control `open && 'border-primary'`(v13.3 retire)/ 開著 = 滑過的灰框 `data-[state=open]:border-border-hover`(2026-11-12 retire;現行 = 開著維持聚焦的框、認 `data-field-open`,見上方 SSOT)/ `nakedCell{Hover,Focus,Open}Ring` 三 const / `nakedCell{Prefix,Suffix}Slot`(下沉 L1)/ **v12 `!absolute -inset-px` seamless grid**(2026-05-06 revert — autoRowHeight 不相容)/ **DataTable parallel `getEditIndicator`**(2026-05-09 D-path retire — 由 Field naked-display 透過 `showDisplayEndIcon` opt-in 自渲 ItemSuffix,跨元件 SSOT 統一)。

**反模式 ❌**:naked 自寫 `outline-*` / `box-shadow inset` state ring(用 L3) / hardcode `<span h-[1lh]>` slot(用 L1)/ hardcode `items-center`(用 L2)/ per-control `open && 'border-primary'` 或自己認 `data-[state=open]` 換框色(用 L3 SSOT;開著的框見上方「欄位自己的浮層開著」)。

**機械防漂移**:hooks `check_field_family_invariants.sh`(A.1 naked row-mode propagation / A.3 Field state ring SSOT,原 standalone hooks 已 folded)+ `check_pattern_invariants.sh`(C.2 inline-action canonical gap / C.4 row slot handcraft)write-time 攔 + `/design-system-audit` 對應 audit dim;「開著的框」另有瀏覽器閘 `field-open-border-invariant.mjs`(`npm run test:field-open-border`,量畫出來的四邊框色,已接進 CI)。

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

**Focus**:Field 家族的焦點指示 = **欄位邊框轉主色**(1px `focus-within:!border-primary`,error 態維持紅),**不畫**全域 2px 外描邊 —— 可打字時焦點在內部 input(插入點控件),關閉的觸發器是 wrapper 自己聚焦時亦同(`fieldWrapperStyles` 以 `focus-visible:outline-none` 抑制,@focus-suppress C);欄位自己的浮層開著時維持同一個指示,不看焦點在欄位還是浮層裡(上方「Field state machine SSOT」)。唯讀態長相同樣是 1px 邊框轉主色(唯讀的透明邊框轉成主色,不另畫外框),但**只在鍵盤聚焦時畫、滑鼠點不變**(2026-11-11 user「確認 polaris真的就是這樣的話那就照你建議」;落地與來源見 `field-controls.spec.md`「Focus 行為」readonly 段)。owner = `ds-canonical/references/focus-canonical.md` 規則二「Field 家族控件本身」列 + 「唯讀的 Field 控件」列。Field 不搶焦點,focus 由內部 control 自管。

**SR 識別路徑**(由既有 aria 接線達成,見「FieldContext」與「驗證與 aria 屬性」段):focus 進 control 時 SR 可得完整資訊——label(`htmlFor`/`id` 連結)、required(control 的 `aria-required`)、invalid(`aria-invalid`)、description(`aria-describedby`)、error(`aria-errormessage`;`<FieldError role="alert">` 另在錯誤出現時即時播報)。required 星號本身 `aria-hidden`,SR 資訊來自 `aria-required` 非 `*` 字元。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `combobox.spec.md`
- `data-table.spec.md`
- `date-picker.spec.md`
- `description-list.spec.md`
- `element-anatomy.spec.md`
- `field-control-group.spec.md`
- `field-controls.spec.md`
- `form-validation.spec.md`
- `inline-action.spec.md`
- `inline-edit.spec.md`
- `input.spec.md`
- `link-input.spec.md`
- `people-picker.spec.md`
- `radio-group.spec.md`
- `select-menu.spec.md`
- `select.spec.md`
- `steps-state-visuals.spec.md`
- `switch.spec.md`
- `time-picker.spec.md`
