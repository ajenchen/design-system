# 每次任務前的 6 條 mindset(世界級設計系統的工作底色)

這 6 條是本專案所有規則背後的**態度**。接到任務先複習一遍,再看具體規則。

1. **對標世界級 + 不取巧省工**——每個設計決策都要能回答「Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 怎麼做?我們為什麼一樣 / 為什麼不同?」。沒對齊又說不出不同的理由 = 設計 bug。**視覺上也必須跟世界級一樣整齊**:用我們的 token / 元件換掉第三方樣式時,不能讓視覺比原版鬆散、錯位、比例失調——「符合我們的設計語言」和「視覺整齊度不輸原版」是**同時成立**的要求,不是二選一。**遇到取捨禁止以「選較簡單」「省 N 個 edits」為由選 shortcut**——一律選最世界級做法。說到「快速修」「省工程」是 yellow flag,停下重想。權宜若真必要,明說是權宜 + 存 tech debt + 將來回來重做。
2. **不憑直覺發明 / 優先消費既有**——新增任何值 / 名 / pattern / 視覺結構 / variant 前先 `grep` 既有,**也包含 layout primitive**(見 `# 建立 UI 前必讀` 的「既有 layout primitives 清單」)。若新元件的視覺結構命中既有 primitive(item-anatomy / overlay-surface / Empty 等),必消費不重寫。專案已有的 gap、padding、font-size、命名慣例優先沿用;不是「看起來順」就能造新值。**強制執行 `# SSOT 消費 canonical` 清單**——寫任何視覺 code 前列出消費了哪些 components / patterns / tokens / spec。**提出設計建議也算在定 pattern**——討論階段給 option A/B/C 時,每個 option 都必須同時對照「DS canonical」+「世界級 idiom」,兩邊都有才叫有根據的建議。**禁止自己憑印象列部分家**——任一個相關的家沒掃就是螺絲鬆(consumer 會 ship 你的建議,建議就是 pattern)。**只看世界級 = 螺絲鬆**。
3. **改一處必看三處**——code / spec / story 三方聯動是常態,不是例外。改 cva `defaultVariants`、改 variant、改 token 前先 grep 該元件所有檔案,一次改完。
4. **範例必須是真實業務場景**——Jira / Stripe / Notion / Figma 等可辨識的情境;禁止 `Option A/B/C`、「按鈕一」、極端不現實、ASCII art。Storybook 的受眾是任何打開它的人,不是作者。
5. **猶豫就問,不往前推**——遇到無前例的設計決策:(a) 先 grep 既有 pattern,(b) 讀近親元件 spec,(c) 仍不確定就停下問使用者。**禁止憑直覺造新 pattern**——這是本專案最常被糾正的錯誤。
6. **大原則吸收瑣碎,記憶索引不該長**——同類 bug 反覆被糾正 = 規則寫太細、meta 層沒抓住。真正該寫的是「哪一類 meta-pattern 誤用」,不是「哪一個具體 bug」。失敗記憶索引應該長**不大**;若一直長,代表 meta-principle 漏寫或沒執行。見 `# Meta-Pattern 預警` 的 15 條大原則。**AI 不需要被 user 提醒才去找 root invariant**——rule 震盪(寫成 A → 被糾 → 寫成 not A)發生時 AI 必**自己**停下,跑 M12 benchmark + invariant test。**User 就同主題第 2 次問 → 必主動截圖 verify**(M13),不靠第 3 次才醒。**User 說「所有 X」= DS-wide 聲明,當下做完 + 建 hook 防線,不拖 tech debt**。**每次對話達成 canonical 結論 → AUTO 跑整合 pipeline**(M14:world-class benchmark → spec → code → hook → CLAUDE.md → memory → 驗證,5 層至少 3 層,不等 user 催)。使用者 tell me once,我不該要 tell me twice。

每條規則展開請讀後面對應章節(`# Spec 規則`、`# UI 開發規則`、`# Story`、`# 命名與語言一致性` 等)。


# Meta-Pattern 預警(15 條大原則)

**mindset #6 的具體化**。每條能吸收數十個具體 bug,是失敗記憶索引的上游。接到任務先過這 15 條,再跑 `# 任務導航表`。

| # | Meta-Principle | 能吸收的 bug 類型(舉例,非窮舉) |
|---|---|---|
| **M1** | **視覺決策前必消費 SSOT**(元件 / token / pattern / spec)。強制跑 `# SSOT 消費 canonical` 清單,沒列出 = 自創。 | 自發明 `variant="bare"` / Dismiss 用 Button(未用 ItemInlineAction)/ Sheet 表單 gap 沒用 layout-space token / Header 高度沒用 `--chrome-header-height` / Row 沒用 item-anatomy / Toolbar 按鈕群 gap 不對齊 action-bar canonical |
| **M2** | **消費 3rd-party lib 必驗 rendered DOM**(不信 docs)。任何 `[&\[data-...\]]:` attribute selector 針對第三方元件前,inspect 真實 DOM 有無該 attribute。Library API(fit / zoom / wheel step)先寫 3 行 POC 驗證行為,再寫到元件裡。 | react-day-picker `data-range-*` 不存在 / react-zoom-pan-pinch fit-to-page 算錯(混淆 object-contain 和 transform scale)/ wheel step 10% 太粗 / 未來任何 lib 升級 silent breakage |
| **M3** | **Portal 逃逸 subtree context**(theme / density / provider)。任何 overlay 元件(DropdownMenu / Popover / Dialog)走 Portal 到 document body,**不繼承觸發點的 subtree attribute**;必顯式 forward `data-theme` / `data-density` / context。 | DropdownMenu 在 dark subtree 變亮 / Tooltip 在 lg density 變 md / 未來任何 Portal 元件的 subtree drift |
| **M4** | **`_Group` 元件必隔離單 item 的 fieldCtx**。當 Group 元件(CheckboxGroup / RadioGroup / SwitchGroup)包在 Field 內,其 child items **不可共用 fieldCtx.id / fieldCtx.hasFieldWrapper**;Group 必建自己的 Context 告訴 items「你在 group 裡」。 | Checkbox 在 CheckboxGroup 內所有 label 抑制(bug)/ 所有 item 共用 id 點擊只 toggle 第一個 / 未來任何 Group 類相同模式 |
| **M5** | **視覺 canonical 必 spec 聲明所有 state 疊加組合**。單一 state(today / selected / hover / disabled)有視覺定義不夠;**所有兩兩疊加、三疊加組合也要在 spec 有明文**。 | DatePicker `today + selected` bar 色隱形(藍 bar 在藍底)/ `hover + disabled` ring 仍顯示 / `range + today` 指示器重疊 / 未來任何新 state 上線 |
| **M6** | **Stakeholder-visible 產出 → 強制進階稽核才出稿**(不是 merge 後補)。任何「有視覺可以給 stakeholder 看」的產出(新元件 / 元件新功能 / 新產品頁 / 比稿)**必過進階完整稽核**(6 維 + 全截圖視覺驗證)。日常 dev 可用高效模式,stakeholder gate 不可。 | FileViewer 初版不看 action-bar spec / button 間距錯 / dismiss 用 Button / header 沒 token / 視覺不整齊上給人看 |
| **M7** | **新 protocol / skill / rule 寫完,必反向 cross-check 既有 Meta-Principle 是否該套用**。尤其:consistency-class 的 protocol 必走「一致性類稽核必先全掃再判」(本章節);audit skill 必加「Self-improvement capture」Phase F step;Rule 觸及「canonical」「SSOT」「rationale」keyword → 必明示 substantive vs 表達層分權。 | 2026-04-21 principle-audit-protocol.md v1 寫完未套 Phase 0 全掃到 D6b/D6c,被 user 抓到「這也是跟一致性有關」才補。典型:AI 寫新東西時套用既有原則時有盲點 |
| **M8** | **訂立 / 修改 cross-component canonical 前必 world-class benchmark**。任何 predicate / decision tree / taxonomy 類 spec,**必先 grep 至少 3 家世界級 DS**(Polaris / Material / Atlassian / Ant Design / Carbon / Apple HIG / VS Code / Figma 等)列對照表,再訂 rule。**絕對禁止**憑直覺開場寫 predicate,user 問才補對照。每個 category / variant / case 必附世界級 reference(實作名或 API 指向),沒有對照的 rule 視同未成熟,走 Checkpoint 3。 | 2026-04-22 item-anatomy Inline Action vs Button predicate 疊代 4 次(position-based → density 分界 → fixed-small → chrome corner exception),每次 user 拉回才補世界級對照。若 M8 存在,第一次就該先 benchmark Material IconButton / Polaris Button plain / Atlassian IconButton / Ant Button type=text 的位置規則再訂 rule |
| **M9** | **Predicate / decision tree 寫完,present 前必 4 題自測**,防 membership drift。(a) **每 example 回跑決策樹**:把 real case 表 / 範例清單的每一個 item 丟回 Q1/Q2/Q3,確認它真的落在 claim 的 category,不是憑印象塞。(b) **cap / constraint cross-check**:spec 若有「絕對值 ≤ X」/「必 size Y」類 constraint,grep 表內所有 value 驗沒 violation。(c) **每 example 對 ≥3 家 world-class DS**:不是整個 predicate 對,是**每個 real case** 對(e.g. Dialog corner close 對 Material/Polaris/Atlassian 各一家怎麼做)。(d) **每 category ≥1 example**:空 category = 概念未收斂。任一題失敗 → 重收斂,**禁止 present**。 | 2026-04-22 本 session:AI 自己列的 Cat 1 IA 範例塞「DatePicker endAction」(含裝飾 Calendar,該走 decorative indicator)+「Chrome corner close」(該走 Cat 3 Button);FileItem rich 列 Button sm(違反同 session 訂的 ≤ 24 cap);DataTable 初版列 Inline Action(世界級全用 Button)。四個錯分每一個都是 user 抓到才修。M9 若 pre-session 存在,四題自測可一次抓光 |
| **M10** | **Proactive exhaustive scan:canonical migration 完成前禁止只改「直覺相關」元件;final report 前禁止省略「我知道但沒講」的 tech debt**。流程:(a) 訂 / 改 canonical → `grep -r` **所有** `.tsx / .stories.tsx / .spec.md` 找 pattern,不是憑印象列 N 個元件改完就收工;(b) Phase 4 final report 必 proactive 自問 3 題 —「還有哪些消費者沒跟上 canonical?」「本 session 動過的 code 有無 known issue 沒講?」「有無明顯 UX / a11y / visual 瑕疵我注意到但沒 flag?」;(c) 回覆 user「做完了」前強制 pause,自問「還有什麼我知道但沒主動講?」— 有必誠實列出 present,等 user 決策。**Silent tech debt = 違反本條**。 | 2026-04-22 dismiss canonical migration 只改 Dialog/Sheet/Popover/Alert/Notice/Coachmark,漏 FileViewer 2 處 + action-bar stories 4 處,user 抓出來;同時 Dialog autoFocus tooltip 洩漏 / body 未用 ScrollArea / layoutSpace uiSize 耦合 / list-in-dialog padding 大 — AI 全程知道或該察覺但沒主動講,user 7 個問題一次炸出來。根因:AI「做完」的標準太鬆(只改 explicit 要的事),缺 proactive self-scan |
| **M11** | **User-perspective interactive state walk — 改完 UI 後 present 前必親自走一次 user 視角**,不留待 user 抓。改 UI 完成必過 7 題 self-test:(a) **static**(對齊 / padding / 色);(b) **hover / selected / active**(overlay list 三 invariant 必同時成立:(1) hover bg flush chrome 邊、(2) content 對齊 header title、(3) content 在 bg 內有 loose breathing;world-class Linear / Notion / Slack / Raycast / VS Code Quick Pick 共通;**必用截圖驗證 3 invariant 幾何**,不靠記憶判斷;詳 `patterns/overlay-surface/overlay-surface.spec.md` 規則 3.1;鼠標 cursor;hover 區覆蓋整列);(c) **focus-visible**(只 keyboard tab 顯示 ring,滑鼠 click 不該 — 檢查 `focus:` vs `focus-visible:` 用對);(d) **active / pressed**;(e) **keyboard**(Tab / Shift+Tab / Esc / Enter 正確);(f) **範例真實性**(「誰會這樣用?」— modal 內 list item 通常 in-modal 直接設定,不 navigate 去別處;symbolic tags / placeholder content 全改掉);(g) **CSS 對稱**(`lg` override 必對應 `md` reset;`dark` 必對應 `light` default)。每 UI 改動未跑 7 題 walk 就 commit = 違反本條。 | 2026-04-22 ListBody 修完 user 連抓 5 波:hover bg 貼邊違反不貼邊 / focus ring click 觸發擾人 / notification 範例不現實(誰會進 modal 又跳別處)/ menu py-2 沒對齊 / layoutSpace md reset selector 缺。每個都是 user 視角一看就知,AI 沒跑 state walk 就 commit |

