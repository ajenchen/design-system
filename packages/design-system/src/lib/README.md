# lib/ Charter

## 這裡只收:cross-cutting non-visual utility module

每個 lib 子模組提供**跨元件共用、無 visual surface 的 infrastructure / utility**:

- React Context Provider + hook(non-visual cross-cutting feature)
- 純運算 / 格式化 helper(date / number / a11y string)
- TypeScript type module(無 runtime,共用 type-only export)
- 第三方 library 的 thin wrapper(對齊 DS API 風格)

**核心特徵**:沒有 visual surface(不 render UI),但 ≥ 2 個 DS 元件 import 它使用。

---

## 跟 hooks/ / patterns/ / components/ 分權

| Home | 收什麼 | 反例(錯誤 home)|
|------|-------|----------------|
| `lib/{topic}/` | cross-cutting feature module(Provider + hook + types 集合)| 純 hook 一個檔案 → 應 `hooks/use-*.ts` |
| `hooks/use-*.ts` | 單純 stateless hook(無 Context / 無 Provider)| 帶 Provider → `lib/{topic}/` |
| `patterns/{topic}/` | runtime visual primitive(`<Item>` / `<ActionBar>` 等渲染 UI)| 沒 visual surface → `lib/` |
| `components/{Name}/` | user-facing 元件(public API)| internal cross-cutting → `lib/` |

**判斷 flow**:

```
有 visual surface(render UI 元素)?
├─ Yes → 是 user-facing? → components/ : patterns/
└─ No → 是純 stateless hook 一支?
        ├─ Yes → hooks/use-*.ts
        └─ No(Provider + hook + types 一組,或 utility module)→ lib/{topic}/
```

---

## 當前居民

