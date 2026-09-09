---
paths:
  - "**/*.stories.tsx"
---

# Story 規則(path-scoped)

僅在編 `*.stories.tsx`(showcase / anatomy / principles 三層)時 load。
**完整 workflow → `/story-writing` skill**。

## 三層定位

| 層 | 檔案 | Canonical | Hook | Audit Dim |
|---|------|-----------|------|-----------|
| 1 展示 | `*.stories.tsx` | trait-based v2 | `check_story_invariants.sh` R3 category | 29 |
| 2 設計規格 | `*.anatomy.stories.tsx` | 6-canonical(Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior / Accessibility)| —(6-canonical 由 Dim 13 batch verify + `compile-stories.mjs --check` 兜底;`check_story_invariants.sh` R1 = 展示層 hand-craft 偵測,2026-06-11 起豁免 anatomy 檔)| 13 |
| 3 設計原則 | `*.principles.stories.tsx` | ONE complete `UsageGuidance` sufficient；split style 才需 ≥ 2 個 distinct decision dimensions；額外 story 必須 earn existence | `check_canonical_propagation.sh` E.1 principles | 30 |

## Title 命名

**2 namespace canonical**(2026-05-28 codify per template create-app duplicate-id bug anchor):

| Repo / Path | Title pattern | 用途 |
|---|---|---|
| **DS repo** `packages/design-system/**/*.stories.tsx` | `Design System/{Tokens|Patterns|Components|Internal|Internal Patterns}/{Name}/{展示|設計規格|設計原則}` | DS 元件 / token / pattern building block |
| **Consumer apps**(template / fork repos)`apps/**/*.stories.tsx` | `Apps/{app-kebab-name}/{Page Purpose}` | 產品 UI composition demo(eg. `Apps/order-dashboard/AppShell Dashboard`)|

**Why 不統一**:DS 是 building block library(可重用元件),consumer apps 是 product UI 真實 composition demo(整頁、整 flow)。Namespace 不同 = Storybook sidebar 兩塊清楚分區。

**Universal rule**:第一層英 / PascalCase 或 kebab-name / 子頁中文 / 子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)。

**Template create-app 機械強制**(2026-05-28 ship):`scripts/create-app.mjs:patchStoryTitles()` 遞迴改 copied apps 內所有 `*.stories.{tsx,ts,mdx}` 的 `title: 'Apps/template/...'` → `Apps/<new-name>/...`,**防 Storybook duplicate id**(e2e verify-flow-test anchor 抓到 4 collisions)。

**Internal vs Components 三 test**:(1) 有預設視覺?(2) 直接 `<X>` 有視覺?(3) 所有消費者都包 wrapper?三題傾向 Internal → `Internal/`。**例外:compound-component public API**(`Dialog.Root/Trigger/Content` / `Field + FieldLabel + FieldError + FieldDescription` 等定義 sub-component 給 consumer 拼的 documented composition pattern)豁免三-test — 它**定義** sub-components,不是被 wrap 的零件。對齊 Radix Dialog / MUI FormControl + InputLabel + FormHelperText / Mantine Input.Wrapper compound idiom。

**Title canonical 4-part exemption**(2026-05-16 codified):**Tokens / Patterns** 為 single-file showcase(無 anatomy/principles 對應)→ 3-part title 是 intentional convention(`Design System/Tokens/{Name}` / `Design System/Patterns/{Name}`),不是違反。**Components / Internal** 必 4-part(`/{Name}/{展示|設計規格|設計原則}`)因有 3 stories 對應 file 需 subpage 分流。

**Patterns `{Name}` 必 spaced Title Case**(2026-06-12 codify,命名 3 重 test 全過):多字 pattern title 用人話 spaced(`Action Bar` / `Item Anatomy` / `Resize Handle`),非 PascalCase — title 是 reader-facing label,與 code identifier(`ResizeHandle`)雙軌分工;對齊 Atlassian「Avatar group」/ Polaris「Empty state」/ Carbon「Date picker」catalog spaced idiom。Tokens 第三層維持與 token 資料夾同名構詞(`LayoutSpace` ← `layoutSpace/`),不在此 rule scope。

**MenuItem-as-listbox-child 鍵盤 delegation 例外**(2026-05-16 codified per Combobox spec.md L130-142):MenuItem `<div role="option">` 不需自帶 Enter/Space handler — 由 parent listbox(Combobox / SelectMenu / DropdownMenu)的 hidden native `<select>` handle 鍵盤導覽(對齊 Material/Atlassian/GitHub mixed-control「單 native tab stop + 多 mouse click surface」 canonical)。MenuItem 為 building block 不該重複 handler。

