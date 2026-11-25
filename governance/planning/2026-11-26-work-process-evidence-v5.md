<!-- Authority/status: governance/planning/registry.json -->
# axe 閘接進 PR 與多包流程 v5 的量測證據(2026-11-26)

> 用途:兩件事的出處 —— (1) axe 基線回歸閘從夜間 `.github/workflows/a11y-and-size.yml` 搬進 PR 的 `.github/workflows/ci.yml` `verify-browser-a11y`;(2) `packages/design-system/ds-canonical/rules/work-process.md` v5 拿掉「CI 沒跑 axe 時,核對者在本機補跑 `--tag`」那句。只當出處,不是規則、也不是待辦;流程本身只住在那一檔,CI 的理由寫在 ci.yml 該 job 檔頭。
> 證據類別:實測花費與品質 —— 本機全掃計時、拋棄式 clone 的對照組、閘普查(`gate-census`)的 CI 歷史數字。CI 歷史只用普查當時已抓下的資料,這一包沒有再查 GitHub API。
> 出處:當批交接資料夾(不進 repo)`notes/gate-census/summary.md`、`notes/gate-census/step2/B-duplicate-execution.verify.md`(L6)、普查原始檔 `ci-history.raw.json` 與 `cache/b05558ec….json`(`/actions/runs?per_page=100`,2026-11-25T15:26Z 抓);本包的原始輸出在本包 scratch 的 `gate-real.log` / `gate-control.log` / `heavy.out`。repo 內的檔:行以本包起點 `3e75811c` 為準。

## 0. 為什麼改

- user 原話(2026-11-25,交接逐字):「我要確保產出品質完美同時確保CI和稽核等機械閘是永遠沒有多餘的 這樣才是最有效率又同時能確保產出品質完美的，對吧？」
- 怎麼改是 AI 的工程判斷(AGENTS.md「自主執行 canonical」:CI / 治理屬 AUTO),不是 user 拍板的內容。
- 缺口(L6 驗證):PR 的 CI 沒有任何 axe 檢查。`ci.yml` 的 `test:a11y-corpus` 只比 story 清單(`scripts/a11y-corpus-invariant.mjs:3-7`,不開瀏覽器);`ci.yml:450` 明寫 audit-a11y 只在夜間可達、刻意沒接;真正的 axe 閘在 `a11y-and-size.yml`,觸發只有排程與手動(`:3-7`),自稱 non-blocking。新違規要合併後隔天才看得到,而且不擋。

## 1. 選全掃,不選「只掃改到的 story」

- 判定與夜間同一套:`scripts/audit-a11y.mjs --gate` → `scripts/lib/a11y-gate.mjs` 的 `evaluateA11yRegressionGate`(`:153-193`,指紋 `storyId|ruleId` → 節點數,比基線多 = 紅)+ 同一份 `infra/governance/baseline/a11y-baseline.json`。PR 那一行指令與夜間原本那一行逐字相同(`npm run a11y:check -- --gate`)。
- `--gate` 本來就拒絕子集(`a11y-gate.mjs:36-38`:gate 與 baseline-write 必須掃完整 story 清單)。只掃改到的 story 得另做「子集判定」,而且得有可靠的「改到哪些 story」對照。
- 現有唯一的對照是 `scripts/visual-audit.mjs` 的 `getChangedComponents`(`:653-675`):只認 `packages/design-system/src/components/<Name>/` 底下的檔,色票、pattern、共用樣式改動一律算不到。
- 違規的組成(本包 2026-11-26 本機全掃):5,391 筆裡 color-contrast 5,384 筆,其餘 nested-interactive 4 筆、scrollable-region-focusable 3 筆。color-contrast 由色票與共用樣式決定 —— 正是上面那個對照算不到的改動。拿它縮範圍 = 色票一改就漏,這是「缺」;要做到不漏得另寫模組相依圖(新機制、第二套「改到哪些」判準),不符合「先擴既有的閘」。
- 所以選全掃:不另寫判準、不漏。

## 2. 花多少

