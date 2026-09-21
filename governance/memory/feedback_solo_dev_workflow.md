# Solo repository workflow — one branch, one PR, protected main

**Current canonical (migrated 2026-07-20).** This supersedes the old no-PR/direct-main solo flow. The migration was required because provider-neutral governance cannot be authoritative while `main` remains directly writable or CI remains bypassable.

## Invariants

- One Codex/Claude task = one working branch = one pull request.
- Never edit or push directly on `main`.
- The PR is the only merge path. Required CI and resolved review threads are the `pr-checks` completion gates.
- In this solo repository, the PR author cannot meaningfully self-approve. CODEOWNERS records ownership, but the ruleset uses zero required human approvals; protected checks, resolved conversations, protected-main merge/readback, immutable publish, exact release readback, and exact consumer readback are the authority.
- Creating or updating the one PR is normal workflow and does not require a second confirmation.
- Merging is a standing-delegated engineering action once all hard gates are green **and the user has said「發版」for the product they reviewed**(2026-09-02 user directive:preview on Netlify → user confirms → user says 發版 → merge/publish). A status report or milestone is not that consent; a question or a denial is not that consent either. The receipt lives at `.git/governance-runtime/release-consent/current.json` (schemaVersion 3) and is bound to a **digest of the preview-visible sources the user approved** — not to a commit and not to a branch. 2026-09-20 二次修正:綁 commit 讓版號 bump 就失效;改綁分支之後開一條新分支又失效 —— 兩者都是 agent 切工作的單位,不是 user 授權的單位(user 原話:「你他媽我從頭到尾就這樣要求,也沒有新增任何設計需求?」)。內容沒變 → 跨 commit、跨分支都成立;內容變了 → 必須重新確認;明確否定 → 撤回(撤回會清掉讀取端會認的**每一份**收據)。問句/否定的判準只有一份(`infra/governance/release-workflow.json` + `scripts/lib/release-consent-language.mjs`),hook 與 `npm run release:consent -- --quote "<verbatim>"` 共用,agent 無法繞過。**一份同意 = 一次 final release**:帳本記在 receipt 的 `releases`,第二次發布必須有 incident 證據。
- A GitHub App may open propagation/upgrade PRs. It may never write `main` directly or bypass required checks.
- Dependency inputs are exact versions. `beta`, `latest`, ranges, and unattended `npm update` are forbidden for governed consumers.

## Canonical sequence

1. Read this file and confirm the current working branch before editing.
2. Make and verify changes on the single task branch.
3. Commit and push that branch; create or update its single PR.
4. If release-affecting SSOT changed, complete the exact version bump and generated projections on the same branch; no retired preflight attestation or extra approval ceremony is required.
5. Run `npm run release:auto`. It monitors required CI and unresolved conversations and remediates on the same PR, then **stops at `AWAITING_USER_RELEASE_CONSENT`** and prints the PR + Netlify deploy-preview URLs. Report the preview to the user and wait.
5b. Only after the user says「發版」(receipt bound to the current PR head), rerun `npm run release:auto`: it merges through protected `main`, publishes, reads back GitHub/npm, and lands exact-version template/WM PRs. If the head changes after consent, a new consent is required.
6. If the user requests changes before merge, continue on the same branch and PR.
7. If login/MFA/OAuth/credential reference pauses one action, complete that human action and rerun `release:auto`; it resumes from the first incomplete machine step.
8. Confirm completion with `npm run release:status -- --json`; optional preview/canary/soak may continue asynchronously but cannot block standard completion.
9. Delete the merged remote branch and clean local branch only after the orchestrator/readback says it is safe.

## Mechanical enforcement (M28)

`packages/design-system/ds-canonical/hooks/check_solo_workflow.sh` 是唯一 enforcement source；provider hook views 皆由它生成：

- R1: a session cannot create a second working branch; both `git checkout -b` and `git switch -c` are recognized across provider branch prefixes.
- R2: any direct push to `main` is blocked. Standing authorization does not bypass protected-main architecture.
Tag creation/push is owned by `release:auto` + the registered Release workflow, not a provider hook or retired local preflight marker. R3's transcript-keyword merge gate and the old R4 tag-attestation branch are retired because they inserted non-canonical ceremony. Remote protected checks and five-step live readback remain fail-closed.

`GOVERNANCE_BYPASS_SOLO_WORKFLOW=1` remains an audit-logged break-glass mechanism for recovery only when injected into the hook host environment before the provider starts. A token inside command text is never authority and must not disable the guard. The override is not a normal path and does not bypass GitHub rulesets.

