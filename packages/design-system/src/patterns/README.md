# patterns/ Charter

## 這裡只收:runtime UI 佈局 / 互動 primitive

每個 pattern 提供**多元件在 runtime 實際消費**的東西:
- `.tsx` / `.ts` 實作(primitive component / hook)
- `.spec.md` 設計原則
- `.stories.tsx` 展示
- `.example.tsx`(選用)

**核心特徵**:元件 code 會 `import` 這個 pattern 使用,或遵循它畫出相同視覺結構。

## Public pattern vs Internal pattern(2026-05-23 user 永久拍板 SSOT)

詳定義 → `.claude/rules/ui-development.md`「Public component vs Internal primitive canonical」段。

- **Public pattern**:end-user app 可直接 `<X />` render(`action-bar` / `resize-handle` / `element-anatomy` MenuItem)。Storybook title `Design System/Patterns/<Name>`。
- **Internal pattern**:end-user app 直接 render 無 functioning UI,需 DS 內部其他元件 wrap(`header-canonical/ChromeHeader` / `horizontal-overflow useOverflowItems` / `overlay-surface SurfaceHeader/Body/Footer`)。Storybook title `Design System/Internal Patterns/<Name>`。Frontmatter `internal: true`。Export jsDoc `@internal`。
- 下方 "當前居民" 表「Consumer」欄 = **DS-internal consumer**(不是 end-user app)— 若 Consumer 全是 other DS components → internal pattern。

## 當前居民

| Pattern | 提供什麼 runtime primitive | Consumer |
|---------|-------------------------|----------|
| `element-anatomy/` | flat 多檔 home:<br>• `element-anatomy.spec.md` — 4-family taxonomy overview(F1-F4,F3/F4 pointer out)<br>• `item-anatomy.{spec.md,tsx,stories.tsx}` — F1/F2 row 深度 SSOT + runtime primitive(`<MenuItem>` + slot components `<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>`) | Menu / Tree / Sidebar / File / Selection 等 row 元件;所有元件 spec 第一段宣告 Family 時查 element-anatomy.spec.md |
| `action-bar/` | `action-bar.tsx` + `action-bar.spec.md` — toolbar / action row 排列公式 | 任何有按鈕列的頁面 |
| `horizontal-overflow/` | `useOverflowItems` hook + fade-mask 樣式 | Tabs / ChipGroup |
| `overlay-surface/` | `SurfaceHeader/Body/Footer` sub-components + padding SSOT | Dialog / Popover / Sheet |
| `header-canonical/` | `<ChromeHeader>` primitive(withTabs / lockDensity 窄 API)+ cross-family canonical SSOT(chrome + overlay 兩家族 W1-W6 lockstep:border auto-suppress / token equality / tabs size 對應 / flush stack / md future tier / sm default)| Sidebar / FileViewer Toolbar / FileViewer InfoPanel(ChromeHeader 直接消費);Dialog / Sheet / Popover(SurfaceHeader 走 cross-family canonical)|

> **note**:i18n 已 relocate 到 `packages/design-system/src/lib/i18n/`(2026-05-01)— patterns/ 純化只收 visual primitive,non-visual cross-cutting 改去 `lib/`(對齊 Material `@mui/material/locale` / Ant ConfigProvider 共識)。詳 `packages/design-system/src/lib/README.md`。

## 命名鐵律:element-level「anatomy」 vs page-level「layout」

element-level 結構分類永遠用 **anatomy**(Material / Polaris / Atlassian / Carbon 一致)。「layout」一詞**保留給 page-level**(未來頁面版面設計原則的家)。違反 → audit #19 會抓。

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 「怎麼寫 story」的指南 | `.claude/skills/story-writing/` | 文件撰寫 workflow,不是 runtime primitive。AI 只在寫 story 時需要 |
| 「元件完成清單」/ 品質 gate | `.claude/skills/component-quality-gate/` | 是 invoke-time checklist,不是 runtime primitive |
| 「規則放哪裡」的 8-home 指南 | `.claude/skills/design-system-audit/references/rule-placement.md` | governance reference,audit skill 相關 |
| CLAUDE.md 某段太長想搬出來 | 先看 8-home flowchart:是 runtime pattern 才來這 | 「要搬出 CLAUDE.md」不等於「該放 patterns/」 |
| 單一元件的規則 | `components/{Name}/{name}.spec.md` | 只 1 個元件影響範圍 |
| Token 命名規則 | `tokens/` 對應 spec | |
| Cross-cutting non-visual primitive(i18n / formatters / type modules)| `packages/design-system/src/lib/{topic}/` | 無 visual surface — 對齊 Material `@mui/material/locale` / Ant ConfigProvider 共識 |

## 新增 pattern 的 criteria(必須全部通過)

1. **至少 2 個元件消費它**(spec 必須明列 consumers 清單)
2. **提供 runtime 實作**(primitive component、hook、或明確的結構公式讓 consumer 重現)
3. **不能是單元件內部細節**(那屬 `components/{Name}/{name}.spec.md`)
4. **不能是文件 / 工作流 / governance rule**(那屬 Skill 或 ref)

四條任一不過 → 停下來 reclassify,不強塞。

## 命名

- folder name: kebab-case(`element-anatomy/`、`action-bar/`)
- **單檔 pattern**: `.spec.md` / `.tsx` / `.stories.tsx` 與 folder 同名(`action-bar/action-bar.tsx`)
- **多檔 topical pattern**(如 `element-anatomy/`): folder 為 topic 領域,含 `{folder}.spec.md`(overview)+ 具體 topic 各自檔案(`item-anatomy.{spec.md, tsx, stories.tsx}`)——flat 不 nested
- Export 名走產業 idiom(`MenuItem`、`ItemIcon`、`ItemAvatar`、`ItemLabel`、`ItemSuffix`、`ItemInlineAction` 等 slot pattern — 對齊 Material ListItem / Polaris / Ant / Radix compound-component)

## 檔案清單生效規則

本 README 列的 charter = 唯一真實來源。建立新 pattern 前必先 Read 本檔。