**Story `name:` field 必中文人話**(no auto-compile 豁免):anatomy 6-story canonical 的中文 name(如 `'元件總覽'`)為 checked-in convention(`check_story_invariants.sh` R4 title_canonical / R5 name_jargon 看守);`compile-stories.mjs` 僅做 spec/tsx componentMeta key drift `--check`(stdout POC markdown),**不**產生 stories 或 name 欄。Manually-written stories `name:` 用純英文 implementation label(`'Default'` / `'Pressed'` / `'SizeMatrix'`)= drift,**必 humanize 中文**。Export const 維持 PascalCase(英)為 code identifier,**`name:` field 為 reader-facing 必中文**(術語例外:`FAQ` / 元件名 `Avatar/Tooltip` 等專有可保英)。

**Autodocs component 導讀必寫**:reader-facing、非 anatomy 的 meta 只要標
`tags: ['autodocs']`，就必在 `parameters.docs.description.component` 用 1–3 句人話回答
「這個單元解決什麼」與「何時用／何時改用近親」。不可只重複 component 名、props 或內部代號，
也不可用 TODO/WIP stub。機械 gate=`scripts/audit-content-quality.mjs --check`；語意是否真的提供
用途與選擇判準仍由 Deep Audit Storybook content judgment 全量判讀。

**Technical probe visibility**:只服務 hover/focus/open snapshot、效能量測、import smoke 等
automation 的 story，在該 story 本身標 `tags: ['test-only']`。Shared Storybook runtime 會把它從
sidebar 與 Autodocs 教學內容排除，但仍保留在 story index、direct URL、a11y/interaction runner。
禁止用 `!autodocs` 代替，也禁止再加 `!dev` / `!test` 把 probe 從 index 或測試面移除；真正
reader-facing 的 scenario 不得標 `test-only`。機械 gate=`scripts/audit-content-quality.mjs --check`，
回歸 inventory=`scripts/test-storybook-test-only-semantics.mjs`。

## 範例最高準則

精簡幹練、0 重複、每 story earn its existence；Autodocs 先有用途/選擇導讀，再讓各 story
各教一件新事(audit Dim 24/25/28/29/30/43 抓)。

**Earn-existence 2 test**:(a) 教別 story 沒教的原則?(b) 移除後 spec 理解 degrade?兩題皆 NO → retire。

**Production-grade composition fidelity**(2026-05-20 codify per codex anti-drift D2):
- 寫 stories wrap **既有 primitive**(`<Sidebar>` / `<ChromeHeader>` / `<Dialog>` / `<DataTable>` 等)時,**必先 grep 該 primitive `*.stories.tsx` 找「完整佈局」類 story**(eg. `sidebar.stories.tsx IconCollapse` / `data-table.stories.tsx WithBulkActions`),Read 其 helper(`WorkspaceBrand` / `UserFooter` / `PageContent` / toolbar pattern 等)**當 baseline reference**
- 禁直接寫 simplified mock(`<SidebarHeader><span>name</span>` / `<SidebarMenuButton><Icon className="size-4">` / `<ChromeHeader><span flex-1>title</span>`)= drift
- 標 `// @story-baseline: <path>#<StoryName>` 在 stories.tsx 檔頭,reference 哪個 baseline。Hook `check_story_invariants.sh R7` 攔 drift(2026-05-20 ship)。

**拆分原則**(對齊 Polaris / Carbon / Storybook):
- 不同 affordance 必分(IconOnly / FullWidth)
- AllVariants & AllSizes 對照各 1
- 同 affordance 內 prop variations 用 Controls 不另開(❌ `WithStartIcon`+`WithEndIcon` → ✓ `WithIcon` grid)
- Compound 有 new constraint 才分

**展示 v2 trait-based**:spec.md frontmatter `traits:` array → required core stories 衍生 + hook `check_story_invariants.sh` R3 category 攔。

**Showcase representative canonical**:每檔至少一個 reader-facing 代表範例；不強迫 exact `Default` export。`Default` 只有在 minimal baseline 本身通過 earn-existence 時才開。

**Principles canonical**(Polaris-aligned):ONE complete `UsageGuidance` sufficient；split style 才需 ≥ 2 個 distinct decision dimensions。額外 story 只有教不同主題且通過 earn-existence 才保留。SSOT → `/story-writing` skill `references/category-templates.md`。

## 整頁情境(2026-09-08 user 拍板形狀)

