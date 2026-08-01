# Fleet governance control plane

本目錄是 GitHub fleet 與 provider-surface 治理的 machine-readable control plane。預設只描述、驗證與產生計畫；唯一新增的 consumer fanout 動作也必須先通過完整模型、簽章 ring 與 reviewed digest 重驗，只能對 inventory 內的 current wave 發出 dispatch，不宣稱完成。Consumer 內容、package 發版與 template mirror 仍由既有 canonical pipeline 管理。

## One-command setup across local and cloud runtimes

DS-author 在 macOS、Linux、WSL2、Codex Cloud、Claude Code Cloud、Codespaces 與 committed devcontainer 都使用同一個公開入口：

```sh
npm run setup:all
```

它不是薄包裝：先執行 role-bound `setup:governance` primitive，驗證 Node 下限與 lock 綁定的 npm 11.18.0 tarball／integrity，以隔離的 npm 設定執行 lifecycle-disabled `npm ci`、registry signature audit 與 high-severity audit；DS-author 再 provision lock-matched package-local Chromium（Linux 一定執行系統 dependency setup）、跑 provider-neutral governance check與全部已登錄 local governance Harness。最後由同一入口安裝、驗簽、稽核並 read back provider CLI provisioning registry 中以 canonical lock 綁定的 CLI（目前是 Claude Code 與 Codex）。每個 compatibility provider 都必須在該封閉清單明示選擇 `repo-provisioned-cli` 或 `external-runtime`；新 provider 只有前者需要新增 exact npm lock／SRI／platform package，後者不會被安裝器擅自虛構 CLI。使用者或 hosted image 注入的 npm／Playwright／CLI override 不會取得 authority。DS-author 完整入口可能耗時數小時，因為 All-Harness 的外層期限由同一份 registry 中的所有唯一命令期限總和加固定收尾預留機械推導，不會被一般 bootstrap 的 15 分鐘預設誤殺。

專用 GitHub Actions job 不應為了安裝依賴重跑整套 Harness；它們共用同一份實作的封閉子入口：

```sh
npm run setup:dependencies
```

這個子入口只做上述 exact npm、locked install、signature 與 vulnerability 四階段；它不是治理合規或 cloud certification。需要瀏覽器的 DS-author workflow 再共用 `npm run setup:playwright -- --with-deps`。受保護 base 驗證器使用這個 exact bootstrap；candidate checkout 與已生成 product mirror 則維持無憑證、角色隔離的 consumer 安裝路徑，不能反過來執行 DS-author authority。

Product template／consumer 對外也只需記 `npm run setup:all`；其內部 role-bound `setup:governance` primitive 安裝 exact package、驗證 fork/package lock 並執行 consumer hard gate，之後同樣 provision canonical peer CLI，但不取得 DS 發布、fleet mutation 或 DS-author All-Harness 權限。「各環境不打折」是同一 canonical meaning 與該角色的完整 blocking outcome，不是把 authority 權限複製給 consumer。

Provider CLI exact lock 更新後，package-content authority 必須走唯讀 proposal 流程，不得由 setup/install 順手回寫：

```sh
npm run governance:provider-cli-content:propose \
  > /tmp/provider-cli-package-content-proposal.json
npm run governance:provider-cli-content:propose -- \
  --verify-proposal /tmp/provider-cli-package-content-proposal.json
```

第一個命令只讀 canonical manifest 與其 SHA-256 綁定的 exact package-lock，透過正式 setup module 的共用 authority resolver／active-plan SSOT 推導 closure，逐一以 bounded request 下載 exact canonical HTTPS tarball；redirect、SRI 與 strict ustar package tree 任一不符即 fail closed。輸出不含時間戳，且只寫 stdout；沒有 `--apply`、不安裝 CLI、不修改 authority／Git／WM，也不執行 generator。

第二個命令仍然完全不寫檔：它依 closed proposal schema 重新核對目前的 exact manifest/lock bytes、固定十筆 active plan、package-content digest，以及 proposer、parser/setup、proposal schema 三個直接來源的 path+SHA-256；接著逐筆重新讀取十個 exact HTTPS lock artifacts，交給相同 shared strict parser 獨立重衍生並比對所有 rows。它同時支援 PR 套用前的 `inputManifestSha256` 狀態，與套用後 canonical 2-space+newline bytes 的 `proposedManifestSha256` 狀態，讓另一個 process／reviewer 可重驗同一 transition。這不是 offline preflight：完整 verify 必須成功重取並重衍生十筆內容，但仍是 zero authority writes、沒有 apply 能力。獨立驗證與 hard gates 通過後，agent 依 Standing Authorization 只能在 protected DS PR 以 proposal 的 exact `proposedPackageContent` 取代 canonical manifest 的 `packageContent`，再由 canonical governance graph 生成與檢查所有 projection；不得把 proposal JSON 直接當成可執行 patch，或繞過 review/apply handoff。

單一 consumer 的 `npm run sync-all` 是 transaction-safe 更新入口；整個 fleet 則使用 `governance:fleet:plan` → independent review → `governance:fleet:check` → `governance:fleet:apply-reviewed`。Fleet 只涵蓋 `managed-repos.json` 內已登錄、opt-in 的 consumer；由 template 建立但尚未登錄的未知 repository 必須先走 content-addressed registration proposal，系統不會以「自動發現」冒充完整覆蓋。

`fleetScope` 是此邊界的 machine-readable SSOT。Reconcile plan 同時回報全部已登錄 inventory 的變更／衝突總數與 current selected wave 總數，不得用 wave 的局部 `0` 掩蓋全 inventory 仍有 drift。

Independent second opinion 同樣是 provider registry 驅動：目前作者是 Claude 時選 Codex peer、作者是 Codex 時選 Claude peer；同 provider collision、未知 provider、未認證 target 或缺證據都 fail closed。`deep-audit-cross-codex` 保留為使用者熟悉的 alias，不是把 Claude/Codex 寫死成 meaning SSOT；未來模型必須先加入 registry、adapter、surface test 與 target certification 才能被選為 reviewer。

All-Harness 的「全部」由 `providers/harness-source-inventory.json` 封閉：每個已發現的 local governance test source 必須恰有一個執行 owner或一個明確 reviewed exclusion；generated Claude mirrors 不重跑，真實外部 readback 與互動式非治理探索也不會被偽裝成本機 PASS。Local PASS 仍不能自動把下方 certification ledger 的 cloud/live 狀態改成 certified。

只有 runner 本身以 module-private production-executor capability 實際返回完整 PASS 後，才會原子化留下 `runtime/all-harness-receipt.json`；測試注入的 executor、clone／事後改寫的 summary，以及 caller 自建的 receipt 都無法經 production issuer／writer API 發行。該 structured receipt 以 SHA-256 綁定 DS HEAD/tree、完整 Git-visible worktree 與 index 的 portable digest、control-plane lock、Harness registry/source inventory、每個 active registered local source 的 canonical `path + content SHA-256` 投影、exact runner argv 與完整 run summary，TTL 為 24 小時。Completion readiness 會從當前 repository 重建 worktree/index 與 canonical source projection 後只讀驗證；receipt 缺失、過期、被改寫，或任一 tracked／untracked／staged 檔、source 新增／移除／內容與 subject drift，均使 `localReady=false`，不接受終端文字代替持久 receipt。這仍是同一個本機信任域內的 tamper-evident execution receipt，不是對惡意本機檔案 writer 的密碼學 attestation；跨信任域的完成證明仍必須由下述獨立 issuer 與外部 readback 提供。

## Provider-neutral execution architecture

「Claude Code 與 Codex 等價」的定義是同一批 canonical bytes、applicable rule coverage、證據要求與 blocking outcome，不是強迫兩個 runtime 使用相同的原生 wire format。控制平面分成五層：

1. **Meaning SSOT**：`AGENTS.md` 只放每次任務必需的共用導航；規則、技能、hooks、references 與 product templates 由 `packages/design-system/ds-canonical/` 擁有。Claude 的 `CLAUDE.md`/`.claude/**`、Codex 的 `.agents/**`/`.codex/**` 與 plugin 內容都是 generated adapter，不可反向成為 authority。
2. **Generation SSOT**：`infra/governance/protected-root-classification.json` 封閉每個 leaf 的 owner/output/non-authority；`packages/governance/canonical/manifest.json` 封閉發布輸入；`scripts/governance-build-graph.json` 是唯一生成順序。未分類路徑、手改 adapter、絕對開發者 home path、symlink/hardlink 替換或未追蹤 canonical 輸入都 fail closed。
3. **Evidence SSOT**：每次 deep audit 先 freeze exact Git tree/inventory，deterministic、hook、model 與 CI 證據都綁同一個 immutable run。Model 不直接漫遊 repo；`model-evidence-broker.json` 產生有上限的 content-addressed shards，provider adapter 只傳輸 prompt/result，reducer 機械驗證 dimension×shard 與 component claim 的 exact-once closure。Wrapper 宣稱還必須引用與 lockfile version/integrity 綁定的 dependency source bytes；缺 source 只能是 unverifiable finding。
4. **Trusted execution SSOT**：`managed-ci-trusted-execution-plan.json` 分離 dependency acquisition、network-none deterministic/hook audit、provider-selected model broker 與 read-only GitHub observer。每類各自封閉 network、filesystem、rootless container、permissions、secret mode、workflow/image identity 與 issuer quorum；本機 receipt 永遠不會自動升級成 managed evidence。
5. **Release/rollout SSOT**：`staged-rollout-plan.json` 以單向 receipt chain 規定 candidate freeze → GitHub hard-gate bootstrap → protected PR → PR-head certification → merge → immutable release/BOM → template fleet → WM canary → full completion。`PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM` 在 rollout-completion 後可誠實標記 `RELEASED_VALIDATED_SOAK_DEFERRED`；72h soak 是綁 exact release identity、可後補且不阻擋 package/template/WM 可用性的 post-release observation。`MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM` 才把 elapsed soak 保留為 promotion hard gate。WM 是 product-consumer canary，用來回饋 DS/template/governance/package 的 root cause，不是另一個 SSOT。

