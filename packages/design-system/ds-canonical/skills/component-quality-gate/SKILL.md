---
name: component-quality-gate
description: Pre-merge quality gate for new or significantly refactored design-system components. Walks through Spec / Code / Stories / Ship checklist (35 items) to ensure world-class discipline before a component enters `packages/design-system/src/components/`. Invoke when user says「元件做完了」「這元件可以收工了嗎」「元件 ready 嗎」「check 這個 element」「要 merge 進 DS 了」or before closing a component PR.
---

# Component Quality Gate

Purpose: 元件進 `packages/design-system/src/components/` 前的最終 checklist。防止「code 寫完但 spec / stories / token 消費紀律有漂移」的半成品進入系統。

## When to run

- 新元件即將合入 design-system
- 既有元件大改(variant / size / token 結構重構)
- Code review 前的自審
- `/design-system-audit` 發現某元件偏離 checklist 後的修復驗證

**不 invoke 的情境**:小改(typo / 單 bug fix),走 spec 本身的 sync hook 即可。

## Preconditions

- 元件 folder 存在於 `packages/design-system/src/components/{Name}/`
- 該元件的 `.spec.md` / `.tsx` / `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx` 已完成初稿
- 已讀相關 path-scoped rules(`.claude/rules/spec-rules.md` / `.claude/rules/ui-development.md`(含 Tailwind / Token 命名 / Props 命名 / shadcn 元件規範) / `.claude/rules/story-rules.md`)

## Workflow

### Phase 1 — Spec 審查(先於 code,spec 是 judgment home)

逐條走 `references/checklist.md` 的 **Spec section**(12 項):定位明確 / 實作基礎宣告 / 每個 prop/variant 有何時用何時不用 / 互斥規則 / 為什麼不只是什麼 / 術語一致 / 無視覺描述 / 禁止事項列出 / 邊界案例覆蓋 / 近親 SSOT pointer / 對標世界級 7 維度。

任一不過 → 停下補 spec。**不往下跑 Phase 2**。

### Phase 2 — Code 審查

走 **Code section**(13 項):shadcn 基底完整 / cva() 不條件字串 / data-* selector / 無硬寫 token / Tailwind v4 var() 正確 / 無自包 Provider / Props 命名按「是什麼」/ ARIA 齊 / defaultVariants size=md 若屬 field-height family。

cva `defaultVariants` 異動 → 強制 grep 該元件所有檔案確認三方同步(見 `.claude/skills/story-writing/references/anatomy-standard.md` → 高風險漂移點)。

### Phase 3 — Stories 審查

走 **Stories section**(6 項):展示 / 設計規格 5-story 齊全 / TOKEN_MAP 對得上 cva / Rule note 傳達原則 / title 命名對齊 / Internal vs Components 判斷正確。

範例品質問題 → invoke `/story-writing` skill 做深度審。

### Phase 4 — Ship 審查(最後驗證)

走 **Ship section**(6 項):
1. `npm run storybook` 本地渲染正常
2. `npx tsc -b` 無錯(**禁用 `--noEmit`**,root tsconfig `files: []` silent pass)
3. import 路徑 `@/design-system/...`
4. 分類標註(Internal vs public)正確
5. **Visual audit 過關**(2026-04-21,stakeholder-gate 強制)
6. **Story canonical-drift 過關**(2026-04-24,Phase 4 story auto-compile)— 若元件已 migration(有 `componentMeta` export + spec frontmatter)→ 跑 `node scripts/compile-stories.mjs {Name} --check` 必 exit 0;migration 未做 → skip 此項(另 new-component skill 推動逐步 migration)
7. **Code quality 過關**(2026-04-24,Dim 27)— 跑 `node scripts/code-quality-audit.mjs --scope=component:{Name} --check` 必 exit 0(無 P0 clean-code violation)。P1 flag 但不 block;P0(`any` 無 escape / file-size > 800 / circular dep)必修才 ship

### Phase 4.5 — 進階稽核 6 維(強制 chain,對齊 CLAUDE.md `# 稽核 canonical` M6)

