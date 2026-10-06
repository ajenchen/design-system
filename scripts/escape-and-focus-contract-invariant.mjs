#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「這一下 Esc 由誰處理」與「焦點不掉到 body」兩條跨元件規則(ds-canonical/references/keyboard-model-canonical.md
 *        「焦點所在的控件自己那一層也算一層」「按了之後自己變停用:焦點留在原處」「關了之後焦點去哪」)在**每一個宣告了自己有一層的 DS 控件**上
 *        都真的成立 —— 把它放進 DS Dialog / Popover 裡用真鍵盤走:控件還有東西可撤銷時第一下 Esc 由控件撤銷、浮層不關,控件乾淨後下一下才關;
 *        整段過程焦點從不落在 body;控件自己的彈出層開著時那一下只關彈出層、不回復;拖曳中只取消拖曳;
 *        表單接線到得了 Combobox(name / Esc 層 / 焦點);開啟彈出層不算離開欄位(必填錯誤不會先長出來);
 *        沒有觸發點、從選單項開的對話框關閉後焦點回選單的觸發鈕;移除集合裡的一項後焦點接給下一顆 ×;
 *        就地編輯按 Enter 提交後不會把編輯重開;AgentPanel 輸入盒按附件 × 焦點不離開 textarea;按到底而自己停用的按鈕握著焦點;
 *        可打字日期欄位收起日曆後焦點回輸入框;AgentPanel 改名對話框照表單可執行層(Esc 兩層、取消不落空、空白可按並報錯);
 *        宣告了 Esc 層卻沒有處理的那一下不會困住使用者(consumer 蓋掉 getInputProps 的 onKeyDown、DataTable 游標的欄被隱藏);
 *        Combobox「+N」浮出清單也算同一個欄位;可聚焦的停用(忙碌 / 握著焦點時被停用)滑過、按住都與原生停用同色(2026-10-07,後三列用同一棵樹編出的 DS 樣式)。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(二十五個,見 MUTANTS),每個突變都必須**剛好**紅它負責的那幾列
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
 *
 * ── 判定表(契約列;每列「層數 + 1」下關閉、焦點從不落 body)──
 *   E-link-edit        Dialog 裡的 LinkInput 按鉛筆進編輯 → Esc 取消編輯(焦點給鉛筆)→ 再 1–2 下關(鉛筆的 Tooltip 若開著算一層)
 *   E-link-typed       Dialog 裡沒有值的 LinkInput 打了字 → Esc 丟草稿、焦點留在輸入框 → 第 2 下關
 *   E-inline-edit      Dialog 裡的 InlineEdit 進編輯 → Esc 回檢視(焦點回檢視鈕)→ 第 2 下關
 *   E-datepicker-draft Dialog 裡可打字的 DatePicker:點欄位(日曆開)打字 → Esc 只關日曆、草稿不動 → Esc 還原草稿 → 第 3 下關
 *   E-datatable-cursor Dialog 裡試算表模式的 DataTable:點格(格游標)→ Esc 清游標、焦點留在表格 → 第 2 下關
 *   E-calendar-tile    Dialog 裡的 Calendar:F2 進格內(焦點在事件方塊)→ Esc 出格回日期鈕 → 第 2 下關
 *   E-drag             Popover 裡的排序面板:焦點在拖曳把手按空白鍵提起 → ↓ → Esc 只取消拖曳(播報「已取消」)、面板不關 → 第 2 下關
 *   E-drag-table       Dialog 裡有格游標的 DataTable:表頭按空白鍵提起欄位 → Esc 只取消拖曳,格游標還在、對話框不關
 *   E-combobox-popup   Dialog 裡經 getInputProps 接線、值改過的 Combobox:清單開著按 Esc → 只關清單、值不動、對話框不關
 *   E-combobox         接上題:清單關著按 Esc → 值回復(對話框不關)→ 下一下關
 *   C-combobox-focus   必填的 Combobox 空著送出 → 焦點落在它的觸發區(name 掛在可聚焦的元素上)
 *   B-popup            必填的 Select / Combobox / DatePicker / TimePicker 經 getInputProps 接線:打開彈出層時沒有錯誤;Esc 關掉後 Tab 離開才有
 *   F-menu             DropdownMenu 的項目開了受控 Dialog → Esc → 焦點回選單的觸發鈕(不是 body)
 *   F-remove           FileUpload 焦點在列上、點第一項的 ×(按鈕不拿焦點,同 Safari)→ 焦點接到下一顆 ×(不是上傳鈕)
 *   F-enter-commit     Dialog 裡的 LinkInput 編輯後按 Enter → 回連結狀態、onChange 一次、焦點在鉛筆;InlineEdit 同(回檢視、onCommit 一次、焦點在檢視鈕)
 *   F-link-enter-stay  LinkInput 打了不合法網址按 Enter → 留在輸入框、紅框、焦點在輸入框;清空按 Enter → onChange('')、焦點仍在輸入框
 *   C-composer-mouse   AgentPanel 輸入盒 textarea 握著焦點時用滑鼠按附件 × → 附件移除、焦點與字都留在 textarea
 *   C-composer-keyboard 焦點在第一顆附件 × 上按 Enter → 移除後焦點在下一顆 ×
 *   F-date-return      Dialog 裡可打字的 DatePicker 用 ↓ 開日曆(焦點進日曆)→ Esc 收起後焦點回輸入框、對話框不關(修前掉到 body)
 *   F-pagination       分頁鍵盤按「下一頁」到最後一頁 → 焦點留在那顆箭頭上(aria-disabled;修前掉到 body)
 *   F-rename           AgentPanel 改名對話框:Esc 先回復名稱再關;清空後直接按「取消」這一下沒落空;清空時「儲存」可按、按了才報錯並移焦點
 *   E-datatable-hidden-col Dialog 裡試算表 DataTable:點「數量」格(格游標)→ 隱藏「數量」欄 → ↓ 重新放上游標(不懸空)→ Esc 清游標 → 第 2 下關
 *                      (2026-10-07 獨立驗證抓到:欄被隱藏後根節點仍宣告 Esc 層、handler 卻在 curColIdx < 0 提早 return,五下都關不掉)
 *   E-unchained        Dialog 裡 consumer 展開 getInputProps 後自己蓋掉 onKeyDown、沒轉呼叫(輸入框 + 可打字 DatePicker),欄位改過 → 第一下 Esc 就關
 *                      (沒有回復,但不困住;lib/overlay-escape.ts「宣告 ≠ 處理」)
 *   B-overflow         必填 Combobox(非搜尋型,窄欄位、四個 Tag)焦點在觸發區,用滑鼠按「+N」浮出清單裡的 ×(焦點搬進卡)→ consumer 的 onBlur 不跑;
 *                      焦點移到欄位外的按鈕 → 跑一次
 *   F-look             可聚焦的停用(忙碌鈕 8 種 variant / danger;存檔後握著焦點的送出鈕)與原生停用逐項同色:靜止 / 滑過 / 按住 × 淺深兩色,
 *                      背景 / 字 / 四邊框 / 不透明度 / 游標;忙碌鈕確實是可聚焦的停用(data-disabled-focusable、原生 disabled=false)
 *   CTRL-clean / CTRL-button(對照)乾淨的欄位 / 按鈕上第一下 Esc 就關(只量「看得到關閉」,不含焦點去哪)
 *
 * ── 突變 → 該紅的列(--selftest;MUTANTS 是單一來源,這裡是人讀版)──
 *   LinkInput 只看 raw defaultPrevented(第一輪的寫法)→ E-link-edit / E-link-typed(困住,永遠關不掉)
 *   editSettleKeyProps 不宣告 Esc 層 → E-inline-edit / E-link-edit / E-link-typed;DatePicker 草稿不宣告 → E-datepicker-draft;DatePicker 草稿的 Esc 不看 Radix 已用掉 → E-datepicker-draft
 *   DataTable 根不宣告 self 層 → E-datatable-cursor / E-datatable-hidden-col;Calendar 方塊不宣告 → E-calendar-tile
 *   拖曳不宣告 / 不獨占 → E-drag / E-drag-table;DataTable 拖曳中仍用 self 層 → E-drag-table
 *   Combobox 丟掉 name / data-* → E-combobox / C-combobox-focus;表單 Esc 不看 Radix 已用掉 → E-combobox-popup(+ 接著量的 E-combobox;也不認領 → F-rename)
 *   複合欄位的 blur 一律轉呼叫 → B-popup / B-overflow;不記選單的觸發鈕 → F-menu;FileUpload 不以被點的 × 為基準 → F-remove
 *   結算 Enter 不 preventDefault → F-enter-commit;LinkInput Enter 一律 blur → F-link-enter-stay
 *   輸入盒外框不留焦點 → C-composer-mouse;輸入盒不接力 → C-composer-keyboard
 *   DatePicker 收起日曆不還焦點給輸入框 → F-date-return;Button 握著焦點時仍轉原生 disabled → F-pagination / F-look;改名「儲存」空白時停用 → F-rename
 *   DataTable 游標的有效性不看欄是否可見 → E-datatable-hidden-col;守門不驗收(沒人認領也不重新派)→ E-unchained;
 *   DatePicker 草稿乾淨時也替 consumer 認領 → E-unchained;Combobox 不把「+N」卡算進欄位 → B-overflow;
 *   可聚焦的停用保留 aria-disabled 那一組長相(2026-10-07 前的寫法:滑過變品牌色)→ F-look
 *
 * 用法:
 *   node scripts/escape-and-focus-contract-invariant.mjs                  判定(現行原始碼)
 *   node scripts/escape-and-focus-contract-invariant.mjs --selftest       對照組(二十五個單一根因突變)
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
 * 單一突變要把 25 列整趟走完(約 60 秒,大多是等版面 / 焦點靜止,CPU 約 20%),25 個變體循序要 25 分鐘;
 * 判定(非 selftest)只跑一趟,不受影響。`--lanes=1` = 循序(除錯用)。
 */