`candidate-freeze` receipt 是鏈上的第一筆，external bootstrap 的 phase ordering 由同一份 active profile 決定。`PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM` 的 `bootstrapBoundary.bootstrapMustPreexistCandidateFreeze=false`：freeze 先固定 source、tree、inventory、manifest、generator、generated artifacts、BOM candidate 與 test target；`release` scope activation/carrier 再透過既有 reviewed transition 於 freeze 後、protected release PR 或任何 mutation 前 materialize，並綁定 exact frozen identity。尚未 materialize 會阻擋後續 PR/mutation，不會阻擋 ordinary candidate freeze。`MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM` 保留 `bootstrapMustPreexistCandidateFreeze=true`，所有適用 external activation 與獨立 `completion-attestor` quorum 必須先完成簽章/readback，且 `observedAt` 早於 freeze。prepare、signing-request 與 append 都重讀同一 canonical activation／issuer/profile SSOT；任一 profile 下 source 或 frozen identity 改變都使舊 activation/review receipt 失效。`--prepare-plan` 仍可在未啟用時安全列出適用 blocker，不會寫 evidence。

`externalLedgerBootstrapBoundary` 使用同一條序列化 protected PR carrier，不建立第二套 activation flow。Small-team profile 在 candidate freeze 後、protected release PR 前啟動這條 chain；maximum-assurance profile 則仍把它列為 candidate-freeze 前置。writer 程式只能來自 protected default branch，每次 run 只接受一份簽署、具有效期且綁定 exact frozen target/base 的 handoff，同時最多存在一個 external-ledger PR。`validUntil` 只授權 writer 在期限內 materialize exact branch／one-parent PR；exact immutable PR 一旦存在，後續 merge authority 來自 branch protection、獨立 review 與 ledger 內容本身的適用 profile 簽章，不來自已過期的 transport handoff。既有綠燈只證明當時對 exact head 的驗證結果，不是 merge-time TTL 證明，也不能把過期 handoff 重新變成 merge authority。Runtime certification 必須在同一個 one-parent commit 內先加入 content-addressed evidence，再更新 certification ledger；external activation 只能更新 activation ledger。Writer App 不能執行 candidate code、不能直寫或合併 default branch，也不能 review/approve。30 天 workflow artifact 與 PR receipt 只是可重建的 transient readback，不是長期權威；durable authority 是受保護 Git object、合併後 ledger 與外部 readback。

這個 repo 可完成生成、schema、poison tests、唯讀 plan 與驗證器，但不能自我簽發外部信任。當 active profile 必需的 `trust/issuers.json` signer、managed workflow/image identity、GitHub/npm/managed-host readback、model runtime certification 或 WM onboarding 尚未完成時，對應狀態必須保持 `blocked` / `not-certified`，不得用 prose、手寫 JSON 或本機測試冒充已啟用。只有 elapsed soak 尚未執行時，small-team profile 應保持已發布可用並標記 `RELEASED_VALIDATED_SOAK_DEFERRED`；maximum-assurance profile 的 promotion 仍 fail closed。

Managed CI 採 release-free 的兩個 PR 邊界。第一個 PR 只能把 workflow、schema、OIDC broker policy 與 control-plane lock 合併到 protected `main`，不能發布任何 candidate；外部啟用與 readback 完成後，第二個 candidate PR 才能以 closed `workflow_dispatch` inputs 傳入受稽核的 commit/tree/manifest/run identity。執行程式只能來自 digest-pinned、non-root 的 trusted image，candidate checkout 只是資料，且必須逐檔等於已簽署的 activation trust bundle，不能帶自己的 verifier 來替自己認證。

Activation trust bundle 不從驗證當下可被替換的 worktree 取權威 bytes：所有 manifest、lock、workflow、policy、schema、adapter 與支援檔都必須由同一個受保護 Git commit/tree 的 exact blob snapshot 解析，逐檔重算 path/mode/blob/content digest，再與簽署的 activation closure 比對；缺 object、tree 不符、dirty worktree 代換或驗證中漂移都 fail closed。獨立部署的 authority client 也把 canonical issuer registry 當作 content-addressed support file 安裝到固定 trust path，source/install path 與 source SHA-256 一起進 signer authority binding，不能只驗 client executable 而漏掉 public-key SSOT。

Receipt finalization 不是只檢查「看起來像簽名」的字串。Finalizer request 內嵌 exact issuer-registry snapshot；四個 class 的每個 finalized payload 都用 domain-separated Ed25519 bytes 驗證 signer audit event，並核對歷史 key validity/revocation、issuer mapping、raw bytes、run 與 authority binding。TLS/mTLS transport readback 另有獨立 domain-separated Ed25519 attestation，簽入 exact request、完整 finalized-receipt-set digest、兩段 transport observation、signer mapping 與時間；readback digest 也涵蓋實際 signature bytes。偽造固定長度 signature、替換 key/registry、重算未簽 digest、把舊 readback 搭配另一組 receipt set，或在驗證前替換 support file，都不能進入 materialization。

`providers/managed-ci-oidc-broker-policy.json` 將 GitHub OIDC 的 repository/owner immutable IDs、workflow ref/SHA、trusted-main commit/tree、run ID/attempt、candidate identity、audience、immutable subject、有效時間與一次性 `jti` ledger 綁成每個 execution class 的 canonical projection。Model API secret、GitHub 唯讀 observer token 與 evidence signer 分屬不同用途；class identity 由 broker request 與 receipt 綁定，不假設 GitHub token 存在不存在的 job claim。正式 model judgment 只能走 repo-unmounted、tools-omitted、exact-host egress 的 content-only provider API；Claude/Codex CLI 僅保留 runtime conformance 或 legacy diagnostic 身分，不能升格成 promotion evidence。

## Authority chain

1. `inventory/managed-repos.json`：受管 repo、角色、GitHub profile、release ring 與檔案 ownership type。
2. `desired/github.json`：rulesets、required checks、environments 與 repository-level GitHub Actions workflow permissions 的 desired state。
3. `external-activation-requirements.json`：repo 無法自行完成的 GitHub、npm、managed-host、異地證據耐久化與 rollback drill。每項都有用途 scope、`not-activated|activated`、read-back evidence、`observedAt`、`expiresAt`；未啟用時三個證據欄必須全為 `null`，不能用 prose 或假時間戳冒充完成。
4. `trust/issuers.json`：全 control plane 唯一 Ed25519 public-key registry；角色、有效期與撤銷狀態的 SSOT。`release-tag-authorization-policy.json` 只引用此 registry digest、允許的 `release-tag-authorizer` key IDs、quorum 與 TTL，不複製 public key。
5. `release-rings.json`：immutable candidate release/BOM、typed promotion predicates、ring/wave parallel budget、evidence 與 promotion receipts。
6. `providers/compatibility-matrix.json`：Codex／Claude Code 各 surface 的共同能力與 adapter 要求。
7. `providers/role-surface-policy.json`：authority、template mirror、product consumer 各自必備的 local／remote／Codex Cloud／Claude Code Cloud／GitHub Actions surface SSOT；inventory、release ring、registration 與 certification ledger 必須逐 tuple 相等。它也封閉 certification carrier policy：只有 authority 可在受測 subject 之後，以只改 content-addressed runtime evidence 與 certification ledger 的後續 commit 承載證據；template/product subject 必須與 canary protected head 完全相同。未有 target-bound readback 的 cloud tuple 必須保持 `not-certified`。
8. `providers/certifications.json`：實際 conformance 證據；未測試不等於 certified。
9. `waivers.json`：唯一例外通道；每筆必須有 owner、到期日、風險與補償控制。
10. `providers/managed-host-assurance.json`：將可攜式 repo baseline 與端點管理的獨佔保證分開，綁定 Claude Code／Codex 實際 winning managed state、immutable release 與等價 canonical hook delivery。
11. `protected-root-classification.json`：逐 leaf 封閉 canonical source、generated output、non-authority exclusion；tracked-but-absent 與 dangling symlink 也必須有唯一分類，symlink 只能由 graph 的 exact output 擁有。
12. `packages/governance/canonical/plugin-aliases.json`：marketplace plugin discovery alias 的唯一權威；transport provider／hook output 由 `providers.json` 的 `marketplacePluginTransport` 擁有，target 從 managed tree／skill view 推導。Provider active 時由獨立 graph stage 原子生成與唯讀驗證，retired 時同一 managed path 轉為 tombstone 並安全刪除舊 symlink，不在程式或 plugin manifest 複製第二份 target map。
13. `providers/harness-registry.json` 與 `providers/harness-source-inventory.json`：安裝、升級、回滾、process crash、provider lifecycle、cloud、product template、獨立 second opinion、mirror、release、fleet、evidence 與 fake-green 是 versioned taxonomy 的 13 個 ordered mandatory core；`x-` namespace extension 只能排在 core 之後、唯一且依 domain 導出 entry id，不能取代、重排或稀釋 core 語意。來源清冊遞迴封閉五個 test roots；canonical hook behavioral aggregate 的 suite、registration edges 與 unique active hooks 全由 source inventory 即時導出（不把 `_log-fire.sh` helper 當成 active hook），不得在說明文件另立手工總數；`.claude` 只作 digest-bound generated mirror、不重跑。`test_*.sh.broken` 也會被主動發現，只有綁定內容 digest、owner、substantive reason、expiry 與 remediation 的 reviewed debt 才能暫存；目前 reviewed-disabled debt 為 0；過期、未登錄、digest drift 或 active hook 無 behavioral test 都 fail closed。每個 domain 都綁定真實測試、authority path、可證明範圍與不可證明範圍；`npm run test:governance-harnesses` 只以登錄過的 fixed argv 按順序去重執行，使用整個 suite deadline、移除外部憑證、在正常退出與 timeout 都清除 process group，並保留每個 certification claim。`compatibility-matrix.json` 用 SHA-256 綁定登錄檔；local、remote、cloud 與 CI 都解析同一個 role-resolved hard-gate family：DS authority 執行完整 registered governance Harnesses，template mirror 與 product consumer 執行與 exact package/fork lock 綁定的 consumer checker。cloud/live external 狀態沒有 target-bound readback 時只能是 `not-certified` 或 `external-readback-required`。Gate mutation coverage 總數從 discovery 即時重算，必須 **discovered checker 數 = paired owner 數、zero debt**，不再人工硬編總數；其中 browser、registry、model、CI 與 managed-host 的封閉 fixture 只證明 gate 會抓到注入違規，真實 target certification 仍必須由各自 E2E／外部 readback owner 提供。升級與 process-crash harness 只宣稱會重驗 pathname-visible 並行修改；不宣稱阻止仍持有舊 open file descriptor 的非合作 writer，也不宣稱 physical power-loss durability。
14. `.github/workflows/external-ledger-writer.yml`、`infra/governance/{lib,bin}/external-ledger-writer.mjs` 與四份 writer schema：protected-default external-ledger PR bridge 的 executable closure。它只把已簽署且具期限的 exact handoff 轉成 deterministic one-parent branch／PR，並由 `governance-anchor.yml` 在 protected-base 上做互斥 routing 與重驗；writer receipt 與 Actions artifact 只是 transient readback，不能取代合併後 ledger、受保護 Git object 或外部啟用證據。

