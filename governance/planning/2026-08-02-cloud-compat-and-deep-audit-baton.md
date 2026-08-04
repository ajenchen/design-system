<!-- Authority/status: governance/planning/registry.json -->
# 2026-08-02 雲端相容性修復 + Deep Audit 收尾 baton

**接手者先讀 §1,再依 §3 順序執行。** 本檔是 2026-08-02 一次 6 路平行稽核(+2 路對抗)的結論,
證據已收斂到 canonical owner;**不要重跑全域盤點**。

## §0-DONE 2026-08-04 已完成(本 branch `claude/cloud-compat-baton`)

| 項目 | 狀態 | 驗證 |
|---|---|---|
| RC-1 sandbox:`enableWeakerNestedSandbox` false→true(5 個鎖點同步) | ✅ 已改 | policy 測試 PASS、managed-host 測試 PASS |
| RC-2 入口 raw crash:`run-provider-hook.mjs:39` 改惰性 memoized | ✅ 已改 | `TMPDIR=/nonexistent` 實測由 raw crash 轉 fail-open |
| RC-3(部分)BSD-only:`session_start_governance_check.sh:132,159` | ✅ 已改 | 照 `stop_passive_logging.sh:181` 既有可攜寫法;`bash -n` PASS |
| cite 判準過窄:`check_propose_discipline.sh` 擴含 mjs/sh/yml/md/URL | ✅ 已改 | 6 組樣本實測:治理碼/CI/hook/官方 URL 全認得,空話仍被擋 |
| **新增 Validator M**:coverage verdict 誠實性 | ✅ 已加 | 沉默版 exit 2 帶 [M];加「CLOSED AS INCOMPLETE」後 [M] 消失 |
| 本檔登記進 `governance/planning/registry.json` | ✅ active/executable | `Planning registry PASS: 38 documents, 1 active` |
| **RC-1 第 6 個鎖點**:`template/ds-product-template/.claude/settings.json:268` false→true | ✅ 已改 | 該檔是 canonical-source(非生成物),`governance:generate` 不會碰它 → 原本會靜默漂移,讓每個新 fork 的雲端 session 照樣崩 |
| 新增 template↔policy sandbox parity 斷言 | ✅ 已加 | `test-fork-governance.mjs` 5c-bis;正控 PASS、注入 `false` 負控正確 ❌;整套 harness PASS |
| Validator M 三個實測缺陷修正 | ✅ 已修 | (a) pipefail 疊字 → 實測 `unknownunknown` 變 `unknown`;(b) 誠實 marker 收緊 → 偽報告「全部通過,無未通過項」不再蒙混;(c) dim 閘加 `維度 N` → 中文報告不再整組跳過 |
| **Validator M v2**(2026-08-04 Fable 對抗複核抓出 4 條繞道後再修) | ✅ 已修 | (1) 數字形式要求非零 —「0 個未通過」原本讀起來是全過卻能匹配認帳;(2) 移除可被引用蒙混的機器欄位拼法(引用上輪 `coverageStatus=incomplete` 於通過語句中原可過關);(3) dim 計數補 `第N維`/`DN` 記號(單一記號寫報告原可讓整個 validator 家族跳過);(4) 檔名閘擴 `*final-report*.md` 等泛型;(5) active-run 存在守衛 — 無 deep-audit run 時不再逼所有大型報告寫假認帳,unknown(機械故障)與 incomplete(真未通過)分流,unknown 的指示是「修 verifier」而非「認錯」;(6) 正則全改 byte-stable group 形式,C locale 下不再失效;(7) BLOCK banner 補列 M。**已知殘留**:改檔名繞過 filename 閘在 PostToolUse 層無法完全封閉,已記錄 |
| cite 判準 URL 分支加 negative-list | ✅ 已修 | 原本任何 URL 都算 cite,而 solo workflow 每則 reply 都帶 preview 連結 = 這道檢查對它該管的 reply 全失效。4 組樣本實測:純 preview BLOCKED、真文件 URL 放行、混合行不誤殺。**v2(Fable 複核後)**:改 host-anchored — 路徑/fragment 含 "localhost" 的正常文件 URL 不再被誤殺;補列 `ajenchen.github.io`(自家部署的 Storybook 是 deploy 產物非出處,原可當 cite 蒙混) |
| session_start BSD date 分支補 `-u` | ✅ 已修 | 既有缺陷(非本批引入):macOS 把 UTC 時間戳當本地時間解,實測 −8h 偏移,24h 窗邊界誤判;一字修正 `date -j -u -f` |
| **npm advisory 新 CVE 應變**(與本批無關的獨立事件,2026-08-04 landed) | ✅ 已修 | 這波 advisory 讓 CI 三 job 全紅(任何 PR 都會)。處置分四類:(1) **brace-expansion**(GHSA-rgw5-rvv9-x895 `<5.0.9`,連鎖重算 43 個 high)→ 真升級:overlay 別名 + 頂層 lock + template 全升 5.0.9,常數/pathPattern/五個測試 fixture 同步;(2) **fast-uri**(自家樹)→ 真升級 3.1.5,finding 消失;(3) **ip-address**(high)與 **undici**(moderate)→ 都在 npm 11.19.0 **內建**副本裡,11.x 無修復版、overlay 機械只有雙槽 → 以精確形狀認列(任何漂移 fail-closed),comment 白紙黑字寫明「磁碟未修」;(4) tar/npm 兩個既有 pin 實測形狀未變,不動。驗證:真實 live audit JSON 餵新斷言 LIVE PASS(effectiveHigh 0);受影響 5 套測試 fixture 全綠。**Backlog(次優先,獨立 branch)**:overlay 機械擴槽(ip-address 10.4.0 / undici 6.28.0 修復版都存在)或 npm 12 bump,擇一把「認列」升級為「真修」 |
| **Linux CI job `hooks-linux`** | ✅ 已加 | `ci.yml`;60 支 shell hook 過去從未在 Linux 跑過(BSD bug 正是這樣流到雲端);`ci-workflow-scope` / `workflow-identity-sync` / `release-workflow` / `audit-workflow-security` 全 PASS |
| `hooks:test` 改指 canonical | ✅ 已修 | 原指 `.claude/hooks/tests/`(生成視圖),runner 自己的 usage 註解寫的就是 canonical 路徑 |

