<!-- Authority/status: governance/planning/registry.json -->
# 2026-07-31 全域殘項總帳（跨 session 續作 SSOT）

**用途**：記錄 2026-07-31 全域盤點後的 current state。後續 session 應先讀本檔，再依
canonical machine state 與實際 worktree 驗證；不得把本檔的歷史描述當成 live remote verdict。

## Immediate Claude Code pickup baton（2026-08-01；最高優先）

這一節是目前的 executable cross-session handoff。Claude Code 應從
`/tmp/ds-genesis.B3xxFi` 接手，先讀 root `AGENTS.md`、root `CLAUDE.md` 與本檔，再直接執行；
不得重跑全域 discovery，也不得為下列工程動作再次詢問 user。Live Git/GitHub state 若已前進，
以 exact head/readback 為準並更新本節，不能把本節快照當遠端 verdict。

### Authority（不得再次詢問）

- User 已明確授權全部工程、baseline、Git、PR、CI remediation/rerun、merge、release、rollout 與
  readback。Exact visual image set 的「可以改」已是完整 UI/UX 核准；不需要第二次核准、key
  enrollment、OWNER comment 或 signature，也不得啟用 optional independent cryptographic review。
- 只有真正未解的產品／UI／UX SSOT 取捨才 ASK。只有 login/MFA/OAuth/account-owner/billing、
  plan 外付費／法律／帳號／組織／商業承諾，或在安全 preflight 後仍缺既有 credential reference
  才是 HUMAN_ONLY；先完成所有可代理工作，最後只提出一個 exact human action，readback 後續跑。
- Engineering failure、CI failure、GitHub write、commit/push/PR/merge/rebase/release milestone 都是
  AUTO，不是 user approval gate。Claude 的 `decision-authority-routing` live probe 必覆蓋同一語意。

### Exact local state（接手時不可丟棄）

- PR worktree：`/Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project`
  - branch `claude/remove-app-verdict-authz`
  - clean HEAD `4a1f90edf3bda24f4b17060f676cc965df3f5ab2`
  - PR `https://github.com/ajenchen/design-system/pull/22`
- Genesis worktree：`/tmp/ds-genesis.B3xxFi`
  - branch `agent/close-control-plane-genesis`
  - last committed HEAD `bd22837454df4587c7d165fcdc24ca54d1840a00`
  - five existing commits begin after old PR head `a3b4a86f6e17d237f94556a16c7d3266eadb1fb1`:
    `58909462` → `d54586c9` → `c94257d6` → `b40a5447` → `bd228374`
  - worktree intentionally dirty. Preserve every current edit. It adds Claude live authority cases for an
    already-approved visual baseline = `AUTO` and owner/billing/missing-credential-reference = `HUMAN_ONLY`;
    it also removes the obsolete per-change Ed25519/OWNER-comment privileged-change ceremony from the
    verifier, workflow, tests, README and tamper text while preserving control-plane Genesis receipts and
    runtime/fleet/release cryptographic attestations.
- `node --test infra/governance/test/provider-runtime-conformance.test.mjs` passed 31/31 after the new route
  cases. Re-run it after all dirty edits and generation. Do not use reset/checkout/clean to discard work.

### PR #22 live snapshot（2026-08-01 10:30 Asia/Taipei）

- Exact head above is OPEN, ready and mergeable. Candidate failures = 0.
- PASS: Visual Regression 124/124 pixel diff, Packaging, Bundle, Composition Fidelity, Netlify deploy/header.
- Still running at handoff: A11y run `30679561281` / job `91313734521`; CI Verify run `30679561262` /
  job `91313734593` at `Fork-governance corpus + harness`. Earlier setup/audit/build/tsc/story/template/hook
  steps passed. Historical normal durations are about 29 minutes for a11y and 38–50 minutes for CI.
- The two failures in Authority run `30679559628` (`Verify authority candidate without credentials` and
  `Publish Governance App verdict`) are known stale protected-base infrastructure, not candidate failures;
  the separate Genesis candidate removes that obsolete path. Never relabel them green, but do not ask user.

### Mandatory continuation order

1. In the Genesis worktree, inspect and finish the existing dirty diff only. Close every stale 3B ceremony
   reference/CLI/workflow input consistently; keep unrelated cryptographic attestation flows. Run at least:
   `node --test infra/governance/test/provider-runtime-conformance.test.mjs`,
   `npm run test:privileged-change-authorization`, `npm run test:workflow-security`,
   `node scripts/test-check-governance-tamper.mjs`, `npm run governance:generate`,
   `npm run governance:check`, `node scripts/check-governance-tamper.mjs --check`, and `git diff --check`.
   Review the complete diff, then commit it. On the resulting clean committed tree run the real bounded Claude
   probe: `node infra/governance/bin/conform-provider-runtime.mjs --provider claude --allow-model`.
