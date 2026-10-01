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
| `pointer-press.ts` | 「按下指標時焦點該不該動」的唯一判準:`isOwnPointerTarget`(容器裡哪些東西自有行為 —— 輸入框 / 按鈕 / 連結照原生,其餘由容器接手;刻意不含 `[tabindex]`)與 `keepFocusOnPointerPress`(焦點握在搜尋框上時,按同一個控件的其他部位 —— 清單、Tag ×、一鍵清空 × —— 焦點不動、click 照常)。2026-09-30 自 `Field/field-wrapper.tsx` 的 `FIELD_CHROME_OWN_TARGET` 搬出,讓選單與觸發欄位共用同一份 | Field 外框 `focusFieldInputFromChrome`(Input / NumberInput / LinkInput 編輯態)/ LinkInput 連結態外框 / Command 根(`components/Command/command.spec.md`「A11y 預設」)/ Select 與 Combobox 觸發欄位(欄位內搜尋框握著焦點時,`components/SelectMenu/select-menu.spec.md`「A11y 預設」Focus 段) | rc-select 清單 mousedown `preventDefault`(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/OptionList.tsx#L79-L81)與選取區按在輸入框以外擋預設(https://github.com/react-component/select/blob/59dd34ad6e216a3935fa2b5c50521cd3f0448567/src/SelectInput/index.tsx#L182-L209)、MUI listbox「Prevent blur」(https://github.com/mui/material-ui/blob/809a7717b4c050ba3f69b75300689f07c050a16e/packages/mui-material/src/useAutocomplete/useAutocomplete.js#L1472-L1479)與根元素 `handleMouseDown`(同檔 #L1316-L1329)、react-select `onMenuMouseDown`(https://github.com/JedWatson/react-select/blob/052e864b4990a67c4ee416851c34d1eb7b58267b/packages/react-select/src/Select.tsx#L1290-L1296) |
| `ime-composition.ts` | 「這一下 keydown 是輸入法組字的一部分」的唯一判準(`isImeComposing`:`isComposing` 或 `keyCode === 229`)。2026-09-30 由七份手寫收成一支(其中三份只看 `isComposing`,欄位內搜尋框轉送給清單的方向鍵 / Enter 完全沒有)。另有 `withImeSafeEscape`(2026-10-01):包在可關閉浮層的 `onEscapeKeyDown` 外面,組字中的 Esc 不關那一層(Radix 在 document 捕獲階段只看 `event.key`,元件自己的 `onKeyDown` 擋不到) | `withImeSafeEscape`:Popover / Dialog / Sheet 的內容元件、FileViewer(直接用 Radix Dialog)—— 經它們涵蓋 SelectMenu(Select / Combobox / PeoplePicker)、CommandDialog、AgentPanel 歷史浮層與改名 / 刪除對話框、DatePicker / TimePicker 浮層、AppShell / Sidebar 窄版抽屜;DropdownMenu / HoverCard / Tooltip 不掛(裡面沒有文字輸入框)。`isImeComposing`:Field 就地編輯鍵(`Field/field-edit-keys.ts`)/ DataTable 格導覽與編輯 Tab / SelectMenu 鍵盤橋接(`forwardKeyToListbox`、開著按 Tab / 空白鍵)/ Select 與 Combobox 觸發欄位 / Command 列上按鈕的鍵盤路 / Sidebar ⌘B / AppShell ⌘. / AgentPanel 輸入框 Enter 送出與改名框 Enter / DatePicker 可打字輸入框 / LinkInput 編輯態 Enter・Esc / NumberInput Enter・Esc / FileViewer 縮放輸入框 Enter / `useFormValidation` 欄位 Esc 還原(後七處 2026-09-30 補:全 DS 文字輸入框上對 Enter / Esc / 方向鍵 / 空白鍵有動作的 keydown 逐一盤點) | MDN「keydown events with IME」(https://github.com/mdn/content/blob/main/files/en-us/web/api/element/keydown_event/index.md#keydown-events-with-ime)、cmdk 搜尋框同判準(https://github.com/dip/cmdk/blob/dd2250ed608443e8f32bafc5fa2d1d07a3746aa3/cmdk/src/index.tsx#L582-L590) |
| `overlay-focus-return.ts` | 「浮層關閉後,焦點還給開啟它的東西」的唯一實作:`captureFocusOrigin`(開啟當下記開啟者)+ `returnFocusToOpener`(掛在 `onCloseAutoFocus`;Radix 有觸發點時只接手指標收起、補 `focusVisible: false`;沒有觸發點時一律還 —— modal 按遮罩收起也還、非 modal 點外面不搶;焦點已被別處接走不搶;開啟者不在了走 fallback)。規則住 `ds-canonical/references/keyboard-model-canonical.md`「關了之後焦點去哪」;2026-09-30 由五份收成一支(另補上 FileViewer 與 AgentPanel 改名 / 刪除對話框) | SelectMenu / AgentPanel 歷史浮層與改名・刪除對話框 / AgentPanel 入口鈕右鍵選單 / CommandDialog / Sidebar 窄版抽屜 / AppShell 窄版側欄 / DatePicker 區間 / FileViewer | Radix Dialog / Popover 自己的 `onCloseAutoFocus`(只還給自己的觸發點,node_modules/@radix-ui/react-dialog 1.1.15 dist/index.mjs:146-149、:176-181);HTML `focus()` FocusOptions `focusVisible`(https://html.spec.whatwg.org/multipage/interaction.html#dom-focus) |
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
