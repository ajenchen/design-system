# Report Template — P0/P1/P2 分類 + 報告格式

---

## Severity 分類

### P0 — 必修(無爭議 bug)

自動 bug / 違反明確 DS 規則 / a11y 必要項缺失:

- Token 硬寫 hex / rgb / shadcn alias
- Tailwind default shadow(shadow-sm / md / lg)
- Tailwind v4 `[--foo]` shorthand
- icon-only 無 aria-label
- Dialog / Modal 無 DialogTitle
- 非 button 綁 onClick(a11y 破壞)
- 巢狀浮層 / 巢狀 Modal(HTML invalid 或 UX 破壞)
- node_modules/@qijenchen/design-system/ds-canonical/references/ui-dev-rules.md「同 flex 列互動 slot 幾何鐵律」違反

**處理**: AI 可直接修(surgical fix),commit 時 user 一併 review。

### P1 — 批次修 + review

設計原則違反 / 元件誤用 / 可改善但無立即 bug:

- Layout primitive 未消費(自 roll Empty / item-layout 等)
- 硬寫 px 值當應用 token
- placeholder 文案(Option A/B/C / Lorem ipsum)
- Primary Button 堆疊
- 巢狀 Accordion / Tabs / Carousel
- native overflow 未用 ScrollArea(跨 OS 跑版潛在風險)
- 硬寫 aspect-* class 未用 AspectRatio

**處理**: 批次 fix,每 Dim 一個 commit,由 user review。

### P2 — 需討論

scope / 設計決策 / 業務判斷:

- cva defaultVariants 三方漂移(可能 intent)
- Rule B 邊界案例覆蓋不足(scope 決策)
- 新元件 promotion 判斷
- 歷史 code 風格差異(rename / refactor 決策)
- TODO 留白(規格未定)

**處理**: 不自動修,由 user 逐項決策。

---

## Report 格式範本

```markdown
# Product UI Audit Report

**Scope**: `src/app/features/checkout/` (23 files)
**Date**: 2026-04-19
**Dimensions audited**: 6 (Token / Layout primitive / Component / Mindset / Geometry / A11y)

## Summary

| Dim | Total findings | P0 | P1 | P2 |
|-----|---------------|-----|-----|-----|
| 1 Token | 3 | 2 | 1 | 0 |
| 2 Layout primitive | 5 | 0 | 4 | 1 |
| 3 Component | 2 | 1 | 1 | 0 |
| 4 Mindset | 4 | 0 | 3 | 1 |
| 5 Geometry | 1 | 1 | 0 | 0 |
| 6 A11y | 2 | 2 | 0 | 0 |
| **Total** | **17** | **6** | **9** | **2** |

## Findings Detail

### P0(必修 6 項)

| # | Dim | File:Line | Finding | Fix |
|---|-----|-----------|---------|-----|
| 1 | 1 Token | src/app/checkout/PaymentForm.tsx:87 | 硬寫 `#3b82f6` | 改 `var(--primary)` |
| 2 | 1 Token | src/app/checkout/Summary.tsx:42 | `shadow-md` | 改 `shadow-[var(--elevation-200)]` |
| 3 | 3 Component | src/app/checkout/PromoButton.tsx:12 | iconOnly Button 無 aria-label | 加 `aria-label="套用折扣碼"` |
| 4 | 5 Geometry | src/app/checkout/Actions.tsx:55 | 同 flex 行 Button sm(28)+ICon-only Primary(24)box 不一致 | 統一尺寸,或移 icon 入 Button's startIcon |
| 5 | 6 A11y | src/app/checkout/ProgressNav.tsx:23 | `<div onClick=...>` | 改 `<button>` 或加 `role="button" tabIndex={0} onKeyDown={...}` |
| 6 | 6 A11y | src/app/checkout/ConfirmModal.tsx:8 | Dialog 無 DialogTitle | 加 `<DialogTitle>確認結帳</DialogTitle>` |

### P1(批次修 9 項)

{以 Dim 分組,per-Dim table}

### P2(需討論 2 項)

| # | Dim | File:Line | Finding | 為何需討論 |
|---|-----|-----------|---------|---------|
| 16 | 2 Layout | src/app/checkout/EmptyCart.tsx:30 | 自 roll icon+title+desc+CTA structure | Consumer 若有品牌化 requirement 可能需 override Empty;需 user 確認 design intent |
| 17 | 4 Mindset | src/app/checkout/AmountInput.tsx:15 | Input typography 用 `text-[15px]` | 業務要求此欄位字體稍大,需評估 DS 是否加 variant 或 case-by-case 接受 |

## 建議

**先修 P0 6 項**(1 個 commit):無爭議 bug,改完即世界級 baseline。
**再批次修 P1**(建議按 Dim 分 commit,4 commits):
1. Token(Dim 1,1 項)
2. Layout primitive(Dim 2,4 項)— 最大 batch
3. Component(Dim 3,1 項)
4. Mindset(Dim 4,3 項)

**最後討論 P2**(stakeholder 共同決策)。

## Next

等待 user Checkpoint 決策:
- (a) AI 直接修 P0,batch 修 P1,P2 逐項討論
- (b) 全部 findings 先給 user 自己看,AI 等候指令
- (c) 只修 P0,其他 park 到下個 sprint
```

---

## Triage Checkpoint 範本

audit 完,**不可**直接開始修。先 triage 問 user:

```
🔍 Product UI Audit Report

Scope: {scope}
Total findings: {N}

P0(必修,無爭議){N0 個} — token 違反 / a11y 必要缺 / 幾何鐵律違反
P1(批次修 + review){N1 個} — layout primitive 消費 / placeholder 文案 / Button 堆疊
P2(需討論){N2 個} — scope / 設計決策 / 業務判斷

建議順序:
1. 先修 P0(1 commit,surgical fix)
2. 再批次修 P1(每 Dim 一個 commit,共 {N_dims} commits)
3. P2 逐項討論

你要:
(a) 按建議順序執行(我開始修 P0)
(b) 先讓我完整看 findings 再決定
(c) 跳過 P2,只修 P0+P1
(d) 縮窄 scope 到 {sub-folder}
```

絕對不可:AI 自行決定修哪些,必過 triage。

---

## 合法例外聲明範本

若 audit hit 被判定為合法例外(per CLAUDE.md 或 spec documented),在 report 中明文標示:

```markdown
### Documented exceptions(非 findings,供參考)

| File:Line | Pattern | 例外理由 |
|-----------|---------|---------|
| Avatar.tsx:46 | `text: '#fff'` | cva 適用範圍例外(style prop 驅動 object map),per CLAUDE.md `cva 適用範圍` |
| Rating.spec.md:73 | `bg-warning` 黃星 | 世界級 convention(Amazon / Yelp / Google),documented |
```

讓 user 知道 AI 有注意到但判斷為合法 — 防被誤解為遺漏。