| Module | 提供什麼 | Consumer | 世界級對齊 |
|--------|---------|----------|-----------|
| `i18n/` | `<I18nProvider>` + `useI18n()` hook + `I18nLabels` types(opt-in context-based label catalog,additive 與 prop API 並存)| 全 DS 元件 opt-in consumer | Material `@mui/material/locale` / Ant `<ConfigProvider locale>` / Carbon `<PrefixContext>` 共識:i18n 是 utility/locale module 非 visual pattern |
| `roving-list-keyboard.ts` | 「列上有小按鈕的一串」鍵盤路線的唯一判定(`resolveRovingKey` 純函式)+ 落點 / Tab 停靠點(`pickRovingTarget` / `pickRovingTabStop`)+ 真焦點宿主的執行器(`applyRovingAction`)+ 列裡可走到的東西(`listRovingControls`)與文字輸入判準(`isTextEntryElement`)。規則住 `ds-canonical/references/keyboard-model-canonical.md`「列上有小按鈕的一串」;2026-09-26 由四份平行實作合一 | Sidebar(SidebarMenu)/ FileUpload(檔案清單)/ TreeView / Command;`isTextEntryElement` 另有 `hooks/use-input-modality.ts`、SelectMenu 鍵盤橋接 | W3C APG grid / treegrid「一組一站 + 方向鍵」、Adobe React Aria GridList(→ 進列內、Tab 整串離開)、Fluent List |
| `pointer-press.ts` | 「按下指標時焦點該不該動」的唯一判準:`isOwnPointerTarget`(容器裡哪些東西自有行為 —— 輸入框 / 按鈕 / 連結照原生,其餘由容器接手;刻意不含 `[tabindex]`)與 `keepFocusOnPointerPress`(焦點握在搜尋框上時,按同一個控件的其他部位 —— 清單、Tag ×、一鍵清空 × —— 焦點不動、click 照常)。2026-09-30 自 `Field/field-wrapper.tsx` 的 `FIELD_CHROME_OWN_TARGET` 搬出,讓選單與觸發欄位共用同一份 | Field 外框 `focusFieldInputFromChrome`(Input / NumberInput / LinkInput 編輯態)/ LinkInput 連結態外框 / Command 根(`components/Command/command.spec.md`「A11y 預設」)/ Select 與 Combobox 觸發欄位(欄位內搜尋框握著焦點時,`components/SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段)/ AgentPanel 輸入盒外框與附件「+N」浮出清單(textarea 握著焦點時按附件 ×、+、送出、停止焦點不動;2026-10-01 待辦總帳 OE30,`components/AgentPanel/agent-panel.spec.md`「AgentPromptInput」) | rc-select 清單 mousedown `preventDefault`(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/OptionList.tsx#L79-L81)與選取區按在輸入框以外擋預設(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/SelectInput/index.tsx#L182-L209)、MUI listbox「Prevent blur」(https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1472-L1479)與根元素 `handleMouseDown`(同檔 #L1316-L1329)、react-select `onMenuMouseDown`(https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/Select.tsx#L1290-L1296) |
| `ime-composition.ts` | 「這一下 keydown 是輸入法組字的一部分」的唯一判準(`isImeComposing`:`isComposing` 或 `keyCode === 229`)。2026-09-30 由七份手寫收成一支(其中三份只看 `isComposing`,欄位內搜尋框轉送給清單的方向鍵 / Enter 完全沒有)。2026-10-01 上午曾另有 `withImeSafeEscape`(浮層的 `onEscapeKeyDown`:組字中的 Esc 不關那一層),同日下午併進 `overlay-escape.ts`(下一列),本檔只剩判準 | Field 就地編輯鍵(`Field/field-edit-keys.ts`)/ DataTable 格導覽與編輯 Tab / SelectMenu 鍵盤橋接(`forwardKeyToListbox`、開著按 Tab / 空白鍵)/ Select 與 Combobox 觸發欄位 / Command 列上按鈕的鍵盤路 / Sidebar ⌘B / AppShell ⌘. / AgentPanel 輸入框 Enter 送出與改名框 Enter / DatePicker 可打字輸入框 / NumberInput Enter・Esc / FileViewer 縮放輸入框 Enter / `useFormValidation` 欄位 Esc 還原 / `overlay-escape.ts` 守門的第一步(後八處 2026-09-30 補:全 DS 文字輸入框上對 Enter / Esc / 方向鍵 / 空白鍵有動作的 keydown 逐一盤點;LinkInput 2026-10-01 起經 `Field/field-edit-keys.ts`) | MDN「keydown events with IME」(https://github.com/mdn/content/blob/main/files/en-us/web/api/element/keydown_event/index.md#keydown-events-with-ime)、cmdk 搜尋框同判準(https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L582-L590) |
| `overlay-escape.ts` | 「這一下 `Esc` 由誰處理」的唯一判定(2026-10-01;規則 `ds-canonical/references/keyboard-model-canonical.md`「`Esc` 一次只關最內層」+「焦點所在的控件自己那一層也算一層」):`withOverlayEscape`(浮層守門:組字中不關;焦點所在控件在這一層裡宣告了 `data-escape-layer` 就留給控件、不關 —— 派送完沒有控件認領就重新派一次、照常關,宣告了卻沒人處理不會困住使用者(2026-10-07);其餘照舊)、`escapeLayerProps` / `ESCAPE_LAYER_ATTR`(控件宣告「我還有一層」)、`isEscapeForControl`(控件在要動作的那條路上問:沒人動過或守門留給我的才動作,回 true 即認領;Radix 已用掉的不動)、`isEscapeTakenElsewhere`(只看不認領)、`markEscapeHandled` / `claimEscape`(拖曳獨占)、`useEscapeRegion`(AgentPanel 分區:焦點在面板內且面板內沒有浮層 → 什麼都不關;2026-10-01 從 agent-panel.tsx 的 window 捕獲監聽搬來) | 守門:Popover / Dialog / Sheet 的內容元件、FileViewer(直接用 Radix Dialog)—— 經它們涵蓋 SelectMenu(Select / Combobox / PeoplePicker)、CommandDialog、AgentPanel 歷史浮層與改名 / 刪除對話框、DatePicker / TimePicker 浮層、AppShell / Sidebar 窄版抽屜。宣告 + 判斷:`useFormValidation`(欄位改過)、`Field/field-edit-keys.ts`(InlineEdit、DataTable 格編輯器、LinkInput)、DatePicker 可打字欄位(草稿)、DataTable 表格根(格游標 / 列選取,`self`)、Calendar 事件方塊、`drag-announcements.ts`(拖曳中)。只判斷不宣告:Select / Combobox / DatePicker / TimePicker 觸發欄位。分區:AgentPanel | W3C APG dialog(https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/dialog-modal/dialog-modal-pattern.html#L73)/ grid(https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/grid-pattern.html#L341-L344)/ combobox(https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/combobox/combobox-pattern.html#L133-L136);React Aria useSearchField(https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/searchfield/useSearchField.ts#L80-L89);MUI useAutocomplete(https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1072-L1089);Primer useOnEscapePress(https://github.com/primer/react/blob/f2c075a5d4d0b51a279c39effa18226ad909929d/packages/react/src/hooks/useOnEscapePress.ts#L7-L15);Radix 捕獲階段收 Esc(https://github.com/radix-ui/primitives/blob/d8b1ffadc6fe0bd2486816751953dfadf14b3357/packages/react/use-escape-keydown/src/use-escape-keydown.tsx#L19) |
| `collection-removal-focus.ts` | 「集合裡的一項被移除後,焦點交給誰」的唯一實作(`focusAfterCollectionRemoval`:焦點會跟著被移除的東西消失才動 → 下一顆 × → 前一顆 → owner;以被移除的那顆為基準;剩 1 項換結構時 commit 後再套一次;焦點已被別處接走不搶)。2026-10-01 由 Combobox `focusAfterTagRemoval`、FileUpload `focusAfterFileRemoval`、AgentPanel 輸入盒附件列(原本一份都沒有,待辦總帳 OE30)三份收成 | Combobox Tag ×(含 +N 浮出清單裡的 ×;PeoplePicker 頭像 Tag 經同一條)/ FileUpload 檔案清單的 × / AgentPanel 輸入盒附件 ×;規則 `components/Combobox/combobox.spec.md`「Tag 操作 › 個別移除」 | React Aria TagGroup 移除後焦點給下一個 / 上一個 Tag、都沒有則回欄位(https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/tag/useTagGroup.ts#L143-L150);rc-select 清空後聚焦容器(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L711-L721) |
| `composite-field-focus.ts` | 「觸發欄位 + 它的彈出層 = 同一個欄位」的唯一判準(`compositeFieldBlur`:焦點只是搬進自己的彈出層、或在欄位的零件之間移動 → 不算離開;真的離開才轉呼叫 consumer 的 `onBlur` 一次;`isWithinCompositeField`)。2026-10-01 待辦總帳 N83:一開清單 / 日曆 / 面板,接 `useFormValidation` 的欄位就 blur、必填錯誤在還沒選任何東西時就長出來 | Select(桌機觸發區)/ Combobox 觸發區(含「+N」浮出清單,經 `extra`)/ DatePicker(觸發區與可打字欄位)/ TimePicker;規則 `components/Field/form-validation.spec.md` v1 邊界 (a) | React Aria useSelect 觸發鈕 blur 在選單開著時 return、選單 blur 只在焦點去了選單外才轉出(https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/select/useSelect.ts#L244-L251、#L271-L278)/ useComboBox「Ignore blur if focused moved … into the popover」(https://github.com/adobe/react-spectrum/blob/956ecbcb8803f0d0d5d5d973bb169d70c52aea02/packages/react-aria/src/combobox/useComboBox.ts#L269-L280);rc-select `getSelectElements` = 容器 + 彈出層(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/BaseSelect/index.tsx#L570-L573) |
| `overlay-focus-return.ts` | 「浮層關閉後,焦點還給開啟它的東西」的唯一實作:`captureFocusOrigin`(開啟當下記開啟者)+ `returnFocusToOpener`(掛在 `onCloseAutoFocus`;Radix 有觸發點時只接手指標收起、補 `focusVisible: false`;沒有觸發點時一律還 —— modal 按遮罩收起也還、非 modal 點外面不搶;焦點已被別處接走不搶;開啟者不在了走 fallback)。規則住 `ds-canonical/references/keyboard-model-canonical.md`「關了之後焦點去哪」;2026-09-30 由五份收成一支(另補上 FileViewer 與 AgentPanel 改名 / 刪除對話框)。**2026-10-01 加 `useTriggerlessFocusReturn`**(DialogContent / SheetContent 的預設:內容掛上時記開啟者、沒有 Radix 觸發點就還;待辦總帳 OE29)與 `persistentOpenerOf`(開啟者住在會跟著關掉的選單 / 浮層裡 → 改記那個選單的觸發鈕;`radixTriggerOf` 找 `aria-controls` 指向 content 的觸發點) | **DialogContent / SheetContent 預設**(涵蓋所有受控、沒有觸發點的對話框 / 側板;CommandDialog 2026-10-01 改用預設)/ SelectMenu / AgentPanel 歷史浮層與改名・刪除對話框 / AgentPanel 入口鈕右鍵選單 / Sidebar 窄版抽屜 / AppShell 窄版側欄 / DatePicker 區間 / FileViewer | Radix Dialog / Popover 自己的 `onCloseAutoFocus`(只還給自己的觸發點,node_modules/@radix-ui/react-dialog 1.1.15 dist/index.mjs:146-149、:176-181);HTML `focus()` FocusOptions `focusVisible`(https://html.spec.whatwg.org/multipage/interaction.html#dom-focus) |
| `focus-after-trigger.ts` | 「彈出框開著按 Tab:收起,焦點從觸發點往下 / 往上走一站」的唯一落點計算(`tabStopFromTrigger` / `focusFromTrigger` / `tabbableOrder`)。規則住 `keyboard-model-canonical.md`「彈出框開著時的 Tab 與 Esc」;2026-09-26 由兩份合一 | DropdownMenu(`dropdown-menu-keyboard.ts`)/ SelectMenu(`select-menu-keyboard.ts`) | W3C menu「close all menus and submenus」、W3C 單選下拉 Tab、Fluent「tab to next element after the root trigger」 |

---

## 命名鐵律

- 子目錄名 kebab-case(對齊 components/ / patterns/)
- 入口 module 名描述功能(`i18n-context.tsx` / `formatters.ts`),非 generic 名(`utils.ts` / `helpers.ts` 違反 — 後者該歸到 `src/lib/utils.ts` 專案級)
- 違反 → audit Dim 19 home-name-vs-scope 抓

---

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 「`cn()` Tailwind 合併」工具 | `src/lib/utils.ts` | shadcn 慣例 home,專案級非 DS 內部 |
| 「`useControllable` 雙模式 hook」 | `packages/design-system/src/hooks/use-controllable.ts` | 純 stateless hook,無 Context |
| 「Toast 行為 primitive(渲染 UI)」 | `packages/design-system/src/patterns/{name}/` | 有 visual surface |
| 「formik / react-hook-form 整合」 | 不在 DS scope | DS 不耦合 form library;consumer 自己 wire |

---

## 新增 lib module 的 criteria(必須全部通過)

1. **無 visual surface**(不 render UI 元素;Context Provider 例外因 wrap children)
2. **≥ 2 個 DS 元件消費**(spec / README 必列 consumers)
3. **≥ 3 家世界級對照**(MUI / Polaris / Ant / Carbon / Material 任一以上)
4. **不適合 hooks/**(超過單一 stateless hook,有 Provider / types / multi-file 結構)

---

## 為什麼新建這個 home(2026-05-01)

i18n-context 原放 `patterns/i18n/`,但 patterns/ 定義是「runtime visual primitive」,i18n 無 visual surface(只是 Context + hook + types)→ home-name-vs-scope 不符(audit Dim 19 抓到)。

世界級三家共識:**i18n 是 utility / locale module,不是 visual pattern**:
- Material `@mui/material/locale` 是 utility sub-package
- Ant `<ConfigProvider locale>` 是 provider config 非 visual element
- Carbon `<PrefixContext>` 是 DI module 非 visual primitive

新建 `lib/` 為這類 cross-cutting non-visual primitive 留 home,patterns/ 純化只收 visual primitive。
