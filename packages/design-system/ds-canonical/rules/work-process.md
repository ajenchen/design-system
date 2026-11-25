# 多包 / 多步工作流程
> **v5(2026-11-26)**。本檔是多包 / 多步工作流程的唯一住處:怎麼實作、怎麼審查、審查幾輪、什麼時候再修、合回怎麼走,只寫在這裡。其他檔只放指向本檔,不重述步驟、門檻或數字。改本檔照文末「迭代」。

## 適用

一次工作拆成兩包(或兩步)以上、分給不同代理實作,或要合回同一條分支時。單一小改動照 `rules/self-verify.md` 自驗即可。

流程與工具都住在 repo;某一批工作的交接資料夾只放那一批的狀態與指向本檔,不另寫流程規則、不另放流程工具。

選做法前先問:會不會新增讀憑證的程式、改安全掃描放行清單或權限設定?會 → 先找不跨監督邊界的做法,真沒有才走,動手前一次講清要 user 授權的範圍。

## 每一包

1. **實作**:一位實作者照該包規格與 repo 規則實作,依 `rules/self-verify.md` 自驗後 commit;檢查照「本機檢查」,回報附每支的 commit、指令、結束碼。
2. **審查(規格核對)**:一位沒參與實作的審查者只做兩件事 ——
   - 規格逐項判「做到 / 漏做 / 做錯 / 做多」,每項附 檔:行;
   - 跑改到的檔在 CI 對應的檢查,附指令與結果;實作者同一個 commit 有紀錄的引用、不重跑,只跑缺紀錄、commit 不符、與自己判「做錯」有關的。

   這是規格核對,不是 AGENTS.md「Independent second opinion」;不得記成 independent review,也不得當成它的收據。
3. **必修只限四種**:規格必做項漏做或做錯 / 會讓 CI 紅 / 內容不實 / 改壞既有東西。
4. **有必修**:修一次 → 再驗一次(只看修正、只跑修正改到的檢查)。之後只有價值閘才再修:user 看得到的錯、CI 紅、user 要求。
5. **規格內列的項目一律要做**。第 3 點的必修限制只管審查新冒出的發現,不是刪減規格的理由。
6. **非必修發現**寫進追蹤,並標明價值閘判定(修或不修、依據哪一條)。這是價值閘的判定結果,不是把該做的事往後推;必修不得延後。
7. 不為流程本身另建工具,也不另加審查輪數。
8. 改到範例(`*.stories.tsx`)時,第 1 點實作與第 2 點規格核對都照 `rules/story-rules.md`「範例最高準則」與「Technical probe visibility」核對:只服務自動量測的 story 標 `test-only`,不做成給讀者看的範例。

## 本機檢查

各角色都照這段:只跑改到的檔在 CI 對應的檢查,每支在最後一個 commit 跑一次。