- 本機(macOS)全掃 `--gate`:2026-11-24 兩次 749 秒、758 秒(普查 `local-cost.json` longestCommands 第 17、18 列);本包 2026-11-26 564 秒(1,089 則)。
- 夜間 workflow(含裝依賴、裝 Chromium 與系統套件、build:lib、build-storybook,兩個 job 平行)每次 run 的牆鐘:11-21 15 分 16 秒、11-22 14 分 36 秒、11-23 17 分 15 秒、11-24 15 分 27 秒、11-25 15 分 19 秒(`/actions/runs` 的 created_at → updated_at)。
- PR CI 現況(普查 run 45476628160,commit `6c60a9ac`):牆鐘 20 分 58 秒;37 個 job 全部在第 0.0 分開始(沒有排隊),最長的 job 20.8 分。全 story 掃描型 job `verify-browser-sweeps` 的準備步驟:安裝 0.4 分、build:lib 0.2 分、build-storybook 0.8 分。
- 估計:新 job ≈ 準備約 1.5 分 + 全掃(夜間 run 牆鐘扣掉準備)約 12–15 分,低於現在最長的 20.8 分 job,沒有排隊 → PR 牆鐘不變;機器時間每次 CI 多約 14–17 分(37 個 job 合計 460 分的 3–4%)。夜間那趟退役,每天少一趟 14.6–17.3 分。上限 25 分沿用全 story 掃描型 job 的既有檔位(`infra/governance/test/ci-workflow-scope.test.mjs` 的 SLOW_BROWSER_JOBS)。第一次 CI 讀回要記實際秒數;超過 20 分就照 `verify-browser-layout-edges` 的分片做法再拆。

## 3. 夜間那趟為什麼退役(同一支閘一次只跑一次)

