#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Calendar 月檢視畫出來的骨架與間距照 calendar.spec.md(量像素與讀屏樹,不看 class —— M32):
 *         T 外殼與工具列(calendar.spec.md「外殼」「工具列」,2026-11-27 起框只圍格子區):T1 工具列 = 一列 sm 控件(高 = --field-height-sm);
 *           T5 框只圍格子區(格陣四邊各 1、圓角、標 bounded;根節點沒有框與標記;工具列不在格子區裡、在它上方);T6 工具列 → 框 = tight;
 *           T7 第一顆鈕左緣 = 框左緣、「新事件」右緣 = 框右緣(同表格工具列);一般 / 大密度各量。NB-*(元件檢閱器 bordered=false):格子區沒有框、
 *           不標 bounded,T1 / T6 / T7 同上;FL-*(展示「填滿主畫面」flush + 不加框):F1 格子區左右下 = 容器的邊、F2 工具列兩端離容器邊 = loose,T1 / T6 同上。
 *           ‹ / 今天 / › 包在 <nav>,名稱「行事曆月份導覽」;標題預設 h2、titleAs="h3" 時是 h3。
 *         H 星期列是 role=grid 裡的第一個 row、7 個 columnheader;讀屏名稱 = Intl 完整星期名(zh-TW「星期日」),看得見的字 = short(「週日」);
 *           星期列每格高 32(= 4 + 24 + 4)。
 *         W 各週等高(±0.5);最後一週的格子底線 0、其他週 1。
 *         D 日期框離格左 4、離格頂 4、高 24;每月 1 號顯示「7月1日」「8月1日」,其他日子只寫數字。
 *         E 事件列高 24、列距 4、文字左緣離列左緣 8、日期框到第一列 4;事件列四周最小淨空 ≥ 4(焦點框往外的前提,focus-canonical「問題二」);
 *           F2 進格後事件列的焦點框真的畫在外面(outline-offset ≥ 0)。
 *         A axe aria-required-children / aria-required-parent 0(格陣裡夾著 ScrollArea 的三層 div)。
 *         S 容器太矮(設計原則「事件顏色類別語意」h-84)時:每週 = 格最小高 61(4 + 24 + 4 + 24 + 4 + 格線 1)、滾輪捲得動週列、工具列與星期列不動;
 *           鍵盤走到看不見的那一週,焦點所在的日期框被捲進可視範圍;
 *           S4 最小高的週裡(同一則):有事件的格子(最後一週以外)事件列 = 24、日期框到第一列 = 4、第一列到格線 = 下內距 4
 *           (calendar.spec.md「間距」事件列 / 格子下內距、「每一週等高」格最小高 —— 三條同時成立);
 *           S5 容器再矮(展示「產品上線週」根節點壓到 240,每週都在最小高、k = 1、至少一格出現「+N」):每一格的每一列(事件列與「+N」列)都是 24、
 *           都在格子內容框裡 —— 放不下的由「+N」取代,不壓扁也不被裁(先量「每週 = 61、確實有格子出現「+N」」,證明量的是那個情況)。
 *         K 點日期鈕(程式化 click,Chromium 不給焦點 = Safari 的情況)後焦點與停靠點都到那一天;按「今天」後停靠點到今天、焦點留在「今天」鈕
 *           (兩條都先量「動作前停靠點不在那裡」,證明量的是動作的結果)。
 *         L en-GB 不傳 weekStartsOn → 第一欄是週一(Monday)。
 *         R 今天剛好是 1 號時,實心底包住整段「7月1日」、左右內距 8。
 *         B 事件版面(calendar.spec.md「跨日長條」【C1、Q3(定)】、「每格筆數與「+N」」【C3】、Cell 規則「命中區」【Q6(定)、總帳更正 #3】;2026-11-25 事件版面那一包):
 *           B1 團隊行事曆「Alex 休假」7/20–7/22 是一個元素,從 7/20 內容左緣畫到 7/22 內容右緣(±0.5)。
 *           B2 斷開那一端 computed border-radius = 0、真起訖那一端 > 0:B2-week 季度規劃(「設計衝刺」換週切兩段、「Q3 規劃週」延續到下個月那一端);
 *              B2-hidden 元件檢閱器週三起 + 隱藏週末(「機房搬遷」週五、週一在同一列相鄰兩欄,中間被藏的週末切開);B2-weekend 客服排班(週五收、週一起)。
 *           B3 產品上線週 7/15(7 筆)把格高掃過 k = 1…7 的每個邊界:B3-k 畫出來的筆數與 N 照規格算式由量到的格高推(元件傳進版面的 k = 量到的格高算出的值,
 *              M32 參數邊界)、每個格高連看 4 幀不變;B3-fit 每一列 24、都在格子內容框裡,出現「+N」的格下面放不下另一列;B3-exact 格高 229(剛好放滿 7 列)沒有「+N」。
 *           B4 真滑鼠點「Alex 休假」7/22 那一段:命中長條、開的是這個事件、沒有「新增事件」(阻止冒泡;長條 DOM 在 7/20 那格);點單筆唯讀的公司假日:什麼都不開。
 *           B6 從長條涵蓋的第 2 天(7/21)按 F2,焦點落在同一條長條上(格內 widget 依日子查,data-calendar-covers)。
 *           B7 深色與淺色主題,長條蓋在格線上的那一 px 與旁邊 3px 同色(差 ≤ 2;深色淡底半透明,長條要墊不透明的格子底)—— 前提:長條下方同一條格線看得到。
 *         HV / KE / E4 格子的滑過與格內鍵盤(calendar.spec.md「Cell 規則」滑過條【CELL-HOVER(定)】與命中區表、「跨日長條」滑過 / 點擊 / 焦點條、
 *           「A11y 預設」格內那段;2026-11-25 格內互動那一包、2026-11-26 格子的滑過底色拿掉;團隊行事曆):
 *           HV1 格子底色不變:指標在 7/3 格內空白處、「Alex 休假」7/20 / 7/21 / 7/22 三段正中、單筆唯讀的「公司創立紀念日」上,整個格陣每一格的底色
 *           都等於指標在格陣外時(前提:每一點的目標 :hover 成立);
 *           HV2 空白處游標是手形:7/3 格內空白處命中的元素游標 = pointer、日期鈕也是(前提:那一點不在事件 / 按鈕裡);
 *           HV3 點擊落在指標底下那天:真滑鼠點 7/22 格子的內距(長條 DOM 在 7/20)→「新增事件」的日期 = 2026/07/22(前提:那一點命中 7/22 格子本身);
 *           HV4(設計原則「事件顏色類別語意」h-84)週列的捲軸蓋在最右欄上、不是格子:指標停在捲軸滑塊上游標不是手形
 *           (前提:同一高度往左 8px 進到底下那一格時是手形);
 *           E4 F2 進到長條後的焦點框往外(outline-offset > 0);KE1 7/21 F2 進長條 → Esc 回 7/21(不是長條 DOM 所在的 7/20);
 *           KE2 7/22 F2 進格 → 再 F2 回 7/22;KE3 真滑鼠點長條 7/22 那段、關掉事件浮層 → Esc 回 7/22。
 *         AP 事件的兩種長相(calendar.spec.md「事件的兩種長相」【C2、BAR(定)、TIMECOLOR(定)】;團隊行事曆):AP1 全天長條底 = 類別 step-1、沒有左邊框、
 *           沒有色條;AP2 有時段列底透明、色條寬 4、高 = 字級、上下置中、圓頭、類別 step-6、aria-hidden;AP3 兩種長相第一個字離列左緣都是 8(D5);
 *           AP4 時間 fg-secondary、標題 foreground;AP5 zh-TW 時間字「上午10:00」;AP6 事件讀屏名稱「{標題},{開始時間 或 起訖日期}{,全天}」、沒有「事件:」、
 *           單筆唯讀不是按鈕;AP7 可點時滑過:有時段列 --neutral-hover、長條 step-2、手形。
 *         MX / NE 色彩對照表:12 色相長條 step-1 底 / step-7 字、有時段 step-6 色條;neutral 長條 --secondary 底 / --foreground 字 / 滑過 --secondary-hover(NE1)、
 *           色條 --color-neutral-9(NE2)、唯讀的 neutral(團隊行事曆的公司假日)滑過不變、不是按鈕(NE3)。期望色一律由 token 在頁面上現算,不寫死色值。
 *         RO1 readOnlyEvents(元件檢閱器)兩種長相滑過都不變、不是按鈕。TF1 eventTimeFormat 覆寫(英文讀屏字串覆寫那則,24 小時制):畫面「10:00」、名稱同格式。
 *         NT 窄寬(分割畫面側欄):NT1 欄寬 ≤ 60 有時段列沒有時間、名稱照舊;NT2 同一則加寬到欄寬 70 時間出現(對照)。
 *         CR 時間字與標題在透明列 / 滑過底上的對比 ≥ 4.5,淺色與深色各量(畫面合成後的畫素)。
 *         CT renderEventTile 回傳過大的內容裁在這一段的外層裡(格子不裁左右,由外層裁;「唯讀日期 × 自訂事件方塊」的 Tag 撐成 60 高、400 寬、不換行):
 *           CT1 外層下一列的位置點不到這個方塊、沒畫到;CT2 隔壁格點不到、沒畫到;CT3 F2 進方塊後外層自己的焦點框照樣畫在外面(外 3px 兩點聚焦前後變色)。
 *         N 讀屏名稱(calendar.spec.md「A11y 預設」;名稱用瀏覽器算好的無障礙樹 CDP Accessibility 與 Playwright getByRole({ name }),不讀屬性):
 *           N1 日期格可點時,日期鈕名稱 = Intl dateStyle full + 筆數(「2026年7月12日 星期日,2 個事件」),今天前面加「今天,」;1 號(畫面「7月1日」)
 *              與溢出日照同一格式;沒有任何日期鈕還是舊念法「2026-07-15,N 個事件」。
 *           N2 只有今天帶 aria-current="date"(日期格可點時在日期鈕上、唯讀時在格子上,兩種模式各量一次)。
 *           N3 日期格唯讀時,格子沒有 aria-label、名稱由內容來:開頭 = 日期 + 今天 + 筆數,接著每個事件標題;看得見的日期數字不重念
 *              (今天那格沒有事件 → 名稱剛好等於「今天,2026年7月15日 星期三,0 個事件」)。事件可點(內容發佈月曆)與事件也唯讀(設計原則
 *              「唯讀的日期格與事件」)各量一次;後者另量長條涵蓋的第 2 天(年中盤點 7/23–7/24 的 7/24,長條 DOM 在 7/23)也念得到標題(N3-bar)。
 *           N4 labels 覆寫生效(test-only「英文讀屏字串覆寫」):格陣名稱、今天與其他日子的名稱都是 consumer 給的英文,沒有一句預設中文。
 *         HW 隱藏週末(展示「客服排班(只看工作日)」+ Inspector en-IL;calendar.spec.md「Cell 規則」隱藏週末、「A11y 預設」鍵盤表):
 *           HW1 zh-TW 只剩 5 欄、5 個 columnheader(星期一–五)、沒有任何週六日的格;HW2 週五 → 下週一、週一 ← 上週五、Home / End = 該列第一 / 最後一個看得見的日子;
 *           HW3 換到八月(1 號是週六)Tab 停靠點剛好一個、在 8/3;HW4 週末是五六的語系(en-IL)藏的是週五、週六。
 *         WN 週數欄(展示「生產排程(週次)」+ Inspector en-GB / en-US 翻到 12 月):WN1 欄頭「週」在星期列第一格、欄頭寬 = 週數格寬(±0.5);
 *           WN2 每週第一格是 rowheader、0 個可聚焦、zh-TW 7 月 = 第 27–31 週、名稱「第 N 週」;WN3 字樣 fg-secondary、字重 400、上 4 高 24、水平置中;
 *           WN4 2026 年 12 月最後一列(含 2027-01-01)en-GB = 53、en-US = 1;
 *           WN5 週數格與日期格同一套【WEEKNUM-BOX(定)】(一般 / 大密度 × zh-TW 展示 / en-US Inspector 各一格,WN5-{md|lg}-{zh-TW|en-US}):
 *           同一週的兩位數週數框與兩位數日期框比 —— 框寬、框高、框離格左、框離格頂都相同(±0.5)、週數字在框內左右差 ≤ 0.5、
 *           欄寬 = 2 × 4 + 日期框寬 + 格線 1(±0.5)、格線實量 1;兩位數週數 / 日期離格線的值只印不判(日期是比例字寬、週數是等寬數字,差多少看字型)。
 *         LD 載入中(展示「切換月份時載入」):LD1 格陣 aria-busy=true;LD2 每格事件區剛好一條高 24、aria-hidden 的骨架、沒有事件列;
 *           LD3 日期名稱不念筆數;LD4 點格內空白仍會開「新增事件」(onDateClick)。
 *         NW 窄寬度(展示「分割畫面側欄(窄寬)」):NW1 欄寬 ≤ 60 時星期一字、1 號「1」、讀屏名稱照舊;NW2 掃 20 個欄寬(51–70),
 *           每個寬度連看 6 幀狀態不變、「窄」⇔ 欄寬 ≤ 60、只在 61 切一次;NW3 掛載當下祖先在縮放(Dialog / Popover 開場 zoom-in-95):
 *           欄寬 62 在 scale(0.95) 下重新掛載(Storybook forceRemount),拿掉縮放後必須是寬版 —— 先量前提(真的重新掛載、掛載時比例 0.95、
 *           日期格畫面寬 ≤ 60),前提不成立 = 儀器失效。斷點看的是版面上的欄寬,不是畫面上被縮放後的寬。
 *         ML「+N」與當天清單(設計規格「狀態行為:「+N」清單開著」,年度使用者大會 7/22;calendar.spec.md「每格筆數與「+N」」「「+N」清單浮層」「焦點框」;
 *           一般 / 大密度各一趟):ML-esc play 開的清單按 Esc 關、焦點回「+N」;ML-trigger「+N」是原生 button、高 24、字級同事件列、色 = --fg-secondary、
 *           aria-haspopup=dialog、手形、名稱「{完整日期},還有 N 個事件」;ML-ring 鍵盤焦點的框往外(offset > 0);ML-row-ring 鍵盤打開清單時第一列的焦點框四邊都在捲動區裡(量幾何,往外會被頂邊裁掉 → 列往內畫);ML-click 真滑鼠點「+N」開清單、沒有開「新增事件」;
 *           ML-center 清單中心 = 格子中心(±0.5);ML-width 清單寬 ≥ 格寬;ML-open 開啟後焦點在第一筆事件;ML-head 標題列沒有分隔線、標題底 → 第一列 = tight
 *          (header-first-gap NOT_COVERED 登記的那一格由這裡量);ML-order 清單順序 = 格內排序、格內畫出來的同一個相對順序;ML-ro 唯讀的那一筆是純文字;
 *           ML-rowh 清單每一列(全天長條 / 唯讀純文字 / 有時段)外框高 = 列高 token(--tag-height-md,浮層上量),清單行高放大到 3 倍(模擬字型上下緣較大的平台)時也一樣;
 *           ML-half 捲在頂端時可見底邊切在第 N + 1 列(N = 9)的一半(±1;訊息印各列高);ML-sticky 捲到底標題列不動、內文頂 = 標題列底;ML-bottom 捲到底最後一列 → 底 = tight;
 *           ML-outside 點清單外面關清單、焦點不被搶回「+N」。期望值由規格與 token 現算(tight 讀浮層上的 --layout-space-tight),不 import 元件常數。
 *         DT 事件詳情浮層(設計規格「狀態行為:事件詳情開著」「狀態行為:從清單開詳情」;calendar.spec.md「事件詳情浮層」;一般 / 大密度各一趟):
 *           DT-name 浮層名稱 = 事件標題本身(PopoverTitle 自動接 aria-labelledby);DT-head 標題列 = PopoverTitle 一行 16px 標題(--font-body-lg-size × 1.5)、
 *           上 tight 下 loose、不畫底線、版面間距大檔(兩種密度都 16 + 24 + 24)、× 原生高 = 頁面 sm 欄位高(控制項大小不跟著放大)
 *           【DT-TITLE(定)+ 2026-11-27 事件詳情客製;修前 14px 標題、上下 tight + 底線】;DT-center 標題中線 = 標題列每一顆鈕(⋯ / ×)中線;DT-width 寬 432;
 *           DT-side / DT-side-right / DT-side-flip 子選單擺法【DT-DIRECTION(定)】先開右、放不下翻左:左半邊的事件往右開、隔 8、頂端對齊;
 *           右半邊(最右一欄 7/25)但右側放得下(情境:Calendar 根元素收窄,右邊留出空位)也往右開;同一筆在原版面右側放不下 → 翻到左側、隔 8;
 *           DT-time-fit 時間欄進編輯 → DatePicker.Range showTime 兩端的字都不被裁(scrollWidth ≤ clientWidth;詳情寬 CALENDAR_EVENT_DETAIL_WIDTH_PX 唯一的目的,
 *           寬是推算的【AI 推導】,訊息印每端要的寬 / 分到的寬 = 實量);
 *           DT-vertical 欄位垂直排(標籤在上);DT-label 標籤 = fg-secondary(閱讀情境);DT-gap 標題字底 → 第一欄標籤頂 = loose、欄與欄 = tight、最後一欄 → 底 = tight;
 *           DT-mark 打開詳情的那一段帶 data-detail-open;DT-esc Esc 關詳情、焦點回那一段;DT-outside 減少動態下改地點、點外面 = 先提交再關(再打開看得到新值);
 *           DT-commit 改標題 → 月格跟著換;DT-blank 清空提交 = 還原原值;
 *           DT-list 從清單開:清單不關、詳情左緣 − 清單右緣 = 8、上緣對齊那一列;DT-esc-layers 第一下 Esc 只關詳情(焦點回那一列)、第二下關清單(焦點回「+N」)。
 *           DT-readonly(test-only「詳情只能看」)isEditable 回 false:空的地點 / 說明 / 類別不列、不畫全天【ALLDAY-VIEW(定)】(→ 只剩時間)、欄位與標題沒有可聚焦 / 可點的元素、點值不進編輯;
 *           DT-allday【ALLDAY-VIEW(定)】展示「團隊行事曆:共享進來的事件只能看」:只能看的那一筆(業務部共享的全天事件)詳情沒有「全天」欄,
 *           能編輯的那一筆(自己團隊的「設計審查」)「全天」欄是能切換的開關(role=switch、沒停用);
 *           DT-tip(test-only「詳情交回的修改」,標題被截斷)用滑鼠開、點 × 關 → 焦點由程式還給那一段,截斷提示不開(tooltip.spec.md「A11y 預設」);
 *           DT-tip-delay 接著滑過工具列「下個月」,提示仍等初始延遲(≥ MOTION_DELAY_PLAIN_MS;擋下程式焦點不得動到全站的開啟延遲,tooltip.spec.md「時間參數」);
 *           DT-commit-call 提交標題 → onEventChange 只呼叫一次、patch = { title };DT-move 產品把事件移到別天 → 詳情換新錨點跟過去(頂端對齊、隔 8、
 *           新那一段帶 data-detail-open、舊那一段卸載),Esc 後焦點在新位置的方塊;DT-fallback 移到畫面外 → 詳情留在原位、Esc 後焦點回原來那一天的停靠點;
 *           DT-esc4-L1–L4 真 Calendar 四層 Esc(時間欄的日期浮層 → 欄位編輯中 → 詳情 → 清單),每一下只關最內層、焦點回該回的地方;
 *           DT-esc4-tip 每一下之前:焦點所在元素被截斷且是可見焦點時,它的截斷提示是最內層 —— 等它打開、按一下只關它(其他層原樣、焦點不動);
 *           不截斷時不得開著任何提示(字寬依機器字型:Linux CI 起訖鈕會截斷、mac 不會,兩種都照規格判);
 *           DT-nest 點詳情裡面、點詳情裡時間欄的日期浮層,清單都不關;點兩層外面兩層都關。以上每格各一個對照組(MUTANTS,block 'detail')。
 *   紅: --selftest 逐一注入:星期列搬出格陣、週列高改 auto、最後一週留底線、格子內距 6、工具列改回內距撐高、nav 沒名稱、
 *       欄頭名稱改成短字、捲動區變成可聚焦(axe required-children)、捲動區不能捲、事件列高 20、事件列焦點框改回往內、1 號的實心底被壓成 24 寬、
 *       格最小高沒算格線(回到 60)、
 *       en-GB 卻寫死週日起(Inspector 傳 weekStartsOn 0)、標題層級不跟 titleAs、日期鈕的 focus() 失效、
 *       日期名稱改回舊念法(yyyy-MM-dd)、拿掉 aria-current、aria-current 掛在每一天、唯讀格的 aria-label 放回去、唯讀格看得見的日期數字沒有 aria-hidden、唯讀格念不到橫跨過來的長條、
 *       labels 覆寫沒生效(名稱是寫死的預設中文)、跳過被藏日子的邏輯不見(焦點落空)、1 號被藏時沒有停靠點、週末寫死週六日(en-IL 照 en-US 藏)、
 *       星期列的週數欄沒讀同一個欄寬、週數格可聚焦、週數字加粗主色、週數第一週天數寫死 1(en-GB 年底變第 1 週)、
 *       週數欄寬改回 2ch 公式(2026-11-26 前)、週數不放框(直接內距,框縮成字寬)、格陣沒帶 aria-busy、骨架拿掉 aria-hidden、
 *       載入中照念筆數、載入中格子點不到、窄寬沒接上、門檻改看內容寬(內容回授到量測 → 門檻附近每幀來回跳)、
 *       量欄寬改量畫面寬(祖先縮放時讀到縮小後的寬 → 卡在窄版)、
 *       k 不隨格高變(ResizeObserver 換成不做事的版本再重新掛載;最小高與掃格高各一次)、長條改回逐日方塊、事件列 / 長條沒阻止冒泡(點擊冒到它所在的格子)、
 *       格子是定位元素(後面的格子蓋住長條)、F2 只查格子自己的子孫、
 *       格子的滑過底色回來(整格 :hover / 只亮指標底下那一格)、格子空白處游標改回箭頭、格子空白處的點擊交給前一天、
 *       Esc / F2 出格回長條 DOM 所在那一天、滑鼠按在長條上不記哪一天、長條的焦點框改往內、手形掛在整個格陣上(捲軸也變手形)、
 *       斷開那一端也圓角、被藏的日子不切段、k 少算一列 / 多算一列(日期框到事件區差一列的空間)、
 *       長條沒墊不透明的格子底(深色透出格線)、一段事件的外層不裁內容(自訂內容畫到下一列與隔壁格)、外層的裁切連焦點框一起裁掉(clip-path)、
 *       全天長條帶回左側 3px 色條、有時段列有底、色條撐滿列高且直角、色條後面不留間隔、時間字改主色、時間格式寫死 en-US、事件名稱改回「事件:」、
 *       有時段列滑過借了別的配對、neutral 回落成 blue、12 色相色條錯位、唯讀的列滑過會亮、eventTimeFormat 沒接上、窄寬沒拿掉時間、時間字太淡、
 *       「+N」焦點歸還失效 / 改回淡灰小字 / 焦點框往內 / 點擊冒泡到格子、清單沒蓋在格子上 / 比格子窄 / 標題列畫回分隔線 / body 恢復上內距 / 順序倒過來 /
 *       唯讀的列變按鈕 / 可點列改回 inline-block(列高由字型撐)/ 沒有高度上限 / 標題列跟著捲 / 底部沒有內距 / 點外面後焦點被搶回「+N」
 *       —— 每一個都必須讓對應的那一格紅。
 *   綠: 全部量到且照規格時 exit 0。開 story 走 lib/launch-browser.mjs openStory(等 Storybook 回報渲染完成與被量的格陣出現,不睡固定時間);
 *       開不起來 / 等不到格陣 = 儀器失效(INSTRUMENT-FAIL,exit 1 並點名),不讀成通過。
 *   分片: --shard=<k>/<n>(CI matrix 平行,2026-11-26):這一格只跑分片表 CALENDAR_MONTH_SHARDS 第 k 片的單位 —— 主判定跑分到這一片的區塊、
 *       --selftest 跑分到這一片的突變(一個區塊整塊一片,或只把它的突變拆到幾片:'區塊名@i/m');判準不變(每一格的格與突變跟不分片時逐一相同)。
 *       分片表只住本檔,ci.yml 只寫格數。每一種跑法啟動先驗分片表:每個區塊的主判定、每一個突變都剛好在一片、單位都是區塊名、沒有空片、
 *       n = 表的片數 —— 不成立 exit 1(少一塊 = CI 沒有任何一格跑它而照樣綠,M37「沒失敗 ↔ 過了」);
 *       --selftest 第 0 片另跑分片表的對照組(拿掉任一塊 / 任一個拆突變的單位 / 重複 / 不存在的名字 / 寫法不對各自必被點名)。
 *       每個區塊 / 突變印實量秒數(⏱),平衡分片表用。
 */
// 用法:node scripts/calendar-month-invariant.mjs [--static=<dir>] [--selftest] [--shard=<k>/<n>] [--block=<區塊名,除錯用>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { PNG } from 'pngjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
// --block=<名字>:只跑那一個區塊(與它的突變);本機除錯用,CI 不帶
const ONLY_BLOCK = arg('block', null)
// --shard=<k>/<n>:只跑分片表第 k 片的區塊(見檔頭「分片」與下方 CALENDAR_MONTH_SHARDS);與 --block 不能同時用
const SHARD = (() => {
  const raw = arg('shard', null)
  if (raw === null) return null
  const m = /^(\d+)\/(\d+)$/u.exec(raw)
  if (!m || !(Number(m[2]) >= 1) || !(Number(m[1]) < Number(m[2]))) { console.log(`✗ --shard=${raw} 寫法不對(要 <k>/<n>,0 ≤ k < n)`); process.exit(2) }
  if (ONLY_BLOCK) { console.log('✗ --shard 與 --block 不能同時用'); process.exit(2) }
  return { k: Number(m[1]), n: Number(m[2]) }
})()
/**
 * 分片表(--shard 的唯一住處;ci.yml 的 matrix 只寫 0/n … (n−1)/n,不寫區塊名)。每一片 = 一組單位:
 *   '區塊名'       = 那個區塊的主判定 + 它全部的突變;
 *   '區塊名@i/m'   = 那個區塊的突變裡,依它在 MUTANTS 的出現順序編號 j(從 0 起)、j % m === i 的那些;區塊的主判定跟著 @0/m 那一片。
 * 單位只決定歸屬,執行順序照 BLOCKS / MUTANTS 的順序(todayFirst 會釘住時鐘,它在兩者都是最後一個,哪一片都排最後)。
 * 平衡依據 = 本機實量的區塊 / 突變秒數(每個區塊 / 突變印的 ⏱;數字記在 ci.yml verify-browser-calendar-month 檔頭)。
 * 加 / 改名區塊、加突變都要看這張表 —— 主判定或任何一個突變不在某一片(或在兩片),每一格啟動就紅(shardPlanProblems)。
 */
// 2026-11-26 本機實量(不分片:主判定 82 秒 + --selftest 852 秒;detail 一塊 = 主判定 47 秒 + 26 個突變 723 秒,佔八成 → 只有它拆突變):
// 三片各約 311–312 秒(區塊 / 突變的 ⏱ 加總;LPT 排法)。
const CALENDAR_MONTH_SHARDS = [
  ['squeeze', 'namesReadOnly', 'hideWeekends', 'bars', 'rowsFit', 'underlay', 'customTile', 'readOnlyHover', 'timeFormat', 'detail@0/3'],
  ['scroll', 'keyboardStop', 'inspector', 'namesEnglish', 'loading', 'interaction', 'matrix', 'detail@1/3', 'todayFirst'],
  ['layout', 'axe', 'namesClickable', 'weekNumbers', 'narrow', 'scrollbar', 'segments', 'looks', 'narrowTime', 'contrast', 'moreList', 'detail@2/3'],
]
/** 分片單位 → { block, i, m }('區塊名' = @0/1);寫法不對回 null */
function parseShardUnit(unit) {
  const m = /^([A-Za-z]\w*)(?:@(\d+)\/(\d+))?$/u.exec(unit)
  if (!m) return null
  const i = m[2] === undefined ? 0 : Number(m[2]), n = m[3] === undefined ? 1 : Number(m[3])
  return n >= 1 && i < n ? { block: m[1], i, m: n } : null
}
/** 分片表展開成「誰跑什麼」:每個區塊的主判定在哪幾片、每個突變(MUTANTS 索引)在哪幾片 */
function shardPlanOwners(plan, mutantBlocks) {
  const mainOf = new Map(), mutantOf = mutantBlocks.map(() => [])
  plan.forEach((units, k) => {
    for (const unit of units) {
      const u = parseShardUnit(unit)
      if (!u) continue
      if (u.i === 0) mainOf.set(u.block, [...(mainOf.get(u.block) ?? []), k])
      let j = 0
      mutantBlocks.forEach((block, idx) => { if (block === u.block) { if (j % u.m === u.i) mutantOf[idx].push(k); j++ } })
    }
  })
  return { mainOf, mutantOf }
}
/**
 * 分片表的問題清單(空 = 成立):單位寫法不對 / 不是區塊名、空片、區塊的主判定不在任何一片或在兩片、
 * 任何一個突變不在任何一片或在兩片(CI 沒有任何一格跑它 = 照樣綠,M37「沒失敗 ↔ 過了」;在兩片 = 跑兩次)。
 */
function shardPlanProblems(plan, blockNames, mutants) {
  const problems = []
  plan.forEach((units, k) => {
    if (!units.length) problems.push(`第 ${k} 片是空的`)
    for (const unit of units) {
      const u = parseShardUnit(unit)
      if (!u) problems.push(`第 ${k} 片的「${unit}」寫法不對(要 '區塊名' 或 '區塊名@i/m',0 ≤ i < m)`)
      else if (!blockNames.includes(u.block)) problems.push(`第 ${k} 片的「${unit}」不是區塊名(BLOCKS 沒有 ${u.block})`)
    }
  })
  const { mainOf, mutantOf } = shardPlanOwners(plan, mutants.map((x) => x.block))
  for (const name of blockNames) {
    const at = mainOf.get(name) ?? []
    if (at.length !== 1) problems.push(at.length ? `區塊「${name}」的主判定在第 ${at.join(' / ')} 片(會跑兩次)` : `區塊「${name}」的主判定不在任何一片(CI 沒有任何一格會跑它)`)
  }
  mutantOf.forEach((at, idx) => {
    if (at.length !== 1) problems.push(at.length ? `突變「${mutants[idx].name}」(${mutants[idx].block})在第 ${at.join(' / ')} 片(會跑兩次)` : `突變「${mutants[idx].name}」(${mutants[idx].block})不在任何一片(CI 沒有任何一格會跑它)`)
  })
  return problems
}
const root = path.resolve(REPO, arg('static', 'storybook-static'))
const CAL = 'packages/design-system/src/components/Calendar'
// 提示的初始延遲(DT-tip-delay 的下限):值的唯一住處 tokens/motion/motion.ts(tooltip.spec.md「時間參數」),讀原始碼不寫死
const TOOLTIP_DELAY_MS = Number(/export const MOTION_DELAY_PLAIN_MS = (\d+)/u.exec(fs.readFileSync(path.join(REPO, 'packages/design-system/src/tokens/motion/motion.ts'), 'utf8'))?.[1] ?? NaN)
if (!(TOOLTIP_DELAY_MS > 0)) throw new Error('calendar-month:讀不到 tokens/motion/motion.ts 的 MOTION_DELAY_PLAIN_MS —— DT-tip-delay 沒有下限可比(儀器失效)')
requireFreshStorybookBuild(root, [`${CAL}/calendar.tsx`, `${CAL}/calendar-more-list.tsx`, `${CAL}/calendar-event-detail.tsx`, `${CAL}/calendar-geometry.ts`, `${CAL}/calendar-layout.ts`, `${CAL}/_calendar-demo.tsx`, `${CAL}/calendar.stories.tsx`, `${CAL}/calendar.anatomy.stories.tsx`, `${CAL}/calendar.principles.stories.tsx`],
  { hint: '先 build storybook(或用 --static=<dir> 指定)' })
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
const storyId = (re) => Object.values(index.entries).find((e) => e.type === 'story' && re.test(e.id))?.id
const STORY = {
  team: storyId(/calendar-展示--team-calendar$/u),
  blank: storyId(/calendar-展示--cell-blank-click-moves-keyboard-stop$/u),
  inspector: storyId(/calendar-設計規格--inspector$/u),
  short: storyId(/calendar-設計原則--color-semantic$/u),
  launch: storyId(/calendar-展示--launch-week$/u),
  publish: storyId(/calendar-展示--content-publishing-schedule$/u),
  holiday: storyId(/calendar-設計原則--read-only-rule$/u),
  english: storyId(/calendar-展示--english-labels-override$/u),
  weekdays: storyId(/calendar-展示--customer-support-weekdays$/u),
  weekNumbers: storyId(/calendar-展示--manufacturing-week-numbers$/u),
  loading: storyId(/calendar-展示--loading-while-switching-month$/u),
  narrow: storyId(/calendar-展示--side-panel-narrow$/u),
  fill: storyId(/calendar-展示--fill-main-area-borderless$/u),
  quarter: storyId(/calendar-展示--quarter-planning$/u),
  customTile: storyId(/calendar-展示--read-only-dates-custom-tile-keyboard$/u),
  matrix: storyId(/calendar-設計規格--color-matrix$/u),
  moreList: storyId(/calendar-設計規格--more-list-open$/u),
  detailOpen: storyId(/calendar-設計規格--detail-open$/u),
  detailFromList: storyId(/calendar-設計規格--detail-from-more-list$/u),
  detailViewOnly: storyId(/calendar-展示--detail-view-only$/u),
  detailChangeLog: storyId(/calendar-展示--detail-change-log$/u),
  shared: storyId(/calendar-展示--shared-view-only-events$/u),
}
// 「+N」清單那一則(設計規格「狀態行為:「+N」清單開著」):年度使用者大會那天,與格內排序(calendar.spec.md「格內排序」)推出的清單順序
const MORE_DAY = '2026-07-22'
const MORE_DAY_ORDER = ['大會週', '場地布置(場館排定)', '來賓報到', '開幕致詞', '主題演講:下一代工作流程', '產品新功能展示', '午餐交流', '分組 A:自動化實戰', '分組 B:資料治理', '客戶座談', '合作夥伴論壇', '閉幕', '晚宴']

// DT-side-right / DT-side-flip(事件詳情開向,子選單擺法):gap / edge = popover.spec.md「觸發距離 canonical」(sideOffset)與「Viewport 邊距 canonical」(collisionPadding)(不 import overlay-geometry.ts);
// roomWidth = 情境「月曆右邊留出空位」時 Calendar 根元素的寬 —— 1280 寬的視窗裡,最右一欄的事件右側留得下詳情(寬 = calendar-geometry.ts CALENDAR_EVENT_DETAIL_WIDTH_PX;前提在量測時現算,不成立 = 儀器失效)
const DETAIL_SIDE = { gap: 8, edge: 8, roomWidth: 720, eventId: 'd3' }

// 規格值(calendar.spec.md「間距」與 header-canonical.spec.md:68);1 號的字是規格寫的 zh-TW 例子
// 格最小高 61 = 上內距 4 + 日期框 24 + 4 + 一列 24 + 下內距 4 + 格線 1(格子 border-box,底線在格高裡;calendar.spec.md「每一週等高」)
// moreListRows = 「+N」清單完整看得到幾列(半列原則的 N,calendar.spec.md「「+N」清單浮層」高度與捲動;刻意不 import 元件常數)
// line = 格線 1(Tailwind `border` 預設寬;週數欄寬「4 + 框 + 4 + 格線」的格線,calendar.spec.md「間距」週數欄寬列)
// detailWidth = 事件詳情寬(calendar.spec.md「事件詳情浮層」寬;刻意不 import CALENDAR_EVENT_DETAIL_WIDTH_PX)
const SPEC = { gap: 4, row: 24, inset: 8, header: 32, cellMin: 61, line: 1, navName: '行事曆月份導覽', moreListRows: 9, detailWidth: 432 }
// 窄寬度門檻(calendar-geometry.ts CALENDAR_NARROW_COLUMN_MAX_PX;calendar.spec.md「窄寬度」):欄寬 ≤ 60 = 窄。值照規格回寫的數字逐字寫,不 import 元件常數
const NARROW_MAX = 60
/** 窄寬掃描:欄寬 51…70(20 個寬度,跨過門檻),每個寬度連看幾幀 */
const SWEEP_COLS = Array.from({ length: 20 }, (_, i) => 51 + i)
const SWEEP_SAMPLES = 6
/** NW3:Dialog / Popover 開場的縮放(zoom-in-95 = 0.95 倍)與一個「版面上寬、畫面上窄」的欄寬(62 × 0.95 = 58.9 ≤ 60 < 62) */
const MOUNT_SCALE = 0.95
const MOUNT_SCALE_COL = NARROW_MAX + 2
/** S5 的情境:把根節點壓到這個高度,週列一定落在最小高(工具列 + 星期列 + 5 × 61 遠大於它) */
const SQUEEZE_PX = 240
/**
 * 每格放得下幾列 k(calendar.spec.md「每格筆數與「+N」」算式,照規格逐字寫、不 import 元件的 calendarRowsThatFit):
 * k = max(1, ⌊(格高 − 格線 1 − 上內距 4 − 日期框 24 − 日期到第一列 4 − 下內距 4 + 列距 4) ÷ (列高 24 + 列距 4)⌋)。
 * 量到的格高是 LayoutUnit(1/64 px)取整後的值,加回一個 LayoutUnit 再取整(剛好放滿那一格不因取整少一列)。
 */
const specRows = (cellH) => Math.max(1, Math.floor((cellH - 1 - SPEC.gap - SPEC.row - SPEC.gap - SPEC.gap + SPEC.gap + 1 / 64) / (SPEC.row + SPEC.gap)))
/** B3 掃的格高:跨過 k = 1…7 的每個邊界(⌊…⌋ 的兩側各一格),229 = 剛好放滿 7 列 */
const ROW_SWEEP = [61, 88, 89, 116, 117, 144, 145, 172, 173, 200, 201, 228, 229, 230]
/** 產品上線週 7/15 那一格的事件筆數(範例資料:7/13 起的「程式碼凍結」+ 當天 6 件事;車道 0…6) */
const LAUNCH_DAY = '2026-07-15'
const LAUNCH_DAY_TOTAL = 7
/** CT 的情境:renderEventTile 回傳的內容(外層 [data-calendar-covers] 的子元素)撐成 60 高、400 寬、不換行、洋紅底(量畫素時認得出是它) */
const OVERSIZE_TILE_CSS = '[data-calendar-covers] > * { height: 60px !important; width: 400px !important; max-width: none !important; white-space: nowrap !important; background: rgb(255, 0, 255) !important; }'
const near = (a, b, tol = 0.5) => Number.isFinite(a) && Math.abs(a - b) <= tol

// ── 頁面端量測(以原始碼序列化傳入,不得引用外部變數)────────────────────────────
const GRID_READY = () => Boolean(document.querySelector('[role="grid"] [role="gridcell"] [data-calendar-day]') || document.querySelector('[role="grid"] [role="gridcell"][data-calendar-day]'))
const PROBE = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height } }
  const grid = document.querySelector('[role="grid"]')
  if (!grid) return { missing: 'role=grid' }
  const shell = grid.parentElement
  // 工具列 = 根節點底下帶 data-calendar-toolbar 的那一列(2026-11-27 前是 ChromeHeader 的 <header>)
  const toolbar = shell.querySelector(':scope > [data-calendar-toolbar]')
  const nav = toolbar?.querySelector('nav')
  const heading = toolbar?.querySelector('h1, h2, h3, h4, h5, h6')
  const rows = [...grid.querySelectorAll('[role="row"]')]
  const firstRow = rows[0]
  const headers = firstRow ? [...firstRow.querySelectorAll(':scope > [role="columnheader"]')] : []
  const weekRows = rows.filter((row) => row.querySelector('[role="gridcell"]'))
  const cellsOf = (row) => [...row.querySelectorAll(':scope > [role="gridcell"]')]
  const week = weekRows.map((row) => cellsOf(row).map((c) => ({ h: r(c).height, bb: parseFloat(getComputedStyle(c).borderBottomWidth) })))
  const stopOf = (c) => (c.matches('[data-calendar-day]') ? c : c.querySelector('[data-calendar-day]'))
  const cellByDay = (iso) => [...grid.querySelectorAll('[role="gridcell"]')].find((c) => stopOf(c)?.getAttribute('data-calendar-day') === iso)
  const firstCell = weekRows[0] ? cellsOf(weekRows[0])[0] : null
  const firstDay = firstCell ? stopOf(firstCell)?.getAttribute('data-calendar-day') : null
  const textRect = (el) => { const range = document.createRange(); range.selectNodeContents(el); return r(range) }
  const dayBoxes = Object.fromEntries(['2026-07-01', '2026-07-02', '2026-07-08', '2026-08-01'].map((iso) => {
    const cell = cellByDay(iso)
    const box = cell ? stopOf(cell) : null
    if (!cell || !box || box === cell) return [iso, null]
    const c = r(cell), b = r(box), t = textRect(box), cs = getComputedStyle(box)
    return [iso, { text: box.textContent, dx: b.left - c.left, dy: b.top - c.top, h: b.height, w: b.width, padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight),
      bg: cs.backgroundColor, textInside: t.left >= b.left - 0.5 && t.right <= b.right + 0.5, textLeftPad: t.left - b.left, textRightPad: b.right - t.right }]
  }))
  // 事件列:找一格有兩筆以上的事件(團隊行事曆 7/12 的兩筆有時段事件)。文字內距量「第一個字」離列左緣:
  // 有時段的列第一個元素是色條(沒有字),所以量放文字的那一層(時間的父層;沒有時間的列 = 第一個有字的 span)
  let events = null
  for (const cell of grid.querySelectorAll('[role="gridcell"]')) {
    const tiles = [...cell.querySelectorAll('[data-calendar-tile]')]
    if (tiles.length < 2) continue
    const c = r(cell), cs = getComputedStyle(cell), box = r(stopOf(cell))
    const t0 = r(tiles[0]), t1 = r(tiles[1])
    const span = tiles[0].querySelector('[data-calendar-time]')?.parentElement ?? [...tiles[0].querySelectorAll('span')].find((s) => s.textContent.trim()) ?? null
    const tr = span ? textRect(span) : null
    events = { day: stopOf(cell)?.getAttribute('data-calendar-day'), h0: t0.height, h1: t1.height, gap: t1.top - t0.bottom, dateToFirst: t0.top - box.bottom,
      textInset: tr ? tr.left - t0.left : NaN, left: t0.left - c.left, right: c.right - parseFloat(cs.borderRightWidth) - t0.right }
    break
  }
  // 每一格的列(事件列 / 自訂外層 / 「+N」列 = 日期框那一層之後的那一層的子元素):高、第一列離日期框、第一列到格線(下內距)、放不放得下
  const cellRows = weekRows.flatMap((row, w) => cellsOf(row).map((cell) => {
    const list = cell.children[1]
    const rows = list ? [...list.children] : []
    if (!rows.length) return null
    const c = r(cell), cs = getComputedStyle(cell), box = r(stopOf(cell)), first = r(rows[0])
    const innerBottom = c.bottom - parseFloat(cs.borderBottomWidth)
    const contentBottom = innerBottom - parseFloat(cs.paddingBottom)
    return { day: stopOf(cell)?.getAttribute('data-calendar-day'), lastWeek: w === weekRows.length - 1, heights: rows.map((x) => r(x).height),
      dateToFirst: first.top - box.bottom, bottomPad: innerBottom - first.bottom, overflows: rows.some((x) => r(x).bottom > contentBottom + 0.5),
      hasMore: Boolean(list.querySelector('[data-calendar-more]')) }
  })).filter(Boolean)
  const viewport = grid.querySelector('[data-radix-scroll-area-viewport]')
  const v = viewport ? r(viewport) : null
  // 外殼(calendar.spec.md「外殼」):格子區 = 格陣本身(框、圓角、邊緣標記都在它上面),工具列在框外;token 在根節點上量
  const probeH = (css) => { const el = document.createElement('div'); el.style.cssText = `position:absolute;visibility:hidden;${css}`; shell.append(el); const h = el.getBoundingClientRect().height; el.remove(); return h }
  const gcs = getComputedStyle(grid), scs = getComputedStyle(shell)
  const g = r(grid), sh = r(shell), cont = shell.parentElement ? r(shell.parentElement) : null
  const controls = toolbar ? [...toolbar.querySelectorAll('button')] : []
  const tb = toolbar ? r(toolbar) : null
  const shellBox = {
    tight: probeH('height: var(--layout-space-tight)'), loose: probeH('height: var(--layout-space-loose)'), sm: probeH('height: var(--field-height-sm)'),
    gridBorders: ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(gcs[`border${s}Width`])), gridRadius: parseFloat(gcs.borderTopLeftRadius),
    rootBorders: ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(scs[`border${s}Width`])),
    gridMark: grid.getAttribute('data-layout-region'), rootMark: shell.getAttribute('data-layout-region'),
    toolbarInside: Boolean(toolbar && grid.contains(toolbar)),
    grid: { left: g.left, right: g.right, top: g.top, bottom: g.bottom }, root: { left: sh.left, right: sh.right, bottom: sh.bottom },
    cont: cont ? { left: cont.left, right: cont.right, bottom: cont.bottom } : null,
    toolbar: tb ? { top: tb.top, bottom: tb.bottom, height: tb.height } : null,
    firstControlLeft: controls[0] ? r(controls[0]).left : NaN, lastControlRight: controls.length ? r(controls[controls.length - 1]).right : NaN,
  }
  return {
    shellBox,
    toolbarH: toolbar ? r(toolbar).height : NaN,
    toolbarTop: toolbar ? r(toolbar).top : NaN,
    navName: nav?.getAttribute('aria-label') ?? null,
    heading: heading?.tagName ?? null,
    headerRowInGrid: Boolean(firstRow && grid.contains(firstRow) && headers.length > 0),
    headerCount: headers.length,
    headerNames: headers.map((h) => h.getAttribute('aria-label')),
    headerTexts: headers.map((h) => h.textContent.trim()),
    headerHeights: headers.map((h) => r(h).height),
    headerTop: firstRow ? r(firstRow).top : NaN,
    strayHeaders: [...document.querySelectorAll('[role="columnheader"]')].filter((h) => !grid.contains(h)).length,
    firstDay,
    weekHeights: week.map((cells) => cells[0]?.h ?? NaN),
    lastRowBorders: week.length ? week[week.length - 1].map((c) => c.bb) : [],
    otherRowBorders: week.slice(0, -1).flat().map((c) => c.bb),
    firstCellTop: firstCell ? r(firstCell).top : NaN,
    dayBoxes,
    events,
    cellRows,
    viewport: v ? { scrollH: viewport.scrollHeight, clientH: viewport.clientHeight, scrollTop: viewport.scrollTop, top: v.top, bottom: v.bottom } : null,
  }
}

