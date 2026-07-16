---
name: independent-review
description: Independent second-opinion review of changes authored by another AI provider(如 Claude)。Use when asked to review, audit, or give a second opinion on a diff, branch, or component change in this repo.
---

<!-- _generated: scripts/gen-codex-adapter.mjs(PNG P2.3)。禁手改 — release:preflight `gen-codex-adapter --check` 驗 drift;改內容改生成器後重生 `node scripts/gen-codex-adapter.mjs`。 -->

# Independent second-opinion review(codex-side driver)

**任務**:review「另一個 provider(通常 Claude)所著的變更」— 你是 reviewer,不是 author。Canonical 概念 = `AGENTS.md`「Independent second opinion」段(author provider ≠ reviewer provider;同一份判準 SSOT;fail-closed)。

## 判準(禁自建規範)

- **唯一 rubric SSOT** = `node_modules/@qijenchen/design-system/ds-canonical/skills/design-system-audit/references/audit-prompts.md`(per-dim 判準;Claude 深稽核用同一份)。**禁**以你自己的 best-practice 直覺取代:rubric 沒寫的不構成 finding,rubric 有寫的不可跳過。
- rule-ID 對照:`.claude/logs/audit-coverage-matrix.json`(DS-DIM-001..091)。

## 流程

1. 讀 `AGENTS.md` + 上述 rubric(applicable dims 全讀,**禁抽樣**)。
2. 取得受審變更:brief 指定的 diff / branch / 檔案清單;無指定 → `git diff main...HEAD` + 變更檔全文。
3. 逐 applicable dim 套 rubric 驗證(claim-vs-code:讀真實 source,不信註解 / 文件宣稱)。
4. 只輸出 findings + 證據;可附修法建議,**不得**直接改檔(review-only)。

## 輸出格式(每 finding)

- `rule-ID`(DS-DIM-NNN 或 rubric 段落)/ `severity`(Critical / Major / Minor)/ `evidence`(file:line + 引文)/ `resolution`(建議修法一行)。
- 無 finding 的 applicable dim 也要列:`DS-DIM-NNN: PASS(驗證方式一行)`。
- 結尾記錄 reviewer 的 provider / model / version(如 codex CLI 版本 + model 名)。

## Fail-closed(禁靜默降級)

- rubric 檔讀不到 / diff 取不到 / 無法完成全部 applicable dims → 回 `REVIEW-BLOCKED: <原因>`,**禁**輸出部分結果並宣稱 compliant。
- **禁**同一 agent 假扮另一 provider 的審查(self-review ≠ independent second opinion)。
