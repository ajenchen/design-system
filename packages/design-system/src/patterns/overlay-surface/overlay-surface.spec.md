---
pattern: overlay-surface
internal: true
family: composite  # composes SurfaceHeader/Body/Footer,非 Family 1-4 row element
scope: overlay shell sub-components (SurfaceHeader / SurfaceBody / SurfaceFooter + padding SSOT) — DS-internal consumer only(Dialog / Sheet / Popover / Coachmark wrap;HoverCard 未納入,見「何時不用」)
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Overlay Surface 設計原則

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> Dialog / Sheet / Popover / Coachmark / HoverCard 等 overlay 元件 structure 跨 pattern SSOT。定義 SurfaceHeader / SurfaceBody / SurfaceFooter sub-components + v5 `data-unbounded` slot trick + padding-based header canonical + dismiss size canonical。多 overlay 元件消費,scope 本質 > 單一 pattern。

## 定位

Dialog 和 Popover 的**結構化 sub-components 共用 primitive**——提供 Header / Body / Footer 的統一 padding + 分隔線語言。本 pattern 是 **SSOT**,Dialog 與 Popover 不自寫 padding token。

**Layout Family**:非上述 family — structural container primitive(不是 element-level layout,是 surface-level 分區)。

**Consumers**:`Dialog` / `Sheet`(直接消費 `SurfaceHeader` / `SurfaceFooter`,body 走 ScrollArea canonical 見下)、`Popover`(直接消費 `SurfaceHeader` / `SurfaceFooter`,PopoverBody 直接 wrap `SurfaceBody` bare — 見「Popover 例外」);`Coachmark` 經 `PopoverHeader` wrapper、`DatePicker` / `TimePicker` 直接消費 `SurfaceFooter`、DataTable 篩選/排序面板經 raw `SurfaceHeader` 間接消費。未來任何其他「elevation-200 浮層」(如 Drawer)的結構化 sub-components 都應消費本 primitive。

---

## 規則

### 三個部位的機械把手(`data-slot`,2026-09-17 補)

`SurfaceHeader` / `SurfaceBody` / `SurfaceFooter` 的根節點各帶一個固定 attribute:
`data-slot="surface-header"` / `"surface-body"` / `"surface-footer"`。它是**給機械閘與稽核腳本用的定位點**,
不是樣式 hook,也不是 consumer 該依賴的 API;`{...props}` 在它後面,consumer 真要覆寫仍覆寫得掉。

**為什麼需要**:本檔的 invariant 幾乎都是「某個部位相對另一個部位」的幾何關係(列前緣 vs header 標題、
footer 按鈕左緣 vs header 標題),閘要量就得先指得到那三個部位。2026-09-17 錨:
`scripts/overlay-list-as-region-invariant.mjs` 原本寫 `[data-slot="popover-title"]` 等三個選擇器,
全 DS grep 起來**一個都不存在**(當時整包只有 `tabs-list` 一個 `data-slot`),等於三個死選擇器
靠最後的 `h2` 兜著才沒變成空綠。同一天補上這三個真 handle,並給該閘加了「一個面板都沒量到就算紅」的地板。

對齊 shadcn/ui 的 `data-slot` 慣例(每個 sub-part 一個穩定 attribute)與 Radix 的 `data-*` part 契約。

### SurfaceHeader
- 根節點帶 `data-slot="surface-header"`(column mode 與單列 mode 兩個分支都帶)
- `border-b border-divider`(上下分隔;**例外**:`withTabs` / `tabsSlot` 時撤 border-b,由 tabs underline 接管 paint,`tabsSlot` 並自動切 column mode — 契約 SSOT 見 `patterns/header-canonical/header-canonical.spec.md` W1 / W2)
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- `flex items-center gap-2 shrink-0`(不被 flex-grow 壓縮)

### SurfaceBody
- 根節點帶 `data-slot="surface-body"`
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- **永遠套 `flex-1 min-h-0 overflow-y-auto`**(viewport-aware scroll:視窗太小時 body 內捲動;非 flex-col parent 內 flex-1/min-h-0 為 no-op,backward compat)。2026-05-31 infra-audit 修:原寫「無額外 flex 屬性」與 code(overlay-surface.tsx:183 恆套)矛盾。consumer 依浮層類型:
- **Focus ownership**:SurfaceBody 不預設 `tabIndex`——短內容時它不是 scroll region,一律塞進 sequential focus order 會製造多餘 tab stop。當 bare SurfaceBody 在定高/viewport 壓縮下**實際 overflow**時,consumer 必須傳 `tabIndex={0}` + `role="region"` + 語意明確的 `aria-label`;SurfaceBody runtime 內建 inset DS focus ring。`BodyScroll` story 的 play assertion 機械驗證該具名節點確實 overflow 且可聚焦。Dialog / Sheet 正式 consumer 仍優先走下節 ScrollArea canonical。
  - **Popover**:多數 bare consume,padding 即是總 padding
  - **Dialog / Sheet**:consumer **不直接 wrap SurfaceBody**——走 ScrollArea canonical(下節),padding 搬到 ScrollArea viewport 內層 div
