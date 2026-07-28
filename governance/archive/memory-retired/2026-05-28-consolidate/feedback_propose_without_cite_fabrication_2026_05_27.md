---
name: propose-without-cite fabrication anti-pattern
description: 對話 propose 含「規定 / 必配 / canonical 寫」claim 必附 file:line cite,不然 = 瞎掰(2026-05-27 user 永久糾正)
type: feedback
originSessionId: 41fa83c2-f951-431e-911e-ed3ceb185903
---
# Propose-without-cite fabrication(2026-05-27 user verbatim 永久 codify)

**Rule**:對話內任何 claim 含「DS 規定 / spec 規定 / canonical 寫 / 必配 / 必須用 / 強制 / 明文」keyword **必附 file:line cite**(`.spec.md:42` / `.css:42` / `.tsx:42` / `L42` / `line 42` 任一)。沒 cite = 瞎掰 = 自動撤回 claim。

**Why**:User 2026-05-27 verbatim「沒有好好按照規則和 ssot 跑設計,然後淨問我一下蠢問題」「沒有 ssot 寫錯,是 enforce 機制沒涵蓋對話 propose 層」「可以拜託你不要再這樣了嗎?」

**How to apply**:
- 寫 propose 前 inline grep verify claim 真存在 spec
- 沒 grep / 沒 cite → 撤回 claim 或不要 propose
- M22 cite invariant 從「commit / spec edit」延伸到「對話 propose 層」
- mindset #2「不憑直覺發明」mechanical 強制(過去 soft mindset 沒 hook 攔)

## Anchor 錨例(2026-05-27)

User 問「product-workspace demo 用對 token 嗎?」我憑印象斷言「DS spec 規定 `text-caption + text-fg-muted` 是 caption 標準組合」。User 質疑「誰跟你說的?哪裡有規定?」+「請你全部檔案仔細查證」。

真讀後發現:
- `semantic.css:49` 寫「`--fg-muted = placeholder、caption、弱化 icon`」**只是 token use-case 描述**(描述「fg-muted 被用在這 3 種場景」),**不是「caption MUST 配 muted」rule**
- DS 自家 `typography.stories.tsx:30,31,87,88` **同時用 caption+secondary 跟 caption+muted**,**沒「必配」規定**
- `typography.spec.md:113` 例子「最多 200 字元」semantic = placeholder hint,**不是 caption ALL 用 muted**

User 抓 — 我撤回。User 進一步要求「為什麼不檢討 infra?」→ 落地:
1. `check_propose_cite_required.sh` hook(2026-05-27 ship)— Stop hook 偵測 claim keyword 無 cite → BLOCKER
2. 本 memory file codify

## 反 pattern(永久 ban)

- ❌ 對話講「DS 規定 / spec 規定 / canonical 寫 X」沒 file:line cite
- ❌ 憑單行印象 fabricate「必配 / 必須用」rule(real spec 多半只是 use-case 描述)
- ❌ 用 fabricated rule 構築 propose ABC 給 user 拍板
- ❌ User 質疑才撤回(應該事前 grep verify)

## 對齊既有 M-rule

- M18 Q0(triple-verify before propose):本案是 propose 前沒做 (1) grep DS-wide (2) Read spec.md (3) 對照 canonical exception。**M18 Q0 hook 只 enforce 在 production code edit,沒 enforce 在對話**。新 hook 填補 gap
- M22(cite invariant):管 commit / spec edit 含 claim 必 cite。延伸到對話層
- mindset #2(不憑直覺發明 / 優先消費既有):本案違反。mindset 過去是 soft,新 hook 升 mechanical
