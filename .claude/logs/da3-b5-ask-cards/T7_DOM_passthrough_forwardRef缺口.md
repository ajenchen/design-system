# T7 — DOM passthrough + forwardRef 缺口 決策卡

主題：AppShellAside / Carousel 箭頭 / Combobox / DataTable 三 panel / Sidebar mobile 缺 DOM rest-props 通道或 forwardRef。逐條判「additive 補齊(AUTO)」vs「真的動公開 API 契約 / 新 design decision(拍板)」。

- **Verdict：MIXED**
- **DOWNGRADE_AUTO(4)**：d9i2、d9i9、d9i10、d9i28
- **送 user 拍板(4)**：d9i3、d9i7、d9i8、d22i0

---

## 一、SSOT-check 結論(theme-level,四要件第 1 條)

**我方既有 canonical(M23 優先)——「補齊轉發缺口」屬 additive 且已有先例:**

1. **forwardRef 是 shadcn 框架強制、非新決策**：`.claude/rules/ui-development.md:88`「tsx 用 forwardRef + cva…」、`.claude/rules/spec-rules.md:18`「所有元件遵循 shadcn 框架(forwardRef / Slot / data-* / cva)」、`.claude/references/audit-coverage-vs-24-checklist.md:17`「#4 Ref｜shadcn 強制 forwardRef + displayName,Dim 9 必驗」。→ 元件缺 forwardRef 是**違反既有 canonical**,補上 = 對齊,不是新增決策。
2. **rest-props 轉發到 DOM root 已有 code 先例**：`switch.tsx:253` 明確 `{...props}` spread 到 Radix Root(radio-group.tsx 同型)。這正是驗證者所指「加轉發屬 additive 非破壞」的 canonical 先例。
3. **AppShellAside 自身 2026-07-14 已把 ref + className 兩分支轉發當 additive dim-9 修 committed**：`app-shell.tsx:334-335`(修法註解)、`:340`(mobile SheetContent 掛 ref)、`:358-361`(mobile className 合併)、`:375`(desktop aside 掛 ref)。→ DS team 已把「forwarding 缺口補齊」實際當 AUTO additive 執行過,同一元件同一方向續補 rest-props 屬同類。
4. **Omit-collision 是既有 canonical 手法**:公開型別引入 HTMLAttributes 時撞名的 native prop 一律 Omit(ProgressBar Omit `value`、Slider d9i29 Omit `orientation` 先例),非新設計問題。

**World-class ≥3 家(四要件第 2 條;WebSearch snippet,search-only confidence — WebFetch 未逐頁取全文):**

- **Radix Primitives — Composition guide**(radix-ui.com/primitives/docs/guides/composition)：「Radix spreads **all** of the props onto the underlying DOM node … it's recommended to **always** do this」+ DOM-rendering part 必 `React.forwardRef`。→ 支持「有穩定單一 DOM root 的元件應全轉發」。
- **React 官方 — forwardRef docs**(react.dev/reference/react/forwardRef)：forward ref 用於「exposing low-level DOM elements」,但「**avoid exposing DOM nodes in higher-level components**」。→ 高階複合元件(多 root / 跨 mode)不該盲目全轉發,需刻意決策 → 支持把 Combobox 類留 ASK。
- **Chakra UI — compound component + forwardRef**(github.com/chakra-ui/chakra-ui/discussions/3152)：compound 元件用 forwardRef 型別化的實務範式。

**綜合判準(逐條套用):**
- 有**單一穩定 DOM root**(或已 forwardRef 的 root)、修法 = 對既有 root 加 `{...rest}` / forwardRef、無新 prop、無語意改動、無結構重組、無新 spec canonical → **AUTO**(對齊 Radix「always spread」+ 我方 forwardRef 強制 canonical)。
- 需**新 prop 名 / 改既有 prop 目標(破壞)/ 多 root 或跨 mode「該掛哪」本身是問題 / Fragment 加 root(結構+版面)/ 需新寫 spec 例外** → **ASK**(對齊 React「avoid over-exposing higher-level」)。

---

## 二、DOWNGRADE_AUTO 4 條(對齊既有 canonical,不送 user)