- **邊界**:空 children → 不渲染 placeholder、無最小高度(定高浮層內仍被 `flex-1` 撐滿剩餘空間);viewport 極小 → 見「Viewport-aware scroll chain invariant」節(body 內捲動);loading / error / empty 屬 consumer 內容層職責,非本 structural pattern(見 `dialog.spec.md`「狀態處理的職責邊界」)

---

## Body overflow canonical(Dialog / Sheet 必用 ScrollArea)

**規則**:Dialog / Sheet 的 body 會 viewport-fill + 長內容需捲動時,**必須用 `<ScrollArea>` wrap**,禁止自寫 `overflow-y-auto` / `overflow-auto`。

**Rationale**:
- Native scrollbar 跨 OS 不一致(macOS overlay / Windows 永遠吃 ~17px 寬度)——Dialog / Sheet 內容會因 OS 不同跑版
- ScrollArea(Radix primitive)用自建 overlay 捲軸 → **跨 OS 一致不吃寬度**,捲動時浮現
- SSOT 見 `components/ScrollArea/scroll-area.spec.md`「何時用」已列明「Sheet / Dialog body 太長」

**實作模板**:
```tsx
// DialogBody / SheetBody 內部:
<ScrollArea className="flex-1 min-h-0">
  <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)] pb-[var(--layout-space-bottom)]">
    {children}
  </div>
</ScrollArea>
```

- `flex-1 min-h-0` → 撐滿 Content 剩餘高度(min-h-0 防止 flex child 撐破 container)
- Padding 搬進 ScrollArea viewport 內的 inner div(因 ScrollArea Root 自己是 `overflow-hidden`,padding 應在捲動內容上)
- `pb-bottom` 保留 Dialog / Sheet「大容器底部多一拍」的 canonical

**Popover 例外**:Popover 無 viewport-fill、內容預期短,PopoverBody 直接消費 SurfaceBody bare;若未來有長內容 Popover consumer,同樣應 wrap ScrollArea。

**Coachmark 例外**:Coachmark 內容短(media + 2 行 title/description),不設計 body 捲動;不適用本規則。

---

## List-as-region in overlay body(2026-05-01 canonical,取代 v4 flush API)

當 overlay body(Dialog / Sheet / Popover)**內容是一個 unbounded list**(contact picker / settings menu / command palette / nav)時 — body 不該有 chrome padding,讓 list 自管視覺節奏。

**判定條件(唯一)**:body 撤掉 chrome padding(`!px-0 !pt-0 !pb-0`)+ list outer wrapper 自帶 `py-2` + item 自帶 `px-loose`。三件事全成立即是 List-as-region。**item 用不用 `MenuItem`、有沒有 hover 底色,都不是判定條件** —— hover / focus / selected 屬 state 視覺,跟隨永久視覺層分類,不獨立觸發分類(同向旁證:`../element-anatomy/item-anatomy.spec.md`「連續 item 貼邊合法性」段落的 state-follows-permanent-layer 原則;該段本身管的是相鄰 item 的 gap,不是本判定條件,故只作旁證不作條文)。

### 為什麼**不**做成 body variant(`flush`)

2026-05-01 移除 `<DialogBody flush>` / `<SheetBody flush>` / `<PopoverBody flush>` variant。原因:

1. **Variant 不解決底層脆弱**:flush 只省一行 chrome padding override;consumer 仍要管 list outer `py-2` + item `px-loose rounded-md` — 加 1 row search/banner 就破功(body 反而沒 chrome padding,更難排版)。
2. **世界級主流不做 universal flush**:Material M3 / Atlassian Dialog / Mantine Modal / shadcn Dialog 都讓 consumer 用 className override 處理。Polaris 有 flush API 但 scope 極窄(只 ResourceList in Modal)。Mainstream 把這個 case 歸 consumer 自管。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
3. **Single API surface**:body 一律 chrome padded,list-only 場景用 `className="!px-0 !pt-0 !pb-0"` override + 自管 list outer wrapper — surface 概念清楚,不雙路徑。

### Canonical pattern

```tsx
<DialogBody className="!px-0 !pt-0 !pb-0">    {/* body 撤 chrome padding */}
  <div className="py-2">                       {/* list outer wrapper:menu group 8px breathing */}
    {items.map(item => (
      <MenuItem key={item.id} className="px-[var(--layout-space-loose)]">{item.label}</MenuItem>
      // Family 2 row 請直接消費 item-anatomy primitives；utility 組合由其 source 擁有。
    ))}
  </div>
</DialogBody>
```

