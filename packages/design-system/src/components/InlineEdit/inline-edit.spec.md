---
component: InlineEdit
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
benchmark:
  - Atlassian inline-edit read-view: https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx
  - PatternFly inline-edit: https://www.patternfly.org/components/inline-edit/design-guidelines
  - Notion database title cell: https://www.notion.com/help/intro-to-databases
  - MUI X DataGrid editing(isCellEditable): https://mui.com/x/react-data-grid/editing/
  - AG Grid cell editing(editable): https://www.ag-grid.com/react-data-grid/cell-editing/
---

# InlineEdit 設計原則

**Layout Family**:composite。**edit 態委派 Family 4（Field Control Layout）**——直接渲染 Field 控件（預設 `<Input>`），幾何/邊框/focus 全繼承 `fieldWrapperStyles`，不新增 layout primitive。**view 態幾何同樣委派 Family 4（Model A,不自帶 geometry cva）**——值-格式化路徑委派 `<Control mode="view">`、純值/標題路徑套 `fieldViewGeometry` helper（見「幾何典範」）;本體只疊 hover bg + focus 藍框 + 隱形 Pressable（絕對定位透明 `<button>`），負責「看起來像純內容、hover 才有 affordance、點擊進 edit」。

## 定位

**實作基礎:自建 + composes Field 家族**（`renderEdit` 預設 `<Input>`）。

為何自建而非 Field prop/variant:InlineEdit 的本質是**兩個顯示態之間的 toggle 狀態機**(純值 view ↔ 完整 Field 控件 edit)+ **就地編輯的進入/退出/commit/cancel 生命週期**。這是 Field 控件之上的**互動編排層**,不是某個 Field 控件的視覺 variant——Field 控件本身永遠是「一直可編輯的輸入框」,InlineEdit 才決定「何時顯示成純文字、何時顯示成輸入框」。故它 **compose** Field(消費 `<Input>` 當 edit 態),而非擴充 Field。

一句話:**Field 控件回答「這個值長什麼樣、怎麼編輯」;InlineEdit 回答「這個值平常是純文字,想改時才變成 Field 控件」**。

## Controlled-only rationale（Dim 26）

本元件採 **controlled-only**:`value` + `onCommit`,不支援 `defaultValue` uncontrolled fallback。對齊 Field 家族 7 個 controlled-only 元件慣例(Combobox / DatePicker / TimePicker / SelectMenu / LinkInput / NumberInput / PeoplePicker,rationale 見各 spec 同名段)。就地編輯的語意本質 = **值住在 consumer**(detail-pane 資料層),`onCommit` 單向回寫;內部已有 draft 草稿層(進 edit 以 `value` 為初值、結算才 commit),再開 uncontrolled 會產生 draft ↔ internal value 雙層 sync race。未來要改 dual-mode 需 `useControllableState` helper,屬 major API 擴充,目前不在 scope。

## 互動模型（view ↔ edit 二態 canonical;hover 是 view 子態）

| 態 | 視覺 | 行為 |
|----|------|------|
| **view**（靜止） | 純值 / 格式化 renderRead,寬度 fill 容器,**透明邊框（預留、不可見）、無底色**(視覺 = 純內容) | editable 時隱形 Pressable 提供 click / 鍵盤 Tab focus / Enter·Space 進 edit |
| **view + hover**（editable 限定） | **灰色底色 `bg-neutral-hover` + `rounded-md`**(**非邊框**)+ cursor | 提示「這裡可點擊編輯」 |
| **view + focus-visible**（editable 限定,鍵盤） | 外框染 **`border-primary` 藍框**(消費 Field edit focus 語言,**非 Button ring**) | Enter / Space → 進 edit |
| **edit** | **真正的 Field 控件**(`mode="edit"` 完整 chrome:border + focus 藍框 + input) | 回歸 field-controls edit canonical;blur/Enter → commit、Esc → cancel |

只有 **view ↔ edit 二態**(hover / focus-visible 是 view 的子態,非第三態);與 DataTable cell 是同一份「就地編輯 host」語義(`../Field/field-controls.spec.md`「軸二 就地編輯 host」段)。

