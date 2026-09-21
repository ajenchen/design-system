# 治理 bootstrap「Independent second opinion」節的搬家前原文(2026-09-21)

搬家理由:root→cwd 的 project-doc 合併鏈超過預設 32KiB 上限會**靜默截斷**整份治理內容。
bootstrap 只留摘要 + 指標;條文的實際 owner 是 `packages/governance/canonical/providers.json`(selection policy)、
`packages/governance/src/provider-review-binding.mjs`(binding 解析)與 meta-patterns M31。

**這份是歸檔,不是 authority**;逐字保留以便對照:

AGENTS.md 只留摘要 + 指標。以下逐字保留,一個字都沒刪:

# Independent second opinion(跨 provider 對抗審查)

**只有 task／deliverable 明確要求時才啟動**:author provider ≠ reviewer provider;判準 = 同一份 rubric(`audit-prompts.md`),reviewer 只提 findings(rule 對照 + severity + evidence)、不得自建規範,雙方 provider/model/version 入 receipt。User 對 exact run 的 waiver 必尊重並寫入 receipt,該 run 不得冒充已做 review;optional review 缺席不阻擋一般工程、deep audit 或 standard release。
- **路由 authority**:`packages/governance/canonical/providers.json` 只定 selection policy 與 review class(assurance tier `standard/high/maximum`,Tier-0 governance = `maximum`),不得固定 peer/model/version/API。`packages/governance/src/provider-review-binding.mjs` 的 `resolveProviderReviewBinding` 排除 author provider,依 assurance→reasoning→compute 選 policy 允許的最高 certified capability(budget 只能 batch/stop,禁降級);選定後凍結 exact provider/profile/model/release 與所有 registry digests,response substitution fail closed。
- **Workflow selection**:產品消費者第二意見 → `packages/design-system/ds-canonical/skills/independent-review/SKILL.md`;重大 governance/release/DS no-sample → `packages/design-system/ds-canonical/skills/deep-audit-cross-codex/SKILL.md`(舊 discovery 名稱,語意為 provider-neutral)。禁從 skill 名稱推斷 peer。
- **Binding 不可用 → claim fail-closed**:只有明確要求 independent-review 交付物時才標該 claim `REVIEW-BLOCKED`;禁同一 agent 假扮另一 provider;未登錄／同 provider／缺 capability certification、entitlement readback、transport、隔離、證據或未過 exact target certification,皆不得取得 independent/compliant 宣稱。不可用 peer 不阻擋一般工程或 canonical five-step release。訂閱方案是 entitlement route 不是 model identity,無 certified exact entitlement readback 時禁冒充、禁以其他 API／較低模型作成本導向 fallback。新模型只更新 capability/release/certification data,不改 canonical semantics。


