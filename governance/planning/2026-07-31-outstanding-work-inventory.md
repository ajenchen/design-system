<!-- Authority/status: governance/planning/registry.json -->
# 2026-07-31 全域殘項總帳（歷史跨 session baton）

> **2026-08-01 lifecycle**：本檔已由 `governance/planning/registry.json` 收為
> `reference / non-executable`。它保存交接 provenance，不再是 current backlog；任何 agent 必以
> deep-audit runtime evidence、`infra/governance/release-workflow.json` 與 `npm run release:status`
> 取得 live state，不得照下列歷史步驟重跑工作。

**用途**：記錄 2026-07-31 全域盤點後的 current state。後續 session 應先讀本檔，再依
canonical machine state 與實際 worktree 驗證；不得把本檔的歷史描述當成 live remote verdict。

## Historical Codex execution ledger（2026-08-01 snapshot）

Codex 已於 2026-08-01 接回完整執行責任；Claude handoff 已結束。任何 AI agent（Codex、Claude 或
後續 provider）都必須先讀 root `AGENTS.md`、root `CLAUDE.md` 與本檔，沿 live exact-head/readback
繼續，不得重跑全域 discovery，也不得為已授權的工程動作再次詢問 user。暫存 worktree 路徑不是
authority；standard release 的唯一 machine execution SSOT 是 `infra/governance/release-workflow.json`。
本節只記 current state；歷史診斷只供 provenance，不得蓋過 machine verdict。

### Authority（不得再次詢問）

- User 已明確授權全部工程、baseline、Git、PR、CI remediation/rerun、merge、release、rollout 與
  readback。Exact visual image set 的「可以改」已是完整 UI/UX 核准；不需要第二次核准、key
  enrollment、OWNER comment 或 signature，也不得啟用 optional independent cryptographic review。
- 只有真正未解的產品／UI／UX SSOT 取捨才 ASK。Standard release 可能遇到的 HUMAN_ONLY runtime
  邊界只有 login/MFA/OAuth/缺 credential reference；完成 exact action 後 AUTO resume。其他全域
  billing／付費／法律／帳號／組織權限／商業承諾邊界仍依 `AGENTS.md`，但不是 release milestone。
- Engineering failure、CI failure、GitHub write、commit/push/PR/merge/rebase/release milestone 都是
  AUTO，不是 user approval gate。Claude 的 `decision-authority-routing` live probe 必覆蓋同一語意。

### Exact local state（接手時不可丟棄）

- PR #22 worktree：`/Users/chenqiren/Library/CloudStorage/GoogleDrive-qijenchen@gmail.com/我的雲端硬碟/my-project`
  - branch `claude/remove-app-verdict-authz`，final head `740dcc03883f7b2f56a93dc1fc55e71cb2c9893e`
  - PR `https://github.com/ajenchen/design-system/pull/22` 已於 `2026-08-01T06:21:55Z` squash merge
  - protected `main` merge SHA `9052def15e138b34f5b2066c278bae2fb8501401`；final head 與 merge tree 完全相同
- Genesis worktree：`/private/tmp/ds-genesis.B3xxFi`
  - branch `agent/close-control-plane-genesis`
  - 12 個 Genesis commits 已完整 rebase 到 `main@9052def1`；衝突只出現在 generated projection/lock，
    全部由 canonical source 重新生成並通過每層 build-graph check。rebase 後 pre-release tip 為
    `3260e3d8`；目前正在同 branch 完成 `0.1.0-beta.98` release closure，因此 exact tip 以
    `git rev-parse agent/close-control-plane-genesis` 為準。
  - 下列為 rebase 前的原始 commit identity（只供 provenance）：
    `58909462` 關閉 control-plane Genesis → `d54586c9` 驗證 Claude authority routing →
    `c94257d6` 要求 Claude authority routing → `b40a5447` runtime evidence 明確 public →
    `bd228374` authority probe 改 stage-relative → `830fcb8f` 退場 per-change privileged ceremony →
    `656941b7` 本檔 live snapshot → `5031a0bc` authority-routing fixture 綁定（真缺陷）→
    `a5e7be68` linked-worktree evidence root（真缺陷）→ `5be08957` 更正 harness 數字 →
    `9ff1505e` 記錄修後 all-Harness 複驗 → `b3455ffc` self-describing baton
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
  （`node infra/governance/bin/conform-provider-runtime.mjs --provider claude --allow-model`）已在 beta.98
  candidate 執行。首輪 fail-closed 揭露兩個真實指令穩定性缺口：`missingCredentialReference` 被誤分為
  ASK、forked reviewer 漏回傳 public sentinel；canonical authority prompt 與 Claude reviewer adapter
  已補閉合語意及 regression assertions。focused test 31/31 後第二輪 live probe **PASS**；工程/Git/PR/CI/
  release/已核准 baseline=AUTO，唯一未解 UI/UX SSOT=ASK，login/MFA/OAuth/owner/billing/缺 credential
  reference=HUMAN_ONLY，context-fork 與 native hook evidence 皆通過。
- beta.98 source closure commit `fe8acb76b8c305dd1a69df0f051197ae69cad4cc`（tree
  `1310d270b9eae5210a33083d1e627ca792e2daac`）已在 clean tree 完成一次完整 `release:preflight`：
  11/11 Harness、981/981 Storybook runtime、fresh-consumer pack/install/build 全部 PASS。PR #23
  `https://github.com/ajenchen/design-system/pull/23` 已以 ready 狀態建立。
