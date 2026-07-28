# Canonical references charter

## 這裡只收:**agent infrastructure reference**(非 product canonical)

Agent 在執行時按需讀的深度 reference 檔 — audit protocol / FP 記憶 / workflow recipe / lookup tables。**不是 product design canonical**(那該進 spec.md / `packages/design-system/ds-canonical/rules/*.md`)。

## 當前居民(17 檔,2026-05-30 update)

| Ref | 用途 |
|-----|------|
| `audit-coverage-vs-24-checklist.md` | 業界 24-checklist 對照 + 為何不平行 audit 24 dim rationale |
| `build-ui-canonicals.md` | 建 UI 前 12 情境 + 8 layout primitive lookup |
| `composition-fidelity.md` | Composition fidelity SSOT — consumer 用對 DS(conformance)為主,靜態 lint 驗(對齊 Polaris/Atlassian/Carbon);pixel/DOM identity diff 改 opt-in(2026-06-02 model 修正,非追求 product-vs-showcase 一致) |
| `cva-patterns.md` | cva 適用 / 不適用 + 例外清單(跟 canonical `packages/design-system/ds-canonical/rules/ui-development.md` shadcn 規範互補) |
| `drag-canonical.md` | 世界級 drag impl 對照 + dnd-kit collision strategy + Phase 1/2 fix plan |
| `item-anatomy-recipe.md` | 7 步建立新 row primitive workflow + audit grep guard |
| `naming-conventions.md` | 命名詳表 + 禁止清單(AGENTS.md `# 命名與語言一致性` pointer) |
| `principle-dim-map.json` | M-rule / trait / hook → audit dim explicit mapping(SSOT for dim coverage) |
| `props-naming.md` | Props callback / Badge / icon canonical 詳表 |
| `scenario-definition.md` | Monorepo 2-Scenario architecture SSOT(Scenario A direct fork DS / Scenario B fork template + mirror chain + verify checkpoints)|
| `spec-rules.md` | SSOT 機制 / 邊界案例 scope default 詳展 |
| `story-baseline-registry.json` | Anti-drift registry — stories wrap 既有 primitive 的 machine-readable canonical archetype(hook `check_story_invariants.sh R8` 讀)|
| `ssot-consultation.md` | SSOT 消費完整對照表 |
| `ssot-index.md` | High-risk interface ownership map(propose 前 grep 找 owner) |
| `structural-token-retention.md` | 6 類結構性保留 token canonical(audit Dim 48 triple-verify) |
| `tailwind-gotchas.md` | Tailwind v4 / tailwind-merge 技術陷阱深展 |
| `ui-dev-rules.md` | flex slot 幾何 / 數值前先查 / Padding 三層 / Icon size 三類 |

## 這裡**不收**(反例 + 正確去處)

| 疑似要放這但其實不是 | 正確去處 | 為什麼 |
|---------------------|---------|--------|
| 設計 canonical judgment(non-programmable)| `spec.md` 或 `packages/design-system/ds-canonical/rules/*.md` | 元件/模式語意進 spec,跨單元 path-scoped 規則進 canonical rules。AI 做產品時**必讀** spec,不會必讀 references |
| 實作值 / 計算公式 | tsx / cva / CSS | programmable rule 進 code |
| 跨 session 狀態 | `memory/` | references 不是 state 檔 |
| 多步驟 workflow + checkpoint | `packages/design-system/ds-canonical/skills/` | skill 管 workflow,reference 是 skill 按需讀的；provider skill home 只是 generated discovery view |

## 新 reference 的 criteria

1. **Audit / skill 按需查的 lookup data**(表格 / 詳細對照 / 反例清單)
2. **不含 canonical judgment**(判斷 rule 在 spec / `packages/design-system/ds-canonical/rules/*.md`)
3. **被 ≥ 1 skill / AGENTS.md / spec cite**(orphan file 不收,定期 prune 會 retire)

## 2026-04-24 Lesson

前曾把 canonical judgment(24px threshold / disabled state 策略 / primitive exposure 3 題)錯搬到 references,違反 2-home 架構(spec 該是 canonical home 讓 AI 做產品時讀)。Restored 回 spec。references 現在嚴格只收 agent-use lookup。
