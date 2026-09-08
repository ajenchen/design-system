---
component: SelectMenu
family: composite # 2026-07-14 修自我矛盾:原 Phase-1 mechanical 填 4,與 body「Layout Family:非上述 family — composite / multi-section」矛盾;Family 4 是 trigger 側 field control(Select / Combobox)的事
variants: {}
sizes: {}
traits:
  - isInputLike
  - isInternal
benchmark:
  - Polaris Listbox: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Listbox
  - Radix Select primitive: github.com/radix-ui/primitives/tree/main/packages/react/select
  - MUI Material Select (controlled/uncontrolled API): mui.com/material-ui/api/select/
  - Ant Design DatePicker (value/defaultValue API): ant.design/components/date-picker
---

# SelectMenu 設計原則

## 定位

SelectMenu 是 **Popover + Command 組成的完整下拉選單浮層**——提供搜尋 + 鍵盤導覽 + 分組 + 可建立新選項，作為**選值類**元件的 internal primitive（不直接使用）。

**實作基礎**：基於 cmdk（搜尋 / 鍵盤導覽）+ shadcn Popover（浮動容器）+ 消費 MenuItem primitive（item 佈局）。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式——**scope 限 value 軸**:value 軸走 `value` + `onValueChange`(型別宣告 optional、無 runtime 強制,但 internal 消費者 Select / Combobox / PeoplePicker 一律傳入),不支援 `defaultValue` uncontrolled fallback。open 軸自 2026-06-11 R2 起走 `useControllable` dual-mode(`open` + `defaultOpen` + `onOpenChange`,`select-menu.tsx:187-191`),不在 controlled-only 範圍。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- value 軸由外層選值元件持有；SelectMenu 不再建立第二份可漂移的 selection state，因此刻意不開 uncontrolled fallback

**若未來 value 軸要改 dual-mode**:DS 已有 `useControllable` helper(open 軸與 Select 皆已消費),另需測試 controlled↔uncontrolled switch 場景,屬 major API 擴充。

---

## 何時用 / 何時不用

**SelectMenu 是 internal primitive**——不直接使用，透過外層選值元件消費。

| 場景 | 正確做法 |
|------|---------|
| 人員選擇器（搜尋 + Avatar）| 用 `PeoplePicker`（內部消費 SelectMenu）|
| 大量選項單選 + 搜尋 | 用 `Select` with `searchable`（內部會切換到 SelectMenu 模式）|
| 大量選項多選 + 搜尋 | 用 `Combobox` with `searchable`（內部會切換到 SelectMenu 模式）|
| 可建立新選項（creatable tag）| 用 `Combobox` + `creatable` prop |
| 直接在 JSX 中用 `<SelectMenu>` | ❌ **禁止**——失去外層 Select / Combobox / PeoplePicker 的 Field 整合、trigger 行為、state 管理 |

### 消費者

- `../Select/select.tsx` — `searchable` 模式會切換到 SelectMenu 浮層（直接 import）
- `../Combobox/combobox.tsx` — `searchable` 模式會切換到 SelectMenu 浮層（直接 import）
- `../PeoplePicker/people-picker.tsx` — 人員選擇（永遠 searchable;**間接消費** — wrap Select / Combobox,不直接 import SelectMenu,見 `people-picker.spec.md`「實作基礎」）

**常見誤解**:(1)「要下拉浮層就 import SelectMenu」— internal primitive,一律經 Select / Combobox / PeoplePicker 消費(見上表);(2)「SelectMenu = DropdownMenu」— SelectMenu 是**選值**(值留在 field),DropdownMenu 是**執行動作**(點完即關)— 分界 SSOT 見 `dropdown-menu.spec.md`「與 SelectMenu 的區別」。

---

## 架構

```
Popover（浮動容器，handle 展開 / 定位）
  └─ Command（cmdk — 搜尋 + 鍵盤導覽）
       ├─ 搜尋框（DS `CommandInput`,與 CommandDialog / inline Command 共用同一份實作,2026-09-08 起;searchable 模式時顯示；選項 > 5 時建議開啟）
       ├─ CommandList（捲動區）
       │    ├─ CommandGroup（分組標題;0 筆選項的群組不畫,`select-menu.tsx:408`）
       │    │    └─ MenuItem（選項 row，消費 item-layout）
       ├─ CommandEmpty（在 CommandList 外、listbox 的兄弟 —— axe 不允許 listbox 內有非 option 子元素,MUI 同構;清單裡沒有任何可顯示的選項時才出現:MenuGroup 包一列 `MenuItem message` —「沒有選項」或載入列 `CommandLoading`,見「Empty state」「Loading」）
       └─ Footer（多選全選 checkbox，選填）
```