**3 條 invariant**(unique 解):
1. **Item 自帶 `px-loose`**:item 水平 padding 由 item 自己承擔,body 的 chrome padding 撤為 0
2. **列的最前緣對齊 header title**:item 的 padding-box 左緣 = chrome `px-loose` 起點 = header title 左緣 X 軸對齊。
   **對齊的是列的前緣,不是文字** —— 列有前綴(勾選框 / icon / 頭像)時,文字自然被前綴推開,那是對的。
   依據:`../element-anatomy/item-anatomy.spec.md:423`(content 槽佔剩餘空間,沒有自己的 x 錨點)、
   `:665`(label x 受前綴尺寸影響,對齊只在同 group 內成立)、`:671`(跨 group 永不強求)、
   `:677`(為了讓文字齊左而改前綴尺寸 = 錯誤示範)。同一條線的 footer 版本見下方「Footer px」段,
   對齊的同樣是按鈕左緣而非按鈕文字。
   **唯一要客製的就是列的水平內距**:選單脈絡預設 `px-3`(12px,= `tokens/uiSize/uiSize.css` 的 `--field-px`)
   → 浮層裡換成 `px-loose`(16px)。除此之外不改列的任何幾何。
3. **若 item 有 hover / selected 底色**:該底色必鋪滿 chrome 內邊,且 content 離底色邊緣 ≥ loose(item `px-loose rounded-md` 即同時滿足)。**底色有無不是 List-as-region 的判定條件** —— 見上方「判定條件(唯一)」

幾何:
```
chrome 邊 ─ hover bg 左邊 ─────── [ loose breathing ] ─────── content 左邊
  (x=0)     (x=0, flush chrome)                           (x=loose, 對齊 header)
```

### 世界級對照(Linear-family canonical;≥5 家) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

| DS | Body padding | Item padding | Hover bg flush chrome? |
|----|---|---|---|
| Linear Cmd+K | 0 | loose | ✓ |
| Notion page list | 0 | loose | ✓ |
| Slack channel list | 0 | loose | ✓ |
| Raycast / Spotlight | 0 | loose | ✓ |
| VS Code Quick Pick | 0 | loose | ✓ |
| Material M3 / Polaris Modal+List | px only | item inset | ✗(另一合法家族,鬆散版)| <!-- @benchmark-unverified -->

本 DS 選 Linear-family。

### When list 上方有 search / banner(multi-row)

list 不再是 body 唯一 region → **不該撤 body chrome padding**(撤了反而 search row 沒呼吸)。直接用預設 `<DialogBody>`(chrome padded),list 自管 outer wrapper。

```tsx
<DialogBody>  {/* 預設 chrome padding */}
  <Input search />                              {/* search row */}
  <div className="mt-[var(--layout-space-tight)] py-2 -mx-[var(--layout-space-loose)]">  {/* list outer:撤 body 水平 padding 讓 item flush chrome */}
    {items.map(...)}
  </div>
</DialogBody>
```

(此 case 罕見,優先考慮:這個 flow 該用 `Combobox` / `SelectMenu` 而非 Dialog)

### Menu 移植到 Dialog body(short text options / single-click commit)

用 `MenuItem` primitive,不自刻 `<button>` hand-craft:

```tsx
<DialogBody className="!px-0 !pt-0 !pb-0">
  <div className="py-2">
    {options.map(o => (
      // MenuItem 預設 px-3 → className override 為 px-loose 對齊 dialog header
      <MenuItem key={o.value} className="px-[var(--layout-space-loose)]" onSelect={...}>
        {o.label}
      </MenuItem>
    ))}
  </div>
</DialogBody>
```

**何時該用 MenuItem vs hand-craft**:
| 情境 | 選 | 理由 |
|------|----|------|
| 純文字 / icon + label 選項(scanning mode)| MenuItem | Family 1 menu rhythm |
| avatar + title + description(reading mode)| hand-craft Family 2 結構 | MenuItem 是 scanning typography |
| 要做 `<Command>` 搜尋 | SelectMenu(cmdk-based)| dialog 內用獨立 primitive |

**更高層設計判斷**:
- 單擊即生效 → `DropdownMenu` / `SelectMenu`(浮層),**不用 Dialog**
- 暫存選擇 + Save CTA 才 commit → `Dialog + MenuItem`(本 pattern)

### 預設:浮層的 body 是一份可選清單 → 走選單列(2026-09-17 user 拍板)

**判準**:Dialog / Sheet / Popover 的 body **主體就是一份可以選的清單**時,**預設**走 List-as-region + 選單列,
不要另外用表單控制項(`CheckboxGroup` + 裸 `Checkbox`)自組。

- **為什麼**:同一個「從清單裡挑」的互動,不該因為容器是下拉選單還是浮層就長得不一樣。
  `DropdownMenu` 已經是選單列(`dropdown-menu.tsx:370`),DataTable 的欄位顯示面板也已經是
  (`data-table-column-visibility-panel.tsx:196`)—— 篩選面板原本是唯一的例外,是漂移不是設計。
- **點一下就生效、還是要按 CTA 才 commit,不影響本條**:那是上一段「更高層設計判斷」在決定容器,
  跟列用什麼元件是兩個獨立的軸。
- **容器必須提供鍵盤與 listbox 結構**:裸用 `MenuItem` 是 `components/Menu/menu-item.spec.md`
  「直接在 JSX 中用 `<MenuItem>` ❌ 禁止」明文禁止的。用 `Command`(cmdk)包起來 ——
  它自帶方向鍵導覽與 `role="listbox"`,`SelectMenu` 內部走的就是這條路;
  `CommandGroup` 自帶的 `py-2` 正好就是本 pattern 要的上下呼吸。
  canonical 實作見 `components/Popover/popover.stories.tsx` 的 `StatusFilterPanel`。