**✅ 牆已於 2026-08-04 拆除(本 branch 後半段執行)**。歷史脈絡:`.claude/settings.json` 與
`.claude/hooks/**` 在 agent sandbox 唯讀,pre-commit 的 `governance:generate` 要重生 229 個鏡像
→ 每次治理改動都要人類在沙箱外跑一次 generate。`enableWeakerNestedSandbox` 那次因為字面上就是
調鬆沙箱,由 user 沙箱外執行是正確的(agent 不得改自己的護欄;git worktree 繞道已明確否決)。
但鏡像本身無執行期消費者,牆的其餘 fire 全是自傷 → 依下方「架構層的根本解」整套執行完畢:
- 鏡像退役:229 檔自 git index 移除 + `.gitignore` 防回流;`repositoryManagedTrees.hooks` 自
  provider registry 移除;harness inventory `generatedMirrors` 改為必空(schema `maxItems: 0`,
  重新引入需改 schema);plugin `hooks/scripts` alias 改 `canonicalRoot` kind 直指 canonical corpus
- **Index 權威原則**(同一條原則落三處):sync-plugin-aliases 的 exact check、
  repository-hygiene R3、authority transaction 的 symlink publish —— 工作樹因唯讀而過期、
  但 git index 已持有正確 after-image 時視為已收斂;真漂移(index 缺席或不符)仍 fail-closed
- alias generator 支援 registry 驅動的原子 retarget(temp + rename,永無缺席窗口;
  拒絕覆蓋使用者一般檔案的安全線不變)
- **實證**:`governance:generate` + `governance:check` 於沙箱內完整通過(exit 0),
  commit 不再需要任何沙箱外動作。`.claude/settings.json`/`skills`/`commands`/`agents`
  仍是唯讀生成物,但 settings 極少變動、skills/commands/agents 是 Claude Code 原生 discovery
  真消費者(不可拆),其變動頻率遠低於 hooks
- **第一次 retarget commit 出過一個真 bug(獨立稽核 + CI 各自抓到,已修)**:pre-commit 的
  `stageOutputs` 在 publish 之後從工作樹 `git add` outputs,把 index 手術過的 symlink 蓋回舊指向
  → commit 進去的 blob 是 `../.claude/hooks`(所以「下次 checkout 自癒」的說法當時是錯的 ——
  committed blob 本身就舊)。修法:transaction 回報 index-authoritative symlink 清單,
  precommit 在 stageOutputs 之後逐一還原 index entry(`governance-build-graph.mjs` precommit 段)。
  CI fresh checkout 的 `plugin-aliases check` 紅燈是這顆 bug 的機械證據,fail-closed 正常運作

**架構層的根本解(已執行,上述為執行記錄;以下保留原始分析)**:
runtime 根本不讀 `.claude/hooks/**` ——
`packages/governance/canonical/providers.json` 的 `canonical.roots.hooks` 指向
`packages/design-system/ds-canonical/hooks`,dispatcher(`run-provider-hook.mjs:1655`)從那裡取。
全 repo 搜尋 `.claude/hooks` 的非生成引用,零執行期消費者;
`scripts/build-published-template-mirror.mjs:352-364` 反而會在 mirror 含 `.claude/hooks` 時**報錯**,
`infra/governance/protected-root-classification.json:95` 把 template 的 `.claude/hooks` 列為必須缺席的
tombstone。也就是 template 與 fork 早已遷移到 provider-neutral launcher,**只有 DS repo 自己還揹著
這 229 個純鏡像**,而它們唯一的作用就是讓 drift check 有東西可比 —— 也正是每次治理改動都要人類
介入的原因。拆掉即永久消除這道牆(`.claude/settings.json` 單檔留著,極少變動)。
**拆除範圍(2026-08-04 Fable 複核校正 — 不是只刪檔,五處登記要一起動)**:
(a) `packages/governance/canonical/providers.json` claude adapter 的 `repositoryManagedTrees.hooks`
(不改則 generate 會把鏡像生回來);(b) `infra/governance/lib/harness-source-inventory.mjs` 的
mirror test root + schema const `.claude/hooks/tests` + 生成的 providers/harness-source-inventory.json;
(c) `infra/governance/lib/managed-host-assurance.mjs` 的 plugin bundle 把 `.claude/hooks` 打進
digest(+ 其測試以 repo `.claude/hooks` 建 fixture);(d) `harness-source-inventory.test.mjs`;
(e) `.claude/settings.json` 的 16 條 hook command 已驗證全走 `run-provider-hook.mjs`、
零條直指 `.claude/hooks/*.sh` — 執行期零消費者這點成立,動的全是登記面。仍是純工程 AUTO。
**RC-1 誠實註記(Fable 複核 C8)**:`enableWeakerNestedSandbox` 的官方語意是「容器內 bwrap 不能
mount 新 /proc 的退路」,前提是雲端 image 有 bwrap+socat;若 image 根本沒有 bwrap,
`failIfUnavailable: true` 依然硬失敗。repo 內無法證明雲端 image 有無 bwrap ——
**本批是嚴格改善(最壞情況 = 維持原狀),真正的證明是 merge 後第一個雲端 session 的實測**;
若仍崩,下一步是 §3 step 1-2 的 tier 分層(hard gate 移到不旅行的 user tier),已寫好待執行。

**§3 尚未執行的**:step 4 的 jq/perl 工具宣告與守衛(57 支 hook 依賴 jq、僅 1 處守衛)。
step 5 已複驗為**已收斂,直接劃掉**(見下)。step 6 的 Linux CI 覆蓋**已完成**(見上表)。

**step 4 為何刻意延後**:它要改 `run-provider-hook.mjs` —— 所有 hook 的唯一入口。而 macOS 的
`mktemp -d` 不吃 `TMPDIR`、固定用 `/var/folders`(沙箱擋住),所以 hook 測試套件在受限沙箱裡
**結構上跑不起來**(實測)。高風險改動 + 無本機驗證能力 = 不該出貨。正確順序是先讓
`hooks-linux` job 落地拿到驗證能力,下一個 PR 再改 —— 這是排序,不是省工。
step 5 的精確實情(2026-08-04 複驗):真正重複的是 `hooks/hooks.json:78,166` 的字串字面
與 `scripts/lib/provider-hook-output-transport.mjs:54` 的常數;
`scripts/test-provider-hook-output-transport.mjs:156` 是測試釘值(合理,不算重複);
`packages/governance/src/closed-tool-execution.mjs:58` 是 **gh 候選路徑**,與該 PATH 是不同概念,
**不得合併**。

