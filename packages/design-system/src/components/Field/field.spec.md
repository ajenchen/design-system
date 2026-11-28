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

> **Foundational SSOT rationale**(2026-04-25 approved;當時寫的「cap 800」只列在舊開場檔的例外清單,那份清單已不存在,`check_file_size_budget.sh` 的 case 表也從沒列過本檔 —— 行數上限以該表為準,本檔走一般 spec 那一檔):
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
| description | `<FieldDescription>` | 次要說明文字，fg-secondary;控件(Input / Textarea `showCount`)的字數計數畫在**這一行的右端**,沒有說明時這一行只有計數(user 2026-11-26 第五輪決策卡 C7 點選「A:放在說明那一行的右端(「12 / 100」);沒有說明時那一行只有計數」;規則住 `./field-controls.spec.md`「字數計數」) |
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

## 樣式規範（全部 codify 在 field.tsx 與同資料夾的 field.css〔只放閱讀情境的判斷〕，不依賴 consumer）

| 元素 | Token / 值 |
|---|---|
| FieldLabel（一般） | `text-body`（14px）/ `text-foreground`（neutral-9）;閱讀情境 `text-fg-secondary`(見「閱讀情境」) |
| FieldLabel（disabled） | `text-body` / `text-fg-disabled`（neutral-6） |
| FieldLabel 的 required `*` | `text-fg-muted`（neutral-7），**貼齊 label 文字無 gap**，disabled 時 `text-fg-disabled` |
| FieldDescription（一般） | `text-body`（14px）/ `text-fg-secondary`（neutral-8）;字數計數（同一行的右端）同字級同色 + `tabular-nums`、說明 ↔ 計數 `gap-x-3`（`./field-controls.spec.md`「字數計數」） |
| FieldDescription（disabled） | `text-body` / `text-fg-disabled` |
| FieldError | `text-body`（14px）/ `text-error-text` / `role="alert"` |
| Field 內部 gap（vertical） | `gap-1`（4px） |
| Field 內部 gap（horizontal，content 欄） | `gap-1`（4px） |
| Horizontal 模式 label 與 control 的 gap | `gap-x-3`（12px）;**固定 12、是 Field 自己的值,不隨密度與 size 變**(2026-11-25 定)。不借別的刻度:不用 `--field-px`(那顆是控件框裡的左右內距,`../../tokens/uiSize/uiSize.spec.md`「Field Horizontal Padding」;只是剛好也是 12,改它不該連帶改欄距);不用 `--layout-space-tight`(版面間距管元件與元件之間,標籤 ↔ 控件是 Field 一個元件裡面怎麼排 —— `../../tokens/layoutSpace/layoutSpace.spec.md`「親疏 3 級」表「同範疇 / bundled component family」列:元件 spec own、layout rule 跳過;同檔「規則 3」的「幾塊怎麼數」第 1 步:一個 Field 算一塊,元件裡面怎麼排是元件自己的事)。**出處**(M36):12 最早在 9917993e(2026-04-10)建立 Field 時寫入,當時沒有寫理由、也沒有 user 原話;2026-11-25 user 問(問句,逐字)「另外我好奇水平排的 label和control的間距到底要是 field-px, tight 還是固定的12px或是8px?怎樣比較符合我們ds一致的設計語言且不違背世界級的設計？當初定義12px的理由是？」,查證後 user 在決策卡選「固定 12 (Recommended)」(選項與建議是 AI 擬的);畫面不變(值本來就是 12)。**世界級**:Fluent 2(Fluent UI React v9 `Field`)水平排的標籤也是一個固定值、不跟密度走 —— 標籤的 `horizontal` 樣式寫 `marginRight: tokens.spacingHorizontalM,`(<https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-field/library/src/components/Field/useFieldStyles.styles.ts>),`spacingHorizontalM: spacings.m,`、`m: '12px',`(<https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/spacings.ts>);兩檔 2026-11-26 讀取 |
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

Horizontal 模式下 label 的欄寬由 `labelWidth` prop 控制(數字 = px;也收任何 CSS length 字串,比例寬如 `"30%"` 只能用字串),預設 `auto` 由 label 內容撐開。值直接寫進 grid 的第一欄(2026-11-15 前經元件內變數 `--field-label-width` 轉一手:它只在 Field 自己的元素上設與讀,名字開頭卻跟共用刻度 `--field-*` 同一族,看起來像全系統的值 —— 稽核 P20,畫面不變)。數字 = px 是全 DS 長度參數的同一條規則(`ds-canonical/references/props-naming.md`「尺寸參數」)。

**硬規則(2026-06-10 codify,user 確認)**:同一表單的多個 horizontal Field **必經 `FieldGroup labelWidth` 統一 label 寬**(單行 `labelWidth` 覆寫)——禁各自 `auto` 造成控件起點不對齊(錨例:field.principles 原違反自家 idiom,圖示控件參差)。機制詳 `./field-group.spec.md`「FieldGroup `labelWidth` cascade」段。

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

