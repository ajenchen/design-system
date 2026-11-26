#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「這一下 Esc 由誰處理」與「焦點不掉到 body」兩條跨元件規則(ds-canonical/references/keyboard-model-canonical.md
 *        「焦點所在的控件自己那一層也算一層」「按了之後自己變停用:焦點留在原處」「關了之後焦點去哪」)在**每一個宣告了自己有一層的 DS 控件**上
 *        都真的成立 —— 把它放進 DS Dialog / Popover 裡用真鍵盤走:控件還有東西可撤銷時第一下 Esc 由控件撤銷、浮層不關,控件乾淨後下一下才關;
 *        整段過程焦點從不落在 body;控件自己的彈出層開著時那一下只關彈出層、不回復;拖曳中只取消拖曳;
 *        表單接線到得了 Combobox(name / Esc 層 / 焦點);開啟彈出層不算離開欄位(必填錯誤不會先長出來);
 *        沒有觸發點、從選單項開的對話框關閉後焦點回選單的觸發鈕;移除集合裡的一項後焦點接給下一顆 ×;
 *        就地編輯按 Enter 提交後不會把編輯重開;就地編輯換成自訂編輯控件(renderEdit = Select / 可打字 DatePicker)也是一層 —— 先關控件自己的選單 / 日曆、控件自己的草稿先還原、再取消編輯、才關浮層,
 *        而且進編輯時焦點落在控件上(2026-11-25);AgentPanel 輸入盒按附件 × 焦點不離開 textarea;按到底而自己停用的按鈕握著焦點;
 *        可打字日期欄位收起日曆後焦點回輸入框;AgentPanel 改名對話框照表單可執行層(Esc 兩層、取消不落空、「儲存」沒改 / 空白停用、有字可按 —— 2026-11-17 起照「Submit Button 狀態」第二 + 第三列);
 *        宣告了 Esc 層卻沒有處理的那一下不會困住使用者(consumer 蓋掉 getInputProps 的 onKeyDown、DataTable 游標的欄被隱藏);
 *        試算表 DataTable 連結格 / 開關格的格內模式(Enter 進到格裡的連結 / 勾選框)也是一層:先回格導覽、再清游標、才關浮層(2026-10-13);
 *        Combobox「+N」浮出清單也算同一個欄位;可聚焦的停用(忙碌 / 握著焦點時被停用)滑過、按住都與原生停用同色(2026-10-07,後三列用同一棵樹編出的 DS 樣式)。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(清單與個數見 MUTANTS),每個突變都必須**剛好**紅它負責的那幾列
 *        (多紅少紅都算量具不可信),契約列每一條都要被某個突變弄紅過。`--root=<修改前的整棵原始碼>` 跑 = 天然對照組(修改前 2026-10-01 基準樹:
 *        除 F-remove / E-combobox-popup / E-unchained 外契約列全紅,兩條對照列綠。這三列守的是修好之後才可能出現的回歸,基準樹本來就綠:F-remove = 本批工作中途
 *        把三份接力收成一支時引入、獨立驗證抓到的那一版;E-combobox-popup = Combobox 接上表單之後「清單開著按 Esc 又關清單又回復」—— 基準樹的
 *        Combobox 根本收不到表單的 handler,沒有那條路可錯;E-unchained = 有了 Esc 層之後「宣告了卻沒人處理」才可能困住,基準樹沒有層、第一下就關。
 *        三列都有突變證明會紅。F-look 在基準樹紅的原因是「忙碌鈕根本不是可聚焦的停用」(長相相同但前提不成立),不是長相)。
 *   綠: 現行原始碼每列都量到且符合,對照列(CTRL-clean:乾淨的欄位第一下 Esc 就關;CTRL-button:焦點在對話框裡的按鈕上第一下 Esc 就關)
 *        在現行原始碼與每個突變上都綠 —— 證明量具看得到「關閉」與焦點,紅燈不是量具壞了。harness 載不起來 / 找不到元素 / 等不到靜止
 *        = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-10-01 新增(待辦總帳 N68 / N69 / N70 / N82 / N83 / N84 / OE29 / OE30)。form-validation-contract-invariant.mjs 的 R4-dialog 只用一個
 *        素的 `<input>` 走過規則 4 的分層;本閘把**每一個**自己宣告了 Esc 層的 DS 控件各放進浮層走一遍 —— 第一輪只量 hook 層,LinkInput 把
 *        Esc 困在對話框裡(自己看 raw defaultPrevented、守門留給它的那一下永遠不處理)就是從這個缺口漏過去的(獨立驗證抓到)。
 *        2026-11-15 起 AgentDecisionCard 的卡片根也宣告一層(焦點在卡裡按 Esc = 取消):它只出現在 AgentPanel 裡,分層走的是面板的分區判定
 *        (`useEscapeRegion`)而不是 Dialog 守門,所以那一列住 `scripts/agent-decision-card-clear-invariant.mjs`(O29 / O29b / O29p / O29t,
 *        並排 / 浮層 / 提示開著各走一遍「一次少一層」),不在本閘重量。
 *        2026-11-25 加 E-inline-edit-custom / F-inline-edit-enter-focus(Calendar 詳情浮層的欄位用 InlineEdit 包 Select / DatePicker,calendar.spec.md
 *        「Esc(一次少一層)」):修前只有預設的 Input / Textarea 經 editSettleKeyProps 宣告一層,自訂 renderEdit 沒有任何人宣告,
 *        桌機 Select 又不接 autoFocus —— 實測 Dialog 裡按 Esc 第一下(不開選單)/ 第二下(開選單)就連對話框一起關。
 *        同日加 E-inline-edit-custom-date(審查者探針抓到):編輯容器的「就近的那一層」「Radix 已用掉」兩道防線在 Select 那兩列沒有一下 Esc 要它們擋,
 *        拿掉兩道 37 列照綠;真正承重的是焦點留在輸入框的可打字 DatePicker —— 兩道各守一段(打了字 / 沒打字),所以那一列走兩段。
 *
 * ── 判定表(契約列;每列「層數 + 1」下關閉、焦點從不落 body)──
 *   E-link-edit        Dialog 裡的 LinkInput 按鉛筆進編輯 → Esc 取消編輯(焦點給鉛筆)→ 再 1–2 下關(鉛筆的 Tooltip 若開著算一層)
 *   E-link-typed       Dialog 裡沒有值的 LinkInput 打了字 → Esc 丟草稿、焦點留在輸入框 → 第 2 下關
 *   E-inline-edit      Dialog 裡的 InlineEdit 進編輯 → Esc 回檢視(焦點回檢視鈕)→ 第 2 下關
 *   E-inline-edit-custom Dialog 裡的 InlineEdit 用 renderEdit = Select(進編輯即開選單,inline-edit.stories.tsx「狀態」同一個寫法;選了只改草稿、不提交):
 *                      選「已完成」→ 再開選單 → 第一下 Esc 只關選單、草稿不動、仍在編輯 → 第二下取消編輯(值不變、onCommit 0 次、焦點回檢視鈕)、
 *                      對話框不關 → 第三下關(2026-11-25,calendar.spec.md「Esc(一次少一層)」;修前第二下就連對話框一起關)
 *   F-inline-edit-enter-focus Dialog 裡的 InlineEdit 用 renderEdit = Select、不開選單(桌機 Select 的 autoFocus 無作用)→ 進編輯後焦點在編輯控件上
 *                      → 第一下 Esc 取消編輯、焦點回檢視鈕、對話框不關 → 第二下關(2026-11-25;修前焦點停在對話框本身,第一下就關)
 *   E-inline-edit-custom-date Dialog 裡的 InlineEdit 用 renderEdit = 可打字 DatePicker(焦點留在輸入框;選了只改草稿、不提交),點輸入框開日曆:
 *                      (a) 打一個字 → Esc 依序 關日曆 / 還原草稿 / 取消編輯(值不變、onCommit 0 次、焦點回檢視鈕)/ 關對話框,四下;
 *                      (b) 沒打字 → 關日曆(仍在編輯)/ 取消編輯 / 關對話框,三下(2026-11-25;修前兩段都在取消編輯那一下連對話框一起關)
 *   E-datepicker-draft Dialog 裡可打字的 DatePicker:點欄位(日曆開)打字 → Esc 只關日曆、草稿不動 → Esc 還原草稿 → 第 3 下關
 *   E-datatable-cursor Dialog 裡試算表模式的 DataTable:點格(格游標)→ Esc 清游標、焦點留在表格 → 第 2 下關
 *   E-calendar-tile    Dialog 裡的 Calendar:從跨日長條的第 2 天 F2 進格內(焦點在長條;DOM 在第 1 天那格)→ Esc 出格回第 2 天的日期鈕 → 第 2 下關
 *   E-drag             Popover 裡的排序面板:焦點在拖曳把手按空白鍵提起 → ↓ → Esc 只取消拖曳(播報「已取消」)、面板不關 → 第 2 下關
 *   E-drag-table       Dialog 裡有格游標的 DataTable:表頭按空白鍵提起欄位 → Esc 只取消拖曳,格游標還在、對話框不關
 *   E-combobox-popup   Dialog 裡經 getInputProps 接線、值改過的 Combobox:清單開著按 Esc → 只關清單、值不動、對話框不關
 *   E-combobox         接上題:清單關著按 Esc → 值回復(對話框不關)→ 下一下關
 *   C-combobox-focus   必填的 Combobox 空著送出 → 焦點落在它的觸發區(name 掛在可聚焦的元素上)
 *   C-people-focus     必填的 PeoplePicker 經 getInputProps 接線、空著送出 → 焦點落在第一個錯誤欄位:單選在前 → 單選(name 經 Select 掛在表單鏡像輸入框)、
 *                      多選在前 → 多選的觸發區(name 經 Combobox 掛上)(2026-11-26 產品 canary 回報 C25)
 *   B-popup            必填的 Select / Combobox / DatePicker / TimePicker / PeoplePicker(單選、多選)經 getInputProps 接線:打開彈出層時沒有錯誤;
 *                      Esc 關掉後 Tab 離開才有
 *   F-menu             DropdownMenu 的項目開了受控 Dialog → Esc → 焦點回選單的觸發鈕(不是 body)
 *   F-menu-fileviewer  DropdownMenu 的項目開了受控 FileViewer(不經 DialogContent、直接用 Radix Dialog)→ Esc → 焦點回選單的觸發鈕
 *                      (2026-10-20 獨立驗證 OV-01:FileViewer 自己記開啟者、少了 persistentOpenerOf,修前掉到 body;只有這一列紅)
 *   F-remove           FileUpload 焦點在列上、點第一項的 ×(按鈕不拿焦點,同 Safari)→ 焦點接到下一顆 ×(不是上傳鈕)
 *   F-enter-commit     Dialog 裡的 LinkInput 編輯後按 Enter → 回連結狀態、onChange 一次、焦點在鉛筆;InlineEdit 同(回檢視、onCommit 一次、焦點在檢視鈕)
 *   F-link-enter-stay  LinkInput 打了不合法網址按 Enter → 留在輸入框、紅框、焦點在輸入框;清空按 Enter → onChange('')、焦點仍在輸入框
 *   C-composer-mouse   AgentPanel 輸入盒 textarea 握著焦點時用滑鼠按附件 × → 附件移除、焦點與字都留在 textarea
 *   C-composer-keyboard 焦點在第一顆附件 × 上按 Enter → 移除後焦點在下一顆 ×
 *   F-date-return      Dialog 裡可打字的 DatePicker 用 ↓ 開日曆(焦點進日曆)→ Esc 收起後焦點回輸入框、對話框不關(修前掉到 body)
 *   F-pagination       分頁鍵盤按「下一頁」到最後一頁 → 焦點留在那顆箭頭上(aria-disabled;修前掉到 body)
 *   F-rename           AgentPanel 改名對話框:Esc 先回復名稱再關;清空後直接按「取消」這一下沒落空;「儲存」打開沒改 / 清空時停用、打上新名字可按並改名
 *   E-datatable-hidden-col Dialog 裡試算表 DataTable:點「數量」格(格游標)→ 隱藏「數量」欄 → ↓ 重新放上游標(不懸空)→ Esc 清游標 → 第 2 下關
 *                      (2026-10-07 獨立驗證抓到:欄被隱藏後根節點仍宣告 Esc 層、handler 卻在 curColIdx < 0 提早 return,五下都關不掉)
 *   E-datatable-cell-widget Dialog 裡試算表 DataTable(SKU / 連結 / 完成三欄):方向鍵把格游標移到連結格 / 開關格 → Enter 焦點進到格裡的
 *                      連結 / 勾選框 → 第一下 Esc 回格導覽(游標停在原格、對話框不關)→ 第二下清游標 → 第三下關;兩種格各走一次
 *                      (2026-10-13 待辦總帳 Q3c;獨立驗證抓到這一層沒有登記、也沒有閘。7777b61c 基準樹:Enter 按了沒反應、兩下就關,只有這一列紅)
 *   E-unchained        Dialog 裡 consumer 展開 getInputProps 後自己蓋掉 onKeyDown、沒轉呼叫(輸入框 + 可打字 DatePicker),欄位改過 → 第一下 Esc 就關
 *                      (沒有回復,但不困住;lib/overlay-escape.ts「宣告 ≠ 處理」)
 *   B-leave-blank / B-leave-next / B-leave-tab(2026-10-21 r1b fields F1)必填的 Select / 可搜尋 Select / Combobox / DatePicker / TimePicker:
 *                      彈出層開著時點空白處 / 直接點下一格 / (兩種 Select)按 Tab 離開 → 那一欄的驗證跑一次(修前從彈出層直接離開時 consumer 收不到 blur)
 *   N-esc-tab          (2026-10-21 r1b fields N1)Esc 收起後、收起動畫還在播時按 Tab → 焦點走到觸發點的下一格(五種欄位 + 一般 Popover;
 *                      修前 Radix 等內容卸載才還焦點,Tab 被吃掉)。Tab 必須真的落在那段空窗裡(量 Tab 與內容卸載的時間),否則儀器失效
 *   N-esc-tab-modal    (2026-10-27 待辦總帳 R1b-FN1b)Dialog / Sheet(DialogTrigger / SheetTrigger 開)Esc 收起後、收起動畫還在播時按 Tab → 焦點走到
 *                      觸發鈕的下一格;同一段空窗裡觸發鈕到 <html> 的祖先鏈沒有 aria-hidden(Radix modal 的 hideOthers 卸載才撤 —— 修前焦點還進讀屏看不到的區域)、
 *                      淡出中的內容 inert;另一格「對話框裡的儲存鈕非同步關閉(setTimeout 後 setOpen(false))」同樣要求(不是離散事件裡的更新)
 *                     (修前 Tab 被吃掉:焦點等內容卸載才回觸發鈕)。FileViewer 那一格(2026-11-04,data 家族 DA-esc-tab):一般按鈕以受控 open
 *                     開 FileViewer(沒有 Radix 觸發點,開啟者由 useTriggerlessFocusReturn 記)→ 同上三件事
 *   CTRL-leave(對照)  彈出層關著時 Tab 離開必填 Select → 驗證跑一次
 *   B-overflow         必填 Combobox(非搜尋型,窄欄位、四個 Tag)焦點在觸發區,用滑鼠按「+N」浮出清單裡的 ×(焦點搬進卡)→ consumer 的 onBlur 不跑;
 *                      焦點移到欄位外的按鈕 → 跑一次
 *   F-look             可聚焦的停用(忙碌鈕 8 種 variant / danger;存檔後握著焦點的送出鈕)與原生停用逐項同色:靜止 / 滑過 / 按住 × 淺深兩色,
 *                      背景 / 字 / 四邊框 / 不透明度 / 游標;忙碌鈕確實是可聚焦的停用(data-disabled-focusable、原生 disabled=false)
 *   F-shell-ring       Dialog / Sheet / Popover 裡沒有可聚焦控件(只有標題列的 ×):鍵盤開啟 → 開啟落點是殼、殼是 :focus-visible → 殼不畫焦點框
 *                      (focus-canonical.md「E. 浮層程式落點」;2026-11-26 產品 canary 回報 C11:修前 Dialog / Sheet 畫 2px 框,Popover 同族、早已抑制)
 *   F-popover-anchor   錨點型 Popover(PopoverAnchor 定位、普通按鈕開,沒有 PopoverTrigger):鍵盤開 → Esc → 焦點回開啟鈕;滑鼠開 → 點選項選完收起 → 焦點回開啟鈕
 *                      (popover.spec.md「A11y 預設」關閉返回;2026-11-27 產品 canary 回報 H20:修前 Radix 沒東西可還,焦點落 body)
 *   F-popover-anchor-outside 同一個錨點型 Popover,滑鼠點頁面空白處收起 → 焦點不被搶回開啟鈕(非 modal 不搶)
 *   F-inline-disabled  行內動作鈕自身停用(SidebarGroupAction disabled):游標 not-allowed、字色 = text-fg-disabled、滑過 / 按住字色與底色釘在靜止
 *                      (與 F-look 同一類「停用不給互動回饋」;inline-action.spec.md「自身停用」列;2026-11-26 產品 canary 回報 C20)。CTRL-inline-hover 對照:可用那顆滑過會變
 *   K-cmdb-modal       「這一下 ⌘B 由誰處理」(與 Esc 分層同一類:按鍵歸焦點所在那一層):頁面有可收合側欄、modal「工作區設定」對話框裡是不可收合的設定導覽,
 *                      焦點在導覽上按 ⌘B → 背景頁側欄不切換、不寫 sidebar_state、沒人攔(sidebar.spec.md「持久化與快捷鍵」;2026-11-26 產品 canary 回報 C13)
 *   K-cmdb-none-cookie 不可收合的側欄經 useSidebar().setOpen 開關 → 不寫 sidebar_state(同上)
 *   CTRL-cmdb(對照)   對話框關著、焦點在頁面上按 ⌘B → 頁面側欄收起、寫 cookie、攔下(量具看得到切換 / cookie / 攔截)
 *   CTRL-clean / CTRL-button(對照)乾淨的欄位 / 按鈕上第一下 Esc 就關(只量「看得到關閉」,不含焦點去哪)
 *
 * ── 突變 → 該紅的列(--selftest;MUTANTS 是單一來源,這裡是人讀版)──
 *   LinkInput 只看 raw defaultPrevented(第一輪的寫法)→ E-link-edit / E-link-typed(困住,永遠關不掉)
 *   editSettleKeyProps 不宣告 Esc 層 → E-inline-edit / E-link-edit / E-link-typed;DatePicker 草稿不宣告 → E-datepicker-draft / E-inline-edit-custom-date;
 *   DatePicker 草稿的 Esc 不看 Radix 已用掉 → E-datepicker-draft / E-inline-edit-custom-date(同一個輸入框放進 InlineEdit,同一個根因)
 *   InlineEdit 自訂編輯容器不宣告 Esc 層 → E-inline-edit-custom / E-inline-edit-custom-date / F-inline-edit-enter-focus;進編輯不把焦點補進編輯容器 → F-inline-edit-enter-focus;
 *   編輯容器不看就近的那一層 / 不看 Radix 已用掉 → E-inline-edit-custom-date(各紅一段);編輯容器只看不認領 → E-inline-edit-custom / -date / F-inline-edit-enter-focus
 *   DataTable 根不宣告 self 層 → E-datatable-cursor / E-datatable-hidden-col / E-datatable-cell-widget(它的第二下就是這一層);Calendar 方塊不宣告 → E-calendar-tile;
 *   Calendar 出格回長條 DOM 所在那一天(2026-11-25 前的 dayStopOf(焦點所在那一格))→ E-calendar-tile
 *   DataTable 連結格 / 開關格不宣告格內那一層 → E-datatable-cell-widget
 *   拖曳不宣告 / 不獨占 → E-drag / E-drag-table;DataTable 拖曳中仍用 self 層 → E-drag-table
 *   Combobox 丟掉 name / data-* → E-combobox / C-combobox-focus / C-people-focus;PeoplePicker 解構了 name 卻不轉下去 → C-people-focus;表單 Esc 不看 Radix 已用掉 → E-combobox-popup(+ 接著量的 E-combobox;也不認領 → F-rename)
 *   複合欄位的 blur 一律轉呼叫 → B-popup / B-overflow / B-leave-* / N-esc-tab;彈出層關掉的那一下不補量 → B-leave-blank / -next / -tab;
 *   收起動畫期間不提早還焦點 → N-esc-tab / N-esc-tab-modal;modal 收起時不撤這次開啟加上的 aria-hidden → N-esc-tab-modal;
 *   不記選單的觸發鈕 → F-menu / F-menu-fileviewer;
 *   FileViewer 自己記開啟者(不經 useTriggerlessFocusReturn,2026-10-20 前的寫法)→ F-menu-fileviewer;FileUpload 不以被點的 × 為基準 → F-remove
 *   結算 Enter 不 preventDefault → F-enter-commit;LinkInput Enter 一律 blur → F-link-enter-stay
 *   輸入盒外框不留焦點 → C-composer-mouse;輸入盒不接力 → C-composer-keyboard
 *   DatePicker 收起日曆不還焦點給輸入框 → F-date-return;Button 握著焦點時仍轉原生 disabled → F-pagination / F-look;改名「儲存」空白仍可按 / 有字也按不了 → F-rename
 *   DataTable 游標的有效性不看欄是否可見 → E-datatable-hidden-col;守門不驗收(沒人認領也不重新派)→ E-unchained;
 *   DatePicker 草稿乾淨時也替 consumer 認領 → E-unchained;Combobox 不把「+N」卡算進欄位 → B-overflow;
 *   可聚焦的停用保留 aria-disabled 那一組長相(2026-10-07 前的寫法:滑過變回原本的填色)→ F-look
 *   PopoverContent 沒有觸發點時不記開啟者、不還(2026-11-27 前)→ F-popover-anchor;還焦點當成 modal(按在外面也搶回)→ F-popover-anchor-outside
 *
 * 用法:
 *   node scripts/escape-and-focus-contract-invariant.mjs                  判定(現行原始碼)
 *   node scripts/escape-and-focus-contract-invariant.mjs --selftest       對照組(全部單一根因突變,個數見 MUTANTS)
 *   node scripts/escape-and-focus-contract-invariant.mjs --selftest --shard=<k>/<n>   只跑第 k 片突變(CI matrix 平行;覆蓋率靜態驗)
 *   node scripts/escape-and-focus-contract-invariant.mjs --root=<dir>     改量另一棵原始碼(例:git archive 出來的修改前基準樹)
 */
