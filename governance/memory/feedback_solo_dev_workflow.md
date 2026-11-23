# Solo repository workflow — one branch, one PR, protected main

**Current canonical (migrated 2026-07-20).** This supersedes the old no-PR/direct-main solo flow. The migration was required because provider-neutral governance cannot be authoritative while `main` remains directly writable or CI remains bypassable.

## Invariants

- One chat (session) = one working branch = one pull request(AGENTS.md「# Git / release canonical」;`check_solo_workflow.sh` R1 以 session_id 執法,用功能狀態,不需要遙測 —— 見下方「Mechanical enforcement」R1).
- Never edit or push directly on `main`.
- The PR is the only merge path. Required CI and resolved review threads are the `pr-checks` completion gates.
- In this solo repository, the PR author cannot meaningfully self-approve. CODEOWNERS records ownership, but the ruleset uses zero required human approvals; protected checks, resolved conversations, protected-main merge/readback, immutable publish, exact release readback, and exact consumer readback are the authority.
- Creating or updating the one PR is normal workflow and does not require a second confirmation.
- Merging is a standing-delegated engineering action once all hard gates are green **and the user has said「發版」for the product they reviewed**(2026-09-02 user directive:preview on Netlify → user confirms → user says 發版 → merge/publish). A status report or milestone is not that consent; a question or a denial is not that consent either. The receipt lives at `.git/governance-runtime/release-consent/current.json` (schemaVersion 3) and is bound to a **digest of the preview-visible sources the user approved** — not to a commit and not to a branch. 2026-09-20 二次修正:綁 commit 讓版號 bump 就失效;改綁分支之後開一條新分支又失效 —— 兩者都是 agent 切工作的單位,不是 user 授權的單位(user 原話:「你他媽我從頭到尾就這樣要求,也沒有新增任何設計需求?你他媽到底是要我說發版說到何時?」)。內容沒變 → 跨 commit、跨分支都成立;內容變了 → 必須重新確認;明確否定 → 撤回(撤回會清掉讀取端會認的**每一份**收據)。問句/否定的判準只有一份(`infra/governance/release-workflow.json` + `scripts/lib/release-consent-language.mjs`),hook 與 `npm run release:consent -- --quote "<verbatim>"` 共用,agent 無法繞過。**一份同意 = 一次 final release**:帳本記在 receipt 的 `releases`,第二次發布必須有 incident 證據(`RELEASE_ADDITIONAL_INCIDENT`)—— 這條 canonical 早就寫了、`authorizeDeepAuditPublish()` 也寫好了,但 2026-09-20 之前執行面零呼叫,才會出現同一份工作連發 beta.135–139 五版、user 被迫重講五次。
- **開口要「發版」之前先跑機器可讀項目自我稽核(2026-11-17 起因;2026-11-21 落地)**:向 user 要發版同意的回覆(請 user 說「發版」/「可以改，發版」這一類,推播與提問選項也算)之前,先跑 `node scripts/release-self-audit.mjs record`,拿到一份**綁同一份產品指紋與同一個 HEAD、未解 0、由腳本照機器讀回產生**的紀錄(`.git/governance-runtime/release-self-audit/current.json`);缺任一項,`stop_self_audit.sh` Mechanism 12 擋 turn。之後任何新 commit(只改治理檔也算 —— CI 可能已經紅了)都要重跑。起因:同日 AI 回報只剩 A101、A41 兩件就請 user 發版,user 追問後自查才查出 24 項。user 2026-11-17 20:01(台灣時間)原話:「你他媽確定沒有遺漏或亂做其他東西了齁？不要每次我還要再三詢問你你他媽才會知道自己錯在哪」。名稱照實:清單只有機器讀回(工作樹、預覽綁定、PR 必過檢查),AI 記在別處的待辦它看不到 —— 零未解 ≠ 沒有遺漏,那一半仍要在回覆裡照實列。
- A GitHub App may open propagation/upgrade PRs. It may never write `main` directly or bypass required checks.
- Dependency inputs are exact versions. `beta`, `latest`, ranges, and unattended `npm update` are forbidden for governed consumers.
- **WM(ajenchen/work-management)不自動升級**(2026-11-05 user 原話:「以後WM的升級都不要自動做除非我有特別要求」):第五步只自動升級 template;WM 在 `infra/governance/release-workflow.json` 標 `upgrade: on-request`,不是完成條件,orchestrator 不讀回、不派工、不開 PR —— 只有 user 明確要求時才以 `RELEASE_REQUESTED_CONSUMERS=ajenchen/work-management npm run release:auto` 帶進來。判定唯一實作在 `scripts/lib/release-consumer-selection.mjs` `selectReleaseConsumers`(orchestrator 只 re-export;深度稽核 dim 64/66 證據也用同一支,未要求的 WM 記成 `not-requested-this-release`,**不准為了讓稽核變綠而去升 WM**)。測試:`infra/governance/test/release-workflow.test.mjs`「WM 只在要求時升級」與「consumer 選法判定表」、`scripts/test-standard-five-step-ci-evidence.mjs`。

## Canonical sequence

1. Read this file and confirm the current working branch before editing.
2. Make and verify changes on the single task branch.
3. Commit and push that branch; create or update its single PR.
4. If release-affecting SSOT changed, complete the exact version bump and generated projections on the same branch; no retired preflight attestation or extra approval ceremony is required.
5. Run `npm run release:auto`. It monitors required CI and unresolved conversations and remediates on the same PR, then **stops at `AWAITING_USER_RELEASE_CONSENT`** and prints the PR + Netlify deploy-preview URLs. Report the preview to the user and wait.
5b. Only after the user says「發版」(receipt bound to the preview-visible content the user reviewed — not to a commit, not to a branch), rerun `npm run release:auto`: it merges through protected `main`, publishes, reads back GitHub/npm, and lands the exact-version template PR (WM only when the user explicitly requested it — see the WM invariant above). Unchanged content stays consented across commits and branches; only a change to preview-visible content requires a new consent.
6. If the user requests changes before merge, continue on the same branch and PR.
7. If a human-only boundary (`infra/governance/release-workflow.json` `decisionAuthority.humanOnly`) pauses one action, complete that human action and rerun `release:auto`; it resumes from the first incomplete machine step.
8. Confirm completion with `npm run release:status -- --json`; optional preview/canary/soak may continue asynchronously but cannot block standard completion.
9. Delete the merged remote branch and clean local branch only after the orchestrator/readback says it is safe.

## Mechanical enforcement (M28)

`packages/design-system/ds-canonical/hooks/check_solo_workflow.sh` 是唯一 enforcement source；provider hook views 皆由它生成：

- R1: a session cannot create a second working branch; both `git checkout -b` and `git switch -c` are recognized across provider branch prefixes. Enforced by `session_id` with enforcement state, not telemetry: the session→branch record lives in the enforcement state dir, so R1 blocks whether telemetry is on or off (the default is off). The cases R1 cannot record (and so cannot block) are listed in the hook header.
- R2: any direct push to `main` is blocked. Standing authorization does not bypass protected-main architecture.
Tag creation/push is owned by `release:auto` + the registered Release workflow, not a provider hook or retired local preflight marker. R3's transcript-keyword merge gate and the old R4 tag-attestation branch are retired because they inserted non-canonical ceremony. Remote protected checks and five-step live readback remain fail-closed.

`GOVERNANCE_BYPASS_SOLO_WORKFLOW=1` remains an audit-logged break-glass mechanism for recovery only when injected into the hook host environment before the provider starts. A token inside command text is never authority and must not disable the guard. The override is not a normal path and does not bypass GitHub rulesets.

## Decision authority at merge

`AGENTS.md` `# 自主執行 canonical` is the authority SSOT. Commit, push, PR, merge, release, propagation, rollout, and rollback are delegated engineering actions; none is itself an External Authorization Boundary. Stop only for a genuine product/UI/UX SSOT tradeoff or a human-only platform/credential/spend/legal-account-business boundary. A platform-only human action never transfers the engineering decision back to the user.

## Release hard gate

The standard release gate is the machine-readable five-step graph in `infra/governance/release-workflow.json`, executed by `npm run release:auto` and read by `npm run release:status -- --json`. Required PR CI, protected merge, immutable npm publish, GitHub/npm exact readback, and template exact-version protected-main readback are the only standard blockers (WM is `upgrade: on-request` since 2026-11-05 — only when the user explicitly asks). Optional assurance never rewrites this graph.

## Why the old flow was retired

The 2026-05 no-PR rule solved branch/PR sprawl but permitted direct-main writes and made remote hard gates impossible. The preserved lesson is one task/one branch plus non-bypassable PR gates. **2026-09-02 correction**:the 2026-07-20 migration also dropped the user's preview-then-consent step by mistake(the user's 2026-05-15 / 2026-05-29 words「部署出來讓人驗證,驗證完成之後再推去 main」were never revoked);beta.131 / #122 shipped while the user was still reviewing drafts. The consent receipt gate restores it mechanically(orchestrator + hook),without reviving local attestation, soak, or fleet ceremonies.