**定位**:SelectMenu 的 `sideOffset` 與 `align` 直接走 Popover canonical——`sideOffset=8` / `align` 跟隨 trigger 位置(見 `../Popover/popover.spec.md`「Align 對齊 canonical(跨浮層 SSOT)」)。SelectMenu 不自訂浮層定位規則。

**視覺 vs 語意**(2026-04-20 精緻化):SelectMenu 的預設 `min-width = max(trigger width, 240px)`；trigger ≥ 240px 時與 trigger 同寬，較窄 trigger 會擴至 240px。寬度相等時 `start` / `end` 兩種 align 呈現視覺相同；popover 寬於 trigger 時，align 差異才會顯現，並嚴格遵守 structured overlay canonical(trigger 在左 → start / 右 → end)。(SelectMenu `align` prop 僅暴露 `'start' | 'end'`,不開放底層的 `center`。)

換言之 SelectMenu **永遠照 canonical**；只有 trigger ≥ 240px 且未再提高 `minWidth` 時，等寬會讓 align 差異被視覺遮蔽。一旦 popover 寬於 trigger，canonical 立即顯現。

---

## 單選 vs 多選

透過 `multiple` prop 決定（`value` 型別只被 normalize 成內部 `selectedValues`，不參與模式判斷）：

- **單選**（`multiple={false}`，預設）：`value: string | null`，選中後立即關閉浮層
- **多選**（`multiple={true}`）：`value: string[]`，選中不關閉，可繼續選（footer 可顯示全選 checkbox）

---

## Creatable（建立新選項）

透過 `creatable` + `onCreate` 啟用。search 非空且**無 label 完全相同(忽略大小寫)的既有選項**時,顯示 create row(`Plus` icon + `createLabel(query)`,預設「直接使用「xxx」」,`select-menu.tsx:164`;顯示/隱藏判斷 `:261-266`,render `:471-495`)——完全同名時自動隱藏,防重複建立。

**何時啟用**：
- Tag input 允許使用者建立新 tag
- Assignee 選擇允許邀請外部人員
- Label / category 自由建立

**何時不啟用**：
- 固定選項清單（狀態、類別、角色）
- 需要後端驗證合法性的 value（避免建立無效選項）

---

## 分組（group）

透過 `groups` prop 定義分組標籤，每個 option 的 `group` 欄位指向 group key。

**何時使用**：
- 選項明顯分兩個以上邏輯群組（「Recent」/「All」、「Your team」/「Others」）
- 超過 10 個選項需要視覺分區降低認知負擔

**何時不用**：
- 選項少於 6 個（分組反而增加視覺雜訊）
- 選項本質平行（沒有自然分組）

---


**群組之間的分隔線由 CommandGroup 自己畫**(item-anatomy.spec.md「Group auto-separation」:consumer 不手插 Separator):CommandGroup 用「前面還有另一個看得見的群組」的兄弟選擇器畫上邊線(cmdk 把被搜尋濾掉的群組留在 DOM、加 `hidden`,所以排除 `[hidden]`)。2026-09-08 修:原本 SelectMenu 手插 `<CommandSeparator>`,cmdk 在搜尋字非空時不渲 Separator → 搜尋時可見群組之間沒線。機械閘 M9:兩組可見恰好一條線、搜尋剩一組沒有線。
## 遠端搜尋(`filterOption` / `onSearchChange`,2026-09-08 user 拍板「併」)

預設 `filterOption = true`:有搜尋列時在本機用搜尋字過濾(cmdk `shouldFilter`)。**遠端搜尋**(每打一個字向伺服器抓、伺服器已經過濾好)傳 `filterOption={false}`:對應 cmdk `shouldFilter={false}`(README「Filter/sort items manually? Yes. Pass `shouldFilter={false}`」),行為與 react-select 非同步模式(`filterOption: null`,`useAsync` stale-while-loading)/ Ant `filterOption={false}` 同款 —— 舊結果原封留著、伺服器回什麼列什麼,不再被新的字二次過濾(本機過濾會把伺服器用別名命中的結果藏掉)。搜尋字由 `onSearchChange` 回呼(含清空),consumer 據此抓資料並切 `loading`。Select / Combobox / PeoplePicker 三個消費者都轉發這兩個 prop(`select.tsx` / `combobox.tsx` / `people-picker.tsx`)。機械閘:`scripts/menu-message-row-invariant.mjs` M8(打本機對不到的字 → 舊清單原封留著、搜尋列轉圈亮;後端回來清單才換)。

