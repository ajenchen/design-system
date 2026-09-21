---
name: ship-then-revert-anti-pattern
description: 禁 ship-then-revert workflow。產品／UI／UX SSOT 真取捨必有 exact target-bound decision；工程 remediation standing-delegated；unknown fail closed
type: feedback
originSessionId: a689a78e-f264-4c1f-b881-0859a7a12135
---
# Ship-then-revert anti-pattern

## Rule

**只有會改變產品／UI／UX SSOT、且 evidence 收斂後仍存在真實選擇／取捨的 edit，才必須綁定 user 對 exact target 與 exact choice 的 verbatim decision。純工程 bug／refactor／test／governance／infra remediation 依 Standing Authorization AUTO。**

合法產品決策 evidence 必同時包含:
- exact target(component/path/明確全域 UI scope)
- exact UI/UX choice(顏色、尺寸、interaction、文案、pattern 等)
- 明確 directive(採用／保留／改成哪一個具體選擇)

`OK`／`push`／`ship`／`全部做完`／Standing Engineering Delegation 等 generic workflow 語句都不是產品決策。工程 remediation 不需這些字；產品／UI／UX 真取捨缺 exact decision → 中文具體列選項與 tradeoff、batch-at-end 等回覆；unknown fail closed。

## User 原話 SSOT(2026-05-15)

> 「我之前不是也要你增刪改 infra 避免你他媽做事之前都不全盤考慮,等做完了之後發現不對才來 revert,**到底是要多沒效率**？之前已經叫你避免了,**又再犯**？」
>
> 「**上述的問題請你務必確實確保永遠他媽不要再給我犯了**」

## Anti-pattern 錨例

**2026-05-15 commit `9e89d4d` H1 ship**:`field-wrapper.tsx:25` 加 `min-w-0`(Field family SSOT change)。User 只 echo 我的 hypothesis 問 M10,**不是 verbatim approval**。Stop hook CODEX-DESIGN-NO-APPROVAL BLOCKER fires → commit `e6eafcd` revert。

Cycle waste:edit → ship → BLOCKER → revert → re-propose。每多一次 = 浪費 user 時間 / 動 attention budget。

## Mechanical strength

- Hook `check_substantive_edit_approval_preflight.sh` 與 `stop_self_audit.sh` 共用 `hooks/lib/approval-evidence.mjs`，依 exact target、current operation 與 decision domain 分類。
- `engineering-remediation` PASS；`product-ui-ux` 缺 exact choice、denial/revocation、discussion 及 `unknown` 都 fail closed。泛用 keyword 或 peer retract 不可偽造 decision。

## How to apply

- 動 production source 前讓 canonical classifier 檢查每個 target 與 current operation。
- 工程 remediation → 自主完成並附 tests/evidence/rollback。
- 產品／UI／UX SSOT 真取捨 → proposal 必含 concrete option + tradeoff + exact target；取得 target-bound decision 才動。
- 無法分類 → fail closed 並補 owner/evidence；task／deliverable 明確要求時才加 independent review，不用泛用 user approval 代替工程判斷。

## Related

- AGENTS.md `# 自主執行 canonical` SSOT-UI/UX → ASK
- AGENTS.md `# 稽核 canonical` Audit-vs-execute 分權
- M33(下個 session defer 反 pattern)
- M19(trigger phrase auto-pipeline,只在 ensure / always 等 keyword 起)

## AGENTS.md「Decision／Engineering Authority」原文(2026-09-21 搬家)

root AGENTS.md 的 project-doc 鏈超過 Codex 預設 32KiB 會**靜默截斷**,故把細則搬來,bootstrap 只留判準。逐字保留:

**Decision／Engineering Authority**:user 只拍板產品／UI／UX SSOT 真取捨及可感知／產品語意變更（behavior/interaction/IA/visual/token/layout/content/a11y/canonical rules）；核准 = user 在對話中對 exact target + choice 說可（**「我說可以就是可以，就是授權」— user 2026-08-04 verbatim**；最新一則 user 訊息的明確 blanket 授權即核准當下 pending 的 exact 提案）。operation digest 為可選佐證——有引且相符可加強、有引但不符 fail-closed、未引不阻擋（強制引 digest 屬已拆除的 per-PR 簽章同族儀式，835b519e 先例）。引用/條件/舊 scope/跨 target 無效。其餘工程/external writes 皆 Standing Authorization AUTO，含已核准 UI／UX 實作/機械 generation/sync 與 source→commit/PR/merge→canonical `infra/governance/release-workflow.json` 的 `pr-checks → merge → publish → readback → consumer`；依 frozen scope、SSOT、required checks、security、least privilege、rollback/readback 收斂，不逐 milestone 重問。Deep Audit 必須在單一 branch／PR 完成 remediation 與 local/CI candidate validation，禁止把 immutable publish 當 iteration/test loop，每次 audit 最多一次 final release；只有另有 evidence ref 綁定 incident ID、failure class、published version 的 post-publish blocker 或 security incident 才可額外 release。Certification、rollout、staged rollout、preview/canary 與 independent review 是明確要求時的附加 assurance，不得進入標準 five-step release blocking graph；peer 不可用只阻擋明確要求的 independent-review claim。