const LANES = Math.max(1, Number(process.argv.find((a) => a.startsWith('--lanes='))?.slice('--lanes='.length) ?? 4) || 4)
/** 除錯用:`--only=<突變 id>[,<id>…]` 只跑這幾個突變(不檢查覆蓋率 —— 這一趟不算 selftest 通過,結尾會明說) */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean) ?? null

// ─── 二十五個單一根因突變(--selftest;file 相對 packages/design-system/src)──────────────────────
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
    id: 'datepicker-draft-no-layer',
    what: 'DatePicker 可打字欄位的草稿不宣告 Esc 層',
    file: 'components/DatePicker/date-picker.tsx',
    expectRed: ['E-datepicker-draft'],
    apply: (src) => replaceOnce(src, /\{\.\.\.escapeLayerProps\(inputDraft !== displayLive \|\| inputInvalid\)\}/, ''),
  },
  {
    id: 'datepicker-esc-ignores-radix-used',
    what: 'DatePicker 可打字欄位的 Esc 不看這一下是否已被 Radix 用掉(日曆開著按 Esc 又關日曆又還原草稿 = 一下兩層)',
    file: 'components/DatePicker/date-picker.tsx',
    expectRed: ['E-datepicker-draft'],
    apply: (src) => replaceOnce(src, /\n                          if \(!isEscapeForControl\(e\)\) return\n/, '\n'),
  },
  {
    id: 'datatable-no-self-layer',
    what: 'DataTable 表格根不宣告格游標 / 列選取那一層',
    file: 'components/DataTable/data-table.tsx',
    // 隱藏欄之後重新放上的游標同樣靠這一層(E-datatable-hidden-col 的第一下 Esc 也會直接關),同一個根因連帶紅
    expectRed: ['E-datatable-cursor', 'E-datatable-hidden-col'],
    apply: (src) => replaceOnce(src,
      /: escapeLayerProps\(\(hasCellCursor && editingCellId == null\) \|\| \(enabled && hasAnySelection\), 'self'\)\)\}/,
      ': {})}'),
  },
  {
    id: 'calendar-tile-no-layer',
    what: 'Calendar 事件方塊不宣告格內那一層',
    file: 'components/Calendar/calendar.tsx',
    expectRed: ['E-calendar-tile'],
    apply: (src) => src.split('{...escapeLayerProps(true)}').join(''),
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
    expectRed: ['E-combobox', 'C-combobox-focus'],
    apply: (src) => replaceOnce(src, /\{\.\.\.\(\(\{ \.\.\.dataAttrs, name \}\) as unknown as React\.HTMLAttributes<HTMLDivElement>\)\}/, ''),
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
    // 「+N」卡是同一支判準的零件,一律轉呼叫時它也算離開(B-overflow 連帶紅)
    expectRed: ['B-overflow', 'B-popup'],
    apply: (src) => replaceOnce(src, /if \(!isWithinCompositeField\(event\.relatedTarget, parts\)\) forward\(\)/, 'forward()'),
  },
  {
    id: 'no-persistent-opener',
    what: '開啟者住在選單裡時不改記選單的觸發鈕',
    file: 'lib/overlay-focus-return.ts',
    expectRed: ['F-menu'],
    apply: (src) => replaceOnce(src, /openerRef\.current = persistentOpenerOf\(captureFocusOrigin\(\)\)/, 'openerRef.current = captureFocusOrigin()'),
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
    apply: (src) => replaceOnce(src, /\n          onCloseAutoFocus=\{typeable \? \(e\) => returnFocusToOpener\(e, typedInputRef\.current, \{ noTrigger: true \}\) : undefined\}/, ''),
  },
  {
    id: 'button-held-focus-native-disabled',
    what: 'Button 握著焦點時被停用仍轉原生 disabled(焦點被瀏覽器丟到 body;2026-10-01 前的行為)',
    file: 'components/Button/button.tsx',
    // F-look 的最後一列就是「握著焦點時被停用」的送出鈕:它變成原生停用、不再是可聚焦的停用,連帶紅
    expectRed: ['F-look', 'F-pagination'],
    apply: (src) => replaceOnce(src, /const focusableDisabled = !asChild && \(loading \|\| \(!!disabled && holdsFocus\)\)/, 'const focusableDisabled = !asChild && !!loading'),
  },
  {
    id: 'rename-save-disabled-when-empty',
    what: '改名對話框名稱空白時「儲存」一併停用(2026-10-01 前的第二份規則)',
    file: 'components/AgentPanel/agent-panel.tsx',
    expectRed: ['F-rename'],
    apply: (src) => replaceOnce(src, /disabled=\{form\.submitDisabled\} loading=\{form\.isSubmitting\} onClick=\{\(\) => void form\.handleSubmit\(\)\}>\n            儲存/, "disabled={form.submitDisabled || !String(form.values.title).trim()} loading={form.isSubmitting} onClick={() => void form.handleSubmit()}>\n            儲存"),
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
    apply: (src) => replaceOnce(src, /, extra: \(\) => \[document\.getElementById\(overflowCardId\)\] \}/, ' }'),
  },
  {
    id: 'button-focusable-keeps-aria-disabled-look',
    what: '可聚焦的停用保留 aria-disabled 那一組長相(滑過 / 按住釘在品牌色;2026-10-07 前的寫法)',
    file: 'components/Button/button.tsx',
    expectRed: ['F-look'],
    apply: (src) => replaceOnce(src, /focusableDisabled \? withoutAriaDisabledLook\(ownVariantClasses\) : ownVariantClasses,/, 'ownVariantClasses,'),
  },
  {
    id: 'composer-no-removal-relay',
    what: 'AgentPanel 輸入盒附件移除後不接力焦點',
    file: 'components/AgentPanel/agent-panel.tsx',
    expectRed: ['C-composer-keyboard'],
    apply: (src) => replaceOnce(src, /    focusAfterCollectionRemoval\(containerRef\.current, \{ owner: owner\.current \}\)\n    onRemove\(attachment\)/, '    onRemove(attachment)'),
  },
]

