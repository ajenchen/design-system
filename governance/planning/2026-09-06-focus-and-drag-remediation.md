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
| A5 | 「選中列 × 鍵盤游標」該用深一階底色還是 ring | DS 現況兩種並存:深一階底色 4 處(DropdownMenu / SelectMenu / AgentPanel / Sidebar)vs ring 1 處(TreeView)。屬產品/UI/UX SSOT 真取捨,**待 A7 研究回來後拍板**。注意:乙案(維持深一階底色)本身就是這題要決定的事,不能拿來當現成選項 |
| A6 | **`item-anatomy.spec.md` 缺一格:「未選中列 × 鍵盤焦點」** | 2026-09-06 查出。`:171-175` 那張 2026-08-11 user 拍板的表三列**全部**以「選中列 ×」開頭,從未涵蓋未選中的列。7 個消費者各自填空,能查到的三處全填 `bg-neutral-hover`(= 跟滑鼠 hover 同色):`dropdown-menu.tsx:25/36`(Radix,滑鼠會搬走反白 → 只會有一個高亮,**正確**)、`sidebar.tsx:939`(常駐,兩個可同時亮 → **壞**)、`menu-item.tsx:49`(被 SelectMenu 全選列以 `tabIndex={0}` 啟用,在 cmdk 清單外 → **壞**)。**這一格才是側邊欄與全選列兩個 bug 的共同根因**;修法是在 family owner 補格(擴充 SSOT),不是在消費者端各自處理,也不是開例外 |
| A10 | 全 DS 焦點徹查五題 —— **已回,五題全部未通過對抗驗證**(workflow `w63027x3j`)| 驗證抓到的比研究本身重要:(1) 「outline 遷移」建議會靜默弄壞 20 處(見 C13);(2) 盤點漏一半(41 行 vs 23);(3) 「全DS對照」那份**重新提出了 2026-09-06 已撤回的版本**(要求選單畫 ring),驗證者引 `focus-canonical.md` 的勘誤段駁回 —— **SSOT 有發揮作用**;(4) 它還想把 A5 那格標成可 AUTO,被駁。(5) 各家矩陣的「(c) 常駐清單 7 家 0 例外」被駁:Ant 的常駐側欄是 `Menu mode="inline"`(rc-menu),`useActive` 無條件 `onMouseEnter → onActive`,**Ant 是「一律搬」的真實反例**(待自行複驗)|
| A7 | 三題研究 —— **已回,三題全部未通過對抗驗證**(workflow `wkwrala0w`)| 站得住的部分已抽出到 C13/C14 與下方。**最重要的一條是程序性的**:研究稿對第一題的結論是「不該統一,兩條路都對」,而 user 2026-09-06 已逐字說過「當然是按照 tree view 啊,我們不就是要確保整個ds 有SSOT有一致的設計語言嗎?」——**驗證者抓到那是 AI 拿 benchmark 覆蓋 user 已表達的方向**。不採納。A5 仍待 user 拍板,但拍板的起點是 user 已說的話,不是研究稿的反向結論 |
| A9 | **焦點框機制要收斂到哪一套** | 現況兩套並存、五種幾何(見 C16)。(甲) 全域 `outline`:天生透明間隙(無 C13 白邊問題)、跟隨圓角、forced-colors 下仍繪製;(乙) Tailwind `ring`:DS 現有 40 處在用,但間隙寫死白且 `inherits:false` 無法用 token 修。**遷移任一方向都必須同時處理同行的 `outline-none`(20 處),否則靜默消失**。屬產品/UI/UX SSOT 取捨,**待 user 拍板** |
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