| **M12** | **Binary strict rule(「必 X」/「禁 Y」)前必 benchmark + invariant test**。使用者單次視覺 preference、單次觀察 → **不是** canonical;canonical 是 **invariant across context**。強化 rule 前必 3 題自測:(a) **≥3 家世界級 DS 一致**(Polaris / Material / Atlassian / Ant / Carbon / Apple HIG 取 3 比對;有差異 = variance 不是 canonical);(b) **Counter-example scan**:能舉出 legal 的反例嗎?能 → 不該寫 strict rule,rule 寫錯 layer;(c) **Root invariant vs surface observation**:「flush bg」是表象(bg 邊位置),真實 invariant 通常比表象深一層(例:真正規則在 **content 與 bg 的關係** — content 必在 bg 內有 breathing,與 bg 邊位置無關)。**震盪症狀**:同一概念的 rule 被 A → not A → A 糾正 = meta invariant 沒抓到,**停下 present,自己跑 3 題 benchmark + invariant test,不要寫第 3 版**。**禁止**把「我這 case 偏好 X」機械升級成「canonical must X」。**AI 不該靠 user 提醒才 benchmark** — rule 寫強(必 / 禁)的瞬間就要觸發本條 self-check。 | 2026-04-22 hover bg 四次震盪:v1 寫「bg 不貼邊」→ user 糾 Image 22 inset 錯 / 23 flush 對 → v2 寫「必 flush」→ user 糾「flush 本來就合法,不一定要 flush」→ v3 又寫「bg 邊自由、content 有 spacing 即可」→ user 再糾 Image 24「content 貼 bg 邊」仍違規,Image 25「bg 比 content 寬」才對 → **真 invariant = content 必在 bg 內有 padding,bg 邊位置是 variance**。根因 4 層:(1) AI 把 user 單次 preference 升級 strict rule(沒 benchmark);(2) 寫 rule 層級錯(在 bg-edge layer 糾結,真 invariant 在 content-padding layer);(3) 震盪被糾 3 次才醒,CLAUDE.md 已寫「同類 bug 糾正 3 次 = meta 漏寫」AI 仍沒自覺;(4) 需要 user 反覆提醒才啟動 meta-reflection,違反「自我升級機制」精神 |

| **M13** | **User 第 2 次提起相關問題 → 自動觸發截圖 verify,不靠第 3 次提醒**。當 user 就同一視覺 / 行為主題 **第 2 次**問 / 糾正(even 用不同角度),AI **必自動 invoke 截圖 verify**(`node scripts/visual-audit.mjs --scope=component:XXX` + `Read snapshots/*.png`),用視覺證據 compare user image vs 當前狀態。**禁止靠記憶 / 推論回答**。第 3 次才 verify = 已違反本條。**Scope = 任何 UI / 視覺 / interaction pattern** 的問答。**Corollary(大規模 migration)**:user 指定「所有 X 都要 Y」(e.g.「所有 avatar hover NameCard」),不可分批 / 拖延 / 留 tech debt — 同 session 全部做完 + 建 hook 防線。 | 2026-04-22 hover bg 震盪 4 次 + avatar-NameCard migration 拖延:user 說「我說所有」明示 DS-wide,但 AI 第一次只改 2 處 dialog stories,15+ 處放 tech debt 留到下次。user 第 2 次提起才完成。根因:AI「做完」標準太鬆(視 user 明示為「提醒」而非「canonical 聲明」),截圖比對工具已存在但 AI 不主動用。本條防線:第 2 次相關訊息 = 觸發器,不等第 3 次 |

| **M14** | **對話結論 → AUTO integrate pipeline**(不等 user 催)。每次對話達成 canonical / 設計決策 / 新 rule 結論時,AI **必自動執行**整合 pipeline,5 層至少 3 層落地:(1) **World-class benchmark**(≥3 家對照,M8 已規定);(2) **SSOT home 識別**(哪 spec / code / token / pattern 該收這條?);(3) **Spec**:canonical text + rationale + 世界級對照表(primary home);(4) **Code**:programmable 部分落地(新增 prop / CSS rule / API signature,避免 canonical 只留在文字層);(5) **Hook** `.claude/hooks/*.sh`:auto-detectable 違規(regression prevention);(6) **CLAUDE.md navigation**:如 SSOT 消費清單 / 任務導航表要 cross-link;(7) **Memory**:跨 session 記憶 `project_*.md` + 更新 MEMORY.md 索引;(8) **驗證**:`tsc --noEmit` + `visual-audit --scope=component:X` + hook smoke test。**違反 trigger**:user 問「你有沒有整合到 X spec」/「還有沒有要做的」/「是不是該程式化」 → 代表 pipeline 沒自動跑 = M14 violation。**為什麼自動**:canonical decisions without integration 會隨時間 drift;session 結束後無 spec anchor = 下 session 忘記;mindset #6「meta 吸收瑣碎」的具體執行形式。 | 2026-04-22 本 session 每個 canonical(chrome-header / dismiss 分家 / avatar hoverCard / popover 14px)都是 user 提醒才整合,AI 只做 code 改動但忘記 spec / CLAUDE.md / memory / hook 同步。根因:AI「做完」的標準只含 code,缺「整合多層」的 procedural rule。M14 若存在,每次 code change 後自動觸發 pipeline,不等 user 第 2 次問 |

| **M15** | **Product UI flow 必須 visual-audit coverable**(設計階段就要考慮)。任何 stakeholder-facing 的 product flow(prototype / exploration / product page / 多步驟 wizard / modal confirm flow 等)**必須**提供 visual-audit 可捕捉的 state snapshot — 每個 flow state 有對應 story / exploration scenario 用 **initial-state pattern**(`defaultOpen` / `useState(true)` / initial-open prop)或 `play()` interaction 讓 Playwright 能截圖。**禁止**留「必須靠真人點擊才能看到的 state」未截圖覆蓋。**違反 trigger**:stakeholder review 時要 live demo 才能看到某個 state / visual-audit 截到的只是 trigger button 而非 overlay。**為什麼**:(1)stakeholder gate(M6)需要完整 visual proof,不是 live demo 即興;(2)跨 session AI audit 必須能跑 visual-audit 才能驗;(3)regression 防護必須對每個 state 有 baseline snapshot。**實作**:新 prototype / exploration 必含 OpenSnapshot 類 stories(對齊 Dialog / Sheet / FileViewer 2026-04-22 canonical);/prototype skill + /product-ui-audit + /delivery-handoff 流程 Phase 強制包含 flow snapshot coverage 檢查。 | 2026-04-22 Sheet / FileViewer 過去只有 trigger button stories,visual-audit 跑 `--scope=component:Sheet` 只截到 trigger 未 open state,被 user 點破「能抓到點擊打開的 modal 嗎?」才補 OpenSnapshot。若 M15 存在,Sheet / FileViewer 新元件建立時就該有 OpenSnapshot,不等 audit 才補 |

| **M16** | **訂 standalone card/pill 容器 canonical 必同步訂 multi-instance gap canonical**。任何元件的**永久視覺層**呈現為 **standalone card/pill**(bg + radius + 不貼父容器邊 inset)時,**必**同時在 spec 訂「多個連續排列時的最小 gap」canonical + **mixed 混合情境決策**(e.g. FileItem Type A + Type B 同 list 取最保守 gap)—— 因為 consumer 寫 `.map()` 時極易漏 gap 造成 card 融合 / bg 塊相連。**核心公式 3 條**(item-anatomy SSOT「連續 item 貼邊合法性」):(1) 同類 standalone card/pill → 必 gap;(2) 同類 permanent flush / transparent → 0 gap 合法(分隔靠 border-b / progress bar / connector);(3) **混合視覺語言 list → 必取最保守 gap**(相鄰兩類 affordance 會互相吸收,分隔線型緊貼 card 型會被 bg 邊界吸收失效)。**不 trigger 的情況**:M3 Nav drawer / Apple Inset Grouped(permanent transparent + state radius)、DataTable / MenuItem(flush + border-b / hover-only radius)。**違反 trigger**:consumer stories / product code 連續 N 個 standalone card/pill 視覺相連 = spec 缺 list-gap canonical,M16 violation。**實作**:(1)元件 spec 加「List wrapper canonical」節,列單一 + mixed gap 值 + rationale + 反例 + code example;(2)hook `check_item_list_gap.sh` P2 block 外框、P1 warn 缺 gap;(3)audit Dim 加「consumer 層 list wrapper 是否正確消費 item gap canonical」;(4)**配套 breathing invariant**:standalone card/pill 在 consumer chrome 內時,chrome 層必有 inner padding(hook `check_container_breathing.sh` P1 warn 攔自建無 padding 容器;SSOT `element-anatomy.spec.md`「視覺容器 breathing invariant」)。**世界級 benchmark 支持**:2026-04-22 掃 Polaris / Material M3 / Atlassian / Ant / Carbon / Apple HIG 6 家共識 — default flush row 0 gap + separator;standalone card stack 才需 gap。**為什麼 state 視覺(hover/focus/selected/active)不獨立寫規則**:跟隨 permanent layer 分類,不獨立觸發 — 瞬時 state 單一啟用不創造相鄰衝突;selected 連續 bg 在 permanent flush/transparent item 是 multi-select feature(Finder / Gmail idiom),在 permanent standalone card 依然必 gap。 | 2026-04-22 FileItem rich `border card` + compact `bg-neutral-3` 先前已訂 canonical,但 spec 只寫**單 item 視覺**沒寫**連續 item gap**,導致 file-upload.stories.tsx rich list 加 `border rounded-lg overflow-hidden` 強制邊框相黏、compact list 無 gap bg 塊連一大片。User 貼圖糾正才發現。若 M16 存在,訂 AR17/AR20 canonical 時同步訂 list-gap,hook 立刻攔截 |

**判斷 meta-principle 是否漏寫的 test**:
- 同類 bug 一年內被糾正 3 次 → meta-principle 漏寫或沒執行,檢討本清單
- 某 bug 跟 16 條中任一條對不上 → 可能要新增第 17 條(跟 user 討論)

**與失敗記憶索引的關係**:Meta-principle 是**上游**(預防)、失敗記憶索引是**下游**(事後記帳)。具體 bug 的歷史詳解移到 `.claude/skills/design-system-audit/references/historical-bugs.md`;CLAUDE.md 只留 meta-principle + 極高 signal 的 one-liner anchor。


# 稽核 6 維 + 2 模式 + 觸發 canonical

稽核是 DS 品質的 gate。本節定義**稽核的維度**、**兩種模式切換條件**、**觸發時機**。搭配 `# Meta-Pattern 預警` M6 一起讀。

## 6 維度

| # | 維度 | 查什麼 | Canonical 來源 / skill |
|---|------|--------|-----------------------|
| D1 | **設計語言一致** | spec canonical / SSOT integrity / 跨元件一致 / pattern 遵循 | `/design-system-audit` / `/baseline-audit` |
| D2 | **程式語言一致** | TypeScript types / import paths / cva patterns / prop 命名 | tsc + lint + `/design-system-audit` |
| D3 | **元件效能** | render 次數 / memo / bundle size / unnecessary re-render | `/performance-audit`(新) |
| D4 | **UX 行為** | keyboard nav / focus trap / a11y / animation timing / interaction canonical | `/ux-audit`(新) |
| D5 | **視覺品質** | 對齊 / 韻律 / 對比 / 邊距 / 不貼邊 / typography hierarchy / 世界級對照 | `/visual-audit`(Layer A mechanical + Layer B AI) |
| D6 | **設計原則自檢**(4 子維)| D6a 合理性(per-item)/ **D6b 一致性 + D6c 無矛盾(必 Phase 0 全掃再判)** / D6d 完整性 — 動 canonical substantive 的提議不自改 | SSOT:`.claude/skills/design-system-audit/references/principle-audit-protocol.md` |

## 2 模式

| 模式 | 使用時機 | 速度 | scope |
|------|---------|------|------|
| **高效**(efficient)| 日常 dev(bug 修 / refactor / 文字改) | 秒級 | `git diff` 動到的檔 + 直接 consumer |
| **進階**(advanced)| Stakeholder-visible 產出 / release cut / token 大改 / 季度健檢 | 分鐘級 | 視情境全 DS 或 full URL,**含完整截圖視覺驗證**(所有 state × size × density × theme 矩陣) |

## 觸發時機(誰必跑、誰可略)

| 情境 | 模式 | 說明 |
|------|------|------|
| 新元件建立 | **進階強制** | Stakeholder 會看到,進階跑才出稿(M6) |
| 元件新功能(新 prop / variant / state) | **進階強制** | 同上;若只動文檔(spec 文字改)可跳 Phase 4.5 |
| 新產品頁 / 比稿 | **進階強制** | 給人看 = stakeholder gate |
| 日常 dev(bug 修 / typo / 小 refactor) | 高效 | `git diff` scoped |
| Release cut / token 大改 / 季度健檢 | **進階 + 全 DS scope** | 跨元件一致性必全掃 |
| Spec-only 改(只動文字無 tsx) | 可略視覺 Phase | 視覺無變 |

**Hook 強制**:`check_stakeholder_visual_audit.sh`(git pre-commit)偵測 diff 含新視覺檔(.tsx / .stories / .css)且未跑進階稽核 → block。

## 一致性類稽核必「Phase 0 先全掃再判」

一致性稽核**必先全 DS scope 掃一輪,再決定要修哪些 / 怎麼修**。個別元件單看必漏系統性 drift:

**案例**(為什麼這條重要):
- 只看 Notice 的 `title → description mt-0.5` 規則 → 漏檢查 Dialog / Tooltip / Coachmark 的相同規則
- 只看 DateGrid today bar → 漏檢查整個 state-stacking 視覺是否完整
- 只看 Checkbox disabled → 漏檢查 Radio / Switch / SelectionItem 的相同視覺

`/design-system-audit` / `/visual-audit` 的 consistency 類 phase **一律 Phase 0 = 全掃 → Phase 1+ = 判 → Phase F = 報告**。無例外。


# 自我升級機制(Claude Code 最佳實務:知錯能改,不斷改善)

本 DS 的治理系統設計為**活文件**,每次 audit / commit / user 糾正都有機制回填到 canonical home,讓出錯率隨時間**降低**而非累積。

## 4 個 feedback loop

### 1. Audit false positive 回填
每次 audit 的 sub-agent 回報 finding 時,若 main agent 驗證為 FP(通常因 scope default / spec rationale / Radix 內建)→ **必回填**到 `.claude/skills/design-system-audit/references/principle-audit-protocol.md` 的「常見 FP 記憶」節 + 視情況 `audit-prompts.md`。

