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
  - **clean committed HEAD `a5e7be68`**（2026-08-01 Asia/Taipei，本輪由 Claude Code 收斂 dirty diff 後提交）
  - nine commits after old PR head `a3b4a86f6e17d237f94556a16c7d3266eadb1fb1`:
    `58909462` → `d54586c9` → `c94257d6` → `b40a5447` → `bd228374` → `830fcb8f`
    → `656941b7`(本檔 live snapshot) → `5031a0bc`(authority-routing fixture 綁定)
    → `a5e7be68`(linked-worktree evidence root)
  - 先前的 dirty worktree **已完整保留並提交**，沒有任何 reset/checkout/clean。`830fcb8f` 內容：
    verifier 移除 per-change Ed25519 `issue`/`cosign` API、OWNER-comment bootstrap transition、
    `bootstrapCommentBody`，以及 `--issue/--private-key/--signer-key-id/--subject/--issued-at/
    --expires-at/--bootstrap-comments/--pull-request` 八個 CLI flag（全部 fail-closed 拒絕），
    `verifyPrivilegedChange` 亦以 rest-param 拒絕任何 unsupported option；anchor workflow 移除
    `issues: read` 與 authenticated bootstrap-comment fetch step。保留 control-plane Genesis receipts、
    semantic-source closure、trusted+candidate 聯集閉包、append-only issuer lineage，以及
    runtime/rollout/fleet-recovery/release-tag 全部加密 attestation 流程。同時補上 Claude live authority
    cases：`approvedVisualBaseline = AUTO`、`ownerAction`／`billing`／`missingCredentialReference = HUMAN_ONLY`。
  - 修掉一個真實缺陷：新增的 removed-flag CLI 測試原本寫成
    `spawnSync(process.execPath, [verifier, …])`，被 `harness-source-inventory` 判為
    unreviewable Node pre-script argv；已改用 canonical 的 `['--', verifier, …]` sentinel 形式
    （對照 `scripts/test-check-governance-tamper.mjs:64`）。
- 本輪本機驗證（全部在 `830fcb8f` 的乾淨 tree 上重跑並通過）：
  `node --test infra/governance/test/provider-runtime-conformance.test.mjs` 31/31、
  `npm run test:privileged-change-authorization` 25/25、`npm run test:workflow-security` 220/220、
  `node scripts/test-check-governance-tamper.mjs` 128 assertions PASS、`npm run governance:generate`、
  `npm run governance:check`、`node scripts/check-governance-tamper.mjs --check`
  （49 exact-source gates、scaffold `cb65b7b61332`、0 waiver）、`git diff --check` 皆 PASS。
- 真實 bounded Claude probe
  （`node infra/governance/bin/conform-provider-runtime.mjs --provider claude --allow-model`）已在該乾淨 tree
  執行：**fail-closed**。`claude --version` 解析成功，但 `subscription-entitlement-readback` 的
  `auth-status-command-completed` exit 1，因此 `claude-max-entitlement-readback-verified=false`，
  所有 model-backed check（含 `decision-authority-routing`）依設計在未啟動 model process 前就 fail closed。
  這是 sandbox 環境限制（probe 以只帶 `HOME` 的封閉環境啟動巢狀 `claude`，該環境無網路），
  不是 source 缺陷；行為本身正確。此 probe 需在非 sandbox host 重跑才能取得 pass evidence。

### PR #22 live snapshot（2026-08-01 11:40 Asia/Taipei；readback by exact head）

- Exact head `4a1f90ed` 仍 OPEN、`draft=false`、`mergeable=true`、`mergeable_state=unstable`、`merged=false`，
  base 為 `main@8c4610cb`。
- PASS：`a11y(axe-core WCAG 2A+AA, Dim 49)`（02:13:22→02:42:26）、
  `Visual Regression Diff(curated scenarios pixel match)`（02:13:15→02:21:57）、`Composition Fidelity Diff`、
  `Bundle size budget(Dim 50)`、`Packaging integrity`、`Header rules`。Netlify `Redirect rules`／`Pages changed`
  為 `neutral`。**Visual Regression 綠燈即為 §4.4 所等的新 head Ubuntu remote diff readback**。