- **不適用**:那些列**根本不能被選**時(例如成員名單、通知設定這種展示列)—— 那不是選單,
  走上面「何時該用 MenuItem vs hand-craft」表。**能被選的列不存在「reading mode」的情況**。

### M11 state walk hover 檢查(**僅當 item 有 hover / selected 底色時適用**;三題必同時 ✓)

1. hover bg 左右邊 = chrome 邊?
2. content 左邊 = header title 左邊?
3. content 離 hover bg 邊 ≥ loose?

item 沒有底色時只驗第 2 題(content 對齊 header title);沒有底色**不構成** List-as-region 的失格條件。

### ❌ 禁止

- 重新引入 `flush` variant prop(或 `variant="list"` / `density="list"`)
- Item `px=0` 讓 content 直接觸 hover bg 邊(content-inside-bg breathing 違反)
- list outer 重複 `py-4` + item 各自 `py-2`(過鬆)
- 不對稱 padding 無 rationale

### 底部區域:按鈕列 vs 列式(2026-09-17 codify,判準 owner)

浮層 / 面板的底部固定區有**兩種**,選哪一種只看一題:

> **底部內容需要鋪滿容器兩側嗎**(整條可點、整條有滑過底色)?
> **要 → 列式 footer**(左右內距 0,內容自己帶 gutter,沿用 MenuGroup 的 `py-2` 節奏)
> **不要 → `SurfaceFooter`**(內容左緣對齊**這個浮層的內容左邊界**,見下方「要對齊誰」)

判準是「**誰負責左右 gutter**」—— 跟 `../element-anatomy/item-anatomy.spec.md`「Token: `--item-px`」是同一條線:
列自己帶 gutter 所以容器給 0;按鈕自己沒有 gutter 所以容器給 `loose`。兩者相加就是 2026-09-17 那次 28px 的病。同一條線也管 body:FileItem `surface="upload-manager"` 的上傳列可點時整列滑過、底色鋪到面板左右邊 → 列自帶 `loose`、面板 body 左右 0(2026-09-25 待辦總帳 B12,推翻 06-03 的「左右交給面板」;owner `../../components/FileItem/file-item.spec.md`「upload-manager 浮層面板 composition」)。

| | `SurfaceFooter` | 列式 footer |
|---|---|---|
| 典型內容 | 有邊界的按鈕(取消 / 儲存 / 今天 / 確定 / **全選 / 重設 / 套用**) | 一整列(Sidebar 的帳號入口、選單的常駐列) |
| 左右內距 | 對齊內容左邊界:預設 `px-[var(--layout-space-loose)]`;**裝在選單裡(內容左邊界由列定義)覆寫成 `px-[var(--item-px,var(--field-px))]`**(見下方) | **0** |
| 上下內距 | `py-[var(--layout-space-tight)]` | `py-2`(= `MenuGroup` 節奏) |
| 排版 | `flex items-center justify-end gap-2`(單側時用 `justify-between`,先例 `components/Coachmark/coachmark.tsx`)| 直排全寬 |
| 實作 | 本檔 `SurfaceFooter`(Dialog / Sheet / Popover footer 全是純轉發)| `components/Sidebar/sidebar.tsx` 的 `SidebarFooter`、`components/Menu/menu-item.tsx` 的 `MenuFooter` |

**選取類浮層的 footer 內容順序**(2026-09-17 user 拍板):左側依序放**操作選取**的按鈕(全選 / 取消全選、重設),
右側放**提交**類(套用);有哪個功能才渲哪顆,沒有就不渲。canonical 實作見
`components/SelectMenu/select-menu.tsx` 的多選 footer。

**`SurfaceFooter` 的左右內距要對齊誰:對齊「這個浮層的內容左邊界」**(2026-09-17 立、2026-09-18 依全庫實測收斂)。

規則只有一條句子:**footer 的內容左緣 = 同一個浮層裡內容的左邊界**。誰定義那條左邊界,依這個順序看 ——

| 浮層裡最上面那疊是什麼 | 左邊界由誰定義 | footer 寫法 | 實測 |
|---|---|---|---|
| 一整排列(選單 / list-as-region) | **列**(列自己帶 `--item-px`) | `px-[var(--item-px,var(--field-px))]` | SelectMenu / Combobox / PeoplePicker / DataTable 篩選選單,共 41 個面板,差 0 |
| `SurfaceBody`(一般內文) | **body** 的內容左緣 | 不覆寫(預設 `loose`) | Coachmark / Popover / overlay-surface 樣張,共 12 個,差 0 |
| 日曆格線 | **第一格**的左緣 | 不覆寫(預設 `loose`) | DatePicker 6 個,差 0 |
| 只有 `SurfaceHeader` | **標題**的左緣 | 不覆寫(預設 `loose`) | Dialog / Sheet / AgentPanel 決策卡,共 10 個,差 0 |
| 以上皆無(欄位數字**置中**、欄本身零內距) | **沒有左邊界可對齊** | 由面板自訂,但**必須是既有 layout token**,不得寫死數字 | TimePicker 27 個(見下方例外) |