`baseline/2026-07-20.github.json` 是首次盤點快照，不是 desired state，也不應由 reconcile 覆蓋。

## Safe commands

```sh
# GitHub plan；預設只做 GET，不寫遠端
node infra/governance/bin/reconcile-github.mjs
node infra/governance/bin/reconcile-github.mjs --repo design-system --json

# 只有明示 --apply 才可能寫；且只寫當前 ring/wave 內有有效 receipt 的 repo
node infra/governance/bin/reconcile-github.mjs --apply \
  --journal infra/governance/runtime/reconcile-journal.json

# 中斷或 partial failure 後只做 exact readback，不做 mutation、不宣稱 rollback
node infra/governance/bin/reconcile-github.mjs \
  --recover-journal infra/governance/runtime/reconcile-journal.json

# 只有提供「目前」active-profile-bound recovery 授權，才執行 journal 內
# digest-bound compensating plan；每一步都先確認遠端仍是本 transaction
# 的 applied state，再 exact readback before-image
node infra/governance/bin/reconcile-github.mjs \
  --rollback-journal infra/governance/runtime/reconcile-journal.json \
  --rollback-authorization /path/to/fleet-recovery-authorization.json

# Consumer inventory and per-repository read-only commands
node infra/governance/bin/consumerctl.mjs inventory
node infra/governance/bin/consumerctl.mjs doctor --repo-id work-management
node infra/governance/bin/consumerctl.mjs plan-upgrade \
  --repo-id work-management --root ../work-management \
  --base /path/to/previous-scaffold --incoming /path/to/new-scaffold

# Legacy consumer bootstrap is a reviewed six-stage source path. The source-aware
# stages all require repo/root/base/incoming/release-bom/required-checks-digest.
# Materialization may write only a brand-new output tree; no command applies to a
# live consumer, inventory, GitHub, npm, or WM.
npm run governance:bootstrap:plan -- --repo-id <repo> --root <current> \
  --base <trusted-base> --incoming <candidate-snapshot> \
  --release-bom <candidate-bom> --required-checks-digest <sha256> --json
npm run governance:bootstrap:materialize-reviewed -- \
  --repo-id <repo> --root <current> --base <trusted-base> \
  --incoming <candidate-snapshot> --release-bom <candidate-bom> \
  --required-checks-digest <sha256> \
  --plan-file <reviewed-plan> --expected-plan-digest <sha256> --output <new-path>
npm run governance:bootstrap:check-materialization -- \
  --plan-file <reviewed-plan> --expected-plan-digest <sha256> \
  --materialized-root <new-path> --json
npm run governance:bootstrap:check-readback -- \
  --repo-id <repo> --root <current> --base <trusted-base> \
  --incoming <candidate-snapshot> --release-bom <candidate-bom> \
  --required-checks-digest <sha256> \
  --plan-file <reviewed-plan> --expected-plan-digest <sha256> \
  --materialized-root <new-path> --readback <signed-readback> --json
npm run governance:bootstrap:plan-promotion -- \
  --repo-id <repo> --root <current> --base <trusted-base> \
  --incoming <candidate-snapshot> --release-bom <candidate-bom> \
  --required-checks-digest <sha256> \
  --plan-file <reviewed-plan> --expected-plan-digest <sha256> \
  --materialized-root <new-path> --readback <signed-readback> --json
npm run governance:bootstrap:check-promotion -- \
  --repo-id <repo> --root <current> --base <trusted-base> \
  --incoming <candidate-snapshot> --release-bom <candidate-bom> \
  --required-checks-digest <sha256> \
  --plan-file <reviewed-plan> --expected-plan-digest <sha256> \
  --materialized-root <new-path> --readback <signed-readback> \
  --proposal <reviewed-promotion-proposal> --json

# New template consumer onboarding is a closed, content-addressed proposal.
# Review and apply both after-images together in one protected DS PR; this command
# does not create a repository, edit inventory, clear the blocker, or dispatch.
npm run governance:consumer:plan-registration -- \
  --repo-id <repo> --github ajenchen/<repo> --visibility private \
  --default-branch main --local-path ../../../<repo> \
  --ring ring-2-product-canary --wave canary \
  --entered-at <canonical-UTC> --json > /tmp/consumer-registration.json
npm run governance:consumer:check-registration -- \
  --proposal /tmp/consumer-registration.json

# After immutable candidate, full model validation, current-wave signed apply
# authorizations, soak, checks and blockers are valid: plan, independently review,
# re-check against current SSOT, then dispatch only inventory-derived repositories.
# A programmatic plan without the current runtime/profile/Harness plus repository
# commit/tree identity snapshot is typed blocked, ready=false, and has no dispatches.
npm run governance:fleet:plan -- \
  --to <exact-version> --json > /tmp/consumer-fanout.json
# This command is read-only. It emits the exact canonical signing payload; private
# keys never enter the repository, this CLI, or a model environment. Independent
# completion-attestors sign it externally. The assembly command accepts only their
# public signature records; it never receives or handles a private key.
npm run governance:fleet:prepare-review -- \
  --plan-file /tmp/consumer-fanout.json \
  --expected-plan-digest <reviewed-plan-sha256> \
  --decision approved --issued-at <canonical-UTC> --expires-at <canonical-UTC> \
  --json > /tmp/consumer-fanout-review-request.json
npm run governance:fleet:assemble-review -- \
  --plan-file /tmp/consumer-fanout.json \
  --signing-request /tmp/consumer-fanout-review-request.json \
  --signatures /path/to/external-signature-records.json \
  --json > /tmp/consumer-fanout-review-receipt.json
npm run governance:fleet:check -- \
  --plan-file /tmp/consumer-fanout.json \
  --review-receipt /tmp/consumer-fanout-review-receipt.json \
  --json > /tmp/consumer-fanout-check.json
# The live check output is a digest-bound read-only check receipt with checkedAt
# and both reviewed/observed runtime identity digests. It is never the old plan
# replayed, does not authorize dispatch, and does not claim rollout completion.
npm run governance:fleet:apply-reviewed -- \
  --plan-file /tmp/consumer-fanout.json \
  --expected-plan-digest <reviewed-plan-sha256> \
  --review-receipt /tmp/consumer-fanout-review-receipt.json \
  --evidence infra/governance/runtime/consumer-fleet/<unique-receipt>.json

# Dependency-free tests
node --test infra/governance/test/*.test.mjs

# Provider-neutral evidence plans/checks: all commands below are read-only.
# They do not call a model, open network access, write evidence, or mutate Git/GitHub/npm/WM.
npm run audit:deterministic-plan
npm run audit:hook-evidence-plan
npm run audit:ci-evidence-plan
npm run audit:model-evidence-plan
npm run audit:managed-ci-plan
npm run audit:staged-rollout-plan
npm run audit:provider-neutral-residue

# Focused poison/adversarial coverage for deterministic, hook transport, CI,
# brokered model evidence, managed execution, staged rollout, and SSOT portability.
npm run test:governance-evidence-control-plane

# 全 provider-neutral graph：release fields → provider views → plugin aliases →
# product template → metadata → control-plane snapshot
npm run governance:generate
npm run governance:check

# 受 review 的 workflow identity 必須與當前 workflow bytes 完全一致。
# check 唯讀；沒有 --write，也不會暗中接受新 workflow。
npm run governance:workflow-identities:check

# 產生封閉、deterministic 的 review proposal。省略 --output 時只寫 stdout；
# 檔案輸出僅允許在 gitignored infra/governance/runtime 內。
npm run governance:workflow-identities:propose -- \
  --output infra/governance/runtime/workflow-identity-proposal.json

# review 完整 proposal bytes 後，必須明示回填其 proposalDigest才能做
# desired-before CAS + 全 workflow 終次重讀 + 同目錄 atomic rename。
npm run governance:workflow-identities:apply-reviewed -- \
  --proposal infra/governance/runtime/workflow-identity-proposal.json \
  --expected-proposal-digest <reviewed-sha256>

# Provider runtime conformance
# The discovery check is read-only; --allow-model records explicit bounded
# execution intent for one isolated apply_patch/Bash lifecycle probe under the
# canonical Standing Authorization. No real-repo file is modified.
node infra/governance/bin/conform-provider-runtime.mjs \
  --provider codex --allow-model

# Claude instruction/authority-routing/context:fork/native-hook probes invoke a
# bounded local Claude Code model session, so the run must carry explicit bounded
# execution intent. decision-authority-routing is a required certification check.
node infra/governance/bin/conform-provider-runtime.mjs \
  --provider claude --allow-model

# A single-provider run is signed as scope=provider. Only --provider all emits
# scope=local-fleet, and that artifact must exactly cover every local-probe
# provider. It deliberately excludes every external-attested cloud, remote,
# desktop and GitHub Actions surface.
node infra/governance/bin/conform-provider-runtime.mjs \
  --provider all --allow-model

# Managed-host 唯讀盤點；不改主機設定、不配送 bundle、不自動認證。
node infra/governance/bin/verify-managed-host-assurance.mjs

# 需要把 staging evidence 寫入 gitignored runtime 目錄時才明示指定；
# --require-aligned 對任一 unknown/fail 回傳 non-zero。
node infra/governance/bin/verify-managed-host-assurance.mjs \
  --write-evidence --require-aligned

# Promotion is deliberately unavailable until a trusted Ed25519 public key is
# registered in trust/issuers.json, referenced by the profile, and an external
# issuer signs this exact run.
node infra/governance/bin/promote-runtime-evidence.mjs \
  --accept-clean-current-tree \
  --scope provider \
  --attestation /path/to/detached-runtime-attestation.json
```