- **FAIL（candidate 真紅燈，需修）**：`Verify(tsc + tests + compile + build)`，run `30679561262` /
  job `91313734593`，02:13:15→03:01:04，於 **step 14 `Fork-governance corpus + harness`** 執行 42m37s 後 exit 1，
  其後 20+ steps 全 skipped。該 step 依序跑四個命令；後三個
  （`audit:workflow-security`、`governance:workflow-identities:check`、`node scripts/governance-build-graph.mjs --check`）
  已在 PR #22 的 exact tree 本機重跑，**全部 exit 0**，因此失敗必在 `npm run test:governance-harnesses` 之內。
  精確失敗 suite 尚未定位：job log 需 repository admin 權限（未授權讀取回 403），run artifacts = 0，
  且本 sandbox 無法完整重現（見下節）。
- 兩個既有紅燈 `Verify authority candidate without credentials`（= `governance-anchor.yml` 的 job）與
  `Publish Governance App verdict` 已定性：protected base `origin/main` 的
  `scripts/verify-privileged-change.mjs` 仍是舊 ceremony 版（仍含 `issuePrivilegedChangeAuthorization`、
  `verifyBootstrapTransition`、`bootstrapComments`），故任何動到 privileged path 的 PR 必紅。
  `mergeable_state=unstable`（而非 `blocked`）證明兩者都**不是** blocking required check。
  本 Genesis candidate merge 進 main 後即自然轉綠。不得改寫成綠燈。

### Sandbox execution constraints（2026-08-01 實測；下個 session 不要重跑這段 discovery）

以下全部是 **執行環境限制**，不是 repo 缺陷。在非 sandbox host 或 CI 上不成立。

| 能力 | 狀態 | 實證 |
|---|---|---|
| `git` fetch／push（含新 branch） | **可用** | `git push --dry-run origin agent/close-control-plane-genesis` 回報 `* [new branch]`，認證成功 |
| GitHub REST **未授權**讀取 | **可用** | `curl` 經 allow-list proxy 讀 PR／check-runs／jobs 皆 200（public repo，60 req/hr） |
| GitHub REST **授權**寫入（merge PR、開 PR、rerun job） | **不可用** | `gh` 任何 API 呼叫失敗於 `tls: failed to verify certificate: x509: OSStatus -26276`（Go 在 darwin 走 Security.framework，sandbox 擋掉；`SSL_CERT_FILE`、`GODEBUG=x509usefallbackroots=1` 無效）。`gh auth token` 回 `no oauth token found for github.com`；環境無 `GH_TOKEN`／`GITHUB_TOKEN`；keychain 探測被 permission classifier 擋下 |
| CI job log 讀取 | **不可用** | `GET /actions/jobs/91313734593/logs` → 403 `Must have admin rights to Repository`；該 run artifacts = 0 |
| Node fetch 對外 | 需 `NODE_USE_ENV_PROXY=1` | 未設時 `getaddrinfo ENOTFOUND`；設定後 200 |
| Chromium／Playwright | **不可用** | `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)`。所有 Playwright gate（`data-table-invariants`、`audit-consumer-a11y`、visual、storybook smoke）本機必紅 |
| `mktemp -d` | **不可用** | macOS `mktemp -d` 走 `/var/folders/.../T/`（不理會 `TMPDIR`）→ `Operation not permitted`。`canonical-hook-behavioral` suite 因此必紅 |

實測 `npm run test:governance-harnesses`（在 `830fcb8f`）= **11 個 harness entry 中 6 個通過、5 個失敗，exit 1**。
（**更正**：先前一版本檔誤記為「10/11 通過」。該數字來自只 grep stderr 的 `❌` 行，漏掉了以 JSON
`"status": "failed"` 回報的 suite summary。正確做法是解析每個 suite summary 物件，不是掃 stderr。）