## Empty state

**2026-09-08 user 拍板**:選單裡「不是選項的列」一律走 MenuItem 的列幾何。搜尋無結果 / 打開就沒選項 → 一列 **`<MenuItem message>`**,由 `CommandEmpty` own(`command.tsx:155-172`:字串 children 自動包成 `MenuGroup` + `MenuItem message`),consumer 只傳文案;SelectMenu / AgentPanel 歷史清單 / CommandDialog / inline Command 全部同一份。

**訊息列規格**(`menu-item.tsx:200-219`;樣式 owner `../Menu/menu-item.spec.md`「Message row(訊息列)」):
- 非互動:`role="presentation"` + `pointer-events-none`;次要色 `text-fg-muted`;一般字重(medium 是群組標題的辨識訊號,訊息列不用);內容水平 + 垂直置中
- 列幾何與選項**完全相同**(`ROW_PADDING_BY_SIZE`,`item-anatomy.tsx:145-149`:`py = (field-height − 1lh) / 2`;字級 sm/md `text-body`、lg `text-body-lg`),所以一列高 = `--field-height-{size}`(sm 28 / md 32 / lg 36,`tokens/uiSize/uiSize.css:23-26`)
- 住在 `MenuGroup`(`py-2` 上下各 8px,`../Menu/menu-item.spec.md`「Group」):**md 浮層高 = 8 + 32 + 8 = 48px,與 1 筆結果等高**;sm 44 / lg 52。density 切換跟著 token 走
- **沒有任何最小高度**:舊的 `minRows` / `getMenuListMinHeight` 已移除(`field-types.ts:88-90` 退役註解);0 筆與 1 筆一樣高,不撐 3 列
- 不放圖示、**不用 `Empty` 元件**:Empty 是頁面 / 區塊層級「有解釋、可帶圖示與動作」的空狀態(`../Empty/empty.spec.md`「何時用」);選單裡的 0 筆只是一句提示

**文案**:一句到底、consumer 可用 `emptyText` 覆寫。SelectMenu 預設「沒有選項」(`select-menu.tsx:167`,對應 No options;打開就沒選項與搜尋無結果共用同一句);PeoplePicker 預設「沒有人員」(`../PeoplePicker/people-picker.spec.md`「搜尋」)。

