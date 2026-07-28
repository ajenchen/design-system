# npm native staged release runbook

本流程的核心不是「CI 自動發版」，而是把四種權限拆開：protected-default `repository_dispatch` 只能載入受保護預設分支上的 workflow，payload 中的 exact tag 只是需重新解析並綁定當前 protected `main` HEAD 的資料；GitHub OIDC 只能把三個 exact tarball 放進 npm native staging；maintainer 必須逐包以 2FA 核准；最後由另一個 protected-default workflow 從遠端 exact tag 重新建置同一組 bytes，確認 npm 與 GitHub 的 read-back 後才建立 immutable GitHub Release。

npm 官方要求 native staged publishing 使用 npm 11.15.0+、Node 22.14.0+，且 package 必須已存在；`npm stage approve` 必須由互動式 maintainer 提供 2FA。Trusted Publisher 應只允許 `npm stage publish`、停用 `npm publish`，package publishing access 設為「Require two-factor authentication and disallow tokens」。來源：[Staged publishing](https://docs.npmjs.com/staged-publishing/)、[`npm stage`](https://docs.npmjs.com/cli/v11/commands/npm-stage/)、[Trusted publishing](https://docs.npmjs.com/trusted-publishers/)。

## 一次性啟用

1. 若三個 package 任何一個尚不存在，maintainer 先以互動式 2FA 發布一個低於正式 train、永不被 consumer 使用的 bootstrap version。Native staging **不能**建立新 package；不能拿真正 release target 當 bootstrap。
2. 分別替 `@qijenchen/governance`、`@qijenchen/storybook-config`、`@qijenchen/design-system` 設定唯一 Trusted Publisher：repository `ajenchen/design-system`、workflow `release.yml`、environment `npm-release`、allowed action **只有** `npm stage publish`。
3. 三包 publishing access 都設為 require 2FA + disallow tokens；刪除 bypass-2FA 或 automation publish token。
4. GitHub `npm-release` environment 的 deployment branch policy 只允許受保護的預設分支；`.github/workflows/release.yml` 的 stage job 使用該 environment，npm Trusted Publisher 再同時綁定 workflow 與 environment。Tag 不是 workflow 來源或環境信任邊界。Repository 另行啟用 immutable releases；這兩項都必須由 governance reconciler read-back，不能只憑 UI 設定宣稱完成。
5. 建立 `RELEASE_TAG_READ_TOKEN` repository secret，fine-grained 權限僅限本 repository 的 **Contents: read**、不得有任何 write；contents-writer 只能用它做 tag ref/object recheck，真正的 `GH_TOKEN` write authority 不得拿來當 tag trust oracle。另依 activation checklist 配置 broader-but-read-only 的 `RELEASE_TRUST_PREFLIGHT_TOKEN` 觀測 rulesets/checks/environments 等狀態。
6. 在唯一 `trust/issuers.json` 中依 active assurance profile 註冊只具 `release-tag-authorizer` 角色的 Ed25519 public key，並透過 privileged trust-root change 把 exact IDs、quorum 與新 registry digest 寫入 `release-tag-authorization-policy.json`。`PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM` 精確使用一把受治理且與 stage-only OIDC 分離的 release key；`MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM` 才要求 2..5 位獨立管理者。私鑰必須留在 profile 所要求的 signer 邊界，不得交給 CI、repo 或模型環境。

## 每次 release

### 1. Protected-default dispatch 只做證據與 staging

`.github/workflows/release.yml` 的唯一入口是 `stage-protected-release` repository dispatch，不接受 tag-push event，因此 workflow bytes 一定由 protected default branch 載入；payload 的 exact `v*` tag 只是資料，且必須與當前 protected `main` HEAD 完全相同。先用 maintainer 的已配置 signing key 建立、本機驗證並推送 **signed annotated exact tag**：

```text
git fetch origin main
test "$(git rev-parse HEAD^{commit})" = "$(git rev-parse origin/main^{commit})"
git tag -s vX.Y.Z "origin/main^{commit}" -m "Release vX.Y.Z"
git verify-tag vX.Y.Z
git push origin refs/tags/vX.Y.Z
```

`required_signatures` 是 GitHub 的 **Require signed commits** ruleset rule：即使 ruleset target 是 tag ref，官方文件仍把它定義為進入 ref 的 commit signature 驗證，不能單獨證明 annotated tag object 有簽章。真正的 release-tag trust boundary 是 GitHub Git Tags API：`GET /git/ref/tags/{tag}` 必須指向 `type=tag`（lightweight tag 直接拒絕），接著 `GET /git/tags/{tag_object_sha}` 必須同時證明 exact tag name、exact tag-object SHA、直接 target exact release commit，且 `verification.verified=true`、`reason=valid`、signature/payload/verified_at 齊全。Tags API 的唯讀 endpoint 只需要 fine-grained token 的 repository **Contents: read**。來源：[Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-signed-commits)、[REST API endpoints for Git tags](https://docs.github.com/en/rest/git/tags#get-a-tag)。

若 signing key 未配置、`git verify-tag` 失敗、GitHub API 未把 tag object 判為 verified，或 remote `fleet/immutable-release-tags` ruleset 未以 `enforcement=active` 啟用 `required_signatures`，不得 dispatch。Ruleset 是 commit/ref 層 defense-in-depth；API tag-object 驗證才是 signed annotated tag 的 release gate。這些仍不等於獨立的發版授權：下列 envelope 另外綁定 exact repository/tag/tag-object/commit/tree、issuer-registry/policy digest、issuedAt/expiresAt、nonce 與 authorization digest，並由 policy quorum 個 distinct authorizer 簽署。

先在不含私鑰的協調機產生 envelope，再由 policy 的 `requiredSignerQuorum` 個 signer 依 canonical key order 逐一輸入前一份檔案並輸出新檔；small-team profile 只執行 signer-1，maximum-assurance profile 才繼續 signer-2..N。每一次都要帶入已核對的五個 exact identity 欄位：

```text
node scripts/release-tag-authorization.mjs --create \
  --repository ajenchen/design-system --tag vX.Y.Z \
  --tag-object <tag-object-sha> --commit <commit-sha> --tree <tree-sha> \
  --issued-at <canonical-UTC> --expires-at <canonical-UTC-within-policy-TTL> \
  --nonce <32+-character-cryptographic-random-base64url> \
  --output /secure/path/release-auth.unsigned.json

node scripts/release-tag-authorization.mjs --sign \
  --input /secure/path/release-auth.unsigned.json --output /secure/path/release-auth.signer-1.json \
  --repository ajenchen/design-system --tag vX.Y.Z \
  --tag-object <tag-object-sha> --commit <commit-sha> --tree <tree-sha> \
  --signer-key-id <signer-1-id> --subject <signer-1-subject> --private-key /secure/signer-1.pem

# 僅當 active policy 的 requiredSignerQuorum > 1 時，依相同格式繼續 signer-2..N。

node scripts/release-tag-authorization.mjs --verify \
  --input /secure/path/release-auth.<final-required-signer>.json \
  --repository ajenchen/design-system --tag vX.Y.Z \
  --tag-object <tag-object-sha> --commit <commit-sha> --tree <tree-sha>
```

最後把 JSON object 原樣放入 closed-shape payload（只能有 `tag` 與 `releaseTagAuthorization`）後送出：

```text
jq -n --arg tag vX.Y.Z --slurpfile auth /secure/path/release-auth.quorum.json \
  '{event_type:"stage-protected-release",client_payload:{tag:$tag,releaseTagAuthorization:$auth[0]}}' \
  > /secure/path/release-dispatch.json
gh api repos/ajenchen/design-system/dispatches --method POST --input /secure/path/release-dispatch.json
```

若 protected `main` 在 tag 推送後、dispatch 解析前已前進，run 必須 fail closed；建立新 version/tag，不移動舊 tag。這個 workflow 會：

- 在任何 OIDC、artifact attestation 或 npm authority 啟動前，以唯讀 `trust-preflight` 重讀 actual GitHub Apps/IDs、rulesets、current-head required checks、protected environments 與 secret metadata、reviewed workflow identities、exact signed annotated tag object/commit/tree 與 immutable releases；
- 產生綁定 run ID/attempt、inventory/desired digest 與 `infra/governance/external-activation-requirements.json` digest 的 attempt-unique evidence；attestation 與 npm jobs 都必須在使用特權前下載、重驗同一 evidence digest；
- 從 protected `main` 的 exact tag 建置三個 tarball、SBOM、完整 product-template scaffold path/mode lock、BOM 與 release-set digest；BOM 直接綁定 scaffold lock 的 exact bytes，發布後才能生成的 `package-lock.json` bytes 另由 mirror evidence full-tree digest 綁定；
- 產生 GitHub artifact attestations；
- 用 npm 11.18.0 對每個 tarball執行 `npm stage publish ... --json`；
- 從成功 JSON 解析 `stageId`，每一包成功後都用 atomic rename + fsync 更新 closed schema-2 `npm-stage-receipt.json`；該 receipt 同時保存最初獲 quorum 授權的 exact tag-object SHA、`releaseTagAuthorization.authorizationDigest`、trust evidence digest、trust artifact name/digest，以及原始 `.github/workflows/release.yml` path/event/main HEAD/run ID/attempt；
- 無論成功或失敗都上傳 receipt。Artifact 名包含 tag、run ID 與 run attempt，避免 rerun 覆寫舊證據。

`trust-preflight` 只有 read permissions；若 ruleset/environment/secret metadata 等 API 需要額外觀測權限，必須依 machine-readable activation checklist 配置 `RELEASE_TRUST_PREFLIGHT_TOKEN`。任一 403/404、App ID 未解析、獨立 finalizer reviewer 未配置、required-check producer/head/freshness 不符、workflow identity drift 或 immutable releases 未啟用都中止發版，不得改用 placeholder 或關閉 gate。

Nonce 與 authorization digest 防止把簽章搬到另一個 identity 或時間窗；唯讀、無狀態 verifier 不宣稱能在 TTL 內拒絕「完全相同」的整包 replay。Workflow 以 repository-wide concurrency 串行化，且後續 npm/GitHub 操作只能對同一 immutable identity 做可重驗的結果；若風險模型需要 exact-once，必須在 dispatch 前另外啟用外部 atomic used-authorization-digest ledger 或 server challenge，不可把 repo 內檔案假裝成使用過的 nonce state。

只有 receipt 上傳成功後，run summary 才會列出完整 finalizer handoff：tag、run ID/attempt、release-set SHA-256、stage-receipt SHA-256、stage artifact SHA-256、release authorization digest、release trust evidence digest，以及 attempt-unique trust artifact name/SHA-256。Artifact digest 是 64 位小寫十六進位；GitHub REST read-back 會把同一值表示為 `sha256:<digest>`。這些值必須由同一個已完成且成功的 original workflow attempt 產生，不能從新 rerun 拼接。

### 2. Maintainer 逐包檢查並以 2FA approve

先下載完整 staging artifact、`release-trust-<run-id>-<attempt>` 與原始六檔 release artifact（三個 tarball、SBOM、BOM、`product-template-scaffold.lock.json`）。從 trust evidence 取得本次已驗證的 exact tag-object SHA；使用只有 GitHub repository **Contents: read** 的 token 執行 guarded helper：

```text
TAG_OBJECT=$(jq -r '.release.tagObject' /absolute/path/release-trust-preflight.json)
export GH_TAG_READ_TOKEN=<fine-grained-contents-read-token>
npm run release:approve -- \
  --artifacts /absolute/path/release-artifacts \
  --bom /absolute/path/release-artifacts/release-bom.json \
  --repository ajenchen/design-system \
  --tag vX.Y.Z \
  --git-head <receipt.source.gitHead> \
  --tag-object "$TAG_OBJECT" \
  --github-token-env GH_TAG_READ_TOKEN \
  --receipt /absolute/path/npm-stage-receipt.json \
  --receipt-sha256 <run-summary-digest>
```

Helper 依 `publishOrder` 逐包 `stage view` 核對 name/version/tag/SHA-1，並在**每一次** `npm stage approve` 前重新呼叫 GitHub API，要求 tag ref、tag object、verified signature 與 exact commit 均未變；approve 後再 read-back package 與 tag。每次 approve 仍必須由 npm 的互動式 2FA prompt 完成。不可把 OTP、`NPM_TOKEN`、`NODE_AUTH_TOKEN` 或 `_authToken` 放入環境變數或 CI。Approval 完成後，exact version 會公開，且 staging 時指定的 `governance-stage-<version>` tag 是 staged record 的 immutable property。

### 3. 互動式 promotion（只在 maintainer TTY）

三包都 approve 後，用同一份 release artifacts、BOM 與 stage receipt 執行：

```text
npm run release:promote -- \
  --artifacts /absolute/path/release-artifacts \
  --bom /absolute/path/release-artifacts/release-bom.json \
  --repository ajenchen/design-system \
  --tag vX.Y.Z \
  --git-head <receipt.source.gitHead> \
  --tag-object "$TAG_OBJECT" \
  --github-token-env GH_TAG_READ_TOKEN \
  --receipt /absolute/path/npm-stage-receipt.json \
  --receipt-sha256 <run-summary-digest> \
  --output /absolute/path/npm-promotion-receipt.json
```

Helper 會在任何 channel mutation 前驗證：真實 TTY、非 CI、無注入式 npm credential、exact release-set/BOM、同一 GitHub-verified tag object/commit、三包 SRI + SHA-1、SLSA provenance、registry signatures、三個 isolated tags，以及目前 beta/latest baseline。工程授權來自 exact signed release train 與既有 standing delegation，不再要求第二道人類工程確認；TTY 只保留給 npm 平台強制的 proof-of-presence／登入／2FA。在**每一次** `npm dist-tag add` 前仍重新查 GitHub API，之後只依 `publishOrder` 移動 beta/latest。中途失敗只能從已完成 prefix 以**同一份** BOM/receipt/tag-object 恢復；downgrade、缺 tag、tag-object substitution、out-of-order split、concurrent drift 全部 fail closed。

### 4. 獨立 finalizer 才能建立 GitHub Release

完成 npm 2FA approve 與互動式 promotion 後，以 GitHub Repository Dispatch API 送出事件（不得用可選 branch/ref 的 `workflow_dispatch`）：

```text
gh api repos/ajenchen/design-system/dispatches --method POST \
  -f event_type=finalize-staged-release \
  -F 'client_payload[tag]=vX.Y.Z' \
  -F 'client_payload[stage_run_id]=<run-id>' \
  -F 'client_payload[stage_run_attempt]=<attempt>' \
  -F 'client_payload[stage_artifact_digest]=<v4-artifact-sha256>' \
  -F 'client_payload[release_set_sha256]=<release-set-sha256>' \
  -F 'client_payload[stage_receipt_sha256]=<stage-receipt-sha256>' \
  -F 'client_payload[release_authorization_digest]=<authorization-digest>' \
  -F 'client_payload[release_trust_evidence_digest]=<trust-evidence-digest>' \
  -F 'client_payload[release_trust_artifact_digest]=<trust-artifact-v4-sha256>'
```

Dispatch 的 `client_payload` 是 closed shape；多一個、少一個或格式錯誤的欄位都會在 checkout 前被拒絕。GitHub 只會從 protected default branch 載入這個 privileged workflow；兩個 job 也都硬性要求 `refs/heads/main`，writer 另綁 `release-finalize` protected environment。

Finalizer 不信任 dispatch payload、artifact 名稱或 staging run 的 working directory。在下載 receipt、更不能在 registry certification 前，它先透過 GitHub REST API重讀 original run 與該 run 的 artifacts，要求：workflow path 必須是 `.github/workflows/release.yml`、event 必須是 `repository_dispatch`、head SHA 必須等於 exact release commit、status/conclusion 必須是 `completed/success`、run attempt 必須完全相同；`npm-stage-*` 與 `release-trust-*` 兩個 attempt-unique artifacts 都必須恰好一份、未過期、非空、屬於同一 run/head，且 API 的 `sha256:` digest 必須分別等於 handoff 的 v4 artifact SHA-256。然後從該 exact original run 下載 trust evidence，以 evidence 的原始 `verifiedAt` 時點重驗其 closed shape、簽章/政策、authorization digest、semantic evidence digest 與 release identity；這個模式不會更新或延長原 authorization TTL。驗證通過後只把下載檔案原始 bytes 以 byte-for-byte 方式複製到 `finalization-evidence/release-trust-preflight.json`，不重新序列化 JSON；檔案 SHA-256 同時寫入 stage/finalization receipts 的 closed `releaseTrust` binding。即使 JSON 語意相同，任何空白、換行或 bytes 替換也會 fail closed。任何舊 attempt、同名替代 artifact 或跨 run replay 都會在發佈前失敗。

接著 finalizer 重新 checkout exact remote tag，先從已驗證的 original trust evidence 取回**最初獲 quorum 授權的 tag-object SHA**，再由 GitHub API要求 remote ref 仍是該 exact verified signed annotated object；之後重新 pack 三包並重建 SBOM/scaffold lock/BOM，bytes 必須等於原 release-set digest，再 read-back 三包 exact SRI/SHA-1/provenance/signatures、isolated tags 與 beta/latest。Closed schema-3 finalization receipt 會完整綁定該 original tag-object、authorization/trust evidence semantic digest、**exact evidence-file SHA-256**、trust artifact identity、stage workflow/run/attempt/兩個 artifact identities，以及本次 `release-finalize.yml` run/attempt；finalization artifact 名也同時包含 run ID 與 run attempt，rerun 不會下載或覆蓋前一 attempt。全綠才把 digest-bound evidence 傳給 fresh contents writer。Writer 自己再次查 GitHub API取得同一 stage/trust identity，再驗 BOM、receipt、finalizer run identity、exact evidence-file digest 與**同一 original tag-object SHA**；GitHub Release helper 也在每次 create/upload/edit mutation 前重查 tag object/signature/commit。最終 immutable GitHub Release 是封閉的八檔集合：原本六檔 deterministic release set、第七檔 `npm-finalization-receipt.json`、以及第八檔原始 `release-trust-preflight.json`。Writer 必須比對兩個 evidence assets 的 expected SHA-256、拒絕重複或額外 asset，並對全部八檔執行 GitHub release/asset verify read-back。Actions 90-day artifact 過期後，immutable Release 仍同時保留可離線重驗的原始 trust evidence 與綁定其 digest/identity 的 finalization receipt。不同 finalizer run/attempt 的 receipt 不可重播。

## Ambiguous post-accept crash

網路或 runner 可能在 registry 已接受 `npm stage publish` 後、client 收到/寫入 stage ID 前中斷。這種狀態**不可直接重試**：同一 version 可能已佔用 staged semver unique index。

1. 保留 failed run 上傳的 receipt；`ambiguous` 是安全狀態，不是「未送出」。
2. Maintainer 以互動式登入執行 `npm stage list <package-name> --json`，找 exact package/version/isolated tag；再 `npm stage view <stage-id> --json`。
3. 若找到，使用 `npm run release:stage-recover -- ... --package <name> --stage-id <id>`。Helper 只在 TTY 運行，且必須讓 stage view 的 name/version/tag/SHA-1 全部命中 BOM 才會 atomic repair receipt。若找不到，保留 `ambiguous` 證據，不自行改成 `planned`；仍清除該 attempt 其他已知 stage IDs 並再次 list 確認 exact version 不存在。
4. 不論 registry 最後是否已收齊三包，都逐一用 `npm run release:reject-stage -- ... --tag-object "$TAG_OBJECT" --github-token-env GH_TAG_READ_TOKEN --stage-id <id>` 以 2FA reject 此 failed attempt 已知/恢復出的**全部** stage IDs；helper 會先比對 receipt/BOM/stage view，並在每次 `npm stage reject` 前重查同一 verified tag object。確認三包的 exact staged version 都不存在後，重新送出 `stage-protected-release` repository dispatch。必須使用同一個 exact tag，且該 tag 當下仍必須等於最新的 protected `main` HEAD；若 `main` 已前進，先用新 commit/version/tag 開始新的 release identity，不得讓舊 tag 用舊 workflow bytes 重跑。這個保守步驟確保 finalizer 永遠只消費某一次成功 run 原生上傳、digest 固定且完整的 receipt，不接受本機替代檔。
5. 不可混用兩次 attempt 的 receipt，也不可把本機 repaired receipt 直接交給 finalizer；repair helper 的用途是找齊並安全清除 failed attempt，讓下一次 protected-default dispatch 從乾淨 staged state 重做。

任何 reject、bootstrap、approve、promotion 都是必須 read-back 的外部狀態變更；工程方案與執行順序由 canonical policy 及 standing delegation 授權。只有 npm 平台不可代理的登入、MFA／2FA 或 proof-of-presence 才需要帳號持有人完成 human action，且不構成第二道人類工程決策。所有步驟都必須保留 terminal/run evidence，不得由模型或 CI 假裝已完成。