import {
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
} from './lib/launch-browser.mjs'
import {
  InstrumentError,
  REPO_ROOT,
  WAIT_CAP_MS,
  bundleDsHarness,
  compileDsCss,
  makeDriver,
  mountHarness,
  mutantFor,
  replaceOnce,
  resolveSourceRoot,
} from './lib/ds-source-harness.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SOURCE_ROOT = resolveSourceRoot()
/**
 * selftest 同時跑幾個突變(每條 lane 一個瀏覽器、一個分頁 —— 同 story-demo-focus:焦點與鍵盤事件不跨 lane 共用)。
 * 單一突變要把全部列整趟走完(大多是等版面 / 焦點靜止,CPU 約 20%;2026-10-21 加 B-leave / N-esc-tab 之後每趟多約 33 秒),全部變體循序跑要半小時以上;
 * 判定(非 selftest)只跑一趟,不受影響。`--lanes=1` = 循序(除錯用)。
 */
const LANES = Math.max(1, Number(process.argv.find((a) => a.startsWith('--lanes='))?.slice('--lanes='.length) ?? 4) || 4)
/** 除錯用:`--only=<突變 id>[,<id>…]` 只跑這幾個突變(不檢查覆蓋率 —— 這一趟不算 selftest 通過,結尾會明說) */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean) ?? null
/**
 * `--shard=<k>/<n>`(selftest):只跑 MUTANTS 裡索引 % n === k 的那一片。CI 把對照組拆成 n 片平行跑(ci.yml
 * verify-browser-escape-focus-control 的 matrix;2026-10-21 加 B-leave / N-esc-tab 之後整趟估 1.3–1.5 倍,單一 job 會貼到 25 分上限):
 * 各片各自驗「每個突變剛好紅它的 expectRed」;覆蓋率改成靜態驗 —— 每一條契約列都必須出現在某個突變的 expectRed(各片都證明了自己的突變
 * 剛好紅 expectRed,所有片合起來 = 動態覆蓋;靜態覆蓋只在第 0 片驗)。
 * 基準 = 一趟完整判定,只在第 0 片跑(2026-11-26:每片都跑 = 同一趟判定一次 CI 跑 n 次);其他片的每個突變那一趟也量全部列、紅的列必須剛好等於 expectRed,所以現行原始碼哪一列退步,那幾片照樣紅,第 0 片的基準另印判定那一行。CI 不另跑判定(2026-11-26 拿掉 verify-browser-overlay 那一趟:它與這裡的基準是同一個 runVariant、同一個分頁設定)。
 * 不給 = 一片跑全部(本機 `npm run test:escape-and-focus-contract`、meta-test)。
 */
const SHARD = (() => {
  const raw = process.argv.find((a) => a.startsWith('--shard='))?.slice('--shard='.length)
  if (raw == null) return null
  const m = /^(\d+)\/(\d+)$/.exec(raw)
  const k = m ? Number(m[1]) : NaN
  const n = m ? Number(m[2]) : NaN
  if (!m || !(n >= 1) || !(k >= 0 && k < n)) { console.error(`✗ --shard=${raw} 寫法不對(要 <k>/<n>,0 ≤ k < n)`); process.exit(2) }
  return { k, n }
})()