### d9i9 — DataTableFilterPanel（最純 additive）
`data-table-filter-panel.tsx:315-321`(root div 已收 `ref` + `className`)、`:152-153` + `:402`(已 generic forwardRef cast)。**唯一缺口** = root div 未 spread 其餘 DOM props。修法 = 在既有 forwardRef'd root 加 `{...rest}`(排除已具名的 mode/columns/value 等 domain props)。
→ **cite**：已 forwardRef + 已掛 ref/className 的穩定單一 root,補 `{...rest}` 完全對齊 `switch.tsx:253` `{...props}` canonical + Radix「always spread」。零語意改動、零新 prop = additive。

### d9i10 — DataTableSortManager
`data-table-sort-manager.tsx:110`(單一 root div `<div className={cn('flex flex-col h-full min-h-0 w-[var(--data-table-sort-panel-width)]', className)}>`)、`:68`(plain function 無 forwardRef)。修法 = 依同資料夾 sibling `DataTableFilterPanel`(:152-153 generic forwardRef cast)補 forwardRef + `{...rest}` 到既有 root。
→ **cite**：穩定單一 root 已存在,補 forwardRef 是對齊 shadcn 框架強制(ui-development.md:88)+ sibling FilterPanel 既有 pattern,非新決策。additive。

### d9i2 — AppShellAside（rest-props 續補）
`app-shell.tsx:60-68`(props 僅 title/width/children/className)。但 `:334-335 / :340 / :358-361 / :375` 顯示 **ref + className 已於 2026-07-14 additive 轉發到兩分支**(mobile SheetContent、desktop aside)。缺口 = 未開 `id / data-* / aria / 事件` 通道。修法 = props extends `Omit<React.HTMLAttributes<HTMLElement>, 'title'>`(`title` 已是必填 aria-labelledby 語意 prop → Omit,同 ProgressBar/Slider Omit-collision canonical),rest 跟 ref/className **同目標**(mobile→SheetContent、desktop→aside)spread。
→ **cite**：轉發目標已由 2026-07-14 ref/className 修確立(不需重新決定掛哪);續補 rest-props 是同元件同方向 additive,對齊 switch.tsx:253 + Radix「always spread」。title 撞名機械 Omit。
→ **executor 注意**：動型別 surface(extends HTMLAttributes)→ 收尾必 `npm run build:lib`(self-verify.md Post-edit)。

### d9i28 — Sidebar mobile 分支（silent-drop BUG）
`sidebar.tsx:348-370`：`{...props}`(div rest props)spread 到 `<Sheet>`(Radix Root,**非 DOM 元件 → 靜默丟棄**,:350);mobile 分支 **ref 未使用**;`SheetContent` className 為**硬寫**(:354)consumer className 到不了。→ 同一 API 隨 breakpoint 靜默失效 = bug。修法 = `open/onOpenChange` 留 `<Sheet>`,`ref` / `className`(用 `cn` 併硬寫 class)/ `{...props}` 轉到 `<SheetContent>` —— **與 AppShellAside 2026-07-14 修法逐字同構**(app-shell.tsx:338 Sheet 收 open、:340 SheetContent 收 ref、:358-361 SheetContent 併 className)。
→ **cite**：silent-drop 屬 bug(Autonomy canonical「Bug fix → AUTO」);修法對齊 AppShellAside 既有 precedent + M23(我方 canonical > shadcn 上游同構的 known quirk)。非新設計。
→ **executor 注意**：Sidebar 是 shadcn 來源;修法是讓它對齊我方 AppShellAside canonical,非跟隨上游。

---

## 三、送 user 拍板 4 條 decisionCard(真決策)

### 決策卡 d9i3 — Carousel 箭頭是否開放完整 Button props？

**【問題】** `CarouselPrevious/Next` 目前只吃 `className` + `aria-label`(carousel.tsx:234-238)。`ref` 掛在內部 Button(:263/:297),但 `className` 實際套在**外層絕對定位 wrapper div**(:254/:259)——不是 Button;Button 的 `rounded-full` 等視覺是硬寫(:274)。consumer 無法傳其他 button 屬性,也無法分別控制「定位 wrapper」與「按鈕本體」的樣式。

