<!-- Authority/status: governance/planning/registry.json -->
# 2026-07-31 全域殘項總帳(跨 session 續作 SSOT)

**為什麼有這份文件**:2026-07-31 session 做了一次 6 路平行 + 2 路對抗的全域盤點,結論不能只留在對話裡。
任何後續 session **先讀本檔**再決定做什麼,不要重新盤點(重盤一次約 130 萬 token)。

## 0-A. 交接狀態(2026-07-31 晚更新 — 接手者先讀這段)

**分支** `claude/remove-app-verdict-authz` = `5a039570`(已推送),PR #22 open,base = protected `main`。
**agent push 已打通**:token 在 `~/.config/qijenchen-governance/github-token`,git global credential helper
以 `x-access-token` + 該檔供給;`url.https://github.com/.insteadOf git@github.com:` 已設(SSH 走不通,
sandbox proxy 載不了 port 22)。**接手者不需要再要任何憑證**。

### 本 session 已修好並驗證(不要重做)
| 修了什麼 | 證據 |
|---|---|
| `Edit`/`MultiEdit` 全面被 provider hook 擋死 | `packages/governance/src/provider-hook-normalization.mjs` PreToolUse 改套 `postEventCarriesDeclaredTransport`(原本只有 PostToolUse 有);真因被 `:1414-1416` 的 `error.code \|\| 'MUTATION_INVALID'` fallback 吞掉 |
| `audit:workflow-security` TypeError 崩潰 | `scripts/audit-workflow-security.mjs` 用 `buildStepBlocks.slice(1)` 保住既有索引 + 新增第一 step 四條斷言 + 移除已失效的 job-level DOCKER_CONFIG 斷言;現 PASS(18 workflows) |
| managed-CI frozen job-key drift(連鎖 23 harness 測試) | `scripts/lib/managed-ci-trusted-execution-plan.mjs` job key 去 `'env'`、step 數 10→11、新增 `build.steps[0]` 斷言、四處 workflow digest 同步 |
| `governance:generate` 在 sandbox 內跑不動 | `scripts/lib/canonical-sync-transaction.mjs` 改 write-if-changed(`before === after` 即跳過 republish)+ 暫存區上層不可寫時退回 realpath 後的 OS temp。**現在 agent 可自行 generate,不需真人代跑** |
| `test:workflow-security` ambient-Docker 變異 fixture | 215 pass / 0 fail |
| workflow identity binding stale | `--propose` → `--apply-reviewed-proposal` 已同步 |
| 本機 0700 目錄被烤進 control-plane lock | `.github` 與 `ds-canonical/hooks` chmod 755 後重生;**接手者若要跑 generate,先確認這兩個目錄是 755,否則會再犯** |

### PR #22 目前 4 個紅燈(head `2fdadf58` 的觀測;`5a039570` 的結果需重查)
| 紅燈 | 失敗步驟 | 性質 / 下一步 |
|---|---|---|
| Verify(tsc + tests + compile + build) | `Fork-governance corpus + harness` | 該 step 跑 4 支,其中 3 支本機已 PASS;**未驗證的是 `npm run test:governance-harnesses`**(先前 23 fail 源於 job-key drift,已修但未本機重跑)→ 接手第一件事就跑它 |
| Packaging integrity | `ds-canonical freshness` | 已由 `5a039570` 的 0755 修正處理,需重查 |
| Publish Governance App verdict | `Mint check-only Governance App token` | 來自 **main** 的 governance-anchor.yml,需要從未設定的 `GOVERNANCE_CHECK_APP_ID/_PRIVATE_KEY`。PR #22 本身就是要拆掉這一層 → **merge 後自然消失,不需修** |
| Verify authority candidate without credentials | `Require independent authorization for all other privileged closure changes` | 同上,跑的是 **main** 版 `verify-privileged-change.mjs`。branch 版已於 `:831-841` 拆除(2026-07-29 user 拍板 3B)→ **merge 後消失** |

**判讀**:後兩個是「舊 main 擋新 PR」的循環,不是 code 壞。`mergeable_state = unstable`(不是 blocked),
且 live ruleset **沒有 required_status_checks**,所以技術上可 merge。是否在這兩紅下 merge 屬治理姿態,
user 2026-07-29 已拍板拆除該層,傾向直接 merge 並在 canonical 記明這兩個 check 從未是 required。

