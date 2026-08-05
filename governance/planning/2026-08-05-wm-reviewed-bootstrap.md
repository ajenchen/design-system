<!-- Authority/status: governance/planning/registry.json -->
# work-management reviewed bootstrap —— 已驗證程序、真實阻擋點與根因修法

**狀態**:reference(內容升級已完成;僅剩 profile promotion 待獨立 attestation —— 見「為什麼現在不執行」;根因修好後才可跑)
**建立 / 最後更新**:2026-08-05
**適用**:consumer `ajenchen/work-management`(profile `legacy-bootstrap-v2`,現停在 0.1.0-beta.111)
**目標版本**:0.1.0-beta.115(最新 immutable release;template main 對應 mirror commit `10e3160`)

## 為什麼 WM 不能走 ordinary sync(三層,逐條實查)

1. **retired ceremony 契約**(已修,beta.113 起):WM 現行(beta.111)的
   `scripts/verify-upgrade-evidence.mjs:184` 要求 `finalizationReceiptSha256` /
   `releaseTrustEvidenceSha256` 必為 sha256,但同版 `verify-upgrade-provenance.mjs:657-658`
   對這兩欄輸出 `null`(自 beta.111 起無任何 release 上傳 `npm-finalization-receipt.json`)。
   → ordinary lane 對任何 target 都不可能過。
2. **版本銜接**:`refresh-fork-launchers.mjs:1879` 要求新版 `immutableHeadSnapshot` 等於上一版
   已認證 `currentSnapshot`;WM 跳版 → `GOV-UPGRADE-007`。
3. **profile**:WM 是 `legacy-bootstrap-v2`(`infra/governance/inventory/managed-repos.json:57`),
   `ordinarySyncAllowedAfter: independent-bootstrap-readback` —— **從未完成一次性 reviewed
   bootstrap**,ordinary sync 本來就不合格(`consumerctl.mjs:1573-1594`)。

`new-snapshot-v2` 對 WM **結構上不可達**(`schemas/managed-repos.schema.json:231-250` 以 id
明列合法 profile 集合且不含它;唯一指派它的是 repo 註冊,而註冊拒絕既有 repo,`consumerctl.mjs:320`)。

## 環境可行性(2026-08-05 實測,推翻先前判斷)

- bootstrap 六指令(`plan-bootstrap` / `materialize-bootstrap` / `check-bootstrap-materialization` /
  `check-bootstrap-readback` / `plan-bootstrap-promotion` / `check-bootstrap-promotion`)
  **完全不觸網**:`GhApiClient` 只在 fanout 指令實例化(`consumerctl.mjs:2177` / `:2332`)。
  在 fetch/socket/dns 全被毒化的環境下輸出位元組相同。
- 需要網路的只有 `doctor`(打 GitHub API,經 `reconcile-github.mjs:199-206` 的 hermetic 子行程,
  該子行程刻意不帶 proxy → 只能 proxy 連外的 sandbox 會 ENOTFOUND)。**bootstrap 不需要它**。
