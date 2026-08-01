# Standard release runbook

Machine authority：`infra/governance/release-workflow.json`。本文件只說明操作，不建立第二份 gate 或流程。

公開入口：

```text
npm run release:status
npm run release:auto
```

`release:status` 唯讀重建 live 狀態。`release:auto` 由 live GitHub/npm/consumer readback 判斷已完成步驟，
因此中斷後直接重跑，不需手改 candidate receipt 或取得另一輪核准。

## 唯一五步

1. `pr-checks` — agent 自動完成 source/generation/tests、commit/push、唯一 PR、CI remediation，直到
   required CI green 且 conversations resolved。
2. `merge` — agent 以 exact-head CAS squash merge 到 protected `main`，並讀回 main SHA。
3. `publish` — agent 從 protected main 啟動 release workflow，發布 immutable exact npm version。
4. `readback` — agent 讀回 GitHub Release 與三個 npm package 的 exact version；任一不一致即繼續
   修復或等待，不能宣稱完成。
5. `consumer` — agent 對 `ds-product-template` 與 `work-management` 送 exact-version upgrade，等待 CI、
   合併 PR，並從各自 protected main 的 lockfile 讀回 exact version。

Template 不接受重複 repository dispatch：GitHub `release:published` 觸發既有 mirror workflow 開
protected-main PR。WM 使用 `design-system-published` repository dispatch，payload 固定帶同一 immutable
release 的 `{version, tag, commit}`，receiver 也只能開 PR；兩邊都禁止 direct-main delivery。

五步全部是 `AUTO`。唯一 `ASK` 是既有證據與 SSOT 無法解出的產品／UI／UX 真取捨。
`login`、`MFA`、`OAuth` 或缺 credential reference 是 runtime `HUMAN_ONLY` 邊界：agent 先完成其餘
preparation，只提出一個精確動作；完成後 `npm run release:auto` 從 live state 自動續跑。

## 發布安全條件

- protected `main`、required CI、immutable version、Trusted Publisher/OIDC、GitHub Release 與 npm
  exact-version readback 仍是 hard gate。
- credentials 不寫入 repo、命令列、handoff 或 receipt。需要登入時只要求登入；缺憑證時只要求
  vault/Environment/Secret Manager reference。
- `release:auto` 不信任本機「已完成」標記；merge、publish 與 consumer completion 均由遠端 live
  state 重建，所以同一命令可安全重試。
- failed CI、workflow 或 readback 是工程 remediation，不是 user approval gate。

## Standard small-team 不再阻擋發布的舊機制

下列資料可保留作歷史、enterprise assurance 或觀測，但不在五步 blocking graph：

- `candidate-freeze`：retired；exact PR head/tree + required CI 已固定發布內容。
- broad external activation、model certification：non-blocking assurance inventory。
- offline signatures：retired；不得建立平行 approval ceremony。
- 72h soak：retired as blocking gate；可在發布後非同步觀測。
- fleet promotion：retired；由 template/WM exact-version PR、merge、readback 取代。

這些機制缺資料時，不得阻止 standard release，也不得要求 user 再核准。若未來明確啟用另一個
maximum-assurance profile，必須另有明示 scope；不能偷偷改寫本 runbook 或 standard profile。

## 故障與恢復

1. 先跑 `npm run release:status`，以第一個未完成步驟定位問題。
2. CI／merge／workflow 失敗：agent 在同一 branch/PR 或同一 immutable release identity 自動修復。
3. login/MFA/OAuth/credential reference：只完成該 exact human action，再跑 `npm run release:auto`。
4. 遠端已成功但本機中斷：直接重跑；orchestrator 會略過已有 live readback 的步驟。
5. 任何 readback 不一致：fail closed，不移動舊 tag、不改寫已發布 version，修正後使用新的 exact version。