下次 sub-agent 讀 prompt → 看到 FP 記憶 → 同類不再誤報。

### 2. 新 canonical discovery 回填
Audit 發現新的 meta-pattern(例:2026-04-21 Inline Action icon colored host 分兩支)→ 提議 + user sign-off → 寫到對應 `pattern.spec.md` + 視情況 `# Meta-Pattern 預警` 加新條目。

Meta-pattern 長大 = 未來同類 bug 被預警規則吸收,不再靠 case-by-case 修。

### 3. User 糾正回填(critical — 知錯能改)
User 糾正 AI 的判斷 → AI **必**把糾正內容寫到 `memory/` 或 CLAUDE.md feedback anchor:
- 短期(session 內):memory `feedback_*.md`
- 長期(影響所有未來 session):CLAUDE.md 的 Mindset / Meta-Pattern / 具體 rule

判斷 home:
- 「這個 user 的個人偏好」 → memory
- 「這是 DS 本質規則」 → CLAUDE.md / spec
- 「這是 audit skill 的改進」 → audit-prompts / principle-audit-protocol

**本 session 2026-04-21 例**:
- User 抓到「applicable-where-meaningful 是省工 policy」→ revert anatomy-standard + 記入 memory project_world_class_sweep
- User 抓到「audit 沒 scan 矛盾」→ 新建 principle-audit-protocol.md + 更新 D6 定義

### 4. Canonical drift 自動回填
Spec 跟 tsx 不同步(drift) → AUTO 修讓 spec 對齊 tsx(tsx 是 source of truth)+ commit 紀錄 drift 類型供未來分析。

## 每個 audit skill Phase F 強制 step

所有 audit skill 的 final report(Phase F / Phase 4)**強制**包含 "Self-improvement capture" section:

```markdown
## Self-improvement capture
- 新發現 FP pattern: {描述 + 回填位置} OR "無新 FP"
- 新確立 meta-pattern: {描述 + 提議位置} OR "無新 pattern"
- 修完的矛盾 / 糾正: {list + 回填位置} OR "無糾正"
```

**無 learning 的 audit 要寫 "無新 pattern"**(不是省略),確保 step 被執行。

## 自我升級的衡量

| 指標 | 成功訊號 |
|------|---------|
| FP 記憶條目數 | 長但增速遞減(早期每 audit 新增 N,成熟後幾 audit 才新增 1) |
| Meta-Pattern 數 | M1-M15 逐漸擴充,新條目代表根因發現 |
| User 糾正次數 | 同類糾正遞減(meta-pattern 生效) |
| Audit 找到的真 bug 數 | 隨系統成熟遞減 |

**紅旗**:FP 記憶沒長 + user 糾正不減 → 表示 feedback loop 沒跑好,check 是否有 audit skill 漏 Phase F。

---


# 稽核 vs 執行 分權 canonical

**稽核 = 提議,執行 = 人 sign-off**。這是 auto-mode 下最易混淆的邊界。

## 核心公式

```
動 canonical 的 substantive meaning → STOP(提議,等 user sign-off)
對齊 canonical / 表達統一 / 補 pointer → AUTO(直接修)
```

**判斷 substantive 的 keyword**:「canonical」「聲明」「必須」「統一規則」「SSOT」「rationale」「為什麼」「不允許」「禁止」— 觸及這些關鍵字 + 動到 meaning → 觸發 STOP。

## 判斷表(auto vs STOP)

### AUTO-fix(直接修)

| Finding 類型 | 為何 AUTO |
|--------------|----------|
| spec 跟 tsx / cva 不同步(tsx 是 source of truth) | tsx 是 code canonical |
| spec 跟 spec 用詞不一致 **但 substantive meaning 同** | 純表達統一,不改 meaning |
| SSOT pointer 缺 / reciprocal 缺 / dead link | 架構已定 |
| 編號 / 格式 / 排序(anatomy numbering / heading)| 無 substantive 改變 |
| 命名對齊 **既有** canonical(術語 drift 修) | canonical 已定 |
| 某 spec hardcoded class / px 漂移 → 用 token 名或 pointer 取代 | 表達層,不動 canonical |
| Rule A spec prose 移除 class → 遷 anatomy | 職責分離 |
| Scope default pointer 缺(該指 field-controls.spec.md 沒指) | SSOT 已存在 |

### STOP(提議,等 user sign-off)

| Finding 類型 | 為何 STOP |
|--------------|----------|
| spec 聲明原則世界級對照有疑 | 改 substantive |
| 跨 spec 矛盾 **兩邊都有 rationale**(需仲裁哪個對) | 需判斷 |
| 新增 / 刪 canonical rule | canonical scope 動 |
| 命名決策(新 prop value / 新術語) | 命名三 test 後仍需拍板 |
| 原則 scope 擴充 / 收緊 | governance 動 |
| 擴 SSOT 納入新 branch(例:Inline Action「colored host」新分支 2026-04-21) | canonical 擴張 |
| Rationale 存在但疑似過時(實作已改 rationale 沒跟) | 該撤 rationale 還是 revert 實作?需判斷 |

## 為什麼這樣分

- **Canonical 是共識產物**,非個人判斷。Audit 發現 canonical 有疑 → 先提議討論,讓 team / user 拍板
- **AI 自改 canonical 會造成「每次 session 標準漂移」**,失去 DS 一致性 anchor 的意義
- Auto-mode 的 license 是常規執行,**不是修改共識規則**

## 實作體現

- D6 設計原則自檢 scan 走 `.claude/skills/design-system-audit/references/principle-audit-protocol.md` 的判斷公式
- 所有 audit skill 的 report 都有「**提議討論(待 user sign-off)**」專區
- Skill workflow 的 Phase F 必有 STOP 點 + 「Self-improvement capture」step(回填學到的 FP / meta-pattern)


# SSOT 消費 canonical(做 X 前必查 Y)

mindset #2 的**機械化執行清單**。寫任何視覺 code 前,對照本表**列出你查過的家**——沒列等同自創(會被 hook `check_ssot_consultation.sh` 在建新 tsx 時 inject 提示)。

## 視覺決策 → 必查清單

| 決策 | 必查的 SSOT 家 |
|------|---------------|
| **元件選擇**(這該用哪個既有元件?)| `ls src/design-system/components/` + `ls src/design-system/patterns/` + 近親元件 spec |
| **Token / 值**(padding / gap / height / color)| 對應 `tokens/{name}/spec.md` + `tokens/README.md` |
| **Padding / spacing**(chrome vs 元件內 vs 精確幾何)| `# UI 開發規則` 的「Padding source 分層規則」+ `tokens/layoutSpace/layoutSpace.spec.md` |
| **Row / item 結構**(prefix / content / suffix slot)| `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 SSOT) |
| **連續 item list wrapper gap**(多 item `.map()` 是否要 gap?)| `patterns/element-anatomy/item-anatomy.spec.md`「連續 item 貼邊合法性」— **公式**:permanent standalone card/pill(bg + radius + inset)→ 必 gap;permanent flush / transparent → 0 gap 合法。元件專屬 gap 值 + **mixed 混合情境決策表**(e.g. FileItem Type A+B 同 list)查該元件 spec「List wrapper canonical」節(例 `components/FileItem/file-item.spec.md`) |
| **視覺容器 breathing**(自建或 override 帶 bg/border/shadow 的 div)| `patterns/element-anatomy/element-anatomy.spec.md`「視覺容器 breathing invariant」— 有視覺邊界的容器(bg/border/shadow 三擇一)**必有 inner padding**(rule),具體值建議 `--layout-space-*` / `px-3` 等(guide)。責任在父容器,子元件 w-full responsive 不變 |
| **Dismiss / inline action / overflow menu**| `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss 按鈕 canonical」+「Inline Action 設計規格」+「常用 icon canonical」 |
| **按鈕排列 / 群組 / 分隔**| `patterns/action-bar/action-bar.spec.md` |
| **Header 高度 / chrome padding**| `tokens/uiSize/uiSize.spec.md`(`--chrome-header-height`)+ `tokens/layoutSpace/layoutSpace.spec.md` |
| **Chrome header 選型**(fixed-h vs padding-based)| `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」— DS-wide SSOT entry,含 decision tree + 8 家世界級對照 + 本 DS 分類查核表 + 新元件 checklist |
| **Overlay chrome dismiss / unbounded button**| `patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical v5」— v5 data-unbounded layout-slot trick 實作細節 |
| **Overlay title size**(modal 16 vs non-modal 14)| `patterns/overlay-surface/overlay-surface.spec.md`「Overlay title typography canonical」— modal(Dialog/Sheet text-body-lg 16px)vs non-modal(Popover/Coachmark text-body 14px);7 家世界級對照 + 跟 density 鎖 md 同源 rationale |
| **Form field gap**| `components/Field/field.spec.md` +「layoutSpace 規則 3:fw↔non-fw = tight」 |
| **Icon 選擇 / 尺寸**| `# 元件 Props 命名原則` 的「常用 icon canonical」+ `# UI 開發規則` 的「Icon size 來源分層規則」 |
| **浮層 header / body / footer**| `patterns/overlay-surface/overlay-surface.spec.md` |
| **Scrollbar / 滾動**| `components/ScrollArea/scroll-area.spec.md` +「horizontal-overflow pattern」 |
| **Variant / prop 命名**| 既有元件 `variant=` 值 grep + `# 命名與語言一致性`「命名必過三重 test」 |
| **State 視覺(selected / disabled / hover)**| `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」 |

## 強制 Checklist(寫新 tsx 前,在元件 top-of-file 註解列出)

新元件 / 新 feature 的 tsx 開頭**必須**有註解段落列出消費的 SSOT:

```tsx
/**
 * {Component} — {定位一句話}
 *
 * ── 定位 ──
 * {...}
 *
 * ── 實作基礎 ──
 * 消費:{List components / primitives used}
 * 對應 pattern:{patterns/xxx}
 *
 * ── 消費的 SSOT ──
 * - components: [Button, Input, ItemInlineAction, ...]
 * - patterns: [item-anatomy, action-bar, overlay-surface]
 * - tokens: [--layout-space-loose, --chrome-header-height, --field-height-md]
 * - spec refs: {近親 spec 清單}
 */
```

**Hook `check_ssot_consultation.sh`(Write 新 tsx 到 `src/design-system/components/` 或 `src/explorations/`)→ 若檔內無上述註解區 → warn 要求補齊**。

## 禁止:隱性自創

下列行為等同自創(就算沒宣告新命名):
- 自寫 `h-14` / `h-12` 等 chrome 高度(應用 `--chrome-header-height` token)
- 自寫 `gap-3` 當 toolbar 按鈕群 gap(應查 `patterns/action-bar` canonical)
- 自寫 `<button aria-label="Close"><X /></button>` 作 dismiss(應用 `ItemInlineAction` action `{ icon: X, label: ..., onClick }`)
- 自寫 Row `<div><Icon /><span>label</span><Button /></div>`(應用 `<MenuItem>` + slot components)
- 自訂 Input `variant="custom-name"` 未先 grep 既有 variant 值
- 在 Toolbar 用 `<input className="bg-transparent border-0 ...">`(應用 `<Input variant="bare">` 如果既有;若無 → Ambiguity Protocol)


# 任務導航表（做 X → 讀 Y）

接到任務後先對照這張表，找出必讀章節再動手。**章節名即 `#` heading**，可用 grep 直接跳。

| 任務類型 | 必讀章節（按順序） |
|---------|-----------------|
| **新增元件** | `# 建立 UI 前必讀` → `# shadcn 元件規範` → `# Spec 規則` → skill `/component-quality-gate` |
| **修改元件 variant / size / state** | 該元件 `spec.md` → skill `/story-writing`(Phase 4 連動) |
| **改 cva `defaultVariants`** | skill `/story-writing` Phase 4 高風險漂移點 |
| **新增 / 修改 token** | `tokens/README.md` charter → `# Token 命名原則` → 對應 `tokens/xxx.spec.md` |
| **新增 / 修改 pattern** | `patterns/README.md` charter → `# 建立 UI 前必讀` → 對應 `patterns/{name}/spec.md` |
| **寫任何 story** | skill `/story-writing`(含 anatomy 標準 + 範例選擇 + 自我檢查) |
| **跨元件比較 / 加 SSOT pointer** | `# Spec 規則` → SSOT 規則與 anchors 清單 |
| **命名新檔案 / 變數 / prop** | `# 命名與語言一致性` + `# 元件 Props 命名原則` |
| **新元件的內部 layout 選型** | `# 系統內部 Layout — 4-Family Model` 判斷流程 → `patterns/element-anatomy/element-anatomy.spec.md`(完整 taxonomy) |
| **新 row / item 元件的結構(Family 1+2)** | `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 row 結構 SSOT) |
| **新 skill / hook / command** | 對應 `.claude/{home}/README.md` charter → `design-system-audit/references/rule-placement.md` |
| **建立新 chrome header**(modal / toolbar / sidebar / overlay header)| `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」— decision tree(fixed-h 剛性 vs padding-based 彈性)+ 8 家世界級對照 + 新元件 checklist |
| **無明確前例的設計決策** | `# 遇不確定時的協議`(先 grep → 讀近親 spec → 仍不確定就問) |
| **提設計建議 / 給 option A/B/C** | 本表對應 task 行找到「讀 Y」→ grep 所有可能 relevant 的家(patterns / 近親元件 spec / tokens / memory feedback / `# Meta-Pattern 預警` / skill references),**每個 option 必含「DS canonical(spec:line 或 token name)」+「世界級對照」兩件**;只給世界級 = 螺絲鬆(memory `feedback_recommendation_must_grep_ds`) |
| **Tailwind / CSS 出怪事** | `# Tailwind 使用規則` + `# 失敗記憶索引` 技術陷阱 anchor |
| **寫任何視覺 code 前** | `# SSOT 消費 canonical` 對照表列出查過的家 |
| **Stakeholder-visible 產出**(新元件 / 新功能 / 新產品頁 / 比稿) | `# 稽核 6 維 + 2 模式 + 觸發 canonical` → 進階強制 |
| **稽核結論 = 修實作 or 改原則?** | `# 稽核 vs 執行 分權 canonical`(auto vs STOP 判斷公式 + 表) |
| **跑 D6 設計原則稽核** | `.claude/skills/design-system-audit/references/principle-audit-protocol.md`(4 子維 scan + 判斷表 + FP 記憶) |
| **User 糾正 AI 後** | `# 自我升級機制`(判斷 home + 寫到 memory / CLAUDE.md / skill reference) |
| **spec 跟 code 結論衝突** | `# Spec 規則`(主動提出討論,不默默改) |
| **在 classification-sensitive dir 建新檔** | **先 Read 該 dir 的 `README.md` charter**(硬規則,見 `# 規則分層`) |

