---
name: feedback-orchestration-verify-before-scale
description: 多代理 / 長流程的編排紀律:先小樣本實跑 + 兩面對照再放大;量具量不到 = 儀器失效;交接資料不截斷;併行上限;修補不收斂就停下找根因;zsh 陷阱;被擋三選一;對 user 的數字從 log 擷取(2026-11-18 對抗稽核);交接常備(任何時刻停下都能被別的 session 接手)與額度用法(2026-11-25)。只寫原則與指標:流程的步驟、門檻、輪數照 rules/work-process.md,數值見當批交接的 settings
metadata:
  type: feedback
---

新的編排做法(工作流程、合回、量具、監看)一律先用 1–2 個樣本實跑並做兩面對照(故意弄壞會紅、還原會綠),證明可行才放大;不准「先放大、靠事後的檢查或 user 抓錯」。流程本身的改動另照 `packages/design-system/ds-canonical/rules/work-process.md`「迭代」。

**Why:** 2026-11-18 一天內同一族的錯換形狀反覆出現:重複量測、量具把沒跑完的 gate 判成通過、比對工具看不到新檔、子代理回報被截在 4000–6000 字(102 個 notDone 沒人接)、相依檢查被截斷而讓前置不成立的包開工、同時開 14 個代理把負載推到 72(逾時假紅、測試卡死 40 分鐘)、zsh 不拆變數 50+ 次、被擋後換寫法照跑、對 user 報了沒從 log 核對的數字(93/93 實為 91/91)。user 原話:「確定所有時間都花得有意義？最有效率同時確保品質完美？」「root cause 是什麼」「你這邊應該是否優先完成所有跟避免浪費資源同時確保產出品質完美的相關任務？這樣到時候接手的帳號就不會跟你一樣白痴亂揮霍了？」。完整稽核在當批交接資料夾 tmp/wip-2026-10-13/batch1-2026-11-10/handoff-2026-11-12/ 的 logs/process-audit-2026-11-18.md(tmp/ 不進 repo)。

**How to apply:**
- 量具 / 閘量不到東西 = 儀器失效,不准讀成通過;上線前先證明它該紅會紅。
- 子代理回報、相依條件、待辦一律給全文路徑,不嵌截斷字串;什麼要寫進追蹤、合回怎麼走,照 `rules/work-process.md`(本檔不重述)。
- 同時跑會跑整串檢查的代理有全機上限,看負載再開;上限與負載門檻的數值見交接 state/schedule.json 的 settings(本檔不抄數字)。
- 修補不收斂 → 停下找根因、改設計,不再修表面。本檔不寫門檻:什麼時候算不收斂、審查與再修照 `rules/work-process.md`,當批的停線輪數見交接 state/schedule.json 的 settings。
- Bash 工具是 zsh:每個指令第一行 `emulate sh`;不准 `<(…)`;管線結束碼先存檔。
- 被權限 / 分類器擋下只有三種處置:放棄 / 更安全的替代(寫明多了哪道保護)/ 交 user 決定;`git -C` 換寫法不算更安全;分類器寫「Let the user decide」就只能放棄或交 user。
- 推送前本機要跑哪些檢查、推送後怎麼讀回 CI,照 `rules/work-process.md`「合回點」(本檔不重述)。
- 對 user 的數字從 log 用指令擷取、時間用台灣時間、預估附算式與量測條件。
- 要交給 user 決定的項目,先逐項對照 `AGENTS.md#canonical-decision-authority` 的集合(含 Human-only boundaries)與發版同意、「# 自主執行 canonical」分權表(security / dependency / supply chain / CI = AUTO),標出類別;不在 ASK 類 = 自主處理,只寫進 commit / PR 說明 / 交接。「新、高風險、沒先例」不等於要問 user;子代理建議「交 user」也要先過這一關(2026-11-18 SEC1 誤列 user 決策項,user:「我又要決定什麼？確定按照工作流程是我要決定的？」)。
- 流程與工具都住在 repo(`rules/work-process.md`「適用」):多包 / 多步工作的步驟、門檻、輪數只照該檔;交接資料夾只放當批的狀態(例如上面 settings 的數值),不是流程規則或工具的來源。
- 本檔就是 repo 版(`governance/memory/`),以本檔為準;Claude home 的同名檔只是由 repo 單向同步出去、可重建的快取(`governance/memory/README.md`「用途」)。

## 交接常備與額度(2026-11-25 加;不屬下面「來源」重建的 11-18 原文)