**所以「12px」不是規則,「對齊列」才是。** 選單的列內距現在解出 12px,footer 就跟著 12px;
同一顆 `SurfaceFooter` 放進有 chrome 的浮層時,容器已在 Command 根把 `--item-px` 設成 `var(--layout-space-loose)`,
於是同一行寫法自動解出 16px(`components/Dialog/dialog.stories.tsx`、`components/Popover/popover.stories.tsx` 都是這樣用)。
**同一個 token 兩種情境都對,不會多出第二個要同步的數字**(M17)。哪天列的內距改了,footer 自己會跟上,不需要有人記得同步。

**唯一的例外:TimePicker**(2026-09-18 全庫掃描確認只有這一個)。它的時 / 分 / 秒是**置中的數字欄、欄本身零內距**
(實測:面板寬 162,欄寬 79.5、貼齊面板邊),沒有任何「內容左邊界」可以對齊;
它的 footer 因此走 `px-[var(--layout-space-tight)]`,與同一顆 footer 的 `py-tight` 成對,是**面板自己的內距**而不是對齊誰。
DatePicker **不是**例外 —— 它的日曆格線有左緣,footer 的預設 `loose` 實測就對在第一格上(差 0)。

**密度**:所有浮層(Popover 家族 = SelectMenu / Combobox / DatePicker / TimePicker / 篩選面板)都帶
`data-layout-space="md"` 鎖(`components/Popover/popover.tsx`),所以 `loose` 恆 16、`tight` 恆 12;
`--item-px` 回退的 `--field-px` 本來就不隨密度變。Dialog / Sheet 不鎖,但 body 與 footer 吃同一顆 `loose`,一起變、仍然對齊。
**沒有任何一個 footer 會在 lg 密度下跟它上面的東西脫隊**(2026-09-18 兩個密度各量一次)。

**世界級對照(2026-09-18 逐家抓原始碼驗過,不是憑印象)**:這條規則的骨架是「**水平內距的主人是列,不是殼**」,三家、四份原始碼一致 ——

| 家 | 抓到的原始碼 | 說了什麼 |
|---|---|---|
| Material 3 | `@material/web@2.4.0` 編譯後的 `menu/internal/menu-styles.css` <https://cdn.jsdelivr.net/npm/@material/web@2.4.0/menu/internal/menu-styles.css> | 選單外殼 `.menu{padding:0px}` —— **水平內距是 0**,只有上下用 `--md-menu-top-space` / `--md-menu-bottom-space`。殼一分水平內距都不給,所以放在底部的東西只能去拿列的 gutter |
| Material 3(對照組:有 chrome 的浮層)| `dialog/internal/dialog-styles.css` <https://cdn.jsdelivr.net/npm/@material/web@2.4.0/dialog/internal/dialog-styles.css> | 內文 `padding:24px`、動作列 `padding:16px 24px 24px` —— **左右兩者相同(24),只有上下不同**。footer 從來不會拿到跟 body 不同的左右內距 |
| GitHub Primer | `ActionList.module.css` <https://github.com/primer/react/blob/main/packages/react/src/ActionList/ActionList.module.css> | 容器只宣告 `padding:0` 與 `padding-block`,**沒有任何水平內距**;水平內距住在列的 `.ActionListContent { padding-inline: var(--control-medium-paddingInline-condensed) }` |
| IBM Carbon | `_list-box.scss` <https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/list-box/_list-box.scss> | 選項自己帶水平內縮(`.cds--list-box__menu-item__option { margin: 0 $spacing-05 }`),殼不定義內容左緣 |

三家結論一致:**選單的內容左緣由「列」擁有**,所以底部那一條要去對列;而有 chrome 的浮層裡 footer 與 body 的左右內距**相同**。我們這條規則把兩種情形寫成同一句話(對齊內容左邊界),數字由情境決定。

**「還能更 SSOT 嗎?」—— 能,但還不到時候**(2026-09-18 記錄,免得日後被當成漏做)。
更徹底的做法是讓三個部位都讀同一顆殼層變數:`SurfaceHeader/Body/Footer` 一律 `px-[var(--surface-gutter,var(--layout-space-loose))]`,
選單殼在 Command 根設一次 `--surface-gutter: var(--item-px,var(--field-px))` —— 那樣「一個浮層只有一條內容內距」
就是**結構上成立**,不再是一條要人記得的規則。**現在不做的理由**:全庫只有**一個** consumer 需要覆寫
(`components/SelectMenu/select-menu.tsx` 那一行,其餘 41 個選單面板都是它渲的),
`ds-canonical` 的 Rule-of-3 是「同概念 ≥ 3 處才抽 SSOT」,為一行改三個 primitive 的預設值,
弄壞既有 12 個正確 footer 的風險大於收益。**觸發條件**:當第二個元件需要自己的選單 footer(不是透過 SelectMenu)時,
就地做上面那個收斂,不要再複製第二行覆寫。在那之前,漂移由下面這支閘擋住 —— 它擋的是**結果**(像素),
不是寫法,所以就算有人用別的寫法也照樣抓得到。

