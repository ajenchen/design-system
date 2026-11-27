<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v4 的量測證據(2026-11-26)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v4(合回點本機不重跑全套、核對者不重跑同一個 commit、再驗只跑修正的檢查、「本機檢查」各項何時才跑)的出處。只當出處,不是規則、也不是待辦;流程本身只住在那一檔。
> 證據類別:實測花費與品質 —— CI 歷史(GitHub Actions API)、本機照 CI 逐條跑一輪的執行器紀錄、2026-11-25 一整天代理紀錄裡的指令耗時;每個判定都經過一位沒參與判定的驗證者逐條嘗試推翻,被改判或算式錯的以驗證結果為準(下面已照改)。
> 出處都在當批工作的交接資料夾(不進 repo);下面寫的是該資料夾 `notes/` 底下的相對位置:`gate-census/summary.md`(全掃數字)、`gate-census/census.json`(逐列原始資料)、`gate-census/step2/B-duplicate-execution.md`(判定)與 `B-duplicate-execution.verify.md`(對抗驗證)、`evidence/2026-11-25-efficiency-measure.md`(代理耗時)。repo 內的檔:行以 commit `5d5d8393` 為準。

## 0. 為什麼改

- user 原話(交接 `notes/CALENDAR-AGENDA-2026-11-24.md` GATE-LEAN 列逐字):「我要確保產出品質完美同時確保CI和稽核等機械閘是永遠沒有多餘的 這樣才是最有效率又同時能確保產出品質完美的，對吧？」
- user 原話(同檔 REPRIORITIZE 列逐字):「我覺得兩步都可以先做， 因為這個工作流程的優化才是所有的地基， 反正交接文件確保有寫好就好， 確保所有該做的任務都有完整追蹤直到完美收尾」
- 怎麼改是 AI 的工程判斷(AGENTS.md「自主執行 canonical」:流程 / 治理屬 AUTO),不是 user 拍板的內容。
- 根因(判定 B 組結論 3):本機重複的主因是流程句子,不是代理亂跑。v3 的「合回點」寫「本機跑 CI 導出的全部檢查與建置」,和 AGENTS.md「分診與預算」的「只驗改到的檔在 CI 對應的檢查」互相矛盾;「每一包」第 2 點沒說實作者在同一個 commit 跑過的不用重跑。

## 1. 合回點:本機全套 vs CI(判定 L1,驗證:成立、兩條算式更正)

- 本機照 CI 步驟逐條跑的一輪(commit `c4460faa`,2026-11-24T16:49Z 到 18:59Z):45 個 job、516 條指令、機器時間合計 294 分 14 秒,牆鐘約 130 分。其中約 18 分是修正後的重跑與診斷,單純跑一輪約 276 分。出處:`gate-census/summary.md` 第 4 段(執行器自己記的每條秒數,local-ci-runner.json);驗證檔 L1「小提醒」。
- CI 同一套:分支最近一次全綠(run 45476628160,commit `6c60a9ac`)牆鐘 20 分 58 秒、37 個 job 機器時間 460 分 49 秒;56 次已完成 run 裡全綠的牆鐘中位數 21 分 12 秒。出處:`gate-census/summary.md` 第 1 段。
- 本機那一輪結束碼非 0 的 9 條:2 條真紅(Governance control plane 的 `test:waived-self-review`、`test:governance-evidence-control-plane`),CI 同一個 job 跑同樣的指令(`.github/workflows/ci.yml:2591-2592`),修正 commit `82f8af9b` 的說明寫「governance:check 不驗封閉性,所以包內自驗與合回時都是綠的」;5 條 fastscroll 是 mac 環境假紅(連 main 對 main 的對照組都紅);build、hooks-linux 各 1 條是執行器問題。驗證者找不到只有本機全套才抓得到、CI 抓不到的缺陷。限制:`c4460faa` 沒推到 GitHub 跑過,「CI 也抓得到」的依據是同樣的指令加上修正 commit 的說明。
- 牆鐘省多少(驗證更正版):舊 = 本機 130 分 + 修 + CI 21 分;新 = 本機子集 x + CI 21 分(CI 紅再多一趟 21 分 + 修)。CI 一次就綠約省 130 − x 分;CI 紅一次約省 130 − 21 − x ≈ 105 分。B 組原寫的「−約 109 分(130 − 21)」算式不對,不採用。
- 為什麼品質不降:CI 每個 PR 都跑全套(本機全套就是照 CI 導出的同一份步驟),PR 是草稿、合併前要 CI 綠與 user 說「發版」的同意紀錄(AGENTS.md「Git / release canonical」),所以本機不重跑全套只會讓「本機先看到紅」變成「CI 才看到紅」,不會讓錯漏進 main。代價:CI 紅一次要多等一趟約 21 分;今天那一輪的 2 條真紅,CI 那個 job 約 3 分鐘就有結果。