**歷史**(同一題四次換皮,錨在 `command.tsx:152`):2026-04-08 一行小字 → 04-10 撐 3 列 `minRows`(`field-types.ts:89`,當時只寫「視覺一致」)→ 04-16 改用 `Empty` 元件 → **09-08 訊息列**(本段)。世界級對照(2026-09-08 逐行實查原始碼):MUI Autocomplete 的 `noOptions` / `loading` 都是一個 `padding: '14px 16px'` + `text.secondary` 的單列文字([Autocomplete.js](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Autocomplete/Autocomplete.js) `AutocompleteNoOptions` / `AutocompleteLoading`);react-select 的 `NoOptionsMessage` / `LoadingMessage` 共用 `noticeCSS`:`textAlign: 'center'`、`neutral40`、`padding: 8px 12px`(`baseUnit` = 4,[Menu.tsx](https://github.com/JedWatson/react-select/blob/master/packages/react-select/src/components/Menu.tsx) + [theme.ts](https://github.com/JedWatson/react-select/blob/master/packages/react-select/src/theme.ts));Ant Design 的 `-item-empty` 直接 spread 選項列的 `genItemStyle`(`minHeight: optionHeight` = `controlHeight`),只把色換成 `colorTextDisabled`([dropdown.ts](https://github.com/ant-design/ant-design/blob/master/components/select/style/dropdown.ts) + [token.ts](https://github.com/ant-design/ant-design/blob/master/components/select/style/token.ts))。三家都是「一行字 + 自家一列的留白」,**沒有任何一家撐 3 列**;本 DS 取 Ant 的做法——0 筆 = 一列選項的幾何。

- **Creatable 時**:即使搜尋無結果,仍顯示 create row 讓使用者補建選項(顯示條件見「Creatable」段)
- **非 creatable**:顯示 emptyText 提示使用者修改搜尋詞
- **SR 播報**(2026-07-05 D4;2026-09-08 搬進 Command):0 筆經 `CommandEmptyStatus`(visually-hidden `role="status"` + `aria-live="polite"`,`command.tsx:197-203`)播報 emptyText——訊息列本身與 cmdk CommandEmpty 都是 `role="presentation"`,SR 原本聽不到 0 結果;loading 則由可見的 `CommandLoading` 訊息列自帶 `role="status"` 播報文字,`CommandEmptyStatus` 在 loading 時不重複播(`command.tsx:201`)。SSOT 在 Command 一處,SelectMenu / Select / Combobox / PeoplePicker 全體受益。

---

## Loading（2026-05-15 audit B 加;2026-09-08 user 改決定:兩處載入指示）

非同步載入選項時,consumer 傳 `loading={true}`(`select-menu.tsx:107`),SelectMenu 分兩處表達:

- **(a) 搜尋列右側,每次抓資料都亮**:`CommandInput loading`(`command.tsx:82,95,110`)在搜尋框右側放列圖示尺寸的 `CircularProgress`(`ICON_SIZE[size]`:sm/md 16、lg 20),wrapper `aria-busy`,**仍可打字**——同 Input `loading` 的 canonical(`../Field/field-controls.spec.md`「Loading state」)。SelectMenu 於 `select-menu.tsx:385` 轉發。非 searchable 路徑沒有搜尋列,載入指示在 consumer 的觸發點:Select / Combobox / PeoplePicker 在 ChevronDown 左邊放同尺寸轉圈(`../Select/select.spec.md`「Loading」/ `../Combobox/combobox.spec.md`「Loading」)
- **(b) 選單內,只在「清單裡沒有任何可顯示的選項」時**:Empty 槽渲 `<CommandLoading label={loadingText} />`(`select-menu.tsx:402-404`;`command.tsx:182-188`)= 與「沒有結果」同一種 `MenuItem message` 訊息列,前綴槽放列圖示尺寸的轉圈 + 可見文字 `loadingText`(預設「載入選項中」,`select-menu.tsx:168`,可覆寫),`role="status"` 直接播報文字。listbox 同時標 `aria-busy`(`select-menu.tsx:396`)
- **Trigger 不變**:dropdown 隨時可開(user 看 chevron 不會被 disable)
- **選單不關、舊選項不清空**:已有 options 時 (b) 不出現,列表照舊可選,避免背景更新期間抹掉仍可用的結果。MUI Autocomplete 只在 `renderedOptions.length === 0` 才渲 `loadingText`([Autocomplete.js](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Autocomplete/Autocomplete.js) `AutocompleteLoading` 分支);react-select `renderMenu` 先 `hasOptions()` 畫選項、沒選項才依 `isLoading` 渲 `LoadingMessage`([Select.tsx](https://github.com/JedWatson/react-select/blob/master/packages/react-select/src/Select.tsx) `renderMenu`)——兩家原始碼與本段行為同構

**2026-09-08 user 改決定**:原 2026-07-04 Q3 的「panel-center 48px `CircularProgress` + `py-6` named status wrapper」退役——載入列改走與「沒有結果」同一種訊息列(md 48px = 8 + 32 + 8,見「Empty state」),轉圈縮到列圖示尺寸;仍**不經 Empty**(`../Empty/empty.spec.md`「禁止事項」spinner-only loading 不用 Empty)。

**消費**:Select / Combobox / PeoplePicker 都轉發 `loading`(PeoplePicker 2026-09-08 補,`../PeoplePicker/people-picker.spec.md`「Loading」);本元件封裝 (a)(b) 兩處。

---

## 禁止事項

- ❌ 直接在 JSX 用 `<SelectMenu>`——透過外層元件（Select / Combobox / PeoplePicker）消費
- ❌ 跳過 SelectMenu 自建 Popover + Command 組合——會漂移出共用 layout 與 item-layout 規則
- ❌ 不搭配 trigger / field 使用——SelectMenu 是浮層，一定需要觸發元件
- ❌ 超過 50 個選項不開搜尋——純捲動會變低效
- ❌ 分組少於 2 組——分組本身是視覺成本，只有一組等於沒分組

---

## 邊界案例

- **Disabled option**:individual MenuItem 透過 `disabled?: boolean` 控制(SelectMenu primitive option contract)。視覺繼承 `MenuItem` SSOT:text → `text-fg-disabled`(M24)、無 hover bg、`aria-disabled="true"`、Enter / click 不觸發 onChange、鍵盤導覽自動 skip。
- **Disabled trigger**:trigger 由 consumer(Select / Combobox / PeoplePicker)的 `disabled` prop own,本元件不獨立 disable trigger。
- **Loading**:已 codify(見「Loading」段),搜尋列 / 觸發點右側轉圈每次都亮;`loading=true` 且無可顯示選項時 Empty 槽渲 `CommandLoading` 訊息列(列圖示尺寸轉圈 + loadingText;舊選項保留、選單不關)。
- **Empty**:已 codify(見「Empty state」段),搜尋無結果 + 非 creatable 時渲一列 `MenuItem message` 的 emptyText(與 1 筆結果等高,無最小高度);creatable 時保留 create row(可鍵盤選取)。
- **Creatable + search 與既有選項完全同名**(忽略大小寫):create row 隱藏(防重複建立,`select-menu.tsx:261-266`);選取既有選項為唯一路徑。
- **Dark mode**:走 Popover / MenuItem semantic token 自動 adapt。
- **Density**:row height 由 `MenuItem` SSOT 控(sm/md/lg);SelectMenu 不獨立 own density。
- **大量選項(> 100)**:建議上游分頁 / 搜尋收斂或考慮 windowing(對齊 Ant Select / MUI Autocomplete 慣例);本元件無虛擬化。

---

## 為何無 ColorMatrix

SelectMenu 是**多區塊 composite primitive**,色彩全數消費 DS semantic token、不新增 token;但 2026-07-05 D4 後互動色的 **owner 分層**如下(修正舊述「視覺完全繼承內層 primitive」):

- **surface / border / elevation**:`PopoverContent` 自設 `bg-surface-raised` + `border-border` + `--elevation-200`(`select-menu.tsx:308-320`)。
- **hover / selected 互動 bg**:owner 是**外層 cmdk `CommandItem`** —— 反白依模態分流(指標模態 `data-[selected=true]:bg-neutral-hover` = hover;鍵盤模態 `data-[selected=true]:focus-ring-inset` = 游標畫框、不上底色;focus-canonical 規則二,user 2026-09-09 拍板)+ 單選 persistent selected `bg-neutral-selected`;**選中 × 疊加走 `item-anatomy.spec.md`「選中 × 互動疊加」格(2026-08-11)**:滑鼠 hover 釘住不變、鍵盤游標的框疊在選中底色上(2026-09-07 起,鏡射 DropdownMenu 同格)。
- **內層 `MenuItem`**:強制 `!bg-transparent` 純視覺排版(`select-menu.tsx:460` 選項列 / `:489` create 列),不 own 互動 bg。

**無 ColorMatrix 的理由不變**:上述全是既有 token family(`neutral-hover / neutral-selected`,與 DropdownMenu / MenuItem 同組;鍵盤游標(選中與否)一律走框不走底色),SelectMenu 不擁有獨立色彩決策;加 ColorMatrix 只會重複 MenuItem / DropdownMenu / Popover 的矩陣。

對應 anatomy story:保留 `Overview` / `Inspector` / `SizeMatrix` / `StateBehavior`,額外追加元件特有的 `ModeMatrix`(single / multi / searchable / creatable / grouped 等功能組合矩陣,這是 SelectMenu 真正的決策面向——取代 ColorMatrix)。

---

## shadcn passthrough 例外說明

SelectMenu 是 **composite**(Popover trigger + Command search + 滾動 MenuItem list + 浮動 surface),純 declarative API。**套 `forwardRef` 簽名但 ref 不附著、無 `...props` spread**(shadcn forwardRef + displayName 統一;`select-menu.tsx:151-154` rationale):

- **沒有單一 DOM root 可 ref**:trigger / search input / list / content portal 各自 DOM tree 離散
- **`...props` spread 目標不明**:composite 的 root wrapper 只是 control 容器,spread 到那裡 consumer 無從預期作用
- **API 邊界明確**:SelectMenu 暴露「選值」語意(value / onValueChange / options / mode),不暴露 DOM 細節
- **`className` 合併到 PopoverContent**(contextually 最接近 user-facing surface)

`displayName = 'SelectMenu'` 保留。若 consumer 需要 DOM-level 控制(custom trigger / portal / search input ref),改用底層 Popover + Command 自組。

`asChild` 不支援(composite 非 Slot-compat)。

---

## Option schema 增項紀錄

- `iconClassName?`(2026-07-08):option icon 染色通道(status 類彩色選項;WM 戰役——原窄 schema 逼 consumer 手刻 bare trigger)。disabled 色仍勝出(menu-item.tsx 順序保證)。

## 相關

- `../Menu/menu-item.spec.md` — 選項 row 的 item-layout 共用規則（SelectMenu 消費 MenuItem）
- `../Popover/popover.tsx` — 浮動容器（SelectMenu 消費）
- `../Command/command.tsx` — cmdk 搜尋 + 鍵盤導覽（SelectMenu 消費）
- `../Empty/empty.spec.md` — 2026-09-08 起 SelectMenu **不再消費 Empty**(選單訊息列走 MenuItem message);留此連結只為近親分界(Empty = 頁面 / 區塊層級空狀態)
- `../Select/select.spec.md` — 主要消費者之一（searchable 時切換到 SelectMenu）
- `../Combobox/combobox.spec.md` — 主要消費者之一（searchable 多選時切換到 SelectMenu）
- `../PeoplePicker/people-picker.spec.md` — 永遠使用 SelectMenu 的消費者
- `../../patterns/element-anatomy/item-anatomy.spec.md` — item-layout pattern（MenuItem 繼承）

## A11y 預設

**ARIA / Pattern**:基於 `cmdk` library a11y(combobox / listbox / option role + aria-activedescendant)。詳 [cmdk a11y](https://cmdk.paco.me/#accessibility)。選項 row 的內層 `MenuItem` 傳 `role="presentation"`(cmdk CommandItem 是唯一 option 節點,避免 option 巢狀 option + 內外 `aria-selected` 語意相反;鏡射 DropdownMenu canonical,2026-07-05 D4)。分組標題走 cmdk `CommandGroup heading`(自動產 `cmdk-group-heading` id,選項容器 `role="group"` + `aria-labelledby` 指向之,AT 可感知);combobox accessible name 來自 `Command label`(= `searchAriaLabel`,default「搜尋選項」,僅 searchable 時傳)，與可見 `searchPlaceholder` 分離；listbox 容器經 cmdk `List label` 預設「選項」取代 cmdk 內建英文 "Suggestions"(2026-07-06)。多選 footer 全選列為 `role="checkbox"` + `aria-checked`(indeterminate → `"mixed"`)。空狀態經 visually-hidden `role="status"` + `aria-live="polite"` live region(`CommandEmptyStatus`)對 SR 播報,loading 由可見的 `CommandLoading` 訊息列 `role="status"` 播報(cmdk CommandEmpty 與訊息列都是 `role="presentation"`,SR 原本聽不到;2026-07-05 D4,2026-09-08 搬進 Command)。

**Keyboard 行為**:

- Tab — focus trigger
- Enter / Space — 開啟 menu(trigger 由 consumer 經 `PopoverTrigger asChild` 提供,開啟行為由 consumer trigger 負責:Select / Combobox 的 trigger 是 `role="combobox"` 容器,自綁 Enter / Space handler 觸發開啟;若 consumer 用 DS `<Button>`(native button)則由 native click 觸發)
- ↑/↓ — 導覽 options(menu 開啟後)
- Enter — 選擇
- 字母鍵 — type-ahead 過濾(search 模式)
- Tab(menu 開啟 + multi 模式)— DOM focus 移到 footer 全選列(`tabIndex=0`;全選列在 CommandList 之外、非 cmdk-item,cmdk 方向鍵導覽不涵蓋,故走 DOM focus。2026-07-05 D4 鍵盤可達修)
- Enter / Space(focus 在全選列)— 切換全選 / 全清(handler `preventDefault`,cmdk root onKeyDown 檢查 defaultPrevented 故不會重複觸發 active option)
- Esc — 關閉

**Focus**:menu 開啟時 active-descendant 虛擬焦點落在第一個 / 已選 option(`aria-activedescendant` 高亮,非 DOM focus;cmdk listbox 模式);searchable 時 DOM focus 給搜尋 input,非 searchable 時 DOM focus 移到 cmdk 的 `[cmdk-root]`(`Command` 元素,見 `handleNonSearchableAutoFocus`),讓 cmdk 內建方向鍵 / Enter / Home / End 導覽生效。option 為 `role="option"` 無 tabIndex,DOM focus 不落在 option 上。關閉時 focus 回 trigger。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `command.spec.md`
- `dropdown-menu.spec.md`
- `menu-item.spec.md`
- `popover.spec.md`
- `select.spec.md`