**機械閘**:`scripts/overlay-footer-gutter-invariant.mjs` —— 掃全部 story,量的是**像素**(content-box 左緣)不是 class 字串;
有可對齊對象就比幾何(容差 1px),沒有就檢查內距是不是既有 token。對照組把每個 footer 推 7px,必須紅。

錯誤示範(2026-09-17 當天實測):選單 footer 沿用 `px-loose`,按鈕左緣 33px、列前緣 29px,差 4px,肉眼看得出來。

**為什麼列式 footer 不併進 `SurfaceFooter`**:它們的幾何差異是**內容驅動**的,不是兩份同樣東西 ——
把一整列放進 `px-loose` 的容器會讓列的滑過底色縮在兩側各 16px 內,違反本檔「List-as-region」第 3 條
(底色必鋪滿 chrome 內邊)。`SidebarFooter` 與 `MenuFooter` 是同一個配方的兩個住所,**兩者都正確**,
本段是它們共同的判準 owner;要改配方(內距 / 邊線)兩邊要一起改。

### SurfaceFooter
- 根節點帶 `data-slot="surface-footer"`(見上方「三個部位的機械把手」)
- `border-t border-divider`
- `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`
- `flex items-center justify-end gap-2 shrink-0`(右對齊按鈕列,不被壓縮)
- **Footer px = 浮層內容左邊界**(判準與完整對照表在上方「要對齊誰」,本處不重述):預設 `layout-space-loose` 對齊 SurfaceHeader title / SurfaceBody 內容左緣;內容左邊界由**列**定義時(選單 / list-as-region)覆寫成列在用的同一行 `px-[var(--item-px,var(--field-px))]`;兩者皆無時(欄位置中的挑選面板)才由面板自訂,必須用既有 layout token。
  **注**:**不要直接寫 `--field-px`** —— 那是 form-field 的 gutter(uiSize 家族),overlay chrome 不該伸手進去拿。要寫就寫 `--item-px`(owner:`../element-anatomy/item-anatomy.spec.md`「Token: `--item-px`」),它**是列的 gutter token**,只是預設值回退到 `var(--field-px)`;照抄 `components/Menu/menu-item.tsx` 那一行,footer 與列從此吃同一個來源。
  *(2026-09-18 更正:本條原本寫成「`--field-px` **不**用於 overlay footer」,與上方 2026-09-17 立的「選單裡覆寫成 `px-[var(--item-px,var(--field-px))]`」在同一份檔案裡互相矛盾 —— user 問「這是其 SSOT 嗎」時抓到的正是這一點。真正的界線不是「哪個 token 家族」,是「footer 要不要跟列吃同一個來源」。)*

---

## Overlay chrome 分級尺寸 → `overlay-chrome-sizing.spec.md`(2026-09-27 抽出,獨立 SSOT)

「Overlay title typography canonical」(modal 16 / non-modal 14)、「為什麼 SurfaceHeader 是 padding-based(而非 fixed-h)」、「Size canonical」(per-overlay body 控件與 footer 按鈕尺寸)、「Chrome dismiss size canonical」(`data-unbounded` 負 margin 縮位、v1–v5 震盪歷史)四節整段住在 `./overlay-chrome-sizing.spec.md`;本檔只留這個指標。

---

## Viewport-aware scroll chain invariant(2026-05-04 K11 升 SSOT)

> **背景**:Popover / HoverCard content 設 `max-h-[var(--radix-{popover|hover-card}-content-available-height)] flex flex-col overflow-hidden`,讓 viewport 太小時 header/footer 永遠 in-viewport,body 壓縮 scroll。但**中間任何 wrapper div 沒 forward `flex flex-col h-full` 就斷鏈**,SurfaceBody flex-1 失效,body 不會 scroll。
> **Dialog / Sheet 不走這條(2026-09-11 更正,原句把它們一起列進去是錯的)**:`--radix-dialog-content-available-height` 這個 CSS 變數**不存在** —— 它由 `@radix-ui/react-popper` 提供,而 Radix Dialog 不是 popper-based(全庫 grep 0 命中)。Dialog 的上限由 DialogContent 自己算(`min(100svh - inset*2, maxHeight)`),owner 是 `dialog.spec.md`「高度」段。
>
> **真實 bug(2026-05-04)**:Filter / Sort panel 內 wrapper div 設 `w-[640px]` 無 flex-col → user 縮視窗時 body 不 scroll,內容被 clip。ProfileCard 之所以 work 因為它直接是 PopoverContent 唯一 child(無 wrapper)+ 自設 max-h flex-col。

**Invariant**:從 `*Content`(浮層 root)到 `SurfaceBody` 之間的**所有中間 wrapper 都必 `flex flex-col h-full min-h-0`**(K11 v2,2026-05-04)。`min-h-0` 必須 — flex item default `min-height: auto` 會讓 content 撐高度,`h-full` 失效;加 `min-h-0` 才能正確 shrink 到 PopoverContent max-h cap。

