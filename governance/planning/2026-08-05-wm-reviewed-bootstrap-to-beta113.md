# work-management 升級到 0.1.0-beta.113 —— 已驗證的 reviewed bootstrap 程序

**狀態**:active(可執行;程序已對 disposable clone 實跑通過,尚未對 WM protected main 執行)
**建立**:2026-08-05
**適用**:consumer `ajenchen/work-management`(profile `legacy-bootstrap-v2`)

## 為什麼 WM 不能走 ordinary sync

三層 fail-closed,逐層查證(非推測):

1. **retired ceremony 契約**(已修,beta.113 起生效):WM 現行(beta.111)的
   `scripts/verify-upgrade-evidence.mjs:184` 要求 `finalizationReceiptSha256` /
   `releaseTrustEvidenceSha256` 必為 sha256,但同版 `verify-upgrade-provenance.mjs:657-658`
   對這兩欄輸出 `null`(自 beta.111 起沒有任何 release 上傳
   `npm-finalization-receipt.json`;v0.1.0-beta.111/112/113 的 asset 清單經 REST 實查皆為
   六檔)。→ **ordinary lane 對任何 target 都不可能過**,不只是跳版問題。
2. **版本銜接**:`refresh-fork-launchers.mjs:1879` 要求新版的 `immutableHeadSnapshot`
   等於「上一版已認證的 currentSnapshot」。beta.113 的 immutableHead 是 beta.112,而 WM 在
   beta.111 → `GOV-UPGRADE-007`。而 beta.112 因第 1 點不可達且 immutable 不可重發。
3. **profile**:WM 的 `upgradeProtocolProfile` 是 `legacy-bootstrap-v2`
   (`infra/governance/inventory/managed-repos.json:57`),`bootstrapRequired: true`、
   `ordinarySyncAllowedAfter: "independent-bootstrap-readback"` —— 也就是 **WM 從未完成
   一次性 reviewed bootstrap**,ordinary sync 本來就不合格
   (`consumerctl.mjs:1573-1594` 直接標 `ordinarySyncEligible:false`)。

`new-snapshot-v2`(release-bound full snapshot)**對 WM 結構上不可達**:
`infra/governance/schemas/managed-repos.schema.json:231-250` 以 id 明列 WM 的合法 profile
集合且不含它;唯一指派它的程式是 repo 註冊,且註冊拒絕既有 repo(`consumerctl.mjs:320`)。

## 唯一支援路徑:六階段 reviewed bootstrap

`consumerctl` 家族:`plan-bootstrap` → `materialize-bootstrap` →
`check-bootstrap-materialization` → `check-bootstrap-readback` →
`plan-bootstrap-promotion` → `check-bootstrap-promotion`。
成功後 WM profile 進 `reviewed-bootstrap-established-v2`,之後才享有 ordinary sync。

### 前置(DS 端,必須先做)

`infra/governance/release-rings.json` 的 `candidateRelease` 目前是 `null`,
`consumerctl.mjs:1737` 因此 fail-closed。需由 **beta.113 的 release BOM bytes 推導**寫入
(不得手打),並把三個 assignment 的 `candidateReleaseDigest` / `enteredAt` 一併重設
(`model-validation.mjs:314-315` 會驗)。BOM 與 scaffold lock 由 GitHub Release 資產取得。

> 這裡有一個**治理設計缺口**:reviewed bootstrap 依賴 release-rings 的 candidate 記錄,
> 但 candidate-freeze 對 standard release 已 retired(`release-workflow.json` /
> `AGENTS.md`),標準發版不再產出該記錄。目前解法是由已發布的 immutable release 反推
> 填入(`infra/governance/README.md:338` rule 12 允許在 immutable BOM + live readback
> 完成後寫入)。**長期應讓 bootstrap 直接綁 published immutable release,移除對 ring
> candidate 的耦合**——否則每次 consumer bootstrap 都要人工補 ring。

### 輸入樹(三份)

- `--base`:template repo 的 beta.111 mirror commit(`db836e6`)
- `--incoming`:template repo 的 beta.113 mirror commit(`036894b`,已 merge)
- `--root`:WM clone 的工作分支

**必須用 template repo 的 mirror commit(151 檔已發布 scaffold),不可用 DS in-repo 的
`template/ds-product-template`(107 檔,非發布物)** —— 後者會產生刪光 `scripts/` 的假 plan。
`--incoming` 使用前必先以 `product-template-scaffold-lock.mjs --phase published --verify`
綁定 release 資產。

### 已知的 planner 限制(操作判斷點)

`plan-bootstrap` 以 base vs incoming 比對 consumer-owned 路徑
(`consumer-bootstrap.mjs:893-894`,忽略 current),而 `apps/**` 屬 consumer-owned 且
scaffold 的 `apps/template/package.json` 每次發版都變 → 永遠 `reviewReady:false`
(實跑:base111→incoming113 產生 4 個衝突;112→113 產生 3 個)。
`consumer-bootstrap.mjs:1130/1229` 在 `conflicts.length !== 0` 時硬拒 materialize。

驗證過的作法:把 `--base` / `--incoming` 限縮到 DS-owned 路徑集
(由 inventory 的 `ownershipPolicies['product-consumer']` 機械推導),落地位元組完全相同
(同樣 6 個檔案,來自已驗證的 beta.113 published scaffold),只是不讓 planner 報告那兩個
consumer-owned delta;該 delta 在同一個 PR 內手動對齊(版本號 + lock)。
**這是本程序唯一的操作判斷點**,列此供覆核。

## 完整逐步指令

完整指令(含 curl REST 取資產、每步 fail-closed 檢查、rollback)保存於本次 workflow
transcript:`subagents/workflows/wf_7869fd92-acb/journal.jsonl`(3 agents,實跑驗證)。
執行前重跑一次 `plan-bootstrap` 取得當下 planDigest,不得沿用舊 digest。

## 收尾條件

- WM PR 的 `Verify consumer` 綠
- WM protected main 的 `package-lock.json` 讀回 `0.1.0-beta.113`
- `managed-repos.json` 的 WM profile 進 `reviewed-bootstrap-established-v2`
  且 `acceptedBootstrapReadbackSha256` 有值
- DS `governance:check` 0 diagnostics
