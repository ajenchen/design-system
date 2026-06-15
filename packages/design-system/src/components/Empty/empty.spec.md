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

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Empty 設計原則

**空狀態視覺元件**——容器內沒有內容時的居中提示。Table、SelectMenu、Combobox、Page section 等所有需要空狀態的元件統一消費。

## 定位

一個 **layout pattern**(不是 field-level 元件)。它排列 icon / title / description / action 成居中垂直堆疊,間距固定不隨 density 變(見「間距」段)。

預設只有 description——icon / title / action 全部可選。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **Table / list / grid 空狀態**：DataTable 查無資料、搜尋無結果
- **SelectMenu / Combobox 下拉空**：「無選項」「找不到符合的項目」
- **Page section 無內容**：dashboard widget 暫無資料、設定頁未建立任何項目
- **初次引導**：讓使用者首次使用時知道「這裡會放什麼」+ 有 CTA 建立

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| Loading 中(資料還沒來) | `Skeleton` / `CircularProgress` | Empty 是「確定沒有」,Loading 是「還沒確定」 |
| 錯誤 / 失敗狀態 | `Alert` + 重試按鈕 | Error 需要明確告知「發生什麼問題」+ 解決途徑，Empty 是中性提示 |
| 整頁級別的 404 / 無權限 | 專屬錯誤頁面 | Empty 是容器內提示，整頁錯誤需要完整頁面佈局 |
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
- **Description**(`description?: string`,預設無 — 但是唯一必有的 slot):說明文字,次要色、居中
- **Action**(`action?: ReactNode`,預設無):CTA Button 或任何操作,居中

## 間距

固定值,不隨 density 變(Empty 是展示性元件,不是工作區域元件——展示性文字不跟 field-height tier 連動):

- **Icon → Title/Desc**:視覺 → 文字過渡需充足呼吸空間(48px icon 尺寸不宜貼近文字)
- **Title → Description**:緊密配對(同資訊塊,對齊 item-layout canonical 的 label ↔ desc gap)
- **Description → Action**:資訊 → 行動的視覺暫停,引導使用者注意 CTA

Outer padding 由 **consumer 容器** 決定(Table 空狀態需較大留白、SelectMenu dropdown 較緊湊、Page-level 最寬鬆)。

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
| **有框**(Table / Dialog / Card,有明確 border 或 shadow 包圍) | **垂直置中** | 容器 `flex items-center justify-center min-h-[...]` |
| **無框**(Page section,沒有外框線) | **頂部對齊 + generous padding** | 容器 `py-[calc(var(--layout-space-bottom)*2)]` |

### 為什麼有框置中、無框不置中

有框容器有明確的視覺邊界——使用者知道「這個框裡面是空的」。居中把 Empty 放在框的視覺重心,安定。

無框容器沒有邊界——如果居中,Empty 會脫離頁面視覺中心,使用者不知道空的範圍有多大。頂部對齊 + `calc(var(--layout-space-bottom) * 2)` padding 讓 Empty 有固定位置,用留白空間本身創造「這裡是空的」的視覺重量,取代框線的作用。

## 邊界案例

- **極長 description**:不截斷、不限寬,自然換行(見「文字不限寬」段)— 文案長度由文案設計者控制
- **動態變空**(filter / search 從有結果 → 無結果):視覺與靜態空狀態完全相同,無轉場;consumer 容器加 `aria-live="polite"` 通知 SR(見「A11y 預設」)
- **全 slot 缺值**:code 不擋空 render,但 description 是唯一必有 slot(見「Slots」段)— 無任何 slot 的 `<Empty>` 渲染成空容器,屬 consumer 誤用

---

## A11y 預設

Empty 是 **non-interactive layout primitive**——本身無 ARIA role(讓 consumer 容器決定 region semantics)。但 consumer 應遵循以下慣例:

| 場景 | Consumer 容器應加 | 為什麼 |
|------|----------------|------|
| Table / List 空狀態 | `<table aria-describedby={emptyId}>` 或在容器加 `aria-live="polite"` | screen reader 在資料載入完成時主動通知「無資料」(對齊 Polaris EmptyState pattern) | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| Search / Filter 無結果 | container `aria-live="polite"` + 文案明確指向搜尋詞(「找不到符合『XXX』的結果」)| 對齊 Material `<NoOptions>` + Atlassian Empty Search idiom — 變動結果需 live region | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| Page section 暫無內容 | `<section aria-labelledby={titleId}>` + `<h2>` 包 title slot | 對齊 WCAG 2.1 SC 2.4.6 標題明確語意 |
| 初次引導(有 CTA) | Action Button 自帶 a11y;無需 Empty 層額外 ARIA | CTA 是真實互動 element,自己的 a11y 足夠 |

**Title slot heading level**:Empty 不渲染 heading tag(`<h1>` / `<h2>`),只 `<div>` + 視覺 typography。Consumer 若需 heading semantic,在外層自包 `<h2>{title}</h2>` + 不傳 Empty 的 title prop(避免重複)。

**Icon slot**:LucideIcon 自動渲染 `aria-hidden="true"`(decorative);ReactElement(自帶 Avatar / Illustration)由 consumer 控制 `aria-hidden` / `alt`(若是 `<img>` 必傳 `alt=""` 表示 decorative)。

**Description 不需 live announcement**:Empty 本身是「靜態空狀態提示」(進入時就空),不是「動態變化結果」。動態變化(filter / search 結果切換)由 consumer 在容器層加 `aria-live`,不在 Empty 內。

