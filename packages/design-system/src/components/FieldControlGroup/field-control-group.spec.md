---
component: FieldControlGroup
family: self-contained
variants: {}
sizes: {}
traits: []
# traits: [] rationale(2026-05-15 audit Dim 29 fix):layout-primitive,no trait variants(border-collapse only)。
# 對齊 spec frontmatter schema completeness — 即便 N/A 也明示 empty array + rationale comment,避免 audit gap。
benchmark:
  - Ant Design Space.Compact: github.com/ant-design/ant-design/blob/master/components/style/compact-item.ts
  - Bootstrap input-group: github.com/twbs/bootstrap/blob/v5.3.3/scss/forms/_input-group.scss
  - Chakra UI Group + InputGroup: github.com/chakra-ui/chakra-ui/blob/main/apps/www/content/docs/components/input.mdx
---


# FieldControlGroup 設計原則

## 定位

**Layout Family**:self-contained(form composition layout-primitive,非 4-Family element layout — 對齊 frontmatter `family: self-contained`)。

**多個 Field controls 視覺接合成一個 input frame**(border-collapse pattern)。命名對齊 ButtonGroup 的 `<X>Group` idiom(X = button → ButtonGroup;X = field control → FieldControlGroup),**但兩者機制不同**:ButtonGroup 是 gap 分離群組(`flex gap-2`,子按鈕之間留 8px),本元件才是 border-collapse 接合(負 margin 重疊 border,子無 gap)。