## §0 為什麼停在這裡

Claude session 額度用盡(3%)。判斷:以殘餘額度動 materializer/schema 會留下半套改動,
同時弄壞本機與雲端,比只壞雲端更糟。故只留交接、不動 code。
本檔寫於 branch `claude/cloud-compat-baton`,**尚未 commit**(接手者請先 commit 再開工)。

## §1 現況一句話

`main` CI 全綠、beta.108 已 immutable 發版上 npm、DS 與 WM 兩 repo 同步、open PR 0。
**唯一在流血的是 Claude Code cloud:session 一初始化就崩,完全不能用。**
Deep Audit 的 64/66 則是「結構上補不了」,不是沒做完(見 §4)。

## §2 雲端崩潰的三個獨立 root cause

### RC-1(BLOCKER)sandbox hard gate 放在「會旅行到雲端」的那一層
- `failIfUnavailable: true` 有 4 份 byte-identical 副本:
  `packages/design-system/ds-canonical/adapters/claude-settings-base.json:100`(canonical)→
  `.claude/settings.json:100` → `template/ds-product-template/.claude/settings.json:84` →
  `packages/design-system/ds-canonical/fork/providers/claude/hook-config.json:84`。
  → **所有 fork consumer 的雲端 session 會以同樣方式崩。**
- 被 schema 鎖死不可覆蓋:`scripts/schemas/claude-permission-policy.schema.json:53` 為
  `"failIfUnavailable": { "const": true }`;`scripts/lib/claude-permission-policy.mjs:208`
  不等於 true 即 throw。
- 官方語意(Claude Code sandboxing / settings 文件;repo 內無對應 SSOT,依據為外部官方文件):
  `failIfUnavailable: true` 把「sandbox 起不來」從 warning+降級變成 **hard failure**;
  Linux sandbox 需 bubblewrap + socat;`enableWeakerNestedSandbox: true` 正是為
  「容器內 bwrap 無法 mount 新的 /proc」設計的退路。雲端是 Ubuntu 24.04 容器 → 命中。
- **回歸窗口已定位**:beta.70 時代雲端全通的 commit `81912f8d`,其 `.claude/settings.json`
  只有 `permissions.allow` + `hooks`,**沒有 sandbox 段**;sandbox 是 `e21f5395`(07-27) 與
  `69604635`(07-28) 加入的。

### RC-2(BLOCKER)入口在 fail-open 保護註冊之前就 raw crash
- `scripts/run-provider-hook.mjs:39` 於**模組頂層**呼叫 `resolveClosedPrivateRuntimeBase()`,
  例外完全繞過 fail-open → node 直接非零退出。TMPDIR 不可寫/不安全時即觸發。
- `scripts/run-provider-hook.mjs:1759` 的 `runClosedGit()` 落在 try 之外;Linux git 路徑是
  **單一硬編碼 `/usr/bin/git`** 且要求非 symlink。
- 放大器:子行程 exit code 只接受 0/2,任何 1/70/127 會讓**整個 group 的所有 hook** 一起跳過;
  exit 0 但寫了 stderr 也判 integrity failure(環境雜訊即可觸發)。

### RC-3(DEGRADED,範圍最大)未宣告的雲端硬前提
- 66 支 canonical hook 中 **57 支直接呼叫 `jq`**,全 repo 僅 1 處存在性守衛。
- 另有 4 支依賴 `perl`,而封閉工具清單裡沒有 perl。
- 缺任一直譯器 → 治理**靜默消失**(不是報錯)→ 雲端「看起來有治理,其實沒有」。
- 60 支 shell hook + 95 支 hook 測試**從未在 Linux 上跑過一次**,雲端品質零機械證據。
- BSD-only 用法:`session_start_governance_check.sh` 的 `stat -f '%m'` 與 `date -j -f`。

## §3 執行順序(每步標「保留了什麼」)

> **SSOT 原則**:修法必須消費既有契約,不要發明新概念。
> `infra/governance/providers/compatibility-matrix.json:135-145` 已宣告雲端
> `execution: fresh-container`、`repoConfigTravels: true`、`userConfigTravels: false`,
> `:143` 宣告 `nativeHookPolicy: environment-dependent-feedback-only`。
> 這就是「哪些設定會旅行到雲端」的 SSOT,直接讀它。

1. **先裝 user-tier hard gate,再從 repo tier 移除**(順序不可反)
   本機實測 `/Library/Application Support/ClaudeCode/` 不存在、`~/.claude/settings.json` 無 sandbox 段
   → managed tier 根本沒安裝。先把 `failIfUnavailable: true` 放進 `~/.claude/settings.json`
   (user tier 同樣被 honored,且 `userConfigTravels: false` 不會旅行到雲端),**再**動 repo tier。
   否則會出現「repo 拿掉了、managed 還沒裝」的空窗。
   *保留*:本機 hard gate 不減弱,反而升到優先度更高的層。

2. **materializer 依 tier 投影**(canonical 仍單一份,SSOT 不分裂)
   owner:`scripts/lib/claude-permission-policy.mjs:293` `materializeClaudeSandbox`(現為
   `cloneJson(policy.sandbox)` 一份到底)與 `:349` `assertClaudePermissionMaterialization`
   (現機械強制兩 tier byte-identical)。改成 repo-portable / host-managed 兩個 profile,
   判準讀 compatibility-matrix,不要另寫平台判斷。
   同步 `scripts/schemas/claude-permission-policy.schema.json:40,53` 拆成兩個 closed 子物件。
   *保留*:雲端 hooks 照 fire、`permissions.deny`(`Read(~/.ssh/**)`、`Read(./.env)`、
   force-push/reset/unpublish/bypass 全禁)、`permissions.ask`、`disableBypassPermissionsMode`
   全部繼續生效——這些都不經過 sandbox 子系統。
   *損失*:巢狀 bwrap 的 process/FS/network 隔離。
   *等價替代*:雲端 fresh-container 本身提供隔離;hard gate 依 `:143` 落在 protected CI。
   **雲端從來沒真正拿到過 bwrap 隔離,它只拿到一個死掉的 session——這不是打折。**

3. **修 RC-2**:把 `run-provider-hook.mjs:39` 的 eager 呼叫移進 fail-open 保護範圍;
   `:1759` `runClosedGit()` 納入 try;Linux git 改候選清單(對照 `closed-tool-execution.mjs:56-70`
   既有的 darwin/linux 候選結構)。
   *保留*:fail-open 語意不變,只是讓它真的涵蓋入口。

