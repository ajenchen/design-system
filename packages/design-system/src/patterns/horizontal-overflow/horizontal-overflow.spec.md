---
pattern: horizontal-overflow
internal: true
scope: utility primitives module (use-overflow-items hooks: useScrollEdges + useOverflowIndices + fade-mask + scroll-arrow helper components) — DS-internal consumer only(Tabs / ChipGroup / FileViewer filmstrip wrap)
---

<!-- @benchmark-unverified-blanket: 對齊 horizontal-overflow.tsx:5 的 file-level retraction(M22(d))——本檔 benchmark claim 均未逐條 URL cite,視為未驗證的視覺/用法陳述,除非後續 retrofit per-claim。 -->

# Horizontal Overflow 設計原則

**Layout Family**:non-family(utility primitives module,本身不渲染 layout — 由消費端 family 1/3 提供 outer geometry)。

**水平 overflow 的 canonical primitives + helper**——給任何「一排水平 items 可能塞不下容器」的元件(Tabs、ChipGroup、未來的 Steps horizontal、SegmentedControl overflow 等)共用。

這是底層工具 module,**不是 UI 元件**。消費者組裝自己的 outer wrapper(border、gap、背景等元件特有樣式),但 overflow affordance(scroll arrows、menu trigger、fade mask)全部從本 module 取用。

---

## 為什麼存在

### 歷史教訓

`ScrollArrow` 元件在 `Tabs/tabs.tsx` 和 `Chip/chip.tsx` **逐行 copy-paste**,`buildFadeMask` / `ARROW_BUTTON_WIDTH` / `SCROLL_PAGE_RATIO` 常數也是複製的。任何修改都要手動改兩處,是漂移溫床——實際上已經造成了一個 bug:

**Chip 的 menu trigger 曾漂移成可選 chip 的視覺語言,使用者無法區分「點擊 = 選中」與「點擊 = 打開選單」;同期 Tabs 正確用 text button 表達工具層——同一個 overflow affordance 在兩元件自相矛盾。**

### Canonical 規則

**所有 horizontal overflow 的 affordance 一律是 `<Button variant="text" size="sm" iconOnly>`。**