## Decision authority at merge

`AGENTS.md` `# 自主執行 canonical` is the authority SSOT. Commit, push, PR, merge, release, propagation, rollout, and rollback are delegated engineering actions; none is itself an External Authorization Boundary. Stop only for a genuine product/UI/UX SSOT tradeoff or a human-only platform/credential/spend/legal-account-business boundary. A platform-only human action never transfers the engineering decision back to the user.

## Release hard gate

The standard release gate is the machine-readable five-step graph in `infra/governance/release-workflow.json`, executed by `npm run release:auto` and read by `npm run release:status -- --json`. Required PR CI, protected merge, immutable npm publish, GitHub/npm exact readback, and template/WM exact-version protected-main readback are the only standard blockers. Optional assurance never rewrites this graph.

## Why the old flow was retired

The 2026-05 no-PR rule solved branch/PR sprawl but permitted direct-main writes and made remote hard gates impossible. The preserved lesson is one task/one branch plus non-bypassable PR gates. **2026-09-02 correction**:the 2026-07-20 migration also dropped the user's preview-then-consent step by mistake(the user's 2026-05-15 / 2026-05-29 words「部署出來讓人驗證,驗證完成之後再推去 main」were never revoked);beta.131 / #122 shipped while the user was still reviewing drafts. The consent receipt gate restores it mechanically(orchestrator + hook),without reviving local attestation, soak, or fleet ceremonies.

## AGENTS.md 發版同意那一格的原文(2026-09-21 搬家)

root AGENTS.md 的 project-doc 鏈超過 Codex 預設 32KiB 會**靜默截斷**,故把來龍去脈搬來,bootstrap 只留判準。逐字保留:

| 1.5 **發版同意(ASK)** | **user 看過預覽後在對話說「發版」**(exact target = **user 看過的那份產品內容**)→ hook `record_release_consent.sh` 自動落地 receipt(`.git/governance-runtime/release-consent/current.json`,schemaVersion 3);缺 receipt → `release:auto` **停在預覽階段**印 `AWAITING_USER_RELEASE_CONSENT`,不合併、不發布;問句／否定不算同意。**同意綁「user 看過的產品內容」,不綁 commit、不綁分支**(2026-09-20 兩次修正的結論):commit 與分支都是 **agent 切工作的單位**,不是 user 授權的單位 —— 綁 commit 讓版號 bump 就失效,改綁分支之後開一條新分支又失效,**問題只是換地方發作**(user 原話:「你他媽我從頭到尾就這樣要求,也沒有新增任何設計需求?你他媽到底是要我說發版說到何時?」)。現在綁預覽看得見的檔(集合以 `scripts/release-orchestrator.mjs` 的 `PRODUCT_VISIBLE` 為準:`packages/<pkg>/src`、`.storybook/`、`apps/**` 的 stories;散文不維護第二份清單)內容指紋:**內容沒變 → 換幾個 commit、幾條分支都算數**;**內容變了 → 必須重新確認**(2026-09-02 事故要保護的正是這一格);明確否定 → 撤回。**一份同意 = 一次 final release**:帳本記在 receipt 的 `releases`,第二次發布必須有 incident 證據(`RELEASE_ADDITIONAL_INCIDENT`),否則 fail closed —— 這條 canonical 早就寫了、`authorizeDeepAuditPublish()` 也寫好了,但 2026-09-20 之前**執行面零呼叫**,才會出現同一份工作連發 beta.135–139 五版、user 被迫重講五次 |

### AGENTS.md「公開入口」段原文(2026-09-21 搬家)

公開入口只有 `npm run release:auto`(安全續跑未完成步驟;合併前必檢查發版同意 receipt)、`npm run release:status`(唯讀狀態)與 `npm run release:consent -- --quote "<user 原話>"`(hook 失效時的手動落地,仍需 user 原話)。ASK 只有兩種:未解決的產品／UI／UX SSOT 真取捨、以及**發版同意**(每條工作分支／每個 PR 一次,不是每個 commit 一次;預覽 → user 說「發版」);login/MFA/OAuth／缺 credential reference 只暫停當下動作,完成後 AUTO resume。`candidate-freeze`、broad external activation、model certification、offline signatures、72h soak、fleet promotion 對 standard small-team release 一律 non-blocking 或已退役,不得另建 approval/promotion 流程。完成後才清 remote/local branch 並 `git switch main && git pull --ff-only`。