**找不到對應的任務類型** → 進 `# 遇不確定時的協議`，不要自己決定讀什麼。

---

# 專案規則

本專案使用：

- Vite + React + TypeScript
- Tailwind CSS v4（@tailwindcss/vite）
- shadcn/ui 元件庫
- Storybook
- 自訂 Design Token 系統

專案必須可以正常啟動。

必要檔案：

- index.html（位於專案根目錄）
- src/main.tsx
- src/globals.css
- vite.config.ts
- package.json
- tsconfig.json

若缺少上述檔案，請先建立再進行其他修改。


# 規則分層（8 個 home，寫任何新規則前先決定位置）

設計系統的知識分 8 個 home。**寫任何新規則、新文件、新協議前,先跑下方「放哪裡 decision flowchart」——不要全部塞進 CLAUDE.md**。

## 8 個 home(一行索引)

| Level | Home | 收什麼 |
|-------|------|--------|
| 1 | `CLAUDE.md` | 每 session signal 的 DS 規則 / 技術陷阱 / 架構判斷框架 |
| 2 | 元件 `{name}.spec.md` | 單元件的「何時用 / 為什麼」設計規則 |
| 3 | Pattern `spec.md`(`src/design-system/patterns/`) | **runtime** 跨元件佈局 / 互動 primitive(非文件指南) |
| 4 | Code(`.tsx` / `.css`) | cva / 型別等機械強制的實作細節 |
| 5 | Skill(`.claude/skills/*/SKILL.md`) | **只在 invoke 情境**的多步驟 workflow + checkpoint |
| 6 | Memory(`~/.claude/.../memory/`) | 跨 session 狀態(audit progress / tech debt / user pref) |
| 7 | Hook(`.claude/hooks/*.sh`) | 可機械化的 pre/post tool 自動檢查 |
| 8 | Slash Command(`.claude/commands/*.md`) | 一次性單步 action(目前無 commands) |

當前 9 skills:`/design-system-audit` / `/product-ui-audit` / `/prototype` / `/delivery-handoff` / `/component-quality-gate` / `/story-writing` / `/visual-audit` / `/performance-audit` / `/ux-audit`。當前 16 hooks:`pre_edit_spec_check` / `pre_new_component_spec` / `enforce_home_charter` / `check_ssot_consultation` / `check_story_anatomy` / `check_third_party_dom_verified` / `check_sync_update` / `check_token_hygiene` / `check_cva_default_sync` / `check_anatomy_section_numbering` / `check_sideoffset_canonical` / `check_avatar_hovercard` / `check_item_list_gap` / `check_container_breathing` / `block_prototype_imports` / `stop_tsc_sanity`。

各 home 完整 scope / 「收什麼、不收什麼」細節 / 未採納能力(sub-agent / MCP / output-style)評估 → `.claude/skills/design-system-audit/references/rule-placement.md`。

## 硬規則:classification-sensitive dir 的 charter gate

**Write 新檔到以下 dir 前,必先 Read 該 dir 的 `README.md` charter:**
- `src/design-system/patterns/` / `components/` / `tokens/`
- `.claude/skills/` / `hooks/` / `commands/` / `agents/`

每個 charter 明列「這裡只收 X / 不收 Y / 新增 criteria」。`enforce_home_charter.sh` hook 在 Write 新 subdir / flat file 時自動注入 charter 到 context,AI 必須依 charter 的三題 verification(收?不收?過 criteria?)判斷後才 proceed。**misclassification 在 tool 時被攔截,不靠 AI 記憶**。

## 放哪裡 decision flowchart

**從 Q1 開始回答,第一個 YES 就是家**:

```
Q1. 是設計規則嗎?(如何寫 spec / code / token / story / pattern)
    → YES: 進 Level 1-4(按影響範圍 + 判斷法)
    → NO: 繼續 Q2

Q2. 只在「特定 invoke 情境」才需要嗎?(audit / code review / setup 等)
    → YES 且是**多步驟 workflow + user 決策點**: Skill(SKILL.md + references/)
    → YES 且是**一次性單步 action**(scaffold / 單一 check): Slash Command(.claude/commands/*.md)
    → NO: 繼續 Q3

Q3. 是「隨時間變化的狀態」嗎?(已完成 / 待辦 / 決策紀錄 / user 偏好)
    → YES: Memory
    → NO: 繼續 Q4

Q4. 能用 script「機械化自動執行」嗎?(pre/post tool)
    → YES: Hook
    → NO: 繼續 Q5

Q5. 是 CLAUDE.md / SKILL.md 已有項目的「深層細節」嗎?
    → YES: Skill `references/*.md` 或 spec.md(視上層所在)
    → NO: **不合任何 home——重新思考 scope 或 ask user**
```

## CLAUDE.md vs Skill 的 signal-to-noise 原則

- **CLAUDE.md 每次對話都載入**——每加一條規則都增加 AI 掃描成本。**只放每次都需要 signal 的 DS 規則**。
- **Skill 只在 invoke 時載入**——audit / workflow / interaction protocols 放這裡不污染每次對話。
- **不對家**:把 audit protocol 放 CLAUDE.md → 每次對話都讀 audit-only 內容 = 噪音;把 DS 規則放 Skill → audit 以外的 session 讀不到 = 遺失 signal。

## 搬動規則的雙向處理

規則從任一 home 搬到另一 home,**原位置必須留一行指標**(「詳見 X」);反之亦然。規則有家、也有路標。

歷史放置案例(含錯放修正)/ 本 session 12 條搬家紀錄 → `design-system-audit/references/rule-placement.md`。


# 遇不確定時的協議（Ambiguity Protocol）

**專案最常發生的錯誤是「AI 憑直覺造新 pattern」(延伸 mindset #2「不憑直覺發明」+ #5「猶豫就問」)。** 遇到無明確前例的設計決策或實作選擇時,**強制按以下順序**處理,禁止跳步、禁止憑感覺往前:

## Step 1 — `grep` 既有 pattern

先假設「這個決策專案一定做過」，花 30 秒搜尋：
- 命名類（gap / padding / 檔名 / prop） → `grep` 同類元件的既有值
- 設計決策類（變體 / 狀態 / 互動） → `grep` 最近親元件的 spec.md
- Token 類 → 查對應 token spec.md
- Pattern 類 → `ls src/design-system/patterns/`

**找到就沿用**，不是「看起來順」才改。找到但明顯不合理 → 進 Step 3，不自己改。

## Step 2 — 讀近親元件的 spec.md

若 Step 1 沒找到完全對應，找「最近親元件」（同 family、同 pattern、同職責）的 spec.md 完整讀一次，檢查：
- 它的設計決策是否可類推到當前問題？
- SSOT anchor 是否有談到這類情境？
- 它的「禁止事項」是否隱含了某個規則？

**可類推就直接套用**並在 spec 寫「對齊 X 的 Y 規則」建立反向引用。

## Step 3 — 仍不確定就停下來問使用者

Step 1 + 2 後仍無清楚方向時，**禁止自己決定**。停下來回報使用者：
- 「找到的既有 pattern：A / B」
- 「我傾向 A 因為 X，但 B 也合理」
- 「你的偏好？」

**禁止的行為**：
- ❌ 跳過 grep 直接憑記憶造新值
- ❌ 為了「做完」在兩個選項之間隨便挑一個
- ❌ 發明新的 suffix / prefix / 命名慣例
- ❌ 在 spec / code 裡留下「TODO 待確認」而照樣往前

## 何時可以不走協議

以下情境可跳過（不算「無前例」）：
- Bug 修復（code 和設計都已定，只是執行錯）
- 純機械勞動（import 路徑修正、typo、格式一致化）
- 使用者已明確指示要做 X


# 失敗記憶索引(meta anchors only)

**本索引只留 meta-pattern 層 anchor,具體 bug 歷史詳解移到 `.claude/skills/design-system-audit/references/historical-bugs.md`**。

**判 bug 該寫哪**:
- 能歸納為 Meta-Pattern M1-M15 之一 → 不寫本索引(已被 meta 吸收)
- 無法歸納 + 純技術沉默陷阱(tailwind v4 / 特定 lib 怪癖)→ 寫本索引一行 + pointer
- 具體 bug 歷史(何時、誰、怎麼發生)→ `.claude/skills/design-system-audit/references/historical-bugs.md`

## 技術陷阱 anchors(純沉默技術陷阱,非設計判斷類)

| 類別 | 一行 anchor | 詳細位置 |
|------|-----------|---------|
| Tailwind v4 `[--foo]` 必 `var()` | 不被自動包 var,silent 失效 | `# Tailwind 使用規則` |
| tailwind-merge 自訂 utility 註冊 | 不註冊 → group 誤判 strip | `# Tailwind 使用規則` |
| 元件自包 Provider | shadcn 原版 Sidebar 帶 TooltipProvider 劫持全站 | `# shadcn 元件規範` |
| 清 unused imports 後 runtime | tsc 不充分,需 storybook | `# UI 開發規則` |
| shadcn compat alias 回流 | `bg-popover` / `text-muted-foreground` 等 | hook `check_token_hygiene.sh` |
| Tailwind `shadow-md/lg` 繞 elevation token | dark mode 不聯動 | hook `check_token_hygiene.sh` |

## 設計判斷類 bug → 全部歸 Meta-Pattern 吸收

| 歷史 bug | 歸屬 Meta-Pattern |
|---------|------------------|
| Hand-craft 繞 DS canonical(Input loading / Empty / DataTable / FileViewer dismiss) | **M1**(視覺決策前必消費 SSOT) |
| react-day-picker `data-range-*` 不存在 / wheel step 錯 / fit-to-page 算法錯 | **M2**(消費 3rd-party lib 必驗 DOM) |
| DropdownMenu dark subtree 變亮 | **M3**(Portal 逃逸 subtree context) |
| Checkbox in CheckboxGroup 共用 id / label 抑制 | **M4**(Group 必隔離 fieldCtx) |
| today + selected bar 色隱形 / hover + disabled ring | **M5**(state 疊加必 spec 聲明) |
| FileViewer 初版視覺不整齊上給人看 | **M6**(stakeholder gate 強制進階稽核) |
| cva defaultVariants 三方漂移(SegmentedControl) | `/story-writing` Phase 4 + hook `check_cva_default_sync.sh` |
| Row 硬寫 `py-2` 產生 gap / asChild avatar 全寫 24px | item-anatomy spec + hook `check_story_anatomy.sh` |
| HoverCard 誤放 Components/ / Chip 誤列 field-height family | `# Story` Internal vs Components + `tokens/uiSize` Family 清單 |

## 規則

- **新 bug 確認後**:先判能否歸 Meta-Pattern M1-M15。能 → 不寫本索引(meta 已吸收);不能 → 一行 anchor + 對應章節 pointer
- **具體事件歷史**:寫到 `.claude/skills/design-system-audit/references/historical-bugs.md`
- **索引條目過期**(風險消失)→ 移除並在 commit 訊息記錄
- **條目超過 10 條 warning**:代表 meta-principle 漏寫(回看 `# Meta-Pattern 預警` 是否要新增第 16 條,跟 user 討論)


# 命名與語言一致性（Meta 規則）

**本節是 meta 規則**——影響所有後續命名決定（檔案、資料夾、變數、spec 章節、story、API prop）。建立任何命名前先讀這節。

## 命名前必查既有 pattern

建立任何名稱前，**必須先 `ls` / `grep` 既有 pattern**，嚴格對齊不憑直覺。**本專案的命名慣例依類別而分，不是「全部 kebab-case」**——codify 世界級 DS 的分類慣例：

### 檔案 / 資料夾

| 類別 | 慣例 | 範例 |
|------|------|------|
| 元件資料夾 | PascalCase | `Button/`、`DatePicker/`、`NumberInput/` |
| 元件檔案 | kebab-case | `button.tsx`、`date-picker.tsx`、`number-input.tsx` |
| Pattern 資料夾 | kebab-case | `item-anatomy/`、`action-bar/`、`horizontal-overflow/` |
| Pattern spec 檔 | kebab-case(與資料夾同名) | `item-anatomy.spec.md`、`action-bar.spec.md` |
| Pattern 內多檔 flat 並列 | folder 為 topic 領域,含 overview + 具體 topic 各自檔案 | `element-anatomy/`(folder)內 flat 放 `element-anatomy.spec.md`(taxonomy overview)+ `item-anatomy.spec.md / .tsx / .stories.tsx`(F1/F2 具體) |
| Hooks 資料夾 | lowercase | `hooks/` |
| Hooks 檔案 | kebab-case（對齊 shadcn） | `use-is-mobile.ts`、`use-overflow-items.ts` |
| Token 資料夾 | 單字 lowercase / 多字 camelCase | `color/`、`radius/`；`uiSize/`、`layoutSpace/` |
| Token 檔案 | 與資料夾同名 | `color.css`、`uiSize.css`、`layoutSpace.spec.md` |

**分類原因**：
- 元件 PascalCase folder + kebab-case file 是 shadcn / Chakra / Ant Design 共通做法——folder 對應 React 元件名（PascalCase），file 符合跨平台 filesystem 友善
- Hooks 對齊 shadcn 的 kebab-case 慣例
- Token 資料夾沿用 CSS `--token-name` 的多字構詞風格（單字不需要 case，多字用 camelCase 反映 `--uiSize` 概念整體）

### 程式 identifier

| 類別 | 慣例 | 範例 |
|------|------|------|
| React 元件 / TypeScript type | PascalCase | `MenuItem`、`ItemIcon`、`ItemAvatar`(slot components) / `ItemIconProps` |
| 函式 / hook / 本地變數 | camelCase | `useOverflow`、`itemCount` |
| CSS custom property | kebab-case | `--field-height-md`、`--ui-size-24` |
| Tailwind class | 既有 utility 優先；自訂 kebab-case | `text-body-lg` |

### 文件內容

| 類別 | 慣例 | 範例 |
|------|------|------|
| Spec 章節標題 | 繁體中文（約定俗成英文術語例外）| 「何時用」、「禁止事項」；例外：Props / API / Token / CSS |
| Spec H1 標題 | `# {元件名} 設計原則` | `# Button 設計原則` |
| Story 標題 path | `Design System/Components/{ComponentName}/{中文子頁}` | `Design System/Components/Button/設計原則` |
| Story 變數名 | `{Concept}Rule`（principles）/ 簡短名詞（showcase） | `VariantRule`、`Modes` |

### 建立新類別時

先在 CLAUDE.md 現有清單（「技術架構概覽」、`# Story` 的「三層定位」、本節各表）找**相似類別**的命名模式，**沿用**，不自創新 suffix / prefix。例：新 pattern → kebab-case；新元件 → PascalCase folder + kebab-case file。

## 語言一致性（critical）

- **本專案 spec.md 原則繁體中文**（技術術語保留英文,見命名表例外）
- **Code identifier 一律英文**（約定俗成）
- **單一檔案內註解統一語言**——中文檔註中、英文檔註英，不中英夾雜
- **同一段落不跨語言**——spec 裡「Rule A」「判斷法 A」擇一，不兩種並存

## 命名必過三重 test（世界級命名 governance）

**任何新命名**（variant / mode / prop value / token / 元件名 / section 名）**必須同時通過以下 3 個 test**：

1. **既有設計語言 test**：與本專案現行命名模式對齊嗎？
   - 跟 Button variant / Tag 分類 / Badge variant 等 existing prop-value 的命名風格一致？
   - 跟 CLAUDE.md 既有詞彙（`compact / rich / sm / md / lg / action / indicator / scanning / reading` 等）沿用而非發明？

2. **世界級 idiom test**：至少 2 個 world-class DS 用此詞嗎？
   - 對照 Polaris / Material / Atlassian / Ant Design / Carbon / Apple HIG / Discord / Slack / Notion
   - 「大家都用這個詞,consumer 一看就懂」才算世界級
   - 孤立發明的詞（即使意思對）不算世界級

3. **跨元件認知衝突 test**（最容易被忽略）：同一 string 在其他元件是否已有不同語義？
   - 例：`text` 是 Button `variant="text"`（文字樣式按鈕）—— 若 FileItem 用 `mode="text"`（文字為主呈現）就是語義衝突,consumer 會混淆
   - 例：`compact` 在 Tag size 和 FileItem mode 都是「緊湊」意思 —— OK,一致
   - grep 既有 prop value,確認同字不撞語義

**三個 test 全過才採納**。有一個不過:改詞或標示明確區隔(加 prefix / 改語境)。

**本 session 曾發生的 bug**: FileItem mode 最初差點用 `text / picture`（Ant Design idiom,世界級 ✓,既有語言 ✓),但撞 Button `variant="text"` 語義衝突 → 改為 `compact / rich`(三 test 都過)。

## 禁止事項

- ❌ 憑直覺命名(見 mindset #2「不憑直覺發明」命名面向)——必先 `ls` / `grep` 既有 pattern
- ❌ 為突顯新功能用非常規命名——新元件名必須對齊既有元件家族
- ❌ 一個檔案裡註解中英夾雜
- ❌ 複合詞用底線 / PascalCase 命檔(`ItemAnatomy.spec.md` 錯,`item-anatomy.spec.md` 對)
- ❌ 自創 spec 章節標題格式（既有 spec 用「何時用」就不要另寫「When to use」/「何時該使用」）
- ❌ 對新元件用新的 suffix（既有都是 `.tsx` / `.spec.md` / `.stories.tsx` / `.anatomy.stories.tsx` / `.principles.stories.tsx`，不自創如 `.design.md` / `.tokens.tsx`）


# 技術架構概覽

```
src/
├── globals.css             ← Tailwind v4 入口 + CSS token bridge
├── lib/utils.ts            ← cn()(clsx + tailwind-merge)
├── hooks/                  ← app-level React hooks
├── design-system/
│   ├── README.md           ← DS 入口 + 各子 dir charter 索引
│   ├── hooks/              ← DS 共用 React hooks(use-overflow-items / use-is-mobile)
│   ├── tokens/             ← charter: tokens/README.md
│   ├── components/         ← charter: components/README.md(PascalCase folder 一元件一家)
│   └── patterns/           ← charter: patterns/README.md(runtime UI primitive)
└── explorations/           ← 未定案 prototype 比稿
```

**目錄以實際檔案系統為準**。查看元件 / pattern / token 清單前先 `ls` 對應 dir。各子 dir 的 charter(收什麼 / 不收什麼)寫在該 dir 的 `README.md`——建立新檔前必讀(見 `# 規則分層` 硬規則)。

Internal primitive vs public-facing 元件的分類 test 見 `components/README.md` 及 Storybook title 命名(`# Story` 章節)。


# Token 系統運作方式

**純 CSS token(無 JS 需求)**:`color/` `typography/` `uiSize/` `layoutSpace/` `opacity/` `radius`。初始狀態 `<html data-theme="light" data-density="md">` 在 `index.html` 設;動態切換操作 `documentElement.setAttribute('data-theme', 'dark')` 即可。JS 端用 `var(--token-name)` 字串。

**完整檔案清單 + dark mode selector + density 切換機制** → `src/design-system/tokens/README.md`(charter)。


# Spec 規則

- **回答任何設計問題前，必須先讀取所有相關的 spec.md**，以實際內容為基礎，不憑記憶回答
- **每次回答必須有邏輯、有架構、符合世界級設計水準**——不提出未經深思的建議，不為了回答而回答
- **對標世界級 DS（mindset 層）**：編輯任何 spec 或建立新元件時，必須對照 **Polaris / Material / Ant Design / Atlassian / Carbon / Apple HIG**，檢查本專案是否缺少下列判斷維度——**「何時用 / 何時不用」、「與近親元件的分界」、「常見誤解」、「相關元件 links」、「空值呈現」、「驗證時機」、「Loading / 無障礙預設」**。有缺口主動提出討論，**不要假設「沒寫 = 不需要」**。SegmentedControl spec 是本專案的 template（完整實踐此 pattern）
- **Spec 結構對齊 SSOT（Single Source of Truth）**：跨元件比較由**一個 spec own 完整內容，其他 spec 用一行 pointer 指回**。規則如下：

  **何時需要 SSOT（深度比較）**：
  - 多維度分析（如「與 X 的分界」分多個角度討論）
  - 情境對照表超過 3 rows
  - 涉及另一個元件的內部機制或權衡
  
  **何時不需要 SSOT（本地引用即可）**：
  - 「何時不用」表格中一行帶過（「改用 X」+「原因」一句話）——兩側並存不會漂移
  - 「相關」links section 列出相關元件
  - 只描述自己元件的 props / variants / 內部 state
  
  **Ownership 判斷順序**：
  1. 通用預設元件 own（Select owns vs RadioGroup、Input owns vs NumberInput——因為通用者是 fallback）
  2. 若一側 spec 明顯更深、另一側是薄 wrapper → 深側 own（Tabs owns vs SegmentedControl）
  3. 若兩側對等、都需要此判斷 → 按字母序決定 anchor，避免循環爭議
  
  **執行規則**：
  - Own 方寫深度 section；被指方寫一行 pointer（**reciprocal 必須存在，不可單向**）
  - Pointer 必須明確指出 anchor spec 和該 spec 的 section 名稱
  - 本專案目前的 SSOT anchors：
    * Tabs vs SegmentedControl → `tabs.spec.md`「Tabs 與 SegmentedControl 的分界」
    * Select vs RadioGroup → `select.spec.md`「與 RadioGroup 的分界」
    * Checkbox vs Switch → `checkbox.spec.md`「與 Switch 的分界」
    * HoverCard vs Tooltip → `hover-card.spec.md`「與 Tooltip 的分界」
    * Row primitives 共用 → `patterns/element-anatomy/item-anatomy.spec.md`
    * Field Controls 共用 → `components/Field/field-controls.spec.md`
  
  **禁止事項**：
  - ❌ 兩個 spec 都寫完整對照（保證漂移）
  - ❌ 建立孤立 `xxx-selection.spec.md` 或 `xxx-comparison.spec.md` 承載比較——世界級 DS 都把比較放在元件 spec 內
  - ❌ 單向指向（A 指向 B，B 沒指回 A）
  - ❌ Pointer 只說「見 X spec」不說 section 名稱——讀者必須掃整份 spec 才找得到
- **編輯 spec.md 時，必須交叉比對所有相關的 spec.md 與 Storybook 範例**，確認無矛盾、無術語不一致、無重複定義
- **若結論與既有 spec.md 有邏輯衝突或概念混淆，必須主動提出討論**，不默默修改、不迴避矛盾
- **所有元件必須遵循 shadcn 框架**，確保保留 shadcn 的結構優勢（forwardRef、Slot、data-* attributes、cva 等），不從零重寫
- **每個元件 spec 的「定位」段落必須明確宣告實作基礎**——`基於 Radix X`、`基於 cmdk` / `sonner` / `@tanstack/react-table` / native HTML element、或 `自建 + 理由`。自建必須說明為什麼不用現有 primitive（通常是「選 native 保留 mobile / a11y」這類設計選擇）。本規則是為了讓任何人讀 spec 第一段就知道這個元件的 shadcn / Radix / 自建 屬性,不需要去看 code
- **spec.md 與 .tsx 的職責分離**：spec 只記錄設計原則（「為什麼」和「何時用」），讓 AI 能舉一反三推導邊緣情況；可程式化的規則（具體 token class name、pixel 值、條件邏輯）寫進元件 .tsx，不寫在 spec 裡。判斷標準：「這條規則能直接變成 code 嗎？」能 → .tsx；不能、需要人類判斷 → spec
- **可推導的值用 `calc()` 或公式表達，不硬寫結果**——讓依賴關係留在 code 裡，上游值變動時下游自動跟著算。例：divider 內縮 = `(行高 - 文字行高) / 2`，改行高時 divider 自動調整，不需要有人記得去改
- **Spec 文字品質**：不描述視覺形狀或實作細節（「窄長形」「會變寬」「zero layout shift」這類視覺字眼屬於 story 視覺化的工作，不進 spec）；同一概念不混用兩個名稱（術語一致）；「禁止事項（❌）」章節必須列出所有常見誤用
- **Spec 邊界案例覆蓋**：適用的狀態必須有明確說明——disabled / loading / empty、dark mode / density 行為、icon-only 使用規則。不適用則明文標注「本元件無 X 狀態」，不沉默省略。
  
  **Scope 預設（減少重複）**：
  - **Field 家族元件**（Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea / Switch / Slider / SegmentedControl / Checkbox / RadioGroup）→ 可直接寫「Mode / disabled / readonly 詳見 `field-controls.spec.md`」，不必逐條重寫
  - **Dark mode 行為**：若元件單純透過 semantic token 切換（無自訂 palette），可直接寫「Dark mode 由 semantic token 自動處理（見 `color.spec.md`）」
  - **Density 行為**：若元件使用 `--field-height-*` 或 `--layout-space-*` token，可直接寫「Density 由 token 自動切換」
  - **純 wrapper 元件**(無自己的互動狀態,如 Separator / Skeleton / CircularProgress / ProgressBar)→ 「本元件無互動狀態」一行帶過
  
  元件特有（non-inherit）的狀態表現必須展開寫；繼承自 family / token 的行為點 pointer 即可


# Consistency Audit 原則（canonical + rationale-for-deviation）

**任何宣稱「跨元件要一致的事」必須三件套齊全:**

1. **Canonical 要明確指向**——CLAUDE.md 某段、某 spec.md、某 skill reference。不可只存在於口頭或直覺。
2. **偏離 canonical 的元件要在自己 spec.md 記 rationale**——不是每個元件都必須一致，但「不一致」必須可追溯為什麼。沒寫 rationale = drift，不是故意設計。
3. **Audit 檢查公式**：`actual == canonical OR (actual != canonical AND spec.md 有 rationale)`。任一 audit 只要它在查「X 是否跨元件一致」，都必須按這個公式走。

**為什麼**：設計系統的品質不是「所有元件都長一樣」，而是「任何差異都有原因可追」。沒有 canonical 就沒有一致性可言；沒有 rationale 機制，一致性會變成僵化。

**已套用 canonical 的面向**：
- Anatomy story `export const` 名稱 → `/story-writing` anatomy-standard.md
- Spec.md 七維度 → `# Spec 規則`
- cva defaultVariants 三方標記 → anatomy-standard.md 高風險漂移段
- Token 命名 namespace + role → `# Token 命名原則`

**新增 consistency 類訴求前的判斷**：
- 能在 CLAUDE.md / spec.md / skill 某處清楚指一段當 canonical?→ 可以寫成規則
- 偏離的元件能在自己 spec.md 說清楚為什麼?→ 可以寫成規則
- 兩者任一做不到 → 這不是 canonical，是風格偏好，不要寫進 governance


# 稽核三級 policy(stakeholder-gate / daily dev / periodic deep)

**核心原則**:任何 stakeholder-visible artifact(prototype 比稿 / 元件 merge / 產品 demo)**必須已過 code + visual 雙層 audit**。日常 dev 用 scoped 高效稽核;DS-wide full audit 僅 release / token 大改 / 季度健檢才跑。

| Tier | Trigger | Scope | 實作 |
|------|---------|-------|------|
| **1. Stakeholder-gate**(mandatory,code + visual) | prototype 比稿前 / 元件 ready for merge / 產品 demo 前 | scoped to 該 artifact(單元件 / candidate stories / 產品 URL) | `/prototype` Phase 3.5 / `/component-quality-gate` Phase 4 Ship / `/product-ui-audit` Phase 5 三個 skill 的 stakeholder gate 強制 chain `/visual-audit` |
| **2. Daily dev**(高效 scoped) | 日常改動(spec wording / 單元件 tsx / 小 refactor) | `git diff` 動到的 component + direct consumer | `scripts/visual-audit.mjs --scope=changed`(default);所有 audit skill 預設此 scope |
| **3. Periodic deep**(偶爾全掃) | Release cut / token 改動 / 大 refactor / 季度健檢 | full DS-wide code + visual | `/design-system-audit --deep`(或 CLI `--scope=all`);年度 2-4 次 |

**實作對照**:
- Scope CLI:`scripts/visual-audit.mjs` 支援 `--scope=changed | component:<name> | all` 和 `--urls=<csv>`(產品 app route)
- Skill 強制 chain:`/prototype` `/component-quality-gate` `/product-ui-audit` 在 stakeholder-gate phase 必 auto invoke `/visual-audit`,不能跳
- Daily 不阻塞:working tree 乾淨 + 無動 component → `--scope=changed` 返回 0 scenario,exit 0 不擋流程

**禁止**:
- ❌ Stakeholder-facing artifact 沒過 visual audit 就給 review(違反 Tier 1 鐵律)
- ❌ 日常改動硬跑 full DS audit(浪費時間 + 真正要 gate 時 developer 會跳過)
- ❌ 週期性 deep audit 被無限期推遲(季度至少 1 次,寫進 team ritual)

**世界級對照**:Figma、Google Material、Shopify Polaris 都走相同三級 — stakeholder gate 強制、daily 高效、release 前 full sweep。

## 稽核 Canonical 優先順序(衝突解決 ladder)

任何 audit(code / visual / mechanical / AI judgement)發現 finding,按以下優先順序判定是否違規:

1. **WCAG mechanical floor**(最高,不可違反)
   - a11y 法規硬底:對比度、keyboard navigation、ARIA 正確性
   - **例外**:WCAG 2.1 自帶豁免條款(incidental text / disabled UI / logotype / decorative image),Layer A 掃描要實作這些豁免,不把 disabled text 誤報
2. **本 DS spec + CLAUDE.md canonical**(次高)
   - `spec.md` / `CLAUDE.md` / `.claude/references/` 明示的規則
   - 元件有 documented rationale 偏離 = `deviation ✓`(見「Consistency Audit 原則」),不算違規
3. **世界級對照**(reference,可參考但**非 canonical**)
   - Polaris / Material / Atlassian / Ant / Apple HIG 做法
   - 本 DS 決定**故意不跟**世界級是合法的(mindset #1 要求「對齊 or 說得出為什麼不同」)。spec 有 rationale → AI 不 flag

**衝突解決流程**:
- Mechanical assertion(`visual-assertions.json` 幾何檢查)發現偏離 → 查 assertion 的 `rationale` 欄位 OR 對應 spec → 有 rationale = `deviation ✓`,無 rationale = P0 violation
- AI judgement(`/visual-audit` Layer B)發現視覺問題 → **必先讀被稽核元件 spec.md**,spec canonical 當 hard constraint;世界級當 reference,不 override spec

**為什麼順序這樣定**:
- WCAG 是法規 / a11y floor,任何設計不能違反
- 本 DS spec 是我們的 design language,就是 canonical(這也是整個 DS 存在的意義)
- 世界級是參考,不是命令;mindset #1 允許「對齊 or 說得出為什麼不同」,spec 的 rationale 就是這個「為什麼」


# 建立 UI 前必讀

## Token spec（全系統基礎）

| 主題 | 位置 |
|------|------|
| 色彩架構 + neutral-active/selected 兩個 family | `tokens/color/color.spec.md` |
| 字體 | `tokens/typography/typography.spec.md` |
| 密度系統 | `tokens/density/density.spec.md` |
| 元件尺寸 + Inline Action 尺寸推導 | `tokens/uiSize/uiSize.spec.md` |
| 版面間距 | `tokens/layoutSpace/layoutSpace.spec.md` |
| 陰影 | `tokens/elevation/elevation.spec.md` |
| 圓角 | `tokens/radius/radius.spec.md` |

## 跨元件 pattern spec（建立或修改相關元件前必查）

| 主題 | 位置 | 影響範圍 |
|------|------|---------|
| Row primitive 共用規則 | `patterns/element-anatomy/item-anatomy.spec.md` | MenuItem / SidebarMenuButton / TreeItem / DropdownMenuItem / SelectMenu |
| **List item 範疇必消費 primitive canonical**(list item → MenuItem/Family 2;key-value → DescriptionList;禁自刻) | `patterns/element-anatomy/item-anatomy.spec.md`「List item 範疇的必消費 primitive canonical」節 | 任何 overlay body / page 內的 list 或 key-value 資訊展示 |
| 工具列 / 操作列 | `patterns/action-bar/action-bar.spec.md` | 任何有按鈕列的頁面 |
| 水平溢出處理 | `patterns/horizontal-overflow/horizontal-overflow.spec.md` | Tabs / Chip / 未來 Steps |
| 浮層外殼 Header/Body/Footer | `patterns/overlay-surface/overlay-surface.spec.md` | Dialog / Popover(padding SSOT) |
| Field 佈局容器 | `components/Field/field.spec.md` | 所有表單元件 |
| Field Controls 共用規則 | `components/Field/field-controls.spec.md` | Input / NumberInput / DatePicker / Select / Combobox / LinkInput / Textarea |
| DescriptionList direction / divided / Section heading | `components/DescriptionList/description-list.spec.md` | NameCard / profile / file info / settings summary / 訂單詳情(horizontal 規則 SSOT 在此) |
| 表單驗證標準 | `components/Field/form-validation.spec.md` | 所有表單元件 |
| 選擇 / 狀態視覺 | `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」節 | 任何有選中態的元件 |
| 分隔線 vs CSS border | `components/Separator/separator.spec.md` | 任何有分隔線的元件 |

## 既有 DS 元件 / primitive 優先消費(超級規則)

**`ls src/design-system/components/` + `ls src/design-system/patterns/` 看一次。任何視覺 / 行為命中既有元件 → 必消費,不 hand-craft raw HTML 繞過**。適用所有寫 code 的 context — 元件 / stories / consumer / exploration。

### 自我檢查腳本(動手前跑一次)

- 新元件有 icon+text 垂直堆疊? → 用 `<Empty>`
- 新元件有橫向 row 結構(prefix/content/suffix)? → 用 `<MenuItem>` + slot components(`<ItemIcon>` / `<ItemAvatar>` / `<ItemLabel>` / `<ItemSuffix>` / `<ItemInlineAction>`)
- 新元件是浮層 + 有 header/body/footer? → 用 `overlay-surface` pattern
- 新元件需捲軸且跨 OS 一致? → 用 `<ScrollArea>`;若刻意隱藏捲軸 + fade-mask → `horizontal-overflow` pattern
- 新元件有圖像 / media 容器需要鎖定長寬比(防 CLS)? → 用 `<AspectRatio>` primitive
- **以上都沒命中才可自建**,建完立刻回來加條目

**本規則同樣適用 stories / consumer / exploration code**。不 hand-craft 已有 prop 能做的事(如 Input loading 走 `loading` prop 不自刻 `<div className="relative"><input/><div className="absolute">`);遇缺口**回元件 spec 擴 API**,不自刻繞過。hook `check_story_anatomy.sh` 攔 stories 手刻。

**完整對照表(12 個情境 + 8 個 layout primitive + overflow 三規則)** → `.claude/references/build-ui-canonicals.md`

## Pattern 規則（建立 UI 前檢查）

`src/design-system/patterns/` 用於已定案的 UI 流程與元件組合。

- 建立新 UI 前**必須**先檢查是否已有對應 pattern
- 不得跳過 patterns 直接重新設計
- 若 exploration 已定案，應整理後升級為 pattern
- `patterns/` 目前保持平坦結構（一個 pattern 一個資料夾）。同一領域累積三個以上 pattern 時，再建領域子資料夾

每個 pattern 可包含：`*.spec.md`、`*.stories.tsx`、`*.example.tsx`

## 檢查可用元件

- `ls src/design-system/components/`（以實際目錄為準，不依賴 CLAUDE.md 列表）
- `ls src/design-system/patterns/`（已定案的跨元件 UI 流程）


# UI 開發規則

- 必須優先重用 `src/design-system/components/` 內已存在的元件
- 必須使用 design tokens（透過 Tailwind utilities 或 CSS 變數）
- 不要硬寫顏色、font-size、spacing、radius
- 建立新 UI 前，必須先檢查是否已有對應 pattern
- 若缺少元件，請明確指出，不要假裝元件已存在
- 使用 `cn()` 合併 Tailwind class（來自 `@/lib/utils`）

## 同 flex 列的互動 slot 幾何鐵律（避免 gap token 被破壞）

**規則**:任何新 slot(status indicator / inline action / hover-swap button)放進既有 flex row 之前,**必須**執行以下 3 步 mechanical check,不可憑直覺:

1. **grep 該行既有 interactive slot 的 box 尺寸**:
   - 先讀 row host 元件的 spec(例:FileItem spec line 100「用 Button 非 Inline Action」+ line 107「compact=xs 24 / rich=sm 28」)
   - grep 該 row 的 stories 看 consumer 實際傳什麼 Button/action
2. **新 slot 的 box 尺寸 = 既有 slot 尺寸**(嚴格相等,不是「差不多」):
   - 不同:`gap-*` token 會被 overflow / overshoot 吃掉,實際視覺 gap 不等於宣告值
   - 例外:需明文在 spec 註解(「xs 小刻意縮小因為 ...」)
3. **Hover state 也要驗**:
   - hover-bg / ring / focus outline 若超出 box,會吃進 gap token 空間
   - 例:`ItemInlineActionButton` 的 16 px box + 24 px hover-bg overflow → hover 時視覺變寬,`gap-2`(8 px) 實際剩 ~4 px

**失敗案例(作為記憶 anchor)**:
- 2026-04-19 FileItem status-slot hover-swap:原本用 `ItemInlineActionButton` 16 px(不符 spec line 100「用 Button」),hover-bg 24 px overflow 吃掉 4 px `gap-2`,造成 status ↔ delete 實際 gap 變 ~4 px 違反 8 px 規格。修法:改用 Button 同 consumer size(compact xs 24 / rich sm 28),slot 容器等同 Button 尺寸。

**世界級 DS 的幾何鐵律**:同 flex 列的互動元素統一 box 尺寸,gap token 才能如實呈現——這是跨元件治理層的不變量,不是元件內部細節。

## 新增數值前必須先查既有 pattern（舉一反三原則）

**寫任何 gap、padding、font-size、line-height、icon size、border-radius 等數值之前,必須先 grep 系統內同類型的值,確認是否有既有 pattern 可以直接套用(延伸 mindset #2「不憑直覺發明」+ 本章下方自我檢查)。**

檢查清單：
- `gap` → 查 `fieldWrapperStyles`（gap-2）、MenuItem cva、SelectionItem cva
- `padding` → 查 `--layout-space-loose/tight`、fieldWrapperStyles `px-3`
- `font-size` → 查 `typography.css` utilities + `item-anatomy.spec.md` reading/scanning 模式規則
- `line-height` → 查 `typography.css`（scanning = leading-compact 1.3,reading = default 1.5）
- `icon size` → 查 `ICON_SIZE` 常數（sm/md=16, lg=20）
- `inline action` → 查 `item-anatomy.spec.md`「Inline Action 設計規格」節(icon size、hover bg size=icon+2、gap-2 between actions、fg-muted → hover foreground)

**舉一反三**：如果 Select 的 inline action gap 是 gap-2,那所有元件的 inline action gap 都是 gap-2——不需要每個元件都被糾正一次。同理,如果 MenuItem 的 description 是 reading mode min 14px,那所有 reading mode consumer 的 description 都是 min 14px。

**如果確實需要新值**,先提出理由讓使用者確認,不要自己決定後寫進去。

## 互動元素：Inline Action vs Button

加互動 icon 前，判斷用 Inline Action 還是 Button iconOnly。完整判斷樹（3 步驟 + 場景對照表）詳見 `patterns/element-anatomy/item-anatomy.spec.md`「Inline Action 設計規格」節。

## 分隔線：Separator vs CSS border

判斷核心：**誰決定「這裡要分隔」？** 完整規則詳見 `components/Separator/separator.spec.md`。

## 陰影一律用 `--elevation-*` token

**禁止** `shadow-sm/md/lg/xl/2xl`、硬寫 `box-shadow`。**允許** `shadow-none`。詳見 `tokens/elevation/elevation.spec.md`。

## 視覺容器必有 inner breathing(DS-wide canonical)

任何有**明確視覺邊界**(permanent `bg-*` / `border` / `shadow-*` 三擇一)的容器,**必有 inner padding**(rule),不讓內容物觸容器邊。責任在**父容器**,子元件 `w-full` responsive 不變。

- Chrome(Dialog / Sheet / Popover / Card body)建議 `--layout-space-loose/tight`;inline pill `px-1/2`;consumer 自建的 chrome-like div 就近取 `--layout-space-*` token
- 反例(破圖):consumer 自建 `<div className="bg-* rounded-lg">{rich FileItem map}</div>` **無 padding** → rich card 貼父 div 邊,兩層 rounded 視覺卡在一起
- 世界級一致:Material / Polaris / Atlassian / Ant / Apple HIG / Carbon 6 家 chrome 都 own 內 padding
- SSOT + benchmark 詳 `patterns/element-anatomy/element-anatomy.spec.md`「視覺容器 breathing invariant」

## Padding source 分層規則(三層各自 canonical)

不同語境的 padding 有不同 source,寫 code 前先判斷屬哪層:

| 層級 | 用途 | 來源 | 例 |
|------|------|------|---|
| **Chrome / Section / Card**(跨元件、密度切換) | page gutter、card inner padding、toolbar 外框、dialog header/body/footer | `p-[var(--layout-space-loose)]` / `p-[var(--layout-space-tight)]` | FileViewer toolbar `px-[var(--layout-space-loose)]` / Dialog body padding |
| **元件內 slot**(結構性、不隨 density) | MenuItem row padding / Field wrapper padding / Dropdown item padding | Tailwind `p-N`(`p-3` / `px-2 py-1.5` 等) | item-anatomy row `px-2`(固定) / Field `px-3` |
| **精確幾何**(icon ↔ text 對齊、calc-based) | Button padding = `(field-height - icon-size)/2` / Inline action box = icon + 2px | `p-[calc(...)]` / `p-[var(--...)]` / 特殊 `p-Npx` | Button `px-[calc((h-field-md-icon-md)/2)]` |

**判斷法**:
1. 「這個 padding **會隨 density / theme 變動嗎**?」→ 是 → layout-space token
2. 「這個 padding 是**元件內部 layout 結構**?」→ 是 → Tailwind `p-N`
3. 「這個 padding 是**跟 icon / text / 其他 token 算出來的**?」→ 是 → `calc()` / var 任意值

**禁止**:
- ❌ Chrome padding 用硬寫 `p-4`(應該用 layout-space token,density 切換會壞)
- ❌ 元件內 slot 用 `p-[var(--layout-space-tight)]`(密度切換會讓 row 結構跑掉,應用固定 Tailwind `p-N`)

## Icon size 來源分層規則

Icon 尺寸按 context 分三類,寫 code 前判斷屬哪類:

| Context | 來源 | 例 |
|---------|------|---|
| **Row primitive 內**(MenuItem / TreeItem / SelectionItem / FileItem slot) | `ICON_SIZE[size]` 讀 `RowSizeContext`(自動 size-aware) | `<ItemIcon icon={User} />` 內部走 `ICON_SIZE[contextSize]` |
| **Button startIcon / endIcon** | Button 自己的 mapping(固定 16 / 16 / 20 by size) | `<Button size="lg" startIcon={Save} />` 自動走 20px |
| **一次性 / 非 row / 非 Button**(chrome icon、decorative、toolbar 圖示) | inline `size={n}`,但 **n 必對齊 uiSize token**(16/20/24 等,不自創) | `<FileIcon size={16} />` in Toolbar |

**禁止**:
- ❌ 用 Tailwind `w-4 h-4` / `size-4` 表達 icon size —— 這是 dimension 不是 semantic,讀 code 時看不出「這是 icon size」
- ❌ Row 內 hand-craft `<Icon size={16} />` 繞過 `RowSizeContext` —— density 切換不會聯動
- ❌ 自創非 uiSize token 數值(如 `size={18}`、`size={22}`) —— 違反 mindset #2「不憑直覺發明」

## Row primitives 共用 item-anatomy 公式

寫任何新 row 元件前,讀 `patterns/element-anatomy/item-anatomy.spec.md`(Family 1+2 深度 SSOT)。Audit grep guard 和 SidebarMenuButton 獨立實作風險也在該 spec 的「自我檢查」節。

## 清 unused imports 後必須跑 runtime 驗證

`tsc --noEmit` 不充分（曾漏抓 JSX 內 identifier 和未宣告 export）。任何 import/export 異動後：

1. `npx tsc --noEmit`（必要但不充分）
2. grep `export { }` 確認每個 identifier 都有定義
3. `npm run storybook` 實際載入動到的 story
4. 互動操作確認動態 path

## 選擇 / 狀態視覺必須對齊既有 canonical

選擇與狀態的視覺表達必須使用元件既有的 state prop,且指示器視覺必須對應 selection model。詳見 `src/design-system/patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」節。


# Tailwind 使用規則

**間距與尺寸**:Tailwind 預設間距(`p-4`、`gap-2`、`mt-6` 等)可正常使用。對應 token 時用任意值:

```tsx
<div className="p-[var(--layout-space-loose)]" />
<div className="h-[var(--ui-height-36)]" />
```

## 4 條核心規則(每條都有過真實 bug,必遵守)

1. **CSS variable 必須 `var()` 包覆** — 寫 `w-[var(--foo)]` 而非 `w-[--foo]`;後者在 Tailwind v4 **靜默失效**(曾讓 Sidebar 8 處寬度爆掉)
2. **自訂 utility 必在 `lib/utils.ts` 顯式註冊到正確 group** — 否則 tailwind-merge 猜 group 誤判衝突 strip 掉 class(曾讓 `text-body` 被 `text-fg-secondary` strip)
3. **禁用 Tailwind 預設 `shadow-sm/md/lg` / 預設 `text-xs/sm/base` / 硬寫色值** — 繞過 token 系統,dark mode / brand swap 會斷(用 `shadow-[var(--elevation-*)]` / `text-body` 等)
4. **禁用 shadcn compat alias**(`bg-popover` / `text-muted-foreground` / `bg-accent` 等) — 那是 shadcn add 的臨時橋,我們元件 code 必用 direct token(`bg-surface-raised` / `text-fg-muted` / `bg-neutral-hover`)。hook `check_token_hygiene.sh` 自動攔

## 圓角對應(常用)

`rounded-md` = 4px / `rounded-lg` = 8px / `rounded-full` = 9999px

---

**完整對照**(每條 bug 的詳細歷史 + 核可清單 + 禁止清單 + shadcn alias 全對照表)→ `.claude/references/tailwind-gotchas.md`


# Token 命名原則

所有 design token（color、typography、spacing、radius、opacity 等）必須遵循一致命名邏輯——看到 token 名就能判斷它的層級、角色和關聯，不需要查文件。

## 1. Primitive vs Semantic 區分

| 層級 | 命名特徵 | 範例 |
|------|---------|------|
| **Primitive**（原始值，無語意） | `--color-*` 前綴 + 編號 / 類別 + 具體值 | `--color-blue-6`、`--color-neutral-9`、`--font-h1-size`、`--field-height-md` |
| **Semantic**（賦予 purpose） | 無 `--color-` 前綴，直接表 purpose | `--primary`、`--foreground`、`--neutral-hover`、`--inverse-fg` |

**判斷法**：看到 `--color-*` 或具體編號 → primitive；看到無前綴的 purpose 名 → semantic。

## 2. Namespace + Role 結構

Token 命名 = `--{namespace}-{role}-{variant?}`

- **Namespace**：上下文（`primary`、`error`、`neutral`、`inverse`、`fg`、`bg`、`field`）
- **Role**：角色（`fg`、`bg`、`hover`、`active`、`subtle`、`text`、`height`、`size`）
- **Variant**：變體（`secondary`、`muted`、`disabled`、`xs`/`sm`/`md`/`lg`）

範例：
- `--neutral-hover` = neutral 上下文的 hover 狀態
- `--inverse-fg` = inverse 上下文的 foreground 文字
- `--primary-subtle` = primary 上下文的 subtle 變體
- `--field-height-md` = field 上下文的 height、md 變體

## 3. 對齊既有 family

新增 token 必須鏡射既有 family 的命名模式，不孤立發明。如果新 token 找不到對應 family，先質疑是否真的需要。既有 family 詳見 `tokens/color/color.spec.md`。

## 4. 不混語義名和色名

分類元件（Tag、Avatar）和語義元件（Button、Checkbox）的 token 不能混用：

- **分類**用 primitive 色名：`var(--color-deep-orange-1)`（Tag 的 red variant）
- **語義**用 purpose 名：`var(--error-subtle)`（Button 的 destructive variant）

雖然兩者底層可能指向相同 primitive，但消費端必須明確選擇是「色」還是「義」。改 `--error` 從 deep-orange 改成別的色，不應該影響 Tag 的 red variant——這是 Tag 直接用 primitive 而非 semantic 的根本原因。

## 5. 禁止事項

- ❌ **籠統命名**：`--inverse-hover`（不知道是 text/bg/border）→ 用 `--inverse-neutral-hover` 明確指出鏡射對象
- ❌ **孤立命名**：`--strong-text` 沒對齊任何既有 family → 先找對齊對象
- ❌ **自創縮寫**：`--fg`、`--bg` 作為 base token（已用 `--foreground`、`--background`）
- ❌ **Primitive 帶語意**：`--color-primary-6`（primitive 不該有 purpose）
- ❌ **Semantic 帶色相**：`--primary-blue`（semantic 不該暗示色相）
- ❌ **Categorical 中間層**：`--blue` / `--blue-hover` 等（已廢除——Tag 直接用 primitive，Button 用 semantic）

## 6. 新增語意色相 + 色彩架構流派

新增 semantic 色相 → 詳見 `tokens/color/color.spec.md`「新增語意色相的標準流程」(SSOT)。本系統採 **Atlassian-style Semantic State Token** 流派(靜態色用 primitive,互動狀態用 semantic state token),完整 rationale 在該 spec「架構流派定位」段落。


# 元件 Props 命名原則

**按「是什麼」命名，不按「在哪裡」命名。** 參考 Material（Chip: avatar / icon / deleteIcon）、Ant Design（Tag: icon / closeIcon）等世界級設計系統。

- slot 只接受 icon → 命名帶 `icon`(如 `startIcon`、`endIcon`),型別用 `LucideIcon`,元件內部控制尺寸
- slot 接受任意視覺元素 → 命名描述內容類型(如 `avatar`),型別用 `ReactNode`
- slot 是行為 → 用 callback(如 `onDismiss`),元件內部渲染互動元素並控制尺寸與樣式
- ❌ 不用 `prefix` / `suffix` / `left` / `right` 等純位置名——這些不傳達內容本質,也無法約束型別

## 關閉 / 移除類 callback 命名 canonical(按語意分層,不合併)

四個名稱各有語意,不可替換使用:

| Callback | 語意 | 典型元件 | 世界級對照 |
|----------|------|---------|-----------|
| `onClose` | **關閉 overlay session** — 浮層關閉,回到背景 | Dialog / Sheet / Popover / FileViewer / HoverCard | React Aria `onClose` / Material `DialogProps.onClose` |
| `onDismiss` | **通知被忽略** — 暫時性訊息被 user 關掉,不影響流程 | Alert / Notice / Toast / Coachmark | Polaris `Toast.onDismiss` / iOS `dismiss()` |
| `onRemove` | **從集合移除一個 item** — parent collection 層面的狀態變化 | PeoplePicker / Combobox multi-select tag / Tag(in tag list) | Material `Chip.onDelete` / React Aria `onRemove` |
| `onClear` | **欄位內容清空** — value 設為 empty,元件本身不關 | Input / Select / Combobox / DatePicker clear button | Ant Design `allowClear` + `onClear` / Polaris `clearButton` |

**不允許用同一個名稱 cover 多語意**(如用 `onClose` 同時表達 Tag 的 `onRemove`)。spec 寫 callback 時必明示屬於哪一類。

## Badge 類 prop 名 canonical(按放置方式,不按「是 badge」籠統命名)

Badge 在不同 anchor 有兩種截然不同的視覺 / 語意型態,prop 名要區分:

| Prop | 用途 | 典型 anchor | 對應 Badge 型態 |
|------|------|------------|----------------|
| `badge` | **Pill 內的 inline badge** — 在 label 右側,跟 endIcon 同層 flex | Button(有 label)/ Tab item / Chip | inline count,label 搭配 |
| `overlayBadge` | **疊在視覺重心的 overlay badge** — absolute 定位於 icon/avatar 角 | iconOnly Button / pure Icon | top-right count overlay |
| `badgeCount`(Avatar 專用) | count overlay,內部消費 `<Badge variant="critical">`,貼 avatar 右上 | Avatar | 同 overlayBadge 但 Avatar 語意 |
| `status`(Avatar 專用) | **非 Badge 元件** — Avatar 內部 SVG presence dot,貼右下 | Avatar | presence indicator(非 Badge) |

**禁止**:同一 prop 名兼 inline + overlay 兩種語意。世界級 Material `BadgedBox`(overlay)vs `Chip.label`(inline)分開、Ant Design `<Badge overflowCount>`(overlay)vs `<Tag>`(inline)分開,都不用同一 prop 名。

**禁止組合**:有 label 的 Button / Chip 疊 `overlayBadge`(badge 會飄到 chrome 邊緣遠離 icon 語義)—— 需計數改用 `badge` inline;完整規則見 `badge.spec.md`「Overlay 適用元件 canonical」。

## 常用 icon canonical

全 DS 語義一致的 icon 對應,避免同概念用不同 icon 造成認知漂移:

| 語義 | Icon | 反例 |
|------|------|------|
| 溢出選單 / 更多動作(overflow menu) | **`MoreVertical`** | ❌ `MoreHorizontal`(row 內水平排 icon 會與水平動作按鈕群視覺混淆,縱向三點更明確是「還有更多動作收納」) |
| 路徑收合(Breadcrumb ellipsis) | `MoreHorizontal` | 這是唯一保留 `MoreHorizontal` 的語義 — 表示「沿路徑方向省略中間項」,非 overflow menu |
| 關閉(Close / Dismiss) | `X` | ❌ `XCircle`(後者是 error status icon,語義衝突) |
| 成功 / 完成 | `Check` / `CircleCheck` | — |
| 失敗 / 錯誤 | `XCircle` | — |
| 警告 / 提醒 | `TriangleAlert` | — |
| 資訊 / 說明 | `Info` | — |

**世界級對照**:Linear / Notion / GitHub / Figma 全部用 vertical 3-dots 作為 overflow;horizontal 3-dots 專給 path/truncation 場景(Breadcrumb / text ellipsis)。


# shadcn 元件規範

**檔案結構**(每元件一資料夾):`{name}.tsx` / `{name}.spec.md` / `{name}.stories.tsx` / `{name}.anatomy.stories.tsx` / `{name}.principles.stories.tsx`。

**基本結構**:forwardRef + cva + VariantProps + cn() + `{ Component, componentVariants }` export。讀既有元件(`Button/button.tsx` / `Input/input.tsx`)當範本,不重寫結構說明。

**Import 路徑**:`@/design-system/components/{Name}/{name}`(無 barrel file)。

**新增 shadcn 元件**:`npx shadcn add {name}`,**裝完立刻 grep 移除 shadcn compat alias**(見 `# Tailwind 使用規則`)。

## cva 適用範圍(何時用、何時不用)

**判斷法**:
- 變體差異只有 className(同 JSX 樹) → **cva**
- 變體要 inline style 物件 → **object map + `style={{ ... }}`**(例:Avatar color variants)
- 變體是不同 JSX 樹(不同 layout) → **conditional rendering**(例:FileItem compact / rich mode)

**禁止**:為「一律用 cva」硬塞 style prop 變體(無法優雅產 style object),或把不同結構 mode 壓同棵 JSX 配 className 切換(會長滿 `{mode === 'x' && ...}` hacks)。

**完整對照表 + documented 例外清單** → `.claude/references/cva-patterns.md`

## 元件不得自包 Provider

**Tooltip / Theme / Toast / Portal 等 Provider 一律由應用層**（`main.tsx`、Storybook `preview.tsx`）**統一設定**。元件本體**禁止自包 `TooltipProvider` / `ThemeProvider` / `ToastProvider` 等 Provider**。

**曾經發生的 bug**：shadcn 原版 `SidebarProvider` 內部預設包 `TooltipProvider delayDuration={0}`,會強制覆寫 app-level 的 delay 設定，讓整個 sidebar 的 tooltip 立即彈出、破壞全站 hover 節奏。從 shadcn 複製元件時**務必檢查並移除**這類內建 Provider。

### 為什麼

Provider 是**應用層配置**（delay、theme、portal target、toast position），元件包 Provider 等於劫持這些配置。元件只消費 context，不建立 context——除非 context 是該元件「擁有」的狀態（如 `SidebarProvider` 的 `open`、`DropdownMenu` 的 `size`）。

### 判斷法

- Context 是**行為狀態**（open / close / size / current item） → **可包**（這是元件的狀態管理）
  - 例如 `SidebarProvider.open` / `DropdownMenuContext.size`——這些是元件自己擁有的狀態,**不是**禁止包的 app-level 配置 Provider。
- Context 是**全域外觀配置**（delay / theme / portal / variant defaults） → **禁止包**（屬於應用層）


# Primitive Exposure Layer(3 層暴露 canonical)

設計系統的 primitive 按**暴露對象**分 3 層。建新元件 / 新 API 時先決定層級,錯置會造成 consumer 選用困擾(例:Button 太複雜卻當 embedded action 用)。

## 3 層定義

| Layer | 對象 | 例 | API 形式 |
|-------|------|----|---------|
| **L1 — User-facing primitive** | App code + stories + consumer(所有人)| `Button` / `Input` / `Select` / `MenuItem` / `FileItem` / `DataTable` / `Tag` / `Badge` | 完整 variant / size prop / ReactNode slot |
| **L2 — Host slot API**(config-based)| 消費 L1 host 元件的 app code | `Input.endAction: InlineActionConfig` / `MenuItem.inlineActions: InlineActionConfig[]` / `SidebarMenuButton.inlineActions` | 宣告式 config `{ icon, label, onClick }`,host 內部負責渲染 |
| **L3 — Internal primitive**(**不暴露給 app**)| 建**新 row primitive / host 元件**的 DS 作者(非 app code)| `ItemInlineAction` / `ItemInlineActionButton` / `ItemIcon` / `ItemAvatar` / `ItemLabel` / `ItemSuffix` / `RowSizeProvider` | 低階 building block,只 export for composition |

## 判斷新 primitive 放哪層(3 題)

1. **App code 需要直接 import 嗎?**
   - 是 → L1(e.g. `Button`)
   - 否 → 看 Q2
2. **它是「host 內部 embedded action」的 config API 嗎?**
   - 是 → L2(e.g. `InlineActionConfig` + host slot prop)
   - 否 → 看 Q3
3. **它是「建新 host 元件時的低階 building block」嗎?**
   - 是 → L3(e.g. `ItemInlineActionButton`)
   - 否 → **不該是新 primitive**(可能是舊元件的 feature,走 feature prop)

## 規則

- **L3 primitive 的 stories / docs 必明示「internal; app 請走 host slot API」**
- **L1 上不做 L3 該做的事**(例:Button 不該加「embedded=true」density 維度;embedded 情境走 L2 host slot)
- **L2 config-based 比 ReactNode slot 更 opinionated**(防 consumer drift),新 host 元件優先 config
- **新 L1 primitive 要經 Checkpoint 3**(classification ambiguity);L2 / L3 可 AUTO

## 世界級對照

本 taxonomy 是 DS 原創,但結構對齊:
- **Radix / Headless UI / Ariakit**:compound component 模式(L1 wrapper + L3 primitives 給 composition)
- **Polaris / Material / Atlassian**:host 元件 slot 吃 ReactNode(相當於 L2 但無 config-based opinionation)
- **我們的 L2 config-based** 比世界級 slot 更 opinionated(防 consumer drift),是 slight deviation 有 rationale

## Icon action primitive 的 3 層分佈(範例)

- **L1**:`<Button iconOnly />` — 獨立 action(toolbar / chrome corner / standalone)
- **L2**:`Input.endAction` / `MenuItem.inlineActions` / 未來 `FileItem.actions / DataTable.rowActions`(config API,host 內部渲染 L3 primitive)
- **L3**:`ItemInlineAction`(config wrapper)/ `ItemInlineActionButton`(raw button)— 不直接暴露給 app

完整 Inline Action vs Button predicate 見 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」。


# 系統內部 Layout — 4-Family Model

**每個元件 spec 第一段必須聲明 Layout Family**（1/2/3/4 或「非上述 family，自己的結構」）。這確保相同用途用相同 layout，遇到相同情境 AI 能舉一反三。

## 4 個可繼承的 Layout Family(概要)

| Family | 用途 | Sizes baseline | SSOT |
|--------|------|----------------|------|
| **1. Menu item layout** | Menu 容器內掃視單列(scanning mode) | sm / md / lg | `patterns/element-anatomy/item-anatomy.spec.md` |
| **2. List item layout** | 頁面上閱讀式單列(reading mode) | sm / md / lg | `patterns/element-anatomy/item-anatomy.spec.md` |
| **3. Pill layout** | 單行互動 pill | sm / md / lg(+可選 xs) | `components/Button/button.spec.md`「Pill Layout」 |
| **4. Field control layout** | 可編輯資料輸入 | sm / md / lg | `components/Field/field-controls.spec.md` |

## 新元件判斷流程(概要)

1. 垂直列表裡? → Family 1(menu 容器)/ Family 2(頁面)
2. 單行可點擊 / 可讀的 pill? → Family 3
3. 單行可編輯資料? → Family 4(視覺對齊 Family 1)
4. 都不是? → **停下討論**——新 family 還是 self-contained

## Family 詳細規格 → element-anatomy / item-anatomy(dual-anchor)

兩個 spec scope 不重疊:
- **`patterns/element-anatomy/element-anatomy.spec.md`** = **4-Family Model 整體 taxonomy overview**(cross-pattern / cross-component governance,說明 Family 1/2/3/4 的整體分類系統)
- **`patterns/element-anatomy/item-anatomy.spec.md`** = **Family 1+2 row 結構 SSOT 深度細節**(runtime primitive;prefix / content / suffix slot、token 細節、Inline Action 規格)

Family 3 → `components/Button/button.spec.md` →「Pill Layout」。Family 4 → `components/Field/field-controls.spec.md`。

**命名鐵律**:「layout」一詞保留給 **page-level layout**(未來頁面版面設計原則的家);element-level 的結構分類永遠用「anatomy」。世界級 DS 一致如此:Material / Polaris / Atlassian / Carbon 全部 Foundations > Layout 是 page-level,element 結構屬 component anatomy。


# 元件完成 checklist

元件即將合入 DS 時 invoke `/component-quality-gate` skill:45 項 Spec / Code / Stories / Ship checklist,走完才算 ready。`block_prototype_imports.py` hook 另會自動擋正式 code import `explorations/`。


# Exploration & Prototype

- **正式 vs 比稿**:`src/design-system/` 已定案可重用 / `src/explorations/` 未定案 prototype;正式 code 禁 import explorations(hook `block_prototype_imports.py` 強制)
- **Exploration 檔案**:每題一個 `src/explorations/{topic}/` folder,含 `*.v1.stories.tsx` / `*.v2.stories.tsx` + `notes.md`(記差異 / 假設 / 比較重點)
- **定案流程**:整理完升級為 `patterns/`(若屬 runtime primitive)或 `components/`(若是新元件);不再需要可刪整個 folder
- **/prototype skill**:user 明言「做 prototype / MVP / 原型」時走,含 5 phases + Phase 3.5 強制 audit gate(invoke `/product-ui-audit`)