**【選項 A｜維持現狀 + 文件化】** 保留 `className→wrapper`(定位微調用)、只留 `aria-label` 可覆寫,spec 明文記錄「箭頭樣式由 DS 鎖定、className 作用於定位層」。
- tradeoff：零破壞、最小面;但 consumer 完全無法客製按鈕(如換 size / 加 data-* / 綁 analytics onClick),偏離 Radix「always spread」+ shadcn carousel 上游(箭頭直接 extends Button props)。

**【選項 B｜開放 Button props + 拆 wrapperClassName】** props 改以 Button props 為基底,`className`→Button,新增 `wrapperClassName`→定位 wrapper,rest 全轉 Button 並 compose 內部 `onClick`(scrollPrev/Next)與 consumer onClick。
- tradeoff：對齊 shadcn carousel 上游 + Radix spread 慣例、客製力完整;但 `className` 語意由 wrapper 改指 Button = **破壞既有 consumer**,且新增 `wrapperClassName` 公開 prop。需 deprecation/migration note。

**【推薦】** 選 B(附遷移註記)。理由:mindset #1 對標世界級 — shadcn/Radix carousel 箭頭皆為完整 Button-props passthrough,現行 className 語意曖昧本身是缺陷;但因破壞 className 語意,須 user 確認接受破壞 + 遷移成本。

**【SSOT 理由(新 API contract)】** 新增公開 prop `wrapperClassName` 並重定向 `className` 目標(wrapper→Button)= 動公開 API contract。

---

### 決策卡 d9i7 — Combobox 跨 mode ref/rootProps 契約

**【問題】** Combobox 公開 `ref` 只轉到 `__triggerRef`(edit trigger root,combobox.tsx:631/756/885-897);view / readonly / disabled 走 `ReadonlyMultiSelect`(:605/749)**完全收不到 ref**,也無共同 DOM attrs 通道(props 僅 className/aria-label,:366-455)。同一 `ref` 隨 mode 靜默指向不同/不存在的 root。

**【選項 A｜縮窄 + 明文記錄例外】** 保持 ref 只保證 edit trigger,spec 明文「Combobox 為多 mode field,ref 僅在 edit mode 指向 trigger,view/readonly 不保證穩定 root」,並補 `aria-label` 以外的少量顯式具名 prop(如需)。
- tradeoff：誠實、低複雜度、對齊 React「avoid exposing DOM nodes in higher-level components」;但 consumer 仍無法在 view/readonly 拿 root。

**【選項 B｜建立跨 mode rootProps/ref 契約】** 每個 mode 的顯示 root 都掛可轉發 ref + 統一 `rootProps` 通道,保證任何 mode 都有穩定 root。
- tradeoff：客製/量測力完整;但四個 mode 渲染的是本質不同的 subtree,強行統一 root 增加相當複雜度與回歸風險。

**【推薦】** 選 A(記錄例外)。理由:Combobox modes 渲染根本不同的 subtree,不存在「自然的單一穩定 root」;React 高階複合元件不宜盲目全轉發。與 T1 RadioGroup/Switch 的跨 mode 缺口採同一處理哲學(記錄例外而非硬造統一 host)。

**【SSOT 理由(改 canonical 語意)】** 於 combobox.spec.md 明文寫入「cross-mode ref 例外」= 新增 canonical 語意規則(選 B 則為新 API contract `rootProps`)。

---

### 決策卡 d9i8 — DataTableColumnVisibilityPanel：加 root vs 記錄 Fragment 協議

**【問題】** 此為公開主元件,卻是 plain function(無 forwardRef,:67-76)、回傳 **Fragment**(:133-134),無任何 DOM passthrough,檔頭與 props 皆無 no-root 例外記載。與同資料夾 sibling `FilterPanel`(有 root div + forwardRef)、`SortManager`(有 root div)結構不一致。

**【選項 A｜加 root div 對齊 sibling】** 給它一個 `flex flex-col h-full min-h-0 w-…` root(比照 FilterPanel/SortManager),forwardRef + `{...rest}` 掛上去,三個 panel 結構統一。
- tradeoff：三 panel 一致、可接 ref/DOM props;但**改變 PopoverContent 內的 DOM 輸出**,須驗 M25 viewport-aware scroll-chain invariant(overlay-surface.spec.md)不被破壞。

