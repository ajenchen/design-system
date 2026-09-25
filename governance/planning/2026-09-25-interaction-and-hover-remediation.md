<!-- Authority/status: governance/planning/registry.json -->
# 互動模型與滑過色 — 待辦總帳(2026-09-25 開,live)

user 2026-09-25 原話:「此外，你他媽之前沒處理完的問題到底有沒有持續追蹤，請確保所有問題都有給我持續追蹤直到完美收尾」。
前一個 session(5dfb4960)的未決題就是因為只放在對話裡而掉了。**本檔是唯一的 live 清單**:完成一項就在這裡標記並附 commit;
不要只在對話裡宣稱。研究原文在 session scratchpad(會消失),所以每一項的**結論**直接寫在這裡。

狀態記號:`待決` = 產品／UI／UX SSOT 的 P2H 真取捨,等 user 拍板;工程項目一律 Standing Authorization AUTO,不等任何人 · `研究中` · `待做` 不需拍板的工程 · `進行中` · `完成`(附 commit)· `暫緩`(附 user 原話)

---

## A. 等 user 拍板(每一題都是產品／UI／UX SSOT 的 P2H 真取捨)

| id | 題目 | 目前狀態與已查到的結論 |
|---|---|---|
| A1 | **一串東西的鍵盤路線(D1)+ 列上小按鈕怎麼到(D2)** | **已決 → 見 B9–B11**。 **附條件同意、查證中**(2026-09-25)。user 問的其實是「怎麼離開側欄」(原話:「我要問的是如何離開側欄，因為你說tab是進去節點內的action」);AI 答:Tab 經過目前這一項的按鈕(最多 2 顆)後再按一次就離開,最多 3 下;現況每一項每顆按鈕各一下。user 三題的回答全是條件句 —— 走法:「你確定世界級的設計真的是這樣的話就照你建議做」;選單 Tab:「你確定這個符合我們一致的設計語言且不違背世界級的設計就這樣做」;子選單 Esc:「你確定這符合我們一致的設計語言且不違背世界級的設計就這樣做」。**條件滿足前不動工**。AI 題目中「W3C、Adobe、微軟、VS Code 都是這樣」說太滿(W3C 只在樹狀表格寫、微軟自稱實驗性、VS Code 只有擴充樹),正在逐條查證並檢查全 DS 浮層的 Tab/Esc 是否一致,結果要如實回報。以下為先前研究:AI 推薦「路線甲」:方向鍵在項目之間走;Tab 從目前這一項走進它自己的按鈕,走完離開整串;Shift+F10/選單鍵開這一項的全部動作。一手最強的組合是「樹改成 treegrid + Tab 走進目前這一列」(APG treegrid、React Aria、Adobe 表格規格),所以 D1 與「樹要不要改 treegrid」必須一起決定。user 追問原話:「那要如何離開選單？世界級的設計按照這種做法的話一整套是怎樣？你有研究確認過？你花了那麼久的時間應該有確認過吧？」—— 研究已完成、**尚未回覆 user**。結論:Esc 關選單並回到開它的東西(從 ⋯ 開就回 ⋯;從項目開就回那一項);一般動作選完關閉、焦點回開啟者;刪除後焦點到下一項→上一項→容器;改名時焦點進輸入框,Enter/Esc 回樹上同一項;開對話框時,對話框關閉後回到選單的開啟者;點外面則焦點留在點的地方。世界級分歧兩處要 user 決定:(1) 選單裡按 Tab —— APG/Fluent/Primer「關閉並接著往下走」vs Radix(本 DS 現況)/React Aria/VS Code/WinUI「困在選單裡」;(2) 子選單裡按 Esc —— APG/React Aria/Fluent/Primer/VS Code「只關這一層」vs Radix 與 `dropdown-menu.spec.md:187`「全部關」。本 DS 現況:唯一的 Shift+F10 選單(AgentPanel 浮鈕)在點外面後會把焦點搶回來(`agent-panel-fab.tsx:702-705`),是既有偏差。 |
| A2 | **FileItem(大卡片、小膠囊、可點的上傳列)要不要有滑過底色、怎麼做** | **已決 → 見 B8(怎麼做)、B12(要不要)**。 研究中(user 提議驗證)。已決相關:#4「卡片保留、按鈕再亮一層」;#13「疊一層」若沒有設計理由就是第二套 → AI 已撤回疊層建議。實測:卡片直接換成 `neutral-hover` 在深色會**變暗**(#1D1D1D→#141414,錯);新增 `surface-hover`(深 #282828)方向正確。user 2026-09-25 提議(原話,**提議非決定**):「我覺得卡片的底色是固定不變的，它就像 select menu 那種容器底色一樣，如果要在設計上做hover，應該是疊加上去，但只有這種類型的是這樣，意思就是原本背景顏色是surface類包括surface opaque的就不會變為neutral系列，只有透明的才會，這只是我提出的提議，你幫我整個 ds 全盤檢查驗證確認是否合理以及是否有例外，全部檢查確認後再看要怎樣」→ 全 DS 驗證**已完成**(R14):提議合理、可寫成一條規則;「surface 類不換、透明才換」= DS 出貨元件現況(例外只有兩則 story 手刻膠囊、人名膠囊移除鈕);深色把 surface 換成 neutral 系列 → 滑過變暗、按住完全沒反應(17 個元素);疊上去兩主題方向都對、與透明列滑過同色(淺 #FAFAFA、深 #262626);換色派 9 家無「表面疊、其他換」先例(只有 Material 全面疊),畫面效果有前例(Ant、Adobe 表格列)。待 user 選:甲 疊上去(0 新 token、改寫 `color.spec.md:16` 並寫明刻意偏離 Atlassian)/乙 每種底色新增一對滑過色(約 4–9 顆 token、深色半透明淺色不透明)。連帶發現:按鈕白底款的灰色已按下在深色幾乎看不出(#1D1D1D vs #1E1E1E),甲之下會修好。一併決定:AgentPanel 選項卡、OverflowIndicator 標籤形(同樣站在 `secondary` 上又可點)。小膠囊若要滑過,一定要新增 `secondary-hover`(第 4 格;淺 #F0F0F0→#E8E8E8)。 |
| A3 | **上傳管理器的列:要不要上色;左右沒有內距** | **已決 → 見 B12**(只有可點的列加滑過;不可點的不加)。user 的前提「Google Drive 上傳列不上色」**未被證實**:唯一找到的圖(Drive 官方社群 2021 使用者截圖)整列淺藍 `#EEF6FE` 鋪到面板邊。世界級分兩派:列不可點 → 不上色(Fluent、shadcn、Carbon、Spectrum 2、Polaris、Material);列不可點但滑過會浮出按鈕 → 仍上淡色(Ant 文字清單、Box 新版上傳面板)。本 DS 的上傳列滑過時 ✓ 會換成下載鈕,屬後者那一類。要上色的話,依 `overlay-surface.spec.md:221-228` 改成列自帶內距、面板給 0,並推翻 2026-06-03「拿掉左右內距」。 |
| A4 | Button tertiary 滑過轉藍要不要保留 | 待決。`button.tsx` tertiary 的邊框從 `--border` 轉 `primary-hover`,沒寫理由;同類控件 Chip、SegmentedControl、Field 都走中性(`--border-hover`)。 |
| A5 | Accordion 標題滑過變淡;Sidebar「查看更多」滑過跳一階 | 待決。Accordion 是全 DS 唯一文字滑過變淡(#262626→#595959),「變淡」這個方向是 AI 建元件時自己做的;Sidebar「查看更多」`fg-muted`→`foreground` 跳一階。兩題合併決定。 |
| A6 | 句中錯誤連結「View log」的顏色 | 待決。`error-text` 借了 `error-hover`:淺色變淺、深色完全不變。(a) 改用 `text-error`(對比降到 4.7:1,滑過 3.3:1)/(b) 新增 `--error-text-hover`。 |
| A7 | 月曆事件方塊在深色的滑過值 | 待決。hue-1 滑過直接換成 hue-2:淺色對,深色變暗(#1C304A→#00004D);深色沒有現成的「亮一階」。方向本身也要定。 |
| A8 | ResizeHandle 分隔線滑過跳兩階(n4→n6) | 待決。保留(補理由)或改下一階 n5(線會變淡)。 |
| A9 | muted 與 secondary 的分界以哪個為準;仍站在 muted 上的可互動元件 | 待決。(a) 保留現有用法、改寫定義(畫面不變,AI 建議)/(b) 保留判斷問句、改用法(表頭、Alert neutral 等變深一階)。依附此題:OverflowIndicator 圓形 +N、FileViewer 縮圖、Avatar neutral(有名片時)。 |
| A10 | 指標停在月曆事件上時,整格「新增」的亮底要不要熄 | 待決。把 #4 套到月曆是跨類別外推(M8),要另外確認;AI 建議照 #4 維持現況。 |
| A11 | F 模型 D4:滑鼠滑過時鍵盤位置要不要跟著搬 | 待決(尚未提問)。選項 A/A′/B/C 見 F 模型。 |
| A12 | F 模型 D5:(a) 到底要不要繞回 (a2) 日子走出月邊緣 (b) SegmentedControl 方向鍵是否直接切換 (c) TimePicker 多欄合一站 (d) 輪播點/縮圖列/頁碼/步驟合一站 (e) Accordion 方向鍵 (f) 試算表 Tab (g) 編輯中 Enter 後停哪 (h) Tab 進來落在哪 | 待決(尚未提問)。 |
| A13 | F 模型 D7:只有滑過才出現的按鈕在觸控裝置怎麼辦;預設要不要藏;Select 觸控是否拿掉原生選單 | 待決(尚未提問)。 |
| A14 | F 模型 D8:欄位的鍵盤記號(錯誤狀態、範圍、唯讀) | 待決(尚未提問)。 |
| A15 | F 模型 D9:停用項目鍵盤停不停得到 | 待決(尚未提問)。 |
| A16 | F 模型 D10:游標用手形還是一律箭頭 | 待決(尚未提問)。 |
| A17 | F 模型 6.A:已落地但未確認的 6 項(月曆單一停靠點、事件方塊 F2、側欄 20→18〔#1 已核准〕、側欄窄視窗隱形帶移除、日期格隱形帶移除、檔案列動作鈕不再連帶開檔) | 待決(尚未提問;側欄 18 已由 #1 核准)。 |
| A18 | F 模型 6.B(二):AI 推導/跨目標延伸的改動清單 | 待決(尚未提問)。 |
| A19 | 月曆「+N more」要不要可展開 | 暫緩。user 原話(問句):「「月曆的「+N more」要不要做成可以展開。」現在是怎樣？先不管會怎樣？可以先不管嗎？」;AI 答可先不管(規格已登記後續增量 `calendar.spec.md`)。 |
| A20 | 發版 | 等 user 看過預覽站後在對話說「發版」。 |

## B. 已決、待實作或已完成

| id | 決定(user 原話) | 實作狀態 |
|---|---|---|
| B1 | #1 側欄行內按鈕 20→18:「「側欄按鈕從 20 改成 18」這按照我們的ds設計規則改的，可以通過」 | 完成(前一輪;`sidebar.spec.md` 已記原話)。 |
| B2 | #4 可點卡片裡的按鈕:選「卡片保留、按鈕再亮一層 (Recommended)」;#12 user 問「沒有合理的設計理由，就應該要整個ds一致吧？…」 | 進行中:實測 18 處中 5 處不符(側欄 inlineActions、側欄 SidebarMenuAction、Tabs inlineAction、表格欄標題 ⌄、表格列拖曳把手),全是 DOM 擺法造成、沒有設計理由;修法已在瀏覽器驗證,正在工程批次實作。 |
| B3 | #5 行內按鈕:選「維持 18,不宣告 AA」 | 待做:寫進互動模型正本(C3)。 |
| B4 | #18 月曆非當月:選「可以，拿掉底色 (Recommended)」 | 完成 `026d5788`。待補:① 規格與註解把原話寫成「可以，拿掉底色」,要補回逐字的「(Recommended)」並註明是 AI 提供的選項(M36);② 同 commit 新加的「Weekend cell 約束」標「AI 推導」;③ `calendar.spec.md` 深色描述「變淺」應為「更貼近底色」。 |
| B5 | #21 灰色已按下切換鈕:選「甲：保留，維持 2→3→4 (Recommended)」 | 待做:補 story(目前零則);`semantic.css:370` 的「user 拍板」標籤涵蓋了切換鈕那一行但 user 當天沒談切換鈕 → 改正;`color.spec.md:737` 的「Fluent 預告釋放」無一手、「與 Carbon/Atlassian 一致」只對一半 → 改寫;`button.spec.md:346`(灰底給側欄/導覽列用)與 `:737`(列元件禁用)打架 → 依 owner `item-anatomy.spec.md:171` 改;WM `TypeSettingsDialog.tsx` 的導覽列改走選中列規則(落地前再核對,M8)。 |
| B6 | #13 滑過一律「換成自己的成對 token」、不疊層(user:「沒有合理的設計理由就不能用兩套吧？」) | 進行中:通用句寫進 `color.spec.md` + 新閘「滑過色必須是元素自己平常底色的配對」;若 A2 採用 user 的 surface 疊加提議,此句要一併改寫。 |
| B7 | #3 表格列滑過一律亮(閱讀輔助) | 待做:互動模型正本明寫「資料表格列滑過 = 閱讀輔助」(C3)。 |
| B8 | #30 滑過做法:選「採用，底色不換、疊一層 (Recommended)」(題目限定「同一型態下,平常底色是「底」(surface 類)的東西」) | 待做:`color.spec.md` 寫成一條:canvas/surface/surface-raised 當平常底色 → 同一型態內滑過/按下 = 底色不換、疊 `neutral-hover`/`neutral-active`;透明 → 換成 `neutral-hover`;元件自己的填色(secondary、強調色、surface-strong)→ 換成自己的下一階(secondary 新增 `secondary-hover`);`:16` 改成只拒絕彩色疊層並寫明刻意偏離 Atlassian;工程批次已寫的「Hover 換色配對總則」草稿與新閘 `hover-own-pair-invariant` 跟著改(並修「判了 0 組仍印 ✓」)。切換成另一型態(例:白底鈕按下變已按下)不在此條。 |
| B9 | #31 鍵盤走法 乙:「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」(附條件;條件已查證成立) | 待做:↑↓ 選項目、→ 進這一項的小按鈕、← 回項目、Tab 一下離開這一串;收著的資料夾按 → 先展開。樹改用樹狀表格身分;側欄與檔案清單改成一串一站;改寫 `keyboard-model-canonical.md:183`、`:20-40` 與 `sidebar.spec.md` 行內動作段;不論選哪個都要修:樹裡別項按鈕也在 Tab 路上、側欄捲動區多一站(`viewportTabIndex={-1}`)、AI 面板對話紀錄列與多選找人頭像各佔一站。一鍵跳出整個側欄(F6)另談。 |
| B10 | #25 子選單 Esc:「你確定這符合我們一致的設計語言且不違背世界級的設計就這樣做」(條件已查證成立:9 家中 8 家只關一層、DS 其他疊層浮層實測一致) | 待做:`dropdown-menu.tsx` 子選單 Esc 只關自己那層、焦點回上一層那一項;改 `dropdown-menu.spec.md:187`;補子選單範例與「每按一次 Esc 少一層」量測;在鍵盤/焦點正本補全 DS 規則「Esc 一次只關最內層」。 |
| B11 | #25 選單 Tab + #32「看最後是怎樣定義，選單類應該要一致吧？這樣才符合世界級的設計？」 | 待做:選單開著按 Tab = 收起、從觸發鈕往下走(Shift+Tab 往上);不能打字搜尋的單選下拉同樣收起並選定反白那一項;可打字搜尋的單選下拉補「選定」;修不能打字下拉 Shift+Tab 跳到頁尾的 bug;AI 浮鈕關選單時不再硬搶焦點(`agent-panel-fab.tsx:702-705`);`popover.spec.md:59,:173`、`overlay-surface.spec.md:549`「不鎖焦點」與實測不符要改;鍵盤正本補「彈出框開著時按 Tab」一節。多選下拉(有全選)行為不變、只改宣告。user 可在預覽否決。 |
| B12 | #33 要不要滑過:「要點了會有反應的才加，並確保加上去之後不會有任何視覺奇怪的地方，且按鈕的互動樣式也是自然疊加上去吧？用再亮一層這樣的措辭是否不夠精準？」 | 待做:只有點了會有反應的才加滑過底色 —— FileItem 有 onClick 時(大卡片疊一層、小膠囊換 `secondary-hover`)、可點的上傳列(透明 → `neutral-hover`,並依 `overlay-surface.spec.md:221-228` 改成列自帶內距、面板給 0,文字位置不變、色塊到面板邊)、AI 面板選項卡(換 `secondary-hover`);不可點的不加(含只浮出下載鈕的上傳列)。撤回 `file-item.spec.md:146`「永不顯示 hover-bg」。內部按鈕滑過色自然疊在宿主之上。規則措辭改為「按鈕自己的滑過色疊在卡片的滑過色上,沿同一把灰階再往上一階」(淺色更深、深色更亮),#4 的引文照舊逐字保留。驗收:淺/深、巢狀、邊距全數視覺稽核無異常才算完成。 |

## C. 工程(不需拍板)

| id | 內容 | 狀態 |
|---|---|---|
| C1 | 滑過配對工程批次:Button 開啟×已按下/危險款(E1)、欄位錯誤×開啟保持紅框(E2)、TimePicker 選中又停用(E3)、aria-disabled 按鈕釘住(E4)、唯讀勾選/單選/開關釘住(E5)、已按下強調款顯式釘住(E6)、側欄動作鈕在當前項旁維持(E7)、26 處手刻檢閱器改 SegmentedControl(E9)、月曆事件方塊拿掉 transition(E10)、文字修正(E11)、新閘與既有閘補盲點(E12)、story 手刻列(E13)、灰色 aria-pressed 備援補按下階(K9)、表格區間格兩主題釘住(K16)、B2 的 5 處結構修正 | 進行中(背景工程批次,建置+實測+修復三段) |
| C2 | R12 W1–W8:`color.spec.md:777` 改寫「常駐色 vs 狀態色」(等 A9)、ProfileCard 引錯 Badge、Slider 停用軌道 muted→bg-disabled(同值、畫面不變)、月曆 `onDateClick`/`onEventClick` 改必填(M23(f))、過期行號與清單、月曆文字對齊、自訂事件方塊補滑過(等 A2)、來源更正(B4) | 待做 |
| C3 | **互動模型正本**:用單一 canonical 取代拼裝(keyboard-model / hit-area / focus / item-anatomy 各自一套);修斷掉的指標、MenuItem 分類錯誤、Carbon/Primer 誤引、撤回 `tree-view.spec.md:410`「對齊 GitHub/VS Code」、樹的隱藏按鈕不在 Tab 路上 | 待做(依 A1、A11–A18 結果) |
| C4 | curated 視覺基準重拍(月曆、側欄、FileItem…) | 待做(所有 UI 改動完成後一次,用 visual-regression workflow) |
| C5 | 測試腳本剩餘缺陷:最後一個 gotoStory 呼叫點(`story-demo-focus-invariant.mjs`)、慢機器上覆蓋率靜默縮水(select-all-footer、overlay-footer-gutter、dialog-height、focus-indicator)、互動後固定睡眠當「浮層已開」、docs 頁渲染判定私有兩份、story 清單讀活目錄、`visual-audit.mjs` 0 個情境仍 exit 0、孤兒 `scripts/lib/sandboxed-verify-browser.mjs`、缺建置標記寫法不一、小死碼 | 待做 |
| C6 | 前幾輪總帳餘項:`date-grid.spec.md:106` 重複;`steps.spec.md:83`;過期分隔線註解;`calendar.spec.md:299`、`data-table.spec.md:979` 舊措辭;Combobox principles story 的觸控文字;非逐字的 user 引文(`focus-canonical.md:112`、`date-picker.spec.md:225`、`hit-area-canonical.md:51-52/205`);`hit-area-canonical.md:203/206` 來源;resize-handle「指尖」理由;spec 行數預算;可見改動清單完整性;release-rings 候選落後;`PRODUCT_VISIBLE` 漏 storybook-config;WM:`AppSidebar.tsx:82` 改 icon prop、PermissionConditionsPopover/StatusesTab 殘留舊 ring | 待做 |
| C7 | `/knowledge-prune`(SessionStart 指示自動跑:hook 57 > soft 26、memory 18) | 待做 |
| C8 | 本機環境:工作樹 `.claude/settings.json`、`.claude/skills/**` 是舊檔(平台保護路徑,session 內寫不進去),以及本 session 開場讀到的 hook 設定缺一個派工入口 → 需要在 Claude Code 之外的終端機還原該路徑並重開 session | 待做(平台邊界,見 M36(b') 第 4 問) |
| C9 | CI:`72250160` 之後每個 commit 讀回 required checks | 進行中 |
| C10 | `/claude-api prompt-audit`:治理提示全盤稽核,交付報告 + 建議 diff(不自動套用) | 交付完成(2026-09-25):276 條(high 62、medium 175、low/flag 39);diff 237 區塊、97 檔、+973/−1139,每 session 載入文字 83.5 KB → 66.6 KB;對現行工作樹 `git apply --check` exit 0。diff 依 prompt-audit 交付約定只提出、不自動套用(可整份或挑段套用)。附帶兩個 flag:M36(b')(4)/Mechanism 10 與沙箱指引衝突(被擋時該不該把指令交給 user);範圍外的 `infra/governance/providers/model-invocation-profiles.json`(Claude max_tokens 8192、不能送 thinking)。另:AGENTS 串接鏈 32,811 bytes > 32 KiB(`check-agents-bootstrap` A1,HEAD 就已超過,Codex 會截斷),diff 會修回 |
| C12 | C1 批次的後續:① `data-table-hover-latency` 的取樣點落在拖曳把手底下(把手蓋住該像素,前後建置都一樣),要改取樣點或先確認該像素屬於列,並改正檔頭「k=9 原因不明」;② 新閘 `hover-own-pair-invariant` 在 `--file` 單檔模式判到 0 組仍印 ✓(M37),並要認得 B8 的「底」疊層寫法(疊在底上合法、底換成 `--neutral-*` 仍紅);③ `motion.spec.md:137` 仍寫六個測試案例;④ `hit-area-canonical.md:19`「懸停回饋形狀 ≡ 命中區」與 #4 巢狀疊加要對齊;⑤ 巢狀滑過規則散在 3 份 spec,收成一個住所;⑥ `carousel.anatomy.stories.tsx:130-143` 仍有手刻膠囊;⑦ 表格區間格在列滑過時兩主題不一致(K16);⑧ Button 各狀態疊加還沒有 story(M15) | 待做 |
| C13 | Button primary / link 沒有「開啟中」樣式(其他 variant 開啟 = 維持滑過樣子);要不要比照是新主張(M8),列入 A 區下一批提問 | 待決(併 A 區) |
| C11 | 舊 live 清單收尾:D4 那些「已完成但文件沒更新」的句子回到各 owner 改正;FD、CB 的未結項已搬進 D 區後,registry 改為 reference | 待做 |

## D. 舊 live 清單的未結項(2026-09-25 逐項對 git 查證後併入)

來源:FD = `2026-09-06-focus-and-drag-remediation.md`(09-16 之後約 60 個 commit 沒寫回)、CB = `2026-08-02-cloud-compat-and-deep-audit-baton.md`、INV = `2026-07-31-outstanding-work-inventory.md` §3、V14 = `2026-09-06-agent-principles-v14.md`。這幾份的未結項全部搬到這裡後,FD 與 CB 改為 reference(C11)。

### D1. 等 user 拍板(每一題都是產品／UI／UX SSOT 的 P2H 真取捨)

| id | 題目 | 狀態 |
|---|---|---|
| OD1 | 列拖曳的「上移/下移」替代路徑(WCAG 2.5.7):DS 在開了列拖曳時自動加,還是 consumer 自己加(`data-table.spec.md:969-975`) | user 已排 backlog;選單項形式已定 |
| OD2 | AI 面板與舞台浮層之間的鍵盤往返、區段切換鍵 | user 原話:「若鍵盤的設計和成本負擔很大也可以拆為 backlog,agent 鍵盤的互動很次要,我已經講過了」→ backlog |
| OD3 | 蓋板態下,瀏覽器上一頁/下一頁不收起 AI 面板(V14:63/100 標「AI 推導、未拍板,示範照此」) | 待決 |
| OD4 | V14:98 條 E 補「以及條 B 窄螢幕的收成」(依 user 原話採納、未逐字確認) | 一句確認即可 |
| OD5 | Dialog「整合」分頁仍手刻 div + Switch(`dialog.stories.tsx:507-518`);改用 Field 橫向排法會讓 Switch 從貼右邊變成跟在 label 後 | 待決 |
| OD6 | 遠端搜尋提示「輸入關鍵字搜尋」與「建議」標題是 AI 文案(已隨 beta.132 發版,發版同意 ≠ 逐條同意) | 一句確認即可 |
| OD7 | 觸控裝置上 Select 單選仍走原生 `<select>`(`select.tsx:957-960`);user 09-18 對 Combobox 說「就只是讓手機跟桌機同步而已」,是否也適用 Select(= A13 的一部分) | 待決,併 A13 |

### D2. 工程(不需拍板)

| id | 內容 | 證據 |
|---|---|---|
| OE1 | AI 面板調寬把手外側 3px 被裁,只剩內側 4px 點得到 | `agent-panel.tsx:404,436-447` |
| OE2 | 條 F「重新進入宿主」與 BFCache 返回沒處理;V14 差距 2 標「已解」要縮成實際範圍 | AgentPanel 搜 `pageshow` = 0 筆 |
| OE3 | DataTable 填滿高度:量錯父層、只觀察父層 | `data-table.tsx:2424-2470` |
| OE4 | 焦點幾何、「+N」全寬掃描沒有「只掃這次改到的」模式,PR 不跑 | `focus-deep-gates.yml` |
| OE5 | ci.yml 的 reviewed workflow identity 過期(main 也是) | `infra/governance/desired/github.json:90` |
| OE6 | governance-anchor 用 main 的依賴樹跑 npm audit,新弱點通報會卡住所有 PR | `.github/workflows/governance-anchor.yml` |
| OE7 | CI 沒有釘選區捲動模式的閘;2× 節流幀距 1.27 倍未定案 | ci.yml 搜 `mode=pinned` = 0 |
| OE8 | 視覺稽核不是 PR 閘:126 場景只有 7 個有斷言、0 個深色;引擎兩個缺陷(padding4Sided、grid gap 讀值) | `visual-audit.mjs:345` |
| OE9 | `data-table.spec.md` 1,002 行,超過 800 行上限 | `check_file_size_budget.sh:47-48` |
| OE10 | 拖曳播報寫死 assertive,會打斷螢幕閱讀器(當時登記不修) | `lib/drag-announcements.ts` |
| OE11 | URL 註冊表示範缺「未存檔 → 取消/確認前往」流程 | V14:56 |
| OE12 | SidebarGroupAction 零使用者、零 story | `sidebar.tsx` |
| OE13 | 並存 modal 開著時舞台能不能捲動沒定義(查證後若是真取捨才問) | 搜 RemoveScroll = 0 |
| OE14 | 8 個研究探針檔還在磁碟上,只剩刪檔 | `git status --ignored` |
| OE15 | npm 內建 ip-address/undici 只是認列、沒真修 | `governance-dependency-bootstrap.mjs:417-450` |
| OE16 | 已退役 Ed25519 的欄位與黑名單殘留 | `privileged-trust-roots.json` |
| OE17 | verify-upgrade-provenance 一條永不觸發的分支 | `verify-upgrade-provenance.mjs:26,191` |
| OE18 | 41 個沒人引用的 npm scripts 盤點 | CB §8.6 |
| OE19 | governance:generate 對 stage 1/4 的增量判斷誤跳 | CB §8.75 |
| OE20 | 改檔名可繞過 filename 閘(已接受現況,保留紀錄) | CB:20 |
| OE21 | color-contrast 基線仍非 WCAG AA(740 筆,含深色「新增」鈕 3.69:1);逐一修到元件,動 token 才問 | `a11y-baseline.json` |
| OE22 | 元件幾乎不用 i18n,硬寫中文 | 搜 `useI18n` = 0 |
| OE23 | 程式碼豁免標記(allow / as any / eslint-disable)沒有到期複查 | INV §3 |
| OE24 | hook 數量已到上限 60;knowledge-prune 遙測是否接好未確認(併 C7) | `session_start_governance_check.sh:200` |
| OE25 | 521 條宣稱中約 170 條驗證沒跑 | `.claude/logs/aspirational-wiring-findings.json` |

### D3. 卡在外部條件

| id | 內容 | 需要什麼 |
|---|---|---|
| OB1 | 虛擬捲動崩潰(user 回報),重現不出,已改常駐壓力閘(`ci.yml:754`) | 再遇到時截圖 |
| OB2 | Windows Chrome 表格捲軸兩軸各半看不到,根因未證 | Windows 實機量兩組數字 |
| OB3 | 第 83 維度深度稽核 | 只有要跑可升級的稽核時才需要 Netlify 憑證的 reference 名稱(不是密碼) |

### D4. 其實已完成、只是文件沒更新(C11 會回到各 owner 修文字)

FD A–L 大部分已在後段關掉但沒劃線;A8 已在 `item-anatomy.spec.md:177` 退役;AD13 四支紅燈測試已修並接 CI(`ci-gate-coverage.mjs:34-38`);AD16 logo 跳幀已修;AD52 核准判斷已認得「照你建議」;AD55 codex 守衛;AD77 story 名稱檢查已進 CI;AD108 核准閘涵蓋 Bash(`618e3a37`);fast-uri main 已 3.1.7;E2 由 AD8 修掉並加常設閘;`data-table.spec.md:974`(c)「列拖曳無客製播報」過期(`data-table.tsx:5256` 已接中文播報);SidebarMenuButton 已有焦點框;CB 主體全部完成。

### D5. 已被後來的決定取代

G 區(09-07 裁示與 960 斷點)、150ms 過渡(user「第三題改成全部瞬間」)、骨架列(依 user 09-09、09-12 的話推導為不動 —— 屬 AI 推導,要嚴格可請 user 一句確認)、Codex R23 下一輪、NativeCombobox(`68d9dfdc` 已移除)、搜尋列外框(user「跟世界級的設計一樣就維持現狀」)、G6/L6 並存細節(AD17–19 取代)。

## E. 完成紀錄

| 日期 | 項目 | commit |
|---|---|---|
| 2026-09-25 | 測試腳本:最後一批「沒量到被讀成通過」、私有渲染判定收斂、consumer 發送清單改由 import 閉包推導 | `b57fee87` |
| 2026-09-25 | 月曆非當月格拿掉 muted 底色、日期數字改淡字(B4) | `026d5788` |
| 2026-09-25 | CI static 紅:同名常數不同值 | `72250160` |
