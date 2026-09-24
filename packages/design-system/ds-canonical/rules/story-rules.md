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

## 元件一律定義在 module 層,禁寫在 `render()` 裡(2026-09-17)

- **規則**:story 需要小元件(`Section` / `Toggle` / `Swatch` / `Page` 這種),**定義在檔案 module 層**,不要寫在 `render()` 內。
- **為什麼**:React 用「元件函式的身分」判斷是不是同一棵樹。寫在 `render()` 裡的話,外層每次 `setState` 都會建立一個新的函式 → React 視為換了元件 → **底下整棵樹卸載重掛**。輕則焦點掉,重則整個開著的浮層消失。
- **錨**:`data-table.stories.tsx`「進階篩選 — 各種狀態」的 `Section` 包住 DataTable,篩選面板一開著,**點任何一個選項**(不是只有新加的全選按鈕)整個面板就不見。對照實測:點 `Electronics` 跟點全選,`[data-radix-popper-content-wrapper]` 都是 1 → 0,兩者一模一樣 —— 證明跟按鈕無關,是重掛。同日全 DS 掃出同一寫法五處(DataTable / Coachmark / FileViewer / TimePicker / density),一起搬出 `render()`。
- **哪種形狀不算**:`const X = () => { ...useState... }` 且**外層 render 沒有 state**、只渲染一次(Rating / DateGrid / Dialog 共 7 處)。外層不會重跑就不會重掛。判準是「外層 render 有沒有 state」,不是「有沒有寫在裡面」。
- 對齊 React 官方文件「Do not define a component during rendering」(<https://react.dev/reference/rules/components-and-hooks-must-be-pure#do-not-define-a-component-during-rendering>)。

## 按鈕 variant:單獨的按鈕一律 tertiary(2026-09-18)

- **規則的主人是 `components/Button/button.spec.md`「Variant 控制視覺強調等級」表**,本節只是 story 層的落地與閘:
  `secondary` **只用在正面與負面選項並存時代表正面那個**(儲存草稿 vs 放棄變更);單獨的觸發鈕 / 取消 / 一般輔助動作一律 `tertiary`——那也是 cva 預設(`button.tsx:217`,2026-06-06 從 primary 改過來)。
- **錨**:2026-09-18 user 問「按鈕預設不是應該用 tertiary 嗎?我沒有特別要求為何要使用 secondary?root cause 是什麼?我們的 ds 的設計原則寫得不夠清楚嗎?」——查證後 **原則寫得很清楚,缺的是閘**:當天全 DS story 內 54 處 `variant="secondary"`,扣掉 Button 自家的 variant 展示 22 處,其餘 30 處**一處都沒有並存的負面選項**(機械驗過 ±4 行內無 `danger` 兄弟),全是單獨觸發鈕或輔助動作。同日一次全改成 `tertiary`。
- **閘**:`check_story_invariants.sh` R12 `secondary_variant_pair`(P0 BLOCKER)。Button 自家 stories 是 variant 展示場,天然豁免;真的成對時檔內寫 `// @secondary-pair: <並存的負面選項是什麼>`。

## 示範 = 滑鼠使用者(2026-09-23 user 裁示)

- **user 原話**:「我不要用滑鼠看範例結果直接就看到鍵盤焦點,我當下明明就沒有用鍵盤操作」。同題 2026-09-08 已出現過一次(下方「禁原生控件」那條的錨:用滑鼠開 modal 就出鍵盤框),當時只收了原生控件這一支,沒收根因。
- **根因不在元件**:Chromium 只把真正的指標點擊記成滑鼠聚焦(`selector_checker.cc` `!last_focus_from_mouse || had_keyboard_event`,`document.cc` 忽略 script focus);示範用的合成點擊(`userEvent.click` / `element.click()`)不算,之後元件自己把焦點搬進浮層(Radix FocusScope / react-day-picker autoFocus / dialog.tsx),瀏覽器就判成 `:focus-visible` 畫出鍵盤框。真人用滑鼠點開不會這樣。
- **落地在預覽層,不逐支改**:`packages/storybook-config/preview.tsx` `settleDemoFocus` —— 每支 story 渲染(含 play)完成後,焦點若被判成鍵盤焦點又真的畫出 outline 就放掉;之後**直到使用者第一次按鍵或按下指標之前**,任何再被程式搬來的這種焦點也一律放掉(Radix 選單關閉後還焦點給觸發鈕、Dialog 量完內文後聚焦捲動區,都在渲染收尾之後才發生 —— 2026-09-23 全掃抓到 dialog long-content / list-body / tabs state-contract 三支)。只放掉畫得出線的,容器(outline none)與文字輸入框不動。**只在人看的情境開**:在 Storybook 管理介面的 iframe 裡(`window.parent !== window`)才收尾;閘直接開 `iframe.html` 用 `page.focus()` 量焦點框時視為儀器、不收尾(第一版全域開啟,區間閘的鍵盤段當場被放掉焦點而紅);要看 user 畫面的儀器自己帶 `?demoFocus=on`(visual-audit 拍基準圖、story-demo-focus 閘),`?demoFocus=off` 強制關。邊界:Storybook「在新分頁開啟 canvas」的真人也會被當儀器(看得到程式搬來的框;那是直接開 iframe.html,無法與儀器區分)。鍵盤使用者從管理介面按 Tab 進畫布時,keydown 發生在父文件、iframe 只收到 focusin —— 收尾同時聽父文件(同源)的 keydown,第一次 Tab 就停手,第一顆元素保住框(2026-09-24 審查抓到的回歸,修前會把它放掉)。afterEach 在每次 render(含改 control 的 rerender)都會重新掛監聽,用過鍵盤後改 control 再被程式搬焦點時仍會放掉 —— 可接受,再按一次鍵就恢復。**要示範焦點的 story**(滑鼠移過 / 鍵盤聚焦、焦點鎖、焦點接力、play 裡明寫 `.focus()` 或 `userEvent.keyboard`)寫 `parameters: { demoFocus: 'keep' }`,沒寫就是滑鼠使用者。
- **閘**:`scripts/story-demo-focus-invariant.mjs`(CI「DS-wide story sweeps」)逐支載入全部 story,**等 afterEach 蓋的 `<html data-demo-focus-settled=<story id>>`**(= play 與收尾都跑完;不用固定睡眠當代理,2026-09-24 慢 runner 上 Toast 的 play 還在點按鈕就被量到而假紅),`<html data-demo-focus>` 不是 keep 卻留著畫得出線的鍵盤焦點 → 紅;`--selftest` 用真鍵盤 Tab 造一個框證明儀器看得到,並把 CPU 節流 30 倍證明「固定睡眠量不到、等章量得到」。截圖儀器 `visual-audit.mjs` 不再另有一份 blur 規則(2026-09-23 前它用 id regex 決定誰保留焦點,把 user 看得到的框擦掉才拍)。

## 禁止

- **展示層 story 禁原生 `<button>` / `<input>` / `<textarea>` / `<select>`**(hook `check_story_invariants.sh` R1 A.5,2026-09-08):raw 控件會吃到全域 `:focus-visible` 框、樣式跟 DS 元件不一致(user 抓到 agent 並存範例用滑鼠開 modal 就出鍵盤框)。例外只有 Radix `asChild` 觸發殼、`sr-only` 測試輔助、`@anatomy-exempt-next`。

❌ 佔位符 / 抽象代號 / 極端不現實 / 視覺符號 / spec 內部代號。詳 → `/story-writing` skill。
