---
component: Command
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInternal
benchmark:
  - cmdk (shadcn Command base): github.com/pacocoursey/cmdk
---


# Command 設計原則

## 定位

Command 是**搜尋 + 鍵盤導覽的指令清單**——提供搜尋框、分組選項、鍵盤導覽、空狀態。多用於浮層選單內部（SelectMenu）或 Command Palette（Cmd+K）。

**實作基礎**：shadcn passthrough——基於 cmdk + Radix Dialog（Command Palette 模式）。**視覺結構消費 DS primitive,不另寫一份**(2026-09-08 user 抓「Command 所有 story 都偏移、跟 SelectMenu 不同一套」後改):搜尋列 = `CommandInput`(SelectMenu / CommandDialog / inline 三種形態共用同一個;高度 `--field-height-*` + 8px、字級 / placeholder / disabled token 與 Field 輸入控件相同,差別只有沒有外框、底部用分隔線收邊);項目 = `CommandItem` 內包 `MenuItem`(item-anatomy SSOT:icon 槽、label / description、尾端 tag / endContent / shortcut,跟 SelectMenu 包 option 的結構相同);分組標題 = `MenuItem header`。改 MenuItem 會連動 Command。

**分類**：Internal primitive——由 SelectMenu 消費（Select / Combobox / PeoplePicker 透過 SelectMenu 使用）。App **不從 root barrel front-door 直接 import** Command 家族;若要 Command Palette 類 UX,經 per-component subpath `@qijenchen/design-system/components/Command` 取用 `CommandDialog`(自行包裝確認後使用,對齊 `.claude/rules/ui-development.md`「Root barrel front-door 排除」— internal ≠ 禁用;cmdk + Radix Dialog 包裝,showcase「CommandPalette」story 消費)。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **SelectMenu 內部搜尋**：Select / Combobox / PeoplePicker 的 searchable 模式底層
- **Command Palette（Cmd+K）**：全局跨頁搜尋、快速動作入口
- **需要搜尋過濾 + 鍵盤導覽的選項清單**

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 不需要搜尋的短選項清單（< 6 項）| `DropdownMenu` | DropdownMenu 是操作選單，不含搜尋 |
| 表單內的單選下拉 | `Select` | Select 自動判斷是否切到 SelectMenu 模式 |
| 表單內的多選下拉 | `Combobox` | 同上 |
| 人員選擇 | `PeoplePicker` | 專用人員選擇器（內部會消費 Command）|

---

## 消費者

Command 通常由 `SelectMenu` 或自訂 Command Palette 元件消費——直接使用 Command 很少見，除非建立全新的搜尋清單 UI。

---

## 與 DropdownMenu 的分界

**本節是 SSOT**——DropdownMenu / SelectMenu spec 反向引用此節。

- **DropdownMenu**：**操作選單**——選完觸發動作（複製 / 刪除 / 匯出），選單關閉，選項通常 < 10 項
- **Command**：**搜尋選值**——有 search input + 大量選項導覽，適合超過 10 項或需要鍵盤搜尋過濾的場景

**判斷法**：問「選項數量 > 10 且使用者需要搜尋嗎？」

- 是 → **Command / SelectMenu**
- 否（少量、固定清單） → **DropdownMenu**

## 與 SelectMenu 的分界

- **SelectMenu**：Select / Combobox / PeoplePicker 的 searchable 浮層（**由 Field 觸發**,帶有 input field + 選中值回填）
- **獨立 Command Palette**（Cmd+K）：也用 Command 但**不在 Field 觸發**——透過全域快捷鍵開啟,用於跨頁面搜尋 / 快速動作入口

兩者底層都消費 Command。Field 場景用 SelectMenu（已處理 input binding）；非 Field 場景(Cmd+K)用 `CommandDialog`(經 subpath `@qijenchen/design-system/components/Command` 取用,cmdk + Radix Dialog 包裝)。

---