## 2. 核對者、再驗者、合回者的重跑(判定 L2、L7,驗證:成立、比例下修)

- escape-and-focus 閘當天單獨跑 34 筆、合計 226 分 38 秒(`gate-census/summary.md` 第 4 段)。把背景執行補一趟平均時長後,非實作者約佔 41%(B 組原寫 45%,驗證更正;補值是上限)。
- 只有核對者是「同一個 commit 重跑」:再驗者跑的是修正 commit、合回者跑的是合併 commit。後兩群可以省,是因為 CI 會在最後那個 commit 上再跑一次(第 1 節),不是因為和實作者重複 —— 所以規則分兩句:核對者引用同 commit 的紀錄;再驗只跑修正改到的檔的檢查。
- story-demo-focus 閘當天 22 筆、合計 46 分 55 秒;補背景後非實作者約佔 47%(B 組原寫 56%),省約 31 分。CI 有跑(`.github/workflows/ci.yml:2080`),不會漏。
- 不會漏的理由:escape 閘在 PR 的 CI 裡跑(`.github/workflows/ci.yml:1423`、`:2358`),合併前要等 CI 綠。實作者紀錄若不實,核對者要到 CI 才抓到(晚一輪,不是漏);CI 是最終權威(AGENTS.md 檔頭)。

## 3. 判定與 --selftest 連跑(判定 C9 的本機面,驗證:成立)

