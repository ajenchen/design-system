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
| 2 設計規格 | `*.anatomy.stories.tsx` | 6-canonical(Overview / Inspector / ColorMatrix / SizeMatrix / StateBehavior / Accessibility)| `check_story_invariants.sh` R1 anatomy | 13 |
| 3 設計原則 | `*.principles.stories.tsx` | Polaris-aligned ≥ 2 of {WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines};v3 預設整合 `UsageGuidance` 單一 export(Polaris/Material/Ant 共識) | `check_canonical_propagation.sh` E.1 principles | 30 |

## Title 命名

**2 namespace canonical**(2026-05-28 codify per template create-app duplicate-id bug anchor):

| Repo / Path | Title pattern | 用途 |
|---|---|---|
| **DS repo** `packages/design-system/**/*.stories.tsx` | `Design System/{Tokens|Patterns|Components|Internal}/{Name}/{展示|設計規格|設計原則}` | DS 元件 / token / pattern building block |
| **Consumer apps**(template / fork repos)`apps/**/*.stories.tsx` | `Apps/{app-kebab-name}/{Page Purpose}` | 產品 UI composition demo(eg. `Apps/order-dashboard/AppShell Dashboard`)|

**Why 不統一**:DS 是 building block library(可重用元件),consumer apps 是 product UI 真實 composition demo(整頁、整 flow)。Namespace 不同 = Storybook sidebar 兩塊清楚分區。

**Universal rule**:第一層英 / PascalCase 或 kebab-name / 子頁中文 / 子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)。

**Template create-app 機械強制**(2026-05-28 ship):`scripts/create-app.mjs:patchStoryTitles()` 遞迴改 copied apps 內所有 `*.stories.{tsx,ts,mdx}` 的 `title: 'Apps/template/...'` → `Apps/<new-name>/...`,**防 Storybook duplicate id**(e2e verify-flow-test anchor 抓到 4 collisions)。

**Internal vs Components 三 test**:(1) 有預設視覺?(2) 直接 `<X>` 有視覺?(3) 所有消費者都包 wrapper?三題傾向 Internal → `Internal/`。**例外:compound-component public API**(`Dialog.Root/Trigger/Content` / `Field + FieldLabel + FieldError + FieldDescription` 等定義 sub-component 給 consumer 拼的 documented composition pattern)豁免三-test — 它**定義** sub-components,不是被 wrap 的零件。對齊 Radix Dialog / MUI FormControl + InputLabel + FormHelperText / Mantine Input.Wrapper compound idiom。

**Title canonical 4-part exemption**(2026-05-16 codified):**Tokens / Patterns** 為 single-file showcase(無 anatomy/principles 對應)→ 3-part title 是 intentional convention(`Design System/Tokens/{Name}` / `Design System/Patterns/{Name}`),不是違反。**Components / Internal** 必 4-part(`/{Name}/{展示|設計規格|設計原則}`)因有 3 stories 對應 file 需 subpage 分流。

**Patterns `{Name}` 必 spaced Title Case**(2026-06-12 codify,命名 3 重 test 全過):多字 pattern title 用人話 spaced(`Action Bar` / `Item Anatomy` / `Resize Handle`),非 PascalCase — title 是 reader-facing label,與 code identifier(`ResizeHandle`)雙軌分工;對齊 Atlassian「Avatar group」/ Polaris「Empty state」/ Carbon「Date picker」catalog spaced idiom。Tokens 第三層維持與 token 資料夾同名構詞(`LayoutSpace` ← `layoutSpace/`),不在此 rule scope。

**MenuItem-as-listbox-child 鍵盤 delegation 例外**(2026-05-16 codified per Combobox spec.md L130-142):MenuItem `<div role="option">` 不需自帶 Enter/Space handler — 由 parent listbox(Combobox / SelectMenu / DropdownMenu)的 hidden native `<select>` handle 鍵盤導覽(對齊 Material/Atlassian/GitHub mixed-control「單 native tab stop + 多 mouse click surface」 canonical)。MenuItem 為 building block 不該重複 handler。

**Story `name:` field 必中文人話**(no auto-compile 豁免):`compile-stories.mjs` auto-generate 已產生中文 name(如 `'元件總覽'`)。Manually-written stories `name:` 用純英文 implementation label(`'Default'` / `'Pressed'` / `'SizeMatrix'`)= drift,**必 humanize 中文**。Export const 維持 PascalCase(英)為 code identifier,**`name:` field 為 reader-facing 必中文**(術語例外:`FAQ` / 元件名 `Avatar/Tooltip` 等專有可保英)。

## 範例最高準則

精簡幹練、0 重複、每 story earn its existence(audit Dim 24/25/28/29/30 抓)。

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

**Principles canonical**(Polaris-aligned):universal core ≥ 2 of `WhenToUse`/`WhenNotToUse`/`Vs*Rule`/`ContentGuidelines` + hook 攔。SSOT → `/story-writing` skill `references/category-templates.md`。

## 禁止

❌ 佔位符 / 抽象代號 / 極端不現實 / 視覺符號 / spec 內部代號。詳 → `/story-writing` skill。