**退出 edit 態(focus 分流)**:
- **滑鼠 blur**(點外面)→ `commit`(草稿有變更才觸發 `onCommit`),**焦點刻意不送回**——回到純 view,不搶焦
- **Enter**(鍵盤)→ `commit`,**焦點送回 view 按鈕** + focus-visible 顯藍框(鍵盤焦點不遺失)
- **Esc**(鍵盤)→ `cancel`(放棄草稿還原 view 態,不 commit),焦點同送回 view 按鈕
- 分流理由:鍵盤路徑需焦點連續(a11y);滑鼠 blur = 使用者意圖已在別處,強拉焦點回來是搶焦。`focus-visible` 保證只有鍵盤路徑顯藍框。

## editable 閘（無 disabled 態）

`editable?: boolean`(預設 true)。`editable=false` → view 態**無 hover 入口、不渲染隱形 Pressable、無藍框、不可進 edit,且不灰化**——就地編輯 host **無 disabled 態**,鎖定 = 純 view 無入口(detail-pane 權限鎖定語意)。與 DataTable cell 的 `editable:(row)=>boolean` 判準閘是**同一份語義**(`../Field/field-controls.spec.md`「軸二」);世界級就地編輯 grid 同模型:MUI X isCellEditable(https://mui.com/x/react-data-grid/editing/)/ AG Grid editable(https://www.ag-grid.com/react-data-grid/cell-editing/)。永久唯讀資料 → 用 `<Control mode="view">`;隨權限切換可編/不可編 → `editable`;**不用 disabled**(灰化是表單 disabled 語言,不是就地編輯語言)。

## 幾何典範（Model A 委派模型,2026-07-16 round16 user GO;推翻 2026-07-09「自帶外框幾何」版）

InlineEdit **不自帶 geometry cva**(M17 消重)——view 態幾何兩路來源,皆消費既有 SSOT:

| 路徑 | 幾何來源 | 說明 |
|------|---------|------|
| **值-格式化**(Select→Tag / 日期 / avatar) | 委派 `<Control mode="view">`(view×default = edit 幾何減 chrome) | 幾何 + 內部間距(多 tag gap / avatar↔label)皆由控件 view mode 提供——view 與 edit **同一顆控件、只差 chrome** → 天生一致、零偏移 |
| **純值 / 標題**(`String(value)` / `as="h1"`) | `fieldViewGeometry(size, multiline)` helper(`../Field/field-wrapper.tsx`,view×default 幾何 SSOT) | = `px-[var(--field-px)]` + `min-h-[var(--field-height-{size})]`;單行 `items-center`、多行 `items-start py-2` |

InlineEdit 本體只給:**對齊盒(-mx 條件化)+ hover bg + focus 藍框 + 隱形 Pressable**。

**對齊盒(-mx 條件化,orientation-aware)**:
- **Field 內 vertical** → `-mx-[var(--field-px)]` + `w-[calc(100%+2*var(--field-px))]`:整塊拉到欄左緣,委派控件 view 的 px 被 -mx 抵消 → 值貼 label 左緣(= [Atlassian read-view](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) 負邊距對照)
- **Field 內 horizontal / standalone(無 fieldCtx)** → `w-full min-w-0`,**不用 -mx**:值內縮 px = 對齊 sibling 控件。standalone 必 w-full——無 Field 時 -mx 無對齊對象,且會把 hover 底色 + Pressable 拉出容器 12px 溢出
- 兩路 view↔edit 皆零跳(edit 態同框同一對齊盒)

**多行(multiline)**:view = `items-start py-2`,**= Textarea edit `py-2`**(textarea.tsx base)——`scripts/inline-edit-view-geometry-invariant.mjs` 機械鎖此契約(Textarea py 一改即紅)。

**「底色範圍 = 輸入框範圍」不變量**:view 與 edit 兩態共用同一對齊盒(同寬、同 1px 邊框盒),幾何同源(view×default = edit 幾何減 chrome),故 hover 底色與 edit 輸入框逐 pixel 對齊、態切換零位移。(舊版 read 外框 `w-full`+`-mx` 疊加 → 右側短一截、整塊左偏,已修;2026-07-16 -mx 由恆定改條件化。)

**尺寸預設 = `sm`**（2026-07-09 user 拍板）:view 態無邊框、視覺即純文字,尺寸過大會使版面鬆散;consumer 可傳 `size` 覆寫,標題場景另用 `readClassName` 疊大字級。

**核心不變量:view 態 hover = 背景 tint;view 態 focus = Field 藍框（`border-primary`）,與 edit 態同源。** hover（滑鼠懸停）用底色、focus（鍵盤選中）用藍框——藍框是 edit focus 的預覽,view→edit 一路都是藍框、不會 ring→框跳一下;靜止（無 hover/focus）則透明邊框不可見 = 純值。

## 型別化 view + 多行 + 鍵盤 SSOT（2026-07-09 L2）

InlineEdit 為**泛型 `<T>`**（非只 string）:`value: T` / `onCommit: (next: T) => void`。三個 render 面向:

| Prop | 作用 | 預設 | SSOT 鐵律 |
|---|---|---|---|
| `renderRead?(value)` | view 態格式化顯示 | `String(value)`（空 → placeholder） | 要顯 **Tag / 日期 / option label**,**渲染對應控件的 `mode="view"`**（如 `<Select mode="view" display="tag">`），**禁自刻**——格式化 SSOT 住在該控件的 view mode |
| `renderEdit?(props)` | edit 態控件 | `multiline`→`<Textarea>` / 否則 `<Input>` | 非 string 值必傳（預設路徑僅 string） |
| `multiline?` | 多行（Jira description 類） | false | view `items-start py-2` 換行（= Textarea edit py-2,見「幾何典範」）、edit Textarea（Enter=換行、Cmd/Ctrl+Enter 或 blur 提交） |

**Tag 顯示的 SSOT 對齊（user 2026-07-09 問）**:「select 值 → Tag」的格式化住在 **Select 的 `mode="view" display="tag"`**（`select.tsx` ReadonlyDisplay Tag 分支）—— 這正是 **DataTable 格子消費的同一份**（`cell-registry.tsx` SelectCell view 分支）。InlineEdit view 態顯 Tag = `renderRead={(v) => <Select mode="view" display="tag" value={v} options={opts} />}`,**view 與 edit 用同一個 Select、只切 mode → 格式零分歧**。此即「乾淨對齊」:InlineEdit 從不重刻 Tag,格式化永遠委派給控件的 view mode。示範見 `inline-edit.stories.tsx` `SelectTagField`。

**鍵盤結算 SSOT**:Enter=commit / Esc=cancel + **中文 IME 組字 guard** 抽為 `../Field/field-edit-keys.ts` `makeEditSettleKeyHandler`,**InlineEdit 與 DataTable cell（`cell-registry.tsx`）同源消費**（2026-07-09 抽出;原本 InlineEdit 漏 IME guard = 中文選字 Enter 誤提交半截組字 bug,現已修）。edit-in-place SSOT 研究（2026-07-09,6-agent + 世界級）結論:兩 host 的 draft 擁有權 / state locus（單實例 vs 表格級 keyed）/ focus model 根本不同,故**不抽大共用狀態機**（違 M21 + 破壞表格虛擬捲動效能）,只抽此純鍵盤結算片段。世界級共識 = **field 控件 + 型別 registry 可共用,edit-in-place orchestration 各自實作**（見 `../Field/field-controls.spec.md`「Field 框架地圖」段 cite）。

## 世界級對照

| DS | view 態 | hover affordance | 進 edit | 鍵盤 |
|----|---------|-----------------|---------|------|
| **Atlassian inline-edit**（[read-view.tsx](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx)） | 純值 + 隱形 Pressable | **背景 tint**（`background.neutral.subtle.hovered`,**非邊框**） | click read view | 隱形 button focus + Enter;5px drag threshold 防選字誤觸 |
| **PatternFly inline-edit** | value 文字 | 可編輯提示 | value/input 二態 toggle | Enter commit / Esc cancel |
| **Notion title cell** | 純文字 | hover 浮 affordance | click 編輯 | — |

三家共識:view 態 = 純值、hover = 輕背景提示（非重邊框）、click 或鍵盤進 edit、edit = 真正的輸入控件。本 DS 對齊此模型;`bg-neutral-hover` = 本 DS 的「neutral subtle hover」等價 token。

**view 態 focus canonical**（2026-07-09）:Atlassian read-view 的隱形 Pressable focus 時,外框顯 `color.border.focused` **實線 solid border**（非 ring）——[read-view.tsx](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) `&:focus + div { borderColor: token('color.border.focused') }`。本 DS 對齊此語言:view focus = `border-primary`(= Field edit focus 藍框),使 view→edit focus 視覺連續,不引入第三種（ring）focus 語言。

**view 態 typography canonical**（2026-07-09）:Atlassian inline-edit / PatternFly 將 view 態字級**委派**給 consumer（readView 不強加字體,由外層 context 決定）。本 DS 更 opinionated——view 態預設消費 `fieldDisplayTextClass(size)`（sm/md→`text-body`,lg→`text-body-lg`,`../Field/field-wrapper.tsx` Field view 字體 SSOT),使 **plain 用法**（`<InlineEdit value onCommit />`）view 字級即 = edit `<Input>`（`text-body`）= `<Input mode="view">` 字級,三者一致零跳字;`readClassName`（如標題 `text-h4 font-bold`）僅作特例 override 疊其後。對齊 [Atlassian inline-edit read-view](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) 委派模型,並補上「plain 用法即 canonical」的預設。