`audit:*check` 版本同樣唯讀，但比 `*plan` 更嚴格：CI/model check 需要目前 immutable active run，managed-CI check 需要外部 workflow/image/issuer activation，staged-rollout check 需要 canonical ledger。缺少任一真實證據時 non-zero 或明確 `blocked` 才是正確結果；不得把 plan 輸出當成 certification、promotion 或 rollout receipt。

`apply-reviewed` 只是本機 candidate preparation，proposal 會固定標示
`authorizationStatus: not-performed`；它不是 privileged authorization。必須將 workflow 與
updated desired state 放在同一個 candidate commit/PR，再由 `verify-privileged-change`
對完整 protected changed-path closure 做 Ed25519 驗證。在 issuer registry 尚未啟用時，
不得將本機 proposal acknowledgement 宣稱為授權。

Runtime conformance is intentionally separate from certification. The data-driven profile lives at `providers/runtime-conformance.json`; each run creates a fresh temporary Git fixture and rewrites redacted staging evidence at `runtime/provider-runtime-conformance.json` (gitignored). Every artifact carries the signed `scope`: one selected local runtime is `provider`, while `all` is `local-fleet`. A `local-fleet` artifact is accepted only when its provider set exactly equals the profile's `executionMode=local-probe` set; it never includes or proves any `external-attested` cloud, remote-control, desktop, or GitHub Actions surface. Those surfaces require their own repository- and target-bound signed external evidence. Promotion requires the operator to repeat the expected scope, includes that scope in the immutable artifact result and certification binding, and rejects a provider artifact presented as local-fleet evidence. The required Claude `decision-authority-routing` check loads the exact marked decision-authority block from root `AGENTS.md` into the isolated fixture, disables tools and session persistence, and accepts only a closed structured response proving `AUTO` for engineering/Git/PR/CI/release execution, `ASK` for a genuinely unresolved product/UI/UX SSOT tradeoff, and `HUMAN_ONLY` for login/MFA/OAuth account-holder actions. The Claude context-fork probe copies the byte-exact generated `.claude/skills/canonical-reviewer/SKILL.md`, byte-exact generated `.claude/agents/canonical-reviewer.md`, and their canonical workflow/reference inputs into that fixture; it first rejects any repository/generated-byte drift, then requires the real reviewer to return `REVIEW-BLOCKED` plus its adapter evidence from an incomplete request. It does not substitute a test-only ideal skill or agent. The non-model checks execute `scripts/run-provider-hook.mjs` against real canonical hooks and require four provider-native semantics for both Claude and Codex: silent pass, blocking exit/stderr, translated context, and translated neutral Stop decision. Evidence binds a unique UUIDv4, canonical generation/expiry timestamps, hashed host identity, platform/architecture, observed CLI version, exact resolved executable path/content digests, current Git HEAD/tree, current provider-neutral contract digest, profile digest, the one shared harness digest, exact safe command shape, and semantic assertions. The harness digest closes over the runner bootstrap, provider and hook registries plus schemas, dependency-free generated validator, the reviewer generator/registry/skill/agent bytes, generated adapter executables, and every canonical hook/helper the profile executes; changing or omitting any member changes the digest. Certification additionally requires the evidence check id/driver set to equal the active profile exactly. It never copies raw provider output or environment values, never edits `providers/certifications.json`, and never contacts GitHub/npm mutation APIs. Deterministic mock-runner tests exercise the same driver and fail-closed assertions without making a model or network call; their evidence remains explicitly non-production and cannot be promoted or certified.

Local provider execution is accepted only through the repository’s content-v2 provider-CLI authority: the canonical manifest, exact lock, active package-tree digests, generated shim bytes, and selected target bytes are reverified before any provider process can start. Shim, target, package entries, and every replaceable ancestor must be owned by the current uid or root and must not be group/other writable; Google Drive’s deny-only ACL marker is not treated as a write grant. The runtime never resolves `claude` or `codex` from ambient `PATH`. The production runner crosses a fixed `env -i` boundary and passes only its closed environment allowlist. Version and other non-account probes receive a mode-`0700` fixture `HOME` and no `USER`. The native-local Claude exception is one non-serializable capability derived only through the default host identity plus actual environment detector and the operating-system account record; it is restricted to the exact repository shim’s read-only auth-status and Standing-Authorization-bound bounded model-probe routes. Timeouts, output overflow, missing versions, capability substitution, custom-host substitution, and incomplete checks remain explicit failing evidence.

For the Codex model probe carrying explicit bounded execution intent only, a bounded, private, regular, non-symlink, stable JSON `auth.json` is copied byte-for-byte with mode `0600` into the fixture's mode-`0700` isolated `CODEX_HOME`; an absent, aliased, concurrently changed, over-permissive, oversized, or malformed source makes the model check fail without starting the model. The entire fixture is deleted immediately after the probe. Native-local Claude account access is fail-closed: `uid`, home, and `USER` come from the operating-system account record; ambient `HOME`/`USER` must agree; the home must remain a current-uid-owned real directory with no symlink alias or group/other write permission. Cloud-development runs do not receive `USER`, while remote, cloud, desktop, and CI surfaces remain external-attested and cannot invoke this local route; remote and CI markers take precedence over WSL/devcontainer markers. Evidence records only environment names, never those values, and the entitlement driver is bound to the exact `auth status --json` argv with fixture cwd. `allowModel` is a closed boolean intent gate and only exact `true` can start a model or copy Codex authentication; it is not a second human engineering-approval gate. A local-fleet run that uses both the Claude account capability and Codex’s temporary auth copy records the single closed combined handling mode rather than hiding either path. A model probe additionally requires the explicit model-execution flag and a successful first-party Claude Max entitlement readback; the conformance command never performs login. Injected runners, certification/identity/clock/Harness resolvers, and invocation observers are non-production test seams and are rejected whenever evidence writing is enabled. Even when a non-writing test returns evidence in memory, its credential, environment, or executable-authority safety field is explicitly marked `nonproduction-test-seam-*`; both promotion and certification validation reject the unchanged mocked artifact after signature and freshness verification. A trusted issuer remains responsible for truthfully attesting any replacement production-safety claims it signs.

Runtime profile v2 and evidence v4 additionally bind one closed certification target per provider: execution OS, Node platform, architecture, execution environment, exact distribution version, and repository `pathClass` (`no-space` or `contains-space`). A certification record must repeat those axes and the target digest exactly; evidence from another OS, platform, path class, distribution version, WSL/native boundary, or devcontainer/native boundary cannot be reused. Native Windows (`windows`/`win32`/`native`) is deliberately unsupported and has no runtime-profile target. WSL2 and devcontainer runs are Linux execution environments (`linux`/`linux`) and must never be labelled as native Windows. The committed certification ledger remains `not-certified`; its platform matrix records the precise untested or unsupported target and limitation without claiming external evidence that has not been obtained.