```tsx
<div ref={ref} className="flex flex-col h-full min-h-0 w-[640px]">  // ✓
  <SurfaceHeader />
  <SurfaceBody />
</div>
```

**禁止**:`w-[640px]` 單獨用(❌ 斷鏈)/ `flex flex-col h-full` 無 `min-h-0`(❌ flex item 不 shrink,scroll 失效)。

**DS-wide consumer 必檢點**:`grep '<PopoverContent\|<HoverCardContent\|<DialogContent\|<SheetContent'` 內第一層 wrapper 是否含 `flex flex-col h-full`(若該 panel 用 SurfaceBody)。Hook `check_pattern_invariants.sh` C.1(原 `check_overlay_panel_scroll_chain.sh` 已 folded;2026-05-31 infra-audit 修 dangling ref)write-time 機械化警示(P1 WARN stderr,僅掃本次 edit fragment 不 block);DS-wide 全掃(上述 grep 必檢點)走 audit。

---

## Control + List 視覺對稱原則 → SSOT 規則 3 補充

→ `tokens/layoutSpace/layoutSpace.spec.md`「規則 3:元素間 gap」+ `## Notes` 節「List-as-region in overlay body」(本原則本質是 inline → block 對稱在 list 場景的特殊化,SSOT 移上游避免重複 — Rule-of-3)。

---

## Consumer rule:必消費 primitive 不自刻 chrome(2026-04-29)

寫 Popover / Dialog / Sheet 內容必消費 `SurfaceHeader/Body/Footer`(或上層 `PopoverHeader/...`),**禁自刻 `<div className="px-loose ... border-(b|t)">` 取代**。