世界級對照:
- **Polaris** `<EmptyState>`:容器層 `aria-labelledby` + heading 由 prop 控制 level(consumer 決定 `<h2>` / `<h3>`)
- **Material** `<NoOptions>`(Autocomplete 內):容器自帶 `role="listbox"` + `aria-live="polite"` 通知無結果
- **Carbon** `<EmptyState>`:無自帶 ARIA,文檔指引 consumer 在父容器設 `aria-describedby`

本 DS 對齊 Carbon「primitive 不自帶 ARIA,consumer 控制」哲學——避免 Empty 強加 role 跟 consumer 容器衝突。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 消費範例

```tsx
// Table 空狀態(最簡)
<Empty description="沒有資料" />

// SelectMenu 無結果
<Empty icon={SearchX} description="找不到符合的結果" />

// Page 首次引導(完整 slots)
<Empty
  icon={FolderOpen}
  title="還沒有專案"
  description="建立第一個專案來開始使用"
  action={<Button>建立專案</Button>}
/>

// 自訂色彩(success result)
<Empty
  icon={<Avatar icon={CheckCircle} size={48} color="green" />}
  title="已成功送出"
  description="我們會盡快處理"
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
| SelectMenu | `<Empty description={emptyText} className="py-6" />`(loading 時 `<Empty icon={<CircularProgress size={48}/>} className="py-6" />`) | Empty className |
| Combobox | 透過 SelectMenu(dropdown 即 SelectMenu primitive)→ 無結果時顯 SelectMenu 的 `<Empty>` | 同 SelectMenu |

## 禁止事項

- ❌ 把 Empty 拿來顯示 loading state(無 description 又無 spinner)— Empty 是「確定沒有」語意,loading 用 `<Skeleton>` / `<CircularProgress>` 或 `<Empty icon={<CircularProgress />}/>` compose
- ❌ 把 Empty 拿來顯示 error state(只有 description)— error 需明確 action(重試 / 報告 / 聯絡支援),用 `<Alert>` + 重試 button
- ❌ Empty title / description 文案太抽象(「Nothing here」「No data」)— 應描述「缺什麼資料」+「為什麼空」+「下一步動作」(對齊 Polaris EmptyState / Carbon Empty State copy guideline) <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- ❌ Action button 用 destructive variant — Empty 是引導 onboarding 心境,destructive 視覺敵意衝突
- ❌ 整頁 Empty 但無 action — user 困惑「我該做什麼」;若該頁本質無 action(等待後台 invite),改用 Alert/Notice 解釋

## 為何無 ColorMatrix / SizeMatrix / StateBehavior

Empty 是 **pure layout primitive**(排列 icon / title / description / action 成居中垂直堆疊),不是 variant-driven 元件,也無互動狀態:

- **無 ColorMatrix**:Empty 自身不帶任何色彩,bg transparent,text color 全部走 semantic token(`text-foreground` title / `text-fg-secondary` description-with-title / `text-fg-muted` 孤身 description / `text-fg-disabled` disabled context)。Avatar icon 的色彩由 consumer 透過 `<Avatar color="...">` 決定,非 Empty 層級 variant。
- **無 SizeMatrix**:Empty 無 `size` prop,垂直 padding 由 consumer 容器決定(Table `py-12` / SelectMenu `py-6` / Page `py-16`),固定間距不隨 density 變(展示性元件,見本 spec「間距」段)。
- **無 StateBehavior**:Empty 是非互動展示元件,無 hover / focus / active / selected 互動狀態。CTA button 的互動狀態屬 Button 層級,不屬 Empty。**唯一例外是 disabled context state**(`disabled?: boolean` prop):非互動狀態,但元件支援——disabled 時 title / description 轉 `text-fg-disabled`、icon glyph 轉 fg-disabled(供 FileUpload disabled 等情境消費),不影響既有 consumer(預設 false)。

**Inspector**:提供互動切換式 Inspector(右側 Controls 面板切換 icon / title / description / action),讓 consumer 即時查看 Empty 在不同 slot 組合下的呈現——slot 組合(description only → full)是 Empty 唯一的關鍵決策。

對應 anatomy story:`Overview` + `Inspector`(互動切換)+ `Accessibility` + 元件特有 `ScenarioMatrix`(常見業務場景)+ 元件特有 `SlotCombinations`(slot 組合對照)。

---

## 相關

- `../Avatar/avatar.tsx` — Icon 渲染實作
- `../CircularProgress/circular-progress.spec.md` — Loading 狀態(非「空」而是「還沒來」;全頁 loading 可 `<Empty icon={<CircularProgress size={48}/>}/>` compose)
- `../Alert/alert.spec.md` — Error 狀態（非中性空，是需處理的問題）
- `../FileUpload/file-upload.spec.md` — **本元件 consumer**:FileUpload 預設 children 直接渲染 `<Empty icon={Upload} title description />`,共用 icon+title+desc SSOT
- `../../tokens/typography/typography.spec.md` — Typography tier
- `../../tokens/layoutSpace/layoutSpace.spec.md` — Layout-space token
- `../../patterns/element-anatomy/item-anatomy.spec.md` — label → desc gap(token `--item-gap-label-desc-reading-lg` / primitive `<ItemContent>`)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `carousel.spec.md`
- `circular-progress.spec.md`
- `combobox.spec.md`
- `command.spec.md`
- `file-upload.spec.md`
- `file-viewer.spec.md`
- `select-menu.spec.md`
- `select.spec.md`
- `sheet.spec.md`
- `skeleton.spec.md`
- `tree-view.spec.md`