## 禁止事項

- ❌ **不在短選單（< 6 項）用 Command**：多此一舉增加認知負擔,改用 DropdownMenu 或 RadioGroup
- ❌ **Command 不當 form input**：它是選值浮層而非輸入框——表單內選值請用 Select / Combobox,它們會自動決定是否啟用 Command 模式
- ❌ **搜尋列不得另寫一份樣式**:CommandDialog、SelectMenu、inline 三種形態都用同一個 `CommandInput`;它的高度吃 Field 的 `--field-height-*` token(+8px 內距)、字級與 placeholder 同 Field 控件,不是獨立規格。(2026-09-08 撤回原「Command 搜尋框不是 Field Control,走自身尺寸規格」—— 那句就是兩份樣式漂移的許可證)
- ⚠️ **Inline 嵌頁面 = 次要用法,必須自帶邊框容器**(2026-06-12 user 拍板放寬,原為全面禁止):主用法仍是浮層(SelectMenu 內部 / CommandDialog Cmd+K)——實際產品幾乎都走浮層形態。Inline 嵌頁面是原廠 documented 用法(cmdk README「Render this to show the command menu inline」;shadcn 預設範例即 inline 且包 `rounded-lg border`),允許但**必須自己包有邊框的容器**(rounded + border,對齊 shadcn 同款),且不可拿來替代 SelectMenu / Select(表單選值仍走它們)

---

## A11y 預設

cmdk 自動處理(`aria-activedescendant`、指標、收起還焦點三條由本元件補上,見下方 2026-09-30 項目)：