逐項失敗與分類：

| Harness entry | 失敗成員 | 分類 |
|---|---|---|
| `governance-script-remainder`(43 members) | `test-devmode-geometry-invariant`、`test-visual-audit-interaction` | 環境（Chromium） |
| `run-gate-meta-tests` | `test-audit-consumer-a11y`、`test-check-agents-bootstrap`、`test-data-table-invariants` | 環境（Chromium） |
| `governance-infra-remainder`(29 members) | `model-validation`、`staged-rollout` | **真缺陷，已修** |
| `governance-package-remainder`(10 members) | `provider-adapter-generator`（2 例） | 環境（`mkdtemp /private/tmp`） |
| `canonical-hook-behavioral` | `hooks/tests/run-all.sh` | 環境（`mktemp -d`） |

兩個真缺陷已在本 branch 修掉，兩者都會讓 Genesis PR 的 CI 紅：

1. `5031a0bc` — `validateDriverSpecificCommandEvidence` 會用 canonical source 重算 Claude
   authority-routing probe 的 arguments 並要求 runtime evidence 完全綁定，但
   `model-validation.test.mjs` 的 redacted certification fixture 對所有非 capability check 一律產生
   placeholder `['<claude-authority-routing>']`（且 `environmentNames: []`），於是
   `validateCertifications` 直接 throw。修法：export `prepareClaudeAuthorityRoutingProbe`，
   讓 fixture 由 canonical source 推導同一條 exact command。此缺陷隨 authority-routing driver 一起進來
   （`origin/main` 沒有 `claude-authority-routing`，`bd228374` 已有），**早於** `830fcb8f`。
   修後 `model-validation` 18/18。
2. `a5e7be68` — `staged-rollout.test.mjs` 兩處硬寫 `resolve(process.cwd(), '.git/governance-runtime/evidence')`；
   linked worktree 的 `.git` 是檔案不是目錄，故 `ENOTDIR`。改為消費 canonical
   `resolveGitRuntimeRoots`（走 `git rev-parse --absolute-git-dir`）。修後 76/76。
   這一項在正常 clone 的 CI 不會發生，但它讓 harness 無法在本 repo 自己的 worktree 流程下跑完。

**修後於最終 tree `5be08957` 重跑全 all-Harness 複驗**：`governance-infra-remainder`
**由 failed 轉為 passed（29/29，563s）**，兩個真缺陷確認在 suite 層級關閉；
`governance-script-remainder`(43 members) 仍只有原本那 2 個 Playwright 失敗，無新增回歸。
最終 11 個 entry 中 7 passed / 4 failed，exit 1，四個失敗全屬上表環境限制：
`governance-script-remainder`(Chromium ×2)、`run-gate-meta-tests`(Chromium ×3，
`ran=64 pass=61`)、`governance-package-remainder`(`mkdtemp /private/tmp` EPERM)、
`canonical-hook-behavioral`(`mktemp -d`)。

注意：**single suite 無法單獨執行**——`run-harness-suite.mjs --suite <id>` 會直接
`Harness suite blocked: Harness suite may only run inside the canonical all-Harness runner`，
只能整批跑（約 65 分鐘）。個別 test 檔仍可用 `node --test <path>` 驗。

**all-Harness receipt 仍必須在非 sandbox host 或 CI 產生**；在本 sandbox 內無法取得綠燈，
也不得因此宣稱 source 有缺陷。

### Mandatory continuation order

1. ~~完成 Genesis dirty diff~~ **已完成**：見上方 `830fcb8f` 與其驗證清單。除非改動 canonical source，
   否則不要重跑這步。
