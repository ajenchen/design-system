---
component: InfoTooltip
family: self-contained
traits: []
variants: {}
sizes:
  sm: { when: "在 sm 列裡(跟著列自動,不用傳)—— 圖示 16" }
  md: { when: "預設:一般字級 text-body 旁(欄位標籤、設定列標題、md 列、列外的一般文字)—— 圖示 16" }
  lg: { when: "text-body-lg 旁(lg 列裡自動;列外放在 text-body-lg 以上的標題旁才要傳)—— 圖示 20" }
benchmark:
  - Wix Design System InfoIcon: dev.wix.com/docs/wix-design-system/components/form/info-icon-component
  - Fluent UI InfoLabel / InfoButton: raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-infolabel/stories/src/InfoLabel/InfoLabelDescription.md
  - Adobe React Spectrum ContextualHelp: react-spectrum.adobe.com/react-spectrum/ContextualHelp.html
  - IBM Carbon Toggletip: carbondesignsystem.com/components/toggletip/usage/
  - Elastic EUI EuiIconTip: eui.elastic.co/docs/components/display/tooltip/
---

# InfoTooltip 設計原則

## 定位

**ⓘ 說明圖示**:一顆淡色的 ⓘ,滑過或用 Tab 聚焦時,用 Tooltip 顯示一句補充說明。點下去不做事。

**Layout Family**:非上述 family —— self-contained primitive(一顆可聚焦的圖示 + 浮出說明,沒有 slot 結構;放進列或標題時由宿主排版)。

**實作基礎**:`<button type="button">` 包 lucide `Info` 圖示,外面是 DS `Tooltip`(`../Tooltip/tooltip.spec.md`;滑過與 Tab 聚焦都會開,同檔「A11y 預設」)。原本寫在 `FieldLabel` 裡(`../Field/field.spec.md`「FieldLabel `info` icon」),2026-11-27 抽成公開元件,`FieldLabel info` 改用它,長相與行為不變。

**為什麼公開**:user 2026-11-27 決策頁(0.1.0-beta.152)第 8 題選「甲 公開說明圖示元件」。之前的寫法是「不另做公開元件,在既有圖示槽位換成 info 圖示、掛 Tooltip」,出處是 user 2026-11-26 第五輪決策卡 C8 留言(逐字,問句):「不用特別抽出來吧？可以放 icon的地方都有 slot, 然後想要放info的地方就把 icon變成info icon再使其hover會有 tooltip就可以了吧？」—— 但公開零件做不出來:能聚焦的 Button 滑過上底色、手形,圖示本身不能聚焦(決策頁第 8 題的現況說明)。本元件就是 C8 要的「換成 info 圖示、滑過出說明」,只是把「要能聚焦」包進元件裡,沒有新長相。

**設計定位**:**給資訊的觸發處**(`../../../ds-canonical/references/hit-area-canonical.md` 三-1),**不是**行內動作 —— 只借行內動作「顏色退後、滑過深一階」的長相,不套 `../../patterns/element-anatomy/inline-action.spec.md` 的「必須手形」(那條給清除、顯示密碼這類按下去會做事的鈕)。

**世界級**:都有獨立的說明元件 —— Wix「The `<InfoIcon/>` provides additional information when hovering over the icon. It's used in multiple components, and sometimes by itself, next to various actions or features.」(<https://dev.wix.com/docs/wix-design-system/components/form/info-icon-component>);Fluent「An InfoLabel is a Label with an InfoButton at the end, properly handling layout and accessibility properties.」(<https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-infolabel/stories/src/InfoLabel/InfoLabelDescription.md>);Adobe Spectrum「Contextual help shows a user extra information about the state of an adjacent component, or a total view.」(<https://react-spectrum.adobe.com/react-spectrum/ContextualHelp.html>);Carbon Toggletip「can be used on various part of the UI including, but not limited to, headers」(<https://carbondesignsystem.com/components/toggletip/usage/>)。差別:Fluent / Spectrum / Carbon 是點了才開的浮層,本 DS 照既有的「滑過 / 聚焦出 Tooltip」;Wix 同本 DS(同一頁 `content`:「Sets the content of the tooltip that's shown when the icon is hovered or focused.」,<https://dev.wix.com/docs/wix-design-system/components/form/info-icon-component>)。

