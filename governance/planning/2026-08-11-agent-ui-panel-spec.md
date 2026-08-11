<!-- Authority/status: governance/planning/registry.json -->
# AI Agent 面板規格(BACKLOG — 完整定稿存檔,尚未排入實作)

> **狀態**:2026-08-11 user 指示「先確保有完整有脈絡記錄下來,之後我們再安排,目前先放在 backlog」。
> **權威結構**:本檔 §〇 為唯一規範來源(user 草案逐字全文 + 27 條已拍板結論 + 增刪改對照 + 30 列窮舉表);§一之後為證據與歷史,非規範。
> **隔離令(user 同日指示)**:「不要讓這個規格汙染目前 ds 不該被汙染的地方」——在 user 排定實作前,**本檔任何條款不得寫入 `packages/design-system/src/**` 的 spec/tsx/token,不得生成 hook 或 M-rule**。實作啟動時,依 §〇 走正常 propose 流程。
> **對應 artifact**:https://claude.ai/code/artifact/f22888f5-8687-450f-83b4-4db30f92e08f(r53)
> **跨 session 錨**:home memory `project_agent_ui_draft_model.md` 指向本檔。
> **稽核履歷**:雙方對抗稽核(我方 43 項成立 + codex 7 組違規)已全數修復;27 條結論兩兩相容性掃描通過;未決項 0。

---

# Agent 面板規格 v1(草案 — POC 前)

> **本文狀態(2026-08-09 結論相容性稽核後)**:五名獨立審查者逐段對照 user 原話全集,提出 41 項矛盾指控,對抗驗證後 **27 項成立**,併為 10 條全部已修。**尚不可施工**,剩兩件:(1) 與 `AppShellAside` owner spec 的五處衝突需先做「沿用並修改 vs 自建」的決策;(2) 內容層(空狀態、串流生命週期、錯誤分類、權限傳播、鍵盤全旅程)密度仍薄。**待拍板產品題:零項**(先前掛著的「768–1023 抽屜怎麼辦」已由 user 草案模型 §〇 + 容量推導解決:兩線合一 = 1024)。「第二層 modal 蓋不蓋 agent」已由 user 2026-08-09 裁決為 B(不蓋);「主內容最差 392px」不是決策而是推導結果,已重新歸類。
>
> **本次稽核的最大發現**:本份規格最大宗的錯不是「把推論寫成 user 拍板」,而是**反方向**——把 user 已定調的結論降級成「尚未定案 / 未定義 / 契約管不到」。防線只防了升格、完全沒防降級,於是同一題被反覆當未決辯論。已於 M10 補 sub-rule 機械化。
>
> **另一個根因**:文件是按對話時間堆疊、不是按主題收斂——被推翻的舊段落原地不動,同一題有三四個時間層並存(遮罩基準三層、共存線兩層)。**規則已改:每個主題只能有一個現行段落,舊的當場刪除或標作廢。**
>
> **引用工具的已知盲點**(2026-08-08):`npm run peer:evidence-pack` 只驗「引用指得到、行號在範圍內」,**驗不出差一行**——它抽取 ±2 行上下文,off-by-one 仍會看到正確內容。本輪五路稽核即靠人工/LLM 逐句比對抓到四處漂移(`app-shell.spec.md:262`→`:261`、`sheet.spec.md:133`→`:132`、`sidebar.spec.md:276`→`:277`、Sheet 收合手勢誤指 sidebar 而非 sheet)。**結論:機械層驗可達性,語意對位仍需逐句讀。**

> **本文的憲法**:每條規則都必須指得出依據——既有 DS canonical(file:line)、世界級一手來源(套件版本 + 檔案 + 行號),或明寫「本案新訂」並附推導。無依據的數字與規則不得留在本文。repo 出處全部開檔驗證;外部出處記版本(可回放)或標「當次親讀、不可回放」。**沉默不算背書**:某規範沒規定某事,不得寫成該規範同意某事。

---

## ⚖️ 本文件的權威結構(2026-08-10 立,**先讀這段再讀任何其他段落**)

**問題**:這份文件是按對話時間堆疊出來的。同一個主題常有三四個時間層並存,被推翻的舊段落原地不動。獨立稽核的原話診斷:「**同題保留多套『現行』規則;實作者任選一段都能聲稱照規格做。**」

**解法**:

| 區段 | 地位 |
|---|---|
| **§〇(本段之下,含 27 條已拍板結論與窮舉表)** | **唯一規範來源。實作以此為準。** |
| **§一 以下全部** | **推導過程、證據、實測數據、歷史紀錄。不是規範。** |

**鐵律**:
1. **§一以下任一處與 §〇 牴觸,一律以 §〇 為準**,不需要另行判斷。
2. **新規則只能寫進 §〇**。寫在別處的不算數。
3. §一以下保留的價值是**為什麼**(證據與推導),不是**是什麼**。
4. 施工前只需讀 §〇;要追問「為什麼這樣定」才往下讀。

---

## 〇、user 草案模型(2026-08-09,**全文最高權威;每次推進前必先核對此節**)

> **user 逐字原話**(2026-08-09,一字未改):
>
> 「Appshell的右側側欄不管是否是 ai agent都應該跟目前既有的右側側欄行為差不多,右側側欄變為sheet時,若可以從sheet上開啟modal型態的內容,則sheet保留著然後直接疊一層modal覆蓋在sheet之上,若從sheet上點擊了需要透過appshell主內容來呈現的資訊則把sheet關掉,並在appshell完整呈現資訊,這些是在右側側欄只能以sheet呈現的情境才是如此,若右側側欄有佔位,則開啟時就是恆開啟,依此去看要開modal還是置換app shell主內容,
>
> 在 modal和ai agent都佔位的情況,ai agent內點擊要以modal呈現的內容則會重置舞台來用新modal呈現資訊,若點擊的是要以app shell來呈現的資訊,則會關閉整個modal,回到原本的 appshell+開啟的ai agent右側側欄,appshell主內容會呈現該呈現的內容,
>
> 換句話說,當appshell開始用sheet呈現右側欄的breakpoint應該要跟 modal 開始禁止同時使用 ai agent的 break point是相同的,會比較合理一致才對,
>
> 甚至可能也可以考慮是否在該 breakpoint 以下時,modal+ai agent的情境,ai agent會改成以 sheet 的方式疊加在 modal 之上,點 appshell形態的內容會自動關閉整個modal包括sheet應該就是自然而然的事了,但也要確保點擊modal型態的內容會關閉 sheet,這是跟 app shell 上的sheet 形態比不一樣的地方,主要有兩個原因,最重要的第一是點擊要展開的內容應該置放在最前面端出來給使用者看完整而不應該被sheet蓋住,第二個原因是若不關閉sheet加上modal可以無限堆疊的話,那可能會每一層都有展開的 ai agent sheet,感覺不是一個好的設計」

**user 對本節的定位(逐字)**:「請你確保這個我提出的草案模型你有銘記在心,不要到時候又給我鬼打牆,反正時時刻刻核對這個草案再依此推進」;並自陳「我並沒有認為我的概念完完全全完美無誤」——**所以本節是草案,可以被證據推翻,但不得被遺忘或悄悄改寫**。

### 拆成可判定的條款

**通則(不分是不是 agent,右側側欄一律適用)**

| 側欄形態 | 從側欄點的內容要用什麼呈現 | 結果 |
|---|---|---|
| **抽屜(sheet)** | modal | **抽屜保留**,modal 直接疊一層蓋在抽屜之上 |
| **抽屜(sheet)** | AppShell 主內容 | **關掉抽屜**,在 AppShell 完整呈現 |
| **佔位** | — | 開了就是**恆開啟**;再依內容決定開 modal 還是置換主內容 |

**agent + modal 都佔位時**

| 從 agent 點的內容要用什麼呈現 | 結果 |
|---|---|
| modal | **掃整疊**:從頂端往下掃,**找到第一個同種容器 → 換掉那一層並清掉它上面的**;**沒找到 → 疊上去**(2026-08-10 定案,取代先前的「重置舞台」與「一律疊上去」兩版)|
| AppShell 主內容 | **關閉整個 modal**,回到「AppShell + agent 側欄開著」,主內容呈現該內容 |

**線的合一(user 推出的關鍵一條)**

> **「AppShell 右側欄開始用抽屜」的 breakpoint = agent 與 modal 的**形態切換線**。一條線,不是兩條。**

**⚠️ 這條線不是「禁止線」,是「形態線」(2026-08-10 更正)**:
- **線以上**:agent **並排佔位**,modal 在舞台上,兩者左右並存
- **線以下**:agent 改成**抽屜疊在 modal 之上**,仍然可用

**先前寫成「線以下禁止同時開啟、modal 內不提供入口」是錯的**——那是 user 較早的講法,已被草案取代。

**線以下的形態(已定案,結論 7;來源:user 2026-08-09 草案第四段)**

該線**以下**、modal + agent 的情境:agent 改成**抽屜疊在 modal 之上**。

| 從 agent 抽屜點的內容 | 結果 |
|---|---|
| AppShell 主內容 | 自動關閉**整個 modal,含抽屜** |
| modal | **關閉抽屜**,開新 modal ← **與一般右側欄抽屜相反** |

user 給的兩個理由(逐字):「**最重要的第一是點擊要展開的內容應該置放在最前面端出來給使用者看完整而不應該被sheet蓋住**」/「**第二個原因是若不關閉sheet加上modal可以無限堆疊的話,那可能會每一層都有展開的 ai agent sheet,感覺不是一個好的設計**」

### 草案 → 現行:逐條增刪改(2026-08-10,user 要求「基於那份要如何增刪改」)

**規則**:草案原文(上方引言)**一字不改**。本節只記「哪一條還算數、哪一條被什麼取代」。

#### A. 草案原有條款的現況

| # | 草案條款 | 狀態 | 現行內容 | 為什麼 |
|---|---|---|---|---|
| 1 | 抽屜 + 從它開 modal → **抽屜保留**,modal 疊上去 | ✅ **不變** | 同左 | 未被任何證據推翻 |
| 2 | 抽屜 + 從它開 AppShell 內容 → **關掉抽屜**,主內容呈現 | ✅ **不變** | 同左 | 同上 |
| 3 | 佔位 → **恆開啟** | 🔧 **精確化** | **常駐但可收合**:系統不會因導航或開 modal 自動關它;**使用者按 X 或快捷鍵可以關** | 四家一致(VS Code / ClickUp / Slack / Cursor);MUI 文件逐字「until closed by user」 |
| 4 | 從 agent 開 modal → **重置舞台** | 🔧 **改寫(兩次)** | **掃整疊**:從頂端往下掃,找到第一個**同種容器** → **換掉那一層並清掉它上面的**;**沒找到 → 疊上去**
  **「同種」的比對鍵(2026-08-10 補,先前只說『同一種』沒定義,寫不出函式)**:註冊表每個目的地必須宣告 `containerKind`(例:`task` / `preview` / `list` / `settings`)。
  - **同 kind、不同 id** → 換掉那一層並清掉其上
  - **同 kind、同 id、但它上面還壓著別層** → **清掉它上面的**(不新增層、不重載內容)。
    ⚠️ **不可寫成「什麼都不做」**:堆疊是 `[任務A, 預覽]` 時在 agent 點任務 A,若不清掉預覽,**畫面完全沒變化** —— 這是已被否決的 UX(結論 17「不可以讓畫面毫無變化」)
  - **同 kind、同 id、且它已經在最上面** → **真的無事可做** → **不動堆疊,改在 agent 內給資訊型 `Alert`**(「『任務 A』已經開著」),讓使用者知道系統收到了
  - **沒宣告 kind** → 視為不命中 → 疊上去
  註冊表欄位因此為 `{ buildPath, presentation, authorize, containerKind }`。 | 「重置」在「開預覽」時會毀掉你的任務(user 自己抓出);「一律疊」在「填到一半又開新任務」時會疊出無意義的第三層(user 也抓出)。**掃整疊同時解掉兩個** |
| 5 | 從 agent 開 AppShell 內容 → **關閉整個 modal** | ✅ **不變** | 同左(整疊清空再導航) | 未被推翻 |
| 6 | **兩條線合一** | ✅ **不變 + 定數字** | **一條線 = 1024** | 容量推導:agent 下限 320 + Dialog 最小 512 + 邊距 96 = 928 → 取 1024;與 Atlassian 一致,也與既有推擠線同數 |
| 7 | **線以下:agent 改成抽屜疊在 modal 之上** | ✅ **已定義,取代較早的「禁止」** | 線以下**仍可共存,只是換形態**:agent 以抽屜疊在 modal 上。
  **從 agent 抽屜點 modal 內容 → ①關掉抽屜(一律)②舞台上照同一套規則(掃整疊:換 or 疊)**。
  **⚠️ 「關抽屜」是一律的,「舞台上換還是疊」不是**——2026-08-10 user 追問「一律會切換到舞台對吧」時釐清:抽屜一定關、畫面一定回到舞台,但**舞台上的內容是換是疊,線上線下同一套規則**,不另立第二套。
  **點主內容內容 → 關掉整個 modal 含抽屜** | **我先前標「未決」是讀錯**——把它當成「跟禁止互斥的另一條路」,其實它就是「線以下該怎麼辦」的答案,而且 user 連兩種點擊與理由都寫了。它**晚於**且**細於**較早那句「把 ai agent的入口拿掉並在此時禁止同時開啟」,**取代之** |

#### B. 草案沒有、但現在必須有的條款(全部由後續討論產生)

| # | 條款 | 從哪來 |
|---|---|---|
| 8 | **「疊」不用問;只有「換」和「關」才可能問** | 因為疊的時候底下那個還在,你沒有失去任何東西。**這是整套最舒服的一點**:agent 給你檔案,你點開看,**完全不會被打斷** |
| 9 | **「換 / 關」時,只有真的有未存內容才問,而且一次問全部** | Apple 逐字「you never want to display more than one alert at the same time」;ClickUp / Shopify 實機:空白時 **0 個對話框** |
| 10 | **確認框開著時,agent 的「一般互動」完全不受影響** | user 2026-08-10 更正:讀、打字、捲動、選字**跟舞台無關**,不該被擋 |
| 11 | **只有「要改變舞台」那一下會被擋** | 同上 |
| 12 | **被擋時:記住待前往,由「發起導航的那一方」顯示一條 `Alert`;確認框零改動** | user 否決「動態改對話框文案」(「太弔詭」「程式寫得很髒」);改把回饋放在發起端。`alert.spec.md:36` 逐字「持久性通知,嵌入在頁面中」正是此用途 |
| 13 | **取消 → 清掉待前往,回原狀;主要按鈕 → 做完原本的事,然後前往** | user 2026-08-10 提案。瀏覽器 `beforeunload` 同款;`useBlocker` 的 `proceed()` 逐字「proceed to the **blocked location**」;Superset 有實作且**不改文案** |
| 14 | **中途再點別的 → 後點的取代前一個** | 同上 |
| 15 | **三邊各知其事**:確認框**什麼都不知道**;導航層記「被擋 + 待前往」;發起端只訂閱並顯示 | 保持確認框通用,不被 agent 污染 |
| 16 | **「用主畫面開還是 modal 開」由目的地註冊表宣告,不解析連結** | 四框架一致(Android `<dialog>` destination / React Router `handle` / SwiftUI `.sheet` / Flutter `DialogRoute`)|
| 17 | **agent 永遠不被蓋住**;遮罩滿版,但 **agent 的圖層動態高於最上層遮罩** | ClickUp(801/802)與 Shopify(518/520)兩家實機同款機制 |
| 18 | **關掉 agent = 舞台變成整個視窗**(取代先前提的「放大鍵」) | user 2026-08-10:「直接把 ai agent關掉就是滿版了啊」;Shopify 實機驗證(關掉 Sidekick 後 Settings 自動擴張)|
| 19 | **Esc 由焦點所在決定關誰** | Shopify 實機:焦點在 Sidekick 時按 Esc,關掉的是 Sidekick 不是 modal |

#### D. 窮舉:所有情境的最終行為(自我檢查用,任何新規則都要能在這張表上跑一遍)

**維度**:舞台上現在是什麼 × 你在 agent 做什麼 × 有沒有未存內容。

| # | 舞台上現在是 | 你在 agent 做什麼 | 結果 | 會問嗎 |
|---|---|---|---|---|
| 1 | 主內容 | 讀 / 打字 / 捲動 | 正常 | — |
| 2 | 主內容 | 點一個**任務** | 開任務(疊在主內容上)| 不問 |
| 3 | 主內容 | 點一個**檔案** | 開預覽 | 不問 |
| 4 | 主內容(**沒改過**)| 點一個**清單頁** | 主內容換過去 | 不問 |
| 4b | **主內容本身是編輯中的表單(改了沒存)** | 點任何要換走主內容的東西 | 要換走 → **跳確認** | **要**(依結論 14/15;先前這 4 列完全沒有未存分支,是漏的)|
| 5 | **任務(沒改過)** | 點**另一個任務** | 掃到同種 → **換掉** | **不問** |
| 6 | **任務(沒改過)** | 點**檔案** | 沒同種 → **疊上去** | 不問 |
| 7 | **任務(沒改過)** | 點**清單頁** | 關掉任務,主內容換過去 | **不問** |
| 8 | **任務(改了沒存)** | 點**另一個任務** | 要換掉 → **跳確認** | **要** |
| 9 | **任務(改了沒存)** | 點**檔案** | **疊上去,任務還在底下** | **不問** ⭐ |
| 10 | **任務(改了沒存)** | 點**清單頁** | 要關掉 → **跳確認** | **要** |
| 11 | **預覽(底下壓著任務)** | 點**另一個檔案** | 同一個預覽**換內容**,不疊第二層 | 不問 |
| 12 | **預覽(底下壓著任務)** | 點**另一個任務** | 掃到底下的任務同種 → **換掉它,預覽跟著收掉** | 任務若有未存則**要** |
| 13 | **任務 + 填到一半的表單** | 點**另一個任務** | 掃到任務同種 → **換掉,表單一起收掉** | **要**(一次問,不逐層)|
| 14 | **確認框開著** | 讀 / 打字 / 捲動 | **完全正常** | — |
| 15 | **確認框開著(線以上,agent 並排)** | 點一個**要改變舞台**的東西 | **那一下不執行**;記住待前往;**agent 面板內出現 `Alert`(必要——你視線在右邊,左邊的震動看不到,且減少動態時根本沒有震動)**;舞台上的確認框震一下(輔助)| — |
| 15b | **確認框開著(線以下,agent 是抽屜)** | 點一個**要改變舞台**的東西 | **抽屜關掉、回到舞台** → 你看到確認框擋著;那一下不執行;記住待前往。**關抽屜就是回饋,不另加提示** | — |
| 16 | 確認框開著 + 已有待前往 | 又點**別的** | **待前往換成新的**(後點的贏),`Alert` 文字跟著換 | — |
| 17 | 確認框開著 + 已有待前往 | 按 `Alert` 上的「取消前往」 | **待前往清掉**,`Alert` 消失,確認框留著 | — |
| 18 | 確認框開著 + 已有待前往 | 確認框按**取消** | 回原狀繼續編輯,**待前往清掉** | — |
| 19 | 確認框開著 + 已有待前往 | 確認框按**主要按鈕** | 做完原本的事,**然後前往待前往那個** | — |
| 20 | 任何狀態 | **按 Esc** | **關掉焦點所在的那一個**(焦點在 agent 就關 agent;在 modal 就關最上層 modal)| — |
| 21 | 任何狀態 | **關掉 agent** | 舞台變成整個視窗,左邊的東西自然變滿版;**觸發點恆在** | — |
| 22 | **視窗 < 1024,modal 開著** | 開啟 agent | agent 以**抽屜疊在 modal 之上**(仍可用)| — |
| 23 | 視窗 < 1024,agent 抽屜疊在 modal 上 | 點一個**要用 modal 開**的東西 | **兩件事**:①**關掉抽屜**(線以下特有,與一般右側欄抽屜相反)②舞台上**照同一套規則**——掃整疊,命中同種就換、沒命中就疊 | 依 dirty |
| 24 | 視窗 < 1024,agent 抽屜疊在 modal 上 | 點一個**要用主內容開**的東西 | **關掉整個 modal,含抽屜**,主內容呈現 | 依 dirty |

#### 線以下 + 確認框開著(2026-08-10 user 更正,我原本寫反了)

**user 逐字**:「在線下,確認框開著時,又再點擊開啟 ai agent,又再點擊 ai agent 內以 modal 開啟的內容,**一樣是回到舞台啊,要讓使用者明白要完成舞台的確認框內容才能前進啊**,然後照上述邏輯運行啊」

**我原本寫「抽屜不關」——錯的,而且方向完全相反。**

| 步驟 | 行為 |
|---|---|
| 1 | 你在 agent 抽屜裡點一個要用 modal 開的東西 |
| 2 | **抽屜關掉,回到舞台** ← **一律,沒有例外** |
| 3 | **你看到舞台上那個確認框擋在那裡** |
| 4 | 待前往記著 |
| 5 | 你處理完確認框 → **前往那個目的地**(照 §〇 第 13 條)|

**⭐ 關抽屜本身就是回饋。** 你點了 → 抽屜收起 → **看到攔住你的東西** → 立刻明白「要先處理這個」。
**我原本的寫法(抽屜不關)反而讓使用者看不到攔住他的東西**,把唯一能解釋現況的畫面藏起來了。

**線以下不需要額外的「待前往」提示**——因果序列本身就講清楚了(你剛點、抽屜就關、確認框就在眼前),而且此時 agent 已收起、也沒有地方放提示。

**⚠️ 線以上完全相反,不能沿用這個結論(2026-08-10 user 更正)**:

user 逐字:「**線上會有機會畫面什麼都完全沒變化,那就是一個 ux 問題啊**」。

**我先前寫「確認框本來就看得見,所以不太需要提示」是錯的——看得見 ≠ 你會注意到它動了。**
- 你剛剛點的地方在**右邊 agent**,視線在右邊;震動發生在**左邊舞台**,你不會看到
- 開了**減少動態**的人**連震都沒有** → **畫面完全零變化**

**所以線以上的回饋必須發生在「你手剛剛點的地方」——也就是 agent 那一側。**

| | 回饋在哪 | 為什麼 |
|---|---|---|
| **線以上**(agent 並排)| **agent 面板內的 `Alert`**(必要,不是可選)| 你的視線在那裡;舞台上的震動只是輔助,且在減少動態時不存在 |
| **線以下**(agent 是抽屜)| **關掉抽屜**本身 | 畫面大幅變化,一定看得到 |

**線以上那條 `Alert` 是必要的,不能降級成「只用來說會去哪」。** 它同時承擔兩件事:**告訴你點擊被擋下了**、**告訴你處理完會去哪**。

#### 窮舉表補漏:四個與「待前往」有關的情境(2026-08-11 雙方稽核抓出,先前全缺)

| # | 情境 | 行為 |
|---|---|---|
| 29 | 堆疊 `[任務A, 預覽]`,在 agent 點**任務 A 本身** | 掃到底層同種同一筆且**上面有層** → **清掉預覽**,回到任務 A。不新增層、不重載 |
| 30 | 堆疊 `[任務A]`,在 agent 點**任務 A 本身** | 已在最上面 → **不動堆疊**,agent 內出資訊型 `Alert`:「『任務 A』已經開著」。**不可靜默無反應** |
| 25 | **待前往的目的地在等待期間被刪除／失去權限** | 確認框照常作用;**確認後不導航**,改在發起端的 `Alert` 就地換成錯誤訊息(「『任務 B』已不存在」),**待前往清掉**。不另跳新對話框 |
| 26 | **按 Esc 關掉確認框(不是按取消)** | Esc 等同「取消」→ **待前往一併清掉**,`Alert` 消失。**兩者結果必須一致**,否則同一個「不走了」有兩種後果 |
| 27 | **主要按鈕選了「儲存」但存檔失敗** | **不導航**、**不關閉確認框**、**待前往保留**;錯誤就地顯示在確認框內,讓使用者重試或改選捨棄 |
| 28 | **有待前往時,視窗跨過 1024** | 待前往**保留**;**回饋載體交接**——跨到線下時 `Alert` 隨 agent 收起而消失,改由「抽屜已關、確認框在眼前」承擔;跨回線上時 `Alert` 重新出現。**待前往本身全程不變** |

**第 28 列的原則**:待前往是**導航層**的狀態,`Alert` 只是它的**顯示載體之一**。載體換了,狀態不動。

**⚠️ 線上線下的唯一差別**:線以下多一個動作「**關掉 agent 抽屜**」。**舞台上怎麼變(換 or 疊、要不要問)完全相同,沒有第二套規則。**

**⭐ 第 9 列是整套設計的核心舒適點**:agent 給你一個檔案,你點開看,**完全不會被打斷**,因為你沒有失去任何東西。

#### E. 自我檢查:三輪反覆對照(2026-08-10)

**第一輪——每條新規則回跑草案**:19 條逐條對回 §〇 原文,**無一條與草案的四段原話牴觸**。第 4 條(重置 → 掃整疊)與第 7 條(進階選項)是僅有的兩處變動,都已在上表逐條記錄理由,**未悄悄改寫原文**。

**第二輪——窮舉表兩兩相容**:22 個情境逐對檢查,**未發現同一輸入得到兩個答案**。特別驗過三組容易打架的:
- 第 5/8 列(同樣是「點另一個任務」,差別只在有沒有未存)→ **一致,差異只來自 dirty**
- 第 6/9 列(同樣是「點檔案」)→ **兩列都不問,因為疊不會失去東西**
- 第 15/19 列(被擋 → 之後怎麼走)→ **一致,待前往只有一個來源**

**第三輪——找還沒被涵蓋的輸入**:
- 「agent 關著時點主內容的東西」→ 不在本規格範圍(那是既有 AppShell 行為,不變)
- 「確認框開著時按 Esc」→ 第 20 列涵蓋(關焦點所在的那個)
- 「同時有兩個確認框」→ **不可能發生**(Apple / Material / Fluent 三家規範 + 我們的規則都禁止)
- 「待前往的目的地在等待期間被刪除」→ **未涵蓋,已列入待補**

**待拍板產品題:零項。** 上表第 7 條先前被我誤標未決,實為 user 已定義(見該列)。

#### C. 已被明確否決的(留檔防重提)

| 被否決的 | 誰否決 / 為什麼 |
|---|---|
| 依內容類型分類(任務型/檢視型/確認型) | 沒有一家這樣分;且「要換還是要疊」不可能是新來那個東西的屬性 |
| 動態改寫確認框的標題或按鈕 | user:「太弔詭」;全世界只有 Superset 做 latest-wins **而且它不改文案** |
| 預覽走一個獨立的「單一預覽槽」 | 那也是分類的一種;掃整疊已經涵蓋 |
| 在預覽裡加「放大」鍵 | 關掉 agent 就是滿版,不需要多一顆鍵 |
| 深度上限(2 層 / 3 層) | ClickUp 與 Port 都不設限,靠設計減少層數;把觀察到的現象寫成規則是錯的 |
| 靜默清除未存內容 | Shopify 就是這樣(選了日文沒問就沒了),**明確不抄** |

### 研究結果(2026-08-09,獨立審查方一手證據;逐題回答草案模型的四個問號)

**一、一條線 = 1024**

推導(不是投票):最低容量 = **agent 下限 320 + Dialog 最小檔 512 + 邊距 48×2 = 928px**(`dialog.spec.md:80,91`)。
- 768:modal 只剩 352 → **不夠**
- 1024:餘 96px → **夠**
- 768–927 **必須不並排**(空間不足);928–1023 是保守帶。**兩者都改成抽屜疊上,不是「不給 agent」**