2. Poll PR #22 by exact head. If either remaining candidate check fails, diagnose/fix/push the same branch and
   wait for the new exact-head gates. Once A11y and CI Verify pass, squash-merge automatically with head CAS:
   `env -u GH_TOKEN gh pr merge 22 --repo ajenchen/design-system --squash --match-head-commit 4a1f90edf3bda24f4b17060f676cc965df3f5ab2`.
   Read back merged state and protected `main`; do not wait for another user message.
3. Fetch the merged protected base, then in the clean Genesis worktree rebase only the Genesis commits:
   `git fetch origin main` followed by
   `git rebase --onto origin/main a3b4a86f6e17d237f94556a16c7d3266eadb1fb1 agent/close-control-plane-genesis`.
   Expected conflicts are generated lock/projection files; preserve canonical source semantics, regenerate, stage
   exact resolved files and continue the rebase. Never use destructive reset/checkout. Re-run generation/check,
   focused tests, tamper check and the real Claude authority probe on the final rebased clean tree.
4. Run `npm run test:governance-harnesses` exactly once on that final rebased tree because its receipt binds the
   final HEAD/tree. Fix any real failure. Push `agent/close-control-plane-genesis`, open one ready PR against
   `main`, monitor and remediate all candidate CI, then squash-merge with exact-head CAS and read back.
5. Continue §4 external activation/reconciliation/release in canonical order without engineering approval.
   Stop only at a true HUMAN_ONLY boundary. Do not bulk-push the mixed six-commit
   `../work-management` branch; after governance/bootstrap is merged, salvage and verify only the intended UI
   commit `1a26bd1` before normal PR/CI/merge handling.

### Completion condition

Do not stop at “source fixed” or “PR opened.” Completion is: PR #22 merged; Genesis candidate rebased,
fully verified, PR-green and merged; live protected-main readback captured; then every safely executable §4
step advanced until either complete or one precisely evidenced HUMAN_ONLY action remains. Keep this file as the
single continuation SSOT and update its live snapshot before the next handoff.

## 0. Current state（2026-07-31 Codex 收尾）

- 分支：`claude/remove-app-verdict-authz`；唯一 PR #22 以 protected `main` 為 base。本輪 closure
  set 依 `AGENTS.md#Git solo-work canonical` 由 agent 自動 commit／push／更新同一 PR、監看 hard
  gates，並在全綠後自主 squash merge；不得把舊 head 的綠／紅燈寫成新 head verdict。
- sibling `../work-management` 的 `codex/work-preview` 仍比
  `origin/codex/work-preview` ahead 6；這是下游本機殘項，不是外部 activation。
- 本檔只宣告已由 source、SSOT 與本機驗證證成的工程閉環；GitHub live apply、release、
  canonical Ubuntu visual promotion、獨立 certification／rollout 仍集中列在 §4，沒有被
  本輪冒充完成。

## 1. 本輪已完成的工程閉環