- **List 語意**：`role="listbox"`;`aria-activedescendant` 見下一條
- **`aria-activedescendant` = 反白列的 id,唯一來源在 Command 根**(2026-09-30):cmdk 自己綁在搜尋框與清單上的值(`selectedItemId`,<https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L251-L254>)開啟時是空的、要等第一次方向鍵才有值(實測:開啟即讀為 null,同時已有一列 `data-selected`)。Command 根的 observer(`command.tsx` `useCommandRootObserver`)讀 `[cmdk-item][data-selected="true"]` 的 id,用唯一寫法 `applyActiveDescendant` 寫上本 Command 的 `[cmdk-input]` 與 `[cmdk-list]`(cmdk 重繪蓋回自己的值時再改回);清單 0 筆、沒有反白時移除。**觸發欄位內握著焦點的輸入框**(清單在浮層 portal 裡、兩棵 DOM 子樹)經 `onActiveOptionChange?: (active?: { id, listboxId }) => void` 取得同一個 id 與清單(`[cmdk-list]`)的 id(卸載時回報 undefined),SelectMenu 轉發給 Select / Combobox 的 `useActiveDescendant(inputRef)`,由唯一寫法 `applyListboxRelation` 同時寫 `aria-activedescendant` 與 `aria-controls`(ARIA 1.2:textbox 用 `aria-activedescendant` 時 `aria-controls` 必須指到包住那個選項的元素,<https://www.w3.org/TR/wai-aria-1.2/#aria-activedescendant>;2026-09-30 初版只寫前者)。讀反白也只有一支 `getActiveOption(root)`(列上按鈕的鍵盤路、SelectMenu 的 Tab / 空白鍵選定同讀這支)。直接寫 DOM、不經 React state:反白每移一格不重繪整份清單(MUI 同做法,<https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L375-L388>)。規則(焦點所在的搜尋框必帶)與 W3C 出處住 `../SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段。
- **指標按在清單上,不搬走 combobox 的 DOM 焦點**(2026-09-30 user 同意的範圍是「滑鼠點選項 = 按 `Enter`,焦點不離開搜尋框」,原話「其他部分我覺得”可以”」;延伸到清單裡其他不是控件的位置與清單型浮層裡的按鈕屬 AI 推導,依 rc-select 整份清單擋 mousedown(<https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/OptionList.tsx#L79-L81>)、MUI 清單「Prevent blur」(<https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1472-L1479>)的做法,「選完之後」「按清單以外的地方」兩張表住 `../SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段,本條只寫本元件怎麼做):cmdk 的選項只有 `onPointerMove` / `onClick`、沒有擋 mousedown(<https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L706-L718>),按下去瀏覽器把焦點交給最近的可聚焦祖先(`[cmdk-list]` / `[cmdk-root]` 都是 `tabIndex=-1`,人員選項的名片頭像也是),之後打的字全部丟掉。Command 根的 `onMouseDown`(`command.tsx` `keepComboboxFocusOnPointerPress`;consumer 的 `onMouseDown` 先跑、擋了預設就不接)只在**此刻握著 DOM 焦點的是控制這份清單的 combobox**(焦點在 `role="combobox"` 上或它裡面的輸入框,它的 `aria-controls` 指到本 Command 或包住本 Command 的浮層)時插手,其餘條件(左鍵、按在本 Command 的 DOM 裡 —— React 事件會穿過 portal 冒泡,名片浮層不算、不是文字輸入)住在共用判準 `../../lib/pointer-press.ts` `keepFocusOnPointerPress`。**握著焦點的東西住在哪,決定容器裡的按鈕怎麼算**:住在本 Command 裡(浮層內搜尋框、`CommandDialog`、inline 的 `[cmdk-input]` = 對話框型,按鈕與搜尋框在同一個 Tab 序上)→ 容器裡自有行為的東西(列上的改名 / 刪除鈕、全選鈕、連結)照原生拿焦點,判準與 Field 外框同一份 `isOwnPointerTarget`;住在外面(觸發欄位內的搜尋框 = 清單型:DOM 焦點的主人是欄位內的搜尋框、清單靠它的 `aria-activedescendant`;浮層裡的全選鈕雖是可 Tab 的按鈕,但只有觸發欄位是頁面最後一格時 Tab 才會照 DOM 順序走進來,2026-09-30 實測)→ 連按鈕(全選)也不搬焦點,click 照常動作。一處涵蓋選項、群組標題、訊息列、搜尋列的放大鏡與捲軸,SelectMenu / `CommandDialog` / inline 三種形態同一條。焦點本來就在清單裡(不可打字的下拉)、或清單不屬於任何 combobox(Popover / Dialog 裡的純清單)→ 條件不成立,原生行為照舊(焦點落到 `[cmdk-list]`,方向鍵照常)。只動 mousedown:鍵盤路徑、Tab 停靠點、捲軸拖曳(Radix ScrollArea 用 pointerdown + pointer capture)都不受影響;觸控點一下產生的相容 mousedown 同樣被擋,焦點留在搜尋框、手機鍵盤不收起(觸控模擬實測)。
- **收起後焦點回觸發點,指標挑選不畫鍵盤框**(2026-09-30,AI 推導:上一條的直接後果):焦點留在搜尋框(文字輸入永遠帶 `:focus-visible`),收起時程式把焦點移回觸發點,瀏覽器依 CSS Selectors 4 啟發式讓觸發點也帶框(<https://github.com/w3c/csswg-drafts/blob/main/selectors-4/Overview.bs> `:focus-visible` 啟發式清單:「If the previously-focused element indicated focus, and a script causes focus to move elsewhere, indicate focus on the newly focused element」;實測 Chromium 147:SelectMenu 的 Button 觸發、AgentPanel 歷史標題在打字後滑鼠挑選收起時冒出 2px 框)。實作住 `../../lib/overlay-focus-return.ts` `returnFocusToOpener(event, opener, options)`(全 DS「浮層關閉後焦點還給開啟者」唯一一支,2026-09-30 自本檔搬出):包著 Command 的浮層當 `onCloseAutoFocus`;Radix 有觸發點時(SelectMenu、AgentPanel 歷史浮層)只接手「最近一次使用者輸入是按在浮層裡或觸發點上的指標」(`../../hooks/use-input-modality.ts` `getLastUserInput`)→ 擋 Radix 預設、`opener.focus({ preventScroll: true, focusVisible: false })`(HTML `FocusOptions`,<https://html.spec.whatwg.org/multipage/interaction.html#dom-focus>);鍵盤收起(`Enter` / `Esc`)與按在外面收起照 Radix 原樣;此刻焦點已被別的東西接走(列上的改名鈕開了對話框)→ 不搶。已知限制:`focusVisible` 選項 Chrome / Edge 145、Firefox 104、Safari 18.4 起支援(MDN browser-compat-data `focus.options_focusVisible_parameter`,<https://github.com/mdn/browser-compat-data/blob/main/api/HTMLElement.json>),更舊的引擎忽略它 → 觸發點畫上鍵盤框(與鍵盤收起同長相,操作不受影響)。
- **`CommandDialog` 關閉後焦點還給開啟它的元素**(2026-09-30;`../Dialog/dialog.spec.md`「Focus return:關閉時焦點返回 trigger 元素」):指令面板多半由快捷鍵或普通按鈕的 `onClick` 開啟,沒有 `DialogTrigger`;Radix Dialog 只還給 `DialogTrigger`,沒有就不還 → 焦點掉到 body(2026-09-30 實測本元件「全域指令面板」:滑鼠點項目 / `Enter` / `Esc` 收起後 `activeElement` 都是 body)。2026-10-01 起這是 `DialogContent` 的**預設**(`../Dialog/dialog.spec.md`「Focus return」;`../../lib/overlay-focus-return.ts` `useTriggerlessFocusReturn`:內容掛上時記下當下握著焦點的元素、關閉時沒有 Radix 觸發點就用同一支 `returnFocusToOpener` 還回去 —— 沒有觸發點 + modal:鍵盤收起、按遮罩收起也還;指標挑選不畫框、鍵盤照瀏覽器規則),本元件 2026-09-30 自己那份 RememberFocusOrigin 收掉。開面板的按鈕宣告 `aria-haspopup="dialog"` + `aria-expanded`(`DialogTrigger` 會自動帶;沒有 `DialogTrigger` 時由按鈕自己寫,見本元件「全域指令面板」story)。
- **搜尋框**：`role="combobox"` + `aria-expanded` / `aria-controls` 指向 list(listbox 的 accessible name 預設「選項」,cmdk 預設是英文 Suggestions;傳 `label` 覆寫,**不要**在 CommandList 上寫 `aria-label`,cmdk 會靜默蓋掉)
- **鍵盤導覽**：cmdk 提供 ↑ / ↓ 移動 highlight、Enter 選取（另支援 vim-style Ctrl+n/p/j/k、Home/End）。輸入法組字中的按鍵(`isComposing` 或 `keyCode === 229`)不選、不走列上按鈕的鍵盤路 —— cmdk 自己的搜尋框有這條判斷,Command 根的 `routeCommandRowKeys` 用全 DS 一支 `../../lib/ime-composition.ts` `isImeComposing`(2026-09-30 前只看 `isComposing`,Safari 注音按 Enter 選字的那一顆漏掉)。cmdk 本身無 Esc handler — Esc 關閉僅在 `CommandDialog`(Cmd+K)模式由 Radix Dialog 的 DismissableLayer 提供;inline `<Command>` 模式按 Esc 無反應
- **空狀態**：`<CommandEmpty>` 自動帶 `role="presentation"`,不干擾 screen reader 的 list 朗讀;**放在 `<CommandList>` 外面(listbox 的兄弟)**:axe `aria-required-children` 不允許 listbox 內有非 option 子元素(2026-09-08 a11y 基線重建抓到),cmdk Empty 只讀 store、不需住在 List 裡;MUI Autocomplete 的 noOptions / loading 同樣在 listbox 外
- **列裡可聚焦的東西 = 不在 Tab 路上,`→` 才進得去**(2026-09-25 待辦總帳 B9「路線乙」,user 逐字「確定建議符合我們一致的設計語言且不違背世界級的設計就照建議」;規則住 `../../../ds-canonical/references/keyboard-model-canonical.md`「列上有小按鈕的一串」)。今天的消費者:AgentPanel 歷史列的改名 / 刪除、SelectMenu 人員選項的名片頭像(PeoplePicker)。09-25 前每一個都各佔一站。本元件的按鍵表(焦點停在搜尋框、沒有搜尋框時停在清單 = home;反白列 = 這一項):

  | 鍵 | 焦點在 home(反白在某一列) | 焦點在反白列裡的東西上 |
  |---|---|---|
  | `→` | 進反白列的第一個可聚焦東西;搜尋框只在插入點已在字尾時才進(AI 推導:搜尋框的 `→` 仍要能移插入點);該列沒有東西就照舊 | 下一個;最後一個停住 |
  | `←` | 照舊(搜尋框移插入點) | 上一個;第一個 → 回 home |
  | `↑` `↓` `Home` `End` | cmdk 照舊移反白 | 回 home,cmdk 照常移反白 |
  | `Tab` / `Shift+Tab` | 照舊 | 回 home 再往下 / 往上走一站 = 一下離開這一串 |
  | `Enter` / `Space` | cmdk 照舊選反白列 | 屬於那個東西(按鈕照常啟動),**不**選這一列 |

  焦點在列裡的東西上時,反白列的鍵盤框讓給那個東西(一個項目一個指示器,`focus-canonical.md`)。`Esc` 不規定、照舊交給外殼。實作 = `command.tsx` `routeCommandRowKeys`(Command 根的 keydown,consumer 的 `onKeyDown` 先跑、擋了預設就不接)+ `syncCommandRowTabStops`(MutationObserver);**判定**與 Sidebar / TreeView / FileUpload 同一份 = `../../lib/roving-list-keyboard.ts` `resolveRovingKey`(2026-09-26 四份合一,待辦總帳〇節「按鍵規則合併」;判定表 `scripts/test-roving-list-keyboard.mjs`),本元件只負責執行(反白由 cmdk 自己搬,所以換項類與 Tab 是「回 home、不擋預設」)。列裡東西上的 `Enter` / `Space` 全 DS 只在這裡處理一次(AgentPanel 歷史列原本另寫一份同樣的 onKeyDown,2026-09-26 收回);列裡的輸入框保留自己的方向鍵與打字。
- **分隔線**:群組之間的線由 `<CommandGroup>` 自己畫(前面還有另一個看得見的群組才畫上邊線;cmdk 隱藏群組留在 DOM 加 `hidden`,已排除),consumer **不手插** `<CommandSeparator>`(cmdk 在搜尋字非空時不渲 Separator,手插版會讓搜尋時可見群組之間沒線,2026-09-08 修)。`<CommandSeparator>` 只留給非群組內容之間的純視覺分線,固定 `role="presentation"`;不冒充 listbox 選項或其他可導覽項目

Consumer 無需額外處理 a11y,保留 cmdk 原結構 + 使用 `<CommandInput>` / `<CommandList>` / `<CommandItem>` 即可。

---

## 邊界案例

- **Disabled item**:`<CommandItem disabled>` 透過 cmdk 內建支援,視覺繼承 MenuItem SSOT(`text-fg-disabled` + `aria-disabled=true` + 鍵盤導覽自動 skip + Enter 不觸發 onSelect)。skip 是「不進導覽清單」(cmdk `:not([aria-disabled="true"])` selector)— ↑/↓ 直接跳到下一個可選項,無中途 highlight。
- **Group heading 不可選中**:heading 是 `aria-hidden` 裝飾 div(group container `role="presentation"`),不參與導覽與選取;SR 經 items wrapper `role="group"` + `aria-labelledby` 取得群組語意。
- **Empty 後持續打字**:cmdk 每個 keystroke 重新過濾(`filtered.count` 驅動),`<CommandEmpty>` 持續顯示直到有 match;input 不鎖、不清空。
- **反白不准弄丟**(2026-09-30):清單有可選項時一定有一列反白,否則 `Enter` 沒有東西可選。cmdk 自己有「反白列卸載 → 選第一項」的修補(<https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L321-L333>),但它的排程以槽號當 Map 的 key(<https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L1046-L1058>),同一次 commit 卸載好幾列時只剩最後一列的檢查會跑 —— 清單在 cmdk 外面過濾(搜尋字在觸發欄位)或遠端換一批結果時,反白列不是最後卸載的那一列就沒人補(實測:Select 打「日」後 0 列反白、`Enter` 沒反應)。Command 根的 observer 補:沒有反白而有可選項 → 放回第一項(`moveCursorToFirstOption`,代發 cmdk 自己的 `Home` 鍵,選第一項並捲進可視範圍;代發的鍵不記成「鍵盤搬了游標」,`../../hooks/use-input-modality.ts` `dispatchRelayedKey`)。
- **Loading**:Command 本身非 async surface。async option fetch 由 consumer(SelectMenu / Cmd+K palette)在外層處理,指示**只有一處**(2026-09-09 user 拍板;2026-09-08 的 `<CommandInput loading>` 搜尋列轉圈已退役、prop 已移除):在 `<CommandEmpty>` slot 內放 `<CommandLoading label="載入選項中" />`(`command.tsx` `CommandLoading`)= 與「沒有結果」同一種 `MenuItem message` 訊息列,前綴槽放列圖示尺寸轉圈(`ICON_SIZE[size]`:sm/md 16、lg 20)+ 可見文字,`role="status"` 直接播報,**不經 Empty**;只在清單裡沒有任何可顯示的選項時才看得到。搜尋列仍可打字、不轉圈(SSOT select-menu.spec.md「Loading」)。
- **Empty(no results)**:`<CommandEmpty>` 在 filter result = 0 時渲;**它 own 空狀態的長相**(`command.tsx:155-172`):`MenuGroup`(`py-2`)包一列 `<MenuItem message>`——字串 children 自動包成訊息列(非互動、`text-fg-muted`、一般字重、字級同選項、置中),md 48px = 8 + 32 + 8 與 1 筆結果等高,**沒有最小高度**(舊 `minRows` / `getMenuListMinHeight` 已退役;SSOT select-menu.spec.md「Empty state」);consumer 只傳文案,不放圖示、不用 `Empty`。0 筆的讀屏播報由 `CommandEmptyStatus`(sr-only `role="status"` live region)負責,CommandDialog / SelectMenu 都渲一份。
- **Dark mode / density**:全數經 MenuItem / CommandInput 的 token 連動(空狀態、載入列也是 MenuItem);Command 自身只剩 cmdk 反白的長相:滑鼠搬的反白 `data-[selected=true]:bg-neutral-hover`、鍵盤搬的反白 `data-[selected=true]:focus-ring-inset`(反白來歷 `useCursorMover`;focus-canonical 規則一「兩類元件」+ 規則二;項目上沒有 `hover:` 樣式,鍵盤搬走反白後滑鼠停留列的底色一起消失),以及選中底色釘住(item-anatomy「選中 × 互動疊加」)。尺寸(sm / md / lg)由 Command root 的 `size` 進 RowSizeProvider,搜尋列 / 項目 / 群組標題 / 空狀態同一個值。

---

## 常見誤解

- 「選單一律用 Command」— < 6 項、選完即觸發動作的操作選單是 `DropdownMenu`(見「與 DropdownMenu 的分界」)。
- 「Command 搜尋框可以自己定尺寸」— 已撤回(2026-09-08):高度 / 字級 / placeholder 都吃 Field token,只是沒有外框(浮層內的一列)。
  **搜尋列不畫外框、只有底部分隔線 = 定案**(user 2026-09-09 逐字:「跟世界級的設計一樣就維持現狀」;對照 Linear / Raycast / cmdk 的浮層搜尋列);先前「跟 Input 一模一樣」指的是尺寸、字級、提示文字、停用態同一套 token,不含外框。
- 「cmdk `data-selected` = 持續選中態」— 它是鍵盤 / 指標的臨時 roving highlight(游標),不是選中:滑鼠移過搬的反白用 `bg-neutral-hover`(它就是 hover)、鍵盤搬的反白畫框不上底色,永遠不用 `bg-neutral-selected`(見「為何無 StateBehavior」)。

---

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

Command 是 **internal primitive**(SelectMenu 底層消費,app 不直接使用,見本 spec「分類」段),視覺**結構上**消費 MenuItem 與 CommandInput,自己沒有色彩 / 尺寸決策:

- **無 Inspector**:Command 無自己的決策性 prop(variant / severity),behavior 全部由 cmdk library 處理。該讓消費者 inspect 的是 **SelectMenu**(公開消費入口),不是 Command 本身。
- **無 ColorMatrix**:項目的色彩來自 MenuItem(hover / selected / disabled),搜尋列的來自 Field 輸入控件 token;Command 只在外層 cmdk item 上畫反白(滑鼠搬的 `data-[selected=true]:bg-neutral-hover` / 鍵盤搬的 `data-[selected=true]:focus-ring-inset`;無 `hover:`)。
- **無 SizeMatrix**:`size`(sm / md / lg)由消費者決定並同時傳給 `CommandInput` 與 `CommandItem`(= Field 與 Menu 的同一組 tier);Command 不另定尺寸。
- **無 StateBehavior**:cmdk `data-selected` 是「鍵盤 / 指標當前 active-highlight」(roving 臨時反白)而非持續選中態;它的長相由 CommandItem 依反白來歷(`hooks/use-input-modality.ts` `useCursorMover` + `markPointerGrab`)分流 —— 滑鼠移過搬的反白 `bg-neutral-hover`、鍵盤搬的反白畫框不上底色,兩者不同時出現、滑鼠停著不算搶(focus-canonical 規則一「兩類元件」+ 規則二,user 2026-09-09 拍板「都要畫框,不上底色」+ 下午三問),消費者(SelectMenu / AgentPanel)不再各自手刻。

對應 anatomy story:保留 `Overview`(展示 internal primitive 的 API surface——CommandInput / CommandList / CommandGroup / CommandItem / CommandEmpty)。深度視覺 / 尺寸對照請查 SelectMenu(consumer)與 MenuItem(item primitive)的 anatomy。

---

## 世界級對照

對齊 M8(binary strict rule 必 ≥3 家世界級對照),「禁短選單用 Command」+「禁直接 app 使用」是本 spec 的 binary strict rule,以下為支撐 rationale。

### Cmd-K palette 結構哲學

| 維度 | 本 DS | Linear | Raycast | VS Code Quick Pick | macOS Spotlight | Notion Cmd+K | Slack Cmd+K |
|------|-------|--------|---------|--------------------|-----------------|--------------|--------------|
| Layout | **單欄 + grouped sections** | 單欄 + group | 單欄 + group + secondary action panel | 單欄 + multi-mode prefix(`> ` 命令 / `: ` 行)| 全螢幕 + multi-pane(blur background)| 單欄 + inline page preview | 單欄 + 切 tab(Search / Nav / Settings)|
| Search input 位置 | **頂端** always visible | 頂端 always | 頂端 always | 頂端 always | 中央 hero | 頂端 always | 頂端 always |
| 視覺 surface | Dialog overlay(`CommandDialog`)| Popover overlay | Standalone window | inline overlay(top-center)| Full-screen(blur)| Popover overlay | Popover overlay |
| 觸發 shortcut | **Cmd+K**(Apple)/ Ctrl+K(Windows) | Cmd+K | Hotkey(default Option+Space)| Cmd+P / Cmd+Shift+P | Cmd+Space | Cmd+P / Cmd+/ | Cmd+K |
| Empty state | `<CommandEmpty>` + 文案 | inline 「No results」 | inline 「No matching commands」 | inline 「No results」 | hides list | inline 「No results」 | inline 「No matches」 |
| 多 mode | 無(單一搜尋語意)| 無(單一)| 無 | 有(prefix mode `>` `:` `@`)| 有(隱式 routing)| 無 | 有(tab)|

### Primitive vs Consumer 分層

| DS | 本 DS | cmdk lib | Radix UI | shadcn/ui | Material UI |
|----|-------|----------|----------|-----------|--------------|
| Internal primitive 命名 | **Command** | cmdk | (無此 primitive,用 `<Combobox>` + filter)| Command | `<Autocomplete>` 一體 |
| Consumer wrapper 命名 | SelectMenu / CommandDialog(Cmd+K) | (consumer 自包)| Combobox | Combobox / Custom Cmd+K | Autocomplete |
| 是否 app 直接用 | **禁(必透過 SelectMenu / CommandDialog wrapper)**| 開放 | 開放 | 開放 | 開放 |

## 設計哲學

四個關鍵決策,各自有世界級先例支撐:

**(1) 單欄 + grouped sections(non-multi-pane)**

macOS Spotlight 的 multi-pane / blur background 適合 system-level launcher(全 OS 範圍 routing),但 disruptive — 不適合 inline 元件場景(SelectMenu 內嵌 Cmd-K 模式)。Linear / Raycast / VS Code 共識「單欄 + group」適合 productivity tool 內嵌使用,且 cmdk lib(shadcn/Vercel)default 結構符合此哲學。

捨棄 multi-pane 的代價是「無 inline preview 直觀度」(Spotlight 可預覽檔案內容),但 DS 場景是命令清單非檔案 browser,接受。

**(2) Search input always visible at top**

input always visible 提示使用者「這是 search-driven」,對齊 input-first mental model。捨「only on focus 才出現 input」(節省垂直空間)的代價是「無法 list 看完再搜尋」,但 Cmd-K 場景 default 預期 search,不是 list browse。

**(3) Cmd+K(Apple)/ Ctrl+K(Windows)為觸發 shortcut**

Cmd-K / Ctrl-K 不與 OS 級 launcher 綁定，且能用同一語意跨平台觸發產品內命令面板。File-only navigation 或全域 launcher shortcut 不屬於本元件責任。

**(4) Internal primitive 哲學 — app 不直接用 Command,必透過 SelectMenu / CommandDialog wrapper**

cmdk / shadcn / Radix 默認開放 app 直接消費 primitive — 但本 DS 走 Material `<Autocomplete>` 一體 / Polaris 一體封裝哲學,把 search + popover + value-binding 包進 SelectMenu(form context)或 `CommandDialog`(cmdk + Radix Dialog 包裝,global Cmd+K)。

捨棄「app code 直接 import Command 客製」的代價是「自由度受限」(無法在 app 內客製 cmdk filter logic),但 DS 一致性更重要 — 若 SelectMenu / CommandDialog 不夠用,回 DS 開新 wrapper 而不是繞過抽象層(SSOT 消費 canonical M1)。

---

## 相關

- `../SelectMenu/select-menu.spec.md` — 主要消費者（Select / Combobox / PeoplePicker 的 searchable 浮層）
- `../DropdownMenu/dropdown-menu.spec.md` — 不需搜尋的操作選單
- `../Dialog/dialog.spec.md` — Command Palette 的浮層容器(`CommandDialog` 內部 wrap Radix Dialog)
- cmdk library — 底層搜尋與鍵盤導覽實作
