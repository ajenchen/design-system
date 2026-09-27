---
component: Rating
family: self-contained
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isMatrixHeavy
benchmark:
  - Ant Design Rate: github.com/ant-design/ant-design/tree/master/components/rate
  - MUI Rating: github.com/mui/material-ui/tree/master/packages/mui-material/src/Rating
---

# Rating 設計原則

## 定位

Rating 是**離散 1–5 分評分元件**——使用者對商品、服務、體驗給出 1 到 max（預設 5）顆**整星**；已提交的分數或平均分則以**精簡版**「★ 4.7 (12,843)」唯讀展示。

**實作基礎**：自建的離散星等控件。內部以 lucide-react `Star` 為預設 icon。可以點的評分畫 `max` 顆星，外層 `role="slider"`；唯讀走另一條渲染分支（`rating.tsx` readOnly 分支：一顆實心星 + 數值 + 選填評論數），外層 `role="img"`。disabled / loading 仍畫 `max` 顆星，但同樣切 `role="img"` 並摘除 slider aria / tabIndex(`isInteractive = !readOnly && !disabled && !loading`)。

**Layout Family**:非 4-Family Model —— **self-contained primitive**(獨立視覺,無 slot 結構,類似 Switch / Checkbox / Badge / CircularProgress)。

---

## 何時用

- **送出評分**（interactive）：Yelp / Google Reviews / Amazon 購物完後「幫這次服務評分」的送出前狀態，使用者點一顆整星
- **展示評分**（readOnly）：商品列表的 `★ 4.7 (12,843)`、評論列表每則評論的作者給分 `★ 5`、Airbnb 房源總分
- **後台商品管理**：店家自己給商品的推薦星等（interactive）

## 何時不用

| 情境 | 改用 | 原因 |
|------|------|------|
| 純資訊標記（「熱門」「Beta」「新品」）| `Tag` | Rating 是量化 1–5 分，不是分類標籤;文字分類標記走 Tag(Badge 僅 count/dot 兩模式,無文字承載) |
| 非 1–5 的連續數值（音量、亮度、價格範圍）| `Slider` | Rating 是離散 tier，Slider 是連續值 |
| 二元喜歡 / 不喜歡（thumbs up/down、like）| `Switch` 或自組 icon button | Like 是 binary，Rating 是 graded 1–5 |
| 多維度評比（服務 / 品質 / 速度 各 5 分）| 自組多個 Rating 縱向排列 | 單一 Rating 只表達單一維度 |
| 進度顯示(任務完成度、上傳進度) | `ProgressBar`(linear)/ `CircularProgress`(circular,有 value) | Rating 不是進度指標,別誤用星星做「完成 4/5 步」|
| 已提交固定分數但可跳轉「看詳情」| readOnly Rating + 旁邊 Button/Link | Rating 本身不點擊跳頁 |

---

## Props

| Prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `value` | `number` | — | 當前評分（controlled，0 ~ `max`）。可以點的評分遇到小數會四捨五入到整顆顯示；唯讀照原值顯示一位小數（見「邊界案例」） |
| `defaultValue` | `number` | `0` | uncontrolled 預設值 |
| `onChange` | `(value: number) => void` | — | 評分改變 callback（滑鼠點星或在縫裡確認預覽都給整數；鍵盤從目前值 ±1） |
| `max` | `number` | `5` | 滿分星數（世界級慣例 = 5，超過 7 會讓使用者無法快速掃視） |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 尺寸,同 Switch / Checkbox:明傳最優先,否則跟所在容器(Field 明確指定的 size、表格 surface size),都沒有才 md。沒有 xs(2026-09-27 退役,見「Size」)。可以點的星與唯讀精簡版的星、字各有一張表 |
| `readOnly` | `boolean` | `false` | 唯讀：一律顯示精簡版（一顆實心星 + 數值 + 選填 `count`），不響應 hover / click / 鍵盤。`<Field mode="readonly">` 內自動成立 |
| `count` | `number` | — | 唯讀時接在數值後、括號內的評論數，加千分位（`12843` → `(12,843)`）。可以點的評分不顯示 |
| `disabled` | `boolean` | `false` | 完全停用 |
| `loading` | `boolean` | `false` | 暫時性等待(fetch / save in flight)——視覺同 disabled(composite 整塊 dim)、`aria-busy`;詳「Loading canonical」段 |
| `icon` | `LucideIcon` | `Star` | 自訂 icon（極少用；禁止換成 Heart / ThumbsUp，見禁止事項） |
| `aria-label` | `string` | — | standalone `readOnly` 時必填，要說出分數（畫面上有評論數就一起說），例：「平均評分 4.7 星，共 5 星，12,843 則評論」 |

---

## Size

**元件只有內容高,列高交給所在的列**(同裸 Switch / 裸 Checkbox):可以點的評分根節點高度 = 星的高度;唯讀精簡版高度 = 星與文字行高的較大者;都不吃 `--field-height-*` 容器。Field 內由 Field 控件槽的 `min-h-field-* + items-center`(`../Field/field.tsx`)撐出跟其他欄位一樣的列高並置中;Field 外的列由列自己(`items-center`)決定,評分不再撐高列。使用時機 = **跟所在容器**:Field 內自動跟 Field、表格格子自動跟表格 surface size、列裡跟列的尺寸(sm 列星 20、md / lg 列星 24 —— 與行內頭像同一張表);沒有任何容器尺寸的獨立擺放才用預設 md。