Field 透過 Context 暴露以下狀態給子元件（Primitive 可以透過 `useFieldContext()` 讀取）。**公開給產品的值**(2026-11-26,ws-upstream C29 / WS5-2):產品自己做的控件(DS 沒有的,例:接第三方富文字編輯器)放進 `<Field>` 時,改用根出口的 **`useFieldState()`**(不在 Field 裡回 `null`),只公開九個值 —— 下表的 `id`、`descriptionId`、`errorId`、`mode`、`disabled`、`required`、`invalid`、`size`,加上 `labelId`(`<FieldLabel>` 的 id);下表其他欄位與 `variant`、`surface` 是 DS 內部控件用的,不公開。自訂控件自己接 `aria-*`:`id` → `id`;不是原生表單元素(例 `role="textbox"` 的 div,`<label for>` 給不了它名字)時 `labelId` → `aria-labelledby`;`descriptionId` → `aria-describedby`;`required` → `aria-required`;`invalid` → `aria-invalid`,為 true 時再接 `errorId` → `aria-errormessage`(與 DS 自己的 Input 同一套接法)。不用 hook 也接得上:給 `<Field id="…">`,標籤 / 說明 / 錯誤的 id 固定是 `${id}-label` / `${id}-description` / `${id}-error`(`./field.tsx` `Field`)。完整寫法見範例 `./field.anatomy.stories.tsx`「自訂控件接上 Field」。**命名**(AGENTS.md「命名與語言一致性」3 重 test,三題都過才採用):① 既有 DS 詞彙 —— 本段標題就是「讀 Field 狀態」,同檔的 hook 都是 `useField` + 名詞(`useFieldContext` / `useFieldSurface` / `useFieldEmptyDisplay`);② 世界級 —— Base UI 的 Field 狀態型別 `type FieldRootState = {`(欄位含 `disabled` / `valid` / `focused`,<https://base-ui.com/react/components/field>);Adobe React Stately 的 `export interface NumberFieldState` 與 `export function useNumberFieldState(props: NumberFieldStateOptions): NumberFieldState {`(<https://raw.githubusercontent.com/adobe/react-spectrum/36f3adde26ccd12f3cc18c9d0293ece0f10e94c7/packages/react-stately/src/numberfield/useNumberFieldState.ts>),兩處 2026-11-27 讀取;③ 同字別義 —— DS 裡沒有別的 `FieldState` / `useFieldState`;`./use-form-validation.ts` 呼叫的 `getFieldState` 是表單引擎 react-hook-form 的方法(單一欄位的驗證狀態),不是 DS 的名字、也不出口。

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
| `registerControlError` | Control 把**自己驗出來的**錯誤說明交給 Field 的錯誤區畫(畫法同 `<FieldError>`);使用端的 `<FieldError>` 有字時以使用端為準、只出一行。2026-11-22 起,目前只有 LinkInput 用(`../LinkInput/link-input.spec.md`「錯誤說明」);沒有 control 宣告時 Field 畫面不變。`registerControlCount` / `countId` 同一種做法:Input / Textarea 開 `showCount` 時把字數交給 Field 畫在說明那一行的右端,`countId` = 計數那一格的 id(2026-11-26,`./field-controls.spec.md`「字數計數」) |

### Control 偏好尺寸（`fieldPreferredSize`）SSOT

Field 未收到顯式 `size` 時，依序取 **顯式 prop → control 宣告的 `fieldPreferredSize` → `md`**（`field.tsx` `detectPreferredSize`）。Control 以自身檔案的 static 宣告偏好（唯一現行宣告者 = InlineEdit `'sm'`，owner 句 `InlineEdit/inline-edit.spec.md`）。

**解析時序**：control 是 Field 的直接子元件時，Field 可同步讀取 static 偏好。wrapper 元件、`React.memo` 或 HOC 會遮蔽 static，但 control 會在掛載時透過 `useRegisterFieldPreferredSize` 補註冊：control 自身以 fallback 同步解析為偏好尺寸，Field 的控件槽高度則在註冊後跟上。Consumer 在 Field 或 control 顯式傳入的 `size` 永遠優先，不會被註冊覆寫。**繪製前登記與同組同高(2026-11-25)**:註冊用 layout effect,Field 的重繪在瀏覽器第一次畫之前完成(2026-11-25 前是 useEffect,先畫一格 md 32 再跳 sm 28)。在 FieldGroup 裡、自己沒寫 `size` 的 Field 再把控件偏好登記給範圍(最外層 FieldGroup),整組沒寫 `size` 的列共用範圍的偏好 —— 解析順序是 **Field 自己寫的 → 範圍的同組偏好 → 自己控件的偏好 → md**。規則與理由住下方「閱讀情境」效果第 3 條。

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

- **與 label 間距 `gap-1`(4px)**、InfoIcon **16px 固定**、色 `fg-muted` hover `fg-secondary`(`field.tsx:504-532`)
- **結構:ⓘ 不住在 `<label>` 裡**(2026-11-26,產品 canary 回報 C8 (b)):ⓘ 是 `<button>`,HTML 規定 `<label>` 不得含其他可被標籤的元素(WHATWG HTML「The label element」內容模型:https://html.spec.whatwg.org/multipage/forms.html#the-label-element);住在裡面時控件的讀屏名稱會把說明文字一起念進去。有 ⓘ 時外層改 `<span>` 帶同一組版面 class 與 `data-field-slot="label"`,`<label>`(id / for)只包星號 + 標籤文字,ⓘ 是它的兄弟(`field.tsx:464-474`、`field.tsx:504-515`)。外觀、間距、ⓘ 的滑過 / 聚焦行為不變;**點擊範圍也不變**:修前整個標籤列都是 `<label>`(直排時撐滿整列、橫排時是整個標籤欄),點文字右邊或文字與 ⓘ 之間的空白會交給控件 —— 拆開後外層把點在空白處的那一下轉成點 `<label>`,交給瀏覽器原生的 label 行為;點 `<label>` 本身照原生、點 ⓘ 是看說明,都不轉(`field.tsx:484-488`;範例 `field.stories.tsx`「標籤旁的說明圖示」的 play 逐一點 ⓘ / 空白 / 間隙 / 文字,量焦點與控件收到幾次 click —— 一下只交給控件一次,勾選類控件不會一下切兩次)。沒有 ⓘ 時仍是單一 `<label>`
- **游標一般箭頭**(`cursor-default`,`field.tsx:525`):ⓘ 點下去不做事(Radix Tooltip 點擊只會收起說明),手形會讓人以為點了有作用。全域 `base.css` 讓所有 `<button>` 預設手形,所以要明寫 `cursor-default`,只刪 `cursor-pointer` 蓋不掉。〔2026-09-26 由手形改箭頭;user 條件式同意「I 可以從手形改掉，若改掉更合理的話」,AI 研究後提出、user 選「同意,照清單寫入」〕
- **disabled 時整顆不渲染**(`field.tsx:471`)— info 是滑過／聚焦才浮出的補充說明,非類型身份 indicator,non-editable 隱藏
- 設計定位:**給資訊的觸發處**(`ds-canonical/references/hit-area-canonical.md` 三-1),**不是**行內動作 —— 只借行內動作「顏色退後、滑過深一階」的長相,不套 `inline-action.spec.md` 的「必須手形」(那條給清除、顯示密碼這類按下去會做事的鈕)。label 的主要互動是 input,info 是輔助。**FieldLabel 以外要放 ⓘ**(設定列標題、區塊標題旁):**不另做公開的說明圖示元件**,在那裡既有的圖示槽位把圖示換成 info 圖示,掛 `Tooltip` 讓它滑過就出說明。前提:**觸發處必須是可聚焦的按鈕**(本段的 ⓘ 就是一顆 `<button type="button">`),不能只放一顆圖示 —— `../Tooltip/tooltip.spec.md`「A11y 預設」寫明「Tab — focus trigger 時顯示」、鍵盤完整可操作(無需滑鼠),走不到焦點的圖示用鍵盤永遠打不開說明;長相與游標照本段前三點與 hit-area-canonical 三-1(不上滑過底色、一般箭頭)【AI 推導:前提與長相兩句是 AI 依這兩處既有規則補上的】。出處:user 2026-11-26 第五輪決策卡 C8 留言(逐字,問句):「不用特別抽出來吧？可以放 icon的地方都有 slot, 然後想要放info的地方就把 icon變成info icon再使其hover會有 tooltip就可以了吧？」
- 範例:`field.stories.tsx`「標籤旁的說明圖示」

---

## 驗證與 aria 屬性

- `invalid` 透過 context 讓 Control 顯示 error 邊框、自動 `aria-invalid`
- `errorId` 讓 Control 自動 `aria-errormessage`
- `descriptionId` 讓 Control 自動 `aria-describedby`;開了字數計數時再接 `countId`(說明在前、計數在後;`./field-controls.spec.md`「字數計數」)
- `<FieldError>` 自帶 `role="alert"` 並有 id = `errorId`
- 無 children 的 `<FieldError>` 不渲染，不佔位
- 控件自己驗出來的錯誤(目前只有 LinkInput 的網址格式)經 `registerControlError` 由 Field 畫在同一個錯誤區、同一個 `errorId`;使用端的 `<FieldError>` 有字時只畫使用端那行(一個欄位只有一行錯誤)

### 產品自己寫的控件怎麼接 aria-*(2026-11-26)

上面的「自動」只發生在 DS 控件身上:它們從 `field-context.ts` 讀 `useFieldContext()`,那支是 DS 內部用的,套件沒有匯出(`field.tsx:51-52`;`index.ts` 只匯出 `field` 與 `field-types`)。產品放進 Field 的自訂控件(自己畫的滑桿、評分條、色票格)要讀 Field 的狀態(四個 id、invalid / required / disabled / mode / size)時,用根出口公開的 `useFieldState()`,API 只住在上方「FieldContext」段(本檔 :211);不用 hook 時照下面手動接,不必讀 context:

1. **給 Field 一個 `id`**。Field 由它推出其餘三個 id,規則固定(`field.tsx:212-215`):標籤 `${id}-label`、說明 `${id}-description`、錯誤 `${id}-error`;`<FieldDescription>` / `<FieldError>` 沒傳 `id` 時就用這兩個(`field.tsx:552`、`:584`),傳了 `id` 則以傳入的為準。
2. **控件自己掛 aria-***:`id={id}`、`aria-labelledby="${id}-label"`(`<label for>` 只標得到原生可被標籤的元素,`role="slider"` 這類自訂元素要靠 `aria-labelledby`)、有說明時 `aria-describedby="${id}-description"`、有錯誤時 `aria-errormessage="${id}-error"` + `aria-invalid="true"`;`required` 時掛 `aria-required="true"`。沒有說明 / 錯誤時不要掛指向不存在元素的 id。
3. **錯誤狀態跟同一個 `invalid` 走**:`<Field invalid>` 決定 FieldError 是否該出現,控件的 `aria-invalid` 用同一個值,兩者不會各說各話。

---

## FieldGroup → `field-group.spec.md`(2026-11-27 抽出)

「FieldGroup — 多 Field 垂直堆疊」(欄位垂直間距 = `--layout-space-loose`、`gap` 檔位退役紀錄)與「FieldGroup `labelWidth` cascade」整段住在 `./field-group.spec.md`;本檔只留這個指標。

---

## 閱讀情境(2026-11-25;本段是唯一住所,其他規格只指過來)

**什麼時候算**:一個**範圍**(最外層 `FieldGroup`;不在組裡的 `Field` 就是它自己;巢狀時 labelWidth 照舊最近一層覆寫,範圍不是)裡有就地編輯(`InlineEdit`,含 `editable={false}` 鎖定的值)= 閱讀情境 —— 這組值大部分時間是被讀的(`../InlineEdit/inline-edit.spec.md`「何時用」)。Field 層純顯示 `<Field mode="view">` 也算,但只動標籤色(下方「效果」①;②③ 只看就地編輯,見「不變與邊界」)。沒有就地編輯、也沒有 Field 層純顯示 = 一般表單,畫面與 2026-11-25 前逐像素相同。**版面模型不變**:水平排 = 標籤欄(同組等寬,上方「硬規則」)+ 12(「樣式規範」表 `gap-x-3`)+ 控件框 —— DS 既有的兩條規則(user 2026-11-25 留言問「我上面講的是否是我們ds定義的？」,查證屬實)。看得見的值都落在同一條線:水平排 = 框內字線(`--field-bleed` = 框寬 + `--field-px` = 13,`../../tokens/uiSize/uiSize.spec.md`「Field 外框寬與框內字線」),垂直排 = 標籤左緣。

| 東西 | 水平排(標籤在左) | 垂直排(標籤在上) |
|---|---|---|
| 就地編輯的框(靜止透明框 / 滑過底色 / 編輯中的輸入框) | 跟一般輸入框同位置、同寬,不外伸;離標籤欄 12 | 左右各外伸 `--field-bleed`;標籤下緣 ↔ 框上緣 4(`gap-1`) |
| 框裡的字 / Tag / 頭像 | 框內 13 = 框內字線 | 標籤左緣 |
| 沒有框的值(開關、單一勾選框;CheckboxGroup 選項不算) | 往右內縮 `--field-bleed` 到框內字線 | 不動(本來就在標籤左緣) |

- **效果**:① 標籤色 = `fg-secondary`,停用仍 `fg-disabled`(M24)—— 與 DescriptionList dt、DataTable 表頭同色,同色清單住 `../../tokens/color/color.spec.md` `text-fg-secondary` 用途列;理由同那兩處:標籤是結構不是資訊本體(`../DataTable/data-table.spec.md`「Header 文字弱化」),一般表單的標籤仍是 `foreground`。**同一個範圍只用一個標籤色**(2026-11-26 user 決定,原話見下方「出處」):範圍裡混放一般輸入框(Input / Select / DatePicker 等)與就地編輯 → 整個範圍算閱讀情境,一般輸入框那一列的標籤也是 `fg-secondary`,不逐列換色(閘 `scripts/reading-context-invariant.mjs` SC:N2);純顯示同一條 —— 組裡有 Field 層純顯示、混放一般輸入框 → 整組 `fg-secondary`(同閘 G3-V 組)。理由:次要色看的是這一塊在做什麼(大部分時間被閱讀),不是每一列的控件長怎樣 —— 標籤是結構不是資訊本體(同上);有就地編輯的組就是閱讀區塊、不是表單(`../InlineEdit/inline-edit.spec.md`「何時不用」:表單欄位直接用 Field + 控件、多欄位一次編輯用表單),混進來的輸入框是放在閱讀區塊裡。世界級同一塊的標籤都只有一種顏色、不依那一列是不是輸入框換色:Atlassian InlineEdit 檢視與編輯都用表單同一顆 Field 的 Label(`color.text.subtle`,<https://raw.githubusercontent.com/pioug/atlassian-frontend-mirror/master/design-system/inline-edit/src/inline-edit.tsx>、<https://raw.githubusercontent.com/pioug/atlassian-frontend-mirror/master/design-system/form/src/label.tsx>);Salesforce 表單標籤只有一個顏色 `$color-text-label`,檢視型與就地編輯型都不換(<https://raw.githubusercontent.com/salesforce-ux/design-system/master/ui/components/form-element/base/_index.scss>);Ant ProDescriptions 一項設成一直是輸入框(`mode='edit'`)時,標籤仍是描述清單的弱化色(<https://raw.githubusercontent.com/ant-design/pro-components/master/src/descriptions/schemaToDescriptionsItem.tsx>、<https://raw.githubusercontent.com/ant-design/ant-design/master/components/descriptions/style/index.ts>)。整組都是輸入框(一般表單;整組按「編輯」變成表單之後)= 範圍裡沒有就地編輯也沒有純顯示 → 標籤仍是 `foreground`(照上方「什麼時候算」)。② 沒有框的值對齊框內字線(上表;只看就地編輯 —— 純顯示的組沒有框,值與開關 / 勾選框的 ✓ 都在控件欄左緣,`./field-controls.spec.md`「軸一 view mode」)。其他沒有框的值(RadioGroup / CheckboxGroup / Rating 等)目前全 DS 0 用法;出現時照本段開頭的根規則「看得見的值都落在同一條線」(上方「什麼時候算」末句),在上表加一列、不另立對齊規則;加列前依 M8「跨類別外推本身就是新主張」重新核對該元件怎麼套(例如整組內縮或逐項對齊)【AI 推導 2026-11-26,出處見下方「出處」】。③ **同組同高**:範圍裡有控件宣告偏好尺寸(目前只有 InlineEdit 的 `sm`)→ 整組沒寫 `size` 的列都用它(開關那列 32 → 28),自己寫了 `size` 永遠優先;依據 `../../tokens/uiSize/uiSize.spec.md` 不傳 size 自動對齊 + InlineEdit「Field 的預設 `md` 是『沒人決定過』的預設值,不得壓過本元件宣告的 `sm`」;偏好不同取最小【AI 推導 2026-11-25:同組只能一個高度、結果不能看掛載先後;今天只有一種偏好】;繪製前登記(上方「Control 偏好尺寸」),伺服器端渲染第一格仍可能是 md;FieldGroup **不新增**公開 `size`。
- **不變與邊界**:進編輯後同範圍的標籤色、開關位置、列高都不變(記號同時掛在就地編輯的靜止外框與編輯容器)。垂直排的框外伸進容器內距 → **容器左右內距 ≥ `--field-bleed`**(詳情面板 / 卡片的 16 夠;12 的表格格子會凸 1px,規格本來就不在格子裡放 InlineEdit)。已知行為(0 用法、未定義):閱讀情境的 FieldDescription 與標籤同色同字級。同範圍混放一般輸入框與就地編輯 → 已定,見上方「效果」①「同一個範圍只用一個標籤色」。**Field 層純顯示 `<Field mode="view">`**(2026-11-26 實作)—— 用途 = 整組按「編輯」才變表單的區塊平常的樣子(唯讀清單仍用 DescriptionList,下方「何時不用」);它**也觸發閱讀情境**,標籤 `fg-secondary`,理由與就地編輯相同(標籤是結構不是資訊本體)。不在組裡的純顯示 Field 範圍是它自己;組裡有一列純顯示 → 整組同一個標籤色(混放一般輸入框也是,同上方「效果」①)。**只動標籤色**:沒有框的值不內縮、同組同高不跟 —— 純顯示的值本來就齊控件欄左緣(`./field-controls.spec.md`「軸一 view mode」,user 2026-10-21 C1 甲)、純顯示不宣告偏好尺寸【AI 推導 2026-11-26:內縮會把開關 / 勾選框的 ✓ 推離純顯示那條線】。整組按「編輯」切成表單之後每一列都是 `mode="edit"`,範圍裡沒有純顯示 → 標籤回到 `foreground`;表單裡不能改的欄位照 `./field-controls.spec.md` 開頭「每個元件統一以 `mode` prop 切換樣態」第 1 點用 `readonly`(表單三態),不用 `view`,所以不會把整張表單變成閱讀情境。依據:LABEL-COLOR —— 採納的 AI 建議範圍含純顯示(決策總帳該列結論「閱讀情境(純顯示 / 就地編輯及其 FieldGroup)標籤 = fg-secondary」),user 2026-11-25 附條件採納「確保可以確保SSOT且不違背世界級的設計就照你建議，然後我把我其他的問題留在成品內了，你再仔細看一下」;FIELD-VIEW —— user 2026-11-25 點選「甲：欄位純顯示 (Recommended)」(決策總帳同列記「閱讀情境觸發要加入 Field 層 view」);VIEW-LABEL —— user 2026-11-26 對話中問(問句;第二輪決策卡引用此句)「我順便再確認一件事，純檢視的 field, label會跟就地編輯一樣都會變得比較淡？因為兩者要淡化的理由應該都是一樣的？」,看過 AI 說明(「是,理由一樣」)後點選「了解,照這樣做」(2026-11-26 決策卡)。(2026-11-06 起刻意不寫用途,commit 8eb473c7「缺口 2 的用途不寫進規格」;2026-11-25 由 FIELD-VIEW 定案。)**檢視態的按鈕**(2026-11-26):Field 層純顯示裡當控件的按鈕(下方「Button 作為 control 的判斷標準」)照同一條「值的第一個可見元素齊控件左緣 = 標籤左緣」(`./field-controls.spec.md`「軸一 view mode」,user 2026-10-21 C1 甲),不另立規則 —— 按鈕「看得見的邊界」看它有沒有框:**有框的**(`primary` / `secondary` / `tertiary`,靜止就畫得出底色或框)看得見的是框 → 框齊控件欄左緣,本來就成立、不動;**沒有框的**(`text` / `link`,靜止只看得到字與圖示)看得見的是字 / 圖示 → 收掉左右內距、左右框寬、最小寬與標籤字兩端的 `px-1`,字 / 圖示齊控件欄左緣。導覽類(打開網址、前往另一頁)優先不放按鈕,改用 `<LinkInput mode="view">` 的文字連結(預設是裸 anchor、本來就齊左,`./field-controls.spec.md`「View — 值呈現」的「LinkInput / PeoplePicker 預設 view 路徑不包 wrapper」)。收完之後按鈕盒 = 內容那一塊(高仍是欄位高),滑過換色 / 底色與命中區都是這一塊(`ds-canonical/references/hit-area-canonical.md` 一-1、一-4);焦點框照全站預設畫在盒外、不跟著收(`../../styles/base.css` `:focus-visible:not([data-pointer-focus])` 那條:框寬 2 + 間隙 `--stack-gap` 2,Button 沒有改寫),標籤在左時框外緣離標籤欄還有 12 − 4 = 8、不壓進標籤欄;`text` 的滑過底色因此貼著字與圖示、不往外伸【AI 推導 2026-11-26:往外伸在標籤在左時會壓進標籤欄距 12,違反下方「出處」user 2026-11-25 要的「標籤跟輸入框……不會交錯」】。只有圖示的按鈕不在這一條【AI 推導 2026-11-26:正方形盒裡圖示置中,收內距移不動圖示;目前 0 用法,出現時照本段開頭的根規則加列、加列前依 M8 重新核對】。判斷看這一個 Field 自己,不看範圍:同一組裡一般表單那一列的按鈕不收;只認控件槽的直接子元素,控件裡面自帶的按鈕(LinkInput 的編輯鉛筆)不算。出處:user 2026-11-26 第五輪決策卡 C9 留言(逐字)「為何不是直接像 link input 一樣放文字連結？如果真的要放按鈕才去確保視覺對齊，但是按鈕又分有框和沒框，所以我不確定邏輯是否複雜，但視覺的原則就是很一致吧？反正就是可見元素的邊界要看起來對齊」(含問句;原則採這句最後一句);「有框看框、沒框看字」的分法與收法(收內距、不外伸)= AI 依這句推導。
- **機制**:React 只掛記號 —— `data-field-scope`(最外層 FieldGroup 的根 / 不在組裡的 Field 的根)、`data-field-reading`(InlineEdit 兩個根,含 `editable={false}`)、`data-field-frameless-value`(開關、單一勾選框在 Field 裡,`field-context.ts` `fieldFramelessValueProps`);Field 層純顯示不另掛記號,用 Field 根本來就有的 `data-field-mode="view"` + `data-field-orientation`(控件外框也掛 `data-field-mode`,多認 `data-field-orientation` 才只認 Field 層,同 `../../lib/pointer-focus-guard.ts` 的區分)。判斷只住 `./field.css`(由 `styles/tokens.css` 匯入):就地編輯 `[data-field-scope]:has([data-field-reading])`(標籤、沒有框的值兩條都用);純顯示只寫在標籤那一條 —— 組裡 `[data-field-scope]:has([data-field-orientation][data-field-mode="view"])`、不在組裡 `[data-field-scope][data-field-mode="view"]`(`:has()` 不含自己);兩顆元件內變數(標籤色、沒有框的值的內縮)**設在讀它的元素自己身上**(標籤 / 沒有框的值),不設在範圍元素上,`field.tsx` 只讀 —— `var()` 在宣告它的元素上就代換,設在範圍元素上的話,組裡再套一層 `data-theme` 時標籤拿到的是範圍那一層主題的顏色(2026-11-25 規格核對實測:深色列裡一般表單的標籤是黑字;同一個理由見 `../../tokens/color/semantic.css`「Nested Theme 架構」)。表單不設值,後備 `foreground` / 0 一樣在讀者身上代換,所以「一般表單逐像素相同」在主題套層時也成立。深層 `:has()`,包 wrapper / memo / HOC 照樣成立;不支援 `:has()` 的瀏覽器停在表單樣子。檢視態的按鈕另一條:Button 在 Field 裡、沒有框且不是只有圖示時掛 `data-field-frameless-action`(`field-context.ts` `fieldFramelessActionProps`;標籤字的 span 掛 `data-button-label`),`./field.css` 以 `[data-field-orientation][data-field-mode="view"] [data-field-slot="control"] > [data-field-frameless-action]` 判斷,直接寫 0(與主題 / 密度無關,不經元件內變數;該檔不在任何 `@layer`,蓋得過 Button 在 utilities 層的內距、最小寬與框寬)。
- **閘**:`scripts/reading-context-invariant.mjs`(CI)—— 值線、標籤 ↔ 框、三者同色、一般表單不變(含組裡某一列再套一層主題時,閱讀與表單的標籤色都跟著那一層)、編輯中不翻轉、同組同高(含晚一個計時器才到的對照組)、第一次繪製、token 公式與框寬、範圍 = 最外層(巢狀 N2)、容器內距不足、欄位家族不寫裸 `border`、純顯示的標籤(不在組裡 42 格淺 / 深、組裡混放輸入框整組同色 VG;判斷只寫在標籤那條,G3-V / S3)、檢視態的按鈕(G1-V 的 button-link / button-text / button-framed 兩種標籤位置:沒有框的字 / 圖示齊控件欄左緣且按鈕左右緣 = 內容、有框的框齊左且框與內距還在;記號同名與判斷只看 Field 自己,S2 / S3);夾具 = `field.stories.tsx` 三則 test-only「閱讀情境:工作項目與行事曆事件詳情」(真實情境,也是前後對照圖的來源)、「閱讀情境驗證」(邊界)與「純顯示齊標籤驗證」。一般表單另有像素基準圖:精選場景 `field-mixed-control-alignment`(淺 / 深,`scripts/visual-assertions.json`),只在釘死的容器裡比(視覺回歸 workflow;不是 PR 必過檢查)。
- **出處**(M36):水平排可見的值齊左、標籤與框不交錯 = user 需求(2026-11-25:「你先不要關我說了什麼，但我要的結果就是水平排的時候，可見的視覺元素的值應該要按規格齊左，合理吧？然後要確保標籤跟輸入框至少有一定的間距不會交錯在一起，然後上述合理的話，再基於此去想最SSOT乾淨且好維護好擴充的解法吧？」);開關對齊不論方向都要成立、要寫進 SSOT = user 需求(2026-11-25:「我覺得可以改成垂直，但是開關對齊的問題無論什麼排列方式都要解決根本問題吧？都要確保是能夠對齊的吧？要確保 ssot 吧？」);閱讀情境標籤 = fg-secondary = AI 建議、user 附條件採納(2026-11-25:「確保可以確保SSOT且不違背世界級的設計就照你建議」);標籤欄 + 12 + 控件框、垂直排字齊標籤(`../InlineEdit/inline-edit.spec.md`「對齊盒」)= DS 既有規則;就地編輯尺寸 sm = user 決定(同檔尺寸兩段);範圍 = 最外層組、內縮與同組同高只看就地編輯(純顯示只動標籤色,見「不變與邊界」)、沒有框的值對齊框內字線、同組同高的解析順序與衝突規則、記號與 `field.css` 機制 = AI 推導 / 工程判斷(本段)。同一個範圍只用一個標籤色(混放一般輸入框也算閱讀情境)= user 決定:2026-11-26 決策卡第一輪留言「我覺得若真的要有輸入框，感覺 label 應該還是要按照原本的顏色？查證一下」(問句),查證後第二輪 user 點選「甲:同一組只用一個顏色(維持現況,把「未定義」寫成正式規則)」(2026-11-26 決策卡;選項與建議是 AI 擬的);整組都是輸入框時仍是 `foreground` = 照「什麼時候算」。其他沒有框的值出現時照根規則、加列前重新核對 = AI 推導:user 2026-11-26 決策卡留言(問句)「現在應該沒有這種吧？等到真的有也是要按照一致的視覺設計原則吧？」,看過 AI 說明後點選「了解,照這樣做」(2026-11-26 決策卡)。

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
| ✅ Picker opener(開對話框選 value) | ❌ 「重設此欄位」(欄位的次要 action:放到標籤行右端,見上方「Field 次要 action 的預留位置」;不是 control。2026-11-26 前這格寫「可放到 endAction 或 description 旁」,與該段「唯一預留位置 = label 行最右端」「禁止把次要 action 放在 control 下方」矛盾,已改;`<FieldLabelAction>` 還沒實作,狀態見該段) |
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
- **多欄位垂直堆疊**：搭配 `FieldGroup` 統一管理欄位垂直間距（單一值 `--layout-space-loose`，隨 density 縮放；無 per-instance 選檔，見 `./field-group.spec.md`「欄位垂直間距」段）

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

對應 anatomy story:`Overview` + `Inspector`(元件檢閱器——切 orientation / size / mode / required / invalid 即時 render)+ `OrientationMatrix` + `SizeMatrix` + `StateBehavior` + `ColorMatrix` + 元件特有 `FieldGroupBehavior`、`CustomControlWiring`(自訂控件接上 Field,見「FieldContext」段「公開給產品的值」)+ `Accessibility`。

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
| **L4 Display hover** | `field-wrapper.tsx` `nakedCellEditableDisplayHover` | **意思 = 「這格可以編輯」**:跟著能不能編輯走,不跟點下去做什麼走 —— DataTable 有連結的可編輯網址格點了開連結,照樣出;不能編輯的格不出(2026-11-10 user「表格跟輸入框難道不應該是類似的邏輯嗎？hover連結表格難道不應該出現更深顏色的框嗎？然後同時在非筆的地方都是會開啟最常用的功能（開啟連結）？這樣做有什麼問題？這樣不是跟輸入框一致？」(問句,逐字全文;同一句也引在 `../../../ds-canonical/references/hit-area-canonical.md` 五「網址框」例),同編輯態 Field 外框滑過變深;`../DataTable/data-table.spec.md`「Navigate-valued cell 通用類別」第 1 條)。例外:值本身就是控件的格(boolean 勾選框)不出框,由勾選框自己表達【AI 補記現行行為,不另問:現行程式 `../DataTable/data-table.tsx` `cellShowsEditableHover` 排除 `boolean`,畫面與行為不變】。editable cell view mode `outline-1 outline-offset:-1 outline-[var(--table-cell-hover-outline-color,var(--border-hover))]`(cell wrapper outline;2026-05-10 Slice D:spreadsheet overlay 啟用時 DataTable cell host 把它設成 transparent 抑制 outline、讓 overlay layer 接管 hover ring paint,fallback 即 `--border-hover` 既有行為不變。這顆是 DataTable 的值,說明住 `../DataTable/data-table.spec.md`「儲存格滑過外框色」;2026-11-15 前叫 `--cell-hover-outline-color`)。**v15.13 design intent(user-accepted 2026-05-07)**:hover ring 蓋 cell.borderRight。**known asymmetry**(2026-05-09 user 重抓):只 **right** 邊 outline 跟 cell own border-r 同位置覆蓋成 1 條;top/left/bottom 邊 outline 在 cell.outer 內 1px,grid lines(前 row border-b / 前 cell border-r / row 自己 border-b 在 cell.outer 外 1px)露出 → 視覺 4 邊不對稱。**Pending design decision**(等 user 拍板才 ship):4 邊都蓋(spec 1 selection-style)vs 4 邊都不蓋(spec 2 inset 1px)vs 維持現狀。三層 SSOT:state source = cell wrapper / paint owner = 混合(hover=cell / edit=Field)/ grid divider = DataTable own |
| **L5 Position(v14,2026-05-06 revert v12)** | naked compoundVariant flow | Field 留 layout flow,**不**用 `!absolute`(v12 absolute 跟 DataTable 自動行高 `rowHeight="hug"` 不相容)。視覺接受 cell `border-r grid` + Field border 2px 雙線;cell border-r divider 永遠保留(對齊 L4 Invariant divider-owner / editor-owner 分離)|
| **L6 Cell trigger indicator(v16,2026-07-08 user 拍板 A 案〔UD-J24〕)** | naked-view branch + `showDisplayEndIcon?: boolean` opt-in(**default off,production 不再傳**)| **view 態零恆顯型別 icon** — editable affordance 統一 = L4 hover outline。Benchmark(Ant editable-cells 純文字+hover border [table/demo/edit-cell.tsx#L11-L23](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/table/demo/edit-cell.tsx#L11-L23) / MUI X singleSelect view 純文字 https://mui.com/x/react-data-grid/editing/ / AG Grid 無內建 indicator https://www.ag-grid.com/react-data-grid/cell-editing/ / Atlaskit v2.0.0 移除 hover-pencil 後 9 版未回歸 https://github.com/pioug/atlassian-frontend-mirror/tree/main/design-system/inline-edit )view 態皆無恆顯 icon;唯一反例 Google Sheets Chip/Arrow 為 spreadsheet 域可選檔位(「Display Style」可選 Chip / Arrow / Plain text,[Google 說明](https://support.google.com/docs/answer/186103?hl=en))。prop 保留為 spreadsheet-flavored 消費端 opt-in 逃生門:傳 true → `<ItemSuffix>` 渲型別 icon(Select/Combobox/PeoplePicker → ChevronDown / DatePicker → Calendar / TimePicker → Clock / **LinkInput 例外 = wrapper 無型別 icon;可編輯時另有 `viewEditAction` 畫的編輯入口**(Button text xs 鉛筆,滑過 / 鍵盤焦點才出現,是 action 不是型別 icon;inline-action 實例表「檢視態滑過才出現的動作」)。cell-registry 現況:6 picker 站不傳;url 站傳 `isEditable === true`(取 wrapper chrome 對齊 edit Input),可編輯時再傳 `viewEditAction`(鉛筆由 LinkInput 自己畫,表格只給出現時機)。edit 態 chevron 照舊(edit-trigger 通道,不受此 prop 管)。**值內容 vs affordance 分層(2026-07-08 user Q2 拍板)**:值內容(`selectedItemRenderer` 輸出 / avatar / type icon 等語意呈現)歸 value renderer,view 態照常渲染,恆顯**不**違反本條;本條管的是 affordance(chevron / pencil / outline)。前身 v15 恆顯制(2026-05-10/06-26 拍板)由本輪 benchmark 重判推翻。詳 `governance/planning/cell-indicator-ssot-rfc.md`(六家實查 SSOT)。|

**前身 retire**:v4-v8 `outline-2` 平行 state(已下沉 L3)/ v9 border-only(focus 跟 open specificity tie)/ per-control `open && 'border-primary'`(v13.3 retire)/ 開著 = 滑過的灰框 `data-[state=open]:border-border-hover`(2026-11-12 retire;現行 = 開著維持聚焦的框、認 `data-field-open`,見上方 SSOT)/ `nakedCell{Hover,Focus,Open}Ring` 三 const / `nakedCell{Prefix,Suffix}Slot`(下沉 L1)/ **v12 `!absolute -inset-px` seamless grid**(2026-05-06 revert — 跟 DataTable 自動行高 `rowHeight="hug"` 不相容)/ **DataTable parallel `getEditIndicator`**(2026-05-09 D-path retire — 由 Field naked-display 透過 `showDisplayEndIcon` opt-in 自渲 ItemSuffix,跨元件 SSOT 統一)。

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

- `agent-decision-card.spec.md`
- `calendar-decision-ledger.spec.md`
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
- `uiSize.spec.md`
