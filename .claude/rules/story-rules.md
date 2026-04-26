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
| 1 展示 | `*.stories.tsx` | trait-based v2 | `check_story_category.sh` | 29 |
| 2 設計規格 | `*.anatomy.stories.tsx` | 5-canonical(Overview/Inspector/ColorMatrix/SizeMatrix/StateBehavior)| `check_story_anatomy.sh` + `check_anatomy_section_numbering.sh` | 13 |
| 3 設計原則 | `*.principles.stories.tsx` | Polaris-aligned ≥ 2 of {WhenToUse / WhenNotToUse / Vs*Rule / ContentGuidelines} | `check_principles_canonical.sh` | 30 |

## Title 命名

`Design System/{Tokens|Patterns|Components|Internal}/{Name}/{展示|設計規格|設計原則}`。

第一層英 / PascalCase / 子頁中文 / 子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)。

**Internal vs Components 三 test**:(1) 有預設視覺?(2) 直接 `<X>` 有視覺?(3) 所有消費者都包 wrapper?三題傾向 Internal → `Internal/`。

## 範例最高準則

精簡幹練、0 重複、每 story earn its existence(audit Dim 24/25/28/29/30 抓)。

**Earn-existence 2 test**:(a) 教別 story 沒教的原則?(b) 移除後 spec 理解 degrade?兩題皆 NO → retire。

**拆分原則**(對齊 Polaris / Carbon / Storybook):
- 不同 affordance 必分(IconOnly / FullWidth)
- AllVariants & AllSizes 對照各 1
- 同 affordance 內 prop variations 用 Controls 不另開(❌ `WithStartIcon`+`WithEndIcon` → ✓ `WithIcon` grid)
- Compound 有 new constraint 才分

**展示 v2 trait-based**:spec.md frontmatter `traits:` array → required core stories 衍生 + hook `check_story_category.sh` 攔。

**Principles canonical**(Polaris-aligned):universal core ≥ 2 of `WhenToUse`/`WhenNotToUse`/`Vs*Rule`/`ContentGuidelines` + hook 攔。SSOT → `/story-writing` skill `references/category-templates.md`。

## 禁止

❌ 佔位符 / 抽象代號 / 極端不現實 / 視覺符號 / spec 內部代號。詳 → `/story-writing` skill。
