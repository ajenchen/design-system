# Meta-Pattern 合併 / 降級歷史分析(從 rules/meta-patterns.md 搬出)

> 2026-11-17 knowledge-prune(A40 第 7 筆)從 `rules/meta-patterns.md` 開頭搬來,原文不改。那份檔每個 session 都要讀,這幾段是 2026-05 的歷史分析、不是規則本身;現行 `@watch` 規則仍留在 meta-patterns.md 分群表下方。數字(25 skills、本季 net add 12 等)是當時的量測,現值以 `scripts/sync-governance-counters.mjs` 與 skills 目錄實數為準。

## 2026-05-22 fold prune(原 meta-patterns.md:18 後半)

**2026-05-22 fold prune**:M33/M34/M35 各 absorb 1 bug → folded into parent cluster home(M33→M20 / M34→M7 / M35→M23(d)),減 3 條 M-rule 同時保留全部 invariants。Velocity 修正:本季 net add 12 rules(15 new − 3 fold)= 18 → 12 趨近 charter ≤3/quarter target,持續觀察。

## Why no merge content(原 meta-patterns.md:20)

**Why no merge content**:per codex Q-13「Keep M24/M25 because they are sharp, reusable state/chain invariants」+ Layer A own 認 cluster headers 是檢索輔助,不該強行 merge content(各 M-rule 已 1-line tight)。Cluster headers help 「舉一反三」without 削減 M-rule 數量。**Task #19 M21-M29 meta-merge analysis(2026-05-10 closed)**:re-audit M21-M31 全部,verdict **無 merge candidate**,各 rule sharp invariant 覆蓋 distinct failure mode(M22 implement-time cite vs M26 propose-time cite / M30 wrapper-primitive 跟 M27 framework-vs-DS / M31 collab discipline 跟 M14 / M19 auto-pipeline 各 unique scope)。Cluster table 已 cross-link,不需 merge。

## 2026-05-10 skills consolidation analysis(Task #20 closed;原 meta-patterns.md:22–36)

**Per Anthropic「~10 sweet spot」benchmark**:DS 現有 25 canonical skills(`packages/design-system/ds-canonical/skills/` 的一層目錄,2026-07-31 inventory),約 2.5x Anthropic typical recommend。**Verdict:無 aggressive merge candidate**,維持 25 skills justified:

| 類別 | Skills | 為何不 merge |
|---|---|---|
| Core audit | design-system-audit / visual-audit / component-quality-gate / knowledge-prune | 各 sharp trigger,invoke logs 顯示高頻(design-system-audit 6 / knowledge-prune 7) |
| Domain audit | ux-audit / performance-audit / code-quality-audit / product-ui-audit | D2/D3/D4/consumer-code dim 已 chain 進 design-system-audit |
| Workflow | prototype / new-component / delivery-handoff / story-writing / story-auto-compile-migrate / bug-fix-rhythm / governance-status | create / prototype / final-handoff / story / multi-fix rhythm / read-only status 各 phase distinct |
| Discipline | ensure-canonical / propose-options / codify-principle / codify-corrections / scan-similar-bugs / governance-health | trigger phrase / 4-Q gate / 5-layer artifact gen / batch log / post-fix scan / monthly metric 各 unique |
| Review / collaboration | codex-collab / canonical-reviewer / independent-review / deep-audit-cross-codex | 一般 cross-provider synthesis / canonical-only review / product-consumer review / no-sample deep audit 的 scope 與證據契約不同 |

**Marginal merge candidate**(Backlog,不擴張目前 frozen scope):`codify-principle` + `codify-corrections` 都產 5-layer artifact,trigger 不同(live propose vs batch log)— 可合 `codify` 一統 skill。**目前不執行原因**:codex Q-13 sharp-rule preference + 兩 skill SKILL.md 各自 250 lines budget 內，尚無 evidence 顯示合併是當前 Requirement 必需。未來若進入 frozen scope，由最高 certified capability 依 evidence 作工程判斷；task／deliverable 明確要求時才加 independent review，不需 user 工程核准。

**RFC**:Anthropic「~10 sweet spot」是 typical CRUD app benchmark;DS governance complexity（active M-rules / full-dimension audit / optional cross-provider review / Level 1–9 taxonomy）justified higher skill count。動態數量以 canonical counters / inventory 為準；每 skill 都過 knowledge-prune retire rule(3 月 invoke 或 rare-event 豁免;hooks 才是 6 月 fire,SSOT → knowledge-prune/SKILL.md)。