| 範圍 | Current closure |
|---|---|
| Provider / CI 基礎 | `Edit`／`MultiEdit` provider hook transport、workflow-security crash、managed-CI frozen job-key drift、sandbox-safe canonical sync 均已修；harness registry／source inventory／compatibility matrix 已同步 source。 |
| User 拍板的 DS source | AccountMenu 明確 no-email；FileViewer open focus 移入可聚焦 viewer shell；FilterPanel 只新增完整 `labels` 與 `maxConditions`（含 child pickers、deep merge、所有新增路徑 cap）；全域 compatibility 收斂為 LTR-only；Calendar 新增 `today?: Date` 並移除機械證成的空 week/day/size surface；ResizeHandle 降為誠實 pointer-only presentation；FieldControlGroup 移除空 `size` API。 |
| A11y 非對比度債 | Command separator required-children、DatePicker／Tabs IDREF、Steps／Overlay Surface scroll focus、TreeView consumer checkbox tab stop，以及既有 story 非對比度 violations 已修。權威 full scan：981/981 stories、719 fingerprints、5,108 nodes，**唯一 rule = `color-contrast`**；critical=0；baseline-diff gate = 0 regression。 |
| A11y fail-closed | `scripts/audit-a11y.mjs` 現檢查 Storybook `#error-message`；play／render failure 會成為 `audit-error`，不再把 HTTP 200 的錯誤頁當 Axe 綠燈。Avatar fallback story 亦改為內嵌成功圖 + 同源 404，移除外部 DNS 對 `networkidle` 的不確定性。 |
| Visual scenario truthfulness | Manifest 為 124 個唯一 scenario／file，12 個 interaction 全為 Playwright 真實 hover；stories 只標記 deterministic target，不用 `userEvent.hover` 假裝最終 CSS state。DatePicker range-middle 改用穩定 `data-day="2026-05-07"` locator。Final Layer A：124/124 render、12/12 interaction passed、0 render error、0 geometry violation。 |
| Release source chain | `release.yml` 只 stage：執行 read-only trust preflight，產 attempt-bound `npm-stage-${tag}-${run_id}-${run_attempt}` 與 closed 9-field finalizer handoff；`release-finalize.yml` 精確下載同一 artifact。兩條 workflow 共用 `scripts/release-sbom.mjs`，SBOM 由 tag/tree deterministic 重建；成功 finalizer 才可觸發 template mirror。 |
| GitHub reconciler | 已移除 `gh` shell-out，改以封閉 Node `fetch` 邊界；拒絕 cross-origin、fragment、dot segment、encoded traversal、method escape，且 `redirect: "error"`。Plan/read-only transport 可用；`--apply` 沒有被本輪執行。 |
| Governance planning | overlay motion、body max-height、cell indicator、Storybook taxonomy 等 planning status 已指回現行 machine/spec authority；role-aware evidence schema、provider compatibility/harness authority、release trust tests與文件同步。Active／executable plan 正文現由 `validate-planning-registry.mjs` 機械禁止把 commit／push／PR／merge／release／rollout 等工程動作綁回 user／owner approval；P2H 與精確 human-only action 保留。 |

### 1-A. User 決策（已實作，不再詢問）

| 題目 | 決定與狀態 |
|---|---|
| AccountMenu email 第二行 | **不做**；spec、anatomy、principles 與 open snapshot 均以姓名 + actions 為合約。 |
| FileViewer 開啟焦點 | **做**；composed `onOpenAutoFocus` 將焦點移入 viewer shell。 |
| FilterPanel public API | **只開 `labels` + `maxConditions`**；沒有預先加入 helper/footer slot 等無第二 consumer API。 |
| RTL | **不支援**；由 `packages/design-system/README.md#compatibility-matrix` 單一 owner，元件 specs 只引用。 |
| AUTO source changes | Calendar `today`、ResizeHandle pointer-only、機械證成的 Calendar／FieldControlGroup 空 API 收斂、非對比度 a11y 修復、visual scenario／beta.97 candidate 檢查皆已完成。 |

禁止為符合舊盤點數字猜測 breaking deletion；只移除可由 export、runtime 與 consumer search 機械證成的空 surface。

## 2. 驗證與可重現證據

### 2-A. A11y

- Authority：`infra/governance/baseline/a11y-baseline.json`
- Corpus：981 story IDs，baseline 綁定 sorted corpus digest。
- Final totals：719 stories/fingerprints、5,108 serious nodes、critical=0；
  `byRule = { "color-contrast": 5108 }`，非對比度 = 0。
- `npm run a11y:check -- --baseline-write`：PASS，無 Storybook error／audit-error。
- `npm run a11y:check -- --gate`：`PASS — 0 regression vs baseline`。
- 本 baseline **不是 WCAG AA 全綠宣告**；5,108 個 color-contrast nodes 仍是已知慢性債，
  gate 只保證本輪沒有新增／增量。

### 2-B. Visual

- Authority manifest：`scripts/visual-assertions.json`
- Runtime report：
  `.git/governance-runtime/evidence/visual/visual-audit/report.json`
- Final local command：
  `node scripts/visual-audit.mjs --auto-start --scope=all --no-diff --no-a11y`
- Result：124 scenarios、12/12 hover interactions passed、0 render error、0 geometry violation。
  因命令明確使用 `--no-diff --no-a11y`，report 內 diff／a11y 的 0 代表**未執行**，不得寫成
  pixel regression 或 WCAG PASS。
- Ubuntu authority workflow run `30671095099` artifact `8808941536`
  (`sha256:c3c918cfd770901c4d18512cc3c67e489f3d1891baddc401da049a49c804f0ac`)
  產生 124 張 PNG；report 唯一失敗類別是 11 張 missing baseline，其餘為 0 render
  error、0 geometry violation、0 contrast/a11y violation、0 diff-budget breach。