# Story

**完整 workflow**(範例選擇 / anatomy 5-story / 連動更新 / 自我檢查)→ **`/story-writing` skill**。本節只留每 session signal:三層定位 + title 命名 + 最高準則 + 禁止清單。


## Storybook title 命名

```
Design System/Tokens/{TokenName}
Design System/Patterns/{PatternName}
Design System/Components/{ComponentName}/{展示 | 設計規格 | 設計原則}
Design System/Internal/{ComponentName}/{展示 | 設計規格}
```

- 第一層英文(Components / Internal / Patterns / Tokens)、元件名 PascalCase、子頁中文
- 子頁前不加元件名(❌ `MenuItem 展示` → ✅ `展示`)

## Internal vs Components 判斷 test(三題)

1. 元件本身有預設視覺嗎?(bg / border / shadow / padding / rounded)
2. 直接 `<X>` 放頁面會有視覺嗎?
3. 所有消費者都包成自己的 wrapper 嗎?

三題都傾向 Internal → `Internal/`;任一題明確傾向 Components → `Components/`。**判斷看行為不看名字**:HoverCard 名字像 public 但是純行為 primitive → Internal/。

現有分類:Components/(Button / Input / Select / Dialog / Popover / Sheet)/ Internal/(Menu / SelectMenu / Notice / SelectionControl / OverflowIndicator / HoverCard / Command)。