4. **修 RC-3**:把 `jq`/`perl`/`python3` 納入封閉工具宣告並加存在性守衛;缺工具時要
   **明確 fail 或明確標記治理未執行**,禁止靜默跳過。修 BSD-only 的 `stat -f`/`date -j`。
   *保留*:把「靜默假綠」換成「誠實標記」,是品質提升不是降低。

5. **收 SSOT 缺口**:那串 PATH(`…/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin`)排除生成視圖後
   仍有 4 個非生成 owner:`hooks/hooks.json`、`packages/governance/src/closed-tool-execution.mjs`、
   `scripts/lib/provider-hook-output-transport.mjs`、`scripts/test-provider-hook-output-transport.mjs`。
   收斂成單一住所。**注意**:`closed-tool-execution.mjs:56-70` 的 darwin/linux 分開列候選是
   **正確的平台差異,不是重複**,不要合併。

6. **加 Linux CI 覆蓋**:60 支 shell hook + 95 支測試從未在 Linux 跑過。補一條 Linux job,
   否則雲端品質永遠沒有機械證據。

7. **順手修 cite regex**:`packages/design-system/ds-canonical/hooks/check_propose_discipline.sh:119`
   只認 `.spec.md|css|tsx|ts|json` + `#L42|L42|line 42`,不認 `.mjs|.yml|.sh` 也不認外部官方文件 URL。
   本 session 兩次因引用治理程式碼/官方文件被誤擋。根因同類:**判準比意圖窄**。

8. 全部改完跑 `npm run governance:generate` + `npm run governance:check` 重生三份 provider view。

## §4 Deep Audit 收尾(與雲端無關,可平行)

**64/66 補不了是結構性的,不是沒做完。三重鎖死:**
1. beta.108 已 immutable(GitHub API 實測 `immutable=true`,beta.107/106 為 false)。
2. `infra/governance/release-workflow.json:15` `maximumFinalReleasesPerAudit: 1`,`:16-19` 只允許
   `post-publish-blocker`/`security-incident` 追加發版;`scripts/release-orchestrator.mjs:76-98` 硬驗。
   → **發 beta109 補件本身就是 canonical 禁止的行為。**
3. `scripts/lib/standard-ci-evidence.mjs:110` 要求 `protectedMain.head === release.commit`,
   但 PR #38 合入後 main 已離開 `70a56cc1` → 程式上永久不可能重現。

**根因已修好**:WM `#37 bind receiver check to Actions run` + DS `#38 close beta108 audit contract gap`
→ 下一輪有實質內容的 release,64/66 會自然可觀測。

**Codex 的「CLOSED AS INCOMPLETE; THIS IS NOT A PASS」是正確收尾**
(`governance/planning/2026-08-02-deep-audit-beta107-baton.md:4-7`),符合 `SKILL.md:186`
「未掛載外部 surface = UNOBSERVED,不得冒充完成」。

**但有三件它沒說明的**:
- compliance 維度另有 2 個 trust downgrade(waived self-review
  `scripts/verify-deep-audit-coverage.mjs:325-331`、dim 83 UNOBSERVED `:338-340`)
  → **即使 64/66 補齊,`promotionEligible` 仍是 `false`**。
- `.git/governance-runtime/evidence/deep-audit/runs/` **0 個檔案**(同層 visual/release/
  authority-decision 都在)→ baton 宣稱的 deterministic/hook complete **無法獨立覆核**;
  `scripts/verify-deep-audit-coverage.mjs:359` 以 `loadActiveDeepAuditRun({ requireCurrent: true })`
  讀 run manifest,現在任何回頭驗證都 fail closed。
- 這次 run 走 machine evidence-contract,沒產生 `audit-report-*.json`/`C1-final-report*.md`,
  而 report-validator 只在寫這些檔時 fire → **它結構上根本沒被觸發過**。
  且 Validator L(`packages/design-system/ds-canonical/hooks/check_audit_post_report_validator.sh:263-289`)
  只驗三段回執字串存在,**沒驗 `coverageStatus` 是否 complete** → 這就是「未通過」能寫進報告
  卻不被機械擋下的原因。**已補:Validator M**(見 §0-DONE)。

**2026-08-04 獨立複驗補記**:
- 舊結案文件寫「保留了兩個有效 run」,但 `runs/` 現在是 0 個檔案 —— **兩者矛盾**,何時、被誰刪
  無法證實。記在這裡,避免這個矛盾被靜默吞掉。仍可獨立覆核的是 GitHub 側事實(公開 API 實測
  `v0.1.0-beta.108` `immutable=true` / target `70a56cc1` / 6 個 assets,與舊文件記載完全吻合),
  release 本身的完整性靠 immutable + npm provenance 這條外部鏈保住,產品品質不受影響。
- **給未來 run 的規則**:evidence run 目錄至少保留到「結案文件 merge + readback 完成」之後才可
  prune。歷史 run 的內部宣稱一旦失去 evidence 就只剩「文件自述」。
- **step 5(PATH SSOT 收斂)已複驗為不需要做**:字面唯一 SSOT 是
  `scripts/lib/provider-hook-output-transport.mjs:53-54` 的 `PROVIDER_HOOK_EXECUTABLE_PATH`,
  generator 經 `buildProviderHookLaunchArgv` 消費後生出所有 view;連原本以為重複的
  `hooks/hooks.json:78,166` 都是生成視圖(`protected-root-classification.json:52`)。
  單一常數 + generator 消費本來就是教科書式 SSOT,**不要為收斂而收斂製造搬家 churn**。
- **dim 83 UNOBSERVED 不是漏做**:`verify-deep-audit-coverage.mjs:104-123` 對它有封閉的
  typed policy(`NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT` + credentialReferences 回執),是誠實標記。
  未來若要跑 promotion-eligible 的 run,才需要 user 給一次 Netlify credential 的
  Environment/Secret **reference 名稱**(禁貼 secret 本體),readback 後自動繼續。現在不需要做任何事。

## §5 已排除的假說(不要重試)

