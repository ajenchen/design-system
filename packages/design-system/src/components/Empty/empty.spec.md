---
component: Empty
family: composite
variants: {}
sizes: {}
traits:
  - isStructural
benchmark:
  - Ant Design Empty: github.com/ant-design/ant-design/tree/master/components/empty
  - Polaris EmptyState: github.com/Shopify/polaris/tree/main/polaris-react/src/components/EmptyState
---


# Empty 設計原則

**空狀態視覺元件**——容器內沒有內容時的居中提示。Table、Page section 等需要空狀態的元件統一消費(下拉選單的 0 筆**不是** Empty 的場景,見「何時不用」)。

## 定位

一個 **layout pattern**(不是 field-level 元件)。它排列 icon / title / description / action 成居中垂直堆疊,間距固定不隨 density 變(見「間距」段)。

預設只有 description——icon / title / action 全部可選。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **Table / list / grid 空狀態**：DataTable 查無資料、搜尋無結果
- **Page section 無內容**：dashboard widget 暫無資料、設定頁未建立任何項目
- **初次引導**：讓使用者首次使用時知道「這裡會放什麼」+ 有 CTA 建立
- **容器級無權限提示**（2026-07-04 Q7 拍板）：卡片 / 區塊 / 面板內容因權限不可見 — **必附 request-access 類 action**（對齊 Atlassian「Request access」empty state 官方範例([empty-state examples](https://atlassian.design/components/empty-state/examples)「You don't have access to this work item … Request access」)+ Carbon error-management scenario([empty states pattern](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states)「Permissions issue … Suggest steps or process to request access.」);皆 2026-11-05 讀回）；整頁 403 同樣必附這類 action，組法見「整頁狀態」
- **整頁 404 / 403**:打開的那一頁不存在、或沒有權限看 —— Empty 放在 AppShell 主內容區、貼上方(「垂直定位」無框那一列),見「整頁狀態」

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| Loading 中(資料還沒來) | `Skeleton` / `CircularProgress` | Empty 是「確定沒有」,Loading 是「還沒確定」 |
| 下拉選單 0 筆 / 搜尋無結果(SelectMenu / Select / Combobox / PeoplePicker / Command) | 一列 `MenuItem message`(`CommandEmpty` own) | 選單裡的 0 筆只是一句提示,沒有解釋、圖示與動作;走選項的列幾何、與 1 筆等高(`../SelectMenu/select-menu.spec.md`「Empty state」,2026-09-08) |
| 錯誤 / 失敗狀態 | `Alert` + 重試按鈕 | Error 需要明確告知「發生什麼問題」+ 解決途徑，Empty 是中性提示 |
| Disabled 狀態 | 禁用元件本身 | Empty 是「沒東西」，disabled 是「不能操作」 |

```
      [Icon(Avatar 包覆)]   ← 可選
      [Title]                ← 可選
      [Description]          ← 唯一必有
      [Action]               ← 可選
```

(全部居中垂直堆疊;間距原則見「間距」段,具體 class / px 對照見 anatomy stories)

## Slots

- **Icon**(`icon?: LucideIcon | ReactElement`,預設無):LucideIcon 會自動包 48px neutral Avatar + 28px icon;ReactElement 原樣渲染(consumer 可自帶 Illustration、ColorAvatar、CircularProgress)
- **Title**(`title?: string`,預設無):主要標題,foreground + medium 字重,居中
- **Description**(`description: string`,必填且不得為空):說明「缺什麼／為何空／下一步」的文字,次要色、居中。Icon、title、action 都不能取代 description
- **Action**(`action?: ReactNode`,預設無):CTA Button 或任何操作,居中

## 間距

固定值,不隨 density 變(Empty 是展示性元件,不是工作區域元件——展示性文字不跟 field-height tier 連動):

- **Icon → Title/Desc**:視覺 → 文字過渡需充足呼吸空間(48px icon 尺寸不宜貼近文字)
- **Title → Description**:緊密配對(同資訊塊,對齊 item-layout canonical 的 label ↔ desc gap)
- **Description → Action**:資訊 → 行動的視覺暫停,引導使用者注意 CTA

Outer padding 由 **consumer 容器** 決定(Table 空狀態需較大留白、Page-level 最寬鬆)。

## Typography

- **Title**:body-lg + medium 字重 / foreground 色(主要閱讀重量)
- **Description**:字級跟 `RowSizeContext` 對齊——standalone(無 context,fallback `md`)或 `sm`/`md` row 子樹 = body tier(14px);渲染在 `lg` 的 `RowSizeContext` 子樹(如 lg menu)內時自動升 body-lg(16px),對齊該 menu items 字級。色彩條件式:有 title / action 時走 **`fg-secondary`**(次要閱讀色,與 title 形成主次層級);孤身 description(無 title / action)時走 **`fg-muted` placeholder 等級色**(跟 input placeholder 同色,提示「這裡暫時沒內容」);disabled context 時走 `fg-disabled`

完整 slot / gap / typography 的 class 與 px 對照見 anatomy `Overview`(Slot 與 Spacing)+ `SlotCombinations`(Slot 間距規則)stories。

## 文字不限寬

Description **不加 max-width**。文字置中(由 `items-center` 居中,span 收縮成內容寬度,非 w-full),行寬由容器 padding 控制。文案設計者自己規劃換行(文案長度 = 設計的一部分),Empty 不該強制截斷。

## 垂直定位(Consumer 容器的責任)

Empty 只管**水平居中**。垂直定位由 consumer 的容器決定:

| 容器類型 | 垂直定位 | 做法 |
|---|---|---|
| **有框**(Table / Dialog / Card,有明確 border 或 shadow 包圍) | **垂直置中** | `DialogBody` / `SheetBody` 裡只放一個 Empty 就好,不用寫 class:主體內層撐滿可視高(ScrollArea `fillY` + 內層 `min-h-full`),只放一個 Empty 時由 `layoutSpace.css` 在可視區正中、上下同值(2026-11-27,產品 canary 回報 H10;範例 Dialog 展示「主體只有空狀態」)【AI 推導:既有規則的落地】;其他有框容器 `flex items-center justify-center min-h-[...]`。**放得下才置中,放不下從頂開始、可捲動**:狀態比可用高還高(視窗很矮、說明很長)時不得上下兩頭溢出(被標頭 / 輸入框蓋住),改從頂開始排、捲得到;一般尺寸與置中畫面相同。寫法:`layoutSpace.css` 只放一個 Empty 那一條用 CSS `safe center`(寫在 `@supports` 裡、外面留 `center`,不認得 `safe` 的瀏覽器照舊置中);自己置中的包層(AgentPanel 新對話 `../../stories-helpers/scene/agent-demo.tsx#DemoConversation`、FileViewer 不支援的檔案 `../FileViewer/file-viewer.tsx#FallbackRenderer`)置中的是一個 `ScrollArea`(寬高 = 內容的寬高、最多到可用寬高 `max-w-full` / `max-h-full`)【AI 推導 2026-11-28:研究頁第 2 節「內容量」表那一列,實測 AI 面板 1440×220 兩頭溢出;user 選甲時沒逐字講這一點】 |
| **無框**(Page section、整頁的 AppShell 主內容區,沒有外框線) | **頂部對齊 + generous padding** | 容器 `py-[calc(var(--layout-space-bottom)*2)]` |

世界級(這兩分):PatternFly([empty-state.md](https://raw.githubusercontent.com/patternfly/patternfly-org/main/packages/documentation-site/patternfly-docs/content/components/empty-state/empty-state.md)「On a desktop, a full-page empty state should contain a 3xl spacer at the top」「Empty states inside a table, card, or wizard should always be horizontally and vertically centered on their background.」);eBay Playbook([empty states](https://playbook.ebay.com/design-system/patterns/empty-states)「The empty state content is vertically aligned to the top of the page.」);皆 2026-11-28 讀回。

### 為什麼有框置中、無框不置中

有框容器有明確的視覺邊界——使用者知道「這個框裡面是空的」。居中把 Empty 放在框的視覺重心,安定。

無框容器沒有邊界——如果居中,Empty 會脫離頁面視覺中心,使用者不知道空的範圍有多大。頂部對齊 + `calc(var(--layout-space-bottom) * 2)` padding 讓 Empty 有固定位置,用留白空間本身創造「這裡是空的」的視覺重量,取代框線的作用。

## 整頁狀態(404 / 403)

打開的那一頁不存在(404)、或使用者沒有權限看(403)時,不另建元件,用 Empty 放在 AppShell 主內容區。出處:不建元件、Empty 用在整頁 = user 2026-11-26 在第六輪決策卡 C22 選 A,選項原文(逐字)「A:不建元件;Empty 可用在整頁 + AppShell 範例,狀態置中」(選項文字是 AI 寫的、意見欄空白);其中「狀態置中」已由 user 2026-11-28 的選擇取代(第 4 點)。

1. **位置**:AppShell 主內容區(`../AppShell/app-shell.spec.md`「Main slot」),導覽照常 —— 全域標頭、Menu、帳號入口都在,使用者可以直接去別的地方。
2. **標題包 h1**:不傳 Empty 的 `title`,在外層自包 `<h1>`(同「A11y 預設」的 Title slot heading level);這是這一頁唯一的 h1。
3. **一定附動作**(同「禁止事項」整頁 Empty 但無 action):404 → 回首頁或上一頁;403 → 申請權限 / 聯絡擁有者(同「何時用」容器級無權限提示那一條的 request-access 規則)。
4. **貼上方,照「垂直定位」無框那一列**:主內容區沒有外框 → 頂部對齊,包層上下 `calc(var(--layout-space-bottom) * 2)`、左右 `loose`(`../../tokens/layoutSpace/layoutSpace.spec.md` 規則 1);1440×900 時狀態頂 = 全域標頭底 48 + 96 = 144,視窗變高位置不動。整頁讀取(Empty + 轉圈,`../CircularProgress/circular-progress.spec.md`)、整頁 500、整頁結果之後也站同一個位置(讀完換上別的狀態時不跳)。出處:user 2026-11-28(逐字節錄)「我覺得是照你建議的甲，因為原本ds就這樣定義」—— 甲 = 交接資料夾研究頁 `notes/decisions/research-state-placement-2026-11-28.md` 第 6 節「整頁貼上、有框置中」(回到上方「垂直定位」的兩分);同一則後段是三個追問研究的問句,全文住同資料夾 `state-placement-answer-2026-11-28.md`。取代 C22 選項裡的「狀態置中」(2026-11-26 起整頁曾在主內容區正中)。

【AI 推導 2026-11-26】以下是照上面四點與既有規格推出來的畫面細節,範例照這樣做、等 user 看預覽:
- 主內容欄不放本頁標頭(那一頁不存在 / 看不到,沒有本頁的標題與動作可放);範例用 `primary-header` 版面,側欄開關住在全域標頭裡,拿掉本頁標頭不影響導覽。
- h1 的外觀 = Empty 標題那一格(「Typography」Title:body-lg + medium / foreground),h1 → 說明的距離 = Empty 標題 → 說明的同一個 token(`--item-gap-label-desc-reading-lg`)—— 標題拿到外層,畫面仍是 Empty 的樣子。
- 不放圖示:Empty 的圖示畫在 Empty 裡、標題上方;標題拿到外層後圖示會排到標題下面,順序顛倒,所以範例不放。要不要圖示、圖示怎麼放,尚未定。

**500(載入失敗)的版面尚未定**:「何時不用」的「錯誤 / 失敗狀態 → Alert」管的是容器內;整頁失敗用不用 Empty、配什麼動作,本次沒有決定(位置已定 = 第 4 點)。

世界級:Atlassian EmptyState 把整頁與錯誤頁放進同一個空狀態元件([usage](https://atlassian.design/components/empty-state/usage)「An empty state can appear as a full screen message or within panels, tables, and other containers.」「Some error messages, such as not found errors, may also fit this component layout.」);Adobe Spectrum IllustratedMessage 同樣兼顧空狀態與錯誤頁([IllustratedMessage](https://react-spectrum.adobe.com/react-spectrum/IllustratedMessage.html)「An IllustratedMessage displays an illustration and a message, usually for an empty state or an error page.」,範例「Error 404: Page not found」「Error 403: Access not allowed」);皆 2026-11-26 讀回。

範例:AppShell 展示「整頁 404 — 打開已刪除的專案連結」「整頁 403 — 沒有權限的私人專案」(`../AppShell/app-shell.stories.tsx#UnreachablePageShell`)。閘:`scripts/header-first-gap-invariant.mjs` 的 `appshell-full-page-404` / `appshell-full-page-403`(全域標頭底 → 狀態頂 = 2 × `--layout-space-bottom`、頁面唯一的 h1 = 狀態標題、有動作)。

**來源說明(2026-11-26 更正)**:2026-11-26 前本規格寫「整頁級別的 404 / 無權限 → 專屬錯誤頁面」,並在「何時用」容器級那一行寫「整頁級 403 / 404 仍禁用」。DS 從來沒有「專屬錯誤頁面」這個東西。整頁那句最早在 2026-04-18 的 commit 02f4141b 由 AI 寫入(commit 訊息「新增 何時不用 table(Skeleton loading / Alert error / 專屬 404 / …)」),沒有 user 原話;容器級那一行標的「2026-07-04 Q7 拍板」只涵蓋容器級(Q7 題目只問容器級可否用 Empty),「整頁級仍禁用」是 2026-07-05 commit 7e69aad7 一起寫進來的 AI 建議文字,不是拍板內容。之前的判讀把整頁禁令說成 2026-07-04 拍板,是誤植。

## 邊界案例

- **極長 description**:不截斷、不限寬,自然換行(見「文字不限寬」段)— 文案長度由文案設計者控制
- **動態變空**(filter / search 從有結果 → 無結果):視覺與靜態空狀態完全相同,無轉場;consumer 容器加 `aria-live="polite"` 通知 SR(見「A11y 預設」)
- **全 slot 缺值**:code 不擋空 render,但 description 是唯一必有 slot(見「Slots」段)— 無任何 slot 的 `<Empty>` 渲染成空容器,屬 consumer 誤用

---

## A11y 預設

Empty 是 **non-interactive layout primitive**——本身無 ARIA role(讓 consumer 容器決定 region semantics)。但 consumer 應遵循以下慣例:

| 場景 | Consumer 容器應加 | 為什麼 |
|------|----------------|------|
| Table / List 空狀態 | `<table aria-describedby={emptyId}>` 或在容器加 `aria-live="polite"` | screen reader 在資料載入完成時主動通知「無資料」 |
| Search / Filter 無結果 | container `aria-live="polite"` + 文案明確指向搜尋詞(「找不到符合『XXX』的結果」)| 變動結果需 live region，讓非視覺使用者知道查詢已完成且結果改變 |
| Page section 暫無內容 | `<section aria-labelledby={titleId}>` + `<h2>` 包 title slot | 對齊 WCAG 2.1 SC 2.4.6 標題明確語意 |
| 初次引導(有 CTA) | Action Button 自帶 a11y;無需 Empty 層額外 ARIA | CTA 是真實互動 element,自己的 a11y 足夠 |

**Title slot heading level**:Empty 不渲染 heading tag(`<h1>` / `<h2>`),只 `<span>` + 視覺 typography。Consumer 若需 heading semantic,在外層自包 `<h2>{title}</h2>` + 不傳 Empty 的 title prop(避免重複)。

**Icon slot**:LucideIcon 自動渲染 `aria-hidden="true"`(decorative);ReactElement(自帶 Avatar / Illustration)由 consumer 控制 `aria-hidden` / `alt`(若是 `<img>` 必傳 `alt=""` 表示 decorative)。

**Description 不需 live announcement**:Empty 本身是「靜態空狀態提示」(進入時就空),不是「動態變化結果」。動態變化(filter / search 結果切換)由 consumer 在容器層加 `aria-live`,不在 Empty 內。

世界級對照:
- **Polaris** `<EmptyState>`:heading 固定渲染成 `<Text variant="headingMd" as="p">`(段落,不是可選 level 的標題),元件本身沒有 `aria-labelledby`([EmptyState.tsx#L120-L125](https://github.com/Shopify/polaris/blob/3f7954ae42fabf26d63cee68c23ceebfd7ef0972/polaris-react/src/components/EmptyState/EmptyState.tsx#L120-L125))
- 原列的另外兩家(自帶 live region / 交給父容器)沒有一手來源,2026-11-16 撤回

Empty primitive 不自帶 role；consumer 擁有 table、search region 或 initial-empty 的語境，強加單一 role 會與外層 live-region / describedby contract 衝突。

---

## 消費範例

```tsx
// Table 空狀態(最簡)——文案仍點出「缺什麼資料」,避免抽象的「無資料」(見「禁止事項」)
<Empty description="還沒有訂單" />

// 搜尋頁 / 篩選後的列表無結果(下拉選單的 0 筆不用 Empty,走 MenuItem message)
<Empty icon={SearchX} description="找不到符合的結果" />

// Page 首次引導(完整 slots)
<Empty
  icon={FolderOpen}
  title="還沒有專案"
  description="建立第一個專案來開始使用"
  action={<Button>建立專案</Button>}
/>

// 自訂圖片
<Empty
  icon={<img src="/empty-illustration.svg" className="w-12 h-12" alt="" />}
  description="尚無內容"
/>
```

## 現有消費者

| 元件 | 消費方式 | Padding 落點 |
|---|---|---|
| DataTable | 外層 `<div className="flex-1 flex items-center justify-center py-12">` 包 `<Empty description={emptyState} />`(有框置中) | wrapper div(非 Empty className) |
| AgentPanel 新對話(DS 元件本身沒有空狀態容器,包層住在範例輔助檔 `stories-helpers/scene/agent-demo.tsx` 的 `DemoConversation`) | 外層 `<div className="flex min-h-0 flex-1 items-center justify-center px-[var(--layout-space-loose)]">` 包 `<ScrollArea viewportTabIndex={null} className="max-h-full max-w-full">`(不寫 tabindex:放得下時不多一個 Tab 停點)包 `<Empty icon={<AgentLogo state="attract" size={48} />} title description />`(有框置中:在標頭與輸入框之間的可用範圍正中;放不下從頂開始、可捲動,見「垂直定位」有框那一列) | wrapper div(非 Empty className):只給左右 `--layout-space-loose`,上下不給 —— 垂直置中的狀態不套規則 2 / 4 的上下距離(user 2026-11-14 在 A5 成品頁的留言 ②,逐字住 `../../tokens/layoutSpace/layoutSpace.spec.md` 規則 2「適用範圍與量法三點」(3);面板算有框、左右為什麼留著【AI 推導】住 `../AgentPanel/agent-panel.spec.md`「附:空狀態」)。【更正 2026-11-14】2026-11-13(A5)包層補過上 `tight` / 下 `bottom`,已拿掉;再之前包層沒有內距 |
| AppShell 整頁 404 / 403(範例 `../AppShell/app-shell.stories.tsx#FullPageState`) | 主內容區裡的包層 `<div className="flex flex-col items-center px-[var(--layout-space-loose)] py-[calc(var(--layout-space-bottom)*2)]">` 包 `<h1>` + `<Empty description action className="mt-[var(--item-gap-label-desc-reading-lg)]" />`(無框 → 頂部對齊,見「整頁狀態」第 4 點) | wrapper div:左右 `--layout-space-loose`、上下 2 × `--layout-space-bottom`(「垂直定位」無框那一列) |
| SelectMenu | **不再消費 Empty**(2026-09-08):選單訊息列走 `MenuItem message`,由 `CommandEmpty` own(`../SelectMenu/select-menu.spec.md`「Empty state」);spinner-only loading 走 `CommandLoading` 訊息列(列圖示尺寸轉圈) | —(無 Empty) |
| Select / Combobox / PeoplePicker | 透過 SelectMenu → 同上,不消費 Empty | — |

## 禁止事項

- ❌ 把 Empty 拿來當 spinner-only loading host — Empty 是「確定沒有」語意;loading 用 `<Skeleton>`，或用具 accessible name 的 `role="status"` wrapper 包 `<CircularProgress>`。只有確實有空狀態解釋時才可在 Empty 內含進度視覺，且仍必須傳 meaningful description
- ❌ 把 Empty 拿來顯示 error state(只有 description)— error 需明確 action(重試 / 報告 / 聯絡支援),用 `<Alert>` + 重試 button
- ❌ Empty title / description 文案太抽象(「Nothing here」「No data」)— 應描述「缺什麼資料」+「為什麼空」+「下一步動作」，讓空狀態本身可以指引恢復路徑
- ❌ Action button 用 destructive variant — Empty 是引導 onboarding 心境,destructive 視覺敵意衝突
- ❌ 整頁 Empty 但無 action — user 困惑「我該做什麼」;若該頁本質無 action(等待後台 invite),改用 Alert/Notice 解釋

## 為何無 ColorMatrix / SizeMatrix / StateBehavior

Empty 是 **pure layout primitive**(排列 icon / title / description / action 成居中垂直堆疊),不是 variant-driven 元件,也無互動狀態:

- **無 ColorMatrix**:Empty 自身不帶任何色彩,bg transparent,text color 全部走 semantic token(`text-foreground` title / `text-fg-secondary` description-with-title / `text-fg-muted` 孤身 description / `text-fg-disabled` disabled context)。Avatar icon 的色彩由 consumer 透過 `<Avatar color="...">` 決定,非 Empty 層級 variant。
- **無 SizeMatrix**:Empty 無 `size` prop,垂直 padding 由 consumer 容器決定(Table `py-12` / Page `py-16`),固定間距不隨 density 變(展示性元件,見本 spec「間距」段)。
- **無 StateBehavior**:Empty 是非互動展示元件,無 hover / focus / active / selected 互動狀態。CTA button 的互動狀態屬 Button 層級,不屬 Empty。**唯一例外是 disabled context state**(`disabled?: boolean` prop):非互動狀態,但元件支援——disabled 時 title / description 轉 `text-fg-disabled`、icon glyph 轉 fg-disabled(供 FileUpload disabled 等情境消費),預設 false —— 停用是外層容器傳進來的情境狀態,Empty 自己沒有理由預設停用【AI 推導 2026-11-16:原文只寫了相容,這句是讀用法推出來的】。

**Inspector**:提供互動切換式 Inspector(右側 Controls 面板切換 icon / title / description / action),讓 consumer 即時查看 Empty 在不同 slot 組合下的呈現——slot 組合(description only → full)是 Empty 唯一的關鍵決策。

對應 anatomy story:`Overview` + `Inspector`(互動切換)+ `Accessibility` + 元件特有 `ScenarioMatrix`(常見業務場景)+ 元件特有 `SlotCombinations`(slot 組合對照)。

---

## 相關

- `../Avatar/avatar.tsx` — Icon 渲染實作
- `../AppShell/app-shell.spec.md` — 整頁 404 / 403 的位置(主內容區;見本檔「整頁狀態」)
- `../CircularProgress/circular-progress.spec.md` — Loading 狀態(非「空」而是「還沒來」;spinner-only loading 用具 accessible name 的 `role="status"` host)
- `../Alert/alert.spec.md` — Error 狀態（非中性空，是需處理的問題）
- `../FileUpload/file-upload.spec.md` — **本元件 consumer**:FileUpload 預設 children 直接渲染 `<Empty icon={Upload} title description />`,共用 icon+title+desc SSOT
- `../../tokens/typography/typography.spec.md` — Typography tier
- `../../tokens/layoutSpace/layoutSpace.spec.md` — Layout-space token
- `../../patterns/element-anatomy/item-anatomy.spec.md` — label → desc gap(token `--item-gap-label-desc-reading-lg` / primitive `<ItemContent>`)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `agent-panel.spec.md`
- `carousel.spec.md`
- `circular-progress.spec.md`
- `file-upload.spec.md`
- `file-viewer.spec.md`
- `layoutSpace.spec.md`
- `people-picker.spec.md`
- `select-menu.spec.md`
- `skeleton.spec.md`
- `tree-view.spec.md`