### 可以點的評分（`max` 顆星）

| Size | 星(= 元件高) | 使用時機 | 配對 field |
|------|------------|---------|-----------|
| `sm` | 20px | Field sm、sm 列(緊湊清單、表格 sm) | field sm |
| `md` | 24px | **預設**。一般表單、md 列、獨立擺放 | field md |
| `lg` | 24px | Field lg、送出評分的主 CTA 區塊 | field lg |

### 唯讀精簡版（一顆星 + 數值 + 評論數）

**星 ↔ 數值的縫四個尺寸都是 `gap-1` 4px —— Rating 內只有一種縫**:可以點的星與星之間是 4px(下方「Gap between stars」),唯讀精簡版的星與數值也是 4px;數值與括號內評論數之間是一個文字空格(3.4–4.2px),三者同一個節奏。2026-09-27 user 拍板:先問「唯獨星星與其後方的文字間距是怎麼來的有仔細研究過？我本來以為可能都是一個文字空格之類的間距」,重查後再問「我覺得星號與文字gap應該跟這個一樣都是4px吧？」,對「全部 4px」的建議回「照你建議」。之前的 sm / md / lg 8px 是直接套 Button(動作鈕)的 icon + label 表,理由不對(`rating.tsx` readOnly 分支註解同此)。