**狀態 data 屬性**（可測性）:外層容器 `data-editing`（read/edit 態）、read 元素 `data-empty`（空值）——供 audit / Playwright 斷言態切換與空值渲染（Dice UI data-attribute idiom,對齊 M32 pixel/DOM 可驗）。

## 何時用

- **標題就地編輯**:任務/文件/專案標題,平常是大標題純文字,點一下改（`as="h1"` + `readClassName` 帶標題字級）。
- **detail pane metadata 就地編輯**:單一值欄位（負責人備註、外部連結、簡短描述）平常純文字呈現,點擊即編。
- 語意 = **「這個值大部分時間是被閱讀的,偶爾才編輯」**——閱讀優先、編輯次要。

## 何時不用

- **表單欄位** → 直接用 `<Field>` + Field 控件(表單本來就是編輯情境,不需要 view 態偽裝成純文字)。
- **DataTable 密集可編輯格** → 用 naked cell(host cell 自管 border + focus、hover outline affordance;見 `field-controls.spec.md`「Cell(naked variant)」),不是每格包一個 InlineEdit 狀態機。
- **一律唯讀展示**(不可編) → 用 `<Input mode="view">` / 純文字,不需要 Pressable;**隨權限暫時鎖定** → 留 InlineEdit 傳 `editable=false`(不灰化,見「editable 閘」)。
- **多欄位一次編輯** → 用表單(進入一次編輯全部欄位),不是逐欄 inline edit。

