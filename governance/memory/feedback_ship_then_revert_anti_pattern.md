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
- 無法分類 → fail closed 並補 owner/evidence/independent review，不用泛用 user approval 代替工程判斷。

## Related

- AGENTS.md `# 自主執行 canonical` SSOT-UI/UX → ASK
- AGENTS.md `# 稽核 canonical` Audit-vs-execute 分權
- M33(下個 session defer 反 pattern)
- M19(trigger phrase auto-pipeline,只在 ensure / always 等 keyword 起)