- **畫布 / 說明分區**:要演「整頁 + 浮層 + 常駐面板」的 story,用 `stories-helpers/scene/simulated-browser.tsx`:上方工具列(上一頁 / 下一頁 / 網址列,DS Button + Input)是**說明用**,下方畫布是**擬真的產品畫面**;Dialog / FileViewer 用 `portalContainer={canvas}` 傳送進畫布。說明放 story 的 docs description,**畫布下方不放備註、不放進畫布、不放進代理面板**(user 2026-09-09:「模擬瀏覽器下方的備注可以拿掉」;要在畫面裡解釋就寫成代理自己的回覆,用 `AgentMessage` 的樣式);模擬瀏覽器撐滿 story、與 story 邊界四周各留 `--layout-space-loose`。
- **畫布裡只准 DS 元件 + 真實業務內容**:key/value 用 `DescriptionList`、欄位用 `Field` + `Input`、按鈕用 `Button`、標題用 `DialogHeader` + `DialogTitle`(`DialogHeader` 沒有 `title` prop,寫了不會渲染)。常駐面板是畫布 flex 的直接子節點,撐滿畫布高度。
- **舞台用真元件、不縮排、不塞便條**(2026-09-09 user 指正:「為何那幾個任務清單要縮排?」「不要搞一個效能很差的 table」「dialog body 放三個像是留言的那個 field 包括標題,指派人,狀態和截止日不就好了嗎?description list 和整個留言功能都可以不用」):清單用 `DataTable`(資料極簡、不開虛擬捲動 / 拖曳 / 篩選)或 DS 清單元件,禁手刻 `<ul>` + 縮排;dialog body 照 DS 表單版面放 `Field`(`flex flex-col gap-[var(--layout-space-loose)]`,dialog.stories.tsx「建立專案」同款),不堆 `DescriptionList` + 留言區當充數;dialog header 一行標題(不用 `DialogDescription` 副標),記錄級操作走 `DialogHeader actions` 的 icon-only `text` 鈕、破壞性動作走沒有 URL 的確認框;說明一律寫在 `docs.description`,畫布與面板裡不放便條。

## 預設開啟的模態浮層 story(2026-09-09 user 抓到 docs 頁疊框)

- **規則**:`Dialog` / `Sheet` / `FileViewer` / `CommandDialog` 這類 `position: fixed` 模態浮層,凡 story 一渲染就開著(`defaultOpen`、`open={true}`、`useState(true)` 餵 `open`),**必**帶 `parameters: { docs: { story: openOverlayDocsStory('<iframe 高度>') } }`(helper:`stories-helpers/overlay/open-overlay-docs.ts` = Storybook 官方 `docs.story.inline: false` + `height`,<https://storybook.js.org/docs/api/doc-blocks/doc-block-story>)。標 `tags: ['test-only']` 的 probe 已被 shared preview 的 `docs.stories.filter` 排除在 Autodocs 外,免帶。
- **為什麼是這個機制**(三案對照後選最乾淨的一個):(a) `docs.story.inline:false` —— docs 每個 story 各自 iframe,不疊;canvas 一個位元不變,截圖 / a11y / 互動閘照跑;只加一行 parameter;(b) preview decorator 在 `viewMode==='docs'` 關掉 defaultOpen —— decorator 碰不到 story render 內部的 prop,要 DS 元件另讀 Storybook 專用 context 才做得到,把測試工具語意塞進元件;(c) 改 `play()` 開啟 + docs 不 autoplay(Storybook 預設 docs 不跑 play)—— 要改寫 30+ 檔的開啟方式,且截圖閘全部要改成「等 play 跑完」,還違背 M15 已 codify 的「Radix defaultOpen 對 Portal 自動生效」canonical。
- **meta 是 `layout: 'centered'` 的檔案改用 `parameters: openOverlayParameters('<高度>')`**(= `layout: 'padded'` + 同一組 docs 參數):SB 8.6 Canvas block 的 layout 取值順序是 `parameters.layout` 先於 `docs.canvas.layout`,docs 專用參數蓋不過 meta;centered 的 docs 畫布是 flex 置中、iframe 縮成內建 300px(對話框被擠到 204px,2026-09-09 實測)。canvas 只差觸發鈕從置中變左上,對話框本來就 fixed 置中。
- **不拿掉 defaultOpen**:M15 規定 stakeholder flow 必須有開著的快照 story;本規則只管 docs 的渲染方式。
- **錨點錄**(Dialog docs 頁,1280×800):修前 4 個可見 `[role=dialog]` + 7 個 fixed 開啟節點疊在同一份文件;修後 0 個(各自進 iframe)。
- **閘**:`scripts/dialog-coexistence-invariant.mjs`「docs 隔離」段 —— 靜態掃全部 `*.stories.tsx`(模態浮層 + 預設開啟 + 非 test-only 卻缺 `openOverlayDocsStory(` / `openOverlayParameters(` / `inline: false` → 紅)+ 瀏覽器量 Dialog docs 頁 `[role=dialog]` 可見數必 0、每個隔離 iframe ≥ 600px 寬、canvas OpenSnapshot 仍開著。

## 禁止

- **展示層 story 禁原生 `<button>` / `<input>` / `<textarea>` / `<select>`**(hook `check_story_invariants.sh` R1 A.5,2026-09-08):raw 控件會吃到全域 `:focus-visible` 框、樣式跟 DS 元件不一致(user 抓到 agent 並存範例用滑鼠開 modal 就出鍵盤框)。例外只有 Radix `asChild` 觸發殼、`sr-only` 測試輔助、`@anatomy-exempt-next`。

❌ 佔位符 / 抽象代號 / 極端不現實 / 視覺符號 / spec 內部代號。詳 → `/story-writing` skill。