**外部對照**:[Atlassian](https://atlassian.design/foundations/grid-beta/applying-grid/) 1024 / [Carbon](https://carbondesignsystem.com/elements/2x-grid/overview/) 1056 / [Material window size class](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes) 840。**1024 與 Atlassian 一致,也與我們既有的推擠線一致 → 兩條線自然合一。**

**帶出的既有規格改動**:`app-shell.spec.md:219` 的 Aside 換殼線 **768 → 1024**。

**二、「點 modal 就關抽屜」有一手前例,而且理由一就夠**

- [Apple HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets):sheet 內再開 sheet **要先關前一個**
- [MUI temporary Drawer](https://mui.com/material-ui/react-drawer/):選取後即關

**user 的理由一(要看的內容該端到最前面)有規範背書,足夠。** 理由二(避免每層掛一個抽屜)可由「單例擁有者」解決,不必當理由。

**⚠️ 寫法要求**:這條**不是 agent 的特例**,而是**抽屜在兩種宿主下的行為差異**(user 2026-08-09 的講法:「sheet 只有在 appshell 和在 modal 上才會有一些交互的差異」):

  | 抽屜掛在哪 | 從抽屜開 modal 時 |
  |---|---|
  | **AppShell 上** | 抽屜**保留**,modal 疊上去 |
  | **modal 上** | 抽屜**關閉**,新 modal 端到最前面 |

  **同一個抽屜元件、同一套規則,差別只在宿主是誰。** 這樣寫就沒有「為 agent 開後門」的問題。

**三、兩種堆疊語意可以並存(有前例),但要把語意講清楚**

[W3C APG 的官方範例](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)同一頁就同時有「疊子 dialog」與「置換父 dialog」兩種。

**我們的語意由「從哪裡點的」決定(這正是 user 草案的寫法,比按內容類型分更簡單)**:

| 從哪裡點 | 語意 |
|---|---|
| ~~從 **agent** 點 → 要開 modal~~ | ~~**重置舞台**~~ **⚠️ 已作廢(2026-08-10)**:語意**不由「從哪裡點」決定**,一律走掃整疊 |
| 從 **modal 自己**點 → 要開 modal | **疊上去** |
| 任何地方點 → 要用 AppShell 呈現 | **全部清掉**再導航 |

**深度上限**:審查方曾建議「父 modal + 一層確認」(依 `dialog.spec.md:170-174`)。**已否決(結論 12)**:不設深度上限,靠設計減少層數(ClickUp / Port 皆如此)。

**四、「恆開啟」= 常駐但可收合**

四家一致:**系統不會因為導航或開 modal 而自動關掉它;但使用者按 X 或快捷鍵可以關。**
[VS Code](https://code.visualstudio.com/docs/configure/custom-layout) / [ClickUp AI Hub](https://help.clickup.com/hc/en-us/articles/36954958035863-AI-Hub) / [Slack](https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts) / [Cursor](https://docs.cursor.com/advanced/keyboard-shortcuts) 皆可關;MUI persistent drawer 文件逐字「until closed by user」。

### 草案模型沒涵蓋到的情境(研究後補上答案)

| 情境 | 答案 | 依據 |
|---|---|---|
| 抽屜疊在 modal 上,按 Esc 關哪個? | **不是新問題,照抽屜既有 SSOT**:抽屜本來就能用 Esc 關,那就關抽屜。點抽屜後方也只關抽屜,不穿透。(user 2026-08-09:「現在的抽屜若是可以透過 esc 關閉,那就是關抽屜啊?這邊就是跟抽屜 SSOT 啊,有什麼好討論的?」——**正確,我把既有 owner 已經回答的事拿出來重推**)| `sheet.spec.md:132` Esc 關閉(既有);機制上 `react-dismissable-layer@1.1.11/dist/index.mjs:59-66` 也保證只作用最上層 |
| 從第 3 層 modal 點「要用 AppShell 呈現」的內容 | **不屬本案範疇——這是 Dialog 自己的內容設計哲學**(user 2026-08-09 指出)。Dialog 是**用來完成任務**的元件,所以:**內容裡應盡量避免放會把人帶離任務的連結**;真要有,**另開新分頁**;只有「有助於完成本次任務」的連結才原地跳轉。
  真的發生時的機械行為:**原子式全部清掉再導航**(不是一層層關)| user 原話 + [Android backstack](https://developer.android.com/guide/navigation/backstack/dialog);Dialog 定位見 `dialog.spec.md`「何時用」 |
| 抽屜 → modal 的切換 | **原子式置換**(不是先關再開兩個動作);焦點直接進新 modal,舊觸發點若已消失則落到邏輯上的接手目標 | [APG dialog-modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) |
| 視窗跨過 1024 | **只切 agent 形態(並排↔抽屜),不動舞台內容** → **不觸發任何確認框**;開著的保持開著,session、串流、未存內容原封保留;**X 不等於停止生成**(本案新訂 + 推導:跨線既不換也不關,依結論 14 不該問)| 本案新訂 |
| **a11y 誠實性** | agent 與 modal 同時可操作時,**agent 必須屬於同一個 active stage**;否則那個東西不能自稱 modal(APG 要求 modal 以外一律 inert) | [APG](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) |

**審查方查不到的(UNVERIFIED)**:同形抽屜的精確產品前例、產品是否從不自動關、928–1023 的實際生產力損失、外部規範有沒有要求兩線合一。

### 2026-08-09 最終定案:一律疊加,不分類,不設限

**我在這題上把同一個病犯了三次**,每次換個名字又端出來:

| 第幾次 | 我的講法 | 本質 |
|---|---|---|
| 1 | 任務型 / 檢視型 / 確認型 三分法 | **分類** |
| 2 | 幾何一致,但「任務 vs 檢視」決定要不要毀掉舞台 | **分類** |
| 3 | 「取代」vs「蓋住」兩個動作 | **還是分類** |

**user 一句話點破結構性錯誤(2026-08-09 逐字)**:

> 「何時要取代何時要保留狀態到底哪裡定義的完?極有可能遇到你壓根沒想到的情境不知道到底該疊還是該取代啊,而且取代跟重置是兩種不同成本的設計吧?取代更困難吧?**你必須判斷當前的modal到底是要被取代還是要被堆疊,不是透過開啟的modal可以直接決定行為的欸**」

**這才是致命的一點**:「要取代還是要疊」**不可能是「新來的那個東西」的屬性**——它取決於**現在舞台上是什麼、以及使用者想不想留著它**。新開的 modal 根本無從得知。**所以任何「靠分類目標來決定行為」的設計,結構上就不成立。** 我三次都在做這件不可能的事。

**user 另外兩點也對**:
- **ClickUp 與 Port 都沒有限制堆疊層數**——它們是**靠設計減少層數**(不在 modal 裡放會把人帶走的連結),不是靠規則設限。我先前把「觀察到的結果(≤2 層)」寫成「規則」,是把現象當成規範。
- **取代比重置貴**:重置只要清空,取代要先判斷「取代誰」。既然判斷不可能,取代這條路本來就走不通。

**定案:唯一的規則,沒有例外,沒有分類。**

> ~~從任何地方點開「要用 modal 呈現」的東西 → 一律疊上去。~~ **⚠️ 已作廢(2026-08-10),被「掃整疊」取代**
> **關掉 → 退一層。X / Esc / 點遮罩 完全照既有行為,一個字不改。**
> **點開「要用主畫面呈現」的東西 → modal 全部收掉,主畫面顯示它。**
> **agent 永遠在右邊,永遠可用,永遠不被蓋住。**

**沒有「取代」這個動作。沒有「預覽走特別的槽」。沒有分類。**

**深度怎麼辦——照 ClickUp 與 Port 的做法:靠設計,不靠設限。**

| 手段 | 內容 |
|---|---|
| **不設硬上限** | 與 ClickUp / Port 一致 |
| **只掛頂層** | 疊十層也只有一份 DOM、一個焦點鎖;舊層只留狀態 |
| **同一個目標不重複疊** | 點兩次同一個東西不會變兩層 |
| **設計紀律(主力)** | modal 是**用來完成任務**的元件,內容裡本來就該避免放會把人帶走的連結;要放就另開分頁。**這條是 user 自己講的**,也是 ClickUp / Port 實際在做的事 |

**為什麼這樣就夠**:使用者最常見的路徑是「開任務 → 做完 → 關掉」,深度自然是 1;「開任務 → 確認 → 關掉」深度 2。要疊到很深,得刻意一直往下點——那時 Esc 連按也退得回來,而且 **agent 一直都在,隨時可以從它去別的地方**。

**user 原案的「重置舞台」怎麼辦**:**不需要了**。原本要它是為了避免層數爆炸,但只掛頂層之後層數本來就不是成本;而且「從 agent 點東西」**視覺上仍然像切換**(你只看得到最新那個),差別只是多一條回頭路。**這是加法,不牴觸「agent 是切換器」。**

### 唯一的例外規則:同一種容器就換內容,不疊(2026-08-09 user 提出,研究後採用)

**user 逐字**:「從 agent 開啟的 modal 基本上以直接在舞台堆疊為主,但若遇到最上層 modal 與欲開啟的 modal 是**塞同一種內容的容器只是透過 id 去 render 不同內容**的話,可以讓該 modal 去決定是否取代最上層的同一種類 modal」

**這不是分類,是身分比對。** 前三輪被否掉的都是「判斷這東西是什麼類型」(要用腦);這一條是「**從堆疊頂端往下掃,新來的跟哪一層是同一種容器**」(機械比對)。**沒有任何需要判斷的地方。**
**⚠️ 先前寫「只比最上層」是錯的(2026-08-10 抓出)**:窮舉表第 12 列(預覽壓著任務,點另一個任務)在只比最上層時永遠不命中,兩處直接打架。

**四個框架都內建這個東西,而且「相同」都比容器種類、不比 id**——正是 user 描述的「同一種容器、只是 id 不同」:

| 框架 | 機制 | 「相同」怎麼判 |
|---|---|---|
| [Android](https://developer.android.com/guide/components/activities/tasks-and-back-stack#TaskLaunchModes) | `launchMode="singleTop"` → 走 `onNewIntent` | 比**最上層的 component / type**,**id 不比** |
| [React Navigation](https://reactnavigation.org/docs/8.x/navigation-actions/) | `navigate` 同 name 更新參數、不 push;`push` 必新增 | 比 **route name**(要比 id 得另外用 `getId`)|
| [Flutter](https://api.flutter.dev/flutter/widgets/Page/canUpdate.html) | Pages API `canUpdate` | 比 **runtimeType + key** |
| [Web History](https://html.spec.whatwg.org/multipage/nav-history-apis.html#the-location-interface) | `location.replace()` | 不比,直接換掉當前那筆 |

**產品實測:四家全部是「換」不是「疊」**

| 產品 | 操作 | 結果 |
|---|---|---|
| [Linear Peek](https://linear.app/docs/peek) | ↑↓ 切 issue | **換** |
| [Notion Side peek](https://www.notion.com/help/keyboard-shortcuts) | peek 前/後 | **換** |
| [Jira 側面板](https://support.atlassian.com/jira-software-cloud/docs/view-content-in-a-side-panel/) | 任一內容 | **換**;**連異種也只有單槽** |
| [Dropbox](https://help.dropbox.com/view-edit/preview) | 左右滑切檔案 | **換** |

**決定權放哪(我原本問錯了)**:不是「讓那個 modal 自己臨場決定」,而是——

> **路由層一律依 `containerKind` 掃整疊比對。目的地不需要、也不得宣告「我可不可以被重用」。**
**⚠️ 先前寫成「目的地宣告可重用」是錯的**——那等於恢復「靠目標屬性決定行為」,而那已被否決。

這是 [Android Navigation](https://developer.android.com/guide/navigation) 的分工。**modal 本身一行都不用改**;它只是被宣告成某一種 kind。

**返回語意的坑,以及正確解法**

取代之後,上一個從歷史裡消失(Android / Web 皆如此)。點檔案 A → 檔案 B → 按返回,**不會回到 A**。

**但這不是問題,因為預覽本來就不該靠返回鍵走**——研究指出關鍵區分:

| 性質 | 返回鍵行為 | 正確的走法 |
|---|---|---|
| **導航**(去一個新地方) | 回上一個 | 返回鍵 |
| **viewer 內選取**(在同一個檢視器裡換看的東西) | **回底層,不回上一個** | **viewer 內的「上一個 / 下一個」** |

**所以預覽要在 viewer 內給前/後兩顆**(Linear ↑↓、Notion 前/後、Dropbox 左右滑、[macOS Quick Look](https://support.apple.com/guide/mac-help/preview-a-file-mh14119/mac) 都是這樣),**關閉就回到底下那個任務**。這樣「A 從歷史消失」根本不會被感知到——你本來就是用前/後在同一個檢視器裡走。

**焦點去哪(2026-08-11 定案,純推導自既有規範,無取捨)**:

| 掃整疊的四種結果 | 焦點 | 依據 |
|---|---|---|
| **換掉某層**(同種不同筆) | 進新內容的第一個互動元素 —— 與開新 modal 同待遇 | `dialog.tsx:87` AutoFocus canonical + [APG dialog-modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/);規格 :298 已定「抽屜→modal 原子置換,焦點直接進新 modal」,此處同型 |
| **清掉上面的層、露出底下那層** | 進**被露出那層**的第一個互動元素 | 這是「往裡走」不是「關閉」,**不可套用關閉的『焦點回觸發點』** —— 觸發點在 agent,回去等於視線在左、焦點在右 |
| **疊上去**(沒命中) | 進新層第一個互動元素 | 同上第一列 |
| **已在最上面、不動堆疊** | **焦點不動**,只出 `Alert` | 沒有新內容可進;`Alert` 用 `aria-live="polite"` 播報,不搶焦點([APG alert](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)) |

**深層連結進來時的堆疊怎麼還原(2026-08-11 user 拍板 + 實機修正)**

user 逐字:「只帶最上層吧?**而且也不一定真的是帶到最上層吧?如果最上層是基於某個 Id 呈現的 modal 之上的 modal,那會有 URL 嗎?**」

**修正:「帶最上層」的講法是錯的 —— 實機證明不是每一層都有網址。**

同一個 Shopify 設定頁裡實測(本案 §四 實驗):

| 動作 | 網址 |
|---|---|
| 新增**地點** | `/settings/locations` → `/settings/locations/new`(**變了**)|
| 新增**使用者** | **完全不變** |

同一頁、同一種浮層,一個有網址一個沒有。**故定案:**

> **網址指向「最深的那個有自己網址的層」。沒有自己網址的層,重整後不還原。**

**「有沒有網址」的機械判準 = 它在不在目的地註冊表裡**(有 `buildPath` 就有網址)。像「新增欄位」那種當場開的對話框不在註冊表內,本來就無網址 —— 不需要新規則,沿用既有註冊表即可。

**行為自洽**:無網址的層通常就是「填到一半、還沒存」的東西;重整不還原它才是對的。

**配套(工程層,無取捨)**:app 內導航的未存確認框攔不住瀏覽器重整,故有未存內容時需掛 [`beforeunload`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)(瀏覽器自己的離開提示,文案不可自訂 —— 規範明定)。

**還要定義的事:無。**
(先前列的另外兩件已定案:未存內容 → 結論 15「真有未存才問、一次問全部」;轉場 → 結論 23「一次淡入淡出 200–250ms,不可分段」。)

### 怎麼知道要用主畫面開還是用 modal 開(2026-08-09 user 提問,研究後定案)

**user 問**:「那要怎麼自動判讀 modal 右側 ai agent 開啟的是要用 appshell 開還是要用 modal 開?透過連結解析?」

**答:不解析連結。用一張目的地註冊表。** 「用主畫面還是 modal」是**那個東西是什麼**的屬性,不是**那串網址長怎樣**的屬性。

**四個框架都把呈現方式宣告在路由表上,無一例外**:

| 框架 | 怎麼宣告 |
|---|---|
| [Android Navigation](https://developer.android.com/guide/navigation/design/dialog-destinations) | 逐字:「use the `<dialog>` element to add the dialog to your navigation graph」——相對於 `<fragment>` 這種佔整頁的目的地 |
| [React Router](https://reactrouter.com/how-to/using-handle) | route 的 `handle` 可存「any application-specific data」,呈現方式登記在此 |
| [SwiftUI](https://developer.apple.com/documentation/swiftui/understanding-the-navigation-stack) | `.navigationDestination`(整頁)與 [`.sheet`](https://developer.apple.com/documentation/swiftui/view/sheet%28item%3Aondismiss%3Acontent%3A%29)(浮層)分開宣告 |
| [Flutter](https://api.flutter.dev/flutter/material/MaterialPageRoute-class.html) | `MaterialPageRoute`「replaces the entire screen」vs [`DialogRoute`](https://api.flutter.dev/flutter/material/DialogRoute-class.html) |

**最簡契約(定案)**:

```
agent 工具回傳 → DestinationRef { kind, id }        ← 只有「是什麼」和「哪一個」
                        ↓
              registry[kind] → { buildPath, presentation, authorize }
                        ↓
              路由層決定:主畫面 or modal
```

**三條硬規則**:
1. **agent 不得指定呈現方式**——它只能說「去任務 123」,不能說「用 modal 開」。否則 agent 可被誘導把東西開在非預期的地方。
2. **presentation 只住在註冊表**,新增一種東西 = 註冊表多一列,不改任何字串規則。
3. **只有真的只拿到網址時**才做路由比對([`matchRoutes`](https://reactrouter.com/api/utils/matchRoutes) / [`matchPath`](https://reactrouter.com/api/utils/matchPath)),**絕不用正則猜**。

**Next.js 的攔截路由不適用(查過了)**:它解的是「**同一個網址,從應用內點是 modal、直接開是整頁**」——呈現方式**隨進入脈絡改變**。我們是「去它的家」、呈現固定,**不需要這套機制**([官方定義](https://nextjs.org/docs/app/api-reference/file-conventions/intercepting-routes))。省下一整套複雜度。

**AI 產品的實際做法是混用**(所以兩層都要有):[OpenAI](https://developers.openai.com/plugins/build/mcp-server#return-useful-results-without-ui) 支援 `structuredContent` 並要求穩定 ID;[Claude citations](https://platform.claude.com/docs/en/build-with-claude/citations#response-structure) 是結構化陣列;[Copilot](https://code.visualstudio.com/api/extension-guides/ai/chat#supported-chat-response-output-types) 同時支援 Markdown 連結與具型別的 Anchor/Reference;[Notion](https://developers.notion.com/workers/guides/tools#return-structured-output) 官方偏好結構化物件;**[Linear](https://linear.app/developers/agent-interaction) 的正文明示就是用純網址**。

### ⚠️ 安全:agent 產出的連結不能直接拿去導航(研究補的,我原本沒想到)

**agent 的輸出是不可信輸入。** 防線逐條:

| # | 規則 | 依據 |
|---|---|---|
| 1 | **禁止把 agent 字串直接餵給導航函式** | [Next 官方警告 `javascript:` 會執行](https://nextjs.org/docs/app/api-reference/functions/use-router) |
| 2 | 先用 `URL` 解析,**同 origin 才交給路由比對** | — |
| 3 | 比對出目的地後**重新驗權**(不因為 agent 說得出來就代表使用者有權看)| — |
| 4 | 未知的內部路徑 → 走 404,不猜 | — |
| 5 | 外部網址 → **只允許 `https:` + 白名單或確認頁**,新分頁開啟並帶 `noopener` | [OWASP 未驗證轉址](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) |

**注意本 repo 目前沒有任何路由器**(`apps/` 內查無 react-router 等),所以這是第一次引入路由概念,更該一次到位。

### 確認框開著時,從 agent 點東西會怎樣(2026-08-09 user 抓到的洞 → 研究後定案)

**user 抓到的洞(逐字)**:「當 task modal 彈出了一個警告 dialog,此時在 agent 打開一個 task 則會疊加,但若是在沒有警告的狀態則會置換?這樣是合理的嗎?使用者是否會困惑?」

**成立。** 同一個動作,結果取決於「剛好有沒有警告開著」——那是偶然,不是意圖。而且新任務會壓在一個**正在等你回答的警告**上面,語意本身就錯。

**定案:確認框開著時,agent 的導航被延後——先回答確認框,答完才執行。**

**兩個實機證據**:

| 產品 | 實測結果 |
|---|---|
| **ClickUp** | 警告開著時點 AI Chats,**只關掉警告,點擊被吃掉、沒有導航** |
| **VS Code**(1.132 macOS)| 存檔提示開著時,**Chat 面板不可達**([原始碼:全窗遮罩](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/dialog/dialog.css#L6-L17))|

**四家規範一致**:[APG alertdialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/) 要取得回應、外部 inert;[Apple](https://developer.apple.com/design/human-interface-guidelines/modality) 阻擋 parent、須明確 dismiss、**且要先關舊 modal**;[Material](https://m2.material.io/develop/web/components/dialogs) 停用整個 app;[Fluent](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/dialogs-and-flyouts/dialogs) 阻擋整個視窗。

**這條同時把洞補平了**:確認框必須先回答 → 導航執行時**不會壓在一個等你回答的警告上面**。
**⚠️ 先前寫「堆疊一定是乾淨的 `[任務]`、最上層一定是任務」是假前提**:窮舉第 9 列就會產生 `[任務, 預覽]`。**正因為堆疊可能多層,才必須掃整疊,不能只比最上層。** → **同種換內容的規則每次都得到一樣的結果**。**「剛好有沒有警告」這個變數消失了。**

**不需要自己造輪子**:[React Router 的 `useBlocker`](https://api.reactrouter.com/v7/functions/react-router.useBlocker.html) 已內建 blocked target / proceed / reset 三件事,正好是這個 guard。

**兩個被否掉的替代方案**:
- **CLEAR_TOP 語意**(同種在堆疊任何位置找到就清掉上面的)→ **不作為產品規則**。它只解 stack 結構,**放行之後才適用**;而且會默默關掉一個正在問你問題的警告。
- **從 agent 點一律清空整疊**(user 最初的「重置舞台」)→ **否決**。未回答就丟掉整疊與無關狀態,**零正向一手先例**。

**「agent 永遠可用」與「導航被擋」不矛盾(研究確認)**:**可以聊天 ≠ 副作用可以立刻執行**。做法:
1. 面板顯示**待處理的目的地** + 一顆取消
2. 確認框選「儲存」或「捨棄」→ 執行導航;選「留下」→ 取消該導航
3. **最後一個指定的目的地覆蓋前一個**(latest target wins)

**一個 a11y 推論**:若 agent 與確認框在同一份 DOM 且 agent 仍可輸入,那個警告**只能是 pane-local,不得宣稱 app-wide `aria-modal`**——與「舞台上的東西不能自稱 modal」是同一條線。

**UNVERIFIED**:Linear / Notion / Jira / Figma / Cursor 的「確認框開著時導航」行為查不到;規範對「agent 排隊等候的導航」沒有逐字規定。

### 競品盤點:還有誰做「AI agent 側欄 + modal 並存」(2026-08-09)

**門檻(三條全過才列)**:①產品內建可對話、會做事的 AI 助理 ②以側面板常駐或可常駐 ③產品大量使用 modal。

**已實機驗證(本次唯一)**

| 產品 | agent | 怎麼重現 | 並存? | 幾何 | 觸發點 |
|---|---|---|---|---|---|
| **Airtable** | **Omni** | [airtable.com](https://airtable.com) → 任一 base → 左側 `Open Omni` → 右上 `Share` | **是**;dialog 開著時 Omni 輸入框仍可用、hit-test 可點 | Omni 約 **460px 推擠內容**;Share dialog **只疊在內容區、沒有滿版遮罩** | base 左側;interface 右下 |

**這是第三種幾何**——加上先前兩家,三家用三種做法達到同一個結果(agent 不被蓋住):

| 產品 | 幾何 |
|---|---|
| ClickUp | 遮罩滿版,agent **疊在遮罩之上** |
| Port | 遮罩**依 agent 寬讓位** |
| **Airtable** | **根本沒有滿版遮罩**,dialog 只蓋內容區 |

**有官方文件、未實機**

| 產品 | agent | 官方文件說什麼 |
|---|---|---|
| [Tableau](https://help.tableau.com/current/online/en-us/web_author_einstein.htm) | Tableau Agent | **並存 = 是**;面板內 `Add Filter` 會開 Filter dialog,官方截圖顯示 **dialog 在畫布上、面板保留** |
| [Shopify](https://help.shopify.com/en/manual/ai-powered-tools/sidekick/set-up) | Sidekick | **手機上有 dialog 時 Sidekick 不可用,必須先關 dialog** ← **重要反例** |
| [ServiceNow](https://www.servicenow.com/docs/r/application-development/ui-builder/uib-now-assist-panel.html) | Now Assist Premium Chat | 面板預設固定/釘住,也可取消釘住變浮動;開 record 時收成釘住態 |
| [Power BI](https://learn.microsoft.com/en-us/power-bi/explore-reports/copilot-pane-summarize-content) | Copilot | 右側報表面板;從回覆點 feedback 會開 dialog |
| [HubSpot](https://knowledge.hubspot.com/ai/use-breeze-assistant) | Breeze Assistant | 右側面板;刪 prompt 會開確認 dialog;[rich content 另開緊鄰 chat 的 canvas](https://knowledge.hubspot.com/ai/create-rich-content-with-breeze-assistant) |

**Shopify 那條**:它在手機上採「dialog 出現就停用 agent」。**我們不採用這條**——我們線以下是「agent 改成抽屜疊在 modal 上、仍可用」(§〇 第 7 條)。留檔僅供對照。

**查過但不符合門檻(留檔,免得未來又被當候選)**:[Asana](https://help.asana.com/s/article/chat-with-dash?language=en_US) Chat with Dash 尚未正式推出;[Webflow](https://help.webflow.com/hc/en-us/articles/33961195523603) 的 AI Assistant **本身就是 modal**;[Zendesk](https://support.zendesk.com/hc/en-us/articles/7908817636378-About-agent-copilot) 主要是建議/action、非持續聊天;[Slack](https://slack.com/help/articles/33077521383059) 側欄 assistants 是安裝的 app、非內建;[Stripe](https://docs.stripe.com/stripe-vscode) 證據只到 VS Code。Canva / Adobe Express / Gamma / v0 / Amazon Amelia 找不到三門檻同時成立的官方證據。

**需要付費帳號打不開的**:Tableau 需 Tableau+;ServiceNow 需 plugin/role;Power BI 需付費 Fabric capacity;Shopify、HubSpot 需商店/組織帳號。

### Shopify Sidekick 深度實機研究(2026-08-09,雙方獨立量測後對辯)

**方法**:兩方各自用瀏覽器直連 user 已登入的 Shopify admin 與 ClickUp,只讀不寫。先各自量,再逐項比對。

**兩方獨立量到、數值一致的部分(高可信)**

| 事實 | Claude 側 | 審查方 |
|---|---|---|
| Sidekick 起點 x | 863 | 863 |
| 工作區右緣 | 859 | 857(差 2px = 邊框)|
| Sidekick 寬 | 356 | 356 |
| 並存 + 可點 | hit-test 兩點命中內部元素 | `elementFromPoint(1041,352)` 命中面板,聚焦後 `activeElement=textarea` |
| `inert` / `aria-hidden` | 皆無 | `inert=false; aria-hidden=null` |
| a11y 矛盾 | `#SettingsDialog[aria-modal=true]` 但外部 34 個可 Tab 元素無 inert | 同:「`aria-modal=true` 卻可聚焦 Sidekick」|

**審查方多抓到的(我漏的)**

| # | 事實 | 為什麼重要 |
|---|---|---|
| 1 | **第一層是原生 `<dialog open>` 的非 modal 模式**(`:modal=false`,`::backdrop` transparent,**無 top-layer、無 focus trap**)| **這正是我們選的「非 modal 分支」的真實產品前例** |
| 2 | **推擠的實作是 `#AppFrameMain { padding-right: 360px }` + 面板 `fixed` 疊在那條保留欄上** | 不是我以為的 flex 兄弟。**這個做法更簡單**:主內容只留白,面板浮在留白上 |
| 3 | **寬度可拖拉**:`cursor: col-resize`;1219 視窗 **300–450**、1440 視窗 **300–600** | **下限固定 300,上限隨視窗長** |
| 4 | **CSS 變數**:`--pc-sidebar-width-base: 356px`,消費端讀 `--pc-sidebar-width` | 與我們的舞台變數同款 |
| 5 | **狀態存 localStorage** `sidekick-sidebar-state` = `{open, size}`,**key 含 shopId** | 我們的持久化契約可直接對照 |
| 6 | **反向可開**:先開 dialog,再點頂列 Sidekick 鈕(1031,10,36,36)**仍可開** | 不是「開了 modal 就鎖住入口」|

**我多抓到的(它漏的)**

**Sidekick 的 z-index 是動態的**:只有第一層時 **100**;第二層 modal 出現(遮罩 `rgba(0,0,0,.5)` z=**518**)時 Sidekick 跳到 **520**;按 Esc 關掉第二層後**回到 100**。
**→ agent 不是靠遮罩讓位,是靠「永遠把自己抬到最上層遮罩之上」。**

**Shopify 的五段響應式行為(審查方量到,我沒量到)**

| 視窗 | Sidekick 形態 |
|---|---|
| **≥1200** | **留位推擠** |
| 1040–1199 | **覆蓋**,可拖拉 |
| 768–1039 | 覆蓋,**無拖拉把手** |
| **≤767** | **全屏** |

**這是四段,不是一條線。** 我們目前只有一條(1024)。**是否要引入中間段,列為待評估**——但注意 user 已明示「不需要有浮貼過度…定義一個 breakpoint 讓右側欄在某一個時間就會自動變為 sheet 就好」,所以**多段可能違背既有裁決**,不逕自採用。

### ⚠️ 決定性差異:第二層 modal,兩家做法相反

| | 第一層 | **第二層** |
|---|---|---|
| **Shopify** | 非 modal `<dialog open>`,無遮罩,agent 可點 | 遮罩滿版 z=518,**agent 抬到 520 → 仍可點** |
| **ClickUp** | backdrop 滿版 z=801,AI 面板 z=802 → 可點 | **自訂欄位管理 z=999 → hit-test 命中它,agent 被蓋住** |

**兩家在第一層一致(agent 可用),在第二層相反。**

**這正好是 user 已裁決的 A/B 那題**:
- **ClickUp = A**(第二層蓋住 agent)
- **Shopify = B**(第二層仍不蓋 agent)
- **user 2026-08-09 裁決 B** → **我們的選擇有 Shopify 一手實證支持**,不是憑空。

**審查方提出的挑戰**:「推翻『競品皆保證 agent 永遠可用』」。**部分成立**——確實不是「皆」,ClickUp 的第二層就蓋住了。但我們從未主張「皆」,我們是**在兩種做法中選了 B**,而 B 有實證。**此挑戰不推翻裁決,只修正措辭:應寫「Shopify 採 B、ClickUp 採 A,我們選 B」,不得寫「業界一致」。**

### 該抄 / 不該抄

**抄**:
1. **AI + 工作物做成同一個並行工作舞台**(審查方原話:「這不是『modal 外仍可點』,而是把兩者做成同一個並行工作舞台」)——Shopify / ClickUp / Carbon 三例
2. **非 modal 的 dialog 分支**(Shopify 用原生 `<dialog open>` 證明可行)
3. **padding-right 留位 + 面板 fixed 疊上**(比 flex 重排簡單)
4. **寬度下限固定、上限隨視窗**(300 / 300–600)
5. **狀態存 localStorage,key 含租戶 id**
6. **agent z-index 動態高於最上層遮罩**(兩家共同機制)

**不抄**:
1. **Shopify 的 ARIA 矛盾**(`aria-modal=true` 但外部可 Tab、無 inert)
2. **ClickUp 只靠 z-index 不做 inert**(視覺上蓋住但輔助技術仍讀得到)
3. **小視窗硬擠**(ClickUp 500px 時 task 只剩 194、AI 258,兩邊都不能用)

### 一個仍未解的張力(誠實留檔)

審查方建議「**確認框應為最高層 + 全 scope 遮罩 + 暫停 AI**」(依 W3C / Carbon / Atlassian)。這與我們已定的「agent 永遠可用」在**確認框這一種情況**下衝突。
我們目前的解是「**確認框開著時 agent 的導航被延後,但面板本身仍可讀可打字**」——**介於兩者之間**。**已定案(結論 3、16)**:確認框期間 **agent 的一般互動完全不受影響**,只延後「要改變舞台」那一下。審查方建議的「完全停用」**已否決**,留檔於已否決區。

### 兩方都沒驗到
Sidekick 回覆卡片內的連結行為(沒有安全的卡片可點、且點了會送出 prompt)、localStorage 實際值與跨分頁同步、破壞性確認框(只讀限制)。

### Shopify 到底是「一律堆疊」還是也會置換?(2026-08-09 實測)

**user 觀察**:「Shopify 基本上都是堆疊 modal 上去的設計」。**實測結果:兩種都有,分界線正是「是不是同一種容器」。**

**實驗一:Settings 內導航(語言 → 使用者)**

| 量測 | 點之前 | 點之後 |
|---|---|---|
| `[role=dialog], dialog` 數量 | **2** | **2**(不變)|
| `#SettingsDialog` 是不是同一個 DOM 節點 | — | **`sameNode: true`** |
| 半透明遮罩數量 | 0 | **0**(沒有新增)|
| URL | `/settings/languages` | `/settings/organization-account`(**變了**)|

**→ 同一個容器、同一個節點、內容換掉、URL 跟著變、不新增遮罩 = 這就是「置換」。**

**實驗二:設定 → 語言 → 新增語言**

| 量測 | 結果 |
|---|---|
| dialog 數量 | **+1** |
| 遮罩 | **新增一層** `rgba(0,0,0,.5)`,z=**518**,滿版 |
| Sidekick z-index | 100 → **520**(抬到遮罩之上)|

**→ 不同種容器 = 堆疊。**

**⚠️ 我一度把分界線寫成「換實體 = 置換、開表單 = 疊」——錯的。** 審查方多測了兩個表單,直接推翻:

| 操作 | 結果 |
|---|---|
| 新增**語言** | **堆疊**(dialog 2→3、遮罩 z=518 出現、Sidekick 100→520;取消後 3→2)|
| 新增**地點** | **置換**(2→2,URL `locations` → `locations/new`,Settings 同節點)|
| 新增**使用者** | **置換**(2→2,URL 不變,Settings rect 不變)|

**三個都是「新增 X」的表單,一個疊、兩個不疊。** 所以**跟「是不是表單」無關**。

**真正的分界線是「目的地宣告自己住在哪個容器」**:
- `locations/new`、新增使用者 → 宣告自己是 **Settings 這個容器的一個路由** → 同容器換內容 → **置換**
- 新增語言 → 宣告自己是**一個 Polaris modal**(另一種容器)→ **疊加**

**這與我們定的「目的地註冊表宣告 presentation」完全一致**——不是靠內容分類,是靠目的地自己註冊時就寫明。

**ClickUp 也實測到置換(修正我先前的假設)**:task modal 內點子 task(`hgfd` → 「確認需求與預期成果」)→ **同一個 task 容器節點、rect 固定 `(24,24,805×600)`、z=801 不變,只有 URL 的 task id 從 `86et3542p` 換成 `86eyhc44y`**。**兩家都有置換。**

**結論:Shopify 不是「一律堆疊」。分界線是目的地註冊的容器種類——**

| 情況 | Shopify 的行為 |
|---|---|
| 目的地宣告自己是**同一容器的路由**(設定的另一頁 / `locations/new` / 新增使用者)| **置換**:同節點換內容,不疊、不加遮罩、**沒有返回鍵** |
| 目的地宣告自己是**另一種容器**(新增語言 = Polaris modal)| **堆疊**:數量 +1、加遮罩 z=518、agent 抬到 520 |

**這正是 user 2026-08-09 提出的規則**(「若最上層 modal 與欲開啟的 modal 是塞同一種內容的容器只是透過 id 去 render 不同內容的話,可以讓該 modal 去決定是否取代」)——**Shopify 就是這樣做的,一手實證。**

**實驗三(意外收穫):Esc 作用在「焦點所在的那個面」**

我先前把焦點放進 Sidekick 的輸入框,然後按 Esc:
- **關掉的是 Sidekick**,不是 Settings dialog
- Settings dialog 仍在(`settingsGone: false`),而且**自動擴張成整個寬度**
- Sidekick z-index 回到 100

**兩個規則同時被實證**:
1. **Esc 由焦點域決定關誰**(user 先前拍板的規則)
2. **關掉 agent → 舞台等於整個視窗,左邊的東西自然變滿版**(我們用來取代「放大鍵」的那條規則)

### 最後一塊:從 AI 面板點連結會開在哪(2026-08-09 實測,零項未驗證)

**方法**:兩邊都送 prompt 讓 AI 產出站內連結,然後點下去逐項量測。

**Shopify(從 Sidekick 點「應用程式設定」)**

| 量測 | 結果 |
|---|---|
| URL | `/` → `/settings/apps` |
| dialog 數量 | 1 → **2**(新增 Settings 容器)|
| Sidekick | rect `[907,56,300,592]`、z=100 —— **完全不變** |
| 遮罩 | **0 → 0(沒有遮罩)** |
| 左邊 | **整塊換成 Settings**;不是整頁換掉,也沒蓋住 Sidekick |

**再點第二個連結**:`/settings/apps` → `/settings/notifications`;dialog **2 → 2**、兩者 rect 與 z 全不變、遮罩仍 0 → **在同一個 Settings 容器內置換,沒有疊第三層。**

**ClickUp(從 AI 面板點任務連結)**

| 量測 | 結果 |
|---|---|
| URL | `/my-work` → `/t/…/86eqrtcrd` |
| dialog 數量 | 1 → **2** |
| AI 面板 | 仍在,z=591,**頂層 hit-test = true(可點)** |
| 左邊 | 新增任務層 z=801 |
| 遮罩 | **0 → 1**,滿版 `rgba(0,0,0,.6)` |

**再點第二個任務**:URL 換成 `/86erwq01z`,dialog 仍 **2**、rect 不變 → **換掉前一個任務,沒有再疊。**

### ⭐ 決定性結論(一句話)

> **從 AI 面板點連結,跟從一般 UI 點同樣的東西,行為完全相同**——dialog 數量、rect、z-index、遮罩、面板存續**五項全部一致**。

**→ AI 面板不是特例路由。它只是另一個發起點,走的是同一條路由。**

**這直接支持我們規格的兩條核心**:
1. **「去它的家」不分來源**——目的地決定開在哪,不看是誰點的
2. **同一種容器就換內容、不疊**——兩家都實測到(Shopify 的 Settings、ClickUp 的 task)

**兩家唯一的差異仍是遮罩**:Shopify 開 Settings 沒有遮罩(它是同層容器);ClickUp 開 task 有滿版遮罩(它是浮層),但 **AI 面板都沒有被關掉、沒有被蓋住**。

### 「換內容 vs 疊上去」的設計原則(2026-08-09/10 兩輪辯論定案)

**先講原則,再講為什麼。**

> **這東西自己一個人也站得住 → 換掉舞台上現在那個。**
> **這東西只是為了把現在這件事做完、做完或取消就回原地 → 疊上去。**
> **原本那件事非等它不可 → 用會擋住的那一種。**

**判定流程(三題,由上到下)**:

| # | 問題 | 答案 |
|---|---|---|
| 1 | **有沒有一個穩定的 id 可以直接重建它?重整之後還在?上一頁/下一頁走得回來?** | 是 → **換掉舞台上現在那個** |
| 2 | 否。那它需不需要保留背景(做完要回原地)? | 是 → **疊上去** |
| 3 | 疊的時候,原本那件事非等它不可嗎? | 是 → 用會擋住的(modal);否 → 非阻斷的浮層 |

**第 1 題刻意寫成可機械判定**——「大量內容」「很複雜」這種量詞判不了,「能不能用穩定 id 重建 + 重整還在 + 上下頁走得回」可以。
**注意**:單看「有沒有網址」不夠,[WHATWG 規範](https://html.spec.whatwg.org/#the-history-interface)允許同一個 URL 新增 history 紀錄,所以網址是強訊號但不是門檻。

### ⚠️ 這修正了 user 原本的措辭(必須攤開)

user 2026-08-09 提的是「**同一種容器**只是透過 id render 不同內容 → 可以取代」。

**審查方判定「同一種容器」這個判準是錯的**,理由:**容器是結果,不是原因**。決定行為的是「**這個目的地能不能獨立存在**」,容器跟著目的地走。

**兩條規則在已量到的六個資料點上答案完全一樣**,差別只出現在一種情況:

| 情況 | 「同一種容器」規則 | 「能否獨立存在」規則 |
|---|---|---|
| 從 task 前往一個**用別種容器**呈現的獨立目的地 | **疊**(容器不同)| **換掉**(它獨立成立)|

**⚠️ 此處先前另立「能否獨立存在」判準並宣告「兩案並列」,已刪除(2026-08-10)**:結論 10 已拍板判準是 `containerKind` 掃整疊比對;「能否獨立存在」是新來目標的屬性,正是已否決的分類法。[Android Navigation](https://developer.android.com/guide/navigation/design) 的三分只作近親對照,不當判準。

**(已於 2026-08-10 統一為結論 10,不再兩案並列。)**

### 六家世界級的逐字判準(都指向「任務」)

| 出處 | 逐字 |
|---|---|
| [Android](https://developer.android.com/guide/navigation/design/dialog-destinations) | dialog destination 有「own lifecycle and saved state」|
| [Apple](https://developer.apple.com/design/human-interface-guidelines/modality) | 「distinct, narrowly scoped **task**…previous context」|
| [Material](https://m3.material.io/components/dialogs/guidelines) | 「requires a specific user **task**, decision, or acknowledgement」|
| [Carbon](https://carbondesignsystem.com/patterns/dialog-pattern/) | 限於「current **workflow**」,且**禁止**做成「full app or page」|
| [Fluent](https://fluent2.microsoft.design/components/web/react/core/dialog/usage) | 「focused **task**」|
| [Shopify](https://shopify.dev/docs/apps/design/app-structure) | 複雜／需更多空間 → 「**routing**…better experience」|
| [NN/g](https://www.nngroup.com/articles/modal-nonmodal-dialog/) | 「multiple steps…**full page**」|

**四個候選判準的比較**:任務層級 = **主判準**;阻斷性 = 次要(只決定要不要 modal);有沒有網址 = 強訊號但非門檻;**會不會產生變更 = 無效**(Material 明文允許只是 acknowledgement)。

### 全域管理器該怎麼做(ClickUp 那個「可質疑」的案例)

ClickUp 的自訂欄位管理**疊 + 全屏**。但[官方文件](https://help.clickup.com/hc/en-us/articles/13066263096727-Intro-to-Custom-Field-Manager)證實它**管理整個 Workspace 的欄位、入口有七類**——**不是 task 的附屬**。

**我們不跟。定案:當成舞台上的一個目的地(換掉現在那個),返回鍵回到原本的 task,agent 固定不動。**
理由:(a) [Carbon](https://carbondesignsystem.com/patterns/dialog-pattern/) 限疊層於「短、當前 workflow」,禁複雜/大量;(b) 疊 + 全屏會蓋住 agent,**直接違反已定的「agent 永遠不被蓋住」**。

**誠實標記**:我先前寫「ClickUp 疊 + 全屏 + 蓋住 AI 面板」,審查方本輪標為 `UNVERIFIED`——z=999 有量到,但「是否真的蓋住 agent」未逐項確認。**不作為結論引用。**

### 堆疊到一半時,「換掉」到底換掉什麼(2026-08-10 三輪辯論定案)

**user 抓到的洞(逐字)**:「如果我在 task modal add field 到一半,此時開 modal 到底置不置換…**左側 modal 的狀態是沒有註冊表的吧**」

**行為定案**:舞台上是 `[任務 A] → [新增欄位]`,從 agent 點任務 B → **整組換成任務 B**;新增欄位表單跟著消失(它屬於 A 的脈絡,A 不在了就沒有意義)。

**⚠️ 但實作結構我原本想錯了**

我提「根 + 掛在根上的子步驟」這種**樹狀**結構。審查方查證後:**沒有任何框架用這個術語**——

| 框架 | 逐字 |
|---|---|
| [Android back stack](https://developer.android.com/guide/navigation/backstack) | 純後進先出:「last in, first out」;`popUpTo`「remove some destinations」;`saveState`「states…popped off」|
| [React Navigation](https://reactnavigation.org/docs/navigation-state/) | 「Each navigator keeps its own navigation history」|
| [iOS UINavigationController](https://developer.apple.com/documentation/uikit/uinavigationcontroller) | 「root…index 0」;`setViewControllers`「Replaces…with the specified items」|

**「根 + 附屬層」不是框架術語,是應用層自訂的說法(標 UNVERIFIED)。**

**改採更簡單的結構(審查方推薦)**:**一串平的堆疊,每一項帶三個標記** `{flowId, role, guard}`。
- **`replaceRoot` = `popUpTo(root, inclusive)` + push B** —— 直接對應 Android 既有機制,不自創樹
- 同一個 `flowId` 的整批一起清(三層以上也一樣;portal / 原生 modal 在另一個 stack 也同批清)

**⚠️ 我說「兩個輸入就夠」也是錯的,是三個**

| # | 輸入 | 誰持有 |
|---|---|---|
| 1 | 目標是不是獨立目的地 | 註冊表 |
| 2 | 當前堆疊 | runtime state |
| 3 | **轉場意圖**(`replaceRoot` / `pushChild`)| **呼叫端** ← **我漏的** |

另外:**重複開同一個 task 需要 `flowId` 區分**,加上 guards。

**user 說「註冊表不知道當前狀態」——這點他是對的,而且審查方確認:註冊表不該存 runtime。** 但我補的「兩個就夠」不夠,要三個。

**四個先前沒想過的情況(審查方補)**

| 情況 | 答案 |
|---|---|
| 表單自己又開一層(三層以上),換掉根要收幾層 | **同 `flowId` 的全部**,不管幾層 |
| 有未存內容,要問幾次 | **一次**。先回答最上層、重讀狀態,再對**所有待刪的層一次問「儲存 / 捨棄 / 留下」**;存檔失敗就中止導航 |
| **從舞台上的 modal 點(不是從 agent)** | **一樣**,都是 `replaceRoot(B)` |
| 換掉之後按返回鍵回到哪 | **回到 A 的前一項**;沒有就關掉整個表面。**不會回到 A、也不會回到它的子步驟** |

### 「開很多層要怎麼知道換哪一層」(2026-08-10 user 提問 → 我答錯 → 修正)

**我的答法**:「不需要選層,因為舞台上永遠只有一個流程」——**錯。這個 invariant 不會自動成立。**

**審查方驗四個情境,三個會破**:

| # | 情境 | 會不會破 |
|---|---|---|
| 1 | **從確認框內**點一個獨立目的地,若用 push | **會破**:f1 + f2 同時存在 |
| 2 | **深層連結**:冷啟動多層同一個 ID(OK);**熱啟動用 `navigate` 會混進舊 flow** | **會破** |
| 3 | **返回鍵**:若當初是 push 就會退回 f1;**全替換則不會** | **看做法而定** |
| 4 | 瀏覽器 history **可以存兩個 flow**,但只會整體恢復其一 | 不破,但要知道 |

**正解:invariant 不是「自然成立」,是「必須被強制」。**

**最小修補(審查方給,不推翻既有設計)**:

1. **所有換流程的動作只能走同一個入口** `replaceFlow`:建立或取得 ID → **原子式換掉整個堆疊**
2. **巢狀內換流、深層連結、瀏覽器上一頁**——**三者共用這同一個入口**,不得各走各的
3. **加一條自我檢查:堆疊裡的 `flowId` 數量必須 ≤ 1**,不符就是 bug(開發期直接報錯)

**`flowId` 的產生與延續規則(可機械判定)**:

| 操作 | flowId |
|---|---|
| `push` / `topReplace` / `pop` | **沿用**同一個 |
| `startFlow`(獨立目的地 / 全域管理器 / 從 agent / 從連結進來)| **建新的** |
| `restoreFlow`(還原)| **保留原本的** |

**框架對應(誠實標記落差)**:
- `flowId` ≈ Android 的 [`taskId`](https://developer.android.com/reference/android/app/TaskInfo#taskId),但 [Android 的 taskAffinity 只是「prefers」而且允許同時存在多個 task](https://developer.android.com/guide/components/activities/tasks-and-back-stack) —— **它不保證唯一,我們要自己強制**
- [React Navigation 的 nested navigator **不是 flow**](https://reactnavigation.org/docs/nesting-navigators/#each-navigator-keeps-its-own-navigation-history);換流程必須用 [root `reset`](https://reactnavigation.org/docs/navigation-actions/#rewriting-the-history-with-reset)
- **Web history 會留下舊 state** —— 這是第 2、4 兩個破口的來源

### 「掃整疊、命中同種就換掉並清上面」——前例與 UX(2026-08-10 定案)

**機制:五個框架都有,是主流。**

| 框架 | 官方逐字 | 比對依據 |
|---|---|---|
| [Android `CLEAR_TOP`](https://developer.android.com/reference/android/content/Intent#FLAG_ACTIVITY_CLEAR_TOP) | 「all of the other activities on top of it will be **closed**」| Activity component |
| [`singleTask`](https://developer.android.com/guide/components/activities/tasks-and-back-stack#TaskLaunchModes) | 「all of the other activities on top of it are **destroyed**」| type + task affinity |
| [Navigation `popUpTo`](https://developer.android.com/reference/androidx/navigation/NavOptions.Builder#setPopUpTo(java.lang.String,boolean,boolean)) | 「pops all non-matching destinations … **until this destination is found**」| ID / route |
| [React Navigation `popTo`](https://reactnavigation.org/docs/stack-actions/#popto) | 「takes you back … by the name」;**未命中時「essentially behaving like a replace」——不是疊上去** | route name |
| [Flutter `popUntil`](https://api.flutter.dev/flutter/widgets/Navigator/popUntil.html) | 「Calls pop repeatedly … **until the predicate returns true**」| 任意 predicate |
| [iOS `popToViewController`](https://developer.apple.com/documentation/uikit/uinavigationcontroller/poptoviewcontroller%28_%3Aanimated%3A%29) | 「Pops view controllers **until the specified view controller is at the top**」| **指定 instance**(同 class 要自己掃)|
| [Web History](https://developer.mozilla.org/en-US/docs/Web/API/Window/history) | 「**There is no way to clear the session history**」| **無等價原語** |

**⚠️ 六家的「同一種」依據各不相同**(component / type+affinity / ID·route / route name / predicate / instance)。**我們必須自己明訂一個**,不能含糊說「同一種」。

### ⚠️ 但「直接清掉」的 UX 不是最好的——Shopify 就是反例

**實機(2026-08-10)**:

| 產品 | 觀察 |
|---|---|
| **Shopify** | 設定 → 語言 → 新增語言 → 從 Sidekick 點「通知設定」:**一次點擊,新增語言被清掉**。**而且「已選日文但還沒按新增」的狀態下,完全沒有詢問,直接丟失** |
| **ClickUp** | AI → 任務 A → assignee 選單 → 從 AI 點任務 B:**第一次點只關掉選單,第二次才換 A→B**。**沒有出現第三層** |
| **Jira** | 改採 **Dock**:讓人繼續工作「**without losing your draft**」([官方](https://support.atlassian.com/jira-software-cloud/docs/create-a-work-item-and-a-subtask/))|
| **Linear** | 同一個 Peek「updating the preview」換內容 |

**一手 UX 研究**:[NN/g 實測逐字](https://media.nngroup.com/media/reports/free/Website_Tools_and_Applications_with_Flash.pdf)——「**Two users clicked the Back button and lost all of their input.**」

**三家的緩解手法都不是「問你要不要丟」,而是「不要丟」**:Linear 存草稿、Jira 收進 dock、ClickUp 收進 tray(「minimize it and come back to it later」)。

### 定案的完整規則(含 UX)

| 步驟 | 做法 |
|---|---|
| 1 | 掃整疊,**命中同一種** → 換掉那一層 |
| 2 | **它上面的層先自動存成草稿 / 收起來**,**不是直接丟掉** |
| 3 | **只有真的無法保存時**,才**一次**確認(不逐層問) |
| 4 | 沒命中同種 → **疊上去** |

**「靜默清除」明確排除**(審查方原話:「靜默清除不是最佳 UX」)。**Shopify 那個做法我們不抄。**

**框架不會幫我們做這件事**:Android 說 app 可能需要「implement its own Back behavior」;[React Router `useBlocker`](https://reactrouter.com/api/hooks/useBlocker) 可以「block navigations … present … confirmation dialog」但要自己判斷 dirty。**pop / clear 這類 API 一律沒有內建 guard。**
(附帶:Shopify **自己有** [`leaveConfirmation()`](https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/save-bar-api) 這個 API,**但上面那個流程沒有用**——所以它不是做不到,是漏了。)

**仍未驗到**:Notion / Jira 的整疊命中行為;多個未存層應該一次問還是逐層問;Flutter `popUntil` 永不命中時的契約。

### 介面上到底長怎樣(2026-08-10 UX 定案,含實機文案)

**⚠️ 先更正我上一則**:我寫「正解是先幫你留著,只有留不住才問」——**講過頭了**。正解是**照樣問,但問的時候給「儲存草稿」這個選項**(ClickUp 實機就是這樣)。「稍後回來清單」只適合長表單 + 頻繁中斷的情境,不當通則。

**一、轉場**

| 項目 | 規則 | 依據 |
|---|---|---|
| 順序 | **確認前畫面完全不動**;確認後**舊的整體淡出、新的淡入** | — |
| **禁止** | **不可以「先關表單 → 露出任務 A → 再換成 B」** | [Material 逐字](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md#L1093-L1095):「at the same time … **instead of playing them sequentially**」;[Fluent 逐字](https://learn.microsoft.com/en-us/windows/apps/design/motion/content-transition-animations):「**simultaneously without any staggering or delay**」|
| 型式 | A 與 B 之間**沒有空間方向關係** → 用**淡入淡出**,**不要橫滑** | Fluent top-level 要 quick fade |
| 時長 | **200–250ms** | [Fluent 官方時長表](https://learn.microsoft.com/en-us/windows/apps/develop/motion/timing-and-easing)列 167 / 250ms |

**二、什麼時候該問、什麼時候不該問**

| 狀態 | 做法 | 實機佐證 |
|---|---|---|
| 表單**全空** | **不問,直接換** | Shopify、ClickUp 實機皆 **0 個對話框** |
| 表單**有輸入** | **問一次** | 見下 |

[NN/g](https://media.nngroup.com/media/reports/free/iPad_App_and_Website_Usability_2nd_Edition.pdf):不穩定的變化「**risks disorienting users**」且削弱控制感。**有恢復緩衝**才可以像 [Gmail](https://support.google.com/mail/answer/2819488) 那樣事後給 Undo;**沒有緩衝就必須事前問**。

**三、問的時候長怎樣(兩家實機文案)**

| 產品 | 實機(2026-08-10) |
|---|---|
| **ClickUp** | 有輸入時**只出一次** `Save draft?`,選項 **`Delete draft / Cancel / Save`**;**草稿進 task tray**;空白不問 |
| **Shopify** | dirty 時**阻止導航**,Save Bar 顯示「未儲存的商品 / 捨棄 / 儲存」並 **shake 650ms**;空白直接離開 |

**一次問全部,不逐層問**——[Apple 逐字](https://developer.apple.com/design/human-interface-guidelines/modality):「**you never want to display more than one alert at the same time**」。

**我們的文案(依上述推導)**:
> **標題**:前往「任務 B」?
> **內文**:「新增欄位」有未儲存的變更,前往後將捨棄。
> **選項**:**儲存草稿並前往** / 捨棄並前往 / 繼續編輯
>
> (若該表單沒有草稿能力,移除第一項。)

**四、agent 要不要有反應?——不要**

**不新增「已前往任務 B」這類訊息。** 讓那張卡片變成選取狀態、舞台顯示 B,**就已經是回饋了**。
**ClickUp 與 Shopify 實機皆無額外回話或 toast。**
**例外**:只有在 agent 代你跑、結果看不見、正在載入或失敗時,才顯示狀態。

**五、三個方案的最終選擇:選甲**

| 方案 | 判定 |
|---|---|
| **甲:清掉,有未存先問(問時給存草稿選項)** | ✅ **採用**——最可預期、不遺失、心智負擔最低 |
| 乙:收進「稍後回來」清單 | 只適合**長表單 + 頻繁中斷**,且要做成明確的草稿匣。**不當通則** |
| 丙:疊成三層 | ❌ 多一層 + 多一套返回規則,認知負擔最高 |

**誠實標記(審查方自陳)**:沒有規範逐字寫「N 層一起關」,「一次轉場」是從「同步轉場」+「單次 pop」兩條推導出來的;「一次問 vs 逐層問」也沒有直接的 A/B 研究。ClickUp 桌面文案與 Shopify 的 650ms 是本次實測,官方未逐字記載。

### 具體情境逐一跑一遍(規則改動必附此表)

**前提**:視窗 ≥1024、agent 開著佔位、左邊有一個任務彈窗(任務詳情)。

| # | 你做了什麼 | 蓋住 agent? | 舞台上變成什麼 | 底下的東西 | 關掉回到哪 |
|---|---|---|---|---|---|
| 1 | 從 **agent** 點**檔案預覽** | **不會** | 預覽 | 任務詳情**還在**,狀態全留 | 任務詳情 |
| 2 | 從 **agent** 點**另一個任務** | **不會** | 新任務 | 舊任務**還在**,狀態全留 | 舊任務 |
| 3 | 從任務彈窗點**加入新欄位** | **不會** | 欄位管理 | 任務詳情還在 | 任務詳情 |
| 4 | 從任務彈窗點**刪除** → 確認框 | **不會** | 確認框 | 任務詳情還在 | 任務詳情 |
| 5 | 預覽開著時再點**同一個檔案** | **不會** | **不變**(同目標不重複疊)| — | — |
| 6 | 預覽開著時再點**另一個檔案** | **不會** | **同一個預覽換內容**(不疊第二層)| 任務詳情(沒變)| 任務詳情 |
| 6b | 在預覽裡按**上一個 / 下一個** | **不會** | 同一個預覽換內容 | 任務詳情 | 任務詳情 |
| 7 | 點「要用**主畫面**呈現」的 | — | **modal 全部收掉** | — | 主畫面,agent 仍開著 |
| 8 | 按 **X / Esc / 點遮罩** | — | **退一層**(照既有行為)| — | 上一層;已是第 1 層 → 主畫面 |
| 9 | 想看滿版 | — | — | — | **把 agent 關掉**,舞台等於整個視窗 |
| 10 | agent 關閉後想再打開 | — | — | — | **觸發點恆在**(預設右下角圓鈕,位置由產品決定)|

**全部十列,只有一種行為:疊上去。沒有任何一格需要判斷「這是什麼類型」。**

### 本節的使用方式(給未來的我)

1. **每次要改任何版位 / 互動規則前,先讀這一節。**
2. 規格任何一處與本節衝突 → **本節為準**,除非有一手證據推翻,且推翻必須在本節下方留下明確紀錄與理由。
3. **禁止**把本節的條款降級成「未決」「候選」「尚待討論」,除非引得出 user 明說要改的原話。

---

## 一、設計原則

### 1. 脊椎:位置的知識 vs 內容的知識

每個設計爭議先問:「這是**位置**的知識,還是**內容**的知識?」
- **位置**(誰佔右軌、開關、寬度、遮罩、Esc、焦點交接)→ 歸版位層。
- **內容**(訊息部件、AI 標記、錯誤、核准、貼底捲動)→ 歸內容層。

知識只能由上往下流;跨層前必降級成無語意的量(寬度數字、開關布林、中性注意力訊號)。

**⚠️ 來源標示(2026-08-09 忠實度稽核補)**:L0–L6 這套分層**是本案新訂**,不是 user 拍板、也不是既有 DS canonical。推導依據:user 要求「擴充性佳、程式碼可以乾淨好管理」+「不管滿版還是非滿版都應該要有差不多的架構」。**先前完全沒標來源,是全份規格最上游卻最沒依據的一段**,已補標。

| 層 | 名稱 | 職責 | 關鍵約束 |
|---|---|---|---|
| L0 | 版位(AppShell) | 右軌佔用/開關/寬度/遮罩/焦點交接 | 不知道佔用者是誰;不持有任何內容狀態 |
| L1 | 佔用者契約 | v1 hardcode agent + key namespace | 佔用者身分止步於此;跨入 L2 前降級為匿名佔用者 |
| L2 | 容器轉接 | 版位殼 ↔ 對話內容接線 | 禁出現 agent 字樣(machine-checked)**〔本案新訂〕** |
| L3 | 對話組合 | 唯一垂直捲動 + aria-live 串流通道 | 捲動所有權須與 AppShell Aside 現況協調,見版位規則「捲動所有權」 |
| L4 | 訊息部件 | 每 part 一純元件 **〔本案新訂〕** | ~~能單獨進表格儲存格~~ **已刪**:無來源,且與元件清單自相矛盾(`ConversationScroller` / `PromptInput` 本來就不可能進儲存格) |
| L5 | 內文渲染 | markdown → 既有 token 映射表 + 等寬 token | |
| L6 | 內容模型 | 純型別,無 store 無傳輸 | |

### 1b. 形態集合(凍結為 4 種)

先前文中出現過三態 / 四態 / 五態三種說法,狀態機因此沒有分母。凍結如下:

| 形態 | 定義 |
|---|---|
| **佔位欄** | 推擠線以上的真欄位,推擠主內容 |
| **Sheet** | 推擠線以下的覆蓋式表面 |
| **收合入口** | 面板不在畫面上,只剩觸發點(含徽章);session 照舊存在。**⚠️ `triggerVisible` 已刪除(2026-08-10)**:它存在的唯一理由是「線以下不提供入口」,而該規則已被 §〇 草案取代——**線以下 agent 改成抽屜疊在 modal 上,入口照常提供**。**觸發點恆在,沒有例外。** |
| **滿版** | 獨立 route 的全頁對話視圖 |

**modal 期間不是第五種形態**:它是「佔位欄 + 舞台化遮罩」的修飾語境——agent 的形態仍是佔位欄,只是遮罩範圍與 modal 幾何改變。這樣狀態機的分母是 4,不是 5。

### 1c. 層 → 檔案路徑(驗收條件 1 的前提)

CI 要 grep「L2 目錄零筆 agent 字樣」就必須知道 L2 是哪個目錄。依既有 DS 慣例(pattern 資料夾 kebab-case、多檔 flat 並列,如 `patterns/element-anatomy/`):

| 層 | 路徑 | 說明 |
|---|---|---|
| L0 | `components/AppShell/` | 既有,本案可能修改(見衝突總表) |
| L1 | `patterns/panel-occupant/` | 佔用者契約 + key namespace;**唯一**允許出現 agent 字樣的層 |
| L2 | `patterns/panel-occupant/container-adapter.*` | 版位殼 ↔ 內容接線;**CI 掃這裡,零筆 agent** |
| L3–L5 | `patterns/conversation/` | 對話組合、訊息部件、內文渲染(flat 並列,比照 element-anatomy) |
| L6 | `patterns/conversation/types.ts` | 純型別 |

命名理由:`panel-occupant` / `conversation` 都是**結構語意**而非產品語意,符合命名三重測試第三題(不佔用產品領域詞)。DS-wide 撞名 grep 已跑,兩者皆零命中(2026-08-08)。

**面板的開關與 session 的生死是兩件事,面板永遠管不到 session。**(user 2026-08-08 更正;先前寫「X = 終結 session」是本文自創,從未經拍板)

- **面板可見性**:佔位欄 / Sheet / 收合入口 / 滿版四種形態間切換。**X、點外、Esc、漢堡、點內容導航、`⌘.` 全都只是關掉/收起面板**——session 續存、串流續跑、寬度記憶保留;**徽章依「收合入口」的亮燈條件(跑的期間不亮,跑完或失敗才亮)**。收起後**通常**觸發點都在,隨時可再打開;**例外**:共存線以下的 modal 期間 `triggerVisible = false`(user 已決該區間不提供入口),見「收合入口」。
- **session 生命週期:增、刪、查、改四項在面板與滿版都要有**(2026-08-09 忠實度稽核更正)。
  user 逐字:「此 agent應該跟個世界級agent差不多包括都可以**增刪查改**session等等」+「但反正不管滿版還是非滿版都應該要有**差不多的架構**,兩者的差異比較像是 **rwd** 而已」。
  **先前寫成「面板只有切換/新建,刪改歸滿版」是把 RWD 差異寫成功能差異,違背 user 原話**,已撤回。
  正確落點:**面板模式**用標題列 popover 承載完整四項(列表 + 新建 + 重新命名 + 刪除,刪除走既有確認流程);**滿版**是同一組能力的寬版呈現。差別只在**版面**,不在**能得到什麼**。
  「改」= 重新命名 session(既有 DS `InlineEdit` 或選單項 → Dialog,實作時擇一,兩者都已存在)。
  唯一保留的安全規則:**面板主體(對話區)上沒有任何一顆鍵會刪掉對話**——刪除只從 session 列表發起,且必須二次確認。
- **modal 進場不改變可見性**:開 modal 時 agent **不收合也不讓位**(user 原話:「會永遠都在最右邊且永遠可操作」),見版位規則 modal 模式。

這個切分讓整份規格少一個概念:不需要「邏輯開啟 vs 視覺在場」的二分,因為面板的所有開關本來就都只是視覺。世界級同款(ChatGPT / Claude:關掉側欄不會刪對話)。

### 3. 佔位優先序(衝突時誰贏)

**右軌佔用**(誰擁有右側那條軌):

| 優先序 | 佔用者 | 輸了會怎樣 |
|---|---|---|
| 1 | agent 面板 | 右軌之爭不會輸;**但推擠線以下的覆蓋式互斥仍可能被逼收起**(見下),session 不受影響 |
| 2 | 詳情 | 被 agent 換走=關閉、不復原;之後開=落主內容區 |

Modal 不在這張表:它不搶右軌,而是對「舞台」(視窗 − agent)壓縮,幾何上永不驅逐 agent。

**Sheet 互斥**(推擠線以下,覆蓋式表面同時只能有一個):agent Sheet 與側欄 Sheet 同級,**後動作勝**,前者收起。理由是機械的,不是偏好——見「共存」段。

任何共存爭議(漢堡 × agent Sheet、小視窗 modal、詳情 × agent)由這兩條推出,不逐案裁決。

---

## 二、版位規則

### agent 面板形態

**shell 模式(視窗 ≥ 1024)**——真欄位推擠主內容。
- 顯示寬 = `clamp(320, 記憶寬, min(640, (視窗 − 側欄生效寬) / 2))`。
- 記憶寬 per-occupant,只有使用者拖拉能寫;顯示時降級不改寫意圖,放寬自動還原。
- 首次開啟(無記憶寬)= 320(app-shell.tsx:113 ASIDE_WIDTH_DEFAULT)。
- 拖拉把手消費既有 `patterns/resize-handle`(命中區 7px、1px line;其 spec 明文 AppShell Aside drag-resize 是計畫消費者;drag math 由版位層自管)。
- 記憶儲存:cookie、7 天(對齊側欄前例 sidebar.tsx:61-62);key 走 L1 namespace。
- 寬度一律以 number 傳給 AppShell aside → 繞過 1280 breakpoint-keyed object 機制。
- 推擠動畫 200ms ease-linear(sidebar.tsx:404 同族)。

**Sheet 模式(視窗 < 1024)**——右側 Sheet 覆蓋。
- 寬度消費 Sheet 預設檔:mobile w-3/4、上限 448(sheet.tsx:80-82 sm:max-w-md)。320 下限只屬 shell 推擠模式;Sheet 殼窄視窗由 w-3/4 治理,自然可低於 320,屬預期。
- 點外 / Esc = **關閉面板**(手勢對齊 Sheet canonical `sheet.spec.md:132`「Esc — 關閉」;窄視窗 Sheet 切換見 `sidebar.spec.md:588`);session 與串流不受影響。
- 跨線開著的保持開著、只換殼(Atlassian panel `<64rem` 帶陰影浮層 + Fluent 官方文件範例 `DrawerResponsive.stories.tsx:39-48,71` 只換 type、open 不動;詳見異同表)。新殼以 canonical 時長進場(Sheet 250ms)。
- **換殼時對話狀態不得重置**(捲動位置、輸入框內容、串流)。DOM 跨容器搬移在 React 下通常會 remount,「不重置」要靠 state 提在 L1(見串流段)而非賭 DOM 不卸載;能不能做到不閃爍由 POC 量(驗收條件 4f)。

**modal 模式(Dialog 開啟時)**——形態不看視窗寬度,只看幾何:
- **modal 期間 app shell 完全不重排、不位移**(user 2026-08-08 提議、我查證後採用;**原話帶問號,不是裁決**:「我認為app shell 在開啟modal+ai agent時,我認為整個app shell都不會重新排版,不會位移才對?應該是這樣沒有例外」)。
  遮罩下的東西反正也點不到,讓它們在遮罩底下位移只是白費的動態。**所以:modal 期間開/關 agent,底下的主內容與側欄一律凍結原位**,agent 就地佔用右軌、遮罩範圍隨之改變,如此而已。這條**無例外**。
- **「舞台」= modal 可以用的那塊畫面 = 整個視窗扣掉 agent 佔的那一條。**(側欄、頂列都在舞台裡面——它們被遮罩蓋住,但不會讓 modal 變窄;modal 可以蓋過它們。)
- **形態線 = 1024**:視窗低於它,agent 不再並排佔位,改成**抽屜疊在 modal 之上**(仍可用)。舞台本身**不設下限**——線以下不共用寬度,不會有被擠爆的問題。
- modal 在舞台內置中、對舞台壓縮;**遮罩滿版 `inset:0`(照 ClickUp 實測),agent 畫在遮罩之上**,所以 agent 不變暗、可互動;觸發點是 modal UI 的一部分(位於遮罩之上,**不會被遮罩點死**),**但是否渲染依共存線判定:≥768 提供,<768 不提供**(先前此處寫「永遠有效」是已被取代的舊層,2026-08-09 清除)。
- **零讓位線**:modal 期間 agent 沿用 **shell 模式**的 min/max(320–640 + 半寬上限);Dialog 對舞台自然壓縮、無下限特例(`dialog.spec.md:93`「**無下限 clamp**——過小值不擋」+ `dialog.tsx:125`;Port 同款一路壓縮親驗)。

  **🚨 但這三條在窄視窗數學上不可能同時成立**(2026-08-08 抓出,原文用「自然擁擠屬預期」帶過是錯的):agent 下限 320 + modal 零讓位 + modal 永無 Sheet。320px 視窗時舞台 = 320 − 320 = **0**;375px 時舞台只剩 55px,而 Dialog 左右各有 48px inset(`dialog.tsx:36-37`),可用寬度已是負的。
  這也不是「行動版另案」可以推掉的:**WCAG 1.4.10 Reflow 要求 320 CSS px 下不損失內容或功能**,而原文還把 1.4.4 誤述成「只要求功能可用」——它要求的是內容與功能。
  **ClickUp 與 Port 在這題上做法相反**(2026-08-08 一手實測):

  | | 機制 | 窄視窗會怎樣 |
  |---|---|---|
  | **ClickUp** | **兩個表面都有硬底**:AI 面板容器 inline `min-width: 420px`、任務視圖 computed `min-width: 595px`(inline 寫 `width:50vw; max-width:480px`,但 min-width 依 CSS 規則勝出)。任務視圖用 `right: calc(428px + var(--cu-task-view-outer-margin))` 定位 = **舞台 = 視窗 − agent 寬**,與本案同構 | 兩底相加 **1015px**。視窗低於此,`body` 是 `overflow-x: hidden`,**內容被裁掉**,不捲動也不重排 |
  | **Port** | **完全沒有底**:`width: calc(95vw - var(--side-chat-width, 0px))` + `right: var(--side-chat-width)`,同一條規則內無 `min-width`;全站 media query 只有 Tailwind 預設的 `40/48/64/80/96rem`,不管舞台 | 一路壓縮到接近零 |

  也就是說:本規格原本寫的「自然壓縮」是 **Port 的做法**;而 user 說「幾乎要抄 ClickUp」的那家,**是設硬底**。兩家都沒有做到 WCAG 1.4.10(ClickUp 裁切、Port 壓爛),所以**照抄任一家都不夠**。
  **「整頁設最小寬度、更窄就水平捲動」已查證,不可行**(2026-08-08,四路一手查證):

  | 判準 | 結論 | 一手依據 |
  |---|---|---|
  | 世界級有前例嗎 | **沒有**。五個可驗的 app shell 全部沒有頁面級 min-width;窄視窗一律覆蓋/堆疊/減面板,不給水平捲軸。min-width 只下在**元件層** | Atlassian app shell root `overflow-x:hidden` 且全檔無 min-width(`@atlaskit/navigation-system@10.11.1 root.compiled.css`);Carbon `.cds--css-grid` 只有 `minmax(0,1fr)`;Material 3「Use a single pane in compact layouts」;Notion `#notion-app{overflow:hidden}`;GitHub 768px 改 `flex-direction:column`;Slack min-width 全在元件(300–560) |
  | 符合我們的設計語言嗎 | **不符**。AppShell root 是 `h-svh w-full overflow-hidden` + 全鏈 `min-w-0`,要落地得先拆掉 root 契約 | `app-shell.tsx:218,250`;`scroll-area.spec.md:89`「不用於全頁捲動」 |
  | 違反 WCAG 嗎 | **違反 1.4.10**。決定性理由:W3C 把「**G206:提供切換成不需水平捲動的版面**」列為**達標手段**——只要能改成一次顯示一個,就證明內容不 require 二維佈局,例外條款不適用 | [WCAG 2.2 §Reflow](https://www.w3.org/TR/WCAG22/#reflow);例外清單只有 map/diagram/video/game/presentation/data table + 保持工具列可見 |

  **連 ClickUp 也不是這樣做**:它是硬底 + `overflow-x:hidden` **裁切**,不是給水平捲軸。提案的後半段在已知先例中找不到任何實作對應。

  ⚠️ **以下 4 點為歷史推演,已於「共存線 = 768」一節全部作廢,不是現行規則**(尤其第 2 點的「agent 轉覆蓋層」與「單面板切換」正是 user 否決過的兩套機制:「兩者都直接佔位更好」「不需要有浮貼過度」)。留檔僅為說明當時為何走錯。

  ~~替代方案(保留原意、去掉整頁橫捲)~~:
  1. 硬底下在**面板**不下在頁面(對照 Slack 300–560 / GitHub 256–296 的元件級做法),AppShell root 維持不動。
  2. 兩個底加起來塞不下時 → **降為單一表面**:agent 轉為覆蓋層疊在 modal 上,或單面板切換(Material / Atlassian panel `<90rem` 疊在 main 上同族)。
  3. **收合後入口必須看得見**,否則從「不過 1.4.10」變成撞 [F102](https://www.w3.org/WAI/WCAG22/Techniques/failures/F102)(功能 reflow 後消失且無圖示可喚回)。
  4. 需要二維的內容(資料表、圖表)自己 `overflow-x:auto`——那正好落在例外清單內。

  **誠實標註證據強度**:code 級明確禁止的只有 Atlassian 的 root 契約與 WCAG 本身;Material / Fluent / Polaris 是「查無明文允許」,不等於查到明文禁止。Asana 與 Linear 抓不到(403 / 純 client boot),不列入證據。

  **「agent 改浮貼 + modal 水平捲動」提案的判定(user 2026-08-08 提出)**:**前半可行、後半不可行,而且後半是多餘的。**

  兩者的差別不在捲動範圍大小,在**內容有沒有重排**:

  | | 內容會不會重排 | 需不需要二維捲動 | WCAG 1.4.10 |
  |---|---|---|---|
  | **浮貼(agent 蓋在上面,不佔位)** | **會**。底下的 modal 仍以完整視窗寬排版、文字照樣換行 | **不需要**。被蓋住的部分把浮層收起就看得到 | **過**。W3C 明列「提供切換成不需水平捲動的版面」(G206)為達標手段,收合浮層正是此手段 |
  | **水平捲動(不論整頁或只有 modal)** | **不會**。內容維持超出視窗的寬度 | **需要** | **不過**。例外清單只有地圖/圖表/影片/遊戲/簡報/資料表 + 保持工具列可見;一般表單與文字不在內 |

  **⚠️ 本節先前兩次判斷都錯,2026-08-08 第三次更正(user 連續抓出)**

  我先前寫過「水平捲動一律違反 WCAG 1.4.10」,並據此否決了 user 的兩個提案。**查證 W3C 原文後,這個判斷是錯的。**

  W3C 技術文件 **G206** 逐字寫著:「There may be situations where an author **needs to use a layout that requires horizontal scrolling**. In that case, **it is sufficient to provide options within the content that switch to a layout that does not require the user to scroll horizontally**」,且對 SC 1.4.10 標記為 **Sufficient**([G206](https://www.w3.org/WAI/WCAG22/Techniques/general/G206))。

  **正確的判準是「有沒有一條不需橫捲的路可走」,不是「有沒有提供橫捲」**:
  - 只要 UI 內有**可見的控制項**能切換成不需水平捲動的版面(例如收起 agent 後版面就塞得下),**1.4.10 即滿足**;此時在浮層開著時額外提供水平捲動,是**多一個選擇**,不是違規。
  - 真正會違規的是:**沒有**任何方式可以得到不需橫捲的呈現,或那個控制項在窄視窗消失(那會撞 [F102](https://www.w3.org/WAI/WCAG22/Techniques/failures/F102))。

  **因此三個提案的合規判定全部更正為「可合規」**:整頁 min-width + 橫捲、浮貼 + 主內容橫捲、浮貼 + modal 橫捲——只要 agent 的收合控制項一直看得見,且收起後版面在 320 CSS px 下不需橫捲。user 說的「甚至在打開浮層時還能完整看到內容豈不是更好」**成立**。

  **但合規不等於好設計,這兩件事要分開講**:世界級的實證仍然是零家做頁面級橫捲(Atlassian root `overflow-x:hidden` 且無 min-width、Notion `#notion-app{overflow:hidden}`、GitHub 768px 改堆疊、Slack min-width 全在元件層)。反對整頁橫捲的理由因此**從「違規」降級為「無前例 + 與我們 AppShell root 契約牴觸」**——那是架構成本,不是法律問題。

  **Atlassian 的浮貼要看清楚是哪一種**:它在 `64–90rem` 是面板疊在 main 上(`grid-area:main/aside/aside/aside` + `z-index:1`),main **不縮、照常重排**,被蓋住的部分靠收起面板看到——它**沒有**提供 main 的水平捲動。所以它證實的是「浮層遮蓋」這半,不能拿來證明「橫捲」那半;但依 G206,加上橫捲也不會因此違規。

  **而且後半是多餘的**:agent 一旦改成浮貼、不再佔位,modal 就拿得到完整視窗寬度,**根本不需要水平捲動**。想看被蓋住的那塊,正解是收起浮層(一個動作),不是橫向捲動(持續的操作負擔)。

  **因此本案的窄視窗解法**(可直接採用,不需另立新機制):agent 在舞台不足時**從佔位改為浮貼**,modal 取得完整寬度並正常重排;agent 保留可見的收合入口。Atlassian 的面板在 `64–90rem` 正是這個狀態(不透明貼齊、仍疊在 main 上、main 不縮),有一手前例。

  **⚠️ 本節兩次方案都被推翻,最終定案如下(user 2026-08-08 兩次論證)**

  **第一次推翻——不做自適應浮貼**。user 原話:「若 AI AGENT 是切換modal的切換器,在小螢幕時,一切成其他modal卻在第一時間仍被 ai agent 覆蓋其上其實蠻不直覺的,反而兩者都直接佔位更好,如果真的沒辦法看完整大不了就resize就好,如同ClickUp 一樣」。
  這個論證從心智模型直接推出:agent 的職責是「切換左邊顯示什麼」,使用者用它叫出一個 modal 卻被它自己蓋住,是**模型層的自相矛盾**,不只是體驗差。

  **第二次推翻——連「舞台最小寬度 + 舞台橫捲」也不需要**。user 提議、我查證後採用(原話帶「吧?」):「若 modal和ai agent 都佔位,那 modal內的內容溢出就是在modal body 內水平捲動即可這是modal自身的範疇應該跟本次討論無關…ai agent 本來就有設定最大和最小寬度,modal區塊本身就是被動的撿剩下的空間就好了吧?」
  正確。這個簡化成立,而且更乾淨:

  | | 規則 |
  |---|---|
  | agent | 主動方,寬度 = `clamp(320, 記憶寬, min(640, 半寬上限))` |
  | modal 區塊 | **被動撿剩下的空間**,不設最小寬度 |
  | modal 內容溢出 | 是 **modal 自己的範疇**(body 捲動),不是版位層的事 |
  | 舞台層橫捲 | **不需要**,刪除 |
  | AppShell root | 維持 `overflow-hidden` 不動 |

  這也正是 ClickUp 的形狀:任務視圖用 `right: calc(428px + margin)` 貼著固定的 agent 排版——**agent 主動、左邊被動**。

  **唯一還沒解的是一個算術退化,不是美感問題**:Dialog 自己四邊有 48px 內縮(`dialog.tsx:36-37` `DIALOG_INSET_VAR = var(--layout-space-bottom)`),寬度是 `min(maxWidth, calc(100vw − 內縮×2))`。當剩餘空間小於 96px 時,這個算式得到**零或負值**——Dialog 不是「擠」,是**渲染壞掉**。
  以 375px 視窗為例:agent 在下限 320 → 剩 55px → `55 − 96 < 0`。

  **因此需要且只需要一條規則**:剩餘空間低於 Dialog 還能撐出自身框架的下限時該怎麼辦。三個候選:
  - **(i) agent 自動收合成入口**,左邊拿回完整寬度(對齊 Material「小窗單面」canonical;也自動滿足 G206 的合規路徑)
  - **(ii) 明訂 modal+agent 並存的最低支援視窗寬**,低於此不提供並存
  - **(iii) 舞台模式的 Dialog 改用較小內縮**,把可用區間往下延伸

  **⚠️ 此段已作廢(2026-08-10)**:user 2026-08-08 原話「我覺得應該是當 modal會被擠得不成人形的時候就把 ai agent的入口拿掉並在此時禁止同時開啟ai agent就好」——**已被同一位 user 更晚、更完整的草案模型(§〇 第 7 條)取代**。留檔僅為說明演進。

  **⚠️ provenance 重要註記**:這條與 user 先前明確否認過的「窄視窗 modal 不提供入口」**形狀相同**。先前那次是**我捏造成 user 拍板**(user 原話:「我他媽到底哪有拍板過這件事」),已列在來源總帳的錯誤清單裡。**本次是 user 主動提出,取代先前的「觸發點永遠都在」**。兩者不可混為一談:前者是我冒充,後者是真裁決。

  **⚠️ 本段已作廢(2026-08-10)**:此規則出自 user 較早的講法「把 ai agent的入口拿掉並在此時禁止同時開啟」,**已被 §〇 草案模型取代**(草案較晚且更完整,連兩種點擊的處理都寫了)。
  **現行規則**:視窗低於形態線時,**agent 改成抽屜疊在 modal 之上,仍然可用**;入口照常提供。

  **這條一次消滅全部麻煩**:
  | 先前為了窄視窗發明的機制 | 狀態 |
  |---|---|
  | 舞台最小寬度 | **不需要**——線以下抽屜疊上、不共用寬度,不會有剩餘空間塌成 0 |
  | 舞台層水平捲動 | **不需要** |
  | 整頁最小寬度 + 整頁橫捲 | **不需要** |
  | agent 轉浮貼 | **不需要** |
  | 單面輪替 | **不需要**(本來也是我發明的,已撤回) |
  | Sheet 蓋在 modal 上 | **不需要**(user 一開始就說不做) |

  **這一段的演進留檔(防止有人把已刪機制當現行)**:先前曾寫「門檻 = 1024」並附算術 `1024 − 48 − 320 = 656 ≥ 608 ✅`——**那只在側欄是細軌時成立**;側欄展開 240 時 `1024 − 240 − 320 = 464 < 608`,而且要讓 modal 拿到 608 的話 agent 只能 ≤176px、**比下限 320 還小,數學上不可能**。之後改用「剩餘空間公式 + 舞台下限 352」,最後由 user 判定連那個也是多餘。**上述兩版全部作廢**,現行只有下面這一條。

  **共存線 = 既有的 768,不新增任何數字**(user 2026-08-08 提議、我查證後採用:「還是不需要加上至少要多寬吧?…只需要避免 modal和ai agent同時出現就可以應付大部分的情況了吧?為何要搞得那麼複雜麻煩?」——正確,我先前的「舞台下限 352」是多餘機制,已刪)。

  ```
  視窗 ≥ 1024 → agent 並排佔位,與 modal 左右並存
  視窗 < 1024 → agent 改成抽屜疊在 modal 之上(仍可用);入口照常提供
  ```

  768 是既有的行動線(`use-is-narrow-viewport.ts:3`),**不發明新 breakpoint**(遵 `app-shell.spec.md:219`)。

  **⚠️ 但 768 不是不可動的(2026-08-09 忠實度稽核補,先前完全沒入檔)**:user 逐字說過「當初768以下的定義也是**沒有仔細思考的結論**吧?**用不著死守**」。所以「768 是既有線」只是**沿用成本低**的理由,**不構成權威**。若下方的算術檢查在某個情境撐不住,**該動的是這條線本身**,不是想辦法遷就它。

  **算術檢查(768 這條線夠不夠)——結論:夠,而且原本那個「不夠」是我自己造出來的假問題**

  | 視窗 | agent 最寬 | 舞台 | 邊距 | modal 內容區 |
  |---|---|---|---|---|
  | 768 | 384(半寬上限)| 384 | 48×2 | **288** |

  **我先前判 288「不合格」,理由是「WCAG reflow 要 320」——這是誤用。**

  WCAG 1.4.10 的 320 指的是**視窗寬度**(原文:內容在等同 320 CSS px 的**寬度**下不得損失資訊或功能、不得需要二維捲動),**不是「某個元件的內容區不得小於 320」**。而在 320px 的視窗,我們**根本不共存**(768 以下不提供入口),modal 獨佔全視窗,完全合格。

  **所以 288 不是合規問題,是設計判斷問題。** 而這個判斷 user 早就給過:「如果真的沒辦法看完整大不了就 resize 就好,如同 ClickUp 一樣」。

  **定案:形態線 = 1024(與推擠線合一),邊距一律 48 不變。**
  **⚠️ 先前整段「288 < 320 不夠用」的算術已無意義**——線以下 agent 與 modal **不共用寬度**(抽屜疊上去),不存在「舞台被擠爆」這回事。

  **兩個被否掉的方案與理由(留檔)**:
  | 方案 | 為何否掉 |
  |---|---|
  | 依情境改邊距(agent 在旁邊時邊距縮小)| **開關 agent 會讓 modal 的 padding 跳動**,同一個彈窗一開一關就抖。user:「開開關關結果 padding 變來變去不會很奇怪嗎?」 |
  | 把線抬到 832 | **前提本身不成立**——它是為了滿足一個我誤讀出來的 320 下限。且線以下抽屜疊上、不共用寬度,窄情境根本不會發生 |

  **這是錯誤類型 #10「把規範讀死 / 誤用」的第四次**,已記入自檢表。

  **舞台下限、剩餘空間公式、agent 上限多一項——全部刪除**。理由:共存與否由單一條線決定,不需要 runtime 求值;而 768 以下 modal 獨佔全視窗,本來就不會被擠。

  **零塌陷的實測根因一併保留**(2026-08-08 瀏覽器實測):`max-width: min(512px, calc(100% − 96px))` 在 55px 容器內算出 **0px**(`min()` 得負值被夾到 0,不是被當無效忽略)。**注意適用前提**:`dialog.tsx:125` 現行寫的是 `calc(100vw − inset)`(視窗基準),375px 下實得 279px 而非 0;**0px 只發生在舞台模式改成容器基準之後**,所以這個實測歸屬於「舞台化新契約」的風險,不是既有 Dialog 的現況。

  **一個誠實的保留**:入口在門檻以下消失,等於「該寬度下不提供 modal 與 agent 並用」。我們的讀法是這不算 WCAG 1.4.10 的功能損失——agent 本身仍可用(關掉 modal 即可),消失的只是**同時**使用。這是**我們的解讀**,不是規範明文,實作前值得再確認一次。
- **窄視窗開 modal 的完整路徑**(user 2026-08-08 提問、我查證後確認:「窄視窗開 Ai agent是浮出抽屜,若點擊其中內容開啟可以同時出現 ai agent 的modal,則會直接開啟 modal模式且右邊同時出現ai agent吧?然後ai agent的寬度應該是不變的?」):
  **agent 本身不移動**(user 2026-08-08 提問、我查證後確認:「agent的位置其實不會移動吧?如果是寬視窗,agent在app shell 有佔位,開啟modal+ai agent後又關閉modal也會回到ai agent 有開啟的app shell」)。變的是**左邊那塊**:主內容 ↔ modal。
  窄視窗:agent 是 Sheet → 從 agent 內點內容、該內容的 modal 支援與 agent 並存 → 進 modal 模式,agent 就地成為佔位軌、**記憶寬不變(顯示寬依公式重算)**。關掉該 modal → **左邊變回主內容**,agent 回到視窗寬度該有的殼(窄視窗即 Sheet)。
  寬視窗:agent 一直是佔位軌,開關 modal 都不改變它——**只有左邊在換**。
  **佐證**:ClickUp 的任務視圖用 `right: calc(428px + var(--cu-task-view-outer-margin))` 定位,是**貼著固定的 agent 排版**,agent 不動。
  先前狀態表把「關 modal」寫成「不變」是錯的,已更正:**關 modal 一律回推擠線判定的形態,不是停在 modal 期間的形態**。

- **心智模型**(user 2026-08-08 原話:「ai agent 比較像是一個有能力切換左邊 modal 的元件」):agent 不是「跟 modal 並排的第二塊內容」,而是**右側一條固定的軌,它驅動左邊顯示什麼**。本規格所有版位規則都應由這個模型推出——會動的永遠是左邊。
  **範疇說明**(user 原話:「我們這個範疇是為了讓 AI AGENT更泛用所以多為他設計了更細緻的UI/UX」):這些額外機制是**刻意為 agent 加的**,不是版位層的通用預設。

- **這種共存只屬於 agent,不是所有右側面板**(user 2026-08-08 原話:「只有 Ai agent才會有這種獨特的互動方式,一般的右側側邊欄點擊內容若是開啟modal的話則應該照舊直接覆蓋整個畫面才對」):
  一般詳情面板點內容開 modal → **照既有行為,遮罩蓋滿整個畫面**,不做舞台化。舞台化是 agent 這個佔用者專屬的能力,寫在 L1 佔用者契約裡(descriptor 的一個能力旗標),**不是 L0 對所有佔用者的預設**。

- **第二層 modal:疊加,而且不蓋 agent(2026-08-09 user 定調)**

  user 逐字:「舞台上的modal開啟新的modal依然是一層疊一層啊,所以才說ai agent有一點類似切換器」、「port io和 ClickUp都還是能繼續疊上去的啊,而且如果是警告dialog難道要置換原本主任務的modal嗎?疊加上去不是更簡單直覺嗎?」

  **兩條路徑,行為不同——這正是「agent 有切換器成分」的意思**:

  | 從哪裡開的 | 左側怎麼變 |
  |---|---|
  | **從 agent 內點內容** | **重置左側的 modal 層數(整疊清空),開新的那一個** |
  | **從舞台上的 modal 自己點** | **照常疊上去,一層蓋一層**(警告 / 確認 dialog 尤其必須疊,不得置換主任務) |

  **第二層 modal 不蓋住 agent(B,已決)——2026-08-09 user 裁決**

  user 逐字:「按照我們之前的結論白紙黑字不是毫無懸念是B嗎?」(B = 只蓋原本 modal 所在區域,不遮蓋 agent)。

  **這條與舞台定義完全一致**:遮罩蓋的是**舞台**,agent 不在舞台上,所以任何一層都蓋不到它。疊加不改變這一點——第二層、第三層都是舞台上的元件,照舞台的規則走。

  **我在這題上錯了三次,方向還不一樣,留檔防重犯**:
  1. 刪掉 user 原話的語氣詞(「…才對**吧?**」→「…才對」),把徵詢寫成裁決 → 過度宣稱
  2. 撤回後列成「候選 A / B 未決」,但當時舞台定義其實已經決定了它
  3. **今天早上寫對了(B),卻在下午自己撤回成未決** → **過度保守**。原因:前三次被抓「把推論寫成 user 拍板」,於是矯枉過正,反過來把已定的結論降級成未決——正是我自己今天早上才寫進錯誤類型第 13 條的那個病。

  **user 對第 3 次的原話**:「而且按照我們之前的結論白紙黑字不是毫無懸念是B嗎?為何又要問我?你是哪裡搞不懂嗎還是規格又寫矛盾不清了?」

  **一個必須留檔的旁支(user 曾提過、目前由 B 取代)**:user 早先寫過「同時出現modal和ai agent的時候,若在modal上的內容又可以再開啟一個**沒辦法打開 AI agent的** modal時,則該modal應該要改成遮蓋整個頁面包括AI AGENT才對吧?ClickUp 也是這樣」。那句帶「才對吧?」是徵詢,且成於舞台定義成形之前;**已由 2026-08-09 的 B 裁決取代**。留檔只為說明它存在過,不是現行規則。

  **兩家實測**:ClickUp = 遮罩滿版,**AI 面板疊在遮罩之上**(所以面板不變暗、可互動);Port = 遮罩依 agent 寬讓位。**兩家達成的效果一樣(agent 不被蓋住),做法不同。**
  **我們採 ClickUp 的做法**(滿版 + 疊上去)——它更簡單:遮罩不必知道 agent 多寬、不會有缺角、不必補塊。並取兩家共通的「可續疊」行為。

- **兩條線各管各的,不衝突**(2026-08-08 修正:我先前把這條刪掉是錯的,刪完 768–1023 就沒有規則可用):

  | 視窗 | agent 單獨開 | 開了 modal 之後 |
  |---|---|---|
  | **< 1024** | Sheet | **agent 以抽屜疊在 modal 之上**,仍可用;入口照常 |
  | **768–1023** | Sheet | ⚠️ **未決,見下方「抽屜變佔位」段** |
  | **≥ 1024** | 佔位 | 佔位,不變 |

  **推擠線 1024 只治理 shell 模式**(agent 單獨開時是欄位還是 Sheet);**modal 期間 agent 一律佔位**,依 user 原話「ClickUp在modal模式的ai agent永遠只會有一段且就是佔據位置的那種」。兩者不是同一件事,所以不是矛盾。
  這也自動避開「Sheet 疊在 modal 上」——modal 期間 agent 根本不是 Sheet。
#### ⚠️ 「抽屜就地變佔位」——世界級零前例,此題退回未決(2026-08-09 研究後)

**規格先前寫**:768–1023 時 agent 是抽屜,開 modal 就**就地變成佔位軌**。依據是 user 的一段描述(逐字):「窄視窗agent是抽屜→從裡面點內容,那個內容的modal支援跟agent並存→直接進modal模式,agent移到右邊佔位,寬度不變」。

**但 user 2026-08-09 自己回頭質疑**:「可以確定的是**在沒有 resize 的情況 sheet 根本不可能變成佔位**」,並要求查世界級做法。

**研究結果(2026-08-09,獨立審查方實機 + 官方文件)**:

| 題目 | 結果 |
|---|---|
| 抽屜開著時開 modal,主流怎麼做 | **A:保留抽屜,modal 蓋在它上面**(多數家)|
| 有沒有「抽屜自動變欄位」的前例 | **零家**。ClickUp 的 AI 面板**原本就是右側欄**,不是從抽屜轉型來的(實機確認)|

**所以「抽屜變佔位」既無前例、user 自己也質疑,規格不得預設。三個選項**:

| 選項 | 內容 | 代價 |
|---|---|---|
| **甲** | **形態線 = 推擠線 = 1024,合成一條**。1024 以下 agent 是抽屜**疊在 modal 之上**(仍可用);1024 以上並排 | 兩條線變一條,768–1023 的怪異情況整段消失。**已採用**,細節見 §〇 第 7 條 |
| **乙** | 照世界級主流:**抽屜留著,modal 蓋在上面** | 違反已決的「agent 永遠可操作」——被蓋住就點不到 |
| **丙** | 維持原本的「抽屜變佔位」 | 世界級零前例;且 user 自己質疑技術上說不通 |

**我建議甲。** 它讓「兩條線」變成「一條線」,把整個 768–1023 的特例消掉,而且不違反任何已決規則。**此題須 user 拍板。**

- **modal 模式永無 Sheet**。原理:Sheet 的遮罩只為保護主內容;modal 期間主內容已在 modal 遮罩下,無需第二層保護。
- modal 關閉:agent 依 shell 規則復原(≥1024 佔位;<1024 換殼 Sheet 續開)。**遮罩交接**:modal 遮罩淡出、Sheet scrim 淡入 = 保護責任移交,同一 250ms 窗口,非無中生有。
- **🚨 `modal={false}` 會讓「點 agent」直接關掉 modal**(2026-08-08 一手驗證,原規格完全沒處理)。`@radix-ui/react-dialog@1.1.15` 的 non-modal 分支仍走 DismissableLayer,其 `onInteractOutside` **只在兩種情況 preventDefault**:目標是 trigger、或 pointerdown 之後的 focusin;**其餘一律往下走到 `onDismiss`**。agent 面板在 Dialog 之外,所以使用者一點 agent,任務 modal 就關了——共存需求當場破功。
  **契約(不是 POC 待辦,是必須先定義的規則)**:明訂「允許互動範圍」= 任務 Dialog + agent 面板 + 兩者所有合法 portal 子節點(Popover / DropdownMenu / Command 都會 portal 到 body,不在任一 subtree 內)。以 composed path 或等效機制在 `onInteractOutside` 攔下範圍內的互動。
- **遮罩目前只有視覺、沒有鍵盤與輔助技術契約**:遮罩只是畫面上的暗層,被蓋住的主內容與側欄**仍可 Tab 進去、仍在螢幕閱讀器的虛擬游標範圍內**。既然本案刻意不是 ARIA modal(見螢幕閱讀器段),就必須自備完整契約:遮罩範圍內的區域同步 `inert` 並移出輔助技術樹,解除時機明訂。驗收要走 Tab / Shift+Tab / 指標 / SR 虛擬游標四條路徑。
- **Dialog 舞台模式 = 本案新增 L0 工程**(非既有)。既有 dialog.tsx:125 只做 100vw 基準壓縮、fixed left-1/2 viewport 置中(:113)、inset-0 全視窗遮罩(:46)。舞台化契約四件事:(a) 置中/壓縮/遮罩改以舞台為基準;(b) `modal={false}` 或等效 FocusScope 排除(否則焦點進不了 agent,dialog.spec.md:181-183);(c) aria-hidden/inert 排除 agent 面板;(d) `onEscapeKeyDown` 依 `document.activeElement` 焦點域 guard(Radix Esc 預設 document 層自動關,dialog.spec.md:184)。依 M2:寫碼前必先 POC。

### 收合入口(2026-08-09 補;先前完全沒有規格)

它是四形態之一、狀態轉移表**五格的目的地**,卻一直沒有本體規格——按下 X 之後使用者被送到什麼東西上,規格答不出來。DS 這邊也沒得繼承:`app-shell.spec.md` 對 aside **只有 `⌘.` 快捷鍵(`:270`)與 controlled `asideOpen`(`:73`)**,**沒有任何可見觸發點的 canonical**(對照 Sidebar 有 `SidebarTrigger` 位置 SSOT,`sidebar.spec.md:302`)。所以要新訂。

| 項目 | 規則 |
|---|---|
| **誰提供** | L1 佔用者的 descriptor 提供 `trigger`(圖示 + 無障礙名稱 + 徽章狀態);**L0 負責渲染位置**。L0 不知道它是 agent。 |
| **放哪** | **由使用這個設計系統的產品自己決定**(2026-08-09 user 更正:「觸發點可以是由 consumer 自己定義,基本上可以是一顆按鈕,就類似 ClickUp 那樣」)。
  **DS 不規定位置**,只提供元件與規範(無障礙名稱、徽章疊放、焦點回歸)。
  **世界級對照(2026-08-09 實機 + 官方文件)**:

  | 產品 | 觸發點放哪 |
  |---|---|
  | ClickUp | 頂列 + 左欄各一個 |
  | Notion | **右下角圓形按鈕** + 左欄 |
  | Linear | 右下角 |
  | Slack | 頂部 → 展開為右側分割 |
  | Figma | 底部工具列 |
  | Cursor | 側欄 |
  | VS Code | 標題列 → 副側欄 |

  **七家七種放法,沒有一家的設計系統規定位置**;其中 ClickUp / Notion / Cursor / VS Code 還讓使用者自己調。**這直接證明位置不該由 DS 訂。**

  **DS 給的預設建議**:全域頂列右側(ClickUp / Slack / VS Code 同款);產品要改成右下角圓鈕(Notion / Linear 同款)也成立。
  **⚠️ 先前寫「右軌末端固定位置」是我自己訂的,已撤回** —— 那不但沒依據,也跟 ClickUp / Notion 兩家都不一樣。 |
| **長怎樣** | 消費既有 `Button` 的 `iconOnly` + `size="sm"`,**不自刻**。圖示由 descriptor 提供。 |
| **徽章** | **完全消費既有規範,不新訂任何樣式**:`<Button iconOnly overlayBadge={<Badge dot variant="high" />} />`。
  `button.spec.md` 逐字:「canonical 走 `<Button iconOnly overlayBadge={<Badge .../>} />` prop,內部把 badge 相對於 icon 視覺重心定位」、「**禁止** consumer 手刻 `<div relative><Button/><Badge absolute/></div>`」。
  **⚠️ 我先前寫「疊放位置:入口按鈕右上角,`absolute` 定位於按鈕框內」——那正是該 spec 明文禁止的手刻寫法,已刪**(2026-08-09 user 抓出:「按鈕內部內容怎麼放、是否要有紅點,這些都要遵循該元件的規範,不是另外定義新的樣式」)。
  dot 只接 `critical` / `high` 是 `badge.spec.md` 既有規則,我們選 `high`,不新增層級。 |
| **何時亮** | 收合期間該 session 有**未讀的完成/失敗**才亮。串流進行中**不亮**(進行中不是「要你看」,是「還在跑」)。
  **⚠️ 2026-08-09 更正**:先前串流段寫「背景續跑,徽章亮著」與本條互斥,已改——**背景續跑期間不亮,跑完(成功或失敗)才亮**。 |
| **未讀狀態住哪** | 住 **L1 佔用者層**,與串流狀態同一個持有者(`per-session keyed`),**不進 L0**。 |
| **誰清** | 使用者**看到該 session 的內容**時清該 session 的未讀(展開面板且該 session 為當前);切到別的 session **不清**其他 session 的未讀。 |
| **多 session 怎麼聚合** | 入口只有**一顆圓點、不顯示數字**——語意是「有東西要看」,不是「有幾件」(對齊 `badge.tsx:10,18-19` dot 模式的既有語意)。**任一 session 有未讀就亮。** |
| **持久化** | 未讀跟著 session 狀態一起持久化(重整後仍亮);不另建儲存。 |
| **與 modal 內入口的關係** | **同一個元件**,由不同的人放:shell 內由 L0 放在右軌末端;modal 內由該 modal 的 consumer 放在自己的標題列。**共存線以下(<768)modal 內不放**。 |
| **焦點** | 面板關閉時焦點回到「觸發本次開啟的那顆入口」。
  **若該入口已不存在**(從 modal 內開、modal 已關):退回 shell 右軌末端那顆。
  **⚠️ 先前這裡有一段 `triggerVisible === false` 的 fallback,已刪**(2026-08-10):那個狀態不存在了,觸發點恆在。最終 fallback 仍保留 `#app-shell-main`(`app-shell.spec.md:215`),供觸發點因其他原因不存在時使用。 |

**四形態 × 入口可見性**:佔位欄 → 不顯示(面板本身在);Sheet → 不顯示;**收合入口 → 就是它本身**;滿版 → 不顯示(滿版是獨立 route,退出即回進入前形態)。

---

**滿版(獨立 route)**——L1 佔用者自己的全頁對話視圖,不是 L0 右軌形態。

**⚠️ 滿版 ↔ 面板的關係鐵律(2026-08-09 忠實度稽核補,先前全文沒有這一句)**:user 逐字「**不管滿版還是非滿版都應該要有差不多的架構,兩者的差異比較像是 rwd 而已**」。
所以:**兩者共用同一組能力、同一份狀態、同一條路由規則,差別只在版面尺寸帶來的呈現差異**。任何「這件事只有滿版能做」的規則都違反這條,除非該差異純粹來自空間(例:session 列表在滿版是常駐左欄、在面板是 popover——那是同一組能力的兩種版面)。
- 入口:面板標題列「展開」動作 + session popover「查看全部」;退出回進入前形態。
- 左欄可收合,寬消費 `var(--sidebar-width)`(uiSize.css:91,= 240);元件不重用 L0 Sidebar(cookie `sidebar_state` 與 Cmd+B 是單例,sidebar.tsx:61-63;vercel/chatbot 同源親驗);<768 收合行為類比 sidebar.spec.md:588。
- 滿版內點內容 = 同一條「去它的家」路由:任務 → modal 疊在滿版上(殼不動;**此時就是一般的 modal 疊一般頁面,agent 內容在遮罩下、不可互動且 `inert`**——B 只管右軌共存態,見判定函式);list → 退出滿版、導航主內容(agent 回到退出前的面板形態)。

### 與既有 canonical 的衝突總表(先解才能寫碼)

本案要住進 `AppShellAside`,但它的 owner spec 有 **五處**與本案正面衝突(先前寫「六處」但表只有五列,已更正)。全部逐字驗證過。這五處決定同一件事:**agent 要不要沿用 `AppShellAside`**——所以它們是**一個決策**,不是六個。

| # | 本案要什麼 | 既有現況 | 這到底是多大的改動 |
|---|---|---|---|
| 1 | agent 在 1024 換殼 | Aside 在 768 換(`app-shell.spec.md:219`、`app-shell.tsx:178,338`) | **真改動**,但 additive:多一個 breakpoint prop,不傳就維持 768 |
| 2 | 對話要能控制捲動 | Aside body 已有 ScrollArea(`app-shell.tsx:329`),但 `scroll-area.tsx` 的 `ref` 只轉給 **Root**,真正可捲的 Viewport 是內部節點、**拿不到** | **只需外露一個 ref**(2026-08-08 更正)。不是三選一,不是重造——**沿用既有捲動容器,補 `viewportRef` 即可**。user 說「不是基於有內建捲動再去自己控制捲動?」正確 |
| 3 | 標題列放「切換對話」與「展開全頁」 | **header SSOT 本來就允許 actions**:`header-canonical.spec.md:16` 是所有 header 家族(含 DialogHeader/SheetHeader/AppShell header)的共同 SSOT,`:63` 與 `:149` 明列 `actions` slot | **比我先前寫的小很多**(2026-08-08 更正)。`app-shell.spec.md:335` 那條禁令是 **AppShellAside 自己的 fork-drift 防線**(2026-06-12),不是設計語言的禁令。放寬它 = 讓 Aside 對齊既有 header SSOT,**不是破例** |
| 4 | ~~遮罩讓開 agent~~ | ~~遮罩蓋滿全畫面(`app-shell.spec.md:259`)~~ | ❌ **已撤回**:遮罩是 Dialog 自己畫的,不是 AppShell 畫的,也不需要 AppShell export `modalOpen`(見下方「舞台基準的具體作法」段)。先前把它列為衝突是誤判 |
| 5 | `⌘.` 打字時不觸發 | `app-shell.spec.md:270,274` 自承是已知 gap | **修既有 bug**,對 consumer 只有變好 |

**user 提出的 header 具體設計,對照 SSOT 檢查**:
- 「切換對話」= 標題後方的 inline 下拉箭頭 → 屬 header content row 的 title 區,`:149` 的 `children(title + close X / actions)` 涵蓋 ✅
- 「展開全頁」= 右側 action 區、X 的左邊 → 同屬 `:149` 的 actions ✅
- 「X 與它之間有分隔線」→ **既有規範已明文要求,不是新的**(2026-08-08 更正:我先前只查 header canonical 一份就斷言「查無明文」,是 M10「掃描不得截斷」的同一種錯)。`action-bar.spec.md:255-267` 分隔線四個正當理由的**理由 3「誤觸保護」**:「關閉／解除鈕的**左側緊鄰其他操作按鈕**」→ **必加**。且該 spec「落點歸屬」段明訂**由 DS 元件自動放、consumer 零自刻**,Dialog 標題列已實作(`dialog.tsx:184-193`)。
  **結論:user 的 header 設計完全落在既有規範內,本案不需新增任何 header 規則。**

### 「舞台」只在 modal 開著時存在(user 2026-08-08 確認的界線)

user 追問:「這邊講的都是 modal+ai agent 的情況對吧?在一般 app shell 打開 ai agent,ai agent 在互動和整個視覺交互仍表現得跟一般的 appshell 右側側邊欄是一樣的對吧?」——**是,兩點都對。**

| | 沒有 modal(一般 app shell) | modal 開著 |
|---|---|---|
| agent 的版位行為 | **就是一般的右側面板**:佔右軌、推擠主內容、到線換 Sheet——與今日 `AppShellAside` **完全相同** | 同左,agent 不動 |
| 「舞台」這個概念 | **不存在**,也不需要。沒有遮罩、沒有要置中的東西 | 才出現:modal 在舞台置中、遮罩到舞台邊界 |
| 其他元件 | **一律落在舞台上**(所有 `position:fixed` 的元件讀舞台變數;變數不存在時 fallback 0 = 與今日完全相同) | **同左**——兩欄行為一致,不分情境 |

**所以「舞台」不是新的版位層,是 modal 期間才啟用的一個基準切換。** 沒有 modal 時整套機制靜默,`--app-shell-rail-inline-end` 沒有任何消費者。

**agent 與一般右側面板真正的差別,只在面板「裡面」**:標題列多了切換對話與展開全頁、可拖拉調寬、內容是對話。**面板「怎麼坐在版面上」完全一樣**——這正是它能沿用 `AppShellAside` 的原因。

### 一條通則取代逐元件清單(user 2026-08-08 提出,採用)

user 提議、我查證後採用(原話帶「才對吧?」):「反正視覺和互動的結果就是把原本的畫面挪出了一個空間放 ai agent,而其他的元件都應該按照原本的規則在舞台運作得好好的才對吧?」

**正確,而且這條通則取代我先前那張逐元件清單。** 我原本在一個個問「Toast 怎麼辦?FileViewer 怎麼辦?」——那是錯的問法。正解只有一句:

> **舞台 = 其他所有元件眼中的「視窗」。** agent 挪走一塊之後,其餘元件照它們原本的規則在舞台裡運作,規則本身不改。

所以 Toast 照樣落在舞台右下、FileViewer 照樣全「舞台」、Dialog 照樣在舞台置中——**沒有任何元件需要為 agent 寫特例**。需要改的只有一件事:那些**以視窗為基準定位**的元件(用 `100vw` / `inset-0` / `position:fixed`),把基準從視窗換成舞台。

這也讓「本案要改幾個元件」的答案從「每個都要談」變成「**改一個共同基準,全部跟著對**」。

### 舞台基準的具體作法:一個 runtime CSS 變數,預設 0

user 觀察正確:「遮罩會不一樣**只因為有 agent**,其他情況照舊」。具體機制如下(不是抽象分層,是可直接寫的三行改動)。

**先釐清一件事**:遮罩不是 AppShell 畫的,是 **Dialog 自己畫的**(`dialog.tsx:46` `fixed inset-0`)。所以這件事根本不需要 AppShell 參與,也**不需要它 export `modalOpen`**——先前把這列為衝突 #4 是誤判。

**機制**:**L0 發布**一個 CSS 變數(右軌佔用者只回報寬度),Dialog 讀它,**fallback 為 0**。

| 誰 | 做什麼 |
|---|---|
| agent(佔用者) | **不自己設變數、也不碰 `stageDepth`**——只向 L0 回報自己的寬度。**唯一寫入者是 L0**(見「舞台變數的唯一 owner 契約」)。2026-08-09 更正 |
| Dialog 遮罩 | **`inset:0` 滿版,不讀變數**(agent 疊在其上)。變數只給 **modal 面板的置中與壓縮**用 — 沒人設就是 0,**與今日完全相同** |
| Dialog 置中 | 以「視窗 − 該變數」為基準,而非整個視窗 |
| Dialog maxWidth | `min(maxWidth, calc(100vw − var(--app-shell-rail-inline-end, 0px) − 邊距×2))` |

**⚠️ 第三個前提錯誤:遮罩不是矩形問題(2026-08-09 跨模型審查抓出)**

`primary-header` layout 的結構是 `row1 globalHeader(全寬)/ row2 [sidebar][main][aside]`(`app-shell.tsx:208-210` 註解逐字)。**agent 只在第二列**。所以「遮罩讓出右側全高一條」會在**右上角讓出一塊沒有 agent 的區域**——那裡是 global header,不該露出來。

**我提過的反提案(遮罩不動、把 agent 疊上去)已被駁回,理由具體且我已驗證**(2026-08-09 辯論第二輪):
- `modal={true}` 分支會啟動 `trapFocus: context.open` 與 `disableOutsidePointerEvents: true`(`@radix-ui/react-dialog@1.1.15` 逐字),外加 `hideOthers()` 把 agent 標 `aria-hidden`、`RemoveScroll` 的允許區不含 agent。**單純提高 z-index 只換到「看得見」,換不到「可互動」。**
- z-index 也受祖先 stacking context 限制;portal 在 body 且 DOM 較後,不能保證 AppShell 子節點提高 z 就贏。

**而 user 已明確要求 agent 在 modal 期間必須可互動**(原話:「會永遠都在最右邊且**永遠可操作**」)。所以路線只剩一條(**與 §六之一之三 的定案同一條,非兩個時間層**):

> **`modal={false}` + 自繪遮罩 + 自行協調焦點/inert/outside-interaction/捲動。**

`modal={false}` 分支已驗證 `trapFocus: false`、`disableOutsidePointerEvents: false`,那些攔阻機制本來就不啟動;但同時**它也完全不渲染遮罩**(見下),所以遮罩本來就得自繪——**幾何問題無法迴避,必須正面解決**。

**agent 的右軌位置:只在 row2,與今日 aside 相同——這是推導結果,不是拍板題**(2026-08-09 重新歸類)。
推導鏈:user 已確認「一般 app shell 打開 agent,互動與視覺交互跟今日右側側邊欄一樣」+「app shell 不重新排版、不位移」→ 今日 aside 在 row2 → agent 在 row2。改成全高會改變 AppShell 的 grid 結構,與這兩條直接衝突。**ClickUp 實測也一致**:modal 模式下 AI 面板 top=69(在頂列之下),不是頂天。
遮罩幾何已定案:**滿版 `inset:0`,agent 疊在其上**(照 ClickUp 實測)。**不做 L 形、不做讓位、不需要補塊。**

**⚠️ 兩個致命前提錯誤(2026-08-08 跨模型審查抓出,我與四路同模型審查全數漏掉)**

1. **`modal={false}` 時遮罩根本不存在**。`@radix-ui/react-dialog@1.1.15` 逐字:
   ```js
   // DialogOverlay
   return context.modal ? jsx(Presence, { ...DialogOverlayImpl }) : null;
   ```
   非 modal 分支**回傳 `null`**。所以「把既有遮罩的 `right` 改掉」是在改一個**不會被渲染的東西**。舞台遮罩**必須自繪**——這是新元件,不是調參數。

2. **CSS 變數設在 AppShell 節點上,portal 出去的內容讀不到**。Dialog 會 portal 到 `document.body`(Radix Portal 預設容器),而 CSS custom property **只沿 DOM 祖先繼承**。設在 AppShell 節點 = portal 內容看不見。
   → **修正:變數必須設在 `document.documentElement`(`:root`)**,portal 到 body 的內容才吃得到。Port 的實作也是設在 root 層級,我先前說「設在 AppShell 節點」是講錯。

**修正後的機制**:

| 誰 | 做什麼 |
|---|---|
| agent 佔位時 | **L0** 在 `:root` 設 `--app-shell-rail-inline-end: <寬>px`(離場時移除)。**agent 自己不寫,只回報寬度**——唯一寫入者是 L0(2026-08-09 更正,先前此處寫成 agent 自己設)|
| 舞台遮罩 | `position:fixed; inset:0`(滿版,含 global header),**agent 疊在其上**(agent 容器 z-index 高於遮罩)。與 ClickUp 實測一致。**不讀舞台變數**——變數只給 modal 面板的置中與壓縮用。 |
| Dialog 置中 / maxWidth | 同樣讀該變數,基準改為舞台 |

**為什麼這個作法對**:
1. **既有 consumer 零影響**——沒人設變數就走 `0px` fallback,行為與今日逐位元相同。
2. **不需要跨元件傳 state**——變數設在 `:root` 後,portal 內容也讀得到,不必 export `modalOpen`、不必 context、不必 prop drilling。(**前提是設在 root,不是 AppShell 節點**,見上方更正。)
3. **AppShell 永遠不知道「agent」是什麼**——它只看到兩個沒有語意的量:一個寬度數字、一個 `stageDepth` 計數。維持分層原則。
4. **一般詳情面板不設變數** → 自動維持「遮罩蓋滿」的舊行為,正是 user 要的「其他情況照舊」。
5. **有一手前例**:Port 的實作就是這個模式——`right: var(--side-chat-width)` + `width: calc(95vw − var(--side-chat-width, 0px))`,連 `0px` fallback 都一樣(2026-08-08 抓其 `index-Bt_Ujsyb.css` 親驗)。

**⚠️ 它不是 token,是 runtime 變數**(2026-08-08 user 追問「該 token 會隨著使用者 resize 側欄而變動?」逼出的更正):
會隨使用者拖拉而變的東西**是狀態,不是設計 token**。設計 token 是靜態的設計決定(16px / 48px / 色值);這個值每一幀都可能不同。
→ 因此它**不進 `tokens/`**,而是 runtime 變數。**寫在 `:root`,不是 AppShell 節點**——Dialog 走 portal 到 `body`,CSS 變數只沿 DOM 祖先繼承。完整契約見「舞台變數的唯一 owner 契約」。
  **⚠️ 先前此處寫「AppShell 設在自己節點上」是錯的,已刪(2026-08-09)**。連帶更正:當時拿 `--app-shell-aside-modal-width`(`app-shell.tsx:363`)當前例也不對——那個是 inline style 設在 `SheetContent` 上、由同一節點的 class 消費(自產自銷),不是「設在祖先讓後代繼承」,撐不起這個用法。命名仍沿用 `--app-shell-*` 前綴 + CSS logical property 既有詞 `inline-end`,不自創縮寫。
`tokens/README.md:49` 的「新增 token criteria」第 1 條是「先質疑是否真需要」——這一題的答案是**根本不需要新 token**。

**在這個決策落地前,下列敘述都帶條件**:Sheet 寬度(走 A 是 `min(90vw, clamp(240,記憶寬,640))`,`app-shell.tsx:360-364` 會覆蓋 Sheet 預設檔;走 B 才是 `w-3/4`/448)、landmark 歸屬、Tab 序起點。

### 換殼寬度公式(2026-08-09 跨模型審查產出;解掉「Sheet 448 vs 半寬 384 不能同時成立」)

**先把兩個東西分開**——先前規格混用,才會寫出「寬度不變」這種寫不出來的話:

| 名詞 | 意思 | 誰會寫它 |
|---|---|---|
| **記憶寬 `M`** | 使用者上次拖拉留下的意圖,存在持久化層 | **只有拖拉佔位軌的把手會寫**;換殼、resize、開關 modal 一律不寫 |
| **顯示寬** | 這一幀實際渲染的寬度 | 每次由公式重算,不回寫 |

**公式**(`V` = 視窗寬,`S` = 常駐側欄佔的寬;側欄若是覆蓋形態則 `S = 0`):

```
M      = memoryWidth ?? 320                    // 初值 = 下限
Sheet  = min(0.75 × V, 448)                    // sheet.tsx:80-82 既有,不改
Rail   = clamp(320, M, min(640, (V − S) / 2))  // 下限 320 / 上限 640 與半寬,取小
```

顯示寬 = 目前形態是 Sheet 就取 `Sheet`,是佔位軌就取 `Rail`。

**推論(直接解掉原本的矛盾)**:768 視窗、側欄覆蓋(`S=0`)時 `Sheet = 448`、`Rail = clamp(320, M, 384) = 384`。**兩者本來就不同,不該相等**——原文「寬度不變」要改成:**記憶寬不變,顯示寬重算**。

**邊界**:若 `min(640,(V−S)/2) < 320`(上限跌破下限),`clamp` 無解 → **該視窗不並排**,由形態線接手(agent 改抽屜疊上,寬度由 Sheet primitive 治理)。

---

### 舞台變數的唯一 owner 契約(2026-08-09 跨模型審查產出;解掉「`:root` vs AppShell 節點」互斥)

| 項目 | 規則 |
|---|---|
| **誰寫** | **唯一 writer = L0 的 `StageInsetPublisher`**。其他任何層禁寫。 |
| **寫到哪** | `document.documentElement`(`:root`)。**必須是 root**——Dialog 走 portal 到 `body`,CSS 變數只沿 DOM 祖先繼承,設在 AppShell 節點 portal 內容讀不到。 |
| **變數名** | `--app-shell-rail-inline-end`(沿用既有 `--app-shell-*` runtime 前綴 + CSS logical property 既有詞) |
| **何時寫** | layout effect(**在 paint 前**),避免第一幀閃動 |
| **何時存在** | **只有 `stageDepth > 0` 且 agent 是佔位形態時才寫**;其餘一律移除。這正是「舞台只在 modal 開著時存在」的機械落地——沒有 modal 時變數不存在,所有消費端吃 `0` fallback,行為與今日完全相同 |
| **疊加時** | **各層 modal 共讀同一個值,禁覆寫、禁歸零、禁另建自己的 layer 值**。B(任何層數都蓋不到 agent)的機械保證**不在遮罩幾何**(遮罩本來就滿版),而在 **agent 的 z-index 恆高於所有遮罩** + **agent 不被任何一層設 `inert`** |
| **何時更新** | `ResizeObserver` 監看三件事:拖拉、視窗 resize、側欄寬變化 |
| **離場** | agent 卸載時以 **CAS(比對自己寫的值才清)** 移除,避免競態誤清別人的值 |
| **多 writer** | 偵測到第二個 writer → **開發期直接報錯**,不做「最後贏」的靜默合併 |
| **SSR / 尚未就緒** | 值為 `0`;所有消費端一律 `var(--app-shell-rail-inline-end, 0px)`,**沒有 agent 時行為與今日完全相同** |
| **首次出現** | 先寫變數、下一幀才啟動位移 transition,避免從 0 跳到目標值的抖動 |

---

### 形態判定函式(2026-08-09 跨模型審查產出;解掉「同一操作兩個相反結果」)

先前的 4 欄狀態表**沒有把 modal 狀態當輸入**,所以同一個事件在表裡會有兩個相反答案。改為**單一判定函式**,狀態表降級成它的測試案例。

```
resolve({ open, V, S, M, route, depth, sheetOwner, nestedCoverage })
  → { host, trigger, width, coverage, interactive, reason }
```

**判定順序(由上到下,第一個命中即回傳)**:

| # | 條件 | 結果 |
|---|---|---|
| 1 | `route === 'fullscreen'` | 滿版 |
| 2 | `stageDepth > 0` 且 `V < 1024`(形態線)| **Sheet(疊在 modal 之上)**;且**不回寫記憶寬**。**此條排在 `!open` 之前**——否則面板本來就關著時會先命中下一列,漏掉「不提供 trigger」(2026-08-09 抓出的順序錯) |
| 3 | `!open` | 收合入口 |
| 4 | `stageDepth > 0` | **佔位軌**(modal 期間一律佔位,與推擠線無關)。**只准判 `> 0`,禁按層數分支**——任何「第二層才如何」的規則都違反 B |
| 5 | `V >= 1024` | 佔位軌 |
| 6 | 另一方**確實持有** Sheet(`sheetOwner != null && sheetOwner !== 'agent'`)| 收合入口(Sheet 互斥,後動作勝)。**先前只寫 `!== 'agent'`,連「沒有人持有」也會命中**,2026-08-09 修 |
| 7 | 其餘 | Sheet |

**`coverage`(遮罩範圍)**:`depth === 0` → `none`;`depth >= 1` → **`stage`**(遮罩蓋舞台,agent 不在舞台上 —— user 2026-08-09 裁決 B,**所有層數一致**)。

**`interactive`**:**在右軌共存態(佔位軌)下 agent 恆為 `true`**——這是 B 的直接結果:那個狀態下任何層數的遮罩都蓋不到它。

**⚠️ B 的適用範圍(2026-08-09 補,審查方抓出)**:B 只管**右軌共存態**。**滿版模式不適用**——滿版時 agent 是整個畫面,modal 疊在它上面就是一般的 modal 疊在一般頁面上,**遮罩本來就會蓋住底下的 agent 內容,那時 agent 不可互動、也應該 `inert`**。這不是違反 B,是 B 根本不管那個狀態。先前寫「agent 恆為 true」沒有限定範圍,與「遮罩覆蓋範圍內同步 inert」互斥,已修。

**與 4 欄狀態表的關係**:**表不再是規範,是這個函式的測試案例表**。每一格 = 一個 `resolve()` 斷言。兩者不一致時**以函式為準**,並把該格當成 bug。

---

### 線的歸屬

| 線 | 歸屬 | 性質 |
|---|---|---|
| 1024 | **全 shell 推擠線**(agent 換殼 + 側欄欄位↔細軌)| **新訂**,依據見下節「推擠線原則」;落地為 JS 常數,與 768/1280 同款 |
| 768 | 行動線(細軌→漢堡,側欄既有) | use-is-narrow-viewport.ts:3 + sidebar.spec.md:588 |
| 1280 | AppShell 既有 XL 線 | app-shell.tsx:91;agent 以 number 傳寬繞過(existed-but-bypassed) |

modal 模式**不另立線**:**形態線是 1024**(與推擠線合一),1024 以上並排時 agent 沿用 shell 模式的 min/max(user 原話「不管在app shell 模式還是modal模式都會有相同的最大寬度與最小寬度限制」),768 以下不共存。**先前寫「modal 模式零條線」已作廢**——它當時的語意是「modal 期間無視寬度」,與新定案矛盾。

### 推擠線原則(user 定方向、AI 定數字)

**1024 是整個 shell 唯一的「推擠線」**:以上,**可變寬**的佔位表面(側欄欄位、agent 欄位)推擠主內容;以下,**不允許可變寬欄位**——agent 展開=右 Sheet、側欄展開=左 Sheet(覆蓋),常駐只允許**固定寬**細軌(48/68,它仍佔寬,只是不可變)。展開中的欄位跨線=顯示降級(側欄→細軌、agent→Sheet),意圖保留、放寬自動還原。

**兩個已知例外**(不寫出來就是全稱命題造假):
- **modal 期間不適用**(見 modal 模式)。
- **`collapsible="none"` 的側欄**:`sidebar.spec.md:590` 明文第三種狀態——`none` 分支在 `isMobile` 判斷前提前 return 固定 240 div,不進 Sheet。要嘛收編(none 也降細軌,屬 breaking)、要嘛豁免,同步 owner spec 時一併決定。

依據三項,**其中一項只支持左側,右側是我們主動更嚴**(2026-08-08 重驗 @atlaskit/navigation-system@10.11.1 一手 CSS,修正先前「左右同線」的錯誤陳述):

| 面向 | Atlassian 實際行為(一手 CSS) | 我們 |
|---|---|---|
| 左(側欄) | `<64rem` 覆蓋主內容(side-nav.compiled.css `@media not (min-width:64rem)` → `grid-area:main/aside/aside/aside` + overlay 陰影 + `width:min(90%,20pc)`);`≥64rem` → `grid-area:side-nav` 真欄位 | 同線 1024 = 64rem ✅ 對齊 |
| 右(面板) | 三段:`<64rem` 浮層(陰影);`64–90rem` 不透明貼齊但仍 `grid-area:main/aside/aside/aside` + `z-index:1` = **仍覆蓋主內容**;`≥90rem`(1440)才 `grid-area:panel` 真欄位(panel.compiled.css) | 1024 就推擠 = **比 Atlassian 早 416px**,列為刻意偏離(見異同表) |

(a) **對稱論證(AI 推導,非 user 主張)**:同一個 shell 不該左右各一條線,agent <1024 已是 Sheet,選單展開同以 Sheet 呈現才一致。
  **⚠️ 更正(2026-08-09)**:先前寫成「user 對稱論證」是升格。user 原話是**開放授權**、不是主張:「兩者不一定要是吃同一個觸發邏輯吧?可以同也可以不同?」——他把這題交給我們判斷,並沒有主張要一致。採用一致是我們的工程選擇,理由如上。
(b) 左側有 Atlassian 一手同線佐證(見上表)。
(c) 「窄視窗展開=覆蓋式」6:0 一致。

**已知取捨**:Atlassian 用兩條線換來 1024–1440 的「貼齊但不推擠」中間態;我們用一條線(user 原話:「不需要有浮貼過度…定義一個breakpoint讓右側欄在某一個時間就會自動變為sheet就好」)。**代價要照公式算,不能只報最樂觀值**:

| 1024 視窗下的情境 | agent 寬 | 主內容 |
|---|---|---|
| 側欄細軌 48 + agent 停在下限 | 320 | **656**(先前只報這格) |
| 側欄細軌 48 + agent 拉到上限 | min(640,(1024−48)/2)=488 | **488** |
| 側欄展開 240 + agent 拉到上限 | min(640,(1024−240)/2)=392 | **392**(真正的最差值) |

**392 只發生在 1024 視窗 + 側欄展開 + 使用者自己把 agent 拖到最寬**。它其實是半寬上限的語意本身:**agent 最多只能跟主內容一樣寬**,392/392 就是使用者自選的 50/50 分割,不是版面被壓爛。視窗一變寬主內容就跟著長。**⚠️ 此項不是拍板題**——它是四個已決輸入算出來的結果(見來源總帳)。user 當時只問過「這是1024的情況?」,那是問句不是同意,但更重要的是:推導結果本來就不該進待拍板清單。

半寬上限保證的是「主內容不小於 (視窗−側欄)/2」,不是 656。另注意**半寬上限只在視窗 < 1520 時有約束力**((視窗−240)/2 < 640 ⟺ 視窗 < 1520);更寬的螢幕上 agent 一律受 640 封頂,此規則不作用。

**200% 縮放等同視窗減半**:1920 實體螢幕在 200% 下是 960 CSS px → **落入覆蓋形態**。這是預期行為,但必須列入驗收必測矩陣。**(先前此處寫「WCAG 1.4.4 只要求功能可用」是錯的——同一份規格 §一 已自承那是誤述,1.4.4 要求的是內容**與**功能;此處殘留未清,2026-08-09 刪除。真正管這件事的是 1.4.10 Reflow,見上。)**

### 側欄

- ≥1024:展開 240 / 細軌 48(md)/68(lg),依 consumer `collapsible` 選項與 cookie 意圖(細軌公式 2×loose+icon,tokens/uiSize/uiSize.css:95;icon rail 為既有能力 sidebar.spec.md:277,284)。
- 768–1023:**展開時以 Sheet 覆蓋呈現**,不推擠主內容。user 提議、我查證後採用(原話帶「吧」),且只要求這一條:「當左側選單因為視窗變小而自動縮小後再次展開就都只能以sheet的方式展開吧」。
  **先前我寫成「顯示固定細軌」是加碼**——那會強制改變 consumer 的 `collapsible` 選擇。改回 user 原話的強度後,consumer 的設定不被推翻,只有「展開時用什麼呈現」改變。
  **影響面(2026-08-08 實查)**:產品端唯一消費者是 `apps/template/src/App.tsx:62` 的 `collapsible="icon"`,它本來收合就是細軌,受影響的只有「在 768–1023 展開」這一個動作。依 M29 落地時同步 `sidebar.spec.md`。
- <768:漢堡 + Sheet 抽屜(寬 288 = `--sidebar-width-mobile`,uiSize.css:93),點外部或 Esc 關閉(sidebar.spec.md:588,既有)。

### 全部數字與出處(單一真相表)

**我們自己擁有的數字**(要落成常數,實作可寫):

| 數字 | 用途 | 出處 |
|---|---|---|
| 320 | agent shell 下限 + 首開預設 | 預設值取 app-shell.tsx:113 `ASIDE_WIDTH_DEFAULT`;**下限 320 是產品層自訂**(Port drawer min 320 親驗)。AppShell 自身 clamp 240–640(app-shell.tsx:117),320 更嚴、不衝突。不用容器 floor 240 的理由:240 是側欄同源寬(tokens/uiSize/uiSize.css:92),對話 UI 要同時容下輸入框與訊息 |
| 640 | agent shell 上限 | app-shell.tsx:112 `ASIDE_WIDTH_MAX`(M23 DS 既有優先;Port 600 僅參考) |
| (視窗−側欄)/2 | shell 半寬上限 | @atlaskit/navigation-system@10.11.1 `panel.js:177`(`Math.round((window.innerWidth - sideNavWidth) / 2)`)+ `:187` CSS 版 `calc((100vw - sideNavLiveWidth) / 2)`;`:189` 亦是 `clamp(min, width, max)` 同型。**先前誤引 `:159`(那行是 min 計算),2026-08-08 重驗更正** |
| 1024 | 全 shell 推擠線 | 本案新訂;Tailwind `lg` + Atlassian 64rem(左側欄真欄位線,一手 CSS)。右側比 Atlassian 早,見「推擠線原則」 |

**別人擁有的數字**(實作**不得重寫**,一律消費 token / primitive 預設):

| 數字 | 用途 | 擁有者 |
|---|---|---|
| 448 | agent Sheet 寬上限 | Sheet primitive 預設檔 sheet.tsx:80-82(`w-3/4` + `sm:max-w-md`)——直接用 Sheet,不傳寬 |
| 288 | 側欄 mobile Sheet / session popover | tokens/uiSize/uiSize.css:93 `--sidebar-width-mobile`;popover.tsx:101 `w-72` Popover 預設 |
| 240 | 側欄展開寬 / 滿版左欄 | tokens/uiSize/uiSize.css:91 `--sidebar-width`;滿版消費同 token |
| 48 / 68 | 側欄細軌 md / lg | tokens/uiSize/uiSize.css:95 公式 `2×loose + icon` |
| 512 | Dialog 預設 maxWidth | dialog.tsx:73 + dialog.spec.md:91 |
| 768 / 1280 | 行動線 / AppShell XL 線 | use-is-narrow-viewport.ts:3;app-shell.tsx:91 |
| 7px / 1px | 拖拉把手命中區 / 線 | patterns/resize-handle spec:58,60(5 家世界級對照內建) |
| 250ms | Sheet/Dialog 殼進出、遮罩交接 | tokens/motion/motion.spec.md:107 `--motion-duration-surface`。外部佐證:Atlassian `--ds-panel-enter: .25s`(panel.compiled.css) |
| 150ms | overlay fade | tokens/motion/motion.spec.md:106 `--motion-duration-overlay` |
| 7 天 | 記憶寬 cookie TTL | sidebar.tsx:62 前例(`60*60*24*7`) |

**尚無 token、必須點名的兩個**:

| 項目 | 現況 | 處置 |
|---|---|---|
| 200ms 推擠動畫 | DS **沒有** width-push duration token。`--motion-delay-close: 200ms` 是 hover 關閉延遲、語意不同,不得挪用;sidebar.tsx:404 是直接寫 `duration-200 ease-linear` | agent 與 sidebar 用同一 class,不自創毫秒。等第 3 個消費者出現再依 M17 抽 token。外部佐證:Atlassian side-nav / panel exit 同為 `.2s` |
| 「在底」判定容忍 | 先前寫 ≤4px = **無依據的 magic number,已刪** | 不在規格立值。不變量:門檻必須大於次像素與縮放造成的捨入誤差,且不得大到讓使用者上捲一點點就被判成在底。**實際值由 POC 量測定案**(驗收條件 4e),量完寫回本表 |

外部產品數字(Port 320·400·600 / ClickUp 420·480·300·64+256):生產環境親測,**不可回放**,僅作旁證,非對齊對象。

---

## 三、互動規則

### 路由:點內容 = 去它的家
- 任務 → modal(殼不動換內容)。
- list → 主內容:<1024 = agent Sheet 收起面板(串流續跑;徽章依亮燈條件)+ 導航;≥1024 = agent 原地不動;modal 開著 = 先關 modal 再導航。
- agent **邏輯上**永遠不動。
- 情境晶片隨宿主焦點改判,**含點連結換內容**(比 ClickUp 多補的一致性 case:方向同、補齊它漏的,防晶片與內容脫鉤——rationale 留檔防未來誤當 bug 修)。

### Esc / 停止生成 = 兩顆鍵,不搶同一顆(AI 建議、user 授權定案)

**裸 Esc 永遠只做「依形態收掉這個表面」**,不看串流狀態:
- 焦點在 modal → 關 modal(Radix 預設,`dialog.spec.md:184`;非偏離)。
- 焦點在 agent、Sheet 形態 → 收起面板(回歸 `sheet.spec.md:132` Esc canonical,**非偏離**)。
- 焦點在 agent、佔位形態 → 無作用。APG **只**對 modal dialog 規定「Escape: Closes the dialog」,對非 modal 面板未作規定;本案在此空白處自訂為無作用,理由 = 誤觸不毀 session。

**停止生成 = 平台分歧綁定**(2026-08-08 更正,見下):
- macOS:`Cmd + Esc`
- Windows:`Alt + Backspace`——**不可用 `Ctrl + Esc`**,微軟官方文件明列該組合為系統保留:「**Ctrl + Esc:Open the Start menu**」([Windows 鍵盤快速鍵](https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec),2026-08-08 親讀)。作業系統會先攔截,應用程式收不到。

這正是 VS Code 的做法:`chatExecuteActions.ts:953` 的 `KeyMod.CtrlCmd | KeyCode.Escape` 搭配 `:958` 的 `win: { primary: KeyMod.Alt | KeyCode.Backspace }`——**Windows 那條是覆寫、不是額外選項**(先前規格誤讀為「另綁,是否跟進由 POC 定」,已更正)。guard 同為 `:935` `ChatContextKeys.hasActiveRequest`。

**必須同時處理的副作用**:Radix 的 dismissable layer 判 Esc 時**只比對 `event.key === 'Escape'`,不看修飾鍵**,所以 macOS 的 `Cmd+Esc` 會連帶觸發 Sheet/Dialog 的關閉。落地時 `onEscapeKeyDown` 必須加修飾鍵 guard,並同步 tooltip 與 `aria-keyshortcuts`。

同鈕中止(送出鍵切換為中止)仍是主要出口,快捷鍵是輔助——這也是平台鍵位風險的兜底。

**這個切分消掉了三件事**:(a) 裸 Esc 與 Sheet canonical 的衝突;(b) 「串流中 / 非串流」兩套 Esc 語意造成的狀態機分岔;(c) 原本要登記的兩條偏離。**Esc 的語意現在與 DS 其他表面完全一致。**

- **X 只關面板,不動 session**(見設計原則);刪除對話一律走 session 列表。

### 共存
- 一切依「佔位優先序」表。
- 兩 Sheet 互斥 = 機械推導非偏好:Sheet 就是 Radix Dialog(sheet.tsx:3)+ 全視窗 scrim(sheet.tsx:56)+ focus trap;雙 modal 同開 = 疊 trap 疊 scrim,機械不成立。Atlassian 可並存者是非 modal panel,不同物種。
- 漢堡 × agent Sheet:agent 收起面板 → 開側欄 Sheet;反向同理(後動作勝)。
- **巢狀 modal 會存在且允許**(2026-08-09 user 定調,見版位規則「第二層 modal」)。Esc 只關最上層,由 Radix focus-scope stack 與 dismissable-layer 索引保證。既有 `dialog.spec.md:170` 禁令需修訂。
- 詳情(含時序):agent 進場當下 → 詳情關閉、不復原、不搬家(理由:單一右軌心智模型;自動復原會顯示過期資料);此後開詳情 → 右軌被佔 → 落主內容區(ClickUp 雙向實測);agent 面板關閉後 → 詳情回右軌;重開回主內容觸發點。

### session
- 面板模式 = 標題列 popover(288;**完整集:列表 / 切換 / 新建 / 重新命名 / 刪除**——見「session 生命週期」,面板與滿版能力相同,差別只在版面)。
- 滿版 = 獨立 route(見版位規則)。
- 刪除 active session → 開新空白(業界慣例,未經一手驗證;若實作前有機會親測 ChatGPT / Claude 再回填出處)。
- 多分頁:LWW + focus refetch(**這是預設路徑,不依賴後端**;下一條的後端拒收契約若成立則升級為更強保證,不成立也不影響本條)。
- **「同一 session 同時只有一個生成中」這條要靠後端**——這是本規格的**外部依賴,不是我們單方能立的規則**:後端須拒收後到的送出;前端據此顯示 error part(消費 Notice),非發起分頁 refetch 後顯示「串流中」(可中止、不可再送)。後端若做不到,**前端退回上一條的 LWW + focus refetch**(已是預設路徑,不需重談);差別只在保證強度,不影響可施工性。

### 串流
- state 住 **L1 佔用者層**、掛在面板 mount 樹之外;L0 不持有內容狀態。收起面板或換殼 = 背景續跑。
- 捲動:使用者向上捲動即停止跟捲,浮現「回到最新」按鈕;點按或下一輪送出才回底。「在底」的容忍值由 POC 量測定案(見數字表)。
- Enter 送出;送出與中止同一顆鈕。
- 錯誤 = error part(消費 Notice)+ inline retry(經 MessageActions)。斷線同錯誤;重連後 focus refetch 補齊已生成部分。
- 入口徽章 = Badge dot `variant=\"high\"`(badge.tsx:53-59;dot 預設 critical,必須顯式傳 high;L1 只認中性注意力訊號)。

### 焦點交接(L0-L1)
1. 開面板 → 焦點入面板第一個互動元素(PromptInput;類比 dialog.tsx:87 AutoFocus canonical)。
2. 面板關閉(X / 點外 / Esc / `⌘.`)→ 焦點回觸發點(類比 `dialog.spec.md:189` focus return)。
3. 換殼(佔位 ↔ Sheet)→ 焦點在面板內則留原位,不奪主內容焦點。
4. 滿版進 = 焦點到輸入框;退 = 回進入前觸發點。X 必在面板 Tab 序內(標題列固定位)。

### 鍵盤(全旅程)

- **Enter 送出必須消費既有 IME 守衛**:`field-edit-keys.ts:21` 明文「**禁再手刻 `isComposing || keyCode===229` guard**」。自刻 `if (e.key==='Enter' && !e.shiftKey)` = 中文選字時送出半截字。Shift+Enter 換行;組字中按 Esc 是取消組字,不進 Esc 焦點域規則。
- **面板內 Tab 序**:標題列(含 X)→ 對話區(**單一 tab stop**)→ 輸入框 → 送出/中止。對話區內的訊息動作不各自進 Tab 序(否則從輸入框往回要穿過數百個按鈕);ScrollArea viewport 預設帶 `tabIndex={0}`,此處消費它既有的 `viewportTabIndex={-1}` opt-out。
- **拖拉必須有鍵盤等價**:`resize-handle.spec.md:71-72` 明文「consumer 若把 resize 作為必要功能,**必須另提供 keyboard-operable 等價控制**」(該 primitive 固定 `aria-hidden`,不冒充 splitter)。落地形式 POC 定。
- **全域快捷鍵 = 焦點域決定**(Esc 規則的同型延伸):shell 既有 `⌘B`(側欄)與 `⌘.`(toggle aside,`app-shell.spec.md:270`)。`⌘.` 目前**沒有** IME/輸入框守衛(`:274` owner 自承已知 gap),焦點在 agent 內時它就是「關面板」(與 X 同語意,不動 session),並補上 `⌘B` 已有的三道守衛(`sidebar.tsx:216-226`)。滿版左欄**不註冊 ⌘B**(單例已被 L0 佔用)。

### 內容狀態(空 / 載入 / 錯誤)

- **首次開啟**(無 session、無訊息):消費既有 `Empty`,不自寫歡迎文案。session 列表載入用 `Skeleton`,不用轉圈。
- **錯誤要分類,不是一種**。既有原則已在 ArtifactRef 立好(「不 silent、不裸 403 導航」),把它升格為全層通則:

| 類別 | 出口 |
|---|---|
| 可重試(5xx / 逾時) | error part + inline retry |
| 需重新驗證(401) | 導向登入,**不給 retry**(登入屬 human boundary) |
| 無權限(403) | 說明 + 不可達顯示,不裸導航 |
| 速率限制(429) | 退避提示,retry 暫時 disabled |

- **權限的顯示契約覆蓋所有可導航載體**(ArtifactRef / 內文連結 / 情境晶片 / ToolCall 結果),共用同一套 resolve + 不可達顯示。**正文文字的權限過濾是後端責任**——與併發拒收同屬外部依賴,前端擋不住。

### 串流生命週期

- **串流 state 必須 per-session keyed**:切換 session 只換視圖,不影響任何 session 的串流(否則新舊 session 內容互相污染)。
- 五個事件對串流的處置:

| 事件 | 串流 |
|---|---|
| 切換 session | 續跑(背景) |
| 收起面板 / 換殼 | 續跑 |
| 刪除該 session | 中止 |
| X / 關面板 | **不中止**(背景續跑;**跑的期間徽章不亮,跑完或失敗才亮**——見「收合入口」的亮燈條件)|
| 停止生成鍵(mac `Cmd+Esc` / Win `Alt+Backspace`,焦點在 agent) | 中止 |
| 裸 Esc | 不影響串流(只收表面) |

- **重整後**:面板開關狀態與 activeSessionId 與寬度走**同一個持久化契約**(cookie、7 天、L1 namespace),否則每次重整面板都會消失、對話也找不回來。掛載時若後端回報該 session 仍在生成 → 重新接上串流(視同「非發起分頁」狀態);接不上則標為中斷片段 + 重試。
- **斷線偵測**:進入 `failed` 的判定條件(無新 token 超過門檻 或 連線關閉且無結束訊號)必須明訂,門檻值由 POC 量測後寫回數字表。
- **送出失敗**:草稿由 L1 持有,失敗時輸入框內容可還原。不得送出即清空又不樂觀渲染。

### 內容極端

- **溢出策略逐元素定義**(併入 L5 的 markdown → token 映射表):inline code 折行 / block code 自身水平捲動 / 表格自身水平捲動 / 長 URL 折行。與 ScrollArea 禁巢狀的關係(不同軸向是否豁免)在 POC 4d 一併定。注意 DS 的 `patterns/horizontal-overflow` 標 `internal: true`,產品層不可直接消費。
- **輸入框成長上限**:消費 `Textarea` 既有的 `autoSize` + `autoSizeMaxRows`(`textarea.tsx:282,289`),並關閉原生 `resize-y`(否則可拖出面板)。對話區高度不得被輸入框吃光。
- **長對話**:載入策略(分頁 / 虛擬化 / 全渲染上限)POC 定;無論選哪條,都必須同時滿足貼底判定、aria-live 與焦點交接三條既有規則。

### 螢幕閱讀器
- agent 容器 = complementary landmark + aria-label。走「沿用 Aside」時**由 Aside 提供**(它已渲染 `<aside aria-label>`),L1/L2 不得再包一層,否則 landmark 巢狀。
- **串流本體不作為 live region**:逐 token 更新掛 `aria-live` 會讓螢幕閱讀器對每次 DOM 變動排隊播報,200 字回覆等於數十次插播,面板實質不可用。改為:訊息本體串流期間 `aria-busy="true"`,播報只走 `AgentStatus` 態變(`role="status"`)+ 一則節流後的完成摘要。
  (先前引 `empty.spec.md:100,111-112` 是**誤用**——那三行的 scope 是「一次性結果變空」的播報,不是持續增長的文字。本條改標**本案新訂**,實作前需對 ≥3 家一手來源取證。)
- **錯誤 / 中止 / 重試都要播報**:`Notice` **預設不帶 live region**(`notice.tsx:96-98`,由 consumer 傳),必須顯式傳——錯誤 `assertive`、重試結果 `polite`。
- **modal 期間 agent 不套用 aria-hidden / inert,維持在 a11y tree 內**(先前寫「排除」語意雙關)。理由:agent 在 modal 期間仍可聚焦可互動,把可聚焦內容放進 aria-hidden 子樹是 WCAG 4.1.2 違規。連帶結論:**舞台 Dialog 在 ARIA 上就不是 modal**(APG 要求 modal 的前提是「阻止所有使用者與外部互動」,本案刻意不成立),不設 `aria-modal`。實現機制需指名——Radix 在 `modal={false}` 下**根本不呼叫** `hideOthers`,所以要的不是「排除既有機制」而是自建;POC 4a 一併驗「沒有任何 aria-hidden 被套到 agent 上」。
- **modal 進場時焦點若在 agent 內,不得奪焦**(沿用 Aside 既有的 opener snapshot 手法,`app-shell.spec.md:215`)。**與下方「焦點被驅逐」不衝突**:這條管**進場**(agent 沒被卸載,焦點留著);下一條管**元素被卸載**(持有焦點的東西不見了才交接)。兩條的觸發條件互斥。
- 換殼不新增額外播報;但 Sheet 本身是 Radix Dialog,其掛載造成的上下文變化屬 primitive 既有行為,**不是實作者可以「選擇不播報」的**。
- **焦點被驅逐的通則**(第 5 條交接):任一持有焦點的元素因版位裁決被卸載(詳情被 agent 換走、換殼、modal 收掉)→ 焦點交給裁決獲勝者;獲勝者不收則 fallback `#app-shell-main`(`app-shell.spec.md:215` 既有 canonical)。

### Scope 聲明
- RTL:不支援;消費全域 LTR-only compatibility contract(`packages/design-system/README.md:138` compatibility-matrix,全 DS spec 同句式)。
- 超長標題 / 名稱走 DS 既有 truncation canonical。

### 狀態轉移表(驗收條件 3 的本體)

形態 4 種(§一.1b 已凍結)。**每格都是從既有原則推出的,不是逐案裁決**——推導依據列在表下。

| 事件 ＼ 形態 | 佔位欄 | Sheet | 收合入口 | 滿版 |
|---|---|---|---|---|
| **開 modal** | 不變(舞台化,agent 仍佔位可操作)——**此列僅適用 768 以上** | **768 以上:agent 就地變佔位**(見「兩條線各管各的」表);**768 以下:agent 先收合成入口**(session 與串流不受影響;徽章依亮燈條件),modal 正常開啟(後動作勝) | 不變;**768 以下 modal 內不提供入口**,768 以上有 | modal 疊在滿版上,殼不動 |
| **關 modal** | → **回推擠線判定的形態**(≥1024 仍佔位欄)| → **回推擠線判定的形態**(768–1023 回 Sheet)| **依 `requestedOpen` 還原**:先前被窄視窗抑制的(`requestedOpen` 仍為 true)→ 回 Sheet;使用者自己關掉的 → 維持收合入口 | 不變 |
| **視窗跨 1024 往下** | → Sheet(開著的保持開著);**若當時 modal 開著 → 見「跨門檻」規則** | — | 不變(收合態無形可降) | 不變(滿版是 route,不受推擠線管) |
| **視窗跨 1024 往上** | — | → 佔位欄(意圖還原) | 不變 | 不變 |
| **視窗跨 768 往下** | **modal 開著 → 收合成入口**(見「跨門檻的過場」);無 modal → 本格不適用(該區間 agent 已是 Sheet)| 不變(Sheet 仍是 Sheet,寬度由 primitive 治理) | 不變 | 左欄 → Sheet 抽屜 |
| **按漢堡(開側欄)** | 不變(≥1024 側欄是欄位,兩者並存) | → 收合入口(Sheet 互斥,後動作勝) | 不變 | 不適用(滿版無 L0 側欄) |
| **點內容:任務** | 不變(開 modal,見上) | **同「開 modal」列**(≥768 就地變佔位;<768 先收合成入口)| 不變 | modal 疊上,殼不動 |
| **點內容:list** | 不變(≥1024 原地不動) | → 收合入口 + 導航 | 不變 + 導航 | 退出滿版 → 回進入前形態 + 導航 |
| **進滿版** | → 滿版 | → 滿版 | 不適用(無標題列可按「展開」) | — |
| **退滿版** | — | — | — | → 進入前形態 |
| **按 X / `⌘.`** | → 收合入口 | → 收合入口 | — | 不適用(滿版靠退出,不靠 X) |
| **點外 / 裸 Esc** | **無作用**(佔位欄不是浮層;modal 期間點舞台就是點外,若成立會直接關掉 agent,違背「永遠可操作」)| → 收合入口(Sheet 是浮層,照 Sheet 既有行為)| — | 不適用 |
| **拖拉把手** | 寬度改變 + 寫入記憶寬 | 不適用(Sheet 寬由 primitive 治理) | 不適用 | **繼承 Sidebar:固定 240px 不可拖**(`sidebar.spec.md:611` `--sidebar-width`;拖拉是 `resize-handle.spec.md:22,96` Phase 3 = Pending)。Phase 3 啟用時自動跟隨,**不另訂規則** |
| **停止生成鍵**(mac `Cmd+Esc` / Win `Alt+Backspace`)| 串流中 → 中止;非串流 → 無作用 | 同左 | 無作用(面板不在,焦點不在其中) | 同佔位欄 |
| **切換 session** | 換內容,形態不變;各 session 串流獨立續跑 | 同左 | 不適用(需先展開) | 同左 |
| **刪除該 session** | 開新空白,形態不變;該 session 串流中止 | 同左 | 不適用 | 同左 |
| **重整頁面** | 依持久化契約還原形態 + activeSessionId;有進行中生成則重新接上 | 同左 | 同左 | route 本身會還原 |

**新定案帶出的兩條必須定義(2026-08-08 自我稽核抓到,原文缺)**:

- **⚠️ 本條已作廢(2026-08-10)**:「禁止同時開啟」出自 user 較早的講法,已被 §〇 草案取代。**現行:線以下 agent 改成抽屜疊在 modal 之上,不關掉、不禁止。** 兩種點擊的處理見 §〇 第 7 條。
- **跨門檻的過場**(**同樣用 768**):modal 開著、視窗從 **768 以上拖到以下** → **agent 收起成入口,modal 拿回完整寬度**;拖回 768 以上 → **agent 依記憶寬還原佔位**(意圖保留,與跨線降級同一條既有原則)。串流全程不中斷。**768–1023 之間 modal 開著時 agent 一律留在佔位態,不得自動收起**——推擠線 1024 只治理沒有 modal 時的形態。

**推導依據(不是逐格拍板)**:
- 「開/關 modal 那一列」← modal 不看推擠線 + 舞台化。
- 「跨線那兩列」← 推擠線原則的顯示降級 + 意圖保留。
- 「漢堡」← Sheet 互斥、後動作勝。
- 「點內容」← 路由「去它的家」。
- 「X / `⌘.`」同格 ← 它們都只是關面板(§一.2);「點外 / 裸 Esc」**只對 Sheet 成立** ← 那是浮層的既有行為,佔位欄不是浮層。
- 「切換 / 刪除 session」← 串流 per-session keyed。
- 「重整」← 持久化契約。

**尚未定案的格子:無**(2026-08-11 結清)。原本掛著的 `拖拉 × 滿版左欄` **不是未定案,是繼承** —— 它是 Sidebar,照 Sidebar 現況(固定 240、拖拉未啟用)。
> user 逐字:「滿版左欄不是 sidebar 嗎?若是 sidebar,其該怎麼樣就怎麼樣啊,為何要問?」
> **先前誤把「不重用 L0 Sidebar 那個實例」(技術理由:`sidebar_state` cookie 與 ⌘B 是模組層單例)當成「可以有不同行為」。兩者無關。**

其餘「不適用」都是形態本身使該事件不存在,非遺漏。

---

## 四、元件清單

**v1(L4-L6)**:Message(role 變體)/ MessageActions / AgentStatus 五態(working · awaitingInput · done · failed · cancelled;stale 剔除)/ ToolCall 三段 / Confirmation / AiLabel(抄 Carbon)/ GeneratingIndicator(與 AiLabel 生命週期不同)/ ArtifactRef 卡(**含不可達態**:disabled + 點擊出 Notice 說明,不 silent、不裸 403 導航;resolve 屬顯示層,L6 不加欄位)/ attachment part(L6 型別 v1 凍結;PromptInput 附件 UI 延後,屆時消費 FileUpload;顯示消費 FileItem)/ Prose / Collapsible / ConversationScroller / PromptInput。

**session 管理(2026-08-09 補——先前元件清單完全沒有這一組,但 user 明確要求「增刪查改」)**:
| 元件 | 職責 | 消費既有 |
|---|---|---|
| `SessionList` | 列表本體:列出 session、標示當前、每列一個 overflow 選單(重新命名 / 刪除)| `Menu` 家族 + `item-anatomy` scanning 版位;禁手刻列 |
| `SessionListTrigger` | 面板標題列的入口,開 `Popover`(288)| `Popover` + `PopoverHeader`;禁手刻浮層殼(M23 子規則)|
| — 新建 | 列表頂部一顆 `Button`,不是獨立元件 | `Button` |
| — 重新命名 | 就地編輯 or 選單項 → `Dialog`,實作時擇一 | `InlineEdit` / `Dialog` |
| — 刪除 | 選單項 → 二次確認 | `Dialog`(確認型;疊在既有表面上,見「第二層 modal」)|

**面板與滿版共用同一組**,差別只在版面:面板走 `Popover`,滿版走常駐左欄。**這是「差異像 RWD」鐵律的直接落地。**

**延後**:CodeBlock 能力層 / Citation+Sources / Plan+PlanStep(凍結時過命名三重測試;components/Steps 已存在撞名)/ Suggestion / ChainOfThought 逐字 / ArtifactPanel。

**命名**:新元件名與狀態列舉凍結時一律過命名三重測試(AGENTS.md:113:對齊既有 DS 詞彙 / ≥2 家世界級用此詞 / 同字串在其他元件是否已有不同語義)。四個已知不過關的:

| 禁用 | 卡在哪一題 |
|---|---|
| Task | 第三題——「任務」是消費產品的領域實體(本規格路由段就在講它),DS 元件名不得佔用產品語意 |
| Thread | 第一題——同一概念我們已用 session,再開一個同義詞是製造第二套詞彙 |
| Approval | 第一題——同上,已有 Confirmation |
| Bubble | 第一題——DS 詞彙用結構名(Message / Item / Card),不用視覺形狀比喻 |

---

## 五、與世界級異同表

**同(對齊 + 出處)**

| 決策 | 對齊誰 | 證據 |
|---|---|---|
| 跨線換殼、open 狀態不動 | Atlassian(`panel.compiled.css` <64rem 帶陰影浮層)+ Fluent(官方**文件範例** `DrawerResponsive.stories.tsx:39-48,71`:matchMedia 只 `setType`、`setIsOpen` 不動) | Atlassian 是 shipped CSS;**Fluent 是 stories 範例不是元件**(`@fluentui/react-drawer@9.13.1` 無 `DrawerResponsive` export,`useDrawer.js:14` 純依 `type` 分派),權威等級較低,且其斷點是 720px。它真正佐證的是**狀態必須外提**(open 由 consumer 持有),不是「換殼不會 remount」 |
| shell 半寬公式 + clamp 形狀 | Atlassian `panel.js:177,187,189`(@10.11.1);`:187` 完整為 `round(nearest, calc((100vw − sideNavLiveWidth)/2), 1px)` | 親驗逐字;`round(…,1px)` 的整數化我們是否跟進,POC 定 |
| AiLabel | Carbon `AILabel` | **名稱要對齊**:Carbon 是 `AILabel`(AI 全大寫,`@carbon/react@1.113.0` `es/index.js:32,253`)。且它是 Toggletip(`index.d.ts:48-61`,含 `AILabelActions` / revert / 7 檔 size),v1 只抄靜態標記子集,不抄 revert/Actions |
| 滿版左欄**不**重用 L0 Sidebar | 非對齊——機械推導 | Sidebar 的 cookie `sidebar_state` 與 ⌘B 是模組層單例(`sidebar.tsx:61-63`),同頁第二份會互相蓋掉。vercel/chatbot 敢整包重用是因為它是獨立聊天 app、全 repo 只有一個 Sidebar 實例(`app-sidebar.tsx:22-34`) |
| modal 內 Esc 關 | Radix 預設 | dialog.spec.md:184 |
| Sheet 收合手勢(點外 / Esc) | DS 自家 Sheet canonical | sidebar.spec.md:588 |
| 串流中「有進行中請求才允許取消」的 guard | VS Code `chatExecuteActions.ts:935` `ChatContextKeys.hasActiveRequest` | 一手原始碼(commit `78a7b6c`);**但按鍵不同構,見偏離表** |
| Enter 送出 / 同鈕中止 / 停跟捲 | chat 業界慣例 | search-only confidence |
| 拖拉把手 | DS 自家 resize-handle(內建 AG Grid / MUI-X / Notion / VS Code / Figma 對照) | resize-handle.spec.md |
| 兩 Sheet 互斥 | 由 Sheet primitive modal 語意機械推導 | sheet.tsx:3,56 |

**異(偏離 + 具體理由)**

| 偏離 | 具體理由 |
|---|---|
| (1) 遮罩滿版 + agent 疊在其上 | 產品層雙前例:ClickUp(親驗:backdrop `inset:0`,AI 面板 `z-index:3` 疊在其上)+ Port(以讓位達成同一效果);DS library 層 7 家反對的是 overlay primitive 的全視窗預設,層級不同不構成反證。前提 = Dialog 舞台模式契約落地(POC 先行) |
| (2) 右側 1024 就推擠(Atlassian 要到 1440) | Atlassian 用兩條線(64rem 貼齊、90rem 才成欄)換中間態;我們用一條線(user 定方向,見 §七)。我們的 agent 下限 320 + 半寬上限,壓縮幅度比 Atlassian 面板小。詳「推擠線原則」 |
| (3) Esc 在佔位形態無作用 | APG **只**對 modal dialog 規定「Escape: Closes the dialog」,對非 modal 面板**未作規定**(APG 無 non-modal pattern)。這是規範的空白,不是規範的許可——本案在空白處自訂為無作用,理由 = 誤觸不毀 session |
| (4) 詳情被換走不復原 | 單一右軌心智模型;自動復原 = 顯示過期資料的風險;退路 = 落主內容區(ClickUp 雙向實測)。**理由留檔,防未來有人當 bug 修掉** |
| (5) 情境晶片含點連結改判 | ClickUp 行為的一致性 superset:方向同、補齊它漏的 case |
| (6) modal 永無 Sheet | 原理推導:Sheet 的遮罩只為保護主內容,modal 期間主內容已在遮罩下 |

---

## 六、驗收條件(機械檢查)

1. **L2 純淨**:grep `patterns/panel-occupant/container-adapter.*` 零筆 `agent` 字樣(machine-check,CI)。路徑映射見 §一.1c。
2. **數字唯一性**(對應數字表兩張):
   - 我們擁有的(320 / 640 / 1024 / 半寬公式)→ 落成具名常數,單一定義點。
   - 別人擁有的(448 / 288 / 240 / 48 / 68 / 512 / 768 / 1280 / 7px / 1px / 250ms / 150ms)→ **實作中不得出現這些字面值**,正解是消費 token 或 primitive 預設。
   - **兩個目前拿不到的**:`ASIDE_WIDTH_MAX`(640)與 `SIDEBAR_COOKIE_MAX_AGE`(7 天)在 DS 都**未 export**(`app-shell.tsx:111-113`、`sidebar.tsx:62` 皆 module-private)。要嘛推動 DS export(additive,但依 M29 須同步 owner spec),要嘛誠實承認 agent 層自持一份並從禁列移出。**現行寫法兩邊都不成立,施工前必須擇一。**
3. **狀態轉移完備**:形態集合已凍結為 4 種(§一.1b)。**先前的 `triggerVisible` 測試已移除**——該狀態不存在了,觸發點恆在。**主表已填完**(見互動規則「狀態轉移表」,**17 事件 × 4 形態 = 68 格**,其中 17 格因形態本身使該事件不存在而標「—/不適用」,**51 格有規則**;**已無未定格**(2026-08-11:拖拉 × 滿版左欄改判為繼承 Sidebar,非未定案)。**先前寫「16 事件」是數錯,2026-08-09 機械重數更正**)。逐格 story 化以該表為分母。仍缺第二張表:**內容態(空 / 載入 / 有內容 / 錯誤)× session 與串流事件(切換 / 刪除 / 登出 / X / Esc / 重整)**。已知 30 格未定義、7 格互斥,~~其中「收合入口」整個形態仍缺規格。~~ **已於 2026-08-09 補齊,見版位規則「收合入口」段。**「可從優先序表推出」降級為「與優先序表不矛盾」——優先序表是助記,不是推導引擎。
4. **POC 先行**(M2,寫碼前;每項量完把結論寫回本規格):
   (a) Radix Dialog `modal={false}` 下的 Esc guard + **驗證沒有任何 aria-hidden 被套到 agent** + agent 在 depth 1..3 皆可互動(對齊 §六之一之三 定案);
   (b) 舞台容器化後 Radix 定位不破;
   (c) 停止生成鍵在各形態下都攔得到(尤其 Sheet 形態下 Radix 是否先吃掉 Esc);Windows 綁 `Alt+Backspace` 已定案(`Ctrl+Esc` 被作業系統佔用),POC 只驗攔截;
   (d) **「沿用 AppShellAside 並修改」vs「自建容器」的總決策**(五處衝突一次定,見衝突總表),含捲動所有權與 Sheet 寬度;
   (e) 「在底」容忍值量測(含 100% / 125% / 150% / 200% 縮放與次像素捨入),量完填回數字表;
   (f) 換殼時對話狀態不重置、不閃爍(**含首次掛載**——`use-is-narrow-viewport` 初值必回 false,窄視窗第一幀必閃);
   (g) 長對話載入策略(分頁 / 虛擬化 / 全渲染上限);
   (h) 串流期間的螢幕閱讀器實測(至少兩款);
   (i) 200% 縮放下的形態判定。
5. **Pixel-quantified verify**(M32):以 `getBoundingClientRect` 數值驗三件事——(i) shell 模式 agent 寬 = clamp 公式輸出;(ii) modal 中心 = 舞台中心;(iii) 跨 1024 前後的形態切換與寬度對應。**100% 與 200% 各跑一次**。禁只驗 attribute 存在性。
6. **SR / 焦點**:landmark 不巢狀、`aria-busy` 與 `role="status"` 通道正確、**5 條**焦點交接各有 play() story;所有需互動才可見的 state 皆有 OpenSnapshot 類 story(M15)。
7. **動畫**:250ms / 150ms 消費 `--motion-duration-surface` / `--motion-duration-overlay`,禁硬寫毫秒;200ms 推擠 DS 無對應 token,與 `sidebar.tsx:404` 用**完整同一組 class**(含 `motion-reduce:duration-0`——`motion.spec.md` 保證的 `motion-reduce:animate-none` 只覆蓋 animation 不覆蓋 transition,少了它 reduce-motion 使用者仍會看到推擠)。
8. **串流併發**:**若**後端確認「同 session 單一生成」拒收契約,則該路徑有測試;**否則**本項改為「前端 LWW + focus refetch 一致性有測試」。背景續跑(收合後 refetch 一致)有測試。

---

## 六之一之一、ClickUp 真 modal + agent 實測(2026-08-09,決定性)

**先前兩次都測錯狀態**:第一次測「整頁任務 + agent」,第二次測到的 class 是 `cu-task-view__inner sidebar-mode`——那是側欄模式,不是 modal。user 指出任務右上角有視圖切換器(Modal / Full screen / Sidebar),切到 **Modal** 才是本案要對照的狀態。切換後量到:

| 元素 | 數值 |
|---|---|
| `cu-task-view__backdrop` | `rgba(0,0,0,0.6)`,**top 0 / left 0 / right 1210 / bottom 648 = 蓋滿整個視窗** |
| AI 面板 | top 69,left 767,right 1185,寬 418 |
| 視窗 | 1210 × 648 |

**結論:遮罩是滿版,連最上面那條全域橫欄一起蓋。AI 面板不是在遮罩上挖洞,而是「疊在遮罩之上」。**
**2026-08-09 重新實機量測(1210×648)更正細節**:遮罩 `position: fixed` 滿版、父層 `z-index: 801`;AI 面板 `position: fixed`、`z-index: 802`、`rect (758, 24, 428×600)`。**先前記的 `absolute` / `z-index: 3` 是錯的,方向對、數字錯。**
**一個重要細節**:AI 面板從 `y = 24` 開始,**它上方那 24px 是遮罩**——面板沒有頂到最上面。這正是我們要照抄的:遮罩滿版、面板疊上去、面板不必延伸到頂。

**這解掉了先前糾結的幾何問題**:
- **這一段是 ClickUp 的量測結果,而我們照做**:遮罩滿版、agent 疊在其上。幾何定案見 §六之一之三。
- agent **不需要**頂到最上面去。它待在原位,只是畫在遮罩上層。
- **`dialog.tsx:46` 的 `fixed inset-0` 形狀正確,遮罩本身不用改**(2026-08-09 再確認)。**要改的是 modal 面板的置中與壓縮基準**(改讀舞台變數),以及 agent 的 z-index 與 `inert` 豁免。先前我一度改寫成「遮罩讓位」,是把 ClickUp 的量測丟掉自己發明,已撤回。

**但也要誠實記下:這不代表我先前的「疊上去」提案就成立。** 跨模型審查指出的機制問題仍在——Radix 在 `modal={true}` 下會啟動 `trapFocus`、`disableOutsidePointerEvents`、`hideOthers()`,那些會讓疊在上面的 agent「看得見但點不到」。**ClickUp 做得到是因為它的 modal 是自刻的,沒有那套機制。** **⚠️ 本段的「所以路線仍是自繪滿版遮罩」已被 §六之一之三 取代,此處不再是現行結論。** 遮罩基準是舞台不是視窗;實作機制仍在收斂中。

## 六之一之三、遮罩架構:**已定案 = 非 modal Dialog + 自繪舞台遮罩**(2026-08-09 定案)

**先前這一節掛著三個選項、且全文有六處互斥的現行陳述**(五處說「必須自繪」、一處說「完全不必自刻」)。我方稽核判為**全案唯一真正的施工阻斷**。現在定案。

### 為什麼只剩這一條(是被兩條已決規則逼出來的,不是偏好)

兩條已決前提:
- **B**:任何層數的遮罩都蓋不到 agent,agent 恆可互動(user 2026-08-09 裁決)
- **疊加**:舞台上的 modal 可以再開 modal,一層蓋一層(user 2026-08-09)

把三個選項對這兩條驗一次:

| 選項 | B + 疊加下成不成立 | 機制 |
|---|---|---|
| 1. `modal={false}` + 自繪舞台遮罩 | ✅ **成立** | Radix 在此分支**完全不渲染 overlay**、不啟 `trapFocus` / `disableOutsidePointerEvents` / `hideOthers` / `RemoveScroll`(`react-dialog@1.1.15:96,145,175`)。agent 天然在所有隔離機制之外,**疊幾層都一樣**。Esc 由 `DismissableLayer` 的頂層守衛治理(`:60-61`),只作用最上層;**點外沒有守衛,必須自建**(見下方契約表)|
| 2. `modal={true}` + 想辦法豁免 agent | ❌ | `DialogOverlayImpl` 內部寫死 `shards: [context.contentRef]`、`hideOthers(content)` 不收 shards,兩者皆未對外開放 → 需 patch/fork Radix。**出局前提:本專案不 fork 第三方 primitive**(否則此選項邏輯上並非不可能,只是要背 fork 的長期維護成本)。2026-08-09 補明前提 |
| 3. 把 agent 放進 modal 表面內部 | ❌ **概念就錯** | **agent 在概念上高於舞台**——它能切換、刷新舞台上的內容,所以它**不在 modal 的層堆疊裡,而是在所有層之上**(user 2026-08-09:「ai agent在概念上是比舞台還要高的層級吧?因為他可以控制舞台刷新舞台」)。把它塞進某一層 = 把上位的東西降級成下位,概念就錯了。技術後果只是這個錯誤的證明:agent 在第一層裡面時,第二層一開它就落在第二層之外,被那一層的焦點鎖 / `aria-hidden` / 指標關閉擋住。**先前寫「第二層 `pause()` 第一層」是機制講錯**,已更正 |

**所以定案是 1。** 這不是我選的,是 B 與疊加兩條已決規則把另外兩個選項排除掉的。

### 自繪要負責的事(逐項,這就是工作量)

Radix 在 `modal={false}` 下不做的,我們全部自己做:

| 項目 | 契約 |
|---|---|
| **遮罩本體** | 一個 `<div>`,**`position:fixed; inset:0`——滿版,不讓開 agent**。
  **⚠️ 2026-08-09 改回(user 抓出我忘了 ClickUp 的實測結論)**:先前寫「右緣停在 agent 左邊」,衍生出「缺一角要補塊」的複雜度。**ClickUp 實測:backdrop `inset:0` 滿版(含頂列),AI 面板 `z-index:3` 畫在遮罩之上。** 照做——**沒有缺角、不需補塊、不需 L 形**。
  **B 的保證改由兩件事承擔**(不再由遮罩幾何承擔):(a) agent 容器 z-index 恆高於所有遮罩;(b) agent 不被任何一層設 `inert`。 |
| ~~**agent 上方那條**~~ **已刪(2026-08-09)** | 遮罩改滿版後這個問題不存在。以下為作廢紀錄:~~單一矩形會讓「agent 正上方那一條」露在遮罩外~~(因為遮罩右緣停在 agent 左邊,而 agent 只佔 row2)。**定案:agent 正上方那一段由 agent 自己畫一塊同色補塊**——不做 L 形(L 形要兩個矩形,且與單一 inset 契約打架)。**完整契約**:(a) **只有一塊**,不隨層數增加——它由 agent 擁有,靠 `stageDepth > 0` 決定顯不顯示,所以疊幾層都只有一塊,不需要同步;(b) **z 序**:在 global header 之上、在 agent 面板本體之下、在 agent 內部浮層之下(浮層本來就更高);(c) **agent 收合時卸載**——收合後沒有軌道,也就沒有那條要補;(d) 顏色與主遮罩共用同一個 token,不另訂。2026-08-09 跨模型審查抓出 |
| **遮罩歸屬** | 由**舞台表面**渲染(不是 AppShell)。 |
| **訊號模型(唯一,2026-08-09 定案)** | 全案**只有一個訊號來源**,叫 `stageDepth`(整數),**住在 L0**。
  **⚠️ 不能用「掛載時發一個固定層號」**:中間那層被關掉會留下空洞(例如剩 1、3),`myDepth === stageDepth` 就永遠沒人命中,頂層守衛失效(**我自己提出、審查方確認是真 bug**)。
  **正解:L0 維護一份「有序的憑證登記簿」**——掛載時發一張憑證並推入尾端,卸載時把該憑證從簿子裡移除(不管它在中間還是尾端)。`stageDepth` 只是簿子的長度(衍生值,不獨立維護)。**判「我是不是最上層」= 我的憑證 === 簿子最後一張**。中間層被移除時,尾端自動變成新的最上層,不會有空洞。
  **註冊/釋放時相**:註冊在 layout effect(paint 前,與寫變數同一批);釋放在 cleanup,且**與 `inert` 用同一套延遲解除**(歸零不立刻生效,下一個 microtask 才落地;期間有新註冊就取消)。**owner = L0**,舞台表面只呼叫 L0 給的 acquire/release,不自持狀態。先前散出三個名字(`stageActive` / `modalDepth` / 「agent 一佔位就發布」)互相打架,已統一。
  **誰加減**:**舞台表面**掛載 +1、卸載 −1(不是 agent、也不是 Dialog)。
  **agent 只做一件事**:回報自己的寬度給 L0。**它不碰 `stageDepth`。**
  **Dialog 怎麼知道自己落在舞台上**:它**不需要知道**——它是被舞台表面渲染出來的,舞台表面用 context 直接把「你在舞台上」傳給它。**沒有任何偵測邏輯。**
  **L0 何時寫變數**:`stageDepth > 0` 且 agent 是佔位形態。
  **判定函式裡的 `depth`** 就是 `stageDepth`,同一個東西、同一個名字。**L0 仍不知道那是什麼內容、也不需要 export `modalOpen` 給 consumer**——訊號是內部的,不是公開 API |
| **點外關閉** | 自行在 `onInteractOutside` 判定:**允許互動範圍 = 本層 Dialog + agent 面板 + 兩者所有合法 portal 子節點**(Popover / DropdownMenu / Command 都 portal 到 body)。以 composed path 或等效機制比對 |
| **Esc** | Radix **有**頂層守衛(`react-dismissable-layer/dist/index.mjs:60-61` `isHighestLayer` → `if (!isHighestLayer) return`),所以 Esc **確實只關最上層**;另加焦點域 guard:焦點在 agent 內時裸 Esc 不關 modal |
| **點外關閉的頂層守衛** | ⚠️ **Radix 沒有幫我們做**——`onPointerDownOutside`(`:47`)與 `onFocusOutside`(`:55`)**沒有** `isHighestLayer` 判斷,只有 Esc 那條有(`:60-61`)。所以在 `modal={false}` 疊多層時,點一次外面會**每一層都收到**。**必須自建頂層守衛**:只有 `myDepth === stageDepth` 的那一層才處理點外關閉,其餘忽略(`myDepth` 定義見「訊號模型」)。**2026-08-09 跨模型審查抓出,已一手驗證原始碼** |
| **背景不可達** | 遮罩只是視覺層。**必須另外把遮罩覆蓋範圍內的節點同步 `inert`**,否則 Tab / 螢幕閱讀器仍進得去。**owner 唯一 + 具名憑證計數**:`inert` 由**單一 owner** 管理。每一層取得時拿到一張**唯一憑證**(不是單純 +1);釋放時交回憑證,**重複交回無效果(冪等)、過期憑證直接忽略**。全部憑證交回才解除。
  **兩件事一起做才有效(2026-08-09 更正,先前只寫憑證是不夠的)**:
  - **憑證**解決「重複釋放 / 過期釋放」——但它**改變不了 React 先卸載再掛載的順序**。
  - **延遲解除**才是關鍵:計數歸零時**不立刻解除**,排到下一個 microtask 再解;若在那之前有新的取得進來,**取消這次解除**。這樣 remount(先解後取)全程不會真的解開。
  **要防的具體症狀**:React 嚴格模式與同層重新掛載會走「先解除再取得」,單純計數在那一瞬間歸零 → 背景可 Tab。
  **要防的具體症狀**:從第 2 層退回第 1 層時提早解除(第 1 層遮罩還在、背景卻能 Tab)。2026-08-09 跨模型審查抓出 |
| **捲動鎖** | 自接 `react-remove-scroll`,`shards = [本層 dialog content, agent 面板]` |
| **疊加** | 每一層各自畫自己的舞台遮罩;層數由 `depth` 表達,`coverage` 恆為 `stage` |

**驗收(POC 必測)**:`modal={false}` 下 Esc 只關最上層 / **點外只有最上層反應**(自建守衛,Radix 沒做)/ **從 depth 2 退回 1 時背景仍不可 Tab**(引用計數)/ agent 在 depth 1..3 都可點可 Tab / 遮罩下的主內容 Tab 不進去 / 螢幕閱讀器虛擬游標不進去 / 捲動鎖對兩個 shard 都生效。

## 六之一之二、跨模型辯論的收斂結果(2026-08-09,雙方共識)

經兩輪辯論後**雙方同意**的結論:

| 議題 | 共識 | 誰讓步 |
|---|---|---|
| v1 要不要建 generic `RailBroker` / 雙邊能力協商 | **不建**。單一佔用者下,descriptor 宣告能力 + host 純函式決定結果,已保留擴充縫;雙邊協商現在沒有第二方可驗證,屬預建抽象 | 審查方接受作者立場 |
| 可見性需要幾個狀態欄位 | **只需一個** `requestedOpen`;`effectiveHostMode` 由它 + viewport + capability **純推導**;`suppressionReason` 是同一 resolver 的衍生輸出,屬可觀測性而非正確性 | 審查方撤回「沒有三欄就不可實作」 |
| **抑制時不可反寫意圖** | 窄視窗抑制 agent 時,**不得**把 `requestedOpen` 改成 false——否則放寬後無從還原 | 雙方一致 |
| modal 期間 agent 是否必須可互動 | **必須**(user 原話「永遠可操作」)。此裁決 + 疊加已決 → 遮罩架構定案為「非 modal Dialog + 自繪舞台遮罩」,見 §六之一之三 | 以 user 原話結案,非審查方裁量 |

**真正的單向門只有三個**(做錯了以後回不去,v1 必須避開):
1. **持久化只存 `effectiveOpen`** → 使用者意圖永久遺失。**必須只持久化 `requestedOpen`。**
2. **public API / 事件 / analytics schema 固化成 `agentOpen`** → 之後第二個佔用者無法沿用。**必須用 occupant id。**
3. **L2 直接依賴 agent 元件或內含仲裁規則** → 已由「L2 零 `agent` 字樣」的機械檢查擋住。

其餘(例如日後抽 broker)都是**可逆重構**,不構成 v1 必做的理由。

## 六之二、本規格作者(AI)的錯誤類型清單與全文自檢

user 2026-08-08 要求:列出所有犯過的錯誤**種類**,並確保全文無同類殘留。以下每一類都附本次實際案例與全文檢查結果。

| # | 錯誤類型 | 本次案例 | 全文自檢 |
|---|---|---|---|
| 1 | **把自己的推論寫成 user 拍板** | 「<768 modal 無入口是你拍板」「X = 終結 session」「392px 已接受」 | 已建 §七 來源總帳,每條附原話;`stop_self_audit.sh` Mechanism 8 出口攔截 |
| 2 | **把「最大值/預設值」誤讀成「下限保證」** | 816 讓位線(Dialog maxWidth 檔位當下限);320 引 `ASIDE_WIDTH_DEFAULT` 當 min | 數字表已拆「我們擁有 / 別人擁有」;凡引用皆註明該值原本的語意 |
| 3 | **只報最樂觀那一格** | 主內容「656」漏報 392;共存門檻「1024 ✅」漏報側欄展開時不可能 | 凡有多情境的算術,一律列全表(見推擠線「已知取捨」) |
| 4 | **說要刪卻沒刪** | 「modal 模式不看推擠線可以刪掉」→ 留在文中三處自相矛盾 | 本輪逐條掃過並改寫;新增規則時同步搜尋舊規則 |
| 5 | **自己製造矛盾(加戲)** | 把「手機建議用 Sheet」與「Dialog 縮邊距」寫成方向相左,實為兩碼事 | 已刪;凡寫「與 X 相左」前必先確認兩者是否真的同一維度 |
| 6 | **把不相干的維度算進來** | 舞台寬扣掉側欄——但 modal 本來就蓋過側欄 | 舞台定義已改為「視窗 − agent」,全文算式同步 |
| 7 | **過度複雜化** | 為窄視窗連發明五套機制(舞台下限/剩餘空間公式/浮貼/單面輪替/整頁橫捲),最後用既有的 768 一條線解決 | 規則能用既有數字解決就不新增;本輪已刪除全部五套 |
| 8 | **引用差一行** | `app-shell.spec.md:262`→`:261`、`sheet.spec.md:133`→`:132` 等四處 | 已修;並記錄證據包工具驗不出 off-by-one(見文首) |
| 9 | **把規範的沉默當背書** | 「非 modal 面板無 Esc 義務(APG)」——APG 根本沒規定 | 文首憲法已列「沉默不算背書」;該處已改寫 |
| 10 | **把規範讀死 / 誤用** | ①宣稱水平捲動一律違反 1.4.10,未查 G206(它明文標 Sufficient)②**把 1.4.10 的「320 視窗寬」誤用成「元件內容區不得小於 320」**,據此判 288 不合格,再為這個假問題連提三套解法(改邊距 / 挪線 / 接受)——**第四次犯**(2026-08-09)| 凡判「違規」前必查對應 Technique **並確認規範管的是哪一個量**(視窗寬 ≠ 元件寬) |
| 12 | **裁剪引文以改變語氣**(2026-08-09 新增,最嚴重) | 把 user 的「…才對**吧?**」寫成「…才對」,疑問句變肯定句;並忽略其後「我也還在思考」的明確未決聲明 | 全文掃過所有引號內以 吧/嗎/? 結尾的引文(9 處),逐一改標來源等級;**引文一律逐字,不得刪語氣詞** |
| 13 | **把已定調的結論降級成未決**(2026-08-09 新增,**本份規格最大宗的錯**) | 「agent 切換重置層數」寫成「尚未定案的想法」;「第二層 modal 是否蓋住 agent」列成候選 A/B 未決;窄視窗已由 768 解掉卻仍掛 BLOCKER;舞台通則已定調卻在覆蓋率表退回「未定義 / 契約管不到」 | 根因是**防線只有單向**:防「把推論升格成 user 拍板」防得很嚴,防「把 user 已定調的降級成未決」則完全沒有。已於 M10 加 sub-rule:任何已成立的結論必須當場登記進總帳 |
| 14 | **只驗單句、不驗結論相容性**(2026-08-09 新增) | 本份規格前後跑過多次「全盤稽核」,全在驗 cite / 數字 / 引文逐字,**零次驗「這兩條結論能同時為真嗎」**;於是 768 與 1024 兩條共存線並存十幾處都沒被發現 | 已於 M10 加 sub-rule + self-verify Pre-final 第 (0) 步 |
| 15 | **把推導結果列成待拍板**(2026-08-09 新增)| 「主內容最差 392px 是否接受」是四個已決輸入算出來的數字,不是選項。user 原話:「產出的各種數字不就是基於結論被動產生的嗎?我拍板數字要幹嘛?」 | 列待拍板清單前先問:**這是輸入還是輸出?** 輸出不進清單;輸出不可接受時要討論的是**哪個輸入要改** |
| 16 | **把已裁決的結論降級成未決(過度保守)**(2026-08-09 新增,**與第 1 類方向相反**)| 「第二層 modal 蓋不蓋 agent」早上寫對(B),下午自己撤回成未決,還去問 user。user 原話:「按照我們之前的結論白紙黑字不是毫無懸念是B嗎?為何又要問我?你是哪裡搞不懂嗎還是規格又寫矛盾不清了?」 | 根因:被抓過三次「過度宣稱」後矯枉過正。**兩個方向都是錯,防線必須雙向**。機械層目前只擋得住過度宣稱(引文逐字比對),擋不住過度保守——**新規則:要把任何已成立的結論降級成未決,必須引得出 user 說「還在思考 / 還不確定」且該話晚於該結論**;引不出來就不准降級 |
| 11 | **刪掉必要的規則** | 為消矛盾而刪「modal 期間 agent 一律佔位」,導致 768–1023 無規則可用 | 已復原;刪規則前必先確認沒有區間會因此落空 |

**未再犯的證據**:本輪五路稽核提報「68px 算不出來」,我開檔驗到 `layoutSpace.css:23` 有 `--layout-space-loose: 24px`(lg),2×24+20=68 成立 → **駁回該 finding**,未盲從。

## 六之二之二、本規格的 DS 覆蓋率(誠實盤點,2026-08-08)

user 問「確保你真的有讀完整整個 repo」。**誠實回答:沒有。** 具體數據:DS 共 **66 個元件**,本規格從未提及 **49 個**。多數與版位無關(Slider / Rating / Chart …),但下列**確實該查而沒查**,列為施工前必補:

| 沒查的元件 | 為何跟本案有關 | 已初步查到的事實 |
|---|---|---|
| **FileViewer** | 實作查核:它繞過 DS `<Dialog>`,要另外接同一個舞台變數 | **行為早已定**(舞台通則),但**要做的不只接變數**(2026-08-09 更正)。`file-viewer.spec.md:22` 明寫它**直接消費 Radix `DialogPrimitive`**,且是 `modal={true}` —— 那會啟動 `trapFocus` / `disableOutsidePointerEvents` / `hideOthers`,**agent 會看得見點不到,違反 B**。所以它與 agent 共存時**必須跟一般 modal 走同一條路**:改用非 modal 分支 + 舞台遮罩。**單獨開(沒有 agent)時維持現狀不變。** |
| **Toast** | 實作查核:sonner 拿不拿得到舞台變數? | **規則早已定**(user 逐字「toast 一樣落在舞台上啊」):Toast 讀舞台變數、落在舞台右下。`toast.spec.md:155` sonner 用 `position: fixed` 覆蓋 viewport、**非 portal**,所以要確認它的掛載節點在變數所在祖先之下——這是**實作查核,不是規則待定** |
| **Menu / SelectMenu / Combobox / Tooltip / HoverCard** | 這些都會 portal 到 body,**不在 Dialog 也不在 agent 的 subtree 內**——直接影響本案「允許互動範圍」契約能不能成立 | 本案已寫「合法 portal 子節點」需納入允許範圍,但**未逐一驗證這些元件的 portal 實作**,契約寫得出來不代表攔得住 |
| **BulkActionBar** | 底部 chrome band,與 agent 佔位的幾何交互未查 | — |
| **DataTable** | 主內容被壓縮時最容易出事的元件(橫向溢出) | — |
| **InlineEdit** | agent 切換左邊內容時,若有進行中的就地編輯會怎樣 | — |

**這張表本身就是 finding**:先前宣稱「規格已通盤考量」是過度宣稱。施工前必須逐一補查,尤其 FileViewer(它繞過 DS Dialog,本案的 Dialog 契約對它無效)與那五個 portal 元件(它們決定共存能不能真的做到)。

## 六之三、本案會動到的既有規格與影響面(2026-08-08 實查)

| 既有規格 | 本案要求的改動 | 必要嗎 | 實際影響面 |
|---|---|---|---|
| `dialog.spec.md:170` 巢狀守則 | 收窄成「不用巢狀 Dialog 做多步驟流程」,允許確認 / 警告類的第二層 | **必要** | **不是技術限制**——`dialog.tsx` 與全庫 hooks/lint/test 零個規則在擋,底層 Radix 完整支援堆疊。且同檔「何時用」段自己就列了「破壞性動作確認:刪除、離開不儲存」= 必然的第二層,**與該禁令互相矛盾**。影響面:僅文字修訂,無程式改動,零消費者受影響 |
| `app-shell.spec.md` Aside 換殼線 `:219` | **768 → 1024**(兩線合一) | **必要**(user 草案模型:「右側欄開始用抽屜的 breakpoint = modal 禁止同時用 agent 的 breakpoint」;數字由容量推導 agent 320 + Dialog 512 + 邊距 96 = 928 → 取 1024,與 Atlassian 一致)| **產品端零消費者**——`AppShellAside` 只被 DS 自身的 stories / spec / Sheet 引用,`apps/` 與 `template/` 零使用。additive prop 即可,既有預設不變 |
| `app-shell.spec.md` Scroll ownership | 對話需自持捲動 | **必要** | 同上,零產品消費者 |
| `app-shell.spec.md` header actions 禁令 | 標題列要放「展開」+ session popover | **必要** | 同上 |
| ~~`app-shell.spec.md` mask 範圍 + `modalOpen`~~ | ~~scoped mask 需要 L0 知道 modal 狀態~~ | ❌ **已撤回** | 遮罩是 Dialog 自己畫的,AppShell 不需要 export `modalOpen`;舞台基準走 CSS 變數,不需跨元件傳 state |
| `app-shell.spec.md` `⌘.` | 需 IME/輸入框守衛 | **必要,且是既有已知 bug**(`:274` 自承) | 修的是既有缺陷,對 consumer 只有變好 |
| `sidebar.spec.md` 768–1023 展開呈現 | 展開改 Sheet 覆蓋(不推擠) | **必要**(user 原話) | 產品端唯一消費者 `apps/template/src/App.tsx:62` `collapsible="icon"`,受影響的只有「該區間展開」一個動作 |
| `dialog.spec.md` Viewport Inset | **<768 時邊距從 48 改 `loose`** | **與本案完全無關的獨立改善**,可單獨落地、也可不做 | **這是 user 自己先前提的**(「我是覺得某個 breakpoint 之後,modal 四周的邊距可以從 48 變成 loose 那個 token」),屬**手機版 RWD 改善**,與 agent 共存無關。
  **⚠️ 2026-08-09 兩次更正**:①我一度拿它當「768 共存夠用」的證據,但改點在 <768、在 768 那點根本沒生效 → 循環論證;②我又改成「依情境改邊距」,被 user 一句話否掉(「開開關關結果 padding 變來變去不會很奇怪嗎?」)。**兩個方案都撤回。現在它回到原本的樣子:一條與 agent 無關的手機版改善。**
  Dialog 共 11 個檔案使用,全部在 DS 內部、產品端零使用;≥768 完全不變 |

**Dialog 邊距若要 token 化,對照 `tokens/README.md:49` 四條 criteria**(user 2026-08-08 追問「dialog 四周間距的 token 也符合規範?」):

| criteria | 檢查 |
|---|---|
| 1. 找不到現有 family 才新增,**先質疑是否真需要** | 有 family 可鏡射(`--layout-space-*`)。**需要的理由**:現況把「視窗邊距」接在 `--layout-space-bottom` 上,但那個 token 的語意是「結論前的留白」(`layoutSpace.spec.md:17`)——兩個不同語意共用一個值 = M17 假 SSOT。拆開是修正,不是新增 |
| 2. 命名過三重測試 | 既有語言 ✅(`dialog.spec.md:80` 標題就叫「Viewport Inset」)/ 跨元件不衝突 ✅ / **≥2 家世界級用此詞:本輪未查 → UNVERIFIED,凍結命名前必補** |
| 3. primitive / semantic 分層 | ✅ 純 layout spacing primitive |
| 4. 語意色相流程 | 不適用 |
| **放哪裡** | `tokens/layoutSpace/`(Public tier),與 `bottom` / `loose` / `tight` 同 family。依 `tokens/README.md:25` folder scope 表 |

候選名 `--layout-space-viewport-inset`。**注意這與上面那個 runtime 變數是兩種不同的東西**:這個是靜態設計決定(該進 tokens/),那個隨拖拉變動(不該進 tokens/)。
| `scroll-area.spec.md` 禁巢狀 | 視捲動所有權決策而定 | 待 POC | 不改該 spec,只是選一條不違反它的路 |

**結論**:本案對**既有產品範例的影響接近零**——AppShellAside 與 Dialog 在 `apps/` 與 `template/` 都沒有消費者,唯一真實影響是 template 的側欄在 768–1023 展開時改為覆蓋呈現。所有 AppShell 改動都應做成 **additive + opt-in**,既有預設行為(768 換殼、title-only header、全視窗 mask、自帶 scroll)保持不變。

---

## 七、決策來源總帳(每條都附 user 原話;引不出原話者一律降級)

**鐵律**:標「user 拍板」必須引得出 **user 的原話**。引不出來就標「AI 建議、user 採納」或「AI 推導」,**不得升格**。本表是全文所有非工程決策的唯一來源證明。

**鐵律二(2026-08-09 加,因我犯過)**:**引文一律逐字,不得刪語氣詞**。user 的話若以「吧 / 嗎 / ?」結尾,那是**徵詢**不是裁決——三種正確標法:
- user 提議 + 我查證後採用 + user 未反對 → 標「**user 提議、查證後採用**」
- user 提問 + 我回答 + user 確認 → 標「**user 提問、AI 答覆經確認**」
- user 明說「還在思考 / 還不確定」 → **一律標未決,不得因為我覺得有道理就當已決**

| 決策 | 來源等級 | 證據 |
|---|---|---|
| modal 期間 agent 永遠可操作(**1024 以上並排佔位;以下改抽屜疊上,仍可操作**) | **user 原話 + 2026-08-08 加上適用範圍** | 「ai agent在開啟modal後被開啟,會永遠都在最右邊且永遠可操作」/「ClickUp在modal模式的ai agent永遠只會有一段且就是佔據位置的那種」。範圍限定來自同日 user 的共存門檻裁決——原話沒有無條件的意思,是我先前把它寫成全稱 |
| modal 期間 agent 與 shell 同一組 min/max(故無 modal 特有的線) | **user 原話** | 「我只知道 AI AGENT不管在app shell 模式還是modal模式都會有相同的最大寬度與最小寬度限制」 |
| modal 入口永遠存在,不因視窗寬度消失 | **user 原話,但 2026-08-08 已被 user 自己取代** | 原話「無論window 怎麼變,觸發點永遠都在啊」;後由下一列取代 |
| ~~**共存門檻以下不提供 agent 入口、禁止同時開啟**~~ **已被 §〇 草案取代(2026-08-10)** | **user 較早的講法;草案較晚且更完整** | 「我覺得應該是當 modal會被擠得不成人形的時候就把 ai agent的入口拿掉並在此時禁止同時開啟ai agent就好」。**注意**:此規則與我先前捏造的那條形狀相同,但這次是 user 主動提出——不得混為一談 |
| 一條 breakpoint、到點就變 Sheet(不要浮貼中間態) | **user 原話** | 「不需要有浮貼過度…只要定義右側欄的最大寬度與最小寬度,並定義一個breakpoint讓右側欄在某一個時間就會自動變為sheet就好」 |
| 側欄縮小後再展開只能以 Sheet 呈現 | **user 提議、查證後採用**(原話帶「吧」) | 「當左側選單因為視窗變小而自動縮小後再次展開就都只能以sheet的方式展開吧」 |
| 768–1023 維持我們自己的定義(細軌) | **user 提議、查證後採用**(原話帶「吧?」) | 「先找我們定義的,我們現在其實也只是比atlassian少一段而已,未來要擴充也不能吧?是基於此設計再延伸」(**逐字;我先前寫成「先照」與「不是不能」,兩處都改了字,後者還把語意反轉**) |
| **1024 這個數字本身** | AI 建議、user 採納 | 我提 1024,user 答「照你建議」。**不是 user 自己提的數字** |
| **停止生成鍵 = mac `Cmd+Esc` / Win `Alt+Backspace`** | AI 建議、user 授權定案 | user 只說「照你建議」;鍵位依 VS Code 一手證據 + 微軟官方文件(`Ctrl+Esc` 為系統保留)選定 |
| **X 只關面板、不動 session** | **user 提問、AI 答覆經確認**(原話帶「吧?」) | 「右上角x只是暫時關閉panel並沒有要終止或刪除session吧?而且收起來之後,依然還是會有觸發點可以打開panel」 |
| **agent 具切換器成分:從 agent 內點開的 modal 會重置左側 modal 層數** | **user 原話** | 2026-08-09 逐字:「我們他媽後來定調ai agent若點擊其中開啟的內容是modal是可以切換左側modal的,所以它有一點切換器的成分在,會重置左側的modal層數」。**先前全文沒有一處把它寫成現行規則**,導致同一題被反覆當未決辯論 |
| **舞台上的 modal 自己再開 modal = 疊加,不置換** | **user 原話** | 2026-08-09 逐字:「舞台上的modal開啟新的modal依然是一層疊一層啊」/「如果是警告dialog難道要置換原本主任務的modal嗎?疊加上去不是更簡單直覺嗎?」 |
| **第二層 modal 不蓋住 agent(B)** | **user 裁決** | 2026-08-09 逐字:「按照我們之前的結論白紙黑字不是毫無懸念是B嗎?」。與舞台定義一致(遮罩蓋舞台,agent 不在舞台上)。**我在這題上錯過三次,方向不同**:①刪語氣詞把徵詢寫成裁決 ②撤回後列成 A/B 未決 ③早上寫對又在下午自行降級成未決(過度保守,錯誤類型 16)|
| **層數上限** | **user 原話(不設人為上限)** | 2026-08-09 逐字:「port io和 ClickUp都還是能繼續疊上去的啊」/「他們是**透過設計去減少層數堆疊並沒有設限**」。**我先前把觀察到的「≤2 層」寫成規則,是把現象當規範,已撤回**——改為靠設計紀律(modal 內不放會把人帶走的連結)+ 只掛頂層 + 同目標不重複疊 |
| **session 增刪查改,面板與滿版都要有** | **user 原話** | 「此 agent應該跟個世界級agent差不多包括都可以增刪查改session等等」。**先前規格把刪改推給滿版,是把 RWD 差異寫成功能差異**,2026-08-09 撤回 |
| **滿版與非滿版架構差不多,差異像 RWD** | **user 原話** | 「但反正不管滿版還是非滿版都應該要有差不多的架構,兩者的差異比較像是 rwd而已,你應該知道我在講啥」。**先前全文零處寫下這條**,已補為鐵律 |
| **否決「常駐切換器」,沿用既有觸發點** | **user 原話(否決)** | 「常駐切換器太複雜了吧?你要佔用一個空間去放這個東西?可能還得跟使用者說明這個空間的意義?任務詳情在本來的頁面本來就有觸發點,開啟agent也會有觸發點,讓使用者去找原本的觸發點不好嗎?為何要多設計一個新的東西?」。**先前全文零處記錄**——碰巧沒實作,但任何人都能把它當新提案重提,故補檔 |
| **一個畫面只會有一個視覺像 sidebar 的東西** | **user 原話** | 「但通常一個畫面基本上只會有一個視覺像sidebar的東西吧?」。滿版不重用 L0 Sidebar 的**原則**理由是這條;規格先前只寫了 cookie/⌘B 單例的工程理由,結論吻合但原則失傳,已補 |
| **768 這條線用不著死守** | **user 原話(降權)** | 「當初768以下的定義也是沒有仔細思考的結論吧?用不著死守」。**先前完全沒入檔**,規格反而拿「768 是既有行動線」當權威。已補標:沿用成本低 ≠ 權威 |
| **768–1023 抽屜開著時開 modal 怎麼辦** | ✅ **已決**(user 草案模型 + 容量推導)| 先前寫「抽屜就地變佔位」,但 user 2026-08-09 自己質疑「沒有 resize 的情況 sheet 根本不可能變成佔位」,且世界級研究顯示**零家有此前例**(主流是「抽屜留著、modal 蓋上去」)。三選項見版位規則「抽屜變佔位」段;**我建議把共存線與推擠線合成一條 1024** |
| **主內容最差 392px** | **不是拍板題**(2026-08-09 user 指出) | user 逐字:「如果你都按照我們有共識的結論做的話,產出的各種數字不就是基於結論被動產生的嗎?我拍板數字要幹嘛?」——**正確**。392 是四個已決輸入(agent 下限 320 / 半寬上限 / 推擠線 1024 / 側欄 240)算出來的**結果**,不是選項。要改只能改輸入,而四個輸入都沒有在爭議。先前把推導結果列成待拍板,是把被動產物誤當成決策 |
| **窄視窗 modal 期間怎麼辦** | ✅ **已決**,見 §〇 第 7 條 | 1024 以下 agent 改成**抽屜疊在 modal 之上**,兩者**不共用寬度**,所以「舞台 = 0」這個前提根本不會發生。先前把它掛成 BLOCKER 未決,是同一題已解卻沒回頭清掉舊條目。三個舊選項 (a)(b)(c) 全刪:(a) 是 user 否決過的舞台下限,(c) 是 user 一開始就說不做的「Sheet 疊 modal」|

### 曾被我錯誤升格為「user 拍板」的清單(全部已撤,留檔防重犯)

| 我寫過的 | 真相 |
|---|---|
| 「<768 + modal 不提供入口(你最早的拍板)」 | user 原話:「我他媽到底哪有拍板過這件事」——我捏造的 |
| 「X = 終結 session」 | 從未經拍板,本文自創;user 更正後已全面改寫 |
| 「主內容 392px,user 拍板接受」 | user 只問了一個問句,我當成同意 |
| 「不能容納 agent 的第二層 modal 必須蓋住 agent(user 原話)」 | 原話結尾是「…才對**吧?**」,我把「吧」刪掉;user 其後明說「還在思考」,我仍當已決 |
| 「modal 讓位線 816」 | 把 Dialog 的 maxWidth 檔位誤讀成下限保證,再當成既有規範 |

**共同根因**:把「我的推論」與「user 的決定」寫在同一個語氣層級。防線 = 本表(每條必附原話)+ 下方第 3 題那種「引原話再解釋」的格式。

**第 3 題的完整理由(user 定調)**:先照我們自己定義的走。我們的模型是 Atlassian 的**真子集**——它兩條線三段(浮層 / 貼齊覆蓋 / 真欄位),我們一條線兩段(覆蓋 / 真欄位),只是少中間那段。而細軌不是我們發明的,是 `sidebar.spec.md:277,284` 既有的 icon rail 能力,我們只是規定它在這個區間是唯一允許的常駐形態。

**未來要補上中間段(1024–1440 貼齊覆蓋)的成本,誠實記錄**:不是零成本的純新增——會多一個形態(4 → 5),且 1024–1440 的行為會從「推擠」改成「覆蓋」。但**結構上不需要重寫**:規格已經用「形態 + 線」表達,加一條線和一個形態即可,原則本身不動。所以「基於此設計再延伸」成立。

---

## 八、用既有元件怎麼做(2026-08-09 四路稽核 + 對抗驗證;32 個落差提報、22 個成立)

**user 硬性偏好:傾向不另造新元件。結論:零新元件。**

### 報告本體

## 1. 一句話結論

**既有元件夠用,零新元件。** 22 項落差全部可以用「改內部 + 加少數選項」關掉;唯一需要新增的是一個看不見的內部小檔案(記錄「現在開著幾層對話框」的帳本),它不是元件、不會出現在任何人的畫面上、也不會多一個要學的名字。

倒是有一個反例要避免:`FileViewer`(檔案預覽,那個滿版看檔案的畫面)當年為了要滿版,選擇不用共用的對話框,自己另刻一套。結果就是今天這份模型裡每一條規矩,都得在它身上再做第二次。**它是「另造一套」的代價實證,不是可以援引的前例。**

---

## 2. 最小改動集(由小到大)

### 第一級:只改說明文件,一行程式都不動

| # | 要改什麼 | 大小 |
|---|---|---|
| 1 | `AppShell`(整個畫面外框)的規格裡寫著「沒有新增任何自訂變數」——**這句今天就已經是假的**,程式裡早就有一個傳寬度給側欄用的變數沒登記。改寫這句。 | 改寫 |
| 2 | 同一份規格寫著「灰色遮罩蓋住整個畫面,包含右側欄」——這跟模型要的「agent 疊在遮罩之上」正面衝突,必須改口。 | 改寫(需拍板) |
| 3 | 同一份規格寫著「換抽屜的螢幕寬度線 = 768,左右側欄同時換」——改成 1024 且只有右側欄換。 | 改寫(需拍板) |
| 4 | `Sheet`(抽屜)的規格裡列了一個「寬度選項」,程式裡根本沒有這個東西,範例是用外部樣式假造的。刪掉這句謊。 | 改寫 |

### 第二級:內部小改,沒設定的人完全感覺不到

原則一致:每一項都帶「預設值 = 今天的值」,沒有 agent 的畫面逐格等同現況。

| # | 元件 | 要改什麼 | 大小 |
|---|---|---|---|
| 5 | `Sheet` 抽屜 | 寬度目前寫死。改成「宿主可以餵值,沒餵就用今天的值」。**順手修掉一個既有 bug**:螢幕寬 640–767 時抽屜被鎖死在 448,連自己規格寫的上限 640 都達不到。 | 內部改 |
| 6 | `Dialog` 對話框 | 置中與最大寬度目前以整個視窗為準。改成「視窗寬度先扣掉 agent 佔的那段」,agent 沒開時扣 0 = 今天。**這一項是整份模型的核心**,也只有兩行。 | 內部改 |
| 7 | `FileViewer` 檔案預覽 | 同樣的一段寬度也讓出來。同一個變數、同一個預設 0。 | 內部改 |
| 8 | `AppShell` | ⌘.(開關側欄的快捷鍵)目前沒有防呆,**使用者在對話框裡打中文選字時按到就會誤關 agent**(Windows 微軟拼音的「中英標點切換」正好就是這個鍵)。照抄左側欄既有的三道防呆。 | 內部改(修 bug) |
| 9 | `AppShell` | 右側欄換抽屜的線從 768 改 1024,**只改右側欄,左側主導覽不動**。不要改共用的判斷,那會把左側欄一起拖過去。 | 內部改 |

### 第三級:加一個選項(外面看得到的新東西,但不填就跟今天一樣)

| # | 元件 | 要改什麼 | 大小 |
|---|---|---|---|
| 10 | `AppShell` 右側欄 | 標題列目前寫死「標題 + 關閉叉」,而且規格明文禁止再放任何按鈕。但模型要放「切換對話」「展開全頁」兩顆。這條禁令是當年怕被亂改而設的自我限制,**不是設計語言的規矩**——共用的標題列規範本來就允許放按鈕。做法直接抄對話框標題列既有的同款選項(2026-07-08 已定案),包含關閉叉左邊那條分隔線要由元件自動放、不讓使用端自己刻。 | 加選項 |
| 11 | `ScrollArea`(捲動區)+ 右側欄 | 對話要能自己貼底、跳到某一則、串流時鎖底,但現在拿不到那個會捲的東西。加一個「把手」選項交出去。 | 加選項 |
| 12 | `AppShell` 內部帳本 | 多記兩件事:agent 現在多寬、以及一個回報寬度的通道。**現有四項一個字都不動**,所以既有使用者零影響。這是第 6、7 項的值的來源。 | 加選項 |

### 第四級:內部多一條分支(最大的一塊,但仍不是新元件)

| # | 元件 | 要改什麼 | 大小 |
|---|---|---|---|
| 13 | `Dialog` 對話框 | 「agent 在任何層數都能點」不是給個高度就成立。第三方底層在標準模式下同時鎖了四件事:整頁不能點、焦點被關在對話框裡、其他東西對讀螢幕軟體全部隱形、遮罩由它畫。要讓 agent 活著,就得走非標準模式,然後把「該留的」一件件補回來:遮罩自己畫(樣式完全沿用既有那行,一個字不改)、背景不能捲要補回來、讀螢幕軟體的隱藏要改成「除了 agent 以外都隱藏」、點到 agent 不能關掉對話框。 | 內部分支 |
| 14 | `FileViewer` | 上面這條分支它要再走一次(它自己接底層,吃不到對話框的改動)。但共用同一個判斷與同一份「豁免名單」,不寫第二套。 | 內部分支 |
| 15 | 新增一個內部小檔 | 一本「現在開著第幾層對話框」的帳本,提供三件事:層數、關掉全部(= 重置舞台)、我是不是最上層。**放在共用小檔而不是掛在 `AppShell` 上**,因為對話框常常不在 `AppShell` 底下(例如 Storybook、app 根層),掛上去會靜默失效。DS 內已有同款寫法可抄(`Notice` 通知)。 | 新增內部檔 |
| 16 | `Dialog` | 對話框把自己的層數往下傳一層。這樣抽屜「我掛在主畫面上還是掛在對話框上」**免費就知道了**,不必再多發明一個「宿主」概念——兩個概念會互相打架。抽屜本身一行都不用改。 | 內部改 |

---

## 3. 需不需要新元件

**不需要。零新元件。**

三個一開始看起來像「需要新東西」的地方,查完都不需要:

- **「舞台」不必做成一個新單位。** 它實質上只是一個數字(agent 有多寬)加一個疊放高度。現在就開一個新單位,只會有一個使用者,反而違反自家「要有兩個以上使用者才抽出來」的規矩。等哪天抽屜也要用,再開不遲,成本一樣。
- **「非標準模式的遮罩」不必做成新元件。** 現有那個遮罩本來就是我們自家寫的,長相(滿版鋪滿)正好就是模型要的,一個樣式都不用改,只是內部多走一條路。名字、對外用法全部不變。
- **「層數帳本」不是元件。** 它沒有畫面,不掛在任何地方,不出現在對外清單裡。

唯一真正「加選項也不行、包一層也不行」的,是第 13 項那條分支——因為第三方底層那四道鎖沒有任何開關可以單獨關掉,只能整組換路走。但那仍然是在既有元件內部多一條路,對外完全沒有新東西。

---

## 4. 風險:會碰到現有已經在用的地方

按嚴重度排序。

| 風險 | 說明 | 怎麼防 |
|---|---|---|
| **對話框是全站最常用的東西** | 第 6 項改的是每一個對話框的定位與寬度,包含 ⌘K 快速指令。 | 用「扣掉的預設值 = 0」保證等價。**注意一個陷阱**:寬度計算要用「百分比」不要用「視窗寬」——後者含捲軸,遇到某些捲軸設定會偏半個捲軸寬,「跟今天完全一樣」就不成立了。 |
| **少一個套件會在發版後才炸** | 補回「背景不能捲」用到的套件,目前只是間接被裝進來,不是我們正式宣告的依賴。今天在本機看起來正常,發布給外部使用後會找不到。 | 明確把它列進套件清單(一行)。 |
| **換殼線改 1024 會誤傷左側主導覽** | 那條 768 是左右側欄共用的判斷,直接改會讓左側欄也跟著跳。 | 只在右側欄內部另算一條線,共用判斷完全不碰。 |
| **抽屜寬度變數化會改變既有畫面** | 第 5 項順手修掉的 448 上限,會讓螢幕寬 640–767 時的抽屜「變寬了」。這是修 bug,但畫面確實會變。 | 事前知情,改完截圖比對。 |
| **右側欄標題列放按鈕** | 等於放寬一條當年立的自我禁令。 | 從「不准有」收緊成「只能單行小圖示、關閉叉恆在最後、分隔線由元件自動放」,並跑既有那支檢查分隔線位置的測試。 |
| **⌘. 加防呆改變既有行為** | 現在在輸入框裡按 ⌘. 會關側欄,改完不會。 | 這是修 bug,而且要抄滿三道(含「讓使用端可以自己接管這個鍵」那道,原提案漏了)。 |
| **`FileViewer` 要跟著改兩處** | 它自己接底層,對話框的任何改動都流不過去。 | 讓它跟對話框讀同一個判斷、用同一份豁免名單,不寫第二套邏輯。 |
| **三份規格文字要跟著改** | 只改程式不改規格,就會出現「文件說 A、程式做 B」。 | 第 1–4 項與程式同一批做完。 |

---

## 5. 建議施工順序

**第 0 步｜先拍板三句話(不動程式)**
這三句是產品層的決定,不是工程判斷,要你先點頭:
1. 右側欄換抽屜的線 = 1024,而且**只有右側欄換,左側主導覽維持 768**。
2. 遮罩鋪滿整個畫面,但 **agent 疊在遮罩之上、不變暗、任何層數都能點**(現行規格明文寫相反)。
3. 右側欄標題列**允許放小圖示按鈕**,關閉叉恆在最後(現行規格明文禁止)。

**第 1 步｜地基(小、可獨立驗、不影響任何人)**
第 12 項(側欄回報自己多寬)+ 第 5 項(抽屜寬度可被餵值)+ 第 1、4 項規格誠信改寫。
做完的狀態:什麼都沒變,但「agent 有多寬」這個數字第一次可以被別人拿到了。

**第 2 步｜舞台幾何(模型的骨架)**
第 6 項(對話框在舞台內置中與壓縮)+ 第 7 項(檔案預覽讓出同一段)+ 對應的規格公式改寫。
做完的狀態:**看起來已經對了**——對話框確實在 agent 左邊的舞台裡置中並縮小。但 agent 還是灰的、還點不到。

**第 3 步｜讓 agent 活著(最大一塊,建議獨立一批)**
第 13 項(對話框非標準模式分支:自畫遮罩、補回背景不能捲、讀螢幕軟體豁免 agent、點 agent 不關窗)+ 給 agent 一個高於遮罩的疊放高度 + 第 14 項(檔案預覽走同一條)+ 第 2 項規格改寫。
做完的狀態:模型的核心視覺與互動全部成立。

**第 4 步｜層數行為**
第 15 項(層數帳本:重置舞台、我是不是最上層)+ 第 16 項(往下傳一層,抽屜自動知道自己掛在誰身上)。
做完的狀態:「從 agent 開 modal 要清空整疊」「抽屜在兩種宿主下行為不同」成立,而且抽屜本身一行沒改。

**第 5 步｜換殼線**
第 9 項 + 第 3 項規格改寫。**刻意排在後面**,因為它會改變現有畫面在 768–1024 之間的長相,前面幾步的問題不要跟它混在一起排查。

**第 6 步｜收尾小修**
第 8 項(快捷鍵防呆)、第 10 項(標題列兩顆按鈕)、第 11 項(對話捲動把手)。彼此無關,可並行。

**第 7 步｜驗收**
三種螢幕寬度(< 640 / 640–1023 / ≥ 1024)× 三種畫面(對話框、抽屜、檔案預覽)× 有無 agent,逐格截圖比對;跑既有那支檢查標題列分隔線位置的測試;確認沒有 agent 時所有畫面與改動前逐格相同。

---

### 一句話收尾

工作量的真正大宗不是「舞台」——那只有兩行;是**「讓 agent 在遮罩之上還能點」**那條分支,以及它必須在對話框與檔案預覽身上各做一次。前者不可避免,後者是 `FileViewer` 當年另造一套留下的利息。
--- 27 條結論清單(稽核判準原檔) ---

# 已拍板結論清單(雙方稽核的唯一判準;規格任一處與本表牴觸即為 bug)

## A. 空間模型
1. 畫面上**只有兩個位置**:舞台(左)+ agent(右)。
2. **舞台上同時只顯示一個東西**(主內容 / modal / 預覽,三選一)。
3. **agent 永遠不被蓋住、永遠可用**。唯一例外:有「必須回答的確認框」時,**只擋「要改變舞台」那一下**;讀/打字/捲動照常。
4. **遮罩滿版**,agent 的**圖層動態高於最上層遮罩**(ClickUp 801/802、Shopify 518/520 兩家實機同款)。
5. **關掉 agent = 舞台變成整個視窗**(取代先前提過的「放大鍵」,該鍵已刪)。

## B. 形態線 = 1024(與推擠線合一,一條線)
6. **線以上**:agent **並排佔位**。
7. **線以下**:agent 是**抽屜疊在 modal 之上**,**仍可用**,**入口恆在**(不是「禁止同時開啟」——那是較早講法,已被 §〇 草案取代)。
8. **線以下唯一的附加動作**:點「要用 modal 開的」內容時**先關掉抽屜**。**舞台規則線上線下完全相同,沒有第二套。**
9. 線以下點「要用主內容開的」→ **關掉整個 modal 含抽屜**。

## C. 換 vs 疊
10. **掃整疊**:命中**同一種容器** → **換掉那一層並清掉它上面的**;**沒命中 → 疊上去**。
11. **不依內容類型分類**(任務型/檢視型/確認型三分法已否決)。
12. **不設深度上限**,靠設計減少層數(ClickUp / Port 皆如此)。
13. **「用主畫面還是 modal 開」由目的地註冊表宣告**,不解析連結;**agent 不得指定呈現方式**。

## D. 打斷與確認
14. **疊不用問**;只有**換**和**關**才可能問。
15. 只有**真的有未存內容**才問;**一次問全部,不逐層**。
16. 確認框開著時,agent 的**一般互動完全不受影響**。
17. 被擋時:**記住待前往**;**線以上必須在 agent 面板內顯示 `Alert`**(視線在右邊,舞台的震動看不到,且減少動態時根本沒震動);**線以下靠「關掉抽屜」露出確認框**當回饋。
18. **確認框零改動**,不動態改標題或按鈕文案。
19. **取消 → 清掉待前往**;**主要按鈕 → 做完原本的事,然後前往待前往那個**。
20. 中途再點別的 → **後點的取代前一個**。
21. **靜默清除未存內容明確排除**(Shopify 就是反例,不抄)。

## E. 其他
22. **Esc 由焦點所在決定關誰**。
23. 轉場:**一次淡入淡出 200–250ms**,**不可分段**(不可先關表單、露出底層、再換)。
24. **agent 不需回話**「已前往 X」;卡片選取 + 舞台變化本身就是回饋。
25. **session 增刪查改,面板與滿版能力相同**,差別只在版面。
26. **滿版與面板的差異像 RWD,不是功能差異**。
27. **三邊各知其事**:確認框**什麼都不知道**;導航層記「被擋 + 待前往」;**發起端**顯示。