- **--selftest**:改到閘的腳本、MUTANTS 或突變所改的原始碼才跑;跑它時,印「現行原始碼(selftest 基準」的閘不另跑判定。
- **hook 測試**:只跑改到的那幾支(`npm run hooks:test -- test_x.sh`;改到共用 lib 或 registrations.json 就跑引用它的),全套只在 CI。
- **governance:generate**:改到治理輸入才跑;其餘與核對、合回只跑 governance:check,有漂移才 generate。
- **story 清單與 a11y 基線**:最後一次新增 / 改名 story 後重生一次。axe 違規只由 CI 判(`verify-browser-a11y` 全掃、對照基線),本機不另跑 axe 檢查。
- **Storybook**:閘需要才建(腳本寫「這支閘不需要 storybook」的不建);建好後沒改過任何檔(含丟掉的改動)就重用。

## 合回點

本機只跑合回新產生的變動(衝突解法、兩包都改到的檔)在 CI 對應的檢查 → 推送 → 讀回 CI。全套只在 CI 跑:CI 每個 PR 都跑全套,合併前要 CI 綠與發版同意,本機全套抓得到的 CI 都抓得到(見「依據」)。CI 紅:先找根因 → 修 → 再驗 → 再推。

發版說明的登記照 `packages/design-system/ds-canonical/references/props-naming.md`「相容政策」。

每個合回點記一次實測:花費、各包必修數、CI 第一次讀回結果。這是「迭代」要附的證據來源。

收尾給 user 看或決定的頁照 `governance/memory/feedback_propose_discipline.md` Sub-rule 7 篩;每項先寫出它改的 UI/UX 規格 檔:行(或範例本身的畫面變化),寫不出就 AI 自查。

## 依據

v1(輕做法 = 實作者照規格實作並自驗、沒有審查,本檔再加第 2 點;重流程 = 每包多道審查、修到沒有必修為止):

- WP-23 同任務盲評(兩位評審各自獨立、標籤隨機、去識別):兩位都選輕做法。重流程版漏做規格明文的一項、另改了範圍外 4 個檔;它的審查看到這項漏做,卻判成可交接、整包通過。輕做法 20 分鐘,重流程數小時。
- WP-17:輕做法 39 分鐘做完,重流程 6 小時以上 0 commit。
- 回溯:代理花費 72.6% 用在流程工具。出處:`governance/planning/2026-11-20-work-process-evidence.md`

v4:本機照 CI 逐條跑一輪(c4460faa)機器 294 分、牆鐘約 130 分,CI 同一套 20 分 58 秒;那輪 9 條紅,2 條真紅 CI 同一個 job 也跑,其餘是 mac 假紅與執行器問題。escape 閘一天單跑 226 分、非實作者約 41%。出處:`governance/planning/2026-11-26-work-process-evidence-v4.md`

v5:axe 全掃接進 PR 的 CI(與原夜間同一行指令、同一份基線),本機補跑 axe 的前提「CI 沒跑 axe」不再成立;本機 `--tag` 又不能配 `--gate`,判的是「任何 serious 就紅」,1,089 則裡 734 則帶既有違規。出處:`governance/planning/2026-11-26-work-process-evidence-v5.md`

## 迭代

- 流程只在本檔改。改動必附量測證據(同任務對照,或實測花費 / 品質),證據原文放 `governance/planning/` 新檔並登記在 `governance/planning/registry.json`。
- 每次改動在「版本紀錄」加一列(版本 / 日期 / 改了什麼 / 證據檔路徑),同時改檔頭版本;檔頭版本必須等於最後一列。
- 由 `scripts/work-process-ssot-invariant.mjs` 守(CI 必過):本檔每次載入、啟動面都指向、別處不重述、已退場說法不回流、引用路徑存在、「依據」段的數字在證據檔逐字出現。

## 版本紀錄

| 版本 | 日期 | 改了什麼 | 證據 |
|---|---|---|---|
| v1 | 2026-11-20 | 首版;取代 AGENTS.md「verify-to-perfection」與交接「修到某一輪 0 條必修」的多輪審查 | `governance/planning/2026-11-20-work-process-evidence.md` |
| v2 | 2026-11-22 | 加兩句:選做法前先查監督邊界;收尾頁照 Sub-rule 7 篩 | `governance/planning/2026-11-22-work-process-evidence.md` |
| v3 | 2026-11-22 | 「每一包」加第 8 點:改到範例時實作與規格核對都照 story-rules.md 兩段核對 | `governance/planning/2026-11-22-work-process-evidence-v3.md` |
| v4 | 2026-11-26 | 加「本機檢查」;合回點不重跑全套;核對者不重跑同 commit | `governance/planning/2026-11-26-work-process-evidence-v4.md` |
| v5 | 2026-11-26 | 「本機檢查」拿掉核對者補跑 axe(`--tag`):axe 改由 PR 的 CI 全掃判 | `governance/planning/2026-11-26-work-process-evidence-v5.md` |
