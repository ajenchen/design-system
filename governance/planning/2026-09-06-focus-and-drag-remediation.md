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