- `ci.yml` 在 `pull_request` 與 `push: main` 都跑(`:3-8`),合併是 exact-head;同一棵樹在夜間再掃一次是同一支閘跑兩次。依賴(含 Playwright 的 Chromium)由 lockfile 釘死,夜間量不到 PR 量不到的東西。
- `a11y-and-size.yml` 只剩 bundle size 那個 job,workflow 名改成「Bundle Size」;檔名不改(`infra/governance/test/ci-workflow-scope.test.mjs` 的排程清單、`scripts/test-workflow-security.mjs` 用檔名)。
- 那 5 格從哪來(2026-11-26 本機診斷,同一份 node_modules:playwright-core 1.59.1 / axe-core 4.11.3 / @axe-core/playwright 4.11.2,與 `8eb473c7`、`2e5c1b0c`、HEAD 的 lockfile 相同):
  - 基線那 5 格從 `8eb473c7`(11-05 寫)到 HEAD 都是 9 / 51 / 1 / 6 / 4,沒有登記在 `_meta.linuxOnly`;`2e5c1b0c`(#172,squash)在 11-22 重寫過基線(改了 13 格、加了 10 格),這 5 格照舊。
  - 逐則 `--tag` 量(各自重建 build:lib + build-storybook):`46eff99d` 是 10 / 52 / 6 / 7 / 6;**main `2e5c1b0c` 也已是 10 / 52 / 6 / 7 / 6**。所以不是本分支 `2e5c1b0c..46eff99d` 的產品 commit 帶進來的 —— 原先懷疑的 `44f7acc2`(整頁預設字級)排除。
  - 跟 `_meta.linuxOnly` 已登記的那一型**方向相反**:那一型是 Linux 量得比 macOS 多(macOS 歸 incomplete 不計);這 5 格是 macOS 量得比基線多。所以不能拿那一型推論 CI 會綠。
  - 判不了的:#172 合併前在 macOS 寫基線時量到 9 / 51 / 1 / 6 / 4,同一個 commit 今天本機量到 10 / 52 / 6 / 7 / 6 —— 是 squash 裡寫基線之後的 commit 改到,還是本機環境變了,本包分不出來(squash 前的 commit 不在 repo 裡)。Linux 的值本機量不到。
- 因此 `verify-browser-a11y` **暫不接進 verify 總關卡**(登記待決,不是放寬判準或容差):job 照樣在每個 PR 與 push main 全掃、上傳 `a11y-audit-report`,紅了看得到但不擋合併。結案條件:第一次 PR CI 讀回時,從該 job 的 `a11y-audit-report` 拿這 5 格(與任何其他增量)的 Linux 值 → 逐格判斷是修掉對比,還是寫明理由更新基線 → 該 job 綠了,才把它加進 `ci.yml` verify 的 needs、env 與判斷式(`infra/governance/test/ci-workflow-scope.test.mjs` 的 needs 清單同步)。
- 夜間那趟在 main 上的紅分兩段(普查只抓到 11-21 起的 run 層結論,沒有 job 層,所以分不出是 a11y 還是 bundle size 那個 job 紅):
  - 11-19 那次有人讀過 log:main `2e5c1b0c`(#172)的 commit 說明引了 run 44499310317 的 log:515-517「baseline 22 → now 23」「baseline 40 → now 41」,#172 把這兩格寫回 23 / 41,並登記在基線 `_meta.linuxOnly`(理由引同一個 run)。head 還是 `8eb473c7` 的 11-21、11-22 兩次 failure 是在這個修正合併之前。
  - 修正合併之後,head 為 `2e5c1b0c` 的 11-23、11-24、11-25 三次(run 45153705339 / 45388615541 / 45598331453)仍是 failure。**這三次的原因沒人讀過 log**,本包也沒讀(不查 GitHub API)。

## 4. 對照組(閘該紅的時候會紅)

- 現況:本包起點 `3e75811c` 的建置上 `npm run a11y:check -- --gate`(本機 macOS,564 秒):**紅**,exit 1,5 個增量 —— avatar「設計規格 › state-behavior」color-contrast 基線 9 → 10、combobox「color-matrix」51 → 52、combobox「state-behavior」1 → 6、profilecard「color-matrix」6 → 7、rating「size-matrix」4 → 6;沒有 audit-error,story 清單與基線相同(1089 則)。同樣這 5 個、同樣的數字,2026-11-24 另一條分支的本機 `--gate` 也紅過(普查 `local-cost.json` longestCommands 第 18 列那一跑的 log)。這 5 格 CI(Linux)會不會紅本機判不了(第 3 節),所以這個 job 暫不接進 verify 總關卡,Linux 值等 CI 上傳的 a11y-audit-report。
- 判定的兩面對照(不改產品原始碼、只改基線副本):拿上面那一跑寫出的真實 `a11y-audit.json`,餵給 CLI 用的同一支 `evaluateA11yRegressionGate`(`scripts/lib/a11y-gate.mjs:153`),掃描清單 = 基線清單(1089 則,`test:a11y-corpus` 已證相同):
  - A 原基線 → ok=false,回歸剛好是上面那 5 個、數字相同(與 CLI 那一跑的裁決一致);
  - B 只把那 5 格設成本機量值 → ok=true、0 回歸(這份建置上判定能綠);
  - C B 再把 button「設計規格 › overview」color-contrast 19 減成 18 → ok=false,只點名這一格(18→19);
  - D B 再刪掉 tabs「設計原則 › size-selection」那一整格 → ok=false,只點名這一格(0→3,新 key)。
  腳本與輸出在本包 scratch(`lib-control.mjs`)。
- 同一個注入走完整 CLI(拋棄式 clone、複製過去的同一份 storybook-static、`node scripts/audit-a11y.mjs --gate`,不改產品原始碼):
  - 基線 = B + C 的注入 → exit 1,570 秒,`a11y GATE FAIL — 1 個新增/增量 violation`,只點名 `design-system-components-button-設計規格--overview|color-contrast (baseline 18 → now 19)`;
  - 同一份基線只把那一格還原成 19(= B)→ exit 0,572 秒,`a11y GATE PASS — 0 regression vs baseline`。
  - 第一次排入時 clone 用了 storybook-static 的符號連結,被靜態伺服器拒絕(`scripts/lib/a11y-static-server.mjs`:root 必須是一般目錄)、0 秒結束 —— 那一個 exit 1 是儀器失效,不算紅,已改成複製目錄重跑(上面兩跑)。
- 新斷言的對照組(`infra/governance/test/ci-workflow-scope.test.mjs`,拋棄式 clone 逐一弄壞再還原):夜間 yml 再跑 `a11y:check` → 紅「夜間 a11y-and-size.yml 不得再跑 a11y:check」;PR 改成 `--tag=button` → 紅「PR 的 a11y 閘必須是全掃 + 基線回歸判定」;ci.yml 跑兩次 → 紅「ci.yml 只准一處跑 a11y:check」;fan-in 判斷式漏掉 a11y → 紅「BROWSER_A11Y 出現在 env 卻沒有被判斷式檢查」;還原後綠。

## 5. work-process v5:拿掉本機補跑 axe

- v4「本機檢查」那句的前提是「CI 沒跑 axe 時」(L6 驗證的結論:那時核對者那一趟是合併前唯一一次 axe)。PR 的 CI 接上全掃之後,前提不成立;照同檔「合回點」:全套只在 CI 跑,合併前要 CI 綠,本機補跑抓得到的 CI 都抓得到。
- 而且那句指定的 `--tag` 跟 CI 不是同一個判準:`--tag` 不能配 `--gate`(`a11y-gate.mjs:36-38`),只能跑預設模式「任何 critical / serious 就紅」(`evaluateA11ySeverityGate`,`a11y-gate.mjs:268-276`)。本包全掃 1,089 則裡 734 則帶違規、全部是 serious,大宗是 user 已定案的 `--fg-muted` 對比(`packages/design-system/src/tokens/color/color.spec.md`「已定案(禁再問)」)—— 拿 `--tag` 跑大多數 story 都會紅,紅的不是這次改動。留著這句只會讓核對者花時間跑一個多半紅、而且紅了也不代表回歸的檢查。
- 「最後一次新增 / 改名 story 後重生一次」基線不變:story 清單由 `test:a11y-corpus` 守(verify-static,一秒就紅),全掃遇到清單不同只拒絕判定,是它的前提、不是另一條規則。