### 還沒做的(依序)
1. 跑 `npm run test:governance-harnesses`,修剩餘 fail
2. required_status_checks 尚未加進 `fleet/verified-main` ruleset(token 已有 Administration 權限,可用 API 設)
3. merge → 關 Genesis transition(獨立 PR)→ tag → **送 `stage-protected-release` repository_dispatch**(tag 本身不觸發任何東西,見 §「發版鏈」)
4. 下游:`release-finalize.yml` 是死鏈(下載 `release.yml` 不產出的 `npm-stage-*` artifact),template mirror 因此永不 fire;WM fanout 要跑 `consumerctl apply-fanout`
5. 本檔 §2 的 user 已拍板事項(FileViewer 焦點 / FilterPanel 兩個 prop / RTL 明確不做 / AccountMenu email 不做)尚未實作

## 0. 原始 P0 盤點(2026-07-31 早;上方 0-A 為最新狀態)

| # | 事項 | 狀態 | 證據 |
|---|---|---|---|
| P0-1 | **agent push 通道** | policy 已解、憑證未解 | `scripts/enable-agent-push.mjs` 已由 owner 執行(gh deny 移除、SSH_AUTH_SOCK 收回、view 重生)。但 gh token 存在 macOS Keychain(sandbox 擋,-67674),`~/.config/gh/hosts.yml` 內無 `oauth_token`;gh 自身過不了 sandbox TLS 代理(`x509: OSStatus -26276`)。git/curl 的 HTTPS 則實測可通。**唯一缺口 = 讓 token 落在 agent 讀得到的檔案** |
| P0-2 | **CI 兩顆 frozen baseline drift** | 未修 | `cd38f089` 在 `.github/workflows/build-managed-ci-executors.yml` 的 build job 前插了一個新 step,但兩支凍結基線沒同步:①`scripts/audit-workflow-security.mjs:534` 寫死 `buildSteps[6]`(位移後指到 `uses:` step → `literalRunBody` 回 null → TypeError 崩潰);連帶三組 run-body sha256 與 `buildSteps[2]/[3]` 斷言全部指錯。②`scripts/lib/managed-ci-trusted-execution-plan.mjs:1509` 凍結 job-key 清單仍含 `'env'`(該 job-level env 已搬進 step)→ fail-closed → 23 個 harness 測試連鎖紅 |
| P0-3 | **`Edit` 工具被自家 provider hook 擋死** | 未修 | 任何 `Edit` 都回 `GOV-PROVIDER-001: write mutation transport is invalid`;`Write` 正常。已排除:transport 匹配(唯一)、limits、checkpoint 逾時(397ms)、路徑 symlink(無)、corpus digest(Write 會過)。真因被 `packages/governance/src/provider-hook-normalization.mjs:1414-1416` 的 `error.code \|\| 'MUTATION_INVALID'` fallback 吞掉 → **先修 masking 才查得下去** |

**修復順序**:P0-2 →(commit)→ P0-1 補上憑證 → push → CI 收綠 → merge → 關 Genesis → tag → 發 beta.97 → 下游傳播。
P0-3 平行修(它讓大檔無法做外科式修改,目前只能用 `Write` 整檔覆寫)。

## 1. 已 commit、未 push 的成果(只存在本機,最高遺失風險)

分支 `claude/remove-app-verdict-authz` = `b16dd125`,origin 只到 `cd38f089`,差 3 個 commit:
- `24159cd9` WM findings F1-F9 收編 + 弱化 icon hover 一階收斂 + policy carve-out(**beta.97 版本 bump**,102 檔)
- `c1c5bfdc` sandbox 瀏覽器驗證抽成 canonical helper `scripts/lib/sandboxed-verify-browser.mjs`
- `b16dd125` control-plane 快照重生

下游 `work-management` 的 `codex/work-preview` 亦有 6 個 commit 未 push(含 `docs/upstream-findings-2026-07-30.md` F1-F9 回報包)。

## 2. user 已拍板(2026-07-31,不要再問)

| 題目 | 決定 |
|---|---|
| AccountMenu 是否顯示 email 第二行 | **不做** |
| FileViewer 開啟時焦點移入 viewer | **做**(`file-viewer.spec.md:373` 的 known a11y gap 收掉) |
| FilterPanel 開哪些 prop | **只開 i18n/labels + maxConditions**;條件數 helper 與 footer slot 等第二個 consumer |
| RTL 是否支援 | **明確不做** — 把 8 份 spec 的「未定」收斂成一處「不支援」canonical(chip:192 / tabs:234 / breadcrumb:220 / radio-group:114 / number-input:114 / field:344 / date-picker:319 / people-picker:257) |

**以下為同批授權的 AUTO 預設**(user 未反對即執行):Calendar 加 `today` prop;`resize-handle` 依 BulkActionBar 判例(`bulk-action-bar.spec.md:192`)把 `role="separator"` 降級成誠實形狀;其餘 8 處 spec 明文「未實作」的空 prop/variant 依 `data-table.tsx:317-318`(2026-07-13 D1 判例)收掉;a11y baseline 318 個非對比違規當真 bug 修;補 8 個零 scenario 元件的視覺防線;beta.97 視覺改動補截圖驗收。

