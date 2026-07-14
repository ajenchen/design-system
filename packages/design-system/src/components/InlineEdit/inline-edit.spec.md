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
---

# InlineEdit 設計原則

**Layout Family**:composite。**edit 態委派 Family 4（Field Control Layout）**——直接渲染 Field 控件（預設 `<Input>`），幾何/邊框/focus 全繼承 `fieldWrapperStyles`，不新增 layout primitive。**read 態為 self-contained 純文字承載 + 隱形 Pressable**（絕對定位透明 `<button>`），只負責「看起來像純文字、hover 才有 affordance、點擊進 edit」。

## 定位

**實作基礎:自建 + composes Field 家族**（`renderEdit` 預設 `<Input>`）。

為何自建而非 Field prop/variant:InlineEdit 的本質是**兩個顯示態之間的 toggle 狀態機**(純文字 read view ↔ 完整 Field 控件 edit view)+ **就地編輯的進入/退出/commit/cancel 生命週期**。這是 Field 控件之上的**互動編排層**,不是某個 Field 控件的視覺 variant——Field 控件本身永遠是「一直可編輯的輸入框」,InlineEdit 才決定「何時顯示成純文字、何時顯示成輸入框」。故它 **compose** Field(消費 `<Input>` 當 edit 態),而非擴充 Field。

一句話:**Field 控件回答「這個值長什麼樣、怎麼編輯」;InlineEdit 回答「這個值平常是純文字,想改時才變成 Field 控件」**。

## 互動模型（read / hover / edit 三態 canonical）

| 態 | 視覺 | 行為 |
|----|------|------|
| **read**（靜態） | 純文字,寬度 fill 容器,**透明邊框（預留、不可見）、無底色**(視覺 = 純文字) | 隱形 Pressable 提供 click / 鍵盤 Tab focus / Enter·Space 進 edit |
| **read + hover** | **灰色底色 `bg-neutral-hover` + `rounded-md`**(**非邊框**)+ cursor | 提示「這裡可點擊編輯」 |
| **read + focus-visible**（鍵盤） | 外框染 **`border-primary` 藍框**(消費 Field edit focus 語言,**非 Button ring**) | Enter / Space → 進 edit |
| **edit** | **真正的 Field 控件**(完整 chrome:border + focus 藍框 + input) | 回歸 field-controls edit canonical;blur/Enter → commit、Esc → cancel |

**退出 edit 態**:
- **blur**（點外面）→ `commit`（草稿有變更才觸發 `onCommit`）
- **Enter** → `commit`
- **Esc** → `cancel`（放棄草稿,還原 read 態,不 commit）
- 任一路徑結算後,focus 送回 read 按鈕(鍵盤焦點不遺失)

## 幾何典範（2026-07-09 user 拍板,每值消費既有 SSOT,零自創）

| 面向 | 定義 | 消費的 SSOT |
|------|------|------------|
| 外框（read/edit 共用） | `-mx-[var(--field-px)]` + `w-[calc(100% + 2*var(--field-px))]` → 左右各對稱外擴 `--field-px`、填滿容器 | `--field-px` |
| 水平內距 | 文字 `px-[var(--field-px)]`（read=edit 同值）→ 文字左緣與相鄰內容切齊、底色/框外擴 gutter | `--field-px` |
| 垂直 | `min-h-[var(--field-height-{size})]` + 垂直置中（**無 py token**——Field 家族本就以「固定高度 + 置中」定義呼吸,非 padding；故 InlineEdit 同法,隨 size/density 自動縮放不漂移） | `--field-height-{sm/md/lg}` |
| hover（read） | `bg-neutral-hover` + `rounded-md`（底色 tint,**非邊框**） | color token + field radius |
| focus（read/鍵盤） | 透明 `border` 預留、focus 染 `border-primary`（Field focus 藍框語言,**非 ring**） | Field focus canonical |
| edit | 真正 `<Input>`（border + focus + input），width=fill 填滿外框 | field-controls edit canonical |

**「底色範圍 = 輸入框範圍」不變量**:read 與 edit 兩態共用同一外框幾何（同 `-mx`+calc 寬、同 `min-h`=field-height、同 1px 邊框盒),故 hover 底色與 edit 輸入框逐 pixel 對齊、態切換零位移。（舊版 read 外框 `w-full`+`-mx` 疊加 → 右側短一截、整塊左偏,已修。）

**尺寸預設 = `sm`**（2026-07-09 user 拍板）:read 態無邊框、視覺即純文字,尺寸過大會使版面鬆散;consumer 可傳 `size` 覆寫,標題場景另用 `readClassName` 疊大字級。

**核心不變量:read 態 hover = 背景 tint;read 態 focus = Field 藍框（`border-primary`）,與 edit 態同源。** hover（滑鼠懸停）用底色、focus（鍵盤選中）用藍框——藍框是 edit focus 的預覽,read→edit 一路都是藍框、不會 ring→框跳一下;靜態（無 hover/focus）則透明邊框不可見 = 純文字。