- PR #23 首輪 protected-base authority check（run `30690122000`）揭露既存 npm config SSOT 漂移：
  trusted candidate installer 要求 exact `legacy-peer-deps=true`、`ignore-scripts=true`，但 authority root
  `.npmrc` 另有反序與 `save-exact=true`，而 authority setup 又維護第三份 literal。這不是 credential 或
  user approval blocker。修復方向已確定：兩行 closed config 由
  `scripts/lib/governance-dependency-bootstrap.mjs` 單一 export，candidate／authority／consumer setup
  全部消費同一 constant，root `.npmrc` byte-order 對齊 protected verifier。因 source tree 變動，
  `fe8acb76` receipt 已成歷史證據；修後必生成、targeted verify、commit，再只對新 exact tree 跑一次
  final preflight，更新同一 PR #23。不得略過紅燈或冒充舊 receipt 仍有效。

### PR #22 final readback（2026-08-01；authoritative）

- Final exact head `740dcc03883f7b2f56a93dc1fc55e71cb2c9893e` 已通過全部 candidate-required checks，
  並以 head CAS squash merge；PR state=`MERGED`，merge SHA=`9052def15e138b34f5b2066c278bae2fb8501401`。
- `git fetch origin main` 後讀回 `origin/main=9052def1`，且
  `740dcc0^{tree}=origin/main^{tree}=a9c24a5dc6832d5f04ebf28efa1e69ce3e98e62a`。
- 兩個非 required checks（credential-free authority candidate、Governance App verdict）維持既有 fail-closed
  語意，沒有偽造綠燈；不影響候選 required gate 或 exact-head merge。

#### Historical pre-merge diagnostics（superseded；只供 provenance）
- PASS：`a11y(axe-core WCAG 2A+AA, Dim 49)`（02:13:22→02:42:26）、
  `Visual Regression Diff(curated scenarios pixel match)`（02:13:15→02:21:57）、`Composition Fidelity Diff`、
  `Bundle size budget(Dim 50)`、`Packaging integrity`、`Header rules`。Netlify `Redirect rules`／`Pages changed`
  為 `neutral`。此綠燈只證明 PR #22 exact head；不得取代 Genesis final exact-head 的 Ubuntu
  remote diff readback。
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

### Historical Claude sandbox constraints（superseded；不得作為目前環境 verdict）

以下是前一個 Claude sandbox 的歷史實證，只供 provenance。Codex 目前已具 GitHub read/write 與本機
執行能力，必須用 live command/readback 判定；不得沿用下表作為 current blocker。

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

**Historical note**：前一個 Claude sandbox 無法產生全綠 receipt；該 preflight/candidate 流程已退為
provenance，不是 current standard release gate。

### Mandatory continuation order

唯一合法順序是 `pr-checks → merge → publish → readback → consumer`，全部 AUTO；用
`npm run release:status` 取得第一個未完成步驟，並用 `npm run release:auto` 安全續跑。舊 Genesis、
candidate receipt、external activation、certification、offline signature、soak 與 fleet promotion
描述不得插入額外階段或 approval gate。

### Completion condition

Do not stop at “source fixed” or “PR opened.” Completion means all five machine steps have live readback, or
the exact current action is paused only for login/MFA/OAuth/credential reference. This planning file never
overrides `infra/governance/release-workflow.json` and must not introduce another completion definition.

**2026-08-01 current status**：PR #23 已 merge 到 protected `main`；先前 preflight/candidate 記錄只供
歷史 provenance。後續狀態一律由五步 orchestrator 的 GitHub/npm/consumer live readback 判定，沒有
未決 UI/UX 決策 blocker；login/MFA/OAuth/credential reference 完成後必自動續跑。

## 0. Historical state（2026-07-31；superseded by active ledger above）

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

## 4. Standard release（Standing Authorization AUTO）

`infra/governance/release-workflow.json` 是唯一 blocking graph：`pr-checks → merge → publish → readback →
consumer`。Agent 只用 `release:auto`／`release:status` 執行與讀回；CI/workflow/readback failure 自動修復，
不是核准點。Login/MFA/OAuth/credential reference 完成後 AUTO resume。

Legacy candidate-freeze、broad external activation、model certification、offline signatures、72h soak 與
fleet promotion 對 standard small-team release 明確是 non-blocking 或 retired。它們可留作歷史或額外
assurance evidence，但缺漏不得阻止五步完成，也不得改寫 production release ready 的五步定義。

Ubuntu visual、required CI、GitHub Release、npm exact versions、template 與 WM protected-main readback
仍在各自五步內 fail closed；optional cryptographic review 未經 user 明確要求不得啟用。

## 5. 後續合法順序

唯一 authoritative execution order 是 `infra/governance/release-workflow.json` 的五步。本檔不另立
或複製另一套 current 流程。

## 6. 流程約束

- Generated governance 檔不得手改；所有 canonical source 穩定後執行
  `npm run governance:generate`，再以 `npm run governance:check` 與 full harness 驗證。
- 「source 已修」不得改寫成「外部 execution 已完成」；只接受五步 live readback。
- 本檔是 planning/current-state SSOT，不取代 machine authority、runtime evidence 或 live readback。

相關：`governance/memory/project_provider_neutral_governance.md`、
`governance/memory/feedback_solo_dev_workflow.md`。
