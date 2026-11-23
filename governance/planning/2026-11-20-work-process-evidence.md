<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v1 的量測證據(2026-11-20)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v1「依據」段的數字與出處。只當出處,不是規則、也不是待辦;流程本身只住在那一檔。
> 出處都在當次工作的交接資料夾(不進 repo);下面寫的是該資料夾裡的相對位置。

## 名詞(兩臂實際做了什麼)

- **輕做法**(第 1、2 節對照裡的 B 臂;交接原文「不套新流程」):一位實作者只照派工規格與 repo 規則實作並自驗,然後 commit。這一臂沒有審查、沒有包 gate、沒有修正輪,所以第 1、2 節的時間只含實作與自驗。v1 在這一臂之上多了一位審查者的規格核對;那一步的實測花費見第 4 節。
- **重流程**(A 臂;交接原文「新流程」):派工設定是每包實作 → 包 gate(含 hook 重播)→ 審查,每次修正後再驗,直到某一輪 0 條必修才停;repo 端的對應寫法是 AGENTS.md 的「verify-to-perfection」。WP-23 這一臂實際走過:實作(0 commit)→ 重做(2 commit)→ 一位審查者判通過,中間包 gate 跑了多次。
- 出處:交接 state/DECISIONS.md 11-20 10:04 一則(對照臂的做法:只照 repo AGENTS.md 實作自驗,不用交接 gate / 審查迴圈 / 帳本);state/l2-20261120/evidence/ab-retro.json 的 a23、a17(B 臂實作者本人的回報與起訖時間,只有實作者一人);state/schedule.json settings.review(重流程的審查設定);state/l2-20261120/evidence/layer2.json results[] 的 WP-23 那一筆(A 臂的 impl / redo / verify 三份回報與 commit 數)。

## 1. WP-23 同任務盲評

- 設計:同一份派工規格兩臂各做一次(A = 重流程;B = 輕做法,交接原文「B = 不套新流程」,只實作 + 自驗)。兩位評審各自獨立、標籤隨機、commit 訊息去識別,開獎前沒讀對應表。
- 結果:兩位評審都判 B(輕做法)較好。
- A 漏做規格明文要求的一項:breadcrumb 保留標記並插入 2026-11-18 複查行。驗收 exemption-expiry 新增筆數 A 只從 11 降到 10,B 降到 9。
- A 另改了範圍外 4 個檔(plannedPaths 以外):一支 canonical hook 的註解,以及跟著重算的 3 個生成檔(control-plane.lock.json、PROVENANCE.md、control-plane.json)。
- 這一項漏做,A 的審查看到了,卻沒判成必修:審查回報 verdict = pass、mustFix 空;notDoneReview 把 breadcrumb 那一項判成 handoff-ok(交給後續包);minor[1] 寫明驗收「breadcrumb、button 兩筆過期消失」只做到 button。A 的實作者也在自己的回報 notDone 自報沒做(包 gate 的 hook 重播擋住)。範圍外那 4 個檔,審查在 checked 裡逐一列出並接受。
- 時間:輕做法 20 分鐘(10:03–10:23,只含實作與自驗,沒有審查);重流程經實作 → 重做 → 多次包 gate → 審查,數小時。
- 出處:
  - 交接 state/l2-20261120/evidence/hr4-abeval.json —— ev[].better 兩筆都是 "B";ev[].defectsA 兩位評審各列「漏做 breadcrumb」與「做多:plannedPaths 外 4 個檔」。
  - 交接 state/l2-20261120/evidence/ab-mapping.txt —— 「A=new B=base」(new = 重流程、base = 輕做法)。
  - 交接 state/l2-20261120/evidence/ab-retro.json a23 —— B 臂起訖 10:03:56–10:23:29,實作者一人的回報。
  - 交接 state/l2-20261120/evidence/layer2.json results[] 的 WP-23 那一筆 —— status pass;reports.verify 是 A 的審查回報(sha256 f4e9bbfa1bcb9e198541082fa9e9b184d29fb6cf192c265d01cdbdd7059f1a08),reports.redo 是 A 重做的實作回報(sha256 205078964a8894ebcc43139f856efa3d9018118f0636154c5862692835129682);上一點的 verdict / mustFix / notDoneReview / minor[1] / checked / notDone 都是這兩份的欄位。
  - 交接 state/DECISIONS.md 11-20 10:50 一則(對照臂起訖時間)、16:33 一則(重流程層 2 flow 起訖與 WP-23 結果)、19:08 一則(盲評結果、流程決定)。19:08 那則寫「新流程的三道審查也沒抓到」,和上面審查回報的欄位不符,以審查回報為準。

## 2. WP-17 同任務對照

- 輕做法:39 分鐘做完(10:03–10:43,只含實作與自驗,沒有審查),自驗齊全。
- 重流程:同一包在層 2 flow(09:56 起跑)裡 6 小時以上 0 commit —— 包 gate 的 hook 重播逐段拆編輯,中間態解析不了被判成工具故障;重做時又碰到磁碟滿。
- 出處:交接 state/DECISIONS.md 11-20 10:50、16:33、19:08 各則;state/l2-20261120/evidence/ab-retro.json a17(B 臂起訖 10:03:55–10:43:01,實作者一人的回報);state/l2-20261120/evidence/layer2.json results[] 裡 WP-17 那一筆(0 commit)。

## 3. 回溯對照(不同任務,只看傾向)

- 建流程本身的代理花費合計 $1,147.47、約 69 代理小時(不含主對話)。
- 新 session 的代理花費裡,工具類佔 72.6%,產品類佔 27.4%。
- 每包代理花費:重流程 A123 $70.20,是舊做法平均 $42.77 的 1.6 倍。
- 結論原文要點:資料回答不了「同一任務有沒有顯著差異」(兩邊做的是不同任務),所以才補做上面兩個同任務對照。
- 出處:交接 state/l2-20261120/evidence/ab-retro.json(retro 的「浪費」段與 conclusion);state/DECISIONS.md 11-20 10:50 一則。

## 4. 決定之後的讀回

- 合回點沿用既有做法(合回 gate 跑 CI 導出的全部靜態檢查 + 建置 → 推送 → 讀回 CI)。第一個合回點讀回:CI 第 21 輪全綠(39 項 = 37 success、2 neutral)。出處:交接 state/DECISIONS.md 11-20 19:08(保留合回點)、19:29 一則。
- v1 一包實測花費(交接原文稱「輕做法一包」,但已含審查,不是第 1、2 節只實作的那一臂):實作 $3.9–15、審查 $3.7–5.8、修正 $3.9、再驗 $1.9,每包約 $10–30;層 2 重流程 $150.76 只成一半。出處:交接 state/DECISIONS.md 11-20 20:13 一則。

## 5. 決定與收進 repo 的原因

- 流程決定:工程 / 治理類,AGENTS.md「自主執行 canonical」表列為 AUTO;主線依上面 1–3 節決定多包工作改用 v1:輕做法之上加一位審查者的規格核對(交接 state/DECISIONS.md 11-20 19:08 一則;該則把這套也叫「輕做法」)。
- 收進 repo 當唯一住處:user 11-20 原話「我只是單純想確認我們最終驗證最能符合我們目標的工作流程是否會是一個讓所有 session 都參照的 SSOT 典範，當這個SSOT迭代也會同步到未來所有新的session」;目標原話「我要的是確保資源有效率的運用不要浪費同時確保產出品質完美」。新 session 讀的是 repo,不是交接資料夾,所以流程要住在 repo 的 canonical rule。