- 「寫死 PATH 找不到 node」→ 錯,node 在 `/usr/local/bin/node`,在該 PATH 內。
- 「hook 本身壞掉」→ 錯,照 hook 原樣受限環境跑 SessionStart:exit 0、正常 JSON。
- 「缺 node_modules 會 crash」→ 部分錯:多數路徑 fail-open;真正 crash 的是 RC-2 的入口。
- 「settings.json 綁死本機」→ 錯,全檔無 `/Users/chenqiren`。
- 「corpus 封印在雲端必然失敗」→ 錯,封印預設關閉,且從不驗 repo 內目錄 mode。
- 「生成視圖漂移」→ 錯,`.claude/hooks` 與 `ds-canonical/hooks` byte-identical 且 mode 一致。
- 「Codex 弄壞 cloud 環境」→ 錯,回歸窗口在 `e21f5395`/`69604635`(07-27/28),早於 Codex 那批工作。

## §6 給接手者的提醒

- `gh` 自己的 token 失效(`gh auth status` → invalid),`npm run release:status` 卡在 `HUMAN_ONLY`;
  這是 `infra/governance/release-workflow.json:8` 明列的 human-only 邊界。git push/PR/merge 是
  **另一條**通道且正常(`~/.config/qijenchen-governance/github-token` + credential helper,
  實測可讀回 private repo head)。
- `npm run test:governance-harnesses` 要跑 **>10 分鐘**,會被 session bash timeout 殺掉,
  用背景跑或讀 CI log。
- 本 session 有一路 subagent 因逆向 Claude Code 執行檔被標記安全違規;其產出未被採用,
  結論改以官方文件 + repo file:line 支撐。**不要再用「窮舉/逆向找繞過方式」這類 prompt。**
- 動 `.claude/**`、`.agents/**`、`template/**`、`fork/**` 前先確認它們是生成視圖,改 canonical source。
- M28:一任務一 branch;不得在 `main` 上編輯任何 repo 檔案(本檔就是被該 hook 擋下才開 branch 的)。

## §7 化繁為簡 backlog(2026-08-04 四路稽核產出;全數純工程 AUTO,無一項需 user 拍板)

判準只有一條:**這個機制實際擋下過什麼真實缺陷?** 擋過的留,沒擋過又收維護稅的拆。
拆除先例已確立 —— per-PR Ed25519 簽章(`835b519e`)與 candidate-freeze / offline-signatures /
72h-soak / fleet-promotion(`release-workflow.json` `legacyMechanisms` 已標 retired)。

**永不觸碰(任何批次都不得動)**:OIDC + provenance、protected main + required checks、
immutable releases、consumer exact-version readback、`maximumFinalReleasesPerAudit: 1`
(git tag 實證:beta.98→107 十次正式發版全擠在 2026-08-01/02 兩天 = 拿發版當疊代迴圈,病灶真實)、
`standard-ci-evidence` 綁定(它抓到 WM receiver check 可偽造 provenance 這個真缺陷)、
sealed corpus(預設關、不擾民)、deep-audit **判準層**(deterministic dims / hook replay / rubric
—— beta.107/108 用它抓到 radio/tab state、toast a11y、empty/loading table contracts 等真產品缺陷)。

| # | 拆除對象 | 為何拆 | 保留什麼 |
|---|---|---|---|
| 1 | `scripts/release-preflight.mjs`(588 行)+ `scripts/check-governance-tamper.mjs` | canonical 明文 retired(`rules/self-verify.md:43`「retired `release:preflight` 不得回流」),`package.json` 無 script、workflows 與 orchestrator 皆無呼叫。「不得回流」的正確落地是刪檔,不是養屍體。**2026-08-04 Fable 複核校正**:不只自家測試 — `infra/governance/lib/harness-registry.mjs:904-909` 的 required-consumer 契約**要求該檔存在**、`staged-rollout-plan.json:281` mechanismRefs 釘它、`build-fork-governance.mjs:874` 改寫其字面 → 拆除須同批動這三處登記 | 無需保留;`waivers.json` 現為空陣列 |
| 2 | `.github/workflows/deep-audit-managed.yml` | `workflow_dispatch` only、唯一 job 叫 `activation-blocked`、唯一 step 是「拒絕執行」。零功能純占位 | 無 |
| 3 | `controlPlaneGenesisTransition`(710 行 lib + build graph block + 9 個 consumer) | 一次性遷移已 `state: "closed"`,closed 後大半程式碼不可達,每次 build graph 卻仍 `git cat-file` 重驗 5 個 preservation + ancestry = 永久驗證稅 | tombstone 防回流改掛既有 `protected-root-classification.json` 封閉分類(新路徑未分類即失敗,同等保證、零新機制) |
| 4 | deep-audit **儀式層**:model broker transcript / entitlement readback / exact certification / issuer 簽章(`deep-audit-evidence-contract.mjs` 2773 行) | `certifications.json` 所有 platformMatrix 項目 status 全 `not-certified`,beta.108 實際走 waived self-review —— **認證機械從未認證過任何 peer,每次真實 run 都繞過它**。與已拆的 Ed25519 同類:密碼學儀式無不動點、無消費者 | `REVIEW-BLOCKED` fail-closed 語意 + 記錄 provider/model/version(manifest 欄位 + 一個驗證 branch 即可表達)。AGENTS.md canonical 語意零改動 |
| 5 | `waived-self-review` 匯入機械(334 行 lib + 214 行測試 + 58 行 CLI) | 它保證的唯一事情「waiver 不得冒充 verified evidence」,在 `verify-deep-audit-coverage.mjs:326-333` 本來就是一個 if branch | waiver 收成 run manifest 一個欄位 + verify 端既有 branch |
| 6 | `external-activation-requirements.json` 圍繞的驗證機械(388 行 + schema + carrier-projection + 13 個 enterprise 測試檔) | 21 項 status **全部** `not-activated`,`release-workflow.json:48` 自承 advisory/non-blocking → 從未擋下任何缺陷,因為從未有一項活化 | 降級為純文件 checklist,保留 npm trusted publisher / 2FA / rollback-drill 三類真項目。活化本身是 human-only(owner 登入),但「保不保留機械」是工程決策 |
| 7 | `privileged-trust-roots.json` 的 Ed25519 殘留欄位 + `verify-privileged-change.mjs` 的 `REMOVED_CEREMONY_FLAGS` 黑名單 | 簽章儀式已在 `835b519e` 拆除。**2026-08-04 Fable 複核校正**:「已無任何 consumer」字面不成立 — `verify-privileged-change.mjs:181,186,202-219,320` 仍把 algorithm/quorum/keyId 當硬 invariant 驗(但只 `createHash`、無任何簽章驗證 = 驗欄位形狀、不產生密碼學保證)→ 精確說法是「零保證產出的死配置,但拆除須同批改 validator + schema + `test-privileged-change-authorization.mjs`」 | `protectedPaths` / `protectedPrefixes` 的結構閉包驗證(定義特權面,是真保證)+ issuer lineage |
| 8 | hook 子行程 exit code 0/2 白名單的**懲罰粒度** | `provider-hook-output-transport.mjs:420` 非 0/2 即 integrity failure、`:461` 成功 hook 禁寫 stderr → `run-provider-hook.mjs:403-419` 整個 batch 跳過。**任一支 hook exit 1/127 或環境雜訊寫 stderr = 該 group(同一條 settings command 的整批)靜默不跑**(2026-08-04 Fable 複核校正:是 per-group 滅團、非字面全 66 支;仍是雲端崩潰的放大器) | 不變量本身正確(crashed hook 不得偽裝成功),只改粒度:該 hook 記 `GOVERNANCE_WARNING`(帶 hook 名 + exit code),其餘照跑;strict/test lane 維持 fail-closed |
| 9 | `promotionEligible` | waived self-review 必 +1、dim 83 必 UNOBSERVED → 在「無 certified peer + 無 Netlify credential」的現實下**結構上永遠 false**。永遠同值的 gate 零資訊量,還稀釋真 gate 的信號 | 二選一:給 promotion 一個可達定義(deterministic + hook + CI 完整 = eligible,trust downgrade 列註記),或刪掉 promotion 概念只留 `coverageStatus` / findings |