// ─── 單一根因突變(--selftest;file 相對 packages/design-system/src;個數不抄進註解)──────────────────────
const MUTANTS = [
  {
    id: 'link-input-consumer-first-raw',
    what: 'LinkInput 的 Esc 不先歸自己、只看 raw defaultPrevented(2026-10-01 第一輪的寫法,獨立驗證抓到的困住)',
    file: 'components/LinkInput/link-input.tsx',
    expectRed: ['E-link-edit', 'E-link-typed'],
    apply: (src) => replaceOnce(src, /\n      if \(e\.key === 'Escape' && ownsEscape\) \{ settleKeys\.onKeyDown\(e\); return \}\n/, '\n'),
  },
  {
    id: 'edit-settle-no-escape-layer',
    what: 'editSettleKeyProps 不宣告 Esc 層(就地編輯中按 Esc 連浮層一起關)',
    file: 'components/Field/field-edit-keys.ts',
    expectRed: ['E-inline-edit', 'E-link-edit', 'E-link-typed'],
    apply: (src) => replaceOnce(src, /return \{ onKeyDown: makeEditSettleKeyHandler\(settle\), \.\.\.escapeLayerProps\(escapeLayer\) \}/,
      'return { onKeyDown: makeEditSettleKeyHandler(settle) }'),
  },
  {
    id: 'inline-edit-custom-no-escape-layer',
    what: 'InlineEdit 自訂 renderEdit 的編輯容器不宣告 Esc 層(2026-11-25 前的形狀:只有預設 Input / Textarea 經 editSettleKeyProps 宣告)',
    file: 'components/InlineEdit/inline-edit.tsx',
    // 三列的「取消編輯」那一下都靠這一層:拿掉 → 那一下 Radix 直接關對話框(E-inline-edit-custom-date 兩段都在這一下紅)
    expectRed: ['E-inline-edit-custom', 'E-inline-edit-custom-date', 'F-inline-edit-enter-focus'],
    apply: (src) => replaceOnce(src, /\{ \.\.\.escapeLayerProps\(true\), onKeyDown: handleCustomEditKeyDown \}/, '{ onKeyDown: handleCustomEditKeyDown }'),
  },
  {
    id: 'inline-edit-no-enter-focus',
    what: 'InlineEdit 進編輯時不把焦點補進編輯容器(控件不接 autoFocus 時焦點停在對話框本身;2026-11-25 前的形狀)',
    file: 'components/InlineEdit/inline-edit.tsx',
    // E-inline-edit-custom 不在內:那一列的 Select 進編輯即開選單,焦點由選單自己搬進彈出層、收起時 Radix 還給觸發欄位
    expectRed: ['F-inline-edit-enter-focus'],
    apply: (src) => replaceOnce(src, /\n    tabbableOrder\(box\)\[0\]\?\.focus\(\)\n/, '\n'),
  },
  {
    id: 'inline-edit-custom-esc-not-nearest',
    what: 'InlineEdit 編輯容器收 Esc 時不看「就近的那一層是不是自己」(焦點所在的可打字 DatePicker 有打了還沒存的字時,同一下又還原草稿又取消編輯)',
    file: 'components/InlineEdit/inline-edit.tsx',
    // Select 那兩列不在內:那兩列沒有一下 Esc 要這一道擋(2026-11-25 審查者探針:拿掉它 37 列照綠)
    expectRed: ['E-inline-edit-custom-date'],
    apply: (src) => replaceOnce(src, /\n      if \(nearest !== e\.currentTarget\) return\n/, '\n'),
  },
  {
    id: 'inline-edit-custom-esc-ignores-radix-used',
    what: 'InlineEdit 編輯容器收 Esc 時不看這一下是否已被 Radix 用掉(控件自己的日曆開著時,同一下又關日曆又取消編輯)',
    file: 'components/InlineEdit/inline-edit.tsx',
    expectRed: ['E-inline-edit-custom-date'],
    // 只拿掉「看結果就停」那一道,呼叫照留:isEscapeForControl 同時是「認領」(下一個突變),一起拿掉就不是單一根因
    apply: (src) => replaceOnce(src, /\n      if \(!isEscapeForControl\(e\)\) return\n      e\.preventDefault\(\)\n      cancel\(\)\n/, '\n      void isEscapeForControl(e)\n      e.preventDefault()\n      cancel()\n'),
  },
  {
    id: 'inline-edit-custom-esc-no-claim',
    what: 'InlineEdit 編輯容器只「看」這一下還在不在、不認領(isEscapeTakenElsewhere 代替 isEscapeForControl):取消了編輯,浮層守門卻當作沒人接、重新派一次,同一下連對話框一起關(lib/overlay-escape.ts「宣告 ≠ 處理」)',
    file: 'components/InlineEdit/inline-edit.tsx',
    expectRed: ['E-inline-edit-custom', 'E-inline-edit-custom-date', 'F-inline-edit-enter-focus'],
    apply: (src) => replaceOnce(
      replaceOnce(src, /import \{ ESCAPE_LAYER_ATTR, escapeLayerProps, isEscapeForControl \} from '@\/design-system\/lib\/overlay-escape'/,
        "import { ESCAPE_LAYER_ATTR, escapeLayerProps, isEscapeForControl, isEscapeTakenElsewhere } from '@/design-system/lib/overlay-escape'"),
      /\n      if \(!isEscapeForControl\(e\)\) return\n      e\.preventDefault\(\)\n      cancel\(\)\n/, '\n      if (isEscapeTakenElsewhere(e)) return\n      e.preventDefault()\n      cancel()\n'),
  },
  {
    id: 'datepicker-draft-no-layer',
    what: 'DatePicker 可打字欄位的草稿不宣告 Esc 層',
    file: 'components/DatePicker/date-picker.tsx',
    // 當 InlineEdit 的編輯控件時,就近的那一層變成編輯容器 → 還原草稿那一下同時取消編輯(E-inline-edit-custom-date (a) 第二下),同一個根因連帶紅
    expectRed: ['E-datepicker-draft', 'E-inline-edit-custom-date'],
    apply: (src) => replaceOnce(src, /\{\.\.\.escapeLayerProps\(inputDraft !== displayLive \|\| inputInvalid\)\}/, ''),
  },
  {
    id: 'datepicker-esc-ignores-radix-used',
    what: 'DatePicker 可打字欄位的 Esc 不看這一下是否已被 Radix 用掉(日曆開著按 Esc 又關日曆又還原草稿 = 一下兩層)',
    file: 'components/DatePicker/date-picker.tsx',
    // 同一個輸入框放進 InlineEdit 也是一下兩層(E-inline-edit-custom-date (a) 第一下又關日曆又還原草稿),同一個根因連帶紅
    expectRed: ['E-datepicker-draft', 'E-inline-edit-custom-date'],
    apply: (src) => replaceOnce(src, /\n                          if \(!isEscapeForControl\(e\)\) return\n/, '\n'),
  },
  {
    id: 'datatable-no-self-layer',
    what: 'DataTable 表格根不宣告格游標 / 列選取那一層',
    file: 'components/DataTable/data-table.tsx',
    // 隱藏欄之後重新放上的游標同樣靠這一層(E-datatable-hidden-col 的第一下 Esc 也會直接關),同一個根因連帶紅;
    // E-datatable-cell-widget 的第二下(回格導覽之後清游標)也是這一層 —— 拿掉它,第二下就直接關對話框,同一個根因連帶紅
    expectRed: ['E-datatable-cell-widget', 'E-datatable-cursor', 'E-datatable-hidden-col'],
    apply: (src) => replaceOnce(src,
      /: escapeLayerProps\(\(hasCellCursor && editingCellId == null\) \|\| \(enabled && hasAnySelection\), 'self'\)\)\}/,
      ': {})}'),
  },
  {
    id: 'datatable-cell-widget-no-layer',
    what: 'DataTable 試算表模式的連結格 / 開關格不宣告格內那一層(焦點在格裡的連結 / 鉛筆 / 勾選框時按 Esc 連對話框一起關)',
    file: 'components/DataTable/data-table.tsx',
    expectRed: ['E-datatable-cell-widget'],
    apply: (src) => replaceOnce(src,
      /\n        \{\.\.\.escapeLayerProps\(spreadsheetMode && !isEditingThisCell && \(colType === 'url' \|\| colType === 'boolean'\), 'subtree'\)\}\n/,
      '\n'),
  },
  {
    id: 'calendar-tile-no-layer',
    what: 'Calendar 事件方塊不宣告格內那一層',
    file: 'components/Calendar/calendar.tsx',
    expectRed: ['E-calendar-tile'],
    apply: (src) => src.split('{...escapeLayerProps(true)}').join(''),
  },
  {
    // 2026-11-25 前的寫法:出格回焦點所在那一格的停靠點 —— 跨日長條的 DOM 在起點那一天,從第 2 天進格、Esc 回到第 1 天
    id: 'calendar-tile-exit-dom-cell',
    what: 'Calendar 出格回長條 DOM 所在那一天(不記進格那一天)',
    file: 'components/Calendar/calendar.tsx',
    expectRed: ['E-calendar-tile'],
    apply: (src) => replaceOnce(src, /const exitTo = \(\) => \(day !== null \? dayStopByIso\(day\) : null\) \?\? dayStopOf\(cell\)/, 'const exitTo = () => dayStopOf(cell)'),
  },
  {
    id: 'drag-no-escape-layer',
    what: '拖曳中不宣告 Esc 層、也不獨占那一下',
    file: 'lib/drag-announcements.ts',
    expectRed: ['E-drag', 'E-drag-table'],
    apply: (src) => replaceOnce(src, /\? \{ \.\.\.escapeLayerProps\(true\), onKeyDownCapture: \(event: React\.KeyboardEvent\) => \{ if \(event\.key === 'Escape'\) claimEscape\(event\) \} \}/, '? {}'),
  },
  {
    id: 'data-table-drag-keeps-self-layer',
    what: 'DataTable 拖曳中仍宣告 self 層(焦點在表頭把手 ≠ 根,守門不留 → 對話框跟著關)',
    file: 'components/DataTable/data-table.tsx',
    expectRed: ['E-drag-table'],
    apply: (src) => replaceOnce(src, /\{\.\.\.\(drag\.dragging\n        \? drag\.escapeLayer\n        : /, '{...(false\n        ? drag.escapeLayer\n        : '),
  },
  {
    id: 'combobox-drops-form-props',
    what: 'Combobox 觸發區不接 name / data-*(2026-10-01 前的解構丟棄)',
    file: 'components/Combobox/combobox.tsx',
    // 多選 PeoplePicker 經 Combobox 把 name 掛到觸發區,同一個根因連帶紅 C-people-focus 的多選那一半
    expectRed: ['E-combobox', 'C-combobox-focus', 'C-people-focus'],
    apply: (src) => replaceOnce(src, /\{\.\.\.\(\(\{ \.\.\.dataAttrs, name \}\) as unknown as React\.HTMLAttributes<HTMLDivElement>\)\}/, ''),
  },
  {
    id: 'people-picker-drops-name',
    what: 'PeoplePicker 解構了 name 卻不轉給 Select / Combobox(三處 `name={name}` 全拿掉;C25 之前型別上沒有 name)',
    file: 'components/PeoplePicker/people-picker.tsx',
    expectRed: ['C-people-focus'],
    apply: (src) => {
      const out = src.replace(/\n +name=\{name\}(?=\n)/g, '')
      const removed = src.split('\n').length - out.split('\n').length
      if (removed !== 3) throw new InstrumentError(`突變錨點命中 ${removed} 次(應為 3):PeoplePicker 的 name={name} —— 原始碼改了,selftest 的突變要跟著改`)
      return out
    },
  },
  {
    id: 'form-esc-ignores-radix-used',
    what: 'useFormValidation 的 Esc 不看這一下是否已被 Radix 用掉(清單開著按 Esc 又關清單又回復)',
    file: 'components/Field/use-form-validation.ts',
    // E-combobox 接著 E-combobox-popup 的狀態量(值已被那一下回復 → 欄位變乾淨,下一下 Esc 直接關對話框),同一個根因連帶紅;
    // 拿掉的這一問同時是「認領」(lib/overlay-escape.ts「宣告 ≠ 處理」):不問就不認領,守門留住的那一下回復之後又被重新派、連對話框一起關 ——
    // AgentPanel 改名對話框(同一支 hook)第一下 Esc 就關,F-rename 連帶紅
    expectRed: ['E-combobox', 'E-combobox-popup', 'F-rename'],
    apply: (src) => replaceOnce(src, /\n          if \(!isEscapeForControl\(e\)\) return\n          form\.setValue\(path, original/, '\n          form.setValue(path, original'),
  },
  {
    id: 'composite-blur-forwards-always',
    what: '複合欄位的 blur 一律轉呼叫(焦點搬進彈出層也算離開)',
    file: 'lib/composite-field-focus.ts',
    // 「+N」卡是同一支判準的零件,一律轉呼叫時它也算離開(B-overflow 連帶紅);B-leave-* / N-esc-tab 要求「打開那一刻沒有驗證」,同一個根因連帶紅
    expectRed: ['B-overflow', 'B-popup', 'B-leave-blank', 'B-leave-next', 'B-leave-tab', 'N-esc-tab'],
    apply: (src) => replaceOnce(src, /if \(!isWithinCompositeField\(event\.relatedTarget, parts\)\) forward\(\)/, 'forward()'),
  },
  {
    id: 'no-persistent-opener',
    what: '開啟者住在選單裡時不改記選單的觸發鈕',
    file: 'lib/overlay-focus-return.ts',
    // FileViewer 2026-10-20 起消費同一支 hook(useTriggerlessFocusReturn)→ 兩列一起紅,證明它們吃的是同一份
    expectRed: ['F-menu', 'F-menu-fileviewer'],
    apply: (src) => replaceOnce(src, /openerRef\.current = persistentOpenerOf\(captureFocusOrigin\(\)\)/, 'openerRef.current = captureFocusOrigin()'),
  },
  {
    id: 'fileviewer-private-opener',
    what: 'FileViewer 自己記開啟者(captureFocusOrigin)、不經 useTriggerlessFocusReturn —— 2026-09-30 → 2026-10-20 的寫法(獨立驗證 OV-01)',
    file: 'components/FileViewer/file-viewer.tsx',
    expectRed: ['F-menu-fileviewer'],
    apply: (src) => replaceOnce(
      replaceOnce(src, /import \{ useExitStartFocusReturn, useTriggerlessFocusReturn, radixTriggerOf \} from "@\/design-system\/lib\/overlay-focus-return"/,
        'import { captureFocusOrigin, returnFocusToOpener, useExitStartFocusReturn, radixTriggerOf } from "@/design-system/lib/overlay-focus-return"'),
      /const focusReturn = useTriggerlessFocusReturn\(!persistentElements\)/,
      'const privateOpenerRef = React.useRef<HTMLElement | null>(null)\n  const focusReturn = { onOpenAutoFocus: () => { privateOpenerRef.current = captureFocusOrigin() }, onCloseAutoFocus: (event: Event) => { const opener = privateOpenerRef.current; privateOpenerRef.current = null; returnFocusToOpener(event, opener, { noTrigger: true, modal: !persistentElements }) } }'),
  },
  {
    id: 'fileupload-no-removed-basis',
    what: 'FileUpload 不以被點的 × 為基準(焦點在列上時退回上傳鈕)',
    file: 'components/FileUpload/file-upload.tsx',
    expectRed: ['F-remove'],
    apply: (src) => replaceOnce(src, /focusAfterCollectionRemoval\(list, \{ removed: current, owner \}\)/, 'focusAfterCollectionRemoval(list, { owner })'),
  },
  {
    id: 'edit-settle-enter-not-consumed',
    what: '結算 helper 的 Enter 不 preventDefault(同一下 Enter 的 keypress 落到剛拿到焦點的鉛筆 / 檢視鈕上,把編輯重開)',
    file: 'components/Field/field-edit-keys.ts',
    expectRed: ['F-enter-commit'],
    apply: (src) => replaceOnce(src, /if \(commitOnEnter \|\| e\.metaKey \|\| e\.ctrlKey\) \{\n        e\.preventDefault\(\)\n/, 'if (commitOnEnter || e.metaKey || e.ctrlKey) {\n'),
  },
  {
    id: 'link-input-enter-always-blurs',
    what: 'LinkInput 網址無效時 Enter 仍 blur(焦點掉到 body;2026-10-01 前的行為)',
    file: 'components/LinkInput/link-input.tsx',
    expectRed: ['F-link-enter-stay'],
    apply: (src) => replaceOnce(src, /      setLocalError\(true\)\n      return false\n/, '      setLocalError(true)\n      inputRef.current?.blur()\n      return false\n'),
  },
  {
    id: 'datepicker-no-focus-return',
    what: '可打字的 DatePicker 收起日曆時不把焦點還給輸入框(Radix 還給不可聚焦的外層 div = 掉到 body)',
    file: 'components/DatePicker/date-picker.tsx',
    expectRed: ['F-date-return'],
    apply: (src) => replaceOnce(src, /if \(typeable\) returnFocusToOpener\(e, typedInputRef\.current, \{ noTrigger: true \}\); /, ''),
  },
  {
    id: 'button-held-focus-native-disabled',
    what: 'Button 握著焦點時被停用仍轉原生 disabled(焦點被瀏覽器丟到 body;2026-10-01 前的行為)',
    file: 'components/Button/button.tsx',
    // F-look 的最後一列就是「握著焦點時被停用」的送出鈕:它變成原生停用、不再是可聚焦的停用,連帶紅
    expectRed: ['F-look', 'F-pagination'],
    apply: (src) => replaceOnce(src, /const focusableDisabled = !asChild && \(loading \|\| \(!!disabled && holdsFocus\)\)/, 'const focusableDisabled = !asChild && !!loading'),
  },
  // 2026-11-17 起改名對話框照 form-validation.spec.md「Submit Button 狀態」第三列(需要填的欄位只有一個 → 空白時停用)+ 第二列(更新:沒改停用)。
  // 兩面各一個突變:空白卻可按(2026-10-01 → 11-17 的行為)、有字也按不了(soleRequiredField 指錯欄位 → 永遠當成空白)。
  {
    id: 'rename-save-enabled-when-empty',
    what: '改名對話框名稱空白時「儲存」仍可按(不看 soleRequiredField = 2026-10-01 → 11-17 的行為)',
    file: 'components/AgentPanel/agent-panel.tsx',
    expectRed: ['F-rename'],
    apply: (src) => replaceOnce(src, /\n    soleRequiredField: 'title',/, ''),
  },
  {
    id: 'rename-save-disabled-when-filled',
    what: '改名對話框有字也按不了(soleRequiredField 指到不存在的欄位 → 一律當成空白)',
    file: 'components/AgentPanel/agent-panel.tsx',
    expectRed: ['F-rename'],
    apply: (src) => replaceOnce(src, /soleRequiredField: 'title',/, "soleRequiredField: 'name',"),
  },
  {
    id: 'composer-no-keep-focus',
    what: 'AgentPanel 輸入盒外框不留焦點(按 × 時焦點被瀏覽器交給那顆 ×)',
    file: 'components/AgentPanel/agent-panel.tsx',
    expectRed: ['C-composer-mouse'],
    apply: (src) => replaceOnce(src, /onMouseDown=\{\(e\) => \{ props\.onMouseDown\?\.\(e\); keepFocusOnPointerPress\(e, e\.currentTarget, textareaRef\.current\) \}\}/, 'onMouseDown={props.onMouseDown}'),
  },
  // ── 2026-10-07(獨立驗證抓到的四件)──
  {
    id: 'datatable-cursor-ignores-hidden-col',
    what: 'DataTable 格游標的有效性只看列、不看欄是否可見(欄被隱藏後游標懸空、根節點仍宣告 Esc 層)',
    file: 'components/DataTable/data-table.tsx',
    expectRed: ['E-datatable-hidden-col'],
    apply: (src) => replaceOnce(src, /const cursorDrawable = cursorRowIndex != null && cursorColVisible/, 'const cursorDrawable = cursorRowIndex != null'),
  },
  {
    id: 'overlay-escape-no-unclaimed-fallback',
    what: '浮層守門留住這一下之後不驗收(沒有控件認領也不重新派 = 宣告與處理分開時困住使用者)',
    file: 'lib/overlay-escape.ts',
    expectRed: ['E-unchained'],
    apply: (src) => replaceOnce(src, /\n      redispatchIfUnclaimed\(event, content\)\n/, '\n'),
  },
  {
    id: 'datepicker-claims-for-consumer',
    what: 'DatePicker 可打字欄位草稿乾淨時也問 isEscapeForControl(替 consumer 認領 → consumer 沒處理時守門的重新派被擋掉)',
    file: 'components/DatePicker/date-picker.tsx',
    expectRed: ['E-unchained'],
    apply: (src) => replaceOnce(src, /if \(isEscapeTakenElsewhere\(e\)\) return/, 'if (!isEscapeForControl(e)) return'),
  },
  {
    id: 'combobox-overflow-card-not-in-field',
    what: 'Combobox 不把「+N」浮出清單算進欄位(按卡裡的 × 焦點搬進卡 = 離開欄位、跑 consumer 的 onBlur)',
    file: 'components/Combobox/combobox.tsx',
    expectRed: ['B-overflow'],
    // 2026-10-21:「+N」卡改經 SelectMenu 的 fieldParts 交給 useCompositeFieldBlur(r1b fields F1)—— 錨點跟著搬,拆掉的仍是同一件事
    apply: (src) => replaceOnce(src, /fieldParts=\{\(\) => \[document\.getElementById\(overflowCardId\)\]\}/, 'fieldParts={() => []}'),
  },
  {
    id: 'composite-blur-no-close-check',
    what: '彈出層關掉的那一下不補量(握著焦點的節點隨收起卸載、或焦點從彈出層直接離開,都沒有人轉 blur;2026-10-21 r1b fields F1 前的形狀)',
    file: 'lib/composite-field-focus.ts',
    // N-esc-tab 不在內:Esc 之後焦點先回觸發欄位,Tab 是從觸發欄位離開(觸發欄位那一邊的 blur 照常轉)
    expectRed: ['B-leave-blank', 'B-leave-next', 'B-leave-tab'],
    apply: (src) => replaceOnce(src, /if \(!insideRef\.current \|\| !latest\.current\.onBlur\) return/, 'return'),
  },
  {
    id: 'exit-start-focus-return-off',
    what: '收起動畫期間不提早還焦點(等內容卸載才由 Radix 還;T11 之後 2026-10-21 r1b fields N1 前的形狀;Dialog / Sheet 到 2026-10-27 都是這樣)',
    file: 'lib/overlay-focus-return.ts',
    expectRed: ['N-esc-tab', 'N-esc-tab-modal'],
    apply: (src) => replaceOnce(src, /if \(closed && !handledRef\.current && node\.isConnected\) \{/, 'if (false) {'),
  },
  {
    id: 'fileviewer-exit-start-off',
    what: 'FileViewer 沒接收起那一刻的歸還(等內容卸載才還;2026-11-04 DA-esc-tab 之前的形狀,Dialog / Sheet 已在 10-27 接上)',
    file: 'components/FileViewer/file-viewer.tsx',
    expectRed: ['N-esc-tab-modal'],
    // 錨點跟著 50bce1a3 改:先取出 `const attachExitFocus = exitFocus.ref` 再在 callback 裡呼叫(check:react-hooks 的 exhaustive-deps)
    apply: (src) => replaceOnce(src, /if \(isModal\) attachExitFocus\(node\)/, 'void attachExitFocus'),
  },
  {
    id: 'modal-exit-keeps-aria-hidden',
    what: 'modal 收起那一刻不撤這次開啟加上的 aria-hidden(焦點提早還進一塊讀屏看不到的區域;2026-10-21 沒把這支套到 Dialog / Sheet 的原因)',
    file: 'lib/overlay-focus-return.ts',
    expectRed: ['N-esc-tab-modal'],
    apply: (src) => replaceOnce(src, /for \(const el of revealed\) el\.removeAttribute\('aria-hidden'\)/, 'void revealed'),
  },
  {
    id: 'button-focusable-keeps-aria-disabled-look',
    what: '可聚焦的停用保留 aria-disabled 那一組長相(滑過 / 按住釘在原本的填色;2026-10-07 前的寫法)',
    file: 'components/Button/button.tsx',
    expectRed: ['F-look'],
    apply: (src) => replaceOnce(src, /focusableDisabled \? withoutAriaDisabledLook\(ownVariantClasses\) : ownVariantClasses,/, 'ownVariantClasses,'),
  },
  {
    id: 'composer-no-removal-relay',
    what: 'AgentPanel 輸入盒附件移除後不接力焦點',
    file: 'components/AgentPanel/agent-panel.tsx',
    expectRed: ['C-composer-keyboard'],
    // 2026-10-13:附件列改用 OverflowTagList(與 Combobox 同一份可見數量測),容器 ref 改名 rowRef —— 突變錨點跟著改,拆掉的仍是同一件事
    apply: (src) => replaceOnce(src, /    focusAfterCollectionRemoval\(rowRef\.current, \{ owner: owner\.current \}\)\n    onRemove\(attachment\)/, '    onRemove(attachment)'),
  },
  {
    id: 'dialog-shell-ring',
    what: 'DialogContent 殼不抑制焦點框(2026-11-26 前:沒有可聚焦控件時開啟落點退回殼,畫出 2px 框;產品 canary 回報 C11)',
    file: 'components/Dialog/dialog.tsx',
    expectRed: ['F-shell-ring'],
    apply: (src) => replaceOnce(src, /\n        "outline-none",\n/, '\n'),
  },
  {
    id: 'sheet-shell-ring',
    what: 'SheetContent 殼不抑制焦點框(同上,sheetVariants 基底沒有 outline-none)',
    file: 'components/Sheet/sheet.tsx',
    expectRed: ['F-shell-ring'],
    apply: (src) => replaceOnce(src, /shadow-\[var\(--elevation-200\)\] outline-none transition/, 'shadow-[var(--elevation-200)] transition'),
  },
  {
    id: 'inline-action-disabled-feedback',
    what: 'ItemInlineActionButton 不看自身停用(2026-11-26 前:游標手指、滑過 / 按住照樣變色出底色;產品 canary 回報 C20)',
    file: 'patterns/element-anatomy/item-anatomy.tsx',
    expectRed: ['F-inline-disabled'],
    apply: (src) => replaceOnce(src, /const disabled = rest\.disabled === true \|\| rest\["aria-disabled"\] === true \|\| rest\["aria-disabled"\] === "true"/, 'const disabled = false'),
  },
  {
    id: 'sidebar-cmdb-modal-background',
    what: '背景頁的 SidebarProvider 不看自己是否被 modal 藏起來(2026-11-26 前:在對話框裡按 ⌘B 切到背景頁的側欄、寫 cookie;產品 canary 回報 C13)',
    file: 'components/Sidebar/sidebar.tsx',
    expectRed: ['K-cmdb-modal'],
    apply: (src) => replaceOnce(src, /wrapperRef\.current\?\.closest\('\[aria-hidden="true"\], \[inert\]'\) &&/, 'false &&'),
  },
  {
    id: 'sidebar-cmdb-none-intercepts',
    what: '不可收合(collapsible="none")的側欄照樣攔 ⌘B(2026-11-26 前的寫法)',
    file: 'components/Sidebar/sidebar.tsx',
    expectRed: ['K-cmdb-modal'],
    apply: (src) => replaceOnce(src, /\n {10}if \(collapsibleRef\.current === "none"\) return\n/, '\n'),
  },
  {
    id: 'sidebar-none-writes-cookie',
    what: '不可收合的側欄開關照寫全站共用的 sidebar_state cookie(2026-11-26 前的寫法)',
    file: 'components/Sidebar/sidebar.tsx',
    expectRed: ['K-cmdb-none-cookie'],
    apply: (src) => replaceOnce(src, /\n {8}if \(collapsibleRef\.current === "none"\) return\n/, '\n'),
  },
  {
    id: 'popover-anchor-no-return',
    what: 'PopoverContent 沒有觸發點時不記開啟者、不還焦點(2026-11-27 前:只還給 PopoverTrigger,錨點型浮層 Esc / 選完收起焦點掉到 body;產品 canary 回報 H20)',
    file: 'components/Popover/popover.tsx',
    expectRed: ['F-popover-anchor'],
    apply: (src) => replaceOnce(src, /const focusReturn = useTriggerlessFocusReturn\(false, \{ preferLiveOpener: true \}\)/, 'const focusReturn = { onOpenAutoFocus: (_e: Event) => {}, onCloseAutoFocus: (_e: Event) => {} }'),
  },
  {
    id: 'popover-anchor-steal-outside',
    what: 'PopoverContent 的還焦點當成 modal(指標按在浮層外收起也搶回開啟者 —— 非 modal 該讓使用者把注意力帶走)',
    file: 'components/Popover/popover.tsx',
    expectRed: ['F-popover-anchor-outside'],
    apply: (src) => replaceOnce(src, /useTriggerlessFocusReturn\(false, \{ preferLiveOpener: true \}\)/, 'useTriggerlessFocusReturn(true, { preferLiveOpener: true })'),
  },
]

// ─── harness(打包進空白頁)──────────────────────────────────────────────────
// 一次只掛一個場景(window.__scene(name)):每個場景一個浮層、一顆開啟鈕,Esc 的層數才數得清。
const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/design-system/components/Dialog/dialog'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/design-system/components/Sheet/sheet'
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent } from '@/design-system/components/Popover/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { FileViewer } from '@/design-system/components/FileViewer/file-viewer'
import { Button } from '@/design-system/components/Button/button'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { InlineEdit } from '@/design-system/components/InlineEdit/inline-edit'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { DataTableSortManager } from '@/design-system/components/DataTable/data-table-sort-manager'
import { Calendar } from '@/design-system/components/Calendar/calendar'
import { FileUpload } from '@/design-system/components/FileUpload/file-upload'
import { AgentPromptInput, AgentPanelHeader } from '@/design-system/components/AgentPanel/agent-panel'
import { Pagination } from '@/design-system/components/Pagination/pagination'
import { SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/design-system/components/Sidebar/sidebar'
import { Plus } from 'lucide-react'
import { useFormValidation } from '@/design-system/components/Field/use-form-validation'

window.__calls = {}
const count = (k) => { window.__calls[k] = (window.__calls[k] ?? 0) + 1 }
// K-cmdb:記下每一次寫 document.cookie。harness 頁是 about:blank,沒有 cookie 罐、寫了也讀不回來 → 改量「寫了沒」(CTRL-cmdb 證明量得到)
window.__cookieWrites = []
Object.defineProperty(document, 'cookie', { configurable: true, get: () => '', set: (v) => { window.__cookieWrites.push(String(v)) } })

function Shell({ title, children, footer }) {
  const [open, setOpen] = React.useState(false)
  window.__closeScene = () => setOpen(false)
  return (
    <div>
      <button type="button" data-open onClick={() => setOpen(true)}>開啟 {title}</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="scene-dialog" height="hug" width={720}>
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <DialogBody>{children}</DialogBody>
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LinkScene({ initial }) {
  const [url, setUrl] = React.useState(initial)
  return (
    <Shell title="連結">
      <label>文件<LinkInput aria-label="文件網址" value={url} onChange={(v) => { count('link'); setUrl(v) }} /></label>
      <p data-url>{url}</p>
      <button type="button" data-plain-button>別的按鈕</button>
    </Shell>
  )
}
function InlineScene() {
  const [v, setV] = React.useState('Q3 roadmap')
  return <Shell title="就地編輯"><InlineEdit label="標題" value={v} onCommit={(n) => { count('inline'); setV(n) }} /><p data-inline>{v}</p></Shell>
}
// E-inline-edit-custom / F-inline-edit-enter-focus:自訂編輯控件 = Select(工作項目「狀態」);選了只改草稿、不提交 ——「草稿不動」才量得到
const STATUS = [{ value: 'todo', label: '待處理' }, { value: 'doing', label: '進行中' }, { value: 'done', label: '已完成' }]
function InlineSelectScene({ openOnEdit }) {
  const [v, setV] = React.useState('doing')
  return (
    <Shell title="工作項目">
      <InlineEdit label="狀態" value={v} onCommit={(n) => { count('inlineSel'); setV(n) }}
        renderRead={(x) => <Select mode="view" display="tag" value={x} options={STATUS} />}
        renderEdit={(p) => <Select autoFocus display="tag" aria-label={p['aria-label']} value={p.value} options={STATUS} defaultOpen={openOnEdit} onChange={(n) => p.onChange(n)} />} />
      <p data-inline-sel>{v}</p>
    </Shell>
  )
}
// E-inline-edit-custom-date:自訂編輯控件 = 可打字 DatePicker(工作項目「截止日」;焦點留在輸入框,這一下 Esc 冒泡經過編輯容器);
// 選了只改草稿、不提交 —— 「取消編輯後值不變」才量得到
function InlineDateScene() {
  const [v, setV] = React.useState('2026-03-12')
  return (
    <Shell title="工作項目">
      <InlineEdit label="截止日" value={v} onCommit={(n) => { count('inlineDate'); setV(n) }}
        renderRead={(x) => <DatePicker mode="view" value={x} />}
        renderEdit={(p) => <DatePicker typeable aria-label={p['aria-label']} value={p.value} onChange={(n) => p.onChange(n)} />} />
      <p data-inline-date>{v}</p>
    </Shell>
  )
}
function DateScene() {
  const [v, setV] = React.useState('2026-03-12')
  return <Shell title="日期"><label>截止<DatePicker aria-label="截止日" typeable value={v} onChange={setV} /></label><p data-date>{v}</p></Shell>
}
const ROWS = [{ id: 'r1', sku: 'A-1', qty: 3 }, { id: 'r2', sku: 'B-2', qty: 5 }, { id: 'r3', sku: 'C-3', qty: 8 }]
const COLS = [{ accessorKey: 'sku', header: 'SKU', meta: { type: 'string' } }, { accessorKey: 'qty', header: '數量', meta: { type: 'number' } }]
function TableScene({ reorder }) {
  const [order, setOrder] = React.useState(['sku', 'qty'])
  return (
    <Shell title="表格">
      <DataTable columns={COLS} data={ROWS} getRowId={(r) => r.id} maxHeight="none" spreadsheetMode
        {...(reorder ? { enableColumnReorder: true, columnOrder: order, onColumnOrderChange: setOrder } : {})} />
    </Shell>
  )
}
// E-datatable-cell-widget:格裡裝的是控件的兩種格(連結格 = 連結 + 鉛筆、開關格 = 勾選框),試算表模式、可編輯
const WROWS = [{ id: 'r1', sku: 'A-1', link: 'https://github.com/acme/web', ok: false }, { id: 'r2', sku: 'B-2', link: 'https://acme.com/docs', ok: true }]
const WCOLS = [
  { accessorKey: 'sku', header: 'SKU', meta: { type: 'string' } },
  { accessorKey: 'link', header: '連結', meta: { type: 'url', editable: true, width: 260 } },
  { accessorKey: 'ok', header: '完成', meta: { type: 'boolean', editable: true, width: 90 } },
]
function TableWidgetScene() {
  const [rows, setRows] = React.useState(WROWS)
  return (
    <Shell title="表格">
      <DataTable columns={WCOLS} data={rows} getRowId={(r) => r.id} maxHeight="none" spreadsheetMode
        onCellCommit={(rowId, columnId, value) => setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, [columnId]: value } : r)))} />
    </Shell>
  )
}
function CalendarScene() {
  return (
    <Shell title="月曆">
      <Calendar aria-label="團隊行事曆" referenceDate={new Date(2026, 2, 1)} today={new Date(2026, 2, 1)}
        // 全天兩天 3/12–3/13:end 不含 → 3/14(calendar.spec.md「資料語意」;寫同一天 = 零長度 + 開發期警告)。
        // 跨日長條的 DOM 在 3/12 那格;E-calendar-tile 從第 2 天(3/13)進格,出格要回 3/13(calendar.spec.md「A11y 預設」格內那段)
        events={[{ id: 'e1', title: 'Sprint review', start: '2026-03-12', end: '2026-03-14', allDay: true }]}
        onCreateEvent={() => count('create')} onEventClick={() => count('event')} />
    </Shell>
  )
}
function DragScene() {
  const [sorting, setSorting] = React.useState([{ id: 'sku', desc: false }, { id: 'qty', desc: true }])
  return (
    <Popover>
      <PopoverTrigger asChild><Button data-open>排序</Button></PopoverTrigger>
      <PopoverContent id="scene-popover" className="w-auto p-0">
        <DataTableSortManager columns={COLS} sorting={sorting} onSortingChange={setSorting} />
      </PopoverContent>
    </Popover>
  )
}
const TAGS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma' }]
function ComboScene() {
  const form = useFormValidation({ initialValues: { tags: ['a'] }, intent: 'update', onSubmit: () => {} })
  return (
    <Shell title="標籤">
      {/* 欄位內搜尋(searchIn="trigger"):清單開著時焦點仍在欄位裡 —— 這一下 Esc 會同時冒泡到欄位的 handler,「一下兩層」才量得到 */}
      <label>標籤<Combobox aria-label="標籤" options={TAGS} searchable searchIn="trigger" {...form.getInputProps('tags')} /></label>
      <p data-tags>{form.values.tags.join(',')}</p>
    </Shell>
  )
}
function PopupScene() {
  const [submits, setSubmits] = React.useState(0)
  const form = useFormValidation({
    initialValues: { owner: '', tags: [], due: '', at: '' },
    validate: {
      owner: (v) => (v ? undefined : '負責人必填'),
      tags: (v) => (v.length ? undefined : '標籤必填'),
      due: (v) => (v ? undefined : '截止日必填'),
      at: (v) => (v ? undefined : '時間必填'),
    },
    onSubmit: () => { setSubmits((n) => n + 1) },
  })
  const err = (k) => (form.errors[k] ? <p role="alert" data-error-for={k}>{form.errors[k]}</p> : null)
  return (
    <form aria-label="必填表單" data-submits={submits} onSubmit={form.handleSubmit}>
      <label>負責人<Select aria-label="負責人" searchable options={[{ value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }]} {...form.getInputProps('owner')} /></label>{err('owner')}
      <label>標籤<Combobox aria-label="標籤" options={TAGS} {...form.getInputProps('tags')} /></label>{err('tags')}
      <label>截止<DatePicker aria-label="截止日" {...form.getInputProps('due')} value={form.values.due || null} /></label>{err('due')}
      <label>時間<TimePicker aria-label="時間" {...form.getInputProps('at')} /></label>{err('at')}
      <button type="submit" data-submit>送出</button>
      <button type="button" data-after>之後</button>
    </form>
  )
}
// PeoplePicker 放進表單(people-picker.spec.md「放入表單」):單選的值是一個人 → value 取陣列第一個(傳陣列會變成多選);多選直接用陣列
const PEOPLE = [{ name: 'Alice Wang', description: '產品經理' }, { name: 'Bob Lin', description: '前端工程師' }]
function PeopleScene({ multiFirst = false }) {
  const form = useFormValidation({
    initialValues: { lead: [], watchers: [] },
    validate: {
      lead: (v) => (v.length ? undefined : '專案負責人必填'),
      watchers: (v) => (v.length ? undefined : '關注者必填'),
    },
    onSubmit: () => {},
  })
  const err = (k) => (form.errors[k] ? <p role="alert" data-error-for={k}>{form.errors[k]}</p> : null)
  const lead = (
    <React.Fragment key="lead">
      <label>專案負責人<PeoplePicker aria-label="專案負責人" people={PEOPLE} {...form.getInputProps('lead')} value={form.values.lead[0] ?? null} /></label>{err('lead')}
    </React.Fragment>
  )
  const watchers = (
    <React.Fragment key="watchers">
      <label>關注者<PeoplePicker aria-label="關注者" people={PEOPLE} {...form.getInputProps('watchers')} /></label>{err('watchers')}
    </React.Fragment>
  )
  return (
    <form aria-label="人員表單" onSubmit={form.handleSubmit}>
      {multiFirst ? [watchers, lead] : [lead, watchers]}
      <button type="submit" data-submit>送出</button>
      <button type="button" data-after>之後</button>
    </form>
  )
}
function MenuScene() {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button data-menu-trigger>更多動作</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setOpen(true)}>重新命名</DropdownMenuItem>
          <DropdownMenuItem>複製連結</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="scene-dialog" height="hug" width={440}>
          <DialogHeader><DialogTitle>重新命名</DialogTitle></DialogHeader>
          <DialogBody><label>名稱<input defaultValue="發布公告草稿" /></label></DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
// 附件列「⋯」→ 預覽:FileViewer 由受控 open 開、沒有觸發點,開啟者是會跟著關掉的選單項
function MenuFileViewerScene() {
  const [open, setOpen] = React.useState(false)
  window.__closeScene = () => setOpen(false)
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button data-menu-trigger>附件動作</Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setOpen(true)}>預覽</DropdownMenuItem>
          <DropdownMenuItem>下載</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FileViewer id="scene-dialog" open={open} onOpenChange={setOpen}
        files={[{ id: 'f1', url: 'about:blank', name: '2026-Q3-合約.zip', mimeType: 'application/zip', size: 2048 }]} />
    </div>
  )
}
function RemoveScene() {
  const [files, setFiles] = React.useState([
    { id: 'f1', name: 'spec.pdf', status: 'completed' }, { id: 'f2', name: 'mockup.png', status: 'completed' }, { id: 'f3', name: 'notes.md', status: 'completed' },
  ])
  return <FileUpload files={files} onRemove={(id) => setFiles((fs) => fs.filter((f) => f.id !== id))} />
}
function ComposerScene() {
  const [value, setValue] = React.useState('')
  const [attachments, setAttachments] = React.useState([{ id: 'a1', label: 'brief.pdf' }, { id: 'a2', label: 'logo.svg' }])
  return (
    <AgentPromptInput value={value} onValueChange={setValue} onSubmit={() => count('send')} attachments={attachments}
      onRemoveAttachment={(a) => setAttachments((as) => as.filter((x) => x.id !== a.id))} onAddAttachment={() => count('add')} />
  )
}
function RenameScene() {
  const [title, setTitle] = React.useState('發布公告草稿')
  return (
    <div>
      <AgentPanelHeader title={title} defaultHistoryOpen activeConversationId="c1"
        conversations={[{ id: 'c1', title }, { id: 'c2', title: 'Q3 客訴分類' }]}
        onRenameConversation={(id, next) => { count('rename'); if (id === 'c1') setTitle(next) }}
        onNewConversation={() => {}} onClose={() => {}} />
      <p data-title>{title}</p>
    </div>
  )
}
function PaginationScene() {
  return <Pagination total={30} pageSize={10} defaultPage={2} />
}
function CtrlScene() {
  return <Shell title="對照"><label>備註<input data-plain /></label><button type="button" data-plain-button>別的按鈕</button></Shell>
}
// E-datatable-hidden-col:格游標所在的欄被隱藏(欄位顯示面板 / consumer 的 columnVisibility 都是這條路)
function TableHideScene() {
  const [visibility, setVisibility] = React.useState({})
  return (
    <Shell title="表格">
      <button type="button" data-hide-qty onClick={() => setVisibility({ qty: false })}>隱藏數量欄</button>
      <DataTable columns={COLS} data={ROWS} getRowId={(r) => r.id} maxHeight="none" spreadsheetMode
        columnVisibility={visibility} onColumnVisibilityChange={setVisibility} />
    </Shell>
  )
}
// E-unchained:consumer 展開 getInputProps 之後自己蓋掉 onKeyDown、沒有轉呼叫(規格要求要轉呼叫;這裡量「沒照做也不會被困住」)
function UnchainedScene() {
  const form = useFormValidation({ initialValues: { title: '修正登入逾時', due: '2026-03-12' }, intent: 'update', onSubmit: () => {} })
  const title = form.getInputProps('title')
  const due = form.getInputProps('due')
  return (
    <Shell title="自己接鍵盤">
      <label>標題<input {...title} onKeyDown={() => count('title-key')} /></label>
      <label>截止<DatePicker aria-label="截止日" typeable {...due} value={form.values.due || null} onKeyDown={() => count('due-key')} /></label>
      <p data-unchained>{form.values.title}|{form.values.due}</p>
    </Shell>
  )
}
// B-overflow:非搜尋型 Combobox 放在窄欄位裡、四個 Tag → 出現「+N」;consumer 的 onBlur 計次(經 getInputProps 的 onBlur 一起跑)
const TAGS4 = [...TAGS, { value: 'd', label: 'Delta' }]
function OverflowScene() {
  const form = useFormValidation({ initialValues: { tags: ['a', 'b', 'c', 'd'] }, intent: 'update', onSubmit: () => {} })
  const tags = form.getInputProps('tags')
  return (
    <form aria-label="標籤表單" style={{ width: 220, padding: 16 }}>
      <label>標籤<Combobox aria-label="標籤" options={TAGS4} {...tags} onBlur={(e) => { count('blur'); tags.onBlur(e) }} /></label>
      <p data-tags>{form.values.tags.join(',')}</p>
      <button type="button" data-after>之後</button>
    </form>
  )
}
// F-look:可聚焦的停用 vs 原生停用,每種 variant / danger 一列(左原生停用、右忙碌);最後一列是「按了之後自己變停用」的送出鈕(存檔後握著焦點)
const LOOK = [['primary', false], ['secondary', false], ['tertiary', false], ['text', false], ['link', false], ['primary', true], ['secondary', true], ['text', true]]
function LookScene() {
  const [held, setHeld] = React.useState(false)
  return (
    <div style={{ padding: 16 }}>
      {LOOK.map(([variant, danger]) => (
        <p key={variant + danger} data-look={variant + (danger ? '+danger' : '')} style={{ display: 'flex', gap: 24, margin: '0 0 12px' }}>
          <Button variant={variant} danger={danger} disabled data-native>儲存變更</Button>
          <Button variant={variant} danger={danger} loading data-focusable>儲存變更</Button>
        </p>
      ))}
      <p data-look="held" style={{ display: 'flex', gap: 24, margin: 0 }}>
        <Button variant="primary" disabled data-native>儲存變更</Button>
        <Button variant="primary" disabled={held} onClick={() => setHeld(true)} data-focusable>儲存變更</Button>
      </p>
    </div>
  )
}