## 三層定位

| 層 | 檔案 | 職責 |
|---|---|---|
| **展示** | `{name}.stories.tsx` | 設計規格的便利瀏覽版——視覺目錄(車子展示間) |
| **設計規格** | `{name}.anatomy.stories.tsx` | 完整技術規格——token / 尺寸藍圖 / Inspect 面板,取代 Figma(車子規格表) |
| **設計原則** | `{name}.principles.stories.tsx` | 使用判斷指南——do / don't / 情境選擇(駕駛手冊) |

三層從「看」到「查」到「判斷」,閱讀深度遞進,**職責互不重複**。

## 範例最高準則 + 禁止清單(每 session signal)

**用耳熟能詳的真實業務場景,禁止極端 / 虛構 / 佔位**。Storybook 是公開文件,範例核心功能是**教學**——讓讀者推得出自己產品怎麼用。

| ❌ 禁止 | 範例 |
|---------|------|
| 佔位符 | `Option A / B / C` / `Lorem ipsum` / `foo / bar` |
| 抽象代號 | 「按鈕一」/ `Variant X` / `Rule A` |
| 極端不現實 | 「刪除所有資料無法復原」/ 50 個 filter / 5 層 dialog |
| 視覺符號 | `│─ 業務 ─│` / `A → B → C` / ASCII art |
| spec 內部代號 | 「符合 Rule 3.2」/「遵循 Convention A」 |

**兩個驗收 test**:
- **「人」test** — 遮標題 5 秒看懂情境?
- **「舉一反三」test** — 讀者推得出自己產品怎麼用?

詳細合法場景來源(Jira / Stripe / Notion / Figma...)/ 正確範例對照 / anatomy 5-story 標準 / Rule note 品質 / 視覺文案品質 / 7 題自我檢查 / 連動更新 + cva defaultVariants 高風險漂移 → **`/story-writing` skill**。