## 型別化 read view + 多行 + 鍵盤 SSOT（2026-07-09 L2）

InlineEdit 為**泛型 `<T>`**（非只 string）:`value: T` / `onCommit: (next: T) => void`。三個 render 面向:

| Prop | 作用 | 預設 | SSOT 鐵律 |
|---|---|---|---|
| `renderRead?(value)` | read 態格式化顯示 | `String(value)`（空 → placeholder） | 要顯 **Tag / 日期 / option label**,**渲染對應控件的 `mode="display"`**（如 `<Select mode="display" display="tag">`），**禁自刻**——格式化 SSOT 住在該控件的 display mode |
| `renderEdit?(props)` | edit 態控件 | `multiline`→`<Textarea>` / 否則 `<Input>` | 非 string 值必傳（預設路徑僅 string） |
| `multiline?` | 多行（Jira description 類） | false | read `items-start` 換行、edit Textarea（Enter=換行、Cmd/Ctrl+Enter 或 blur 提交） |

**Tag 顯示的 SSOT 對齊（user 2026-07-09 問）**:「select 值 → Tag」的格式化住在 **Select 的 `mode="display" display="tag"`**（`select.tsx` ReadonlyDisplay Tag 分支）—— 這正是 **DataTable 格子消費的同一份**（`cell-registry.tsx` SelectCell display 分支）。InlineEdit read 態顯 Tag = `renderRead={(v) => <Select mode="display" display="tag" value={v} options={opts} />}`,**read 與 edit 用同一個 Select、只切 mode → 格式零分歧**。此即「乾淨對齊」:InlineEdit 從不重刻 Tag,格式化永遠委派給控件的 display mode。示範見 `inline-edit.stories.tsx` `SelectTagField`。

**鍵盤結算 SSOT**:Enter=commit / Esc=cancel + **中文 IME 組字 guard** 抽為 `../Field/field-edit-keys.ts` `makeEditSettleKeyHandler`,**InlineEdit 與 DataTable cell（`cell-registry.tsx`）同源消費**（2026-07-09 抽出;原本 InlineEdit 漏 IME guard = 中文選字 Enter 誤提交半截組字 bug,現已修）。edit-in-place SSOT 研究（2026-07-09,6-agent + 世界級）結論:兩 host 的 draft 擁有權 / state locus（單實例 vs 表格級 keyed）/ focus model 根本不同,故**不抽大共用狀態機**（違 M21 + 破壞表格虛擬捲動效能）,只抽此純鍵盤結算片段。世界級共識 = **field 控件 + 型別 registry 可共用,edit-in-place orchestration 各自實作**（見 `../Field/field-controls.spec.md`「Field 框架地圖」段 cite）。

## 世界級對照

| DS | read 態 | hover affordance | 進 edit | 鍵盤 |
|----|---------|-----------------|---------|------|
| **Atlassian inline-edit**（[read-view.tsx](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx)） | 純值 + 隱形 Pressable | **背景 tint**（`background.neutral.subtle.hovered`,**非邊框**） | click read view | 隱形 button focus + Enter;5px drag threshold 防選字誤觸 |
| **PatternFly inline-edit** | value 文字 | 可編輯提示 | value/input 二態 toggle | Enter commit / Esc cancel |
| **Notion title cell** | 純文字 | hover 浮 affordance | click 編輯 | — |

三家共識:read 態 = 純值、hover = 輕背景提示（非重邊框）、click 或鍵盤進 edit、edit = 真正的輸入控件。本 DS 對齊此模型;`bg-neutral-hover` = 本 DS 的「neutral subtle hover」等價 token。

**read 態 focus canonical**（2026-07-09）:Atlassian read-view 的隱形 Pressable focus 時,外框顯 `color.border.focused` **實線 solid border**（非 ring）——[read-view.tsx](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) `&:focus + div { borderColor: token('color.border.focused') }`。本 DS 對齊此語言:read focus = `border-primary`(= Field edit focus 藍框),使 read→edit focus 視覺連續,不引入第三種（ring）focus 語言。

**read 態 typography canonical**（2026-07-09）:Atlassian inline-edit / PatternFly 將讀態字級**委派**給 consumer（read view 不強加字體,由外層 context 決定）。本 DS 更 opinionated——read 態預設消費 `fieldDisplayTextClass(size)`（sm/md→`text-body`,lg→`text-body-lg`,`../Field/field-wrapper.tsx` Field display 字體 SSOT),使 **plain 用法**（`<InlineEdit value onCommit />`）read 字級即 = edit `<Input>`（`text-body`）= `<Input mode="display">` 字級,三態零跳字;`readClassName`（如標題 `text-h4 font-bold`）僅作特例 override 疊其後。對齊 [Atlassian inline-edit read-view](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) 讀態委派模型,並補上「plain 用法即 canonical」的預設。

**狀態 data 屬性**（可測性）:外層容器 `data-editing`（read/edit 態）、read 元素 `data-empty`（空值）——供 audit / Playwright 斷言態切換與空值渲染（Dice UI data-attribute idiom,對齊 M32 pixel/DOM 可驗）。