// F-popover-anchor(2026-11-27,產品 canary 回報 H20;keyboard-model-canonical.md「關了之後焦點去哪」;popover.spec.md「A11y 預設」關閉返回):
// 錨點型 Popover —— 用 PopoverAnchor 定位、普通按鈕開(沒有 PopoverTrigger,Radix 沒有東西可還)。真實情境:任務列上的「狀態」鈕開出狀態清單,點選即改、收起。
// 旁邊一塊不可聚焦的空白(data-outside)給「指標按在外面收起」那一格。
function AnchorPopoverScene() {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState('進行中')
  window.__closeScene = () => setOpen(false)
  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <button type="button" data-open data-anchor-opener onClick={() => setOpen(true)}>狀態:{status}</button>
        </PopoverAnchor>
        <PopoverContent id="scene-popover" aria-label="任務狀態">
          {['待處理', '進行中', '已完成'].map((s) => (
            <button key={s} type="button" data-status-option={s} onClick={() => { setStatus(s); setOpen(false) }}>{s}</button>
          ))}
        </PopoverContent>
      </Popover>
      <div data-outside style={{ height: 80, marginTop: 240 }}>頁面空白處</div>
    </div>
  )
}

// F-shell-ring(2026-11-26,產品 canary 回報 C11;focus-canonical.md「E. 浮層程式落點」):浮層裡沒有任何可聚焦控件(只有標題列的 ×,它被排除在開啟落點之外),
// 開啟落點退回殼本身。Dialog / Sheet 修前殼畫出 2px 焦點框;Popover 早已抑制,同場量當同族對照。開啟鈕都用鍵盤 Enter 按(殼才會是 :focus-visible,量得到框)。
function ShellRingScene({ kind }) {
  const [open, setOpen] = React.useState(false)
  window.__closeScene = () => setOpen(false)
  if (kind === 'popover') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild><Button data-open>出貨紀錄</Button></PopoverTrigger>
        <PopoverContent id="scene-popover"><p>訂單 #1042 還沒有出貨紀錄。</p></PopoverContent>
      </Popover>
    )
  }
  return (
    <div>
      <button type="button" data-open onClick={() => setOpen(true)}>出貨紀錄</button>
      {kind === 'sheet' ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent id="scene-dialog">
            <SheetHeader><SheetTitle>訂單 #1042 的出貨紀錄</SheetTitle></SheetHeader>
            <SheetBody><p>這筆訂單還沒有出貨紀錄。</p></SheetBody>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent id="scene-dialog" height="hug" width={480}>
            <DialogHeader><DialogTitle>訂單 #1042 的出貨紀錄</DialogTitle></DialogHeader>
            <DialogBody><p>這筆訂單還沒有出貨紀錄。</p></DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// F-inline-disabled(2026-11-26,產品 canary 回報 C20;inline-action.spec.md「互動狀態」的「自身停用」列):群組標題列的行內動作鈕
// (SidebarGroupAction → ItemInlineActionButton)停用 vs 同頁可用的一顆(對照:滑過真的會變,證明量具看得到回饋)。
// 「所有專案」已達方案上限 → 建立專案停用;「我的收藏」的新增可用。text-fg-disabled 的探針給「停用字色」的期望值(不寫死顏色)。
function InlineDisabledScene() {
  return (
    <SidebarProvider style={{ minHeight: 'auto' }}>
      <div style={{ width: 280, padding: 16 }}>
        <SidebarGroup>
          <SidebarGroupLabel>所有專案</SidebarGroupLabel>
          <SidebarGroupAction icon={Plus} aria-label="建立專案" disabled data-inline="disabled" />
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>我的收藏</SidebarGroupLabel>
          <SidebarGroupAction icon={Plus} aria-label="新增收藏" data-inline="enabled" />
        </SidebarGroup>
        <span className="text-fg-disabled" data-probe-disabled>停用字色</span>
      </div>
    </SidebarProvider>
  )
}

// K-cmdb(2026-11-26,產品 canary 回報 C13;sidebar.spec.md「持久化與快捷鍵」):頁面有一個可收合的側欄,「工作區設定」對話框裡是
// 不可收合(collapsible="none")的設定導覽(Notion / Linear 設定視窗的左側分頁)。對話框在頁面 Provider 之後才掛上 → 頁面的 ⌘B 監聽先註冊、先跑。
const CMDB_NAV = [['general', '一般'], ['members', '成員與權限'], ['billing', '帳單'], ['notify', '通知']]
function DialogSidebarHandle() { window.__dialogSidebar = useSidebar(); return null }
function CmdBScene() {
  const [open, setOpen] = React.useState(false)
  window.__closeScene = () => setOpen(false)
  return (
    <SidebarProvider defaultActiveId="issues" style={{ minHeight: 'auto' }} data-cmdb="page">
      <Sidebar collapsible="offcanvas">
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton id="issues">議題</SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton id="projects">專案</SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <div>
        <button type="button" data-open onClick={() => setOpen(true)}>工作區設定</button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent id="scene-dialog" height="hug" width={720}>
            <DialogHeader><DialogTitle>工作區設定</DialogTitle></DialogHeader>
            <DialogBody>
              <SidebarProvider defaultActiveId="general" style={{ minHeight: 'auto' }} data-cmdb="dialog">
                <DialogSidebarHandle />
                <Sidebar collapsible="none">
                  <SidebarContent>
                    <SidebarMenu>
                      {CMDB_NAV.map(([id, label]) => <SidebarMenuItem key={id}><SidebarMenuButton id={id}>{label}</SidebarMenuButton></SidebarMenuItem>)}
                    </SidebarMenu>
                  </SidebarContent>
                </Sidebar>
              </SidebarProvider>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarProvider>
  )
}

// B-leave / N-esc-tab(2026-10-21 r1b fields F1 / N1):必填的五種彈出型欄位 + 一個一般 Popover;consumer 的 onBlur 逐欄計次
const LEAVE_BANKS = [{ value: '004', label: '004 臺灣銀行' }, { value: '812', label: '812 台新銀行' }, { value: '822', label: '822 中國信託' }]
function LeaveScene() {
  const form = useFormValidation({
    initialValues: { bank: '', branch: '', tags: [], due: '', at: '' },
    validate: {
      bank: (v) => (v ? undefined : '收款銀行必填'), branch: (v) => (v ? undefined : '分行必填'), tags: (v) => (v.length ? undefined : '標籤必填'),
      due: (v) => (v ? undefined : '截止日必填'), at: (v) => (v ? undefined : '時間必填'),
    },
    onSubmit: () => {},
  })
  const p = (k) => { const props = form.getInputProps(k); return { ...props, onBlur: (e) => { count('blur:' + k); props.onBlur(e) } } }
  const err = (k) => (form.errors[k] ? <p role="alert" data-error-for={k}>{form.errors[k]}</p> : null)
  return (
    <div style={{ display: 'flex', gap: 40 }}>
      <form aria-label="離開表單" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <Select aria-label="收款銀行" options={LEAVE_BANKS} {...p('bank')} />{err('bank')}
        <Select aria-label="分行" searchable options={LEAVE_BANKS} {...p('branch')} />{err('branch')}
        <Combobox aria-label="標籤" options={TAGS} {...p('tags')} />{err('tags')}
        <DatePicker aria-label="截止日" {...p('due')} value={form.values.due || null} />{err('due')}
        <TimePicker aria-label="時間" {...p('at')} />{err('at')}
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <input aria-label="備註" data-leave-next />
        <div data-leave-blank style={{ height: 240 }} />
        <Popover>
          <PopoverTrigger asChild><Button data-leave-pop>篩選</Button></PopoverTrigger>
          <PopoverContent aria-label="篩選面板"><div style={{ padding: 16 }}><Button>套用</Button></div></PopoverContent>
        </Popover>
        <button type="button" data-leave-after>之後</button>
      </div>
    </div>
  )
}
// N-esc-tab-modal(2026-10-27):DialogTrigger / SheetTrigger 開的 modal,外加「儲存鈕非同步關閉」的對話框(非離散更新,焦點鎖在收起那一刻還掛著)
function ModalExitScene() {
  const [dlg, setDlg] = React.useState(false)
  const [sheet, setSheet] = React.useState(false)
  const [save, setSave] = React.useState(false)
  const [viewer, setViewer] = React.useState(false)
  window.__closeScene = () => { setDlg(false); setSheet(false); setSave(false); setViewer(false) }
  return (
    <div style={{ display: 'flex', gap: 12, padding: 16 }}>
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogTrigger asChild><Button data-exit-trigger="dialog">新增成員</Button></DialogTrigger>
        <DialogContent data-exit-probe="dialog" height="hug" width={440}>
          <DialogHeader><DialogTitle>新增成員</DialogTitle></DialogHeader>
          <DialogBody><label>Email<input defaultValue="ada@acme.com" /></label></DialogBody>
        </DialogContent>
      </Dialog>
      <button type="button">之後一</button>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetTrigger asChild><Button data-exit-trigger="sheet">編輯成員</Button></SheetTrigger>
        <SheetContent data-exit-probe="sheet">
          <SheetHeader><SheetTitle>編輯成員</SheetTitle></SheetHeader>
          <SheetBody><label>職稱<input defaultValue="設計師" /></label></SheetBody>
        </SheetContent>
      </Sheet>
      <button type="button">之後二</button>
      <Dialog open={save} onOpenChange={setSave}>
        <DialogTrigger asChild><Button data-exit-trigger="save">重新命名</Button></DialogTrigger>
        <DialogContent data-exit-probe="save" height="hug" width={440}>
          <DialogHeader><DialogTitle>重新命名</DialogTitle></DialogHeader>
          <DialogBody><Button data-exit-save onClick={() => setTimeout(() => setSave(false), 50)}>儲存</Button></DialogBody>
        </DialogContent>
      </Dialog>
      <button type="button">之後三</button>
      {/* FileViewer:受控 open、沒有觸發點(附件縮圖 / 「預覽」鈕開的那種);開啟者由 useTriggerlessFocusReturn 記 */}
      <Button data-exit-trigger="fileviewer" onClick={() => setViewer(true)}>預覽合約</Button>
      <FileViewer data-exit-probe="fileviewer" open={viewer} onOpenChange={setViewer}
        files={[{ id: 'fv1', url: 'about:blank', name: '2026-Q3-合約.zip', mimeType: 'application/zip', size: 2048 }]} />
      <button type="button">之後四</button>
    </div>
  )
}
// 觸發鈕到 <html> 的祖先鏈上帶 aria-hidden="true" 的節點(收起動畫期間量;應為空)
window.__hiddenPath = (sel) => {
  const out = []
  for (let n = document.querySelector(sel); n && n !== document.documentElement; n = n.parentElement) if (n.getAttribute('aria-hidden') === 'true') out.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''))
  return out
}
// N-esc-tab:Tab 按下的時間 vs 收起動畫播完(浮層內容卸載)的時間 —— 只有 Tab 落在那段空窗裡,這一格才量得到東西
window.__exitWatchFor = (sel) => {
  window.__tabAt = null; window.__exitEndAt = null
  const mo = new MutationObserver(() => {
    if (window.__exitEndAt == null && !document.querySelector(sel)) { window.__exitEndAt = performance.now(); mo.disconnect() }
  })
  mo.observe(document.body, { childList: true, subtree: true })
}
window.__exitWatch = () => {
  window.__tabAt = null; window.__exitEndAt = null
  const mo = new MutationObserver(() => {
    if (window.__exitEndAt == null && !document.querySelector('[data-radix-popper-content-wrapper] [role="dialog"]')) { window.__exitEndAt = performance.now(); mo.disconnect() }
  })
  mo.observe(document.body, { childList: true, subtree: true })
}
document.addEventListener('keydown', (e) => { if (e.key === 'Tab' && window.__tabAt === null) window.__tabAt = performance.now() }, true)