- User 於 2026-08-01 對該 exact 11-image set 明確核准。依 `AGENTS.md#自主執行-canonical`
  直接把 Ubuntu PNG 收入 canonical；候選由已提交的 113 張開始並只 overlay 11 張，
  因此 **create=11、unchanged=113、replace=0、delete=0**。
- Canonical authority `infra/governance/baseline/visual/curated/` 現為 124/124 PNG、extra=0。
  新 head 的 Ubuntu remote diff readback 尚待 PR check；本記錄不宣稱 independent
  cryptographic review，而未啟用的 optional review policy 也不是預設 blocker。

### 2-C. Release / workflow

- `scripts/test-release-bom.mjs`、workflow YAML parse、workflow-security（220/220）、
  workflow auditor（18 workflows）、harness registry／inventory（22/22）、deep-audit 與
  governance build-graph targeted checks均已通過。
- 本輪 workflow 變更後，已用 canonical
  `infra/governance/bin/sync-workflow-identities.mjs` 的
  propose → exact digest review → apply-reviewed 流程同步
  `infra/governance/desired/github.json`：3 個 physical workflow source／4 個 binding；
  `authorizationStatus = not-performed`，沒有執行 privileged authorization 或 live apply。
- 同步後 `release-trust-preflight.test.mjs` 14/14 PASS；`governance-infra-remainder` 的
  29 個 source members 合併重跑 493/493 PASS。第一次 all-Harness runner 揭露的唯一
  shared-suite failure即為上述 stale reviewed workflow identity，已由 canonical 流程閉合。
- identity closure 後的 all-Harness runner 為 10/11 suites PASS；唯一失敗是
  `consumer-clean-room` 的 transient-timeout integration 在 1,206 個 replay child 中第
  668 個遇到 host contention，兩次真實 30 秒 child deadline 都超時而正確 fail-closed。
  相同 current source 的完整 clean-room 隔離重跑 PASS；test wrapper 現仍先驗 production
  請求使用 canonical 30 秒／2 attempts，但 transient-control-flow fixture 的真實 child
  delegate 使用有界 120 秒 test-only headroom，persistent synthetic 2/2 timeout 合約不變，
  並補出完整 diagnostics／staticReplay。generation 後的最終
  `npm run test:governance-harnesses` 已 exit 0、11/11 suites PASS；13 個 registry domain 的
  `localHarnessStatus` 均為 `passed`。這是本機 source/harness verdict，不是外部 certification。
- 上述只證成 source chain 與 trust contract；沒有 dispatch、publish、GitHub Release、
  template mirror 或 consumer fanout 被本輪執行。

## 3. 仍存在的本機／工程債（不是 external-only）

| 項目 | Current debt |
| Color contrast | 719 fingerprints／5,108 nodes 已凍結；需另案逐 owner 修，不能把 baseline 說成 AA compliance。 |
| Visual canonical coverage | Canonical source 已 124/124；只剩新 PR head 的 Ubuntu remote diff=0 readback，未通過前不宣稱 remote visual gate complete。 |
| Aspirational wiring | 521 claims 中 chunks 33/40–43、約 120 adversarial 與約 50 條 secondary verification 尚未跑；`.claude/logs/aspirational-wiring-findings.json` 位於 non-authority 路徑，registry-based inventory 會漏。 |
| i18n Route B | FilterPanel labels 是 Route A public prop，不等於 DS `useI18n()` consumer；基礎設施仍幾乎無元件消費，硬寫中文與 `i18n-allow` 仍需另案。 |
| Code-quality escapes | `code-quality-allow`、`as any`／`as unknown as`、`eslint-disable` 尚無到期複查機制。 |
| Governance budget | Hook 60/60 已達 hard cap；`/knowledge-prune` 仍缺 opt-in telemetry。`design-system-audit/SKILL.md` 接近 transition cap。`.claude/logs` 約 64 MB 且屬 non-authority exclusion。 |
| Downstream local state | `../work-management` branch ahead 6；尚未 push／fanout。 |

## 4. 外部啟用／受保護操作（Standing Authorization AUTO）