Certification does not require a commit to certify itself. `inventory/managed-repos.json` selects exactly one explicit canary per represented role (`design-system`, `ds-product-template`, and WM for `product-consumer`), so adding a second product repository cannot silently change the pilot. Evidence and its ledger binding repeat the immutable subject commit/tree, profile digest, Harness digest, and hard-gate contract digest. A later clean clone validates a closed repository identity context: protected-head carrier commit/tree plus a subject-object readback and a subject-to-carrier ancestry/readback digest. The authority-only descendant case also carries the complete sorted changed-path set and accepts only the carrier paths enumerated by the role policy; cross-repository replay, stale/non-ancestor subjects, missing object/ancestry proof, truncated GitHub compare output, or any other changed path fail closed. Exact self proofs terminate directly and never require a recursively self-certifying ledger. Live GitHub, signed cloud observation, and offline CI reconstruction must feed the same context shape; an offline row is not authority unless its signature/trust validation has already established the repository, protected ref, carrier object, subject object, ancestry, and complete changed-path readback.

Passing checks alone cannot authorize certification or release. `trust/issuers.json` is the only public-key SSOT for privileged changes, rollout receipts, runtime evidence, fleet recovery, and release-tag authorization. The policies contain only its digest, allowed key IDs, quorum, TTL, and the content-addressed active assurance-profile binding; they never duplicate public keys or quorum maps. The committed registry and allowed-key lists are empty, so every local run remains `attestation.status=pending`, promotion fails closed, and `stage-protected-release` cannot pass preflight. One atomic OWNER-bootstrap PR assigns least-privilege roles, updates all policy references to the same registry digest, and permanently closes bootstrap. Under `PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM`, exactly one honestly governed key carries `privileged-change-authorizer` plus `root-rotator`; a dedicated release-tag-only key is a functional role boundary, not a claim of another custodian. Under `MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM`, the active profile requires a 2..5 distinct-subject root quorum and its external custody evidence. Private keys stay outside the repository and model environments. Every authorization/attestation signs `issuerRegistryDigest`; registry changes invalidate older evidence as mutation authority. Historical journal evidence remains usable only for read-only recovery observation after its issuer is rotated or revoked, and only when the current append-only registry still proves the issuer's immutable lineage. Verification rejects unknown roles, future/expired/revoked keys, insufficient profile-bound quorum, digest drift, or an evidence lifetime extending beyond key validity.

### External evidence operator path

`npm run governance:external -- <command>` 是 cloud、remote-control、desktop、GitHub Actions 與其他 repo 外部狀態的 provider-neutral 交接入口。它不持有 private key，也不呼叫 GitHub、npm、MDM 或 provider mutation API。

1. 外部 runtime issuer 先產生 canonical、Ed25519 簽署、repository/role/target/run/distribution/Harness-bound 的 surface receipt。`verify-surface` 只驗證；`import-surface` 驗證後只會以 receipt exact bytes 的 SHA-256 寫入 `infra/governance/evidence/external-runtime/<sha256>.json`，同內容重試 idempotent，既有不同 bytes、link、非 canonical JSON 或失效簽章全部 fail closed。
2. `propose-certification` 會從該 CAS artifact 建立 closed review proposal，重新比對目前 compatibility matrix、runtime profile、Harness identity、issuer registry、inventory canary、desired GitHub policy 與 certification target；不會直接改 ledger。`check-certification` 必須帶 exact proposal digest。`handoff-reviewed-certification` 只會在 `infra/governance/runtime/` 產生 self-contained canonical after-image handoff，綁定 exact proposal digest、目前 Git commit/tree、該 protected-base 內 ledger before-image digest、唯一 changed path 與至少 60 秒剩餘有效期。Handoff 明示 `canonicalLedgerMutationPerformed:false`、`directCanonicalWriteAllowed:false`；後續只能由 protected Git writer 重新驗證 live protected base，以 expected-old ref CAS 建立受保護 PR。
3. External activation 先以 `prepare-activation` 將一筆 immutable policy requirement、observed resource、TTL、所有 canonical model digest 與 completion-attestor quorum 封成 signing request。外部 signer 對 request 內 exact payload 簽名，回傳 closed `external-activation-signature-bundle`；`assemble-activation` 驗證 role、key、subject、registry、quorum、signature、resource contract 與完整 prospective ledger 後才產生 proposal。
4. `check-activation` 需要原 signing request、proposal 與 exact reviewed digest。`handoff-reviewed-activation` 套用同一個 protected Git expected-base handoff 邊界，並將原 signing request、完整 reviewed proposal、簽章驗證後的 ledger after-image 一起封入 closed artifact；它不改 `external-activation-requirements.json`，也不執行 proposal 所描述的外部操作。舊 `apply-reviewed-certification`／`apply-reviewed-activation` API 與 CLI 永久回傳 `EXTERNAL_DIRECT_CANONICAL_LEDGER_APPLY_DEPRECATED`，即使參數完整也不得寫 canonical ledger。Signer 或 registry 未啟用、evidence 過期或即將在 60 秒內到期、baseline 漂移、Git base/ledger 不符、重播、額外欄位、錯誤 target、錯誤簽章或 managed-CI 尚未真正 activated 時，CLI 以 `--json` 回傳 typed blocker，絕不把缺證據變成通過。

Runtime output 會先逐層拒絕 symlink／非目錄 ancestor，再以 `realpath` 驗證實體 parent 仍位於 canonical runtime boundary；輸出採 no-clobber、single-link regular file、fsync 與 exact readback。文字路徑看似位於 runtime、但實體 ancestor 逃逸的輸出不會建立。Handoff 寫入前會使用新的 wall-clock 與重新解析的 Git HEAD/tree/base-ledger 再驗證一次；入口時刻的舊結果不能跨越 expiry 成為有效 handoff。

最短流程如下；所有輸出 proposal/signing request 必須放在 `infra/governance/runtime/`，signature bundle 可從獨立 signer 安全搬入：

```bash
npm run governance:external -- import-surface --receipt /secure/inbox/surface.json
npm run governance:external -- propose-certification \
  --reference infra/governance/evidence/external-runtime/<sha256>.json \
  --artifact-sha256 <sha256> --certified-at <UTC> --expires-at <UTC> \
  --output infra/governance/runtime/external-certification-proposal.json
npm run governance:external -- check-certification \
  --proposal infra/governance/runtime/external-certification-proposal.json \
  --expected-proposal-digest <reviewed-sha256>
npm run governance:external:certification-handoff -- \
  --proposal infra/governance/runtime/external-certification-proposal.json \
  --expected-proposal-digest <reviewed-sha256> \
  --expected-base-commit <exact-current-protected-base-commit> \
  --output infra/governance/runtime/external-certification-handoff.json

npm run governance:external -- prepare-activation \
  --requirement-id <policy-requirement-id> \
  --observed-resource /secure/inbox/readback.json \
  --observed-at <UTC> --expires-at <UTC> \
  --output infra/governance/runtime/external-activation-signing-request.json
npm run governance:external -- assemble-activation \
  --signing-request infra/governance/runtime/external-activation-signing-request.json \
  --signatures /secure/inbox/external-activation-signatures.json \
  --output infra/governance/runtime/external-activation-proposal.json
npm run governance:external:activation-handoff -- \
  --signing-request infra/governance/runtime/external-activation-signing-request.json \
  --proposal infra/governance/runtime/external-activation-proposal.json \
  --expected-proposal-digest <reviewed-sha256> \
  --expected-base-commit <exact-current-protected-base-commit> \
  --output infra/governance/runtime/external-activation-handoff.json
```

Reviewed handoff 不會由 local operator 直接寫 canonical ledger。先在無 network／無 Git mutation 的本機步驟封裝 exact `repository_dispatch` payload：

```bash
npm run governance:external:ledger:package-dispatch -- \
  --handoff infra/governance/runtime/external-certification-handoff.json \
  --output infra/governance/runtime/external-ledger-dispatch.json
```

外部授權的 dispatcher 只能原樣送出該 closed payload。Protected-default workflow 會在取得 credential 前重新驗證 dispatch、簽章、expiry、base commit/tree、ledger before-image、same-run artifact ID/digest 與 deterministic plan；之後才可於 `governance-external-ledger` environment mint selected-repository Governance Writer App token，建立或完全重用 exact one-parent branch/PR。它拒絕 built-in `GITHUB_TOKEN`、PAT、ambient `gh` credential、另一個 run/artifact、任意既存 branch/PR、額外 changed path、過期 handoff 與中途 clock/base drift。

External-ledger PR 在合併前仍必須由 protected-base `Governance anchor` 重建 exact handoff transaction。Reserved writer branch prefix 永遠走 writer verifier；prefix 不符才走一般 privileged-change authorization，因此錯誤 bot/type/repository 的 writer-shaped PR 會 hard fail，不會 fallback。此 workflow 不提供 merge、approval 或 bypass；每一筆 PR 必須先合併並獨立 read back，下一筆 handoff 才能開始。尚未填入正整數 App IDs、environment secrets、signed activation 與 required-check readback 時，正確狀態仍是 blocked。

`npm run governance:activation-readiness -- --json` 是只讀 completion gate。它分別回報 `localReady` 與 `externalActivationRequired`，並對 build-graph drift、untracked canonical inputs、`candidateRelease=null`、required surface 未認證、外部啟用缺簽章/過期、rollout 簽章缺漏、live GitHub plan conflict/action 任一項 fail closed。`--offline` 不會把未觀測的遠端狀態當 pass；它會明確留下 external blocker。只有所有本機與外部 checks 都通過才回傳 `ready=true`/exit 0。

## Managed-host assurance boundary

`AGENTS.md`、`CLAUDE.md`、repo skills/hooks 與 CI 是每個 provider 都能攜帶的 functional baseline，但它們不是 endpoint security boundary。只有受管理主機的 winning effective state，加上不可變 release 所綁定的等價 hook delivery，才可以對應 `managed-host-exclusive`。未知等於未啟用，不是 pass。