**建議順序**(一批一 branch 一 PR,每批跑 `governance:generate` + `governance:check` + 受影響 test):
先 1、2(零風險殭屍與零功能)→ 8(hook 韌性,雲端直接受益,但**必須等 `hooks-linux` job 先落地**才有驗證能力)
→ 4、5、9(儀式層,需與 staged-rollout proof schema 同批重構,**不可逐項快拆**)→ 3(closed genesis)→ 6(activation 降級)。

**量化現況**(拆完 3/4/5/6/7 估可淨減 4000+ 行 lib 與 15+ 支測試檔):
`scripts/*.mjs` 279 支(其中 `test-*.mjs` 120 支)、`scripts/lib` 60 模組 1.8MB、
`package.json` 146 個 scripts 中 89 個是治理/audit/release、`test:governance-harnesses` >10 分鐘、
pre-commit 每次跑 `governance:generate`。**本次 commit 卡死,就是 pre-commit 機械過重的直接體驗。**

## §8 簡化執行記錄(2026-08-04 batch 1-2 完成;batch 3 手術圖)

- **Batch 1 ✅ merged(#40)**:殭屍 release-preflight/tamper 全鏈 −3.9k 行;index 權威發佈 + 聊天核准憲章同批
- **Batch 2 ✅ merged(#41)**:promotionEligible 可達化(complete coverage + 零 findings;downgrade 只註記);
  build-graph harness 測試的鏡像時代殭屍斷言 tombstone(此類測試不在 PR gate,是既記錄的覆蓋債)
- **Batch 3 手術圖(external-activation 降級;實測遠大於 §7 預估)**:
  叢集實際 = **12,628 行 lib**:staged-rollout.mjs 5015 / external-operator.mjs 2527 /
  external-activation.mjs 2285 / external-ledger-writer.mjs 1796 / rollout-state-machine.mjs 544 /
  completion-readiness.mjs 461(+schemas+13 test 檔)。
  **糾纏點(拆前必斷乾淨)**:(a) `release-trust-preflight.mjs:16` import activation 路徑常數 ——
  該檔是**必留** live 機制(staged-rollout-plan.json:318 mechanismRefs);(b)
  `verify-upgrade-provenance.mjs:236` 讀 activation evidence 欄位;(c) enterprise 測試束
  (package.json:142)混居:**必留** managed-host-assurance / release-trust-preflight /
  issuer-registry(release 鏈仍用),**可退** activation-readiness / external-activation /
  external-operator / external-surface-evidence / external-ledger-writer / completion-readiness /
  rollout-state-machine / staged-rollout / reconcile-github(後者本就帶 App 拆除期殘紅)/
  release-tag-authorization(查:若 release.yml 消費則留)。
  **降級後形態**:external-activation-requirements.json 留作純文件 checklist(保 npm trusted
  publisher / 2FA / rollback-drill 三真項),schema 鬆綁為 documentation-only;六 lib + 可退測試刪除;
  release-trust-preflight 的 activation 讀取改為 optional-absent(fail-open on absence,
  presence 時仍驗)——或直接移除該讀取若其唯一用途是 activation 儀式。

### §8.1 Batch 3 可達圖定稿(2026-08-04 Fable 全鏈稽核;取代 §8 初估)

**真實規模 ~48-50k 行**(六核心 lib 16,610 只是零頭):tests 10,064 / schemas 4,179 /
workflows 2,817(build-managed-ci-executors 2,608!)/ managed-CI 圈 ~11,700 / data 1,722。
**三大風險與解法**:
1. **Anchor bootstrap 死鎖**:governance-anchor(pull_request_target)用**舊 base** 的
   verify-privileged-change 讀 candidate 樹的 activation/tag-auth policy(fail-closed)→
   **兩階段**:Phase A 先出「tolerant verifier」PR(不再讀叢集 policy、容忍兩種 key 形狀,
   candidate 檔案全保留 → 舊 verifier 綠)→ merge → Phase B 才刪檔+修 trust-roots keys。
2. **ci.yml 模組載入鏈**:PR gate 經 model-validation.test → consumerctl/reconcile-github
   import 到叢集;刪檔與斷 import 必同 commit,push 前本地重放 ci.yml 精確命令 +
   harness suite governance-infra-remainder / governance-script-remainder。
3. **Mirror/release 證據對稱**(MIRROR-EVIDENCE-008):activation-boundary proof 是 mirror
   必要資產;producer+validator+receipt schema+scaffold-lock 一個 PR 內對稱移除,
   verify-upgrade-provenance 的 trust-preflight 分支(無 live producer)同批刪,
   consumer 傳播靠下一次 five-step release 帶到 template/WM。
**KEEP 白名單(有 live 鏈,不動)**:issuer-registry(anchor+fork consumer)/
managed-host-assurance(零叢集 import 已驗)/ external-surface-evidence(runtime-certification
live)/ verify-upgrade-provenance 本體(release+sync-all+fork ×3 live)/ reconcile-github+
consumerctl(fleet plane,需斷其叢集 import 的大 sever)/ model-validation 本體(斷 rollout 分支)。
**Inventory 同步鏈**:canonical manifest 移 ~45 個 required id → generate+snapshot;
harness-source-inventory suites[3]/[5]+pairedMeta → sync-harness-authority-bindings;
desired/github.json 的 external-ledger environment → workflow-identities propose/apply;
package.json 十餘條 ceremony scripts;test-governance-build-graph:658-662 期望;fork/template/WM
經正常 release 傳播。

### §8.2 Batch 3 Phase A+B 執行記錄(2026-08-04)

- **Phase A ✅ merged(#42,408974db)**:tolerant verifier(不讀叢集 policy、容忍兩種 trust-root 形狀、
  單一 production band 無條件化);測試重寫 25/25 含 Phase-B enablement case;anchor 死鎖模擬
  (main 舊 verifier 實跑 candidate 樹)PASS。
- **Phase B(本 branch)**:activation cluster 全鏈拆除 —— 8 libs + 4 bins + 12 tests + 19 schemas +
  4 policy/data + managed-ci-executor/class-adapters 目錄 + 3 workflows(external-ledger-writer /
  build-managed-ci-executors / deep-audit-managed)+ ci-evidence enforced lane + verify-mirror-activation-boundary
  + release-tag-authorization/release-trust-preflight CLIs。Severs:reconcile-github 5,324→2,251 行
  (journal v7,保留 protected-main preflight/issuer lineage/fresh rollback authorization/drift guards)、
  model-validation rollout 分支斷開 + external-ledger environment 禁復活不變量、fleet-recovery-authorization
  quorum 內聯(production 1/maximum 2..5 語意不變)、check-branch-protection mutation-boundary-only 模式整段移除
  (零外部 caller)、verify-mirror-evidence 只留 validateMirrorRoot 家族、deep-audit-evidence-contract
  managed-ci-attested 永久 fail-closed、verify-deep-audit-coverage 只認 standard-five-step observation、
  model-evidence-broker activation 段 + schema 對稱移除、anchor ledger step 移除、workflow-security −682 行。
  Inventory 鏈:canonical manifest 446→388 sources、roles.json −8 id、harness registry/contracts/inventory
  投影收斂(7/7)、build-graph stage sources −52、package.json −17 ceremony scripts、desired/github.json +
  schema 拆 governance-external-ledger environment、trust-roots + schema 落 trimmed 形狀、
  fleet-reconcile-journal schema v7、release-workflow external-activation → retired(schema 同步)、
  README/certified-surfaces 全段對齊現實、external-assurance-checklist.md 新增(npm trusted publisher/2FA/
  rollback drill 三真項)。
- **驗證**:privileged-change 25/25、workflow-security 59/59、issuer-registry 7/7、harness-registry 7/7、
  model-validation 17/17、reconcile-github 48/48、consumerctl 37/43(6 failures 與 main 樹逐字相同 =
  pre-existing consumer-bootstrap fixture drift)、governance-data/workflow-identity-sync/release-workflow/
  standard-five-step 全綠、ci.yml PR-gate 精確重放全綠(build:lib/tsc/focused tests/graph check)、
  in-sandbox governance:generate + governance:check PASS。
- **殘留(記錄,非 blocker)**:verify-upgrade-provenance 的 dormant trust-evidence 驗證分支(僅在資產
  存在時驗,生產者已刪 = 永不觸發;完整退場需跨 release-evidence/finalizer-handoff 5+ 檔協調,
  留給 promotion-family 批次)、managed-ci-oidc-broker/trusted-authority/finalization/
  activated-workflow-contract 四份 zombie data(deep-audit broker 儀式 = §7 item 4 批次)、
  genesis lib(§7 item 3)、hook exit-code 粒度(§7 item 8)。
- **Anchor 死鎖二號解鎖 ✅ merged(#44,4a262d4b)**:anchor policy step 原以 trusted 自身 manifest 驗 candidate(任何 manifest 變更必死);改為 trusted code + candidate manifest,carrier 閉包 Phase-A 容忍(本 PR 重新收緊為 exact-2)。
- **Batch 4(§7 item 8)hook 滅團粒度 ✅**:單支 hook 崩潰/壞輸出在生產 lane 降為該支 GOVERNANCE_WARNING 續跑其餘;strict/CI lane 與 reserved marker 一律整批 fail-closed(classifyProviderHookChildFailure 純函式 + transport 單元測試釘住)。

### §8.3 Batch 5+6 手術圖(deep-audit 儀式層;2026-08-04 可達圖定稿)

**目標**(§7 items 4+5):拆 model-broker/entitlement/certification 儀式(從未認證過任何 peer,每次真實 run 都 waived 繞過)+ waived-self-review 匯入機械;保留 REVIEW-BLOCKED fail-closed 語意與 provider/model/version 記錄(run-manifest 欄位 + verify 分支)。

**KEEP(活鏈,已驗)**:model-invocation-profiles.json + schema(runtime-conformance 的 claude-review-capability-probe 消費)/ provider-review-binding(AGENTS canonical)/ model-release-registry 家族(model-validation 活)/ deep-audit-evidence-contract 本體 / verify-deep-audit-coverage / deep-audit-review-archive 本體 / model-evidence-plan 本體(dim 清單 owner)。

**KILL 候選**:scripts/lib/{model-evidence-broker,model-broker-transcript,model-api-transport,model-access-receipt,model-audit-contract,managed-ci-sandbox-receipt,waived-self-review}.mjs、run-model-deep-audit.mjs、import-waived-self-review.mjs、retired-model-entrypoint.mjs、review-core-parity-optin.mjs(查 consumer)、tests {model-deep-audit-safety,model-evidence-broker-hardening,managed-envelope-binding,import-waived-self-review}、schemas {model-evidence-broker,model-broker-shard-result,model-broker-transcript,managed-ci-sandbox-receipt,managed-ci-finalized-receipt,managed-ci-activated-workflow-contract,managed-ci-oidc-broker-policy,managed-ci-trusted-authority-policy,managed-ci-authority-finalization-protocol}、data {model-evidence-broker.json,managed-ci-activated-workflow-contract.json,managed-ci-oidc-broker-policy.json,managed-ci-trusted-authority-policy.json}。

**Severs**:deep-audit-evidence-contract(model-access-receipt/sandbox-receipt/broker-transcript/invocation-profiles import → judgment/A1b 證據改 manifest-waiver 路徑;transportReceipt/accessReceipt 驗證鏈重塑)/ deep-audit-review-archive(broker import)/ model-evidence-plan(api-transport import)/ prepare-deep-audit-run(waiver 進 manifest 欄位)/ verify-deep-audit-coverage(waived bundle 讀取 → manifest 欄位;loadWaivedSelfReviewBundle 退場)/ test-deep-audit-{evidence-schema-parity,review-archive} / registries(manifest ids、harness 三件套、build-graph sources、package.json scripts test:model-evidence*、audit:model-evidence*)。

**先例**:batch 3 的 anchor/manifest 死鎖已由 #44 根治,本批單 PR 直落;graph 工具輸出存 scratchpad graph-b56.txt。

### §8.4 Batch 5+6 執行記錄(2026-08-04 完成)

**KEEP 修正(M12,手術中證據推翻原 KILL 候選)**:
- `scripts/lib/model-api-transport.mjs` **KEEP**——誤刪後還原(byte-for-byte 自 488786b6):它是純合約模組(validateBrokerApiProfile / validateProviderResponseSelector 驗活的 invocation profiles;response-substitution fail-closed),model-evidence-plan 活鏈消費;manifest id `deep-audit-model-api-transport` 與 build-graph source 保留。
- waived-self-review 三件套 **KEEP**——beta.108 真實 evidence 的載體;batch-2 achievable gate 依賴。
- entitlement review-lane contract fns(model-evidence-plan + evidence-contract 內)**KEEP**——未來明確要求 independent review 的唯一 lane。
- `retired-model-entrypoint.mjs` **KEEP(重寫)**——providers.json codex-collab transport,typed REVIEW-BLOCKED(reasonCode MODEL_BROKER_EXECUTION_RETIRED)。

**實際 KILL(本批刪除)**:run-model-deep-audit / review-core-parity-optin / model-evidence-broker / model-broker-transcript / model-access-receipt / model-audit-contract / managed-ci-sandbox-receipt / deep-audit-review-archive 各 .mjs;tests {model-deep-audit-safety, model-evidence-broker-hardening, managed-envelope-binding, deep-audit-review-archive, review-bundle-materialization-guard};schemas {managed-ci-sandbox-receipt, managed-ci-finalized-receipt, managed-ci-activated-workflow-contract, model-broker-shard-result, model-broker-transcript, model-evidence-broker};data {model-evidence-broker.json, managed-ci-activated-workflow-contract.json, managed-ci-oidc-broker-policy(+schema), managed-ci-trusted-authority-policy(+schema)}。

**Severs 落地**:evidence-contract judgment/A1b 分支 fail-closed(schema `not:{}` + code fail)/ 非 waived manifests typed fail / expectedPathSet waived-only / schema 15 defs 撤 / registry 三件套 + manifest(−24 id, +1 transport 還原)+ build-graph(−20)+ package.json(−5 scripts)同步 / CODEOWNERS 24 條 stale path rule 清除 / infra/governance/README.md §3-4 與 independent-review evidence-contract.md 改寫為退役後合約。

**額外抓到的 main 上潛在 drift**:test-workflow-security「anchor CLI」argv 期望缺 #44 的 `--manifest`(PR gate 刻意不含十分鐘 harness suite → #44 綠著 merge、紅在 harness);本批補上,59/59 綠。

**驗證**:coverage/deterministic/parity/build-graph/snapshot/harness-registry 串跑 31/31;waived-import PASS;workflow-security 59/59;CI focused lane replay 33/33+minima;generate+check PASS(.claude 兩 view 因 sandbox deny 由 generator 輸出逐位元組投影,cmp 驗證 BYTE-IDENTICAL)。隔離 harness(pristine main)其餘失敗均環境性:vite dist 未建、Playwright 未裝、npm runtime overlay 未 provision、consumerctl 6 例先前已證 pre-existing。

### §8.5 Batch 7 genesis 退役執行記錄(2026-08-05 完成;§7 item 3)

現況前提:transition state 已 `closed`(build-graph.json 內嵌 record 實測)→ 全部 OPEN/RETAIN 分支為死路;手術大半機械。

**刪除**:`scripts/lib/control-plane-genesis-transition.mjs`(710 行)+ `scripts/test-control-plane-genesis-transition.mjs`(371 行)+ build-graph.json 內嵌 `controlPlaneGenesisTransition` record(2KB)+ schema $defs 7 個 + 孤兒 schemas `fleet-reconcile-bootstrap-{transaction,replay-receipt}.schema.json`(genesis challenge/receipt 形狀,零 runtime consumer)+ verify-privileged-change 內無 caller 的 genesis receipt 家族(validateControlPlaneGenesisReceipt/commentBody/digest/marker,61 行)。

**Severs(死分支拆除 + 活語意 inline)**:
- sync-governance-baseline-mirrors:retained 三函式 + lifecycle load 全拆;plain symlink verify/generate 為唯一路徑。
- build-fork-governance:genesisPreservationMap/assertGenesisScriptsAlias/generateGenesisScriptsAlias → `assertRetiredScriptsAliasAbsent`/`removeRetiredScriptsAlias`(保留 `packages/design-system/scripts` 永不重現 invariant);preamble/template-hook OPEN 區塊刪除。
- governance-protected-roots:兩條 baseline symlink 路徑(`.claude/snapshots-baseline`/`snapshots-baseline`)inline 為常數。
- check-provider-neutral-ssot-residue:5 條 tombstone inline 為 `RETIRED_CONTROL_PLANE_TOMBSTONES`,絕不重現檢查保留。
- harness-source-inventory lib:transitionInactiveCanonicalHookNames 死函式拆除。
- registries:manifest −2 id / build-graph −6 ref / harness contracts+registry 重投影。

**不動(同名異義)**:provider-lifecycle ledger genesis、reconcile-github transaction-journal genesis、test-consumer-governance/test-future-provider-fork-surface 的 lifecycle genesis fixture。

**另抓 2 個 pre-existing main drift**(harness-only 測試不在 PR gate,與 workflow-security 同類):residue test fixture 缺 utility-registry consumed_by 兩個 hook(check_layout_space_magic_numbers/check_escape_marker_abuse);widened-mirror poison 因 hook-test mirror 已退役成 no-op → 改注入式 poison。皆修復。