## 3. 凍結型債務(最容易永遠沒人發現的一類)

| 項目 | 量化 | 證據 |
|---|---|---|
| a11y 慢性紅被凍進 baseline | 852 條指紋 / **5,436 個 violation**(color-contrast 5,118;**非對比類 318**:label 83 / button-name 82 / aria-required-children 69 / aria-required-parent 36 / aria-progressbar-name 21) | `infra/governance/baseline/a11y-baseline.json`,gate 語意「只 fail 新增」→ 永遠不會紅 |
| 視覺防線只覆蓋約一成 | 113 條 scenario / 56 元件;**8 個元件 0 scenario**:Command、DateGrid、HoverCard、Menu、Notice、OverflowIndicator、SelectMenu、SelectionControl | `.github/workflows/visual-regression.yml:6-7` 自陳;`scripts/visual-assertions.json` |
| aspirational-wiring 稽核未掃完且對治理隱形 | 521 claims 中 chunks 33/40-43 + ~120 adversarial 未跑;~50 條二次驗證未跑 | `.claude/logs/aspirational-wiring-findings.json`(住在 non-authority 路徑,不在 registry → 依 registry 的盤點必漏) |
| i18n 紙防線 | 基礎設施標 shipped 但 **0 元件消費**;60 處 `i18n-allow` 硬寫中文 | `packages/design-system/src/lib/i18n/README.md` |
| code-quality escape 從未清算 | 110 處 `code-quality-allow` / 31 `as any` / 21 `as unknown as` / 17 `eslint-disable`,無到期複查 | `packages/design-system/src` |

## 4. 治理預算與一致性

- **hook 60/60 頂到 hard cap**(soft 26),再加一支即 BLOCKER;`session_start_governance_check.sh` Check 7 註解仍寫「現值 52 + 8 headroom」= 已 stale。`/knowledge-prune` 需 hook-fire telemetry,而 telemetry opt-in 未開(`GOVERNANCE_TELEMETRY_OPT_IN` 無 repo-owned 開關)→ 兩者互卡。
- `design-system-audit/SKILL.md` 388 行(budget 250),生成版 400 行 = 貼死 transition cap,等於該 skill 目前唯讀。
- `meta-patterns.md:24` 寫「20 canonical skills」,實際 25,且不在 `sync-governance-counters.mjs` 同步範圍。
- `.claude/logs` 502 檔 / 64MB 被 commit 進 repo,而 `.claude` 在 `protected-root-classification.json` 標為 non-authority-exclusion。
- **文件狀態 stale**(會製造假的待拍板關卡):`registry.json:14` 把 overlay-motion-tokens 標 `awaiting-approval`,但六個 token 已在 `motion.css:36-41` 上線發版、`motion.spec.md:100` 自稱 user 拍板;`r4-bodymaxheight-stepping.md` / `cell-indicator-ssot-rfc.md` / `2026-06-05-storybook-category-taxonomy-rfc.md` 的 header 狀態同樣落後於實作。

## 5. 外部啟用(需 owner,非工程可代理)

`infra/governance/external-activation-requirements.json` 21 項全 `not-activated`、evidence 全 null;`governance:activation-readiness` exit 2 / 8 個 BLOCK。
`scripts/governance-build-graph.json` 的 `controlPlaneGenesisTransition.state = "open"` / `releaseAllowed = false` → **即使 CI 全綠、commit 全 push,beta.97 仍發不出去**,必須先用一個獨立的受保護 PR 關掉 Genesis transition。
真實雙 provider model certification(`review-capability-certifications.json.certifications = []`)與 fleet rollout + 72h soak 亦未開始 → 任何「已獨立審查 / promotion eligible」宣稱目前都不成立。

## 6. 本 session 的流程教訓(避免重蹈)

1. **先實測再把事情丟回 user**。本 session 三次要求 user 跑指令,其中兩次(`git checkout -- .claude/`、放行一條 deny)在實測後證明不必要或方向錯誤。
2. **先找既有機制再發明**。`scripts/enable-agent-push.mjs` 的診斷與腳本在上一個 session 就寫好了,本 session 卻從零重新推導一遍才發現它躺在 `/tmp` 暫存 clone 裡(現已進版控)。
3. **sandbox 讀取是 deny-only**(只擋名單上那幾條),不是 allow-only — 誤判這點導致提出多餘的政策變更。

相關:`governance/memory/project_provider_neutral_governance.md`、`governance/memory/feedback_solo_dev_workflow.md`。