- Claude Code 的 **authority-only／DS-author endpoint** 模板同時鎖定 `requiredMinimumVersion`、`allowManagedHooksOnly`、`strictPluginOnlyCustomization`、受管理強制啟用的 `design-system@qijenchen-ds`、exact commit marketplace、sideload/MCP/permission/bypass 與 remote-refresh 失敗中止；readback 還必須證明該 endpoint 不混用 product role。`template-mirror` 與 `product-consumer` 明確選擇無 marketplace plugin transport，改由 authenticated package snapshot、role-bound native adapters 與 protected hard gate 取得完整治理。因 server、policy helper、MDM 與 file tier 可能有不同 winning source，單獨看到本機 JSON 絕不認定已生效。
- Codex 模板鎖定 `allow_managed_hooks_only`、`[features].hooks=true`、permission/approval allowlists、空 MCP/plugin-MCP，並將 marketplace 的新增／安裝／更新限制在 exact release ref。官方明確說明 marketplace 規則**不會**在 runtime 過濾既存設定，因此既存 plugin、plugin skill discovery 與模型是否遵從文字都不是 managed-host security boundary。可驗證邊界是 managed-only hooks、經 deterministic CI replay 的 hard gates、permission/MCP admission 和外部配送證據。`requirements.toml` 不會配送 hook scripts，所以 `managed-host/codex-hook-bundle-contract.json` 強制 endpoint management 安裝 absolute、逐檔 SHA-256 列舉、release SRI/source-commit 綁定的 bundle；缺 bundle 或 `configRequirements/read` 有效狀態任一者即不對齊。
- `managed-host-effective-readback.schema.json` 是端點管理或 provider effective API 的封閉輸入契約；本 repo 的 verifier 只比對、不佈署。即使兩方都對齊，未經獨立簽署 activation/certification 也只是 `aligned-unattested` 與 `not-certified`。
- 新 provider 不會猜測沿用 Claude 或 Codex adapter。Compatibility registry 若出現尚未在本模型建立或明示排除的 provider，模型驗證直接失敗，必須先新增 schema、adapter、delivery contract、fixtures 與 certification。

