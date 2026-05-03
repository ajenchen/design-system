---
component: Rating
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isMatrixHeavy
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# Rating 設計原則

## 定位

Rating 是**離散 1–5 分評分元件**——使用者對商品、服務、體驗給出 1 到 max（預設 5）分的星等，或將已提交的平均分數唯讀展示。

**實作基礎**：自建，無 shadcn 核心或 Radix primitive 對應（shadcn 不提供 Rating，Ant Design `<Rate>` / Material `<Rating>` 為世界級對照）。內部以 lucide-react `Star` 為預設 icon，外層 `role="slider"` / `role="img"` 依 `readOnly` 切換。

**Layout Family**:非 4-Family Model —— **self-contained primitive**(獨立視覺,無 slot 結構,類似 Switch / Checkbox / Badge / CircularProgress)。

---

## 何時用

- **送出評分**（interactive）：Yelp / Google Reviews / Amazon 購物完後「幫這次服務評分」的送出前狀態
- **展示評分**（readOnly）：商品列表的星等 `4.7 ★★★★★`、評論列表每則評論的作者星等、Airbnb 房源總分
- **後台商品管理**：店家自己給商品的推薦星等（interactive）
- **精度展示**：平均分 `4.7`（`precision="half"` 顯示半星），單筆 `5`（`precision="full"` 整星）

## 何時不用

| 情境 | 改用 | 原因 |
|------|------|------|
| 純資訊標記（「熱門」「Beta」「新品」）| `Badge` | Rating 是量化 1–5 分，不是分類標籤 |
| 非 1–5 的連續數值（音量、亮度、價格範圍）| `Slider` | Rating 是離散 tier，Slider 是連續值 |
| 二元喜歡 / 不喜歡（thumbs up/down、like）| `Switch` 或自組 icon button | Like 是 binary，Rating 是 graded 1–5 |
| 多維度評比（服務 / 品質 / 速度 各 5 分）| 自組多個 Rating 縱向排列 | 單一 Rating 只表達單一維度 |
| 進度顯示(任務完成度、上傳進度) | `ProgressBar`(linear)/ `CircularProgress`(circular,有 value) | Rating 不是進度指標,別誤用星星做「完成 4/5 步」|
| 已提交固定分數但可跳轉「看詳情」| readOnly Rating + 旁邊 Button/Link | Rating 本身不點擊跳頁 |

---

## Props

| Prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `value` | `number` | — | 當前評分（controlled，0 ~ `max`） |
| `defaultValue` | `number` | `0` | uncontrolled 預設值 |
| `onChange` | `(value: number) => void` | — | 評分改變 callback |
| `max` | `number` | `5` | 滿分星數（世界級慣例 = 5，超過 7 會讓使用者無法快速掃視） |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'md'` | 尺寸。standalone 展示建議 `xs`(24px,對齊 Avatar/Tag sm);Field 內跟 Field size 傳 sm/md/lg |
| `precision` | `'full' \| 'half'` | `'full'` | 整星 or 半星 |
| `readOnly` | `boolean` | `false` | 唯讀展示（不響應 hover / click / 鍵盤） |
| `disabled` | `boolean` | `false` | 完全停用 |
| `icon` | `LucideIcon` | `Star` | 自訂 icon（極少用；禁止換成 Heart / ThumbsUp，見禁止事項） |
| `aria-label` | `string` | — | `readOnly` 時必填（例：「平均評分 4.7 星，共 5 星」） |

---

## Size

| Size | Container 高度 | Star icon | 使用情境 | 配對 field |
|------|---------------|-----------|---------|-----------|
| `xs` | **24px**(`h-field-xs`) | 20px | **Standalone 建議值**:商品卡、評論列表旁、搜尋結果 row 的星等展示(非 Field 內時) | — |
| `sm` | 28px(`h-field-sm`) | 20px | Field sm 並排 | field sm |
| `md` | 32px(`h-field-md`) | 24px | **Field 預設**。一般表單評分欄位 | field md |
| `lg` | 36px(`h-field-lg`) | 24px | 送出評分的 review form、強調的主 CTA 區塊 | field lg |

### Standalone vs Field 尺寸選擇(canonical)

- **Standalone 展示**(非 Field 內):用 **`xs`**(container 24 / icon 20)——對齊 Avatar sm 20px / Tag sm;Airbnb / Yelp 商品卡星星亦此大小
- **Field 內**(`<Field>` 表單內當 control):跟 Field size 對應傳 sm/md/lg(Field 預設 md)
- 世界級對照:Material Rating standalone ≈ 24dp;Ant Rate 在 Form 內跟 Form itemSize。兩種 context 分開設計,不強求單一預設

### Icon 尺寸對齊 **Avatar inline**,不對齊 icon tier(2026-04-21 AR48 canonical)

Rating 的 **container 高度消費 `--field-height-*` token**(sm=28 / md=32 / lg=36),讓它可以與 Input / Select / NumberInput / Button 等 field-height family 元件並排時 row-align 一致。

**Star icon 大小對齊 `item-anatomy` 的 inline Avatar 尺寸**(sm=20 / md=24 / lg=24),**不走 icon tier**(16/16/20)。

| Size | Rating star | Avatar inline | Icon tier | 使用者選到 |
|------|-------------|---------------|-----------|-----------|
| sm | **20px** ← Avatar | 20px | 16px | Avatar(更重視覺) |
| md | **24px** ← Avatar | 24px | 16px | Avatar |
| lg | **24px** ← Avatar | 24px | 20px | Avatar |

**為什麼對齊 Avatar 不對齊 icon tier**:

1. **視覺份量**:Rating 的「一顆星」是 **filled shape**(整個 icon 面積都是重量),不像純 outline icon 靠 stroke。跟 filled identity 元件(Avatar)同尺寸才能在 row 裡 visual weight 對齊。
2. **語意**:Rating 是「主要資料視覺」(一顆星 = 一個資料點),不是次要 affordance。次要 affordance(如 Input 的 startIcon、Button iconOnly)才走 icon tier(16/16/20)。
3. **世界級對照**:Ant Rate in Form = 20px(對齊 Form avatar-like components);Material MUI Rating default 24px;Airbnb 商品卡星星 24px。皆走 identity 重量,不走 icon tier。
4. **歷史錯誤**:早期設 16/16/20 跟 icon tier 齊,但視覺上跟 inline avatar / tag 並排時星星顯得比 avatar「小一號」,失去「這一顆星是資料點」的語感——AR48 修正。

### 放入 Field 的可組合性

Rating 可直接塞進 `<Field>`(讓使用者能套 Field label / error / hint 共用機制):

```tsx
<Field>
  <FieldLabel required>整體滿意度</FieldLabel>
  <Rating value={rating} onChange={setRating} size="md" />
  {rating === 0 && <FieldError>請至少給 1 星</FieldError>}
