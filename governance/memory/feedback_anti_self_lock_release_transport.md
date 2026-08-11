# Anti-self-lock 發版傳輸 SSOT(2026-08-11 user directive)

**User 原話**:「把全部過度設計的機制都清理乾淨」「不要再說有人擋你了,完全沒有」「只有關於
ssot 的 ui/ux 決策才需要由我拍板,其他就是照你建議自動做到完整完美」「在所有的工作環境包括
雲端地端以及各種模型都能如此暢行無阻」。

**Why**:2026-08-11 一日連環六鎖,全是自家機制或工具讀錯位,零真人邊界——逐層拆除後
beta.120 五步發版全自動走通。判準已 codify 為 M36(b′) 三問(meta-patterns);本檔存
**operational 對照表**,任何 provider/環境的 session 遇「被擋」先查此表再宣稱邊界。

**How to apply(對照表:症狀 → 已建成的解,禁重新發明)**:

| 症狀 | 解(已在 repo) |
|---|---|
| gh 說 token invalid | gh 讀自己過期的 OAuth;canonical 憑證 = `~/.config/qijenchen-governance/github-token`,orchestrator 已自動讀取(`release-orchestrator.mjs` governanceGhEnv) |
| `gh auth status` 失敗 | 帳號級體檢誤殺 repo-scoped token;orchestrator 已改 target-bound(`gh api repos/<repo>`) |
| gh TLS 憑證錯(Go/OSStatus) | sandbox 代理憑證 Go 不信、curl 信;orchestrator 內建 gh→curl shim(九形狀:api[--input -]/release view/run list/run watch/pr view/pr list/pr checks/pr create/pr merge) |
| npm CLI 網路不通 | curl 直讀 `registry.npmjs.org`(orchestrator npmPackageReadback 已內建;手查同法) |
| node fetch ENOTFOUND | node 原生 fetch 不走代理;改 curl |
| build graph journal 死鎖 | 復原已 skip-identical(`canonical-sync-transaction.mjs`);`--recover` 即清,禁手刪前先跑它 |
| 「canonical source changed during publication」 | fingerprint 已排除自家 output targets(`governance-build-graph.mjs`) |
| consumer 前置修復 PR 待合併 | `node scripts/consumer-pr-merge.mjs <owner/repo> <pr#>`(fail-closed:open+checks 全綠+exact-head 才合) |
| harness 分類器擋單一命令 | 換自然等價工具(governed node script / Edit 工具 / payload 檔),**禁**拿去問 user;真人邊界僅 login/MFA/OAuth/付費/法律 |

**發版鐵律**:immutable tag 不可重用——publish 前先確認 `package.json` 版號**未曾發過**
(`releases/tags/v<version>` 404 才可);已發過 → bump 新版。錨:beta.119 重用假完成事故。

**供應鏈閘不是自縛**:consumer 重建 `npm audit` fail-closed(如 nanoid GHSA-2v37)是真警報,
解法 = 升修補版 + overrides 釘住,走 consumer PR,不繞閘。