能力邊界來自 [Claude Code settings](https://code.claude.com/docs/en/settings)、[Claude managed MCP](https://code.claude.com/docs/en/managed-mcp)、[Claude server-managed settings](https://code.claude.com/docs/en/server-managed-settings) 與 [Codex managed configuration](https://learn.chatgpt.com/docs/enterprise/managed-configuration)。官方能力若改變，先更新 compatibility/release SSOT 與本契約，不可以在 endpoint 模板自行補猜。

## Safety invariants

- `reconcile-github.mjs` 以封閉環境中的目前 Node runtime 啟動原生 `fetch` transport 呼叫固定的
  `https://api.github.com/repos/*` REST 邊界；只擷取單一 `GH_TOKEN` / `GITHUB_TOKEN` authority，
  拒絕 URL normalization 逸出與 redirect，不依賴 `gh`、PATH、Keychain 或其他 ambient secrets，
  也不把 credential 寫入輸出。
- 所有 repo 的 GET/preflight 必須先成功才會進入 apply；任何 HTTP/API/JSON 錯誤立即停止。
- reconciler 只建立或更新本 control plane 命名的 rulesets/environments，不刪除未知遠端資源。
- reconciler 還會先從 `GET /repos/{owner}/{repo}/actions/permissions/workflow` 讀回兩個封閉欄位，將漂移規劃為唯一的 `PUT` 動作，並把 exact before-image 作為可回滾 compensation。`default_workflow_permissions` 在所有 profile 固定為 `read`；不完整、未知或無法讀回的值均 fail closed。
- GitHub 的 repository setting 將 built-in `GITHUB_TOKEN` 的「建立 PR」與「核准 PR」綁在同一開關，雖然 REST 欄位名為 `can_approve_pull_request_reviews`。Authority 仍需要 protected `main` 上的 digest-pinned Changesets action 建立 version PR，故該 profile 為 `true`；published-template/product-consumer 改由 environment-gated Governance Writer App 建立 PR，故必須為 `false`，且 default `GITHUB_TOKEN` 仍為 read-only。workflow security audit 硬性禁止 upgrade writer 回退使用 `github.token`/`GITHUB_TOKEN`、PAT、`gh pr review|merge`、review API 或 Actions run approval API，並要求 deterministic branch、Writer App PR author 與 exact base/head/tree/parent readback。GitHub 的 [REST endpoint](https://docs.github.com/en/rest/actions/permissions#get-default-workflow-permissions-for-a-repository) 與 [repository setting 說明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests) 是此語意的上游來源。
- promotion eligibility 由有型別的 predicates 機械計算；未知 predicate 不能執行。`candidateRelease=null`、BOM/source commit/source tree/npm SRI 不完整、check 非 success、certification/upstream/waiver/plan 任一適用 gate 未過都 fail closed。Elapsed soak 只在 maximum-assurance profile 是 promotion hard gate；small-team profile 仍須綁定 exact release observation target，但可將長時間觀測後補並維持 `RELEASED_VALIDATED_SOAK_DEFERRED`。
- candidate plan 在任何 apply authorization materialize 前，必須即時重讀 exact immutable GitHub Release、唯一 `release-bom.json` asset bytes/digest/size、peeled tag commit/tree 與三包 npm SHA-512 SRI。結果產生 `verifiedReleaseEvidenceDigest`；舊驗證、跨 repo/version 重播或 candidate 任一欄改變都無效。
- Release BOM v5 另外綁定 immutable `product-template-scaffold.lock.json` asset 的 exact bytes。該 lock 封閉 provider/fork generation 後的每個靜態 published path/mode/size/SHA-256，並且只允許 npm 11.18.0 在發布後生成 `package-lock.json`；mirror evidence receipt v4 再綁定 release commit/tree、BOM bytes、scaffold-lock bytes、`mirror-activation-boundary-proof.json` 的 exact bytes/SHA-256 與包含 lockfile 的最終 full-tree digest。Mirror 只能由成功的 protected-default finalizer run/attempt 交接；handoff 必須唯一解析同一次 artifact ID/digest、immutable release/BOM、GitHub-verified signed annotated tag、trust evidence 與 finalization receipt。無寫入憑證的 certify job 先從 exact immutable release source 重建簽章啟用證明，並在解壓前、safe extraction 後重驗；fresh writer 重新 checkout 同一 release，在使用 artifact 前要求重建證明的 digest 與 bytes 都完全相同。它在 rsync 到 target 後、force-stage 全部（包括命中 `.gitignore` 的未來 provider surface）並從 Git index tree 重建後再完整重驗；每次 evidence verifier 都必須帶入同一 proof digest。只有在 package 版本一致／無降版、target worktree 與 index readback 皆通過後，才能在 Writer App token 前緊鄰執行 source 與 target 兩個 mutation-boundary check。這個低權限 runtime 可直接讀回 repo/default branch、public ruleset projection、required-check App identity 與 source environment；normalized/tag/check 語意透過 live public projection 與簽章 projection 共同綁定。管理權限才可見的 bypass actors、Actions defaults、App installation/secret placement 與 operational token probe 只能來自新鮮、獨立簽章的 external-activation evidence；runtime 不得宣稱自己直接觀測到這些 hidden state。寫入端只可建立或重用一個 deterministic same-repository PR，且必須逐項讀回 exact base/head names/OIDs、repo/owner 與遠端 branch/main。靜態 scaffold、模式、lockfile、evidence、index、PR identity 或 readback 的任一替換都 fail closed。Mirror 的 provider copy/evidence allowlist 不列 Claude/Codex：它必須從 `governance.lock` 已綁定的 fork manifest `consumer.commonInstruction` 與每個 generated provider `managedSurfaces` 推導，所以新 provider 的 instruction/hook/skill/product tree 在登錄後會同步進入 mirror 與 scaffold evidence，未登錄 sibling 仍 fail closed。Provider `trees[].artifactRoot` 的 locked inventory 還必須與 template/mirror destination 的 path、mode 與 SHA-256 完全相同；`nativeHookCoverage` 是綁定的 capability metadata，不會被誤當成另一個檔案 destination。
- `promotedAt` 不是狀態來源。每個 signed apply authorization/readback completion attestation 必須同時綁 repo/ring/wave、immutable candidate release、`verifiedReleaseEvidenceDigest`、當次 candidate plan digest、predicate/state/actions digest、`issuerRegistryDigest`、issuer/time 與自身 digest；手填時間、舊 registry/release evidence/plan attestation 或竄改 attestation 都不授權。
- ring 依 `waves[].order` 前進；只有第一個未完成 wave 可被選取。ring 與 wave 的 `maxParallel` 取較小值，超額 receipt 不會被截斷猜測，而是整波封鎖。
- plan 仍展示全 fleet 的 `candidateActions`，但可執行 `actions` 只會 materialize 當前 wave 內 signed-authorization-approved 的 repos；`applyPlan` 再驗證其他 repo 沒有夾帶 action。
- 每個 assignment 的 `candidateReleaseDigest` 與 `enteredAt` 必須綁同一個已觀測 release；換版未重設 digest/observation target 會在 plan 前失敗，舊版已完成或 deferred 的 24/72 小時 observation 都不能繼承到新版本。
- GitHub hard gate 依 repository role 封閉選擇：authority profile 使用 GitHub Actions `15368` 產生的 exact native PR check；template-mirror/product-consumer 才使用 protected-base `Immutable consumer snapshot` Check App verdict。後兩種 profile 若 `governanceCheckApp.id=null`、App check history 不存在或 `governance-check-verdict` credential environment 未對齊會 fail closed；authority 不得因此重新引入已拆除的 App verdict layer。任何需要寫入的 route 若 `governanceWriterApp.id=null`、Writer App installation/secret placement 未對齊、required workflow 可被 PR title/paths skip、mutation environment 未接 Writer App/workflow、protected-default dispatch 未從受保護預設分支載入或 payload exact tag 未綁定當前 protected `main` HEAD，同樣會在 mutation 前阻擋。
- apply 先完成全 repo GET/preflight；每筆 ruleset/environment mutation 都把 normalized before-image、expected-applied digest、`verifiedReleaseEvidenceDigest` 與明確 compensation 寫入同一個 v6 journal/rollback-plan digest。journal 以 atomic rename 寫入並同步 fsync 檔案與目錄；v6 嵌入 immutable、normalized、digest-bound 的歷史 inventory/desired/attestation-policy/issuer-registry bundle，以及當次 external-activation requirements/policy/inventory/desired/mutation-boundary contract、profile-derived `evidenceDurabilityClass` 與各自 digest。`PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM` 精確使用 `local-content-addressed-fsync-v1`：事件 hash chain、檔案與目錄 fsync、exact readback，且 `mirrorIdentity=null`、receipt set 為空，不接受也不宣稱 off-host/WORM adapter。`MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM` 精確使用既有 `independent-append-only-off-host-v1`，每次真正 provider mutation 前先把 `action-applying` 或 `rollback-compensating` event 寫入獨立 append-only off-host mirror並驗證 exact receipt。class 由 journal 內 exact active policy/profile 的 `fleet-rollout` requirement set 重算並綁入 authorization envelope；class/profile、adapter、mirror identity 或 receipt substitution 一律 fail closed。`historical-observation` 只以 journal 已簽章、已綁定的 embedded policy/contract digest 重播，不會被日後 canonical digest 更版錯誤封死；`current-apply` 仍必須對齊目前 immutable reviewed digest 與目前 canonical SSOT。歷史 journal 只能授權後續 read-only observation，不能成為任何 mutation authority；整包替換、未知欄位、self-signed 替換 issuer、action 或 registry lineage 不符，都必須在呼叫 provider client 前失敗。
- `.github/workflows/release.yml` 的 `trust-preflight` 在任何 OIDC、attestation 或 npm authority job 之前，先從 `GITHUB_EVENT_PATH` 解析 closed-shape `releaseTagAuthorization`，再唯讀重讀 role-applicable required integration IDs、rulesets、required-check producer/head/freshness、environments/secret metadata、reviewed workflow identities、protected-main commit/tree、GitHub-verified signed annotated tag object 與 immutable releases。Authority 的 required integration 精確為 GitHub Actions；Writer App secret metadata 仍依實際 mutation environments 分開讀回，不會被誤寫成 authority PR-check trust anchor。授權必須由目前 registry/policy 中至少 quorum 個 distinct `release-tag-authorizer` 共同簽署 exact repository/tag/tag-object/commit/tree、policy/registry digest、issuedAt/expiresAt、nonce 與 authorization digest。`required_signatures` 只作 signed-commit/ref defense-in-depth，不能取代 Git Tags API 的 `verification.verified=true` 或獨立 release 授權。證據綁 run ID/attempt/model digests/外部啟用清單、授權全文、policy digest 與 exact tag-object SHA，特權 job 必須先下載並重驗 digest，且每次使用權限前重新讀取同一 tag object；403/404 與任何 drift 一律中止。Stage receipt 與 finalization receipt 還必須把 authorization digest、semantic trust-evidence digest、trust artifact name/digest 及 original successful workflow path/event/main HEAD/run/attempt 直通綁定；finalizer 從同一 original run 重讀兩個 Actions artifacts 後，將 closed schema-3 `npm-finalization-receipt.json` 作為 immutable GitHub Release 長期資產上傳並核對 digest。此預檢不依賴 rollout candidate，所以 `candidateRelease=null` 也不會略過。
- partial failure 明記 `failed-partial-state-possible`、`rollbackAttempted=false`。`--recover-journal` 永遠只用歷史 embedded bundle 觀測，因此目前 desired/policy/activation-contract 漂移或舊 issuer 在 transaction 開始後被 rotation/revocation 不會造成 recovery deadlock；它會以 journal `startedAt` 驗證歷史 issuer 當時尚未被撤銷，且不授權任何寫入。`--rollback-journal` 只有在 fresh recovery authorization 同時通過目前 release-rings 的 active/unrevoked `apply-authorizer` quorum 與目前 privileged policy 的 active/unrevoked `root-rotator` quorum 後，才會依反序 compensating plan 寫入；兩組 signature 分開計數與驗證。Small-team profile 可由同一把誠實標記且同時具兩角色的 governed key 通過兩個 gate，不冒充 principal/custodian independence；maximum-assurance profile 仍要求 apply/root signer key 與 subject disjoint。沒有安全 inverse 的 action 必須在其他 drift 對齊後，以新 plan 和新簽章成為唯一 action；跨 repo 或與可回滾 action 混合會在寫 journal 前被拒絕。每一步都會在 provider mutation 緊鄰前重驗 live clock、current SSOT、fresh profile-bound authorization、profile-bound journal head 與遠端狀態；maximum-assurance 另外要求先完成 off-host `rollback-compensating` receipt。缺任一適用 gate、授權過期、遠端 drift、rollback plan digest 變更或無安全 inverse（例如 immutable releases enablement）一律在 mutation 前 fail closed 或標成 `rollback-blocked`，不得宣稱 rolled back。rollback 後的 forward recovery 不另建 flow：重新 readback、建立 fresh plan/authorization，並以新的 v6 journal 對同一 exact candidate 執行既有 apply API；舊 terminal journal 不得改寫或冒充新 transaction。本機 fsync journal 仍不是異地耐久證據；maximum-assurance profile 另要求 off-host append-only evidence 與真實 rollback drill，small-team profile 不得將尚未配置的 maximum-only control 冒充已完成。
- `consumerctl` 的 inventory/doctor/upgrade/registration/fanout plan/review-request/check 皆不寫本機或遠端。Legacy bootstrap 的 materializer 是唯一額外本機 writer，但只能建立一個全新的非 live snapshot output；其他 bootstrap stages 都是驗證或 proposal，且沒有 live apply/promotion 命令。唯一遠端動作 `apply-fanout` 要求外部 `completion-attestor` exact quorum 的 independent-review receipt：receipt 簽章以 signer key 排序、去重且 bounded，內嵌 bounded canonical fanout plan 完整 bytes 並綁定 plan/inventory/rings/candidate/runtime/issuer digests、decision 與 TTL；審查者 subject 不得與任一本次 dispatch 的 `apply-authorizer` subject 重疊。初始 preflight、每筆 live runtime readback 前、以及 POST 緊鄰的 mutation boundary 都會以不可倒退的 live clock 重驗 plan、apply authorization 與 review receipt，並從磁碟重讀 canonical inventory/rings/issuer registry 對 reviewed baseline 做 CAS；單純回填 plan digest 不再是授權。Plan/review/evidence 都有 closed schema 與 byte/array 上限，evidence 只能寫入 canonical flat runtime directory。Endpoint 只能從 inventory 推導。成功的 dispatch 仍只是 `request-accepted-unverified`，必須獨立 readback；不宣稱 workflow、PR、check、merge 或 rollout completion。
- ownership match 不可模稜兩可；同一路徑命中兩種 ownership 直接失敗。
- `three-way` 僅在 base/current/incoming 至少兩者相同時自動判定。三者皆不同就是 conflict，不嘗試猜測文字合併。
- secret 只能由 GitHub environment／organization 管理；本目錄不得出現 token、PAT 或 secret value。

## External activation checklist

以下全是 repo 外部狀態，不能以 committed prose 假裝完成；未完成前只允許 plan：

1. Native staged publishing 不能建立新 package；三包中任何尚不存在者，都先由 maintainer 以互動式 2FA 發布一個較低且**永不讓 consumer 消費**的 bootstrap version，只用來取得 npm package identity。不得拿真正 release target bootstrap。
2. 在 npm 為 `@qijenchen/design-system`、`@qijenchen/storybook-config`、`@qijenchen/governance` 三包設定唯一 Trusted Publisher：綁本 repo 的 `.github/workflows/release.yml` 與 GitHub `npm-release` environment，allowed action **只有 `npm stage publish`**；`npm publish` 必須停用。
3. npm organization/package 必啟用 require 2FA + disallow tokens，刪除 classic/granular/bypass publish tokens。OIDC job 只 stage；maintainer 逐包 2FA approve 後，再由 real-TTY guarded helper 依 exact BOM/receipt 將 beta/latest 做 monotonic prefix promotion。
4. 任何既有或後續版本都不可用人工 direct publish 補洞；一律走 protected-default `repository_dispatch`（payload exact tag 當下等於 protected `main` HEAD）→ verified/attested bytes → native stage receipt → 人工 2FA approve → guarded promotion → 獨立 protected-default `release-finalize.yml` exact-tag rebuild/read-back → immutable GitHub Release。tag 是 digest-bound release identity 資料，不是 privileged workflow 的觸發或來源。完整操作與 ambiguous post-accept recovery 見 [`docs/npm-native-staged-release.md`](../../docs/npm-native-staged-release.md)。
5. 對 `ajenchen/design-system` 啟用 GitHub immutable releases；reconciler desired state 使用官方 immutable-releases endpoint 並在 apply 後 readback。
6. 啟用 template-mirror/product-consumer fleet blueprint 前，建立兩個完全獨立的 GitHub Apps，不可共用 App、private key、integration ID 或 secret prefix。Authority PR gate 不依賴這兩個 App：它由 `design-system-authority.requiredChecks` 的 GitHub Actions native checks 保護；Check App verdict layer 已從 authority profile 拆除。
   - **Governance Check App**：`repositorySelection=selected`，顯式 App permission 只有 `checks: write`（GitHub 的 Metadata read 為 App 內建最小存取）；精確安裝到 published template 與 WM 等消費端必要 target，不安裝成 authority PR gate。它只能發布 `Immutable consumer snapshot`，不得取得 Contents write 或 Pull requests write。
   - **Governance Writer App**：`repositorySelection=selected`，顯式 App permission 精確為 `contents: write`、`pullRequests: write` 與 `workflows: write`；Workflows write 只用於完整 template mirror／consumer upgrade 中受認證的 `.github/workflows/**` 變更，external-ledger route mint token 時仍衰減為 Contents/Pull requests write。安裝範圍精確為 authority 的 external-ledger target（DS 本身）加上 published template 與 WM 兩個 mutation target，不得擴成 all-repositories。它不得取得 Checks write，也不得成為 required-check trust anchor。App 可能觸發的 ordinary candidate workflow 不具治理 authority；只有 protected-default dispatch 重載的 Check App verdict 可滿足 required check。Credential repository/environment 與 token 的 target installation repository 是兩個獨立維度，不可混為同一 installation set。
7. 在啟用相應 consumer/template route 前，將兩 App 的實際且 distinct integration ID 分別填入 `integrations.governanceCheckApp.id` 與 `integrations.governanceWriterApp.id`。兩者必須是不同整數，且都不可以用 GitHub Actions integration `15368` 代替；`required=false` 表示 authority 不把它們當全域 required integration，不代表消費端可以用 placeholder 冒充已啟用。
8. 只在 exact 受保護 GitHub environment 建立兩組不共用的憑證：published template 與 WM 的 `governance-check-verdict` 只放 `GOVERNANCE_CHECK_APP_ID` 與 `GOVERNANCE_CHECK_APP_PRIVATE_KEY`；authority 不建立 `governance-check-verdict`。DS 的 `governance-mirror`、DS 的 `governance-external-ledger`，以及 published template/WM 的 `governance-upgrade` 只放 `GOVERNANCE_WRITER_APP_ID` 與 `GOVERNANCE_WRITER_APP_PRIVATE_KEY`。Repository/organization secret fallback、模糊的 `GOVERNANCE_APP_*` 別名與任何其他 governance credential 都必須為空。
9. 對每個啟用的 template-mirror/product-consumer target，先觀測至少一筆由 Governance Check App integration ID 產生的成功 `Immutable consumer snapshot` history；Writer App 或 authority 的 GitHub Actions check 不可替代這個 consumer required context。Authority 則必須觀測 role selector 指定的 GitHub Actions native check 與 exact workflow/event/head。
10. 將 `npm-release` 綁定 exact release workflow（它不使用 Writer App）；DS `governance-mirror` 與 template/consumer `governance-upgrade` 綁定 exact workflow 並指定 `governanceWriterApp`；只有 published-template/product-consumer 的 `governance-check-verdict` 綁定 protected-default anchor 並指定 `governanceCheckApp`。Authority 的 `fleet/verified-main` 從六個 repository-workflow checks 投影，不得加入 App anchor。只在第 8 點指定的 environment 配置對應 credential，不得放 PAT 或模糊別名。Consumer writer job 本身的 `permissions` 只保留 Contents read，寫權只來自 late-minted、target-installation-repository-scoped App token。Reconciler 必須讀回 `default_workflow_permissions=read`；published-template/product-consumer 的 `can_approve_pull_request_reviews=false`，authority 因 Changesets built-in version-PR writer 保留 `true`。App ID、installation、environment secrets 或 operational installation-token probe 尚未真實啟用時，對應的 consumer/template 或 writer route 必須保持 external blocker，不可用 committed placeholder 假裝完成。
11. Required PR contexts 必對所有 PR 無條件出現；不得用 title/message skip、path filter 或 vacuous pass。DS packaging context 必為 `Packaging integrity(dims 84/85/86/88 light checks)`；consumer trust anchor 必為 Governance Check App 的 `Immutable consumer snapshot`。
12. release workflow 產出 immutable BOM 並完成 live readback 後，才可把 exact `candidateRelease` 寫入 `release-rings.json`：`id=ajenchen/design-system@v<version>`、version、source commit、source tree、BOM SHA-256、固定順序的三包 `{name,version,integrity}` 與可信 `observedAt`。每個 assignment 必須同時重設 `candidateReleaseDigest` 與 `enteredAt`；`candidateRelease=null` 是刻意的安全鎖，不能用 placeholder digest 解鎖。
13. 完成上述工作、provider certifications、required-check evidence、upstream attestation 與 active profile 的適用 predicates 後，先 review candidate plan/predicate evidence，再產生並 review 對應 signed apply authorization，最後明示 `--apply`。Small-team profile 不等待 elapsed soak；maximum-assurance profile 仍要求 ring soak hard gate。不得逐 repo 跳過 current-wave preflight。
14. 為 provider runtime evidence 建立獨立 Ed25519 signing authority，只把 public key、角色與有效期加入 `trust/issuers.json`，再由 `providers/runtime-conformance.json` 引用 key ID；private key 不得進 repo、本機 staging evidence 或模型環境。外部 signer 必須簽含 registry digest 的 exact `runtimeEvidenceSigningPayload`，未啟用前 promotion 必須維持 fail-closed，certification 不得從 `not-certified` 改成 `certified`。
15. Privileged executable closure 的第一次啟用不可把 private key 寫進 repo。由 GitHub 驗證為 OWNER 且在 allowlist 內的帳號，對 exact PR/head、candidate trust-root digest、candidate issuer-registry digest、整個 closure digest、expiry 與 nonce 留下一筆未編輯 comment；同一 PR 必須依 active profile 一次安裝角色合格的 Ed25519 public keys、同步設定 privileged/rollout/runtime/release-tag 各政策的 key ID/quorum/digest，並把 `bootstrap.enabled` 永久改為 `false`。Small-team profile 的 privileged allowlist 精確一把同時具 `privileged-change-authorizer`／`root-rotator` 的 governed key；maximum-assurance profile 才要求 2..5 distinct-subject root quorum。之後任何 registry/policy rotation 或 revocation 都需要既有 profile-bound `root-rotator` quorum 簽署。registry 必須維持 append-only lineage：既有 issuer 不可刪除、re-key、改 subject/roles/有效期或從 revoked 恢復 active；只允許 active 保持 active 或單向轉成 revoked，並可追加新 issuer。每個新撤銷的 `revokedAt` 必須精確等於這次 privileged authorization 的 `issuedAt`，禁止回填或預填模糊生效時間。候選設定若留下 revoked/expired/role-ineligible key、stale profile binding 或不足 quorum 會被拒絕。
16. Published-template/product-consumer 的 `governance-check-verdict` environment 只能提供 Check App，且限 protected branches；authority profile 不存在此 environment。`release-finalize` 不使用 GitHub User/Team reviewer gate，獨立性由 exact quorum-signed finalizer authority 強制，且 authorizer subjects 必須與 stage-only OIDC publisher 分離。任一適用的 authority/readback 未完成時 desired model 故意 fail closed。
17. 依 `external-activation-requirements.json` 配置兩個唯讀權限面：`RELEASE_TAG_READ_TOKEN` 僅給 repository Contents: read，專供 contents-writer 在每次 mutation 前重查 tag ref/object signature；`RELEASE_TRUST_PREFLIGHT_TOKEN`（或等價 job token）再取得 rulesets、checks/actions runs、environments、secret metadata、App metadata 與 immutable-release state 的必要 read 權限。兩者都不得有任何寫入權限；實際狀態未對齊、tag 不是 GitHub-verified signed annotated object，或 token 不足時不可關閉預檢。
18. 以 privileged trust-root 流程在 `trust/issuers.json` 啟用只具 `release-tag-authorizer` 角色的 Ed25519 public key，再把 exact key IDs/profile-bound quorum 寫入 `release-tag-authorization-policy.json` 並同步唯一 registry digest。Small-team profile 精確需要一把 governed release authorizer；maximum-assurance profile 需要 2..5 distinct-subject authorizers，且只有外部 custody evidence 能證明 multi-custodian。私鑰不可進 repo、CI secret 或模型環境；目前空 registry/allowlist 是刻意的 fail-closed 狀態。
19. Maximum-assurance profile 才要求為每個 reconcile journal、recovery observation、rollback authorization/receipt 建立獨立管理、append-only、off-host durable mirror，並驗證 digest、retention 與 disaster read-back。Small-team profile 使用同一 v6 journal/recovery API 的 local content-addressed atomic fsync class，必須誠實標記沒有異地/WORM 證據。
20. Maximum-assurance profile 對 registry 內、frozen scope 選定的 canary，另要求在 signed plan、preflight、profile-bound recovery authorization、before-image compensation、逐步 read-back 與異地 journal mirror 全部有效時完成真實 GitHub rollback drill 並留下 current signed evidence。Small-team production readiness 仍須由 machine-verifiable local candidate→exact rollback→fresh-plan/new-journal forward-recovery 測試證明；fixture/local evidence 不冒充真實 GitHub drill 或異地耐久性。只有平台不可代理 login/MFA/OAuth/owner、缺 credential reference 或 plan 外付費等 human-only boundary 才停。
