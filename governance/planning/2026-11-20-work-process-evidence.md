<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v1 的量測證據(2026-11-20)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v1「依據」段的數字與出處。只當出處,不是規則、也不是待辦;流程本身只住在那一檔。
> 出處都在當次工作的交接資料夾(不進 repo);下面寫的是該資料夾裡的相對位置。

## 名詞

- **輕做法**(v1 採用):每包一位實作者照規格實作並自驗;一位沒參與實作的審查者只做規格逐項核對 + 跑相關 CI 檢查;有必修就修一次 + 再驗一次。
- **重流程**(v1 取代):每包實作 → 包 gate(含 hook 重播)→ 多道審查 → 修到某一輪 0 條必修才停;repo 端的對應寫法是 AGENTS.md 的「verify-to-perfection」。

## 1. WP-23 同任務盲評

- 設計:同一份派工規格兩臂各做一次(A = 重流程、B = 輕做法)。兩位評審各自獨立、標籤隨機、commit 訊息去識別,開獎前沒讀對應表。
- 結果:兩位評審都判 B(輕做法)較好。
- A 漏做規格明文要求的一項:breadcrumb 保留標記並插入 2026-11-18 複查行。驗收 exemption-expiry 新增筆數 A 只從 11 降到 10,B 降到 9。
- A 另改了範圍外 4 個檔(plannedPaths 以外):一支 canonical hook 的註解,以及跟著重算的 3 個生成檔(control-plane.lock.json、PROVENANCE.md、control-plane.json)。
- A 走過重流程的三道審查,都沒抓到這一項漏做。
- 時間:輕做法 20 分鐘(10:03–10:23);重流程經實作 → 重做 → 多次包 gate,數小時。
- 出處:
  - 交接 state/l2-20261120/evidence/hr4-abeval.json —— ev[].better 兩筆都是 "B";ev[].defectsA 兩位評審各列「漏做 breadcrumb」與「做多:plannedPaths 外 4 個檔」。
  - 交接 state/l2-20261120/evidence/ab-mapping.txt —— 「A=new B=base」(new = 重流程、base = 輕做法)。
  - 交接 state/DECISIONS.md 11-20 10:50 一則(兩臂起訖時間)、19:08 一則(盲評結果、三道審查沒抓到、流程決定)。

## 2. WP-17 同任務對照

- 輕做法:39 分鐘做完(10:03–10:43),自驗齊全。
- 重流程:同一包在層 2 flow(09:56 起跑)裡 6 小時以上 0 commit —— 包 gate 的 hook 重播逐段拆編輯,中間態解析不了被判成工具故障;重做時又碰到磁碟滿。
- 出處:交接 state/DECISIONS.md 11-20 10:50、16:33、19:08 各則;state/l2-20261120/evidence/layer2.json results[] 裡 WP-17 那一筆(0 commit)。

## 3. 回溯對照(不同任務,只看傾向)

- 建流程本身的代理花費合計 $1,147.47、約 69 代理小時(不含主對話)。
- 新 session 的代理花費裡,工具類佔 72.6%,產品類佔 27.4%。
- 每包代理花費:重流程 A123 $70.20,是舊做法平均 $42.77 的 1.6 倍。
- 結論原文要點:資料回答不了「同一任務有沒有顯著差異」(兩邊做的是不同任務),所以才補做上面兩個同任務對照。
- 出處:交接 state/l2-20261120/evidence/ab-retro.json(retro 的「浪費」段與 conclusion);state/DECISIONS.md 11-20 10:50 一則。

## 4. 決定之後的讀回

- 合回點沿用既有做法(合回 gate 跑 CI 導出的全部靜態檢查 + 建置 → 推送 → 讀回 CI)。第一個合回點讀回:CI 第 21 輪全綠(39 項 = 37 success、2 neutral)。出處:交接 state/DECISIONS.md 11-20 19:08(保留合回點)、19:29 一則。
- 輕做法一包實測花費:實作 $3.9–15、審查 $3.7–5.8、修正 $3.9、再驗 $1.9,每包約 $10–30;層 2 重流程 $150.76 只成一半。出處:交接 state/DECISIONS.md 11-20 20:13 一則。

## 5. 決定與收進 repo 的原因

- 流程決定:工程 / 治理類,AGENTS.md「自主執行 canonical」表列為 AUTO;主線依上面 1–3 節決定多包工作改輕做法(交接 state/DECISIONS.md 11-20 19:08 一則)。
- 收進 repo 當唯一住處:user 11-20 原話「我只是單純想確認我們最終驗證最能符合我們目標的工作流程是否會是一個讓所有 session 都參照的 SSOT 典範，當這個SSOT迭代也會同步到未來所有新的session」;目標原話「我要的是確保資源有效率的運用不要浪費同時確保產出品質完美」。新 session 讀的是 repo,不是交接資料夾,所以流程要住在 repo 的 canonical rule。