## 何時用

- **標題就地編輯**:任務/文件/專案標題,平常是大標題純文字,點一下改（`as="h1"` + `readClassName` 帶標題字級）。
- **detail pane metadata 就地編輯**:單一值欄位（負責人備註、外部連結、簡短描述）平常純文字呈現,點擊即編。
- 語意 = **「這個值大部分時間是被閱讀的,偶爾才編輯」**——閱讀優先、編輯次要。

## 何時不用

- **表單欄位** → 直接用 `<Field>` + Field 控件(表單本來就是編輯情境,不需要 read 態偽裝成純文字)。
- **DataTable 密集可編輯格** → 用 naked cell(host cell 自管 border + focus、hover outline affordance;見 `field-controls.spec.md`「Cell(naked variant)」),不是每格包一個 InlineEdit 狀態機。
- **一律唯讀展示**(不可編) → 用 `<Input mode="display">` / 純文字,不需要 Pressable。
- **多欄位一次編輯** → 用表單(進入一次編輯全部欄位),不是逐欄 inline edit。

## 近親分界

| 元件 | 分界 |
|------|------|
| **Field 控件**（Input/Select/Textarea…） | 一直可編輯的輸入框;InlineEdit 讓它「平常是純文字,想改才現身」 |
| **`<Input mode="display">`** | 純展示(無互動、不可編);InlineEdit 的 read 態可點擊進 edit |
| **naked cell**（DataTable） | 表格密集網格的 cell-as-input,host cell 自管 chrome;InlineEdit 是單一 standalone 欄位的閱讀↔編輯 toggle |

## 常見誤解

- **「read 態 hover 該加邊框」** → 錯。hover = 背景 tint（`bg-neutral-hover`）;邊框是 edit 態語言。
- **「edit 態要自己刻 input chrome」** → 錯。edit 態 = 真正的 Field 控件(預設 `<Input>`),完全回歸 field-controls edit canonical,不重刻。
- **「大標題 inline edit 要自己做 focus/commit/esc」** → 錯。用 InlineEdit,生命週期(commit/cancel/Esc/focus 返回)由 primitive 統一處理。

## 空值

`value` 為空字串 / null 時,read 態顯示 `placeholder`(若有)+ `text-fg-muted`;無 placeholder 則空白。edit 態進入時草稿初值 = 空字串,顯示空 input。（不用唯讀展示語言的半形 `-` dash——InlineEdit 是可編輯欄位,空值 = 「還沒填、點來填」,dash 是唯讀展示語言。）

## 驗證

InlineEdit 本身不含驗證邏輯;若 edit 態需要驗證,consumer 透過 `renderEdit` 傳入帶 `error` 的 Field 控件,並在 `onCommit` 做值檢查（reject 時可不呼叫真正的資料更新）。此分層對齊 field-controls「error 正交於 mode」原則。

## Loading

InlineEdit 不含 async loading state。若 commit 需要 async 儲存,consumer 在 `onCommit` 內自行處理 optimistic update / toast;edit 態的 debounce/loading 由 `renderEdit` 傳入的控件(如 `<Input loading>`)承擔。

## A11y 預設

**ARIA**:
- read 態隱形 Pressable = `<button type="button">`,帶 `aria-label`(預設「編輯 {label}」)——螢幕閱讀器朗讀「可編輯」意圖。
- read 態語意標籤（`as`,預設 `span`;標題傳 `h1`/`h2`）獨立於 button 之外——`as="h1"` 保留文件大綱結構（HTML 內容模型不允許 heading 巢狀於 button,故隱形 Pressable 與語意標籤分離,對齊 [read-view.tsx](https://github.com/pioug/atlassian-frontend-mirror/blob/main/design-system/inline-edit/src/internal/read-view.tsx) hidden-Pressable pattern）。
- edit 態控件帶 `aria-label`（= `label`）。

**Keyboard**:
| 鍵 | read 態 | edit 態 |
|----|---------|---------|
| `Tab` | focus read 按鈕（外框染 `border-primary` 藍框,**非** ring;對齊本 spec 其餘段） | 依控件內部 focus 行為 |
| `Enter` / `Space` | 進 edit | `Enter` commit |
| `Esc` | — | cancel(還原不 commit) |

**Focus 管理**:進 edit 態自動 focus 控件（`autoFocus`);commit/cancel 結算後 focus 返回 read 按鈕(焦點不遺失)。

## 禁止事項

- ❌ read 態 hover 用邊框——用 `bg-neutral-hover` 背景 tint（邊框是 edit 態語言）
- ❌ edit 態手刻 input chrome——用 Field 控件（預設 `<Input>`)
- ❌ 用 InlineEdit 包 DataTable 密集可編輯格——用 naked cell
- ❌ 空值顯示唯讀展示的半形 `-` dash——InlineEdit 是可編輯欄位,空值 = placeholder 或空白
- ❌ read 態語意標籤用 heading 時把它塞進 button——用隱形 Pressable 疊加,保留文件大綱
