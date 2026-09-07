<!-- Authority/status: governance/planning/registry.json -->
# 焦點語彙與拖曳無障礙 — 待辦總帳(2026-09-06 開,live)

**為什麼有這份文件**:2026-09-06 的長 session 產生了大量已定案但未實作、以及已實測但未處理的項目。
user 問「所有未完成任務都有持續追蹤嗎」時,當場查出兩個未推的 commit、一個研究殘留目錄,
以及一個**完全漏追的項目**(虛擬捲動崩潰)。結論很簡單:**待辦活在對話裡不可靠**。
(2026-09-06 補:研究 agent 在 repo 根目錄留下的 `scratch-probe/` 未被 gitignore,刪除指令被權限擋下 —— 它是 untracked,不會進版本庫,但下次 `git add -A` 前要先確認。)
本檔是唯一的 live 清單;完成一項就在此標記,不要只在對話裡宣稱。

**引用紀律**:每一項都附可驗證位置。標「已驗證」者必須寫出驗證方式與結果,不得只寫「已修」。

---

## A. 卡在決策或研究(不能先做)

| # | 項目 | 卡在哪 |
|---|---|---|
| A1 | ~~全 DS 焦點指示 SSOT 文件~~ | **已解除並落地** → `packages/design-system/ds-canonical/references/focus-canonical.md`。研究結論:**不該外擴選單模型**,W3C 自己正在把 hover 移焦點從選單規範撤除(`w3c/aria-practices#3238` 今天仍 OPEN;2025-02-18 Task Force「Hearing none」) |
| A2 | ~~內描邊 vs 外描邊的決定規則~~ | **已寫入 A1 文件**「內描邊 vs 外描邊」段 |
| A3 | `--neutral-selected-focus` 的處置 | **2026-09-06 撤回先前敘述**:原本寫「user 已拍板退役」= 把 user 的話放大(M36(a))。user 原話是「把焦點底色那些**沒用到的**token該刪的就刪一刪」,授權範圍是刪死用法。本 token 有 4 個活用法且 `color.spec.md:694` 有 WCAG 理由。**要不要統一、往哪邊統一,未拍板** |
| A5 | ~~「選中列 × 鍵盤游標」該用深一階底色還是 ring~~ | **2026-09-07 user 拍板:畫框。** 原話「A5畫框」。同一則追加待研究題:「框線何時用 ring 何時用 outline 何時用 0 間隙何時用 1px 何時用 2px?是否有合理規則?以及是否有些要整合?」→ 幾何規則由 A11 研究後落地 |
| A5-舊 | (原敘述保留供追溯)| DS 現況兩種並存:深一階底色 4 處(DropdownMenu / SelectMenu / AgentPanel / Sidebar)vs ring 1 處(TreeView)。屬產品/UI/UX SSOT 真取捨,**待 A7 研究回來後拍板**。注意:乙案(維持深一階底色)本身就是這題要決定的事,不能拿來當現成選項 |
| A6 | **`item-anatomy.spec.md` 缺一格:「未選中列 × 鍵盤焦點」** | 2026-09-06 查出。`:171-175` 那張 2026-08-11 user 拍板的表三列**全部**以「選中列 ×」開頭,從未涵蓋未選中的列。7 個消費者各自填空,能查到的三處全填 `bg-neutral-hover`(= 跟滑鼠 hover 同色):`dropdown-menu.tsx:25/36`(Radix,滑鼠會搬走反白 → 只會有一個高亮,**正確**)、`sidebar.tsx:939`(常駐,兩個可同時亮 → **壞**)、`menu-item.tsx:49`(被 SelectMenu 全選列以 `tabIndex={0}` 啟用,在 cmdk 清單外 → **壞**)。**這一格才是側邊欄與全選列兩個 bug 的共同根因**;修法是在 family owner 補格(擴充 SSOT),不是在消費者端各自處理,也不是開例外 |
| A10 | 全 DS 焦點徹查五題 —— **已回,五題全部未通過對抗驗證**(workflow `w63027x3j`)| 驗證抓到的比研究本身重要:(1) 「outline 遷移」建議會靜默弄壞 20 處(見 C13);(2) 盤點漏一半(41 行 vs 23);(3) 「全DS對照」那份**重新提出了 2026-09-06 已撤回的版本**(要求選單畫 ring),驗證者引 `focus-canonical.md` 的勘誤段駁回 —— **SSOT 有發揮作用**;(4) 它還想把 A5 那格標成可 AUTO,被駁。(5) 各家矩陣的「(c) 常駐清單 7 家 0 例外」被駁:Ant 的常駐側欄是 `Menu mode="inline"`(rc-menu),`useActive` 無條件 `onMouseEnter → onActive`,**Ant 是「一律搬」的真實反例**(待自行複驗)|
| A7 | 三題研究 —— **已回,三題全部未通過對抗驗證**(workflow `wkwrala0w`)| 站得住的部分已抽出到 C13/C14 與下方。**最重要的一條是程序性的**:研究稿對第一題的結論是「不該統一,兩條路都對」,而 user 2026-09-06 已逐字說過「當然是按照 tree view 啊,我們不就是要確保整個ds 有SSOT有一致的設計語言嗎?」——**驗證者抓到那是 AI 拿 benchmark 覆蓋 user 已表達的方向**。不採納。A5 仍待 user 拍板,但拍板的起點是 user 已說的話,不是研究稿的反向結論 |
| A9 | ~~焦點框機制要收斂到哪一套~~ | **2026-09-07 user 拍板:用甲(全域 `outline`)。** 原話「A9用甲啊」。**但附條件**,原話:「甲那麼完美當初為何不直接用甲,你確定其中沒有陷阱對嗎?當初不選甲是否有合理理由?仔細研究查證,**確保在做到理想狀態後都沒有缺點且不會改壞任何東西就用甲**」→ 條件由 A11 研究滿足後才動工 |
| A11a | ~~當初為何不用 outline~~ | **2026-09-07 已答,但我先前的版本有兩處錯,已訂正(全部自行複驗)。** ①**時間錯了**:全域 outline **不是** 2026-05-29 才加 —— `git show da71b526:src/globals.css` 第 43-46 行就有 `:focus-visible{outline:2px solid var(--ring);outline-offset:2px}`,與 `outline-none` **同一個 commit、同一天**;`46147373` 是搬家(`globals.css` −39 / `base.css` +48 new file),不是新增。真相更難堪:同一次貼上裡,`button.tsx:53` 就把剛寫好的全域框關掉了。②**「0 事故」錯了**:我只掃治理文件與 commit message,沒掃原始碼註解。`data-table.tsx:3279-3286` 有一筆完整事故 —— 2026-05-12 **user 親自抓**「為什麼按 shift 那麼容易會在 table 外圈出現一層藍色邊框」,根因逐字點名 `globals.css L63「outline: 2px solid var(--ring)」`,對策就是 `outline-none`。但**該事故是「全域框對 tabIndex=0 的容器太積極」,不是「outline 這個機制不好」**。③照抄 shadcn 有逐字元鐵證:`fad4f825` 的 Dialog 關閉鈕 class 與 shadcn-ui@0.8.0 upstream 逐字元相同,含一個本 repo **從未定義過**的 token `ring-offset-background`。④當年選 ring 的唯一站得住理由:`outline` 跟隨 `border-radius` 到 Safari **16.4**(2023-03)才支援,shadcn 是 2023 初產物;本 repo 初始 commit 2026-03-25,**該理由已過期三年** |
| A11 | **A5/A9 落地前的其餘三項查證**(2026-09-07 派出,workflow `wmd94l43i`) | (1) 當初為何選 `outline-none` + `ring` 而不用 outline —— git 考古找出引入者與當時理由,判斷是不是 shadcn 預設帶進來的、有沒有記錄過真實事故;(2) outline 的真實缺點 —— 圓角瀏覽器下限、疊層、裁切、transition、forced-colors、列印、Safari 既知問題,**須實測或規範原文,禁推論**;(3) 幾何規則 —— 何時 0/1px/2px 間隙、何時內描邊,對照世界級並逐一驗 43 處是否容得下;(4) 遷移計畫含那 20 個同行 `outline-none` |
| A9-舊 | (原敘述保留供追溯)| 現況兩套並存、五種幾何(見 C16)。(甲) 全域 `outline`:天生透明間隙(無 C13 白邊問題)、跟隨圓角、forced-colors 下仍繪製;(乙) Tailwind `ring`:DS 現有 40 處在用,但間隙寫死白且 `inherits:false` 無法用 token 修。**遷移任一方向都必須同時處理同行的 `outline-none`(20 處),否則靜默消失**。屬產品/UI/UX SSOT 取捨,**待 user 拍板** |
| A8 | `item-anatomy.spec.md` 消費者列表已與 code 分歧(AUTO,不需拍板)| 該表消費者仍列 TreeItem(single)／MenuItem／TimePicker 欄項,但 TreeView(`fd0aba47`)與 `menu-item.tsx:230` 已於 2026-09-06 移除該 token,TimePicker `time-columns.tsx:185` 仍在但是死碼。`git log --since=2026-09-05 -- item-anatomy.spec.md` 無 commit → spec 從未同步。屬 M29 spec↔code 分歧,純工程 |
| A4 | DataTable 列游標 | 依賴 A1。另有三個前提:`role="table"` 不能合法帶 `aria-activedescendant`(需遷 `grid`/`treegrid`)、虛擬捲動下 activedescendant 目標必須真實存在、同一列在三面板各渲染一次故 IDREF 歸屬未定 |

## B. 已定案、未實作

| # | 項目 | 依據 |
|---|---|---|
| B1 | `hug` 寬度下的頭像溢出量測 | user 已確認語意:寬度跟著內容長,長到容器允許的最大寬度才停,再多才溢出。改法:量 field wrapper 的**父層**(containing block)減去 wrapper padding/border 與同排 slot;`fill` 逐像素零影響(實測 600 容器 → 550,與現況相同),並以 `width === 'hug'` gate。現況:`person-display.tsx` 量 `el.parentElement`,在 hug 下該父層本身會縮 → 自我回饋,實測 600px 容器只量到 90px、5 人以上永遠「3 顆 + +N」 |
| B2 | 繁中拖曳播報 | dnd-kit 的 `DndContext` 無條件渲染 live region(`core.esm.js:3363`),預設字串為英文且 `aria-live="assertive"`(會打斷)。我們從未傳 `accessibility.announcements`(`DndContext.d.ts:12-17` 是唯一入口)。TreeView 已有自己的繁中 polite 區可作結構參考 |

## C. 已實測、未處理

| # | 項目 | 證據 | 嚴重度 |
|---|---|---|---|
| C1 | dnd-kit 會播報「已放到 X」但順序其實沒變 | 它從自己的 `onDragEnd`(`core.esm.js:71`)播報,不知道我們的中點守衛在 `data-table.tsx` 已 return、未走到 `onColumnReorder` | **高**(對螢幕閱讀器宣稱假結果)|
| C2 | TreeView 的繁中播報區全程是空的 | 實測整趟滑鼠拖曳下來內容維持 `""`;其 `DndDescribedBy` 節點 0 引用(死 DOM) | 高 |
| C3 | 欄位鍵盤重排方向不對稱 | 我實測 ArrowRight×10 可移動(Category 第 3→第 5 欄);獨立研究三次向右皆不動、向左才動。**兩個相反結果,未收斂** | 高(需重驗) |
| C4 | 欄位顯示面板 0 像素即啟動拖曳 | 單次 `pointerdown` 零位移即觸發 `aria-pressed=true` + 兩則 assertive 播報 | 中 |
| C5 | 拖影複製品帶 `role="columnheader"` | 拖曳中查詢得到 8 個表頭(實際 7 欄) | 中 |
| C6 | Slider 用邊框變色當焦點 | `slider.tsx:167-168` 註解明寫「不加 ring 或 halo」;它不是文字輸入,在 A1 規則下會成為違規,需豁免或改 | 中 |
| C7 | 「明確不顯示焦點」7 處未逐一驗證 | 合法情形是指示器畫在別的元素上(如 `agent-panel-fab.tsx:744` 自身 `outline-none`、指示器在 `:778`);不合法即 WCAG 2.4.7 違規 | 中 |
| C8 | 「四件成套」與實際值不符 | `color.spec.md:688` 稱四件;實際 `semantic.css:369-372` 中 `-focus` 與 `-active` 同為 neutral-3、`-hover` 與 `--neutral-hover` 同為 neutral-1 → 只有三個相異值,選中×焦點與選中×按壓畫面上分不出來 | 中 |
| C9 | I27a / I27b 兩個閘可能假綠 | I27a 取固定 2600 字元視窗 + 負向正則;I27b 以 `img >= 2` 自選儲存格,已棘輪成「1 顆 + +N」的格子(只有 1 張圖)會被跳過 | 中 |
| C16 | **全 DS 同時存在 5 種焦點框幾何**(2026-09-07 自行重跑確認)| (a) 全域 `base.css:44-47` `outline:2px solid var(--ring); outline-offset:2px`;(b) `ring-offset-1` 17 處(2px 框 + 1px 白隙);(c) `ring-offset-2` 6 處;(d) `focus-visible:ring-2` 無 offset 無 inset 15 處(0 隙);(e) `ring-inset` 2 處。**這才是 user 要求「焦點框粗細顏色圓角至少要一致」做不到的根因** —— 不是哪個元件寫錯,是兩套機制(全域 outline vs Tailwind ring box-shadow)並存且幾何互不相同。收斂到哪一套是**產品/UI/UX SSOT 取捨,待 user 拍板**(新增 A9)| **高** |
| C13 | `ring-offset` 的間隙是寫死的白 | **數字更正**:渲染路徑 **23 處**(19 檔),先前對 user 講的「36 處」含 stories,是錯的;全部 50 行 = 23 code + 13 stories + 14 spec。機制:Tailwind 4.2.2 `@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}`,全 repo 0 處覆寫。深色實測焦點按鈕 box-shadow = `rgb(255,255,255) 0 0 0 1px, oklch(0.63 0.22 258) 0 0 0 3px`。**關鍵限制**:`inherits:false` ⇒ 寫進 `semantic.css` 的 `:root` token 區**完全不會生效且靜默無錯**,只能用 universal selector(`*, ::before, ::after, ::backdrop`,即 Tailwind 自己 `@layer properties` 的形狀)。透明色也不行 —— box-shadow 疊序讓較寬的 ring 從透明層透出來。若改用 canvas,深色下是 `rgb(10,10,10)`(`semantic.css:427` → `--color-neutral-1-opaque`,dark `--_na1: 4%`),不是研究稿寫的 26 或 28(那是它自建 harness 硬寫的假 `#1a1a1a`)。**⚠️ 2026-09-07 危險更正**:先前對 user 說「把 23 處改成 outline」是**錯的且危險** —— 自行重跑確認 **23 處裡有 20 處同一行就寫了 `outline-none`**,字面替換後 `outline-style:none` 仍在,焦點框會**完全消失且靜默無錯**(對抗驗證在真 Chrome 152 實測 p3:outlineStyle=none、boxShadow=none)。而且真正的焦點 ring 表面是 **43 行**不是 23,漏掉的 18 行含 `data-table.tsx:2427`(真 Tab 可聚焦的儲存格,用 `ring-inset`)| 中 |
| C14 | FileViewer 縮圖:選中與聚焦零像素差 | `file-viewer.tsx:639` `focus-visible:ring-2 focus-visible:ring-ring` 與 `:641` `active ? 'ring-2 ring-primary'`,而 `semantic.css:337` `--ring: var(--primary)` 是全 repo 唯一定義 → 兩者計算值相同。**已選中的縮圖被鍵盤聚焦時,畫面上 0 像素變化**。違反 APG「The selected state must be visually distinct from the focus indicator.」 | 中 |
| C15 | `.ringtest/` 研究殘留未 gitignore | 與先前的 `scratch-probe/` 同類。untracked,不會進版本庫,但 `git add -A` 前要留意 | 低 |
| C11 | TimePicker 的第四個死焦點底色 | `time-columns.tsx:185` 的 `focus-visible:bg-neutral-selected-focus` 恆不 match:listbox `tabIndex=0` + option `<button tabIndex={-1}>`,全檔 `.focus()` 0 命中,導航靠 `aria-activedescendant`(`:159`)。**前一輪宣稱「兩處死用法已清完」是沒掃乾淨** —— 當時只查寫著 `focus-visible:bg-` 的列元件,沒反過來對每個用法驗「這元素拿得到 DOM 焦點嗎」 | 中 |
| C10 | `hooks/scripts` 符號連結方向 | 版本庫記錄指向 `packages/design-system/ds-canonical/hooks`(canonical),工作區被改成指向 `.claude/hooks`(生成視圖)。內容相同故行為一致,但方向與 AGENTS.md 的 `.claude` 屬 non-authority 相反。**非本 session 造成,未裁示** | 低 |

## D. 已驗證關閉

| # | 項目 | 驗證 |
|---|---|---|
| D1 | dark mode 捲軸接縫 | 三區與 header 全部不自畫底色、由 root 提供;真瀏覽器 dark mode 取樣三處同色。機械閘 I28 守之 |
| D2 | 拖曳把手的紅框與藍底 | 皆非 user 定義(紅=2026-05-08 `4c867134` 實作者自加;藍=2026-05-21 `e58576a6` 的 `aria-pressed` 副作用)。已移除,實測拖曳全程 bg/border/color 與平常態相同 |
| D3 | 拖曳中隱藏來源把手 | user 提案;實測拖曳中 opacity 0、來源列 0.45、放開回 1;指標拖曳仍通(PRD-002 第 2→第 5 列)|
| D4 | 進階篩選 story 7→3 | 合併入口零內容損失;逐項讀控件值驗證五種情境俱在(長標籤格實際渲染出「+3」)|
| D5 | 推播檢查接線 | registry 宣告 → adapter 匯出 → hook 消費;生成視圖 claude=true / codex=false / generic=false |
| D6 | codex 讀不到 repo | 巢狀沙箱自鎖;改為用完即丟 worktree,實測可讀 |
| D7 | `aria-pressed` 四個灑點 | 收進 `lib/drag-visual.ts` 的 `forwardDragActivatorAttributes()` |
| D8 | 兩處永不觸發的焦點底色 | TreeView(虛擬焦點)與 MenuItem(`<div role="option">`)已移除;P0 hook 教義補上 selector 判準 |
| D9 | 焦點指示跨元件 SSOT | `references/focus-canonical.md`。**初稿規則二判準錯誤(把「兩段式」外推到選單與按鈕,與既有 owner `menu-item.spec.md:301` 相反),同日經 user 三個提問抓出並改寫**為「底色有沒有被選中佔走」;同時修正「5 個活用法全在 Radix 系」的錯誤敘述與 A3 的 provenance 放大。現行版本 170 行 |
| D11 | 日曆兩種灰(C12 結案)| 根因:`outside` 與 `disabled` 是 RDP 兩個獨立 modifier,className 同時串上同一格,特異性相同 → stylesheet 順序決勝,`text-fg-muted`(45%)贏過 `text-fg-disabled`(25%),導致非本月又不可選的日子反而更深。**規格本來就有答案**(`date-grid.spec.md:106` outside 的前提是「仍可 hover / 可點」、`:201` disabled → `text-fg-disabled`(M24)),是 code 沒照做。修法把 outside 的前提寫進選擇器:`[&>button:not(:disabled):not([aria-disabled="true"])]:text-fg-muted`,不用 `!important`。驗證:用 repo 自己的 tailwindcss 4.2.2 compile API 實編確認產出該選擇器(含對照組);`build:lib` exit 0;檔頭 state 表與 spec.md:106 同步 |
| D10 | TreeView 落點底色被蓋掉(本次新抓到)| 兩個都會發生的 bug:**已選中**的列 twMerge 直接刪掉 `bg-drop-target`;**未選中**的列 hover 特異性較高蓋掉它,而游標必然就停在該列上(dnd-kit 全程不呼叫 `setPointerCapture`,0 命中,故 `:hover` 照樣命中)。修法:`dropIndicatorInside` 自帶 `hover:` 同色 + 在 `cn()` 內移到所有 `bg-*` 之後。實跑 tailwind-merge 3.5.0 四種組合全 PASS;`build:lib` exit 0 |

## E. 複現不出、因果未證(不得宣稱已解決)

| # | 項目 | 現況 |
|---|---|---|
| E1 | 虛擬捲動崩潰(user 報「50 筆虛擬表捲一捲就會出錯」) | 疑似由 `ac8750b0`(復原釘選面板的 `relative`,修無限重繪)修掉,但**修之前未能重現原始症狀,故無法證明因果**。2026-09-06 實測預覽站:列拖曳×虛擬捲動 12 次全高來回 0 錯誤;欄位釘選(含 50 筆)同樣 0 錯誤;**拖曳中同時大幅捲動 10 次**列數穩定 20、0 錯誤。再遇到需截圖從該狀態反推 |
| E2 | Reviewers「+2」溢出 | 量測基準錯誤已修(量自己 → 量被分配到的空間),但**未能重現 user 截圖的觸發時機**,同樣不宣稱已重現並修好 |

