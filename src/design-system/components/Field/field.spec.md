---
component: Field
family: null
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

## Horizontal 模式的 label 垂直對齊（重要）

### 規則（依 controlLayout 分兩套策略）

Label 的對齊策略依 `controlLayout`（Field 自動偵測 / consumer 可覆寫）分兩套，分別對應 control 語意模型的差異：

#### A. Inline control（`Input` / `Button` / `Switch` / `SegmentedControl` 等）

Control 有固定單行高度 = `--field-height-{size}`，可以談「中線對齊」。依 label 總高度分兩段：

| 情境 | 對齊方式 |
|---|---|
| **label 總高 ≤ field-height**（單行或很短）| label 第一行中線對齊 control 中線（視覺置中於 control）|
| **label 總高 > field-height**（多行超出 control）| label **齊頂**對齊 control top——整個 label 從 control 上緣往下長 |

切換點自動發生在 label 高度 = field-height 時。

**實作**：`min-h-field-{size} flex flex-col justify-center`(具體 class 串見 `field-wrapper.tsx`)。

原理:

| Label 高度 | 容器行為 |
|---|---|
| 單行 < min-h | min-h 生效容器撐到 field-height，`justify-center` 自動置中 → 第一行中線對齊 control 中線 ✓ |
| 多行 ≥ min-h | 內容超過 min-h,容器自然被撐大,`justify-center` 無餘裕 → label top 對齊 control top ✓ |

#### B. Block control（`RadioGroup` / `CheckboxGroup`）

Control 是多行群組，**沒有「整體中線」可以對齊**；錨點是「第一個 item 的第一行中線永遠在 `field-height/2`」，由 SelectionItem 的 `py = calc((field-height - 1lh)/2)` 維持。

**對齊策略**：label 第一行永遠與第一個 item 第一行對齊，不論 label 長短。

**實作**：`padding-top: calc((field-height - 1lh)/2)`（把 label 第一行推到跟第一個 item 第一行同位置）

這個策略對任何 label 長度都正確：短 label 視覺置中於第一個 item；長 label 從第一個 item 的位置往下延伸超過 control，不會出現 inline 情境那種「label 卡在下半部」的問題，因為 block control 本身就多行。

### 為什麼不能只用一套策略

曾經嘗試用 `min-h + flex-center` 統一處理所有情境——**在 block + 長 label 的組合下會 regression**：label 被撐大後 `justify-center` 失效、top 對齊基準跳變；但第一個 radio item 仍遵循 control 中線公式，兩者錯開無法對齊。

根因：inline 和 block control 是**不同的對齊語意模型**（control 中線 vs 第一個 item 第一行中線），必須分兩套策略。實作公式見 `field-wrapper.tsx`。

### 為什麼不用 JS 測量

- 兩套策略都是純 CSS，size / density / 字體切換時自動連動，不需 ResizeObserver
- 符合 CLAUDE.md「可推導的值用 `calc()` 或公式表達，不硬寫結果」原則
- 跨 Atlassian / Salesforce Lightning / Polaris 等世界級系統的共通做法

### 其他世界級系統的對照

| 系統 | 作法 |
|---|---|
| **Atlassian DSP** | 相同公式（`align-items: flex-start` + `padding-top`） |
| **Salesforce Lightning** | 相同（`slds-form-element__label` 有 `padding-top` 對齊） |
| **Polaris (Shopify)** | 類似（`align-items: baseline` + baseline 修正） |

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

block / inline 不是 consumer 決定的——是**元件本身的固有性質**(RadioGroup 永遠是 block,Input 永遠是 inline)。所以由 primitive 自己宣告,Field 自動偵測。

### Convention

block primitive 在自己的 `.tsx` 檔案掛一個 static 屬性:

```tsx
const RadioGroup = React.forwardRef(...)
RadioGroup.displayName = 'RadioGroup'
;(RadioGroup as unknown as { fieldLayout: 'block' }).fieldLayout = 'block'
```

Field 在 render 時讀第一個 control child 的 `type.fieldLayout`,沒宣告就視為 `'inline'`。**Consumer 完全無感**:

```tsx
<Field>
  <FieldLabel>性別</FieldLabel>
  <RadioGroup>...</RadioGroup>   {/* Field 自動切 block,不用傳任何 prop */}
</Field>
```

### 為什麼選這個機制(不是 Field 內部寫死白名單,也不是 consumer 傳 prop)

| 候選 | 缺點 |
|---|---|
| Consumer 每次傳 `<Field controlLayout="block">` | consumer 要記得;忘了就 layout 歪掉;非世界級設計系統的做法 |
| Field 內部寫死白名單 `['RadioGroup', 'CheckboxGroup', ...]` | Field 耦合一堆它不該知道的元件名稱;新增 block primitive 都要回來改 Field |
| **Primitive 自我宣告 `static fieldLayout`**(採用) | 元件對自己的性質負責;Field 零耦合;新增 block primitive 只要在自己檔案加一行 |

### 逃生艙

`Field` 有 `controlLayout?: 'inline' | 'block'` prop 覆寫自動偵測,只在兩種情況使用:

1. Consumer 把自己手寫的 JSX(`<div>` / 函式元件)當 control,系統無法偵測——強制 `block`
2. 想覆寫 primitive 預設(罕見)

### Block primitive 的第一行對齊責任(重要)

Field 的 block control area **不加額外 paddingTop**——信任 primitive 自己把第一行 content 推到正確位置。

**正確位置** = `(field-height - 1lh) / 2`(跟 label 在 horizontal 模式的 paddingTop 公式一致,兩邊第一行中線都落在 field-height/2)。

需要視覺對齊的 block primitive 自行保證第一行位置:
- **RadioGroup / CheckboxGroup**:子元件 SelectionItem 自帶 `py = calc((field-height - 1lh) / 2)`,第一個 item 的文字自然在正確位置 ✓
- **其他 block primitive**(FileDropzone / RichTextEditor 等):如果需要 label 第一行對齊,自己加對應 padding;如果不需要視覺對齊(例如填滿容器的 drop zone),不加即可

**為什麼 Field 不自己加 paddingTop?** 因為已有 py 的 primitive(RadioGroup)會 double padding。讓 primitive 自己負責更可靠——primitive 知道自己的內部結構,Field 不知道。

### 已宣告為 block 的 primitive

- `RadioGroup`(`components/RadioGroup/radio-group.tsx`)

未來新增 `CheckboxGroup` / `FileDropzone` / `RichTextEditor` / inline `DataTableField` 時,在元件檔案加一行 `;(X as any).fieldLayout = 'block'` 即可,Field 不需要任何修改。

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