- 左右 scroll arrow → text button,ChevronLeft / ChevronRight
- Menu trigger → text button,ChevronDown
- **禁止**用 item 自身的視覺語言(chip 形狀、tab 底線等)來渲染 overflow trigger——overflow affordance 是「工具層」,不是「業務層」,不該跟內容爭視覺重量(「工具層必須是視覺重量最低的一層」— 本 spec codify 此原則,owner SSOT 在此)。
- **~~例外:Pagination 最後一階~~**(2026-09-10 撤銷,owner `pagination.spec.md`「為什麼不捲」):分頁列**不再走 overflow** —— 最後一階改成砍頭尾頁碼(需求寬度 220 → 156px,低於 DS 最窄容器 208px),整條 `overflow-x-auto` 拿掉。原本那條例外是 2026-09-04 依本模組類推來的,查證後 16 家世界級沒有一家讓數字頁碼列橫向捲(唯一命中是 MUI 表格頁尾工具列 `TablePagination.js:29`),主流解是收合頁碼。本模組的原則不變,只是分頁列不再是它的消費者([來源](https://github.com/mui/material-ui/blob/fec132cb22a5f4f7e122f56cac616195e52bfeea/packages/mui-material/src/TablePagination/TablePagination.js#L25-L30))。

這條規則讓使用者看到向下 chevron 或向右 arrow 時,心智是一致的:「這是 overflow 的工具,不是可選內容」,不論這排 items 是什麼類型。

---

## 何時用 / 近親分界 / 常見誤解 / A11y

- **何時用**:任何「一排水平 items 可能塞不下容器」的 DS 元件要加 overflow affordance 時 import 本 module。scroll vs menu 模式的抉擇 SSOT 在 `tabs.spec.md`「Overflow 模式」表(none / scroll / menu 三策略 + 何時用),此處不重複
- **何時不用 / 近親分界**:設計上拒絕 overflow 的元件不消費——SegmentedControl / Steps(見「消費者清單 Non-consumers」,各自 spec 明文)
- **常見誤解**:「在新元件自刻 ScrollArrow / fade mask 比較快」——禁止(見「禁止事項」),copy-paste 漂移正是本 module 存在的歷史教訓
- **A11y**:arrow / trigger 內建 `aria-label`(arrow 預設繁中、trigger 必填)+ iconOnly Button 自動 tooltip(見「元件保證行為」);menu 開啟後的 a11y 由消費者的 DropdownMenu(Radix)承擔

---

## 提供的 primitive

### 常數

| 常數 | 值 | 用途 |
|---|---|---|
| `FADE_WIDTH` | 16px | Fade mask 的漸變寬度 |
| `ARROW_BUTTON_WIDTH` | 32px | Scroll arrow 預留的按鈕區寬度(對齊 `field-height-sm` lg density) |
| `SCROLL_PAGE_RATIO` | 0.8 | 點 scroll arrow 一次滑動 80% 容器寬度 |

### Helpers

- `buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth })`
  回傳 `linear-gradient` 字串。`reserveArrowWidth` > 0 時 fade 會延伸到 arrow button 底下(Material 3 scrim 原理);= 0 時直接從邊緣 fade。 <!-- @benchmark-unverified -->
- `useScrollByPage(scrollRef)` → `(direction: 'left' | 'right') => void`
  點一次滑動 `clientWidth × SCROLL_PAGE_RATIO`,含 `behavior: 'smooth'`。

### 元件

- `<OverflowScrollArrow direction onClick>`
  - Root: `<Button variant="text" size="sm" iconOnly>`
  - Icon: `ChevronLeft` / `ChevronRight`
  - aria-label 內建繁中(「向左捲動」/「向右捲動」)
  - **絕對定位**在容器 `left-0` / `right-0`,`pointer-events-none` 外層 + `pointer-events-auto` 內層(讓 mask 下方仍可滑動)
- `<OverflowMenuTriggerButton aria-label>` (forwardRef)
  - Root: `<Button variant="text" size="sm" iconOnly>`
  - Icon: `ChevronDown`
  - 必填 `aria-label`(直接傳給 Button 的 `aria-label`,無 `label` alias;由消費者決定,例如「頁籤選單(共 5 個)」)
  - `forwardRef` + `...props` spread 讓 Radix `DropdownMenuTrigger asChild` 可以接管

> **元件保證行為:auto-Tooltip**——`OverflowScrollArrow` 與 `OverflowMenuTriggerButton` 都是 `iconOnly` + string `aria-label` + 非 `asChild`,因此都會觸發 Button 內建的 auto-Tooltip wrap(`button.tsx` iconOnly auto-Tooltip wrap)。亦即 hover 時 arrow / trigger 會自動冒出對應 `aria-label` 的 tooltip(「向左捲動」/「向右捲動」/「頁籤選單(共 N 個)」),共享全域 `Tooltip` 的 delay 與 warm-up。`DropdownMenuTrigger asChild` 仍正常運作:Radix 的 `asChild` 由 Trigger 自身消費(套到 `OverflowMenuTriggerButton` 的 forwardRef),不會傳成 Button 的 `asChild` prop,所以 tooltip wrap 與 trigger 接管互不衝突。

### 選到就露出來(`useRevealSelected`)

`useRevealSelected(scrollRef, { itemSelector, selectedAttribute, reserveArrowWidth })` —— 水平溢出那一排「使用者剛動到的那一項」一律**置中**,兩端到底時**夾住**(不留空白)。這是本 module 唯一的揭露 primitive,消費者不得自己寫 `scrollIntoView` / `scrollLeft`。

**對齊方式 B(一律置中)的出處**:user 2026-11-11(逐字)「Chip 的問題確保有找到root cause，並修 root cause，然後我覺得 B比較好吧？」、「「我建議 A。你還是想要 B 也完全可以，根因的修法三種都一樣。」都先B」。(A = 剛好露出 + 可讀邊距,是 AI 當時的建議;user 選 B。)

**根因**(2026-11-11 研究,MASTER-TODO 11-11):捲動原本只寫在 Chip / Tabs 的 ⌄ 選單處理程式(requestAnimationFrame + `scrollIntoView`);直接點擊走 Radix Toggle / Tabs Trigger,沒有捲動;鍵盤只靠瀏覽器的 focus 捲動,而 Chromium 對水平「部分可見」的項目不捲 —— Tabs scroll 模式方向鍵選中的分頁可以整顆落在箭頭 + 淡出底下(可讀 0)。本 module 當時沒有「選到就露出來」的 primitive 與契約,縮圖列另寫一份。現在三個消費者都只呼叫這一支。

下表是**【AI 推導】**的觸發規則(user 2026-11-11 定的只有「都先B」= 一律置中、兩端夾住;什麼時候捲由 AI 依「選到就露出來」與 M37 推導,未經 user 逐條確認):

| 觸發 | 判定方式 | 動畫 |
|---|---|---|
| **選中狀態改變**(滑鼠點、鍵盤 Space / Enter、Tabs 方向鍵自動啟用、⌄ 選單選取、consumer 程式改 value;**新加進來的項目一掛上去就是選中**也算,2026-11-12 補) | 看項目上的選中屬性(`selectedAttribute`)與新加入節點(childList),不看事件來源。一次只有一項變成選中 → 揭露它;沒有項目變成選中、只有一項被取消(多選 Chip 點掉)→ 揭露被點掉的那一項;一次多項變成選中(批次)→ 不捲 | smooth |
| **鍵盤焦點移到項目上**(`:focus-visible`;Chip 方向鍵只移焦點、Tab 進入整組、Tabs 手動啟用) | 滑鼠點擊帶來的焦點不算(那一下由上一列處理) | smooth |
| **容器尺寸改變**(含掛載後第一次排版) | 揭露上一次揭露的項目;還沒有就揭露唯一的選中項;多選且沒動過 → 不捲;**上一次揭露之後使用者自己捲過 → 不捲**(2026-11-12 補:不搶回使用者的捲動位置;「自己捲過」= 上一次揭露之後有使用者的捲動輸入:滾輪、觸控、在捲軸 / 容器空白處按下、箭頭翻頁;不看 scroll 事件,因為容器變窄時瀏覽器把位置夾回範圍內也會發 scroll 事件) | 無 |

- **置中與夾住**:目標捲動量 = 項目中心 − 可視寬 / 2,夾在 `[0, scrollWidth − clientWidth]`。夾住時項目落在靠那一端的半邊,該端沒有箭頭與淡出,因此仍完整可讀。
- **遮擋**:置中時項目兩側各留出 `reserveArrowWidth + FADE_WIDTH`(scroll 模式 48px、menu 模式 16px)以外的空間就完整可讀;項目比「可視寬 − 兩側遮擋」還寬時改把開頭對齊左側可讀邊(【AI 推導】邊界保護:置中會兩頭都被切,對齊開頭至少讀得到標籤開頭;DS 內目前沒有這麼寬的項目)。
- **`prefers-reduced-motion: reduce`**:smooth 一律改瞬間。
- **只捲這個容器**(`scrollTo`),不用 `scrollIntoView`(後者會連帶捲動頁面與其他可捲動的祖先)。祖先在做縮放動畫(Dialog / FileViewer 進場)時,量到的寬度先換回版面像素再算。
- **消費者宣告**:Chip `[data-slot="chip"]` + `data-state=on`;Tabs `[role="tab"]` + `aria-selected=true`;FileViewer 縮圖列 `[data-thumb-index]` + `aria-current=true`。`reserveArrowWidth` 與同一排 `buildFadeMask` 傳的值相同。
- **閘**:`scripts/overflow-reveal-selected-invariant.mjs`(`npm run test:overflow-reveal-selected`)—— 五排 × 點半露的項目 / 方向鍵 / ⌄ 選單 / 縮放,剛動到的那一項中心在容器中心 ±2px(兩端夾住另判)且完整可讀;對照組:每種輸入前一刻拿掉 primitive 的作用必紅,修前建置點擊 / 方向鍵 / 縮放必紅。

**世界級對照**(2026-11-11 研究,37 套;MASTER-TODO 11-11 研究條):預設置中的 8 套全是行動端 —— Android `TabLayout`([`TabLayout.java` `calculateScrollXForTab`](https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/tabs/TabLayout.java))、Compose M2 / M3、Flutter、Vant、Ant Design Mobile、TDesign Mobile、Ionic;桌面網頁 17 套預設「剛好露出」(MUI [`Tabs.js` `scrollSelectedIntoView`](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Tabs/Tabs.js)、Carbon、VS Code…),其中 Arco、TDesign 桌面、Naive UI、Vuetify、rc-tabs 有置中開關。這份對照回報 user 之後,user 的回覆是上面那句「…都先B」。

### Hook re-export

為了消費者只 import 一處,本 module re-export `useScrollEdges` / `useOverflowIndices` from `hooks/use-overflow-items.ts`。

> **`useOverflowIndices` 目前 0 consumer(reserved primitive)**:DS 內 menu 模式(Tabs / Chip)走「show-all navigator」派(dropdown 永遠列全部 items,不需動態 overflow 計算),刻意不用此 hook(見 `tabs.tsx` / `chip.tsx` 註解)。本 hook 保留給未來真正需「collapse-overflow」的 consumer;其 a11y(roving tabindex)由 consumer 渲染決定,非 hook 保證(詳 `hooks/use-overflow-items.ts` jsDoc)。`useScrollEdges` 則由 Tabs / Chip scroll 模式實際消費。

---

## 消費者架構

本 module 提供的是**樂高**,不是**組裝好的玩具**。消費者需要自己把外層容器、Radix primitive(TabsPrimitive / ToggleGroupPrimitive)、fade mask、arrows、menu trigger、DropdownMenu 拼起來。

### 為什麼不做成封閉的 `<HorizontalOverflowContainer>`?

- Tabs 的 separator owner 是 **list**，Chip 的 boundary owner 是**各 item**；兩者的 outer container 都只負責 overflow orchestration。責任歸屬不同，不能藏進同一個封閉 container prop。確切 utility、DOM 結構與歷史瀏覽器修復由 `tabs.tsx` / `chip.tsx` source comments 與 regression checks 擁有。
- Tabs 用 `TabsPrimitive.List` 作為 inner list;Chip 用 `ToggleGroupPrimitive.Root`
- Tabs 用 `DropdownMenuItem + selected`(單選);Chip 用 `DropdownMenuCheckboxItem`(多選)
- Tabs 有 `gap-[var(--layout-space-loose)]`;Chip 有 `gap-2`

把這些差異塞進一個 container prop 只會讓 API 變成 bag of flags。**讓 consumer 組裝,但強制消費 canonical primitive**,是更乾淨的做法——跟 `item-anatomy` module(`patterns/element-anatomy/item-anatomy.tsx`)提供 `ItemPrefix` / `ItemLabel` / `ItemIcon` 但不做「ItemRow 容器」是同一個設計哲學。

### 典型 scroll 模式組裝

```tsx
import {
  useScrollEdges,
  useScrollByPage,
  buildFadeMask,
  ARROW_BUTTON_WIDTH,
  OverflowScrollArrow,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'

const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
const scrollByPage = useScrollByPage(scrollRef)
const maskImage = buildFadeMask({
  canScroll, atStart, atEnd,
  reserveArrowWidth: ARROW_BUTTON_WIDTH,
})

return (
  <div className="relative">    {/* outer 不畫 border;Tabs underline owner 在 list 內 */}
    <div
      ref={scrollRef}
      className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <TabsPrimitive.List className={cn(TABS_LIST_BASE, 'w-fit')}>...</TabsPrimitive.List>
    </div>
    {!atStart && canScroll && <OverflowScrollArrow direction="left" onClick={() => scrollByPage('left')} />}
    {!atEnd && canScroll && <OverflowScrollArrow direction="right" onClick={() => scrollByPage('right')} />}
  </div>
)
```

> **箭頭卸載時的焦點接力(2026-09-29,待辦總帳 OE26)**:箭頭是條件渲染,鍵盤使用者按到底的那一下焦點正停在它上面;`OverflowScrollArrow` 在 layout-effect cleanup(React 拿掉節點之前)看到焦點在自己身上,就交給同容器另一側箭頭,兩側都沒有(內容不再溢出)就交給捲動容器(`useScrollEdges` 在容器上標 `data-overflow-scroller`,必要時補 `tabindex=-1`)。消費者不用多傳任何東西;同 BulkActionBar / Dialog 的 return-focus 契約。閘:`horizontal-overflow.stories.tsx`「到底時焦點交給另一側箭頭」play。

> **雙軸 overflow contract(2026-05-19 codify)**:啟用水平捲動時必同時抑制垂直捲動，避免 CSS overflow 軸計算讓 active indicator 進入非預期的垂直 scroll range。確切 utility 由各 consumer source 擁有([來源](https://github.com/primer/react/blob/62d32c94ac730847a4557441b65a6a48334201a3/packages/react/src/internal/components/UnderlineTabbedInterface.module.css#L12-L23))。

### 典型 menu 模式組裝

```tsx
import {
  useScrollEdges,
  buildFadeMask,
  OverflowMenuTriggerButton,
} from '@/design-system/patterns/horizontal-overflow/horizontal-overflow'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@/design-system/components/DropdownMenu/dropdown-menu'

const { scrollRef, atStart, atEnd, canScroll } = useScrollEdges<HTMLDivElement>()
const maskImage = buildFadeMask({ canScroll, atStart, atEnd, reserveArrowWidth: 0 })

return (
  <div className="flex items-stretch">   {/* items-stretch 讓 menu button 容器跟 list 共底線 */}
    <div ref={scrollRef} className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden ..." style={{ maskImage, WebkitMaskImage: maskImage }}>
      <TabsPrimitive.List className={cn(TABS_LIST_BASE, 'w-fit')}>...</TabsPrimitive.List>
    </div>
    {canScroll && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <OverflowMenuTriggerButton aria-label={`頁籤選單(共 ${items.length} 個)`} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* menu button container 自帶 border-b border-divider 對齊 list border */}
        </DropdownMenuContent>
      </DropdownMenu>
    )}
  </div>
)
```

---

## 邊界案例

- **內容塞得下(`canScroll=false`)**:`buildFadeMask` 回傳 `undefined`(無 mask),消費者依 `canScroll` 條件不渲染 arrows / menu trigger(Tabs / Chip 組裝範例皆如此)——items 為 0 或恰好全部塞進容器同理,overflow affordance 完全不出現
- **鍵盤操作**:arrow / trigger 都是標準 `<Button>`(Tab 聚焦、Enter / Space 觸發);menu 開啟後的 Escape / 方向鍵由消費者的 `DropdownMenu`(Radix)own,本 module 無自訂 keyboard handler

---

## 禁止事項

❌ **禁止** copy `ScrollArrow` 到其他元件。要在新元件加 overflow → import 本 module 的 `<OverflowScrollArrow>`。
❌ **禁止** 用 item 自身的視覺語言(chip shape、tab underline、segmented border 等)渲染 overflow trigger。trigger 永遠是 text button。
❌ **禁止** 重新定義 `FADE_WIDTH` / `ARROW_BUTTON_WIDTH` / `SCROLL_PAGE_RATIO`。有調整需求來改這裡一處,全系統同步。
❌ **禁止** 在元件內部另寫 `buildFadeMask`——用本 module 的版本。
❌ **禁止** 在消費者裡自己寫 `scrollIntoView` / `scrollLeft` 去揭露選中項,或只在某一個輸入路徑(例如選單處理程式)裡捲 —— 用 `useRevealSelected`,它看選中狀態,所有輸入同一條(2026-11-11 根因正是「只寫在選單處理程式裡」)。

---

## 消費者清單(跟 item-anatomy 同步維護)

- `components/Tabs/tabs.tsx` — `overflow="scroll" | "menu"`
- `components/Chip/chip.tsx` — `layout="scroll" | "menu"`
- `components/FileViewer/file-viewer.tsx` — Filmstrip(直接組裝 `useScrollEdges` / `useScrollByPage` / `useRevealSelected` / `buildFadeMask` / `OverflowScrollArrow`)
- 三個消費者的 scroll / menu 模式都呼叫 `useRevealSelected`(「選到就露出來」)

**Non-consumers**(2026-05-10 retire from「未來」清單 — prior prediction stale,spec 已明文不消費):
- ~~`components/Steps/steps.tsx`~~ — `steps.spec.md`「水平模式無 content」「水平空間不夠塞 content 區,強塞會破壞 stepper 的掃視節奏」+「Orientation」段「步驟 ≤ 5、重視「進度條」感、水平空間充足」→ 設計上不 overflow(指標用段名:原本的 `:347` / `L358` 已指到別處,r1b OTH-02 同族)
- ~~`components/SegmentedControl/*`~~ — `segmented-control.spec.md`「規模限制與邊界案例」段「**不支援 overflow / scroll**——若選項可能超出容器寬度,代表選錯元件了」+「最多 5 個 item」→ 設計上拒絕 overflow

新消費者必須加到這個清單,並且**只從本 module import** overflow 相關的 primitive,不允許自己複製。

---

## 反向引用

- `hooks/use-overflow-items.ts` — 底層 scroll / overflow 計算 hooks(本 module re-export)
- `components/Button/button.tsx` — text variant 的 canonical 樣式
- `components/DropdownMenu/dropdown-menu.spec.md` — menu item 的 selection 指示器規則

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `chip.spec.md`
- `file-viewer.spec.md`
- `overflow-indicator.spec.md`