/**
 * WN5 週數格與日期格同一套(calendar.spec.md「Cell 規則」週數欄、「間距」週數欄寬列【WEEKNUM-BOX(定)】):
 * 取第一個「週數是兩位數」的週,與同一週第一個兩位數的平日日期框(不是今天、不是 1 號)比。
 * 日期框 = 日期列裡看得見的那一個(可點時是日期鈕,唯讀時跳過只給讀屏的 sr-only)。量畫出來的框與字(M32),不看 class。
 */
const WEEK_BOX_PROBE = () => {
  const r = (el) => el.getBoundingClientRect()
  const textOf = (el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect() }
  const grid = document.querySelector('[role="grid"]')
  const weekRows = grid ? [...grid.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="gridcell"]')) : []
  for (const row of weekRows) {
    const rh = row.querySelector(':scope > [role="rowheader"]')
    const weekBox = rh?.firstElementChild
    if (!rh || !weekBox || !/^\d\d$/u.test(weekBox.textContent.trim())) continue
    for (const cell of row.querySelectorAll(':scope > [role="gridcell"]')) {
      const box = [...(cell.firstElementChild?.children ?? [])].find((el) => !el.classList.contains('sr-only'))
      if (!box || !/^\d\d$/u.test(box.textContent.trim()) || box.hasAttribute('aria-current') || cell.hasAttribute('aria-current')) continue
      const c = r(cell), b = r(box), bt = textOf(box), h = r(rh), wb = r(weekBox), wt = textOf(weekBox)
      const line = parseFloat(getComputedStyle(rh).borderRightWidth)
      return {
        week: weekBox.textContent.trim(), day: box.textContent.trim(), colW: h.width, line,
        weekBox: { w: wb.width, h: wb.height, left: wb.left - h.left, top: wb.top - h.top },
        dayBox: { w: b.width, h: b.height, left: b.left - c.left, top: b.top - c.top },
        // 週數字在框內:左右空白差
        centerDiff: (wt.left - wb.left) - (wb.right - wt.right),
        // 離格線:週數字左緣離欄左緣、右緣離自己的右格線;日期字左緣離這一格左緣(= 前一格右格線的外緣)
        weekInsetL: wt.left - h.left, weekInsetR: (h.right - line) - wt.right, dayInset: bt.left - c.left,
      }
    }
  }
  return null
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [] // { id, ok, msg }
const instrumentFails = []
const check = (id, ok, msg) => { results.push({ id, ok, msg }); console.log(`${ok ? '✓' : '✗'} [${id}] ${msg}`) }

const zhLong = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const zhShort = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

/**
 * 外殼(calendar.spec.md「外殼」;2026-11-27 user「表格是只畫在表格上，行事曆是把工具列也整個包起來」→ 照表格改):
 * T1 工具列 = 一列 sm 控件(高 = sm 欄位高,不另加上下內距);T5 框只圍格子區(格子區四邊各 1、圓角、標 bounded;根節點沒有框也沒有標記;
 * 工具列不在格子區裡、在它上方);T6 工具列 → 框 = tight;T7 工具列兩端對齊框的兩緣(第一顆鈕左緣 = 框左緣、「新事件」右緣 = 框右緣,同表格工具列)。
 */
function judgeShell(p, density, { prefix = '', bordered = true, flush = false } = {}) {
  const s = p.shellBox
  const tbOk = Boolean(s.toolbar)
  check(`${prefix}T1-${density}`, tbOk && near(s.toolbar.height, s.sm), `工具列高 ${s.toolbar?.height}(規格 = sm 欄位高 ${s.sm})`)
  const frame = bordered
    ? s.gridBorders.every((b) => b === 1) && s.gridRadius > 0 && s.gridMark === 'bounded'
    : s.gridBorders.every((b) => b === 0) && s.gridMark === null
  check(`${prefix}T5-${density}`, tbOk && frame && s.rootBorders.every((b) => b === 0) && s.rootMark === null && !s.toolbarInside && s.toolbar.bottom <= s.grid.top + 0.5,
    `格子區框 ${s.gridBorders.join('/')}、圓角 ${s.gridRadius}、標記 ${s.gridMark}(規格 ${bordered ? '1/1/1/1、> 0、bounded' : '0/0/0/0、無標記'});根節點框 ${s.rootBorders.join('/')}、標記 ${s.rootMark}(規格 0、無);` +
    `工具列${s.toolbarInside ? '在' : '不在'}格子區裡、工具列底 ${s.toolbar?.bottom} / 格子區頂 ${s.grid.top}`)
  check(`${prefix}T6-${density}`, tbOk && near(s.grid.top - s.toolbar.bottom, s.tight), `工具列 → 格子區 ${tbOk ? (s.grid.top - s.toolbar.bottom).toFixed(2) : '?'}(規格 tight ${s.tight})`)
  if (!flush) {
    check(`${prefix}T7-${density}`, near(s.firstControlLeft, s.grid.left) && near(s.lastControlRight, s.grid.right),
      `第一顆鈕左緣 ${s.firstControlLeft} / 框左緣 ${s.grid.left};「新事件」右緣 ${s.lastControlRight} / 框右緣 ${s.grid.right}(規格:對齊)`)
  } else {
    // F 貼邊擺法:格子區左右下 = 容器的邊;工具列兩端離容器邊 = loose(字對齊內容左右邊距)
    const c = s.cont
    check(`${prefix}F1-${density}`, Boolean(c) && near(s.grid.left, c.left) && near(s.grid.right, c.right) && near(s.grid.bottom, c.bottom),
      c ? `格子區 左 ${s.grid.left} / 右 ${s.grid.right} / 下 ${s.grid.bottom};容器 ${c.left} / ${c.right} / ${c.bottom}(規格:貼齊)` : '量不到容器')
    check(`${prefix}F2-${density}`, Boolean(c) && near(s.firstControlLeft - c.left, s.loose) && near(c.right - s.lastControlRight, s.loose),
      c ? `第一顆鈕離容器左 ${(s.firstControlLeft - c.left).toFixed(2)}、「新事件」離容器右 ${(c.right - s.lastControlRight).toFixed(2)}(規格 loose ${s.loose})` : '量不到容器')
  }
}

function judgeLayout(p, density) {
  judgeShell(p, density)
  if (density !== 'md') return
  check('T3', p.navName === SPEC.navName, `‹ / 今天 / › 在 <nav>,名稱「${p.navName}」(規格「${SPEC.navName}」)`)
  check('T4', p.heading === 'H2', `月份標題預設 ${p.heading}(規格 h2)`)
  check('H1', p.headerRowInGrid && p.headerCount === 7 && p.strayHeaders === 0,
    `星期列是格陣第一個 row:在格陣裡 ${p.headerRowInGrid}、columnheader ${p.headerCount} 個、格陣外的欄頭 ${p.strayHeaders} 個`)
  check('H2', JSON.stringify(p.headerNames) === JSON.stringify(zhLong), `欄頭讀屏名稱 = 完整星期名:${p.headerNames.join(' ')}`)
  check('H3', JSON.stringify(p.headerTexts) === JSON.stringify(zhShort), `欄頭看得見的字 = short:${p.headerTexts.join(' ')}`)
  check('H4', p.headerHeights.length === 7 && p.headerHeights.every((h) => near(h, SPEC.header)), `星期列每格高 ${[...new Set(p.headerHeights.map((h) => h.toFixed(2)))].join(' / ')}(規格 4 + 24 + 4 = ${SPEC.header})`)
  const wh = p.weekHeights
  check('W1', wh.length >= 4 && Math.max(...wh) - Math.min(...wh) <= 0.5, `各週等高:${wh.map((h) => h.toFixed(2)).join(' / ')}`)
  check('W2', p.lastRowBorders.length === 7 && p.lastRowBorders.every((b) => b === 0) && p.otherRowBorders.every((b) => b === 1),
    `最後一週底線 ${[...new Set(p.lastRowBorders)].join('/')}、其他週 ${[...new Set(p.otherRowBorders)].join('/')}(規格 0 / 1)`)
  const d = p.dayBoxes['2026-07-08']
  check('D1', d && near(d.dx, SPEC.gap) && near(d.dy, SPEC.gap) && near(d.h, SPEC.row) && near(d.w, SPEC.row),
    d ? `日期框離格左 ${d.dx}、離格頂 ${d.dy}、${d.w}×${d.h}(規格 4 / 4、24×24)` : '找不到 7/8 的日期框')
  const one = p.dayBoxes['2026-07-01'], aug = p.dayBoxes['2026-08-01'], two = p.dayBoxes['2026-07-02']
  check('D2', one?.text === '7月1日' && aug?.text === '8月1日' && two?.text === '2' && near(one?.padL, SPEC.inset) && one?.textInside,
    `1 號「${one?.text}」「${aug?.text}」、平日「${two?.text}」;1 號框左右內距 ${one?.padL} / ${one?.padR}(規格 8)、字在框內 ${one?.textInside}`)
  const e = p.events
  if (!e) { check('E1', false, '找不到一格有兩筆非全天事件(範例資料變了,本閘要換格子)'); return }
  check('E1', near(e.h0, SPEC.row) && near(e.h1, SPEC.row) && near(e.gap, SPEC.gap) && near(e.textInset, SPEC.inset) && near(e.dateToFirst, SPEC.gap),
    `${e.day} 事件列高 ${e.h0} / ${e.h1}、列距 ${e.gap}、文字內距 ${e.textInset.toFixed(2)}、日期框到第一列 ${e.dateToFirst}(規格 24 / 4 / 8 / 4)`)
  const clearance = Math.min(e.gap, e.dateToFirst, e.left, e.right)
  check('E2', clearance >= SPEC.gap - 0.01, `事件列四周最小淨空 ${clearance.toFixed(2)}(左 ${e.left} / 右 ${e.right.toFixed(2)} / 上 ${e.dateToFirst} / 列距 ${e.gap};≥ 4 → 焦點框往外)`)
}

/** WN5:週數框寬 / 高 / 離格左 / 離格頂 = 日期框、週數字在框內置中(≤ 0.5)、欄寬 = 2 × 4 + 日期框寬 + 格線 */
function judgeWeekBox(id, b) {
  if (!b) { check(id, false, '找不到兩位數的週數格與同一週兩位數的平日日期框(範例資料變了,本閘要換格子)'); return }
  const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n))
  const wantCol = 2 * SPEC.gap + b.dayBox.w + SPEC.line
  const sameBox = near(b.weekBox.w, b.dayBox.w) && near(b.weekBox.h, b.dayBox.h) && near(b.weekBox.left, b.dayBox.left) && near(b.weekBox.top, b.dayBox.top)
  // 「離格線」兩邊的值只印不判:日期數字是比例字寬、font-medium,週數是等寬數字、一般字重 —— 差多少看字型(Linux CI 與 mac 不同),
  // 結構相同由上面的框與置中保證,不拿字寬差當紅燈
  const ok = sameBox && Math.abs(b.centerDiff) <= 0.5 && near(b.colW, wantCol) && near(b.line, SPEC.line)
  check(id, ok, `週數「${b.week}」框 ${f(b.weekBox.w)}×${f(b.weekBox.h)}、離格左 ${f(b.weekBox.left)} / 頂 ${f(b.weekBox.top)};`
    + `日期「${b.day}」框 ${f(b.dayBox.w)}×${f(b.dayBox.h)}、離格左 ${f(b.dayBox.left)} / 頂 ${f(b.dayBox.top)};週數字在框內左右差 ${f(b.centerDiff)}(≤ 0.5);`
    + `欄寬 ${f(b.colW)}(規格 2 × ${SPEC.gap} + 日期框寬 + 格線 ${SPEC.line} = ${f(wantCol)},格線實量 ${f(b.line)});`
    + `參考(不判):兩位數週數離格線 左 ${f(b.weekInsetL)} / 右 ${f(b.weekInsetR)}、兩位數日期離格線 ${f(b.dayInset)}`)
}

