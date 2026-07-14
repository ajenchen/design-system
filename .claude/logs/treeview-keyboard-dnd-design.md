# TreeView 鍵盤拖曳重排 — 互動設計書(research round,無實作)

> 2026-07-14。任務:user 拍板「排一輪互動設計」— research + design proposal only。
> 目標:設計一套與「單一 tab stop + aria-activedescendant 虛擬焦點」(2026-07-05 D4 拍板)相容的鍵盤重排方案,補 `tree-view.spec.md:386` 誠實記載的「拖放重排需指標裝置、無鍵盤路徑」gap。

---

## 0. 摘要(給 user 拍板的一句話版)

**推薦「modifier+方向鍵直接移動」派(Notion / Asana 派):`Cmd/Ctrl+Shift+↑↓` 同層重排、`Cmd/Ctrl+Shift+→←` 移入/移出資料夾,每按一下立即 commit(呼叫既有 `onDragEnd`,consumer API 零改動);SR 播報用 TreeView 自有 sr-only live region(消費 SelectMenu 既有先例);不走 dnd-kit KeyboardSensor(與虛擬焦點模型結構性不相容);v1 = 同層重排 + 跨層 reparent 一次做齊(WCAG 2.1.1 鍵盤 parity 要求),多選批次移動 / grab-mode 預覽 / 「移到…」選單 recipe 留 v2。**

---

## 1. Research 來源(M26:≥3 fetch-verified)