以下皆依 `AGENTS.md#自主執行 canonical` 由 agent 自動續跑，不是逐 milestone 的人類核准 gate。
只有 login／MFA／OAuth、缺 credential reference、付費／法律／帳號／組織權限／商業承諾，或
產品／UI／UX SSOT 真取捨屬 human-only boundary；若遇到，agent 必先完成所有可代理 preflight，
只提出一個精確 human action，readback 後繼續。

1. **Live required checks reconciliation**
   - Desired SSOT 已在 `infra/governance/desired/github.json`。
   - 只能用 `infra/governance/bin/reconcile-github.mjs`；不得手刻 curl／ruleset。
   - Full-fleet `--apply` 與 live readback 仍受 external activation、runtime authorization、
     rollout authorization 與 off-host append-only evidence mirror fail-closed 保護。
   - 本輪沒有 apply；plan/read-only 可用不等於 GitHub live state 已收斂。

2. **Genesis transition（2026-08-01 distinct cleanup candidate）**
   - `scripts/governance-build-graph.json` 在本獨立 candidate 已改為
     `controlPlaneGenesisTransition.state = "closed"`、
     `cleanupRequiresDistinctProtectedPr = true`、`releaseAllowed = true`，並綁定重算後的 transition digest。
   - Open-only SSOT dispatch／status／propagation tombstones與 consumer preamble compatibility output 已退場；
     baseline compatibility tree 在 generation 後只保留指向 provider-neutral authority 的 exact symlink。
   - 此 candidate 必以 PR #22 merge 後的 protected base 開獨立 PR，required checks 與 merge/readback
     通過前不得預先 tag/release。Closure 只解除 Genesis freeze，不代表 external activation、certification、
     fleet rollout 或 soak 已完成。

3. **Release identities與真實執行**
   - npm package identities／bootstrap、三個 trusted publishers、tokenless 2FA publishing、
     account-holder 互動式 2FA、signed release authorization／tag authorizer 尚需 owner。
   - 前置條件完成後才可送 `stage-protected-release` repository dispatch，再執行 finalize、
     template mirror 與 `consumerctl apply-fanout`。
   - Source dead chain 已修；真實 stage/finalize/mirror/fanout execution 尚未發生。

4. **Ubuntu visual canonical readback**
   - `.github/workflows/visual-regression.yml` 的 authority runner 是 `ubuntu-24.04`。Exact Ubuntu
     artifact 的 11 張缺口已經 user 核准並收入 canonical；本次 push 後必須讀回
     新 head 的 diff errors=0、breaches=0，失敗則 agent 自動修復。
   - `visual-baseline-review-policy.json` 維持 optional、`not-activated`；只有 user 明確
     要求 independent cryptographic review 時才啟用，不得將它當成明確 UI 核准後的第二道 gate。

5. **External assurance**
   - `infra/governance/external-activation-requirements.json` 的外部 requirements 仍未啟用，
     evidence 尚未具備；包含 GitHub App identity、managed rulesets/readback、mirror mutation
     boundaries、off-host evidence、managed host／managed CI attestation 等。
   - `review-capability-certifications.json.certifications = []`；獨立 provider/capability
     certification、fleet rollback drill／rollout 與 72h soak 尚未開始。
   - 因此不得宣稱 independent review complete、promotion eligible 或 production release ready。

## 5. 後續合法順序

1. **已完成（本 worktree）**：canonical workflow identity sync、governance generation/check、
   full Harness 11/11 與 final local verification。
2. Agent 依 Standing Authorization commit／push／更新 PR #22；遠端 checks 必以新 head 重跑，
   hard gates 全綠後自主 squash merge，不引用舊快照或另等 user trigger。
3. 以 PR #22 merge 後的 protected base 將本 candidate 作為獨立 protected PR 關 Genesis transition，並完成 merge/readback。
4. 啟用外部 identities／authorities／evidence，完成 required checks live reconciliation。
5. 取得 signed release authorization，執行 stage → finalize → template mirror → consumer fanout。
6. 完成獨立 capability certification、fleet rollout／rollback drill 與 72h soak 後，才可評估
   promotion eligibility。

## 6. 流程約束

- Generated governance 檔不得手改；所有 canonical source 穩定後執行
  `npm run governance:generate`，再以 `npm run governance:check` 與 full harness 驗證。
- Live apply、release、baseline promotion、certification 都是不同 authority boundary；「source
  已修」不得改寫成「外部 execution 已完成」。
- 本檔是 planning/current-state SSOT，不取代 machine authority、runtime evidence 或 live readback。

相關：`governance/memory/project_provider_neutral_governance.md`、
`governance/memory/feedback_solo_dev_workflow.md`。