</Field>
```

Field 高度由 Rating container(`h-field-md`)自然對齊其他 field control,不需 consumer 額外調整 min-h。`aria-invalid` 透過 FieldContext 自動傳入,視覺錯誤提示由 FieldError 承擔。

---

## Precision — full vs half

| Precision | 顯示值 | 使用情境 |
|-----------|--------|---------|
| `full` | 1, 2, 3, 4, 5 | **送出評分**——使用者給分當下只選整數（Yelp / Google Reviews 送出流程就是整星）|
| `half` | 0.5, 1, 1.5, ..., 5 | **展示平均分**——`4.7` 這類小數只有半星能視覺呈現（Amazon / Shopify 的 `4.7 ★★★★★` 商品列表）|

**原則**：**interactive = full**（使用者按整星清晰、無猶豫），**display average = half**（小數需要更細的視覺刻度）。要給使用者「打半星」的能力只在極特殊情境（如影評社群），一般 SaaS 不建議。

---

## Interactive vs ReadOnly

| Mode | 觸發 | 行為 | ARIA |
|------|------|------|------|
| **interactive**（預設）| `readOnly={false} && disabled={false} && loading={false}` | hover 預覽、click 設值、鍵盤 Arrow Left/Right/Up/Down 改值、Focus ring | `role="slider"` + `aria-valuenow/valuemin/valuemax` + `tabIndex={0}` |
| **readOnly** | `readOnly={true}` | 純顯示，不響應 hover / click / 鍵盤 | `role="img"` + `aria-label`（**必填**，給螢幕閱讀器描述分數）|
| **disabled** | `disabled={true}` | 不響應，視覺淡化（`opacity-disabled`）| `aria-disabled="true"` |
| **loading** | `loading={true}` | 不響應,視覺同 disabled(uniform dim)——但語義是「正在取得既有評分 / 正在儲存」,非永久不可互動 | `aria-busy="true"`(screen reader 宣告「忙碌中」) |

**判斷法**:
- **送出前 = interactive**,**送出後 / 顯示他人評分 = readOnly**。
- **loading 跟 disabled 視覺相同但語義不同**:loading = 暫時性(fetch / save in flight);disabled = 永久性業務規則(例:評分期限已過)。screen reader 會區分(`aria-busy` vs `aria-disabled`)。

一顆星 Rating 同時給自己評和看別人評的常見錯誤是都用 interactive——使用者會誤以為可以改別人的分數。

### Loading canonical(composite 元件 opacity pattern)

Rating 是**複合 element**(多顆星共同組成評分值),loading 走 **composite 整塊 dim** 策略(對齊 FileUpload / Sidebar menu row),**不**套 skeleton 替換星星:
- **為什麼不 skeleton**:星星數是 schema(`max=5`)不是 data,loading 中消失變成「動態結構」,使用者誤以為星星數本身在變
- **為什麼不 spinner**:會與 readOnly 圖示混淆;loading 是**暫時性等待**不是「純展示」

API:`loading?: boolean` prop(對齊 `../Field/field-controls.spec.md` Field 家族 loading canonical,但這裡採 composite dim 非 endAction spinner)。

---

## 視覺 Token

| Role | Token | 色值（light） | 說明 |
|------|-------|--------------|------|
| Filled star | `var(--warning)` | yellow-6 | 世界級黃星 convention（Amazon / Yelp / Google / Shopify / Airbnb 都是黃）|
| Empty star | `var(--color-neutral-4)` | 中灰 | 未填的輪廓色，與 disabled / empty state 同級 |
| Hover 放大 | `scale-110` + `transition-transform` | — | interactive 時 hover 單顆星放大 10%，給予 preview 回饋 |
| Focus ring | `ring-2 ring-ring ring-offset-2` + `rounded-md` | — | 鍵盤 focus 時整個 Rating 容器顯示 focus ring（**per-star 無 ring / border / outline**——focus 視覺由 parent container 統一承擔）|
| Gap between stars | `gap-1` | 4px | 五顆星之間的間距，不隨 size 變化 |
| Disabled | `opacity-disabled` + `pointer-events-none` | — | 整體降透明度，阻擋所有事件 |

### Star icon 無 stroke outline

Star icon 渲染時明確設 `stroke="none"`(Lucide Star 預設有 1.5px outline stroke,保留會讓 filled 星星多一層深色 outline,破壞純 fill-only shape canonical)。**Rating 是純 fill-only shape**,不保留 outline——對齊 Ant Rate / Material MUI Rating 的世界級慣例。Empty star 靠 `--color-neutral-4` 的 fill 本身與 canvas 對比區隔,不需 outline 補視覺。

### 為什麼用 `--warning`（黃色）而不用 `--primary`

黃星是**世界級 convention**——Amazon / Yelp / Google Reviews / Shopify / Airbnb / TripAdvisor 全部用黃。使用者的視覺記憶已經把「黃星 = 評分」綁定，換成品牌 primary 色（藍、綠、紫）會破壞這個直覺。

`--warning` 在本系統指向 yellow-6，與 Rating **共用色相但語境不同**——evaluation convention color，非 status color。這是 documented 例外（見 `color.spec.md`），不是每個元件都能這樣共用。

---

## A11y

- **interactive**：`role="slider"` + `aria-valuenow={value}` + `aria-valuemin={0}` + `aria-valuemax={max}` + `tabIndex={0}`，鍵盤 Arrow Left/Right/Up/Down 改值（precision=half 時 step=0.5，否則 step=1）
- **readOnly**：`role="img"` + `aria-label`（**必填**），例：`aria-label="平均評分 4.7 星，共 5 星"`。無 tabIndex
- **disabled**：`aria-disabled="true"` + `pointer-events-none`
- **單顆星** `aria-hidden`：所有內部 `<button>`（包含 half-precision 的兩個 hover zone）都是 `aria-hidden` 不干擾螢幕閱讀器，父層 role 獨自表達語意

---

## 禁止事項

- ❌ **不用其他色相填充**（藍 / 綠 / 紫 / 紅）——黃星是世界級 convention，破壞使用者的視覺記憶
- ❌ **不換成 Heart / ThumbsUp / ThumbsDown icon**——那是 like / dislike 的 binary 表達，不是 graded rating。愛心用 `Button iconOnly startIcon={Heart} pressed={liked}`
- ❌ **`readOnly` 必填 `aria-label`**——純視覺的星星螢幕閱讀器讀不出「4.7 分」
- ❌ **不用 Rating 做 progress bar**——Rating 語意是「給分」，用「填了 4 顆星」表達「完成 4/5 步」會誤導
- ❌ **不用於 binary 情境**（「喜歡 / 不喜歡」）——改用 Switch 或 thumbs icon button
- ❌ **interactive 狀態下不與 `Field` 的 `Label` 分離超過一個 section**——使用者要清楚「這個評分屬於誰 / 哪個面向」
- ❌ **`max` 不設超過 7**——超過使用者無法快速掃視，若需更細分度改用 Slider（連續 0–100）
- ❌ **send-form 用 `precision="half"`**——送出評分選半星會讓使用者猶豫（`4` 跟 `4.5` 差在哪？）；半星只用於展示平均值

---

## 相關

- **`Slider`** — 連續數值選擇（0–100、音量、亮度、價格區間）。Rating vs Slider 分界：離散 tier = Rating，連續值 = Slider
- **`Badge`** — 靜態分類標記（「熱門」「Beta」「NEW」）。Rating 是量化，Badge 是分類
- **`Switch`** — 二元 on/off。Rating 是 graded，Switch 是 binary
- **`Button iconOnly + pressed={liked}`** — 愛心 / like 的正確實作
- **Color token 例外** — `color.spec.md`「共用 `--warning` 色相但語境不同」段落
