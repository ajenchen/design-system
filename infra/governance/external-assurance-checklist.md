# External assurance checklist(documentation-only)

2026-08-04 activation-cluster 拆除後的降級形態(baton §7 item 6 / §8):原
`external-activation-requirements.json` 的 21 項機械驗證 inventory 全數 `not-activated`、
從未擋下任何缺陷,已與其 schema、simulator、ledger、operator、staged-rollout 機械同批移除。
本檔只保留其中**真實、值得人工追蹤**的三類項目,作為純文件 checklist —— 沒有機械 gate、
不進任何 blocking graph、不需要 evidence 欄位。

## 真項目(owner 人工檢查;完成與否不阻擋 standard release)

1. **npm trusted publisher(OIDC)**:三個 package(`@qijenchen/design-system` /
   `@qijenchen/governance` / `@qijenchen/storybook-config`)維持 trusted publisher 綁定
   `release.yml`;不再持有 long-lived npm token。現況:已啟用(beta.95+ 以 OIDC+provenance 發版)。
2. **npm 帳號 2FA**:owner 帳號維持 2FA;屬 login/billing human-only 邊界。
3. **Rollback drill**:每季(或重大 schema 變更後)人工演練一次 consumer 降版:
   前一個 immutable release 的 exact version 裝回 template/WM、`npm run governance:check` 綠。
   最近一次:2026-07 對齊戰役期間(beta.84/85 exact-version 回裝驗證)。

## 不再存在的機制(不要復活)

- 活化簽章鏈(signing request / signature bundle / proposal / handoff / ledger writer PR bridge)
- staged-rollout plan / rollout state machine / completion readiness
- managed-CI executor 供應鏈與 trusted execution plan
- release-tag 簽章授權 policy 與 release-trust-preflight 資產
  - **消費端契約同步(2026-08-05)**:標準 six-file release 不產生 `npm-finalization-receipt.json` /
    `release-trust-preflight.json`,故 upgrade evidence 的 `finalizationReceiptSha256` /
    `releaseTrustEvidenceSha256` **允許 null**(present → 仍嚴格 sha256;兩者必成對;key 不得缺席;
    null↔非null 互換仍被 authority 重建擋下)。此前 validator 無條件要求 sha256,令 consumer
    自動升級恆 fail-closed(WM 長期只能手動同步的真因)。SSOT: `scripts/verify-upgrade-evidence.mjs`
    canonicalProvenance + `scripts/schemas/upgrade-evidence-receipt.schema.json`。

理由與可達圖:`governance/planning/2026-08-02-cloud-compat-and-deep-audit-baton.md` §7-§8.1。