// ── 開 story ────────────────────────────────────────────────────────────────
const browser = await launchBrowser()
// AxeBuilder 只收 newContext() 開出來的分頁(@axe-core/playwright 的限制)
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
async function open(id, { args = null, label = id, mutate = null, density = 'md', squeeze = null, theme = null, scenarioCss = null } = {}) {
  if (!id) { instrumentFails.push({ cell: label, detail: '找不到 story(改名了?)' }); return null }
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${args ? `&args=${args}` : ''}`
  try {
    const opened = await openStory(page, url, {
      waitFor: GRID_READY, settleFrames: 10, notFound: server.notFound, label,
      beforeSettle: async (p) => {
        await p.evaluate((d) => document.documentElement.setAttribute('data-density', d), density)
        if (theme) await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        // 突變要在情境套上之前做的(例:換掉 ResizeObserver 後重新掛載,再壓矮容器)
        if (mutate?.early) await p.evaluate(mutate.early)
        // 情境(不是突變):consumer 給 Calendar 一個很矮的容器 —— 正式跑與 selftest 一樣套
        if (squeeze) await p.evaluate((h) => { const root = document.querySelector('[role="grid"]')?.parentElement; if (root) root.style.height = `${h}px` }, squeeze)
        // 情境(不是突變):consumer 的 renderEventTile 回傳過大的內容(CT 區塊)—— 正式跑與 selftest 一樣套,突變的 css 排在它後面
        if (scenarioCss) await p.addStyleTag({ content: scenarioCss })
        if (mutate?.css) await p.addStyleTag({ content: mutate.css })
        if (mutate?.dom) await p.evaluate(mutate.dom)
      },
      probe: PROBE,
    })
    if (opened.probe?.missing) { instrumentFails.push({ cell: label, detail: `靜止時 ${opened.probe.missing} 不見了` }); return null }
    return opened.probe
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrumentFails.push({ cell: label, detail: error.message })
    return null
  }
}

// 瀏覽器算好的讀屏名稱(CDP Accessibility,與讀屏拿到的同一份;M32:不讀 aria-label 屬性當名稱)
let cdp = null
async function axNameOf(expression) {
  cdp ??= await context.newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const { result } = await cdp.send('Runtime.evaluate', { expression })
  if (!result.objectId) return null
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })
  return nodes[0]?.name?.value ?? null
}
/** 某一天的格子:計算名稱、aria-label 屬性(沒有 = null)、tabindex */
async function cellName(iso) {
  const sel = `[role="grid"] [role="gridcell"][data-calendar-day="${iso}"]`
  const attrs = await page.evaluate((s) => { const el = document.querySelector(s); return el ? { ariaLabel: el.getAttribute('aria-label'), tab: el.getAttribute('tabindex') } : null }, sel)
  if (!attrs) return null
  return { ...attrs, name: await axNameOf(`document.querySelector(${JSON.stringify(sel)})`) }
}
/** 格陣裡帶 aria-current 的元素(日期停靠點) */
const currentDays = () => page.evaluate(() => [...document.querySelectorAll('[role="grid"] [aria-current]')].map((el) => ({
  day: el.getAttribute('data-calendar-day'), value: el.getAttribute('aria-current'), tag: el.tagName, role: el.getAttribute('role') })))

// ── 事件的兩種長相(calendar.spec.md「事件的兩種長相」【C2、BAR(定)、TIMECOLOR(定)】;2026-11-25 事件長相那一包)──
/**
 * 頁面端:找標題 = title 的那一段事件(有時段的列文字是「開始時間 + 標題」,比對前拿掉時間;kind 'bar' = 沒有色條、'timed' = 有色條),
 * 量它的外層 / 顏色層 / 色條 / 時間 / 第一個字的位置。以原始碼序列化傳入,不得引用外部變數。
 */
const PIECE = ({ title, kind }) => {
  const titleOf = (el) => { const t = el.querySelector('[data-calendar-time]'); return (t ? el.textContent.replace(t.textContent, '') : el.textContent).trim() }
  const el = [...document.querySelectorAll('[role="grid"] [data-calendar-covers]')]
    .find((x) => titleOf(x) === title && (!kind || (kind === 'timed') === Boolean(x.querySelector('[data-calendar-accent]'))))
  if (!el) return null
  const inner = el.firstElementChild
  const accent = el.querySelector('[data-calendar-accent]')
  const time = el.querySelector('[data-calendar-time]')
  const text = time?.parentElement ?? [...el.querySelectorAll('span')].find((s) => !s.hasAttribute('data-calendar-accent') && s.textContent.trim()) ?? null
  const b = el.getBoundingClientRect()
  const range = document.createRange(); if (text) range.selectNodeContents(text)
  const tr = text ? range.getBoundingClientRect() : null
  const ics = getComputedStyle(inner), scs = getComputedStyle(el)
  const a = accent?.getBoundingClientRect()
  return {
    role: el.getAttribute('role'), name: el.getAttribute('aria-label'), cursor: scs.cursor,
    x: (b.left + b.right) / 2, y: b.top + b.height / 2, right: b.right, top: b.top,
    innerBg: ics.backgroundColor, innerColor: ics.color, borderL: [parseFloat(scs.borderLeftWidth), parseFloat(ics.borderLeftWidth)],
    fontSize: parseFloat(ics.fontSize), textLeft: tr ? tr.left - b.left : NaN,
    accent: a ? { w: a.width, h: a.height, left: a.left - b.left, dy: (a.top + a.height / 2) - (b.top + b.height / 2),
      radius: parseFloat(getComputedStyle(accent).borderTopLeftRadius), bg: getComputedStyle(accent).backgroundColor, hidden: accent.getAttribute('aria-hidden') } : null,
    time: time ? { text: time.textContent, color: getComputedStyle(time).color } : null,
    titleColor: text ? getComputedStyle(text).color : null,
  }
}
/** 頁面端:期望值由 token 現算(不寫死色值)—— bg:<token> = 背景色用那個 token 的計算值、cls:<class> = 那個 utility 的字色 */
const REFS = (keys) => Object.fromEntries(keys.map((k) => {
  const d = document.createElement(k.startsWith('cls:') ? 'span' : 'div')
  if (k.startsWith('cls:')) d.className = k.slice(4)
  else d.style.backgroundColor = `var(${k.slice(3)})`
  document.body.append(d)
  const cs = getComputedStyle(d)
  const v = k.startsWith('cls:') ? cs.color : cs.backgroundColor
  d.remove()
  return [k, v]
}))
const pieceOf = (title, kind = null) => page.evaluate(PIECE, { title, kind })
const refsOf = (keys) => page.evaluate(REFS, keys)
const frames = (n = 3) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)
/** 指標移到這一段正中(滑過),量完移開;回傳滑過時的量測 */
async function hovered(title, kind = null) {
  const at = await pieceOf(title, kind)
  if (!at) return null
  await page.mouse.move(at.x, at.y)
  await frames()
  const p = await pieceOf(title, kind)
  await page.mouse.move(0, 0)
  await frames()
  return p
}
const fmtPx = (n) => (Number.isFinite(n) ? n.toFixed(2) : String(n))
/** 有時段事件的時間在透明列 / 滑過底上的對比:WCAG 相對亮度(畫面上合成後的畫素) */
const srgbLum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a, b) => { const x = srgbLum(a), y = srgbLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

// 每一個量測區塊 = 一個函式(selftest 重用同一份,只換突變)
// ── DT 詳情:只能看 / 交回的修改 / 事件被移走 / 四層 Esc / 巢狀關閉 / 程式還焦點不跳提示(P13 / P14 閘;detail 區塊尾端呼叫)──
// 每一段只在正式跑、或指名它的突變時跑(突變帶自己的旗標),其他突變不重跑這幾段。
const DATE_POPOVER = '[role="dialog"][aria-label="日期區間選擇"]'
const runs = (mutate, flag) => !mutate || Boolean(mutate[flag])
async function detailDeep(mutate, { waitSel, detailSel, listSel }) {
  const focusInfo = () => page.evaluate(() => {
    const a = document.activeElement
    return { body: a === document.body || a === null, id: a?.getAttribute('data-calendar-event-id') ?? null, day: a?.getAttribute('data-calendar-day') ?? null, more: a?.getAttribute('data-calendar-more') ?? null, field: a?.closest('[data-calendar-detail-field]')?.getAttribute('data-calendar-detail-field') ?? null }
  })
  // DT-readonly(P13):isEditable 回 false → 空的地點 / 說明 / 類別不列、全天不畫【ALLDAY-VIEW(定)】;每一欄、標題都不可點(沒有隱形編輯鈕),點值不進編輯
  if (runs(mutate, 'readonlyDom')) {
    const p = await open(STORY.detailViewOnly, { label: '詳情只能看', mutate })
    if (p && (await waitSel(detailSel, 'open'))) {
      if (mutate?.readonlyDom) await page.evaluate(mutate.readonlyDom)
      await frames(3)
      const before = await page.evaluate((s) => {
        const d = document.querySelector(s)
        const fields = [...d.querySelectorAll('[data-calendar-detail-field]')].map((f) => f.getAttribute('data-calendar-detail-field'))
        const focusables = [...d.querySelectorAll('[data-calendar-detail-field] :is(button, input, textarea, [role="switch"], [tabindex]:not([tabindex="-1"]))')].length
        const titleButtons = d.querySelector('[data-slot="surface-header"] h2')?.closest('[data-editable]') ? 1 : 0
        return { fields, focusables, titleButtons }
      }, detailSel)
      await page.click(`${detailSel} [data-calendar-detail-field="time"]`).catch(() => {})
      await frames(4)
      const editing = await page.evaluate((s) => Boolean(document.querySelector(`${s} [data-calendar-detail-field] [data-editing="true"], ${s} [data-calendar-detail-field] input`)), detailSel)
      check('DT-readonly', before.fields.join(',') === 'time' && before.focusables === 0 && before.titleButtons === 0 && !editing,
        `只能看:欄位 ${before.fields.join(' / ')}(規格:空的地點 / 說明 / 類別不列、全天不畫 → 只剩時間)、欄位裡可聚焦的元素 ${before.focusables} 個(規格 0)、標題可編輯 ${before.titleButtons ? '是' : '否'}、點時間欄${editing ? '進了編輯' : '沒進編輯'}`)
    } else instrumentFails.push({ cell: 'DT-readonly', detail: 'play 打開的詳情等不到(story 改了?)' })
  }
  // DT-allday【ALLDAY-VIEW(定),calendar.spec.md「事件詳情浮層」內文欄位「全天」列】:展示「團隊行事曆:共享進來的事件只能看」——
  // 只能看的那一筆(業務部共享的全天事件「經銷商年度大會」)詳情沒有「全天」欄;能編輯的那一筆(自己團隊的「設計審查」)「全天」欄是能切換的開關
  //(role=switch、沒停用)。同一則範例、同一個詳情元件,兩筆的差別只在 isEditable。時間欄的字只印不判(這條的前提:全天只寫日期、有時段寫到幾點)。
  // 對照組:alldayView 在只能看的詳情裡塞回一個全天欄 / alldayEdit 把能編輯詳情裡的開關改成不是開關 → 這一格紅
  if (runs(mutate, 'alldayView') || runs(mutate, 'alldayEdit')) {
    const p = await open(STORY.shared, { label: '共享進來的事件只能看(全天欄)', mutate })
    const readOf = async (id, inject) => {
      await page.click(`[data-calendar-tile][data-calendar-event-id="${id}"]`).catch(() => {})
      if (!(await waitSel(detailSel, 'open'))) return null
      if (inject) await page.evaluate(inject)
      await frames(3)
      const r = await page.evaluate((s) => {
        const d = document.querySelector(s)
        const all = d?.querySelector('[data-calendar-detail-field="allDay"]')
        const sw = all?.querySelector('[role="switch"]')
        return {
          fields: [...(d?.querySelectorAll('[data-calendar-detail-field]') ?? [])].map((f) => f.getAttribute('data-calendar-detail-field')),
          allDay: Boolean(all), switchOn: Boolean(sw && !sw.disabled && sw.getAttribute('aria-disabled') !== 'true'),
          time: d?.querySelector('[data-calendar-detail-field="time"]')?.textContent?.trim() ?? '',
        }
      }, detailSel)
      await page.keyboard.press('Escape')
      await waitSel(detailSel, 'closed')
      await frames(2)
      return r
    }
    if (p) {
      const view = await readOf('sales2', mutate?.alldayView)
      const edit = await readOf('own1', mutate?.alldayEdit)
      if (!view || !edit) instrumentFails.push({ cell: 'DT-allday', detail: `詳情等不到(只能看那一筆${view ? '開了' : '沒開'}、能編輯那一筆${edit ? '開了' : '沒開'})` })
      else check('DT-allday', !view.allDay && edit.allDay && edit.switchOn,
        `只能看(業務部共享「經銷商年度大會」):欄位 ${view.fields.join(' / ')}、${view.allDay ? '有' : '沒有'}全天欄(規格:不畫),時間欄「${view.time}」;`
        + `能編輯(「設計審查」):${edit.allDay ? '有' : '沒有'}全天欄、${edit.switchOn ? '是能切換的開關' : '不是能切換的開關'}(規格:開關,直接切換),時間欄「${edit.time}」`)
    }
  }
  // DT-tip / DT-commit-call / DT-move / DT-fallback:test-only「詳情交回的修改」(標題長到被截斷;onEventChange 每呼叫一次記一筆在 output[data-calendar-change-log])
  const tileSel = '[data-calendar-tile][data-calendar-event-id="mv1"]'
  const logOf = () => page.evaluate(() => JSON.parse(document.querySelector('[data-calendar-change-log]')?.getAttribute('data-calendar-change-log') ?? 'null'))
  if (runs(mutate, 'tipFocusVisible') || runs(mutate, 'tipDelaySkip')) {
    // DT-tip:用滑鼠點開詳情、點 × 關掉 → 焦點由程式還給被截斷的那一段(不是 :focus-visible)→ 截斷提示不開(tooltip.spec.md「A11y 預設」)。
    // 對照組(tipFocusVisible):關掉後先按一下 Shift(最近一次輸入 = 鍵盤)再把焦點重新交給同一段 → 這次是 :focus-visible → 提示照開 → 這一格紅
    //(證明這一格看得到提示,差別只在焦點是不是 :focus-visible)
    // DT-tip-delay(2026-11-26):被擋下的那一下不得動到全站的開啟延遲 —— 接著滑過工具列「下個月」,提示仍要等初始延遲
    //(tooltip.spec.md「時間參數」;值讀 tokens/motion/motion.ts MOTION_DELAY_PLAIN_MS)。從移動指標之前起算,延遲照開時必 ≥ 該值。
    // 修前(在 Tooltip 根的 onOpenChange 擋)Radix 已先呼叫 Provider 的 onOpen、又沒有 onClose 還原 → 8ms 就開(正常 525ms)。
    // 對照組(tipDelaySkip):滑過「下個月」之前先讓「上個月」的提示打開再移過去(Radix 掃描窗口內 = 正當的立即開)→ 這一格紅,證明量得到「立即開」
    const p = await open(STORY.detailChangeLog, { label: '詳情交回的修改(提示)', mutate })
    if (p) {
      const truncated = await page.evaluate((t) => { const s = document.querySelector(`${t} .truncate`); return s ? s.scrollWidth > s.clientWidth : false }, tileSel)
      await page.click(tileSel)
      const opened = await waitSel(detailSel, 'open')
      if (!opened || !truncated) instrumentFails.push({ cell: 'DT-tip', detail: `詳情${opened ? '' : '沒'}打開、事件方塊${truncated ? '' : '沒有'}被截斷 —— 量不到` })
      else {
        await page.click(`${detailSel} [data-dismiss]`)
        await waitSel(detailSel, 'closed')
        if (mutate?.tipFocusVisible) {
          await page.keyboard.press('Shift')
          await page.evaluate((t) => { const el = document.querySelector(t); el?.blur(); el?.focus() }, tileSel)
        }
        await page.waitForTimeout(900) // 提示的開啟延遲 500(MOTION_DELAY_PLAIN_MS)之後
        const f = await focusInfo()
        const tip = await page.evaluate(() => Boolean(document.querySelector('[data-radix-popper-content-wrapper] [role="tooltip"], [role="tooltip"]')))
        check('DT-tip', f.id === 'mv1' && !tip, `關詳情後焦點${f.id === 'mv1' ? '回到被截斷的那一段' : '不在那一段'}、截斷提示${tip ? '開了' : '沒開'}(規格:程式還回來的焦點不開提示)`)
        if (!tip) {
          const center = async (name) => { const b = await page.getByRole('button', { name, exact: true }).first().boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null }
          const next = await center('下個月'), prev = await center('上個月')
          const tipOpen = () => page.waitForFunction(() => Boolean(document.querySelector('[role="tooltip"]')), null, { timeout: 5000, polling: 'raf' }).then(() => true, () => false)
          if (!next || !prev) instrumentFails.push({ cell: 'DT-tip-delay', detail: '工具列「上個月 / 下個月」找不到 —— 量不到開啟延遲' })
          else {
            if (mutate?.tipDelaySkip) { await page.mouse.move(prev.x, prev.y, { steps: 2 }); await tipOpen() }
            const t0 = Date.now()
            await page.mouse.move(next.x, next.y, { steps: 2 })
            const opened = await tipOpen()
            const ms = Date.now() - t0
            if (!opened) instrumentFails.push({ cell: 'DT-tip-delay', detail: '滑過「下個月」5 秒內提示沒開 —— 量不到開啟延遲' })
            else check('DT-tip-delay', ms >= TOOLTIP_DELAY_MS, `擋下程式還回來的焦點之後,滑過「下個月」${ms}ms 開提示(規格:初始延遲 ${TOOLTIP_DELAY_MS}ms,從移動指標前起算必 ≥ 它)`)
          }
        }
      }
    }
  }
  if (runs(mutate, 'commitExtra')) {
    // DT-commit-call:提交標題 → onEventChange 只被呼叫一次、patch 只帶 { title }。對照組(commitExtra)再改一次地點 → 兩次 → 紅
    const p = await open(STORY.detailChangeLog, { label: '詳情交回的修改(提交)', mutate })
    if (p) {
      await page.click(tileSel)
      await waitSel(detailSel, 'open')
      const renamed = '設計審查 第三輪'
      // 改名字 = 內文第一欄「標題」(標題列是 PopoverTitle,不能點進編輯;calendar.spec.md「標題列」【DT-TITLE(定)】)
      await page.click(`${detailSel} [data-calendar-detail-field="title"] button`).catch(() => {})
      const input = await page.waitForSelector(`${detailSel} [data-calendar-detail-field="title"] input`, { timeout: 5000 }).catch(() => null)
      if (!input) instrumentFails.push({ cell: 'DT-commit-call', detail: '標題沒進編輯' })
      else {
        await input.fill(renamed)
        await page.keyboard.press('Enter')
        await frames(4)
        if (mutate?.commitExtra) {
          await page.click(`${detailSel} [data-calendar-detail-field="location"] button`).catch(() => {})
          const loc = await page.waitForSelector(`${detailSel} [data-calendar-detail-field="location"] input`, { timeout: 5000 }).catch(() => null)
          if (loc) { await loc.fill('台北辦公室 5F'); await page.keyboard.press('Enter'); await frames(4) }
        }
        const log = await logOf()
        const ok = Array.isArray(log) && log.length === 1 && log[0].id === 'mv1' && JSON.stringify(log[0].patch) === JSON.stringify({ title: renamed })
        check('DT-commit-call', ok, `onEventChange 呼叫 ${log?.length ?? '?'} 次、內容 ${JSON.stringify(log)}(規格:1 次、{"title":"${renamed}"})`)
      }
      await page.keyboard.press('Escape'); await waitSel(detailSel, 'closed')
    }
  }
  if (runs(mutate, 'moveFocusNoop') || runs(mutate, 'fallbackStrip')) {
    // DT-move:產品把事件移到別天(標題列「延後一週」)→ 詳情跟到新位置(換新錨點:頂端對齊新那一段、新那一段帶 data-detail-open、舊那一段已卸載),
    // Esc 後焦點落在新位置的方塊。對照組(moveFocusNoop)新那一段拿不到焦點 → 焦點掉到 body → 紅。
    // DT-fallback:移到畫面外(「延到下個月」)→ 詳情留在原位(不跑到 0,0);Esc 後焦點回原來那一天的日期停靠點。
    // 對照組(fallbackStrip)拿掉日期停靠點的 data-calendar-day(= 找不到後備)→ 焦點掉到 body → 紅
    const p = await open(STORY.detailChangeLog, { label: '詳情交回的修改(移走)', mutate })
    if (p) {
      await page.click(tileSel)
      await waitSel(detailSel, 'open')
      await page.evaluate((t) => { window.__calOldTile = document.querySelector(t) }, tileSel)
      await page.getByRole('button', { name: '延後一週' }).click()
      await frames(6)
      const mv = await page.evaluate(({ t, d }) => {
        const tile = document.querySelector(t), detail = document.querySelector(d)
        if (!tile || !detail) return null
        const tr = tile.getBoundingClientRect(), dr = detail.getBoundingClientRect()
        return { covers: tile.getAttribute('data-calendar-covers'), oldGone: !window.__calOldTile?.isConnected, open: tile.hasAttribute('data-detail-open'), top: dr.top, tileTop: tr.top, gap: Math.min(Math.abs(dr.left - tr.right), Math.abs(tr.left - dr.right)) }
      }, { t: tileSel, d: detailSel })
      if (mutate?.moveFocusNoop) await page.evaluate((t) => { const el = document.querySelector(t); if (el) el.focus = () => {} }, tileSel)
      await page.keyboard.press('Escape')
      await waitSel(detailSel, 'closed'); await frames(4)
      const f1 = await focusInfo()
      check('DT-move', Boolean(mv) && mv.covers === '2026-07-12' && mv.oldGone && mv.open && near(mv.top, mv.tileTop, 1) && near(mv.gap, 8, 1) && f1.id === 'mv1',
        mv ? `延後一週:新那一段 ${mv.covers}(規格 2026-07-12)、舊那一段${mv.oldGone ? '已卸載' : '還在'}、新那一段${mv.open ? '' : '沒有'}帶 data-detail-open、詳情上緣 ${fmtPx(mv.top)} / 新那一段上緣 ${fmtPx(mv.tileTop)}、側邊間距 ${fmtPx(mv.gap)}(規格 8);Esc 後焦點${f1.id === 'mv1' ? '在新位置的方塊' : f1.body ? '掉到 body' : '在別處'}` : '找不到新位置的方塊或詳情')
      if (!mutate?.moveFocusNoop) {
        await page.click(tileSel)
        await waitSel(detailSel, 'open')
        await page.getByRole('button', { name: '延到下個月' }).click()
        await frames(6)
        const fb = await page.evaluate(({ t, d }) => ({ tileGone: !document.querySelector(t), open: document.querySelector(d)?.getAttribute('data-state') === 'open', top: document.querySelector(d)?.getBoundingClientRect().top ?? NaN }), { t: tileSel, d: detailSel })
        if (mutate?.fallbackStrip) await page.evaluate(() => document.querySelectorAll('[data-calendar-day]').forEach((el) => el.removeAttribute('data-calendar-day')))
        await page.keyboard.press('Escape')
        await waitSel(detailSel, 'closed'); await frames(4)
        const f2 = await focusInfo()
        check('DT-fallback', fb.tileGone && fb.open && fb.top > 20 && f2.day === '2026-07-12',
          `延到下個月:月格${fb.tileGone ? '已沒有這一筆' : '還有這一筆'}、詳情${fb.open ? '留著' : '關了'}、上緣 ${fmtPx(fb.top)}(不得跑到視窗頂);Esc 後焦點 ${f2.day ?? (f2.body ? 'body' : '別處')}(規格:原來那一天 2026-07-12 的停靠點)`)
      }
    }
  }
  if (runs(mutate, 'escDoubleAt')) {
    // DT-esc4(P14 四層 Esc,真 Calendar):清單 → 詳情 → 時間欄編輯中 → 時間欄自己的日期浮層。每按一下 Esc 只關最內層:
    // L1 日期浮層關、時間欄仍在編輯;L2 取消編輯、焦點回時間欄;L3 詳情關、焦點回清單那一列;L4 清單關、焦點回「+N」。
    // 對照組(escDoubleAt = k):第 k 層一次按兩下(= 一下 Esc 關了兩層)→ 第 k 層那一格紅
    const p = await open(STORY.detailFromList, { label: '從清單開詳情(四層 Esc)', mutate })
    if (p && (await waitSel(detailSel, 'open'))) {
      const field = `${detailSel} [data-calendar-detail-field="time"]`
      // 點時間欄一下 = 進編輯 + 日期浮層開好、焦點在浮層裡(2026-11-27 起 DatePicker.Range defaultOpen;inline-edit.spec.md「A11y 預設」Focus 管理)。
      // 不再點起訖鈕:浮層已開時點它 = 點在浮層外,Radix 先關再開,後面每一下 Esc 都差一拍(PR #176 CI 紅的根因)
      await page.click(`${field} button`).catch(() => {})
      const dateOpen = await waitSel(DATE_POPOVER, 'open')
      if (!dateOpen) instrumentFails.push({ cell: 'DT-esc4', detail: '點時間欄進編輯後日期浮層沒開(應點一下就開)—— 量不到四層' })
      else {
        const state = () => page.evaluate(({ dp, d, l, f }) => ({
          date: Boolean(document.querySelector(dp)), detail: Boolean(document.querySelector(d)), list: Boolean(document.querySelector(l)),
          editing: Boolean(document.querySelector(`${f} button[aria-haspopup="dialog"]`)),
        }), { dp: DATE_POPOVER, d: detailSel, l: listSel, f: field })
        // 截斷提示那一層(2026-11-26,CI Linux 紅的根因):第一下 Esc 關日期浮層後,焦點由鍵盤還回時間欄的起訖鈕(:focus-visible);
        // 起訖鈕的字被截斷時(字寬依機器字型:Linux CI 截斷、mac 不截斷),截斷提示依 tooltip.spec.md「A11y 預設」照開 —— 它這時就是最內層,
        // 下一下 Esc 只關它(WCAG 1.4.13 可關閉;keyboard-model-canonical「Esc 一次只關最內層」)。所以每一下之前先看:焦點所在的鈕字被截斷
        // 且是可見焦點 → 等它的提示打開(等元素本身,不賭時間)→ 按一下 Esc,驗「只關了提示、其他層原樣、焦點不動」(DT-esc4-tip)。
        // 該開卻沒開、或不該開卻開著,都紅。對照組(escDoubleAt = 'tip',同時用字距把起訖鈕撐到截斷 = 在任何機器上造出 Linux 的情況):
        // 關提示那一下按兩下 → 連編輯一起取消 → DT-esc4-tip 紅。
        // 截斷 = 焦點所在元素(含子孫)有 text-overflow: ellipsis 且內容比框寬(TruncatedText / 起訖鈕的 .truncate,與 useTruncated 同一個判準)
        const focusedTip = () => page.evaluate(() => {
          const a = document.activeElement
          const truncated = a ? [a, ...a.querySelectorAll('*')].some((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) : false
          const id = a?.getAttribute('aria-describedby')
          const tip = id ? document.getElementById(id) : null
          return { truncated, fv: Boolean(a?.matches(':focus-visible')), open: Boolean(tip && tip.getAttribute('role') === 'tooltip'), any: document.querySelectorAll('[role="tooltip"]').length }
        })
        const closeTipLayer = async (k, doubleTip = false) => {
          const t = await focusedTip()
          if (!(t.truncated && t.fv)) {
            check('DT-esc4-tip', t.any === 0, `第 ${k} 下之前:焦點所在的元素${t.truncated ? '被截斷' : '沒有被截斷'}、${t.fv ? '是' : '不是'}可見焦點 → 沒有提示這一層;開著的提示 ${t.any} 個(規格 0)`)
            return
          }
          const shown = await page.waitForFunction(() => { const id = document.activeElement?.getAttribute('aria-describedby'); return Boolean(id && document.getElementById(id)?.getAttribute('role') === 'tooltip') }, null, { timeout: 5000, polling: 'raf' }).then(() => true, () => false)
          const before = await state(), fBefore = await focusInfo()
          await page.keyboard.press('Escape')
          if (doubleTip) { await page.waitForTimeout(400); await page.keyboard.press('Escape') }
          await page.waitForTimeout(350); await frames(4)
          const after = await state(), t2 = await focusedTip(), fAfter = await focusInfo()
          const same = after.date === before.date && after.editing === before.editing && after.detail === before.detail && after.list === before.list
          const stayed = JSON.stringify(fAfter) === JSON.stringify(fBefore)
          check('DT-esc4-tip', shown && !t2.open && t2.any === 0 && same && stayed,
            `第 ${k} 下之前焦點所在的元素被截斷、是可見焦點 → 截斷提示${shown ? '開了' : '該開沒開'};關提示那一下 Esc 後提示${t2.any ? '還在' : '關了'}、其他層${same ? '原樣' : '跟著變了'}(時間欄${after.editing ? '仍在編輯' : '不在編輯'}、詳情${after.detail ? '在' : '關了'}、清單${after.list ? '在' : '關了'})、焦點${stayed ? '沒動' : '移走了'}`)
        }
        // 對照組的第二下等上一層收起動畫跑完才按(收起中的那一層還在 Radix 的層堆疊裡,會把第二下吃掉,等於沒造出「一下關兩層」)
        // 第二下之前若截斷提示打開了,先把它關掉(不記格):對照組要造的是「同一下關了兩個**邏輯**層」,不是「關了提示又關一層」
        const press = async (k) => { await page.keyboard.press('Escape'); if (mutate?.escDoubleAt === k) { await page.waitForTimeout(400); const t = await focusedTip(); if (t.truncated && t.fv) { await page.waitForFunction(() => document.querySelector('[role="tooltip"]'), null, { timeout: 5000, polling: 'raf' }).catch(() => {}); await page.keyboard.press('Escape'); await page.waitForTimeout(350) } await page.keyboard.press('Escape') } await page.waitForTimeout(350); await frames(4) }
        await press(1); const s1 = await state()
        check('DT-esc4-L1', !s1.date && s1.editing && s1.detail && s1.list, `第一下:日期浮層${s1.date ? '還在' : '關了'}、時間欄${s1.editing ? '仍在編輯' : '不在編輯'}、詳情${s1.detail ? '在' : '關了'}、清單${s1.list ? '在' : '關了'}`)
        await closeTipLayer(2, mutate?.escDoubleAt === 'tip')
        await press(2); const s2 = await state(); const f2 = await focusInfo()
        check('DT-esc4-L2', !s2.editing && s2.detail && s2.list && f2.field === 'time', `第二下:時間欄${s2.editing ? '仍在編輯' : '取消了'}、焦點${f2.field === 'time' ? '回時間欄' : '不在時間欄'}、詳情${s2.detail ? '在' : '關了'}、清單${s2.list ? '在' : '關了'}`)
        await closeTipLayer(3)
        await press(3); const s3 = await state(); const f3 = await focusInfo()
        check('DT-esc4-L3', !s3.detail && s3.list && f3.id === 'c3', `第三下:詳情${s3.detail ? '還在' : '關了'}、清單${s3.list ? '在' : '關了'}、焦點${f3.id === 'c3' ? '回清單那一列' : '不在那一列'}`)
        await closeTipLayer(4)
        await press(4); const s4 = await state(); const f4 = await focusInfo()
        check('DT-esc4-L4', !s4.list && f4.more === MORE_DAY, `第四下:清單${s4.list ? '還在' : '關了'}、焦點${f4.more === MORE_DAY ? '回「+N」' : '不在「+N」'}`)
      }
    } else instrumentFails.push({ cell: 'DT-esc4', detail: 'play 打開的詳情等不到' })
  }
  if (runs(mutate, 'nestClickGrid')) {
    // DT-nest(P14 巢狀關閉,真 Calendar):點詳情裡面、點詳情裡時間欄自己的日期浮層,清單都不關;點兩層外面 → 兩層都關。
    // 對照組(nestClickGrid):第一下改點格陣上的格子(在清單與詳情外)→ 清單被關 → 紅(證明這一格看得到「清單被關」)
    const p = await open(STORY.detailFromList, { label: '從清單開詳情(巢狀關閉)', mutate })
    if (p && (await waitSel(detailSel, 'open'))) {
      const alive = () => page.evaluate(({ d, l }) => ({ detail: Boolean(document.querySelector(d)), list: Boolean(document.querySelector(l)) }), { d: detailSel, l: listSel })
      if (mutate?.nestClickGrid) {
        const cell = await page.evaluate(() => { const r = document.querySelector('[role="gridcell"][data-calendar-day="2026-07-01"], [role="gridcell"]')?.getBoundingClientRect(); return r ? { x: r.left + r.width - 6, y: r.top + r.height - 6 } : null })
        if (cell) await page.mouse.click(cell.x, cell.y)
      } else {
        const label = await page.evaluate((d) => { const r = document.querySelector(`${d} [data-calendar-detail-field="time"] label`)?.getBoundingClientRect(); return r ? { x: r.left + 2, y: r.top + r.height / 2 } : null }, detailSel)
        if (label) await page.mouse.click(label.x, label.y)
      }
      await page.waitForTimeout(300); await frames(4)
      const a1 = await alive()
      const field = `${detailSel} [data-calendar-detail-field="time"]`
      // 點時間欄一下就開好日期浮層(同 DT-esc4;不再點起訖鈕)
      await page.click(`${field} button`).catch(() => {})
      const dateOpen = await waitSel(DATE_POPOVER, 'open')
      let a2 = { detail: false, list: false }
      if (dateOpen) {
        const head = await page.evaluate((dp) => { const r = document.querySelector(`${dp} [role="columnheader"], ${dp} th`)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }, DATE_POPOVER)
        if (head) await page.mouse.click(head.x, head.y)
        await page.waitForTimeout(300); await frames(4)
        a2 = await alive()
      }
      await page.mouse.click(5, 5)
      await page.waitForTimeout(400); await frames(6)
      const a3 = await alive()
      check('DT-nest', a1.detail && a1.list && dateOpen && a2.detail && a2.list && !a3.detail && !a3.list,
        `點詳情裡面:詳情${a1.detail ? '在' : '關了'}、清單${a1.list ? '在' : '關了'};點詳情裡的日期浮層:${dateOpen ? `詳情${a2.detail ? '在' : '關了'}、清單${a2.list ? '在' : '關了'}` : '日期浮層打不開'};點兩層外面:詳情${a3.detail ? '還在' : '關了'}、清單${a3.list ? '還在' : '關了'}`)
    } else instrumentFails.push({ cell: 'DT-nest', detail: 'play 打開的詳情等不到' })
  }
}

const BLOCKS = {
  async layout(mutate) {
    for (const density of ['md', 'lg']) {
      const p = await open(STORY.team, { label: `團隊行事曆 @${density}`, mutate, density })
      if (p) judgeLayout(p, density)
      if (!p || density !== 'md') continue
      // 事件列的鍵盤焦點框往外(calendar.spec.md「焦點框」):從 7/12 的日期鈕按 F2 進格,量焦點所在事件列的 outline。
      // 往外 = outline-offset ≥ 0(全域 :focus-visible);往內的 focus-ring-inset 是負的 offset(styles/base.css)。
      await page.locator('button[data-calendar-day="2026-07-12"]').focus()
      await page.keyboard.press('F2')
      const ring = await page.evaluate(() => {
        const a = document.activeElement
        if (!a?.hasAttribute('data-calendar-tile')) return null
        const cs = getComputedStyle(a)
        return { offset: parseFloat(cs.outlineOffset), width: parseFloat(cs.outlineWidth), style: cs.outlineStyle }
      })
      check('E3', Boolean(ring) && ring.style !== 'none' && ring.width > 0 && ring.offset >= 0,
        ring ? `F2 進格後事件列焦點框:${ring.style} ${ring.width}px、offset ${ring.offset}px(往外 = offset ≥ 0)` : 'F2 之後焦點沒有落在事件列上')
    }
    // 外殼的另外兩種擺法(calendar.spec.md「外殼」):不加框(元件檢閱器 bordered=false)與貼邊(展示「填滿主畫面」flush + 不加框)
    for (const density of ['md', 'lg']) {
      const nb = await open(STORY.inspector, { label: `Inspector bordered=false @${density}`, args: 'bordered:!false', mutate, density })
      if (nb) judgeShell(nb, density, { prefix: 'NB-', bordered: false })
      const fl = await open(STORY.fill, { label: `填滿主畫面(貼邊)@${density}`, mutate, density })
      if (fl) judgeShell(fl, density, { prefix: 'FL-', bordered: false, flush: true })
    }
  },
  async axe(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 axe', mutate })
    if (!p) return
    const res = await new AxeBuilder({ page }).withRules(['aria-required-children', 'aria-required-parent']).analyze()
    const bad = res.violations.map((v) => `${v.id} ×${v.nodes.length}`)
    check('A1', bad.length === 0, `axe aria-required-children / aria-required-parent:${bad.join(';') || '0'}`)
  },
  async scroll(mutate) {
    const p = await open(STORY.short, { label: '設計原則 h-84', mutate })
    if (!p) return
    const v = p.viewport
    check('S1', p.weekHeights.length >= 5 && p.weekHeights.every((h) => near(h, SPEC.cellMin)), `容器太矮:每週高 ${[...new Set(p.weekHeights.map((h) => h.toFixed(2)))].join(' / ')}(格最小高 ${SPEC.cellMin})`)
    // 最小高的週:事件列 24、日期框到第一列 4、第一列到格線 4,三條同時成立(最後一週沒有底線、下方多 1px,只要求 ≥ 4)
    const minCells = p.cellRows
    const minBad = minCells.filter((c) => !(c.heights.every((h) => near(h, SPEC.row)) && near(c.dateToFirst, SPEC.gap)
      && (c.lastWeek ? c.bottomPad >= SPEC.gap - 0.5 : near(c.bottomPad, SPEC.gap))))
    const fmt = (c) => `${c.day} 列 ${c.heights.map((h) => h.toFixed(2)).join('/')}、日期框到第一列 ${c.dateToFirst.toFixed(2)}、到格線 ${c.bottomPad.toFixed(2)}`
    check('S4', minCells.filter((c) => !c.lastWeek).length >= 1 && minBad.length === 0,
      minCells.length ? `最小高的週 ${minCells.length} 格有事件:${(minBad.length ? minBad : minCells.slice(0, 3)).map(fmt).join(';')}(規格 24 / 4 / 4)` : '最小高的週裡找不到有事件的格子(範例資料變了,本閘要換範例)')
    // 使用者捲得動:滾輪落在格陣上,週列往上走、工具列與星期列不動
    const box = await page.evaluate(() => { const b = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null })
    if (!box || !v) { check('S2', false, '找不到週列的捲動區'); return }
    await page.mouse.move(box.x, box.y)
    await page.mouse.wheel(0, 120)
    await page.waitForFunction((t) => (document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.scrollTop ?? 0) !== t, v.scrollTop, { timeout: 2000 }).catch(() => {})
    const after = await page.evaluate(PROBE)
    const moved = p.firstCellTop - after.firstCellTop
    check('S2', v.scrollH > v.clientH + 1 && after.viewport.scrollTop > 0 && moved > 0 && near(after.toolbarTop, p.toolbarTop) && near(after.headerTop, p.headerTop),
      `週列可捲:內容 ${v.scrollH} > 可視 ${v.clientH}、滾輪後 scrollTop ${after.viewport.scrollTop}、第一週上移 ${moved.toFixed(1)};工具列 ${p.toolbarTop}→${after.toolbarTop}、星期列 ${p.headerTop}→${after.headerTop}(不動)`)
    // 鍵盤走到看不見的最後一週:焦點所在的日期框要被捲進可視範圍
    await page.evaluate(() => { const vp = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]'); if (vp) vp.scrollTop = 0 })
    const today = page.locator('[data-calendar-day="2026-07-15"]')
    await today.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const seen = await page.evaluate(() => {
      const a = document.activeElement, vp = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')
      if (!a || !vp) return null
      const b = a.getBoundingClientRect(), c = vp.getBoundingClientRect()
      return { day: a.getAttribute('data-calendar-day'), top: b.top, bottom: b.bottom, vTop: c.top, vBottom: c.bottom, scrollTop: vp.scrollTop }
    })
    check('S3', seen?.day === '2026-07-29' && seen.top >= seen.vTop - 0.5 && seen.bottom <= seen.vBottom + 0.5,
      seen ? `↓↓ 後焦點在 ${seen.day}、日期框 ${seen.top.toFixed(1)}–${seen.bottom.toFixed(1)} 在可視 ${seen.vTop.toFixed(1)}–${seen.vBottom.toFixed(1)} 內(scrollTop ${seen.scrollTop})` : '量不到焦點')
  },
  async keyboardStop(mutate) {
    // test-only「點格內空白帶鍵盤位置」:onDateClick 是空函式(不開對話框),play 跑完後停靠點在 22
    const p = await open(STORY.blank, { label: '點日期鈕 / 今天 搬停靠點', mutate })
    if (!p) return
    const state = (iso) => page.evaluate((d) => {
      const el = document.querySelector(`button[data-calendar-day="${d}"]`)
      return el ? { tab: el.getAttribute('tabindex'), active: document.activeElement === el, activeText: document.activeElement?.textContent ?? null } : null
    }, iso)
    const before10 = await state('2026-07-10')
    // 程式化 click:Chromium 不會因此給焦點(= Safari 點按鈕的情況),元件要自己給
    await page.evaluate(() => document.querySelector('button[data-calendar-day="2026-07-10"]')?.click())
    const after10 = await state('2026-07-10')
    check('K1', before10?.tab === '-1' && !before10.active && after10?.tab === '0' && after10.active,
      `點 7/10 日期鈕:前 tabindex ${before10?.tab}、有焦點 ${before10?.active} → 後 tabindex ${after10?.tab}、有焦點 ${after10?.active}`)
    const before15 = await state('2026-07-15')
    await page.getByRole('button', { name: '今天', exact: true }).click()
    const after15 = await state('2026-07-15')
    const stillOnToday = await page.evaluate(() => document.activeElement?.textContent?.trim() === '今天')
    check('K2', before15?.tab === '-1' && after15?.tab === '0' && stillOnToday,
      `按「今天」:7/15 tabindex ${before15?.tab} → ${after15?.tab}、焦點留在「今天」鈕 ${stillOnToday}`)
  },
  async inspector(mutate) {
    const gb = await open(STORY.inspector, { label: 'Inspector en-GB', args: mutate?.gbArgs ?? 'locale:en-GB', mutate })
    if (gb) {
      const dow = gb.firstDay ? new Date(`${gb.firstDay}T12:00:00`).getDay() : NaN
      check('L1', gb.headerNames[0] === 'Monday' && dow === 1, `en-GB 不傳 weekStartsOn:第一欄「${gb.headerNames[0]}」、第一格 ${gb.firstDay}(星期 ${dow})`)
    }
    const h3 = await open(STORY.inspector, { label: 'Inspector titleAs=h3', args: mutate?.titleArgs ?? 'titleAs:h3', mutate })
    if (h3) check('Q1', h3.heading === 'H3', `titleAs="h3" → 標題 ${h3.heading}`)
  },
  // 容器再矮:事件列與「+N」列不被壓扁(calendar.spec.md「每一週等高」:事件列不被壓扁;「每格筆數與「+N」」:放不下的由「+N」取代)。
  // 最小高的週 k = 1:每一格只放一列(一筆事件或「+N」),那一列 24、在格子內容框裡、沒有任何一列被裁。
  async squeeze(mutate) {
    const p = await open(STORY.launch, { label: `產品上線週 根節點 ${SQUEEZE_PX}`, mutate, squeeze: SQUEEZE_PX })
    if (!p) return
    // 先證明情境真的發生了:每週都在最小高、至少一格放不下(出現「+N」)—— 否則「列都是 24」可能只是因為格子夠高
    const atMin = p.weekHeights.length >= 5 && p.weekHeights.every((h) => near(h, SPEC.cellMin))
    const crowded = p.cellRows.filter((c) => c.hasMore)
    if (!atMin || crowded.length === 0) {
      instrumentFails.push({ cell: 'S5', detail: `情境沒成立:每週高 ${[...new Set(p.weekHeights.map((h) => h.toFixed(2)))].join(' / ')}、出現「+N」的格 ${crowded.length} 個(要每週 = ${SPEC.cellMin} 且至少一格放不下)` })
      return
    }
    const rows = p.cellRows.flatMap((c) => c.heights)
    const squashed = p.cellRows.filter((c) => !c.heights.every((h) => near(h, SPEC.row)) || c.overflows)
    check('S5', rows.length >= 3 && squashed.length === 0,
      `每週 ${SPEC.cellMin}、${crowded.length} 格出現「+N」:${rows.length} 列${squashed.length ? `,被壓扁或被裁的格 ${squashed.map((c) => `${c.day}(${c.heights.map((h) => h.toFixed(2)).join('/')}${c.overflows ? '、超出格子' : ''})`).join(' ')}` : ' 全是 24、都在格子裡'}(規格:列高 24,放不下的由「+N」取代、不壓扁也不被裁)`)
  },
  // 讀屏名稱(N1–N4):日期停靠點、今天、唯讀格、labels 覆寫
  async namesClickable(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 讀屏名稱', mutate })
    if (!p) return
    // N1:getByRole + 名稱(exact)各找到剛好一顆 —— 量的是 Playwright 依無障礙樹算出來的名稱,不是 aria-label 屬性字串
    const expected = [
      ['今天,2026年7月15日 星期三,1 個事件', '今天(7/15,1 筆)'],
      ['2026年7月12日 星期日,2 個事件', '7/12(2 筆)'],
      ['2026年7月1日 星期三,0 個事件', '1 號(畫面「7月1日」)'],
      ['2026年8月1日 星期六,0 個事件', '溢出日 8/1'],
    ]
    const found = []
    for (const [name, what] of expected) found.push({ what, name, n: await page.getByRole('button', { name, exact: true }).count() })
    const legacy = await page.getByRole('button', { name: /^\d{4}-\d{2}-\d{2},/ }).count()
    const bad = found.filter((f) => f.n !== 1)
    check('N1', bad.length === 0 && legacy === 0,
      `日期鈕名稱:${(bad.length ? bad : found).map((f) => `${f.what}「${f.name}」×${f.n}`).join(';')};舊念法 yyyy-MM-dd 的日期鈕 ${legacy} 顆(規格:完整日期 + 筆數,今天加「今天,」)`)
    const cur = await currentDays()
    check('N2-click', cur.length === 1 && cur[0].day === '2026-07-15' && cur[0].value === 'date' && cur[0].tag === 'BUTTON',
      `可點模式 aria-current:${cur.map((c) => `${c.day} ${c.tag}=${c.value}`).join('、') || '(沒有)'}(規格:只有今天的日期鈕 = date)`)
  },
  async namesReadOnly(mutate) {
    // 內容發佈月曆:日期格唯讀、事件可點(事件方塊是 role=button,名稱由它自己的 aria-label 接進格子的名稱)
    const pub = await open(STORY.publish, { label: '內容發佈月曆 唯讀格名稱', mutate })
    if (pub) {
      const today = await cellName('2026-07-15')
      const withEvent = await cellName('2026-07-02')
      const head = '2026年7月2日 星期四,1 個事件'
      const rest = withEvent?.name?.startsWith(head) ? withEvent.name.slice(head.length) : null
      check('N3-publish', today?.ariaLabel === null && today.name === '今天,2026年7月15日 星期三,0 個事件' && today.tab === '0'
        && withEvent?.ariaLabel === null && rest !== null && rest.includes('每週電子報') && !/(^|\s)2(\s|$)/u.test(rest),
        `唯讀格名稱:7/15「${today?.name}」(aria-label ${today?.ariaLabel}、tabindex ${today?.tab});7/2「${withEvent?.name}」(aria-label ${withEvent?.ariaLabel})`
        + `(規格:沒有 aria-label;開頭日期 + 今天 + 筆數、接事件標題「每週電子報」、看得見的「2」不重念)`)
      // getByRole 也找得到同一格(Playwright 自己的名稱計算,與 Chromium 的無障礙樹互相對照)
      const byRole = await page.getByRole('gridcell', { name: '今天,2026年7月15日 星期三,0 個事件', exact: true }).count()
      check('N3-byrole', byRole === 1, `getByRole('gridcell', 今天那格的名稱) 找到 ${byRole} 格(規格 1)`)
      const cur = await currentDays()
      check('N2-readonly', cur.length === 1 && cur[0].day === '2026-07-15' && cur[0].value === 'date' && cur[0].role === 'gridcell',
        `唯讀模式 aria-current:${cur.map((c) => `${c.day} ${c.role ?? c.tag}=${c.value}`).join('、') || '(沒有)'}(規格:只有今天的格子 = date)`)
    }
    // 設計原則「唯讀的日期格與事件」:日期格與事件都唯讀(事件是純文字,沒有角色)
    const hol = await open(STORY.holiday, { label: '設計原則 唯讀格名稱', mutate })
    if (hol) {
      const c = await cellName('2026-07-03')
      const head = '2026年7月3日 星期五,1 個事件'
      const rest = c?.name?.startsWith(head) ? c.name.slice(head.length) : null
      check('N3-holiday', c?.ariaLabel === null && rest !== null && rest.includes('公司創立紀念日') && !/(^|\s)3(\s|$)/u.test(rest),
        `事件也唯讀時 7/3 名稱「${c?.name}」(aria-label ${c?.ariaLabel};規格:開頭日期 + 筆數、接純文字的事件標題、看得見的「3」不重念)`)
      // 長條涵蓋的第 2 天:年中盤點 7/23–7/24 是一條長條、DOM 在 7/23 那格 —— 7/24 的格子名稱照樣要念到它的標題(事件版面那一包起)
      const carried = await cellName('2026-07-24')
      const head2 = '2026年7月24日 星期五,1 個事件'
      const rest2 = carried?.name?.startsWith(head2) ? carried.name.slice(head2.length) : null
      check('N3-bar', carried?.ariaLabel === null && rest2 !== null && rest2.includes('年中盤點(辦公室關閉)') && !/(^|\s)24(\s|$)/u.test(rest2),
        `長條涵蓋的第 2 天 7/24 名稱「${carried?.name}」(規格:開頭日期 + 筆數,接著念得到從 7/23 橫跨過來的「年中盤點(辦公室關閉)」、看得見的「24」不重念)`)
    }
  },
  async namesEnglish(mutate) {
    const p = await open(STORY.english, { label: '英文讀屏字串覆寫', mutate })
    if (!p) return
    const grid = await page.getByRole('grid', { name: 'Calendar, July 2026', exact: true }).count()
    const today = await page.getByRole('button', { name: 'Today, Wednesday, July 15, 2026, 0 events', exact: true }).count()
    const other = await page.getByRole('button', { name: 'Thursday, July 16, 2026, 0 events', exact: true }).count()
    const leaked = await page.evaluate(() => [document.querySelector('[role="grid"]')?.getAttribute('aria-label') ?? '',
      ...[...document.querySelectorAll('[role="grid"] [data-calendar-day]')].map((el) => el.getAttribute('aria-label') ?? '')].filter((n) => /[\u4e00-\u9fff]/u.test(n)))
    check('N4', grid === 1 && today === 1 && other === 1 && leaked.length === 0,
      `labels 覆寫:格陣「Calendar, July 2026」×${grid}、今天 ×${today}、7/16 ×${other};帶中文的名稱 ${leaked.length} 個${leaked.length ? `(例「${leaked[0]}」)` : ''}(規格:每鍵都用 consumer 給的字)`)
  },
  // ── 隱藏週末(calendar.spec.md「Cell 規則」隱藏週末【Q10(定)】、「A11y 預設」鍵盤表 hideWeekends 那幾條【AI 推導】)──
  async hideWeekends(mutate) {
    const p = await open(STORY.weekdays, { label: '客服排班(只看工作日)', mutate })
    if (p) {
      const shown = await page.evaluate(() => {
        const g = document.querySelector('[role="grid"]')
        const rows = [...g.querySelectorAll('[role="row"]')]
        const weekRows = rows.filter((r) => r.querySelector('[role="gridcell"]'))
        const dows = [...g.querySelectorAll('[data-calendar-day]')].map((d) => new Date(`${d.getAttribute('data-calendar-day')}T12:00:00`).getDay())
        return { heads: [...rows[0].querySelectorAll(':scope > [role="columnheader"]')].map((h) => h.getAttribute('aria-label')),
          perRow: weekRows.map((r) => r.querySelectorAll(':scope > [role="gridcell"]').length), weekend: dows.filter((d) => d === 0 || d === 6).length, cells: dows.length }
      })
      check('HW1', JSON.stringify(shown.heads) === JSON.stringify(zhLong.slice(1, 6)) && shown.perRow.length >= 4 && shown.perRow.every((n) => n === 5) && shown.weekend === 0,
        `zh-TW 隱藏週末:欄頭 ${shown.heads.join(' ')}、每週格數 ${[...new Set(shown.perRow)].join('/')}、${shown.cells} 格裡週六日 ${shown.weekend} 格(規格:藏週六日 → 5 欄、5 個 columnheader)`)
      // 鍵盤落點:往移動方向找最近一個看得見的日子;Home / End = 該列第一 / 最後一個看得見的
      const moves = [['2026-07-17', 'ArrowRight', '2026-07-20'], ['2026-07-20', 'ArrowLeft', '2026-07-17'], ['2026-07-15', 'Home', '2026-07-13'], ['2026-07-15', 'End', '2026-07-17']]
      const got = []
      for (const [from, key, want] of moves) {
        await page.locator(`button[data-calendar-day="${from}"]`).focus()
        await page.keyboard.press(key)
        got.push({ from, key, want, at: await page.evaluate(() => document.activeElement?.getAttribute('data-calendar-day') ?? null) })
      }
      const wrong = got.filter((g) => g.at !== g.want)
      check('HW2', wrong.length === 0, `鍵盤跳過被藏的日子:${(wrong.length ? wrong : got).map((g) => `${g.from} ${g.key} → ${g.at}(規格 ${g.want})`).join(';')}`)
      // 今天不在本月、1 號落在被藏的週末(2026-08-01 週六):Tab 停靠點落在 1 號之後第一個看得見的日子 8/3(critic 1-6)
      await page.getByRole('button', { name: '下個月', exact: true }).click()
      if (mutate?.after) await page.evaluate(mutate.after)
      const stops = await page.evaluate(() => [...document.querySelectorAll('[role="grid"] [data-calendar-day][tabindex="0"]')].map((el) => el.getAttribute('data-calendar-day')))
      check('HW3', stops.length === 1 && stops[0] === '2026-08-03', `八月(1 號是週六)的 Tab 停靠點:${stops.join('、') || '(沒有)'}(規格:1 號之後第一個看得見的日子 2026-08-03,剛好一個)`)
    }
    // 週末是週五、週六的語系(en-IL,CLDR):藏的是五六,週日起
    const il = await open(STORY.inspector, { label: 'Inspector en-IL 隱藏週末', args: mutate?.ilArgs ?? 'locale:en-IL;hideWeekends:!true', mutate })
    if (il) check('HW4', JSON.stringify(il.headerNames) === JSON.stringify(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']),
      `en-IL 隱藏週末:欄頭 ${il.headerNames.join(' ')}(規格:週末跟語系 → 藏週五、週六)`)
  },
  // ── 週數欄(calendar.spec.md「Cell 規則」週數欄【Q10(定)、Q10b(定)】、「間距」週數欄寬、「A11y 預設」週數欄名稱【AI 推導】)──
  async weekNumbers(mutate) {
    // WN5 一般 / 大密度各量一次(週數框與日期框同一套);WN1–WN3 只在一般密度判(字樣與欄頭不隨密度變)
    const pLg = await open(STORY.weekNumbers, { label: '生產排程(週次)大密度', mutate, density: 'lg' })
    if (pLg) judgeWeekBox('WN5-lg-zh-TW', await page.evaluate(WEEK_BOX_PROBE))
    const p = await open(STORY.weekNumbers, { label: '生產排程(週次)', mutate })
    if (p) {
      judgeWeekBox('WN5-md-zh-TW', await page.evaluate(WEEK_BOX_PROBE))
      const wn = await page.evaluate(() => {
        const g = document.querySelector('[role="grid"]')
        const rows = [...g.querySelectorAll('[role="row"]')]
        const head = rows[0].querySelector(':scope > [role="columnheader"]')
        const weekRows = rows.filter((r) => r.querySelector('[role="gridcell"]'))
        const rhs = weekRows.map((r) => r.querySelector(':scope > [role="rowheader"]'))
        const first = rhs[0], span = first?.querySelector('span')
        const range = document.createRange(); if (span) range.selectNodeContents(span)
        const t = span ? range.getBoundingClientRect() : null, c = first?.getBoundingClientRect(), b = span?.getBoundingClientRect()
        const cs = first ? getComputedStyle(first) : null
        const ref = document.createElement('span'); ref.className = 'text-fg-secondary'; document.body.appendChild(ref)
        const secondary = getComputedStyle(ref).color; ref.remove()
        const contentRight = c && cs ? c.right - parseFloat(cs.borderRightWidth) : NaN
        return { headText: head?.textContent ?? null, headW: head?.getBoundingClientRect().width ?? NaN, headFirst: rows[0].firstElementChild === head,
          widths: rhs.map((r) => r?.getBoundingClientRect().width ?? NaN), firstInRow: weekRows.every((r) => r.firstElementChild?.getAttribute('role') === 'rowheader'),
          names: rhs.map((r) => r?.getAttribute('aria-label') ?? null), texts: rhs.map((r) => r?.textContent ?? null),
          tabbable: rhs.filter((r) => r && (r.tabIndex >= 0 || r.querySelector('button, a, [tabindex]'))).length,
          digitW: t?.width ?? NaN, centerDiff: t && c ? (t.left - c.left) - (contentRight - t.right) : NaN, top: b && c ? b.top - c.top : NaN, h: b?.height ?? NaN,
          color: cs?.color ?? null, secondary, weight: cs?.fontWeight ?? null }
      })
      // 欄寬本身(= 2 × 4 + 日期框寬 + 格線)在 WN5 判;這裡只判星期列與週列讀同一個欄寬
      const sameW = wn.widths.length >= 4 && wn.widths.every((w) => near(w, wn.headW))
      check('WN1', wn.headFirst && wn.headText === '週' && sameW,
        `週數欄:欄頭「${wn.headText}」在星期列第一格 ${wn.headFirst}、欄頭寬 ${wn.headW?.toFixed(2)} / 週列 ${[...new Set(wn.widths.map((w) => w.toFixed(2)))].join('/')}`
        + `(規格:兩邊同寬 ±0.5;兩位數週數寬 ${wn.digitW?.toFixed(2)})`)
      check('WN2', wn.firstInRow && wn.tabbable === 0 && JSON.stringify(wn.texts) === JSON.stringify(['27', '28', '29', '30', '31']) && wn.names.every((n, i) => n === `第 ${27 + i} 週`),
        `週數格:每週第一格是 rowheader ${wn.firstInRow}、可聚焦 ${wn.tabbable} 個、數字 ${wn.texts.join(' ')}、名稱 ${wn.names[0]}…(規格:zh-TW 2026 年 7 月 = 第 27–31 週、不進 Tab 序列、名稱「第 N 週」)`)
      check('WN3', wn.color === wn.secondary && wn.weight === '400' && near(wn.top, SPEC.gap) && near(wn.h, SPEC.row) && Math.abs(wn.centerDiff) <= 1,
        `週數字樣:色 ${wn.color}(fg-secondary ${wn.secondary})、字重 ${wn.weight}、上邊距 ${wn.top}、高 ${wn.h}、左右差 ${wn.centerDiff?.toFixed(2)}(規格:一般字重 fg-secondary、上 4 高 24 同日期框、水平置中)`)
    }
    // 年底那一列(含 2027-01-01):第一週跟語系 —— en-GB(週一起、第一週至少 4 天)= 第 53 週、en-US(週日起、含 1/1)= 第 1 週(date-locale 週數錨點)
    for (const [tag, want] of [['en-GB', '53'], ['en-US', '1']]) {
      const q = await open(STORY.inspector, { label: `Inspector ${tag} 週數欄`, args: `locale:${tag};showWeekNumbers:!true`, mutate })
      if (!q) continue
      // en-US 的 WN5 在翻月之前量(Inspector 開在 2026 年 7 月:週數 27–31,兩位數)
      if (tag === 'en-US') judgeWeekBox('WN5-md-en-US', await page.evaluate(WEEK_BOX_PROBE))
      for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '下個月', exact: true }).click()
      if (mutate?.after) await page.evaluate(mutate.after)
      const year = await page.evaluate(() => {
        const cell = document.querySelector('[role="grid"] [data-calendar-day="2027-01-01"]')
        const row = cell?.closest('[role="gridcell"]')?.parentElement
        return row ? row.querySelector(':scope > [role="rowheader"]')?.textContent ?? null : null
      })
      check(`WN4-${tag}`, year === want, `${tag} 2026 年 12 月最後一列(含 2027-01-01)週數 ${year}(規格 ${want})`)
    }
    const usLg = await open(STORY.inspector, { label: 'Inspector en-US 週數欄 大密度', args: 'locale:en-US;showWeekNumbers:!true', mutate, density: 'lg' })
    if (usLg) judgeWeekBox('WN5-lg-en-US', await page.evaluate(WEEK_BOX_PROBE))
  },
  // ── 載入中(calendar.spec.md「狀態與邊界案例」載入中【Q11(定);一條 / 仍可操作 / 名稱不念筆數 = AI 推導】)──
  async loading(mutate) {
    const p = await open(STORY.loading, { label: '切換月份時載入', mutate })
    if (!p) return
    const ld = await page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      const cells = [...g.querySelectorAll('[role="gridcell"]')]
      const bad = cells.filter((cell) => {
        const kids = [...(cell.children[1]?.children ?? [])]
        return !(kids.length === 1 && Math.abs(kids[0].getBoundingClientRect().height - 24) <= 0.5 && kids[0].closest('[aria-hidden="true"]') && !cell.querySelector('[data-calendar-tile]'))
      }).map((cell) => cell.querySelector('[data-calendar-day]')?.getAttribute('data-calendar-day'))
      return { busy: g.getAttribute('aria-busy'), cells: cells.length, bad }
    })
    check('LD1', ld.busy === 'true', `載入中格陣 aria-busy=${ld.busy}(規格 true)`)
    check('LD2', ld.cells >= 28 && ld.bad.length === 0, `${ld.cells} 格裡事件區不是「剛好一條高 24、aria-hidden 的骨架、沒有事件列」的:${ld.bad.slice(0, 5).join('、') || '0 格'}`)
    const today = await page.getByRole('button', { name: '今天,2026年7月15日 星期三', exact: true }).count()
    const counted = await page.getByRole('button', { name: /個事件/ }).count()
    check('LD3', today === 1 && counted === 0, `載入中日期名稱:今天「今天,2026年7月15日 星期三」×${today}、念到筆數的日期鈕 ${counted} 顆(規格:載入中不念筆數)`)
    // 點格內空白(骨架下方)仍會在這一天新增:示範殼的 onDateClick 開「新增事件」對話框
    const at = await page.evaluate(() => {
      const cell = document.querySelector('[role="grid"] button[data-calendar-day="2026-07-22"]')?.closest('[role="gridcell"]')
      const b = cell?.getBoundingClientRect()
      return b ? { x: b.left + b.width / 2, y: b.bottom - 8 } : null
    })
    if (!at) { check('LD4', false, '找不到 7/22 的格子'); return }
    await page.mouse.click(at.x, at.y)
    const opened = await page.getByRole('dialog', { name: '新增事件' }).waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)
    check('LD4', opened, `載入中點 7/22 格內空白:「新增事件」對話框 ${opened ? '打開了' : '沒打開'}(規格:載入中仍可點空白新增)`)
    if (opened) await page.keyboard.press('Escape')
  },
  // ── 窄寬度(calendar.spec.md「窄寬度」【Q8(定)、總帳更正 #8;門檻 60 = AI 推導】)──
  async narrow(mutate) {
    const p = await open(STORY.narrow, { label: '分割畫面側欄(窄寬)', mutate })
    if (!p) return
    const look = () => page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      return { col: g.querySelector('[role="gridcell"]').getBoundingClientRect().width, heads: [...g.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent),
        firsts: [...g.querySelectorAll('[data-calendar-day$="-01"]')].map((d) => d.textContent) }
    })
    const start = await look()
    const todayName = await page.getByRole('button', { name: '今天,2026年7月15日 星期三,0 個事件', exact: true }).count()
    check('NW1', start.col <= NARROW_MAX && start.heads.every((h) => [...h].length === 1) && start.firsts.length >= 1 && start.firsts.every((t) => t === '1') && todayName === 1,
      `側欄欄寬 ${start.col.toFixed(2)}:星期「${start.heads.join(' ')}」、1 號「${start.firsts.join(' / ')}」、今天的讀屏名稱照舊 ×${todayName}(規格:欄寬 ≤ ${NARROW_MAX} → 星期一字、1 號只寫「1」,名稱不受影響)`)
    // 掃 20 個欄寬(根節點寬 = 7 × 欄寬 + 左右外框 2),每個寬度先等 3 幀再連看 6 幀:狀態不得來回跳,而且「窄」⇔ 欄寬 ≤ 門檻
    const sweep = await page.evaluate(async ({ cols, samples }) => {
      const g = document.querySelector('[role="grid"]'), root = g.parentElement
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const state = () => {
        const heads = [...g.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)
        const firsts = [...g.querySelectorAll('[data-calendar-day$="-01"]')].map((d) => d.textContent)
        const narrowHead = heads.every((h) => [...h].length === 1), wideHead = heads.every((h) => [...h].length > 1)
        const narrowFirst = firsts.every((t) => t === '1'), wideFirst = firsts.every((t) => t !== '1')
        return { col: +g.querySelector('[role="gridcell"]').getBoundingClientRect().width.toFixed(3),
          narrow: narrowHead && narrowFirst ? true : wideHead && wideFirst ? false : null, key: `${heads.join('')}|${firsts.join('/')}` }
      }
      const out = []
      for (const col of cols) {
        root.style.width = `${7 * col + 2}px`
        for (let i = 0; i < 3; i++) await frame()
        const seen = []
        for (let i = 0; i < samples; i++) { await frame(); seen.push(state()) }
        out.push({ target: col, seen })
      }
      return out
    }, { cols: SWEEP_COLS, samples: SWEEP_SAMPLES })
    const unstable = sweep.filter((w) => new Set(w.seen.map((x) => `${x.key}@${x.col}`)).size > 1)
    const wrong = sweep.filter((w) => w.seen.some((x) => x.narrow === null || x.narrow !== (x.col <= NARROW_MAX)))
    const flips = sweep.filter((w, i) => i > 0 && w.seen[0].narrow !== sweep[i - 1].seen[0].narrow).map((w) => w.target)
    check('NW2', unstable.length === 0 && wrong.length === 0 && flips.length === 1 && flips[0] === NARROW_MAX + 1,
      `掃 ${sweep.length} 個欄寬(${SWEEP_COLS[0]}–${SWEEP_COLS.at(-1)}):連看 ${SWEEP_SAMPLES} 幀有變動的寬度 ${unstable.map((w) => w.target).join('、') || '0 個'}、`
      + `狀態與欄寬不符 ${wrong.map((w) => `${w.target}(${w.seen.map((x) => `${x.col}:${x.narrow}`).join(',')})`).slice(0, 3).join(';') || '0 個'}、切換點 ${flips.join('、') || '(沒有)'}`
      + `(規格:只看欄寬,≤ ${NARROW_MAX} 窄、${NARROW_MAX + 1} 起寬,只切一次、不來回跳)`)
    // NW3 掛載當下祖先在縮放(Dialog / Popover 開場 zoom-in-95):欄寬 MOUNT_SCALE_COL(> 門檻 = 寬)在 scale(MOUNT_SCALE) 下重新掛載,
    // 縮放留幾幀(ResizeObserver 第一次回報落在縮放期間,同開場動畫)再拿掉 → 狀態必須是寬版。縮放拿掉後版面尺寸沒變、觀察者不會再叫,
    // 所以量畫面寬的實作會一直卡在窄版。前提先量(量不到 = 儀器失效,不是產品裁決):真的重新掛載(新的格陣節點)、
    // 掛載那一刻格陣的畫面寬 / 版面寬 ≈ MOUNT_SCALE、日期格畫面寬 ≤ 門檻(量畫面寬的實作在這裡一定讀成窄)。
    const mounted = await page.evaluate(async ({ storyId, col, scale }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const channel = window.__STORYBOOK_ADDONS_CHANNEL__
      if (!channel) return { missing: 'window.__STORYBOOK_ADDONS_CHANNEL__(Storybook 預覽的頻道)' }
      const host = document.querySelector('#storybook-root')
      const before = document.querySelector('[role="grid"]')
      if (!host || !before) return { missing: '#storybook-root 或格陣' }
      // 欄寬寫在樣式表(重新掛載後的新根節點也吃得到),不寫在舊根節點的 style
      const sheet = document.createElement('style')
      sheet.textContent = `:has(> [role="grid"] [data-calendar-day]) { width: ${7 * col + 2}px !important; }`
      document.head.append(sheet)
      host.style.transformOrigin = '0 0'
      host.style.transform = `scale(${scale})`
      for (let i = 0; i < 3; i++) await frame()
      const atMount = new Promise((resolve) => {
        const mo = new MutationObserver(() => {
          const g = document.querySelector('[role="grid"]'), cell = g?.querySelector('[role="gridcell"]')
          if (!g || g === before || !cell) return
          mo.disconnect()
          resolve({ ratio: g.getBoundingClientRect().width / g.offsetWidth, cellVisual: cell.getBoundingClientRect().width })
        })
        mo.observe(document.body, { subtree: true, childList: true })
        setTimeout(() => { mo.disconnect(); resolve(null) }, 5000)
      })
      channel.emit('forceRemount', { storyId })
      const at = await atMount
      for (let i = 0; i < 6; i++) await frame()
      host.style.transform = ''
      host.style.transformOrigin = ''
      for (let i = 0; i < 10; i++) await frame()
      const g = document.querySelector('[role="grid"]')
      const heads = [...g.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)
      const firsts = [...g.querySelectorAll('[data-calendar-day$="-01"]')].map((d) => d.textContent)
      const narrow = heads.every((h) => [...h].length === 1) && firsts.every((t) => t === '1') ? true
        : heads.every((h) => [...h].length > 1) && firsts.every((t) => t !== '1') ? false : null
      const result = { remounted: g !== before, at, col: g.querySelector('[role="gridcell"]').getBoundingClientRect().width, heads, firsts, narrow }
      sheet.remove()
      return result
    }, { storyId: STORY.narrow, col: MOUNT_SCALE_COL, scale: MOUNT_SCALE })
    if (mounted.missing) { instrumentFails.push({ cell: 'NW3', detail: `頁面上沒有 ${mounted.missing}` }); return }
    if (!mounted.remounted || !mounted.at || !near(mounted.at.ratio, MOUNT_SCALE, 0.01) || !(mounted.at.cellVisual <= NARROW_MAX)) {
      instrumentFails.push({ cell: 'NW3', detail: `前提沒成立:重新掛載 ${mounted.remounted}、掛載時畫面寬 / 版面寬 ${mounted.at?.ratio?.toFixed(3) ?? '(沒等到新格陣)'}`
        + `(要 ${MOUNT_SCALE})、日期格畫面寬 ${mounted.at?.cellVisual?.toFixed(2) ?? '-'}(要 ≤ ${NARROW_MAX})` })
      return
    }
    check('NW3', near(mounted.col, MOUNT_SCALE_COL) && mounted.narrow === false,
      `欄寬 ${mounted.col.toFixed(2)} 在 scale(${MOUNT_SCALE}) 下掛載(當下畫面寬 ${mounted.at.cellVisual.toFixed(2)}、比例 ${mounted.at.ratio.toFixed(3)}),拿掉縮放後:`
      + `星期「${mounted.heads.join(' ')}」、1 號「${mounted.firsts.join(' / ')}」→ ${mounted.narrow === false ? '寬版' : mounted.narrow ? '窄版' : '混雜'}`
      + `(規格:斷點看版面上的欄寬,${MOUNT_SCALE_COL} > ${NARROW_MAX} = 寬版,掛載時祖先縮放不得讓它變窄)`)
  },
  // ── 跨日長條(calendar.spec.md「跨日長條」【C1、Q3(定)】、Cell 規則「命中區」【Q6(定)、總帳更正 #3】、「A11y 預設」格內那段)──
  // B1 團隊行事曆「Alex 休假」7/20–7/22 是一個元素,左緣 = 7/20 內容左緣、右緣 = 7/22 內容右緣(≈ 3 欄);
  // B4 點長條第 3 天(7/22)那一段:命中長條、開的是這個事件(內建詳情,浮層名稱 = 事件標題)、不會開「新增事件」;
  //    點單筆唯讀的公司假日(7/3):什麼都不開;B6 從長條涵蓋的第 2 天(7/21)按 F2,焦點落在同一條長條上(DOM 在第 1 天那格)。
  async bars(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 跨日長條', mutate })
    if (!p) return
    const geo = await page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      const r = (el) => el.getBoundingClientRect()
      const cell = (iso) => g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')
      const els = [...g.querySelectorAll('[data-calendar-covers]')].filter((el) => el.textContent.trim() === 'Alex 休假')
      const c0 = cell('2026-07-20'), c2 = cell('2026-07-22'), hol = [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === '公司創立紀念日')
      if (!els[0] || !c0 || !c2 || !hol) return null
      const b = r(els[0]), cs0 = getComputedStyle(c0), cs2 = getComputedStyle(c2), r2 = r(c2), h = r(hol)
      const at = { x: (r2.left + r2.right) / 2, y: b.top + b.height / 2 }
      const hit = document.elementFromPoint(at.x, at.y)
      return { count: els.length, left: b.left, right: b.right, colW: r(c0).width,
        expLeft: r(c0).left + parseFloat(cs0.borderLeftWidth) + parseFloat(cs0.paddingLeft), expRight: r2.right - parseFloat(cs2.borderRightWidth) - parseFloat(cs2.paddingRight),
        at, hitIsBar: Boolean(hit && els[0].contains(hit)), hitWhat: hit ? `${hit.tagName}[${hit.getAttribute('role') ?? ''}]` : null,
        holiday: { x: (h.left + h.right) / 2, y: h.top + h.height / 2 } }
    })
    if (!geo) { instrumentFails.push({ cell: 'B1', detail: '團隊行事曆找不到「Alex 休假」長條、7/20 / 7/22 的格子或公司假日(範例資料改了?)' }); return }
    check('B1', geo.count === 1 && near(geo.left, geo.expLeft) && near(geo.right, geo.expRight),
      `「Alex 休假」${geo.count} 個元素、左緣 ${geo.left.toFixed(2)} / 右緣 ${geo.right.toFixed(2)}(規格:一個元素,從 7/20 內容左緣 ${geo.expLeft.toFixed(2)} 畫到 7/22 內容右緣 ${geo.expRight.toFixed(2)};一欄 ${geo.colW.toFixed(2)})`)
    // 點擊:真的滑鼠點在 7/22 那一段的正中(不是程式化 click —— 量的是命中與冒泡)
    const newEvent = () => page.getByRole('dialog', { name: '新增事件' }).count()
    // 開的是這個事件 = 名字是「Alex 休假」的詳情浮層(2026-11-26 起示範殼用內建詳情 eventDetail,浮層名稱 = 事件標題;改前是示範殼自己的浮層、內文寫「7 月 20 日 – 7 月 22 日 · 全天」)
    const eventPopover = () => page.getByRole('dialog', { name: 'Alex 休假' }).count()
    const settle = () => page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n >= 10 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) }))
    await page.mouse.click(geo.at.x, geo.at.y)
    await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    await settle()
    const barResult = { popover: await eventPopover(), create: await newEvent() }
    check('B4-bar', geo.hitIsBar && barResult.popover === 1 && barResult.create === 0,
      `點「Alex 休假」7/22 那一段:命中 ${geo.hitIsBar ? '長條' : geo.hitWhat}、事件浮層 ${barResult.popover} 個、「新增事件」${barResult.create} 個(規格:開這個事件、阻止冒泡,不會在 7/20 或 7/22 新增)`)
    // 關掉剛開的(對照組可能兩個都開了),等收起動畫走完、對話框 / 浮層都不在了再點下一個。
    // 一次按一下、等那一層收完再按下一下:收起動畫中的浮層還在 Radix 的層裡,連按的第二下會被它接走(2026-11-25 實測:事件浮層的錨點改成
    // onEventClick 交出的那一段之後,收起時焦點回到長條,連按兩下只關得掉浮層、「新增事件」對話框留著)
    let cleared = false
    for (let i = 0; i < 4 && !cleared; i++) {
      const before = await page.locator('[role="dialog"]').count()
      await page.keyboard.press('Escape')
      await page.waitForFunction((n) => document.querySelectorAll('[role="dialog"]').length < n, before, { timeout: 1500 }).catch(() => {})
      cleared = (await page.locator('[role="dialog"]').count()) === 0
    }
    if (!cleared) { instrumentFails.push({ cell: 'B4-readonly', detail: '按 Esc 後對話框 / 浮層 3 秒內沒收起,量不到「點唯讀事件什麼都不開」' }); return }
    await page.mouse.click(geo.holiday.x, geo.holiday.y)
    await settle()
    const ro = { dialogs: await page.getByRole('dialog').count() }
    check('B4-readonly', ro.dialogs === 0, `點單筆唯讀的「公司創立紀念日」:開了 ${ro.dialogs} 個對話框 / 浮層(規格:什麼都不發生 —— 不開事件、也不在 7/3 新增)`)
    // F2 從長條涵蓋的第 2 天進格
    await page.locator('button[data-calendar-day="2026-07-21"]').focus()
    await page.keyboard.press('F2')
    const f2 = await page.evaluate(() => {
      const a = document.activeElement
      return { tile: Boolean(a?.hasAttribute('data-calendar-tile')), title: a?.textContent?.trim() ?? null, at: a?.getAttribute('data-calendar-day') ?? null }
    })
    check('B6', f2.tile && f2.title === 'Alex 休假', `7/21 按 F2:焦點在 ${f2.tile ? `事件「${f2.title}」` : `日期 ${f2.at}`}(規格:從長條涵蓋的每一天進格都走得到它)`)
  },
  // ── 格子的滑過與格內鍵盤(calendar.spec.md「Cell 規則」滑過條【CELL-HOVER(定)】與命中區表、「跨日長條」滑過 / 點擊 / 焦點條、「A11y 預設」格內那段;
  //    2026-11-25 格內互動那一包、2026-11-26 格子的滑過底色拿掉)。團隊行事曆:「Alex 休假」7/20–7/22 一條長條(DOM 在 7/20)、7/3 單筆唯讀的「公司創立紀念日」。
  // HV1 格子底色不變:指標在 7/3 格內空白處、長條 7/20 / 7/21 / 7/22 三段正中、唯讀的「公司創立紀念日」上 —— 每一次整個格陣每一格的底色
  //     都等於指標在格陣外時的底色。前提(每一點各量):指標真的在那裡(該點的目標元素 :hover 成立)—— 指標不在就量不出「變不變」,記儀器失效;
  //     「量得到變色」由 MUTANTS 的對照組證明(注入格子的滑過底色 → 必紅)。
  // HV2 空白處游標是手形:7/3 格內空白處命中的元素在 7/3 那一格裡、不在任何事件 / 按鈕裡,它的游標 = pointer;日期鈕的游標也是 pointer
  //     (命中區表:格內空白與日期鈕點了都在這天新增 → 手形,hit-area-canonical.md 滑過原則一-3);唯讀列的箭頭由 NE3 量。
  // HV3 點擊落在指標底下那天:真滑鼠點 7/22 格子的內距(長條 DOM 所在的是 7/20),開「新增事件」、日期欄 = 2026/07/22
  //    (示範殼 onDateClick 把那一天帶進 DatePicker,DatePicker 預設顯示 YYYY/MM/DD,date-picker.tsx formatDate);前提:那一點命中的就是 7/22 格子本身。
  // E4  7/21 F2 進到長條後的焦點框往外(outline-offset > 0);
  // KE1 7/21 F2 進長條 → Esc → 焦點回 7/21 的日期鈕(不是長條 DOM 所在的 7/20);KE2 7/22 F2 進格 → 再 F2 → 回 7/22;
  // KE3 真滑鼠點長條 7/22 那段(示範殼開事件浮層)→ Esc 關浮層、焦點還給長條 → 再 Esc → 回 7/22(滑鼠進格那一天 = 按下去的那一段)。
  async interaction(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 滑過與格內鍵盤', mutate })
    if (!p) return
    await page.mouse.move(0, 0)
    await frames()
    // 每一格的底色(依日子);rest = 指標在格陣外時的那一份
    const cellBgs = () => page.evaluate(() => {
      const stopOf = (c) => (c.matches('[data-calendar-day]') ? c : c.querySelector('[data-calendar-day]'))
      return Object.fromEntries([...document.querySelectorAll('[role="grid"] [role="gridcell"]')]
        .map((c) => [stopOf(c)?.getAttribute('data-calendar-day') ?? '?', getComputedStyle(c).backgroundColor]))
    })
    const rest = await cellBgs()
    const geo = await page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      const cell = (iso) => g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')?.getBoundingClientRect()
      const piece = (title) => [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === title)?.getBoundingClientRect()
      const bar = piece('Alex 休假'), hol = piece('公司創立紀念日'), c3 = cell('2026-07-03'), c22 = cell('2026-07-22')
      const days = ['2026-07-20', '2026-07-21', '2026-07-22'].map((iso) => ({ iso, c: cell(iso) }))
      if (!bar || !hol || !c3 || !c22 || days.some((d) => !d.c)) return null
      // 格子內距裡的一點(格子四邊內距 4、右 / 下格線 1;右下角往內 3 = 內距的正中)—— 不在任何事件列、按鈕或「+N」上
      return { days: days.map(({ iso, c }) => ({ iso, x: (c.left + c.right) / 2, y: bar.top + bar.height / 2 })),
        holiday: { x: (hol.left + hol.right) / 2, y: hol.top + hol.height / 2 }, blank3: { x: c3.right - 3, y: c3.bottom - 3 }, pad22: { x: c22.right - 3, y: c22.bottom - 3 } }
    })
    if (!geo) { instrumentFails.push({ cell: 'HV1', detail: '團隊行事曆找不到「Alex 休假」長條、公司創立紀念日或 7/3、7/20–7/22 的格子(範例資料改了?)' }); return }
    // 指標所在點:命中的元素、它在哪一天的格子裡、是不是格子本身 / 在事件或按鈕裡、游標,以及「預期的目標」:hover 成立沒有
    const probe = ({ x, y }, expect) => page.evaluate(({ x, y, expect }) => {
      const stopOf = (c) => (c?.matches('[data-calendar-day]') ? c : c?.querySelector('[data-calendar-day]'))
      const hit = document.elementFromPoint(x, y)
      const cell = hit?.closest('[role="gridcell"]')
      const g = document.querySelector('[role="grid"]')
      const target = expect.title
        ? [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === expect.title && el.getBoundingClientRect().left <= x && x <= el.getBoundingClientRect().right)
        : g.querySelector(`[data-calendar-day="${expect.day}"]`)?.closest('[role="gridcell"]')
      return { day: stopOf(cell)?.getAttribute('data-calendar-day') ?? null, isCell: hit === cell, inPiece: Boolean(hit?.closest('[data-calendar-covers], button, [role="button"]')),
        cursor: hit ? getComputedStyle(hit).cursor : null, hovered: Boolean(target?.matches(':hover')) }
    }, { x, y, expect })
    const spots = [{ label: '7/3 格內空白處', at: geo.blank3, expect: { day: '2026-07-03' } },
      ...geo.days.map((d) => ({ label: `「Alex 休假」${d.iso.slice(5)} 那段`, at: d, expect: { title: 'Alex 休假' } })),
      { label: '唯讀的「公司創立紀念日」', at: geo.holiday, expect: { title: '公司創立紀念日' } }]
    const changed = []
    for (const s of spots) {
      await page.mouse.move(s.at.x, s.at.y)
      await frames()
      const pr = await probe(s.at, s.expect)
      if (!pr.hovered) { instrumentFails.push({ cell: 'HV1', detail: `前提沒成立:指標移到${s.label},那個目標的 :hover 不成立 —— 指標不在那裡就量不出格子變不變` }); continue }
      const now = await cellBgs()
      changed.push({ label: s.label, diff: Object.keys(rest).filter((d) => now[d] !== rest[d]).map((d) => `${d.slice(5)} ${rest[d]} → ${now[d]}`) })
    }
    if (changed.length === spots.length) check('HV1', changed.every((c) => c.diff.length === 0),
      `指標在 ${changed.map((c) => `${c.label} → 底色變了 ${c.diff.join('、') || '0 格'}`).join(';')}(規格:日期格滑過不變色【CELL-HOVER(定)】)`)
    // HV2 空白處與日期鈕的游標
    await page.mouse.move(geo.blank3.x, geo.blank3.y)
    await frames()
    const blank = await probe(geo.blank3, { day: '2026-07-03' })
    const dayCursor = await page.evaluate(() => { const b = document.querySelector('[role="grid"] button[data-calendar-day="2026-07-03"]'); return b ? getComputedStyle(b).cursor : null })
    if (blank.day !== '2026-07-03' || blank.inPiece) instrumentFails.push({ cell: 'HV2', detail: `前提沒成立:7/3 格內空白處那一點命中的在 ${blank.day ?? '(格陣外)'}${blank.inPiece ? '的事件 / 按鈕裡' : ''} —— 量的不是格子空白處` })
    else check('HV2', blank.cursor === 'pointer' && dayCursor === 'pointer',
      `7/3 格內空白處游標 ${blank.cursor}、日期鈕游標 ${dayCursor}(規格:點了都在這天新增 → 手形 pointer)`)
    await page.mouse.move(0, 0)
    await frames()
    // 格內鍵盤:焦點所在的是不是長條、在哪一天的日期停靠點、焦點框
    const active = () => page.evaluate(() => {
      const a = document.activeElement
      const cs = a ? getComputedStyle(a) : null
      return { tile: Boolean(a?.hasAttribute('data-calendar-tile')), title: a?.textContent?.trim() ?? null, day: a?.getAttribute('data-calendar-day') ?? null,
        ring: cs ? { offset: parseFloat(cs.outlineOffset), width: parseFloat(cs.outlineWidth), style: cs.outlineStyle } : null }
    })
    const where = (a) => a.day ?? (a.tile ? `事件「${a.title}」` : '(格陣外)')
    await page.locator('button[data-calendar-day="2026-07-21"]').focus()
    await page.keyboard.press('F2')
    const in21 = await active()
    if (!(in21.tile && in21.title === 'Alex 休假')) {
      instrumentFails.push({ cell: 'KE1', detail: `7/21 按 F2 焦點沒落在「Alex 休假」(在 ${where(in21)})—— 進不了格就量不到出格(B6 那一格會紅)` })
    } else {
      const r = in21.ring
      check('E4', Boolean(r) && r.style !== 'none' && r.width > 0 && r.offset > 0, `F2 進到長條後焦點框:${r?.style} ${r?.width}px、offset ${r?.offset}px(規格:往外 = offset > 0,畫在整段上)`)
      await page.keyboard.press('Escape')
      const back = await active()
      check('KE1', back.day === '2026-07-21', `7/21 F2 進長條、按 Esc:焦點回 ${where(back)}(規格:回進格那一天 7/21,不是長條起點 7/20)`)
    }
    await page.locator('button[data-calendar-day="2026-07-22"]').focus()
    await page.keyboard.press('F2')
    const in22 = await active()
    await page.keyboard.press('F2')
    const back22 = await active()
    check('KE2', in22.tile && in22.title === 'Alex 休假' && back22.day === '2026-07-22',
      `7/22 F2 進格(焦點在 ${where(in22)})、再按 F2:回 ${where(back22)}(規格:F2 也回進格那一天 7/22)`)
    // 滑鼠點長條 7/22 那段 → 示範殼的事件浮層(Esc 關掉、焦點還給長條,_calendar-demo.tsx returnFocusToOpener)→ 再 Esc 出格
    await page.mouse.click(geo.days[2].x, geo.days[2].y)
    // 開了、而且焦點已經進到浮層裡(浮層開場時把焦點搬進去;還沒搬進去就按 Esc,那一下由還握著焦點的長條出格,量的就不是「關浮層再出格」)
    // 再等浮層的開場動畫播完(等那個元素本身靜止,不睡固定時間 —— M32 第四問):焦點一進浮層就按的 Esc 偶爾整下不見
    //(2026-11-25 本機:selftest 這一區 6 次裡 3 次、單獨重播 8 次裡 1 次 —— 浮層還開著、焦點還在浮層裡;原因沒查到),量的就不是「關浮層再出格」
    const opened = await page.waitForFunction(() => {
      const d = document.activeElement?.closest('[role="dialog"]')
      return Boolean(d?.textContent?.includes('Alex 休假')) && d.getAnimations({ subtree: true }).every((a) => a.playState !== 'running')
    }, null, { timeout: 3000 }).then(() => true, () => false)
    await frames(2)
    await page.mouse.move(0, 0)
    await page.keyboard.press('Escape')
    const closed = await page.waitForFunction(() => !document.querySelector('[role="dialog"]') && document.activeElement?.hasAttribute('data-calendar-tile'), null, { timeout: 3000 }).then(() => true, () => false)
    if (!opened || !closed) {
      instrumentFails.push({ cell: 'KE3', detail: `點長條 7/22 那段:事件浮層${opened ? '有開' : '沒開'}、Esc 後${closed ? '' : '沒有'}收起並把焦點還給長條 —— 量不到滑鼠進格之後的出格` })
    } else {
      await page.keyboard.press('Escape')
      const back = await active()
      check('KE3', back.day === '2026-07-22', `滑鼠點長條 7/22 那段、關掉事件浮層、按 Esc:焦點回 ${where(back)}(規格:回進格那一天 = 按下去的那一段 7/22)`)
    }
    // HV3 點擊落在指標底下那天:7/22 格子的內距(長條 DOM 所在的是 7/20)
    const padHit = await probe(geo.pad22, { day: '2026-07-22' })
    if (padHit.day !== '2026-07-22' || !padHit.isCell) {
      instrumentFails.push({ cell: 'HV3', detail: `前提沒成立:7/22 格子內距那一點命中的是 ${padHit.day ?? '(格陣外)'}${padHit.isCell ? '的格子本身' : '格子裡的別的元素'} —— 量的不是「點格子空白處」` })
      return
    }
    await page.mouse.click(geo.pad22.x, geo.pad22.y)
    const dialog = page.getByRole('dialog', { name: '新增事件' })
    const created = await dialog.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)
    // 日期欄的字:DatePicker 預設顯示 YYYY/MM/DD(date-picker.tsx formatDate 的預設那一支)—— 期望值由被點的那一天現算
    const shown = created ? await dialog.evaluate((d) => `${d.innerText} ${[...d.querySelectorAll('input')].map((i) => i.value).join(' ')}`) : ''
    const days = [...shown.matchAll(/\d{4}\/\d{2}\/\d{2}/gu)].map((m) => m[0])
    check('HV3', created && days.length > 0 && days.every((d) => d === '2026-07-22'.replaceAll('-', '/')),
      `真滑鼠點 7/22 格子內距:「新增事件」${created ? '打開了' : '沒打開'}、日期欄 ${days.join('、') || '(讀不到日期)'}(規格:在指標底下那一天 2026/07/22 新增)`)
    if (created) await page.keyboard.press('Escape')
  },
  // HV4 週列的捲軸(Radix ScrollArea,在格陣裡、蓋在最右欄的格子上;設計原則「事件顏色類別語意」h-84,週列在捲動區裡捲)不是格子 ——
  //     在它上面按下去是捲動、不會新增(calendar.spec.md「命中區」:手形的範圍 = 命中區;hit-area-canonical.md「一、可以操作的東西」第 3 條):
  //     指標停在捲軸滑塊上,那一點的游標不是手形。前提:捲軸浮現、底下(外框比對)有一格,同一高度往左 8px 進到那一格時游標是手形
  //     (先證明量得到「手形」)。2026-11-26 前這一區量的是「捲動 / 捲軸 / 拖滑塊時格子亮不亮」(HV3–HV5),格子的滑過底色拿掉後只剩游標這一條。
  async scrollbar(mutate) {
    const p = await open(STORY.short, { label: '設計原則 h-84 週列捲軸', mutate })
    if (!p) return
    const vp = await page.evaluate(() => { const r = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + 50 } : null })
    if (!vp) { instrumentFails.push({ cell: 'HV4', detail: '找不到週列的捲動區' }); return }
    // 那一點底下的格子(格子外框比對,與元件的命中測試無關)與那一點命中元素的游標
    const state = (at) => page.evaluate(({ x, y }) => {
      const stopOf = (c) => (c.matches('[data-calendar-day]') ? c : c.querySelector('[data-calendar-day]'))
      const under = [...document.querySelectorAll('[role="grid"] [role="gridcell"]')].find((c) => { const b = c.getBoundingClientRect(); return x >= b.left && x < b.right && y >= b.top && y < b.bottom })
      const hit = document.elementFromPoint(x, y)
      return { under: under ? stopOf(under)?.getAttribute('data-calendar-day') ?? null : null, cursor: hit ? getComputedStyle(hit).cursor : null, inCell: Boolean(hit?.closest('[role="gridcell"]')) }
    }, at)
    // 捲軸只在指標進到捲動區時畫出來(ScrollArea 的 Radix type="hover",只聽 pointerenter / pointerleave):指標從格陣外分段移進週列,
    // 再滾一下週列(2026-11-26 前這一區先量捲動,捲軸是在滾輪之後找的),等捲軸滑塊本身出現(不睡固定時間,M32 第四問)
    await page.mouse.move(0, 0)
    await frames()
    await page.mouse.move(vp.x, vp.y, { steps: 4 })
    await page.mouse.wheel(0, 61)
    await page.waitForFunction(() => {
      const t = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]')?.firstElementChild?.getBoundingClientRect()
      return Boolean(t && t.height > 0)
    }, null, { timeout: 3000 }).catch(() => {})
    await frames()
    const bar = await page.evaluate(() => {
      const sb = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport] ~ [data-orientation="vertical"]')
      const thumb = sb?.firstElementChild
      if (!sb || !thumb) return null
      const s = sb.getBoundingClientRect(), t = thumb.getBoundingClientRect()
      return s.width > 0 && t.height > 0 ? { left: s.left, x: (t.left + t.right) / 2, y: (t.top + t.bottom) / 2 } : null
    })
    if (!bar) { instrumentFails.push({ cell: 'HV4', detail: '指標在週列上時格陣裡沒有浮現捲軸(範例改高了、週列不再捲?)—— 量不到捲軸上的游標' }); await page.mouse.move(0, 0); return }
    const onBar = { x: bar.x, y: bar.y }, besideBar = { x: bar.left - 8, y: bar.y }
    await page.mouse.move(besideBar.x, besideBar.y)
    await frames()
    const beside = await state(besideBar)
    await page.mouse.move(onBar.x, onBar.y)
    await frames()
    const still = await state(onBar)
    await page.mouse.move(0, 0)
    if (!(beside.under && beside.inCell && beside.cursor === 'pointer')) {
      instrumentFails.push({ cell: 'HV4', detail: `前提沒成立:捲軸左邊 8px(格子 ${beside.under} 裡)游標 ${beside.cursor}(要 pointer)—— 量不到「手形」就量不出「不是手形」` })
    } else if (still.under !== beside.under) {
      // 捲軸底下(外框比對)沒有那一格 = 量的不是「捲軸蓋在格子上」的情況:儀器失效,不讀成通過
      instrumentFails.push({ cell: 'HV4', detail: `前提沒成立:捲軸滑塊底下是 ${still.under}、同一高度往左 8px 是 ${beside.under} —— 捲軸沒有蓋在那一格上` })
    } else {
      check('HV4', still.cursor !== 'pointer' && !still.inCell,
        `指標停在捲軸滑塊上(底下是 ${still.under}):游標 ${still.cursor}、命中${still.inCell ? '在格子裡' : '不在格子裡'};同一高度往左 8px 進到格子裡游標 ${beside.cursor}(規格:捲軸不是格子,按下去是捲動、不新增 → 不是手形)`)
    }
  },
  // ── 斷開端直角(【Q3(定)】;斷開 = 換週、可見範圍外、被藏起來的日子;calendar-layout.ts CalendarEventSegment)──
  // 量 computed border-radius 四個角:斷開那一端 = 0、真起訖那一端 > 0。三則:季度規劃(換週 + 延續到下個月)、元件檢閱器週三起 + 隱藏週末
  //(週末在一列中間 → 週五、週一相鄰兩欄,中間切開)、客服排班(週日起、週五收週一起)。
  async segments(mutate) {
    // 比對標題:有時段的列文字是「開始時間 + 標題」,拿掉時間那一段再比(事件長相那一包起)
    const radiiOf = (title) => page.evaluate((t) => [...document.querySelectorAll('[role="grid"] [data-calendar-covers]')]
      .filter((el) => { const time = el.querySelector('[data-calendar-time]'); return (time ? el.textContent.replace(time.textContent, '') : el.textContent).trim() === t })
      .map((el) => { const cs = getComputedStyle(el), b = el.getBoundingClientRect(); return { covers: el.getAttribute('data-calendar-covers'), left: b.left, right: b.right, top: b.top,
        tl: parseFloat(cs.borderTopLeftRadius), bl: parseFloat(cs.borderBottomLeftRadius), tr: parseFloat(cs.borderTopRightRadius), br: parseFloat(cs.borderBottomRightRadius) } })
      .sort((a, b) => a.covers.localeCompare(b.covers)), title)
    const ends = (x) => `${x.covers.split(' ')[0]}…${x.covers.split(' ').at(-1)} 左 ${x.tl}/${x.bl} 右 ${x.tr}/${x.br}`
    const shape = (x, left, right) => x && (left ? x.tl > 0 && x.bl > 0 : x.tl === 0 && x.bl === 0) && (right ? x.tr > 0 && x.br > 0 : x.tr === 0 && x.br === 0)
    const q = await open(STORY.quarter, { label: '季度規劃 斷開端', mutate })
    if (q) {
      const sprint = await radiiOf('設計衝刺'), plan = await radiiOf('Q3 規劃週'), budget = await radiiOf('年度預算編列'), single = await radiiOf('預算定稿會議')
      check('B2-week', sprint.length === 2 && shape(sprint[0], true, false) && shape(sprint[1], false, true) && plan.length === 1 && shape(plan[0], true, false)
        && budget.length === 1 && shape(budget[0], true, true) && single.length === 1 && shape(single[0], true, true),
        `「設計衝刺」${sprint.map(ends).join(';')};「Q3 規劃週」${plan.map(ends).join(';')};「年度預算編列」${budget.map(ends).join(';')};單日「預算定稿會議」${single.map(ends).join(';')}`
        + '(規格:換週切成兩段、內側兩端直角;延續到下個月那一端直角;真起訖圓角)')
    }
    const insp = await open(STORY.inspector, { label: 'Inspector 週三起 + 隱藏週末', args: 'weekStartsOn:3;hideWeekends:!true', mutate })
    if (insp) {
      const move = await radiiOf('機房搬遷')
      const sameRow = move.length === 2 && near(move[0].top, move[1].top) && near(move[1].left - move[0].right, 2 * SPEC.gap + 1, 1)
      check('B2-hidden', move.length === 2 && sameRow && shape(move[0], true, false) && shape(move[1], false, true),
        `「機房搬遷」週五–週一、週末在一列中間:${move.map(ends).join(';')}、同一列相鄰兩欄 ${sameRow}(規格:被藏的週末把長條切成兩段,週五收、週一起,內側兩端直角)`)
    }
    const wk = await open(STORY.weekdays, { label: '客服排班 跨週末長條', mutate })
    if (wk) {
      const phone = await radiiOf('電話系統移轉')
      check('B2-weekend', phone.length === 2 && shape(phone[0], true, false) && shape(phone[1], false, true),
        `「電話系統移轉」週五–週一(隱藏週末、週日起):${phone.map(ends).join(';')}(規格:週五收、週一起,兩端直角)`)
    }
  },
  // ── 每格放幾列依格高(calendar.spec.md「每格筆數與「+N」」【C3、總帳更正 #7】;k 的算式【AI 推導】)──
  // 產品上線週 7/15(7 筆、車道 0…6):把週列的格高逐一設成 ROW_SWEEP,每個格高等 3 幀、連看 4 幀,量 ——
  // B3-k:畫出來的筆數與「+N」照規格算式(本閘自己照規格寫的 specRows)由量到的格高推:k ≥ 7 全畫、沒有「+N」;否則畫 k − 1 筆、N = 8 − k(元件傳進版面的 k
  //       是不是「量到的格高算出來的那個值」—— M32 參數邊界);4 幀狀態不變(不來回跳)。
  // B3-fit:每一格畫出來的列都是 24、都在格子內容框裡(沒有被裁);出現「+N」的格,「+N」下面放不下另一列(k 沒有少算)。
  // B3-exact:剛好放滿(格高 229 = 7 列)時不出現「+N」。
  // 前提(量不到 = 儀器失效):每個格高真的設進去了(±0.5)、掃描裡同時有出現「+N」與沒有「+N」的格高。
  async rowsFit(mutate) {
    const p = await open(STORY.launch, { label: '產品上線週 格高掃描', mutate })
    if (!p) return
    const sweep = await page.evaluate(async ({ targets, day, weeks }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const g = document.querySelector('[role="grid"]'), root = g.parentElement
      const cells = () => [...g.querySelectorAll('[role="gridcell"]')]
      const cellOf = (iso) => g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')
      const area = g.querySelector('[data-radix-scroll-area-viewport]')
      const base = { root: root.getBoundingClientRect().height, area: area.getBoundingClientRect().height }
      const state = () => {
        const c = cellOf(day)
        const more = c?.querySelector('[data-calendar-more]')
        const bad = []
        for (const cell of cells()) {
          const list = cell.children[1]
          if (!list) continue
          const cs = getComputedStyle(cell), cr = cell.getBoundingClientRect()
          const contentBottom = cr.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom)
          for (const row of list.children) {
            const rr = row.getBoundingClientRect()
            if (Math.abs(rr.height - 24) > 0.5 || rr.bottom > contentBottom + 0.5) bad.push(`${cell.querySelector('[data-calendar-day]')?.getAttribute('data-calendar-day')} 列高 ${rr.height.toFixed(1)}、底 ${rr.bottom.toFixed(1)} > 內容底 ${contentBottom.toFixed(1)}`)
          }
          const m = list.querySelector('[data-calendar-more]')
          if (m) {
            const room = contentBottom - m.getBoundingClientRect().bottom
            if (room >= 28 - 0.5) bad.push(`${cell.querySelector('[data-calendar-day]')?.getAttribute('data-calendar-day')}「+N」下面還有 ${room.toFixed(1)}`)
          }
        }
        return { h: parseFloat(getComputedStyle(c).height), drawn: g.querySelectorAll(`[data-calendar-covers~="${day}"]`).length,
          n: more ? Number(/\d+/.exec(more.textContent)?.[0] ?? NaN) : 0, bad }
      }
      const out = []
      for (const t of targets) {
        root.style.height = `${base.root - base.area + weeks * t}px`
        for (let i = 0; i < 3; i++) await frame()
        const seen = []
        for (let i = 0; i < 4; i++) { await frame(); seen.push(state()) }
        out.push({ target: t, seen })
      }
      return out
    }, { targets: ROW_SWEEP, day: LAUNCH_DAY, weeks: p.weekHeights.length })
    // 依規格算式,這一 7 筆的格在每個格高該畫幾筆、N 是多少
    const expect = (h) => { const k = specRows(h); return k >= LAUNCH_DAY_TOTAL ? { k, drawn: LAUNCH_DAY_TOTAL, n: 0 } : { k, drawn: k - 1, n: LAUNCH_DAY_TOTAL - (k - 1) } }
    // 前提(儀器):每個格高真的設進去了;掃描的格高照規格同時涵蓋「該出現「+N」」與「剛好放滿、不該出現」兩種(看期望值,不看量到的 —— 量到的是被驗的東西)
    const set = sweep.filter((s) => s.seen.every((x) => near(x.h, s.target)))
    const withMore = ROW_SWEEP.some((t) => expect(t).n > 0), without = ROW_SWEEP.some((t) => expect(t).n === 0)
    if (set.length !== sweep.length || !withMore || !without) {
      instrumentFails.push({ cell: 'B3', detail: `前提沒成立:格高設進去的 ${set.length}/${sweep.length}(${sweep.filter((s) => !set.includes(s)).map((s) => `${s.target}→${s.seen[0].h}`).join('、')})、掃描涵蓋該有「+N」${withMore}、該沒有「+N」${without}` })
      return
    }
    const kBad = sweep.filter((s) => s.seen.some((x) => { const e = expect(x.h); return x.drawn !== e.drawn || x.n !== e.n }) || new Set(s.seen.map((x) => `${x.drawn}/${x.n}`)).size > 1)
    const fmt = (s) => { const x = s.seen[0], e = expect(x.h); return `格高 ${x.h}:k ${e.k}、畫 ${s.seen.map((y) => y.drawn).join('/')}(應 ${e.drawn})、N ${s.seen.map((y) => y.n).join('/')}(應 ${e.n})` }
    check('B3-k', kBad.length === 0, `${sweep.length} 個格高:${(kBad.length ? kBad : sweep.filter((_, i) => i % 4 === 0)).map(fmt).join(';')}(規格:k 由量到的格高算,m > k 時畫 k − 1 筆、第 k 列換「+N」)`)
    const fitBad = sweep.flatMap((s) => s.seen[0].bad.map((b) => `@${s.target} ${b}`))
    check('B3-fit', fitBad.length === 0, `每格的列都在格子裡、「+N」下面放不下另一列:${fitBad.slice(0, 3).join(';') || '全部成立'}(規格:列高 24、不裁不壓;剛好放不下才換「+N」)`)
    const exact = sweep.find((s) => s.target === 229)
    check('B3-exact', Boolean(exact) && exact.seen.every((x) => x.n === 0 && x.drawn === LAUNCH_DAY_TOTAL),
      `格高 229(剛好放滿 7 列):畫 ${exact?.seen[0].drawn}、N ${exact?.seen[0].n}(規格:剛好放滿不出現「+N」)`)
  },
  // ── 深色主題長條不透出格線(決策總帳 2026-11-25 已定 (9);研究 BARM-X1:深色類別淡底 step-1 半透明)──
  // 「Alex 休假」長條在 7/20 與 7/21 交界那條格線上:格線那一個 px 的顏色 = 旁邊 3px 長條內的顏色(每個色版差 ≤ 2);兩個主題都量。
  // 前提:長條下方(列與列的縫)同一條格線看得到(跟旁邊的格子底差 ≥ 4)—— 證明量的那個 x 真的是格線。
  async underlay(mutate) {
    for (const theme of ['light', 'dark']) {
      const p = await open(STORY.team, { label: `團隊行事曆 長條底 ${theme}`, mutate, theme })
      if (!p) continue
      const geo = await page.evaluate(() => {
        const g = document.querySelector('[role="grid"]')
        const bar = [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === 'Alex 休假')
        const c0 = g.querySelector('[data-calendar-day="2026-07-20"]')?.closest('[role="gridcell"]')
        if (!bar || !c0) return null
        const b = bar.getBoundingClientRect(), c = c0.getBoundingClientRect()
        return { lineX: Math.floor(c.right - 0.5), inY: Math.floor(b.top + 3), outY: Math.floor(b.bottom + 2) }
      })
      if (!geo) { instrumentFails.push({ cell: `B7-${theme}`, detail: '找不到「Alex 休假」長條或 7/20 的格子' }); continue }
      const px = async (y) => {
        const png = PNG.sync.read(await page.screenshot({ clip: { x: geo.lineX - 3, y, width: 7, height: 1 } }))
        const at = (i) => [png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2]]
        return { left: at(0), line: at(3), right: at(6) }
      }
      const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
      const inBar = await px(geo.inY), below = await px(geo.outY)
      if (diff(below.line, below.left) < 4) { instrumentFails.push({ cell: `B7-${theme}`, detail: `長條下方的格線看不到(格線 ${below.line} / 旁邊 ${below.left})—— 量的 x 不是格線` }); continue }
      const d = Math.max(diff(inBar.line, inBar.left), diff(inBar.line, inBar.right))
      check(`B7-${theme}`, d <= 2, `${theme} 長條裡格線那一 px ${inBar.line}、左右 3px ${inBar.left} / ${inBar.right}(差 ${d});長條下方格線 ${below.line} vs 格子底 ${below.left}(規格:長條蓋住格線,差 ≤ 2)`)
    }
  },
  // ── renderEventTile 回傳過大的內容(calendar.tsx MonthEventPieceShell 的 overflow-clip;2026-11-25 規格核對必修)──
  // 格子只裁上下、不裁左右(讓長條畫過去),所以「一段事件不畫出自己的外形」由外層負責。情境(不是突變,正式跑與 selftest 一樣套):
  // 「唯讀日期 × 自訂事件方塊」的自訂內容(Tag sm,7/2)被撐成 60 高、400 寬、不換行、洋紅底 = consumer 回傳比一列高 / 比這一段寬又不自己截斷的內容。
  // CT1 外層底下一列的位置(外層底 + 列距 4 + 半列 12):點到的不是這個方塊、畫面上沒有洋紅(多出的高度不疊到下一列、不接走下一列的點擊)。
  // CT2 隔壁格(7/3)正中、外層那一列的高度:點到的不是這個方塊、沒有洋紅(多出的寬度不畫進隔壁格)。
  // CT3 F2 進這個方塊後,外層自己的焦點框照樣畫在外面:外層左緣外 3px、底緣外 3px 兩點聚焦前後顏色變了(差 ≥ 40)—— 裁切不得連焦點框一起裁掉。
  // 前提(量不到 = 儀器失效):內容的版面尺寸真的比外層高 / 寬到蓋得到兩個量點、隔壁格存在。
  async customTile(mutate) {
    const p = await open(STORY.customTile, { label: '唯讀日期 × 自訂事件方塊 內容過大', mutate, scenarioCss: OVERSIZE_TILE_CSS })
    if (!p) return
    // story 的 play 會聚焦這個方塊並按 Enter:先讓焦點離開、指標移走,聚焦前的顏色才是沒有焦點框的樣子
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.mouse.move(0, 0)
    const settle = () => page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n >= 10 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) }))
    await settle()
    const geo = await page.evaluate(() => {
      const tile = document.querySelector('[role="grid"] [data-calendar-covers]')
      const content = tile?.firstElementChild
      const cell = tile?.closest('[role="gridcell"]')
      const next = cell?.nextElementSibling
      if (!(content instanceof HTMLElement) || !next?.matches('[role="gridcell"]')) return null
      const t = tile.getBoundingClientRect(), n = next.getBoundingClientRect()
      const below = { x: t.left + 8, y: t.bottom + 4 + 12 }
      const side = { x: (n.left + n.right) / 2, y: t.top + t.height / 2 }
      const hit = (pt) => { const el = document.elementFromPoint(pt.x, pt.y); return { inTile: Boolean(el && tile.contains(el)), what: el ? `${el.tagName.toLowerCase()}[${el.getAttribute('role') ?? ''}]` : null } }
      // 內容的版面尺寸(offsetWidth / offsetHeight 不受祖先裁切影響):前提是它真的伸到兩個量點
      return { day: cell.getAttribute('data-calendar-day'), nextDay: next.getAttribute('data-calendar-day'),
        tile: { left: t.left, right: t.right, top: t.top, bottom: t.bottom, height: t.height },
        reach: { bottom: t.top + content.offsetHeight, right: t.left + content.offsetWidth },
        below, side, hitBelow: hit(below), hitSide: hit(side) }
    })
    if (!geo) { instrumentFails.push({ cell: 'CT', detail: '「唯讀日期 × 自訂事件方塊」找不到自訂方塊或它隔壁的格子(範例資料改了?)' }); return }
    if (!(geo.reach.bottom > geo.below.y + 4 && geo.reach.right > geo.side.x + 4)) {
      instrumentFails.push({ cell: 'CT', detail: `情境沒成立:撐大的內容只到底 ${geo.reach.bottom.toFixed(1)} / 右 ${geo.reach.right.toFixed(1)},量點在 ${geo.below.y.toFixed(1)} / ${geo.side.x.toFixed(1)}(內容沒撐大,量不到裁切)` })
      return
    }
    const pixelAt = async (pt) => { const png = PNG.sync.read(await page.screenshot({ clip: { x: Math.floor(pt.x), y: Math.floor(pt.y), width: 1, height: 1 } })); return [png.data[0], png.data[1], png.data[2]] }
    const isMarker = (c) => c[0] >= 240 && c[1] <= 20 && c[2] >= 240
    const pxBelow = await pixelAt(geo.below), pxSide = await pixelAt(geo.side)
    check('CT1', !geo.hitBelow.inTile && !isMarker(pxBelow),
      `自訂內容撐到 ${geo.reach.bottom.toFixed(1)}(外層底 ${geo.tile.bottom.toFixed(1)});下一列位置 (${geo.below.x.toFixed(0)}, ${geo.below.y.toFixed(0)}) 點到 ${geo.hitBelow.inTile ? '這個方塊' : geo.hitBelow.what}、顏色 ${pxBelow.join(',')}`
      + '(規格:內容放得進一列;放不進的裁在外層裡,不疊到下一列、不接走點擊)')
    check('CT2', !geo.hitSide.inTile && !isMarker(pxSide),
      `自訂內容右緣 ${geo.reach.right.toFixed(1)}(外層右緣 ${geo.tile.right.toFixed(1)});隔壁格 ${geo.nextDay} 正中 (${geo.side.x.toFixed(0)}, ${geo.side.y.toFixed(0)}) 點到 ${geo.hitSide.inTile ? '這個方塊' : geo.hitSide.what}、顏色 ${pxSide.join(',')}`
      + '(規格:裁在這一段的外形裡,不畫進隔壁格)')
    // 焦點框(outline 2px、往外 2px → 外層外 2–4px):量外 3px 兩點,聚焦前 / 後
    const ringPts = [{ x: geo.tile.left - 3, y: geo.tile.top + geo.tile.height / 2 }, { x: geo.tile.left + 8, y: geo.tile.bottom + 3 }]
    const beforeRing = []
    for (const pt of ringPts) beforeRing.push(await pixelAt(pt))
    await page.locator(`[role="gridcell"][data-calendar-day="${geo.day}"]`).focus()
    await page.keyboard.press('F2')
    await settle()
    const focused = await page.evaluate(() => Boolean(document.activeElement?.matches('[data-calendar-tile]')))
    const afterRing = []
    for (const pt of ringPts) afterRing.push(await pixelAt(pt))
    const deltas = ringPts.map((_, i) => Math.max(...beforeRing[i].map((v, j) => Math.abs(v - afterRing[i][j]))))
    check('CT3', focused && deltas.every((d) => d >= 40),
      `F2 進自訂方塊:${focused ? '焦點在方塊上' : '焦點沒落在方塊上'};外層左緣外 3px ${beforeRing[0].join(',')} → ${afterRing[0].join(',')}、底緣外 3px ${beforeRing[1].join(',')} → ${afterRing[1].join(',')}(差 ${deltas.join(' / ')};規格:焦點框往外畫,不被外層的裁切裁掉)`)
  },
  // ── 事件的兩種長相(團隊行事曆,淺色)──
  // AP1 全天長條「Alex 休假」:底 = --color-yellow-1、外層與顏色層左邊框 0、沒有色條、沒有時間;
  // AP2 有時段「設計審查」:底透明、色條寬 4、高 = 字級(列的 font-size)、上下置中(±0.5)、圓頭(圓角 ≥ 寬 / 2)、色 = --color-blue-6、貼列左緣、aria-hidden;
  // AP3 字左緣兩種長相同一條線:兩者第一個字離列左緣 = 8(±0.5)、相差 < 0.5(D5);
  // AP4 時間 = fg-secondary、標題 = foreground【TIMECOLOR(定)】;AP5 時間字 zh-TW「上午10:00」「下午3:00」;
  // AP6 讀屏名稱:「設計審查,上午10:00」「Alex 休假,7月20日 – 7月22日,全天」各一顆、沒有任何「事件:」開頭的按鈕、單筆唯讀的公司假日不是按鈕;
  // AP7 可點時滑過:有時段列 → --neutral-hover、長條 → --color-yellow-2,兩者手形游標。
  async looks(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 事件長相', mutate })
    if (!p) return
    await page.mouse.move(0, 0)
    const ref = await refsOf(['bg:--color-yellow-1', 'bg:--color-yellow-2', 'bg:--color-blue-6', 'bg:--neutral-hover', 'cls:text-fg-secondary', 'cls:text-foreground'])
    const bar = await pieceOf('Alex 休假', 'bar'), timed = await pieceOf('設計審查', 'timed'), late = await pieceOf('客戶會議', 'timed')
    if (!bar || !timed || !late) { instrumentFails.push({ cell: 'AP', detail: '團隊行事曆找不到「Alex 休假」長條或「設計審查」「客戶會議」有時段列(範例資料改了?)' }); return }
    check('AP1', bar.innerBg === ref['bg:--color-yellow-1'] && bar.borderL.every((w) => w === 0) && bar.accent === null && bar.time === null,
      `「Alex 休假」底 ${bar.innerBg}(規格 --color-yellow-1 = ${ref['bg:--color-yellow-1']})、左邊框 ${bar.borderL.join(' / ')}、色條 ${bar.accent ? '有' : '無'}、時間 ${bar.time?.text ?? '無'}(規格:淡底長條、不帶色條、全天不畫時間)`)
    const a = timed.accent
    check('AP2', timed.innerBg === 'rgba(0, 0, 0, 0)' && Boolean(a) && near(a.w, SPEC.gap, 0.01) && near(a.h, timed.fontSize, 0.01) && Math.abs(a.dy) <= 0.5
      && a.radius >= a.w / 2 - 0.01 && a.bg === ref['bg:--color-blue-6'] && near(a.left, 0) && a.hidden === 'true',
      a ? `「設計審查」底 ${timed.innerBg}、色條 ${fmtPx(a.w)}×${fmtPx(a.h)}(字級 ${timed.fontSize})、中心差 ${fmtPx(a.dy)}、圓角 ${a.radius}、色 ${a.bg}(--color-blue-6 = ${ref['bg:--color-blue-6']})、離列左緣 ${fmtPx(a.left)}、aria-hidden ${a.hidden}`
        + '(規格:透明列;色條寬 4、高 = 字高、上下置中、圓頭【BAR(定)】、類別 step-6)' : '「設計審查」沒有色條')
    check('AP3', near(bar.textLeft, SPEC.inset) && near(timed.textLeft, SPEC.inset) && Math.abs(bar.textLeft - timed.textLeft) < 0.5,
      `第一個字離列左緣:長條 ${fmtPx(bar.textLeft)}、有時段 ${fmtPx(timed.textLeft)}(規格:兩種長相都是 8、同一條線 —— 色條 4 + 間隔 4)`)
    check('AP4', timed.time?.color === ref['cls:text-fg-secondary'] && timed.titleColor === ref['cls:text-foreground'],
      `時間字色 ${timed.time?.color}(fg-secondary ${ref['cls:text-fg-secondary']})、標題 ${timed.titleColor}(foreground ${ref['cls:text-foreground']})【TIMECOLOR(定)】`)
    check('AP5', timed.time?.text === '上午10:00' && late.time?.text === '下午3:00',
      `時間字「${timed.time?.text}」「${late.time?.text}」(規格:zh-TW 預設 { hour: 'numeric', minute: '2-digit' } =「上午10:00」「下午3:00」)`)
    const names = {
      timed: await page.getByRole('button', { name: '設計審查,上午10:00', exact: true }).count(),
      bar: await page.getByRole('button', { name: 'Alex 休假,7月20日 – 7月22日,全天', exact: true }).count(),
      legacy: await page.getByRole('button', { name: /^事件:/ }).count(),
      holiday: await page.getByRole('button', { name: /公司創立紀念日/ }).count(),
    }
    check('AP6', names.timed === 1 && names.bar === 1 && names.legacy === 0 && names.holiday === 0,
      `讀屏名稱:「設計審查,上午10:00」×${names.timed}、「Alex 休假,7月20日 – 7月22日,全天」×${names.bar}、「事件:」開頭 ${names.legacy} 顆、公司假日是按鈕 ${names.holiday} 顆`
      + '(規格:{標題},{開始時間 或 起訖日期}{,全天};唯讀不命名)')
    const hTimed = await hovered('設計審查', 'timed'), hBar = await hovered('Alex 休假', 'bar')
    check('AP7', hTimed?.innerBg === ref['bg:--neutral-hover'] && hBar?.innerBg === ref['bg:--color-yellow-2'] && hTimed?.cursor === 'pointer' && hBar?.cursor === 'pointer',
      `滑過:有時段列 ${hTimed?.innerBg}(--neutral-hover ${ref['bg:--neutral-hover']})、長條 ${hBar?.innerBg}(--color-yellow-2 ${ref['bg:--color-yellow-2']})、游標 ${hTimed?.cursor} / ${hBar?.cursor}`)
  },
  // ── 色彩對照表:兩種長相 × 12 色相 + neutral(設計規格「色彩對照表」);neutral 的唯讀在團隊行事曆的公司假日 ──
  // MX 12 色相:長條底 --color-X-1、字 --color-X-7,有時段列透明、色條 --color-X-6;NE1 neutral 長條底 --secondary、字 --foreground、滑過 --secondary-hover;
  // NE2 neutral 色條 --color-neutral-9;NE3 唯讀的 neutral 長條(團隊行事曆「公司創立紀念日」)底 --secondary、滑過不變、不是按鈕、游標不是手形。
  async matrix(mutate) {
    const p = await open(STORY.matrix, { label: '設計規格 色彩對照表', mutate })
    if (p) {
      await page.mouse.move(0, 0)
      const hues = ['blue', 'green', 'deep-orange', 'yellow', 'red', 'orange', 'amber', 'lime', 'turquoise', 'indigo', 'purple', 'magenta']
      const ref = await refsOf([...hues.flatMap((h) => [`bg:--color-${h}-1`, `bg:--color-${h}-6`]), 'bg:--secondary', 'bg:--secondary-hover', 'bg:--color-neutral-9', 'cls:text-foreground'])
      const colorOf = await page.evaluate((hs) => Object.fromEntries(hs.map((h) => { const d = document.createElement('span'); d.style.color = `var(--color-${h}-7)`; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return [h, c] })), hues)
      const bad = []
      for (const h of hues) {
        const b = await pieceOf(h, 'bar'), t = await pieceOf(h, 'timed')
        if (!b || !t) { bad.push(`${h} 找不到`); continue }
        if (b.innerBg !== ref[`bg:--color-${h}-1`] || b.innerColor !== colorOf[h]) bad.push(`${h} 長條 ${b.innerBg} / ${b.innerColor}`)
        if (t.innerBg !== 'rgba(0, 0, 0, 0)' || t.accent?.bg !== ref[`bg:--color-${h}-6`]) bad.push(`${h} 有時段 底 ${t.innerBg}、色條 ${t.accent?.bg}`)
      }
      check('MX', bad.length === 0, `12 色相兩種長相:${bad.slice(0, 3).join(';') || '全部 = 長條 step-1 底 / step-7 字、有時段透明列 + step-6 色條'}(規格:CAT_EVENT / CAT_ACCENT 1:1)`)
      const nb = await pieceOf('neutral', 'bar'), nt = await pieceOf('neutral', 'timed'), nh = await hovered('neutral', 'bar')
      check('NE1', nb?.innerBg === ref['bg:--secondary'] && nb?.innerColor === ref['cls:text-foreground'] && nh?.innerBg === ref['bg:--secondary-hover'],
        `neutral 長條 底 ${nb?.innerBg}(--secondary ${ref['bg:--secondary']})、字 ${nb?.innerColor}、滑過 ${nh?.innerBg}(--secondary-hover ${ref['bg:--secondary-hover']})(規格:CAT_EVENT_NEUTRAL.event)`)
      check('NE2', nt?.accent?.bg === ref['bg:--color-neutral-9'] && nt?.innerBg === 'rgba(0, 0, 0, 0)',
        `neutral 有時段 色條 ${nt?.accent?.bg}(--color-neutral-9 ${ref['bg:--color-neutral-9']})、底 ${nt?.innerBg}(規格:CAT_EVENT_NEUTRAL.accent、透明列)`)
    }
    const team = await open(STORY.team, { label: '團隊行事曆 唯讀 neutral', mutate })
    if (!team) return
    await page.mouse.move(0, 0)
    const ref = await refsOf(['bg:--secondary'])
    const rest = await pieceOf('公司創立紀念日', 'bar'), hov = await hovered('公司創立紀念日', 'bar')
    check('NE3', rest?.innerBg === ref['bg:--secondary'] && hov?.innerBg === ref['bg:--secondary'] && rest?.role === null && hov?.cursor !== 'pointer',
      `唯讀 neutral「公司創立紀念日」底 ${rest?.innerBg}、滑過 ${hov?.innerBg}(--secondary ${ref['bg:--secondary']})、角色 ${rest?.role}、游標 ${hov?.cursor}(規格:CAT_EVENT_NEUTRAL.subtle,不帶滑過、不是按鈕)`)
  },
  // ── 唯讀滑過不變(元件檢閱器 readOnlyEvents:兩種長相都唯讀)── RO1:有時段列滑過仍透明、長條滑過仍 --color-yellow-1、都不是按鈕、游標不是手形
  async readOnlyHover(mutate) {
    const p = await open(STORY.inspector, { label: 'Inspector readOnlyEvents', args: 'readOnlyEvents:!true', mutate })
    if (!p) return
    await page.mouse.move(0, 0)
    const ref = await refsOf(['bg:--color-yellow-1'])
    const t = await hovered('設計審查', 'timed'), b = await hovered('Alex 休假', 'bar')
    check('RO1', t?.innerBg === 'rgba(0, 0, 0, 0)' && b?.innerBg === ref['bg:--color-yellow-1'] && t?.role === null && b?.role === null && t?.cursor !== 'pointer' && b?.cursor !== 'pointer',
      `readOnlyEvents 滑過:有時段列 ${t?.innerBg}、長條 ${b?.innerBg}(靜止 ${ref['bg:--color-yellow-1']})、角色 ${t?.role} / ${b?.role}、游標 ${t?.cursor} / ${b?.cursor}(規格:唯讀不亮、不是按鈕)`)
  },
  // ── eventTimeFormat 覆寫(test-only「英文讀屏字串覆寫」:en-US + 24 小時制 { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })──
  // TF1 畫面上的時間「10:00」(en-US 預設會是「10:00 AM」)、名稱用同一個格式「Design review, 10:00」;長條的名稱「Offsite, July 8 – July 9, all day」
  async timeFormat(mutate) {
    const p = await open(STORY.english, { label: 'eventTimeFormat 覆寫', mutate })
    if (!p) return
    const t = await pieceOf('Design review', 'timed'), b = await pieceOf('Offsite', 'bar')
    check('TF1', t?.time?.text === '10:00' && t?.name === 'Design review, 10:00' && b?.name === 'Offsite, July 8 – July 9, all day',
      `時間字「${t?.time?.text}」、名稱「${t?.name}」/「${b?.name}」(規格:eventTimeFormat 整份取代預設,畫面與名稱同一個格式;labels.event 覆寫生效)`)
  },
  // ── 窄寬時拿掉時間(展示「分割畫面側欄(窄寬)」7/27「上線前審查」下午2:00)──
  // NT1 欄寬 ≤ 60:有色條、沒有時間,讀屏名稱照舊「上線前審查,下午2:00」;NT2 同一則把根節點加寬到欄寬 70:時間「下午2:00」出現(對照:證明時間是被窄寬拿掉的,不是本來就沒有)
  async narrowTime(mutate) {
    const p = await open(STORY.narrow, { label: '窄寬 有時段事件', mutate })
    if (!p) return
    const col = () => page.evaluate(() => document.querySelector('[role="grid"] [role="gridcell"]').getBoundingClientRect().width)
    const c0 = await col(), n = await pieceOf('上線前審查', 'timed')
    if (!n || !(c0 <= NARROW_MAX)) { instrumentFails.push({ cell: 'NT1', detail: `前提沒成立:欄寬 ${c0}(要 ≤ ${NARROW_MAX})、找到「上線前審查」有時段列 ${Boolean(n)}` }); return }
    check('NT1', n.time === null && Boolean(n.accent) && n.name === '上線前審查,下午2:00',
      `欄寬 ${fmtPx(c0)}:「上線前審查」時間 ${n.time?.text ?? '無'}、色條 ${n.accent ? '有' : '無'}、名稱「${n.name}」(規格:窄寬拿掉時間、只留色條 + 標題,讀屏名稱照舊)`)
    await page.evaluate((w) => { document.querySelector('[role="grid"]').parentElement.style.width = `${w}px` }, 7 * 70 + 2)
    await frames(6)
    const c1 = await col(), w = await pieceOf('上線前審查', 'timed')
    if (!(c1 > NARROW_MAX)) { instrumentFails.push({ cell: 'NT2', detail: `加寬後欄寬 ${c1} 仍 ≤ ${NARROW_MAX}` }); return }
    check('NT2', w?.time?.text === '下午2:00', `加寬到欄寬 ${fmtPx(c1)}:「上線前審查」時間「${w?.time?.text ?? '無'}」(規格:欄寬 > ${NARROW_MAX} 畫開始時間)`)
  },
  // ── 時間字的對比(兩個主題,靜止 / 滑過;團隊行事曆「設計審查」)──
  // 量畫面上合成後的畫素:列右側空白處的底,與把時間字的計算色塗成實心塊疊在同一處的顏色(= 字在這個底上實際的顏色);標題同法。≥ 4.5(calendar.spec.md「A11y 預設」驗證)
  async contrast(mutate) {
    for (const theme of ['light', 'dark']) {
      const p = await open(STORY.team, { label: `團隊行事曆 對比 ${theme}`, mutate, theme })
      if (!p) continue
      const out = []
      for (const state of ['rest', 'hover']) {
        const at = await pieceOf('設計審查', 'timed')
        if (!at?.time) { instrumentFails.push({ cell: `CR-${theme}`, detail: '找不到「設計審查」的時間字' }); break }
        if (state === 'hover') { await page.mouse.move(at.x, at.y); await frames() } else { await page.mouse.move(0, 0); await frames() }
        const pt = { x: Math.floor(at.right - 6), y: Math.floor(at.top + 2) }
        const px = async () => { const png = PNG.sync.read(await page.screenshot({ clip: { x: pt.x, y: pt.y, width: 1, height: 1 } })); return [png.data[0], png.data[1], png.data[2]] }
        const swatch = async (color) => {
          await page.evaluate(({ color, x, y }) => { const d = document.createElement('div'); d.id = '__cal_swatch'; d.style.cssText = `position:fixed;left:${x - 2}px;top:${y - 1}px;width:5px;height:3px;pointer-events:none;z-index:2147483647;background:${color}`; document.body.append(d) }, { color, ...pt })
          const c = await px()
          await page.evaluate(() => document.getElementById('__cal_swatch')?.remove())
          return c
        }
        const bg = await px()
        const now = await pieceOf('設計審查', 'timed')
        const time = await swatch(now.time.color), title = await swatch(now.titleColor)
        out.push({ state, time: ratio(time, bg), title: ratio(title, bg), bg })
      }
      await page.mouse.move(0, 0)
      if (out.length === 2) check(`CR-${theme}`, out.every((o) => o.time >= 4.5 && o.title >= 4.5),
        `${theme} 對比:${out.map((o) => `${o.state === 'rest' ? '靜止' : '滑過'}(底 ${o.bg.join(',')})時間 ${o.time.toFixed(2)}、標題 ${o.title.toFixed(2)}`).join(';')}(規格:文字 ≥ 4.5)`)
    }
  },
  // ── ML「+N」與當天清單(calendar.spec.md「每格筆數與「+N」」「「+N」清單浮層」「焦點框」;2026-11-26「+N」清單那一包)──
  // 設計規格「狀態行為:「+N」清單開著」:play 已點開 7/22 的清單。先按 Esc(量焦點歸還),再自己用真滑鼠點「+N」重開來量其餘各格
  //(對照組在 open() 裡裝好、在這裡的動作之前生效;listDom = 清單開著之後才套的突變)。一般 / 大密度各一趟。
  async moreList(mutate) {
    for (const density of ['md', 'lg']) {
      const tag = `@${density}`
      const p = await open(STORY.moreList, { label: `「+N」清單開著 ${tag}`, mutate, density })
      if (!p) continue
      const listSel = `[data-calendar-more-list="${MORE_DAY}"]`, moreSel = `[data-calendar-more="${MORE_DAY}"]`
      const waitList = (state) => page.waitForFunction(({ s, st }) => {
        const el = document.querySelector(s)
        const shown = Boolean(el && el.getAttribute('data-state') === 'open' && !el.getAnimations().some((a) => a.playState === 'running'))
        return st === 'open' ? shown : !el
      }, { s: listSel, st: state }, { timeout: 10000 }).then(() => true, () => false)
      if (!(await waitList('open'))) { instrumentFails.push({ cell: `ML ${tag}`, detail: 'play 打開的「+N」清單等不到(story 改了?)' }); continue }
      // ML-row-ring:play 用鍵盤打開清單,焦點在第一列;那一列的焦點框四邊都要落在會裁切它的最近祖先(內文捲動區)裡面。
      // 量幾何(元素框 ± outline-offset + outline-width 對裁切框),不只看 offset 正負 —— 2026-11-27 R8 稽核:第一列貼著捲動區頂邊,
      // 往外畫時上緣被裁(像素上 0 px 可見),而 ML-ring 那種「offset > 0」的量法照樣綠(M32)。
      // 量在 listDom 突變之前:「清單順序倒過來」那類 DOM 突變會把焦點所在的列搬走(焦點掉到 body),不是這一格要抓的事。
      const rr = await page.evaluate((ls) => {
        const list = document.querySelector(ls), a = document.activeElement
        if (!list || !a || !list.contains(a) || !a.matches('[data-calendar-list-row]')) return null
        const cs = getComputedStyle(a), r = a.getBoundingClientRect()
        const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth)
        let clip = a.parentElement
        while (clip && clip !== list && getComputedStyle(clip).overflowY === 'visible' && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
        const c = (clip ?? list).getBoundingClientRect()
        return { fv: a.matches(':focus-visible'), style: cs.outlineStyle, grow,
          over: { t: c.top - (r.top - grow), b: (r.bottom + grow) - c.bottom, l: c.left - (r.left - grow), r: (r.right + grow) - c.right } }
      }, listSel)
      if (!rr || !rr.fv || rr.style === 'none') instrumentFails.push({ cell: `ML-row-ring${tag}`, detail: rr ? `第一列沒有可見的鍵盤焦點框(:focus-visible ${rr.fv}、outline ${rr.style})` : '清單打開後焦點不在清單的列上(play 改了?)' })
      else check(`ML-row-ring${tag}`, Object.values(rr.over).every((v) => v <= 0.01),
        `清單第一列焦點框超出裁切框:上 ${fmtPx(rr.over.t)} / 下 ${fmtPx(rr.over.b)} / 左 ${fmtPx(rr.over.l)} / 右 ${fmtPx(rr.over.r)}(> 0 = 被裁掉的 px;框外擴 ${fmtPx(rr.grow)};focus-canonical.md「問題二」淨空 < 4 → 往內)`)
      if (mutate?.listDom) await page.evaluate(mutate.listDom, { day: MORE_DAY })
      // ML-esc:Esc 關清單、焦點回「+N」
      await page.keyboard.press('Escape')
      const closed = await waitList('closed')
      await frames(4)
      const escFocus = await page.evaluate((s) => document.activeElement === document.querySelector(s), moreSel)
      check(`ML-esc${tag}`, closed && escFocus, `Esc 後清單${closed ? '關了' : '沒關'}、焦點${escFocus ? '回到「+N」' : '不在「+N」'}(calendar.spec.md「「+N」清單浮層」鍵盤與焦點)`)
      // ML-trigger:「+N」= 原生按鈕、與事件列同高、次要灰、字級同事件列、aria-haspopup=dialog、名稱「{日期},還有 N 個事件」
      const t = await page.evaluate(({ s, day }) => {
        const b = document.querySelector(s)
        if (!b) return null
        const cell = b.closest('[role="gridcell"]')
        const row = cell?.querySelector('[data-calendar-covers] > :first-child')
        const ref = document.createElement('span'); ref.style.color = 'var(--fg-secondary)'; document.body.append(ref)
        const want = getComputedStyle(ref).color; ref.remove()
        const cs = getComputedStyle(b), r = b.getBoundingClientRect()
        return { tag: b.tagName, type: b.getAttribute('type'), h: r.height, font: parseFloat(cs.fontSize), rowFont: row ? parseFloat(getComputedStyle(row).fontSize) : NaN,
          color: cs.color, want, popup: b.getAttribute('aria-haspopup'), text: b.textContent, day, cursor: cs.cursor,
          ringOffset: parseFloat(cs.outlineOffset), ringStyle: cs.outlineStyle, ringW: parseFloat(cs.outlineWidth), focusVisible: b.matches(':focus-visible') }
      }, { s: moreSel, day: MORE_DAY })
      const tName = await axNameOf(`document.querySelector(${JSON.stringify(moreSel)})`)
      check(`ML-trigger${tag}`, Boolean(t) && t.tag === 'BUTTON' && t.type === 'button' && near(t.h, SPEC.row) && near(t.font, t.rowFont) && t.color === t.want && t.popup === 'dialog'
        && /^\+\d+$/u.test(t.text) && t.cursor === 'pointer' && /^2026年7月22日 星期三,還有 \d+ 個事件$/u.test(tName ?? ''),
        t ? `「+N」<${t.tag.toLowerCase()} type=${t.type}> 高 ${fmtPx(t.h)}、字 ${t.font}(事件列 ${t.rowFont})、色 ${t.color}(fg-secondary ${t.want})、aria-haspopup=${t.popup}、字「${t.text}」、名稱「${tName}」` : '找不到「+N」')
      // ML-ring:鍵盤焦點(Esc 回來的那一下)的焦點框往外(calendar.spec.md「焦點框」;focus-canonical.md 套回實測值表「+N」那一列)
      check(`ML-ring${tag}`, Boolean(t) && t.focusVisible && t.ringStyle !== 'none' && t.ringW > 0 && t.ringOffset > 0,
        t ? `「+N」焦點框:${t.ringStyle} ${t.ringW}px、offset ${t.ringOffset}px、:focus-visible ${t.focusVisible}(往外 = offset > 0)` : '找不到「+N」')
      // 真滑鼠點「+N」:開清單、不會變成在這天新增(「新增事件」對話框不出現)
      const at = await page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }, moreSel)
      if (!at) { instrumentFails.push({ cell: `ML ${tag}`, detail: 'Esc 之後找不到「+N」' }); continue }
      await page.mouse.click(at.x, at.y)
      const reopened = await waitList('open')
      await frames(4)
      const created = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((d) => /^新增/u.test(d.querySelector('h2')?.textContent ?? '')))
      check(`ML-click${tag}`, reopened && !created, `點「+N」:清單${reopened ? '打開' : '沒打開'}、「新增事件」${created ? '出現了(點擊冒泡到格子)' : '沒出現'}`)
      if (!reopened) continue
      if (mutate?.listDom) await page.evaluate(mutate.listDom, { day: MORE_DAY })
      const m = await page.evaluate(({ ls, ms }) => {
        const c = document.querySelector(ls), more = document.querySelector(ms)
        const cell = more?.closest('[role="gridcell"]')
        if (!c || !cell) return null
        const header = c.querySelector('[data-slot="surface-header"]'), body = c.querySelector('[data-slot="surface-body"]'), title = header?.querySelector('h2')
        const rows = [...c.querySelectorAll('[role="listitem"]')]
        const titleOf = (el) => { const tm = el.querySelector('[data-calendar-time]'); return (tm ? el.textContent.replace(tm.textContent, '') : el.textContent).trim() }
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right } }
        const drawn = [...document.querySelectorAll(`[role="grid"] [data-calendar-covers~="${ms.match(/"(.+)"/)[1]}"]`)]
          .sort((a, b) => Number(a.dataset.calendarLane) - Number(b.dataset.calendarLane)).map(titleOf)
        const ro = rows.find((r) => titleOf(r).startsWith('場地布置'))
        const active = document.activeElement
        return {
          c: box(c), cell: box(cell), header: header ? box(header) : null, titleBox: title ? box(title) : null, body: body ? box(body) : null,
          headerLine: header ? parseFloat(getComputedStyle(header).borderBottomWidth) : NaN,
          tight: parseFloat(getComputedStyle(c).getPropertyValue('--layout-space-tight')),
          rows: rows.map((r) => ({ ...box(r), title: titleOf(r) })), drawn,
          roButton: ro ? Boolean(ro.querySelector('button, [role="button"], [tabindex]')) : null,
          firstFocus: Boolean(active && rows[0]?.contains(active) && active.tagName === 'BUTTON'),
          scroll: body ? { sh: body.scrollHeight, ch: body.clientHeight } : null,
        }
      }, { ls: listSel, ms: moreSel })
      if (!m || !m.header || !m.body || !m.titleBox || m.rows.length === 0) { instrumentFails.push({ cell: `ML ${tag}`, detail: '清單的標題列 / 內文 / 列量不到' }); continue }
      // ML-center:浮層中心 = 格子中心(水平 + 垂直,±0.5;這一格在畫面中間,不碰視窗邊)
      const dx = (m.c.l + m.c.w / 2) - (m.cell.l + m.cell.w / 2), dy = (m.c.t + m.c.h / 2) - (m.cell.t + m.cell.h / 2)
      check(`ML-center${tag}`, Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5, `清單中心 − 格子中心 = (${fmtPx(dx)}, ${fmtPx(dy)})(規格:蓋在格子上、中心對中心)`)
      check(`ML-width${tag}`, m.c.w >= m.cell.w - 0.5, `清單寬 ${fmtPx(m.c.w)} ≥ 格寬 ${fmtPx(m.cell.w)}`)
      // ML-open:滑鼠開啟時焦點落在第一筆可點事件(popover.spec.md「A11y 預設」body 第一個控件)
      check(`ML-open${tag}`, m.firstFocus, `開啟後焦點${m.firstFocus ? '在第一筆事件' : '不在第一筆事件'}`)
      // ML-head:標題列底下不畫分隔線、標頭內容的底 → 第一列 = tight(header-first-gap NOT_COVERED 那一格的量法)
      const headGap = m.rows[0].t - m.titleBox.b
      check(`ML-head${tag}`, m.headerLine === 0 && near(headGap, m.tight), `標題列分隔線 ${m.headerLine}px、標題底 → 第一列 ${fmtPx(headGap)}(規格 tight ${m.tight})`)
      // ML-order:順序 = 格內排序(開始日早的在上 → 同一天長的在上 → 全天先 → 依開始時間 → 依標題),格內畫出來的照同一個相對順序
      const titles = m.rows.map((r) => r.title)
      const sub = m.drawn.every((d, i, a) => titles.indexOf(d) >= 0 && (i === 0 || titles.indexOf(d) > titles.indexOf(a[i - 1])))
      check(`ML-order${tag}`, JSON.stringify(titles) === JSON.stringify(MORE_DAY_ORDER) && sub,
        `清單順序 ${titles.join(' / ')};格內畫出來的 ${m.drawn.join(' / ')}${sub ? '(同一個相對順序)' : '(相對順序不同)'}`)
      check(`ML-ro${tag}`, m.roButton === false, m.roButton === null ? '清單裡找不到唯讀的「場地布置」' : `唯讀的「場地布置」${m.roButton ? '是按鈕 / 可聚焦' : '是純文字'}`)
      // ML-rowh:清單每一列(全天長條、唯讀純文字、有時段)的外框高 = 列高 token(--tag-height-md,在浮層上量),與字型無關 ——
      // 本機字型下量一次,再把清單的行高放大到 3 倍量一次(模擬字型上下緣較大的平台:列的外框若由那一行的字型撐,會跟著變高;
      // 2026-11-26 Linux CI 有時段列 25、mac 24,ML-half 因此只在 Linux 紅)。量完拿掉放大,後面各格照常量。
      const rowH = await page.evaluate((ls) => {
        const c = document.querySelector(ls)
        const heights = () => [...c.querySelectorAll('[role="listitem"]')].map((r) => r.getBoundingClientRect().height)
        // 量 token 的探針脫離版面(浮層是有高度上限的 flex 欄,探針若是 flex 子項會被壓扁 —— 第一版量到 15.75)
        const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--tag-height-md)'; c.append(probe)
        const token = probe.getBoundingClientRect().height; probe.remove()
        const local = heights()
        const s = document.createElement('style'); s.textContent = `${ls} [role="list"] { line-height: 3 !important; }`; document.head.append(s)
        const stressed = heights(); s.remove()
        return { token, local, stressed }
      }, listSel)
      const fmtRows = (hs) => hs.map((h) => fmtPx(h).replace(/\.00$/u, '')).join(' / ')
      check(`ML-rowh${tag}`, rowH.local.length > 0 && [...rowH.local, ...rowH.stressed].every((h) => near(h, rowH.token)),
        `清單各列高 ${fmtRows(rowH.local)};行高放大 3 倍時 ${fmtRows(rowH.stressed)}(規格:每一列 = 列高 token --tag-height-md ${fmtPx(rowH.token)},與字型無關)`)
      // ML-half:捲在頂端時,內文區可見底邊切在第 N + 1 列的一半(N = 9;±1)
      const visBottom = m.body.t + m.scroll.ch
      const cut = m.rows.findIndex((r) => r.t < visBottom - 0.5 && r.b > visBottom + 0.5)
      const cutAt = cut >= 0 ? visBottom - m.rows[cut].t : NaN
      check(`ML-half${tag}`, cut === SPEC.moreListRows && Math.abs(cutAt - SPEC.row / 2) <= 1,
        `捲在頂端:可見底邊切在第 ${cut + 1} 列、切在列內 ${fmtPx(cutAt)}(規格:第 ${SPEC.moreListRows + 1} 列的一半 ${SPEC.row / 2});清單高 ${fmtPx(m.c.h)};各列高 ${fmtRows(m.rows.map((r) => r.h))}`)
      // ML-sticky / ML-bottom:捲到底 —— 標題列不動、內文頂邊 = 標題列底邊;最後一列底 → 內文區底 = tight(hug 容器底 = 頂的值)
      const end = await page.evaluate((ls) => {
        const c = document.querySelector(ls)
        const header = c.querySelector('[data-slot="surface-header"]'), body = c.querySelector('[data-slot="surface-body"]')
        const scroller = [body, c].find((el) => el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))
        if (!scroller) return { scrolled: false }
        scroller.scrollTop = scroller.scrollHeight
        const rows = [...c.querySelectorAll('[role="listitem"]')]
        const hb = header.getBoundingClientRect(), bb = body.getBoundingClientRect(), last = rows[rows.length - 1].getBoundingClientRect()
        const visible = Math.min(bb.bottom, c.getBoundingClientRect().bottom - parseFloat(getComputedStyle(c).borderBottomWidth))
        return { scrolled: scroller.scrollTop > 0, headerTop: hb.top, headerBottom: hb.bottom, bodyTop: bb.top, lastToBottom: visible - last.bottom }
      }, listSel)
      check(`ML-sticky${tag}`, end.scrolled && near(end.headerTop, m.header.t) && near(end.bodyTop, end.headerBottom),
        end.scrolled ? `捲到底:標題列頂 ${fmtPx(m.header.t)} → ${fmtPx(end.headerTop)}、內文頂 ${fmtPx(end.bodyTop)} vs 標題列底 ${fmtPx(end.headerBottom)}` : '清單捲不動(內容沒有超過上限?)')
      check(`ML-bottom${tag}`, end.scrolled && near(end.lastToBottom, m.tight), end.scrolled ? `捲到底:最後一列底 → 清單底 ${fmtPx(end.lastToBottom)}(規格 tight ${m.tight})` : '清單捲不動')
      // ML-outside:點清單外面(說明文字)關清單,焦點留在點的地方、不被搶回「+N」。
      // 說明區塊用範例自己掛的 data-story-notes 認(不靠 mb-2 這類間距 class —— 2026-11-27 R8 E2 改版面時拿掉 mb-2,這裡就找不到了)
      const outside = await page.evaluate(() => { const r = document.querySelector('[data-story-notes]')?.getBoundingClientRect(); return r ? { x: r.left + 4, y: r.top + 4 } : null })
      if (!outside) { instrumentFails.push({ cell: `ML ${tag}`, detail: '找不到清單外可點的說明文字' }); continue }
      await page.mouse.click(outside.x, outside.y)
      const closedOut = await waitList('closed')
      await frames(10)
      const stolen = await page.evaluate((s) => document.activeElement === document.querySelector(s), moreSel)
      check(`ML-outside${tag}`, closedOut && !stolen, `點外面:清單${closedOut ? '關了' : '沒關'}、焦點${stolen ? '被搶回「+N」' : '沒有被搶回「+N」'}`)
    }
  },
  // 今天剛好是 1 號:Inspector 拿掉 today 參數(元件改用 new Date()),時鐘釘在 2026-07-01 上午 10 點(本機時區)。
  // 不用網址傳日期:Storybook 的網址參數對 Date 型別的 arg 一律丟掉(實測 !date(...) 沒生效)。
  // 時鐘是整個 context 共用、釘了就回不去 —— 本區塊一律排在最後跑(其他區塊的 story 都明傳 today,本來也不受影響);
  // 不另開 context:沙箱裡的 Chromium 是 --single-process,開第二個 context 會整個崩掉(實測 SIGTRAP)。
  // ── DT 事件詳情浮層(設計規格「狀態行為:事件詳情開著」「狀態行為:從清單開詳情」;calendar.spec.md「事件詳情浮層」「點清單裡的事件」)──
  // 期望值由規格與 token 現算(tight / 一行標題高 / fg-secondary 讀浮層上的變數),不 import 元件常數;
  // sideOffset / collisionPadding 8 = popover.spec.md「觸發距離 canonical」與「Viewport 邊距 canonical」(calendar.spec.md 位置段指向它的用法 (2),不重述數值)。
  async detail(mutate) {
    const detailSel = '[data-calendar-event-detail]'
    const waitSel = (sel, state) => page.waitForFunction(({ s, st }) => {
      const el = document.querySelector(s)
      const shown = Boolean(el && el.getAttribute('data-state') === 'open' && !el.getAnimations().some((a) => a.playState === 'running'))
      return st === 'open' ? shown : !el
    }, { s: sel, st: state }, { timeout: 10000 }).then(() => true, () => false)
    for (const density of ['md', 'lg']) {
      const tag = `@${density}`
      const p = await open(STORY.detailOpen, { label: `事件詳情開著 ${tag}`, mutate, density })
      if (!p) continue
      if (!(await waitSel(detailSel, 'open'))) { instrumentFails.push({ cell: `DT ${tag}`, detail: 'play 打開的詳情等不到(story 改了?)' }); continue }
      if (mutate?.detailDom) await page.evaluate(mutate.detailDom)
      await frames(3)
      // DT-name:浮層的名字 = 事件標題本身(PopoverTitle 自動接 aria-labelledby;不念「編輯 …」)
      const name = await axNameOf(`document.querySelector(${JSON.stringify(detailSel)})`)
      check(`DT-name${tag}`, name === '設計審查', `詳情浮層名稱「${name}」(規格 = 事件標題「設計審查」)`)
      const g = await page.evaluate((s) => {
        const d = document.querySelector(s)
        const tile = document.querySelector('[data-calendar-tile][data-calendar-event-id="d1"]')
        if (!d || !tile) return null
        const header = d.querySelector('[data-slot="surface-header"]')
        const body = d.querySelector('[data-popover-body]')
        // token 在標題列那一層量(2026-11-27 起詳情外殼裡一層 data-layout-space="lg",浮層根元素本身仍鎖 md —— 量在根元素上會拿到 md 的值)
        const host = header?.parentElement ?? d
        const probe = (css) => { const el = document.createElement('div'); el.style.cssText = `position:absolute;visibility:hidden;${css}`; host.append(el); const v = el.getBoundingClientRect().height; el.remove(); return v }
        const tight = probe('height: var(--layout-space-tight)')
        const loose = probe('height: var(--layout-space-loose)')
        // 一行標題的高(事件詳情客製:PopoverTitle text-body-lg 行高 1.5 = 24,同 Dialog 標題;calendar.spec.md「事件詳情浮層」標題列)
        const titleLine = probe('height: calc(var(--font-body-lg-size) * 1.5)')
        // 控制項大小照頁面密度(只動版面間距一軸):sm 欄位高在浮層外的頁面上量
        const smOut = (() => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;visibility:hidden;height:var(--field-height-sm)'; document.body.append(el); const v = el.getBoundingClientRect().height; el.remove(); return v })()
        const ref = document.createElement('span'); ref.style.color = 'var(--fg-secondary)'; d.append(ref); const secondary = getComputedStyle(ref).color; ref.remove()
        const dismiss = header?.querySelector('[data-dismiss]')
        const title = header?.querySelector('h2')
        const titleBox = title
        const fields = [...d.querySelectorAll('[data-calendar-detail-field]')]
        const r = (el) => el?.getBoundingClientRect()
        const dr = r(d), tr = r(tile), hr = r(header), br = r(body), xr = r(dismiss), ttr = r(titleBox)
        const rows = fields.map((f) => {
          const label = f.querySelector('label'); const value = label?.nextElementSibling
          return { field: f.getAttribute('data-calendar-detail-field'), labelTop: r(label)?.top, labelBottom: r(label)?.bottom, labelLeft: r(label)?.left, valueTop: r(value)?.top, fieldLeft: r(f)?.left, top: r(f)?.top, bottom: r(f)?.bottom, color: label ? getComputedStyle(label).color : null }
        })
        const last = fields.length ? r(fields[fields.length - 1]) : null
        // 標題列右側每一顆鈕(⋯ 操作、×)的中線
        const buttonMids = header ? [...header.querySelectorAll('button')].map((b) => { const x = r(b); return x.top + x.height / 2 }) : []
        return {
          tight, loose, titleLine, smOut, secondary, rows, buttonMids,
          detail: { left: dr.left, right: dr.right, top: dr.top, bottom: dr.bottom, width: dr.width }, tile: { left: tr.left, right: tr.right, top: tr.top }, vh: innerHeight,
          headerH: hr ? hr.height : NaN, headerLine: header ? parseFloat(getComputedStyle(header).borderBottomWidth) : NaN,
          dismissMid: xr ? xr.top + xr.height / 2 : NaN, dismissH: xr ? xr.height : NaN, titleMid: ttr ? ttr.top + ttr.height / 2 : NaN,
          titleFont: title ? parseFloat(getComputedStyle(title).fontSize) : NaN,
          // 標題字底(h2 那一行的底)→ 第一欄標籤頂;欄與欄 = 上一欄外框底 → 下一欄外框頂
          titleToFirst: ttr && rows[0] ? rows[0].labelTop - ttr.bottom : NaN,
          fieldGaps: rows.slice(1).map((row, i) => row.top - rows[i].bottom),
          bottomGap: last && br ? br.bottom - last.bottom : NaN,
          tileOpen: tile.hasAttribute('data-detail-open'),
        }
      }, detailSel)
      if (!g) { instrumentFails.push({ cell: `DT ${tag}`, detail: '找不到詳情浮層或「設計審查」那一段' }); continue }
      // DT-head【DT-TITLE(定)+ 2026-11-27 事件詳情客製】:標題列 = PopoverTitle 一行 16px 標題,上 tight、下 loose(標題 → 第一欄的 loose 只由標題列下內距給)、
      // 不畫底線;版面間距大檔(兩種密度都是 16 + 24 + 24 = 64),控制項大小照頁面密度(× 原生高 = 頁面的 sm 欄位高)。
      // 2026-11-27 前:14px 標題、上下 tight + 分隔線 1(45 + 1)
      check(`DT-head${tag}`, near(g.headerH, g.tight + g.titleLine + g.loose) && g.headerLine === 0 && near(g.titleFont, 16) && near(g.loose, 24) && near(g.dismissH, g.smOut),
        `標題列高 ${fmtPx(g.headerH)}(規格 上 ${g.tight} + 一行標題 ${g.titleLine} + 下 ${g.loose})、底線 ${g.headerLine}(規格 0)、標題字 ${g.titleFont}px(規格 16)、` +
        `詳情裡 loose ${g.loose}(版面間距大檔 24)、× 高 ${fmtPx(g.dismissH)}(頁面 sm 欄位高 ${g.smOut})`)
      // DT-center(2026-11-27 user「這個變大的標題會與右邊的操作項目垂直置中嗎？」→「1. 照你建議」):標題中線 = 標題列每一顆鈕(⋯ / ×)的中線
      // (按鈕佔位 = 標題那一行的高 24,overlay-chrome-sizing.spec.md:191「slot = 標題那一行的高」)
      const offMid = g.buttonMids.filter((m) => !near(m, g.titleMid))
      check(`DT-center${tag}`, g.buttonMids.length >= 1 && offMid.length === 0,
        `標題中線 ${fmtPx(g.titleMid)};標題列 ${g.buttonMids.length} 顆鈕中線 ${g.buttonMids.map(fmtPx).join(' / ')}(規格:全部 = 標題中線)`)
      // DT-width:寬 432(版面間距大檔左右內距 24,內容寬同改前 416 − 2 × 16;calendar.spec.md「事件詳情浮層」寬)
      check(`DT-width${tag}`, near(g.detail.width, SPEC.detailWidth), `詳情寬 ${fmtPx(g.detail.width)}(規格 ${SPEC.detailWidth})`)
      // DT-side:7/5 在星期的左半邊 → 先開右側、與事件隔 8、頂端對齊(calendar.spec.md「事件詳情浮層」位置【DT-DIRECTION(定)】子選單擺法);
      // 下方放不下時由 Popover 的碰撞往上推、底貼視窗留 collisionPadding(同 DT-side-right 的 topOk;2026-11-27 版面間距大檔後大密度的詳情變高,
      // 在 900 高的視窗裡會被推上去幾 px —— 那是碰撞規則,不是擺法錯)
      const sideTopOk = near(g.detail.top, g.tile.top) || (g.detail.top < g.tile.top && near(g.detail.bottom, g.vh - DETAIL_SIDE.edge))
      check(`DT-side${tag}`, near(g.detail.left - g.tile.right, 8) && sideTopOk,
        `詳情左緣 − 事件右緣 ${fmtPx(g.detail.left - g.tile.right)}(規格 8)、詳情上緣 ${fmtPx(g.detail.top)} / 事件上緣 ${fmtPx(g.tile.top)}(下方放不下時:詳情底 ${fmtPx(g.detail.bottom)} / 視窗底 − ${DETAIL_SIDE.edge} = ${fmtPx(g.vh - DETAIL_SIDE.edge)})`)
      // DT-vertical:每一欄標籤在上(標籤底 ≤ 值頂)、標籤左緣 = 欄位左緣【FIELD-ORIENT(定)】
      const notVertical = g.rows.filter((row) => !(row.labelBottom <= row.valueTop + 0.5 && near(row.labelLeft, row.fieldLeft)))
      check(`DT-vertical${tag}`, g.rows.length >= 4 && notVertical.length === 0, `欄位 ${g.rows.map((row) => row.field).join(' / ')};標籤不在上的:${notVertical.map((row) => row.field).join('、') || '無'}`)
      // DT-label:閱讀情境的標籤 = fg-secondary(../Field/field.spec.md「閱讀情境」)
      const wrongColor = g.rows.filter((row) => row.color !== g.secondary)
      check(`DT-label${tag}`, wrongColor.length === 0, `標籤色 ${[...new Set(g.rows.map((row) => row.color))].join(' / ')}(fg-secondary ${g.secondary})`)
      // DT-gap(2026-11-27 事件詳情客製,calendar.spec.md「事件詳情浮層」內距):標題字底 → 第一欄標籤頂 = loose(user「詳情感覺可以照你建議」)、
      // 欄與欄 = tight、最後一欄 → 底 = tight(版面間距大檔:24 / 16 / 16)
      const offGaps = g.fieldGaps.filter((x) => !near(x, g.tight))
      check(`DT-gap${tag}`, near(g.titleToFirst, g.loose) && g.fieldGaps.length >= 3 && offGaps.length === 0 && near(g.bottomGap, g.tight),
        `標題字底 → 第一欄標籤頂 ${fmtPx(g.titleToFirst)}(規格 loose ${g.loose})、欄與欄 ${g.fieldGaps.map(fmtPx).join(' / ')}(規格 tight ${g.tight})、最後一欄 → 底 ${fmtPx(g.bottomGap)}(規格 tight ${g.tight})`)
      // DT-mark:打開詳情的那一段帶 data-detail-open(維持滑過色)
      check(`DT-mark${tag}`, g.tileOpen, `「設計審查」那一段${g.tileOpen ? '' : '沒有'}帶 data-detail-open`)
      // DT-esc:Esc 關詳情、焦點回打開它的那一段
      await page.keyboard.press('Escape')
      const closed = await waitSel(detailSel, 'closed')
      await frames(4)
      const escFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-calendar-event-id') === 'd1')
      check(`DT-esc${tag}`, closed && escFocus, `Esc 後詳情${closed ? '關了' : '沒關'}、焦點${escFocus ? '回到「設計審查」' : '不在「設計審查」'}`)
      if (!closed) { await page.keyboard.press('Escape'); await waitSel(detailSel, 'closed') }
      // DT-side-right / DT-side-flip【DT-DIRECTION(定)】:子選單擺法 = 先開右側、右側放不下由碰撞翻左,不依那一天在星期的哪一半換邊
      //(calendar.spec.md「事件詳情浮層」位置 → popover.spec.md「禁止事項」用法 (2))。被點的是最右一欄 7/25「客戶會議」:
      //   right:情境(不是突變)把 Calendar 根元素收窄到 roomWidth(月曆右邊留出空位)—— 它仍在星期的右半邊,但右側放得下 → 照樣開右側、隔 8;
      //         2026-11-26 前「朝格陣中央」的寫法在這裡往左開 → 紅。
      //   flip:原版面右側放不下 → 翻到左側:事件左緣 − 詳情右緣 = 8、詳情不出視窗。
      //   兩者垂直都對齊事件上緣;放不下時被推回視窗內、底留 8(同 DT-list)。前提(右半邊 / 右側放不放得下)在量測時現算,不成立 = 儀器失效,不讀成通過。
      const sideSample = async (cell, room) => {
        const tileSel = `[data-calendar-tile][data-calendar-event-id="${DETAIL_SIDE.eventId}"]`
        await page.evaluate((w) => { const root = document.querySelector('[role="grid"]')?.parentElement; if (root) root.style.width = w ? `${w}px` : '' }, room)
        await frames(4)
        let m = null
        if (!(await page.$(tileSel))) instrumentFails.push({ cell: `${cell}${tag}`, detail: '找不到 7/25「客戶會議」那一段(範例資料變了?)' })
        else {
          await page.click(tileSel)
          if (!(await waitSel(detailSel, 'open'))) instrumentFails.push({ cell: `${cell}${tag}`, detail: '點「客戶會議」後等不到詳情' })
          else {
            if (mutate?.sideDom) await page.evaluate(mutate.sideDom, { d: detailSel, t: tileSel, gap: DETAIL_SIDE.gap, edge: DETAIL_SIDE.edge })
            await frames(3)
            m = await page.evaluate(({ d, t }) => {
              const detail = document.querySelector(d), tile = document.querySelector(t)
              const gridCell = tile?.closest('[role="gridcell"]')
              if (!detail || !tile || !gridCell) return null
              const cells = [...gridCell.parentElement.children].filter((el) => el.getAttribute('role') === 'gridcell')
              const dr = detail.getBoundingClientRect(), tr = tile.getBoundingClientRect()
              return { col: cells.indexOf(gridCell), cols: cells.length, tile: { left: tr.left, right: tr.right, top: tr.top }, detail: { left: dr.left, right: dr.right, top: dr.top, bottom: dr.bottom, width: dr.width },
                vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight }
            }, { d: detailSel, t: tileSel })
            await page.keyboard.press('Escape'); await waitSel(detailSel, 'closed')
          }
        }
        await page.evaluate(() => { const root = document.querySelector('[role="grid"]')?.parentElement; if (root) root.style.width = '' })
        await frames(4)
        if (!m) return null
        const fitsRight = m.tile.right + DETAIL_SIDE.gap + m.detail.width + DETAIL_SIDE.edge <= m.vw
        const topOk = near(m.detail.top, m.tile.top) || (m.detail.top < m.tile.top && near(m.detail.bottom, m.vh - DETAIL_SIDE.edge))
        return { ...m, fitsRight, topOk, rightHalf: m.col > (m.cols - 1) / 2 }
      }
      const sr = await sideSample('DT-side-right', DETAIL_SIDE.roomWidth)
      if (sr && !(sr.rightHalf && sr.fitsRight)) instrumentFails.push({ cell: `DT-side-right${tag}`, detail: `情境沒成立:第 ${sr.col + 1} / ${sr.cols} 欄${sr.rightHalf ? '' : '(不在右半邊)'}、右側${sr.fitsRight ? '' : '放不下'}(事件右緣 ${fmtPx(sr.tile.right)} + 8 + 詳情寬 ${fmtPx(sr.detail.width)} + 8 vs 視窗 ${sr.vw})` })
      else if (sr) check(`DT-side-right${tag}`, near(sr.detail.left - sr.tile.right, DETAIL_SIDE.gap) && sr.topOk,
        `右半邊(第 ${sr.col + 1} / ${sr.cols} 欄)但右側放得下:詳情左緣 − 事件右緣 ${fmtPx(sr.detail.left - sr.tile.right)}(規格 8,先開右側)、詳情上緣 ${fmtPx(sr.detail.top)} / 事件上緣 ${fmtPx(sr.tile.top)}`)
      const sf = await sideSample('DT-side-flip', 0)
      if (sf && !(sf.col === sf.cols - 1 && !sf.fitsRight)) instrumentFails.push({ cell: `DT-side-flip${tag}`, detail: `情境沒成立:第 ${sf.col + 1} / ${sf.cols} 欄、右側${sf.fitsRight ? '放得下' : '放不下'}(要最右一欄且右側放不下)` })
      else if (sf) check(`DT-side-flip${tag}`, near(sf.tile.left - sf.detail.right, DETAIL_SIDE.gap) && sf.detail.left >= DETAIL_SIDE.edge - 0.5 && sf.topOk,
        `最右一欄右側放不下:事件左緣 − 詳情右緣 ${fmtPx(sf.tile.left - sf.detail.right)}(規格 8,翻到左側)、詳情左緣 ${fmtPx(sf.detail.left)}(≥ 8)、詳情上緣 ${fmtPx(sf.detail.top)} / 事件上緣 ${fmtPx(sf.tile.top)}`)
      // DT-time-fit(詳情寬 calendar-geometry.ts CALENDAR_EVENT_DETAIL_WIDTH_PX 唯一的目的;calendar.spec.md「事件詳情浮層」寬):
      // 「設計審查」的時間欄進編輯 → DatePicker.Range showTime 兩端的字都不被裁。判準與截斷提示同一個(hooks/use-truncated.ts 預設:scrollWidth > clientWidth 才算被裁)。
      // DATE-TIME(定)2026-11-26 後預設 zh-TW 兩端是「2026/07/05 上午10:00」,寬是照數字推算的【AI 推導】—— 訊息印詳情寬與每端要的寬 / 分到的寬,CI 讀回的就是實量。
      // 對照組(timeFit)把詳情壓回 Popover 預設 288(2026-11-26 實量:288 時連 24 小時的「2026/07/05 10:00」都被裁)→ 這一格紅。
      if (!mutate || mutate.timeFit) {
        const tile = '[data-calendar-tile][data-calendar-event-id="d1"]'
        const field = `${detailSel} [data-calendar-detail-field="time"]`
        const ENDS = `${field} button[aria-haspopup="dialog"] > span`
        await page.click(tile)
        const reopened = await waitSel(detailSel, 'open')
        if (reopened) await page.click(`${field} button`).catch(() => {})
        const editing = reopened && await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, ENDS, { timeout: 5000 }).then(() => true, () => false)
        if (editing) await frames(3)
        const fit = editing ? await page.evaluate(({ s, d }) => ({
          width: document.querySelector(d)?.getBoundingClientRect().width ?? NaN,
          ends: [...document.querySelectorAll(s)].map((el) => ({ text: el.textContent ?? '', need: el.scrollWidth, have: el.clientWidth })),
        }), { s: ENDS, d: detailSel }) : null
        if (!fit) instrumentFails.push({ cell: `DT-time-fit${tag}`, detail: `詳情${reopened ? '打開了,但時間欄沒進編輯(找不到 DatePicker.Range 的兩端)' : '沒打開'} —— 量不到` })
        else if (fit.ends.some((e) => !e.text.trim())) instrumentFails.push({ cell: `DT-time-fit${tag}`, detail: `編輯中兩端有一端沒有字(${fit.ends.map((e) => `「${e.text}」`).join(' / ')})—— 量不到截斷` })
        else check(`DT-time-fit${tag}`, fit.ends.every((e) => e.need <= e.have),
          `詳情寬 ${fmtPx(fit.width)};編輯中兩端 ${fit.ends.map((e) => `「${e.text}」要 ${e.need} / 分到 ${e.have}`).join('、')}(規格:兩端都不被裁)`)
        // 收:一下一層 —— 日期浮層(2026-11-27 起點一下就開)→ 取消編輯(焦點回時間欄,同 DT-esc4-L1 / L2)→ 關詳情;詳情還開著才再按
        if (reopened) {
          for (let i = 0; i < 4 && (await page.$(`${detailSel}[data-state="open"]`)); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(350); await frames(4) }
          await waitSel(detailSel, 'closed')
        }
      }
      // DT-outside(一般密度):減少動態下,地點改到一半點頁面空白 = 先提交再關(calendar.spec.md「點外面」(1));再打開看得到新的地點。
      // 對照組(outsideAsEscape)改成按 Esc 取消編輯、再按 Esc 關 → 地點沒存 → 紅(證明這一格看得到「沒提交」)
      if (density === 'md' && (!mutate || mutate.outsideAsEscape)) {
        const tile = '[data-calendar-tile][data-calendar-event-id="d1"]'
        const field = `${detailSel} [data-calendar-detail-field="location"]`
        const newPlace = '台北辦公室 5F 訓練教室'
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.click(tile)
        const reopened = await waitSel(detailSel, 'open')
        await page.click(`${field} button`).catch(() => {})
        const input = await page.waitForSelector(`${field} input`, { timeout: 5000 }).catch(() => null)
        if (!reopened || !input) instrumentFails.push({ cell: 'DT-outside', detail: `詳情${reopened ? '' : '沒'}打開、地點${input ? '' : '沒'}進編輯 —— 量不到點外面` })
        else {
          await input.fill(newPlace)
          if (mutate?.outsideAsEscape) { await page.keyboard.press('Escape'); await frames(2); await page.keyboard.press('Escape') }
          else await page.mouse.click(5, 5) // 範例外框的內距(不在月曆上,點了不會新增事件)
          const gone = await waitSel(detailSel, 'closed')
          await frames(4)
          await page.click(tile)
          await waitSel(detailSel, 'open')
          const shown = await page.evaluate((s) => document.querySelector(s)?.textContent ?? '', field)
          check('DT-outside', gone && shown.includes(newPlace), `減少動態下改地點、點外面:詳情${gone ? '關了' : '沒關'},再打開地點「${shown.replace(/^地點/u, '')}」(規格:先提交再關 → 「${newPlace}」)`)
          await page.keyboard.press('Escape'); await waitSel(detailSel, 'closed')
        }
        await page.emulateMedia({ reducedMotion: null })
      }
      if (density !== 'md' || mutate) continue
      // DT-commit / DT-blank(只在一般密度、正式跑):改標題 → 月格跟著換;清空提交 → 還原原值
      const tileSel = '[data-calendar-tile][data-calendar-event-id="d1"]'
      const editTitle = async (text) => {
        await page.click(tileSel)
        if (!(await waitSel(detailSel, 'open'))) return false
        await page.click(`${detailSel} [data-calendar-detail-field="title"] button`)
        const input = await page.waitForSelector(`${detailSel} [data-calendar-detail-field="title"] input`, { timeout: 5000 }).catch(() => null)
        if (!input) return false
        await input.fill(text)
        await page.keyboard.press('Enter')
        await frames(4)
        return true
      }
      // 事件名稱 = labels.event 的「{標題},{時間}」(calendar.tsx DEFAULT_LABELS,分隔是半形逗號)
      const renamed = '設計審查 第二輪'
      const okCommit = await editTitle(renamed)
      const tileName1 = await axNameOf(`document.querySelector(${JSON.stringify(tileSel)})`)
      const detailName1 = await axNameOf(`document.querySelector(${JSON.stringify(detailSel)})`)
      check('DT-commit', okCommit && (tileName1 ?? '').startsWith(`${renamed},`) && detailName1 === renamed, `改標題後月格「${tileName1}」、詳情名稱「${detailName1}」`)
      await page.keyboard.press('Escape'); await waitSel(detailSel, 'closed'); await frames(2)
      const okBlank = await editTitle('')
      const tileName2 = await axNameOf(`document.querySelector(${JSON.stringify(tileSel)})`)
      check('DT-blank', okBlank && (tileName2 ?? '').startsWith(`${renamed},`), `清空提交後月格「${tileName2}」(規格:清空 = 還原原值)`)
      await page.keyboard.press('Escape'); await waitSel(detailSel, 'closed')
    }
    // DT-list:從「+N」清單開(設計規格「狀態行為:從清單開詳情」;子選單擺法先開右,7/22 右側放得下 → 往右):清單不關、詳情貼著清單外緣 8、上緣對齊那一列;
    // Esc 一次一層:第一下關詳情、焦點回那一列,第二下關清單、焦點回「+N」
    const p = await open(STORY.detailFromList, { label: '從清單開詳情', mutate })
    if (!p) return
    const listSel = `[data-calendar-more-list="${MORE_DAY}"]`
    if (!(await waitSel(detailSel, 'open'))) { instrumentFails.push({ cell: 'DT-list', detail: 'play 打開的詳情等不到(story 改了?)' }); return }
    if (mutate?.detailDom) await page.evaluate(mutate.detailDom)
    await frames(3)
    const l = await page.evaluate(({ d, s }) => {
      const detail = document.querySelector(d), list = document.querySelector(s)
      const row = list?.querySelector('[data-calendar-event-id="c3"]')
      if (!detail || !list || !row) return null
      const dr = detail.getBoundingClientRect(), lr = list.getBoundingClientRect(), rr = row.getBoundingClientRect()
      return { gap: dr.left - lr.right, top: dr.top, bottom: dr.bottom, rowTop: rr.top, viewportH: document.documentElement.clientHeight, rowOpen: row.hasAttribute('data-detail-open') }
    }, { d: detailSel, s: listSel })
    // 垂直:對齊那一列上緣;放不下時被推回視窗內、底留 collisionPadding 8(popover.spec.md / calendar.spec.md「放不下自動翻面」)—— 兩者之一
    const vOk = l && (near(l.top, l.rowTop) || (l.top < l.rowTop && near(l.bottom, l.viewportH - 8)))
    check('DT-list', Boolean(l) && near(l.gap, 8) && vOk && l.rowOpen,
      l ? `詳情左緣 − 清單右緣 ${fmtPx(l.gap)}(規格 8)、詳情上緣 ${fmtPx(l.top)} / 那一列上緣 ${fmtPx(l.rowTop)}(放不下時底 ${fmtPx(l.bottom)} = 視窗 ${l.viewportH} − 8)、那一列${l.rowOpen ? '' : '沒有'}帶 data-detail-open` : '找不到清單 / 詳情 / 那一列')
    await page.keyboard.press('Escape')
    const detailClosed = await waitSel(detailSel, 'closed')
    await frames(4)
    const first = await page.evaluate(({ s }) => ({ listOpen: Boolean(document.querySelector(s)), onRow: document.activeElement?.getAttribute('data-calendar-event-id') === 'c3' }), { s: listSel })
    await page.keyboard.press('Escape')
    const listClosed = await waitSel(listSel, 'closed')
    await frames(4)
    const onMore = await page.evaluate((day) => document.activeElement === document.querySelector(`[data-calendar-more="${day}"]`), MORE_DAY)
    check('DT-esc-layers', detailClosed && first.listOpen && first.onRow && listClosed && onMore,
      `第一下 Esc:詳情${detailClosed ? '關了' : '沒關'}、清單${first.listOpen ? '還在' : '被關了'}、焦點${first.onRow ? '回那一列' : '不在那一列'};第二下:清單${listClosed ? '關了' : '沒關'}、焦點${onMore ? '回「+N」' : '不在「+N」'}`)
    await detailDeep(mutate, { waitSel, detailSel, listSel })
  },
  async todayFirst(mutate) {
    await context.clock.setFixedTime(new Date(2026, 6, 1, 10, 0, 0))
    const first = await open(STORY.inspector, { label: 'Inspector 今天 = 7/1', args: 'today:!undefined', mutate })
    if (!first) return
    const one = first.dayBoxes['2026-07-01']
    const filled = one && one.bg !== 'rgba(0, 0, 0, 0)' && one.bg !== 'transparent'
    check('R1', filled && one.text === '7月1日' && one.textInside && near(one.padL, SPEC.inset) && near(one.padR, SPEC.inset) && one.textLeftPad >= SPEC.inset - 0.5 && one.textRightPad >= SPEC.inset - 0.5,
      one ? `今天 = 1 號:「${one.text}」實心底 ${one.bg}、字距框左 ${one.textLeftPad.toFixed(2)} / 右 ${one.textRightPad.toFixed(2)}(規格 ≥ 8)` : '找不到 7/1')
  },
}

// ── 對照組 ──────────────────────────────────────────────────────────────────
// 「k 不隨格高變」:把 ResizeObserver 換成不做事的版本再重新掛載(Storybook forceRemount)—— 元件只在掛載當下量一次格高,
// 之後容器變矮 / 變高 k 都不跟(= 量格高沒接上觀察者,或 k 寫死)。以原始碼序列化傳進頁面,不得引用外部變數。
const REMOUNT_WITHOUT_RESIZE_OBSERVER = async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  const before = document.querySelector('[role="grid"]')
  window.__STORYBOOK_ADDONS_CHANNEL__?.emit('forceRemount', { storyId: new URLSearchParams(location.search).get('id') })
  for (let i = 0; i < 300 && document.querySelector('[role="grid"]') === before; i++) await frame()
  for (let i = 0; i < 5; i++) await frame()
}
// 每個突變:套在哪個區塊、預期哪幾格紅(其他格紅不算數,也不要求綠)
const MUTANTS = [
  { name: '星期列搬出格陣', block: 'layout', expect: ['H1'], dom: () => { const g = document.querySelector('[role="grid"]'); const row = g?.querySelector('[role="row"]'); if (g && row) g.parentElement.insertBefore(row, g) } },
  { name: '週列高改 auto', block: 'layout', expect: ['W1'], css: '[role="grid"] [data-radix-scroll-area-viewport] > div > div { grid-template-rows: none !important; }' },
  { name: '最後一週留底線', block: 'layout', expect: ['W2'], css: '[role="gridcell"] { border-bottom-width: 1px !important; }' },
  { name: '格子內距 6(p-1.5)', block: 'layout', expect: ['D1'], css: '[role="gridcell"] { padding: 6px !important; }' },
  { name: '工具列改回內距撐高', block: 'layout', expect: ['T1-md', 'T1-lg'], css: '[role="grid"] { } [data-calendar-toolbar] { height: auto !important; padding-block: 12px !important; }' },
  // 外殼(calendar.spec.md「外殼」2026-11-27):框只圍格子區、工具列在框外 → tight → 框;不加框 / 貼邊兩種擺法
  { name: '框連工具列一起圍(2026-11-27 前的長相)', block: 'layout', expect: ['T5-md', 'T5-lg'], css: '[role="grid"] { border-width: 0 !important; border-radius: 0 !important; } div:has(> [role="grid"]) { border: 1px solid var(--divider) !important; }' },
  { name: '工具列貼著框(工具列 → 格子區 0)', block: 'layout', expect: ['T6-md', 'T6-lg'], css: 'div:has(> [role="grid"]) { gap: 0 !important; }' },
  { name: '有框時工具列也帶左右內距(沒對齊框的兩緣)', block: 'layout', expect: ['T7-md', 'T7-lg'], css: 'div:has(> [role="grid"]) > [data-calendar-toolbar] { padding-inline: 16px !important; }' },
  { name: '不加框時格子區照樣標 bounded', block: 'layout', expect: ['NB-T5-md', 'NB-T5-lg'], dom: () => document.querySelector('[role="grid"]')?.setAttribute('data-layout-region', 'bounded') },
  { name: '貼邊時工具列沒有左右內距(字貼著容器邊)', block: 'layout', expect: ['FL-F2-md', 'FL-F2-lg'], css: '[data-calendar-toolbar][data-flush] { padding-inline: 0 !important; }' },
  { name: '貼邊時容器左右還留內距(格子區沒貼齊)', block: 'layout', expect: ['FL-F1-md', 'FL-F1-lg'], css: 'div:has(> div > [data-calendar-toolbar][data-flush]) { padding-inline: 16px !important; }' },
  { name: 'nav 沒有名稱', block: 'layout', expect: ['T3'], dom: () => document.querySelector('[data-calendar-toolbar] nav')?.removeAttribute('aria-label') },
  { name: '欄頭名稱改成短字', block: 'layout', expect: ['H2'], dom: () => document.querySelectorAll('[role="columnheader"]').forEach((h) => h.setAttribute('aria-label', h.textContent)) },
  { name: '事件列高 20', block: 'layout', expect: ['E1'], css: '[data-calendar-tile] { height: 20px !important; }' },
  { name: '事件列焦點框改回往內', block: 'layout', expect: ['E3'], css: '[data-calendar-tile]:focus-visible { outline-offset: -2px !important; }' },
  { name: '捲動區可聚焦(viewportTabIndex 沒傳 null)', block: 'axe', expect: ['A1'], dom: () => document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.setAttribute('tabindex', '0') },
  { name: '週列捲動區不能捲', block: 'scroll', expect: ['S2'], css: '[role="grid"] [data-radix-scroll-area-viewport] { overflow: hidden !important; }' },
  // 回到 2026-11-25 首版的 60(沒算格線):最小高的週裡內容少 1px → 列不被壓就吃掉下內距(S4),週高也不是 61(S1)
  { name: '格最小高沒算格線(60)', block: 'scroll', expect: ['S1', 'S4'], css: '[role="grid"] { --calendar-cell-min-h: 60px !important; }' },
  // 每格放幾列沒有跟著格高(2026-11-25 前寫死每格 3 筆、事件版面那一包前列被壓扁的情況):掛載時格子高,壓到最小高後 k 不變 → 列超出格子被裁
  //(首版那個「事件列外層可被壓(min-h-0)」對照組在 k 依格高之後量不到東西 —— 最小高的週 k = 1、一列剛好放得下,沒有東西可壓;改成這一個)
  { name: 'k 不隨格高變(ResizeObserver 沒接上)— 最小高', block: 'squeeze', expect: ['S5'], early: REMOUNT_WITHOUT_RESIZE_OBSERVER },
  { name: '日期鈕的 focus() 失效', block: 'keyboardStop', expect: ['K1'], dom: () => { HTMLButtonElement.prototype.focus = function noop() {} } },
  { name: 'en-GB 卻寫死週日起', block: 'inspector', expect: ['L1'], gbArgs: 'locale:en-GB;weekStartsOn:0' },
  { name: '標題層級不跟 titleAs', block: 'inspector', expect: ['Q1'], titleArgs: 'titleAs:h2' },
  // 讀屏名稱:每個突變模擬一種退步(改 DOM 屬性 = 元件改錯時讀屏拿到的東西)
  { name: '日期名稱改回舊念法(yyyy-MM-dd,N 個事件)', block: 'namesClickable', expect: ['N1'], dom: () => document.querySelectorAll('button[data-calendar-day]').forEach((b) => b.setAttribute('aria-label', `${b.getAttribute('data-calendar-day')},0 個事件`)) },
  { name: '今天沒有 aria-current', block: 'namesClickable', expect: ['N2-click'], dom: () => document.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current')) },
  { name: 'aria-current 掛在每一天', block: 'namesClickable', expect: ['N2-click'], dom: () => document.querySelectorAll('button[data-calendar-day]').forEach((b) => b.setAttribute('aria-current', 'date')) },
  { name: '唯讀格的 aria-label 放回去', block: 'namesReadOnly', expect: ['N3-publish', 'N3-holiday'], dom: () => document.querySelectorAll('[role="gridcell"][data-calendar-day]').forEach((c) => c.setAttribute('aria-label', `${c.getAttribute('data-calendar-day')},0 個事件`)) },
  { name: '唯讀格看得見的日期數字沒有 aria-hidden', block: 'namesReadOnly', expect: ['N3-publish', 'N3-holiday'], dom: () => document.querySelectorAll('[role="gridcell"][data-calendar-day] [aria-hidden]').forEach((el) => el.removeAttribute('aria-hidden')) },
  { name: '唯讀格沒有 aria-current', block: 'namesReadOnly', expect: ['N2-readonly'], dom: () => document.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current')) },
  // 長條只在 DOM 所在那一格念得到:拿掉橫跨過來的長條補給讀屏的標題(= 只靠 DOM 位置,第 2 天起的唯讀格念不到)
  { name: '唯讀格念不到橫跨過來的長條', block: 'namesReadOnly', expect: ['N3-bar'], dom: () => document.querySelectorAll('[data-calendar-carried]').forEach((el) => el.remove()) },
  // labels 沒接上 = 元件裡寫死預設中文:名稱回到預設字串
  { name: 'labels 覆寫沒生效(寫死預設中文)', block: 'namesEnglish', expect: ['N4'], dom: () => {
    const fmt = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full' })
    document.querySelector('[role="grid"]')?.setAttribute('aria-label', '月行事曆,2026年7月')
    document.querySelectorAll('button[data-calendar-day]').forEach((b) => { const [y, m, d] = b.getAttribute('data-calendar-day').split('-').map(Number); b.setAttribute('aria-label', `${fmt.format(new Date(y, m - 1, d))},0 個事件`) })
  } },
  // 隱藏週末:跳過被藏日子的邏輯不見時,落點是沒畫出來的日子 → 焦點落空(模擬:方向鍵 / Home / End 一按焦點就離開格陣)
  { name: '跳過被藏日子的邏輯不見(焦點落空)', block: 'hideWeekends', expect: ['HW2'], dom: () => document.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key) && document.activeElement?.hasAttribute('data-calendar-day')) { e.preventDefault(); e.stopImmediatePropagation(); document.activeElement.blur() }
  }, true) },
  // 1 號被藏時停靠點仍落在 1 號(沒畫出來)→ 格陣 0 個 Tab 停靠點(模擬:換月後每一天都被設成 -1)
  { name: '1 號被藏時沒有停靠點', block: 'hideWeekends', expect: ['HW3'], after: () => document.querySelectorAll('[role="grid"] [data-calendar-day][tabindex="0"]').forEach((el) => el.setAttribute('tabindex', '-1')) },
  { name: '週末寫死週六日(en-IL 照 en-US 藏)', block: 'hideWeekends', expect: ['HW4'], ilArgs: 'locale:en-US;hideWeekends:!true' },
  // 週數欄
  { name: '星期列的週數欄沒讀同一個欄寬(寫死 2rem)', block: 'weekNumbers', expect: ['WN1'], dom: () => {
    const head = document.querySelector('[role="grid"] [role="row"]')
    if (head) head.style.gridTemplateColumns = head.style.gridTemplateColumns.replace('var(--calendar-week-number-w)', '2rem')
  } },
  // 週數欄寬改回 2026-11-26 前的 calc(2 × 空隙 + 2ch)(ch 在兩個格陣容器的 text-body 上解析,與當時相同):欄比「4 + 日期框 + 4 + 格線」窄
  { name: '週數欄寬改回 2ch 公式', block: 'weekNumbers', expect: ['WN5-lg-zh-TW', 'WN5-md-zh-TW', 'WN5-md-en-US', 'WN5-lg-en-US'],
    css: '[role="grid"] { --calendar-week-number-w: calc(2 * var(--calendar-gap) + 2ch) !important; }' },
  // 週數不放框、直接靠格子內距(框縮成字寬 = 2026-11-26 前的結構):週數框比日期框窄、字離格線比日期近
  { name: '週數不放框(直接內距)', block: 'weekNumbers', expect: ['WN5-lg-zh-TW', 'WN5-md-zh-TW', 'WN5-md-en-US', 'WN5-lg-en-US'],
    css: '[role="rowheader"] > * { min-width: 0 !important; }' },
  { name: '週數格可聚焦(進了 Tab 序列)', block: 'weekNumbers', expect: ['WN2'], dom: () => document.querySelectorAll('[role="rowheader"]').forEach((r) => r.setAttribute('tabindex', '0')) },
  { name: '週數字加粗、主色', block: 'weekNumbers', expect: ['WN3'], css: '[role="rowheader"] { font-weight: 500 !important; color: var(--color-foreground, #000) !important; }' },
  // firstWeekContainsDate 寫死 1:en-GB 年底那一列(含 1/1)變成第 1 週(模擬元件算錯時畫出來的數字)
  { name: '週數第一週天數寫死 1(en-GB 年底那列變第 1 週)', block: 'weekNumbers', expect: ['WN4-en-GB'], after: () => {
    const row = document.querySelector('[role="grid"] [data-calendar-day="2027-01-01"]')?.closest('[role="gridcell"]')?.parentElement
    const rh = row?.querySelector(':scope > [role="rowheader"] span')
    if (rh) rh.textContent = '1'
  } },
  // 載入中
  { name: '格陣沒帶 aria-busy', block: 'loading', expect: ['LD1'], dom: () => document.querySelector('[role="grid"]')?.removeAttribute('aria-busy') },
  { name: '骨架拿掉 aria-hidden', block: 'loading', expect: ['LD2'], dom: () => document.querySelectorAll('[role="gridcell"] [aria-hidden="true"]').forEach((el) => { if (!el.hasAttribute('data-calendar-day')) el.removeAttribute('aria-hidden') }) },
  { name: '載入中日期名稱照念筆數', block: 'loading', expect: ['LD3'], dom: () => document.querySelectorAll('button[data-calendar-day]').forEach((b) => b.setAttribute('aria-label', `${b.getAttribute('aria-label')},0 個事件`)) },
  { name: '載入中格子點不到(停用操作)', block: 'loading', expect: ['LD4'], css: '[role="gridcell"] { pointer-events: none !important; }' },
  // 窄寬度
  { name: '窄寬沒接上(星期字不縮、1 號照寫月份)', block: 'narrow', expect: ['NW1', 'NW2'], dom: () => {
    const g = document.querySelector('[role="grid"]')
    const undo = () => {
      g.querySelectorAll('[role="columnheader"] span').forEach((s) => { if ([...s.textContent].length === 1) s.textContent = `週${s.textContent}` })
      g.querySelectorAll('[data-calendar-day$="-01"]').forEach((d) => { if (d.textContent === '1') d.textContent = `${Number(d.getAttribute('data-calendar-day').slice(5, 7))}月1日` })
    }
    new MutationObserver(undo).observe(g, { subtree: true, childList: true, characterData: true }); undo()
  } },
  // 門檻改看內容寬 = 量到的寬跟著畫出來的內容變:寬版的字讓格陣窄 28、窄版的字讓它回來 → 門檻附近每幀來回跳(模擬「內容回授到量測」)
  { name: '門檻改看內容寬(內容回授到量測 → 來回跳)', block: 'narrow', expect: ['NW2'], dom: () => {
    const g = document.querySelector('[role="grid"]')
    const apply = () => { const head = g.querySelector('[role="columnheader"] span')?.textContent ?? ''; g.style.marginRight = [...head].length === 1 ? '0px' : '28px' }
    new MutationObserver(apply).observe(g, { subtree: true, childList: true, characterData: true }); apply()
  } },
  // 量欄寬改回量畫面寬(getBoundingClientRect,2026-11-25 首版):日期格的 width 讀到的是祖先縮放後的寬。沒有縮放時兩者相同(NW1 / NW2 照綠),
  // 掛載當下有縮放就讀成窄、拿掉縮放後觀察者不再回報 → 卡在窄版
  { name: '量欄寬改量畫面寬(祖先縮放時讀到縮小後的寬)', block: 'narrow', expect: ['NW3'], dom: () => {
    const real = window.getComputedStyle
    const visualWidth = (el) => `${el.getBoundingClientRect().width}px`
    window.getComputedStyle = function visualWidthComputedStyle(el, pseudo) {
      const style = real.call(window, el, pseudo)
      if (!(el instanceof Element) || el.getAttribute('role') !== 'gridcell') return style
      return new Proxy(style, { get(target, key) {
        if (key === 'width') return visualWidth(el)
        if (key === 'getPropertyValue') return (name) => (name === 'width' ? visualWidth(el) : target.getPropertyValue(name))
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    }
  } },
  // 跨日長條(B1 / B4 / B6)
  { name: '長條改回逐日方塊(每涵蓋一天各一塊)', block: 'bars', expect: ['B1'], dom: () => {
    const g = document.querySelector('[role="grid"]')
    const bar = [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === 'Alex 休假')
    if (!bar) return
    for (const iso of bar.getAttribute('data-calendar-covers').split(' ')) {
      const area = g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')?.children[1]
      const copy = bar.cloneNode(true)
      copy.style.width = ''
      copy.setAttribute('data-calendar-covers', iso)
      area?.append(copy)
    }
    bar.remove()
  } },
  // 沒阻止冒泡 = 點擊冒到長條 DOM 所在的那一格(長條在第一格 → 在 7/20 新增;唯讀列 → 在 7/3 新增)
  { name: '事件列 / 長條沒阻止冒泡(點擊冒到它所在的格子)', block: 'bars', expect: ['B4-bar', 'B4-readonly'], dom: () => document.addEventListener('click', (e) => {
    const piece = e.target instanceof Element ? e.target.closest('[data-calendar-covers]') : null
    if (piece) piece.closest('[role="gridcell"]')?.click()
  }, true) },
  // 格子是定位元素:後面的格子(DOM 在長條之後)蓋在長條上,點第 3 天那段落到第 3 格
  { name: '格子是定位元素(後面的格子蓋住長條)', block: 'bars', expect: ['B4-bar'], css: '[role="gridcell"] { position: relative !important; }' },
  // 格內 widget 只查格子自己(長條只認它所在的第一天)
  { name: 'F2 只查格子自己的子孫(從長條的第 2 天進不了格)', block: 'bars', expect: ['B6'], dom: () => document.querySelectorAll('[data-calendar-covers]').forEach((el) => el.setAttribute('data-calendar-covers', el.getAttribute('data-calendar-covers').split(' ')[0])) },
  // 格子的滑過與格內鍵盤(HV / KE / E4;2026-11-25 格內互動那一包)
  // 格子的滑過底色回來(2026-11-26 前的樣子:整格 --neutral-hover;2026-11-25 前是純 CSS :hover)—— 指在空白、長條、唯讀列上格子都會變
  { name: '格子的滑過底色回來(整格 --neutral-hover)', block: 'interaction', expect: ['HV1'],
    css: '[role="gridcell"]:hover { background-color: var(--neutral-hover) !important; }' },
  // 只在指標底下那一格(2026-11-25〜26 的屬性代理那一版的畫面,不經元件 —— 由注入的指標追蹤標 data-cell-lit):指在長條第 3 天那段亮第 3 天
  { name: '格子的滑過底色回來(只亮指標底下那一格)', block: 'interaction', expect: ['HV1'], css: '[role="gridcell"][data-cell-lit] { background-color: var(--neutral-hover) !important; }',
    dom: () => document.addEventListener('pointermove', (e) => {
      document.querySelectorAll('[data-cell-lit]').forEach((c) => c.removeAttribute('data-cell-lit'))
      document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.getAttribute('role') === 'gridcell')?.setAttribute('data-cell-lit', '')
    }, true) },
  // 格子空白處不是手形(拿掉格子的 cursor-pointer,日期鈕照舊是手形:base.css 的 button)
  { name: '格子空白處游標改回箭頭', block: 'interaction', expect: ['HV2'], css: '[role="gridcell"] { cursor: default !important; }' },
  // 點擊沒落在指標底下那天:點格子空白處的點擊被交給前一格(同 B4 的冒泡突變寫法;模擬「長條 DOM 在第一格 → 冒泡到第一格」這一類錯日)
  { name: '格子空白處的點擊交給前一天', block: 'interaction', expect: ['HV3'], dom: () => document.addEventListener('click', (e) => {
    const cell = e.target instanceof Element && e.target.getAttribute('role') === 'gridcell' ? e.target : null
    const prev = cell?.previousElementSibling
    if (!cell || prev?.getAttribute('role') !== 'gridcell' || window.__calendarRedirected) return
    e.stopPropagation()
    window.__calendarRedirected = true
    prev.click()
    window.__calendarRedirected = false
  }, true) },
  // 出格回長條 DOM 所在那一天(2026-11-25 前的 dayStopOf(焦點所在那一格)):Esc / F2 在元件之前被接走,焦點送回 DOM 所在那一格的停靠點
  { name: 'Esc / F2 出格回長條 DOM 所在那一天(不記進格那一天)', block: 'interaction', expect: ['KE1', 'KE2', 'KE3'], dom: () => document.addEventListener('keydown', (e) => {
    const a = document.activeElement
    if ((e.key !== 'Escape' && e.key !== 'F2') || !a?.hasAttribute('data-calendar-tile')) return
    const cell = a.closest('[role="gridcell"]')
    const stop = cell?.matches('[data-calendar-day]') ? cell : cell?.querySelector('[data-calendar-day]')
    if (!stop) return
    e.preventDefault(); e.stopImmediatePropagation(); stop.focus()
  }, true) },
  // 滑鼠按在長條上時不記是哪一天:按下事件到不了元件(在 window 捕獲就停),焦點照樣落在長條上(按下的預設動作不受影響)
  { name: '滑鼠按在長條上不記哪一天', block: 'interaction', expect: ['KE3'], dom: () => window.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-calendar-tile]')) e.stopPropagation()
  }, true) },
  { name: '長條的焦點框改往內', block: 'interaction', expect: ['E4'], css: '[data-calendar-covers][data-calendar-tile]:focus-visible { outline-offset: -2px !important; }' },
  // 手形掛在整個格陣上(而不是每一格):捲軸繼承手形 —— 指在捲軸上看起來能點,按下去卻是捲動
  { name: '手形掛在整個格陣上(捲軸也變手形)', block: 'scrollbar', expect: ['HV4'], css: '[role="grid"] { cursor: pointer !important; }' },
  // 斷開端(B2)
  { name: '斷開那一端也圓角(一律 rounded)', block: 'segments', expect: ['B2-week', 'B2-hidden', 'B2-weekend'], css: '[data-calendar-covers] { border-radius: 4px !important; }' },
  // 被藏的週末不切段:週五、週一兩段連成一條(模擬版面沒在被藏的日子切開時畫出來的樣子)
  { name: '被藏的日子不切段(週五、週一連成一條)', block: 'segments', expect: ['B2-hidden'], dom: () => {
    const two = [...document.querySelectorAll('[role="grid"] [data-calendar-covers]')].filter((el) => el.textContent.trim() === '機房搬遷')
    if (two.length !== 2) return
    const [a, b] = two.sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)
    a.style.width = `${b.getBoundingClientRect().right - a.getBoundingClientRect().left}px`
    b.remove()
  } },
  // 每格放幾列(B3)
  { name: 'k 不隨格高變(ResizeObserver 沒接上)— 掃格高', block: 'rowsFit', expect: ['B3-k', 'B3-fit'], early: REMOUNT_WITHOUT_RESIZE_OBSERVER },
  // k 與格子的幾何對不上:日期框到事件區多 / 少一列的空間(= 算式多扣 / 少扣一段)
  { name: 'k 少算一列(「+N」下面還放得下一列)', block: 'rowsFit', expect: ['B3-fit'], css: '[role="gridcell"] > :first-child { margin-bottom: -28px !important; }' },
  { name: 'k 多算一列(列超出格子被裁)', block: 'rowsFit', expect: ['B3-fit'], css: '[role="gridcell"] > :first-child { margin-bottom: 28px !important; }' },
  // 深色主題長條底(B7):拿掉不透明的格子底 → 深色的半透明淡底透出格線(淺色的淡底不透明,照綠)
  { name: '長條沒墊不透明的格子底', block: 'underlay', expect: ['B7-dark'], css: '[data-calendar-covers] { background: none !important; }' },
  // 自訂方塊內容過大(CT):外層不裁(= 2026-11-25 規格核對前的樣子)→ 內容畫到下一列與隔壁格、接走那裡的點擊
  { name: '一段事件的外層不裁內容(自訂內容畫到下一列與隔壁格)', block: 'customTile', expect: ['CT1', 'CT2'], css: '[data-calendar-covers] { overflow: visible !important; }' },
  // 裁切連焦點框一起裁掉(clip-path 會裁到元素自己的 outline;overflow 不會)
  { name: '外層的裁切連焦點框一起裁掉', block: 'customTile', expect: ['CT3'], css: '[data-calendar-covers] { clip-path: inset(0) !important; }' },
  // 事件的兩種長相(AP / MX / NE / RO / TF / NT / CR;2026-11-25 事件長相那一包)
  { name: '全天長條帶回左側 3px 色條(2026-11-25 前的長相)', block: 'looks', expect: ['AP1'], css: '[data-calendar-covers] > :first-child:not(:has([data-calendar-accent])) { border-left: 3px solid var(--color-yellow-6) !important; }' },
  { name: '有時段列有底(改回淡底)', block: 'looks', expect: ['AP2'], css: '[data-calendar-covers] > :first-child:has([data-calendar-accent]) { background-color: var(--color-blue-1) !important; }' },
  { name: '色條撐滿列高、直角(BAR 的 C 版)', block: 'looks', expect: ['AP2'], css: '[data-calendar-accent] { height: var(--tag-height-md) !important; border-radius: 0 !important; }' },
  { name: '色條後面不留間隔(字左緣差 4)', block: 'looks', expect: ['AP3'], css: '[data-calendar-covers] > :first-child:has([data-calendar-accent]) { gap: 0 !important; }' },
  { name: '時間字改主色(TIMECOLOR 反了)', block: 'looks', expect: ['AP4'], css: '[data-calendar-time] { color: var(--foreground) !important; }' },
  // 時間格式寫死 en-US(不跟 locale):畫面上的時間變成「10:00 AM」這種(模擬元件寫死 'en-US' 時畫出來的字)
  { name: '時間格式寫死 en-US(不跟 locale)', block: 'looks', expect: ['AP5'], dom: () => document.querySelectorAll('[data-calendar-time]').forEach((t) => { t.textContent = t.textContent.replace(/^上午(.*)$/u, '$1 AM').replace(/^下午(.*)$/u, '$1 PM') }) },
  { name: '事件名稱改回「事件:{標題}」', block: 'looks', expect: ['AP6'], dom: () => document.querySelectorAll('[data-calendar-tile]').forEach((el) => { const t = el.querySelector('[data-calendar-time]'); el.setAttribute('aria-label', `事件:${(t ? el.textContent.replace(t.textContent, '') : el.textContent).trim()}`) }) },
  { name: '有時段列滑過借了別的配對(--secondary-hover)', block: 'looks', expect: ['AP7'], css: '[data-calendar-covers] > :first-child:has([data-calendar-accent]):hover { background-color: var(--secondary-hover) !important; }' },
  // neutral 回落成 blue(元件沒處理 'neutral' 時的畫面:長條 / 色條都畫成 blue)
  { name: 'neutral 回落成 blue', block: 'matrix', expect: ['NE1', 'NE2', 'NE3'], dom: () => document.querySelectorAll('[data-calendar-covers]').forEach((el) => {
    const t = el.querySelector('[data-calendar-time]')
    const title = (t ? el.textContent.replace(t.textContent, '') : el.textContent).trim()
    if (title !== 'neutral' && title !== '公司創立紀念日') return
    const accent = el.querySelector('[data-calendar-accent]')
    if (accent) accent.style.backgroundColor = 'var(--color-blue-6)'
    else { el.firstElementChild.style.backgroundColor = 'var(--color-blue-1)'; el.firstElementChild.style.color = 'var(--color-blue-7)' }
  }) },
  { name: '12 色相的色條色錯位(CAT_ACCENT 接到 step-7)', block: 'matrix', expect: ['MX'], css: '[data-calendar-accent] { background-color: var(--color-red-7) !important; }' },
  { name: '唯讀的列滑過會亮', block: 'readOnlyHover', expect: ['RO1'], css: '[data-calendar-covers]:not([data-calendar-tile]) > :first-child:hover { background-color: var(--neutral-hover) !important; }' },
  { name: 'eventTimeFormat 沒接上(照 en-US 預設 10:00 AM)', block: 'timeFormat', expect: ['TF1'], dom: () => document.querySelectorAll('[data-calendar-time]').forEach((t) => { t.textContent = '10:00 AM' }) },
  // 窄寬沒拿掉時間:有色條的列照樣畫時間(模擬窄寬旗標沒接到事件長相)
  { name: '窄寬沒拿掉時間', block: 'narrowTime', expect: ['NT1'], dom: () => document.querySelectorAll('[data-calendar-accent]').forEach((a) => {
    const text = a.nextElementSibling
    if (text && !text.querySelector('[data-calendar-time]')) { const s = document.createElement('span'); s.setAttribute('data-calendar-time', ''); s.textContent = '下午2:00'; text.prepend(s) }
  }) },
  { name: '時間字太淡(淺色主題對比不足)', block: 'contrast', expect: ['CR-light'], css: '[data-calendar-time] { color: rgb(200, 200, 200) !important; }' },
  // 「+N」與當天清單(ML;2026-11-26「+N」清單那一包)。listDom = 清單開著之後才套(收到 { day })
  { name: '「+N」的焦點歸還失效(Esc 後焦點不回「+N」)', block: 'moreList', expect: ['ML-esc@md', 'ML-esc@lg'], listDom: ({ day }) => { const b = document.querySelector(`[data-calendar-more="${day}"]`); if (b) b.focus = () => {} } },
  { name: '「+N」改回淡灰小字(text-caption text-fg-muted,改前的長相)', block: 'moreList', expect: ['ML-trigger@md', 'ML-trigger@lg'], css: '[data-calendar-more] { font-size: var(--font-caption-size) !important; color: var(--fg-muted) !important; }' },
  { name: '「+N」焦點框改往內', block: 'moreList', expect: ['ML-ring@md', 'ML-ring@lg'], css: '[data-calendar-more]:focus-visible { outline-offset: -2px !important; }' },
  { name: '清單列焦點框改回往外', block: 'moreList', expect: ['ML-row-ring@md', 'ML-row-ring@lg'], css: '[data-calendar-list-row]:focus-visible { outline-offset: 2px !important; }' },
  // 點擊冒泡到格子(= 「+N」沒阻止冒泡):在「+N」上點一下,同時在格子上派一次點擊 —— 格子的 onDateClick 開「新增事件」
  { name: '點「+N」冒泡到格子(沒阻止冒泡)', block: 'moreList', expect: ['ML-click@md', 'ML-click@lg'], dom: () => document.querySelectorAll('[data-calendar-more]').forEach((b) => b.addEventListener('click', () => b.closest('[role="gridcell"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))) },
  { name: '清單沒蓋在格子上(往下偏 40)', block: 'moreList', expect: ['ML-center@md', 'ML-center@lg'], css: '[data-calendar-more-list] { margin-top: 40px !important; }' },
  { name: '清單寬不管格寬(寫死比格子窄)', block: 'moreList', expect: ['ML-width@md', 'ML-width@lg'], css: '[data-calendar-more-list] { min-width: 0 !important; width: 120px !important; }' },
  { name: '標題列底下畫回分隔線', block: 'moreList', expect: ['ML-head@md', 'ML-head@lg'], css: '[data-calendar-more-list] [data-slot="surface-header"] { border-bottom-width: 1px !important; }' },
  { name: '清單 body 恢復上內距(pt 12)', block: 'moreList', expect: ['ML-head@md', 'ML-head@lg'], css: '[data-calendar-more-list] [data-slot="surface-body"] { padding-top: 12px !important; }' },
  { name: '清單順序與格內不同(倒過來)', block: 'moreList', expect: ['ML-order@md', 'ML-order@lg'], listDom: ({ day }) => { const l = document.querySelector(`[data-calendar-more-list="${day}"] [role="list"]`); if (l) [...l.children].reverse().forEach((c) => l.append(c)) } },
  { name: '唯讀的列變成按鈕', block: 'moreList', expect: ['ML-ro@md', 'ML-ro@lg'], listDom: ({ day }) => document.querySelectorAll(`[data-calendar-more-list="${day}"] [role="listitem"] > div`).forEach((d) => d.setAttribute('role', 'button')) },
  { name: '清單沒有高度上限(maxHeight 不設)', block: 'moreList', expect: ['ML-half@md', 'ML-half@lg'], css: '[data-calendar-more-list] { max-height: none !important; }' },
  // 拿掉修法(可點的列回到 <button> 預設的 inline-block):本機字型下列高可能剛好 24,行高放大那一次一定撐高 —— 2026-11-26 Linux CI 的成因
  { name: '清單的可點列改回 inline-block(列高由那一行的字型撐)', block: 'moreList', expect: ['ML-rowh@md', 'ML-rowh@lg'], css: '[data-calendar-more-list] button[data-calendar-list-row] { display: inline-block !important; }' },
  { name: '標題列跟著捲(外殼自己捲、內文區不捲)', block: 'moreList', expect: ['ML-sticky@md', 'ML-sticky@lg'], css: '[data-calendar-more-list] { overflow-y: auto !important; } [data-calendar-more-list] [data-slot="surface-body"] { flex: none !important; overflow: visible !important; }' },
  { name: '清單底部沒有內距(最後一列貼底)', block: 'moreList', expect: ['ML-bottom@md', 'ML-bottom@lg'], css: '[data-calendar-more-list] [data-slot="surface-body"] { padding-bottom: 0 !important; }' },
  { name: '點外面關清單後焦點被搶回「+N」', block: 'moreList', expect: ['ML-outside@md', 'ML-outside@lg'], dom: () => document.addEventListener('pointerup', (e) => { if (e.target instanceof Element && e.target.closest('[data-calendar-more], [data-calendar-more-list]')) return; setTimeout(() => document.querySelector('[data-calendar-more="2026-07-22"]')?.focus(), 30) }, true) },
  // DT 事件詳情浮層:每一格一個退步
  { name: '詳情拿掉 aria-labelledby(浮層沒有名字)', block: 'detail', expect: ['DT-name@md', 'DT-name@lg'], detailDom: () => document.querySelector('[data-calendar-event-detail]')?.removeAttribute('aria-labelledby') },
  { name: '標題列放回 sm 欄位高的佔位(2026-11-27 前可編輯標題列的高,52 / 56)', block: 'detail', expect: ['DT-head@md', 'DT-head@lg'], css: '[data-calendar-event-detail] [data-slot="surface-header"] { --surface-chrome-slot-h: var(--field-height-sm) !important; }' },
  // 用 translate 位移(不進定位器的量測):大密度的詳情 2026-11-27 起較高、會被碰撞往上推,改 margin 的話定位器會連 margin 一起推回、量不出錯位
  { name: '詳情開在事件下方(沒有側邊開、頂端對齊)', block: 'detail', expect: ['DT-side@md', 'DT-side@lg'], css: '[data-calendar-event-detail] { translate: 0 40px !important; }' },
  // 以位移重現舊幾何(元件的 side 由 React 傳給定位器,頁面外改不到):在星期右半邊、左側放得下 → 搬到事件左側隔 8(= 2026-11-26 前 sideTowardCenter 的結果)
  { name: '改回朝格陣中央(右半邊的欄往左開)', block: 'detail', expect: ['DT-side-right@md', 'DT-side-right@lg'],
    sideDom: ({ d, t, gap, edge }) => {
      const detail = document.querySelector(d), tile = document.querySelector(t), cell = tile?.closest('[role="gridcell"]')
      const cells = cell ? [...cell.parentElement.children].filter((el) => el.getAttribute('role') === 'gridcell') : []
      if (!detail || !cell || cells.indexOf(cell) <= (cells.length - 1) / 2) return
      const dr = detail.getBoundingClientRect(), want = tile.getBoundingClientRect().left - gap - dr.width
      if (want >= edge) detail.style.setProperty('translate', `${want - dr.left}px 0px`, 'important')
    } },
  // 重現「關掉碰撞翻面」(avoidCollisions false):不管放不放得下都留在事件右側隔 8
  { name: '右側放不下也不翻面', block: 'detail', expect: ['DT-side-flip@md', 'DT-side-flip@lg'],
    sideDom: ({ d, t, gap }) => {
      const detail = document.querySelector(d), tile = document.querySelector(t)
      if (!detail || !tile) return
      detail.style.setProperty('translate', `${tile.getBoundingClientRect().right + gap - detail.getBoundingClientRect().left}px 0px`, 'important')
    } },
  { name: '詳情寬壓回 Popover 預設 288(時間欄編輯中兩端被裁)', block: 'detail', expect: ['DT-time-fit@md', 'DT-time-fit@lg'], timeFit: true, css: '[data-calendar-event-detail] { width: 288px !important; }' },
  { name: '欄位改回水平排(標籤在左)', block: 'detail', expect: ['DT-vertical@md', 'DT-vertical@lg'], css: '[data-calendar-detail-field] { display: grid !important; grid-template-columns: 96px minmax(0, 1fr) !important; }' },
  { name: '標籤沒套閱讀情境(主色)', block: 'detail', expect: ['DT-label@md', 'DT-label@lg'], css: '[data-calendar-detail-field] label { color: var(--foreground) !important; }' },
  { name: 'body 底部改成 48(大容器的 bottom)', block: 'detail', expect: ['DT-gap@md', 'DT-gap@lg'], css: '[data-calendar-event-detail] [data-popover-body] { padding-bottom: 48px !important; }' },
  { name: '打開詳情的那一段沒有標記', block: 'detail', expect: ['DT-mark@md', 'DT-mark@lg'], detailDom: () => document.querySelectorAll('[data-detail-open]').forEach((el) => el.removeAttribute('data-detail-open')) },
  { name: 'Esc 關詳情後焦點不回事件', block: 'detail', expect: ['DT-esc@md', 'DT-esc@lg'], detailDom: () => document.querySelectorAll('[data-calendar-event-id]').forEach((el) => { el.focus = () => {} }) },
  { name: '從清單開時詳情沒貼著清單(往右偏 40)', block: 'detail', expect: ['DT-list'], css: '[data-calendar-event-detail] { margin-left: 40px !important; }' },
  { name: '點外面沒提交(改成按 Esc 取消編輯再關,地點沒存)', block: 'detail', expect: ['DT-outside'], outsideAsEscape: true },
  { name: '只能看時欄位裡多一顆可點的鈕', block: 'detail', expect: ['DT-readonly'], readonlyDom: () => { const f = document.querySelector('[data-calendar-event-detail] [data-calendar-detail-field="time"]'); const b = document.createElement('button'); b.textContent = '編輯'; f?.append(b) } },
  { name: '只能看時空的地點欄照樣列出', block: 'detail', expect: ['DT-readonly'], readonlyDom: () => { const g = document.querySelector('[data-calendar-event-detail] [data-calendar-detail-field="time"]')?.parentElement; const f = document.createElement('div'); f.setAttribute('data-calendar-detail-field', 'location'); g?.append(f) } },
  { name: '還回來的焦點是看得見的焦點(先按 Shift 再交還)→ 提示照開', block: 'detail', expect: ['DT-tip'], tipFocusVisible: true },
  { name: '提交標題之外又多交回一次(再改地點)', block: 'detail', expect: ['DT-commit-call'], commitExtra: true },
  { name: '事件移走後新位置的方塊拿不到焦點', block: 'detail', expect: ['DT-move'], moveFocusNoop: true },
  { name: '移到畫面外時找不到後備的日期停靠點', block: 'detail', expect: ['DT-fallback'], fallbackStrip: true },
  { name: '日期浮層那一下 Esc 連編輯一起取消', block: 'detail', expect: ['DT-esc4-L1'], escDoubleAt: 1 },
  { name: '取消編輯那一下 Esc 連詳情一起關', block: 'detail', expect: ['DT-esc4-L2'], escDoubleAt: 2 },
  { name: '關詳情那一下 Esc 連清單一起關', block: 'detail', expect: ['DT-esc4-L3'], escDoubleAt: 3 },
  { name: '關清單那一下 Esc 又往外傳(焦點離開「+N」)', block: 'detail', expect: ['DT-esc4-L4'], escDoubleAt: 4 },
  { name: '起訖鈕被截斷(字距撐開 = Linux 字寬)時,關截斷提示那一下 Esc 連編輯一起取消', block: 'detail', expect: ['DT-esc4-tip'], escDoubleAt: 'tip', css: '[data-calendar-event-detail] [data-calendar-detail-field="time"] button span { letter-spacing: 3px !important; }' },
  { name: '滑過「下個月」之前「上個月」的提示剛開過(掃描窗口內立即開)', block: 'detail', expect: ['DT-tip-delay'], tipDelaySkip: true },
  { name: '點詳情改成點格子(清單外)', block: 'detail', expect: ['DT-nest'], nestClickGrid: true },
  // ALLDAY-VIEW(定) 2026-11-27:排在 detail 突變的最後,既有突變的分片歸屬不動
  { name: '只能看時照樣畫全天欄', block: 'detail', expect: ['DT-allday'], alldayView: () => { const t = document.querySelector('[data-calendar-event-detail] [data-calendar-detail-field="time"]'); const f = document.createElement('div'); f.setAttribute('data-calendar-detail-field', 'allDay'); t?.after(f) } },
  { name: '能編輯時全天欄不是開關(拿掉 role=switch)', block: 'detail', expect: ['DT-allday'], alldayEdit: () => document.querySelector('[data-calendar-event-detail] [data-calendar-detail-field="allDay"] [role="switch"]')?.removeAttribute('role') },
  // 事件詳情客製(2026-11-27,calendar.spec.md「事件詳情浮層」):排在 detail 突變的最後,既有突變的分片歸屬不動
  { name: '標題列按鈕佔位回到 14px 標題那一行(21)—— 16px 標題與 ⋯ / × 錯開', block: 'detail', expect: ['DT-center@md', 'DT-center@lg'], css: '[data-calendar-event-detail] [data-slot="surface-header"] { --surface-chrome-slot-h: calc(var(--font-body-size) * 1.5) !important; }' },
  { name: '標題列畫回底線', block: 'detail', expect: ['DT-head@md', 'DT-head@lg'], css: '[data-calendar-event-detail] [data-slot="surface-header"] { border-bottom-width: 1px !important; }' },
  { name: '詳情外殼沒開版面間距大檔', block: 'detail', expect: ['DT-head@md', 'DT-head@lg'], detailDom: () => document.querySelector('[data-calendar-event-detail] [data-layout-space="lg"]')?.removeAttribute('data-layout-space') },
  { name: '欄與欄改回 FieldGroup 通則 loose', block: 'detail', expect: ['DT-gap@md', 'DT-gap@lg'], css: '[data-calendar-event-detail] [data-field-group] { row-gap: var(--layout-space-loose) !important; }' },
  { name: '詳情寬回到 416(版面間距大檔之前)', block: 'detail', expect: ['DT-width@md', 'DT-width@lg'], css: '[data-calendar-event-detail] { width: 416px !important; }' },
  // 必須最後一個(todayFirst 會釘住時鐘,見該區塊註解)
  { name: '1 號的實心底被壓成 24 寬', block: 'todayFirst', expect: ['R1'], css: '[data-calendar-day="2026-07-01"] { padding: 0 !important; max-width: var(--tag-height-md) !important; }' },
]

// ── 分片表驗證(每一種跑法都驗;不成立 = 這一格紅,見檔頭「分片」)──────────────────
const BLOCK_NAMES = Object.keys(BLOCKS)
const secondsSince = (t) => ((Date.now() - t) / 1000).toFixed(1)
{
  const problems = shardPlanProblems(CALENDAR_MONTH_SHARDS, BLOCK_NAMES, MUTANTS)
  if (SHARD && SHARD.n !== CALENDAR_MONTH_SHARDS.length) problems.push(`--shard 的 n = ${SHARD.n},分片表有 ${CALENDAR_MONTH_SHARDS.length} 片(ci.yml 的 matrix 格數要跟著表改)`)
  if (ONLY_BLOCK && !BLOCK_NAMES.includes(ONLY_BLOCK)) problems.push(`--block=${ONLY_BLOCK} 不是區塊名(區塊:${BLOCK_NAMES.join(' / ')})`)
  if (problems.length) {
    console.log(`✗ calendar-month 分片表 / 參數不成立(一格都沒量,不得讀成通過):\n${problems.map((p) => `  · ${p}`).join('\n')}`)
    await browser.close(); await server.stop()
    process.exit(1)
  }
}
const OWNERS = shardPlanOwners(CALENDAR_MONTH_SHARDS, MUTANTS.map((m) => m.block))
const mainInScope = (name) => (ONLY_BLOCK ? name === ONLY_BLOCK : SHARD ? OWNERS.mainOf.get(name)[0] === SHARD.k : true)
const mutantInScope = (m) => (ONLY_BLOCK ? m.block === ONLY_BLOCK : SHARD ? OWNERS.mutantOf[MUTANTS.indexOf(m)][0] === SHARD.k : true)
const scopeLabel = SHARD ? `第 ${SHARD.k}/${SHARD.n} 片(${CALENDAR_MONTH_SHARDS[SHARD.k].join(' / ')})` : ONLY_BLOCK ? `只跑區塊 ${ONLY_BLOCK}` : '不分片'
const runStarted = Date.now()

if (!SELFTEST) {
  console.log(`· calendar-month 主判定:${scopeLabel}`)
  for (const [name, block] of Object.entries(BLOCKS)) {
    if (!mainInScope(name)) continue
    const t = Date.now()
    await block(null)
    console.log(`⏱ 區塊 ${name}:${secondsSince(t)} 秒`)
  }
} else {
  // 分片表的對照組(只在第 0 片或不分片時跑;純記憶體,不開頁):拿掉任一塊 / 拿掉任一個拆突變的單位 / 把一塊放進第二片 / 塞一個不存在的名字與寫法不對的單位
  // —— 各自必被點名,真表 0 個問題
  if (!ONLY_BLOCK && (!SHARD || SHARD.k === 0)) {
    const misses = []
    const problemsOf = (plan) => shardPlanProblems(plan, BLOCK_NAMES, MUTANTS)
    if (problemsOf(CALENDAR_MONTH_SHARDS).length) misses.push('真表應 0 個問題')
    // 拿掉任一個區塊的全部單位 → 主判定與它每一個突變都要被點名
    for (const name of BLOCK_NAMES) {
      const dropped = CALENDAR_MONTH_SHARDS.map((s) => s.filter((u) => parseShardUnit(u)?.block !== name))
      const got = problemsOf(dropped)
      const mine = MUTANTS.filter((m) => m.block === name)
      if (!got.some((p) => p.includes(`區塊「${name}」的主判定不在任何一片`)) || !mine.every((m) => got.some((p) => p.includes(`突變「${m.name}」(${name})不在任何一片`)))) misses.push(`拿掉「${name}」沒被點名(主判定或突變)`)
    }
    // 拿掉任一個「區塊名@i/m」單位(只拆突變的那一塊)→ 那幾個突變被點名
    for (const [k, units] of CALENDAR_MONTH_SHARDS.entries()) for (const unit of units.filter((u) => u.includes('@'))) {
      const dropped = CALENDAR_MONTH_SHARDS.map((s, kk) => (kk === k ? s.filter((u) => u !== unit) : s))
      if (!problemsOf(dropped).some((p) => p.includes('不在任何一片'))) misses.push(`拿掉「${unit}」沒被點名`)
    }
    const last = CALENDAR_MONTH_SHARDS.length - 1
    const dupUnit = CALENDAR_MONTH_SHARDS[0][0], dupBlock = parseShardUnit(dupUnit).block
    const dup = CALENDAR_MONTH_SHARDS.map((s, k) => (k === last ? [...s, dupUnit] : s))
    if (!problemsOf(dup).some((p) => p.includes(`區塊「${dupBlock}」的主判定在第`))) misses.push(`「${dupUnit}」放兩片沒被點名`)
    const ghost = CALENDAR_MONTH_SHARDS.map((s, k) => (k === 0 ? [...s, 'ghostBlock', 'detail@x'] : s))
    const ghostProblems = problemsOf(ghost)
    if (!ghostProblems.some((p) => p.includes('「ghostBlock」不是區塊名')) || !ghostProblems.some((p) => p.includes('「detail@x」寫法不對'))) misses.push('不存在的名字 / 寫法不對的單位沒被點名')
    if (misses.length) { console.log(`✗ calendar-month 分片表對照組失效:${misses.join(';')}`); await browser.close(); await server.stop(); process.exit(1) }
    console.log(`✓ 分片表對照組:拿掉任一塊(${BLOCK_NAMES.length} 種,主判定與它每一個突變)/ 任一個拆突變的單位各自被點名、一塊放兩片 / 不存在的名字 / 寫法不對被點名、真表 0 個問題`)
  }
  const RUN = MUTANTS.filter(mutantInScope)
  console.log(`· calendar-month selftest:${scopeLabel},${RUN.length} / ${MUTANTS.length} 個突變`)
  let caught = 0
  for (const m of RUN) {
    const from = results.length, fromFails = instrumentFails.length
    const t = Date.now()
    console.log(`── 突變:${m.name}(預期 ${m.expect.join(' / ')} 紅)`)
    await BLOCKS[m.block](m)
    const red = new Set(results.slice(from).filter((x) => !x.ok).map((x) => x.id))
    const ok = m.expect.every((id) => red.has(id)) && instrumentFails.length === fromFails
    if (ok) caught++
    console.log(`${ok ? '✓' : '✗'} selftest「${m.name}」:紅的格 ${[...red].join(' / ') || '(無)'}(⏱ ${m.block} ${secondsSince(t)} 秒)`)
  }
  await browser.close(); await server.stop()
  const ok = RUN.length > 0 && caught === RUN.length && instrumentFails.length === 0
  if (instrumentFails.length) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 紅的不全是對照組造成的`); for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`) }
  if (!RUN.length) console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:這一次沒有任何突變可跑(${scopeLabel})—— 不得讀成通過`)
  console.log(ok
    ? `✅ calendar-month selftest:${RUN.length} 個突變全被抓到(${scopeLabel}${RUN.length < MUTANTS.length ? `;全部 ${MUTANTS.length} 個由各片合起來跑` : ''};⏱ ${secondsSince(runStarted)} 秒)`
    : `✗ calendar-month selftest:${RUN.length - caught} 個突變沒讓預期的格紅 —— 量具無效`)
  process.exit(ok ? 0 : 1)
}

await browser.close()
await server.stop()
if (!results.length) instrumentFails.push({ cell: scopeLabel, detail: '0 格有判定(區塊都沒量到東西)' })
console.log(`⏱ calendar-month 主判定合計 ${secondsSince(runStarted)} 秒(${scopeLabel})`)
const failed = results.filter((x) => !x.ok)
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 不是產品裁決,但這次不能宣稱月格合規:`)
  for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`)
}
console.log(failed.length || instrumentFails.length
  ? `✗ calendar-month ${failed.length} 格失敗(${failed.map((x) => x.id).join(' / ')})、${instrumentFails.length} 格沒量到(SSOT:calendar.spec.md「工具列」「Cell 規則」「間距」「A11y 預設」)`
  : `✅ calendar-month PASS(${results.length} 格)`)
process.exit(failed.length || instrumentFails.length ? 1 : 0)