const SCENES = {
  leave: () => <LeaveScene />,
  modalExit: () => <ModalExitScene />,
  link: () => <LinkScene initial="https://acme.com/docs" />,
  linkEmpty: () => <LinkScene initial="" />,
  inline: () => <InlineScene />,
  inlineSelect: () => <InlineSelectScene openOnEdit />,
  inlineSelectClosed: () => <InlineSelectScene openOnEdit={false} />,
  inlineDate: () => <InlineDateScene />,
  date: () => <DateScene />,
  table: () => <TableScene reorder={false} />,
  tableDrag: () => <TableScene reorder />,
  tableLink: () => <TableWidgetScene />,
  calendar: () => <CalendarScene />,
  drag: () => <DragScene />,
  combo: () => <ComboScene />,
  popup: () => <PopupScene />,
  people: () => <PeopleScene />,
  peopleMultiFirst: () => <PeopleScene multiFirst />,
  menu: () => <MenuScene />,
  menuFileViewer: () => <MenuFileViewerScene />,
  remove: () => <RemoveScene />,
  composer: () => <ComposerScene />,
  rename: () => <RenameScene />,
  pagination: () => <PaginationScene />,
  ctrl: () => <CtrlScene />,
  tableHide: () => <TableHideScene />,
  unchained: () => <UnchainedScene />,
  overflow: () => <OverflowScene />,
  look: () => <LookScene />,
  shellDialog: () => <ShellRingScene kind="dialog" />,
  shellSheet: () => <ShellRingScene kind="sheet" />,
  shellPopover: () => <ShellRingScene kind="popover" />,
  anchorPopover: () => <AnchorPopoverScene />,
  cmdb: () => <CmdBScene />,
  inlineDisabled: () => <InlineDisabledScene />,
}

// 量具讀的快照(頁面端;Node 端用 key 取,不把函式字串送進頁面)
window.__describe = (el) => {
  if (!el || el === document.body) return 'BODY'
  const label = el.getAttribute?.('aria-label') ?? ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? (el.name || '') : (el.textContent ?? '').trim().slice(0, 20))
  return el.tagName + (label ? ':' + label : '')
}
const q = (sel) => document.querySelector(sel)
window.__extra = {
  link: () => ({ url: q('[data-url]')?.textContent, input: !!q('#scene-dialog input[type=url]'), inputValue: q('#scene-dialog input[type=url]')?.value ?? null, invalid: q('#scene-dialog input[type=url]')?.getAttribute('aria-invalid') === 'true', calls: window.__calls.link ?? 0 }),
  inline: () => ({ value: q('[data-inline]')?.textContent, editing: !!q('#scene-dialog input'), calls: window.__calls.inline ?? 0 }),
  // 編輯中 = [data-editing="true"](檢視態那一層也帶 data-editing="false");draft = 編輯控件(Select 觸發欄位)此刻顯示的字;list = 選單開著
  inlineSel: () => {
    const box = q('#scene-dialog [data-editing="true"]')
    return { value: q('[data-inline-sel]')?.textContent, editing: !!box, draft: box?.querySelector('[role="combobox"]')?.textContent ?? null,
      list: !!q('[cmdk-root]'), focusInEdit: !!box && box.contains(document.activeElement), calls: window.__calls.inlineSel ?? 0 }
  },
  // draft = 可打字輸入框此刻的字(DatePicker 自己的草稿,不是 InlineEdit 的);calendar = 日曆開著
  inlineDate: () => {
    const box = q('#scene-dialog [data-editing="true"]')
    return { value: q('[data-inline-date]')?.textContent, editing: !!box, draft: box?.querySelector('input[role=combobox]')?.value ?? null,
      calendar: !!q('[role=dialog][aria-label="日期選擇"]'), focusInEdit: !!box && box.contains(document.activeElement), calls: window.__calls.inlineDate ?? 0 }
  },
  date: () => ({ draft: q('#scene-dialog input[role=combobox]')?.value ?? null, calendar: !!q('[role=dialog][aria-label="日期選擇"]'), value: q('[data-date]')?.textContent }),
  table: () => ({ cursor: !!q('[data-selected-cell-id]'), cursorId: q('[data-selected-cell-id]')?.getAttribute('data-selected-cell-id') ?? null,
    focusCell: document.activeElement?.closest?.('[data-cell-id]')?.getAttribute('data-cell-id') ?? null, live: q('[data-drag-live-region]')?.textContent ?? '' }),
  cal: () => ({ tile: document.activeElement?.hasAttribute('data-calendar-tile') ?? false, day: document.activeElement?.hasAttribute('data-calendar-day') ?? false,
    dayIso: document.activeElement?.getAttribute('data-calendar-day') ?? null }),
  drag: () => ({ live: q('[data-drag-live-region]')?.textContent ?? '', handles: document.querySelectorAll('button[aria-label="拖曳重排"]').length }),
  combo: () => ({ tags: q('[data-tags]')?.textContent, listbox: !!q('[cmdk-root]') }),
  err: () => ({ errors: Array.from(document.querySelectorAll('[data-error-for]')).map((e) => e.getAttribute('data-error-for')), submits: Number(q('form')?.dataset.submits), activeName: document.activeElement?.getAttribute('name'), activeRole: document.activeElement?.getAttribute('role') }),
  remove: () => ({ removes: document.querySelectorAll('[data-collection-remove]').length, onRemove: document.activeElement?.hasAttribute('data-collection-remove') ?? false, label: document.activeElement?.getAttribute('aria-label') }),
  comp: () => ({ tags: document.querySelectorAll('[data-collection-remove]').length, value: q('textarea')?.value }),
  rename: () => {
    const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).find((el) => document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() === '改名對話')
    const save = dlg ? Array.from(dlg.querySelectorAll('button')).find((b) => b.textContent?.trim() === '儲存') : null
    return { renameOpen: !!dlg, value: dlg?.querySelector('input')?.value ?? null, error: dlg?.querySelector('[role="alert"]')?.textContent ?? null,
      saveNativeDisabled: save ? save.disabled : null, calls: window.__calls.rename ?? 0, title: q('[data-title]')?.textContent }
  },
  page: () => ({ current: q('[aria-current="page"]')?.textContent?.trim() ?? null, nextAriaDisabled: q('button[aria-label="下一頁"]')?.getAttribute('aria-disabled') === 'true', nextNativeDisabled: q('button[aria-label="下一頁"]')?.disabled ?? null }),
  unchained: () => ({ values: q('[data-unchained]')?.textContent ?? null, calendar: !!q('[role=dialog][aria-label="日期選擇"]'), keys: { title: window.__calls['title-key'] ?? 0, due: window.__calls['due-key'] ?? 0 } }),
  leave: () => ({
    errors: Array.from(document.querySelectorAll('[data-error-for]')).map((e) => e.getAttribute('data-error-for')).sort(),
    blur: Object.fromEntries(Object.entries(window.__calls).filter(([k]) => k.startsWith('blur:')).map(([k, v]) => [k.slice(5), v])),
  }),
  overflow: () => {
    const trigger = q('form[aria-label="標籤表單"] [role="combobox"]')
    return {
      tags: q('[data-tags]')?.textContent ?? null, blur: window.__calls.blur ?? 0, plusN: !!q('[data-overflow-indicator]'),
      cardRemoves: Array.from(document.querySelectorAll('[data-collection-remove]')).filter((b) => !trigger?.contains(b)).length,
    }
  },
}
window.__snap = (key) => ({
  dialog: !!q('#scene-dialog[data-state="open"]'),
  popover: !!q('#scene-popover[data-state="open"]'),
  active: window.__describe(document.activeElement),
  tooltip: !!q('[role="tooltip"]'),
  ...(key ? window.__extra[key]() : {}),
})