**命名**(`../../../ds-canonical/references/naming-conventions.md` 三重測試)【AI 推導】:(1) 對齊既有詞彙:`FieldLabel` 的 `info` prop + DS 的 `Tooltip`;(2) 世界級用「Info」指這個東西:Wix `InfoIcon`(<https://dev.wix.com/docs/wix-design-system/components/form/info-icon-component>)、Fluent `InfoButton`(<https://raw.githubusercontent.com/microsoft/fluentui/master/packages/react-components/react-infolabel/stories/src/InfoLabel/InfoLabelDescription.md>);(3) 不撞名:不叫 `InfoIcon` —— lucide-react 自己就匯出 `InfoIcon`,產品同時 import 兩個會撞,而且 DS 的 `…Icon`(`ItemIcon`)指的是不可互動的圖示槽位;不叫 `InfoButton` —— DS 的 Button 是「按下去會做事」,這顆點了不做事。

## 何時用

- **設定列標題旁**:「自動封存已完成任務」旁放 ⓘ,說明「完成滿 30 天的任務會移到封存區」。
- **區塊標題旁**:「帳單資訊」標題旁放 ⓘ,說明「每月 1 號結算上個月用量」。
- **表單以外的單一數值旁**:儀表板「本月用量」旁放 ⓘ,說明怎麼算。
- 欄位標籤旁不用自己放:`<FieldLabel info="…">` 已內建(就是本元件)。

## 何時不用

| 情境 | 改用 | 原因 |
|------|------|------|
| 欄位標籤旁 | `<FieldLabel info>` | 已內建本元件,自己再放會重複 |
| 說明要兩句以上、要放連結或圖 | 欄位說明(`FieldDescription`)、頁面文字、`HoverCard` | Tooltip 只放一句、不可互動(`../Tooltip/tooltip.spec.md`「何時不用」「內容完整性」) |
| 不看就會出錯的資訊 | 直接寫在畫面上(欄位說明、`Notice`) | 藏在滑過裡的字容易被略過;EUI:「When possible, surface explanations inline within the UI, and only hide them behind a EuiIconTip as a last resort.」(<https://eui.elastic.co/docs/components/display/tooltip/>) |
| 按下去要做事(開說明文件、展開面板) | `Button iconOnly` | 本元件點了不做事 |

## 尺寸

回 user 2026-11-27 決策頁第 8 題留言(逐字,問句):「這個元件的尺寸可以按照規範自動預設變成合適的大小？」—— **可以,大部分情境不用傳**。ⓘ 的大小照 icon tier(`../../tokens/uiSize/uiSize.spec.md`「Icon 尺寸 Tier」:text-body 旁 16、text-body-lg 旁 20),由所在情境決定:

- **在列裡**(選單列、清單列、樹、側欄列等 row primitive):跟著那一列的尺寸(sm / md → 16、lg → 20),與列裡的圖示同一個查法(`ICON_SIZE` + `useRowSize`,同 `ItemIcon`;`../../patterns/element-anatomy/item-anatomy.spec.md`)。
- **在欄位標籤裡**:固定 16 —— 標籤字級固定 text-body、不隨欄位尺寸變(`../Field/field-context.ts` `FIELD_TEXT_CLASS`)。
- **其他地方**:預設 md(16),對 DS 的一般字級 text-body。
- **要自己傳的只有一種**:列外、放在 text-body-lg 以上的標題旁 → `size="lg"`(20)。元件讀不到旁邊文字的字級,用猜的會錯【AI 推導】。
- 密度 / ui-size 不改 ⓘ 的大小:icon tier「與全域 density 設定無關」(同上 uiSize.spec.md 段)。

Wix 同樣是兩檔、依旁邊的文字選:「`small` - Use it next to small and tiny texts.」「`medium` Use it next to headings and medium texts.」(<https://dev.wix.com/docs/wix-design-system/components/form/info-icon-component>)。

## 長相與互動

- **顏色**:平常 `fg-muted`、滑過 `fg-secondary`(深一階 = 告訴你「這裡有說明可看」);**不上底色**(hit-area-canonical.md 三-1)。
- **游標一般箭頭**(`cursor-default`):點下去不做事(Radix Tooltip 點擊只會收起說明),手形會讓人以為點了有作用。全域 `base.css` 讓所有 `<button>` 預設手形,所以要明寫 `cursor-default`,只刪 `cursor-pointer` 蓋不掉。〔2026-09-26 由手形改箭頭;user 條件式同意「I 可以從手形改掉，若改掉更合理的話」,AI 研究後提出、user 選「同意,照清單寫入」〕
- **命中區 = 圖示本身**(16 / 20),不另外撐大(hit-area-canonical.md「命中區 = 可視形狀」)。
- **停用**:本元件不收 `disabled`;宿主停用時不渲染它(同 `FieldLabel`:停用欄位不出 ⓘ,`../Field/field.spec.md`「FieldLabel `info` icon」)。

## A11y 預設

- `<button type="button">`:Tab 走得到,聚焦時開說明(`../Tooltip/tooltip.spec.md`「A11y 預設」);焦點框用全域 `:focus-visible`。
- **讀屏名稱 = 說明文字本身**(`aria-label={content}`):讀屏念到這顆時直接念出說明;圖示 `aria-hidden`。
- 放在 `<label>` 外面(HTML 不准 `<label>` 含其他可被標籤的元素):`FieldLabel` 的做法見 `../Field/field.spec.md`「FieldLabel `info` icon」。

## 禁止事項

- ❌ 自己手刻 `<button><Info /></button>` + Tooltip:長相、游標、讀屏名稱會漂移 —— 用本元件
- ❌ 拿 `Button iconOnly` 當說明圖示:滑過上底色、手形,跟「點了不做事」不合
- ❌ 只放一顆不能聚焦的圖示掛 Tooltip:鍵盤永遠打不開說明
- ❌ 說明寫兩句以上或放連結:改用欄位說明或 `HoverCard`(見「何時不用」)

## 相關

- `../Tooltip/tooltip.spec.md` — 浮出說明的元件與一句話規則
- `../Field/field.spec.md` — `FieldLabel info`(本元件的第一個使用處)
- `../../tokens/uiSize/uiSize.spec.md` — Icon 尺寸 Tier
- `../../../ds-canonical/references/hit-area-canonical.md` — 三-1 給資訊的觸發處