## F. user 已裁示為 backlog

- 「上移／下移」單指標控制項(WCAG 2.5.7 + `drag-canonical.md` invariant 6)。落地形式已定:該列 `rowActions` overflow 選單多兩個項目,樣式沿用既有 menu、無新 token;僅 API 歸屬(DS 於 `enableRowDrag` 時自動注入 vs consumer 自加)待定
- Agent 面板規格的實作(2026-08-11 隔離令仍有效:user 排定前不得寫進 `packages/design-system/src/**`、token、hook、M-rule)

## G. Agent 原則的三個落地差距(2026-09-07 user 指派,跨模型對辯中)

權威 = agent 原則 v14 的七條(A 內容資格 / B 呈現 / C 導航 / D 連結責任 / E 持續使用 / F 生命週期 / G 網址邊界)。
`governance/planning/2026-08-11-agent-ui-panel-spec.md` **整份過時**,不得引用。

| # | 差距 | 錨點(2026-09-07 逐一核對無誤)|
|---|---|---|
| G1 | Dialog 的背景隔離會把 agent 一起關掉 | `dialog.spec.md:185`:Radix 刻意不設 `aria-modal`,改用 `hideOthers()` 把背景兄弟節點設 `aria-hidden` + FocusScope trap。有 URL 的 Modal 一開,agent 就被標成隱藏、焦點進不去 → A 條落不了地。要調整的是**整個互動隔離範圍**,不能只縮遮罩 |
| G2 | 面板關閉時整個卸載 | `agent-panel-fab.tsx:813` 附近「`defaultOpen` 非受控初始開關;**預設開**」、`:818`「面板內容;**關閉時不渲染**(與入口鈕互斥)」→ 保不住 F 條「初始化為關閉」與 E 條「閱讀位置保存」|
| G3 | 推擠與斷點掛在 backlog | `agent-panel.spec.md:83`:「面板與 app 的推擠/斷點=backlog(本輪僅元件內規格)」→ B 條要落地得先解 |

**進行方式**(user 2026-09-07 指定):與 codex 來回討論辯論至有共識。已驗證 codex 傳輸可用
(`node scripts/codex-exec.mjs --check` → `TRANSPORT_OK`,exit 0)。workflow `wc20yypmr`:
Claude 三路 Phase A 獨立提案 → codex 隔離 context 獨立提案 → 兩輪對辯 → 共識 → 判斷能否產出示意範例。

**硬約束**(任一違反即方案不成立):不得讓 DS 元件變得不通用(沒有 agent 的 consumer 須零影響)/
不得改壞 Dialog 對「沒有 URL 的 Modal」的既有隔離(那正是 A 條要的)/ ≥3 家世界級對照附 citation /
優先消費既有 token pattern / 附機械驗證方案(M32:量數值不驗屬性存在)。

**2026-08-11 隔離令仍有效**:user 排定前不得寫進 `packages/design-system/src/**`、token、hook、M-rule。本輪只產方案。

### G 區進度(2026-09-07 跨模型對辯 workflow `wc20yypmr` 已完成兩輪)

Claude 三路 Phase A → codex 隔離 context 獨立提案 → 我方逐點反駁收斂 → codex 對抗性審查。
兩輪都成功。共識合成那步因 schema 用中文欄位名被 API 拒(我的 bug),已用 `wvfjiusp6` 補跑。

**兩方互相抓到的實質錯誤(以下四條皆由主 agent 自行開檔複驗,非 pass-through)**

| # | 誰抓誰 | 內容 | 自驗證據 |
|---|---|---|---|
| 1 | codex 抓我方 | 我方寫「非 modal 路徑 `trapFocus:false`,Tab 會自然在 dialog 與 agent 間流動」—— **錯**。Radix 把 `loop` 寫死,不隨 modal 變 | `node_modules/@radix-ui/react-dialog/dist/index.mjs:216` `loop: true`;`react-focus-scope/dist/index.mjs:104` `if (!loop && !trapped) return;` → loop=true 時即使 trapped=false 也照跑 |
| 2 | 我方抓 codex | codex 由此跳到「必須自建 Content renderer」—— 推論過頭。我們傳給 `DialogPrimitive.Content` 的 `onKeyDown` 排在 FocusScope 之前(Slot mergeProps child-first),可先攔 Tab。**但此路尚未實測,依 M2 需先寫 POC** | `react-slot/dist/index.mjs:83-87` |
| 3 | 我方抓 codex | codex 提「解法放進 `AppShell.asideLayout`」—— 不成立,AgentPanel 根本不住在 AppShell 裡 | `grep -rl AgentPanel packages/design-system/src --include="*.tsx"` 中 AppShell 檔案 **0 命中** |
| 4 | codex 抓我方 | 我方誇大「關閉必然停掉回覆或清草稿」。實際 story 把 draft/timer 放在 Dock 外,關面板後照跑照留;真正救不回的只有 DOM-only 的東西 | `agent-panel.stories.tsx:445-472` |

**這輪順手挖出兩個既有 bug(與 agent 原則無關,今天就在)**

| # | Bug | 證據 | 嚴重度 |
|---|---|---|---|
| G4 | **差距 1 的現況不是「一起關掉」而是「半殘」,且已構成一筆 axe `aria-hidden-focus` 違規** | `aria-hidden/dist/es2015/index.js:131-133` 明文保留 `[aria-live]` 節點(附上游 issue 連結),而 `agent-panel.tsx:658` 正好有 `aria-live="polite"` → 訊息流逃過,但**兄弟節點**(標題列/輸入框/把手)被設 `aria-hidden="true"`,同時 `dismissable-layer` 設 `body{pointer-events:none}`,FocusScope 把焦點彈回。結果「看得到、讀得到、按不了、Tab 不進去」,而面板內控件**仍留在 tab order** = aria-hidden 節點內有可聚焦元素 | 高 |
| G5 | **`aria-valuemax` 與實際上限不同源** | `agent-panel.tsx:198` 傳 `max={PANEL_WIDTH_MAX}`(=640,`:119`),但真正生效的是 `clampPanelWidth`(`:122-125`)= `min(640, floor(innerWidth/2))`。視窗 900 時實際上限 450,螢幕閱讀器卻念 **640**;按 End 元件宣稱跳 640、實際停 450 | 中 |

**已浮現、待 user 拍板的產品/UI/UX 取捨(共識合成會再確認清單完整性)**

1. 遮罩要不要蓋住 agent 那一欄(視覺語意:Material/Polaris 的整頁壓暗 vs VS Code/Copilot 的常駐區不壓暗)
2. Modal 開著、agent 是關的時候,FAB 還能不能按開(A 條給「協作資格」,B 條說「agent 開啟且…」,兩條都沒回答「能不能新開」)
3. 焦點在 agent 內時 Esc 歸誰(Radix layer stack 會判給最上層 = Modal → 在 agent 輸入框打字按 Esc 會關掉 Modal)
4. 面板關閉期間 `aria-live` 靜音 —— 要不要在面板外補一個 polite region 說「代理已回覆」(明眼人有 FAB 招喚態,螢幕閱讀器使用者零訊號)
5. **50% 條款的基準由「視窗」改「舞台」** —— `agent-panel.spec.md:76` 明文是「≤ **視窗**寬 50%」。兩方都認為該改成舞台,但**兩方都拿不出 user 原話**,屬 user-visible 語意變更(M36)
6. `hostMinWidth` 預設值 —— 兩方都提 768,但理由都只是「借用既有 `use-is-narrow-viewport.ts:3` 的 breakpoint」,無世界級依據(查到 Android window size class 的 compact 界線是 600dp,Material/MUI 對 companion 場景沒給數字)

### A5 幾何規則(A11(3) 產出)

**規則一句話**:焦點框永遠是 `outline: 2px solid var(--ring)`,離元件 **2px**;只有當這個元件**本身就是那個格子或那塊捲動區**(四周沒有間隙、框一畫出去就被裁)時,改成畫在裡面 `outline-offset: -2px`。**不用 `ring-*`,沒有 1px,沒有 0。**

**收斂:5 種幾何 → 2 種。** 外側那一種**早就寫在 `base.css:44-47`**,所以絕大多數元件是**刪掉那串 class**,不是新增樣式。

世界級對照(皆查原始碼):Material 3 = 2 種(`inward` 屬性切)/ Atlassian = 2 種(`isInset` boolean)/ Adobe Spectrum = 2 種(是不是輸入框)/ **Carbon = 1 種(永遠 `outline-offset:-2`)** / **Primer = 1 種(預設 -2)** / shadcn v4 = 1 種(永遠貼邊)。**沒有一家超過 2 種。**

### A9 的條件目前**尚未滿足**,不動工。五個真陷阱(全部實測或規範原文)

| # | 陷阱 | 能不能繞 |
|---|---|---|
| T1 | **DataTable 的 hover 已經把 outline 這條通道用掉了**(`field-wrapper.tsx:311` `nakedCellEditableDisplayHover` 用 `hover:outline`)→ 那一塊「完全沒缺點」不成立 | **繞不掉**,需單獨設計 |
| T2 | **15 處 `focus-visible:ring-2` 無 offset 只需 2px;全域規則需 4px**。實測:只留 3px 餘裕的裁切容器裡,ring-2 完整、outline-2+offset-2 **只露 1px** | 可繞(該處改 offset-0 或內描邊)|
| T3 | **`outline` 不能淡出** —— `outline-style` 不可動畫;`getAnimations()` 實測 transition 清單只有 color/offset/width | 可接受 |
| T4 | Safari **16.4 對 16.4**,零餘裕 | 不構成新風險 |
| T5 | WebKit bug **311408**「Outline is not always drawn on top」仍 NEW | 重現需 `mix-blend-mode`,本 repo 用量 **0** |

**反向事實**:現況 ring 有一個 **live 的無障礙 bug** —— 高對比模式下 `box-shadow` 被強制 `none`(MDN 明文),那 20 個 `outline-none + ring` 的元件**完全沒有焦點框**。**兩邊都有洞**,不是「無瑕現況 vs 有風險新方案」。

**推翻研究稿一條**:「`outline` 沒有 inset 等價物」**不成立**。自驗:`outline-offset` 負值本 repo **已有 6 處 tsx 生產用法**,且正在捲動/裁切容器上(`scroll-area.tsx:69`、`data-table.tsx:3453`、`overlay-surface.tsx:187`、`resize-handle.tsx:228`、`time-columns.tsx:162`)。

### G 區共識:示意範例可行性 = **是**

順序 **2 → 3 → 1**(風險由低到高)。做完 2+3(不含 1)可示意 **B / E / F**;做完 1(需先過真瀏覽器 POC)才是完整 **A** 條。底子用 `agent-panel.stories.tsx:445` 的 Fab story。
**C / D / G 三條不在這三個差距裡**,要示意需補一個 story 內的最小假路由 —— 純工程。
待 user 拍板共 **8 條**(先前 6 條全部成立,共識稿另補 2 條)。

### 研究殘留(累積 7 項,全部 untracked)

`.ringprobe.tmp.mjs`、`.ringtest/`、`.tw-probe/`、`c-probe.mjs`、`scratch-probe/`、`tm-probe.mjs`、`tw-probe.mjs`。都不會進版本庫,但 `git add -A` 前必須先清。刪除指令在本 session 被權限擋下。

### G 區:user 2026-09-07 對 8 條待拍板的裁示(逐字保留)

| # | 題目 | user 原話 | 判定 |
|---|---|---|---|
| 1 | 遮罩要不要蓋住 agent 那一欄 | 「第一題,不要壓按」 | **拍板:不壓暗 agent。** 遮罩幾何從 `inset-0` 改成只蓋宿主內容區 |
| 2 | Modal 開著時 FAB 能不能按開 | 「這題不是可以從我一開始的原則草案推導出來嗎?有提供url的modal可以同時與agent使用,那就表示此情況的fab要被可以開啟才對吧?」 | **拍板:可以開,而且這是從 A 條推導出來的、本來就不該當成新決策問。** FAB 一併登記為常駐區域 |
| 3 | Esc 歸誰 | 「agent在此時的index是最高的吧?對吧?那你覺得esc要關誰?」 | **反問我,未拍板。** 我的答覆與 z-index 前提的查證併入 G6 對辯 |
| 4 | 關閉期間要不要補播報 | 「不用,頂多就是跳toast」 | **拍板:不加常駐 live region;最多用既有 Toast** |
| 5 | 50% 基準由視窗改舞台 | 「好」 | **拍板:改舞台。** `agent-panel.spec.md:76` 的「視窗」改「舞台」 |
| 6 | `hostMinWidth` 預設值 | 見下方 G6 —— user 未給數字,而是指出這題必須跟另外四件事一起想 | **未拍板,已開對辯** |

### G6:user 指出這題不能單獨決定(2026-09-07,逐字)

> 「這題難道不用跟agent何時會變為蓋板的breakpoint一起討論嗎?以及舞台內容可小於最小寬度是在其中水平捲動且依然可以同時操作agent嗎?那舞台內容的aside變為sheet的時候,該sheet所運用的空間是否是舞台空間而非整個容器空間?承上述,modal是否也是?換言之,會有的現象就是modal底下的mask的視覺範圍跟舞台內容是有可能不同的,依此來確保浮層不會那麼容易溢出舞台,且其通常不會透過舞台的水平捲軸來水平捲動,是我上述說的這樣嗎?仔細跟最強codex來回討論辯論」

拆成五個相扣的子題,已開跨模型對辯:
(a) `hostMinWidth` 與「何時翻成蓋板」是不是同一個判準的兩種寫法
(b) 舞台內容可否小於最小寬度、在舞台內水平捲動、同時仍可操作 agent
(c) 舞台內的 aside 變 Sheet 時,Sheet 佔的是**舞台空間**還是整個視窗
(d) Modal 是否同理
(e) 因此 modal 遮罩的視覺範圍會與舞台內容不同 —— 用意是讓浮層不易溢出舞台、且不需靠舞台的水平捲軸捲動

### T1 / T2 的答案(user 追問「怎麼修」「是哪些元件」)

**T1 不是繞不掉,是要定一條優先序。** 現況同一個可編輯儲存格上兩件事都在用 outline 家族:
- hover:`field-wrapper.tsx:311` `hover:outline hover:outline-1 hover:outline-offset-[-1px] hover:outline-[var(--cell-hover-outline-color,var(--border-hover))]` —— **1px 內描邊**
- focus:`data-table.tsx:2427` `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset` —— **2px 內描邊(box-shadow)**

兩者今天靠「不同 CSS 屬性」共存;焦點遷到 outline 後會搶同一個屬性。**解法:同一格上 focus 壓過 hover。**
依據不是發明:WCAG 1.4.11 Understanding 明文「The pointer itself, via its location, is the indicator of whether the user is hovering on a component. Therefore, additional author-supplied visual treatments for hover are not 'required to identify' the hover state.」——
**hover 已經有游標當指示器,focus 沒有**;而且這與 M24「state 勝 emphasis」同構。
注意:hover 與 focus 在**不同格**時不衝突(A 格有焦點框、B 格有 hover 框),只有同一格才需要優先序。

**T2 的 15 處**(現況 `focus-visible:ring-2` 無 offset 無 inset,即 0 間隙):
RadioGroup / Sidebar ×2(GroupAction、MenuAction)/ Calendar ×3 / DateGrid / FileViewer / Checkbox / Switch / AgentPanel ×2 / PeoplePicker / DataTable。

**user 的裁示(逐字):「關於t2如果內描邊沒問題就內描邊,這樣至少不會又多一種」** —— 採納。
所以 A5 的決定程序收斂成一句:**預設外 +2px;放不下(四周沒有 2px 空間、或會被祖先裁掉)就改內 −2px。仍然只有兩種,不新增第三種。**
待辦:逐一量這 15 處四周是否容得下 +2px,不夠的歸內描邊。

### G6 對辯結果(workflow `wqf761w5q`,兩輪皆成功,全程 playwright 1.59.1 實測)