let sceneName = 'ctrl'
let mount = 0
function App({ scene, mount }) {
  return <TooltipProvider><main data-scene={scene} data-mount={mount}>{SCENES[scene]()}</main></TooltipProvider>
}
const root = createRoot(document.getElementById('root'))
window.__scene = (name) => { sceneName = name; mount += 1; window.__calls = {}; root.render(<App key={mount} scene={name} mount={mount} />); return mount }
window.__scene('ctrl')
`

// ─── 量具 ────────────────────────────────────────────────────────────────────
const DIALOG = '#scene-dialog'

async function runChecks(page) {
  const out = []
  const check = (id, kind, title, pass, detail) => out.push({ id, kind, title, pass: Boolean(pass), detail })
  const d = makeDriver(page)
  const scene = async (name) => {
    // 上一個場景的浮層若還開著,先關掉等它收完(Radix modal 開著時 body 是 pointer-events:none;直接換掉子樹會把那個狀態留在 body 上)
    await page.evaluate(() => { window.__closeScene?.(); window.__closeScene = undefined })
    await page.waitForFunction(() => !document.querySelector('#scene-dialog[data-state="open"]') && !document.querySelector('#scene-popover[data-state="open"]') && document.body.style.pointerEvents !== 'none', null, { timeout: WAIT_CAP_MS })
      .catch(async () => {
        const left = await page.evaluate(() => ({ dialog: !!document.querySelector('#scene-dialog[data-state="open"]'), popover: !!document.querySelector('#scene-popover[data-state="open"]'), bodyPointerEvents: document.body.style.pointerEvents, scene: document.querySelector('main')?.dataset.scene }))
        throw new InstrumentError(`上一個場景的浮層收不掉(換到 ${name} 之前:${JSON.stringify(left)})`)
      })
    const n = await page.evaluate((s) => window.__scene(s), name)
    await page.waitForSelector(`main[data-scene="${name}"][data-mount="${n}"]`, { timeout: WAIT_CAP_MS })
      .catch(() => { throw new InstrumentError(`場景 ${name} 沒掛上`) })
    await d.settle()
  }
  const waitSel = async (selector, what) => {
    await page.waitForSelector(selector, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError(`${what}(等不到 ${selector})`) })
    await d.settle(); await d.focusStable()
  }
  const closeOverlay = async () => {
    await page.evaluate(() => { window.__closeScene?.() })
    await page.waitForFunction(() => !document.querySelector('#scene-dialog[data-state="open"]') && !document.querySelector('#scene-popover[data-state="open"]') && document.body.style.pointerEvents !== 'none', null, { timeout: WAIT_CAP_MS })
      .catch(() => { throw new InstrumentError('浮層收不掉') })
    await d.settle()
  }
  // 上一列若把對話框留著開(例:Enter 提交後),先關掉再重開 —— modal 開著時 body 是 pointer-events:none,開啟鈕按不到
  const openDialog = async () => { await closeOverlay(); await d.click('[data-open]'); await waitSel(`${DIALOG}[data-state="open"]`, '對話框沒開') }
  const snap = (key) => page.evaluate((k) => window.__snap(k), key ?? null)
  /** 連按 Esc 直到對話框 / 浮層關閉(上限 cap),回每一下之後的快照;焦點落 body 立刻記下 */
  const escapeUntilClosed = async (key, cap = 5, layer = 'dialog') => {
    const steps = []
    for (let i = 0; i < cap; i += 1) {
      await d.press('Escape')
      const s = await snap(key)
      steps.push(s)
      if (!s[layer]) break
    }
    return steps
  }
  const neverBody = (steps) => steps.every((s) => s.active !== 'BODY')
  const closedAt = (steps, layer = 'dialog') => steps.findIndex((s) => !s[layer]) + 1 // 1-based;0 = 沒關
  const needs = (cond, what, got) => { if (!cond) throw new InstrumentError(`${what}:${JSON.stringify(got)}`) }

  // ── CTRL-clean / CTRL-button(對照)──
  await scene('ctrl'); await openDialog()
  await d.click('[data-plain]')
  let steps = await escapeUntilClosed()
  // 對照只量「量具看得到關閉」:焦點回不回開啟鈕是契約(OE29,F-menu / form-validation-contract R-return),放進對照會讓天然對照組的對照列也紅
  check('CTRL-clean', 'control', '對照:乾淨的欄位按第一下 Esc 就關對話框', closedAt(steps) === 1, steps)
  await openDialog(); await d.click('[data-plain-button]')
  steps = await escapeUntilClosed()
  check('CTRL-button', 'control', '對照:焦點在對話框裡的按鈕上按第一下 Esc 就關', closedAt(steps) === 1, steps)

  // ── E-link-edit ──
  await scene('link'); await openDialog()
  await d.click('button[aria-label="編輯連結"]')
  let before = await snap('link')
  needs(before.input, 'LinkInput 按鉛筆後沒進編輯', before)
  steps = await escapeUntilClosed('link')
  check('E-link-edit', 'contract', 'Dialog 裡的 LinkInput 進編輯 → 第一下 Esc 取消編輯(回連結狀態、焦點給鉛筆)、對話框不關 → 1–2 下後才關(鉛筆的 Tooltip 若開著算一層);焦點從不落 body',
    steps.length >= 2 && steps[0].dialog && !steps[0].input && steps[0].active === 'BUTTON:編輯連結' && closedAt(steps) >= 2 && closedAt(steps) <= 3 && neverBody(steps), steps)

  // ── F-enter-commit(LinkInput + InlineEdit)──
  await openDialog(); await d.click('button[aria-label="編輯連結"]')
  await page.keyboard.press('End'); await d.type('/x'); await d.press('Enter')
  const linkEnter = await snap('link')
  await scene('inline'); await openDialog()
  await d.click('button[aria-label="編輯 標題"]')
  await page.keyboard.press('End'); await d.type(' v2'); await d.press('Enter')
  let s = await snap('inline')
  check('F-enter-commit', 'contract', 'LinkInput 編輯後按 Enter → 回連結狀態、onChange 一次、焦點在鉛筆;InlineEdit 按 Enter → 回檢視、onCommit 一次、焦點在檢視鈕(都不把編輯重開)',
    linkEnter.dialog && !linkEnter.input && linkEnter.url === 'https://acme.com/docs/x' && linkEnter.calls === 1 && linkEnter.active === 'BUTTON:編輯連結'
    && s.dialog && !s.editing && s.value === 'Q3 roadmap v2' && s.calls === 1 && s.active === 'BUTTON:編輯 標題', { linkEnter, inline: s })

  // ── E-inline-edit ──
  await openDialog(); await d.click('button[aria-label="編輯 標題"]')
  before = await snap('inline')
  needs(before.editing, 'InlineEdit 沒進編輯', before)
  steps = await escapeUntilClosed('inline')
  check('E-inline-edit', 'contract', 'Dialog 裡的 InlineEdit 進編輯 → 第一下 Esc 回檢視(焦點回檢視鈕)、對話框不關 → 第二下關;焦點從不落 body',
    steps.length === 2 && steps[0].dialog && !steps[0].editing && steps[0].active === 'BUTTON:編輯 標題' && !steps[1].dialog && neverBody(steps), steps)

  // ── E-inline-edit-custom(自訂編輯控件 = Select,進編輯即開選單)──
  await scene('inlineSelect'); await openDialog()
  await d.click('#scene-dialog button[aria-label="編輯 狀態"]')
  await waitSel('[cmdk-item][data-value="done"]', 'InlineEdit 進編輯後 Select 選單沒開')
  // 選「已完成」:只改草稿(場景的 onChange 不提交)→ 選單收起、仍在編輯;再用 ↓ 打開選單(焦點在觸發欄位上)
  await d.click('[cmdk-item][data-value="done"]')
  const picked = await snap('inlineSel')
  needs(picked.editing && !picked.list && picked.draft?.includes('已完成') && picked.focusInEdit, '選了「已完成」後應仍在編輯、選單收起、焦點在編輯控件上', picked)
  await d.press('ArrowDown')
  await waitSel('[cmdk-item]', '觸發欄位按 ↓ 沒重開選單')
  before = await snap('inlineSel')
  needs(before.list && before.editing, '重開選單後狀態不對', before)
  steps = await escapeUntilClosed('inlineSel')
  check('E-inline-edit-custom', 'contract', 'Dialog 裡的 InlineEdit(renderEdit = Select,草稿改成「已完成」、選單開著)→ 第一下 Esc 只關選單、草稿不動、仍在編輯 → 第二下取消編輯(值不變、onCommit 0 次、焦點回檢視鈕)、對話框不關 → 第三下關;焦點從不落 body',
    steps.length === 3 && steps[0].dialog && !steps[0].list && steps[0].editing && !!steps[0].draft?.includes('已完成') && steps[0].calls === 0
    && steps[1].dialog && !steps[1].editing && steps[1].value === 'doing' && steps[1].calls === 0 && steps[1].active === 'BUTTON:編輯 狀態'
    && !steps[2].dialog && neverBody(steps), { picked, before, steps })

  // ── F-inline-edit-enter-focus(自訂編輯控件 = Select,不開選單;桌機 Select 的 autoFocus 無作用)──
  await scene('inlineSelectClosed'); await openDialog()
  await d.click('#scene-dialog button[aria-label="編輯 狀態"]')
  const entered = await snap('inlineSel')
  needs(entered.editing && !entered.list, 'InlineEdit 沒進編輯(或選單不該開卻開了)', entered)
  steps = await escapeUntilClosed('inlineSel')
  check('F-inline-edit-enter-focus', 'contract', 'Dialog 裡的 InlineEdit(renderEdit = Select、不開選單)進編輯 → 焦點在編輯控件上 → 第一下 Esc 取消編輯、焦點回檢視鈕、對話框不關 → 第二下關;焦點從不落 body',
    entered.focusInEdit && steps.length === 2 && steps[0].dialog && !steps[0].editing && steps[0].calls === 0 && steps[0].active === 'BUTTON:編輯 狀態'
    && !steps[1].dialog && neverBody(steps), { entered, steps })

  // ── E-inline-edit-custom-date(自訂編輯控件 = 可打字 DatePicker;焦點留在輸入框,Esc 冒泡經過編輯容器)──
  // 承重的是 handleCustomEditKeyDown 的兩道防線 —— Select 那兩列沒有一下 Esc 要它們擋(2026-11-25 審查者探針:拿掉兩道,37 列照綠)。
  // 兩道各守一段,所以這一列走兩段(2026-11-25 實測:只走「打了字」那段,拿掉「Radix 已用掉」照綠 —— 打了字時第一下由「就近的那一層」先擋下):
  //   (a) 打了字:輸入框自己宣告更內層 → 「就近的那一層」擋住編輯容器(拿掉 → 第二下同時還原草稿又取消編輯)
  //   (b) 沒打字:輸入框沒有宣告,就近的是編輯容器;日曆是 Radix 那一層 → 「Radix 已用掉」擋住編輯容器(拿掉 → 第一下同時關日曆又取消編輯)
  const enterDateEdit = async () => {
    await d.click('#scene-dialog button[aria-label="編輯 截止日"]')
    const s0 = await snap('inlineDate')
    // 不要求進編輯時焦點已在輸入框(那是 F-inline-edit-enter-focus 量的;這裡接著就點輸入框):放進前置條件,
    // 「進編輯不補焦點」的突變與修改前的基準樹會在這裡變成儀器失效,而不是照實量完這一列
    needs(s0.editing && !s0.calendar, 'InlineEdit 沒進編輯 / 日曆不該開卻開了', s0)
    await d.click('#scene-dialog [data-editing="true"] input[role=combobox]')
    return s0
  }
  await scene('inlineDate'); await openDialog()
  const dateEntered = await enterDateEdit()
  await page.keyboard.press('End'); await d.type('9')
  const dateTyped = await snap('inlineDate')
  needs(dateTyped.calendar && dateTyped.draft === '2026/03/129', '點輸入框沒開日曆 / 打字沒進輸入框', dateTyped)
  const typedSteps = await escapeUntilClosed('inlineDate', 6)
  await openDialog()
  await enterDateEdit()
  const dateOpened = await snap('inlineDate')
  needs(dateOpened.calendar && dateOpened.draft === '2026/03/12', '點輸入框沒開日曆(沒打字那一段)', dateOpened)
  const cleanSteps = await escapeUntilClosed('inlineDate', 6)
  check('E-inline-edit-custom-date', 'contract', 'Dialog 裡的 InlineEdit(renderEdit = 可打字 DatePicker),點輸入框開日曆:(a) 打一個字 → 第一下 Esc 只關日曆(草稿不動、仍在編輯)→ 第二下還原草稿(仍在編輯)→ 第三下取消編輯(值不變、onCommit 0 次、焦點回檢視鈕)、對話框不關 → 第四下關;(b) 沒打字 → 第一下只關日曆(仍在編輯、焦點在輸入框)→ 第二下取消編輯 → 第三下關;焦點從不落 body',
    typedSteps.length === 4
    && typedSteps[0].dialog && !typedSteps[0].calendar && typedSteps[0].editing && typedSteps[0].draft === '2026/03/129'
    && typedSteps[1].dialog && typedSteps[1].editing && typedSteps[1].draft === '2026/03/12'
    && typedSteps[2].dialog && !typedSteps[2].editing && typedSteps[2].value === '2026-03-12' && typedSteps[2].calls === 0 && typedSteps[2].active === 'BUTTON:編輯 截止日'
    && !typedSteps[3].dialog && neverBody(typedSteps)
    && cleanSteps.length === 3
    && cleanSteps[0].dialog && !cleanSteps[0].calendar && cleanSteps[0].editing && cleanSteps[0].focusInEdit
    && cleanSteps[1].dialog && !cleanSteps[1].editing && cleanSteps[1].value === '2026-03-12' && cleanSteps[1].calls === 0 && cleanSteps[1].active === 'BUTTON:編輯 截止日'
    && !cleanSteps[2].dialog && neverBody(cleanSteps), { dateEntered, dateTyped, typedSteps, dateOpened, cleanSteps })

  // ── E-link-typed / F-link-enter-stay ──
  await scene('linkEmpty'); await openDialog()
  await d.click('#scene-dialog input[type=url]'); await d.type('acme')
  steps = await escapeUntilClosed('link')
  check('E-link-typed', 'contract', 'Dialog 裡沒有值的 LinkInput 打了字 → 第一下 Esc 丟掉草稿、焦點留在輸入框、對話框不關 → 第二下關',
    steps.length === 2 && steps[0].dialog && steps[0].inputValue === '' && steps[0].active.startsWith('INPUT') && !steps[1].dialog && neverBody(steps), steps)
  await openDialog(); await d.click('#scene-dialog input[type=url]'); await d.type('acme'); await d.press('Enter')
  const invalidEnter = await snap('link')
  // 「清空按 Enter」從一個本來就有值的 LinkInput 起手(重掛場景),不靠「合法網址 Enter 回連結狀態」當前置 ——
  // 那正是 F-enter-commit 量的東西;它被突變弄壞時(Enter 把編輯重開)不該把這一列變成儀器失效
  await scene('link'); await openDialog()
  await d.click('button[aria-label="編輯連結"]'); await d.clearFocused(); await d.press('Enter')
  const clearedEnter = await snap('link')
  check('F-link-enter-stay', 'contract', "LinkInput 打了不合法網址按 Enter → 留在輸入框、紅框、焦點在輸入框;清空按 Enter → onChange('')、輸入框仍在、焦點仍在輸入框(修前兩種都掉到 body)",
    invalidEnter.dialog && invalidEnter.input && invalidEnter.invalid && invalidEnter.active.startsWith('INPUT')
    && clearedEnter.dialog && clearedEnter.input && clearedEnter.url === '' && clearedEnter.active.startsWith('INPUT'), { invalidEnter, clearedEnter })

  // ── E-datepicker-draft ──
  await scene('date'); await openDialog()
  await d.click('#scene-dialog input[role=combobox]')
  await page.keyboard.press('End'); await d.type('9')
  before = await snap('date')
  needs(before.calendar, '點可打字欄位沒開日曆', before)
  steps = await escapeUntilClosed('date')
  check('E-datepicker-draft', 'contract', 'Dialog 裡可打字的 DatePicker:日曆開著且草稿改過 → 第一下 Esc 只關日曆、草稿不動 → 第二下還原草稿、對話框不關 → 第三下關',
    steps.length === 3 && steps[0].dialog && !steps[0].calendar && steps[0].draft === '2026/03/129' && steps[1].dialog && steps[1].draft === '2026/03/12' && !steps[2].dialog && neverBody(steps), steps)

  // ── E-datatable-cursor ──
  await scene('table'); await openDialog()
  await d.click('#scene-dialog [role="gridcell"]')
  before = await snap('table')
  needs(before.cursor, '點格沒有格游標', before)
  steps = await escapeUntilClosed('table')
  check('E-datatable-cursor', 'contract', 'Dialog 裡試算表模式的 DataTable 有格游標 → 第一下 Esc 清游標、焦點留在表格、對話框不關 → 第二下關',
    steps.length === 2 && steps[0].dialog && !steps[0].cursor && steps[0].active !== 'BODY' && !steps[1].dialog && neverBody(steps), steps)

  // ── E-drag-table ──
  await scene('tableDrag'); await openDialog()
  await d.click('#scene-dialog [role="gridcell"]')
  await d.focus('#scene-dialog [role="columnheader"][aria-roledescription]')
  await d.press(' ')
  before = await snap('table')
  needs(/已提起|移到/.test(before.live), '表頭按空白鍵沒提起欄位', before)
  await d.press('Escape')
  // 格游標框只在焦點在格線區裡時才畫(data-table.spec.md「焦點離開格線區時格游標框收起」):焦點還在表頭,先把焦點放回表格根再讀游標還在不在。
  // 對話框已經被這一下關掉(修前的行為)→ 表格不在了,直接讀快照讓這一列紅,不把它變成儀器失效
  if (await page.$('#scene-dialog[data-state="open"] [role="grid"]')) await d.focus('#scene-dialog [role="grid"]')
  s = await snap('table')
  check('E-drag-table', 'contract', 'Dialog 裡有格游標的 DataTable:表頭按空白鍵提起欄位 → Esc 只取消拖曳(播報「已取消」),格游標還在、對話框不關、焦點不落 body',
    s.dialog && s.cursor && /已取消/.test(s.live) && s.active !== 'BODY', s)

  // ── E-datatable-cell-widget(試算表模式連結格 / 開關格的格內模式;2026-10-13 待辦總帳 Q3c)──
  // 兩種格各走一次:點 SKU 格放上游標 → 方向鍵走到該格(鍵盤路徑,不點格 —— 點連結格的網址文字會開連結)→ Enter 進格內 → 連按 Esc。
  // 「Enter 焦點進到格裡的控件」本身是契約(Q3c),寫進判定而不是前置條件:修前按了沒反應,這一列應讀成紅、不是儀器失效。
  const widgetRuns = {}
  for (const [col, hops] of [['link', 1], ['ok', 2]]) {
    await scene('tableLink'); await openDialog()
    await d.click(`${DIALOG} [data-cell-id="r1:sku"]`)
    for (let i = 0; i < hops; i += 1) await d.press('ArrowRight')
    before = await snap('table')
    needs(before.cursorId === `r1:${col}`, `方向鍵沒把格游標移到 ${col} 格`, before)
    await d.press('Enter')
    const entered = await snap('table')
    widgetRuns[col] = { entered, steps: await escapeUntilClosed('table') }
  }
  const widgetOk = ({ entered, steps: st }, col) => entered.dialog && entered.focusCell === `r1:${col}` && /^(A|BUTTON)/.test(entered.active)
    && st.length === 3 && st[0].dialog && st[0].cursorId === `r1:${col}` && st[0].focusCell == null
    && st[1].dialog && !st[1].cursor && !st[2].dialog && neverBody(st)
  check('E-datatable-cell-widget', 'contract', 'Dialog 裡試算表 DataTable:格游標在連結格 / 開關格按 Enter → 焦點進到格裡的連結 / 勾選框 → 第一下 Esc 回格導覽(游標停在原格、焦點離開格內、對話框不關)→ 第二下清游標 → 第三下關;焦點從不落 body(兩種格各一次)',
    widgetOk(widgetRuns.link, 'link') && widgetOk(widgetRuns.ok, 'ok'), widgetRuns)

  // ── E-calendar-tile ──
  await scene('calendar'); await openDialog()
  // 從長條的第 2 天(3/13)進格:長條的 DOM 在 3/12 那格,出格要回進格那一天 3/13(2026-11-25;之前回 DOM 所在的 3/12)
  await d.focus('#scene-dialog [data-calendar-day="2026-03-13"]')
  await d.press('F2')
  before = await snap('cal')
  needs(before.tile, 'F2 沒進格內', before)
  steps = await escapeUntilClosed('cal')
  check('E-calendar-tile', 'contract', 'Dialog 裡的 Calendar:從長條的第 2 天 F2 進格內(焦點在事件方塊)→ 第一下 Esc 出格回進格那一天的日期鈕、對話框不關 → 第二下關',
    steps.length === 2 && steps[0].dialog && steps[0].day && steps[0].dayIso === '2026-03-13' && !steps[1].dialog && neverBody(steps), steps)

  // ── E-drag(排序面板 in Popover)──
  await scene('drag'); await d.click('[data-open]')
  await waitSel('#scene-popover[data-state="open"]', '排序面板沒開')
  await d.focus('#scene-popover button[aria-label="拖曳重排"]')
  await d.press(' ')
  before = await snap('drag')
  needs(/已提起|移到/.test(before.live), '把手按空白鍵沒提起', before)
  await d.press('ArrowDown')
  steps = await escapeUntilClosed('drag', 5, 'popover')
  check('E-drag', 'contract', 'Popover 裡的排序面板:把手按空白鍵提起 → ↓ → 第一下 Esc 只取消拖曳(播報「已取消」)、面板不關 → 第二下關面板',
    steps.length === 2 && steps[0].popover && /已取消/.test(steps[0].live) && steps[0].handles === 2 && !steps[1].popover && neverBody(steps), steps)

  // ── E-combobox-popup / E-combobox ──
  await scene('combo'); await openDialog()
  // 用鍵盤開清單:harness 沒有版面 CSS,觸發區的正中央可能剛好是 Tag 的 ×,用滑鼠點會把值移掉
  await d.focus('#scene-dialog [role="combobox"]'); await d.press('ArrowDown')
  await waitSel('[cmdk-item]', 'Combobox 清單沒開')
  await page.click('[cmdk-item][data-value="b"]'); await d.settle(); await d.focusStable()
  before = await snap('combo')
  needs(before.tags === 'a,b' && before.listbox, '挑 Beta 後狀態不對(清單應仍開著、值 a,b)', before)
  await d.press('Escape')
  s = await snap('combo')
  check('E-combobox-popup', 'contract', 'Dialog 裡值改過的 Combobox 清單開著按 Esc → 只關清單、值不動、對話框不關',
    s.dialog && !s.listbox && s.tags === 'a,b' && s.active !== 'BODY', s)
  steps = await escapeUntilClosed('combo')
  check('E-combobox', 'contract', '接上題:清單關著按 Esc → 值回復成 a、對話框不關 → 下一下關;焦點從不落 body',
    steps.length === 2 && steps[0].dialog && steps[0].tags === 'a' && !steps[1].dialog && neverBody(steps), steps)

  // ── B-popup(四個控件)──
  const parts = {}
  // 用鍵盤開彈出層(harness 沒有版面 CSS,觸發區正中央可能是隱藏的表單鏡像輸入框);
  // DatePicker / TimePicker 的觸發區用滑鼠開:修前 `{...props}` 排在觸發區自己的 onKeyDown 後面,consumer 的鍵盤 handler 把 Enter / ↓ 開面板蓋掉,
  // 鍵盤在基準樹上開不了 → 對照組會變成儀器失效而不是紅(先聚焦再按,blur 一樣會發生,量的性質不變)
  const popupPart = async (label, selector, popupSel, openKey = 'ArrowDown', sceneName = 'popup') => {
    await scene(sceneName)
    await d.focus(selector)
    if (openKey === 'click') await d.click(selector); else await d.press(openKey)
    await waitSel(popupSel, `${label} 的彈出層沒開`)
    const open = await snap('err')
    await d.press('Escape')
    const closed = await snap('err')
    await d.press('Tab')
    const left = await snap('err')
    parts[label] = { whileOpen: open.errors, afterEsc: closed.errors, afterTab: left.errors }
    return open.errors.length === 0 && closed.errors.length === 0 && left.errors.length === 1
  }
  const okSelect = await popupPart('select', 'form [role="combobox"][aria-label="負責人"]', '[cmdk-root]')
  const okCombo = await popupPart('combobox', 'form [role="combobox"][aria-label="標籤"]', '[cmdk-item]')
  const okDate = await popupPart('datepicker', 'form [role="combobox"][aria-label="截止日"]', '[role="dialog"][aria-label="日期選擇"]', 'click')
  const okTime = await popupPart('timepicker', 'form [role="combobox"][aria-label="時間"]', '[role="dialog"][aria-label="選擇時間"]', 'click')
  // PeoplePicker(2026-11-26 C25):單選經 Select、多選經 Combobox,同一條複合欄位判準;各在自己的表單場景裡量
  const okPeopleSingle = await popupPart('people-single', 'form [role="combobox"][aria-label="專案負責人"]', '[cmdk-root]', 'ArrowDown', 'people')
  const okPeopleMulti = await popupPart('people-multi', 'form [role="combobox"][aria-label="關注者"]', '[cmdk-item]', 'ArrowDown', 'people')
  check('B-popup', 'contract', '必填的 Select / Combobox / DatePicker / TimePicker / PeoplePicker(單選、多選)經 getInputProps 接線:打開彈出層時沒有錯誤(焦點搬進彈出層不算離開)、Esc 關掉後也沒有、Tab 離開欄位才有',
    okSelect && okCombo && okDate && okTime && okPeopleSingle && okPeopleMulti, parts)

  // ── C-combobox-focus(填好 Select 再送出,第一個錯誤 = Combobox)──
  await scene('popup')
  await d.focus('form [role="combobox"][aria-label="負責人"]'); await d.press('ArrowDown')
  await waitSel('[cmdk-item]', 'Select 清單沒開')
  await page.click('[cmdk-item][data-value="alice"]'); await d.settle(); await d.focusStable()
  await d.click('[data-submit]')
  s = await snap('err')
  check('C-combobox-focus', 'contract', '必填表單填好 Select 後送出(Combobox / DatePicker / TimePicker 空著)→ 三欄報錯,焦點落在 DOM 第一個錯誤 = Combobox 的觸發區(name="tags"、role=combobox;修前觸發區沒有 name,焦點落不到)',
    s.errors.includes('tags') && !s.errors.includes('owner') && s.activeName === 'tags' && s.activeRole === 'combobox', s)

  // ── C-people-focus(PeoplePicker 兩個都空著送出;單選在前 / 多選在前各一趟)──
  await scene('people')
  await d.click('[data-submit]')
  const peopleSingleFirst = await snap('err')
  await scene('peopleMultiFirst')
  await d.click('[data-submit]')
  const peopleMultiFirst = await snap('err')
  // 單選經桌機 Select:name 在觸發欄位裡的表單鏡像輸入框上,焦點落在它、觸發欄位以 focus-within 顯示焦點框
  //(select.tsx「Hidden input form mirror」、select.spec.md「原生表單參與」;同 Select 本身),所以只看 name、不看 role
  check('C-people-focus', 'contract', '必填的 PeoplePicker(單選、多選)經 getInputProps 接線、兩個都空著送出 → 兩欄報錯,焦點落在 DOM 第一個錯誤:單選在前 = 單選經 Select 掛 name 的那個元素(name="lead",桌機 Select 的表單鏡像輸入框,在觸發欄位裡)、多選在前 = 多選的觸發區(name="watchers"、role=combobox,經 Combobox 掛上)(C25:之前型別上沒有 name)',
    [peopleSingleFirst, peopleMultiFirst].every((p) => p.errors.includes('lead') && p.errors.includes('watchers'))
      && peopleSingleFirst.activeName === 'lead'
      && peopleMultiFirst.activeName === 'watchers' && peopleMultiFirst.activeRole === 'combobox',
    { singleFirst: peopleSingleFirst, multiFirst: peopleMultiFirst })

  // ── F-menu ──
  await scene('menu')
  await d.click('[data-menu-trigger]')
  await waitSel('[role="menuitem"]', '選單沒開')
  await page.click('[role="menuitem"]:first-child'); await d.settle()
  await waitSel(`${DIALOG}[data-state="open"]`, '選單項沒開對話框')
  await d.press('Escape')
  s = await snap()
  check('F-menu', 'contract', 'DropdownMenu 的項目開了受控 Dialog(沒有 DialogTrigger)→ Esc 關閉後焦點回選單的觸發鈕「更多動作」(修前 body)',
    !s.dialog && s.active === 'BUTTON:更多動作', s)

  // ── F-menu-fileviewer ──(2026-10-20 OV-01:FileViewer 直接用 Radix Dialog、不經 DialogContent —— 預設那支 hook 要它自己消費)
  await scene('menuFileViewer')
  await d.click('[data-menu-trigger]')
  await waitSel('[role="menuitem"]', '選單沒開')
  await page.click('[role="menuitem"]:first-child'); await d.settle()
  await waitSel(`${DIALOG}[data-state="open"]`, '選單項沒開檔案檢視器')
  await d.press('Escape')
  s = await snap()
  check('F-menu-fileviewer', 'contract', 'DropdownMenu 的項目開了受控 FileViewer(沒有觸發點、不經 DialogContent)→ Esc 關閉後焦點回選單的觸發鈕「附件動作」(修前 body)',
    !s.dialog && s.active === 'BUTTON:附件動作', s)

  // ── F-remove ──
  // 焦點在列上、按 × 時按鈕不拿焦點(Safari / macOS 點按鈕的行為;Chromium 的真滑鼠會在 mousedown 把焦點給那顆 ×,量不到「基準是誰」)
  // → 用元素自己的 click() 派發,焦點留在列上
  await scene('remove')
  await d.focus('[data-file-upload-list] [role="row"]')
  await page.$eval('[data-collection-remove]', (button) => button.click()); await d.settle(); await d.focusStable()
  s = await snap('remove')
  check('F-remove', 'contract', 'FileUpload 焦點在列上、點第一項的 ×(按鈕不拿焦點,同 Safari)→ 剩 2 項,焦點接到下一顆 ×(「移除 mockup.png」),不是上傳鈕',
    s.removes === 2 && s.onRemove && s.label === '移除 mockup.png', s)

  // ── C-composer-mouse / C-composer-keyboard ──
  await scene('composer')
  await d.click('textarea'); await d.type('hi')
  await page.click('button[aria-label="移除 brief.pdf"]'); await d.settle(); await d.focusStable()
  s = await snap('comp')
  check('C-composer-mouse', 'contract', 'AgentPanel 輸入盒 textarea 握著焦點時用滑鼠按附件 × → 附件移除、焦點與打到一半的字都留在 textarea(修前 body)',
    s.tags === 1 && s.value === 'hi' && s.active.startsWith('TEXTAREA'), s)
  await scene('composer')
  await d.focus('button[aria-label="移除 brief.pdf"]')
  await d.press('Enter')
  s = await snap('comp')
  check('C-composer-keyboard', 'contract', '焦點在第一顆附件 × 上按 Enter → 移除後焦點接到下一顆 ×(「移除 logo.svg」),不掉到 body',
    s.tags === 1 && s.active === 'BUTTON:移除 logo.svg', s)

  // ── F-date-return(可打字的 DatePicker 用鍵盤開日曆,Esc 收起後焦點回輸入框)──
  await scene('date'); await openDialog()
  await d.focus('#scene-dialog input[role=combobox]')
  await d.press('ArrowDown')
  await waitSel('[role=dialog][aria-label="日期選擇"]', '↓ 沒開日曆')
  steps = await escapeUntilClosed('date', 4, 'calendar')
  check('F-date-return', 'contract', 'Dialog 裡可打字的 DatePicker 用 ↓ 開日曆(焦點進日曆)→ 連按 Esc 收起日曆(格內按鈕的 Tooltip 若開著算一層)→ 焦點回輸入框、對話框不關;焦點從不落 body(修前收起後掉到 body)',
    closedAt(steps, 'calendar') >= 1 && steps[closedAt(steps, 'calendar') - 1].dialog && steps[closedAt(steps, 'calendar') - 1].active.startsWith('INPUT') && neverBody(steps), steps)

  // ── F-pagination(按到底的那顆箭頭握著焦點時變停用 → 焦點留在原鈕)──
  await scene('pagination')
  await d.focus('button[aria-label="下一頁"]')
  await d.press('Enter')
  s = await snap('page')
  check('F-pagination', 'contract', '分頁在第 2 / 3 頁、鍵盤在「下一頁」按 Enter → 到第 3 頁,焦點仍在「下一頁」(aria-disabled、原生 disabled=false;修前掉到 body)',
    s.current === '3' && s.active === 'BUTTON:下一頁' && s.nextAriaDisabled && s.nextNativeDisabled === false, s)

  // ── E-datatable-hidden-col(格游標所在的欄被隱藏 → 游標不懸空、Esc 不被困住)──
  await scene('tableHide'); await openDialog()
  await d.click('#scene-dialog [data-cell-id="r1:qty"]')
  before = await snap('table')
  needs(before.cursor, '點「數量」格沒有格游標', before)
  // 用鍵盤按「隱藏數量欄」:指標按在表格外會先觸發表格的「點別處清游標」(那條路本來就不懸空);鍵盤 / 程式改欄位顯示(欄位選單的鍵盤路、
  // consumer 自己的 columnVisibility)沒有那一下 pointerdown,游標才會懸空 —— 量的是這條
  await d.focus('#scene-dialog [data-hide-qty]'); await d.press('Enter')
  needs(!(await page.$('#scene-dialog [data-cell-id="r1:qty"]')), '按了「隱藏數量欄」數量欄還在', null)
  await d.focus('#scene-dialog [role="grid"]')
  await d.press('ArrowDown')
  const reseeded = await snap('table')
  steps = await escapeUntilClosed('table')
  check('E-datatable-hidden-col', 'contract', 'Dialog 裡試算表 DataTable:點「數量」格 → 隱藏「數量」欄 → ↓ 重新放上游標(游標不懸空)→ 第一下 Esc 清游標、對話框不關 → 第二下關;焦點從不落 body(修前游標懸空:方向鍵沒反應、Esc 五下都關不掉)',
    reseeded.cursor && steps.length === 2 && steps[0].dialog && !steps[0].cursor && !steps[1].dialog && neverBody(steps), { reseeded, steps })

  // ── E-unchained(consumer 蓋掉 getInputProps 的 onKeyDown 沒轉呼叫 → 沒有回復,但第一下 Esc 照常關)──
  await scene('unchained'); await openDialog()
  await d.click('#scene-dialog input[name="title"]'); await page.keyboard.press('End'); await d.type('(急)')
  const typedTitle = await snap('unchained')
  needs(typedTitle.values?.startsWith('修正登入逾時(急)'), '標題沒打進去', typedTitle)
  const titleSteps = await escapeUntilClosed('unchained')
  await openDialog()
  await d.focus('#scene-dialog input[role=combobox]'); await d.clearFocused(); await d.type('2026/04/01'); await d.press('Enter')
  const typedDue = await snap('unchained')
  needs(typedDue.values?.endsWith('|2026-04-01') && !typedDue.calendar, '截止日沒有改成 2026-04-01(或日曆還開著)', typedDue)
  const dueSteps = await escapeUntilClosed('unchained')
  check('E-unchained', 'contract', 'Dialog 裡 consumer 展開 getInputProps 後自己蓋掉 onKeyDown、沒轉呼叫(輸入框、可打字 DatePicker 各一),欄位改過 → 第一下 Esc 就關對話框(沒有回復,但不困住;修前的 Esc 層實作五下都關不掉)',
    // 只量「不困住」;關閉後焦點回哪裡是 F-menu / form-validation-contract R-return 的事(基準樹的受控對話框關閉後焦點掉到 body,不讓這一列跟著紅)
    closedAt(titleSteps) === 1 && closedAt(dueSteps) === 1, { titleSteps, dueSteps })

  // ── 以下兩列要量長相:注入同一棵樹編出的 DS 樣式(compileDsCss),量完拿掉,不影響其他列 ──
  const styleTag = await page.addStyleTag({ content: STYLE })
  await d.settle()

  // ── B-overflow(Combobox「+N」浮出清單也是同一個欄位)──
  await scene('overflow')
  await d.focus('form[aria-label="標籤表單"] [role="combobox"]')
  before = await snap('overflow')
  needs(before.plusN, '窄欄位四個 Tag 沒有出現「+N」', before)
  await page.hover('[data-overflow-indicator]', { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('滑不到「+N」') })
  await d.waitFor(() => { const t = document.querySelector('form[aria-label="標籤表單"] [role="combobox"]'); return Array.from(document.querySelectorAll('[data-collection-remove]')).some((b) => !t?.contains(b) && b.getClientRects().length > 0) }, '「+N」浮出清單沒開')
  const cardRemove = await page.evaluateHandle(() => { const t = document.querySelector('form[aria-label="標籤表單"] [role="combobox"]'); return Array.from(document.querySelectorAll('[data-collection-remove]')).find((b) => !t?.contains(b) && b.getClientRects().length > 0) })
  const box = await cardRemove.asElement()?.boundingBox()
  needs(box, '「+N」卡裡的 × 量不到位置', null)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await d.settle(); await d.focusStable()
  const afterCard = await snap('overflow')
  // 焦點移到欄位外的按鈕 = 真的離開(卡還開著時它可能蓋在按鈕上,不用滑鼠點;離開的判準只看焦點去了哪)
  await d.focus('[data-after]')
  const afterLeave = await snap('overflow')
  check('B-overflow', 'contract', '必填 Combobox(非搜尋型,窄欄位四個 Tag)焦點在觸發區,用滑鼠按「+N」浮出清單裡的 × → 那一項移除、consumer 的 onBlur 不跑(焦點搬進卡不算離開);焦點移到欄位外的按鈕 → 跑一次',
    afterCard.tags?.split(',').length === 3 && afterCard.blur === 0 && afterLeave.blur === 1, { before, afterCard, afterLeave })

  // ── B-leave / N-esc-tab(2026-10-21 r1b fields F1 / N1;用到版面與收起動畫,放在注入樣式之後)──
  // 彈出層開著時離開欄位(點空白處 / 直接點下一格 / 不可搜尋與可搜尋的 Select 按 Tab),必填驗證跑一次;Esc 收起後馬上按 Tab 走到下一格
  const LF = 'form[aria-label="離開表單"] [role="combobox"]'
  const LEAVE = [
    { key: 'bank', sel: `${LF}[aria-label="收款銀行"]`, popup: '[cmdk-root]', kbd: 'ArrowDown', next: 'DIV:分行' },
    { key: 'branch', sel: `${LF}[aria-label="分行"]`, popup: '[cmdk-item]', kbd: 'ArrowDown', next: 'DIV:標籤' },
    { key: 'tags', sel: `${LF}[aria-label="標籤"]`, popup: '[cmdk-item]', kbd: 'ArrowDown', next: 'DIV:截止日' },
    { key: 'due', sel: `${LF}[aria-label="截止日"]`, popup: '[role="dialog"][aria-label="日期選擇"]', kbd: 'Enter', next: 'DIV:時間' },
    { key: 'at', sel: `${LF}[aria-label="時間"]`, popup: '[role="dialog"][aria-label="選擇時間"]', kbd: 'Enter', next: 'INPUT:備註' },
  ]
  const leaveRun = async (c, how) => {
    await scene('leave')
    if (how === 'kbd') { await d.focus(c.sel); await d.press(c.kbd) } else await d.click(c.sel)
    await waitSel(c.popup, `${c.key} 的彈出層沒開`)
    // 打開那一刻就驗證了 = 焦點搬進彈出層被當成離開(N83 / B-popup 那一條);這幾列連帶紅,不當成儀器失效
    const open = await snap('leave')
    return open.errors.length === 0 && !open.blur[c.key]
  }
  const leaveOk = (s, key) => s.openClean && s.errors.includes(key) && s.blur[key] === 1
  const blank = {}
  for (const c of LEAVE) {
    const openClean = await leaveRun(c, 'click')
    const b = await page.locator('[data-leave-blank]').boundingBox()
    needs(b, '量不到空白處', null)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await d.settle(); await d.focusStable()
    blank[c.key] = { ...(await snap('leave')), openClean }
  }
  check('B-leave-blank', 'contract', '必填的 Select / 可搜尋的 Select / Combobox / DatePicker / TimePicker 經 getInputProps 接線:彈出層開著時點空白處 → 那一欄的驗證跑一次、錯誤出現(修前五種都不跑,要等送出)',
    LEAVE.every((c) => leaveOk(blank[c.key], c.key)), blank)
  const nextField = {}
  for (const c of LEAVE) {
    const openClean = await leaveRun(c, 'click')
    await d.click('[data-leave-next]')
    nextField[c.key] = { ...(await snap('leave')), openClean }
  }
  check('B-leave-next', 'contract', '同上五種:彈出層開著時直接點下一格(一般輸入框)→ 焦點在那一格、那一欄的驗證跑一次、錯誤出現(最常見的走法;修前五種都不跑)',
    LEAVE.every((c) => leaveOk(nextField[c.key], c.key) && nextField[c.key].active === 'INPUT:備註'), nextField)
  const tabbed = {}
  for (const c of LEAVE.slice(0, 2)) {
    const openClean = await leaveRun(c, 'kbd')
    await d.press('Tab')
    tabbed[c.key] = { ...(await snap('leave')), openClean }
  }
  check('B-leave-tab', 'contract', '不可搜尋與可搜尋的 Select 清單開著按 Tab → 選定反白那一項、焦點走到下一格、那一欄的驗證跑一次(修前不跑;Combobox / DatePicker / TimePicker 開著按 Tab 照規格在面板裡繞圈,不算離開)',
    LEAVE.slice(0, 2).every((c) => tabbed[c.key].openClean && tabbed[c.key].blur[c.key] === 1 && tabbed[c.key].active === c.next), tabbed)
  const escTab = {}
  // 量這一列時把收起動畫放慢到 1200ms(同 select-tab-leave 的注入):Esc → 確認收起已開始 → Tab 三步都經 CDP 來回,
  // 產品的 150ms 空窗在慢的 runner 上會被整段跨過 —— 2026-10-21 selftest 四條 lane 並行時實測 Tab 晚到 8ms、或連「收起已開始」都沒看到
  // 就已卸載,兩次都成了儀器失效(M32 第四題:機器慢的時候還會綠嗎)。放慢不改變被量的事:修前焦點要等內容卸載才還(Tab 落在
  // 空窗裡照樣被吃掉),修後在收起開始那一刻就還,與動畫多長無關。
  const EXIT_SLOW_CSS = '[data-radix-popper-content-wrapper] [data-state="closed"] { animation-duration: 1200ms !important; transition-duration: 1200ms !important }'
  const escTabRun = async (key, open, contentSel, next) => {
    await scene('leave')
    await open()
    const slow = await page.addStyleTag({ content: EXIT_SLOW_CSS })
    try {
      await page.evaluate(() => window.__exitWatch())
      await page.keyboard.press('Escape')
      // 收起動畫已經開始、內容還在(Radix 等內容卸載才還焦點的那段空窗)才按 Tab
      await page.waitForFunction((sel) => !!document.querySelector(`${sel}[data-state="closed"]`), contentSel, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError(`${key}:Esc 之後等不到收起動畫開始(${contentSel})`) })
      await page.keyboard.press('Tab')
      // 等內容真的卸載(修前的焦點歸還發生在這一刻)再讀焦點,不靠「版面靜止」剛好等得夠久
      await page.waitForFunction(() => window.__exitEndAt != null, null, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError(`${key}:收起動畫播不完(浮層內容一直沒卸載)`) })
      await d.settle(); await d.focusStable()
      const t = await page.evaluate(() => ({ tabAt: window.__tabAt, exitEndAt: window.__exitEndAt }))
      needs(t.tabAt != null && t.exitEndAt != null && t.tabAt < t.exitEndAt, `${key}:Tab 沒落在收起動畫期間(量不到那段空窗)`, t)
      escTab[key] = { ...(await snap('leave')), next }
    } finally {
      await slow.evaluate((n) => n.remove()).catch(() => {})
    }
  }
  for (const c of LEAVE) {
    const content = c.popup.startsWith('[role="dialog"]') ? c.popup : '[data-radix-popper-content-wrapper] [role="dialog"]'
    await escTabRun(c.key, async () => { await d.focus(c.sel); await d.press(c.kbd); await waitSel(c.popup, `${c.key} 的彈出層沒開`) }, content, c.next)
  }
  await escTabRun('popover', async () => { await d.focus('[data-leave-pop]'); await d.press('Enter'); await waitSel('[aria-label="篩選面板"]', 'Popover 沒開') }, '[aria-label="篩選面板"]', 'BUTTON:之後')
  check('N-esc-tab', 'contract', 'Esc 收起後、收起動畫還在播時按 Tab(五種欄位 + 一般 Popover)→ 焦點走到觸發點的下一格(不停在原處、不掉到 body);欄位的驗證跑一次(修前 Tab 被吃掉:焦點停在原欄位,可搜尋 Select 掉到 body;T11 讓收起動畫真的會播之後才有)',
    LEAVE.every((c) => escTab[c.key].active === c.next && escTab[c.key].blur[c.key] === 1) && escTab.popover.active === 'BUTTON:之後', escTab)
  // N-esc-tab-modal(2026-10-27,待辦總帳 R1b-FN1b):Dialog / Sheet 的收起動畫 250ms,同上放慢到 1200ms(理由同上 —— 被量的事與動畫多長無關)
  const MODAL_EXIT = [
    { key: 'dialog', next: 'BUTTON:之後一', close: async () => { await page.keyboard.press('Escape') } },
    { key: 'sheet', next: 'BUTTON:之後二', close: async () => { await page.keyboard.press('Escape') } },
    // 非同步關閉:鍵盤按「儲存」,50ms 後 setOpen(false) —— 不是離散事件裡的更新(存檔成功後關閉的常見寫法)
    { key: 'save', next: 'BUTTON:之後三', close: async () => { await d.focus('[data-exit-save]'); await page.keyboard.press('Enter') } },
    // FileViewer(2026-11-04,DA-esc-tab):受控 open、沒有觸發點 —— 開啟者是一般按鈕,Esc 收起後同樣要在收起那一刻還
    { key: 'fileviewer', next: 'BUTTON:之後四', close: async () => { await page.keyboard.press('Escape') } },
  ]
  const modalExit = {}
  for (const c of MODAL_EXIT) {
    const probe = `[data-exit-probe="${c.key}"]`
    await scene('modalExit')
    await d.focus(`[data-exit-trigger="${c.key}"]`); await d.press('Enter')
    await waitSel(`${probe}[data-state="open"]`, `${c.key} 沒開`)
    const slow = await page.addStyleTag({ content: `${probe}[data-state="closed"] { animation-duration: 1200ms !important; transition-duration: 1200ms !important }` })
    try {
      await page.evaluate((sel) => window.__exitWatchFor(sel), probe)
      await c.close()
      await page.waitForFunction((sel) => !!document.querySelector(`${sel}[data-state="closed"]`), probe, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError(`${c.key}:關閉之後等不到收起動畫開始`) })
      // 收起動畫期間(內容還在)量:觸發鈕的祖先鏈有沒有 aria-hidden、內容 inert 了沒
      const during = await page.evaluate(({ sel, trig }) => ({ hidden: window.__hiddenPath(trig), inert: document.querySelector(sel)?.inert ?? null, present: !!document.querySelector(sel) }), { sel: probe, trig: `[data-exit-trigger="${c.key}"]` })
      await page.keyboard.press('Tab')
      await page.waitForFunction(() => window.__exitEndAt != null, null, { timeout: WAIT_CAP_MS })
        .catch(() => { throw new InstrumentError(`${c.key}:收起動畫播不完(內容一直沒卸載)`) })
      await d.settle(); await d.focusStable()
      const t = await page.evaluate(() => ({ tabAt: window.__tabAt, exitEndAt: window.__exitEndAt }))
      needs(during.present && t.tabAt != null && t.exitEndAt != null && t.tabAt < t.exitEndAt, `${c.key}:Tab 沒落在收起動畫期間(量不到那段空窗)`, { during, ...t })
      modalExit[c.key] = { ...(await snap()), during, next: c.next }
    } finally {
      await slow.evaluate((n) => n.remove()).catch(() => {})
    }
  }
  check('N-esc-tab-modal', 'contract', 'Dialog / Sheet 由觸發鈕開、FileViewer 由一般按鈕受控開:Esc 收起後、收起動畫還在播時按 Tab → 焦點走到觸發鈕的下一格;同一段空窗裡觸發鈕的祖先鏈沒有 aria-hidden、淡出中的內容 inert;對話框裡的「儲存」非同步關閉也一樣(修前 Tab 被吃掉:焦點等內容卸載才回觸發鈕,期間觸發鈕在 aria-hidden 底下)',
    MODAL_EXIT.every((c) => modalExit[c.key].active === c.next && modalExit[c.key].during.hidden.length === 0 && modalExit[c.key].during.inert === true), modalExit)
  // 對照:彈出層關著時 Tab 離開 —— 量具看得到 blur 與錯誤(全部突變都必須綠)
  await scene('leave')
  await d.focus(LEAVE[0].sel); await d.press('Tab')
  const closedLeave = await snap('leave')
  check('CTRL-leave', 'control', '彈出層關著時 Tab 離開必填 Select → 驗證跑一次、錯誤出現(量具看得到 blur 與錯誤)', closedLeave.errors.includes('bank') && closedLeave.blur.bank === 1 && closedLeave.active === 'DIV:分行', closedLeave)

  // ── F-look(可聚焦的停用與原生停用逐項同色:靜止 / 滑過 / 按住 × 淺深兩色)──
  await scene('look')
  const lookOf = (selector) => page.$eval(selector, (el) => {
    const c = getComputedStyle(el)
    return { bg: c.backgroundColor, color: c.color, border: [c.borderTopColor, c.borderRightColor, c.borderBottomColor, c.borderLeftColor].join(' '), opacity: c.opacity, cursor: c.cursor }
  })
  const away = async () => { await page.mouse.move(VIEWPORT.width - 4, VIEWPORT.height - 4); await d.settle() }
  const centerOf = async (selector) => {
    const b = await page.locator(selector).boundingBox()
    if (!b) throw new InstrumentError(`量不到 ${selector} 的位置`)
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  const lookStates = async (selector) => {
    await away(); const rest = await lookOf(selector)
    const c = await centerOf(selector)
    await page.mouse.move(c.x, c.y); await d.settle(); const hover = await lookOf(selector)
    await page.mouse.down(); await d.settle(); const press = await lookOf(selector); await page.mouse.up(); await d.settle()
    return { rest, hover, press }
  }
  const lookDiffs = []
  const lookFacts = []
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    await d.settle()
    for (const row of ['primary', 'secondary', 'tertiary', 'text', 'link', 'primary+danger', 'secondary+danger', 'text+danger']) {
      const native = await lookStates(`[data-look="${row}"] [data-native]`)
      const focusable = await lookStates(`[data-look="${row}"] [data-focusable]`)
      lookFacts.push(await page.$eval(`[data-look="${row}"] [data-focusable]`, (el) => el.hasAttribute('data-disabled-focusable') && el.disabled === false))
      for (const state of ['rest', 'hover', 'press']) {
        for (const key of Object.keys(native[state])) {
          if (native[state][key] !== focusable[state][key]) lookDiffs.push(`${theme} ${row} ${state} ${key}:原生 ${native[state][key]} / 可聚焦 ${focusable[state][key]}`)
        }
      }
    }
  }
  // 「按了之後自己變停用」的送出鈕(淺色):用滑鼠按下去 → 握著焦點時被停用 → 指標仍在它上面(滑過)
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
  await scene('look')
  const heldCenter = await centerOf('[data-look="held"] [data-focusable]')
  await page.mouse.click(heldCenter.x, heldCenter.y); await d.settle(); await d.focusStable()
  const heldHover = await lookOf('[data-look="held"] [data-focusable]')
  const heldFacts = await page.$eval('[data-look="held"] [data-focusable]', (el) => ({ focusable: el.hasAttribute('data-disabled-focusable') && el.disabled === false, focused: document.activeElement === el }))
  const nativeCenter = await centerOf('[data-look="held"] [data-native]')
  await page.mouse.move(nativeCenter.x, nativeCenter.y); await d.settle()
  const nativeHover = await lookOf('[data-look="held"] [data-native]')
  for (const key of Object.keys(nativeHover)) if (nativeHover[key] !== heldHover[key]) lookDiffs.push(`light held hover ${key}:原生 ${nativeHover[key]} / 可聚焦 ${heldHover[key]}`)
  await away()
  await page.evaluate(() => { delete document.documentElement.dataset.theme })

  // ── F-shell-ring(浮層裡沒有可聚焦控件 → 開啟落點是殼 → 殼不畫焦點框;focus-canonical.md「E. 浮層程式落點」)──
  // 量具前提(needs):焦點真的在殼上、殼是 :focus-visible —— 不成立就量不到框,是儀器失效不是通過。
  // 對照組:突變 dialog-shell-ring / sheet-shell-ring 各把殼的 outline-none 拿掉,這一列必紅(Popover 那一格是同族、修前就綠)。
  const shellRows = []
  for (const [kind, sel] of [['dialog', DIALOG], ['sheet', DIALOG], ['popover', '#scene-popover']]) {
    await scene(`shell${kind[0].toUpperCase()}${kind.slice(1)}`)
    await d.focus('[data-open]')
    await d.press('Enter')
    await waitSel(`${sel}[data-state="open"]`, `${kind} 沒開`)
    const got = await page.evaluate((s) => {
      const shell = document.querySelector(s)
      const a = document.activeElement
      const c = a ? getComputedStyle(a) : null
      return { kind: s, onShell: !!shell && a === shell, focusVisible: !!a?.matches(':focus-visible'), outlineStyle: c?.outlineStyle ?? null, outlineWidth: c?.outlineWidth ?? null }
    }, sel)
    needs(got.onShell && got.focusVisible, `${kind}:開啟落點不是殼、或殼不是 :focus-visible(量不到框)`, got)
    shellRows.push({ ...got, kind })
    await closeOverlay()
  }

  // ── F-inline-disabled(行內動作鈕自身停用:游標 not-allowed、字色 = fg-disabled、滑過 / 按住字色與底色釘在靜止;真滑鼠)──
  await scene('inlineDisabled')
  const inlineLook = (selector) => page.$eval(selector, (el) => {
    const c = getComputedStyle(el)
    const bgEl = el.querySelector(':scope > span[aria-hidden]')
    return { color: c.color, cursor: c.cursor, bg: bgEl ? getComputedStyle(bgEl).backgroundColor : null }
  })
  const inlineStates = async (selector) => {
    await away(); const rest = await inlineLook(selector)
    const c = await centerOf(selector)
    await page.mouse.move(c.x, c.y); await d.settle(); const hover = await inlineLook(selector)
    await page.mouse.down(); await d.settle(); const press = await inlineLook(selector); await page.mouse.up(); await d.settle()
    await away()
    return { rest, hover, press }
  }
  const disabledColor = await page.$eval('[data-probe-disabled]', (el) => getComputedStyle(el).color)
  const inlineOff = await inlineStates('[data-inline="disabled"]')
  const inlineOn = await inlineStates('[data-inline="enabled"]')
  needs(inlineOn.rest.bg !== null && inlineOff.rest.bg !== null, '行內動作鈕沒有懸停底色那一層(量不到底色)', { inlineOn, inlineOff })
  check('CTRL-inline-hover', 'control', '對照:可用的行內動作鈕滑過 → 底色與字色都變(量具看得到滑過回饋)',
    inlineOn.hover.bg !== inlineOn.rest.bg && inlineOn.hover.color !== inlineOn.rest.color && inlineOn.rest.cursor === 'pointer', inlineOn)
  const pinned = (k) => inlineOff.hover[k] === inlineOff.rest[k] && inlineOff.press[k] === inlineOff.rest[k]
  check('F-inline-disabled', 'contract', '行內動作鈕自身停用(SidebarGroupAction disabled):游標 not-allowed、字色 = text-fg-disabled、滑過 / 按住的字色與底色釘在靜止(修前游標是手指、滑過字色變深、出 neutral-hover 底色)',
    inlineOff.rest.cursor === 'not-allowed' && inlineOff.rest.color === disabledColor && pinned('color') && pinned('bg'), { disabledColor, inlineOff })
  await styleTag.evaluate((el) => el.remove())
  await d.settle()
  check('F-look', 'contract', '可聚焦的停用(忙碌鈕 primary / secondary / tertiary / text / link / 三種 danger;存檔後握著焦點的送出鈕)與原生停用逐項同色 —— 靜止 / 滑過 / 按住 × 淺深兩色,背景 / 字 / 四邊框 / 不透明度 / 游標;忙碌鈕確實是可聚焦的停用(修前滑過變回原本的填色)',
    lookDiffs.length === 0 && lookFacts.every(Boolean) && heldFacts.focusable && heldFacts.focused, { diffs: lookDiffs.slice(0, 12), diffCount: lookDiffs.length, notFocusable: lookFacts.filter((f) => !f).length, heldFacts })

  check('F-shell-ring', 'contract', '浮層裡沒有可聚焦控件(Dialog / Sheet / Popover,只有標題列的 ×),用鍵盤開啟 → 開啟落點是殼、殼是 :focus-visible,殼不畫焦點框(outline-style none;focus-canonical E 類;修前 Dialog / Sheet 畫 2px 框)',
    shellRows.length === 3 && shellRows.every((r) => r.outlineStyle === 'none'), shellRows)

  // ── F-popover-anchor / F-popover-anchor-outside(錨點型 Popover:沒有 PopoverTrigger;popover.spec.md「A11y 預設」關閉返回;產品 canary 回報 H20)──
  // 三格:(1) 鍵盤開 → Esc → 焦點回開啟鈕;(2) 滑鼠開 → 點選項(選完收起)→ 焦點回開啟鈕(字已換成選的值);(3) 滑鼠開 → 點頁面空白處收起 → 焦點不被搶回開啟鈕。
  // 量具前提(needs):浮層真的開了、真的收了 —— 沒開 / 沒收就不是在量還焦點。對照組:突變 popover-anchor-no-return(拿掉預設)→ 前兩格焦點落 body 必紅;
  // popover-anchor-steal-outside(當成 modal)→ 第三格焦點被搶回開啟鈕必紅。
  const anchorOpener = (s) => s.active.startsWith('BUTTON:狀態:')
  await scene('anchorPopover')
  await d.focus('[data-open]')
  await d.press('Enter')
  await waitSel('#scene-popover[data-state="open"]', '錨點型 Popover 沒開(鍵盤)')
  const anchorEsc = await escapeUntilClosed(null, 2, 'popover')
  needs(closedAt(anchorEsc, 'popover') === 1, '錨點型 Popover 第一下 Esc 沒收起(量不到 Esc 之後的還焦點)', anchorEsc)
  await d.click('[data-open]')
  await waitSel('#scene-popover[data-state="open"]', '錨點型 Popover 沒開(滑鼠)')
  await d.click('[data-status-option="已完成"]')
  const anchorPick = await snap()
  needs(!anchorPick.popover, '錨點型 Popover 點選項後沒收起', anchorPick)
  check('F-popover-anchor', 'contract', '錨點型 Popover(PopoverAnchor 定位、普通按鈕開,沒有 PopoverTrigger)收起後焦點回開啟鈕:鍵盤開 → Esc;滑鼠開 → 點選項選完收起(修前 Radix 沒東西可還 → 焦點落 body)',
    anchorOpener(anchorEsc.at(-1)) && anchorOpener(anchorPick) && anchorPick.active.includes('已完成'), { esc: anchorEsc, pick: anchorPick })
  await d.click('[data-open]')
  await waitSel('#scene-popover[data-state="open"]', '錨點型 Popover 沒開(滑鼠,第二次)')
  const outsideAt = await centerOf('[data-outside]')
  await page.mouse.click(outsideAt.x, outsideAt.y)
  await d.settle(); await d.focusStable()
  const anchorOut = await snap()
  needs(!anchorOut.popover, '錨點型 Popover 點頁面空白處後沒收起', anchorOut)
  check('F-popover-anchor-outside', 'contract', '錨點型 Popover 用滑鼠點頁面空白處收起 → 焦點不被搶回開啟鈕(非 modal:使用者把注意力移到別處;returnFocusToOpener 非 modal 規則)',
    !anchorOpener(anchorOut), anchorOut)

  // ── K-cmdb(⌘B 只歸可收合、而且不在 modal 背景的側欄;sidebar.spec.md「持久化與快捷鍵」;產品 canary 回報 C13)──
  // 每一下前在 window 掛一個**最後註冊**的監聽(晚於兩個 SidebarProvider)→ 讀得到它們處理完的 defaultPrevented;cookie 量「寫了沒」(harness 的 document.cookie 換成記錄器)
  await scene('cmdb')
  const cmdbPress = async () => {
    await page.evaluate(() => {
      window.__cookieWrites = []
      window.__cmdbPrevented = null
      window.__cmdbProbe = (e) => { if (e.key === 'b') window.__cmdbPrevented = e.defaultPrevented }
      window.addEventListener('keydown', window.__cmdbProbe)
    })
    await d.press('Control+b')
    return page.evaluate(() => {
      window.removeEventListener('keydown', window.__cmdbProbe)
      return {
        prevented: window.__cmdbPrevented,
        cookie: window.__cookieWrites.filter((w) => w.startsWith('sidebar_state=')),
        page: document.querySelector('[data-cmdb="page"] [data-side]')?.getAttribute('data-state') ?? null,
        active: window.__describe(document.activeElement),
      }
    })
  }
  // 對照:對話框關著、焦點在頁面上 → ⌘B 切頁面側欄、寫 cookie、攔下(證明三個量具都看得到);再按一下展開回來
  await d.focus('[data-open]')
  const ctrlCmdb = await cmdbPress()
  const ctrlBack = await cmdbPress()
  check('CTRL-cmdb', 'control', '對照:對話框關著、焦點在頁面上按 ⌘B → 頁面側欄收起、寫 sidebar_state、攔下(defaultPrevented);再按一下展開(量具看得到切換 / cookie / 攔截)',
    ctrlCmdb.page === 'collapsed' && ctrlCmdb.prevented === true && ctrlCmdb.cookie.length === 1 && ctrlBack.page === 'expanded', { ctrlCmdb, ctrlBack })
  await d.focus('[data-open]')
  await d.press('Enter')
  await waitSel(`${DIALOG}[data-state="open"]`, '工作區設定對話框沒開')
  await d.focus('[data-cmdb="dialog"] [data-sidebar="menu-button"]')
  const inDialog = await cmdbPress()
  check('K-cmdb-modal', 'contract', '「工作區設定」對話框開著、焦點在裡面不可收合的設定導覽上按 ⌘B → 背景頁的側欄不切換、不寫 sidebar_state、沒有人攔下(不可收合的不攔;背景頁的被 modal 藏起來、不接)',
    inDialog.page === 'expanded' && inDialog.prevented === false && inDialog.cookie.length === 0 && inDialog.active !== 'BODY', inDialog)
  const noneCookie = await page.evaluate(() => {
    window.__cookieWrites = []
    window.__dialogSidebar.setOpen(false)
    return window.__cookieWrites.filter((w) => w.startsWith('sidebar_state='))
  })
  check('K-cmdb-none-cookie', 'contract', '不可收合的側欄(collapsible="none")經 useSidebar().setOpen 開關 → 不寫全站共用的 sidebar_state cookie(修前照寫,蓋掉同頁可收合那一份的紀錄)',
    noneCookie.length === 0, { noneCookie })
  await closeOverlay()

  // ── F-rename(AgentPanel 改名對話框走 useFormValidation)──
  const RENAME_BTN = '[data-history-row-actions] button[aria-label="改名"]'
  const openRename = async () => {
    // 上一段量完若改名對話框還開著(修改前 / 突變:取消那一下落空、Esc 沒關掉)—— 那是上一段的量測結果,已經記下;
    // 這裡只是收拾場地(Esc 最多 4 下),收不掉才是儀器失效。不收拾的話 modal 留下的 body pointer-events:none 讓下一段按不到任何東西
    for (let i = 0; i < 4 && (await snap('rename')).renameOpen; i += 1) await d.press('Escape')
    if ((await snap('rename')).renameOpen) throw new InstrumentError('上一段的改名對話框收不掉')
    await scene('rename')
    await waitSel(RENAME_BTN, '歷史浮層沒開 / 找不到「改名」')
    await page.click(RENAME_BTN); await d.settle(); await d.focusStable()
    await page.waitForFunction(() => window.__snap('rename').renameOpen, null, { timeout: WAIT_CAP_MS })
      .catch(() => { throw new InstrumentError('改名對話框沒開') })
    await d.settle(); await d.focusStable()
  }
  // `:text-is` 比對的是「最小的那個含字元素」(按鈕裡的 span),要用 has-text 才選得到按鈕本身;此刻頁面上只有改名對話框有這兩顆字
  const renameFooter = (label) => `[role="dialog"] button:has-text("${label}")`
  // (a) 改過名稱:第一下 Esc 回復、對話框不關;第二下才關;焦點不落 body
  await openRename()
  await page.keyboard.press('End'); await d.type('(急)')
  const typed = await snap('rename')
  steps = await escapeUntilClosed('rename', 4, 'renameOpen')
  const escOk = typed.value === '發布公告草稿(急)' && steps.length === 2 && steps[0].renameOpen && steps[0].value === '發布公告草稿' && !steps[1].renameOpen && neverBody(steps)
  // (b) 清空後直接用滑鼠按「取消」→ 這一下落在取消鈕上、對話框關閉(修前離開時錯誤長出來把 footer 推走,這一下落空)
  await openRename()
  await d.clearFocused()
  await page.click(renameFooter('取消')); await d.settle(); await d.focusStable()
  const cancelled = await snap('rename')
  const cancelOk = !cancelled.renameOpen && cancelled.calls === 0 && cancelled.title === '發布公告草稿'
  // (c)「儲存」何時可按(form-validation.spec.md「Submit Button 狀態」第二列更新 + 第三列需要填的欄位只有一個;2026-11-17 起):
  //     打開沒改 → 停用;清空 → 停用、焦點在欄位裡不報錯;打上新名字 → 可按,按了改名並關閉(兩面:空白停用、有字可按)
  await openRename()
  const pristine = await snap('rename')
  await d.clearFocused()
  const emptied = await snap('rename')
  await d.type('季度回顧')
  const filled = await snap('rename')
  // 按不了(突變:有字也停用)就不按 —— Playwright 會一直等它變可按到逾時;不按 = 對話框還開著、沒改名,這一格照樣紅
  if (filled.saveNativeDisabled === false) { await page.click(renameFooter('儲存')); await d.settle(); await d.focusStable() }
  const saved = await snap('rename')
  const saveOk = pristine.saveNativeDisabled === true && emptied.error === null && emptied.saveNativeDisabled === true
    && filled.saveNativeDisabled === false && !saved.renameOpen && saved.calls === 1 && saved.title === '季度回顧'
  check('F-rename', 'contract', 'AgentPanel 改名對話框:改過名稱第一下 Esc 回復、第二下才關;清空後直接用滑鼠按「取消」→ 關(這一下沒落空);「儲存」打開沒改停用、清空停用(焦點在欄位裡不報錯)、打上新名字可按,按了改名並關閉',
    escOk && cancelOk && saveOk, { typed, steps, cancelled, pristine, emptied, filled, saved })

  return out
}

/** B-overflow / F-look 量長相用的樣式:同一棵樹(SOURCE_ROOT)的 DS 樣式用 tailwindcss 原始碼編出來(突變只動 .tsx 的邏輯,不動 class,所以整趟共用一份) */
const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })
const VIEWPORT = { width: 1100, height: 800 }

async function runVariant(page, label, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'escape-and-focus-contract-harness.tsx', mutate })
  mutate?.assertApplied?.()
  const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene="ctrl"]')
  try {
    const checks = await runChecks(page)
    if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
    return { label, checks }
  } finally {
    dispose()
  }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(20)} ${c.kind === 'control' ? '[對照] ' : ''}${c.title}`)
    if (!c.pass) console.log(`      實得:${JSON.stringify(c.detail)}`)
  }
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()
/** 判定紅的那一行 —— 判定模式與 selftest 基準共用(CI 只跑 --selftest,基準紅就是產品裁決,不能只印「量具不可信」) */
const verdictRedLine = (red) => `\n✗ escape-and-focus 契約:${red.length} 條不符(${red.join(' / ')})—— SSOT keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」「按了之後自己變停用」「關了之後焦點去哪」`