// ─── harness(打包進空白頁)──────────────────────────────────────────────────
// 一次只掛一個場景(window.__scene(name)):每個場景一個浮層、一顆開啟鈕,Esc 的層數才數得清。
const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/design-system/components/Dialog/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { Button } from '@/design-system/components/Button/button'
import { LinkInput } from '@/design-system/components/LinkInput/link-input'
import { InlineEdit } from '@/design-system/components/InlineEdit/inline-edit'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { DataTable } from '@/design-system/components/DataTable/data-table'
import { DataTableSortManager } from '@/design-system/components/DataTable/data-table-sort-manager'
import { Calendar } from '@/design-system/components/Calendar/calendar'
import { FileUpload } from '@/design-system/components/FileUpload/file-upload'
import { AgentPromptInput, AgentPanelHeader } from '@/design-system/components/AgentPanel/agent-panel'
import { Pagination } from '@/design-system/components/Pagination/pagination'
import { useFormValidation } from '@/design-system/components/Field/use-form-validation'

window.__calls = {}
const count = (k) => { window.__calls[k] = (window.__calls[k] ?? 0) + 1 }

function Shell({ title, children, footer }) {
  const [open, setOpen] = React.useState(false)
  window.__closeScene = () => setOpen(false)
  return (
    <div>
      <button type="button" data-open onClick={() => setOpen(true)}>開啟 {title}</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="scene-dialog" autoHeight maxWidth={720}>
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
      <DataTable columns={COLS} data={ROWS} getRowId={(r) => r.id} height="auto" spreadsheetMode
        {...(reorder ? { enableColumnReorder: true, columnOrder: order, onColumnOrderChange: setOrder } : {})} />
    </Shell>
  )
}
function CalendarScene() {
  return (
    <Shell title="月曆">
      <Calendar aria-label="團隊行事曆" referenceDate={new Date(2026, 2, 1)} today={new Date(2026, 2, 1)}
        events={[{ id: 'e1', title: 'Sprint review', start: '2026-03-12', end: '2026-03-12', allDay: true }]}
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
        <DialogContent id="scene-dialog" autoHeight maxWidth={440}>
          <DialogHeader><DialogTitle>重新命名</DialogTitle></DialogHeader>
          <DialogBody><label>名稱<input defaultValue="發布公告草稿" /></label></DialogBody>
        </DialogContent>
      </Dialog>
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
      <DataTable columns={COLS} data={ROWS} getRowId={(r) => r.id} height="auto" spreadsheetMode
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

const SCENES = {
  link: () => <LinkScene initial="https://acme.com/docs" />,
  linkEmpty: () => <LinkScene initial="" />,
  inline: () => <InlineScene />,
  date: () => <DateScene />,
  table: () => <TableScene reorder={false} />,
  tableDrag: () => <TableScene reorder />,
  calendar: () => <CalendarScene />,
  drag: () => <DragScene />,
  combo: () => <ComboScene />,
  popup: () => <PopupScene />,
  menu: () => <MenuScene />,
  remove: () => <RemoveScene />,
  composer: () => <ComposerScene />,
  rename: () => <RenameScene />,
  pagination: () => <PaginationScene />,
  ctrl: () => <CtrlScene />,
  tableHide: () => <TableHideScene />,
  unchained: () => <UnchainedScene />,
  overflow: () => <OverflowScene />,
  look: () => <LookScene />,
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
  date: () => ({ draft: q('#scene-dialog input[role=combobox]')?.value ?? null, calendar: !!q('[role=dialog][aria-label="日期選擇"]'), value: q('[data-date]')?.textContent }),
  table: () => ({ cursor: !!q('[data-selected-cell-id]'), live: q('[data-drag-live-region]')?.textContent ?? '' }),
  cal: () => ({ tile: document.activeElement?.hasAttribute('data-calendar-tile') ?? false, day: document.activeElement?.hasAttribute('data-calendar-day') ?? false }),
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

  // ── E-calendar-tile ──
  await scene('calendar'); await openDialog()
  await d.focus('#scene-dialog [data-calendar-day="2026-03-12"]')
  await d.press('F2')
  before = await snap('cal')
  needs(before.tile, 'F2 沒進格內', before)
  steps = await escapeUntilClosed('cal')
  check('E-calendar-tile', 'contract', 'Dialog 裡的 Calendar:F2 進格內(焦點在事件方塊)→ 第一下 Esc 出格回日期鈕、對話框不關 → 第二下關',
    steps.length === 2 && steps[0].dialog && steps[0].day && !steps[1].dialog && neverBody(steps), steps)

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
  const popupPart = async (label, selector, popupSel, openKey = 'ArrowDown') => {
    await scene('popup')
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
  check('B-popup', 'contract', '必填的 Select / Combobox / DatePicker / TimePicker 經 getInputProps 接線:打開彈出層時沒有錯誤(焦點搬進彈出層不算離開)、Esc 關掉後也沒有、Tab 離開欄位才有',
    okSelect && okCombo && okDate && okTime, parts)

  // ── C-combobox-focus(填好 Select 再送出,第一個錯誤 = Combobox)──
  await scene('popup')
  await d.focus('form [role="combobox"][aria-label="負責人"]'); await d.press('ArrowDown')
  await waitSel('[cmdk-item]', 'Select 清單沒開')
  await page.click('[cmdk-item][data-value="alice"]'); await d.settle(); await d.focusStable()
  await d.click('[data-submit]')
  s = await snap('err')
  check('C-combobox-focus', 'contract', '必填表單填好 Select 後送出(Combobox / DatePicker / TimePicker 空著)→ 三欄報錯,焦點落在 DOM 第一個錯誤 = Combobox 的觸發區(name="tags"、role=combobox;修前觸發區沒有 name,焦點落不到)',
    s.errors.includes('tags') && !s.errors.includes('owner') && s.activeName === 'tags' && s.activeRole === 'combobox', s)

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
  await styleTag.evaluate((el) => el.remove())
  await d.settle()
  check('F-look', 'contract', '可聚焦的停用(忙碌鈕 primary / secondary / tertiary / text / link / 三種 danger;存檔後握著焦點的送出鈕)與原生停用逐項同色 —— 靜止 / 滑過 / 按住 × 淺深兩色,背景 / 字 / 四邊框 / 不透明度 / 游標;忙碌鈕確實是可聚焦的停用(修前滑過變品牌色)',
    lookDiffs.length === 0 && lookFacts.every(Boolean) && heldFacts.focusable && heldFacts.focused, { diffs: lookDiffs.slice(0, 12), diffCount: lookDiffs.length, notFocusable: lookFacts.filter((f) => !f).length, heldFacts })

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
  // (c) 清空後「儲存」可按(不是原生停用),按了才報「名稱不可空白」並把焦點移到名稱欄位
  await openRename()
  await d.clearFocused()
  const emptied = await snap('rename')
  await page.click(renameFooter('儲存'), { force: true }); await d.settle(); await d.focusStable()
  const saved = await snap('rename')
  const saveOk = emptied.error === null && emptied.saveNativeDisabled === false && saved.renameOpen && saved.error === '名稱不可空白' && saved.active.startsWith('INPUT') && saved.calls === 0
  check('F-rename', 'contract', 'AgentPanel 改名對話框:改過名稱第一下 Esc 回復、第二下才關;清空後直接用滑鼠按「取消」→ 關(這一下沒落空);清空時焦點在欄位裡不報錯、「儲存」可按,按了才報「名稱不可空白」並把焦點移回欄位',
    escOk && cancelOk && saveOk, { typed, steps, cancelled, emptied, saved })

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
      console.log(`\n✗ escape-and-focus 契約:${red.length} 條不符(${red.join(' / ')})—— SSOT keyboard-model-canonical.md「焦點所在的控件自己那一層也算一層」「按了之後自己變停用」「關了之後焦點去哪」`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ escape-and-focus 契約:${result.checks.length} 條全綠(含 2 條對照)`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    // 突變彼此獨立:分 LANES 條 lane 並行跑(第一條 lane 沿用上面那個分頁),結果依 MUTANTS 的順序回報
    const RUN = ONLY ? MUTANTS.filter((m) => ONLY.includes(m.id)) : MUTANTS
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
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (ONLY) problems.push(`只跑了 --only 指名的 ${RUN.length} 個突變(除錯用):這一趟不算 selftest 通過`)
    else if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 條全被覆蓋),對照列全程綠 —— 量具會紅`)
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