- `git clone` / `git push` / curl REST 在本環境皆可用。
- **Step 0 已完成**(PR #68):`release-rings.json` 的 candidate 已由 v0.1.0-beta.115 的 release
  BOM bytes 機械推導寫入,三個 assignment digest 同步重設,`governance:check` PASS。

## 執行結果(2026-08-05,已完成)

根因修法(DS PR #71 + #72 具名確認機制)落地後,本程序**已實跑完成**:

- `plan-bootstrap`:reviewReady **true**、conflicts **0**、actions 7、preserved 251
  planDigest `9fc9ec23a4377e46…`;三個 consumer-retained 分歧具名確認並進入 digest
  (`apps/template/package.json` consumer-owned;`package.json`、`package-lock.json` three-way)
- `requiredChecksDigest` = `087dde12e2038a17…`,由 `infra/governance/desired/github.json`
  的 product-consumer profile `requiredChecks` 以 `sha256(stableStringify(...))` 推導(可重現,非佔位)
- `materialize-bootstrap` → 258 entries;`check-bootstrap-materialization` 獨立重算通過
- WM PR #47 的 `Verify consumer` 綠 → squash merge `e7133806`
- **讀回 WM protected main:`package.json` 與 `package-lock.json` 皆為 0.1.0-beta.115** ✅

**剩餘一步(human-only)**:`check-bootstrap-readback` → `plan-bootstrap-promotion` 需要
`reviewAuthorization`(`kind: independent-engineering-attestation`,含 actorId /
 authorizationDigest / authorizedAt)。作者不能自簽,故待獨立審查者提供。其餘 25/30 欄位已由
本次執行的真實事實填妥:`governance/planning/2026-08-05-wm-bootstrap-readback-template.json`。
完成 promotion 後 WM profile 才會由 `legacy-bootstrap-v2` 進 `reviewed-bootstrap-established-v2`,
之後即享 ordinary sync。

## 原本的阻擋點(已解除,保留記錄)

`plan-bootstrap` 對 consumer-owned 路徑**只比 `--base` vs `--incoming`,完全忽略 consumer 現況
`current`**(`consumer-bootstrap.mjs:893-894`)。而 scaffold 的 `apps/**` 每次發版必變、
`package.json` / `package-lock.json` 是 `three-way` 且只有全等才解(`:936-970`)——
真實 consumer 的 `package.json` 永遠與 template 不同名。結論:**任何 consumer、任何版本,
全樹輸入永遠 `reviewReady:false`**;`:1130` / `:1229` 在 conflicts≠0 時硬拒 materialize。

常見繞法是把 `--base` / `--incoming` 限縮到 DS-owned 路徑集。**本計畫明確不採用**,理由:

- legacy bootstrap 路徑不把 `--incoming` 綁到 BOM 的 `templateStaticTreeSha256`
  (`--scaffold-lock` 只在 control-plane lane 生效),所以限縮後產出的 receipt 會宣稱
  「已對 beta.115 **完整** template tree 完成 reviewed bootstrap」,而實際只 diff 了子集,
  **沒有任何 check 抓得到**。
- `check-bootstrap-readback` 只驗格式與時序、不連 GitHub、不驗簽章
  (`consumer-upgrade-protocol.mjs:133-187`)—— 實測用捏造的 git OID 也會 pass。

即「限縮輸入樹」是抑制訊號而非解決衝突,會在治理紀錄裡留下比事實更強的宣稱。這與整份治理
語料的存在目的相反(對齊 `memory/feedback_ship_then_revert_anti_pattern.md` 的 false-compliance
反 pattern),故**列為需先修根因的阻擋點,不以繞法交差**。

## 根因修法(建議,需先落地才執行 bootstrap)

給 `plan-bootstrap` 加 **具名確認**機制,而非放寬判定:

1. 新增 `--acknowledge-consumer-owned <path>`(可重複):把該 path 的 base≠incoming 從 blocking
   conflict 降為「已具名確認」,且**確認清單進 planDigest**(篡改即 digest 不符)。
2. `sameState(current, incoming)` 時直接判 preserved,消除「consumer 早已與 incoming 一致卻仍算
   衝突」的假陽性。
3. receipt 明列被確認的 path,讓宣稱與事實一致。
4. 補 deterministic test:全樹 + 未確認 → 仍 fail;全樹 + 具名確認 → pass 且 digest 綁定確認清單。

同時值得補的相鄰缺口:`combobox.spec.md` / `select.spec.md` 宣稱的「新增 renderer-affecting
prop 必同步 Native 分支」目前**沒有 deterministic script**(`check_field_controls_contracts.sh:51-71`
只驗 display-vs-edit renderer 消費)—— 這正是 2026-08-05 觸控 regression 的失效類別。

## 根因修好後的執行序(已實跑驗證過的形狀)

```bash
DS=<repo root>; W=$TMPDIR/wmboot; mkdir -p $W
git clone https://github.com/ajenchen/ds-product-template.git $W/template
git clone https://github.com/ajenchen/work-management.git     $W/wm
git -C $W/template archive db836e6 | tar -x -C $W/roots/base       # beta.111 mirror
git -C $W/template archive 10e3160 | tar -x -C $W/roots/incoming   # beta.115 mirror
# release 資產(asset id 由 GET /releases/tags/v0.1.0-beta.115 查)
curl -sSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" \
  https://api.github.com/repos/ajenchen/design-system/releases/assets/<bom-id> -o $W/release-bom.json
shasum -a 256 $W/release-bom.json   # 必須 == release-rings.json#candidateRelease.bomSha256
node $DS/scripts/product-template-scaffold-lock.mjs --verify --phase published \
  --root $W/roots/incoming --lock $W/scaffold.lock.json --bom $W/release-bom.json
node $DS/infra/governance/bin/consumerctl.mjs plan-bootstrap \
  --repo-id work-management --root $W/wm --base $W/roots/base --incoming $W/roots/incoming \
  --release-bom $W/release-bom.json --required-checks-digest <digest> \
  --acknowledge-consumer-owned <每個具名 path>          # ← 根因修法落地後才有此旗標
# → materialize-bootstrap → check-bootstrap-materialization → 落地到 WM 分支 → PR
# → Verify consumer 綠 → squash merge → 讀回 → check-bootstrap-readback → plan-bootstrap-promotion
```

**每次執行必重取 planDigest,禁沿用**;`--incoming` 必須是 template repo 的**已發布 mirror
commit**(151 檔),不可用 DS in-repo 的 `template/ds-product-template`(107 檔,非發布物,
會產生刪光 `scripts/` 的假 plan)。

## 收尾條件

- WM PR 的 `Verify consumer` 綠;WM protected main 的 `package-lock.json` 讀回目標版本
- `managed-repos.json` 的 WM profile 進 `reviewed-bootstrap-established-v2` 且
  `acceptedBootstrapReadbackSha256` 有值
- receipt 宣稱與實際 diff 範圍一致(根因修法的核心目的)
- DS `governance:check` 0 diagnostics
