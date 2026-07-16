---
component: Input
family: 4
variants:
  default: { when: "Field wrapper 完整 chrome(bg-surface + border + hover/focus 回饋)— 表單 / Field 內嵌" }
sizes:
  sm: { when: "field-height 28、icon 16、text-body" }
  md: { when: "default 一般表單(field-height 32、icon 16)" }   # ★ default
  lg: { when: "touch / 大字級(field-height 36、icon 20、text-body-lg)" }
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design Input: github.com/ant-design/ant-design/tree/master/components/input
  - MUI TextField: github.com/mui/material-ui/tree/master/packages/mui-material/src/TextField
  - Polaris TextField: github.com/Shopify/polaris/tree/main/polaris-react/src/components/TextField
  - Carbon TextInput: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/TextInput
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Input 設計原則

## 定位

Input 是**純文字**的輸入與顯示元件。格式化邏輯為 identity（value → value）——使用者打什麼就存什麼、顯示什麼。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 Input 特有的原則。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## 何時用

- **純文字資料**：姓名、標題、搜尋字串、slug、ID、隨意 label
- **email / URL / password** 等特殊但仍屬「文字」的資料（搭配 `type="email" / "url" / "password"` + 適合的 `startIcon`）
- **格式化邏輯是 identity** 的場景——value → value，不需要千分位、不需要 locale、不需要 picker
- **單行** 輸入（多行用 Textarea）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 數字 / 金額 / 百分比 | `NumberInput` | 需要千分位、prefix/suffix、locale、precision |
| 日期 / 日期時間 | `DatePicker` | 需要原生 picker、`Intl.DateTimeFormat` 顯示 |
| URL + 預覽 / open in new tab | `LinkInput` | 需要 URL 解析、favicon、外開按鈕 |
| 多行文字（description、note、備註）| `Textarea` | Input 是單行 |
| 密碼且需複雜性檢查 | `Input` + 外掛驗證 | Input 本身只負責輸入，驗證是 form 層 |

---

## startIcon 的使用場景

startIcon 用於輔助使用者理解「這個 input 是做什麼的」，不是描述 value 的類型。

| 適合 | 範例 |
|------|------|
| 搜尋 | `Search` |
| Email | `Mail` |
| 密碼 | `Lock` |
| URL | `Globe` |

startIcon 不隨 value 變化——它描述的是 input 的用途，不是 value 的狀態。

---

## endAction 的常見模式

使用宣告式 API（`InlineActionConfig`），Field 自動根據 size 渲染：

```tsx
// 顯示/隱藏密碼
<Input
  endAction={{ icon: showPwd ? EyeOff : Eye, label: showPwd ? '隱藏密碼' : '顯示密碼', onClick: () => setShowPwd(!showPwd) }}
/>

// 清除內容（有值時才顯示）
<Input
  endAction={query ? { icon: X, label: '清除搜尋', onClick: () => setQuery('') } : undefined}
/>
```

| 模式 | Icon | 行為 |
|------|------|------|
| 顯示/隱藏密碼 | `Eye` / `EyeOff` | toggle `type="password"` ↔ `type="text"` |
| 清除內容 | `X` | 清空 value，有值時出現、清空後消失 |

清除按鈕消失後不佔位——input 自然擴展。

endAction(host 內嵌 inline action)vs 獨立 `<Button iconOnly>` 的分界詳 `../../patterns/element-anatomy/inline-action.spec.md`「Inline Action vs Button iconOnly」predicate。

---

## View

`<Input mode="view">` 是 identity 顯示：
- 有值：原樣輸出
- null / undefined / 空字串：半形 `-`（hyphen），`text-foreground`（view/readonly 供檢視值同色;disabled → fg-disabled）

---

## Loading

`loading?: boolean`(Field SSOT,詳 `Field/field-controls.spec.md`「Loading state」段 ~L93-138):右側 endAction 自動顯 `<CircularProgress/>` + `aria-busy="true"`;input 維持可編輯(Ant Input.Search editable 派,反 Material readonly 派,適合 search debounce)。

## 禁止事項

- ❌ startIcon 不可隨 value 變化——它描述用途，不是狀態
- ❌ 不可用 Input 顯示需要格式化的資料（數字、日期、貨幣）——用對應的 Field 元件

---

## 邊界案例

- **Disabled**:`disabled` prop 由 Field SSOT own(`Field/field.spec.md`「Field state machine SSOT」段)。視覺 token:wrapper bg → `bg-disabled`(neutral-2)、text → `text-fg-disabled`(neutral-6,M24 state>emphasis canonical)、startIcon → `text-fg-disabled`、endAction 不渲染(僅 edit mode 渲染)、cursor → `cursor-not-allowed`、border 弱化、無 hover/focus ring。`readOnly` 與 `disabled` 視覺分離:readOnly 維持 default text color(可選取複製)、disabled 全面弱化(不可選)。
- **Loading**:已 codify(見「Loading」段)。`loading=true` 時 endAction slot 自動切 `<CircularProgress/>`,input 仍可編輯(Ant Search 派 idiom)。
- **Empty(no value)**:placeholder 走 `text-fg-muted`(neutral-7);`disabled + empty` 時 placeholder 切 `text-fg-disabled`(M24 state precedence)。
- **Dark mode**:走 semantic token 自動 adapt,無 per-component override。
- **Density**:`size` 由 Field SSOT(sm/md/lg)決定 height + padding;Input 不獨立 own density。

---

## Mode / Validation / a11y

詳見 `../Field/field-controls.spec.md`(Mode / Validation)+ `../Field/form-validation.spec.md`(驗證時機)。

---

## Variant(visual chrome,正交於 mode)