- 有 8 支閘的 --selftest 第一步就是一趟完整判定、基準紅就判失敗:`scripts/escape-and-focus-contract-invariant.mjs:1464`、`scripts/overlay-nested-dismiss-invariant.mjs:997`、`scripts/data-table-panel-reset-clear-invariant.mjs:1162`、`scripts/form-validation-contract-invariant.mjs:1174`、`scripts/data-table-click-outside-invariant.mjs:282`、`scripts/overlay-cover-anchor-invariant.mjs:326`、`scripts/datepicker-range-active-underline-invariant.mjs:387`、`scripts/field-view-font-size-invariant.mjs:366`。這八支跑 --selftest 時都印「現行原始碼(selftest 基準」(`grep -l` 這串字剛好 8 支),所以 work-process.md 用這串字當辨認方式。先單跑判定再跑 --selftest = 同一趟判定跑兩次。驗證者逐支確認判定與基準走同一個 `runVariant`、同一組分頁設定。
- 驗證者另列 `scripts/test-week-start.mjs` 為第 9 支,但它檔頭 `:19` 寫「`--selftest` 只跑對照組」,本檔不採計;`scripts/token-creation-invariant.mjs:1248` 也印「selftest 基準」,但它的基準用固定的相容政策跑(`:972` `compatPolicy: fixedBetaPolicy`),不等於正式判定,也不採計 —— 兩支都照「先判定、再 --selftest」跑。
- 其餘 `X && X --selftest` 別名(驗證者數到 92 個別名)的 --selftest 只是儀器自己的對照組,不含完整判定(例:`story-demo-focus-invariant.mjs` 的 `runSelftest` 只量幾則指定的 story)—— 這些不能只跑 --selftest。
- 為什麼「改到突變所改的原始碼也要跑 --selftest」:突變是拿正規式對原始碼做一次替換(例:`scripts/overlay-cover-anchor-invariant.mjs:80-86` 的 `file:` + `replaceOnce`),原始碼改了,突變可能套不上,CI 的 --selftest 就會紅。本機先跑一次,省一趟約 21 分的 CI 來回。

## 4. Storybook 建置(判定 L3,驗證:成立、風險改寫)

- 當天建 Storybook 113 次、合計 165 分 6 秒;單獨跑的 77 次 72 分 4 秒,平均約 56 秒。同一個副本上一次建置後沒改任何檔又重建 ≥ 18 次(下限);跑原始碼 harness 閘前也先建的,和建置串在同一條指令裡,拆不出次數。出處:`gate-census/summary.md` 第 4 段、判定 L3。
- 怎麼認出不需要 Storybook 的閘:就是第 3 節那 8 支,每支都在 `launchBrowserOrSkip` 的提示字串寫「這支閘不需要 storybook 建置」(例 `scripts/escape-and-focus-contract-invariant.mjs:1450`、`scripts/overlay-nested-dismiss-invariant.mjs:982`);檔頭也寫的只有 2 支(`scripts/overlay-cover-anchor-invariant.mjs:21`、`scripts/form-validation-contract-invariant.mjs:87`),所以 work-process.md 不寫「檔頭」,改用「這支閘不需要 storybook」這串字 —— 在 `scripts/` 底下 `grep -rl` 剛好命中這 8 支。寬鬆的「不需要 storybook」不能用:它也命中 `scripts/section-gap-invariant.mjs:398`、`:403`,那支會呼叫 `openStory`(例 `:655`),要先建 Storybook。
- 驗證指出的漏洞:`scripts/gen-build-info.mjs:38` 只記 commit,沒記建置當時工作樹乾不乾淨;拿「build-info 的 commit 等於 HEAD」判斷可不可以重用,會在「帶著未提交改動建置、之後丟掉改動」時量到不對的建置。所以規則改用「建置之後沒改過任何檔(含丟掉的改動)才重用」,不靠 commit 相等。影響只在本機:CI 每次都重新建置。

## 5. hook 測試(判定 L4,驗證:成立)

- 整批 hook 測試當天 5 次、合計 49 分 33 秒;本機全套一次可到 1844 秒,CI hooks-linux 全套中位 270 秒(`.github/workflows/ci.yml:2560` 跑全套)。
- 子集照跑全部守衛,摘要會印 SUBSET,不會被讀成全套通過(`packages/design-system/ds-canonical/hooks/tests/run-all.sh:5-13`)。驗證補的風險:改到多支 hook 共用的 lib 或 registrations.json 時不好挑,挑漏了只是 CI 才紅,不會漏進 main —— 規則因此寫「跑引用它的那幾支」。

## 6. governance:generate(判定 L5,驗證:成立)

- 當天 governance:generate 單獨跑 33 筆、合計 37 分 55 秒,平均約 69 秒;governance:check 平均約 16 秒。核對者 / 合回者改成只跑 check 約省 19 分。CI 跑 `scripts/governance-build-graph.mjs --check`(`.github/workflows/ci.yml:477`),有漂移就紅。

## 7. a11y(判定 L6,驗證:推翻 —— 照驗證改做法)

- B 組以為非實作者重跑的是「重生 a11y 基線」,實際分類代理紀錄裡 a11y 共 45 筆:`--baseline-write` 只有 1 筆(實作者);核對者 10 筆全是 axe 違規檢查。
- PR 的 CI 沒有任何 axe 檢查:`.github/workflows/ci.yml:59` 的 `test:a11y-corpus` 只比對 story 清單(不開瀏覽器);`.github/workflows/ci.yml:452` 明寫 audit-a11y 只在夜間可達、刻意沒接;真正的 axe 閘在 `.github/workflows/a11y-and-size.yml`,觸發只有排程和手動,`:6` 自稱 Non-blocking drift monitor。
- 所以核對者那一趟 axe 檢查是合併前唯一一次獨立的無障礙違規檢查,拿掉會讓新的 WCAG 違規進 main(user 看得到的錯)。v4 的做法:基線只在最後一次新增 / 改名 story 後重生一次;CI 沒跑 axe 時,最後那個 commit 上要有一趟只看改到的 story 的 axe 檢查(`npm run a11y:check -- --tag=<story id 片段>`,`scripts/lib/a11y-gate.mjs:17`、`scripts/audit-a11y.mjs:106` 依 story id 篩),不得引用較早 commit 的紀錄。把這項檢查接進 PR 的 CI 是另一件工程(地基 F4),接上之後這一趟由 CI 負責。

## 8. 開場 bytes

- work-process.md 每次對話都載入,`scripts/check-agents-bootstrap.mjs` A6 對開場固定載入的檔(AGENTS.md + CLAUDE.md + 沒有 paths 前置設定的規則檔)有 bytes 上限,原上限 76,881 = v3 現況。
- v4 初稿讓開場變成 79,027 bytes(+2,146);拿掉「迭代」段與檔頭重複的一句、壓短 v1 名詞定義、整段縮句後是 78,625 bytes(+1,744)。再縮就要刪規則,或刪「依據」段說明為什麼品質不降的實測數字(`scripts/work-process-ssot-invariant.mjs` W6 只守「依據」段,數字放在別段就沒有閘對照證據檔)。
- 所以照 A6 自己寫的做法在 `scripts/check-agents-bootstrap.mjs` 明改上限 76,881 → 78,625,註解寫明換到什麼。這是開場大小的預算,不是哪條品質閘的判準。
- 規格核對後的修正:Storybook 那句改成「這支閘不需要 storybook」(+9 bytes,理由見第 4 節),同時刪掉「依據」v4 裡和「本機檢查」a11y 那項重複的一句(−44 bytes),開場變成 78,590 bytes;上限跟著釘回實量 78,625 → 78,590,不留空位(A6 是「釘在瘦身後的數字」)。

## 9. 之後怎麼量(下一個合回點的讀回)

- 照 work-process.md「合回點」記一次實測:花費、各包必修數、CI 第一次讀回結果。對照組:用同一支掃描(判定 B 組的 `B-scan-logs.mjs` 做法)重掃代理紀錄,「同一個 commit 被兩個角色各跑一次」應為 0、「建置後沒改檔又重建」應為 0;CI 第一次讀回的紅燈數不增加。