| # | Source | 取得方式 | 關鍵事實 |
|---|---|---|---|
| 1 | [dnd-kit KeyboardSensor docs](https://dndkit.com/api-documentation/sensors/keyboard) | WebFetch ✅ | 預設啟動鍵 `Space`/`Enter`(start + end)、`Escape` cancel;**「activator element 必須能接收 DOM focus」**;`getNextCoordinates` 可客製移動邏輯(預設每按 25px) |
| 2 | [dnd-kit Accessibility guide](https://dndkit.com/guides/accessibility) | WebFetch ✅ | `screenReaderInstructions` + `announcements` 四 callback(`onDragStart/Over/End/Cancel`),預設英文字串如 "Picked up draggable item ${active.id}.";DndContext 自渲 off-screen live region,「不需移 focus」 |
| 3 | [react-aria Drag and Drop](https://react-aria.adobe.com/dnd) | WebFetch ✅ | `Enter` 拾起 → `Tab` 在 drop target 間循環 → collection 內 `↑↓` 選插入位 → `Enter` 放下 / `Esc` 取消;內建 SR 播報;鍵位衝突時建議獨立 **drag affordance**(可聚焦 handle) |
| 4 | [MDN aria-grabbed](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-grabbed) | WebFetch ✅ | `aria-grabbed`/`aria-dropeffect` 自 ARIA 1.1 deprecated(「expected to be replaced…considered deprecated」),AT 從未完整實作;ARIA 不提供 DnD 語意,APG 也**沒有** drag-and-drop pattern |
| 5 | [Smashing Magazine「Dragon Drop」](https://www.smashingmagazine.com/2018/01/dragon-drop-accessible-list-reordering/) | WebFetch ✅ | grab-mode 經典實作:handle `role="button"` + `aria-pressed` 表拾起態;live region 播 "Item 1 grabbed" / "The list has been reordered, Item 1 is now 4th in the list" / "Item 1 dropped" / "Reordering cancelled";不用 aria-grabbed 因「support rare、對 SR user 反直覺」 |
| 6 | [Salesforce「4 Major Patterns for Accessible Drag and Drop」](https://medium.com/salesforce-ux/4-major-patterns-for-accessible-drag-and-drop-1d43f64ebf09) + [demo repo](https://github.com/salesforce-ux/dnd-a11y-patterns) | WebSearch(article 本體 search-only) | 4 patterns 之首 = list sort(grab-mode);核心三要素 identity / operation / state;「鍵盤必須能做到滑鼠能做的一切」 |
| 7 | [Atlassian Pragmatic DnD a11y guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines) | WebFetch ✅ | **明確反對方向鍵模擬拖曳為主路徑**:「For most experiences, we recommend not leveraging directional controls (arrow keys)」;推薦 trigger button + 選單(「move to top」等)、accessible name 帶對象名、live region 播 "Task 'Clean dishes' moved to list 'Doing' from 'Todo'";操作後 focus 回原 trigger |
| 8 | [Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts) | WebFetch ✅ | **`Cmd/Ctrl+Shift+方向鍵` 移動選中 block**;`Tab`/`Shift+Tab` 縮排/取消縮排(nest 進上方 block) |
| 9 | Asana 鍵位([keycombiner](https://keycombiner.com/collections/asana/)、[usethekeyboard](https://usethekeyboard.com/asana/)) | WebSearch(**search-only confidence**) | `Cmd/Ctrl+↑↓` 移動 task 上/下;`Cmd/Ctrl+Shift+↑↓` 移到上/下一個 section |
| 10 | [Todoist help](https://www.todoist.com/help/articles/use-keyboard-shortcuts-in-todoist-Wyovn2) | WebSearch(**search-only confidence**) | list layout 下移動 task:`Ctrl+↑↓`;縮排 `Ctrl+]` / `Ctrl+[` |
| 11 | Figma layers panel([help.figma.com](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard)) | WebSearch(**search-only confidence**) | 圖層順序 `Cmd+]`/`Cmd+[`(top/bottom 加 `⌥`);曾用 `Cmd+Opt+↑↓` 後改掉 |
| — | Windows 檔案總管 / VS Code 檔案樹 | 推理(非 cite) | 檔案樹**自動排序**(名稱/類型),根本無手動 reorder 概念 → 此類 consumer 不開 `draggable`,不構成鍵位 benchmark |

**APG 結論**:WAI-ARIA APG 至今**沒有** drag-and-drop pattern;`aria-grabbed` deprecated 且 AT 沒實作。業界共識 = **application-level 鍵盤重排 + live region 播報**,ARIA 屬性只剩 `aria-roledescription`(提示可拖)與 `aria-describedby`(指向操作說明)兩個輔助位。

---

## 2. 三派世界級對照

| 派別 | 模型 | 代表 | 優點 | 缺點 |
|---|---|---|---|---|
| **A. Grab-mode(拾起→移動→放下)** | 某鍵拾起進入 mode → ↑↓ 移動目標位(顯示 indicator 預覽)→ Enter commit / Esc 取消 | dnd-kit KeyboardSensor、react-aria、Salesforce pattern 1、Dragon Drop | a11y 教科書 canonical;單次 commit(跟 pointer 的 onDragEnd 契約一對一);預覽可反悔;可復用既有 dropIndicator 視覺 | **拾起鍵無解**:`Enter`/`Space` 已被 select 佔用(spec 鍵盤表鎖定),世界級實作全靠「row 有 DOM focus」或「獨立 handle tab stop」— 兩者都違反我們 D4 虛擬焦點 + Figma 式無 handle 設計;需 mode 狀態機 + Esc 還原簿記 + drop-slot 枚舉(且要排除自身子樹) |
| **B. Modifier+方向鍵直接移動(每按即 commit)** | `Cmd/Ctrl(+Shift)+↑↓→←` 直接移動節點,無 mode、無 cancel(反向鍵即是 undo) | **Notion**(Cmd+Shift+arrows)、**Asana**(Cmd+↑↓)、Todoist(Ctrl+↑↓)、Figma(Cmd+[])、VS Code 編輯器行移動(未 cite,僅旁證) | 與虛擬焦點**零衝突**(modifier 層完全空閒,container keydown 直接收);無狀態機;產品界最大宗、user 肌肉記憶可辨識(mindset #4);樹上語意可結構化(↑↓=同層、→←=進出層),**結構上不可能把節點移進自己子樹**(grab-mode 需顯式排除) | 長距離移動按鍵多;Atlassian 批評「非視覺使用者難建方向心智模型」(→ 用結構化播報緩解,見 §6);每按一下 fire 一次 onDragEnd(consumer 契約需文件化) |
| **C. 選單式替代流(Atlassian 派)** | row 的 ⋯ menu 提供「move up / move down / move to top / move to…」menu item | Atlassian Pragmatic DnD 官方指引 | AT 體驗最線性(menu 是 AT 最熟的 idiom);零新鍵位;focus 管理簡單 | 不是「鍵盤拖曳」而是繞開;長距離同樣多步;**TreeItem 已有 ⋯ inlineActions canonical**(tree-view.spec.md「Hover-only Inline Actions」),此派今天就能由 consumer 自行落地,DS 無需新機制 |

**推薦:B 為 v1 主路徑,C 以 spec/story recipe 形式建議 consumer 補充(零 DS 新 code),A 列 v2 候選。**

推薦理由(對照鎖死的三個約束):
1. **D4 虛擬焦點鎖定**:rows `tabIndex={-1}`,keydown 永遠落在容器 — 派 B 天生在容器 handler 運作;派 A 的「拾起鍵」在無 handle + 無 row focus 下沒有任何世界級先例可抄(react-aria 靠 row focus、Dragon Drop 靠 handle tab stop、dnd-kit 靠 activator focus,三家全數不相容)。
2. **鍵盤表鎖定**(spec「鍵盤導覽」表):`↑↓→←/Home/End/Enter/Space` 全被佔用;multi 模式 `Space` 還是 checkbox toggle。派 A 若徵用 `Space` 當拾起會撞 multi-select 語意;派 B 只用 modifier 層,零衝突。
3. **consumer 契約鎖定**:`onDragEnd({sourceId, targetId, position})` — 派 B 每步都是一個完整合法的 `TreeDragEndEvent`,API 零改動零新 prop(播報除外)。
4. Atlassian 對方向鍵的批評主要針對 canvas / 跨容器自由拖曳;樹是**線性結構**,「上/下/移入/移出」直接對映樹語意,配合結構化播報(「第 n 項,共 m 項」)非視覺使用者可建立位置模型 — Dragon Drop 的播報實證(§6)同此路線。

---

## 3. 既有 SSOT 盤點(M29 3-column owner table)

| Candidate owner SSOT | Canonical 句 / 事實 | 與本提案的關係(衝突?) |
|---|---|---|
| `tree-view.spec.md`「鍵盤導覽」表(:164-174) | `↑↓→←/Home/End/Enter/Space` 語意已鎖(對齊 APG treeview) | 無衝突 — 新鍵位全在 modifier 層;需在此表**新增 4 行** |
| `tree-view.spec.md`「A11y 預設」(:386) | 「`draggable` 目前只註冊 PointerSensor(無 KeyboardSensor),拖放重排需指標裝置、無鍵盤路徑(現況記錄)」 | 本提案即解此 gap;落地時此句改寫 |
| `tree-view.spec.md`「Drag and Drop」(:270-282)+ `tree-view.tsx:77` `TreeDragEndEvent` | consumer 契約 `onDragEnd({sourceId, targetId, position: before/after/inside})`;`inside` 只對 `hasChildren` node 出現(`handleDragOver` :359) | 鍵盤路徑**沿用同契約**;`inside` 限 folder 的規則同步沿用(indent 只在前一 sibling 是 folder 時可行,見 §5) |
| `lib/drag-visual.ts` | dropIndicator 2px `bg-primary` / `dragSourceClass`=`opacity-disabled` / ghost 規則;3 consumer 共用 | 派 B 無預覽 phase → **不新增視覺**;若 v2 做派 A 才復用 dropIndicator(已註記) |
| `tree-view.tsx:981-988`(2026-07-05 D4 註解) | 「只 spread listeners 不 spread attributes;sensors 僅 PointerSensor,這些 attrs 換不到鍵盤拖曳能力」 | 本提案不翻案 D4 — 不引入 KeyboardSensor,維持 attributes 不 spread |
| `select-menu.tsx:143` | `<div role="status" aria-live="polite" className="sr-only">` — DS 既有 live region 先例(cmdk no-results 播報) | **直接消費同 pattern** 當 TreeView 播報載體(§6) |
| `bulk-action-bar.tsx:130` / `toast.tsx:50-62` | `aria-live="polite"` + `aria-atomic` / `role="status"` vs `role="alert"` 分級先例 | 佐證 polite 級為 DS 慣例;重排播報屬 polite |
| `tree-view.spec.md`「Hover-only Inline Actions」+ `inline-action.spec.md` | ⋯ more menu「所有 node 統一有」uniform 規則 | 派 C(選單替代流)的落點 — consumer recipe,DS 不新增機制 |
| `item-anatomy.spec.md`(Family 1) | row 結構 SSOT | 不動 row 結構,無衝突 |

Spec ≠ code 衝突:**無**(現況記錄與 code 一致,本提案是補能力不是修矛盾)→ 不需 RFC 改道,直接 propose。

---

## 4. dnd-kit 整合路徑:自建 reorder handler(推薦),不用 KeyboardSensor

### 為什麼 KeyboardSensor 結構性不可行(不是「沒調好」)

1. **啟動模型不相容**:KeyboardSensor 靠 activator element 的 `onKeyDown` listener 啟動,而官方文件明言 activator **必須能接收 DOM focus**(source #1)。我們的 row `tabIndex={-1}`、DOM focus 永遠停在 `role="tree"` 容器 — row 上的 keydown listener 一輩子收不到事件。要讓它收到就得把 focus 移到 row,即拆掉 D4 拍板的單一 tab stop 模型。
2. **啟動鍵撞死**:預設 `Space`/`Enter` = 我們的 select(spec 鎖定);即使客製 `keyboardCodes`,仍解不了問題 1。
3. **空間模擬 vs 結構操作**:`getNextCoordinates` 的心智模型是「座標位移 → collision detection 反推 drop target」— 樹的重排是**結構**操作(sibling 序 / parent 鏈),用座標模擬繞一大圈還要對抗 X/Y 雙軸偵測邏輯(`handleDragOver` 的 pointer 數學),M2(3rd-party 行為必驗)+ 脆弱度都高。
4. **派 B 根本沒有「drag session」**:每按一下就是一筆完整交易,dnd-kit 的 start/over/end session 模型不適用。

### 自建 handler 的形狀(設計層描述,非實作)

- 在既有 `handleKeyDown`(容器層)前段加 modifier 分支:`(e.metaKey || e.ctrlKey) && e.shiftKey && Arrow*` 且 `draggable && focusedId && !disabled(focused)` → `preventDefault` + 計算目標 → **直接呼叫 `onDragEndProp({sourceId, targetId, position})`** → 播報。
- 注意順序:現有「無焦點時方向鍵先聚焦第一項」分支(:536)會攔截 `e.key === 'ArrowDown'`(不分 modifier),modifier 分支必須排在它之前。
- 資料來源:sibling 序用既有 DOM query(`[data-tree-parent-id]` / `aria-level`)+ node registry(`getNodeInfo`),與 pointer 路徑同源。
- PointerSensor 路徑**一行不動**;兩路共用 `TreeDragEndEvent` 型別 + `onDragEnd` prop + registry + spec 的 position 語意。
- 互斥保護:`draggingId !== null`(pointer 拖曳中)時忽略鍵盤重排。

---

## 5. 鍵位方案(v1)

**Modifier 選擇:`Cmd/Ctrl + Shift + 方向鍵`(Notion 完全同款)。** 逐鍵衝突掃描:

| 候選 | 衝突 | 判定 |
|---|---|---|
| `Cmd+↑↓`(Asana 款)| macOS 瀏覽器 `Cmd+↑/↓` = 捲動/游標到文件頭尾;**`Cmd+←/→` = 瀏覽器上一頁/下一頁**(橫軸直接死)| ❌ |
| `Alt+↑↓`(VS Code 行移動款)| Windows `Alt+←` = 瀏覽器上一頁;Alt 組合在 NVDA/JAWS 下常觸發 menu bar | ❌ |
| `Cmd/Ctrl+Shift+方向鍵` | 文字輸入時 = 選取到行首尾/逐字選 — **只在 text field 生效,tree 內無此語意**;VoiceOver(Ctrl+Opt)/ NVDA(NVDA key)/ JAWS(Ins)修飾鍵皆不佔用;瀏覽器層無預設行為 | ✅ |

| 按鍵 | 行為 | 發出的事件 | 邊界(no-op + 播報) |
|---|---|---|---|
| `Cmd/Ctrl+Shift+↑` | 移到**上一個 sibling 之前**(同層上移一格;整個子樹一起動) | `{sourceId, targetId: prevSibling, position: 'before'}` | 已是第一個 sibling → no-op,播「已在最上方」 |
| `Cmd/Ctrl+Shift+↓` | 移到**下一個 sibling 之後**(跳過 sibling 的整個子樹,不會鑽進去) | `{sourceId, targetId: nextSibling, position: 'after'}` | 已是最後一個 → 播「已在最下方」 |
| `Cmd/Ctrl+Shift+→` | **移入**:成為上一個 sibling 的子項(indent) | `{sourceId, targetId: prevSibling, position: 'inside'}` | 無上一 sibling,或上一 sibling 非 folder(`hasChildren=false`,沿用 pointer「inside 限 folder」規則)→ 播「無法移入」 |
| `Cmd/Ctrl+Shift+←` | **移出**:成為 parent 的下一個 sibling(outdent) | `{sourceId, targetId: parentId, position: 'after'}` | 已在 root 層 → 播「已在最外層」 |

語意細則:
- **焦點跟隨免費獲得**:`focusedId` 是 node id,節點移動後 id 不變 → `aria-activedescendant` 自動指向新位置,零焦點簿記(這是虛擬焦點模型的紅利)。惟移動後需觸發一次 `scrollIntoView`(現有 effect 只在 `isFocused` 變化時跑,同 id 移動不會 re-fire — 落地時的實作註記)。
- **移入 collapsed folder**:允許;DS 同時自動展開該 folder(pointer 路徑 500ms hover auto-expand 的鍵盤對應物,讓使用者看得到移去哪 + 能連續操作)。
- **disabled sibling**:不能當 target 錨點(pointer 的 `useDroppable` 也 disable 它們);上下移動時跳過 disabled sibling,用最近的非 disabled sibling 表達 before/after(可達位置與 pointer 一致)。
- **multi-select 模式**:v1 只移動 focused node(非 selected 集合)— pointer 路徑同樣單節點,parity 成立;批次移動列 v2。
- **`expandOnSelect` / selection 不受影響**:重排不改變 selectedIds;modifier 鍵位與 select 完全正交。
- **結構安全**:↑↓ 只在 sibling 間、→ 只進 prev sibling、← 只出 parent — **任何序列都不可能把節點移進自己的子樹**,不需 cycle guard(grab-mode 派需要;pointer 路徑今天疑似也缺這個 guard — 見 §9 風險 R6)。

---

## 6. SR 播報設計

**載體(誰 own live region)**:TreeView 自己 — root 內渲染一個 `<div role="status" aria-live="polite" className="sr-only">`(消費 `select-menu.tsx:143` 既有先例;polite 級對齊 BulkActionBar,不用 assertive/alert — 重排是使用者主動操作的結果確認,非警告)。**不能**借 dnd-kit DndContext 的 live region — 它只播 dnd-kit 管理的 drag session,自建路徑觸不到它。

**播報文案表**(格式對齊 Dragon Drop「新位置 + 序數」+ Atlassian「帶對象名 + 來源/目的地」實證):

| 時機 | 文案模板(zh-TW 預設) |
|---|---|
| 同層上/下移 | 「已將『{label}』移到『{targetLabel}』{之前/之後},第 {n} 項,共 {m} 項」 |
| 移入 folder | 「已將『{label}』移入『{folderLabel}』,第 {n} 項,共 {m} 項」 |
| 移出到上層 | 「已將『{label}』移出到『{parentLabel}』之後,第 {level} 層」 |
| 邊界 no-op | 「已在最上方」/「已在最下方」/「無法移入:『{X}』不是資料夾」/「已在最外層」 |

- 序數(第 n 項/共 m 項)由 DOM sibling query 計算 — 對非視覺使用者,這就是 Atlassian 批評「方向鍵沒有位置感」的解方。
- **操作說明(instructions)**:tree 容器加 `aria-describedby` 指向 sr-only 說明節點:「按 Cmd(Ctrl)+Shift+方向鍵可重新排列項目」— 對齊 dnd-kit `screenReaderInstructions` / Dragon Drop `aria-describedby` 慣例。只在 `draggable` 時渲染。
- **`aria-roledescription`** 維持現狀(treeitem 上已有,D4 保留)。可選加 `aria-keyshortcuts="Meta+Shift+ArrowUp Meta+Shift+ArrowDown …"`(DS 目前無使用先例,列 open question,非必要)。
- **i18n**:預設 zh-TW 字串 + `reorderAnnouncements` prop 允許 consumer 覆寫(對齊 dnd-kit `announcements` 四-callback 形狀,但我們是 5 情境 map)。**預設語言要 zh 還是 en,需 user 拍板**(DS 文件全 zh,但 npm package consumer 可能有英文產品)。

---

## 7. 視覺回饋

派 B 是「每按即 commit」— **沒有懸浮預覽 phase,節點真實移動就是回饋本體**,因此:

- **不使用** `dropIndicatorRow` / `dropIndicatorInside` / `DragOverlay` ghost / `dragSourceClass`(這些全是「預覽中」的視覺語言;用在已 commit 的操作上反而說謊)。`drag-visual.ts` SSOT 零改動。
- 保留既有兩件事就夠:**keyboard focus ring**(`ring-2 ring-ring ring-inset`,`isKeyboardRef` 本來就會是 true)跟隨節點到新位置 + **`scrollIntoView`**(§5 註記)。
- 可選 v2 糖:landing flash(移動後 row 短暫 `bg-primary-subtle` 淡出,Asana 式)— 涉及新視覺 canonical(SSOT-affecting),v1 不做,若做需另行拍板。
- 對照:若 v2 做 grab-mode(派 A),屆時才復用 dropIndicator 系列 — 視覺 SSOT 已備好,無需新 token。

---

## 8. Scope 邊界與分期

**WCAG 2.1.1 parity 論證**:pointer 能做到「移到任意可見位置 + 移入任意 folder」;派 B 的四鍵(同層移動 × 進出層)可組合出**任何**合法樹位置 → 能力 parity 成立(步數較多但功能完備)。若 v1 只做同層、不做 →←,keyboard 就無法 reparent = parity 破口 → **→← 必須進 v1**。

| 期 | 內容 | 理由 |
|---|---|---|
| **v1** | 四鍵重排(↑↓→←)+ live region 播報 + sr-only instructions + `reorderAnnouncements` prop + spec 鍵盤表/A11y 段/DnD 段更新 + `KeyboardMatrix`/`Accessibility` anatomy story 更新 + axe 驗證 | 一次補齊 WCAG parity;全部落在既有 API 面(僅 +1 optional prop) |
| **v2 候選(各自獨立拍板)** | (a) 派 C recipe:story 示範 consumer 用 inlineActions ⋯ menu 放「上移/下移/移到…」(零 DS code);(b) grab-mode 預覽(復用 dropIndicator);(c) multi-select 批次移動(Asana 有);(d) `Cmd+Shift+Home/End` 移到頂/底(Figma `⌘⌥[]` 對應);(e) landing flash | 世界級也是這樣分期:Notion 只有 modifier+arrow;react-aria 才有 grab-mode;Atlassian 只有 menu 派 — 沒有任何一家三派全做 |
| **明確不做** | 跨樹拖曳(pointer 也不支援,單 DndContext per tree);檔案樹式 auto-sort consumer 的鍵盤重排(不開 draggable 即可) | parity 以 pointer 現有能力為準 |

---

## 9. 風險

| # | 風險 | 緩解 |
|---|---|---|
| R1 | 冷門平台/輸入法攔截 `Cmd/Ctrl+Shift+Arrow`(如 Windows 螢幕旋轉熱鍵 `Ctrl+Alt+Arrow` 是別組;Linux WM 各異) | 鍵位僅在 tree 聚焦時生效;spec 記載;v2 派 C menu recipe 是永遠可用的替代路 |
| R2 | 每按一下 fire 一次 `onDragEnd` — 有伺服器持久化的 consumer 可能過量請求 | spec「Drag and Drop」段文件化「pointer 一手勢一次;keyboard 每步一次」+ 建議 consumer optimistic update / debounce;不改成 batch(違反每按即 commit 語意,且 blur 時 flush 有掉單風險) |
| R3 | 播報預設語言(zh vs en)影響非中文產品 | open question 給 user 拍板;prop 可覆寫 |
| R4 | `aria-live` 在快速連按時播報堆疊 | 單一 live region 節點覆寫式更新(textContent 替換,非 append)= 天然只播最新;對齊 SelectMenu 先例 |
| R5 | 現有 keydown 的「無焦點時聚焦第一項」分支會吃掉帶 modifier 的方向鍵 | 設計已註記:modifier 分支置前(§4) |
| R6 | **鄰近發現(out of scope)**:pointer 路徑疑似可把 folder 拖進自己的子樹(`handleDragOver` 只擋 `over.id === active.id`,未擋 descendants)— 未 runtime 驗證,僅 code 閱讀推測 | 落地 v1 時順手 runtime verify;若屬實另開 surgical fix(不混入本設計) |
| R7 | `aria-keyshortcuts` 無 DS 先例 | 列 optional,不進 v1 必做清單 |

---

## 10. 落地清單(M3 code/spec/story 三方聯動;供 v1 實作 session 用)

1. `tree-view.tsx`:`handleKeyDown` modifier 分支 + live region 節點 + instructions 節點 + `reorderAnnouncements?` prop + 移動後 scrollIntoView。
2. `tree-view.spec.md`:鍵盤導覽表 +4 行;「Drag and Drop」段補「鍵盤重排」小節(含 R2 契約說明);A11y 段改寫 :386 現況記錄為新能力描述 + live region/instructions 說明;「被引用」不動。
3. `tree-view.anatomy.stories.tsx`:`KeyboardMatrix` 補 4 鍵;`Accessibility` story 補播報說明。`tree-view.stories.tsx` `DragAndDrop` story 補鍵盤操作示範(story 的 onDragEnd 已是真 reorder handler,鍵盤路徑直接吃到)。
4. 驗證:axe 0 violation + Storybook 手測(VoiceOver 走一輪)+ `npx tsc -b`(若動型別 surface 則 `build:lib`)。

## 11. 需 user 拍板的點(SSOT-affecting)

1. **派別**:推薦 B(modifier+arrow)為 v1 主路徑 — 同意?(§2 三派 tradeoff)
2. **鍵位**:`Cmd/Ctrl+Shift+方向鍵`(Notion 同款)— 同意?(§5 衝突掃描)
3. **播報預設語言**:zh-TW 預設 + prop 覆寫(R3)— 同意 zh?
4. v2 候選清單(§8)先掛著不排期 — 同意?