**【選項 B｜保留 Fragment + 記錄協議 + containerProps】** spec 明文記錄「本 panel 刻意回 Fragment,由 PopoverContent 當容器」,另加 `containerProps`/`ref` 通道供需要時用。
- tradeoff：不動現有版面;但與兩個 sibling 結構分歧持續存在,consumer 心智不一致。

**【推薦】** 選 A(加 root 對齊 sibling)+ 修後跑 scroll-chain 視覺驗證。理由:mindset #1 一致設計語言 — 三個同族 DataTable panel 應同構;Fragment 是 outlier。但因動公開元件 DOM 輸出 + 觸及 M25 scroll-chain,需 user 拍板 + verify。

**【SSOT 理由(新 API contract)】** 從無 root 的 Fragment 改為 forwardRef'd root(或選 B 加 `containerProps`)= 動公開 API contract 且需同步 spec canonical。

---

### 決策卡 d22i0 — AppShellAside body 預設 padding（非轉發議題,誤歸 T7）

**【問題】** AppShellAside 共用 body 是**無 padding 的 ScrollArea 直接渲染任意 children**(app-shell.tsx:327);desktop 殼有 `bg-surface`/`border-l`(:377-378)= 有邊界 surface(layoutSpace.spec.md:84 Pattern A 應元件自帶 px-loose),mobile SheetContent 又 `p-0`(:359)。未包裝內容會貼邊,違反「父 chrome 負責 breathing」SSOT,且 app-shell.spec.md Aside 節(193-219)只記 scroll ownership 未載 padding 例外;code 註解(:301)自稱走規則 1B,但 1B 限「純 layout primitive 無邊界」(layoutSpace.spec.md:85)不適用有邊界的 aside。

**【選項 A｜shared body 加預設 padding】** body wrapper 加 `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`,full-bleed list/table 用明確 `bodyClassName` override,app-shell.spec.md 補記例外。
- tradeoff：對齊 layoutSpace Pattern A(有邊界 surface 自帶 breathing);但改變既有 composite 視覺輸出,現有 consumer 的 aside 內距會變。

**【選項 B｜維持貼邊 + 記錄為刻意】** 保持 body 無 padding,spec 明文「aside body 不自帶 padding,由 consumer 內容負責 breathing」。
- tradeoff：不動視覺;但與 layoutSpace Pattern A「有邊界 → 元件自帶 px-loose」canonical 衝突,需在 spec 顯式豁免並說明理由。

**【推薦】** 選 A。理由:desktop aside 是有邊界 bounded surface(bg-surface + border-l),依 layoutSpace.spec.md:84 Pattern A 該由容器自帶 breathing;貼邊是 bug 而非設計。但屬公開 composite 視覺改動 + 需新增 spec 例外 canonical,須 user 拍板。

**【SSOT 理由(新 design language / 改 canonical 語意)】** 改公開 composite 視覺(aside body breathing)+ app-shell.spec.md 新增 body-padding 例外 = 動視覺 canonical 語意,非 additive 轉發。

---

## 四、要件檢核(每條真決策 SSOT 理由已具備)

| id | verdict | SSOT 理由類型 |
|----|---------|--------------|
| d9i2 | AUTO | — (對齊自身 2026-07-14 ref/className precedent + switch.tsx:253) |
| d9i9 | AUTO | — (對齊 forwardRef 強制 + Radix always-spread) |
| d9i10 | AUTO | — (對齊 sibling FilterPanel + shadcn forwardRef 強制) |
| d9i28 | AUTO | — (bug fix + 對齊 AppShellAside precedent) |
| d9i3 | ASK | 新 API contract(新增 wrapperClassName + className 重定向) |
| d9i7 | ASK | 改 canonical 語意(cross-mode ref 例外)/ 新 API contract(rootProps) |
| d9i8 | ASK | 新 API contract(Fragment→forwardRef root / containerProps) |
| d22i0 | ASK | 新 design language(aside body breathing)+ 改 spec canonical |

**Sources(world-class,search-only confidence):**
- Radix Primitives — Composition guide: https://www.radix-ui.com/primitives/docs/guides/composition
- React — forwardRef reference: https://react.dev/reference/react/forwardRef
- Chakra UI — compound component with forwardRef (Discussion #3152): https://github.com/chakra-ui/chakra-ui/discussions/3152