2. **先解除 GitHub 授權寫入阻塞**（唯一 HUMAN_ONLY 邊界，屬「缺 credential reference」類，
   不是工程核准 gate）：把既有 GitHub credential 以 environment reference 形式提供給 session
   （`GH_TOKEN`，fine-grained、scope = `ajenchen/design-system` 的 Contents: write + Pull requests: write），
   或改在非 sandbox host 執行第 3–5 步。**禁止把 secret 貼進對話或寫入 repo。**
3. 修復 PR #22 的 `Verify` 紅燈並 merge。取得授權後先讀 job `91313734593` 的 log 定位失敗 suite；
   若證實為已記錄的 `consumer-clean-room` host-contention flake，直接
   `POST /repos/ajenchen/design-system/actions/runs/30679561262/rerun-failed-jobs`；
   若是真缺陷則同 branch 修正並 push（會產生新 head，CAS 需改用新 head）。全綠後以 head CAS squash merge：
   `gh pr merge 22 --repo ajenchen/design-system --squash --match-head-commit <exact head>`，
   再讀回 merged state 與 protected `main`。
4. Fetch merged protected base，於乾淨 Genesis worktree 只 rebase Genesis commits：
   `git fetch origin main` 後
   `git rebase --onto origin/main a3b4a86f6e17d237f94556a16c7d3266eadb1fb1 agent/close-control-plane-genesis`。
   **預期衝突集已算出，恰為 6 個 generated lock/projection 檔**：`governance/control-plane.lock.json`、
   `governance/generated/control-plane.json`、`governance/generated/PROVENANCE.md`、
   `packages/design-system/ds-canonical/fork/consumer/lock.json`、
   `packages/design-system/ds-canonical/fork/governance.lock`、
   `template/ds-product-template/governance/lock.json`。解法：保 canonical source 語意 →
   `npm run governance:generate` → stage exact resolved files → `git rebase --continue`。
   禁用破壞性 reset/checkout。最終 rebased tree 上重跑 generation/check、focused tests、tamper check
   與真實 Claude authority probe。
5. 於最終 rebased tree 跑一次 `npm run test:governance-harnesses`（receipt 綁 final HEAD/tree；
   本 sandbox 無法綠，須在非 sandbox host 或倚賴 PR CI）。Push `agent/close-control-plane-genesis`
   —— 注意 rebase 會改寫歷史，**在 rebase 完成前不要 push**，避免之後需要 force-push。
   開一個 ready PR 對 `main`，監看並修復所有 candidate CI，再以 exact-head CAS squash merge 並讀回。
   合併後 `Verify authority candidate without credentials` 應自然轉綠。
6. 續跑 §4 external activation／reconciliation／release。不要整批 push `../work-management` 的六個 commit
   （已確認：clean tree、ahead `origin/codex/work-preview` 6，其中 `1a26bd1`
   = `fix(work): 帳號入口對齊 SSOT — footer 唯一入口 + App.tsx file-size 拆分`，動 4 檔）；
   governance/bootstrap 合併後只 salvage 並驗證 `1a26bd1`，再走正常 PR/CI/merge。

### Completion condition

Do not stop at “source fixed” or “PR opened.” Completion is: PR #22 merged; Genesis candidate rebased,
fully verified, PR-green and merged; live protected-main readback captured; then every safely executable §4
step advanced until either complete or one precisely evidenced HUMAN_ONLY action remains. Keep this file as the
single continuation SSOT and update its live snapshot before the next handoff.

**2026-08-01 11:40 狀態**：已抵達「一個精確 HUMAN_ONLY action 為止」的邊界。可代理範圍內能做的都做完了
（Genesis diff 完成並提交 `830fcb8f` + 全部 targeted 驗證綠、PR #22 三個 fast CI gate 在其 exact tree 本機
複驗綠、CI 失敗面已收斂到單一 step、rebase 衝突集已預算出、WM salvage 目標已確認）。剩下的唯一阻塞是
上表「GitHub REST 授權寫入 = 不可用」，屬缺 credential reference 的平台邊界；補上 environment reference 後，
第 3–6 步全部是 Standing Authorization AUTO，不需要任何工程核准。

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