## 近親分界

| 元件 | 分界 |
|------|------|
| **Field 控件**（Input/Select/Textarea…） | 一直可編輯的輸入框;InlineEdit 讓它「平常是純文字,想改才現身」 |
| **`<Input mode="view">`** | 純展示(無互動、不可編);InlineEdit 的 view 態可點擊進 edit |
| **naked cell**（DataTable） | 表格密集網格的 cell-as-input,host cell 自管 chrome;InlineEdit 是單一 standalone 欄位的閱讀↔編輯 toggle |

## 常見誤解

- **「view 態 hover 該加邊框」** → 錯。hover = 背景 tint（`bg-neutral-hover`）;邊框是 edit 態語言。
- **「edit 態要自己刻 input chrome」** → 錯。edit 態 = 真正的 Field 控件(預設 `<Input>`),完全回歸 field-controls edit canonical,不重刻。
- **「大標題 inline edit 要自己做 focus/commit/esc」** → 錯。用 InlineEdit,生命週期(commit/cancel/Esc/focus 返回)由 primitive 統一處理。

## 空值

`value` 為空字串 / null 時,view 態顯示 `placeholder`(若有)+ `text-fg-muted`;無 placeholder 則空白。edit 態進入時草稿初值 = 空字串,顯示空 input。（不用唯讀展示語言的半形 `-` dash——InlineEdit 是可編輯欄位,空值 = 「還沒填、點來填」,dash 是唯讀展示語言。）