**自建 + 理由**:Radix 沒有對應 primitive;shadcn 現有 `ButtonGroup`(<https://github.com/shadcn-ui/ui/blob/8a3536678a528cc012b9e62484290e79d0be410f/apps/v4/registry/new-york-v4/ui/button-group.tsx#L8-L13>)也能把 input / select / button 接成一條,但做法是拿掉相鄰子元素的左框線(`border-l-0`),hover 不提升層級、disabled 不降層 —— 本 DS 的子 control 要各自保留完整 border(hover / error / disabled 都畫在自己的框上),所以自建。對齊 [Ant `Space.Compact`](https://ant.design/components/space#spacecompact)(verified source)mechanism + [Bootstrap `.input-group`](https://getbootstrap.com/docs/5.3/forms/input-group/)(verified SCSS)idiom 自建。

## 何時用

- 兩個語意連動的 control 視覺一體(電話 = 國碼 + 號碼;金額 = 幣別 + 數字)
- DataTable 進階篩選 row(field + operator + value)
- Search input + Submit button
- Range input(start + end)
- Phone / address 多段輸入

## 何時**不用**

- 單一 control(直接用 Field 即可)
- 多個獨立 fields 垂直排列 → 用 `FieldGroup`
- 同一 question 多 options(Checkbox 群組)→ 用 `CheckboxGroup` / `RadioGroup`
- children 之間要有間距(非接合)→ 不用 FieldControlGroup,改一般橫排,間距照 `layoutSpace.spec.md` 規則決定:並列的輸入框之間照規則 5(起迄一組 `gap-2`、不同組 `gap-4`)

## 近親分界

| 元件 | scope | 視覺 | 語意 |
|--|--|--|--|
| `FieldGroup` | 多 Field 垂直堆疊 | gap 分離 | layout primitive |
| **`FieldControlGroup`** | 多 control 橫向接合 | border collapse | layout primitive(本元件)|
| `RadioGroup` / `CheckboxGroup` | 1 question 多 options | 各自獨立 | semantic group(ARIA role)|
| `ButtonGroup` | 多 Button 分組 | gap 分離(`flex gap-2`) | layout primitive(**不同 mechanism**,非 border-collapse 接合) |

## API

```ts
interface FieldControlGroupProps extends HTMLAttributes<HTMLDivElement> {
  block?: boolean             // 對齊 Ant Space.Compact `block`,默 false=inline-flex([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/space/index.en-US.md#L78))
}
```

**子元件支援 list**(對齊 Ant Space.Compact 限定 list 策略,verified)([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/space/index.en-US.md#L64-L74)):
- ✅ Input / NumberInput / Select / Combobox / DatePicker / DatePickerRange / Button
- ❌ Field(包 Field 進 group 語意亂)/ FieldGroup(垂直 vs 橫向衝突)/ 純 Layout primitive

## 行為機制(verified Ant compact-item.ts L21-92)([來源](https://github.com/ant-design/ant-design/blob/5632e40fceabdbcdfef7e536158aaf404898c867/components/style/compact-item.ts#L30-L58))

1. **子保留 border + radius**(不 strip)
2. **鄰接子負 margin 重疊 border**:`> * + * { margin-left: -1px }`(border 寬度疊在一起 = 視覺 1 條線)
3. **Z-index 提升** for active control(避免被鄰接 border 蓋)
   - default `z-index: 2`
   - hover / focus / focus-within `z-index: 3`(Ant z-3,Bootstrap z-5;我們對齊 Ant)([來源](https://github.com/ant-design/ant-design/blob/5632e40fceabdbcdfef7e536158aaf404898c867/components/style/compact-item.ts#L30-L46)、[來源](https://github.com/twbs/bootstrap/blob/9062790fdb2379593a2973416dc5a3bfb203e4e3/scss/forms/_input-group.scss#L49-L53))
   - 成員自己的浮層開著(成員外框帶 `data-field-open`)`z-index: 3` —— 本 DS 自己的一條(2026-11-12 加;AI 推導,依據是本 DS 的欄位規則,不是引自上面兩家):浮層開著時焦點常已搬進浮層、`focus-within` 不成立,但那一格仍維持聚焦的框(規則住 `../Field/field.spec.md`「Field state machine SSOT」),不抬高就會被 `-ml-px` 疊上來的鄰居蓋掉一邊
   - disabled `z-index: 0`
4. **Border radius 規則**:
   - 第一個子:右側 radii = 0(`rounded-r-none`)
   - 中間子:全 radii = 0(`rounded-none`)
   - 最後一個:左側 radii = 0(`rounded-l-none`)
5. **Container display**:default `inline-flex` / `block` prop → `flex w-full`
6. **Items align**:`items-stretch`(同高)

## Width 配置 canonical(W-A,對齊 Ant)([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/space/demo/compact.tsx#L23-L24))

**子 controls 自管 width**:
- Fixed:`<Select className="!w-[140px]">`
- Flex:`<Input className="flex-1">`
- 混合 OK(filter row 典型:fixed + fixed + flex)

**禁止**:不開 `Cell` wrapper —— 子 control 直接用 className 控寬即可;多包一層會讓 wrapper 變成接合選擇器(`[&>*]`)命中的直接子元素,圓角與框線接合就破了(見「Loading / Empty / 驗證」的「子必 direct child」)([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/space/index.en-US.md#L84-L88))。

## Size

**FCG 不暴露 `size` prop**:本元件只負責 border-collapse 接合(border / radius / z-index),不傳遞 size 給 children(無 Context Provider / 無 cloneElement)。未實作的 group-level size 不預佔 API。Children 的尺寸完全由 child 自己決定 — 以下三種來源:

**繼承 Field 尺寸**(包進 Field 當 control slot):children 各自透過 `useFieldContext().size` 讀外層 `<Field>` 的 size(是 Field 的 context,不是 FCG 的)。
```tsx
<Field size="lg">
  <FieldLabel>電話</FieldLabel>
  <FieldControlGroup>  {/* 各 child 自動繼承外層 Field context size */}
    <Select className="!w-[80px]" options={codes} />
    <Input className="flex-1" />
  </FieldControlGroup>
</Field>
```

**Standalone 逐一設尺寸**:**逐一給每個 child 設 `size`**。
```tsx
<FieldControlGroup>
  <Select size="md" className="!w-[120px]" options={fields} />
  <Input size="md" className="flex-1" />
</FieldControlGroup>
```

**進 Popover**:Popover 只把版面間距鎖 md,控制項大小跟觸發點那一區(`tokens/density/density.spec.md` 情境 1「浮層跟觸發點」)→ children 的高度跟觸發點同一檔,間距吃 md。(2026-11-11 前這句寫「density 鎖 md、children 吃 md」—— 2026-06-15 起就只鎖版面間距,寫下的當天已不成立,稽核 R7-05。)

## A11y 預設

- Container 不加 ARIA role(透明 wrapper,不是 semantic group)
- Children 各自 a11y 標註(每個 Select/Input 自帶 aria-label)
- Tab 鍵在 children 之間正常移動(no focus trap)
- Disabled 透過 children 各自 disabled prop(不從 Group 層級 cascade)

## 禁止事項(❌)

- ❌ 包 Field 進 FieldControlGroup(雙層 wrapper 無意義 + label/error 處理混亂)
- ❌ 不同 size 的 children 混用(視覺高度不一致)
- ❌ 一個 child 設 disabled / 一個設 readonly 等不同 mode(語意一體應一致)
- ❌ 開 Cell wrapper(多一層會讓 wrapper 變成接合選擇器的直接子元素而破圓角;子 className 控 width 即可)
- ❌ Vertical 堆疊用 FieldControlGroup(用 FieldGroup;本元件僅 horizontal)
- ❌ **包 `<div>` / `<span>` wrapper 在 FieldControlGroup direct children 外**(2026-05-04 #2 真實 bug):
  CSS `[&>*]` 直接子選擇器命中 wrapper(無 border/radius)→ inner Field control 保留 left/right radii → **圓角破圖**。
  修法:Field control 必為 direct child;若需 className 給 inner Field control,透過 component prop forward
  (e.g. FilterValuePicker 的 `className` prop 直接 forward 給 inner Input/Select),不另開 wrapper div。
- ❌ Field controls trigger 內部 `w-full` 無法被外加 `className="w-[Xpx]"` override(同 cn() 後 specificity 順序)
  →  必用 `!w-[Xpx]` (Tailwind important) OR 外加 `flex-shrink-0` + 設容器 grid-cols。

## States

| State | 視覺 | z-index |
|--|--|--|
| default | 各 child 自身 border | 2 |
| hover(子)| 該 child border-hover | 3 |
| focus / focus-within(子)| 該 child focus ring | 3 |
| 自己的浮層開著(子,`data-field-open`)| 該 child 維持聚焦的框(規則住 `../Field/field.spec.md`「Field state machine SSOT」,這裡只管疊放)| 3 |
| disabled(子)| 該 child disabled style + **FCG-local override `border-[var(--border-opaque)]`**(K12,2026-05-04) | 0 |
| error(子)| 該 child border-error | 2(預設層;滑過 / 聚焦 / 自己的浮層開著時升 3 蓋過鄰接 border)|

**同一層誰在上(現況)**:滑過、聚焦、自己的浮層開著都是 z-3;相鄰兩格同時在 z-3 時,DOM 順序較後的那一格在上(CSS 的疊放規則)。2026-11-13 量到:某一格開著(或鍵盤聚焦)、滑鼠滑到它**右邊**那一格時,兩格都是 z-3、兩格共用的那條線畫的是右邊那格滑過的灰;滑到左邊那一格則不受影響。要不要讓聚焦 / 開著壓過鄰居的滑過是待 user 決定的題目,登記在 `../Field/field.spec.md`「Field state machine SSOT」的「待 user 決定」,本檔不自定。

**Disabled border integrity canonical(K12,2026-05-04)**:全域 disabled = `border-transparent`(讓 standalone field 視覺輕量),但**FCG context 下,disabled child 強制 `border-[var(--border-opaque)]`** — 確保:(a) FCG 整體外圈 border 健在,(b) inner divider 健在(不會因兩相鄰 disabled cells 都 transparent 而消失)。bg-disabled 仍區分狀態,border 維護群組視覺整合性。對齊 [Bootstrap input-group](https://getbootstrap.com/docs/5.3/forms/input-group/) / [Ant Space.Compact](https://ant.design/components/space#spacecompact) disabled idiom。

實作(v7 — semantic token):
```tsx
[&>*[data-field-mode="disabled"]]:border-[var(--border-opaque)]
```
保留 global `bg-disabled`(neutral-2 灰底)— disabled state 視覺主要由 bg 承載。

**⚠️ 選擇器覆蓋範圍(2026-07-13 誠實標註 — code 現況,非 uniform)**:disabled state 的兩道視覺處理走**不同選擇器、覆蓋不同 child 類型**,並非對所有 disabled 子一致生效:
- **z-index 降 0**:`[&>*[disabled]]:z-0` + `[&>*:has([disabled])]:z-0` — 認**原生 `[disabled]` 屬性**。覆蓋 Button(原生 `<button disabled>`)、Input / NumberInput(wrapper 內含原生 `<input disabled>`,`:has()` 命中)。
- **border-opaque override**:`[&>*[data-field-mode="disabled"]]` — 認 **Field 家族 wrapper 的 `data-field-mode="disabled"`**。覆蓋所有 Field controls(Select / Input / Combobox / DatePicker…)。
- **覆蓋落差(已知)**:disabled **Select**(桌機自訂 trigger = `<div>`,無原生 `[disabled]`)→ 得 border-opaque 但**不降 z-0**;disabled **Button**(無 `data-field-mode`)→ 降 z-0 但**不得 border-opaque**。要讓兩道處理對所有 disabled 子一致覆蓋需統一兩選擇器(視覺行為改動 → 走設計拍板,非本文件範圍)。

**為什麼用 `--border-opaque` 而非 `--border`**:`--border`(neutral-5 = 15% alpha)會跟 cell bg compositing — 灰底上 composite 略深(物理對比結果)。**`--border-opaque`** semantic token(其 primitive 後盾為 `--color-neutral-5-opaque`,solid #D9D9D9)不分 bg 永遠同色,divider 在 white edit cell 跟 grey disabled cell 上視覺完全一致。

**Token 系統設計**:`--border-opaque` 在 `semantic.css` 新增(grep `--border-opaque:` 查定義行,不寫死行號避免漂移),語意「視覺等同 `--border` 但 alpha-immune」。對齊 [Ant Design `colorBorderSecondary`](https://ant.design/docs/react/customize-theme#seedtoken) solid idiom — Ant 用此 token 在 table 外框 + row divider(non-white bg 場景),跟 input alpha border 視覺層級分。

**為什麼不 override bg**:user 明確要求 disabled cells 有底色(辨識 state)。bg 灰底是 disabled state 的主要視覺載體,FCG context 不應抹除。

**整 row error**:目前 v1 不支援 row-level error(走 cell-level)。未來若需可走 outer border-error wrapper,但 v1 follow Ant 不做([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/space/index.en-US.md#L76-L82))。

## Loading / Empty / 驗證

- Loading:子 control 各自處理(Input loading state / Select loading)
- Empty:N/A(layout primitive,無資料概念)
- 驗證:子 control 自管(form library 透過 Field 處理)
- 「子必 direct child」規則**無 runtime 偵測**——違反(多包 wrapper div)時的症狀是圓角破圖(CSS `[&>*]` 命中 wrapper),見禁止事項 2026-05-04 #2;靠 review + Storybook 目視抓
- a11y 驗證:Storybook a11y addon panel 0 critical violation;Tab 順序 = children DOM 順序

## 邊界案例

- **子高度不一**:容器 `items-stretch`,但 field controls 自帶固定 `h-field-*`,不會被拉齊——混 size 即視覺高低差(故禁止,見禁止事項)
- **某子 disabled、某子 edit**:機制上可行(disabled 子降 z-0 + K12 border 維持 divider,實際覆蓋依 child 類型而異 — 見 K12「選擇器覆蓋範圍」note),但語意一體應一致(見禁止事項);**全組 disabled** 走 K12 canonical(見 States)
- **極窄容器**:無特化處理——固定寬 children(`w-[Xpx]`)溢出容器、`flex-1` children 壓縮;子自管 width 的對價,consumer 自行配置
- **單一 child**:radius 選擇器 `:first-child:not(:last-child)` 不命中,圓角完整保留(等同未包 group,但此時應直接用 Field)

## 世界級對照

| 框架 | 命名 | 機制 | sizing | 子 scope |
|--|--|--|--|--|
| **[Ant Space.Compact](https://ant.design/components/space#spacecompact)** | layout primitive | 負 margin 重疊 + z-index 3 | `size: small/middle/large` (group prop)| Button + 各 form control(限定 list)|
| **[Bootstrap input-group](https://getbootstrap.com/docs/5.3/forms/input-group/)** | CSS class | flexbox + first/last border-radius | group-level sizing,個別 children 不能設 | input/select/btn/text addon |
| **[Chakra Group](https://www.chakra-ui.com/docs/components/group)** | `attached` prop primitive | `attached`+`grow` props | per-child | Input + Addon/Element(InputGroup 已 deprecated v3)|
| **[Mantine `Button.Group`](https://github.com/mantinedev/mantine/blob/82fb128c43f9927c1370a2732cd5aa9e6663ca11/apps/mantine.dev/src/pages/core/button.mdx#L129-L152)** | `Button.Group` + `Button.GroupSection` | 子按鈕直接相鄰接合(不可再包一層)| — | 只限 Button(非按鈕內容用 GroupSection)|

4 家都有接合 idiom,但 Mantine 只限按鈕 → 我們的實作對齊同時涵蓋 form control 的 Ant + Bootstrap 主軸([來源](https://github.com/mantinedev/mantine/blob/82fb128c43f9927c1370a2732cd5aa9e6663ca11/apps/mantine.dev/src/pages/core/button.mdx#L129-L152))。

## 相關

- `../Field/field.spec.md` — FieldGroup(多 Field 垂直堆疊近親,gap 分離)的 home
- `../Button/button-group.tsx` — 命名 idiom 近親(`<X>Group`);但 ButtonGroup 是 **gap 分離**(`flex gap-2`),非 border-collapse 接合,兩者機制不同(無獨立 spec)
- `../Field/field-controls.spec.md` — children(Input / Select / DatePicker 等)共用 Field control 規則
- `../Checkbox/checkbox.spec.md` / `../RadioGroup/radio-group.spec.md` — semantic group 近親(1 question 多 options,非本元件 scope)

## 變更紀錄

- 2026-05-04 v1:Initial。基於 Ant compact-item.ts source verify 訂機制。Filter / Sort 對齊 Ant W-A 子自管 width([來源](https://github.com/ant-design/ant-design/blob/5632e40fceabdbcdfef7e536158aaf404898c867/components/style/compact-item.ts#L30-L58))。