let browser
const laneBrowsers = []
try {
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage()
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(page, `原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(verdictRedLine(red))
      process.exitCode = 1
    } else {
      console.log(`\n✓ escape-and-focus 契約:${result.checks.length} 條全綠(含 ${result.checks.filter((c) => c.kind === 'control').length} 條對照)`)
    }
  } else {
    const problems = []
    // 基準只在不分片或第 0 片跑(見 SHARD 的說明);其他片 contractIds = null,靜態覆蓋也由第 0 片驗
    let contractIds = null
    if (!SHARD || SHARD.k === 0) {
      const baseline = await runVariant(page, '現行原始碼(selftest 基準,必須全綠)', null)
      report(baseline)
      const baseRed = redIds(baseline.checks)
      if (baseRed.length) {
        console.log(verdictRedLine(baseRed))
        problems.push(`現行原始碼本身就紅(${baseRed.join(' / ')}),突變的紅燈無法歸因`)
      }
      contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    } else console.log(`\n· 分片 ${SHARD.k}/${SHARD.n}:基準(一趟完整判定)與靜態覆蓋只在第 0 片跑;這一片每個突變那一趟仍量全部列,紅的列必須剛好等於 expectRed`)
    const covered = new Set()
    // 突變彼此獨立:分 LANES 條 lane 並行跑(第一條 lane 沿用上面那個分頁),結果依 MUTANTS 的順序回報
    const RUN = (ONLY ? MUTANTS.filter((m) => ONLY.includes(m.id)) : MUTANTS)
      .filter((m) => !SHARD || MUTANTS.indexOf(m) % SHARD.n === SHARD.k)
    if (!RUN.length) throw new InstrumentError(`這一片沒有任何突變可跑(--shard=${SHARD ? `${SHARD.k}/${SHARD.n}` : '—'}${ONLY ? ` --only=${ONLY.join(',')}` : ''})—— 不得讀成通過`)
    if (ONLY && RUN.length !== ONLY.length) throw new InstrumentError(`--only 指名的突變不存在:${ONLY.filter((id) => !MUTANTS.some((m) => m.id === id)).join(', ')}`)
    const results = new Array(RUN.length)
    const lanePages = [page]
    for (let i = 1; i < Math.min(LANES, RUN.length); i += 1) {
      const b = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
      laneBrowsers.push(b)
      lanePages.push(await (await b.newContext({ viewport: VIEWPORT })).newPage())
    }
    let next = 0
    let laneFailure = null
    const settled = await Promise.allSettled(lanePages.map(async (lanePage) => {
      // 任一條 lane 儀器失效就不再領新的突變(整趟本來就不能算通過),其他 lane 把手上那一個跑完再收
      for (let i = next++; i < RUN.length && !laneFailure; i = next++) {
        const m = RUN[i]
        try {
          results[i] = await runVariant(lanePage, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
        } catch (error) {
          // 儀器失效要說出是哪一個突變那一趟(lane 並行,結尾只印第一個失效;沒有 id 就無從判斷是突變弄壞了場景還是機器慢)
          if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
          laneFailure ??= error
          throw error
        }
      }
    }))
    const rejected = settled.find((r) => r.status === 'rejected')
    if (rejected) throw rejected.reason
    for (const [i, m] of RUN.entries()) {
      const result = results[i]
      report(result)
      const red = redIds(result.checks)
      const want = [...m.expectRed].sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) problems.push(`${m.id}:紅的是 [${red.join(', ')}],應剛好是 [${want.join(', ')}]`)
      for (const id of red) covered.add(id)
    }
    // 靜態覆蓋:每一條契約列都要有突變宣告會讓它紅(分片時各片只看得到自己那幾個突變,動態覆蓋要所有片合起來才完整)
    if (contractIds) {
      const claimed = new Set(MUTANTS.flatMap((m) => m.expectRed))
      const unclaimed = contractIds.filter((id) => !claimed.has(id))
      if (unclaimed.length) problems.push(`契約列 ${unclaimed.join(' / ')} 不在任何突變的 expectRed —— 它的綠燈是零證據`)
    }
    if (ONLY) problems.push(`只跑了 --only 指名的 ${RUN.length} 個突變(除錯用):這一趟不算 selftest 通過`)
    else if (!SHARD) {
      const uncovered = contractIds.filter((id) => !covered.has(id))
      if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    }
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(SHARD
        ? `\n✓ selftest 第 ${SHARD.k + 1} / ${SHARD.n} 片:${RUN.length} 個根因突變各自剛好紅了該紅的列,對照列全程綠(${contractIds ? `全部 ${MUTANTS.length} 個突變的 expectRed 涵蓋契約 ${contractIds.length} 條` : '基準與契約覆蓋在第 0 片驗'};其餘片在 CI 同一個 matrix 的另一格跑)`
        : `\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 條全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  for (const b of laneBrowsers) await b.close().catch(() => {})
  await browser?.close()
}