Input 有**一個公開** visual chrome variant `default`(+ 一個 `@internal` 的 `naked`),**獨立於 mode**(mode 是 state,variant 是 chrome look):

| Variant | 原則 | 適用場景 | 世界級對照 |
|---------|------|---------|-----------|
| `'default'`(預設) | 完整 field chrome(背景 + 常態 border + hover/focus 回饋)——明確邀請輸入 | 表單 / Field 內嵌 / 標準 edit UI / toolbar 內小尺寸輸入(如 FileViewer zoom,搭 `size="sm" autoWidth`) | [Material Input](https://github.com/material-components/material-web/blob/main/docs/components/text-field.md) / [Ant Input](https://github.com/ant-design/ant-design/blob/master/components/input/index.en-US.md) default |

**透傳**:在 `<Field variant="default">` 內自動繼承 context variant,per-prop override(code:`useResolvedFieldVariant`)。

> **內部 variant `naked`(@internal,非公開)**：`FieldVariant` 型別含第二值 `'naked'`,但**不是公開 Input variant**——單獨使用無視覺邊界,**不可 standalone**。naked = 剝除 chrome(無 padding / bg / rounded),但 **edit 態仍由自身 border-based state machine 渲染 border + focus 藍框**（field-wrapper.tsx edit×naked compound = cell-as-input state machine;非「完全無 border」、亦非「host cell 自管」）；正被 `FieldSurfaceContext='table-cell'` 取代。consumer 只用 `default`。對齊 public-vs-internal canonical（`ui-development.md`：能直接被使用且用在合理地方才公開）。

> **`bare` variant 退役(2026-07-09,user 拍板)**:原「透明外殼、hover/focus 才顯 border」variant,宣稱用途 = toolbar inline editing,但全 repo(DS + apps + stories)**零真實 JSX 消費者**——FileViewer zoom 實為 `<Input size="sm" autoWidth>`(default variant),非 bare;唯一出現處是一個 ❌ 反例 story + 過時註解。toolbar 小輸入用 `default`(對齊「邊框給互動元素、輸入框就該有邊框」原則),cell-as-input 用 `naked` → `bare` 純冗餘,移除。Benchmark:[Ant Input](https://github.com/ant-design/ant-design/blob/master/components/input/index.en-US.md) 有 `variant="borderless"`(概念合法),但 [Material M3](https://github.com/material-components/material-web/blob/main/docs/components/text-field.md) 只有 filled/outlined、無無邊框變體;我們無真實消費場景 → 不留純預留 variant。詳 `field-types.ts` FieldVariant note。

---

## Auto-width(AR46,2026-04-21)

`autoWidth` prop:Input 寬度自動等於「內容寬(value / placeholder)+ startIcon + endAction + padding」,基於 CSS `field-sizing: content`(Chrome 123+ / Safari 17.4+)。

| 屬性 | 行為 |
|------|------|
| `autoWidth={false}`(預設)| 走 Field canonical(w-full 或 Field wrapper 規則),寬度固定、跟欄位對齊 |
| `autoWidth={true}` | wrapper 改 `inline-flex w-auto`;input 改 `field-sizing:content w-auto min-w-0`,寬度隨 value 文字變化 |

**使用情境**:
- **Inline edit**:FileViewer `ZoomInput`(輸入「100%」縮到三位數寬)、Figma toolbar number input、VS Code setting row
- **Tag / Chip rename**:選中 chip 進入 inline edit,寬度跟 chip 內容保持視覺一致
- **Spreadsheet-like cells**:內容寬度自動跟字數走

**邊界(內容超寬)**:寬度上限 = 父容器可用寬(wrapper `inline-flex w-auto` shrink-to-fit);超過後 input 不再增寬,溢出文字走原生水平捲動。不支援 `field-sizing` 的瀏覽器退化 `w-auto`(fallback 細節見 tsx jsDoc)。

**禁止**:
- ❌ **表單 Field 內**——Field 欄位必須欄寬對齊,寬度隨值跳動會破壞 grid layout
- ❌ **放在主表單欄位區**——auto-width 讓欄寬隨值跳動、破壞 grid 對齊;autoWidth 適用 toolbar / page-body inline 場景,搭 `variant="default"`(小尺寸有框輸入,如 FileViewer zoom;`bare` 2026-07-09 退役)

**世界級對照**:VS Code settings inline input 用同 pattern;Notion property field、Airtable cell edit 皆 auto-size。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 相關

- `../NumberInput/number-input.spec.md` — 數值資料
- `../DatePicker/date-picker.spec.md` — 日期
- `../LinkInput/link-input.spec.md` — URL + 預覽 / 外開
- `../Textarea/textarea.spec.md` — 多行文字
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## A11y 預設

**ARIA / Pattern**:native `<input>` element 預設 a11y。Label 關聯走原生 `<label htmlFor={fieldCtx.id}>` ↔ input `id`(FieldLabel 提供,非 `aria-labelledby`)。Input 自身在 `<input>` 上設 `aria-invalid`(error 時)/ `aria-required` / `aria-describedby`(指向 FieldContext descriptionId)/ `aria-errormessage`(error 時指向 errorId)。

**Keyboard 行為**:

- Tab — focus
- 字母鍵 — 輸入
- 一般文字編輯鍵(方向鍵 / Backspace / Delete / 全選)由瀏覽器原生提供

**Focus**:原生 input outline 已關閉（`outline-none`）；focus 視覺提示由 Field wrapper 的 `focus-within:!border-primary` 提供。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `date-picker.spec.md`
- `field-controls.spec.md`
- `form-validation.spec.md`
- `link-input.spec.md`
- `number-input.spec.md`
- `textarea.spec.md`
- `time-picker.spec.md`