## 驗證

InlineEdit 本身不含驗證邏輯;若 edit 態需要驗證,consumer 透過 `renderEdit` 傳入帶 `error` 的 Field 控件,並在 `onCommit` 做值檢查（reject 時可不呼叫真正的資料更新）。此分層對齊 field-controls「error 正交於 mode」原則。

## Loading

InlineEdit 不含 async loading state。若 commit 需要 async 儲存,consumer 在 `onCommit` 內自行處理 optimistic update / toast;edit 態的 debounce/loading 由 `renderEdit` 傳入的控件(如 `<Input loading>`)承擔。

## A11y 預設

**ARIA**:
- view 態隱形 Pressable = `<button type="button">`,帶 `aria-label`(預設「編輯 {label}」)——螢幕閱讀器朗讀「可編輯」意圖。**僅 editable 時渲染**;`editable=false` 無 Pressable = 純 view(非 disabled,不進 tab order 也不灰化)。
- view 態語意標籤（`as`,預設 `span`;標題傳 `h1`/`h2`）獨立於 button 之外——`as="h1"` 保留文件大綱結構（HTML 內容模型不允許 heading 巢狀於 button,故隱形 Pressable 與語意標籤分離,對齊 [read-view.tsx](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) hidden-Pressable pattern）。
- edit 態控件帶 `aria-label`（= `label`）。

**Keyboard**:
| 鍵 | view 態 | edit 態 |
|----|---------|---------|
| `Tab` | focus view 按鈕(僅 editable;外框染 `border-primary` 藍框,**非** ring;對齊本 spec 其餘段) | 依控件內部 focus 行為 |
| `Enter` / `Space` | 進 edit | `Enter` commit(焦點回 view 按鈕) |
| `Esc` | — | cancel(還原不 commit,焦點回 view 按鈕) |

**Focus 管理(分流)**:進 edit 態自動 focus 控件（`autoFocus`);**鍵盤結算**(Enter commit / Esc cancel)後焦點送回 view 按鈕 + focus-visible 藍框(焦點不遺失);**滑鼠 blur 結算刻意不回焦**——回純 view 不搶焦(理由見「退出 edit 態(focus 分流)」段)。

## shadcn passthrough 例外說明
InlineEdit 是 **composite 編排層**(view 對齊盒 + 隱形 Pressable + 動態生成的 edit 控件),遵循 shadcn 結構 idiom(forwardRef + displayName)但**無 `...props` spread**:外層 div 只是對齊盒、非 consumer 可預期的互動 surface(spread 目標不明——view 按鈕?edit 控件?),DOM 級屬性應透過 `renderEdit` / `renderRead` 下傳給真正的控件;`ref` / `className` 附著於外層對齊盒。`asChild` 不支援(composite 非 Slot-compat,Slot 慣例見 https://www.radix-ui.com/primitives/docs/utilities/slot)。

## 禁止事項

- ❌ view 態 hover 用邊框——用 `bg-neutral-hover` 背景 tint（邊框是 edit 態語言）
- ❌ edit 態手刻 input chrome——用 Field 控件（預設 `<Input>`)
- ❌ 用 InlineEdit 包 DataTable 密集可編輯格——用 naked cell
- ❌ 空值顯示唯讀展示的半形 `-` dash——InlineEdit 是可編輯欄位,空值 = placeholder 或空白
- ❌ view 態語意標籤用 heading 時把它塞進 button——用隱形 Pressable 疊加,保留文件大綱
- ❌ 用 disabled / 灰化表達鎖定——就地編輯無 disabled 態,鎖定 = `editable=false` 純 view 無入口、不灰化(見「editable 閘」)
