---
name: feedback-orchestration-verify-before-scale
description: 多代理 / 長流程的編排紀律:先小樣本實跑 + 兩面對照再放大;量具量不到 = 儀器失效;交接資料不截斷;併行上限;修補不收斂就停下找根因;zsh 陷阱;被擋三選一;對 user 的數字從 log 擷取(2026-11-18 對抗稽核)。只寫原則與指標:流程的步驟、門檻、輪數照 rules/work-process.md,數值見當批交接的 settings
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

相關:[[feedback_audit_discipline_full_sweep_deterministic_preflight]]、[[feedback_ai_ground_truth_unreliable_mechanical_primary]]、[[reference_auto_mode_sandbox_boundaries]]

## 來源

依 2026-11-18 21:23 寫入、21:40 修訂的原文重建。原文寫在 Claude home 快取,當晚 22:33 被 repo → home 的記憶同步覆蓋而消失;2026-11-22 從那次 session 的寫入紀錄(21:23 寫入全文、21:40 加「交給 user 決定」一條)取回。開頭原則、Why(錨例與 user 原話)、其餘各條照原文逐字,只改下面幾處:

1. 並行上限:原文寫了代理個數與機器核心數 → 只寫「有全機上限」,數值指向當批 settings。為什麼:規格要本檔只寫原則與指標、不抄數字。
2. 跟多包流程有關的句子改成指向 work-process.md:原文「帳本對帳、未指派就不准合回或請 user 發版」與「推送前 preflight」兩句,改成指向它的追蹤與「合回點」;開頭原則補「流程本身的改動照它的『迭代』」。為什麼:多包流程的步驟、門檻、輪數只住 work-process.md,別處不重述。
3. 加「修補不收斂就停下找根因」:原文沒有,是規格列的原則;不寫門檻,指向 work-process.md 與當批 settings,理由同上。
4. 交接位置照實:原文「這次這批的現行工具與規則在交接資料夾 RESUME.md §0 第 11 條與 HANDOFF-2026-11-18-PM.md」改成「流程與工具都住在 repo」的指向(work-process.md「適用」),因為交接資料夾不再是流程規則的來源;稽核紀錄補上交接資料夾的路徑並寫明不在 repo。
5. 原文「本檔是 home 記憶;應升格進 repo,升格後以 repo 版為準」→ 照實寫成本檔就是 repo 版。
6. 「相關」原指 feedback_anti_self_lock_release_transport;那份 2026-10-07 已併入 reference_auto_mode_sandbox_boundaries 第六節(`governance/memory/README.md`「Prune history」),改指向後者。
