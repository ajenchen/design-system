# patterns/ Charter

## 這裡收:多元件共用的視覺 primitive + 跨元件設計參照(anatomy)+ 組合指南

每個 pattern 是「給多元件 runtime 消費」**或**「給人/AI 設計時參照」的東西,三型:
- **runtime primitive / hook**(`.tsx` / `.ts` 實作)— eg. `ChromeHeader`(公開組合 primitive,對標 item-anatomy MenuItem/slots)/ `SurfaceHeader` / `useOverflowItems`(後二者 internal:`internal: true`)
- **跨元件設計參照 / anatomy**(可見消費者文件)— eg. `item-anatomy` 的 4-slot 結構 + 24px 閾值 + scanning/reading 模式 + Inspector;對齊世界級 **Material/Carbon「Anatomy」可見參照**(2026-06-06 研究:4 家 DS 一律把 anatomy 當可見第一線文件,**不藏**)
- **跨元件組合指南**(spec 為主,**可無 `.tsx`**)— eg. `action-bar` 的 role 系統 / 排列公式;對齊世界級 **Polaris/Atlassian/Carbon「Pattern = 組合多元件解決情境的指南」**
- 配 `.spec.md` 設計原則 + `.stories.tsx` 展示(**範例 = 人/AI 設計時的必要可見參照,不可藏**)

**核心特徵**:元件 code `import` 它,或設計時遵循它的結構/指南。

**audience-split(2026-06-06 研究 codify;對齊 Polaris/Carbon「Contributing 區」分界)**:
- ✅ 進這裡(可見前台)= 設計師/工程師**消費時要看的設計參照**(anatomy / 範例 / 組合指南)。
- ❌ **不**進這裡 = 「我們內部怎麼把東西分 component/pattern/internal/token」這種**分類/治理 meta** → 屬 `.spec.md` + `.claude/` 治理層(世界級放 **Contributing** 區,不放消費前台 Storybook;Storybook 只放範例)。

## Public pattern vs Internal pattern(2026-05-23 user 永久拍板 SSOT)

詳定義 → `packages/design-system/ds-canonical/rules/ui-development.md`「Public component vs Internal primitive canonical」段。

- **Public pattern**:consumer 可直接 import 用,或作為公開設計原則 / anatomy 參照(`action-bar` / `resize-handle` / `element-anatomy`(item-anatomy + slots)/ `header-canonical`(ChromeHeader header anatomy))。Storybook title `Design System/Patterns/<Name>`。
- **Internal pattern**:只被 DS 內部其他元件 wrap、consumer 不直接碰且**無公開 anatomy 參照**(`horizontal-overflow useOverflowItems` / `overlay-surface SurfaceHeader/Body/Footer`)。Storybook title `Design System/Internal Patterns/<Name>`。Frontmatter `internal: true`。Export jsDoc `@internal`。
- 下方 "當前居民" 表「Consumer」欄 = **DS-internal consumer**(不是 end-user app)— 若 Consumer 全是 other DS components 且**無公開 anatomy 參照** → internal pattern;但 anatomy 設計原則(item-anatomy / header-canonical)即使 runtime primitive 的 consumer 全是 DS 元件,其 anatomy story 仍是**公開 Patterns**(對齊世界級「anatomy 不藏」)。

## 當前居民

| Pattern | 提供什麼 runtime primitive | Consumer |
|---------|-------------------------|----------|
| `element-anatomy/` | flat 多檔 home:<br>• `element-anatomy.spec.md` — 4-family taxonomy overview(F1-F4,F3/F4 pointer out)<br>• `item-anatomy.{spec.md,tsx,stories.tsx}` — F1/F2 row 深度 SSOT + runtime primitive(`<MenuItem>` + slot components `<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>`) | Menu / Tree / Sidebar / File / Selection 等 row 元件;所有元件 spec 第一段宣告 Family 時查 element-anatomy.spec.md |
| `action-bar/` | **組合指南 pattern**(`action-bar.spec.md` — toolbar / action row 的 role 系統 + 排列公式;**無 `.tsx`**,屬 guidance 非 runtime 件 — 對齊世界級「pattern = 組合指南」)| 任何有按鈕列的頁面,用 Button / ButtonGroup / ButtonDivider 依此指南組合 |
| `horizontal-overflow/` | `useOverflowItems` hook + fade-mask 樣式 | Tabs / ChipGroup |
| `overlay-surface/` | `SurfaceHeader/Body/Footer` sub-components + padding SSOT | Dialog / Popover / Sheet |
| `header-canonical/` | `<ChromeHeader>` primitive(withTabs / lockDensity 窄 API)+ cross-family canonical SSOT(chrome + overlay 兩家族 W1-W6 lockstep:border auto-suppress / token equality / tabs size 對應 / flush stack / md future tier / sm default)| Sidebar / FileViewer Toolbar / FileViewer InfoPanel(ChromeHeader 直接消費);Dialog / Sheet / Popover(SurfaceHeader 走 cross-family canonical)|

> **note**:i18n 已 relocate 到 `packages/design-system/src/lib/i18n/`(2026-05-01)— patterns/ 純化只收 visual primitive,non-visual cross-cutting 改去 `lib/`(對齊 Material `@mui/material/locale` / Ant ConfigProvider 共識)。詳 `packages/design-system/src/lib/README.md`。

## 命名鐵律:element-level「anatomy」 vs page-level「layout」

element-level 結構分類永遠用 **anatomy**(Material / Polaris / Atlassian / Carbon 一致)。「layout」一詞**保留給 page-level**(未來頁面版面設計原則的家)。違反 → audit #19 會抓。

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 實際應去 | 為什麼 |
|-------------------|---------|--------|
| 「怎麼寫 story」的指南 | `packages/design-system/ds-canonical/skills/story-writing/` | 文件撰寫 workflow,不是 runtime primitive。AI 只在寫 story 時需要 |
| 「元件完成清單」/ 品質 gate | `packages/design-system/ds-canonical/skills/component-quality-gate/` | 是 invoke-time checklist,不是 runtime primitive |
| 「規則放哪裡」的 Level 1–9 taxonomy | `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md` | governance reference,audit skill 相關 |
| provider instruction 某段太長想搬出來 | 先看 Level 1–9 rule-placement taxonomy:是 runtime pattern 才來這 | 「要搬出 provider instruction」不等於「該放 patterns/」 |
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
