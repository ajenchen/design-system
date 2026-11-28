# 待辦正本(整個 repo 唯一住處)

> **錨(user 2026-11-28 14:1x,逐字)**:「反正整個repo的待辦都整理乾淨，同一個root cause的不要重複，你自己發現然後自己列的任務，那些不動 ssot ui/ux的就是照你建議自己逐步修好，⏎⏎真的判斷要讓我看到的就是按照建議的排序讓我看」(⏎ = 原訊息換行)。同日更早:「確保整個 repo 的待辦都有統一管理」;14:3x:「確保那些待辦都是有查證過確認在當前狀態下依然是真的問題就好」。

## 三個檔

| 檔 | 是什麼 | 誰改 |
|---|---|---|
| `items.json` | 正本:每一項待辦(user 交代的、要 user 拍板的、AI 自己發現的、下游回報的) | 手改(Edit 逐項改),改完跑 `npm run governance:generate` |
| `user-view.md` | 給 user 看的那份:只列 user 交代的(`user-directed`)與要 user 拍板的(`user-decision`),照 `order` 排,AI 自己處理的只印一行總數 | `scripts/backlog.mjs --generate` 產生,**不手改** |
| `../../infra/governance/schemas/backlog.schema.json` | 欄位規格 | 改欄位時才動 |

## 規則(`scripts/backlog.mjs --check` 守,在 `npm run governance:check` 裡跑)

1. **只有這裡**:交接資料夾(`tmp/**`)、規劃文件、規格、程式註解都不另列待辦 —— 交接資料夾只寫 `BL-編號`;規格的「待 user 決定 / 待決 / 待定」那一句必須帶 `BL-編號`(題目與狀態住這裡,規格仍是畫面的正本);程式的 `TODO` / `FIXME` 註解必須帶 `BL-編號`。新建檔名像 TODO / TRACKER / OPEN-ITEMS / backlog / 待辦 的清單檔:已提交的會讓檢查紅(歷史 reference 檔列在 `scripts/backlog.mjs` 的允許清單),寫入當下由 `enforce_home_charter.sh` 擋(只在有本正本的 repo 生效)。
2. **同一個根因只有一項**:同根因的舊編號放 `oldIds`、細節放 `parts`;未結項的 `rootCause` 不得重複,同一句 user 原話不得出現在兩個未結項。
3. **user 類要有原話**:`user-directed`(user 交代之後要做)與 `user-decision`(要 user 拍板的產品／UI／UX 真取捨,`scope` = `product-ui-ux-decision`)必附 `source`(逐字原話 + 日期 + 出處)、`order` 與 `orderReason`。沒有原話的不得標這兩類 —— AI 判定要問 user 但還沒問過的,標 `engineering` + `askUser: true`,下一份決策頁一次問,問了有原話再改類別。
4. **AI 自己發現的**(`engineering` / `consumer-report`)必附 `valueGate`(① 看得到的錯 / ② CI 紅或弄壞既有 / ③ user 要求 / `recordOnly` 只記)與 `suggestion`(建議做法),由協調者照 `packages/design-system/ds-canonical/rules/work-process.md` 分批自動做,不進 user 的視圖。
5. **未結項要有查證**:`open` / `in-progress` / `blocked` 必附 `verifiedAt`(查證時的 commit 短碼)與 `evidence`(檔:行,或指令與輸出)。查不到、已修好、前提已不在的不收進來。`done` 必附 `doneRef`(版號或 commit),`dropped` 必附 `droppedReason`;做完改狀態,不刪項。
6. **給 user 看之前先重跑查證**:`node scripts/verify-backlog.mjs governance/backlog/items.json` 重跑有 `verifyCmd` 的項(輸出含 `fixedSignal` = 已解);沒有 `verifyCmd` 的照 `evidence` 人工核對一次。已解的先改成 `done` 再產生視圖、再給 user。

## 怎麼加一項

取下一個號(`BL-` + 三位數,不重用)、照 schema 填、`rootCause` 先在現有未結項裡找 —— 找到就併進那一項(舊編號加進 `oldIds`),找不到才新開。改完 `npm run governance:generate`,再 `npm run governance:check`。