1. **交接常備**:每做完一包、每個合回點、進入長等待(等 CI、等 user、預期停工)前,當場更新當批的任務總表與 NEXT-SESSION 交接。放在不會被清的地方:repo 工作目錄下不進版控的 `tmp/`,加上已推上去的工作分支;scratch / `/private/tmp` 3 天沒存取會被系統清掉(`reference_deploy_targets.md`「/tmp scratchpad 的壽命」那一段)。交接必含:做完了什麼(commit)、下一步的確切步驟、怎麼驗證(指令)、已定決策與 user 原話、待 user 回覆的題、只在本機的分支備份(`git bundle`)。標準:任何時刻停下,另一個 session 或另一家 provider 照交接就能無縫接手,不必回頭問。
2. **額度**:agent 看不到額度。user 一說剩多少,就照優先序(先 user 看得到的、會被擋住的,再其他)把額度用到約剩 1–3%,不提早停、不囤;快重置時還有剩就用完。因為第 1 條是常備的,停在哪裡都不會遺失。
3. **效率**:派工預算、分診、只驗改到的檔 → `AGENTS.md`「# 自主執行 canonical」的「分診與預算」與 `packages/design-system/ds-canonical/rules/work-process.md`(本檔不重述)。

機械提醒:user 訊息同一句裡提到額度 / quota,又帶百分比或「重置 / 用完 / 用光 / 快沒 / 剩」→ `packages/design-system/ds-canonical/hooks/check_propose_without_benchmark.sh` 注入一行指向本節;Netlify 等第三方免費額度的句子不觸發。

**Why:** user 原話(逐字;日期 + session 前 8 碼,出處 = 該 session 的 Claude 對話紀錄):
- 2026-09-29 1920833e「確保所有任務都沒有因為額度用光而被中斷、弄壞或是被遺漏，確保所有任務都有被持續追蹤直到完美收尾」
- 2026-10-21 1920833e「目前額度已經快要用完了 你看要怎麼收尾比較好 看收尾之後能不能讓我叫 codex 在同一個資料夾接手 然後確保接手的人都可以明確知道該做什麼該怎麼做 並明確知道驗證方式」
- 2026-11-05 95de79d8「我他媽因為額度的關係已經好幾個禮拜都沒有發版 就是因為你消耗了超多token每次都沒有把事情做完就用光了」
- 2026-11-17 96d711a5「剩下一小時的額度不瘋狂使用就浪費了，因為一小時後就要重置了」
- 2026-11-17 96d711a5「請你有效率的利用 token,確保品質也確保速度，然後不要浪費在沒有意義的事情上」
- 2026-11-25 99ca762e「還是要按照工作流程規範有效率的運用資源不浪費時間也不浪費token同時確保產出品質完美吧？真的做不完就是把交接文件寫完整寫完美讓其他 session 可以無痛無縫接軌，最好是用到只剩大概 1-3% 的額度就好，這個上一次就講過了，難道沒有在工作規範ssot內嗎？為何還要我一直講？我以後不管在任何 session 應該都不需要再耳提面命吧？」

「1-3%」這個數字只在 2026-11-25 這句找得到原文;前面幾句是這幾點的來源(AI 歸納,非原話):不因額度中斷或遺漏、可被接手、別浪費、快重置就用完。

相關:[[feedback_audit_discipline_full_sweep_deterministic_preflight]]、[[feedback_ai_ground_truth_unreliable_mechanical_primary]]、[[reference_auto_mode_sandbox_boundaries]]

## 來源

依 2026-11-18 21:23 寫入、21:40 修訂的原文重建。原文寫在 Claude home 快取,當晚 22:33 被 repo → home 的記憶同步覆蓋而消失;2026-11-22 從那次 session 的寫入紀錄(21:23 寫入全文、21:40 加「交給 user 決定」一條)取回。開頭原則、Why(錨例與 user 原話)、其餘各條照原文逐字,只改下面幾處:

1. 並行上限:原文寫了代理個數與機器核心數 → 只寫「有全機上限」,數值指向當批 settings。為什麼:規格要本檔只寫原則與指標、不抄數字。
2. 跟多包流程有關的句子改成指向 work-process.md:原文「帳本對帳、未指派就不准合回或請 user 發版」與「推送前 preflight」兩句,改成指向它的追蹤與「合回點」;開頭原則補「流程本身的改動照它的『迭代』」。為什麼:多包流程的步驟、門檻、輪數只住 work-process.md,別處不重述。
3. 加「修補不收斂就停下找根因」:原文沒有,是規格列的原則;不寫門檻,指向 work-process.md 與當批 settings,理由同上。
4. 交接位置照實:原文「這次這批的現行工具與規則在交接資料夾 RESUME.md §0 第 11 條與 HANDOFF-2026-11-18-PM.md」改成「流程與工具都住在 repo」的指向(work-process.md「適用」),因為交接資料夾不再是流程規則的來源;稽核紀錄補上交接資料夾的路徑並寫明不在 repo。
5. 原文「本檔是 home 記憶;應升格進 repo,升格後以 repo 版為準」→ 照實寫成本檔就是 repo 版。
6. 「相關」原指 feedback_anti_self_lock_release_transport;那份 2026-10-07 已併入 reference_auto_mode_sandbox_boundaries 第六節(`governance/memory/README.md`「Prune history」),改指向後者。