**世界級對照(2026-09-27 讀原始碼 + 實機量)**:沒有一家把星↔星與星↔數字都設 4px,但 4px 這個值有同款 —— 唯一有「一顆星 + 數值」精簡版的設計系統 Fluent 2 `RatingDisplay compact`:16px 星 + 12px 字 4px(= 本 DS 全部尺寸的值)、20px 星 + 14px 字 6px、28px 星 + 16px 字 8px,星與星之間 0px([useRatingDisplayStyles.styles.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-rating/library/src/components/RatingDisplay/useRatingDisplayStyles.styles.ts) `marginLeft: spacingHorizontalXS / SNudge / S`,[spacings.ts](https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/spacings.ts) 4 / 6 / 8px);Ant Design v4 是兩者同值的先例(星與星、星旁文字都 8px,[index.less](https://github.com/ant-design/ant-design/blob/4.x-stable/components/rate/style/index.less) `&-text { margin: 0 8px }`);「16px 圖示 + 數字」的資料列則寬一檔:GitHub 儲存庫頁「★ 20.3k」= 16px octicon + `mr-2` 8px + 14px 字、12px 字的 commit 數 4px(2026-09-27 headless 實量;Primer `$spacer-1` 4px / `$spacer-2` 8px,[layout.scss](https://github.com/primer/css/blob/main/src/support/variables/layout.scss))—— 那是圖示 + 計數的資料列,不是評分,本 DS 不跟。Google Play「4.3★」與 App Store「4.8★」是另一種構造:星比字小(12px 星配 14px 字、10px 星配 22px 字)、貼在數字**後面** 0–3px,像角標(2026-09-27 實量),本 DS 不採 —— 星維持 icon tier 16 / 20px。「一個空格」在本 DS 字級下是 3.4 / 3.8 / 4.2px,4px 約等於一個空格。

| Size | 星 | 數值與評論數字級 | 元件高 | 星 ↔ 數值 | 使用時機 |
|------|----|----------------|--------|----------|---------|
| `sm` | 16px(`ICON_SIZE.sm`) | `text-body`(14px) | 21px(行高) | `gap-1`(4px) | Field sm 唯讀、sm 列(商品卡、評論列表旁) |
| `md` | 16px(`ICON_SIZE.sm`) | `text-body`(14px) | 21px | `gap-1`(4px) | **預設**;Field md 唯讀、md 列 |
| `lg` | 20px(`ICON_SIZE.lg`) | `text-body-lg`(16px) | 24px | `gap-1`(4px) | Field lg 唯讀、lg 列 |

字級走 Field 家族的顯示字級 helper(`../Field/field-wrapper.tsx` `fieldDisplayTextClass`:lg → `text-body-lg`,其餘 `text-body`)。

### 為什麼不完全對齊 `--field-height-*`

- **現況**:可以點的評分根高 = 星 sm 20 / md 24 / lg 24;唯讀精簡版 21 / 21 / 24(星與行高較大者);都不等於 `--field-height-sm/md/lg` 28 / 32 / 36。
- **Rationale**:評分是「嵌在一列中的小控件」,跟裸 Switch(track 20 / 24)、裸 Checkbox(16 / 20)同一個模型 —— 元件本身只有內容高,列高由宿主供給(Field 控件槽 `min-h-field-* + items-center`、表格格子、列)。吃固定容器會把 Field 外的列撐高(2026-09-27 實量:商品卡裡 24 容器實佔 26px、caption 列 16 → 24),而容器對命中零幫助(命中盒 = 星)。Slider 不同:它的根就是拖曳的命中面,高度即命中區,故仍吃 `h-field-*`(`../Slider/slider.spec.md`「為什麼不完全對齊」)。
- **世界級對照**(2026-09-27 讀原始碼):多數 hug 星、表單對齊交給表單列 —— MUI Rating 根 `inline-flex` 無高度、字級 24 / 18 / 30([Rating.js](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Rating/Rating.js));Ant Design Rate 根 `display: inline-block; fontSize: starSize; lineHeight: 1`,對齊由 Form.Item 的 `minHeight: controlHeight` + `alignItems: center` 負責([rate/style/index.ts](https://github.com/ant-design/ant-design/blob/master/components/rate/style/index.ts)、[form/style/index.ts](https://github.com/ant-design/ant-design/blob/master/components/form/style/index.ts));Fluent 2 Rating 根只有 `display: flex`、星 12 / 16 / 20 / 28([useRatingStyles.styles.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-rating/library/src/components/Rating/useRatingStyles.styles.ts));Mantine Rating 根 `display: flex; width: max-content`([Rating.module.css](https://github.com/mantinedev/mantine/blob/master/packages/%40mantine/core/src/components/Rating/Rating.module.css));Chakra v3 / PrimeReact 同為 `inline-flex` 無高度。少數把容器綁到控件高:Element Plus `el-rate` 根 `height: 32px`(large 40 / small 24,[rate.scss](https://github.com/element-plus/element-plus/blob/dev/packages/theme-chalk/src/rate.scss))、Arco `.arco-rate-inner` `min-height: 32px` —— 本 DS 不跟,列高由 Field 槽供給已是 Switch / Checkbox 的既有模型。

**xs 退役(2026-09-27)**:可以點的 xs(2026-04-21 `6d9d48f2` AI 加、無 user 原話、無出處;容器 24 / 星 20)與 sm 只差容器,容器拿掉後兩者相同;唯讀 xs(16 星 + 12px 字)是 2026-09-26 `1e0d4545` 做精簡版時 AI 自訂的配對,從沒給 user 看過,產品 0 處、只有 3 個 story 用。user 原話:「這個xs是你這一兩天生的吧？而且這個設計也沒經過我同意吧？如果上述兩個問題都為真，那就應該直接整個移掉吧？然後應該是整個rating xs都移掉吧？」—— 兩題皆真,整個移掉。閘 `scripts/rating-field-size-invariant.mjs`(尺寸解析序、無容器 class、執行期 'xs' 映 sm 並 dev-warn;meta test `scripts/test-rating-field-size-invariant.mjs`)。

### 為什麼不完全對齊 icon tier — 可以點的星對齊 **Avatar inline**(2026-04-21 AR48 canonical)

**可以點的評分**,每顆 star icon 大小對齊 `item-anatomy` 的 inline Avatar 尺寸(sm=20 / md=24 / lg=24),**不走 icon tier**(16/16/20)。

| Size | Rating star | Avatar inline | Icon tier | 使用者選到 |
|------|-------------|---------------|-----------|-----------|
| sm | **20px** ← Avatar | 20px | 16px | Avatar(更重視覺) |
| md | **24px** ← Avatar | 24px | 16px | Avatar |
| lg | **24px** ← Avatar | 24px | 20px | Avatar |

**為什麼對齊 Avatar 不對齊 icon tier**:可以點的每一顆星是 filled shape 的「主要資料視覺」(一顆星 = 一個資料點),與同為 filled 的 identity 元件(Avatar)同尺寸才能在 row 裡 visual weight 對齊;次要 affordance(Input startIcon / Button iconOnly)才走 icon tier(16/16/20)。(歷史:早期 16/16/20 對齊 icon tier,星星比並排 avatar「小一號」——AR48 修正。)

**唯讀精簡版不在此例外內**:它的星是數值旁的圖示,照上方「唯讀精簡版」表走 icon tier(16/16/20),星與數值的縫 4px(同上)。

### 放入 Field 的可組合性

Rating 可直接塞進 `<Field>`(讓使用者能套 Field label / error / hint 共用機制):

```tsx
// 驗證時機走 form-validation.spec.md canonical(blur + submit,不在初始 / 操作中即時報錯)
// —— error 由 form.errors 驅動,非 `rating === 0` 立即判(那會讓初始未觸碰欄位直接紅框)。
const form = useFormValidation({
  initialValues: { rating: 0 },
  validate: { rating: (v) => (v === 0 ? '請至少給 1 星' : undefined) },
  onSubmit: async (values) => { /* ... */ },
})

<Field invalid={!!form.errors.rating}>
  <FieldLabel required>整體滿意度</FieldLabel>
  <Rating {...form.getInputProps('rating')} size="md" />
  <FieldError>{form.errors.rating}</FieldError>
</Field>
```

列高由 Field 控件槽(`min-h-field-md` + `items-center`)供給,Rating 本身只有內容高,不需 consumer 額外調整 min-h。`aria-invalid` 透過 FieldContext 自動傳入,視覺錯誤提示由 FieldError 承擔。`<Field mode="readonly">` 內的 Rating 自動變成唯讀精簡版。

---

## 整顆與精簡版 — 兩條規則(2026-09-26 user 拍板)

1. **可以點的評分只有整顆。** 沒有半顆設定(`precision` prop 已移除):滑鼠點哪一顆就是那一顆的整數,鍵盤每按一下 ±1。`value` 若帶小數,畫面四捨五入到整顆(`Math.round`:2.5 → 3 顆、4.4 → 4 顆),不畫半顆、不照比例填色。
   來源:AI 建議「可以點的只給整顆」,user 以自訂回覆同意(原話見規則 2 的「其他照你建議」);user 更早的原話「所以我一開始才跟你說要不就是全部都是整數，要不就是全部都可以0.5，甚至直接提供整數也完全沒問題」。
2. **唯讀一律精簡版。** 一顆實心星 + 數值(取一位小數)+ 選填評論數,例「★ 4.7 (12,843)」。不畫 `max` 顆星,所以唯讀沒有半顆、也沒有照比例填色的問題。
   來源:user 原話「唯讀直接一律給精簡版就好吧？搞得這麼麻煩幹嘛？其他照你建議」(`governance/planning/2026-09-25-interaction-and-hover-remediation.md`「09-26 第三輪回覆」評分條)。

**世界級怎麼做**(2026-09-26 讀釘版原始碼,引文逐字):

| 系統(釘版) | 可以點的:半顆 | 可以點的:預設與小數 | 唯讀怎麼畫 | 一手出處 |
|---|---|---|---|---|
| **MUI Rating** v9.4.0 | 可自己打開(`precision`) | "`precision = 1,`"(`Rating.js#L387`);值先經 `roundValueToPrecision` 四捨五入(`#L28-L35`、`#L404`),預設下 4.7 → 5 | 同一個元件加 `readOnly`(`HalfRating.js#L8`) | [Rating.js](https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/Rating/Rating.js)、[HalfRating.js](https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/docs/data/material/components/rating/HalfRating.js) |
| **Ant Design Rate** 6.6.5 | 可自己打開(`allowHalf`) | "allowHalf \| Whether to allow semi selection \| boolean \| false"(`index.en-US.md#L37`);rc-rate "`allowHalf = false,`"(`Rate.tsx#L52`) | 同一個元件加 `disabled`:"disabled \| If read only, unable to interact"(`index.en-US.md#L41`) | [index.en-US.md](https://github.com/ant-design/ant-design/blob/4a39f54842eade4e565ab336ef6097cd7e723cdd/components/rate/index.en-US.md)、[Rate.tsx](https://github.com/react-component/rate/blob/87c72e7781fa0e3060d3575e7fd5910f26696e3a/src/Rate.tsx) |
| **Chakra UI RatingGroup** 3.37.0(Zag `@zag-js/rating-group`) | 可自己打開(`allowHalf`) | 關掉 `allowHalf` 時把值 "`Math.round`"(`rating-group.machine.ts#L197-L199`,由 `#L43-L45` 監看 `allowHalf` 觸發) | — | [rating-group.machine.ts](https://github.com/chakra-ui/zag/blob/30923243faced9118822f190d3027a23ff0b3010/packages/machines/rating-group/src/rating-group.machine.ts) |
| **Fluent 2**(`@fluentui/react-rating` 9.4.5) | `Rating` 可自己打開(`step: 0.5 \| 1`) | "Sets the precision to allow half-filled shapes in Rating / @default 1"(`Rating.types.ts#L49-L53`) | **另一個元件** `RatingDisplay`:"Displays read only `RatingItem`s and value and count labels"(`Spec.md#L28`);`compact` "Renders a single filled star, with the value written next to it."(`RatingDisplay.types.ts#L20-L24`);`count` "This will be formatted with a thousands separator (if applicable) and displayed next to the value."(`#L25-L29`);最佳做法 "Always display the value of the `RatingDisplay`."(`RatingDisplayBestPractices.md#L5`) | [Rating.types.ts](https://github.com/microsoft/fluentui/blob/a51547435d0a5c4a0fb15c2996c3d3efea5b49dd/packages/react-components/react-rating/library/src/components/Rating/Rating.types.ts)、[RatingDisplay.types.ts](https://github.com/microsoft/fluentui/blob/a51547435d0a5c4a0fb15c2996c3d3efea5b49dd/packages/react-components/react-rating/library/src/components/RatingDisplay/RatingDisplay.types.ts)、[Spec.md](https://github.com/microsoft/fluentui/blob/a51547435d0a5c4a0fb15c2996c3d3efea5b49dd/packages/react-components/react-rating/library/docs/Spec.md)、[RatingDisplayBestPractices.md](https://github.com/microsoft/fluentui/blob/a51547435d0a5c4a0fb15c2996c3d3efea5b49dd/packages/react-components/react-rating/stories/src/RatingDisplay/RatingDisplayBestPractices.md) |
| **SAP Fiori**(OpenUI5 `sap.m.RatingIndicator` 1.152.0) | 不能 | "Half-values can't be selected by the user."(`RatingIndicator.js#L40`) | 半顆只用來顯示平均分(同一句) | [RatingIndicator.js](https://github.com/SAP/openui5/blob/86316a9a26813b06733a6eb8127c40b4c2630bdc/src/sap.m/src/sap/m/RatingIndicator.js) |
| **UI5 Web Components** 2.27.2 | 不能 | 點下去 "`this.value = parseInt(targetValue);`"(`RatingIndicator.ts#L273`) | 顯示自動取到半顆 "1.3 - 1.7 -> 1.5"(`#L100`) | [RatingIndicator.ts](https://github.com/SAP/ui5-webcomponents/blob/5529f5dc2aa697c9152ca73f5b0c0211bd0b557e/packages/main/src/RatingIndicator.ts) |
| **Adobe Spectrum CSS Rating** | 不能(整份沒有半顆) | "`updateArgs({ value: idx + 1, isFocused: true });`"(`stories/template.js#L71-L75`) | — | [template.js](https://github.com/adobe/spectrum-css/blob/1fd551681a120b750e9df5eb17401369d233d984/components/rating/stories/template.js) |
| **Apple HIG** rating indicators | — | — | "A rating indicator doesn't display partial symbols; it rounds the value to display complete symbols only."(範圍:只有 macOS,原文 "Not supported in iOS, iPadOS, tvOS, visionOS, or watchOS.") | [rating-indicators](https://developer.apple.com/design/human-interface-guidelines/rating-indicators) |

**對照結論**:
- 規則一:可以點的只有整顆 = SAP / UI5 / Spectrum CSS 的做法;MUI / Ant / Chakra / Fluent 預設也是整顆,半顆要自己打開 —— 本 DS 不提供這個開關。非整數值四捨五入到整顆 = MUI 預設 `precision = 1` 的 `roundValueToPrecision`;Apple macOS 顯示也只畫整顆、四捨五入。
- 規則二:唯讀精簡版 = Fluent `RatingDisplay` 的 `compact` + `count`(Fluent 另拆一個元件;本 DS 不拆,用 `readOnly` 分開「能不能點」)。**但 Fluent 的 `compact` 是選項(預設 false),MUI / Ant 的唯讀是同一個元件加 `readOnly` / `disabled`** —— 把精簡版定為唯讀的**唯一**呈現是 user 的決定,不是世界級共識,照實記錄。

---

## Interactive vs ReadOnly

| Mode | 觸發 | 畫面 | 行為 | ARIA |
|------|------|------|------|------|
| **interactive**（預設）| `readOnly={false} && disabled={false} && loading={false}` | `max` 顆星,只有整顆 | hover 預覽、click 設值、預覽亮著時點縫 = 確認預覽值(見「命中區」)、鍵盤 Arrow Left/Right/Up/Down ± 1、Home=0 / End=max、Focus ring | `role="slider"` + `aria-valuenow/valuemin/valuemax` + `aria-valuetext`（`{value} of {max} stars`）+ `tabIndex={0}` |
| **readOnly** | `readOnly={true}` 或 `<Field mode="readonly">` | 精簡版:一顆實心星 + 數值 + 選填 `(count)` | 純顯示，不響應 hover / click / 鍵盤 | `role="img"` + accessible name（standalone `aria-label` **必填**,要說出分數）|
| **disabled** | `disabled={true}` 或 `<Field disabled>` | `max` 顆星,整塊淡化(`opacity-disabled`) | 不響應 | `role="img"` + `aria-disabled="true"` |
| **loading** | `loading={true}` | 同 disabled | 不響應,視覺同 disabled(uniform dim)——但語義是「正在取得既有評分 / 正在儲存」,非永久不可互動 | `role="img"` + `aria-busy="true"`(screen reader 宣告「忙碌中」) |

**判斷法**:
- **送出前 = interactive**,**送出後 / 顯示他人評分 / 平均分 = readOnly**。
- **唯讀不畫 `max` 顆星**:看得到一排星星的只有可以點的評分(以及它的 disabled / loading)。
- **loading 跟 disabled 視覺相同但語義不同**:loading = 暫時性(fetch / save in flight);disabled = 永久性業務規則(例:評分期限已過)。screen reader 會區分(`aria-busy` vs `aria-disabled`)。

一顆星 Rating 同時給自己評和看別人評的常見錯誤是都用 interactive——使用者會誤以為可以改別人的分數。

### 命中區 = 每顆星自己的盒,零外擴;縫裡點下去 = 確認正在預覽的值

跨元件契約(`../../ds-canonical/references/hit-area-canonical.md`)要禁的是「在元素之外長出一圈吃指標的東西」。
**本元件沒有這種東西**:每顆星的命中目標就是包住 icon 的那個 `<span>`(`rating.tsx` `StarIcon`),
它的盒**等於 icon 自己的盒**(sm 20×20、md / lg 24×24)。沒有 `-inset`、沒有透明 border、沒有 `hitSlop`。

**星形 glyph 比盒小是對的,不是漏洞。** 契約明文:「圖示與文字是裝在裡面的**內容**,內容可以比命中區小,不得比它大」。
星形是凹多邊形,若把命中改成貼著 glyph 的輪廓,星角之間的凹口會變成點不到的死區 ——
那正好踩到契約要防的**另一邊**(看得到卻點不到)。

**縫(2026-09-26 AI 建議「縫裡點下去 = 確認正在預覽的值」,列在「其餘建議」裡、user 未另提 → 照建議做;AI 判讀,見待辦總帳「09-26 第三輪回覆」)**:
星與星之間的 4px(`gap-1`)不屬於任何一顆星(元件只有內容高,沒有上下留白;2026-09-27 起)。
- 指標從某顆星移進這些地方時,那顆星的預覽**照舊亮著**;只有指標離開整個元件才收掉預覽(`onMouseLeave` 掛在容器)。
- **預覽亮著時在這裡點下去 = 確認正在預覽的值**(由容器的 `onClick` 處理;點在星上時由星自己處理,不會重複送出)。預覽亮著時容器也是手形游標,與星同一個游標。
- 沒有預覽時(指標從元件外直接落進縫、還沒碰到任何一顆星)點下去,值不變。
- 每顆星的盒沒有因此變大:這是容器「確認目前預覽」,不是某顆星外擴;縫屬於 Rating 自己的容器,底下沒有別的可點目標可搶(AI 推導的讀法,對應契約的外擴限制)。
- 來源:待辦總帳 N50「可點的元件:滑過讓它有變化的位置點下去要觸發」(user「1. 我同意」)+ 評分條「星星縫裡點下去 = 確認預覽值」(`governance/planning/2026-09-25-interaction-and-hover-remediation.md`「09-26 user 逐題回覆」N50 列與「09-26 第三輪回覆」評分條)。

**世界級同款**(2026-09-26 讀釘版原始碼):

| 來源 | 命中載體 | 點下去寫入什麼 |
|---|---|---|
| **Material MUI** `Rating.js#L127`(`RatingLabel = styled('label'`)([Rating.js](https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/Rating/Rating.js)) | 覆蓋整顆 icon 的 `<label>`;預覽依**整排**的橫向位置換算(`#L424-L441`:`percent = (event.clientX - left) / containerWidth`,`left` / `containerWidth` 取自 root 的 `getBoundingClientRect()`) | **正在預覽的值**:`#L478-L482` "`// Give mouse priority over keyboard`" … "`newValue = hover;`" |
| **Ant Design Rate**(`rc-rate`)`Star.tsx#L82-L85`([Star.tsx](https://github.com/react-component/rate/blob/87c72e7781fa0e3060d3575e7fd5910f26696e3a/src/Star.tsx))、`Rate.tsx#L159-L160`([Rate.tsx](https://github.com/react-component/rate/blob/87c72e7781fa0e3060d3575e7fd5910f26696e3a/src/Rate.tsx)) | 每顆星自己的 `<div onClick onMouseMove>` | 被點的那顆星依點擊位置算出的值(`getStarValue(index, pageX)`) |
| **React Aria** `useRangeCalendar.ts#L23-L33`、`#L80-L86`([useRangeCalendar.ts](https://github.com/adobe/react-spectrum/blob/4dd44e0f400636a87a9ad4390903e78c5ae6113c/packages/react-aria/src/calendar/useRangeCalendar.ts)) —— **日期區間,不是評分**,列為同屬「預覽類元件」的近親 | 每一天的按鈕 | 在月曆內、但不在任何日期按鈕上放開指標(`!target.closest('button, [role="button"]')`)→ 預設 `select`:"select the currently hovered range of dates."(整段範圍原文:"Controls the behavior when a pointer is released outside the calendar or a blur occurs mid selection") |

「縫裡點下去確認預覽值」在評分元件上沒有一家一模一樣的做法:MUI 靠整排換算讓星與星之間不存在「不屬於任何一顆」的位置、點下去寫入預覽值;
本 DS 保留每顆星自己的盒(契約),改由容器在縫裡確認預覽 —— 對使用者的結果與 MUI 相同:**預覽亮著的地方點下去都有反應**。

**實測**(真 `page.mouse` + `elementFromPoint`):

| 量的東西 | 結果 |
|---|---|
| 整星命中盒 vs icon 盒(2026-09-24,設計規格--元件檢閱器 md) | `24×24` vs `24×24` —— **完全重合,零外擴**(同次量的半顆區已隨半顆設定移除而作廢) |
| 從第 3 顆星中心移進 3 與 4 之間的縫,點下去(2026-09-26,展示--送出評分流程 lg:星 24、縫 4;淺深兩色結果相同;2026-09-27 容器改內容高後重量,結果同) | 縫的擁有者 = 容器(`role="slider"`),游標 `pointer`,值 0 → **3** |
| 對照:從元件外直接落進 3 與 4 之間的縫(沒碰到任何星),點下去 | 游標 `auto`,值維持 **0** —— 證明沒有預覽時縫不收點擊 |
| 對照:直接點第 4 顆星 | 值 → **4** —— 證明這支量具量得到點擊改值 |

⚠️ 量測教訓:第一版測試沒有先把指標移出元件,殘留的 `hoverValue` 改變了畫面與點擊結果,量到的是上一次互動的殘影。
**量 hover 驅動的元件前必須先讓它回到靜止態**(移出元件觸發 root 的 `onMouseLeave`)—— 縫裡點下去的結果取決於有沒有預覽亮著,這條更要守。

### Loading canonical(composite 元件 opacity pattern)

Rating 是**複合 element**(多顆星共同組成評分值),loading 走 **composite 整塊 dim** 策略(對齊 FileUpload / Sidebar menu row),**不**套 skeleton 替換星星:
- **為什麼不 skeleton**:星星數是 schema(`max=5`)不是 data,loading 中消失變成「動態結構」,使用者誤以為星星數本身在變
- **為什麼不 spinner**:會與 readOnly 圖示混淆;loading 是**暫時性等待**不是「純展示」
- 唯讀精簡版 loading 同樣整塊淡化 + `aria-busy`

API:`loading?: boolean` prop(對齊 `../Field/field-controls.spec.md` Field 家族 loading canonical,但這裡採 composite dim 非 endAction spinner)。

---

## 視覺 Token

| Role | Token | 色值（light） | 說明 |
|------|-------|--------------|------|
| Filled star | `var(--warning)` | yellow-6 | 本 DS 評分語意的固定黃色，不隨品牌 primary 色變動；可以點的填色星與唯讀精簡版那一顆星同色 |
| Empty star | `var(--divider)` | 中灰（= `--color-neutral-4`）| 未填的星;借 `--divider` semantic alias(neutral-4,user 2026-05-09 拍板),與分隔線同級的 muted-fill。只出現在可以點的評分(唯讀精簡版沒有空星) |
| 唯讀數值 | `text-foreground` | `--color-neutral-9` | 精簡版的數值(取一位小數),`tabular-nums` |
| 唯讀評論數 | `text-fg-secondary` | `--color-neutral-8` | 精簡版括號內的評論數,千分位 |
| 唯讀星與字的尺寸 | 見「Size — 唯讀精簡版」 | — | 星走 icon tier;星與數值的縫 `gap-1` 4px,與星和星之間同值(Rating 內只有一種縫) |
| Hover 預覽 | 改 `fill`（不改尺寸） | — | interactive 時 hover 把游標所在星之前（含）的星填色預覽（只有整顆）；星星尺寸不變 |
| Focus ring | `:focus-visible`(全域規則,無 class)+ `rounded-md` | — | 鍵盤 focus 時整個 Rating 容器(= 貼著星列的內容盒,2026-09-27 起不再是 field-height 盒)顯示全域 `:focus-visible` 外描邊（`outline: 2px solid var(--ring)`,往外 2px;元件不寫任何 class,圓角跟著 `rounded-md`;**per-star 無 ring / border / outline**——focus 視覺由 parent container 統一承擔）|
| Gap between stars | `gap-1` | 4px | 可以點的星與星之間的間距，不隨 size 變化 |
| Disabled | `opacity-disabled` + `pointer-events-none` | — | 整體降透明度，阻擋所有事件 |

### Star icon 無 stroke outline

Star icon 渲染時明確設 `stroke="none"`(Lucide Star 預設 `stroke="currentColor"` 帶輪廓,strokeWidth 預設 2,保留會讓 filled 星星多一層深色 outline,破壞純 fill-only shape canonical)。**Rating 是純 fill-only shape**,不保留 outline(唯讀精簡版那一顆星同樣 `stroke="none"`)。Empty star 靠 `--divider`(= `--color-neutral-4`)的 fill 本身與 canvas 對比區隔,不需 outline 補視覺。

### 為什麼用 `--warning`（黃色）而不用 `--primary`

黃星是本 DS 的評分語意 canonical。使用者在同一產品內應以相同色相辨識評分，換成品牌 primary 色（藍、綠、紫）會讓評分與一般選取狀態混淆。

`--warning` 在本系統指向 yellow-6，與 Rating **共用色相但語境不同**——evaluation convention color，非 status color。這是 documented 例外（見 `color.spec.md`），不是每個元件都能這樣共用。

---

## A11y 預設

- **interactive**：`role="slider"` + `aria-valuenow={value}`(四捨五入後的整數,見「邊界案例」)+ `aria-valuemin={0}` + `aria-valuemax={max}` + `aria-valuetext={`{value} of {max} stars`}` + `tabIndex={0}`，鍵盤 Arrow Left/Right/Up/Down ± 1（只有整顆）；Home = 0；End = max（完整 WAI-ARIA slider keyboard pattern）
- **readOnly**：`role="img"` + accessible name。畫面上的數值與評論數是 `aria-hidden` 的顯示文字，**可存取名稱要自己說出分數**（畫面上有評論數就一起說）。standalone（無 Field）時 `aria-label` 必填，例：`aria-label="平均評分 4.7 星，共 5 星，12,843 則評論"`。無 tabIndex
  - `Field` 內:`aria-labelledby` 同時指向 `FieldLabel` 與數值文字(`rating.tsx` 唯讀分支),名稱念成「滿意度 4.7」(有評論數時連括號一起:「滿意度 4.7 (12,843)」—— 被 `aria-labelledby` 直接指到的節點即使 `aria-hidden` 也納入名稱,accname 演算法)—— 只指欄位標籤會只聽到「滿意度」、聽不到分數(`aria-labelledby` 優先於 `aria-label`)
- **disabled**：`aria-disabled="true"` + `pointer-events-none`
- **單顆星** `aria-hidden`：內部點擊目標是 `<span role="presentation" aria-hidden>`（非 interactive element，避免與外層 `role="slider"` 形成 axe nested-interactive 違規，2026-04-25 修正）都不干擾螢幕閱讀器，父層 role 獨自表達語意

## 禁止事項

- ❌ **不用其他色相填充**（藍 / 綠 / 紫 / 紅）——黃星是世界級 convention，破壞使用者的視覺記憶
- ❌ **不換成 Heart / ThumbsUp / ThumbsDown icon**——那是 like / dislike 的 binary 表達，不是 graded rating。愛心用 `Button iconOnly startIcon={Heart} pressed={liked}`
- ❌ **standalone `readOnly` 不給 `aria-label`**——畫面上的「4.7 (12,843)」對螢幕閱讀器隱藏，可存取名稱沒說出分數就讀不出來
- ❌ **不在唯讀精簡版旁邊再手寫數值或評論數**——數值由元件顯示、評論數走 `count`；自己再拼一次 `<span>` 會重複顯示，字級與間距也不跟 `size` 走
- ❌ **不把平均分放進可以點的評分**——4.7 會被四捨五入畫成 5 顆，而且使用者會以為點下去能改平均分；展示一律 `readOnly`
- ❌ **不用 Rating 做 progress bar**——Rating 語意是「給分」，用「填了 4 顆星」表達「完成 4/5 步」會誤導
- ❌ **不用於 binary 情境**（「喜歡 / 不喜歡」）——改用 Switch 或 thumbs icon button
- ❌ **interactive 狀態下不與 `Field` 的 `Label` 分離超過一個 section**——使用者要清楚「這個評分屬於誰 / 哪個面向」
- ❌ **`max` 不設超過 7**——超過使用者無法快速掃視，若需更細分度改用 Slider（連續 0–100）

## 邊界案例

- **value = 0 / 未評分**:可以點的評分全空星照常渲染(`--divider` fill);唯讀顯示「★ 0」。兩者都不做特殊 empty state。
- **非整數 value**:可以點的評分四捨五入到整顆顯示(`Math.round`:2.5 → 3 顆、4.4 → 4 顆);唯讀照原值取一位小數(4.25 → 「4.3」,整數不補小數:4 → 「4」),小數點固定是 `.`、不跟語系。
  - 鍵盤起點與讀屏念的值也是四捨五入後的整數(4.7 → 畫 5 顆、按左鍵 → 4、`aria-valuenow` = 5),畫面、鍵盤、讀屏三者同一個數(`rating.tsx` `wholeValue`)。
- **超界 value**:可以點的評分 `> max` 全滿、`< 0` 全空,鍵盤增減恆 clamp 0–max;唯讀先 clamp 到 0–max 再顯示(`max=5` 時 7 → 「★ 5」)。
- **count**:只在唯讀顯示,以執行環境語系加千分位(`toLocaleString()`,`12843` → `12,843`);`count={0}` 顯示「(0)」;不傳就不顯示括號。可以點的評分忽略 `count`。
- **readOnly + disabled / loading 同時成立**:仍是精簡版,整塊淡化(`opacity-disabled`)+ 對應的 `aria-disabled` / `aria-busy`。
- **max 上限**:預設 5(世界級慣例,見 Props 表);**不設超過 7**,原因見「禁止事項」。唯讀精簡版不畫 `max` 顆星,`max` 只用來 clamp。
- **Disabled / Loading**:整塊 dim(`opacity-disabled`),兩者視覺同、語義與 ARIA 不同 — 見「Interactive vs ReadOnly」表 +「Loading canonical」段。
- **Dark mode**:`--warning` / `--divider` / `--foreground` / `--fg-secondary` semantic token 自動 adapt,Rating 不 own dark token。

## 相關

- **`Slider`** — 連續數值選擇（0–100、音量、亮度、價格區間）。Rating vs Slider 分界：離散 tier = Rating，連續值 = Slider;高度模型不同:Slider 根是拖曳命中面故吃 `h-field-*`,Rating 只有內容高(見「為什麼不完全對齊 `--field-height-*`」)
- **`Tag`** — 靜態文字分類標記（「熱門」「Beta」「NEW」）。Rating 是量化,Tag 是文字分類(Badge 僅 count/dot,不承載文字)
- **`Switch`** — 二元 on/off。Rating 是 graded，Switch 是 binary
- **`Button iconOnly + pressed={liked}`** — 愛心 / like 的正確實作
- **Color token 例外** — `color.spec.md`「共用 `--warning` 色相但語境不同」段落

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `uiSize.spec.md`
