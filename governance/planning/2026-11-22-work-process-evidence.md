<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v2 的證據(2026-11-22)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v2 新加兩句的出處。只當出處,不是規則、也不是待辦;流程本身只住在那一檔。
> 證據類別:實測品質 —— 同一批工作(N1 發版前)11-22 實際出錯兩次,都是 user 指出的。不是同任務對照,也沒有花費量測。
> 出處都在當次工作的交接資料夾(不進 repo):state/DECISIONS.md 11-22 12:43、16:44、17:24 三則。user 原話照該檔逐字引。

## 1. 選做法前沒先查會不會跨監督邊界(v2「適用」段那一句)

- 發生什麼:要從 CI 拿審核包(要憑證才能下載的 artifact)。主線選的做法是「新增第二支讀憑證的程式 + 改安全掃描放行清單」—— 這一類必然被判成監督邊界、要 user 授權;不跨邊界的做法(例:讓 CI 把審核包的圖也放到公開的預覽站)卻沒先比較。
- user 原話:「但你為何他媽又給我作繭自縛？不是一百萬年前就叫你找到root cause並解決嗎？」
- 既有防線為何沒擋到:回覆閘只擋「句子把決定丟給 user」,擋不到「選了一條註定要 user 授權的做法」。
- 出處:交接 state/DECISIONS.md 11-22 12:43 一則(根因 ② 與對策)。

## 2. 收尾給 user 的頁沒照 Sub-rule 7 篩(v2「合回點」段那一句)

- 發生什麼:N1 確認頁把說明頁(設計規格頁)的圖、總表這些不屬 user 範圍的東西排進「要你看」。要 user 看的範圍 repo 早有 SSOT(`governance/memory/feedback_propose_discipline.md` Sub-rule 7),主線沒照做,又把同一條抄進交接,變成第二份。
- user 原話:「我他媽是不是有說過，只有會影響 UI/UX 的 SSOT 需要我決策或是需要我看？其他照你建議，我他媽說過一百萬次結果你還是沒有找到 root cause 解決？」「這些規格的文件樣式不影響消費者也不是DS 的UI/UX的SSOT，你他媽確定要我看？不是老早就講過了？」
- 修正後的篩法(16:44 對策):每一項先寫出它改的 UI/UX 規格檔:行號,寫不出就是 AI 自己處理。17:24 補:React story 範例本身的畫面變化仍要上頁(Sub-rule 7 原本就這樣寫),所以 v2 那一句在「規格 檔:行」之外也認「範例本身的畫面變化」。
- 出處:交接 state/DECISIONS.md 11-22 16:44、17:24 兩則。

## 3. 為什麼寫進 work-process.md,不寫交接

- user 原話:「以及按照我們之前所說這些工作流程的最佳典範應該不會只有套用在下一個session而是會有SSOT,然後所有 session都適用？」
- 兩條都要住在所有 session 開場就載入的流程 SSOT;交接只放指向。
- 出處:交接 state/DECISIONS.md 11-22 17:24 一則。