**這是 stakeholder-gate,不能跳**。元件 merge = stakeholder-visible 產出,**必過進階模式 6 維**(非高效)。

| 維度 | 做法 | Chain 的 skill / tool |
|------|------|--------------------|
| D1 設計語言一致 | Phase 1-3 已覆蓋 | — |
| D2 程式語言一致 | Phase 2 + tsc + lint | — |
| **D3 元件效能** | 檢查 render / memo / bundle | chain `/performance-audit` |
| **D4 UX 行為** | keyboard / focus / ARIA / animation / interaction canonical | chain `/ux-audit` |
| **D5 視覺品質** | Layer A mechanical + Layer B AI judgement | Auto `npm run visual-audit -- --scope=component:{Name}` + chain `/visual-audit` |
| D6 設計原則自檢(4 子維)| chain `principle-audit-protocol.md` 對該元件 scope scan | 合理 / 一致 / 無矛盾 / 完整;auto vs STOP 依判斷公式 |

**執行步驟**:

1. `npm run visual-audit -- --scope=component:{Name}`(D5 Layer A:WCAG / 幾何 assertion / retina screenshot)
2. Layer A exit code != 0 → 停下修到 0
3. Chain `/visual-audit`(D5 Layer B):讀 `snapshots/{Name}-*.png` 做 AI judgement
4. Chain `/performance-audit --scope=component:{Name}`(D3)
5. Chain `/ux-audit --scope=component:{Name}`(D4)
6. **D6 真 scan**:讀 `.claude/skills/design-system-audit/references/principle-audit-protocol.md` 對該元件 + 其 spec 跨指的 kin specs 跑 4 子維(合理 / 一致 / 無矛盾 / 完整);先讀「常見 FP 記憶」節避免誤報
7. 彙整 6 維 findings:**依 protocol 判斷公式 — 動 canonical substantive → STOP;對齊 canonical → AUTO**
8. **Self-improvement capture**(強制):Phase 結束寫「新 FP / 新 pattern / user 糾正」—見 CLAUDE.md `# 治理 canonical` → Audit skill Phase F 節

**為什麼 mandatory**:code / spec 對不夠;效能 / UX / 視覺三維各有歷史 bug(DatePicker 四邊不對稱、DropdownMenu 鍵盤不通、Badge 位置離譜、Rating 邊框、Carousel 箭頭壓文字、inline 物件 prop 造成 render 爆)。merge 前沒過 6 維 = 把 bug 帶進 DS。

**合理跳過情境**(極少):純 spec.md 文字修正(無 tsx 改動)→ 視覺 / 效能 / UX 無變,可跳 Phase 4.5;但 tsx / token / cva / style 任一動 → 必跑全 6 維。

### Phase 5 — 簽結(Checkpoint — STOP 點)

全部打勾後,回報 user:
- 「元件 {Name} 已過 quality gate,35 項全綠(含 Layer A visual)+ Layer B AI 視覺判斷通過」
- 列出 Phase 1-4.5 各 section 打勾結果
- 列出 `snapshots/report.json` 摘要(contrast / geometry violation 數 = 0)
- 若任一 phase 有合理例外(documented 在 spec),列出例外清單

**STOP 條件**:任一項不過 + 原因不清楚 → 停下問 user,不默默放行。**Phase 4.5 Layer A 有 violation 絕不放行**。

## References

- `references/checklist.md` — 完整 35 項 checklist(Spec 12 / Code 13 / Stories 6 / Ship 4 + 各項的 CLAUDE.md pointer)

## 相關

- `.claude/skills/design-system-audit/` — 本 skill focus 在單元件進 DS 的 gate;design-system-audit 是系統級 full-dim sweep(per design-system-audit SSOT),兩者互補
- `.claude/skills/story-writing/` — Phase 3 story 深審可 chain 進去
- `.claude/hooks/pre_edit_spec_check.sh`(retired;改靠 M3 mindset #3「改一處看三處」)— 編輯 tsx 前提醒讀 spec(session 級)
