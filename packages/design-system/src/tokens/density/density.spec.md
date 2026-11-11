<!-- @benchmark-cited: D5 retrofit 2026-05-18 — verified 0 world-class DS claim in body; blanket retract removed. -->

# Density 設計原則

Density 由**兩個獨立維度**構成,並配合一個 convenience attribute 同時控制兩者:

| 維度 | 管的是 | attribute | 範例 |
|------|--------|-----------|------|
| **UI Size** | 元件**高度 / 內距**(Button / Input / SelectionItem / field-height / table-row) | `data-ui-size` | `md`(32px field-height-md)/ `lg`(36px field-height-md) |
| **Layout Space** | 版面**間距 / 外框 padding**(section gutter / dialog body padding / form gap) | `data-layout-space` | `md`(tight gap)/ `lg`(loose gap) |
| **Density**(convenience)| 一鍵同時切兩者 | `data-density` | `md` / `lg` |

## 兩維度為何解耦(世界級對照)

**Carbon Design System**:spacing scale 獨立於 component size([carbondesignsystem.com/elements/spacing](https://carbondesignsystem.com/elements/spacing/overview/))
**GitHub Primer**:8px base unit scale 獨立於 control size([styleguide.github.com/primer](https://styleguide.github.com/primer/support/spacing/))
**Atlassian**:spacing tokens 可單獨消費(partial decouple)([來源](https://unpkg.com/@atlaskit/tokens@20.9.0/dist/es2019/artifacts/themes/atlassian-spacing.js))

**反例**(耦合):若 density 一個開關同時綁 control size + spacing,就無法做到「寬鬆版面 + 標準尺寸控件」這種常見組合,所以本 DS 把兩者拆成兩個 dial。

**我們走 decouple 流派**:解決 Dialog / overlay chrome 的痛點 — header 想要版面間距寬鬆(layout-space=lg),但不要被 button chrome 撐高(ui-size 跟 page 走 md)。

## 預設同步(density convenience)

日常使用:不管兩個維度,直接 `data-density` 一次切兩者:

```html
<html data-theme="light" data-density="md">
```

- **md**(預設):資訊密集的桌面 UI / form-heavy 頁面
- **lg**:元件高度與版面間距都放大一階(例:欄位高 md 32 → lg 36)

`data-density` 內部等同同時設 `data-ui-size` + `data-layout-space` 相同 tier。CSS selectors 同時監聽 `[data-ui-size="lg"], [data-density="lg"]:not([data-ui-size])` 等(見 `uiSize.css` + `layoutSpace.css`)。

### 同一個元素帶兩種屬性

**明寫的單軸屬性勝過 `data-density`**:同一個元素同時帶 `data-density="X"` 與 `data-ui-size="Y"`(或 `data-layout-space="Y"`)時,那一軸取 Y,另一軸取 X。往外找的順序是逐層由內往外:最近一層有寫那一軸(單軸屬性或 `data-density`)的就是答案。

- **為什麼**:`data-density` 是兩軸的便捷開關(本節開頭);單軸屬性是更明確的意圖。2026-11-11 前兩者權重相同、靠後寫的贏,結果只要其中一個是 md 就永遠 md 勝 —— html 已帶 `data-density="md"` 的頁面(`index.html`、Storybook)上,情境 2「單獨切 ui-size」完全沒有作用(稽核 R7-01:控制項高實量 32,應為 36)。
- **寫法**:便捷屬性那一半寫成 `[data-density="…"]:not([data-ui-size])`(版面間距那一軸是 `:not([data-layout-space])`),全部有密度段的檔同一寫法:`uiSize.css`、`layoutSpace.css`、`Sidebar/sidebar.css`、`Tabs/tabs.css`、`DataTable/data-table.css`。
- **JS 端同一條規則**:要在程式裡算「某個元素在哪一檔」時(例:浮層讀觸發點那一區,見「浮層跟觸發點」),用同一個解析順序,不另訂。
- **閘**:`scripts/test-density-subtree-token-parity.mjs` 的同元素雙屬性、整頁解耦、兩層巢狀三類組合(期望值由同檔 `resolveTiers()` 依本節規則算)。

## 解耦用法(canonical 情境)

當需要「版面間距寬鬆(layout-space)+ 控件高度標準(ui-size)」時,**顯式設兩個 attribute**:

### Canonical 情境 1 — Overlay 的 layout-space tier(2026-06-15 重訂)

**核心原則**:浮層(Portal overlay)**預設不鎖**,密度從哪裡來分兩種(見下方「浮層跟觸發點」);只鎖「**有設計理由 + 該元件真的消費到**」的那個 dial,**禁用 `data-density` master switch 鎖浮層**(它連 ui-size 一起鎖 → 內部控件 / 選單 item 對不上觸發點)。**ui-size 永遠不鎖** —— 浮層只決定「版面間距 tier」(layout-space),控件大小交給密度來源。

#### 浮層跟觸發點(2026-11-11 user 定案)

**小浮層跟觸發它的那一區;蓋住整頁的浮層跟整頁。** user 2026-11-11 決策頁「浮層密度」答「跟按鈕」—— 選項原文「跟打開它的按鈕所在的區塊」「對話框、側拉面板這種蓋住整頁的，維持跟整頁。」(【AI 建議、user 選】)。

- **為什麼**:浮層經 Portal 掛到 body,CSS 繼承鏈從 html 起算(M3),拿到的是整頁密度。實測一般密度頁面裡的大密度區塊,sm 下拉按鈕 32 高、打開的選項列 28;反方向 28 / 32(稽核 R7-02)—— 正是本節「對不上觸發點」要避免的事。
- **做法(全 DS 一支)**:`lib/overlay-density.tsx`。各小浮層的 Root 開登記處(`OverlayAnchorScope family=…`)、Trigger / Anchor 把節點登記進來、Content 用 `useTriggerRegionDensity(family, ref)` 從錨點(沒有就觸發點)往外讀兩軸檔位(解析順序 = 上方「同一個元素帶兩種屬性」),當 `data-ui-size` / `data-layout-space` 蓋到 Portal 內容的根元素上;要鎖某一軸的浮層把那一軸寫在後面覆蓋。往外找不到任何宣告時不寫(= 整頁 `:root`)。
  - **登記處一種浮層一個**(Popover / DropdownMenu / HoverCard / Tooltip 各自一個 context,跟 Radix 每一種 primitive 各用自己的 context scope 同一個身分):浮層互相包的時候(DatePicker 單日是 `<Popover><Tooltip><PopoverTrigger>`),Trigger 只登記到同一種浮層的 Root,不會被包在中間的另一種接走。
  - **什麼時候讀**:浮層關著不讀(內容根元素沒掛上就不碰 DOM);根元素掛上去那一刻讀一次(畫面畫出來之前);開著的期間文件裡任何元素的 `data-density` / `data-ui-size` / `data-layout-space` 變了就重讀 —— 區塊密度在浮層開著時被改,浮層跟著變。
  - **錨點是 `virtualRef` 時**(Radix 不畫錨點元素,例:Calendar 示範的 `<PopoverAnchor virtualRef>`):讀 `virtualRef.current` 指到的元素;它是只有量測方法的物件時讀它的 `contextElement`;兩者都不是元素 → 改讀觸發點;連觸發點都沒有 → 不寫(= 整頁)。
  - **【AI 推導】**上面三條是實作邊界的工程答案,不是 user 逐字決定;user 定的只有「跟按鈕」與「蓋住整頁的跟整頁」。
- **世界級**:React Spectrum 的浮層在 Portal 裡再包一層 Provider([Overlay.tsx#L59](https://github.com/adobe/react-spectrum/blob/main/packages/@react-spectrum/overlays/src/Overlay.tsx#L59)),那一層的 scale(medium / large)沒指定時沿用最近一層上層 Provider —— 觸發點所在那一區([Provider.tsx#L57](https://github.com/adobe/react-spectrum/blob/main/packages/@react-spectrum/provider/src/Provider.tsx#L57):`scale = prevContext ? prevContext.scale : autoScale`)。
- **閘**:`scripts/overlay-density-follows-trigger-invariant.mjs`(瀏覽器實量:整頁一般 / 大 × 一般 / 大密度區塊的 sm 下拉,選項列高 = 那一區的 `--field-height-sm` = 觸發點高;Popover 版面間距仍 16)。

| 浮層 | 密度來源 | 鎖 | 理由 |
|------|---------|----|------|
| Popover(含 Select / Combobox / SelectMenu / DatePicker / TimePicker / Coachmark / DataTable 排序·篩選·欄位面板 / AgentPanel 歷史) | 觸發點那一區 | `data-layout-space="md"` | 輕量浮層 → header py-tight 保持精簡(只鎖間距,控制項大小跟觸發點 → 內部 field 控件對齊觸發點)。建在 Popover 上的元件自動繼承這一列 |
| DropdownMenu(含子選單) | 觸發點那一區 | 不鎖 | 不消費 layout-space token(RowSize + py-2);選單 item = field-height-{size},鎖 ui-size 會對不上觸發點。子選單不經 Portal、長在主選單裡,跟主選單同檔 |
| HoverCard | 觸發點那一區 | 不鎖 | 照本節預設「不鎖」(稽核 R7-04 甲:兩份規格說法打架,主規格的預設是繼承;`overlay-chrome-sizing.spec.md` 已改正) |
| Tooltip | 觸發點那一區 | 不鎖 | 目前不消費任何 density / layout-space token(px-3 py-2 寫死);照小浮層同一條規則蓋上檔位,以後內容消費密度 token 時不必再補 |
| Dialog | **整頁** | 不鎖 | 蓋住整頁。layout-space 在本 spec 開頭維度表的「Layout Space」列就寫明管「dialog body padding」,鎖死 = override 自家 dial 自相矛盾;modal 寬鬆需求在 lg 階自然滿足(md 已是 16);button 不撐高由 ui-size 繼承解決。 |
| Sheet | **整頁** | 不鎖 | 蓋住整頁的側板;螢幕變小時常駐側板會 responsive 變 Sheet,若 Sheet 鎖 tier 而側板繼承 page → 切換瞬間跳 mode,不一致 |
| FileViewer | **整頁** | 不鎖 | 全螢幕 chrome 殼。原 `lockDensity="lg"` 只鎖在兩個 ChromeHeader、沒鎖 body → header(px-loose@lg=24)與 body(px-loose@page=16)左緣不對齊;移除 → 全 surface 同密度 |

**Tier alignment**:每個 overlay 的 layout-space tier 決定 header 高度(Dialog lg → title 24 + py-tight 16×2 = 56;Popover 鎖 md → 12 + 21 + 12 = 45,外加 1px 底線)。「對齊 `--chrome-header-height`」是**同 tier 內**成立(Popover 45 ≠ Dialog 56 ≠ chrome 48 本就允許,各宣告各 tier),非跨 page 強制。詳 `patterns/header-canonical/header-canonical.spec.md` A 家族。

**標頭高各跟哪一軸**(稽核 R7-09 第 (2) 項;寫明,不再是未定義):外框標頭 `--chrome-header-height`(48 / 56)是**控制項大小這一軸**的共用刻度(宣告在 `uiSize.css`,跟 `data-ui-size` 走;它要容納同一軸的 md 按鈕,所以跟控制項一起變);浮層標頭 = 標題行高 + 2 × `--layout-space-tight`,是**版面間距這一軸**。兩軸不同檔時(例:`data-ui-size="lg"` + `data-layout-space="md"`)外框標頭 56、浮層標頭 45 —— 各照各的軸算,這是設計,不是誤差。

**為何不鎖 ui-size**:field-height token 隨 density 變(md 28/32/36 → lg 32/36/40);鎖 ui-size=md 會把浮層內控件 / 選單 item 釘死 md-scale,對不上 lg 觸發點。decouple = 只鎖版面間距、控件跟密度來源 —— 間距刻度與控件尺寸本來就是兩把尺。

### Canonical 情境 2 — 單獨切 ui-size

Product demo / stakeholder 觀感測試:

```ts
document.documentElement.setAttribute('data-ui-size', 'lg')
// layout-space 仍 md — 看大 control 在密集 layout 裡是否合用
```

### Canonical 情境 3 — 局部覆蓋

某 region 需要不同密度:

```tsx
<div data-layout-space="lg">
  {/* 這個 region layout 寬鬆,control 跟外層 page 走 */}
</div>
```

**保證:區塊裡每一顆 token = 整頁直接設成那個密度的值**(逐 token 相等;兩個方向都算 —— 大密度頁面裡鎖回一般密度、一般密度頁面裡局部放大)。兩種寫法會破這條,`tokens/uiSize/uiSize.css` 各有一段處理:
- 有大密度覆寫的值,「鎖回一般密度」段要有它(閘 `token-creation-invariant.mjs` C5);
- 用 `var()` 由別的 token 組出來的值(例:側欄收合寬 `--sidebar-width-icon`)不能只寫在 `:root` —— 瀏覽器在宣告它的元素上就把 `var()` 代換掉,子孫繼承代換後的結果([W3C CSS Custom Properties Level 1](https://www.w3.org/TR/css-variables-1/#defining-variables):Computed value =「specified value with variables substituted」),區塊換密度時它不會重算。所以這類值住「衍生值」段,宣告在 `:root` 與每個換密度的元素上。
閘 `scripts/test-density-subtree-token-parity.mjs` 在瀏覽器裡實算 32 種組合(單一屬性區塊、同元素雙屬性、整頁解耦、兩個單軸屬性 = 便捷屬性、兩層巢狀)× 對外彙總檔的全部 token。

## 動態切換

```ts
// 一鍵(兩維度同步)
document.documentElement.setAttribute('data-density', 'lg')

// 解耦(獨立控制)
document.documentElement.setAttribute('data-ui-size', 'lg')
document.documentElement.setAttribute('data-layout-space', 'md')
```

## 判斷流程(寫新元件時)

1. **元件是否有自己特定 density**?
   - 否(繼承 page) → 不設任何 `data-*-size` attribute,所有 token 由 `html[data-density]` 繼承
   - 是 → 看 Q2

2. **需要 layout 跟 control 同步 density 嗎**?
   - 是 → 用 `data-density="X"`(convenience)
   - 否(想解耦) → 明示 `data-layout-space="X"` + / 或 `data-ui-size="Y"`

3. **Portal 逃逸 subtree?**(Dialog / Popover / Sheet / DropdownMenu / Tooltip / HoverCard)
   - density 設在 `html` root 時,CSS cascade 會傳到 portal 出去的內容(portal 掛 body,仍在 html 底下)。
   - density 設在「中層 div」(區塊)時 portal 逃逸該 subtree(M3 邊界)→ **小浮層用 `lib/overlay-density.tsx` 把觸發點那一區的檔位蓋回內容根元素**(情境 1「浮層跟觸發點」);蓋住整頁的浮層刻意跟整頁,不接。新做小浮層必接這支,不另寫一份。
   - **鎖浮層 density/layout-space = 刻意覆蓋成某 tier,需設計理由(見情境 1 表)**,非 Portal 必要;且只鎖該元件真正消費的 dial。

## 消費者清單

| 元件 | attribute 設置 | 用法理由 |
|------|---------------|---------|
| Dialog | **無(跟整頁,2026-06-16)** | layout-space 定義即管 dialog body padding → 鎖 = override 自家 dial 自相矛盾;header 隨 page md=48 / lg=56 |
| Sheet | 無(跟整頁) | 側板;responsive 會跟常駐側板互換,不能跳 mode |
| Popover / Coachmark | `data-layout-space="md"`(2026-06-15)+ 觸發點那一區的 `data-ui-size`(2026-11-11) | 輕量;header py-tight 精簡;控制項大小跟觸發點 → 內部控件對齊觸發點。Coachmark 建在 Popover 上自動繼承 |
| DropdownMenu | 觸發點那一區的兩軸(2026-11-11) | 不消費 layout-space token;鎖 ui-size 會讓 menu item(field-height-{size})對不上觸發點 |
| HoverCard | 觸發點那一區的兩軸(2026-11-11) | 不鎖(R7-04 甲) |
| Tooltip | 觸發點那一區的兩軸(2026-11-11) | 目前不消費任何 density/layout-space token |
| FileViewer | 無(跟整頁,2026-06-15) | 全螢幕 chrome 殼;原 lockDensity 只鎖 header 造成左緣不對齊 → 移除 |
| Sidebar | 無(繼承所在位置) | inline chrome(非 Portal 逃逸),跟隨所在那一區;size="md" 在 density="lg" 下自動變 36px row(見 sidebar.spec.md)|

**邊界:Portal overlay 在任意密度組合下**——小浮層的檔位來自觸發點那一區(整頁 lg、區塊 md 時就是 md,反之亦然);Popover / Coachmark 再把 layout-space 鎖回 md(header 精簡),控制項大小照觸發點。Dialog / Sheet / FileViewer 跟整頁(不鎖)→ md 16 / lg 24 padding 隨 page。皆透過 `layoutSpace.css` / `uiSize.css`「鎖回一般密度」段的 `[data-layout-space="md"]` / `[data-ui-size="md"]` 選擇器與大密度段在任意 page density 上正確解析(行號會位移,一律寫宣告名)。

## Anti-patterns(禁止)

- ❌ 元件同時設 `data-density` + `data-ui-size` 表達「兩軸同檔」(重複;要解耦就只寫兩個單軸屬性)。真的同時出現時以單軸屬性為準(「同一個元素帶兩種屬性」),不是未定義
- ❌ **用 `data-density` master switch 鎖浮層**(連 ui-size 一起鎖 → 內部控件 / 選單 item 對不上觸發點)。只鎖該元件真正消費的 dial(見情境 1 表)
- ❌ **把 density/layout-space lock 設在 header primitive(ChromeHeader / SurfaceHeader)而非 surface 根**——header 鎖、body 沒鎖 → 左緣不對齊(FileViewer 圖二 bug)。lock 一律放 surface 根容器
- ❌ 為了追求表面一致性硬把 Dialog button 綁 lg ui-size(犧牲 header 高度 / strapline 彈性)
- ❌ **鎖 Dialog 的 layout-space**(2026-06-16 定論)—— 本 spec 開頭維度表「Layout Space」列寫明 layout-space 就管「dialog body padding」,鎖 Dialog = 令自家 dial 對它點名要管的對象失效 = 自相矛盾。modal 寬鬆需求在 lg 階自然滿足(md 已是 16),不靠鎖。Popover/Coachmark 鎖 md 是另一回事(空間效率、消費 layout-space token、且為非阻斷錨定浮層)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `coachmark.spec.md`
- `dropdown-menu.spec.md`
- `file-viewer.spec.md`
- `header-canonical.spec.md`
- `overlay-chrome-sizing.spec.md`