**(a) 不需要 user 挑數字 —— 它是推導值。** 三個已 canonical 的量互鎖:
`A ≥ 360`(`agent-panel.tsx:119` PANEL_WIDTH_MIN)/ `A ≤ H/2`(user 9/7 裁示 #5「50% 改舞台」)/ 並排時 `H = W − A`
⇒ `A ≤ W/3` ⇒ **並排成立 ⟺ 容器寬 W ≥ 1080**,該格 `H = 720`、`A = 360`。
**兩份稿原本都想訂的 768,兩邊都用不上。零新魔術數字、零新 token。**
三處修正(codex 對、我方錯):W 必須量**含 agent 的整個容器**;公式只在並排形態成立(蓋板時 H=W,不適用,必須由不變量 W 推形態,這也是臨界震盪的解);640 上限不能掉 → 新 clamp `min(640, max(360, floor(W/3)))`。
**順手關掉 G5**:`agent-panel.tsx:198` 的 `max` 改傳同一個 clamp,`aria-valuemax` 與實際上限從此同源。

**(b) 可以,今天就成立(實測)。** `app-shell.tsx:268` 的 `<main>` 只寫 `overflow-y-auto`,依 CSS Overflow L3 §3.1 `overflow-x` 已是 `auto`。實測 `min-width:900` 內容放進 360 框 → `scrollWidth=900/clientWidth=360`;`scrollLeft` 0→200 後浮層 rect **Δ=0**,對照組(故意掛進 scroller)**Δ=−200**。
三個量永遠分開:`C` 內容最小寬(產品,每畫面不同,**完全不參與 (a) 的判準**)/ `H` 可視寬 / 720 容量樓地板。
新增鐵律:**同一層只准一個水平捲軸** —— `min-width` 宣告在不捲的 chrome 上,不可套在 DataTable 這種自己會橫捲的元件外面。
**但發現結構缺口**:`app-shell.tsx:257` 那層只包 header + main,**不含 aside**(aside 是根 flex row 的最後一個 child)。而 user 原話是「**舞台內容的 aside**」→ 舞台宿主必須是「含 main + aside、不含 sidebar 與 agent」的容器,**該節點今天不存在,要新建**。

**(c)(d) 都是舞台,而且是同一個機制**:在「與內容 scroller 平行的浮層宿主」上建立 fixed containing block,浮層維持 `fixed`,`sheetVariants` 與 Dialog 置中 class **一個字不改**。三組實測(sidebar 240 | 舞台 360 | agent 400):

| 組 | 產品內容裡的 `position:fixed` 探針 | Dialog |
|---|---|---|
| A. contain 放**遮罩宿主** | `x=0` 不受影響 ✅ | `x=288 w=264` ✅ |
| B. contain 放**舞台外框** | **`x=240` 被靜默改錨** ❌ | `x=288 w=264` |
| C. 都不放(今天) | `x=0` | **`x=368` 跑到視窗中線,不在舞台裡** |

數字修正(codex 對、我方錯):Dialog inset 讀 `--layout-space-bottom` = **48px**(`dialog.tsx:37` 註解 + `layoutSpace.css:6` 三個 selector 皆 48),不是 16 → 舞台 360 時 `maxWidth = min(512, 360−96) = 264`、`x = 288`。
另四項必要修正全部複驗成立:宿主**必須帶 z-index**(實測無 z 時舞台內 `z-20` 元素會畫在遮罩之上;沿用 Dialog/Sheet 既有 `z-50`,不是新 z 家)/ 宿主不能整片 `pointer-events:none`(`modal={false}` 時 Radix Overlay 回 null,實測點遮罩直接命中底下內容)/ Provider 必須在共同 React 祖先 / portal container 身分要穩定。

**(e) user 的推測 —— 對,三句都對。**
① 遮罩範圍與舞台內容可以不同:實測遮罩 360 vs `scrollWidth` 900 ✅
② 不透過舞台水平捲軸捲動:**這是承重理由**,實測掛遮罩宿主 Δ=0、掛捲動容器內 Δ=−200 ✅
③ 因此浮層不易溢出舞台 ✅
唯一修正(更窄的讀法):**單靠把遮罩畫小不會約束 Dialog** —— C 組實測 512 寬的 Dialog 照樣跑到 x=368、完全不理會遮罩。真正約束它的是 containing block 放在遮罩宿主 + `dialog.tsx:125` 的 `100vw` 夾值換成舞台寬。
額外好處(user 未提):遮罩 / Sheet / Modal / FAB 四個消費者**共用同一次 ResizeObserver 量測**,直接消掉「FAB 在舞台內、Sheet 卻在視窗」這一整類漂移。

**(f) 前提雙重不成立。**
① **agent 不是最高,是被壓在下面的**:AgentPanel 根節點 `:175` 起整串 class **無任何 z-index**;Dialog/Sheet 的 overlay 與 surface 都 `z-50`。
② **agent 根本不是 `DismissableLayer`**,在 Radix layer stack 裡 `indexOf` 回 **−1**,不在那疊裡。
⇒ 今天焦點在 agent 輸入框按 Esc **會關掉 Modal**。
遮罩不壓暗 agent 靠**幾何**(360 寬止於 agent 左緣),不靠 z 順序 —— 但宿主自己仍必須帶 `z-50`。
**我提的兩個解法都被證偽**:`preventDefault` 只能取消最高層、不能轉交(`react-dismissable-layer:59-61`);`DismissableLayerBranch` 是**全域豁免**(`:44-46`/`:53-54`),會連 agent 自己的 Popover 點外面也不關。
**我方一條依據被撤回**:我用 `2026-08-11-agent-ui-panel-spec.md:311` 推「並排時 Esc 永不碰 agent」,但本文件第 90 行明文「整份過時,不得引用」→ 該證據無效。

**未達共識 6 項(誠實保留,不假裝有共識)**:Esc 分派機制尚無可用替代 / Tab 跨區單向通、回程未解且與現行 APG「modal dialogs contain their tab sequence」相牴觸(APG 頁面**完全沒提 F6**,所以 F6 是新增的鍵盤契約不是無感 fallback)/ 舞台宿主節點如何引入未設計 / portal container 身分穩定性未量 / 遮罩宿主永久掛載 vs 隨浮層掛載未量 / 第 6 項見原文。

**只剩 2 題要 user 拍板(都是鍵盤 UX)**
1. 並排形態下,agent 的裸 Esc 要不要關掉它?以及焦點在 agent 時按 Esc 該不該關掉舞台上的浮層(跨區關閉)?
2. 協作型 Dialog 與 agent 之間鍵盤怎麼往返:(甲)Tab 直接串接兩區(最直覺但偏離 APG,且回程未解)/(乙)各自區內循環 + 一個明確切區鍵(符合 APG,代價是新增鍵盤契約)。

其餘全部工程自決,不佔 user 時間:720/1080 的算術、量哪個容器、`contain:layout` 選型、宿主掛載時機、Branch 替代接線、沿用 `z-50`、48px inset 沿用既有 token。

## H. 焦點框必要性徹查結果(workflow `wpgrig5fa`,四組全未過對抗驗證但更正有料)

user 2026-09-07 原話:「所有要有焦點框的地方都應該仔細確認它到底該不該有才對吧?」「不要明明不需要還多加」。

**實際規模比先前講的大**:抑制側是 **72 處**不是 71(全庫 103 行 = 81 tsx + 21 md + 1 mjs;81 tsx 扣 9 行說明/註解 = 72)。
驗證者另跑 `outline-0` / `outline:none` / `outline-transparent` / `outline-hidden` / `outlineStyle` 全庫 0 筆 → **抑制面完整,無冰山**。

### H1 多餘 / 重複 / 死碼(= user 說的「明明不需要還多加」)

| # | 位置 | 問題 |
|---|---|---|
| H1a | `dropdown-menu.tsx:122` | DS 內 **20 個宿主全部是 asChild**,承接者自帶指示器 → 恆重複。其中 `agent-panel-fab.tsx:683` 的承接者是 `aria-hidden pointer-events-none` 的 span(`:684`)= **該路徑死碼**。但**不可直接刪**:裸用 DropdownMenuTrigger 的外部 consumer 仍靠它 |
| H1b | `account-menu.tsx:140` | 與 `dropdown-menu.tsx:122` **逐字相同**,經 Radix Slot 併起來 = 同一顆按鈕掛兩份一樣的宣告 |
| H1c | `item-anatomy.tsx:711`、`field.tsx:441` | `focus-visible:outline-2 + outline-ring` 值與全域 `base.css:44-47` **完全相同**,offset 也吃全域 → 把全域規則抄了一遍,**刪了行為不變** |
| H1d | `cell-registry.tsx:473`、`person-display.tsx:371` | 同一行既寫 `group-focus-within/x:opacity-100` 又寫 `focus-visible:opacity-100`;按鈕自己聚焦時祖先必然 `:focus-within` → 後者恆被涵蓋,純贅字 |
| H1e | `field-control-group.tsx:85` | `[&>*:focus]:z-[3]` 被同行 `[&>*:focus-within]:z-[3]` 完全吃掉(`:focus` 是 `:focus-within` 的子集)|
| H1f | **TreeView 根容器 + 列** | `tree-view.tsx:959`(`role=tree tabIndex=0`)**沒有抑制全域框** → Tab 進去整棵樹被畫 +2px 外框,同時列上又有 inset ring = **同一次互動兩個焦點指示** |
| H1g | **FileItem 按鈕 + 整列** | 列上的下載/重試/移除鈕一被鍵盤聚焦,同時出現**按鈕自己的 ring**(`button.tsx:66`)+ **整列的 ring**(`file-item.tsx:266/313`)= 兩個框,違反 focus-canonical「一個項目只有一個指示器」 |

### H2 該有卻沒有(WCAG 2.4.7 違規)

| # | 位置 | 證據 |
|---|---|---|
| H2a | **`steps.tsx:494`** | 同一個 `cn()` 的 `:493` 無條件寫了 `outline-none`。用本 repo tailwindcss 4.2.2 **實際編譯驗證**:`.outline-none` 設 `--tw-outline-style:none`,而 `.focus-visible\:outline-2` 只寫 `outline-style:var(--tw-outline-style)` → 聚焦時解析成 `none`。**那三個 focus-visible outline class 從寫下起就沒畫過任何東西**。修法是**刪掉 outline-none**,不是加東西。驗證者獨立複驗成立 |
| H2b | **`chart.tsx:80`** | `[&_.recharts-surface]:outline-none`。recharts 3.x 的 `accessibilityLayer` **預設就是 true**(`CartesianChart.js:31` / `PolarChart.js:39` / `accessibilityContext.js:10` 的 `?? true`)→ 圖表可 Tab 但焦點被抑制。**驗證者指出徹查低估了範圍**(它以為只在有顯式帶該 prop 的 story) |
| H2c | DatePicker 起訖日 `:1069`/`:1092` | **降級**:徹查原稱「沒有任何可見指示」,驗證者複驗 `field-wrapper.tsx:49` 的 `focus-within:!border-primary` **對兩顆都會 fire** → 確實有可見指示。真正的問題降級為「**一個框罩住兩個 tab stop,分不出焦點在起日還是迄日**」,是判斷題不是硬違規 |

### H3 一個重要的分類更正:那 21 處大多不是焦點框

`focus-within:` 12 處 + `has-[:focus-visible]` 9 處裡,**12 處根本不是焦點指示,是「顯形開關」** ——
掛在不可聚焦的 `<div>`/`<span>` 上,作用只是 `opacity-0 → 100` / `hidden → inline-flex` / `z-2 → z-3`,
**讓藏起來的按鈕在鍵盤 Tab 進來時現身**;真正的框畫在那顆按鈕自己身上。
真的在畫框的是 **6 處**(徹查說 5 處,驗證者抓到它漏了 `[&:has(:focus-visible)]` 這種寫法 → `field-wrapper.tsx:55` 是活的、SSOT 記載的祖先 ring):
`field-wrapper.tsx:49/55/59/190` + `file-item.tsx:266/313`。

### H4 幾何歸屬(依已拍板規則:預設外 +2px,放不下改內 −2px)

- **23 處 ring-offset**:12 處外 +2px、**11 處必須內 −2px**(tabs:479/662、carousel:413、overflow-indicator:109/122、accordion:52、segmented-control:172、agent-panel-fab:778、chip:60、avatar:271、tag:197)。
  **驗證者抓到 12 處「容得下」裡有 2 處判錯,而且錯在全 DS 消費量最高的 Button** —— 需重驗。
- **兩處 `ring-inset` 遷到 `outline-offset:-2px` 視覺等價**(box-shadow inset 0 0 0 2px 與 outline 2px @ offset −2px 佔的都是邊界往內 0→2px 那條帶,兩者都跟 border-radius)。
- 已經是 outline 的 9 處:7 處值與規則一致、1 處是 H2a、1 處(`steps.stories.tsx:269`)寫成內 −2 但無裁切祖先、依規則應為外 +2。
- **FileItem 那兩條放不下**:compact 列間 gap 只有 4px(`file-item.spec.md:282`),外框 2+2=4px 會讓上下兩列的框直接疊在一起。

### H5 深色露白(全部查證成立)

`--tw-ring-offset-color` 預設 `#fff`(`node_modules/tailwindcss/dist/lib.js` 實查)、全 repo 0 處覆寫、`[data-theme="dark"]` 確在 `primitives.css:259` 與 `semantic.css:424`
→ **這 23 處在深色主題下全部露 1–2px 不透明白邊**。
另有 **3 處連淺色主題也永遠露白**:`carousel:413`(dots 疊在照片/影片上)、`tag:197`、`overflow-indicator` 的隱藏項(渲染在 `bg-tooltip + data-theme="dark"` 的 HoverCard 浮層內,`hover-card.tsx:19`)。
遷到 outline 後間隙變透明 —— **是修正不是回歸**。

### H6 抑制側 72 處的判定

合法 66(A 同區塊有替代指示 49 / B 畫在別的元素 11 / C 元素不可聚焦、純防禦 5 / D 有明文記錄的刻意決策 1 = `data-table.tsx:3286`,即 2026-05-12 user 親自抓的那次)、**違規 4**(見 H2)、邊界待拍板 2。

## I. 視覺稽核結果(workflow `wvw8cz1sc`,**唯一通過對抗驗證的一份**)

方法(驗證者逐條複驗成立):本機重建 storybook-static → 先過 fail-closed stale-build 守衛
(`focus-audit-scripts/lib.mjs:14-22` 走訪 src 任何比 `storybook-static/index.json` 新的 .tsx/.css 就 `exit(1)`)
→ Playwright Chromium(沙箱內須 `--single-process`)→ **每一處用真的 `page.keyboard.press('Tab')` 從文件開頭連按**
直到 `document.activeElement` 命中,再驗 `el.matches(':focus-visible')`。15 處有 14 處在瀏覽器量到(全部 `:focus-visible=true`)。
**91 張截圖**(1× 與 4×)+ `results.json` / `specials.json` / `dark.json` 原始數值,腳本已移出 repo。

### I1 我對 RadioGroup 的懷疑是**錯的**(撤回)

我先前說「RadioGroup 一個元件兩個焦點框,很可能一個是死的」。**兩個都是活的,而且不會同時出現** ——
它們住在**互斥的 render 分支**:`radio-group.tsx:155` 的 readonly-in-Field 分支直接 return 一個只裝 `<span>` 的灰框,
**完全不渲染任何 radio item**。而互動主路徑的 Radix Root(`:187`)身上既無 ring 也無 tabIndex,
焦點由 roving tabindex 落在單顆 radio —— **這正是 W3C APG radio pattern 的原文要求**(「focus is set on the checked button」)。
真 Tab 第一下直接落在單顆 radio,群組容器不是「看得見的空焦點站」。**兩者都留,都需要。**

**但真的有死碼,在別的地方**:`:171` 消費的 `fieldWrapperStyles` 帶進三條
`[&:has(:focus-visible)]:ring-2 / ring-ring / ring-offset-1`(`field-wrapper.tsx:55`),
而這個盒子唯一的子節點是 `<span>` → `:has(:focus-visible)` **恆不 match,三條全死**。
因為死掉的那組才帶 `ring-offset-1`,所以實際渲染出來是 0 間隙。改幾何時要一併清掉,否則留下「看起來有 offset 其實沒有」的假象。

### I2 量出來跟原始碼註解不一致的兩處

| 位置 | 註解怎麼寫 | 實測 |
|---|---|---|
| `person-display.tsx:360-361` | 白色分隔環「不被 focus-visible ring 蓋掉」 | **錯**。聚焦瞬間白環**整層被藍環取代,直接消失** |
| FileViewer 縮圖(C14) | ledger 說「選中與聚焦計算值相同」 | **比那更死**:兩張 4× 截圖 **SHA-256 完全相同、`cmp` 差 0 bytes** —— 不是幾乎一樣,是同一張圖 |

### I3 我先前「五種幾何」的說法要限定範圍

**在這 15 處內部,14 處 ring 幾何完全一致**(外緣 2px、offset 0、`--tw-ring-color = --ring = --primary`),
**唯一例外是 RadioGroup item**(`ring-offset-1`)。所以「不一致」在這一批裡只差這一根。
先前講的「五種幾何」是把 `ring-offset` 那 23 處一起算進來才成立 —— 兩個說法不衝突,但範圍要講清楚。

**深色白線同理要限定**:實測量到 `rgb(255,255,255)` 1px、身後父層 `srgb 0.04 0.04 0.04`(接近全黑),
但**這 15 處裡只有 RadioGroup item 這一處**(`ring-offset-width=1px`),另外 14 處都是 0px。
H5 說的「23 處在深色下全部露白」講的是 `ring-offset` 那一批,兩者不衝突。

### I4 改成外 +2px 之後會出問題的(以 outline 2px + offset 2px = 對外長 4px 計)

| 判定 | 位置 | 實測數值 |
|---|---|---|
| **一定撞** | PeoplePicker 移除鈕 | 右鄰居只剩 **1.64px**、左鄰居 **−0.02px 已經相接**;元素本身才 12×12,長完變 20×20。4× 截圖看得到紅框壓在隔壁 avatar 上 |
| **一定撞** | AgentPanel 思考過程 | 下方鄰居間距 **0.00px**,直接侵入下方內容 4px |
| **剛好貼死、0 呼吸** | DateGrid 日期格 | 上右下三面各 **4.00px** |
| **剛好貼死** | Field readonly 三兄弟(Checkbox / Switch / RadioGroup)| 上方 FieldLabel **4.00px** |
| **剛好貼死** | Calendar 兩種事件塊 | 上方日期數字列 **4.00px** |
| 放得下 | SidebarMenuAction 等 | 四周皆有餘 |

→ 依已拍板規則,「一定撞」與「剛好貼死」的一律歸**內 −2px**。

### I5 三組必要性徹查的驗證結果

- **g1(RadioGroup×2 / Sidebar×2 / Calendar:170)通過** —— 驗證者說「想推翻但推翻不了」,五處結論全部站得住。
- **g2 被駁**:`DateGrid:130` 的鄰居淨空**算錯**(它寫「14+2+2=16」,實際 = 18,正確淨空是 **0px 正好相切**);`Checkbox:298` 的元素描述**漏掉 `w-full`**,而那正是決定橫向容不容得下的關鍵。
- **g3 被駁**:有一個**會造成「改完焦點框完全看不見」的硬錯誤**,另有一處 `fitsOutset` 其實沒量過。

### I6 順手抓到、不在 15 處內但同源

- **SidebarMenuButton 自己根本沒有焦點框**,只有 `focus-visible:bg-neutral-hover` 換底色(`sidebar.tsx:938`),
  而同一列的 SidebarMenuAction 卻用 ring —— **同一個元件內兩種焦點語言**。(這正是 C16/A5 那題。)
- **SidebarGroupAction 全 repo 零消費者**(只有定義處與兩個 barrel export,無任何 story)→ 改完**沒有畫面可驗**。

---

# J. 接下來推什麼(2026-09-07 收斂,依「不改壞既有 + 追到 root cause + 可自驗」排序)

## J0 先解鎖:三組沒過對抗驗證的必須重驗(**擋住整條主線**)

| 要重驗的 | 被抓到什麼 |
|---|---|
| ring-offset 組的「容得下」判定 | 12 處裡有 2 處判錯,**而且錯在全 DS 消費量最高的 Button** |
| g2(DateGrid / Checkbox) | DateGrid 淨空算錯(寫 16、實為 18,正確淨空 **0px 相切**);Checkbox 元素描述**漏掉 `w-full`**,那正是決定橫向容不容得下的關鍵 |
| g3 | 有一個**會造成「改完焦點框完全看不見」的硬錯誤**;另一處 `fitsOutset` 沒量過 |

**不重驗就動工 = 帶著錯上路。** 重驗方式:直接沿用已通過驗證的視覺稽核 harness(真 Playwright、真 Tab、fail-closed stale-build 守衛),不重造。

## J1 按新規則掃修全 DS(J0 完成後)

規則是三問決定程序(`ds-canonical/references/focus-canonical.md`)。**每一處都必須先回答問題一** ——
不是「它有沒有寫焦點框」,是「**它可不可以被操作**」。這會同時抓出兩個方向的錯:
- 可操作卻 Tab 不到 → WCAG 2.1.1,修可聚焦性
- Tab 得到卻不能操作 → **拿掉 tabIndex**,不是補畫框

## J2 已定位、可直接修的(root cause 都已查到)

| # | 項目 | root cause |
|---|---|---|
| J2a | 7 處多餘/重複/死碼(H1a–H1g)| 各自不同:asChild 恆重複、逐字複製、抄全域、變體被涵蓋、祖先與自身雙指示 |
| J2b | `steps.tsx:494` 焦點框從未畫過 | 同 `cn()` 的 `:493` 無條件 `outline-none` 把 `outline-style` 設成 none。**修法是刪 outline-none,不是加東西** |
| J2c | `chart.tsx:80` 圖表可 Tab 但焦點被抑制 | recharts 3.x `accessibilityLayer` 預設就是 true |
| J2d | FileViewer 選中/聚焦零像素差(C14)| 選中用 `ring-primary`、聚焦用 `ring-ring`,而 `--ring: var(--primary)` 是全 repo 唯一定義 → 同值 |
| J2e | `person-display.tsx:360-361` 註解與實測相反 | 註解說白環不被蓋掉,實測是整層被藍環取代 |
| J2f | RadioGroup 唯讀盒的三條死 class | `fieldWrapperStyles` 帶進 `[&:has(:focus-visible)]:ring-*`,但盒內只有 `<span>` → 恆不 match |
| J2g | G5 `aria-valuemax` 與實際上限不同源 | `:198` 傳寫死的 640,實際 clamp 是 `min(640, floor(W/3))` |

## J3 便宜且已解鎖的(不等任何人)

- **Esc 寫進 spec 當不變量**(零程式碼):作用域封閉在焦點所在區的最內層暫時性 UI;不關 agent、不跨區關浮層
- **一條負向鐵律 + ~40 行 invariant script**:`AgentPanel` 永不註冊進 Radix 的 DismissableLayer 疊。這是桌上**唯一真正的單向門**,值得那 40 行。照 `scripts/agent-panel-fixed-anatomy-invariant.mjs`(73 行)的形狀

## J4 仍卡住的

| # | 卡在哪 |
|---|---|
| J4a | **跨區 Tab 的鍵位** —— 研究建議的 `Ctrl+F6` 與裸 `F6` **在 Chrome 裡都已有主人**(驗證者打開研究自己引的那頁,發現同頁還有一列 `Ctrl+F6 = Skip to web contents`)。架構答案有了(Modal 開著就不往返),鍵位要重找 |
| J4b | **Agent 差距 1 的 Tab 接力 POC** —— 需真瀏覽器,本機 sandbox 起不了(已登記於 `agent-panel.spec.md:410-412`)。POC 不過的話差距 1 整條路要重估 |
| J4c | A3 `--neutral-selected-focus` 的處置 —— 依賴 J1 掃完 |
| J4d | A4 DataTable 列游標 —— 另有三個技術前提未解 |

## J5 可驗證方式(每一項都要能自己驗到完美)

1. **靜態**:三問決定程序可機械執行 —— 判準 B(祖先鏈有無非-visible overflow)與判準 A(四周最小淨空 ≥ 4px)都能靜態掃。寫成 invariant script,照 `scripts/data-table-invariants.mjs` 的形狀(含 stale-build guard、SKIPPED-ENV)
2. **動態**:沿用已通過驗證的視覺稽核 harness —— 真 Playwright、真 `keyboard.press('Tab')`、驗 `el.matches(':focus-visible')`、量 computed style 與四周淨空、1× 與 4× 截圖
3. **回歸**:聚焦前後 computed style 差異**集合必須非空**(這條直接抓 C14 那類「零像素變化」)
4. **防回流**:遷移完後禁止新增 `ring-offset-*` 與不配對的 `outline-none`

## J6 不得違反的三條(user 2026-09-07 逐字要求)

- **不改壞既有好的東西** —— 每一項改動都要列出「可能弄壞什麼、為什麼不會」
- **追到 root cause,連相關問題一起解** —— 禁止只修症狀(對齊 M12)
- **每一項都要有可驗證的方式,自行驗到完整完美** —— 禁止「應該沒問題」等級的收尾

## K. 三個收斂結論(2026-09-07,回答 user「卡住的趕快討論出結論」)

### K1 FileViewer 的解法 —— 我先前那版是錯的,已由規則自己判掉

先前提「選中維持貼著圖的環、焦點改成**離一格的外圈**」。**錯**:`file-viewer.tsx:605` 的縮圖列是
`scrollbar-none overflow-x-auto overflow-y-hidden` = **捲動容器,判準 B 直接命中 → 該內描邊**。
(縮圖自己 `:638` 的 `overflow-hidden` 不算 —— 元素自身的 overflow 不裁自己的 outline,只有祖先會裁,已實測。)

**正解**:
- **選中**維持 `ring-2 ring-primary`(box-shadow 通道,貼著圖)
- **鍵盤焦點**改成 `outline-2 outline-ring outline-offset-[-2px]`(outline 通道,畫在圖內)

兩者**不同通道 + 不同位置** → 可同時看見且可區分,C14 的「零像素變化」從根消失。
而且不需要新 token:`outline-ring` 是既有 semantic utility,DS 內已有 9 處在用。

### K2 四項「卡住」裡只有一項真的卡住 —— 我先前標錯了

| 原標記 | 真實狀態 |
|---|---|
| J4a 跨區 Tab 鍵位 | **不卡。** 架構結論是「Modal 開著時就不往返」→ **modal 情境根本不需要切區鍵**。鍵位只在未來要支援 `modal={false}` 的並存浮層時才需要,那是後續功能,不擋現在 |
| J4b 差距 1 的 Tab 接力 POC | **不卡。** 視覺稽核那份已實證本機 Playwright Chromium 可跑(`--single-process` 繞過 sandbox 的 mach port 限制),POC 有環境可跑 |
| J4c `--neutral-selected-focus` 退役 | **不卡,是排序。** user 已拍板畫框 → 補完框它自然沒人用 → 再退役。順序不可顛倒(先刪會讓 4 處退化) |
| **J4d DataTable 列游標** | **真的還卡著。** 三個前提未解:`role="table"` 不能合法帶 `aria-activedescendant`(需遷 `grid`/`treegrid`)、虛擬捲動下 activedescendant 目標必須真實存在、同一列在三面板各渲染一次故 IDREF 歸屬未定 |

### K3 需要 user 拍板的清單(收斂後)

**焦點框這條線:0 項。** 三問決定程序已由 user 2026-09-07 逐字拍完(畫框 / 4.00px 算放得下 /
祖先寫了 overflow 就算裁 / 疊層徽章不算鄰居 / 內描邊優先不多開一種)。剩下全是工程執行。

**Agent 那條線:1 項。** 原 8 項 user 已裁 6 項;Esc 那題研究已給明確建議(三題全答「不關」、
零程式碼、只寫進 spec),**待 user 認可即可結案**;跨區 Tab 依 K2 已不擋路。

**其餘:0 項需拍板**,C 區 15 項、B 區 2 項、E 區 2 項全屬工程或複現問題。

# L. Agent 施工單(workflow `w3zytctcx`,codex 兩輪皆成功)

## L1 本輪最重要的發現:隔離範圍的旋鈕本來就在套件裡

`aria-hidden@1.2.6` 的 `hideOthers(target, **parentNode**)` / `inertOthers` / `suppressOthers`
—— **第二個參數就是「從哪一層開始往下藏」**,`dist/es2015/index.js:33` 的 JSDoc 逐字:
`@param [parentNode] - top element, defaults to document.body`(已自行複驗)。

**Radix 把它寫死成 body,而我們要的正好是「換成舞台」。**
自己呼叫 `suppressOthers([dialogContent, scrim], stageEl)`,被隔離的就**精準等於遮罩蓋住的那一塊**
—— sidebar 在舞台外、agent 在舞台外,兩個都不會被碰到。
**不用 fork、不用發明、不用 `DismissableLayerBranch`,幾何與隔離自動同源。**
而且 `suppressOthers` 優先用原生 `inert`(`:163-166`),`inert` 會一起拿掉 tab order
→ **G4 那筆 axe `aria-hidden-focus` 從根消失,不是繞過。**

## L2 另外兩個硬事實

- **有 URL 的協作 Modal 一定得走 `modal={false}`**:`react-dialog:130-160` 的 `DialogContentModal`
  把 `hideOthers` / `trapFocus` / `disableOutsidePointerEvents` **寫死在 `...props` 之後**,consumer 傳什麼都被蓋掉。
  「留在 modal 路徑上微調隔離」不存在。
- **Tab 接力的真正障礙不是 `loop` 是 `trapped`**:`focus-scope:34-52` 的 `trapped` 掛 document 級 `focusin`,
  焦點一離開就拉回,任何 `onKeyDown` 都救不了 —— 但它只在 `modal={true}` 時開著。

## L3 錨點更正(自行複驗)

`PANEL_WIDTH_MIN = 360` 在 **`agent-panel.tsx:118`**,不是先前多份文件寫的 `:119`(`:119` 是 `PANEL_WIDTH_MAX = 640`)。推導不受影響。

## L4 示意範例可行性:G2+G3 可以,G1 不行

- **做完 G2 + G3 可示意 B / E / F 三條**,而且三個原本最不確定的地方(`hidden` 行為、捲動保存、動畫重播)本輪已用真瀏覽器量掉。
  E 條還多拿到一件:**跨併排↔蓋板切換閱讀位置也保住**(改用 CSS-only 蓋板換來的,用 Sheet 就沒有)。
- **G1 還缺一道 POC**:`focus-scope:72` 的 `focusScopesStack.add` **不看 `trapped`**,任何舞台浮層掛載都會廢掉正在開的 viewport modal 焦點鎖。
  提了兩條 fail-safe 不變量,但**本輪新推導、兩方都沒實測過**。POC 過之前不得宣稱硬約束 2 成立。

## L5 三個「要拍板」裡,兩個其實推導得出來(依 user 先前的提醒自查)

| # | 題目 | 判定 |
|---|---|---|
| 1 | **蓋板態面板要多寬** | **推導得出來,不用問。** B 條原文是「窄螢幕以抽屜**蓋滿**宿主」→ **全寬**。不是選擇題 |
| 2 | **舞台窄於 360 時怎麼辦** | **推導得出來,不用問。** 承上,「蓋滿」在舞台 < 360 時就是蓋滿那個 < 360 的舞台 —— 面板跟著變窄是**幾何逼出來的**。360 是可拖曳時的舒適下限,不是蓋板態的硬需求 |
| 3 | **單向 Tab 跨入可不可以接受** | **真的要拍。** 見下 |

### 唯一要拍的那題

拍板 #6 是「Modal 開著時就不往返,**agent 在那段時間停用**」。
實作上「Dialog → agent」擋得住;但**反方向「焦點已在 agent → Tab 走進 Dialog 而回不來」是 Radix `loop` 的既有性質**,要擋掉得另外寫程式。

- **(甲) 接受單向跨入**(不寫程式):使用者若先點 agent 再按 Tab,會被吸進 Dialog 出不來
- **(乙) 兩邊都擋**(要寫程式):agent 在 Modal 開著時完全不吃 Tab

**建議乙** —— #6 的原話是「停用」,單向可進不符合「停用」的字面。

## L6 未達共識 5 項(誠實保留)

G1-0 兩條不變量未經實測 / `:empty` 判準在退出動畫與 `forceMount` 期間不成立 /
`modal={false}` 失去 RemoveScroll 後舞台要不要能捲(兩方都沒討論過)/ 蓋板態寬度規則(已由 L5 推導掉)/
舞台比面板最小寬還窄時的行為(已由 L5 推導掉)。

# M. Agent 鍵盤往返 → **拆進 backlog**(2026-09-07)

user 逐字:「**那個拍板也不是我執意的原則,我對於鍵盤的設計一律都是請你先研究再給建議啊,
萬一到時候這個原則不對,你不就要多寫?**」「**若鍵盤的設計和成本負擔很大也可以拆為 backlog,
agent 鍵盤的互動很次要,我已經講過了**」

## 我犯的錯

拍板 #6「Modal 開著時就不往返」**本來就是我研究出來的結論,不是 user 執意的原則**。
我卻拿它當固定前提,再去問 user 一個子問題(單向 Tab 跨入可不可接受)。
這跟先前 FAB 那題同一個病:**把可推導或該由我研究的東西丟回去問。**

## 處置(依 user 明確授權)

**整個「agent 與舞台浮層之間的鍵盤往返」拆進 backlog**,理由:
- 成本高:需要世界級研究 + 寫程式 + 一道真瀏覽器 POC(`focus-scope:72` 的 `focusScopesStack.add` 不看 `trapped`)
- user 已明講 agent 鍵盤互動**次要**
- 而且 #6 這條前提本身還沒經過世界級研究驗證 —— **前提沒站穩就寫程式,原則若翻掉會白寫**

**backlog 內容**:單向 Tab 跨入、切區鍵鍵位(兩個候選在 Chrome 都有主人)、`focusScopesStack` 破口的兩條 fail-safe、以及 #6 這條前提本身的世界級驗證。

## 對施工的影響

**G2 與 G3 不受影響,照施工單做。** 它們不碰鍵盤往返:
- G2 = 面板關閉不再卸載(`hidden` 取代卸載)
- G3 = 推擠/斷點 + 舞台節點

**G1 整個延後** —— 它正是需要鍵盤往返與 POC 的那一塊。
連帶:「Modal 開著還能用 agent」的示意也延後,但 **B / E / F 三條的示意不受影響**。

# N. 拖曳播報:C1 + C2 + B2 是**同一個根因**(2026-09-07 查出)

## 根因

**全 DS 4 個 `DndContext` 沒有任何一個傳過 `accessibility` prop**(`grep -rn 'accessibility=' src --include='*.tsx'` 排除 stories = **0 命中**),
所以四處全部吃 dnd-kit 的**英文預設播報**,而且是從它自己的生命週期發的。

| 位置 | |
|---|---|
| `tree-view.tsx:972` | TreeView |
| `data-table.tsx:3981` | 列拖曳 |
| `data-table-sort-manager.tsx:136` | 排序面板 |
| `data-table-column-visibility-panel.tsx:182` | 欄位顯示面板 |

三項待辦因此收斂成一個修法:

| 待辦 | 症狀 | 同一根因怎麼解釋 |
|---|---|---|
| **C1**(高)| 播報「已放到 X」但順序其實沒變 | dnd-kit 從自己的 `onDragEnd` 播報,**不知道我們的中點守衛已經 return、沒真的重排** |
| **C2**(高)| TreeView 的繁中播報區全程是空的 | TreeView 那份中文播報**只有鍵盤重排那條路在寫**;滑鼠拖曳走的是 dnd-kit 的預設(英文、另一個 live region)|
| **B2** | 繁中拖曳播報未實作 | 同上,指標路徑從來沒接過中文 |

## 現成的中文 SSOT 已經存在,不用發明

`tree-view.tsx:130` 的 `DEFAULT_REORDER_ANNOUNCEMENTS` 就是既有的繁中措辭 canonical:
「已將『X』移到『Y』之前,第 N 項,共 M 項」/「已將『X』移入『Y』」/「已在最上方」/「無法移入:『Y』不是資料夾」…
而且它已經支援 consumer 覆寫(`reorderAnnouncementsProp`)。

**依 M23(DS 內既有 canonical 優先)與 M17(同值出現在 3+ consumer 必抽 SSOT):**
把它從 TreeView 搬到共用模組,四個 `DndContext` 一起消費。**不是新增字串,是把既有的那份給其他三處用。**

## 修法(三步,每步可獨立驗證)

1. **抽 SSOT**:`DEFAULT_REORDER_ANNOUNCEMENTS` 與其型別搬到 `lib/`,TreeView 改 import。
   **純搬移,零行為變化**,以 `build:lib` + TreeView 既有 story 驗。
2. **接線**:四個 `DndContext` 各傳 `accessibility={{ announcements }}`。
   dnd-kit 的 `announcements` 介面在 `core.esm.js:88`(`announcements = defaultAnnouncements`),
   四個 hook 是 `onDragStart` / `onDragMove` / `onDragOver` / `onDragEnd` / `onDragCancel`。
3. **修 C1 的假播報**:`onDragEnd` 的播報必須**consult 我們自己的 commit 判定**(中點守衛),
   沒真的重排就播「未變更」而不是「已放到 X」。這是 C1 的 root cause,不是措辭問題。

## 驗證方式

- 步驟 1:`build:lib` exit 0 + TreeView 拖曳 story 行為 Δ=0
- 步驟 2、3:**真瀏覽器讀 live region 的文字內容**(先前 C2 就是這樣量到「全程空字串」的),
  分別驗:(a) 成功重排 → 播中文且內容與實際位置相符;(b) **中點守衛擋下 → 播「未變更」而不是假的成功訊息**;
  (c) TreeView 滑鼠拖曳的播報區不再是空的
- 機械閘:掃「有 `DndContext` 卻沒傳 `accessibility`」→ 防回流

# O. 「往內描邊」那 11 處的判定**大部分可能是錯的**(2026-09-07,user 追問後查出)

## user 的質疑

> 「原則的判斷是以視覺為準則。若該元素四周的視覺就是空蕩蕩的,到底為何要往內描邊?
> 你確定你定義的那些所有往內描鍵盤焦點的元素的周遭在最緊迫的情境真的完全沒有視覺上的空白空間?」

## 實機量測:視覺上一點都不擠

以 J0 判「內描邊、淨空 −2px」的 DataTable boolean 儲存格 Checkbox 為例:

| 量到誰 | 四邊 |
|---|---|
| 到那個裁切它的 wrapper | 上 0 / 右 0 / 下 0 / 左 0 |
| **到儲存格邊(視覺上的空白)** | **上 11.5 / 右 62 / 下 11.5 / 左 12** |

**視覺上有 11.5px 空白。** 卡住框的不是儲存格,是一個 `truncate min-w-0` 的 wrapper
(padding 0、`overflow:hidden`、四邊剛好貼死那顆 16px 勾選框)。
而 `truncate` 是**文字截斷**用的 —— **勾選框永遠不需要文字截斷。**

## 根因與修法(已修)

`data-table.tsx:2085` 的 `isKnownCompound` 列了
`select / multiSelect / person / multiPerson / url / date / time` —— **獨漏 `boolean`**。
而 boolean 欄渲染的是 `<Checkbox>`(`cell-registry.tsx:432/435`),互動元素。
所以它掉進 `:2134` 的 `<TruncatedText>`,被文字截斷 span 包住。

**修法:把 `boolean` 補進 `isKnownCompound`。** 修的是「不該有的 wrapper」,
不是讓焦點框改成內描邊去遷就它。順帶會一併解掉同一個 wrapper 造成的陰影被切、浮層被裁等同源問題。

## 對先前判定的影響(必須重驗,不得沿用)

J0 判「往內」的 11 處中,凡是**理由為「被某個裁切祖先貼死」**的,都要重問一次:
**那個裁切祖先本身是不是用錯地方?** 已知同一家族的至少有:

| 位置 | J0 判 | 要重問 |
|---|---|---|
| `button.tsx:66`(DataTable 行內動作鈕)| 內(−1px)| 裁切它的是不是同一個 truncate wrapper? |
| `checkbox.tsx:27` | 內(−2px)| **已確認是,已修根因** |
| `avatar.tsx:271`(DataTable 人員欄)| 內(−1px)| 人員欄是 `person` colType,已在 compound 清單內 —— 要另查裁切者是誰 |
| `overflow-indicator.tsx:109`(多值儲存格)| 內(−1px)| 同上 |

**真正該往內畫的,只會是視覺上真的貼死的**(例:Tabs 的 tab 高度就等於分頁列高度、Avatar 的 16px 槽本來就設計成剛好包住)。

## 這件事的方法論教訓(寫進判準)

**判準寫的是「量到最近的障礙」,但「障礙」必須是設計上真的存在的邊界,不是一個 bug 造出來的邊界。**
遇到量到 < 4px 時,第一個問題是「**這個障礙為什麼在這裡**」,不是「那就往內畫」。
—— 這正是 user 早先追問的「這種元件到底為何要設定 overflow」,現在有了具體案例。

## O1 `boolean` 修正的**實機驗證結果**(2026-09-07,user 要求逐項驗)

驗證環境:本機 `npm run build-storybook`(66 元件 / 966 stories,BUILD=0)→ 起 `http-server` 於 127.0.0.1:8099
→ 瀏覽器實測。**不是紙上論證。**
(本機 DataTable 機械閘在此沙箱起不了 Chromium,誠實回報 `SKIPPED-ENV` 未假綠;預覽站當時仍在重新部署。)

| user 問的 | 修前 | 修後 | 判定 |
|---|---|---|---|
| 互動元素還被文字截斷 wrapper 包著嗎 | **4 個** | **0 個** | ✅ |
| Checkbox 到最近裁切祖先 | 0 / 0(那個 `truncate` span)| **11.5 / 11.5**(變成儲存格本身)| ✅ |
| Checkbox 尺寸 | 16×16 | **16×16** | ✅ 不變 |
| 列高 | 40 | **40 / 40 / 40 / 40** | ✅ 不變 |
| **其他欄位的溢出/截斷仍正常?** | — | **74/74 個 truncate wrapper 全部仍有 `text-overflow: ellipsis`** | ✅ |
| 儲存格總數 / 列數 | — | 56 cells / 4 rows,渲染正常 | ✅ |

**最關鍵那一項**:最近的裁切祖先從 `truncate min-w-0`(0px)變成 `group/cell`(11.5px)
→ **焦點框現在有空間往外長了**,而這正是修根因(拿掉不該有的 wrapper)而非讓焦點框遷就的結果。

**誠實標記未驗的一項**:用合成 PointerEvent 觸發不了 Radix Checkbox 的切換
(它的 pointer 流程認不得合成事件),所以「點擊切換」這一項**未以互動驗證**。
但 `disabled: false`、`tabIndex: 0`、DOM 結構與尺寸皆正常,且該分支 code path 未被本次修改觸及
(只改了「要不要包 wrapper」,沒動 `onCheckedChange`)。

---

# N. 2026-09-07 已完成並自驗(本輪)

**驗證方式全部是真瀏覽器實測,不是 grep class**;三支新閘 + 一支既有 build 全綠。

## N1 拖曳播報(C1 + C2 + B2 一次收,commit `d5ba39d3`)

一個根因三項待辦:全 DS 4 個 `DndContext` 沒有任何一個傳過 `accessibility` prop
(排除 stories 後 0 命中),全部吃 dnd-kit 英文預設,而且它從自己的生命週期發 ——
不知道我們的守衛已經 return、根本沒重排。

- 新增 `lib/drag-announcements.ts` 作四處共用 SSOT;呼叫端開頭清空 outcomeRef、真 commit 才設值
- 呼叫順序不是猜的:`core.esm.js:3166-3170` 實查 `handler?.(event)` 先於 `dispatchMonitorEvent`
- 防回流閘 `scripts/drag-announcement-invariant.mjs`(selftest 4/4)
- **仍未驗**:播報「文字內容」需真實滑鼠拖曳,合成 pointer 事件過不了 dnd-kit 感測器門檻(沙箱限制)

## N2 焦點指示器六項(J2 區)

| # | 改了什麼 | 可驗證證據 |
|---|---|---|
| J2d / C14 | FileViewer 縮圖:選中留在 ring(貼著圖)、鍵盤焦點改走 outline 並**往內**畫 | 真 Tab 實測 `:focus-visible=true`、`outline: solid 2px oklch(0.63 0.22 258) @ -2px`、box-shadow 同時仍在。往內的前提也複驗了:縮圖列確實是 `overflow-x-auto` |
| H1g | FileItem 一次互動兩個框 | 根因是 `has-[:focus-visible]` **不分對象**,連自帶 ring 的 trailing `<Button>` 一起接。改成 `has-[[data-row-focus-target]:focus-visible]` 只認那顆隱形整列鈕。實測:整列鈕聚焦→列上有框;trailing 聚焦→列上 `boxShadow: none`、按鈕自己的框仍在 |
| H1f | TreeView 根容器 + 列 兩個框 | 根容器改為「**有** aria-activedescendant 才抑制」(空樹仍會畫,不會變成聚焦了卻沒指示)。實測根 `outline: none`、activedescendant 指到真實列 |
| **H1f 連帶挖出的真缺口** | **Tab 進場當下那列沒有任何指示** | `showRing = isFocused && isKeyboardRef.current`(`:1174`),而 `isKeyboardRef` 只在**樹內** keydown 才變 true —— Tab 的 keydown 發生在上一個元素上,永遠傳不到。原本被根容器那圈大框遮住,我抑制掉才暴露。修法:`onFocus` 用瀏覽器自己的 `:focus-visible` 當判準打開鍵盤模式(滑鼠進場它不成立,且 mousedown 已先把 ref 設回 false)。違反的是 APG aria-activedescendant 模式明文要求 |
| J2f | RadioGroup readonly 盒重複宣告 | **訂正先前總帳的錯誤判斷**:原寫「fieldWrapperStyles 帶進 `[&:has(:focus-visible)]` 但盒內只有 `<span>` 故恆不 match」是**錯的** —— 此處未傳 `wrapper`,走的是 else 分支(宿主自己可聚焦),而盒子確實 `tabIndex={0}`,該分支是活的且正確。真正的問題是下一行把它又抄一遍還漏掉 `ring-offset-1`。用真 tailwind-merge 3.5.0 實跑:刪除前後**類別集合完全相同**(只有順序差)→ 證明是純去重、零視覺改變 |
| J2g / G5 | `aria-valuemax` 與實際上限不同源 | 抽出 `resolvePanelWidthMax()` 讓 clamp 與 `max` 讀同一函式,並加 resize 監聽(否則首次 render 後就固定住)。三個視窗寬實測:1280→640 / 900→450 / 700→360,全部等於真正生效的上限 |
| J2e | person-display 註解與實測相反 | 只改註解。原寫「白環不被 focus ring 蓋掉(不同 layer)」——實測兩者最終都寫同一個 `box-shadow`,`focus-visible:ring-2` 帶偽類特異性較高,聚焦當下白環**整層被藍環取代**。這不是缺陷,但註解不能寫成相反的事實 |

## N3 J3 兩項(零依賴)

- **Esc 語意寫進 `agent-panel.spec.md`**(零程式碼):三條表 + 一句話。依據是
  [Microsoft 平台鍵盤指引](https://learn.microsoft.com/en-us/windows/apps/design/input/keyboard-interactions)逐字
  「The Esc key only affects transient UI, it does not close, or back navigate through, app UI.」
- **負向鐵律 + 機械閘** `scripts/agent-panel-dismissable-layer-invariant.mjs`(selftest 5/5):
  AgentPanel 永不進入 Radix 的 DismissableLayer 疊。這是桌上唯一真正的**單向門**,而且靜默 ——
  一旦入疊,`dismissable-layer.tsx:59-61` 會把 Esc 送給它、外點也會關,面板就從常駐 app UI
  變成暫時性浮層,沒有任何錯誤訊息。

## N4 新增的三支常駐閘

| 閘 | 守什麼 | selftest |
|---|---|---|
| `scripts/drag-announcement-invariant.mjs` | 有 `<DndContext` 就必須傳 `accessibility={{ announcements` | 4/4 |
| `scripts/agent-panel-dismissable-layer-invariant.mjs` | 面板殼不得進 dismiss 疊 | 5/5 |
| `scripts/focus-indicator-invariants.mjs` | F1 聚焦前後 computed style 差異非空 / F2 一次互動一個框 / F3 虛擬焦點容器不畫、目前列必畫 / F4 宣稱上限=真上限 | stale-build 守衛 fail-closed 實測 exit 2,rebuild 後 exit 0 |

三支都已接進 `package.json`(`test:drag-announcements` / `test:agent-panel-invariants` /
`test:focus-indicator-invariants`)。

## N5 順手清掉的

總帳原本有一整份 J0–J6 貼了兩次(第 378–436 行與第 438 行起完全重複),已刪前者。

---

# O. A9 / C16 焦點框機制收斂 —— 已完成並自驗(2026-09-07)

user 拍板「A9用甲啊」的附條件是「確保在做到理想狀態後都沒有缺點且不會改壞任何東西」。
下面是那個條件的交代;完整技術紀錄在 `ds-canonical/references/focus-canonical.md` 末章。

## O1 收斂結果

**5 種幾何 → 2 種**,而且兩種都不需要元件自己寫值:外描邊 = 全域 `base.css`(什麼都不寫);
內描邊 = `focus-ring-inset` utility。50 行焦點表面全數處理完畢。

## O2 我沒有逐站用猜的 —— 判準是機械跑出來的

先把**全部**改成外描邊(全域規則),再用真瀏覽器逐站算出「框實際佔到的外框」,
檢查它有沒有越過**會裁切的**祖先、或壓到不重疊的鄰居;會的才翻成內描邊。
這樣避開了「我覺得這裡很擠」那種靠印象的判定 —— 也正是 J0 要求重驗的原因。

結果:**72 站外描邊正確 / 1 站已知殘留 / 10 站無框(指示器都在別的元素上)**。
翻成內描邊的 8 站:Calendar 日期格、Calendar 事件方塊、Accordion trigger、
AgentPanel 思考塊 trigger、Combobox 根、ItemAnatomy 行內動作鈕、DataTable 可編輯儲存格、
DataTable 可排序表頭。

### 量法第一版是錯的,記著

把「祖先的內容邊」一律當障礙 → 全 DS 每一站都量到淨空 0(flex 容器的內容框本來就剛好包住子元素)。
**錯在:不裁切的祖先根本不會切到框。** 修正後分佈才合理。
這也反過來印證判準把 `overflow` 踢出去是對的 —— 需要的不是那個布林,是「會不會真的被切」的量測。

## O3 順帶修掉三件既有缺陷(遷移的必然結果,不是額外工作)

| # | 缺陷 | 證據 |
|---|---|---|
| H5 深色露白 | `--tw-ring-offset-color` 預設 `#fff` 且 `inherits:false`(寫進 `:root` 完全不生效還靜默無錯),全 repo 0 處覆寫 → 22 處在深色下露一圈不透明白 | 遷移前 22 站有,遷移後 **0 站**(剩下唯一的 box-shadow 是 skip link 的正當投影) |
| 高對比模式全裸 | `box-shadow` 在 forced-colors 下被強制 `none`(MDN 明文),`outline` 會照畫 → 原本 20 個「`outline-none` + ring」的元件在那個模式沒有任何焦點框 | 機制層必然,遷移後全部改走 outline |
| A3 token 退役 | user 拍板畫框後 `--neutral-selected-focus` 5 處全遷 → 0 用法(含 template 與 WM 都查過)→ 已刪。順序是「先補框再退役」,先刪會讓 4 處退化 | `grep` 全 repo 0 命中 |

## O4 同時關掉的總帳項目

- **A9 / C16** 收斂完成;**A3** token 退役;**A6** `item-anatomy.spec.md` 補上缺的那一格
  (「未選中列 × 鍵盤焦點」= 與滑鼠 hover 同色底、不畫框);**C11** TimePicker 死用法刪除
- **H2a / H2b**(steps.tsx 與 chart.tsx 的靜默失效)先前已修;**H1a–H1g** 七項冗餘/死碼處理完畢
- **T2** 的 15 處依 user 裁示「內描邊沒問題就內描邊」實測歸位;**T1** 的 DataTable hover 與 focus
  同搶 outline 通道:焦點壓過 hover(WCAG 1.4.11「指標本身就是 hover 的指示器」)

## O5 新增兩支閘

- **靜態** `scripts/focus-geometry-invariant.mjs`(selftest 9/9):R1 禁 `ring-offset-*` /
  R2 禁 `focus-visible:ring-*` / R3 禁 `outline-none` 與 `focus-ring-inset` 同字串打架 /
  R4 禁抄全域 / R5 禁手寫內描邊三件組
- **動態** `scripts/focus-geometry-browser-audit.mjs`:真 Playwright 逐站量框有沒有越界

兩支合起來才完整 —— 靜態掃不出「這個元素四周有沒有空間」。已接 `npm run test:focus-geometry`。

## O6 ~~一件要 user 拍板的事~~ —— **2026-09-07 撤回,不需要拍板**

先前在此寫「Field 家族只有 1px 邊框,不過 WCAG 2.2 AA,建議全家加 2px 內描邊」。
**前提是錯的,整條撤回**:

- 條號與等級都講錯 —— 「面積至少相當於 2px 厚周長」是 **2.4.13 Focus Appearance,
  WCAG 2.2 定案版屬 AAA**,不是 2.4.11、也不是 AA。AA 適用的是 2.4.7 與 1.4.11(≥3:1)。
- 實測是過的:聚焦邊框對頁面底色 **淺色 5.19:1 / 深色 5.35:1**。

真正的問題只有一個且已修:Combobox 根節點漏寫 `focus-visible:outline-none`
(user 抓到「為何突然加 combobox 內描邊」—— 查證後那圈框遷移前就在、而且是往外的,
我只是改成往內;正解是跟家族一樣抑制掉)。判準已寫進 focus-canonical
「問題一之二:什麼情況明確不用畫框」四類表。

---

# P. C8 / C9 — 兩支閘的真實性與一個 token 相撞(2026-09-07)

## P1 C9:兩條假綠路徑都是真的,已修 + 對抗驗證

| 閘 | 假綠在哪 | 修法 |
|---|---|---|
| I27a | 取「第一個 `React.useLayoutEffect` 起算固定 2600 字元」當掃描窗 —— `indexOf` 抓第一個(前面加個 effect 就整個漂掉)、2600 是憑經驗的長度(程式一長就切在半路)。**而且找不到錨點時只會讓正則全部 miss = 閘沒跑到被記成閘通過** | 改以 `ro.observe` 為錨(這條閘真正關心的東西)往前找最近的 effect 開頭;**找不到錨點就當場 FAIL** |
| I27b | 用 `img >= 2` 挑儲存格 —— 但這條閘要抓的**正是**「棘輪成 1 顆頭像 + 一個 +N」的狀態,那種儲存格只有 1 張圖,會被條件跳過。**結構上看不見自己要抓的 bug** | 改成「凡是有頭像串的儲存格全部檢查」,回報最糟的一列,並加一條「檢查了幾個(0 個 = 空轉)」 |

**對抗驗證**:把當年的棘輪 bug 注入回去(`ro.observe(box)` → `ro.observe(el)`)、重建 storybook、
再跑 → `exit 1`,而且精準指名 `✗ I27a | 顯示路徑的 ResizeObserver 觀察祖先容器,不是頭像串自己 | ro.observe(el)`。
還原後 322 條全過。

## P2 順帶挖到一件更大的:**這一整套 322 條從來沒在本機真的跑過**

`data-table-invariants.mjs` 的 `chromium.launch` 少了 `--single-process --no-sandbox`,
在本 repo 的沙箱起不了瀏覽器 → 一路回 `SKIPPED-ENV` 並 **exit 0**。
也就是它看起來一直是綠的,實際上一條都沒驗。同 repo 的 `agent-fab-hit-area-invariant.mjs`
與 `focus-indicator-invariants.mjs` 早就用那組參數了 —— 這是「被自己的環境擋住就當作做不到」的
同一類病(M36(b'):自家設定擋路要先解自己的鎖,不是接受它)。

補上參數後:**322 條全部真的執行並通過**。

## P3 C8:「四件成套」的宣稱與真實不符 —— 一半已修,另一半是取值題

- **已修**:`-focus` 退役後名字與值一一對應(neutral-2 / neutral-1 / neutral-3),
  `color.spec.md` 的「四件成套」改成「三件」,並訂正舊文那句不實宣稱
  (舊文說四件,實際四個名字只有三個相異值,選中×焦點與選中×按壓畫面上分不出來)。
- **仍在**:`--neutral-selected-hover` 與 `--neutral-hover` **同值**。
  真瀏覽器實測兩個主題都相同 —— 淺色 `oklch(0 0 0 / 0.02)`、深色 `oklch(1 0 0 / 0.04)`。
  加上 `variant: 'text'` 的按下與未按下**文字色也相同**(兩邊都是 `text-foreground`),
  結論是:**切換鈕按下與未按下,在滑鼠懸停時像素完全相同**,「這顆開著沒」的訊號在 hover 當下消失。

  這是 token 取值題,有真實取捨,不自決 —— 見下方拍板清單。

---

# Q. C1 / C4 / C5 / B2 —— 拖曳三項改根因並在真瀏覽器驗到(2026-09-07)

## Q1 C4:兩個面板的 `DndContext` **從來沒傳過 `sensors`**

於是吃 dnd-kit 預設 —— PointerSensor 沒有啟動距離,**零位移的單次 `pointerdown` 就啟動拖曳**。
使用者只想點一下核取方塊,卻收到 `aria-pressed=true` 與兩則 assertive 播報。

順手挖出更上游的一件:**啟動門檻在全 DS 有三個不同答案**(DataTable 8 / TreeView 5 / AgentFab 8),
外加這兩個面板根本沒設。抽成 `lib/drag-visual.ts` 的 `DRAG_ACTIVATION_DISTANCE_PX = 8`
(三處裡兩處本來就是 8,其中 AgentFab 那個還是 user 實際用過調出來的),四處全部改讀同一份。

## Q2 C5:overlay ghost 是 source 的完整複製,連 `role` 一起複製

7 欄的表格在拖曳中查得到 **8 個 columnheader** —— 螢幕閱讀器會以為真的多一欄。
修法是在 **DragOverlay 那一層**掛 `aria-hidden="true"`,而不是逐一 strip 每種 clone 的屬性:
一個地方涵蓋列 ghost、欄位 ghost 與未來任何 ghost,不會有人新增一種 ghost 時忘了 strip。
拖曳的口語回饋本來就由 live region 負責,不靠這份複製品。

## Q3 C1 / B2 的執行期驗證 —— **先前登記為「卡住」,本輪做掉了**

先前寫「合成 pointer 事件過不了 dnd-kit 的感測器門檻」。真正的原因不是那個 ——
是**用 `element.click()` 打不開 Radix 浮層**(Radix 聽的是 pointer 事件),
以及**抓錯拖曳目標**(DataTable 第一顆表頭是鎖定欄 `data-column-locked`,不可拖)。
換成 Playwright 的真滑鼠 + 抓有 `aria-roledescription` 的表頭,全部跑得起來。

實測拿到的播報(逐字):

| 情境 | 播報 |
|---|---|
| 拖曳中 | 「移到『category』上方」 |
| 放下並真的重排 | 「已移動欄位『name』」 |
| **拉起來又放回原位** | **「未變更順序」** |

最後一列就是 C1 的核心 —— 先前 dnd-kit 會謊稱「已放到 X」。現在不會了,而且是跑起來驗的。

## Q4 兩個踩過的坑(記著)

1. **拿 `aria-pressed` 當事後斷言會誤判**:它在拖曳結束後就被清掉,量到 `null`。
   改用「播報有沒有出現」當拖曳啟動的證明。
2. **「數量沒變」可能是假綠**:第一版 C5 測試量到「拖曳中 7 個 columnheader」以為修好了,
   加了「拖曳真的啟動了嗎」的前提斷言才發現**根本沒啟動**(抓到鎖定欄)。
   任何「量到沒變化」的斷言都必須先證明那個動作真的發生了。

## Q5 兩支閘

- `scripts/drag-announcement-invariant.mjs` 擴充:除了播報,**也要求 `sensors`**(selftest 5/5)
- `scripts/drag-runtime-contract.mjs`(新增):真滑鼠驗 C4 正反面、C1 no-op、C5 無障礙樹,
  含 stale-build 守衛。已接 `npm run test:drag-runtime`

## Q6 一件登記但不修的

dnd-kit 的 live region 寫死 `aria-live="assertive"`(`core.esm.js:3363`),API 不給改。
assertive 會打斷螢幕閱讀器當下的朗讀。要改成 polite 得自建 region 並把 dnd-kit 的播報關掉 ——
那會多一套平行機制。**現況登記在案,不動**;TreeView 的鍵盤重排另有自己的 polite region,
兩條路不重疊。

---

# R. C3 收斂 —— 「方向不對稱」是誤判,真正的問題是「一格要按 11 次」(2026-09-07)

## R1 先撤回結論:**沒有方向不對稱**

先前登記「我實測 ArrowRight×10 可移動;獨立研究三次向右皆不動、向左才動」,兩份相反。
真瀏覽器逐欄實測後,兩份都不對:

| 起點 | 左鄰 | ArrowLeft |
|---|---|---|
| `name`(位置 1)| `sku`**【鎖定】** | 不動 —— **正確**,那個方向沒有合法落點 |
| `category`(位置 2)| `name` | 正常移動 |
| `price`(位置 3)| `category` | 正常移動 |

變數是**那個方向有沒有合法(非鎖定)落點**,不是方向。兩份先前結論都是抽樣抽到不同起點。

## R2 真正的缺陷:dnd-kit 預設每按一次只移 25px

欄寬 100–240px → **移一格要按 11 次**。能操作(WCAG 2.1.1 過),但難用到幾乎沒人會用。

當年 `2026-05-07 v15.13` 的註解說「KeyboardSensor 不傳 coordinateGetter」,理由是
`sortableKeyboardCoordinates` 需要 `SortableContext` 而本表格已砍掉它 ——
**那個理由排除的是「那個 preset」,不是「不能有自訂 getter」。** 缺的就是自訂那塊。

新增 `lib/drag-visual.ts` 的 `createStepToNeighborCoordinateGetter()`:沿按鍵的軸,
在所有合法落點裡找中心點落在前方最近的那一個,回傳讓被拖曳者中心對齊它所需的座標。
找不到就回 `undefined`(維持原位)—— 所以「左邊只剩鎖定欄」自然就是不動,不必另寫規則。

實測:1 次按鍵 = 1 格 / 3 次 = 3 格 / 8 次(超過最後一欄)= 移到最右。

## R3 順帶抓到兩個

1. **播報的種類寫死**:起始說「已提起**項目**」、結束說「已移動**欄位**」,同一趟兩個名字。
   根因是 DataTable 一個 `DndContext` 同時承載列與欄,而 `kind` 是建立時就固定的字串。
   改成可傳函式,由 `active.data.current.type` 決定。
2. **一個殘留的假成功播報**:按 8 次(拖到最後一欄)時播「已移動」但順序沒變。
   根因是 **story 自己的 bug** —— 受控的 `columnOrder` 只列 6 欄,但表格渲染 7 欄
   (TanStack 對沒列進去的欄位仍會渲染,排在有序的之後),於是消費者的 handler
   `indexOf('seller')` 回 -1 直接 `return prev`。已修 story。

   **契約邊界已寫進 `lib/drag-announcements.ts`**:播報的「已移動」意思是
   **元件已送出重排且自己的守衛全過**;它看不到消費者有沒有真的把新順序寫回 state
   (播報是同步回傳的字串,那時 React 還沒 re-render)。受控順序**必須列全**。

## R4 閘

`scripts/drag-runtime-contract.mjs` 補兩條:「ArrowRight×N 應該正好移動 N 格」與
「播報與真實順序一致」。後者就是抓 R3-2 那種謊報的。

---

# S. B1 / C2 已完成(2026-09-07)

## S1 B1:`hug` 寬度下頭像串的量測自我回饋

`hug` 的 field wrapper 是 `w-fit max-w-full` —— **寬度由內容決定**。
先前的修法(量父層而不是量自己)只把棘輪往上搬了一層,沒拆掉:
少畫一顆 → 欄位變窄 → 量到更窄 → 再少畫一顆。

**拆法是找一個不隨內容變的量**:

```
可用寬 = 容器內容寬 − 欄位外框開銷
外框開銷 = wrapper 現在的寬 − slot 現在的寬     ← 同幀量,內容影響相減抵消
```

外框開銷(左右 padding、邊框、同排的 chevron / 清除鈕 / gap)跟畫幾顆頭像無關,迴圈就斷了。

**這條公式在 fill 模式下與原本逐像素相同**(wrapper 寬由容器決定,slot = wrapper − 開銷,
相減回來就是容器寬 − 開銷),所以**不需要分兩條路**,也不需要把 `width` 一路傳下來。

### 兩個方向都驗了

| | 修之前 | 修之後 |
|---|---|---|
| **hug**(720px 容器、6 人)| `A|B|C|+3`,欄位縮到 116px | `A|B|C|D|E|F`,欄位 160px |
| **fill** 對照組 | 6 人全顯示 | 6 人全顯示 |
| **既有 5 個 story 共 41 個頭像串** | — | **逐項完全相同**(改動前後快照比對)|

「不改壞既有」不是用講的:把 `person-display.tsx` 換回 HEAD 版本重建、量一次,
再換回新版重建、量一次,兩份 JSON 逐項比對相同。

### 閘

新增 story `HugWidthMultiStack`(hug / fill 同容器對照)+ `I27c` 兩條斷言。
對抗驗證:把舊版塞回去 → `✗ I27c | hug 與 fill 在同寬容器下顯示同樣多人(hug +N「+3」/ fill +N「無」)`。
DataTable 不變條件從 322 條增為 **324 條**。

## S2 C2:TreeView 指標拖曳的繁中播報

先前實測「整趟拖曳下來 live region 維持空字串」。接上共用播報 SSOT 後實測:
拖曳中「移到『about』上方」、放開「未變更順序」。已納入 `drag-runtime-contract.mjs`。

---

# T. 2026-09-07 下半場:user 兩個追問的答案 + G2 + 一個系統性發現

## T1 user 追問一:「combobox 不用有內描邊吧?到底為何突然加?」—— **我錯了兩件事**

**(a) WCAG 條號與等級都講錯。** 我說「2.4.11 Focus Appearance,WCAG 2.2 的 AA,要求 2px 厚周長」。
正確是 **2.4.13 Focus Appearance,而且在 WCAG 2.2 定案版是 AAA**。
AA 適用的是 2.4.7(要有可見指示,無尺寸要求)與 1.4.11(對比 ≥ 3:1)。
**整條「建議全 Field 家族加 2px 內描邊」的推力不存在,已撤回。**

實測補證:Field 焦點邊框對頁面底色 **淺色 5.19:1 / 深色 5.35:1**,兩個主題都遠高於 3:1。
現況合規。

**(b) 那圈框不是我加的,但我也沒把它處理對。**
查 `git show 1bde3ad1~1`:遷移前 Combobox 根節點就**沒有** `focus-visible:outline-none`,
所以全域外描邊一直畫在它上面 —— 它是 Field 家族裡唯一沒抑制的。我做的是把它從外改成內,
而正解是**跟家族一樣抑制掉**(規則二第三列:單一狀態控制項滑鼠與鍵盤共用同一套 focus 樣式,
Field 的那一套就是邊框轉 primary)。已改成 `focus-visible:outline-none`,家族恢復一致。

**(c) user 要的「明確不用畫框的原則」已寫進 `focus-canonical.md`「問題一之二」**:
四類(虛擬游標 / Field 家族輸入控件 / 隱形整列觸發器 / 選單未選中項),
每類都要指得出承擔者是誰(file:line),指不出來就是要畫,**沒有第五類**。
分類不是憑印象 —— 是把瀏覽器逐站 Tab 出來的 10 個「無框站點」歸納出來的。

## T2 user 追問二:切換鈕 hover token —— **是專屬的,可以改,但要連按壓一起推**

`--neutral-selected-hover` 的消費者只有 `button.tsx:205/210`、`--neutral-selected-active`
只有 `:206` —— 兩個都是**切換鈕專屬**,改動範圍就是切換鈕,如 user 所料。

但直接把 hover 改 6% 會撞到按壓(它已經是 neutral-3 = 6%),問題只是從一處搬到另一處。
所以兩個一起推:

| | rest | hover | 按壓 |
|---|---|---|---|
| 未按下 | 透明 | `neutral-1`(淺 2% / 深 4%) | `neutral-2`(4% / 8%) |
| **已按下** | `neutral-2`(4% / 8%) | `neutral-3`(6% / 12%)← 改 | `neutral-4`(9% / 15%)← 跟著推 |

實測兩個主題都單調且處處不撞(淺色 250→245 / 245→240→232;深色 20→30 / 30→39→47)。
方向與 Carbon / Atlassian 的同名 token 一致(兩家本來就是變深);
放棄的是原本「變淺 = 預告釋放」的 Fluent 意圖 —— 那個意圖的實作值正好等於一般 hover,
所以它從來沒有真的表達出來過。

閘:`scripts/interaction-ladder-invariant.mjs`(selftest 4/4),守「同一條階梯內不得有兩個狀態長一樣」
與「必須單調遞增」。

## T3 G2:關閉不等於卸載

原本 `if (open) return children` —— 關一次面板狀態全部歸零,E 條「閱讀位置保存」與
F 條「初始化為關閉」都落不了地。改成一直渲染、關閉時 `display:none`。

**但只做這一半是不夠的**,實測祖先被 `display:none` 之後瀏覽器**會把捲動位置歸零**,
而且 ResizeObserver 會以 0×0 觸發一次 —— 那一刻量到的數字全是 0,拿去更新
「使用者剛剛在哪」會被洗成「貼在底部」。所以 `AgentConversation` 的兩個 handler 都先擋掉
「沒有版面」的情況,並記住最後一次看得見時的位置、回來時補上。
(這跟 person-display 的 `availablePx <= 0 → 不更新` 是同一條原則。)

實測:關前 63 → 開回 63。對抗驗證:改回 `{open && children}` → 關前 63 → 開回 180 而失敗。

### 兩個測試設計的坑(都踩過,寫進閘的註解)

1. **不要拿受控的草稿當證據**:`AgentPromptInput` 完全受控,值住在消費端 state,
   面板卸載也不會掉 —— 它測的是 story 不是面板。第一版拿它當證據,注入舊行為測試照樣全綠。
2. **不要捲到底**:聊天會自動捲到底,「捲到底 → 關 → 開」在有沒有保存的兩種實作下
   都給同一個數字。必須捲到中間,而且捲動範圍要夠大(第一版 max=60 太小)。

## T4 系統性發現:**20 幾支腳本的瀏覽器驗證在本機從來沒跑過**

`data-table-invariants.mjs` 那件不是孤例 —— 全 repo 有 22 處各自寫
`chromium.launch({ headless: true })`,而本 repo 沙箱**少了 `--single-process --no-sandbox`
就起不了 Chromium**。有 SKIPPED-ENV 守衛的一路回 exit 0(看起來綠的,其實一條都沒驗)。

抽成 `scripts/lib/launch-browser.mjs` 單一來源並遷移 18 支。遷完後第一次真的跑起來的:

| 閘 | 結果 |
|---|---|
| `agent-fab-hit-area-invariant` | ✓ 15 條命中區不變條件全過 |
| `agent-logo-continuity-invariant` | ✓ 231 影格 |
| `pagination-narrow-ladder-invariant` | ✓ PASS |
| `test-devmode-geometry-invariant` | ✓ 三個 DPR 全過(另修:single-process 開不了第二個 context,改成每個 DPR 重開瀏覽器)|

實測三種參數組合:只給 `--no-sandbox` 起不來、什麼都不給也起不來,**兩個都要**;
而 `--single-process` 的代價是開不了第二個 context —— 已寫進 launcher 的註解。

---

# U. G3 落地:並排 ↔ 蓋板(2026-09-07)

## U1 數字全是推導的,沒有一個是挑的

三個已定的量互鎖:面板 ≥ 360、**面板 ≤ 舞台的一半**(user 裁示 #5「50% 基準由視窗改舞台」)、
並排時 舞台 = 容器 − 面板 ⇒ **面板 ≤ 容器/3** ⇒ 並排只在**容器 ≥ 1080** 時成立。

實測六個寬度,1080 那一格剛好落在推導的邊界上:

| 視窗/容器 | 形態 | 面板 | 舞台 | 寬上限 |
|---|---|---|---|---|
| 1920 | 並排 | 400 | 1520 | 640 |
| 1600 | 並排 | 400 | 1200 | 533 |
| 1280 | 並排 | 400 | 880 | 426 |
| **1080** | 並排(邊界)| **360** | **720 = 面板 ×2** | 360 |
| 1000 | 蓋板 | 1000(全寬)| — | 無把手 |
| 800 | 蓋板 | 800(全寬)| — | 無把手 |

蓋板用 `absolute inset-0` 而不是把宿主推走:蓋板本來就不該改變底下內容的版面,
回到寬螢幕時宿主也不必重新排版。形態以 `data-agent-panel-mode` 標在根節點。
斷點常數 `AGENT_PANEL_SIDE_BY_SIDE_MIN_CONTAINER` 有匯出,消費端不必自己抄 1080。

## U2 量的是容器不是視窗,而且踩到我自己前一步造的坑

面板住在容器裡。視窗 1920 但容器只有 800 的版面(側欄 + 主內容 + 面板)用視窗算會給出
640 的上限,面板一寬舞台就被擠爆。量法用 ResizeObserver —— 側欄收合、分頁切換都不發 window resize。

**踩到的坑**:直接抓 `parentElement` 量到 0。因為 G2 為了「關閉時不卸載」在外面包了一層
`display: contents`(它刻意沒有盒子)。要往上找到第一個有盒子的祖先。
自己上一步的改動變成下一步的地雷,這種只有真的跑起來才會現形。

## U3 順手修掉一個「閘抄公式」的問題

`focus-indicator-invariants.mjs` 的 J2g 抄了一份 `min(640, ⌊視窗/2⌋)`,G3 改幾何之後整組假紅。
**閘不該複製被測對象的公式** —— 那等於同一件事寫兩遍,改一邊就壞。
改成測真正的不變條件:**按 End 之後 `aria-valuenow` 等於宣稱的上限,而且面板真的變那麼寬**。
上限本身怎麼算,交給 `agent-panel-breakpoint.mjs`。

### 又踩到兩個「等待」的坑(寫進閘註解)

- 固定 `sleep 200ms` → 量到中途值(實測 527 vs 宣稱 533,看起來像 bug 其實是量太早)
- 改成「等寬度不再變」→ **值還沒開始變時就判定成穩定**,量到改變**之前**的 400

正解是**等狀態、量結果**分開:先等 `aria-valuenow` 追上 `aria-valuemax`(End 真的套用了),
再獨立量渲染寬度。不能拿自己要斷言的東西當等待條件。

---

# V. C6 Slider —— 查下去發現的比原本登記的嚴重(2026-09-07)

## V1 原本登記的:用邊框變色當焦點,可能違反規則二

量化之後確認是真的:把手**平常就是藍邊**(`border-2 border-primary`),
聚焦只換成 `--primary-hover`,兩色對比僅 **1.46:1(淺)/ 1.33:1(深)** ——
等於看不出來,而且與 hover 完全同色,鍵盤使用者分不出「我在這裡」與「滑鼠經過」。

它不屬「明確不用畫框」四類任何一類,依問題一「可操作 → 必須畫」要畫。
修法是**拿掉 `outline-none`** 讓全域外描邊畫上去(元件不需要自己寫任何東西)。

## V2 查的過程中發現更嚴重的:**滑桿完全不能用鍵盤操作**

想驗焦點框時發現 Tab 根本走不到 slider。逐 story 掃:
**全 DS 每一個 slider thumb 的 `tabIndex` 都是 -1**,連按 15 次 Tab 焦點始終停在 body。
這是 **WCAG 2.1.1 Keyboard(Level A)** 違規 —— 比原本登記的顏色問題嚴重得多。

根因(讀 Radix 原始碼確認,不是推測):`slider.tsx` 寫
`tabIndex={fieldReadonly ? -1 : undefined}`,本意是「非唯讀時不管、讓 Radix 用它的預設」。
但 Radix 是 `tabIndex: context.disabled ? void 0 : 0` **之後**才 spread 我們的 props
(`@radix-ui/react-slider/dist/index.mjs:440-441`),所以 `undefined` 是把它**覆蓋掉**,
React 於是不輸出 `tabindex` 屬性。

**「傳 undefined = 不干預」是錯的直覺** —— 同 M2「消費第三方元件必驗真實 DOM」。
改成 `tabIndex={fieldReadonly ? -1 : 0}`。實測:Tab 停靠序列從全是 `(body)` 變成
`SPAN[slider] → SPAN[slider] → SPAN[slider] → (body) → …`。

## V3 閘

`focus-indicator-invariants.mjs` 新增 F5:每個 `[role=slider]` 都要可 Tab、真的用 Tab 走得到、
而且聚焦時真的畫出框。

**又一個量測時機的坑**:thumb 有 `transition-all duration-150`,**連 outline-offset 也一起過渡** ——
70ms 時量到 `@1px`,看起來像多出第三種幾何,其實是動畫跑到一半。等 300ms 後是 `@2px`,正確。

## V5 M10 延伸掃描:同款 `tabIndex` 陷阱只有 Slider 一處

`tabIndex={cond ? -1 : undefined}` 這個寫法在 DS 內共 3 處同款(RadioGroup / Checkbox / Switch)。
它們底層是原生 `<button>`(天生可聚焦),所以 `undefined` 無害 —— 但這正是我剛才推論錯的那一類,
所以實測而不是推論:**全 DS 465 個 story 掃過一次**,列出所有「有互動 role 但 `tabIndex < 0`」的元素。

| role | 數量 | 判定 |
|---|---|---|
| option / treeitem / tab / radio / menuitem | 181 / 59 / 47 / 35 / 9 | **合法** —— APG roving tabindex(整組只有一個可 Tab)|
| button | 194 | 多為懸停才現身的行內動作與 roving 群組內成員 |
| **switch / checkbox / slider** | 3 / 1 / 1 | 逐一查:**全部都是 `aria-readonly="true"`**,那時本來就該 -1 |

結論:**Slider 是唯一真的違規**,其餘沒有第二處。

閘 F6 刻意**只挑不走 roving 的三種 role**(switch / checkbox / slider):
把 roving 的一起掃只會產生大量合法噪音,閘一吵就沒人看。

## V4 順帶確認 a11y 全掃的 4997 個 color-contrast 不是本輪造成的

CI 跑的是 `a11y:check --gate`(baseline-diff,**只在新增/增量時 fail**),
所以那 4997 是既有 baseline。本輪另跑一次 `--gate` 做回歸檢查。
(這支腳本本身也是「從沒在本機跑過」那批之一 —— 補上沙箱參數後才第一次跑起來。)

---

# W. DataTable role 誠實化 + a11y gate 歸因(2026-09-07)

## W1 `role="table"` → 條件式 `grid`(A4 的前置之一)

現況是**宣稱與行為不一致**:一律宣稱 `role="table"`,卻同時掛 `tabIndex=0` 與方向鍵導覽。
螢幕閱讀器使用者被告知這是靜態表格、不會知道要按方向鍵,而且瀏覽模式會把方向鍵攔去朗讀。

改成 **`spreadsheetMode` 才宣稱 `grid`**(那裡儲存格真的可聚焦、方向鍵移動游標、Enter/F2 進編輯);
其餘維持 `table`。**不是一律改 grid** —— 非 spreadsheet 的儲存格不可聚焦,宣稱 grid 會讓 AT
進入它提供不了的互動模式,比宣稱 table 更糟。儲存格 role 跟著根節點走(grid ⇒ gridcell)。

實測三個 story:spreadsheet → `grid` + 24 gridcell / 0 cell;另兩個 → `table` + cell / 0 gridcell;
axe 的 ARIA 結構規則(aria-required-children / parent / roles / allowed-role / allowed-attr)三個 story 皆 0 違規。
新增 I29 守「兩者同源、不得混用」。DataTable 不變條件 324 → **328**。

### 我自己踩的 CSS 選擇器坑

把閘裡 24 處 `[role="cell"]` 機械替換成 `[role="cell"], [role="gridcell"]` 之後 I23 當場紅、Δ 406px。
根因是**選擇器清單的逗號在最上層分割**:
`[role="row"][data-row-index="0"] [role="cell"], [role="gridcell"]` 的第二段脫離了 row 的範圍,
變成掃全文件。正解是 `:is([role="cell"], [role="gridcell"])`。已全部改掉並寫進閘註解。

**A4 仍未解除**:另外兩個前提沒動 —— 虛擬捲動下 activedescendant 目標必須真實存在、
同一列在三面板各渲染一次故 IDREF 歸屬未定。

## W2 a11y gate 的 20 個「新增」逐一歸因:**沒有一個是本輪造成的**

`a11y:check --gate` 是 baseline-diff。跑出 20 個新增,逐一查:

- **baseline 本身過期**:它是 **2026-08-02、990 個 story** 產的,裡面 **0 個 AgentPanel**
  (那家族 9/2 才出)。gate 自己也印了「Storybook corpus differs from the governed a11y baseline」。
  所以 AgentPanel 全家、我新加的 `HugWidthMultiStack`、以及 8/2 之後新增的 story 的違規全算「新增」。
- **唯一能真的比對的兩個**,做了前後對照:
  - `tokens-color--interactive`(34→36):把 token 還原成改動前的值再跑 axe,**36 = 36,零差異** ——
    不是我的 token 改動。那 +2 是 `9ec71fd3`(Highlight token,8/28)加的 swatch 帶的。
  - `datatable-展示--row-auto-height`(2→4):4 個全是 **story 說明段落**
    (`<p class="text-caption text-fg-muted">`),數量變多是因為該 story 在 baseline 之後多了兩段說明。
- 5 個「掃描出錯」是 `document 404` 的傳輸層 transient(同批中文 id 有 1010 個掃成功;
  其中 `slider-設計規格--overview` 我剛才才手動開過、三個 slider 都在)。

## W3 ~~順帶量出一個 DS 層級的真問題~~ —— **2026-09-07 撤回,我把來源歸錯了**

我原本寫「取樣 42 個 story、132 個 color-contrast 節點,**125 個(95%)是 `text-fg-muted`**,
`--fg-muted` 在兩個主題都不過 AA,而它在元件內有 142 處」,並據此建議調深或拆 token。

**user 當場質問「我們的元件是哪個地方定義了 12px 配 fg-muted?」——查下去我是錯的:**

| | `text-fg-muted` 總處數 | 其中**同時搭 12px**(`text-caption`) |
|---|---|---|
| **DS 元件**(排除 stories)| 143 | **8**,其中一處還是 story helper → **真正的元件只有 6 處** |
| **stories** | — | **579** |

那 6 處是:Calendar 星期標題(`:335`)、Calendar 日期格內小字(`:441`)、
DropdownMenu 快捷鍵提示(`:267`/`:544`)、Command 群組標題(`:117`)、Command 快捷鍵(`:164`)——
**全部是輔助性提示**,正是 user 說的「placeholder 和不重要的字」。

**我的量測方法有問題**:對**整個 story** 跑 `axe.run(document)`,裡面混進了 story 自己的
說明段落(`<p class="text-caption text-fg-muted">`)。那是**文件排版的字,不是元件輸出的字**。
所以那個 95% 講的是「我們寫 story 的習慣」,不是「DS 元件的無障礙品質」——
**我把文件的問題講成了 DS 的問題**,而且據此提了一個會改動 143 處元件的建議。

教訓寫在這裡:**跑全 story 的稽核時,違規來自「元件」還是「story 的說明文字」必須先分開**,
否則會拿文件的數字去逼元件改設計。

### user 裁示(2026-09-07,逐字)

> 「這就維持現狀啊,這個顏色不就本來只會用在 placeholder 和不重要的字嗎?要那麼清楚到底要幹嘛?」

**維持現狀。** `--fg-muted` 的定位就是低對比的輔助文字,`color.spec.md:93` 本來就寫
「placeholder、caption、弱化 icon」。它用在圖示時走 1.4.11 只要 3:1(現況 3.36 過);
用在輔助文字上是刻意的視覺層次選擇。

---

# X. 「不用畫框」原則:改之前是什麼、現在夠不夠密、全 DS 有沒有偏移(2026-09-07 回答 user 三問)

## X1 改之前是什麼 —— **只有一句抽象的例外,寫了兩次**

`git show 07760448~1` 查證,當時全文只有這兩句(內容相同):

> `:89` 刻意不畫的唯一合法理由是**指示器畫在別的元素上**,而且必須指得出承擔者(file:line)。
> `:168` 唯一的例外是「指示器由別的元素承擔」—— 而且必須指得出承擔者是誰(file:line)。

**沒有列舉、沒有判斷程序、沒有留痕機制。** 三個後果,當天全部發生:

1. 每次遇到都要重新推導一次「這算不算例外」;
2. 推導完**不留痕跡** —— 下一個人看到 `outline-none` 只能重猜它是刻意還是忘了;
3. 於是「其實是漏掉」的案例混在裡面沒人發現。當天抓到三個:
   `steps.tsx`(三條 focus outline 從寫下起沒畫過)、
   `chart.tsx`(圖表可 Tab 但焦點被抑制)、
   `slider.tsx`(把手根本不可 Tab —— **WCAG 2.1.1 Level A**)。

## X2 現在夠不夠密 —— **原本不夠,已補上兩個缺口**

我第一版寫了四類。拿全 DS **28 個抑制點**逐一對回去,**有兩類對不上**:

| 對不上的 | 是什麼 | 處置 |
|---|---|---|
| Popover / HoverCard / DropdownMenuContent / FileViewer 的殼(4 處)| 浮層打開時把焦點送進容器本身讓 AT 讀到,使用者不是自己 Tab 過去的 | **新增 E 類** |
| Sidebar 分組標題 / Steps 的 li 與不可點步驟 / recharts 內層 SVG(5 處)| **根本不可操作** | 不進這張表 —— 問題一已經答完;文件加註「遇到這種先回問題一,不要來這張表找位置」|

同時補上**七步判斷程序**(照順序問,問到有答案就停):
可操作嗎 → 浮層程式落點嗎 → 虛擬游標嗎 → Field 輸入控件嗎 → 隱形整列鈕嗎 → 選單未選中項嗎 → **要畫**。
每一步都是「看得出來就答得出來」的問句,不需要判斷者自行權衡;走到第 7 步就是要畫,**沒有第八條**。

## X3 全 DS 有沒有偏移 —— **28 處全部逐一分類並標在現場,配閘防漂**

| 類別 | 處數 | 例 |
|---|---|---|
| A 虛擬游標 | 2 | TreeView 根、DataTable 根 |
| B Field 家族輸入控件 | 12 | Input / Textarea / DatePicker×3 / TimePicker / Combobox×3 / SelectMenu / Command / AgentPromptInput |
| C 隱形整列觸發器 | 1 | InlineEdit |
| D 選單未選中項 | 4 | SidebarMenuButton / DropdownMenu / MenuItem / Command item |
| E 浮層程式落點 | 4 | Popover / HoverCard / DropdownMenuContent / FileViewer |
| N 不可操作(問題一) | 5 | Sidebar 分組標題 / Steps ×2 / recharts ×2 |

每一處都在**現場**寫上 `@focus-suppress <類別> — <說明>;承擔者:<誰>`。
閘 `scripts/focus-suppression-registry.mjs`(selftest 12/12)要求:
新增任何抑制都得表態、而且 A–E 類**寫不出承擔者就 FAIL** —— 寫不出來正代表它不屬於那一類。

### 兩個誠實登記的缺口(標在程式碼裡,不是藏起來)

- **DataTable 純選取模式沒有承擔者**:實測 Tab 落在表格根節點時,根節點自己不畫、
  表內也沒有任何東西被指示 —— **零線索**。那句既有註解「儲存格選取框 IS the visual focus
  indicator」只在使用者**已經選過一格之後**才成立。
  已修 spreadsheet 模式(Tab 進場初始化游標到第一格,實測選取框出現:206×39、1px primary、對比 5.19:1);
  **純選取模式仍缺** —— 那就是 A4,見下。
- **DatePicker 起訖共用一圈邊框**:兩個 tab stop 罩在同一個框裡,分不出焦點在起日還是迄日(H2c)。
  已標在該處,屬判斷題未拍板。

### 閘寫壞兩次的紀錄(留著提醒)

1. 只剝 `//` 沒剝 `/* */` → 把兩句「說明文字裡提到 outline-none」誤判成違規。
2. 剝跨行註解時換成單一空白 → **行號整批錯位**,錯報 27 處。正解是保留換行數。

## X4 未完成任務總帳(2026-09-07 收盤)

| # | 項目 | 卡在哪 |
|---|---|---|
| **A4** | DataTable 列游標(純選取模式焦點無指示)| `role=grid` 前提**已解**;仍卡:虛擬捲動下 activedescendant 目標必須真實存在、同一列在三面板各渲染一次故 IDREF 歸屬未定 |
| **H2c** | DatePicker 起訖兩個 tab stop 共用一圈邊框 | 判斷題,未拍板 |
| **E1** | 虛擬捲動崩潰 | 複現不出(12 次全高來回 + 拖曳中大幅捲動 10 次皆 0 錯誤)|
| **E2** | Reviewers「+2」溢出 | 量測基準已修但**未能重現 user 截圖的觸發時機** |
| **G1** | Dialog 背景隔離會把 agent 一起關掉 | 需真瀏覽器 POC(`focus-scope:72` 的 `focusScopesStack.add` 不看 trapped)|
| **G4** | 該情境的 axe `aria-hidden-focus` | G1 的一部分 |
| **C10** | `hooks/scripts` 符號連結方向 | 非本 session 造成,未裁示 |
| — | agent 鍵盤往返 | **user 已裁示 backlog**(「agent 鍵盤的互動很次要」)|

---

# Y. G1 POC 做完了 —— 但結論不是「通過」或「不通過」,是「今天問不到這一題」(2026-09-07)

## Y1 原本要驗什麼

讀 `@radix-ui/react-focus-scope` 得到的事實(三處,逐行實查):
`:71-73` `focusScopesStack.add` 寫在 `if (container)` 裡、**不看 `trapped`**;
`:184-190` `add` 會對前一個 scope 呼叫 `pause()`;
`:105` Tab 守衛開頭就是 `if (focusScope.paused) return`。
推論:掛載任何 FocusScope(含 `modal={false}` 的)都會讓 Modal Dialog 的 Tab 守衛失效。

## Y2 實測結果:**那個失效今天觸發不到,因為浮層一開始就打不開**

| | Modal Dialog 開著 | 對照組:沒有 Dialog |
|---|---|---|
| `body { pointer-events }` | **none** | auto |
| 觸發鈕拿得到焦點嗎 | **不能** —— 焦點被拉回 `poc-inside-1` | 能 |
| 按 Enter 開得了選單嗎 | **開不了** | 開得了 |

所以「並存」這件事本身還不存在,談不上它會不會破壞焦點鎖。
**G1 的硬約束仍未驗證**,而且要等隔離範圍縮到舞台之後(`suppressOthers(targets, stageEl)`,見 L1)才驗得到。
這比「驗過了、沒問題」誠實,也比「憑讀原始碼宣稱它會壞」準確。

## Y3 順帶量到 G4 的直接證據

舞台元素是 `aria-hidden="true"` 但 **`inert=false`** —— 也就是**仍在 Tab 順序裡**。
那正是 axe `aria-hidden-focus` 的形狀。今天沒有變成「焦點跑出去」,只是因為 FocusScope
的 Tab 守衛還在攔;守衛一旦被 pause(就是 Y1 那條路徑),它就會現形。

## Y4 這支 POC 前後改了五次才拿到可信的量測 —— 坑全部寫進腳本註解

1. 判定「焦點在不在 Dialog 內」寫成 `closest('[role="dialog"]')` ——
   **Radix 的 PopoverContent 自己就帶 `role="dialog"`**,判定是模糊的。改用 `[aria-modal="true"]`。
2. 對照組用「把 Dialog 關掉」:找關閉鈕的文字選擇器命中不到 → 靜靜地什麼都沒關;
   改按 Esc → 被最上層的浮層接走。**兩次都在「Dialog 還開著」的狀態下量**。改用獨立 story。
3. 非 modal Popover 的內容不進自然 Tab 順序 → 對照組建立不起來。改用 DropdownMenu。
4. Radix 選單是 `pointerdown` 開的,`.click()` 不會觸發。改用聚焦 + Enter。
5. 浮層已經開著時再點一次會**關掉**它。開啟動作要冪等。

**一句話**:「沒有觀察到 X」在對照組成立之前不代表任何事。
第一版的 POC 印出「✓ 焦點鎖仍然成立」——那是完全沒有根據的假綠,是對照組把它抓出來的。

---

# Z. C10 結案:符號連結方向(2026-09-07)

`hooks/scripts` 在工作區指向 `.claude/hooks`(生成視圖),版本庫記錄的是
`packages/design-system/ds-canonical/hooks`(canonical)。原本登記為「未裁示」。

**查下去發現這件 2026-08-28 已經處理過**,而且記在失敗記憶索引裡
(`historical-bugs.md:263`):那個連結是 **8/1 舊 generator 留下的本地殘影**,
8/2 佈局改版後**沒有人寫得回去** —— 因為 Claude Code 對 hook 設定目錄有**平台內建**的
防注入保護(不是我們自家沙箱設的)。當時的正解是 `git update-index --skip-worktree`,
只寫 `.git` 的可寫區、不碰被鎖路徑。

本輪狀態是那個 skip-worktree 被清掉了(所以又冒出來)。重新套用,並實測確認前提沒變:

- `ln -sfn ../packages/design-system/ds-canonical/hooks hooks/scripts` → **`Operation not permitted`**(平台鎖仍在)
- `git update-index --skip-worktree hooks/scripts` → 成功,`git ls-files -v` 顯示 `S`,`git status` 乾淨

順帶記一件會誤導人的事實:兩棵樹**內容並不相同** ——
canonical 多了 `record_release_consent.sh`、其測試、一個 retired 檔;生成視圖多了
`lib/_approval_re.sh` 與 `tests/KNOWN-BROKEN.md`。所以總帳原本寫「內容相同故行為一致」是**不準的**。
不過 `managed-host-assurance` 與 `npm run hooks:test` 都**直接讀 canonical**
(`harness-source-inventory.mjs:2008` 明文),不經過這個別名,所以行為確實不受影響。

---

# AA. 涵蓋率訂正:我先前說「全 DS」,實際只掃了 39/67(2026-09-07)

user 問「確認所有 ds 內容都有按此原則沒有偏移?」。抑制側我逐一標了 28 處沒問題,
但**正面那側**(每個可操作元素有沒有正確畫)靠的是 `focus-geometry-browser-audit.mjs`,
而那支的元件清單是**手寫死的 39 個名字** —— DS 有 67 個元件。

漏掉的 29 個包括 **Input / Select / Textarea / NumberInput / LinkInput / Dialog / Sheet /
Pagination / Toast / AccountMenu / ProfileCard / BulkActionBar / Coachmark /
FieldControlGroup / SelectionControl** 等,而我在報告裡寫的是「全 DS」。

寫死的清單還有個更糟的性質:**新元件不會自動進來**,漏了也不會有人發現。
已改成從 storybook 索引自動推導(`Components/<名字>`),涵蓋 **58 個**
(其餘 9 個沒有 `Components/*` story,如 README 與內部目錄)。

## 擴大後立刻抓到一個真的

**Pagination 的按鈕外框三面被裁**:上 4 / 下 4 / 左 4 px。
根因不是按鈕,是它們住的 `<nav>` 有 `overflow-x-auto`(`pagination.tsx:281` —— 那是
「砍無可砍時整條橫向可捲」的既有 canonical,不是可以拿掉的東西);
依 CSS 規範一軸不是 visible 時另一軸也計算成 auto,所以兩軸都裁。**框畫了等於沒畫。**
改成內描邊,寫在 `<ul>` 那一層而不是逐顆按鈕 —— 「會被裁」是容器的性質,不是某顆按鈕的性質。

## 擴大後的完整結果

**85 站外描邊正確 / 1 站已知殘留(Combobox story 內與欄位相鄰的 Button,共用 primitive 可接受)
/ 15 站無框**。15 站逐一對回類別表:全部落在已登記的 A(TreeView)、B(Field 家族裸 input:
Input / NumberInput / Textarea / FieldControlGroup / Combobox / DatePicker / TimePicker /
AgentPromptInput / Slider 的欄位 / AppShell 的欄位)、C(InlineEdit)、D(AppShell 的側欄鈕未選中)——
**沒有新的違規**。

---

# AB. user 2026-09-07 第二輪三問:三題都是真的漂移

## AB1 Command 群組標題 —— 沒有消費 SSOT,自己抄了一份走樣的值

**SSOT 在 `item-anatomy.spec.md:188`**:分組標題用 `MenuItem header={true}` 模式,
`font-medium text-fg-muted` + 與 items **完全相同的 row geometry(同 px / 同 py / 同 text size)**。

- **SelectMenu 一直照做**:`heading={<MenuItem size={size} header>…}` + `[&_[cmdk-group-heading]]:p-0` 中和 cmdk 內距
- **Command 沒有**:`command.tsx:118` 手寫 `px-3 py-1.5 **text-caption**` —— 12px,canonical 要求與項目同級

所以不是「兩種設計語言」,是 Command **沒有消費 SSOT**。而且 `CommandDialog` 還有**第二份**手寫覆寫。
改成:consumer 傳字串時由 CommandGroup 包成 `<MenuItem header>`,樣式完全由 SSOT 決定;
傳 element 則原樣尊重。兩份手寫全刪。實測標題 12px → **14px / 500 / fg-muted / px-12,與項目一致**。

## AB2 Calendar 星期標題 —— 比一個「已被撤銷的錯誤」還弱

user 問「為何要用那麼淺的顏色?用 secondary 不好嗎?有仔細研究過嗎?」

**DS 早就研究過而且方向相反**。`date-grid.spec.md:151`「Weekday header canonical(2026-05-03 v9)」:
> `text-foreground text-body font-medium`(neutral-9 + 500 weight + body size)。對齊 caption「April 2026」
> 同視覺權重(都屬 calendar header 區),**不弱化**。**撤銷 v3 用 `fg-secondary font-normal` 的 mistake(M23)**。

Calendar 用的是 `text-caption text-fg-muted font-normal`(12px / 45% 灰 / 細體)——
**比那個已被撤銷的 `fg-secondary` 還弱**。而且 `calendar.spec.md` 沒有另訂星期排版,所以那條是唯一 canonical。
在本元件內也是孤例:月份標題 `text-body-lg font-medium`、日期數字 `text-body font-medium`,只有星期是 12px 細灰。

已改為消費 canonical。實測 **14px / 500 / 對比 19.26:1**。

## AB3 可輸入的 DatePicker —— 「同時出現」其實一直沒有支援

user 說「明明這個元件是允許同時出現 focus+日期選單的啊…而且我們明明也支援」。
**實測結果與這個認知相反**:日曆一開,焦點就被搬進日曆內的按鈕,**之後打字完全進不去**(值不變)。
也就是 `typeable` 這個 prop 的賣點在日曆開啟後就失效。而且點文字區根本不會開日曆
(input 上有 `onClick stopPropagation` 把點擊吞掉),只有點到圖示那一小塊才會。

### 查證(WebFetch 實抓,不是憑印象)

- **Ant Design 官方文件**逐字:「By clicking the input box, you can select a date from a popup calendar」,
  且 `inputReadOnly` 預設 `false`(可同時打字)。
  → 我們程式碼註解寫的「Calendar icon 點才開(Material/**Ant** typed-date idiom)」**對 Ant 是反的**。
- **W3C APG date-picker combobox** 逐字:「The date picker dialog is opened by activating the choose date
  button or by moving keyboard focus to the combobox and pressing Down Arrow or Alt + Down Arrow」。

### 定案:依「怎麼被打開的」分流

| 怎麼開的 | 日曆 | 焦點 | 依據 |
|---|---|---|---|
| 點欄位任何地方 | 開 | **留在輸入框,可繼續打字** | Ant 官方文件 |
| ArrowDown / Alt+ArrowDown | 開 | **進日曆** | W3C APG;焦點不進去就走不了日期格 |

**兩條不是二選一** —— 好用的是滑鼠那條,但鍵盤那條不能為了它犧牲可操作性。
實測 7 項全過(點文字開、焦點留、能打字、日曆不關;鍵盤開、焦點進、方向鍵能走格)。

實作註記:焦點是用「開啟後下一幀 refocus」拿回來的,**不是**靠攔 `onOpenAutoFocus` ——
實測那個事件在本組合下根本沒被派發(探針顯示 handler 從未執行,焦點卻仍被移走),
追 Radix 內部只會愈追愈深。不依賴第三方內部行為才守得住。

### 「ds 是否有其他類似問題」—— 全掃過了

| 元件 | 浮層開啟後焦點 | 還能打字嗎 | 判定 |
|---|---|---|---|
| Command / PeoplePicker | **留在 input** | ✓ | 正確(cmdk 系) |
| DatePicker(typeable) | 進日曆 | ✗ | **本輪已修** |
| TimePicker / Combobox / Select | 進浮層 | ✗ | 那些觸發器**不是可輸入的**,焦點進浮層是 APG dialog 模式的正確行為 |

所以同類問題只有 DatePicker 一處。

機械閘:`scripts/datepicker-typeable-open.mjs`(兩條路都驗,少驗一條就會把另一條弄壞)。

---

# AC. 收盤:剩下什麼(2026-09-07)

## AC1 真正還沒完成的,只剩五項,而且每一項都寫得出「卡在哪」

| # | 項目 | 卡在哪 | 能不能自己解 |
|---|---|---|---|
| **A4** | DataTable **列**層級的鍵盤游標 | `role=grid` 前提**本日已解**;表格層級的框**本日已補**(內描邊,鍵盤畫、滑鼠不畫)。仍缺的是「游標停在哪一列」—— 卡在:(1) 虛擬捲動下 `aria-activedescendant` 指到的列必須真實存在(捲出視窗會被卸載);(2) 同一列在左/中/右三個面板各渲染一次,IDREF 該歸誰未定 | (1) 有解法方向(釘住 active 列不卸載,同 DragOverlay 的處理);(2) 需要定一條「中央面板擁有 id」之類的規則。**兩者都是工程判斷,不需要拍板**,但份量不小 |
| **H2c** | DatePicker 起訖兩個 tab stop 共用同一圈邊框,分不出焦點在起日還是迄日 | **判斷題**:要不要為此讓兩顆各自畫框(那會在同一個欄位裡出現兩種指示) | 已標在程式碼現場。屬產品/UI/UX 取捨 |
| **E1** | 虛擬捲動崩潰(user 曾報「50 筆虛擬表捲一捲就會出錯」) | **複現不出**:12 次全高來回、欄位釘選、拖曳中大幅捲動 10 次,皆 0 錯誤 | 再遇到需要截圖從該狀態反推 |
| **E2** | Reviewers「+2」溢出 | 量測基準已修(B1),但**未能重現 user 截圖的觸發時機** | 同上 |
| **G1** | Dialog 背景隔離會把 agent 一起關掉 | POC 已做完,結論是「**今天問不到這一題**」—— Modal Dialog 開著時舞台浮層根本打不開(body `pointer-events:none` + 焦點被拉回),所以「並存會不會破壞焦點鎖」還不存在。要先把隔離範圍縮到舞台(`suppressOthers(targets, stageEl)`,見 L1)才驗得到 | 隔離縮範圍是明確的工程動作,但會改變 Dialog 的行為邊界,份量大 |

**user 已裁示 backlog**:agent 鍵盤往返(「agent 鍵盤的互動很次要,我已經講過了」)。

## AC2 本輪新增/修好的閘(全部含 selftest 或對抗驗證)

| 閘 | 守什麼 |
|---|---|
| `focus-suppression-registry.mjs` | 每處焦點抑制必須表態類別 + 承擔者(selftest 12/12)|
| `focus-geometry-invariant.mjs` | 只准兩種幾何,禁 ring-offset / 禁抄全域 / 禁手寫內描邊(selftest 9/9)|
| `focus-geometry-browser-audit.mjs` | 真瀏覽器逐站量框有沒有越界(涵蓋 58 元件,清單自動推導)|
| `focus-indicator-invariants.mjs` | F1 差異非空 / F2 一次一個框 / F3 虛擬游標 / F4 宣稱=真實 / F5 slider 可 Tab / F6 控件都在 Tab 順序 |
| `interaction-ladder-invariant.mjs` | 互動階梯單調且處處不撞(selftest 4/4)|
| `drag-announcement-invariant.mjs` | DndContext 必須接播報 + 啟動門檻(selftest 5/5)|
| `drag-runtime-contract.mjs` | 真滑鼠驗 C1/C2/C3/C4/C5 |
| `agent-panel-breakpoint.mjs` | 並排↔蓋板斷點(六個寬度)|
| `agent-panel-reopen-state.mjs` | 關閉再開,閱讀位置與狀態還在 |
| `agent-panel-dismissable-layer-invariant.mjs` | 面板殼永不進 dismiss 疊(selftest 5/5)|
| `datepicker-typeable-open.mjs` | 滑鼠開留焦點 / 鍵盤開進日曆,兩條都驗 |
| `dialog-focus-trap-poc.mjs` | G1 的事實取得(含對照組)|
| `data-table-invariants.mjs` | 322 → **332** 條(+I27c hug / +I29 role 同源 / +I30 表格焦點框)|
| `scripts/lib/launch-browser.mjs` | 沙箱啟動參數單一來源(18 支腳本遷移;先前它們全部從沒真的跑過)|

## AC3 本輪我自己犯而且被抓出來的錯(留檔,不是自責)

1. **WCAG 條號與等級都講錯**(說 2.4.11 AA,實為 2.4.13 AAA),並據此提了會改動 143 處的建議 —— 撤回
2. **把 story 說明文字的對比問題算成 DS 元件的問題**(95% 的數字來自文件排版)—— 撤回,user 當場質問才發現
3. **宣稱「全 DS」但只掃了 39/67** —— 改成自動推導 58 個,並因此抓到 Pagination
4. **第一版 POC 印出「✓ 焦點鎖仍然成立」** —— 完全沒有根據的假綠,是對照組抓出來的
5. **原則第一版只有四類**,拿 28 個抑制點對回去有兩類對不上
6. **Slider 改用外描邊時忘了刪舊的邊框變色** —— 同一顆把手兩個指示器,相容性檢查抓到
7. **機械替換 `[role="cell"]` 造成 CSS 選擇器清單 bug**(逗號在最上層分割),I23 當場紅
8. **在治理生成 / a11y baseline 跑到一半時改檔案**,兩者各失敗兩次

共同形狀:**「沒有觀察到 X」在對照組成立之前不代表任何事**,以及**閘不該複製被測對象的公式或寫死清單**。

---

# 2026-09-08 收尾:五項剩下兩項,而且兩項都不是「沒做」

## AD1 判準第二版 —— 我第一版還是分類題,重寫成七個「去看什麼」

user 問「所以你到底加上了什麼合理且容易判斷的原則?」。回頭看第一版判準:
「它是不是 **Field 家族**的輸入控件」—— 那要先認得出那個家族,仍然是分類題。
改成七步,每一步都能用 grep 或 DevTools 當場答:

| 步 | 去看什麼 | → |
|---|---|---|
| 1 | 有 onClick / onKeyDown / 是原生互動元素嗎? | 否 → 不畫,且拿掉 tabIndex |
| 2 | `tabIndex=-1` 且是浮層開啟時被程式 `.focus()` 的殼? | **E** |
| 3 | 身上有 `aria-activedescendant`? | **A** |
| 4 | 標籤名是 `input` / `textarea`? | **B**(插入點 caret 就是指示)|
| 5 | 從**自己**往上找,有元素在聚焦時改邊框／底色? | **C** |
| 6 | 選單／清單項且此刻沒被選中? | **D** |
| 7 | 以上皆否 | **要畫** |

**拿 28 處去對,當場撞到兩面牆,兩面都是我把分類綁錯層次:**

1. **B 綁在「元件族」上**。AgentPromptInput 的 textarea、Command 與 SelectMenu 的搜尋框
   都不是 Field 家族;而 Command / SelectMenu 的殼**根本沒有** `focus-within`
   (只有一條靜態 `border-b border-divider`),連「祖先承擔」都不成立。
   它們共同的指示器是**文字插入點**。所以判準是**元素種類**(看標籤名),不是元件族。
2. **C 寫成「往上找祖先」**。`combobox.tsx:857` / `time-picker.tsx:379` 那一行的元素
   **就是**那圈欄位外框(`fieldWrapperStyles` + `focus-within:!border-primary`)。
   `:focus-within` 在自己聚焦時也命中 —— 它們有畫,只是用邊框轉色。改成「從自己往上」。

因此重新分類 6 處(全部原本標錯):combobox `<select>`、combobox 外框本身、
time-picker 外框本身、date-picker 起訖兩顆 button。

## AD2 閘從「有沒有貼標籤」升級成「貼的類別對不對」

判斷程序每一步都指定了要看什麼,那個東西就必須找得到:

| 類 | 閘去驗什麼 |
|---|---|
| A | 同檔有 `aria-activedescendant` |
| B | 往上 40 行有 `<input>` / `<textarea>`;寫在 cva 常數裡則看本檔渲染什麼標籤 |
| C | 同檔有 `focus-within` / `:has(…)`,**或**承擔者寫的 `檔名.tsx:行號` 去查真的有畫框 |
| D | 同檔有 `bg-neutral-hover` / `data-[highlighted]` |
| E | 同檔有 Radix Content 殼 |

承擔者因此從一句話變成**可驗證的指標**:承擔者搬家或被刪,閘會紅。

**對抗測試又抓到閘自己的 bug**:回看視窗取的是**第一個**標記而不是**最近的**,
兩處抑制相距 8 行以內時,後面那處會讀到前面那處的類別 —— 標錯就被遮住。已改成取最近的。

## AD3 H2c 不是判斷題,是漏套 —— 已修並驗證

原本登記成「要不要為起訖兩顆各自畫框(那會在同一欄位出現兩種指示)」。
**這個框架本身就錯了**:DatePicker 自己早就有正確的指示 —— 作用端下方一條主色粗線
`decoration-primary decoration-2 underline-offset-4`,對照
[Ant Design RangePicker 的 `-active-bar`](https://raw.githubusercontent.com/ant-design/ant-design/master/components/date-picker/style/index.ts)
(`height: lineWidthBold; background: colorPrimary; bottom: -lineWidth`,一手 source 實抓)。
問題只是那條線掛在 `data-active-end`,而它帶 `open &&` 條件 ——
**面板關著用 Tab 在起訖之間移動時,兩顆長得一模一樣**。

補上 `focus-visible:underline`(同一條線,不是第二種指示)。真瀏覽器驗:
Tab 到起日 → 只有起日有底線(`oklch(0.54 0.22 258)` / 2px);再 Tab → 底線跟著移到迄日,前一顆消失。

**一般化成規則寫進 SSOT**:同一個承擔者被兩個以上 tab stop 共用時,每一顆必須另有自己的區分指示。
閘把同檔內承擔者字串相同的 C 類分組,≥2 就要求各自有 `focus-visible:` 非 `outline-none` 樣式。
對照組驗過:拿掉修復 → 閘紅並指名兩行;補回 → 綠。

## AD4 A4 問的是一個不存在的功能 —— 查證後結案

「純選取模式的列游標沒有指示」。實測:

- 該模式 `role="table"`(不是 grid)。依 APG,table 是**靜態結構**,不帶方向鍵游標。
- 連按 ArrowDown / ArrowRight:`cursors=0`、`aria-activedescendant=null`
  —— 程式碼側也對得上,方向鍵導覽整段被 `spreadsheetMode` 把關(`data-table.tsx:2628/2640`)。
  **沒有游標,就不存在「游標指示不了」。**
- 鍵盤路徑本身是完整的:表格根節點取得焦點時有主色內框(896×442, 2px, offset −2px);
  每一列的核取方塊是 tab stop 且自己畫框(16×16, 2px, `oklch(0.54 0.22 258)`)。

所以原本記的兩個前提(虛擬捲動下 activedescendant 目標要存在、三面板 IDREF 歸屬)
**是為了一個 DS 沒有也不需要的功能而設的**。A4 結案;若日後真要做列游標,那是新功能不是缺陷修補。

## AD5 回頭盤 CI 引用,抓到「宣稱有閘、其實沒人跑」再犯一次

`ci.yml` 自己的註解記過兩次這種事(distribute-column-widths、pagination)。
我這輪建的閘,回頭 `grep -rl test:focus-suppression .github` → **0**。逐一盤:

| 閘 | 盤點前 CI 引用 |
|---|---|
| test:focus-suppression / focus-geometry(靜態+selftest)/ interaction-ladder / drag-announcements | 0 |
| focus-geometry-browser-audit / focus-indicator-invariants / drag-runtime / datepicker-typeable-open | 0 |
| test:agent-panel-invariants / test:pagination-invariants | 1(這兩組先前已接)|

已接上:靜態四組獨立一步(快速失敗),需要瀏覽器的五支併進既有的 DataTable pixel 步
(那裡 storybook 與 chromium 已備好)。全部在本機跑過一遍才接,不是把紅燈接進 CI。

## AD6 兩個量測坑(都差點讓我下錯結論,寫進腳本註解)

1. **`transition-colors` 的 transition-property 含 `outline-color`。**
   聚焦後**立刻**量 `getComputedStyle().outlineColor` 會抓到**過渡中間值**。
   我因此一度量到 Button / Checkbox 的焦點框是 `oklab(1 0 0)`(白)、`oklab(0 0 0/0.85)`(黑),
   差點寫成「全 DS 焦點框顏色失效」這種大結論。等 600ms 後三個元件都回主色 `oklch(0.54 0.22 258)`。
   **凡是量 focus 顏色,一律先等過渡跑完。**
2. **`document.body.focus()` 不會重設 Tab 起點**(body 預設不可聚焦)。
   於是 Tab 從「上一步聚焦的元素」繼續往後走,再也回不到它身上 —— 表現成「Tab 40 次沒走到」。
   要重設只能重新載入頁面。

另外兩個較小的:`file://` 開 storybook 會被 CORS 擋掉模組載入(story 整個不渲染、**不報錯**、
root 子節點 0),必須起本機靜態站;CSSOM 對含 `var()` 的簡寫回空字串,
用 `r.style.outline` 掃規則會全空,要用 `r.cssText`。

## AD8 E1 / E2:複現不出的,改成「再發生會被抓到」

複現不出就不能宣稱修好 —— 但可以留下機制。兩支閘都自帶對照組(證明它該紅時會紅)。

**E1 虛擬捲動崩潰**。第三種假設也試過了:捲到 50/80/20/95/35% 各點一次欄頭改變資料集,
再在捲動中把視窗高度 400→900→300→1000 來回改。結果 **0 個 JS 例外、列永遠有渲染、
捲動位置一致**(10000 列的表捲到 380000px 仍正常出列)。
過程中一度收到 84 個「錯誤」,全是 `ERR_NAME_NOT_RESOLVED` —— 沙箱擋外部頭像圖,
不濾掉會把真錯淹掉。升級成 `scripts/virtual-scroll-stress.mjs`:判準兩條 ——
沒有 JS 例外、**畫面不能空掉**(user 說的「出錯」也可能是空白而不是例外,所以量可見列數)。

**E2「+N」溢出**。與其猜 user 截圖的觸發時機,不如把寬度窮舉:
`scripts/overflow-indicator-containment.mjs` 掃 107 個 story × 6 個寬度 = 642 次量測,
**當場抓到一處真的**:`datatable-展示--filter-panel-states @420px`,
「+3」超出裁切祖先 28.4px —— 使用者完全看不到那個數字。

根因不是溢出,是**消失**:標籤列是 `flex-1 min-w-0`,容器夠窄時被壓到 `clientWidth = 0`,
而「+N」在裁切容器**內**,於是連它一起被裁掉。實測寬度隨容器 180 → 148 → 68 → **0**。
修法:給容器一個等於「+N」寬度的下限(`combobox.tsx` 量測 hook 內,
用 `totalCount > 0` 當條件而不是 `!ofEl.hidden`,避免「設下限→空間變夠→tag 塞得下→+N 收起→
下限撤掉→空間又不夠」的震盪)。這跟既有設計一致 —— 欄位 160 / 運算子 120 本來就有硬下限,
只是值欄原本可以縮到 0;現在它保留 33px 給那個計數。

驗證:642 次量測全部在容器內;對照組(把「+N」硬推 400px)閘紅 33 筆;
`data-table-invariants` 332 條全過;焦點五支閘全綠;`build:lib` exit 0。

**兩支都接進 CI** —— 不接的話就是又一次「宣稱有閘、其實沒人跑」(AD5)。

## AD9 「宣告有承擔者」與「承擔者真的有在畫」是兩件事 —— 補上現場證明

原始碼裡每一處抑制都寫了「承擔者:<誰>」,閘也驗了類別對不對。但**宣告是人寫的**。
瀏覽器量到的「無框」有 15 處,我一開始是用眼睛一個一個對回宣告 —— 那不是機械證明。

補進 `focus-geometry-browser-audit.mjs`:每一個無框元素,聚焦前後對**鄰域**
(往上 5 層 + 往下 30 個後代)逐屬性取樣,可見差異集合必須非空。結果 15 處全部有承擔者:

| 元件 | 現場量到誰在畫 |
|---|---|
| Input / Field / FieldControlGroup / NumberInput / Slider×2 / AppShell input | 祖先 `div.group/field`(borderColor)|
| Combobox / DatePicker / TimePicker | 自己就是那圈欄位外框(borderColor)|
| Textarea | 自己(borderColor)|
| AgentPanel textarea | 祖先輸入盒(borderColor)|
| InlineEdit 隱形鈕 | 祖先 `div.relative.flex`(borderColor)|
| AppShell 選單鈕 | 自己(backgroundColor)—— D 類的底色游標 |
| TreeView | 虛擬游標,另由 H1f 直接驗 |

**寫這一段時連踩三個坑,每個都會讓報告說謊,全部寫進註解:**

1. **同步取樣量到過渡中間值**(第一版):blur 之後立刻取樣,量到的是過渡途中的值。
   NumberInput 的欄位外框明明會轉主色 `oklch(0.54 0.22 258)`,卻被判成「零差異」。
   `oklch(0 0 0/0.15)` vs `oklab(0 0 0/0.15)` 是**同一個顏色的不同序列化** —— 差一個字母,
   結論差一整條。改成非同步、每次取樣前等 700ms。**這是本輪第二次踩同一個坑**(見 AD6),
   所以把「等穩態」寫死進流程,不再靠記得。
2. **看不見的差異也被算成證據**:`outline-style` 是 `none` 時,`outline-color`/`width`
   怎麼變都畫不出來。不濾掉的話,一個根本沒有指示的元素也會「有差異」。
3. **用順序配對承擔者**:Tab 走訪會重複經過同一個元素(列有去重,偵測沒有),
   於是甲的承擔者被安到乙頭上 —— 報告裡 AppShell 的 input 一度掛著選單鈕的承擔者。
   改用編號配對後又踩到:重複經過時元素**被重新編號**,列裡存的舊號碼對不到任何元素,
   整批 continue 掉 → 報告變成一片「零差異」。最後改成「只在還沒編號時才編」。

對照組:`--selftest` 把所有焦點視覺釘死(transition/border/outline 全部 !important 固定),
承擔者證明必須整批變紅 —— 不然這一段的綠燈不算證據。

## AD10 提交訊息與內容對不上的更正(留檔,不改寫歷史)

`3d7a9c4d` 的標題只寫了「補上承擔者現場證明」,但它實際夾帶了**本輪六項改動全部**:
H2c 底線、A4 結案、7 組閘接 CI、M32 折入、「+N」被裁修復、E1/E2 兩支新閘、承擔者證明。

成因是我自己的操作:前一次背景提交比我查 HEAD 的時間晚落地,我以為它失敗了,
於是把後續改動繼續累積,結果全部被那一次的 `git add -A` 一起收走。
`--amend` 改標題被權限擋下(改寫歷史本來就該擋),所以不繞過,把事實記在這裡。
該提交的完整內容以本文件 AD1–AD9 為準。

**教訓**:背景提交要等到 HEAD 真的變了才算數,`git log` 查一次不夠 —— 這條已經讓我
連續三次提交出問題(兩次因為我在 hook 跑的時候還在改檔案,一次是標題錯配)。

## AD11 自家的殘留鎖把自己鎖死 —— 三態修掉(M36(b))

連續兩次提交被同一個錯誤擋住:
`✗ governance build graph: authority generation transaction is still active on pid 68298 / 69257`。

現場:`/private/tmp/claude-501/.governance-build-graph-<uuid>/` 留著一個 owner marker,
而建立它的那次執行早就結束了。回收器(`canonical-sync-transaction.mjs`)卻不肯收。

根因是**兩態判斷**:

```js
try { process.kill(pid, 0); return true }        // 送得動 → 活著
catch (e) { return e.code === 'ESRCH' ? false : true }   // 不是 ESRCH 就當活著
```

`kill(69257, 0)` 實測回 **EPERM** —— 那個 pid 上確實有程序,但我們送不了訊號
(pid 被回收給別的使用者,或沙箱擋跨界訊號)。EPERM 被當成「還活著」,
於是**這把鎖永遠清不掉**,每一次提交都會被它擋住。

修法(三態):

| liveness | 判定 |
|---|---|
| `alive`(送得動) | 還在跑,不准收 —— 就算馬克很舊也不收 |
| `gone`(ESRCH) | 立刻可收 |
| `unprovable`(EPERM) | **改用馬克有多舊判斷**:超過 30 分鐘才收 |

EPERM 其實已經足以推論「不是我們的擁有者」(我們自己 spawn 的程序跟我們同 uid,一定送得動),
但為了對付「沙箱擋掉所有訊號」的極端情況,仍然保留時間視窗:
一次生成實測 2–8 分鐘,30 分鐘的視窗不可能誤收正在跑的交易。

判斷抽成純函式 `authorityGenerationOwnerVerdict` 才測得動 ——
要在測試裡造一個「存在但送不了訊號」的 pid 沒有可攜做法。
`scripts/test-authority-generation-reaper.mjs` 7/7 通過,含對照組
(把視窗設 0,原本該「等」的必須變成可收 → 證明視窗真的在起作用,
不是靠 liveness 一個變數就決定了結果)。既有兩支交易測試也重跑確認沒改壞。

當下那把 8 分鐘大的鎖用新規則還收不掉(未達視窗),手動清掉 ——
它只是 `$TMPDIR` 裡的暫存目錄,不含任何 repo 狀態,而建立它的執行已確認結束。

## AD12 接進 CI 的第一跑就紅三個 —— 逐一查證,兩個是既有 bug、一個不是我的

`release:auto` 建了 PR #124,`Verify(tsc + tests + compile + build)` 紅。三個失敗逐一查:

**(1) 必要檢查紅:`ENOENT: undefined/clipdetect.json`**
`focus-geometry-browser-audit.mjs` 用 `process.env.TMPDIR` 串路徑,而 **Linux runner 沒有這個環境變數**
(只有 macOS 一定有)→ 寫到字面上的 `undefined/clipdetect.json` 整支掛掉。
這是那支腳本的既有可攜性 bug,接進 CI 的第一次執行才暴露 —— 也正是 AD5「沒人跑的閘」的代價:
沒人跑,就沒人知道它在別的作業系統跑不起來。改用 `os.tmpdir()`。
順帶修 CI 步驟順序:靜態四組原本排在瀏覽器步驟**之後**,瀏覽器步驟一掛就整個沒跑到 ——
快速失敗的步驟要排前面。

**(2) Governance hooks(Linux portability)紅:Test 3 / Test 14**
本機重跑同樣 45 PASS / 2 FAIL,**不是我造成的**。根因是變數順序:
`THIS_TURN_TOOLS`(第 127 行)在 `LAST_USER_LINE`(第 140 行)算出來**之前**就取值,
於是它讀到初始值 0 → 切片恆為空字串 → 驗證偵測看不到本 turn 跑過的 tsc → Test 3 一直被擋。
成因是 2026-09-06 那次修正把 `THIS_TURN_TOOLS` 搬到所有 mechanism 之前(因為 Mechanism 6 也要讀),
但沒把行號計算一起搬。修法是兩個一起提前,Mechanism 1 內不再重算(重算會讓提前計算變裝飾)。
修完 **47 PASS / 0 FAIL** —— Test 14 是同一個根因。

本機要跑這支測試得先放 `mktemp` shim(macOS 的 `mktemp -d` 不吃 TMPDIR,沙箱裡 EPERM)——
這條在 `feedback_anti_self_lock_release_transport` 對照表裡已有解,照用沒有重新發明。

**(3) Verify authority candidate 紅:`fast-uri` 未修補 —— 查證後不是我的問題**
逐層查:GitHub 公告 API 對 fast-uri 共 9 筆,**全部在 3.1.6 以前修好**;
npm 自己的公告端點對 `fast-uri@3.1.7` 回報 **0 筆**。而我的 lock 就是 3.1.7。
再比對 main 的 lock:**3.1.5** —— 那個版本確實命中四筆 high。
所以紅的是那份 job 在稽核的 **main 這棵樹**,不是我的分支;我的分支反而帶著修補。
這跟 `feedback_anti_self_lock_release_transport` 記過的一條完全吻合:
「protected-base(main)自身被新資安公告擊穿 → 合掉含 lock 升級的 PR 即治 main」。
ruleset 實查:required 只有 `Verify(tsc + tests + compile + build)` 一項,這兩支都不擋合併。

## AD7 剩下兩項

| # | 卡在哪 |
|---|---|
| **E1** 虛擬捲動崩潰 | 三種假設全複現不出;已轉成常設壓力閘(AD8),再發生會被抓到。要再往下追需要 user 截圖從該狀態反推 |
| **G1** Dialog 背景隔離會把 agent 一起關掉 | **它其實不是工程題,是產品題**(見下)|

### G1 收斂:剩下的是一個產品決定,不是一段沒寫的程式

POC 已經做完,結論是「今天問不到這一題」—— Modal Dialog 開著時舞台浮層根本打不開
(body `pointer-events:none` + 焦點被拉回)。要問得到,得先把隔離範圍縮到舞台
(`suppressOthers(targets, stageEl)`)。

但**縮隔離範圍本身就是答案的一部分**:Modal 的定義就是「其他東西全部失效」,
Radix 的 `hideOthers()` 把背景兄弟節點標 `aria-hidden` 是**正確的 modal 語意**,不是 bug。
所以真正待決的是一句產品問題:

> **Modal 對話框開著的時候,agent 面板該不該仍然可用?**

- 說「該」→ agent 面板要被排除在 `hideOthers` 之外,等於宣告它不是「背景」而是**與 modal 同層的常駐介面**。
  代價:輔助技術眼中同時存在兩個可互動區域,modal 的「隔離」承諾被打破。
- 說「不該」→ 現況就是對的,G1 直接結案,只需在 spec 寫明「modal 期間 agent 面板一併失效」。

兩邊都成立,取捨在產品語意而不在技術 —— 依 `AGENTS.md # 自主執行 canonical`,
這類「使用者可感知的行為語意」由 user 拍板,我不自決。

順帶:**G4(該情境的 axe `aria-hidden-focus`)現在量不到** ——
1017 個 story 掃下來 `aria-hidden-focus` **0 筆**,因為沒有任何 story 讓 Modal 與 agent 面板並存;
而要造出那個 story,前提正是上面那個決定。

agent 鍵盤往返:user 已裁示 backlog。
