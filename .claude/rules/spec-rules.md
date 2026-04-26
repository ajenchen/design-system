---
paths:
  - "**/*.spec.md"
  - "src/design-system/**"
---

# Spec 規則(path-scoped)

僅在編 `*.spec.md` 或 `src/design-system/` 內容時 load。

## 核心原則

- 回答設計問題前必先讀相關 spec.md,不憑記憶
- 編輯 spec 或建新元件時必對照 **Polaris / Material / Ant / Atlassian / Carbon / Apple HIG** 的 7 維度:何時用 / 何時不用 / 近親分界 / 常見誤解 / 相關 links / 空值 / 驗證 / Loading / a11y 預設。SegmentedControl spec 是本專案 template
- 編輯 spec 必交叉比對相關 spec + Storybook,確認無矛盾 / 術語一致 / 無重複
- 與既有 spec 有邏輯衝突 / 概念混淆 → 主動提出討論,不默默改 / 不迴避
- 所有元件遵循 shadcn 框架(forwardRef / Slot / data-* / cva),不從零重寫
- 每個元件 spec「定位」段必明確宣告實作基礎:`基於 Radix X` / `基於 cmdk / sonner` / native / `自建 + 理由`(自建必說明為何不用現有 primitive)
- Spec 文字品質:不描述視覺形狀 / 實作細節(「窄長形」「會變寬」「zero layout shift」屬 story 不進 spec);術語一致;「禁止事項(❌)」列所有常見誤用

## SSOT + 邊界案例覆蓋 + 職責分離

詳 `.claude/references/spec-rules.md` — SSOT 深度判斷 / reciprocal 規則 / 目前 6 個 SSOT anchors / 邊界案例 scope 預設(Field 家族 / dark mode / density / 純 wrapper)/ spec 與 tsx 職責分離 / calc() 公式表達。
