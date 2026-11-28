<!-- Authority/status: governance/planning/registry.json -->
# 多包 / 多步工作流程 v6 的證據(2026-11-28)

> 用途:`packages/design-system/ds-canonical/rules/work-process.md` v6「每一包」第 1 點新加那一句的出處。只當出處,不是規則、也不是待辦;流程本身只住在那一檔。
> 證據類別:實測品質 —— 同一批工作(0.1.0-beta.152 收尾)2026-11-28 實際出錯一次,是 user 指出的。不是同任務對照,也沒有花費量測。
> 出處:當批交接資料夾(不進 repo)`tmp/wip-2026-11-25-backup/NEXT-SESSION.md` 第 126、129、131、164 行;user 原話另對照 Claude 對話紀錄逐字核對(session 前 8 碼 + 台灣時間)。出錯的那一包(ls 線,commit `361e7786`)只在交接的 bundle、還沒進 repo,下文對它的描述照交接的記錄,不是本包重新量的。

## 1. 規則落地改掉 user 已定過的畫面,實作者自行接受

- 發生什麼(交接 NEXT-SESSION.md:126):ls 線把留白規則落地,回報「Popover 設計原則『使用指引』的『進階篩選』『欄位顯示』浮層:底 12→48」。這兩則浮層的留白 user 早就定過;實作者把這個畫面變化當成規則落地的預期結果交回,協調者在合回前才攔下。
- user 原話(逐字,2026-11-28 01:08 e3ca5721):「進階篩選,欄位顯示早就定好了，且原因老早也都講清楚且也都有放進原則裡吧？還可以改壞是因為原則沒有寫清楚嗎？我當初不是千拜託萬拜託求你寫出一氣呵成的原則盡可能滿足夠種情境且通用且合乎邏輯且沒有衝突嗎？拜託我沒有要求就不要再給我亂動,好嗎？」
- 協調者的根因判斷(AI 推導,交接 NEXT-SESSION.md:129,不是 user 原話):原則本身寫得清楚;錯在落地 —— CSS / 閘只靠範例上的標記認「清單」與「一串條目」,手寫範例沒標就被當一般元素;實作者接受了畫面變化;協調者派工時沒寫「已定義情境不准變」。
- 既有防線為何沒擋到(AI 判斷):`work-process.md` v5「每一包」第 1 點只要求實作者照規格與 repo 規則實作、自驗,沒寫規則落地改到 user 定過的畫面時該怎麼做;落地造成的畫面變化看起來就是規格要的結果,實作者不會把它當成問題回報。

## 2. 新句子的來源

- user 原話(逐字):
  - 2026-11-28 01:08 e3ca5721:「…拜託我沒有要求就不要再給我亂動,好嗎？」(全文見第 1 節)
  - 2026-11-28 01:57 17e82e93,接手訊息裡的一句:「我沒要求的不要動;改到我已經定過的畫面就停下來回報。」—— 這整段接手訊息是 AI 在 e3ca5721 01:47 寫給 user、要 user 貼到新 session 的草稿,user 照貼送出(交接 NEXT-SESSION.md:164 也記了這段)。出處照實寫,不把它升格成 user 自己起草的話。
- 寫進 `work-process.md` 的句子(「規則落地若改變 user 已定過的畫面(決策紀錄 / 規格出處有 user 原話),停下回報,不得自行接受;user 沒要求的不動。」)是協調者依上面兩段整理的派工規則(交接 NEXT-SESSION.md:131「派工鐵律」),不是 user 逐字。本包只把交接裡的「決策總帳」(當批交接的 user 決定紀錄,不在 repo)改成 repo 通用的「決策紀錄」,意思不變。

## 3. 為什麼寫進 work-process.md「每一包」第 1 點,不寫 feedback_propose_discipline.md

- 住處判法照 `packages/design-system/ds-canonical/skills/design-system-audit/references/rule-placement.md` Level 6 判斷法:「這是『會變化的狀態』還是『固定的規則』? state → memory;rule → canonical rule/spec/skill」。這是固定的工作規則,不是狀態 → canonical `rules/`(Level 1),不是 memory(Level 6)。
- `work-process.md` 檔頭:多包 / 多步工作「怎麼實作、怎麼審查……只寫在這裡」,而且每次對話都載入;這次出錯的那一步在實作者手上 = 第 1 點。
- `governance/memory/feedback_propose_discipline.md` 管的是提案 / 回覆給 user 的寫法,不是實作;而且已到記憶檔行數上限(`governance/memory/contract.json` 的 maxLinesPerMemory = 100,該檔 2026-11-28 為 100 行)。
- 只寫一處,別處不重述(`work-process.md` 檔頭「其他檔只放指向本檔」)。