**Why**:primitive 自帶 padding token + PopoverHeader auto close X(popover.tsx:104-109,`!hideClose` 條件渲染)+ PopoverTitle typography + `data-popover-body` autofocus 標記;自刻 = padding/border/close X/title 大小 4 向 drift 起點(對齊 mindset #2)。

**Hook**:`.claude/hooks/post_edit_dispatcher.sh`(原 `check_overlay_handcraft.sh` 已 folded;2026-05-31 infra-audit 修 dangling ref)攔此 pattern;escape hatch `// overlay-handcraft-allow: <reason>` 同/前行。

---

## 兩欄 dialog 組合 canonical(2026-07-10 user 拍板:組合,不做元件)

「左內容 + 右 metadata」兩欄 dialog(工作項詳情類)**是產品層組合,不收進 DS 元件**——對齊
Atlassian(modal-dialog 無宣告式兩欄 API,官方以 composition 範例示範)與 MUI(Dialog 無 split
API,欄由 layout primitive 組)。DS 只 codify 組合鐵律(違規簽名由 consumer 防線
`check_consumer_app_invariants.sh` r3 機械攔):

1. **各欄自帶 `<ScrollArea>` 獨立捲動**——禁兩欄共用單一 ScrollArea / 共用一條捲軸(每欄
   套上方「Body overflow canonical」模板,padding 進 viewport 內層 div)。
2. **divider = 右欄(`<aside>`)自持 `border-l border-divider`,貫穿 body 頂到底**——非獨立
   div、非只切半高。
3. **欄底 footer(如 comment composer)釘在所屬欄內**(欄內 `SurfaceFooter` chrome),
   非 dialog 全寬 footer——對齊 Atlassian 官方兩欄範例把 ModalFooter 巢狀進左欄。
4. **header 維持全寬**,分欄從 body 才開始。

**Archetype**(照抄結構,禁憑記憶手刻):WM `WorkItemDetailDialog.tsx`(產品實證,2026-07-08
拍板落地)/ DS 內部同構先例 `file-viewer.tsx` InfoPanel(`<aside class="w-80 shrink-0 flex-col
border-l border-divider">`)/ Atlassian `modal-dialog/examples/101-full-height-illustration.tsx`
(per-column `flex:1 + minHeight:0 + overflow auto`)。完整研究引文 →
`.claude/planning/2026-07-10-dialog-split-body-proposal.md`(元件化提案被 user 否決的紀錄)。

## 不屬本 primitive 的職責

- **Close 按鈕渲染**:由 consumer(Dialog / Sheet / Popover)自己包 `<Button iconOnly dismiss>` 在 Header 內,綁各自 Radix Close primitive。SurfaceHeader 本身不渲染 close,避免 pattern 與 consumer 的職責耦合。
- **viewport-fill 高度邏輯**:Dialog 特有(填滿 viewport - inset),由 DialogContent 自行計算 `height: calc(100vh - inset*2)`,與 Body 協作 `flex-1 overflow-y-auto`。
- **radius / border / shadow / bg**:浮層外殼職責,由 Dialog / Popover 的 Content 自己套(都套同一組 token:`bg-surface-raised` / `border-border` / `rounded-lg` / `shadow-[var(--elevation-200)]`——由本段記錄共同 consumer contract,並遵循 `packages/design-system/ds-canonical/rules/ui-development.md`「Token 命名 4 條硬規則」,不另外抽 primitive)。

---

## A11y 預設

overlay-surface 是 **layout pattern**(`SurfaceHeader` / `SurfaceBody` / `SurfaceFooter`),不持有互動行為 — a11y 大宗在 consumer overlay primitive(Dialog / Sheet / Popover / HoverCard)上,由 Radix 處理:

- **Role + ARIA**:`Dialog.Content` / `Sheet.Content`(皆 wrap Radix Dialog)自帶 `role="dialog"` + `aria-labelledby`(連 DialogTitle id)+ `aria-describedby`(optional Description)。**modality 機制**:Radix 不發 `aria-modal` 屬性,而是用 `hideOthers`(把背景 sibling subtree 套 `aria-hidden`)+ `RemoveScroll` 達成 modal — 對齊 WAI-ARIA APG「aria-hidden on background content」做法(APG 指出 `aria-modal` 的 AT 支援不一致,hideOthers 較穩健)。`Popover.Content` 同樣 wrap Radix(non-modal,Radix `modal` 預設 false)且**也帶** `role="dialog"`(Radix non-modal dialog,APG sanctioned)——Tab 在面板裡繞圈但滑鼠點外面可離開(見下一條)、**不**自動 `aria-labelledby`(consumer 需自設 `aria-label`)。`HoverCard.Content` 才是真的**無 role**(Radix react-hover-card 不發任何 role)
- **Focus trap / Tab 走向**(2026-09-25 更正,原句「Popover / HoverCard 不 trap」被讀成 Tab 可以走出 Popover,與實測不符;待辦總帳 B11):**對話框型浮層 Tab 留在裡面** —— Dialog / Sheet 是 modal trap(Tab 繞圈,滑鼠點外面也出不去);Popover 是 non-modal:Tab / Shift+Tab 同樣在面板裡繞圈(Radix FocusScope `loop: true`,`@radix-ui/react-popover` 1.1.15 `dist/index.mjs:225-226`),只是滑鼠點外面 / 程式移焦可離開並關閉。依據 W3C「Like non-modal dialogs, modal dialogs contain their tab sequence.」(<https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L29-L30>)。**選單類浮層 Tab = 收起並往下走**(DropdownMenu、單選下拉;規則在 `components/SelectMenu/select-menu.spec.md`「A11y 預設」與 `components/DropdownMenu/dropdown-menu.spec.md`)。HoverCard 焦點不進卡片(Radix 把卡片內可 Tab 節點設 `tabindex="-1"`),Tab 從觸發元素照頁面順序走
- **Esc / 點外面關閉**:Radix 處理(可被 `onEscapeKeyDown` / `onPointerDownOutside` 攔截)
- **AutoFocus on open**:consumer 自管 `onOpenAutoFocus`(Popover 範例:`handlePopoverOpenAutoFocus` 找 body 第一個 interactive 元素,跳過 close X 避免 tooltip leak)

**SurfaceHeader Title 可被 ARIA 關聯**:consumer 把 `id` 傳到 SurfaceHeader 的 Title 元素,Radix Content 用 `aria-labelledby={id}`。本 pattern 不強制 id naming(consumer 自決)。

---

## 何時不用

- **Toast / Alert**(Family 2 List item 視覺對齊):那是 row-item layout 不是 surface-section,不要套本 pattern。
- **Tooltip**(純文字短提示):無結構化需求,不包 Header/Body/Footer。
- **HoverCard**(自由組合互動浮層):目前 consumer 自行組合內容,視未來是否引入 Header/Body/Footer 需求再納入 consumer。
- **近親分界**:固定高度 app chrome(Sidebar header / toolbar / top bar)屬 **Chrome header(Fixed-h)家族**,用 `<ChromeHeader>` 非 SurfaceHeader——跨家族契約 SSOT 見 `patterns/header-canonical/header-canonical.spec.md`。

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「Dialog / Sheet body 直接 wrap SurfaceBody」 | 否——走 ScrollArea canonical(見「Body overflow canonical」) |
| 「list 場景需要 `flush` variant」 | 已撤回;用 className override + 自管 list wrapper(見「List-as-region」) |
| 「SurfaceHeader 自帶 close X」 | 否——close 由 consumer 包 `<Button iconOnly dismiss>`(見「不屬本 primitive 的職責」) |
| 「SurfaceFooter 也套 unbounded slot trick」 | 否——footer 慣例放 bounded action buttons,僅 padding + border-t |

---

## 相關

- `../../components/Dialog/dialog.spec.md` — modal 浮層 consumer
- `../../components/Popover/popover.spec.md` — non-modal 浮層 consumer
- `../../tokens/layoutSpace/layoutSpace.spec.md` — padding token 來源(`--layout-space-loose` / `--layout-space-tight` / `--layout-space-bottom`)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `app-shell.spec.md`
- `coachmark.spec.md`
- `date-picker.spec.md`
- `dialog.spec.md`
- `element-anatomy.spec.md`
- `file-item.spec.md`
- `header-canonical.spec.md`
- `item-anatomy.spec.md`
- `motion.spec.md`
- `overlay-chrome-sizing.spec.md`
- `popover.spec.md`
- `sheet.spec.md`
- `time-picker.spec.md`
- `uiSize.spec.md`
